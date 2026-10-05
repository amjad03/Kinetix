import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../core/i18n.dart';
import '../../engines/fields.dart';

double _r(double v, int k) => (v * k).round() / k;

/// e/m of the electron with a fine-beam tube in Helmholtz coils:
/// e/m = 2V ÷ (B²r²).
class EmBench extends LabBench {
  const EmBench();

  static const turns = 130, coilRadius = 0.15;

  @override
  String get kind => 'e-by-m';

  @override
  LabParams get defaults => {'v': 200.0, 'i': 1.5};

  @override
  List<LabControl> controls(LabParams p) => [
        LabSlider('v', tr('Accelerating voltage'), 150, 300, divisions: 30, unit: ' V'),
        LabSlider('i', tr('Coil current'), 1, 2.5, divisions: 30, unit: ' A', decimals: 2),
      ];

  static double field(LabParams p) => Fields.helmholtz(pNum(p, 'i', 1.5), turns, coilRadius);

  /// The beam radius read on the scale inside the tube, to 1 mm.
  static double radiusCm(LabParams p) => _r(Fields.beamRadius(pNum(p, 'v', 200), field(p)) * 100, 10);

  @override
  List<LabColumn> get columns => [LabColumn('V (V)', 0), LabColumn('I (A)', 2), LabColumn('B (mT)', 3), LabColumn('r (cm)', 1), LabColumn('e/m (10¹¹ C/kg)', 3)];

  @override
  LabReading read(LabParams p) {
    final r = radiusCm(p) / 100, b = field(p);
    if (r > 0.055) return LabReading.not(tr('The circle is too big for the scale: raise the coil current.'));
    if (r < 0.02) return LabReading.not(tr('The circle is too small to read well: lower the coil current.'));
    final em = 2 * pNum(p, 'v', 200) / (b * b * r * r);
    return LabReading.row([pNum(p, 'v', 200), pNum(p, 'i', 1.5), _r(b * 1000, 1000), radiusCm(p), _r(em / 1e11, 1000)]);
  }

  @override
  List<String> live(LabParams p) => ['B = ${(field(p) * 1000).toStringAsFixed(3)} mT', 'r = ${radiusCm(p).toStringAsFixed(1)} cm'];

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final m = meanSe([for (final r in rows) (r[4] as num).toDouble()]);
    return tr('e/m = {v} × 10¹¹ C/kg (accepted value 1.759 × 10¹¹ C/kg). Reading the radius to 1 mm limits the accuracy.', {'v': pm(m.mean, m.se)});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final c = Offset(w * 0.45, h * 0.5), bulb = math.min(w, h) * 0.42;
    // Coils seen face on, and the glass bulb.
    canvas.drawCircle(c, bulb * 1.08, stroke(const Color(0xFFB87333), 10));
    canvas.drawCircle(c, bulb, fill(const Color(0xFF14181F)));
    final pxPerCm = bulb / 7;
    // Scale inside the bulb.
    final gun = c + Offset(0, bulb * 0.85);
    for (var cm = 0; cm <= 12; cm += 2) {
      final x = gun.dx + cm * pxPerCm * 0.5 * 2;
      canvas.drawLine(Offset(x, gun.dy - 4), Offset(x, gun.dy + 4), stroke(Colors.white54, 1));
    }
    final r = radiusCm(p) * pxPerCm;
    // The beam leaves the gun to the right and curls up into a circle.
    canvas.drawCircle(Offset(gun.dx + r, gun.dy), r, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..color = const Color(0xFF5BE0FF).withValues(alpha: 0.85)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3));
    canvas.drawRect(Rect.fromCenter(center: gun, width: 14, height: 20), fill(const Color(0xFF9AA4AE)));
    label(canvas, 'r = ${radiusCm(p).toStringAsFixed(1)} cm', Offset(w * 0.86, h * 0.4), size: 17, bold: true);
    label(canvas, 'B = ${(field(p) * 1000).toStringAsFixed(2)} mT', Offset(w * 0.86, h * 0.5), size: 15);
    label(canvas, 'V = ${pNum(p, 'v', 200).toStringAsFixed(0)} V', Offset(w * 0.86, h * 0.6), size: 15);
  }
}

