/// In-memory fake of the API. Widget tests use it directly; demo builds
/// (`--dart-define=KINETIX_DEMO=true`) use it through DemoStudentApi (demo_api.dart).
library;

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter/painting.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import '../core/alumni.dart';
import '../core/buzzer.dart';
import '../core/academic_docs.dart';
import '../core/api.dart';
import '../core/attachments.dart';
import '../core/campus.dart';
import '../core/campus_life.dart';
import '../core/campus_services.dart';
import '../core/forum.dart';
import '../core/growth.dart';
import '../core/learning.dart';
import '../core/lms.dart';
import '../core/campus_extras.dart';
import '../core/models.dart';
import '../core/pathways.dart';
import '../core/scholarships.dart';
import '../core/school_life.dart';

/// In-memory [StudentApi] for widget tests.
class FakeStudentApi implements StudentApi {
  /// LMS courses by student; the demo school publishes one with a grade.
  List<LmsCourseSummary> lmsCourseList = const [LmsCourseSummary(courseId: 'c1', title: 'Mathematics 7 B', subject: 'Mathematics', moduleCount: 2, overall: 82, letter: 'A')];
  ApiException? lmsError;

  List<ScholarshipScheme> schemes = const [ScholarshipScheme(id: 'sc1', name: 'Merit scholarship', percent: true, value: 25, minPercentage: 75, maxIncomePaise: 50000000)];
  List<ScholarshipApplication> scholarshipApps = [];
  ApiException? scholarshipError;

  // ── Course registration, passport, surveys, clubs and events ────────────────────────────────

  ApiException? campusLifeError;

  final regTerms = [RegTerm(id: 'term1', name: 'Semester 3', startsOn: DateTime(2026, 7, 1), endsOn: DateTime(2026, 12, 20))];
  RegWindow regWindow = RegWindow(opensAt: DateTime(2026, 1, 1), closesAt: DateTime(2036, 1, 1), addDropUntil: DateTime(2036, 1, 2), minCredits: 4, maxCredits: 8);

  /// Offerings by id; register / drop / rank change them.
  Map<String, CourseOffering> offerings = {
    'o1': const CourseOffering(offeringId: 'o1', subjectCode: 'COM301', subjectName: 'Corporate Accounting', category: 'core', credits: 4, seatCap: 60, seatsLeft: 20, eligible: true, facultyName: 'Anita Sharma', myStatus: 'registered', myApproval: 'approved'),
    'o2': const CourseOffering(offeringId: 'o2', subjectCode: 'COM3E1', subjectName: 'Financial Markets', category: 'elective', credits: 3, seatCap: 30, seatsLeft: 4, eligible: true),
    'o3': const CourseOffering(offeringId: 'o3', subjectCode: 'COM3E2', subjectName: 'Business Analytics', category: 'elective', credits: 3, seatCap: 30, seatsLeft: 0, eligible: true),
    'o4': const CourseOffering(offeringId: 'o4', subjectCode: 'COM3E3', subjectName: 'Advanced Taxation', category: 'elective', credits: 4, seatCap: 30, seatsLeft: 9, eligible: false, blockedText: 'Needs Taxation 1 first.'),
  };

  @override
  Future<List<RegTerm>> registrationTerms() async {
    calls.add('regTerms');
    if (campusLifeError != null) throw campusLifeError!;
    return List.of(regTerms);
  }

  @override
  Future<OfferingList> courseOfferings(String termId) async {
    calls.add('offerings $termId');
    if (campusLifeError != null) throw campusLifeError!;
    return OfferingList(window: regWindow, offerings: offerings.values.toList());
  }

  @override
  Future<MyRegistrations> myRegistrations(String termId) async {
    calls.add('myRegistrations $termId');
    final mine = [
      for (final o in offerings.values)
        if (o.myStatus != null)
          MyRegistration(offeringId: o.offeringId, subjectCode: o.subjectCode, subjectName: o.subjectName, credits: o.credits, category: o.category, status: o.myStatus!, approval: o.myApproval ?? 'pending', preferenceRank: o.myRank),
    ];
    final regd = mine.where((r) => r.status == 'registered');
    return MyRegistrations(
      window: regWindow,
      registeredCredits: regd.fold(0.0, (a, r) => a + r.credits),
      approvedCredits: regd.where((r) => r.approval == 'approved').fold(0.0, (a, r) => a + r.credits),
      minCredits: regWindow.minCredits,
      maxCredits: regWindow.maxCredits,
      registrations: mine,
    );
  }

  CourseOffering _with(CourseOffering o, {String? status, int? rank, bool clear = false}) => CourseOffering(
    offeringId: o.offeringId,
    subjectCode: o.subjectCode,
    subjectName: o.subjectName,
    category: o.category,
    credits: o.credits,
    seatCap: o.seatCap,
    seatsLeft: o.seatsLeft,
    eligible: o.eligible,
    facultyName: o.facultyName,
    blockedText: o.blockedText,
    myStatus: clear ? null : (status ?? o.myStatus),
    myRank: clear ? null : rank,
    myApproval: clear ? null : o.myApproval,
  );

  @override
  Future<void> registerCourse(String offeringId) async {
    calls.add('registerCourse $offeringId');
    if (campusLifeError != null) throw campusLifeError!;
    offerings[offeringId] = _with(offerings[offeringId]!, status: 'registered');
  }

  @override
  Future<void> dropCourse(String offeringId) async {
    calls.add('dropCourse $offeringId');
    if (campusLifeError != null) throw campusLifeError!;
    offerings[offeringId] = _with(offerings[offeringId]!, clear: true);
  }

  @override
  Future<void> setCoursePreferences(String termId, List<String> offeringIds) async {
    calls.add('preferences ${offeringIds.join(',')}');
    if (campusLifeError != null) throw campusLifeError!;
    for (final e in offerings.entries.toList()) {
      if (e.value.myStatus == 'preference') offerings[e.key] = _with(e.value, clear: true);
    }
    for (var i = 0; i < offeringIds.length; i++) {
      offerings[offeringIds[i]] = _with(offerings[offeringIds[i]]!, status: 'preference', rank: i + 1);
    }
  }

  OutcomePassport passportData = const OutcomePassport(
    studentId: 's1',
    fullName: 'Aarav Rao',
    rollNo: '21',
    className: 'BCom Sem 3 A',
    skills: [
      PassportSkill(skillId: 'k1', code: 'COM', name: 'Communication', category: 'Life skills', level: 4, evidence: [EvidenceLine(source: 'club', title: 'Debate club', detail: 'Finalist', level: 4)]),
      PassportSkill(skillId: 'k2', code: 'NUM', name: 'Numeracy', category: 'Core', level: null),
    ],
    certificates: ['Participation certificate - Debate club'],
    clubs: ['Debate club · 40'],
    events: ['Annual day'],
    verified: true,
  );

  @override
  Future<OutcomePassport> passport(String studentId) async {
    calls.add('passport $studentId');
    if (campusLifeError != null) throw campusLifeError!;
    return passportData;
  }

  @override
  Future<Uint8List> passportPdf(String studentId) async {
    calls.add('passportPdf $studentId');
    return Uint8List.fromList('%PDF-1.4 passport'.codeUnits);
  }

  List<ForumThreadRow> forum = [const ForumThreadRow(id: 'f1', title: 'Doubt about the second unit', author: 'Latha Rao', replies: 1, pinned: false, locked: false)];
  final Map<String, List<ForumPost>> forumPosts = {'f1': [const ForumPost(id: 'p1', body: 'Start from the definition, then follow the three steps.', author: 'Latha Rao', createdAt: '2026-10-09T10:00:00Z')]};

  @override
  Future<List<ForumThreadRow>> forumThreads(String courseId) async {
    calls.add('forumThreads $courseId');
    return forum;
  }

  @override
  Future<ForumThread> forumThread(String threadId) async {
    final row = forum.firstWhere((t) => t.id == threadId);
    return ForumThread(id: row.id, title: row.title, body: 'Can someone explain the worked example?', author: row.author, locked: row.locked, posts: forumPosts[threadId] ?? const []);
  }

  @override
  Future<void> startThread(String courseId, String title, String body) async {
    calls.add('startThread $title');
    forum = [...forum, ForumThreadRow(id: 'f${forum.length + 1}', title: title, author: 'Me', replies: 0, pinned: false, locked: false)];
  }

  @override
  Future<void> replyToThread(String threadId, String body) async {
    calls.add('reply $threadId $body');
    forumPosts[threadId] = [...(forumPosts[threadId] ?? const []), ForumPost(id: 'p${(forumPosts[threadId]?.length ?? 0) + 1}', body: body, author: 'Me', createdAt: '2026-10-10T10:00:00Z')];
  }

  List<RepairRequest> repairList = [
    RepairRequest(id: 'w1', title: 'Fix the leaking tap', status: 'in_progress', complaint: 'The tap in room 12 drips all night', dueOn: DateTime(2026, 10, 14)),
    RepairRequest(id: 'w2', title: 'Replace the tube light', status: 'verified', complaint: 'Light in the corridor is out', completedAt: DateTime(2026, 10, 6)),
  ];
  InstalmentSchedule? instalmentData;

  @override
  Future<void> renewLoan(String loanId) async => calls.add('renewLoan $loanId');

  @override
  Future<void> rateMeal({required String mealDate, required String meal, required int rating, String comment = ''}) async =>
      calls.add('rateMeal $mealDate $meal $rating $comment');

  @override
  Future<List<RepairRequest>> repairRequests() async {
    calls.add('repairRequests');
    return repairList;
  }

  @override
  Future<List<InstalmentSchedule>> studentInstalments(String studentId) async {
    calls.add('studentInstalments $studentId');
    return [await instalments('i1'), await instalments('i2')];
  }

  @override
  Future<InstalmentSchedule> instalments(String invoiceId) async {
    calls.add('instalments $invoiceId');
    return instalmentData ??
        InstalmentSchedule(
          invoiceId: invoiceId,
          title: 'Term 2 fee',
          amountPaise: 3000000,
          paidPaise: 1500000,
          instalments: [
            Instalment(seq: 1, dueOn: DateTime(2026, 9, 10), amountPaise: 1000000, paidPaise: 1000000, status: 'paid'),
            Instalment(seq: 2, dueOn: DateTime(2026, 10, 5), amountPaise: 1000000, paidPaise: 500000, status: 'overdue'),
            Instalment(seq: 3, dueOn: DateTime(2026, 11, 10), amountPaise: 1000000, paidPaise: 0, status: 'due'),
          ],
        );
  }

  String deviceStateValue = 'new';

  @override
  Future<String> deviceState() async => deviceStateValue;

  @override
  Future<void> trustDevice(String label) async {
    calls.add('trustDevice $label');
    deviceStateValue = 'trusted';
  }

  LearningSummary learning = const LearningSummary(
    worksheets: [
      LearningWorksheet(id: 'w1', kind: 'worksheet', title: 'Fractions practice sheet', subjectName: 'Maths', dueOn: '2026-10-25', maxScore: 20, score: 16, remarks: 'Careful working'),
      LearningWorksheet(id: 'w2', kind: 'activity', title: 'Market role play', subjectName: 'Economics', maxScore: 4, level: 'Secure'),
      LearningWorksheet(id: 'w3', kind: 'reading', title: 'Reading: an annual report extract', subjectName: 'Accounting', dueOn: '2026-10-30', maxScore: 10),
    ],
    help: [ExtraHelp(id: 'r1', subjectName: 'Maths', plan: 'Re-teach ratios with two short exercises a week', dueOn: '2026-11-02', status: 'open')],
    readiness: [ReadinessRow(exam: 'KMAT', targetPct: 65, latestPct: 58, averagePct: 55.5, band: 'close', trend: 'up', weakSubjects: ['Quantitative aptitude'], tests: 3)],
    promotion: PromotionNote(decision: 'promoted_with_grace', reasons: ['Grace marks used in: Hindi']),
  );
  LearningAdvice advice = const LearningAdvice(
    mastery: [MasterySubject(subject: 'Maths', assessed: 4, percent: 50), MasterySubject(subject: 'Economics', assessed: 3, percent: 100)],
    practice: [PracticeItem(kind: 'practice', title: 'Ratios and proportion', reason: 'Builds M6.2 (beginning)'), PracticeItem(kind: 'overdue', title: 'Homework 4', reason: 'Was due 2026-10-01')],
  );

