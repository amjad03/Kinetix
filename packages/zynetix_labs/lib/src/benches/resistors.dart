import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// Two resistors in series or in parallel, with an ammeter in the circuit
/// and a voltmeter across the combination. The battery is ideal (3 V).
class ResistorsBench extends LabBench {
  const ResistorsBench();

  static const volts = 3.0;

  @override
  String get kind => 'resistors';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'r1': 4.0, 'r2': 12.0, 'mode': 'series', 'on': true};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('mode', tr('Connection'), [('series', tr('Series')), ('parallel', tr('Parallel'))]),
        const LabSlider('r1', 'R1', 1, 20, divisions: 19, unit: ' Ω'),
        const LabSlider('r2', 'R2', 1, 20, divisions: 19, unit: ' Ω'),
        LabToggle('on', tr('Key in')),
      ];

  static bool _series(LabParams p) => pStr(p, 'mode', 'series') != 'parallel';

  /// The combination's resistance by the formula.
  static double expected(LabParams p) {
    final r1 = pNum(p, 'r1', 4), r2 = pNum(p, 'r2', 12);
    return _series(p) ? r1 + r2 : r1 * r2 / (r1 + r2);
  }

  static (double v, double i) readings(LabParams p) {
    if (!pBool(p, 'on')) return (0, 0);
    final i = volts / expected(p);
    return ((volts * 100).round() / 100, (i * 1000).round() / 1000);
  }

  @override
  List<LabColumn> get columns => [
        LabColumn(tr('Connection')),
        const LabColumn('R1 (Ω)', 0),
        const LabColumn('R2 (Ω)', 0),
        LabColumn(tr('V (volt)')),
        LabColumn(tr('I (ampere)'), 3),
        LabColumn(tr('V ÷ I (ohm)')),
        LabColumn(tr('By formula (ohm)')),
      ];

  @override
  LabReading read(LabParams p) {
    if (!pBool(p, 'on')) return LabReading.not(tr('Put the key in to take a reading.'));
    final (v, i) = readings(p);
    return LabReading.row([
      _series(p) ? tr('Series') : tr('Parallel'),
      pNum(p, 'r1', 4).round(),
      pNum(p, 'r2', 12).round(),
      v,
      i,
      (v / i * 100).round() / 100,
      (expected(p) * 100).round() / 100,
    ]);
  }

  @override
  List<String> live(LabParams p) {
    if (!pBool(p, 'on')) return [tr('Key out: no current')];
    final (v, i) = readings(p);
    return ['V = ${v.toStringAsFixed(2)} V', 'I = ${i.toStringAsFixed(3)} A', 'V ÷ I = ${(v / i).toStringAsFixed(2)} Ω'];
  }

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final lines = <String>[];
    for (final kind in [tr('Series'), tr('Parallel')]) {
      final last = rows.lastWhere((r) => r[0] == kind, orElse: () => const []);
      if (last.isEmpty) continue;
      lines.add(tr('{kind}: measured {m} Ω, formula gives {f} Ω.', {'kind': kind, 'm': (last[5] as num).toStringAsFixed(2), 'f': (last[6] as num).toStringAsFixed(2)}));
    }
    return lines.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final on = pBool(p, 'on');
    final series = _series(p);
    final (v, i) = readings(p);
    final wire = stroke(LabInk.wire, 3);
    final s = math.min(w, h);
    final left = w * 0.1, right = w * 0.9, top = h * 0.16, bottom = h * 0.56;
    final batX = w * 0.28, keyX = w * 0.52, amX = w * 0.76;
    final ar = s * 0.075;

    canvas.drawLine(Offset(left, top), Offset(batX - 16, top), wire);
    canvas.drawLine(Offset(batX + 16, top), Offset(keyX - 22, top), wire);
    canvas.drawLine(Offset(keyX + 22, top), Offset(amX - ar, top), wire);
    canvas.drawLine(Offset(amX + ar, top), Offset(right, top), wire);
    canvas.drawLine(Offset(right, top), Offset(right, bottom), wire);
    canvas.drawLine(Offset(left, bottom), Offset(left, top), wire);

    // Battery (two cells, 3 V).
    for (var c = 0; c < 2; c++) {
      final x = batX - 10 + c * 14.0;
      canvas.drawLine(Offset(x, top - 18), Offset(x, top + 18), stroke(LabInk.ink, 2));
      canvas.drawLine(Offset(x + 7, top - 9), Offset(x + 7, top + 9), stroke(LabInk.ink, 5));
    }
    label(canvas, '3 V', Offset(batX, top - 32), size: 13, color: LabInk.muted);

    // Key.
    for (final dx in [-11.0, 11.0]) {
      final r = Rect.fromCenter(center: Offset(keyX + dx, top), width: 18, height: 18);
      canvas.drawRect(r, fill(const Color(0xFFC9A248)));
      canvas.drawRect(r, stroke(LabInk.ink, 1.5));
    }
    if (on) {
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(keyX, top - 12), width: 12, height: 22), const Radius.circular(3)), fill(LabInk.ink));
    }
    meter(canvas, Offset(amX, top), ar, 'A', i, 3, '${i.toStringAsFixed(3)} A');

    // The two resistors between junctions J1 and J2 on the bottom wire.
    final j1 = Offset(w * 0.28, bottom), j2 = Offset(w * 0.72, bottom);
    canvas.drawLine(Offset(right, bottom), j2, wire);
    canvas.drawLine(j1, Offset(left, bottom), wire);
    final r1 = pNum(p, 'r1', 4), r2 = pNum(p, 'r2', 12);
    final zig = stroke(LabInk.ink, 3);
    if (series) {
      final mid = (j1 + j2) / 2;
      zigzag(canvas, j1, mid - const Offset(8, 0), zig, peaks: 4);
      zigzag(canvas, mid + const Offset(8, 0), j2, zig, peaks: 4);
      canvas.drawLine(mid - const Offset(8, 0), mid + const Offset(8, 0), wire);
      label(canvas, 'R1 = ${r1.round()} Ω', Offset((j1.dx + mid.dx) / 2, bottom - 26), size: 15, bold: true);
      label(canvas, 'R2 = ${r2.round()} Ω', Offset((j2.dx + mid.dx) / 2, bottom - 26), size: 15, bold: true);
    } else {
      final gap = h * 0.09;
      final a1 = j1 + Offset(0, -gap), b1 = j2 + Offset(0, -gap);
      final a2 = j1 + Offset(0, gap), b2 = j2 + Offset(0, gap);
      canvas.drawLine(a1, a2, wire);
      canvas.drawLine(b1, b2, wire);
      zigzag(canvas, a1 + const Offset(24, 0), b1 - const Offset(24, 0), zig, peaks: 5);
      zigzag(canvas, a2 + const Offset(24, 0), b2 - const Offset(24, 0), zig, peaks: 5);
      canvas.drawLine(a1, a1 + const Offset(24, 0), wire);
      canvas.drawLine(b1 - const Offset(24, 0), b1, wire);
      canvas.drawLine(a2, a2 + const Offset(24, 0), wire);
      canvas.drawLine(b2 - const Offset(24, 0), b2, wire);
      label(canvas, 'R1 = ${r1.round()} Ω', Offset(w * 0.5, a1.dy - 22), size: 15, bold: true);
      label(canvas, 'R2 = ${r2.round()} Ω', Offset(w * 0.5, a2.dy + 22), size: 15, bold: true);
    }
    canvas.drawCircle(j1, 4.5, fill(LabInk.ink));
    canvas.drawCircle(j2, 4.5, fill(LabInk.ink));
    label(canvas, series ? tr('Series') : tr('Parallel'), Offset(w * 0.5, top + (bottom - top) * 0.45), size: 17, bold: true, color: LabInk.blue);

    // Voltmeter across the whole combination.
    final vc = Offset(w * 0.5, h * 0.86), vr = s * 0.065;
    final thin = stroke(LabInk.wire, 2);
    final lowJ1 = Offset(j1.dx - 18, bottom), lowJ2 = Offset(j2.dx + 18, bottom);
    canvas.drawLine(lowJ1, Offset(lowJ1.dx, vc.dy), thin);
    canvas.drawLine(Offset(lowJ1.dx, vc.dy), Offset(vc.dx - vr, vc.dy), thin);
    canvas.drawLine(lowJ2, Offset(lowJ2.dx, vc.dy), thin);
    canvas.drawLine(Offset(lowJ2.dx, vc.dy), Offset(vc.dx + vr, vc.dy), thin);
    canvas.drawCircle(lowJ1, 3.5, fill(LabInk.ink));
    canvas.drawCircle(lowJ2, 3.5, fill(LabInk.ink));
    meter(canvas, vc, vr, 'V', v, 3, '${v.toStringAsFixed(2)} V');

    if (on && i > 0) {
      final loop = [Offset(batX + 16, top), Offset(right, top), Offset(right, bottom), Offset(left, bottom), Offset(left, top), Offset(batX - 16, top)];
      final lens = [for (var k = 0; k < loop.length - 1; k++) (loop[k + 1] - loop[k]).distance];
      final total = lens.reduce((a, b) => a + b);
      const gap = 36.0;
      for (var d = (t * 60 * math.min(i, 3)) % gap; d < total; d += gap) {
        var rem = d;
        for (var k = 0; k < lens.length; k++) {
          if (rem <= lens[k]) {
            final at = Offset.lerp(loop[k], loop[k + 1], rem / lens[k])!;
            // In parallel the current splits between the branches: no charges in the gap between them.
            final inGap = !series && k == 2 && at.dx > j1.dx && at.dx < j2.dx;
            if (!inGap) canvas.drawCircle(at, 3.2, fill(LabInk.accent));
            break;
          }
          rem -= lens[k];
        }
      }
    }
  }
}
