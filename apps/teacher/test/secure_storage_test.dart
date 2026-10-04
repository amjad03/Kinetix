import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/core/api.dart';
import 'package:kinetix_teacher/core/app_state.dart';
import 'package:kinetix_teacher/core/secure_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_api.dart';

void main() {
  late FakeTeacherApi api;

  Future<(AppState, SharedPreferences)> restore(Map<String, Object> prefs, MemorySecureStore secure) async {
    SharedPreferences.setMockInitialValues(prefs);
    final p = await SharedPreferences.getInstance();
    final state = AppState(api, p, secure: secure);
    await state.restore();
    return (state, p);
  }

  setUp(() => api = FakeTeacherApi());

  test('moves a token from shared preferences to the key store once', () async {
    final secure = MemorySecureStore();
    final (state, prefs) = await restore({'token': 'old', 'tenant': 'demo-college'}, secure);
    expect(state.signedIn, isTrue);
    expect(api.token, 'old');
    expect(secure.values['token'], 'old');
    expect(prefs.getString('token'), isNull);
    expect(prefs.getString('tenant'), 'demo-college');
  });

  test('the key store wins over a leftover plain token, which is removed', () async {
    final secure = MemorySecureStore({'token': 'new'});
    final (_, prefs) = await restore({'token': 'old'}, secure);
    expect(api.token, 'new');
    expect(secure.values['token'], 'new');
    expect(prefs.getString('token'), isNull);
  });

  test('with the key store unavailable, the old token still works and is moved later', () async {
    final secure = MemorySecureStore()..failWith = PlatformException(code: 'keystore');
    final (state, prefs) = await restore({'token': 'old'}, secure);
    expect(state.signedIn, isTrue);
    expect(prefs.getString('token'), 'old');
  });

  test('signing in saves the token only in the key store; signing out removes it', () async {
    final secure = MemorySecureStore();
    final (state, prefs) = await restore({}, secure);
    await state.signIn(server: 'http://test', tenant: 'demo-college', login: 'anita@demo.kinetix.in', password: 'kinetix123');
    expect(secure.values['token'], 'tok');
    expect(prefs.getString('token'), isNull);

    await state.signOut();
    expect(secure.values, isEmpty);
    expect(api.token, isNull);
  });

  test('a revoked token is deleted', () async {
    api.meError = ApiException(401, 'Invalid or expired token', code: 'AUTH_EXPIRED');
    final secure = MemorySecureStore({'token': 'revoked'});
    final (state, _) = await restore({}, secure);
    expect(state.signedIn, isFalse);
    expect(secure.values, isEmpty);
  });

  test('offline at start: signed out for now, but the token is kept', () async {
    api.meError = ApiException(0, 'offline', kind: ApiErrorKind.offline);
    final secure = MemorySecureStore({'token': 'tok'});
    final (state, _) = await restore({}, secure);
    expect(state.signedIn, isFalse);
    expect(secure.values['token'], 'tok');
  });
}
