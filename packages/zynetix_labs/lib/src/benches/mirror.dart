import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// A narrow beam from a ray box meets a plane mirror on a protractor:
/// the angle of reflection equals the angle of incidence. A rough surface
/// scatters the beam instead.
class MirrorBench extends LabBench {
  const MirrorBench();

  @override
  String get kind => 'mirror';

  @override
  LabParams get defaults => {'i': 30.0, 'surface': 'mirror'};

  @override
  LabParams get preview => {'i': 40.0, 'surface': 'mirror'};

  @override
  List<LabControl> controls(LabParams p) => [
        LabSlider('i', tr('Angle of incidence'), 10, 80, divisions: 14, unit: '°'),
        LabChoice('surface', tr('Surface'), [('mirror', tr('Plane mirror')), ('rough', tr('Rough surface'))]),
      ];

  @override
  List<LabColumn> get columns => [LabColumn(tr('∠i (degree)'), 0), LabColumn(tr('∠r (degree)'), 0)];

  @override
  LabReading read(LabParams p) {
    if (pStr(p, 'surface', 'mirror') == 'rough') {
      return LabReading.not(tr('A rough surface scatters the light in all directions: there is no single reflected ray to measure.'));
    }
    final i = pNum(p, 'i', 30).round();
    return LabReading.row([i, i]);
  }

  @override
  List<String> live(LabParams p) => pStr(p, 'surface', 'mirror') == 'rough'
      ? [tr('The light scatters (diffuse reflection)')]
      : ['∠i = ${pNum(p, 'i', 30).round()}°', '∠r = ${pNum(p, 'i', 30).round()}°'];

  @override
  LabGraph graph(LabParams p) => const LabGraph(0, 1, throughOrigin: true);

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    if (!rows.every((r) => r[0] == r[1])) return null;
    return tr('In all {n} readings ∠r = ∠i: the angle of reflection equals the angle of incidence.', {'n': rows.length});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final i = pNum(p, 'i', 30);
    final rough = pStr(p, 'surface', 'mirror') == 'rough';
    final o = Offset(w * 0.5, h * 0.8);
    final r = math.min(w * 0.36, h * 0.66);

    // The protractor, 0° along the normal, 90° along the mirror.
    final disc = Rect.fromCircle(center: o, radius: r);
    canvas.drawArc(disc, math.pi, math.pi, true, fill(const Color(0x14FFD54F)));
    canvas.drawArc(disc, math.pi, math.pi, false, stroke(LabInk.faint, 1.5));
    for (var d = -90; d <= 90; d += 5) {
      final a = d * math.pi / 180;
      final u = Offset(math.sin(a), -math.cos(a));
      final long = d % 10 == 0;
      canvas.drawLine(o + u * r, o + u * (r - (long ? 12 : 6)), stroke(LabInk.muted, 1));
      if (long && d.abs() < 90) label(canvas, '${d.abs()}', o + u * (r + 12), size: 10, color: LabInk.muted);
    }

    // The mirror (silvered at the back) or a rough surface.
    final left = Offset(w * 0.1, o.dy), right = Offset(w * 0.9, o.dy);
    if (rough) {
      final path = Path()..moveTo(left.dx, left.dy);
      final rnd = math.Random(3);
      for (var x = left.dx; x < right.dx; x += 10) {
        path.lineTo(x + 5, o.dy + (rnd.nextDouble() - 0.5) * 10);
      }
      path.lineTo(right.dx, right.dy);
      canvas.drawPath(path, stroke(const Color(0xFF8C7A5B), 3));
    } else {
      canvas.drawLine(left, right, stroke(const Color(0xFF8FA3B5), 5));
      for (var x = left.dx; x < right.dx; x += 12) {
        canvas.drawLine(Offset(x, o.dy + 3), Offset(x - 8, o.dy + 12), stroke(LabInk.muted, 1.2));
      }
    }
    label(canvas, rough ? tr('Rough surface') : tr('Plane mirror'), Offset(right.dx - 60, o.dy + 22), size: 13, bold: true);

    final beam = stroke(LabInk.red, 3);
    final ia = i * math.pi / 180;
    final inDir = Offset(math.sin(ia), math.cos(ia)); // down and to the right
    if (rough) {
      // Parallel rays in, scattered rays out.
      final rnd = math.Random(8);
      for (var k = -2; k <= 2; k++) {
        final hit = o + Offset(k * r * 0.12, 0);
        final start = hit - inDir * r * 0.95;
        canvas.drawLine(start, hit, beam);
        arrowHead(canvas, Offset.lerp(start, hit, 0.55)!, inDir, beam);
        final out = (rnd.nextDouble() - 0.5) * math.pi * 0.9;
        final dir = Offset(math.sin(out), -math.cos(out));
        canvas.drawLine(hit, hit + dir * r * 0.7, stroke(LabInk.red.withValues(alpha: 0.8), 2.5));
        arrowHead(canvas, hit + dir * r * 0.45, dir, beam);
      }
      label(canvas, tr('The light scatters (diffuse reflection)'), Offset(w / 2, h * 0.08), size: 16, bold: true, color: LabInk.red, halo: LabInk.paper);
      return;
    }

    // The normal at the point of incidence.
    dashed(canvas, o, o - Offset(0, r * 1.02), stroke(LabInk.ink, 1.5));
    label(canvas, tr('Normal'), o - Offset(-12, r * 0.84), size: 12, bold: true, centre: false, halo: const Color(0xFFFCF8EA));

    // Incident ray from the ray box, reflected ray out.
    final src = o - inDir * r * 0.92;
    canvas.drawLine(src, o, beam);
    arrowHead(canvas, Offset.lerp(src, o, 0.55)!, inDir, beam);
    final outDir = Offset(math.sin(ia), -math.cos(ia));
    final end = o + outDir * r * 0.92;
    canvas.drawLine(o, end, beam);
    arrowHead(canvas, Offset.lerp(o, end, 0.6)!, outDir, beam);
    canvas.save();
    canvas.translate(src.dx, src.dy);
    canvas.rotate(math.atan2(inDir.dy, inDir.dx));
    canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(-56, -15, 56, 30), const Radius.circular(5)), fill(const Color(0xFF3A3F46)));
    canvas.restore();
    label(canvas, tr('Ray box'), src - inDir * 40 + const Offset(0, -26), size: 12, bold: true);

    // The two angles, measured from the normal.
    final arcR = r * 0.26;
    final box = Rect.fromCircle(center: o, radius: arcR);
    canvas.drawArc(box, -math.pi / 2 - ia, ia, false, stroke(LabInk.blue, 2.5));
    canvas.drawArc(box.inflate(8), -math.pi / 2, ia, false, stroke(LabInk.green, 2.5));
    final mid = -math.pi / 2 - ia / 2, mid2 = -math.pi / 2 + ia / 2;
    label(canvas, '∠i = ${i.round()}°', o + Offset(math.cos(mid), math.sin(mid)) * (arcR + 40), size: 15, bold: true, color: LabInk.blue, halo: LabInk.paper);
    label(canvas, '∠r = ${i.round()}°', o + Offset(math.cos(mid2), math.sin(mid2)) * (arcR + 48), size: 15, bold: true, color: LabInk.green, halo: LabInk.paper);
    canvas.drawCircle(o, 4, fill(LabInk.ink));
    label(canvas, 'O', o + const Offset(-12, 14), size: 13, bold: true);
  }
}
