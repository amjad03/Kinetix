/// The student's own placement dashboard, as `GET /v1/placements/students/:id/dashboard` sends it
/// (services/api src/placements/placement-pass.controller.ts): where they stand, every registration with its
/// rounds and interview slots, offers, training, internship credits, apprenticeships and referrals.
library;

double? _d(Object? v) => (v as num?)?.toDouble();
int _i(Object? v) => (v as num?)?.toInt() ?? 0;
List<Map<String, dynamic>> _list(Object? v) => [for (final x in (v as List? ?? const [])) (x as Map).cast<String, dynamic>()];

class PlacementStanding {
  PlacementStanding({
    this.cgpa,
    required this.backlogs,
    required this.backlogHistory,
    this.tenthPct,
    this.twelfthPct,
    this.gapYears,
    this.batchYear,
    this.optedIn,
    this.debarredUntil,
    this.placedCategory,
    required this.docsVerified,
    required this.documents,
  });

  factory PlacementStanding.fromJson(Map<String, dynamic> j) => PlacementStanding(
    cgpa: _d(j['cgpa']),
    backlogs: _i(j['backlogs']),
    backlogHistory: _i(j['backlogHistory']),
    tenthPct: _d(j['tenthPct']),
    twelfthPct: _d(j['twelfthPct']),
    gapYears: (j['gapYears'] as num?)?.toInt(),
    batchYear: (j['batchYear'] as num?)?.toInt(),
    optedIn: j['optedIn'] as bool?,
    debarredUntil: j['debarredUntil'] as String?,
    placedCategory: j['placedCategory'] as String?,
    docsVerified: j['docsVerified'] as bool? ?? false,
    documents: [for (final d in _list(j['documents'])) RequiredDocument(kind: d['kind'] as String, status: d['status'] as String)],
  );

  final double? cgpa;
  final int backlogs;
  final int backlogHistory;
  final double? tenthPct;
  final double? twelfthPct;
  final int? gapYears;
  final int? batchYear;

  /// null: never chose; false: opted out.
  final bool? optedIn;
  final String? debarredUntil;

  /// regular, dream or super_dream when the student has accepted a placement offer.
  final String? placedCategory;
  final bool docsVerified;
  final List<RequiredDocument> documents;
}

/// A document the cell needs verified: verified, pending (waiting for the cell), rejected or missing.
class RequiredDocument {
  const RequiredDocument({required this.kind, required this.status});
  final String kind;
  final String status;
}

class PlacementRound {
  PlacementRound({required this.name, required this.kind, required this.seq, this.result, this.scheduledOn, this.slotStartsAt, this.slotVenue});

  factory PlacementRound.fromJson(Map<String, dynamic> j) {
    final slot = (j['slot'] as Map?)?.cast<String, dynamic>();
    return PlacementRound(
      name: j['name'] as String,
      kind: j['kind'] as String? ?? 'interview',
      seq: _i(j['seq']),
      result: j['result'] as String?,
      scheduledOn: j['scheduledOn'] as String?,
      slotStartsAt: slot == null ? null : DateTime.tryParse(slot['startsAt'] as String? ?? '')?.toLocal(),
      slotVenue: slot?['venue'] as String?,
    );
  }

  final String name;
  final String kind;
  final int seq;

  /// pass, fail or absent; null while not recorded.
  final String? result;
  final String? scheduledOn;
  final DateTime? slotStartsAt;
  final String? slotVenue;
}

class PlacementRegistration {
  PlacementRegistration({required this.id, required this.title, required this.company, required this.roleTitle, required this.status, required this.rounds});

  factory PlacementRegistration.fromJson(Map<String, dynamic> j) => PlacementRegistration(
    id: j['id'] as String,
    title: j['title'] as String,
    company: j['company'] as String,
    roleTitle: j['roleTitle'] as String? ?? '',
    status: j['status'] as String,
    rounds: [for (final r in _list(j['rounds'])) PlacementRound.fromJson(r)],
  );

