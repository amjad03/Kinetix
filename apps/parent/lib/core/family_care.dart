/// What the family looks after for a child, as the Cloud API sends it: out-passes waiting for the
/// family's approval (`GET /v1/hostel/gate-passes/for-family`), sick-bay stays (in `GET /v1/hostel/students/:id`),
/// attendance by subject under the rules (`GET /v1/attendance-desk/students/:id`), the mentor and
/// the session summaries (`GET /v1/mentoring/family/:id`), and the hand-over code at the bus stop.
library;

import 'models.dart';

int _int(Object? v) => (v as num?)?.round() ?? 0;
double? _dbl(Object? v) => v is num ? v.toDouble() : (v is String ? double.tryParse(v) : null);
String _s(Object? v) => v == null ? '' : '$v';
DateTime? _time(Object? v) => v == null ? null : DateTime.tryParse('$v')?.toLocal();
DateTime? _day(Object? v) {
  if (v == null) return null;
  final t = '$v';
  final d = DateTime.tryParse(t.length >= 10 ? t.substring(0, 10) : t);
  return d == null ? null : DateTime(d.year, d.month, d.day);
}

List<Map<String, dynamic>> _maps(Object? v) => [for (final x in (v as List? ?? const [])) (x as Map).cast<String, dynamic>()];

/// An out-pass the child asked for that waits for the family before it goes to the warden.
class FamilyOutPass {
  const FamilyOutPass({required this.id, required this.studentId, required this.studentName, required this.reason, required this.destination, required this.expectedBackAt, this.createdAt});

  /// The server sends `{pass: {...}, studentName}`.
  factory FamilyOutPass.fromJson(Map<String, dynamic> j) {
    final p = (j['pass'] as Map?)?.cast<String, dynamic>() ?? j;
    return FamilyOutPass(
      id: _s(p['id']),
      studentId: _s(p['studentId']),
      studentName: _s(j['studentName']),
      reason: _s(p['reason']),
      destination: _s(p['destination']),
      expectedBackAt: _time(p['expectedBackAt']) ?? DateTime.now(),
      createdAt: _time(p['createdAt']),
    );
  }

  final String id;
  final String studentId;
  final String studentName;
  final String reason;
  final String destination;
  final DateTime expectedBackAt;
  final DateTime? createdAt;
}

/// A stay in the hostel sick bay; [dischargedAt] is null while the child is still there.
class SickbayStay {
  const SickbayStay({required this.id, required this.admittedAt, required this.symptoms, this.dischargedAt, this.treatment = '', this.referredTo = ''});

  factory SickbayStay.fromJson(Map<String, dynamic> j) => SickbayStay(
    id: _s(j['id']),
    admittedAt: _time(j['admittedAt']) ?? DateTime.now(),
    dischargedAt: _time(j['dischargedAt']),
    symptoms: _s(j['symptoms']),
    treatment: _s(j['treatment']),
    referredTo: _s(j['referredTo']),
  );

  final String id;
  final DateTime admittedAt;
  final DateTime? dischargedAt;
  final String symptoms;
  final String treatment;
  final String referredTo;

  bool get current => dischargedAt == null;
}

/// Classes held and attended in a subject (or overall), the percentage, and after condonation.
class AttendanceTally {
  const AttendanceTally({required this.held, required this.attended, this.pct, this.effective, this.condoned = 0});

  factory AttendanceTally.fromJson(Map<String, dynamic>? j) =>
      AttendanceTally(held: _int(j?['held']), attended: _int(j?['attended']), pct: _dbl(j?['pct']), effective: _dbl(j?['effective']), condoned: _int(j?['condoned']));

  final int held;
  final int attended;
  final double? pct;
  final double? effective;
  final int condoned;

  /// The percentage counted for eligibility (condonation added).
  double? get counted => effective ?? pct;

  /// How many classes in a row must be attended to reach [threshold]% (0 when already there).
  int classesToReach(double threshold) {
    if (held == 0 || threshold >= 100) return 0;
    final need = ((threshold / 100) * held - attended) / (1 - threshold / 100);
    return need <= 0 ? 0 : need.ceil();
  }
}

class SubjectAttendance extends AttendanceTally {
  const SubjectAttendance({required this.subjectId, required this.subject, required this.code, required this.short, required super.held, required super.attended, super.pct, super.effective, super.condoned});

  factory SubjectAttendance.fromJson(Map<String, dynamic> j) {
    final t = AttendanceTally.fromJson(j);
    return SubjectAttendance(subjectId: _s(j['subjectId']), subject: _s(j['subject']), code: _s(j['code']), short: j['short'] == true, held: t.held, attended: t.attended, pct: t.pct, effective: t.effective, condoned: t.condoned);
  }

  final String subjectId;
  final String subject;
  final String code;
  final bool short;
}

