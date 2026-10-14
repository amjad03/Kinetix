/// The attendance desk and the office, as the Cloud API sends them: a class's day with its periods
/// and special classes and periods left unmarked (`/v1/attendance-desk/...`), students' leave and on
/// duty waiting for a decision (`/v1/records/attendance-leaves`), indents (`/v1/inventory/requisitions`),
/// room bookings (`/v1/facilities/...`) and interview panels (`/v1/hr/interviews/...`).
library;

import 'models.dart';

int _int(Object? v) => (v as num?)?.round() ?? 0;
double? _dbl(Object? v) => v is num ? v.toDouble() : (v is String ? double.tryParse(v) : null);
String _s(Object? v) => v == null ? '' : '$v';
DateTime? _time(Object? v) => v == null ? null : DateTime.tryParse('$v')?.toLocal();
List<Map<String, dynamic>> _maps(Object? v) => [for (final x in (v as List? ?? const [])) (x as Map).cast<String, dynamic>()];

/// "09:30" from "09:30:00".
String hhmm(Object? v) {
  final t = _s(v);
  return t.length >= 5 ? t.substring(0, 5) : t;
}

/// "2026-10-14" as a date at midnight; null when missing.
DateTime? dayOf(Object? v) {
  if (v == null) return null;
  final t = '$v';
  final d = DateTime.tryParse(t.length >= 10 ? t.substring(0, 10) : t);
  return d == null ? null : DateTime(d.year, d.month, d.day);
}

// ── Attendance desk ─────────────────────────────────────────────────────────────────────────────

/// A class the teacher may mark (their own, or one they are timetabled for).
class DeskClass {
  const DeskClass({required this.id, required this.name, this.program = ''});

  factory DeskClass.fromJson(Map<String, dynamic> j) => DeskClass(id: _s(j['id']), name: _s(j['name']), program: _s(j['program']));

  final String id;
  final String name;
  final String program;
}

/// A timetabled period on a date: who teaches it that day (a substitute when there is one) and how many marks it has.
class DeskPeriod {
  const DeskPeriod({
    required this.slotId,
    required this.date,
    required this.startsAt,
    required this.endsAt,
    required this.sectionId,
    required this.section,
    required this.subjectId,
    required this.subject,
    required this.teacherId,
    required this.teacher,
    this.substitute = false,
    this.batch,
    this.marked = 0,
  });

  factory DeskPeriod.fromJson(Map<String, dynamic> j) => DeskPeriod(
    slotId: _s(j['slotId']),
    date: _s(j['date']),
    startsAt: hhmm(j['startsAt']),
    endsAt: hhmm(j['endsAt']),
    sectionId: _s(j['sectionId']),
    section: _s(j['section']),
    subjectId: _s(j['subjectId']),
    subject: _s(j['subject']),
    teacherId: _s(j['teacherId']),
    teacher: _s(j['teacher']),
    substitute: j['substitute'] == true,
    batch: j['batch'] as String?,
    marked: _int(j['marked']),
  );

  final String slotId;

  /// "2026-10-14".
  final String date;
  final String startsAt;
  final String endsAt;
  final String sectionId;
  final String section;
  final String subjectId;
  final String subject;
  final String teacherId;
  final String teacher;
  final bool substitute;
  final String? batch;
  final int marked;

  /// As the period marking screen takes it.
  Period get period => Period(slotId: slotId, startsAt: ClockTime.parse(startsAt), endsAt: ClockTime.parse(endsAt), section: Ref(sectionId, section), subject: Ref(subjectId, subject), attendanceTaken: marked > 0);
}

/// A special (extra or remedial) class on a date.
class SpecialClassRow {
  const SpecialClassRow({required this.id, required this.kind, required this.startsAt, required this.endsAt, required this.subject, required this.teacher, required this.status, this.marked = 0});

  factory SpecialClassRow.fromJson(Map<String, dynamic> j) => SpecialClassRow(
    id: _s(j['id']),
    kind: _s(j['kind']),
    startsAt: hhmm(j['startsAt']),
    endsAt: hhmm(j['endsAt']),
    subject: _s(j['subject']),
    teacher: _s(j['teacher']),
    status: _s(j['status']),
    marked: _int(j['marked']),
  );

  final String id;

  /// `extra`, `remedial`, `makeup`… as the office names it.
  final String kind;
  final String startsAt;
  final String endsAt;
  final String subject;
  final String teacher;

