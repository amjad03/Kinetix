import 'models.dart';

/// Exams, leave, the bus, hostel gate passes and certificates: what a student asks the campus for.

DateTime? _at(Object? v) => v == null ? null : DateTime.parse(v as String).toLocal();

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

// ── Leave (/v1/student-leave) ─────────────────────────────────────────────────────────────────

enum LeaveStatus { pending, approved, rejected, cancelled }

class LeaveRequest {
  const LeaveRequest({required this.id, required this.fromDate, required this.toDate, required this.reason, required this.status, this.decisionNote});

  factory LeaveRequest.fromJson(Map<String, dynamic> j) => LeaveRequest(
    id: j['id'] as String,
    fromDate: parseIsoDate(j['fromDate'] as String),
    toDate: parseIsoDate(j['toDate'] as String),
    reason: j['reason'] as String? ?? '',
    status: LeaveStatus.values.asNameMap()[j['status']] ?? LeaveStatus.pending,
    decisionNote: j['decisionNote'] as String?,
  );

  final String id;
  final DateTime fromDate;
  final DateTime toDate;
  final String reason;
  final LeaveStatus status;
  final String? decisionNote;
}

// ── Bus (GET /v1/transport/students/:id) ──────────────────────────────────────────────────────

class BusStop {
  const BusStop({required this.id, required this.name, required this.seq});

  factory BusStop.fromJson(Map<String, dynamic> j) => BusStop(id: j['id'] as String, name: j['name'] as String, seq: (j['seq'] as num).toInt());

  final String id;
  final String name;
  final int seq;
}

/// Where the bus is now and how far from the student's stop.
class BusPosition {
  const BusPosition({this.speedKmh, this.at, this.etaMinutes, this.stopsAway = 0});

  factory BusPosition.fromJson(Map<String, dynamic> j) => BusPosition(
    speedKmh: (j['speedKmh'] as num?)?.toDouble(),
    at: _at(j['at']),
    etaMinutes: (j['etaMinutes'] as num?)?.toInt(),
    stopsAway: (j['stopsAway'] as num?)?.toInt() ?? 0,
  );

  final double? speedKmh;
  final DateTime? at;

  /// Null once the bus has passed the student's stop.
  final int? etaMinutes;
  final int stopsAway;
}

class StudentBus {
  const StudentBus({required this.assigned, this.routeName, this.regNo, this.stopId, this.stopName, this.pickupTime, this.stops = const [], this.bus});

  factory StudentBus.fromJson(Map<String, dynamic> j) {
    if (j['assigned'] != true) return const StudentBus(assigned: false);
    return StudentBus(
      assigned: true,
      routeName: j['routeName'] as String?,
      regNo: j['regNo'] as String?,
      stopId: j['stopId'] as String?,
      stopName: j['stopName'] as String?,
      pickupTime: j['pickupTime'] == null ? null : ClockTime.parse(j['pickupTime'] as String),
      stops: [for (final s in (j['stops'] as List? ?? const [])) BusStop.fromJson((s as Map).cast<String, dynamic>())],
      bus: j['bus'] == null ? null : BusPosition.fromJson((j['bus'] as Map).cast<String, dynamic>()),
    );
  }

  final bool assigned;
  final String? routeName;
  final String? regNo;
  final String? stopId;
  final String? stopName;
  final ClockTime? pickupTime;
  final List<BusStop> stops;

  /// Null when the bus is not running.
  final BusPosition? bus;
}

// ── Hostel gate passes (GET /v1/hostel/students/:id, POST /v1/hostel/gate-passes/requests) ────

class GatePass {
  const GatePass({required this.id, required this.reason, required this.destination, required this.expectedBackAt, required this.status});

  factory GatePass.fromJson(Map<String, dynamic> j) => GatePass(
    id: j['id'] as String,
    reason: j['reason'] as String? ?? '',
    destination: j['destination'] as String? ?? '',
    expectedBackAt: DateTime.parse(j['expectedBackAt'] as String).toLocal(),
    status: j['status'] as String? ?? 'requested',
  );

  final String id;
  final String reason;
  final String destination;
  final DateTime expectedBackAt;

  /// requested, issued, out, returned, rejected or cancelled.
  final String status;
}

class HostelView {
  const HostelView({required this.resident, this.block, this.room, this.bed, this.passes = const []});

  factory HostelView.fromJson(Map<String, dynamic> j) {
    final bed = j['bed'] as Map?;
    return HostelView(
      resident: j['resident'] == true,
      block: bed?['block'] as String?,
      room: bed?['room'] as String?,
      bed: bed?['bed'] as String?,
      passes: [for (final p in (j['passes'] as List? ?? const [])) GatePass.fromJson((p as Map).cast<String, dynamic>())],
    );
  }

  final bool resident;
  final String? block;
  final String? room;
  final String? bed;
  final List<GatePass> passes;
}

// ── Certificates (/v1/documents) ──────────────────────────────────────────────────────────────

class CertificateField {
  const CertificateField({required this.key, required this.label, required this.required});

  factory CertificateField.fromJson(Map<String, dynamic> j) =>
      CertificateField(key: j['key'] as String, label: j['label'] as String, required: j['required'] as bool? ?? false);

  final String key;
  final String label;
  final bool required;
}

/// A certificate the college issues that a student may ask for.
class CertificateTemplate {
  const CertificateTemplate({required this.id, required this.kind, required this.name, required this.fields});

  factory CertificateTemplate.fromJson(Map<String, dynamic> j) => CertificateTemplate(
    id: j['id'] as String,
    kind: j['kind'] as String,
    name: j['name'] as String,
    fields: [for (final f in (j['fields'] as List? ?? const [])) CertificateField.fromJson((f as Map).cast<String, dynamic>())],
  );

  final String id;
  final String kind;
  final String name;
  final List<CertificateField> fields;
}

class CertificateRequest {
  const CertificateRequest({required this.id, required this.name, required this.status, required this.purpose, this.serialNo, this.decisionNote, this.issuedAt, required this.createdAt});

  factory CertificateRequest.fromJson(Map<String, dynamic> j) => CertificateRequest(
    id: j['id'] as String,
    name: (j['template'] as Map)['name'] as String,
    status: j['status'] as String,
    purpose: j['purpose'] as String? ?? '',
    serialNo: j['serialNo'] as String?,
    decisionNote: j['decisionNote'] as String?,
    issuedAt: _at(j['issuedAt']),
    createdAt: DateTime.parse(j['createdAt'] as String).toLocal(),
  );

  final String id;
  final String name;

  /// requested, approved, rejected, issued or revoked.
  final String status;
  final String purpose;
  final String? serialNo;
  final String? decisionNote;
  final DateTime? issuedAt;
  final DateTime createdAt;
  bool get canDownload => status == 'issued';
}
