import 'dart:convert';
import 'dart:io' show gzip;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Where a subject's questions came from.
enum BankSource {
  /// The Zynetix School bank, built into `assets/private/class_tools/` at build time
  /// (`tool/build_class_bank.py`, README.md). Never committed.
  school,

  /// No bank: the quick-check questions bundled with the Lessons.
  lessons,

  /// Nothing for this subject on the board.
  none,
}

/// A multiple-choice question (Class quiz, Part A of a mock test, worksheets).
@immutable
class BankQuestion {
  const BankQuestion({
    required this.id,
    required this.chapterId,
    this.topic = '',
    required this.stem,
    required this.options,
    required this.answer,
    this.explanation = '',
    this.difficulty = 2,
    this.puc = false,
  });

  final String id;
  final String chapterId;

  /// The topic's id within the chapter ("t3"), '' when untagged.
  final String topic;
  final String stem;
  final List<String> options;

  /// Index of the right option.
  final int answer;
  final String explanation;

  /// 1 easy, 2 medium, 3 hard.
  final int difficulty;

  /// Tagged for the PUC board exam.
  final bool puc;

  String get answerText => '${String.fromCharCode(65 + answer)}. ${options[answer]}';

  static BankQuestion fromJson(String chapterId, Map<String, dynamic> j) => BankQuestion(
    id: '${j['id']}',
    chapterId: chapterId,
    topic: '${j['tp'] ?? ''}',
    stem: '${j['s']}',
    options: [for (final o in (j['o'] as List? ?? const [])) '$o'],
    answer: (j['a'] as num?)?.toInt() ?? 0,
    explanation: '${j['x'] ?? ''}',
    difficulty: (j['d'] as num?)?.toInt() ?? 2,
    puc: j['puc'] == 1 || j['puc'] == true,
  );
}

/// A written question worth [marks] (2, 3 or 5) as the bank sized it, with what the answer key
/// looks for.
@immutable
class BankWritten {
  const BankWritten({required this.chapterId, this.topic = '', required this.question, required this.answer, this.marks = 2});

  final String chapterId;
  final String topic;
  final String question;

  /// 2 (Part B), 3 (Part C) or 5 (Part D).
  final int marks;

  /// The key: an answer, or the points to look for.
  final String answer;
}

/// A worked problem: the question, its answer and the steps.
@immutable
class BankProblem {
  const BankProblem({required this.chapterId, this.topic = '', required this.question, required this.answer, this.steps = const [], this.size = 3});

  final String chapterId;
  final String topic;
  final String question;
  final String answer;
  final List<String> steps;

  /// The marks it is sized for: 2 (one step), 3 or 5 (a full numerical).
  final int size;
}

/// A formula: its name, TeX, the same as plain text and a note.
@immutable
class BankFormula {
  const BankFormula({required this.chapterId, this.topic = '', required this.name, required this.tex, this.text = '', this.note = ''});

  final String chapterId;
  final String topic;
  final String name;
  final String tex;
  final String text;
  final String note;
}

/// One chapter of a subject with everything the Class tools draw on.
@immutable
class BankChapter {
  const BankChapter({
    required this.id,
    required this.number,
    required this.title,
    this.topics = const [],
    this.questions = const [],
    this.shorts = const [],
    this.mediums = const [],
    this.longs = const [],
    this.problems = const [],
    this.formulas = const [],
  });

  final String id;
  final int number;
  final String title;

  /// (id, title), in the syllabus order.
  final List<(String, String)> topics;
  final List<BankQuestion> questions;
  /// Written questions for 2 marks (Part B), 3 marks (Part C) and 5 marks (Part D).
  final List<BankWritten> shorts;
  final List<BankWritten> mediums;
  final List<BankWritten> longs;
  final List<BankProblem> problems;
  final List<BankFormula> formulas;

  String topicTitle(String topic) => topics.where((t) => t.$1 == topic).firstOrNull?.$2 ?? '';

