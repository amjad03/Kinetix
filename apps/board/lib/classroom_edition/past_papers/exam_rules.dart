/// The exams a past paper can be from, and how each is timed and marked: one table
/// ([examRules]) for the timer's defaults and the practice / class-quiz scores.
library;

/// An exam a paper belongs to. [id] is what the index and paper packs store.
enum Exam {
  kcet('kcet', 'KCET'),
  neet('neet', 'NEET'),
  jeeMain('jee-main', 'JEE Main'),
  jeeAdvanced('jee-advanced', 'JEE Advanced'),
  comedk('comedk', 'COMEDK'),
  puc2('puc2', 'II PUC'),
  puc1('puc1', 'I PUC'),
  cbse12('cbse12', 'CBSE XII'),
  cbse11('cbse11', 'CBSE XI');

  const Exam(this.id, this.label);

  final String id;
  final String label;

  /// The exam for a stored id (or its label, any case); null when unknown.
  static Exam? parse(Object? v) {
    final s = '$v'.trim().toLowerCase();
    for (final e in values) {
      if (e.id == s || e.label.toLowerCase() == s || e.name.toLowerCase() == s) return e;
    }
    return null;
  }

  ExamRule get rule => examRules[this]!;
}

/// How an exam is timed and marked.
class ExamRule {
  const ExamRule({required this.minutes, required this.right, this.wrong = 0, this.perSubject = false, this.note = ''});

  /// The paper's time in minutes (per subject when [perSubject]).
  final int minutes;

  /// Marks for a right answer, and taken away for a wrong one (0: no negative marking).
  final double right;
  final double wrong;

  /// Each subject is its own paper with its own time (KCET).
  final bool perSubject;

  /// A plain line for the timer ("3 hours 20 minutes").
  final String note;

  /// "+4 / −1", "+1, no negative marks".
  String get markingLine => wrong == 0 ? '+${_n(right)} for a right answer, no negative marks' : '+${_n(right)} right, −${_n(wrong)} wrong';

  /// "3 h 20 min", "80 min per subject".
  String get timeLine {
    final t = formatMinutes(minutes);
    return perSubject ? '$t per subject' : t;
  }
}

/// The timer's defaults and the marking for every exam. Question-level marks in a paper's
/// question set (JEE Advanced's, which change from section to section) win over these.
const examRules = <Exam, ExamRule>{
  Exam.neet: ExamRule(minutes: 200, right: 4, wrong: 1),
  Exam.jeeMain: ExamRule(minutes: 180, right: 4, wrong: 1),
  // Each of the two papers; sections set their own marks (+3/−1, +4/−2, +4/0…).
  Exam.jeeAdvanced: ExamRule(minutes: 180, right: 3, wrong: 1),
  Exam.kcet: ExamRule(minutes: 80, right: 1, perSubject: true),
  Exam.comedk: ExamRule(minutes: 180, right: 1),
  // 3 hours plus 15 minutes to read the paper.
  Exam.puc2: ExamRule(minutes: 195, right: 1),
  Exam.puc1: ExamRule(minutes: 195, right: 1),
  Exam.cbse12: ExamRule(minutes: 180, right: 1),
  Exam.cbse11: ExamRule(minutes: 180, right: 1),
};

/// "3 h 20 min", "80 min", "2 h".
String formatMinutes(int minutes) {
  final h = minutes ~/ 60, m = minutes % 60;
  if (h == 0) return '$m min';
  return m == 0 ? '$h h' : '$h h $m min';
}

String _n(double v) => v == v.roundToDouble() ? '${v.toInt()}' : '$v';

/// [v] as marks: "4", "−1", "2.5".
String formatMarks(double v) => v < 0 ? '−${_n(-v)}' : _n(v);
