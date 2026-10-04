import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'l10n.dart' show supportedLanguages;
import 'models.dart';
import 'push.dart';
import 'realtime.dart';
import 'secure_store.dart';
import 'server_config.dart';

/// The build's server address (`KINETIX_API_URL`; localhost only in debug builds).
export 'server_config.dart' show defaultServerUrl;

/// Who is signed in, the remembered server and institution, and the UI language.
///
/// The sign-in token lives in the phone's key store ([SecureStore]: Android Keystore, iOS
/// Keychain); everything else in shared preferences. Older versions kept the token in shared
/// preferences; [restore] moves it once. An app lock (biometric or OS PIN, per
/// docs/architecture/board-pairing.md) is still to come.
class AppState extends ChangeNotifier {
  AppState(this.api, this._prefs, {TeacherRealtime? realtime, SecureStore? secure, PushMessaging? push})
    : realtime = realtime ?? NoRealtime(),
      _secure = secure ?? DeviceSecureStore(),
      push = push ?? NoPush();

  final TeacherApi api;

  /// Live events (new messages) while signed in; the home screen connects it.
  final TeacherRealtime realtime;

  /// Pushes (FCM / APNs) when the build is configured for Firebase, else [NoPush].
  final PushMessaging push;
  final SharedPreferences _prefs;
  final SecureStore _secure;

  /// [_kToken] is the key in the secure store, and the old key in shared preferences.
  static const _kServer = 'server_url', _kTenant = 'tenant', _kLogin = 'login', _kPhone = 'phone', _kToken = 'token';

  /// The language chosen in Profile on this phone, for the user in [_kLanguageUser]; and whether
  /// saving it to the server still has to be retried.
  static const _kLanguage = 'language', _kLanguageUser = 'language_user', _kLanguagePending = 'language_pending';

  Me? me;
  bool restoring = true;

  bool get signedIn => me != null;
  String get serverUrl => _prefs.getString(_kServer) ?? defaultServerUrl;
  String get rememberedTenant => _prefs.getString(_kTenant) ?? '';
  String get rememberedLogin => _prefs.getString(_kLogin) ?? '';

  /// The 10-digit mobile number last used to sign in with a code (without +91).
  String get rememberedPhone => _prefs.getString(_kPhone) ?? '';

  /// A tapped push waiting for the home screen to open what it is about. The home screen sets it
  /// back to null once handled.
  final pushTap = ValueNotifier<PushTap?>(null);

  /// The push token registered for the signed-in teacher.
  String? _pushToken;
  final _pushSubscriptions = <StreamSubscription<Object?>>[];

  /// The language picked in Profile, if this signed-in teacher picked one on this phone.
  String? get languageOverride {
    final lang = _prefs.getString(_kLanguage);
    return me != null && _prefs.getString(_kLanguageUser) == me!.id && supportedLanguages.contains(lang) ? lang : null;
  }

  /// The UI language (en / hi / kn): the choice made in Profile, else the account's preferred
  /// language from GET /v1/me. Null before sign-in, so the app follows the device (hi or kn, else English).
  String? get language {
    final pref = me?.preferredLanguage;
    return languageOverride ?? (supportedLanguages.contains(pref) ? pref : null);
  }

  /// Switches the UI language now and saves it to the account, so notifications use it too.
  /// Returns false when the server could not be told; that is retried on the next start.
  Future<bool> setLanguage(String lang) async {
    final user = me;
    if (user == null) return false;
    await _prefs.setString(_kLanguage, lang);
    await _prefs.setString(_kLanguageUser, user.id);
    await _prefs.setBool(_kLanguagePending, true);
    notifyListeners();
    return _pushLanguage();
  }

  Future<bool> _pushLanguage() async {
    final lang = languageOverride;
    if (lang == null) return true;
    try {
      final updated = await api.updatePreferredLanguage(lang);
      await _prefs.remove(_kLanguagePending);
      if (me?.id == updated.id) me = updated;
      notifyListeners();
      return true;
    } on ApiException {
      return false;
    }
  }

  /// After sign-in or restore: quietly retry a language change the server never got.
  void _retryLanguage() {
    if ((_prefs.getBool(_kLanguagePending) ?? false) && languageOverride != null) unawaited(_pushLanguage());
  }

  /// The saved token, moving it out of shared preferences (where versions before 0.2 kept it)
  /// into the secure store the first time.
  Future<String?> _readToken() async {
    String? token;
    try {
      token = await _secure.read(_kToken);
    } catch (e) {
      debugPrint('Secure storage unreadable: $e');
    }
    final legacy = _prefs.getString(_kToken);
    if (legacy != null) {
      try {
        if (token == null) {
          await _secure.write(_kToken, legacy);
          token = legacy;
        }
        await _prefs.remove(_kToken);
      } catch (e) {
        // The key store is not available now: use the old token and move it on a later start.
        debugPrint('Token not moved to secure storage yet: $e');
        token ??= legacy;
      }
    }
    return token;
  }

