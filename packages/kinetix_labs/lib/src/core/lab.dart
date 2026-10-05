import 'i18n.dart';

/// Where a lab is taught: kindergarten, a school class, or a degree.
enum LabLevel {
  lkg('lkg'),
  ukg('ukg'),
  class1('1'),
  class2('2'),
  class3('3'),
  class4('4'),
  class5('5'),
  class6('6'),
  class7('7'),
  class8('8'),
  class9('9'),
  class10('10'),
  class11('11'),
  class12('12'),
  ug('ug'),
  pg('pg');

  const LabLevel(this.code);

  /// How the content writes it: 'lkg', 'ukg', '1'…'12', 'ug', 'pg'.
  final String code;

  static LabLevel? fromCode(Object? code) => values.where((l) => l.code == '$code').firstOrNull;

  /// The school class (1–12), or null for kindergarten and degrees.
  int? get schoolClass => int.tryParse(code);

  bool get isDegree => this == ug || this == pg;

  /// Short name for chips and tags.
  String get label => switch (this) {
        lkg => 'LKG',
        ukg => 'UKG',
        ug => 'UG',
        pg => 'PG',
        _ => tr('Class {n}', {'n': code}),
      };
}

/// The field a lab belongs to (what the catalogue filters by).
enum LabDomain {
  physics,
  chemistry,
  biology,
  electronics,
  forensics,
  maths;

  static LabDomain? fromName(Object? name) => values.where((d) => d.name == '$name').firstOrNull;

  String get label => switch (this) {
        physics => tr('Physics'),
        chemistry => tr('Chemistry'),
        biology => tr('Biology'),
        electronics => tr('Electronics'),
        forensics => tr('Forensics'),
        maths => tr('Mathematics'),
      };
}

/// How a lab is meant to be used.
enum LabMode {
  /// Free play: change things and watch.
  explore,

  /// A practical done step by step, with readings and a result.
  guided,

  /// The student works it out: the result and conclusion stay hidden until
  /// they finish.
  assessment;

  static LabMode fromName(Object? name) => values.where((m) => m.name == '$name').firstOrNull ?? guided;
}

/// A question the teacher can ask at the end, with its answer.
class LabQuestion {
  final Words q;
  final Words a;
  const LabQuestion(this.q, this.a);
}

/// One virtual lab: what the teacher reads out (in the three interface
/// languages) and which bench runs the experiment (lib/src/benches/).
class VirtualLab {
  final String id;
  final String bench;

  /// Starting settings for the bench, on top of its defaults (so one bench
  /// can run several experiments).
  final Map<String, dynamic> setup;

  /// Display subject: 'Physics', 'Chemistry', 'Biology', 'Mathematics',
  /// 'Electronics', 'Forensics'.
  final String subject;
  final LabDomain domain;
  final List<LabLevel> levels;
  final LabMode mode;

  /// Syllabi that list this practical, e.g. 'cbse', 'ka-puc', 'ncert'.
  final List<String> curricula;

  /// Whether a subject teacher has checked the text.
  final bool reviewed;
  final List<String> keywords;
  final Words title;
  final Words summary;
  final Words aim;
  final Words principle;
  final List<Words> apparatus;
  final List<Words> steps;
  final List<Words> precautions;
  final Words conclusion;
  final List<LabQuestion> viva;

  const VirtualLab({
    required this.id,
    required this.bench,
    required this.subject,
    required this.domain,
    required this.title,
    required this.summary,
    required this.aim,
    required this.principle,
    required this.conclusion,
    this.setup = const {},
    this.levels = const [],
    this.mode = LabMode.guided,
    this.curricula = const [],
    this.reviewed = false,
    this.keywords = const [],
    this.apparatus = const [],
    this.steps = const [],
    this.precautions = const [],
    this.viva = const [],
  });

  static List<Words> _words(Object? v) => [for (final w in (v as List? ?? const [])) Words.from(w)];

  factory VirtualLab.fromJson(Map<String, dynamic> j) {
    // The prototype's content had `classes` (6–10) and no levels.
    final levels = [
      for (final c in (j['levels'] as List? ?? j['classes'] as List? ?? const [])) ?LabLevel.fromCode(c),
    ];
    final subject = '${j['subject'] ?? 'Physics'}';
    return VirtualLab(
      id: j['id'],
      bench: j['bench'],
      setup: (j['setup'] as Map?)?.cast<String, dynamic>() ?? const {},
      subject: subject,
      domain: LabDomain.fromName(j['domain']) ?? (subject == 'Mathematics' ? LabDomain.maths : LabDomain.fromName(subject.toLowerCase()) ?? LabDomain.physics),
      levels: levels,
      mode: LabMode.fromName(j['mode']),
      curricula: [for (final c in (j['curricula'] as List? ?? const [])) '$c'],
      reviewed: j['reviewed'] == true,
      keywords: [for (final k in (j['keywords'] as List? ?? const [])) '$k'],
      title: Words.from(j['title']),
      summary: Words.from(j['summary']),
      aim: Words.from(j['aim']),
      principle: Words.from(j['principle']),
      apparatus: _words(j['apparatus']),
      steps: _words(j['steps']),
      precautions: _words(j['precautions']),
      conclusion: Words.from(j['conclusion']),
      viva: [for (final v in (j['viva'] as List? ?? const [])) LabQuestion(Words.from(v['q']), Words.from(v['a']))],
    );
  }

  /// School classes this lab is for (the prototype's `classes`).
  List<int> get classes => [for (final l in levels) ?l.schoolClass];

  bool get forDegree => levels.any((l) => l.isDegree);

  /// How well [text] (a chapter title, a topic, a question) matches this
  /// lab: 0 means not at all. Whole words only.
  int matches(String text) {
    final t = ' ${_plain(text)} ';
    var score = 0;
    for (final k in [title.of(LabLang.en), ...keywords]) {
      // Keywords are cleaned the same way, so "metals and non-metals"
      // matches "Metals and Non-metals".
      final w = _plain(k);
      if (w.isEmpty) continue;
      if (t.contains(' $w ') || t.contains(' ${w}s ')) score += w.contains(' ') ? 3 : 2;
    }
    return score;
  }

  static String _plain(String s) => s.toLowerCase().replaceAll('’', "'").replaceAll(RegExp(r"[^a-z0-9'ऀ-෿]+"), ' ').trim();
}
