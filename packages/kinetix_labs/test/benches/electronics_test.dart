import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_labs/kinetix_labs.dart';
import 'package:kinetix_labs/src/benches/electronics/bridges.dart';
import 'package:kinetix_labs/src/benches/electronics/diode.dart';
import 'package:kinetix_labs/src/benches/electronics/networks.dart';
import 'package:kinetix_labs/src/benches/electronics/rectifier.dart';
import 'package:kinetix_labs/src/benches/electronics/transistor.dart';

List<Object> row(LabBench b, LabParams p) {
  final r = b.read(p);
  expect(r.row, isNotNull, reason: 'no reading: ${r.why}');
  return r.row!;
}

/// The electronics benches give the readings the real experiment would.
void main() {
  test('silicon diode: knee near 0.7 V, microamperes in reverse', () {
    const b = DiodeBench();
    final base = {...b.defaults, 'device': 'si'};
    expect(b.read(base).why, isNotNull);
    final rows = [for (final e in [0.4, 0.8, 1.5, 3.0, 5.0, 8.0]) row(b, {...base, 'e': e})];
    rows.add(row(b, {...base, 'bias': 'rev', 'e': 5.0}));
    expect((rows.last[1] as num).abs(), lessThan(0.01)); // under 10 µA
    expect(DiodeBench.knee(rows), inInclusiveRange(0.55, 0.8));
    expect(b.result(rows), contains('Knee'));
  });

  test('Zener: reverse breakdown found near its rating', () {
    const b = DiodeBench();
    for (final vz in [3.3, 5.1, 6.2]) {
      final base = {...b.defaults, 'device': 'zener', 'bias': 'rev', 'vz': vz};
      final rows = [for (final e in [2.0, 4.0, 6.0, 8.0, 10.0]) row(b, {...base, 'e': e})];
      expect(DiodeBench.knee(rows, reverse: true), closeTo(vz, 0.15), reason: '$vz');
    }
  });

  test('LEDs: blue needs more voltage than red; Planck gives h near 6.6 × 10⁻³⁴', () {
    const b = DiodeBench();
    double v(String c) => DiodeBench.measure({...b.defaults, 'device': 'led', 'colour': c, 'e': 5.0}).$1;
    expect(v('blue'), greaterThan(v('green')));
    expect(v('green'), greaterThan(v('red')));
    const pb = PlanckBench();
    final rows = <List<Object>>[];
    for (final c in ledColours.keys) {
      // Raise the voltage until the LED just glows.
      for (var e = 0.0; e <= 3.5; e += 0.01) {
        final p = {'colour': c, 'e': e};
        if (pb.read(p).row != null) {
          rows.add(pb.read(p).row!);
          break;
        }
      }
    }
    expect(rows.length, 4);
    final res = pb.result(rows)!;
    final h = double.parse(RegExp(r'h = e × slope ÷ c = ([0-9.]+)').firstMatch(res)!.group(1)!);
    expect(h, closeTo(6.63, 0.4));
  });

  test('rectifiers: Vdc near Vm/π (half) and 2Vm/π (full); filters cut the ripple', () {
    const b = RectifierBench();
    final vm = 9 * math.sqrt2;
    final half = RectifierBench.run({...b.defaults, 'type': 'half'});
    expect(half.vdc, closeTo((vm - 0.7) / math.pi, 0.4));
    expect(half.vac / half.vdc, closeTo(1.21, 0.12));
    final centre = RectifierBench.run({...b.defaults, 'type': 'centre'});
    expect(centre.vdc, closeTo(2 * (vm - 0.7) / math.pi, 0.5));
    expect(centre.vac / centre.vdc, closeTo(0.48, 0.06));
    final bridge = RectifierBench.run({...b.defaults, 'type': 'bridge'});
    expect(bridge.vdc, closeTo(2 * (vm - 1.4) / math.pi, 0.5));
    final filtered = RectifierBench.run({...b.defaults, 'type': 'bridge', 'cap': 470.0});
    expect(filtered.vac / filtered.vdc, lessThan(0.05));
    expect(filtered.vac / filtered.vdc, closeTo(RectifierBench.theory('bridge', 1000, 470), 0.012));
    expect(filtered.vdc, greaterThan(bridge.vdc));
  });

  test('transistor: β about 150 in the active region; base current starts after 0.6 V', () {
    const b = TransistorBench();
    final out = [
      for (final ib in [20.0, 40.0])
        for (final vcc in [2.0, 4.0, 8.0]) row(b, {...b.defaults, 'mode': 'output', 'ib': ib, 'vcc': vcc}),
    ];
    final res = b.result(out)!;
    final beta = double.parse(RegExp(r'≈ ([0-9]+)').firstMatch(res)!.group(1)!);
    expect(beta, inInclusiveRange(150, 175));
    final input = [for (final vbb in [0.5, 1.0, 1.5, 2.5]) row(b, {...b.defaults, 'mode': 'input', 'vbb': vbb})];
    expect((input.first[0] as num) < 1, isTrue); // almost no base current below the knee
    expect((input.last[1] as num), inInclusiveRange(0.6, 0.8));
  });

  test('logic gates: a complete truth table names the gate', () {
    const b = LogicBench();
    for (final g in LogicBench.gates) {
      final rows = [
        for (final a in [false, true])
          for (final c in g == 'not' ? [false] : [false, true]) row(b, {'gate': g, 'a': a, 'b': c}),
      ];
      expect(b.result(rows), contains(LogicBench.expression(g)), reason: g);
    }
    expect(LogicBench.output({'gate': 'nand', 'a': true, 'b': true}), isFalse);
    expect(LogicBench.output({'gate': 'xor', 'a': true, 'b': false}), isTrue);
  });

  test('RC: τ from the readings matches RC', () {
    const b = RcBench();
    for (final process in ['charge', 'discharge']) {
      final p = {...b.defaults, 'r': 47e3, 'c': 220.0, 'process': process};
      final rows = [for (final t in [0.0, 5.0, 10.0, 15.0, 20.0, 30.0]) row(b, {...p, 't': t})];
      final res = b.result(rows)!;
      final tau = double.parse(RegExp(r'τ = ([0-9.]+)').firstMatch(res)!.group(1)!);
      expect(tau, closeTo(47e3 * 220e-6, 0.25), reason: process);
    }
    expect(RcBench.vc({...b.defaults, 't': RcBench.tau(b.defaults)}), closeTo(9 * (1 - math.exp(-1)), 0.1));
  });

  test('LCR: the current peaks at 1/(2π√LC) with I = V/R', () {
    const b = RlcBench();
    final f0 = RlcBench.f0(b.defaults);
    expect(f0, closeTo(503.3, 0.5));
    expect(RlcBench.current(b.defaults, f0), closeTo(2 / 47, 1e-6));
    final rows = [for (var f = 300.0; f <= 800; f += 20) row(b, {...b.defaults, 'f': f})];
    final res = b.result(rows)!;
    expect(res, contains('500'));
    // Q = (1/R)√(L/C) = 6.7 for 47 Ω, 100 mH, 1 µF.
    final q = double.parse(RegExp(r'Q = f₀ ÷ bandwidth ≈ ([0-9]+(?:\.[0-9]+)?)').firstMatch(res)!.group(1)!);
    expect(q, closeTo(math.sqrt(0.1 / 1e-6) / 47, 0.6));
  });

  test('op-amp: gains −Rf/Rin and 1 + Rf/R1, saturating at ±13.5 V', () {
    const b = OpAmpBench();
    final inv = {...b.defaults, 'config': 'inverting', 'rf': 10e3, 'rin': 1e3};
    final rows = [for (final v in [-1.0, -0.5, 0.5, 1.0]) row(b, {...inv, 'vin': v})];
    expect(b.result(rows), contains('-10.00'));
    expect(OpAmpBench.vout({...inv, 'vin': 2.0}), closeTo(-13.5, 1e-6));
    final ni = {...b.defaults, 'config': 'non-inverting', 'rf': 22e3, 'rin': 10e3, 'vin': 1.0};
    expect(OpAmpBench.vout(ni), closeTo(3.2, 1e-6));
  });

  test('555 astable: measured frequency matches 1.44/((RA + 2RB)C); duty above 50 %', () {
    const b = AstableBench();
    for (final p in [b.defaults, {...b.defaults, 'ra': 10e3, 'rb': 10e3, 'c': 1.0}]) {
      final r = row(b, p);
      expect((r[3] as num).toDouble(), closeTo((r[4] as num).toDouble(), (r[4] as num) * 0.05));
      final ra = pNum(p, 'ra'), rb = pNum(p, 'rb');
      expect((r[5] as num).toDouble(), closeTo(100 * (ra + rb) / (ra + 2 * rb), 3));
    }
  });

  test("Kirchhoff: currents meet at the junction and loop voltages sum to zero", () {
    const b = KirchhoffBench();
    for (final p in [b.defaults, {...b.defaults, 'e1': 12.0, 'e2': 1.0, 'r3': 680.0}]) {
      final r = row(b, p);
      expect((r[3] as num).abs(), lessThanOrEqualTo(0.02));
      expect((r[4] as num).abs(), lessThanOrEqualTo(0.02));
    }
  });

  test('metre bridge: null point at 100R/(R + X); X and ρ come out right', () {
    const b = MeterBridgeBench();
    final rows = <List<Object>>[];
    for (final r in [1.0, 2.0, 3.0]) {
      final p = {...b.defaults, 'r': r, 'on': true};
      final l = (MeterBridgeBench.balance(p) * 10).round() / 10;
      expect(MeterBridgeBench.galvanometer({...p, 'l': MeterBridgeBench.balance(p)}).abs(), lessThan(1e-9));
      expect(b.read({...p, 'l': l + 3}).why, isNotNull);
      rows.add(row(b, {...p, 'l': l}));
    }
    for (final r in rows) {
      expect((r[4] as num).toDouble(), closeTo(wireOhms('constantan'), 0.03));
    }
    expect(b.result(rows), contains('4.9'));
  });

  test('potentiometer: E1/E2 = l1/l2 and r = R(l1 − l2)/l2', () {
    const b = PotentiometerBench();
    final base = {...b.defaults, 'on': true};
    List<Object> balanced(LabParams p) => row(b, {...p, 'l': PotentiometerBench.nullPoint(p)});
    final pa = {...base, 'cell': 'leclanche'}, pb = {...base, 'cell': 'daniell'};
    expect(PotentiometerBench.galvanometer({...pa, 'l': PotentiometerBench.nullPoint(pa)}).abs(), lessThan(1e-9));
    final res = b.result([balanced(pa), balanced(pb)])!;
    expect(res, contains((1.50 / 1.08).toStringAsFixed(3)));
    // Too much rheostat: the wire cannot balance the cell.
    expect(b.read({...pa, 'rh': 10.0, 'l': 399.0}).why, isNotNull);
    final ip = {...base, 'task': 'internal'};
    final rows = [balanced({...ip, 'k2': false}), balanced({...ip, 'k2': true, 'rbox': 5.0}), balanced({...ip, 'k2': true, 'rbox': 10.0})];
    final r = double.parse(RegExp(r'= ([0-9.]+)').allMatches(b.result(rows)!).last.group(1)!);
    expect(r, closeTo(1.2, 0.05));
  });
}
