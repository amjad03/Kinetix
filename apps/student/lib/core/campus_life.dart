/// Course registration, the outcome passport, surveys, clubs and events, as the Cloud API sends
/// them (services/api src/course-registration, skills, surveys and campus-life).
library;

DateTime? _at(Object? v) => v == null ? null : DateTime.parse(v as String).toLocal();

// ── Course registration (GET/POST /v1/course-registration/…) ────────────────────────────────────

/// A term the student can register in.
class RegTerm {
  const RegTerm({required this.id, required this.name, required this.startsOn, required this.endsOn});

  factory RegTerm.fromJson(Map<String, dynamic> j) =>
      RegTerm(id: j['id'] as String, name: j['name'] as String, startsOn: DateTime.parse(j['startsOn'] as String), endsOn: DateTime.parse(j['endsOn'] as String));

  final String id;
  final String name;
  final DateTime startsOn;
  final DateTime endsOn;
}

/// When registration is open for the student's program, and the credit limits.
class RegWindow {
  const RegWindow({required this.opensAt, required this.closesAt, required this.addDropUntil, required this.minCredits, required this.maxCredits});

  factory RegWindow.fromJson(Map<String, dynamic> j) => RegWindow(
    opensAt: _at(j['opensAt'])!,
    closesAt: _at(j['closesAt'])!,
    addDropUntil: _at(j['addDropUntil'])!,
    minCredits: (j['minCredits'] as num?)?.toDouble() ?? 0,
    maxCredits: (j['maxCredits'] as num?)?.toDouble() ?? 0,
  );

  final DateTime opensAt;
  final DateTime closesAt;
  final DateTime addDropUntil;
  final double minCredits;
  final double maxCredits;

  bool isOpen(DateTime now) => !now.isBefore(opensAt) && now.isBefore(addDropUntil);
}

/// One course offered in a term, with seats left and the student's own status in it.
class CourseOffering {
  const CourseOffering({
    required this.offeringId,
    required this.subjectCode,
    required this.subjectName,
    required this.category,
    required this.credits,
    required this.seatCap,
    required this.seatsLeft,
    required this.eligible,
    this.facultyName,
    this.blockedText,
    this.myStatus,
    this.myRank,
    this.myApproval,
  });

  factory CourseOffering.fromJson(Map<String, dynamic> j) => CourseOffering(
    offeringId: j['offeringId'] as String,
    subjectCode: j['subjectCode'] as String,
    subjectName: j['subjectName'] as String,
    category: j['category'] as String,
    credits: (j['credits'] as num).toDouble(),
    seatCap: (j['seatCap'] as num).toInt(),
    seatsLeft: (j['seatsLeft'] as num).toInt(),
    eligible: j['eligible'] as bool? ?? true,
    facultyName: j['facultyName'] as String?,
    blockedText: j['blockedText'] as String?,
    myStatus: j['myStatus'] as String?,
    myRank: (j['myRank'] as num?)?.toInt(),
    myApproval: j['myApproval'] as String?,
  );

  final String offeringId;
  final String subjectCode;
  final String subjectName;
  final String category;
  final double credits;
  final int seatCap;
  final int seatsLeft;
  final bool eligible;
  final String? facultyName;

  /// Why the student cannot take it now, in the server's words; null when they can.
  final String? blockedText;

  /// `preference`, `registered`, `waitlisted`, `not_allotted`, or null.
  final String? myStatus;
  final int? myRank;
  final String? myApproval;

  bool get isCore => category == 'core';
  bool get registered => myStatus == 'registered';
  bool get ranked => myStatus == 'preference';
}

class OfferingList {
  const OfferingList({this.window, required this.offerings});

  factory OfferingList.fromJson(Map<String, dynamic> j) => OfferingList(
    window: j['window'] == null ? null : RegWindow.fromJson((j['window'] as Map).cast<String, dynamic>()),
    offerings: [for (final o in (j['offerings'] as List? ?? const [])) CourseOffering.fromJson((o as Map).cast<String, dynamic>())],
  );

  final RegWindow? window;
  final List<CourseOffering> offerings;
}

/// One of the student's registrations.
class MyRegistration {
  const MyRegistration({required this.offeringId, required this.subjectCode, required this.subjectName, required this.credits, required this.category, required this.status, required this.approval, this.preferenceRank, this.waitlistPos});

  factory MyRegistration.fromJson(Map<String, dynamic> j) => MyRegistration(
    offeringId: j['offeringId'] as String,
    subjectCode: j['subjectCode'] as String,
    subjectName: j['subjectName'] as String,
    credits: (j['credits'] as num).toDouble(),
    category: j['category'] as String,
    status: j['status'] as String,
    approval: j['approval'] as String? ?? 'pending',
    preferenceRank: (j['preferenceRank'] as num?)?.toInt(),
    waitlistPos: (j['waitlistPos'] as num?)?.toInt(),
  );

  final String offeringId;
  final String subjectCode;
  final String subjectName;
  final double credits;
  final String category;
  final String status;
  final String approval;
  final int? preferenceRank;
  final int? waitlistPos;
}

