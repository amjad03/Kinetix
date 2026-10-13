import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:kinetix_cards/kinetix_cards.dart';

import '../../core/api_client.dart';
import '../../core/board_controller.dart';
import '../../core/models.dart';
import '../../core/realtime.dart';
import '../class_check/class_poll.dart' show AnswerSource, CardScan;
import 'quiz_scoring.dart';

export 'quiz_scoring.dart';

/// `mcq`: 2 to 4 options A–D; `tf`: True / False. Answers are option indexes either way.
enum QuizKind { mcq, tf }

/// Seconds a question may stay open.
const quizSecondsChoices = [10, 20, 30];

/// How long after its countdown the board waits before it shows the answer on its own, when the
/// server runs the game: an app answer sent just before time is up still counts (services/api
/// quiz-games ANSWER_GRACE_MS).
const quizAnswerGrace = Duration(milliseconds: 1500);

/// One question of a game, as the teacher set it.
class GameQuestion {
  const GameQuestion({required this.kind, required this.question, required this.options, required this.correct, this.seconds = 20});

  /// A suggestion from the server (question bank or a question asked in the class before).
  factory GameQuestion.fromJson(Map<String, dynamic> j, {int seconds = 20}) => GameQuestion(
    kind: j['kind'] == 'tf' ? QuizKind.tf : QuizKind.mcq,
    question: j['question'] as String,
    options: [for (final o in j['options'] as List) '$o'],
    correct: (j['correct'] as num).toInt(),
    seconds: (j['seconds'] as num?)?.toInt() ?? seconds,
  );

  final QuizKind kind;
  final String question;
  final List<String> options;
  final int correct;
  final int seconds;

  GameQuestion withSeconds(int s) => GameQuestion(kind: kind, question: question, options: options, correct: correct, seconds: s);

  Map<String, dynamic> toJson() => {'kind': kind.name, 'question': question, 'options': options, 'correct': correct, 'seconds': seconds};
}

/// What the board shows: the lobby, a question counting down, its answer, the leaderboard
/// between questions, and the podium at the end.
enum GamePhase { lobby, question, reveal, leaderboard, podium }

/// A Live Quiz on the board: a game-show quiz, one full-screen question at a time.
///
/// In a class opened by a signed-in teacher the server runs the game (services/api
/// quiz-games): it sends each question to the Student App, scores every answer (faster right
/// answers earn more, plus a streak bonus) and keeps the results for the class. Students without
/// phones hold up answer cards, which the board reads from a photo; cards score without the speed
/// bonus. Without the server (no class, no connection) the game still runs on the board with cards
/// only and the board scores it the same way; nothing is saved.
class LiveQuizGame extends ChangeNotifier {
  LiveQuizGame({required this.board, required this.title, required this.questions, this.cards = false, String? id})
    : id = id ?? board.newId(),
      answers = [for (final _ in questions) <String, QuizAnswer>{}];

  final BoardController board;
  final String id;
  final String title;
  final List<GameQuestion> questions;

  /// Students without phones answer with printed cards: the countdown ending does not reveal the
  /// answer on its own, so the teacher has time to scan them.
  final bool cards;

  /// Per question: player (student id, or "card:N" for a card the board cannot put a name to) → answer.
  final List<Map<String, QuizAnswer>> answers;

  /// Card number → its student, for the class open on the board.
  final Map<int, Student> cardOwners = {};

  GamePhase phase = GamePhase.lobby;

  /// The open or last revealed question; -1 in the lobby.
  int index = -1;

  /// The server runs this game (a class is open and it took the game); results are kept.
  bool saved = false;

  /// The last thing that went wrong talking to the server.
  String? error;

  /// The server did not take the last step (open a question, show the answer): the board stays
  /// where it was and the stage asks the teacher to try again, so the board and the server never
  /// get out of step.
  bool retry = false;

  /// Seconds left on the open question's countdown.
  int secondsLeft = 0;

  /// The countdown has run out (the board waits for cards, or reveals on its own).
  bool get timeUp => phase == GamePhase.question && secondsLeft <= 0;

  /// How many the server says have answered the open question (it hears the Student App).
  int _serverAnswered = 0;

  /// The revealed question's tally (from the server when it runs the game).
  List<int> tally = const [];

  /// The top of the leaderboard after the last reveal (all players at the podium).
  List<QuizStanding> standings = const [];

  /// Asking the server is under way (the stage disables its buttons).
  bool busy = false;

