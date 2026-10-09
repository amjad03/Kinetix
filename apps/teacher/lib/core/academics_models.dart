/// Contracts of the course-file, outcome-based education (CO/PO), research and project-mentoring
/// endpoints. Dates are YYYY-MM-DD, timestamps ISO 8601, as the API sends them.
library;

double _num(Object? v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
double? _numOrNull(Object? v) => v == null ? null : _num(v);
int _int(Object? v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
String _s(Object? v) => v == null ? '' : '$v';
String? _sOrNull(Object? v) => v == null ? null : '$v';
DateTime? _time(Object? v) => v == null ? null : DateTime.tryParse('$v')?.toLocal();
List<Map<String, dynamic>> _list(Object? v) => [for (final e in (v as List? ?? const [])) e as Map<String, dynamic>];

// ---- who sees what (mirrors the API's role lists) ---------------------------------------------

/// course-files.controller.ts ROLES.
const courseFileRoles = ['tenant_admin', 'principal', 'hod', 'teacher', 'quality_officer'];

/// obe.controller.ts STAFF: reading course outcomes and the CO-PO matrix.
const obeRoles = ['teacher', 'hod', 'principal', 'tenant_admin', 'quality_officer'];

/// obe.controller.ts MANAGE: the programme attainment figures.
const attainmentRoles = ['tenant_admin', 'principal', 'quality_officer', 'hod'];

/// research.controller.ts FACULTY_ROLES.
const researchRoles = ['tenant_admin', 'principal', 'research_coordinator', 'hod', 'teacher'];

/// projects.access.ts PROJECT_PARTICIPANTS without the students.
const projectRoles = ['tenant_admin', 'principal', 'research_coordinator', 'hod', 'teacher'];

bool hasAnyRole(List<String> mine, List<String> allowed) => mine.any(allowed.contains);

// ---- outcome-based education -----------------------------------------------------------------

class CourseOutcome {
  const CourseOutcome({required this.id, required this.code, required this.statement, this.bloomLevel});

  factory CourseOutcome.fromJson(Map<String, dynamic> j) =>
      CourseOutcome(id: j['id'] as String, code: _s(j['code']), statement: _s(j['statement']), bloomLevel: _sOrNull(j['bloomLevel']));

  final String id, code, statement;
  final String? bloomLevel;
}

/// A version of a subject's course outcomes (`GET /v1/obe/subjects/:id/co-sets`); status is draft, active or retired.
class CoSet {
  const CoSet({required this.id, required this.version, required this.status, required this.outcomes, this.note});

  factory CoSet.fromJson(Map<String, dynamic> j) => CoSet(
    id: j['id'] as String,
    version: _int(j['version']),
    status: _s(j['status']),
    note: _sOrNull(j['note']),
    outcomes: [for (final o in _list(j['outcomes'])) CourseOutcome.fromJson(o)],
  );

  final String id, status;
  final int version;
  final String? note;
  final List<CourseOutcome> outcomes;

  /// The version to show: the live one, else the newest.
  static CoSet? current(List<CoSet> sets) {
    if (sets.isEmpty) return null;
    return sets.firstWhere((s) => s.status == 'active', orElse: () => ([...sets]..sort((a, b) => b.version.compareTo(a.version))).first);
  }
}

/// A programme outcome (PO) or programme-specific outcome (PSO), a column of the matrix.
class ProgramOutcome {
  const ProgramOutcome({required this.id, required this.programId, required this.kind, required this.code, required this.statement});

  factory ProgramOutcome.fromJson(Map<String, dynamic> j) =>
      ProgramOutcome(id: j['id'] as String, programId: _s(j['programId']), kind: _s(j['kind']), code: _s(j['code']), statement: _s(j['statement']));

  final String id, programId, kind, code, statement;
}

/// The CO x PO/PSO matrix of one version (`GET /v1/obe/co-sets/:id/matrix`); strength is 0 (none) to 3 (high).
class CoMatrix {
  const CoMatrix({required this.cos, required this.outcomes, required this.cells});

  factory CoMatrix.fromJson(Map<String, dynamic> j) => CoMatrix(
    cos: [for (final c in _list(j['cos'])) CourseOutcome.fromJson(c)],
    outcomes: [for (final o in _list(j['outcomes'])) ProgramOutcome.fromJson(o)],
    cells: {for (final c in _list(j['cells'])) '${c['coId']}|${c['outcomeId']}': _int(c['strength'])},
  );

  final List<CourseOutcome> cos;
  final List<ProgramOutcome> outcomes;
  final Map<String, int> cells;

  int strength(String coId, String outcomeId) => cells['$coId|$outcomeId'] ?? 0;

  /// The programme the outcomes belong to, needed to ask for attainment.
  String? get programId => outcomes.isEmpty ? null : outcomes.first.programId;
}

/// The attainment of one course outcome (`GET /v1/obe/programs/:id/attainment`, cos list).
class CoAttainment {
  const CoAttainment({required this.targetId, required this.code, required this.target, required this.met, this.direct, this.indirect, this.combined, this.gap, this.trend = 'new', this.maxLevel = 3});

  factory CoAttainment.fromJson(Map<String, dynamic> j) => CoAttainment(
    targetId: _s(j['targetId']),
    code: _s(j['code']),
    direct: _numOrNull(j['direct']),
    indirect: _numOrNull(j['indirect']),
    combined: _numOrNull(j['combined']),
    target: _num(j['target']),
    gap: _numOrNull(j['gap']),
    met: j['met'] == true,
    trend: _s(j['trend']).isEmpty ? 'new' : _s(j['trend']),
    maxLevel: j['maxLevel'] == null ? 3 : _num(j['maxLevel']),
  );

  final String targetId, code, trend;
  final double? direct, indirect, combined, gap;
  final double target;

  /// The top of the attainment scale (from the programme's configuration).
  final double maxLevel;
  final bool met;
}

/// One academic year, as the terms list gives it.
class TermYear {
  const TermYear({required this.academicYearId, required this.startsOn, required this.endsOn});

  factory TermYear.fromJson(Map<String, dynamic> j) =>
      TermYear(academicYearId: _s(j['academicYearId']), startsOn: _s(j['startsOn']), endsOn: _s(j['endsOn']));

  final String academicYearId, startsOn, endsOn;

  /// The academic year that contains [today] (YYYY-MM-DD), else the latest one.
  static String? current(List<TermYear> terms, String today) {
    if (terms.isEmpty) return null;
    for (final t in terms) {
      if (t.startsOn.compareTo(today) <= 0 && t.endsOn.compareTo(today) >= 0) return t.academicYearId;
    }
    return ([...terms]..sort((a, b) => a.startsOn.compareTo(b.startsOn))).last.academicYearId;
  }
}

// ---- research --------------------------------------------------------------------------------

class ResearchProject {
  const ResearchProject({required this.id, required this.code, required this.title, required this.kind, required this.status, required this.startsOn, this.endsOn});

  factory ResearchProject.fromJson(Map<String, dynamic> j) => ResearchProject(
    id: j['id'] as String,
    code: _s(j['code']),
    title: _s(j['title']),
    kind: _s(j['kind']),
    status: _s(j['status']),
    startsOn: _s(j['startsOn']),
    endsOn: _sOrNull(j['endsOn']),
  );

  final String id, code, title, kind, status, startsOn;
  final String? endsOn;
}

class Scholar {
  const Scholar({required this.id, required this.fullName, required this.programme, required this.status, required this.enrolledOn, this.thesisTitle});

  factory Scholar.fromJson(Map<String, dynamic> j) => Scholar(
    id: j['id'] as String,
    fullName: _s(j['fullName']),
    programme: _s(j['programme']),
    status: _s(j['status']),
    enrolledOn: _s(j['enrolledOn']),
    thesisTitle: _sOrNull(j['thesisTitle']),
  );

  final String id, fullName, programme, status, enrolledOn;
  final String? thesisTitle;
}

/// A thesis in the list (`GET /v1/research/theses`).
class ThesisRow {
  const ThesisRow({required this.id, required this.title, required this.stage, required this.scholar, required this.programme, this.submittedOn});

  factory ThesisRow.fromJson(Map<String, dynamic> j) => ThesisRow(
    id: j['id'] as String,
    title: _s(j['title']),
    stage: _s(j['stage']),
    scholar: _s(j['scholar']),
    programme: _s(j['programme']),
    submittedOn: _sOrNull(j['submittedOn']),
  );

  final String id, title, stage, scholar, programme;
  final String? submittedOn;
}

/// The thesis stages in order, as the API names them.
const thesisStages = ['synopsis', 'draft', 'submitted', 'examination', 'viva', 'awarded'];

class ThesisEvent {
  const ThesisEvent({required this.stage, required this.note, this.at});

  factory ThesisEvent.fromJson(Map<String, dynamic> j) => ThesisEvent(stage: _s(j['stage']), note: _s(j['note']), at: _time(j['createdAt']));

  final String stage, note;
  final DateTime? at;
}

class ThesisViva {
  const ThesisViva({required this.id, required this.kind, required this.venue, required this.panel, required this.status, this.scheduledAt, this.outcome, this.remarks});

  factory ThesisViva.fromJson(Map<String, dynamic> j) => ThesisViva(
    id: _s(j['id']),
    kind: _s(j['kind']),
    scheduledAt: _time(j['scheduledAt']),
    venue: _s(j['venue']),
    panel: [for (final p in _list(j['panel'])) _s(p['name'])],
    status: _s(j['status']),
    outcome: _sOrNull(j['outcome']),
    remarks: _sOrNull(j['remarks']),
  );

  final String id, kind, venue, status;
  final DateTime? scheduledAt;
  final List<String> panel;
  final String? outcome, remarks;
}

class ThesisDetail {
  const ThesisDetail({
    required this.id,
    required this.title,
    required this.abstract,
    required this.stage,
    required this.hasText,
    required this.scholarName,
    required this.programme,
    required this.events,
    required this.vivas,
    required this.similarityLimit,
    this.similarityPercent,
    this.submittedOn,
  });

  factory ThesisDetail.fromJson(Map<String, dynamic> j) {
    final scholar = (j['scholar'] as Map?) ?? const {};
    final sim = j['similarity'] as Map?;
    return ThesisDetail(
      id: j['id'] as String,
      title: _s(j['title']),
      abstract: _s(j['abstract']),
      stage: _s(j['stage']),
      hasText: j['hasText'] == true,
      scholarName: _s(scholar['fullName']),
      programme: _s(scholar['programme']),
      submittedOn: _sOrNull(j['submittedOn']),
      events: [for (final e in _list(j['events'])) ThesisEvent.fromJson(e)],
      vivas: [for (final v in _list(j['vivas'])) ThesisViva.fromJson(v)],
      similarityPercent: sim == null ? null : _num(sim['scorePercent']),
      similarityLimit: _num(j['similarityLimitPercent'] ?? 25),
    );
  }

  final String id, title, abstract, stage, scholarName, programme;
  final String? submittedOn;
  final bool hasText;
  final List<ThesisEvent> events;
  final List<ThesisViva> vivas;
  final double? similarityPercent;
  final double similarityLimit;

  /// A supervisor may move a thesis from draft to submitted.
  bool get canSubmit => stage == 'draft';
}

class Publication {
  const Publication({required this.id, required this.title, required this.kind, required this.venue, required this.year, this.doi});

  factory Publication.fromJson(Map<String, dynamic> j) => Publication(
    id: j['id'] as String,
    title: _s(j['title']),
    kind: _s(j['kind']),
    venue: _s(j['venue']),
    year: _int(j['year']),
    doi: _sOrNull(j['doi']),
  );

  final String id, title, kind, venue;
  final int year;
  final String? doi;
}

class ResearchDataset {
  const ResearchDataset({required this.id, required this.title, required this.owner, required this.license, required this.access, required this.files, required this.canOpen, this.embargoUntil, this.doi});

  factory ResearchDataset.fromJson(Map<String, dynamic> j) => ResearchDataset(
    id: j['id'] as String,
    title: _s(j['title']),
    owner: _s(j['owner']),
    license: _s(j['license']),
    access: _s(j['access']),
    embargoUntil: _sOrNull(j['embargoUntil']),
    doi: _sOrNull(j['doi']),
    files: (j['files'] as List? ?? const []).length,
    canOpen: j['canOpen'] == true,
  );

  final String id, title, owner, license, access;
  final String? embargoUntil, doi;
  final int files;
  final bool canOpen;
}

// ---- project mentoring -----------------------------------------------------------------------

class MyProject {
  const MyProject({required this.id, required this.code, required this.title, required this.kind, required this.status, required this.showcase, required this.recruiting});

  factory MyProject.fromJson(Map<String, dynamic> j) => MyProject(
    id: j['id'] as String,
    code: _s(j['code']),
    title: _s(j['title']),
    kind: _s(j['kind']),
    status: _s(j['status']),
    showcase: j['showcase'] == true,
    recruiting: j['recruiting'] == true,
  );

  final String id, code, title, kind, status;
  final bool showcase, recruiting;
}

class ProjectMember {
  const ProjectMember({required this.id, required this.role, required this.name});

  factory ProjectMember.fromJson(Map<String, dynamic> j) => ProjectMember(id: _s(j['id']), role: _s(j['role']), name: _s(j['name']));

  final String id, role, name;
}

class ProjectMilestone {
  const ProjectMilestone({required this.title, required this.dueOn, this.completedOn});

  factory ProjectMilestone.fromJson(Map<String, dynamic> j) => ProjectMilestone(title: _s(j['title']), dueOn: _s(j['dueOn']), completedOn: _sOrNull(j['completedOn']));

  final String title, dueOn;
  final String? completedOn;
}

class ProjectFile {
  const ProjectFile({required this.id, required this.title, required this.kind, this.url});

  factory ProjectFile.fromJson(Map<String, dynamic> j) => ProjectFile(id: _s(j['id']), title: _s(j['title']), kind: _s(j['kind']), url: _sOrNull(j['url']));

  final String id, title, kind;
  final String? url;
}

class ProjectHub {
  const ProjectHub({this.showcase = false, this.summary = '', this.recruiting = false, this.lookingFor = const [], this.openings = 0});

  factory ProjectHub.fromJson(Map<String, dynamic> j) => ProjectHub(
    showcase: j['showcase'] == true,
    summary: _s(j['summary']),
    recruiting: j['recruiting'] == true,
    lookingFor: [for (final e in (j['lookingFor'] as List? ?? const [])) '$e'],
    openings: _int(j['openings']),
  );

  final bool showcase, recruiting;
  final String summary;
  final List<String> lookingFor;
  final int openings;
}

class ProjectViva {
  const ProjectViva({required this.id, required this.venue, required this.panel, required this.status, this.scheduledAt, this.outcome, this.score, this.remarks});

  factory ProjectViva.fromJson(Map<String, dynamic> j) => ProjectViva(
    id: _s(j['id']),
    scheduledAt: _time(j['scheduledAt']),
    venue: _s(j['venue']),
    panel: [for (final p in _list(j['panel'])) _s(p['name'])],
    status: _s(j['status']),
    outcome: _sOrNull(j['outcome']),
    score: _numOrNull(j['score']),
    remarks: _sOrNull(j['remarks']),
  );

  final String id, venue, status;
  final DateTime? scheduledAt;
  final List<String> panel;
  final String? outcome, remarks;
  final double? score;

  bool get scheduled => status == 'scheduled';
}

/// A project workspace (`GET /v1/projects/:id/workspace`).
class ProjectWorkspace {
  const ProjectWorkspace({
    required this.id,
    required this.code,
    required this.title,
    required this.status,
    required this.pi,
    required this.myRole,
    required this.members,
    required this.milestones,
    required this.files,
    required this.hub,
    required this.vivas,
    required this.reviewCount,
    this.reviewAverage,
  });

  factory ProjectWorkspace.fromJson(Map<String, dynamic> j) {
    final p = j['project'] as Map<String, dynamic>;
    final rv = (j['reviews'] as Map?) ?? const {};
    return ProjectWorkspace(
      id: p['id'] as String,
      code: _s(p['code']),
      title: _s(p['title']),
      status: _s(p['status']),
      pi: _s(p['pi']),
      myRole: _s(j['myRole']),
      members: [for (final m in _list(j['members'])) ProjectMember.fromJson(m)],
      milestones: [for (final m in _list(j['milestones'])) ProjectMilestone.fromJson(m)],
      files: [for (final f in _list(j['files'])) ProjectFile.fromJson(f)],
      hub: j['hub'] is Map<String, dynamic> ? ProjectHub.fromJson(j['hub'] as Map<String, dynamic>) : const ProjectHub(),
      vivas: [for (final v in _list(j['vivas'])) ProjectViva.fromJson(v)],
      reviewCount: _int(rv['count']),
      reviewAverage: _numOrNull(rv['average']),
    );
  }

  final String id, code, title, status, pi, myRole;
  final List<ProjectMember> members;
  final List<ProjectMilestone> milestones;
  final List<ProjectFile> files;
  final ProjectHub hub;
  final List<ProjectViva> vivas;
  final int reviewCount;
  final double? reviewAverage;

  /// Mentors (the PI, supervisors and staff admins) may review, run the viva, edit the hub and decide join requests.
  bool get isMentor => myRole.isNotEmpty && myRole != 'member';
}

class ProjectComment {
  const ProjectComment({required this.id, required this.body, required this.author, this.parentId, this.at});

  factory ProjectComment.fromJson(Map<String, dynamic> j) =>
      ProjectComment(id: _s(j['id']), parentId: _sOrNull(j['parentId']), body: _s(j['body']), author: _s(j['author']), at: _time(j['createdAt']));

  final String id, body, author;
  final String? parentId;
  final DateTime? at;
}

class ProjectReview {
  const ProjectReview({required this.id, required this.kind, required this.rubric, required this.maxPerCriterion, required this.percent, required this.comment, required this.reviewer, this.total});

  factory ProjectReview.fromJson(Map<String, dynamic> j) => ProjectReview(
    id: _s(j['id']),
    kind: _s(j['kind']),
    rubric: {for (final e in ((j['rubric'] as Map?) ?? const {}).entries) '${e.key}': _num(e.value)},
    maxPerCriterion: _int(j['maxPerCriterion']),
    total: _numOrNull(j['total']),
    percent: _num(j['percent']),
    comment: _s(j['comment']),
    reviewer: _s(j['reviewer']),
  );

  final String id, kind, comment, reviewer;
  final Map<String, double> rubric;
  final int maxPerCriterion;
  final double percent;
  final double? total;
}

class JoinRequest {
  const JoinRequest({required this.id, required this.studentId, required this.fullName, required this.message, required this.status});

  factory JoinRequest.fromJson(Map<String, dynamic> j) =>
      JoinRequest(id: _s(j['id']), studentId: _s(j['studentId']), fullName: _s(j['fullName']), message: _s(j['message']), status: _s(j['status']));

  final String id, studentId, fullName, message, status;

  bool get pending => status == 'pending';
}

class ProjectMatch {
  const ProjectMatch({required this.studentId, required this.fullName, required this.rollNo, required this.fit, required this.matched});

  factory ProjectMatch.fromJson(Map<String, dynamic> j) => ProjectMatch(
    studentId: _s(j['studentId']),
    fullName: _s(j['fullName']),
    rollNo: _s(j['rollNo']),
    fit: _int(j['fit']),
    matched: [for (final e in (j['matched'] as List? ?? const [])) '$e'],
  );

  final String studentId, fullName, rollNo;
  final int fit;
  final List<String> matched;
}
