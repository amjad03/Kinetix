/// Projects, portfolio and thesis, career preparation (resume, aptitude tests, mock interviews,
/// recommendations, the career assistant), as the Cloud API sends them (services/api src/projects,
/// careers and research).
library;

String _s(Object? v) => v == null ? '' : '$v';
num _n(Object? v) => v is num ? v : num.tryParse('$v') ?? 0;
double? _dn(Object? v) => v == null ? null : _n(v).toDouble();
DateTime? _at(Object? v) => v == null ? null : DateTime.tryParse('$v')?.toLocal();
List<String> _strings(Object? v) => [for (final s in (v as List? ?? const [])) '$s'];
List<T> _list<T>(Object? v, T Function(Map<String, dynamic>) f) => [for (final x in (v as List? ?? const [])) f((x as Map).cast<String, dynamic>())];

// ── Projects ────────────────────────────────────────────────────────────────────────────────────

/// A project the student takes part in (`GET /v1/projects/mine`).
class ProjectSummary {
  const ProjectSummary({required this.id, required this.code, required this.title, required this.kind, required this.status, required this.showcase, required this.recruiting});

  factory ProjectSummary.fromJson(Map<String, dynamic> j) => ProjectSummary(
    id: _s(j['id']),
    code: _s(j['code']),
    title: _s(j['title']),
    kind: _s(j['kind']),
    status: _s(j['status']),
    showcase: j['showcase'] as bool? ?? false,
    recruiting: j['recruiting'] as bool? ?? false,
  );

  final String id, code, title, kind, status;
  final bool showcase, recruiting;
}

class ProjectMilestone {
  const ProjectMilestone({required this.id, required this.title, this.dueOn, this.completedOn});

  factory ProjectMilestone.fromJson(Map<String, dynamic> j) => ProjectMilestone(id: _s(j['id']), title: _s(j['title']), dueOn: _at(j['dueOn']), completedOn: _at(j['completedOn']));

  final String id, title;
  final DateTime? dueOn, completedOn;

  bool get done => completedOn != null;
}

class ProjectFile {
  const ProjectFile({required this.id, required this.title, required this.kind, this.url, this.sizeBytes});

  factory ProjectFile.fromJson(Map<String, dynamic> j) =>
      ProjectFile(id: _s(j['id']), title: _s(j['title']), kind: _s(j['kind']), url: j['url'] as String?, sizeBytes: (j['sizeBytes'] as num?)?.toInt());

  final String id, title, kind;
  final String? url;
  final int? sizeBytes;
}

class ProjectViva {
  const ProjectViva({required this.id, this.scheduledAt, required this.venue, required this.panel, required this.status, this.outcome, this.score, this.remarks});

  factory ProjectViva.fromJson(Map<String, dynamic> j) => ProjectViva(
    id: _s(j['id']),
    scheduledAt: _at(j['scheduledAt']),
    venue: _s(j['venue']),
    panel: _list(j['panel'], (p) => _s(p['name'])),
    status: j['status'] as String? ?? 'scheduled',
    outcome: j['outcome'] as String?,
    score: _dn(j['score']),
    remarks: j['remarks'] as String?,
  );

  final String id, venue;
  final DateTime? scheduledAt;
  final List<String> panel;

  /// `scheduled`, `held` or `cancelled`.
  final String status;

  /// `pass`, `revise` or `fail` once held.
  final String? outcome, remarks;
  final double? score;
}

/// A project's workspace for a team member (`GET /v1/projects/:id/workspace`).
class ProjectWorkspace {
  const ProjectWorkspace({
    required this.id,
    required this.code,
    required this.title,
    required this.kind,
    required this.status,
    required this.outcomeSummary,
    required this.pi,
    this.myRole,
    required this.members,
    required this.milestones,
    required this.files,
    required this.hubSummary,
    required this.recruiting,
    required this.showcase,
    required this.lookingFor,
    required this.vivas,
    required this.reviewCount,
    this.reviewAverage,
  });

