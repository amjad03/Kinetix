/// Mirrors packages/shared/src/index.ts.
library;

class SessionContext {
  SessionContext({
    required this.sessionId,
    required this.expiresAt,
    required this.teacherId,
    required this.teacherName,
    required this.language,
    this.sectionName,
    this.subjectName,
    this.periodLabel,
  });

  factory SessionContext.fromJson(Map<String, dynamic> j) {
    final teacher = j['teacher'] as Map<String, dynamic>;
    final section = j['section'] as Map<String, dynamic>?;
    final subject = j['subject'] as Map<String, dynamic>?;
    final period = j['period'] as Map<String, dynamic>?;
    String hhmm(String t) => t.substring(0, 5);
    return SessionContext(
      sessionId: j['sessionId'] as String,
      expiresAt: DateTime.parse(j['expiresAt'] as String),
      teacherId: teacher['id'] as String,
      teacherName: teacher['fullName'] as String,
      language: teacher['preferredLanguage'] as String,
      sectionName: section?['displayName'] as String?,
      subjectName: subject?['name'] as String?,
      periodLabel: period == null ? null : '${hhmm(period['startsAt'] as String)}–${hhmm(period['endsAt'] as String)}',
    );
  }

  final String sessionId;
  final DateTime expiresAt;
  final String teacherId;
  final String teacherName;
  final String language;
  final String? sectionName;
  final String? subjectName;
  final String? periodLabel;

  /// "BCom Sem 3 A · Corporate Accounting", or null for a session with no timetabled class.
  String? get classLabel {
    final label = [sectionName, subjectName].whereType<String>().join(' · ');
    return label.isEmpty ? null : label;
  }
}

class Student {
  Student({required this.id, required this.rollNo, required this.fullName});

  factory Student.fromJson(Map<String, dynamic> j) =>
      Student(id: j['id'] as String, rollNo: j['rollNo'] as String, fullName: j['fullName'] as String);

  final String id;
  final String rollNo;
  final String fullName;
}

enum AttendanceMark { present, absent, late }

enum AnswerOutcome { correct, partial, incorrect, skipped }

enum BroadcastPriority { info, important, emergency }

class BroadcastMessage {
  BroadcastMessage({
    required this.id,
    required this.title,
    required this.body,
    required this.priority,
    required this.requiresAck,
    required this.senderName,
    required this.expiresAt,
  });

  factory BroadcastMessage.fromJson(Map<String, dynamic> j) => BroadcastMessage(
    id: j['id'] as String,
    title: j['title'] as String,
    body: j['body'] as String,
    priority: BroadcastPriority.values.byName(j['priority'] as String),
    requiresAck: j['requiresAck'] as bool,
    senderName: (j['sender'] as Map<String, dynamic>)['fullName'] as String,
    expiresAt: DateTime.parse(j['expiresAt'] as String),
  );

  final String id;
  final String title;
  final String body;
  final BroadcastPriority priority;
  final bool requiresAck;
  final String senderName;
  final DateTime expiresAt;
}

class PairingCode {
  PairingCode({required this.code, required this.qrPayload, required this.expiresAt});

  factory PairingCode.fromJson(Map<String, dynamic> j) =>
      PairingCode(code: j['code'] as String, qrPayload: j['qrPayload'] as String, expiresAt: DateTime.parse(j['expiresAt'] as String));

  final String code;
  final String qrPayload;
  final DateTime expiresAt;

  /// "482913" → "482 913", easier to read from the back of the room.
  String get display => '${code.substring(0, 3)} ${code.substring(3)}';
}

/// A saved board as listed by `GET /v1/whiteboards`.
class WhiteboardSummary {
  WhiteboardSummary({
    required this.id,
    required this.title,
    required this.pageCount,
    required this.updatedAt,
    this.sectionName,
    this.subjectName,
    this.sharedAt,
  });

  factory WhiteboardSummary.fromJson(Map<String, dynamic> j) => WhiteboardSummary(
    id: j['id'] as String,
    title: j['title'] as String,
    pageCount: j['pageCount'] as int,
    updatedAt: DateTime.parse(j['updatedAt'] as String),
    sectionName: j['sectionName'] as String?,
    subjectName: j['subjectName'] as String?,
    sharedAt: j['sharedAt'] == null ? null : DateTime.parse(j['sharedAt'] as String),
  );

  final String id;
  final String title;
  final int pageCount;
  final DateTime updatedAt;
  final String? sectionName;
  final String? subjectName;
  final DateTime? sharedAt;

  bool get shared => sharedAt != null;
}

// --- KINETIX AI ------------------------------------------------------------------------------

