/// Contracts of the staff work endpoints: tasks, workflow requests, substitutions, invigilation,
/// on-screen evaluation, mentoring, course registration rosters, surveys and clubs.
/// Dates are YYYY-MM-DD, times HH:mm:ss, as the API sends them.
library;

double _num(Object? v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
String _s(Object? v) => v == null ? '' : '$v';
List<Map<String, dynamic>> _list(Object? v) => [for (final e in (v as List? ?? const [])) e as Map<String, dynamic>];

/// "12.5", "3": marks and amounts without a trailing ".0".
String numText(num n) => n == n.roundToDouble() ? n.round().toString() : n.toStringAsFixed(2).replaceFirst(RegExp(r'0+$'), '');

// ---- tasks ---------------------------------------------------------------------------------

enum TaskStatus { open, inProgress, done, cancelled }

TaskStatus taskStatusOf(String s) => switch (s) {
  'in_progress' => TaskStatus.inProgress,
  'done' => TaskStatus.done,
  'cancelled' => TaskStatus.cancelled,
  _ => TaskStatus.open,
};

String taskStatusCode(TaskStatus s) => switch (s) {
  TaskStatus.inProgress => 'in_progress',
  _ => s.name,
};

class TaskInfo {
  const TaskInfo({
    required this.id,
    required this.title,
    required this.description,
    required this.ownerName,
    required this.assigneeName,
    required this.priority,
    required this.status,
    required this.overdue,
    required this.version,
    this.dueAt,
  });

  factory TaskInfo.fromJson(Map<String, dynamic> j) => TaskInfo(
    id: j['id'] as String,
    title: j['title'] as String,
    description: _s(j['description']),
    ownerName: _s(j['ownerName']),
    assigneeName: _s(j['assigneeName']),
    priority: _s(j['priority']),
    status: taskStatusOf(_s(j['status'])),
    overdue: j['overdue'] == true,
    version: (j['version'] as num?)?.toInt() ?? 0,
    dueAt: j['dueAt'] == null ? null : DateTime.parse(j['dueAt'] as String).toLocal(),
  );

  final String id, title, description, ownerName, assigneeName, priority;
  final TaskStatus status;
  final bool overdue;
  final int version;
  final DateTime? dueAt;
}

// ---- workflow ------------------------------------------------------------------------------

class WorkflowField {
  const WorkflowField({required this.key, required this.label, required this.type, required this.required, this.options = const []});

  factory WorkflowField.fromJson(Map<String, dynamic> j) => WorkflowField(
    key: j['key'] as String,
    label: j['label'] as String,
    type: _s(j['type']),
    required: j['required'] == true,
    options: [for (final o in (j['options'] as List? ?? const [])) '$o'],
  );

  final String key, label;

  /// text, number, date or select.
  final String type;
  final bool required;
  final List<String> options;
}

/// A request route staff can start (the institution configures these).
class WorkflowDefinition {
  const WorkflowDefinition({required this.requestType, required this.name, required this.description, required this.fields});

  factory WorkflowDefinition.fromJson(Map<String, dynamic> j) => WorkflowDefinition(
    requestType: j['requestType'] as String,
    name: j['name'] as String,
    description: _s(j['description']),
    fields: [for (final f in _list(j['fields'])) WorkflowField.fromJson(f)],
  );

  final String requestType, name, description;
  final List<WorkflowField> fields;
}

class WorkflowAction {
  const WorkflowAction({required this.action, required this.actorName, required this.comment, this.stepName});

  factory WorkflowAction.fromJson(Map<String, dynamic> j) =>
      WorkflowAction(action: _s(j['action']), actorName: _s(j['actorName']), comment: _s(j['comment']), stepName: j['stepName'] as String?);

  final String action, actorName, comment;
  final String? stepName;
}

class WorkflowRequestInfo {
  const WorkflowRequestInfo({
    required this.id,
    required this.requestType,
    required this.title,
    required this.status,
    required this.requesterName,
    required this.stepNumber,
    required this.stepCount,
    required this.version,
    this.stepName,
    this.amount,
    this.timeline = const [],
    this.payload = const {},
    this.canDecide = false,
    this.canCancel = false,
  });

  factory WorkflowRequestInfo.fromJson(Map<String, dynamic> j) => WorkflowRequestInfo(
    id: j['id'] as String,
    requestType: _s(j['requestType']),
    title: j['title'] as String,
    status: _s(j['status']),
    requesterName: _s(j['requesterName']),
    stepName: j['stepName'] as String?,
    stepNumber: (j['stepNumber'] as num?)?.toInt() ?? 1,
    stepCount: (j['stepCount'] as num?)?.toInt() ?? 1,
    amount: j['amount'] == null ? null : _num(j['amount']),
    version: (j['version'] as num?)?.toInt() ?? 0,
    payload: Map<String, dynamic>.from(j['payload'] as Map? ?? const {}),
    timeline: [for (final a in _list(j['timeline'])) WorkflowAction.fromJson(a)],
    canDecide: j['canDecide'] == true,
    canCancel: j['canCancel'] == true,
  );

  final String id, requestType, title, requesterName;

  /// pending, approved, rejected, returned or cancelled.
  final String status;
  final String? stepName;
  final int stepNumber, stepCount, version;
  final double? amount;
  final Map<String, dynamic> payload;
  final List<WorkflowAction> timeline;
  final bool canDecide, canCancel;
}

// ---- substitutions and invigilation ---------------------------------------------------------

/// A period the teacher covers for a colleague.
class SubstitutionInfo {
  const SubstitutionInfo({
    required this.id,
    required this.slotId,
    required this.date,
    required this.startsAt,
    required this.endsAt,
    required this.sectionId,
    required this.section,
    required this.subjectId,
    required this.subject,
    required this.originalTeacher,
    required this.reason,
    this.room,
  });

  factory SubstitutionInfo.fromJson(Map<String, dynamic> j) => SubstitutionInfo(
    id: j['id'] as String,
    slotId: j['slotId'] as String,
    date: _s(j['date']),
    startsAt: _s(j['startsAt']),
    endsAt: _s(j['endsAt']),
    sectionId: (j['section'] as Map)['id'] as String,
    section: (j['section'] as Map)['displayName'] as String,
    subjectId: (j['subject'] as Map)['id'] as String,
    subject: (j['subject'] as Map)['name'] as String,
    originalTeacher: _s(j['originalTeacher']),
    reason: _s(j['reason']),
    room: j['room'] as String?,
  );

  final String id, slotId, date, startsAt, endsAt, sectionId, section, subjectId, subject, originalTeacher, reason;
  final String? room;
}

class InvigilationDuty {
  const InvigilationDuty({required this.id, required this.session, required this.room, required this.dutyDate, required this.startsAt, required this.endsAt, required this.role});

  factory InvigilationDuty.fromJson(Map<String, dynamic> j) => InvigilationDuty(
    id: j['id'] as String,
    session: _s(j['session']),
    room: _s(j['room']),
    dutyDate: _s(j['dutyDate']),
    startsAt: _s(j['startsAt']),
    endsAt: _s(j['endsAt']),
    role: _s(j['role']),
  );

  final String id, session, room, dutyDate, startsAt, endsAt, role;
}

// ---- on-screen evaluation -------------------------------------------------------------------

class EvalAllocation {
  const EvalAllocation({required this.id, required this.subject, required this.session, required this.dummyNo, required this.round, required this.status, this.total});

  factory EvalAllocation.fromJson(Map<String, dynamic> j) => EvalAllocation(
    id: j['id'] as String,
    subject: _s(j['subject']),
    session: _s(j['session']),
    dummyNo: _s(j['dummyNo']),
    round: (j['round'] as num?)?.toInt() ?? 1,
    status: _s(j['status']),
    total: j['total'] == null ? null : _num(j['total']),
  );

  final String id, subject, session, dummyNo, status;
  final int round;
  final double? total;
  bool get submitted => status == 'submitted';
}

class EvalQuestion {
  const EvalQuestion({required this.id, required this.no, required this.maxMarks});
  final String id, no;
  final double maxMarks;
}

class EvalEntry {
  const EvalEntry({required this.questionId, required this.marks, this.comment});
  final String questionId;
  final double marks;
  final String? comment;
}

/// One script to value: the pages, the questions and what the examiner has entered so far.
class EvalScript {
  const EvalScript({required this.id, required this.status, required this.dummyNo, required this.pageCount, required this.questions, required this.entries, this.total});

  factory EvalScript.fromJson(Map<String, dynamic> j) => EvalScript(
    id: j['id'] as String,
    status: _s(j['status']),
    dummyNo: _s(j['dummyNo']),
    total: j['total'] == null ? null : _num(j['total']),
    pageCount: (j['pages'] as List? ?? const []).length,
    questions: [for (final q in _list(j['questions'])) EvalQuestion(id: q['id'] as String, no: _s(q['no']), maxMarks: _num(q['maxMarks']))],
    entries: [for (final e in _list(j['entries'])) EvalEntry(questionId: e['questionId'] as String, marks: _num(e['marks']), comment: e['comment'] as String?)],
  );

  final String id, status, dummyNo;
  final double? total;
  final int pageCount;
  final List<EvalQuestion> questions;
  final List<EvalEntry> entries;
  bool get submitted => status == 'submitted';
}

// ---- mentoring -------------------------------------------------------------------------------

class MenteeInfo {
  const MenteeInfo({
    required this.studentId,
    required this.studentName,
    required this.rollNo,
    required this.section,
    required this.level,
    required this.failingMarks,
    required this.overdueFees,
    required this.openCases,
    this.attendancePct,
  });

  factory MenteeInfo.fromJson(Map<String, dynamic> j) => MenteeInfo(
    studentId: j['studentId'] as String,
    studentName: j['studentName'] as String,
    rollNo: _s(j['rollNo']),
    section: _s(j['section']),
    level: _s(j['level']),
    attendancePct: (j['attendancePct'] as num?)?.toInt(),
    failingMarks: (j['failingMarks'] as num?)?.toInt() ?? 0,
    overdueFees: (j['overdueFees'] as num?)?.toInt() ?? 0,
    openCases: (j['openCases'] as num?)?.toInt() ?? 0,
  );

  final String studentId, studentName, rollNo, section;

  /// none, low, medium or high.
  final String level;
  final int? attendancePct;
  final int failingMarks, overdueFees, openCases;
}

class MentoringSession {
  const MentoringSession({required this.id, required this.heldOn, required this.mode, required this.summary, this.privateNotes, this.followUpOn});

  factory MentoringSession.fromJson(Map<String, dynamic> j) => MentoringSession(
    id: j['id'] as String,
    heldOn: _s(j['heldOn']),
    mode: _s(j['mode']),
    summary: _s(j['summary']),
    privateNotes: j['privateNotes'] as String?,
    followUpOn: j['followUpOn'] as String?,
  );

  final String id, heldOn, mode, summary;
  final String? privateNotes, followUpOn;
}

class PlanAction {
  const PlanAction(this.text, this.done);
  final String text;
  final bool done;
}

class InterventionPlan {
  const InterventionPlan({required this.id, required this.studentId, required this.studentName, required this.goal, required this.reviewOn, required this.status, required this.actions});

  /// Reads a row of GET /v1/mentoring/plans ({plan, studentName}) or a bare plan.
  factory InterventionPlan.fromJson(Map<String, dynamic> j) {
    final p = (j['plan'] as Map<String, dynamic>?) ?? j;
    return InterventionPlan(
      id: p['id'] as String,
      studentId: _s(p['studentId']),
      studentName: _s(j['studentName']),
      goal: _s(p['goal']),
      reviewOn: _s(p['reviewOn']),
      status: _s(p['status']),
      actions: [for (final a in _list(p['actions'])) PlanAction(_s(a['text']), a['done'] == true)],
    );
  }

  final String id, studentId, studentName, goal, reviewOn, status;
  final List<PlanAction> actions;
  bool get closed => status == 'closed';
}

// ---- course registration -------------------------------------------------------------------

class TermInfo {
  const TermInfo({required this.id, required this.name});
  factory TermInfo.fromJson(Map<String, dynamic> j) => TermInfo(id: j['id'] as String, name: _s(j['name']));
  final String id, name;
}

class OfferingInfo {
  const OfferingInfo({required this.id, required this.subjectCode, required this.subjectName, required this.registered, required this.waitlisted, this.facultyId});

  factory OfferingInfo.fromJson(Map<String, dynamic> j) => OfferingInfo(
    id: j['id'] as String,
    subjectCode: _s(j['subjectCode']),
    subjectName: _s(j['subjectName']),
    facultyId: j['facultyId'] as String?,
    registered: (j['registered'] as num?)?.toInt() ?? 0,
    waitlisted: (j['waitlisted'] as num?)?.toInt() ?? 0,
  );

  final String id, subjectCode, subjectName;
  final String? facultyId;
  final int registered, waitlisted;
}

class RosterEntry {
  const RosterEntry({required this.studentId, required this.fullName, required this.rollNo, required this.status, this.waitlistPos});

  factory RosterEntry.fromJson(Map<String, dynamic> j) => RosterEntry(
    studentId: j['studentId'] as String,
    fullName: _s(j['fullName']),
    rollNo: _s(j['rollNo']),
    status: _s(j['status']),
    waitlistPos: (j['waitlistPos'] as num?)?.toInt(),
  );

  final String studentId, fullName, rollNo;

  /// registered or waitlisted.
  final String status;
  final int? waitlistPos;
}

// ---- surveys ---------------------------------------------------------------------------------

class SurveyQuestion {
  const SurveyQuestion({required this.id, required this.kind, required this.prompt, required this.options, required this.required});

  factory SurveyQuestion.fromJson(Map<String, dynamic> j) => SurveyQuestion(
    id: j['id'] as String,
    kind: _s(j['kind']),
    prompt: _s(j['prompt']),
    options: [for (final o in (j['options'] as List? ?? const [])) '$o'],
    required: j['required'] == true,
  );

  final String id, kind, prompt;
  final List<String> options;
  final bool required;
}

class SurveyInfo {
  const SurveyInfo({required this.id, required this.title, required this.description, required this.anonymous, required this.answered, required this.questions, this.closesAt});

  factory SurveyInfo.fromJson(Map<String, dynamic> j) => SurveyInfo(
    id: j['id'] as String,
    title: _s(j['title']),
    description: _s(j['description']),
    anonymous: j['anonymous'] == true,
    answered: j['answered'] == true,
    closesAt: j['closesAt'] == null ? null : DateTime.parse(j['closesAt'] as String).toLocal(),
    questions: [for (final q in _list(j['questions'])) SurveyQuestion.fromJson(q)],
  );

  final String id, title, description;
  final bool anonymous, answered;
  final DateTime? closesAt;
  final List<SurveyQuestion> questions;
}

/// One answer to send: choices for single/multiple, a rating from 1 to 5, or text.
class SurveyAnswer {
  const SurveyAnswer(this.questionId, {this.choices, this.rating, this.text});
  final String questionId;
  final List<String>? choices;
  final int? rating;
  final String? text;

  Map<String, dynamic> toJson() => {'questionId': questionId, 'choices': ?choices, 'rating': ?rating, 'text': ?text};
}

// ---- clubs -----------------------------------------------------------------------------------

class ClubInfo {
  const ClubInfo({required this.id, required this.name, required this.category, required this.members, required this.pending, this.coordinatorId});

  factory ClubInfo.fromJson(Map<String, dynamic> j) => ClubInfo(
    id: j['id'] as String,
    name: _s(j['name']),
    category: _s(j['category']),
    coordinatorId: j['facultyCoordinatorId'] as String?,
    members: (j['members'] as num?)?.toInt() ?? 0,
    pending: (j['pending'] as num?)?.toInt() ?? 0,
  );

  final String id, name, category;
  final String? coordinatorId;
  final int members, pending;
}

class ClubMember {
  const ClubMember({required this.studentId, required this.fullName, required this.rollNo, required this.status, required this.points});

  factory ClubMember.fromJson(Map<String, dynamic> j) => ClubMember(
    studentId: j['studentId'] as String,
    fullName: _s(j['fullName']),
    rollNo: _s(j['rollNo']),
    status: _s(j['status']),
    points: (j['points'] as num?)?.toInt() ?? 0,
  );

  final String studentId, fullName, rollNo, status;
  final int points;
}
