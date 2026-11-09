import 'dart:math';

import 'bank.dart';

/// What a question on a paper is: multiple choice, a short written answer (2 marks), a
/// longer written answer (3 or 5 marks) or a problem to solve.
enum ItemKind { mcq, short, long, problem }

/// [count] questions of [kind], [marks] each, of which the students answer [attempt] (null:
/// all of them; "Answer any FIVE of the following" is `PaperSlot(…, 7, 2, attempt: 5)`).
/// [size] is the bank's size of question to draw on (2, 3 or 5 marks).
class PaperSlot {
  const PaperSlot(this.kind, this.count, this.marks, {this.attempt, this.fixedSize});
  final ItemKind kind;
  final int count;
  final num marks;
  final int? attempt;

  /// The bank size to draw on when it is not the one [marks] implies (Mathematics' 6-mark
  /// questions are 5-mark problems).
  final int? fixedSize;

  /// How many are answered.
  int get answered => attempt == null ? count : attempt!.clamp(0, count);
  num get total => answered * marks;
  int get size => fixedSize ?? (marks <= 2 ? 2 : (marks <= 4 ? 3 : 5));

  /// The same slot with [n] questions offered, keeping the same number of spare ones.
  PaperSlot withCount(int n) {
    final spare = count - answered;
    return PaperSlot(kind, n, marks, attempt: attempt == null ? null : (n > spare ? n - spare : n), fixedSize: fixedSize);
  }
}

/// A part of the paper ("Part B — Two-mark questions").
class PaperPart {
  const PaperPart(this.label, this.title, this.slots);
  final String label;
  final String title;
  final List<PaperSlot> slots;

  num get total => slots.fold<num>(0, (a, s) => a + s.total);
  int get count => slots.fold(0, (a, s) => a + s.count);

  /// "5 questions, 1 mark each", "Any 5 of 7, 2 marks each", "Any 3 of 4, 5 marks each + any 2 of 3 problems, 5 marks each".
  String get summary => [
    for (final (i, s) in slots.indexed)
      () {
        final what = s.kind == ItemKind.problem ? (s.count == 1 ? 'problem' : 'problems') : (s.count == 1 ? 'question' : 'questions');
        final marks = '${fmtMarks(s.marks)} mark${s.marks == 1 ? '' : 's'}${s.count == 1 ? '' : ' each'}';
        final head = s.answered < s.count ? '${i == 0 ? 'Any' : 'any'} ${s.answered} of ${s.count} $what' : '${s.count} $what';
        return '$head, $marks';
      }(),
  ].join(' + ');

  PaperPart withSlots(List<PaperSlot> s) => PaperPart(label, title, s);
}

/// A paper's pattern: parts, time and, for an entrance paper, the negative marking.
class PaperPattern {
  const PaperPattern({required this.id, required this.name, required this.minutes, required this.parts, this.note = ''});
  final String id;
  final String name;
  final int minutes;
  final List<PaperPart> parts;

  /// A line under the header ("+4 for right, −1 for wrong").
  final String note;

  num get maxMarks => parts.fold<num>(0, (a, p) => a + p.total);
  int get questions => parts.fold(0, (a, p) => a + p.count);
}

String fmtMarks(num m) => m == m.roundToDouble() ? '${m.round()}' : '$m';

/// "45 minutes", "3 hours 15 minutes".
String fmtMinutes(int m) {
  if (m < 60) return '$m minutes';
  final h = m ~/ 60, r = m % 60;
  return '$h hour${h == 1 ? '' : 's'}${r == 0 ? '' : ' $r minutes'}';
}

const _a = 'Multiple choice';
const _b = 'Two-mark questions';
const _c = 'Three-mark questions';
const _d = 'Five-mark questions';

// Shorthands for the patterns below.
const _mcq = ItemKind.mcq, _sh = ItemKind.short, _lg = ItemKind.long, _pr = ItemKind.problem;

