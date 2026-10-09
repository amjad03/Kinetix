/// What the school shows parents, and a child's activities and behaviour, as the Cloud API sends
/// them (services/api src/parent/parent-extras.controller.ts and welfare/welfare-extras.controller.ts).
library;

DateTime _at(Object? v) => DateTime.parse(v as String).toLocal();
num _n(Object? v) => v is num ? v : num.tryParse('$v') ?? 0;
List<String> _strings(Object? v) => [for (final s in (v as List? ?? const [])) '$s'];
List<T> _list<T>(Object? v, T Function(Map<String, dynamic>) f) => [for (final x in (v as List? ?? const [])) f((x as Map).cast<String, dynamic>())];
String _s(Object? v) => v == null ? '' : '$v';

/// Which sections the school shows parents (`GET /v1/parent/visibility`): `attendance`, `diary`,
/// `report_card`, `behaviour`, `activities`, `health`. A section the server does not name is shown.
class ParentVisibility {
  const ParentVisibility([this._sections = const {}]);

  factory ParentVisibility.fromJson(Map<String, dynamic> j) => ParentVisibility({
    for (final e in j.entries)
      if (e.value is bool) e.key: e.value as bool,
  });

  final Map<String, bool> _sections;

  bool allows(String section) => _sections[section] ?? true;
}

/// A club the child belongs to, with posts held and points earned.
class ClubRole {
  const ClubRole({required this.club, required this.category, required this.role, required this.posts, required this.points, required this.activities});

  factory ClubRole.fromJson(Map<String, dynamic> j) => ClubRole(
    club: _s(j['club']),
    category: _s(j['category']),
    role: j['role'] as String? ?? 'member',
    posts: _strings(j['posts']),
    points: _n(j['points']).toInt(),
    activities: _n(j['activities']).toInt(),
  );

  final String club, category, role;
  final List<String> posts;
  final int points, activities;
}

/// A house point awarded (or taken back), shown as a recognition.
class HouseRecognition {
  const HouseRecognition({required this.points, required this.category, required this.reason, required this.awardedOn});

  factory HouseRecognition.fromJson(Map<String, dynamic> j) =>
      HouseRecognition(points: _n(j['points']).toInt(), category: _s(j['category']), reason: _s(j['reason']), awardedOn: _s(j['awardedOn']));

  final int points;
  final String category, reason, awardedOn;
}

/// What a child has taken part in (`GET /v1/parent/children/:id/activities`).
class ChildActivities {
  const ChildActivities({
    required this.clubs,
    required this.events,
    this.houseName,
    this.houseCaptain = false,
    this.housePoints = 0,
    required this.recognitions,
    this.coCurricularTerm,
    required this.grades,
    required this.achievements,
  });

  factory ChildActivities.fromJson(Map<String, dynamic> j) {
    final house = j['house'] as Map?;
    final co = j['coCurricular'] as Map?;
    return ChildActivities(
      clubs: _list(j['clubs'], ClubRole.fromJson),
      events: _list(j['events'], (e) => (title: _s(e['title']), type: _s(e['eventType']), on: _s(e['on']))),
      houseName: house?['name'] as String?,
      houseCaptain: house?['isCaptain'] as bool? ?? false,
      housePoints: _n(house?['totalPoints']).toInt(),
      recognitions: _list(j['recognitions'], HouseRecognition.fromJson),
      coCurricularTerm: co?['term'] as String?,
      grades: _list(co?['grades'], (g) => (activity: _s(g['activity']), grade: _s(g['grade']), remark: _s(g['remark']))),
      achievements: _list(j['achievements'], (a) => (club: _s(a['club']), title: _s(a['title']), level: _s(a['level']), position: _s(a['position']), on: _s(a['achievedOn']))),
    );
  }

  final List<ClubRole> clubs;
  final List<({String title, String type, String on})> events;

