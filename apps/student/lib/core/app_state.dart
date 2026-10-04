import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'models.dart';
import 'push.dart';

/// The default API address. On the Android emulator the host machine is 10.0.2.2.
const defaultServerUrl = 'http://localhost:4000';

/// Who is signed in, their student record, and the remembered server, institution, login and
/// the language KINETIX AI answers in.
///
/// TODO: keep the token in flutter_secure_storage (Android Keystore / iOS Keychain) and add an
/// app lock (biometric or OS PIN), per docs/architecture/board-pairing.md.
class AppState extends ChangeNotifier {
  AppState(this.api, this.prefs, {PushTokenSource push = const NoPushTokenSource()}) : push = PushRegistrar(api, push);

  final StudentApi api;
  final SharedPreferences prefs;
  final PushRegistrar push;

  static const _kServer = 'server_url', _kTenant = 'tenant', _kLogin = 'login', _kToken = 'token', _kAiLanguage = 'ai_language';

  Me? me;
  StudentProfile? student;
  bool restoring = true;

  bool get signedIn => me != null && student != null;
  String get serverUrl => prefs.getString(_kServer) ?? defaultServerUrl;
  String get rememberedTenant => prefs.getString(_kTenant) ?? '';
  String get rememberedLogin => prefs.getString(_kLogin) ?? '';

  /// The language KINETIX AI answers in: the student's choice, else their profile language.
  AiLanguage get aiLanguage => AiLanguage.parse(prefs.getString(_kAiLanguage) ?? me?.preferredLanguage);

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
    if (signedIn) await push.register();
  }

  Future<void> signIn({required String server, required String tenant, required String login, required String password}) async {
    api.baseUrl = server;
    await api.login(tenant: tenant, login: login, password: password);
    final profile = await api.me();
    if (!profile.isStudent) {
      api.token = null;
      final hint = profile.roles.contains('guardian')
          ? 'Parents and guardians can use the KINETIX Parent app.'
          : profile.roles.any((r) => const ['teacher', 'hod', 'principal'].contains(r))
          ? 'Teachers can use the KINETIX Teacher app.'
          : 'Ask your college office to set up your student login.';
      throw ApiException(403, 'This app is for students. $hint');
    }
    final StudentProfile record;
    try {
      record = await api.student();
    } on ApiException catch (e) {
      api.token = null;
      if (e.status == 404) {
        throw ApiException(404, 'Your login is not linked to a student record yet. Ask your college office to link it.');
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
