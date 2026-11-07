import 'dart:math';

import 'model.dart';

// What the ported Zynetix blocks need from the Zynetix board around them, cut down for the
// Classroom edition: no session log upload, no game zone, roll numbers only.

/// A random roll number not in [exclude] (null when everyone is excluded).
int? pickRoll(Random rnd, int rollCount, Set<int> exclude) {
  final left = [
    for (var r = 1; r <= rollCount; r++)
      if (!exclude.contains(r)) r,
  ];
  return left.isEmpty ? null : left[rnd.nextInt(left.length)];
}

/// A number for the board: no trailing zeros.
String formatNumber(double v) => v == v.roundToDouble() && v.abs() < 1e15 ? v.round().toString() : v.toString();

/// Who has answered in this lesson: absent rolls, rolls already picked, team scores.
class ClassRoom {
  ClassRoom({required this.rollCount, Random? random, Set<int> absent = const {}}) : random = random ?? Random() {
    this.absent.addAll(absent);
  }
  final int rollCount;
  final Random random;
  final absent = <int>{};
  final picked = <int>{};
  int teams = 2;
  final scores = List<int>.filled(4, 0);

  int? nextRoll() {
    var r = pickRoll(random, rollCount, {...absent, ...picked});
    if (r == null) {
      picked.clear();
      r = pickRoll(random, rollCount, absent);
    }
    if (r != null) picked.add(r);
    return r;
  }
}

/// One answer the class gave in a lesson (kept on the board; nothing is uploaded).
typedef LessonAnswer = ({String questionId, int? roll, int? chosen, bool correct, String source});

/// Collects the answers given while a lesson is taught (the Zynetix session log, without upload).
class SessionRecorder {
  SessionRecorder({String chapterId = '', String topicId = '', String lessonId = ''}) : log = {'chapterId': chapterId, 'topicId': topicId, 'lessonId': lessonId};
  final Map<String, dynamic> log;
  final answers = <LessonAnswer>[];
  final shownBlocks = <String>[];

  void shown(String blockId) {
    if (!shownBlocks.contains(blockId)) shownBlocks.add(blockId);
  }

  void answer({required String questionId, required QuizMode mode, int? roll, required int? chosen, required bool correct, String? topicId, String? chapterId, String? source, int? team}) =>
      answers.add((questionId: questionId, roll: roll, chosen: chosen, correct: correct, source: source ?? mode.name));

  void close({required bool completed}) {}
}
