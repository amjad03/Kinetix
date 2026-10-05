import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../core/i18n.dart';
import '../../engines/circuit.dart';
import 'schematic.dart';

/// Charging and discharging a capacitor through a resistor: the time constant τ = RC.
class RcBench extends LabBench {
  const RcBench();

  static const e = 9.0;

  @override
  String get kind => 'rc';

  @override
  bool get animated => false;

  @override
  LabParams get defaults => {'r': 47e3, 'c': 220.0, 'process': 'charge', 't': 0.0};

  @override
  LabParams get preview => {...defaults, 't': 10.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('r', 'R', [(10e3, '10 kΩ'), (47e3, '47 kΩ'), (100e3, '100 kΩ')]),
        LabChoice('c', 'C', [(100.0, '100 µF'), (220.0, '220 µF'), (470.0, '470 µF')]),
        LabChoice('process', tr('Process'), [('charge', tr('Charging')), ('discharge', tr('Discharging'))]),
        LabSlider('t', tr('Time'), 0, 120, divisions: 240, unit: ' s', decimals: 1),
      ];

  @override
  LabParams act(String action, LabParams p) => action.startsWith('set:') && action != 'set:t' ? {...p, 't': 0.0} : p;

  static double tau(LabParams p) => pNum(p, 'r', 47e3) * pNum(p, 'c', 220) * 1e-6;

  static final _cache = LabCache<String, List<Offset>>(12);

  /// The capacitor voltage over 120 s, from the circuit engine.
  static List<Offset> curve(LabParams p) {
    final key = '${pNum(p, 'r', 47e3)}|${pNum(p, 'c', 220)}|${pStr(p, 'process', 'charge')}';
    final hit = _cache[key];
    if (hit != null) return hit;
    final charge = pStr(p, 'process', 'charge') == 'charge';
    final c = Circuit()
      ..add(VSource('E', 'a', '0', charge ? e : 0))
      ..add(Resistor('R', 'a', 'c', pNum(p, 'r', 47e3)))
      ..add(Capacitor('C', 'c', '0', pNum(p, 'c', 220) * 1e-6, v0: charge ? 0 : e));
    final dt = math.min(0.05, tau(p) / 100);
    final out = <Offset>[const Offset(0, 0)];
    out[0] = Offset(0, charge ? 0 : e);
    for (final s in c.transient(duration: 120, dt: dt, keepEvery: math.max(1, (0.25 / dt).round()))) {
      out.add(Offset(s.time, s.v('c')));
    }
    return _cache[key] = out;
  }

  static double vc(LabParams p) {
    final pts = curve(p), t = pNum(p, 't');
    for (var k = 1; k < pts.length; k++) {
      if (pts[k].dx >= t) {
        final a = pts[k - 1], b = pts[k];
        return a.dy + (b.dy - a.dy) * (t - a.dx) / (b.dx - a.dx);
      }
    }
    return pts.last.dy;
  }

  @override
  List<LabColumn> get columns => [LabColumn('t (s)', 1), LabColumn('Vc (V)', 2), LabColumn('I (µA)', 1)];

  @override
  LabReading read(LabParams p) {
    final v = vc(p);
    final charge = pStr(p, 'process', 'charge') == 'charge';
    final i = (charge ? e - v : v) / pNum(p, 'r', 47e3);
    return LabReading.row([pNum(p, 't'), (v * 100).round() / 100, (i * 1e7).round() / 10]);
  }

  @override
  List<String> live(LabParams p) => ['t = ${pNum(p, 't').toStringAsFixed(1)} s', 'Vc = ${vc(p).toStringAsFixed(2)} V', 'RC = ${tau(p).toStringAsFixed(2)} s'];

  @override
  LabGraph graph(LabParams p) => const LabGraph(0, 1, curve: true);

