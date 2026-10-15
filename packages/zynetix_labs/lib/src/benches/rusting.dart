import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// Iron nails in four test tubes, watched for a week: rust forms only when
/// both air and water reach the iron, and faster in salt water.
class RustingBench extends LabBench {
  const RustingBench();

  /// A: tap water (air and water). B: boiled water under oil (no air).
  /// C: dry air over calcium chloride (no water). D: salt water.
  static const tubes = ['A', 'B', 'C', 'D'];

  @override
  String get kind => 'rusting';

  @override
  LabParams get defaults => {'tube': 'A', 'days': 0.0};

  @override
  LabParams get preview => {'tube': 'A', 'days': 6.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabSlider('days', tr('Days'), 0, 7, divisions: 7),
        LabChoice('tube', tr('Tube to record'), [for (final k in tubes) (k, tubeName(k))]),
      ];

  static String tubeName(String k) => tr('Tube {k}', {'k': k});

  static String conditions(String k) => switch (k) {
        'B' => tr('Water, no air'),
        'C' => tr('Air, no water'),
        'D' => tr('Air and salt water'),
        _ => tr('Air and water'),
      };

  /// How much of the nail has rusted (0 to 1) after [days].
  static double rust(String k, double days) => switch (k) {
        'A' => ((days - 1) / 6).clamp(0.0, 1.0),
        'D' => ((days - 0.5) / 3.5).clamp(0.0, 1.0),
        _ => 0.0,
      };

  static String amount(double r) => r <= 0
      ? tr('None')
      : r < 0.34
          ? tr('A little')
          : r < 0.67
              ? tr('Some')
              : tr('A lot');

  @override
  List<LabColumn> get columns => [LabColumn(tr('Tube')), LabColumn(tr('Conditions')), LabColumn(tr('Days'), 0), LabColumn(tr('Rust'))];

  @override
  LabReading read(LabParams p) {
    final d = pNum(p, 'days', 0);
    if (d < 3) return LabReading.not(tr('Rusting is slow: wait at least three days.'));
    final k = pStr(p, 'tube', 'A');
    return LabReading.row([tubeName(k), conditions(k), d.round(), amount(rust(k, d))]);
  }

