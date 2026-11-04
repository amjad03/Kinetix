/// The institution's policies that apply to the student (code of conduct, anti-ragging, prevention of sexual
/// harassment) or are public, from GET /v1/governance/policies/me/list, with each version's text and the
/// student's acknowledgement (POST versions/:id/acknowledge).
library;

String _s(Object? v) => v == null ? '' : '$v';

class MyPolicy {
  const MyPolicy({required this.versionId, required this.title, required this.version, required this.mustAcknowledge, required this.pending, this.acknowledgedAt});

  final String versionId;
  final String title;
  final int version;
  final bool mustAcknowledge;
  final bool pending;
  final DateTime? acknowledgedAt;

  factory MyPolicy.fromJson(Map<String, dynamic> j) => MyPolicy(
    versionId: _s(j['versionId']),
    title: _s(j['title']),
    version: (j['version'] as num?)?.toInt() ?? 1,
    mustAcknowledge: j['mustAcknowledge'] == true,
    pending: j['pending'] == true,
    acknowledgedAt: j['acknowledgedAt'] == null ? null : DateTime.tryParse('${j['acknowledgedAt']}'),
  );
}

class PolicyText {
  const PolicyText({required this.title, required this.version, required this.body, required this.mustAcknowledge, this.acknowledgedAt});

  final String title;
  final int version;
  final String body;
  final bool mustAcknowledge;
  final DateTime? acknowledgedAt;

  factory PolicyText.fromJson(Map<String, dynamic> j) => PolicyText(
    title: _s(j['title']),
    version: (j['version'] as num?)?.toInt() ?? 1,
    body: _s(j['body']),
    mustAcknowledge: j['mustAcknowledge'] == true,
    acknowledgedAt: j['acknowledgedAt'] == null ? null : DateTime.tryParse('${j['acknowledgedAt']}'),
  );
}
