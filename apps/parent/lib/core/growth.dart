/// Contracts for the guardian's data rights (DPDP) and a child's report cards and promotion.
library;

String _s(Object? v) => v == null ? '' : '$v';
double _d(Object? v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
List<Map<String, dynamic>> _list(Object? v) => [for (final e in (v as List? ?? const [])) (e as Map).cast<String, dynamic>()];

/// The grievance officer to write to about personal data (`GET /v1/dpdp/grievance-officer`).
class DpdpOfficer {
  const DpdpOfficer({this.name, this.email, this.phone, required this.response});

  factory DpdpOfficer.fromJson(Map<String, dynamic> j) {
    final o = j['officer'] as Map?;
    return DpdpOfficer(name: o?['name'] as String?, email: o?['email'] as String?, phone: o?['phone'] as String?, response: _s(j['response']));
  }

  final String? name, email, phone;
  final String response;
  bool get named => name != null;
}

/// A correction or erasure request and where it stands (`/v1/dpdp/me/requests`).
class DpdpRequest {
  const DpdpRequest({required this.id, required this.kind, required this.status, required this.details, this.resolutionNote, this.retentionReasons = const []});

  factory DpdpRequest.fromJson(Map<String, dynamic> j) => DpdpRequest(
    id: _s(j['id']),
    kind: _s(j['kind']),
    status: _s(j['status']),
    details: _s(j['details']),
    resolutionNote: j['resolutionNote'] as String?,
    retentionReasons: [for (final r in (j['retentionNotice'] ?? j['retentionReasons'] ?? const []) as List) '$r'],
  );

  final String id, kind, status, details;
  final String? resolutionNote;

  /// Why erasure may be refused (records the school must keep by law), one line each.
  final List<String> retentionReasons;
}

/// How many records of each kind are held about me and my children (the sections of the JSON export).
class DataExport {
  const DataExport(this.sections);

  factory DataExport.fromJson(Map<String, dynamic> j) => DataExport({
    for (final e in j.entries)
      if (e.value is List) e.key: (e.value as List).length else if (e.value is Map && (e.value as Map).isNotEmpty) e.key: 1,
  });

  final Map<String, int> sections;
}

/// One term's report card in a list (`GET /v1/school/report-cards?studentId=`).
class ReportCardRow {
  const ReportCardRow({required this.id, required this.termLabel, required this.promotionStatus});

  factory ReportCardRow.fromJson(Map<String, dynamic> j) => ReportCardRow(id: _s(j['id']), termLabel: _s(j['termLabel']), promotionStatus: _s(j['promotionStatus']));

  final String id, termLabel;

  /// `pending`, `promoted`, `promoted_with_grace` or `detained`.
  final String promotionStatus;
}

class ReportLine {
  const ReportLine({required this.subject, required this.marks, required this.maxMarks, required this.grade, required this.remark});

  final String subject, grade, remark;
  final double marks, maxMarks;
}

/// A full report card (`GET /v1/school/report-cards/:id`).
class ReportCardDetail {
  const ReportCardDetail({
    required this.termLabel,
    required this.remarks,
    required this.behaviourGrade,
    required this.promotionStatus,
    required this.promotedTo,
    required this.lines,
    required this.coCurricular,
    required this.attendancePercent,
    this.attendancePresent,
    this.attendanceTotal,
  });

  factory ReportCardDetail.fromJson(Map<String, dynamic> j) => ReportCardDetail(
    termLabel: _s(j['termLabel']),
    remarks: _s(j['remarks']),
    behaviourGrade: j['behaviourGrade'] as String?,
    promotionStatus: _s(j['promotionStatus']),
    promotedTo: j['promotedTo'] as String?,
    lines: [for (final l in _list(j['lines'])) ReportLine(subject: _s(l['subjectName']), marks: _d(l['marks']), maxMarks: _d(l['maxMarks']), grade: _s(l['grade']), remark: _s(l['remark']))],
    coCurricular: [for (final c in _list(j['coCurricular'])) (activity: _s(c['activity']), grade: _s(c['grade']), remark: _s(c['remark']))],
    attendancePercent: (j['attendance'] as Map?)?['percent'] == null ? null : _d((j['attendance'] as Map)['percent']),
    attendancePresent: (j['attendance'] as Map?)?['present'] == null ? null : _d((j['attendance'] as Map)['present']).round(),
    attendanceTotal: (j['attendance'] as Map?)?['total'] == null ? null : _d((j['attendance'] as Map)['total']).round(),
  );

  final String termLabel, remarks, promotionStatus;
  final String? behaviourGrade, promotedTo;
  final List<ReportLine> lines;
  final List<({String activity, String grade, String remark})> coCurricular;
  final double? attendancePercent;

  /// Days present and days marked in the school year so far (from `attendance.present` / `attendance.total`).
  final int? attendancePresent, attendanceTotal;
}
