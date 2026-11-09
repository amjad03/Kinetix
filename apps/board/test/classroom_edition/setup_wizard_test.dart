import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/local/classroom_store.dart';
import 'package:kinetix_board/classroom_edition/settings/timetable_editor.dart';
import 'package:kinetix_board/classroom_edition/ui/ce_style.dart';

import '../support/board_fonts.dart';
import 'ce_support.dart';

/// The first-run set-up wizard (P1 item 10).
void main() {
  setUpAll(loadBoardFonts);
  tearDown(() => Edition.classroom = Edition.built == 'classroom');

  /// Scrolls [key] into view, then taps it.
  Future<void> tapShown(WidgetTester tester, String key) async {
    await tester.ensureVisible(find.byKey(Key(key)));
    await settle(tester, 2);
    await tapKey(tester, key);
  }

  Future<void> step(WidgetTester tester, int n) async {
    expect(find.byKey(Key('ce-wizard-step-$n')), findsOneWidget, reason: 'step $n');
  }

  testWidgets('a new board: college, classes, teachers, bell times, PIN, done — saved as it goes', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(setupDone: false)))!;
    final store = board.classroom;
    expect(store.needsSetup, isTrue);
    await pumpApp(tester, board);
    expect(find.byKey(const Key('ce-wizard')), findsOneWidget);
    expect(find.byKey(const Key('ce-start-class')), findsNothing);
    await step(tester, 1);
    expect(find.byKey(const Key('ce-wizard-back')), findsNothing, reason: 'no Back on the first step');
    expect(tester.getSize(find.byKey(const Key('ce-wizard-next'))).height, greaterThanOrEqualTo(ceTarget));

    // 1. The college.
    await tester.enterText(find.byKey(const Key('ce-wizard-college')), 'Vidya PU College');
    await tapKey(tester, 'ce-wizard-next');
    expect(store.college, 'Vidya PU College');

    // 2. Classes: the starter classes are there; one goes (Undo offered), one is added.
    await step(tester, 2);
    expect(store.classes, hasLength(5));
    await tester.tap(find.byTooltip('Remove 1st PUC C'));
    await settle(tester);
    expect(store.classes.map((c) => c.name), isNot(contains('1st PUC C')));
    expect(find.byKey(const Key('ce-undo')), findsOneWidget);
    await tapShown(tester, 'ce-wizard-year-2');
    await tapShown(tester, 'ce-wizard-section-C');
    await tapShown(tester, 'ce-wizard-stream-PCMB');
    await tapShown(tester, 'ce-wizard-rolls-plus-5');
    await tapShown(tester, 'ce-wizard-rolls-minus-1');
    expect(find.text('44'), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('ce-wizard-add-class')));
    await settle(tester, 2);
    await tapKey(tester, 'ce-wizard-add-class');
    final added = store.classes.last;
    expect((added.name, added.stream, added.rollCount), ('2nd PUC C', 'PCMB', 44));
    await tapKey(tester, 'ce-wizard-next');

    // 3. Teachers: name and subject.
    await step(tester, 3);
    expect(tester.widget<FilledButton>(find.byKey(const Key('ce-wizard-add-teacher'))).onPressed, isNull, reason: 'a name first');
    await tester.enterText(find.byKey(const Key('ce-wizard-teacher-name')), 'Asha Kulkarni');
    await tester.ensureVisible(find.byKey(const Key('ce-wizard-subject-Chemistry')));
    await settle(tester, 2);
    await tapKey(tester, 'ce-wizard-subject-Chemistry');
    await tester.ensureVisible(find.byKey(const Key('ce-wizard-add-teacher')));
    await settle(tester, 2);
    await tapKey(tester, 'ce-wizard-add-teacher');
    expect((store.teachers.single.name, store.teachers.single.subject), ('Asha Kulkarni', 'Chemistry'));
    // Back keeps what was done.
    await tapKey(tester, 'ce-wizard-back');
    await step(tester, 2);
    await tapKey(tester, 'ce-wizard-next');
    await tapKey(tester, 'ce-wizard-next');

    // 4. Bell times: a ready set, Monday to Saturday.
    await step(tester, 4);
    await tapKey(tester, 'ce-wizard-skip');
    await step(tester, 5);
    expect(store.bells, isEmpty, reason: 'Skip changes nothing');
    await tapKey(tester, 'ce-wizard-back');
    await tapShown(tester, 'ce-bells-preset-early');
    await tapKey(tester, 'ce-wizard-next');
    expect(store.bells, ceBellPresets[1].bells);

    // 5. The PIN: no skipping while it is 1234; the usual forced change and recovery code.
    await step(tester, 5);
    expect(find.byKey(const Key('ce-wizard-skip')), findsNothing);
    expect(tester.widget<FilledButton>(find.byKey(const Key('ce-wizard-next'))).onPressed, isNull);
    await tapKey(tester, 'ce-wizard-pin');
    await typePin(tester, '2580');
    await typePin(tester, '2580');
    await tapKey(tester, 'ce-recovery-done');
    expect(store.pinIsDefault, isFalse);
    expect(find.byKey(const Key('ce-wizard-pin-set')), findsOneWidget);
    await tapKey(tester, 'ce-wizard-next');

    // 6. Done, with the tour on offer.
    await step(tester, 6);
    expect(find.text('Classes: 5'), findsOneWidget);
    expect(find.text('Teachers: 1'), findsOneWidget);
    expect(find.byKey(const Key('ce-wizard-tour')), findsOneWidget);
    expect(store.setupDone, isTrue);
    await tapKey(tester, 'ce-wizard-finish');
    expect(find.byKey(const Key('ce-wizard')), findsNothing);
    expect(find.byKey(const Key('ce-start-class')), findsOneWidget);
    expect(find.text('Vidya PU College'), findsOneWidget);

    // A restart goes straight to the start screen.
    final again = ClassroomStore(store: store.deviceStore);
    await tester.runAsync(again.load);
    expect((again.setupDone, again.needsSetup, again.college), (true, false, 'Vidya PU College'));
    await closeBoard(tester, board);
  });

  testWidgets('every step but the PIN can be skipped; the tour runs on the practice board', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(setupDone: false, tourSeen: false)))!;
    await pumpApp(tester, board);
    for (var n = 1; n <= 4; n++) {
      await step(tester, n);
      await tapKey(tester, 'ce-wizard-skip');
    }
    await step(tester, 5);
    await tapKey(tester, 'ce-wizard-pin');
    await typePin(tester, '2580');
    await typePin(tester, '2580');
    await tapKey(tester, 'ce-recovery-done');
    await tapKey(tester, 'ce-wizard-next');
    await tapKey(tester, 'ce-wizard-tour');
    await settle(tester, 12);
    expect(board.localClass, isTrue);
    expect(find.byKey(const Key('ce-coach')), findsOneWidget);
    expect(find.byKey(const Key('ce-practice-banner')), findsOneWidget);
    await closeBoard(tester, board);
  });

  testWidgets('run again from Settings → This board, and closed without changes', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpApp(tester, board);
    expect(find.byKey(const Key('ce-wizard')), findsNothing, reason: 'a set-up board starts on the start screen');
    await openCeSettings(tester);
    await tapKey(tester, 'ce-tab-board');
    await tapKey(tester, 'ce-rerun-setup');
    await step(tester, 1);
    expect(tester.widget<TextField>(find.byKey(const Key('ce-wizard-college'))).controller!.text, 'Soundarya PU College');
    for (var n = 1; n <= 5; n++) {
      await tapKey(tester, 'ce-wizard-next');
    }
    await step(tester, 6);
    expect(find.byKey(const Key('ce-wizard-tour')), findsNothing, reason: 'the tour is for the first run');
    await tapKey(tester, 'ce-wizard-finish');
    expect(find.byKey(const Key('ce-settings-page')), findsOneWidget);
    expect(board.classroom.teachers, hasLength(6));
    await tapKey(tester, 'ce-rerun-setup');
    await tapKey(tester, 'ce-wizard-close');
    expect(find.byKey(const Key('ce-settings-page')), findsOneWidget);
    await closeBoard(tester, board);
  });
}