  static BankChapter fromJson(Map<String, dynamic> j) {
    final id = '${j['id']}';
    List<Map<String, dynamic>> maps(String k) => [
      for (final e in (j[k] as List?) ?? const [])
        if (e is Map) e.cast<String, dynamic>(),
    ];
    return BankChapter(
      id: id,
      number: (j['n'] as num?)?.toInt() ?? 0,
      title: '${j['t'] ?? id}',
      topics: [
        for (final t in (j['topics'] as List?) ?? const [])
          if (t is List && t.length >= 2) ('${t[0]}', '${t[1]}'),
      ],
      questions: [
        for (final q in maps('q'))
          if (((q['o'] as List?)?.length ?? 0) >= 2) BankQuestion.fromJson(id, q),
      ],
      shorts: [for (final s in maps('sh')) BankWritten(chapterId: id, topic: '${s['tp'] ?? ''}', question: '${s['q']}', answer: '${s['a'] ?? ''}')],
      mediums: [for (final s in maps('md')) BankWritten(chapterId: id, topic: '${s['tp'] ?? ''}', question: '${s['q']}', answer: '${s['a'] ?? ''}', marks: 3)],
      longs: [
        for (final s in maps('lg'))
          BankWritten(
            chapterId: id,
            topic: '${s['tp'] ?? ''}',
            question: '${s['q']}',
            answer: [for (final p in (s['pts'] as List?) ?? const []) '$p'].join(' '),
            // A bank built before 3-mark questions had their own list kept them here.
            marks: j.containsKey('md') ? 5 : 3,
          ),
      ],
      problems: [
        for (final p in maps('pr'))
          BankProblem(
            chapterId: id,
            topic: '${p['tp'] ?? ''}',
            question: '${p['q']}',
            answer: '${p['a'] ?? ''}',
            steps: [for (final s in (p['st'] as List?) ?? const []) '$s'],
            size: (p['m'] as num?)?.toInt() ?? 3,
          ),
      ],
      formulas: [
        for (final f in maps('f')) BankFormula(chapterId: id, topic: '${f['tp'] ?? ''}', name: '${f['n'] ?? ''}', tex: '${f['tex'] ?? ''}', text: '${f['txt'] ?? ''}', note: '${f['note'] ?? ''}'),
      ],
    );
  }

  /// The question formats the Class tools can ask: one right option among two or more.
  static const lessonFormats = {null, 'mcq', 'assertion_reason', 'case_based'};

  /// A chapter from a bundled Lessons file (`assets/lessons/puc/<chapterId>.json.gz`:
  /// `{chapter, lessons, questions}`, built by `bundle_puc.py`): its single-answer
  /// multiple-choice questions, plus the [overlay]'s (`assets/private/lessons/<chapterId>.json.gz`,
  /// `{lessons, questions, formulas}`; the School's imported questions) when the build has it.
  static BankChapter fromLessonFile(Map<String, dynamic> j, {Map<String, dynamic>? overlay}) {
    final ch = (j['chapter'] as Map?)?.cast<String, dynamic>() ?? const {};
    final id = '${ch['id'] ?? ''}';
    String en(Object? v) => v is Map ? '${v['en'] ?? ''}' : (v is String ? v : '');
    String tp(Object? v) => '${v ?? ''}'.split('.').last;
    final seen = <String>{};
    final questions = <BankQuestion>[];
    for (final q in [...(j['questions'] as List?) ?? const [], ...(overlay?['questions'] as List?) ?? const []]) {
      if (q is! Map || !lessonFormats.contains(q['format'])) continue;
      final options = [for (final o in (q['options'] as List?) ?? const []) en(o).trim()];
      final answer = q['answer'];
      if (options.length < 2 || options.any((o) => o.isEmpty) || answer is! int || answer < 0 || answer >= options.length) continue;
      final passage = en(q['passage']).trim();
      final stem = en(q['stem']).trim();
      if (stem.isEmpty || !seen.add('${q['id']}')) continue;
      questions.add(
        BankQuestion(
          id: '${q['id']}',
          chapterId: id,
          topic: tp(q['topicId']),
          stem: passage.isEmpty ? stem : '$passage\n\n$stem',
          options: options,
          answer: answer,
          explanation: en(q['explanation']),
          difficulty: const {'easy': 1, 'medium': 2, 'hard': 3}[q['difficulty']] ?? 2,
          puc: ((q['exams'] as List?) ?? const []).contains('PUC'),
        ),
      );
    }
    return BankChapter(
      id: id,
      number: (ch['number'] as num?)?.toInt() ?? 0,
      title: en(ch['title']).isEmpty ? id : en(ch['title']),
      topics: [
        for (final t in (ch['topics'] as List?) ?? const [])
          if (t is Map) (tp(t['id']), en(t['title'])),
      ],
      questions: questions,
    );
  }
}

