import 'package:kinetix_math/kinetix_math.dart';
import 'package:test/test.dart';

MathSolution solve(String s) => MathSolver.solve(s);

/// The expressions of the working, in order.
List<String> working(String s) => solve(s).steps.map((e) => e.expression).toList();

Matcher throwsMath(Object message) => throwsA(isA<MathError>().having((e) => e.message, 'message', message));

void main() {
  group('arithmetic (BODMAS)', () {
    test('multiplication before addition', () {
      final s = solve('2 + 3 * 4');
      expect(s.kind, MathKind.arithmetic);
      expect(s.answer, '14');
      expect(working('2 + 3 * 4'), ['2 + 3 × 4', '2 + 12', '14']);
      expect(s.steps[1].explanation, startsWith('Divide and multiply'));
    });

    test('brackets, then orders, then multiplication', () {
      final s = solve('(2+3)*4^2');
      expect(s.answer, '80');
      expect(working('(2+3)*4^2'), ['(2 + 3) × 4²', '5 × 4²', '5 × 16', '80']);
      expect(s.steps[1].explanation, 'Brackets first: 2 + 3 = 5');
      expect(s.steps[2].explanation, 'Powers and roots: 4² = 16');
    });

    test('division and multiplication left to right', () {
      expect(solve('8 / 2 * 4').answer, '16');
      expect(solve('8 ÷ 2 × 4').answer, '16');
      expect(solve('100 - 20 + 5').answer, '85');
    });

    test('same-stage operations are done together', () {
      expect(working('2*3 + 4*5'), ['2 × 3 + 4 × 5', '6 + 20', '26']);
    });

    test('nested brackets work from the inside out', () {
      final s = solve('2 * (3 + (4 - 1) * 2)');
      expect(s.answer, '18');
      expect(s.steps[1].expression, '2 × (3 + 3 × 2)');
      expect(s.steps[2].expression, '2 × (3 + 6)');
    });

    test('square and curly brackets', () {
      expect(solve('[2 + {3 × 2}] × 2').answer, '16');
    });

    test('exact fractions', () {
      final s = solve('1/3 + 1/6');
      expect(s.answer, '1/2');
      expect(s.decimal, '0.5');
      expect(working('1/3 + 1/6'), ['1/3 + 1/6', '1/2']);
      expect(solve('2(3+4) - 6/4').answer, '25/2');
      expect(solve('2/3 * 3/4').answer, '1/2');
      expect(solve('1/3').decimal, '0.333333');
      // A fraction is a number, not a step; a division still to do is shown with ÷.
      expect(working('2*3 + 1/2'), ['2 × 3 + 1/2', '6 + 1/2', '13/2']);
      expect(working('6/4').first, '6 ÷ 4');
      expect(working('(1/3)^2'), ['(1/3)²', '1/9']);
    });

    test('decimals stay decimals', () {
      expect(solve('0.1 + 0.2').answer, '0.3');
      expect(solve('2.5 * 4').answer, '10');
      expect(solve('.5 + 1').answer, '1.5');
      expect(solve('1.5 / 4').answer, '0.375');
    });

    test('unary minus', () {
      expect(solve('-3^2').answer, '−9');
      expect(solve('(-3)^2').answer, '9');
      expect(solve('10 - -3').answer, '13');
      expect(working('10 - -3').first, '10 − (−3)');
      expect(solve('-(2 + 3)').answer, '−5');
      expect(solve('−4 × −2').answer, '8');
    });

    test('powers', () {
      expect(solve('2^3^2').answer, '512');
      expect(solve('2^-2').answer, '1/4');
      expect(solve('4^(1/2)').answer, '2');
      expect(solve('8^(2/3)').answer, '4');
      expect(solve('(-8)^(1/3)').answer, '−2');
      expect(solve('3²+4²').answer, '25');
      expect(solve('2³').answer, '8');
      expect(solve('2^0.5').answer, '≈ 1.414214');
    });

    test('implicit multiplication', () {
      expect(solve('2(3+4)').answer, '14');
      expect(solve('(1+1)(2+3)').answer, '10');
      expect(solve('2π').answer, '≈ 6.283185');
      expect(solve('3√16').answer, '12');
    });

    test('x between numbers means times when there is no equation', () {
      expect(solve('2 x 3').answer, '6');
      expect(solve('4x5').answer, '20');
    });

    test('square roots', () {
      expect(solve('sqrt(16)').answer, '4');
      expect(solve('√16 + √9').answer, '7');
      expect(solve('√(9/4)').answer, '3/2');
      expect(solve('sqrt 2').answer, '≈ 1.414214');
      expect(solve('√8').steps.last.explanation, 'Powers and roots: √8 ≈ 2.828427');
    });

    test('trigonometry in degrees, exact where possible', () {
      expect(solve('sin 30').answer, '1/2');
      expect(solve('sin(30)').steps.first.expression, 'sin(30°)');
      expect(solve('cos 60 + sin 90').answer, '3/2');
      expect(solve('tan 45').answer, '1');
      expect(solve('cos 180').answer, '−1');
      expect(solve('sin 45').answer, '≈ 0.707107');
      expect(solve('sin 45').values.single, closeTo(0.7071067811865476, 1e-12));
      expect(solve('sin(30)^2 + cos(30)^2').values.single, closeTo(1, 1e-12));
    });

    test('logarithms', () {
      expect(solve('log 1000').answer, '3');
      expect(solve('log(0.01)').answer, '−2');
      expect(solve('log 1').answer, '0');
      expect(solve('ln 1').answer, '0');
      expect(solve('ln e').values.single, closeTo(1, 1e-12));
      expect(solve('log 2').answer, '≈ 0.30103');
    });

    test('abs, pi and e', () {
      expect(solve('abs(-7) + 2').answer, '9');
      expect(solve('pi').values.single, closeTo(3.141592653589793, 1e-15));
      expect(solve('π × 2²').answer, '≈ 12.566371');
      expect(solve('e^2').values.single, closeTo(7.38905609893065, 1e-12));
    });

    test('long expressions are capped and still answered', () {
      final input = List.filled(60, '1').join(' + ');
      final s = solve(input);
      expect(s.answer, '60');
      expect(s.steps.length, lessThanOrEqualTo(42));
    });

    test('very large whole numbers stay exact', () {
      expect(solve('2^100').answer, '1267650600228229401496703205376');
    });
  });

  group('statements', () {
    test('true and false', () {
      expect(solve('2 + 3 = 5').answer, 'True');
      expect(solve('2 + 3 = 5').kind, MathKind.statement);
      expect(solve('2 × 3 = 5').answer, 'False');
    });
  });

  group('simplify', () {
    test('collects like terms', () {
      final s = solve('2x + 3x - 4');
      expect(s.kind, MathKind.simplify);
      expect(s.answer, '5x − 4');
    });

    test('expands brackets', () {
      expect(solve('(x+1)(x-1)').answer, 'x² − 1');
      expect(solve('(x + 2)^2').answer, 'x² + 4x + 4');
      expect(solve('3(2y - 1) + y').answer, '7y − 3');
    });
  });

  group('linear equations', () {
    test('3x + 5 = 20', () {
      final s = solve('3x + 5 = 20');
      expect(s.kind, MathKind.linear);
      expect(s.variable, 'x');
      expect(s.answer, 'x = 5');
      expect(s.values, [5]);
      expect(working('3x + 5 = 20'), ['3x + 5 = 20', '3x = 15', 'x = 5', '3 × 5 + 5 = 20 ✓']);
      expect(s.steps[1].explanation, 'Subtract 5 from both sides');
      expect(s.steps[2].explanation, 'Divide both sides by 3');
    });

    test('2(x − 1) = x + 4 expands, collects and isolates', () {
      final s = solve('2(x-1) = x + 4');
      expect(s.answer, 'x = 6');
      expect(working('2(x-1) = x + 4'), [
        '2(x − 1) = x + 4',
        '2x − 2 = x + 4',
        'x − 2 = 4',
        'x = 6',
        '2(6 − 1) = 10  and  6 + 4 = 10 ✓',
      ]);
      expect(s.steps[1].explanation, startsWith('Expand the brackets'));
      expect(s.steps[2].explanation, 'Subtract x from both sides');
      expect(s.steps[3].explanation, 'Add 2 to both sides');
    });

    test('fraction answers with a decimal', () {
      final s = solve('3x = 7');
      expect(s.answer, 'x = 7/3');
      expect(s.decimal, 'x ≈ 2.333333');
    });

    test('fractions in the equation', () {
      final s = solve('x/2 + 1/3 = 1');
      expect(s.answer, 'x = 4/3');
      expect(s.steps.map((e) => e.explanation), contains('Multiply both sides by 2'));
    });

    test('negative coefficient and unknown on the right', () {
      expect(solve('5 = 2 - x').answer, 'x = −3');
      expect(solve('-x = 4').steps.map((e) => e.explanation), contains('Multiply both sides by −1'));
      expect(solve('4 - 3x = 2x - 6').answer, 'x = 2');
    });

    test('other letters and decimals', () {
      expect(solve('3y + 2 = 11').answer, 'y = 3');
      expect(solve('1.5x = 4.5').answer, 'x = 3');
      expect(solve('0.2x + 1 = 2').answer, 'x = 5');
    });

    test('x² terms that cancel', () {
      final s = solve('x^2 + x = x^2 + 3');
      expect(s.kind, MathKind.linear);
      expect(s.answer, 'x = 3');
    });

    test('no solution and every number', () {
      expect(solve('x + 1 = x + 2').answer, 'No solution');
      expect(solve('2(x + 1) = 2x + 2').answer, 'Every number is a solution');
    });

    test('irrational coefficients fall back to decimals', () {
      final s = solve('πx = 2π');
      expect(s.values.single, closeTo(2, 1e-12));
    });
  });

  group('quadratic equations', () {
    test('x² − 5x + 6 = 0 with discriminant and factors', () {
      final s = solve('x^2 - 5x + 6 = 0');
      expect(s.kind, MathKind.quadratic);
      expect(s.answer, 'x = 2 or x = 3');
      expect(s.values, [2, 3]);
      final text = s.steps.map((e) => '${e.explanation} | ${e.expression}').toList();
      expect(text, contains('Compare with ax² + bx + c = 0 | a = 1,  b = −5,  c = 6'));
      expect(text, contains('Find the discriminant D = b² − 4ac | D = (−5)² − 4 × 1 × 6 = 25 − 24 = 1'));
      expect(text, contains('Factorised form | x² − 5x + 6 = (x − 2)(x − 3)'));
    });

    test('surd roots are simplified', () {
      final s = solve('x^2 - 5x + 3 = 0');
      expect(s.answer, 'x = (5 ± √13)/2');
      expect(s.values[0], closeTo(0.6972243622680054, 1e-12));
      expect(s.values[1], closeTo(4.302775637731995, 1e-12));
      expect(solve('x^2 = 4x - 1').answer, 'x = 2 ± √3');
      expect(solve('x^2 - 2 = 0').answer, 'x = ±√2');
      expect(solve('x^2 - 8 = 0').answer, 'x = ±2√2');
    });

    test('non-standard forms are rearranged', () {
      final s = solve('x^2 = 4x - 1');
      expect(s.steps[1].explanation, 'Bring every term to the left side and simplify');
      expect(s.steps[1].expression, 'x² − 4x + 1 = 0');
      expect(solve('x(x - 3) = 0').answer, 'x = 0 or x = 3');
      expect(solve('(x+1)(x-2) = 4').answer, 'x = −2 or x = 3');
      expect(solve('x² = 9').answer, 'x = −3 or x = 3');
      expect(solve('3 = x^2 - 2x').answer, 'x = −1 or x = 3');
    });

    test('negative leading coefficient, fractions and common factors are tidied', () {
      final neg = solve('-x^2 + 2x + 3 = 0');
      expect(neg.answer, 'x = −1 or x = 3');
      expect(neg.steps.map((e) => e.explanation), contains('Multiply both sides by −1 so the x² term is positive'));
      final frac = solve('x^2/2 - x/3 = 1');
      expect(frac.steps.map((e) => e.explanation), contains('Multiply both sides by 6 to clear the fractions'));
      expect(frac.answer, 'x = (1 ± √19)/3');
      final common = solve('2x^2 - 10x + 12 = 0');
      expect(common.steps.map((e) => e.explanation), contains('Divide both sides by 2'));
      expect(common.answer, 'x = 2 or x = 3');
    });

    test('rational roots with a ≠ 1', () {
      final s = solve('2x^2 - 5x + 2 = 0');
      expect(s.answer, 'x = 1/2 or x = 2');
      expect(s.steps.last.expression, '2x² − 5x + 2 = (2x − 1)(x − 2)');
    });

    test('repeated root', () {
      final s = solve('x^2 - 4x + 4 = 0');
      expect(s.answer, 'x = 2 (repeated root)');
      expect(s.steps.last.expression, 'x² − 4x + 4 = (x − 2)²');
      expect(solve('4x^2 + 4x + 1 = 0').answer, 'x = −1/2 (repeated root)');
    });

    test('no real roots gives the complex roots', () {
      final s = solve('x^2 + x + 1 = 0');
      expect(s.answer, 'No real roots: x = (−1 ± i√3)/2');
      expect(s.decimal, 'x ≈ −0.5 ± 0.866025i');
      expect(s.values, isEmpty);
      expect(solve('x^2 + 4 = 0').answer, 'No real roots: x = ±2i');
      expect(solve('3x^2 + 2x + 5 = 0').answer, 'No real roots: x = (−1 ± i√14)/3');
    });

    test('irrational coefficients use decimals', () {
      final s = solve('x^2 + πx - 1 = 0');
      expect(s.values, hasLength(2));
      for (final x in s.values) {
        expect(x * x + 3.141592653589793 * x - 1, closeTo(0, 1e-9));
      }
    });
  });

  group('errors', () {
    test('empty input', () => expect(() => solve('  '), throwsMath(contains('Type a sum'))));
    test('unclosed bracket', () => expect(() => solve('(2 + 3'), throwsMath(contains('not closed'))));
    test('extra bracket', () => expect(() => solve('2 + 3)'), throwsMath(contains('without a matching'))));
    test('missing operand', () => expect(() => solve('2 +'), throwsMath(contains('ends too early'))));
    test('two numbers', () => expect(() => solve('2 3'), throwsMath(contains('operator'))));
    test('unknown symbol', () => expect(() => solve('2 # 3'), throwsMath(contains('“#”'))));
    test('division by zero', () => expect(() => solve('5/0'), throwsMath(contains('Division by zero'))));
    test('tan 90', () => expect(() => solve('tan 90'), throwsMath(contains('not defined'))));
    test('square root of a negative', () => expect(() => solve('√(-4)'), throwsMath(contains('not a real number'))));
    test('log of zero', () => expect(() => solve('log 0'), throwsMath(contains('positive'))));
    test('two unknowns', () => expect(() => solve('x + y = 2'), throwsMath(contains('more than one unknown'))));
    test('cubic', () => expect(() => solve('x^3 = 8'), throwsMath(contains('not supported yet'))));
    test('unknown in a denominator', () => expect(() => solve('1/x = 2'), throwsMath(contains('denominator'))));
    test('unknown inside a function', () => expect(() => solve('sin x = 1'), throwsMath(contains('not supported yet'))));
    test('two equals signs', () => expect(() => solve('x = 2 = 3'), throwsMath(contains('one “=”'))));
    test('nothing after equals', () => expect(() => solve('x + 1 ='), throwsMath(contains('after “=”'))));
    test('empty brackets', () => expect(() => solve('2()'), throwsMath(contains('nothing inside'))));
    test('bad number', () => expect(() => solve('1.2.3'), throwsMath(contains('not a number'))));
  });
}