  @override
  Future<LearningSummary> learningSummary(String studentId) async {
    calls.add('learningSummary $studentId');
    return learning;
  }

  @override
  Future<LearningAdvice> learningAdvice(String studentId) async {
    calls.add('learningAdvice $studentId');
    return advice;
  }

  DpdpOfficer officer = const DpdpOfficer(name: 'Gita Rao', email: 'gita@school.in', phone: '+91 98450 00000', response: 'The officer replies within 30 days.');
  List<DpdpRequest> dpdpList = const [DpdpRequest(id: 'r0', kind: 'correction', status: 'completed', details: 'Fix my name', resolutionNote: 'Done')];
  List<String> erasureBlocks = const ['Fee records are kept for 8 years'];

  @override
  Future<DpdpOfficer> dpdpOfficer() async => officer;

  @override
  Future<DataExport> dpdpExport() async {
    calls.add('dpdpExport');
    return const DataExport({'profile': 1, 'attendance': 40, 'marks': 12});
  }

  @override
  Future<Uint8List> dpdpExportPdf() async {
    calls.add('dpdpExportPdf');
    return Uint8List.fromList('%PDF-1.4 my data'.codeUnits);
  }

  @override
  Future<List<DpdpRequest>> dpdpRequests() async => dpdpList;

  @override
  Future<DpdpRequest> dpdpRequest({required String kind, String details = '', String? field, String? value}) async {
    calls.add('dpdpRequest $kind ${field ?? '-'}=${value ?? '-'} "$details"');
    final r = DpdpRequest(id: 'r${dpdpList.length + 1}', kind: kind, status: 'pending', details: details, retentionReasons: kind == 'erasure' ? erasureBlocks : const []);
    dpdpList = [r, ...dpdpList];
    return r;
  }

  List<HouseRow> houseList = const [
    HouseRow(id: 'h1', name: 'Kaveri', colour: '#1d4ed8', motto: 'Flow on', members: 12, points: 90, rank: 2),
    HouseRow(id: 'h2', name: 'Tunga', colour: '#b91c1c', motto: '', members: 10, points: 140, rank: 1),
  ];
  Map<String, HouseDetail> houseDetails = const {
    'h1': HouseDetail(
      name: 'Kaveri',
      motto: 'Flow on',
      members: [HouseMember(studentId: 's1', name: 'Asha Rao', points: 20, isCaptain: false), HouseMember(studentId: 's9', name: 'Dev Kumar', points: 30, isCaptain: true)],
      ledger: [HousePointEntry(points: 10, reason: 'Won the quiz', category: 'academics', awardedOn: '2026-10-02')],
      total: 90,
    ),
    'h2': HouseDetail(name: 'Tunga', motto: '', members: [], ledger: [], total: 140),
  };

  @override
  Future<List<HouseRow>> houses() async => houseList;

  @override
  Future<HouseDetail> houseDetail(String id) async => houseDetails[id]!;

  List<PeerReviewTask> peerTasks = const [
    PeerReviewTask(id: 'pr1', label: 'A', text: 'Goodwill is the extra value of a business.', fileCount: 0, done: false),
    PeerReviewTask(id: 'pr2', label: 'B', text: 'See the photo.', fileCount: 1, done: true, clarity: 4, accuracy: 3, effort: 5, comment: 'Neat'),
  ];
  PeerFeedback peerReceived = const PeerFeedback(pending: 1, average: 12, reviews: [(clarity: 5, accuracy: 4, effort: 3, total: 12, comment: 'Clear and tidy')]);

  @override
  Future<List<PeerReviewTask>> peerReviewTasks(String homeworkId) async => peerTasks;

  @override
  Future<PeerFeedback> peerFeedback(String homeworkId) async => peerReceived;

  @override
  Future<void> submitPeerReview(String homeworkId, String reviewId, {required int clarity, required int accuracy, required int effort, required String comment}) async {
    calls.add('peerReview $homeworkId $reviewId $clarity/$accuracy/$effort "$comment"');
    peerTasks = [
      for (final t in peerTasks)
        if (t.id == reviewId) PeerReviewTask(id: t.id, label: t.label, text: t.text, fileCount: t.fileCount, done: true, clarity: clarity, accuracy: accuracy, effort: effort, comment: comment) else t,
    ];
  }

  List<MySurvey> surveyList = const [
    MySurvey(
      id: 'sv1',
      title: 'Course feedback',
      description: 'Tell us how the term went.',
      anonymous: true,
      answered: false,
      questions: [
        SurveyQuestion(id: 'q1', kind: 'single', prompt: 'How was the pace?', options: ['Too slow', 'Just right', 'Too fast'], required: true),
        SurveyQuestion(id: 'q2', kind: 'multiple', prompt: 'What helped?', options: ['Notes', 'Labs', 'Recordings'], required: false),
        SurveyQuestion(id: 'q3', kind: 'rating', prompt: 'Rate the course', options: [], required: true),
        SurveyQuestion(id: 'q4', kind: 'text', prompt: 'Anything else?', options: [], required: false),
      ],
    ),
  ];
  List<SurveyAnswer>? lastSurveyAnswers;

  @override
  Future<List<MySurvey>> mySurveys() async {
    calls.add('mySurveys');
    if (campusLifeError != null) throw campusLifeError!;
    return List.of(surveyList);
  }

  @override
  Future<void> submitSurvey(String surveyId, List<SurveyAnswer> answers) async {
    calls.add('submitSurvey $surveyId ${answers.length}');
    if (campusLifeError != null) throw campusLifeError!;
    lastSurveyAnswers = answers;
    surveyList = [
      for (final s in surveyList)
        if (s.id != surveyId) s,
    ];
  }

  List<MyClub> clubList = const [
    MyClub(id: 'cl1', name: 'Debate club', category: 'Arts', description: 'Weekly debates.', points: 40, membershipStatus: 'active'),
    MyClub(id: 'cl2', name: 'Robotics club', category: 'Science', description: 'Build and compete.', points: 0),
  ];

  MyClub _club(MyClub c, String? status) => MyClub(id: c.id, name: c.name, category: c.category, description: c.description, points: c.points, membershipStatus: status);

  @override
  Future<List<MyClub>> myClubs(String studentId) async {
    calls.add('myClubs $studentId');
    if (campusLifeError != null) throw campusLifeError!;
    return List.of(clubList);
  }

  @override
  Future<void> joinClub(String studentId, String clubId) async {
    calls.add('joinClub $clubId');
    if (campusLifeError != null) throw campusLifeError!;
    clubList = [for (final c in clubList) c.id == clubId ? _club(c, 'requested') : c];
  }

  @override
  Future<void> leaveClub(String studentId, String clubId) async {
    calls.add('leaveClub $clubId');
    if (campusLifeError != null) throw campusLifeError!;
    clubList = [for (final c in clubList) c.id == clubId ? _club(c, 'left') : c];
  }

  List<CampusEvent> eventList = [
    CampusEvent(id: 'ev1', title: 'Annual day', description: 'Cultural programme.', eventType: 'cultural', venue: 'Main hall', startsAt: DateTime(2036, 1, 10, 10), endsAt: DateTime(2036, 1, 10, 14), feePaise: 0, seatsLeft: 50),
    CampusEvent(id: 'ev2', title: 'Hackathon', description: '', eventType: 'technical', venue: 'Lab 2', startsAt: DateTime(2036, 1, 12, 9), endsAt: DateTime(2036, 1, 12, 18), feePaise: 5000, seatsLeft: 0, seat: const EventSeat(id: 'r2', status: 'registered', qrToken: 'tok-hackathon-0002', checkedIn: false)),
  ];
  List<MyEventRegistration> eventRegs = [
    MyEventRegistration(id: 'r2', eventId: 'ev2', title: 'Hackathon', venue: 'Lab 2', startsAt: DateTime(2036, 1, 12, 9), status: 'registered', qrToken: 'tok-hackathon-0002', checkedIn: false, feedbackGiven: false, canGiveFeedback: false),
    MyEventRegistration(id: 'r0', eventId: 'ev0', title: 'Science fair', venue: 'Ground', startsAt: DateTime(2026, 9, 1, 9), status: 'registered', qrToken: 'tok-fair-0000', checkedIn: true, feedbackGiven: false, canGiveFeedback: true),
  ];

  CampusEvent _event(CampusEvent e, EventSeat? seat) => CampusEvent(id: e.id, title: e.title, description: e.description, eventType: e.eventType, venue: e.venue, startsAt: e.startsAt, endsAt: e.endsAt, feePaise: e.feePaise, seatsLeft: e.seatsLeft, seat: seat);

  @override
  Future<List<CampusEvent>> campusEvents(String studentId) async {
    calls.add('campusEvents $studentId');
    if (campusLifeError != null) throw campusLifeError!;
    return List.of(eventList);
  }

  @override
  Future<void> registerForEvent(String studentId, String eventId) async {
    calls.add('registerForEvent $eventId');
    if (campusLifeError != null) throw campusLifeError!;
    final e = eventList.firstWhere((e) => e.id == eventId);
    final seat = EventSeat(id: 'r-$eventId', status: 'registered', qrToken: 'tok-$eventId-0001', checkedIn: false);
    eventList = [for (final x in eventList) x.id == eventId ? _event(x, seat) : x];
    eventRegs = [MyEventRegistration(id: seat.id, eventId: eventId, title: e.title, venue: e.venue, startsAt: e.startsAt, status: 'registered', qrToken: seat.qrToken, checkedIn: false, feedbackGiven: false, canGiveFeedback: false), ...eventRegs];
  }

  @override
  Future<void> cancelEventRegistration(String studentId, String eventId) async {
    calls.add('cancelEvent $eventId');
    if (campusLifeError != null) throw campusLifeError!;
    eventList = [for (final x in eventList) x.id == eventId ? _event(x, null) : x];
    eventRegs = [
      for (final r in eventRegs)
        if (r.eventId != eventId) r,
    ];
  }

  @override
  Future<List<MyEventRegistration>> myEventRegistrations(String studentId) async {
    calls.add('myEventRegistrations $studentId');
    if (campusLifeError != null) throw campusLifeError!;
    return List.of(eventRegs);
  }

  @override
  Future<void> giveEventFeedback(String studentId, String eventId, {required int rating, String comment = ''}) async {
    calls.add('eventFeedback $eventId $rating $comment');
    if (campusLifeError != null) throw campusLifeError!;
    eventRegs = [
      for (final r in eventRegs)
        r.eventId == eventId
            ? MyEventRegistration(id: r.id, eventId: r.eventId, title: r.title, venue: r.venue, startsAt: r.startsAt, status: r.status, qrToken: r.qrToken, checkedIn: r.checkedIn, feedbackGiven: true, canGiveFeedback: false)
            : r,
    ];
  }

  @override
  Future<List<ScholarshipScheme>> scholarshipSchemes() async {
    calls.add('scholarshipSchemes');
    if (scholarshipError != null) throw scholarshipError!;
    return List.of(schemes);
  }

  @override
  Future<List<ScholarshipApplication>> scholarshipApplications(String studentId) async {
    calls.add('scholarshipApplications $studentId');
    return List.of(scholarshipApps);
  }

  @override
  Future<void> applyScholarship(String studentId, {required String schemeId, int? incomePaise, String note = ''}) async {
    calls.add('applyScholarship $schemeId $incomePaise $note');
    if (scholarshipError != null) throw scholarshipError!;
    scholarshipApps = [ScholarshipApplication(id: 'sa${scholarshipApps.length + 1}', scheme: schemes.firstWhere((s) => s.id == schemeId).name, status: ScholarshipStatus.pending), ...scholarshipApps];
  }

  @override
  Future<List<LmsCourseSummary>> lmsCourses(String studentId) async {
    calls.add('lmsCourses $studentId');
    if (lmsError != null) throw lmsError!;
    return List.of(lmsCourseList);
  }

  @override
  Future<LmsCourseDetail> lmsCourse(String courseId, String studentId) async {
    calls.add('lmsCourse $courseId');
    if (lmsError != null) throw lmsError!;
    return const LmsCourseDetail(
      title: 'Mathematics 7 B',
      subject: 'Mathematics',
      description: '',
      modules: [
        LmsModule(title: 'Fractions', items: [LmsItem(kind: 'topic', title: 'Adding fractions'), LmsItem(kind: 'link', title: 'Practice sheet', url: 'https://example.com/p')]),
        LmsModule(title: 'Decimals', items: []),
      ],
      announcements: ['Unit test on Friday'],
      parts: [LmsGradePart(name: 'Tests', weight: 60, percent: 80), LmsGradePart(name: 'Homework', weight: 40, percent: 85)],
      overall: 82,
      letter: 'A',
    );
  }

