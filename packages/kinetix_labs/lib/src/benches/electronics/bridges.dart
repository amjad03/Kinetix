import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../core/i18n.dart';
import '../../engines/circuit.dart';
import 'schematic.dart';

/// The sliding contact (jockey) on a bridge or potentiometer wire.
void _jockey(Canvas canvas, Offset at, double s) {
  final path = Path()
    ..moveTo(at.dx, at.dy)
    ..lineTo(at.dx - s * 0.18, at.dy - s * 0.5)
    ..lineTo(at.dx + s * 0.18, at.dy - s * 0.5)
    ..close();
  canvas.drawPath(path, fill(const Color(0xFFC9A248)));
  canvas.drawPath(path, stroke(LabInk.ink, 1.5));
  canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: at - Offset(0, s * 0.75), width: s * 0.3, height: s * 0.5), const Radius.circular(4)), fill(LabInk.ink));
}

/// A metre scale under a wire from [a] to [b] marked every 10 cm of [cm].
void _scale(Canvas canvas, Offset a, Offset b, double cm) {
  canvas.drawRect(Rect.fromPoints(a + const Offset(0, 6), b + const Offset(0, 26)), fill(const Color(0xFFF3E3B5)));
  for (var k = 0; k <= cm; k += 10) {
    final x = a.dx + (b.dx - a.dx) * k / cm;
    canvas.drawLine(Offset(x, a.dy + 6), Offset(x, a.dy + (k % 50 == 0 ? 20 : 14)), stroke(LabInk.ink, 1));
    if (k % 50 == 0) label(canvas, '$k', Offset(x, a.dy + 32), size: 11, color: LabInk.muted);
  }
}

/// Unknown wires for the metre bridge: length (m), diameter (mm) and the
/// accepted resistivity (Ω m).
const bridgeWires = <String, (double, double, double)>{
  'constantan': (0.5, 0.4, 4.9e-7),
  'manganin': (1.0, 0.5, 4.4e-7),
  'nichrome': (0.5, 0.5, 1.1e-6),
};

String wireName(String w) => switch (w) {
      'manganin' => tr('Manganin'),
      'nichrome' => tr('Nichrome'),
      _ => tr('Constantan'),
    };

/// Resistance of a wire: ρL ÷ (πd²/4).
double wireOhms(String w) {
  final (l, d, rho) = bridgeWires[w]!;
  return rho * l / (math.pi * math.pow(d * 1e-3 / 2, 2));
}

/// Metre bridge (slide-wire Wheatstone bridge): the unknown resistance X in
/// the right gap balances a known R when R ÷ X = l ÷ (100 − l).
class MeterBridgeBench extends LabBench {
  const MeterBridgeBench();

  static const wireOhmsTotal = 1.0, galvOhms = 50.0;

  @override
  String get kind => 'meter-bridge';

  @override
  LabParams get defaults => {'wire': 'constantan', 'r': 2.0, 'l': 30.0, 'on': false};

  @override
  LabParams get preview => {...defaults, 'on': true, 'l': 50.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('wire', tr('Unknown wire'), [for (final w in bridgeWires.keys) (w, wireName(w))]),
        LabChoice('r', tr('Resistance box'), [for (final r in [1.0, 2.0, 3.0, 4.0, 5.0]) (r, '${r.toStringAsFixed(0)} Ω')]),
        LabSlider('l', tr('Jockey'), 1, 99, divisions: 980, unit: ' cm', decimals: 1),
        LabToggle('on', tr('Key in')),
      ];

  static double balance(LabParams p) {
    final r = pNum(p, 'r', 2), x = wireOhms(pStr(p, 'wire', 'constantan'));
    return 100 * r / (r + x);
  }

  /// Galvanometer current (A) from B (between the gaps) to the jockey.
  static double galvanometer(LabParams p) {
    if (!pBool(p, 'on')) return 0;
    final l = pNum(p, 'l', 30).clamp(0.5, 99.5);
    final c = Circuit()
      ..add(VSource('E', 'e', '0', 2))
      ..add(Resistor('Rh', 'e', 'A', 2.5))
      ..add(Resistor('R', 'A', 'B', pNum(p, 'r', 2)))
      ..add(Resistor('X', 'B', 'C', wireOhms(pStr(p, 'wire', 'constantan'))))
      ..add(Resistor('AD', 'A', 'D', wireOhmsTotal * l / 100))
      ..add(Resistor('DC', 'D', 'C', wireOhmsTotal * (100 - l) / 100))
      ..add(Resistor('C0', 'C', '0', 1e-3))
      ..add(Resistor('G', 'B', 'D', galvOhms));
    return c.dc().i('G');
  }

