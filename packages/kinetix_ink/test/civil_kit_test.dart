import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

BeamResult beam(double l, List<BeamSupport> s, List<BeamLoad> loads, {double ei = 0}) => BeamModel(length: l, ei: ei, supports: s, loads: loads).solve();

const pin = BeamSupportKind.pin, roller = BeamSupportKind.roller, fixed = BeamSupportKind.fixed;

/// The civil engineering panels' models, checked against textbook results.
void main() {
  group('beams', () {
    test('simply supported, UDL: R = wL/2, M max = wL²/8 at mid-span, δ = 5wL⁴/384EI', () {
      const w = 10.0, l = 6.0, ei = 20000.0;
      final r = beam(l, BeamModel.supportsFor(BeamType.simplySupported, l), [const BeamLoad(BeamLoadKind.udl, x: 0, x2: l, w: w)], ei: ei);
      expect(r.stable, isTrue);
      expect(r.reactions.map((e) => e.force), [closeTo(w * l / 2, 1e-6), closeTo(w * l / 2, 1e-6)]);
      expect(r.maxMoment.v, closeTo(w * l * l / 8, 1e-6));
      expect(r.maxMoment.x, closeTo(l / 2, 1e-6));
      expect(r.shearAt(0), closeTo(30, 1e-9));
      expect(r.shearAt(l - 1e-6), closeTo(-30, 1e-4));
      expect(r.zeroShear.single, closeTo(3, 1e-6));
      expect(r.contraflexure, isEmpty);
      expect(r.maxDeflection.v, closeTo(-5 * w * l * l * l * l / (384 * ei) * 1000, 1e-6));
      expect(r.maxDeflection.x, closeTo(3, 1e-6));
    });

    test('simply supported, central point load: M = PL/4, δ = PL³/48EI', () {
      final r = beam(4, BeamModel.supportsFor(BeamType.simplySupported, 4), [const BeamLoad(BeamLoadKind.point, x: 2, w: 20)], ei: 1000);
      expect(r.reactions.map((e) => e.force), [closeTo(10, 1e-9), closeTo(10, 1e-9)]);
      expect(r.maxMoment.v, closeTo(20, 1e-9));
      expect(r.maxDeflection.v, closeTo(-20 * 64 / (48 * 1000) * 1000, 1e-6));
    });

    test('cantilever, end load: R = P, M at the support = −PL, δ = PL³/3EI', () {
      const p = 10.0, l = 3.0, ei = 5000.0;
      final r = beam(l, BeamModel.supportsFor(BeamType.cantilever, l), [const BeamLoad(BeamLoadKind.point, x: l, w: p)], ei: ei);
      final re = r.reactions.single;
      expect(re.force, closeTo(p, 1e-9));
      expect(re.moment, closeTo(p * l, 1e-6), reason: 'the wall turns it back anticlockwise');
      expect(r.momentAt(0), closeTo(-p * l, 1e-6));
      expect(r.maxMoment.v, closeTo(-p * l, 1e-6));
      expect(r.maxHogging.v, closeTo(-30, 1e-6));
      expect(r.maxSagging.v, 0);
      expect(r.maxDeflection.v, closeTo(-p * l * l * l / (3 * ei) * 1000, 1e-6));
      expect(r.maxDeflection.x, l);
    });

    test('overhanging beam: reactions by moments, a point of contraflexure', () {
      // 8 m beam on supports at 0 and 6 m, 10 kN/m over the span AB, 20 kN at the free end.
      final r = beam(8, BeamModel.supportsFor(BeamType.overhanging, 8, overhang: 2), [
        const BeamLoad(BeamLoadKind.udl, x: 0, x2: 6, w: 10),
        const BeamLoad(BeamLoadKind.point, x: 8, w: 20),
      ]);
      final rb = 340 / 6;
      expect(r.reactions[1].force, closeTo(rb, 1e-6));
      expect(r.reactions[0].force, closeTo(80 - rb, 1e-6));
      expect(r.momentAt(6), closeTo(-40, 1e-6), reason: 'hogging over B: 20 × 2');
      final ra = 80 - rb;
      expect(r.maxSagging.x, closeTo(ra / 10, 1e-6));
      expect(r.maxSagging.v, closeTo(ra * ra / 20, 1e-6));
      // M = ra·x − 5x² = 0 at x = ra/5.
      expect(r.contraflexure.single, closeTo(ra / 5, 1e-5));
    });

    test('propped cantilever and fixed beam (indeterminate) under a UDL', () {
      const w = 12.0, l = 5.0;
      const udl = BeamLoad(BeamLoadKind.udl, x: 0, x2: l, w: w);
      final p = beam(l, BeamModel.supportsFor(BeamType.propped, l), [udl]);
      expect(p.reactions[1].force, closeTo(3 * w * l / 8, 1e-6));
      expect(p.momentAt(0), closeTo(-w * l * l / 8, 1e-6));
      expect(p.maxSagging.v, closeTo(9 * w * l * l / 128, 1e-6));
      expect(p.contraflexure.single, closeTo(l / 4, 1e-5));
      final f = beam(l, BeamModel.supportsFor(BeamType.fixed, l), [udl], ei: 1);
      expect(f.momentAt(0), closeTo(-w * l * l / 12, 1e-6));
      expect(f.momentAt(l / 2), closeTo(w * l * l / 24, 1e-6));
      expect(f.contraflexure, hasLength(2));
      expect(f.maxDeflection.v, closeTo(-w * l * l * l * l / 384 * 1000, 1e-3));
    });

    test('UVL and an applied moment', () {
      // Triangular load 0 → w over a simply supported span: RA = wL/6, RB = wL/3, M max = wL²/(9√3).
      const w = 18.0, l = 6.0;
      final r = beam(l, BeamModel.supportsFor(BeamType.simplySupported, l), [const BeamLoad(BeamLoadKind.uvl, x: 0, x2: l, w: 0, w2: w)]);
      expect(r.reactions[0].force, closeTo(w * l / 6, 1e-6));
      expect(r.reactions[1].force, closeTo(w * l / 3, 1e-6));
      expect(r.maxMoment.v, closeTo(w * l * l / (9 * 1.7320508075688772), 1e-6));
      expect(r.maxMoment.x, closeTo(l / 1.7320508075688772, 1e-6));
      // A clockwise couple M0 at mid-span: reactions ∓M0/L, a jump of M0 in the BMD.
      final m = beam(4, BeamModel.supportsFor(BeamType.simplySupported, 4), [const BeamLoad(BeamLoadKind.moment, x: 2, w: 8)]);
      expect(m.reactions[0].force, closeTo(-2, 1e-9));
      expect(m.reactions[1].force, closeTo(2, 1e-9));
      expect(m.momentAt(2 - 1e-6), closeTo(-4, 1e-5));
      expect(m.momentAt(2), closeTo(4, 1e-6));
    });

    test('an unsupported beam is unstable; a beam survives saving; loads drag along it', () {
      expect(beam(4, const [BeamSupport(2, roller)], [const BeamLoad(BeamLoadKind.point, x: 1, w: 5)]).stable, isFalse);
      expect(beam(4, const [], const []).stable, isFalse);
      final b = BeamModel(title: 'B', length: 6, ei: 2e4, type: BeamType.simplySupported, supports: BeamModel.supportsFor(BeamType.simplySupported, 6), loads: const [BeamLoad(BeamLoadKind.uvl, x: 1, x2: 4, w: 2, w2: 6)]);
      final back = BeamModel.fromJson(jsonDecode(jsonEncode(b.toJson())) as Map<String, Object?>);
      expect(back.toJson(), b.toJson());
      final moved = b.loads.single.shifted(5, 6);
      expect((moved.start, moved.end), (3, 6), reason: 'kept on the beam');
      expect(const BeamLoad(BeamLoadKind.point, x: 1, w: 1).shifted(-3, 6).x, 0);
      expect(pin, isNot(fixed));
    });
  });

  group('trusses', () {
    test('a triangle: reactions and member forces by the method of joints', () {
      const t = TrussModel(
        nodes: [TrussNode(0, 0, support: TrussSupportKind.pin), TrussNode(4, 0, support: TrussSupportKind.rollerX), TrussNode(2, 2, fy: -10)],
        members: [(0, 1), (0, 2), (1, 2)],
      );
      final r = t.solve();
      expect(r.status, TrussStatus.determinate);
      expect(r.reactions[0]!.ry, closeTo(5, 1e-9));
      expect(r.reactions[1]!.ry, closeTo(5, 1e-9));
      expect(r.reactions[0]!.rx, closeTo(0, 1e-9));
      expect(r.forces[0], closeTo(5, 1e-9), reason: 'AB in tension');
      expect(r.forces[1], closeTo(-5 * 1.4142135623730951, 1e-9), reason: 'AC in compression');
      expect(r.forces[2], closeTo(-5 * 1.4142135623730951, 1e-9));
    });

    test('a two-panel truss (3-4-5 triangles) and a zero-force member', () {
      // A(0,0) pin, B(3,0), C(6,0) roller, D(3,4); 12 kN down at B.
      const t = TrussModel(
        nodes: [TrussNode(0, 0, support: TrussSupportKind.pin), TrussNode(3, 0, fy: -12), TrussNode(6, 0, support: TrussSupportKind.rollerX), TrussNode(3, 4)],
        members: [(0, 1), (1, 2), (0, 3), (3, 2), (1, 3)],
      );
      final r = t.solve();
      expect(r.status, TrussStatus.determinate);
      expect(r.forces, [closeTo(4.5, 1e-9), closeTo(4.5, 1e-9), closeTo(-7.5, 1e-9), closeTo(-7.5, 1e-9), closeTo(12, 1e-9)]);
      // Load at D instead: BD carries nothing.
      final d = t.copyWith(nodes: [t.nodes[0], const TrussNode(3, 0), t.nodes[2], const TrussNode(3, 4, fy: -12)]).solve();
      expect(d.forces[4], closeTo(0, 1e-9));
    });

    test('indeterminate and unstable trusses', () {
      const square = [TrussNode(0, 0, support: TrussSupportKind.pin), TrussNode(3, 0, support: TrussSupportKind.rollerX), TrussNode(3, 3), TrussNode(0, 3, fx: 10)];
      expect(const TrussModel(nodes: square, members: [(0, 1), (1, 2), (2, 3), (3, 0)]).solve().status, TrussStatus.unstable);
      final braced = const TrussModel(nodes: square, members: [(0, 1), (1, 2), (2, 3), (3, 0), (0, 2), (1, 3)]).solve();
      expect(braced.status, TrussStatus.indeterminate);
      // Horizontal equilibrium still holds: the pin takes the 10 kN back.
      expect(braced.reactions[0]!.rx, closeTo(-10, 1e-6));
      final t = TrussModel.fromJson(jsonDecode(jsonEncode(const TrussModel(title: 'T', nodes: square, members: [(0, 1), (1, 2)]).toJson())) as Map<String, Object?>);
      expect(t.members, [(0, 1), (1, 2)]);
      expect(t.nodes[3].fx, 10);
      expect(t.nodes[1].support, TrussSupportKind.rollerX);
    });
  });

  group('levelling', () {
    // BM 100.000; BS 1.585; IS 1.405, 1.150; CP: FS 1.820 BS 2.010; IS 1.565; FS 1.285.
    const rows = [
      LevelRow('BM', bs: 1.585, remark: 'BM 100.000'),
      LevelRow('1', ins: 1.405),
      LevelRow('2', ins: 1.150),
      LevelRow('CP1', fs: 1.820, bs: 2.010),
      LevelRow('3', ins: 1.565),
      LevelRow('4', fs: 1.285),
    ];

    test('rise and fall, with its arithmetic check', () {
      final r = const LevelBook(rows: rows).reduce();
      expect([for (final v in r.rl) double.parse(v!.toStringAsFixed(3))], [100.0, 100.18, 100.435, 99.765, 100.21, 100.49]);
      expect(r.sumBs, closeTo(3.595, 1e-9));
      expect(r.sumFs, closeTo(3.105, 1e-9));
      expect(r.sumRise, closeTo(1.160, 1e-9));
      expect(r.sumFall, closeTo(0.670, 1e-9));
      expect(r.riseFallCheck, isTrue);
      expect(r.checks, isTrue);
    });

    test('height of instrument gives the same levels, with its full check', () {
      final r = const LevelBook(method: LevelMethod.heightOfInstrument, rows: rows).reduce();
      expect(r.hi[0], closeTo(101.585, 1e-9));
      expect(r.hi[3], closeTo(101.775, 1e-9));
      expect(r.rl.last, closeTo(100.49, 1e-9));
      expect(r.hiProducts, closeTo(3 * 101.585 + 2 * 101.775, 1e-9));
      expect(r.rlSumExceptFirst, closeTo(501.08, 1e-9));
      expect(r.hiCheck, isTrue);
      final back = LevelBook.fromJson(jsonDecode(jsonEncode(const LevelBook(rows: rows).toJson())) as Map<String, Object?>);
      expect(back.rows[3].fs, 1.820);
      expect(back.rows[3].bs, 2.010);
      expect(back.rows[1].bs, isNull);
    });
  });

  group('traverse', () {
    test('closing error, precision and Bowditch correction', () {
      const t = Traverse(legs: [
        TraverseLeg('AB', length: 100, bearing: 0),
        TraverseLeg('BC', length: 100, bearing: 90),
        TraverseLeg('CD', length: 100, bearing: 180),
        TraverseLeg('DA', length: 100.4, bearing: 270.5),
      ]);
      final lat = 100.4 * math.cos(270.5 * math.pi / 180), dep = 100 - 100.4 * math.sin((360 - 270.5) * math.pi / 180);
      expect(t.sumLatitude, closeTo(lat, 1e-9));
      expect(t.sumDeparture, closeTo(dep, 1e-9));
      expect(t.closingError, closeTo(math.sqrt(lat * lat + dep * dep), 1e-9));
      expect(t.precision, closeTo(400.4 / t.closingError, 1e-6));
      final c = t.bowditch;
      expect(c[0].dLat, closeTo(-lat * 100 / 400.4, 1e-9));
      expect(c[3].dDep, closeTo(-dep * 100.4 / 400.4, 1e-9));
      final sumLat = [for (final (i, l) in t.legs.indexed) l.latitude + c[i].dLat].fold(0.0, (a, b) => a + b);
      expect(sumLat, closeTo(0, 1e-9));
      final end = t.corrected.last;
      expect(end.$1, closeTo(0, 1e-9));
      expect(end.$2, closeTo(0, 1e-9));
      expect(quadrantalBearing(210.5), 'S 30°30′ W');
      expect(quadrantalBearing(315.25), 'N 44°45′ W');
      expect(const TraverseLeg('', length: 1, bearing: 30).backBearing, 210);
    });
  });

  group('contours', () {
    test('a plane slope gives straight contours at the interpolated places', () {
      // Levels rise 1 m a column: 100, 101, 102 … across.
      final g = ContourGrid.fromText('100 101 102 103\n100 101 102 103\n100 101 102 103', interval: 0.5);
      expect((g.cols, g.rows), (4, 3));
      expect(g.contourValues.first, 100);
      expect(g.contourValues.last, 103);
      final segs = g.segments(101.5);
      expect(segs, hasLength(2));
      for (final (a, b) in segs) {
        expect(a.$1, closeTo(1.5, 1e-9));
        expect(b.$1, closeTo(1.5, 1e-9));
      }
      expect(ContourGrid.fromJson(g.toJson()).toText(), g.toText());
    });
  });

  test('every civil panel paints, saves and reads back', () async {
    final panels = {
      KitKind.beam: BeamModel(supports: BeamModel.supportsFor(BeamType.overhanging, 6), loads: const [BeamLoad(BeamLoadKind.udl, x: 0, x2: 6, w: 5), BeamLoad(BeamLoadKind.moment, x: 2, w: 4)]).toJson(),
      KitKind.truss: const TrussModel(nodes: [TrussNode(0, 0, support: TrussSupportKind.pin), TrussNode(4, 0, support: TrussSupportKind.rollerX), TrussNode(2, 2, fy: -10)], members: [(0, 1), (0, 2), (1, 2)]).toJson(),
      KitKind.levelBook: const LevelBook(rows: [LevelRow('BM', bs: 1.2), LevelRow('A', fs: 0.8)]).toJson(),
      KitKind.traverse: const Traverse(legs: [TraverseLeg('AB', length: 50, bearing: 45), TraverseLeg('BA', length: 50, bearing: 225)]).toJson(),
      KitKind.contour: ContourGrid.fromText('1 2\n3 4').toJson(),
    };
    for (final MapEntry(key: kind, value: data) in panels.entries) {
      final k = KitElement.sized(kind: kind, data: data, color: const Color(0xFF8A4B00));
      final back = decodeElement(jsonDecode(jsonEncode(encodeElement(k))) as Map<String, dynamic>, k.id)! as KitElement;
      expect(back.kind, kind);
      expect(back.data, k.data);
      final rec = ui.PictureRecorder();
      paintKit(Canvas(rec), back);
      rec.endRecording().dispose();
    }
  });
}
