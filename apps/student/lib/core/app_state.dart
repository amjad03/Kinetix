import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart' show Locale;
import 'package:shared_preferences/shared_preferences.dart';

import '../l10n/l10n.dart';
import 'api.dart';
import 'live.dart';
import 'models.dart';
import 'push.dart';
import 'token_store.dart';
import 'server_config.dart';

/// The build's server address (`KINETIX_API_URL`; localhost only in debug builds).
export 'server_config.dart' show defaultServerUrl;

/// Who is signed in, their student record, the remembered server, institution and login, the
/// app's language, and the language KINETIX AI answers in. The session token is kept in the
/// device's secure store ([TokenStore]: Android Keystore / iOS Keychain), never in preferences.
class AppState extends ChangeNotifier {
  AppState(
    this.api,
    this.prefs, {
    TokenStore? tokens,
    PushMessaging messaging = const NoPushMessaging(),
    LiveConnector? live,
  }) : tokens = tokens ?? const SecureTokenStore(),
       push = PushRegistrar(api, messaging),
       liveConnector = live ?? SocketLiveConnection.new {
    _taps = messaging.onTap.listen((t) => pendingPushTap.value = t);
  }

  final StudentApi api;
  final SharedPreferences prefs;
  final TokenStore tokens;
  final PushRegistrar push;
  PushMessaging get messaging => push.messaging;

  /// A tapped notification still to open (the shell opens it once someone is signed in).
  final pendingPushTap = ValueNotifier<PushTap?>(null);
  StreamSubscription<PushTap>? _taps;

  /// Opens the realtime connection a live class is watched over (a fake in tests).
  final LiveConnector liveConnector;

  static const _kServer = 'server_url', _kTenant = 'tenant', _kLogin = 'login', _kAiLanguage = 'ai_language';

  /// Whether the "Get notifications?" question was answered on this phone.
  static const _kPushAsked = 'push_asked';

  /// The language picked in Profile, and whether the server still has to hear about it.
  static const _kLanguage = 'language', _kLanguageUnsynced = 'language_unsynced';

  Me? me;
  StudentProfile? student;
  bool restoring = true;

  bool get signedIn => me != null && (student != null || me!.isAlumni);

  /// Signed in as a graduate only (no student record): the app shows the alumni home.
  bool get alumniOnly => me != null && student == null && me!.isAlumni;
  String get serverUrl => prefs.getString(_kServer) ?? defaultServerUrl;
  String get rememberedTenant => prefs.getString(_kTenant) ?? '';
  String get rememberedLogin => prefs.getString(_kLogin) ?? '';

  /// The language picked in Profile on this phone, if any.
  AppLanguage? get chosenLanguage => AppLanguage.tryParse(prefs.getString(_kLanguage));

  /// The app's language: the one picked in Profile, else the account's (`preferredLanguage`).
  /// Null before sign-in with nothing picked: the app follows the device (see [resolveDeviceLocale]).
  AppLanguage? get language => chosenLanguage ?? (me == null ? null : AppLanguage.tryParse(me!.preferredLanguage) ?? AppLanguage.en);

  Locale? get locale => language?.locale;

  /// Switches the app's language and saves it to the account, so updates arrive in it too.
  /// The save is fire-and-forget: if it fails it is retried quietly on the next start.
  /// After the profile was edited or the photo changed.
  void updateMe(Me updated) {
    me = updated;
    notifyListeners();
  }

  Future<void> setLanguage(AppLanguage l) async {
    await prefs.setString(_kLanguage, l.name);
    await prefs.setBool(_kLanguageUnsynced, true);
    notifyListeners();
    unawaited(_syncLanguage());
  }

  Future<void> _syncLanguage() async {
    final l = chosenLanguage;
    if (l == null || prefs.getBool(_kLanguageUnsynced) != true || api.token == null) return;
    try {
      final profile = await api.setPreferredLanguage(l.name);
      if (chosenLanguage == l) await prefs.remove(_kLanguageUnsynced);
      if (me != null && me!.id == profile.id) me = profile;
    } catch (_) {
      // Offline or the server said no: try again next start.
    }
  }

  /// The language KINETIX AI answers in: the student's own choice (kept separate from the app's
  /// language), else the app's language.
  AiLanguage get aiLanguage => AiLanguage.parse(prefs.getString(_kAiLanguage) ?? language?.name);

  Future<void> setAiLanguage(AiLanguage l) async {
    await prefs.setString(_kAiLanguage, l.name);
    notifyListeners();
  }