  final String id;
  final String title;
  final String company;
  final String roleTitle;
  final String status;
  final List<PlacementRound> rounds;
}

class PlacementTraining {
  PlacementTraining({required this.title, required this.kind, this.attendancePct, required this.scores});

  factory PlacementTraining.fromJson(Map<String, dynamic> j) => PlacementTraining(
    title: j['title'] as String,
    kind: j['kind'] as String? ?? 'other',
    attendancePct: _d(j['attendancePct']),
    scores: [for (final s in _list(j['scores'])) (test: s['test'] as String, score: _d(s['score']) ?? 0, max: _d(s['maxScore']) ?? 0)],
  );

  final String title;
  final String kind;
  final double? attendancePct;
  final List<({String test, double score, double max})> scores;
}

class PlacementDashboard {
  PlacementDashboard({
    required this.standing,
    required this.eligibleOpenDrives,
    required this.registered,
    required this.shortlisted,
    required this.offerCount,
    required this.registrations,
    required this.offers,
    required this.training,
    required this.creditsEarned,
    required this.creditsRequired,
    required this.creditsShort,
    required this.apprenticeships,
    required this.referrals,
  });

  factory PlacementDashboard.fromJson(Map<String, dynamic> j) {
    final counts = (j['counts'] as Map).cast<String, dynamic>();
    final credits = (((j['internships'] as Map?)?['credits']) as Map?)?.cast<String, dynamic>() ?? const {};
    return PlacementDashboard(
      standing: PlacementStanding.fromJson((j['standing'] as Map).cast<String, dynamic>()),
      eligibleOpenDrives: _i(counts['eligibleOpenDrives']),
      registered: _i(counts['registered']),
      shortlisted: _i(counts['shortlisted']),
      offerCount: _i(counts['offers']),
      registrations: [for (final r in _list(j['registrations'])) PlacementRegistration.fromJson(r)],
      offers: [for (final o in _list(j['offers'])) (company: o['company'] as String, role: o['roleTitle'] as String? ?? '', ctcLpa: _d(o['ctcLpa']), status: o['status'] as String, category: o['category'] as String? ?? 'regular')],
      training: [for (final t in _list(j['training'])) PlacementTraining.fromJson(t)],
      creditsEarned: _d(credits['earned']) ?? 0,
      creditsRequired: _d(credits['required']) ?? 0,
      creditsShort: _d(credits['short']) ?? 0,
      apprenticeships: [for (final a in _list(j['apprenticeships'])) (establishment: a['establishment'] as String, role: a['role'] as String? ?? '', status: a['status'] as String, stipendPaise: _i(a['stipendPaise']), govtSharePaise: _i(a['govtSharePaise']))],
      referrals: [for (final r in _list(j['referrals'])) (alumni: r['alumni'] as String, company: r['company'] as String, status: r['status'] as String, note: r['note'] as String? ?? '')],
    );
  }

  final PlacementStanding standing;
  final int eligibleOpenDrives;
  final int registered;
  final int shortlisted;
  final int offerCount;
  final List<PlacementRegistration> registrations;
  final List<({String company, String role, double? ctcLpa, String status, String category})> offers;
  final List<PlacementTraining> training;
  final double creditsEarned;
  final double creditsRequired;
  final double creditsShort;
  final List<({String establishment, String role, String status, int stipendPaise, int govtSharePaise})> apprenticeships;
  final List<({String alumni, String company, String status, String note})> referrals;
}

/// An alumnus who takes mentoring and referral requests (`GET /v1/placements/alumni?mentors=true`).
class AlumniMentor {
  const AlumniMentor({required this.id, required this.name, required this.employer, required this.designation, required this.year});

  factory AlumniMentor.fromJson(Map<String, dynamic> j) => AlumniMentor(
    id: j['id'] as String,
    name: j['fullName'] as String,
    employer: j['employer'] as String? ?? '',
    designation: j['designation'] as String? ?? '',
    year: _i(j['graduationYear']),
  );

  final String id;
  final String name;
  final String employer;
  final String designation;
  final int year;
}