  static double deflection(LabParams p) => (galvanometer(p) / 2e-4).clamp(-1.0, 1.0);

  @override
  List<LabColumn> get columns => [LabColumn(tr('Wire')), LabColumn('R (Ω)', 1), LabColumn('l (cm)', 1), LabColumn('100 − l (cm)', 1), LabColumn('X (Ω)', 3)];

  @override
  LabReading read(LabParams p) {
    if (!pBool(p, 'on')) return LabReading.not(tr('Put the key in to take a reading.'));
    if ((pNum(p, 'l', 30) - balance(p)).abs() > 0.25) return LabReading.not(tr('The galvanometer still deflects: slide the jockey to the null point.'));
    final l = pNum(p, 'l', 30), r = pNum(p, 'r', 2);
    return LabReading.row([wireName(pStr(p, 'wire', 'constantan')), r, l, 100 - l, (r * (100 - l) / l * 1000).round() / 1000]);
  }

  @override
  List<String> live(LabParams p) => [
        if (!pBool(p, 'on')) tr('Key out: no current') else 'Ig = ${(galvanometer(p) * 1e6).toStringAsFixed(1)} µA',
        'l = ${pNum(p, 'l', 30).toStringAsFixed(1)} cm',
      ];

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final out = <String>[];
    for (final w in bridgeWires.keys) {
      final xs = [for (final r in rows) if (r[0] == wireName(w)) (r[4] as num).toDouble()];
      if (xs.isEmpty) continue;
      final m = meanSe(xs);
      final (len, d, rho) = bridgeWires[w]!;
      final area = math.pi * math.pow(d * 1e-3 / 2, 2);
      final got = m.mean * area / len;
      out.add(tr('{w}: X = {x} Ω, so ρ = Xπr² ÷ L = {r} × 10⁻⁷ Ω m (L = {l} m, d = {d} mm; table value {t} × 10⁻⁷).', {
        'w': wireName(w),
        'x': pm(m.mean, m.se),
        'r': pm(got * 1e7, m.se * area / len * 1e7),
        'l': len.toStringAsFixed(1),
        'd': d.toStringAsFixed(1),
        't': (rho * 1e7).toStringAsFixed(1),
      }));
    }
    return out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final a = Offset(w * 0.1, h * 0.72), b = Offset(w * 0.9, h * 0.72);
    final l = pNum(p, 'l', 30);
    // Thick copper strips with the two gaps.
    final strip = stroke(const Color(0xFFB87333), 10);
    final gapL = Offset(w * 0.32, h * 0.32), gapR = Offset(w * 0.68, h * 0.32), mid = Offset(w * 0.5, h * 0.32);
    canvas.drawLine(a, Offset(a.dx, gapL.dy), strip);
    canvas.drawLine(Offset(a.dx, gapL.dy), gapL - Offset(w * 0.05, 0), strip);
    canvas.drawLine(gapL + Offset(w * 0.05, 0), gapR - Offset(w * 0.05, 0), strip);
    canvas.drawLine(gapR + Offset(w * 0.05, 0), Offset(b.dx, gapR.dy), strip);
    canvas.drawLine(Offset(b.dx, gapR.dy), b, strip);
    // The resistance box and the unknown wire in the gaps.
    final box = Rect.fromCenter(center: gapL - Offset(0, h * 0.04), width: w * 0.12, height: h * 0.1);
    canvas.drawRect(box, fill(const Color(0xFF3B2F25)));
    label(canvas, 'R = ${pNum(p, 'r', 2).toStringAsFixed(0)} Ω', box.center, size: 14, color: Colors.white, bold: true);
    canvas.drawLine(gapL - Offset(w * 0.05, 0), box.centerLeft, stroke(LabInk.wire, 2));
    canvas.drawLine(gapL + Offset(w * 0.05, 0), box.centerRight, stroke(LabInk.wire, 2));
    zigzag(canvas, gapR - Offset(w * 0.05, 0), gapR + Offset(w * 0.05, 0), stroke(LabInk.red, 2.5), peaks: 7, amp: 7);
    label(canvas, 'X (${wireName(pStr(p, 'wire', 'constantan'))})', gapR - Offset(0, h * 0.07), size: 14, bold: true);
    // The wire and its scale.
    canvas.drawLine(a, b, stroke(const Color(0xFF6D6D6D), 2.5));
    _scale(canvas, a, b, 100);
    final d = Offset(a.dx + (b.dx - a.dx) * l / 100, a.dy);
    // Galvanometer from the middle strip to the jockey.
    final g = Offset(mid.dx, h * 0.5);
    canvas.drawLine(mid, g - Offset(0, 22), stroke(LabInk.wire, 2));
    canvas.drawLine(g + Offset(0, 22), d - Offset(0, 30), stroke(LabInk.wire, 2));
    Schematic(canvas, Rect.fromCenter(center: g, width: 50, height: 50), cols: 1, rows: 1).galvanometer(0.5, 0.5, deflection(p));
    _jockey(canvas, d, 44);
    // Cell and key across the ends.
    final cellY = h * 0.1;
    canvas.drawLine(Offset(a.dx, gapL.dy), Offset(a.dx, cellY), stroke(LabInk.wire, 2));
    canvas.drawLine(Offset(b.dx, gapR.dy), Offset(b.dx, cellY), stroke(LabInk.wire, 2));
    final cellX = w * 0.42;
    canvas.drawLine(Offset(a.dx, cellY), Offset(cellX - 6, cellY), stroke(LabInk.wire, 2));
    canvas.drawLine(Offset(cellX - 6, cellY - 14), Offset(cellX - 6, cellY + 14), stroke(LabInk.ink, 2));
    canvas.drawLine(Offset(cellX + 4, cellY - 8), Offset(cellX + 4, cellY + 8), stroke(LabInk.ink, 5));
    final on = pBool(p, 'on');
    final keyX = w * 0.6;
    canvas.drawLine(Offset(cellX + 4, cellY), Offset(keyX - 14, cellY), stroke(LabInk.wire, 2));
    canvas.drawLine(Offset(keyX + 14, cellY), Offset(b.dx, cellY), stroke(LabInk.wire, 2));
    canvas.drawRect(Rect.fromCenter(center: Offset(keyX - 8, cellY), width: 14, height: 14), fill(const Color(0xFFC9A248)));
    canvas.drawRect(Rect.fromCenter(center: Offset(keyX + 8, cellY), width: 14, height: 14), fill(const Color(0xFFC9A248)));
    if (on) canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(keyX, cellY - 10), width: 10, height: 18), const Radius.circular(3)), fill(LabInk.ink));
    label(canvas, 'A', a + const Offset(-14, 0), size: 15, bold: true);
    label(canvas, 'C', b + const Offset(14, 0), size: 15, bold: true);
    label(canvas, 'D', d + const Offset(0, 48), size: 15, bold: true, color: LabInk.red);
    label(canvas, 'l = ${l.toStringAsFixed(1)} cm', Offset(d.dx, h * 0.94), size: 15, bold: true);
  }
}

