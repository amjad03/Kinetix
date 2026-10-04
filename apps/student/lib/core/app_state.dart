import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart' show Locale;
import 'package:shared_preferences/shared_preferences.dart';

import '../l10n/l10n.dart';
import 'api.dart';
import 'live.dart';
import 'models.dart';
import 'push.dart';

/// The default API address. On the Android emulator the host machine is 10.0.2.2.
const defaultServerUrl = 'http://localhost:4000';

/// Who is signed in, their student record, the remembered server, institution and login, the
/// app's language, and the language KINETIX AI answers in.
///
/// TODO: keep the token in flutter_secure_storage (Android Keystore / iOS Keychain) and add an
/// app lock (biometric or OS PIN), per docs/architecture/board-pairing.md.
class AppState extends ChangeNotifier {
  AppState(this.api, this.prefs, {PushTokenSource push = const NoPushTokenSource(), LiveConnector? live})
    : push = PushRegistrar(api, push),
      liveConnector = live ?? SocketLiveConnection.new;

  final StudentApi api;
  final SharedPreferences prefs;
  final PushRegistrar push;

  /// Opens the realtime connection a live class is watched over (a fake in tests).
  final LiveConnector liveConnector;

  static const _kServer = 'server_url', _kTenant = 'tenant', _kLogin = 'login', _kToken = 'token', _kAiLanguage = 'ai_language';

  /// The language picked in Profile, and whether the server still has to hear about it.
  static const _kLanguage = 'language', _kLanguageUnsynced = 'language_unsynced';

  Me? me;
  StudentProfile? student;
  bool restoring = true;

  bool get signedIn => me != null && student != null;
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
    final token = prefs.getString(_kToken);
    if (token != null) {
      api.token = token;
      try {
        final profile = await api.me();
        if (profile.isStudent) {
          student = await api.student();
          me = profile;
        } else {
          await prefs.remove(_kToken);
          api.token = null;
        }
      } on ApiException catch (e) {
        // Offline: stay on the sign-in screen but keep the token for the next attempt.
        if (e.status == 401 || e.status == 404) await prefs.remove(_kToken);
        api.token = null;
      }
    }
    restoring = false;
    notifyListeners();
    if (signedIn) {
      unawaited(_syncLanguage());
      await push.register();
    }
  }

  Future<void> signIn({required String server, required String tenant, required String login, required String password}) async {
    api.baseUrl = server;
    await api.login(tenant: tenant, login: login, password: password);
    final profile = await api.me();
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
    await prefs.setString(_kToken, api.token!);
    me = profile;
    student = record;
    notifyListeners();
    unawaited(_syncLanguage());
    await push.register();
  }

  Future<void> signOut() async {
    // Stop pushes to this phone before the token goes.
    if (api.token != null) await push.unregister();
    api.token = null;
    await prefs.remove(_kToken);
    me = null;
    student = null;
    notifyListeners();
  }
}
