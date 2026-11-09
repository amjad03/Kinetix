import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/local/classroom_store.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/device_store.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/core/secret_store.dart';
import 'package:kinetix_board/demo/demo.dart';
import 'package:kinetix_board/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../support/board_fonts.dart';
import 'ce_support.dart';

/// The Classroom edition's demo build (KINETIX_DEMO=true) starts on a sample PU college kept
/// on the board, with roll numbers only: never the ERP demo server and its named students.
void main() {
  setUpAll(loadBoardFonts);
  tearDown(() => Edition.classroom = Edition.built == 'classroom');

  BoardController fresh() => BoardController(store: DeviceStore(secrets: MemorySecretStore()), outboxStore: MemoryOutboxStore());

  Future<void> started(BoardController b) async {
    for (var i = 0; i < 20 && b.stage == BoardStage.loading; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
  }

  test('the first start seeds the sample college into the board’s own store; later starts keep what changed', () async {
    Edition.classroom = true;
    SharedPreferences.setMockInitialValues({});
    final b = classroomDemoBoard(board: fresh());
    await started(b);
    expect(b.stage, BoardStage.needsEnrollment, reason: 'the start screen, not a demo server class');
    expect(b.session, isNull);
    expect(b.api, isNull);
    expect(b.classroom.college, 'Soundarya PU College');
    expect(b.classroom.teachers, hasLength(6));
    expect(b.classroom.classes.map((c) => c.name), ['1st PUC A', '1st PUC B', '1st PUC C', '2nd PUC A', '2nd PUC B']);
    expect(b.classroom.slots, isNotEmpty);
    final p = await SharedPreferences.getInstance();
    final saved = ClassroomStore.parseSetup(p.getString('setting.${ClassroomStore.setupKey}'))!;
    expect(saved.teachers, hasLength(6), reason: 'kept on the board like any set-up');
    // Roll numbers only: nothing in the set-up names a student.
    for (final name in ['Aarav', 'Diya', 'Corporate Accounting']) {
      expect(p.getString('setting.${ClassroomStore.setupKey}'), isNot(contains(name)));
    }

    await b.classroom.addTeacher('Anil Kumar');
    final again = classroomDemoBoard(board: fresh());
    await started(again);
    expect(again.classroom.teachers, hasLength(7), reason: 'the seed is only for a board with nothing saved');
  });

  testWidgets('the demo opens on the start screen with the sample timetable, and its class is roll numbers', (tester) async {
    Edition.classroom = true;
    final wasDemo = Demo.enabled;
    Demo.enabled = true;
    addTearDown(() => Demo.enabled = wasDemo);
    SharedPreferences.setMockInitialValues({'setting.${ClassroomStore.tourKey}': 'true'});
    SchoolPin.iterations = 1000;
    final board = classroomDemoBoard(board: fresh());
    board.classroom.now = () => ceMonday;
    await tester.runAsync(() => started(board));
    await pumpApp(tester, board);
    expect(find.text('Soundarya PU College'), findsOneWidget);
    expect(find.text('1st PUC A · Physics'), findsOneWidget);
    await tapKey(tester, 'ce-start-class');
    await settle(tester, 15);
    expect(board.localClass, isTrue);
    expect(board.roster.first.fullName, 'Roll 1');
    expect(board.roster, hasLength(40));
    // No ERP demo classes (named students) in the tools.
    await tapKey(tester, 'ce-show-all');
    await tapKey(tester, 'tool-tools');
    if (find.byKey(const Key('drawer-show-all')).evaluate().isNotEmpty) await tapKey(tester, 'drawer-show-all');
    expect(find.byKey(const Key('drawer-demo-classes')), findsNothing);
    expect(find.byKey(const Key('drawer-this-class')), findsNothing);
    await closeBoard(tester, board);
  });
}