/// The PUC board pattern at three sizes, with the board's internal choice ("Answer any FIVE of
/// the following"): Part A one-mark multiple choice, B two-mark, C three-mark and D five-mark
/// questions and problems. The annual paper is subject by subject ([pucPatternsFor]); these
/// are the shapes for any subject.
const pucPatterns = [
  PaperPattern(
    id: 'puc-chapter',
    name: 'Chapter test',
    minutes: 45,
    parts: [
      PaperPart('A', _a, [PaperSlot(_mcq, 5, 1)]),
      PaperPart('B', _b, [PaperSlot(_sh, 4, 2, attempt: 3)]),
      PaperPart('C', _c, [PaperSlot(_lg, 4, 3, attempt: 3)]),
      PaperPart('D', _d, [PaperSlot(_lg, 2, 5, attempt: 1)]),
    ],
  ),
  PaperPattern(
    id: 'puc-unit',
    name: 'Unit test',
    minutes: 90,
    parts: [
      PaperPart('A', _a, [PaperSlot(_mcq, 10, 1)]),
      PaperPart('B', _b, [PaperSlot(_sh, 5, 2, attempt: 3)]),
      PaperPart('C', _c, [PaperSlot(_lg, 4, 3, attempt: 3)]),
      PaperPart('D', _d, [PaperSlot(_lg, 2, 5, attempt: 1), PaperSlot(_pr, 2, 5, attempt: 1)]),
    ],
  ),
  PaperPattern(
    id: 'puc-annual',
    name: 'Annual pattern',
    minutes: 195,
    parts: [
      PaperPart('A', _a, [PaperSlot(_mcq, 20, 1)]),
      PaperPart('B', _b, [PaperSlot(_sh, 7, 2, attempt: 5)]),
      PaperPart('C', _c, [PaperSlot(_lg, 7, 3, attempt: 5)]),
      PaperPart('D', _d, [PaperSlot(_lg, 4, 5, attempt: 3), PaperSlot(_pr, 3, 5, attempt: 2)]),
    ],
  ),
  PaperPattern(
    id: 'mcq-20',
    name: 'Multiple choice',
    minutes: 30,
    parts: [
      PaperPart('A', 'Choose the right answer', [PaperSlot(_mcq, 20, 1)]),
    ],
  ),
];

/// The annual paper of the Karnataka PU board for [subject] (the bank's slug), in the shape of
/// its model papers: 70 marks (Mathematics 80), Part A 20 one-mark questions, then two-, three-
/// and five-mark parts with internal choice, and Part E where the subject has one (Chemistry's
/// numerical problems, Mathematics' 6- and 4-mark questions with an either/or, Biology's
/// application questions).
PaperPattern annualPatternFor(String subject) => switch (subject) {
  'physics' => pucPatterns[2],
  'chemistry' => const PaperPattern(
    id: 'puc-annual',
    name: 'Annual pattern',
    minutes: 195,
    parts: [
      PaperPart('A', _a, [PaperSlot(_mcq, 20, 1)]),
      PaperPart('B', _b, [PaperSlot(_sh, 5, 2, attempt: 3)]),
      PaperPart('C', _c, [PaperSlot(_lg, 5, 3, attempt: 3)]),
      PaperPart('D', _d, [PaperSlot(_lg, 6, 5, attempt: 4)]),
      PaperPart('E', 'Numerical problems', [PaperSlot(_pr, 7, 3, attempt: 5)]),
    ],
  ),
  'maths' => const PaperPattern(
    id: 'puc-annual',
    name: 'Annual pattern',
    minutes: 195,
    parts: [
      PaperPart('A', _a, [PaperSlot(_mcq, 20, 1)]),
      PaperPart('B', _b, [PaperSlot(_sh, 8, 2, attempt: 6)]),
      PaperPart('C', _c, [PaperSlot(_lg, 8, 3, attempt: 6)]),
      PaperPart('D', _d, [PaperSlot(_lg, 6, 5, attempt: 4)]),
      PaperPart('E', 'Long answers', [PaperSlot(_pr, 2, 6, attempt: 1, fixedSize: 5), PaperSlot(_pr, 2, 4, attempt: 1, fixedSize: 3)]),
    ],
  ),
  'biology' => const PaperPattern(
    id: 'puc-annual',
    name: 'Annual pattern',
    minutes: 195,
    parts: [
      PaperPart('A', _a, [PaperSlot(_mcq, 20, 1)]),
      PaperPart('B', _b, [PaperSlot(_sh, 8, 2, attempt: 5)]),
      PaperPart('C', _c, [PaperSlot(_lg, 8, 3, attempt: 5)]),
      PaperPart('D', _d, [PaperSlot(_lg, 6, 5, attempt: 4)]),
      PaperPart('E', 'Application questions', [PaperSlot(_pr, 2, 5, attempt: 1)]),
    ],
  ),
  _ => pucPatterns[2],
};

