/// The class diary, a student's activities, and report cards (school mode), as the Cloud API sends
/// them (services/api src/parent/parent-extras.controller.ts and curriculum/school-academics.controller.ts).
library;

String _s(Object? v) => v == null ? '' : '$v';
num _n(Object? v) => v is num ? v : num.tryParse('$v') ?? 0;
List<String> _strings(Object? v) => [for (final s in (v as List? ?? const [])) '$s'];
List<T> _list<T>(Object? v, T Function(Map<String, dynamic>) f) => [for (final x in (v as List? ?? const [])) f((x as Map).cast<String, dynamic>())];

/// One day's entry in the class diary (`GET /v1/student/diary`): classwork, a homework note and a notice.
class DiaryEntry {
  const DiaryEntry({required this.id, required this.date, required this.classwork, required this.homeworkNote, required this.notice, required this.author, this.subject});

  factory DiaryEntry.fromJson(Map<String, dynamic> j) => DiaryEntry(
    id: _s(j['id']),
    date: DateTime.parse(j['entryDate'] as String),
    classwork: _s(j['classwork']),
    homeworkNote: _s(j['homeworkNote']),
    notice: _s(j['notice']),
    author: _s(j['author']),
    subject: j['subject'] as String?,
  );

  final String id, classwork, homeworkNote, notice, author;
  final DateTime date;
  final String? subject;
}

/// A club the student belongs to, with posts held and points earned.
class ClubRole {
  const ClubRole({required this.club, required this.role, required this.posts, required this.points, required this.activities});

  factory ClubRole.fromJson(Map<String, dynamic> j) =>
      ClubRole(club: _s(j['club']), role: j['role'] as String? ?? 'member', posts: _strings(j['posts']), points: _n(j['points']).toInt(), activities: _n(j['activities']).toInt());

  final String club, role;
  final List<String> posts;
  final int points, activities;
}

/// A house point awarded (or taken back).
class HouseRecognition {
  const HouseRecognition({required this.points, required this.category, required this.reason, required this.awardedOn});

  factory HouseRecognition.fromJson(Map<String, dynamic> j) =>
      HouseRecognition(points: _n(j['points']).toInt(), category: _s(j['category']), reason: _s(j['reason']), awardedOn: _s(j['awardedOn']));

  final int points;
  final String category, reason, awardedOn;
}

/// What the student has taken part in (`GET /v1/student/activities`).
class MyActivities {
  const MyActivities({
    required this.clubs,
    required this.events,
    this.houseName,
    this.houseCaptain = false,
    this.housePoints = 0,
    required this.recognitions,
    this.term,
    required this.grades,
    required this.achievements,
  });

  factory MyActivities.fromJson(Map<String, dynamic> j) {
    final house = j['house'] as Map?;
    final co = j['coCurricular'] as Map?;
    return MyActivities(
      clubs: _list(j['clubs'], ClubRole.fromJson),
      events: _list(j['events'], (e) => (title: _s(e['title']), on: _s(e['on']))),
      houseName: house?['name'] as String?,
      houseCaptain: house?['isCaptain'] as bool? ?? false,
      housePoints: _n(house?['totalPoints']).toInt(),
      recognitions: _list(j['recognitions'], HouseRecognition.fromJson),
      term: co?['term'] as String?,
      grades: _list(co?['grades'], (g) => (activity: _s(g['activity']), grade: _s(g['grade']), remark: _s(g['remark']))),
      achievements: _list(j['achievements'], (a) => (club: _s(a['club']), title: _s(a['title']), level: _s(a['level']), position: _s(a['position']), on: _s(a['achievedOn']))),
    );
  }

  final List<ClubRole> clubs;
  final List<({String title, String on})> events;

  /// The student's house, or null when none.
  final String? houseName;
  final bool houseCaptain;
  final int housePoints;
  final List<HouseRecognition> recognitions;

  /// The term the co-curricular grades are from.
  final String? term;
  final List<({String activity, String grade, String remark})> grades;
  final List<({String club, String title, String level, String position, String on})> achievements;

  bool get isEmpty => clubs.isEmpty && events.isEmpty && houseName == null && recognitions.isEmpty && grades.isEmpty && achievements.isEmpty;
}

/// One term's report card in a list (`GET /v1/school/report-cards?studentId=`).
class ReportCardRow {
  const ReportCardRow({required this.id, required this.termLabel, required this.promotionStatus});

  factory ReportCardRow.fromJson(Map<String, dynamic> j) => ReportCardRow(id: _s(j['id']), termLabel: _s(j['termLabel']), promotionStatus: _s(j['promotionStatus']));

  final String id, termLabel;

  /// `pending`, `promoted`, `promoted_with_grace` or `detained`.
  final String promotionStatus;
}

class ReportLine {
  const ReportLine({required this.subject, required this.marks, required this.maxMarks, required this.grade, required this.remark});

  final String subject, grade, remark;
  final double marks, maxMarks;
}

/// A full report card (`GET /v1/school/report-cards/:id`).
class ReportCardDetail {
  const ReportCardDetail({
    required this.termLabel,
    required this.remarks,
    this.behaviourGrade,
    required this.promotionStatus,
    this.promotedTo,
    required this.lines,
    required this.coCurricular,
    this.attendancePercent,
    this.attendancePresent,
    this.attendanceTotal,
  });

  factory ReportCardDetail.fromJson(Map<String, dynamic> j) {
    final att = j['attendance'] as Map?;
    return ReportCardDetail(
      termLabel: _s(j['termLabel']),
      remarks: _s(j['remarks']),
      behaviourGrade: j['behaviourGrade'] as String?,
      promotionStatus: _s(j['promotionStatus']),
      promotedTo: j['promotedTo'] as String?,
      lines: _list(j['lines'], (l) => ReportLine(subject: _s(l['subjectName']), marks: _n(l['marks']).toDouble(), maxMarks: _n(l['maxMarks']).toDouble(), grade: _s(l['grade']), remark: _s(l['remark']))),
      coCurricular: _list(j['coCurricular'], (c) => (activity: _s(c['activity']), grade: _s(c['grade']), remark: _s(c['remark']))),
      attendancePercent: att?['percent'] == null ? null : _n(att!['percent']).toDouble(),
      attendancePresent: att?['present'] == null ? null : _n(att!['present']).round(),
      attendanceTotal: att?['total'] == null ? null : _n(att!['total']).round(),
    );
  }

  final String termLabel, remarks, promotionStatus;
  final String? behaviourGrade, promotedTo;
  final List<ReportLine> lines;
  final List<({String activity, String grade, String remark})> coCurricular;
  final double? attendancePercent;
  final int? attendancePresent, attendanceTotal;
}