class MyRegistrations {
  const MyRegistrations({this.window, required this.registeredCredits, required this.approvedCredits, required this.minCredits, required this.maxCredits, required this.registrations});

  factory MyRegistrations.fromJson(Map<String, dynamic> j) => MyRegistrations(
    window: j['window'] == null ? null : RegWindow.fromJson((j['window'] as Map).cast<String, dynamic>()),
    registeredCredits: (j['registeredCredits'] as num?)?.toDouble() ?? 0,
    approvedCredits: (j['approvedCredits'] as num?)?.toDouble() ?? 0,
    minCredits: (j['minCredits'] as num?)?.toDouble() ?? 0,
    maxCredits: (j['maxCredits'] as num?)?.toDouble() ?? 0,
    registrations: [for (final r in (j['registrations'] as List? ?? const [])) MyRegistration.fromJson((r as Map).cast<String, dynamic>())],
  );

  final RegWindow? window;
  final double registeredCredits;
  final double approvedCredits;
  final double minCredits;
  final double maxCredits;
  final List<MyRegistration> registrations;
}

// ── Outcome passport (GET /v1/passport/me) ──────────────────────────────────────────────────────

class EvidenceLine {
  const EvidenceLine({required this.source, required this.title, required this.detail, required this.level});

  factory EvidenceLine.fromJson(Map<String, dynamic> j) =>
      EvidenceLine(source: j['source'] as String? ?? '', title: j['title'] as String? ?? '', detail: j['detail'] as String? ?? '', level: (j['level'] as num?)?.toInt() ?? 0);

  final String source;
  final String title;
  final String detail;
  final int level;
}

class PassportSkill {
  const PassportSkill({required this.skillId, required this.code, required this.name, required this.category, this.level, this.evidence = const []});

  factory PassportSkill.fromJson(Map<String, dynamic> j) => PassportSkill(
    skillId: j['skillId'] as String,
    code: j['code'] as String? ?? '',
    name: j['name'] as String,
    category: j['category'] as String? ?? '',
    level: (j['level'] as num?)?.toInt(),
    evidence: [for (final e in (j['evidence'] as List? ?? const [])) EvidenceLine.fromJson((e as Map).cast<String, dynamic>())],
  );

  final String skillId;
  final String code;
  final String name;
  final String category;

  /// 1 to 5; null when there is no evidence yet.
  final int? level;
  final List<EvidenceLine> evidence;
}

/// The student's Outcome Passport: skills with level and evidence, certificates, clubs and events.
class OutcomePassport {
  const OutcomePassport({
    required this.studentId,
    required this.fullName,
    required this.rollNo,
    required this.className,
    required this.skills,
    required this.certificates,
    required this.clubs,
    required this.events,
    required this.verified,
    this.verifiedAt,
  });

  factory OutcomePassport.fromJson(Map<String, dynamic> j) {
    final st = (j['student'] as Map).cast<String, dynamic>();
    final act = (j['activities'] as Map?)?.cast<String, dynamic>() ?? const {};
    final ver = (j['verification'] as Map?)?.cast<String, dynamic>() ?? const {};
    return OutcomePassport(
      studentId: st['id'] as String,
      fullName: st['fullName'] as String,
      rollNo: st['rollNo'] as String? ?? '',
      className: st['className'] as String? ?? '',
      skills: [for (final s in (j['skills'] as List? ?? const [])) PassportSkill.fromJson((s as Map).cast<String, dynamic>())],
      certificates: [for (final c in (j['certificates'] as List? ?? const [])) (c as Map)['title'] as String],
      clubs: [for (final c in (act['clubs'] as List? ?? const [])) '${(c as Map)['club']} · ${c['points']}'],
      events: [for (final e in (act['events'] as List? ?? const [])) (e as Map)['title'] as String],
      verified: ver['verified'] as bool? ?? false,
      verifiedAt: _at(ver['verifiedAt']),
    );
  }

  final String studentId;
  final String fullName;
  final String rollNo;
  final String className;
  final List<PassportSkill> skills;
  final List<String> certificates;

  /// "Club · points" lines.
  final List<String> clubs;
  final List<String> events;
  final bool verified;
  final DateTime? verifiedAt;
}

// ── Surveys (GET /v1/surveys/mine, POST /v1/surveys/:id/responses) ──────────────────────────────

class SurveyQuestion {
  const SurveyQuestion({required this.id, required this.kind, required this.prompt, required this.options, required this.required});

  factory SurveyQuestion.fromJson(Map<String, dynamic> j) => SurveyQuestion(
    id: j['id'] as String,
    kind: j['kind'] as String,
    prompt: j['prompt'] as String,
    options: [for (final o in (j['options'] as List? ?? const [])) '$o'],
    required: j['required'] as bool? ?? true,
  );

  final String id;

  /// `single`, `multiple`, `rating` or `text`.
  final String kind;
  final String prompt;
  final List<String> options;
  final bool required;
}

