import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// A candle in front of a box with a pinhole: light travels in straight
/// lines, so the image on the tracing-paper screen is upside down and
/// image ÷ object = v ÷ u.
class PinholeBench extends LabBench {
  const PinholeBench();

  /// Candle height (cm), base to flame tip; the hole is at half its height.
  static const objectCm = 12.0;
  static const holeY = objectCm / 2;

  @override
  String get kind => 'pinhole';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'u': 40.0, 'v': 20.0, 'hole': 'small'};

  @override
  List<LabControl> controls(LabParams p) => [
        LabSlider('u', tr('Candle to pinhole (u)'), 20, 100, divisions: 16, unit: ' cm'),
        LabSlider('v', tr('Length of the box (v)'), 10, 30, divisions: 4, unit: ' cm'),
        LabChoice('hole', tr('Hole'), [('small', tr('One small hole')), ('big', tr('One big hole')), ('two', tr('Two small holes'))]),
      ];

  static double imageCm(LabParams p) => objectCm * pNum(p, 'v', 20) / pNum(p, 'u', 40);

  @override
  List<LabColumn> get columns => [
        LabColumn(tr('u (cm)'), 0),
        LabColumn(tr('v (cm)'), 0),
        LabColumn(tr('Image height (cm)'), 1),
        LabColumn(tr('Image ÷ object'), 2),
        LabColumn(tr('v ÷ u'), 2),
      ];

  @override
  LabReading read(LabParams p) {
    switch (pStr(p, 'hole', 'small')) {
      case 'big':
        return LabReading.not(tr('A big hole makes the image blurred. Use one small hole to measure.'));
      case 'two':
        return LabReading.not(tr('Two holes make two images. Use one small hole to measure.'));
    }
    final u = pNum(p, 'u', 40), v = pNum(p, 'v', 20);
    final img = (imageCm(p) * 10).round() / 10;
    return LabReading.row([u.round(), v.round(), img, img / objectCm, v / u]);
  }

  @override
  List<String> live(LabParams p) => [
        tr('Candle {x} cm tall', {'x': objectCm.round()}),
        tr('Image {x} cm, upside down', {'x': imageCm(p).toStringAsFixed(1)}),
      ];

  @override
  LabGraph graph(LabParams p) => LabGraph(0, 2, fromZero: false, include: (r) => r[1] == pNum(p, 'v', 20).round());

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final same = rows.every((r) => ((r[3] as num) - (r[4] as num)).abs() < 0.02);
    return [
      if (same) tr('Image ÷ object = v ÷ u in all {n} readings: the nearer the candle or the longer the box, the bigger the image.', {'n': rows.length}),
      tr('The image is always upside down, because light travels in straight lines through the hole.'),
    ].join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final u = pNum(p, 'u', 40), v = pNum(p, 'v', 20);
    final hole = pStr(p, 'hole', 'small');
    // A dim room.
    canvas.drawRect(Offset.zero & size, fill(const Color(0xFF23262C)));
    final sx = w * 0.84 / 130;
    final sy = math.min(sx * 1.6, h * 0.6 / 26);
    final axisY = h * 0.44;
    Offset map(double x, double y) => Offset(w * 0.07 + x * sx, axisY - (y - holeY) * sy);

    // Floor, the candle on its stand.
    final floorY = map(0, -7).dy;
    canvas.drawLine(Offset(0, floorY), Offset(w, floorY), stroke(const Color(0xFF5B6168), 2));
    canvas.drawRect(Rect.fromPoints(map(-2, -7), map(2, 0)), fill(const Color(0xFF6E757D)));
    _candle(canvas, map(0, 0), map(0, objectCm), sx, sy, t);

    // The box: a dark tube with the pinhole in front and tracing paper at the back.
    final front = map(u, holeY + 11), back = map(u + v, holeY - 11);
    final box = Rect.fromPoints(front, back);
    canvas.drawRect(box, fill(const Color(0xFF15171B)));
    canvas.drawRect(Rect.fromLTRB(box.left - 5, box.top, box.left, box.bottom), fill(const Color(0xFF3A3F46)));
    canvas.drawRect(Rect.fromLTRB(box.right - 3, box.top, box.right + 3, box.bottom), fill(const Color(0xFFEDE7D2)));
    canvas.drawRect(box, stroke(const Color(0xFF8C929A), 1.5));
    canvas.drawRect(Rect.fromPoints(map(u + v / 2 - 1.5, -7), map(u + v / 2 + 1.5, holeY - 11)), fill(const Color(0xFF6E757D)));

    // The holes.
    final holes = switch (hole) { 'two' => [holeY - 1.5, holeY + 1.5], _ => [holeY] };
    final gap = hole == 'big' ? 1.6 : 0.25;
    for (final y in holes) {
      canvas.drawRect(Rect.fromPoints(map(u, y + gap), map(u, y - gap)).inflate(3).translate(-2.5, 0), fill(const Color(0xFFFFF3C4)));
    }

    // Rays from the flame tip and the candle foot, crossing at each hole.
    final ray = stroke(const Color(0x99FFE680), 1.4);
    for (final y in holes) {
      for (final dy in hole == 'big' ? [-gap, gap] : [0.0]) {
        final through = y + dy;
        for (final from in [objectCm, 0.0]) {
          dashed(canvas, map(0, from), map(u, through), ray);
          // Inside the box the light goes on to the screen (or the box walls).
          canvas.save();
          canvas.clipRect(box);
          canvas.drawLine(map(u, through), map(u + v, through - (from - through) * v / u), ray);
          canvas.restore();
        }
      }
    }

    // The image on the screen, upside down: one sharp, one blurred, or two.
    for (final y in holes) {
      final top = y - (objectCm - y) * v / u, foot = y + (y - 0) * v / u;
      _image(canvas, map(u + v, foot), map(u + v, top), blur: hole == 'big');
    }
    final note = switch (hole) { 'big' => tr('Blurred image'), 'two' => tr('Two images'), _ => tr('Image: upside down') };
    label(canvas, note, Offset(box.right + 8, box.top - 16), size: 13, bold: true, color: Colors.white, centre: false);
    label(canvas, tr('Pinhole'), map(u, holeY + 13), size: 12, color: const Color(0xFFB9BFC6));
    label(canvas, tr('Tracing paper'), Offset(box.right + 8, box.bottom - 20), size: 12, color: const Color(0xFFB9BFC6), centre: false);

    // u and v measured along the floor.
    final dimY = floorY + 22;
    void dim(double x0, double x1, String text) {
      final a = Offset(map(x0, 0).dx, dimY), b = Offset(map(x1, 0).dx, dimY);
      final pen = stroke(const Color(0xFFB9BFC6), 1.3);
      canvas.drawLine(a, b, pen);
      arrowHead(canvas, a, a - b, pen, size: 7);
      arrowHead(canvas, b, b - a, pen, size: 7);
      label(canvas, text, (a + b) / 2 + const Offset(0, 14), size: 13, bold: true, color: Colors.white);
    }

    dim(0, u, 'u = ${u.round()} cm');
    dim(u, u + v, 'v = ${v.round()} cm');
  }

  void _candle(Canvas canvas, Offset foot, Offset tip, double sx, double sy, double t) {
    final wax = Offset(foot.dx, foot.dy + (tip.dy - foot.dy) * 0.72);
    final width = math.max(10.0, 2.2 * sx);
    canvas.drawRect(Rect.fromLTRB(foot.dx - width / 2, wax.dy, foot.dx + width / 2, foot.dy), fill(const Color(0xFFF2EEE3)));
    final flicker = 1 + 0.05 * math.sin(t * 13);
    final top = Offset(tip.dx, wax.dy + (tip.dy - wax.dy) * flicker);
    canvas.drawCircle(Offset(foot.dx, (wax.dy + top.dy) / 2), (wax.dy - top.dy) * 0.9,
        Paint()
          ..color = const Color(0x55FFD54F)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 14));
    final flame = Path()
      ..moveTo(foot.dx - width * 0.35, wax.dy)
      ..quadraticBezierTo(foot.dx - width * 0.5, (wax.dy + top.dy) / 2, top.dx, top.dy)
      ..quadraticBezierTo(foot.dx + width * 0.5, (wax.dy + top.dy) / 2, foot.dx + width * 0.35, wax.dy)
      ..close();
    canvas.drawPath(flame, fill(const Color(0xFFFFC43D)));
  }

  /// The candle's image between [foot] and [tip] (tip below the foot: upside down).
  void _image(Canvas canvas, Offset foot, Offset tip, {bool blur = false}) {
    final len = tip.dy - foot.dy;
    final wax = Offset(foot.dx, foot.dy + len * 0.72);
    Paint paintOf(Color c) => Paint()
      ..color = blur ? c.withValues(alpha: 0.55) : c
      ..maskFilter = blur ? const MaskFilter.blur(BlurStyle.normal, 5) : null;
    final width = math.max(4.0, len.abs() * 0.18);
    canvas.drawRect(Rect.fromLTRB(foot.dx - width / 2 - 8, foot.dy, foot.dx + width / 2 - 8, wax.dy), paintOf(const Color(0xFFE8E0C8)));
    final flame = Path()
      ..moveTo(foot.dx - 8 - width * 0.35, wax.dy)
      ..quadraticBezierTo(foot.dx - 8 - width * 0.5, (wax.dy + tip.dy) / 2, tip.dx - 8, tip.dy)
      ..quadraticBezierTo(foot.dx - 8 + width * 0.5, (wax.dy + tip.dy) / 2, foot.dx - 8 + width * 0.35, wax.dy)
      ..close();
    canvas.drawPath(flame, paintOf(const Color(0xFFFFC43D)));
  }
}
