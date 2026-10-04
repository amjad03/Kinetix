/// Mirrors the Teacher App DTOs in packages/shared/src/index.ts.
library;

/// "10:00:00" → minutes since midnight.
int _minutes(String hhmmss) {
  final p = hhmmss.split(':');
  return int.parse(p[0]) * 60 + int.parse(p[1]);
}

/// A wall-clock time from the timetable (local to the institution).
class ClockTime implements Comparable<ClockTime> {
  const ClockTime(this.minutes);
  factory ClockTime.parse(String hhmmss) => ClockTime(_minutes(hhmmss));

  final int minutes;

  /// "10:00 AM"
  String get label {
    final h = minutes ~/ 60, m = minutes % 60;
    final h12 = h % 12 == 0 ? 12 : h % 12;
    return '$h12:${m.toString().padLeft(2, '0')} ${h < 12 ? 'AM' : 'PM'}';
  }

  @override
  int compareTo(ClockTime other) => minutes.compareTo(other.minutes);
}

/// A calendar date without a time zone ("2026-10-05").
String isoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

DateTime parseIsoDate(String s) {
  final p = s.split('-').map(int.parse).toList();
  return DateTime(p[0], p[1], p[2]);
}

class Me {
  Me({
    required this.id,
    required this.fullName,
    required this.roles,
    required this.preferredLanguage,
    required this.institution,
    this.email,
    this.phone,
  });

  factory Me.fromJson(Map<String, dynamic> j) => Me(
    id: j['id'] as String,
    fullName: j['fullName'] as String,
    email: j['email'] as String?,
    phone: j['phone'] as String?,
    preferredLanguage: j['preferredLanguage'] as String,
    roles: (j['roles'] as List).cast<String>(),
    institution: (j['tenant'] as Map)['name'] as String,
  );

  final String id;
  final String fullName;
  final String? email;
  final String? phone;
  final String preferredLanguage;
  final List<String> roles;
  final String institution;

  String get firstName {
    final parts = fullName.split(' ').where((p) => p.isNotEmpty && !p.endsWith('.')).toList();
    return parts.isEmpty ? fullName : parts.first;
  }

  static const languageNames = {'en': 'English', 'hi': 'हिन्दी (Hindi)', 'kn': 'ಕನ್ನಡ (Kannada)'};
  static const roleNames = {
    'tenant_admin': 'Admin',
    'principal': 'Principal',
    'hod': 'Head of department',
    'teacher': 'Teacher',
    'student': 'Student',
    'guardian': 'Parent',
    'librarian': 'Librarian',
    'accountant': 'Accountant',
  };

  String get languageName => languageNames[preferredLanguage] ?? preferredLanguage;
}

class Ref {
  const Ref(this.id, this.name, [this.code]);
  final String id;
  final String name;
  final String? code;

  @override
  bool operator ==(Object other) => other is Ref && other.id == id;
  @override
  int get hashCode => id.hashCode;
}

Ref _section(Map j) => Ref(j['id'] as String, j['displayName'] as String);
Ref _subject(Map j) => Ref(j['id'] as String, j['name'] as String, j['code'] as String?);

class Period {
  Period({
    required this.slotId,
    required this.startsAt,
    required this.endsAt,
    required this.section,
    required this.subject,
    this.room,
    this.isNow = false,
    this.attendanceTaken = false,
  });

  factory Period.fromJson(Map<String, dynamic> j) => Period(
    slotId: j['slotId'] as String,
    startsAt: ClockTime.parse(j['startsAt'] as String),
    endsAt: ClockTime.parse(j['endsAt'] as String),
    section: _section(j['section'] as Map),
    subject: _subject(j['subject'] as Map),
    room: j['room'] == null ? null : Ref((j['room'] as Map)['id'] as String, (j['room'] as Map)['name'] as String),
    isNow: j['isNow'] as bool,
    attendanceTaken: j['attendanceTaken'] as bool,
  );

  final String slotId;
  final ClockTime startsAt;
  final ClockTime endsAt;
  final Ref section;
  final Ref subject;
  final Ref? room;
  final bool isNow;
  bool attendanceTaken;
}

class DayTimetable {
  DayTimetable({required this.date, required this.today, required this.periods, this.nextTeachingDate});

  factory DayTimetable.fromJson(Map<String, dynamic> j) => DayTimetable(
    date: j['date'] as String,
    today: j['today'] as String,
    periods: (j['periods'] as List).map((e) => Period.fromJson(e as Map<String, dynamic>)).toList(),
    nextTeachingDate: j['nextTeachingDate'] as String?,
  );

  final String date;
  final String today;
  final List<Period> periods;
  final String? nextTeachingDate;
}

class TeacherClass {
  TeacherClass(this.section, this.subject);
  factory TeacherClass.fromJson(Map<String, dynamic> j) => TeacherClass(_section(j['section'] as Map), _subject(j['subject'] as Map));
  final Ref section;
  final Ref subject;
}

class Student {
  Student({required this.id, required this.rollNo, required this.fullName});
  factory Student.fromJson(Map<String, dynamic> j) =>
      Student(id: j['id'] as String, rollNo: j['rollNo'] as String, fullName: j['fullName'] as String);
  final String id;
  final String rollNo;
  final String fullName;
}

enum AttendanceStatus {
  present('Present'),
  absent('Absent'),
  late('Late'),
  excused('Excused');

  const AttendanceStatus(this.label);
  final String label;
}

class AttendanceSheet {
  AttendanceSheet({required this.taken, required this.records});

  factory AttendanceSheet.fromJson(Map<String, dynamic> j) => AttendanceSheet(
    taken: j['taken'] as bool,
    records: {
      for (final r in (j['records'] as List).cast<Map<String, dynamic>>())
        r['studentId'] as String: AttendanceStatus.values.byName(r['status'] as String),
    },
  );

  final bool taken;
  final Map<String, AttendanceStatus> records;
}

/// The board session the teacher is running, as returned by a claim or GET /v1/teacher/session.
class BoardConnection {
  BoardConnection({required this.sessionId, required this.boardName, this.sectionName, this.subjectName, this.startsAt, this.endsAt});

  factory BoardConnection.fromJson(Map<String, dynamic> j) {
    final s = j['session'] as Map<String, dynamic>;
    final period = s['period'] as Map<String, dynamic>?;
    return BoardConnection(
      sessionId: s['sessionId'] as String,
      boardName: (j['board'] as Map)['name'] as String,
      sectionName: (s['section'] as Map?)?['displayName'] as String?,
      subjectName: (s['subject'] as Map?)?['name'] as String?,
      startsAt: period == null ? null : ClockTime.parse(period['startsAt'] as String),
      endsAt: period == null ? null : ClockTime.parse(period['endsAt'] as String),
    );
  }

  final String sessionId;
  final String boardName;
  final String? sectionName;
  final String? subjectName;
  final ClockTime? startsAt;
  final ClockTime? endsAt;

  String? get periodLabel => startsAt == null ? null : '${startsAt!.label} – ${endsAt!.label}';
}

class Homework {
  Homework({
    required this.id,
    required this.title,
    required this.instructions,
    required this.dueOn,
    required this.section,
    required this.subject,
  });

  factory Homework.fromJson(Map<String, dynamic> j) => Homework(
    id: j['id'] as String,
    title: j['title'] as String,
    instructions: j['instructions'] as String,
    dueOn: parseIsoDate(j['dueOn'] as String),
    section: _section(j['section'] as Map),
    subject: _subject(j['subject'] as Map),
  );

  final String id;
  final String title;
  final String instructions;
  final DateTime dueOn;
  final Ref section;
  final Ref subject;
}
