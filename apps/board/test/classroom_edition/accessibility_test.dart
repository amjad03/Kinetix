import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';

import '../support/board_fonts.dart';
import 'ce_support.dart';

/// Screen-reader labels on the Classroom edition's own controls (P1 item 22).
void main() {
  setUpAll(loadBoardFonts);
  tearDown(() => Edition.classroom = Edition.built == 'classroom');

  testWidgets('start screen, teachers, the PIN pad and class tools say what they are', (tester) async {
    final sem = tester.ensureSemantics();
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpApp(tester, board);
    expect(find.bySemanticsLabel('ಕನ್ನಡ'), findsOneWidget);
    expect(find.bySemanticsLabel('English'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('Start my class')), findsOneWidget);

    await tapKey(tester, 'ce-who');
    expect(find.bySemanticsLabel(RegExp(r'^Lakshmi Rao, Physics')), findsOneWidget);
    await tapKey(tester, 'ce-who-back');

    // The PIN pad: the backspace key has a name, the dots say how many digits are typed.
    await tapKey(tester, 'ce-settings');
    expect(find.bySemanticsLabel('Delete the last digit'), findsOneWidget);
    expect(find.bySemanticsLabel('0 digits typed'), findsOneWidget);
    await tester.tap(find.byKey(const Key('ce-pin-key-1')).last);
    await tester.pump();
    expect(find.bySemanticsLabel('1 digits typed'), findsOneWidget);
    Navigator.of(tester.element(find.byKey(const Key('ce-pin-pad')))).pop();
    await settle(tester);

    // Class tools: each tile reads its name and what it does.
    await tapKey(tester, 'ce-start-class');
    await settle(tester, 12);
    await tapKey(tester, 'ce-class-tools');
    expect(tester.getSemantics(find.byKey(const Key('ce-tool-quiz')).first).label, 'Class quiz. Tap roll numbers right or wrong');
    expect(tester.getSemantics(find.byKey(const Key('ce-tool-picker')).first).label, startsWith('Pick a roll no. '));
    sem.dispose();
    await closeBoard(tester, board);
  });
}
