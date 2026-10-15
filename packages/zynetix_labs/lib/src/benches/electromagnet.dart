import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// A coil on an iron nail (or a wooden rod), a battery with a rheostat and
/// an ammeter, and a heap of pins underneath.
class ElectromagnetBench extends LabBench {
  const ElectromagnetBench();

  /// Most pins that fit on the tip of the nail.
  static const maxPins = 45;

  @override
  String get kind => 'electromagnet';

  @override
  LabParams get defaults => {'turns': 40.0, 'current': 1.5, 'core': 'iron', 'on': true};

  @override
  List<LabControl> controls(LabParams p) => [
        LabSlider('turns', tr('Turns of wire'), 10, 100, divisions: 9),
        LabSlider('current', tr('Current'), 0.5, 3, divisions: 5, unit: ' A', decimals: 1),
        LabChoice('core', tr('Core'), [('iron', tr('Iron nail')), ('wood', tr('Wooden rod'))]),
        LabToggle('on', tr('Switch on')),
      ];

  static String coreName(String id) => id == 'wood' ? tr('Wooden rod') : tr('Iron nail');

  /// Pins lifted: grows with turns × current; an iron core makes the field
  /// hundreds of times stronger than wood (which lifts almost none).
  static int pins(LabParams p) {
    if (!pBool(p, 'on')) return 0;
    final ni = pNum(p, 'turns', 40).roundToDouble() * pNum(p, 'current', 1.5);
    final strength = pStr(p, 'core', 'iron') == 'wood' ? ni / 150 : ni / 6;
    return math.min(maxPins, strength.floor());
  }

  @override
  List<LabColumn> get columns => [LabColumn(tr('Turns'), 0), LabColumn(tr('Current (A)'), 1), LabColumn(tr('Core')), LabColumn(tr('Pins lifted'), 0)];

  @override
  LabReading read(LabParams p) {
    if (!pBool(p, 'on')) return LabReading.not(tr('Switch the current on first.'));
    return LabReading.row([pNum(p, 'turns', 40).round(), (pNum(p, 'current', 1.5) * 10).round() / 10, coreName(pStr(p, 'core', 'iron')), pins(p)]);
  }

  @override
  List<String> live(LabParams p) => [
        if (pBool(p, 'on')) '${pNum(p, 'current', 1.5).toStringAsFixed(1)} A' else tr('Switch off: no current'),
        tr('Turns × current = {x}', {'x': (pNum(p, 'turns', 40).round() * pNum(p, 'current', 1.5)).round()}),
        tr('Pins lifted: {n}', {'n': pins(p)}),
      ];

  @override
  LabGraph graph(LabParams p) => LabGraph(1, 3, include: (r) => r[2] == coreName('iron'));

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final iron = [for (final r in rows) if (r[2] == coreName('iron')) r];
    final wood = [for (final r in rows) if (r[2] == coreName('wood')) r];
    bool rises(int vary, int fixed) {
      for (final a in iron) {
        for (final b in iron) {
          if (a[fixed] == b[fixed] && (a[vary] as num) < (b[vary] as num) && (a[3] as num) < (b[3] as num)) return true;
        }
      }
      return false;
    }

    final out = <String>[
      if (rises(1, 0)) tr('With the same turns, a larger current lifted more pins.'),
      if (rises(0, 1)) tr('With the same current, more turns lifted more pins.'),
      if (iron.isNotEmpty && wood.isNotEmpty)
        tr('The iron nail lifted up to {a} pins; the wooden rod at most {b}: the iron core makes the magnet much stronger.', {
          'a': iron.map((r) => r[3] as num).reduce(math.max),
          'b': wood.map((r) => r[3] as num).reduce(math.max),
        }),
    ];
    return out.isEmpty ? null : out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final on = pBool(p, 'on');
    final wood = pStr(p, 'core', 'iron') == 'wood';
    final turns = pNum(p, 'turns', 40).round();
    final n = pins(p);

    // The nail, standing point down, held by a clamp.
    final top = Offset(w * 0.55, h * 0.12), tip = Offset(w * 0.55, h * 0.62);
    final coreColour = wood ? const Color(0xFFB7875A) : const Color(0xFF8C939B);
    canvas.drawRect(Rect.fromLTRB(top.dx - 9, top.dy, top.dx + 9, tip.dy - 12), fill(coreColour));
    final point = Path()
      ..moveTo(tip.dx - 9, tip.dy - 12)
      ..lineTo(tip.dx + 9, tip.dy - 12)
      ..lineTo(tip.dx, tip.dy)
      ..close();
    canvas.drawPath(point, fill(coreColour));
    canvas.drawRect(Rect.fromLTRB(top.dx - 16, top.dy - 8, top.dx + 16, top.dy + 4), fill(LabInk.wire));

