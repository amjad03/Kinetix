import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/features/sim_hub/sim_hub_panel.dart';
import 'package:kinetix_board/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';
import 'support/fake_cloud.dart';

void main() {
  setUpAll(loadBoardFonts);
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('the Simulations hub opens from the Tools drawer on a panel', (tester) async {
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
    expect(find.byType(SimHubPanel), findsOneWidget);
    expect(find.byKey(const Key('hub-list')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    board.dispose();
  });
}
