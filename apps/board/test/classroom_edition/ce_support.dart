import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/local/classroom_store.dart';

export 'package:kinetix_board/classroom_edition/local/sample_college.dart' show sampleCollege;
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/device_store.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/core/secret_store.dart';
import 'package:kinetix_board/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Monday 9 November 2026, 10:05: the 2nd period (9:50–10:45) is on.
final ceMonday = DateTime(2026, 11, 9, 10, 5);

/// A Classroom edition board with no ERP enrolment, started; [seed] is written to its store
/// first (as Settings would have), the clock is [ceMonday].
/// [setupDone]: the set-up wizard was finished (the start screen shows straight away).
Future<BoardController> classroomBoard({CeSetup? seed, Map<String, Object> prefs = const {}, bool tourSeen = true, bool setupDone = true}) async {
  Edition.classroom = true;
  // PBKDF2 for the school PIN, cheap enough to check inside a widget test's fake clock.
  SchoolPin.iterations = 1000;
  SharedPreferences.setMockInitialValues({...prefs, if (tourSeen) 'setting.${ClassroomStore.tourKey}': 'true', if (setupDone) 'setting.${ClassroomStore.setupDoneKey}': 'true'});
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

/// Types [pin] on the school PIN's number pad and presses OK.
Future<void> typePin(WidgetTester tester, String pin) async {
  for (final d in pin.split('')) {
    await tester.tap(find.byKey(Key('ce-pin-key-$d')).last);
    await tester.pump();
  }
  await tester.tap(find.byKey(const Key('ce-pin-ok')).last);
  await settle(tester);
}

/// Answers the school PIN pad with [pin]; while the PIN is still 1234 the first set-up makes
/// the college choose [newPin] and shows the recovery code.
Future<void> enterSchoolPin(WidgetTester tester, {String pin = '1234', String newPin = '2580'}) async {
  await typePin(tester, pin);
  if (find.byKey(const Key('ce-new-pin-dialog')).evaluate().isNotEmpty) {
    await typePin(tester, newPin);
    await typePin(tester, newPin);
    await tapKey(tester, 'ce-recovery-done');
  }
}

/// Opens College settings from the start screen with [pin]; while the PIN is still 1234 the
/// first set-up makes the college choose [newPin] and shows the recovery code.
Future<void> openCeSettings(WidgetTester tester, {String pin = '1234', String newPin = '2580'}) async {
  await tapKey(tester, 'ce-settings');
  await typePin(tester, pin);
  if (find.byKey(const Key('ce-new-pin-dialog')).evaluate().isNotEmpty) {
    await typePin(tester, newPin);
    await typePin(tester, newPin);
    await tapKey(tester, 'ce-recovery-done');
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
