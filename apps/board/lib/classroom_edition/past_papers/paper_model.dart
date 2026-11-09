import '../l10n/ce_strings.dart';
import 'package:flutter/foundation.dart';

import 'exam_rules.dart';

/// One past paper in the library: what it is (exam, year, shift, subjects, language), where it
/// came from ([source]) and its files in app storage (relative to `past_papers/`).
@immutable
class Paper {
  const Paper({
    required this.id,
    required this.exam,
    required this.year,
    this.session = '',
    this.subjects = const [],
    this.language = 'English',
    this.source = '',
    required this.paperFile,
    required this.paperHash,
    this.keyFile,
    this.keyHash,
    this.questionsFile,
    this.questionCount = 0,
    this.pageCount = 0,
    this.packId = '',
    required this.addedAt,
  });

  final String id;
  final Exam exam;
  final int year;

  /// The session or shift ("Shift 1", "27 Jan, Shift 2", "Paper 1"); '' when there was one.
  final String session;
  final List<String> subjects;
  final String language;

  /// Who published it ("NTA", "KEA", "Made up for tests").
  final String source;

  /// Paths under `past_papers/`: the paper, its answer key and its question set.
  final String paperFile;
  final String? keyFile;
  final String? questionsFile;

  /// SHA-256 of the paper's and the key's PDFs (duplicates are skipped by these).
  final String paperHash;
  final String? keyHash;

  final int questionCount;

  /// Pages in the paper's PDF (0 until known).
  final int pageCount;

  /// The paper pack it came from ('' for a PDF added on its own).
  final String packId;
  final DateTime addedAt;

  bool get hasKey => keyFile != null;
  bool get hasQuestions => questionsFile != null && questionCount > 0;

  /// "NEET 2024".
  String get title => '${exam.label} $year';

  /// "Physics, Chemistry, Biology" ('All subjects' when none is named).
  String get subjectLine => subjects.isEmpty ? ceTr('All subjects') : subjects.join(', ');

  /// "NEET 2024 · Shift 1 · Physics".
  String get longTitle => [title, if (session.isNotEmpty) session, if (subjects.isNotEmpty) subjectLine].join(' · ');

  /// The words the library's search looks in.
  String get searchText => [exam.label, '$year', session, ...subjects, language, source].join(' ').toLowerCase();

  Paper copyWith({String? keyFile, String? keyHash, String? questionsFile, int? questionCount, int? pageCount, String? session, List<String>? subjects, int? year, Exam? exam, String? language, String? source}) => Paper(
    id: id,
    exam: exam ?? this.exam,
    year: year ?? this.year,
    session: session ?? this.session,
    subjects: subjects ?? this.subjects,
    language: language ?? this.language,
    source: source ?? this.source,
    paperFile: paperFile,
    paperHash: paperHash,
    keyFile: keyFile ?? this.keyFile,
    keyHash: keyHash ?? this.keyHash,
    questionsFile: questionsFile ?? this.questionsFile,
    questionCount: questionCount ?? this.questionCount,
    pageCount: pageCount ?? this.pageCount,
    packId: packId,
    addedAt: addedAt,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'exam': exam.id,
    'year': year,
    if (session.isNotEmpty) 'session': session,
    'subjects': subjects,
    'language': language,
    if (source.isNotEmpty) 'source': source,
    'paper': paperFile,
    'paperHash': paperHash,
    if (keyFile != null) 'answerKey': keyFile,
    if (keyHash != null) 'keyHash': keyHash,
    if (questionsFile != null) 'questions': questionsFile,
    if (questionCount > 0) 'questionCount': questionCount,
    if (pageCount > 0) 'pages': pageCount,
    if (packId.isNotEmpty) 'pack': packId,
    'added': addedAt.toIso8601String(),
  };

  /// Null when [j] is not a usable entry (unknown exam, no file).
  static Paper? fromJson(Map<String, dynamic> j) {
    final exam = Exam.parse(j['exam']);
    final year = (j['year'] as num?)?.toInt();
    final file = j['paper'];
    if (exam == null || year == null || file is! String || file.isEmpty) return null;
    return Paper(
      id: '${j['id'] ?? j['paperHash']}',
      exam: exam,
      year: year,
      session: '${j['session'] ?? ''}',
      subjects: [for (final s in (j['subjects'] as List?) ?? const []) '$s'],
      language: '${j['language'] ?? 'English'}',
      source: '${j['source'] ?? ''}',
      paperFile: file,
      paperHash: '${j['paperHash'] ?? ''}',
      keyFile: j['answerKey'] as String?,
      keyHash: j['keyHash'] as String?,
      questionsFile: j['questions'] as String?,
      questionCount: (j['questionCount'] as num?)?.toInt() ?? 0,
      pageCount: (j['pages'] as num?)?.toInt() ?? 0,
      packId: '${j['pack'] ?? ''}',
      addedAt: DateTime.tryParse('${j['added']}') ?? DateTime(2000),
    );
  }
}

