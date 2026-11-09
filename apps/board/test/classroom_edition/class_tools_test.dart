// Class tools (Classroom edition): quiz marking and persistence, mastery, mock tests and
// their PDF, teams, worksheets, and the board without the private bank. The fixtures are
// invented for these tests (they are not from the Zynetix School bank).
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/class_tools/bank.dart';
import 'package:kinetix_board/classroom_edition/class_tools/class_logic.dart';
import 'package:kinetix_board/classroom_edition/class_tools/class_records.dart';
import 'package:kinetix_board/classroom_edition/class_tools/paper.dart';
import 'package:kinetix_board/classroom_edition/class_tools/paper_pdf.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/local/classroom_store.dart';
import 'package:kinetix_board/core/device_store.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/core/secret_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'ce_support.dart';

// --- Invented fixtures --------------------------------------------------------------------------

const _ch = 'puc2-physics-01-light-and-shadows';

Map<String, dynamic> _chapterJson() => {
  'id': _ch,
  'n': 1,
  't': 'Light and Shadows',
  'topics': [
    ['t1', 'Shadows'],
    ['t2', 'Pinhole camera'],
  ],
  'q': [
    for (var i = 1; i <= 8; i++)
      {
        'id': 'ls-q$i',
        'tp': i.isOdd ? 't1' : 't2',
        's': 'Made-up question $i about ${i.isOdd ? 'shadows' : 'pinholes'}?',
        'o': ['Option one', 'Option two', 'Option three', 'Option four'],
        'a': i % 4,
        'd': 1 + i % 3,
        if (i < 5) 'puc': 1,
      },
  ],
  // Written questions by marks: 'sh' 2, 'md' 3, 'lg' 5 (as tool/build_class_bank.py writes them).
  'sh': [
    for (var i = 1; i <= 4; i++) {'tp': 't1', 'q': 'Define shadow word $i.', 'a': 'A dark patch, version $i.'},
    // Never on a paper: a flash card, "Explain:" glue, a question mark with more after it.
    {'tp': 't1', 'q': 'Shadow length = ?', 'a': 'Long.'},
    {'tp': 't1', 'q': 'Explain: why is a shadow dark?', 'a': 'No light.'},
    {'tp': 't1', 'q': 'Why is a shadow dark? Give the reason in words.', 'a': 'No light.'},
  ],
  'md': [
    for (var i = 1; i <= 4; i++) {'tp': 't2', 'q': 'Explain pinhole idea $i.', 'a': 'Light goes straight.'},
  ],
  'lg': [
    {
      'tp': 't2',
      'q': 'Describe the working of a made-up pinhole camera.',
      'pts': ['Light goes straight.', 'The image is upside down.'],
    },
  ],
  'pr': [
    for (var i = 1; i <= 3; i++)
      {
        'tp': 't2',
        'q': 'A pinhole box is ${i}0 cm long. Find something.',
        'a': '${i * 2} cm',
        'st': ['Step one.', 'Step two.'],
        'm': 3,
      },
    {
      'tp': 't2',
      'q': 'A made-up pinhole camera is 20 cm long and a tree 10 m tall stands 50 m away. Find (a) the image height and (b) the magnification.',
      'a': '(a) 4 cm (b) 0.004',
      'st': ['Similar triangles.', 'h = 10 × 0.2/50.', 'm = h/H.'],
      'm': 5,
    },
  ],
  'f': [
    {'tp': 't2', 'n': 'Magnification', 'tex': 'm = \\frac{v}{u}', 'txt': 'm = v/u', 'note': 'Invented note.'},
  ],
};

BankChapter _chapter() => BankChapter.fromJson(_chapterJson());

/// An asset bundle with just [files].
class _Bundle extends CachingAssetBundle {
  _Bundle(this.files);
  final Map<String, List<int>> files;

  @override
  Future<ByteData> load(String key) async {
    final f = files[key];
    if (f == null) throw FlutterError('No asset $key');
    return ByteData.sublistView(Uint8List.fromList(f));
  }
}

