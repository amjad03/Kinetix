// The Classroom edition end to end, as a teacher meets it, on a 1920 × 1080 board and on a phone
// (844 × 390, the board scaled to fit): start → Who's teaching → Simple board → Lessons → a step
// → Put on board → Class tools → class quiz → mastery map → mock test, and the all-tools
// toolbar with no AI. Runs on the real Lessons and, when built, the private Class tools bank
// (skipped without it). RELEASE_SHOTS=<dir> writes a PNG of each screen (phone ones phone-*).
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/class_tools/bank.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/lessons/lesson_library.dart';
import 'package:kinetix_board/classroom_edition/lessons/lesson_progress.dart';
import 'package:kinetix_board/classroom_edition/lessons/lessons_panel.dart';
import 'package:kinetix_board/classroom_edition/local/classroom_store.dart';

import '../support/screen_fonts.dart';
import 'ce_support.dart';

final _out = Platform.environment['RELEASE_SHOTS'];
final _bank = File('assets/private/class_tools/index.json').existsSync();

/// The sample college with Physics for 2nd PUC A in the 2nd period (Electric Charges and
/// Fields is a 2nd PUC chapter) and 1st PUC A later on Units and Measurement.
CeSetup _college() {
  final s = sampleCollege();
  return s.copyWith(
    slots: [
      for (final x in s.slots)
        x.id == 'p1'
            ? x.copyWith(classId: 'c2a', topic: 'Electric Charges and Fields')
            : x.id == 'p4'
            ? x.copyWith(classId: 'c1a', topic: 'Units and Measurement')
            : x,
    ],
  );
}

Future<void> _katex() async {
  final files = <String, List<String>>{};
  for (final f in const [
    'AMS-Regular', 'Caligraphic-Bold', 'Caligraphic-Regular', 'Fraktur-Bold', 'Fraktur-Regular', 'Main-Bold', 'Main-BoldItalic', 'Main-Italic', 'Main-Regular', 'Math-BoldItalic',
    'Math-Italic', 'SansSerif-Bold', 'SansSerif-Italic', 'SansSerif-Regular', 'Script-Regular', 'Size1-Regular', 'Size2-Regular', 'Size3-Regular', 'Size4-Regular', 'Typewriter-Regular',
  ]) {
    (files['KaTeX_${f.split('-').first}'] ??= []).add('packages/flutter_math_fork/lib/katex_fonts/fonts/KaTeX_$f.ttf');
  }
  for (final e in files.entries) {
    final loader = FontLoader('packages/flutter_math_fork/${e.key}');
    for (final a in e.value) {
      loader.addFont(rootBundle.load(a));
    }
    await loader.load();
  }
}