/// A region of a page of the paper's PDF (0…1 of the page's width and height), for a question
/// whose picture is cut from the paper itself.
@immutable
class PageCrop {
  const PageCrop({required this.page, required this.left, required this.top, required this.width, required this.height});

  /// 1-based page number.
  final int page;
  final double left, top, width, height;

  Map<String, dynamic> toJson() => {
    'page': page,
    'rect': [left, top, width, height],
  };

  static PageCrop? fromJson(Object? v) {
    if (v is! Map) return null;
    final page = (v['page'] as num?)?.toInt();
    final r = v['rect'];
    if (page == null || page < 1 || r is! List || r.length != 4 || r.any((x) => x is! num)) return null;
    final [l, t, w, h] = [for (final x in r) (x as num).toDouble()];
    if (l < 0 || t < 0 || w <= 0 || h <= 0 || l + w > 1.0001 || t + h > 1.0001) return null;
    return PageCrop(page: page, left: l, top: t, width: w, height: h);
  }
}

/// One question of a paper's question set.
@immutable
class PaperQuestion {
  const PaperQuestion({
    required this.number,
    this.section = '',
    this.subject = '',
    this.chapter = '',
    this.stem = '',
    this.image,
    this.crop,
    this.options = const [],
    this.correct = const [],
    this.value,
    this.marks,
    this.negative,
  });

  final int number;
  final String section;
  final String subject;

  /// The chapter or topic it is tagged with ("Electrostatics").
  final String chapter;
  final String stem;

  /// A picture of the question (path under `past_papers/`), or a crop of the paper's page.
  final String? image;
  final PageCrop? crop;
  final List<String> options;

  /// The right options (0 = A). Several for "one or more correct" questions.
  final List<int> correct;

  /// The answer of a numerical question (no options): "12.5".
  final String? value;

  /// Marks for this question when it differs from the exam's ([ExamRule]).
  final double? marks;
  final double? negative;

  bool get hasOptions => options.isNotEmpty;
  bool get multiCorrect => correct.length > 1;
  bool get hasPicture => image != null || crop != null;

  /// "B", "A, C", or the numerical answer.
  String get answerLabel => hasOptions ? [for (final i in correct) letter(i)].join(', ') : (value ?? '');

  /// "B. 2 N".
  String get answerText => hasOptions ? [for (final i in correct) '${letter(i)}. ${i < options.length ? options[i] : ''}'].join('   ') : (value ?? '');

  /// Right marks and the marks taken for a wrong answer under [exam] (this question's own when given).
  (double, double) marking(Exam exam) => (marks ?? exam.rule.right, negative ?? exam.rule.wrong);

  /// The score for an answer: right, wrong, or skipped (null).
  double score(Exam exam, bool? right) {
    final (r, w) = marking(exam);
    return switch (right) {
      true => r,
      false => -w,
      null => 0,
    };
  }

  /// Whether [chosen] options are the right answer (every right one and nothing else).
  bool isRight(Set<int> chosen) => hasOptions && chosen.isNotEmpty && chosen.length == correct.length && chosen.containsAll(correct);

  static String letter(int i) => String.fromCharCode(65 + i);

  Map<String, dynamic> toJson() => {
    'n': number,
    if (section.isNotEmpty) 'section': section,
    if (subject.isNotEmpty) 'subject': subject,
    if (chapter.isNotEmpty) 'chapter': chapter,
    if (stem.isNotEmpty) 'stem': stem,
    'image': ?image,
    if (crop != null) 'crop': crop!.toJson(),
    if (options.isNotEmpty) 'options': options,
    'answer': options.isNotEmpty ? (correct.length == 1 ? letter(correct.single) : [for (final c in correct) letter(c)]) : value,
    'marks': ?marks,
    'negative': ?negative,
  };

