import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/features/sim_hub/sim_hub_panel.dart';
import 'package:kinetix_board/main.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';
import 'support/fake_cloud.dart';
import 'support/layout.dart';

void main() {
  setUpAll(loadBoardFonts);
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<BoardController> openHub(WidgetTester tester) async {
    screenSize(tester, const Size(1920, 1080));
    final board = await enrolledBoard();
    board.onPaired('session-token', sessionIn('en'));
    await tester.pumpWidget(KinetixBoardApp(controller: board));
    await tester.pumpAndSettle();
    if (find.text('Not now').evaluate().isNotEmpty) {
      await tester.tap(find.text('Not now'));
      await tester.pumpAndSettle();
    }
    await tester.tap(find.byKey(const Key('tool-tools')));
    await tester.pumpAndSettle();
    final tile = find.byKey(const Key('drawer-simhub'));
    await tester.ensureVisible(tile);
    await tester.pumpAndSettle();
    await tester.tap(tile);
    await tester.pumpAndSettle();
    return board;
  }

  testWidgets('the Simulations hub opens from the Tools drawer on a panel', (tester) async {
    final board = await openHub(tester);
    expect(find.byType(SimHubPanel), findsOneWidget);
    expect(find.byKey(const Key('hub-list')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    board.dispose();
  });

  testWidgets('opening a sim offers Add to board at once, which puts its picture and credit on the page', (tester) async {
    final board = await openHub(tester);
    expect(find.byKey(const Key('add-to-board')), findsNothing, reason: 'nothing to picture until a sim is open');
    await tester.enterText(find.byKey(const Key('hub-search')), 'stroop');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('sim-pebl-stroop')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('add-to-board')), findsOneWidget, reason: 'the header follows the hub without waiting for another rebuild');

    final wb = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas).first).controller;
    final before = wb.elements.length;
    await tester.tap(find.byKey(const Key('add-to-board')));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
    await tester.pumpAndSettle();
    expect(wb.elements.length, before + 2);
    expect(wb.elements.whereType<ImageElement>(), isNotEmpty);
    expect(wb.elements.whereType<TextElement>().last.text, contains('Stroop test'));

    await tapBoard(tester, 'hub-back');
    expect(find.byKey(const Key('add-to-board')), findsNothing, reason: 'back at the list there is nothing to picture');
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    board.dispose();
  });
}
