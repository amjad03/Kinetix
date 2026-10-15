import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_board/core/board_controller.dart';
import 'package:zynetix_board/core/models.dart';
import 'package:zynetix_board/features/ai/voice_input.dart';
import 'package:zynetix_board/features/board/calculator.dart';
import 'package:zynetix_board/features/board/kit/key_dates_data.dart';
import 'package:zynetix_board/features/board/kit/key_dates_panel.dart';
import 'package:zynetix_board/features/board/kit/kit_panel.dart';
import 'package:zynetix_board/features/board/kit/subjects.dart';
import 'package:zynetix_board/features/captions/live_captions.dart';
import 'package:zynetix_board/features/classroom/seating.dart';
import 'package:zynetix_board/features/classroom_plus/voice_commands.dart';
import 'package:zynetix_board/features/exit_ticket/exit_ticket.dart';
import 'package:zynetix_board/features/logic_gates/logic_circuit.dart';
import 'package:zynetix_board/features/logic_gates/logic_gates_lab.dart';
import 'package:zynetix_board/features/reader/read_aloud.dart';
import 'package:zynetix_board/features/reader/reader_settings.dart';
import 'package:zynetix_board/features/toolkit/noise_source.dart';
import 'package:zynetix_board/features/toolkit/toolkit_controller.dart';
import 'package:zynetix_board/l10n/l10n.dart';
import 'package:zynetix_ink/zynetix_ink.dart';
import 'package:zynetix_ui/zynetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';
import 'support/panel_harness.dart';

/// The board's teaching tools as a demo class uses them: each flow is driven through its real
/// widgets, and the speech paths are checked on a board with no speech engine.

/// A microphone whose stream fails after it starts (unplugged, taken by a call).
class _BrokenMic implements NoiseSource {
  final levels = StreamController<double>();
  @override
  Future<Stream<double>> start() async => levels.stream;
  @override
  Future<void> stop() async {}
  @override
  Future<void> dispose() async {}
}

/// A recogniser that reports whatever problem the test sends it.
class _Recogniser extends VoiceInput {
  _Recogniser({this.throws = false});
  final bool throws;
  int listens = 0;
  void Function(VoiceProblem p)? problem;

  @override
  Future<bool> listen(AiLanguage language, {required void Function(String words, bool done) onWords, required void Function(VoiceProblem p) onProblem}) async {
    listens++;
    if (throws) throw StateError('no speech engine on this desktop');
    problem = onProblem;
    return true;
  }

  @override
  Future<void> stop() async {}
}

/// A reader voice that records each sentence and can be told there is no voice.
class _Voice implements ReaderVoice, VoiceChoices {
  _Voice({this.has = true});
  final bool has;
  final spoken = <(String, String, double)>[];
  @override
  void Function(int start, int end)? onWord;
  @override
  VoidCallback? onDone;
  @override
  String? voiceName;
  @override
  double pitch = 1;
  final pitches = <double>[];

  @override
  Future<List<VoiceOption>> voices(String lang) async => const [];

  @override
  Future<bool> speak(String text, String lang, double rate) async {
    if (!has) return false;
    spoken.add((text, lang, rate));
    pitches.add(pitch);
    return true;
  }

  @override
  Future<void> stop() async {}
  @override
  void dispose() {}
}

class _Clock {
  DateTime now = DateTime(2026, 10, 13, 9);
  void advance(Duration d) => now = now.add(d);
}

Future<void> _tapKey(WidgetTester tester, String key) async {
  await tester.ensureVisible(find.byKey(Key(key)));
  await tester.tap(find.byKey(Key(key)));
}