/// An entrance-exam paper pattern (KCET, NEET, JEE…), from the bank.
@immutable
class EntrancePattern {
  const EntrancePattern({required this.id, required this.exam, required this.title, this.blurb = '', required this.minutes, required this.sections});

  final String id, exam, title, blurb;
  final int minutes;

  /// (subject, questions, marks for right, marks off for wrong).
  final List<(String, int, num, num)> sections;

  static EntrancePattern fromJson(Map<String, dynamic> j) => EntrancePattern(
    id: '${j['id']}',
    exam: '${j['exam'] ?? ''}',
    title: '${j['t'] ?? j['id']}',
    blurb: '${j['b'] ?? ''}',
    minutes: (j['min'] as num?)?.toInt() ?? 0,
    sections: [
      for (final s in (j['sec'] as List?) ?? const [])
        if (s is List && s.length >= 4) ('${s[0]}', (s[1] as num).toInt(), s[2] as num, s[3] as num),
    ],
  );
}

/// One subject of one year (2nd PUC Physics): its chapters, and where they came from.
@immutable
class SubjectBank {
  const SubjectBank({required this.year, required this.subject, required this.source, this.chapters = const [], this.patterns = const []});

  final int year;

  /// The bank's slug ("physics", "computer_science").
  final String subject;
  final BankSource source;
  final List<BankChapter> chapters;

  /// Entrance-exam patterns with a section for this subject.
  final List<EntrancePattern> patterns;

  bool get isEmpty => chapters.every((c) => c.questions.isEmpty && c.formulas.isEmpty && c.shorts.isEmpty && c.mediums.isEmpty && c.longs.isEmpty && c.problems.isEmpty);

  BankChapter? chapter(String? id) => chapters.where((c) => c.id == id).firstOrNull;

  /// The chapter whose title best matches [text] (the timetable's topic, "Electric Charges
  /// and Fields"), else null.
  BankChapter? chapterFor(String? text) {
    final t = _norm(text ?? '');
    if (t.isEmpty) return null;
    return chapters.where((c) => _norm(c.title) == t).firstOrNull ?? chapters.where((c) => _norm(c.title).isNotEmpty && (t.contains(_norm(c.title)) || _norm(c.title).contains(t))).firstOrNull;
  }

  /// "Physics · Electric Charges and Fields" topic title for a record's topic key.
  String topicTitle(String chapterId, String topic) => chapter(chapterId)?.topicTitle(topic) ?? '';

  static String _norm(String s) => s.toLowerCase().replaceAll(RegExp('[^a-z0-9]+'), ' ').trim();
}

/// The Class tools' bank: loads one subject at a time from the private bank, else from the
/// Lessons' quick checks, else empty. Results are kept for the app's life.
abstract final class ClassBank {
  static const dir = 'assets/private/class_tools';

  /// The Lessons' chapters and their School overlays (lib/classroom_edition/lessons).
  static const lessonsDir = 'assets/lessons', lessonsPrivateDir = 'assets/private/lessons';

  /// Lists the bundle's assets (tests replace it).
  static Future<List<String>> Function(AssetBundle bundle) listAssets = (bundle) async => (await AssetManifest.loadFromAssetBundle(bundle)).listAssets();

  static final _cache = <String, Future<SubjectBank>>{};

  /// The bundle the board reads the bank from in tests (null: the app's own).
  @visibleForTesting
  static AssetBundle? testBundle;

  /// Forgets loaded subjects (tests).
  static void clearCache() => _cache.clear();

