// Screenshots of the Classroom edition's P0 screens from the real code: the PIN pad, removing
// a teacher, the board library, Backup & restore, a damaged set-up, the crash screen
// (CE_SHOTS=<dir> to write them; without it the walk-through still runs as a test).
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/backup/backup.dart';
import 'package:kinetix_board/classroom_edition/backup/backup_page.dart';
import 'package:kinetix_board/classroom_edition/backup/public_documents.dart';
import 'package:kinetix_board/classroom_edition/boards/board_library.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/local/classroom_store.dart' show SchoolPin;
import 'package:kinetix_board/core/crash/crash_guard.dart';
import 'package:kinetix_board/core/crash/crash_log.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../support/screen_fonts.dart';
import 'ce_support.dart';

final _out = Platform.environment['CE_SHOTS'];

Future<void> shot(WidgetTester tester, String name) async {
  final out = _out;
  if (out == null) return;
  final box = tester.renderObject<RenderRepaintBoundary>(find.byKey(const Key('ce-shot')));
  final png = await tester.runAsync(() async {
    final img = await box.toImage();
    return (await img.toByteData(format: ui.ImageByteFormat.png))!.buffer.asUint8List();
  });
  Directory(out).createSync(recursive: true);
  File('$out/$name.png').writeAsBytesSync(png!);
}

const _records = {
  'v': 1,
  'quizzes': [
    {'at': '2026-11-06T10:10:00.000', 'q': 'q1', 'ch': 'phy1', 'r': [1, 2, 4, 5], 'w': [3]},
    {'at': '2026-11-06T10:12:00.000', 'q': 'q2', 'ch': 'phy1', 'r': [1, 4], 'w': [2, 3, 5]},
  ],
  'mocks': [
    {'id': 'm1', 'at': '2026-10-30T09:00:00.000', 't': 'Unit test 1', 'max': 35, 'm': {'1': 30, '2': 22.5, '3': 18}},
    {'id': 'm2', 'at': '2026-11-07T09:00:00.000', 't': 'Chapter test: Electric charges', 'max': 25, 'm': {'1': 21, '2': 19, '4': 24}},
  ],
};

