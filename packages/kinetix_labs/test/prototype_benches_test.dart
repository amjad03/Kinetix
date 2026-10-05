import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_labs/kinetix_labs.dart';
import 'package:kinetix_labs/src/benches/buoyancy.dart';
import 'package:kinetix_labs/src/benches/calorimetry.dart';
import 'package:kinetix_labs/src/benches/circle.dart';
import 'package:kinetix_labs/src/benches/conductors.dart';
import 'package:kinetix_labs/src/benches/displacement.dart';
import 'package:kinetix_labs/src/benches/electromagnet.dart';
import 'package:kinetix_labs/src/benches/germination.dart';
import 'package:kinetix_labs/src/benches/heating.dart';
import 'package:kinetix_labs/src/benches/indicators.dart';
import 'package:kinetix_labs/src/benches/lens.dart';
import 'package:kinetix_labs/src/benches/lever.dart';
import 'package:kinetix_labs/src/benches/magnets.dart';
import 'package:kinetix_labs/src/benches/microscope.dart';
import 'package:kinetix_labs/src/benches/mirror.dart';
import 'package:kinetix_labs/src/benches/ohm.dart';
import 'package:kinetix_labs/src/benches/osmosis.dart';
import 'package:kinetix_labs/src/benches/pendulum.dart';
import 'package:kinetix_labs/src/benches/pinhole.dart';
import 'package:kinetix_labs/src/benches/prism.dart';
import 'package:kinetix_labs/src/benches/probability.dart';
import 'package:kinetix_labs/src/benches/pythagoras.dart';
import 'package:kinetix_labs/src/benches/reactions.dart';
import 'package:kinetix_labs/src/benches/resistors.dart';
import 'package:kinetix_labs/src/benches/rusting.dart';
import 'package:kinetix_labs/src/benches/separation.dart';
import 'package:kinetix_labs/src/benches/shadows.dart';
import 'package:kinetix_labs/src/benches/slab.dart';
import 'package:kinetix_labs/src/benches/sonometer.dart';
import 'package:kinetix_labs/src/benches/starch.dart';
import 'package:kinetix_labs/src/benches/transpiration.dart';
import 'package:kinetix_labs/src/benches/triangle.dart';

