// Screenshots of the Classroom edition's key screens at 1920 × 1080, on a 4K panel that reports
// a device pixel ratio of 1, and in Kannada (CE_SHOTS=<dir> to write them; without it the
// walk-through still runs as a test).
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/l10n/l10n.dart';

import '../support/screen_fonts.dart';
import 'ce_support.dart';

final _out = Platform.environment['CE_SHOTS'];

Future<void> _shot(WidgetTester tester, String name) async {
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

Future<void> _tapIf(WidgetTester tester, String key) async {
  final f = find.byKey(Key(key));
  if (f.evaluate().isEmpty) return;
  await tester.ensureVisible(f.first);
  await settle(tester, 2);
  await tester.tap(f.first, warnIfMissed: false);
  await settle(tester);
}

void main() {
  setUpAll(loadScreenFonts);
  tearDown(() => Edition.classroom = Edition.built == 'classroom');

  for (final (tag, size, dpr, kn) in const [
    ('1080p', Size(1920, 1080), 1.0, false),
    ('4k-dpr1', Size(3840, 2160), 1.0, false),
    ('4k-dpr2', Size(3840, 2160), 2.0, false),
    ('kannada', Size(1920, 1080), 1.0, true),
  ]) {
    testWidgets('key screens: $tag', (tester) async {
      final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
      if (kn) board.setBoardLanguage(BoardLanguage.kn);
      tester.view
        ..physicalSize = size
        ..devicePixelRatio = dpr;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(RepaintBoundary(key: const Key('ce-shot'), child: appFor(board)));
      await settle(tester);
      await _shot(tester, '$tag-01-start');
      await openCeSettings(tester);
      await _shot(tester, '$tag-07-settings-timetable');
      Navigator.of(tester.element(find.byKey(const Key('ce-settings-page')))).pop();
      await settle(tester);
      await _tapIf(tester, 'ce-who');
      await _tapIf(tester, 'ce-teacher-lr');
      await _shot(tester, '$tag-02-who');
      await _tapIf(tester, 'ce-who-start');
      await settle(tester, 15);
      await _shot(tester, '$tag-03-simple-board');
      await _tapIf(tester, 'ce-class-tools');
      await settle(tester, 4);
      await _shot(tester, '$tag-04-class-tools');
      // Back to the board, all tools and the side panel.
      final close = find.descendant(of: find.byKey(const Key('classroom-apps')), matching: find.byType(TextButton));
      if (close.evaluate().isNotEmpty) {
        await tester.tap(close.last, warnIfMissed: false);
        await settle(tester);
      }
      await _tapIf(tester, 'ce-show-all');
      await _shot(tester, '$tag-05-all-tools');
      await _tapIf(tester, 'ce-lessons');
      await settle(tester, 6);
      await _shot(tester, '$tag-06-lessons-panel');
      await closeBoard(tester, board);
    });
  }
}
