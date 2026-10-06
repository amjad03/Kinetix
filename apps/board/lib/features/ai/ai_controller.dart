import 'dart:async';

import 'package:flutter/widgets.dart';

import '../../core/api_client.dart';
import '../../core/board_controller.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../demo/demo.dart';
import '../board/side_panel.dart';
import '../offline_ai/offline_ai.dart';

/// Which page the KINETIX AI panel shows.
enum AiView { home, quiz, homework, lessonPlan, math, readBoard }

/// One AI request and its outcome: loading, an error, or the result.
class AiTask<T> extends ChangeNotifier {
  bool loading = false;

  /// What went wrong; [aiErrorMessage] words it for the class.
  Object? error;
  AiResult<T>? value;

  /// Runs [request]. A newer call wins over a slower older one.
  Future<AiResult<T>?> run(Future<AiResult<T>> Function() request) async {
    final ticket = ++_ticket;
    loading = true;
    error = null;
    notifyListeners();
    try {
      final r = await request().timeout(const Duration(seconds: 90));
      if (ticket != _ticket) return null;
      value = r;
      return r;
    } catch (e) {
      if (ticket != _ticket) return null;
      error = e;
      return null;
    } finally {
      if (ticket == _ticket) {
        loading = false;
        notifyListeners();
      }
    }
  }

  void clear() {
    _ticket++;
    loading = false;
    error = null;
    value = null;
    notifyListeners();
  }

  var _ticket = 0;
}

/// A message for the class, for each way an AI request can fail. Messages written by the
/// server (refusals, bad input) are shown as they come.
String aiErrorMessage(AppLocalizations l, Object e) {
  if (e is ApiException) {
    final server = e.message.startsWith('Request failed') ? null : e.message;
    return switch (e.status) {
      401 || 403 => l.aiErrSignInAgain,
      422 => server ?? l.aiErrRefused,
      429 => l.aiErrQuota,
      502 => l.aiErrUnusable,
      503 => l.aiErrUnreachable,
      400 => server ?? l.aiErrCheckInput,
      _ => l.aiErrGeneric(e.status),
    };
  }
  if (e is TimeoutException) return l.aiErrTimeout;
  return l.aiErrOffline;
}

/// KINETIX AI state for the board: the chosen language, the current page and each tool's
/// latest result. It outlives the panel, so closing and reopening keeps the work.
class AiController extends ChangeNotifier {
  AiController(this.board) : language = AiLanguage.fromCode(board.session?.language) {
    board.addListener(_onBoard);
    _sessionId = board.session?.sessionId;
  }

  final BoardController board;

  /// Applies to every AI task.
  AiLanguage language;
  AiView view = AiView.home;

  // Ask
  String question = '';
  final explain = AiTask<Explanation>();

  // Quick quiz
  String? quizTopic;
  int quizCount = 5;
  AiDifficulty quizDifficulty = AiDifficulty.medium;
  final quiz = AiTask<Quiz>();

  // Homework
  String? homeworkTopic;
  int homeworkCount = 5;
  AiDifficulty homeworkDifficulty = AiDifficulty.medium;
  final homework = AiTask<HomeworkDraft>();

  /// The draft being edited (from AI or written by hand).
  HomeworkDraft? homeworkDraft;
  bool homeworkFromPreview = false;

  /// The draft came from the board's offline notes.
  bool homeworkOffline = false;

  // Lesson plan
  String? lessonTopic;
  int lessonMinutes = 45;

  /// The length the shown plan was made for: its steps are fitted to it.
  int lessonPlanMinutes = 45;
  final lessonPlan = AiTask<LessonPlan>();

  // Read the board (handwriting to text)
  final reading = AiTask<BoardReading>();

  /// Opens a 3D model or lab next to the whiteboard (the board screen sets this).
  void Function(SplitContent content, [String? id, String? preset])? openSplit;

  /// Opens Books, the class textbooks (the board screen sets this).
  VoidCallback? openBooks;

  /// Renders the open board page as a PNG (base64). Set by the board screen.
  Future<String> Function()? captureBoard;

  // Maths solver (offline)
  String mathInput = '';

  /// Bumped when the board sends an equation to the solver, so an open solver starts afresh.
  int mathRequest = 0;

  /// Opens the maths solver on [text] (an equation from the board, in the solver's syntax).
  void solve(String text) {
    mathInput = text;
    mathRequest++;
    open(AiView.math);
  }

  String? _sessionId;

  /// AI needs a signed-in teacher: the request is billed to the institution and grounded in the class.
  bool get canUseAi => board.isSignedIn && board.api != null;

  /// The class subject, for prefilling topics.
  String get defaultTopic => board.session?.subjectName ?? '';

  ApiClient get _api => board.api!;

  /// Sample answers from the board's own notes, when KINETIX AI cannot be reached or in demo
  /// builds (features/offline_ai). Nothing leaves the board.
  final offlineAi = const OfflineAi();

  String? get _subject => board.session?.subjectName;

  /// Asks KINETIX AI; in a demo build, or when it cannot be reached, the offline notes answer
  /// instead if they cover the topic (labelled "Offline sample"). Anything else they do not
  /// make up: the error stands, as do refusals and other errors.
  Future<AiResult<T>> _withOffline<T>(Future<AiResult<T>> Function() online, AiResult<T>? Function() offline) async {
    if (Demo.enabled) {
      final r = offline();
      if (r != null) return r;
    }
    try {
      return await online().timeout(const Duration(seconds: 60));
    } catch (e) {
      if (!cloudUnreachable(e)) rethrow;
      return offline() ?? (throw e);
    }
  }

