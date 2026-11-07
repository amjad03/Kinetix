import 'dart:math';

import 'bank.dart';

/// What a question on a paper is: multiple choice, a short written answer (2 marks), a
/// longer written answer (3 or 5 marks) or a problem to solve.
enum ItemKind { mcq, short, long, problem }

/// [count] questions of [kind], [marks] each.
class PaperSlot {
  const PaperSlot(this.kind, this.count, this.marks);
  final ItemKind kind;
  final int count;
  final num marks;
  num get total => count * marks;
}

/// A part of the paper ("Part B — Answer briefly").
class PaperPart {
  const PaperPart(this.label, this.title, this.slots);
  final String label;
  final String title;
  final List<PaperSlot> slots;

  num get total => slots.fold<num>(0, (a, s) => a + s.total);
  int get count => slots.fold(0, (a, s) => a + s.count);

  /// "5 questions, 1 mark each", "1 question, 5 marks + 1 problem, 3 marks".
  String get summary => slots
      .map((s) {
        final what = s.kind == ItemKind.problem ? (s.count == 1 ? 'problem' : 'problems') : (s.count == 1 ? 'question' : 'questions');
        final marks = s.count == 1 ? '${fmtMarks(s.marks)} mark${s.marks == 1 ? '' : 's'}' : '${fmtMarks(s.marks)} mark${s.marks == 1 ? '' : 's'} each';
        return '${s.count} $what, $marks';
      })
      .join(' + ');

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

const _a = 'Answer in one word or one sentence';
const _b = 'Answer briefly';
const _c = 'Answer in a short paragraph';
const _d = 'Answer in detail';

/// The PUC board pattern, at three sizes (Karnataka PU: Part A one-mark, B two-mark, C
/// three-mark, D five-mark questions and problems).
const pucPatterns = [
  PaperPattern(
    id: 'puc-chapter',
    name: 'Chapter test',
    minutes: 45,
    parts: [
      PaperPart('A', _a, [PaperSlot(ItemKind.mcq, 5, 1)]),
      PaperPart('B', _b, [PaperSlot(ItemKind.short, 3, 2)]),
      PaperPart('C', _c, [PaperSlot(ItemKind.long, 2, 3)]),
      PaperPart('D', _d, [PaperSlot(ItemKind.long, 1, 5), PaperSlot(ItemKind.problem, 1, 3)]),
    ],
  ),
  PaperPattern(
    id: 'puc-unit',
    name: 'Unit test',
    minutes: 90,
    parts: [
      PaperPart('A', _a, [PaperSlot(ItemKind.mcq, 10, 1)]),
      PaperPart('B', _b, [PaperSlot(ItemKind.short, 4, 2)]),
      PaperPart('C', _c, [PaperSlot(ItemKind.long, 2, 3)]),
      PaperPart('D', _d, [PaperSlot(ItemKind.long, 1, 5), PaperSlot(ItemKind.problem, 2, 3)]),
    ],
  ),
  PaperPattern(
    id: 'puc-annual',
    name: 'Annual pattern',
    minutes: 195,
    parts: [
      PaperPart('A', _a, [PaperSlot(ItemKind.mcq, 20, 1)]),
      PaperPart('B', _b, [PaperSlot(ItemKind.short, 5, 2)]),
      PaperPart('C', _c, [PaperSlot(ItemKind.long, 5, 3)]),
      PaperPart('D', _d, [PaperSlot(ItemKind.long, 3, 5), PaperSlot(ItemKind.problem, 2, 5)]),
    ],
  ),
  PaperPattern(
    id: 'mcq-20',
    name: 'Multiple choice',
    minutes: 30,
    parts: [
      PaperPart('A', 'Choose the right answer', [PaperSlot(ItemKind.mcq, 20, 1)]),
    ],
  ),
];

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

class PaperSection {
  const PaperSection(this.part, this.items);
  final PaperPart part;
  final List<PaperItem> items;
  num get total => items.fold<num>(0, (a, i) => a + i.marks);

  /// "(1 × 5 = 5)", "(5 + 3 = 8)".
  String get marksLine {
    if (items.isEmpty) return '';
    final same = items.every((i) => i.marks == items.first.marks);
    return same ? '(${fmtMarks(items.first.marks)} × ${items.length} = ${fmtMarks(total)})' : '(${items.map((i) => fmtMarks(i.marks)).join(' + ')} = ${fmtMarks(total)})';
  }
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
/// topics, chosen with [seed]). A written question the bank lacks is replaced by another
/// written kind of the same marks; when none is left the slot shrinks.
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
  final shorts = pool((c) => c.shorts, (q) => q.topic);
  final longs = pool((c) => c.longs, (q) => q.topic);
  final problems = pool((c) => c.problems, (q) => q.topic);
  final used = <String>{};

  PaperItem? take(ItemKind kind, num marks) {
    PaperItem? from(ItemKind k) {
      switch (k) {
        case ItemKind.mcq:
          final q = _spread(mcqs, used, (q) => q.id, (q) => '${q.chapterId}|${q.topic}');
          return q == null
              ? null
              : PaperItem(
                  kind: k,
                  id: q.id,
                  text: q.stem,
                  options: q.options,
                  marks: marks,
                  answer: q.answerText,
                  steps: [if (q.explanation.isNotEmpty) q.explanation],
                  chapterId: q.chapterId,
                  topic: q.topic,
                );
        case ItemKind.short || ItemKind.long:
          final q = _spread(k == ItemKind.short ? shorts : longs, used, (q) => q.question, (q) => '${q.chapterId}|${q.topic}');
          return q == null ? null : PaperItem(kind: k, id: q.question, text: q.question, marks: marks, answer: q.answer, chapterId: q.chapterId, topic: q.topic);
        case ItemKind.problem:
          final q = _spread(problems, used, (q) => q.question, (q) => '${q.chapterId}|${q.topic}');
          return q == null ? null : PaperItem(kind: k, id: q.question, text: q.question, marks: marks, answer: q.answer, steps: q.steps, chapterId: q.chapterId, topic: q.topic);
      }
    }

    final order = switch (kind) {
      ItemKind.mcq => [ItemKind.mcq],
      ItemKind.short => [ItemKind.short, ItemKind.long],
      ItemKind.long => [ItemKind.long, ItemKind.problem, ItemKind.short],
      ItemKind.problem => [ItemKind.problem, ItemKind.long],
    };
    for (final k in order) {
      final item = from(k);
      if (item != null) return item;
    }
    return null;
  }

  final sections = <PaperSection>[];
  for (final part in pattern.parts) {
    final items = <PaperItem>[];
    for (final slot in part.slots) {
      for (var i = 0; i < slot.count; i++) {
        final item = take(slot.kind, slot.marks);
        if (item != null) items.add(item);
      }
    }
    if (items.isNotEmpty) sections.add(PaperSection(part, items));
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
          for (final i in [...s.items]..shuffle(r))
            if (i.kind == ItemKind.mcq && i.options.length > 1) _shuffleOptions(i, r) else i,
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
