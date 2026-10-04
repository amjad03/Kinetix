import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';

void main() {
  const pi = math.pi;
  Matcher near(double v) => closeTo(v, 1e-9 * math.max(1, v.abs()));

  test('cube and cuboid', () {
    final c = Solid(SolidKind.cube, {'a': 4});
    expect(c.volume, near(64));
    expect(c.curvedSurfaceArea, near(64)); // LSA = 4a²
    expect(c.totalSurfaceArea, near(96));
    final b = Solid(SolidKind.cuboid, {'l': 6, 'b': 4, 'h': 3});
    expect(b.volume, near(72));
    expect(b.curvedSurfaceArea, near(60)); // 2h(l + b)
    expect(b.totalSurfaceArea, near(108)); // 2(24 + 12 + 18)
    expect(b.measurements.last.value, near(math.sqrt(61))); // diagonal
  });

  test('sphere and hemisphere', () {
    final s = Solid(SolidKind.sphere, {'r': 3});
    expect(s.volume, near(36 * pi));
    expect(s.totalSurfaceArea, near(36 * pi));
    expect(s.curvedSurfaceArea, isNull);
    final h = Solid(SolidKind.hemisphere, {'r': 3});
    expect(h.volume, near(18 * pi));
    expect(h.curvedSurfaceArea, near(18 * pi));
    expect(h.totalSurfaceArea, near(27 * pi));
  });

  test('cylinder', () {
    final c = Solid(SolidKind.cylinder, {'r': 3, 'h': 7});
    expect(c.volume, near(63 * pi));
    expect(c.curvedSurfaceArea, near(42 * pi));
    expect(c.totalSurfaceArea, near(60 * pi));
  });

  test('cone: l = √(r² + h²), V = ⅓πr²h, CSA = πrl, TSA = πr(l + r)', () {
    final c = Solid(SolidKind.cone, {'r': 3, 'h': 4});
    expect(c.slantHeight, near(5));
    expect(c.volume, near(12 * pi));
    expect(c.curvedSurfaceArea, near(15 * pi));
    expect(c.totalSurfaceArea, near(24 * pi));
    expect(c.measurements.map((m) => m.valueText), ['5.00 cm', '37.70 cm³', '47.12 cm²', '75.40 cm²']);
    expect(c.measurements[1].formula, 'V = ⅓πr²h');
    expect(c.measurements[1].working, '⅓ × π × 3.00² × 4.00');
  });

  test('frustum: l = √(h² + (R − r)²), V = ⅓πh(R² + r² + Rr)', () {
    final f = Solid(SolidKind.frustum, {'R': 5, 'r': 2, 'h': 4});
    expect(f.slantHeight, near(5)); // √(16 + 9)
    expect(f.volume, near(pi * 4 / 3 * (25 + 4 + 10)));
    expect(f.curvedSurfaceArea, near(pi * 5 * 7));
    expect(f.totalSurfaceArea, near(pi * 35 + pi * 25 + pi * 4));
    // A frustum with r → 0 becomes a cone.
    final cone = Solid(SolidKind.cone, {'r': 5, 'h': 4});
    final f0 = Solid(SolidKind.frustum, {'R': 5, 'r': 1e-9, 'h': 4});
    expect(f0.volume, closeTo(cone.volume, 1e-6));
    expect(f0.curvedSurfaceArea!, closeTo(cone.curvedSurfaceArea!, 1e-6));
  });

  test('square pyramid', () {
    final p = Solid(SolidKind.squarePyramid, {'a': 6, 'h': 4});
    expect(p.slantHeight, near(5)); // √(16 + 9)
    expect(p.volume, near(48));
    expect(p.curvedSurfaceArea, near(60)); // 2al
    expect(p.totalSurfaceArea, near(96));
  });

  test('triangular prism (equilateral base)', () {
    final p = Solid(SolidKind.triangularPrism, {'a': 4, 'h': 10});
    final base = math.sqrt(3) / 4 * 16;
    expect(p.volume, near(base * 10));
    expect(p.curvedSurfaceArea, near(120));
    expect(p.totalSurfaceArea, near(120 + 2 * base));
  });

  test('regular tetrahedron', () {
    final t = Solid(SolidKind.tetrahedron, {'a': 6});
    expect(t.volume, near(216 / (6 * math.sqrt2)));
    expect(t.totalSurfaceArea, near(36 * math.sqrt(3)));
    expect(t.slantHeight, near(3 * math.sqrt(3)));
    expect(t.measurements.first.value, near(6 * math.sqrt(2 / 3)));
  });

  test('π = 22/7 option (NCERT exercises)', () {
    final c = Solid(SolidKind.cylinder, {'r': 7, 'h': 10}, PiMode.twentyTwoBySeven);
    expect(c.volume, near(1540)); // 22/7 × 49 × 10
    expect(c.curvedSurfaceArea, near(440));
    expect(c.measurements.first.working, '22/7 × 7.00² × 10.00');
  });

  test('every solid builds a closed, outward-facing mesh whose volume matches the formula', () {
    for (final k in SolidKind.values) {
      final s = Solid(k);
      final model = s.toModel(grid: false);
      // Signed volume by the divergence theorem over all parts.
      var vol = 0.0;
      for (final p in model.parts) {
        final m = p.mesh;
        for (var t = 0; t < m.triangleCount; t++) {
          final a = m.vertex(m.indices[t * 3]), b = m.vertex(m.indices[t * 3 + 1]), c = m.vertex(m.indices[t * 3 + 2]);
          vol += a.dot(b.cross(c)) / 6;
        }
      }
      // Curved solids are polygonal approximations: within 1.5%.
      expect(vol, closeTo(s.volume, s.volume * 0.015), reason: k.name);
      expect(model.labels, isNotEmpty, reason: k.name);
    }
  });

  test('values format to two decimals with units', () {
    expect(formatNumber(2.005), anyOf('2.00', '2.01'));
    expect(formatNumber(-0.0001), '0.00');
    expect(const Measurement('V', 'V', '', 37.699, 'cm³').valueText, '37.70 cm³');
  });
}
