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
}
