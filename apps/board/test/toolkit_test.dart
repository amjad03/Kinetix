import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/features/remote/board_remote.dart';
import 'package:kinetix_board/features/toolkit/noise_source.dart';
import 'package:kinetix_board/features/toolkit/remote_toolkit.dart';
import 'package:kinetix_board/features/toolkit/toolkit_controller.dart';
import 'package:kinetix_board/features/toolkit/toolkit_layer.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

/// A microphone that reports whatever level the test sends.
class FakeNoise implements NoiseSource {
  FakeNoise({this.problem});
  final NoiseProblem? problem;
  final levels = StreamController<double>.broadcast();
  bool started = false, stopped = false;

  @override
  Future<Stream<double>> start() async {
    if (problem != null) throw NoiseUnavailable(problem!);
    started = true;
    return levels.stream;
  }

  @override
  Future<void> stop() async => stopped = true;
  @override
  Future<void> dispose() async {}
}

/// A clock the test moves by hand.
class FakeClock {
  DateTime now = DateTime(2026, 10, 5, 10);
  void advance(Duration d) => now = now.add(d);
}

List<Student> _class(int n) => [for (var i = 1; i <= n; i++) Student(id: 's$i', rollNo: 'R$i', fullName: 'Student $i')];

void main() {
  group('ToolkitController', () {
    test('the timer counts down by the clock, pauses, adds a minute and rings at zero', () {
      final clock = FakeClock();
      final k = ToolkitController(roster: () => const [], now: () => clock.now);
      var rang = 0;
      k.onTimeUp = () => rang++;
      k.show(ToolkitItem.timer);
      k.setTimer(const Duration(minutes: 1));
      k.startPauseTimer();
      expect(k.timerRunning, isTrue);
      clock.advance(const Duration(seconds: 20));
      expect(k.timerLeft, const Duration(seconds: 40));
      k.startPauseTimer();
      clock.advance(const Duration(minutes: 5));
      expect(k.timerLeft, const Duration(seconds: 40), reason: 'paused');
      k.addTime(const Duration(minutes: 1));
      expect(k.timerLeft, const Duration(seconds: 100));
      expect(k.timerTotal, const Duration(seconds: 100), reason: 'the ring grows to fit');
      k.resetTimer();
      expect(k.timerLeft, const Duration(seconds: 100));
      k.dispose();
      expect(rang, 0);
    });

    testWidgets('the timer rings once when it reaches zero', (tester) async {
      final clock = FakeClock();
      final k = ToolkitController(roster: () => const [], now: () => clock.now);
      var rang = 0;
      k.onTimeUp = () => rang++;
      k.setTimer(const Duration(seconds: 3));
      k.startPauseTimer();
      clock.advance(const Duration(seconds: 4));
      await tester.pump(const Duration(milliseconds: 400));
      expect(k.timerDone, isTrue);
      expect(k.timerRunning, isFalse);
      expect(k.timerLeft, Duration.zero);
      await tester.pump(const Duration(seconds: 1));
      expect(rang, 1);
      k.dispose();
    });

    test('the stopwatch keeps time across pauses and keeps laps, newest first', () {
      final clock = FakeClock();
      final k = ToolkitController(roster: () => const [], now: () => clock.now);
      k.startPauseStopwatch();
      clock.advance(const Duration(seconds: 3));
      k.lap();
      clock.advance(const Duration(seconds: 2));
      k.startPauseStopwatch();
      clock.advance(const Duration(seconds: 30));
      expect(k.stopwatch, const Duration(seconds: 5));
      k.startPauseStopwatch();
      clock.advance(const Duration(seconds: 1));
      k.lap();
      expect(k.laps, [const Duration(seconds: 6), const Duration(seconds: 3)]);
      k.resetStopwatch();
      expect(k.stopwatch, Duration.zero);
      expect(k.laps, isEmpty);
      k.dispose();
    });

    test('the picker picks everyone present once before anyone again', () async {
      final students = _class(4);
      final k = ToolkitController(roster: () => students, random: math.Random(7));
      final seen = <String>{};
      for (var i = 0; i < 4; i++) {
        await k.pick(step: Duration.zero);
        expect(k.rolling, isFalse);
        expect(k.currentStudent, isNotNull);
        seen.add(k.currentStudent!.id);
      }
      expect(seen, {'s1', 's2', 's3', 's4'});
      expect(k.pickedCount, 4);
      await k.pick(step: Duration.zero);
      expect(k.pickedCount, 1, reason: 'a new round starts');
      k.dispose();
    });

    test('with no class open the picker has no one, except on a demo board', () async {
      expect(ToolkitController(roster: () => const []).classList, isEmpty);
      final demo = ToolkitController(roster: () => const [], demo: true);
      expect(demo.classList.map((e) => e.$1), demoClassNames);
      await demo.pick(step: Duration.zero);
      expect(demoClassNames, contains(demo.current));
      expect(demo.currentStudent, isNull);
      // A signed-in demo class uses its own roster.
      final signedIn = ToolkitController(roster: () => _class(2), demo: true);
      expect(signedIn.classList, hasLength(2));
    });

    test('dice: one to four, each 1 to 6', () async {
      final k = ToolkitController(roster: () => const [], random: math.Random(1));
      k.setDiceCount(9);
      expect(k.diceCount, 4);
      k.setDiceCount(0);
      expect(k.diceCount, 1);
      k.setDiceCount(3);
      await k.roll(step: Duration.zero);
      expect(k.dice, hasLength(3));
      expect(k.dice.every((d) => d >= 1 && d <= 6), isTrue);
    });

    test('the spinner lands on the slice under the pointer', () async {
      expect(ToolkitController.sliceAt(0, 4), 0);
      // Turned just past a quarter clockwise: slice 2 has come under the pointer.
      expect(ToolkitController.sliceAt(math.pi / 2 + 0.01, 4), 2);
      expect(ToolkitController.sliceAt(-math.pi / 2 - 0.01, 4), 1);
      final k = ToolkitController(roster: () => const [], random: math.Random(3));
      k.setSpinnerOptions(['  Red ', '', 'Blue', 'Green']);
      expect(k.spinnerOptions, ['Red', 'Blue', 'Green']);
      await k.spin(k.spinnerOptions!, step: Duration.zero);
      expect(k.spinnerResult, k.spinnerOptions![ToolkitController.sliceAt(k.spinnerAngle, 3)]);
      k.setSpinnerOptions(['', ' ']);
      expect(k.spinnerOptions, isNull, reason: 'back to the four groups');
    });

    test('the noise meter smooths the level, and stops the microphone when closed', () async {
      final mic = FakeNoise();
      final k = ToolkitController(roster: () => const [], noiseSource: mic);
      k.show(ToolkitItem.noise);
      await pumpEventQueue();
      expect(mic.started, isTrue);
      for (var i = 0; i < 12; i++) {
        mic.levels.add(0.9);
        await pumpEventQueue();
      }
      expect(k.noise, closeTo(0.9, 0.01));
      expect(k.tooLoud, isTrue);
      k.setNoiseLimit(2);
      expect(k.noiseLimit, 0.95);
      expect(k.tooLoud, isFalse);
      k.close(ToolkitItem.noise);
      await pumpEventQueue();
      expect(mic.stopped, isTrue);
      expect(k.noise, 0);
    });

    test('a board without a microphone says why', () async {
      final k = ToolkitController(roster: () => const [], noiseSource: FakeNoise(problem: NoiseProblem.permission));
      k.show(ToolkitItem.noise);
      await pumpEventQueue();
      expect(k.noiseProblem, NoiseProblem.permission);
    });

    test('the shade and spotlight stay on the board', () {
      final k = ToolkitController(roster: () => const []);
      k.setCurtain(1.4);
      expect(k.curtain, 1);
      k.show(ToolkitItem.curtain);
      expect(k.curtain, 0.25, reason: 'the shade starts mostly down');
      k.moveSpotlight(const Offset(-1, 2));
      expect(k.spotlight, const Offset(0, 1));
      k.setSpotlightRadius(0.01);
      expect(k.spotlightRadius, 0.06);
      k.show(ToolkitItem.spotlight);
      expect(k.projectorState.keys, containsAll(['curtain', 'spotlight']));
    });

    test('PCM levels: silence is 0, a full-scale wave is 1', () {
      expect(pcm16Level(Uint8List(320)), 0);
      final loud = ByteData(320);
      for (var i = 0; i < 160; i++) {
        loud.setInt16(i * 2, i.isEven ? 32767 : -32768, Endian.little);
      }
      expect(pcm16Level(loud.buffer.asUint8List()), closeTo(1, 0.01));
      final quiet = ByteData(320);
      for (var i = 0; i < 160; i++) {
        quiet.setInt16(i * 2, i.isEven ? 33 : -33, Endian.little);
      }
      // About −60 dBFS.
      expect(pcm16Level(quiet.buffer.asUint8List()), lessThan(0.05));
      expect(clockText(const Duration(minutes: 4, seconds: 5)), '04:05');
      expect(clockText(const Duration(hours: 1, minutes: 2, seconds: 3)), '1:02:03');
    });
  });

  group('Toolkit cards', () {
    Future<ToolkitController> pumpLayer(WidgetTester tester, ToolkitController k, {void Function(Student, AnswerOutcome)? onAnswer}) async {
      tester.view.physicalSize = const Size(1920, 1080);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        MaterialApp(
          theme: KinetixTheme.light(),
          home: Scaffold(body: ToolkitLayer(kit: k, onAnswer: onAnswer)),
        ),
      );
      return k;
    }

    testWidgets('the timer card starts and pauses; a preset sets it', (tester) async {
      final clock = FakeClock();
      final k = await pumpLayer(tester, ToolkitController(roster: () => const [], now: () => clock.now)..show(ToolkitItem.timer));
      await tester.pump();
      expect(find.text('05:00'), findsOneWidget);
      await tester.tap(find.byKey(const Key('timer-2')));
      await tester.pump();
      expect(find.text('02:00'), findsOneWidget);
      await tester.tap(find.byKey(const Key('countdown-toggle')));
      clock.advance(const Duration(seconds: 30));
      await tester.pump(const Duration(milliseconds: 250));
      expect(find.text('01:30'), findsOneWidget);
      expect(find.text('Pause'), findsOneWidget);
      await tester.tap(find.byKey(const Key('countdown-toggle')));
      await tester.pump();
      expect(k.timerRunning, isFalse);
      await tester.tap(find.byKey(const Key('toolkit-close-timer')));
      await tester.pump();
      expect(find.byKey(const Key('toolkit-timer')), findsNothing);
      k.dispose();
    });

    testWidgets('the stopwatch card runs and keeps laps', (tester) async {
      final clock = FakeClock();
      final k = await pumpLayer(tester, ToolkitController(roster: () => const [], now: () => clock.now)..show(ToolkitItem.stopwatch));
      await tester.pump();
      await tester.tap(find.byKey(const Key('stopwatch-toggle')));
      clock.advance(const Duration(seconds: 12, milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 250));
      expect(find.text('00:12.3'), findsOneWidget);
      await tester.tap(find.byKey(const Key('stopwatch-lap')));
      await tester.pump();
      expect(find.text('Lap 1: 00:12.3'), findsOneWidget);
      await tester.tap(find.byKey(const Key('stopwatch-toggle')));
      await tester.pump();
      k.dispose();
    });

    testWidgets('the picker card picks from the class and records the answer', (tester) async {
      final answers = <(String, AnswerOutcome)>[];
      final k = await pumpLayer(
        tester,
        ToolkitController(roster: () => _class(3), random: math.Random(2))..show(ToolkitItem.picker),
        onAnswer: (s, o) => answers.add((s.id, o)),
      );
      await tester.pump();
      expect(find.text('Ready?'), findsOneWidget);
      expect(find.text('0 of 3 picked'), findsOneWidget);
      await tester.tap(find.byKey(const Key('pick-student')));
      await tester.pump(const Duration(seconds: 3));
      expect(k.currentStudent, isNotNull);
      expect(find.text(k.currentStudent!.fullName), findsOneWidget);
      expect(find.text('1 of 3 picked'), findsOneWidget);
      await tester.tap(find.byKey(const Key('pick-correct')));
      await tester.pump();
      expect(answers, [(k.currentStudent!.id, AnswerOutcome.correct)]);
      expect(find.textContaining("saved to Student"), findsOneWidget);
      k.dispose();
    });

    testWidgets('without a class the picker says how to get one', (tester) async {
      await pumpLayer(tester, ToolkitController(roster: () => const [])..show(ToolkitItem.picker));
      await tester.pump();
      expect(find.text('No class list'), findsOneWidget);
      expect(find.byKey(const Key('pick-student')), findsNothing);
    });

    testWidgets('dice roll and add up', (tester) async {
      final k = await pumpLayer(tester, ToolkitController(roster: () => const [], random: math.Random(5))..show(ToolkitItem.dice));
      await tester.pump();
      await tester.tap(find.byKey(const Key('dice-more')));
      await tester.pump();
      expect(find.byKey(const Key('die-2')), findsOneWidget);
      await tester.tap(find.byKey(const Key('dice-roll')));
      await tester.pump(const Duration(seconds: 1));
      expect(find.text('Total: ${k.dice.fold<int>(0, (a, b) => a + b)}'), findsOneWidget);
      k.dispose();
    });

    testWidgets('the spinner spins over groups, and its options can be edited', (tester) async {
      final k = await pumpLayer(tester, ToolkitController(roster: () => const [], random: math.Random(9))..show(ToolkitItem.spinner));
      await tester.pump();
      await tester.tap(find.byKey(const Key('spinner-spin')));
      await tester.pump(const Duration(seconds: 3));
      expect(k.spinnerResult, startsWith('Group '));
      expect(find.text(k.spinnerResult!), findsOneWidget);
      await tester.tap(find.byKey(const Key('spinner-edit')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('spinner-options')), 'Yes\nNo');
      await tester.tap(find.byKey(const Key('spinner-save')));
      await tester.pumpAndSettle();
      expect(k.spinnerOptions, ['Yes', 'No']);
      k.dispose();
    });

    testWidgets('the noise meter shows the level, or why it cannot listen', (tester) async {
      final mic = FakeNoise();
      final k = await pumpLayer(tester, ToolkitController(roster: () => const [], noiseSource: mic)..show(ToolkitItem.noise));
      await tester.pump();
      expect(find.text('Nice and calm'), findsOneWidget);
      for (var i = 0; i < 10; i++) {
        mic.levels.add(1);
        await tester.pump();
      }
      expect(find.text('Too loud!'), findsOneWidget);
      k.close(ToolkitItem.noise);
      await tester.pump();

      final none = ToolkitController(roster: () => const [], noiseSource: FakeNoise(problem: NoiseProblem.noMicrophone))..show(ToolkitItem.noise);
      await pumpLayer(tester, none);
      await tester.pump();
      expect(find.text('This board has no microphone.'), findsOneWidget);
      k.dispose();
      none.dispose();
    });

    testWidgets('the shade drags down to reveal; the spotlight follows a drag', (tester) async {
      final k = await pumpLayer(tester, ToolkitController(roster: () => const [])..show(ToolkitItem.curtain));
      await tester.pump();
      expect(find.byKey(const Key('curtain')), findsOneWidget);
      await tester.drag(find.byKey(const Key('curtain-handle')), const Offset(0, 270));
      await tester.pump();
      expect(k.curtain, closeTo(0.5, 0.02));
      await tester.tap(find.byKey(const Key('curtain-reveal-all')));
      await tester.pump();
      expect(k.curtain, 1);
      await tester.tap(find.byKey(const Key('curtain-remove')));
      await tester.pump();
      expect(find.byKey(const Key('curtain')), findsNothing);

      k.show(ToolkitItem.spotlight);
      await tester.pump();
      expect(find.byKey(const Key('spotlight')), findsOneWidget);
      await tester.drag(find.byKey(const Key('spotlight-drag')), const Offset(192, 0));
      await tester.pump();
      expect(k.spotlight.dx, closeTo(0.6, 0.02));
      await tester.tap(find.byKey(const Key('spotlight-end')));
      await tester.pump();
      expect(find.byKey(const Key('spotlight')), findsNothing);
      k.dispose();
    });

    testWidgets('cards drag by their title', (tester) async {
      final k = await pumpLayer(tester, ToolkitController(roster: () => const [])..show(ToolkitItem.dice));
      await tester.pump();
      final before = tester.getTopLeft(find.byKey(const Key('toolkit-dice')));
      await tester.drag(find.text('Dice'), const Offset(-300, 100));
      await tester.pump();
      // Less the drag's start slop.
      final moved = tester.getTopLeft(find.byKey(const Key('toolkit-dice'))) - before;
      expect(moved.dx, lessThan(-260));
      expect(moved.dy, greaterThan(80));
      k.dispose();
    });
  });

  group('the phone remote drives the toolkit', () {
    ImageElement page() => ImageElement(id: newElementId(), rect: const Rect.fromLTWH(0, 0, 1600, 900), bytes: Uint8List(4), backdrop: true);

    test('timer, picker and imported slides', () async {
      final wb = WhiteboardController();
      final k = ToolkitController(roster: () => _class(3), random: math.Random(1));
      var changes = 0;
      final remote = ToolkitRemote(kit: k, wb: wb, onChanged: () => changes++);
      remote.startTimer(const Duration(seconds: 90));
      expect(k.isOpen(ToolkitItem.timer), isTrue);
      expect(remote.timerRunning, isTrue);
      expect(k.timerTotal, const Duration(seconds: 90));
      remote.stopTimer();
      expect(remote.timerRunning, isFalse);
      expect(changes, 2);
      remote.pickStudent();
      expect(k.isOpen(ToolkitItem.picker), isTrue);
      expect(k.rolling, isTrue);

      // No slides on a plain page.
      expect(remote.slide, isNull);
      expect(remote.nextSlide(), isFalse);
      wb.addPages([
        [page()],
        [page()],
        [page()],
      ]);
      expect(remote.slide, (index: 0, count: 3));
      expect(remote.previousSlide(), isFalse);
      expect(remote.nextSlide(), isTrue);
      expect(remote.nextSlide(), isTrue);
      expect(remote.slide, (index: 2, count: 3));
      expect(remote.nextSlide(), isFalse, reason: 'the deck ends; pages go on with page.next');
      expect(remote.previousSlide(), isTrue);
      expect(wb.pageIndex, 2);
      remote.dispose();
      await Future<void>.delayed(const Duration(seconds: 2));
      k.dispose();
    });

    testWidgets('commands from the phone reach the toolkit', (tester) async {
      final wb = WhiteboardController();
      final k = ToolkitController(roster: () => _class(3));
      final board = BoardController()..skipEnrollment();
      final remote = BoardRemote(
        board: board,
        wb: wb,
        toolkit: ToolkitRemote(kit: k, wb: wb),
        hooks: RemoteHooks(recording: () => false, startRecording: () async {}, stopRecording: () async {}, showPhoto: (_) {}, onAttached: () {}),
      );
      await remote.handle({'type': 'timer.start', 'seconds': 120});
      expect(k.timerRunning, isTrue);
      expect(remote.state['timerRunning'], isTrue);
      await remote.handle({'type': 'timer.stop'});
      expect(k.timerRunning, isFalse);
      await remote.handle({'type': 'picker.pick'});
      await tester.pump(const Duration(seconds: 3));
      expect(k.currentStudent, isNotNull);
      remote.dispose();
      k.dispose();
    });
  });
}
