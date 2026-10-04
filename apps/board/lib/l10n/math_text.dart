import 'package:kinetix_math/kinetix_math.dart';

import 'gen/app_localizations.dart';

/// Puts the offline maths solver's working into the board's language.
///
/// package:kinetix_math writes its explanations, answers and errors in English. The patterns
/// here follow its wording (packages/kinetix_math/lib/src); the maths itself (numbers,
/// expressions, x) is kept as written. Anything not recognised is shown in English, so a
/// change in the package never hides a step, it only shows it untranslated.
class MathText {
  MathText(this.l);

  final AppLocalizations l;

  bool get _english => l.localeName == 'en';

  String kind(MathKind k) => switch (k) {
    MathKind.arithmetic => l.mathKindArithmetic,
    MathKind.simplify => l.mathKindSimplify,
    MathKind.statement => l.mathKindCheck,
    MathKind.linear => l.mathKindLinear,
    MathKind.quadratic => l.mathKindQuadratic,
  };

  late final Map<String, String> _fixedSteps = {
    'Work out the rest': l.mathStepWorkOutRest,
    'Start with the expression': l.mathStepStartExpression,
    'Start with the statement': l.mathStepStartStatement,
    'Work out the left side': l.mathStepLeftSide,
    'Work out the right side': l.mathStepRightSide,
    'Both sides are equal, so the statement is true': l.mathStepStatementTrue,
    'The sides are different, so the statement is false': l.mathStepStatementFalse,
    'Expand the brackets and collect like terms': l.mathStepExpand,
    'Write the equation': l.mathStepWriteEquation,
    'Expand the brackets and collect like terms on each side': l.mathStepExpandEachSide,
    'Both sides are always equal': l.mathStepAlwaysEqual,
    'The two sides can never be equal': l.mathStepNeverEqual,
    'Bring every term to the left side and simplify': l.mathStepBringLeft,
    'D = 0, so the two roots are equal': l.mathStepEqualRoots,
    'D < 0, so there are no real roots. The roots are complex numbers': l.mathStepComplexRoots,
    'D > 0, so there are two different real roots': l.mathStepTwoRealRoots,
    'Work out the two roots': l.mathStepTwoRoots,
    'Simplify the square root': l.mathStepSimplifyRoot,
    'So the roots are': l.mathStepSoRoots,
    'In decimals': l.mathStepInDecimals,
    'Work out the roots': l.mathStepWorkOutRoots,
    'Factorised form': l.mathStepFactorised,
  };

  late final Map<String, String> _stages = {
    'Brackets first': l.mathStepBrackets,
    'Powers and roots': l.mathStepPowers,
    'Divide and multiply, left to right': l.mathStepDivideMultiply,
    'Add and subtract, left to right': l.mathStepAddSubtract,
  };

  /// Most specific first: "Multiply both sides by 6 to clear the fractions" before
  /// "Multiply both sides by 6".
  late final List<(RegExp, String Function(Match))> _stepPatterns = [
    (RegExp(r'^To find (.+?), write an equation, e\.g\. (.+)$'), (m) => l.mathStepToFind(m[1]!, m[2]!)),
    (RegExp(r'^Subtract (.+) from both sides; the (.+) terms cancel$'), (m) => l.mathStepSquaresCancel(m[1]!, m[2]!)),
    (RegExp(r'^Add (.+) to both sides$'), (m) => l.mathStepAddBoth(m[1]!)),
    (RegExp(r'^Subtract (.+) from both sides$'), (m) => l.mathStepSubtractBoth(m[1]!)),
    (RegExp(r'^Multiply both sides by (.+) to clear the fractions$'), (m) => l.mathStepClearFractions(m[1]!)),
    (RegExp(r'^Multiply both sides by (.+) so the (.+) term is positive$'), (m) => l.mathStepMakePositive(m[1]!, m[2]!)),
    (RegExp(r'^Multiply both sides by (.+)$'), (m) => l.mathStepMultiplyBoth(m[1]!)),
    (RegExp(r'^Divide both sides by (.+)$'), (m) => l.mathStepDivideBoth(m[1]!)),
    (RegExp(r'^Divide the top and bottom by (.+)$'), (m) => l.mathStepDivideTopBottom(m[1]!)),
    (RegExp(r'^Check: put (.+) back into the equation$'), (m) => l.mathStepCheck(m[1]!)),
    (RegExp(r'^Compare with (.+)$'), (m) => l.mathStepCompare(m[1]!)),
    (RegExp(r'^Find the discriminant (.+)$'), (m) => l.mathStepDiscriminant(m[1]!)),
    (RegExp(r'^Use the quadratic formula (.+)$'), (m) => l.mathStepQuadraticFormula(m[1]!)),
    (RegExp(r'^Use (.+)$'), (m) => l.mathStepUse(m[1]!)),
  ];

  /// One line of working, e.g. "Subtract 5 from both sides".
  String step(String s) {
    if (_english) return s;
    final fixed = _fixedSteps[s];
    if (fixed != null) return fixed;
    final colon = s.indexOf(': ');
    if (colon > 0) {
      final stage = _stages[s.substring(0, colon)];
      if (stage != null) return '$stage${s.substring(colon)}';
    }
    for (final (re, build) in _stepPatterns) {
      final m = re.firstMatch(s);
      if (m != null) return build(m);
    }
    return s;
  }

