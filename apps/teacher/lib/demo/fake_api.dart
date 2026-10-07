/// In-memory fakes of the API, realtime and push. Widget tests use them directly; demo builds
/// (`--dart-define=KINETIX_DEMO=true`) use them through DemoTeacherApi (demo_api.dart).
library;

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/painting.dart';

import 'package:kinetix_lesson/kinetix_lesson.dart';
import '../core/api.dart';
import '../core/hr_models.dart';
import '../core/models.dart';
import '../core/push.dart';
import '../core/realtime.dart';

/// A [TeacherRealtime] the test drives: [send] delivers `message.new`.
class FakeRealtime implements TeacherRealtime {
  final _messages = StreamController<MessageNew>.broadcast();
  final _reconnected = StreamController<void>.broadcast();
  String? connectedWith;
  int disconnects = 0;

  @override
  Stream<MessageNew> get messages => _messages.stream;
  @override
  Stream<void> get reconnected => _reconnected.stream;
  @override
  void connect({required String baseUrl, required String token}) => connectedWith = '$baseUrl $token';
  @override
  void disconnect() => disconnects++;

  void send(MessageNew m) => _messages.add(m);
  void reconnect() => _reconnected.add(null);
}

/// A [PushMessaging] the test drives: [tap] delivers a tapped push, [refresh] a new token.
class FakePush implements PushMessaging {
  FakePush({this.currentToken = 'fcm-1', this.launchedBy});

  String? currentToken;

  /// The push that launched the app, if any.
  PushTap? launchedBy;
  int permissionRequests = 0, tokenDeletes = 0;
  final _taps = StreamController<PushTap>.broadcast();
  final _refreshed = StreamController<String>.broadcast();

  @override
  String get platform => 'android';
  @override
  Future<bool> requestPermission() async {
    permissionRequests++;
    return true;
  }

  @override
  Future<String?> token() async => currentToken;
  @override
  Stream<String> get tokenRefreshed => _refreshed.stream;
  @override
  Future<PushTap?> initialTap() async => launchedBy;
  @override
  Stream<PushTap> get taps => _taps.stream;
  @override
  Future<void> deleteToken() async {
    tokenDeletes++;
    currentToken = null;
  }

  void tap(PushTap t) => _taps.add(t);
  void refresh(String token) => _refreshed.add(currentToken = token);
}

/// A 1×1 PNG.
final onePixelPng = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');

/// In-memory [TeacherApi] for widget tests.
class FakeTeacherApi implements TeacherApi {
  @override
  String baseUrl = 'http://test';
  @override
  String? token;

  final calls = <String>[];

  Me profile = Me(
    id: 'u1',
    fullName: 'Anita Sharma',
    roles: ['teacher'],
    // English so most tests read like the spec; the i18n tests switch this to hi or kn.
    preferredLanguage: 'en',
    institution: 'Demo College',
    email: 'anita@demo.kinetix.in',
  );

  final section = const Ref('sec1', 'BCom Sem 3 A');
  final subject = const Ref('sub1', 'Corporate Accounting', 'BCOM-3.1');

  late List<Student> students = [
    Student(id: 's1', rollNo: 'U03BC001', fullName: 'Aarav Patel'),
    Student(id: 's2', rollNo: 'U03BC002', fullName: 'Ananya Gowda'),
    Student(id: 's3', rollNo: 'U03BC003', fullName: 'Bhavya Reddy'),
  ];
  Map<String, AttendanceStatus> existingMarks = {};
  Map<String, AttendanceStatus>? submitted;

  /// Timetables by date; dates not listed are empty.
  Map<String, List<Period>> periodsByDate = {};
  String today = '2026-10-04';
  String validCode = '482913';
  BoardConnection? active;

  Period period({String slotId = 'slot1', bool isNow = false}) => Period(
    slotId: slotId,
    startsAt: ClockTime.parse('10:00:00'),
    endsAt: ClockTime.parse('10:55:00'),
    section: section,
    subject: subject,
    room: const Ref('r1', 'Room 204'),
    isNow: isNow,
  );

  @override
  Future<void> login({required String tenant, required String login, required String password}) async {
    calls.add('login $tenant $login');
    if (password != 'kinetix123') throw ApiException(401, 'Wrong institution, login or password');
    token = 'tok';
  }

  /// The code the fake "texts" for phone sign-in, and the numbers that have an account.
  String validOtp = '246810';
  Set<String> otpPhones = {'+919845012345'};

  /// When set, POST /v1/auth/otp/request answers 429 RATE_LIMITED.
  bool otpRateLimited = false;
  OtpChallenge otpChallenge = const OtpChallenge(retryAfter: Duration(seconds: 30), expiresIn: Duration(minutes: 5));

  @override
  Future<OtpChallenge> requestOtp({required String tenant, required String phone}) async {
    calls.add('otp request $tenant $phone');
    if (otpRateLimited) throw ApiException(429, 'Too many requests', code: 'RATE_LIMITED');
    return otpChallenge;
  }

  @override
  Future<void> verifyOtp({required String tenant, required String phone, required String code}) async {
    calls.add('otp verify $tenant $phone $code');
    if (code != validOtp || !otpPhones.contains(phone)) throw ApiException(401, 'Invalid or expired code', code: 'OTP_INVALID');
    token = 'otp-tok';
  }