  @override
  String baseUrl = 'http://test';
  @override
  String? token;

  final calls = <String>[];

  Me profile = Me(
    id: 'u1',
    fullName: 'Aarav Patel',
    roles: ['student'],
    preferredLanguage: 'en',
    institution: 'Demo College',
    email: 'aarav@demo.kinetix.in',
  );

  StudentProfile? record = StudentProfile(
    id: 's1',
    fullName: 'Aarav Patel',
    rollNo: 'U03BC001',
    sectionId: 'sec1',
    sectionName: 'BCom Sem 3 A',
    term: 3,
    programName: 'BCom',
    programLevel: 'ug',
  );

  static final today = DateTime(2026, 10, 4);

  Homework homework({
    String id = 'h1',
    String title = 'Exercise 4.2: Issue of shares',
    int dueIn = 1,
    String subject = 'Corporate Accounting',
  }) => Homework(
    id: id,
    title: title,
    instructions: 'Solve questions 1 to 5 from the textbook. Show journal entries for each.',
    dueOn: today.add(Duration(days: dueIn)),
    subject: subject,
    teacher: 'Anita Sharma',
  );

  /// Thrown by [summary] when set.
  ApiException? summaryError;

  late StudentSummary studentSummary = StudentSummary(
    today: today,
    days: 30,
    attendance: AttendanceSummary(
      periods: 30,
      present: 22,
      absent: 6,
      late: 2,
      excused: 0,
      rate: 80,
      recentAbsences: [
        ClassMark(
          date: DateTime(2026, 10, 1),
          status: AttendanceStatus.absent,
          subject: 'Corporate Accounting',
          startsAt: ClockTime.parse('10:00:00'),
        ),
      ],
    ),
    upcoming: [
      homework(),
      homework(id: 'h2', title: 'Cost sheet practice', dueIn: 5, subject: 'Cost Accounting'),
    ],
    pastHomework: [homework(id: 'h3', title: 'Forfeiture of shares: notes', dueIn: -3)],
    boards: [board.summary],
    recordings: recordings,
  );

  List<ClassMark> attendanceMarks = [
    ClassMark(
      date: DateTime(2026, 10, 3),
      status: AttendanceStatus.present,
      subject: 'Cost Accounting',
      startsAt: ClockTime.parse('09:00:00'),
    ),
    ClassMark(
      date: DateTime(2026, 10, 1),
      status: AttendanceStatus.absent,
      subject: 'Corporate Accounting',
      startsAt: ClockTime.parse('10:00:00'),
    ),
    ClassMark(
      date: DateTime(2026, 10, 1),
      status: AttendanceStatus.late,
      subject: 'Cost Accounting',
      startsAt: ClockTime.parse('12:15:00'),
    ),
  ];

  late List<AppNotification> inbox = [
    AppNotification(
      id: 'n1',
      kind: NotificationKind.homework,
      title: 'Homework: Corporate Accounting',
      body: 'Exercise 4.2: Issue of shares · due 2026-10-05',
      data: {'homeworkId': 'h1', 'sectionId': 'sec1'},
      createdAt: DateTime.now(),
    ),
    AppNotification(
      id: 'n2',
      kind: NotificationKind.fee,
      title: 'Payment received: ₹42,500',
      body: 'Semester 3 tuition fee for Aarav Patel. Receipt RCPT/2026-27/00001.',
      data: {'paymentId': 'p1', 'studentId': 's1'},
      createdAt: DateTime.now().subtract(const Duration(days: 2)),
    ),
    AppNotification(
      id: 'n3',
      kind: NotificationKind.broadcast,
      title: 'College day',
      body: 'Saturday 10 October, 10:00 in the main hall.',
      data: {'broadcastId': 'b1'},
      createdAt: DateTime.now().subtract(const Duration(days: 5)),
      readAt: DateTime.now().subtract(const Duration(days: 4)),
    ),
  ];

  AppNotification notice(String id, NotificationKind kind, Map<String, dynamic> data, {String title = 'Update'}) =>
      AppNotification(id: id, kind: kind, title: title, body: 'Open it to see more.', data: data, createdAt: DateTime.now());

  /// Shared with the class, newest first: Aarav missed the older one.
  late List<RecordingInfo> recordings = [
    recordingJson('r1', 'Cost sheets', subject: 'Cost Accounting', startedAt: '2026-10-04T03:30:00Z', expiresOn: '2027-01-10'),
    recordingJson('r2', 'Issue of shares', subject: 'Corporate Accounting', startedAt: '2026-10-01T04:30:00Z', missed: true),
  ].map(RecordingInfo.fromJson).toList();

  static Map<String, dynamic> recordingJson(
    String id,
    String title, {
    required String subject,
    required String startedAt,
    bool missed = false,
    bool keep = false,
    String? expiresOn,
  }) => {
    'id': id,
    'title': title,
    'startedAt': startedAt,
    'durationMs': 20000,
    'hasAudio': true,
    'sectionId': 'sec1',
    'sectionName': 'BCom Sem 3 A',
    'subjectName': subject,
    'teacherName': 'Anita Sharma',
    'transcriptState': 'done',
    'summaryState': 'done',
    'sharedAt': startedAt,
    'finishedAt': startedAt,
    'missed': missed,
    'keep': keep,
    'expiresOn': expiresOn,
  };

  Map<String, dynamic> recordingJsonOf(String id, {bool missed = false}) =>
      recordingJson(id, 'Lesson $id', subject: 'Subject $id', startedAt: '2026-10-0${1 + id.hashCode % 3}T04:30:00Z', missed: missed);

  static Map<String, dynamic> lessonJson = {
    'v': 1,
    'canvas': {'w': 1920, 'h': 1080},
    'background': 'plain',
    'durationMs': 20000,
    'events': [
      [
        0,
        'L',
        [<Object>[]],
        0,
      ],
      [
        1000,
        'b',
        1,
        {
          't': 'pen',
          'c': 4279966495,
          'w': 4,
          'p': [100, 100, 400, 400],
        },
      ],
      [1100, 'e', 1],
    ],
  };

  SharedBoard board = SharedBoard.fromJson({
    'id': 'wb1',
    'title': 'Issue and forfeiture of shares',
    'pageCount': 2,
    'sectionName': 'BCom Sem 3 A',
    'subjectName': 'Corporate Accounting',
    'teacherName': 'Anita Sharma',
    'sharedAt': '2026-10-04T06:30:00Z',
    'content': {
      'v': 1,
      'background': 'grid',
      'canvas': {'w': 1920, 'h': 1080},
      'pages': [
        {
          'strokes': [
            {
              't': 'pen',
              'c': 4279966495,
              'w': 4,
              'p': [100, 100, 400, 100, 400, 500],
            },
          ],
        },
        {
          'strokes': [
            {
              't': 'shape',
              's': 'arrow',
              'c': 4292423717,
              'w': 5,
              'p': [100, 100, 600, 300],
            },
          ],
        },
      ],
    },
  });

  // -- Subjects and the content library ---------------------------------------------------------

  final corpAcc = const Subject(id: 'sub1', name: 'Corporate Accounting', code: 'BCOM-3.1');
  final costing = const Subject(id: 'sub2', name: 'Cost Accounting', code: 'BCOM-3.3');

  late Map<String, Subject> subjectOfHomework = {'h1': corpAcc, 'h2': costing, 'h3': corpAcc};

  TopicDetail underwriting = TopicDetail(
    id: 't1',
    title: 'Underwriting and underwriting commission',
    summary: 'What underwriting is, its kinds, and the commission allowed by law.',
    notes: [
      'Underwriting is an agreement to take up shares not subscribed by the public.',
      'Commission may not exceed 5% of the issue price of shares.',
    ],
    outcomes: ["Compute each underwriter's net liability"],
    chapterTitle: 'Underwriting of Shares',
    courseTitle: 'Corporate Accounting, BCom Semester 3',
    reviewed: false,
  );

  late Map<String, CourseOutline?> syllabi = {
    'sub1': CourseOutline(
      id: 'c1',
      title: 'Corporate Accounting, BCom Semester 3',
      reviewed: false,
      chapters: [
        OutlineChapter(
          id: 'ch1',
          title: 'Underwriting of Shares',
          topics: [OutlineTopic(id: 't1', title: underwriting.title, summary: underwriting.summary)],
        ),
        OutlineChapter(
          id: 'ch2',
          title: 'Valuation of Goodwill',
          topics: [OutlineTopic(id: 't2', title: 'Methods of valuing goodwill', summary: 'Average profit and super profit methods.')],
        ),
      ],
    ),
    'sub2': null,
  };

  List<TopicHit> hits = [];

  // -- KINETIX AI -------------------------------------------------------------------------------

  /// What [explain] returns; [explainError] wins when set.
  Explanation answer = Explanation(
    answer: 'Underwriting commission is paid to underwriters for taking the risk of an issue not being fully subscribed.',
    keyPoints: ['Paid on the issue price', 'Limited by the Companies Act, 2013'],
    followUps: ['How is net liability worked out?', 'What are marked applications?'],
    preview: false,
    sources: [const TopicRef(id: 't1', title: 'Underwriting and underwriting commission')],
  );
  ApiException? explainError;

  /// When set, [explain] waits for it (to see the loading state).
  Completer<void>? explainGate;

  final explainRequests = <Map<String, Object?>>[];

  // -- Fees ---------------------------------------------------------------------------------------

  FeeAccount feeAccount = FeeAccount(
    duePaise: 185000,
    onlinePayments: 'demo',
    invoices: [
      FeeInvoice(
        id: 'i1',
        title: 'Semester 3 tuition fee',
        amountPaise: 4250000,
        paidPaise: 4250000,
        dueOn: DateTime(2026, 10, 14),
        status: InvoiceStatus.paid,
      ),
      FeeInvoice(
        id: 'i2',
        title: 'Exam fee (Nov 2026)',
        amountPaise: 185000,
        paidPaise: 0,
        dueOn: DateTime(2026, 10, 2),
        status: InvoiceStatus.due,
      ),
    ],
    payments: [
      FeePayment(
        id: 'p1',
        invoiceId: 'i1',
        amountPaise: 4250000,
        method: 'upi',
        receiptNo: 'RCPT/2026-27/00001',
        paidAt: DateTime(2026, 10, 2, 11, 30),
      ),
    ],
  );

  ApiException? feesError;

  @override
  Future<void> login({required String tenant, required String login, required String password}) async {
    calls.add('login $tenant $login');
    if (password != 'kinetix123') throw ApiException(401, 'Wrong institution, login or password');
    token = 'tok';
  }

  /// Codes the fake "texts": 123456 always works.
  static const otpCode = '123456';

  /// Makes `POST /v1/auth/otp/request` answer 429 `RATE_LIMITED`.
  bool otpRateLimited = false;

  @override
  Future<OtpChallenge> requestOtp({required String tenant, required String phone}) async {
    calls.add('otp request $tenant $phone');
    if (otpRateLimited) throw ApiException(429, 'Too many requests', code: 'RATE_LIMITED', retryAfterSeconds: 45);
    return const OtpChallenge(retryAfterSeconds: 30, expiresInSeconds: 300);
  }

  @override
  Future<void> verifyOtp({required String tenant, required String phone, required String code}) async {
    calls.add('otp verify $tenant $phone $code');
    if (code != otpCode) throw ApiException(401, 'Invalid or expired code', code: 'OTP_INVALID');
    token = 'tok';
  }

  @override
  Future<Me> me() async {
    if (rejectToken) throw ApiException(401, 'Invalid or expired token', code: 'AUTH_EXPIRED');
    return profile;
  }

  /// Makes `GET /v1/me` answer 401 (the stored token expired).
  bool rejectToken = false;

  /// Set to make `PATCH /v1/me` fail (offline).
  bool failLanguage = false;

  @override
  Future<Me> setPreferredLanguage(String language) async {
    calls.add('language $language');
    if (failLanguage) throw ApiException(0, 'offline');
    return profile = Me(
      id: profile.id,
      fullName: profile.fullName,
      roles: profile.roles,
      preferredLanguage: language,
      institution: profile.institution,
      email: profile.email,
      phone: profile.phone,
    );
  }

  @override
  Future<StudentProfile> student() async {
    calls.add('student');
    final r = record;
    if (r == null) throw ApiException(404, 'No student record is linked to this login');
    return r;
  }

