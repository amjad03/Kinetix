/// School diary, parent-teacher meetings, early years, health, outcome passport, surveys and campus
/// events, as the Cloud API sends them (services/api src/school-life, skills, surveys, campus-life).
library;

DateTime _day(Object? v) => DateTime.parse(v as String);
DateTime _at(Object? v) => DateTime.parse(v as String).toLocal();
List<String> _strings(Object? v) => [for (final s in (v as List? ?? const [])) s as String];
List<T> _list<T>(Object? v, T Function(Map<String, dynamic>) f) => [for (final x in (v as List? ?? const [])) f((x as Map).cast<String, dynamic>())];

/// One day's diary entry for the class: classwork, homework and a notice. A guardian acknowledges it.
class DiaryEntry {
  const DiaryEntry({required this.id, required this.date, required this.classwork, required this.homeworkNote, required this.notice, required this.author, this.subject, this.acknowledgedAt});

  factory DiaryEntry.fromJson(Map<String, dynamic> j) => DiaryEntry(
    id: j['id'] as String,
    date: _day(j['entryDate']),
    classwork: j['classwork'] as String? ?? '',
    homeworkNote: j['homeworkNote'] as String? ?? '',
    notice: j['notice'] as String? ?? '',
    author: j['author'] as String? ?? '',
    subject: j['subject'] as String?,
    acknowledgedAt: j['acknowledgedAt'] == null ? null : _at(j['acknowledgedAt']),
  );

  final String id;
  final DateTime date;
  final String classwork;
  final String homeworkNote;
  final String notice;
  final String author;
  final String? subject;
  final DateTime? acknowledgedAt;

  bool get acknowledged => acknowledgedAt != null;
}

/// A parent-teacher meeting day.
class PtmEvent {
  const PtmEvent({required this.id, required this.title, required this.date, required this.location, required this.open, required this.slots, required this.booked});

  factory PtmEvent.fromJson(Map<String, dynamic> j) => PtmEvent(
    id: j['id'] as String,
    title: j['title'] as String,
    date: _day(j['eventDate']),
    location: j['location'] as String? ?? '',
    open: j['status'] == 'open',
    slots: (j['slots'] as num?)?.toInt() ?? 0,
    booked: (j['booked'] as num?)?.toInt() ?? 0,
  );

  final String id;
  final String title;
  final DateTime date;
  final String location;
  final bool open;
  final int slots;
  final int booked;
}

/// A teacher's time slot; [mine] when this child holds it.
class PtmSlot {
  const PtmSlot({required this.id, required this.eventId, required this.teacherId, required this.teacher, required this.startsAt, required this.endsAt, required this.mine});

  factory PtmSlot.fromJson(Map<String, dynamic> j) => PtmSlot(
    id: j['id'] as String,
    eventId: j['eventId'] as String,
    teacherId: j['teacherId'] as String,
    teacher: j['teacher'] as String? ?? '',
    startsAt: _at(j['startsAt']),
    endsAt: _at(j['endsAt']),
    mine: j['mine'] as bool? ?? false,
  );

  final String id;
  final String eventId;
  final String teacherId;
  final String teacher;
  final DateTime startsAt;
  final DateTime endsAt;
  final bool mine;
}

/// A slot this guardian booked, with the child and the meeting it belongs to.
class PtmBooking {
  const PtmBooking({required this.slot, required this.studentId, required this.student, required this.event});

  factory PtmBooking.fromJson(Map<String, dynamic> j) =>
      PtmBooking(slot: PtmSlot.fromJson({...j, 'mine': true}), studentId: j['studentId'] as String, student: j['student'] as String? ?? '', event: j['event'] as String? ?? '');

  final PtmSlot slot;
  final String studentId;
  final String student;
  final String event;
}

/// The five early years domains, as the server names them.
const earlyYearsDomains = ['physical', 'language', 'cognitive', 'social_emotional', 'creative'];

class EarlyMilestone {
  const EarlyMilestone({required this.id, required this.domain, required this.ageBand, required this.title, required this.status});

  factory EarlyMilestone.fromJson(Map<String, dynamic> j) => EarlyMilestone(
    id: j['id'] as String,
    domain: j['domain'] as String,
    ageBand: j['ageBand'] as String? ?? '',
    title: j['title'] as String,
    status: j['status'] as String? ?? 'emerging',
  );

  final String id;
  final String domain;
  final String ageBand;
  final String title;

  /// emerging, developing or achieved.
  final String status;
}

class EarlyObservation {
  const EarlyObservation({required this.id, required this.domain, required this.note, required this.date, required this.hasPhoto, this.status});

