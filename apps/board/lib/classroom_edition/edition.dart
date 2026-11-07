/// Which product this build is (README.md beside this file).
///
/// * The KINETIX Board (the default): every feature, KINETIX AI included.
/// * Zynetix Board — Classroom edition (`--dart-define=KINETIX_EDITION=classroom`): for PU
///   colleges without the ERP. No AI anywhere, works offline from the board's own timetable,
///   teachers and classes, the Simple board first, Lessons and Class tools.
abstract final class Edition {
  /// The value built in with `--dart-define=KINETIX_EDITION=…`.
  static const built = String.fromEnvironment('KINETIX_EDITION');

  /// The Classroom edition. Tests switch it on and off (set it before the app is pumped).
  static bool classroom = built == 'classroom';

  /// Whether this build shows any AI: the AI pen, KINETIX AI, Text/Shape AI, reading the board,
  /// the solver, "Read with AI", smart tools, AI quizzes and homework, lesson-plan drafting,
  /// offline AI notes, flowchart suggestions, voice commands and live captions.
  static bool get ai => !classroom;

  /// The app's name in this edition.
  static String get appName => classroom ? 'Zynetix Classroom' : 'KINETIX Board';
}
