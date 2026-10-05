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
    this.lessonPlanned = false,
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
    lessonPlanned: j['lessonPlanned'] as bool? ?? false,
  );

  final String slotId;
  final ClockTime startsAt;
  final ClockTime endsAt;
  final Ref section;
  final Ref subject;
  final Ref? room;
  final bool isNow;
  bool attendanceTaken;

  /// A lesson plan is saved for this period on this day.
  bool lessonPlanned;

  /// The period's length in minutes.
  int get minutes => endsAt.minutes - startsAt.minutes;
}

class DayTimetable {
  DayTimetable({required this.date, required this.today, required this.periods, this.nextTeachingDate, this.holiday});

  factory DayTimetable.fromJson(Map<String, dynamic> j) => DayTimetable(
    date: j['date'] as String,
    today: j['today'] as String,
    periods: (j['periods'] as List).map((e) => Period.fromJson(e as Map<String, dynamic>)).toList(),
    nextTeachingDate: j['nextTeachingDate'] as String?,
    holiday: (j['holiday'] as Map?)?['title'] as String?,
  );

  final String date;
  final String today;
  final List<Period> periods;

  /// The next day with classes (holidays skipped).
  final String? nextTeachingDate;

  /// The holiday's name when the day is a holiday (then there are no periods).
  final String? holiday;
}

// ---------------------------------------------------------------------------------------------
// Academic calendar

/// Shown with AppLocalizations.calendarKind.
enum CalendarKind { holiday, exam, event }

/// A holiday, exam days or an event from the academic calendar (GET /v1/calendar).
class CalendarEvent {
  CalendarEvent({required this.id, required this.kind, required this.title, required this.startsOn, required this.endsOn, this.programs});

  factory CalendarEvent.fromJson(Map<String, dynamic> j) => CalendarEvent(
    id: j['id'] as String,
    kind: CalendarKind.values.asNameMap()[j['kind']] ?? CalendarKind.event,
    title: j['title'] as String,
    startsOn: parseIsoDate(j['startsOn'] as String),
    endsOn: parseIsoDate(j['endsOn'] as String),
    programs: (j['programs'] as List?)?.cast<String>().where((p) => p.isNotEmpty).toList(),
  );

  final String id;
  final CalendarKind kind;
  final String title;
  final DateTime startsOn;
  final DateTime endsOn;

  /// The programs it applies to; null for the whole institution.
  final List<String>? programs;
}

// ---------------------------------------------------------------------------------------------
// Syllabus coverage

class SyllabusTopic {
  const SyllabusTopic({required this.id, required this.title, this.summary = ''});
  factory SyllabusTopic.fromJson(Map<String, dynamic> j) =>
      SyllabusTopic(id: j['id'] as String, title: j['title'] as String, summary: j['summary'] as String? ?? '');
  final String id;
  final String title;
  final String summary;
}

class SyllabusChapter {
  const SyllabusChapter({required this.id, required this.title, required this.topics});
  factory SyllabusChapter.fromJson(Map<String, dynamic> j) => SyllabusChapter(
    id: j['id'] as String,
    title: j['title'] as String,
    topics: [for (final t in (j['topics'] as List? ?? const [])) SyllabusTopic.fromJson(t as Map<String, dynamic>)],
  );
  final String id;
  final String title;
  final List<SyllabusTopic> topics;
}

/// A subject's course outline from the content library (GET /v1/content/syllabus).
class Syllabus {
  const Syllabus({required this.title, required this.chapters});
  factory Syllabus.fromJson(Map<String, dynamic> j) => Syllabus(
    title: j['title'] as String,
    chapters: [for (final c in (j['chapters'] as List? ?? const [])) SyllabusChapter.fromJson(c as Map<String, dynamic>)],
  );
  final String title;
  final List<SyllabusChapter> chapters;
}