  factory EarlyObservation.fromJson(Map<String, dynamic> j) => EarlyObservation(
    id: j['id'] as String,
    domain: j['domain'] as String,
    note: j['note'] as String,
    date: _day(j['observedOn']),
    hasPhoto: j['hasPhoto'] as bool? ?? false,
    status: j['status'] as String?,
  );

  final String id;
  final String domain;
  final String note;
  final DateTime date;
  final bool hasPhoto;
  final String? status;
}

class EarlyYearsView {
  const EarlyYearsView({required this.milestones, required this.observations});

  factory EarlyYearsView.fromJson(Map<String, dynamic> j) => EarlyYearsView(
    milestones: _list(j['milestones'], EarlyMilestone.fromJson),
    observations: _list(j['observations'], EarlyObservation.fromJson),
  );

  final List<EarlyMilestone> milestones;
  final List<EarlyObservation> observations;
}

/// An academic term, for choosing which learning story to download.
class TermInfo {
  const TermInfo({required this.id, required this.name, required this.startsOn, required this.endsOn});

  factory TermInfo.fromJson(Map<String, dynamic> j) => TermInfo(id: j['id'] as String, name: j['name'] as String, startsOn: _day(j['startsOn']), endsOn: _day(j['endsOn']));

  final String id;
  final String name;
  final DateTime startsOn;
  final DateTime endsOn;
}

class EmergencyContact {
  const EmergencyContact({required this.name, required this.relation, required this.phone});

  factory EmergencyContact.fromJson(Map<String, dynamic> j) => EmergencyContact(name: j['name'] as String? ?? '', relation: j['relation'] as String? ?? '', phone: j['phone'] as String? ?? '');

  final String name;
  final String relation;
  final String phone;
}

class HealthProfile {
  const HealthProfile({this.bloodGroup, this.allergies = const [], this.conditions = const [], this.medications = const [], this.contacts = const [], this.notes = ''});

  factory HealthProfile.fromJson(Map<String, dynamic> j) => HealthProfile(
    bloodGroup: j['bloodGroup'] as String?,
    allergies: _strings(j['allergies']),
    conditions: _strings(j['conditions']),
    medications: _strings(j['medications']),
    contacts: _list(j['emergencyContacts'], EmergencyContact.fromJson),
    notes: j['notes'] as String? ?? '',
  );

  final String? bloodGroup;
  final List<String> allergies;
  final List<String> conditions;
  final List<String> medications;
  final List<EmergencyContact> contacts;
  final String notes;
}

class NurseVisit {
  const NurseVisit({required this.id, required this.at, required this.complaint, required this.action, required this.sentHome});

  factory NurseVisit.fromJson(Map<String, dynamic> j) =>
      NurseVisit(id: j['id'] as String, at: _at(j['visitedAt']), complaint: j['complaint'] as String, action: j['action'] as String? ?? '', sentHome: j['sentHome'] as bool? ?? false);

  final String id;
  final DateTime at;
  final String complaint;
  final String action;
  final bool sentHome;
}

class Vaccination {
  const Vaccination({required this.id, required this.vaccine, required this.dose, required this.givenOn, this.nextDueOn});

  factory Vaccination.fromJson(Map<String, dynamic> j) => Vaccination(
    id: j['id'] as String,
    vaccine: j['vaccine'] as String,
    dose: j['dose'] as String? ?? '',
    givenOn: _day(j['givenOn']),
    nextDueOn: j['nextDueOn'] == null ? null : _day(j['nextDueOn']),
  );

  final String id;
  final String vaccine;
  final String dose;
  final DateTime givenOn;
  final DateTime? nextDueOn;
}

/// A child's health record, read only (`GET /v1/parent/children/:id/health`).
class HealthRecord {
  const HealthRecord({this.profile, this.visits = const [], this.vaccinations = const []});

  factory HealthRecord.fromJson(Map<String, dynamic> j) => HealthRecord(
    profile: j['profile'] == null ? null : HealthProfile.fromJson((j['profile'] as Map).cast<String, dynamic>()),
    visits: _list(j['visits'], NurseVisit.fromJson),
    vaccinations: _list(j['vaccinations'], Vaccination.fromJson),
  );

  final HealthProfile? profile;
  final List<NurseVisit> visits;
  final List<Vaccination> vaccinations;
}

class PassportSkill {
  const PassportSkill({required this.code, required this.name, required this.category, this.level, this.evidence = 0});

  factory PassportSkill.fromJson(Map<String, dynamic> j) => PassportSkill(
    code: j['code'] as String? ?? '',
    name: j['name'] as String,
    category: j['category'] as String? ?? '',
    level: (j['level'] as num?)?.toInt(),
    evidence: (j['evidence'] as List? ?? const []).length,
  );

  final String code;
  final String name;
  final String category;

  /// 1 to 5; null when there is not enough evidence yet.
  final int? level;
  final int evidence;
}

