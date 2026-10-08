import 'models.dart';

/// Exams: what a child sits and when, the hall ticket, published results and revaluation requests.

// ── Exams (GET /v1/results/students/:id/exams, /v1/results/students/:id) ───────────────────────

/// One paper in an exam session's timetable.
class ExamPaper {
  const ExamPaper({required this.subjectId, required this.subject, required this.examDate, required this.startsAt, required this.endsAt, required this.maxMarks, this.room, this.seat});

  factory ExamPaper.fromJson(Map<String, dynamic> j) => ExamPaper(
    subjectId: j['subjectId'] as String,
    subject: j['subject'] as String,
    examDate: parseIsoDate(j['examDate'] as String),
    startsAt: ClockTime.parse(j['startsAt'] as String),
    endsAt: ClockTime.parse(j['endsAt'] as String),
    maxMarks: (j['maxMarks'] as num).toInt(),
    room: j['room'] as String?,
    seat: (j['seat'] as num?)?.toInt(),
  );

  final String subjectId;
  final String subject;
  final DateTime examDate;
  final ClockTime startsAt;
  final ClockTime endsAt;
  final int maxMarks;
  final String? room;
  final int? seat;
}

/// The hall ticket for a session; [blocked] when the college withholds it (dues, detention).
class HallTicket {
  const HallTicket({required this.ticketNo, required this.blocked, this.blockedReason});

  factory HallTicket.fromJson(Map<String, dynamic> j) =>
      HallTicket(ticketNo: j['ticketNo'] as String, blocked: j['blocked'] as bool? ?? false, blockedReason: j['blockedReason'] as String?);

  final String ticketNo;
  final bool blocked;
  final String? blockedReason;
}

enum RevaluationStatus { requested, accepted, rejected, completed }

class RevaluationRequest {
  const RevaluationRequest({required this.id, required this.subjectId, required this.subject, required this.status, this.previousPercent, this.newPercent});

  factory RevaluationRequest.fromJson(Map<String, dynamic> j) => RevaluationRequest(
    id: j['id'] as String,
    subjectId: j['subjectId'] as String,
    subject: j['subject'] as String,
    status: RevaluationStatus.values.asNameMap()[j['status']] ?? RevaluationStatus.requested,
    previousPercent: (j['previousPercent'] as num?)?.toDouble(),
    newPercent: (j['newPercent'] as num?)?.toDouble(),
  );

  final String id;
  final String subjectId;
  final String subject;
  final RevaluationStatus status;
  final double? previousPercent;
  final double? newPercent;
}

/// An exam session the student sits (or sat): the timetable, the hall ticket, revaluation requests.
class ExamSession {
  const ExamSession({required this.id, required this.name, required this.kind, required this.startsOn, required this.endsOn, required this.status, required this.papers, this.hallTicket, this.revaluations = const []});

  factory ExamSession.fromJson(Map<String, dynamic> j) => ExamSession(
    id: j['id'] as String,
    name: j['name'] as String,
    kind: j['kind'] as String? ?? 'regular',
    startsOn: parseIsoDate(j['startsOn'] as String),
    endsOn: parseIsoDate(j['endsOn'] as String),
    status: j['status'] as String,
    hallTicket: j['hallTicket'] == null ? null : HallTicket.fromJson((j['hallTicket'] as Map).cast<String, dynamic>()),
    papers: [for (final p in (j['papers'] as List? ?? const [])) ExamPaper.fromJson((p as Map).cast<String, dynamic>())],
    revaluations: [for (final r in (j['revaluations'] as List? ?? const [])) RevaluationRequest.fromJson((r as Map).cast<String, dynamic>())],
  );

  final String id;
  final String name;
  final String kind;
  final DateTime startsOn;
  final DateTime endsOn;

  /// scheduled, processed, published or locked.
  final String status;
  final HallTicket? hallTicket;
  final List<ExamPaper> papers;
  final List<RevaluationRequest> revaluations;

  /// Results are out and the revaluation window is open.
  bool get canRequestRevaluation => status == 'published';
  bool get resultsOut => status == 'published' || status == 'locked';
  RevaluationRequest? revaluationFor(String subjectId) => revaluations.where((r) => r.subjectId == subjectId).firstOrNull;
}

class ResultLine {
  const ResultLine({required this.code, required this.subject, required this.credits, required this.percent, required this.grade, required this.gradePoint, required this.passed});

  factory ResultLine.fromJson(Map<String, dynamic> j) => ResultLine(
    code: j['code'] as String? ?? '',
    subject: j['subject'] as String,
    credits: (j['credits'] as num?)?.toDouble() ?? 0,
    percent: (j['percent'] as num).toDouble(),
    grade: j['grade'] as String? ?? '',
    gradePoint: (j['gradePoint'] as num?)?.toDouble() ?? 0,
    passed: j['passed'] as bool? ?? true,
  );

  final String code;
  final String subject;
  final double credits;
  final double percent;
  final String grade;
  final double gradePoint;
  final bool passed;
}

/// A published term result with its SGPA.
class TermResult {
  const TermResult({required this.sessionId, required this.sessionName, required this.term, required this.sgpa, required this.cgpa, required this.outcome, required this.lines});

  factory TermResult.fromJson(Map<String, dynamic> j) => TermResult(
    sessionId: j['sessionId'] as String,
    sessionName: j['sessionName'] as String,
    term: (j['term'] as num?)?.toInt() ?? 0,
    sgpa: (j['sgpa'] as num).toDouble(),
    cgpa: (j['cgpa'] as num?)?.toDouble() ?? 0,
    outcome: j['outcome'] as String? ?? 'pass',
    lines: [for (final l in (j['lines'] as List? ?? const [])) ResultLine.fromJson((l as Map).cast<String, dynamic>())],
  );

  final String sessionId;
  final String sessionName;
  final int term;
  final double sgpa;
  final double cgpa;
  final String outcome;
  final List<ResultLine> lines;
  bool get passed => outcome == 'pass';
}

class ExamResults {
  const ExamResults({required this.cgpa, required this.terms});

  factory ExamResults.fromJson(Map<String, dynamic> j) => ExamResults(
    cgpa: (j['cgpa'] as num?)?.toDouble(),
    terms: [for (final t in (j['terms'] as List? ?? const [])) TermResult.fromJson((t as Map).cast<String, dynamic>())],
  );

  final double? cgpa;

  /// Oldest first, as the server sends them.
  final List<TermResult> terms;
  TermResult? get latest => terms.lastOrNull;
}