  factory ProjectWorkspace.fromJson(Map<String, dynamic> j) {
    final p = (j['project'] as Map).cast<String, dynamic>();
    final hub = (j['hub'] as Map?)?.cast<String, dynamic>() ?? const {};
    final rv = (j['reviews'] as Map?)?.cast<String, dynamic>() ?? const {};
    return ProjectWorkspace(
      id: _s(p['id']),
      code: _s(p['code']),
      title: _s(p['title']),
      kind: _s(p['kind']),
      status: _s(p['status']),
      outcomeSummary: _s(p['outcomeSummary']),
      pi: _s(p['pi']),
      myRole: j['myRole'] as String?,
      members: _list(j['members'], (m) => (name: _s(m['name']), role: _s(m['role']))),
      milestones: _list(j['milestones'], ProjectMilestone.fromJson),
      files: _list(j['files'], ProjectFile.fromJson),
      hubSummary: _s(hub['summary']),
      recruiting: hub['recruiting'] as bool? ?? false,
      showcase: hub['showcase'] as bool? ?? false,
      lookingFor: _strings(hub['lookingFor']),
      vivas: _list(j['vivas'], ProjectViva.fromJson),
      reviewCount: _n(rv['count']).toInt(),
      reviewAverage: _dn(rv['average']),
    );
  }

  final String id, code, title, kind, status, outcomeSummary, pi, hubSummary;
  final String? myRole;
  final List<({String name, String role})> members;
  final List<ProjectMilestone> milestones;
  final List<ProjectFile> files;
  final bool recruiting, showcase;
  final List<String> lookingFor;
  final List<ProjectViva> vivas;
  final int reviewCount;
  final double? reviewAverage;
}

class ProjectComment {
  const ProjectComment({required this.id, this.parentId, required this.body, required this.author, this.createdAt});

  factory ProjectComment.fromJson(Map<String, dynamic> j) =>
      ProjectComment(id: _s(j['id']), parentId: j['parentId'] as String?, body: _s(j['body']), author: _s(j['author']), createdAt: _at(j['createdAt']));

  final String id, body, author;
  final String? parentId;
  final DateTime? createdAt;
}

/// A rubric review of a project (`GET /v1/projects/:id/reviews`); peer reviewers stay anonymous.
class ProjectReview {
  const ProjectReview({required this.id, required this.kind, required this.rubric, required this.maxPerCriterion, required this.percent, required this.comment, required this.reviewer});

  factory ProjectReview.fromJson(Map<String, dynamic> j) => ProjectReview(
    id: _s(j['id']),
    kind: _s(j['kind']),
    rubric: {for (final e in ((j['rubric'] as Map?) ?? const {}).entries) '${e.key}': _n(e.value)},
    maxPerCriterion: _n(j['maxPerCriterion']).toInt() == 0 ? 5 : _n(j['maxPerCriterion']).toInt(),
    percent: _n(j['percent']).toDouble(),
    comment: _s(j['comment']),
    reviewer: _s(j['reviewer']),
  );

  final String id, kind, comment, reviewer;
  final Map<String, num> rubric;
  final int maxPerCriterion;
  final double percent;
}

/// A project that is recruiting (`GET /v1/projects/discover`), with how well my skills fit.
class DiscoverProject {
  const DiscoverProject({required this.id, required this.title, required this.kind, required this.pi, required this.summary, required this.lookingFor, required this.openings, required this.matched, required this.fit});

  factory DiscoverProject.fromJson(Map<String, dynamic> j) => DiscoverProject(
    id: _s(j['id']),
    title: _s(j['title']),
    kind: _s(j['kind']),
    pi: _s(j['pi']),
    summary: _s(j['summary']),
    lookingFor: _strings(j['lookingFor']),
    openings: _n(j['openings']).toInt(),
    matched: _strings(j['matched']),
    fit: _n(j['fit']).toInt(),
  );

  final String id, title, kind, pi, summary;
  final List<String> lookingFor, matched;
  final int openings, fit;
}

/// A project on the showcase (`GET /v1/projects/showcase`).
class ShowcaseProject {
  const ShowcaseProject({required this.id, required this.title, required this.kind, required this.pi, required this.summary, required this.outcomeSummary, this.reviewAverage});

  factory ShowcaseProject.fromJson(Map<String, dynamic> j) => ShowcaseProject(
    id: _s(j['id']),
    title: _s(j['title']),
    kind: _s(j['kind']),
    pi: _s(j['pi']),
    summary: _s(j['summary']),
    outcomeSummary: _s(j['outcomeSummary']),
    reviewAverage: _dn(j['reviewAverage']),
  );

