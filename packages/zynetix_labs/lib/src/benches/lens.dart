import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// An optical bench: a candle, a convex lens or a concave mirror, and a
/// screen the class moves until the image is sharp. The focal length is
/// hidden (lenses A, B, C) because finding it is the point.
class LensBench extends LabBench {
  const LensBench();

  static const focal = {'A': 10.0, 'B': 15.0, 'C': 20.0};
  static const candleCm = 4.0;
  static const flameCm = 1.5;

  @override
  String get kind => 'lens';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'device': 'lens', 'item': 'B', 'u': 30.0, 'screen': 50.0, 'rays': true, 'marks': false};

  @override
  LabParams get preview => {...defaults, 'screen': 30.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('device', tr('Use'), [('lens', tr('Convex lens')), ('mirror', tr('Concave mirror'))]),
        LabChoice('item', lens(p) ? tr('Which lens') : tr('Which mirror'), [('A', 'A'), ('B', 'B'), ('C', 'C')]),
        LabSlider('u', tr('Candle distance u'), 5, 60, divisions: 55, unit: ' cm'),
        LabSlider('screen', tr('Screen distance'), 5, 120, divisions: 230, unit: ' cm', decimals: 1),
        LabToggle('rays', tr('Ray diagram')),
        LabToggle('marks', tr('Show F and 2F')),
      ];

  static bool lens(LabParams p) => pStr(p, 'device', 'lens') != 'mirror';
  static double f(LabParams p) => focal[pStr(p, 'item', 'B')] ?? 15;

  /// Image distance (cm, positive = real); null when the object is at F.
  static double? imageDistance(LabParams p) {
    final u = pNum(p, 'u', 30), ff = f(p);
    if ((u - ff).abs() < 1e-9) return null;
    return u * ff / (u - ff);
  }

  /// How far the screen is from the sharp position (cm); infinite when no
  /// real image can reach it.
  static double mismatch(LabParams p) {
    final v = imageDistance(p);
    if (v == null || v <= 0 || v > 120) return double.infinity;
    return (pNum(p, 'screen', 50) - v).abs();
  }

  static bool sharp(LabParams p) {
    final v = imageDistance(p);
    return v != null && v > 0 && mismatch(p) <= math.max(0.5, v * 0.015);
  }

  String _device(LabParams p) => '${lens(p) ? tr('Convex lens') : tr('Concave mirror')} ${pStr(p, 'item', 'B')}';

  static String nature(LabParams p) {
    final v = imageDistance(p);
    if (v == null) return tr('No image: the rays come out parallel');
    if (v < 0) return tr('Virtual, erect, magnified');
    final m = v / pNum(p, 'u', 30);
    if ((m - 1).abs() < 0.03) return tr('Real, inverted, same size');
    return m > 1 ? tr('Real, inverted, magnified') : tr('Real, inverted, diminished');
  }

  @override
  List<LabColumn> get columns => [
        LabColumn(tr('Lens or mirror')),
        LabColumn(tr('u (cm)'), 0),
        LabColumn(tr('v (cm)'), 1),
        LabColumn(tr('f = uv ÷ (u + v) (cm)'), 1),
        LabColumn(tr('Image')),
      ];

  @override
  LabReading read(LabParams p) {
    final v = imageDistance(p);
    if (v == null) return LabReading.not(tr('The candle is at the focus: the image is at infinity. Move the candle.'));
    if (v < 0) return LabReading.not(tr('No image forms on the screen: the image is virtual. Move the candle further away.'));
    if (v > 120) return LabReading.not(tr('The image is too far for this bench. Move the candle further away.'));
    if (!sharp(p)) return LabReading.not(tr('The image on the screen is blurred. Move the screen until it is sharp.'));
    final u = pNum(p, 'u', 30), sv = pNum(p, 'screen', 50);
    return LabReading.row([_device(p), u.round(), sv, (u * sv / (u + sv) * 10).round() / 10, nature(p)]);
  }

  @override
  List<String> live(LabParams p) {
    final v = imageDistance(p);
    final state = v == null || v < 0
        ? tr('No image on the screen')
        : v > 120
            ? tr('Image beyond the bench')
            : sharp(p)
                ? tr('Image: sharp')
                : tr('Image: blurred');
    return ['u = ${pNum(p, 'u', 30).round()} cm', tr('Screen at {x} cm', {'x': pNum(p, 'screen', 50).toStringAsFixed(1)}), state];
  }

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final by = <String, List<double>>{};
    for (final r in rows) {
      by.putIfAbsent('${r[0]}', () => []).add((r[3] as num).toDouble());
    }
    return [
      for (final e in by.entries)
        tr('{what}: average focal length {f} cm from {n} readings.', {'what': e.key, 'f': (e.value.reduce((a, b) => a + b) / e.value.length).toStringAsFixed(1), 'n': e.value.length}),
    ].join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final isLens = lens(p);
    final ff = f(p), u = pNum(p, 'u', 30), scr = pNum(p, 'screen', 50);
    final v = imageDistance(p);
    // World: the lens at x = 0 with room for 65 cm in front and 125 behind;
    // the mirror at the right with everything in front of it.
    final lo = isLens ? -66.0 : -126.0, hi = isLens ? 126.0 : 8.0;
    final sx = (w - 40) / (hi - lo);
    final axisY = h * 0.42;
    final benchY = h * 0.84;
    // Heights are drawn larger than lengths, as textbook diagrams do, but
    // never so large that the candle or its image leaves the picture.
    final hImg = v == null ? 0.0 : math.min(candleCm * v.abs() / u, 30.0);
    final up = math.max(candleCm + 1.5, v != null && v < 0 ? hImg + 1.5 : 0);
    final down = math.max(18.0, v != null && v > 0 ? hImg + 1.5 : 0);
    final sy = math.min(sx * 3.2, math.min((axisY - 24) / up, (benchY - axisY - 34) / down));
    Offset map(double x, double y) => Offset(20 + (x - lo) * sx, axisY - y * sy);

    // Bench and scale.
    canvas.drawLine(map(lo, 0), map(hi, 0), stroke(LabInk.muted, 1.5));
    canvas.drawRect(Rect.fromLTRB(10, benchY, w - 10, benchY + 14), fill(const Color(0xFFD9CBB0)));
    for (var cm = (lo / 10).ceil() * 10; cm <= hi; cm += 10) {
      final x = map(cm.toDouble(), 0).dx;
      canvas.drawLine(Offset(x, benchY), Offset(x, benchY + 8), stroke(LabInk.ink, 1));
      label(canvas, '${cm.abs()}', Offset(x, benchY + 24), size: 11, color: LabInk.muted);
    }
    void stand(double x, double fromY) => canvas.drawLine(Offset(map(x, 0).dx, fromY), Offset(map(x, 0).dx, benchY), stroke(LabInk.ink, 3));

    // Lens or mirror at x = 0, 11 cm either side of the axis.
    final top = map(0, 11), bottom = map(0, -11);
    if (isLens) {
      final lensRect = Rect.fromCenter(center: map(0, 0), width: 20, height: bottom.dy - top.dy);
      canvas.drawOval(lensRect, fill(LabInk.glass));
      canvas.drawOval(lensRect, stroke(LabInk.blue, 2));
      stand(0, bottom.dy);
    } else {
      // A shallow arc through the pole, so rays meet it close to x = 0.
      final half = (bottom.dy - top.dy) / 2;
      final r = half * 4;
      final c = map(0, 0) + Offset(r, 0);
      final sweep = 2 * math.asin(half / r);
      canvas.drawArc(Rect.fromCircle(center: c, radius: r), math.pi - sweep / 2, sweep, false, stroke(LabInk.blue, 4));
      for (var k = -4; k <= 4; k++) {
        final a = math.pi + k * sweep / 9;
        final pt = c + Offset(math.cos(a), math.sin(a)) * r;
        canvas.drawLine(pt, pt + const Offset(7, 5), stroke(LabInk.muted, 1));
      }
      stand(0, bottom.dy);
    }

    // F and 2F, when the teacher shows them.
    if (pBool(p, 'marks')) {
      final side = isLens ? [1.0, -1.0] : [-1.0];
      for (final s in side) {
        for (final (k, name) in [(1.0, 'F'), (2.0, '2F')]) {
          final at = map(s * k * ff, 0);
          canvas.drawCircle(at, 3.5, fill(LabInk.ink));
          label(canvas, name, at + const Offset(0, 14), size: 12, bold: true);
        }
      }
    }

    // Candle (a short candle on a holder) at distance u in front.
    final cx = -u;
    final wick = map(cx, candleCm - flameCm);
    final body = Rect.fromLTRB(wick.dx - 7, wick.dy, wick.dx + 7, map(cx, 0).dy + 4);
    canvas.drawRect(body, fill(const Color(0xFFF4EEDD)));
    canvas.drawRect(body, stroke(LabInk.muted, 1.2));
    stand(cx, body.bottom);
    _flame(canvas, wick, map(cx, candleCm), 1 + 0.06 * math.sin(t * 9), 0);

    // Screen: in front of the mirror it sits below the axis, out of the light's way.
    final sxPos = isLens ? scr : -scr;
    final sTop = isLens ? map(sxPos, 18) : map(sxPos, 1);
    final sBot = map(sxPos, -18);
    final screenRect = Rect.fromLTRB(sTop.dx - 4, sTop.dy, sTop.dx + 4, sBot.dy);
    canvas.drawRect(screenRect, fill(Colors.white));
    canvas.drawRect(screenRect, stroke(LabInk.ink, 1.5));
    stand(sxPos, sBot.dy);
    label(canvas, tr('Screen'), Offset(sTop.dx, sTop.dy - 12), size: 12, color: LabInk.muted);

    // What falls on the screen: a sharp inverted flame, a blur, or a glow.
    final mm = mismatch(p);
    if (v != null && v > 0 && v <= 120) {
      final m = v / u;
      final blur = math.min(mm * 1.6, 18.0);
      canvas.save();
      canvas.clipRect(screenRect.inflate(10 + blur));
      _flame(canvas, map(sxPos, -(candleCm - flameCm) * m), map(sxPos, -candleCm * m), 1, blur, screen: true);
      canvas.restore();
    } else {
      canvas.drawCircle(map(sxPos, -3), 16, Paint()
        ..color = const Color(0x55F2B33D)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 12));
    }

    // Two rays from the flame tip, and the image they make.
    if (pBool(p, 'rays') && v != null) {
      final ray = stroke(LabInk.red.withValues(alpha: 0.8), 2);
      final ghost = stroke(LabInk.red.withValues(alpha: 0.4), 1.6);
      final obj = Offset(cx, candleCm);
      final img = Offset(isLens ? v : -v, -candleCm * v / u);
      Offset w2s(Offset q) => map(q.dx, q.dy);
      final far = isLens ? hi : lo;
      canvas.save();
      canvas.clipRect(Rect.fromLTRB(0, 0, w, benchY));
      if (isLens) {
        // Parallel to the axis, then through F on the other side.
        canvas.drawLine(w2s(obj), w2s(Offset(0, candleCm)), ray);
        final dir = Offset(ff, 0) - Offset(0, candleCm);
        canvas.drawLine(w2s(Offset(0, candleCm)), w2s(Offset(0, candleCm) + dir * (far / dir.dx)), ray);
        // Straight through the optical centre.
        final d2 = Offset.zero - obj;
        canvas.drawLine(w2s(obj), w2s(obj + d2 * ((far - obj.dx) / d2.dx)), ray);
      } else {
        // Parallel to the axis, reflected through F.
        canvas.drawLine(w2s(obj), w2s(Offset(0, candleCm)), ray);
        final dir = Offset(-ff, 0) - Offset(0, candleCm);
        canvas.drawLine(w2s(Offset(0, candleCm)), w2s(Offset(0, candleCm) + dir * (far / dir.dx)), ray);
        // To the pole, reflected at the same angle.
        canvas.drawLine(w2s(obj), w2s(Offset.zero), ray);
        final back = Offset(obj.dx, -obj.dy);
        canvas.drawLine(w2s(Offset.zero), w2s(back * (far / back.dx)), ray);
      }
      if (v < 0) {
        // Virtual image: trace the rays back to where they seem to come from.
        dashed(canvas, w2s(Offset(0, candleCm)), w2s(img), ghost);
        dashed(canvas, w2s(isLens ? obj : Offset.zero), w2s(img), ghost);
        _flame(canvas, w2s(img + Offset(0, flameCm * v / u)), w2s(img), 1, 0, ghost: true);
      }
      canvas.restore();
    }

    // Distances along the bench: u to the candle, and the screen's distance.
    void dimension(double x0, double x1, double y, String text) {
      final a = Offset(map(x0, 0).dx, y), b = Offset(map(x1, 0).dx, y);
      if ((b - a).distance < 4) return;
      final pen = stroke(LabInk.blue, 1.5);
      canvas.drawLine(a, b, pen);
      arrowHead(canvas, a, a - b, pen, size: 7);
      arrowHead(canvas, b, b - a, pen, size: 7);
      label(canvas, text, (a + b) / 2 - const Offset(0, 11), size: 13, bold: true, color: LabInk.blue, halo: LabInk.paper);
    }

    dimension(cx, 0, benchY - 12, 'u = ${u.round()} cm');
    if (isLens) {
      dimension(0, sxPos, benchY - 12, tr('Screen at {x} cm', {'x': scr.toStringAsFixed(1)}));
    } else {
      dimension(sxPos, 0, benchY - 36, tr('Screen at {x} cm', {'x': scr.toStringAsFixed(1)}));
    }
  }

  /// A candle flame from [foot] to [tip]; blurred when out of focus.
  void _flame(Canvas canvas, Offset foot, Offset tip, double flicker, double blur, {bool screen = false, bool ghost = false}) {
    final len = (tip - foot).distance * flicker;
    if (len < 1) return;
    final u = (tip - foot) / (tip - foot).distance;
    final n = Offset(-u.dy, u.dx);
    final t = foot + u * len;
    final wdt = len * 0.32;
    final path = Path()
      ..moveTo(foot.dx, foot.dy)
      ..quadraticBezierTo((foot + u * len * 0.3 + n * wdt).dx, (foot + u * len * 0.3 + n * wdt).dy, t.dx, t.dy)
      ..quadraticBezierTo((foot + u * len * 0.3 - n * wdt).dx, (foot + u * len * 0.3 - n * wdt).dy, foot.dx, foot.dy)
      ..close();
    final paint = Paint()..color = ghost ? const Color(0x66F2B33D) : const Color(0xFFF2A23A);
    if (blur > 0.3) paint.maskFilter = MaskFilter.blur(BlurStyle.normal, blur);
    canvas.drawPath(path, paint);
    if (!ghost && blur <= 0.3) {
      final inner = Path()
        ..moveTo(foot.dx, foot.dy)
        ..quadraticBezierTo((foot + u * len * 0.25 + n * wdt * 0.45).dx, (foot + u * len * 0.25 + n * wdt * 0.45).dy, (foot + u * len * 0.6).dx, (foot + u * len * 0.6).dy)
        ..quadraticBezierTo((foot + u * len * 0.25 - n * wdt * 0.45).dx, (foot + u * len * 0.25 - n * wdt * 0.45).dy, foot.dx, foot.dy)
        ..close();
      canvas.drawPath(inner, fill(const Color(0xFFFFF1B8)));
    }
  }
}