  /// Restores a previous sign-in, if the token still works.
  Future<void> restore() async {
    api.baseUrl = serverUrl;
    pendingPushTap.value ??= await _initialTap();
    // Earlier versions kept the token in preferences: moved to the secure store once.
    final token = await migrateLegacyToken(prefs, tokens);
    if (token != null) {
      api.token = token;
      try {
        final profile = await api.me();
        if (profile.isStudent) {
          student = await api.student();
          me = profile;
        } else if (profile.isAlumni) {
          me = profile;
        } else {
          await tokens.delete();
          api.token = null;
        }
      } on ApiException catch (e) {
        // Offline: stay on the sign-in screen but keep the token for the next attempt.
        if (e.status == 401 || e.status == 404) await tokens.delete();
        api.token = null;
      }
    }
    restoring = false;
    notifyListeners();
    if (signedIn) {
      unawaited(_syncLanguage());
      unawaited(push.register());
    }
  }

  Future<PushTap?> _initialTap() async {
    try {
      return await messaging.initialTap();
    } catch (_) {
      return null;
    }
  }

  Future<void> signIn({required String server, required String tenant, required String login, required String password}) async {
    api.baseUrl = server;
    await api.login(tenant: tenant, login: login, password: password);
    await _completeSignIn(server: server, tenant: tenant, login: login);
  }

  /// Texts a sign-in code to [phone] (E.164).
  Future<OtpChallenge> requestOtp({required String server, required String tenant, required String phone}) {
    api.baseUrl = server;
    return api.requestOtp(tenant: tenant, phone: phone);
  }

  /// Signs in with the code texted to [phone].
  Future<void> signInWithOtp({required String server, required String tenant, required String phone, required String code}) async {
    api.baseUrl = server;
    await api.verifyOtp(tenant: tenant, phone: phone, code: code);
    await _completeSignIn(server: server, tenant: tenant, login: phone);
  }

  /// Only students get in; remembers the server, institution and login, and keeps the token.
  Future<void> _completeSignIn({required String server, required String tenant, required String login}) async {
    final profile = await api.me();
    if (!profile.isStudent && profile.isAlumni) {
      // A graduate: no student record, the alumni home instead.
      await prefs.setString(_kServer, server);
      await prefs.setString(_kTenant, tenant);
      await prefs.setString(_kLogin, login);
      await tokens.write(api.token!);
      me = profile;
      student = null;
      notifyListeners();
      unawaited(_syncLanguage());
      unawaited(push.register());
      return;
    }
    if (!profile.isStudent) {
      api.token = null;
      final (hint, problem) = profile.roles.contains('guardian')
          ? ('Parents and guardians can use the KINETIX Parent app.', ApiProblem.guardianAccount)
          : profile.roles.any((r) => const ['teacher', 'hod', 'principal'].contains(r))
          ? ('Teachers can use the KINETIX Teacher app.', ApiProblem.teacherAccount)
          : ('Ask your college office to set up your student login.', ApiProblem.notStudent);
      throw ApiException(403, 'This app is for students. $hint', problem: problem);
    }
    final StudentProfile record;
    try {
      record = await api.student();
    } on ApiException catch (e) {
      api.token = null;
      if (e.status == 404) {
        throw ApiException(
          404,
          'Your login is not linked to a student record yet. Ask your college office to link it.',
          problem: ApiProblem.notLinked,
        );
      }
      rethrow;
    }
    await prefs.setString(_kServer, server);
    await prefs.setString(_kTenant, tenant);
    await prefs.setString(_kLogin, login);
    await tokens.write(api.token!);
    me = profile;
    student = record;
    notifyListeners();
    unawaited(_syncLanguage());
    // In the background: on iOS the token can take a few seconds to arrive.
    unawaited(push.register());
  }

  Future<void> signOut() async {
    // Stop pushes to this phone before the token goes.
    if (api.token != null) await push.unregister();
    api.token = null;
    await tokens.delete();
    me = null;
    student = null;
    notifyListeners();
  }

  /// Whether to ask "Get notifications on this phone?": push is set up, the question was never
  /// answered here and the system has not been asked either.
  Future<bool> shouldAskForNotifications() async {
    if (!messaging.available || prefs.getBool(_kPushAsked) == true) return false;
    try {
      return await messaging.permission() == PushPermission.notDetermined;
    } catch (_) {
      return false;
    }
  }

  /// The answer to our own question; only "Turn on" brings up the system prompt.
  Future<void> answerNotifications({required bool allow}) async {
    await prefs.setBool(_kPushAsked, true);
    if (!allow) return;
    try {
      if (await messaging.requestPermission() == PushPermission.granted && signedIn) await push.register();
    } catch (e) {
      debugPrint('Notification permission failed: $e');
    }
  }

  @override
  void dispose() {
    _taps?.cancel();
    pendingPushTap.dispose();
    super.dispose();
  }
}
