// Loads every bundled PUC lesson and draws each of its steps (every card, line and reveal), in
// English and, where the lesson has it, Kannada, at the Lessons panel's size. Sims, labs and 3D
// are placeholders here (no WebView or GPU in tests); kinetix_labs' own tests cover those.
// LESSONS_SWEEP=physics (a subject) or LESSONS_SWEEP=puc1-physics-01 (a chapter prefix) narrows it.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/lessons/lesson_library.dart';
import 'package:kinetix_lessons/kinetix_lessons.dart';

final _only = Platform.environment['LESSONS_SWEEP'];

void main() {
  testWidgets('every bundled lesson step draws without an exception', (tester) async {
    tester.view
      ..physicalSize = const Size(780, 600)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final lib = LessonLibrary();
    final cat = (await tester.runAsync(lib.catalogue))!;
    expect(cat.chapters, isNotEmpty);
    final failures = <String>[];
    var steps = 0, lessons = 0;
    for (final ch in cat.chapters) {
      if (_only != null && !(ch.id.startsWith(_only!) || ch.subject == _only)) continue;
      final pack = (await tester.runAsync(() => lib.chapter(ch.id)))!;
      for (final t in ch.topics) {
        final lesson = pack.lessons[t.id];
        if (lesson == null) {
          failures.add('${t.id}: in the catalogue but not in the chapter');
          continue;
        }
        lessons++;
        for (final lang in [Lang.en, if (t.kannada) Lang.kn]) {
          final c = LessonController(pack: pack, lesson: lesson, narrator: TimedNarrator(perWord: Duration.zero), recorder: SessionRecorder(), lang: lang);
          for (var i = 0; i < c.blocks.length; i++) {
            c.goTo(i);
            final wb = GlobalKey<WhiteboardViewState>();
            Future<void> draw(String what) async {
              await tester.pumpWidget(
                MaterialApp(
                  debugShowCheckedModeBanner: false,
                  home: Scaffold(
                    body: Theme(
                      data: zynetixTheme(),
                      child: ZCanvas(
                        scale: 0.55,
                        child: LessonBlockView(key: ValueKey('${t.id}:$i'), c: c, embeds: PlaceholderEmbeds(), room: ClassRoom(rollCount: 40), paper: const Color(0xFFFFF4CC), whiteboardKey: wb),
                      ),
                    ),
                  ),
                ),
              );
              await tester.pump(const Duration(milliseconds: 400));
              final e = tester.takeException();
              if (e != null) failures.add('${t.id} ${lang.name} step ${i + 1} (${c.current.type.wire} ${c.current.id}) $what: ${'$e'.split('\n').first}');
              steps++;
            }

            // English: as it arrives, half way and fully shown; Kannada: fully shown.
            if (lang == Lang.en) await draw('shown');
            final total = c.revealTotal;
            if (lang == Lang.en && total > 2) {
              c.revealTo(total ~/ 2 + 1);
              await draw('reveal ${c.revealed}');
            }
            c.revealTo(total);
            final w = wb.currentState;
            if (w != null) {
              while (!w.atEnd) {
                w.nextStep();
              }
            }
            if (total > 1 || w != null || lang == Lang.kn) await draw('all shown');
          }
          c.stopSpeech();
        }
      }
    }
    await tester.pumpWidget(const SizedBox());
    // ignore: avoid_print
    print('Lessons sweep: $lessons lessons, $steps steps drawn, ${failures.length} failures');
    for (final f in failures.take(200)) {
      // ignore: avoid_print
      print('  $f');
    }
    expect(failures, isEmpty);
  }, timeout: const Timeout(Duration(minutes: 60)));
}