void main() {
  setUpAll(() async {
    await loadScreenFonts();
    await _katex();
  });
  setUp(ClassBank.clearCache);
  tearDown(() => Edition.classroom = Edition.built == 'classroom');

  for (final (size, prefix) in const [(Size(1920, 1080), ''), (Size(844, 390), 'phone-')]) {
    testWidgets('end to end at ${size.width.toInt()} × ${size.height.toInt()}', skip: !_bank, (tester) async {
      Future<void> shot(String name) async {
        final out = _out;
        if (out == null) return;
        final box = tester.renderObject<RenderRepaintBoundary>(find.byKey(const Key('ce-shot')));
        final png = await tester.runAsync(() async {
          final img = await box.toImage();
          return (await img.toByteData(format: ui.ImageByteFormat.png))!.buffer.asUint8List();
        });
        Directory(out).createSync(recursive: true);
        File('$out/$prefix$name.png').writeAsBytesSync(png!);
      }

      Future<void> wait([int frames = 10]) async {
        for (var i = 0; i < 6; i++) {
          await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 60)));
          await tester.pump(const Duration(milliseconds: 50));
        }
        await settle(tester, frames);
      }

      final board = (await tester.runAsync(() => classroomBoard(seed: _college())))!;
      LessonLibrary.instance = LessonLibrary();
      LessonProgress.instance = LessonProgress();
      final cat = (await tester.runAsync(() async {
        await LessonProgress.instance.load();
        return LessonLibrary.instance.catalogue();
      }))!;
      tester.view
        ..physicalSize = size
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(RepaintBoundary(key: const Key('ce-shot'), child: appFor(board)));
      await settle(tester);
      await shot('01-start');
      expect(find.textContaining('2nd PUC A'), findsWidgets);

      await tapKey(tester, 'ce-who');
      await tapKey(tester, 'ce-teacher-lr');
      await shot('02-whos-teaching');
      await tapKey(tester, 'ce-who-start');
      await settle(tester, 15);
      await shot('03-simple-board');

      // Lessons: the class's level and subject, then Coulomb's law, a board scene, Put on board.
      await tapKey(tester, 'ce-lessons');
      await wait();
      await shot('04-lessons');
      final state = tester.state<LessonsPanelState>(find.byType(LessonsPanel));
      expect(state.year, 2);
      final coulomb = cat.topic('puc2-physics-01-electric-charges-and-fields.t2')!;
      await tester.runAsync(() => state.openTopic(coulomb, at: 2));
      await wait();
      final wb = state.whiteboardKey.currentState;
      if (wb != null) {
        while (!wb.atEnd) {
          wb.nextStep();
        }
      }
      await tester.pump(const Duration(seconds: 3));
      await wait();
      await shot('05-lesson-step');
      await tester.runAsync(() => state.putOnBoard());
      await wait(20);
      await shot('06-put-on-board');

      // Class tools: a class quiz on this chapter, marked by roll number.
      await tapKey(tester, 'ce-class-tools');
      await shot('07-class-tools');
      await tapKey(tester, 'ce-tool-quiz');
      await wait();
      await shot('08-quiz-setup');
      await tapKey(tester, 'ce-quiz-start');
      await wait();
      for (var roll = 1; roll <= 40; roll++) {
        if (roll % 9 == 0) continue;
        final f = find.byKey(Key('ce-roll-$roll'));
        await tester.ensureVisible(f);
        await tester.tap(f);
        await tester.pump();
        if (roll % 4 == 0) {
          await tester.tap(f);
          await tester.pump();
        }
      }
      await settle(tester);
      await shot('09-quiz');
      await tapKey(tester, 'ce-quiz-next');
      await tapKey(tester, 'ce-tools-back');
      await tapKey(tester, 'ce-tool-mastery');
      await wait();
      await shot('10-mastery-map');
      await tapKey(tester, 'ce-tools-back');
      await tapKey(tester, 'ce-tool-mock');
      await wait();
      await shot('11-mock-test');

      await closeBoard(tester, board);
    });
  }

  for (final (size, prefix) in const [(Size(1920, 1080), ''), (Size(844, 390), 'phone-')]) {
    testWidgets('all tools, no AI at ${size.width.toInt()} × ${size.height.toInt()}', (tester) async {
      Future<void> shot(String name) async {
        final out = _out;
        if (out == null) return;
        final box = tester.renderObject<RenderRepaintBoundary>(find.byKey(const Key('ce-shot')));
        final png = await tester.runAsync(() async {
          final img = await box.toImage();
          return (await img.toByteData(format: ui.ImageByteFormat.png))!.buffer.asUint8List();
        });
        Directory(out).createSync(recursive: true);
        File('$out/$prefix$name.png').writeAsBytesSync(png!);
      }

      final board = (await tester.runAsync(() => classroomBoard(seed: _college())))!;
      tester.view
        ..physicalSize = size
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(RepaintBoundary(key: const Key('ce-shot'), child: appFor(board)));
      await settle(tester);
      await tapKey(tester, 'ce-start-class');
      await settle(tester, 15);
      await tapKey(tester, 'ce-show-all');
      await tapKey(tester, 'tool-tools');
      await shot('12-all-tools-no-ai');
      expect(find.textContaining('AI'), findsNothing);
      expect(find.textContaining('KINETIX AI'), findsNothing);
      await closeBoard(tester, board);
    });
  }
}
