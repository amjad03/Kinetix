import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';

import '../support/board_fonts.dart';
import 'ce_support.dart';

/// No ERP, server-only or internal wording in the Classroom edition (P1 item 14).
void main() {
  setUpAll(loadBoardFonts);
  tearDown(() => Edition.classroom = Edition.built == 'classroom');

  testWidgets('the board in a class: no server-only tiles, no panel preview, the subject pill keeps its name', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpApp(tester, board);
    expect(find.textContaining('ERP'), findsNothing);
    await tapKey(tester, 'ce-start-class');
    await settle(tester, 10);

    // The subject pill says "Physics", never a bare icon or "College", even with a panel open.
    expect(find.descendant(of: find.byKey(const Key('ctx-chip')), matching: find.text('Physics')), findsOneWidget);
    await tapKey(tester, 'ce-lessons');
    await settle(tester, 4);
    expect(find.descendant(of: find.byKey(const Key('ctx-chip')), matching: find.text('Physics')), findsOneWidget);
    expect(find.textContaining('College'), findsNothing);
    // Roll numbers only: the class chip says how many, with no "Take attendance".
    expect(find.descendant(of: find.byKey(const Key('attendance-chip')), matching: find.text('40 students')), findsOneWidget);
    expect(find.textContaining('Take attendance'), findsNothing);

    await tapKey(tester, 'board-menu');
    expect(find.byKey(const Key('menu-preview')), findsNothing);
    await tester.ensureVisible(find.byKey(const Key('menu-apps')));
    await settle(tester, 2);
    await tapKey(tester, 'menu-apps');
    expect(find.byKey(const Key('app-lessons')), findsOneWidget);
    for (final k in ['app-study-material', 'app-attendance', 'app-recordings']) {
      expect(find.byKey(Key(k)), findsNothing, reason: k);
    }
    expect(find.textContaining('Zynetix School'), findsNothing);
    expect(find.text('Ready on this board · no phones, no internet'), findsOneWidget);
    await closeBoard(tester, board);
  });
}
