/// In-memory fake of the API. Widget tests use it directly; demo builds
/// (`--dart-define=KINETIX_DEMO=true`) use it through DemoStudentApi (demo_api.dart).
library;

import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/painting.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import '../core/api.dart';
import '../core/attachments.dart';
import '../core/campus.dart';
import '../core/campus_services.dart';
import '../core/lms.dart';
import '../core/models.dart';

/// In-memory [StudentApi] for widget tests.
class FakeStudentApi implements StudentApi {
  /// LMS courses by student; the demo school publishes one with a grade.
  List<LmsCourseSummary> lmsCourseList = const [LmsCourseSummary(courseId: 'c1', title: 'Mathematics 7 B', subject: 'Mathematics', moduleCount: 2, overall: 82, letter: 'A')];
  ApiException? lmsError;

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
    passes: [GatePass(id: 'gp1', reason: 'Weekend at home', destination: 'Mysuru', expectedBackAt: DateTime(2026, 9, 21, 19), status: 'returned')],
  );
  ApiException? hostelError;

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
