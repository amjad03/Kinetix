/// Careers (placements, offers, internships) and grievances, as the Cloud API sends them
/// (services/api src/placements and src/welfare). The Student and Parent apps share this shape.
library;

num? _n(Object? v) => v as num?;

/// A campus drive with the student's eligibility, as `GET /v1/placements/students/:id/overview` lists it.
class CareerDrive {
  CareerDrive({
    required this.id,
    required this.title,
    required this.company,
    required this.roleTitle,
    required this.status,
    required this.eligible,
    required this.reasons,
    this.ctcLpa,
    this.minCgpa = 0,
    this.location = '',
    this.driveDate,
    this.registrationStatus,
  });

  factory CareerDrive.fromJson(Map<String, dynamic> j) {
    final el = (j['eligibility'] as Map).cast<String, dynamic>();
    final reg = j['registration'] as Map?;
    return CareerDrive(
      id: j['id'] as String,
      title: j['title'] as String,
      company: j['company'] as String,
      roleTitle: j['roleTitle'] as String,
      status: j['status'] as String,
      ctcLpa: _n(j['ctcLpa'])?.toDouble(),
      minCgpa: (_n(j['minCgpa']) ?? 0).toDouble(),
      location: j['location'] as String? ?? '',
      driveDate: j['driveDate'] as String?,
      eligible: el['eligible'] as bool,
      reasons: [for (final r in el['reasons'] as List) r as String],
      registrationStatus: reg?['status'] as String?,
    );
  }

  final String id;
  final String title;
  final String company;
  final String roleTitle;
  final String status;
  final double? ctcLpa;
  final double minCgpa;
  final String location;
  final String? driveDate;
  final bool eligible;
  final List<String> reasons;

  /// registered, shortlisted, rejected, selected or withdrawn; null when not registered.
  final String? registrationStatus;

  bool get registered => registrationStatus != null && registrationStatus != 'withdrawn';
}

class CareerOffer {
  CareerOffer({required this.id, required this.roleTitle, required this.status, this.ctcLpa, this.respondBy});

  factory CareerOffer.fromJson(Map<String, dynamic> j) => CareerOffer(
    id: j['id'] as String,
    roleTitle: j['roleTitle'] as String,
    status: j['status'] as String,
    ctcLpa: _n(j['ctcLpa'])?.toDouble(),
    respondBy: j['respondBy'] as String?,
  );

  final String id;
  final String roleTitle;
  final String status;
  final double? ctcLpa;
  final String? respondBy;
}

class CareerInternship {
  CareerInternship({required this.id, required this.title, required this.orgName, required this.status, required this.startsOn, required this.endsOn});

  factory CareerInternship.fromJson(Map<String, dynamic> j) => CareerInternship(
    id: j['id'] as String,
    title: j['title'] as String,
    orgName: j['orgName'] as String,
    status: j['status'] as String,
    startsOn: j['startsOn'] as String,
    endsOn: j['endsOn'] as String,
  );

  final String id;
  final String title;
  final String orgName;
  final String status;
  final String startsOn;
  final String endsOn;
}

class CareerOverview {
  CareerOverview({required this.backlogs, required this.placed, required this.drives, required this.offers, required this.internships, this.cgpa});

  factory CareerOverview.fromJson(Map<String, dynamic> j) {
    final a = (j['academics'] as Map).cast<String, dynamic>();
    return CareerOverview(
      cgpa: _n(a['cgpa'])?.toDouble(),
      backlogs: (a['backlogs'] as num).toInt(),
      placed: j['placed'] as bool? ?? false,
      drives: [for (final d in j['drives'] as List) CareerDrive.fromJson((d as Map).cast<String, dynamic>())],
      offers: [for (final o in j['offers'] as List) CareerOffer.fromJson((o as Map).cast<String, dynamic>())],
      internships: [for (final i in j['internships'] as List) CareerInternship.fromJson((i as Map).cast<String, dynamic>())],
    );
  }

  final double? cgpa;
  final int backlogs;
  final bool placed;
  final List<CareerDrive> drives;
  final List<CareerOffer> offers;
  final List<CareerInternship> internships;
}

/// A grievance ticket the signed-in person raised (`GET /v1/grievances/mine`).
class GrievanceTicket {
  GrievanceTicket({
    required this.id,
    required this.ticketNo,
    required this.category,
    required this.subject,
    required this.status,
    required this.anonymous,
    required this.slaDueAt,
    this.resolution,
    this.rating,
  });

  factory GrievanceTicket.fromJson(Map<String, dynamic> j) => GrievanceTicket(
    id: j['id'] as String,
    ticketNo: j['ticketNo'] as String,
    category: j['category'] as String,
    subject: j['subject'] as String,
    status: j['status'] as String,
    anonymous: j['anonymous'] as bool? ?? false,
    slaDueAt: DateTime.parse(j['slaDueAt'] as String).toLocal(),
    resolution: j['resolution'] as String?,
    rating: (j['rating'] as num?)?.toInt(),
  );

  final String id;
  final String ticketNo;
  final String category;
  final String subject;
  final String status;
  final bool anonymous;
  final DateTime slaDueAt;
  final String? resolution;
  final int? rating;

  bool get open => const ['open', 'assigned', 'in_progress', 'escalated', 'reopened'].contains(status);

  /// Resolved and not yet rated: the person is asked how it went.
  bool get canRate => status == 'resolved' && rating == null;
}

/// The grievance categories a person can pick; ragging and harassment go to a confidential committee.
const grievanceCategories = ['academic', 'exam', 'fees', 'hostel', 'transport', 'infrastructure', 'staff_conduct', 'ragging', 'harassment', 'other'];
const confidentialCategories = ['ragging', 'harassment'];

/// 7.0 → "7", 7.25 → "7.25".
String lakhs(double v) => v == v.roundToDouble() ? v.toInt().toString() : v.toString();
