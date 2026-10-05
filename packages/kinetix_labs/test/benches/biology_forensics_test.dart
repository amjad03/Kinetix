import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_labs/kinetix_labs.dart';
import 'package:kinetix_labs/src/benches/biology/cells.dart';
import 'package:kinetix_labs/src/benches/biology/dna.dart';
import 'package:kinetix_labs/src/benches/biology/genetics.dart';
import 'package:kinetix_labs/src/benches/biology/physiology.dart';
import 'package:kinetix_labs/src/benches/forensics/evidence.dart';
import 'package:kinetix_labs/src/benches/forensics/fingerprints.dart';
import 'package:kinetix_labs/src/engines/biology.dart';

List<Object> row(LabBench b, LabParams p) {
  final r = b.read({...b.defaults, ...p});
  expect(r.row, isNotNull, reason: 'no reading: ${r.why}');
  return r.row!;
}

double num1(String text, String pattern) => double.parse(RegExp(pattern).firstMatch(text)!.group(1)!);

void main() {
  group('biology benches', () {
    test('stomatal index: about 22 % below, 10 % above; the lower surface has more', () {
      const b = StomataBench();
      final rows = [
        for (final leaf in ['dicot-lower', 'dicot-upper'])
          for (var f = 1; f <= 8; f++) row(b, {'leaf': leaf, 'field': f.toDouble()}),
      ];
      final lower = meanSe([for (final r in rows.take(8)) (r[4] as num).toDouble()]).mean;
      final upper = meanSe([for (final r in rows.skip(8)) (r[4] as num).toDouble()]).mean;
      expect(lower, closeTo(100 / 4.6, 5));
      expect(upper, closeTo(10, 4));
      expect(b.result(rows), contains('lower surface has more stomata'));
    });

    test('mitosis: the tip divides far more than the zone of elongation; prophase lasts longest', () {
      const b = MitosisBench();
      final rows = [
        for (final z in ['tip', 'elongation'])
          for (var f = 1; f <= 6; f++) row(b, {'zone': z, 'field': f.toDouble()}),
      ];
      final tip = meanSe([for (final r in rows.take(6)) (r[7] as num).toDouble()]).mean;
      final el = meanSe([for (final r in rows.skip(6)) (r[7] as num).toDouble()]).mean;
      expect(tip, closeTo(18, 6));
      expect(el, lessThan(8));
      final res = b.result(rows)!;
      final pro = num1(res, r'Prophase (\d+) min'), ana = num1(res, r'Anaphase (\d+) min');
      expect(pro, greaterThan(ana));
    });

    test('pollen germinates best at 10–15 % sucrose', () {
      const b = PollenBench();
      final rows = [
        for (final s in PollenBench.sucroses)
          for (var f = 1; f <= 4; f++) row(b, {'sucrose': s, 'min': 120.0, 'field': f.toDouble()}),
      ];
      expect(num1(b.result(rows)!, r'highest at (\d+) %'), inInclusiveRange(10, 15));
      expect(row(b, {'min': 0.0})[2], 0);
    });

    test('photosynthesis rises with light, then levels off', () {
      const b = PhotosynthesisBench();
      final rows = [for (var d = 10.0; d <= 50; d += 5) row(b, {'cm': d})];
      expect((rows.first[4] as int), greaterThan(rows.last[4] as int));
      expect(b.result(rows), contains('levels off'));
    });

    test('amylase: fastest near 37–40 °C at pH 6.8, and at pH 6.8 at 37 °C', () {
      const b = AmylaseBench();
      final rows = [
        for (var c = 10.0; c <= 70; c += 5) row(b, {'temp': c, 'ph': 6.8}),
        for (final ph in [4.0, 5.0, 6.0, 8.0, 9.0]) row(b, {'temp': 37.0, 'ph': ph}),
      ];
      final res = b.result(rows)!;
      expect(num1(res, r'fastest near (\d+) °C'), inInclusiveRange(35, 40));
      expect(res, contains('pH 6.8'));
      expect(row(b, {'temp': 70.0})[2], '> 900');
    });

    test('Michaelis–Menten: Lineweaver–Burk recovers Km and Vmax and tells the inhibitors apart', () {
      const b = MichaelisBench();
      final rows = [
        for (final i in ['none', 'competitive', 'non-competitive'])
          for (final s in [0.5, 1.0, 2.0, 4.0, 8.0, 16.0, 32.0]) row(b, {'s': s, 'inhibitor': i}),
      ];
      final f = MichaelisBench.fit(rows.take(7).toList())!;
      expect(f.km, closeTo(4, 0.4));
      expect(f.vmax, closeTo(120, 6));
      expect(f.kmSe, greaterThan(0));
      final c = MichaelisBench.fit(rows.skip(7).take(7).toList())!;
      expect(c.km, closeTo(8, 0.8));
      final res = b.result(rows)!;
      expect(res, contains('competes for the active site'));
      expect(res, contains('binds elsewhere'));
    });

    test('growth: the log phase gives a doubling time near ln2/μ', () {
      const b = GrowthBench();
      final rows = [for (var h = 0.0; h <= 14; h += 0.5) row(b, {'hours': h, 'temp': 37.0})];
      final g = num1(b.result(rows)!, r'every ([0-9.]+) ');
      // The logistic curve bends early, so the measured doubling is a little slower than ln2/μ.
      expect(g, inInclusiveRange(math.ln2 / Growth.mu(37) * 60, math.ln2 / Growth.mu(37) * 60 * 1.4));
    });

    test('crosses: the χ² verdict, and the counts add up', () {
      const b = CrossBench();
      final r = row(b, {'set': 'di', 'cross': 'AaBb×AaBb', 'n': 1600.0});
      expect(r[0], 'AaBb×AaBb');
      final counts = RegExp(r'(\d+)').allMatches(r[2] as String).map((m) => int.parse(m.group(1)!));
      expect(counts.reduce((a, b) => a + b), 1600);
      var fits = 0;
      for (var t = 1; t <= 10; t++) {
        if (row(b, {'cross': 'Aa×Aa', 'n': 400.0, 'trial': t.toDouble()})[5] == 'Yes') fits++;
      }
      expect(fits, greaterThanOrEqualTo(8));
    });

    test('Hardy–Weinberg: the town fits, the island does not', () {
      const b = HardyWeinbergBench();
      final rows = [
        for (final pop in ['town', 'island'])
          for (var t = 1; t <= 5; t++) row(b, {'pop': pop, 'n': 500.0, 'trial': t.toDouble()}),
      ];
      final res = b.result(rows)!;
      expect(res, contains('consistent with equilibrium'));
      expect(res, contains('not in Hardy–Weinberg equilibrium'));
    });

    test('drift: small populations wander further', () {
      const b = DriftBench();
      final rows = [
        for (final n in [10.0, 1000.0])
          for (var t = 1; t <= 6; t++) row(b, {'size': n, 'gen': 60.0, 'trial': t.toDouble()}),
      ];
      final res = b.result(rows)!;
      expect(num1(res, r'moved ([0-9.]+) from'), greaterThan(num1(res, r'only ([0-9.]+) in')));
    });

    test('gel: unknown bands sized from the ladder; forensic lanes matched', () {
      const b = GelBench();
      final rows = [
        for (var i = 0; i < GelBench.ladder.length; i++)
          if (b.read({...b.defaults, 'band': i.toDouble()}).row != null) row(b, {'band': i.toDouble()}),
        row(b, {'lane': 'unknown', 'band': 0.0}),
        row(b, {'lane': 'unknown', 'band': 1.0}),
      ];
      final res = b.result(rows)!;
      expect(num1(res, r'band 1: about (\d+)'), closeTo(1250, 80));
      expect(num1(res, r'band 2: about (\d+)'), closeTo(420, 30));
      final f = {'kit': 'forensic'};
      final frows = [
        for (var i = 0; i < GelBench.ladder.length; i++)
          if (b.read({...b.defaults, ...f, 'band': i.toDouble()}).row != null) row(b, {...f, 'band': i.toDouble()}),
        for (final l in ['scene', 'suspect-1', 'suspect-2'])
          for (var i = 0; i < 4; i++) row(b, {...f, 'lane': l, 'band': i.toDouble()}),
      ];
      final fres = b.result(frows)!;
      expect(fres, contains('Suspect 2 has the same band pattern'));
      expect(fres, contains('Suspect 1 has a different band pattern'));
    });

    test('PCR: Ct falls 3.3–3.5 per decade; efficiency near 95 %; unknown about 4 × 10⁴', () {
      const b = PcrBench();
      expect(b.read({'copies': 3.0, 'cycle': 5.0}).row, isNull);
      final rows = [for (final c in [3.0, 4.0, 5.0, 6.0, 7.0, 0.0]) row(b, {'copies': c, 'cycle': 40.0})];
      final res = b.result(rows)!;
      expect(num1(res, r'= (-?[0-9.]+) ±'), closeTo(-3.43, 0.15));
      expect(num1(res, r'held about (\d+) ×'), closeTo(40, 8));
    });
  });

  group('forensic benches', () {
    test('fingerprint classification marks right and wrong calls', () {
      const b = FingerprintBench();
      expect(row(b, {'finger': 1.0, 'call': 'whorl'})[3], '✓');
      expect(row(b, {'finger': 2.0, 'call': 'loop'})[3], contains('arch'));
      expect(row(b, {'finger': 3.0, 'call': 'loop'})[2], 1);
    });

    test('fingerprint matching identifies suspect 3 and excludes the rest', () {
      const b = FingerprintBench();
      final rows = [for (final s in FingerprintBench.suspects.keys) row(b, {'task': 'match', 'suspect': s})];
      expect(rows[1][3], contains('different pattern'));
      expect(rows[2][3], contains('identified'));
      expect(rows[0][3], contains('excluded'));
      expect(rows[3][3], contains('excluded'));
      expect(b.result(rows), contains('Suspect 3'));
    });

    test('blood typing works out every group; the stain matches person 2 only', () {
      const b = BloodTypingBench();
      final rows = [
        for (final s in BloodTypingBench.samples.keys)
          for (final serum in BloodTypingBench.sera) row(b, {'sample': s, 'serum': serum}),
      ];
      final res = b.result(rows)!;
      for (final e in BloodTypingBench.samples.entries) {
        expect(res, contains('${BloodTypingBench.sampleName(e.key)}: ${e.value.$2}'));
      }
      expect(res, contains('the same as Person 2;'));
    });

    test('glass density and index: the window matches the shoe fragment; the others are excluded', () {
      const d = GlassDensityBench();
      final drows = [for (final g in glassFragments.keys) row(d, {'glass': g})];
      final dres = d.result(drows)!;
      expect(dres, contains('${glassName('window')}: '));
      expect(dres, contains('could be the source'));
      expect(RegExp('excluded').allMatches(dres).length, 2);

      const n = GlassIndexBench();
      final nrows = <List<Object>>[];
      for (final g in glassFragments.keys) {
        for (var t = 25.0; t <= 110; t += 0.5) {
          final r = row(n, {'glass': g, 'temp': t});
          if (r[2] == 'Edges vanish: match' || t == 25.0) nrows.add(r);
        }
      }
      final nres = n.result(nrows)!;
      expect(nres, contains('${glassName('window')} matches'));
      expect(nres, contains('${glassName('bottle')} does not match'));
      expect(nres, contains('headlamp never matches'));
    });

    test('hair: the questioned hair is animal and consistent with the dog; fibre: wool', () {
      const b = HairFibreBench();
      final rows = [
        for (final s in HairFibreBench.hair.keys)
          for (var k = 1; k <= 5; k++) row(b, {'sample': s, 'strand': k.toDouble()}),
      ];
      final res = b.result(rows)!;
      expect(res, contains('animal hair'));
      expect(res, contains('${HairFibreBench.sampleName('dog')}: width'));
      expect(res, matches(RegExp('${RegExp.escape(HairFibreBench.sampleName('dog'))}: width [^µ]*µm and the same appearance')));
      expect(res, matches(RegExp('${RegExp.escape(HairFibreBench.sampleName('suspect-hair'))}: width [^µ]*µm, different')));

      final f = {'kit': 'fibre'};
      final frows = [
        for (final s in HairFibreBench.fibre.keys)
          for (var k = 1; k <= 5; k++) row(b, {...f, 'sample': s, 'strand': k.toDouble()}),
      ];
      final fres = b.result(frows)!;
      expect(fres, matches(RegExp('${RegExp.escape(HairFibreBench.sampleName('wool'))}: width [^µ]*µm and the same appearance')));
      expect(RegExp('excluded').allMatches(fres).length, 4);
    });

    test('footprint: ratio about 6.6; the scene print gives about 176 cm', () {
      const b = FootprintBench();
      final rows = [for (final k in FootprintBench.people.keys) row(b, {'print': k})];
      final res = b.result(rows)!;
      expect(num1(res, r'Height is ([0-9.]+) ±'), closeTo(6.6, 0.1));
      expect(num1(res, r'about ([0-9.]+) ±'), closeTo(176, 3));
    });

    test('ballistics: angle and gun height at the cartridge cases', () {
      const b = BallisticsBench();
      final rows = [for (var x = 0.0; x <= 6; x += 0.5) row(b, {'case': 'a', 'x': x})];
      final res = b.result(rows)!;
      expect(num1(res, r'rises (-?[0-9.]+) ±'), closeTo(4.57, 0.15));
      expect(num1(res, r'it is ([0-9.]+) ±'), closeTo(1.6, 0.02));
      expect(res, contains('shoulder height'));
    });
  });
}