  final String id, title, kind, pi, summary, outcomeSummary;
  final double? reviewAverage;
}

/// The criteria a peer review scores, and the best score for each. The names are what the server stores.
const peerCriteria = ['Idea', 'Execution', 'Presentation', 'Impact'];
const peerMaxScore = 5;

class PortfolioItem {
  const PortfolioItem({required this.id, required this.title, required this.summary, this.url, required this.kind, required this.published, this.projectId});

  factory PortfolioItem.fromJson(Map<String, dynamic> j) => PortfolioItem(
    id: _s(j['id']),
    title: _s(j['title']),
    summary: _s(j['summary']),
    url: j['url'] as String?,
    kind: j['kind'] as String? ?? 'project',
    published: j['published'] as bool? ?? false,
    projectId: j['projectId'] as String?,
  );

  final String id, title, summary, kind;
  final String? url, projectId;
  final bool published;
}

/// A research scholar's thesis and where it stands (`GET /v1/research/theses/mine`).
class Thesis {
  const Thesis({required this.id, required this.title, required this.stage, required this.abstract, this.submittedOn, required this.vivas, this.similarityPercent, required this.similarityLimit, required this.programme});

  /// Null when the student has no thesis (the server answers `{id: null}`).
  static Thesis? fromJson(Map<String, dynamic> j) {
    if (j['id'] == null) return null;
    final sim = j['similarity'] as Map?;
    return Thesis(
      id: _s(j['id']),
      title: _s(j['title']),
      stage: _s(j['stage']),
      abstract: _s(j['abstract']),
      submittedOn: _at(j['submittedOn']),
      vivas: _list(j['vivas'], (v) => (kind: _s(v['kind']), at: _at(v['scheduledAt']), venue: _s(v['venue']), status: _s(v['status']), outcome: v['outcome'] as String?)),
      similarityPercent: sim == null ? null : _dn(sim['scorePercent']),
      similarityLimit: _dn(j['similarityLimitPercent']),
      programme: _s((j['scholar'] as Map?)?['programme']),
    );
  }

  final String id, title, abstract, programme;

  /// `synopsis`, `draft`, `submitted`, `examination`, `viva` or `awarded`.
  final String stage;
  final DateTime? submittedOn;
  final List<({String kind, DateTime? at, String venue, String status, String? outcome})> vivas;
  final double? similarityPercent, similarityLimit;
}

// ── Career preparation ──────────────────────────────────────────────────────────────────────────

/// The student's resume (`GET/PUT /v1/careers/resume`). Entries are maps of text so the editor can
/// treat the four lists alike: education (institution, degree, years, score), experience (org, role,
/// years, detail), projects (title, detail, url) and links (label, url).
class Resume {
  Resume({
    this.headline = '',
    this.summary = '',
    List<Map<String, String>>? education,
    List<Map<String, String>>? experience,
    List<Map<String, String>>? projects,
    List<String>? skills,
    List<String>? interests,
    List<Map<String, String>>? links,
    this.visibleToRecruiters = true,
  }) : education = education ?? [],
       experience = experience ?? [],
       projects = projects ?? [],
       skills = skills ?? [],
       interests = interests ?? [],
       links = links ?? [];

  factory Resume.fromJson(Map<String, dynamic> j) {
    List<Map<String, String>> maps(Object? v) => [
      for (final e in (v as List? ?? const [])) {for (final x in (e as Map).entries) if (x.value != null) '${x.key}': '${x.value}'},
    ];
    return Resume(
      headline: _s(j['headline']),
      summary: _s(j['summary']),
      education: maps(j['education']),
      experience: maps(j['experience']),
      projects: maps(j['projects']),
      skills: _strings(j['skills']),
      interests: _strings(j['interests']),
      links: maps(j['links']),
      visibleToRecruiters: j['visibleToRecruiters'] as bool? ?? true,
    );
  }

  String headline, summary;
  final List<Map<String, String>> education, experience, projects, links;
  final List<String> skills, interests;
  bool visibleToRecruiters;