/// The PUC patterns offered for [subject]: chapter test, unit test, its annual paper, multiple choice.
List<PaperPattern> pucPatternsFor(String subject) => [pucPatterns[0], pucPatterns[1], annualPatternFor(subject), pucPatterns[3]];

/// An entrance paper's section for one subject as a multiple-choice pattern.
PaperPattern entranceAsPattern(EntrancePattern e, String subject) {
  final s = e.sections.firstWhere((s) => s.$1 == subject);
  final perSubject = e.sections.isEmpty ? e.minutes : (e.minutes * s.$2 / e.sections.fold<int>(0, (a, x) => a + x.$2)).round();
  return PaperPattern(
    id: 'entrance-${e.id}',
    name: e.title,
    minutes: perSubject,
    note: s.$4 == 0 ? '${fmtMarks(s.$3)} mark${s.$3 == 1 ? '' : 's'} for each right answer, no negative marking.' : '+${fmtMarks(s.$3)} for a right answer, −${fmtMarks(s.$4)} for a wrong one.',
    parts: [
      PaperPart('A', 'Choose the right answer', [PaperSlot(ItemKind.mcq, s.$2, s.$3)]),
    ],
  );
}

/// A worksheet's pattern: [mcq] multiple choice, [short] short answers and [problems].
PaperPattern worksheetPattern({int mcq = 6, int short = 2, int problems = 2}) => PaperPattern(
  id: 'worksheet',
  name: 'Worksheet',
  minutes: 0,
  parts: [
    if (mcq > 0) PaperPart('A', 'Choose the right answer', [PaperSlot(ItemKind.mcq, mcq, 1)]),
    if (short > 0) PaperPart('B', 'Answer briefly', [PaperSlot(ItemKind.short, short, 2)]),
    if (problems > 0) PaperPart('C', 'Solve', [PaperSlot(ItemKind.problem, problems, 3)]),
  ],
);

const _numberWords = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];

/// Why [text] cannot go on a paper as a written question (Parts B–E), or null when it reads as
/// one: a flash-card stem ("Flux Φ = ?"), a question mark followed by more text, option letters,
/// "Explain: …" glue, a multiple-choice stem, a figure that is not printed, a lower-case start.
/// The bank builder (tool/build_class_bank.py, exam_prompt_problem) applies the same rules.
String? examPromptProblem(String text) {
  final t = text.trim();
  if (RegExp(r'(=|:|→|⇒|->)\s*\?').hasMatch(t)) return 'flash-card stem';
  if (RegExp(r"[A-Za-z][A-Za-z'’-]+").allMatches(t).length < 3) return 'too short';
  if (t.length > 1 && t.substring(0, t.length - 1).contains('?') && !RegExp(r'\?\s+[A-Z(]').hasMatch(t)) return 'question mark inside';
  if (RegExp(r'(^|\s)\(?A[.)]\s.*\s\(?B[.)]\s').hasMatch(t)) return 'option letters';
  if (RegExp(r'^(explain|describe|discuss|answer|define|state)\s*:', caseSensitive: false).hasMatch(t)) return 'template glue';
  if (RegExp(r'\b(one or more options|which of the following|choose the correct|pick the|true or false)\b', caseSensitive: false).hasMatch(t)) return 'multiple-choice stem';
  if (RegExp(r'\b(shown|figure|fig\.|below|above|the circuit|this code|the code|following code|the given (?:table|graph|data)|in the quiz|the quiz|the lesson|this lesson)\b', caseSensitive: false).hasMatch(t)) {
    return 'refers to a missing figure';
  }
  final c = t.codeUnitAt(0);
  if (!(t[0].toUpperCase() == t[0] && t[0].toLowerCase() != t[0]) && !(c >= 48 && c <= 57)) return 'lower-case start';
  return null;
}

