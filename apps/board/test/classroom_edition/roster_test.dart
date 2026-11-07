import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/local/classroom_store.dart';
import 'package:kinetix_board/classroom_edition/local/local_class.dart';
import 'package:kinetix_board/core/device_store.dart';
import 'package:kinetix_board/core/secret_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../support/board_fonts.dart';
import 'ce_support.dart';

/// The Classroom edition keeps the college on the board: teachers, classes (roll numbers only),
/// the timetable and the school PIN, in the board's settings store.
void main() {
  setUpAll(loadBoardFonts);
  tearDown(() => Edition.classroom = Edition.built == 'classroom');

  ClassroomStore fresh() => ClassroomStore(store: DeviceStore(secrets: MemorySecretStore()), now: () => ceMonday);

  test('teachers, classes, periods and the PIN are saved and come back', () async {
    SharedPreferences.setMockInitialValues({});
    final a = fresh();
    await a.load();
    expect(a.classes, hasLength(5));
    expect(a.checkPin('1234'), isTrue);
    final t = await a.addTeacher('  Lakshmi Rao ', subject: 'Physics');
    final c = await a.addClass(year: 2, section: 'c', stream: 'Science', rollCount: 35);
    await a.addSlot(CeSlot(id: '', weekday: 1, start: '09:50', end: '10:45', classId: c.id, subject: 'Physics', teacherId: t.id, room: 'Room 12'));
    await a.updateClass(c.copyWith(rollCount: 38));
    await a.updateTeacher(t.copyWith(subject: 'Physics and Maths'));
    await a.setPin('4321');
    await a.setShowAllTools(true);
    await a.markTourSeen();

    final b = fresh();
    await b.load();
    expect(b.teachers.single.name, 'Lakshmi Rao');
    expect(b.teachers.single.subject, 'Physics and Maths');
    final cls = b.classes.last;
    expect((cls.name, cls.stream, cls.rollCount, cls.grade), ('2nd PUC C', 'Science', 38, 12));
    expect(b.rollsOf(cls.id), [for (var i = 1; i <= 38; i++) i]);
    expect(b.slotNow()!.room, 'Room 12');
    expect(b.classesOf(t.id), '2nd PUC C');
    expect(b.checkPin('1234'), isFalse);
    expect(b.checkPin('4321'), isTrue);
    expect(b.showAllTools, isTrue);
    expect(b.tourSeen, isTrue);
    // Never the PIN itself in storage.
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('setting.${ClassroomStore.pinKey}'), isNot(contains('4321')));

    // Removing a teacher keeps their periods (without a teacher); removing a class drops its periods.
    await b.removeTeacher(t.id);
    expect(b.slots.single.teacherId, isNull);
    await b.removeClass(cls.id);
    expect(b.slots, isEmpty);
    final c2 = fresh();
    await c2.load();
    expect(c2.teachers, isEmpty);
    expect(c2.slots, isEmpty);
    expect(c2.classes, hasLength(5));
  });

  test('the timetable: the period on now, the next one, the period number', () async {
    SharedPreferences.setMockInitialValues({});
    final s = fresh();
    await s.load();
    await s.replace(sampleCollege());
    expect(s.slotNow()!.id, 'p1');
    expect(s.periodNumber(s.slotNow()!), 2);
    s.now = () => DateTime(2026, 11, 9, 10, 50); // between periods
    expect(s.slotNow(), isNull);
    expect(s.slotNowOrNext()!.id, 'p2');
    expect(s.slotNowOrNext(teacherId: 'ks'), isNull);
    expect(s.today(teacherId: 'lr').map((x) => x.id), ['p1', 'p2', 'p3', 'p4']);
  });

  test('a local class roster is roll numbers only', () {
    const c = CeClass(id: 'x', year: 1, section: 'A', rollCount: 3);
    final r = rollRoster(c);
    expect([for (final s in r) (s.id, s.rollNo, s.fullName)], [('roll-1', '1', 'Roll 1'), ('roll-2', '2', 'Roll 2'), ('roll-3', '3', 'Roll 3')]);
    expect(rollOf(r[1]), 2);
  });

  testWidgets('Settings ask for the school PIN, then edit classes, teachers and the timetable', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpApp(tester, board);
    await tapKey(tester, 'ce-settings');
    await tester.enterText(find.byKey(const Key('ce-pin')), '0000');
    await tapKey(tester, 'ce-pin-ok');
    expect(find.text('That is not the school PIN.'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('ce-pin')), '1234');
    await tapKey(tester, 'ce-pin-ok');
    expect(find.byKey(const Key('ce-settings-page')), findsOneWidget);

    // Classes: a new class with its number of students.
    await tapKey(tester, 'ce-tab-classes');
    await tapKey(tester, 'ce-set-add-class');
    await tapKey(tester, 'ce-class-year');
    await tester.tap(find.text('2nd PUC').last);
    await settle(tester);
    await tester.enterText(find.byKey(const Key('ce-class-section')), 'c');
    await tester.enterText(find.byKey(const Key('ce-class-rolls')), '35');
    await tapKey(tester, 'ce-class-save');
    final added = board.classroom.classes.last;
    expect((added.name, added.rollCount), ('2nd PUC C', 35));
    expect(find.text('Roll numbers 1–35'), findsOneWidget);

    // The timetable: a period for it.
    await tapKey(tester, 'ce-tab-timetable');
    await tapKey(tester, 'ce-set-add-slot');
    await tester.enterText(find.byKey(const Key('ce-slot-start')), '16:00');
    await tester.enterText(find.byKey(const Key('ce-slot-end')), '15:00');
    await tapKey(tester, 'ce-slot-save');
    expect(find.textContaining('must end after it starts'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('ce-slot-end')), '16:45');
    await tester.enterText(find.byKey(const Key('ce-slot-subject')), 'Biology');
    await tapKey(tester, 'ce-slot-save');
    expect(board.classroom.slots.last.subject, 'Biology');
    expect(board.classroom.slots.last.start, '16:00');

    // The PIN.
    await tapKey(tester, 'ce-tab-college');
    await tapKey(tester, 'ce-change-pin');
    await tester.enterText(find.byKey(const Key('ce-new-pin')), '2468');
    await tester.enterText(find.byKey(const Key('ce-new-pin-again')), '2468');
    await tapKey(tester, 'ce-new-pin-save');
    expect(board.classroom.checkPin('2468'), isTrue);
    await tester.pump(const Duration(seconds: 5));

    // All of it is on the board after a restart.
    final again = ClassroomStore(store: board.deviceStore);
    await tester.runAsync(again.load);
    expect(again.classes.last.rollCount, 35);
    expect(again.slots.last.subject, 'Biology');
    expect(again.checkPin('2468'), isTrue);
    await closeBoard(tester, board);
  });
}