  @override
  String? result(List<List<Object>> rows) {
    // ln of the part still to change falls in a straight line: slope −1/τ.
    final sorted = [...rows]..sort((a, b) => (a[0] as num).compareTo(b[0] as num));
    if (sorted.length < 3) return tr('Take at least three readings at different times.');
    final rising = (sorted.last[1] as num) > (sorted.first[1] as num);
    final xs = <double>[], ys = <double>[];
    for (final r in sorted) {
      final v = (r[1] as num).toDouble();
      final left = rising ? 1 - v / e : v / e;
      if (left > 0.02 && left <= 1) {
        xs.add((r[0] as num).toDouble());
        ys.add(math.log(left));
      }
    }
    if (xs.length < 3) return tr('Take at least three readings at different times.');
    final f = LinearFit.of(xs, ys);
    if (f == null || f.slope >= 0) return null;
    final t = -1 / f.slope, dt = f.slopeSe / (f.slope * f.slope);
    return tr('From the straight line of ln(remaining voltage) against t, τ = {t} s. After one τ the capacitor has {what} 63 % of the way.',
        {'t': pm(t, dt), 'what': rising ? tr('charged') : tr('discharged')});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final charge = pStr(p, 'process', 'charge') == 'charge';
    final v = vc(p);
    final sch = Schematic(canvas, Rect.fromLTWH(w * 0.02, h * 0.08, w * 0.5, h * 0.84), cols: 9, rows: 7);
    sch.cell(1, 2.5, 1, 4.5, '${e.toStringAsFixed(0)} V');
    sch.wire([(1, 2.5), (1, 1), (2, 1)]);
    sch.key(2, 1, 3.4, 1, closed: charge);
    sch.wire([(3.4, 1), (4, 1)]);
    sch.resistor(4, 1, 6.4, 1, eng(pNum(p, 'r', 47e3), 'Ω'));
    sch.wire([(6.4, 1), (7, 1), (7, 2.6)]);
    sch.capacitor(7, 2.6, 7, 4.4, '${pNum(p, 'c', 220).toStringAsFixed(0)} µF');
    sch.wire([(7, 4.4), (7, 6), (1, 6), (1, 4.5)]);
    // Discharge path through the same resistor.
    sch.wire([(4, 1), (4, 3.2)]);
    sch.key(4, 3.2, 4, 4.6, closed: !charge);
    sch.wire([(4, 4.6), (4, 6)]);
    sch.dot(4, 1);
    sch.dot(4, 6);
    sch.wire([(7, 2.6), (8.3, 2.6), (8.3, 3)]);
    sch.wire([(7, 4.4), (8.3, 4.4), (8.3, 4.2)]);
    sch.meterAt(8.3, 3.6, 'V', v, e, '${v.toStringAsFixed(2)} V');
    // The curve so far and the stopwatch.
    final r = Rect.fromLTWH(w * 0.56, h * 0.12, w * 0.4, h * 0.62);
    canvas.drawRect(r, fill(Colors.white));
    canvas.drawRect(r, stroke(LabInk.faint, 1));
    final pts = curve(p);
    final tau0 = tau(p);
    Offset map(Offset o) => Offset(r.left + r.width * o.dx / 120, r.bottom - r.height * o.dy / e);
    final path = Path();
    for (var k = 0; k < pts.length; k++) {
      final q = map(pts[k]);
      k == 0 ? path.moveTo(q.dx, q.dy) : path.lineTo(q.dx, q.dy);
    }
    canvas.drawPath(path, stroke(LabInk.blue.withValues(alpha: 0.35), 2));
    final now = map(Offset(pNum(p, 't'), v));
    canvas.drawCircle(now, 6, fill(LabInk.accent));
    canvas.drawCircle(now, 6, stroke(LabInk.ink, 1.5));
    if (tau0 < 120) {
      final x = r.left + r.width * tau0 / 120;
      dashed(canvas, Offset(x, r.top), Offset(x, r.bottom), stroke(LabInk.green, 1.5));
      label(canvas, 'τ = RC', Offset(x, r.top - 10), size: 13, color: LabInk.green);
    }
    label(canvas, 'Vc', Offset(r.left - 14, r.top + 8), size: 13, color: LabInk.muted);
    label(canvas, 't →', Offset(r.right - 12, r.bottom + 12), size: 13, color: LabInk.muted);
    label(canvas, '⏱ ${pNum(p, 't').toStringAsFixed(1)} s', Offset(r.center.dx, r.bottom + 34), size: 18, bold: true);
  }
}

/// Series LCR resonance: the current against the frequency of the supply.
class RlcBench extends LabBench {
  const RlcBench();

  static const vrms = 2.0;

  @override
  String get kind => 'rlc';

  @override
  LabParams get defaults => {'l': 0.1, 'c': 1.0, 'r': 47.0, 'f': 200.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('l', 'L', [(0.05, '50 mH'), (0.1, '100 mH'), (0.2, '200 mH')]),
        LabChoice('c', 'C', [(0.47, '0.47 µF'), (1.0, '1 µF'), (2.2, '2.2 µF')]),
        LabChoice('r', 'R', [(10.0, '10 Ω'), (47.0, '47 Ω'), (100.0, '100 Ω')]),
        LabSlider('f', tr('Frequency'), 50, 2000, divisions: 390, unit: ' Hz'),
      ];

