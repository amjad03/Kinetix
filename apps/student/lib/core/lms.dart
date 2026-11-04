// LMS courses (GET /v1/lms/my, GET /v1/lms/courses/:id): what the student sees of a course shell, their progress and
// their running grade; and the LMS pass additions: live classes, certificates, learning paths and the offline bundle.

double? _num(Object? v) => (v as num?)?.toDouble();
int _int(Object? v) => (v as num?)?.toInt() ?? 0;
DateTime? _time(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;

class LmsCourseSummary {
  const LmsCourseSummary({required this.courseId, required this.title, required this.subject, required this.moduleCount, this.overall, this.letter, this.completionPct = 0, this.itemsDone = 0, this.itemsTotal = 0, this.certificate = false});

  factory LmsCourseSummary.fromJson(Map<String, dynamic> j) => LmsCourseSummary(
    courseId: j['courseId'] as String,
    title: j['title'] as String,
    subject: j['subject'] as String? ?? '',
    moduleCount: (j['moduleCount'] as num?)?.toInt() ?? 0,
    overall: _num(j['overall']),
    letter: j['letter'] as String?,
    completionPct: _int(j['completionPct']),
    itemsDone: _int(j['itemsDone']),
    itemsTotal: _int(j['itemsTotal']),
    certificate: j['certificate'] == true,
  );

  final String courseId;
  final String title;
  final String subject;
  final int moduleCount;

  /// The running grade as a percentage; null until something is graded.
  final double? overall;
  final String? letter;

  /// Share of the items released to the student that they have finished.
  final int completionPct;
  final int itemsDone;
  final int itemsTotal;

  /// The course gives a certificate on completion.
  final bool certificate;
}

class LmsItem {
  const LmsItem({required this.kind, required this.title, this.url, this.id = '', this.refId, this.body = '', this.completionRule = 'view', this.locked = false, this.completed = false, this.durationMin, this.sizeKb, this.offline = true});

  factory LmsItem.fromJson(Map<String, dynamic> j) => LmsItem(
    id: j['id'] as String? ?? '',
    kind: j['kind'] as String,
    title: j['title'] as String,
    url: j['url'] as String?,
    refId: j['refId'] as String?,
    body: j['body'] as String? ?? '',
    completionRule: j['completionRule'] as String? ?? 'view',
    locked: j['locked'] == true,
    completed: j['completed'] == true,
    durationMin: (j['durationMin'] as num?)?.toInt(),
    sizeKb: (j['sizeKb'] as num?)?.toInt(),
    offline: j['offline'] != false,
  );

  Map<String, dynamic> toJson() => {'id': id, 'kind': kind, 'title': title, 'url': url, 'refId': refId, 'body': body, 'completionRule': completionRule, 'locked': locked, 'completed': completed, 'durationMin': durationMin, 'sizeKb': sizeKb, 'offline': offline};

  final String id;

  /// page, topic, video, homework, assessment, file, link, pdf, ppt, scorm, quiz, live and more.
  final String kind;
  final String title;
  final String? url;

  /// The quiz, SCORM package, live class or other record the item shows.
  final String? refId;

  /// A lesson page's text (kept for offline reading).
  final String body;

  /// view (opening finishes it), mark_done (the student says so) or pass (a pass mark on a quiz or package).
  final String completionRule;

  /// Waiting for a prerequisite (an earlier item or course).
  final bool locked;
  final bool completed;
  final int? durationMin;

  /// Download size, so the student can skip heavy items on mobile data.
  final int? sizeKb;
  final bool offline;

  LmsItem copyWith({bool? completed}) => LmsItem(id: id, kind: kind, title: title, url: url, refId: refId, body: body, completionRule: completionRule, locked: locked, completed: completed ?? this.completed, durationMin: durationMin, sizeKb: sizeKb, offline: offline);
}

class LmsModule {
  const LmsModule({required this.title, required this.items});

  factory LmsModule.fromJson(Map<String, dynamic> j) => LmsModule(title: j['title'] as String, items: [for (final i in (j['items'] as List? ?? const [])) LmsItem.fromJson((i as Map).cast<String, dynamic>())]);

  Map<String, dynamic> toJson() => {'title': title, 'items': [for (final i in items) i.toJson()]};

  final String title;
  final List<LmsItem> items;
}

class LmsGradePart {
  const LmsGradePart({required this.name, required this.weight, this.percent, this.overridden = false});

  final String name;
  final double weight;
  final double? percent;
  final bool overridden;
}

/// How far the student is through a course, by its completion rules.
class LmsCompletion {
  const LmsCompletion({required this.total, required this.done, required this.pct, required this.eligible, this.missing = const []});

  factory LmsCompletion.fromJson(Map<String, dynamic> j) => LmsCompletion(total: _int(j['total']), done: _int(j['done']), pct: _int(j['pct']), eligible: j['eligible'] == true, missing: [for (final m in (j['missing'] as List? ?? const [])) '$m']);

  Map<String, dynamic> toJson() => {'total': total, 'done': done, 'pct': pct, 'eligible': eligible, 'missing': missing};

  final int total;
  final int done;
  final int pct;
  final bool eligible;

  /// items and/or grade.
  final List<String> missing;
}

class LmsCourseDetail {
  const LmsCourseDetail({required this.title, required this.subject, required this.description, required this.modules, required this.announcements, required this.parts, this.overall, this.letter, this.completion, this.certificate = false, this.prerequisites = const [], this.offlineCopy = false});

  factory LmsCourseDetail.fromJson(Map<String, dynamic> j) {
    final g = (j['grade'] as Map?)?.cast<String, dynamic>();
    final cats = [for (final c in (g?['categories'] as List? ?? const [])) (c as Map).cast<String, dynamic>()];
    final cells = [for (final c in (g?['cells'] as List? ?? const [])) (c as Map).cast<String, dynamic>()];
    final comp = (j['completion'] as Map?)?.cast<String, dynamic>();
    return LmsCourseDetail(
      title: j['title'] as String,
      subject: j['subject'] as String? ?? '',
      description: j['description'] as String? ?? '',
      modules: [for (final m in (j['modules'] as List? ?? const [])) LmsModule.fromJson((m as Map).cast<String, dynamic>())],
      announcements: [for (final a in (j['announcements'] as List? ?? const [])) ((a as Map)['title'] as String)],
      parts: [
        for (var i = 0; i < cats.length && i < cells.length; i++)
          LmsGradePart(name: cats[i]['name'] as String, weight: _num(cats[i]['weight']) ?? 0, percent: _num(cells[i]['percent']), overridden: cells[i]['overridden'] == true),
      ],
      overall: _num(g?['overall']),
      letter: g?['letter'] as String?,
      completion: comp == null ? null : LmsCompletion.fromJson(comp),
      certificate: j['certificate'] == true,
      prerequisites: [for (final p in (j['prerequisites'] as List? ?? const [])) '${(p as Map)['title']}'],
    );
  }

  /// A course from the offline bundle (no grade: the bundle keeps content and progress only).
  factory LmsCourseDetail.fromOffline(Map<String, dynamic> j) => LmsCourseDetail(
    title: j['title'] as String? ?? '',
    subject: j['subject'] as String? ?? '',
    description: '',
    modules: [for (final m in (j['modules'] as List? ?? const [])) LmsModule.fromJson((m as Map).cast<String, dynamic>())],
    announcements: [for (final a in (j['announcements'] as List? ?? const [])) '${(a as Map)['title']}'],
    parts: const [],
    completion: j['completion'] is Map ? LmsCompletion.fromJson((j['completion'] as Map).cast<String, dynamic>()) : null,
    offlineCopy: true,
  );

  final String title;
  final String subject;
  final String description;
  final List<LmsModule> modules;
  final List<String> announcements;
  final List<LmsGradePart> parts;
  final double? overall;
  final String? letter;
  final LmsCompletion? completion;
  final bool certificate;

  /// Courses to finish before this one opens.
  final List<String> prerequisites;

  /// Shown from the copy kept on the phone (no connection).
  final bool offlineCopy;
}

/// An upcoming live class of the student's courses (`GET /v1/lms/my-live`).
class LiveClassRow {
  const LiveClassRow({required this.id, required this.title, required this.course, required this.subject, required this.startsAt, required this.durationMin, required this.provider, this.joined = false, this.open = false});

  factory LiveClassRow.fromJson(Map<String, dynamic> j) => LiveClassRow(
    id: j['id'] as String,
    title: j['title'] as String? ?? '',
    course: j['course'] as String? ?? '',
    subject: j['subject'] as String? ?? '',
    startsAt: _time(j['startsAt']) ?? DateTime.now(),
    durationMin: _int(j['durationMin']),
    provider: j['provider'] as String? ?? 'other',
    joined: j['joined'] == true,
    open: j['open'] == true,
  );

  final String id;
  final String title;
  final String course;
  final String subject;
  final DateTime startsAt;
  final int durationMin;

  /// meet, zoom, teams, jitsi, webex or other.
  final String provider;
  final bool joined;

  /// Students may join from 15 minutes before the start.
  final bool open;
}

/// A completion certificate (`GET /v1/lms/my/certificates`).
class LmsCertificate {
  const LmsCertificate({required this.id, required this.title, required this.kind, required this.serial, required this.issuedAt, this.completedPct = 0, this.revoked = false, this.verifyUrl = ''});

  factory LmsCertificate.fromJson(Map<String, dynamic> j) => LmsCertificate(
    id: j['id'] as String,
    title: j['title'] as String? ?? '',
    kind: j['kind'] as String? ?? 'course',
    serial: j['serial'] as String? ?? '',
    issuedAt: _time(j['issuedAt']) ?? DateTime.now(),
    completedPct: _int(j['completedPct']),
    revoked: j['revokedAt'] != null,
    verifyUrl: j['verifyUrl'] as String? ?? '',
  );

  final String id;
  final String title;

  /// course or path.
  final String kind;
  final String serial;
  final DateTime issuedAt;
  final int completedPct;
  final bool revoked;
  final String verifyUrl;
}

/// A learning path with the student's progress (`GET /v1/lms/my/paths`).
class LearningPathRow {
  const LearningPathRow({required this.id, required this.title, required this.pct, required this.complete, required this.steps, this.certificate = false, this.certificateIssued = false});

  factory LearningPathRow.fromJson(Map<String, dynamic> j) => LearningPathRow(
    id: j['id'] as String,
    title: j['title'] as String? ?? '',
    pct: _int(j['pct']),
    complete: j['complete'] == true,
    certificate: j['certificate'] == true,
    certificateIssued: j['certificateIssued'] != null,
    steps: [
      for (final s in (j['steps'] as List? ?? const []))
        (title: '${(s as Map)['title']}', required: s['required'] == true, done: ((s['completion'] as Map?)?['eligible']) == true),
    ],
  );

  final String id;
  final String title;
  final int pct;
  final bool complete;
  final bool certificate;
  final bool certificateIssued;
  final List<({String title, bool required, bool done})> steps;
}
