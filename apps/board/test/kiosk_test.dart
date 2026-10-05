import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/device_store.dart';
import 'package:kinetix_board/core/kiosk/kiosk_controller.dart';
import 'package:kinetix_board/core/kiosk/kiosk_pin.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/core/realtime.dart';
import 'package:kinetix_board/core/secret_store.dart';
import 'package:kinetix_board/features/kiosk/kiosk_ui.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';

// Kiosk mode (docs/hardware/kiosk-mode.md).

/// Android behind the `kinetix/kiosk` channel, as MainActivity.kt answers it.
class FakeAndroid {
  FakeAndroid({this.deviceOwner = false});

  bool deviceOwner;
  String lockTask = 'none';
  bool bootLaunch = false;
  final calls = <MethodCall>[];

  static const channel = MethodChannel('kinetix/kiosk');

  void install() => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async {
    calls.add(call);
    switch (call.method) {
      case 'enter':
        lockTask = deviceOwner ? 'locked' : 'pinned';
        bootLaunch = true;
      case 'exit':
        lockTask = 'none';
        bootLaunch = (call.arguments as Map)['keepBootLaunch'] as bool;
      case 'openSystemSettings':
        return null;
    }
    return {'deviceOwner': deviceOwner, 'lockTask': lockTask};
  });

  List<String> get methods => [for (final c in calls) c.method];
}

/// The IT PIN "482915" as the API hashes it (PBKDF2-SHA256, 20 000 rounds; computed with Node's crypto).
const _salt = 'a2luZXRpeC1raW9zay1zYWx0';
const _apiPin = KioskPin(algo: 'pbkdf2-sha256', iterations: 20000, salt: _salt, hash: 'F79FNLySQ/V9UdMrd/zeSP6MlSPXjf8ak/m6x6MQysY=');

/// "1234" with fewer rounds, so the tests stay fast.
const _pin = KioskPin(algo: 'pbkdf2-sha256', iterations: 1000, salt: _salt, hash: 'hXfqFdNDpqTYE76aELz8Tlc7AwAZnuTisp+enlG6eLc=');
const _on = KioskPolicy(enabled: true, pin: _pin);