/// Potentiometer: compare the EMFs of two cells (setup task 'compare'), or
/// find a cell's internal resistance (task 'internal'). The null point is
/// where the cell's EMF (or terminal voltage) equals the fall of potential
/// along the wire.
class PotentiometerBench extends LabBench {
  const PotentiometerBench();

  static const lengthCm = 400.0, ohmsPerCm = 0.01, driver = 4.0, galvOhms = 50.0;

  /// The two cells: EMF (V) and internal resistance (Ω).
  static const cells = <String, (double, double)>{'leclanche': (1.50, 1.2), 'daniell': (1.08, 1.5)};

  @override
  String get kind => 'potentiometer';

  @override
  LabParams get defaults => {'task': 'compare', 'cell': 'leclanche', 'rh': 2.0, 'k2': false, 'rbox': 5.0, 'l': 100.0, 'on': false};

  @override
  LabParams get preview => {...defaults, 'on': true, 'l': 200.0};

  static String cellName(String c) => c == 'daniell' ? tr('Daniell cell') : tr('Leclanché cell');

  @override
  List<LabControl> controls(LabParams p) => [
        if (pStr(p, 'task') == 'compare')
          LabChoice('cell', tr('Cell'), [for (final c in cells.keys) (c, cellName(c))])
        else ...[
          LabChoice('rbox', tr('Resistance box'), [(2.0, '2 Ω'), (5.0, '5 Ω'), (10.0, '10 Ω')]),
          LabToggle('k2', tr('Key K₂ (R across the cell)')),
        ],
        LabSlider('rh', tr('Rheostat'), 0, 10, divisions: 100, unit: ' Ω', decimals: 1),
        LabSlider('l', tr('Jockey'), 0, lengthCm, divisions: 1600, unit: ' cm', decimals: 2),
        LabToggle('on', tr('Key in')),
      ];