  /// Throws [FormatException] with a plain reason when [j] is not a usable question.
  static PaperQuestion fromJson(Map<String, dynamic> j, {String Function(String path)? imagePath}) {
    final n = (j['n'] as num?)?.toInt();
    if (n == null) throw const FormatException('a question has no number ("n")');
    final options = [for (final o in (j['options'] as List?) ?? const []) '$o'];
    final stem = '${j['stem'] ?? ''}'.trim();
    final img = j['image'] is String && (j['image'] as String).isNotEmpty ? j['image'] as String : null;
    final crop = PageCrop.fromJson(j['crop']);
    if (j['crop'] != null && crop == null) throw FormatException('question $n: its "crop" is not a page and a rectangle inside it');
    if (stem.isEmpty && img == null && crop == null) throw FormatException('question $n has no text and no picture');
    final a = j['answer'];
    var correct = <int>[];
    String? value;
    int? idx(Object? x) {
      if (x is String && x.length == 1) {
        final i = x.toUpperCase().codeUnitAt(0) - 65;
        return i >= 0 && i < options.length ? i : null;
      }
      return null;
    }

    if (options.isNotEmpty) {
      final list = a is List ? a : [a];
      for (final x in list) {
        final i = idx(x);
        if (i == null) throw FormatException('question $n: the answer "$x" is not one of its options');
        if (!correct.contains(i)) correct.add(i);
      }
      if (correct.isEmpty) throw FormatException('question $n has no answer');
      correct.sort();
    } else {
      if (a == null || '$a'.trim().isEmpty) throw FormatException('question $n has no options and no answer');
      value = '$a'.trim();
    }
    return PaperQuestion(
      number: n,
      section: '${j['section'] ?? ''}',
      subject: '${j['subject'] ?? ''}',
      chapter: '${j['chapter'] ?? ''}'.trim(),
      stem: stem,
      image: img == null ? null : (imagePath?.call(img) ?? img),
      crop: crop,
      options: options,
      correct: correct,
      value: value,
      marks: (j['marks'] as num?)?.toDouble(),
      negative: (j['negative'] as num?)?.abs().toDouble(),
    );
  }
}

/// A paper's question set (`questions.json`).
@immutable
class QuestionSet {
  const QuestionSet(this.questions);

  static const version = 1;

  final List<PaperQuestion> questions;

  /// The chapter tags, in the order they first appear.
  List<String> get chapters => {for (final q in questions) if (q.chapter.isNotEmpty) q.chapter}.toList();

  Map<String, dynamic> toJson() => {
    'version': version,
    'questions': [for (final q in questions) q.toJson()],
  };

  /// Throws [FormatException] (plain words) when [j] is not a question set this board reads.
  static QuestionSet fromJson(Object? j, {String Function(String path)? imagePath}) {
    final list = j is Map ? j['questions'] : j;
    if (j is Map && (j['version'] as num? ?? 1) > version) throw const FormatException('the question set is from a newer Zynetix Board; update the board');
    if (list is! List) throw const FormatException('the question set has no "questions" list');
    final out = <PaperQuestion>[];
    for (final q in list) {
      if (q is! Map) throw const FormatException('a question is not an object');
      out.add(PaperQuestion.fromJson(q.cast<String, dynamic>(), imagePath: imagePath));
    }
    return QuestionSet(out);
  }
}

/// What the library's filters and search pick.
@immutable
class PaperFilter {
  const PaperFilter({this.exam, this.year, this.subject, this.search = ''});

  final Exam? exam;
  final int? year;
  final String? subject;
  final String search;

  bool matches(Paper p) {
    if (exam != null && p.exam != exam) return false;
    if (year != null && p.year != year) return false;
    if (subject != null && p.subjects.isNotEmpty && !p.subjects.any((s) => s.toLowerCase() == subject!.toLowerCase())) return false;
    final words = search.toLowerCase().split(RegExp(r'\s+')).where((w) => w.isNotEmpty);
    final text = p.searchText;
    return words.every(text.contains);
  }
}

/// [papers] that [f] picks: newest year first, then exam, then shift.
List<Paper> filterPapers(List<Paper> papers, PaperFilter f) {
  final out = papers.where(f.matches).toList()
    ..sort((a, b) {
      final y = b.year.compareTo(a.year);
      if (y != 0) return y;
      final e = a.exam.index.compareTo(b.exam.index);
      if (e != 0) return e;
      return a.session.compareTo(b.session);
    });
  return out;
}

/// The chips the filters offer: the exams in the library, the years of the chosen exam, the
/// subjects of the chosen exam and year.
({List<Exam> exams, List<int> years, List<String> subjects}) filterChoices(List<Paper> papers, PaperFilter f) {
  final exams = {for (final p in papers) p.exam}.toList()..sort((a, b) => a.index.compareTo(b.index));
  final ofExam = [for (final p in papers) if (f.exam == null || p.exam == f.exam) p];
  final years = {for (final p in ofExam) p.year}.toList()..sort((a, b) => b.compareTo(a));
  final ofYear = [for (final p in ofExam) if (f.year == null || p.year == f.year) p];
  final subjects = {for (final p in ofYear) ...p.subjects}.toList()..sort();
  return (exams: exams, years: years, subjects: subjects);
}