  @override
  Future<StudentSummary> summary(String studentId, {int days = 30}) async {
    calls.add('summary $studentId');
    if (summaryError != null) throw summaryError!;
    return studentSummary;
  }

  @override
  Future<List<ClassMark>> attendance(String studentId, {int days = 30}) async {
    calls.add('attendance $studentId');
    return attendanceMarks;
  }

  @override
  Future<Inbox> notifications() async => Inbox(unread: inbox.where((n) => n.unread).length, items: inbox);

  @override
  Future<bool> scanAttendance(String code) async {
    calls.add('scan $code');
    return false;
  }

  @override
  Future<void> markRead(String notificationId) async => calls.add('read $notificationId');

  @override
  Future<void> markAllRead() async => calls.add('read-all');

  @override
  Future<SharedBoard> whiteboard(String id) async {
    calls.add('board $id');
    if (id != board.summary.id) throw ApiException(404, 'Board not found');
    return board;
  }

  @override
  Future<List<Subject>> subjects() async {
    calls.add('subjects');
    final out = <Subject>[];
    for (final s in subjectOfHomework.values) {
      if (!out.any((x) => x.id == s.id)) out.add(s);
    }
    return out;
  }

  @override
  Future<HomeworkDetail> homeworkById(String id) async {
    calls.add('homework $id');
    final s = subjectOfHomework[id];
    final hw = [...studentSummary.upcoming, ...studentSummary.pastHomework].where((h) => h.id == id).firstOrNull;
    if (s == null || hw == null) throw ApiException(404, 'Homework not found');
    return HomeworkDetail(homework: hw, sectionId: 'sec1', subject: s);
  }

  @override
  Future<RecordingInfo> recording(String id) async {
    calls.add('recording $id');
    final r = recordings.where((r) => r.id == id).firstOrNull;
    if (r == null) throw ApiException(404, 'Recording not found');
    return RecordingInfo.fromJson({
      ...recordingJson(r.id, r.title, subject: r.subjectName!, startedAt: r.startedAt.toUtc().toIso8601String()),
      'missed': null,
      'transcript': 'Today we look at how companies issue shares.',
      'summary': {
        'summary': 'How companies issue shares.',
        'keyPoints': ['Shares can be issued at par or at a premium'],
      },
    });
  }

  @override
  Future<Lesson> recordingLesson(String id) async {
    calls.add('lesson $id');
    return Lesson.fromJson(lessonJson);
  }

  @override
  Future<Explanation> explain({
    required String question,
    required AiLanguage language,
    String? sectionId,
    String? subjectId,
    String? topicId,
  }) async {
    explainRequests.add({
      'question': question,
      'language': language.name,
      'sectionId': sectionId,
      'subjectId': subjectId,
      'topicId': topicId,
    });
    calls.add('explain $question');
    if (explainGate != null) await explainGate!.future;
    if (explainError != null) throw explainError!;
    return answer;
  }

  /// The tutor's saved conversation (one thread), kept between questions like the server does.
  final tutorLog = <TutorMessage>[];
  final tutorRequests = <Map<String, Object?>>[];
  ApiException? tutorError;

  @override
  Future<TutorReply> tutorAsk({required String question, required AiLanguage language, String? threadId, String? subjectId}) async {
    tutorRequests.add({'question': question, 'language': language.name, 'threadId': threadId, 'subjectId': subjectId});
    calls.add('tutor $question');
    if (tutorError != null) throw tutorError!;
    final reply = TutorReply(
      threadId: 'th1',
      answer: 'Think of ${question.toLowerCase()} step by step: first the idea, then an example.',
      keyPoints: const ['Start with the definition'],
      nextSteps: const ['Try two questions on Corporate Accounting'],
      followUps: const ['Can you give an example?'],
      preview: false,
    );
    tutorLog
      ..add(TutorMessage(fromStudent: true, text: question))
      ..add(TutorMessage(fromStudent: false, text: reply.answer));
    return reply;
  }

  @override
  Future<List<TutorThread>> tutorThreads() async => tutorLog.isEmpty ? const [] : const [TutorThread(id: 'th1', title: 'Earlier conversation')];

  @override
  Future<List<TutorMessage>> tutorMessages(String threadId) async {
    calls.add('tutorMessages $threadId');
    return List.of(tutorLog);
  }

  @override
  Future<List<TopicHit>> searchTopics(String query) async {
    calls.add('search $query');
    return hits;
  }

  /// Concept videos by topic id.
  Map<String, List<ConceptVideo>> conceptVideoList = {
    't1': const [
      ConceptVideo(id: 'cv1', youtubeVideoId: 'abcdefghij1', title: 'Underwriting commission in 5 minutes', language: 'en', durationSeconds: 300),
      ConceptVideo(id: 'cv2', youtubeVideoId: 'abcdefghij2', title: 'अभिगोपन कमीशन', language: 'hi', durationSeconds: 245, source: 'teacher'),
    ],
  };

  @override
  Future<List<ConceptVideo>> conceptVideos(String topicId) async {
    calls.add('conceptVideos $topicId');
    return conceptVideoList[topicId] ?? const [];
  }

  @override
  Future<TopicDetail> topic(String id) async {
    calls.add('topic $id');
    if (id != underwriting.id) throw ApiException(404, 'Topic not found');
    return underwriting;
  }

  @override
  Future<CourseOutline?> syllabus(String subjectId) async {
    calls.add('syllabus $subjectId');
    return syllabi[subjectId];
  }

  @override
  Future<FeeAccount> fees(String studentId) async {
    calls.add('fees $studentId');
    if (feesError != null) throw feesError!;
    return feeAccount;
  }

  @override
  Future<FeeReceipt> receipt(String paymentId) async {
    calls.add('receipt $paymentId');
    if (paymentId != 'p1') throw ApiException(404, 'Receipt not found');
    return FeeReceipt(
      receiptNo: 'RCPT/2026-27/00001',
      institution: 'Demo College',
      studentName: 'Aarav Patel',
      rollNo: 'U03BC001',
      className: 'BCom Sem 3 A',
      invoiceTitle: 'Semester 3 tuition fee',
      invoiceAmountPaise: 4250000,
      balancePaise: 0,
      amountPaise: 4250000,
      method: 'upi',
      reference: 'UPI-778812',
      paidAt: DateTime(2026, 10, 2, 11, 30),
    );
  }

  // ── Exams, leave, bus, hostel and certificates ───────────────────────────────────────────────

  ApiException? examsError;
  ApiException? hallTicketError;

  /// An end-of-semester session in about a week and a published internal one, as the server sends them.
  late List<ExamSession> examSessions = [
    ExamSession(
      id: 'ex1',
      name: 'Semester 3 end exam',
      kind: 'regular',
      startsOn: _day(9),
      endsOn: _day(15),
      status: 'scheduled',
      hallTicket: const HallTicket(ticketNo: 'HT-EX1-U03BC001', blocked: false),
      papers: [
        ExamPaper(subjectId: 'sub1', subject: 'Corporate Accounting', examDate: _day(9), startsAt: const ClockTime(600), endsAt: const ClockTime(780), maxMarks: 60, room: 'Hall 2', seat: 14),
        ExamPaper(subjectId: 'sub2', subject: 'Business Law', examDate: _day(12), startsAt: const ClockTime(840), endsAt: const ClockTime(1020), maxMarks: 60, room: 'Hall 2', seat: 14),
      ],
    ),
    ExamSession(
      id: 'ex0',
      name: 'Semester 2 end exam',
      kind: 'regular',
      startsOn: _day(-120),
      endsOn: _day(-114),
      status: 'published',
      papers: [ExamPaper(subjectId: 'sub1', subject: 'Financial Accounting', examDate: _day(-120), startsAt: const ClockTime(600), endsAt: const ClockTime(780), maxMarks: 60)],
    ),
  ];

  ExamResults results = const ExamResults(
    cgpa: 7.9,
    terms: [
      TermResult(
        sessionId: 'ex0',
        sessionName: 'Semester 2 end exam',
        term: 2,
        sgpa: 7.9,
        cgpa: 7.9,
        outcome: 'pass',
        lines: [
          ResultLine(code: 'BCOM-2.1', subject: 'Financial Accounting', credits: 4, percent: 82, grade: 'A', gradePoint: 8.2, passed: true),
          ResultLine(code: 'BCOM-2.2', subject: 'Business Statistics', credits: 3, percent: 71, grade: 'B+', gradePoint: 7.1, passed: true),
        ],
      ),
    ],
  );

  static DateTime _day(int offset) {
    final n = DateTime.now();
    return DateTime(n.year, n.month, n.day).add(Duration(days: offset));
  }

  @override
  Future<List<ExamSession>> exams(String studentId) async {
    calls.add('exams $studentId');
    if (examsError != null) throw examsError!;
    return List.of(examSessions);
  }

  @override
  Future<ExamResults> examResults(String studentId) async {
    calls.add('examResults $studentId');
    if (examsError != null) throw examsError!;
    return results;
  }

  /// Document requests by id; the demo college has one issued grade card.
  List<AcademicDocRequest> docRequests = const [AcademicDocRequest(id: 'd1', kind: 'grade_card', title: 'CONSOLIDATED GRADE CARD', status: 'issued', purpose: 'Higher studies', serialNo: 'GC/2026/0001')];
  ApiException? docError;

  @override
  Future<List<AcademicDocRequest>> academicDocRequests(String studentId) async {
    calls.add('academicDocRequests');
    if (docError != null) throw docError!;
    return docRequests;
  }

  @override
  Future<AcademicDocRequest> requestAcademicDoc(String studentId, String kind, String purpose) async {
    calls.add('requestAcademicDoc $kind');
    if (docError != null) throw docError!;
    final r = AcademicDocRequest(id: 'd${docRequests.length + 1}', kind: kind, title: kind, status: 'requested', purpose: purpose);
    docRequests = [r, ...docRequests];
    return r;
  }

  @override
  Future<Uint8List> academicDocPdf(String requestId) async {
    calls.add('academicDocPdf $requestId');
    return Uint8List.fromList('%PDF-1.4 document'.codeUnits);
  }

  @override
  Future<Uint8List> hallTicketPdf(String sessionId, String studentId) async {
    calls.add('hallTicket $sessionId');
    if (hallTicketError != null) throw hallTicketError!;
    return Uint8List.fromList('%PDF-1.4 hall ticket'.codeUnits);
  }

  ApiException? revaluationError;

  @override
  Future<void> requestRevaluation(String studentId, {required String sessionId, required String subjectId, required String reason}) async {
    calls.add('revaluation $sessionId $subjectId $reason');
    if (revaluationError != null) throw revaluationError!;
    final i = examSessions.indexWhere((e) => e.id == sessionId);
    final cur = examSessions[i];
    examSessions[i] = ExamSession(
      id: cur.id,
      name: cur.name,
      kind: cur.kind,
      startsOn: cur.startsOn,
      endsOn: cur.endsOn,
      status: cur.status,
      hallTicket: cur.hallTicket,
      papers: cur.papers,
      revaluations: [...cur.revaluations, RevaluationRequest(id: 'rv${cur.revaluations.length + 1}', subjectId: subjectId, subject: cur.papers.firstWhere((p) => p.subjectId == subjectId).subject, status: RevaluationStatus.requested)],
    );
  }

  List<LeaveRequest> leaves = [
    LeaveRequest(id: 'lv1', fromDate: DateTime(2026, 9, 14), toDate: DateTime(2026, 9, 15), reason: 'Fever', status: LeaveStatus.approved),
  ];
  ApiException? leaveError;

  @override
  Future<List<LeaveRequest>> leaveRequests(String studentId) async {
    calls.add('leave $studentId');
    if (leaveError != null) throw leaveError!;
    return List.of(leaves);
  }

  @override
  Future<LeaveRequest> applyLeave(String studentId, {required DateTime from, required DateTime to, required String reason}) async {
    calls.add('applyLeave ${isoDate(from)} ${isoDate(to)} $reason');
    if (leaveError != null) throw leaveError!;
    final r = LeaveRequest(id: 'lv${leaves.length + 1}', fromDate: from, toDate: to, reason: reason, status: LeaveStatus.pending);
    leaves = [r, ...leaves];
    return r;
  }

