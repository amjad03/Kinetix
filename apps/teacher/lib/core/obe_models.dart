/// Contracts of the question-wise marks and course-outcome approval endpoints (`/v1/obe/...`).
library;

double? _numOrNull(Object? v) => v == null ? null : (v is num ? v.toDouble() : double.tryParse('$v'));
double _num(Object? v) => _numOrNull(v) ?? 0;
int _int(Object? v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
String _s(Object? v) => v == null ? '' : '$v';
String? _sOrNull(Object? v) => v == null ? null : '$v';
List<Map<String, dynamic>> _list(Object? v) => [for (final e in (v as List? ?? const [])) e as Map<String, dynamic>];

/// Review steps a CO version passes through after it is sent: head of department, OBE coordinator, IQAC.
const coReviewStages = ['hod', 'coordinator', 'iqac'];

/// One assessment of a course (`GET /v1/obe/subjects/:id/assessments`) with how complete its paper and marks are.
class CourseAssessment {
  const CourseAssessment({
    required this.id,
    required this.title,
    required this.kind,
    required this.section,
    required this.maxMarks,
    required this.evidence,
    required this.basis,
    required this.questions,
    required this.tagged,
    required this.classSize,
    required this.questionMarked,
    this.heldOn,
  });

  factory CourseAssessment.fromJson(Map<String, dynamic> j) => CourseAssessment(
    id: j['id'] as String,
    title: _s(j['title']),
    kind: _s(j['kind']),
    section: _s(j['section']),
    maxMarks: _num(j['maxMarks']),
    heldOn: _sOrNull(j['heldOn']),
    evidence: _s(j['evidence']),
    basis: _s(j['basis']),
    questions: _int(j['questions']),
    tagged: _int(j['tagged']),
    classSize: _int(j['classSize']),
    questionMarked: _int(j['questionMarked']),
  );

  final String id, title, kind, section, evidence, basis;
  final String? heldOn;
  final double maxMarks;
  final int questions, tagged, classSize, questionMarked;
}

class PaperCo {
  const PaperCo({required this.id, required this.code, required this.statement});

  factory PaperCo.fromJson(Map<String, dynamic> j) => PaperCo(id: j['id'] as String, code: _s(j['code']), statement: _s(j['statement']));

  final String id, code, statement;
}

/// A question of the paper: its number, part, maximum marks, Bloom level and the COs it tests.
class PaperQuestion {
  const PaperQuestion({
    required this.id,
    required this.no,
    required this.part,
    required this.maxMarks,
    required this.coIds,
    this.bloomLevel,
  });

  factory PaperQuestion.fromJson(Map<String, dynamic> j) => PaperQuestion(
    id: j['id'] as String,
    no: _s(j['no']),
    part: _s(j['part']),
    maxMarks: _num(j['maxMarks']),
    bloomLevel: _sOrNull(j['bloomLevel']),
    coIds: [for (final c in _list(j['cos'])) _s(c['coId'])],
  );

  final String id, no, part;
  final double maxMarks;
  final String? bloomLevel;
  final List<String> coIds;
}

/// A student of the class with their question-wise marks (question id to marks; null where not entered).
class PaperStudent {
  const PaperStudent({required this.id, required this.rollNo, required this.name, required this.absent, required this.marks, this.total});

  factory PaperStudent.fromJson(Map<String, dynamic> j) => PaperStudent(
    id: j['id'] as String,
    rollNo: _s(j['rollNo']),
    name: _s(j['name']),
    absent: j['absent'] == true,
    total: _numOrNull(j['total']),
    marks: {for (final e in ((j['marks'] as Map?) ?? const {}).entries) '${e.key}': _numOrNull(e.value)},
  );

  final String id, rollNo, name;
  final bool absent;
  final double? total;
  final Map<String, double?> marks;
}

/// An assessment's question paper and the class's question-wise marks (`GET /v1/obe/assessments/:id/questions`).
class QuestionPaper {
  const QuestionPaper({
    required this.id,
    required this.title,
    required this.section,
    required this.subject,
    required this.maxMarks,
    required this.evidence,
    required this.editable,
    required this.cos,
    required this.questions,
    required this.students,
  });

  factory QuestionPaper.fromJson(Map<String, dynamic> j) {
    final a = j['assessment'] as Map<String, dynamic>;
    return QuestionPaper(
      id: a['id'] as String,
      title: _s(a['title']),
      section: _s(a['section']),
      subject: _s(a['subject']),
      maxMarks: _num(a['maxMarks']),
      evidence: _s(a['evidence']),
      editable: j['editable'] == true,
      cos: [for (final c in _list(j['cos'])) PaperCo.fromJson(c)],
      questions: [for (final q in _list(j['questions'])) PaperQuestion.fromJson(q)],
      students: [for (final s in _list(j['students'])) PaperStudent.fromJson(s)],
    );
  }

  final String id, title, section, subject, evidence;
  final double maxMarks;
  final bool editable;
  final List<PaperCo> cos;
  final List<PaperQuestion> questions;
  final List<PaperStudent> students;

  double get paperMarks => questions.fold(0, (s, q) => s + q.maxMarks);

  /// The CO codes a question tests, for its column head.
  String coCodes(PaperQuestion q) => [for (final id in q.coIds) ...cos.where((c) => c.id == id).map((c) => c.code)].join(', ');
}

/// One student's question-wise marks to save.
class QuestionMarksEntry {
  const QuestionMarksEntry({required this.studentId, required this.absent, required this.marks});

  final String studentId;
  final bool absent;
  final Map<String, double?> marks;

  Map<String, dynamic> toJson() => {'studentId': studentId, 'absent': absent, 'marks': marks};
}

/// A course-outcome version waiting for the reader's decision (`GET /v1/obe/approvals`).
class CoApproval {
  const CoApproval({
    required this.id,
    required this.version,
    required this.stage,
    required this.subjectId,
    required this.subject,
    required this.code,
    required this.program,
    required this.cos,
    required this.verbIssues,
    this.submittedBy,
    this.submittedAt,
  });

  factory CoApproval.fromJson(Map<String, dynamic> j) => CoApproval(
    id: j['id'] as String,
    version: _int(j['version']),
    stage: _s(j['stage']),
    subjectId: _s(j['subjectId']),
    subject: _s(j['subject']),
    code: _s(j['code']),
    program: _s(j['program']),
    cos: _int(j['cos']),
    verbIssues: _int(j['verbIssues']),
    submittedBy: _sOrNull(j['submittedBy']),
    submittedAt: j['submittedAt'] == null ? null : DateTime.tryParse('${j['submittedAt']}')?.toLocal(),
  );

  final String id, stage, subjectId, subject, code, program;
  final int version, cos, verbIssues;
  final String? submittedBy;
  final DateTime? submittedAt;
}

/// One step in a version's review history.
class CoReviewEntry {
  const CoReviewEntry({required this.stage, required this.decision, this.comment, this.co, this.actor, this.at});

  factory CoReviewEntry.fromJson(Map<String, dynamic> j) => CoReviewEntry(
    stage: _s(j['stage']),
    decision: _s(j['decision']),
    comment: _sOrNull(j['comment']),
    co: _sOrNull(j['co']),
    actor: _sOrNull(j['actor']),
    at: j['at'] == null ? null : DateTime.tryParse('${j['at']}')?.toLocal(),
  );

  final String stage, decision;
  final String? comment, co, actor;
  final DateTime? at;
}

/// A version's review state and history (`GET /v1/obe/co-sets/:id/reviews`).
class CoReviews {
  const CoReviews({required this.reviewStage, required this.canDecide, required this.history});

  factory CoReviews.fromJson(Map<String, dynamic> j) => CoReviews(
    reviewStage: _s((j['set'] as Map?)?['reviewStage']),
    canDecide: j['canDecide'] == true,
    history: [for (final h in _list(j['history'])) CoReviewEntry.fromJson(h)],
  );

  final String reviewStage;
  final bool canDecide;
  final List<CoReviewEntry> history;
}

/// Reads a typed mark: empty is "not entered"; returns null and [ok] false when it is not a number in 0..[max].
({double? value, bool ok}) readQuestionMark(String text, double max) {
  final t = text.trim();
  if (t.isEmpty) return (value: null, ok: true);
  final v = double.tryParse(t);
  if (v == null || v < 0 || v > max) return (value: null, ok: false);
  return (value: v, ok: true);
}