  /// Push tokens registered (token → platform), in order of the calls.
  final pushDevices = <String, String>{};

  @override
  Future<void> registerPushDevice({required String token, required String platform}) async {
    calls.add('push register $token $platform');
    pushDevices[token] = platform;
  }

  @override
  Future<void> unregisterPushDevice(String token) async {
    calls.add('push unregister $token');
    pushDevices.remove(token);
  }

  List<AppNotification> notificationItems = [];

  @override
  Future<List<AppNotification>> notifications() async => notificationItems;

  @override
  Future<void> markNotificationRead(String id) async => calls.add('read notification $id');

  /// When set, GET /v1/me throws it (401: the saved token was revoked).
  ApiException? meError;

  @override
  Future<Me> me() async {
    if (meError != null) throw meError!;
    return profile;
  }

  /// The account's language (en, hi or kn).
  void useLanguage(String language) => profile = Me(
    id: profile.id,
    fullName: profile.fullName,
    roles: profile.roles,
    preferredLanguage: language,
    institution: profile.institution,
    email: profile.email,
  );

  /// When set, PATCH /v1/me fails as if offline.
  bool languageSaveFails = false;

  @override
  Future<Me> updatePreferredLanguage(String language) async {
    calls.add('language $language');
    if (languageSaveFails) throw ApiException(0, 'offline', kind: ApiErrorKind.offline);
    return profile = Me(
      id: profile.id,
      fullName: profile.fullName,
      roles: profile.roles,
      preferredLanguage: language,
      institution: profile.institution,
      email: profile.email,
    );
  }

  /// Holidays by date (no classes on them).
  Map<String, String> holidays = {};

  @override
  Future<DayTimetable> timetable({String? date}) async {
    final d = date ?? today;
    final sorted = periodsByDate.keys.where((k) => !holidays.containsKey(k)).toList()..sort();
    return DayTimetable(
      date: d,
      today: today,
      periods: holidays.containsKey(d) ? [] : periodsByDate[d] ?? [],
      nextTeachingDate: sorted.where((k) => k.compareTo(d) > 0).firstOrNull,
      holiday: holidays[d],
    );
  }

  @override
  Future<List<TeacherClass>> classes() async => teacherClasses;

  /// The teacher's class and subject pairs (GET /v1/teacher/classes).
  late List<TeacherClass> teacherClasses = [TeacherClass(section, subject)];

  @override
  Future<List<Student>> roster(String sectionId) async => students;

  @override
  Future<List<AnswerCard>> answerCards(String sectionId) async => [
    for (final (i, s) in students.indexed) AnswerCard(cardNo: i + 1, rollNo: s.rollNo, fullName: s.fullName),
  ];

  @override
  Future<AttendanceSheet> attendance({required String slotId, required String date}) async =>
      AttendanceSheet(taken: existingMarks.isNotEmpty, records: existingMarks);

  @override
  Future<AttendanceSheet> submitAttendance({
    required String slotId,
    required String date,
    required Map<String, AttendanceStatus> marks,
  }) async {
    submitted = marks;
    return AttendanceSheet(taken: true, records: marks);
  }

  @override
  Future<BoardConnection?> activeSession() async => active;

  @override
  Future<BoardConnection> claimBoard({String? code, String? qr}) async {
    calls.add('claim $code');
    if (code != validCode) throw ApiException(404, 'This code is invalid or has expired. Use the new code on the board.');
    return active = BoardConnection(
      sessionId: 'sess1',
      boardName: 'Room 204 Board',
      boardId: 'board1',
      sectionName: section.name,
      subjectName: subject.name,
      startsAt: ClockTime.parse('10:00:00'),
      endsAt: ClockTime.parse('10:55:00'),
    );
  }

  @override
  Future<void> endSession(String sessionId) async {
    calls.add('end $sessionId');
    active = null;
  }

  List<Homework> homework = [];

  @override
  Future<List<Homework>> myHomework() async => homework;

  @override
  Future<Homework> createHomework({
    required String sectionId,
    required String subjectId,
    required String title,
    required String instructions,
    required String dueOn,
  }) async {
    calls.add('createHomework $sectionId $subjectId $title');
    return Homework(id: 'h1', title: title, instructions: instructions, dueOn: parseIsoDate(dueOn), section: section, subject: subject);
  }

  static Map<String, dynamic> recordingJson(
    String id,
    String title, {
    bool shared = false,
    bool finished = true,
    String transcriptState = 'none',
    bool hasAudio = true,
    String? sectionId = 'sec1',
    bool keep = false,
    DateTime? expiresOn,
  }) => {
    'id': id,
    'title': title,
    'startedAt': '2026-10-04T04:32:00Z',
    'durationMs': 24 * 60000,
    'hasAudio': hasAudio,
    'sectionId': sectionId,
    'sectionName': sectionId == null ? null : 'BCom Sem 3 A',
    'subjectName': sectionId == null ? null : 'Corporate Accounting',
    'teacherName': 'Anita Sharma',
    'transcriptState': transcriptState,
    'summaryState': 'none',
    'sharedAt': shared ? '2026-10-04T05:30:00Z' : null,
    'finishedAt': finished ? '2026-10-04T05:29:00Z' : null,
    'keep': keep,
    'expiresOn': expiresOn == null ? null : isoDate(expiresOn),
  };