  /// `scheduled`, `held` or `cancelled`.
  final String status;
  final int marked;
}

/// A class's day: its periods, its special classes, and whether it is a holiday.
class ClassDay {
  const ClassDay({required this.date, required this.sectionName, required this.periods, required this.special, this.holiday, this.strength = 0});

  factory ClassDay.fromJson(Map<String, dynamic> j) => ClassDay(
    date: _s(j['date']),
    sectionName: _s((j['section'] as Map?)?['name']),
    periods: [for (final p in _maps(j['periods'])) DeskPeriod.fromJson(p)],
    special: [for (final s in _maps(j['special'])) SpecialClassRow.fromJson(s)],
    holiday: j['holiday'] as String?,
    strength: _int(j['strength']),
  );

  final String date;
  final String sectionName;
  final List<DeskPeriod> periods;
  final List<SpecialClassRow> special;
  final String? holiday;
  final int strength;
}

/// Approved leave or on duty that covers a period: how the mark counts.
class LeaveCover {
  const LeaveCover({required this.kind, required this.countsAs});

  final String kind;
  final AttendanceStatus countsAs;
}

/// A student on a mark sheet with their mark (null: not marked) and any leave that stands.
class SheetRow {
  const SheetRow({required this.id, required this.fullName, required this.rollNo, this.status, this.leave});

  factory SheetRow.fromJson(Map<String, dynamic> j) {
    final leave = (j['leave'] as Map?)?.cast<String, dynamic>();
    return SheetRow(
      id: _s(j['id']),
      fullName: _s(j['fullName']),
      rollNo: _s(j['rollNo']),
      status: AttendanceStatus.values.asNameMap()[j['status']],
      leave: leave == null ? null : LeaveCover(kind: _s(leave['kind']), countsAs: AttendanceStatus.values.asNameMap()[leave['countsAs']] ?? AttendanceStatus.excused),
    );
  }

  final String id;
  final String fullName;
  final String rollNo;
  final AttendanceStatus? status;
  final LeaveCover? leave;
}

/// A special class's mark sheet.
class SpecialSheet {
  const SpecialSheet({required this.id, required this.subject, required this.section, required this.date, required this.startsAt, required this.endsAt, required this.roster, this.status = 'scheduled', this.future = false});

  factory SpecialSheet.fromJson(Map<String, dynamic> j) => SpecialSheet(
    id: _s(j['id']),
    subject: _s((j['subject'] as Map?)?['name']),
    section: _s((j['section'] as Map?)?['name']),
    date: _s(j['date']),
    startsAt: hhmm(j['startsAt']),
    endsAt: hhmm(j['endsAt']),
    status: _s(j['status']),
    future: j['future'] == true,
    roster: [for (final r in _maps(j['roster'])) SheetRow.fromJson(r)],
  );

  final String id;
  final String subject;
  final String section;
  final String date;
  final String startsAt;
  final String endsAt;
  final String status;

  /// The class is on a later day: it cannot be marked yet.
  final bool future;
  final List<SheetRow> roster;
}

/// A student's leave or on-duty request, as the approver sees it.
class StudentLeaveRow {
  const StudentLeaveRow({
    required this.id,
    required this.studentId,
    required this.fullName,
    required this.rollNo,
    required this.section,
    required this.kind,
    required this.fromDate,
    required this.toDate,
    required this.reason,
    required this.status,
    this.fromTime,
    this.toTime,
    this.activity = '',
    this.hasDocument = false,
    this.requestedBy = '',
  });

  factory StudentLeaveRow.fromJson(Map<String, dynamic> j) => StudentLeaveRow(
    id: _s(j['id']),
    studentId: _s(j['studentId']),
    fullName: _s(j['fullName']),
    rollNo: _s(j['rollNo']),
    section: _s(j['section']),
    kind: _s(j['kind']),
    fromDate: dayOf(j['fromDate']) ?? DateTime.now(),
    toDate: dayOf(j['toDate']) ?? DateTime.now(),
    fromTime: j['fromTime'] == null ? null : hhmm(j['fromTime']),
    toTime: j['toTime'] == null ? null : hhmm(j['toTime']),
    reason: _s(j['reason']),
    activity: _s(j['activity']),
    status: _s(j['status']),
    hasDocument: j['hasDocument'] == true,
    requestedBy: _s(j['requestedBy']),
  );

  final String id;
  final String studentId;
  final String fullName;
  final String rollNo;
  final String section;