  Timer? _timer;
  StreamSubscription<(String, Map<String, dynamic>)>? _events;
  bool _disposed = false;

  ApiClient? get _api => board.isSignedIn && board.session?.sectionName != null ? board.api : null;

  GameQuestion? get question => index >= 0 && index < questions.length ? questions[index] : null;
  bool get isLast => index >= questions.length - 1;

  int get classSize => board.roster.isNotEmpty ? board.roster.length : cardOwners.length;

  int get answered {
    final local = index >= 0 && index < answers.length ? answers[index].length : 0;
    return phase == GamePhase.question && saved ? (local > _serverAnswered ? local : _serverAnswered) : local;
  }

  /// The leaderboard shown between questions.
  List<QuizStanding> get leaderboard => standings.take(5).toList();

  String nameOf(String id) {
    if (id.startsWith('card:')) {
      final n = int.tryParse(id.substring(5));
      return cardOwners[n]?.fullName ?? '#$n';
    }
    return board.roster.where((s) => s.id == id).firstOrNull?.fullName ?? cardOwners.values.where((s) => s.id == id).firstOrNull?.fullName ?? id;
  }

  /// Gets the class's cards and starts the game on the server, when there is one.
  Future<void> start() async {
    _events = board.classEvents.stream.listen(_onEvent);
    final api = _api;
    if (api == null) return;
    // Nothing starts until the server has the game (or has said no).
    busy = true;
    _changed();
    try {
      final sheet = await api.answerCards();
      for (final c in (sheet['cards'] as List? ?? const []).cast<Map<String, dynamic>>()) {
        cardOwners[(c['cardNo'] as num).toInt()] = Student(id: c['studentId'] as String, rollNo: c['rollNo'] as String, fullName: c['fullName'] as String);
      }
      await api.createQuizGame(id, {'title': title, 'questions': [for (final q in questions) q.toJson()], 'cards': cards});
      saved = true;
    } catch (e) {
      error = '$e';
    } finally {
      busy = false;
    }
    _changed();
  }

  /// Opens the next question and starts its countdown.
  Future<void> nextQuestion() async {
    if (busy || !(phase == GamePhase.lobby || phase == GamePhase.leaderboard || phase == GamePhase.reveal) || index + 1 >= questions.length) return;
    final i = index + 1;
    final (ok, _) = await _server((api) => api.advanceQuizGame(id, 'question', i));
    if (!ok) return;
    index = i;
    phase = GamePhase.question;
    _serverAnswered = 0;
    tally = const [];
    secondsLeft = questions[i].seconds;
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
    _changed();
  }

  void _tick() {
    if (phase != GamePhase.question) return;
    secondsLeft = secondsLeft > 0 ? secondsLeft - 1 : 0;
    if (secondsLeft == 0) {
      _timer?.cancel();
      if (!cards) {
        if (saved) {
          _timer = Timer(quizAnswerGrace, () => unawaited(reveal()));
        } else {
          unawaited(reveal());
        }
      }
    }
    _changed();
  }

  /// Closes the open question and shows the right answer; the leaderboard is next.
  Future<void> reveal() async {
    if (busy || phase != GamePhase.question) return;
    _timer?.cancel();
    final i = index;
    // The board's own count first, so the reveal never waits on the network.
    final local = [for (var k = 0; k < questions[i].options.length; k++) answers[i].values.where((a) => a.choice == k).length];
    final (ok, view) = await _server((api) => api.advanceQuizGame(id, 'reveal', i));
    if (!ok) return;
    final fromServer = (view?['questions'] as List?)?.elementAtOrNull(i) as Map?;
    tally = fromServer?['tally'] is List ? [for (final n in fromServer!['tally'] as List) (n as num).toInt()] : local;
    standings = view?['leaderboard'] is List ? [for (final s in view!['leaderboard'] as List) QuizStanding.fromJson(Map<String, dynamic>.from(s as Map))] : _localStandings(i + 1);
    phase = GamePhase.reveal;
    _changed();
  }

  /// After the answer: the leaderboard (or, after the last question, the podium).
  Future<void> showLeaderboard() async {
    if (phase != GamePhase.reveal) return;
    if (isLast) return finish();
    phase = GamePhase.leaderboard;
    _changed();
  }