/// A question's text for comparing (two prompts that differ only in spacing or punctuation are
/// the same question).
String normQuestion(String s) => s.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), ' ').trim();

/// One question on a paper, with what goes in the answer key.
class PaperItem {
  const PaperItem({required this.kind, required this.text, this.options = const [], required this.marks, this.answer = '', this.steps = const [], this.chapterId = '', this.topic = '', this.id = ''});
  final ItemKind kind;
  final String id;
  final String text;
  final List<String> options;
  final num marks;
  final String answer;
  final List<String> steps;
  final String chapterId;
  final String topic;
}

/// One instruction's questions within a part: "Answer any FIVE of the following questions."
class PaperGroup {
  const PaperGroup(this.slot, this.items, {required this.attempt});
  final PaperSlot slot;
  final List<PaperItem> items;

  /// How many of [items] are answered.
  final int attempt;

  bool get choice => attempt < items.length;
  num get marks => slot.marks;
  num get total => attempt * marks;

  /// "Answer any FIVE of the following questions.", "Answer all the questions.".
  String get instruction {
    final what = slot.kind == ItemKind.problem ? 'problems' : 'questions';
    if (slot.kind == ItemKind.mcq) return items.length == 1 ? 'Choose the correct answer.' : 'Choose the correct answer for each question.';
    if (!choice) return items.length == 1 ? 'Answer the following ${what == 'problems' ? 'problem' : 'question'}.' : 'Answer all the following $what.';
    final n = attempt < _numberWords.length ? _numberWords[attempt] : '$attempt';
    return 'Answer any $n of the following $what.';
  }

  /// "(5 × 2 = 10)".
  String get marksLine => '($attempt × ${fmtMarks(marks)} = ${fmtMarks(total)})';
}

/// A part of the paper as printed: its instructions and questions.
class PaperSection {
  const PaperSection(this.part, this.groups);
  final PaperPart part;
  final List<PaperGroup> groups;

  List<PaperItem> get items => [for (final g in groups) ...g.items];
  num get total => groups.fold<num>(0, (a, g) => a + g.total);

  /// "(1 × 5 = 5)", "(15 + 10 = 25)".
  String get marksLine {
    if (groups.isEmpty) return '';
    if (groups.length == 1) return groups.single.marksLine;
    return '(${groups.map((g) => fmtMarks(g.total)).join(' + ')} = ${fmtMarks(total)})';
  }

  /// "Part B — Two-mark questions".
  String get heading => 'Part ${part.label} — ${part.title}';
}

/// A paper ready to print: the header, its parts and the answer key.
class Paper {
  const Paper({
    required this.title,
    required this.college,
    required this.className,
    required this.subject,
    required this.chapters,
    required this.minutes,
    required this.sections,
    this.note = '',
    this.set = '',
  });

  /// "Mock test 2", "Worksheet".
  final String title;
  final String college, className, subject;

  /// Chapter titles, in order.
  final List<String> chapters;
  final int minutes;
  final List<PaperSection> sections;
  final String note;

  /// "A" or "B" when each bench gets its own order.
  final String set;

