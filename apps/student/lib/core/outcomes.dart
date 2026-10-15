/// My course-outcome (CO) attainment (`GET /v1/obe/students/me/outcomes`): per course, each CO's internal (CIE),
/// end-semester (SEE) and overall percentage, whether I reached the course's threshold, and the class's level.
library;

double? _numOrNull(Object? v) => v == null ? null : (v is num ? v.toDouble() : double.tryParse('$v'));

class MyCo {
  const MyCo({
    required this.coId,
    required this.code,
    required this.statement,
    required this.target,
    this.bloomLevel,
    this.cie,
    this.see,
    this.overall,
    this.attained,
    this.classLevel,
  });

  factory MyCo.fromJson(Map<String, dynamic> j) => MyCo(
    coId: j['coId'] as String,
    code: '${j['code'] ?? ''}',
    statement: '${j['statement'] ?? ''}',
    bloomLevel: j['bloomLevel'] as String?,
    cie: _numOrNull(j['cie']),
    see: _numOrNull(j['see']),
    overall: _numOrNull(j['overall']),
    attained: j['attained'] as bool?,
    classLevel: _numOrNull(j['classLevel']),
    target: _numOrNull(j['target']) ?? 2,
  );

  final String coId, code, statement;
  final String? bloomLevel;
  final double? cie, see, overall, classLevel;

  /// Null until there are marks to judge by.
  final bool? attained;
  final double target;
}

class MyCourseOutcomes {
  const MyCourseOutcomes({required this.subjectId, required this.code, required this.name, required this.threshold, required this.cos});

  factory MyCourseOutcomes.fromJson(Map<String, dynamic> j) => MyCourseOutcomes(
    subjectId: j['subjectId'] as String,
    code: '${j['code'] ?? ''}',
    name: '${j['name'] ?? ''}',
    threshold: _numOrNull(j['threshold']) ?? 60,
    cos: [for (final c in (j['cos'] as List? ?? const [])) MyCo.fromJson((c as Map).cast<String, dynamic>())],
  );

  final String subjectId, code, name;

  /// The percentage of a CO's marks a student needs to have attained it.
  final double threshold;
  final List<MyCo> cos;

  int get attained => cos.where((c) => c.attained == true).length;
  int get measured => cos.where((c) => c.attained != null).length;
}

class MyOutcomes {
  const MyOutcomes({required this.courses});

  factory MyOutcomes.fromJson(Map<String, dynamic> j) => MyOutcomes(
    courses: [for (final c in (j['courses'] as List? ?? const [])) MyCourseOutcomes.fromJson((c as Map).cast<String, dynamic>())],
  );

  final List<MyCourseOutcomes> courses;
}

/// "72" or "72.5" for a percentage.
String pctText(double v) {
  final r = (v * 10).round() / 10;
  return r == r.roundToDouble() ? r.toStringAsFixed(0) : r.toStringAsFixed(1);
}
