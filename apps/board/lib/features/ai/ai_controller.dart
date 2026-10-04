import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/api_client.dart';
import '../../core/board_controller.dart';
import '../../core/models.dart';

/// Which page the KINETIX AI panel shows.
enum AiView { home, quiz, homework, lessonPlan, math }

/// One AI request and its outcome: loading, a friendly error, or the result.
class AiTask<T> extends ChangeNotifier {
  bool loading = false;
  String? error;
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
      error = aiErrorMessage(e);
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

/// A message for the class, for each way an AI request can fail.
String aiErrorMessage(Object e) {
  if (e is ApiException) {
    final server = e.message.startsWith('Request failed') ? null : e.message;
    return switch (e.status) {
      401 || 403 => 'Sign in again with the Teacher app to use KINETIX AI.',
      422 => server ?? 'KINETIX AI can’t help with that request. Try rephrasing it for the classroom.',
      429 => 'Your institution has used today’s KINETIX AI allowance. It resets tomorrow.',
      502 => 'KINETIX AI could not produce a usable answer. Try again or rephrase.',
      503 => 'KINETIX AI is not reachable right now. Try again in a minute.',
      400 => server ?? 'Check what you typed and try again.',
      _ => 'Something went wrong (${e.status}). Try again.',
    };
  }
  if (e is TimeoutException) return 'KINETIX AI is taking too long. Try again in a minute.';
  return 'The board is offline. Connect to the internet to use KINETIX AI. The maths solver works offline.';
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

  // Lesson plan
  String? lessonTopic;
  int lessonMinutes = 45;
  final lessonPlan = AiTask<LessonPlan>();

  // Maths solver (offline)
  String mathInput = '';

  String? _sessionId;

  /// AI needs a signed-in teacher: the request is billed to the institution and grounded in the class.
  bool get canUseAi => board.isSignedIn && board.api != null;

  /// The class subject, for prefilling topics.
  String get defaultTopic => board.session?.subjectName ?? '';

  ApiClient get _api => board.api!;

  void setLanguage(AiLanguage l) {
    language = l;
    notifyListeners();
  }

  void open(AiView v) {
    view = v;
    notifyListeners();
  }

  Future<void> ask(String q, {bool fresh = false}) async {
    final text = q.trim();
    if (text.length < 2) return;
    question = text;
    notifyListeners();
    await explain.run(() => _api.explain(text, language, fresh: fresh));
  }

  Future<void> generateQuiz(String topic, {bool fresh = false}) async {
    quizTopic = topic.trim();
    await quiz.run(() => _api.quiz(quizTopic!, count: quizCount, difficulty: quizDifficulty, language: language, fresh: fresh));
  }

  Future<void> generateHomework(String topic, {bool fresh = false}) async {
    homeworkTopic = topic.trim();
    final r = await homework.run(
      () => _api.homeworkDraft(homeworkTopic!, count: homeworkCount, difficulty: homeworkDifficulty, language: language, fresh: fresh),
    );
    if (r != null) {
      homeworkDraft = r.result;
      homeworkFromPreview = r.meta.preview;
      notifyListeners();
    }
  }

  void writeOwnHomework() {
    homeworkDraft = HomeworkDraft(
      title: homeworkTopic?.isNotEmpty == true ? 'Homework: $homeworkTopic' : 'Homework',
      instructions: 'Answer all questions in your notebook. Show your working.',
      questions: [HomeworkQuestion(question: '', marks: 2)],
    );
    homeworkFromPreview = false;
    notifyListeners();
  }

  void discardHomework() {
    homeworkDraft = null;
    homework.clear();
    notifyListeners();
  }

  Future<void> generateLessonPlan(String topic, {bool fresh = false}) async {
    lessonTopic = topic.trim();
    await lessonPlan.run(() => _api.lessonPlan(lessonTopic!, minutes: lessonMinutes, language: language, fresh: fresh));
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
    for (final t in [explain, quiz, homework, lessonPlan]) {
      t.clear();
    }
    notifyListeners();
  }

  @override
  void dispose() {
    board.removeListener(_onBoard);
    for (final t in [explain, quiz, homework, lessonPlan]) {
      t.dispose();
    }
    super.dispose();
  }
}

/// Homework text for a quiz: numbered questions with lettered options.
String quizAsHomework(Quiz quiz) {
  final b = StringBuffer('Answer these multiple-choice questions. Write the letter of the correct option.\n');
  for (var i = 0; i < quiz.questions.length; i++) {
    final q = quiz.questions[i];
    b.write('\n${i + 1}. ${q.question}\n');
    for (var o = 0; o < q.options.length; o++) {
      b.write('   ${String.fromCharCode(65 + o)}) ${q.options[o]}\n');
    }
  }
  return b.toString().trimRight();
}

/// Homework text for a draft: the instructions, then numbered questions with marks.
String homeworkInstructions(HomeworkDraft d) {
  final b = StringBuffer(d.instructions.trim());
  final qs = d.questions.where((q) => q.question.trim().isNotEmpty).toList();
  if (qs.isNotEmpty) {
    if (b.isNotEmpty) b.write('\n\n');
    for (var i = 0; i < qs.length; i++) {
      b.write('${i + 1}. ${qs[i].question.trim()} (${qs[i].marks} ${qs[i].marks == 1 ? 'mark' : 'marks'})\n');
    }
    final total = qs.fold(0, (s, q) => s + q.marks);
    b.write('\nTotal: $total ${total == 1 ? 'mark' : 'marks'}');
  }
  return b.toString().trim();
}
