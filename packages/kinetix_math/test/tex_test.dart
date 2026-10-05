import 'package:kinetix_math/kinetix_math.dart';
import 'package:test/test.dart';

void main() {
  group('MathTex.fromText', () {
    test('equations keep the order and signs they were written with', () {
      expect(MathTex.fromText('2x+5=15'), '2x + 5 = 15');
      expect(MathTex.fromText('3×4=12'), r'3 \times 4 = 12');
      expect(MathTex.fromText('x^2-5x+6=0'), 'x^{2} - 5x + 6 = 0');
      expect(MathTex.fromText('x ≤ 7'), r'x \le 7');
      expect(MathTex.fromText('a<b'), 'a < b');
    });

    test('fractions, roots, brackets, π and decimals', () {
      expect(MathTex.fromText('(1)/(2)=0.5'), r'\frac{1}{2} = 0.5');
      expect(MathTex.fromText('√50'), r'\sqrt{50}');
      expect(MathTex.fromText('2(x+1)'), r'2\left(x + 1\right)');
      expect(MathTex.fromText('πr^2'), r'\pi r^{2}');
      expect(MathTex.fromText('12÷4=3'), r'12 \div 4 = 3');
    });

    test('words and broken input are not maths', () {
      expect(MathTex.fromText('Photosynthesis'), isNull);
      expect(MathTex.fromText('2+'), isNull);
      expect(MathTex.fromText('=5'), isNull);
    });
  });

  group('MathTex.toText', () {
    test('LaTeX back to what the solver reads', () {
      expect(MathTex.toText(r'\frac{1}{2} + x^{2} = \sqrt{16}'), '(1)/(2) + x^2 = √(16)');
      expect(MathTex.toText(r'3 \times 4 \div 2'), '3 × 4 ÷ 2');
      expect(MathTex.toText(r'\frac{\frac{a}{b}}{c}'), '((a)/(b))/(c)');
      expect(MathTex.toText(r'2\left(x + 1\right)^{10}'), '2(x + 1)^(10)');
    });

    test('round trip through the solver', () {
      expect(MathSolver.solve(MathTex.toText(MathTex.fromText('3x+5=20')!)).answer, 'x = 5');
      expect(MathSolver.solve(MathTex.toText(r'\frac{1}{2} + \frac{1}{3}')).answer, '5/6');
    });
  });
}
