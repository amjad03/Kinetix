import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/core/token_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers.dart';

class _BrokenStore extends MemoryTokenStore {
  @override
  Future<void> write(String token) async => throw Exception('Keystore unavailable');
}

/// The session token lives in the secure store (Keystore / Keychain), not in preferences.
void main() {
  test('moves a token from preferences to the secure store once and deletes the old copy', () async {
    SharedPreferences.setMockInitialValues({'token': 'old-tok', 'tenant': 'demo-college'});
    final prefs = await SharedPreferences.getInstance();
    final store = MemoryTokenStore();
    expect(await migrateLegacyToken(prefs, store), 'old-tok');
    expect(store.token, 'old-tok');
    expect(prefs.getString('token'), isNull);
    expect(prefs.getString('tenant'), 'demo-college');
    // The next launch has nothing to move.
    expect(await migrateLegacyToken(prefs, store), 'old-tok');
  });

  test('a token already in the secure store wins over a stale copy, which is deleted', () async {
    SharedPreferences.setMockInitialValues({'token': 'stale'});
    final prefs = await SharedPreferences.getInstance();
    final store = MemoryTokenStore('current');
    expect(await migrateLegacyToken(prefs, store), 'current');
    expect(prefs.getString('token'), isNull);
  });

  test('when the secure store fails the old copy is kept for the next launch', () async {
    SharedPreferences.setMockInitialValues({'token': 'old-tok'});
    final prefs = await SharedPreferences.getInstance();
    expect(await migrateLegacyToken(prefs, _BrokenStore()), 'old-tok');
    expect(prefs.getString('token'), 'old-tok');
  });

  test('SecureTokenStore keeps the token in flutter_secure_storage', () async {
    FlutterSecureStorage.setMockInitialValues({});
    const store = SecureTokenStore();
    expect(await store.read(), isNull);
    await store.write('abc');
    expect(await store.read(), 'abc');
    await store.delete();
    expect(await store.read(), isNull);
  });

  testWidgets('after updating the app a student stays signed in, with the token moved', (tester) async {
    final tokens = MemoryTokenStore();
    final (_, state) = await pumpApp(tester, signedIn: false, tokens: tokens, prefs: {'token': 'tok'});
    expect(find.byKey(const Key('greeting')), findsOneWidget);
    expect(tokens.token, 'tok');
    expect(state.prefs.getString('token'), isNull);
  });

  testWidgets('signing in never writes the token to preferences; signing out deletes it', (tester) async {
    final (_, state) = await pumpApp(tester, signedIn: false);
    await signInWithCode(tester);
    expect(storedToken(state), 'tok');
    expect(state.prefs.getKeys(), isNot(contains('token')));
    await state.signOut();
    await tester.pumpAndSettle();
    expect(storedToken(state), isNull);
  });

  testWidgets('an expired token is deleted from the secure store', (tester) async {
    final tokens = MemoryTokenStore('expired');
    await pumpApp(tester, signedIn: false, tokens: tokens, setup: (api) => api.rejectToken = true);
    expect(tokens.token, isNull);
    expect(find.byKey(const Key('sendCode')), findsOneWidget);
  });
}
