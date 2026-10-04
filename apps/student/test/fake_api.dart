import 'dart:async';
import 'dart:typed_data';

import 'package:kinetix_lesson/kinetix_lesson.dart';
import 'package:kinetix_student/core/api.dart';
import 'package:kinetix_student/core/attachments.dart';
import 'package:kinetix_student/core/models.dart';
import 'package:kinetix_student/core/push.dart';

/// In-memory [StudentApi] for widget tests.
class FakeStudentApi implements StudentApi {
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
    recordingJson('r1', 'Cost sheets', subject: 'Cost Accounting', startedAt: '2026-10-04T03:30:00Z'),
    recordingJson('r2', 'Issue of shares', subject: 'Corporate Accounting', startedAt: '2026-10-01T04:30:00Z', missed: true),
  ].map(RecordingInfo.fromJson).toList();

  static Map<String, dynamic> recordingJson(
    String id,
    String title, {
    required String subject,
    required String startedAt,
    bool missed = false,
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

  @override
  Future<Me> me() async => profile;

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

/// A push token source that always has a token, as Firebase would.
class FakePushTokenSource implements PushTokenSource {
  @override
  Future<String?> token() async => 'device-token-123456';

  @override
  String get platform => 'android';
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
