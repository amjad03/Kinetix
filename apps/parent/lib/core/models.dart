/// Mirrors the parent-facing responses of services/api (src/parent, src/notifications, src/whiteboards).
library;

import 'package:kinetix_ink/kinetix_ink.dart';

/// "10:00:00" → a wall-clock time from the timetable (local to the institution).
class ClockTime implements Comparable<ClockTime> {
  const ClockTime(this.minutes);
  factory ClockTime.parse(String hhmmss) {
    final p = hhmmss.split(':');
    return ClockTime(int.parse(p[0]) * 60 + int.parse(p[1]));
  }

  final int minutes;

  /// "10:00", "14:00"
  String get label => '${(minutes ~/ 60).toString().padLeft(2, '0')}:${(minutes % 60).toString().padLeft(2, '0')}';

  @override
  int compareTo(ClockTime other) => minutes.compareTo(other.minutes);
}

ClockTime? _clock(Object? v) => v == null ? null : ClockTime.parse(v as String);

/// A calendar date without a time zone ("2026-10-05").
String isoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

DateTime parseIsoDate(String s) {
  final p = s.substring(0, 10).split('-').map(int.parse).toList();
  return DateTime(p[0], p[1], p[2]);
}

DateTime? _instant(Object? v) => v == null ? null : DateTime.parse(v as String).toLocal();

class Me {
  Me({required this.id, required this.fullName, required this.roles, required this.preferredLanguage, required this.institution, this.email, this.phone});

  factory Me.fromJson(Map<String, dynamic> j) => Me(
    id: j['id'] as String,
    fullName: j['fullName'] as String,
    email: j['email'] as String?,
    phone: j['phone'] as String?,
    preferredLanguage: j['preferredLanguage'] as String? ?? 'en',
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

  bool get isGuardian => roles.contains('guardian');

  String get firstName {
    final parts = fullName.split(' ').where((p) => p.isNotEmpty && !p.endsWith('.')).toList();
    return parts.isEmpty ? fullName : parts.first;
  }
}

class Child {
  Child({required this.id, required this.fullName, required this.rollNo, required this.sectionId, required this.sectionName, this.relation, this.programName});

  factory Child.fromJson(Map<String, dynamic> j) => Child(
    id: j['id'] as String,
    fullName: j['fullName'] as String,
    rollNo: j['rollNo'] as String,
    relation: j['relation'] as String?,
    sectionId: (j['section'] as Map)['id'] as String,
    sectionName: (j['section'] as Map)['displayName'] as String,
    programName: (j['program'] as Map?)?['name'] as String?,
  );

  final String id;
  final String fullName;
  final String rollNo;
  final String? relation;
  final String sectionId;
  final String sectionName;
  final String? programName;

  String get firstName => fullName.split(' ').first;
}

enum AttendanceStatus {
  present('Present'),
  absent('Absent'),
  late('Late'),
  excused('Excused');

  const AttendanceStatus(this.label);
  final String label;
}

/// One period's mark: "Absent · Corporate Accounting · Thu 1 Oct, 10:00".
class ClassMark {
  ClassMark({required this.date, required this.status, this.subject, this.startsAt, this.endsAt});

  factory ClassMark.fromJson(Map<String, dynamic> j) => ClassMark(
    date: parseIsoDate(j['date'] as String),
    status: AttendanceStatus.values.asNameMap()[j['status']] ?? AttendanceStatus.absent,
    subject: j['subject'] as String?,
    startsAt: _clock(j['startsAt']),
    endsAt: _clock(j['endsAt']),
  );

  final DateTime date;
  final AttendanceStatus status;
  final String? subject;
  final ClockTime? startsAt;
  final ClockTime? endsAt;
}

class AttendanceSummary {
  AttendanceSummary({
    required this.periods,
    required this.present,
    required this.absent,
    required this.late,
    required this.excused,
    required this.rate,
    required this.recentAbsences,
  });

  factory AttendanceSummary.fromJson(Map<String, dynamic> j) => AttendanceSummary(
    periods: j['periods'] as int,
    present: j['present'] as int,
    absent: j['absent'] as int,
    late: j['late'] as int,
    excused: j['excused'] as int,
    rate: (j['rate'] as num?)?.toDouble(),
    recentAbsences: [for (final a in (j['recentAbsences'] as List? ?? const [])) ClassMark.fromJson({...a as Map<String, dynamic>, 'status': 'absent'})],
  );

  final int periods;
  final int present;
  final int absent;
  final int late;
  final int excused;

  /// Percentage attended (present + late + excused), or null when nothing was recorded.
  final double? rate;
  final List<ClassMark> recentAbsences;

  int get attended => present + late + excused;
}

class Homework {
  Homework({required this.id, required this.title, required this.instructions, required this.dueOn, required this.subject, required this.teacher, this.createdAt});

  factory Homework.fromJson(Map<String, dynamic> j) => Homework(
    id: j['id'] as String,
    title: j['title'] as String,
    instructions: j['instructions'] as String? ?? '',
    dueOn: parseIsoDate(j['dueOn'] as String),
    createdAt: _instant(j['createdAt']),
    subject: j['subject'] as String,
    teacher: j['teacher'] as String,
  );

