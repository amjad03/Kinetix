import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/main.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fake_cloud.dart';

/// The board's paper follows the App theme (white, the near-black dark board, the green
/// chalkboard); pages with a template keep it, and ink keeps its colour, drawn for contrast.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<(BoardController, WhiteboardController)> pump(WidgetTester tester) async {
    screenSize(tester, const Size(1920, 1080));
    final board = await enrolledBoard();
    board.onPaired('t', sessionIn('en'));
    await tester.pumpWidget(KinetixBoardApp(controller: board));
    await tester.pumpAndSettle();
    return (board, tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller);
  }

  testWidgets('the paper follows the theme; a template stays', (tester) async {
    final (board, wb) = await pump(tester);
    expect(wb.background, BoardBackground.plain);
    wb.addPage();
    wb.background = BoardBackground.grid;
    board.setTheme(BoardTheme.dark);
    await tester.pumpAndSettle();
    expect(wb.pages.first.background, BoardBackground.night);
    expect(wb.background, BoardBackground.grid);
    board.setTheme(BoardTheme.chalkboard);
    await tester.pumpAndSettle();
    expect(wb.pages.first.background, BoardBackground.chalkboard);
    board.setTheme(BoardTheme.light);
    await tester.pumpAndSettle();
    expect(wb.pages.first.background, BoardBackground.plain);
    // The pen stays black: it is drawn white on the dark board.
    expect(wb.penColor, WhiteboardController.inkBlack);
    expect(inkColorFor(wb.penColor, BoardBackground.night).computeLuminance(), greaterThan(0.8));
    await tester.pumpWidget(const SizedBox());
    board.dispose();
  });

  testWidgets('a board that opens in the dark theme opens on the dark board', (tester) async {
    screenSize(tester, const Size(1920, 1080));
    final board = await enrolledBoard();
    board.onPaired('t', sessionIn('en'));
    board.setTheme(BoardTheme.dark);
    await tester.pumpWidget(KinetixBoardApp(controller: board));
    await tester.pumpAndSettle();
    final wb = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas)).controller;
    expect(wb.background, BoardBackground.night);
    expect(wb.toSaved(const Size(1920, 1080)).backgroundOf(0), BoardBackground.night);
    await tester.pumpWidget(const SizedBox());
    board.dispose();
  });
}