  @override
  Future<LeaveRequest> cancelLeave(String id) async {
    calls.add('cancelLeave $id');
    final cur = leaves.firstWhere((l) => l.id == id);
    final r = LeaveRequest(id: cur.id, fromDate: cur.fromDate, toDate: cur.toDate, reason: cur.reason, status: LeaveStatus.cancelled);
    leaves = [for (final l in leaves) l.id == id ? r : l];
    return r;
  }

  StudentBus busInfo = const StudentBus(
    assigned: true,
    routeName: 'Route 4 · Jayanagar',
    regNo: 'KA01AB1234',
    stopId: 'st2',
    stopName: 'Jayanagar 4th Block',
    pickupTime: ClockTime(450),
    stops: [BusStop(id: 'st1', name: 'Banashankari', seq: 1), BusStop(id: 'st2', name: 'Jayanagar 4th Block', seq: 2), BusStop(id: 'st3', name: 'Demo College', seq: 3)],
    bus: BusPosition(speedKmh: 28, etaMinutes: 6, stopsAway: 1),
  );
  ApiException? busError;

  @override
  Future<StudentBus> bus(String studentId) async {
    calls.add('bus $studentId');
    if (busError != null) throw busError!;
    return busInfo;
  }

  HostelView hostelView = HostelView(
    resident: true,
    block: 'Block A',
    room: '101',
    bed: 'B',
    nights: [NightMark(night: '2026-10-07', status: 'absent'), NightMark(night: '2026-10-06', status: 'present')],
    passes: [GatePass(id: 'gp1', reason: 'Weekend at home', destination: 'Mysuru', expectedBackAt: DateTime(2026, 9, 21, 19), status: 'returned')],
  );
  ApiException? hostelError;

  int walletBalancePaise = 250_00;
  String? onlinePayments = 'demo';
  List<MealMark> walletMeals = const [MealMark(date: '2026-10-07', meal: 'lunch')];
  final _topUps = <String, ({String orderId, int amountPaise})>{};

  @override
  Future<WalletView> wallet(String studentId) async {
    calls.add('wallet $studentId');
    return WalletView(balancePaise: walletBalancePaise, meals: walletMeals, onlinePayments: onlinePayments);
  }

  @override
  Future<TopUpCheckout> walletCheckout(String studentId, int amountPaise) async {
    calls.add('walletCheckout $studentId $amountPaise');
    if (onlinePayments == null) throw ApiException(503, 'Online payment is not available yet. Please pay at the fees counter.');
    final id = 'topup${_topUps.length + 1}';
    final orderId = '${onlinePayments}_wallet_${_topUps.length + 1}';
    _topUps[id] = (orderId: orderId, amountPaise: amountPaise);
    return TopUpCheckout(topupId: id, provider: onlinePayments!, keyId: onlinePayments == 'demo' ? 'demo' : 'rzp_test_key', orderId: orderId, amountPaise: amountPaise, name: 'Demo College', description: 'Canteen wallet');
  }

  @override
  Future<int> confirmWalletTopUp(String topUpId, {required String providerPaymentId, required String signature}) async {
    calls.add('confirmWallet $topUpId');
    final o = _topUps[topUpId];
    if (o == null) throw ApiException(404, 'Top-up not found');
    final expected = Hmac(sha256, utf8.encode('kinetix-demo-payments')).convert(utf8.encode('${o.orderId}|$providerPaymentId')).toString();
    if (signature != expected) throw ApiException(403, 'The payment could not be verified');
    walletBalancePaise += o.amountPaise;
    return walletBalancePaise;
  }

  @override
  Future<HostelView> hostel(String studentId) async {
    calls.add('hostel $studentId');
    if (hostelError != null) throw hostelError!;
    return hostelView;
  }

  @override
  Future<GatePass> requestGatePass(String studentId, {required String reason, required String destination, required DateTime backAt}) async {
    calls.add('gatePass $reason $destination');
    if (hostelError != null) throw hostelError!;
    final p = GatePass(id: 'gp${hostelView.passes.length + 1}', reason: reason, destination: destination, expectedBackAt: backAt, status: 'requested');
    hostelView = HostelView(resident: true, block: hostelView.block, room: hostelView.room, bed: hostelView.bed, passes: [p, ...hostelView.passes]);
    return p;
  }

  List<CertificateTemplate> certTemplates = const [
    CertificateTemplate(id: 'ct1', kind: 'bonafide', name: 'Bonafide certificate', fields: []),
    CertificateTemplate(id: 'ct2', kind: 'custom', name: 'Study certificate', fields: [CertificateField(key: 'purpose', label: 'Needed for', required: true)]),
  ];
  List<CertificateRequest> certs = [
    CertificateRequest(id: 'c1', name: 'Bonafide certificate', status: 'issued', purpose: 'Bank account', serialNo: 'BON/2026/0007', issuedAt: DateTime(2026, 8, 3), createdAt: DateTime(2026, 8, 1)),
  ];
  ApiException? certError;

  @override
  Future<List<CertificateTemplate>> certificateTemplates() async {
    calls.add('certTemplates');
    if (certError != null) throw certError!;
    return certTemplates;
  }

  @override
  Future<List<CertificateRequest>> myCertificates() async {
    calls.add('certs');
    if (certError != null) throw certError!;
    return List.of(certs);
  }

  @override
  Future<CertificateRequest> requestCertificate(String studentId, {required String templateId, required String purpose, required Map<String, String> fields}) async {
    calls.add('requestCert $templateId $purpose');
    if (certError != null) throw certError!;
    final t = certTemplates.firstWhere((t) => t.id == templateId);
    final r = CertificateRequest(id: 'c${certs.length + 1}', name: t.name, status: 'requested', purpose: purpose, createdAt: DateTime.now());
    certs = [r, ...certs];
    return r;
  }

  @override
  Future<Uint8List> certificatePdf(String id) async {
    calls.add('certPdf $id');
    return Uint8List.fromList('%PDF-1.4 certificate'.codeUnits);
  }

  // ── Profile, photo and badges ─────────────────────────────────────────────────────────────

  /// Uploaded photos by API path (demo mode shows them from memory).
  final photos = <String, Uint8List>{};

  /// Badges by student id, newest first.
  final badgesByStudent = <String, List<BadgeAward>>{};

  /// When set, saving the profile fails with this error.
  ApiException? profileError;

  @override
  Future<Me> updateProfile({required String fullName, required String? email}) async {
    calls.add('profile $fullName ${email ?? '-'}');
    if (profileError != null) throw profileError!;
    return profile = profile.copyWith(fullName: fullName, email: email, clearEmail: email == null);
  }

  @override
  Future<Me> uploadPhoto(Uint8List jpeg) async {
    calls.add('photo ${jpeg.length}');
    final path = '/v1/users/${profile.id}/photo?v=${photos.length + 1}';
    photos[path] = jpeg;
    return profile = profile.copyWith(photoUrl: path);
  }

  @override
  Future<Me> removePhoto() async {
    calls.add('photo removed');
    return profile = profile.copyWith(clearPhoto: true);
  }

  @override
  ImageProvider? photo(String? path) => path == null || photos[path] == null ? null : MemoryImage(photos[path]!);

  @override
  Future<List<BadgeAward>> badges(String studentId) async {
    calls.add('badges $studentId');
    return badgesByStudent[studentId] ?? const [];
  }

  /// A badge as a teacher awards it (newest first).
  BadgeAward addBadge(String studentId, String badge, {String teacher = 'Ms. Kavya Rao', String? subject, DateTime? at}) {
    final b = BadgeAward(
      id: 'b${badgesByStudent.values.fold(0, (n, l) => n + l.length) + 1}',
      badge: badge,
      awardedAt: at ?? DateTime(2026, 10, 5, 11),
      teacherName: teacher,
      subjectName: subject,
    );
    badgesByStudent.putIfAbsent(studentId, () => []).insert(0, b);
    return b;
  }

  // ── Library ───────────────────────────────────────────────────────────────────────────────

  /// One book due in 5 days, one overdue, and one returned late with a fine.
  LibraryAccount libraryAccount = LibraryAccount.fromJson({
    'current': [
      loanJson('l1', 'Corporate Accounting', author: 'S. N. Maheshwari', dueOn: '2026-10-09'),
      loanJson('l3', 'Cost Accounting: Principles and Practice', author: 'M. N. Arora', dueOn: '2026-10-01', overdue: true, fineSoFarPaise: 600),
    ],
    'history': [
      loanJson(
        'l2',
        'Wings of Fire',
        author: 'A. P. J. Abdul Kalam',
        issuedAt: '2026-09-05T05:00:00Z',
        dueOn: '2026-09-20',
        returnedAt: '2026-09-23T06:00:00Z',
        finePaise: 600,
      ),
    ],
    'finesPaise': 600,
  });

  static Map<String, dynamic> loanJson(
    String id,
    String title, {
    required String author,
    required String dueOn,
    String issuedAt = '2026-09-25T05:00:00Z',
    String? returnedAt,
    int finePaise = 0,
    bool overdue = false,
    int fineSoFarPaise = 0,
  }) => {
    'id': id,
    'book': {'id': 'b-$id', 'title': title, 'author': author, 'callNo': '657.95 MAH'},
    'issuedAt': issuedAt,
    'dueOn': dueOn,
    'returnedAt': returnedAt,
    'finePaise': finePaise,
    'overdue': overdue,
    'fineSoFarPaise': fineSoFarPaise,
  };

  @override
  Future<LibraryAccount> library(String studentId) async {
    calls.add('library $studentId');
    return libraryAccount;
  }

  // ── Careers and grievances ────────────────────────────────────────────────────────────────

  Map<String, dynamic> careers = {
    'academics': {'cgpa': 7.5, 'backlogs': 0},
    'placed': false,
    'drives': [
      {
        'id': 'd1', 'title': 'Acme campus drive', 'company': 'Acme Corp', 'kind': 'placement', 'roleTitle': 'Analyst', 'ctcLpa': 6, 'location': 'Bengaluru',
        'driveDate': '2026-11-05', 'status': 'open', 'minCgpa': 6.5, 'maxBacklogs': 0,
        'eligibility': {'eligible': true, 'reasons': <String>[]}, 'registration': null,
      },
      {
        'id': 'd2', 'title': 'Globex fintech drive', 'company': 'Globex', 'kind': 'placement', 'roleTitle': 'Associate', 'ctcLpa': 9.5, 'location': '',
        'driveDate': null, 'status': 'open', 'minCgpa': 8.5, 'maxBacklogs': 0,
        'eligibility': {'eligible': false, 'reasons': ['cgpa_below']}, 'registration': null,
      },
    ],
    'offers': <Map<String, dynamic>>[],
    'internships': [
      {'id': 'i1', 'title': 'Summer intern', 'orgName': 'Acme Corp', 'startsOn': '2026-10-01', 'endsOn': '2026-12-01', 'status': 'ongoing', 'evaluationScore': null},
    ],
  };

  /// Set to make the next register / respond call fail like the server would (a 409 with its message).
  ApiException? careerFailure;

  @override
  Future<CareerOverview> careerOverview(String studentId) async {
    calls.add('careerOverview $studentId');
    return CareerOverview.fromJson(careers);
  }

  @override
  Future<void> registerForDrive(String studentId, String driveId) async {
    calls.add('registerForDrive $driveId');
    if (careerFailure != null) throw careerFailure!;
    for (final d in careers['drives'] as List) {
      if (d['id'] == driveId) d['registration'] = {'id': 'r-$driveId', 'status': 'registered'};
    }
  }

  @override
  Future<void> withdrawFromDrive(String studentId, String driveId) async {
    calls.add('withdrawFromDrive $driveId');
    for (final d in careers['drives'] as List) {
      if (d['id'] == driveId) d['registration'] = {'id': 'r-$driveId', 'status': 'withdrawn'};
    }
  }

  @override
  Future<void> respondToOffer(String offerId, {required bool accept}) async {
    calls.add('respondToOffer $offerId ${accept ? 'accepted' : 'declined'}');
    for (final o in careers['offers'] as List) {
      if (o['id'] == offerId) o['status'] = accept ? 'accepted' : 'declined';
    }
    if (accept) careers['placed'] = true;
  }

  final List<Map<String, dynamic>> grievances = [
    {'id': 'g1', 'ticketNo': 'GRV-0001', 'category': 'fees', 'subject': 'Fee receipt is wrong', 'status': 'resolved', 'anonymous': false, 'slaDueAt': '2026-10-25T04:30:00Z', 'resolution': 'Receipt reissued', 'rating': null},
  ];

