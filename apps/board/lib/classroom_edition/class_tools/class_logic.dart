import '../l10n/ce_strings.dart';
import 'dart:math';

import 'bank.dart';
import 'class_records.dart';

// --- Class quiz --------------------------------------------------------------------------------

enum Mark { none, right, wrong }

/// The marks of one class-quiz question by roll number. A tap goes blank → right → wrong →
/// blank ("once for right, twice for wrong"); absent roll numbers are skipped.
class QuizMarks {
  QuizMarks({required this.rolls, Set<int> absent = const {}}) : absent = {...absent};

  final List<int> rolls;
  final Set<int> absent;
  final Map<int, Mark> _marks = {};

  Mark of(int roll) => _marks[roll] ?? Mark.none;
  bool isAbsent(int roll) => absent.contains(roll);
  List<int> get present => [
    for (final r in rolls)
      if (!absent.contains(r)) r,
  ];

  /// Moves [roll] to its next mark; false for an absent roll number.
  bool tap(int roll) {
    if (absent.contains(roll) || !rolls.contains(roll)) return false;
    final next = Mark.values[(of(roll).index + 1) % Mark.values.length];
    if (next == Mark.none) {
      _marks.remove(roll);
    } else {
      _marks[roll] = next;
    }
    return true;
  }

  void set(int roll, Mark m) {
    if (absent.contains(roll)) return;
    m == Mark.none ? _marks.remove(roll) : _marks[roll] = m;
  }

  /// Every present roll number not yet marked becomes right.
  void markRestRight() {
    for (final r in present) {
      _marks.putIfAbsent(r, () => Mark.right);
    }
  }

  void clear() => _marks.clear();

  List<int> get right => [
    for (final r in present)
      if (of(r) == Mark.right) r,
  ];
  List<int> get wrong => [
    for (final r in present)
      if (of(r) == Mark.wrong) r,
  ];
  int get notMarked => present.length - right.length - wrong.length;
  bool get anyMarked => _marks.isNotEmpty;

  /// The record kept for this question (null when nobody was marked).
  QuizRecord? record({required DateTime at, required BankQuestion q, String topicTitle = ''}) =>
      anyMarked ? QuizRecord(at: at, questionId: q.id, chapterId: q.chapterId, topic: q.topic, topicTitle: topicTitle, right: right, wrong: wrong) : null;
}

/// [count] questions of [chapter] for a class quiz (of [topic] when given), easy ones first,
/// PUC-tagged ones preferred and questions asked lately ([recent]) left for later.
List<BankQuestion> pickQuizQuestions(BankChapter chapter, {String? topic, Set<String> topics = const {}, int count = 5, int seed = 0, Set<String> recent = const {}}) {
  final r = Random(seed);
  var pool = chapter.questions.where((q) => (topic == null || q.topic == topic) && (topics.isEmpty || topics.contains(q.topic))).toList();
  if (pool.isEmpty) pool = [...chapter.questions];
  pool.shuffle(r);
  int rank(BankQuestion q) => (recent.contains(q.id) ? 10 : 0) + (q.puc ? 0 : 1);
  pool.sort((a, b) => rank(a).compareTo(rank(b)));
  final picked = pool.take(count).toList()..sort((a, b) => a.difficulty.compareTo(b.difficulty));
  return picked;
}

// --- Mastery map --------------------------------------------------------------------------------

enum MasteryLevel { none, notYet, gettingThere, secure, mastered }

/// The band for a score of 0–1 (null: no answers yet).
MasteryLevel levelOf(double? s) => switch (s) {
  null => MasteryLevel.none,
  < 0.4 => MasteryLevel.notYet,
  < 0.6 => MasteryLevel.gettingThere,
  < 0.8 => MasteryLevel.secure,
  _ => MasteryLevel.mastered,
};

/// One topic's row: each roll number's score (0–1; missing: no answers yet).
class MasteryRow {
  MasteryRow({required this.key, required this.chapterId, required this.topic, required this.title, required this.scores});

  /// "chapterId|t3".
  final String key;
  final String chapterId;
  final String topic;
  final String title;
  final Map<int, double> scores;

