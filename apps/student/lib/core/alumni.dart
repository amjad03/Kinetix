/// The alumni home: profile, success stories, giving and volunteering, as the Cloud API sends them
/// (services/api src/placements/alumni-portal.controller.ts and success-stories.controller.ts).
library;

String _s(Object? v) => v == null ? '' : '$v';
num _n(Object? v) => v is num ? v : num.tryParse('$v') ?? 0;
DateTime? _at(Object? v) => v == null ? null : DateTime.tryParse('$v')?.toLocal();
List<T> _list<T>(Object? v, T Function(Map<String, dynamic>) f) => [for (final x in (v as List? ?? const [])) f((x as Map).cast<String, dynamic>())];

/// The graduate's own profile (`GET/PUT /v1/alumni-portal/me`).
class AlumniProfile {
  const AlumniProfile({
    required this.fullName,
    required this.graduationYear,
    required this.program,
    this.email,
    this.phone,
    this.employer,
    this.designation,
    this.city,
    required this.bio,
    required this.directoryVisible,
    required this.mentorAvailable,
  });

  factory AlumniProfile.fromJson(Map<String, dynamic> j) => AlumniProfile(
    fullName: _s(j['fullName']),
    graduationYear: _n(j['graduationYear']).toInt(),
    program: _s(j['program']),
    email: j['email'] as String?,
    phone: j['phone'] as String?,
    employer: j['employer'] as String?,
    designation: j['designation'] as String?,
    city: j['city'] as String?,
    bio: _s(j['bio']),
    directoryVisible: j['directoryVisible'] as bool? ?? false,
    mentorAvailable: j['mentorAvailable'] as bool? ?? false,
  );

  final String fullName, program, bio;
  final int graduationYear;
  final String? email, phone, employer, designation, city;
  final bool directoryVisible, mentorAvailable;

  /// "Product Manager at Acme", "Acme", or empty.
  String get work => [if ((designation ?? '').isNotEmpty) designation!, if ((employer ?? '').isNotEmpty) employer!].join(' · ');
}

class AlumniCampaign {
  const AlumniCampaign({required this.id, required this.name, required this.description, required this.goalPaise, this.endsOn});

  factory AlumniCampaign.fromJson(Map<String, dynamic> j) =>
      AlumniCampaign(id: _s(j['id']), name: _s(j['name']), description: _s(j['description']), goalPaise: _n(j['goalPaise']).toInt(), endsOn: _at(j['endsOn']));

  final String id, name, description;
  final int goalPaise;
  final DateTime? endsOn;
}

/// A pledge and the donations received from me (`GET /v1/alumni-portal/giving`).
class Giving {
  const Giving({required this.pledges, required this.donations, required this.totalGivenPaise});

  factory Giving.fromJson(Map<String, dynamic> j) => Giving(
    pledges: _list(j['pledges'], (p) => (id: _s(p['id']), campaignId: _s(p['campaignId']), amountPaise: _n(p['amountPaise']).toInt(), on: _at(p['pledgedOn']), status: _s(p['status']))),
    donations: _list(j['donations'], (d) => (id: _s(d['id']), campaign: _s(d['campaign']), amountPaise: _n(d['amountPaise']).toInt(), on: _at(d['receivedOn']), receiptSerial: _s(d['receiptSerial']))),
    totalGivenPaise: _n(j['totalGivenPaise']).toInt(),
  );

  final List<({String id, String campaignId, int amountPaise, DateTime? on, String status})> pledges;
  final List<({String id, String campaign, int amountPaise, DateTime? on, String receiptSerial})> donations;
  final int totalGivenPaise;
}

class VolunteerOpportunity {
  const VolunteerOpportunity({required this.id, required this.title, required this.description, this.startsOn, this.slots, required this.taken, required this.signedUp});

  factory VolunteerOpportunity.fromJson(Map<String, dynamic> j) => VolunteerOpportunity(
    id: _s(j['id']),
    title: _s(j['title']),
    description: _s(j['description']),
    startsOn: _at(j['startsOn']),
    slots: (j['slots'] as num?)?.toInt(),
    taken: _n(j['taken']).toInt(),
    signedUp: j['signedUp'] as bool? ?? false,
  );

  final String id, title, description;
  final DateTime? startsOn;

  /// Places in all; null when unlimited.
  final int? slots;
  final int taken;
  final bool signedUp;

  bool get full => slots != null && taken >= slots!;
}

/// A success story: mine (with its status) or a published one (with who wrote it).
class SuccessStory {
  const SuccessStory({required this.id, required this.title, required this.body, required this.status, required this.featured, this.reviewNote, this.alumnus, this.graduationYear, this.work});

  factory SuccessStory.fromJson(Map<String, dynamic> j) => SuccessStory(
    id: _s(j['id']),
    title: _s(j['title']),
    body: _s(j['body']),
    status: j['status'] as String? ?? 'published',
    featured: j['featured'] as bool? ?? false,
    reviewNote: j['reviewNote'] as String?,
    alumnus: j['alumnus'] as String?,
    graduationYear: (j['graduationYear'] as num?)?.toInt(),
    work: [for (final k in ['designation', 'employer']) if (_s(j[k]).isNotEmpty) _s(j[k])].join(' · '),
  );

  final String id, title, body;

  /// `draft`, `submitted`, `published` or `rejected`.
  final String status;
  final bool featured;
  final String? reviewNote, alumnus, work;
  final int? graduationYear;

  /// Only a draft or a rejected story can be edited; only a draft can be sent.
  bool get editable => status == 'draft' || status == 'rejected';
}