  /// Today plus [days], for retention dates (the app compares them with the phone's date).
  static DateTime inDays(int days) {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day + days);
  }

  /// r1 is deleted in 5 days with its term; r2 is kept (it would go in 60 days).
  late List<Map<String, dynamic>> recordings = [
    recordingJson('r1', 'Issue of shares', transcriptState: 'queued', expiresOn: inDays(5)),
    recordingJson('r2', 'Forfeiture of shares', shared: true, transcriptState: 'done', keep: true),
    recordingJson('r3', 'Cost sheets', finished: false),
    recordingJson('r4', 'Practice on the board', sectionId: null, hasAudio: false),
  ];

  /// Set to make sharing fail with this message.
  String? shareError;

  /// When each recording's term ends it (expiresOn when not kept); null: no term.
  late Map<String, DateTime?> termExpiry = {'r1': inDays(5), 'r2': inDays(60)};

  /// Set to make keeping fail with this error.
  ApiException? keepError;

  /// When set, keeping waits for it (to see the optimistic state).
  Completer<void>? keepGate;

  @override
  Future<RecordingInfo> keepRecording(String id, {required bool keep}) async {
    calls.add('keep $id $keep');
    if (keepGate != null) await keepGate!.future;
    if (keepError != null) throw keepError!;
    final j = recordings.firstWhere((r) => r['id'] == id);
    final expires = termExpiry[id];
    j['keep'] = keep;
    j['expiresOn'] = keep || expires == null ? null : isoDate(expires);
    return RecordingInfo.fromJson(j);
  }

  @override
  Future<List<RecordingInfo>> myRecordings() async {
    calls.add('recordings');
    return recordings.map(RecordingInfo.fromJson).toList();
  }

  @override
  Future<RecordingInfo> recording(String id) async {
    calls.add('recording $id');
    final j = recordings.where((r) => r['id'] == id).firstOrNull;
    if (j == null) throw ApiException(404, 'Recording not found');
    return RecordingInfo.fromJson({...j, 'transcript': null, 'summary': null});
  }

  @override
  Future<Lesson> recordingLesson(String id) async {
    calls.add('lesson $id');
    return Lesson.fromJson({
      'v': 1,
      'canvas': {'w': 1920, 'h': 1080},
      'durationMs': 20000,
      'events': [
        [
          0,
          'L',
          [<Object>[]],
          0,
        ],
      ],
    });
  }

  @override
  Future<RecordingInfo> shareRecording(String id) async {
    calls.add('share $id');
    if (shareError != null) throw ApiException(403, shareError!);
    final j = recordings.firstWhere((r) => r['id'] == id);
    j['sharedAt'] = '2026-10-04T06:00:00Z';
    return RecordingInfo.fromJson(j);
  }

  // --- Marks -----------------------------------------------------------------------------------

  /// Saved assessments by id; marks by student id.
  final assessmentRows = <String, Map<String, dynamic>>{};
  final savedMarks = <String, Map<String, MarkInput>>{};
  List<MarkInput>? lastSaved;
  int _ids = 0;

  /// Adds a saved assessment for tests.
  String addAssessment({String title = 'Unit test 1', double maxMarks = 25, bool published = false, Map<String, MarkInput>? marks}) {
    final id = 'a${++_ids}';
    assessmentRows[id] = {
      'id': id,
      'title': title,
      'kind': 'test',
      'maxMarks': maxMarks,
      'heldOn': '2026-09-28',
      'publishedAt': published ? '2026-10-01T10:00:00Z' : null,
      'sectionId': section.id,
      'subject': {'id': subject.id, 'name': subject.name},
      'createdBy': 'Anita Sharma',
    };
    savedMarks[id] = {...?marks};
    return id;
  }

  Assessment _detail(String id) {
    final row = assessmentRows[id];
    if (row == null) throw ApiException(404, 'Assessment not found');
    final m = savedMarks[id]!;
    final values = [
      for (final e in m.values)
        if (!e.absent && e.marks != null) e.marks!,
    ];
    return Assessment.fromJson({
      ...row,
      'entered': m.length,
      'classSize': students.length,
      'average': values.isEmpty ? null : (values.reduce((a, b) => a + b) / values.length * 10).round() / 10,
      'stats': {
        'count': values.length,
        'average': values.isEmpty ? null : (values.reduce((a, b) => a + b) / values.length * 10).round() / 10,
        'highest': values.isEmpty ? null : values.reduce((a, b) => a > b ? a : b),
        'lowest': values.isEmpty ? null : values.reduce((a, b) => a < b ? a : b),
      },
      'students': [
        for (final st in students)
          {
            'id': st.id,
            'fullName': st.fullName,
            'rollNo': st.rollNo,
            'marks': m[st.id]?.absent ?? false ? null : m[st.id]?.marks,
            'absent': m[st.id]?.absent ?? false,
            'remark': m[st.id]?.remark,
          },
      ],
    });
  }

  @override
  Future<List<Assessment>> assessments(String sectionId) async {
    calls.add('assessments $sectionId');
    return [for (final r in assessmentRows.values.toList().reversed) _summary(r['id'] as String)];
  }

  /// What the list returns: no roster or stats, but the class size and average.
  Assessment _summary(String id) {
    final d = _detail(id);
    return Assessment.fromJson({...assessmentRows[id]!, 'entered': d.entered, 'classSize': d.classSize, 'average': d.average});
  }

  @override
  Future<Assessment> assessment(String id) async {
    calls.add('assessment $id');
    return _detail(id);
  }

  @override
  Future<Assessment> createAssessment({
    required String sectionId,
    required String subjectId,
    required String title,
    required AssessmentKind kind,
    required double maxMarks,
    required String heldOn,
  }) async {
    calls.add('createAssessment $title ${kind.name} ${formatMarks(maxMarks)} $heldOn');
    final id = addAssessment(title: title, maxMarks: maxMarks);
    assessmentRows[id]!
      ..['kind'] = kind.name
      ..['heldOn'] = heldOn;
    return _detail(id);
  }

  @override
  Future<Assessment> saveMarks(String assessmentId, List<MarkInput> entries) async {
    calls.add('saveMarks $assessmentId');
    lastSaved = entries;
    final max = assessmentRows[assessmentId]!['maxMarks'] as double;
    for (final e in entries) {
      if ((e.marks ?? 0) > max) throw ApiException(400, 'Marks cannot be more than ${formatMarks(max)}');
      savedMarks[assessmentId]![e.studentId] = e;
    }
    return _detail(assessmentId);
  }

  @override
  Future<Assessment> publishAssessment(String id) async {
    calls.add('publish $id');
    if (savedMarks[id]!.isEmpty) throw ApiException(400, 'Enter marks before publishing');
    assessmentRows[id]!['publishedAt'] = '2026-10-04T06:00:00Z';
    return _detail(id);
  }

  // --- Messages --------------------------------------------------------------------------------

  static const rajesh = Ref('g1', 'Rajesh Patel');

  late List<Conversation> threads = [
    Conversation(
      id: 'c1',
      student: const Ref('s1', 'Aarav Patel'),
      className: 'BCom Sem 3 A',
      staff: const Ref('u1', 'Anita Sharma'),
      family: rajesh,
      lastMessageAt: DateTime(2026, 10, 4, 9, 15),
      lastMessage: 'Thank you, he will finish it tonight.',
      unread: 2,
    ),
    Conversation(
      id: 'c2',
      student: const Ref('s2', 'Ananya Gowda'),
      className: 'BCom Sem 3 A',
      staff: const Ref('u1', 'Anita Sharma'),
      family: const Ref('g2', 'Sunita Gowda'),
      lastMessageAt: DateTime(2026, 9, 30, 18, 2),
      lastMessage: 'Noted, ma’am.',
    ),
  ];

  /// Messages per thread, oldest first.
  late Map<String, List<ChatMessage>> chat = {
    'c1': [
      ChatMessage(id: 'm1', senderId: 'g1', body: 'Aarav had fever on Tuesday. What was covered?', createdAt: DateTime(2026, 10, 3, 9)),
      ChatMessage(id: 'm2', senderId: 'u1', body: 'Hope he is better. Please try Exercise 4.2.', createdAt: DateTime(2026, 10, 3, 15)),
      ChatMessage(id: 'm3', senderId: 'g1', body: 'Thank you, he will finish it tonight.', createdAt: DateTime(2026, 10, 4, 9, 15)),
    ],
    'c2': [ChatMessage(id: 'm4', senderId: 'g2', body: 'Noted, ma’am.', createdAt: DateTime(2026, 9, 30, 18, 2))],
  };

  int conversationLoads = 0;

  /// Set to make sending fail.
  bool sendFails = false;

  @override
  Future<List<Conversation>> conversations() async {
    // Not logged in [calls]: the shell loads it at sign-in for the Messages badge.
    conversationLoads++;
    return threads;
  }

  @override
  Future<ChatPage> conversationMessages(String id, {DateTime? before}) async {
    calls.add('messages $id${before == null ? '' : ' before'}');
    final all = [
      for (final m in chat[id]!)
        if (before == null || m.createdAt.isBefore(before)) m,
    ];
    final page = all.length > ChatPage.pageSize ? all.sublist(all.length - ChatPage.pageSize) : all;
    return ChatPage(threads.firstWhere((t) => t.id == id), page);
  }

  @override
  Future<ChatMessage> sendMessage(String conversationId, String body) async {
    calls.add('send $conversationId $body');
    if (sendFails) throw ApiException(0, "Can't reach KINETIX.");
    final m = ChatMessage(
      id: 'm${chat[conversationId]!.length + 100}',
      senderId: profile.id,
      body: body,
      createdAt: DateTime(2026, 10, 4, 12),
    );
    chat[conversationId]!.add(m);
    return m;
  }

  @override
  Future<void> markConversationRead(String id) async {
    calls.add('read $id');
    threads = [for (final t in threads) t.id == id ? t.copyWith(unread: 0) : t];
  }

  /// Students of the class with their guardians; Bhavya has none on record.
  late List<StudentContacts> contacts = [
    StudentContacts(
      student: students[0],
      className: section.name,
      guardians: const [Guardian(id: 'g1', fullName: 'Rajesh Patel', relation: 'father')],
    ),
    StudentContacts(
      student: students[1],
      className: section.name,
      guardians: const [
        Guardian(id: 'g2', fullName: 'Sunita Gowda', relation: 'mother'),
        Guardian(id: 'g3', fullName: 'Mahesh Gowda', relation: 'father'),
      ],
    ),
    StudentContacts(student: students[2], className: section.name, guardians: const []),
  ];

  @override
  Future<List<StudentContacts>> familyContacts({String? sectionId}) async {
    calls.add('contacts');
    return contacts;
  }

  @override
  Future<Conversation> startConversation({required String studentId, required String guardianId}) async {
    calls.add('start $studentId $guardianId');
    final existing = threads.where((t) => t.student.id == studentId && t.family.id == guardianId).firstOrNull;
    if (existing != null) return existing;
    final s = contacts.firstWhere((c) => c.student.id == studentId);
    final g = s.guardians.firstWhere((g) => g.id == guardianId);
    final c = Conversation(
      id: 'c${threads.length + 1}',
      student: Ref(studentId, s.student.fullName),
      className: s.className,
      staff: Ref(profile.id, profile.fullName),
      family: Ref(g.id, g.fullName),
    );
    threads = [...threads, c];
    chat[c.id] = [];
    return c;
  }

  // --- Driver mode ---------------------------------------------------------------------------

  DriverHome driverData = DriverHome.fromJson({
    'routes': [
      {
        'id': 'r1',
        'name': 'Route 4 · Indiranagar',
        'regNo': 'KA01AB1234',
        'stops': [
          {'id': 's1', 'name': '100 Feet Road', 'seq': 1, 'lat': 12.96, 'lng': 77.63, 'pickupTime': '07:15'},
          {'id': 's2', 'name': 'Defence Colony', 'seq': 2, 'lat': 12.97, 'lng': 77.64, 'pickupTime': '07:30'},
          {'id': 's3', 'name': 'College gate', 'seq': 3, 'lat': 12.98, 'lng': 77.65, 'pickupTime': '07:50'},
        ],
      },
    ],
    'trip': null,
  });

  /// Positions the app has sent: (tripId, lat, lng, speedKmh).
  final positions = <(String, double, double, double?)>[];

  /// Set to make [sendPosition] fail.
  ApiException? positionError;

  @override
  Future<DriverHome> driverHome() async {
    calls.add('driver home');
    return driverData;
  }

  @override
  Future<DriverTrip> startTrip({required String routeId, required TripDirection direction}) async {
    calls.add('start trip $routeId ${direction.name}');
    return DriverTrip(id: 'trip1', routeId: routeId, direction: direction);
  }

  @override
  Future<void> sendPosition(String tripId, {required double lat, required double lng, double? speedKmh}) async {
    if (positionError != null) throw positionError!;
    positions.add((tripId, lat, lng, speedKmh));
  }

  @override
  Future<void> endTrip(String tripId) async => calls.add('end trip $tripId');

  // --- Calendar --------------------------------------------------------------------------------

  List<CalendarEvent> calendarEvents = [
    CalendarEvent(
      id: 'e1',
      kind: CalendarKind.holiday,
      title: 'Gandhi Jayanti',
      startsOn: DateTime(2026, 10, 2),
      endsOn: DateTime(2026, 10, 2),
    ),
    CalendarEvent(
      id: 'e2',
      kind: CalendarKind.exam,
      title: 'Mid-semester exams',
      startsOn: DateTime(2026, 10, 12),
      endsOn: DateTime(2026, 10, 16),
      programs: const ['BCom', 'BBA'],
    ),
    CalendarEvent(
      id: 'e3',
      kind: CalendarKind.holiday,
      title: 'Deepavali',
      startsOn: DateTime(2026, 11, 8),
      endsOn: DateTime(2026, 11, 10),
    ),
    CalendarEvent(
      id: 'e4',
      kind: CalendarKind.event,
      title: 'Annual sports day',
      startsOn: DateTime(2026, 12, 4),
      endsOn: DateTime(2026, 12, 4),
    ),
  ];

  @override
  Future<List<CalendarEvent>> calendar({String? from, String? to}) async {
    calls.add('calendar');
    return calendarEvents;
  }

  // --- HR: leave, check-in, payslips ------------------------------------------------------------

  List<LeaveTypeInfo> leaveTypeList = const [
    LeaveTypeInfo(id: 'lt-cl', code: 'CL', name: 'Casual leave', paid: true),
    LeaveTypeInfo(id: 'lt-lop', code: 'LOP', name: 'Leave without pay', paid: false),
  ];
  List<LeaveBalanceInfo> leaveBalanceList = const [
    LeaveBalanceInfo(type: LeaveTypeInfo(id: 'lt-cl', code: 'CL', name: 'Casual leave', paid: true), opening: 0, accrued: 7, used: 2, pending: 1, available: 4),
  ];
  List<LeaveRequestInfo> myLeaves = [];
  List<LeaveRequestInfo> pendingLeaves = [];
  AttendanceDayInfo? todayMark;
  List<PayslipInfo> payslipList = [];
  int _leaveSeq = 0;

  @override
  Future<List<LeaveTypeInfo>> leaveTypes() async => leaveTypeList;
  @override
  Future<List<LeaveBalanceInfo>> leaveBalances() async => leaveBalanceList;
  @override
  Future<List<LeaveRequestInfo>> myLeaveRequests() async => List.of(myLeaves);
  @override
  Future<List<LeaveRequestInfo>> pendingLeaveRequests() async => List.of(pendingLeaves);

  @override
  Future<LeaveRequestInfo> applyLeave({required String leaveTypeId, required String fromDate, required String toDate, required bool halfDay, required String reason}) async {
    calls.add('applyLeave $leaveTypeId $fromDate $toDate ${halfDay ? 'half' : 'full'} $reason');
    final r = LeaveRequestInfo(
      id: 'lr${++_leaveSeq}',
      userId: 'me',
      userName: profile.fullName,
      type: leaveTypeList.firstWhere((t) => t.id == leaveTypeId),
      fromDate: parseDay(fromDate),
      toDate: parseDay(toDate),
      halfDay: halfDay,
      days: leaveDays(parseDay(fromDate), parseDay(toDate), halfDay: halfDay),
      reason: reason,
      status: LeaveStatus.pending,
    );
    myLeaves = [r, ...myLeaves];
    return r;
  }

  LeaveRequestInfo _withStatus(LeaveRequestInfo r, LeaveStatus s, [String? note]) => LeaveRequestInfo(
    id: r.id, userId: r.userId, userName: r.userName, type: r.type, fromDate: r.fromDate, toDate: r.toDate, halfDay: r.halfDay, days: r.days, reason: r.reason, status: s, decisionNote: note,
  );

  @override
  Future<LeaveRequestInfo> cancelLeave(String id) async {
    calls.add('cancelLeave $id');
    final r = _withStatus(myLeaves.firstWhere((x) => x.id == id), LeaveStatus.cancelled);
    myLeaves = [for (final x in myLeaves) x.id == id ? r : x];
    return r;
  }

  @override
  Future<LeaveRequestInfo> decideLeave(String id, {required bool approve, String? note}) async {
    calls.add('decideLeave $id ${approve ? 'approve' : 'reject'} ${note ?? '-'}');
    final r = _withStatus(pendingLeaves.firstWhere((x) => x.id == id), approve ? LeaveStatus.approved : LeaveStatus.rejected, note);
    pendingLeaves = pendingLeaves.where((x) => x.id != id).toList();
    return r;
  }

  @override
  Future<MyAttendance> myAttendance({String? month}) async {
    final t = todayMark;
    return MyAttendance(today: t, month: month ?? '2026-10', days: [?t]);
  }

  @override
  Future<AttendanceDayInfo> checkIn() async {
    calls.add('checkIn');
    return todayMark ??= AttendanceDayInfo(date: '2026-10-20', status: 'present', checkInAt: DateTime(2026, 10, 20, 9, 5));
  }

  @override
  Future<AttendanceDayInfo> checkOut() async {
    calls.add('checkOut');
    final t = todayMark!;
    return todayMark = AttendanceDayInfo(date: t.date, status: t.status, checkInAt: t.checkInAt, checkOutAt: DateTime(2026, 10, 20, 17, 30));
  }

  @override
  Future<List<PayslipInfo>> myPayslips() async => payslipList;

  @override
  Future<Uint8List> payslipPdf(String id) async {
    calls.add('payslipPdf $id');
    return Uint8List.fromList('%PDF-1.4'.codeUnits);
  }

  // --- Syllabus coverage -----------------------------------------------------------------------

  Syllabus? syllabusOutline = const Syllabus(
    title: 'Corporate Accounting, BCom Semester 3',
    chapters: [
      SyllabusChapter(
        id: 'ch1',
        title: 'Valuation of Goodwill',
        topics: [
          SyllabusTopic(id: 't1', title: 'Meaning and need for valuation of goodwill'),
          SyllabusTopic(id: 't2', title: 'Methods: average profit, super profit and capitalisation'),
        ],
      ),
      SyllabusChapter(
        id: 'ch2',
        title: 'Valuation of Shares',
        topics: [SyllabusTopic(id: 't3', title: 'Intrinsic value and yield methods')],
      ),
    ],
  );

  /// Taught topics of the class.
  Map<String, TopicCoverage> covered = {'t1': TopicCoverage(coveredOn: DateTime(2026, 9, 28), coveredBy: 'Anita Sharma')};

  /// Set to make marking fail with this error.
  ApiException? markError;

  @override
  Future<Syllabus?> syllabus(String subjectId) async {
    calls.add('syllabus $subjectId');
    return syllabusOutline;
  }

  @override
  Future<Coverage> coverage({required String sectionId, required String subjectId}) async {
    calls.add('coverage $sectionId $subjectId');
    final total = syllabusOutline?.chapters.fold<int>(0, (n, c) => n + c.topics.length) ?? 0;
    return Coverage(total: total, topics: {...covered});
  }

  @override
  Future<void> markTopic({required String sectionId, required String subjectId, required String topicId, String? coveredOn}) async {
    calls.add('mark $sectionId $subjectId $topicId ${coveredOn ?? 'today'}');
    if (markError != null) throw markError!;
    covered[topicId] = TopicCoverage(
      coveredOn: coveredOn == null ? parseIsoDate(today) : parseIsoDate(coveredOn),
      coveredBy: profile.fullName,
    );
  }

  @override
  Future<void> unmarkTopic({required String sectionId, required String subjectId, required String topicId}) async {
    calls.add('unmark $topicId');
    if (markError != null) throw markError!;
    covered.remove(topicId);
  }

  /// The teacher's own videos by topic id.
  Map<String, List<TopicVideo>> topicVideoList = {};
  Object? topicVideoError;

  @override
  Future<List<TopicVideo>> topicVideos(String topicId) async {
    calls.add('topicVideos $topicId');
    return [...?topicVideoList[topicId]];
  }

  @override
  Future<TopicVideo> addTopicVideo({required String topicId, required String url, required String sectionId}) async {
    calls.add('addTopicVideo $topicId $sectionId $url');
    if (topicVideoError != null) throw topicVideoError!;
    final v = TopicVideo(id: 'tv${(topicVideoList[topicId]?.length ?? 0) + 1}', youtubeVideoId: 'abcdefghij1', title: 'Title from YouTube', sections: const ['BCom Sem 3 A']);
    topicVideoList = {...topicVideoList, topicId: [...?topicVideoList[topicId], v]};
    return v;
  }

  @override
  Future<TopicVideo> shareTopicVideo(String videoId) async {
    calls.add('shareTopicVideo $videoId');
    late TopicVideo updated;
    topicVideoList = {
      for (final e in topicVideoList.entries)
        e.key: [
          for (final v in e.value)
            if (v.id == videoId) updated = TopicVideo(id: v.id, youtubeVideoId: v.youtubeVideoId, title: v.title, shareStatus: 'pending', sections: v.sections) else v,
        ],
    };
    return updated;
  }

  @override
  Future<void> removeTopicVideo(String videoId) async {
    calls.add('removeTopicVideo $videoId');
    topicVideoList = {for (final e in topicVideoList.entries) e.key: [for (final v in e.value) if (v.id != videoId) v]};
  }

  // --- Profile, photos and badges ---------------------------------------------------------------

  /// Uploaded photos by API path (demo mode shows them from memory).
  final photos = <String, Uint8List>{};
  final badgesAwarded = <String>[];

  /// When set, saving the profile fails with this error.
  ApiException? profileError;

  @override
  Future<Me> updateProfile({required String fullName, required String? email, List<String>? teachingSubjects}) async {
    calls.add('profile $fullName ${email ?? '-'} ${teachingSubjects?.join(',') ?? ''}'.trim());
    if (profileError != null) throw profileError!;
    return profile = Me(
      id: profile.id,
      fullName: fullName,
      roles: profile.roles,
      preferredLanguage: profile.preferredLanguage,
      institution: profile.institution,
      email: email,
      phone: profile.phone,
      photoUrl: profile.photoUrl,
      teachingSubjects: teachingSubjects ?? profile.teachingSubjects,
    );
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
  Future<void> awardBadge({required String studentId, required String sectionId, required String badge, String? subjectId}) async {
    calls.add('badge $studentId $sectionId $badge');
    badgesAwarded.add('$studentId:$badge');
  }

  @override
  Future<int> remindMissing(String homeworkId) async {
    final n = handedIn.where((s) => s.status == null).length;
    calls.add('remind $homeworkId $n');
    return n;
  }

  // --- Homework submissions --------------------------------------------------------------------

  late List<Submission> handedIn = [
    Submission(
      studentId: 's1',
      fullName: 'Aarav Patel',
      rollNo: 'U03BC001',
      status: SubmissionStatus.submitted,
      submittedAt: DateTime(2026, 10, 4, 19, 30),
      text: 'Q1. Goodwill = Average profit × 3 = ₹1,20,000.',
      files: const [
        SubmissionFile(index: 0, name: 'page1.jpg', mime: 'image/jpeg', bytes: 120000),
        SubmissionFile(index: 1, name: 'page2.png', mime: 'image/png', bytes: 90000),
        SubmissionFile(index: 2, name: 'workings.pdf', mime: 'application/pdf', bytes: 300000),
      ],
    ),
    Submission(
      studentId: 's2',
      fullName: 'Ananya Gowda',
      rollNo: 'U03BC002',
      status: SubmissionStatus.checked,
      submittedAt: DateTime(2026, 10, 6, 8),
      text: 'Done.',
      late: true,
      remark: 'Neat working',
    ),
    Submission(studentId: 's3', fullName: 'Bhavya Reddy', rollNo: 'U03BC003'),
  ];

  /// Set to make reviewing fail with this error.
  ApiException? reviewError;

  @override
  Future<SubmissionList> submissions(String homeworkId) async {
    calls.add('submissions $homeworkId');
    return SubmissionList(counts: SubmissionCounts.of(handedIn), students: [...handedIn]);
  }

  @override
  Future<Uint8List> submissionFile(String homeworkId, String studentId, int index) async {
    calls.add('file $studentId $index');
    return index == 2 ? Uint8List.fromList(utf8.encode('%PDF-1.4')) : onePixelPng;
  }

  @override
  Future<Submission> reviewSubmission(String homeworkId, Submission submission, {required SubmissionStatus status, String? remark}) async {
    calls.add('review ${submission.studentId} ${status.name} ${remark ?? ''}'.trim());
    if (reviewError != null) throw reviewError!;
    final done = submission.reviewed({
      'status': status.name,
      'text': submission.text,
      'files': [
        for (final f in submission.files) {'index': f.index, 'name': f.name, 'mime': f.mime, 'bytes': f.bytes},
      ],
      'submittedAt': submission.submittedAt?.toUtc().toIso8601String(),
      'late': submission.late,
      'remark': remark == null || remark.isEmpty ? null : remark,
    });
    handedIn = [for (final x in handedIn) x.studentId == done.studentId ? done : x];
    return done;
  }

  // --- Year plans and lesson plans -------------------------------------------------------------

  /// The class's year plan; null until one is made.
  YearPlan? plan;

  /// Set to make generating the plan fail with this error.
  ApiException? planError;

  /// A plan as the server builds it for [today]: last week t1 (taught) and t2 (late), this week t3.
  YearPlan samplePlan() {
    // The institution's week, which can differ from the phone's date.
    final week = mondayOf(parseIsoDate(today));
    final last = week.subtract(const Duration(days: 7));
    return YearPlan.fromJson({
      'id': 'yp1',
      'startsOn': isoDate(last),
      'endsOn': isoDate(week.add(const Duration(days: 7 * 15 - 1))),
      'today': today,
      'thisWeek': isoDate(week),
      'progress': {'total': 3, 'covered': 1, 'expected': 2, 'dueThisWeek': 1, 'behindBy': 1, 'status': 'behind'},
      'items': [
        {'topicId': 't1', 'title': 'Meaning and need for valuation of goodwill', 'chapter': 'Valuation of Goodwill', 'weekOf': isoDate(last), 'periods': 1, 'coveredOn': '2026-09-28', 'late': false},
        {'topicId': 't2', 'title': 'Methods: average profit, super profit and capitalisation', 'chapter': 'Valuation of Goodwill', 'weekOf': isoDate(last), 'periods': 2, 'coveredOn': null, 'late': true},
        {'topicId': 't3', 'title': 'Intrinsic value and yield methods', 'chapter': 'Valuation of Shares', 'weekOf': isoDate(week), 'periods': 1, 'coveredOn': null, 'late': false},
      ],
    });
  }

  @override
  Future<YearPlan?> yearPlan({required String sectionId, required String subjectId}) async {
    calls.add('yearPlan $sectionId $subjectId');
    return plan;
  }

  @override
  Future<YearPlan> generateYearPlan({required String sectionId, required String subjectId, String? startsOn, String? endsOn}) async {
    calls.add('generate $sectionId $subjectId ${startsOn ?? '-'} ${endsOn ?? '-'}');
    if (planError != null) throw planError!;
    return plan = samplePlan();
  }

  @override
  Future<YearPlan> moveYearPlanItem(String planId, {required String topicId, required String weekOf, required int periods}) async {
    calls.add('move $planId $topicId $weekOf $periods');
    final p = plan!;
    final items = [
      for (final i in p.items)
        i.topicId == topicId
            ? YearPlanItem(
                topicId: i.topicId,
                title: i.title,
                chapter: i.chapter,
                weekOf: mondayOf(parseIsoDate(weekOf)),
                periods: periods,
                coveredOn: i.coveredOn,
              )
            : i,
    ]..sort((a, b) => a.weekOf.compareTo(b.weekOf));
    return plan = YearPlan(id: p.id, startsOn: p.startsOn, endsOn: p.endsOn, progress: p.progress, items: items, thisWeek: p.thisWeek);
  }

  /// Saved lesson plans by "slotId date", as the server returns them.
  final lessonPlans = <String, Map<String, dynamic>>{};
  List<String> suggestedTopicIds = ['t3'];
  Map<String, dynamic>? lastSavedPlan;

  /// The draft KINETIX AI returns (a preview, as from a server without an AI model).
  LessonDraft draft = const LessonDraft(
    topicIds: ['t3'],
    preview: true,
    content: LessonContent(
      objectives: ['Value shares by the intrinsic value method'],
      steps: [LessonStep(minutes: 10, activity: 'Recap goodwill'), LessonStep(minutes: 30, activity: 'Worked example on the board')],
      materials: ['Textbook'],
      assessment: 'Two quick questions',
    ),
  );

  PeriodPlan _periodPlan(String slotId, String date) => PeriodPlan.fromJson({
    'date': date,
    'plan': lessonPlans['$slotId $date'],
    'suggestedTopicIds': suggestedTopicIds,
  });

  @override
  Future<PeriodPlan> periodPlan({required String slotId, required String date}) async {
    calls.add('periodPlan $slotId $date');
    return _periodPlan(slotId, date);
  }

  @override
  Future<PeriodPlan> saveLessonPlan({
    required String slotId,
    required String date,
    required List<String> topicIds,
    required LessonContent content,
    required bool aiDrafted,
  }) async {
    calls.add('saveLessonPlan $slotId $date');
    final titles = {for (final c in syllabusOutline?.chapters ?? const <SyllabusChapter>[]) for (final t in c.topics) t.id: t.title};
    lessonPlans['$slotId $date'] = lastSavedPlan = {
      'id': 'lp1',
      'date': date,
      'topicIds': topicIds,
      'topics': [
        for (final id in topicIds) {'id': id, 'title': titles[id] ?? ''},
      ],
      'content': content.toJson(),
      'aiDrafted': aiDrafted,
      'teacher': profile.fullName,
      'reviewedAt': null,
      'reviewedBy': null,
      'reviewRemark': null,
    };
    return _periodPlan(slotId, date);
  }

  @override
  Future<LessonDraft> draftLessonPlan({required String slotId, required String date, List<String>? topicIds, String? language}) async {
    calls.add('draft $slotId $date ${topicIds?.join(',') ?? '-'} ${language ?? '-'}');
    return draft;
  }
}
