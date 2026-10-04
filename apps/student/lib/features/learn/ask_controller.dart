import 'package:flutter/material.dart';

import '../../core/api.dart';
import '../../core/models.dart';

/// One question to KINETIX AI and how it went.
class AskTurn {
  AskTurn(this.question);

  final AiQuestion question;
  Explanation? answer;
  ApiException? error;

  bool get loading => answer == null && error == null;
}

/// "Ask a doubt": the question being typed, the answer language, optional subject or topic
/// context, the current answer and the earlier ones from this session.
class AskController extends ChangeNotifier {
  AskController({required this.api, required this.sectionId, required this.language, this.onLanguageChanged, this.topic});

  final StudentApi api;

  /// The student's class, so answers match its level and syllabus.
  final String sectionId;
  final void Function(AiLanguage)? onLanguageChanged;

  final input = TextEditingController();
  AiLanguage language;
  Subject? subject;

  /// Set when asking from a topic page: the answer is grounded in that topic's notes.
  TopicRef? topic;

  AskTurn? current;

  /// Earlier answered questions, newest first.
  final history = <AskTurn>[];
  static const historyLimit = 10;

  bool get busy => current?.loading ?? false;

  void setLanguage(AiLanguage l) {
    if (l == language) return;
    language = l;
    onLanguageChanged?.call(l);
    notifyListeners();
  }

  void setSubject(Subject? s) {
    subject = s;
    notifyListeners();
  }

  void clearTopic() {
    topic = null;
    notifyListeners();
  }

  /// Asks [text] (or what is typed). Questions under two characters are ignored.
  Future<void> ask([String? text]) async {
    final q = (text ?? input.text).trim();
    if (q.length < 2 || busy) return;
    if (text != null) input.text = text;
    _archive(current);
    final turn = AskTurn(AiQuestion(question: q, language: language, subject: subject, topic: topic));
    current = turn;
    notifyListeners();
    await _run(turn);
  }

  /// Asks the current question again (after a network or server error).
  Future<void> retry() async {
    final turn = current;
    if (turn == null || turn.error == null) return;
    turn.error = null;
    notifyListeners();
    await _run(turn);
  }

  /// Shows an earlier answer again.
  void show(AskTurn turn) {
    if (busy || identical(turn, current)) return;
    history.remove(turn);
    _archive(current);
    current = turn;
    input.text = turn.question.question;
    notifyListeners();
  }

  void _archive(AskTurn? turn) {
    if (turn?.answer == null) return;
    history.remove(turn);
    history.insert(0, turn!);
    if (history.length > historyLimit) history.removeLast();
  }

  Future<void> _run(AskTurn turn) async {
    final q = turn.question;
    try {
      turn.answer = await api.explain(
        question: q.question,
        language: q.language,
        sectionId: sectionId,
        subjectId: q.subject?.id,
        topicId: q.topic?.id,
      );
    } on ApiException catch (e) {
      turn.error = e;
    }
    notifyListeners();
  }

  @override
  void dispose() {
    input.dispose();
    super.dispose();
  }
}

/// How an AI error reads to a student, and whether trying again can help.
({String title, String message, bool retry, IconData icon}) describeAiError(ApiException e) => switch (e.status) {
  422 => (
    title: "KINETIX AI can't answer that",
    message: e.message.isEmpty ? 'Try rephrasing it as a question about your studies.' : e.message,
    retry: false,
    icon: Icons.block,
  ),
  429 => (
    title: "Today's KINETIX AI allowance is used up",
    message: e.message.isEmpty ? 'Your college has used today’s allowance. It resets tomorrow.' : e.message,
    retry: false,
    icon: Icons.hourglass_empty,
  ),
  503 => (
    title: 'KINETIX AI is not reachable',
    message: 'It is not reachable right now. Try again in a minute.',
    retry: true,
    icon: Icons.cloud_off,
  ),
  0 => (title: 'No connection', message: e.message, retry: true, icon: Icons.wifi_off),
  _ => (title: 'Something went wrong', message: e.message, retry: true, icon: Icons.error_outline),
};
