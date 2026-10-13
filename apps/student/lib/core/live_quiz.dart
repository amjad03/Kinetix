/// Live Quiz: the game-show quiz the teacher runs on the board (services/api/src/quiz-games).
/// Questions, reveals and the end of the game arrive over the realtime connection; the student
/// answers over REST. Payloads as in packages/shared/src/quiz-games.ts.
library;

/// `mcq`: 2 to 4 options A–D; `tf`: True / False (options[0] = True).
enum QuizKind { mcq, tf }

/// Where a game is: waiting to start, a question open, its answer shown, or over.
enum QuizStatus {
  lobby,
  question,
  reveal,
  finished;

  static QuizStatus? tryParse(Object? v) => v is String ? values.asNameMap()[v] : null;
}

/// What the server sends for the quiz (`game.question`, `game.reveal`, `game.ended`).
sealed class QuizEvent {
  const QuizEvent();

  String get gameId;
}

/// A question is open (`game.question`); it carries no right answer.
class QuizQuestion extends QuizEvent {
  const QuizQuestion({
    required this.gameId,
    required this.title,
    required this.index,
    required this.count,
    required this.kind,
    required this.question,
    required this.options,
    required this.seconds,
    required this.closesAt,
    required this.serverNow,
  });

  factory QuizQuestion.fromJson(Map<String, dynamic> j) {
    final serverNow = DateTime.tryParse(j['serverNow'] as String? ?? '') ?? DateTime.now();
    return QuizQuestion(
      gameId: j['gameId'] as String,
      title: j['title'] as String? ?? '',
      index: (j['index'] as num).toInt(),
      count: (j['count'] as num?)?.toInt() ?? 1,
      kind: j['kind'] == 'tf' ? QuizKind.tf : QuizKind.mcq,
      question: j['question'] as String? ?? '',
      options: [for (final o in j['options'] as List? ?? const []) '$o'],
      seconds: (j['seconds'] as num?)?.toInt() ?? 20,
      closesAt: DateTime.tryParse(j['closesAt'] as String? ?? '') ?? serverNow,
      serverNow: serverNow,
    );
  }

  @override
  final String gameId;
  final String title;

  /// 0-based; [count] questions in all.
  final int index;
  final int count;
  final QuizKind kind;
  final String question;
  final List<String> options;
  final int seconds;
  final DateTime closesAt;

  /// The server's clock when sent, so a phone with a wrong clock still counts down right.
  final DateTime serverNow;

  /// When it closes on this phone's clock, for an event received at [receivedAt].
  DateTime closesOnPhone(DateTime receivedAt) => closesAt.add(receivedAt.difference(serverNow));
}

/// One row of the leaderboard. Ties share a rank.
class QuizStanding {
  const QuizStanding({required this.studentId, required this.name, required this.score, required this.rank});

  factory QuizStanding.fromJson(Map<String, dynamic> j) => QuizStanding(
    studentId: j['studentId'] as String? ?? '',
    name: j['name'] as String? ?? '',
    score: (j['score'] as num?)?.toInt() ?? 0,
    rank: (j['rank'] as num?)?.toInt() ?? 0,
  );

  final String studentId;
  final String name;
  final int score;
  final int rank;
}

/// What this student got for one question.
class QuizMyResult {
  const QuizMyResult({required this.answered, this.choice, required this.correct, required this.points, required this.score, this.rank, required this.streak});

  factory QuizMyResult.fromJson(Map<String, dynamic> j) => QuizMyResult(
    answered: j['answered'] == true,
    choice: (j['choice'] as num?)?.toInt(),
    correct: j['correct'] == true,
    points: (j['points'] as num?)?.toInt() ?? 0,
    score: (j['score'] as num?)?.toInt() ?? 0,
    rank: (j['rank'] as num?)?.toInt(),
    streak: (j['streak'] as num?)?.toInt() ?? 0,
  );

  final bool answered;
  final int? choice;
  final bool correct;
  final int points;
  final int score;
  final int? rank;

  /// Right answers in a row.
  final int streak;
}

/// The right answer (`game.reveal`), with the student's own result in [me].
class QuizReveal extends QuizEvent {
  const QuizReveal({required this.gameId, required this.index, required this.count, required this.correct, this.leaderboard = const [], this.me});

  factory QuizReveal.fromJson(Map<String, dynamic> j) => QuizReveal(
    gameId: j['gameId'] as String,
    index: (j['index'] as num).toInt(),
    count: (j['count'] as num?)?.toInt() ?? 1,
    correct: (j['correct'] as num?)?.toInt() ?? 0,
    leaderboard: [for (final s in j['leaderboard'] as List? ?? const []) QuizStanding.fromJson((s as Map).cast<String, dynamic>())],
    me: j['me'] is Map ? QuizMyResult.fromJson((j['me'] as Map).cast<String, dynamic>()) : null,
  );

  @override
  final String gameId;
  final int index;
  final int count;
  final int correct;
  final List<QuizStanding> leaderboard;
  final QuizMyResult? me;
}

/// The game is over (`game.ended`); [cancelled] when the teacher ended it with nothing revealed.
class QuizEnd extends QuizEvent {
  const QuizEnd({required this.gameId, this.podium = const [], this.cancelled = false, this.score, this.rank, this.correct, this.count});

  factory QuizEnd.fromJson(Map<String, dynamic> j) {
    final me = j['me'] is Map ? (j['me'] as Map).cast<String, dynamic>() : null;
    return QuizEnd(
      gameId: j['gameId'] as String,
      podium: [for (final s in j['podium'] as List? ?? const []) QuizStanding.fromJson((s as Map).cast<String, dynamic>())],
      cancelled: j['cancelled'] == true,
      score: (me?['score'] as num?)?.toInt(),
      rank: (me?['rank'] as num?)?.toInt(),
      correct: (me?['correct'] as num?)?.toInt(),
      count: (me?['count'] as num?)?.toInt(),
    );
  }

  @override
  final String gameId;
  final List<QuizStanding> podium;
  final bool cancelled;

  /// The student's final score, rank, and right answers out of [count] (null when the server
  /// sent no `me`).
  final int? score;
  final int? rank;
  final int? correct;
  final int? count;
}

/// The game running in the student's class, to rejoin (GET /v1/student/quiz-game). [game] is
/// null in the lobby (no question opened yet) and when no game runs ([status] null too).
class StudentQuizGame {
  const StudentQuizGame({this.game, this.status, this.myChoice, this.score = 0});

  factory StudentQuizGame.fromJson(Map<String, dynamic> j) => StudentQuizGame(
    game: j['game'] is Map ? QuizQuestion.fromJson((j['game'] as Map).cast<String, dynamic>()) : null,
    status: QuizStatus.tryParse(j['status']),
    myChoice: (j['myChoice'] as num?)?.toInt(),
    score: (j['score'] as num?)?.toInt() ?? 0,
  );

  final QuizQuestion? game;
  final QuizStatus? status;

  /// The student's answer to the open (or last revealed) question.
  final int? myChoice;

  /// Points for the questions revealed so far.
  final int score;
}