class MySurvey {
  const MySurvey({required this.id, required this.title, required this.description, required this.anonymous, required this.answered, required this.questions, this.closesAt});

  factory MySurvey.fromJson(Map<String, dynamic> j) => MySurvey(
    id: j['id'] as String,
    title: j['title'] as String,
    description: j['description'] as String? ?? '',
    anonymous: j['anonymous'] as bool? ?? false,
    answered: j['answered'] as bool? ?? false,
    closesAt: _at(j['closesAt']),
    questions: [for (final q in (j['questions'] as List? ?? const [])) SurveyQuestion.fromJson((q as Map).cast<String, dynamic>())],
  );

  final String id;
  final String title;
  final String description;
  final bool anonymous;
  final bool answered;
  final DateTime? closesAt;
  final List<SurveyQuestion> questions;
}

/// One answer on its way to `POST /v1/surveys/:id/responses`.
class SurveyAnswer {
  const SurveyAnswer(this.questionId, {this.choices, this.rating, this.text});

  final String questionId;
  final List<String>? choices;
  final int? rating;
  final String? text;

  Map<String, Object> toJson() => {'questionId': questionId, 'choices': ?choices, 'rating': ?rating, 'text': ?text};
}

// ── Clubs and events (GET /v1/campus-life/me/…) ─────────────────────────────────────────────────

class MyClub {
  const MyClub({required this.id, required this.name, required this.category, required this.description, required this.points, this.membershipStatus});

  factory MyClub.fromJson(Map<String, dynamic> j) => MyClub(
    id: j['id'] as String,
    name: j['name'] as String,
    category: j['category'] as String? ?? '',
    description: j['description'] as String? ?? '',
    points: (j['points'] as num?)?.toInt() ?? 0,
    membershipStatus: (j['membership'] as Map?)?['status'] as String?,
  );

  final String id;
  final String name;
  final String category;
  final String description;
  final int points;

  /// `requested`, `active`, `left`, `rejected`, or null when never joined.
  final String? membershipStatus;

  bool get member => membershipStatus == 'active';
  bool get requested => membershipStatus == 'requested';
}

/// A registration the student holds for an event.
class EventSeat {
  const EventSeat({required this.id, required this.status, required this.qrToken, required this.checkedIn});

  factory EventSeat.fromJson(Map<String, dynamic> j) =>
      EventSeat(id: j['id'] as String, status: j['status'] as String, qrToken: j['qrToken'] as String? ?? '', checkedIn: j['checkedIn'] as bool? ?? false);

  final String id;

  /// `registered` or `waitlisted`.
  final String status;
  final String qrToken;
  final bool checkedIn;
}

class CampusEvent {
  const CampusEvent({required this.id, required this.title, required this.description, required this.eventType, required this.venue, required this.startsAt, required this.endsAt, required this.feePaise, required this.seatsLeft, this.seat});

  factory CampusEvent.fromJson(Map<String, dynamic> j) => CampusEvent(
    id: j['id'] as String,
    title: j['title'] as String,
    description: j['description'] as String? ?? '',
    eventType: j['eventType'] as String? ?? 'other',
    venue: j['venue'] as String? ?? '',
    startsAt: _at(j['startsAt'])!,
    endsAt: _at(j['endsAt'])!,
    feePaise: (j['feePaise'] as num?)?.toInt() ?? 0,
    seatsLeft: (j['seatsLeft'] as num?)?.toInt() ?? 0,
    seat: j['registration'] == null ? null : EventSeat.fromJson((j['registration'] as Map).cast<String, dynamic>()),
  );

  final String id;
  final String title;
  final String description;
  final String eventType;
  final String venue;
  final DateTime startsAt;
  final DateTime endsAt;
  final int feePaise;
  final int seatsLeft;
  final EventSeat? seat;
}

/// One line of `GET /v1/campus-life/me/registrations`: a registration with its QR token.
class MyEventRegistration {
  const MyEventRegistration({required this.id, required this.eventId, required this.title, required this.venue, required this.startsAt, required this.status, required this.qrToken, required this.checkedIn, required this.feedbackGiven, required this.canGiveFeedback});

  factory MyEventRegistration.fromJson(Map<String, dynamic> j) => MyEventRegistration(
    id: j['id'] as String,
    eventId: j['eventId'] as String,
    title: j['title'] as String,
    venue: j['venue'] as String? ?? '',
    startsAt: _at(j['startsAt'])!,
    status: j['status'] as String,
    qrToken: j['qrToken'] as String? ?? '',
    checkedIn: j['checkedIn'] as bool? ?? false,
    feedbackGiven: j['feedbackGiven'] as bool? ?? false,
    canGiveFeedback: j['canGiveFeedback'] as bool? ?? false,
  );

  final String id;
  final String eventId;
  final String title;
  final String venue;
  final DateTime startsAt;
  final String status;
  final String qrToken;
  final bool checkedIn;
  final bool feedbackGiven;
  final bool canGiveFeedback;
}
