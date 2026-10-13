// Live Quiz scoring, as the server does it (services/api/src/quiz-games/scoring.ts): the board
// scores a game itself when it has no server (a card-only game offline, a guest board), and
// shows the server's numbers when it has one. Keep the two in step.

import '../class_check/class_poll.dart' show AnswerSource;

/// A right answer is worth this much before the speed bonus.
const quizBasePoints = 500;

/// Up to this much more for answering fast in the Student App.
const quizSpeedPoints = 500;

/// Each right answer in a row after the first adds this much, up to [quizStreakMax].
const quizStreakStep = 100;
const quizStreakMax = 500;

/// Points for one answer before the streak bonus: none when wrong; cards score without the speed bonus.
int quizAnswerPoints({required bool correct, required AnswerSource source, int? elapsedMs, required int seconds}) {
  if (!correct) return 0;
  if (source == AnswerSource.card || elapsedMs == null) return quizBasePoints;
  final left = (1 - elapsedMs / (seconds * 1000)).clamp(0.0, 1.0);
  return quizBasePoints + (quizSpeedPoints * left).round();
}

/// The bonus for the [streak]th right answer in a row (1 = the first, no bonus).
int quizStreakBonus(int streak) => streak <= 1 ? 0 : ((streak - 1) * quizStreakStep).clamp(0, quizStreakMax);

/// One answer to one question, by a student (or a card the board cannot put a name to).
class QuizAnswer {
  const QuizAnswer({required this.choice, required this.source, this.elapsedMs});

  final int choice;
  final AnswerSource source;

  /// Since the question opened (app answers); null for cards.
  final int? elapsedMs;
}

/// One row of the leaderboard. Ties share a rank.
class QuizStanding {
  const QuizStanding({required this.id, required this.name, required this.score, required this.correct, required this.streak, required this.rank});

  factory QuizStanding.fromJson(Map<String, dynamic> j) => QuizStanding(
    id: j['studentId'] as String,
    name: j['name'] as String? ?? '',
    score: (j['score'] as num?)?.toInt() ?? 0,
    correct: (j['correct'] as num?)?.toInt() ?? 0,
    streak: (j['streak'] as num?)?.toInt() ?? 0,
    rank: (j['rank'] as num?)?.toInt() ?? 0,
  );

  final String id;
  final String name;
  final int score;
  final int correct;
  final int streak;
  final int rank;
}

/// The leaderboard after the first [revealed] questions: everyone who answered at least once,
/// best first (ties share a rank, then by name). [answers] has one map per question (player id →
/// answer), [correct] and [seconds] the right option and the countdown of each question.
List<QuizStanding> scoreQuiz({
  required List<int> correct,
  required List<int> seconds,
  required int revealed,
  required List<Map<String, QuizAnswer>> answers,
  required String Function(String id) nameOf,
}) {
  final playing = <String>{for (var i = 0; i < revealed && i < answers.length; i++) ...answers[i].keys};
  final rows = <({String id, String name, int score, int correct, int streak})>[];
  for (final id in playing) {
    var score = 0, streak = 0, right = 0;
    for (var i = 0; i < revealed && i < answers.length; i++) {
      final a = answers[i][id];
      if (a == null || a.choice != correct[i]) {
        streak = 0;
        continue;
      }
      streak++;
      right++;
      score += quizAnswerPoints(correct: true, source: a.source, elapsedMs: a.elapsedMs, seconds: seconds[i]) + quizStreakBonus(streak);
    }
    rows.add((id: id, name: nameOf(id), score: score, correct: right, streak: streak));
  }
  rows.sort((a, b) {
    final s = b.score.compareTo(a.score);
    if (s != 0) return s;
    final c = b.correct.compareTo(a.correct);
    return c != 0 ? c : a.name.compareTo(b.name);
  });
  final out = <QuizStanding>[];
  for (final (i, r) in rows.indexed) {
    final prev = out.lastOrNull;
    final rank = prev != null && prev.score == r.score && prev.correct == r.correct ? prev.rank : i + 1;
    out.add(QuizStanding(id: r.id, name: r.name, score: r.score, correct: r.correct, streak: r.streak, rank: rank));
  }
  return out;
}
