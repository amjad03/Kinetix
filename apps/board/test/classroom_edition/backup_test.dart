import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/backup/backup.dart';
import 'package:kinetix_board/classroom_edition/backup/backup_page.dart';
import 'package:kinetix_board/classroom_edition/backup/marks_export.dart';
import 'package:kinetix_board/classroom_edition/backup/public_documents.dart';
import 'package:kinetix_board/classroom_edition/boards/board_library.dart';
import 'package:kinetix_board/classroom_edition/class_tools/class_records.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/local/classroom_store.dart';
import 'package:kinetix_board/classroom_edition/start/classroom_start.dart';
import 'package:kinetix_board/core/crash/crash_log.dart';
import 'package:kinetix_board/core/device_store.dart';
import 'package:kinetix_board/core/secret_store.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:shared_preferences/shared_preferences.dart';

import '../support/board_fonts.dart';
import 'ce_support.dart';

const _records = {
  'v': 1,
  'quizzes': [
    {'at': '2026-11-09T10:10:00.000', 'q': 'q1', 'ch': 'phy1', 'r': [1, 2], 'w': [3]},
    {'at': '2026-11-09T10:12:00.000', 'q': 'q2', 'ch': 'phy1', 'r': [1], 'w': [2, 3]},
  ],
  'mocks': [
    {'id': 'm1', 'at': '2026-11-02T09:00:00.000', 't': 'Mock test 1', 'max': 25, 'm': {'1': 20, '2': 15.5}},
  ],
};

SavedBoard _board() => SavedBoard(
  background: BoardBackground.plain,
  canvas: const Size(1920, 1080),
  pages: [
    [TextElement(id: 't', position: const Offset(10, 10), text: 'Coulomb', color: const Color(0xFF000000), fontSize: 20, size: const Size(80, 24))],
  ],
);

