import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/kiosk/kiosk_pin.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/core/realtime.dart';
import 'package:kinetix_board/core/secret_store.dart';
import 'package:kinetix_board/features/profiles/profile_boards.dart';
import 'package:kinetix_board/features/profiles/profiles_controller.dart';
import 'package:kinetix_board/features/profiles/profiles_ui.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';

class _NoRealtime extends Realtime {
  _NoRealtime() : super('http://test');
  @override
  void connect(String token) {}
  @override
  void dispose() {}
}

/// A PIN hash as the API sends it (few iterations, so the tests stay fast).
Map<String, dynamic> _pinParts(String pin) {
  final salt = List<int>.generate(16, (i) => i * 7);
  return {'algo': 'pbkdf2-sha256', 'iterations': 1000, 'salt': base64.encode(salt), 'hash': base64.encode(pbkdf2Sha256(utf8.encode(pin), salt, 1000, 32))};
}

Map<String, dynamic> _session(String id, String teacher, String name, {Duration left = const Duration(minutes: 40)}) => {
  'sessionId': id,
  'expiresAt': DateTime.now().add(left).toUtc().toIso8601String(),
  'teacher': {'id': teacher, 'fullName': name, 'preferredLanguage': 'en'},
  'section': {'displayName': 'Class 8 B', 'term': 8, 'level': 'k12'},
  'subject': {'name': 'Science'},
  'period': null,
};

/// The API's side of shared-board profiles: two teachers with PINs 4829 and 7351, five wrong
/// PINs lock a profile.
class _Server {
  bool offline = false;
  final wrong = <String, int>{};
  final requests = <String>[];
  var sessions = 0;
  final profiles = <Map<String, dynamic>>[
    {'userId': 't1', 'name': 'Anita Sharma', 'language': 'en', 'pinSet': true, 'locked': false, 'pin': _pinParts('4829')},
    {'userId': 't2', 'name': 'Ravi Kumar', 'language': 'kn', 'pinSet': true, 'locked': false, 'pin': _pinParts('7351')},
    {'userId': 't3', 'name': 'Meena Rao', 'language': 'hi', 'pinSet': false, 'locked': false, 'pin': null},
  ];
  static const pins = {'t1': '4829', 't2': '7351'};

  late final client = MockClient((req) async {
    requests.add('${req.method} ${req.url.path}');
    if (req.url.path == '/v1/devices/enroll') return http.Response('{"deviceToken": "dev", "device": {"name": "Room 8 Board"}}', 201);
    if (offline) throw http.ClientException('Network is unreachable');
    final path = req.url.path;
    if (path == '/v1/devices/me/profiles') return http.Response(jsonEncode(profiles), 200);
    if (path == '/v1/devices/me/profiles/me/pin') {
      final pin = (jsonDecode(req.body) as Map)['pin'] as String;
      if (pin == '1234') return http.Response(jsonEncode({'message': 'Choose a PIN that is harder to guess', 'code': 'PROFILE_PIN_WEAK'}), 400);
      return http.Response(jsonEncode({'userId': 't3', 'pinSet': true, 'pin': _pinParts(pin)}), 200);
    }
    final unlock = RegExp(r'^/v1/devices/me/profiles/(\w+)/unlock$').firstMatch(path);
    if (unlock != null) {
      final id = unlock.group(1)!;
      final pin = (jsonDecode(req.body) as Map)['pin'];
      if ((wrong[id] ?? 0) >= 5) return http.Response(jsonEncode({'message': 'Too many wrong PINs', 'code': 'PROFILE_LOCKED'}), 403);
      if (pins[id] == null) return http.Response(jsonEncode({'message': 'No PIN', 'code': 'PROFILE_NO_PIN'}), 404);
      if (pin != pins[id]) {
        wrong[id] = (wrong[id] ?? 0) + 1;
        if (wrong[id]! >= 5) return http.Response(jsonEncode({'message': 'Too many wrong PINs', 'code': 'PROFILE_LOCKED'}), 403);
        return http.Response(jsonEncode({'message': 'Wrong PIN', 'code': 'PROFILE_PIN_WRONG', 'attemptsLeft': 5 - wrong[id]!}), 401);
      }
      wrong.remove(id);
      final name = profiles.firstWhere((p) => p['userId'] == id)['name'] as String;
      return http.Response(jsonEncode({'sessionToken': 'token-$id-${++sessions}', 'session': _session('s$id-$sessions', id, name)}), 200);
    }
    return http.Response('[]', 200);
  });
}