  /// Ends the game (an open question is revealed first) and shows the podium.
  Future<void> finish() async {
    if (busy || phase == GamePhase.podium) return;
    _timer?.cancel();
    // An open question counts: it is revealed as the game ends.
    if (phase == GamePhase.question) {
      final i = index;
      tally = [for (var k = 0; k < questions[i].options.length; k++) answers[i].values.where((a) => a.choice == k).length];
    }
    final (_, view) = await _server((api) => api.finishQuizGame(id));
    // There is nothing left to try again: the podium shows the board's own scores.
    retry = false;
    final all = view?['leaderboard'];
    standings = all is List ? [for (final s in all) QuizStanding.fromJson(Map<String, dynamic>.from(s as Map))] : _localStandings(index + 1);
    phase = GamePhase.podium;
    _changed();
  }

  /// The stage is closing: waits for a call to the server still under way, then ends the game
  /// there too (a game still in the lobby is cancelled), so the class never sits on a question
  /// that does not close.
  Future<void> close() async {
    while (busy) {
      await Future<void>.delayed(const Duration(milliseconds: 50));
    }
    if (phase == GamePhase.podium || (phase == GamePhase.lobby && !saved)) return;
    await finish();
  }

  List<QuizStanding> _localStandings(int revealed) => scoreQuiz(
    correct: [for (final q in questions) q.correct],
    seconds: [for (final q in questions) q.seconds],
    revealed: revealed,
    answers: answers,
    nameOf: nameOf,
  );

  /// Cards read from a photo of the class for the open question. A card read again replaces its
  /// earlier answer; an answer from the Student App stays.
  Future<CardScan> addCards(List<CardSeen> seen) async {
    final q = question;
    if (phase != GamePhase.question || q == null) return const CardScan(read: 0, unknown: []);
    final i = index;
    final valid = seen.where((s) => s.choice < q.options.length).toList();
    final unknown = <int>[];
    for (final s in valid) {
      final owner = cardOwners[s.card];
      if (owner == null && saved) {
        unknown.add(s.card);
        continue;
      }
      final key = owner?.id ?? 'card:${s.card}';
      if (answers[i][key]?.source == AnswerSource.app) continue;
      answers[i][key] = QuizAnswer(choice: s.choice, source: AnswerSource.card);
    }
    _changed();
    final api = _api;
    if (saved && api != null && valid.isNotEmpty) {
      try {
        final res = await api.quizGameCards(id, i, [
          for (final s in valid) {'cardNo': s.card, 'choice': s.choice},
        ]);
        for (final n in (res['unknown'] as List? ?? const [])) {
          if (!unknown.contains(n)) unknown.add((n as num).toInt());
        }
        _serverAnswered = (res['answered'] as num?)?.toInt() ?? _serverAnswered;
      } catch (e) {
        error = '$e';
        _changed();
      }
    }
    return CardScan(read: valid.length - unknown.length, unknown: unknown..sort());
  }

  void _onEvent((String, Map<String, dynamic>) e) {
    final (name, data) = e;
    if (name != RealtimeEvents.gameAnswered || data['gameId'] != id) return;
    final i = (data['index'] as num?)?.toInt() ?? -1;
    if (i != index || phase != GamePhase.question) return;
    final studentId = data['studentId'] as String;
    final source = data['source'] == 'card' ? AnswerSource.card : AnswerSource.app;
    answers[i][studentId] = QuizAnswer(choice: (data['choice'] as num).toInt(), source: source, elapsedMs: (data['elapsedMs'] as num?)?.toInt());
    _serverAnswered = (data['answered'] as num?)?.toInt() ?? _serverAnswered;
    // Everyone has answered: no need to wait for the countdown (unless cards are still to be read).
    final size = (data['classSize'] as num?)?.toInt() ?? classSize;
    if (!cards && size > 0 && answered >= size) {
      unawaited(reveal());
      return;
    }
    _changed();
  }

  /// One call to the server, when it runs the game: (false, null) when it failed, so the board stays
  /// where it is and the teacher tries again (the server takes the same step twice without harm);
  /// (true, null) when the board runs the game on its own.
  Future<(bool, Map<String, dynamic>?)> _server(Future<Map<String, dynamic>> Function(ApiClient api) call) async {
    final api = _api;
    if (!saved || api == null) return (true, null);
    busy = true;
    _changed();
    try {
      final view = await call(api);
      retry = false;
      return (true, view);
    } catch (e) {
      error = '$e';
      retry = true;
      busy = false;
      _changed();
      return (false, null);
    } finally {
      busy = false;
    }
  }

  void _changed() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    unawaited(_events?.cancel());
    super.dispose();
  }
}