  static double f0(LabParams p) => 1 / (2 * math.pi * math.sqrt(pNum(p, 'l', 0.1) * pNum(p, 'c', 1) * 1e-6));

  /// rms current (A) from the AC solution of the circuit.
  static double current(LabParams p, [double? hz]) {
    final c = Circuit()
      ..add(VSource('E', 'a', '0', 0, ac: vrms))
      ..add(Resistor('R', 'a', 'b', pNum(p, 'r', 47)))
      ..add(Inductor('L', 'b', 'c', pNum(p, 'l', 0.1)))
      ..add(Capacitor('C', 'c', '0', pNum(p, 'c', 1) * 1e-6));
    return c.ac(hz ?? pNum(p, 'f', 200)).i('E').abs;
  }

  @override
  List<LabColumn> get columns => [LabColumn('f (Hz)', 0), LabColumn('I (mA)', 2)];

  @override
  LabReading read(LabParams p) => LabReading.row([pNum(p, 'f', 200).roundToDouble(), (current(p) * 1e5).round() / 100]);

  @override
  List<String> live(LabParams p) => ['f = ${pNum(p, 'f', 200).toStringAsFixed(0)} Hz', 'I = ${(current(p) * 1e3).toStringAsFixed(2)} mA'];

  @override
  LabGraph graph(LabParams p) => const LabGraph(0, 1, curve: true);

  @override
  String? result(List<List<Object>> rows) {
    if (rows.length < 3) return null;
    final s = [...rows]..sort((a, b) => (a[0] as num).compareTo(b[0] as num));
    final top = s.reduce((a, b) => (a[1] as num) >= (b[1] as num) ? a : b);
    final iMax = (top[1] as num).toDouble(), fMax = (top[0] as num).toDouble();
    final parts = [tr('The current is largest, {i} mA, at about {f} Hz: the resonant frequency.', {'i': iMax.toStringAsFixed(2), 'f': fMax.toStringAsFixed(0)})];
    // Half-power points: where I falls to Imax/√2 on each side.
    double? cross(Iterable<List<Object>> side) {
      final list = side.toList();
      for (var k = 1; k < list.length; k++) {
        final a = list[k - 1], b = list[k];
        final ia = (a[1] as num).toDouble(), ib = (b[1] as num).toDouble(), lim = iMax / math.sqrt2;
        if ((ia - lim) * (ib - lim) <= 0 && ia != ib) return (a[0] as num) + ((b[0] as num) - (a[0] as num)) * (lim - ia) / (ib - ia);
      }
      return null;
    }

    final i = s.indexOf(top);
    final lo = cross(s.sublist(0, i + 1).reversed), hi = cross(s.sublist(i));
    if (lo != null && hi != null && hi > lo) {
      parts.add(tr('Half-power bandwidth {b} Hz, so the quality factor Q = f₀ ÷ bandwidth ≈ {q}.', {'b': (hi - lo).toStringAsFixed(0), 'q': (fMax / (hi - lo)).toStringAsFixed(1)}));
    }
    return parts.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final i = current(p);
    final sch = Schematic(canvas, Rect.fromLTWH(w * 0.02, h * 0.08, w * 0.5, h * 0.84), cols: 9, rows: 7);
    sch.acSource(1, 3.5, '${vrms.toStringAsFixed(0)} V, ${pNum(p, 'f', 200).toStringAsFixed(0)} Hz');
    sch.wire([(1, 3.08), (1, 1), (1.6, 1)]);
    sch.resistor(1.6, 1, 3.6, 1, eng(pNum(p, 'r', 47), 'Ω'));
    sch.wire([(3.6, 1), (4.2, 1)]);
    sch.inductor(4.2, 1, 6.4, 1, eng(pNum(p, 'l', 0.1), 'H'));
    sch.wire([(6.4, 1), (7.6, 1), (7.6, 2.6)]);
    sch.capacitor(7.6, 2.6, 7.6, 4.4, '${pNum(p, 'c', 1)} µF');
    sch.wire([(7.6, 4.4), (7.6, 6), (5, 6)]);
    sch.meterAt(4.4, 6, 'mA', i * 1000, 2 * vrms / pNum(p, 'r', 47) * 1000, '${(i * 1e3).toStringAsFixed(2)} mA');
    sch.wire([(3.8, 6), (1, 6), (1, 3.92)]);
    // The resonance curve with the present point.
    final r = Rect.fromLTWH(w * 0.56, h * 0.14, w * 0.4, h * 0.6);
    canvas.drawRect(r, fill(Colors.white));
    canvas.drawRect(r, stroke(LabInk.faint, 1));
    final iPeak = vrms / pNum(p, 'r', 47);
    final path = Path();
    for (var k = 0; k <= 120; k++) {
      final f = 50 + 1950 * k / 120;
      final q = Offset(r.left + r.width * k / 120, r.bottom - r.height * 0.9 * current(p, f) / iPeak);
      k == 0 ? path.moveTo(q.dx, q.dy) : path.lineTo(q.dx, q.dy);
    }
    canvas.drawPath(path, stroke(LabInk.blue.withValues(alpha: 0.35), 2));
    final x = r.left + r.width * (pNum(p, 'f', 200) - 50) / 1950;
    final now = Offset(x, r.bottom - r.height * 0.9 * i / iPeak);
    canvas.drawCircle(now, 6, fill(LabInk.accent));
    canvas.drawCircle(now, 6, stroke(LabInk.ink, 1.5));
    label(canvas, 'I', Offset(r.left - 12, r.top + 8), size: 13, color: LabInk.muted);
    label(canvas, 'f →', Offset(r.right - 12, r.bottom + 12), size: 13, color: LabInk.muted);
  }
}