  num get maxMarks => sections.fold<num>(0, (a, s) => a + s.total);
  List<PaperItem> get items => [for (final s in sections) ...s.items];
  bool get isEmpty => items.isEmpty;

  /// "chapterId|t3" for every topic asked about.
  Set<String> get topicKeys => {for (final i in items) '${i.chapterId}|${i.topic}'};

  Paper copyWith({List<PaperSection>? sections, String? set, String? title}) => Paper(
    title: title ?? this.title,
    college: college,
    className: className,
    subject: subject,
    chapters: chapters,
    minutes: minutes,
    sections: sections ?? this.sections,
    note: note,
    set: set ?? this.set,
  );

  String get fileName => '${[className, subject, title, if (set.isNotEmpty) 'Set $set'].where((s) => s.isNotEmpty).join(' ')}.pdf'.replaceAll(RegExp(r'[^\w .-]+'), '').replaceAll(' ', '-');
}

/// Makes a paper of [pattern] from [chapters] (questions spread over the chapters and their
/// topics, chosen with [seed]). Each part takes questions of its own size only: 2-mark written
/// questions for Part B, 3-mark for Part C, 5-mark for Part D, problems sized for their marks
/// (Mathematics also takes problems in Parts B–D, as its papers do); every written question
/// must pass [examPromptProblem] and none is asked twice. A part that the chapters cannot fill
/// offers fewer questions with the same choice, and is left out when there are none: the
/// paper is shorter, never padded.
Paper buildPaper({
  required List<BankChapter> chapters,
  required PaperPattern pattern,
  required String title,
  int seed = 0,
  String college = '',
  String className = '',
  String subject = '',
  Set<String> topics = const {},
}) {
  final r = Random(seed);
  List<T> pool<T>(Iterable<T> Function(BankChapter c) f, String Function(T) topicOf) {
    final all = [for (final c in chapters) ...f(c)];
    final scoped = topics.isEmpty ? all : all.where((x) => topics.contains(topicOf(x))).toList();
    return (scoped.isEmpty ? all : scoped)..shuffle(r);
  }

  final mcqs = pool((c) => c.questions, (q) => q.topic);
  // PUC-tagged and easier questions first for Part A.
  mcqs.sort((a, b) => (a.puc ? 0 : 1).compareTo(b.puc ? 0 : 1));
  // A written question that is also a multiple-choice stem would be asked twice (or with its
  // options missing): Part A keeps it.
  final stems = {for (final c in chapters) for (final q in c.questions) normQuestion(q.stem)};
  bool fit(String text) => examPromptProblem(text) == null && !stems.contains(normQuestion(text));
  final written = {
    for (final m in const [2, 3, 5])
      m: pool((c) => [...c.shorts, ...c.mediums, ...c.longs].where((q) => q.marks == m && fit(q.question)), (q) => q.topic),
  };
  final problems = {
    for (final m in const [2, 3, 5]) m: pool((c) => c.problems.where((q) => q.size == m && fit(q.question)), (q) => q.topic),
  };
  final maths = chapters.any((c) => c.id.contains('-maths-')) || ClassBank.slug(subject) == 'maths';
  final used = <String>{};

  PaperItem? fromWritten(int size, num marks) {
    final q = _spread(written[size]!, used, (q) => normQuestion(q.question), (q) => '${q.chapterId}|${q.topic}');
    return q == null
        ? null
        : PaperItem(kind: size == 2 ? ItemKind.short : ItemKind.long, id: q.question, text: q.question, marks: marks, answer: q.answer, chapterId: q.chapterId, topic: q.topic);
  }

  PaperItem? fromProblems(int size, num marks) {
    final q = _spread(problems[size]!, used, (q) => normQuestion(q.question), (q) => '${q.chapterId}|${q.topic}');
    return q == null
        ? null
        : PaperItem(kind: ItemKind.problem, id: q.question, text: q.question, marks: marks, answer: q.answer, steps: q.steps, chapterId: q.chapterId, topic: q.topic);
  }

  PaperItem? take(PaperSlot slot) {
    if (slot.kind == ItemKind.mcq) {
      final q = _spread(mcqs, used, (q) => q.id, (q) => '${q.chapterId}|${q.topic}');
      return q == null
          ? null
          : PaperItem(
              kind: ItemKind.mcq,
              id: q.id,
              text: q.stem,
              options: q.options,
              marks: slot.marks,
              answer: q.answerText,
              steps: [if (q.explanation.isNotEmpty) q.explanation],
              chapterId: q.chapterId,
              topic: q.topic,
            );
    }
    final size = slot.size;
    if (slot.kind == ItemKind.problem) return fromProblems(size, slot.marks);
    // Written parts: Mathematics alternates its theory and problems; other subjects ask the
    // theory first and fall back to a problem of the same size.
    if (maths && r.nextBool()) return fromProblems(size, slot.marks) ?? fromWritten(size, slot.marks);
    return fromWritten(size, slot.marks) ?? fromProblems(size, slot.marks);
  }

  final sections = <PaperSection>[];
  for (final part in pattern.parts) {
    final groups = <PaperGroup>[];
    for (final slot in part.slots) {
      final items = <PaperItem>[];
      for (var i = 0; i < slot.count; i++) {
        final item = take(slot);
        if (item != null) items.add(item);
      }
      if (items.isEmpty) continue;
      // Fewer questions than the slot asks for: keep the same number spare ("any 3 of 5" with
      // four found is "any 2 of 4"); with no room for a choice, all of them.
      final spare = slot.count - slot.answered;
      final attempt = items.length == slot.count ? slot.answered : (items.length > spare ? items.length - spare : items.length);
      groups.add(PaperGroup(slot, items, attempt: attempt));
    }
    if (groups.isNotEmpty) sections.add(PaperSection(part, groups));
  }
  return Paper(title: title, college: college, className: className, subject: subject, chapters: [for (final c in chapters) c.title], minutes: pattern.minutes, sections: sections, note: pattern.note);
}