class PassportCertificate {
  const PassportCertificate({required this.title, required this.issuedOn, this.serialNo});

  factory PassportCertificate.fromJson(Map<String, dynamic> j) => PassportCertificate(title: j['title'] as String, issuedOn: _day(j['issuedOn']), serialNo: j['serialNo'] as String?);

  final String title;
  final DateTime issuedOn;
  final String? serialNo;
}

/// The Student Outcome Passport (`GET /v1/passport/me?studentId=`).
class OutcomePassport {
  const OutcomePassport({required this.studentId, required this.skills, required this.certificates, required this.clubs, required this.events, required this.verified});

  factory OutcomePassport.fromJson(Map<String, dynamic> j) {
    final act = (j['activities'] as Map? ?? const {}).cast<String, dynamic>();
    return OutcomePassport(
      studentId: (j['student'] as Map)['id'] as String,
      skills: _list(j['skills'], PassportSkill.fromJson),
      certificates: _list(j['certificates'], PassportCertificate.fromJson),
      clubs: [for (final c in (act['clubs'] as List? ?? const [])) '${(c as Map)['club']}'],
      events: [for (final e in (act['events'] as List? ?? const [])) '${(e as Map)['title']}'],
      verified: (j['verification'] as Map?)?['verified'] as bool? ?? false,
    );
  }

  final String studentId;
  final List<PassportSkill> skills;
  final List<PassportCertificate> certificates;
  final List<String> clubs;
  final List<String> events;
  final bool verified;
}

class SurveyQuestion {
  const SurveyQuestion({required this.id, required this.kind, required this.prompt, required this.options, required this.required});

  factory SurveyQuestion.fromJson(Map<String, dynamic> j) =>
      SurveyQuestion(id: j['id'] as String, kind: j['kind'] as String, prompt: j['prompt'] as String, options: _strings(j['options']), required: j['required'] as bool? ?? true);

  final String id;

  /// single, multiple, rating or text.
  final String kind;
  final String prompt;
  final List<String> options;
  final bool required;
}

/// An open survey addressed to this guardian (`GET /v1/surveys/mine`). Answered ones carry no questions.
class Survey {
  const Survey({required this.id, required this.title, required this.description, required this.anonymous, required this.answered, required this.questions, this.closesAt});

  factory Survey.fromJson(Map<String, dynamic> j) => Survey(
    id: j['id'] as String,
    title: j['title'] as String,
    description: j['description'] as String? ?? '',
    anonymous: j['anonymous'] as bool? ?? false,
    answered: j['answered'] as bool? ?? false,
    closesAt: j['closesAt'] == null ? null : _at(j['closesAt']),
    questions: _list(j['questions'], SurveyQuestion.fromJson),
  );

  final String id;
  final String title;
  final String description;
  final bool anonymous;
  final bool answered;
  final DateTime? closesAt;
  final List<SurveyQuestion> questions;
}

/// One answer to a survey question; send [choices] for single/multiple, [rating] or [text].
class SurveyAnswer {
  const SurveyAnswer(this.questionId, {this.choices, this.rating, this.text});

  final String questionId;
  final List<String>? choices;
  final int? rating;
  final String? text;

  Map<String, dynamic> toJson() => {'questionId': questionId, 'choices': ?choices, 'rating': ?rating, 'text': ?text};
}

/// A published campus event with this child's registration (`GET /v1/campus-life/me/events`).
class CampusEvent {
  const CampusEvent({required this.id, required this.title, required this.description, required this.eventType, required this.venue, required this.startsAt, required this.endsAt, required this.feePaise, required this.seatsLeft, this.registrationStatus, this.qrToken});

  factory CampusEvent.fromJson(Map<String, dynamic> j) {
    final r = (j['registration'] as Map?)?.cast<String, dynamic>();
    return CampusEvent(
      id: j['id'] as String,
      title: j['title'] as String,
      description: j['description'] as String? ?? '',
      eventType: j['eventType'] as String? ?? 'other',
      venue: j['venue'] as String? ?? '',
      startsAt: _at(j['startsAt']),
      endsAt: _at(j['endsAt']),
      feePaise: (j['feePaise'] as num?)?.toInt() ?? 0,
      seatsLeft: (j['seatsLeft'] as num?)?.toInt() ?? 0,
      registrationStatus: r?['status'] as String?,
      qrToken: r?['qrToken'] as String?,
    );
  }

  final String id;
  final String title;
  final String description;
  final String eventType;
  final String venue;
  final DateTime startsAt;
  final DateTime endsAt;
  final int feePaise;
  final int seatsLeft;

  /// registered or waitlisted; null when the child is not registered.
  final String? registrationStatus;
  final String? qrToken;

  bool get registered => registrationStatus != null;
}