void main() {
  setUpAll(loadBoardFonts);
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('calculator', () {
    test('degrees are exact at the angles a class meets; tan 90 has no value', () {
      expect(evaluateSum('cos(90)', degrees: true), 0);
      expect(evaluateSum('sin(180)', degrees: true), 0);
      expect(evaluateSum('sin(150)', degrees: true), 0.5);
      expect(evaluateSum('cos(120)', degrees: true), -0.5);
      expect(evaluateSum('tan(45)', degrees: true), 1);
      expect(evaluateSum('tan(90)', degrees: true), isNull, reason: 'not 16331239353195370');
      expect(evaluateSum('sin(60)', degrees: true), closeTo(math.sqrt(3) / 2, 1e-12), reason: 'only exact values are snapped');
      expect(formatResult(evaluateSum('sin(60)', degrees: true)!), '0.8660254038');
      expect(formatResult(evaluateSum('acos(0.5)', degrees: true)!), '60');
      expect(evaluateSum('cos(90)', degrees: false), closeTo(math.cos(90), 1e-12), reason: 'radians unchanged');
    });

    test('big factorials, decimals before ! and tiny answers', () {
      expect(evaluateSum('25!'), closeTo(1.5511210043330986e25, 1e12));
      expect(evaluateSum('5!+1'), 121);
      expect(evaluateSum('2.5!'), isNull, reason: 'not 2.(120)');
      expect(formatResult(1.5e-7), '1.5e-7');
    });

    testWidgets('cos 90 shows 0 and the answer carries on into the next sum', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          locale: const Locale('en'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: const Scaffold(body: BoardCalculator(scientific: true)),
        ),
      );
      await tester.pumpAndSettle();
      for (final k in ['cos(', '9', '0', ')', '=']) {
        await _tapKey(tester, 'calc-$k');
        await tester.pump();
      }
      expect(find.text('= 0'), findsOneWidget);
      for (final k in ['+', '2', '=']) {
        await _tapKey(tester, 'calc-$k');
        await tester.pump();
      }
      expect(find.text('= 2'), findsOneWidget);
      for (final k in ['C', 'tan(', '9', '0', ')', '=']) {
        await _tapKey(tester, 'calc-$k');
        await tester.pump();
      }
      expect(find.byKey(const Key('calc-answer')), findsOneWidget);
      expect(find.text('= 16331239353195370'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  });

  group('timer and noise meter', () {
    test('+1 minute while counting up keeps the time gone; counting down the ring grows', () {
      final clock = _Clock();
      final k = ToolkitController(roster: () => const [], now: () => clock.now)
        ..show(ToolkitItem.timer)
        ..setTimer(const Duration(minutes: 5))
        ..setTimerOptions(countUp: true)
        ..startPauseTimer();
      clock.advance(const Duration(minutes: 2));
      k.addTime(const Duration(minutes: 1));
      expect(k.timerShown, const Duration(minutes: 2), reason: 'two minutes have gone, not minus one');
      expect(k.timerTotal, const Duration(minutes: 6));
      expect(k.timerLeft, const Duration(minutes: 4));
      k
        ..resetTimer()
        ..setTimerOptions(countUp: false)
        ..setTimer(const Duration(minutes: 5))
        ..startPauseTimer();
      clock.advance(const Duration(seconds: 30));
      k.addTime(const Duration(minutes: 1));
      expect(k.timerLeft, const Duration(minutes: 5, seconds: 30));
      expect(k.timerTotal, const Duration(minutes: 5, seconds: 30), reason: 'the ring is never more than full');
      k.dispose();
    });

    test('a microphone that fails while listening says so', () async {
      final mic = _BrokenMic();
      final k = ToolkitController(roster: () => const [], noiseSource: mic)..show(ToolkitItem.noise);
      await Future<void>.delayed(Duration.zero);
      mic.levels.add(0.5);
      await Future<void>.delayed(Duration.zero);
      expect(k.noise, greaterThan(0));
      mic.levels.addError(Exception('microphone unplugged'));
      await Future<void>.delayed(Duration.zero);
      expect(k.noiseProblem, NoiseProblem.unavailable);
      k.dispose();
    });
  });

  group('seat plan', () {
    testWidgets('rows and columns are kept for the class', (tester) async {
      final board = BoardController();
      await pumpPanel(tester, SeatingChartPanel(board: board, random: math.Random(1)), size: panelSize);
      final state = tester.state<SeatingChartPanelState>(find.byType(SeatingChartPanel));
      final cols = state.plan.cols;
      await _tapKey(tester, 'seating-cols-plus');
      await tester.pump();
      await _tapKey(tester, 'seating-rows-plus');
      await tester.pump();
      final rows = state.plan.rows;
      expect(state.plan.cols, cols + 1);
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
      await pumpPanel(tester, SeatingChartPanel(key: UniqueKey(), board: board, random: math.Random(1)), size: panelSize);
      final again = tester.state<SeatingChartPanelState>(find.byType(SeatingChartPanel));
      expect(again.plan.cols, cols + 1);
      expect(again.plan.rows, rows);
    });
  });

  group('speech on a board without a speech engine', () {
    testWidgets('voice commands: a missing language model says so, Listen again retries, and no engine never crashes', (tester) async {
      final made = <_Recogniser>[];
      VoiceInput.create = () {
        final r = _Recogniser();
        made.add(r);
        return r;
      };
      addTearDown(() => VoiceInput.create = SpeechVoiceInput.new);
      await pumpPanel(
        tester,
        Builder(
          builder: (c) => FilledButton(
            key: const Key('open'),
            onPressed: () => VoiceCommandDialog.open(c, language: AiLanguage.kn, run: (_) => true),
            child: const Text('open'),
          ),
        ),
      );
      await tester.tap(find.byKey(const Key('open')));
      await tester.pumpAndSettle();
      made.single.problem!(VoiceProblem.language);
      await tester.pump();
      expect(find.textContaining('no speech model for this language'), findsOneWidget);
      await tester.tap(find.byKey(const Key('voice-retry')));
      await tester.pump();
      expect(made.single.listens, 2);
      expect(find.byKey(const Key('voice-listening')), findsOneWidget);
      await tester.tap(find.byKey(const Key('voice-close')));
      await tester.pumpAndSettle();

      VoiceInput.create = () => _Recogniser(throws: true);
      await tester.tap(find.byKey(const Key('open')));
      await tester.pumpAndSettle();
      expect(find.text('Speech recognition is not available on this board.'), findsOneWidget);
      expect(find.byKey(const Key('voice-retry')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    test('live captions stop with a message instead of hanging on "Listening…"', () async {
      final c = CaptionsController(voice: () => _Recogniser(throws: true), restartDelay: Duration.zero);
      await c.start();
      expect(c.on, isFalse);
      expect(c.problem, VoiceProblem.unavailable);
      c.dispose();
    });

    test('reader: a new speed is heard at once; testing a voice the board lacks says so', () async {
      final v = _Voice();
      final r = ReaderController(['First paragraph', 'Second'], voice: v);
      await r.play();
      expect(v.spoken.single.$3, 0.45);
      r.setRate(0.8);
      await r.applyVoice();
      expect(v.spoken, hasLength(2));
      expect(v.spoken.last, ('First paragraph', 'en-IN', 0.8), reason: 'the same paragraph again, faster');
      r.setPitch(1.6);
      await r.applyVoice();
      expect(v.pitches.last, 1.6);
      r.dispose();

      final none = ReaderController(['ನಮಸ್ಕಾರ'], voice: _Voice(has: false));
      await none.preview('ನಮಸ್ಕಾರ');
      expect(none.missingVoice, 'kn-IN');
      none.dispose();
    });
  });

  group('exit ticket', () {
    testWidgets('a double tap on Next moves one question, never past the last', (tester) async {
      final wb = WhiteboardController();
      await pumpPanel(tester, ExitTicketPanel(board: BoardController(), wb: wb), size: panelSize);
      await tester.enterText(find.byKey(const Key('exit-text-0')), 'Which is a noun?');
      await tester.enterText(find.byKey(const Key('exit-option-0-0')), 'run');
      await tester.enterText(find.byKey(const Key('exit-option-0-1')), 'table');
      await _tapKey(tester, 'exit-add');
      await tester.pump();
      await tester.enterText(find.byKey(const Key('exit-text-1')), 'One thing you learnt');
      await tester.tap(find.byKey(const Key('exit-kind-words-1')));
      await tester.pump();
      await _tapKey(tester, 'exit-start');
      await tester.pump();
      final next = tester.widget<ButtonStyleButton>(find.byKey(const Key('exit-next')));
      next.onPressed!();
      next.onPressed!();
      await tester.pumpAndSettle();
      expect(find.textContaining('Question 2 of 2'), findsOneWidget);
      expect(tester.takeException(), isNull);
      final last = tester.widget<ButtonStyleButton>(find.byKey(const Key('exit-next')));
      last.onPressed!();
      last.onPressed!();
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('exit-done')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('key dates', () {
    testWidgets('a search with nothing in India shows the world, and says so', (tester) async {
      KeyDatesData.override(
        KeyDatesData.parse('1947\t8\t15\tindia\thistory\tIndia becomes independent\n1687\t7\t5\tworld\tscience\tNewton publishes the Principia\n'),
      );
      addTearDown(() => KeyDatesData.override(null));
      await pumpPanel(tester, KeyDatesPanel(onDraw: (_) {}, today: DateTime(2026, 7, 5)), size: panelSize);
      await tester.enterText(find.byKey(const Key('dates-search')), 'newton');
      await tester.pump();
      expect(find.text('Newton publishes the Principia'), findsOneWidget);
      expect(find.byKey(const Key('dates-widened')), findsOneWidget);
      await tester.enterText(find.byKey(const Key('dates-search')), 'independent');
      await tester.pump();
      expect(find.byKey(const Key('dates-widened')), findsNothing);
      await tester.enterText(find.byKey(const Key('dates-search')), '');
      await tester.tap(find.byKey(const Key('dates-today')));
      await tester.pump();
      expect(find.text('Newton publishes the Principia'), findsOneWidget, reason: 'nothing in India on 5 July, so the world');
      expect(find.byKey(const Key('dates-widened')), findsOneWidget);
    });
  });

  group('logic gates', () {
    test('a part added after one was deleted gets a free name, never a second B', () {
      final c = LogicCircuit();
      final a = c.add(PartKind.input, Offset.zero);
      c.add(PartKind.input, Offset.zero);
      final q1 = c.add(PartKind.led, Offset.zero);
      c.add(PartKind.led, Offset.zero);
      c
        ..remove(a.id)
        ..remove(q1.id);
      expect(c.add(PartKind.input, Offset.zero).label, 'A');
      expect(c.add(PartKind.input, Offset.zero).label, 'C');
      expect(c.add(PartKind.led, Offset.zero).label, 'Q1');
      final labels = [for (final p in c.parts) p.label];
      expect(labels.toSet(), hasLength(labels.length));
    });

    testWidgets('a wire dropped between a gate\'s two inputs goes to the nearer one; parts stay on the board', (tester) async {
      final c = LogicCircuit();
      final sw = c.add(PartKind.input, const Offset(20, 40));
      final and = c.add(PartKind.gate, const Offset(260, 40), gate: GateType.and);
      await pumpPanel(tester, LogicGatesLab(wb: WhiteboardController(), circuit: c));
      final origin = tester.getTopLeft(find.byKey(const Key('lg-canvas')));
      // 10 from the lower pin, 15.6 from the upper: the lower one is meant.
      final drop = and.inPin(1) + const Offset(0, -10);
      await tester.dragFrom(origin + sw.outPin, drop - sw.outPin);
      await tester.pump();
      expect(c.wires.single.pin, 1);
      await tester.dragFrom(origin + and.rect.center, const Offset(-600, -300));
      await tester.pump();
      expect(and.pos.dx, greaterThanOrEqualTo(0));
      expect(and.pos.dy, greaterThanOrEqualTo(0));
    });
  });

  group('periodic table', () {
    for (final (name, size) in [('phone', phoneSize), ('panel', panelSize)]) {
      testWidgets('on a $name every cell is big enough to tap; the tapped element is marked', (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        final wb = WhiteboardController();
        addTearDown(wb.dispose);
        await tester.pumpWidget(
          MaterialApp(
            theme: ZynetixTheme.light(),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: Scaffold(
              body: SizedBox(
                width: size.width < 600 ? size.width : 420,
                child: SubjectKitPanel(
                  board: BoardController()..skipEnrollment(),
                  wb: wb,
                  style: subjectStyles[Subject.chemistry]!,
                  primary: false,
                  initialTab: KitTab.periodic,
                  onAi: (_) {},
                  onPanel: (_) {},
                  onSplit: (_) {},
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        final cell = tester.getSize(find.byKey(const Key('element-Na')));
        expect(cell.width, greaterThanOrEqualTo(32), reason: name);
        await tester.tap(find.byKey(const Key('element-Na')));
        await tester.pumpAndSettle();
        expect(find.textContaining('Sodium'), findsOneWidget);
        await tester.tapAt(const Offset(5, 5));
        await tester.pumpAndSettle();
        final box = tester.widget<Container>(find.descendant(of: find.byKey(const Key('element-Na')), matching: find.byType(Container)).first);
        expect((box.decoration! as BoxDecoration).border, isNotNull, reason: 'Na is marked');
        expect(tester.takeException(), isNull);
      });
    }
  });
}
