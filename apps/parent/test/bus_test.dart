import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_parent/core/models.dart';
import 'package:kinetix_parent/core/realtime.dart';
import 'package:kinetix_parent/features/transport/bus_map.dart';
import 'package:kinetix_parent/features/transport/bus_screen.dart';
import 'package:kinetix_parent/l10n/app_localizations.dart';

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
}