  /// The class's score: the mean over the roll numbers that have answered.
  double? get classScore => scores.isEmpty ? null : scores.values.reduce((a, b) => a + b) / scores.length;
}

/// A card under the map: what to do next.
class MasteryInsight {
  const MasteryInsight(this.kind, this.title, this.line, {this.rolls = const [], this.rowKeys = const []});

  /// 'revisit', 'strongest', 'group'.
  final String kind;
  final String title;
  final String line;
  final List<int> rolls;
  final List<String> rowKeys;
}

class MasteryMap {
  MasteryMap({required this.rows, required this.rolls, required this.insights});
  final List<MasteryRow> rows;
  final List<int> rolls;
  final List<MasteryInsight> insights;
  bool get isEmpty => rows.isEmpty;
}

String rollLabel(int r) => r.toString().padLeft(2, '0');

/// "04, 09, 17 and 22".
String rollList(List<int> rolls) {
  final s = [for (final r in rolls) rollLabel(r)];
  if (s.length <= 1) return s.join();
  return ceTr('{a} and {b}', {'a': s.sublist(0, s.length - 1).join(', '), 'b': s.last});
}

/// Topics × roll numbers from the class quizzes (a right answer counts 1, a wrong one 0) and
/// mock tests (the paper's score counts twice on every topic it asked about). [chapterId]
/// keeps one chapter's topics; [titleOf] names a topic when the records do not.
MasteryMap buildMastery({required ClassRecords records, required List<int> rolls, String? chapterId, String Function(String chapterId, String topic)? titleOf, DateTime? now}) {
  final got = <String, Map<int, double>>{}, asked = <String, Map<int, double>>{};
  final titles = <String, String>{};
  void add(String key, int roll, double score, double weight) {
    got.putIfAbsent(key, () => {})[roll] = (got[key]![roll] ?? 0) + score * weight;
    asked.putIfAbsent(key, () => {})[roll] = (asked[key]![roll] ?? 0) + weight;
  }

  for (final q in records.quizzes) {
    if (chapterId != null && q.chapterId != chapterId) continue;
    final key = '${q.chapterId}|${q.topic}';
    if (q.topicTitle.isNotEmpty) titles[key] = q.topicTitle;
    for (final r in q.right) {
      add(key, r, 1, 1);
    }
    for (final r in q.wrong) {
      add(key, r, 0, 1);
    }
  }
  for (final m in records.mocks) {
    if (m.maxMarks <= 0) continue;
    for (final t in m.topics.entries) {
      if (chapterId != null && !t.key.startsWith('$chapterId|')) continue;
      titles.putIfAbsent(t.key, () => t.value);
      for (final e in m.marks.entries) {
        add(t.key, e.key, (e.value / m.maxMarks).clamp(0, 1).toDouble(), 2);
      }
    }
  }
  int topicNo(String t) => int.tryParse(t.replaceAll(RegExp(r'\D'), '')) ?? 999;
  final keys = got.keys.toList()
    ..sort((a, b) {
      final pa = a.split('|'), pb = b.split('|');
      final c = pa.first.compareTo(pb.first);
      return c != 0 ? c : topicNo(pa.last).compareTo(topicNo(pb.last));
    });
  final rows = [
    for (final k in keys)
      MasteryRow(
        key: k,
        chapterId: k.split('|').first,
        topic: k.split('|').last,
        title: () {
          final named = titleOf?.call(k.split('|').first, k.split('|').last) ?? '';
          return named.isNotEmpty ? named : (titles[k]?.isNotEmpty ?? false ? titles[k]! : ceTr('Other questions'));
        }(),
        scores: {
          for (final r in rolls)
            if ((asked[k]?[r] ?? 0) > 0) r: got[k]![r]! / asked[k]![r]!,
        },
      ),
  ].where((r) => r.scores.isNotEmpty).toList();
  return MasteryMap(rows: rows, rolls: rolls, insights: _insights(rows, now ?? DateTime.now()));
}