  /// The body of `PUT /v1/careers/resume`: empty optional fields are left out (a link must be a valid URL).
  Map<String, dynamic> toJson() {
    List<Map<String, String>> clean(List<Map<String, String>> l) => [
      for (final e in l) {for (final x in e.entries) if (x.value.trim().isNotEmpty) x.key: x.value.trim()},
    ];
    return {
      'headline': headline.trim(),
      'summary': summary.trim(),
      'education': clean(education),
      'experience': clean(experience),
      'projects': clean(projects),
      'skills': skills,
      'interests': interests,
      'links': clean(links),
      'visibleToRecruiters': visibleToRecruiters,
    };
  }

  /// Splits "Python, SQL ,  Excel" into trimmed, non-empty words.
  static List<String> words(String text) => [for (final w in text.split(RegExp('[,\n]'))) if (w.trim().isNotEmpty) w.trim()];
}

/// An aptitude test (`GET /v1/careers/tests`) with the student's attempts.
class AptitudeTest {
  const AptitudeTest({required this.id, required this.title, required this.category, required this.durationMin, required this.passPercent, required this.questionCount, required this.attempts, required this.best, required this.passed});

  factory AptitudeTest.fromJson(Map<String, dynamic> j) => AptitudeTest(
    id: _s(j['id']),
    title: _s(j['title']),
    category: _s(j['category']),
    durationMin: _n(j['durationMin']).toInt(),
    passPercent: _n(j['passPercent']).toInt(),
    questionCount: _n(j['questionCount']).toInt(),
    attempts: _n(j['attempts']).toInt(),
    best: _n(j['best']).toDouble(),
    passed: j['passed'] as bool? ?? false,
  );

  final String id, title, category;
  final int durationMin, passPercent, questionCount, attempts;
  final double best;
  final bool passed;
}

class AptitudeQuestion {
  const AptitudeQuestion({required this.prompt, required this.options, required this.topic});

  factory AptitudeQuestion.fromJson(Map<String, dynamic> j) => AptitudeQuestion(prompt: _s(j['prompt']), options: _strings(j['options']), topic: _s(j['topic']));

  final String prompt, topic;
  final List<String> options;
}

/// An attempt that has been started (`POST /v1/careers/tests/:id/start`): questions without answers.
class AptitudeAttempt {
  const AptitudeAttempt({required this.attemptId, required this.durationMin, required this.startedAt, required this.questions});

  factory AptitudeAttempt.fromJson(Map<String, dynamic> j) =>
      AptitudeAttempt(attemptId: _s(j['attemptId']), durationMin: _n(j['durationMin']).toInt(), startedAt: _at(j['startedAt']) ?? DateTime.now(), questions: _list(j['questions'], AptitudeQuestion.fromJson));

  final String attemptId;
  final int durationMin;
  final DateTime startedAt;
  final List<AptitudeQuestion> questions;

  /// When the time runs out, counted from the start the server recorded.
  DateTime get endsAt => startedAt.add(Duration(minutes: durationMin));
}

/// The result of a submitted attempt (`POST /v1/careers/attempts/:id/submit`).
class AptitudeResult {
  const AptitudeResult({required this.score, required this.total, required this.percent, required this.passed, required this.passPercent, required this.topics});

  factory AptitudeResult.fromJson(Map<String, dynamic> j) => AptitudeResult(
    score: _n(j['score']).toInt(),
    total: _n(j['total']).toInt(),
    percent: _n(j['percent']).toDouble(),
    passed: j['passed'] as bool? ?? false,
    passPercent: _n(j['passPercent']).toInt(),
    topics: [
      for (final e in ((j['topicScores'] as Map?) ?? const {}).entries) (topic: '${e.key}', right: _n((e.value as Map)['right']).toInt(), total: _n((e.value as Map)['total']).toInt()),
    ],
  );

  final int score, total, passPercent;
  final double percent;
  final bool passed;
  final List<({String topic, int right, int total})> topics;
}

/// A career path with how well the student fits it (`GET /v1/careers/recommendations`).
class PathFit {
  const PathFit({required this.pathId, required this.title, required this.family, required this.fit, required this.matched, required this.gaps, required this.interestMatch});

  factory PathFit.fromJson(Map<String, dynamic> j) => PathFit(
    pathId: _s(j['pathId']),
    title: _s(j['title']),
    family: _s(j['family']),
    fit: _n(j['fit']).toDouble(),
    matched: _strings(j['matched']),
    gaps: _strings(j['gaps']),
    interestMatch: j['interestMatch'] as bool? ?? false,
  );

