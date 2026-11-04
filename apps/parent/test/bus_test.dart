import 'package:flutter/material.dart';
import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_parent/core/models.dart';
import 'package:zynetix_parent/core/realtime.dart';
import 'package:zynetix_parent/features/transport/bus_map.dart';
import 'package:zynetix_parent/features/transport/bus_screen.dart';
import 'package:zynetix_parent/l10n/app_localizations.dart';

import 'fake_api.dart';
import 'helpers.dart';

Map<String, dynamic> _json({Map<String, dynamic>? bus}) => {
      'assigned': true,
      'routeId': 'r1',
      'routeName': 'Route 4',
      'regNo': 'KA01AB1234',
      'stopId': 's2',
      'stopName': 'Defence Colony',
      'stopLat': 12.97,
      'stopLng': 77.64,
      'pickupTime': '07:30:00',
      'stops': [
        {'id': 's1', 'name': 'First', 'seq': 1, 'lat': 12.96, 'lng': 77.63},
        {'id': 's2', 'name': 'Defence Colony', 'seq': 2, 'lat': 12.97, 'lng': 77.64},
        {'id': 's3', 'name': 'Gate', 'seq': 3, 'lat': 12.98, 'lng': 77.65},
      ],
      'bus': bus,
    };

BusPositionEvent _event(
        {String routeId = 'r1', String? next = 's1', int seq = 1, int? eta = 6, double lat = 12.955, double lng = 77.625}) =>
    BusPositionEvent.fromJson({
      'tripId': 't1',
      'routeId': routeId,
      'lat': lat,
      'lng': lng,
      'speedKmh': 30,
      'nextStop': next == null ? null : {'id': next, 'name': 'x', 'seq': seq},
      'etaMinutes': eta,
      'at': '2026-10-08T01:00:00.000Z',
    });

