import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/core/server_config.dart';

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

    test('release builds without the define fail instead of using localhost', () {
      expect(
        () => resolveServerUrl(defined: '', debug: false),
        throwsA(isA<ServerConfigError>().having((e) => e.message, 'message', contains('KINETIX_API_URL'))),
      );
    });

    test('demo builds (KINETIX_DEMO) need no server address, even in release', () {
      expect(resolveServerUrl(defined: '', debug: false, demo: true), demoServerUrl);
      expect(resolveServerUrl(defined: 'https://api.example.in', debug: false, demo: true), demoServerUrl);
      expect(() => resolveServerUrl(defined: '', debug: false, demo: false), throwsA(isA<ServerConfigError>()));
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
