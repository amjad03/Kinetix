import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Secrets kept by the operating system's key store, not in plain preferences: the sign-in token.
/// Tests use [MemorySecureStore].
abstract class SecureStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

/// Android Keystore (encrypted shared preferences keyed by it) and the iOS Keychain.
class DeviceSecureStore implements SecureStore {
  DeviceSecureStore([FlutterSecureStorage? storage])
    : _storage =
          storage ??
          const FlutterSecureStorage(
            // Readable once the phone has been unlocked after a restart; never restored to
            // another phone from a backup.
            iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
          );

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);
  @override
  Future<void> write(String key, String value) => _storage.write(key: key, value: value);
  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

/// In memory, for tests.
class MemorySecureStore implements SecureStore {
  MemorySecureStore([Map<String, String>? values]) : values = values ?? {};

  final Map<String, String> values;

  /// When set, every call throws it (a broken key store).
  Object? failWith;

  @override
  Future<String?> read(String key) async {
    if (failWith != null) throw failWith!;
    return values[key];
  }

  @override
  Future<void> write(String key, String value) async {
    if (failWith != null) throw failWith!;
    values[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    if (failWith != null) throw failWith!;
    values.remove(key);
  }
}
