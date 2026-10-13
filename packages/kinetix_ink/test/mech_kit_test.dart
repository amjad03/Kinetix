import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

/// The mechanical engineering panels' models, checked against textbook results.
void main() {
  group('cycles', () {
    test('Otto: η = 1 − 1/r^(γ−1), from the states\' heat, for several r and γ', () {
      for (final g in [1.3, 1.4]) {
        for (final r in [6.0, 8.0, 10.0]) {
          final res = ThermoCycle(r: r, gamma: g, tMax: 2200).solve();
          expect(res.ok, isTrue);
          expect(res.efficiency, closeTo(1 - 1 / math.pow(r, g - 1), 1e-9), reason: 'r $r γ $g');
          expect(res.efficiency, closeTo(ottoEfficiency(r, g), 1e-12));
        }
      }
      // r = 8, γ = 1.4: 56.5 %.
      expect(const ThermoCycle(r: 8).solve().efficiency, closeTo(0.5647, 1e-4));
    });

    test('every state obeys pv = RT, and the cycle closes', () {
      for (final c in [
        const ThermoCycle(kind: CycleKind.otto),
        const ThermoCycle(kind: CycleKind.diesel, r: 18, rc: 2),
        const ThermoCycle(kind: CycleKind.dual, r: 16, rp: 1.5, rc: 1.6),
        const ThermoCycle(kind: CycleKind.brayton, rp: 10, tMax: 1400),
        const ThermoCycle(kind: CycleKind.carnot, tMax: 900),
      ]) {
        final r = c.solve();
        expect(r.ok, isTrue, reason: c.kind.name);
        for (final s in r.states) {
          expect(s.p * s.v, closeTo(airR * s.t, 1e-6 * s.p * s.v + 1e-9), reason: c.kind.name);
        }
        for (var i = 0; i < r.processes.length; i++) {
          final path = r.path(i);
          final a = r.states[r.processes[i].from], b = r.states[r.processes[i].to];
          expect(path.first.p, closeTo(a.p, a.p * 1e-6), reason: '${c.kind.name} ${i + 1}');
          expect(path.last.v, closeTo(b.v, b.v * 1e-6), reason: '${c.kind.name} ${i + 1}');
          expect(path.last.t, closeTo(b.t, b.t * 1e-3), reason: '${c.kind.name} ${i + 1}');
        }
        expect(r.processes.last.to, 0);
        // The work is what the heat leaves: q_in − q_out = η q_in.
        expect(r.work, closeTo(r.efficiency * r.heatIn, 1e-9));
      }
    });

    test('Diesel: η = 1 − (r꜀^γ − 1)/(γ r^(γ−1)(r꜀ − 1)); below Otto at the same r', () {
      for (final (r, rc) in [(16.0, 2.0), (18.0, 2.5), (20.0, 1.5)]) {
        final res = ThermoCycle(kind: CycleKind.diesel, r: r, rc: rc).solve();
        expect(res.efficiency, closeTo(1 - (math.pow(rc, 1.4) - 1) / (1.4 * math.pow(r, 0.4) * (rc - 1)), 1e-9));
        expect(res.efficiency, closeTo(dieselEfficiency(r, rc, 1.4), 1e-12));
        expect(res.efficiency, lessThan(ottoEfficiency(r, 1.4)));
      }
    });

    test('Dual: the mixed-cycle formula; r꜀ = 1 is Otto, rₚ = 1 is Diesel', () {
      final res = const ThermoCycle(kind: CycleKind.dual, r: 14, rp: 1.4, rc: 1.8).solve();
      expect(res.efficiency, closeTo(dualEfficiency(14, 1.4, 1.8, 1.4), 1e-9));
      expect(res.states, hasLength(5));
      expect(const ThermoCycle(kind: CycleKind.dual, r: 14, rp: 1, rc: 1.8).solve().efficiency, closeTo(dieselEfficiency(14, 1.8, 1.4), 1e-9));
      expect(dualEfficiency(14, 1.6, 1.0000001, 1.4), closeTo(ottoEfficiency(14, 1.4), 1e-6));
    });

    test('Brayton: η = 1 − 1/rₚ^((γ−1)/γ); Carnot: η = 1 − T_L/T_H', () {
      for (final rp in [5.0, 10.0, 15.0]) {
        final res = ThermoCycle(kind: CycleKind.brayton, rp: rp, tMax: 1500).solve();
        expect(res.efficiency, closeTo(1 - 1 / math.pow(rp, 0.4 / 1.4), 1e-9));
        expect(res.efficiency, closeTo(braytonEfficiency(rp, 1.4), 1e-12));
      }
      final carnot = const ThermoCycle(kind: CycleKind.carnot, t1: 300, tMax: 1200, expansion: 3).solve();
      expect(carnot.efficiency, closeTo(0.75, 1e-9));
      expect(carnot.efficiency, closeTo(carnotEfficiency(300, 1200), 1e-12));
    });

    test('Rankine (40 bar, 0.1 bar, dry saturated steam): x₄ ≈ 0.723, η ≈ 33.6 %', () {
      final r = const ThermoCycle(kind: CycleKind.rankine, boilerBar: 40, condenserBar: 0.1).solve();
      expect(r.ok, isTrue);
      expect(r.states[3].x, closeTo(0.7227, 1e-3));
      expect(r.states[2].h, closeTo(2801.4, 0.1));
      expect(r.efficiency, closeTo(0.336, 0.002));
      // Below the Carnot efficiency between the same temperatures.
      expect(r.efficiency, lessThan(carnotEfficiency(r.states[0].t, r.states[2].t)));
      expect(saturated(1).t, closeTo(99.63, 1e-9));
      expect(saturated(30).t, inExclusiveRange(212.42, 250.4));
    });

    test('impossible inputs say why and draw nothing', () {
      expect(const ThermoCycle(r: 8, tMax: 500).solve().error, contains('T₃'));
      expect(const ThermoCycle(kind: CycleKind.diesel, r: 4, rc: 5).solve().ok, isFalse);
      expect(const ThermoCycle(kind: CycleKind.rankine, boilerBar: 0.05, condenserBar: 1).solve().ok, isFalse);
    });

    test('a cycle saves and reads back', () {
      const c = ThermoCycle(title: 'Petrol engine', kind: CycleKind.dual, gamma: 1.35, p1: 95, t1: 310, r: 15, rc: 1.7, rp: 1.3, shade: false);
      final back = ThermoCycle.fromJson(jsonDecode(jsonEncode(c.toJson())) as Map<String, Object?>);
      expect(back.toJson(), c.toJson());
      expect(back.solve().efficiency, closeTo(c.solve().efficiency, 1e-6));
    });
  });

  group('free-body diagrams', () {
    test('a block on a 30° incline held by friction: f = mg sin θ found from equilibrium', () {
      const m = FbdModel(body: FbdBody.incline, theta: 30, mass: 10);
      final model = m.copyWith(forces: [m.weight(), m.normal(), m.friction().copyWith(unknown: FbdUnknown.magnitude)]);
      final r = model.solve();
      expect(r.solved, 2);
      expect(r.forces[2].magnitude, closeTo(10 * 9.81 * 0.5, 1e-3));
      expect(r.residual, closeTo(0, 1e-3));
      expect(r.balanced, isTrue);
      expect(r.sumFx, closeTo(0, 1e-3));
      expect(r.sumFy, closeTo(0, 1e-3));
      // Limiting friction μN would be 0.3 × 84.96 = 25.5 N < 49.05 N needed: it would slide.
      expect(m.friction().magnitude, closeTo(0.3 * 10 * 9.81 * math.cos(math.pi / 6), 1e-3));
    });

    test('the equilibrant of two forces is equal and opposite to their resultant', () {
      const model = FbdModel(
        forces: [
          FbdForce('P', magnitude: 30, angle: 0),
          FbdForce('Q', magnitude: 40, angle: 90),
          FbdForce('E', magnitude: 0, angle: 0, unknown: FbdUnknown.force),
        ],
      );
      final r = model.solve();
      expect(r.forces[2].magnitude, closeTo(50, 1e-6));
      expect(r.forces[2].angle, closeTo(180 + math.atan2(4, 3) * 180 / math.pi - 360, 1e-6));
      expect(r.balanced, isTrue);
    });

    test('components, moments and a beam that is not balanced', () {
      const f = FbdForce('F', magnitude: 100, angle: 60, x: 2, y: 0);
      expect(f.fx, closeTo(50, 1e-9));
      expect(f.fy, closeTo(86.6025, 1e-4));
      expect(f.moment, closeTo(2 * 86.6025, 1e-3));
      // A 4 m beam: 10 kN at the centre, reactions of 5 kN at each end balance; move one load and ΣM shows it.
      const beam = FbdModel(
        body: FbdBody.beam,
        forces: [
          FbdForce('W', magnitude: 10000, angle: -90),
          FbdForce('R_A', magnitude: 5000, angle: 90, x: -2),
          FbdForce('R_B', magnitude: 5000, angle: 90, x: 2),
        ],
      );
      expect(beam.solve().balanced, isTrue);
      final off = beam.copyWith(forces: [beam.forces[0].copyWith(x: 1), ...beam.forces.skip(1)]).solve();
      expect(off.sumFy, closeTo(0, 1e-9));
      expect(off.sumM, closeTo(-10000, 1e-6));
      expect(off.balanced, isFalse);
      // A force whose line cannot cancel the others is reported.
      final skew = const FbdModel(forces: [FbdForce('P', magnitude: 10, angle: 0), FbdForce('T', magnitude: 1, angle: 90, unknown: FbdUnknown.magnitude)]).solve();
      expect(skew.note, isNotNull);
      expect(skew.residual, closeTo(10, 1e-9));
    });

    test('a diagram saves and reads back', () {
      final m = const FbdModel(title: 'Ladder', body: FbdBody.beam, mass: 20, mu: 0.25).copyWith(forces: const [FbdForce('W', magnitude: 196.2, angle: -90, x: 0.5), FbdForce('R', magnitude: 50, angle: 45, unknown: FbdUnknown.force)]);
      final back = FbdModel.fromJson(jsonDecode(jsonEncode(m.toJson())) as Map<String, Object?>);
      expect(back.toJson(), m.toJson());
      expect(back.forces[1].unknown, FbdUnknown.force);
    });
  });

  group('drawing sheet', () {
    test('saves and reads back: grid, projection, scale, points and title block', () {
      const s = DrawingSheet(
        title: 'Points',
        size: SheetSize.a2,
        grid: DrawingGrid.isometric,
        gridMm: 5,
        projection: DrawingProjection.third,
        scale: '1:2',
        showMiter: false,
        points: [DrawingPoint('A', x: 20, h: 30, d: 15), DrawingPoint('B', x: 60, h: -20, d: 25)],
        name: 'R. Kumar',
        institution: 'GEC',
        sheetNo: '3',
      );
      final back = DrawingSheet.fromJson(jsonDecode(jsonEncode(s.toJson())) as Map<String, Object?>);
      expect(back.toJson(), s.toJson());
      expect(back.points.map((p) => p.quadrant), [1, 4]);
      expect(back.scaleFactor, 0.5);
      expect(DrawingSheet.fromJson(const {'scale': '3:7', 'grid': 'hex'}).scale, '1:1');
    });

    test('first angle: front view above XY, top view below; third angle the other way; side view via the 45° line', () {
      const a = DrawingPoint('A', x: 20, h: 30, d: 15);
      final first = const DrawingSheet().views(a, 200);
      expect(first.front, -30); // above XY (y down)
      expect(first.top, 15);
      expect(first.sideX, 215);
      final third = const DrawingSheet(projection: DrawingProjection.third, scale: '2:1').views(a, 200);
      expect(third.front, 60);
      expect(third.top, -30);
      expect(third.x, 40);
      expect(third.sideX, 230);
    });
  });

  test('every mechanical panel paints, saves and reads back', () {
    final panels = {
      KitKind.drawingSheet: const DrawingSheet(points: [DrawingPoint('A', x: 30, h: 20, d: 25)]).toJson(),
      KitKind.thermoCycle: const ThermoCycle(kind: CycleKind.rankine).toJson(),
      KitKind.fbd: const FbdModel(body: FbdBody.pulley, forces: [FbdForce('T1', magnitude: 50, angle: -90, x: -0.4), FbdForce('T2', magnitude: 50, angle: -90, x: 0.4), FbdForce('R', magnitude: 0, angle: 90, unknown: FbdUnknown.force)]).toJson(),
    };
    for (final MapEntry(key: kind, value: data) in panels.entries) {
      final k = KitElement.sized(kind: kind, data: data, color: const Color(0xFF8C2F2F));
      final back = decodeElement(jsonDecode(jsonEncode(encodeElement(k))) as Map<String, dynamic>, k.id)! as KitElement;
      expect(back.kind, kind);
      expect(back.data, k.data);
      final rec = ui.PictureRecorder();
      paintKit(Canvas(rec), back);
      rec.endRecording().dispose();
    }
    for (final g in DrawingGrid.values) {
      for (final p in DrawingProjection.values) {
        final rec = ui.PictureRecorder();
        paintDrawingSheet(Canvas(rec), DrawingSheet(grid: g, projection: p, points: const [DrawingPoint('A', x: 30, h: 20, d: -25)]), KitElement.naturalSizeOf(KitKind.drawingSheet), Colors.red);
        rec.endRecording().dispose();
      }
    }
    for (final c in CycleKind.values) {
      final rec = ui.PictureRecorder();
      // Straight to the painter, so a mistake throws instead of drawing the panel's dash.
      paintThermoCycle(Canvas(rec), ThermoCycle(kind: c), KitElement.naturalSizeOf(KitKind.thermoCycle), Colors.red);
      rec.endRecording().dispose();
    }
    for (final b in FbdBody.values) {
      final rec = ui.PictureRecorder();
      paintFbd(Canvas(rec), FbdModel(body: b).copyWith(forces: [FbdModel(body: b).weight(), FbdModel(body: b).normal()]), KitElement.naturalSizeOf(KitKind.fbd), Colors.red);
      rec.endRecording().dispose();
    }
  });
}