  final String id;
  final String title;
  final String instructions;
  final DateTime dueOn;
  final DateTime? createdAt;
  final String subject;
  final String teacher;
}

/// Answers given when the teacher picked the child in class, for one subject.
class Participation {
  Participation({required this.subject, required this.correct, required this.partial, required this.incorrect, required this.skipped});

  factory Participation.fromJson(Map<String, dynamic> j) => Participation(
    subject: j['subject'] as String,
    correct: j['correct'] as int,
    partial: j['partial'] as int,
    incorrect: j['incorrect'] as int,
    skipped: j['skipped'] as int,
  );

  final String subject;
  final int correct;
  final int partial;
  final int incorrect;
  final int skipped;

  int get answered => correct + partial + incorrect;
  int get total => answered + skipped;
}

/// A board the teacher shared with the class (no content).
class BoardSummary {
  BoardSummary({required this.id, required this.title, required this.pageCount, this.subjectName, this.teacherName, this.sectionName, this.sharedAt});

  factory BoardSummary.fromJson(Map<String, dynamic> j) => BoardSummary(
    id: j['id'] as String,
    title: j['title'] as String,
    pageCount: j['pageCount'] as int? ?? 1,
    subjectName: j['subjectName'] as String?,
    teacherName: j['teacherName'] as String?,
    sectionName: j['sectionName'] as String?,
    sharedAt: _instant(j['sharedAt']) ?? _instant(j['updatedAt']),
  );

  final String id;
  final String title;
  final int pageCount;
  final String? subjectName;
  final String? teacherName;
  final String? sectionName;
  final DateTime? sharedAt;
}

/// A shared board with its pages, ready for [WhiteboardView].
class SharedBoard {
  SharedBoard(this.summary, this.board);

  factory SharedBoard.fromJson(Map<String, dynamic> j) =>
      SharedBoard(BoardSummary.fromJson(j), SavedBoard.fromJson((j['content'] as Map).cast<String, dynamic>()));

  final BoardSummary summary;
  final SavedBoard board;
}

/// Everything on Home for one child.
class ChildSummary {
  ChildSummary({required this.today, required this.days, required this.attendance, required this.upcoming, required this.pastHomework, required this.participation, required this.boards});

  factory ChildSummary.fromJson(Map<String, dynamic> j) {
    final hw = j['homework'] as Map<String, dynamic>;
    List<Homework> list(Object? v) => [for (final h in (v as List? ?? const [])) Homework.fromJson(h as Map<String, dynamic>)];
    return ChildSummary(
      today: parseIsoDate((j['period'] as Map)['to'] as String),
      days: (j['period'] as Map)['days'] as int,
      attendance: AttendanceSummary.fromJson(j['attendance'] as Map<String, dynamic>),
      upcoming: list(hw['upcoming']),
      pastHomework: list(hw['recent']),
      participation: [for (final p in (j['participation'] as List? ?? const [])) Participation.fromJson(p as Map<String, dynamic>)],
      boards: [for (final b in (j['sharedBoards'] as List? ?? const [])) BoardSummary.fromJson(b as Map<String, dynamic>)],
    );
  }

  /// The institution's today, as the server sees it. Due dates are relative to this.
  final DateTime today;
  final int days;
  final AttendanceSummary attendance;
  final List<Homework> upcoming;
  final List<Homework> pastHomework;
  final List<Participation> participation;
  final List<BoardSummary> boards;
}

enum NotificationKind { absence, homework, boardShared, broadcast, other }

class AppNotification {
  AppNotification({required this.id, required this.kind, required this.title, required this.body, required this.data, required this.createdAt, this.readAt});

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
    id: j['id'] as String,
    kind: switch (j['kind']) {
      'absence' => NotificationKind.absence,
      'homework' => NotificationKind.homework,
      'board_shared' => NotificationKind.boardShared,
      'broadcast' => NotificationKind.broadcast,
      _ => NotificationKind.other,
    },
    title: j['title'] as String,
    body: j['body'] as String? ?? '',
    data: (j['data'] as Map?)?.cast<String, dynamic>() ?? const {},
    createdAt: _instant(j['createdAt'])!,
    readAt: _instant(j['readAt']),
  );

  final String id;
  final NotificationKind kind;
  final String title;
  final String body;
  final Map<String, dynamic> data;
  final DateTime createdAt;
  DateTime? readAt;

  bool get unread => readAt == null;
  String? get studentId => data['studentId'] as String?;
  String? get sectionId => data['sectionId'] as String?;
  String? get homeworkId => data['homeworkId'] as String?;
  String? get whiteboardId => data['whiteboardId'] as String?;
}

class Inbox {
  Inbox({required this.unread, required this.items});

  factory Inbox.fromJson(Map<String, dynamic> j) =>
      Inbox(unread: j['unread'] as int, items: [for (final n in j['items'] as List) AppNotification.fromJson(n as Map<String, dynamic>)]);

  final int unread;
  final List<AppNotification> items;
}
