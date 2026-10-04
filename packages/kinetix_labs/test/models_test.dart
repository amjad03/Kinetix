import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_labs/kinetix_labs.dart';

void main() {
  group("Ohm's law circuit", () {
    test('series: R = R1 + R2 + R3, same current everywhere', () {
      const c = Circuit(voltage: 6, resistors: [2, 4, 6]);
      expect(c.equivalentResistance, 12);
      expect(c.current, 0.5);
      expect(c.resistorCurrents, [0.5, 0.5, 0.5]);
      expect(c.resistorVoltages, [1, 2, 3]);
      expect(c.power, 3);
    });

    test('parallel: 1/R = 1/R1 + 1/R2 + 1/R3, full voltage across each', () {
      const c = Circuit(voltage: 6, resistors: [2, 3, 6], arrangement: Arrangement.parallel);
      expect(c.equivalentResistance, closeTo(1, 1e-12));
      expect(c.current, closeTo(6, 1e-12));
      expect(c.resistorCurrents, [3, 2, 1]);
      expect(c.resistorVoltages, [6, 6, 6]);
      expect(c.equivalentResistance, lessThan(2)); // less than the smallest
    });

    test('an open key stops the current', () {
      const c = Circuit(voltage: 6, resistors: [5], keyClosed: false);
      expect(c.current, 0);
      expect(c.voltmeterReading, 0);
    });

    test('V–I is linear: doubling V doubles I', () {
      const a = Circuit(voltage: 3, resistors: [5, 10]);
      expect(a.copyWith(voltage: 6).current, closeTo(2 * a.current, 1e-12));
    });
  });

  group('Lens formula 1/v − 1/u = 1/f (convex lens, f = +10 cm)', () {
    OpticsImage lens(double u) => formImage(OpticKind.convexLens, u, 10);

    test('object beyond 2F: real, inverted, diminished, between F and 2F', () {
      final i = lens(-30);
      expect(i.v, closeTo(15, 1e-9));
      expect(i.m, closeTo(-0.5, 1e-9));
      expect([i.nature, i.orientation, i.size], ['Real', 'Inverted', 'Diminished']);
      expect(i.position, 'Between F and 2F on the other side');
      expect(i.objectPosition, 'Beyond 2F');
    });

    test('object at 2F: image at 2F, same size', () {
      final i = lens(-20);
      expect(i.v, closeTo(20, 1e-9));
      expect(i.m, closeTo(-1, 1e-9));
      expect(i.size, 'Same size');
      expect(i.position, 'At 2F on the other side');
    });

    test('object between F and 2F: beyond 2F, magnified', () {
      final i = lens(-15);
      expect(i.v, closeTo(30, 1e-9));
      expect(i.m, closeTo(-2, 1e-9));
      expect(i.size, 'Magnified');
      expect(i.position, 'Beyond 2F on the other side');
    });

    test('object at F: image at infinity', () {
      final i = lens(-10);
      expect(i.atInfinity, isTrue);
      expect(i.position, 'At infinity');
      expect(i.size, 'Highly magnified');
      expect(i.objectPosition, 'At F');
    });

    test('object between F and O: virtual, erect, magnified, same side', () {
      final i = lens(-5);
      expect(i.v, closeTo(-10, 1e-9));
      expect(i.m, closeTo(2, 1e-9));
      expect([i.nature, i.orientation, i.size], ['Virtual', 'Erect', 'Magnified']);
      expect(i.position, 'On the same side as the object');
    });

    test('concave lens: always virtual, erect, diminished, between F and O', () {
      for (final u in [-5.0, -10.0, -20.0, -50.0]) {
        final i = formImage(OpticKind.concaveLens, u, 10);
        expect(i.f, -10);
        expect(i.v!, lessThan(0));
        expect(i.v!.abs(), lessThan(10));
        expect([i.nature, i.orientation, i.size], ['Virtual', 'Erect', 'Diminished'], reason: 'u = $u');
      }
      expect(formImage(OpticKind.concaveLens, -20, 10).v, closeTo(-20 / 3, 1e-9));
    });
  });

  group('Mirror formula 1/v + 1/u = 1/f (concave mirror, f = −10 cm)', () {
    OpticsImage mirror(double u) => formImage(OpticKind.concaveMirror, u, 10);

    test('beyond C: between F and C, real, inverted, diminished', () {
      final i = mirror(-30);
      expect(i.f, -10);
      expect(i.v, closeTo(-15, 1e-9));
      expect(i.m, closeTo(-0.5, 1e-9));
      expect([i.nature, i.orientation, i.size], ['Real', 'Inverted', 'Diminished']);
      expect(i.position, 'Between F and C');
    });

    test('at C: at C, same size', () {
      final i = mirror(-20);
      expect(i.v, closeTo(-20, 1e-9));
      expect(i.m, closeTo(-1, 1e-9));
      expect(i.position, 'At C');
    });

    test('between C and F: beyond C, magnified', () {
      final i = mirror(-15);
      expect(i.v, closeTo(-30, 1e-9));
      expect(i.m, closeTo(-2, 1e-9));
      expect(i.position, 'Beyond C');
    });

    test('at F: at infinity', () {
      expect(mirror(-10).atInfinity, isTrue);
    });

    test('between F and P: behind the mirror, virtual, erect, magnified', () {
      final i = mirror(-5);
      expect(i.v, closeTo(10, 1e-9));
      expect(i.m, closeTo(2, 1e-9));
      expect([i.nature, i.orientation, i.size], ['Virtual', 'Erect', 'Magnified']);
      expect(i.position, 'Behind the mirror');
    });

    test('convex mirror (f = +10): always virtual, erect, diminished, behind', () {
      final i = formImage(OpticKind.convexMirror, -20, 10);
      expect(i.f, 10);
      expect(i.v, closeTo(20 / 3, 1e-9));
      expect(i.m, closeTo(1 / 3, 1e-9));
      expect([i.nature, i.orientation, i.size], ['Virtual', 'Erect', 'Diminished']);
      expect(i.position, 'Between P and F, behind the mirror');
    });
  });

  group('Simple pendulum', () {
    test('T = 2π√(L/g)', () {
      expect(smallAnglePeriod(1, 9.8), closeTo(2.00709, 1e-5));
      expect(smallAnglePeriod(4, 9.8), closeTo(2 * smallAnglePeriod(1, 9.8), 1e-12)); // 4× length, 2× period
      expect(smallAnglePeriod(1, 1.62) / smallAnglePeriod(1, 9.8), closeTo(math.sqrt(9.8 / 1.62), 1e-12));
    });

    test('large amplitudes lengthen the period (exact AGM result)', () {
      final t0 = smallAnglePeriod(1, 9.8);
      expect(exactPeriod(1, 9.8, 1e-6), closeTo(t0, 1e-9));
      // Known: T(90°) = 1.18034 × T0.
      expect(exactPeriod(1, 9.8, math.pi / 2) / t0, closeTo(1.18034, 1e-5));
      expect(exactPeriod(1, 9.8, 30 * math.pi / 180) / t0, closeTo(1.01741, 1e-5));
    });

    test('the simulation swings with the exact period', () {
      for (final amp in [5.0, 45.0]) {
        final sim = PendulumSim(length: 1, g: 9.8, amplitudeDeg: amp);
        for (var i = 0; i < 600; i++) {
          sim.step(1 / 60);
        }
        expect(sim.lastPeriod, closeTo(exactPeriod(1, 9.8, amp * math.pi / 180), 1e-3), reason: '$amp°');
      }
    });

    test('the stopwatch times 10 oscillations from the mean position', () {
      final sim = PendulumSim(length: 0.5, g: 9.8, amplitudeDeg: 8)..startStopwatch();
      expect(sim.timing, isTrue);
      var t = 0.0;
      while (sim.measuredTotal == null && t < 60) {
        sim.step(1 / 60);
        t += 1 / 60;
      }
      expect(sim.oscillations, 10);
      expect(sim.measuredPeriod, closeTo(exactPeriod(0.5, 9.8, 8 * math.pi / 180), 1e-3));
      expect(sim.stopwatchRunning, isFalse);
    });
  });

  group('Break-even analysis', () {
    const b = BreakEven(fixedCost: 200000, variableCostPerUnit: 60, sellingPrice: 100, salesUnits: 8000);

    test('BEP, P/V ratio, margin of safety and profit', () {
      expect(b.contributionPerUnit, 40);
      expect(b.pvRatio, 0.4);
      expect(b.breakEvenUnits, 5000);
      expect(b.breakEvenSales, closeTo(500000, 1e-6));
      expect(b.marginOfSafetyUnits, 3000);
      expect(b.marginOfSafetySales, closeTo(300000, 1e-6));
      expect(b.marginOfSafetyPercent, closeTo(37.5, 1e-9));
      expect(b.profit, 120000);
      // Profit = MoS × P/V ratio.
      expect(b.profit, closeTo(b.marginOfSafetySales * b.pvRatio, 1e-6));
      expect(b.totalCostAt(b.breakEvenUnits), closeTo(b.revenueAt(b.breakEvenUnits), 1e-6));
    });

    test('no break-even when the price does not cover the variable cost', () {
      expect(b.copyWith(sellingPrice: 60).canBreakEven, isFalse);
      expect(b.copyWith(salesUnits: 4000).profit, -40000);
    });

    test('Indian rupee formatting', () {
      expect(formatInr(1234567.891), '₹12,34,567.89');
      expect(formatInr(500000), '₹5,00,000.00');
      expect(formatInr(999), '₹999.00');
      expect(formatInr(-40000), '−₹40,000.00');
      expect(formatInr(-0.001), '₹0.00');
      expect(formatInr(123456789, decimals: 0), '₹12,34,56,789');
      expect(formatInrCompact(250000), '₹2.5 L');
      expect(formatInrCompact(12000000), '₹1.2 Cr');
      expect(formatInrCompact(50000), '₹50,000');
      expect(formatUnits(5000), '5,000');
      expect(formatUnits(1234.5, decimals: 2), '1,234.50');
    });
  });

  group('Graph plotter', () {
    double ev(String s, double x, {bool degrees = true}) => ExpressionParser.parse(s, degrees: degrees).eval(x);

    test('parser: precedence, implicit multiplication, functions in degrees', () {
      expect(ev('2 + 3 * 4', 0), 14);
      expect(ev('-x^2', 3), -9);
      expect(ev('2^3^2', 0), 512);
      expect(ev('2x + 1', 3), 7);
      expect(ev('(x - 1)(x + 2)', 2), 4);
      expect(ev('y = 3x', 2), 6);
      expect(ev('sin(30)', 0), closeTo(0.5, 1e-12));
      expect(ev('2cos x', 60), closeTo(1, 1e-12));
      expect(ev('sin(pi/6)', 0, degrees: false), closeTo(0.5, 1e-12));
      expect(ev('sqrt(16) + abs(-2)', 0), 6);
      expect(ev('x²', 5), 25);
      expect(ev('3 × 4 ÷ 2 − 1', 0), 5);
      expect(() => ExpressionParser.parse('2 + '), throwsFormatException);
      expect(() => ExpressionParser.parse('(x + 1'), throwsFormatException);
      expect(() => ExpressionParser.parse('foo(x)'), throwsFormatException);
    });

    test('quadratic roots from the discriminant, and the vertex', () {
      expect(quadraticRoots(1, -2, -3), [-1, 3]);
      expect(quadraticRoots(1, -4, 4), [2]); // repeated root, D = 0
      expect(quadraticRoots(1, 0, 1), isEmpty); // D < 0
      expect(quadraticRoots(0, 2, -4), [2]); // degenerate: linear
      final r = quadraticRoots(2, 3, -2);
      expect(r[0], closeTo(-2, 1e-12));
      expect(r[1], closeTo(0.5, 1e-12));
      expect(quadraticVertex(1, -2, -3), (1, -4));
      const f = PlotFunction(mode: PlotMode.quadratic, a: 1, b: -2, c: -3);
      expect(f.discriminant, 16);
      expect(f.roots(-10, 10), [-1, 3]);
      expect(f.roots(0, 10), [3]);
    });

    test('linear root and trig zeros in degrees', () {
      const lin = PlotFunction(mode: PlotMode.linear, a: 2, b: -3);
      expect(lin.roots(-10, 10), [1.5]);
      const s = PlotFunction(mode: PlotMode.sine, a: 2, b: 1);
      final z = s.roots(-359, 359);
      expect(z, hasLength(3));
      expect(z[0], closeTo(-180, 1e-6));
      expect(z[1], closeTo(0, 1e-6));
      expect(z[2], closeTo(180, 1e-6));
      const c = PlotFunction(mode: PlotMode.cosine, a: 1, b: 2); // period 180°
      final zc = c.roots(0, 180);
      expect(zc.map((v) => v.roundToDouble()), [45, 135]);
    });

    test('numerical roots: sign changes, a touching root, and no false roots at asymptotes', () {
      final cubic = ExpressionParser.parse('x^3 - 4x');
      final r = findRoots(cubic.eval, -10, 10);
      expect(r, hasLength(3));
      expect(r[0], closeTo(-2, 1e-9));
      expect(r[1], closeTo(0, 1e-9));
      expect(r[2], closeTo(2, 1e-9));
      final touch = findRoots(ExpressionParser.parse('(x - 1)^2').eval, -5, 5);
      expect(touch, hasLength(1));
      expect(touch.first, closeTo(1, 0.02));
      expect(findRoots(ExpressionParser.parse('1/x').eval, -5, 5), isEmpty);
    });
  });
}
