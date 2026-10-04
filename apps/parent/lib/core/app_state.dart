import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart' show Locale;
import 'package:shared_preferences/shared_preferences.dart';

import '../l10n/l10n.dart';
import 'api.dart';
import 'models.dart';
import 'realtime.dart';

/// The default API address. On the Android emulator the host machine is 10.0.2.2.
const defaultServerUrl = 'http://localhost:4000';

/// Who is signed in, the remembered server, institution and selected child, and the app's language.
///
/// TODO: keep the token in flutter_secure_storage (Android Keystore / iOS Keychain) and add an
/// app lock (biometric or OS PIN), per docs/architecture/board-pairing.md.
class AppState extends ChangeNotifier {
  AppState(this.api, this.prefs, {RealtimeConnector? realtime}) : realtime = realtime ?? SocketRealtimeConnection.new;

  final ParentApi api;
  final SharedPreferences prefs;

  /// Opens the realtime connection new messages arrive on (a fake in tests).
  final RealtimeConnector realtime;

  static const _kServer = 'server_url', _kTenant = 'tenant', _kLogin = 'login', _kToken = 'token';

  /// The language picked in Profile, and whether the server still has to hear about it.
  static const _kLanguage = 'language', _kLanguageUnsynced = 'language_unsynced';

  Me? me;
  bool restoring = true;

  bool get signedIn => me != null;
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

  /// Restores a previous sign-in, if the token still works.
  Future<void> restore() async {
    api.baseUrl = serverUrl;
    final token = prefs.getString(_kToken);
    if (token != null) {
      api.token = token;
      try {
        final profile = await api.me();
        if (profile.isGuardian) {
          me = profile;
        } else {
          await prefs.remove(_kToken);
          api.token = null;
        }
      } on ApiException catch (e) {
        // Offline: stay on the sign-in screen but keep the token for the next attempt.
        if (e.status == 401) await prefs.remove(_kToken);
        api.token = null;
      }
    }
    restoring = false;
    notifyListeners();
    if (signedIn) unawaited(_syncLanguage());
  }

  Future<void> signIn({required String server, required String tenant, required String login, required String password}) async {
    api.baseUrl = server;
    await api.login(tenant: tenant, login: login, password: password);
    final profile = await api.me();
    if (!profile.isGuardian) {
      api.token = null;
      final teacher = profile.roles.contains('teacher');
      throw ApiException(
        403,
        'This app is for parents and guardians. ${teacher ? 'Teachers can use the KINETIX Teacher app.' : 'Ask your institution to link your account to your child.'}',
        problem: teacher ? ApiProblem.teacherAccount : ApiProblem.notGuardian,
      );
    }
    await prefs.setString(_kServer, server);
    await prefs.setString(_kTenant, tenant);
    await prefs.setString(_kLogin, login);
    await prefs.setString(_kToken, api.token!);
    me = profile;
    notifyListeners();
    unawaited(_syncLanguage());
  }

  Future<void> signOut() async {
    api.token = null;
    await prefs.remove(_kToken);
    me = null;
    notifyListeners();
  }
}
