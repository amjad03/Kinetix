import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// A potometer: a leafy shoot in a water-filled tube, with an air bubble in
/// the narrow scale tube that moves as the shoot takes up water.
class TranspirationBench extends LabBench {
  const TranspirationBench();

  /// Bubble speed (mm per minute) with all the leaves.
  static const rates = {'still': 6.0, 'wind': 15.0, 'dark': 1.5, 'bag': 2.0};

  /// Length of the scale tube (mm).
  static const tube = 100.0;

  @override
  String get kind => 'transpiration';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'condition': 'still', 'leaves': 'all', 'minutes': 5.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('condition', tr('Conditions'), [('still', tr('Still air, light')), ('wind', tr('Fan on')), ('dark', tr('Dark')), ('bag', tr('Plastic bag over the shoot'))]),
        LabChoice('leaves', tr('Leaves'), [('all', tr('All the leaves')), ('half', tr('Half the leaves removed'))]),
        LabSlider('minutes', tr('Time'), 1, 6, divisions: 5, unit: ' min'),
      ];

  static String conditionName(String id) => switch (id) {
        'wind' => tr('Fan on'),
        'dark' => tr('Dark'),
        'bag' => tr('Plastic bag over the shoot'),
        _ => tr('Still air, light'),
      };

  static String leavesName(String id) => id == 'half' ? tr('Half the leaves removed') : tr('All the leaves');

  static double rate(LabParams p) => (rates[pStr(p, 'condition', 'still')] ?? 6) * (pStr(p, 'leaves', 'all') == 'half' ? 0.5 : 1);

  /// How far the bubble has moved (mm), up to the end of the scale.
  static double moved(LabParams p) => math.min(tube, rate(p) * pNum(p, 'minutes', 5).round());

  @override
  List<LabColumn> get columns => [
        LabColumn(tr('Conditions')),
        LabColumn(tr('Leaves')),
        LabColumn(tr('Time (min)'), 0),
        LabColumn(tr('Bubble moved (mm)'), 1),
        LabColumn(tr('Rate (mm/min)'), 1),
      ];

  @override
  LabReading read(LabParams p) {
    final m = pNum(p, 'minutes', 5).round();
    final d = moved(p);
    return LabReading.row([conditionName(pStr(p, 'condition', 'still')), leavesName(pStr(p, 'leaves', 'all')), m, (d * 10).round() / 10, (d / m * 10).round() / 10]);
  }

  @override
  List<String> live(LabParams p) => [
        tr('Bubble moved {x} mm in {m} min', {'x': moved(p).toStringAsFixed(1), 'm': pNum(p, 'minutes', 5).round()}),
        tr('Rate: {r} mm/min', {'r': rate(p).toStringAsFixed(1)}),
      ];

  @override
  LabGraph graph(LabParams p) => const LabGraph(2, 3, throughOrigin: true);

  @override
  String? result(List<List<Object>> rows) {
    final best = <String, double>{};
    for (final r in rows) {
      if (r[1] != leavesName('all')) continue;
      best[r[0] as String] = (r[4] as num).toDouble();
    }
    final out = <String>[];
    if (best.length >= 2) {
      final sorted = best.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
      out.add(tr('Fastest: {a} ({ra} mm/min). Slowest: {b} ({rb} mm/min).', {
        'a': sorted.first.key,
        'ra': sorted.first.value,
        'b': sorted.last.key,
        'rb': sorted.last.value,
      }));
      out.add(tr('Moving air and light speed transpiration up; darkness and damp air slow it down.'));
    }
    final halves = [for (final r in rows) if (r[1] == leavesName('half')) r];
    if (halves.isNotEmpty) out.add(tr('With half the leaves removed the bubble moved about half as fast: water is lost through the leaves.'));
    return out.isEmpty ? null : out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final condition = pStr(p, 'condition', 'still');
    final half = pStr(p, 'leaves', 'all') == 'half';

    // The scale tube with the bubble, along the bottom.
    final tubeRect = Rect.fromLTWH(w * 0.1, h * 0.82, w * 0.62, 12);
    canvas.drawRRect(RRect.fromRectAndRadius(tubeRect, const Radius.circular(6)), fill(LabInk.water));
    canvas.drawRRect(RRect.fromRectAndRadius(tubeRect, const Radius.circular(6)), stroke(LabInk.ink, 1.4));
    for (var mm = 0; mm <= tube; mm += 10) {
      final x = tubeRect.right - tubeRect.width * mm / tube;
      canvas.drawLine(Offset(x, tubeRect.bottom), Offset(x, tubeRect.bottom + (mm % 50 == 0 ? 10 : 5)), stroke(LabInk.ink, 1));
      if (mm % 20 == 0 && w > 500) label(canvas, '$mm', Offset(x, tubeRect.bottom + 20), size: 10, color: LabInk.muted);
    }
    // Water is drawn towards the shoot, so the bubble moves right to left.
    final bx = tubeRect.right - tubeRect.width * moved(p) / tube;
    canvas.drawOval(Rect.fromCenter(center: Offset(bx, tubeRect.center.dy), width: 16, height: 9), fill(Colors.white));
    canvas.drawOval(Rect.fromCenter(center: Offset(bx, tubeRect.center.dy), width: 16, height: 9), stroke(LabInk.ink, 1));
    label(canvas, tr('Bubble'), Offset(bx, tubeRect.top - 12), size: 12, bold: true, halo: LabInk.paper);

    // The wide tube and the shoot standing in it (left).
    final stemX = tubeRect.left + 10;
    canvas.drawRect(Rect.fromLTRB(stemX - 14, h * 0.5, stemX + 14, tubeRect.bottom), fill(LabInk.water));
    canvas.drawRect(Rect.fromLTRB(stemX - 14, h * 0.5, stemX + 14, tubeRect.bottom), stroke(LabInk.ink, 1.4));
    canvas.drawRect(Rect.fromLTRB(stemX - 16, h * 0.46, stemX + 16, h * 0.5), fill(const Color(0xFF6E4A28)));
    final stemTop = Offset(stemX, h * 0.12);
    canvas.drawLine(Offset(stemX, h * 0.6), stemTop, stroke(const Color(0xFF3F7A3A), 4));
    final sway = condition == 'wind' ? 0.25 * math.sin(t * 7) : 0.0;
    final leafCount = half ? 3 : 6;
    for (var i = 0; i < leafCount; i++) {
      final y = h * 0.16 + i * h * 0.05;
      final side = i.isEven ? 1.0 : -1.0;
      canvas.save();
      canvas.translate(stemX, y);
      canvas.rotate(side * (0.5 + sway));
      canvas.drawOval(Rect.fromLTRB(math.min(0, side * 46), -9, math.max(0, side * 46), 9), fill(const Color(0xFF4F9A48)));
      canvas.restore();
    }

    // Conditions around it.
    if (condition == 'wind') {
      final fan = Offset(w * 0.5, h * 0.3);
      canvas.drawCircle(fan, 36, stroke(LabInk.wire, 2));
      for (var k = 0; k < 3; k++) {
        final a = t * 12 + k * 2 * math.pi / 3;
        canvas.drawLine(fan, fan + Offset(math.cos(a), math.sin(a)) * 32, stroke(LabInk.wire, 5));
      }
      for (var k = 0; k < 3; k++) {
        final y = fan.dy - 20 + k * 20.0;
        final x0 = fan.dx - 50 - ((t * 80 + k * 30) % 60);
        canvas.drawLine(Offset(x0, y), Offset(x0 - 24, y), stroke(LabInk.faint, 2));
      }
    }
    if (condition == 'bag') {
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(stemX - 70, h * 0.06, stemX + 70, h * 0.48), const Radius.circular(30)), stroke(LabInk.blue.withValues(alpha: 0.5), 2));
      for (var k = 0; k < 8; k++) {
        canvas.drawCircle(Offset(stemX - 55 + k * 15.0, h * 0.1 + (k % 3) * 10), 2.5, fill(LabInk.blue.withValues(alpha: 0.4)));
      }
    }
    if (condition == 'still') {
      final lamp = Offset(w * 0.55, h * 0.1);
      canvas.drawCircle(lamp, 14, fill(const Color(0xFFFFE08A)));
      for (var k = 0; k < 8; k++) {
        final a = k * math.pi / 4;
        canvas.drawLine(lamp + Offset(math.cos(a), math.sin(a)) * 20, lamp + Offset(math.cos(a), math.sin(a)) * 30, stroke(LabInk.accent, 2));
      }
    }
    if (condition == 'dark') {
      canvas.drawRect(Offset.zero & size, fill(const Color(0x55101418)));
    }
    label(canvas, conditionName(condition), Offset(w * 0.78, h * 0.12), size: 15, bold: true, halo: LabInk.paper);
    label(canvas, '${rate(p).toStringAsFixed(1)} mm/min', Offset(w * 0.78, h * 0.12 + 22), size: 13, color: LabInk.muted, halo: LabInk.paper);
  }
}