/// An op-amp amplifier (setup 'config': inverting or non-inverting): output
/// against input, gain from the resistors, saturation at the rails.
class OpAmpBench extends LabBench {
  const OpAmpBench();

  @override
  String get kind => 'opamp';

  @override
  LabParams get defaults => {'config': 'inverting', 'vin': 0.0, 'rf': 10e3, 'rin': 1e3};

  @override
  LabParams get preview => {...defaults, 'vin': 0.5};

  @override
  List<LabControl> controls(LabParams p) => [
        LabSlider('vin', 'Vin', -2, 2, divisions: 80, unit: ' V', decimals: 2),
        LabChoice('rf', 'Rf', [(4.7e3, '4.7 kΩ'), (10e3, '10 kΩ'), (22e3, '22 kΩ'), (47e3, '47 kΩ')]),
        LabChoice('rin', pStr(p, 'config') == 'inverting' ? 'Rin' : 'R1', [(1e3, '1 kΩ'), (2.2e3, '2.2 kΩ'), (10e3, '10 kΩ')]),
      ];

  static bool inverting(LabParams p) => pStr(p, 'config', 'inverting') == 'inverting';

  static double gain(LabParams p) => inverting(p) ? -pNum(p, 'rf', 10e3) / pNum(p, 'rin', 1e3) : 1 + pNum(p, 'rf', 10e3) / pNum(p, 'rin', 1e3);

  static double vout(LabParams p) {
    final c = Circuit()..add(VSource('Vin', 'in', '0', pNum(p, 'vin')));
    if (inverting(p)) {
      c
        ..add(Resistor('Rin', 'in', 'm', pNum(p, 'rin', 1e3)))
        ..add(Resistor('Rf', 'm', 'o', pNum(p, 'rf', 10e3)))
        ..add(OpAmp('U', '0', 'm', 'o'));
    } else {
      c
        ..add(Resistor('R1', 'm', '0', pNum(p, 'rin', 1e3)))
        ..add(Resistor('Rf', 'm', 'o', pNum(p, 'rf', 10e3)))
        ..add(OpAmp('U', 'in', 'm', 'o'));
    }
    c.add(Resistor('RL', 'o', '0', 10e3));
    return c.dc().v('o');
  }

  @override
  List<LabColumn> get columns => [LabColumn('Vin (V)', 2), LabColumn('Vout (V)', 2), LabColumn(tr('Gain'))];

  @override
  LabReading read(LabParams p) {
    final vin = pNum(p, 'vin');
    if (vin == 0) return LabReading.not(tr('Set an input voltage first.'));
    final vo = vout(p);
    return LabReading.row([vin, (vo * 100).round() / 100, (vo / vin * 100).round() / 100]);
  }

  @override
  List<String> live(LabParams p) {
    final vo = vout(p);
    return ['Vout = ${vo.toStringAsFixed(2)} V', '${tr('Gain')} = ${gain(p).toStringAsFixed(2)}', if (vo.abs() > 13.4) tr('Saturated')];
  }

  @override
  LabGraph graph(LabParams p) => const LabGraph(0, 1, curve: true);

