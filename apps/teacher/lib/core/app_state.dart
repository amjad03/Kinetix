import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'l10n.dart' show supportedLanguages;
import 'models.dart';
import 'realtime.dart';

/// The default API address. On the Android emulator the host machine is 10.0.2.2.
const defaultServerUrl = 'http://localhost:4000';

/// Who is signed in, the remembered server and institution, and the UI language.
///
/// TODO: keep the token in flutter_secure_storage (Android Keystore / iOS Keychain) and add an
/// app lock (biometric or OS PIN), per docs/architecture/board-pairing.md.
class AppState extends ChangeNotifier {
  AppState(this.api, this._prefs, {TeacherRealtime? realtime}) : realtime = realtime ?? NoRealtime();

  final TeacherApi api;

  /// Live events (new messages) while signed in; the home screen connects it.
  final TeacherRealtime realtime;
  final SharedPreferences _prefs;

  static const _kServer = 'server_url', _kTenant = 'tenant', _kLogin = 'login', _kToken = 'token';

  /// The language chosen in Profile on this phone, for the user in [_kLanguageUser]; and whether
  /// saving it to the server still has to be retried.
  static const _kLanguage = 'language', _kLanguageUser = 'language_user', _kLanguagePending = 'language_pending';

  Me? me;
  bool restoring = true;

  bool get signedIn => me != null;
  String get serverUrl => _prefs.getString(_kServer) ?? defaultServerUrl;
  String get rememberedTenant => _prefs.getString(_kTenant) ?? '';
  String get rememberedLogin => _prefs.getString(_kLogin) ?? '';

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

  /// Restores a previous sign-in, if the token still works.
  Future<void> restore() async {
    api.baseUrl = serverUrl;
    final token = _prefs.getString(_kToken);
    if (token != null) {
      api.token = token;
      try {
        me = await api.me();
        _retryLanguage();
      } on ApiException catch (e) {
        // Offline: stay on the sign-in screen but keep the token for the next attempt.
        if (e.status == 401) await _prefs.remove(_kToken);
        api.token = null;
      }
    }
    restoring = false;
    notifyListeners();
  }

  Future<void> signIn({required String server, required String tenant, required String login, required String password}) async {
    api.baseUrl = server;
    await api.login(tenant: tenant, login: login, password: password);
    final profile = await api.me();
    if (!profile.roles.any((r) => const ['teacher', 'hod', 'principal'].contains(r))) {
      api.token = null;
      throw ApiException(403, 'This app is for teachers. Your account does not have a teaching role.', kind: ApiErrorKind.notTeacher);
    }
    await _prefs.setString(_kServer, server);
    await _prefs.setString(_kTenant, tenant);
    await _prefs.setString(_kLogin, login);
    await _prefs.setString(_kToken, api.token!);
    me = profile;
    _retryLanguage();
    notifyListeners();
  }

  Future<void> signOut() async {
    api.token = null;
    await _prefs.remove(_kToken);
    me = null;
    notifyListeners();
  }
}
