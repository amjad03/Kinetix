import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/core/crash/crash_guard.dart';
import 'package:kinetix_board/core/crash/crash_log.dart';

import '../support/board_fonts.dart';
import 'ce_support.dart';

/// Crash handling: the autosave is written first, the error goes into a rotating log on the
/// board, a widget that cannot build shows a friendly card, and errors that keep coming bring
/// up "Something went wrong – Back to start".
void main() {
  setUpAll(loadBoardFonts);
  late Directory dir;
  setUp(() {
    dir = Directory.systemTemp.createTempSync('ce-crash');
    CrashLog.instance = CrashLog(dir: () async => dir);
  });
  tearDown(() {
    CrashGuard.reset();
    Edition.classroom = Edition.built == 'classroom';
    dir.deleteSync(recursive: true);
  });

  test('the log rotates and never grows past its files', () async {
    final log = CrashLog(dir: () async => dir, maxBytes: 600, keep: 3, now: () => ceMonday);
    for (var i = 0; i < 40; i++) {
      await log.record(StateError('number $i'), StackTrace.current, source: 'test');
    }
    final files = await log.files();
    expect([for (final f in files) f.uri.pathSegments.last], ['crash.log', 'crash.1.log', 'crash.2.log']);
    for (final f in files) {
      expect(f.lengthSync(), lessThanOrEqualTo(600 + 4000), reason: 'one entry over at most');
    }
    final all = await log.readAll();
    expect(all, contains('number 39'));
    expect(all, isNot(contains('number 0\n')), reason: 'the oldest went');
    expect(all, contains('--- 2026-11-09T10:05:00.000 error · test'));
  });

  test('the autosave is written before the error is logged', () async {
    final order = <String>[];
    CrashGuard.beforeCrash = () async {
      order.add('autosave');
      expect(await CrashLog.instance.readAll(), isEmpty, reason: 'nothing logged yet');
    };
    await CrashGuard.onFlutterError(FlutterErrorDetails(exception: StateError('layout broke'), library: 'rendering library'));
    order.add('logged');
    expect(order, ['autosave', 'logged']);
    final text = await CrashLog.instance.readAll();
    expect(text, contains('flutter · rendering library'));
    expect(text, contains('layout broke'));
    expect(CrashGuard.crashed.value, isNull, reason: 'one Flutter error is not a crash');
  });

  test('uncaught errors that keep coming are a crash; ones far apart are not', () async {
    var t = ceMonday;
    CrashGuard.now = () => t;
    addTearDown(() => CrashGuard.now = DateTime.now);
    await CrashGuard.onUncaught(Exception('one'), null);
    t = t.add(const Duration(minutes: 5));
    await CrashGuard.onUncaught(Exception('two'), null);
    t = t.add(const Duration(minutes: 5));
    await CrashGuard.onUncaught(Exception('three'), null);
    expect(CrashGuard.crashed.value, isNull);
    await CrashGuard.onUncaught(Exception('four'), null);
    await CrashGuard.onUncaught(Exception('five'), null);
    expect(CrashGuard.crashed.value, isNotNull);
    expect(await CrashLog.instance.readAll(), contains('FATAL · zone'));
  });

  testWidgets('a widget that cannot build shows the friendly card, not a red screen', (tester) async {
    var back = 0;
    CrashGuard.backToStart = () => back++;
    await tester.pumpWidget(friendlyErrorWidget(FlutterErrorDetails(exception: StateError('x'))));
    expect(find.text('This part could not be shown.'), findsOneWidget);
    await tester.tap(find.byKey(const Key('crash-error-back')));
    expect(back, 1);
  });

  testWidgets('Something went wrong: the board was saved, and Back to start opens the start screen', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    CrashGuard.backToStart = board.showClassroomStart;
    await pumpApp(tester, board);
    await tapKey(tester, 'ce-start-class');
    await settle(tester, 15);
    expect(board.localClass, isTrue);
    var flushed = false;
    CrashGuard.beforeCrash = () async => flushed = true;
    await tester.runAsync(() => CrashGuard.fatal(StateError('the board broke'), StackTrace.current));
    await settle(tester);
    expect(flushed, isTrue);
    expect(find.byKey(const Key('crash-screen')), findsOneWidget);
    expect(find.text('Something went wrong'), findsOneWidget);
    await tapKey(tester, 'crash-back-to-start');
    expect(find.byKey(const Key('crash-screen')), findsNothing);
    expect(board.localClass, isFalse);
    expect(find.byKey(const Key('ce-start-class')), findsOneWidget);
    await closeBoard(tester, board);
  });
}
