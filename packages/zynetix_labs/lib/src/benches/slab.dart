import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// A ray through a rectangular slab, as traced with pins on paper.
class SlabBench extends LabBench {
  const SlabBench();

  static const thicknessCm = 6.0;

  @override
  String get kind => 'slab';

  @override
  LabParams get defaults => {'i': 30.0, 'material': 'glass', 'pins': true};

  @override
  List<LabControl> controls(LabParams p) => [
        LabSlider('i', tr('Angle of incidence'), 0, 80, divisions: 80, unit: '°'),
        LabChoice('material', tr('Slab'), [('glass', tr('Glass')), ('water', tr('Water (in a thin tank)'))]),
        LabToggle('pins', tr('Pins')),
      ];

  static double index(LabParams p) => pStr(p, 'material', 'glass') == 'water' ? 1.33 : 1.5;

  /// Angles in degrees: incidence, refraction, emergence.
  static (double i, double r, double e) angles(LabParams p) {
    final i = pNum(p, 'i', 30);
    final r = math.asin(math.sin(i * math.pi / 180) / index(p)) * 180 / math.pi;
    return (i, r, i);
  }

  /// Sideways shift of the emergent ray, in cm.
  static double shift(LabParams p) {
    final (i, r, _) = angles(p);
    final ir = i * math.pi / 180, rr = r * math.pi / 180;
    return thicknessCm * math.sin(ir - rr) / math.cos(rr);
  }

  @override
  List<LabColumn> get columns => [
        LabColumn(tr('∠i (degree)'), 0),
        LabColumn(tr('∠r (degree)'), 1),
        LabColumn(tr('∠e (degree)'), 1),
        LabColumn('sin i ÷ sin r', 3),
      ];

  @override
  LabReading read(LabParams p) {
    final (i, r, e) = angles(p);
    if (i < 1) return LabReading.not(tr('At 0° the ray goes straight through. Choose a bigger angle.'));
    // Angles read off a protractor, to the nearest half degree.
    double half(double v) => (v * 2).round() / 2;
    final rr = half(r);
    return LabReading.row([i.round(), rr, half(e), (math.sin(i * math.pi / 180) / math.sin(rr * math.pi / 180) * 1000).round() / 1000]);
  }

  @override
  List<String> live(LabParams p) {
    final (i, r, e) = angles(p);
    return [
      '∠i = ${i.toStringAsFixed(0)}°',
      '∠r = ${r.toStringAsFixed(1)}°',
      '∠e = ${e.toStringAsFixed(0)}°',
      tr('Lateral displacement {x} cm', {'x': shift(p).toStringAsFixed(2)}),
    ];
  }

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final ratios = [for (final r in rows) (r[3] as num).toDouble()];
    final n = ratios.reduce((a, b) => a + b) / ratios.length;
    final eqI = rows.every((r) => ((r[2] as num) - (r[0] as num)).abs() < 1);
    return tr('Average sin i ÷ sin r = {n}, so the refractive index is about {n}.', {'n': n.toStringAsFixed(2)}) +
        (eqI ? ' ${tr('In every reading ∠e = ∠i: the emergent ray is parallel to the incident ray.')}' : '');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final water = pStr(p, 'material', 'glass') == 'water';
    final (i, r, e) = angles(p);
    final ir = i * math.pi / 180, rr = r * math.pi / 180;
    // The slab: 6 cm thick, drawn at a scale that fits the space.
    final slabW = w * 0.62;
    final cm = math.min(h * 0.34 / thicknessCm, slabW / 12);
    final th = thicknessCm * cm;
    final slab = Rect.fromCenter(center: Offset(w * 0.5, h * 0.5), width: slabW, height: th);
    canvas.drawRect(slab, fill(water ? LabInk.water : LabInk.glass));
    canvas.drawRect(slab, stroke(LabInk.ink, 2));
    label(canvas, 'A', slab.topLeft + const Offset(-12, -12), size: 14, bold: true);
    label(canvas, 'B', slab.topRight + const Offset(12, -12), size: 14, bold: true);
    label(canvas, 'C', slab.bottomRight + const Offset(12, 12), size: 14, bold: true);
    label(canvas, 'D', slab.bottomLeft + const Offset(-12, 12), size: 14, bold: true);
    label(canvas, water ? tr('Water') : tr('Glass'), slab.centerRight - Offset(slabW * 0.12, 0), size: 14, color: LabInk.muted);

    // Point of incidence on AB, placed so the whole path stays in view.
    final entry = Offset(slab.left + slabW * 0.3, slab.top);
    final exit = entry + Offset(th * math.tan(rr), th);
    final inLen = h * 0.3;
    final src = entry - Offset(math.sin(ir), math.cos(ir)) * inLen;
    final out = exit + Offset(math.sin(ir), math.cos(ir)) * inLen;

    final normal = stroke(LabInk.muted, 1.5);
    dashed(canvas, entry - const Offset(0, 70), entry + const Offset(0, 70), normal);
    dashed(canvas, exit - const Offset(0, 70), exit + const Offset(0, 70), normal);

    final ray = stroke(LabInk.red, 3);
    canvas.drawLine(src, entry, ray);
    canvas.drawLine(entry, exit, ray);
    canvas.drawLine(exit, out, ray);
    arrowHead(canvas, Offset.lerp(src, entry, 0.55)!, entry - src, ray);
    arrowHead(canvas, Offset.lerp(exit, out, 0.6)!, out - exit, ray);
    if (i >= 1) {
      // The incident ray carried straight on, to show the sideways shift.
      final straight = entry + Offset(math.sin(ir), math.cos(ir)) * (th / math.cos(ir) + inLen * 0.6);
      dashed(canvas, entry, straight, stroke(LabInk.red.withValues(alpha: 0.45), 2));
    }

    // Angle arcs with their values.
    void arc(Offset at, double from, double sweep, double rad, String text, Offset textAt) {
      canvas.drawArc(Rect.fromCircle(center: at, radius: rad), from, sweep, false, stroke(LabInk.blue, 2));
      label(canvas, text, textAt, size: 14, bold: true, color: LabInk.blue, halo: LabInk.paper);
    }

    const up = -math.pi / 2, down = math.pi / 2;
    if (i >= 1) {
      // Each value sits on the empty side of its normal, clear of the rays and pins.
      arc(entry, up - ir, ir, 42, 'i = ${i.toStringAsFixed(0)}°', entry + const Offset(46, -40));
      arc(entry, down - rr, rr, 36, 'r = ${r.toStringAsFixed(1)}°', entry + const Offset(-56, 42));
      arc(exit, down - ir, ir, 42, 'e = ${e.toStringAsFixed(0)}°', exit + const Offset(-56, 46));
    }

    // Pins P, Q on the incident ray; R, S on the emergent ray.
    if (pBool(p, 'pins')) {
      final pins = {
        'P': Offset.lerp(src, entry, 0.15)!,
        'Q': Offset.lerp(src, entry, 0.45)!,
        'R': Offset.lerp(exit, out, 0.55)!,
        'S': Offset.lerp(exit, out, 0.85)!,
      };
      for (final e in pins.entries) {
        canvas.drawCircle(e.value, 5.5, fill(Colors.white));
        canvas.drawCircle(e.value, 5.5, stroke(LabInk.ink, 2));
        label(canvas, e.key, e.value + const Offset(-16, 0), size: 14, bold: true);
      }
    }
  }
}
