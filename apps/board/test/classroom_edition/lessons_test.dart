import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/classroom_hooks.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/lessons/lesson_board.dart';
import 'package:kinetix_board/classroom_edition/lessons/lesson_library.dart';
import 'package:kinetix_board/classroom_edition/lessons/lesson_progress.dart';
import 'package:kinetix_board/classroom_edition/lessons/lessons_panel.dart';
import 'package:kinetix_board/classroom_edition/local/classroom_store.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_lessons/kinetix_lessons.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'ce_support.dart';

const _cls = CeClass(id: 'c1a', year: 1, section: 'A');

void main() {
  tearDown(() {
    Edition.classroom = Edition.built == 'classroom';
    ClassroomHooks.panelTip = null;
  });

  group('The bundled catalogue', () {
    testWidgets('every PUC level and subject, chapters in order, our own blocks only', (tester) async {
      final lib = LessonLibrary(school: false);
      final cat = (await tester.runAsync(lib.catalogue))!;
      expect(cat.chapters.length, greaterThan(300));
      expect(cat.subjects.take(4), ['physics', 'chemistry', 'maths', 'biology']);
      expect(cat.subjectsOf(1), containsAll(['physics', 'chemistry', 'maths', 'biology', 'computer_science', 'english', 'accountancy']));
      expect(cat.subjectsOf(2), containsAll(['physics', 'chemistry', 'maths', 'biology']));
      final phy = cat.chaptersOf(2, 'physics');
      expect(phy.first.title.en, 'Electric Charges and Fields');
      expect([for (final c in phy) c.number], [for (var i = 1; i <= phy.length; i++) i]);
      expect(phy.first.topics, isNotEmpty);
      expect(phy.first.topics.every((t) => t.steps > 0), isTrue);

      final pack = (await tester.runAsync(() => lib.chapter(phy.first.id)))!;
      expect(pack.chapter.id, phy.first.id);
      expect(pack.lessons.keys, containsAll([for (final t in phy.first.topics) t.id]));
      final blocks = [for (final l in pack.lessons.values) ...l.blocks];
      // The Zynetix School parts are not in the committed bundle.
      expect(blocks.where((b) => b.type == BlockType.explainer || b.type == BlockType.conceptVideo || b.id.startsWith('zs-')), isEmpty);
      expect(pack.questions.keys.where((k) => k.startsWith('zs-')), isEmpty);
      // Every quiz's questions are in the chapter.
      for (final b in blocks.where((b) => b.type == BlockType.classQuiz || b.type == BlockType.pyq)) {
        expect(pack.questionsFor(b.ids('questionIds')), hasLength(b.ids('questionIds').length), reason: b.id);
      }
    });

    test('a School overlay goes back in its places when the build has one', () {
      final pack = LessonLibrary.packFromJson(
        {
          'chapter': {'id': 'puc1-x-01-a', 'subject': 'x', 'year': 'puc1', 'number': 1, 'title': {'en': 'A'}, 'topics': [{'id': 'puc1-x-01-a.t1', 'title': {'en': 'T'}}]},
          'lessons': [
            {'id': 'l', 'chapterId': 'puc1-x-01-a', 'topicId': 'puc1-x-01-a.t1', 'title': {'en': 'T'}, 'blocks': [
              {'id': 'intro', 'type': 'intro', 'heading': {'en': 'H'}, 'hook': {'en': 'k'}},
              {'id': 'pyq', 'type': 'pyq', 'questionIds': ['q1']},
            ]},
          ],
          'questions': [{'id': 'q1', 'stem': {'en': 'one'}, 'options': [{'en': 'a'}, {'en': 'b'}], 'answer': 0}],
        },
        overlay: {
          'lessons': {
            'puc1-x-01-a.t1': {
              'order': ['intro', 'zs-video', 'pyq'],
              'blocks': {'zs-video': {'id': 'zs-video', 'type': 'concept_video', 'video': {'provider': 'youtube', 'id': 'abcdefghijk', 'title': {'en': 'V'}}}},
              'questionIds': {'pyq': {'questionIds': ['q1', 'zs-q2']}},
            },
          },
          'questions': [{'id': 'zs-q2', 'stem': {'en': 'two'}, 'options': [{'en': 'a'}, {'en': 'b'}], 'answer': 1}],
          'formulas': {'formulas': [{'id': 'f1', 'name': {'en': 'F'}, 'tex': 'F=ma'}]},
        },
      );
      final l = pack.lessons['puc1-x-01-a.t1']!;
      expect([for (final b in l.blocks) b.id], ['intro', 'zs-video', 'pyq']);
      expect(l.blocks.last.ids('questionIds'), ['q1', 'zs-q2']);
      expect(pack.questionsFor(['q1', 'zs-q2']), hasLength(2));
      expect(pack.formulas.single.tex, 'F=ma');
    });

    test('timetable subjects find their lessons', () {
      expect(subjectIdFor('Mathematics'), 'maths');
      expect(subjectIdFor('Physics'), 'physics');
      expect(subjectIdFor('Comp. Science'), 'computer_science');
      expect(subjectIdFor('Kannada'), isNull);
    });
  });

  group('Progress per class', () {
    test('steps, taught topics and the last lesson are kept and come back', () async {
      SharedPreferences.setMockInitialValues({});
      final p = LessonProgress();
      await p.load();
      p.setStep('c1a', 'puc1-physics-01-units-and-measurement.t2', 3, 9);
      p.markTaught('c1a', 'puc1-physics-01-units-and-measurement.t1', total: 10);
      p.setStep('c1b', 'puc1-physics-01-units-and-measurement.t1', 1, 10);
      await Future<void>.delayed(Duration.zero);
      final again = LessonProgress();
      await again.load();
      expect(again.of('c1a', 'puc1-physics-01-units-and-measurement.t2')!.step, 3);
      expect(again.of('c1a', 'puc1-physics-01-units-and-measurement.t2')!.taught, isFalse);
      expect(again.of('c1a', 'puc1-physics-01-units-and-measurement.t1')!.taught, isTrue);
      expect(again.lastTopic('c1a'), 'puc1-physics-01-units-and-measurement.t1');
      expect(again.of('c1b', 'puc1-physics-01-units-and-measurement.t1')!.step, 1);
      expect(again.of('c1c', 'puc1-physics-01-units-and-measurement.t1'), isNull);
      // The last step marks it taught.
      again.setStep('c1b', 'puc1-physics-01-units-and-measurement.t1', 9, 10);
      expect(again.of('c1b', 'puc1-physics-01-units-and-measurement.t1')!.taught, isTrue);
    });

    testWidgets('the start screen line names the next lesson for the period', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final lib = LessonLibrary();
      final p = LessonProgress();
      await tester.runAsync(() async {
        await lib.catalogue();
        await p.load();
      });
      final first = lib.loaded!.chaptersOf(1, 'physics').first;
      expect(nextLessonLineFor(_cls, 'Physics', library: lib, progress: p), 'Next lesson: ${first.topics.first.title.en}');
      p.markTaught('c1a', first.topics.first.id, total: first.topics.first.steps);
      expect(nextLessonLineFor(_cls, 'Physics', library: lib, progress: p), 'Next lesson: ${first.topics[1].title.en}');
      p.setStep('c1a', first.topics[2].id, 2, 8);
      expect(nextLessonLineFor(_cls, 'Physics', library: lib, progress: p), 'Next lesson: ${first.topics[2].title.en} · step 3 of 8');
      expect(nextLessonLineFor(_cls, 'Kannada', library: lib, progress: p), isNull);
    });
  });

  group('Teaching a lesson on the board', () {
    testWidgets('chapter, lesson, steps, Kannada, progress and Put on board', (tester) async {
      final board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
      LessonProgress.instance = LessonProgress();
      LessonLibrary.instance = LessonLibrary();
      await tester.runAsync(() async {
        await LessonLibrary.instance.catalogue();
        await LessonProgress.instance.load();
      });
      await pumpApp(tester, board);
      await tapKey(tester, 'ce-start-class');
      await settle(tester, 10);
      await tapKey(tester, 'ce-lessons');
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
      await settle(tester);
      // Opens on the class's level and subject: 1st PUC A, Physics.
      expect(find.byKey(const Key('lessons-home')), findsOneWidget);
      expect(find.text('1st PUC · Physics'), findsOneWidget);
      final cat = LessonLibrary.instance.loaded!;
      final ch = cat.chaptersOf(1, 'physics').first;
      expect(find.byKey(Key('lessons-chapter-${ch.id}')), findsOneWidget);
      expect(find.text('Not started'), findsWidgets);

      await tapKey(tester, 'lessons-chapter-${ch.id}');
      final t = ch.topics.first;
      await tester.tap(find.byKey(Key('lessons-topic-${t.id}')));
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
      await settle(tester);
      expect(find.byKey(const Key('lessons-player')), findsOneWidget);
      expect(find.text('Step 1 of ${t.steps}'), findsOneWidget);
      expect(ClassroomHooks.panelTip?.call(), contains('step 2'));

      // Next walks the step's cards first, then moves on; Back goes back a step.
      final state = tester.state<LessonsPanelState>(find.byType(LessonsPanel));
      final c = state.lesson!;
      var guard = 0;
      while (c.index == 0 && guard++ < 50) {
        await tapKey(tester, 'lessons-next');
      }
      expect(find.text('Step 2 of ${t.steps}'), findsOneWidget);
      await tapKey(tester, 'lessons-next');
      while (c.index == 1 && guard++ < 100) {
        await tapKey(tester, 'lessons-next');
      }
      expect(c.index, 2);
      await tapKey(tester, 'lessons-back-step');
      expect(find.text('Step 2 of ${t.steps}'), findsOneWidget);
      expect(LessonProgress.instance.of('c1a', t.id)!.step, 1);

      // Kannada, where the lesson has it.
      if (t.kannada) {
        await tapKey(tester, 'lessons-lang-kn');
        expect(c.lang, Lang.kn);
        await tapKey(tester, 'lessons-lang-en');
      }

      // Put on board: the step's title, its picture and its key point, one group on the page.
      final wb = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas).first).controller;
      final before = wb.elements.length;
      await tester.runAsync(() => state.putOnBoard());
      await settle(tester, 2);
      final added = wb.elements.skip(before).toList();
      expect(added.whereType<TextElement>().map((e) => e.text), contains(state.stepTitle(c.current, Lang.en)));
      expect(added.length, greaterThan(1));
      expect(wb.selection, isEmpty);

      // Back to the chapter: the lesson shows where the class stopped; Continue on the home.
      await tapKey(tester, 'lessons-player-back');
      expect(find.text('Step 2 of ${t.steps}'), findsOneWidget);
      await tapKey(tester, 'lessons-back');
      expect(find.byKey(const Key('lessons-continue')), findsOneWidget);
      await tester.tap(find.byKey(const Key('lessons-continue-button')));
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
      await settle(tester);
      expect(find.text('Step 2 of ${t.steps}'), findsOneWidget);
      await closeBoard(tester, board);
    });

    test('a whiteboard scene becomes editable board items', () {
      final els = whiteboardElements([
        {'kind': 'text', 'at': [10, 5], 'text': {'en': 'q1'}, 'size': 3, 'color': 'white'},
        {'kind': 'math', 'at': [40, 5], 'tex': r'F = k\frac{q_1 q_2}{r^2}', 'color': 'yellow'},
        {'kind': 'arrow', 'from': [10, 30], 'to': [30, 30], 'color': 'red'},
        {'kind': 'circle', 'at': [50, 30], 'r': 4, 'color': 'orange', 'fill': true},
        {'kind': 'rect', 'from': [60, 20], 'to': [80, 40], 'color': 'blue'},
        {'kind': 'path', 'points': [[1, 1], [5, 5], [9, 1]], 'color': 'green'},
      ], Lang.en)!;
      expect(els.whereType<TextElement>().single.text, 'q1');
      expect(els.whereType<MathElement>().single.latex, contains('frac'));
      expect(els.whereType<Stroke>().map((s) => s.shape), [ShapeKind.arrow, ShapeKind.circle, ShapeKind.rectangle]);
      expect(els.whereType<PolygonElement>(), hasLength(1));
      expect(whiteboardElements([{'kind': 'axes', 'from': [0, 0], 'to': [10, 10], 'x': [0, 1], 'y': [0, 1]}], Lang.en), isNull);
    });
  });
}