  @override
  String? result(List<List<Object>> rows) {
    final linear = [for (final r in rows) if ((r[1] as num).abs() < 13.4) r];
    if (linear.length < 2) return rows.isEmpty ? null : tr('Take readings with smaller inputs too, where the output is not saturated.');
    final f = LinearFit.of([for (final r in linear) (r[0] as num).toDouble()], [for (final r in linear) (r[1] as num).toDouble()])!;
    final sat = rows.length > linear.length;
    return tr('Slope of Vout against Vin = {g}: the closed-loop gain.{sat}', {
      'g': f.slope.toStringAsFixed(2),
      'sat': sat ? ' ${tr('Beyond about ±13.5 V the output saturates at the supply rails.')}' : '',
    });
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final vo = vout(p);
    final sch = Schematic(canvas, Rect.fromLTWH(w * 0.02, h * 0.06, w * 0.96, h * 0.86), cols: 13, rows: 7);
    final (minus, plus, out) = sch.opamp(7, 3.5);
    final rf = eng(pNum(p, 'rf', 10e3), 'Ω'), rin = eng(pNum(p, 'rin', 1e3), 'Ω');
    if (inverting(p)) {
      sch.cell(1, 2.4, 1, 4.6, 'Vin');
      sch.wire([(1, 2.4), (1, 1.6), (2.2, 1.6), (2.2, 3)]);
      sch.resistor(2.2, 3, 5, 3, 'Rin $rin');
      sch.wire([(5, 3), (minus.$1, minus.$2)]);
      sch.wire([(5.4, 3), (5.4, 1.2), (6, 1.2)]);
      sch.resistor(6, 1.2, 8.6, 1.2, 'Rf $rf');
      sch.wire([(8.6, 1.2), (9.2, 1.2), (9.2, out.$2)]);
      sch.dot(5.4, 3);
      sch.wire([(plus.$1, plus.$2), (5.4, plus.$2), (5.4, 6)]);
      sch.wire([(1, 4.6), (1, 6), (11, 6)]);
      sch.ground(5.4, 6.3);
    } else {
      sch.cell(1, 3.4, 1, 5.6, 'Vin');
      sch.wire([(1, 3.4), (1, 2.8), (4.6, 2.8), (4.6, plus.$2), (plus.$1, plus.$2)]);
      sch.wire([(minus.$1, minus.$2), (5.2, minus.$2), (5.2, 1.2), (6, 1.2)]);
      sch.resistor(6, 1.2, 8.6, 1.2, 'Rf $rf');
      sch.wire([(8.6, 1.2), (9.2, 1.2), (9.2, out.$2)]);
      sch.wire([(5.2, minus.$2), (3.4, minus.$2)]);
      sch.resistor(3.4, 3.0, 3.4, 5.2, 'R1 $rin');
      sch.wire([(3.4, 5.2), (3.4, 6)]);
      sch.dot(5.2, minus.$2);
      sch.wire([(1, 5.6), (1, 6), (11, 6)]);
      sch.ground(3.4, 6.3);
    }
    sch.wire([(out.$1, out.$2), (11, out.$2), (11, 4)]);
    sch.dot(9.2, out.$2);
    sch.meterAt(11, 4.8, 'V', vo.abs(), 15, '${vo.toStringAsFixed(2)} V');
    sch.wire([(11, 5.4), (11, 6)]);
    sch.text('Vin = ${pNum(p, 'vin').toStringAsFixed(2)} V', 2.2, 6.7, size: 0.32, bold: true);
    sch.text(inverting(p) ? 'A = −Rf/Rin = ${gain(p).toStringAsFixed(2)}' : 'A = 1 + Rf/R1 = ${gain(p).toStringAsFixed(2)}', 8, 6.7, size: 0.32, bold: true, color: LabInk.blue);
    sch.text('±15 V', 7, 2.2, size: 0.26, color: LabInk.muted);
  }
}

/// A 555 timer as an astable multivibrator: f = 1.44 ÷ ((RA + 2RB)·C).
class AstableBench extends LabBench {
  const AstableBench();

  static const vcc = 9.0;