/// The minimum attendance for the child's class and who sets it (the affiliating university or board).
class AttendancePolicyView {
  const AttendancePolicyView({required this.thresholdPct, required this.warnPct, required this.basis, this.profile});

  factory AttendancePolicyView.fromJson(Map<String, dynamic>? j) => AttendancePolicyView(
    thresholdPct: _dbl(j?['thresholdPct']) ?? 75,
    warnPct: _dbl(j?['warnPct']) ?? 80,
    basis: _s(j?['basis'] ?? 'overall'),
    profile: j?['profile'] is Map ? _s((j!['profile'] as Map)['name']) : null,
  );

  final double thresholdPct;
  final double warnPct;
  final String basis;
  final String? profile;

  bool get perSubject => basis == 'per_subject';
}

/// A day's leave or on duty request for the child, as the attendance view lists it.
class ChildLeave {
  const ChildLeave({required this.id, required this.kind, required this.fromDate, required this.toDate, required this.status, this.reason = ''});

  factory ChildLeave.fromJson(Map<String, dynamic> j) =>
      ChildLeave(id: _s(j['id']), kind: _s(j['kind']), fromDate: _day(j['fromDate']) ?? DateTime.now(), toDate: _day(j['toDate']) ?? DateTime.now(), status: _s(j['status']), reason: _s(j['reason']));

  final String id;
  final String kind;
  final DateTime fromDate;
  final DateTime toDate;
  final String status;
  final String reason;
}

/// The child's attendance by subject and overall under the rules.
class AttendanceOverview {
  const AttendanceOverview({required this.policy, required this.overall, required this.subjects, required this.status, required this.warning, this.windowLabel = '', this.leaves = const []});

  factory AttendanceOverview.fromJson(Map<String, dynamic> j) => AttendanceOverview(
    policy: AttendancePolicyView.fromJson((j['policy'] as Map?)?.cast<String, dynamic>()),
    windowLabel: _s((j['window'] as Map?)?['label']),
    overall: AttendanceTally.fromJson((j['overall'] as Map?)?.cast<String, dynamic>()),
    subjects: [for (final s in _maps(j['subjects'])) SubjectAttendance.fromJson(s)],
    status: _s(j['status']),
    warning: j['warning'] == true,
    leaves: [for (final l in _maps(j['leaves'])) ChildLeave.fromJson(l)],
  );

  final AttendancePolicyView policy;
  final String windowLabel;
  final AttendanceTally overall;
  final List<SubjectAttendance> subjects;

  /// `eligible`, `condonable` or `detained`.
  final String status;
  final bool warning;
  final List<ChildLeave> leaves;
}

/// A mentoring session as the family sees it: the summary, never the mentor's private notes.
class MentoringSession {
  const MentoringSession({required this.heldOn, this.mode = '', this.summary = '', this.followUpOn});

  factory MentoringSession.fromJson(Map<String, dynamic> j) =>
      MentoringSession(heldOn: _day(j['heldOn']) ?? DateTime.now(), mode: _s(j['mode']), summary: _s(j['summary']), followUpOn: _day(j['followUpOn']));

  final DateTime heldOn;

  /// `in_person`, `phone`, `online` or empty.
  final String mode;
  final String summary;
  final DateTime? followUpOn;
}

/// The child's mentor and the sessions so far.
class MentoringView {
  const MentoringView({this.mentorName, this.startedOn, this.sessions = const []});

  factory MentoringView.fromJson(Map<String, dynamic> j) {
    final m = (j['mentor'] as Map?)?.cast<String, dynamic>();
    return MentoringView(mentorName: m?['mentorName'] as String?, startedOn: _day(m?['startedOn']), sessions: [for (final s in _maps(j['sessions'])) MentoringSession.fromJson(s)]);
  }

  final String? mentorName;
  final DateTime? startedOn;
  final List<MentoringSession> sessions;
}

/// The six-digit code the family reads out to the bus staff when receiving the child at the stop,
/// from the transport notification that carries it.
class HandoverCode {
  const HandoverCode({required this.code, required this.studentId, required this.expiresAt, required this.title});

  /// The code in a transport notification, or null when it carries none.
  static HandoverCode? of(AppNotification n) {
    final code = n.data['otp'];
    final expires = n.data['expiresAt'];
    if (n.kind != NotificationKind.transport || code is! String || !RegExp(r'^\d{6}$').hasMatch(code)) return null;
    return HandoverCode(code: code, studentId: _s(n.data['studentId']), expiresAt: _time(expires) ?? n.createdAt.add(const Duration(minutes: 30)), title: n.title);
  }

  final String code;
  final String studentId;
  final DateTime expiresAt;
  final String title;

  bool live(DateTime now) => now.isBefore(expiresAt);
}