class _NoRealtime extends Realtime {
  _NoRealtime() : super('http://test');
  @override
  void connect(String token) {}
  @override
  void dispose() {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadBoardFonts);
  late FakeAndroid android;
  late List<bool> immersive;
  late DateTime now;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    android = FakeAndroid()..install();
    immersive = [];
    now = DateTime(2026, 10, 5, 10);
  });

  KioskController kiosk({Duration leaveFor = const Duration(minutes: 10)}) => KioskController(
    platform: MethodChannelKioskPlatform(android: true, immersive: (on) async => immersive.add(on)),
    store: DeviceStore(secrets: MemorySecretStore()),
    now: () => now,
    leaveFor: leaveFor,
  );

  Future<void> cache(KioskPolicy p) async => (await SharedPreferences.getInstance()).setString('setting.kioskPolicy', jsonEncode(p.toJson()));

  group('PIN hash', () {
    test('matches what the API stores (Node PBKDF2)', () async {
      expect(await verifyKioskPin('482915', _apiPin), isTrue);
      expect(await verifyKioskPin('482916', _apiPin), isFalse);
      expect(verifyKioskPinSync('1234', _pin), isTrue);
    });

    test('rejects parameters it does not understand', () {
      expect(verifyKioskPinSync('1234', const KioskPin(algo: 'md5', iterations: 1000, salt: _salt, hash: 'hXfqFdNDpqTYE76aELz8Tlc7AwAZnuTisp+enlG6eLc=')), isFalse);
      expect(verifyKioskPinSync('1234', const KioskPin(algo: 'pbkdf2-sha256', iterations: 0, salt: _salt, hash: 'AA==')), isFalse);
      expect(verifyKioskPinSync('1234', const KioskPin(algo: 'pbkdf2-sha256', iterations: 10, salt: '%%', hash: 'AA==')), isFalse);
    });

    test('reads the board config the API sends', () {
      final p = KioskPolicy.fromConfig({'enabled': true, 'algo': 'pbkdf2-sha256', 'iterations': 20000, 'pinSalt': _salt, 'pinHash': _apiPin.hash});
      expect(p.enabled, isTrue);
      expect(p.pin!.toJson(), _apiPin.toJson());
      expect(KioskPolicy.fromConfig({'enabled': false, 'algo': null, 'iterations': null, 'pinSalt': null, 'pinHash': null}).pin, isNull);
    });
  });

  group('platform channel', () {
    test('a device owner is locked fully, in immersive full screen', () async {
      android.deviceOwner = true;
      final p = MethodChannelKioskPlatform(android: true, immersive: (on) async => immersive.add(on));
      expect(await p.status(), const KioskStatus(deviceOwner: true, lock: KioskLock.none));
      expect(await p.enter(), const KioskStatus(deviceOwner: true, lock: KioskLock.locked));
      expect(await p.exit(keepBootLaunch: false), const KioskStatus(deviceOwner: true, lock: KioskLock.none));
      expect(android.calls.last.arguments, {'keepBootLaunch': false});
      expect(immersive, [true, false]);
    });

    test('elsewhere, or without the channel, kiosk mode is unsupported', () async {
      expect(await MethodChannelKioskPlatform(android: false).enter(), KioskStatus.unsupported);
      expect(android.calls, isEmpty);
      final missing = MethodChannelKioskPlatform(android: true, channel: const MethodChannel('kinetix/none'), immersive: (_) async {});
      expect(await missing.status(), KioskStatus.unsupported);
    });
  });

  group('KioskController', () {
    test('enters kiosk mode at start when the cached policy says so (screen pinning without device owner)', () async {
      await cache(_on);
      final k = kiosk();
      await k.start();
      expect(android.methods, ['status', 'enter']);
      expect(k.status.lock, KioskLock.pinned);
      expect(android.bootLaunch, isTrue);
      expect(immersive, [true]);
    });

    test('as device owner it locks fully', () async {
      android.deviceOwner = true;
      await cache(_on);
      final k = kiosk();
      await k.start();
      expect(k.status, const KioskStatus(deviceOwner: true, lock: KioskLock.locked));
    });

    test('a board that never heard from an institution is not locked', () async {
      final k = kiosk();
      await k.start();
      expect(android.methods, ['status']);
      expect(k.active, isFalse);
    });

    test('never in demo builds, even with a policy; "Try kiosk" pins and stops', () async {
      await cache(_on);
      final k = kiosk();
      await k.start(demo: true);
      expect(android.methods, ['status']);
      await k.applyPolicy(_on);
      expect(android.methods, ['status']);

      await k.tryPinning();
      expect(k.status.lock, KioskLock.pinned);
      await k.stopTrial();
      expect(k.status.lock, KioskLock.none);
      expect(android.bootLaunch, isFalse, reason: 'a tester’s phone must not relaunch the board after a reboot');
    });

    test('a policy from the institution is applied and kept for offline starts', () async {
      final k = kiosk();
      await k.start();
      await k.applyPolicy(_on);
      expect(k.status.lock, KioskLock.pinned);

      // Restarted with no network: the cached policy locks it again and the PIN still works.
      android.lockTask = 'none';
      android.calls.clear();
      final offline = kiosk();
      await offline.start();
      expect(android.methods, ['status', 'enter']);
      expect(offline.pinSet, isTrue);
      expect((await offline.checkPin('1234')).check, PinCheck.ok);
    });

    test('turned off in the ERP: the board unlocks and no longer opens after a reboot', () async {
      await cache(_on);
      final k = kiosk();
      await k.start();
      await k.applyPolicy(const KioskPolicy(enabled: false, pin: _pin));
      expect(android.calls.last.method, 'exit');
      expect(android.bootLaunch, isFalse);
      expect(k.active, isFalse);
    });

    test('IT leaves with the PIN for 10 minutes; the board still relaunches after a reboot', () async {
      await cache(_on);
      final k = kiosk();
      await k.start();
      expect(() => k.leave(), throwsStateError);
      expect((await k.checkPin('1234')).check, PinCheck.ok);
      await k.leave();
      expect(k.active, isFalse);
      expect(k.pausedUntil, now.add(const Duration(minutes: 10)));
      expect(android.calls.last.arguments, {'keepBootLaunch': true});
      expect(android.bootLaunch, isTrue);
      // One PIN, one exit.
      expect(() => k.leave(), throwsStateError);
      k.dispose();
    });

    test('opening Android settings needs the PIN and leaves kiosk mode first', () async {
      await cache(_on);
      final k = kiosk();
      await k.start();
      expect(() => k.openSystemSettings(), throwsStateError);
      await k.checkPin('1234');
      await k.openSystemSettings();
      expect(android.methods.sublist(android.methods.length - 2), ['exit', 'openSystemSettings']);
      k.dispose();
    });

    test('locks again by itself when the time is up', () async {
      await cache(_on);
      final k = kiosk(leaveFor: const Duration(milliseconds: 50));
      await k.start();
      await k.checkPin('1234');
      await k.leave();
      expect(k.active, isFalse);
      await Future<void>.delayed(const Duration(milliseconds: 120));
      expect(k.active, isTrue);
      expect(k.paused, isFalse);
      expect(android.methods.last, 'enter');
    });

    test('a pause does not survive a restart', () async {
      await cache(_on);
      final k = kiosk();
      await k.start();
      await k.checkPin('1234');
      await k.leave();
      k.dispose();
      final restarted = kiosk();
      await restarted.start();
      expect(restarted.active, isTrue);
    });

    test('5 wrong PINs lock the PIN out for 5 minutes, also after a restart', () async {
      await cache(_on);
      final k = kiosk();
      await k.start();
      for (var left = 4; left >= 1; left--) {
        final r = await k.checkPin('0000');
        expect((r.check, r.attemptsLeft), (PinCheck.wrong, left));
      }
      final fifth = await k.checkPin('0000');
      expect(fifth.check, PinCheck.lockedOut);
      expect(fifth.lockedUntil, now.add(const Duration(minutes: 5)));
      expect((await k.checkPin('1234')).check, PinCheck.lockedOut, reason: 'not even the right PIN while locked out');
      expect(() => k.leave(), throwsStateError);

      final restarted = kiosk();
      await restarted.start();
      expect(restarted.isLockedOut, isTrue);
      expect((await restarted.checkPin('1234')).check, PinCheck.lockedOut);

      now = now.add(const Duration(minutes: 5, seconds: 1));
      expect((await restarted.checkPin('1234')).check, PinCheck.ok);
      expect(restarted.failures, 0);
    });

    test('without a PIN set it still locks, and says the PIN must be set in the ERP', () async {
      await cache(const KioskPolicy(enabled: true));
      final k = kiosk();
      await k.start();
      expect(k.active, isTrue);
      expect((await k.checkPin('1234')).check, PinCheck.noPin);
      expect(() => k.leave(), throwsStateError);
    });

    test('locks again when the app comes back after the user unpinned it', () async {
      await cache(_on);
      final k = kiosk();
      await k.start();
      android.lockTask = 'none'; // unpinned with Back + Overview
      await k.refresh();
      expect(android.methods.last, 'enter');
      expect(k.active, isTrue);
    });

    test('Windows (no kiosk API): nothing is called and the status says unsupported', () async {
      await cache(_on);
      final k = KioskController(platform: MethodChannelKioskPlatform(android: false), store: DeviceStore(secrets: MemorySecretStore()));
      await k.start();
      expect(k.supported, isFalse);
      expect(android.calls, isEmpty);
    });
  });

  test('the board fetches the policy after enrolment and applies it', () async {
    final requests = <String>[];
    final client = MockClient((req) async {
      requests.add('${req.method} ${req.url.path} ${req.headers['authorization']}');
      return switch (req.url.path) {
        '/v1/devices/enroll' => http.Response(jsonEncode({'deviceToken': 'dev', 'device': {'name': 'Room 204 Board'}}), 201),
        '/v1/devices/me/config' => http.Response(
          jsonEncode({'kiosk': {'enabled': true, 'algo': 'pbkdf2-sha256', 'iterations': 1000, 'pinSalt': _salt, 'pinHash': _pin.hash}}),
          200,
        ),
        _ => http.Response('{}', 404),
      };
    });
    final store = DeviceStore(secrets: MemorySecretStore());
    final k = KioskController(platform: MethodChannelKioskPlatform(android: true, immersive: (_) async {}), store: store);
    final board = BoardController(
      store: store,
      apiFactory: (url) => ApiClient(baseUrl: url, client: client),
      realtimeFactory: (_) => _NoRealtime(),
      outboxStore: MemoryOutboxStore(),
      kiosk: k,
    );
    await board.start();
    expect(k.active, isFalse, reason: 'not enrolled yet');
    await board.enroll('http://cloud', 'KX-AAAA-BBBB');
    await Future<void>.delayed(Duration.zero);
    await pumpEventQueue();
    expect(requests, contains('GET /v1/devices/me/config Bearer dev'));
    expect(k.active, isTrue);
    expect(k.pinSet, isTrue);
    expect((await SharedPreferences.getInstance()).getString('setting.kioskPolicy'), contains(_pin.hash));
  });

  group('exit dialog', () {
    Future<KioskController> pump(WidgetTester tester, {KioskPolicy? policy = _on, bool demo = false, FakeKioskPlatform? platform, Locale? locale}) async {
      // Plugins answer outside the fake clock.
      if (policy != null) await tester.runAsync(() => cache(policy));
      // Made and started on the real clock: its futures belong to the zone it was made in.
      final k = (await tester.runAsync(() async {
        final k = KioskController(
          platform: platform ?? FakeKioskPlatform(),
          store: DeviceStore(secrets: MemorySecretStore()),
          verify: (pin, p) async => verifyKioskPinSync(pin, p),
        );
        await k.start(demo: demo);
        return k;
      }))!;
      await tester.pumpWidget(
        MaterialApp(
          locale: locale,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(
            body: SingleChildScrollView(
              child: Column(
                children: [
                  KioskExitGesture(kiosk: k, child: const SizedBox(width: 200, height: 40, child: Text('10:30 am', key: Key('clock')))),
                  KioskSettingsSection(kiosk: k),
                ],
              ),
            ),
          ),
        ),
      );
      return k;
    }

    Future<void> hold(WidgetTester tester, Duration d) async {
      final g = await tester.startGesture(tester.getCenter(find.byKey(const Key('clock'))));
      await tester.pump(d);
      await g.up();
      await tester.pumpAndSettle();
    }

    testWidgets('opens only after holding for 3 seconds; the right PIN leaves for 10 minutes', (tester) async {
      final platform = FakeKioskPlatform();
      final k = await pump(tester, platform: platform);
      expect(k.active, isTrue);
      expect(find.byKey(const Key('kiosk-status')), findsOneWidget);
      expect(find.text('On: screen pinning. For a full lock, make KINETIX Board the device owner (see the kiosk guide).'), findsOneWidget);

      await hold(tester, const Duration(seconds: 1));
      expect(find.byKey(const Key('kiosk-dialog')), findsNothing);
      await hold(tester, const Duration(milliseconds: 3100));
      expect(find.byKey(const Key('kiosk-dialog')), findsOneWidget);

      await tester.enterText(find.byKey(const Key('kiosk-pin')), '9999');
      await tester.tap(find.byKey(const Key('kiosk-unlock')));
      await tester.pumpAndSettle();
      expect(find.text('Wrong PIN. 4 attempts left.'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('kiosk-pin')), '1234');
      await tester.tap(find.byKey(const Key('kiosk-unlock')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('kiosk-open-settings')), findsOneWidget);
      await tester.runAsync(() async {
        await tester.tap(find.byKey(const Key('kiosk-leave')));
        await Future<void>.delayed(const Duration(milliseconds: 20));
      });
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('kiosk-dialog')), findsNothing);
      expect(platform.lock, KioskLock.none);
      expect(platform.bootLaunch, isTrue);
      expect(find.textContaining('Paused by IT until'), findsOneWidget);

      // Holding again offers to lock now.
      await hold(tester, const Duration(milliseconds: 3100));
      await tester.runAsync(() async {
        await tester.tap(find.byKey(const Key('kiosk-lock-now')));
        await Future<void>.delayed(const Duration(milliseconds: 20));
      });
      await tester.pumpAndSettle();
      expect(platform.lock, KioskLock.pinned);
      k.dispose();
    });

    for (final lang in ['en', 'hi', 'kn']) {
      for (final size in const [Size(360, 640), Size(390, 844), Size(844, 390)]) {
        testWidgets('fits a phone: $lang at ${size.width.toInt()}×${size.height.toInt()}', (tester) async {
          tester.view.physicalSize = size;
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.reset);
          await pump(tester, locale: Locale(lang));
          expect(tester.takeException(), isNull, reason: 'settings');
          await hold(tester, const Duration(milliseconds: 3100));
          expect(find.byKey(const Key('kiosk-dialog')), findsOneWidget);
          await tester.enterText(find.byKey(const Key('kiosk-pin')), '9999');
          await tester.tap(find.byKey(const Key('kiosk-unlock')));
          await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull, reason: 'wrong PIN');
          await tester.enterText(find.byKey(const Key('kiosk-pin')), '1234');
          await tester.tap(find.byKey(const Key('kiosk-unlock')));
          await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
          await tester.pumpAndSettle();
          expect(find.byKey(const Key('kiosk-open-settings')).hitTestable(), findsOneWidget);
          expect(tester.takeException(), isNull, reason: 'unlocked');
        });
      }
    }

    testWidgets('without a PIN it explains that the PIN is set in the ERP', (tester) async {
      await pump(tester, policy: const KioskPolicy(enabled: true));
      await hold(tester, const Duration(milliseconds: 3100));
      expect(find.byKey(const Key('kiosk-no-pin')), findsOneWidget);
      expect(find.textContaining('KINETIX ERP → Settings → Board kiosk mode'), findsOneWidget);
      expect(find.byKey(const Key('kiosk-pin')), findsNothing);
    });

    testWidgets('does nothing while kiosk mode is off', (tester) async {
      await pump(tester, policy: const KioskPolicy(enabled: false, pin: _pin));
      await hold(tester, const Duration(milliseconds: 3100));
      expect(find.byKey(const Key('kiosk-dialog')), findsNothing);
      expect(find.text('Off'), findsOneWidget);
    });

    testWidgets('demo builds: not locked, and "Try kiosk" pins the screen from settings', (tester) async {
      final platform = FakeKioskPlatform();
      final k = await pump(tester, demo: true, platform: platform);
      expect(platform.lock, KioskLock.none);
      expect(find.textContaining('Demo builds never lock this device'), findsOneWidget);
      await tester.runAsync(() async {
        await tester.tap(find.byKey(const Key('kiosk-try')));
        await Future<void>.delayed(const Duration(milliseconds: 20));
      });
      await tester.pumpAndSettle();
      expect(platform.lock, KioskLock.pinned);
      expect(k.trial, isTrue);

      // The exit gesture needs no PIN in a demo.
      await hold(tester, const Duration(milliseconds: 3100));
      expect(find.text('This is a demo build: kiosk mode is off and no PIN is needed.'), findsOneWidget);
      await tester.runAsync(() async {
        await tester.tap(find.byKey(const Key('kiosk-stop-trial')).last);
        await Future<void>.delayed(const Duration(milliseconds: 20));
      });
      await tester.pumpAndSettle();
      expect(platform.lock, KioskLock.none);
      expect(platform.bootLaunch, isFalse);
    });
  });
}