  /// Strings in the AI language, for text that goes out with the AI's content (homework,
  /// questions sent to KINETIX AI), so it matches the language of the answer.
  AppLocalizations get contentL10n => l10nFor(Locale(language.name));

  void setLanguage(AiLanguage l) {
    language = l;
    notifyListeners();
  }

  void open(AiView v) {
    view = v;
    notifyListeners();
  }

  /// The syllabus topic the last question or quiz was about (from the Books panel).
  String? topicId;

  Future<void> ask(String q, {bool fresh = false, String? topicId}) async {
    final text = q.trim();
    if (text.length < 2) return;
    question = text;
    if (!fresh) this.topicId = topicId;
    notifyListeners();
    await explain.run(() => _withOffline(() => _api.explain(text, language, fresh: fresh, topicId: this.topicId), () => offlineAi.explain(text, subject: _subject)));
  }

  Future<void> generateQuiz(String topic, {bool fresh = false, String? topicId}) async {
    quizTopic = topic.trim();
    if (!fresh) this.topicId = topicId;
    await quiz.run(
      () => _withOffline(
        () => _api.quiz(quizTopic!, count: quizCount, difficulty: quizDifficulty, language: language, fresh: fresh, topicId: this.topicId),
        () => offlineAi.quiz(quizTopic!, count: quizCount, subject: _subject),
      ),
    );
  }

  Future<void> generateHomework(String topic, {bool fresh = false}) async {
    homeworkTopic = topic.trim();
    final r = await homework.run(
      () => _withOffline(
        () => _api.homeworkDraft(homeworkTopic!, count: homeworkCount, difficulty: homeworkDifficulty, language: language, fresh: fresh),
        () => offlineAi.homework(homeworkTopic!, count: homeworkCount, subject: _subject),
      ),
    );
    if (r != null) {
      homeworkDraft = r.result;
      homeworkFromPreview = r.meta.preview;
      homeworkOffline = r.meta.offline;
      notifyListeners();
    }
  }

  void writeOwnHomework() {
    final l = contentL10n;
    homeworkDraft = HomeworkDraft(
      title: homeworkTopic?.isNotEmpty == true ? l.homeworkTitleTopic(homeworkTopic!) : l.toolHomework,
      instructions: l.homeworkDefaultInstructions,
      questions: [HomeworkQuestion(question: '', marks: 2)],
    );
    homeworkFromPreview = homeworkOffline = false;
    notifyListeners();
  }

  void discardHomework() {
    homeworkDraft = null;
    homework.clear();
    notifyListeners();
  }

  Future<void> generateLessonPlan(String topic, {bool fresh = false}) async {
    lessonTopic = topic.trim();
    lessonPlanMinutes = lessonMinutes;
    await lessonPlan.run(
      () => _withOffline(
        () => _api.lessonPlan(lessonTopic!, minutes: lessonMinutes, language: language, fresh: fresh),
        () => offlineAi.lessonPlan(lessonTopic!, minutes: lessonMinutes, subject: _subject),
      ),
    );
  }

  Future<void> readBoard() async {
    final capture = captureBoard;
    if (capture == null) return;
    await reading.run(() async => _api.readBoard(await capture(), language));
  }

  /// Sends homework to the class open on the board.
  Future<void> sendHomework({required String title, required String instructions, required DateTime dueOn}) =>
      _api.homeworkFromBoard(title: title, instructions: instructions.isEmpty ? null : instructions, dueOn: dueOn);

  /// A new teacher starts with a clean slate; drafts from the last class are not theirs.
  void _onBoard() {
    final id = board.session?.sessionId;
    if (id == _sessionId) return;
    _sessionId = id;
    if (id != null) language = AiLanguage.fromCode(board.session?.language);
    question = '';
    quizTopic = homeworkTopic = lessonTopic = null;
    homeworkDraft = null;
    for (final t in [explain, quiz, homework, lessonPlan, reading]) {
      t.clear();
    }
    notifyListeners();
  }

  @override
  void dispose() {
    board.removeListener(_onBoard);
    for (final t in [explain, quiz, homework, lessonPlan, reading]) {
      t.dispose();
    }
    super.dispose();
  }
}

/// Homework text for a quiz: numbered questions with lettered options. [l] is the language of
/// the quiz (English by default).
String quizAsHomework(Quiz quiz, [AppLocalizations? l]) {
  l ??= l10nFor(const Locale('en'));
  final b = StringBuffer('${l.quizHomeworkIntro}\n');
  for (var i = 0; i < quiz.questions.length; i++) {
    final q = quiz.questions[i];
    b.write('\n${i + 1}. ${q.question}\n');
    for (var o = 0; o < q.options.length; o++) {
      b.write('   ${String.fromCharCode(65 + o)}) ${q.options[o]}\n');
    }
  }
  return b.toString().trimRight();
}

/// Homework text for a draft: the instructions, then numbered questions with marks. [l] is the
/// language of the homework (English by default).
String homeworkInstructions(HomeworkDraft d, [AppLocalizations? l]) {
  l ??= l10nFor(const Locale('en'));
  final b = StringBuffer(d.instructions.trim());
  final qs = d.questions.where((q) => q.question.trim().isNotEmpty).toList();
  if (qs.isNotEmpty) {
    if (b.isNotEmpty) b.write('\n\n');
    for (var i = 0; i < qs.length; i++) {
      b.write('${i + 1}. ${qs[i].question.trim()} (${l.marks(qs[i].marks)})\n');
    }
    final total = qs.fold(0, (s, q) => s + q.marks);
    b.write('\n${l.homeworkTotalLine(l.marks(total))}');
  }
  return b.toString().trim();
}
