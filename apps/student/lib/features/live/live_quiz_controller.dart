import 'package:flutter/foundation.dart';

import '../../core/api.dart';
import '../../core/live_quiz.dart';

/// Where the student is in a Live Quiz.
enum QuizPhase {
  /// No game in the class.
  none,

  /// The teacher made a game and has not opened the first question yet.
  lobby,

  /// A question is open: answer it (or wait, once answered).
  question,

  /// The right answer is out: right or wrong, points and rank. [LiveQuizController.reveal] is
  /// null when the student joined after the reveal (only the score is known then).
  revealed,

  /// The game is over.
  ended,
}

/// The Live Quiz as the student plays it. The shell feeds it the realtime events
/// ([handle]) and rejoins over REST ([refresh]) on start, after a reconnect and when the app
/// comes back, so a student who joins late or loses the connection lands on the right screen.
class LiveQuizController extends ChangeNotifier {
  LiveQuizController(this.api, {DateTime Function()? now}) : now = now ?? DateTime.now;

  final StudentApi api;

  /// The phone's clock (tests set it).
  final DateTime Function() now;

  QuizPhase phase = QuizPhase.none;
  String? gameId;
  String title = '';

  /// The open question, or the last one asked.
  QuizQuestion? question;

  /// When [question] closes on this phone's clock.
  DateTime? _closes;

  /// The student's answer to [question] (shown at once; the server's answer replaces it).
  int? myChoice;
  bool sending = false;

  /// The last answer did not go through: time was up, or the server could not be reached.
  ApiException? error;

  QuizReveal? reveal;
  QuizEnd? end;
  int score = 0;
  int? rank;
  int streak = 0;

  /// Games the student was already asked to join.
  final _prompted = <String>{};
  bool _disposed = false;

  /// A game is running in the class.
  bool get active => phase == QuizPhase.lobby || phase == QuizPhase.question || phase == QuizPhase.revealed;

  /// Time left on the open question (zero once it closes).
  Duration get remaining {
    final closes = _closes;
    if (phase != QuizPhase.question || closes == null) return Duration.zero;
    final left = closes.difference(now());
    return left.isNegative ? Duration.zero : left;
  }

  bool get timeUp => phase == QuizPhase.question && remaining == Duration.zero;
  bool get canAnswer => phase == QuizPhase.question && myChoice == null && !sending && !timeUp;

  /// True once per game, when a game the student has not been asked about is running.
  bool takePrompt() {
    final id = gameId;
    return id != null && active && _prompted.add(id);
  }

  /// A realtime event for the class's game.
  void handle(QuizEvent e) {
    switch (e) {
      case QuizQuestion():
        _open(e, e.index == question?.index && e.gameId == gameId ? myChoice : null);
      case QuizReveal(:final me):
        _game(e.gameId);
        reveal = e;
        error = null;
        if (me != null) {
          score = me.score;
          rank = me.rank;
          streak = me.streak;
          myChoice = me.choice;
        }
        phase = QuizPhase.revealed;
      case QuizEnd():
        _game(e.gameId);
        end = e;
        if (e.score != null) score = e.score!;
        if (e.rank != null) rank = e.rank;
        phase = QuizPhase.ended;
    }
    _notify();
  }

  /// Catches up with the game in the class (joining late, after a reconnect). Keeps what it
  /// has when the server cannot be reached.
  Future<void> refresh() async {
    final StudentQuizGame s;
    try {
      s = await api.quizGame();
    } on Object {
      return;
    }
    if (_disposed) return;
    final game = s.game;
    switch (s.status) {
      case QuizStatus.lobby:
        gameId = null;
        question = null;
        reveal = null;
        end = null;
        score = s.score;
        rank = null;
        streak = 0;
        phase = QuizPhase.lobby;
      case QuizStatus.question when game != null:
        _open(game, s.myChoice);
        score = s.score;
      case QuizStatus.reveal when game != null:
        _game(game.gameId);
        title = game.title;
        score = s.score;
        // Missed the reveal itself: wait for the next question with the score so far.
        if (phase != QuizPhase.revealed || reveal?.index != game.index) reveal = null;
        question = game;
        myChoice = s.myChoice;
        phase = QuizPhase.revealed;
      default:
        // No game any more: one that was running finished while the phone was away.
        if (active) phase = gameId == null ? QuizPhase.none : QuizPhase.ended;
    }
    _notify();
  }

  /// Answers the open question with option [choice] (0 = A).
  Future<void> answer(int choice) async {
    final q = question, id = gameId;
    if (!canAnswer || q == null || id == null) return;
    myChoice = choice;
    sending = true;
    error = null;
    _notify();
    try {
      final kept = await api.answerQuizGame(id, q.index, choice);
      if (question == q) myChoice = kept;
    } on ApiException catch (e) {
      if (question == q) {
        myChoice = null;
        error = e;
      }
    } finally {
      sending = false;
      _notify();
    }
  }

  /// Done with the final screen.
  void dismiss() {
    if (phase != QuizPhase.ended) return;
    phase = QuizPhase.none;
    _notify();
  }

  void _open(QuizQuestion q, int? choice) {
    _game(q.gameId);
    title = q.title;
    question = q;
    _closes = q.closesOnPhone(now());
    myChoice = choice;
    reveal = null;
    error = null;
    phase = QuizPhase.question;
  }

  /// Starts afresh when [id] is a new game.
  void _game(String id) {
    if (id == gameId) return;
    gameId = id;
    question = null;
    myChoice = null;
    reveal = null;
    end = null;
    score = 0;
    rank = null;
    streak = 0;
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