/// When a topic was taught to the class, and by whom.
class TopicCoverage {
  const TopicCoverage({required this.coveredOn, required this.coveredBy});
  factory TopicCoverage.fromJson(Map<String, dynamic> j) =>
      TopicCoverage(coveredOn: parseIsoDate(j['coveredOn'] as String), coveredBy: j['coveredBy'] as String? ?? '');
  final DateTime coveredOn;
  final String coveredBy;
}

/// Which topics of a class's syllabus have been taught (GET /v1/coverage).
class Coverage {
  const Coverage({required this.total, required this.topics});
  factory Coverage.fromJson(Map<String, dynamic> j) => Coverage(
    total: j['total'] as int? ?? 0,
    topics: {
      for (final t in (j['topics'] as List? ?? const []).cast<Map<String, dynamic>>()) t['topicId'] as String: TopicCoverage.fromJson(t),
    },
  );

  final int total;

  /// Taught topics by id.
  final Map<String, TopicCoverage> topics;

  int get covered => topics.length;
  double get fraction => total == 0 ? 0 : (covered / total).clamp(0, 1);
}

// ---------------------------------------------------------------------------------------------
// Homework submissions

/// Shown with AppLocalizations.submissionStatus. A student with no status has not handed in.
enum SubmissionStatus { submitted, checked, returned }

/// A photo or PDF handed in with the work.
class SubmissionFile {
  const SubmissionFile({required this.index, required this.name, required this.mime, required this.bytes});
  factory SubmissionFile.fromJson(Map<String, dynamic> j) =>
      SubmissionFile(index: j['index'] as int, name: j['name'] as String, mime: j['mime'] as String, bytes: j['bytes'] as int? ?? 0);
  final int index;
  final String name;
  final String mime;
  final int bytes;

  bool get isImage => mime.startsWith('image/');
  bool get isPdf => mime == 'application/pdf';
}

/// One student's row in a homework's submissions.
class Submission {
  Submission({
    required this.studentId,
    required this.fullName,
    required this.rollNo,
    this.status,
    this.submittedAt,
    this.text = '',
    this.files = const [],
    this.remark,
    this.late = false,
  });

  factory Submission.fromJson(Map<String, dynamic> j) => Submission(
    studentId: j['studentId'] as String,
    fullName: j['fullName'] as String,
    rollNo: j['rollNo'] as String? ?? '',
    status: SubmissionStatus.values.asNameMap()[j['status']],
    submittedAt: j['submittedAt'] == null ? null : DateTime.parse(j['submittedAt'] as String).toLocal(),
    text: j['text'] as String? ?? '',
    files: [for (final f in (j['files'] as List? ?? const [])) SubmissionFile.fromJson(f as Map<String, dynamic>)],
    remark: j['remark'] as String?,
    late: j['late'] as bool? ?? false,
  );

  final String studentId;
  final String fullName;
  final String rollNo;

  /// Null when nothing has been handed in.
  final SubmissionStatus? status;
  final DateTime? submittedAt;
  final String text;
  final List<SubmissionFile> files;
  final String? remark;

  /// Handed in after the due date.
  final bool late;

  /// The same student after a review (POST …/review returns the submission without the name).
  Submission reviewed(Map<String, dynamic> j) =>
      Submission.fromJson({'studentId': studentId, 'fullName': fullName, 'rollNo': rollNo, ...j});
}

class SubmissionCounts {
  const SubmissionCounts({
    required this.students,
    required this.submitted,
    required this.checked,
    required this.returned,
    required this.missing,
  });
  factory SubmissionCounts.fromJson(Map<String, dynamic> j) => SubmissionCounts(
    students: j['students'] as int? ?? 0,
    submitted: j['submitted'] as int? ?? 0,
    checked: j['checked'] as int? ?? 0,
    returned: j['returned'] as int? ?? 0,
    missing: j['missing'] as int? ?? 0,
  );
  factory SubmissionCounts.of(List<Submission> s) => SubmissionCounts(
    students: s.length,
    submitted: s.where((x) => x.status == SubmissionStatus.submitted).length,
    checked: s.where((x) => x.status == SubmissionStatus.checked).length,
    returned: s.where((x) => x.status == SubmissionStatus.returned).length,
    missing: s.where((x) => x.status == null).length,
  );
  final int students;

