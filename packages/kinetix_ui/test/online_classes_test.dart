import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

Widget _app(Widget child, {Locale locale = const Locale('en')}) => MaterialApp(
  theme: KinetixTheme.light(),
  locale: locale,
  supportedLocales: const [Locale('en'), Locale('hi'), Locale('kn')],
  localizationsDelegates: GlobalMaterialLocalizations.delegates,
  home: Scaffold(body: child),
);

final _soon = OnlineClass(id: 'm1', topic: 'Doubt-clearing session', provider: 'meet', startsAt: DateTime(2026, 10, 12, 18), durationMin: 60, joinUrl: 'https://meet.google.com/abc-defg-hij');

void main() {
  group('OnlineClassesCard', () {
    testWidgets('shows each class with Join and Copy, in the app language', (tester) async {
      OnlineClass? joined;
      OnlineClass? copied;
      await tester.pumpWidget(_app(OnlineClassesCard(classes: [_soon], now: DateTime(2026, 10, 12, 18, 10), onJoin: (c) => joined = c, onCopy: (c) => copied = c)));
      expect(find.text('Doubt-clearing session'), findsOneWidget);
      expect(find.textContaining('Live now'), findsOneWidget);
      await tester.tap(find.byKey(const Key('join-m1')));
      await tester.tap(find.byKey(const Key('copy-m1')));
      expect(joined?.joinUrl, 'https://meet.google.com/abc-defg-hij');
      expect(copied?.id, 'm1');

      await tester.pumpWidget(_app(OnlineClassesCard(classes: [_soon], onJoin: (_) {}), locale: const Locale('hi')));
      expect(find.text('ऑनलाइन कक्षाएँ'), findsOneWidget);
      await tester.pumpWidget(_app(OnlineClassesCard(classes: [_soon], onJoin: (_) {}), locale: const Locale('kn')));
      expect(find.text('ಆನ್‌ಲೈನ್ ತರಗತಿಗಳು'), findsOneWidget);
    });

    testWidgets('shows nothing with no classes', (tester) async {
      await tester.pumpWidget(_app(OnlineClassesCard(classes: const [], onJoin: (_) {})));
      expect(find.byKey(const Key('onlineClassesCard')), findsNothing);
    });
  });

  test('a class is open from five minutes before to the end', () {
    expect(_soon.isOpen(DateTime(2026, 10, 12, 17, 54)), isFalse);
    expect(_soon.isOpen(DateTime(2026, 10, 12, 17, 56)), isTrue);
    expect(_soon.isOpen(DateTime(2026, 10, 12, 19, 1)), isFalse);
  });

  group('OnlineApi', () {
    test('reads the classes for the signed-in person or the board', () async {
      final paths = <String>[];
      final client = MockClient((r) async {
        paths.add(r.url.path);
        expect(r.headers['authorization'], 'Bearer tok');
        return http.Response(jsonEncode([{'id': 'm1', 'topic': 'T', 'provider': 'zoom', 'startsAt': '2026-10-12T12:30:00.000Z', 'durationMin': 45, 'joinUrl': 'https://zoom.us/j/1'}]), 200);
      });
      final api = OnlineApi(baseUrl: 'http://x', token: 'tok', client: client);
      expect((await api.classes()).single.joinUrl, 'https://zoom.us/j/1');
      await api.classes(board: true);
      expect(paths, ['/v1/connectors/video/mine', '/v1/connectors/video/board']);
    });

    test('single sign-on opens the browser, then polls until the session is ready', () async {
      String? poll;
      var polls = 0;
      final client = MockClient((r) async {
        final body = jsonDecode(r.body) as Map<String, dynamic>;
        if (r.url.path.endsWith('/start')) {
          poll = body['pollId'] as String;
          expect(RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$').hasMatch(poll!), isTrue);
          return http.Response(jsonEncode({'authorizationUrl': 'https://idp.example/auth?x=1'}), 201);
        }
        expect(body['ticket'], poll);
        return ++polls < 3 ? http.Response('{}', 401) : http.Response(jsonEncode({'accessToken': 'session-token'}), 201);
      });
      Uri? opened;
      final token = await OnlineApi(baseUrl: 'http://x', client: client).ssoSignIn(tenant: 'soundarya', every: Duration.zero, open: (u) async {
        opened = u;
        return true;
      });
      expect(token, 'session-token');
      expect(opened.toString(), 'https://idp.example/auth?x=1');
      expect(polls, 3);
    });

    test('single sign-on gives up when the browser cannot open or nobody finishes', () async {
      final client = MockClient((r) async => r.url.path.endsWith('/start') ? http.Response(jsonEncode({'authorizationUrl': 'https://idp.example'}), 201) : http.Response('{}', 401));
      expect(await OnlineApi(baseUrl: 'http://x', client: client).ssoSignIn(tenant: 't', open: (_) async => false), isNull);
      expect(await OnlineApi(baseUrl: 'http://x', client: client).ssoSignIn(tenant: 't', every: Duration.zero, tries: 3, open: (_) async => true), isNull);
    });
  });
}