_Bundle _privateBank() => _Bundle({
  '${ClassBank.dir}/index.json': utf8.encode(
    jsonEncode({
      'v': 1,
      'subjects': [
        {'year': 2, 'subject': 'physics', 'title': 'Physics', 'file': 'puc2-physics.json.gz', 'chapters': []},
      ],
      'patterns': [
        {
          'id': 'made-up',
          'exam': 'TEST',
          't': 'Made-up entrance',
          'min': 60,
          'sec': [
            ['physics', 10, 4, 1],
            ['chemistry', 10, 4, 1],
          ],
        },
      ],
    }),
  ),
  '${ClassBank.dir}/puc2-physics.json.gz': gzip.encode(
    utf8.encode(
      jsonEncode({
        'v': 1,
        'year': 2,
        'subject': 'physics',
        'chapters': [_chapterJson()],
      }),
    ),
  ),
});

/// A Lessons file (the pack shape) with two quick-check questions.
_Bundle _lessonsOnly() => _Bundle({
  'assets/lessons/puc/puc2-physics-01-light-and-shadows.json.gz': gzip.encode(
    utf8.encode(
      jsonEncode({
        'chapter': {
          'id': _ch,
          'number': 1,
          'title': {'en': 'Light and Shadows'},
          'topics': [
            {
              'id': '$_ch.t1',
              'title': {'en': 'Shadows'},
            },
          ],
        },
        'lessons': [],
        'questions': [
          for (var i = 1; i <= 2; i++)
            {
              'id': 'lq$i',
              'topicId': '$_ch.t1',
              'stem': {'en': 'Quick check $i?'},
              'options': [
                {'en': 'Yes'},
                {'en': 'No'},
              ],
              'answer': 0,
              'exams': ['PUC'],
              'difficulty': 'easy',
            },
        ],
      }),
    ),
  ),
});

