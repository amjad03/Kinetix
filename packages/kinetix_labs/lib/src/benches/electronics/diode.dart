import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../core/i18n.dart';
import '../../engines/circuit.dart';
import 'schematic.dart';

/// LED colours: wavelength (nm) and how they look.
const ledColours = <String, (double, Color)>{
  'red': (625, Color(0xFFE53935)),
  'yellow': (590, Color(0xFFFFC107)),
  'green': (525, Color(0xFF2E9D4A)),
  'blue': (470, Color(0xFF1E64E0)),
};

String ledName(String c) => switch (c) {
      'yellow' => tr('Yellow'),
      'green' => tr('Green'),
      'blue' => tr('Blue'),
      _ => tr('Red'),
    };

/// I–V characteristic of a junction diode: a silicon pn junction, a Zener or
/// an LED (setup 'device'), in forward or reverse bias, through a series
/// resistor from a variable supply.
class DiodeBench extends LabBench {
  const DiodeBench();

  static const series = 100.0; // ohms
  static const leak = 10e6; // reverse leakage path, ohms

  @override
  String get kind => 'diode';

  @override
  LabParams get defaults => {'device': 'si', 'bias': 'fwd', 'e': 0.0, 'vz': 5.1, 'colour': 'red'};

  @override
  LabParams get preview => {...defaults, 'e': 2.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('bias', tr('Bias'), [('fwd', tr('Forward')), ('rev', tr('Reverse'))]),
        LabSlider('e', tr('Supply'), 0, 10, divisions: 200, unit: ' V', decimals: 2),
        if (pStr(p, 'device') == 'zener') LabChoice('vz', tr('Zener'), [(3.3, '3.3 V'), (5.1, '5.1 V'), (6.2, '6.2 V')]),
        if (pStr(p, 'device') == 'led') LabChoice('colour', tr('LED'), [for (final c in ledColours.keys) (c, ledName(c))]),
      ];

  @override
  LabParams act(String action, LabParams p) => action == 'set:bias' || action == 'set:vz' || action == 'set:colour' ? {...p, 'e': 0.0} : p;

  static Part _device(LabParams p, String a, String k) => switch (pStr(p, 'device')) {
        'zener' => Diode.zener('D', a, k, pNum(p, 'vz', 5.1)),
        'led' => Diode.led('D', a, k, ledColours[pStr(p, 'colour', 'red')]!.$1),
        _ => Diode.silicon('D', a, k),
      };

  /// Voltage across the diode (anode − cathode) and current through it
  /// (anode → cathode), as the meters show them.
  static (double v, double i) measure(LabParams p) {
    final fwd = pStr(p, 'bias', 'fwd') == 'fwd';
    final c = Circuit()
      ..add(VSource('E', 's', '0', pNum(p, 'e')))
      ..add(Resistor('R', 's', 'd', series))
      ..add(fwd ? _device(p, 'd', '0') : _device(p, '0', 'd'))
      ..add(Resistor('Rleak', 'd', '0', leak));
    final s = c.dc();
    final vd = s.v('d'), i = s.i('R');
    return fwd ? (vd, i) : (-vd, -i);
  }

  static bool microamps(LabParams p) => pStr(p, 'bias', 'fwd') == 'rev' && pStr(p, 'device') != 'zener';

  @override
  List<LabColumn> get columns => [LabColumn(tr('V (volt)'), 3), LabColumn('I (mA)', 3)];

  @override
  LabReading read(LabParams p) {
    final (v, i) = measure(p);
    if (pNum(p, 'e') <= 0) return LabReading.not(tr('Turn up the supply first.'));
    return LabReading.row([_r(v, 1000), _r(i * 1000, 1000)]);
  }

  static double _r(double v, int k) => (v * k).round() / k;

  @override
  List<String> live(LabParams p) {
    final (v, i) = measure(p);
    return ['V = ${v.toStringAsFixed(3)} V', microamps(p) ? 'I = ${(i * 1e6).toStringAsFixed(2)} µA' : 'I = ${(i * 1e3).toStringAsFixed(2)} mA'];
  }

  @override
  LabGraph graph(LabParams p) => const LabGraph(0, 1, curve: true);