  /// Fall of potential per centimetre of wire (V/cm).
  static double gradient(LabParams p) => driver / (0.1 + pNum(p, 'rh', 2) + lengthCm * ohmsPerCm) * ohmsPerCm;

  static String cellOf(LabParams p) => pStr(p, 'task') == 'compare' ? pStr(p, 'cell', 'leclanche') : 'leclanche';

  /// Voltage the cell balances: its EMF, or with K₂ closed its terminal voltage ER ÷ (R + r).
  static double balanced(LabParams p) {
    final (e, r) = cells[cellOf(p)]!;
    if (pStr(p, 'task') == 'internal' && pBool(p, 'k2')) return e * pNum(p, 'rbox', 5) / (pNum(p, 'rbox', 5) + r);
    return e;
  }

  static double nullPoint(LabParams p) => balanced(p) / gradient(p);

  static double galvanometer(LabParams p) {
    if (!pBool(p, 'on')) return 0;
    final l = pNum(p, 'l', 100).clamp(0.01, lengthCm - 0.01);
    final (e, r) = cells[cellOf(p)]!;
    final c = Circuit()
      ..add(VSource('D', 'd', '0', driver))
      ..add(Resistor('Rd', 'd', 'A', 0.1 + pNum(p, 'rh', 2)))
      ..add(Resistor('AJ', 'A', 'J', l * ohmsPerCm))
      ..add(Resistor('JB', 'J', '0', (lengthCm - l) * ohmsPerCm))
      // The cell: + to A, − through its internal resistance and the galvanometer to the jockey.
      ..add(VSource('E', 'A', 'm', e))
      ..add(Resistor('r', 'm', 'n', r))
      ..add(Resistor('G', 'n', 'J', galvOhms));
    if (pStr(p, 'task') == 'internal' && pBool(p, 'k2')) c.add(Resistor('R', 'A', 'n', pNum(p, 'rbox', 5)));
    return c.dc().i('G');
  }

  @override
  List<LabColumn> get columns => [LabColumn(tr('Cell')), LabColumn(tr('K₂')), LabColumn('R (Ω)', 0), LabColumn('l (cm)', 1)];

  @override
  LabReading read(LabParams p) {
    if (!pBool(p, 'on')) return LabReading.not(tr('Put the key in to take a reading.'));
    final n = nullPoint(p);
    if (n > lengthCm) return LabReading.not(tr('No null point on the wire: lower the rheostat so the wire carries more current.'));
    if ((pNum(p, 'l', 100) - n).abs() > 0.5) return LabReading.not(tr('The galvanometer still deflects: slide the jockey to the null point.'));
    final internal = pStr(p, 'task') == 'internal';
    return LabReading.row([
      cellName(cellOf(p)),
      internal ? (pBool(p, 'k2') ? tr('Closed') : tr('Open')) : '—',
      internal && pBool(p, 'k2') ? pNum(p, 'rbox', 5) : 0.0,
      (pNum(p, 'l', 100) * 10).round() / 10,
    ]);
  }

  @override
  List<String> live(LabParams p) => [
        if (!pBool(p, 'on')) tr('Key out: no current') else 'Ig = ${(galvanometer(p) * 1e6).toStringAsFixed(1)} µA',
        'k = ${(gradient(p) * 100).toStringAsFixed(4)} V/m',
      ];

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    double? mean(bool Function(List<Object>) f) {
      final xs = [for (final r in rows) if (f(r)) (r[3] as num).toDouble()];
      return xs.isEmpty ? null : xs.reduce((a, b) => a + b) / xs.length;
    }

