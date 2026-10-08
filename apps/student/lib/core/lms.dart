// LMS courses (GET /v1/lms/my, GET /v1/lms/courses/:id): what the student sees of a course shell and their running grade.

double? _num(Object? v) => (v as num?)?.toDouble();

class LmsCourseSummary {
  const LmsCourseSummary({required this.courseId, required this.title, required this.subject, required this.moduleCount, this.overall, this.letter});

  factory LmsCourseSummary.fromJson(Map<String, dynamic> j) => LmsCourseSummary(
    courseId: j['courseId'] as String,
    title: j['title'] as String,
    subject: j['subject'] as String? ?? '',
    moduleCount: (j['moduleCount'] as num?)?.toInt() ?? 0,
    overall: _num(j['overall']),
    letter: j['letter'] as String?,
  );

  final String courseId;
  final String title;
  final String subject;
  final int moduleCount;

  /// The running grade as a percentage; null until something is graded.
  final double? overall;
  final String? letter;
}

class LmsItem {
  const LmsItem({required this.kind, required this.title, this.url});

  factory LmsItem.fromJson(Map<String, dynamic> j) => LmsItem(kind: j['kind'] as String, title: j['title'] as String, url: j['url'] as String?);

  /// topic, video, homework, assessment, file or link.
  final String kind;
  final String title;
  final String? url;
}

class LmsModule {
  const LmsModule({required this.title, required this.items});

  factory LmsModule.fromJson(Map<String, dynamic> j) => LmsModule(title: j['title'] as String, items: [for (final i in (j['items'] as List? ?? const [])) LmsItem.fromJson((i as Map).cast<String, dynamic>())]);

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

class LmsCourseDetail {
  const LmsCourseDetail({required this.title, required this.subject, required this.description, required this.modules, required this.announcements, required this.parts, this.overall, this.letter});

  factory LmsCourseDetail.fromJson(Map<String, dynamic> j) {
    final g = (j['grade'] as Map?)?.cast<String, dynamic>();
    final cats = [for (final c in (g?['categories'] as List? ?? const [])) (c as Map).cast<String, dynamic>()];
    final cells = [for (final c in (g?['cells'] as List? ?? const [])) (c as Map).cast<String, dynamic>()];
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
    );
  }

  final String title;
  final String subject;
  final String description;
  final List<LmsModule> modules;
  final List<String> announcements;
  final List<LmsGradePart> parts;
  final double? overall;
  final String? letter;
}