  @override
  List<String> live(LabParams p) {
    final d = pNum(p, 'days', 0), k = pStr(p, 'tube', 'A');
    return [tr('Day {n}', {'n': d.round()}), '${tubeName(k)}: ${conditions(k)}', '${tr('Rust')}: ${amount(rust(k, d))}'];
  }

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final rusted = {for (final r in rows) if (r[3] != tr('None')) '${r[0]}'};
    final clean = {for (final r in rows) if (r[3] == tr('None')) '${r[0]} (${r[1]})'};
    final byTube = {for (final r in rows) '${r[0]}': r};
    final a = byTube[tubeName('A')], d = byTube[tubeName('D')];
    int level(List<Object> r) => [tr('None'), tr('A little'), tr('Some'), tr('A lot')].indexOf('${r[3]}');
    return [
      if (rusted.isNotEmpty) tr('Rusted: {list}.', {'list': rusted.join(', ')}),
      if (clean.isNotEmpty) tr('No rust: {list}.', {'list': clean.join(', ')}),
      if (rusted.isNotEmpty && clean.length >= 2) tr('Iron rusts only when both air and water reach it.'),
      if (a != null && d != null && a[2] == d[2] && level(d) > level(a)) tr('Salt water makes iron rust faster.'),
    ].join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final days = pNum(p, 'days', 0);
    final chosen = pStr(p, 'tube', 'A');
    label(canvas, tr('Day {n}', {'n': days.round()}), Offset(w / 2, h * 0.07), size: 20, bold: true, color: LabInk.blue);
    // A wooden rack holding the four tubes.
    final rack = Rect.fromLTWH(w * 0.06, h * 0.62, w * 0.88, h * 0.1);
    final slot = rack.width / 4;
    canvas.drawRect(rack, fill(const Color(0xFFA06A3C)));
    canvas.drawRect(Rect.fromLTWH(rack.left, rack.bottom, 10, h * 0.12), fill(const Color(0xFF8A5A30)));
    canvas.drawRect(Rect.fromLTWH(rack.right - 10, rack.bottom, 10, h * 0.12), fill(const Color(0xFF8A5A30)));
    for (var n = 0; n < 4; n++) {
      final k = tubes[n];
      final cx = rack.left + slot * (n + 0.5);
      if (k == chosen) {
        canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(cx - slot * 0.46, h * 0.13, cx + slot * 0.46, h * 0.97), const Radius.circular(12)), fill(const Color(0x221F5FD6)));
      }
      final tw = math.min(slot * 0.34, 64.0);
      final tube = Rect.fromLTWH(cx - tw / 2, h * 0.2, tw, h * 0.62);
      _tube(canvas, tube, k, days);
      label(canvas, tubeName(k), Offset(cx, h * 0.16), size: 15, bold: true);
      label(canvas, conditions(k), Offset(cx, h * 0.9), size: 13, bold: true, color: rust(k, 7) > 0 ? LabInk.red : LabInk.green);
    }
  }

  void _tube(Canvas canvas, Rect tube, String k, double days) {
    final shape = RRect.fromRectAndCorners(tube, bottomLeft: Radius.circular(tube.width / 2), bottomRight: Radius.circular(tube.width / 2));
    canvas.drawRRect(shape, fill(const Color(0x1878B7E0)));
    canvas.save();
    canvas.clipRRect(shape);
    switch (k) {
      case 'A':
        canvas.drawRect(Rect.fromLTRB(tube.left, tube.top + tube.height * 0.45, tube.right, tube.bottom), fill(LabInk.water));
      case 'B':
        final top = tube.top + tube.height * 0.12;
        canvas.drawRect(Rect.fromLTRB(tube.left, top, tube.right, tube.bottom), fill(LabInk.water));
        canvas.drawRect(Rect.fromLTRB(tube.left, top, tube.right, top + 12), fill(const Color(0xCCE9B840)));
      case 'C':
        // Lumps of anhydrous calcium chloride soak up any moisture.
        final rnd = math.Random(5);
        for (var n = 0; n < 14; n++) {
          final c = Offset(tube.left + 6 + rnd.nextDouble() * (tube.width - 12), tube.bottom - 8 - rnd.nextDouble() * tube.height * 0.14);
          canvas.drawCircle(c, 5, fill(const Color(0xFFF4F4EE)));
          canvas.drawCircle(c, 5, stroke(LabInk.faint, 1));
        }
      case 'D':
        canvas.drawRect(Rect.fromLTRB(tube.left, tube.top + tube.height * 0.45, tube.right, tube.bottom), fill(const Color(0x6690C2E4)));
    }
    // The nail, with rust spreading over it.
    final nail = Rect.fromLTRB(tube.center.dx - 3.5, tube.top + tube.height * 0.18, tube.center.dx + 3.5, tube.bottom - (k == 'C' ? tube.height * 0.2 : 10));
    canvas.drawRect(nail, fill(const Color(0xFF7D848C)));
    canvas.drawRect(Rect.fromCenter(center: nail.topCenter, width: 18, height: 5), fill(const Color(0xFF7D848C)));
    final r = rust(k, days);
    if (r > 0) {
      final rnd = math.Random(k.codeUnitAt(0));
      final spots = (40 * r).round();
      for (var n = 0; n < spots; n++) {
        // Rust starts where water and air meet the iron, then spreads.
        final y = nail.top + nail.height * (0.35 + 0.65 * rnd.nextDouble());
        canvas.drawCircle(Offset(nail.center.dx + (rnd.nextDouble() - 0.5) * 8, y), 2.5 + 2 * r * rnd.nextDouble(), fill(const Color(0xFFB5541F)));
      }
      if (r > 0.6) canvas.drawRect(Rect.fromLTRB(tube.left + 3, tube.bottom - 8, tube.right - 3, tube.bottom), fill(const Color(0x88B5541F)));
    }
    canvas.restore();
    canvas.drawRRect(shape, stroke(LabInk.ink, 2));
    // Tubes B and C are corked to keep air or moisture out.
    if (k == 'B' || k == 'C') {
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(tube.left - 3, tube.top - 14, tube.right + 3, tube.top + 10), const Radius.circular(3)), fill(const Color(0xFFB98A5A)));
    }
    if (k == 'D') label(canvas, tr('Salt'), Offset(tube.center.dx, tube.top + tube.height * 0.36), size: 11, bold: true, color: LabInk.blue, halo: const Color(0xDDFFFFFF));
  }
}
