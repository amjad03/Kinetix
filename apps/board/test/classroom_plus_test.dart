import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/fleet/fleet_agent.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/demo/demo.dart';
import 'package:kinetix_board/demo/demo_server.dart';
import 'package:kinetix_board/features/ai/voice_input.dart';
import 'package:kinetix_board/features/classroom_plus/break_reminder.dart';
import 'package:kinetix_board/features/classroom_plus/buzzer.dart';
import 'package:kinetix_board/features/classroom_plus/diagnostics.dart';
import 'package:kinetix_board/features/classroom_plus/plus_strings.dart';
import 'package:kinetix_board/features/classroom_plus/recording_notice.dart';
import 'package:kinetix_board/features/classroom_plus/voice_commands.dart';
import 'package:kinetix_board/features/classroom_plus/zones.dart';
import 'package:kinetix_board/features/comfort/eye_comfort.dart';
import 'package:kinetix_board/features/profiles/profiles_ui.dart';
import 'package:kinetix_board/features/toolkit/toolkit_sounds.dart';
import 'package:kinetix_board/main.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';
import 'support/panel_harness.dart';

class _SilentSounds implements ToolkitSounds {
  final played = <String>[];
  @override
  Future<void> play(String id) async => played.add(id);
}

class _Probe implements DeviceProbe {
  @override
  Future<DeviceSnapshot> read() async => const DeviceSnapshot(os: 'android', osVersion: 'Android 13', storageFreeMb: 4096, storageTotalMb: 32768, batteryPercent: 80, charging: true);
}

class _Voice extends VoiceInput {
  static _Voice? last;
  _Voice() {
    last = this;
  }
  void Function(String, bool)? words;

  @override
  Future<bool> listen(AiLanguage language, {required void Function(String words, bool done) onWords, required void Function(VoiceProblem p) onProblem}) async {
    words = onWords;
    return true;
  }

  @override
  Future<void> stop() async {}
}

