/// Contracts of the class insights and AI copilot endpoints
/// (`GET /v1/mentoring/sections/:id/insights`, `POST /v1/ai/*`).
library;

/// One student's attendance, marks and risk flag.
class StudentInsight {
  const StudentInsight({required this.studentId, required this.studentName, required this.rollNo, required this.level, required this.failingMarks, this.attendancePct, this.marksAvgPct});

  factory StudentInsight.fromJson(Map<String, dynamic> j) => StudentInsight(
    studentId: j['studentId'] as String,
    studentName: j['studentName'] as String,
    rollNo: '${j['rollNo'] ?? ''}',
    level: j['level'] as String? ?? 'none',
    failingMarks: (j['failingMarks'] as num?)?.toInt() ?? 0,
    attendancePct: (j['attendancePct'] as num?)?.toInt(),
    marksAvgPct: (j['marksAvgPct'] as num?)?.toInt(),
  );

  final String studentId, studentName, rollNo;

  /// none, low, medium or high.
  final String level;
  final int failingMarks;
  final int? attendancePct;
  final int? marksAvgPct;

  bool get flagged => level != 'none';
}

/// A class at a glance.
class SectionInsights {
  const SectionInsights({required this.students, this.classAttendancePct, this.classMarksAvgPct});

  factory SectionInsights.fromJson(Map<String, dynamic> j) => SectionInsights(
    students: [for (final s in (j['students'] as List? ?? const [])) StudentInsight.fromJson((s as Map).cast<String, dynamic>())],
    classAttendancePct: (j['classAttendancePct'] as num?)?.toInt(),
    classMarksAvgPct: (j['classMarksAvgPct'] as num?)?.toInt(),
  );

  final List<StudentInsight> students;
  final int? classAttendancePct;
  final int? classMarksAvgPct;

  static const _order = {'high': 0, 'medium': 1, 'low': 2, 'none': 3};

  /// Students who need attention first.
  List<StudentInsight> get byRisk => [...students]..sort((a, b) => (_order[a.level] ?? 3).compareTo(_order[b.level] ?? 3));

  int get flaggedCount => students.where((s) => s.flagged).length;
}

/// The AI tasks the copilot offers.
enum AiTask {
  explain('explain'),
  quiz('quiz'),
  homework('homework'),
  lessonPlan('lesson-plan');

  const AiTask(this.path);

  /// The path under `/v1/ai/`.
  final String path;
}

/// A generated draft: titled sections of text, in reading order. Always a draft for the teacher
/// to check; [sample] is true when the server has no AI model connected and sent a placeholder.
class AiDraft {
  const AiDraft({required this.sections, required this.sample});

  factory AiDraft.fromJson(AiTask task, Map<String, dynamic> j) {
    final r = (j['result'] as Map?)?.cast<String, dynamic>() ?? const {};
    final meta = (j['meta'] as Map?)?.cast<String, dynamic>() ?? const {};
    List<String> strings(Object? v) => [for (final e in (v as List? ?? const [])) '$e'];
    final out = <AiSection>[];
    switch (task) {
      case AiTask.explain:
        out.add(AiSection('', ['${r['answer'] ?? ''}']));
        out.add(AiSection('keyPoints', strings(r['keyPoints'])));
        out.add(AiSection('followUps', strings(r['followUps'])));
      case AiTask.quiz:
        final qs = [for (final q in (r['questions'] as List? ?? const [])) (q as Map).cast<String, dynamic>()];
        for (var i = 0; i < qs.length; i++) {
          final q = qs[i];
          final options = strings(q['options']);
          final answer = (q['answer'] as num?)?.toInt() ?? -1;
          out.add(AiSection('', ['${i + 1}. ${q['question']}', for (var o = 0; o < options.length; o++) '${String.fromCharCode(65 + o)}. ${options[o]}${o == answer ? '  ✓' : ''}', if ('${q['explanation'] ?? ''}'.isNotEmpty) '${q['explanation']}']));
        }
      case AiTask.homework:
        out.add(AiSection('', ['${r['title'] ?? ''}', '${r['instructions'] ?? ''}']));
        final qs = [for (final q in (r['questions'] as List? ?? const [])) (q as Map).cast<String, dynamic>()];
        out.add(AiSection('questions', [for (var i = 0; i < qs.length; i++) '${i + 1}. ${qs[i]['question']} [${qs[i]['marks']}]']));
      case AiTask.lessonPlan:
        out.add(AiSection('objectives', strings(r['objectives'])));
        final steps = [for (final s in (r['steps'] as List? ?? const [])) (s as Map).cast<String, dynamic>()];
        out.add(AiSection('steps', [for (final s in steps) '${s['minutes']} min · ${s['activity']}']));
        out.add(AiSection('materials', strings(r['materials'])));
        out.add(AiSection('assessment', ['${r['assessment'] ?? ''}']));
    }
    return AiDraft(sections: [for (final s in out) if (s.lines.any((l) => l.trim().isNotEmpty)) s], sample: meta['preview'] == true);
  }

  final List<AiSection> sections;
  final bool sample;

  /// Everything as plain text, to copy.
  String get plain => sections.map((s) => s.lines.join('\n')).join('\n\n');
}

/// A group of lines under a heading key ([heading] is empty for the main text).
class AiSection {
  const AiSection(this.heading, this.lines);

  /// `keyPoints`, `followUps`, `questions`, `objectives`, `steps`, `materials`, `assessment` or empty.
  final String heading;
  final List<String> lines;
}