/// The photoelectric effect: stopping potential against frequency gives h
/// (slope h/e) and the work function (intercept).
class PhotoelectricBench extends LabBench {
  const PhotoelectricBench();

  static const phi = 1.9; // eV, a caesium-antimony cathode
  static final lines = <double, Color>{365.0: Color(0xFF7B4DFF), 405.0: Color(0xFF5C6BC0), 436.0: Color(0xFF1E88E5), 546.0: Color(0xFF43A047), 578.0: Color(0xFFFDD835)};

  @override
  String get kind => 'photoelectric';

  @override
  LabParams get defaults => {'nm': 436.0, 'intensity': 1.0, 'v': 0.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('nm', tr('Filter'), [for (final l in lines.keys) (l, '${l.toStringAsFixed(0)} nm')]),
        LabChoice('intensity', tr('Intensity'), [(0.5, tr('Half')), (1.0, tr('Full'))]),
        LabSlider('v', tr('Anode potential'), -2.5, 3, divisions: 550, unit: ' V', decimals: 2),
      ];

  static double stopping(LabParams p) => Fields.stoppingPotential(pNum(p, 'nm', 436) * 1e-9, phi);

  /// Photocurrent in nanoamperes, read to 0.1 nA.
  static double current(LabParams p) => _r(Fields.photocurrent(pNum(p, 'v'), stopping(p), 40e-9 * pNum(p, 'intensity', 1)) * 1e9, 10);

  @override
  List<LabColumn> get columns => [LabColumn('λ (nm)', 0), LabColumn('ν (10¹⁴ Hz)', 3), LabColumn('V (V)', 2), LabColumn('I (nA)', 1)];

  @override
  LabReading read(LabParams p) {
    final nm = pNum(p, 'nm', 436);
    return LabReading.row([nm, _r(Fields.c / (nm * 1e-9) / 1e14, 1000), pNum(p, 'v'), current(p)]);
  }

  @override
  List<String> live(LabParams p) => ['I = ${current(p).toStringAsFixed(1)} nA', 'V = ${pNum(p, 'v').toStringAsFixed(2)} V'];

  @override
  LabGraph graph(LabParams p) {
    final nm = pNum(p, 'nm', 436);
    return LabGraph(2, 3, curve: true, include: (r) => r[0] == nm);
  }

  /// For each wavelength: the least retarding potential at which the
  /// current was zero (the stopping potential, as read).
  static Map<double, double> stoppingFrom(List<List<Object>> rows) {
    final out = <double, double>{};
    for (final r in rows) {
      final nm = (r[0] as num).toDouble(), v = (r[2] as num).toDouble(), i = (r[3] as num).toDouble();
      if (i > 0 || v >= 0) continue;
      if (!out.containsKey(nm) || -v < out[nm]!) out[nm] = -v;
    }
    return out;
  }