/// The board's classroom additions: multi-user zones, the buzzer, break reminders, voice
/// commands, device diagnostics, the recording notice and the shuffled PIN pad.
void main() {
  setUpAll(loadBoardFonts);
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('the strings have every English key in Hindi and Kannada', () {
    final en = plusStringTable['en']!;
    for (final lang in ['hi', 'kn']) {
      expect(plusStringTable[lang]!.keys.toSet(), en.keys.toSet(), reason: lang);
      for (final k in en.keys) {
        expect(plusStringTable[lang]![k]!.contains('{n}'), en[k]!.contains('{n}'), reason: '$lang $k');
      }
    }
  });

  test('voice commands are understood in English, Hindi and Kannada', () {
    expect(parseVoiceCommand('Next page please'), const VoiceCommand(VoiceAction.nextPage));
    expect(parseVoiceCommand('go back'), const VoiceCommand(VoiceAction.previousPage));
    expect(parseVoiceCommand('add a new page'), const VoiceCommand(VoiceAction.newPage));
    expect(parseVoiceCommand('start a 5 minute timer'), const VoiceCommand(VoiceAction.startTimer, duration: Duration(minutes: 5)));
    expect(parseVoiceCommand('timer for ten minutes'), const VoiceCommand(VoiceAction.startTimer, duration: Duration(minutes: 10)));
    expect(parseVoiceCommand('30 second timer'), const VoiceCommand(VoiceAction.startTimer, duration: Duration(seconds: 30)));
    expect(parseVoiceCommand('stop the timer'), const VoiceCommand(VoiceAction.stopTimer));
    expect(parseVoiceCommand('take attendance'), const VoiceCommand(VoiceAction.attendance));
    expect(parseVoiceCommand('pick a student'), const VoiceCommand(VoiceAction.pickStudent));
    expect(parseVoiceCommand('next slide'), const VoiceCommand(VoiceAction.nextSlide));
    expect(parseVoiceCommand('undo'), const VoiceCommand(VoiceAction.undo));
    expect(parseVoiceCommand('अगला पेज'), const VoiceCommand(VoiceAction.nextPage));
    expect(parseVoiceCommand('पाँच मिनट का टाइमर'), const VoiceCommand(VoiceAction.startTimer, duration: Duration(minutes: 5)));
    expect(parseVoiceCommand('हाज़िरी लो'), const VoiceCommand(VoiceAction.attendance));
    expect(parseVoiceCommand('ಮುಂದಿನ ಪುಟ'), const VoiceCommand(VoiceAction.nextPage));
    expect(parseVoiceCommand('ಐದು ನಿಮಿಷದ ಟೈಮರ್'), const VoiceCommand(VoiceAction.startTimer, duration: Duration(minutes: 5)));
    expect(parseVoiceCommand('೩ ನಿಮಿಷದ ಟೈಮರ್'), const VoiceCommand(VoiceAction.startTimer, duration: Duration(minutes: 3)));
    expect(parseVoiceCommand('what is photosynthesis'), isNull);
    expect(parseVoiceCommand(''), isNull);
  });

  test('the break clock asks after 20 minutes of continuous use; a long pause counts as a break', () {
    final c = BreakClock();
    final t0 = DateTime(2026, 10, 9, 9);
    expect(c.use(t0), isFalse);
    for (var m = 4; m < 20; m += 4) {
      expect(c.use(t0.add(Duration(minutes: m))), isFalse);
    }
    expect(c.use(t0.add(const Duration(minutes: 20))), isTrue);
    c.later(t0.add(const Duration(minutes: 20)));
    expect(c.use(t0.add(const Duration(minutes: 22))), isFalse);
    expect(c.use(t0.add(const Duration(minutes: 25))), isTrue);
    c.taken(t0.add(const Duration(minutes: 25)));
    expect(c.use(t0.add(const Duration(minutes: 29))), isFalse);
    // Ten minutes without touching the board: the count starts again.
    expect(c.use(t0.add(const Duration(minutes: 60))), isFalse);
    expect(c.use(t0.add(const Duration(minutes: 64))), isFalse);
  });

  test('eye comfort settings keep the break reminder and read the older five-value form', () {
    const s = EyeComfortSettings(enabled: true, breakReminder: true);
    expect(EyeComfortSettings.decode(s.encode()).breakReminder, isTrue);
    expect(EyeComfortSettings.decode('true,true,0.3,0.1,false').enabled, isTrue);
    expect(EyeComfortSettings.decode('true,true,0.3,0.1,false').breakReminder, isFalse);
  });

  test('the buzzer takes only the first team each round', () {
    final r = BuzzerRound(teams: 3);
    expect(r.press(2), isTrue);
    expect(r.press(0), isFalse);
    expect(r.first, 2);
    r.reset();
    expect(r.press(5), isFalse);
    expect(r.press(0), isTrue);
  });

  test('the unlock pad shuffles its keys unless the institution turns it off', () {
    expect(PinPad.layout(shuffle: false), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
    final shuffled = PinPad.layout(shuffle: true, random: math.Random(7));
    expect(shuffled.toSet(), {'0', '1', '2', '3', '4', '5', '6', '7', '8', '9'});
    expect(shuffled, isNot(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']));
    PinPad.applyConfig({'pinShuffle': false});
    expect(PinPad.layout(shuffle: true, random: math.Random(7)), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
    PinPad.applyConfig({});
    expect(PinPad.shuffleAllowed, isTrue);
  });

  for (final size in const [phoneSize, panelSize]) {
    testWidgets('buzzer at ${size.width.toInt()}: the first team buzzes, the rest wait for the next question', (tester) async {
      final sounds = _SilentSounds();
      await pumpPanel(tester, BuzzerPanel(sounds: sounds), size: size);
      expect(find.text('Waiting for a team to buzz'), findsOneWidget);
      await tester.tap(find.byKey(const Key('buzz-1')));
      await tester.pump();
      expect(find.text('Team 2 buzzed first!'), findsOneWidget);
      expect(sounds.played, ['bell']);
      await tester.tap(find.byKey(const Key('buzz-0')));
      await tester.pump();
      expect(find.text('Team 2 buzzed first!'), findsOneWidget);
      await tester.ensureVisible(find.byKey(const Key('buzzer-reset')));
      await tester.tap(find.byKey(const Key('buzzer-reset')));
      await tester.pump();
      expect(find.text('Waiting for a team to buzz'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('diagnostics at ${size.width.toInt()}: version, connection, storage and a server check', (tester) async {
      final board = BoardController();
      var pinged = 0;
      await pumpPanel(tester, DiagnosticsPanel(board: board, probe: _Probe(), ping: () async => pinged++), size: size);
      await tester.pumpAndSettle();
      expect(find.text('Not enrolled'), findsOneWidget);
      expect(find.text('4.0 / 32.0 GB'), findsOneWidget);
      expect(find.text('80% ⚡'), findsOneWidget);
      await tester.ensureVisible(find.byKey(const Key('dg-check')));
      await tester.tap(find.byKey(const Key('dg-check')));
      await tester.pumpAndSettle();
      expect(pinged, 1);
      expect(find.textContaining('Server answered in'), findsOneWidget);
      expect(tester.takeException(), isNull);
      board.dispose();
    });
  }

  testWidgets('zones: each zone has its own pen bar; Clear rubs out only that zone', (tester) async {
    final wb = WhiteboardController()..viewport = const Size(1200, 800);
    final zones = BoardZones(wb);
    tester.view.physicalSize = const Size(1200, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: BoardZonesLayer(zones: zones))));
    expect(find.byKey(const Key('zones-layer')), findsNothing);
    zones.start(3);
    await tester.pump();
    for (var i = 0; i < 3; i++) {
      expect(find.byKey(Key('zone-bar-$i')), findsOneWidget);
    }
    await tester.tap(find.byKey(const Key('zone-2-colour-2')));
    await tester.pump();
    expect(zones.colours[2], zoneColours[2]);
    final area = wb.visibleArea!;
    expect(zones.penAt(Offset(area.right - 5, area.center.dy))!.color, zoneColours[2]);
    expect(zones.zoneAt(Offset(area.left + 5, area.center.dy)), 0);

    // A stroke on the left and one on the right; clearing the left zone keeps the right one.
    Stroke at(double x) => Stroke(id: newElementId(), style: const InkStyle(tool: InkTool.pen, color: Color(0xFF000000), width: 3), points: [InkPoint(x, area.center.dy), InkPoint(x + 4, area.center.dy + 4)]);
    wb.addAll([at(area.left + 20), at(area.right - 40)]);
    await tester.tap(find.byKey(const Key('zone-0-clear')));
    await tester.pump();
    expect(wb.elements, hasLength(1));

    await tester.tap(find.byKey(const Key('zone-1-eraser')));
    await tester.pump();
    expect(zones.penAt(area.center)!.eraser, isTrue);
    await tester.tap(find.byKey(const Key('zones-end')));
    await tester.pump();
    expect(wb.zonePen, isNull);
    expect(find.byKey(const Key('zones-layer')), findsNothing);
    zones.dispose();
  });

  testWidgets('the break reminder shows after 20 minutes of use, counts 20 seconds and goes', (tester) async {
    final activity = ValueNotifier(0);
    var now = DateTime(2026, 10, 9, 9);
    await pumpPanel(tester, BreakReminderBanner(activity: activity, enabled: () => true, now: () => now));
    for (var m = 0; m <= 20; m += 2) {
      now = DateTime(2026, 10, 9, 9, m);
      activity.value++;
      await tester.pump();
    }
    expect(find.byKey(const Key('break-reminder')), findsOneWidget);
    await tester.tap(find.byKey(const Key('break-start')));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('19 s'), findsOneWidget);
    await tester.pump(const Duration(seconds: 20));
    expect(find.byKey(const Key('break-reminder')), findsNothing);
  });

  group('on the demo board', () {
    setUp(() {
      Demo.enabled = true;
      RecordingPolicy.reset();
    });
    tearDown(() {
      Demo.enabled = false;
      VoiceInput.create = SpeechVoiceInput.new;
    });

    Future<BoardController> open(WidgetTester tester) async {
      tester.view.physicalSize = const Size(1920, 1080);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final board = demoBoard(DemoBoardServer(claimDelay: const Duration(seconds: 2)));
      board.setToolbarDock(ToolbarDock.left);
      await tester.pumpWidget(KinetixBoardApp(controller: board));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('conceptVideoSkip')));
      await tester.pumpAndSettle();
      return board;
    }

    Future<void> drawerTool(WidgetTester tester, String id) async {
      await tester.tap(find.byKey(const Key('tool-tools')));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.byKey(Key('drawer-$id')), 200, scrollable: find.descendant(of: find.byKey(const Key('tools-drawer-scroll')), matching: find.byType(Scrollable)).first);
      await tester.tap(find.byKey(Key('drawer-$id')));
      await tester.pumpAndSettle();
    }

    testWidgets('Tools → Multi-user zones splits the board; a voice command turns the page', (tester) async {
      final board = await open(tester);
      await drawerTool(tester, 'zones');
      await tester.tap(find.byKey(const Key('zones-2')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('zone-bar-1')), findsOneWidget);
      await tester.tap(find.byKey(const Key('zones-end')));
      await tester.pumpAndSettle();

      VoiceInput.create = _Voice.new;
      final wb = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller;
      wb.add(Stroke(id: newElementId(), style: const InkStyle(tool: InkTool.pen, color: Color(0xFF000000), width: 3), points: const [InkPoint(100, 100), InkPoint(140, 140)]));
      final pages = wb.pageCount;
      await drawerTool(tester, 'voice-commands');
      expect(find.byKey(const Key('voice-commands')), findsOneWidget);
      _Voice.last!.words!('new page', true);
      await tester.pump();
      expect(find.text('Done: New page'), findsOneWidget);
      expect(wb.pageCount, pages + 1);
      await tester.pump(const Duration(seconds: 1));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('voice-commands')), findsNothing);
      await tester.pumpWidget(const SizedBox());
      board.dispose();
    });
  });
}

