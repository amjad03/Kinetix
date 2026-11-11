import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/bench.dart';

/// Shared drawing for the PUC practical benches: metal, wood and glass
/// finishes, a magnifier inset and a note card, all drawn like a careful
/// practical-record figure on paper.
abstract final class Kit {
  static const steelLight = Color(0xFFE4E8EC), steelMid = Color(0xFFB7BEC6), steelDark = Color(0xFF7D868F);
  static const brass = Color(0xFFC9A248), brassDark = Color(0xFF8E6F25);
  static const wood = Color(0xFFC89B62), woodDark = Color(0xFF8A6239);
  static const enamel = Color(0xFF2F4A3A);
  static const bench = Color(0xFFE9E1D0);

  /// Brushed steel across [r] (light along the top edge).
  static Paint steel(Rect r, {bool vertical = false}) => Paint()
    ..shader = LinearGradient(
      begin: vertical ? Alignment.centerLeft : Alignment.topCenter,
      end: vertical ? Alignment.centerRight : Alignment.bottomCenter,
      colors: const [steelDark, steelLight, steelMid, steelDark],
      stops: const [0, 0.3, 0.75, 1],
    ).createShader(r);

  static Paint brassFill(Rect r, {bool vertical = false}) => Paint()
    ..shader = LinearGradient(
      begin: vertical ? Alignment.centerLeft : Alignment.topCenter,
      end: vertical ? Alignment.centerRight : Alignment.bottomCenter,
      colors: const [brassDark, Color(0xFFE8CB7A), brass, brassDark],
      stops: const [0, 0.35, 0.7, 1],
    ).createShader(r);

