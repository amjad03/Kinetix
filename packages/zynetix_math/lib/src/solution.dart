/// What kind of problem the input was.
enum MathKind {
  /// A calculation such as 2 + 3 × 4, worked out with BODMAS.
  arithmetic,

  /// An expression in one unknown, expanded and simplified (no "=").
  simplify,

  /// A statement with no unknown, such as 2 + 3 = 5, checked true or false.
  statement,

  /// A linear equation in one unknown, such as 3x + 5 = 20.
  linear,

  /// A quadratic equation, such as x² − 5x + 6 = 0.
  quadratic,
}

/// One line of working: what was done, and the result.
class MathStep {
  const MathStep(this.explanation, this.expression);

  /// e.g. "Subtract 5 from both sides".
  final String explanation;

  /// e.g. "3x = 15".
  final String expression;

  @override
  String toString() => '$explanation: $expression';
}

/// A worked solution.
class MathSolution {
  const MathSolution({
    required this.input,
    required this.kind,
    required this.answer,
    required this.steps,
    this.decimal,
    this.variable,
    this.values = const [],
  });

  /// What was typed.
  final String input;
  final MathKind kind;

  /// The final answer as written on the board, e.g. "x = 5", "7/2", "x = 2 ± √3".
  final String answer;

  /// The answer in decimals when [answer] is a fraction or surd, e.g. "x ≈ 3.732051 or x ≈ 0.267949".
  final String? decimal;

  /// The unknown solved for, if any.
  final String? variable;

  /// Real numeric answers (the value, or the real roots), for checking and plotting.
  final List<double> values;

  final List<MathStep> steps;

  String get kindLabel => switch (kind) {
    MathKind.arithmetic => 'Arithmetic',
    MathKind.simplify => 'Simplify',
    MathKind.statement => 'Check',
    MathKind.linear => 'Linear equation',
    MathKind.quadratic => 'Quadratic equation',
  };
}
