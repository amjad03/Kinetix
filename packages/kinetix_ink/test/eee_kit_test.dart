import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

/// The electrical engineering panels' models, checked against the textbook formulas.
void main() {
  group('RLC', () {
    test('series: Z, φ, I, power factor and P, Q, S by the formulas', () {
      const c = RlcCircuit(r: 20, l: 0.15, c: 100e-6, f: 50, v: 230);
      final w = 2 * math.pi * 50;
      final xl = w * 0.15, xc = 1 / (w * 100e-6);
      final z = math.sqrt(20 * 20 + math.pow(xl - xc, 2));
      final r = c.solve();
      expect(r.xl, closeTo(47.1239, 1e-4));
      expect(r.xc, closeTo(31.8310, 1e-4));
      expect(r.z, closeTo(z, 1e-9));
      expect(r.phi, closeTo(math.atan((xl - xc) / 20) * 180 / math.pi, 1e-9));
      expect(r.lagging, isTrue);
      expect(r.i, closeTo(230 / z, 1e-9));
      expect(r.pf, closeTo(20 / z, 1e-12));
      expect(r.p, closeTo(r.i * r.i * 20, 1e-6));
      expect(r.q, closeTo(r.i * r.i * (xl - xc), 1e-6));
      expect(r.s, closeTo(230 * r.i, 1e-9));
      expect(r.s * r.s, closeTo(r.p * r.p + r.q * r.q, 1e-3));
      // The voltage phasors add up to the supply: V_R + j(V_L − V_C) = V.
      final vr = r.i * 20, vl = r.i * xl, vc = r.i * xc;
      expect(math.sqrt(vr * vr + math.pow(vl - vc, 2)), closeTo(230, 1e-9));
    });

    test('resonance: f₀ = 1/(2π√LC), Q = (1/R)√(L/C) series, R√(C/L) parallel; at f₀ the circuit is resistive', () {
      const s = RlcCircuit(r: 5, l: 0.1, c: 101.32e-6);
      final f0 = 1 / (2 * math.pi * math.sqrt(0.1 * 101.32e-6));
      expect(s.resonance, closeTo(f0, 1e-9));
      expect(s.resonance, closeTo(50, 0.01));
      expect(s.qFactor, closeTo(math.sqrt(0.1 / 101.32e-6) / 5, 1e-9));
      expect(s.bandwidth, closeTo(f0 / s.qFactor!, 1e-9));
      final at = s.copyWith(f: f0).solve();
      expect(at.pf, closeTo(1, 1e-9));
      expect(at.z, closeTo(5, 1e-6));
      expect(at.i, closeTo(230 / 5, 1e-6));
      // The series current peaks at f₀; the parallel impedance peaks there too.
      expect(s.responseAt(f0), greaterThan(s.responseAt(f0 * 0.9)));
      expect(s.responseAt(f0), greaterThan(s.responseAt(f0 * 1.1)));
      const p = RlcCircuit(topology: RlcTopology.parallel, r: 100, l: 0.2, c: 50e-6);
      expect(p.qFactor, closeTo(100 * math.sqrt(50e-6 / 0.2), 1e-9));
      final pf0 = p.resonance!;
      expect(p.responseAt(pf0), closeTo(100, 1e-6));
      expect(p.responseAt(pf0), greaterThan(p.responseAt(pf0 * 0.8)));
    });

    test('parallel: branch currents and the supply current by the admittance', () {
      const c = RlcCircuit(topology: RlcTopology.parallel, r: 100, l: 0.2, c: 50e-6, v: 230, f: 50);
      final w = 2 * math.pi * 50;
      final ir = 230 / 100, il = 230 / (w * 0.2), ic = 230 * w * 50e-6;
      final r = c.solve();
      final i = math.sqrt(ir * ir + math.pow(ic - il, 2));
      expect(r.i, closeTo(i, 1e-9));
      expect(r.pf, closeTo(ir / i, 1e-9));
      expect(r.leading, ic > il);
      expect(r.p, closeTo(230 * 230 / 100, 1e-6));
      final byLabel = {for (final p in r.phasors) p.label: p};
      expect(byLabel['I_R']!.mag, closeTo(ir, 1e-9));
      expect(byLabel['I_L']!.angle, -90);
      expect(byLabel['I_C']!.angle, 90);
    });

    test('RC and RL circuits leave the missing element out', () {
      final rc = const RlcCircuit(r: 50, l: 0, c: 50e-6).solve();
      expect(rc.leading, isTrue);
      expect(rc.xl, 0);
      expect(const RlcCircuit(r: 50, l: 0, c: 50e-6).resonance, isNull);
      final rl = const RlcCircuit(r: 30, l: 0.127, c: 0).solve();
      expect(rl.lagging, isTrue);
      expect(rl.z, closeTo(math.sqrt(900 + math.pow(2 * math.pi * 50 * 0.127, 2)), 1e-9));
    });

    test('phasors turn together with ωt', () {
      final a = const RlcCircuit(r: 20, l: 0.15, c: 100e-6).solve().phasors;
      final b = const RlcCircuit(r: 20, l: 0.15, c: 100e-6, wt: 30).solve().phasors;
      for (var k = 0; k < a.length; k++) {
        expect(b[k].angle - a[k].angle, closeTo(30, 1e-9));
        expect(b[k].mag, closeTo(a[k].mag, 1e-12));
      }
    });
  });

  group('three-phase', () {
    test('star: V_L = √3 V_ph, I_L = I_ph; delta: V_L = V_ph, I_L = √3 I_ph; P = √3 V_L I_L cos φ', () {
      const star = ThreePhase(vLine: 415, zPhase: 10, phi: 36.87);
      expect(star.vPhase, closeTo(415 / math.sqrt(3), 1e-9));
      expect(star.iLine, closeTo(star.iPhase, 1e-12));
      expect(star.iPhase, closeTo(23.96, 0.01));
      expect(star.power, closeTo(3 * star.vPhase * star.iPhase * star.pf, 1e-6));
      expect(star.power, closeTo(13778, 2));
      final delta = star.copyWith(connection: ThreePhaseConnection.delta);
      expect(delta.vPhase, 415);
      expect(delta.iLine, closeTo(math.sqrt(3) * delta.iPhase, 1e-9));
      // The same impedances take three times the power in delta.
      expect(delta.power, closeTo(3 * star.power, 1e-6));
      expect(delta.apparent * delta.apparent, closeTo(delta.power * delta.power + delta.reactive * delta.reactive, 1e-3));
    });

    test('phasors: 120° apart, line voltage 30° ahead (star), line current 30° behind (delta)', () {
      final s = {for (final p in const ThreePhase(phi: 30).phasors()) p.label: p};
      expect(s['V_Y']!.angle - s['V_R']!.angle, -120);
      expect(s['V_B']!.angle - s['V_R']!.angle, -240);
      expect(s['V_RY']!.angle - s['V_R']!.angle, 30);
      expect(s['V_RY']!.mag, closeTo(math.sqrt(3) * s['V_R']!.mag, 1e-9));
      expect(s['I_R']!.angle, -30);
      final d = {for (final p in const ThreePhase(connection: ThreePhaseConnection.delta, phi: 0).phasors()) p.label: p};
      expect(d['I_R']!.angle - d['I_RY']!.angle, -30);
      expect(d['I_R']!.mag, closeTo(math.sqrt(3) * d['I_RY']!.mag, 1e-9));
      // The three phase voltages add up to zero.
      var x = 0.0, y = 0.0;
      for (final n in ['V_R', 'V_Y', 'V_B']) {
        x += s[n]!.mag * math.cos(s[n]!.angle * math.pi / 180);
        y += s[n]!.mag * math.sin(s[n]!.angle * math.pi / 180);
      }
      expect(math.sqrt(x * x + y * y), lessThan(1e-9));
    });
  });

  group('per unit and fault level', () {
    test('base change: Z_new = Z_old (kV_old/kV_new)² (MVA_new/MVA_old); ohms to per unit', () {
      // 0.2 pu on 50 MVA, 11 kV → 100 MVA, 11 kV: 0.4 pu.
      expect(perUnitChange(0.2, mvaOld: 50, kvOld: 11, mvaNew: 100, kvNew: 11), closeTo(0.4, 1e-12));
      // 0.1 pu on 30 MVA, 13.8 kV → 100 MVA, 13.2 kV: 0.1 × (13.8/13.2)² × 100/30 = 0.3643.
      expect(perUnitChange(0.1, mvaOld: 30, kvOld: 13.8, mvaNew: 100, kvNew: 13.2), closeTo(0.36433, 1e-5));
      expect(ohmsToPerUnit(40, mvaBase: 100, kvBase: 132), closeTo(40 * 100 / (132 * 132), 1e-12));
      expect(baseCurrentKa(100, 132), closeTo(0.43739, 1e-5));
    });

    SingleLineDiagram radial({bool cbClosed = true}) => SingleLineDiagram(
      buses: const [SldBus('Bus 1', kv: 11, x: 0), SldBus('Bus 2', kv: 132, x: 0.5), SldBus('Bus 3', kv: 132, x: 1)],
      elements: [
        const SldElement(SldKind.generator, 'G1', a: 0, mva: 100, kv: 11, x: 0.15),
        SldElement(SldKind.breaker, 'CB1', a: 0, b: 1, closed: cbClosed),
        const SldElement(SldKind.transformer, 'T1', a: 0, b: 1, mva: 100, kv: 11, x: 0.1),
        const SldElement(SldKind.line, 'Line', a: 1, b: 2, ohms: 40),
        const SldElement(SldKind.load, 'Load', a: 2, side: 1),
      ],
      faultBus: 2,
    );

    test('radial example: X_th = 0.15 + 0.10 + 40·100/132² at bus 3; fault MVA = 100 / X_th', () {
      final d = radial();
      final x = 0.15 + 0.10 + 40 * 100 / (132 * 132);
      final f = d.fault()!;
      expect(f.xth, closeTo(x, 1e-9));
      expect(f.xth, closeTo(0.4796, 1e-4));
      expect(f.mva, closeTo(100 / x, 1e-6));
      expect(f.mva, closeTo(208.5, 0.1));
      expect(f.ka, closeTo(100 / x / (math.sqrt(3) * 132), 1e-9));
      // At the generator's own bus only its reactance counts.
      expect(d.fault(0)!.xth, closeTo(0.15, 1e-9));
      expect(d.fault(1)!.xth, closeTo(0.25, 1e-9));
      // An open breaker in the branch cuts the far buses off.
      expect(radial(cbClosed: false).fault(), isNull);
      expect(radial(cbClosed: false).fault(0)!.xth, closeTo(0.15, 1e-9));
    });

    test('two generators in parallel and base changes on the way', () {
      const d = SingleLineDiagram(
        buses: [SldBus('A', kv: 11, x: 0), SldBus('B', kv: 66, x: 1)],
        elements: [
          SldElement(SldKind.generator, 'G1', a: 0, mva: 50, kv: 11, x: 0.2),
          SldElement(SldKind.generator, 'G2', a: 0, mva: 25, kv: 11, x: 0.15),
          SldElement(SldKind.transformer, 'T1', a: 0, b: 1, mva: 75, kv: 11, x: 0.08),
        ],
        faultBus: 0,
      );
      final g1 = 0.2 * 100 / 50, g2 = 0.15 * 100 / 25, t = 0.08 * 100 / 75;
      expect(d.perUnit(d.elements[0]), closeTo(g1, 1e-12));
      expect(d.perUnit(d.elements[1]), closeTo(g2, 1e-12));
      final par = g1 * g2 / (g1 + g2);
      expect(d.fault()!.xth, closeTo(par, 1e-9));
      expect(d.fault()!.mva, closeTo(100 / par, 1e-6));
      expect(d.fault(1)!.xth, closeTo(par + t, 1e-9));
    });

    test('a bus coupler (a closed breaker alone in its branch) joins two buses', () {
      const d = SingleLineDiagram(
        buses: [SldBus('A', kv: 11, x: 0), SldBus('B', kv: 11, x: 1)],
        elements: [SldElement(SldKind.generator, 'G', a: 0, mva: 100, kv: 11, x: 0.2), SldElement(SldKind.breaker, 'BC', a: 0, b: 1)],
        faultBus: 1,
      );
      expect(d.fault()!.xth, closeTo(0.2, 1e-9));
    });

    test('snapping: nearest bus and the two buses either side', () {
      final d = radial();
      expect(d.nearestBus(0.1), 0);
      expect(d.nearestBus(0.6), 1);
      expect(d.busesAround(0.2), (0, 1));
      expect(d.busesAround(0.8), (1, 2));
    });
  });

  group('waveforms', () {
    test('RMS, average, peak, form and crest factors of each wave match the formulas (sampled)', () {
      for (final w in [
        const Wave(amplitude: 10),
        const Wave(kind: WaveKind.square, amplitude: 10),
        const Wave(kind: WaveKind.triangle, amplitude: 10),
        const Wave(kind: WaveKind.sawtooth, amplitude: 10),
        const Wave(kind: WaveKind.pwm, amplitude: 12, duty: 0.25),
        const Wave(kind: WaveKind.pwm, amplitude: 5, duty: 0.6, freq: 1000),
      ]) {
        final s = WaveformPanel(a: w).stats();
        final ideal = w.ideal;
        expect(s.rms, closeTo(ideal.rms, 1e-3), reason: '${w.kind} rms');
        expect(s.average, closeTo(ideal.average, 1e-3), reason: '${w.kind} avg');
        expect(s.mean, closeTo(ideal.mean, 1e-3), reason: '${w.kind} mean');
        expect(s.peak, closeTo(ideal.peak, 2e-2), reason: '${w.kind} peak');
        expect(s.formFactor!, closeTo(ideal.formFactor!, 1e-3), reason: '${w.kind} ff');
      }
      // The textbook numbers.
      expect(const Wave().ideal.formFactor, closeTo(1.1107, 1e-4));
      expect(const Wave().ideal.crestFactor, closeTo(math.sqrt2, 1e-12));
      expect(const Wave(kind: WaveKind.square).ideal.formFactor, 1);
      expect(const Wave(kind: WaveKind.triangle).ideal.formFactor, closeTo(1.1547, 1e-4));
      expect(const Wave(kind: WaveKind.triangle).ideal.crestFactor, closeTo(math.sqrt(3), 1e-12));
      expect(const Wave(kind: WaveKind.sawtooth).ideal.rms, closeTo(1 / math.sqrt(3), 1e-12));
      expect(const Wave(kind: WaveKind.pwm, duty: 0.25).ideal.formFactor, closeTo(2, 1e-12));
    });

    test('a DC offset adds to the mean and RMS² adds for superposed waves of different frequency', () {
      final off = const WaveformPanel(a: Wave(amplitude: 10, offset: 3)).stats();
      expect(off.mean, closeTo(3, 1e-6));
      expect(off.rms, closeTo(math.sqrt(9 + 50), 1e-3));
      final sum = const WaveformPanel(a: Wave(amplitude: 10), b: Wave(amplitude: 3, freq: 150), superpose: true).stats();
      expect(sum.rms, closeTo(math.sqrt(50 + 4.5), 1e-3));
    });

    test('Fourier coefficients match the integral b_n = (1/π)∫ x sin nθ dθ, and the partial sums converge', () {
      for (final w in [
        const Wave(kind: WaveKind.square, amplitude: 10),
        const Wave(kind: WaveKind.triangle, amplitude: 10),
        const Wave(kind: WaveKind.sawtooth, amplitude: 10),
        const Wave(kind: WaveKind.pwm, amplitude: 10, duty: 0.3),
        const Wave(amplitude: 10),
      ]) {
        final f = w.fourier(7);
        const n = 20000;
        for (var h = 1; h <= 7; h++) {
          var a = 0.0, b = 0.0;
          for (var i = 0; i < n; i++) {
            final th = 2 * math.pi * (i + 0.5) / n;
            final x = w.shape(th);
            a += x * math.cos(h * th);
            b += x * math.sin(h * th);
          }
          a *= 2 / n;
          b *= 2 / n;
          final term = f.terms.where((t) => t.h == h).firstOrNull;
          expect(term?.a ?? 0, closeTo(a, 2e-3), reason: '${w.kind} a$h');
          expect(term?.b ?? 0, closeTo(b, 2e-3), reason: '${w.kind} b$h');
        }
      }
      // Square: 4A/π, 4A/3π…; triangle 8A/π², −8A/9π².
      final sq = const Wave(kind: WaveKind.square, amplitude: 1).fourier(3).terms;
      expect(sq.map((t) => t.b), [closeTo(4 / math.pi, 1e-12), closeTo(4 / (3 * math.pi), 1e-12)]);
      final tri = const Wave(kind: WaveKind.triangle, amplitude: 1).fourier(3).terms;
      expect(tri.map((t) => t.b), [closeTo(8 / (math.pi * math.pi), 1e-12), closeTo(-8 / (9 * math.pi * math.pi), 1e-12)]);
      // More terms: the triangle's partial sum gets closer to the wave.
      double err(int terms) {
        final p = WaveformPanel(a: const Wave(kind: WaveKind.triangle, amplitude: 1), terms: terms);
        var e = 0.0;
        for (var i = 0; i < 200; i++) {
          final t = i / 200 / 50;
          e = math.max(e, (p.partialSum(t) - p.a.at(t)).abs());
        }
        return e;
      }

      expect(err(15), lessThan(err(3)));
      expect(err(15), lessThan(0.03));
    });
  });

  test('every electrical panel paints, saves and reads back', () {
    final panels = {
      KitKind.rlc: const RlcCircuit(r: 20, l: 0.15, c: 100e-6, wt: 40).toJson(),
      KitKind.threePhase: const ThreePhase(connection: ThreePhaseConnection.delta).toJson(),
      KitKind.singleLine: const SingleLineDiagram(
        buses: [SldBus('Bus 1', kv: 11, x: 0), SldBus('Bus 2', kv: 132, x: 1)],
        elements: [SldElement(SldKind.generator, 'G1', a: 0), SldElement(SldKind.isolator, 'I', a: 0, b: 1, closed: false), SldElement(SldKind.transformer, 'T1', a: 0, b: 1), SldElement(SldKind.motor, 'M', a: 1, side: 1)],
        faultBus: 1,
      ).toJson(),
      KitKind.waveform: const WaveformPanel(a: Wave(kind: WaveKind.pwm, duty: 0.3), superpose: true, harmonics: true, terms: 11).toJson(),
    };
    for (final MapEntry(key: kind, value: data) in panels.entries) {
      final k = KitElement.sized(kind: kind, data: data, color: const Color(0xFF6D3FB5));
      final back = decodeElement(jsonDecode(jsonEncode(encodeElement(k))) as Map<String, dynamic>, k.id)! as KitElement;
      expect(back.kind, kind);
      expect(back.data, k.data);
      final rec = ui.PictureRecorder();
      paintKit(Canvas(rec), back);
      rec.endRecording().dispose();
    }
    // Straight to the painters, so a mistake throws instead of drawing the panel's dash.
    void paint(void Function(Canvas c) f) {
      final rec = ui.PictureRecorder();
      f(Canvas(rec));
      rec.endRecording().dispose();
    }

    for (final t in RlcTopology.values) {
      for (final (l, c) in [(0.1, 100e-6), (0.0, 50e-6), (0.2, 0.0)]) {
        paint((cv) => paintRlc(cv, RlcCircuit(topology: t, l: l, c: c), KitElement.naturalSizeOf(KitKind.rlc), Colors.red));
      }
    }
    for (final c in ThreePhaseConnection.values) {
      paint((cv) => paintThreePhase(cv, ThreePhase(connection: c, phi: -20), KitElement.naturalSizeOf(KitKind.threePhase), Colors.red));
    }
    paint((cv) => paintSld(cv, SingleLineDiagram.fromJson(panels[KitKind.singleLine]!), KitElement.naturalSizeOf(KitKind.singleLine), Colors.red));
    paint((cv) => paintSld(cv, const SingleLineDiagram(), KitElement.naturalSizeOf(KitKind.singleLine), Colors.red));
    for (final k in WaveKind.values) {
      paint((cv) => paintWaveform(cv, WaveformPanel(a: Wave(kind: k), harmonics: true), KitElement.naturalSizeOf(KitKind.waveform), Colors.red));
      paint((cv) => paintWaveform(cv, WaveformPanel(a: Wave(kind: k, offset: 1), superpose: true), KitElement.naturalSizeOf(KitKind.waveform), Colors.red));
    }
  });
}
