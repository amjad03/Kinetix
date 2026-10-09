/// Contracts for "My learning": worksheets and scores, extra help, entrance readiness, the promotion decision,
/// mastery by subject and what to practise next (`/v1/school-learning/students/:id/summary`, `/v1/lms/students/:id/recommendations`).
library;

String _s(Object? v) => v == null ? '' : '$v';
double? _n(Object? v) => v == null ? null : (v is num ? v.toDouble() : double.tryParse('$v'));
List<Map<String, dynamic>> _list(Object? v) => [for (final e in (v as List? ?? const [])) (e as Map).cast<String, dynamic>()];

class LearningWorksheet {
  const LearningWorksheet({required this.id, required this.kind, required this.title, required this.subjectName, this.dueOn, required this.maxScore, this.score, this.level, this.remarks = ''});

  factory LearningWorksheet.fromJson(Map<String, dynamic> j) => LearningWorksheet(
    id: _s(j['id']),
    kind: _s(j['kind']),
    title: _s(j['title']),
    subjectName: _s(j['subjectName']),
    dueOn: j['dueOn'] as String?,
    maxScore: _n(j['maxScore']) ?? 0,
    score: _n(j['score']),
    level: j['level'] as String?,
    remarks: _s(j['remarks']),
  );

  final String id, kind, title, subjectName, remarks;
  final String? dueOn, level;
  final double maxScore;
  final double? score;

  bool get scored => score != null || level != null;
}

class ExtraHelp {
  const ExtraHelp({required this.id, required this.subjectName, required this.plan, this.dueOn, required this.status});

  factory ExtraHelp.fromJson(Map<String, dynamic> j) => ExtraHelp(id: _s(j['id']), subjectName: _s(j['subjectName']), plan: _s(j['plan']), dueOn: j['dueOn'] as String?, status: _s(j['status']));

  final String id, subjectName, plan, status;
  final String? dueOn;
}

class ReadinessRow {
  const ReadinessRow({required this.exam, required this.targetPct, this.latestPct, this.averagePct, required this.band, this.trend, this.weakSubjects = const [], this.tests = 0});

  factory ReadinessRow.fromJson(Map<String, dynamic> j) => ReadinessRow(
    exam: _s(j['exam']),
    targetPct: _n(j['targetPct']) ?? 0,
    latestPct: _n(j['latestPct']),
    averagePct: _n(j['averagePct']),
    band: _s(j['band']),
    trend: j['trend'] as String?,
    weakSubjects: [for (final w in (j['weakSubjects'] as List? ?? const [])) '$w'],
    tests: (j['tests'] as num?)?.toInt() ?? 0,
  );

  final String exam, band;
  final String? trend;
  final double targetPct;
  final double? latestPct, averagePct;
  final List<String> weakSubjects;
  final int tests;
}

/// An approved promotion decision (`promoted`, `promoted_with_grace`, `compartment`, `detained`) and the reasons.
class PromotionNote {
  const PromotionNote({required this.decision, this.reasons = const []});

  factory PromotionNote.fromJson(Map<String, dynamic> j) => PromotionNote(decision: _s(j['decision']), reasons: [for (final r in (j['reasons'] as List? ?? const [])) '$r']);

  final String decision;
  final List<String> reasons;
}

class LearningSummary {
  const LearningSummary({this.worksheets = const [], this.help = const [], this.readiness = const [], this.promotion});

  factory LearningSummary.fromJson(Map<String, dynamic> j) => LearningSummary(
    worksheets: [for (final w in _list(j['worksheets'])) LearningWorksheet.fromJson(w)],
    help: [for (final h in _list(j['remedial'])) ExtraHelp.fromJson(h)],
    readiness: [for (final r in _list(j['readiness'])) ReadinessRow.fromJson(r)],
    promotion: j['promotion'] is Map ? PromotionNote.fromJson((j['promotion'] as Map).cast<String, dynamic>()) : null,
  );

  final List<LearningWorksheet> worksheets;
  final List<ExtraHelp> help;
  final List<ReadinessRow> readiness;
  final PromotionNote? promotion;

  bool get isEmpty => worksheets.isEmpty && help.isEmpty && readiness.isEmpty && promotion == null;
}

class MasterySubject {
  const MasterySubject({required this.subject, required this.assessed, required this.percent});

  factory MasterySubject.fromJson(Map<String, dynamic> j) => MasterySubject(subject: _s(j['subject']), assessed: (j['assessed'] as num?)?.toInt() ?? 0, percent: (j['percent'] as num?)?.toInt() ?? 0);

  final String subject;
  final int assessed, percent;
}

/// One thing to do next: practice that builds a weak outcome, or overdue work.
class PracticeItem {
  const PracticeItem({required this.kind, required this.title, required this.reason});

  factory PracticeItem.fromJson(Map<String, dynamic> j) => PracticeItem(kind: _s(j['kind']), title: _s(j['title']), reason: _s(j['reason']));

  final String kind, title, reason;
}

class LearningAdvice {
  const LearningAdvice({this.mastery = const [], this.practice = const []});

  factory LearningAdvice.fromJson(Map<String, dynamic> j) => LearningAdvice(
    mastery: [for (final m in _list(j['mastery'])) MasterySubject.fromJson(m)],
    practice: [for (final p in _list(j['recommendations'])) PracticeItem.fromJson(p)],
  );

  final List<MasterySubject> mastery;
  final List<PracticeItem> practice;
}
