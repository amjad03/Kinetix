import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// Ohm's law: cells, key, rheostat, ammeter and resistor in series, with a
/// voltmeter across the resistor.
class OhmBench extends LabBench {
  const OhmBench();

  static const cellVolts = 1.5;
  static const cellResistance = 0.1; // ohms, each cell
  static const rheostatMax = 20.0; // ohms

  @override
  String get kind => 'ohm';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'cells': 2, 'r': 5.0, 'rheo': 0.5, 'on': false};

  @override
  LabParams get preview => {...defaults, 'on': true};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('cells', tr('Cells'), [for (var n = 1; n <= 4; n++) (n, '$n × 1.5 V')]),
        LabChoice('r', tr('Resistor'), [(2.0, '2 Ω'), (5.0, '5 Ω'), (10.0, '10 Ω')]),
        LabSlider('rheo', tr('Rheostat'), 0, 1, unit: '', decimals: 2),
        LabToggle('on', tr('Key in')),
      ];

  /// Current through the circuit and the voltmeter reading, both rounded as
  /// the meters show them.
  static (double v, double i) readings(LabParams p) {
    if (!pBool(p, 'on')) return (0, 0);
    final cells = pInt(p, 'cells', 2);
    final e = cells * cellVolts;
    final r = pNum(p, 'r', 5);
    final total = r + pNum(p, 'rheo', 0.5) * rheostatMax + cells * cellResistance;
    final i = e / total;
    // The ammeter reads to a milliampere, the voltmeter to 0.01 V.
    return (_round(i * r, 100), _round(i, 1000));
  }

  static double _round(double v, int k) => (v * k).round() / k;

  @override
  List<LabColumn> get columns => [
        LabColumn(tr('V (volt)')),
        LabColumn(tr('I (ampere)'), 3),
        LabColumn(tr('V ÷ I (ohm)')),
      ];

  @override
  LabReading read(LabParams p) {
    if (!pBool(p, 'on')) return LabReading.not(tr('Put the key in to take a reading.'));
    final (v, i) = readings(p);
    if (i <= 0) return LabReading.not(tr('No current is flowing.'));
    return LabReading.row([v, i, _round(v / i, 100)]);
  }

  @override
  List<String> live(LabParams p) {
    if (!pBool(p, 'on')) return [tr('Key out: no current')];
    final (v, i) = readings(p);
    return ['V = ${v.toStringAsFixed(2)} V', 'I = ${i.toStringAsFixed(3)} A'];
  }

  @override
  LabGraph graph(LabParams p) => const LabGraph(1, 0, throughOrigin: true);

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final rs = [for (final r in rows) (r[2] as num).toDouble()];
    final mean = rs.reduce((a, b) => a + b) / rs.length;
    final k = LabGraph.slope([for (final r in rows) Offset((r[1] as num).toDouble(), (r[0] as num).toDouble())]);
    return tr('Average V ÷ I = {r} Ω from {n} readings; slope of the V–I graph = {k} Ω. V ÷ I stays the same, so V is proportional to I.',
        {'r': mean.toStringAsFixed(2), 'n': rows.length, 'k': (k ?? mean).toStringAsFixed(2)});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final on = pBool(p, 'on');
    final (v, i) = readings(p);
    final cells = pInt(p, 'cells', 2);
    final wire = stroke(LabInk.wire, 3);
    final left = w * 0.1, right = w * 0.9, top = h * 0.16, bottom = h * 0.6;
    final s = math.min(w, h);

    // The loop: battery, key and ammeter on top; rheostat on the left;
    // resistor at the bottom; the voltmeter hangs below the resistor.
    final batX = w * 0.3, keyX = w * 0.54, amX = w * 0.76;
    final resA = Offset(w * 0.4, bottom), resB = Offset(w * 0.6, bottom);
    final rhA = Offset(left, top + (bottom - top) * 0.25), rhB = Offset(left, top + (bottom - top) * 0.78);
    final ar = s * 0.075;
    final batW = 14.0 * cells + 8;

    // Wires.
    canvas.drawLine(Offset(left, top), Offset(batX - batW / 2, top), wire);
    canvas.drawLine(Offset(batX + batW / 2, top), Offset(keyX - 22, top), wire);
    canvas.drawLine(Offset(keyX + 22, top), Offset(amX - ar, top), wire);
    canvas.drawLine(Offset(amX + ar, top), Offset(right, top), wire);
    canvas.drawLine(Offset(right, top), Offset(right, bottom), wire);
    canvas.drawLine(Offset(right, bottom), resB, wire);
    canvas.drawLine(resA, Offset(left, bottom), wire);
    canvas.drawLine(Offset(left, bottom), rhB, wire);
    canvas.drawLine(rhA, Offset(left, top), wire);

    // Battery: long thin (+) and short thick (−) plates for each cell.
    for (var c = 0; c < cells; c++) {
      final x = batX - batW / 2 + 4 + c * 14.0;
      canvas.drawLine(Offset(x, top - 18), Offset(x, top + 18), stroke(LabInk.ink, 2));
      canvas.drawLine(Offset(x + 7, top - 9), Offset(x + 7, top + 9), stroke(LabInk.ink, 5));
    }
    label(canvas, '+', Offset(batX - batW / 2 - 2, top - 26), size: 14, bold: true);
    label(canvas, '${(cells * OhmBench.cellVolts).toStringAsFixed(1)} V', Offset(batX, top - 34), size: 13, color: LabInk.muted);
    label(canvas, tr('Battery'), Offset(batX, top + 32), size: 13, color: LabInk.muted);

    // Plug key: two brass blocks, the plug drawn in when the key is in.
    final kL = Rect.fromCenter(center: Offset(keyX - 11, top), width: 18, height: 18);
    final kR = Rect.fromCenter(center: Offset(keyX + 11, top), width: 18, height: 18);
    canvas.drawRect(kL, fill(const Color(0xFFC9A248)));
    canvas.drawRect(kR, fill(const Color(0xFFC9A248)));
    canvas.drawRect(kL, stroke(LabInk.ink, 1.5));
    canvas.drawRect(kR, stroke(LabInk.ink, 1.5));
    if (on) {
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(keyX, top - 12), width: 12, height: 22), const Radius.circular(3)), fill(LabInk.ink));
    } else {
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(keyX + 30, top - 30), width: 12, height: 22), const Radius.circular(3)), fill(LabInk.muted));
    }
    label(canvas, tr('Key'), Offset(keyX, top + 32), size: 13, color: LabInk.muted);

    // Ammeter.
    meter(canvas, Offset(amX, top), ar, 'A', i, 3, '${i.toStringAsFixed(3)} A');

    // Rheostat: a resistor with a sliding contact.
    zigzag(canvas, rhA, rhB, stroke(LabInk.ink, 2.5), peaks: 5, amp: 9);
    final slide = pNum(p, 'rheo', 0.5);
    final contact = Offset(left, rhA.dy + (rhB.dy - rhA.dy) * (1 - slide));
    canvas.drawLine(contact + const Offset(30, 0), contact + const Offset(6, 0), stroke(LabInk.red, 2.5));
    arrowHead(canvas, contact + const Offset(4, 0), const Offset(-1, 0), stroke(LabInk.red, 2));
    label(canvas, tr('Rheostat'), Offset(left + 44, (rhA.dy + rhB.dy) / 2), size: 13, color: LabInk.muted, centre: false);

    // Resistor.
    zigzag(canvas, resA, resB, stroke(LabInk.ink, 3), peaks: 6, amp: 10);
    label(canvas, '${_fmt(pNum(p, 'r', 5))} Ω', (resA + resB) / 2 - const Offset(0, 24), size: 15, bold: true);

    // Voltmeter across the resistor.
    final vc = Offset(w * 0.5, h * 0.82);
    final vr = s * 0.07;
    final thin = stroke(LabInk.wire, 2);
    canvas.drawLine(resA, Offset(resA.dx, vc.dy), thin);
    canvas.drawLine(Offset(resA.dx, vc.dy), Offset(vc.dx - vr, vc.dy), thin);
    canvas.drawLine(resB, Offset(resB.dx, vc.dy), thin);
    canvas.drawLine(Offset(resB.dx, vc.dy), Offset(vc.dx + vr, vc.dy), thin);
    canvas.drawCircle(resA, 4, fill(LabInk.ink));
    canvas.drawCircle(resB, 4, fill(LabInk.ink));
    meter(canvas, vc, vr, 'V', v, cells * OhmBench.cellVolts, '${v.toStringAsFixed(2)} V');

    // Moving charges show the current (conventional: + to −, clockwise here).
    if (on && i > 0) {
      final loop = [
        Offset(batX + batW / 2, top), Offset(right, top), Offset(right, bottom), Offset(left, bottom), Offset(left, top), Offset(batX - batW / 2, top),
      ];
      final lengths = [for (var k = 0; k < loop.length - 1; k++) (loop[k + 1] - loop[k]).distance];
      final total = lengths.reduce((a, b) => a + b);
      const gap = 36.0;
      final shift = (t * 50 * math.min(i, 3) / 1.0) % gap;
      for (var d = shift; d < total; d += gap) {
        var rem = d;
        for (var k = 0; k < lengths.length; k++) {
          if (rem <= lengths[k]) {
            final pt = Offset.lerp(loop[k], loop[k + 1], rem / lengths[k])!;
            canvas.drawCircle(pt, 3.2, fill(LabInk.accent));
            break;
          }
          rem -= lengths[k];
        }
      }
    }
  }

  static String _fmt(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1);
}