    // The coil: one loop drawn for every few turns.
    final coilTop = top.dy + 30, coilBottom = tip.dy - 30;
    final loops = (turns / 5).round().clamp(2, 20);
    for (var i = 0; i < loops; i++) {
      final y = coilTop + (coilBottom - coilTop) * i / (loops - 1);
      canvas.drawOval(Rect.fromCenter(center: Offset(top.dx, y), width: 34, height: 8), stroke(const Color(0xFFC0692A), 2.2));
    }
    label(canvas, tr('{n} turns', {'n': turns}), Offset(top.dx + 60, (coilTop + coilBottom) / 2), size: 13, bold: true, color: const Color(0xFFC0692A), halo: LabInk.paper);

    // Circuit: battery, switch and ammeter on the left.
    final bx = w * 0.14;
    final battery = Rect.fromLTWH(bx - 22, h * 0.34, 44, 70);
    canvas.drawRRect(RRect.fromRectAndRadius(battery, const Radius.circular(6)), fill(LabInk.wire));
    label(canvas, '+', battery.topCenter + const Offset(0, 12), size: 14, bold: true, color: Colors.white);
    final meter = Offset(w * 0.3, h * 0.22);
    canvas.drawLine(battery.topCenter, Offset(bx, meter.dy), stroke(LabInk.wire, 2));
    canvas.drawLine(Offset(bx, meter.dy), meter, stroke(LabInk.wire, 2));
    canvas.drawLine(meter, Offset(top.dx - 17, coilTop), stroke(LabInk.wire, 2));
    canvas.drawLine(Offset(top.dx - 17, coilBottom), Offset(w * 0.3, coilBottom + 20), stroke(LabInk.wire, 2));
    final sw = Offset(w * 0.22, coilBottom + 20);
    canvas.drawLine(Offset(w * 0.3, coilBottom + 20), sw + const Offset(12, 0), stroke(LabInk.wire, 2));
    canvas.drawLine(sw - const Offset(12, 0), Offset(bx, coilBottom + 20), stroke(LabInk.wire, 2));
    canvas.drawLine(Offset(bx, coilBottom + 20), battery.bottomCenter, stroke(LabInk.wire, 2));
    // The switch: two terminals and a lever, closed when on.
    for (final d in [-14.0, 14.0]) {
      canvas.drawCircle(sw + Offset(d, 0), 5, fill(Colors.white));
      canvas.drawCircle(sw + Offset(d, 0), 5, stroke(LabInk.ink, 1.6));
    }
    canvas.drawLine(sw - const Offset(14, 0), on ? sw + const Offset(14, 0) : sw + const Offset(6, -20), stroke(on ? LabInk.green : LabInk.red, 3.5));
    label(canvas, on ? tr('On') : tr('Off'), sw + const Offset(0, 20), size: 12, bold: true, color: on ? LabInk.green : LabInk.red);
    canvas.drawCircle(meter, 20, fill(Colors.white));
    canvas.drawCircle(meter, 20, stroke(LabInk.ink, 2));
    label(canvas, 'A', meter + const Offset(0, 8), size: 11, bold: true);
    final needle = -math.pi * 0.85 + (on ? pNum(p, 'current', 1.5) / 3 * math.pi * 0.7 : 0);
    canvas.drawLine(meter, meter + Offset(math.cos(needle), math.sin(needle)) * 15, stroke(LabInk.red, 1.8));

    // The heap of pins, and those hanging from the tip.
    final heapY = h * 0.9;
    final rnd = math.Random(7);
    for (var i = 0; i < 40; i++) {
      final x = tip.dx + (rnd.nextDouble() - 0.5) * w * 0.3;
      final y = heapY + rnd.nextDouble() * 10;
      final a = rnd.nextDouble() * math.pi;
      canvas.drawLine(Offset(x, y), Offset(x, y) + Offset(math.cos(a), math.sin(a)) * 12, stroke(const Color(0xFF9AA3AD), 1.6));
    }
    // Pins hanging from the tip: a fan of pins, then more hanging from those.
    for (var i = 0; i < n; i++) {
      final row = i ~/ 9, col = i % 9;
      final a = math.pi / 2 + (col - 4) * 0.22 + (rnd.nextDouble() - 0.5) * 0.1;
      final start = tip + Offset((col - 4) * 3.0, row * 20.0);
      final end = start + Offset(math.cos(a), math.sin(a)) * 24;
      canvas.drawLine(start, end, stroke(const Color(0xFF6E7781), 2));
      canvas.drawCircle(start, 2, fill(const Color(0xFF6E7781)));
    }
    if (on && !wood) {
      // Field lines around the coil.
      for (final s in [-1.0, 1.0]) {
        final path = Path()
          ..moveTo(top.dx, coilTop - 6)
          ..cubicTo(top.dx + s * 90, coilTop - 30, top.dx + s * 90, coilBottom + 30, top.dx, coilBottom + 6);
        canvas.drawPath(path, stroke(LabInk.blue.withValues(alpha: 0.35), 1.4));
      }
    }
    label(canvas, tr('Pins lifted: {n}', {'n': n}), Offset(tip.dx, h * 0.78), size: 16, bold: true, color: n > 0 ? LabInk.ink : LabInk.muted, halo: LabInk.paper);
  }
}
