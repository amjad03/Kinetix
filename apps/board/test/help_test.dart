import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/features/board/board_screen.dart';
import 'package:kinetix_board/features/help/practice.dart';
import 'package:kinetix_board/features/help/tour.dart';
import 'package:kinetix_board/features/toolkit/toolkit_controller.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'support/layout.dart';
import 'support/marks.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<void> pumpBoard(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(theme: KinetixTheme.light(), home: BoardScreen(board: BoardController()..skipEnrollment())));
    await tester.pump();
    await tester.pumpAndSettle();
  }

  WhiteboardController whiteboard(WidgetTester tester) => tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller;

  testWidgets('the tour starts by itself once, points at the pen, and can be skipped', (tester) async {
    BoardTour.autoStart = true;
    await pumpBoard(tester);
    expect(find.text('Welcome to your board'), findsOneWidget);
    await tester.tap(find.byKey(const Key('coach-next')));
    await tester.pumpAndSettle();
    expect(find.text('Write and draw'), findsOneWidget);
    expect(find.text('2 of 10'), findsOneWidget);
    await tester.tap(find.byKey(const Key('coach-skip')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('coach-title')), findsNothing);
    expect(await BoardTour.seen(), isTrue);
    // Not again.
    await tester.pumpWidget(const SizedBox());
    await pumpBoard(tester);
    expect(find.text('Welcome to your board'), findsNothing);
  });

  testWidgets('the end of the tour offers practice', (tester) async {
    await pumpBoard(tester);
    await tester.tap(find.byKey(const Key('profile-button')));
    await tester.pumpAndSettle();
    await tapBoard(tester, 'menu-tour');
    await tester.pumpAndSettle();
    for (var i = 0; i < 9; i++) {
      await tester.tap(find.byKey(const Key('coach-next')));
      await tester.pumpAndSettle();
    }
    expect(find.text('Practise now'), findsOneWidget);
    await tester.tap(find.byKey(const Key('coach-next')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('practice-panel')), findsOneWidget);
  });

  testWidgets('help: search, then Show me points at the control', (tester) async {
    await pumpBoard(tester);
    await tester.tap(find.byKey(const Key('profile-button')));
    await tester.pumpAndSettle();
    await tapBoard(tester, 'menu-help');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('help-sheet')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('help-search')), 'PowerPoint');
    await tester.pumpAndSettle();
    expect(find.text('Open a PDF or PowerPoint'), findsOneWidget);
    expect(find.text('Shapes'), findsNothing);
    await tester.tap(find.byKey(const Key('help-show-import')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('coach-title')), findsOneWidget);
    expect(find.text('Open a PDF or PowerPoint'), findsOneWidget);
    await tester.tap(find.byKey(const Key('coach-next')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('coach-title')), findsNothing);
  });

  testWidgets('? opens help', (tester) async {
    await pumpBoard(tester);
    await tester.sendKeyDownEvent(LogicalKeyboardKey.shift);
    await tester.sendKeyEvent(LogicalKeyboardKey.slash);
    await tester.sendKeyUpEvent(LogicalKeyboardKey.shift);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('help-sheet')), findsOneWidget);
  });

  test('practice ticks off what the teacher does', () {
    final wb = WhiteboardController();
    final kit = ToolkitController(roster: () => const []);
    final t = PracticeTracker(wb: wb, kit: kit);
    wb.tool = BoardTool.pen;
    wb.pointerDown(1, InkPoint(10, 10));
    wb.pointerMove(1, InkPoint(60, 40));
    wb.pointerMove(1, InkPoint(90, 60));
    wb.pointerUp(1);
    expect(t.done, {PracticeTask.write});
    expect(t.next, PracticeTask.erase);
    wb.undo();
    expect(t.done, containsAll([PracticeTask.erase]));
    markPage(wb);
    wb.addPage();
    kit.show(ToolkitItem.timer);
    expect(t.done, containsAll([PracticeTask.page, PracticeTask.timer]));
    expect(t.finished, isFalse);
    t.dispose();
    kit.dispose();
  });

  testWidgets('practice runs on a page of its own and gives the board back', (tester) async {
    await pumpBoard(tester);
    final wb = whiteboard(tester);
    wb.add(TextElement(id: 'mine', position: const Offset(300, 300), text: 'My lesson', color: const Color(0xFF000000), fontSize: 30, size: const Size(200, 36)));
    await tester.tap(find.byKey(const Key('profile-button')));
    await tester.pumpAndSettle();
    await tapBoard(tester, 'menu-help');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('help-practice')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('practice-panel')), findsOneWidget);
    expect(find.text('Practice: 0 of 6 done'), findsOneWidget);
    expect(wb.elements.whereType<TextElement>().map((e) => e.text), contains('2x + 5 = 15'));
    await tester.tap(find.byKey(const Key('tool-tools')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Timer'));
    await tester.pumpAndSettle();
    expect(find.text('Practice: 1 of 6 done'), findsOneWidget);
    await tester.tap(find.byKey(const Key('practice-show-write')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('coach-title')), findsOneWidget);
    await tester.tap(find.byKey(const Key('coach-next')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('practice-end')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('practice-panel')), findsNothing);
    expect(wb.elements.whereType<TextElement>().single.text, 'My lesson');
    expect(find.byKey(const Key('toolkit-timer')), findsNothing);
  });
}