  /// Where the straight, steep part of the curve meets I = 0: the knee
  /// (cut-in) voltage, from the two readings with the largest current in
  /// one direction. Null with fewer than two such readings.
  static double? knee(List<List<Object>> rows, {bool reverse = false}) {
    final pts = [
      for (final r in rows)
        if (((r[1] as num) > 0) != reverse && (r[1] as num) != 0) ((r[0] as num).toDouble().abs(), (r[1] as num).toDouble().abs()),
    ]..sort((a, b) => a.$2.compareTo(b.$2));
    if (pts.length < 2) return null;
    final (v1, i1) = pts[pts.length - 2];
    final (v2, i2) = pts.last;
    if (i2 - i1 < 0.5) return null; // need some milliamperes between them
    return v2 - i2 * (v2 - v1) / (i2 - i1);
  }

  @override
  String? result(List<List<Object>> rows) {
    if (rows.length < 3) return null;
    final f = knee(rows), r = knee(rows, reverse: true);
    final out = <String>[];
    if (f != null) out.add(tr('Knee (cut-in) voltage ≈ {v} V: below it almost no current flows; above it the current rises steeply.', {'v': f.toStringAsFixed(2)}));
    if (r != null) out.add(tr('Reverse breakdown at about {v} V: after it the voltage stays nearly the same while the current grows.', {'v': r.toStringAsFixed(2)}));
    if (r == null && rows.any((x) => (x[1] as num) < 0)) out.add(tr('In reverse bias only a tiny current (microamperes) flows.'));
    return out.isEmpty ? tr('Take more readings where the current rises.') : out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final fwd = pStr(p, 'bias', 'fwd') == 'fwd';
    final dev = pStr(p, 'device');
    final (v, i) = measure(p);
    final sch = Schematic(canvas, Rect.fromLTWH(w * 0.02, h * 0.1, w * 0.62, h * 0.86), cols: 10, rows: 7);
    // Supply on the left, resistor and milliammeter on top, diode on the right with the voltmeter across it.
    sch.cell(1, 2.6, 1, 4.4, tr('Supply'), 2);
    sch.wire([(1, 2.6), (1, 1), (2.2, 1)]);
    sch.rheostat(2.2, 1, 4.6, 1, '${DiodeBench.series.toStringAsFixed(0)} Ω');
    sch.wire([(4.6, 1), (5.4, 1)]);
    sch.meterAt(6, 1, microamps(p) ? 'µA' : 'mA', i.abs() * 1000, dev == 'si' ? 50 : 60, microamps(p) ? '${(i.abs() * 1e6).toStringAsFixed(2)} µA' : '${(i.abs() * 1e3).toStringAsFixed(2)} mA');
    sch.wire([(6.6, 1), (8, 1), (8, 2.4)]);
    final glow = dev == 'led' ? ledColours[pStr(p, 'colour', 'red')]!.$2 : null;
    final bright = dev == 'led' && fwd ? (i * 1000 / 20).clamp(0.0, 1.0) : 0.0;
    if (fwd) {
      sch.diode(8, 2.4, 8, 4.6, zener: dev == 'zener', glow: glow, brightness: bright);
    } else {
      sch.diode(8, 4.6, 8, 2.4, zener: dev == 'zener', glow: glow, brightness: 0);
    }
    sch.wire([(8, 4.6), (8, 6), (1, 6), (1, 4.4)]);
    // Voltmeter across the diode.
    sch.wire([(8, 2.4), (9.3, 2.4), (9.3, 3)]);
    sch.wire([(8, 4.6), (9.3, 4.6), (9.3, 4.2)]);
    sch.dot(8, 2.4);
    sch.dot(8, 4.6);
    sch.meterAt(9.3, 3.6, 'V', v.abs(), dev == 'zener' ? 8 : 1.5, '${v.abs().toStringAsFixed(3)} V');
    sch.text(fwd ? tr('Forward bias') : tr('Reverse bias'), 4.5, 3.6, size: 0.36, bold: true, color: fwd ? LabInk.green : LabInk.red);
    sch.text('${pNum(p, 'e').toStringAsFixed(2)} V', 1.9, 3.5, size: 0.3, color: LabInk.muted);
    _miniCurve(canvas, Rect.fromLTWH(w * 0.68, h * 0.18, w * 0.29, h * 0.62), p, v, i);
  }

