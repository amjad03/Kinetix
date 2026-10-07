/// In-memory fakes of the API and realtime. Widget tests use them directly; demo builds
/// (`--dart-define=KINETIX_DEMO=true`) use them through DemoParentApi (demo_api.dart).
library;

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter/painting.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import '../core/api.dart';
import '../core/attachments.dart';
import '../core/realtime.dart';
import '../core/models.dart';

/// In-memory [ParentApi] for widget tests.
class FakeParentApi implements ParentApi {
  @override
  String baseUrl = 'http://test';
  @override
  String? token;

  final calls = <String>[];

  Me profile = Me(
    id: 'u1',
    fullName: 'Rajesh Patel',
    roles: ['guardian'],
    preferredLanguage: 'en',
    institution: 'Demo College',
    email: 'parent@demo.kinetix.in',
    phone: '+919800000001',
  );

  final aarav = Child(
    id: 'c1',
    fullName: 'Aarav Patel',
    rollNo: 'U03BC001',
    sectionId: 'sec1',
    sectionName: 'BCom Sem 3 A',
    relation: 'father',
    programName: 'BCom',
  );
  final diya = Child(
    id: 'c2',
    fullName: 'Diya Patel',
    rollNo: 'U01CA001',
    sectionId: 'sec2',
    sectionName: 'BCA Sem 1 A',
    relation: 'father',
    programName: 'BCA',
  );
  late List<Child> kids = [aarav, diya];

  static final today = DateTime(2026, 10, 4);

  Homework homework({String id = 'h1', String title = 'Exercise 4.2: Issue of shares', int dueIn = 1, String subject = 'Corporate Accounting'}) =>
      Homework(
        id: id,
        title: title,
        instructions: 'Solve questions 1 to 5 from the textbook. Show journal entries for each.',
        dueOn: today.add(Duration(days: dueIn)),
        subject: subject,
        teacher: 'Anita Sharma',
      );