    final internal = rows.any((r) => r[1] != '—');
    if (!internal) {
      final l1 = mean((r) => r[0] == cellName('leclanche')), l2 = mean((r) => r[0] == cellName('daniell'));
      if (l1 == null || l2 == null) return tr('Find the null point for both cells.');
      return tr('E₁ ÷ E₂ = l₁ ÷ l₂ = {a} ÷ {b} = {r} (from the cells’ EMFs: 1.39).', {'a': l1.toStringAsFixed(1), 'b': l2.toStringAsFixed(1), 'r': (l1 / l2).toStringAsFixed(3)});
    }
    final l1 = mean((r) => r[1] == tr('Open'));
    if (l1 == null) return tr('First find the null point with K₂ open (l₁).');
    final rs = [
      for (final r in rows)
        if (r[1] == tr('Closed')) (r[2] as num) * (l1 - (r[3] as num)) / (r[3] as num),
    ];
    if (rs.isEmpty) return tr('Now close K₂ and find the null point again (l₂).');
    final m = meanSe([for (final x in rs) x.toDouble()]);
    return tr('Internal resistance r = R(l₁ − l₂) ÷ l₂ = {r} Ω.', {'r': pm(m.mean, m.se)});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    // The 4 m wire drawn as one long wire with its scale.
    final a = Offset(w * 0.08, h * 0.66), b = Offset(w * 0.92, h * 0.66);
    canvas.drawLine(a, b, stroke(const Color(0xFF6D6D6D), 2.5));
    _scale(canvas, a, b, lengthCm);
    final l = pNum(p, 'l', 100);
    final j = Offset(a.dx + (b.dx - a.dx) * l / lengthCm, a.dy);
    _jockey(canvas, j, 40);
    // Driver battery and rheostat above.
    final top = h * 0.1;
    canvas.drawLine(a, Offset(a.dx, top), stroke(LabInk.wire, 2));
    canvas.drawLine(b, Offset(b.dx, top), stroke(LabInk.wire, 2));
    final sch = Schematic(canvas, Rect.fromLTWH(a.dx, top - 30, b.dx - a.dx, 60), cols: 10, rows: 1);
    sch.cell(0, 0.5, 2.4, 0.5, '4 V', 2);
    sch.wire([(2.4, 0.5), (4, 0.5)]);
    sch.key(4, 0.5, 5, 0.5, closed: pBool(p, 'on'), name: 'K₁');
    sch.wire([(5, 0.5), (6.6, 0.5)]);
    sch.rheostat(6.6, 0.5, 8.4, 0.5, 'Rh ${pNum(p, 'rh', 2).toStringAsFixed(1)} Ω');
    sch.wire([(8.4, 0.5), (10, 0.5)]);
    // The cell under test, galvanometer to the jockey.
    final cy = h * 0.36;
    final cellName0 = cellName(cellOf(p));
    canvas.drawLine(Offset(a.dx, cy), Offset(w * 0.22, cy), stroke(LabInk.wire, 2));
    final cs = Schematic(canvas, Rect.fromLTWH(w * 0.22, cy - 30, w * 0.22, 60), cols: 4, rows: 1);
    cs.cell(0, 0.5, 1.4, 0.5, cellName0);
    cs.wire([(1.4, 0.5), (2.4, 0.5)]);
    final gx = w * 0.22 + w * 0.22 * 3 / 4;
    Schematic(canvas, Rect.fromCenter(center: Offset(gx, cy), width: 50, height: 50), cols: 1, rows: 1).galvanometer(0.5, 0.5, (galvanometer(p) / 1e-4).clamp(-1.0, 1.0));
    canvas.drawLine(Offset(gx + 22, cy), Offset(j.dx, cy), stroke(LabInk.wire, 2));
    canvas.drawLine(Offset(j.dx, cy), j - const Offset(0, 50), stroke(LabInk.wire, 2));
    if (pStr(p, 'task') == 'internal') {
      canvas.drawLine(Offset(w * 0.22, cy), Offset(w * 0.22, cy + h * 0.12), stroke(LabInk.wire, 2));
      final rs = Schematic(canvas, Rect.fromLTWH(w * 0.22, cy + h * 0.12 - 30, w * 0.2, 60), cols: 4, rows: 1);
      rs.resistor(0, 0.5, 2, 0.5, 'R ${pNum(p, 'rbox', 5).toStringAsFixed(0)} Ω');
      rs.key(2, 0.5, 3, 0.5, closed: pBool(p, 'k2'), name: 'K₂');
      canvas.drawLine(Offset(w * 0.22 + w * 0.2 * 3 / 4, cy + h * 0.12), Offset(w * 0.22 + w * 0.2 * 3 / 4, cy), stroke(LabInk.wire, 2));
    }
    label(canvas, 'l = ${l.toStringAsFixed(1)} cm', Offset(j.dx, h * 0.93), size: 15, bold: true);
  }
}