  @override
  String get kind => 'astable';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'ra': 1e3, 'rb': 47e3, 'c': 10.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('ra', 'RA', [(1e3, '1 kΩ'), (10e3, '10 kΩ')]),
        LabChoice('rb', 'RB', [(10e3, '10 kΩ'), (47e3, '47 kΩ'), (100e3, '100 kΩ')]),
        LabChoice('c', 'C', [(1.0, '1 µF'), (10.0, '10 µF')]),
      ];

  static double formula(LabParams p) => 1.44 / ((pNum(p, 'ra', 1e3) + 2 * pNum(p, 'rb', 47e3)) * pNum(p, 'c', 10) * 1e-6);

  static final _cache = LabCache<String, ({List<Offset> out, List<Offset> cap, double period, double high})>(12);

  /// Output and capacitor voltage from the circuit engine, with the measured
  /// period and high time (s) in the steady state.
  static ({List<Offset> out, List<Offset> cap, double period, double high}) run(LabParams p) {
    final key = '${pNum(p, 'ra', 1e3)}|${pNum(p, 'rb', 47e3)}|${pNum(p, 'c', 10)}';
    final hit = _cache[key];
    if (hit != null) return hit;
    final c = Circuit()
      ..add(VSource('Vcc', 'vcc', '0', vcc))
      ..add(Resistor('RA', 'vcc', 'dis', pNum(p, 'ra', 1e3)))
      ..add(Resistor('RB', 'dis', 'th', pNum(p, 'rb', 47e3)))
      ..add(Capacitor('C', 'th', '0', pNum(p, 'c', 10) * 1e-6))
      ..add(Timer555('U', vcc: 'vcc', trig: 'th', dis: 'dis', out: 'out'))
      ..add(Resistor('RL', 'out', '0', 10e3));
    final t0 = 1 / formula(p);
    final dt = t0 / 600;
    final steps = c.transient(duration: t0 * 5, dt: dt);
    final out = [for (final s in steps) Offset(s.time, s.v('out'))];
    final cap = [for (final s in steps) Offset(s.time, s.v('th'))];
    final rises = <double>[], falls = <double>[];
    for (var k = 1; k < out.length; k++) {
      if (out[k - 1].dy < vcc / 2 && out[k].dy >= vcc / 2) rises.add(out[k].dx);
      if (out[k - 1].dy >= vcc / 2 && out[k].dy < vcc / 2) falls.add(out[k].dx);
    }
    final period = rises.length >= 3 ? (rises.last - rises[1]) / (rises.length - 2) : t0;
    final lastRise = rises.isEmpty ? 0.0 : rises[rises.length >= 2 ? rises.length - 2 : 0];
    final fall = falls.where((f) => f > lastRise).firstOrNull;
    final high = fall == null ? period * 0.5 : fall - lastRise;
    return _cache[key] = (out: out, cap: cap, period: period, high: high);
  }

  @override
  List<LabColumn> get columns => [LabColumn('RA (kΩ)', 1), LabColumn('RB (kΩ)', 0), LabColumn('C (µF)', 0), LabColumn(tr('f measured (Hz)'), 2), LabColumn(tr('f formula (Hz)'), 2), LabColumn(tr('Duty cycle (%)'), 0)];

  @override
  LabReading read(LabParams p) {
    final r = run(p);
    return LabReading.row([
      pNum(p, 'ra', 1e3) / 1e3,
      pNum(p, 'rb', 47e3) / 1e3,
      pNum(p, 'c', 10),
      (100 / r.period).round() / 100,
      (formula(p) * 100).round() / 100,
      (100 * r.high / r.period).roundToDouble(),
    ]);
  }

  @override
  List<String> live(LabParams p) {
    final r = run(p);
    return ['f = ${(1 / r.period).toStringAsFixed(2)} Hz', 'T = ${(r.period * 1000).toStringAsFixed(1)} ms', '${tr('Duty cycle')} ${(100 * r.high / r.period).toStringAsFixed(0)} %'];
  }

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final errs = [for (final r in rows) (((r[3] as num) - (r[4] as num)) / (r[4] as num) * 100).abs()];
    return tr('Measured frequencies agree with f = 1.44 ÷ ((RA + 2RB)C) within {e} %. The duty cycle (RA + RB) ÷ (RA + 2RB) is always above 50 %, nearest 50 % when RB is much bigger than RA.',
        {'e': errs.reduce(math.max).toStringAsFixed(1)});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final r = run(p);
    final sch = Schematic(canvas, Rect.fromLTWH(w * 0.02, h * 0.06, w * 0.46, h * 0.88), cols: 8, rows: 8);
    // The chip with its pins.
    final chip = Rect.fromPoints(sch.p(3, 2.2), sch.p(5.4, 5.8));
    canvas.drawRRect(RRect.fromRectAndRadius(chip, const Radius.circular(6)), fill(const Color(0xFF2A2F36)));
    label(canvas, '555', chip.center, size: sch.unit * 0.55, bold: true, color: Colors.white);
    sch.wire([(1, 1), (6.6, 1)]);
    sch.wire([(4.2, 1), (4.2, 2.2)]);
    sch.text('Vcc 9 V', 1.4, 0.6, size: 0.28);
    sch.resistor(1, 1, 1, 3, 'RA');
    sch.wire([(1, 3), (3, 3)]);
    sch.text('7', 3.2, 3, size: 0.24, color: Colors.white);
    sch.resistor(1, 3, 1, 5, 'RB');
    sch.wire([(1, 5), (3, 5)]);
    sch.text('2,6', 3.3, 5, size: 0.24, color: Colors.white);
    sch.capacitor(1, 5, 1, 7, 'C');
    sch.wire([(1, 7), (6.6, 7)]);
    sch.wire([(4.2, 5.8), (4.2, 7)]);
    sch.dot(1, 3);
    sch.dot(1, 5);
    sch.wire([(5.4, 4), (6.6, 4)]);
    sch.text('3', 5.2, 4, size: 0.24, color: Colors.white);
    // The LED blinks in real time, replaying the last three cycles.
    final on = _at(r.out, r.out.last.dx - 3 * r.period + t % (3 * r.period)) > vcc / 2;
    sch.indicator(6.6, 5, on);
    sch.wire([(6.6, 4), (6.6, 4.6)]);
    sch.wire([(6.6, 5.4), (6.6, 7)]);
    final last = r.out.where((o) => o.dx >= r.out.last.dx - 3 * r.period).toList();
    final capLast = r.cap.where((o) => o.dx >= r.cap.last.dx - 3 * r.period).toList();
    final tdiv = _niceDiv(3 * r.period / 10);
    paintScope(canvas, Rect.fromLTWH(w * 0.53, h * 0.14, w * 0.44, h * 0.6), [
      ScopeTrace(last, const Color(0xFF64B5F6), tr('Output')),
      ScopeTrace(capLast, const Color(0xFFFFD54F), tr('Capacitor')),
    ], timePerDiv: tdiv, voltsPerDiv: 2, offset: -4);
    label(canvas, 'f = ${(1 / r.period).toStringAsFixed(2)} Hz', Offset(w * 0.75, h * 0.84), size: 16, bold: true);
  }

  static double _at(List<Offset> pts, double t) {
    for (final o in pts) {
      if (o.dx >= t) return o.dy;
    }
    return pts.last.dy;
  }

  static double _niceDiv(double v) {
    final mag = math.pow(10, (math.log(v) / math.ln10).floor()).toDouble();
    for (final m in [1, 2, 5, 10]) {
      if (v <= m * mag) return m * mag;
    }
    return 10 * mag;
  }
}