  @override
  Future<List<GrievanceTicket>> myGrievances() async {
    calls.add('myGrievances');
    return [for (final g in grievances) GrievanceTicket.fromJson(g)];
  }

  @override
  Future<GrievanceTicket> raiseGrievance({required String category, required String subject, required String description, bool anonymous = false, String? studentId}) async {
    calls.add('raiseGrievance $category anonymous=$anonymous student=$studentId');
    final g = {'id': 'g${grievances.length + 1}', 'ticketNo': 'GRV-000${grievances.length + 1}', 'category': category, 'subject': subject, 'status': 'open', 'anonymous': anonymous, 'slaDueAt': '2026-10-30T04:30:00Z', 'resolution': null, 'rating': null};
    grievances.insert(0, g);
    return GrievanceTicket.fromJson(g);
  }

  @override
  Future<void> rateGrievance(String id, int rating) async {
    calls.add('rateGrievance $id $rating');
    for (final g in grievances) {
      if (g['id'] == id) {
        g['rating'] = rating;
        g['status'] = 'closed';
      }
    }
  }

  // ── Marks ─────────────────────────────────────────────────────────────────────────────────

  StudentMarks studentMarks = StudentMarks.fromJson({
    'assessments': [
      {
        'id': 'a1',
        'title': 'Unit test 1: Underwriting of shares',
        'kind': 'test',
        'maxMarks': 25,
        'heldOn': '2026-09-28',
        'subject': 'Corporate Accounting',
        'marks': 19,
        'absent': false,
        'remark': 'Good. Revise the journal entries for forfeiture.',
        'classAverage': 18.7,
        'classHighest': 24,
      },
    ],
    'subjects': [
      {'subject': 'Corporate Accounting', 'percent': 76},
    ],
  });

  @override
  Future<StudentMarks> marks(String studentId) async {
    calls.add('marks $studentId');
    return studentMarks;
  }

  // ── Messages (colleges let students write for themselves) ──────────────────────────────────

  /// Empty at a school.
  late List<ContactGroup> contactGroups = [
    ContactGroup(
      studentId: 's1',
      studentName: 'Aarav Patel',
      className: 'BCom Sem 3 A',
      staff: [
        StaffContact(id: 't1', fullName: 'Anita Sharma', subjects: ['Corporate Accounting', 'Cost Accounting']),
      ],
    ),
  ];

  /// Conversation id → its messages, oldest first.
  Map<String, List<ChatMessage>> chats = {};
  final _readAt = <String, DateTime>{};

  Conversation _summary(String id) {
    final list = chats[id] ?? [];
    final read = _readAt[id];
    return Conversation(
      id: id,
      student: Person(id: 's1', fullName: 'Aarav Patel'),
      className: 'BCom Sem 3 A',
      staff: Person(id: 't1', fullName: 'Anita Sharma'),
      family: Person(id: profile.id, fullName: profile.fullName),
      lastMessage: list.lastOrNull?.body,
      lastMessageAt: list.lastOrNull?.createdAt,
      unread: list.where((m) => m.senderId != profile.id && (read == null || m.createdAt.isAfter(read))).length,
    );
  }

  @override
  Future<List<ContactGroup>> contacts() async {
    calls.add('contacts');
    return contactGroups;
  }

  @override
  Future<List<Conversation>> conversations() async {
    calls.add('conversations');
    return [for (final id in chats.keys) _summary(id)];
  }

  @override
  Future<Conversation> startConversation({required String studentId, required String teacherId}) async {
    calls.add('start $studentId $teacherId');
    chats.putIfAbsent('cv1', () => []);
    return _summary('cv1');
  }

  @override
  Future<MessagePage> messages(String conversationId, {DateTime? before}) async {
    calls.add('messages $conversationId');
    if (!chats.containsKey(conversationId)) throw ApiException(404, 'Conversation not found');
    return MessagePage(conversation: _summary(conversationId), messages: [...chats[conversationId]!]);
  }

  @override
  Future<ChatMessage> sendMessage(String conversationId, String body) async {
    calls.add('send $conversationId $body');
    final m = ChatMessage(id: 'm${DateTime.now().microsecondsSinceEpoch}', senderId: profile.id, body: body, createdAt: DateTime.now());
    chats.putIfAbsent(conversationId, () => []).add(m);
    _readAt[conversationId] = m.createdAt;
    return m;
  }

  @override
  Future<void> markConversationRead(String conversationId) async {
    calls.add('chat-read $conversationId');
    _readAt[conversationId] = DateTime.now();
  }

  // ── Projects, portfolio, thesis, career preparation, school life and alumni ─────────────────

  ApiException? pathwaysError;

  void _pw() {
    if (pathwaysError != null) throw pathwaysError!;
  }

  List<Map<String, dynamic>> projectJson = [
    {'id': 'p1', 'code': 'PRJ-1', 'title': 'Campus energy dashboard', 'kind': 'capstone', 'status': 'active', 'showcase': false, 'recruiting': true},
  ];
  Map<String, dynamic> workspaceJson = {
    'project': {'id': 'p1', 'code': 'PRJ-1', 'title': 'Campus energy dashboard', 'kind': 'capstone', 'status': 'active', 'outcomeSummary': '', 'pi': 'Dr. Meera Iyer'},
    'myRole': 'student',
    'members': [
      {'id': 'm1', 'role': 'pi', 'name': 'Dr. Meera Iyer'},
      {'id': 'm2', 'role': 'student', 'name': 'Aarav Patel'},
    ],
    'milestones': [
      {'id': 'ms1', 'title': 'Collect meter data', 'dueOn': '2026-09-01', 'completedOn': '2026-08-30', 'evidenceRef': null},
      {'id': 'ms2', 'title': 'Build the charts', 'dueOn': '2026-11-15', 'completedOn': null, 'evidenceRef': null},
    ],
    'files': [
      {'id': 'f1', 'title': 'Project brief', 'kind': 'link', 'url': 'https://example.com/brief', 'contentType': null, 'sizeBytes': null, 'createdAt': '2026-08-01T00:00:00Z'},
    ],
    'hub': {'showcase': false, 'summary': 'Energy use across the campus', 'recruiting': true, 'lookingFor': ['Python'], 'openings': 1},
    'vivas': [
      {'id': 'v1', 'scheduledAt': '2026-12-10T05:00:00Z', 'venue': 'Seminar hall', 'panel': [{'name': 'Dr. Rao'}], 'status': 'scheduled', 'outcome': null, 'score': null, 'remarks': null},
    ],
    'reviews': {'count': 1, 'average': 80.0},
  };
  List<Map<String, dynamic>> commentJson = [
    {'id': 'c1', 'parentId': null, 'body': 'Please share the data sheet.', 'author': 'Dr. Meera Iyer', 'authorUserId': 'u9', 'createdAt': '2026-09-02T05:00:00Z'},
  ];
  List<Map<String, dynamic>> projectReviewJson = [
    {'id': 'r1', 'kind': 'mentor', 'rubric': {'Idea': 4, 'Execution': 4}, 'maxPerCriterion': 5, 'total': 8, 'percent': 80.0, 'comment': 'Good start.', 'reviewer': 'Dr. Meera Iyer', 'createdAt': '2026-09-03T05:00:00Z'},
  ];
  List<Map<String, dynamic>> discoverJson = [
    {'id': 'p2', 'title': 'Library chatbot', 'kind': 'research', 'pi': 'Dr. Rao', 'summary': 'A helper for the library', 'lookingFor': ['Python', 'UX'], 'openings': 2, 'matched': ['python'], 'fit': 50},
  ];
  List<Map<String, dynamic>> showcaseJson = [
    {'id': 'p3', 'title': 'Solar tracker', 'kind': 'capstone', 'pi': 'Dr. Rao', 'summary': 'Follows the sun', 'outcomeSummary': 'Built and tested', 'reviewAverage': 84.5},
  ];
  List<Map<String, dynamic>> portfolioJson = [
    {'id': 'pf1', 'title': 'Energy dashboard', 'summary': 'A web dashboard', 'url': 'https://example.com/dash', 'kind': 'project', 'published': false, 'projectId': 'p1'},
  ];
  Map<String, dynamic> thesisJson = {'id': null};

  @override
  Future<List<ProjectSummary>> myProjects() async {
    calls.add('myProjects');
    _pw();
    return [for (final p in projectJson) ProjectSummary.fromJson(p)];
  }

  @override
  Future<ProjectWorkspace> projectWorkspace(String id) async {
    calls.add('projectWorkspace $id');
    _pw();
    return ProjectWorkspace.fromJson(workspaceJson);
  }

  @override
  Future<void> addProjectLink(String id, {required String title, required String url}) async {
    calls.add('addProjectLink $id $title $url');
    _pw();
    (workspaceJson['files'] as List).add({'id': 'f${(workspaceJson['files'] as List).length + 1}', 'title': title, 'kind': 'link', 'url': url, 'contentType': null, 'sizeBytes': null, 'createdAt': '2026-10-10T00:00:00Z'});
  }

  @override
  Future<List<ProjectComment>> projectComments(String id) async {
    calls.add('projectComments $id');
    _pw();
    return [for (final c in commentJson) ProjectComment.fromJson(c)];
  }

  @override
  Future<void> addProjectComment(String id, String body, {String? parentId}) async {
    calls.add('addProjectComment $id $body');
    _pw();
    commentJson.add({'id': 'c${commentJson.length + 1}', 'parentId': parentId, 'body': body, 'author': 'Aarav Patel', 'authorUserId': 'u1', 'createdAt': '2026-10-10T05:00:00Z'});
  }

  @override
  Future<List<ProjectReview>> projectReviews(String id) async {
    calls.add('projectReviews $id');
    _pw();
    return [for (final r in projectReviewJson) ProjectReview.fromJson(r)];
  }

  @override
  Future<List<DiscoverProject>> discoverProjects({String? skill}) async {
    calls.add('discoverProjects ${skill ?? ''}');
    _pw();
    return [for (final d in discoverJson) if (skill == null || skill.isEmpty || (d['lookingFor'] as List).any((l) => '$l'.toLowerCase().contains(skill.toLowerCase()))) DiscoverProject.fromJson(d)];
  }

  @override
  Future<void> joinProject(String id, String message) async {
    calls.add('joinProject $id $message');
    _pw();
  }

  @override
  Future<List<ShowcaseProject>> showcaseProjects() async {
    calls.add('showcaseProjects');
    _pw();
    return [for (final s in showcaseJson) ShowcaseProject.fromJson(s)];
  }

  /// The last peer review sent.
  Map<String, int>? lastPeerRubric;

  @override
  Future<void> peerReviewProject(String id, {required Map<String, int> rubric, String comment = ''}) async {
    calls.add('peerReviewProject $id');
    _pw();
    lastPeerRubric = rubric;
  }

  @override
  Future<List<PortfolioItem>> portfolio() async {
    calls.add('portfolio');
    _pw();
    return [for (final p in portfolioJson) PortfolioItem.fromJson(p)];
  }

  @override
  Future<PortfolioItem> addPortfolioItem({required String title, String summary = '', String? url, String kind = 'project', String? projectId, bool published = false}) async {
    calls.add('addPortfolioItem $title');
    _pw();
    final row = {'id': 'pf${portfolioJson.length + 1}', 'title': title, 'summary': summary, 'url': url, 'kind': kind, 'published': published, 'projectId': projectId};
    portfolioJson.insert(0, row);
    return PortfolioItem.fromJson(row);
  }

  @override
  Future<void> publishPortfolioItem(String id, bool published) async {
    calls.add('publishPortfolioItem $id $published');
    _pw();
    for (final p in portfolioJson) {
      if (p['id'] == id) p['published'] = published;
    }
  }

  @override
  Future<void> deletePortfolioItem(String id) async {
    calls.add('deletePortfolioItem $id');
    _pw();
    portfolioJson.removeWhere((p) => p['id'] == id);
  }

  @override
  Future<Thesis?> myThesis() async {
    calls.add('myThesis');
    _pw();
    return Thesis.fromJson(thesisJson);
  }

  // Career preparation.

  Map<String, dynamic> resumeJson = {
    'headline': 'BCom student',
    'summary': '',
    'education': [
      {'institution': 'Demo College', 'degree': 'BCom', 'years': '2024-2027'},
    ],
    'experience': <Object>[],
    'projects': <Object>[],
    'skills': ['Excel'],
    'interests': ['Finance'],
    'links': <Object>[],
    'visibleToRecruiters': true,
  };

