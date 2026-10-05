import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_labs/kinetix_labs.dart';
import 'package:kinetix_labs/src/benches/optics/optics_benches.dart';
import 'package:kinetix_labs/src/engines/ray_optics.dart';

List<Object> row(LabBench b, LabParams p) {
  final r = b.read(p);
  expect(r.row, isNotNull, reason: 'no reading: ${r.why}');
  return r.row!;
}

void main() {
  group('ray optics engine', () {
    test('lens equation: f = 10 cm, u = −30 cm gives v = +15 cm; at 2F, v = 2f', () {
      expect(RayOptics.lensImage(-30, 10), closeTo(15, 1e-12));
      expect(RayOptics.lensImage(-20, 10), closeTo(20, 1e-12));
      expect(RayOptics.lensImage(-10, 10), isNull); // at F: image at infinity
      expect(RayOptics.lensImage(-5, 10), closeTo(-10, 1e-12)); // virtual, same side
    });

    test('mirror equation: concave f = 15, u = 30 gives v = 30 (at C); convex gives virtual', () {
      expect(RayOptics.mirrorImage(30, 15), closeTo(30, 1e-12));
      expect(RayOptics.mirrorImage(45, 15), closeTo(22.5, 1e-12));
      expect(RayOptics.mirrorImage(20, -10)!, lessThan(0));
    });

    test('lenses in contact add powers', () {
      expect(RayOptics.combined(15, -25), closeTo(37.5, 1e-9));
      expect(RayOptics.combined(20, 20), closeTo(10, 1e-9));
    });

    test("Snell, critical angle and total internal reflection", () {
      expect(RayOptics.refract(30, 1, 1.5), closeTo(19.47, 0.01));
      expect(RayOptics.criticalAngle(1.5), closeTo(41.81, 0.01));
      expect(RayOptics.refract(60, 1.5, 1), isNull);
    });

    test('prism: r₁ + r₂ = A, least deviation where i = e, n back from δm', () {
      final dm = RayOptics.minDeviation(60, 1.5);
      expect(dm, closeTo(37.18, 0.01));
      final at = RayOptics.prism((60 + dm) / 2, 60, 1.5)!;
      expect(at.r1 + at.r2, closeTo(60, 1e-12));
      expect(at.e, closeTo((60 + dm) / 2, 1e-6));
      expect(at.d, closeTo(dm, 1e-9));
      expect(RayOptics.prismIndex(60, dm), closeTo(1.5, 1e-12));
      expect(RayOptics.prism(20, 60, 1.5), isNull);
    });

    test('grating: sodium 589.3 nm at 500 lines/mm, first order at 17.13°', () {
      final a = RayOptics.gratingAngle(1, 589.3e-9, 500)!;
      expect(a, closeTo(17.13, 0.01));
      expect(RayOptics.gratingWavelength(a, 1, 500), closeTo(589.3e-9, 1e-15));
      expect(RayOptics.gratingAngle(4, 589.3e-9, 500), isNull);
    });

    test("Newton's rings: rₙ = √(nλR) and the centre is dark", () {
      expect(RayOptics.newtonDarkRadius(10, 589.3e-9, 1.0), closeTo(math.sqrt(10 * 589.3e-9), 1e-15));
      expect(RayOptics.newtonIntensity(0, 589.3e-9, 1), closeTo(0, 1e-12));
      expect(RayOptics.newtonIntensity(RayOptics.newtonDarkRadius(5, 589.3e-9, 1), 589.3e-9, 1), closeTo(0, 1e-9));
    });

    test('apparent depth and slab shift', () {
      expect(RayOptics.apparentDepth(3, 1.5), 2);
      expect(RayOptics.slabShift(0, 1.5, 3), closeTo(0, 1e-12));
      expect(RayOptics.slabShift(45, 1.5, 3), greaterThan(0));
    });
  });

  group('optics benches', () {
    test('u–v method: f comes out right for a lens, a mirror and a lens pair', () {
      const b = OpticalBench();
      for (final task in ['lens-uv', 'mirror-uv', 'concave-lens']) {
        final rows = <List<Object>>[];
        for (final u in [25.0, 30.0, 40.0, 50.0, 60.0, 70.0]) {
          final p = {...b.defaults, 'task': task, 'item': task == 'concave-lens' ? 'A' : 'B', 'u': u};
          final v = OpticalBench.image(p);
          if (v == null || v > 75) continue;
          expect(b.read({...p, 'needle': v + 1}).why, isNotNull, reason: 'parallax');
          rows.add(row(b, {...p, 'needle': (v * 10).round() / 10}));
        }
        expect(rows.length, greaterThanOrEqualTo(2), reason: task);
        final want = task == 'concave-lens' ? 30.0 : 15.0;
        final f = meanSe([for (final r in rows) (r[4] as num).toDouble()]).mean;
        expect(f, closeTo(want, 0.3), reason: task);
      }
    });

    test('convex mirror via a lens: f = R/2', () {
      const b = ConvexMirrorBench();
      for (final item in ['A', 'B', 'C']) {
        final p = {...b.defaults, 'item': item};
        final m = OpticalBench.convexMirror(p)!.$2;
        final r = row(b, {...p, 'mirror': (m * 10).round() / 10});
        expect((r[4] as num).toDouble(), closeTo(OpticalBench.focal[item]!, 0.15), reason: item);
      }
    });

    test('travelling microscope: n = real ÷ apparent depth', () {
      const b = TravellingMicroscopeBench();
      for (final m in TravellingMicroscopeBench.materials.keys) {
        final rows = [
          for (final target in ['mark', 'image', 'top'])
            row(b, {...b.defaults, 'material': m, 'target': target, 'h': (TravellingMicroscopeBench.focusAt({...b.defaults, 'material': m, 'target': target}) * 1000).round() / 1000}),
        ];
        final n = double.parse(RegExp(r'n = ([0-9.]+[0-9])').firstMatch(b.result(rows)!)!.group(1)!);
        expect(n, closeTo(TravellingMicroscopeBench.materials[m]!, 0.01), reason: m);
      }
    });

    test('grating: every mercury line gives its wavelength back', () {
      const b = GratingBench();
      for (final s in GratingBench.spectrum({...b.defaults, 'lines': 600.0}).where((s) => s.$3 > 0)) {
        final r = row(b, {...b.defaults, 'lines': 600.0, 'angle': (s.$4 * 100).round() / 100});
        expect((r[3] as num).toDouble(), closeTo(s.$2, 0.6));
      }
      expect(b.read({...b.defaults, 'angle': 0.0}).why, isNotNull);
    });

    test("Newton's rings: λ from the slope of D² against n", () {
      const b = NewtonRingsBench();
      final rows = [
        for (final n in [4, 8, 12, 16, 20])
          row(b, {...b.defaults, 'x': (RayOptics.newtonDarkRadius(n, NewtonRingsBench.lambda, 1.0) * 1e6).round() / 1000}),
      ];
      final l = double.parse(RegExp(r'λ = slope ÷ 4R = ([0-9.]+)').firstMatch(b.result(rows)!)!.group(1)!);
      expect(l, closeTo(589.3, 3));
    });
  });
}
