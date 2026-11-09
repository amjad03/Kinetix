import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/local/classroom_store.dart';
import 'package:kinetix_board/classroom_edition/settings/timetable_editor.dart';

import '../support/board_fonts.dart';
import 'ce_support.dart';

/// Timetable editing without typing times (P1 item 11): bell times, a touch time picker,
/// clashes warned about, Copy this day to… and Clear day with confirmation and Undo.
void main() {
  setUpAll(loadBoardFonts);
  tearDown(() => Edition.classroom = Edition.built == 'classroom');

  CeSlot slot(String id, int day, String a, String b, String cls, String? t) => CeSlot(id: id, weekday: day, start: a, end: b, classId: cls, subject: 'Physics', teacherId: t);

  test('clashes: the same teacher or the same class at an overlapping time that day', () async {
    final store = ClassroomStore();
    store.setup = CeSetup(
      classes: const [CeClass(id: 'a', year: 1, section: 'A'), CeClass(id: 'b', year: 1, section: 'B')],
      slots: [
        slot('1', 1, '09:00', '09:55', 'a', 'lr'),
        slot('2', 1, '09:30', '10:25', 'b', 'lr'), // same teacher, overlapping
        slot('3', 1, '09:55', '10:50', 'a', 'ks'), // same class, but starts as 1 ends: no clash
        slot('4', 1, '10:00', '10:30', 'a', 'mi'), // same class as 3, overlapping
        slot('5', 2, '09:00', '09:55', 'b', 'lr'), // another day
        slot('6', 1, '09:00', '09:55', 'b', null), // same class as 2 (overlapping), no teacher
      ],
    );
    final c1 = store.clashesWith(store.slots[0]);
    expect([for (final c in c1) (c.slot.id, c.sameTeacher, c.sameClass)], [('2', true, false)]);
    expect([for (final c in store.clashesWith(store.slots[2])) c.slot.id], ['4']);
    expect([for (final c in store.clashesWith(store.slots[4])) c.slot.id], isEmpty);
    expect([for (final c in store.clashesWith(store.slots[5])) c.slot.id], ['2']);
    expect(store.hasClashes, isTrue);
  });

  test('bell times are saved with the set-up; Copy this day and Clear day', () async {
    final store = (await classroomBoard(seed: sampleCollege())).classroom;
    await store.setBells(ceBellPresets.first.bells);
    final again = ClassroomStore(store: store.deviceStore);
    await again.load();
    expect(again.bells, ceBellPresets.first.bells);
    final monday = store.slots.where((s) => s.weekday == 1).length;
    expect(monday, greaterThan(0));
    await store.copyDay(1, {2, 3});
    for (final d in [2, 3]) {
      final day = store.slots.where((s) => s.weekday == d).toList();
      expect(day.length, monday);
      expect({for (final s in day) '${s.start} ${s.classId} ${s.subject}'}, {for (final s in store.slots.where((s) => s.weekday == 1)) '${s.start} ${s.classId} ${s.subject}'});
    }
    expect(store.slots.map((s) => s.id).toSet().length, store.slots.length, reason: 'copies get their own ids');
    await store.clearDay(2);
    expect(store.slots.where((s) => s.weekday == 2), isEmpty);
    expect(store.slots.where((s) => s.weekday == 1).length, monday);
  });

  testWidgets('Settings → Timetable: bell times, a period from the bells, a clash warned about, copy a day, clear a day', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    final store = board.classroom;
    await pumpApp(tester, board);
    await openCeSettings(tester);
    expect(find.byKey(const Key('ce-timetable')), findsOneWidget);
    Future<void> show(String key) async {
      await tester.ensureVisible(find.byKey(Key(key)));
      await settle(tester, 2);
    }

    for (var d = 1; d <= 6; d++) {
      await show('ce-day-$d');
      expect(find.byKey(Key('ce-day-$d')), findsOneWidget, reason: 'every school day is shown');
    }


    // Bell times: a ready set.
    await show('ce-bells-edit');
    await tapKey(tester, 'ce-bells-edit');
    await tapKey(tester, 'ce-bells-preset-day');
    await tapKey(tester, 'ce-bells-save');
    expect(store.bells, ceBellPresets.first.bells);

    // A Saturday period from a bell: no typing.
    await show('ce-day-add-6');
    await tapKey(tester, 'ce-day-add-6');
    await tapKey(tester, 'ce-slot-bell-2');
    await tapKey(tester, 'ce-slot-save');
    final sat = store.slots.where((s) => s.weekday == 6 && s.start == '11:05').single;
    expect(sat.end, '12:00');

    // Lakshmi already teaches 1st PUC A at 9:50 on Monday: another class then clashes.
    final lr = store.slots.firstWhere((s) => s.weekday == 1 && s.teacherId == 'lr');
    await show('ce-day-add-1');
    await tapKey(tester, 'ce-day-add-1');
    Future<void> time(String button, String hhmm) async {
      final m = CeSlot.minuteOf(hhmm);
      await tapKey(tester, button);
      await tapKey(tester, 'ce-time-h-${m ~/ 60}');
      await tapKey(tester, 'ce-time-m-${m % 60}');
      await tapKey(tester, 'ce-time-ok');
    }

    await time('ce-slot-start', lr.start);
    await time('ce-slot-end', lr.end);
    await tester.tap(find.byKey(const Key('ce-slot-class')));
    await settle(tester);
    await tester.tap(find.text('2nd PUC A').last);
    await settle(tester);
    await tester.tap(find.byKey(const Key('ce-slot-teacher')));
    await settle(tester);
    await tester.tap(find.text('Lakshmi Rao').last);
    await settle(tester);
    expect(find.byKey(const Key('ce-slot-clash')), findsOneWidget);
    expect(find.textContaining('same teacher: Lakshmi Rao'), findsWidgets);
    final before = store.slots.length;
    await tapKey(tester, 'ce-slot-save');
    expect(find.byKey(const Key('ce-clash-confirm')), findsOneWidget);
    await tapKey(tester, 'ce-clash-back');
    expect(store.slots.length, before, reason: 'Go back saves nothing');
    await tapKey(tester, 'ce-slot-save');
    await tapKey(tester, 'ce-clash-save');
    expect(store.slots.length, before + 1);
    expect(find.byKey(const Key('ce-timetable-clashes')), findsOneWidget);
    expect(find.byKey(Key('ce-slot-clash-${lr.id}')), findsOneWidget);

    // Copy Monday to Tuesday: asks which days, then to replace Tuesday's periods; Undo.
    final monday = store.slots.where((s) => s.weekday == 1).length;
    final tuesday = store.slots.where((s) => s.weekday == 2).map((s) => s.id).toSet();
    await show('ce-day-copy-1');
    await tapKey(tester, 'ce-day-copy-1');
    await tapKey(tester, 'ce-copy-to-2');
    await tapKey(tester, 'ce-copy-day-go');
    expect(find.byKey(const Key('ce-confirm-remove')), findsOneWidget);
    await tapKey(tester, 'ce-confirm-ok');
    expect(store.slots.where((s) => s.weekday == 2).length, monday);
    await tapKey(tester, 'ce-undo');
    expect(store.slots.where((s) => s.weekday == 2).map((s) => s.id).toSet(), tuesday);

    // Clear Saturday: asks first, then Undo.
    await show('ce-day-clear-6');
    await tapKey(tester, 'ce-day-clear-6');
    await tapKey(tester, 'ce-confirm-cancel');
    expect(store.slots.where((s) => s.weekday == 6), isNotEmpty);
    await tapKey(tester, 'ce-day-clear-6');
    await tapKey(tester, 'ce-confirm-ok');
    expect(store.slots.where((s) => s.weekday == 6), isEmpty);
    await tapKey(tester, 'ce-undo');
    expect(store.slots.where((s) => s.weekday == 6), isNotEmpty);
    await closeBoard(tester, board);
  });

  testWidgets('the time picker: big hour and minute buttons', (tester) async {
    String? got;
    tester.view
      ..physicalSize = const Size(1920, 1080)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(home: Builder(builder: (context) => TextButton(onPressed: () async => got = await pickCeTime(context, title: 'Starts', initial: '09:50'), child: const Text('open')))));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(tester.getSize(find.byKey(const Key('ce-time-h-10'))).height, greaterThanOrEqualTo(64));
    await tester.tap(find.byKey(const Key('ce-time-h-14')));
    await tester.tap(find.byKey(const Key('ce-time-m-25')));
    await tester.pump();
    expect(tester.widget<Text>(find.byKey(const Key('ce-time-shown'))).data, '2:25 pm');
    await tester.tap(find.byKey(const Key('ce-time-ok')));
    await tester.pumpAndSettle();
    expect(got, '14:25');
  });
}
