import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_labs/src/engines/biology.dart';
import 'package:kinetix_labs/src/engines/forensics.dart';
import 'package:kinetix_labs/src/engines/specimen.dart';

void main() {
  group('genetics', () {
    test('monohybrid F2 is 3 : 1, test cross 1 : 1', () {
      expect(Genetics.expected('Aa', 'Aa'), {'A': 0.75, 'a': 0.25});
      expect(Genetics.expected('Aa', 'aa'), {'A': 0.5, 'a': 0.5});
    });

    test('dihybrid F2 is 9 : 3 : 3 : 1', () {
      final e = Genetics.expected('AaBb', 'AaBb');
      expect(e['AB'], closeTo(9 / 16, 1e-12));
      expect(e['Ab'], closeTo(3 / 16, 1e-12));
      expect(e['aB'], closeTo(3 / 16, 1e-12));
      expect(e['ab'], closeTo(1 / 16, 1e-12));
    });

    test('sampled offspring are close to the ratio and repeatable', () {
      final s = Genetics.sample('AaBb', 'AaBb', 1600, 7);
      expect(s, Genetics.sample('AaBb', 'AaBb', 1600, 7));
      expect(s.values.reduce((a, b) => a + b), 1600);
      expect(Genetics.chiSquare(s, Genetics.expected('AaBb', 'AaBb')), lessThan(Genetics.chi05[2] * 2));
      // A textbook check: 315, 108, 101, 32 (Mendel's peas) gives χ² ≈ 0.47.
      expect(Genetics.chiSquare({'AB': 315, 'Ab': 108, 'aB': 101, 'ab': 32}, Genetics.expected('AaBb', 'AaBb')), closeTo(0.47, 0.01));
    });
  });

  group('population', () {
    test('Hardy–Weinberg: p and the expected counts', () {
      expect(Population.p(36, 48, 16), closeTo(0.6, 1e-12));
      final (a, b, c) = Population.expected(36, 48, 16);
      expect([a, b, c], [closeTo(36, 1e-9), closeTo(48, 1e-9), closeTo(16, 1e-9)]);
      expect(Population.chiSquare(36, 48, 16), closeTo(0, 1e-9));
      expect(Population.chiSquare(50, 20, 30), greaterThan(3.841));
    });

    test('drift: small populations wander further than large ones', () {
      double spread(int n) {
        var s = 0.0;
        for (var seed = 0; seed < 40; seed++) {
          s += (Population.drift(0.5, n, 30, seed).last - 0.5).abs();
        }
        return s / 40;
      }

      expect(spread(10), greaterThan(spread(500) * 2));
      // Selection against aa raises p.
      expect(Population.drift(0.5, 5000, 40, 1, s: 0.3).last, greaterThan(0.6));
    });
  });

  group('enzymes, growth, photosynthesis', () {
    test('Michaelis–Menten: half Vmax at Km', () {
      expect(Enzyme.rate(2, 10, 2), closeTo(5, 1e-12));
      expect(Enzyme.inhibited(2, 10, 2, 'competitive', i: 1, ki: 1), closeTo(10 * 2 / 6, 1e-12));
      expect(Enzyme.inhibited(2, 10, 2, 'non-competitive', i: 1, ki: 1), closeTo(2.5, 1e-12));
    });

    test('enzymes peak in warm, near-neutral conditions', () {
      final temps = [for (var c = 0; c <= 70; c += 5) Enzyme.temperature(c.toDouble())];
      final best = temps.indexOf(temps.reduce(math.max)) * 5;
      expect(best, inInclusiveRange(35, 42));
      expect(Enzyme.temperature(70), lessThan(0.05));
      expect(Enzyme.ph(6.8), 1);
      expect(Enzyme.ph(3), lessThan(0.01));
    });

    test('growth: lag, then doubling at ln2/μ, then a plateau', () {
      expect(Growth.od(0), closeTo(0.02, 1e-12));
      final a = Growth.od(5, od0: 0.001), b = Growth.od(5 + math.ln2 / 0.9, od0: 0.001);
      expect(b / a, closeTo(2, 0.1));
      expect(Growth.od(30), closeTo(1.6, 0.01));
    });

    test('photosynthesis rises with light and levels off', () {
      expect(Photosynthesis.light(20), closeTo(0.25, 1e-12));
      expect(Photosynthesis.rate(cm: 10), greaterThan(Photosynthesis.rate(cm: 30)));
      expect(Photosynthesis.rate(cm: 5) - Photosynthesis.rate(cm: 10), lessThan(Photosynthesis.rate(cm: 20) - Photosynthesis.rate(cm: 40)));
    });
  });

  group('DNA', () {
    test('migration falls with log(size): equal steps for ×10', () {
      expect(Dna.migration(100) - Dna.migration(1000), closeTo(Dna.migration(300) - Dna.migration(3000), 1e-9));
      expect(Dna.migration(100), greaterThan(Dna.migration(1000)));
      expect(Dna.migration(500, minutes: 90), closeTo(2 * Dna.migration(500), 1e-9));
    });

    test('PCR doubles each cycle; a ten-fold dilution delays Ct by log2(10)', () {
      final c = Dna.pcr(1000, 3, e: 1, nMax: 1e30);
      expect(c, [1000, 2000, 4000, 8000]);
      final ct3 = Dna.ct(1e3, e: 1)!, ct4 = Dna.ct(1e4, e: 1)!;
      expect(ct3 - ct4, closeTo(math.log(10) / math.ln2, 0.05));
    });
  });

  group('forensics engine', () {
    test('a lifted print matches its finger and not others', () {
      final a = Prints.make('loop-right', 11), b = Prints.make('loop-right', 12);
      final scene = Prints.lift(a, const Rect.fromLTWH(0.2, 0.2, 0.6, 0.5), 3);
      expect(scene.minutiae.length, greaterThanOrEqualTo(10));
      expect(Prints.matches(scene, a), scene.minutiae.length);
      expect(Prints.matches(scene, b), lessThan(5));
      expect(a.deltas, 1);
      expect(const FingerPrint('whorl', []).deltas, 2);
    });

    test('glass: oil index, match temperature and density', () {
      expect(GlassEvidence.oil(25), 1.54);
      expect(GlassEvidence.matchTemperature(1.52), closeTo(75, 1e-9));
      expect(GlassEvidence.density(5.012, 3.019), closeTo(2.507, 0.002));
    });

    test('trajectory and drop', () {
      expect(Trajectory.angle(1.0, 1.5, 0.5), closeTo(45, 1e-9));
      expect(Trajectory.heightAt(3, 1.0, 1.1, 1.0), closeTo(1.3, 1e-12));
      expect(Trajectory.drop(5, 350), lessThan(0.002));
    });
  });

  test('specimen fields are repeatable and keep their proportions', () {
    final f = Specimen.field(4, 20, 20, {'a': 3, 'b': 1});
    expect(Specimen.count(f), Specimen.count(Specimen.field(4, 20, 20, {'a': 3, 'b': 1})));
    expect(Specimen.count(f)['a']! / f.length, closeTo(0.75, 0.06));
  });
}