  @override
  String? result(List<List<Object>> rows) {
    final v0 = stoppingFrom(rows);
    if (v0.length < 3) return rows.isEmpty ? null : tr('For at least three filters, find the retarding potential at which the current just becomes zero.');
    final xs = [for (final nm in v0.keys) Fields.c / (nm * 1e-9)], ys = [for (final v in v0.values) v];
    final f = LinearFit.of(xs, ys)!;
    final h = f.slope * Fields.e;
    final phiEv = -f.intercept;
    return tr('Stopping potential rises in a straight line with frequency. Slope h/e gives h = {h} × 10⁻³⁴ J s; the intercept gives the work function φ = {p} eV (threshold {t} × 10¹⁴ Hz). Brighter light gives more current but the same stopping potential.',
        {'h': pm(h * 1e34, f.slopeSe * Fields.e * 1e34), 'p': phiEv.toStringAsFixed(2), 't': (phiEv * Fields.e / Fields.h / 1e14).toStringAsFixed(2)});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final colour = lines[pNum(p, 'nm', 436)] ?? Colors.white;
    final cell = Offset(w * 0.38, h * 0.45), r = math.min(w, h) * 0.26;
    canvas.drawCircle(cell, r, fill(const Color(0x2290CAF9)));
    canvas.drawCircle(cell, r, stroke(LabInk.ink, 2));
    // Curved cathode and the anode wire.
    canvas.drawArc(Rect.fromCircle(center: cell + Offset(r * 0.2, 0), radius: r * 0.7), math.pi * 0.65, math.pi * 0.7, false, stroke(const Color(0xFF8D6E63), 8));
    canvas.drawLine(cell + Offset(r * 0.15, -r * 0.5), cell + Offset(r * 0.15, r * 0.5), stroke(LabInk.ink, 3));
    // Light from the lamp through the filter.
    final beam = Path()
      ..moveTo(w * 0.02, cell.dy - 20)
      ..lineTo(cell.dx - r * 0.45, cell.dy - 40)
      ..lineTo(cell.dx - r * 0.45, cell.dy + 40)
      ..lineTo(w * 0.02, cell.dy + 20)
      ..close();
    canvas.drawPath(beam, fill(colour.withValues(alpha: 0.25 + 0.35 * pNum(p, 'intensity', 1))));
    // Electrons flying when there is current.
    final i = current(p);
    if (i > 0) {
      final n = (i / 4).ceil();
      for (var k = 0; k < n; k++) {
        final phase = ((t * 1.5 + k / n) % 1);
        final y = cell.dy + (k - n / 2) * 6;
        canvas.drawCircle(Offset(cell.dx - r * 0.4 + phase * r * 0.55, y), 3, fill(LabInk.blue));
      }
    }
    label(canvas, 'I = ${i.toStringAsFixed(1)} nA', Offset(w * 0.82, h * 0.35), size: 18, bold: true);
    label(canvas, 'V = ${pNum(p, 'v').toStringAsFixed(2)} V', Offset(w * 0.82, h * 0.47), size: 16);
    label(canvas, '${pNum(p, 'nm', 436).toStringAsFixed(0)} nm', Offset(w * 0.12, cell.dy - 50), size: 14, bold: true, color: LabInk.muted);
  }
}

/// The Hall effect in a semiconductor slab: V_H = IB ÷ (nqt).
class HallBench extends LabBench {
  const HallBench();

  static const thickness = 0.5e-3; // m
  static const samples = {'n-Ge': (1.0e21, -1), 'p-Ge': (1.5e21, 1)};

  @override
  String get kind => 'hall';

