import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'models.dart';

/// The default API address. On the Android emulator the host machine is 10.0.2.2.
const defaultServerUrl = 'http://localhost:4000';

/// Who is signed in, and the remembered server and institution.
///
/// TODO: keep the token in flutter_secure_storage (Android Keystore / iOS Keychain) and add an
/// app lock (biometric or OS PIN), per docs/architecture/board-pairing.md.
class AppState extends ChangeNotifier {
  AppState(this.api, this._prefs);

  final TeacherApi api;
  final SharedPreferences _prefs;

  static const _kServer = 'server_url', _kTenant = 'tenant', _kLogin = 'login', _kToken = 'token';

  Me? me;
  bool restoring = true;

  bool get signedIn => me != null;
  String get serverUrl => _prefs.getString(_kServer) ?? defaultServerUrl;
  String get rememberedTenant => _prefs.getString(_kTenant) ?? '';
  String get rememberedLogin => _prefs.getString(_kLogin) ?? '';

  /// Restores a previous sign-in, if the token still works.
  Future<void> restore() async {
    api.baseUrl = serverUrl;
    final token = _prefs.getString(_kToken);
    if (token != null) {
      api.token = token;
      try {
        me = await api.me();
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
      throw ApiException(403, 'This app is for teachers. Your account does not have a teaching role.');
    }
    await _prefs.setString(_kServer, server);
    await _prefs.setString(_kTenant, tenant);
    await _prefs.setString(_kLogin, login);
    await _prefs.setString(_kToken, api.token!);
    me = profile;
    notifyListeners();
  }

  Future<void> signOut() async {
    api.token = null;
    await _prefs.remove(_kToken);
    me = null;
    notifyListeners();
  }
}