/// Backup & restore: one versioned zip of everything the college keeps on the board, on the
/// board, in Documents/Zynetix and on a USB drive; a daily backup kept 14 days; restore after
/// a preview and the PIN; marks as CSV and PDF.
void main() {
  setUpAll(() async {
    await loadBoardFonts();
    SchoolPin.iterations = 1000;
  });
  late Directory tmp;
  late MemoryDocuments docs;
  var clock = ceMonday;
  setUp(() {
    tmp = Directory.systemTemp.createTempSync('ce-backup');
    clock = ceMonday;
    docs = MemoryDocuments();
    PublicDocuments.instance = docs;
    LocalBoardLibrary.instance = LocalBoardLibrary(root: () async => Directory('${tmp.path}/boards'), now: () => clock);
    CrashLog.instance = CrashLog(dir: () async => Directory('${tmp.path}/logs'));
    BackupService.dirOverride = () async => Directory('${tmp.path}/backups');
  });
  tearDown(() {
    Edition.classroom = Edition.built == 'classroom';
    BackupService.dirOverride = null;
    tmp.deleteSync(recursive: true);
  });

  Future<ClassroomStore> seeded() async {
    SharedPreferences.setMockInitialValues({
      'setting.classTools.c1a': jsonEncode(_records),
      'ce.lessons.c1a': jsonEncode({'topics': {}, 'last': 'phy1-t1'}),
      'setting.unrelated': 'left alone',
    });
    final s = ClassroomStore(store: DeviceStore(secrets: MemorySecretStore()), now: () => clock);
    await s.load();
    await s.replace(sampleCollege());
    await s.setPin('2580');
    await s.verifyPin('0000'); // a lockout count, which is never carried
    await LocalBoardLibrary.instance.save(_board(), title: 'Coulomb’s law', teacherId: 'lr', classId: 'c1a', className: '1st PUC A');
    await CrashLog.instance.record(StateError('boom'), null, source: 'test');
    return s;
  }

  test('a backup carries the set-up, PIN, marks, lessons, boards and crash log, and reads back', () async {
    final s = await seeded();
    final b = await BackupService(store: s).collect();
    expect(b.settings.keys, containsAll(['setting.classroom.setup', 'setting.classroom.pin', 'setting.classroom.pinRecovery', 'setting.classTools.c1a', 'ce.lessons.c1a']));
    expect(b.settings.keys, isNot(contains('setting.classroom.pinLockout')));
    expect(b.settings.keys, isNot(contains('setting.unrelated')));
    expect(b.files.keys.where((k) => k.startsWith('boards/lr/c1a/')), hasLength(2));
    expect(b.files.keys, contains('logs/crash.log'));

    final again = ClassroomBackup.decode(b.encode());
    final m = again.summary;
    expect((m.college, m.teachers, m.classes, m.periods), ('Soundarya PU College', 6, 5, 19));
    expect((m.marksClasses, m.mockTests, m.quizMarks, m.lessonClasses, m.boards, m.hasPin), (1, 1, 2, 1, 1, true));
    expect(again.setup!.teachers.first.name, 'Lakshmi Rao');
    expect(utf8.decode(again.files['logs/crash.log']!), contains('boom'));

    // Anything else is refused clearly.
    expect(() => ClassroomBackup.decode(Uint8List.fromList(utf8.encode('hello'))), throwsA(isA<BackupFormatException>()));
    expect(ClassroomBackup.decode(ClassroomBackup(summary: m, settings: b.settings).encode()).summary.kind, 'manual');
  });

  test('Back up now: on the board and in Documents/Zynetix, the last 10 kept', () async {
    final s = await seeded();
    final service = BackupService(store: s);
    for (var i = 0; i < 12; i++) {
      clock = ceMonday.add(Duration(minutes: i));
      final r = await service.backUpNow();
      expect(r.onBoard.existsSync(), isTrue);
      expect(r.publicPath, 'Documents/Zynetix/${r.name}');
    }
    expect((await service.onBoard()).where((b) => b.kind == 'manual'), hasLength(10));
    expect(await docs.list('Zynetix'), hasLength(10));
    expect((await docs.list('Zynetix')).first, startsWith('zynetix-backup-2026-11-09-'));
  });

  test('the daily backup: once a day, the last 14 days kept on the board and in Documents', () async {
    final s = await seeded();
    final service = BackupService(store: s);
    expect(await service.ensureDaily(), isNotNull);
    expect(await service.ensureDaily(), isNull, reason: 'one a day');
    for (var d = 1; d < 20; d++) {
      clock = ceMonday.add(Duration(days: d));
      expect(await service.ensureDaily(), isNotNull);
    }
    final daily = (await service.onBoard()).where((b) => b.kind == 'daily').map((b) => b.name).toList()..sort();
    expect(daily, hasLength(14));
    expect(daily.first, 'zynetix-daily-2026-11-15.zip');
    expect(daily.last, 'zynetix-daily-2026-11-28.zip');
    expect(await docs.list(BackupService.dailyFolder), hasLength(14));
  });

  test('restore puts the backup in place of what is there, and backs that up first', () async {
    final s = await seeded();
    final service = BackupService(store: s);
    final backup = await service.collect();
    // The board changes after the backup.
    await s.addTeacher('Anil Kumar');
    await s.replace(s.setup.copyWith(college: 'Another college'));
    final p = await SharedPreferences.getInstance();
    await p.setString('setting.classTools.c2b', '{"v":1,"mocks":[]}');
    await LocalBoardLibrary.instance.save(_board(), title: 'Later board', teacherId: 'ks', classId: 'c1b');
    final lockout = p.getString('setting.classroom.pinLockout');

    await service.restore(backup);
    expect(s.college, 'Soundarya PU College');
    expect(s.teachers, hasLength(6));
    expect(p.getString('setting.classTools.c2b'), isNull, reason: 'only what the backup has');
    expect(p.getString('setting.classTools.c1a'), isNotNull);
    expect(p.getString('setting.unrelated'), 'left alone');
    expect(p.getString('setting.classroom.pinLockout'), lockout, reason: 'the lockout is the board’s own');
    expect([for (final e in await LocalBoardLibrary.instance.list()) e.title], ['Coulomb’s law']);
    expect((await s.verifyPin('2580')).ok, isTrue);
    final before = (await service.onBoard()).where((b) => b.kind == 'before-restore').single;
    expect(ClassroomBackup.decode(before.file.readAsBytesSync()).summary.college, 'Another college');
  });

  test('marks: each mock test and each day’s class quiz, as CSV (every roll number) and PDF', () async {
    final r = ClassRecords.fromJson(_records);
    final tests = marksTests(r);
    expect([for (final t in tests) (t.title, t.outOf)], [('Mock test 1', 25.0), ('Class quiz', 2.0)]);
    expect(tests[1].marks, {1: 2.0, 2: 1.0, 3: 0.0});
    const cls = CeClass(id: 'c1a', year: 1, section: 'A', rollCount: 4);
    final csv = marksCsv(college: 'Soundarya PU College', cls: cls, subject: 'Physics', test: tests[0]);
    expect(csv, contains('Class,1st PUC A'));
    expect(csv, contains('Roll No.,Marks,Out of,Percent'));
    expect(csv, contains('1,20,25,80'));
    expect(csv, contains('2,15.5,25,62'));
    expect(csv, contains('4,Absent,25,'));
    expect(csv, isNot(contains('Lakshmi')));
    expect(csvBytes(csv).sublist(0, 3), [0xEF, 0xBB, 0xBF]);
    final all = allMarksCsv(college: '', cls: cls, subject: '', tests: tests);
    expect(all, contains('3,Absent,0'));
    expect(marksFileName(cls, tests[0], 'csv'), '1st-PUC-A_mock-test-1_2026-11-02.csv');
    final pdf = await marksPdf(college: 'Soundarya PU College', cls: cls, subject: 'Physics', test: tests[0], theme: pw.ThemeData.base());
    expect(utf8.decode(pdf.sublist(0, 5)), '%PDF-');
  });

  Future<void> io(WidgetTester tester, [int rounds = 30]) async {
    for (var i = 0; i < rounds; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 15)));
      await tester.pump();
    }
  }

  testWidgets('Settings → Backup & restore: back up now, copy to a USB drive, export marks', (tester) async {
    final saved = <String>[];
    CeFiles.saveAs = (name, bytes, mime) async {
      saved.add(name);
      return true;
    };
    CeFiles.print = (pdf, name) async {};
    final board = (await tester.runAsync(() async {
      final b = await classroomBoard(seed: sampleCollege(), prefs: {'setting.classTools.c1a': jsonEncode(_records)});
      await b.classroom.setPin('2580');
      return b;
    }))!;
    await pumpApp(tester, board);
    await openCeSettings(tester, pin: '2580');
    await tapKey(tester, 'ce-tab-backup');
    await io(tester);
    expect(find.byKey(const Key('ce-backup-tab')), findsOneWidget);
    await tapKey(tester, 'ce-backup-now');
    await io(tester, 60);
    expect(find.byKey(const Key('ce-backup-done')), findsOneWidget);
    expect(find.textContaining('in Documents/Zynetix/zynetix-backup-'), findsOneWidget);
    await tapKey(tester, 'ce-backup-usb');
    await io(tester, 5);
    expect(saved.single, startsWith('zynetix-backup-'));

    await tester.ensureVisible(find.byKey(const Key('ce-marks-csv-mock-m1')));
    await settle(tester);
    await tester.tap(find.byKey(const Key('ce-marks-csv-mock-m1')));
    await io(tester, 5);
    expect(docs.files.keys, contains('Zynetix/Marks/1st-PUC-A_mock-test-1_2026-11-02.csv'));
    expect(utf8.decode(docs.files['Zynetix/Marks/1st-PUC-A_mock-test-1_2026-11-02.csv']!), contains('1,20,25,80'));
    await closeBoard(tester, board);
  });

  testWidgets('restore from a file: the preview says what is in it, then the PIN, then it is in place', (tester) async {
    final board = (await tester.runAsync(() async {
      final b = await classroomBoard(seed: sampleCollege());
      await b.classroom.setPin('2580');
      return b;
    }))!;
    // A backup from another board: a smaller college.
    final other = (await tester.runAsync(() async {
      await board.classroom.replace(CeSetup(college: 'Vidya PU College', classes: CeSetup.starter.classes.take(2).toList()));
      final bytes = (await BackupService(store: board.classroom).collect()).encode();
      await board.classroom.replace(sampleCollege());
      return bytes;
    }))!;
    CeFiles.pickBackup = () async => other;
    await pumpApp(tester, board);
    await openCeSettings(tester, pin: '2580');
    await tapKey(tester, 'ce-tab-backup');
    await io(tester);
    await tapKey(tester, 'ce-restore-file');
    await io(tester, 5);
    expect(find.byKey(const Key('ce-restore-preview')), findsOneWidget);
    expect(find.text('Vidya PU College'), findsOneWidget);
    expect(find.text('2 classes'), findsOneWidget);
    expect(find.textContaining('It replaces what is on this board now (6 teachers, 5 classes, 19 periods)'), findsOneWidget);
    await tapKey(tester, 'ce-restore-ok');
    expect(find.text('Restoring a backup replaces the college’s set-up, marks and boards on this board. It needs the school PIN.'), findsOneWidget);
    await typePin(tester, '2580');
    await io(tester, 60);
    expect(board.classroom.college, 'Vidya PU College');
    expect(board.classroom.classes, hasLength(2));
    expect(find.textContaining('Restored the backup from'), findsOneWidget);
    await closeBoard(tester, board);
  });

  testWidgets('a damaged set-up offers Restore a backup on the start screen', (tester) async {
    var asked = 0;
    final keep = ClassroomStart.restoreBackup;
    ClassroomStart.restoreBackup = (context, store) async => asked++;
    addTearDown(() => ClassroomStart.restoreBackup = keep);
    final board = (await tester.runAsync(() async {
      final b = await classroomBoard(seed: sampleCollege());
      final p = await SharedPreferences.getInstance();
      await p.setString('setting.classroom.setup', '{"broken');
      await p.remove('setting.classroom.setup.prev');
      await b.classroom.load();
      return b;
    }))!;
    await pumpApp(tester, board);
    expect(find.textContaining('showing the standard classes for now'), findsOneWidget);
    await tapKey(tester, 'ce-setup-restore');
    expect(asked, 1);
    await closeBoard(tester, board);
  });
}