/// The next unused item, preferring a topic not asked yet in this paper.
T? _spread<T>(List<T> pool, Set<String> used, String Function(T) id, String Function(T) topic) {
  final askedTopics = <String>{};
  for (final x in pool) {
    if (used.contains(id(x))) askedTopics.add(topic(x));
  }
  T? fallback;
  for (final x in pool) {
    if (used.contains(id(x))) continue;
    if (!askedTopics.contains(topic(x))) {
      used.add(id(x));
      return x;
    }
    fallback ??= x;
  }
  if (fallback != null) used.add(id(fallback));
  return fallback;
}

/// The same paper with each part's questions (and each question's options) in another order:
/// set B for the next bench. The key follows the new order.
Paper shuffledPaper(Paper p, {required int seed, String set = 'B'}) {
  final r = Random(seed);
  return p.copyWith(
    set: set,
    sections: [
      for (final s in p.sections)
        PaperSection(s.part, [
          for (final g in s.groups)
            PaperGroup(g.slot, [
              for (final i in [...g.items]..shuffle(r))
                if (i.kind == ItemKind.mcq && i.options.length > 1) _shuffleOptions(i, r) else i,
            ], attempt: g.attempt),
        ]),
    ],
  );
}

PaperItem _shuffleOptions(PaperItem i, Random r) {
  final letter = i.answer.isNotEmpty ? i.answer.codeUnitAt(0) - 65 : -1;
  final order = [for (var k = 0; k < i.options.length; k++) k]..shuffle(r);
  final at = order.indexOf(letter);
  return PaperItem(
    kind: i.kind,
    id: i.id,
    text: i.text,
    options: [for (final k in order) i.options[k]],
    marks: i.marks,
    answer: at < 0 ? i.answer : '${String.fromCharCode(65 + at)}. ${i.options[letter]}',
    steps: i.steps,
    chapterId: i.chapterId,
    topic: i.topic,
  );
}