  /// The bank slug for a subject's name: "Mathematics" → maths, "Computer Science" →
  /// computer_science.
  static String slug(String? subject) {
    final s = (subject ?? '').trim().toLowerCase().replaceAll(RegExp(r'[^a-z]+'), '_').replaceAll(RegExp(r'^_|_$'), '');
    return const {
          'mathematics': 'maths',
          'math': 'maths',
          'computer': 'computer_science',
          'cs': 'computer_science',
          'business': 'business_studies',
          'stats': 'statistics',
          'bio': 'biology',
          'accounts': 'accountancy',
        }[s] ??
        s;
  }

  /// The subject [subject] of 1st or 2nd PUC ([year] 1 or 2).
  static Future<SubjectBank> load({required int year, required String? subject, AssetBundle? bundle}) {
    final b = bundle ?? testBundle ?? rootBundle;
    final s = slug(subject);
    return _cache.putIfAbsent('$year/$s/${identityHashCode(b)}', () => _load(year, s, b));
  }

  static Future<SubjectBank> _load(int year, String subject, AssetBundle bundle) async {
    if (subject.isEmpty) return SubjectBank(year: year, subject: subject, source: BankSource.none);
    try {
      final index = jsonDecode(await bundle.loadString('$dir/index.json', cache: false)) as Map<String, dynamic>;
      final entry = ((index['subjects'] as List?) ?? const []).cast<Map>().where((e) => e['year'] == year && e['subject'] == subject).firstOrNull;
      final patterns = [
        for (final p in (index['patterns'] as List?) ?? const [])
          if (p is Map) EntrancePattern.fromJson(p.cast<String, dynamic>()),
      ].where((p) => p.sections.any((s) => s.$1 == subject)).toList();
      if (entry != null) {
        final data = await bundle.load('$dir/${entry['file']}');
        final json = jsonDecode(_text(data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes))) as Map<String, dynamic>;
        final chapters = [
          for (final c in (json['chapters'] as List?) ?? const [])
            if (c is Map) BankChapter.fromJson(c.cast<String, dynamic>()),
        ];
        if (chapters.isNotEmpty) return SubjectBank(year: year, subject: subject, source: BankSource.school, chapters: chapters, patterns: patterns);
      }
    } catch (_) {
      // No private bank on this board: fall through to the Lessons.
    }
    try {
      // The Lessons' chapter files (assets/lessons/puc/puc2-physics-01-….json.gz); the private
      // folder holds only overlays of the same name, merged into their chapter.
      final prefix = 'puc$year-${subject.replaceAll('_', '-')}-';
      final files = (await listAssets(bundle)).where((a) {
        final name = a.split('/').last;
        return a.startsWith('$lessonsDir/') && name.startsWith(prefix) && (name.endsWith('.json') || name.endsWith('.json.gz'));
      }).toList()..sort();
      final byId = <String, BankChapter>{};
      for (final f in files) {
        try {
          final json = await _json(bundle, f);
          if (json is! Map || json['chapter'] is! Map) continue;
          final ch = (json['chapter'] as Map).cast<String, dynamic>();
          if (ch['year'] != null && ch['year'] != 'puc$year') continue;
          Map<String, dynamic>? overlay;
          try {
            final o = await _json(bundle, '$lessonsPrivateDir/${ch['id']}.json.gz');
            if (o is Map) overlay = o.cast<String, dynamic>();
          } catch (_) {
            // No School parts for this chapter in this build.
          }
          final c = BankChapter.fromLessonFile(json.cast<String, dynamic>(), overlay: overlay);
          if (c.questions.isEmpty) continue;
          final had = byId[c.id];
          byId[c.id] = had == null || had.questions.length < c.questions.length ? c : had;
        } catch (_) {}
      }
      if (byId.isNotEmpty) {
        final chapters = byId.values.toList()..sort((a, b) => a.number.compareTo(b.number));
        return SubjectBank(year: year, subject: subject, source: BankSource.lessons, chapters: chapters);
      }
    } catch (_) {}
    return SubjectBank(year: year, subject: subject, source: BankSource.none);
  }

  static Future<Object?> _json(AssetBundle bundle, String key) async {
    final data = await bundle.load(key);
    return jsonDecode(_text(data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes)));
  }

  static String _text(Uint8List bytes) => utf8.decode(bytes.length > 2 && bytes[0] == 0x1f && bytes[1] == 0x8b ? gzip.decode(bytes) : bytes);
}