  /// Handed in and waiting to be checked.
  final int submitted;
  final int checked;
  final int returned;

  /// Not handed in.
  final int missing;
}

/// The class list for a homework with who has handed in (GET /v1/homework/:id/submissions).
class SubmissionList {
  SubmissionList({required this.counts, required this.students});
  factory SubmissionList.fromJson(Map<String, dynamic> j) => SubmissionList(
    counts: SubmissionCounts.fromJson(j['counts'] as Map<String, dynamic>),
    students: [for (final s in j['students'] as List) Submission.fromJson(s as Map<String, dynamic>)],
  );
  SubmissionCounts counts;
  final List<Submission> students;

  /// Puts a reviewed submission in place and recounts.
  void replace(Submission s) {
    final i = students.indexWhere((x) => x.studentId == s.studentId);
    if (i >= 0) students[i] = s;
    counts = SubmissionCounts.of(students);
  }
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
  BoardConnection({required this.sessionId, required this.boardName, this.boardId, this.sectionName, this.subjectName, this.startsAt, this.endsAt});

  factory BoardConnection.fromJson(Map<String, dynamic> j) {
    final s = j['session'] as Map<String, dynamic>;
    final period = s['period'] as Map<String, dynamic>?;
    return BoardConnection(
      sessionId: s['sessionId'] as String,
      boardName: (j['board'] as Map)['name'] as String,
      boardId: (j['board'] as Map)['id'] as String?,
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

  /// The board's device id: the phone remote drives it (null from older servers).
  final String? boardId;
}

/// One student's printed answer card: card [cardNo] belongs to them (the board reads it from a
/// photo of the class).
class AnswerCard {
  const AnswerCard({required this.cardNo, required this.rollNo, required this.fullName});
  factory AnswerCard.fromJson(Map<String, dynamic> j) =>
      AnswerCard(cardNo: (j['cardNo'] as num).toInt(), rollNo: j['rollNo'] as String, fullName: j['fullName'] as String);
  final int cardNo;
  final String rollNo;
  final String fullName;
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

// ---------------------------------------------------------------------------------------------
// Year plans and lesson plans

/// The Monday of [d]'s week.
DateTime mondayOf(DateTime d) => DateTime(d.year, d.month, d.day - (d.weekday - DateTime.monday));

/// How a class is doing against its year plan. Shown with AppLocalizations.planStatus.
enum PlanStatus { notStarted, onTrack, behind, ahead }

class PlanProgress {
  const PlanProgress({
    required this.total,
    required this.covered,
    required this.expected,
    required this.dueThisWeek,
    required this.behindBy,
    required this.status,
  });

  factory PlanProgress.fromJson(Map<String, dynamic> j) => PlanProgress(
    total: j['total'] as int? ?? 0,
    covered: j['covered'] as int? ?? 0,
    expected: j['expected'] as int? ?? 0,
    dueThisWeek: j['dueThisWeek'] as int? ?? 0,
    behindBy: j['behindBy'] as int? ?? 0,
    status: switch (j['status']) {
      'on_track' => PlanStatus.onTrack,
      'behind' => PlanStatus.behind,
      'ahead' => PlanStatus.ahead,
      _ => PlanStatus.notStarted,
    },
  );

  final int total;
  final int covered;

  /// Topics planned before this week.
  final int expected;
  final int dueThisWeek;

  /// Topics planned before this week that are not taught yet.
  final int behindBy;
  final PlanStatus status;
}

/// One syllabus topic in a year plan: the week it is planned for and how many periods.
class YearPlanItem {
  const YearPlanItem({
    required this.topicId,
    required this.title,
    required this.chapter,
    required this.weekOf,
    required this.periods,
    this.coveredOn,
    this.late = false,
  });

  factory YearPlanItem.fromJson(Map<String, dynamic> j) => YearPlanItem(
    topicId: j['topicId'] as String,
    title: j['title'] as String? ?? '',
    chapter: j['chapter'] as String? ?? '',
    weekOf: parseIsoDate(j['weekOf'] as String),
    periods: j['periods'] as int? ?? 1,
    coveredOn: j['coveredOn'] == null ? null : parseIsoDate(j['coveredOn'] as String),
    late: j['late'] as bool? ?? false,
  );

  final String topicId;
  final String title;
  final String chapter;

  /// The Monday of the planned week.
  final DateTime weekOf;
  final int periods;

  /// When it was taught, or null.
  final DateTime? coveredOn;

  /// Planned for an earlier week and not taught yet.
  final bool late;
}

/// A class's syllabus spread over the term (GET /v1/year-plans).
class YearPlan {
  const YearPlan({required this.id, required this.startsOn, required this.endsOn, required this.progress, required this.items, this.thisWeek});

  factory YearPlan.fromJson(Map<String, dynamic> j) => YearPlan(
    id: j['id'] as String,
    startsOn: parseIsoDate(j['startsOn'] as String),
    endsOn: parseIsoDate(j['endsOn'] as String),
    progress: PlanProgress.fromJson(j['progress'] as Map<String, dynamic>),
    items: [for (final i in j['items'] as List? ?? const []) YearPlanItem.fromJson(i as Map<String, dynamic>)],
    thisWeek: j['thisWeek'] == null ? null : parseIsoDate(j['thisWeek'] as String),
  );

  final String id;
  final DateTime startsOn;
  final DateTime endsOn;
  final PlanProgress progress;
  final List<YearPlanItem> items;

  /// The Monday of the institution's current week (the server decides `late` by it); null from
  /// older servers.
  final DateTime? thisWeek;

  /// The Mondays from the first week to the last, for the week picker.
  List<DateTime> get weeks {
    final last = mondayOf(endsOn);
    return [for (var w = mondayOf(startsOn); !w.isAfter(last); w = DateTime(w.year, w.month, w.day + 7)) w];
  }
}

class LessonStep {
  const LessonStep({required this.minutes, required this.activity});
  factory LessonStep.fromJson(Map<String, dynamic> j) => LessonStep(minutes: j['minutes'] as int? ?? 5, activity: j['activity'] as String? ?? '');
  final int minutes;
  final String activity;
  Map<String, dynamic> toJson() => {'minutes': minutes, 'activity': activity};
}

List<String> _strings(Object? v) => [for (final s in v as List? ?? const []) s as String];

/// What a lesson plan says: objectives, timed steps, materials, how to check understanding, homework.
class LessonContent {
  const LessonContent({
    this.objectives = const [],
    this.steps = const [],
    this.materials = const [],
    this.assessment = '',
    this.homework = '',
  });

  factory LessonContent.fromJson(Map<String, dynamic> j) => LessonContent(
    objectives: _strings(j['objectives']),
    steps: [for (final s in j['steps'] as List? ?? const []) LessonStep.fromJson(s as Map<String, dynamic>)],
    materials: _strings(j['materials']),
    assessment: j['assessment'] as String? ?? '',
    homework: j['homework'] as String? ?? '',
  );

  final List<String> objectives;
  final List<LessonStep> steps;
  final List<String> materials;
  final String assessment;
  final String homework;

  bool get isEmpty =>
      objectives.isEmpty && steps.isEmpty && materials.isEmpty && assessment.trim().isEmpty && homework.trim().isEmpty;

  Map<String, dynamic> toJson() => {
    'objectives': objectives,
    'steps': [for (final s in steps) s.toJson()],
    'materials': materials,
    'assessment': assessment,
    'homework': homework,
  };
}

/// A saved plan for one period on one day.
class LessonPlan {
  const LessonPlan({
    required this.id,
    required this.date,
    required this.topics,
    required this.content,
    this.aiDrafted = false,
    this.teacher = '',
    this.reviewedAt,
    this.reviewedBy,
    this.reviewRemark,
  });

  factory LessonPlan.fromJson(Map<String, dynamic> j) {
    final titles = {for (final t in j['topics'] as List? ?? const []) (t as Map)['id'] as String: t['title'] as String? ?? ''};
    return LessonPlan(
      id: j['id'] as String,
      date: j['date'] as String,
      topics: [for (final id in (j['topicIds'] as List? ?? const []).cast<String>()) Ref(id, titles[id] ?? '')],
      content: LessonContent.fromJson(j['content'] as Map<String, dynamic>? ?? const {}),
      aiDrafted: j['aiDrafted'] as bool? ?? false,
      teacher: j['teacher'] as String? ?? '',
      reviewedAt: j['reviewedAt'] == null ? null : DateTime.parse(j['reviewedAt'] as String).toLocal(),
      reviewedBy: j['reviewedBy'] as String?,
      reviewRemark: j['reviewRemark'] as String?,
    );
  }

  final String id;
  final String date;
  final List<Ref> topics;
  final LessonContent content;
  final bool aiDrafted;
  final String teacher;

  /// When the head of department or principal reviewed it (cleared when the plan changes).
  final DateTime? reviewedAt;

  /// The reviewer's name.
  final String? reviewedBy;
  final String? reviewRemark;
}

/// The plan for a period, or what to start from (GET /v1/lesson-plans/period).
class PeriodPlan {
  const PeriodPlan({required this.date, required this.plan, required this.suggestedTopicIds});

  factory PeriodPlan.fromJson(Map<String, dynamic> j) => PeriodPlan(
    date: j['date'] as String,
    plan: j['plan'] == null ? null : LessonPlan.fromJson(j['plan'] as Map<String, dynamic>),
    suggestedTopicIds: (j['suggestedTopicIds'] as List? ?? const []).cast<String>(),
  );

  final String date;
  final LessonPlan? plan;

  /// That week's untaught topics in the year plan (or the next untaught one).
  final List<String> suggestedTopicIds;
}

/// A first draft from KINETIX AI (POST /v1/lesson-plans/draft); not saved.
class LessonDraft {
  const LessonDraft({required this.topicIds, required this.content, this.preview = false});

  factory LessonDraft.fromJson(Map<String, dynamic> j) => LessonDraft(
    topicIds: (j['topicIds'] as List? ?? const []).cast<String>(),
    content: LessonContent.fromJson(j['content'] as Map<String, dynamic>),
    preview: (j['meta'] as Map?)?['preview'] as bool? ?? false,
  );

  final List<String> topicIds;
  final LessonContent content;

  /// A placeholder from a server with no AI model connected.
  final bool preview;
}

/// What POST /v1/auth/otp/request answers: when another code may be sent, and how long this one works.
class OtpChallenge {
  const OtpChallenge({required this.retryAfter, required this.expiresIn});

  factory OtpChallenge.fromJson(Map<String, dynamic> j) => OtpChallenge(
    retryAfter: Duration(seconds: (j['retryAfterSeconds'] as num?)?.toInt() ?? 30),
    expiresIn: Duration(seconds: (j['expiresInSeconds'] as num?)?.toInt() ?? 300),
  );

  final Duration retryAfter;
  final Duration expiresIn;
}

/// One of the teacher's notifications (GET /v1/notifications), for opening the screen a push is about.
class AppNotification {
  const AppNotification({required this.id, required this.kind, this.data = const {}});

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
    id: j['id'] as String,
    kind: j['kind'] as String,
    data: {for (final e in ((j['data'] as Map?) ?? const {}).entries) '${e.key}': '${e.value}'},
  );

  final String id;
  final String kind;

  /// Ids for the screen to open: conversationId, homeworkId…
  final Map<String, String> data;
}
