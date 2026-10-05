import 'dart:typed_data';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/features/ai/voice_input.dart';
import 'package:kinetix_board/features/board/board_shot.dart';
import 'package:kinetix_board/features/board/calculator.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_board/main.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';
import 'support/fake_cloud.dart';

/// What used to say "coming soon": the calculator, the screenshot, touch lock, screen projection
/// and voice questions to KINETIX AI, at phone and panel sizes.
class FakeVoice extends VoiceInput {
  void Function(String, bool)? words;
  AiLanguage? language;

  @override
  Future<bool> listen(AiLanguage language, {required void Function(String words, bool done) onWords, required void Function(VoiceProblem p) onProblem}) async {
    this.language = language;
    words = onWords;
    return true;
  }

  @override
  Future<void> stop() async => words?.call('what is photosynthesis', true);
}

void main() {
  setUpAll(loadBoardFonts);
  setUp(() => SharedPreferences.setMockInitialValues({}));
  final l = lookupAppLocalizations(const Locale('en'));

  test('the calculator works sums out', () {
    expect(evaluateSum('12+3×4'), 24);
    expect(evaluateSum('(1+2)^2÷3'), 3);
    expect(evaluateSum('√(16)−1'), 3);
    expect(evaluateSum('50%×80'), 40);
    expect(evaluateSum('2×π'), closeTo(6.2832, 1e-4));
    expect(evaluateSum('1÷0'), isNull);
    expect(evaluateSum('3+'), isNull);
    expect(formatResult(24), '24');
    expect(formatResult(1 / 3), '0.3333333333');
    expect(formatResult(2.5), '2.5');
  });

  Future<void> tap(WidgetTester tester, String key) async {
    final f = find.byKey(Key(key));
    if (f.evaluate().isEmpty && find.byKey(const Key('phone-more')).evaluate().isNotEmpty) {
      await tester.tap(find.byKey(const Key('phone-more')));
      await tester.pumpAndSettle();
    }
    await tester.ensureVisible(f);
    await tester.pumpAndSettle();
    await tester.tap(f);
    await tester.pumpAndSettle();
  }

  Future<void> tool(WidgetTester tester, String label) async {
    await tap(tester, 'tool-tools');
    await tester.ensureVisible(find.text(label));
    await tester.pumpAndSettle();
    await tester.tap(find.text(label));
    await tester.pumpAndSettle();
  }

  for (final size in [const Size(390, 844), const Size(1920, 1080)]) {
    final name = size.width < 600 ? 'phone' : 'panel';
    testWidgets('$name: calculator, screenshot, touch lock, projection and voice questions work', (tester) async {
      screenSize(tester, size);
      final board = await enrolledBoard();
      board.onPaired('session-token', sessionIn('en'));
      await tester.pumpWidget(KinetixBoardApp(controller: board));
      await tester.pumpAndSettle();
      if (find.text(l.notNow).evaluate().isNotEmpty) {
        await tester.tap(find.text(l.notNow));
        await tester.pumpAndSettle();
      }
      final wb = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller;

      // Calculator: 12 + 3 × 4 = 24 goes on the board.
      await tool(tester, l.toolCalculator);
      for (final k in ['1', '2', '+', '3', '×', '4', '=']) {
        await tester.tap(find.byKey(Key('calc-$k')));
        await tester.pump();
      }
      expect(find.text('= 24'), findsOneWidget);
      await tester.tap(find.byKey(const Key('calc-put-on-board')));
      await tester.pumpAndSettle();
      expect((wb.elements.single as TextElement).text, '12+3×4 = 24');

      // Screenshot: a PNG of the board, saved and shared.
      final saved = <String, Uint8List>{};
      final shared = <String>[];
      BoardShot.save = (n, png) async => (saved[n] = png).isNotEmpty;
      BoardShot.share = (n, png) async => shared.add(n);
      await tool(tester, l.toolScreenshot);
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('screenshot-dialog')), findsOneWidget);
      await tester.tap(find.byKey(const Key('screenshot-save')));
      await tester.pumpAndSettle();
      expect(saved.values.single.sublist(1, 4), 'PNG'.codeUnits);
      expect(find.text(l.screenshotSaved), findsOneWidget);
      await tool(tester, l.toolScreenshot);
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('screenshot-share')));
      await tester.pumpAndSettle();
      expect(shared.single, endsWith('.png'));

      // Touch lock: the board takes no touches until the lock is held for 2 seconds.
      await tool(tester, l.toolTouchLock);
      expect(find.byKey(const Key('touch-lock')), findsOneWidget);
      final before = wb.elements.length;
      final g = await tester.startGesture(Offset(size.width / 3, size.height / 2), kind: PointerDeviceKind.touch);
      for (var i = 1; i <= 5; i++) {
        await g.moveBy(const Offset(15, 5));
      }
      await g.up();
      await tester.pump();
      expect(wb.elements, hasLength(before), reason: 'locked');
      final hold = await tester.startGesture(tester.getCenter(find.byKey(const Key('touch-unlock'))));
      await tester.pump(const Duration(milliseconds: 800));
      await hold.up(); // too short
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('touch-lock')), findsOneWidget);
      final hold2 = await tester.startGesture(tester.getCenter(find.byKey(const Key('touch-unlock'))));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 2100));
      await hold2.up();
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('touch-lock')), findsNothing);

      // Screen projection: projector mode's settings, from the profile menu.
      await tap(tester, 'profile-button');
      await tap(tester, 'menu-projector');
      expect(find.byKey(const Key('projector-dialog')), findsOneWidget);
      expect(find.byKey(const Key('projector-enabled')), findsOneWidget);
      tester.state<NavigatorState>(find.byType(Navigator).first).pop();
      await tester.pumpAndSettle();

      // Voice questions: the mic listens in the AI's language and asks what was said.
      final voice = FakeVoice();
      VoiceInput.create = () => voice;
      addTearDown(() => VoiceInput.create = SpeechVoiceInput.new);
      await tap(tester, 'panel-ai');
      await tester.tap(find.byKey(const Key('ai-voice')));
      await tester.pump();
      expect(voice.language, isNotNull);
      voice.words!('what is', false);
      await tester.pump();
      expect(find.text('what is'), findsOneWidget);
      await tester.tap(find.byKey(const Key('ai-voice')));
      await tester.pumpAndSettle();
      expect(find.text('what is photosynthesis'), findsWidgets);

      // The split screen offers only what works.
      await tester.tap(find.byKey(const Key('panel-close')).first);
      await tester.pumpAndSettle();
      await tool(tester, l.toolSplitScreen);
      expect(find.byKey(const Key('split-web')), findsNothing);
      for (final k in ['split-whiteboard', 'split-model3d', 'split-lab']) {
        expect(find.byKey(Key(k)), findsOneWidget);
      }
      await tester.pumpWidget(const SizedBox());
      board.dispose();
    });
  }
}
