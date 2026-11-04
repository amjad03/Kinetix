import 'dart:convert';
import 'dart:io';
import 'dart:ui' show PlatformDispatcher;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

KxMobileStrings strings() => KxMobileStrings(
  updateRequiredTitle: 'Update needed',
  updateRequiredBody: 'This version no longer works.',
  updateAvailable: 'A new version is ready',
  update: 'Update',
  later: 'Later',
  offlineBanner: 'Offline: showing saved data',
  notificationSettings: 'Notifications',
  notificationSettingsHint: 'Hint',
  quietHours: 'Quiet hours',
  quietHoursHint: 'Pushes wait',
  quietFrom: 'From',
  quietTo: 'To',
  save: 'Save',
  saved: 'Saved',
  loadFailed: 'Could not load',
  retry: 'Retry',
  kindLabel: (k) => 'kind:$k',
  pendingWrites: (n) => '$n waiting',
);

void main() {
  group('refresh token', () {
    test('rotates once for requests that fail together, and keeps the new pair', () async {
      var calls = 0;
      final client = MockClient((r) async {
        calls++;
        expect(r.url.path, '/v1/auth/refresh');
        expect(r.headers['x-zynetix-client'], 'mobile');
        expect(jsonDecode(r.body), {'refreshToken': 'r1'});
        return http.Response(jsonEncode({'accessToken': 'a2', 'refreshToken': 'r2', 'expiresAt': '2026-11-05T08:00:00.000Z'}), 200);
      });
      final f = KxTokenRefresher(client)..refreshToken = 'r1';
      String? kept;
      f.onRotated = (a, r) => kept = '$a/$r';
      final both = await Future.wait([f.refresh('http://h'), f.refresh('http://h')]);
      expect(both, ['a2', 'a2']);
      expect(calls, 1);
      expect(kept, 'a2/r2');
      expect(f.refreshToken, 'r2');
      expect(f.expiresAt, DateTime.utc(2026, 11, 5, 8));
    });

    test('a refused refresh token is dropped (sign in again); a race keeps it', () async {
      final refused = KxTokenRefresher(MockClient((_) async => http.Response('{"code":"REFRESH_REUSED"}', 401)))..refreshToken = 'r1';
      expect(await refused.refresh('http://h'), isNull);
      expect(refused.refreshToken, isNull);
      final race = KxTokenRefresher(MockClient((_) async => http.Response('{"code":"REFRESH_RACE"}', 409)))..refreshToken = 'r1';
      expect(await race.refresh('http://h'), isNull);
      expect(race.refreshToken, 'r1');
      expect(await KxTokenRefresher(MockClient((_) async => throw 'x')).refresh('http://h'), isNull);
    });

    test('wipes every file under the given folders', () async {
      final d = await Directory.systemTemp.createTemp('kxwipe');
      await File('${d.path}/a.json').writeAsString('x');
      await Directory('${d.path}/lessons').create();
      await File('${d.path}/lessons/b.pdf').writeAsString('y');
      await kxWipeLocalFiles([d, Directory('${d.path}/missing')]);
      expect(d.listSync(), isEmpty);
      await d.delete();
    });
  });

  group('version gate', () {
    Widget gate(KxVersionCheck? r, {void Function(String)? open}) => MaterialApp(
      home: KxVersionGate(check: () async => r, strings: (_) => strings(), openStore: open, child: const Scaffold(body: Text('home'))),
    );

    testWidgets('below the minimum only the update screen shows, with the store link', (t) async {
      String? opened;
      await t.pumpWidget(gate(const KxVersionCheck(status: 'update_required', storeUrl: 'https://play.google.com/x'), open: (u) => opened = u));
      await t.pump();
      expect(find.byKey(const Key('forced-update')), findsOneWidget);
      expect(find.text('home'), findsNothing);
      await t.tap(find.text('Update'));
      expect(opened, 'https://play.google.com/x');
    });

    testWidgets('a newer version shows a banner that can be dismissed', (t) async {
      await t.pumpWidget(gate(const KxVersionCheck(status: 'update_available')));
      await t.pump();
      expect(find.byKey(const Key('update-banner')), findsOneWidget);
      expect(find.text('home'), findsOneWidget);
      await t.tap(find.text('Later'));
      await t.pump();
      expect(find.byKey(const Key('update-banner')), findsNothing);
    });

    testWidgets('ok or no answer: just the app', (t) async {
      await t.pumpWidget(gate(null));
      await t.pump();
      expect(find.text('home'), findsOneWidget);
      expect(find.byKey(const Key('update-banner')), findsNothing);
    });

    test('asks the public check with app, platform and version', () async {
      final c = MockClient((r) async {
        expect(r.url.path, '/v1/public/app-versions/check');
        expect(r.url.queryParameters, {'app': 'teacher', 'platform': 'android', 'version': '0.1.0'});
        return http.Response(jsonEncode({'status': 'update_required', 'minVersion': '0.2.0', 'latestVersion': '0.2.0', 'storeUrl': '', 'message': ''}), 200);
      });
      final r = await kxCheckVersion(c, 'http://h', app: 'teacher', version: '0.1.0', platform: 'android');
      expect(r!.required, isTrue);
      expect(await kxCheckVersion(MockClient((_) async => throw 'offline'), 'http://h', app: 'teacher', version: '0.1.0'), isNull);
    });
  });

  group('crash reports', () {
    test('scrubs emails, tokens, ids, numbers and query strings', () {
      final s = kxScrubCrashText(
        'asha@college.in failed GET /v1/x?phone=9845012345 Bearer abc.def id 1b4e28ba-2fa1-11d2-883f-0016d3cca427 call +91 98450 12345 eyJhbGciOi.eyJzdWIi.sig',
      );
      expect(s, isNot(contains('asha@')));
      expect(s, isNot(contains('9845012345')));
      expect(s, isNot(contains('98450 12345')));
      expect(s, isNot(contains('1b4e28ba')));
      expect(s, isNot(contains('eyJ')));
      expect(s, isNot(contains('abc.def')));
      expect(s, contains('<email>'));
    });

    test('sends one report per error with the app and version, never the person', () async {
      final sent = <Map<String, Object?>>[];
      final r = KxCrashReporter(app: 'parent', appVersion: '0.1.0', platform: 'android', osVersion: 'Android 14', send: (b) async => sent.add(b))..tenant = () => 'soundarya';
      await r.report(StateError('bad state for ravi@x.in'), StackTrace.fromString('#0 main (file.dart:1)'), kind: 'flutter');
      await r.report(StateError('bad state for ravi@x.in'), StackTrace.fromString('#0 main (file.dart:1)'), kind: 'flutter');
      expect(sent, hasLength(1));
      expect(sent.single, containsPair('app', 'parent'));
      expect(sent.single, containsPair('appVersion', '0.1.0'));
      expect(sent.single, containsPair('tenant', 'soundarya'));
      expect(sent.single['message'], isNot(contains('ravi@')));
    });

    testWidgets('installs FlutterError.onError and PlatformDispatcher.onError, keeping the old handler', (t) async {
      final sent = <Map<String, Object?>>[];
      final oldFlutter = FlutterError.onError;
      final oldPlatform = PlatformDispatcher.instance.onError;
      var previousCalled = false;
      FlutterError.onError = (_) => previousCalled = true;
      KxCrashReporter(app: 'teacher', appVersion: '0.1.0', platform: 'android', osVersion: '', send: (b) async => sent.add(b)).install();
      FlutterError.onError!(FlutterErrorDetails(exception: Exception('boom'), stack: StackTrace.empty));
      PlatformDispatcher.instance.onError!(Exception('async boom'), StackTrace.empty);
      await t.pump();
      FlutterError.onError = oldFlutter;
      PlatformDispatcher.instance.onError = oldPlatform;
      expect(previousCalled, isTrue);
      expect([for (final s in sent) s['kind']], ['flutter', 'platform']);
      expect(sent.last['fatal'], isTrue);
    });
  });

  group('notification settings', () {
    testWidgets('turns a kind off, sets quiet hours and saves', (t) async {
      KxNotificationPrefs? saved;
      await t.pumpWidget(
        MaterialApp(
          home: KxNotificationSettingsScreen(
            strings: strings(),
            kinds: const ['absence', 'fee'],
            load: () async => const KxNotificationPrefs(kinds: ['absence', 'fee', 'payslip'], pushOff: {}),
            save: (p) async => saved = p,
          ),
        ),
      );
      await t.pumpAndSettle();
      expect(find.text('kind:absence'), findsOneWidget);
      expect(find.text('kind:payslip'), findsNothing, reason: 'only the kinds this app receives');
      await t.tap(find.byKey(const Key('kind-fee')));
      await t.tap(find.byKey(const Key('quiet-hours')));
      await t.pump();
      expect(find.text('21:00'), findsOneWidget);
      await t.tap(find.byKey(const Key('prefs-save')));
      await t.pumpAndSettle();
      expect(saved!.toJson(), {'pushOff': ['fee'], 'quietStart': '21:00', 'quietEnd': '07:00'});
      expect(find.text('Saved'), findsOneWidget);
    });

    testWidgets('shows a retry when loading fails', (t) async {
      var n = 0;
      await t.pumpWidget(
        MaterialApp(
          home: KxNotificationSettingsScreen(
            strings: strings(),
            load: () async => n++ == 0 ? throw 'offline' : const KxNotificationPrefs(kinds: ['absence'], pushOff: {'absence'}, quietStart: '22:00', quietEnd: '06:30'),
            save: (p) async => p,
          ),
        ),
      );
      await t.pumpAndSettle();
      await t.tap(find.text('Retry'));
      await t.pumpAndSettle();
      expect(find.text('22:00'), findsOneWidget);
      expect(t.widget<SwitchListTile>(find.byKey(const Key('kind-absence'))).value, isFalse);
    });
  });

  group('offline', () {
    test('read cache keeps the last answer per path', () async {
      final d = await Directory.systemTemp.createTemp('kxcache');
      final c = KxReadCache(() async => d);
      await c.put('/v1/me', '{"id":1}');
      expect(await c.get('/v1/me'), '{"id":1}');
      expect(await c.get('/v1/other'), isNull);
      await d.delete(recursive: true);
    });

    test('write queue survives a restart, sends in order, keeps offline writes and drops refused ones', () async {
      final d = await Directory.systemTemp.createTemp('kxqueue');
      final f = File('${d.path}/q.json');
      var online = false;
      final sent = <String>[];
      final rejected = <String>[];
      KxWriteQueue q0() => KxWriteQueue(
        file: () async => f,
        send: (w) async {
          if (!online) throw const KxSendFailure(offline: true);
          if (w.path.contains('bad')) throw const KxSendFailure(offline: false, status: 409);
          sent.add(w.path);
        },
        onRejected: (w, _) => rejected.add(w.path),
      );
      final q = q0();
      await q.add('POST', '/v1/attendance/a', {'x': 1});
      await q.add('POST', '/v1/marks/bad', {'x': 2});
      await q.add('POST', '/v1/attendance/a', {'x': 3}); // replaces the first
      await q.add('POST', '/v1/marks/b', {'x': 4});
      expect(await q.flush(), 0);
      expect(q.pending.value, hasLength(3));
      // The app restarts: the queue comes back from the file.
      final again = q0();
      online = true;
      expect(await again.flush(), 2);
      expect(sent, ['/v1/attendance/a', '/v1/marks/b']);
      expect(rejected, ['/v1/marks/bad']);
      expect(again.pending.value, isEmpty);
      await d.delete(recursive: true);
    });

    testWidgets('offline banner shows while offline and counts waiting writes', (t) async {
      final off = ValueNotifier(true);
      final q = KxWriteQueue(file: () async => null, send: (_) async {});
      await q.add('POST', '/a', null);
      await t.pumpWidget(MaterialApp(home: Scaffold(body: KxOfflineBanner(offline: off, text: 'Offline', pending: q.pending, pendingText: (n) => '$n waiting'))));
      expect(find.text('Offline'), findsOneWidget);
      expect(find.text('1 waiting'), findsOneWidget);
      off.value = false;
      await q.flush();
      await t.pump();
      expect(find.text('Offline'), findsNothing);
      expect(find.text('1 waiting'), findsNothing);
    });
  });

  group('accessibility at 320 dp and text scale 2.0', () {
    Future<void> small(WidgetTester t, Widget home) async {
      t.view.physicalSize = const Size(320, 640);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      await t.pumpWidget(MaterialApp(builder: (c, child) => MediaQuery(data: MediaQuery.of(c).copyWith(textScaler: const TextScaler.linear(2)), child: child!), home: home));
      await t.pumpAndSettle();
      expect(t.takeException(), isNull, reason: 'no overflow');
      await expectLater(t, meetsGuideline(androidTapTargetGuideline));
      await expectLater(t, meetsGuideline(labeledTapTargetGuideline));
    }

    testWidgets('notification settings', (t) async {
      await small(
        t,
        KxNotificationSettingsScreen(
          strings: strings(),
          load: () async => const KxNotificationPrefs(kinds: ['absence', 'fee'], pushOff: {}, quietStart: '22:00', quietEnd: '06:00'),
          save: (p) async => p,
        ),
      );
    });

    testWidgets('forced update and the update banner', (t) async {
      await small(t, KxVersionGate(check: () async => const KxVersionCheck(status: 'update_required', storeUrl: 'https://x'), strings: (_) => strings(), openStore: (_) {}, child: const SizedBox()));
      await small(t, KxVersionGate(key: const Key('b'), check: () async => const KxVersionCheck(status: 'update_available', storeUrl: 'https://x'), strings: (_) => strings(), openStore: (_) {}, child: const Scaffold()));
    });
  });

  testWidgets('secure screen turns FLAG_SECURE on while open and off after the last one closes', (t) async {
    final calls = <Object?>[];
    t.binding.defaultBinaryMessenger.setMockMethodCallHandler(kSecureScreenChannel, (c) async {
      calls.add('${c.method}:${c.arguments}');
      return null;
    });
    final show = ValueNotifier(2);
    await t.pumpWidget(
      MaterialApp(
        home: ValueListenableBuilder<int>(
          valueListenable: show,
          builder: (_, n, _) => Column(children: [for (var i = 0; i < n; i++) const KxSecureScreen(child: Text('payslip'))]),
        ),
      ),
    );
    expect(calls, ['setSecure:true']);
    show.value = 1;
    await t.pump();
    expect(calls, ['setSecure:true']);
    show.value = 0;
    await t.pump();
    expect(calls, ['setSecure:true', 'setSecure:false']);
    expect(KxSecureScreen.depth, 0);
    t.binding.defaultBinaryMessenger.setMockMethodCallHandler(kSecureScreenChannel, null);
  });
}
