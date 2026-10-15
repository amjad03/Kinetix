import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// A leaf taken through the starch test: boiled, decolourised in alcohol,
/// washed and tested with iodine.
class StarchBench extends LabBench {
  const StarchBench();

  static const leaves = ['covered', 'variegated', 'dark'];

  @override
  String get kind => 'starch';

  @override
  LabParams get defaults => {'leaf': 'covered', 'stage': 0};

  @override
  LabParams get preview => {'leaf': 'covered', 'stage': 4};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('leaf', tr('Leaf'), [for (final l in leaves) (l, leafName(l))]),
        LabChoice('stage', tr('Step'), [for (var s = 0; s <= 4; s++) (s, stageName(s))]),
      ];

  @override
  LabParams act(String action, LabParams p) => action == 'set:leaf' ? {...p, 'stage': 0} : p;

  static String leafName(String l) => switch (l) {
        'variegated' => tr('Variegated leaf'),
        'dark' => tr('Leaf kept in the dark'),
        _ => tr('Leaf partly covered'),
      };

  static String stageName(int s) => switch (s) {
        1 => tr('Boiled in water'),
        2 => tr('Heated in alcohol'),
        3 => tr('Washed in warm water'),
        4 => tr('Iodine added'),
        _ => tr('Fresh from the plant'),
      };

  static (String where, String so) finding(String l) => switch (l) {
        'variegated' => (tr('Only the parts that were green'), tr('Chlorophyll is needed to make starch')),
        'dark' => (tr('Nowhere'), tr('No light, no starch')),
        _ => (tr('Everywhere except the covered band'), tr('Starch forms only where light falls')),
      };

  @override
  List<LabColumn> get columns => [LabColumn(tr('Leaf')), LabColumn(tr('Turned blue-black')), LabColumn(tr('So'))];

  @override
  LabReading read(LabParams p) {
    if (pInt(p, 'stage', 0) < 4) return LabReading.not(tr('Finish the steps and add iodine first.'));
    final l = pStr(p, 'leaf', 'covered');
    final (where, so) = finding(l);
    return LabReading.row([leafName(l), where, so]);
  }

  @override
  List<String> live(LabParams p) => [stageName(pInt(p, 'stage', 0)), if (pInt(p, 'stage', 0) == 2) tr('The alcohol turns green: the chlorophyll comes out')];

  @override
  String? result(List<List<Object>> rows) => rows.isEmpty ? null : {for (final r in rows) '${r[2]}.'}.join(' ');

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final l = pStr(p, 'leaf', 'covered');
    final stage = pInt(p, 'stage', 0);
    final c = Offset(w * 0.4, h * 0.52);
    final lw = w * 0.52, lh = h * 0.62;
    // A leaf pointing right: stalk on the left, tip on the right.
    final base = c - Offset(lw / 2, 0), tip = c + Offset(lw / 2, 0);
    final leaf = Path()
      ..moveTo(base.dx, base.dy)
      ..cubicTo(base.dx + lw * 0.2, c.dy - lh * 0.62, tip.dx - lw * 0.25, c.dy - lh * 0.5, tip.dx, tip.dy)
      ..cubicTo(tip.dx - lw * 0.25, c.dy + lh * 0.5, base.dx + lw * 0.2, c.dy + lh * 0.62, base.dx, base.dy)
      ..close();
    const green = Color(0xFF3E8E41), darkGreen = Color(0xFF2E6B31), pale = Color(0xFFE6E3C3), cream = Color(0xFFF1E8B8);
    const blueBlack = Color(0xFF1F2A44), brown = Color(0xFFC98B2B);
    final starchEverywhere = l == 'covered';
    final band = Rect.fromCenter(center: c + Offset(lw * 0.05, 0), width: lw * 0.22, height: lh * 1.2);

    canvas.save();
    canvas.clipPath(leaf);
    // Base colour of the whole leaf at this step.
    final Color whole = switch (stage) {
      0 => green,
      1 => darkGreen,
      2 || 3 => pale,
      _ => l == 'dark' ? brown : (starchEverywhere ? blueBlack : brown),
    };
    canvas.drawRect(Offset.zero & size, fill(whole));
    if (l == 'variegated') {
      // Cream margins; the green middle turns blue-black with iodine.
      final Color margin = stage >= 4 ? brown : (stage >= 2 ? pale : cream);
      final Color middle = switch (stage) { 0 => green, 1 => darkGreen, 2 || 3 => pale, _ => blueBlack };
      canvas.drawRect(Offset.zero & size, fill(margin));
      final inner = Path()
        ..moveTo(base.dx + lw * 0.08, c.dy)
        ..cubicTo(base.dx + lw * 0.3, c.dy - lh * 0.34, tip.dx - lw * 0.35, c.dy - lh * 0.22, tip.dx - lw * 0.1, c.dy)
        ..cubicTo(tip.dx - lw * 0.35, c.dy + lh * 0.24, base.dx + lw * 0.3, c.dy + lh * 0.3, base.dx + lw * 0.08, c.dy)
        ..close();
      canvas.drawPath(inner, fill(middle));
    }
    if (l == 'covered' && stage >= 4) canvas.drawRect(band, fill(brown));
    canvas.restore();

    // Veins.
    final vein = stroke((stage >= 2 ? const Color(0xFFBDB78E) : const Color(0xFF2B5E2E)).withValues(alpha: 0.8), 2);
    canvas.drawLine(base, tip - Offset(lw * 0.04, 0), vein);
    for (var k = 1; k <= 5; k++) {
      final x = base.dx + lw * k / 6.5;
      for (final s in [-1.0, 1.0]) {
        canvas.drawLine(Offset(x, c.dy), Offset(x + lw * 0.1, c.dy + s * lh * 0.25), vein);
      }
    }
    canvas.drawPath(leaf, stroke(LabInk.ink.withValues(alpha: 0.6), 2));
    canvas.drawLine(base, base - Offset(lw * 0.12, -lh * 0.05), stroke(const Color(0xFF6B8E23), 5));

    // Black paper on the fresh covered leaf.
    if (l == 'covered' && stage == 0) {
      canvas.save();
      canvas.clipPath(leaf);
      canvas.drawRect(band, fill(const Color(0xFF151515)));
      canvas.restore();
      label(canvas, tr('Black paper'), Offset(band.center.dx, c.dy - lh * 0.46), size: 14, bold: true, halo: LabInk.paper);
    }

    // What is happening at this step.
    final side = Offset(w * 0.84, h * 0.45);
    switch (stage) {
      case 1 || 2:
        final beaker = Rect.fromCenter(center: side, width: w * 0.16, height: h * 0.32);
        final liquid = stage == 1 ? LabInk.water : Color.lerp(const Color(0x33E6F2D0), const Color(0xAA3E8E41), 0.8)!;
        canvas.drawRect(Rect.fromLTRB(beaker.left, beaker.top + beaker.height * 0.3, beaker.right, beaker.bottom), fill(liquid));
        canvas.drawLine(beaker.topLeft, beaker.bottomLeft, stroke(LabInk.ink, 2.5));
        canvas.drawLine(beaker.bottomLeft, beaker.bottomRight, stroke(LabInk.ink, 2.5));
        canvas.drawLine(beaker.bottomRight, beaker.topRight, stroke(LabInk.ink, 2.5));
        label(canvas, stage == 1 ? tr('Water') : tr('Alcohol'), Offset(side.dx, beaker.bottom + 16), size: 13, bold: true);
      case 4:
        final bottle = Rect.fromCenter(center: side, width: w * 0.08, height: h * 0.22);
        canvas.drawRRect(RRect.fromRectAndRadius(bottle, const Radius.circular(6)), fill(const Color(0xFF8C4A1E)));
        label(canvas, tr('Iodine'), Offset(side.dx, bottle.bottom + 16), size: 13, bold: true);
      default:
        break;
    }
    label(canvas, '${stage + 1}. ${stageName(stage)}', Offset(w * 0.4, h * 0.08), size: 18, bold: true, color: LabInk.blue);
    label(canvas, leafName(l), Offset(w * 0.4, h * 0.94), size: 14, bold: true);
    if (stage == 4) {
      final key = Offset(w * 0.78, h * 0.78);
      canvas.drawRect(Rect.fromCenter(center: key, width: 18, height: 18), fill(blueBlack));
      label(canvas, tr('Starch (blue-black)'), key + const Offset(16, -8), size: 12, centre: false);
      canvas.drawRect(Rect.fromCenter(center: key + const Offset(0, 26), width: 18, height: 18), fill(brown));
      label(canvas, tr('No starch (brown)'), key + const Offset(16, 18), size: 12, centre: false);
    }
  }
}
