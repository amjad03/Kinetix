import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/local/classroom_store.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/device_store.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/core/secret_store.dart';
import 'package:kinetix_board/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Monday 9 November 2026, 10:05: the 2nd period (9:50–10:45) is on.
final ceMonday = DateTime(2026, 11, 9, 10, 5);

/// A PU college as the design shows it (with 1st PUC A on a 1st PUC chapter; the design had
/// put Electric Charges and Fields, a 2nd PUC chapter, there): six teachers, five classes of 40, Monday's timetable.
CeSetup sampleCollege() {
  const teachers = [
    CeTeacher(id: 'lr', name: 'Lakshmi Rao', subject: 'Physics', colour: 0),
    CeTeacher(id: 'mi', name: 'Mohammed Irfan', subject: 'Chemistry', colour: 1),
    CeTeacher(id: 'ks', name: 'Kavya Shetty', subject: 'Mathematics', colour: 2),
    CeTeacher(id: 'pg', name: 'Prakash Gowda', subject: 'Biology', colour: 3),
    CeTeacher(id: 'sn', name: 'Shalini Nair', subject: 'English', colour: 4),
    CeTeacher(id: 'rk', name: 'Ravi Kulkarni', subject: 'Kannada', colour: 5),
  ];
  CeSlot slot(String id, int day, String a, String b, String cls, String subject, String t, {String room = '', String topic = ''}) =>
      CeSlot(id: id, weekday: day, start: a, end: b, classId: cls, subject: subject, teacherId: t, room: room, topic: topic);
  return CeSetup(
    college: 'Soundarya PU College',
    teachers: teachers,
    classes: CeSetup.starter.classes,
    slots: [
      slot('p0', 1, '08:55', '09:50', 'c1b', 'Mathematics', 'ks'),
      // Each topic is a chapter of its class's year (puc_years_test.dart checks): Units and
      // Measurement is 1st PUC, Current Electricity 2nd PUC.
      slot('p1', 1, '09:50', '10:45', 'c1a', 'Physics', 'lr', room: 'Room 12', topic: 'Units and Measurement'),
      slot('p2', 1, '11:00', '11:55', 'c2b', 'Physics', 'lr', topic: 'Current Electricity'),
      slot('p3', 1, '13:30', '14:25', 'c1c', 'Physics', 'lr', topic: 'Practical: Vernier callipers'),
      slot('p4', 1, '14:30', '15:25', 'c2a', 'Physics', 'lr', topic: 'Revision: electrostatics'),
      slot('m1', 2, '08:55', '09:50', 'c1a', 'Chemistry', 'mi'),
      slot('m2', 2, '09:50', '10:45', 'c1b', 'Chemistry', 'mi'),
      slot('m3', 2, '11:00', '11:55', 'c2a', 'Chemistry', 'mi'),
      slot('k1', 2, '13:30', '14:25', 'c1a', 'Mathematics', 'ks'),
      slot('k2', 3, '13:30', '14:25', 'c1c', 'Mathematics', 'ks'),
      slot('b1', 3, '08:55', '09:50', 'c1b', 'Biology', 'pg'),
      slot('b2', 3, '09:50', '10:45', 'c2a', 'Biology', 'pg'),
      slot('b3', 3, '11:00', '11:55', 'c2b', 'Biology', 'pg'),
      slot('e1', 4, '08:55', '09:50', 'c1a', 'English', 'sn'),
      slot('e2', 4, '09:50', '10:45', 'c1b', 'English', 'sn'),
      slot('e3', 4, '11:00', '11:55', 'c1c', 'English', 'sn'),
      slot('r1', 5, '08:55', '09:50', 'c2a', 'Kannada', 'rk'),
      slot('r2', 5, '09:50', '10:45', 'c2b', 'Kannada', 'rk'),
      slot('l1', 2, '14:30', '15:25', 'c1c', 'Physics', 'lr'),
    ],
  );
}

/// A Classroom edition board with no ERP enrolment, started; [seed] is written to its store
/// first (as Settings would have), the clock is [ceMonday].
Future<BoardController> classroomBoard({CeSetup? seed, Map<String, Object> prefs = const {}, bool tourSeen = true}) async {
  Edition.classroom = true;
  SharedPreferences.setMockInitialValues({...prefs, if (tourSeen) 'setting.${ClassroomStore.tourKey}': 'true'});
  final store = DeviceStore(secrets: MemorySecretStore());
  final board = BoardController(store: store, outboxStore: MemoryOutboxStore());
  board.classroom.now = () => ceMonday;
  if (seed != null) {
    await board.classroom.load();
    await board.classroom.replace(seed);
  }
  await board.start();
  return board;
}

/// Pumps the whole app at [size] on [board].
Future<void> pumpApp(WidgetTester tester, BoardController board, {Size size = const Size(1920, 1080)}) async {
  tester.view
    ..physicalSize = size
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(KinetixBoardApp(controller: board));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
}

/// Pumps a few frames (the board's timers never let pumpAndSettle finish).
Future<void> settle(WidgetTester tester, [int frames = 8]) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> tapKey(WidgetTester tester, String key) async {
  final f = find.byKey(Key(key));
  expect(f, findsWidgets, reason: key);
  await tester.tap(f.first, warnIfMissed: false);
  await settle(tester);
}

/// The app on [board].
Widget appFor(BoardController board) => KinetixBoardApp(controller: board);

/// Ends the test's board: the local class's session timer is cancelled and the tree goes.
Future<void> closeBoard(WidgetTester tester, BoardController board) async {
  if (board.session != null) board.showClassroomStart();
  await tester.pumpWidget(const SizedBox());
  // The shared-board idle lock's timer (10 minutes after the last touch) runs out.
  await tester.pump(const Duration(minutes: 11));
}