List<MasteryInsight> _insights(List<MasteryRow> rows, DateTime now) {
  if (rows.isEmpty) return const [];
  final sorted = [...rows]..sort((a, b) => a.classScore!.compareTo(b.classScore!));
  final out = <MasteryInsight>[];
  final weak = sorted.first, strong = sorted.last;
  String lower(String s) => s.isEmpty ? s : s[0].toLowerCase() + s.substring(1);
  if (weak.classScore! < 0.6) {
    final notYet = weak.scores.values.where((s) => s < 0.6).length;
    out.add(
      MasteryInsight(
        'revisit',
        ceTr('Revisit: {topic}', {'topic': lower(weak.title)}),
        ceTr('{n} of {total} roll numbers are not there yet. Teach it again with a new example, then a short class quiz.', {'n': notYet, 'total': weak.scores.length}),
        rowKeys: [weak.key],
      ),
    );
  }
  if (strong != weak || out.isEmpty) {
    out.add(
      strong.classScore! >= 0.6
          ? MasteryInsight('strongest', ceTr('Strongest: {topic}', {'topic': lower(strong.title)}), ceTr('Secure for most roll numbers. A short formula drill keeps it fresh.'), rowKeys: [strong.key])
          : MasteryInsight('strongest', ceTr('Closest: {topic}', {'topic': lower(strong.title)}), ceTr('The class is nearest to secure here. One more quiz should get it there.'), rowKeys: [strong.key]),
    );
  }
  final two = sorted.take(2).toList();
  final group = <int, double>{};
  for (final roll in {for (final r in two) ...r.scores.keys}) {
    final s = [for (final r in two) ?r.scores[roll]];
    final mean = s.reduce((a, b) => a + b) / s.length;
    if (mean < 0.5) group[roll] = mean;
  }
  if (group.isNotEmpty) {
    final rolls = (group.keys.toList()..sort((a, b) => group[a]!.compareTo(group[b]!))).take(8).toList()..sort();
    var day = now.add(const Duration(days: 1));
    if (day.weekday == DateTime.sunday) day = day.add(const Duration(days: 1));
    final t = two.map((r) => lower(r.title)).toSet().toList();
    final topics = t.length == 1 ? t.single : ceTr('{a} and {b}', {'a': t.first, 'b': t.last});
    out.add(MasteryInsight('group', ceTr('Small group for {day}', {'day': ceDayIn(CeLang.code, day.weekday)}), ceTr('Roll {rolls}: {topics}.', {'rolls': rollList(rolls), 'topics': topics}), rolls: rolls, rowKeys: [for (final r in two) r.key]));
  }
  return out;
}

// --- Teams -------------------------------------------------------------------------------------

/// Team names: Karnataka's rivers.
const teamNames = ['Kaveri', 'Krishna', 'Tunga', 'Bhadra', 'Netravati', 'Sharavati', 'Kabini', 'Hemavati'];

/// Splits the [present] roll numbers into [n] teams of near-equal size: by benches (runs of
/// roll numbers, the way the class sits) or mixed (shuffled with [seed]).
List<TeamRecord> splitTeams(List<int> present, int n, {bool mixed = false, int seed = 0}) {
  n = n.clamp(1, min(teamNames.length, max(1, present.length)));
  final rolls = [...present]..sort();
  final teams = [for (var i = 0; i < n; i++) <int>[]];
  if (mixed) {
    rolls.shuffle(Random(seed));
    for (final (i, r) in rolls.indexed) {
      teams[i % n].add(r);
    }
    for (final t in teams) {
      t.sort();
    }
  } else {
    var at = 0;
    for (var i = 0; i < n; i++) {
      final size = rolls.length ~/ n + (i < rolls.length % n ? 1 : 0);
      teams[i].addAll(rolls.sublist(at, at + size));
      at += size;
    }
  }
  return [for (var i = 0; i < n; i++) TeamRecord(name: teamNames[i], rolls: teams[i])];
}

