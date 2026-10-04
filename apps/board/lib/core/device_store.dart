import 'package:shared_preferences/shared_preferences.dart';

/// Where the board keeps its server address, device token and settings.
/// TODO: move the token to Android Keystore / Windows DPAPI (flutter_secure_storage).
class DeviceStore {
  static const _server = 'server_url';
  static const _token = 'device_token';
  static const _name = 'device_name';

  Future<({String? server, String? token, String? name})> load() async {
    final p = await SharedPreferences.getInstance();
    return (server: p.getString(_server), token: p.getString(_token), name: p.getString(_name));
  }

  Future<void> save({required String server, required String token, required String name}) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_server, server);
    await p.setString(_token, token);
    await p.setString(_name, name);
  }

  Future<String?> setting(String key) async => (await SharedPreferences.getInstance()).getString('setting.$key');

  Future<void> setSetting(String key, String value) async => (await SharedPreferences.getInstance()).setString('setting.$key', value);
}