  @override
  LabParams get defaults => {'sample': 'n-Ge', 'i': 2.0, 'b': 0.2};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('sample', tr('Sample'), [for (final s in samples.keys) (s, s)]),
        LabSlider('i', tr('Current'), 1, 8, divisions: 14, unit: ' mA', decimals: 1),
        LabChoice('b', 'B', [(0.1, '0.1 T'), (0.2, '0.2 T'), (0.3, '0.3 T'), (0.4, '0.4 T')]),
      ];

  static double hallMv(LabParams p) {
    final (n, sign) = samples[pStr(p, 'sample', 'n-Ge')]!;
    return _r(Fields.hallVoltage(pNum(p, 'i', 2) / 1000, pNum(p, 'b', 0.2), n, thickness, sign: sign) * 1000, 100);
  }

  @override
  List<LabColumn> get columns => [LabColumn(tr('Sample')), LabColumn('B (T)', 1), LabColumn('I (mA)', 1), LabColumn('V_H (mV)', 2)];

  @override
  LabReading read(LabParams p) => LabReading.row([pStr(p, 'sample', 'n-Ge'), pNum(p, 'b', 0.2), pNum(p, 'i', 2), hallMv(p)]);

  @override
  List<String> live(LabParams p) => ['V_H = ${hallMv(p).toStringAsFixed(2)} mV'];

  @override
  LabGraph graph(LabParams p) {
    final s = pStr(p, 'sample', 'n-Ge'), b = pNum(p, 'b', 0.2);
    return LabGraph(2, 3, throughOrigin: true, include: (r) => r[0] == s && r[1] == b);
  }

  @override
  String? result(List<List<Object>> rows) {
    final out = <String>[];
    for (final s in samples.keys) {
      final mine = [for (final r in rows) if (r[0] == s) r];
      if (mine.length < 2) continue;
      // R_H = V_H t ÷ (I B), from each reading.
      final rh = meanSe([for (final r in mine) (r[3] as num) / 1000 * thickness / ((r[2] as num) / 1000 * (r[1] as num))]);
      final n = 1 / (rh.mean.abs() * Fields.e);
      out.add(tr('{s}: Hall coefficient R_H = {r} × 10⁻³ m³/C; carriers are {c}, density n = 1 ÷ (|R_H| e) = {n} × 10²¹ m⁻³.', {
        's': s,
        'r': pm(rh.mean * 1e3, rh.se * 1e3),
        'c': rh.mean < 0 ? tr('electrons (n-type)') : tr('holes (p-type)'),
        'n': (n / 1e21).toStringAsFixed(2),
      }));
    }
    return out.isEmpty ? null : out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final slab = Rect.fromCenter(center: Offset(w * 0.42, h * 0.5), width: w * 0.36, height: h * 0.26);
    canvas.drawRect(slab, fill(const Color(0xFFB0BEC5)));
    canvas.drawRect(slab, stroke(LabInk.ink, 2));
    // Field into the page (crosses) between pole pieces.
    for (var x = slab.left + 20; x < slab.right; x += 40) {
      for (var y = slab.top + 18; y < slab.bottom; y += 34) {
        canvas.drawLine(Offset(x - 5, y - 5), Offset(x + 5, y + 5), stroke(LabInk.muted, 1.5));
        canvas.drawLine(Offset(x - 5, y + 5), Offset(x + 5, y - 5), stroke(LabInk.muted, 1.5));
      }
    }
    // Current from left to right, and the charges pushed to one edge.
    canvas.drawLine(Offset(slab.left - 60, slab.center.dy), slab.centerLeft, stroke(LabInk.ink, 3));
    canvas.drawLine(slab.centerRight, Offset(slab.right + 60, slab.center.dy), stroke(LabInk.ink, 3));
    arrowHead(canvas, slab.centerLeft, const Offset(1, 0), stroke(LabInk.ink, 3), size: 14);
    final v = hallMv(p);
    final top = v < 0 ? '−' : '+', bottom = v < 0 ? '+' : '−';
    for (var x = slab.left + 15; x < slab.right; x += 26) {
      label(canvas, top, Offset(x, slab.top + 10), size: 16, bold: true, color: v < 0 ? LabInk.blue : LabInk.red);
      label(canvas, bottom, Offset(x, slab.bottom - 10), size: 16, bold: true, color: v < 0 ? LabInk.red : LabInk.blue);
    }
    label(canvas, 'V_H = ${v.toStringAsFixed(2)} mV', Offset(slab.center.dx, slab.top - 28), size: 18, bold: true);
    label(canvas, 'I = ${pNum(p, 'i', 2).toStringAsFixed(1)} mA', Offset(slab.left - 50, slab.center.dy - 18), size: 14);
    label(canvas, 'B = ${pNum(p, 'b', 0.2).toStringAsFixed(1)} T ⊗', Offset(w * 0.82, h * 0.5), size: 16, bold: true);
  }
}

/// The B–H curve of a soft-iron ring (a simplified hysteresis model): drive
/// H up and down and trace the loop; read retentivity and coercivity.
class HysteresisBench extends LabBench {
  const HysteresisBench();

  static const step = 50.0, maxH = 600.0;

  @override
  String get kind => 'bh-curve';

  @override
  LabParams get defaults => {'h': maxH, 'branch': -1};

  @override
  List<LabControl> controls(LabParams p) => [
        const LabAction('down', '−H', Icons.remove),
        const LabAction('up', '+H', Icons.add, primary: true),
      ];

