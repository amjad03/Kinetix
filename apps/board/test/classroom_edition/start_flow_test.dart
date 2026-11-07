import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/local/classroom_store.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/features/enrollment/enroll_screen.dart';

import '../support/board_fonts.dart';
import 'ce_support.dart';

/// The Classroom edition starts offline, from the board's own timetable (screens 01 and 02).
void main() {
  setUpAll(loadBoardFonts);
  tearDown(() => Edition.classroom = Edition.built == 'classroom');

  testWidgets('no ERP enrolment: the start screen offers the period on now, and Start my class opens it', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    expect(board.stage, BoardStage.needsEnrollment);
    await pumpApp(tester, board);
    expect(find.byType(EnrollScreen), findsNothing);
    expect(find.text('Good morning, Lakshmi'), findsOneWidget);
    expect(find.text('Monday, 2nd period. Your class is ready on this board.'), findsOneWidget);
    expect(find.text('1st PUC A · Physics'), findsOneWidget);
    expect(find.text('Now · 9:50 – 10:45'), findsOneWidget);
    expect(find.text('Later today'), findsOneWidget);
    expect(find.text('2nd PUC B · Physics'), findsOneWidget);
    expect(find.byKey(const Key('ce-pair')), findsOneWidget);

    await tapKey(tester, 'ce-start-class');
    await settle(tester, 10);
    expect(board.stage, BoardStage.board);
    expect(board.localClass, isTrue);
    expect(board.isEnrolled, isFalse);
    final s = board.session!;
    expect((s.teacherName, s.sectionName, s.subjectName, s.periodLabel, s.institutionName), ('Lakshmi Rao', '1st PUC A', 'Physics', '09:50–10:45', 'Soundarya PU College'));
    // Roll numbers only: no student's name anywhere.
    expect(board.roster, hasLength(40));
    expect(board.roster.first.fullName, 'Roll 1');
    expect(board.roster.last.rollNo, '40');
    expect(board.classroom.currentClass!.name, '1st PUC A');
    expect(board.classroom.currentTeacher!.id, 'lr');
    // The class bar shows the class, the roll numbers to mark, and no Go live (no server).
    expect(find.text('1st PUC A · Physics'), findsWidgets);
    expect(find.text('40 students · Take attendance'), findsOneWidget);
    expect(find.byKey(const Key('go-live')), findsNothing);
    // Attendance is kept on the board only: nothing waits to go to a server.
    board.markAttendance({'roll-3': AttendanceMark.absent});
    expect(board.pickable, hasLength(39));

    // End class: back to the start screen for the next period.
    await tapKey(tester, 'board-menu');
    await tester.ensureVisible(find.byKey(const Key('end-class')));
    await settle(tester, 2);
    await tapKey(tester, 'end-class');
    await tapKey(tester, 'confirm-end');
    await settle(tester, 6);
    expect(board.stage, BoardStage.needsEnrollment);
    expect(board.session, isNull);
    expect(find.byKey(const Key('ce-start-class')), findsOneWidget);
    await closeBoard(tester, board);
  });

  testWidgets('who is teaching: pick a teacher, add one (no PIN), or teach as a guest', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpApp(tester, board);
    await tapKey(tester, 'ce-who');
    expect(find.text('Who’s teaching now?'), findsOneWidget);
    for (final n in ['Lakshmi Rao', 'Mohammed Irfan', 'Kavya Shetty', 'Prakash Gowda', 'Shalini Nair', 'Ravi Kulkarni', 'Add a teacher', 'Guest teacher']) {
      expect(find.text(n), findsOneWidget, reason: n);
    }
    expect(find.text('1st PUC A, C · 2nd PUC A, B'), findsOneWidget);

    // Add a teacher: name and subject, saved on the board.
    await tapKey(tester, 'ce-add-teacher');
    await tester.enterText(find.byKey(const Key('ce-teacher-name')), 'Anil Kumar');
    await tester.enterText(find.byKey(const Key('ce-teacher-subject')), 'Physics');
    await tapKey(tester, 'ce-teacher-save');
    expect(board.classroom.teachers.last.name, 'Anil Kumar');
    expect(find.text('Anil Kumar'), findsOneWidget);
    // The new teacher is picked; with no period of his own he takes the period on now.
    expect(find.text('Anil Kumar · 1st PUC A · Physics, now'), findsOneWidget);

    // A guest teaches the period on now.
    await tapKey(tester, 'ce-guest');
    await tapKey(tester, 'ce-who-start');
    await settle(tester, 10);
    expect(board.session!.teacherName, 'Guest teacher');
    expect(board.session!.sectionName, '1st PUC A');
    await closeBoard(tester, board);
  });

  testWidgets('off the timetable: the teacher picks the class', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard()))!;
    await pumpApp(tester, board);
    // A new board: the starter classes, nothing on the timetable.
    expect(board.classroom.classes.map((c) => c.name), ['1st PUC A', '1st PUC B', '1st PUC C', '2nd PUC A', '2nd PUC B']);
    expect(find.text('Teach any class now'), findsOneWidget);
    await tapKey(tester, 'ce-start-class');
    expect(find.byKey(const Key('ce-pick-class')), findsOneWidget);
    await tapKey(tester, 'ce-pick-c2b');
    await tester.enterText(find.byKey(const Key('ce-pick-subject')), 'Chemistry');
    await tapKey(tester, 'ce-pick-start');
    await settle(tester, 10);
    expect((board.session!.sectionName, board.session!.subjectName, board.roster.length), ('2nd PUC B', 'Chemistry', 40));
    await closeBoard(tester, board);
  });

  testWidgets('Pair with Teacher App runs the usual enrolment, and Back returns', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpApp(tester, board);
    await tapKey(tester, 'ce-pair');
    expect(find.byType(EnrollScreen), findsOneWidget);
    await tapKey(tester, 'ce-pair-back');
    expect(find.byType(EnrollScreen), findsNothing);
    expect(find.byKey(const Key('ce-start-class')), findsOneWidget);
    await closeBoard(tester, board);
  });

  testWidgets('the guided tour runs on the practice board the first time, and Practice board ends back on the start screen', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege(), tourSeen: false)))!;
    await pumpApp(tester, board);
    await tapKey(tester, 'ce-practice');
    await settle(tester, 10);
    expect(find.byKey(const Key('ce-coach')), findsOneWidget);
    expect(find.text('This is your Pen'), findsOneWidget);
    expect(find.byKey(const Key('ce-practice-banner')), findsOneWidget);
    for (final title in ['Pick a colour', 'Undo puts it back', 'Your lessons', 'Class tools']) {
      await tapKey(tester, 'ce-tour-next');
      expect(find.descendant(of: find.byKey(const Key('ce-coach-card')), matching: find.text(title)), findsOneWidget);
    }
    await tapKey(tester, 'ce-tour-next');
    expect(find.byKey(const Key('ce-coach')), findsNothing);
    expect(board.classroom.tourSeen, isTrue);
    expect(find.byKey(const Key('ce-end-practice')), findsOneWidget);
    await tapKey(tester, 'ce-end-practice');
    await settle(tester, 6);
    expect(board.stage, BoardStage.needsEnrollment);
    await closeBoard(tester, board);
  });

  testWidgets('the Simple board: seven big tools, What do I do now? and Show me; Show all tools is remembered', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpApp(tester, board);
    await tapKey(tester, 'ce-start-class');
    await settle(tester, 10);
    const simple = ['tool-pen', 'ce-colours', 'tool-erase', 'undo', 'ce-lessons', 'ce-class-tools', 'ce-show-all'];
    final xs = [for (final k in simple) tester.getCenter(find.byKey(Key(k))).dx];
    for (var i = 1; i < xs.length; i++) {
      expect(xs[i], greaterThan(xs[i - 1]), reason: simple[i]);
    }
    expect(find.byKey(const Key('tool-tools')), findsNothing);
    expect(find.byKey(const Key('toolbar-more')), findsNothing);
    expect(find.text('Pick the Pen and write today’s heading, or open Lessons.'), findsOneWidget);
    await tapKey(tester, 'ce-show-me');
    expect(find.byKey(const Key('ce-coach')), findsOneWidget);
    expect(find.text('This is your Pen'), findsOneWidget);
    await tapKey(tester, 'ce-tour-next');
    expect(find.byKey(const Key('ce-coach')), findsNothing);
    // Lessons and Class tools open the phase-2 panels.
    await tapKey(tester, 'ce-lessons');
    expect(find.byKey(const Key('ce-lessons-panel')), findsOneWidget);
    expect(find.byKey(const Key('panel-tab-lessons')), findsOneWidget);
    await tapKey(tester, 'panel-tab-classTools');
    expect(find.byKey(const Key('ce-class-tools-panel')), findsOneWidget);
    // Show all tools: the full toolbar, remembered on the board.
    await tapKey(tester, 'ce-show-all');
    expect(find.byKey(const Key('tool-tools')), findsOneWidget);
    expect(find.byKey(const Key('ce-what-now')), findsNothing);
    expect(board.classroom.showAllTools, isTrue);
    final again = ClassroomStore(store: board.deviceStore);
    await tester.runAsync(again.load);
    expect(again.showAllTools, isTrue);
    await closeBoard(tester, board);
  });
}
