import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';

import '../support/board_fonts.dart';
import 'ce_support.dart';

/// Removing a teacher, a class or a period: behind the PIN (teachers on the start screen),
/// Remove away from Save, a confirmation that says what goes, and Undo for 10 seconds.
void main() {
  setUpAll(loadBoardFonts);
  tearDown(() => Edition.classroom = Edition.built == 'classroom');

  testWidgets('editing a teacher on Who’s teaching needs the PIN; Remove is apart from Save, asks, and can be undone', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await tester.runAsync(() => board.classroom.setPin('2580'));
    await pumpApp(tester, board);
    await tapKey(tester, 'ce-who');
    await tester.longPress(find.byKey(const Key('ce-teacher-lr')));
    await settle(tester);
    expect(find.byKey(const Key('ce-pin-dialog')), findsOneWidget, reason: 'no editing without the PIN');
    expect(find.text('Changing or removing a teacher needs the school PIN.'), findsOneWidget);
    await tapKey(tester, 'ce-pin-cancel');
    expect(find.byKey(const Key('ce-teacher-dialog')), findsNothing);

    await tester.longPress(find.byKey(const Key('ce-teacher-lr')));
    await settle(tester);
    await typePin(tester, '2580');
    expect(find.byKey(const Key('ce-teacher-dialog')), findsOneWidget);
    final remove = tester.getCenter(find.byKey(const Key('ce-teacher-remove')));
    final save = tester.getCenter(find.byKey(const Key('ce-teacher-save')));
    expect(save.dx - remove.dx, greaterThan(250), reason: 'Remove sits at the far left, away from Save');

    await tapKey(tester, 'ce-teacher-remove');
    expect(find.byKey(const Key('ce-confirm-remove')), findsOneWidget);
    expect(find.text('Remove Lakshmi Rao?'), findsOneWidget);
    expect(find.textContaining('Their 5 periods stay on the timetable with no teacher'), findsOneWidget);
    await tapKey(tester, 'ce-confirm-cancel');
    expect(board.classroom.teacher('lr'), isNotNull, reason: 'Keep it keeps the teacher');

    await tester.longPress(find.byKey(const Key('ce-teacher-lr')));
    await settle(tester);
    await typePin(tester, '2580');
    await tapKey(tester, 'ce-teacher-remove');
    await tapKey(tester, 'ce-confirm-ok');
    expect(board.classroom.teacher('lr'), isNull);
    expect(board.classroom.slots.where((s) => s.id == 'p1').single.teacherId, isNull);
    expect(find.byKey(const Key('ce-teacher-lr')), findsNothing);
    expect(find.text('Lakshmi Rao removed.'), findsOneWidget);
    await tapKey(tester, 'ce-undo');
    expect(board.classroom.teacher('lr')!.name, 'Lakshmi Rao');
    expect(board.classroom.slots.where((s) => s.id == 'p1').single.teacherId, 'lr', reason: 'Undo puts their periods back too');
    expect(find.byKey(const Key('ce-teacher-lr')), findsOneWidget);
    await closeBoard(tester, board);
  });

  testWidgets('removing a class or a period in Settings asks first, says what goes, and Undo lasts 10 seconds', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpApp(tester, board);
    await openCeSettings(tester);
    expect(find.byKey(const Key('ce-settings-page')), findsOneWidget);

    await tapKey(tester, 'ce-tab-classes');
    await tapKey(tester, 'ce-set-class-c1a');
    await tapKey(tester, 'ce-class-remove');
    expect(find.text('Remove 1st PUC A?'), findsOneWidget);
    expect(find.textContaining('Its 4 periods come off the timetable.'), findsOneWidget);
    expect(find.textContaining('marks, mock tests and lesson progress stay saved'), findsOneWidget);
    await tapKey(tester, 'ce-confirm-ok');
    expect(board.classroom.classById('c1a'), isNull);
    expect(board.classroom.slots.where((s) => s.classId == 'c1a'), isEmpty);
    await tapKey(tester, 'ce-undo');
    expect(board.classroom.classById('c1a'), isNotNull);
    expect(board.classroom.slots.where((s) => s.classId == 'c1a'), hasLength(4));

    // A period: removed after the confirmation; the Undo goes after 10 seconds.
    await tapKey(tester, 'ce-tab-timetable');
    await tapKey(tester, 'ce-set-slot-p1');
    await tapKey(tester, 'ce-slot-remove');
    expect(find.textContaining('Monday 9:50–10:45, 1st PUC A · Physics, comes off the timetable.'), findsOneWidget);
    await tapKey(tester, 'ce-confirm-ok');
    expect(board.classroom.slots.where((s) => s.id == 'p1'), isEmpty);
    expect(find.byKey(const Key('ce-undo')), findsOneWidget);
    await tester.pump(const Duration(seconds: 9));
    expect(find.byKey(const Key('ce-undo')), findsOneWidget, reason: 'still there after 9 seconds');
    await tester.pump(const Duration(seconds: 2));
    await settle(tester);
    expect(find.byKey(const Key('ce-undo')), findsNothing);
    expect(board.classroom.slots.where((s) => s.id == 'p1'), isEmpty);
    await closeBoard(tester, board);
  });
}
