import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/server_config.dart';

void main() {
  group('resolveServerUrl', () {
    test('uses KINETIX_API_URL without trailing slashes', () {
      expect(resolveServerUrl(defined: ' https://api.example.in/ ', debug: false), 'https://api.example.in');
      expect(resolveServerUrl(defined: 'https://api.example.in', debug: true), 'https://api.example.in');
    });

    test('debug builds fall back to the local API', () {
      expect(resolveServerUrl(defined: '', debug: true), debugServerUrl);
      expect(debugServerUrl, 'http://localhost:4000');
    });

    test('release builds without the define ask for the server instead of using localhost', () {
      // An empty address: the set-up screen asks for it (the Zynetix demo server has no fixed address).
      expect(resolveServerUrl(defined: '', debug: false), '');
    });

    test('demo builds (KINETIX_DEMO) need no server address, even in release', () {
      expect(resolveServerUrl(defined: '', debug: false, demo: true), demoServerUrl);
      expect(resolveServerUrl(defined: 'https://api.example.in', debug: false, demo: true), demoServerUrl);
    });

    test('rejects values that are not http(s) URLs', () {
      for (final bad in ['api.example.in', 'ftp://api.example.in', 'https://']) {
        expect(() => resolveServerUrl(defined: bad, debug: true), throwsA(isA<ServerConfigError>()), reason: bad);
      }
    });

    test('tests (debug, no define) get the local API', () {
      expect(defaultServerUrl, debugServerUrl);
    });
  });

  testWidgets('a misbuilt release shows why it cannot start', (tester) async {
    await tester.pumpWidget(ServerConfigErrorApp(error: ServerConfigError('no server address')));
    expect(find.textContaining('no server address'), findsOneWidget);
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
