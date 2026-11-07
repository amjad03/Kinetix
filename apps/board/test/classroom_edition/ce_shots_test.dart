// Screenshots of the Classroom edition from the real code (CE_SHOTS=<dir> to write them).
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';

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

void main() {
  setUpAll(loadScreenFonts);
  tearDown(() => Edition.classroom = Edition.built == 'classroom');

  Future<void> pumpShot(WidgetTester tester, Widget app, Size size) async {
    tester.view
      ..physicalSize = size
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(RepaintBoundary(key: const Key('ce-shot'), child: app));
    await settle(tester);
  }

  testWidgets('screens', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpShot(tester, appFor(board), const Size(1920, 1080));
    await shot(tester, '01-start-screen');
    await tapKey(tester, 'ce-who');
    await tapKey(tester, 'ce-teacher-lr');
    await shot(tester, '02-whos-teaching');
    await tapKey(tester, 'ce-who-start');
    await settle(tester, 15);
    await shot(tester, '03-simple-board');
    await tapKey(tester, 'ce-show-all');
    await tapKey(tester, 'tool-tools');
    await shot(tester, '04-all-tools-no-ai');
    await tester.tapAt(const Offset(1700, 500));
    await settle(tester);
    await tapKey(tester, 'board-menu');
    await tester.ensureVisible(find.byKey(const Key('menu-simple-board')));
    await settle(tester);
    await tapKey(tester, 'menu-simple-board');
    expect(find.byKey(const Key('ce-show-all')), findsOneWidget);
    await tapKey(tester, 'ce-class-tools');
    await shot(tester, '07-class-tools-hub');
    await tester.tap(find.descendant(of: find.byKey(const Key('classroom-apps')), matching: find.byType(TextButton)).last);
    await settle(tester);
    await tapKey(tester, 'board-menu');
    await tester.ensureVisible(find.byKey(const Key('menu-tour')));
    await settle(tester);
    await tapKey(tester, 'menu-tour');
    await settle(tester);
    await shot(tester, '11-guided-tour');
    await closeBoard(tester, board);
  });

  testWidgets('phone', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    await pumpShot(tester, appFor(board), const Size(844, 390));
    await tapKey(tester, 'ce-start-class');
    await settle(tester, 15);
    await shot(tester, '12-phone-simple-board');
    await closeBoard(tester, board);
  });
}
