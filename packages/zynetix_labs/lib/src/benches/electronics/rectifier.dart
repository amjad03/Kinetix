import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../core/i18n.dart';
import '../../engines/circuit.dart';
import 'schematic.dart';

/// Half-wave, centre-tap full-wave and bridge rectifiers (setup 'type') with
/// an optional filter capacitor, simulated over several mains cycles and shown
/// on an oscilloscope.
class RectifierBench extends LabBench {
  const RectifierBench();

  static const hz = 50.0;

  @override
  String get kind => 'rectifier';

  @override
  LabParams get defaults => {'type': 'half', 'vrms': 9.0, 'rl': 1000.0, 'cap': 0.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('vrms', tr('Transformer'), [(6.0, '6 V'), (9.0, '9 V'), (12.0, '12 V')]),
        LabChoice('rl', tr('Load'), [(470.0, '470 Ω'), (1000.0, '1 kΩ'), (2200.0, '2.2 kΩ')]),
        LabChoice('cap', tr('Filter'), [(0.0, tr('None')), (100.0, '100 µF'), (470.0, '470 µF'), (1000.0, '1000 µF')]),
      ];

  /// The output and input over the last two cycles, in steady state.
  static ({List<Offset> out, List<Offset> input, double vdc, double vac, double peak}) run(LabParams p) {
    final key = '${pStr(p, 'type', 'half')}|${pNum(p, 'vrms', 9)}|${pNum(p, 'rl', 1000)}|${pNum(p, 'cap')}';
    return _cache[key] ??= _simulate(p);
  }

  static final _cache = LabCache<String, ({List<Offset> out, List<Offset> input, double vdc, double vac, double peak})>(24);

  static ({List<Offset> out, List<Offset> input, double vdc, double vac, double peak}) _simulate(LabParams p) {
    final type = pStr(p, 'type', 'half');
    final vm = pNum(p, 'vrms', 9) * math.sqrt2;
    final rl = pNum(p, 'rl', 1000), cap = pNum(p, 'cap') * 1e-6;
    final c = Circuit();
    switch (type) {
      case 'centre':
        c
          ..add(VSource.sine('S1', 'a', '0', vm, hz))
          ..add(VSource.sine('S2', '0', 'b', vm, hz))
          ..add(Diode.silicon('D1', 'a', 'p'))
          ..add(Diode.silicon('D2', 'b', 'p'));
      case 'bridge':
        c
          ..add(VSource.sine('S1', 'a', 'b', vm, hz))
          ..add(Diode.silicon('D1', 'a', 'p'))
          ..add(Diode.silicon('D2', 'b', 'p'))
          ..add(Diode.silicon('D3', '0', 'a'))
          ..add(Diode.silicon('D4', '0', 'b'))
          // Keep the floating secondary tied to the circuit when no diode conducts.
          ..add(Resistor('Rb', 'b', '0', 1e6));
      default:
        c
          ..add(VSource.sine('S1', 'a', '0', vm, hz))
          ..add(Diode.silicon('D1', 'a', 'p'));
    }
    c.add(Resistor('RL', 'p', '0', rl));
    if (cap > 0) c.add(Capacitor('C', 'p', '0', cap));
    const dt = 5e-5, cycles = 6;
    final steps = c.transient(duration: cycles / hz, dt: dt);
    final keep = steps.where((s) => s.time > (cycles - 2) / hz + 1e-9).toList();
    final out = [for (final s in keep) Offset(s.time, s.v('p'))];
    final input = [for (final s in keep) Offset(s.time, type == 'bridge' ? s.vab('a', 'b') : s.v('a'))];
    final last = out.sublist(out.length ~/ 2);
    final vdc = last.map((o) => o.dy).reduce((a, b) => a + b) / last.length;
    final vac = math.sqrt(last.map((o) => (o.dy - vdc) * (o.dy - vdc)).reduce((a, b) => a + b) / last.length);
    return (out: out, input: input, vdc: vdc, vac: vac, peak: last.map((o) => o.dy).reduce(math.max));
  }

  @override
  List<LabColumn> get columns => [LabColumn(tr('Filter (µF)'), 0), LabColumn('RL (Ω)', 0), LabColumn('Vdc (V)', 2), LabColumn(tr('Ripple Vac (V)'), 3), LabColumn(tr('Ripple factor γ'), 3)];

  @override
  LabReading read(LabParams p) {
    final r = run(p);
    return LabReading.row([pNum(p, 'cap'), pNum(p, 'rl', 1000), _r(r.vdc, 100), _r(r.vac, 1000), _r(r.vac / r.vdc, 1000)]);
  }

  static double _r(double v, int k) => (v * k).round() / k;

  @override
  List<String> live(LabParams p) {
    final r = run(p);
    return ['Vdc = ${r.vdc.toStringAsFixed(2)} V', 'Vac = ${r.vac.toStringAsFixed(3)} V', 'γ = ${(r.vac / r.vdc).toStringAsFixed(3)}'];
  }

