import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_math/kinetix_math.dart';

import 'pen_helpers.dart';

MathReading read(List<Stroke> strokes) => readMathInk(strokes);

void main() {
  group('layout to LaTeX', () {
    test('a raised small symbol is a power: x²', () {
      final r = read([...write('x', const Offset(0, 0)), ...write('2', const Offset(36, -18), h: 22)]);
      expect(r.latex, 'x^{2}');
      expect(r.plain, 'x^2');
    });

    test('a bar with ink above and below is a fraction: a/b', () {
      final r = read([
        ...write('a', const Offset(10, 0), h: 30),
        ...[ink(line(const Offset(0, 42), const Offset(54, 42)))],
        ...write('b', const Offset(14, 66), h: 30),
      ]);
      expect(r.latex, r'\frac{a}{b}');
      expect(r.plain, '(a)/(b)');
    });

    test('a tick with a roof over ink is a square root: √2', () {
      final root = ink([const Offset(0, 36), const Offset(10, 30), const Offset(22, 60), const Offset(36, 0), const Offset(90, 0)]);
      final r = read([root, ...write('2', const Offset(44, 12), h: 40)]);
      expect(r.latex, r'\sqrt{2}');
      expect(r.plain, '√(2)');
    });

    test('2 + 3 = 5 with real operators', () {
      final r = read([
        ...write('2', const Offset(0, 0)),
        ...write('+', const Offset(40, 4), h: 32),
        ...write('3', const Offset(86, 0)),
        ...write('=', const Offset(130, 4), h: 32),
        ...write('5', const Offset(176, 0)),
      ]);
      expect(r.latex, '2 + 3 = 5');
      expect(r.looksLikeMaths, isTrue);
      expect(MathSolver.solve(r.plain).answer, 'True');
    });

    test('a cross between numbers is ×, after a number and before + it is the letter x', () {
      final times = read([...write('3', const Offset(0, 0)), ...write('x', const Offset(40, 6), h: 30), ...write('4', const Offset(84, 0))]);
      expect(times.latex, r'3 \times 4');
      expect(times.plain, '3×4');
      final letter = read([
        ...write('2', const Offset(0, 0)),
        ...write('x', const Offset(36, 0)),
        ...write('+', const Offset(82, 4), h: 32),
        ...write('1', const Offset(126, 0)),
      ]);
      expect(letter.latex, '2x + 1');
    });

    test('a fraction in an equation, and powers of brackets', () {
      final half = [
        ...write('1', const Offset(14, 0), h: 30),
        ink(line(const Offset(0, 40), const Offset(50, 40))),
        ...write('2', const Offset(10, 50), h: 30),
        ...write('=', const Offset(70, 28), h: 30),
        ...write('x', const Offset(120, 24), h: 32),
      ];
      expect(read(half).latex, r'\frac{1}{2} = x');
      final sq = read([
        ...write('(', const Offset(0, 0)),
        ...write('a', const Offset(24, 0)),
        ...write(')', const Offset(56, 0)),
        ...write('2', const Offset(82, -20), h: 22),
      ]);
      expect(sq.latex, '(a)^{2}');
    });

    test('Greek letters, integrals and sums typeset as commands', () {
      final r = read([...write('π', const Offset(0, 0)), ...write('2', const Offset(40, -18), h: 22)]);
      expect(r.latex, r'\pi^{2}');
      expect(MathSymbol('Σ').latex, r'\sum');
      expect(MathSymbol('∫').latex, r'\int');
      expect(const MathRow([MathSymbol('π'), MathSymbol('r')]).latex, r'\pi r');
    });

    test('nested: a fraction under a root', () {
      final root = ink([const Offset(0, 50), const Offset(10, 44), const Offset(22, 110), const Offset(36, 0), const Offset(120, 0)]);
      final r = read([
        root,
        ...write('1', const Offset(64, 8), h: 30),
        ink(line(const Offset(46, 50), const Offset(100, 50))),
        ...write('4', const Offset(58, 60), h: 30),
      ]);
      expect(r.latex, r'\sqrt{\frac{1}{4}}');
      expect(MathSolver.solve(r.plain).answer, '1/2');
    });
  });

  group('text readings', () {
    test('mathFix repairs letter-for-digit slips', () {
      expect(mathFix('2t3=5'), '2+3=5');
      expect(mathFix('1S+2O'), '15+20');
      expect(mathFix('2x+5=15'), '2x+5=15');
      expect(mathFix('3b'), '3b');
      expect(mathFix('12:4'), '12÷4');
    });

    test('maths or words', () {
      expect(looksMathy('2x+5=15'), isTrue);
      expect(looksMathy('Photosynthesis'), isFalse);
      expect(looksMathy('42'), isTrue);
    });
  });
}
