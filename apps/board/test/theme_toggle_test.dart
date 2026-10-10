import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fake_cloud.dart';

/// The quick theme toggle in the board menu flips the whole app between light and dark.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('quick toggle switches the app theme', (tester) async {
    screenSize(tester, const Size(1920, 1080));
    final board = await enrolledBoard();
    board.onPaired('t', sessionIn('en'));
    board.setTheme(BoardTheme.light);
    await tester.pumpWidget(KinetixBoardApp(controller: board));
    await tester.pumpAndSettle();
    final before = Theme.of(tester.element(find.byKey(const Key('board-menu')))).colorScheme.surface;
    await tester.tap(find.byKey(const Key('board-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('menu-theme-toggle')));
    await tester.pumpAndSettle();
    expect(board.theme, BoardTheme.dark);
    final after = Theme.of(tester.element(find.byKey(const Key('board-menu')))).colorScheme.surface;
    expect(after, isNot(before));
    await tester.pumpWidget(const SizedBox());
    board.dispose();
  });
}