/// The prototype's benches, ported with their physics checks: every bench
/// gives the readings the real experiment would.
void main() {
  group('benches', () {
    List<Object> row(LabBench b, LabParams p) {
      final r = b.read(p);
      expect(r.row, isNotNull, reason: 'no reading: ${r.why}');
      return r.row!;
    }

    test("Ohm's law: V ÷ I is the resistance for every setting; no key, no reading", () {
      const b = OhmBench();
      expect(b.read(b.defaults).why, isNotNull);
      for (final r in [2.0, 5.0, 10.0]) {
        for (var cells = 1; cells <= 4; cells++) {
          for (final rheo in [0.0, 0.5, 1.0]) {
            final got = row(b, {'cells': cells, 'r': r, 'rheo': rheo, 'on': true});
            expect((got[2] as num).toDouble(), closeTo(r, r * 0.06 + 0.05), reason: '$cells cells, $r Ω, rheostat $rheo');
          }
        }
      }
      // More cells, more current and more voltage.
      final one = row(b, {'cells': 1, 'r': 5.0, 'rheo': 0.5, 'on': true}), four = row(b, {'cells': 4, 'r': 5.0, 'rheo': 0.5, 'on': true});
      expect((four[0] as num) > (one[0] as num) && (four[1] as num) > (one[1] as num), isTrue);
      final rows = [for (final c in [1, 2, 3, 4]) row(b, {'cells': c, 'r': 5.0, 'rheo': 0.2, 'on': true})];
      expect(b.result(rows), contains('5.0'));
    });

    test('resistors: series adds, parallel is less than the smaller', () {
      const b = ResistorsBench();
      for (final (r1, r2) in [(4.0, 12.0), (10.0, 10.0), (1.0, 20.0)]) {
        final s = row(b, {'r1': r1, 'r2': r2, 'mode': 'series', 'on': true});
        final p = row(b, {'r1': r1, 'r2': r2, 'mode': 'parallel', 'on': true});
        expect((s[5] as num).toDouble(), closeTo(r1 + r2, 0.1));
        expect((p[5] as num).toDouble(), closeTo(r1 * r2 / (r1 + r2), 0.05));
        expect((p[5] as num) < math.min(r1, r2), isTrue);
      }
    });

    test('glass slab: sin i ÷ sin r is the refractive index and e = i', () {
      const b = SlabBench();
      expect(b.read({'i': 0.0, 'material': 'glass'}).why, isNotNull);
      final rows = <List<Object>>[];
      for (final i in [30.0, 40.0, 50.0, 60.0]) {
        final r = row(b, {'i': i, 'material': 'glass'});
        expect((r[3] as num).toDouble(), closeTo(1.5, 0.03));
        expect(r[2], (r[0] as num).toDouble());
        expect((r[1] as num) < i, isTrue);
        rows.add(r);
      }
      expect(b.result(rows), contains('1.50'));
      expect((row(b, {'i': 45.0, 'material': 'water'})[3] as num).toDouble(), closeTo(1.33, 0.03));
      // The sideways shift grows with the angle.
      expect(SlabBench.shift({'i': 60.0, 'material': 'glass'}) > SlabBench.shift({'i': 30.0, 'material': 'glass'}), isTrue);
    });

    test('lens and mirror: a sharp image gives the focal length; blurred or virtual gives none', () {
      const b = LensBench();
      for (final device in ['lens', 'mirror']) {
        for (final item in ['A', 'B', 'C']) {
          final f = LensBench.focal[item]!;
          final fs = <double>[];
          for (final u in [f + 5, 2 * f, 3 * f, 60.0]) {
            final p = {'device': device, 'item': item, 'u': u, 'screen': 0.0};
            final v = LensBench.imageDistance(p)!;
            if (v > 120) continue;
            // The screen moves in half-centimetre steps.
            final r = row(b, {...p, 'screen': (v * 2).round() / 2});
            fs.add((r[3] as num).toDouble());
            expect((r[3] as num).toDouble(), closeTo(f, 0.4), reason: '$device $item u=$u');
            expect(b.read({...p, 'screen': v + 6}).why, isNotNull, reason: 'blurred');
          }
          expect(fs.length, greaterThanOrEqualTo(2));
          expect(b.read({'device': device, 'item': item, 'u': f - 3, 'screen': 40.0}).why, isNotNull, reason: 'virtual image');
        }
      }
      expect(LensBench.nature({'device': 'lens', 'item': 'B', 'u': 30.0}), tr('Real, inverted, same size'));
      expect(LensBench.nature({'device': 'lens', 'item': 'B', 'u': 20.0}), tr('Real, inverted, magnified'));
      expect(LensBench.nature({'device': 'lens', 'item': 'B', 'u': 45.0}), tr('Real, inverted, diminished'));
      expect(LensBench.nature({'device': 'lens', 'item': 'B', 'u': 10.0}), tr('Virtual, erect, magnified'));
    });

    test('pendulum: T² grows with L, the mass does not matter, and g comes out near 9.8', () {
      const b = PendulumBench();
      final rows = [for (final l in [40.0, 70.0, 100.0, 130.0, 150.0]) row(b, {'length': l, 'bob': 'steel', 'amp': 10.0})];
      final wood = row(b, {'length': 100.0, 'bob': 'wood', 'amp': 10.0});
      expect(wood[2], rows[2][2]);
      rows.add(wood);
      final res = b.result(rows)!;
      final g = double.parse(RegExp(r'≈ ([0-9.]+)').firstMatch(res)!.group(1)!);
      expect(g, closeTo(9.8, 0.15));
      expect(res, contains(tr('Different bobs at the same length gave the same time: the mass does not matter.')));
    });

    test("buoyancy: loss of weight equals the liquid displaced; light objects float", () {
      const b = BuoyancyBench();
      expect(b.read({'object': 'iron', 'liquid': 'water', 'depth': 0.5}).why, isNotNull);
      for (final o in BuoyancyBench.objects.keys) {
        for (final liquid in ['water', 'salt']) {
          final r = row(b, {'object': o, 'liquid': liquid, 'depth': 1.0});
          expect((r[4] as num).toDouble(), closeTo((r[5] as num).toDouble(), 0.11), reason: '$o in $liquid');
          final floats = o == 'wood' || o == 'wax';
          expect(r[6], floats ? tr('Yes') : tr('No'), reason: o);
          if (floats) expect(r[3], 0.0);
        }
      }
      final iron = row(b, {'object': 'iron', 'liquid': 'water', 'depth': 1.0});
      expect((iron[2] as num) / (iron[4] as num), closeTo(7.9, 0.05));
      expect(b.result([iron]), contains('7.9'));
    });

    test('indicators: each substance shows the right colour and nature', () {
      const b = IndicatorsBench();
      expect(b.read(b.defaults).why, isNotNull);
      String nature(String s, String ind) => row(b, {'sample': s, 'indicator': ind, 'added': true})[3] as String;
      expect(nature('lemon', 'universal'), tr('Acidic'));
      expect(nature('soap', 'universal'), tr('Basic'));
      expect(nature('water', 'universal'), tr('Neutral'));
      expect(nature('vinegar', 'blue-litmus'), tr('Acidic'));
      expect(nature('water', 'blue-litmus'), tr('Neutral or basic'));
      expect(nature('lime', 'red-litmus'), tr('Basic'));
      expect(nature('hcl', 'phenolphthalein'), tr('Acidic or neutral'));
      expect(row(b, {'sample': 'soda', 'indicator': 'phenolphthalein', 'added': true})[2], tr('Pink'));
      expect(row(b, {'sample': 'soap', 'indicator': 'turmeric', 'added': true})[2], tr('Reddish-brown'));
      expect(row(b, {'sample': 'lemon', 'indicator': 'china-rose', 'added': true})[2], tr('Dark pink (magenta)'));
      expect(row(b, {'sample': 'naoh', 'indicator': 'china-rose', 'added': true})[2], tr('Green'));
      expect(row(b, {'sample': 'hcl', 'indicator': 'universal', 'added': true})[4], 1);
      // Changing the sample empties the tube again.
      expect(b.act('set:sample', {'sample': 'soap', 'indicator': 'universal', 'added': true})['added'], isFalse);
      final rows = [for (final s in ['hcl', 'water', 'naoh']) row(b, {'sample': s, 'indicator': 'universal', 'added': true})];
      expect(b.result(rows), contains(tr('Dilute hydrochloric acid')));
    });

    test('displacement: the reactivity order comes out as Al > Zn > Fe > Cu', () {
      const b = DisplacementBench();
      expect(b.read({'metal': 'zn', 'solution': 'cu', 'minutes': 0.0}).why, isNotNull);
      final rows = <List<Object>>[];
      for (final m in DisplacementBench.metals) {
        for (final s in DisplacementBench.metals) {
          if (m == s) continue;
          final r = row(b, {'metal': m, 'solution': s, 'minutes': 20.0});
          expect(r[3], (DisplacementBench.rank[m]! > DisplacementBench.rank[s]!) ? tr('Yes') : tr('No'), reason: '$m in $s');
          rows.add(r);
        }
      }
      expect(b.result(rows), contains([tr('Aluminium'), tr('Zinc'), tr('Iron'), tr('Copper')].join(' > ')));
      expect(DisplacementBench.equation('zn', 'cu'), 'Zn + CuSO₄ → ZnSO₄ + Cu');
      expect(DisplacementBench.equation('al', 'fe'), '2Al + 3FeSO₄ → Al₂(SO₄)₃ + 3Fe');
    });

    test('microscope: readings only in focus; high power needs the fine knob', () {
      const b = MicroscopeBench();
      expect(b.read(b.defaults).why, isNotNull);
      final focused = {...b.defaults, 'coarse': MicroscopeBench.target};
      expect(row(b, focused)[1], '100×');
      // A small error that is fine at 10× blurs the view at 40×.
      final nearly = {...focused, 'coarse': MicroscopeBench.target + 0.015};
      expect(MicroscopeBench.sharp(nearly), isTrue);
      expect(MicroscopeBench.sharp({...nearly, 'mag': 40}), isFalse);
      final fixed = {...nearly, 'mag': 40, 'fine': 0.5 - 0.015 / 0.12};
      expect(MicroscopeBench.sharp(fixed), isTrue);
      expect(row(b, fixed)[1], '400×');
      // A new slide starts out of focus, at low power.
      expect(MicroscopeBench.sharp(b.act('set:slide', {...fixed, 'slide': 'cheek'})), isFalse);
    });

    test('probability: the same presses give the same throws, and many tosses come near 1/2', () {
      const b = ProbabilityBench();
      expect(b.read(b.defaults).why, isNotNull);
      final a = b.act('t1000', b.defaults), c = b.act('t1000', b.defaults);
      expect(a['counts'], c['counts']);
      final r = row(b, a);
      expect(r[1], 1000);
      expect((r[4] as num).toDouble(), closeTo(0.5, 0.05));
      var die = b.act('set:exp', {...b.defaults, 'exp': 'die'});
      expect((die['counts'] as List).length, 6);
      die = b.act('t1000', die);
      expect(ProbabilityBench.trials(die), 1000);
      expect((row(b, die)[4] as num).toDouble(), closeTo(1 / 6, 0.05));
      expect(ProbabilityBench.trials(b.act('reset', die)), 0);
    });

    test('conductors: metals and graphite light the bulb, the rest do not, and only with the switch on', () {
      const b = ConductorsBench();
      expect(b.read(b.defaults).why, isNotNull);
      for (final MapEntry(key: o, value: conducts) in ConductorsBench.objects.entries) {
        final p = {'object': o, 'on': true};
        expect(ConductorsBench.glows(p), conducts, reason: o);
        expect(ConductorsBench.glows({...p, 'on': false}), isFalse);
        expect(row(b, p)[2], conducts ? tr('Conductor') : tr('Insulator'));
      }
      for (final o in ['nail', 'copper', 'foil', 'coin', 'graphite']) {
        expect(ConductorsBench.objects[o], isTrue, reason: o);
      }
      final res = b.result([row(b, {'object': 'copper', 'on': true}), row(b, {'object': 'wood', 'on': true})])!;
      expect(res, contains(ConductorsBench.objectName('copper')));
      expect(res, contains(ConductorsBench.objectName('wood')));
    });

    test('magnets: iron and steel are pulled; like poles repel and unlike attract', () {
      const b = MagnetsBench();
      for (final MapEntry(key: o, value: magnetic) in MagnetsBench.objects.entries) {
        expect(row(b, {...b.defaults, 'object': o})[2], magnetic ? tr('Magnetic') : tr('Non-magnetic'), reason: o);
      }
      expect(MagnetsBench.objects.entries.where((e) => e.value).map((e) => e.key), unorderedEquals(['nail', 'spoon', 'pin']));
      expect(row(b, {...b.defaults, 'mode': 'poles', 'pair': 'NS'})[1], tr('Pulled together'));
      for (final pair in ['NN', 'SS']) {
        expect(row(b, {...b.defaults, 'mode': 'poles', 'pair': pair})[1], tr('Pushed apart'));
      }
      final res = b.result([
        row(b, {...b.defaults, 'mode': 'poles', 'pair': 'NN'}),
        row(b, {...b.defaults, 'mode': 'poles', 'pair': 'NS'}),
      ])!;
      expect(res, contains(tr('Like poles repel.')));
      expect(res, contains(tr('Unlike poles attract.')));
    });

    test('shadows: the shadow grows as the object nears the torch; glass gives none', () {
      const b = ShadowsBench();
      for (final d in [10.0, 25.0, 50.0, 90.0]) {
        expect(ShadowsBench.shadowCm({'object': 'card', 'dist': d}), closeTo(1000 / d, 1e-9));
      }
      expect(row(b, {'object': 'glass', 'dist': 50.0})[2], tr('Transparent'));
      expect(row(b, {'object': 'glass', 'dist': 50.0})[5], '—');
      expect(row(b, {'object': 'butter', 'dist': 50.0})[2], tr('Translucent'));
      expect(row(b, {'object': 'wood', 'dist': 50.0})[2], tr('Opaque'));
      expect(row(b, {'object': 'card', 'dist': 20.0})[5], 50.0);
      final res = b.result([row(b, {'object': 'card', 'dist': 80.0}), row(b, {'object': 'card', 'dist': 20.0})])!;
      expect(res, contains('50'));
      expect(res, contains('12.5'));
    });

    test('prism: deviation is least near i = e, about 37° for glass; too small an angle gives no ray out', () {
      const b = PrismBench();
      final ds = [for (var i = 30; i <= 80; i++) (i, PrismBench.path(i.toDouble())!)];
      final min = ds.reduce((a, c) => a.$2.d <= c.$2.d ? a : c);
      expect(min.$2.d, closeTo(37.2, 0.2));
      expect(min.$2.e, closeTo(min.$1.toDouble(), 1.5));
      // r1 + r2 = A on every path.
      for (final (_, r) in ds) {
        expect(r.r1 + r.r2, closeTo(60, 1e-9));
      }
      expect(b.read({'i': 20.0, 'white': false}).why, isNotNull);
      expect(PrismBench.path(20), isNull);
      // Violet bends more than red.
      expect(PrismBench.path(48, 1.531)!.d, greaterThan(PrismBench.path(48, 1.513)!.d));
      final rows = [for (final i in [35.0, 40.0, 45.0, 50.0, 55.0, 60.0]) row(b, {'i': i, 'white': false})];
      expect(b.result(rows), contains('1.5'));
    });

    test('heating curve: flat at 0 °C while ice melts and at 100 °C while water boils; salt shifts both', () {
      const b = HeatingBench();
      for (final m in [0.0, 3.0, 5.0]) {
        expect(HeatingBench.temperature({'minutes': m, 'salt': false}), 0);
        expect(HeatingBench.phase({'minutes': m, 'salt': false}), 0);
      }
      expect(HeatingBench.temperature({'minutes': 11.0, 'salt': false}), 50);
      for (final m in [16.0, 20.0, 30.0]) {
        expect(HeatingBench.temperature({'minutes': m, 'salt': false}), 100);
        expect(HeatingBench.phase({'minutes': m, 'salt': false}), 2);
      }
      expect(HeatingBench.temperature({'minutes': 2.0, 'salt': true}), -2);
      expect(HeatingBench.temperature({'minutes': 30.0, 'salt': true}), 101);
      // Never cooler as time goes on.
      var last = -100.0;
      for (var m = 0; m <= 30; m++) {
        final t = HeatingBench.temperature({'minutes': m.toDouble(), 'salt': false});
        expect(t, greaterThanOrEqualTo(last));
        last = t;
      }
      final rows = [for (var m = 0; m <= 30; m += 2) row(b, {'minutes': m.toDouble(), 'salt': false})];
      final res = b.result(rows)!;
      expect(res, contains(tr('While the ice melted the thermometer stayed at {t} °C: the melting point.', {'t': 0})));
      expect(res, contains(tr('While the water boiled it stayed at {t} °C: the boiling point.', {'t': 100})));
    });

    test('reactions: each shows its type once it has gone far enough', () {
      const b = ReactionsBench();
      for (final r in ReactionsBench.reactions) {
        expect(b.read({'reaction': r, 'progress': 0.25}).why, isNotNull, reason: r);
        final got = row(b, {'reaction': r, 'progress': 1.0});
        expect(got[2], ReactionsBench.typeName(r));
        expect('${got[3]}', contains('→'));
      }
      expect(b.act('set:reaction', {'reaction': 'double', 'progress': 1.0})['progress'], 0.0);
      final res = b.result([row(b, {'reaction': 'combination', 'progress': 1.0})])!;
      expect(res, contains(tr('Combination')));
      expect(res, contains(tr('Quicklime and water gave out heat: an exothermic reaction.')));
    });

    test('starch test: only after iodine; each leaf shows where starch forms', () {
      const b = StarchBench();
      for (final l in StarchBench.leaves) {
        for (var s = 0; s < 4; s++) {
          expect(b.read({'leaf': l, 'stage': s}).why, isNotNull);
        }
        expect(row(b, {'leaf': l, 'stage': 4})[2], StarchBench.finding(l).$2);
      }
      expect(row(b, {'leaf': 'dark', 'stage': 4})[1], tr('Nowhere'));
      // A new leaf starts again from the plant.
      expect(b.act('set:leaf', {'leaf': 'dark', 'stage': 4})['stage'], 0);
    });

    test('triangle: the three angles make 180° and the exterior angle is the two far angles', () {
      const b = TriangleBench();
      for (final (a, bb) in [(70.0, 50.0), (30.0, 40.0), (90.0, 45.0), (20.0, 20.0)]) {
        final r = row(b, {...b.defaults, 'a': a, 'b': bb});
        expect(r[3], 180);
        expect(r[4], r[5]);
      }
      expect(TriangleBench.kindName(90, 45, 45), tr('Right-angled triangle'));
      expect(TriangleBench.kindName(30, 40, 110), tr('Obtuse-angled triangle'));
      expect(TriangleBench.kindName(70, 50, 60), tr('Acute-angled triangle'));
      // The sliders keep a triangle: A + B stays at most 165°.
      final p = b.act('set:a', {...b.defaults, 'a': 150.0, 'b': 50.0});
      expect(pNum(p, 'a', 0) + pNum(p, 'b', 0), lessThanOrEqualTo(165));
      expect(b.read(b.act('set:b', {...b.defaults, 'a': 100.0, 'b': 100.0})).row, isNotNull);
      final res = b.result([row(b, b.defaults), row(b, {...b.defaults, 'a': 30.0, 'b': 40.0})])!;
      expect(res, contains(tr('In all {n} triangles the angles added up to 180°.', {'n': 2})));
      expect(res, contains(tr('Each time the exterior angle at C equalled ∠A + ∠B.')));
    });

    test('separation: each mixture gives way to the method that uses how its parts differ', () {
      const b = SeparationBench();
      expect(b.read(b.defaults).why, isNotNull);
      final best = {'sand': ['decant', 'filter'], 'salt': ['evaporate'], 'iron': ['magnet'], 'oil': ['decant']};
      for (final m in SeparationBench.mixtures) {
        for (final how in SeparationBench.methods) {
          final got = row(b, {'mixture': m, 'method': how, 'progress': 1.0});
          expect(got[2] == tr('Yes'), best[m]!.contains(how), reason: '$m by $how');
        }
      }
      // Filtering cannot take out dissolved salt; a magnet does nothing to sand.
      expect(SeparationBench.works('salt', 'filter'), 0);
      expect(SeparationBench.works('sand', 'magnet'), 0);
      expect(b.act('set:method', {'mixture': 'salt', 'method': 'filter', 'progress': 1.0})['progress'], 0.0);
      final res = b.result([row(b, {'mixture': 'salt', 'method': 'filter', 'progress': 1.0}), row(b, {'mixture': 'salt', 'method': 'evaporate', 'progress': 1.0})])!;
      expect(res, contains(SeparationBench.methodName('evaporate')));
      expect(res, isNot(contains('"${SeparationBench.methodName('filter')}"')));
    });

    test('germination: only the jar with water, air and warmth sprouts', () {
      const b = GerminationBench();
      expect(b.read(b.defaults).why, isNotNull);
      for (final j in GerminationBench.jars) {
        expect(row(b, {'jar': j, 'days': 5.0})[3], j == 'B' ? tr('Yes') : tr('No'), reason: j);
      }
      // The sprout keeps growing.
      expect(GerminationBench.sprout('B', 6), greaterThan(GerminationBench.sprout('B', 3)));
      expect(GerminationBench.sprout('B', 1), 0);
      final rows = [for (final j in GerminationBench.jars) row(b, {'jar': j, 'days': 5.0})];
      expect(b.result(rows), contains(tr('Seeds need water, air and warmth together to germinate.')));
      expect(b.graph(b.defaults).points([...rows, row(b, {'jar': 'B', 'days': 7.0})]).length, 2);
    });

    test('pinhole camera: image ÷ object = v ÷ u, upside down; big or two holes give no reading', () {
      const b = PinholeBench();
      for (final (u, v) in [(20.0, 10.0), (40.0, 20.0), (100.0, 30.0), (60.0, 15.0)]) {
        final got = row(b, {'u': u, 'v': v, 'hole': 'small'});
        expect((got[2] as num).toDouble(), closeTo(12 * v / u, 0.05));
        expect((got[3] as num).toDouble(), closeTo((got[4] as num).toDouble(), 0.01));
      }
      expect(b.read({'u': 40.0, 'v': 20.0, 'hole': 'big'}).why, isNotNull);
      expect(b.read({'u': 40.0, 'v': 20.0, 'hole': 'two'}).why, isNotNull);
      final res = b.result([row(b, {'u': 30.0, 'v': 20.0, 'hole': 'small'}), row(b, {'u': 60.0, 'v': 20.0, 'hole': 'small'})])!;
      expect(res, contains(tr('Image ÷ object = v ÷ u in all {n} readings: the nearer the candle or the longer the box, the bigger the image.', {'n': 2})));
    });

    test('mirror: the angle of reflection equals the angle of incidence; a rough surface scatters', () {
      const b = MirrorBench();
      final rows = [for (var i = 10; i <= 80; i += 10) row(b, {'i': i.toDouble(), 'surface': 'mirror'})];
      for (final r in rows) {
        expect(r[1], r[0]);
      }
      expect(LabGraph.slope(b.graph(b.defaults).points(rows)), closeTo(1, 1e-9));
      expect(b.read({'i': 30.0, 'surface': 'rough'}).why, isNotNull);
      expect(b.result(rows), contains('${rows.length}'));
    });

    test('rusting: only air and water together rust iron, and salt water is faster', () {
      const b = RustingBench();
      expect(b.read(b.defaults).why, isNotNull);
      for (final k in ['B', 'C']) {
        expect(RustingBench.rust(k, 7), 0, reason: k);
      }
      expect(RustingBench.rust('A', 5), greaterThan(0));
      expect(RustingBench.rust('D', 3), greaterThan(RustingBench.rust('A', 3)));
      final rows = [for (final k in RustingBench.tubes) row(b, {'tube': k, 'days': 3.0})];
      final res = b.result(rows)!;
      expect(res, contains(tr('Iron rusts only when both air and water reach it.')));
      expect(res, contains(tr('Salt water makes iron rust faster.')));
    });

    test('osmosis: dry raisins swell in water, soaked ones shrink in strong solutions', () {
      const b = OsmosisBench();
      expect(b.read(b.defaults).why, isNotNull);
      final swell = row(b, {'solution': 'water', 'soaked': false, 'hours': 6.0});
      expect((swell[5] as num).toDouble(), greaterThan(1.5));
      for (final s in ['sugar', 'salt']) {
        final shrink = row(b, {'solution': s, 'soaked': true, 'hours': 6.0});
        expect((shrink[5] as num).toDouble(), lessThan(-1.2), reason: s);
        final dry = row(b, {'solution': s, 'soaked': false, 'hours': 6.0});
        expect((dry[5] as num).toDouble().abs(), lessThan(0.3), reason: s);
      }
      // Mass settles: never overshoots the swollen mass.
      for (var h = 0; h <= 8; h++) {
        expect(OsmosisBench.mass({'solution': 'water', 'soaked': false, 'hours': h.toDouble()}), lessThanOrEqualTo(OsmosisBench.swollenG));
      }
      expect(OsmosisBench.flow({'solution': 'water', 'soaked': false, 'hours': 0.0}), 1);
      expect(OsmosisBench.flow({'solution': 'salt', 'soaked': true, 'hours': 0.0}), -1);
      expect(b.act('set:solution', {'solution': 'salt', 'soaked': true, 'hours': 5.0})['hours'], 0.0);
      final res = b.result([swell, row(b, {'solution': 'salt', 'soaked': true, 'hours': 4.0})])!;
      expect(res, contains(tr('Raisins gained water in plain water and swelled (endosmosis).')));
      expect(res, contains(tr('Swollen raisins lost water in the strong solution and shrank (exosmosis).')));
    });

    test("Pythagoras: a² + b² = c² exactly at a right angle, less or more otherwise", () {
      const b = PythagorasBench();
      for (final (a, bb) in [(3.0, 4.0), (5.0, 12.0), (6.0, 8.0), (7.0, 9.0)]) {
        final r = row(b, {'a': a, 'b': bb, 'C': 90.0});
        expect((r[4] as num).toDouble(), closeTo((r[3] as num).toDouble(), 0.05));
      }
      expect(PythagorasBench.cSquared({'a': 6.0, 'b': 8.0, 'C': 60.0}), lessThan(100));
      expect(PythagorasBench.cSquared({'a': 6.0, 'b': 8.0, 'C': 120.0}), closeTo(148, 1e-9));
      final res = b.result([
        row(b, {'a': 4.0, 'b': 3.0, 'C': 90.0}),
        row(b, {'a': 12.0, 'b': 5.0, 'C': 90.0}),
        row(b, {'a': 6.0, 'b': 8.0, 'C': 70.0}),
        row(b, {'a': 6.0, 'b': 8.0, 'C': 110.0}),
      ])!;
      expect(res, contains(tr('When ∠C = 90°, a² + b² = c² (in {n} readings).', {'n': 2})));
      expect(res, contains(tr('{a}, {b}, {c} is a Pythagorean triplet.', {'a': 3, 'b': 4, 'c': 5})));
      expect(res, contains(tr('{a}, {b}, {c} is a Pythagorean triplet.', {'a': 5, 'b': 12, 'c': 13})));
      expect(res, contains(tr('When ∠C is less than 90°, c² is less than a² + b².')));
      expect(res, contains(tr('When ∠C is more than 90°, c² is more than a² + b².')));
    });

    test('circle: one full turn measures the circumference, and C ÷ d comes near π', () {
      const b = CircleBench();
      expect(b.read(b.defaults).why, isNotNull);
      final rows = [for (final o in CircleBench.objects.keys) row(b, {'object': o, 'roll': 1.0})];
      for (final r in rows) {
        expect((r[3] as num).toDouble(), closeTo(math.pi, 0.03), reason: '${r[0]}');
      }
      expect(LabGraph.slope(b.graph(b.defaults).points(rows)), closeTo(math.pi, 0.01));
      expect(b.result(rows), contains('3.14'));
      expect(b.act('set:object', {'object': 'cd', 'roll': 1.0})['roll'], 0.0);
    });

    test('lever: readings only when level, and the two moments are equal', () {
      const b = LeverBench();
      final r = row(b, b.defaults);
      expect(r[2], r[5]);
      expect(b.read({...b.defaults, 'd2': 30.0}).row, isNull, reason: 'not level');
      expect(LeverBench.tilt({...b.defaults, 'd2': 30.0}), greaterThan(0), reason: 'right side heavier turns clockwise');
      expect(LeverBench.tilt({...b.defaults, 'd1': 45.0}), lessThan(0));
      final r2 = row(b, {'m1': 50, 'd1': 40.0, 'm2': 200, 'd2': 10.0});
      expect(r2[2], 2000);
      expect(b.result([r, r2]), contains('principle of moments'));
    });

    test('electromagnet: more current and more turns lift more pins; wood almost none; off lifts nothing', () {
      const b = ElectromagnetBench();
      int pins(LabParams p) => ElectromagnetBench.pins({...b.defaults, ...p});
      expect(pins({'current': 3.0}), greaterThan(pins({'current': 1.0})));
      expect(pins({'turns': 80.0}), greaterThan(pins({'turns': 20.0})));
      expect(pins({'core': 'wood'}), lessThanOrEqualTo(2));
      expect(pins({'turns': 100.0, 'current': 3.0}), ElectromagnetBench.maxPins);
      expect(b.read({...b.defaults, 'on': false}).row, isNull);
      final rows = [
        row(b, {...b.defaults, 'current': 1.0}),
        row(b, {...b.defaults, 'current': 2.5}),
        row(b, {...b.defaults, 'turns': 80.0, 'current': 1.0}),
        row(b, {...b.defaults, 'core': 'wood'}),
      ];
      final res = b.result(rows)!;
      expect(res, contains('larger current'));
      expect(res, contains('more turns'));
      expect(res, contains('iron core'));
    });

    test('calorimetry: heat lost = heat gained, and c comes out near the table for each metal', () {
      const b = CalorimetryBench();
      expect(b.read(b.defaults).row, isNull, reason: 'the block is still in the boiling water');
      final rows = <List<Object>>[];
      for (final metal in CalorimetryBench.specificHeat.keys) {
        for (final water in [50.0, 150.0]) {
          final p = b.act('drop', {...b.defaults, 'metal': metal, 'water': water});
          final theta = CalorimetryBench.finalTemperature(p);
          expect(theta, inExclusiveRange(25, 100));
          final c = CalorimetryBench.specificHeat[metal]!;
          expect(pNum(p, 'mass') * c * (100 - theta), closeTo(water * 4.2 * (theta - 25), 1e-6));
          final r = row(b, p);
          expect((r[5] as num).toDouble(), closeTo(c, 0.03));
          rows.add(r);
        }
      }
      expect(b.act('set:metal', {...b.defaults, 'dropped': true})['dropped'], isFalse);
      expect(b.result(rows), contains('0.39'));
    });

    test('sonometer: f × L stays the same, f grows as √ of the weight, a thick wire is lower', () {
      const b = SonometerBench();
      final f60 = SonometerBench.frequency(b.defaults), f30 = SonometerBench.frequency({...b.defaults, 'length': 30.0});
      expect(f30, closeTo(2 * f60, 1e-9));
      expect(SonometerBench.frequency({...b.defaults, 'tension': 4.0}) / SonometerBench.frequency({...b.defaults, 'tension': 1.0}), closeTo(2, 1e-9));
      expect(SonometerBench.frequency({...b.defaults, 'wire': 'thick'}), lessThan(f60));
      final rows = [for (final l in [40.0, 60.0, 80.0]) row(b, {...b.defaults, 'length': l}), row(b, {...b.defaults, 'tension': 4.0})];
      final res = b.result(rows)!;
      expect(res, contains('inversely proportional'));
      expect(res, contains('√'));
    });

    test('transpiration: wind fastest, dark slowest, half the leaves half the water', () {
      const b = TranspirationBench();
      double rate(String c, [String leaves = 'all']) => TranspirationBench.rate({...b.defaults, 'condition': c, 'leaves': leaves});
      expect(rate('wind'), greaterThan(rate('still')));
      expect(rate('still'), greaterThan(rate('bag')));
      expect(rate('bag'), greaterThan(rate('dark')));
      expect(rate('still', 'half'), rate('still') / 2);
      final rows = [for (final c in ['still', 'wind', 'dark', 'bag']) row(b, {...b.defaults, 'condition': c}), row(b, {...b.defaults, 'leaves': 'half'})];
      final res = b.result(rows)!;
      expect(res, contains('Fastest: ${TranspirationBench.conditionName('wind')}'));
      expect(res, contains('half as fast'));
    });
  });
}