  /// Ripple factor theory: unfiltered half-wave 1.21, full-wave 0.48; with a
  /// capacitor about 1/(2√3·f·RL·C) (half) or 1/(4√3·f·RL·C) (full).
  static double theory(String type, double rl, double capUf) {
    final full = type != 'half';
    if (capUf <= 0) return full ? 0.482 : 1.211;
    final cap = capUf * 1e-6;
    return 1 / ((full ? 4 : 2) * math.sqrt(3) * hz * rl * cap);
  }

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final none = rows.where((r) => (r[0] as num) == 0).toList();
    final filtered = rows.where((r) => (r[0] as num) > 0).toList()..sort((a, b) => (a[0] as num).compareTo(b[0] as num));
    final parts = <String>[];
    if (none.isNotEmpty) {
      parts.add(tr('Without a filter the ripple factor is {g} (theory: 1.21 for half-wave, 0.48 for full-wave).', {'g': (none.last[4] as num).toStringAsFixed(2)}));
    }
    if (filtered.isNotEmpty) {
      parts.add(tr('With {c} µF the ripple factor falls to {g}: a bigger capacitor or a bigger load resistance gives a smoother output.',
          {'c': (filtered.last[0] as num).toStringAsFixed(0), 'g': (filtered.last[4] as num).toStringAsFixed(3)}));
    }
    return parts.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final type = pStr(p, 'type', 'half');
    final cap = pNum(p, 'cap');
    final sch = Schematic(canvas, Rect.fromLTWH(w * 0.01, h * 0.04, w * 0.5, h * 0.92), cols: 11, rows: 8);
    // Transformer: primary and secondary windings with the core between.
    sch.inductor(0.8, 2, 0.8, 6);
    sch.inductor(2, 2, 2, 6);
    canvas.drawLine(sch.p(1.33, 2), sch.p(1.33, 6), stroke(LabInk.ink, 2));
    canvas.drawLine(sch.p(1.47, 2), sch.p(1.47, 6), stroke(LabInk.ink, 2));
    sch.text('230 V', 0.6, 7, size: 0.28, color: LabInk.muted);
    sch.text('${pNum(p, 'vrms', 9).toStringAsFixed(0)} V', 2.3, 7, size: 0.28, color: LabInk.muted);
    final rlLabel = eng(pNum(p, 'rl', 1000), 'Ω');
    switch (type) {
      case 'centre':
        sch.wire([(2, 2), (3.5, 2)]);
        sch.diode(3.5, 2, 5.5, 2, name: 'D1');
        sch.wire([(5.5, 2), (8, 2)]);
        sch.wire([(2, 6), (3.5, 6)]);
        sch.diode(3.5, 6, 5.5, 6, name: 'D2');
        sch.wire([(5.5, 6), (10, 6), (10, 2), (8, 2)]);
        sch.wire([(2, 4), (8, 4)]);
        sch.dot(2, 4);
        sch.resistor(8, 2, 8, 4, rlLabel);
        if (cap > 0) {
          sch.wire([(8, 2), (9, 2)]);
          sch.capacitor(9, 2, 9, 4);
          sch.wire([(8, 4), (9, 4)]);
        }
        sch.dot(8, 2);
      case 'bridge':
        sch.wire([(2, 2), (2, 1), (5.5, 1), (5.5, 2.2)]);
        sch.wire([(2, 6), (2, 7), (5.5, 7), (5.5, 5.8)]);
        sch.diode(5.5, 2.2, 7.3, 4);
        sch.diode(5.5, 5.8, 7.3, 4);
        sch.diode(3.7, 4, 5.5, 2.2);
        sch.diode(3.7, 4, 5.5, 5.8);
        sch.wire([(7.3, 4), (8, 4), (8, 2.5), (9, 2.5)]);
        sch.wire([(3.7, 4), (3.2, 4), (3.2, 7.6), (9, 7.6), (9, 5.5)]);
        sch.resistor(9, 2.5, 9, 5.5, rlLabel);
        if (cap > 0) {
          sch.wire([(9, 2.5), (10.2, 2.5)]);
          sch.capacitor(10.2, 2.5, 10.2, 5.5);
          sch.wire([(9, 5.5), (10.2, 5.5)]);
        }
      default:
        sch.wire([(2, 2), (3.5, 2)]);
        sch.diode(3.5, 2, 5.5, 2, name: 'D');
        sch.wire([(5.5, 2), (8, 2)]);
        sch.resistor(8, 2, 8, 6, rlLabel);
        sch.wire([(2, 6), (8, 6)]);
        if (cap > 0) {
          sch.wire([(8, 2), (9.5, 2)]);
          sch.capacitor(9.5, 2, 9.5, 6);
          sch.wire([(8, 6), (9.5, 6)]);
        }
    }
    if (cap > 0) sch.text('${cap.toStringAsFixed(0)} µF', type == 'bridge' ? 10.2 : (type == 'centre' ? 9.6 : 10.3), type == 'centre' ? 4.6 : 3.4, size: 0.26);
    final r = run(p);
    final vm = pNum(p, 'vrms', 9) * math.sqrt2;
    final vdiv = vm <= 9 ? 2.0 : (vm <= 13 ? 4.0 : 5.0);
    paintScope(canvas, Rect.fromLTWH(w * 0.55, h * 0.14, w * 0.42, h * 0.62), [
      ScopeTrace(r.input, const Color(0xFFFFD54F), tr('Input')),
      ScopeTrace(r.out, const Color(0xFF64B5F6), tr('Output')),
    ], timePerDiv: 0.004, voltsPerDiv: vdiv);
    label(canvas, 'Vdc = ${r.vdc.toStringAsFixed(2)} V   γ = ${(r.vac / r.vdc).toStringAsFixed(3)}', Offset(w * 0.76, h * 0.85), size: 15, bold: true);
  }
}