  /// The resume last saved.
  Map<String, dynamic>? savedResume;

  @override
  Future<Resume> resume() async {
    calls.add('resume');
    _pw();
    return Resume.fromJson(resumeJson);
  }

  @override
  Future<void> saveResume(Resume resume) async {
    calls.add('saveResume');
    _pw();
    savedResume = resume.toJson();
    resumeJson = Map.of(savedResume!);
  }

  List<Map<String, dynamic>> testJson = [
    {'id': 't1', 'title': 'Quantitative basics', 'category': 'quant', 'durationMin': 10, 'passPercent': 50, 'questionCount': 2, 'attempts': 0, 'best': 0, 'passed': false},
  ];
  Map<String, dynamic> attemptJson = {
    'attemptId': 'at1',
    'durationMin': 10,
    'startedAt': '2030-01-01T00:00:00Z',
    'questions': [
      {'prompt': 'What is 12 + 8?', 'options': ['18', '20', '22'], 'topic': 'Arithmetic'},
      {'prompt': 'What is 3 x 4?', 'options': ['7', '12', '14'], 'topic': 'Arithmetic'},
    ],
  };

  /// The answers last submitted.
  List<int?>? lastAnswers;

  @override
  Future<List<AptitudeTest>> aptitudeTests() async {
    calls.add('aptitudeTests');
    _pw();
    return [for (final t in testJson) AptitudeTest.fromJson(t)];
  }

  @override
  Future<AptitudeAttempt> startAptitudeTest(String testId) async {
    calls.add('startAptitudeTest $testId');
    _pw();
    return AptitudeAttempt.fromJson({...attemptJson, 'startedAt': DateTime.now().toUtc().toIso8601String()});
  }

  @override
  Future<AptitudeResult> submitAptitudeAttempt(String attemptId, List<int?> answers) async {
    calls.add('submitAptitudeAttempt $attemptId');
    _pw();
    lastAnswers = answers;
    final right = (answers[0] == 1 ? 1 : 0) + (answers.length > 1 && answers[1] == 1 ? 1 : 0);
    return AptitudeResult.fromJson({
      'score': right,
      'total': 2,
      'percent': right * 50.0,
      'passed': right >= 1,
      'passPercent': 50,
      'topicScores': {'Arithmetic': {'right': right, 'total': 2}},
    });
  }

  Map<String, dynamic> recommendationJson = {
    'skills': ['Excel'],
    'interests': ['Finance'],
    'paths': [
      {'pathId': 'cp1', 'title': 'Financial analyst', 'family': 'Finance', 'fit': 65.0, 'matched': ['Excel'], 'gaps': ['SQL', 'Valuation'], 'interestMatch': true},
    ],
  };

  @override
  Future<CareerRecommendations> careerRecommendations() async {
    calls.add('careerRecommendations');
    _pw();
    return CareerRecommendations.fromJson(recommendationJson).withCatalog([
      CareerPath.fromJson({'id': 'cp1', 'title': 'Financial analyst', 'description': 'Reads the numbers behind a business.', 'roles': ['Analyst'], 'steps': [{'title': 'Learn SQL', 'detail': 'Do a short course'}]}),
    ]);
  }

  @override
  Future<MockInterview> startMockInterview({required String kind, String role = '', int count = 3}) async {
    calls.add('startMockInterview $kind $role $count');
    _pw();
    return MockInterview(id: 'mi1', kind: kind, questions: ['Tell me about yourself.', 'Why do you want this role?']);
  }

  /// The answers last submitted to a mock interview.
  List<({String answer, int? seconds})>? lastMockAnswers;

  @override
  Future<MockResult> submitMockInterview(String id, List<({String answer, int? seconds})> answers) async {
    calls.add('submitMockInterview $id');
    _pw();
    lastMockAnswers = answers;
    return MockResult.fromJson({
      'id': id,
      'score': 72.5,
      'questions': ['Tell me about yourself.', 'Why do you want this role?'],
      'perQuestion': [
        {'score': 80, 'notes': ['Clear structure']},
        {'score': 65, 'notes': ['Add an example', 'Avoid filler words']},
      ],
      'overall': ['Practise one more round'],
    });
  }

  @override
  Future<List<MockSummary>> myMockInterviews() async {
    calls.add('myMockInterviews');
    _pw();
    return [MockSummary.fromJson({'id': 'mi0', 'kind': 'hr', 'role': 'Analyst', 'status': 'completed', 'score': 70.0, 'createdAt': '2026-09-01T05:00:00Z'})];
  }

  /// Whether the next answer comes from KINETIX AI (false: the built-in guidance).
  bool assistantAi = false;
  List<Map<String, dynamic>> assistantHistoryJson = [
    {'role': 'user', 'body': 'What should I study?', 'createdAt': '2026-09-01T05:00:00Z'},
    {'role': 'assistant', 'body': 'Start with SQL.', 'createdAt': '2026-09-01T05:00:01Z'},
  ];

  @override
  Future<AssistantReply> askCareerAssistant(String question, String language) async {
    calls.add('askCareerAssistant $language $question');
    _pw();
    final reply = AssistantReply(answer: 'Financial analyst is your closest fit.', suggestions: ['Add evidence of SQL'], pathways: ['Financial analyst'], aiUsed: assistantAi);
    assistantHistoryJson
      ..add({'role': 'user', 'body': question})
      ..add({'role': 'assistant', 'body': reply.answer});
    return reply;
  }

  @override
  Future<List<AssistantMessage>> careerAssistantHistory() async {
    calls.add('careerAssistantHistory');
    _pw();
    return [for (final m in assistantHistoryJson) AssistantMessage.fromJson(m)];
  }

  // School life.

  List<Map<String, dynamic>> diaryJson = [
    {'id': 'd1', 'entryDate': '2026-10-08', 'classwork': 'Fractions: adding unlike denominators', 'homeworkNote': 'Exercise 4.2', 'notice': 'Bring a ruler', 'author': 'Meera Iyer', 'subject': 'Mathematics'},
    {'id': 'd2', 'entryDate': '2026-10-07', 'classwork': 'Reading: The Banyan Tree', 'homeworkNote': '', 'notice': '', 'author': 'Asha Rao', 'subject': 'English'},
  ];
  Map<String, dynamic> activitiesJson = {
    'clubs': [
      {'club': 'Chess Club', 'category': 'sports', 'role': 'member', 'posts': ['Secretary'], 'points': 30, 'activities': 4},
    ],
    'events': [
      {'title': 'Annual Day', 'eventType': 'cultural', 'on': '2026-09-20'},
    ],
    'house': {'id': 'h1', 'name': 'Red House', 'colour': '#d00', 'isCaptain': true, 'totalPoints': 25},
    'recognitions': [
      {'points': 10, 'category': 'academics', 'reason': 'Maths quiz winner', 'awardedOn': '2026-09-01'},
    ],
    'coCurricular': {
      'term': 'Term 1',
      'grades': [
        {'activity': 'Football', 'grade': 'B', 'remark': 'Plays well'},
      ],
    },
    'achievements': [
      {'club': 'Chess Club', 'title': 'Inter-school chess', 'level': 'district', 'position': 'Second', 'achievedOn': '2026-08-15'},
    ],
  };
  List<Map<String, dynamic>> reportCardRows = [
    {'id': 'rc1', 'academicYearId': 'y1', 'termLabel': 'Term 1', 'promotionStatus': 'pending', 'updatedAt': '2026-09-30T00:00:00Z'},
  ];
  Map<String, dynamic> reportCardJson = {
    'id': 'rc1',
    'termLabel': 'Term 1',
    'remarks': 'Works steadily.',
    'behaviourGrade': 'A',
    'promotionStatus': 'pending',
    'promotedTo': null,
    'lines': [
      {'subjectName': 'Mathematics', 'marks': '88.00', 'maxMarks': '100.00', 'grade': 'A', 'remark': 'Very good'},
    ],
    'coCurricular': [
      {'activity': 'Football', 'grade': 'B', 'remark': 'Plays in the school team'},
    ],
    'attendance': {'total': 180, 'present': 170, 'percent': 94.4},
  };

  @override
  Future<List<DiaryEntry>> classDiary({int days = 14}) async {
    calls.add('classDiary $days');
    _pw();
    return [for (final d in diaryJson) DiaryEntry.fromJson(d)];
  }

  @override
  Future<MyActivities> myActivities() async {
    calls.add('myActivities');
    _pw();
    return MyActivities.fromJson(activitiesJson);
  }

  @override
  Future<List<ReportCardRow>> reportCards(String studentId) async {
    calls.add('reportCards $studentId');
    _pw();
    return [for (final r in reportCardRows) ReportCardRow.fromJson(r)];
  }

  @override
  Future<ReportCardDetail> reportCard(String id) async {
    calls.add('reportCard $id');
    _pw();
    return ReportCardDetail.fromJson(reportCardJson);
  }

  @override
  Future<Uint8List> reportCardPdf(String id) async {
    calls.add('reportCardPdf $id');
    _pw();
    return Uint8List.fromList('%PDF-1.4 report card'.codeUnits);
  }

  // Alumni.

  Map<String, dynamic> alumniJson = {
    'fullName': 'Riya Shah',
    'graduationYear': 2021,
    'program': 'BCom',
    'email': 'riya@example.com',
    'phone': null,
    'employer': 'Acme Bank',
    'designation': 'Analyst',
    'city': 'Bengaluru',
    'bio': '',
    'directoryVisible': false,
    'mentorAvailable': false,
  };
  List<Map<String, dynamic>> campaignJson = [
    {'id': 'ca1', 'name': 'Library fund', 'description': 'New books', 'goalPaise': 5000000, 'endsOn': '2026-12-31'},
  ];
  List<Map<String, dynamic>> pledgeJson = [];
  List<Map<String, dynamic>> donationJson = [
    {'id': 'dn1', 'campaignId': 'ca1', 'campaign': 'Library fund', 'amountPaise': 250000, 'mode': 'upi', 'receivedOn': '2026-08-01', 'receiptSerial': 'R-0001'},
  ];
  List<Map<String, dynamic>> volunteerJson = [
    {'id': 'vo1', 'title': 'Career talk', 'description': 'Talk to final-year students', 'startsOn': '2026-11-05', 'slots': 5, 'taken': 2, 'signedUp': false},
  ];
  List<Map<String, dynamic>> storyJson = [
    {'id': 's1', 'title': 'My first job', 'body': 'I joined a bank after college and learnt a lot in the first year.', 'status': 'draft', 'featured': false, 'reviewNote': null},
  ];
  List<Map<String, dynamic>> publishedStoryJson = [
    {'id': 'ps1', 'title': 'From Hubli to Mumbai', 'body': 'A long story of one graduate.', 'featured': true, 'publishedAt': '2026-09-01T00:00:00Z', 'alumnus': 'Karan Mehta', 'graduationYear': 2018, 'program': 'BCom', 'employer': 'Acme', 'designation': 'Manager'},
  ];

  @override
  Future<AlumniProfile> alumniProfile() async {
    calls.add('alumniProfile');
    _pw();
    return AlumniProfile.fromJson(alumniJson);
  }

  @override
  Future<AlumniProfile> saveAlumniProfile({String? phone, String? employer, String? designation, String? city, required String bio, required bool directoryVisible, required bool mentorAvailable}) async {
    calls.add('saveAlumniProfile');
    _pw();
    alumniJson = {...alumniJson, 'phone': phone, 'employer': employer, 'designation': designation, 'city': city, 'bio': bio, 'directoryVisible': directoryVisible, 'mentorAvailable': mentorAvailable};
    return AlumniProfile.fromJson(alumniJson);
  }

  @override
  Future<List<AlumniCampaign>> alumniCampaigns() async {
    calls.add('alumniCampaigns');
    _pw();
    return [for (final c in campaignJson) AlumniCampaign.fromJson(c)];
  }

  @override
  Future<Giving> alumniGiving() async {
    calls.add('alumniGiving');
    _pw();
    return Giving.fromJson({'pledges': pledgeJson, 'donations': donationJson, 'totalGivenPaise': 250000});
  }

  @override
  Future<void> alumniPledge(String campaignId, int amountPaise, {String note = ''}) async {
    calls.add('alumniPledge $campaignId $amountPaise');
    _pw();
    pledgeJson.add({'id': 'pl${pledgeJson.length + 1}', 'campaignId': campaignId, 'amountPaise': amountPaise, 'pledgedOn': '2026-10-10', 'status': 'open'});
  }