  late Map<String, ChildSummary> summaries = {
    'c1': ChildSummary(
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
        homework(id: 'h2', title: 'Cost sheet practice', dueIn: 5),
      ],
      pastHomework: [homework(id: 'h3', title: 'Forfeiture of shares: notes', dueIn: -3)],
      participation: [Participation(subject: 'Corporate Accounting', correct: 4, partial: 1, incorrect: 0, skipped: 0)],
      boards: [board.summary],
      recordings: recordings,
    ),
    'c2': ChildSummary(
      today: today,
      days: 30,
      attendance: AttendanceSummary(periods: 20, present: 20, absent: 0, late: 0, excused: 0, rate: 100, recentAbsences: []),
      upcoming: [],
      pastHomework: [],
      participation: [],
      boards: [],
    ),
  };

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
      kind: NotificationKind.absence,
      title: 'Aarav was marked absent',
      body: 'Aarav Patel was marked absent for Corporate Accounting (10:00–10:55) on Thu 1 Oct.',
      data: {'studentId': 'c1', 'date': '2026-10-01'},
      createdAt: DateTime.now().subtract(const Duration(days: 3)),
    ),
    AppNotification(
      id: 'n3',
      kind: NotificationKind.broadcast,
      title: 'Parent–teacher meeting',
      body: 'Saturday 10 October, 10:00 in the main hall.',
      data: {'broadcastId': 'b1'},
      createdAt: DateTime.now().subtract(const Duration(days: 5)),
      readAt: DateTime.now().subtract(const Duration(days: 4)),
    ),
  ];

  AppNotification boardNotice(String id, String whiteboardId) => AppNotification(
    id: id,
    kind: NotificationKind.boardShared,
    title: "Today's board: Corporate Accounting",
    body: 'Issue and forfeiture of shares. Open it to revise what was taught in class.',
    data: {'whiteboardId': whiteboardId, 'sectionId': 'sec1'},
    createdAt: DateTime.now(),
  );

  /// Shared with Aarav's class, newest first: he missed the older one.
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

  Map<String, dynamic> recordingJsonFor(String id, {bool missed = false}) =>
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

  AppNotification recordingNotice(String id, String recordingId) => AppNotification(
    id: id,
    kind: NotificationKind.recording,
    title: 'Missed Corporate Accounting? Watch the lesson',
    body: 'Issue of shares',
    data: {'recordingId': recordingId, 'sectionId': 'sec1'},
    createdAt: DateTime.now(),
  );

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
            {
              't': 'shape',
              's': 'triangle',
              'c': 4292423717,
              'w': 4,
              'p': [800, 200, 700, 400, 900, 400, 800, 200],
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
  Future<List<Child>> children() async => kids;

  @override
  Future<ChildSummary> summary(String childId, {int days = 30}) async {
    calls.add('summary $childId');
    final s = summaries[childId];
    if (s == null) throw ApiException(404, 'Child not found');
    return s;
  }

  @override
  Future<List<ClassMark>> attendance(String childId, {int days = 30}) async => attendanceMarks;

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

  final corpAcc = const Subject(id: 'sub1', name: 'Corporate Accounting', code: 'BCOM-3.1');
  final costing = const Subject(id: 'sub2', name: 'Cost Accounting', code: 'BCOM-3.3');

  /// Each child's subjects (`GET /v1/parent/children/:id/subjects`); others have none.
  late Map<String, List<Subject>> subjectsOfChild = {'c1': [costing, corpAcc]};

  @override
  Future<List<Subject>> childSubjects(String childId) async {
    calls.add('subjects $childId');
    return subjectsOfChild[childId] ?? const [];
  }

  /// The subject of each homework `GET /v1/homework/:id` knows (others are 404).
  late Map<String, Subject> subjectOfHomework = {'h1': corpAcc, 'h2': corpAcc, 'h3': corpAcc};

  @override
  Future<({Homework homework, String sectionId, Subject subject})> homeworkById(String id) async {
    calls.add('homework $id');
    final subject = subjectOfHomework[id];
    for (final MapEntry(key: childId, value: s) in summaries.entries) {
      final hw = [...s.upcoming, ...s.pastHomework].where((h) => h.id == id).firstOrNull;
      if (hw != null && subject != null) return (homework: hw, sectionId: kids.firstWhere((k) => k.id == childId).sectionId, subject: subject);
    }
    throw ApiException(404, 'Homework not found');
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

  @override
  Future<CalendarRange> calendar({DateTime? from, DateTime? to}) async {
    calls.add('calendar');
    return CalendarRange.fromJson({'from': '2026-10-04', 'to': '2027-01-02', 'today': '2026-10-04', 'events': calendarEvents});
  }

  // ── Syllabus and coverage ─────────────────────────────────────────────────────────────────

  late Map<String, CourseOutline?> syllabi = {
    'sub1': CourseOutline(
      id: 'c1',
      title: 'Corporate Accounting, BCom Semester 3',
      reviewed: false,
      chapters: [
        OutlineChapter(
          id: 'ch1',
          title: 'Underwriting of Shares',
          topics: [OutlineTopic(id: 't1', title: 'Underwriting and underwriting commission', summary: 'What underwriting is and the commission allowed by law.')],
        ),
        OutlineChapter(
          id: 'ch2',
          title: 'Valuation of Goodwill',
          topics: [OutlineTopic(id: 't2', title: 'Methods of valuing goodwill', summary: 'Average profit and super profit methods.')],
        ),
      ],
    ),
  };

  @override
  Future<CourseOutline?> syllabus(String subjectId) async {
    calls.add('syllabus $subjectId');
    return syllabi[subjectId];
  }

  Map<String, Map<String, dynamic>> coverageJson = {
    'sec1|sub1': {
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
    return Coverage.fromJson(coverageJson['$sectionId|$subjectId'] ?? {'covered': 0, 'total': 0, 'percent': null, 'topics': []});
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

  /// The class's year plans by 'sectionId|subjectId'; others have none. Today is Sunday 4 Oct 2026, so this
  /// week began on 28 Sept.
  Map<String, Map<String, dynamic>> yearPlanJson = {
    'sec1|sub1': planJson(
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
    final j = yearPlanJson['$sectionId|$subjectId'];
    return j == null ? null : YearPlan.fromJson(j);
  }


  // ── Homework submissions ──────────────────────────────────────────────────────────────────

  /// 'homeworkId/childId' → the submission JSON.
  Map<String, Map<String, dynamic>> submissions = {};
  final submitRequests = <({String homeworkId, String studentId, String text, List<UploadFile> files})>[];
  ApiException? submitError;

  /// When set, [submitHomework] waits for it after reporting half the bytes sent.
  Completer<void>? submitGate;

  @override
  Future<Submission> submission(String homeworkId, String childId) async {
    calls.add('submission $homeworkId $childId');
    return Submission.fromJson(submissions['$homeworkId/$childId'] ?? {'status': null});
  }

  @override
  Future<Submission> submitHomework(
    String homeworkId,
    String childId, {
    required String text,
    List<UploadFile> files = const [],
    void Function(int sent, int total)? onProgress,
  }) async {
    submitRequests.add((homeworkId: homeworkId, studentId: childId, text: text, files: files));
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
    submissions['$homeworkId/$childId'] = j;
    return Submission.fromJson(j);
  }

  @override
  ({Uri url, Map<String, String> headers}) submissionFile(String homeworkId, String childId, int index) =>
      (url: Uri.parse('$baseUrl/v1/homework/$homeworkId/submissions/$childId/files/$index'), headers: const {});

  // ── Consent ───────────────────────────────────────────────────────────────────────────────

  static Map<String, dynamic> decided(bool granted, {String by = 'Rajesh Patel', String version = '2026-10'}) => {
    'granted': granted,
    'at': '2026-10-01T05:00:00Z',
    'noticeVersion': version,
    'givenBy': by,
  };

  static Map<String, dynamic> allDecided(String childId, {bool canDecide = true}) => {
    'studentId': childId,
    'noticeVersion': '2026-10',
    'canDecide': canDecide,
    'purposes': <String, dynamic>{
      'data_processing': decided(true),
      'ai_features': decided(true),
      'class_recordings': decided(true),
      'photos': decided(true),
    },
  };

  /// Everything decided by default, so the consent screen stays away from other tests.
  late Map<String, Map<String, dynamic>> consentJson = {'c1': allDecided('c1'), 'c2': allDecided('c2')};
  final consentRequests = <String>[];

  @override
  Future<Consents> consents(String childId) async {
    calls.add('consents $childId');
    return Consents.fromJson(consentJson[childId] ?? allDecided(childId));
  }

  @override
  Future<Consents> setConsent(String childId, ConsentPurpose purpose, {required bool granted}) async {
    consentRequests.add('$childId ${purpose.wire} $granted');
    final j = consentJson[childId] ?? allDecided(childId);
    consentJson[childId] = {
      ...j,
      'purposes': {...(j['purposes'] as Map), purpose.wire: decided(granted, by: profile.fullName)},
    };
    return Consents.fromJson(consentJson[childId]!);
  }

  @override
  Future<void> registerPushDevice({required String token, required String platform}) async => calls.add('push register $token $platform');

  @override
  Future<void> removePushDevice(String token) async => calls.add('push remove $token');

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

  // ── Fees ──────────────────────────────────────────────────────────────────────────────────

  /// 'demo', 'razorpay' or null (pay at the counter).
  String? onlinePayments = 'demo';

  /// Aarav: tuition part-paid (due in 11 days) and an overdue exam fee. Diya: all paid.
  late Map<String, List<FeeInvoice>> invoices = {
    'c1': [
      FeeInvoice(
        id: 'i1',
        title: 'Semester 3 tuition',
        amountPaise: 4250000,
        paidPaise: 1000000,
        dueOn: DateTime(2026, 10, 15),
        status: FeeStatus.due,
      ),
      FeeInvoice(id: 'i2', title: 'Exam fee', amountPaise: 250000, paidPaise: 0, dueOn: DateTime(2026, 10, 1), status: FeeStatus.due),
    ],
    'c2': [
      FeeInvoice(
        id: 'i3',
        title: 'Semester 1 tuition',
        amountPaise: 3800000,
        paidPaise: 3800000,
        dueOn: DateTime(2026, 9, 20),
        status: FeeStatus.paid,
      ),
    ],
  };

  late Map<String, List<FeePayment>> feePayments = {
    'c1': [
      FeePayment(
        id: 'p1',
        invoiceId: 'i1',
        amountPaise: 1000000,
        method: PaymentMethod.cash,
        receiptNo: 'RCPT/2026-27/00001',
        paidAt: DateTime(2026, 9, 28, 11, 5),
      ),
    ],
    'c2': [
      FeePayment(
        id: 'p2',
        invoiceId: 'i3',
        amountPaise: 3800000,
        method: PaymentMethod.online,
        receiptNo: 'RCPT/2026-27/00002',
        paidAt: DateTime(2026, 9, 18, 18, 40),
      ),
    ],
  };

  final _orders = <String, ({String invoiceId, String childId, int amountPaise, String orderId})>{};
  var _receiptNo = 2;

  String? _childOfInvoice(String invoiceId) => invoices.entries.where((e) => e.value.any((i) => i.id == invoiceId)).firstOrNull?.key;

  @override
  Future<StudentFees> fees(String childId) async {
    calls.add('fees $childId');
    final list = [...?invoices[childId]]..sort((a, b) => b.dueOn.compareTo(a.dueOn));
    return StudentFees(
      duePaise: list.where((i) => !i.isPaid).fold(0, (s, i) => s + i.balancePaise),
      onlinePayments: switch (onlinePayments) {
        'demo' => OnlinePayments.demo,
        'razorpay' => OnlinePayments.razorpay,
        _ => null,
      },
      invoices: list,
      payments: [...?feePayments[childId]]..sort((a, b) => b.paidAt!.compareTo(a.paidAt!)),
    );
  }

  @override
  Future<FeeCheckout> checkout(String invoiceId, {int? amountPaise}) async {
    calls.add('checkout $invoiceId ${amountPaise ?? 'full'}');
    if (onlinePayments == null) throw ApiException(503, 'Online payment is not available yet. Please pay at the fees counter.');
    final childId = _childOfInvoice(invoiceId);
    if (childId == null) throw ApiException(404, 'Invoice not found');
    final inv = invoices[childId]!.firstWhere((i) => i.id == invoiceId);
    if (inv.isPaid) throw ApiException(400, 'This fee is already paid');
    final amount = amountPaise ?? inv.balancePaise;
    if (amount > inv.balancePaise) throw ApiException(400, 'That is more than the balance due');
    final paymentId = 'pay${_orders.length + 10}';
    final orderId = '${onlinePayments}_order_${_orders.length + 1}';
    _orders[paymentId] = (invoiceId: invoiceId, childId: childId, amountPaise: amount, orderId: orderId);
    return FeeCheckout(
      paymentId: paymentId,
      provider: onlinePayments!,
      keyId: onlinePayments == 'demo' ? 'demo' : 'rzp_test_key',
      orderId: orderId,
      amountPaise: amount,
      currency: 'INR',
      name: 'Demo College',
      description: inv.title,
      prefillName: profile.fullName,
      prefillEmail: profile.email!,
      prefillContact: profile.phone!,
    );
  }

  @override
  Future<FeeReceipt> confirmPayment(String paymentId, {required String providerPaymentId, required String signature}) async {
    calls.add('confirm $paymentId');
    final o = _orders[paymentId];
    if (o == null) throw ApiException(404, 'Payment not found');
    final expected = Hmac(sha256, utf8.encode('kinetix-demo-payments')).convert(utf8.encode('${o.orderId}|$providerPaymentId')).toString();
    if (signature != expected) throw ApiException(403, 'The payment could not be verified');
    final list = invoices[o.childId]!;
    final at = list.indexWhere((i) => i.id == o.invoiceId);
    final inv = list[at];
    final paid = inv.paidPaise + o.amountPaise;
    list[at] = FeeInvoice(
      id: inv.id,
      title: inv.title,
      amountPaise: inv.amountPaise,
      paidPaise: paid,
      dueOn: inv.dueOn,
      status: paid >= inv.amountPaise ? FeeStatus.paid : FeeStatus.due,
    );
    _receiptNo++;
    feePayments[o.childId]!.add(
      FeePayment(
        id: paymentId,
        invoiceId: o.invoiceId,
        amountPaise: o.amountPaise,
        method: PaymentMethod.online,
        receiptNo: 'RCPT/2026-27/${_receiptNo.toString().padLeft(5, '0')}',
        paidAt: DateTime.now(),
      ),
    );
    _references[paymentId] = providerPaymentId;
    return receipt(paymentId);
  }

  final _references = <String, String>{};

  @override
  Future<FeeReceipt> receipt(String paymentId) async {
    calls.add('receipt $paymentId');
    for (final MapEntry(key: childId, value: list) in feePayments.entries) {
      final p = list.where((p) => p.id == paymentId).firstOrNull;
      if (p == null) continue;
      final child = kids.firstWhere((k) => k.id == childId);
      final inv = invoices[childId]!.firstWhere((i) => i.id == p.invoiceId);
      return FeeReceipt(
        receiptNo: p.receiptNo!,
        institution: 'Demo College',
        studentId: child.id,
        studentName: child.fullName,
        rollNo: child.rollNo,
        className: child.sectionName,
        feeTitle: inv.title,
        feeAmountPaise: inv.amountPaise,
        balancePaise: inv.balancePaise,
        amountPaise: p.amountPaise,
        method: p.method,
        reference: _references[paymentId],
        paidAt: p.paidAt!,
      );
    }
    throw ApiException(404, 'Receipt not found');
  }

  // ── Library ───────────────────────────────────────────────────────────────────────────────

  /// Aarav: one book due in 5 days and one returned late with a fine. Diya: one overdue.
  late Map<String, LibraryAccount> libraries = {
    'c1': LibraryAccount.fromJson({
      'current': [loanJson('l1', 'Corporate Accounting', author: 'S. N. Maheshwari', dueOn: '2026-10-09')],
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
    }),
    'c2': LibraryAccount.fromJson({
      'current': [
        loanJson('l3', 'Discrete Mathematics and Its Applications', author: 'Kenneth H. Rosen', dueOn: '2026-09-30', overdue: true, fineSoFarPaise: 800),
      ],
      'history': [],
      'finesPaise': 0,
    }),
  };

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
  Future<LibraryAccount> library(String childId) async {
    calls.add('library $childId');
    return libraries[childId] ?? LibraryAccount(current: [], history: [], finesPaise: 0);
  }

  // ── Transport ─────────────────────────────────────────────────────────────────────────────

  /// Per child; a child without an entry has no bus.
  Map<String, StudentBus> buses = {
    'c1': StudentBus.fromJson({
      'assigned': true,
      'routeId': 'r1',
      'routeName': 'Route 4 · Indiranagar',
      'regNo': 'KA01AB1234',
      'stopId': 's2',
      'stopName': 'Defence Colony',
      'stopLat': 12.97,
      'stopLng': 77.64,
      'pickupTime': '07:30',
      'stops': [
        {'id': 's1', 'name': '100 Feet Road', 'seq': 1, 'lat': 12.96, 'lng': 77.63},
        {'id': 's2', 'name': 'Defence Colony', 'seq': 2, 'lat': 12.97, 'lng': 77.64},
        {'id': 's3', 'name': 'College gate', 'seq': 3, 'lat': 12.98, 'lng': 77.65},
      ],
      'bus': null,
    }),
  };
  ApiException? busError;

  @override
  Future<StudentBus> bus(String childId) async {
    calls.add('bus $childId');
    if (busError != null) throw busError!;
    return buses[childId] ?? const StudentBus(assigned: false);
  }

  // ── Marks ─────────────────────────────────────────────────────────────────────────────────

  late Map<String, ChildMarks> childMarks = {
    'c1': ChildMarks.fromJson({
      'assessments': [
        {
          'id': 'a1',
          'title': 'Unit test 1: Underwriting of shares',
          'kind': 'test',
          'maxMarks': 25,
          'heldOn': '2026-09-28',
          'subject': 'Corporate Accounting',
          'marks': 22.5,
          'absent': false,
          'remark': 'Neat journal entries.',
          'classAverage': 18.7,
          'classHighest': 24,
        },
        {
          'id': 'a2',
          'title': 'Cost sheet assignment',
          'kind': 'assignment',
          'maxMarks': 10,
          'heldOn': '2026-09-21',
          'subject': 'Cost Accounting',
          'marks': 5,
          'absent': false,
          'remark': null,
          'classAverage': 7.2,
          'classHighest': 10,
        },
      ],
      'subjects': [
        {'subject': 'Corporate Accounting', 'percent': 90},
        {'subject': 'Cost Accounting', 'percent': 50},
      ],
    }),
    'c2': ChildMarks(assessments: [], subjects: []),
  };

  @override
  Future<ChildMarks> marks(String childId) async {
    calls.add('marks $childId');
    return childMarks[childId] ?? ChildMarks(assessments: [], subjects: []);
  }

  // ── Messages ──────────────────────────────────────────────────────────────────────────────

  late List<ChildContacts> familyContacts = [
    ChildContacts(
      studentId: 'c1',
      studentName: 'Aarav Patel',
      className: 'BCom Sem 3 A',
      staff: [
        StaffContact(id: 't1', fullName: 'Anita Sharma', subjects: ['Corporate Accounting', 'Cost Accounting']),
      ],
    ),
    ChildContacts(
      studentId: 'c2',
      studentName: 'Diya Patel',
      className: 'BCA Sem 1 A',
      staff: [
        StaffContact(id: 't2', fullName: 'Ravi Kumar', subjects: ['Discrete Mathematics']),
      ],
    ),
  ];

  static DateTime _yesterday(int hour) {
    final y = DateTime.now().subtract(const Duration(days: 1));
    return DateTime(y.year, y.month, y.day, hour);
  }

  /// Conversation id → its messages, oldest first.
  late Map<String, List<ChatMessage>> chats = {
    'cv1': [
      ChatMessage(
        id: 'm1',
        senderId: 'u1',
        body: 'Good morning ma’am. Aarav had fever on Tuesday. Could you share what was covered?',
        createdAt: _yesterday(9),
      ),
      ChatMessage(id: 'm2', senderId: 't1', body: 'Hope he is better now. Please ask him to try Exercise 4.2.', createdAt: _yesterday(15)),
    ],
  };

  /// Conversation id → (child, teacher) and when the parent last read it.
  late Map<String, ({String childId, String teacherId})> threadInfo = {'cv1': (childId: 'c1', teacherId: 't1')};
  final _readAt = <String, DateTime>{};

  Conversation _summary(String id) {
    final info = threadInfo[id]!;
    final child = kids.firstWhere((k) => k.id == info.childId);
    final teacher = familyContacts.expand((c) => c.staff).firstWhere((s) => s.id == info.teacherId);
    final list = chats[id] ?? [];
    final read = _readAt[id];
    return Conversation(
      id: id,
      student: Person(id: child.id, fullName: child.fullName),
      className: child.sectionName,
      staff: Person(id: teacher.id, fullName: teacher.fullName),
      family: Person(id: profile.id, fullName: profile.fullName),
      lastMessage: list.lastOrNull?.body,
      lastMessageAt: list.lastOrNull?.createdAt,
      unread: list.where((m) => m.senderId != profile.id && (read == null || m.createdAt.isAfter(read))).length,
    );
  }

  @override
  Future<List<ChildContacts>> contacts() async {
    calls.add('contacts');
    return familyContacts;
  }

  @override
  Future<List<Conversation>> conversations() async {
    calls.add('conversations');
    final list = [for (final id in threadInfo.keys) _summary(id)];
    list.sort((a, b) => (b.lastMessageAt ?? DateTime(0)).compareTo(a.lastMessageAt ?? DateTime(0)));
    return list;
  }

  @override
  Future<Conversation> startConversation({required String childId, required String teacherId}) async {
    calls.add('start $childId $teacherId');
    final existing = threadInfo.entries.where((e) => e.value.childId == childId && e.value.teacherId == teacherId).firstOrNull;
    if (existing != null) return _summary(existing.key);
    final id = 'cv${threadInfo.length + 1}';
    threadInfo[id] = (childId: childId, teacherId: teacherId);
    chats[id] = [];
    return _summary(id);
  }

  /// Page size for [messages] (the server's is 50).
  int pageSize = 50;

  @override
  Future<MessagePage> messages(String conversationId, {DateTime? before}) async {
    calls.add('messages $conversationId${before == null ? '' : ' before'}');
    if (!threadInfo.containsKey(conversationId)) throw ApiException(404, 'Conversation not found');
    final all = (chats[conversationId] ?? []).where((m) => before == null || m.createdAt.isBefore(before)).toList();
    final page = all.length <= pageSize ? all : all.sublist(all.length - pageSize);
    return MessagePage(conversation: _summary(conversationId), messages: page);
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
}

/// Hands the hand-in screen fixed files instead of opening the camera, gallery or files.
class FakeAttachmentPicker implements AttachmentPicker {
  final picked = <AttachmentSource>[];
  Map<AttachmentSource, List<UploadFile>> files = {
    AttachmentSource.camera: [UploadFile(name: 'page1.jpg', mime: 'image/jpeg', bytes: Uint8List(1200))],
    AttachmentSource.gallery: [UploadFile(name: 'page2.png', mime: 'image/png', bytes: Uint8List(800))],
    AttachmentSource.pdf: [UploadFile(name: 'answers.pdf', mime: 'application/pdf', bytes: Uint8List(3000))],
  };

  @override
  Future<List<UploadFile>> pick(AttachmentSource source, {int max = maxUploadFiles}) async {
    picked.add(source);
    return (files[source] ?? const []).take(max).toList();
  }
}

/// An in-memory realtime connection: tests play the server.
class FakeRealtimeConnection implements RealtimeConnection {
  FakeRealtimeConnection({required this.baseUrl, required this.token});

  final String baseUrl;
  final String token;
  final _signals = StreamController<RealtimeSignal>.broadcast(sync: true);
  bool connected = false;
  bool disposed = false;

  @override
  Stream<RealtimeSignal> get signals => _signals.stream;

  @override
  void connect() {
    connected = true;
    scheduleMicrotask(() => send(const RealtimeReady()));
  }

  @override
  void dispose() {
    disposed = true;
    _signals.close();
  }

  void send(RealtimeSignal s) {
    if (!_signals.isClosed) _signals.add(s);
  }
}

/// Hands out [FakeRealtimeConnection]s and remembers them.
class FakeRealtimeServer {
  final connections = <FakeRealtimeConnection>[];

  RealtimeConnection connect({required String baseUrl, required String token}) {
    final c = FakeRealtimeConnection(baseUrl: baseUrl, token: token);
    connections.add(c);
    return c;
  }
}
