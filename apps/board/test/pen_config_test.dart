import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/features/board/pen_config/pen_config_screen.dart';
import 'package:kinetix_board/features/board/pen_config/pen_config_strings.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';

/// The pen configuration screen: generic IFP touch sizes, active stylus, two pens, touch
/// calibration and the test area.
void main() {
  setUpAll(loadBoardFonts);
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<BoardController> open(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1200, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final board = BoardController();
    await tester.pumpWidget(MaterialApp(home: PenConfigScreen(board: board)));
    await tester.pumpAndSettle();
    return board;
  }

  Future<void> tab(WidgetTester tester, String key) async {
    await tester.tap(find.byKey(Key(key)));
    await tester.pumpAndSettle();
  }

  testWidgets('touch size limits are set and kept on the device', (tester) async {
    final board = await open(tester);
    await tester.tap(find.byKey(const Key('cfg-autolearn')));
    await tester.pump();
    expect(board.inputConfig.autoLearn, isFalse);
    await tester.drag(find.byKey(const Key('cfg-penmax')), const Offset(100, 0));
    await tester.pump();
    expect(board.inputConfig.penMax, greaterThan(0));
    expect(InputConfig.decode(board.inputConfig.encode()).penMax, board.inputConfig.penMax);
  });

  testWidgets('learning from pen, finger and palm touches sets the limits', (tester) async {
    final board = await open(tester);
    await tester.tap(find.byKey(const Key('cfg-learn-start')));
    await tester.pump();
    var id = 100;
    for (final r in [3.0, 12.0, 45.0]) {
      final at = tester.getCenter(find.byKey(const Key('cfg-learn-pad')));
      tester.binding.handlePointerEvent(PointerDownEvent(pointer: ++id, position: at, radiusMajor: r));
      tester.binding.handlePointerEvent(PointerUpEvent(pointer: id, position: at));
      await tester.pump();
      await tester.tap(find.byKey(const Key('cfg-learn-next')));
      await tester.pump();
    }
    expect(board.inputConfig.penMax, closeTo(7.5, 0.01));
    expect(board.inputConfig.palmMin, closeTo(28.5, 0.01));
    expect(board.inputConfig.autoLearn, isFalse);
  });

  testWidgets('stylus buttons and eraser end are mapped', (tester) async {
    final board = await open(tester);
    await tab(tester, 'cfg-tab-stylus');
    await tester.tap(find.byKey(const Key('cfg-eraser-end')));
    await tester.pump();
    expect(board.inputConfig.stylus.eraserEnd, isFalse);
    await tester.tap(find.byKey(const Key('cfg-btn1')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Highlight').last);
    await tester.pumpAndSettle();
    expect(board.inputConfig.stylus.primaryButton, ButtonAction.highlight);
  });

  testWidgets('two pens get their own colours', (tester) async {
    final board = await open(tester);
    await tab(tester, 'cfg-tab-dual');
    await tester.tap(find.byKey(const Key('cfg-dual')));
    await tester.pump();
    await tester.tap(find.byKey(Key('dual2-${const Color(0xFF1E8E3E).toARGB32().toRadixString(16)}')));
    await tester.pump();
    expect(board.inputConfig.dual.enabled, isTrue);
    expect(board.inputConfig.dual.second, const Color(0xFF1E8E3E));
  });

  testWidgets('calibration measures the miss over five targets and saves it', (tester) async {
    final board = await open(tester);
    await tab(tester, 'cfg-tab-calibrate');
    final pad = tester.getRect(find.byKey(const Key('cfg-cal-pad')));
    for (final f in const [Offset(0.1, 0.12), Offset(0.9, 0.12), Offset(0.5, 0.5), Offset(0.1, 0.88), Offset(0.9, 0.88)]) {
      // The screen reports every touch 12 px right and 6 px low of the target.
      final g = await tester.startGesture(pad.topLeft + Offset(f.dx * pad.width + 12, f.dy * pad.height + 6));
      await g.up();
      await tester.pump();
    }
    expect(board.inputConfig.calibration.shift.dx, closeTo(-12, 0.5));
    expect(board.inputConfig.calibration.shift.dy, closeTo(-6, 0.5));
    await tester.tap(find.byKey(const Key('cfg-cal-reset')));
    await tester.pump();
    expect(board.inputConfig.calibration.isCalibrated, isFalse);
  });

  testWidgets('the test area names what touched it', (tester) async {
    final board = await open(tester);
    board.inputConfig.setThresholds(penMax: 5, palmMin: 30, autoLearn: false);
    await tab(tester, 'cfg-tab-test');
    final c = tester.getCenter(find.byKey(const Key('cfg-test-pad')));
    final g = await tester.startGesture(c, kind: PointerDeviceKind.stylus);
    await g.moveBy(const Offset(20, 0));
    await g.up();
    await tester.pump();
    expect(find.textContaining('Pen'), findsWidgets);
    expect(find.byKey(const Key('cfg-test-readout')), findsOneWidget);
  });

  test('the screen has English, Hindi and Kannada words for every key', () {
    final en = PenConfigStrings.all['en']!.keys.toSet();
    for (final lang in ['hi', 'kn']) {
      expect(PenConfigStrings.all[lang]!.keys.toSet(), en, reason: lang);
      for (final k in en) {
        expect(PenConfigStrings.all[lang]![k], isNot(PenConfigStrings.all['en']![k]), reason: '$lang $k');
      }
    }
  });
}
