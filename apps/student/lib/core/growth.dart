/// Contracts for the student's data rights (DPDP), house points and homework peer review.
library;

String _s(Object? v) => v == null ? '' : '$v';
int _i(Object? v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
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

/// How many records of each kind are held about me (the sections of the JSON export).
class DataExport {
  const DataExport(this.sections);

  factory DataExport.fromJson(Map<String, dynamic> j) => DataExport({
    for (final e in j.entries)
      if (e.value is List) e.key: (e.value as List).length else if (e.value is Map && (e.value as Map).isNotEmpty) e.key: 1,
  });

  final Map<String, int> sections;
}

class HouseRow {
  const HouseRow({required this.id, required this.name, required this.colour, required this.motto, required this.members, required this.points, required this.rank});

  factory HouseRow.fromJson(Map<String, dynamic> j) =>
      HouseRow(id: _s(j['id']), name: _s(j['name']), colour: _s(j['colour']), motto: _s(j['motto']), members: _i(j['members']), points: _i(j['points']), rank: _i(j['rank']));

  final String id, name, colour, motto;
  final int members, points, rank;
}

class HouseMember {
  const HouseMember({required this.studentId, required this.name, required this.points, required this.isCaptain});

  final String studentId, name;
  final int points;
  final bool isCaptain;
}

class HousePointEntry {
  const HousePointEntry({required this.points, required this.reason, required this.category, required this.awardedOn});

  final int points;
  final String reason, category, awardedOn;
}

/// One house with its members and recent points (`GET /v1/houses/:id`).
class HouseDetail {
  const HouseDetail({required this.name, required this.motto, required this.members, required this.ledger, required this.total});

  factory HouseDetail.fromJson(Map<String, dynamic> j) {
    final h = (j['house'] as Map).cast<String, dynamic>();
    return HouseDetail(
      name: _s(h['name']),
      motto: _s(h['motto']),
      members: [for (final m in _list(j['members'])) HouseMember(studentId: _s(m['studentId']), name: _s(m['name']), points: _i(m['points']), isCaptain: m['isCaptain'] == true)],
      ledger: [
        for (final p in _list(j['ledger']))
          HousePointEntry(points: _i(p['points']), reason: _s(p['reason']), category: _s(p['category']), awardedOn: _s(p['awardedOn']).split('T').first),
      ],
      total: _i(j['total']),
    );
  }

  final String name, motto;
  final List<HouseMember> members;
  final List<HousePointEntry> ledger;
  final int total;
}

/// A classmate's work given to me to review, without the author's name (`GET .../peer-review/mine`).
class PeerReviewTask {
  const PeerReviewTask({required this.id, required this.label, required this.text, required this.fileCount, required this.done, this.clarity, this.accuracy, this.effort, this.comment});

  factory PeerReviewTask.fromJson(Map<String, dynamic> j) {
    final r = j['rubric'] as Map?;
    return PeerReviewTask(
      id: _s(j['id']),
      label: _s(j['label']),
      text: _s(j['text']),
      fileCount: _i(j['fileCount']),
      done: j['done'] == true,
      clarity: r == null ? null : _i(r['clarity']),
      accuracy: r == null ? null : _i(r['accuracy']),
      effort: r == null ? null : _i(r['effort']),
      comment: j['comment'] as String?,
    );
  }

  final String id, label, text;
  final int fileCount;
  final bool done;
  final int? clarity, accuracy, effort;
  final String? comment;
}

/// What classmates said about my work (`GET .../peer-review/received`).
class PeerFeedback {
  const PeerFeedback({required this.pending, required this.average, required this.reviews});

  factory PeerFeedback.fromJson(Map<String, dynamic> j) => PeerFeedback(
    pending: _i(j['pending']),
    average: j['average'] == null ? null : _d(j['average']),
    reviews: [
      for (final r in _list(j['reviews']))
        (clarity: _i((r['rubric'] as Map)['clarity']), accuracy: _i((r['rubric'] as Map)['accuracy']), effort: _i((r['rubric'] as Map)['effort']), total: _i(r['total']), comment: _s(r['comment'])),
    ],
  );

  final int pending;
  final double? average;
  final List<({int clarity, int accuracy, int effort, int total, String comment})> reviews;
}
