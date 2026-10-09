/// Contracts for evaluation marks, the self-appraisal, house points and the curriculum view.
library;

double _num(Object? v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
String _s(Object? v) => v == null ? '' : '$v';
List<Map<String, dynamic>> _list(Object? v) => [for (final e in (v as List? ?? const [])) e as Map<String, dynamic>];

/// A tick, cross or comment on a scanned page; x and y are fractions (0 to 1) of the page.
class EvalAnnotation {
  const EvalAnnotation({required this.id, required this.pageIndex, required this.kind, required this.x, required this.y, this.text, this.earlier = false});

  factory EvalAnnotation.fromJson(Map<String, dynamic> j, {bool earlier = false}) => EvalAnnotation(
    id: _s(j['id']),
    pageIndex: (j['pageIndex'] as num? ?? 0).toInt(),
    kind: _s(j['kind']),
    x: _num(j['x']),
    y: _num(j['y']),
    text: j['text'] as String?,
    earlier: earlier,
  );

  final String id, kind;
  final int pageIndex;
  final double x, y;
  final String? text;

  /// A mark from an earlier valuation, shown to a third valuer; read only.
  final bool earlier;
}

class AppraisalCategory {
  const AppraisalCategory({required this.key, required this.label, required this.max});

  factory AppraisalCategory.fromJson(Map<String, dynamic> j) => AppraisalCategory(key: _s(j['key']), label: _s(j['label']), max: _num(j['max']));

  final String key, label;
  final double max;
}

class AppraisalCycle {
  const AppraisalCycle({required this.id, required this.period, required this.opensOn, required this.closesOn, required this.status});

  factory AppraisalCycle.fromJson(Map<String, dynamic> j) =>
      AppraisalCycle(id: _s(j['id']), period: _s(j['period']), opensOn: _s(j['opensOn']), closesOn: _s(j['closesOn']), status: _s(j['status']));

  final String id, period, opensOn, closesOn, status;
  bool get open => status == 'open';
}

/// My own appraisal for a cycle: a score and evidence per category key.
class MyAppraisal {
  const MyAppraisal({required this.status, required this.scores, required this.selfPercent, this.hodPercent});

  factory MyAppraisal.fromJson(Map<String, dynamic> j) {
    final raw = (j['selfScores'] as Map?) ?? const {};
    return MyAppraisal(
      status: _s(j['status']),
      scores: {for (final e in raw.entries) '${e.key}': (score: _num((e.value as Map)['score']), evidence: _s((e.value as Map)['evidence']))},
      selfPercent: _num(j['selfPercent']),
      hodPercent: j['hodScores'] == null ? null : _num(j['hodPercent']),
    );
  }

  final String status;
  final Map<String, ({double score, String evidence})> scores;
  final double selfPercent;
  final double? hodPercent;
  bool get locked => status != 'draft';
}

class HouseRow {
  const HouseRow({required this.id, required this.name, required this.colour, required this.motto, required this.members, required this.points, required this.rank});

  factory HouseRow.fromJson(Map<String, dynamic> j) => HouseRow(
    id: _s(j['id']),
    name: _s(j['name']),
    colour: _s(j['colour']),
    motto: _s(j['motto']),
    members: (j['members'] as num? ?? 0).toInt(),
    points: (j['points'] as num? ?? 0).toInt(),
    rank: (j['rank'] as num? ?? 0).toInt(),
  );

  final String id, name, colour, motto;
  final int members, points, rank;
}

class HouseMember {
  const HouseMember({required this.studentId, required this.name, required this.className, required this.points, required this.isCaptain});

  factory HouseMember.fromJson(Map<String, dynamic> j) => HouseMember(
    studentId: _s(j['studentId']),
    name: _s(j['name']),
    className: _s(j['className']),
    points: (j['points'] as num? ?? 0).toInt(),
    isCaptain: j['isCaptain'] == true,
  );

  final String studentId, name, className;
  final int points;
  final bool isCaptain;
}

class CurriculumVersionRow {
  const CurriculumVersionRow({required this.id, required this.label, required this.programName, required this.regulationYear, required this.status});

  factory CurriculumVersionRow.fromJson(Map<String, dynamic> j) => CurriculumVersionRow(
    id: _s(j['id']),
    label: _s(j['label']),
    programName: _s(j['programName']),
    regulationYear: (j['regulationYear'] as num? ?? 0).toInt(),
    status: _s(j['status']),
  );

  final String id, label, programName, status;
  final int regulationYear;
}

class CurriculumUnit {
  const CurriculumUnit({required this.title, required this.hours, required this.topics});

  final String title;
  final double hours;
  final List<String> topics;
}

class CurriculumCo {
  const CurriculumCo({required this.code, required this.statement});

  final String code, statement;
}

class CurriculumSubject {
  const CurriculumSubject({required this.code, required this.name, required this.term, required this.units, required this.cos});

  factory CurriculumSubject.fromJson(Map<String, dynamic> j) => CurriculumSubject(
    code: _s(j['code']),
    name: _s(j['name']),
    term: _s(j['term']),
    units: [
      for (final u in _list(j['units'])) CurriculumUnit(title: _s(u['title']), hours: _num(u['hours']), topics: [for (final t in (u['topics'] as List? ?? const [])) '$t']),
    ],
    cos: [for (final c in _list(j['cos'])) CurriculumCo(code: _s(c['code']), statement: _s(c['statement']))],
  );

  final String code, name, term;
  final List<CurriculumUnit> units;
  final List<CurriculumCo> cos;
}

/// A curriculum version with its subjects (`GET /v1/curriculum/versions/:id`).
class CurriculumDetail {
  const CurriculumDetail({required this.label, required this.subjects});

  factory CurriculumDetail.fromJson(Map<String, dynamic> j) =>
      CurriculumDetail(label: _s(j['label']), subjects: [for (final s in _list((j['content'] as Map?)?['subjects'])) CurriculumSubject.fromJson(s)]);

  final String label;
  final List<CurriculumSubject> subjects;
}