/// Kirchhoff's laws in a two-source network: currents meet at a junction
/// (KCL) and voltages round each loop add to zero (KVL).
class KirchhoffBench extends LabBench {
  const KirchhoffBench();

  @override
  String get kind => 'kirchhoff';

  @override
  LabParams get defaults => {'e1': 6.0, 'e2': 3.0, 'r1': 100.0, 'r2': 220.0, 'r3': 330.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabSlider('e1', 'E1', 1, 12, divisions: 22, unit: ' V', decimals: 1),
        LabSlider('e2', 'E2', 1, 12, divisions: 22, unit: ' V', decimals: 1),
        LabChoice('r1', 'R1', [(100.0, '100 Ω'), (220.0, '220 Ω'), (470.0, '470 Ω')]),
        LabChoice('r2', 'R2', [(100.0, '100 Ω'), (220.0, '220 Ω'), (470.0, '470 Ω')]),
        LabChoice('r3', 'R3', [(150.0, '150 Ω'), (330.0, '330 Ω'), (680.0, '680 Ω')]),
      ];

  /// Branch currents I1 (from E1), I2 (from E2), I3 (through R3), in amperes,
  /// and the junction voltage.
  static (double, double, double, double) solve(LabParams p) {
    final c = Circuit()
      ..add(VSource('E1', 'a', '0', pNum(p, 'e1', 6)))
      ..add(Ammeter('A1', 'a', 'a1'))
      ..add(Resistor('R1', 'a1', 'm', pNum(p, 'r1', 100)))
      ..add(VSource('E2', 'b', '0', pNum(p, 'e2', 3)))
      ..add(Ammeter('A2', 'b', 'b1'))
      ..add(Resistor('R2', 'b1', 'm', pNum(p, 'r2', 220)))
      ..add(Ammeter('A3', 'm', 'm1'))
      ..add(Resistor('R3', 'm1', '0', pNum(p, 'r3', 330)));
    final s = c.dc();
    return (s.i('A1'), s.i('A2'), s.i('A3'), s.v('m'));
  }

