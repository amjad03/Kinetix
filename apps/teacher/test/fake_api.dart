import 'package:kinetix_lesson/kinetix_lesson.dart';
import 'package:kinetix_teacher/core/api.dart';
import 'package:kinetix_teacher/core/models.dart';

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
    preferredLanguage: 'hi',
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

  @override
  Future<Me> me() async => profile;

  @override
  Future<DayTimetable> timetable({String? date}) async {
    final d = date ?? today;
    final sorted = periodsByDate.keys.toList()..sort();
    return DayTimetable(
      date: d,
      today: today,
      periods: periodsByDate[d] ?? [],
      nextTeachingDate: sorted.where((k) => k.compareTo(d) > 0).firstOrNull,
    );
  }

  @override
  Future<List<TeacherClass>> classes() async => [TeacherClass(section, subject)];

  @override
  Future<List<Student>> roster(String sectionId) async => students;

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

  @override
  Future<List<Homework>> myHomework() async => [];

  @override
  Future<Homework> createHomework({
    required String sectionId,
    required String subjectId,
    required String title,
    required String instructions,
    required String dueOn,
  }) async => Homework(id: 'h1', title: title, instructions: instructions, dueOn: parseIsoDate(dueOn), section: section, subject: subject);

  static Map<String, dynamic> recordingJson(
    String id,
    String title, {
    bool shared = false,
    bool finished = true,
    String transcriptState = 'none',
    bool hasAudio = true,
    String? sectionId = 'sec1',
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
  };

  late List<Map<String, dynamic>> recordings = [
    recordingJson('r1', 'Issue of shares', transcriptState: 'queued'),
    recordingJson('r2', 'Forfeiture of shares', shared: true, transcriptState: 'done'),
    recordingJson('r3', 'Cost sheets', finished: false),
    recordingJson('r4', 'Practice on the board', sectionId: null, hasAudio: false),
  ];

  /// Set to make sharing fail with this message.
  String? shareError;

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
}