/// "01–10" for a run, else "01, 04, 07 …".
String rollsLabel(List<int> rolls) {
  if (rolls.isEmpty) return '';
  final s = [...rolls]..sort();
  final run = s.last - s.first + 1 == s.length;
  if (run && s.length > 2) return '${rollLabel(s.first)}–${rollLabel(s.last)}';
  return s.map(rollLabel).join(', ');
}

// --- Class plan --------------------------------------------------------------------------------

/// One chapter on the plan: its target week (a Monday) and whether it is done.
class PlanStep {
  PlanStep({required this.id, required this.title, required this.done, this.from, this.to});
  final String id;
  final String title;
  final bool done;
  final DateTime? from, to;
}

class PlanView {
  PlanView({required this.steps, required this.teachingDays, required this.daysLeft, required this.revisionFrom, required this.expectedDone, required this.thisWeek});
  final List<PlanStep> steps;

  /// School days (Monday–Saturday) left before revision starts, and before the exam.
  final int teachingDays, daysLeft;
  final DateTime revisionFrom;

  /// Chapters the plan expects done by today (from the start of the academic year, 1 June).
  final int expectedDone;
  final List<PlanStep> thisWeek;

  int get done => steps.where((s) => s.done).length;
  int get left => steps.length - done;

  /// How many chapters behind the plan (negative: ahead).
  int get behind => expectedDone - done;

  /// School days per chapter left.
  double get daysPerChapter => left == 0 ? 0 : teachingDays / left;
}

int schoolDaysBetween(DateTime a, DateTime b) {
  var n = 0;
  for (var d = DateTime(a.year, a.month, a.day); d.isBefore(b); d = d.add(const Duration(days: 1))) {
    if (d.weekday != DateTime.sunday) n++;
  }
  return n;
}

/// The chapters ([chapters]: id, title) laid out from [today] to the exam date, with the
/// revision weeks kept free at the end.
PlanView buildPlan({required List<(String, String)> chapters, required PlanRecord plan, required DateTime today}) {
  final day = DateTime(today.year, today.month, today.day);
  final revisionFrom = plan.examDate.subtract(Duration(days: plan.revisionWeeks * 7));
  final teaching = max(0, schoolDaysBetween(day, revisionFrom));
  final left = chapters.where((c) => !plan.done.contains(c.$1)).toList();
  final per = left.isEmpty ? 0.0 : teaching / left.length;
  final steps = <PlanStep>[];
  var k = 0;
  DateTime dateAfter(double schoolDays) {
    var d = day, n = 0;
    while (n < schoolDays.round()) {
      d = d.add(const Duration(days: 1));
      if (d.weekday != DateTime.sunday) n++;
    }
    return d;
  }

  for (final c in chapters) {
    if (plan.done.contains(c.$1)) {
      steps.add(PlanStep(id: c.$1, title: c.$2, done: true));
    } else {
      steps.add(PlanStep(id: c.$1, title: c.$2, done: false, from: dateAfter(k * per), to: dateAfter((k + 1) * per)));
      k++;
    }
  }
  final yearStart = DateTime(plan.examDate.month >= 6 ? plan.examDate.year : plan.examDate.year - 1, 6, 1);
  final total = schoolDaysBetween(yearStart, revisionFrom);
  final gone = schoolDaysBetween(yearStart, day);
  final expected = total <= 0 ? chapters.length : (chapters.length * (gone / total)).floor().clamp(0, chapters.length);
  final weekEnd = day.add(Duration(days: 7 - day.weekday));
  final thisWeek = [
    for (final s in steps)
      if (!s.done && s.from != null && !s.from!.isAfter(weekEnd)) s,
  ];
  return PlanView(
    steps: steps,
    teachingDays: teaching,
    daysLeft: max(0, schoolDaysBetween(day, plan.examDate)),
    revisionFrom: revisionFrom,
    expectedDone: expected,
    thisWeek: thisWeek.isEmpty && left.isNotEmpty ? [steps.firstWhere((s) => !s.done)] : thisWeek,
  );
}

/// The usual PUC annual exam: 1 March after [today]'s academic year starts.
DateTime defaultExamDate(DateTime today) => DateTime(today.month >= 4 ? today.year + 1 : today.year, 3, 1);