  @override
  Future<Uint8List> alumniReceiptPdf(String donationId) async {
    calls.add('alumniReceiptPdf $donationId');
    _pw();
    return Uint8List.fromList('%PDF-1.4 receipt'.codeUnits);
  }

  @override
  Future<List<VolunteerOpportunity>> alumniVolunteering() async {
    calls.add('alumniVolunteering');
    _pw();
    return [for (final v in volunteerJson) VolunteerOpportunity.fromJson(v)];
  }

  @override
  Future<void> alumniVolunteerSignUp(String id, {String note = ''}) async {
    calls.add('alumniVolunteerSignUp $id');
    _pw();
    for (final v in volunteerJson) {
      if (v['id'] == id) {
        v['signedUp'] = true;
        v['taken'] = (v['taken'] as int) + 1;
      }
    }
  }

  @override
  Future<void> alumniVolunteerWithdraw(String id) async {
    calls.add('alumniVolunteerWithdraw $id');
    _pw();
    for (final v in volunteerJson) {
      if (v['id'] == id) {
        v['signedUp'] = false;
        v['taken'] = (v['taken'] as int) - 1;
      }
    }
  }

  @override
  Future<List<SuccessStory>> myStories() async {
    calls.add('myStories');
    _pw();
    return [for (final s in storyJson) SuccessStory.fromJson(s)];
  }

  @override
  Future<SuccessStory> writeStory(String title, String body) async {
    calls.add('writeStory $title');
    _pw();
    final row = {'id': 's${storyJson.length + 1}', 'title': title, 'body': body, 'status': 'draft', 'featured': false, 'reviewNote': null};
    storyJson.insert(0, row);
    return SuccessStory.fromJson(row);
  }

  @override
  Future<SuccessStory> editStory(String id, String title, String body) async {
    calls.add('editStory $id');
    _pw();
    final row = storyJson.firstWhere((s) => s['id'] == id);
    row
      ..['title'] = title
      ..['body'] = body
      ..['status'] = 'draft';
    return SuccessStory.fromJson(row);
  }

  @override
  Future<SuccessStory> submitStory(String id) async {
    calls.add('submitStory $id');
    _pw();
    final row = storyJson.firstWhere((s) => s['id'] == id);
    row['status'] = 'submitted';
    return SuccessStory.fromJson(row);
  }

  @override
  Future<List<SuccessStory>> publishedStories() async {
    calls.add('publishedStories');
    _pw();
    return [for (final s in publishedStoryJson) SuccessStory.fromJson(s)];
  }

  // ── Live class ────────────────────────────────────────────────────────────────────────────

  /// The class being taught live, if any.
  LiveClass? liveClass;

  static LiveClass corporateLive() => LiveClass(
    deviceId: '11111111-2222-3333-4444-555555555555',
    sessionId: 'sess1',
    teacher: 'Anita Sharma',
    subject: 'Corporate Accounting',
    startedAt: DateTime.now().subtract(const Duration(minutes: 5)),
  );

  @override
  Future<LiveClass?> live() async {
    calls.add('live');
    return liveClass;
  }

  /// The buzzer as the teacher left it; a press takes the next place.
  BuzzerStatus buzzerStatus = const BuzzerStatus(active: false, locked: true, roundNo: 0);
  List<ClassNote> notes = [];

  @override
  Future<BuzzerStatus> buzzer() async {
    calls.add('buzzer');
    return buzzerStatus;
  }

  @override
  Future<BuzzerStatus> pressBuzzer() async {
    calls.add('buzz');
    if (buzzerStatus.canPress) buzzerStatus = BuzzerStatus(active: true, locked: false, roundNo: buzzerStatus.roundNo, myRank: 1, firstName: 'You');
    return buzzerStatus;
  }

  @override
  Future<List<ClassNote>> classNotes() async {
    calls.add('classNotes');
    return notes;
  }

  /// The question open on the board, if any; answers land in [ClassQuestion.myAnswer].
  ClassQuestion? question;

  @override
  Future<ClassQuestion?> classQuestion() async {
    calls.add('poll');
    return question;
  }

  @override
  Future<String> answerQuestion(String id, String answer) async {
    calls.add('answer $id $answer');
    final q = question;
    if (q == null || q.id != id) throw ApiException(400, 'This question is closed');
    final stored = q.numeric ? '${num.parse(answer)}' : answer;
    q.myAnswer = stored;
    return stored;
  }

  // ── Calendar ──────────────────────────────────────────────────────────────────────────────

  static Map<String, dynamic> eventJson(String id, String kind, String title, String startsOn, [String? endsOn, List<String>? programs]) => {
    'id': id,
    'kind': kind,
    'title': title,
    'startsOn': startsOn,
    'endsOn': endsOn ?? startsOn,
    'programIds': programs == null ? null : ['p-$id'],
    'programs': programs,
  };

  List<Map<String, dynamic>> calendarEvents = [
    eventJson('e1', 'event', 'College day', '2026-10-10'),
    eventJson('e2', 'exam', 'Mid-semester exams', '2026-10-12', '2026-10-16', ['BCom']),
    eventJson('e3', 'holiday', 'Dussehra', '2026-10-20', '2026-10-21'),
    eventJson('e4', 'exam', 'BCA practicals', '2026-10-22', null, ['BCA']),
  ];
  ApiException? calendarError;

  @override
  Future<CalendarRange> calendar({DateTime? from, DateTime? to}) async {
    calls.add('calendar');
    if (calendarError != null) throw calendarError!;
    return CalendarRange.fromJson({'from': '2026-10-04', 'to': '2027-01-02', 'today': '2026-10-04', 'events': calendarEvents});
  }

  // ── Syllabus coverage ─────────────────────────────────────────────────────────────────────

  Map<String, Map<String, dynamic>> coverageJson = {
    'sub1': {
      'covered': 1,
      'total': 2,
      'percent': 50,
      'topics': [
        {'topicId': 't1', 'coveredOn': '2026-10-01', 'coveredBy': 'Anita Sharma'},
      ],
    },
  };

  @override
  Future<Coverage> coverage({required String sectionId, required String subjectId}) async {
    calls.add('coverage $sectionId $subjectId');
    return Coverage.fromJson(coverageJson[subjectId] ?? {'covered': 0, 'total': 0, 'percent': null, 'topics': []});
  }
  // ── Year plans ────────────────────────────────────────────────────────────────────────────

  static Map<String, dynamic> planItemJson(String topicId, String title, String chapter, String weekOf, {String? coveredOn, bool late = false}) => {
    'topicId': topicId,
    'title': title,
    'chapter': chapter,
    'weekOf': weekOf,
    'periods': 2,
    'coveredOn': coveredOn,
    'late': late,
  };

  static Map<String, dynamic> planJson({String status = 'on_track', int behindBy = 0, required List<Map<String, dynamic>> items}) => {
    'id': 'plan1',
    'startsOn': '2026-09-21',
    'endsOn': '2027-01-09',
    'progress': {
      'total': items.length,
      'covered': items.where((i) => i['coveredOn'] != null).length,
      'expected': 0,
      'dueThisWeek': 1,
      'behindBy': behindBy,
      'status': status,
    },
    'items': items,
  };

  /// The class's year plans by subject id; others have none. Today is Sunday 4 Oct 2026, so this
  /// week began on 28 Sept.
  Map<String, Map<String, dynamic>> yearPlanJson = {
    'sub1': planJson(
      items: [
        planItemJson('t1', 'Underwriting and underwriting commission', 'Underwriting of Shares', '2026-09-28', coveredOn: '2026-10-01'),
        planItemJson('t2', 'Methods of valuing goodwill', 'Valuation of Goodwill', '2026-10-05'),
      ],
    ),
  };
  ApiException? yearPlanError;

  @override
  Future<YearPlan?> yearPlan({required String sectionId, required String subjectId}) async {
    calls.add('year-plan $sectionId $subjectId');
    if (yearPlanError != null) throw yearPlanError!;
    final j = yearPlanJson[subjectId];
    return j == null ? null : YearPlan.fromJson(j);
  }


  // ── Homework submissions ──────────────────────────────────────────────────────────────────

  /// 'homeworkId/studentId' → the submission JSON.
  Map<String, Map<String, dynamic>> submissions = {};
  final submitRequests = <({String homeworkId, String studentId, String text, List<UploadFile> files})>[];
  ApiException? submitError;

  /// When set, [submitHomework] waits for it after reporting half the bytes sent.
  Completer<void>? submitGate;

  @override
  Future<Submission> submission(String homeworkId, String studentId) async {
    calls.add('submission $homeworkId $studentId');
    return Submission.fromJson(submissions['$homeworkId/$studentId'] ?? {'status': null});
  }

  @override
  Future<Submission> submitHomework(
    String homeworkId,
    String studentId, {
    required String text,
    List<UploadFile> files = const [],
    void Function(int sent, int total)? onProgress,
  }) async {
    submitRequests.add((homeworkId: homeworkId, studentId: studentId, text: text, files: files));
    final total = files.fold(text.length, (n, f) => n + f.bytes.length);
    onProgress?.call(total ~/ 2, total);
    if (submitGate != null) await submitGate!.future;
    if (submitError != null) throw submitError!;
    onProgress?.call(total, total);
    final j = {
      'status': 'submitted',
      'text': text,
      'files': [
        for (final (i, f) in files.indexed) {'index': i, 'name': f.name, 'mime': f.mime, 'bytes': f.bytes.length},
      ],
      'submittedAt': '2026-10-04T05:00:00Z',
      'late': false,
      'remark': null,
      'checkedBy': null,
      'checkedAt': null,
    };
    submissions['$homeworkId/$studentId'] = j;
    return Submission.fromJson(j);
  }

  @override
  ({Uri url, Map<String, String> headers}) submissionFile(String homeworkId, String studentId, int index) =>
      (url: Uri.parse('$baseUrl/v1/homework/$homeworkId/submissions/$studentId/files/$index'), headers: const {});

  // ── Consent ───────────────────────────────────────────────────────────────────────────────

  static Map<String, dynamic> decided(bool granted, {String by = 'Aarav Patel', String version = '2026-10'}) => {
    'granted': granted,
    'at': '2026-10-01T05:00:00Z',
    'noticeVersion': version,
    'givenBy': by,
  };

  /// Everything decided by default, so the consent screen stays away from other tests.
  Map<String, dynamic> consentJson = {
    'studentId': 's1',
    'noticeVersion': '2026-10',
    'canDecide': true,
    'purposes': <String, dynamic>{
      'data_processing': decided(true),
      'ai_features': decided(true),
      'class_recordings': decided(true),
      'photos': decided(true),
    },
  };
  final consentRequests = <String>[];
  ApiException? consentError;

  @override
  Future<Consents> consents(String studentId) async {
    calls.add('consents $studentId');
    return Consents.fromJson(consentJson);
  }

  @override
  Future<Consents> setConsent(String studentId, ConsentPurpose purpose, {required bool granted}) async {
    consentRequests.add('$studentId ${purpose.wire} $granted');
    if (consentError != null) throw consentError!;
    consentJson = {
      ...consentJson,
      'purposes': {...(consentJson['purposes'] as Map), purpose.wire: decided(granted, by: profile.fullName)},
    };
    return Consents.fromJson(consentJson);
  }

  @override
  Future<void> registerPushDevice({required String token, required String platform}) async => calls.add('push register $token $platform');

  @override
  Future<void> removePushDevice(String token) async => calls.add('push remove $token');
}

/// Hands the hand-in screen fixed files instead of opening the camera, gallery or files.
class FakeAttachmentPicker implements AttachmentPicker {
  final picked = <AttachmentSource>[];
  Map<AttachmentSource, List<UploadFile>> files = {
    AttachmentSource.camera: [UploadFile(name: 'page1.jpg', mime: 'image/jpeg', bytes: Uint8List(1200))],
    AttachmentSource.gallery: [
      UploadFile(name: 'page2.png', mime: 'image/png', bytes: Uint8List(800)),
      UploadFile(name: 'page3.png', mime: 'image/png', bytes: Uint8List(900)),
    ],
    AttachmentSource.pdf: [UploadFile(name: 'answers.pdf', mime: 'application/pdf', bytes: Uint8List(3000))],
  };

  @override
  Future<List<UploadFile>> pick(AttachmentSource source, {int max = maxUploadFiles}) async {
    picked.add(source);
    return (files[source] ?? const []).take(max).toList();
  }
}