void main() {
  setUp(() {
    ClassBank.clearCache();
    ClassBank.testBundle = null;
  });
  tearDown(() {
    Edition.classroom = Edition.built == 'classroom';
    ClassBank.testBundle = null;
    ClassBank.listAssets = (bundle) async => (await AssetManifest.loadFromAssetBundle(bundle)).listAssets();
  });

  group('class quiz', () {
    test('a tap marks right, twice wrong, three times blank; absent roll numbers are skipped', () {
      final m = QuizMarks(rolls: [1, 2, 3, 4, 5], absent: {3});
      expect(m.tap(1), isTrue);
      expect(m.of(1), Mark.right);
      m.tap(2);
      m.tap(2);
      expect(m.of(2), Mark.wrong);
      m.tap(4);
      m.tap(4);
      m.tap(4);
      expect(m.of(4), Mark.none);
      expect(m.tap(3), isFalse);
      expect(m.of(3), Mark.none);
      expect(m.right, [1]);
      expect(m.wrong, [2]);
      expect(m.notMarked, 2);
      m.markRestRight();
      expect(m.right, [1, 4, 5]);
      expect(m.wrong, [2]);
      expect(m.notMarked, 0);
      expect(m.present, isNot(contains(3)));
      final q = _chapter().questions.first;
      final r = m.record(at: DateTime(2026, 11, 9), q: q, topicTitle: 'Shadows')!;
      expect((r.questionId, r.chapterId, r.topic), ('ls-q1', _ch, 't1'));
      expect(r.right, [1, 4, 5]);
      expect(r.wrong, [2]);
      expect(
        QuizMarks(rolls: [1]).record(at: DateTime(2026), q: q),
        isNull,
        reason: 'nothing marked, nothing kept',
      );
    });

    test('questions come from the chapter, PUC-tagged first, easy ones first', () {
      final qs = pickQuizQuestions(_chapter(), count: 4, seed: 3);
      expect(qs, hasLength(4));
      expect(qs.every((q) => q.puc), isTrue);
      expect([for (final q in qs) q.difficulty], orderedEquals([...qs.map((q) => q.difficulty)]..sort()));
      expect(pickQuizQuestions(_chapter(), topics: {'t2'}, count: 10).every((q) => q.topic == 't2'), isTrue);
    });

    test('marks are kept per class by roll number and read back', () async {
      SharedPreferences.setMockInitialValues({});
      final device = DeviceStore(secrets: MemorySecretStore());
      final a = ClassToolsStore(deviceStore: device, classId: 'c2a');
      await a.load();
      await a.addQuiz(QuizRecord(at: DateTime(2026, 11, 9), questionId: 'ls-q1', chapterId: _ch, topic: 't1', right: const [1, 2], wrong: const [3]));
      await a.putMock(MockRecord(id: 'm1', at: _d, title: 'Mock test 1', maxMarks: 25, marks: {1: 20, 2: 12.5}));
      await a.setTeams(splitTeams([1, 2, 3, 4], 2));
      final b = ClassToolsStore(deviceStore: device, classId: 'c2a');
      await b.load();
      expect(b.records.quizzes.single.right, [1, 2]);
      expect(b.records.quizzes.single.wrong, [3]);
      expect(b.records.mocks.single.marks, {1: 20.0, 2: 12.5});
      expect(b.records.teams.map((t) => t.rolls), [
        [1, 2],
        [3, 4],
      ]);
      final other = ClassToolsStore(deviceStore: device, classId: 'c1a');
      await other.load();
      expect(other.records.quizzes, isEmpty, reason: 'each class keeps its own');
      final raw = (await SharedPreferences.getInstance()).getString('setting.classTools.c2a')!;
      expect(raw, isNot(contains('name')), reason: 'roll numbers only');
    });
  });

  group('mastery', () {
    test('topics × roll numbers from quizzes and mock tests, with the class score and insights', () {
      final records = ClassRecords(
        quizzes: [
          QuizRecord(at: _d, questionId: 'a', chapterId: _ch, topic: 't1', topicTitle: 'Shadows', right: const [1, 2, 3], wrong: const [4]),
          QuizRecord(at: _d, questionId: 'b', chapterId: _ch, topic: 't1', topicTitle: 'Shadows', right: const [1, 2, 3, 4], wrong: const []),
          QuizRecord(at: _d, questionId: 'c', chapterId: _ch, topic: 't2', topicTitle: 'Pinhole camera', right: const [1], wrong: const [2, 3, 4]),
          QuizRecord(at: _d, questionId: 'd', chapterId: 'other', topic: 't1', right: const [1], wrong: const []),
        ],
        mocks: [
          MockRecord(id: 'm', at: _d, title: 'Mock test 1', maxMarks: 10, topics: {'$_ch|t2': 'Pinhole camera'}, marks: {1: 10, 2: 5}),
        ],
      );
      final m = buildMastery(records: records, rolls: [1, 2, 3, 4, 5], chapterId: _ch, now: DateTime(2026, 11, 13));
      expect(m.rows.map((r) => r.title), ['Shadows', 'Pinhole camera']);
      final shadows = m.rows.first, pinhole = m.rows.last;
      expect(shadows.scores, {1: 1.0, 2: 1.0, 3: 1.0, 4: 0.5});
      expect(shadows.classScore, closeTo(0.875, 1e-9));
      expect(shadows.scores.containsKey(5), isFalse, reason: 'roll 5 has not answered');
      // Roll 1: right once (1) + mock 10/10 counted twice → 3/3; roll 2: wrong + 5/10 twice → 1/3.
      expect(pinhole.scores[1], 1.0);
      expect(pinhole.scores[2], closeTo(1 / 3, 1e-9));
      expect(pinhole.scores[3], 0.0);
      expect(levelOf(null), MasteryLevel.none);
      expect([levelOf(0.2), levelOf(0.5), levelOf(0.7), levelOf(0.9)], [MasteryLevel.notYet, MasteryLevel.gettingThere, MasteryLevel.secure, MasteryLevel.mastered]);
      final kinds = [for (final i in m.insights) i.kind];
      expect(kinds, ['revisit', 'strongest', 'group']);
      expect(m.insights.first.title, 'Revisit: pinhole camera');
      expect(m.insights[1].title, 'Strongest: shadows');
      expect(m.insights.last.rolls, [4], reason: 'below half on the two weakest topics (roll 3 is exactly half)');
      expect(m.insights.last.title, 'Small group for Saturday');
      expect(
        buildMastery(records: records, rolls: [1]).rows,
        hasLength(3),
        reason: 'all chapters when none is chosen',
      );
      expect(buildMastery(records: const ClassRecords(), rolls: [1]).isEmpty, isTrue);
    });
  });

  group('mock test', () {
    test('the PUC chapter test: parts A–D, 25 marks with the board\'s choice, no question twice', () {
      final p = buildPaper(chapters: [_chapter()], pattern: pucPatterns.first, title: 'Mock test 1', seed: 1, college: 'Test College', className: '2nd PUC A', subject: 'Physics');
      expect(pucPatterns.first.maxMarks, 25);
      expect(p.maxMarks, 25);
      expect([for (final s in p.sections) s.part.label], ['A', 'B', 'C', 'D']);
      expect([for (final s in p.sections) s.items.length], [5, 4, 4, 2]);
      expect([for (final s in p.sections) s.groups.single.attempt], [5, 3, 3, 1]);
      expect(p.sections.first.items.every((i) => i.kind == ItemKind.mcq && i.options.length == 4 && i.answer.isNotEmpty), isTrue);
      expect(p.sections[1].items.every((i) => i.kind == ItemKind.short && i.text.startsWith('Define shadow word')), isTrue);
      expect(p.sections[2].items.every((i) => i.text.startsWith('Explain pinhole idea')), isTrue);
      expect(p.sections.last.items.map((i) => i.text), containsAll(['Describe the working of a made-up pinhole camera.', startsWith('A made-up pinhole camera')]));
      expect({for (final i in p.items) i.id}.length, p.items.length);
      expect(p.sections.first.marksLine, '(5 × 1 = 5)');
      expect(p.sections[1].marksLine, '(3 × 2 = 6)');
      expect(p.sections.last.marksLine, '(1 × 5 = 5)');
      expect(p.sections.first.groups.single.instruction, 'Choose the correct answer for each question.');
      expect(p.sections[1].groups.single.instruction, 'Answer any THREE of the following questions.');
      expect(p.sections.last.groups.single.instruction, 'Answer any ONE of the following questions.');
      expect(p.topicKeys, containsAll(['$_ch|t1', '$_ch|t2']));
      expect(p.fileName, '2nd-PUC-A-Physics-Mock-test-1.pdf');
    });

    test('flash cards, "Explain:" glue and run-on questions never reach a paper', () {
      for (var seed = 0; seed < 20; seed++) {
        final p = buildPaper(chapters: [_chapter()], pattern: pucPatterns[2], title: 'Annual', seed: seed);
        for (final i in p.items.where((i) => i.kind != ItemKind.mcq)) {
          expect(examPromptProblem(i.text), isNull, reason: i.text);
        }
      }
      expect(examPromptProblem('Shadow length = ?'), 'flash-card stem');
      expect(examPromptProblem('Explain: why is a shadow dark?'), 'template glue');
      expect(examPromptProblem('Why is a shadow dark? Give the reason in words.'), isNull, reason: 'a second sentence after a question is fine');
      expect(examPromptProblem('Why is a shadow dark? because light stops'), 'question mark inside');
      expect(examPromptProblem('Which is right? A. one B. two C. three'), isNotNull);
      expect(examPromptProblem('A 5 A. current flows for 2 s. Find the charge.'), isNull, reason: 'a unit, not an option letter');
      expect(examPromptProblem('Which of the following is a vector quantity?'), 'multiple-choice stem');
      expect(examPromptProblem('Find the current in the circuit shown.'), 'refers to a missing figure');
    });

    test('a pattern bigger than the chapter makes a shorter paper with the same choice; empty parts are left out', () {
      final p = buildPaper(chapters: [_chapter()], pattern: pucPatterns[2], title: 'Annual', seed: 2);
      expect(p.sections.first.items, hasLength(8), reason: 'only 8 MCQs');
      expect(p.maxMarks, lessThan(pucPatterns[2].maxMarks));
      expect({for (final i in p.items) normQuestion(i.text)}.length, p.items.length);
      // Part B asks 7, any 5; the chapter has five fit 2-mark questions, so any 3 of 5 (the same
      // two spare).
      final b = p.sections.firstWhere((s) => s.part.label == 'B').groups.single;
      expect((b.items.length, b.attempt), (5, 3));
      // A 3-mark part never takes 2-mark questions, nor a 5-mark part 3-mark ones.
      expect(p.sections.firstWhere((s) => s.part.label == 'C').items.every((i) => i.marks == 3 && !i.text.startsWith('Define')), isTrue);
      for (final s in p.sections) {
        expect(s.total, s.groups.fold<num>(0, (a, g) => a + g.attempt * g.marks));
        for (final g in s.groups) {
          expect(g.attempt, inInclusiveRange(1, g.items.length));
        }
      }
      expect(p.maxMarks, p.sections.fold<num>(0, (a, s) => a + s.total));
      // Only multiple choice in the chapter: one part.
      final mcqOnly = BankChapter.fromJson({..._chapterJson(), 'sh': [], 'md': [], 'lg': [], 'pr': []});
      final q = buildPaper(chapters: [mcqOnly], pattern: pucPatterns.first, title: 'M');
      expect([for (final s in q.sections) s.part.label], ['A']);
    });

    test('each subject\'s annual paper follows the board: 70 marks (Mathematics 80), Part A 20 one-mark', () {
      for (final (subject, total, parts) in const [
        ('physics', 70, 'ABCD'),
        ('chemistry', 70, 'ABCDE'),
        ('maths', 80, 'ABCDE'),
        ('biology', 70, 'ABCDE'),
        ('accountancy', 70, 'ABCD'),
      ]) {
        final p = annualPatternFor(subject);
        expect(p.maxMarks, total, reason: subject);
        expect(p.parts.map((x) => x.label).join(), parts, reason: subject);
        expect(p.parts.first.total, 20);
        expect(p.parts.first.slots.single.marks, 1);
        for (final (label, marks) in const [('B', 2), ('C', 3), ('D', 5)]) {
          final part = p.parts.firstWhere((x) => x.label == label);
          expect(part.slots.every((s) => s.marks == marks && s.answered < s.count), isTrue, reason: '$subject $label: $marks marks with a choice');
        }
      }
      expect(pucPatternsFor('maths').map((p) => p.maxMarks), [25, 35, 80, 20]);
      expect(annualPatternFor('physics').parts[1].summary, 'Any 5 of 7 questions, 2 marks each');
      expect(annualPatternFor('physics').parts[3].summary, 'Any 3 of 4 questions, 5 marks each + any 2 of 3 problems, 5 marks each');
      expect(const PaperSlot(ItemKind.short, 7, 2, attempt: 5).withCount(5).answered, 3, reason: 'two spare, as before');
    });

    test('a bank built before 3-mark questions had their own list still makes a paper', () {
      final old = BankChapter.fromJson({..._chapterJson(), 'md': null}..remove('md'));
      expect(old.longs.every((q) => q.marks == 3), isTrue);
      final p = buildPaper(chapters: [old], pattern: pucPatterns.first, title: 'M', seed: 1);
      expect(p.sections.firstWhere((s) => s.part.label == 'C').items.every((i) => i.text.startsWith('Describe') || i.kind == ItemKind.problem), isTrue);
    });

    test('set B has the same questions in another order and its key follows', () {
      final a = buildPaper(chapters: [_chapter()], pattern: pucPatterns.first, title: 'M', seed: 4);
      final b = shuffledPaper(a, seed: 9);
      expect(b.set, 'B');
      expect({for (final i in b.items) i.id}, {for (final i in a.items) i.id});
      for (final i in b.items.where((i) => i.kind == ItemKind.mcq)) {
        final original = a.items.firstWhere((x) => x.id == i.id);
        final right = original.options[original.answer.codeUnitAt(0) - 65];
        expect(i.options[i.answer.codeUnitAt(0) - 65], right);
      }
    });

    test('an entrance pattern becomes this subject\'s multiple-choice section', () async {
      final bank = await ClassBank.load(year: 2, subject: 'Physics', bundle: _privateBank());
      expect(bank.source, BankSource.school);
      expect(bank.patterns.single.title, 'Made-up entrance');
      final p = entranceAsPattern(bank.patterns.single, 'physics');
      expect((p.questions, p.maxMarks, p.minutes), (10, 40, 30));
      expect(p.note, contains('−1'));
    });

    testWidgets('the PDF: copies, then the answer key on its own page', (tester) async {
      final p = buildPaper(chapters: [_chapter()], pattern: pucPatterns.first, title: 'Mock test 1', seed: 1, className: '2nd PUC A');
      final (one, three) = (await tester.runAsync(() async => (await paperPdf([p]), await paperPdf([p, shuffledPaper(p, seed: 2)], copies: 3))))!;
      expect(latin1.decode(one.sublist(0, 5)), '%PDF-');
      final pagesOne = _pages(one), pagesThree = _pages(three);
      expect(pagesOne, greaterThanOrEqualTo(2), reason: 'paper + key');
      final noKey = (await tester.runAsync(() => paperPdf([p], withKey: false)))!;
      expect(_pages(noKey), pagesOne - 1, reason: 'the key is a page of its own');
      expect(pagesThree, 3 * (pagesOne - 1) + 2, reason: 'three copies, a key per set');
    });
  });

  group('teams', () {
    test('present roll numbers split evenly by benches or mixed, nobody twice', () {
      final present = [
        for (var r = 1; r <= 40; r++)
          if (r != 13 && r != 29) r,
      ];
      final benches = splitTeams(present, 4);
      expect(benches.map((t) => t.name), ['Kaveri', 'Krishna', 'Tunga', 'Bhadra']);
      expect(benches.map((t) => t.rolls.length), [10, 10, 9, 9]);
      expect(benches.first.rolls, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect([for (final t in benches) ...t.rolls]..sort(), present);
      final mixed = splitTeams(present, 3, mixed: true, seed: 5);
      expect([for (final t in mixed) ...t.rolls]..sort(), present);
      expect(mixed.map((t) => t.rolls.length).toList()..sort(), [12, 13, 13]);
      expect(splitTeams(present, 3, mixed: true, seed: 5).map((t) => t.rolls), mixed.map((t) => t.rolls), reason: 'same seed, same teams');
      expect(splitTeams([1, 2], 6), hasLength(2), reason: 'no empty teams');
      expect(rollsLabel([1, 2, 3, 4]), '01–04');
      expect(rollsLabel([1, 3]), '01, 03');
    });
  });

  group('class plan', () {
    test('chapters spread to the revision weeks; behind when fewer are done than the date asks', () {
      final chapters = [for (var i = 1; i <= 10; i++) ('c$i', 'Chapter $i')];
      final plan = PlanRecord(examDate: DateTime(2027, 3, 1), done: const {'c1', 'c2'});
      final v = buildPlan(chapters: chapters, plan: plan, today: DateTime(2026, 11, 9));
      expect((v.done, v.left), (2, 8));
      expect(v.revisionFrom, DateTime(2027, 2, 8));
      expect(v.steps.where((s) => !s.done).first.from, DateTime(2026, 11, 9));
      expect(v.steps.last.to!.isAfter(v.revisionFrom), isFalse);
      expect(v.behind, greaterThan(0));
      expect(v.thisWeek.first.id, 'c3');
    });
  });

  group('worksheets', () {
    testWidgets('a worksheet from the bank prints with a Roll No. line and its key', (tester) async {
      final w = buildPaper(chapters: [_chapter()], pattern: worksheetPattern(mcq: 4, short: 1, problems: 1), title: 'Worksheet', seed: 3, topics: {'t1'});
      expect(w.items.where((i) => i.kind == ItemKind.mcq).every((i) => i.topic == 't1'), isTrue);
      expect(w.minutes, 0);
      final bytes = (await tester.runAsync(() => paperPdf([w])))!;
      expect(latin1.decode(bytes.sublist(0, 5)), '%PDF-');
      expect(_pages(bytes), 2);
    });
  });

  group('without the private bank', () {
    test('the lessons\' quick checks stand in, else nothing', () async {
      ClassBank.listAssets = (b) async => (b as _Bundle).files.keys.toList();
      final lessons = await ClassBank.load(year: 2, subject: 'Physics', bundle: _lessonsOnly());
      expect(lessons.source, BankSource.lessons);
      expect(lessons.chapters.single.questions.map((q) => q.stem), ['Quick check 1?', 'Quick check 2?']);
      expect(lessons.chapters.single.topicTitle('t1'), 'Shadows');
      final none = await ClassBank.load(year: 2, subject: 'Physics', bundle: _Bundle({}));
      expect(none.source, BankSource.none);
      expect(none.isEmpty, isTrue);
      expect(ClassBank.slug('Computer Science'), 'computer_science');
      expect(ClassBank.slug('Mathematics'), 'maths');
    });

    test('the lessons\' real chapter files: School overlay questions merged, single-answer formats only', () async {
      List<int> gz(Object j) => gzip.encode(utf8.encode(jsonEncode(j)));
      Map<String, Object?> q(String id, {String? format, int answer = 0, int options = 2, String? passage}) => {
        'id': id,
        'topicId': '$_ch.t1',
        'stem': {'en': '$id?'},
        'options': [
          for (var i = 0; i < options; i++) {'en': 'o$i'},
        ],
        'answer': answer,
        'format': ?format,
        if (passage != null) 'passage': {'en': passage},
        'exams': ['PUC'],
        'difficulty': 'hard',
      };
      final bundle = _Bundle({
        'assets/lessons/puc/$_ch.json.gz': gz({
          'chapter': {
            'id': _ch,
            'year': 'puc2',
            'number': 1,
            'title': {'en': 'Light and Shadows'},
            'topics': [
              {
                'id': '$_ch.t1',
                'title': {'en': 'Shadows'},
              },
            ],
          },
          'lessons': [],
          'questions': [
            q('a'),
            q('b', format: 'assertion_reason', options: 4, answer: 2),
            q('c', format: 'case_based', passage: 'A torch and a ball.'),
            q('d', format: 'numeric', options: 0),
            q('e', format: 'multi_correct', options: 4),
            q('f', answer: 5),
          ],
        }),
        // The School overlay has no `chapter`: its questions join the chapter's.
        'assets/private/lessons/$_ch.json.gz': gz({
          'lessons': {},
          'questions': [q('zs-1'), q('a')],
          'formulas': [],
        }),
        // A 1st PUC chapter misnamed for 2nd PUC is not taken.
        'assets/lessons/puc/puc2-physics-02-odd.json.gz': gz({
          'chapter': {'id': 'puc1-physics-02-odd', 'year': 'puc1', 'number': 2, 'title': 'Odd'},
          'lessons': [],
          'questions': [q('x')],
        }),
      });
      ClassBank.listAssets = (b) async => (b as _Bundle).files.keys.toList();
      final bank = await ClassBank.load(year: 2, subject: 'physics', bundle: bundle);
      expect(bank.source, BankSource.lessons);
      final c = bank.chapters.single;
      expect(c.questions.map((q) => q.id), ['a', 'b', 'c', 'zs-1']);
      expect(c.questions[1].answer, 2);
      expect(c.questions[2].stem, 'A torch and a ball.\n\nc?');
      expect(c.questions.first.difficulty, 3);
      expect(c.questions.first.puc, isTrue);
      expect(c.questions.first.topic, 't1');
    });

    testWidgets('the class tools open with no bank: quiz shows an empty state, teams still work', (tester) async {
      ClassBank.testBundle = _Bundle({});
      ClassBank.listAssets = (b) async => const [];
      final board = (await tester.runAsync(() => classroomBoard(seed: _college())))!;
      await pumpApp(tester, board);
      await tapKey(tester, 'ce-start-class');
      await settle(tester, 15);
      await tapKey(tester, 'ce-class-tools');
      await tapKey(tester, 'ce-tool-quiz');
      await _loaded(tester);
      expect(find.byKey(const Key('ce-tools-empty')), findsOneWidget);
      expect(find.textContaining('No questions for Physics'), findsOneWidget);
      await tapKey(tester, 'ce-tools-back');
      expect(find.byKey(const Key('ce-tools-bank-note')), findsOneWidget);
      await tapKey(tester, 'ce-tool-teams');
      await tapKey(tester, 'ce-teams-make');
      expect(find.byKey(const Key('ce-team-0')), findsOneWidget);
      await closeBoard(tester, board);
    });
  });

  testWidgets('a class quiz on the board: the question goes on the board, marks are kept', (tester) async {
    ClassBank.testBundle = _privateBank();
    final board = (await tester.runAsync(() => classroomBoard(seed: _college())))!;
    await pumpApp(tester, board);
    await tapKey(tester, 'ce-start-class');
    await settle(tester, 15);
    board.markAttendance({'roll-3': AttendanceMark.absent});
    await settle(tester);
    await tapKey(tester, 'ce-class-tools');
    await tapKey(tester, 'ce-tool-quiz');
    await _loaded(tester);
    expect(find.text('From the question bank · 8 questions in this chapter'), findsOneWidget);
    await tapKey(tester, 'ce-quiz-start');
    expect(find.byKey(const Key('ce-quiz-progress')), findsOneWidget);
    expect(find.text('Question 1 of 5'), findsOneWidget);
    await tapKey(tester, 'ce-roll-1');
    await tapKey(tester, 'ce-roll-2');
    await tapKey(tester, 'ce-roll-2');
    await tapKey(tester, 'ce-roll-3'); // absent: no mark
    final right = find.descendant(of: find.byKey(const Key('ce-quiz-right')), matching: find.text('1'));
    expect(right, findsOneWidget);
    await tapKey(tester, 'ce-quiz-next');
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    final raw = (await tester.runAsync(SharedPreferences.getInstance))!.getString('setting.classTools.c2a')!;
    final saved = ClassRecords.fromJson(jsonDecode(raw) as Map<String, dynamic>).quizzes.single;
    expect(saved.right, [1]);
    expect(saved.wrong, [2]);
    expect(saved.chapterId, _ch);
    expect(find.text('Question 2 of 5'), findsOneWidget);
    await closeBoard(tester, board);
  });
}

final _d = DateTime(2026, 11, 2);

int _pages(List<int> pdf) => RegExp(r'/Type\s*/Page[^s]').allMatches(latin1.decode(pdf)).length;

Future<void> _loaded(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 30)));
    await tester.pump(const Duration(milliseconds: 50));
  }
}

/// The sample college with the 2nd period given to 2nd PUC A.
CeSetup _college() {
  final s = sampleCollege();
  return s.copyWith(
    slots: [for (final x in s.slots) x.id == 'p1' ? x.copyWith(classId: 'c2a', topic: 'Light and Shadows') : x],
  );
}