  /// `on_duty`, `medical` or `personal`.
  final String kind;
  final DateTime fromDate;
  final DateTime toDate;
  final String? fromTime;
  final String? toTime;
  final String reason;
  final String activity;
  final String status;
  final bool hasDocument;

  /// Who applied (the student or a parent), by name.
  final String requestedBy;
}

// ── Indents ─────────────────────────────────────────────────────────────────────────────────────

/// A stock item that can be asked for.
class StockItem {
  const StockItem({required this.id, required this.name, required this.unit, this.sku = '', this.category = '', this.lastPricePaise = 0, this.onHand = 0, this.active = true});

  factory StockItem.fromJson(Map<String, dynamic> j) => StockItem(
    id: _s(j['id']),
    name: _s(j['name']),
    unit: _s(j['unit']),
    sku: _s(j['sku']),
    category: _s(j['category']),
    lastPricePaise: _int(j['lastPricePaise']),
    onHand: _int(j['onHand']),
    active: j['active'] != false,
  );

  final String id;
  final String name;
  final String unit;
  final String sku;
  final String category;
  final int lastPricePaise;
  final int onHand;
  final bool active;
}

/// One line of an indent.
class IndentLine {
  const IndentLine({required this.itemId, required this.item, required this.unit, required this.qty, this.estUnitPaise});

  factory IndentLine.fromJson(Map<String, dynamic> j) =>
      IndentLine(itemId: _s(j['itemId']), item: _s(j['item']), unit: _s(j['unit']), qty: _int(j['qty']), estUnitPaise: j['estUnitPaise'] == null ? null : _int(j['estUnitPaise']));

  final String itemId;
  final String item;
  final String unit;
  final int qty;
  final int? estUnitPaise;
}

/// An indent (requisition) and where it stands in the approval chain.
class Indent {
  const Indent({required this.id, required this.number, required this.status, required this.lines, this.reason = '', this.step, this.decisionNote, this.neededBy, this.createdAt, this.estimatedPaise = 0, this.department});

  factory Indent.fromJson(Map<String, dynamic> j) => Indent(
    id: _s(j['id']),
    number: _s(j['number']),
    status: _s(j['status']),
    reason: _s(j['reason']),
    step: j['step'] as String?,
    decisionNote: j['decisionNote'] as String?,
    neededBy: dayOf(j['neededBy']),
    createdAt: _time(j['createdAt']),
    estimatedPaise: _int(j['estimatedPaise']),
    department: j['department'] as String?,
    lines: [for (final l in _maps(j['lines'])) IndentLine.fromJson(l)],
  );

  final String id;
  final String number;

  /// `submitted`, `approved`, `rejected` or `ordered`.
  final String status;
  final String reason;

  /// The step waiting: `hod` or `principal`; null once decided.
  final String? step;
  final String? decisionNote;
  final DateTime? neededBy;
  final DateTime? createdAt;
  final int estimatedPaise;
  final String? department;
  final List<IndentLine> lines;
}

// ── Rooms and bookings ──────────────────────────────────────────────────────────────────────────

/// A room or hall that can be booked.
class BookableRoom {
  const BookableRoom({required this.id, required this.name, this.kind = '', this.capacity, this.facilities = ''});

  factory BookableRoom.fromJson(Map<String, dynamic> j) =>
      BookableRoom(id: _s(j['id']), name: _s(j['name']), kind: _s(j['kind']), capacity: j['capacity'] == null ? null : _int(j['capacity']), facilities: _s(j['facilities']));

  final String id;
  final String name;
  final String kind;
  final int? capacity;
  final String facilities;
}

/// Something that holds a room for a while: a booking or a timetabled class.
class RoomUse {
  const RoomUse({required this.startsAt, required this.endsAt, required this.title});

  final String startsAt;
  final String endsAt;
  final String title;
}

/// A room's day: what holds it, to pick a free time.
class RoomDay {
  const RoomDay({required this.date, required this.uses});

  factory RoomDay.fromJson(Map<String, dynamic> j) => RoomDay(
    date: _s(j['date']),
    uses: [
      for (final b in _maps(j['bookings'])) RoomUse(startsAt: hhmm(b['startsAt']), endsAt: hhmm(b['endsAt']), title: _s(b['title'])),
      for (final c in _maps(j['classes'])) RoomUse(startsAt: hhmm(c['startsAt']), endsAt: hhmm(c['endsAt']), title: '${_s(c['section'])} · ${_s(c['subject'])}'),
    ]..sort((a, b) => a.startsAt.compareTo(b.startsAt)),
  );

