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

/// Shown with AppLocalizations.attendanceStatus.
enum AttendanceStatus { present, absent, late, excused }

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

// ---------------------------------------------------------------------------------------------
// Marks

/// "25" for whole numbers, "22.5" otherwise.
String formatMarks(num n) {
  if (n == n.roundToDouble()) return n.toInt().toString();
  return n.toStringAsFixed(2).replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
}

/// Shown with AppLocalizations.assessmentKind.
enum AssessmentKind { test, assignment, internal, exam, practical }

/// Average, highest and lowest of the marks entered (absentees excluded).
class MarkStats {
  const MarkStats({required this.count, this.average, this.highest, this.lowest});

  factory MarkStats.fromJson(Map<String, dynamic> j) => MarkStats(
    count: j['count'] as int,
    average: (j['average'] as num?)?.toDouble(),
    highest: (j['highest'] as num?)?.toDouble(),
    lowest: (j['lowest'] as num?)?.toDouble(),
  );

  final int count;
  final double? average;
  final double? highest;
  final double? lowest;
}

/// One student's row in an assessment.
class MarkEntry {
  MarkEntry({required this.student, this.marks, this.absent = false, this.remark});

  factory MarkEntry.fromJson(Map<String, dynamic> j) => MarkEntry(
    student: Student.fromJson(j),
    marks: (j['marks'] as num?)?.toDouble(),
    absent: j['absent'] as bool? ?? false,
    remark: j['remark'] as String?,
  );

  final Student student;
  final double? marks;
  final bool absent;
  final String? remark;

  bool get hasValue => marks != null || absent || (remark?.isNotEmpty ?? false);
}

/// A test, assignment or exam for one class and subject. [students] and [stats] come with the detail.
class Assessment {
  Assessment({
    required this.id,
    required this.title,
    required this.kind,
    required this.maxMarks,
    required this.heldOn,
    required this.sectionId,
    required this.subject,
    required this.entered,
    this.classSize,
    this.average,
    this.publishedAt,
    this.createdBy,
    this.stats,
    this.students,
  });

  factory Assessment.fromJson(Map<String, dynamic> j) => Assessment(
    id: j['id'] as String,
    title: j['title'] as String,
    kind: AssessmentKind.values.asNameMap()[j['kind']] ?? AssessmentKind.test,
    maxMarks: (j['maxMarks'] as num).toDouble(),
    heldOn: parseIsoDate(j['heldOn'] as String),
    publishedAt: j['publishedAt'] == null ? null : DateTime.parse(j['publishedAt'] as String),
    sectionId: j['sectionId'] as String,
    subject: Ref((j['subject'] as Map)['id'] as String, (j['subject'] as Map)['name'] as String),
    createdBy: j['createdBy'] as String?,
    entered: j['entered'] as int? ?? 0,
    classSize: j['classSize'] as int?,
    average: ((j['average'] ?? (j['stats'] as Map?)?['average']) as num?)?.toDouble(),
    stats: j['stats'] == null ? null : MarkStats.fromJson(j['stats'] as Map<String, dynamic>),
    students: (j['students'] as List?)?.map((e) => MarkEntry.fromJson(e as Map<String, dynamic>)).toList(),
  );

  final String id;
  final String title;
  final AssessmentKind kind;
  final double maxMarks;
  final DateTime heldOn;
  final DateTime? publishedAt;
  final String sectionId;
  final Ref subject;
  final String? createdBy;

  /// Students with a saved row (marks, absent or a remark).
  final int entered;

  /// Active students in the class, and the class average of the marks entered (from the list).
  final int? classSize;
  final double? average;
  final MarkStats? stats;
  final List<MarkEntry>? students;

  bool get isPublished => publishedAt != null;
}

/// What the teacher sends for one student: marks (null when blank or absent), absent, remark.
class MarkInput {
  const MarkInput({required this.studentId, this.marks, this.absent = false, this.remark});

  final String studentId;
  final double? marks;
  final bool absent;
  final String? remark;

  Map<String, dynamic> toJson() => {
    'studentId': studentId,
    'marks': absent ? null : marks,
    'absent': absent,
    if (remark != null) 'remark': remark,
  };
}

// ---------------------------------------------------------------------------------------------
// Messages

/// A thread between this teacher and a family (or an adult student) about one student.
class Conversation {
  Conversation({
    required this.id,
    required this.student,
    required this.className,
    required this.staff,
    required this.family,
    this.lastMessageAt,
    this.lastMessage,
    this.unread = 0,
  });

  factory Conversation.fromJson(Map<String, dynamic> j) {
    Ref ref(Object? m) => Ref((m as Map)['id'] as String, m['fullName'] as String);
    return Conversation(
      id: j['id'] as String,
      student: ref(j['student']),
      className: j['className'] as String,
      staff: ref(j['staff']),
      family: ref(j['family']),
      lastMessageAt: j['lastMessageAt'] == null ? null : DateTime.parse(j['lastMessageAt'] as String).toLocal(),
      lastMessage: j['lastMessage'] as String?,
      unread: j['unread'] as int? ?? 0,
    );
  }

  final String id;
  final Ref student;
  final String className;
  final Ref staff;
  final Ref family;
  final DateTime? lastMessageAt;
  final String? lastMessage;
  final int unread;

  /// At colleges an adult student may write for themselves.
  bool get withStudent => family.name == student.name;

  Conversation copyWith({int? unread, String? lastMessage, DateTime? lastMessageAt}) => Conversation(
    id: id,
    student: student,
    className: className,
    staff: staff,
    family: family,
    lastMessage: lastMessage ?? this.lastMessage,
    lastMessageAt: lastMessageAt ?? this.lastMessageAt,
    unread: unread ?? this.unread,
  );
}

class ChatMessage {
  ChatMessage({required this.id, required this.senderId, required this.body, required this.createdAt});

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
    id: j['id'] as String,
    senderId: j['senderId'] as String,
    body: j['body'] as String,
    createdAt: DateTime.parse(j['createdAt'] as String).toLocal(),
  );

  final String id;
  final String senderId;
  final String body;
  final DateTime createdAt;
}

/// One page of a thread, oldest first.
class ChatPage {
  ChatPage(this.conversation, this.messages);

  factory ChatPage.fromJson(Map<String, dynamic> j) => ChatPage(
    Conversation.fromJson(j['conversation'] as Map<String, dynamic>),
    (j['messages'] as List).map((e) => ChatMessage.fromJson(e as Map<String, dynamic>)).toList(),
  );

  static const pageSize = 50;

  final Conversation conversation;
  final List<ChatMessage> messages;
}

/// A parent or guardian the teacher can write to.
class Guardian {
  const Guardian({required this.id, required this.fullName, required this.relation});

  factory Guardian.fromJson(Map<String, dynamic> j) =>
      Guardian(id: j['id'] as String, fullName: j['fullName'] as String, relation: j['relation'] as String? ?? 'parent');

  final String id;
  final String fullName;

  /// "father", "mother", "guardian"…
  final String relation;
}

/// A student in a class the teacher teaches, with the family members on record.
class StudentContacts {
  StudentContacts({required this.student, required this.className, required this.guardians});

  factory StudentContacts.fromJson(Map<String, dynamic> j) {
    final s = j['student'] as Map<String, dynamic>;
    return StudentContacts(
      student: Student.fromJson(s),
      className: s['className'] as String,
      guardians: (j['guardians'] as List).map((e) => Guardian.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  final Student student;
  final String className;
  final List<Guardian> guardians;
}
