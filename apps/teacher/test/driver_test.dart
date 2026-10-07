import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/core/api.dart';
import 'package:kinetix_teacher/core/models.dart';
import 'package:kinetix_teacher/features/driver/driver_screen.dart';
import 'package:kinetix_teacher/features/driver/location.dart';
import 'package:kinetix_teacher/features/driver/trip_controller.dart';

import 'fake_api.dart';
import 'helpers.dart';

class FakeLocation implements LocationSource {
  LocationAccess access = LocationAccess.granted;
  final controller = StreamController<GeoFix>.broadcast(sync: true);

  @override
  Future<LocationAccess> ensureAccess() async => access;

  @override
  Stream<GeoFix> fixes() => controller.stream;
}

class FakeAwake implements ScreenAwake {
  bool on = false;

  @override
  Future<void> enable() async => on = true;

  @override
  Future<void> disable() async => on = false;
}

void main() {
  group('models', () {
    test('parses the driver home with stops in order and a running trip', () {
      final h = DriverHome.fromJson({
        'routes': [
          {
            'id': 'r1',
            'name': 'R',
            'regNo': 'KA01',
            'stops': [
              {'id': 'b', 'name': 'B', 'seq': 2, 'lat': 1, 'lng': 2, 'pickupTime': '07:30:00'},
              {'id': 'a', 'name': 'A', 'seq': 1, 'lat': 1.5, 'lng': 2.5},
            ],
          },
        ],
        'trip': {'id': 't1', 'routeId': 'r1', 'direction': 'drop', 'status': 'running'},
      });
      expect(h.routes.single.stops.map((s) => s.id), ['a', 'b']);
      expect(h.routes.single.ordered(TripDirection.drop).map((s) => s.id), ['b', 'a']);
      expect(h.routes.single.stops.last.pickupLabel, '07:30');
      expect(h.trip!.direction, TripDirection.drop);
      expect(h.trip!.running, isTrue);
      expect(DriverHome.fromJson({'routes': [], 'trip': null}).trip, isNull);
    });

    test('an unknown role does not break parsing', () {
      final me = Me.fromJson({
        'id': 'u',
        'fullName': 'D',
        'preferredLanguage': 'en',
        'roles': ['driver', 'something_new'],
        'tenant': {'name': 'T'},
      });
      expect(me.roles, contains('driver'));
    });
  });

  group('PingThrottle', () {
    test('lets one through per interval', () {
      final t = PingThrottle(every: const Duration(seconds: 5));
      final t0 = DateTime(2026, 10, 8, 7);
      expect(t.shouldSend(t0), isTrue);
      expect(t.shouldSend(t0.add(const Duration(seconds: 1))), isFalse);
      expect(t.shouldSend(t0.add(const Duration(milliseconds: 4999))), isFalse);
      expect(t.shouldSend(t0.add(const Duration(seconds: 5))), isTrue);
      expect(t.shouldSend(t0.add(const Duration(seconds: 6))), isFalse);
      t.reset();
      expect(t.shouldSend(t0.add(const Duration(seconds: 6))), isTrue);
    });
  });

  group('TripController', () {
    late FakeTeacherApi api;
    late FakeLocation loc;
    late FakeAwake awake;
    late DateTime clock;
    late TripController c;

    setUp(() {
      api = FakeTeacherApi();
      loc = FakeLocation();
      awake = FakeAwake();
      clock = DateTime(2026, 10, 8, 7);
      c = TripController(api: api, location: loc, awake: awake, now: () => clock);
    });
    tearDown(() => c.dispose());

    DriverRoute route() => api.driverData.routes.first;
    GeoFix fix(double lat, double lng, [double? v]) => GeoFix(lat: lat, lng: lng, speedKmh: v);

    test('starts a trip, throttles pings to one per 5 s and keeps the screen awake', () async {
      await c.start(route(), TripDirection.pickup);
      expect(c.running, isTrue);
      expect(awake.on, isTrue);
      expect(api.calls, contains('start trip r1 pickup'));
      loc.controller.add(fix(12.9, 77.6, 30));
      await pumpEventQueue();
      clock = clock.add(const Duration(seconds: 2));
      loc.controller.add(fix(12.901, 77.6, 31));
      await pumpEventQueue();
      expect(api.positions.length, 1);
      clock = clock.add(const Duration(seconds: 3));
      loc.controller.add(fix(12.902, 77.6, 32));
      await pumpEventQueue();
      expect(api.positions.map((p) => p.$4), [30, 32]);
      expect(api.positions.first.$1, 'trip1');
      expect(c.lastSentAt, clock);
    });

    test('keeps going after a transient error', () async {
      await c.start(route(), TripDirection.pickup);
      api.positionError = ApiException(0, 'offline', kind: ApiErrorKind.offline);
      loc.controller.add(fix(12.9, 77.6));
      await pumpEventQueue();
      expect(c.sendFailing, isTrue);
      expect(c.running, isTrue);
      api.positionError = null;
      clock = clock.add(const Duration(seconds: 5));
      loc.controller.add(fix(12.9, 77.6));
      await pumpEventQueue();
      expect(c.sendFailing, isFalse);
      expect(api.positions.length, 1);
    });

    test('stops when the server says the trip has ended', () async {
      await c.start(route(), TripDirection.pickup);
      api.positionError = ApiException(409, 'This trip has ended');
      loc.controller.add(fix(12.9, 77.6));
      await pumpEventQueue();
      expect(c.phase, TripPhase.ended);
      expect(awake.on, isFalse);
    });

    test('ticks off stops as the bus reaches them, per direction', () async {
      await c.start(route(), TripDirection.pickup);
      expect(c.nextStops.map((s) => s.id), ['s1', 's2', 's3']);
      loc.controller.add(fix(12.96, 77.63));
      await pumpEventQueue();
      expect(c.nextStops.map((s) => s.id), ['s2', 's3']);
      await c.end();
      expect(c.phase, TripPhase.ended);
      expect(api.calls, contains('end trip trip1'));
      expect(awake.on, isFalse);

      final drop = TripController(api: api, location: loc, awake: awake, now: () => clock);
      await drop.start(route(), TripDirection.drop);
      expect(drop.nextStops.map((s) => s.id), ['s3', 's2', 's1']);
      drop.dispose();
    });

    test('does not start without location permission', () async {
      loc.access = LocationAccess.denied;
      await c.start(route(), TripDirection.pickup);
      expect(c.running, isFalse);
      expect(c.locationDenied, isTrue);
      expect(api.calls.where((x) => x.startsWith('start trip')), isEmpty);
    });
  });

  group('DriverScreen', () {
    late FakeTeacherApi api;
    late FakeLocation loc;
    late FakeAwake awake;

    setUp(() {
      api = FakeTeacherApi();
      loc = FakeLocation();
      awake = FakeAwake();
    });

    Future<void> pumpScreen(WidgetTester tester) async {
      phone(tester);
      await tester.pumpWidget(localizedApp(home: DriverScreen(api: api, location: loc, awake: awake)));
      await tester.pumpAndSettle();
    }

    testWidgets('choose route and direction, start, see next stops, end', (tester) async {
      await pumpScreen(tester);
      expect(find.text('Route 4 · Indiranagar'), findsOneWidget);
      await tester.tap(find.text('Drop (home)'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('driverStart')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('start trip r1 drop'));
      expect(find.byKey(const Key('driverRunning')), findsOneWidget);
      expect(find.text('Waiting for GPS...'), findsOneWidget);
      // Drop run: the college gate is the first stop.
      expect(find.byKey(const Key('driverStop-s3')), findsOneWidget);
      loc.controller.add(const GeoFix(lat: 12.98, lng: 77.65, speedKmh: 20));
      await tester.pumpAndSettle();
      expect(api.positions.length, 1);
      expect(find.byKey(const Key('driverStop-s3')), findsNothing);
      expect(find.textContaining('Location sent at'), findsOneWidget);

      await tester.ensureVisible(find.byKey(const Key('driverEnd'))); // below the stop list on a phone
      await tester.tap(find.byKey(const Key('driverEnd')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('end trip trip1'));
      expect(find.byKey(const Key('driverEnded')), findsOneWidget);
      expect(find.byKey(const Key('driverStart')), findsOneWidget);
    });

    testWidgets('a trip already running is picked up again', (tester) async {
      api.driverData =
          DriverHome(routes: api.driverData.routes, trip: const DriverTrip(id: 'trip9', routeId: 'r1', direction: TripDirection.pickup));
      await pumpScreen(tester);
      expect(find.byKey(const Key('driverRunning')), findsOneWidget);
      loc.controller.add(const GeoFix(lat: 12.9, lng: 77.6));
      await tester.pumpAndSettle();
      expect(api.positions.single.$1, 'trip9');
    });

    testWidgets('says so when no route is assigned, and when location is denied', (tester) async {
      api.driverData = const DriverHome(routes: []);
      await pumpScreen(tester);
      expect(find.byKey(const Key('driverNoRoutes')), findsOneWidget);

      api = FakeTeacherApi();
      loc.access = LocationAccess.denied;
      await tester.pumpWidget(const SizedBox()); // a fresh screen, not the one above with no routes loaded
      await pumpScreen(tester);
      await tester.ensureVisible(find.byKey(const Key('driverStart')));
      await tester.tap(find.byKey(const Key('driverStart')));
      await tester.pumpAndSettle();
      expect(find.textContaining('Location permission is needed'), findsOneWidget);
      expect(find.byKey(const Key('driverRunning')), findsNothing);
    });

    testWidgets('in Hindi', (tester) async {
      phone(tester);
      await tester.pumpWidget(localizedApp(language: 'hi', home: DriverScreen(api: api, location: loc, awake: awake)));
      await tester.pumpAndSettle();
      expect(find.text(strings('hi').driverStart), findsOneWidget);
    });
  });

  testWidgets('Profile shows Driver mode only for logins with the driver role', (tester) async {
    Future<void> openProfile(FakeTeacherApi api) async {
      phone(tester);
      await pumpApp(tester, api, prefs: {'token': 'tok'});
      await tapAndSettle(tester, find.byKey(const Key('profileButton')));
      await tester.scrollUntilVisible(find.byKey(const Key('openCalendar')), 200, scrollable: find.byType(Scrollable).last);
    }

    final plain = FakeTeacherApi();
    seed(plain);
    await openProfile(plain);
    expect(find.byKey(const Key('openDriver')), findsNothing);

    final driver = FakeTeacherApi();
    seed(driver);
    driver.profile = Me(id: 'u2', fullName: 'Ravi', roles: ['driver'], preferredLanguage: 'en', institution: 'Demo College');
    await tester.pumpWidget(const SizedBox());
    await openProfile(driver);
    await tester.scrollUntilVisible(find.byKey(const Key('openDriver')), 200, scrollable: find.byType(Scrollable).last);
    expect(find.text('Driver mode'), findsOneWidget);
  });
}
