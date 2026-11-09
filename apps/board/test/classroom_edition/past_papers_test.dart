// Past papers (Classroom edition): the index, imports (PDFs generated here), paper packs,
// duplicates, filters, the file-name guess, the exam timer, scoring, and the screens. Every
// fixture is invented (papers_fixtures.dart); no real exam content.
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_board/classroom_edition/class_tools/bank.dart';
import 'package:kinetix_board/classroom_edition/class_tools/class_records.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/past_papers/exam_rules.dart';
import 'package:kinetix_board/classroom_edition/past_papers/exam_timer.dart';
import 'package:kinetix_board/classroom_edition/past_papers/filename_guess.dart';
import 'package:kinetix_board/classroom_edition/past_papers/paper_import.dart';
import 'package:kinetix_board/classroom_edition/past_papers/paper_library.dart';
import 'package:kinetix_board/classroom_edition/past_papers/paper_model.dart';
import 'package:kinetix_board/classroom_edition/past_papers/paper_pack.dart';
import 'package:kinetix_board/classroom_edition/past_papers/paper_storage.dart';
import 'package:kinetix_board/classroom_edition/past_papers/practice.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'ce_support.dart';
import 'papers_fixtures.dart';

final _day = DateTime(2026, 11, 9, 10);

PaperLibrary _lib([PaperStorage? s]) => PaperLibrary(s ?? MemoryPaperStorage(), now: () => _day);

const _neet = PaperDraft(exam: Exam.neet, year: 2024, subjects: ['Physics'], source: 'Made up');