void main() {
  late _Server server;
  late MemorySecretStore secrets;

  Future<BoardController> enrolled() async {
    server = _Server();
    secrets = MemorySecretStore();
    final board = BoardController(
      apiFactory: (url) => ApiClient(baseUrl: url, client: server.client),
      realtimeFactory: (_) => _NoRealtime(),
      outboxStore: MemoryOutboxStore(),
      profileSecrets: secrets,
    );
    await board.enroll('http://test', 'KX-AAAA-BBBB');
    await board.profiles.start();
    // start() fetches in the background.
    await board.profiles.refresh();
    return board;
  }

  BoardProfile profile(BoardController b, String id) => b.profiles.profileOf(id)!;

  setUpAll(loadBoardFonts);
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('Switching teacher with a PIN', () {
    test('the board keeps its teachers, with what it needs to check PINs offline', () async {
      final board = await enrolled();
      addTearDown(board.dispose);
      expect(board.profiles.profiles.map((p) => p.name), ['Anita Sharma', 'Ravi Kumar', 'Meena Rao']);
      expect(profile(board, 't1').pin, isNotNull);
      expect(profile(board, 't3').pinSet, isFalse);
      // Kept for next time.
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('setting.profiles'), contains('Ravi Kumar'));
      expect(prefs.getString('setting.profiles'), isNot(contains('4829')));
    });

    test('a PIN opens the teacher\'s class; switching teacher keeps each one\'s board', () async {
      final board = await enrolled();
      addTearDown(board.dispose);
      final switches = <(String?, String?)>[];
      board.profiles.onSwitch = (from, to) async => switches.add((from, to));

      var r = await board.profiles.unlock(profile(board, 't1'), '4829');
      expect(r.outcome, UnlockOutcome.ok);
      expect(board.session!.teacherName, 'Anita Sharma');
      expect(board.api!.sessionToken, 'token-t1-1');
      expect(server.requests, contains('POST /v1/devices/me/profiles/t1/unlock'));

      r = await board.profiles.unlock(profile(board, 't2'), '7351');
      expect(r.outcome, UnlockOutcome.ok);
      expect(board.session!.teacherId, 't2');
      expect(switches, [(null, 't1'), ('t1', 't2')]);

      // Each teacher's session is kept in secure storage, not in plain preferences.
      expect(secrets.values.keys, containsAll(['profile.session.t1', 'profile.session.t2']));
      expect((await SharedPreferences.getInstance()).getKeys().any((k) => k.contains('session')), isFalse);
    });

    test('wrong PINs count down and the fifth locks the profile', () async {
      final board = await enrolled();
      addTearDown(board.dispose);
      for (var left = 4; left >= 1; left--) {
        final r = await board.profiles.unlock(profile(board, 't1'), '1111');
        expect(r.outcome, UnlockOutcome.wrong);
        expect(r.attemptsLeft, left);
      }
      final r = await board.profiles.unlock(profile(board, 't1'), '1111');
      expect(r.outcome, UnlockOutcome.lockedOut);
      expect(profile(board, 't1').locked, isTrue);
      expect(profile(board, 't1').pin, isNull, reason: 'a locked profile cannot be opened offline either');
      expect((await board.profiles.unlock(profile(board, 't1'), '4829')).outcome, UnlockOutcome.lockedOut);
      expect(board.session, isNull);
    });

    test('a teacher without a PIN is sent to the Teacher app', () async {
      final board = await enrolled();
      addTearDown(board.dispose);
      expect((await board.profiles.unlock(profile(board, 't3'), '4829')).outcome, UnlockOutcome.noPin);
    });

    test('offline: the cached hash checks the PIN and the teacher\'s open class comes back', () async {
      final board = await enrolled();
      addTearDown(board.dispose);
      expect((await board.profiles.unlock(profile(board, 't1'), '4829')).outcome, UnlockOutcome.ok);
      expect((await board.profiles.unlock(profile(board, 't2'), '7351')).outcome, UnlockOutcome.ok);

      server.offline = true;
      var r = await board.profiles.unlock(profile(board, 't1'), '0000');
      expect(r.outcome, UnlockOutcome.wrong);
      expect(r.attemptsLeft, 4);
      r = await board.profiles.unlock(profile(board, 't1'), '4829');
      expect(r.outcome, UnlockOutcome.ok);
      expect(board.session!.teacherId, 't1');
      expect(board.session!.sessionId, 'st1-1');
      expect(board.api!.sessionToken, 'token-t1-1');
    });

    test('offline: no class kept for the teacher means it needs the network; five wrong PINs lock', () async {
      final board = await enrolled();
      addTearDown(board.dispose);
      server.offline = true;
      expect((await board.profiles.unlock(profile(board, 't2'), '7351')).outcome, UnlockOutcome.needsNetwork);
      for (var i = 0; i < 4; i++) {
        expect((await board.profiles.unlock(profile(board, 't2'), '9999')).outcome, UnlockOutcome.wrong);
      }
      expect((await board.profiles.unlock(profile(board, 't2'), '9999')).outcome, UnlockOutcome.lockedOut);
      // Also with the right PIN, also after the board restarts (the count is kept).
      expect((await board.profiles.unlock(profile(board, 't2'), '7351')).outcome, UnlockOutcome.lockedOut);
      expect((await SharedPreferences.getInstance()).getString('setting.profileFailures'), contains('"t2":5'));
    });

    test('a teacher signed in with the Teacher app sets a PIN; a guessable one is refused', () async {
      final board = await enrolled();
      addTearDown(board.dispose);
      board.onPaired('paired-token', SessionContext.fromJson(_session('s9', 't3', 'Meena Rao')));
      await Future<void>.delayed(Duration.zero);
      expect(board.profiles.canSetPin, isTrue);
      await expectLater(board.profiles.setPin('1234'), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'PROFILE_PIN_WEAK')));
      await board.profiles.setPin('2468');
      expect(profile(board, 't3').pinSet, isTrue);
      expect(await verifyKioskPin('2468', profile(board, 't3').pin!), isTrue);
    });

    test('each teacher keeps their own settings; the board gets its own back', () async {
      final board = await enrolled();
      addTearDown(board.dispose);
      expect(board.layout, BoardLayout.rails);
      await board.profiles.unlock(profile(board, 't1'), '4829');
      await pumpEventQueue();
      board.setLayout(BoardLayout.bottomBar);
      board.setInputMode(InputMode.pen);
      await board.endClass();
      await pumpEventQueue();
      expect(board.layout, BoardLayout.rails, reason: 'the board\'s own');
      expect(board.inputMode, InputMode.auto);

      await board.profiles.unlock(profile(board, 't2'), '7351');
      await pumpEventQueue();
      expect(board.layout, BoardLayout.rails, reason: 'Ravi has not changed it');

      await board.profiles.unlock(profile(board, 't1'), '4829');
      await pumpEventQueue();
      expect(board.layout, BoardLayout.bottomBar);
      expect(board.inputMode, InputMode.pen);
    });
  });

  test('switching keeps one whiteboard per teacher', () async {
    final store = MemoryProfileBoardStore();
    final wb = WhiteboardController();
    addTearDown(wb.dispose);
    const canvas = Size(1920, 1080);
    wb.insert([MathElement(id: 'a', position: Offset.zero, latex: 'x^2', color: Colors.black, fontSize: 40, size: const Size(80, 40))]);
    await switchProfileBoard(wb, canvas, store, 't1', 't2');
    expect(wb.elements, isEmpty, reason: 'Ravi starts on a clean board');
    wb.insert([MathElement(id: 'b', position: Offset.zero, latex: 'y', color: Colors.black, fontSize: 40, size: const Size(40, 40))]);
    await switchProfileBoard(wb, canvas, store, 't2', 't1');
    expect(wb.elements.single, isA<MathElement>().having((e) => e.latex, 'latex', 'x^2'));
    await switchProfileBoard(wb, canvas, store, 't1', 't2');
    expect((wb.elements.single as MathElement).latex, 'y');
  });

  group('Lock screen', () {
    Future<BoardController> pump(WidgetTester tester, {Size size = const Size(1920, 1080), Locale? locale}) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final board = await tester.runAsync(enrolled);
      await tester.pumpWidget(
        MaterialApp(
          theme: KinetixTheme.light(),
          locale: locale,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: ProfileLock(board: board!, child: const Scaffold(body: Center(child: Text('the board')))),
        ),
      );
      return board;
    }

    Future<void> typePin(WidgetTester tester, String pin) async {
      for (final d in pin.split('')) {
        await tester.tap(find.byKey(Key('pin-$d')));
        await tester.pump();
      }
      await tester.tap(find.byKey(const Key('pin-ok')));
      // PBKDF2 runs in an isolate.
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
      await tester.pumpAndSettle();
    }

    testWidgets('locks after the idle time and opens with the teacher\'s PIN', (tester) async {
      final board = await pump(tester);
      await tester.runAsync(() => board.profiles.unlock(board.profiles.profileOf('t1')!, '4829'));
      board.profiles.setIdleMinutes(5);
      await tester.pump();
      expect(find.byKey(const Key('profile-lock')), findsNothing);

      await tester.pump(const Duration(minutes: 4));
      await tester.tap(find.text('the board')); // a touch starts the wait again
      await tester.pump(const Duration(minutes: 4));
      expect(find.byKey(const Key('profile-lock')), findsNothing);
      await tester.pump(const Duration(minutes: 2));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('profile-lock')), findsOneWidget);
      expect(find.text('Board locked'), findsOneWidget);
      expect(board.session, isNotNull, reason: 'the class stays open behind the lock');

      await typePin(tester, '1111');
      expect(find.text('Wrong PIN. Tries left: 4'), findsOneWidget);
      await typePin(tester, '4829');
      expect(find.byKey(const Key('profile-lock')), findsNothing);
      expect(board.session!.teacherId, 't1');
      board.dispose();
    });

    testWidgets('"Switch teacher" on the lock screen opens another teacher\'s class', (tester) async {
      final board = await pump(tester);
      await tester.runAsync(() => board.profiles.unlock(board.profiles.profileOf('t1')!, '4829'));
      board.profiles.lock();
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('lock-switch')));
      await tester.pumpAndSettle();
      expect(find.text('Who is teaching?'), findsOneWidget);
      await tester.tap(find.byKey(const Key('profile-t2')));
      await tester.pumpAndSettle();
      expect(find.text('Enter Ravi Kumar\'s PIN'), findsOneWidget);
      await typePin(tester, '7351');
      expect(board.session!.teacherId, 't2');
      expect(find.byKey(const Key('profile-lock')), findsNothing);
      board.dispose();
    });

    for (final lang in ['en', 'hi', 'kn']) {
      for (final size in const [Size(360, 640), Size(390, 844), Size(844, 390)]) {
        testWidgets('the lock screen, the PIN pad, the teachers and Set PIN fit a phone: $lang at ${size.width.toInt()}×${size.height.toInt()}', (tester) async {
          final board = await pump(tester, size: size, locale: Locale(lang));
          await tester.runAsync(() => board.profiles.unlock(board.profiles.profileOf('t1')!, '4829'));
          board.profiles.lock();
          await tester.pumpAndSettle();
          expect(find.byKey(const Key('profile-lock')), findsOneWidget);
          for (final k in ['pin-1', 'pin-0', 'pin-ok', 'pin-delete', 'lock-switch']) {
            await tester.ensureVisible(find.byKey(Key(k)));
            await tester.pumpAndSettle();
            expect(find.byKey(Key(k)).hitTestable(), findsOneWidget, reason: k);
          }
          await typePin(tester, '1111');
          expect(tester.takeException(), isNull, reason: 'wrong PIN');
          await tester.ensureVisible(find.byKey(const Key('lock-switch')));
          await tester.pumpAndSettle();
          await tester.tap(find.byKey(const Key('lock-switch')));
          await tester.pumpAndSettle();
          expect(find.byKey(const Key('profile-t2')).hitTestable(), findsOneWidget);
          expect(tester.takeException(), isNull, reason: 'teachers');
          await tester.tap(find.byKey(const Key('profile-t2')));
          await tester.pumpAndSettle();
          await tester.ensureVisible(find.byKey(const Key('pin-ok')));
          await tester.pumpAndSettle();
          expect(find.byKey(const Key('pin-ok')).hitTestable(), findsOneWidget);
          expect(tester.takeException(), isNull, reason: 'their PIN');

          // Setting a PIN (Meena has none).
          final context = tester.element(find.byKey(const Key('profile-lock')));
          unawaited(showSetPinDialog(context, board.profiles));
          await tester.pumpAndSettle();
          expect(find.byKey(const Key('set-pin')), findsOneWidget);
          expect(tester.takeException(), isNull, reason: 'set PIN');
          board.dispose();
        });
      }
    }
  });
}