  @override
  List<LabColumn> get columns => [LabColumn('I1 (mA)', 2), LabColumn('I2 (mA)', 2), LabColumn('I3 (mA)', 2), LabColumn('I1 + I2 − I3', 2), LabColumn(tr('Loop 1: E1 − I1R1 − I3R3 (V)'), 2)];

  @override
  LabReading read(LabParams p) {
    final (i1, i2, i3, _) = solve(p);
    double ma(double i) => (i * 1e5).round() / 100;
    final loop = pNum(p, 'e1', 6) - ma(i1) / 1000 * pNum(p, 'r1', 100) - ma(i3) / 1000 * pNum(p, 'r3', 330);
    return LabReading.row([ma(i1), ma(i2), ma(i3), ((ma(i1) + ma(i2) - ma(i3)) * 100).round() / 100, (loop * 100).round() / 100]);
  }

  @override
  List<String> live(LabParams p) {
    final (i1, i2, i3, _) = solve(p);
    return ['I1 = ${(i1 * 1e3).toStringAsFixed(2)} mA', 'I2 = ${(i2 * 1e3).toStringAsFixed(2)} mA', 'I3 = ${(i3 * 1e3).toStringAsFixed(2)} mA'];
  }

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final kcl = rows.map((r) => (r[3] as num).abs()).reduce(math.max);
    final kvl = rows.map((r) => (r[4] as num).abs()).reduce(math.max);
    return tr('At the junction I1 + I2 − I3 is at most {a} mA (zero within the meter rounding): the current in equals the current out. Round loop 1 the voltages add to {v} V: the EMF equals the sum of the IR drops.',
        {'a': kcl.toStringAsFixed(2), 'v': kvl.toStringAsFixed(2)});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final (i1, i2, i3, vm) = solve(p);
    final sch = Schematic(canvas, Rect.fromLTWH(w * 0.03, h * 0.05, w * 0.94, h * 0.9), cols: 13, rows: 7);
    sch.cell(1, 2.6, 1, 4.4, 'E1 ${pNum(p, 'e1', 6).toStringAsFixed(1)} V');
    sch.wire([(1, 2.6), (1, 1), (1.8, 1)]);
    sch.meterAt(2.4, 1, 'mA', i1.abs() * 1e3, 60, '${(i1 * 1e3).toStringAsFixed(2)} mA');
    sch.wire([(3, 1), (3.6, 1)]);
    sch.resistor(3.6, 1, 5.8, 1, 'R1 ${pNum(p, 'r1', 100).toStringAsFixed(0)} Ω');
    sch.wire([(5.8, 1), (6.5, 1), (6.5, 2)]);
    sch.dot(6.5, 1);
    sch.meterAt(6.5, 2.6, 'mA', i3.abs() * 1e3, 60, '');
    sch.text('I3 ${(i3 * 1e3).toStringAsFixed(2)} mA', 7.9, 2.6, size: 0.28, bold: true, halo: LabInk.paper);
    sch.wire([(6.5, 3.2), (6.5, 3.6)]);
    sch.resistor(6.5, 3.6, 6.5, 6, 'R3 ${pNum(p, 'r3', 330).toStringAsFixed(0)} Ω');
    sch.dot(6.5, 6);
    sch.wire([(1, 4.4), (1, 6), (12, 6), (12, 4.4)]);
    sch.cell(12, 2.6, 12, 4.4, 'E2 ${pNum(p, 'e2', 3).toStringAsFixed(1)} V');
    sch.wire([(12, 2.6), (12, 1), (11.2, 1)]);
    sch.meterAt(10.6, 1, 'mA', i2.abs() * 1e3, 60, '${(i2 * 1e3).toStringAsFixed(2)} mA');
    sch.wire([(10, 1), (9.4, 1)]);
    sch.resistor(9.4, 1, 7.2, 1, 'R2 ${pNum(p, 'r2', 220).toStringAsFixed(0)} Ω');
    sch.wire([(7.2, 1), (6.5, 1)]);
    sch.text('V = ${vm.toStringAsFixed(2)} V', 6.5, 0.3, size: 0.3, color: LabInk.blue, bold: true);
    sch.text(tr('Loop 1'), 3.6, 4, size: 0.3, color: LabInk.muted);
    sch.text(tr('Loop 2'), 9.4, 4, size: 0.3, color: LabInk.muted);
  }
}