/// Languages KINETIX AI writes in. The label is in the language itself.
enum AiLanguage {
  en('English', 'EN'),
  hi('हिन्दी', 'हि'),
  kn('ಕನ್ನಡ', 'ಕ');

  const AiLanguage(this.label, this.short);
  final String label;

  /// For narrow panels.
  final String short;

  static AiLanguage fromCode(String? code) => values.asNameMap()[code] ?? en;
}

/// How hard AI questions are (names are in the board's strings).
enum AiDifficulty { easy, medium, hard }

/// How an AI answer was produced. [preview] means no AI server is connected and the
/// result is a fixed placeholder that must be labelled as such.
class AiMeta {
  AiMeta({required this.cached, required this.preview, this.sources = const []});

  factory AiMeta.fromJson(Map<String, dynamic> j) => AiMeta(
        cached: j['cached'] as bool? ?? false,
        preview: j['preview'] as bool? ?? false,
        sources: [
          for (final s in (j['sources'] as List<dynamic>? ?? const []))
            (topicId: (s as Map)['topicId'] as String, title: s['title'] as String),
        ],
      );

  final bool cached;
  final bool preview;

  /// Syllabus topics the answer was grounded in.
  final List<({String topicId, String title})> sources;
}

// --- Content library ------------------------------------------------------------------------

class SyllabusTopic {
  SyllabusTopic({required this.id, required this.title, required this.summary, required this.own});
  factory SyllabusTopic.fromJson(Map<String, dynamic> j) =>
      SyllabusTopic(id: j['id'] as String, title: j['title'] as String, summary: j['summary'] as String? ?? '', own: j['own'] as bool? ?? false);
  final String id;
  final String title;
  final String summary;

  /// Added by the institution rather than the KINETIX library.
  final bool own;
}

class SyllabusChapter {
  SyllabusChapter({required this.id, required this.title, required this.own, required this.topics});
  factory SyllabusChapter.fromJson(Map<String, dynamic> j) => SyllabusChapter(
        id: j['id'] as String,
        title: j['title'] as String,
        own: j['own'] as bool? ?? false,
        topics: [for (final t in (j['topics'] as List<dynamic>? ?? const [])) SyllabusTopic.fromJson(t as Map<String, dynamic>)],
      );
  final String id;
  final String title;
  final bool own;
  final List<SyllabusTopic> topics;
}

/// The course the open class follows, from the content library.
class Syllabus {
  Syllabus({required this.id, required this.title, required this.reviewed, required this.chapters});
  factory Syllabus.fromJson(Map<String, dynamic> j) => Syllabus(
        id: j['id'] as String,
        title: j['title'] as String,
        reviewed: j['reviewed'] as bool? ?? false,
        chapters: [for (final c in (j['chapters'] as List<dynamic>? ?? const [])) SyllabusChapter.fromJson(c as Map<String, dynamic>)],
      );
  final String id;
  final String title;
  final bool reviewed;
  final List<SyllabusChapter> chapters;
}

/// When and by whom a topic was taught to the open class.
class TopicCoverage {
  TopicCoverage({required this.coveredOn, required this.coveredBy});
  factory TopicCoverage.fromJson(Map<String, dynamic> j) =>
      TopicCoverage(coveredOn: DateTime.parse(j['coveredOn'] as String), coveredBy: j['coveredBy'] as String? ?? '');
  final DateTime coveredOn;
  final String coveredBy;
}

/// How much of the syllabus the open class has been taught (GET /v1/coverage).
class Coverage {
  Coverage({required this.total, required this.topics});
  factory Coverage.fromJson(Map<String, dynamic> j) => Coverage(
        total: j['total'] as int? ?? 0,
        topics: {
          for (final t in (j['topics'] as List<dynamic>? ?? const []).cast<Map<String, dynamic>>())
            t['topicId'] as String: TopicCoverage.fromJson(t),
        },
      );
  final int total;

  /// Taught topics by id.
  final Map<String, TopicCoverage> topics;

  int get covered => topics.length;
}

/// A 3D model or lab the content library links to a topic (catalogue ids in kinetix_3d/labs).
class TopicResource {
  TopicResource({required this.kind, required this.id, required this.title});
  factory TopicResource.fromJson(Map<String, dynamic> j) => TopicResource(kind: j['kind'] as String, id: j['id'] as String, title: j['title'] as String);
  final String kind; // 'model3d' | 'lab'
  final String id;
  final String title;
}