  final String pathId, title, family;
  final double fit;
  final List<String> matched, gaps;
  final bool interestMatch;
}

class CareerPath {
  const CareerPath({required this.id, required this.title, required this.description, required this.roles, required this.steps});

  factory CareerPath.fromJson(Map<String, dynamic> j) =>
      CareerPath(id: _s(j['id']), title: _s(j['title']), description: _s(j['description']), roles: _strings(j['roles']), steps: _list(j['steps'], (s) => (title: _s(s['title']), detail: _s(s['detail']))));

  final String id, title, description;
  final List<String> roles;
  final List<({String title, String detail})> steps;
}

class CareerRecommendations {
  const CareerRecommendations({required this.skills, required this.interests, required this.paths, this.catalog = const []});

  factory CareerRecommendations.fromJson(Map<String, dynamic> j) =>
      CareerRecommendations(skills: _strings(j['skills']), interests: _strings(j['interests']), paths: _list(j['paths'], PathFit.fromJson));

  final List<String> skills, interests;
  final List<PathFit> paths;

  /// The paths with their steps (`GET /v1/careers/paths`), to show how to get there.
  final List<CareerPath> catalog;

  CareerRecommendations withCatalog(List<CareerPath> c) => CareerRecommendations(skills: skills, interests: interests, paths: paths, catalog: c);

  CareerPath? pathOf(String id) => catalog.where((p) => p.id == id).firstOrNull;
}

/// A mock interview or communication practice that has been started: the questions to answer.
class MockInterview {
  const MockInterview({required this.id, required this.kind, required this.questions});

  factory MockInterview.fromJson(Map<String, dynamic> j) => MockInterview(id: _s(j['id']), kind: _s(j['kind']), questions: _strings(j['questions']));

  final String id, kind;
  final List<String> questions;
}

/// The scored practice (`POST /v1/careers/mock-interviews/:id/submit`).
class MockResult {
  const MockResult({required this.id, required this.score, required this.questions, required this.perQuestion, required this.overall});

  factory MockResult.fromJson(Map<String, dynamic> j) => MockResult(
    id: _s(j['id']),
    score: _n(j['score']).toDouble(),
    questions: _strings(j['questions']),
    perQuestion: _list(j['perQuestion'], (q) => (score: _n(q['score']).toDouble(), notes: _strings(q['notes']))),
    overall: _strings(j['overall']),
  );

  final String id;
  final double score;
  final List<String> questions, overall;
  final List<({double score, List<String> notes})> perQuestion;
}

class MockSummary {
  const MockSummary({required this.id, required this.kind, required this.role, required this.status, this.score, this.createdAt});

  factory MockSummary.fromJson(Map<String, dynamic> j) =>
      MockSummary(id: _s(j['id']), kind: _s(j['kind']), role: _s(j['role']), status: _s(j['status']), score: _dn(j['score']), createdAt: _at(j['createdAt']));

  final String id, kind, role, status;
  final double? score;
  final DateTime? createdAt;
}

/// One answer of the career assistant (`POST /v1/careers/assistant/ask`). [aiUsed] is false when the
/// server answered from its built-in guidance because KINETIX AI is not connected.
class AssistantReply {
  const AssistantReply({required this.answer, required this.suggestions, required this.pathways, required this.aiUsed});

  factory AssistantReply.fromJson(Map<String, dynamic> j) =>
      AssistantReply(answer: _s(j['answer']), suggestions: _strings(j['suggestions']), pathways: _strings(j['pathways']), aiUsed: j['aiUsed'] as bool? ?? false);

  final String answer;
  final List<String> suggestions, pathways;
  final bool aiUsed;
}

/// A line of the assistant chat (`GET /v1/careers/assistant/history`); `role` is `user` or `assistant`.
class AssistantMessage {
  const AssistantMessage({required this.role, required this.body, this.aiUsed, this.suggestions = const []});

  factory AssistantMessage.fromJson(Map<String, dynamic> j) => AssistantMessage(role: _s(j['role']), body: _s(j['body']), aiUsed: j['aiUsed'] as bool?);

  final String role, body;

  /// Whether KINETIX AI wrote this answer; null for history lines, where the server does not say.
  final bool? aiUsed;
  final List<String> suggestions;

  bool get mine => role == 'user';
}
