import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/device_store.dart';
import 'package:kinetix_board/core/secret_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('moves a device token from shared preferences to the secret store once', () async {
    SharedPreferences.setMockInitialValues({'server_url': 'http://cloud', 'device_token': 'old', 'device_name': 'Room 204'});
    final secrets = MemorySecretStore();
    final saved = await DeviceStore(secrets: secrets).load();
    expect(saved, (server: 'http://cloud', token: 'old', name: 'Room 204'));
    expect(secrets.values['device_token'], 'old');
    expect((await SharedPreferences.getInstance()).getString('device_token'), isNull);

    // Next start: from the secret store.
    expect((await DeviceStore(secrets: secrets).load()).token, 'old');
  });

  test('the secret store wins over a leftover plain token, which is removed', () async {
    SharedPreferences.setMockInitialValues({'device_token': 'old'});
    final secrets = MemorySecretStore({'device_token': 'new'});
    expect((await DeviceStore(secrets: secrets).load()).token, 'new');
    expect((await SharedPreferences.getInstance()).getString('device_token'), isNull);
  });

  test('with the key store unavailable, the old token still works and stays until it can move', () async {
    SharedPreferences.setMockInitialValues({'device_token': 'old'});
    final secrets = MemorySecretStore()..failWith = PlatformException(code: 'keystore');
    expect((await DeviceStore(secrets: secrets).load()).token, 'old');
    expect((await SharedPreferences.getInstance()).getString('device_token'), 'old');
  });

  test('enrolment saves the token only in the secret store', () async {
    SharedPreferences.setMockInitialValues({});
    final secrets = MemorySecretStore();
    await DeviceStore(secrets: secrets).save(server: 'http://cloud', token: 'dev', name: 'Room 204');
    expect(secrets.values['device_token'], 'dev');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('device_token'), isNull);
    expect(prefs.getString('server_url'), 'http://cloud');
    expect(await DeviceStore(secrets: secrets).load(), (server: 'http://cloud', token: 'dev', name: 'Room 204'));
  });
}