void main() {
  setUpAll(() async {
    await loadScreenFonts();
    SchoolPin.iterations = 1000;
  });
  late Directory tmp;
  setUp(() {
    tmp = Directory.systemTemp.createTempSync('ce-shots');
    PublicDocuments.instance = MemoryDocuments();
    LocalBoardLibrary.instance = LocalBoardLibrary(root: () async => Directory('${tmp.path}/boards'), now: () => ceMonday);
    CrashLog.instance = CrashLog(dir: () async => Directory('${tmp.path}/logs'));
    BackupService.dirOverride = () async => Directory('${tmp.path}/backups');
  });
  tearDown(() {
    Edition.classroom = Edition.built == 'classroom';
    BackupService.dirOverride = null;
    CrashGuard.reset();
    tmp.deleteSync(recursive: true);
  });

  Future<void> pumpShot(WidgetTester tester, Widget app) async {
    tester.view
      ..physicalSize = const Size(1920, 1080)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(RepaintBoundary(key: const Key('ce-shot'), child: app));
    await settle(tester);
  }

  Future<void> io(WidgetTester tester, [int rounds = 30]) async {
    for (var i = 0; i < rounds; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 15)));
      await tester.pump();
    }
    await settle(tester, 4);
  }

  Future<void> digits(WidgetTester tester, String pin) async {
    for (final d in pin.split('')) {
      await tester.tap(find.byKey(Key('ce-pin-key-$d')).last);
      await tester.pump();
    }
  }

  testWidgets('PIN, teachers, settings, backup', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege(), prefs: {'setting.classTools.c1a': jsonEncode(_records)})))!;
    await pumpShot(tester, appFor(board));

    // The school PIN on its number pad, the first time (still 1234).
    await tapKey(tester, 'ce-settings');
    await digits(tester, '12');
    await settle(tester);
    await shot(tester, 'p0-01-pin-pad');
    await digits(tester, '34');
    await tapKey(tester, 'ce-pin-ok');
    await shot(tester, 'p0-02-pin-first-setup');
    await typePin(tester, '7777');
    await shot(tester, 'p0-03-pin-weak-refused');
    await typePin(tester, '2580');
    await typePin(tester, '2580');
    await shot(tester, 'p0-04-recovery-code');
    await tapKey(tester, 'ce-recovery-done');

    // Settings: removing a class asks first and can be undone.
    await tapKey(tester, 'ce-tab-classes');
    await tapKey(tester, 'ce-set-class-c1a');
    await shot(tester, 'p0-05-class-dialog-remove-apart');
    await tapKey(tester, 'ce-class-remove');
    await shot(tester, 'p0-06-remove-class-confirm');
    await tapKey(tester, 'ce-confirm-ok');
    await settle(tester, 4);
    await shot(tester, 'p0-07-undo-snackbar');
    await tapKey(tester, 'ce-undo');

    // Backup & restore.
    await tapKey(tester, 'ce-tab-backup');
    await io(tester);
    await tapKey(tester, 'ce-backup-now');
    await io(tester, 60);
    await shot(tester, 'p0-08-backup-restore');
    await tester.ensureVisible(find.byKey(const Key('ce-marks-csv-mock-m2')));
    await settle(tester);
    await shot(tester, 'p0-09-export-marks');
    final bytes = (await tester.runAsync(() async => (await BackupService(store: board.classroom).collect()).encode()))!;
    CeFiles.pickBackup = () async => bytes;
    await tester.ensureVisible(find.byKey(const Key('ce-restore-file')));
    await settle(tester);
    await tapKey(tester, 'ce-restore-file');
    await io(tester, 5);
    await shot(tester, 'p0-10-restore-preview');
    await tester.tap(find.text('Cancel').last);
    await settle(tester);
    await tester.pageBack();
    await settle(tester);

    // Who's teaching: editing a teacher needs the PIN; Remove is apart from Save.
    await tapKey(tester, 'ce-who');
    await tester.longPress(find.byKey(const Key('ce-teacher-lr')));
    await settle(tester);
    await shot(tester, 'p0-11-teacher-edit-needs-pin');
    await typePin(tester, '2580');
    await shot(tester, 'p0-12-teacher-dialog');
    await tapKey(tester, 'ce-teacher-remove');
    await shot(tester, 'p0-13-remove-teacher-confirm');
    await tapKey(tester, 'ce-confirm-cancel');

    // Too many wrong PINs.
    await tester.longPress(find.byKey(const Key('ce-teacher-lr')));
    await settle(tester);
    for (var i = 0; i < 5; i++) {
      await typePin(tester, '0000');
    }
    await shot(tester, 'p0-14-pin-locked');
    await closeBoard(tester, board);
  });

  testWidgets('the board library', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpShot(tester, appFor(board));
    await tapKey(tester, 'ce-start-class');
    await settle(tester, 15);
    Future<void> stroke(Offset from, Offset step) async {
      final g = await tester.startGesture(from, pointer: 7, kind: PointerDeviceKind.touch);
      for (var i = 0; i < 12; i++) {
        await g.moveBy(step);
      }
      await g.up();
      await tester.pump();
    }

    Future<void> save(String title) async {
      await tapKey(tester, 'board-menu');
      await tester.ensureVisible(find.byKey(const Key('save-board')));
      await settle(tester);
      await tapKey(tester, 'save-board');
      await tester.enterText(find.byKey(const Key('ce-save-title')), title);
      await settle(tester);
      await tapKey(tester, find.byKey(const Key('ce-save-new')).evaluate().isNotEmpty ? 'ce-save-new' : 'ce-save-ok');
      await io(tester);
    }

    await stroke(const Offset(500, 400), const Offset(40, 12));
    await stroke(const Offset(500, 520), const Offset(40, -8));
    await tapKey(tester, 'board-menu');
    await tester.ensureVisible(find.byKey(const Key('save-board')));
    await settle(tester);
    await tapKey(tester, 'save-board');
    await shot(tester, 'p0-15-save-on-this-board');
    await tapKey(tester, 'ce-save-ok');
    await io(tester);
    await stroke(const Offset(900, 300), const Offset(10, 30));
    await save('Coulomb’s law: worked examples');
    await stroke(const Offset(1200, 600), const Offset(-30, 10));
    await save('Electric field lines');
    await tapKey(tester, 'board-menu');
    await tester.ensureVisible(find.byKey(const Key('menu-open')));
    await settle(tester);
    await shot(tester, 'p0-16-menu-no-share-no-history');
    await tapKey(tester, 'menu-open');
    await io(tester, 120);
    await shot(tester, 'p0-17-open-a-board');
    await tapKey(tester, 'ce-library-close');
    await closeBoard(tester, board);
  });

  testWidgets('damaged set-up, crash screen, offline panel', (tester) async {
    final board = (await tester.runAsync(() async {
      final b = await classroomBoard(seed: sampleCollege());
      final p = await SharedPreferences.getInstance();
      await p.setString('setting.classroom.setup', '{"broken');
      await b.classroom.load();
      return b;
    }))!;
    await pumpShot(tester, appFor(board));
    await shot(tester, 'p0-18-setup-could-not-be-read');
    await tapKey(tester, 'ce-setup-keep');
    await tapKey(tester, 'ce-start-class');
    if (find.byKey(const Key('ce-pick-class')).evaluate().isNotEmpty) {
      await tester.enterText(find.byKey(const Key('ce-pick-subject')), 'Physics');
      await tapKey(tester, 'ce-pick-start');
    }
    await settle(tester, 15);
    await tapKey(tester, 'ce-lessons');
    await io(tester, 80);
    await shot(tester, 'p0-19-panel-no-online-tabs');
    CrashGuard.backToStart = board.showClassroomStart;
    await tester.runAsync(() => CrashGuard.fatal(StateError('shot'), null));
    await settle(tester);
    await shot(tester, 'p0-20-something-went-wrong');
    await tapKey(tester, 'crash-back-to-start');
    await closeBoard(tester, board);
    await pumpShot(tester, SizedBox(width: 640, height: 360, child: friendlyErrorWidget(FlutterErrorDetails(exception: StateError('x')))));
    await shot(tester, 'p0-21-release-error-widget');
  });
}