  Future<void> _saveToken(String token) async {
    try {
      await _secure.write(_kToken, token);
    } catch (e) {
      // Never fall back to plain storage: the teacher signs in again next time instead.
      debugPrint('Token not saved: $e');
    }
  }

  Future<void> _deleteToken() async {
    await _prefs.remove(_kToken);
    try {
      await _secure.delete(_kToken);
    } catch (e) {
      debugPrint('Token not deleted: $e');
    }
  }

  /// Restores a previous sign-in, if the token still works.
  Future<void> restore() async {
    _listenToPush();
    api.baseUrl = serverUrl;
    final token = await _readToken();
    if (token != null) {
      api.token = token;
      try {
        me = await api.me();
        _retryLanguage();
        unawaited(_registerPush());
      } on ApiException catch (e) {
        // Offline: stay on the sign-in screen but keep the token for the next attempt.
        if (e.status == 401) await _deleteToken();
        api.token = null;
      }
    }
    restoring = false;
    notifyListeners();
  }

  Future<void> signIn({required String server, required String tenant, required String login, required String password}) async {
    api.baseUrl = server;
    await api.login(tenant: tenant, login: login, password: password);
    await _finishSignIn(server: server, tenant: tenant);
    await _prefs.setString(_kLogin, login);
  }

  /// Texts a sign-in code to [phone] (E.164, such as +919845012345).
  Future<OtpChallenge> requestOtp({required String server, required String tenant, required String phone}) {
    api.baseUrl = server;
    return api.requestOtp(tenant: tenant, phone: phone);
  }

  /// Signs in with the code texted to [phone].
  Future<void> signInWithOtp({required String server, required String tenant, required String phone, required String code}) async {
    api.baseUrl = server;
    await api.verifyOtp(tenant: tenant, phone: phone, code: code);
    await _finishSignIn(server: server, tenant: tenant);
    await _prefs.setString(_kPhone, phone.replaceFirst(RegExp(r'^\+91'), ''));
  }

  Future<void> _finishSignIn({required String server, required String tenant}) async {
    final profile = await api.me();
    if (!profile.roles.any((r) => const ['teacher', 'hod', 'principal'].contains(r))) {
      api.token = null;
      throw ApiException(403, 'This app is for teachers. Your account does not have a teaching role.', kind: ApiErrorKind.notTeacher);
    }
    await _prefs.setString(_kServer, server);
    await _prefs.setString(_kTenant, tenant);
    await _saveToken(api.token!);
    me = profile;
    _retryLanguage();
    unawaited(_registerPush());
    notifyListeners();
  }

  /// Signs out. [expired]: the server already rejected the token, so it is not asked to stop pushes.
  Future<void> signOut({bool expired = false}) async {
    if (expired && me == null) return;
    final pushToken = _pushToken;
    _pushToken = null;
    pushTap.value = null;
    if (pushToken != null) {
      // Sent with the token still set (the request is built before this returns), not waited for.
      if (!expired && api.token != null) unawaited(api.unregisterPushDevice(pushToken).then((_) {}, onError: (_) {}));
      // A new token next time, so this phone gets nothing more for this teacher even offline.
      unawaited(push.deleteToken().then((_) {}, onError: (Object e) => debugPrint('Push token not deleted: $e')));
    }
    api.token = null;
    await _deleteToken();
    me = null;
    notifyListeners();
  }

  /// Listens for push taps and token changes (once).
  void _listenToPush() {
    if (_pushSubscriptions.isNotEmpty) return;
    _pushSubscriptions
      ..add(push.taps.listen(_tapped))
      ..add(
        push.tokenRefreshed.listen((token) {
          if (signedIn) unawaited(_registerPush(token));
        }),
      );
    push.initialTap().then((tap) {
      if (tap != null) _tapped(tap);
    }, onError: (Object e) => debugPrint('No initial push: $e'));
  }

  void _tapped(PushTap tap) => pushTap.value = tap;

  /// Asks for permission to notify, then registers this phone's push token for the teacher.
  /// Quiet on failure: pushes are a convenience, the app works without them.
  Future<void> _registerPush([String? token]) async {
    try {
      if (token == null) {
        await push.requestPermission();
        token = await push.token();
      }
      if (token == null || !signedIn) return;
      await api.registerPushDevice(token: token, platform: push.platform);
      _pushToken = token;
    } catch (e) {
      debugPrint('Push not registered: $e');
    }
  }

  @override
  void dispose() {
    for (final s in _pushSubscriptions) {
      s.cancel();
    }
    pushTap.dispose();
    super.dispose();
  }
}
