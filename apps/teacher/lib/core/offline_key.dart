import 'package:shared_preferences/shared_preferences.dart';

/// The institution's public signing key, kept from the last time the phone was online so a board's offline code can be checked without a network.
class OfflineKey {
  const OfflineKey({required this.keyId, required this.publicKeyRaw, required this.tenantId});

  factory OfflineKey.fromJson(Map<String, dynamic> j) =>
      OfflineKey(keyId: j['keyId'] as String, publicKeyRaw: j['publicKeyRaw'] as String, tenantId: j['tenantId'] as String);

  final String keyId;
  final String publicKeyRaw;
  final String tenantId;

  static const _kKey = 'offline.key.id';
  static const _kRaw = 'offline.key.raw';
  static const _kTenant = 'offline.key.tenant';

  static Future<OfflineKey?> load() async {
    final p = await SharedPreferences.getInstance();
    final id = p.getString(_kKey);
    final raw = p.getString(_kRaw);
    final tenant = p.getString(_kTenant);
    return id == null || raw == null || tenant == null ? null : OfflineKey(keyId: id, publicKeyRaw: raw, tenantId: tenant);
  }

  Future<void> save() async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_kKey, keyId);
    await p.setString(_kRaw, publicKeyRaw);
    await p.setString(_kTenant, tenantId);
  }
}
