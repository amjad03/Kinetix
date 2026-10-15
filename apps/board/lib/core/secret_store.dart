import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Secrets kept by the operating system, not in plain preferences: the board's device token.
/// Tests use [MemorySecretStore].
abstract class SecretStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

/// flutter_secure_storage: Android Keystore on panels and tablets; on Windows the data is
/// encrypted with DPAPI for the signed-in Windows user; on a Mac the login keychain.
class OsSecretStore implements SecretStore {
  OsSecretStore([FlutterSecureStorage? storage]) : _storage = storage ?? const FlutterSecureStorage(mOptions: macOptions);

  /// The Mac's login keychain, not the data protection keychain (the plugin's default): that one
  /// needs a keychain-access-groups entitlement from a signed team build, so an ad-hoc signed
  /// board app could not keep its device token and asked to be enrolled again after every launch.
  static const macOptions = MacOsOptions(usesDataProtectionKeychain: false);

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);
  @override
  Future<void> write(String key, String value) => _storage.write(key: key, value: value);
  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

/// In memory, for tests.
class MemorySecretStore implements SecretStore {
  MemorySecretStore([Map<String, String>? values]) : values = values ?? {};

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