void main() {
  late Uint8List pdfA, pdfB, keyA, pack;
  setUpAll(() async {
    pdfA = await fixturePdf('Paper A', pages: 3);
    pdfB = await fixturePdf('Paper B', pages: 2);
    keyA = await fixturePdf('Key A', pages: 1, key: true);
    pack = await fixturePack();
  });

  group('the index', () {
    test('papers and their keys survive a restart (in app storage, index.json version 1)', () async {
      final dir = Directory.systemTemp.createTempSync('papers-index');
      addTearDown(() => dir.deleteSync(recursive: true));
      final lib = _lib(DirPaperStorage(dir));
      await lib.load();
      expect(lib.isEmpty, isTrue);
      final p = (await lib.addPdf(pdfA, _neet.copyWithSession('Shift 2'), fileName: 'a.pdf'))!;
      await lib.addKey(keyA, p.id, fileName: 'key.pdf');
      final again = _lib(DirPaperStorage(dir));
      await again.load();
      final q = again.papers.single;
      expect(q.id, p.id);
      expect(q.exam, Exam.neet);
      expect(q.session, 'Shift 2');
      expect(q.subjects, ['Physics']);
      expect(q.source, 'Made up');
      expect(q.hasKey, isTrue);
      expect(q.pageCount, 3);
      expect(q.addedAt, _day);
      expect(await again.paperPdf(q), pdfA);
      expect(await again.keyPdf(q), keyA);
      final index = jsonDecode(File('${dir.path}/index.json').readAsStringSync()) as Map;
      expect(index['version'], 1);
      expect(File('${dir.path}/papers/${p.id}/paper.pdf').existsSync(), isTrue);
      expect(dir.listSync(recursive: true).where((f) => f.path.endsWith('.part')), isEmpty);
    });

    test('an unreadable index starts empty; unknown entries are dropped', () async {
      final s = MemoryPaperStorage();
      await s.write('index.json', utf8.encode('{not json'));
      final lib = _lib(s);
      await lib.load();
      expect(lib.isEmpty, isTrue);
      await s.write(
        'index.json',
        utf8.encode(
          jsonEncode({
            'version': 1,
            'papers': [
              {'id': 'x', 'exam': 'olympiad', 'year': 2020, 'paper': 'p.pdf'},
              {'id': 'y', 'exam': 'kcet', 'year': 2020, 'paper': 'papers/y/paper.pdf'},
            ],
          }),
        ),
      );
      await lib.load();
      expect(lib.papers.map((p) => p.id), ['y']);
    });

    test('remove takes the paper and its files away', () async {
      final s = MemoryPaperStorage();
      final lib = _lib(s);
      final p = (await lib.addPdf(pdfA, _neet, fileName: 'a.pdf'))!;
      await lib.addKey(keyA, p.id, fileName: 'k.pdf');
      await lib.remove(p);
      expect(lib.isEmpty, isTrue);
      expect(s.files.keys, ['index.json']);
    });
  });

  group('import', () {
    test('a PDF comes in; the same PDF again is skipped by its hash; a non-PDF is refused', () async {
      final lib = _lib();
      final r = ImportReport();
      expect(await lib.addPdf(pdfA, _neet, fileName: 'a.pdf', report: r), isNotNull);
      expect(await lib.addPdf(Uint8List.fromList(pdfA), _neet, fileName: 'a copy.pdf', report: r), isNull);
      expect(await lib.addPdf(Uint8List.fromList(utf8.encode('hello, not a pdf at all, just some text here')), _neet, fileName: 'notes.pdf', report: r), isNull);
      final truncated = Uint8List.sublistView(pdfB, 0, pdfB.length ~/ 2);
      expect(await lib.addPdf(truncated, _neet, fileName: 'half.pdf', report: r), isNull);
      expect(r.added, ['NEET 2024 · Physics']);
      expect(r.duplicates, ['a copy.pdf']);
      expect(r.problems, hasLength(2));
      expect(r.problems.first, contains('notes.pdf is not a PDF'));
      expect(lib.papers, hasLength(1));
    });

    test('an answer key joins its paper, and is skipped when it is already there', () async {
      final lib = _lib();
      final p = (await lib.addPdf(pdfA, _neet, fileName: 'a.pdf'))!;
      final r = ImportReport();
      await lib.addKey(keyA, p.id, fileName: 'k.pdf', report: r);
      await lib.addKey(keyA, p.id, fileName: 'k again.pdf', report: r);
      await lib.addKey(pdfB, 'nope', fileName: 'lost.pdf', report: r);
      expect(r.keysAdded, ['NEET 2024 · Physics']);
      expect(r.duplicates, ['k again.pdf']);
      expect(r.problems.single, contains('lost.pdf'));
      expect(lib.withHash(PaperLibrary.hashOf(keyA))?.id, p.id);
    });

    test('the form: guesses from file names, keys matched to papers in the batch, progress', () async {
      final lib = _lib();
      final items = [
        ImportItem((name: 'KCET_2023_Physics.pdf', bytes: pdfA)),
        ImportItem((name: 'kcet 2023 physics answer key.pdf', bytes: keyA)),
        ImportItem((name: 'not-a-paper.pdf', bytes: Uint8List.fromList(List.filled(100, 65)))),
        ImportItem((name: 'sample-pack.zip', bytes: pack)),
      ];
      expect(items[0].exam, Exam.kcet);
      expect(items[0].year, 2023);
      expect(items[0].subjects, {'Physics'});
      expect(items[0].isKey, isFalse);
      expect(items[1].isKey, isTrue);
      expect(items[2].problem, isNotNull);
      expect(items[3].isPack, isTrue);
      matchKeys(items, lib.papers);
      expect(items[1].keyFor, 'file:0');
      final progress = <(int, int)>[];
      final r = await importItems(lib, items, onProgress: (d, t, _) => progress.add((d, t)));
      expect(progress.first, (0, 3));
      expect(progress.last, (3, 3));
      expect(r.added, containsAll(['KCET 2023 · Physics', 'NEET 2024 · Physics, Chemistry, Biology', 'JEE Main 2024 · Shift 1 · Physics, Chemistry, Mathematics']));
      expect(r.keysAdded, ['KCET 2023 · Physics']);
      expect(r.problems.single, contains('not-a-paper.pdf'));
      expect(lib.papers, hasLength(4));
      expect(lib.papers.firstWhere((p) => p.paperHash == PaperLibrary.hashOf(pdfA)).hasKey, isTrue);
    });
  });

  group('paper packs', () {
    test('a pack reads: papers, keys, questions and pictures', () {
      final p = readPaperPack(pack);
      expect(p.id, 'sample-pack');
      expect(p.version, 1);
      expect(p.problems, isEmpty);
      expect(p.papers.map((x) => (x.exam, x.year)), [(Exam.neet, 2024), (Exam.jeeMain, 2024), (Exam.kcet, 2023)]);
      final neet = p.papers.first;
      expect(neet.key, isNotNull);
      expect(neet.questions!.questions, hasLength(4));
      expect(neet.images.keys, ['neet/q3.png']);
      final q4 = neet.questions!.questions[3];
      expect(q4.crop!.page, 1);
      expect(q4.correct, [1]);
      final jee = p.papers[1].questions!.questions;
      expect(jee[0].correct, [0, 2]);
      expect(jee[0].multiCorrect, isTrue);
      expect(jee[1].value, '12.5');
      expect(jee[2].marks, 3);
    });

    Uint8List zip(Map<String, Object> files) {
      final a = Archive();
      for (final e in files.entries) {
        a.add(ArchiveFile.bytes(e.key, e.value is String ? utf8.encode(e.value as String) : e.value as List<int>));
      }
      return ZipEncoder().encodeBytes(a);
    }

    String manifest(List<Map<String, Object?>> papers, {int version = 1, String format = packFormat}) => jsonEncode({'format': format, 'version': version, 'id': 't', 'title': 'T', 'papers': papers});

    test('what is not a pack, or is too new, is refused in plain words', () {
      expect(() => readPaperPack(Uint8List.fromList(utf8.encode('hello'))), throwsA(isA<FormatException>().having((e) => e.message, 'm', contains('not a zip'))));
      expect(() => readPaperPack(zip({'x.txt': 'x'})), throwsA(isA<FormatException>().having((e) => e.message, 'm', contains('no manifest.json'))));
      expect(() => readPaperPack(zip({'manifest.json': manifest([], format: 'other')})), throwsA(isA<FormatException>().having((e) => e.message, 'm', contains('not a Zynetix paper pack'))));
      expect(
        () => readPaperPack(zip({'manifest.json': manifest([{'exam': 'neet', 'year': 2024, 'paper': 'p.pdf'}], version: 2), 'p.pdf': pdfA})),
        throwsA(isA<FormatException>().having((e) => e.message, 'm', contains('newer Zynetix Classroom'))),
      );
      expect(() => readPaperPack(zip({'manifest.json': manifest([])})), throwsA(isA<FormatException>().having((e) => e.message, 'm', contains('no papers'))));
    });

    test('a bad paper is left out and named; the rest come in', () {
      final p = readPaperPack(
        zip({
          'manifest.json': manifest([
            {'id': 'ok', 'exam': 'kcet', 'year': 2022, 'paper': 'ok.pdf'},
            {'id': 'exam', 'exam': 'olympiad', 'year': 2022, 'paper': 'ok.pdf'},
            {'id': 'missing', 'exam': 'neet', 'year': 2022, 'paper': 'nope.pdf'},
            {'id': 'escape', 'exam': 'neet', 'year': 2022, 'paper': '../ok.pdf'},
            {'id': 'notpdf', 'exam': 'neet', 'year': 2022, 'paper': 'x.txt'},
            {'id': 'badq', 'exam': 'neet', 'year': 2022, 'paper': 'ok.pdf', 'questions': 'q.json'},
            {'id': 'noyear', 'exam': 'neet', 'paper': 'ok.pdf'},
          ]),
          'ok.pdf': pdfA,
          'x.txt': 'plain words',
          'q.json': jsonEncode({
            'version': 1,
            'questions': [
              {'n': 1, 'stem': 'Made up?', 'options': ['a', 'b'], 'answer': 'E'},
            ],
          }),
        }),
      );
      expect(p.papers.map((x) => x.id), ['ok']);
      expect(p.problems, hasLength(6));
      expect(p.problems.join('\n'), allOf(contains('exam: the exam "olympiad"'), contains('missing: its paper "nope.pdf" is not in the zip'), contains('escape'), contains('notpdf: its paper is not a PDF'), contains('"E" is not one of its options'), contains('noyear: it has no year')));
    });

    test('question sets: numbers, answers and pictures are checked', () {
      PaperQuestion q(Map<String, dynamic> j) => PaperQuestion.fromJson(j);
      expect(() => q({'stem': 'x', 'answer': '1'}), throwsFormatException);
      expect(() => q({'n': 1, 'answer': '1'}), throwsFormatException);
      expect(() => q({'n': 1, 'stem': 'x'}), throwsFormatException);
      expect(
        () => q({
          'n': 1,
          'crop': {
            'page': 1,
            'rect': [0.5, 0.5, 0.8, 0.2],
          },
          'answer': '1',
        }),
        throwsFormatException,
      );
      expect(() => QuestionSet.fromJson({'version': 9, 'questions': []}), throwsFormatException);
      final ok = q({'n': 2, 'stem': 'x', 'options': ['a', 'b', 'c'], 'answer': ['c', 'A'], 'negative': -2});
      expect(ok.correct, [0, 2]);
      expect(ok.negative, 2);
      expect(PaperQuestion.fromJson(ok.toJson()).correct, [0, 2]);
    });

    test('a pack imports into the library; again, it is skipped; a later pack adds a missing key', () async {
      final s = MemoryPaperStorage();
      final lib = _lib(s);
      final steps = <(int, int)>[];
      final r = await lib.addPack(pack, fileName: 'sample.zip', onProgress: (d, t) => steps.add((d, t)));
      expect(steps, [(0, 3), (1, 3), (2, 3), (3, 3)]);
      expect(r.added, hasLength(3));
      expect(r.problems, isEmpty);
      final neet = lib.papers.firstWhere((p) => p.exam == Exam.neet);
      expect(neet.hasKey, isTrue);
      expect(neet.questionCount, 4);
      expect(neet.packId, 'sample-pack');
      expect(neet.source, 'Sample pack (made up)');
      final qs = (await lib.questions(neet))!;
      final img = qs.questions[2].image!;
      expect(img, 'papers/${neet.id}/images/1.png');
      expect(await lib.file(img), tinyPng);

      final again = await lib.addPack(pack, fileName: 'sample.zip');
      expect(again.nothingNew, isTrue);
      expect(again.duplicates, hasLength(3));

      // A library that had the bare NEET PDF gets its key and questions from the pack.
      final lib2 = _lib();
      final neetPdf = readPaperPack(pack).papers.first.pdf;
      await lib2.addPdf(neetPdf, _neet, fileName: 'neet.pdf');
      final r2 = await lib2.addPack(pack);
      expect(r2.keysAdded, ['NEET 2024 · Physics']);
      expect(lib2.papers.firstWhere((p) => p.exam == Exam.neet).hasQuestions, isTrue);
      expect(lib2.papers, hasLength(3));
    });

    test('bundled packs: none without the folder', () async {
      final lib = _lib();
      final r = await lib.importBundled();
      expect(r.nothingNew, isTrue);
      expect(lib.isEmpty, isTrue);
    });
  });

  group('filters', () {
    Paper p(Exam e, int y, List<String> s, {String session = ''}) => Paper(id: '$e$y$s$session', exam: e, year: y, session: session, subjects: s, paperFile: 'x', paperHash: '', addedAt: _day);
    final papers = [
      p(Exam.kcet, 2023, ['Physics']),
      p(Exam.kcet, 2023, ['Chemistry']),
      p(Exam.kcet, 2022, ['Physics']),
      p(Exam.neet, 2024, ['Physics', 'Chemistry', 'Biology']),
      p(Exam.jeeMain, 2024, ['Mathematics'], session: 'Shift 2'),
      p(Exam.jeeMain, 2024, ['Mathematics'], session: 'Shift 1'),
    ];

    test('exam, then year, then subject; newest first', () {
      expect(filterPapers(papers, const PaperFilter()).first.year, 2024);
      expect(filterPapers(papers, const PaperFilter(exam: Exam.kcet)), hasLength(3));
      expect(filterPapers(papers, const PaperFilter(exam: Exam.kcet, year: 2023)), hasLength(2));
      expect(filterPapers(papers, const PaperFilter(exam: Exam.kcet, year: 2023, subject: 'Physics')).single.subjects, ['Physics']);
      expect(filterPapers(papers, const PaperFilter(exam: Exam.jeeMain)).map((x) => x.session), ['Shift 1', 'Shift 2']);
      final c = filterChoices(papers, const PaperFilter(exam: Exam.kcet));
      expect(c.exams, [Exam.kcet, Exam.neet, Exam.jeeMain]);
      expect(c.years, [2023, 2022]);
      expect(c.subjects, ['Chemistry', 'Physics']);
      expect(filterChoices(papers, const PaperFilter(exam: Exam.kcet, year: 2022)).subjects, ['Physics']);
    });

    test('search: every word, any field, any case', () {
      expect(filterPapers(papers, const PaperFilter(search: 'kcet physics')), hasLength(2));
      expect(filterPapers(papers, const PaperFilter(search: 'JEE shift')), hasLength(2));
      expect(filterPapers(papers, const PaperFilter(search: 'chemistry kcet')).single.subjects, ['Chemistry']);
      expect(filterPapers(papers, const PaperFilter(search: 'biology 2024')).single.exam, Exam.neet);
      expect(filterPapers(papers, const PaperFilter(search: 'zoology')), isEmpty);
    });
  });

  test('file names: exam, year, subject, shift and "answer key"', () {
    final cases = <String, (Exam?, int?, String?, String, bool)>{
      'NEET_2023_Physics.pdf': (Exam.neet, 2023, 'Physics', '', false),
      'kcet-2022-maths-answer-key.pdf': (Exam.kcet, 2022, 'Mathematics', '', true),
      'JEE Main 2024 27 Jan Shift 1.pdf': (Exam.jeeMain, 2024, null, '27 Jan, Shift 1', false),
      'JEE-Advanced-2021-Paper-2.pdf': (Exam.jeeAdvanced, 2021, null, 'Paper 2', false),
      'II PUC Chemistry March 2019.pdf': (Exam.puc2, 2019, 'Chemistry', '', false),
      '1st PUC Biology 2020 solutions.pdf': (Exam.puc1, 2020, 'Biology', '', true),
      'CBSE class 12 physics 2020.pdf': (Exam.cbse12, 2020, 'Physics', '', false),
      'cbse XI chem 2018.pdf': (Exam.cbse11, 2018, 'Chemistry', '', false),
      'COMEDK UGET 2019.pdf': (Exam.comedk, 2019, null, '', false),
      'scan0001.pdf': (null, null, null, '', false),
    };
    for (final e in cases.entries) {
      final g = guessFromFileName(e.key);
      expect((g.exam, g.year, g.subject, g.session, g.isKey), e.value, reason: e.key);
    }
  });

  group('timer', () {
    test('the exam table: NEET 3 h 20 min, KCET 80 min per subject', () {
      expect(Exam.neet.rule.minutes, 200);
      expect(Exam.neet.rule.timeLine, '3 h 20 min');
      expect(Exam.kcet.rule.timeLine, '80 min per subject');
      expect(Exam.jeeMain.rule.minutes, 180);
      for (final e in Exam.values) {
        expect(examRules[e], isNotNull, reason: e.label);
      }
      expect(Exam.parse('JEE Main'), Exam.jeeMain);
      expect(Exam.parse('jee-advanced'), Exam.jeeAdvanced);
      expect(Exam.parse('olympiad'), isNull);
    });

    test('counts down by the clock, pauses, goes through its phases, resets', () {
      var now = DateTime(2026, 11, 9, 9);
      final c = ExamCountdown(total: const Duration(minutes: 200), now: () => now);
      expect(c.phase, CountdownPhase.ready);
      expect(clockText(c.left), '3:20:00');
      c.start();
      now = now.add(const Duration(minutes: 30, seconds: 5));
      expect(clockText(c.left), '2:49:55');
      expect(c.phase, CountdownPhase.running);
      expect(c.endsAt, DateTime(2026, 11, 9, 12, 20));
      c.pause();
      now = now.add(const Duration(hours: 1));
      expect(clockText(c.left), '2:49:55');
      expect(c.phase, CountdownPhase.paused);
      expect(c.endsAt, isNull);
      c.start();
      now = now.add(const Duration(minutes: 160, seconds: 5));
      expect(c.phase, CountdownPhase.lastTen);
      now = now.add(const Duration(minutes: 5));
      expect(c.phase, CountdownPhase.lastFive);
      now = now.add(const Duration(hours: 1));
      expect(c.left, Duration.zero);
      expect(c.phase, CountdownPhase.timeUp);
      c.reset(const Duration(minutes: 80));
      expect(c.phase, CountdownPhase.ready);
      expect(clockText(c.left, minutesOnly: true), '80:00');
      expect(clockText(c.left), '1:20:00');
      c.add(const Duration(minutes: -100));
      expect(c.total, const Duration(minutes: 1));
    });

    testWidgets('the timer screen: the exam\'s time, start, the minutes go by, time up', (tester) async {
      var now = DateTime(2026, 11, 9, 9);
      tester.view
        ..physicalSize = const Size(1920, 1080)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(MaterialApp(home: ExamTimerScreen(exam: Exam.kcet, title: 'KCET 2023', now: () => now)));
      expect(find.text('80:00'), findsOneWidget);
      await tester.tap(find.byKey(const Key('ce-timer-exam-neet')));
      await tester.pump();
      expect(find.text('3:20:00'), findsOneWidget);
      await tester.tap(find.byKey(const Key('ce-timer-start')));
      now = now.add(const Duration(minutes: 195));
      await tester.pump(const Duration(seconds: 1));
      expect(find.text('05:00'), findsOneWidget);
      expect(find.text('Last 5 minutes.'), findsOneWidget);
      now = now.add(const Duration(minutes: 6));
      await tester.pump(const Duration(seconds: 1));
      expect(find.text('00:00'), findsOneWidget);
      expect(find.text('Time is up. Pens down.'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });
  });

  group('scoring', () {
    PaperQuestion q({List<String> options = const ['a', 'b', 'c', 'd'], List<int> correct = const [1], double? marks, double? negative}) =>
        PaperQuestion(number: 1, stem: 'x', options: options, correct: correct, marks: marks, negative: negative);

    test('each exam\'s marking: NEET and JEE Main +4/−1, KCET +1/0; a question\'s own marks win', () {
      expect(q().score(Exam.neet, true), 4);
      expect(q().score(Exam.neet, false), -1);
      expect(q().score(Exam.neet, null), 0);
      expect(q().score(Exam.jeeMain, false), -1);
      expect(q().score(Exam.kcet, true), 1);
      expect(q().score(Exam.kcet, false), 0);
      expect(q().score(Exam.comedk, false), 0);
      expect(q(marks: 4, negative: 2).score(Exam.jeeAdvanced, false), -2);
      expect(Exam.neet.rule.markingLine, '+4 right, −1 wrong');
      expect(Exam.kcet.rule.markingLine, '+1 for a right answer, no negative marks');
    });

    test('right means every right option and nothing else', () {
      final multi = q(correct: [0, 2]);
      expect(multi.isRight({0, 2}), isTrue);
      expect(multi.isRight({0}), isFalse);
      expect(multi.isRight({0, 1, 2}), isFalse);
      expect(q().isRight({}), isFalse);
      expect(multi.answerLabel, 'A, C');
    });

    test('a class\'s practice score and the questions picked by year and chapter', () async {
      final lib = _lib();
      await lib.addPack(pack);
      final sets = [
        for (final p in lib.papers)
          if (p.hasQuestions) (p, (await lib.questions(p))!),
      ];
      expect(selectPractice(sets).map((i) => i.paper.exam).toSet(), {Exam.neet, Exam.jeeMain});
      final motion = selectPractice(sets, chapters: {'Motion'});
      expect(motion.map((i) => (i.paper.exam, i.q.number)), [(Exam.neet, 1), (Exam.neet, 4), (Exam.jeeMain, 3)]);
      expect(selectPractice(sets, years: {2023}), isEmpty);
      expect(selectPractice(sets, subjects: {'Chemistry'}).single.q.number, 3);
      final (total, right, wrong) = practiceScore([(motion[0], {2}), (motion[1], {0}), (motion[2], {1}), (motion[0], null)]);
      // NEET right +4, NEET wrong −1, JEE question's own +3.
      expect((total, right, wrong), (6.0, 2, 1));
    });
  });

  group('on the board', () {
    late bool realPages;
    setUp(() {
      realPages = usePdfium();
      ClassBank.clearCache();
    });
    tearDown(() {
      PaperLibrary.sharedForTests = null;
      Edition.classroom = Edition.built == 'classroom';
    });

    Future<void> loaded(WidgetTester tester, [int n = 10]) async {
      for (var i = 0; i < n; i++) {
        await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 40)));
        await tester.pump(const Duration(milliseconds: 50));
      }
    }

    late BoardController board;
    Future<PaperLibrary> openTool(WidgetTester tester, {bool withPack = true}) async {
      final lib = _lib();
      if (withPack) await tester.runAsync(() => lib.addPack(pack));
      PaperLibrary.sharedForTests = lib;
      board = (await tester.runAsync(() => classroomBoard(seed: sampleCollege())))!;
      await pumpApp(tester, board);
      await tapKey(tester, 'ce-start-class');
      await settle(tester, 15);
      await tapKey(tester, 'ce-class-tools');
      await tapKey(tester, 'ce-tool-papers');
      await loaded(tester);
      return lib;
    }

    testWidgets('empty: how to add papers from USB; Add papers asks for the PIN, then imports', (tester) async {
      final lib = await openTool(tester, withPack: false);
      expect(find.byKey(const Key('ce-papers-empty')), findsOneWidget);
      expect(find.text('No past papers on this board yet'), findsOneWidget);
      expect(find.textContaining('USB stick'), findsWidgets);
      pickPaperFiles = () async => [(name: 'KCET_2023_Physics.pdf', bytes: pdfA), (name: 'KCET 2023 Physics key.pdf', bytes: keyA), (name: 'sample.zip', bytes: pack)];
      addTearDown(() => pickPaperFiles = () async => const []);
      await tapKey(tester, 'ce-papers-empty-add');
      // The school PIN on its number pad (the first time, the college then chooses its own).
      expect(find.byKey(const Key('ce-pin-pad')), findsOneWidget);
      await typePin(tester, '9999');
      expect(find.textContaining('That is not the school PIN.'), findsOneWidget);
      await enterSchoolPin(tester);
      expect(find.byKey(const Key('ce-papers-add-start')), findsOneWidget);
      await tapKey(tester, 'ce-papers-pick');
      await loaded(tester, 3);
      expect(find.byKey(const Key('ce-papers-form')), findsOneWidget);
      // The guesses: KCET 2023 Physics; the second file is its answer key.
      final kcetChip = find.byKey(const Key('ce-papers-exam-0-kcet'));
      expect(tester.widget<Material>(kcetChip).color, isNot(Colors.white));
      expect(find.byKey(const Key('ce-papers-key-for-1')), findsOneWidget);
      expect(find.text('Add 3 files'), findsOneWidget);
      await tapKey(tester, 'ce-papers-add-go');
      await loaded(tester, 8);
      expect(find.byKey(const Key('ce-papers-report')), findsOneWidget);
      expect(find.text('4 papers added, 1 answer key added'), findsOneWidget);
      await tapKey(tester, 'ce-papers-add-done');
      await loaded(tester, 3);
      expect(lib.papers, hasLength(4));
      expect(find.byKey(const Key('ce-papers-library')), findsOneWidget);
      expect(find.text('4 papers'), findsOneWidget);
      await closeBoard(tester, board);
    });

    testWidgets('the library: cards with their source; filters and search', (tester) async {
      await openTool(tester);
      expect(find.byKey(const Key('ce-papers-library')), findsOneWidget);
      expect(find.text('Source: Sample pack (made up)'), findsNWidgets(3));
      expect(find.text('Answer key'), findsNWidgets(2));
      await tapKey(tester, 'ce-papers-exam-kcet');
      expect(find.text('Source: Sample pack (made up)'), findsOneWidget);
      expect(find.text('KCET'), findsWidgets);
      await tapKey(tester, 'ce-papers-exam-all');
      await tapKey(tester, 'ce-papers-year-2024');
      expect(find.text('Source: Sample pack (made up)'), findsNWidgets(2));
      await tapKey(tester, 'ce-papers-exam-all');
      await tester.enterText(find.byKey(const Key('ce-papers-search')), 'shift 1');
      await settle(tester);
      expect(find.text('Shift 1'), findsOneWidget);
      expect(find.text('Source: Sample pack (made up)'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('ce-papers-search')), 'zoology');
      await settle(tester);
      expect(find.byKey(const Key('ce-papers-none')), findsOneWidget);
      await closeBoard(tester, board);
    });

    testWidgets('the viewer: pages, the answer key beside it, Put page on board', (tester) async {
      final lib = await openTool(tester);
      final neet = lib.papers.firstWhere((p) => p.exam == Exam.neet);
      await tapKey(tester, 'ce-paper-${neet.id}');
      expect(find.byKey(const Key('ce-paper-detail')), findsOneWidget);
      await tapKey(tester, 'ce-paper-show');
      await loaded(tester);
      expect(find.byKey(const Key('ce-paper-viewer')), findsOneWidget);
      expect(find.text('Page 1 of 4'), findsOneWidget);
      await tapKey(tester, 'ce-viewer-next');
      expect(find.text('Page 2 of 4'), findsOneWidget);
      await tapKey(tester, 'ce-viewer-thumb-3');
      expect(find.text('Page 4 of 4'), findsOneWidget);
      await tapKey(tester, 'ce-viewer-key');
      await loaded(tester);
      expect(find.byKey(const Key('ce-viewer-key-pane')), findsOneWidget);
      expect(find.text('Answer key · page 1 of 2'), findsOneWidget);
      await tapKey(tester, 'ce-viewer-key-overlay');
      expect(find.byKey(const Key('ce-viewer-key-pane')), findsOneWidget);
      final wb = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas, skipOffstage: false).first).controller;
      await tester.tap(find.byKey(const Key('ce-viewer-put')));
      await loaded(tester, 12);
      expect(find.byKey(const Key('ce-paper-viewer')), findsNothing);
      final img = wb.elements.whereType<ImageElement>().single;
      expect(img.rect.width, lessThanOrEqualTo(1640));
      expect(wb.elements.whereType<TextElement>().single.text, 'NEET 2024 · page 4');
      if (realPages) expect(img.bytes.length, greaterThan(1000));
      await closeBoard(tester, board);
    });

    testWidgets('practice: option tiles, reveal, the exam\'s marks', (tester) async {
      final lib = await openTool(tester);
      final neet = lib.papers.firstWhere((p) => p.exam == Exam.neet);
      await tapKey(tester, 'ce-paper-${neet.id}');
      await tapKey(tester, 'ce-paper-practise');
      await loaded(tester, 4);
      expect(find.byKey(const Key('ce-papers-practice-setup')), findsOneWidget);
      expect(find.text('4 questions'), findsOneWidget);
      await tapKey(tester, 'ce-practice-chapter-Motion');
      expect(find.text('2 questions'), findsOneWidget);
      await tapKey(tester, 'ce-practice-chapter-all');
      await tapKey(tester, 'ce-practice-start');
      expect(find.byKey(const Key('ce-papers-practice')), findsOneWidget);
      expect(find.text('Question 1 of 4'), findsOneWidget);
      await tapKey(tester, 'ce-practice-option-2');
      await tapKey(tester, 'ce-practice-reveal');
      expect(find.text('Right! +4   Answer: C'), findsOneWidget);
      await tapKey(tester, 'ce-practice-next');
      await tapKey(tester, 'ce-practice-option-0');
      await tapKey(tester, 'ce-practice-reveal');
      expect(find.text('Not quite −1   Answer: C'), findsOneWidget);
      expect(find.text('Class score 3  (1 right, 1 wrong)'), findsOneWidget);
      await tapKey(tester, 'ce-practice-close');
      await closeBoard(tester, board);
    });

    testWidgets('class quiz from a paper: roll numbers, NEET marking, saved to the class records', (tester) async {
      final lib = await openTool(tester);
      final neet = lib.papers.firstWhere((p) => p.exam == Exam.neet);
      await tapKey(tester, 'ce-paper-${neet.id}');
      await tapKey(tester, 'ce-paper-practise');
      await loaded(tester, 4);
      await tapKey(tester, 'ce-practice-class-quiz');
      await loaded(tester, 6);
      expect(find.text('Question 1 of 4'), findsOneWidget);
      expect(find.text('NEET · 2024 class quiz'), findsOneWidget);
      for (var q = 0; q < 4; q++) {
        await tapKey(tester, 'ce-roll-1'); // right every time
        await tapKey(tester, 'ce-roll-2');
        await tapKey(tester, 'ce-roll-2'); // wrong every time
        await tapKey(tester, 'ce-quiz-next');
        await loaded(tester, 4);
      }
      expect(find.byKey(const Key('ce-quiz-scores')), findsOneWidget);
      expect(find.text('NEET marking: +4 right, −1 wrong'), findsOneWidget);
      await loaded(tester, 4);
      final raw = (await tester.runAsync(SharedPreferences.getInstance))!.getString('setting.classTools.c1a')!;
      final rec = ClassRecords.fromJson(jsonDecode(raw) as Map<String, dynamic>);
      expect(rec.quizzes, hasLength(4));
      expect(rec.quizzes.first.chapterId, 'Motion');
      final mock = rec.mocks.single;
      expect(mock.title, 'NEET · 2024 class quiz');
      expect(mock.maxMarks, 16);
      expect(mock.marks[1], 16);
      expect(mock.marks[2], -4);
      expect(mock.marks[3], 0);
      await tapKey(tester, 'ce-tools-back'); // back to the paper, not the hub

      await loaded(tester, 3);
      expect(find.byKey(const Key('ce-paper-detail')), findsOneWidget);
      await closeBoard(tester, board);
    });
  });
}

extension on PaperDraft {
  PaperDraft copyWithSession(String s) => PaperDraft(exam: exam, year: year, session: s, subjects: subjects, language: language, source: source);
}
