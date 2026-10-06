import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/handwriting/handwriting.dart';
import 'package:kinetix_board/features/board/board_screen.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A handwriting reader that reads every line as [line], with a model per language as [states]
/// says (downloads succeed).
class FakeHandwriting implements HandwritingRecognizer {
  FakeHandwriting({this.line = const ['2x+5=15'], Map<String, HandwritingModelState>? states}) : states = states ?? {};

  final List<String> line;
  final Map<String, HandwritingModelState> states;
  final prepared = <String>[];

  @override
  String get engine => 'mlkit';
  @override
  bool get available => true;
  @override
  Future<HandwritingModelState> modelState(String language) async => states[language] ?? HandwritingModelState.ready;
  @override
  Future<bool> prepare(String language) async {
    prepared.add(language);
    states[language] = HandwritingModelState.ready;
    return true;
  }

  @override
  Future<List<String>> recognize(List<Stroke> strokes, {required String language, String preContext = ''}) async => line;
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<BoardController> pump(WidgetTester tester, {ToolbarDock layout = ToolbarDock.bottom, HandwritingRecognizer? handwriting}) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final board = BoardController(handwriting: handwriting ?? const NoHandwritingRecognizer())
      ..skipEnrollment()
      ..toolbarDock = layout;
    await tester.pumpWidget(MaterialApp(theme: KinetixTheme.light(), home: BoardScreen(board: board)));
    await tester.pump();
    return board;
  }

  WhiteboardController whiteboard(WidgetTester tester) => tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller;

  /// Draws [pts] (screen points) with a pen.
  Future<void> draw(WidgetTester tester, List<Offset> pts) async {
    final g = await tester.startGesture(pts.first, kind: PointerDeviceKind.stylus);
    for (final p in pts.skip(1)) {
      await g.moveTo(p);
    }
    await g.up();
    await tester.pump();
  }

  List<Offset> circle(Offset c, double r) => [for (var a = 0.0; a <= 2 * math.pi + 0.2; a += 0.15) c + Offset(math.cos(a), math.sin(a)) * r];

  testWidgets('the AI pen is a pen type: tap the pen again, pick the AI pen, choose when and in which language', (tester) async {
    final board = await pump(tester);
    final wb = whiteboard(tester);
    await tester.tap(find.byKey(const Key('tool-pen')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('pen-type-aiPen')));
    await tester.pumpAndSettle();
    expect(wb.tool, BoardTool.aiPen);
    await tester.tap(find.byKey(const Key('ai-pen-mode-tap')));
    await tester.pumpAndSettle();
    expect(board.aiPenMode, AiPenMode.tap);
    await tester.ensureVisible(find.text('ಕನ್ನಡ'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('ಕನ್ನಡ'));
    await tester.pumpAndSettle();
    expect(board.aiPenLanguage.name, 'kn');
    // Saved like the other settings.
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('setting.aiPenMode'), 'tap');
    expect(tester.takeException(), isNull);
  });

  testWidgets('with the toolbar at the left edge too; W picks it from the keyboard', (tester) async {
    await pump(tester, layout: ToolbarDock.left);
    final wb = whiteboard(tester);
    await tester.tap(find.byKey(const Key('tool-pen')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('pen-type-aiPen')));
    await tester.pumpAndSettle();
    expect(wb.tool, BoardTool.aiPen);
    wb.tool = BoardTool.pen;
    await tester.sendKeyEvent(LogicalKeyboardKey.keyW);
    await tester.pump();
    expect(wb.tool, BoardTool.aiPen);
  });

  testWidgets('primary boards have no AI pen; tidying shapes stays an option of the pen', (tester) async {
    final board = await pump(tester);
    board.setSimpleBoard(SimpleBoard.on);
    await tester.pumpAndSettle();
    // The pen is already in hand: a tap opens its options, which have no AI pen.
    await tester.tap(find.byKey(const Key('tool-pen')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('pen-type-aiPen')), findsNothing);
    await tester.ensureVisible(find.byKey(const Key('snap-shapes')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('snap-shapes')));
    await tester.pumpAndSettle();
    expect(board.snapShapes, isTrue);
    // Closing the popover, then a rough circle with the pen becomes a clean one.
    await tester.tapAt(const Offset(1300, 150));
    await tester.pumpAndSettle();
    final wb = whiteboard(tester);
    expect(wb.tool, BoardTool.pen);
    await draw(tester, circle(const Offset(800, 500), 150));
    await tester.pump(const Duration(seconds: 1));
    expect((wb.elements.single as Stroke).shape, ShapeKind.circle);
    expect(tester.takeException(), isNull);
  });

  testWidgets('tap mode: Convert, then the inspector puts the ink back', (tester) async {
    final board = await pump(tester);
    board.setAiPenMode(AiPenMode.tap);
    final wb = whiteboard(tester);
    wb.tool = BoardTool.aiPen;
    await tester.pump();
    await draw(tester, circle(const Offset(800, 500), 150));
    expect(wb.elements.single, isA<Stroke>());
    await tester.tap(find.byKey(const Key('ai-pen-convert')));
    await tester.pumpAndSettle();
    final shape = wb.elements.single as Stroke;
    expect(shape.shape, ShapeKind.circle);
    // A tap on it with the AI pen: keep it, say it was writing, or have the ink back.
    await tester.tapAt(const Offset(800, 350), kind: PointerDeviceKind.stylus);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('ai-pen-inspector')), findsOneWidget);
    await tester.tap(find.byKey(const Key('ai-pen-back-to-ink')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('ai-pen-inspector')), findsNothing);
    expect((wb.elements.single as Stroke).shape, isNull);
    // Undo: the clean circle again.
    await tester.tap(find.byKey(const Key('undo')));
    await tester.pumpAndSettle();
    expect((wb.elements.single as Stroke).shape, ShapeKind.circle);
    expect(tester.takeException(), isNull);
  });

  testWidgets('handwritten maths becomes an equation that opens in the solver', (tester) async {
    final board = await pump(tester, handwriting: FakeHandwriting());
    board.setAiPenMode(AiPenMode.tap);
    final wb = whiteboard(tester);
    wb.tool = BoardTool.aiPen;
    await tester.pump();
    // Three letter-sized strokes (the fake reader reads them as 2x+5=15).
    for (var k = 0; k < 3; k++) {
      await draw(tester, [Offset(600.0 + k * 22, 400), Offset(610.0 + k * 22, 436), Offset(618.0 + k * 22, 400)]);
    }
    await tester.tap(find.byKey(const Key('ai-pen-convert')));
    await tester.pumpAndSettle();
    final eq = wb.elements.single as MathElement;
    expect(eq.latex, '2x + 5 = 15');
    // Selected, an equation offers Solve.
    wb.tool = BoardTool.select;
    wb.select({eq.id});
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('sel-readings')), findsOneWidget);
    await tester.tap(find.byKey(const Key('sel-readings')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('ai-pen-inspector')), findsOneWidget);
    await tester.tap(find.byKey(const Key('ai-pen-solve')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('math-answer')), findsOneWidget);
    expect(find.text('x = 5'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Board settings: download a handwriting model, see which are ready', (tester) async {
    final hw = FakeHandwriting(states: {'en': HandwritingModelState.ready, 'hi': HandwritingModelState.needsDownload, 'kn': HandwritingModelState.unsupported});
    await pump(tester, handwriting: hw);
    await tester.tap(find.byKey(const Key('board-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('menu-settings')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('ai-pen-settings')), 200, scrollable: find.byType(Scrollable).last);
    expect(find.descendant(of: find.byKey(const Key('ai-pen-model-en')), matching: find.text('Ready')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('ai-pen-model-kn')), matching: find.text('Not available on this board')), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('ai-pen-download-hi')));
    await tester.tap(find.byKey(const Key('ai-pen-download-hi')));
    await tester.pumpAndSettle();
    expect(hw.prepared, ['hi']);
    expect(find.descendant(of: find.byKey(const Key('ai-pen-model-hi')), matching: find.text('Ready')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test('Windows: a line from its words, best first, then one word read another way', () {
    expect(WindowsHandwriting.lineReadings([
      ['Photo', 'Phota'],
      ['synthesis'],
    ]), ['Photo synthesis', 'Phota synthesis']);
    expect(WindowsHandwriting.lineReadings([]), isEmpty);
  });
}