void main() {
  final en = lookupAppLocalizations(const Locale('en'));
  final hi = lookupAppLocalizations(const Locale('hi'));

  group('models', () {
    test('parses an unassigned child', () {
      expect(StudentBus.fromJson({'assigned': false}).assigned, isFalse);
    });

    test('parses the seat and the running bus', () {
      final b = StudentBus.fromJson(
          _json(bus: {'tripId': 't1', 'lat': 12.95, 'lng': 77.6, 'speedKmh': null, 'at': null, 'etaMinutes': 7, 'stopsAway': 2}));
      expect(b.routeName, 'Route 4');
      expect(b.pickupTime!.label, '07:30');
      expect(b.stops.map((s) => s.seq), [1, 2, 3]);
      expect(b.bus!.etaMinutes, 7);
      expect(b.bus!.stopsAway, 2);
      expect(StudentBus.fromJson(_json()).bus, isNull);
    });

    test('a position event updates the ETA and stops away for this route only', () {
      final b = StudentBus.fromJson(_json());
      final moved = b.withEvent(_event());
      expect(moved.bus!.lat, 12.955);
      expect(moved.bus!.stopsAway, 1);
      expect(moved.bus!.etaMinutes, greaterThanOrEqualTo(1));
      expect(identical(b.withEvent(_event(routeId: 'other')), b), isTrue);
      // The next stop is the child's own: the server's ETA is used.
      final near = b.withEvent(_event(next: 's2', seq: 2, eta: 3));
      expect((near.bus!.etaMinutes, near.bus!.stopsAway), (3, 0));
      // Past the last stop.
      expect(b.withEvent(_event(next: null)).bus!.etaMinutes, isNull);
    });

    test('notification kinds transport and hostel', () {
      AppNotification n(String k) =>
          AppNotification.fromJson({'id': 'n', 'kind': k, 'title': 't', 'body': '', 'data': {}, 'createdAt': '2026-10-08T01:00:00Z'});
      expect(n('transport').kind, NotificationKind.transport);
      expect(n('hostel').kind, NotificationKind.hostel);
    });

    test('the transport.position payload is parsed', () {
      final e = _event();
      expect((e.routeId, e.nextStopId, e.nextStopSeq, e.etaMinutes), ('r1', 's1', 1, 6));
      expect(etaMinutesFor(1000, 30), 2);
      expect(etaMinutesFor(10, 0), 1);
      expect(etaMinutesFor(5000, null), 15);
    });
  });

  group('eta text', () {
    test('minutes, stops away, passed, not running', () {
      final running = StudentBus.fromJson(_json(bus: {'tripId': 't', 'lat': 1, 'lng': 1, 'etaMinutes': 7, 'stopsAway': 2}));
      expect(busEtaText(en, running), 'Arriving in 7 min');
      expect(busStopsText(en, running), '2 stops away');
      final one = StudentBus.fromJson(_json(bus: {'tripId': 't', 'lat': 1, 'lng': 1, 'etaMinutes': 1, 'stopsAway': 1}));
      expect(busEtaText(en, one), 'Arriving in 1 min');
      expect(busStopsText(en, one), '1 stop away');
      final passed = StudentBus.fromJson(_json(bus: {'tripId': 't', 'lat': 1, 'lng': 1, 'etaMinutes': null, 'stopsAway': 0}));
      expect(busEtaText(en, passed), 'The bus has passed this stop.');
      expect(busStopsText(en, passed), isNull);
      expect(busEtaText(en, StudentBus.fromJson(_json())), isNull);
      expect(busEtaText(hi, running), '7 मिनट में पहुँचेगी');
    });
  });

  group('screen', () {
    setUp(() => BusScreen.defaultMapBuilder =
        (context, data) => Text('map ${data.stops.length} stops, bus ${data.bus != null}', key: const Key('fakeMap')));
    tearDown(() => BusScreen.defaultMapBuilder = OsmBusMap.builder);

    Future<void> openBus(WidgetTester tester) async {
      await tester.scrollUntilVisible(find.byKey(const Key('busCard')), 200, scrollable: find.byType(Scrollable).first);
      await tester.tap(find.byKey(const Key('busCard')));
      await tester.pumpAndSettle();
    }

    testWidgets('shows the seat and a no-bus-running state', (tester) async {
      final (api, _) = await pumpApp(tester);
      await openBus(tester);
      expect(api.calls, contains('bus c1'));
      expect(find.text("Aarav's bus"), findsOneWidget);
      expect(find.text('Route 4 · Indiranagar'), findsOneWidget);
      expect(find.text('07:30'), findsOneWidget);
      expect(find.byKey(const Key('busNotRunning')), findsOneWidget);
      expect(find.byKey(const Key('fakeMap')), findsOneWidget);
    });

    testWidgets('a child without a bus says so', (tester) async {
      await pumpApp(tester, setup: (api) => api.buses = {});
      await openBus(tester);
      expect(find.byKey(const Key('busNone')), findsOneWidget);
    });

    testWidgets('live positions move the bus and update the ETA', (tester) async {
      final server = FakeRealtimeServer();
      await pumpApp(tester, realtime: server);
      await openBus(tester);
      expect(find.byKey(const Key('busEta')), findsNothing);
      server.connections.first.send(RealtimeBusPosition(_event(routeId: 'r1', next: 's2', seq: 2, eta: 4)));
      await tester.pumpAndSettle();
      expect(find.text('Arriving in 4 min'), findsOneWidget);
      expect(find.text('Next stop is Defence Colony'), findsOneWidget);
      expect(find.text('map 3 stops, bus true'), findsOneWidget);
      // Another route's bus is ignored.
      server.connections.first.send(RealtimeBusPosition(_event(routeId: 'zzz', next: 's2', seq: 2, eta: 9)));
      await tester.pumpAndSettle();
      expect(find.text('Arriving in 4 min'), findsOneWidget);
    });

    testWidgets('tapping a transport notification opens the bus screen', (tester) async {
      await pumpApp(tester, setup: (api) {
        api.inbox.insert(
          0,
          AppNotification(
              id: 'nb',
              kind: NotificationKind.transport,
              title: 'Bus arriving',
              body: 'Defence Colony',
              data: {'studentId': 'c1'},
              createdAt: DateTime.now()),
        );
      });
      await tester.tap(find.text('Updates'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('notification-nb')));
      await tester.pumpAndSettle();
      expect(find.text("Aarav's bus"), findsOneWidget);
    });
  });

  group('pass, fee, crew and today', () {
    Map<String, dynamic> full({bool valid = true, int due = 0, int overdue = 0}) => {
          ..._json(bus: {'tripId': 't1', 'lat': 12.95, 'lng': 77.6, 'speedKmh': 20, 'at': null, 'etaMinutes': 9, 'stopsAway': 1, 'lateMinutes': 14}),
          'dropTime': '16:20',
          'crew': {'driver': 'Manjunath Urs', 'driverPhone': '+919000022001', 'attendant': 'Pushpa', 'attendantPhone': null},
          'today': [
            {'kind': 'board', 'at': '2026-11-04T01:52:00.000Z', 'method': 'qr', 'direction': 'pickup', 'stopName': 'Defence Colony'},
          ],
          'pass': {'seatId': 'a1', 'from': '2026-08-03', 'until': valid ? '2027-08-03' : '2026-10-01', 'valid': valid, 'pdf': '/v1/transport/passes/c1.pdf'},
          'fee': {'duePaise': due, 'overduePaise': overdue, 'nextDueOn': due > 0 ? '2026-11-10' : null, 'paidPaise': 0},
        };

    test('parses the crew, today, the pass and the fee, and keeps them through a live position', () {
      final b = StudentBus.fromJson(full(due: 230000));
      expect((b.details.driver, b.details.driverPhone, b.details.attendant), ('Manjunath Urs', '+919000022001', 'Pushpa'));
      expect(b.details.dropTime!.label, '16:20');
      expect(b.details.today.single.kind, 'board');
      expect((b.details.passValid, b.details.passUntil, b.details.feeDuePaise), (true, '2027-08-03', 230000));
      expect(b.bus!.lateMinutes, 14);
      final moved = b.withEvent(BusPositionEvent.fromJson({'tripId': 't1', 'routeId': 'r1', 'lat': 12.96, 'lng': 77.63, 'nextStop': {'id': 's2', 'name': 'x', 'seq': 2}, 'etaMinutes': 2, 'lateMinutes': 6}));
      expect(moved.bus!.lateMinutes, 6);
      expect(identical(moved.details, b.details), isTrue);
    });

    Future<FakeParentApi> pumpScreen(WidgetTester tester, Map<String, dynamic> json, {Locale locale = const Locale('en'), List<String>? opened, List<String>? dialled}) async {
      final api = FakeParentApi()..buses = {'c1': StudentBus.fromJson(json)};
      await tester.pumpWidget(MaterialApp(
        locale: locale,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: BusScreen(
          api: api,
          child: Child(id: 'c1', fullName: 'Aarav Rao', rollNo: '1', sectionId: 'sec1', sectionName: '5A'),
          positions: const Stream.empty(),
          mapBuilder: (context, data) => const SizedBox(key: Key('fakeMap')),
          openFile: (bytes, name, mime) async {
            opened?.add(name);
            return true;
          },
          call: (phone) async {
            dialled?.add(phone);
            return true;
          },
        ),
      ));
      await tester.pumpAndSettle();
      return api;
    }

    testWidgets('shows lateness, today on the bus, the crew, the pass and the fee; opens the pass and calls the driver', (tester) async {
      final opened = <String>[];
      final dialled = <String>[];
      final api = await pumpScreen(tester, full(due: 230000), opened: opened, dialled: dialled);
      expect(find.text('Running about 14 min late'), findsOneWidget);
      expect(find.byKey(const Key('busToday')), findsOneWidget);
      expect(find.textContaining('Defence Colony · Bus pass QR'), findsOneWidget);
      await tester.scrollUntilVisible(find.byKey(const Key('busCallDriver')), 200, scrollable: find.byType(Scrollable).first);
      expect(find.text('16:20'), findsOneWidget);
      expect(find.text('Manjunath Urs'), findsOneWidget);
      expect(find.byKey(const Key('busCallAttendant')), findsNothing); // no phone for the attendant
      await tester.scrollUntilVisible(find.byKey(const Key('busPassOpen')), 200, scrollable: find.byType(Scrollable).first);
      expect(find.textContaining('Valid until'), findsOneWidget);
      expect(find.textContaining('₹2,300 due'), findsOneWidget);
      await tester.tap(find.byKey(const Key('busPassOpen')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('busPassPdf c1'));
      expect(opened, ['bus-pass.pdf']);
      await tester.scrollUntilVisible(find.byKey(const Key('busCallDriver')), -100, scrollable: find.byType(Scrollable).first);
      await tester.tap(find.byKey(const Key('busCallDriver')));
      expect(dialled, ['+919000022001']);
    });

    testWidgets('an expired pass, an overdue fee and nothing marked today, in Kannada', (tester) async {
      final j = full(valid: false, due: 180000, overdue: 180000)..['today'] = <Object>[];
      await pumpScreen(tester, j, locale: const Locale('kn'));
      expect(find.text('ಇಂದು ಇನ್ನೂ ಬಸ್‌ನಲ್ಲಿ ದಾಖಲಾಗಿಲ್ಲ'), findsOneWidget);
      await tester.scrollUntilVisible(find.byKey(const Key('busFee')), 200, scrollable: find.byType(Scrollable).first);
      expect(find.textContaining('ಮುಗಿದಿದೆ'), findsOneWidget);
      expect(find.textContaining('ಅವಧಿ ಮೀರಿದೆ'), findsOneWidget);
    });
  });
}