  /// Changing direction moves to the other branch of the loop.
  @override
  LabParams act(String action, LabParams p) {
    final h = pNum(p, 'h', maxH);
    if (action == 'up') return {...p, 'h': math.min(maxH, h + step), 'branch': 1};
    if (action == 'down') return {...p, 'h': math.max(-maxH, h - step), 'branch': -1};
    return p;
  }

  static double b(LabParams p) => Fields.hysteresis(pNum(p, 'h', maxH), pInt(p, 'branch', -1));

  @override
  List<LabColumn> get columns => [LabColumn('H (A/m)', 0), LabColumn('B (T)', 3), LabColumn(tr('Direction'))];

  @override
  LabReading read(LabParams p) => LabReading.row([pNum(p, 'h', maxH), _r(b(p), 1000), pInt(p, 'branch', -1) > 0 ? tr('Rising') : tr('Falling')]);

  @override
  List<String> live(LabParams p) => ['H = ${pNum(p, 'h', maxH).toStringAsFixed(0)} A/m', 'B = ${b(p).toStringAsFixed(3)} T'];

  @override
  LabGraph graph(LabParams p) => const LabGraph(0, 1, inOrder: true);

  @override
  String? result(List<List<Object>> rows) {
    final falling = [for (final r in rows) if (r[2] == tr('Falling')) r];
    if (falling.length < 3) return rows.isEmpty ? null : tr('Bring H down from +600 A/m through zero to −600 A/m, recording as you go.');
    double? cross(int x, int y, double at) {
      for (var k = 1; k < falling.length; k++) {
        final a = falling[k - 1], c = falling[k];
        final ya = (a[x] as num).toDouble(), yc = (c[x] as num).toDouble();
        if ((ya - at) * (yc - at) <= 0 && ya != yc) return (a[y] as num) + ((c[y] as num) - (a[y] as num)) * (at - ya) / (yc - ya);
      }
      return null;
    }

    final br = cross(0, 1, 0), hc = cross(1, 0, 0);
    if (br == null || hc == null) return tr('Keep going: the falling branch must cross both axes.');
    return tr('Retentivity (B left when H = 0) ≈ {b} T; coercivity (H needed to bring B to zero) ≈ {h} A/m. The area of the loop is the energy lost per cycle per unit volume.',
        {'b': br.toStringAsFixed(2), 'h': hc.abs().toStringAsFixed(0)});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final r = Rect.fromLTWH(w * 0.1, h * 0.08, w * 0.8, h * 0.82);
    final c = r.center;
    canvas.drawLine(Offset(r.left, c.dy), Offset(r.right, c.dy), stroke(LabInk.ink, 1.5));
    canvas.drawLine(Offset(c.dx, r.top), Offset(c.dx, r.bottom), stroke(LabInk.ink, 1.5));
    label(canvas, 'H', Offset(r.right - 10, c.dy + 14), size: 14, bold: true);
    label(canvas, 'B', Offset(c.dx + 14, r.top + 8), size: 14, bold: true);
    Offset map(double hh, double bb) => Offset(c.dx + hh / maxH * r.width / 2, c.dy - bb / 1.6 * r.height / 2);
    for (final branch in [1, -1]) {
      final path = Path();
      for (var k = 0; k <= 120; k++) {
        final hh = -maxH + 2 * maxH * k / 120;
        final q = map(hh, Fields.hysteresis(hh, branch));
        k == 0 ? path.moveTo(q.dx, q.dy) : path.lineTo(q.dx, q.dy);
      }
      canvas.drawPath(path, stroke(LabInk.blue.withValues(alpha: 0.25), 2));
    }
    final now = map(pNum(p, 'h', maxH), b(p));
    canvas.drawCircle(now, 7, fill(LabInk.accent));
    canvas.drawCircle(now, 7, stroke(LabInk.ink, 1.5));
    label(canvas, '(${pNum(p, 'h', maxH).toStringAsFixed(0)} A/m, ${b(p).toStringAsFixed(2)} T)', now + const Offset(0, -22), size: 14, bold: true, halo: LabInk.paper);
  }
}