  static Paint woodFill(Rect r) => Paint()
    ..shader = LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: const [Color(0xFFD9B07A), wood, woodDark]).createShader(r);

  /// A cylinder seen from the side (shaded across its width).
  static Paint cylinder(Rect r, Color base, {bool vertical = true}) => Paint()
    ..shader = LinearGradient(
      begin: vertical ? Alignment.centerLeft : Alignment.topCenter,
      end: vertical ? Alignment.centerRight : Alignment.bottomCenter,
      colors: [Color.lerp(base, Colors.black, 0.35)!, Color.lerp(base, Colors.white, 0.45)!, base, Color.lerp(base, Colors.black, 0.45)!],
      stops: const [0, 0.3, 0.65, 1],
    ).createShader(r);

  /// A shaded sphere.
  static void ball(Canvas canvas, Offset c, double r, Color base) {
    canvas.drawCircle(
      c,
      r,
      Paint()
        ..shader = RadialGradient(center: const Alignment(-0.35, -0.4), colors: [Color.lerp(base, Colors.white, 0.7)!, base, Color.lerp(base, Colors.black, 0.55)!], stops: const [0, 0.45, 1])
            .createShader(Rect.fromCircle(center: c, radius: r)),
    );
    canvas.drawCircle(c, r, stroke(Color.lerp(base, Colors.black, 0.6)!, 1.2));
  }

  /// The laboratory table: a strip of [r] with its front edge.
  static void table(Canvas canvas, Rect r) {
    canvas.drawRect(r, fill(bench));
    canvas.drawLine(r.topLeft, r.topRight, stroke(const Color(0xFFBDB29A), 2));
  }

  /// A circular magnifier at [c] of radius [r]: [draw] paints inside it
  /// (already clipped), then the rim and a [caption] under it.
  static void magnifier(Canvas canvas, Offset c, double r, void Function(Canvas canvas) draw, {String? caption, double captionSize = 15}) {
    canvas.drawCircle(c + const Offset(3, 4), r + 6, fill(const Color(0x22000000)));
    canvas.drawCircle(c, r, fill(Colors.white));
    canvas.save();
    canvas.clipPath(Path()..addOval(Rect.fromCircle(center: c, radius: r)));
    draw(canvas);
    canvas.restore();
    canvas.drawCircle(c, r + 3, stroke(const Color(0xFF3A3F46), 6));
    canvas.drawCircle(c, r - 1, stroke(const Color(0x33FFFFFF), 2));
    if (caption != null) label(canvas, caption, c + Offset(0, r + 22), size: captionSize, bold: true, color: LabInk.ink, halo: LabInk.paper);
  }

  /// A microscope field of view: a lit circle with a soft dark rim.
  static void field(Canvas canvas, Offset c, double r, Color light, void Function(Canvas canvas) draw, {String? caption}) {
    canvas.drawCircle(c, r + 14, fill(const Color(0xFF1E2226)));
    canvas.save();
    canvas.clipPath(Path()..addOval(Rect.fromCircle(center: c, radius: r)));
    canvas.drawCircle(c, r, Paint()..shader = RadialGradient(colors: [Color.lerp(light, Colors.white, 0.35)!, light]).createShader(Rect.fromCircle(center: c, radius: r)));
    draw(canvas);
    canvas.drawCircle(
      c,
      r,
      Paint()..shader = RadialGradient(colors: const [Color(0x00000000), Color(0x00000000), Color(0x66000000)], stops: const [0, 0.82, 1]).createShader(Rect.fromCircle(center: c, radius: r)),
    );
    canvas.restore();
    if (caption != null) label(canvas, caption, c + Offset(0, r + 32), size: 15, color: LabInk.muted);
  }

  /// A note card: a heading and lines of text, top-left at [at], [width] wide.
  /// Returns its height.
  static double card(Canvas canvas, Offset at, double width, String heading, List<String> lines, {double size = 15, Color accent = LabInk.blue}) {
    final pad = size * 0.8;
    final head = layoutText(heading, size * 1.05, accent, bold: true)..layout(maxWidth: width - 2 * pad);
    final bodies = [for (final l in lines) layoutText(l, size, LabInk.ink)..layout(maxWidth: width - 2 * pad)];
    var h = pad + head.height + size * 0.4;
    for (final b in bodies) {
      h += b.height + size * 0.3;
    }
    h += pad * 0.7;
    final r = RRect.fromRectAndRadius(Rect.fromLTWH(at.dx, at.dy, width, h), const Radius.circular(10));
    canvas.drawRRect(r.shift(const Offset(2, 3)), fill(const Color(0x14000000)));
    canvas.drawRRect(r, fill(Colors.white));
    canvas.drawRRect(r, stroke(const Color(0xFFD9D4C7), 1.2));
    canvas.drawRect(Rect.fromLTWH(at.dx, at.dy + 8, 4, h - 16), fill(accent));
    var y = at.dy + pad;
    head.paint(canvas, Offset(at.dx + pad, y));
    y += head.height + size * 0.4;
    for (final b in bodies) {
      b.paint(canvas, Offset(at.dx + pad, y));
      y += b.height + size * 0.3;
    }
    return h;
  }

  /// A leader line from [from] to a label at [to].
  static void callout(Canvas canvas, Offset from, Offset to, String text, {double size = 13, Color color = LabInk.ink}) {
    canvas.drawLine(from, to, stroke(color.withValues(alpha: 0.7), 1.2));
    canvas.drawCircle(from, 2.5, fill(color));
    final tp = layoutText(text, size, color, bold: true);
    final left = to.dx >= from.dx;
    final o = Offset(left ? to.dx + 4 : to.dx - 4 - tp.width, to.dy - tp.height / 2);
    canvas.drawRRect(RRect.fromRectAndRadius((o & tp.size).inflate(2.5), const Radius.circular(3)), fill(const Color(0xEEFFFFFF)));
    tp.paint(canvas, o);
  }

  /// A plug-type resistance box with [ohms] unplugged, drawn in [r].
  static void resistanceBox(Canvas canvas, Rect r, String text) {
    canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(4)), woodFill(r));
    final top = Rect.fromLTWH(r.left + 6, r.top + 6, r.width - 12, r.height * 0.42);
    canvas.drawRect(top, fill(const Color(0xFF1F1A16)));
    final n = math.max(3, (top.width / 22).floor());
    for (var i = 0; i < n; i++) {
      final x = top.left + top.width * (i + 0.5) / n;
      canvas.drawCircle(Offset(x, top.center.dy), math.min(7, top.height * 0.28), brassFill(Rect.fromCircle(center: Offset(x, top.center.dy), radius: 7)));
    }
    label(canvas, text, Offset(r.center.dx, r.top + r.height * 0.74), size: math.min(15, r.height * 0.24), bold: true, color: const Color(0xFF2A1E12));
  }

  /// A brass terminal.
  static void terminal(Canvas canvas, Offset c, [double r = 5]) {
    canvas.drawCircle(c, r, brassFill(Rect.fromCircle(center: c, radius: r)));
    canvas.drawCircle(c, r, stroke(brassDark, 1));
  }

  /// A plug key (open or closed) centred at [c].
  static void plugKey(Canvas canvas, Offset c, bool closed, {String? name}) {
    final base = Rect.fromCenter(center: c, width: 54, height: 24);
    canvas.drawRRect(RRect.fromRectAndRadius(base, const Radius.circular(4)), fill(const Color(0xFF2B2420)));
    canvas.drawRect(Rect.fromLTWH(base.left + 6, base.top + 5, 18, 14), brassFill(base));
    canvas.drawRect(Rect.fromLTWH(base.right - 24, base.top + 5, 18, 14), brassFill(base));
    if (closed) {
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: c - const Offset(0, 8), width: 12, height: 22), const Radius.circular(3)), fill(const Color(0xFF111111)));
    } else {
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: c + const Offset(36, -12), width: 12, height: 22), const Radius.circular(3)), fill(const Color(0xFF111111)));
    }
    if (name != null) label(canvas, name, c + const Offset(0, 26), size: 14, bold: true);
  }

  /// A cell (two plates) from [a] to [b] horizontally, long plate on the left.
  static void cell(Canvas canvas, Offset c, {String? name}) {
    canvas.drawLine(c + const Offset(-5, -16), c + const Offset(-5, 16), stroke(LabInk.ink, 2.5));
    canvas.drawLine(c + const Offset(5, -9), c + const Offset(5, 9), stroke(LabInk.ink, 6));
    if (name != null) label(canvas, name, c - const Offset(0, 30), size: 14, bold: true);
  }

  /// A moving-coil meter with a [lo]…[hi] scale, the needle at [value]; a
  /// centre-zero galvanometer when lo is negative.
  static void dial(Canvas canvas, Offset c, double r, String letter, double value, double lo, double hi, {int majors = 6, String? unit, String? reading}) {
    final body = Rect.fromCenter(center: c, width: r * 2.3, height: r * 1.9);
    canvas.drawRRect(RRect.fromRectAndRadius(body.shift(const Offset(3, 4)), const Radius.circular(10)), fill(const Color(0x22000000)));
    canvas.drawRRect(RRect.fromRectAndRadius(body, const Radius.circular(10)), fill(const Color(0xFF262A2F)));
    final face = Rect.fromCenter(center: c - Offset(0, r * 0.12), width: r * 2.0, height: r * 1.3);
    canvas.drawRRect(RRect.fromRectAndRadius(face, const Radius.circular(6)), fill(const Color(0xFFFBF8EE)));
    final pivot = Offset(c.dx, face.bottom - r * 0.1);
    final rr = r * 0.98;
    const a0 = math.pi * 1.22, sweep = math.pi * 0.56;
    canvas.drawArc(Rect.fromCircle(center: pivot, radius: rr), a0, sweep, false, stroke(LabInk.ink, 1.4));
    final n = majors * 5;
    for (var i = 0; i <= n; i++) {
      final a = a0 + sweep * i / n;
      final u = Offset(math.cos(a), math.sin(a));
      final major = i % 5 == 0;
      canvas.drawLine(pivot + u * rr, pivot + u * (rr - (major ? r * 0.13 : r * 0.07)), stroke(LabInk.ink, major ? 1.6 : 1));
      if (major) {
        final v = lo + (hi - lo) * i / n;
        label(canvas, _num(v), pivot + u * (rr - r * 0.25), size: r * 0.13, color: LabInk.ink);
      }
    }
    final f = ((value - lo) / (hi - lo)).clamp(-0.03, 1.03);
    final a = a0 + sweep * f;
    canvas.drawLine(pivot, pivot + Offset(math.cos(a), math.sin(a)) * rr * 0.96, stroke(LabInk.red, 2));
    canvas.drawCircle(pivot, r * 0.07, fill(LabInk.ink));
    label(canvas, letter, Offset(c.dx, face.bottom - r * 0.38), size: r * 0.2, bold: true);
    if (unit != null) label(canvas, unit, Offset(face.right - r * 0.2, face.bottom - r * 0.16), size: r * 0.11, color: LabInk.muted);
    terminal(canvas, Offset(body.left + r * 0.35, body.bottom - r * 0.16), r * 0.09);
    terminal(canvas, Offset(body.right - r * 0.35, body.bottom - r * 0.16), r * 0.09);
    if (reading != null) label(canvas, reading, Offset(c.dx, body.bottom + 16), size: 15, bold: true, halo: const Color(0xFFFFF4DC));
  }

  static String _num(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1);

  /// A retort stand: base at [base], rod [height] tall; returns the rod top.
  static Offset stand(Canvas canvas, Offset base, double height) {
    final foot = Rect.fromCenter(center: base - const Offset(0, 6), width: height * 0.45, height: 12);
    canvas.drawRRect(RRect.fromRectAndRadius(foot, const Radius.circular(3)), fill(const Color(0xFF3A3F46)));
    final rod = Rect.fromLTWH(base.dx - foot.width * 0.32 - 4, base.dy - height, 8, height - 8);
    canvas.drawRect(rod, steel(rod, vertical: true));
    return Offset(rod.center.dx, rod.top);
  }

  /// A Bunsen burner with its base centre at [base]; [lit] draws the flame.
  static void burner(Canvas canvas, Offset base, double size, {bool lit = true, double t = 0}) {
    final foot = Rect.fromCenter(center: base - Offset(0, size * 0.06), width: size * 0.7, height: size * 0.12);
    canvas.drawRRect(RRect.fromRectAndRadius(foot, const Radius.circular(4)), fill(const Color(0xFF3A3F46)));
    final tube = Rect.fromLTWH(base.dx - size * 0.09, base.dy - size * 0.9, size * 0.18, size * 0.8);
    canvas.drawRect(tube, steel(tube, vertical: true));
    if (!lit) return;
    final flick = 1 + 0.06 * math.sin(t * 17);
    final tip = Offset(base.dx, tube.top - size * 0.62 * flick);
    final outer = Path()
      ..moveTo(tube.left, tube.top)
      ..quadraticBezierTo(base.dx - size * 0.2, tube.top - size * 0.3, tip.dx, tip.dy)
      ..quadraticBezierTo(base.dx + size * 0.2, tube.top - size * 0.3, tube.right, tube.top)
      ..close();
    canvas.drawPath(outer, fill(const Color(0x664F8DF5)));
    final inner = Path()
      ..moveTo(tube.left + 3, tube.top)
      ..quadraticBezierTo(base.dx, tube.top - size * 0.28, tube.right - 3, tube.top)
      ..close();
    canvas.drawPath(inner, fill(const Color(0xAA1A4FC4)));
  }

  /// A tripod stand with wire gauze, top at height [top] above [base].
  static void tripod(Canvas canvas, Offset base, double width, double top) {
    final y = base.dy - top;
    canvas.drawLine(Offset(base.dx - width * 0.42, base.dy), Offset(base.dx - width * 0.32, y), stroke(const Color(0xFF3A3F46), 4));
    canvas.drawLine(Offset(base.dx + width * 0.42, base.dy), Offset(base.dx + width * 0.32, y), stroke(const Color(0xFF3A3F46), 4));
    canvas.drawRect(Rect.fromCenter(center: Offset(base.dx, y), width: width * 0.8, height: 5), fill(const Color(0xFF3A3F46)));
    final gauze = Rect.fromCenter(center: Offset(base.dx, y - 4), width: width * 0.72, height: 4);
    canvas.drawRect(gauze, fill(const Color(0xFF9AA0A6)));
  }
}

/// A small, stable pseudo-random number in [0, 1) from integers (the same
/// inputs always give the same value, so benches stay pure).
double hash01(int a, [int b = 0, int c = 0]) {
  var h = a * 374761393 + b * 668265263 + c * 2147483647;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0xFFFFFF) / 0x1000000;
}
