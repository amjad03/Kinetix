// Screenshots of the Lessons tab from the real code and content (LESSONS_SHOTS=<dir> writes
// lessons-*.png): the tab (as design 05), a step put on the board (06), a sim, a lab and a
// Kannada step.
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/lessons/lesson_library.dart';
import 'package:kinetix_board/classroom_edition/lessons/lesson_progress.dart';
import 'package:kinetix_board/classroom_edition/lessons/lessons_panel.dart';
import 'package:kinetix_lessons/kinetix_lessons.dart';

import '../support/screen_fonts.dart';
import 'ce_support.dart';

final _out = Platform.environment['LESSONS_SHOTS'];

void main() {
  setUpAll(() async {
    await loadScreenFonts();
    // flutter_math_fork's KaTeX fonts (the app loads them from its font manifest).
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
  });
  tearDown(() => Edition.classroom = Edition.built == 'classroom');

  Future<void> shot(WidgetTester tester, String name) async {
    final out = _out;
    if (out == null) return;
    final box = tester.renderObject<RenderRepaintBoundary>(find.byKey(const Key('ce-shot')));
    final png = await tester.runAsync(() async {
      final img = await box.toImage();
      return (await img.toByteData(format: ui.ImageByteFormat.png))!.buffer.asUint8List();
    });
    Directory(out).createSync(recursive: true);
    File('$out/lessons-$name.png').writeAsBytesSync(png!);
  }

  Future<void> wait(WidgetTester tester, [int frames = 10]) async {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 150)));
    await settle(tester, frames);
  }

  testWidgets('lessons', (tester) async {
    final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
    LessonLibrary.instance = LessonLibrary();
    LessonProgress.instance = LessonProgress();
    final cat = (await tester.runAsync(() async {
      await LessonProgress.instance.load();
      return LessonLibrary.instance.catalogue();
    }))!;
    // 1st PUC A has had three lessons of chapter 1 and stopped in the fourth.
    final ch1 = cat.chaptersOf(1, 'physics').first;
    for (final t in ch1.topics.take(3)) {
      LessonProgress.instance.markTaught('c1a', t.id, total: t.steps);
    }
    LessonProgress.instance.markTaught('c1a', cat.chaptersOf(1, 'physics')[1].topics.first.id);
    LessonProgress.instance.setStep('c1a', ch1.topics[3].id, 2, ch1.topics[3].steps);

    tester.view
      ..physicalSize = const Size(1920, 1080)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(RepaintBoundary(key: const Key('ce-shot'), child: appFor(board)));
    await settle(tester);
    await tapKey(tester, 'ce-start-class');
    await settle(tester, 12);
    await tapKey(tester, 'ce-lessons');
    await wait(tester);
    await shot(tester, '05-lessons-tab');

    // 2nd PUC: Coulomb's law, the board scene, put on the board.
    final state = tester.state<LessonsPanelState>(find.byType(LessonsPanel));
    final coulomb = cat.topic('puc2-physics-01-electric-charges-and-fields.t2')!;
    await tester.runAsync(() => state.openTopic(coulomb, at: 2));
    await wait(tester);
    final wb = state.whiteboardKey.currentState!;
    while (!wb.atEnd) {
      wb.nextStep();
    }
    await tester.pump(const Duration(seconds: 3));
    await wait(tester);
    await tester.runAsync(() => state.putOnBoard());
    await wait(tester, 20);
    await shot(tester, '06-lesson-step-on-board');

    // A simulation step (the ported interactive), and a Kinetix lab.
    await tester.runAsync(() => state.openTopic(coulomb, at: 3));
    await wait(tester, 20);
    await shot(tester, '07-sim-step');
    final pendulum = cat.topic('puc1-physics-01-units-and-measurement.t1')!;
    await tester.runAsync(() => state.openTopic(pendulum, at: 10));
    await wait(tester, 20);
    await shot(tester, '08-lab-step');

    // Kannada.
    await tester.runAsync(() => state.openTopic(coulomb, at: 1));
    await wait(tester);
    await tapKey(tester, 'lessons-lang-kn');
    state.lesson!.revealTo(3);
    await wait(tester, 20);
    expect(state.lesson!.lang, Lang.kn);
    await shot(tester, '09-kannada-step');
    await closeBoard(tester, board);
  });
}