  /// A small sketch of the whole characteristic with the present point.
  static void _miniCurve(Canvas canvas, Rect r, LabParams p, double v, double i) {
    canvas.drawRect(r, fill(Colors.white));
    canvas.drawRect(r, stroke(LabInk.faint, 1));
    final dev = pStr(p, 'device');
    final vMin = dev == 'zener' ? -8.0 : -6.0, vMax = dev == 'led' ? 3.5 : 1.0;
    final c = Offset(r.left + r.width * (-vMin / (vMax - vMin)), r.bottom - r.height * 0.35);
    canvas.drawLine(Offset(r.left, c.dy), Offset(r.right, c.dy), stroke(LabInk.muted, 1));
    canvas.drawLine(Offset(c.dx, r.top), Offset(c.dx, r.bottom), stroke(LabInk.muted, 1));
    label(canvas, 'V', Offset(r.right - 8, c.dy + 10), size: 12, color: LabInk.muted);
    label(canvas, 'I', Offset(c.dx + 8, r.top + 8), size: 12, color: LabInk.muted);
    const iMax = 0.04;
    Offset map(double vv, double ii) => Offset(r.left + r.width * (vv - vMin) / (vMax - vMin), c.dy - (ii / iMax) * (c.dy - r.top) * (ii > 0 ? 1 : 0.35 * (c.dy - r.top) / (r.bottom - c.dy)));
    final path = Path();
    var first = true;
    final d = _device({...p}, 'a', '0') as Diode;
    for (var k = 0; k <= 160; k++) {
      final vv = vMin + (vMax - vMin) * k / 160;
      final ii = d.iv(vv).$1.clamp(-iMax, iMax);
      final q = map(vv, ii);
      if (first) {
        path.moveTo(q.dx, q.dy);
        first = false;
      } else {
        path.lineTo(q.dx, q.dy);
      }
    }
    canvas.save();
    canvas.clipRect(r);
    canvas.drawPath(path, stroke(LabInk.blue.withValues(alpha: 0.6), 2));
    canvas.restore();
    canvas.drawCircle(map(v, i.clamp(-iMax, iMax)), 5, fill(LabInk.accent));
    canvas.drawCircle(map(v, i.clamp(-iMax, iMax)), 5, stroke(LabInk.ink, 1.5));
    label(canvas, tr('Characteristic'), Offset(r.center.dx, r.bottom + 14), size: 13, color: LabInk.muted);
  }
}

/// Planck's constant from LEDs: each colour starts to glow when eV ≈ hc/λ,
/// so the threshold voltage against 1/λ is a straight line of slope hc/e.
class PlanckBench extends LabBench {
  const PlanckBench();

  static const e = 1.602176634e-19, c = 2.99792458e8, hAccepted = 6.62607015e-34;

  @override
  String get kind => 'planck';

  @override
  LabParams get defaults => {'colour': 'red', 'e': 0.0};

