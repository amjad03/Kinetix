/// Contracts of the governance endpoints a member of staff uses: the policies that apply to them
/// (GET /v1/governance/policies/me/list, versions/:id/text, versions/:id/acknowledge) and their
/// committee work (GET /v1/governance/committees/me/summary, meetings/:id, meetings/:id/sign,
/// action-items/:id/report). Dates are YYYY-MM-DD.
library;

String _s(Object? v) => v == null ? '' : '$v';
List<Map<String, dynamic>> _list(Object? v) => [for (final e in (v as List? ?? const [])) e as Map<String, dynamic>];

/// A published policy that applies to me (by my role), or a public one for information.
class MyPolicy {
  const MyPolicy({required this.versionId, required this.code, required this.title, required this.version, required this.mustAcknowledge, required this.pending, this.effectiveFrom, this.acknowledgedAt});

  final String versionId;
  final String code;
  final String title;
  final int version;
  final String? effectiveFrom;
  final bool mustAcknowledge;
  final bool pending;
  final DateTime? acknowledgedAt;

  factory MyPolicy.fromJson(Map<String, dynamic> j) => MyPolicy(
    versionId: _s(j['versionId']),
    code: _s(j['code']),
    title: _s(j['title']),
    version: (j['version'] as num?)?.toInt() ?? 1,
    effectiveFrom: j['effectiveFrom'] as String?,
    mustAcknowledge: j['mustAcknowledge'] == true,
    pending: j['pending'] == true,
    acknowledgedAt: j['acknowledgedAt'] == null ? null : DateTime.tryParse('${j['acknowledgedAt']}'),
  );
}

/// The text of one version, as approved (with its fingerprint).
class PolicyText {
  const PolicyText({required this.title, required this.version, required this.body, required this.mustAcknowledge, this.fingerprint, this.acknowledgedAt});

  final String title;
  final int version;
  final String body;
  final String? fingerprint;
  final bool mustAcknowledge;
  final DateTime? acknowledgedAt;

  factory PolicyText.fromJson(Map<String, dynamic> j) => PolicyText(
    title: _s(j['title']),
    version: (j['version'] as num?)?.toInt() ?? 1,
    body: _s(j['body']),
    fingerprint: j['fingerprint'] as String?,
    mustAcknowledge: j['mustAcknowledge'] == true,
    acknowledgedAt: j['acknowledgedAt'] == null ? null : DateTime.tryParse('${j['acknowledgedAt']}'),
  );
}

class MinutesToSign {
  const MinutesToSign({required this.meetingId, required this.title, required this.meetingOn, required this.committee});

  final String meetingId;
  final String title;
  final String meetingOn;
  final String committee;

  factory MinutesToSign.fromJson(Map<String, dynamic> j) => MinutesToSign(meetingId: _s(j['meetingId']), title: _s(j['title']), meetingOn: _s(j['meetingOn']), committee: _s(j['committee']));
}

class CommitteeAction {
  const CommitteeAction({required this.id, required this.title, required this.dueOn, required this.status, required this.committee, required this.overdue, this.actionTaken = ''});

  final String id;
  final String title;
  final String dueOn;
  final String status;
  final String committee;
  final bool overdue;
  final String actionTaken;

  factory CommitteeAction.fromJson(Map<String, dynamic> j) => CommitteeAction(
    id: _s(j['id']),
    title: _s(j['title']),
    dueOn: _s(j['dueOn']),
    status: _s(j['status']),
    committee: _s(j['committee']),
    overdue: j['overdue'] == true,
    actionTaken: _s(j['actionTaken']),
  );
}

/// My committees, minutes waiting for my signature, upcoming meetings and my open actions.
class MyGovernance {
  const MyGovernance({this.committees = const [], this.toSign = const [], this.actions = const [], this.upcoming = const []});

  final List<({String name, String role})> committees;
  final List<MinutesToSign> toSign;
  final List<CommitteeAction> actions;
  final List<({String title, String meetingOn, String committee})> upcoming;

  factory MyGovernance.fromJson(Map<String, dynamic> j) => MyGovernance(
    committees: [for (final c in _list(j['committees'])) (name: _s(c['name']), role: _s(c['role']))],
    toSign: [for (final m in _list(j['toSign'])) MinutesToSign.fromJson(m)],
    actions: [for (final a in _list(j['actions'])) CommitteeAction.fromJson(a)],
    upcoming: [for (final m in _list(j['upcoming'])) (title: _s(m['title']), meetingOn: _s(m['meetingOn']), committee: _s(m['committee']))],
  );
}

/// The minutes as circulated: what the meeting resolved, and whether I can still sign.
class MeetingMinutes {
  const MeetingMinutes({required this.id, required this.title, required this.meetingOn, required this.committee, required this.minutes, required this.items, required this.canSign, this.fingerprint});

  final String id;
  final String title;
  final String meetingOn;
  final String committee;
  final String minutes;
  final List<({int seq, String title, String resolution})> items;
  final bool canSign;
  final String? fingerprint;

  factory MeetingMinutes.fromJson(Map<String, dynamic> j) => MeetingMinutes(
    id: _s(j['id']),
    title: _s(j['title']),
    meetingOn: _s(j['meetingOn']),
    committee: _s((j['committee'] as Map<String, dynamic>?)?['name']),
    minutes: _s(j['minutes']),
    items: [for (final a in _list(j['agenda'])) (seq: (a['seq'] as num?)?.toInt() ?? 0, title: _s(a['title']), resolution: _s(a['resolution']))],
    canSign: j['canSign'] == true,
    fingerprint: j['minutesHash'] as String?,
  );
}
