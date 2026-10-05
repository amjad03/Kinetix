import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// A sonometer: a wire over two bridges on a hollow box, pulled tight by a
/// weight over a pulley. Plucked, the length between the bridges vibrates.
class SonometerBench extends LabBench {
  const SonometerBench();

  /// Mass per metre of each wire (kg/m).
  static const wires = {'thin': 0.0005, 'thick': 0.002};
  static const g = 9.8;

  @override
  String get kind => 'sonometer';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'length': 60.0, 'tension': 2.0, 'wire': 'thin'};

  @override
  List<LabControl> controls(LabParams p) => [
        LabSlider('length', tr('Length between the bridges'), 20, 100, divisions: 16, unit: ' cm'),
        LabSlider('tension', tr('Weight pulling the wire'), 1, 5, divisions: 8, unit: ' kg', decimals: 1),
        LabChoice('wire', tr('Wire'), [('thin', tr('Thin wire')), ('thick', tr('Thick wire'))]),
      ];

  static String wireName(String id) => id == 'thick' ? tr('Thick wire') : tr('Thin wire');

  /// Frequency of the fundamental: f = (1 / 2L) √(T / μ).
  static double frequency(LabParams p) {
    final l = pNum(p, 'length', 60).roundToDouble() / 100;
    final tension = pNum(p, 'tension', 2) * g;
    final mu = wires[pStr(p, 'wire', 'thin')] ?? wires['thin']!;
    return math.sqrt(tension / mu) / (2 * l);
  }

  @override
  List<LabColumn> get columns => [
        LabColumn(tr('L (cm)'), 0),
        LabColumn(tr('Weight (kg)'), 1),
        LabColumn(tr('Wire')),
        LabColumn(tr('f (Hz)'), 0),
        LabColumn(tr('f × L (Hz m)'), 1),
      ];

  @override
  LabReading read(LabParams p) {
    final f = frequency(p).round();
    final l = pNum(p, 'length', 60).round();
    return LabReading.row([l, (pNum(p, 'tension', 2) * 10).round() / 10, wireName(pStr(p, 'wire', 'thin')), f, (f * l / 10).round() / 10]);
  }

  @override
  List<String> live(LabParams p) => [
        'f = ${frequency(p).round()} Hz',
        tr('f × L = {x} Hz m', {'x': (frequency(p) * pNum(p, 'length', 60).round() / 100).toStringAsFixed(1)}),
      ];

  @override
  LabGraph graph(LabParams p) => const LabGraph(0, 3, fromZero: false);

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final out = <String>[];
    // Same weight and wire, different lengths: f × L stays the same.
    final groups = <String, List<List<Object>>>{};
    for (final r in rows) {
      (groups['${r[1]}|${r[2]}'] ??= []).add(r);
    }
    for (final grp in groups.values) {
      final lengths = {for (final r in grp) r[0]};
      if (lengths.length < 2) continue;
      final fl = [for (final r in grp) (r[4] as num).toDouble()];
      final mean = fl.reduce((a, b) => a + b) / fl.length;
      final spread = fl.map((x) => (x - mean).abs()).reduce(math.max) / mean * 100;
      out.add(tr('With {w} kg on the {wire}, f × L stays about {x} Hz m (within {e}%): the frequency is inversely proportional to the length.', {
        'w': grp.first[1],
        'wire': (grp.first[2] as String).toLowerCase(),
        'x': mean.toStringAsFixed(1),
        'e': spread.toStringAsFixed(1),
      }));
    }
    // Same length and wire, different weights: f grows as √T.
    final byLength = <String, List<List<Object>>>{};
    for (final r in rows) {
      (byLength['${r[0]}|${r[2]}'] ??= []).add(r);
    }
    for (final grp in byLength.values) {
      final ws = {for (final r in grp) r[1]};
      if (ws.length < 2) continue;
      grp.sort((a, b) => (a[1] as num).compareTo(b[1] as num));
      final a = grp.first, b = grp.last;
      out.add(tr('Raising the weight from {a} to {b} kg raised f from {fa} to {fb} Hz (√ of the weight ratio: {r}).', {
        'a': a[1],
        'b': b[1],
        'fa': a[3],
        'fb': b[3],
        'r': math.sqrt((b[1] as num) / (a[1] as num)).toStringAsFixed(2),
      }));
    }
    return out.isEmpty ? null : out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final box = Rect.fromLTWH(w * 0.06, h * 0.45, w * 0.78, h * 0.22);
    canvas.drawRRect(RRect.fromRectAndRadius(box, const Radius.circular(6)), fill(const Color(0xFFD9B27C)));
    canvas.drawRRect(RRect.fromRectAndRadius(box, const Radius.circular(6)), stroke(LabInk.ink, 1.5));
    canvas.drawCircle(box.center + Offset(0, box.height * 0.1), box.height * 0.22, fill(const Color(0xFF6E4A28)));

    final wireY = box.top - 14;
    final perCm = (box.width * 0.9) / 100;
    final lengthCm = pNum(p, 'length', 60).round();
    final b1 = box.left + box.width * 0.05, b2 = b1 + lengthCm * perCm;
    final thick = pStr(p, 'wire', 'thin') == 'thick';
    final wirePaint = stroke(const Color(0xFF5B6168), thick ? 3.2 : 1.6);

    // Pulley and weight on the right.
    final pulley = Offset(box.right + 18, wireY + 10);
    canvas.drawCircle(pulley, 12, stroke(LabInk.ink, 2));
    final kg = pNum(p, 'tension', 2);
    final hangTop = pulley + const Offset(12, 0);
    final weightTop = Offset(hangTop.dx, h * 0.78);
    canvas.drawLine(hangTop, weightTop, wirePaint);
    final wb = Rect.fromLTWH(weightTop.dx - 24, weightTop.dy, 48, 18 + kg * 7);
    canvas.drawRect(wb, fill(LabInk.wire));
    label(canvas, '${kg.toStringAsFixed(1)} kg', wb.center, size: 11, bold: true, color: Colors.white);

    // Fixed part of the wire and the bridges.
    canvas.drawLine(Offset(box.left + 4, wireY), Offset(b1, wireY), wirePaint);
    canvas.drawLine(Offset(b2, wireY), pulley - const Offset(0, 12), wirePaint);
    for (final x in [b1, b2]) {
      final bridge = Path()
        ..moveTo(x, wireY)
        ..lineTo(x - 8, box.top)
        ..lineTo(x + 8, box.top)
        ..close();
      canvas.drawPath(bridge, fill(LabInk.ink));
    }

    // The vibrating length: a loop that grows and shrinks.
    final f = frequency(p);
    final amp = 10 * math.cos(2 * math.pi * (f / 60) * t);
    final path = Path()..moveTo(b1, wireY);
    for (var i = 1; i <= 40; i++) {
      final x = b1 + (b2 - b1) * i / 40;
      path.lineTo(x, wireY - amp * math.sin(math.pi * i / 40));
    }
    canvas.drawPath(path, wirePaint);
    dashed(canvas, Offset(b1, wireY), Offset(b2, wireY), stroke(LabInk.faint, 1));

    // Length bracket and the note.
    final ly = wireY - 34;
    canvas.drawLine(Offset(b1, ly), Offset(b2, ly), stroke(LabInk.blue, 1.4));
    arrowHead(canvas, Offset(b1, ly), const Offset(-1, 0), stroke(LabInk.blue, 1.4), size: 8);
    arrowHead(canvas, Offset(b2, ly), const Offset(1, 0), stroke(LabInk.blue, 1.4), size: 8);
    label(canvas, 'L = $lengthCm cm', Offset((b1 + b2) / 2, ly - 12), size: 14, bold: true, color: LabInk.blue, halo: LabInk.paper);
    label(canvas, 'f = ${f.round()} Hz', Offset(w * 0.45, h * 0.12), size: 22, bold: true);
    label(canvas, wireName(pStr(p, 'wire', 'thin')), Offset(w * 0.45, h * 0.12 + 26), size: 13, color: LabInk.muted);
  }
}