  @override
  LabParams get preview => {...defaults, 'e': 1.9};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('colour', tr('LED'), [for (final k in ledColours.keys) (k, ledName(k))]),
        LabSlider('e', tr('Voltage'), 0, 3.5, divisions: 350, unit: ' V', decimals: 2),
      ];

  @override
  LabParams act(String action, LabParams p) => action == 'set:colour' ? {...p, 'e': 0.0} : p;

  /// LED voltage and current with the supply set directly across it through 100 Ω.
  static (double v, double i) measure(LabParams p) {
    final circuit = Circuit()
      ..add(VSource('E', 's', '0', pNum(p, 'e')))
      ..add(Resistor('R', 's', 'd', 100))
      ..add(Diode.led('D', 'd', '0', ledColours[pStr(p, 'colour', 'red')]!.$1));
    final s = circuit.dc();
    return (s.v('d'), s.i('R'));
  }

  /// "Just glowing": between 0.1 and 0.6 mA.
  static String? why(double i) => i < 1e-4
      ? tr('The LED is not glowing yet: raise the voltage slowly.')
      : (i > 6e-4 ? tr('The LED is too bright: lower the voltage until it only just glows.') : null);

  @override
  List<LabColumn> get columns => [LabColumn(tr('LED')), LabColumn('λ (nm)', 0), LabColumn('1/λ (µm⁻¹)', 3), LabColumn(tr('V (volt)'), 2)];

  @override
  LabReading read(LabParams p) {
    final (v, i) = measure(p);
    final w = why(i);
    if (w != null) return LabReading.not(w);
    final colour = pStr(p, 'colour', 'red');
    final nm = ledColours[colour]!.$1;
    return LabReading.row([ledName(colour), nm, (1000 / nm * 1000).round() / 1000, (v * 100).round() / 100]);
  }

  @override
  List<String> live(LabParams p) {
    final (v, i) = measure(p);
    return ['V = ${v.toStringAsFixed(2)} V', 'I = ${(i * 1e3).toStringAsFixed(2)} mA'];
  }

  @override
  LabGraph graph(LabParams p) => const LabGraph(2, 3, line: true, fromZero: false);

  @override
  String? result(List<List<Object>> rows) {
    final xs = <double>[], ys = <double>[];
    for (final r in rows) {
      xs.add((r[2] as num) * 1e6); // per metre
      ys.add((r[3] as num).toDouble());
    }
    if ({for (final x in xs) x}.length < 2) return tr('Record the threshold voltage for at least two colours.');
    final f = LinearFit.of(xs, ys)!;
    final h = f.slope * e / c, dh = f.slopeSe * e / c;
    return tr('Slope of V against 1/λ = {k} V m, so h = e × slope ÷ c = {h} × 10⁻³⁴ J s (accepted value 6.63 × 10⁻³⁴ J s, {pct}% off).', {
      'k': '(${pm(f.slope * 1e6, f.slopeSe * 1e6)}) × 10⁻⁶',
      'h': pm(h * 1e34, dh * 1e34),
      'pct': ((h - hAccepted).abs() / hAccepted * 100).toStringAsFixed(1),
    });
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final (v, i) = measure(p);
    final colour = pStr(p, 'colour', 'red');
    final sch = Schematic(canvas, Rect.fromLTWH(w * 0.04, h * 0.08, w * 0.6, h * 0.86), cols: 9, rows: 7);
    sch.cell(1, 2.6, 1, 4.4, tr('Supply'), 2);
    sch.wire([(1, 2.6), (1, 1), (2.2, 1)]);
    sch.resistor(2.2, 1, 4.6, 1, '100 Ω');
    sch.wire([(4.6, 1), (5.4, 1)]);
    sch.meterAt(6, 1, 'mA', i * 1000, 1, '${(i * 1e3).toStringAsFixed(2)} mA');
    sch.wire([(6.6, 1), (7.4, 1), (7.4, 2.4)]);
    sch.diode(7.4, 2.4, 7.4, 4.6, glow: ledColours[colour]!.$2, brightness: (i / 6e-4).clamp(0.0, 1.0));
    sch.wire([(7.4, 4.6), (7.4, 6), (1, 6), (1, 4.4)]);
    sch.wire([(7.4, 2.4), (8.6, 2.4), (8.6, 3)]);
    sch.wire([(7.4, 4.6), (8.6, 4.6), (8.6, 4.2)]);
    sch.dot(7.4, 2.4);
    sch.dot(7.4, 4.6);
    sch.meterAt(8.6, 3.6, 'V', v, 3.5, '${v.toStringAsFixed(2)} V');
    // The LED seen in a dark box, as the class sees it.
    final box = Rect.fromLTWH(w * 0.7, h * 0.22, w * 0.26, h * 0.5);
    canvas.drawRRect(RRect.fromRectAndRadius(box, const Radius.circular(12)), fill(const Color(0xFF15181C)));
    final b = (i / 6e-4).clamp(0.0, 1.0);
    final glowColour = ledColours[colour]!.$2;
    if (i > 1e-4) {
      canvas.drawCircle(box.center, box.shortestSide * (0.15 + 0.3 * b), Paint()..color = glowColour.withValues(alpha: 0.3 + 0.6 * b)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 18));
    }
    canvas.drawCircle(box.center, box.shortestSide * 0.1, fill(i > 1e-4 ? Color.lerp(glowColour, Colors.white, 0.3 * b)! : glowColour.withValues(alpha: 0.3)));
    label(canvas, '${ledName(colour)} · ${ledColours[colour]!.$1.toStringAsFixed(0)} nm', Offset(box.center.dx, box.bottom + 18), size: 15, bold: true);
    label(canvas, why(i) == null ? tr('Just glowing: record') : (i < 1e-4 ? tr('Dark') : tr('Too bright')), Offset(box.center.dx, box.top - 16), size: 14, color: why(i) == null ? LabInk.green : LabInk.muted);
  }
}