class TopicDetail {
  TopicDetail({
    this.resources = const [],
    required this.id,
    required this.title,
    required this.summary,
    required this.notes,
    required this.outcomes,
    required this.chapterTitle,
    required this.reviewed,
  });
  factory TopicDetail.fromJson(Map<String, dynamic> j) => TopicDetail(
        id: j['id'] as String,
        title: j['title'] as String,
        summary: j['summary'] as String? ?? '',
        notes: (j['notes'] as List<dynamic>? ?? const []).cast<String>(),
        outcomes: (j['outcomes'] as List<dynamic>? ?? const []).cast<String>(),
        chapterTitle: ((j['chapter'] as Map?)?['title'] as String?) ?? '',
        reviewed: ((j['course'] as Map?)?['reviewed'] as bool?) ?? false,
        resources: [for (final r in (j['resources'] as List<dynamic>? ?? const [])) TopicResource.fromJson(r as Map<String, dynamic>)],
      );
  final String id;
  final String title;
  final String summary;
  final List<String> notes;
  final List<String> outcomes;
  final String chapterTitle;
  final bool reviewed;

  /// 3D models and labs to open on the board for this topic.
  final List<TopicResource> resources;
}

/// A task result with its [meta].
class AiResult<T> {
  AiResult(this.result, this.meta);
  final T result;
  final AiMeta meta;
}

List<String> _strings(Object? v) => (v as List<dynamic>? ?? const []).cast<String>();

class Explanation {
  Explanation({required this.answer, required this.keyPoints, required this.followUps});

  factory Explanation.fromJson(Map<String, dynamic> j) =>
      Explanation(answer: j['answer'] as String, keyPoints: _strings(j['keyPoints']), followUps: _strings(j['followUps']));

  final String answer;
  final List<String> keyPoints;
  final List<String> followUps;
}

class QuizQuestion {
  QuizQuestion({required this.question, required this.options, required this.answer, required this.explanation});

  factory QuizQuestion.fromJson(Map<String, dynamic> j) => QuizQuestion(
    question: j['question'] as String,
    options: _strings(j['options']),
    answer: j['answer'] as int,
    explanation: j['explanation'] as String? ?? '',
  );

  final String question;

  /// Four options; [answer] is the index of the correct one.
  final List<String> options;
  final int answer;
  final String explanation;
}

class Quiz {
  Quiz({required this.topic, required this.questions});

  factory Quiz.fromJson(String topic, Map<String, dynamic> j) =>
      Quiz(topic: topic, questions: (j['questions'] as List<dynamic>).map((e) => QuizQuestion.fromJson(e as Map<String, dynamic>)).toList());

  final String topic;
  final List<QuizQuestion> questions;
}

class HomeworkQuestion {
  HomeworkQuestion({required this.question, required this.marks});

  factory HomeworkQuestion.fromJson(Map<String, dynamic> j) => HomeworkQuestion(question: j['question'] as String, marks: j['marks'] as int);

  String question;
  int marks;
}

/// A homework draft the teacher edits before sending.
class HomeworkDraft {
  HomeworkDraft({required this.title, required this.instructions, required this.questions});

  factory HomeworkDraft.fromJson(Map<String, dynamic> j) => HomeworkDraft(
    title: j['title'] as String,
    instructions: j['instructions'] as String? ?? '',
    questions: (j['questions'] as List<dynamic>).map((e) => HomeworkQuestion.fromJson(e as Map<String, dynamic>)).toList(),
  );

  String title;
  String instructions;
  final List<HomeworkQuestion> questions;

  int get totalMarks => questions.fold(0, (s, q) => s + q.marks);
}

class LessonStep {
  LessonStep({required this.minutes, required this.activity});
  final int minutes;
  final String activity;
}

/// What KINETIX AI read on a board page.
class BoardReading {
  BoardReading({required this.text, required this.math});
  factory BoardReading.fromJson(Map<String, dynamic> j) =>
      BoardReading(text: j['text'] as String? ?? '', math: (j['math'] as List<dynamic>? ?? const []).cast<String>());
  final String text;

  /// Mathematics found, as LaTeX.
  final List<String> math;
}

class LessonPlan {
  LessonPlan({required this.objectives, required this.steps, required this.materials, required this.assessment});

  factory LessonPlan.fromJson(Map<String, dynamic> j) => LessonPlan(
    objectives: _strings(j['objectives']),
    steps: (j['steps'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map((s) => LessonStep(minutes: s['minutes'] as int, activity: s['activity'] as String))
        .toList(),
    materials: _strings(j['materials']),
    assessment: j['assessment'] as String? ?? '',
  );

  final List<String> objectives;
  final List<LessonStep> steps;
  final List<String> materials;
  final String assessment;
}