  final String date;
  final List<RoomUse> uses;
}

/// A booking of a room and where it stands.
class RoomBooking {
  const RoomBooking({required this.id, required this.number, required this.room, required this.title, required this.onDate, required this.startsAt, required this.endsAt, required this.status, this.purpose = '', this.attendees, this.decisionNote});

  factory RoomBooking.fromJson(Map<String, dynamic> j) => RoomBooking(
    id: _s(j['id']),
    number: _s(j['number']),
    room: _s(j['room']),
    title: _s(j['title']),
    purpose: _s(j['purpose']),
    attendees: j['attendees'] == null ? null : _int(j['attendees']),
    onDate: dayOf(j['onDate']) ?? DateTime.now(),
    startsAt: hhmm(j['startsAt']),
    endsAt: hhmm(j['endsAt']),
    status: _s(j['status']),
    decisionNote: j['decisionNote'] as String?,
  );

  final String id;
  final String number;
  final String room;
  final String title;
  final String purpose;
  final int? attendees;
  final DateTime onDate;
  final String startsAt;
  final String endsAt;

  /// `pending`, `approved`, `rejected` or `cancelled`.
  final String status;
  final String? decisionNote;
}

// ── Interview panels ────────────────────────────────────────────────────────────────────────────

/// An interview where the teacher sits on the panel.
class PanelInterview {
  const PanelInterview({required this.id, required this.applicant, required this.opening, required this.round, required this.scheduledAt, required this.status, required this.scoredByMe, this.kind = '', this.venue = '', this.mode = ''});

  factory PanelInterview.fromJson(Map<String, dynamic> j) => PanelInterview(
    id: _s(j['id']),
    applicant: _s(j['applicant']),
    opening: _s(j['opening']),
    round: _int(j['round']),
    kind: _s(j['kind']),
    scheduledAt: _time(j['scheduledAt']) ?? DateTime.now(),
    venue: _s(j['venue']),
    mode: _s(j['mode']),
    status: _s(j['status']),
    scoredByMe: j['scoredByMe'] == true,
  );

  final String id;
  final String applicant;
  final String opening;
  final int round;
  final String kind;
  final DateTime scheduledAt;
  final String venue;
  final String mode;

  /// `scheduled`, `completed` or `cancelled`.
  final String status;
  final bool scoredByMe;
}

/// One panelist's scores.
class PanelScore {
  const PanelScore({required this.panelistId, required this.panelist, required this.scores, required this.total, required this.recommendation, this.remarks = ''});

  factory PanelScore.fromJson(Map<String, dynamic> j) => PanelScore(
    panelistId: _s(j['panelistId']),
    panelist: _s(j['panelist']),
    scores: {for (final e in ((j['scores'] as Map?) ?? const {}).entries) '${e.key}': _dbl(e.value) ?? 0},
    total: _dbl(j['total']) ?? 0,
    recommendation: _s(j['recommendation']),
    remarks: _s(j['remarks']),
  );

  final String panelistId;
  final String panelist;
  final Map<String, double> scores;

  /// Out of 100.
  final double total;

  /// `select`, `hold` or `reject`.
  final String recommendation;
  final String remarks;
}

/// The panel's scores for an interview: the criteria, who has scored, and the average.
class InterviewScores {
  const InterviewScores({required this.criteria, required this.panel, required this.scores, this.average});

  factory InterviewScores.fromJson(Map<String, dynamic> j) => InterviewScores(
    criteria: [for (final c in (j['criteria'] as List? ?? const [])) '$c'],
    panel: [for (final p in _maps(j['panel'])) (id: _s(p['id']), fullName: _s(p['fullName']), scored: p['scored'] == true)],
    scores: [for (final s in _maps(j['scores'])) PanelScore.fromJson(s)],
    average: _dbl(j['average']),
  );

  final List<String> criteria;
  final List<({String id, String fullName, bool scored})> panel;
  final List<PanelScore> scores;
  final double? average;
}

/// A colleague who can approve in the teacher's place while they are on leave.
class Colleague {
  const Colleague({required this.id, required this.fullName});

  factory Colleague.fromJson(Map<String, dynamic> j) => Colleague(id: _s(j['id']), fullName: _s(j['fullName']));

  final String id;
  final String fullName;
}
