import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_labs/kinetix_labs.dart';
import 'package:kinetix_labs/src/benches/mechanics/mechanics_benches.dart';
import 'package:kinetix_labs/src/engines/mechanics.dart';

List<Object> row(LabBench b, LabParams p) {
  final r = b.read(p);
  expect(r.row, isNotNull, reason: 'no reading: ${r.why}');
  return r.row!;
}

double num1(String text, String pattern) => double.parse(RegExp(pattern).firstMatch(text)!.group(1)!.replaceAll(RegExp(r'\.$'), ''));

void main() {
  group('mechanics engine', () {
    test('projectile: R = u² sin 2θ / g, H = u² sin² θ / 2g, T = 2u sin θ / g', () {
      final f = Mechanics.projectile(20, 30);
      expect(f.range, closeTo(400 * math.sin(math.pi / 3) / Mechanics.g, 1e-9));
      expect(f.maxHeight, closeTo(400 * 0.25 / (2 * Mechanics.g), 1e-9));
      expect(f.time, closeTo(2 * 20 * 0.5 / Mechanics.g, 1e-9));
      // Complementary angles give the same range; 45° the most.
      expect(Mechanics.projectile(20, 30).range, closeTo(Mechanics.projectile(20, 60).range, 1e-9));
      expect(Mechanics.projectile(20, 45).range, greaterThan(Mechanics.projectile(20, 40).range));
      // From a height it lands later.
      expect(Mechanics.projectile(10, 0, height: 4.9).time, closeTo(math.sqrt(2 * 4.9 / Mechanics.g), 1e-9));
    });

    test('collisions conserve momentum; elastic also kinetic energy', () {
      final (v1, v2) = Mechanics.collide(1, 2, 1, 0);
      expect(v1, closeTo(0, 1e-12)); // equal masses swap velocities
      expect(v2, closeTo(2, 1e-12));
      final (w1, w2) = Mechanics.collide(2, 1, 1, -1, e: 0);
      expect(w1, closeTo(w2, 1e-12));
      expect(2 * w1 + w2, closeTo(2 * 1 + 1 * -1, 1e-12));
    });

    test('springs, wires, Stokes and capillaries against worked values', () {
      expect(Mechanics.springExtension(0.2, 40), closeTo(0.2 * Mechanics.g / 40, 1e-12));
      expect(Mechanics.springPeriod(0.1, 40), closeTo(2 * math.pi * math.sqrt(0.1 / 40), 1e-12));
      // Steel wire 2 m, 0.5 mm, 2 kg: ΔL = mgL/(AY) ≈ 1.0 mm.
      expect(Mechanics.wireExtension(2, 2, 0.5e-3, 2e11) * 1000, closeTo(0.999, 0.002));
      // 2 mm steel ball in glycerine falls at about 4 cm/s.
      expect(Mechanics.terminalVelocity(1e-3, 7800, 1260, 1.41), closeTo(0.0101, 0.0002));
      // Water in a 0.5 mm radius tube rises about 2.9 cm.
      expect(Mechanics.capillaryRise(0.5e-3, 0.072, 1000), closeTo(0.0294, 0.0002));
    });

    test('heat and sound', () {
      expect(Mechanics.cooling(80, 30, 0.1, 0), 80);
      expect(Mechanics.cooling(80, 30, 0.1, 1e9), closeTo(30, 1e-9));
      expect(Mechanics.mixture(m1: 0.1, c1: 4186, t1: 80, m2: 0.1, c2: 4186, t2: 20), closeTo(50, 1e-9));
      expect(Mechanics.soundSpeed(0), closeTo(331.3, 1e-9));
      expect(Mechanics.soundSpeed(25), closeTo(346.1, 0.1));
      expect(Mechanics.stringFrequency(0.5, 100, 1e-3), closeTo(316.2, 0.1));
    });
  });

  group('mechanics benches', () {
    test("Hooke's law gives k back; spring-mass T² gives k", () {
      const b = SpringBench();
      final rows = [for (final g in [50.0, 100.0, 200.0, 300.0, 400.0]) row(b, {'spring': 'B', 'load': g})];
      expect(num1(b.result(rows)!, r'k = ([0-9.]+)'), closeTo(40, 1));
      const m = SpringMassBench();
      final osc = [for (final g in [50.0, 100.0, 200.0, 300.0, 400.0]) row(m, {'spring': 'B', 'load': g})];
      expect(num1(m.result(osc)!, r'k = 4π² ÷ slope = ([0-9.]+)'), closeTo(40, 1));
    });

    test('incline: F/sin θ is the weight; friction: F/N is μ', () {
      const b = InclineBench();
      final rows = [for (final a in [10.0, 20.0, 30.0, 40.0]) row(b, {'angle': a})];
      expect(num1(b.result(rows)!, r'W = ([0-9.]+)'), closeTo(0.5 * Mechanics.g, 0.05));
      const f = FrictionBench();
      final fr = <List<Object>>[];
      for (final extra in [0.0, 200.0, 500.0, 1000.0]) {
        final p = {'surface': 'wood', 'extra': extra, 'pan': 0.0};
        expect(f.read(p).why, isNotNull);
        // The least pan load (5 g steps) that just moves it.
        var pan = 0.0;
        while (!FrictionBench.moving({...p, 'pan': pan})) {
          pan += 5;
        }
        fr.add(row(f, {...p, 'pan': pan}));
      }
      expect(num1(f.result(fr)!, r'μ = F ÷ N = ([0-9.]+)'), closeTo(0.40, 0.03));
    });

    test('projectile bench: 45° goes farthest; complementary angles match', () {
      const b = ProjectileBench();
      final rows = [for (final a in [30.0, 45.0, 60.0]) row(b, {...b.defaults, 'angle': a})];
      final res = b.result(rows)!;
      expect(res, contains('45°'));
      expect(res, contains('30° and 60°'));
    });

    test('collisions: momentum agrees; elastic keeps KE, sticky loses it', () {
      const b = CollisionBench();
      final el = row(b, {...b.defaults, 'e': 1.0}), st = row(b, {...b.defaults, 'e': 0.0});
      expect((el[2] as num), closeTo(el[3] as num, 0.002));
      expect((el[4] as num), closeTo(el[5] as num, 0.0002));
      expect((st[5] as num) < (st[4] as num), isTrue);
      expect(b.read({...b.defaults, 'u1': 0.0, 'u2': 0.2}).why, isNotNull);
    });

    test("Searle: Young's modulus within a few per cent", () {
      const b = SearleBench();
      final rows = [for (final m in [0.5, 1.0, 2.0, 3.0, 4.0, 5.0]) row(b, {'material': 'steel', 'load': m})];
      expect(num1(b.result(rows)!, r'= ([0-9.]+) ±'), closeTo(2.0, 0.08));
    });

    test('Stokes: η back from v ∝ r²; capillary: T back from h r', () {
      const b = StokesBench();
      final rows = [for (final r in [1.0, 1.5, 2.0, 2.5, 3.0]) row(b, {'r': r})];
      expect(num1(b.result(rows)!, r'= ([0-9.]+) Pa s'), closeTo(1.41, 0.03));
      const c = CapillaryBench();
      final cr = [for (final r in [0.25, 0.5, 0.75, 1.0]) row(c, {'r': r})];
      expect(num1(c.result(cr)!, r'T = hrρg ÷ 2 = ([0-9.]+)'), closeTo(0.072, 0.001));
    });

    test("Newton's cooling: the log slope is −k", () {
      const b = CoolingBench();
      final rows = [for (final m in [0.0, 4.0, 8.0, 12.0, 16.0, 20.0]) row(b, {'cal': 'bare', 'min': m})];
      expect(num1(b.result(rows)!, r'slope (-[0-9.]+)').abs(), closeTo(0.045, 0.004));
    });

    test('resonance tube: v = 2f(L₂ − L₁) near 346 m/s at 25 °C', () {
      const b = ResonanceTubeBench();
      for (final f in [320.0, 384.0, 480.0, 512.0]) {
        final rs = ResonanceTubeBench.resonances({'f': f});
        final rows = [for (final l in rs.take(2)) row(b, {'f': f, 'l': (l * 10).round() / 10})];
        expect(b.read({'f': f, 'l': rs.first + 3}).why, isNotNull);
        expect(num1(b.result(rows)!, r'v = 2f\(L₂ − L₁\) = ([0-9.]+)'), closeTo(346, 4), reason: '$f');
      }
    });
  });
}