  /// A line of maths that may carry words: "x = 2 or x = 3", "… for every x", "… is false".
  String expression(String e) {
    if (_english) return e;
    final every = RegExp(r'^(.*) for every (\S+)$').firstMatch(e);
    if (every != null) return l.mathForEvery(every[1]!, every[2]!);
    final isFalse = RegExp(r'^(.*) is false$').firstMatch(e);
    if (isFalse != null) return l.mathIsFalse(isFalse[1]!);
    return e.replaceAll(RegExp(r'(?<= )or(?= )'), l.mathOr).replaceAll(RegExp(r'(?<= )and(?= )'), l.mathAnd);
  }

  /// The final answer, e.g. "x = 5", "True", "No solution".
  String answer(String a) {
    if (_english) return a;
    switch (a) {
      case 'True':
        return l.mathTrue;
      case 'False':
        return l.mathFalse;
      case 'Every number is a solution':
        return l.mathEveryNumber;
      case 'No solution':
        return l.mathNoSolution;
    }
    final repeated = RegExp(r'^(.*) \(repeated root\)$').firstMatch(a);
    if (repeated != null) return l.mathRepeatedRoot(expression(repeated[1]!));
    final noReal = RegExp(r'^No real roots: (.*)$').firstMatch(a);
    if (noReal != null) return l.mathNoRealRoots(expression(noReal[1]!));
    return expression(a);
  }

  late final Map<String, String> _fixedErrors = {
    '0⁰ is not defined.': l.mathErrZeroPowerZero,
    'Division by zero is not defined.': l.mathErrDivisionByZero,
    'A negative number to a fractional power is not a real number.': l.mathErrNegativeFractionalPower,
    'The square root of a negative number is not a real number.': l.mathErrNegativeRoot,
    'The answer is too large or not defined.': l.mathErrTooLarge,
    'Type a sum or an equation, like 3x + 5 = 20.': l.mathErrEmpty,
    'Write something after “=”.': l.mathErrAfterEquals,
    'Use only one “=” sign.': l.mathErrOneEquals,
    'There is a “)” without a matching “(”.': l.mathErrUnmatchedClose,
    'The expression ends too early. Is something missing?': l.mathErrEndsEarly,
    'Put an operator (+ − × ÷) between the numbers.': l.mathErrOperatorBetween,
    'Write the power after “^”.': l.mathErrPowerAfterCaret,
    'There is nothing inside the brackets “()”.': l.mathErrEmptyBrackets,
    'A bracket is not closed. Add “)”.': l.mathErrBracketNotClosed,
    'Write something before “=”.': l.mathErrBeforeEquals,
    'Write something on both sides of “=”.': l.mathErrBothSides,
    'The unknown in a denominator is not supported yet.': l.mathErrUnknownDenominator,
    'The unknown in a power is not supported yet.': l.mathErrUnknownPower,
    'Powers of the unknown must be whole numbers like x² or x³.': l.mathErrWholePowers,
  };

  late final List<(RegExp, String Function(Match))> _errorPatterns = [
    (RegExp(r'^(tan .+°) is not defined\.$'), (m) => l.mathErrNotDefined(m[1]!)),
    (RegExp(r'^(\w+) is only defined for positive numbers\.$'), (m) => l.mathErrPositiveOnly(m[1]!)),
    (RegExp(r'^Unknown function (.+)\.$'), (m) => l.mathErrUnknownFunction(m[1]!)),
    (RegExp(r'^“(.+)” has no value\.$'), (m) => l.mathErrNoValue(m[1]!)),
    (RegExp(r'^“(.+)” is not a number\.$'), (m) => l.mathErrNotANumber(m[1]!)),
    (RegExp(r'^I don’t understand “(.+)”\. Use numbers'), (m) => l.mathErrDontUnderstandUse(m[1]!)),
    (RegExp(r'^I don’t understand “(.+)” here\.$'), (m) => l.mathErrDontUnderstandHere(m[1]!)),
    (RegExp(r'^Write a number after (.+)\.$'), (m) => l.mathErrNumberAfter(m[1]!)),
    (RegExp(r'^Something is missing before “(.+)”\.$'), (m) => l.mathErrMissingBefore(m[1]!)),
    (RegExp(r'^The unknown inside (.+) is not supported yet\.$'), (m) => l.mathErrUnknownInside(m[1]!)),
    (RegExp(r'^This has more than one unknown \((.+)\)\.'), (m) => l.mathErrManyUnknowns(m[1]!)),
    (RegExp(r'^Equations with (.+) or higher powers are not supported yet\.'), (m) => l.mathErrHighPowers(m[1]!)),
  ];

  /// Why the input could not be solved.
  String error(String message) {
    if (_english) return message;
    final fixed = _fixedErrors[message];
    if (fixed != null) return fixed;
    for (final (re, build) in _errorPatterns) {
      final m = re.firstMatch(message);
      if (m != null) return build(m);
    }
    return message;
  }
}
