// The LMS as a teacher works it in the app (services/api/src/lms): my courses and their content, live classes with
// attendance from joins, students at risk, the discussion moderation queue, and quizzes with their attempts.

int _i(Object? v) => (v as num?)?.toInt() ?? 0;
double? _d(Object? v) => (v as num?)?.toDouble();
String _s(Object? v) => v is String ? v : '';
DateTime? _t(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
List<Map<String, dynamic>> _maps(Object? v) => [for (final x in (v as List? ?? const [])) (x as Map).cast<String, dynamic>()];

class TeacherCourse {
  const TeacherCourse({required this.id, required this.title, required this.section, required this.subject, required this.published, this.items = 0, this.activeLearners = 0});

  factory TeacherCourse.fromJson(Map<String, dynamic> j) => TeacherCourse(id: _s(j['id']), title: _s(j['title']), section: _s(j['section']), subject: _s(j['subject']), published: j['status'] == 'published', items: _i(j['items']), activeLearners: _i(j['activeLearners']));

  final String id;
  final String title;
  final String section;
  final String subject;
  final bool published;
  final int items;

  /// Students who opened something in the last 7 days.
  final int activeLearners;
}

class TeacherCourseItem {
  const TeacherCourseItem({required this.id, required this.kind, required this.title, this.completionRule = 'view'});

  factory TeacherCourseItem.fromJson(Map<String, dynamic> j) => TeacherCourseItem(id: _s(j['id']), kind: _s(j['kind']), title: _s(j['title']), completionRule: j['completionRule'] is String ? j['completionRule'] as String : 'view');

  final String id;
  final String kind;
  final String title;
  final String completionRule;
}

class TeacherCourseModule {
  const TeacherCourseModule({required this.id, required this.title, required this.items});

  factory TeacherCourseModule.fromJson(Map<String, dynamic> j) => TeacherCourseModule(id: _s(j['id']), title: _s(j['title']), items: [for (final i in _maps(j['items'])) TeacherCourseItem.fromJson(i)]);

  final String id;
  final String title;
  final List<TeacherCourseItem> items;
}

class TeacherCourseDetail {
  const TeacherCourseDetail({required this.id, required this.title, required this.published, required this.modules, this.completionPct = 100, this.certificate = false});

  factory TeacherCourseDetail.fromJson(Map<String, dynamic> j) => TeacherCourseDetail(id: _s(j['id']), title: _s(j['title']), published: j['status'] == 'published', completionPct: j['completionPct'] == null ? 100 : _i(j['completionPct']), certificate: j['certificate'] == true, modules: [for (final m in _maps(j['modules'])) TeacherCourseModule.fromJson(m)]);

  final String id;
  final String title;
  final bool published;
  final List<TeacherCourseModule> modules;
  final int completionPct;
  final bool certificate;
}

class RiskStudent {
  const RiskStudent({required this.id, required this.name, required this.rollNo, required this.level, required this.reasons, required this.engagementPct, this.quizPct, this.overdue = 0});

  factory RiskStudent.fromJson(Map<String, dynamic> j) => RiskStudent(id: _s(j['id']), name: _s(j['fullName']), rollNo: _s(j['rollNo']), level: _s(j['level']), reasons: [for (final r in (j['reasons'] as List? ?? const [])) '$r'], engagementPct: _i(j['engagementPct']), quizPct: _d(j['quizPct']), overdue: _i(j['overdue']));

  final String id;
  final String name;
  final String rollNo;

  /// none, low, medium or high.
  final String level;

  /// inactive, low_engagement, low_quiz, overdue, missed_live.
  final List<String> reasons;
  final int engagementPct;
  final double? quizPct;
  final int overdue;
}

class TeacherLive {
  const TeacherLive({required this.id, required this.title, required this.startsAt, required this.durationMin, required this.joined, this.hasPeriod = false, this.attendanceMarked = false, this.cancelled = false});

  factory TeacherLive.fromJson(Map<String, dynamic> j) => TeacherLive(id: _s(j['id']), title: _s(j['title']), startsAt: _t(j['startsAt']) ?? DateTime.now(), durationMin: _i(j['durationMin']), joined: _i(j['joined']), hasPeriod: j['slotId'] != null, attendanceMarked: j['attendanceMarkedAt'] != null, cancelled: j['status'] == 'cancelled');

  final String id;
  final String title;
  final DateTime startsAt;
  final int durationMin;
  final int joined;
  final bool hasPeriod;
  final bool attendanceMarked;
  final bool cancelled;
}

class LiveJoinRow {
  const LiveJoinRow({required this.studentId, required this.name, required this.rollNo, required this.suggested, required this.joins});

  factory LiveJoinRow.fromJson(Map<String, dynamic> j) => LiveJoinRow(studentId: _s(j['id']), name: _s(j['fullName']), rollNo: _s(j['rollNo']), suggested: _s(j['suggested']), joins: _i(j['joins']));

  final String studentId;
  final String name;
  final String rollNo;

  /// present, late or absent.
  final String suggested;
  final int joins;
}

class ModerationRow {
  const ModerationRow({required this.kind, required this.id, required this.text, required this.author, required this.held, required this.reports});

  final String kind;
  final String id;
  final String text;
  final String author;
  final bool held;
  final int reports;

  static List<ModerationRow> fromQueue(Map<String, dynamic> j) => [
    for (final t in _maps(j['threads'])) ModerationRow(kind: 'thread', id: _s(t['id']), text: '${_s(t['title'])}: ${_s(t['body'])}', author: _s(t['author']), held: t['held'] == true, reports: _i(t['reports'])),
    for (final p in _maps(j['posts'])) ModerationRow(kind: 'post', id: _s(p['id']), text: _s(p['body']), author: _s(p['author']), held: p['held'] == true, reports: _i(p['reports'])),
  ];
}

class TeacherQuiz {
  const TeacherQuiz({required this.id, required this.title, required this.section, required this.subject, required this.status, this.attempts = 0, this.toMark = 0, this.flagged = 0});

  factory TeacherQuiz.fromJson(Map<String, dynamic> j) => TeacherQuiz(id: _s(j['id']), title: _s(j['title']), section: _s(j['section']), subject: _s(j['subject']), status: _s(j['status']), attempts: _i(j['attempts']), toMark: _i(j['toMark']), flagged: _i(j['flagged']));

  final String id;
  final String title;
  final String section;
  final String subject;
  final String status;
  final int attempts;
  final int toMark;
  final int flagged;
}

class TeacherQuizAttempt {
  const TeacherQuizAttempt({required this.id, required this.name, required this.rollNo, this.score, this.maxScore, this.needsMarking = false, this.violations = 0, this.flagged = false, this.autoSubmitted = false, this.unmarked = const []});

  factory TeacherQuizAttempt.fromJson(Map<String, dynamic> j) {
    final results = ((j['results'] as Map?) ?? const {}).cast<String, dynamic>();
    return TeacherQuizAttempt(
      id: _s(j['id']),
      name: _s(j['fullName']),
      rollNo: _s(j['rollNo']),
      score: _d(j['score']),
      maxScore: _d(j['maxScore']),
      needsMarking: j['needsMarking'] == true,
      violations: _i(j['violations']),
      flagged: j['flagged'] == true,
      autoSubmitted: j['autoSubmitted'] == true,
      unmarked: [for (final e in results.entries) if ((e.value as Map)['correct'] == null) e.key],
    );
  }

  final String id;
  final String name;
  final String rollNo;
  final double? score;
  final double? maxScore;
  final bool needsMarking;
  final int violations;
  final bool flagged;
  final bool autoSubmitted;

  /// Questions the machine could not mark.
  final List<String> unmarked;
}