  /// The child's house, or null when none.
  final String? houseName;
  final bool houseCaptain;
  final int housePoints;
  final List<HouseRecognition> recognitions;
  final String? coCurricularTerm;
  final List<({String activity, String grade, String remark})> grades;
  final List<({String club, String title, String level, String position, String on})> achievements;

  bool get isEmpty => clubs.isEmpty && events.isEmpty && houseName == null && recognitions.isEmpty && grades.isEmpty && achievements.isEmpty;
}

/// An action the school took on an incident.
class IncidentAction {
  const IncidentAction({required this.action, required this.detail, this.startsOn, this.endsOn, required this.status});

  factory IncidentAction.fromJson(Map<String, dynamic> j) =>
      IncidentAction(action: _s(j['action']), detail: _s(j['detail']), startsOn: j['startsOn'] as String?, endsOn: j['endsOn'] as String?, status: j['status'] as String? ?? 'active');

  final String action, detail;

  /// `active`, `revoked` or `reduced`.
  final String status;
  final String? startsOn, endsOn;
}

/// One incident in the child's behaviour record, with the actions taken (never who reported it).
class BehaviourIncident {
  const BehaviourIncident({required this.id, required this.on, required this.kind, required this.severity, required this.description, required this.status, required this.actions});

  factory BehaviourIncident.fromJson(Map<String, dynamic> j) => BehaviourIncident(
    id: _s(j['id']),
    on: _s(j['incidentOn']),
    kind: _s(j['kind']),
    severity: j['severity'] as String? ?? 'minor',
    description: _s(j['description']),
    status: j['status'] as String? ?? 'reported',
    actions: _list(j['actions'], IncidentAction.fromJson),
  );

  final String id, on, kind, description;

  /// `minor`, `major` or `severe`.
  final String severity;

  /// `reported`, `under_review`, `action_taken`, `appealed` or `closed`.
  final String status;
  final List<IncidentAction> actions;
}

/// The child's behaviour record (`GET /v1/parent/children/:id/behaviour`).
class ChildBehaviour {
  const ChildBehaviour({this.behaviourGrade, this.term, required this.incidents, required this.recognitions});

  factory ChildBehaviour.fromJson(Map<String, dynamic> j) => ChildBehaviour(
    behaviourGrade: j['behaviourGrade'] as String?,
    term: j['term'] as String?,
    incidents: _list(j['incidents'], BehaviourIncident.fromJson),
    recognitions: _list(j['recognitions'], HouseRecognition.fromJson),
  );

  /// The grade on the latest report card; null before one is written.
  final String? behaviourGrade, term;
  final List<BehaviourIncident> incidents;
  final List<HouseRecognition> recognitions;
}

/// A note the school sent the parent about an incident (`GET /v1/discipline/my-notices`).
class SchoolNotice {
  const SchoolNotice({
    required this.id,
    required this.method,
    required this.summary,
    this.meetingOn,
    this.acknowledgedAt,
    required this.kind,
    required this.severity,
    required this.incidentOn,
    required this.studentId,
    required this.studentName,
  });

  factory SchoolNotice.fromJson(Map<String, dynamic> j) => SchoolNotice(
    id: _s(j['id']),
    method: j['method'] as String? ?? 'message',
    summary: _s(j['summary']),
    meetingOn: j['meetingOn'] as String?,
    acknowledgedAt: j['acknowledgedAt'] == null ? null : _at(j['acknowledgedAt']),
    kind: _s(j['kind']),
    severity: j['severity'] as String? ?? 'minor',
    incidentOn: _s(j['incidentOn']),
    studentId: _s(j['studentId']),
    studentName: _s(j['studentName']),
  );

  final String id, summary, kind, incidentOn, studentId, studentName;

  /// `message`, `call`, `meeting` or `letter`.
  final String method;
  final String severity;
  final String? meetingOn;
  final DateTime? acknowledgedAt;

  bool get acknowledged => acknowledgedAt != null;
}
