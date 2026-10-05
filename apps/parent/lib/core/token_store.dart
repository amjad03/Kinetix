import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where the session token is kept between launches. The device's secure store in the app
/// ([SecureTokenStore]); [MemoryTokenStore] in tests.
abstract class TokenStore {
  Future<String?> read();
  Future<void> write(String token);
  Future<void> delete();
}

/// The token in the Android Keystore (encrypted shared preferences) or the iOS Keychain, readable
/// only after the phone is first unlocked and never copied to another device by a backup.
class SecureTokenStore implements TokenStore {
  const SecureTokenStore([this._storage = const FlutterSecureStorage(
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
  )]);

  final FlutterSecureStorage _storage;
  static const _key = 'session_token';

  @override
  Future<String?> read() async {
    try {
      return await _storage.read(key: _key);
    } catch (e) {
      // A key the Keystore lost (restored backup, reset lock screen): sign in again.
      debugPrint('Secure storage read failed: $e');
      return null;
    }
  }

  @override
  Future<void> write(String token) => _storage.write(key: _key, value: token);

  @override
  Future<void> delete() async {
    try {
      await _storage.delete(key: _key);
    } catch (e) {
      debugPrint('Secure storage delete failed: $e');
    }
  }
}

/// Keeps the token in memory only: for tests and demo builds.
class MemoryTokenStore implements TokenStore {
  MemoryTokenStore([this.token]);

  String? token;

  @override
  Future<String?> read() async => token;

  @override
  Future<void> write(String token) async => this.token = token;

  @override
  Future<void> delete() async => token = null;
}

/// Earlier versions kept the token in plain shared preferences under `token`: moves it to [store]
/// once (unless the store already has one) and deletes the old copy. Returns the stored token.
Future<String?> migrateLegacyToken(SharedPreferences prefs, TokenStore store) async {
  const legacyKey = 'token';
  final legacy = prefs.getString(legacyKey);
  var token = await store.read();
  if (legacy != null) {
    if (token == null) {
      try {
        await store.write(legacy);
      } catch (e) {
        // Keep the old copy and try again on the next launch.
        debugPrint('Token migration failed: $e');
        return legacy;
      }
      token = legacy;
    }
    await prefs.remove(legacyKey);
  }
  return token;
}
