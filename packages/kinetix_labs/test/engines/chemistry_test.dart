import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_labs/kinetix_labs.dart';
import 'package:kinetix_labs/src/benches/chemistry/physchem.dart';
import 'package:kinetix_labs/src/benches/chemistry/spot_tests.dart';
import 'package:kinetix_labs/src/benches/chemistry/titrations.dart';
import 'package:kinetix_labs/src/engines/chemistry.dart';

List<Object> row(LabBench b, LabParams p) {
  final r = b.read(p);
  expect(r.row, isNotNull, reason: 'no reading: ${r.why}');
  return r.row!;
}

double num1(String text, String pattern) => double.parse(RegExp(pattern).firstMatch(text)!.group(1)!.replaceAll(RegExp(r'\.$'), ''));

void main() {
  group('chemistry engine', () {
    const hcl = Acid('HCl', 0.1, 25);
    const acetic = Acid('acetic', 0.1, 25, ka: [1.8e-5]);

    test('strong acid: pH 1 at the start, 7 at the equivalence point, 12.4 well past it', () {
      expect(Chem.ph(hcl, 0.1, 0), closeTo(1.0, 0.01));
      expect(Chem.equivalence(hcl, 0.1), closeTo(25, 1e-12));
      expect(Chem.ph(hcl, 0.1, 25), closeTo(7.0, 0.01));
      // 5 mL excess of 0.1 M NaOH in 55 mL: [OH⁻] = 0.5/55 M.
      expect(Chem.ph(hcl, 0.1, 30), closeTo(14 + math.log(0.5 / 55) / math.ln10, 0.01));
    });

    test('weak acid: pH 2.87 at start, pKa at half-neutralisation, basic at equivalence', () {
      expect(Chem.ph(acetic, 0.1, 0), closeTo(2.88, 0.02));
      expect(Chem.ph(acetic, 0.1, 12.5), closeTo(4.74, 0.01));
      expect(Chem.ph(acetic, 0.1, 25), closeTo(8.72, 0.03));
    });

    test('oxalic acid gives two protons: equivalence at twice the volume', () {
      const ox = Acid('oxalic', 0.05, 10, ka: [5.9e-2, 6.4e-5], protons: 2);
      expect(Chem.equivalence(ox, 0.1), closeTo(10, 1e-12));
      expect(Chem.ph(ox, 0.1, 9.9), lessThan(7));
      expect(Chem.ph(ox, 0.1, 10.1), greaterThan(9.5));
    });

    test('indicators change colour in their ranges', () {
      expect(Chem.indicator('phenolphthalein', 7).$2, 'colourless');
      expect(Chem.indicator('phenolphthalein', 9.5).$2, 'pink');
      expect(Chem.indicator('methyl-orange', 2).$2, 'red');
      expect(Chem.indicator('methyl-orange', 6).$2, 'yellow');
      expect(Chem.universalName(7), 'green');
    });

    test('conductance of HCl falls to a minimum at the equivalence point, then rises', () {
      double g(double v) => Chem.conductance(0.01, 100, 0.1, v);
      // 0.01 M HCl: κ = (349.8 + 76.3) × 0.01 / 1000 S/cm = 4.26 mS.
      expect(g(0), closeTo(4.26, 0.01));
      expect(g(10), lessThan(g(8)));
      expect(g(10), lessThan(g(12)));
    });

    test('Beer–Lambert, Arrhenius and first order', () {
      expect(Chem.absorbance(2400, 1, 2e-4), closeTo(0.48, 1e-12));
      expect(Chem.transmittance(1), closeTo(0.1, 1e-12));
      expect(Chem.arrhenius(1, 25), closeTo(1, 1e-12));
      expect(Chem.arrhenius(1, 35, ea: 52e3), closeTo(1.97, 0.05));
      expect(Chem.firstOrderLeft(math.ln2 / 10, 10), closeTo(0.5, 1e-12));
      expect(Chem.neutralisationRise(0.05, 100), closeTo(0.05 * 57.1e3 / 418, 1e-9));
    });

    test('chromatography: front goes as √t; spots at Rf × front', () {
      expect(Chromatography.front(30), closeTo(12, 1e-12));
      expect(Chromatography.front(7.5), closeTo(6, 1e-12));
      expect(Chromatography.spot(0.5, 10).$1, 5);
    });
  });

  group('chemistry benches', () {
    test('titrations: the titre at the end point gives the unknown molarity', () {
      const b = TitrationBench();
      for (final pair in TitrationBench.pairs.keys) {
        for (final s in ['A', 'B', 'C']) {
          final p = {...b.defaults, 'pair': pair, 'sample': s};
          final veq = TitrationBench.endPoint(p);
          expect(veq, inInclusiveRange(4, 25), reason: '$pair $s');
          expect(b.read({...p, 'v': veq - 0.5}).why, isNotNull);
          final r = row(b, {...p, 'v': (veq * 20).ceil() / 20});
          final want = TitrationBench.pairs[pair]!.redox ? TitrationBench.kmno4[s]! : TitrationBench.samples[s]!;
          expect((r[4] as num).toDouble(), closeTo(want, want * 0.01), reason: '$pair $s');
          expect(b.read({...p, 'v': veq + 2}).why, isNotNull, reason: 'overshoot');
        }
      }
    });

    test('pH titration finds the end point and pKa', () {
      const b = PhTitrationBench();
      final rows = [for (var v = 0.0; v <= 40; v += 1) row(b, {'v': v})];
      final res = b.result(rows)!;
      expect(num1(res, r'at ([0-9.]+) mL'), closeTo(25, 0.6));
      expect(num1(res, r'pKa = ([0-9.]+)'), closeTo(4.74, 0.05));
    });

    test('conductometric titration: the lines meet at the equivalence point', () {
      const b = ConductometricBench();
      for (final acid in ['strong', 'weak']) {
        final rows = [for (var v = 0.0; v <= 20; v += 1) row(b, {'acid': acid, 'v': v})];
        expect(num1(b.result(rows)!, r'meet at ([0-9.]+) mL'), closeTo(10, 0.6), reason: acid);
      }
    });

    test('rate: 1/t ∝ concentration; ten degrees about doubles it', () {
      const b = ReactionRateBench();
      final rows = [for (final ml in [10.0, 20.0, 30.0, 40.0, 50.0]) row(b, {'thio': ml, 'temp': 25.0})];
      for (final r in rows) {
        expect((r[3] as num) / (r[0] as num), closeTo(ReactionRateBench.k25, 0.02));
      }
      rows.add(row(b, {'thio': 50.0, 'temp': 35.0}));
      expect(num1(b.result(rows)!, r'reaction ([0-9.]+) times'), closeTo(2, 0.15));
    });

    test('ink chromatography matches the note to pen A', () {
      const b = ChromatographyBench();
      final rows = <List<Object>>[];
      for (final s in ['note', 'pen-a', 'pen-b']) {
        for (var i = 0; i < ChromatographyBench.mixtures[s]!.length; i++) {
          rows.add(row(b, {'mixture': 'inks', 'sample': s, 'min': 30.0, 'spot': i}));
        }
      }
      expect(b.result(rows), contains(ChromatographyBench.sampleName('pen-a')));
      expect(b.result(rows), isNot(contains(ChromatographyBench.sampleName('pen-b'))));
    });

    test('neutralisation, ester kinetics, colorimetry and viscosity', () {
      final n = row(const NeutralisationBench(), {'acid': 'hcl', 'mixed': true});
      expect((n[4] as num).toDouble(), closeTo(-57.1 * 418 / (418 + NeutralisationBench.calJK) * ((418 + NeutralisationBench.calJK) / 418), 0.8));
      const e = EsterHydrolysisBench();
      final er = [for (final t in [0.0, 30.0, 60.0, 90.0, 120.0]) row(e, {'temp': 25.0, 'min': t})];
      expect(num1(e.result(er)!, r'= \(([0-9.]+) ±'), closeTo(4.9, 0.2));
      const bl = BeerLambertBench();
      final br = [for (final c in [1.0, 2.0, 3.0, 4.0, 5.0, 0.0]) row(bl, {'sample': c, 'nm': 525.0})];
      expect(num1(bl.result(br)!, r'concentration is ([0-9.]+)'), closeTo(2.6, 0.05));
      const o = OstwaldBench();
      final orows = [for (final l in ['water', 'ethanol']) row(o, {'liquid': l})];
      expect((orows[1][3] as num).toDouble(), closeTo(1.074, 0.01));
    });

    test('salt analysis identifies every salt from its tests', () {
      final kit = spotKits['salt']!;
      const b = SpotTestBench();
      for (final s in kit.samples) {
        final rows = [for (final t in kit.tests) row(b, {'kit': 'salt', 'sample': s, 'test': t, 'added': true})];
        expect(b.result(rows), contains(tr('Salt {s} is', {'s': s}).split(' is').first), reason: s);
        expect(b.result(rows), isNot(contains('Keep testing')), reason: s);
      }
      final food = [for (final t in spotKits['food']!.tests) row(b, {'kit': 'food', 'sample': 'milk', 'test': t, 'added': true})];
      expect(b.result(food), allOf(contains('protein'), contains('fat'), contains('reducing sugar')));
    });
  });
}
