import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'secret_store.dart';

/// Where the board keeps its server address, device token and settings. The device token is in
/// the [SecretStore] (Android Keystore, Windows DPAPI); the rest in shared preferences. Boards
/// enrolled by older versions had the token in shared preferences: [load] moves it once.
class DeviceStore {
  DeviceStore({SecretStore? secrets}) : _secrets = secrets ?? OsSecretStore();

  final SecretStore _secrets;

  static const _server = 'server_url';

  /// The key in the secret store, and the old key in shared preferences.
  static const _token = 'device_token';
  static const _name = 'device_name';

  Future<({String? server, String? token, String? name})> load() async {
    final p = await SharedPreferences.getInstance();
    String? token;
    try {
      token = await _secrets.read(_token);
    } catch (e) {
      debugPrint('Secure storage unreadable: $e');
    }
    final legacy = p.getString(_token);
    if (legacy != null) {
      try {
        if (token == null) {
          await _secrets.write(_token, legacy);
          token = legacy;
        }
        await p.remove(_token);
      } catch (e) {
        // The key store is not available now: use the old token and move it on a later start.
        debugPrint('Device token not moved to secure storage yet: $e');
        token ??= legacy;
      }
    }
    return (server: p.getString(_server), token: token, name: p.getString(_name));
  }

  Future<void> save({required String server, required String token, required String name}) async {
    final p = await SharedPreferences.getInstance();
    try {
      await _secrets.write(_token, token);
    } catch (e) {
      // Never in plain storage: the board works until it restarts, then asks to be enrolled again.
      debugPrint('Device token not saved: $e');
    }
    await p.remove(_token);
    await p.setString(_server, server);
    await p.setString(_name, name);
  }

  Future<String?> setting(String key) async => (await SharedPreferences.getInstance()).getString('setting.$key');

  Future<void> setSetting(String key, String value) async => (await SharedPreferences.getInstance()).setString('setting.$key', value);
}
