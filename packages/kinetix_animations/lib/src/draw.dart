import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'model.dart';

part 'landscape.dart';
part 'plate.dart';

/// The animations' palette: restrained textbook colours on the board's paper, in KINETIX ink
/// (no saturated primaries; see [TP] for the plates' own palette).
abstract final class AC {
  static const ink = KxColor.ink;
  static const muted = KxColor.muted;
  static const line = KxColor.line;
  static const paper = KxColor.paper;
  static const accent = KxColor.accent;
  static const leaf = Color(0xFF5A8A4E);
  static const leafDark = Color(0xFF3F6B3A);
  static const leafLight = Color(0xFFD6E5CC);
  static const water = Color(0xFF4F86B0);
  static const waterLight = Color(0xFFD8E6EE);
  static const sky = Color(0xFFE6EEF2);
  static const sun = Color(0xFFD9A93B);
  static const o2 = Color(0xFF3A8E8A);
  static const co2 = Color(0xFF6E747C);
  static const glucose = Color(0xFFC07A35);
  static const energy = Color(0xFFC9952F);
  static const red = Color(0xFFB0473B);
  static const blue = Color(0xFF3F5F94);
  static const purple = Color(0xFF6C5687);
  static const pink = Color(0xFFE3BCC0);
  static const flesh = Color(0xFFEBD3C4);
  static const cell = Color(0xFFF7F0E0);
  static const membrane = Color(0xFFB08850);
  static const soil = Color(0xFF8D6E4A);
  static const soilLight = Color(0xFFD9C3A5);
  static const rock = Color(0xFF9A8F84);
  static const magma = Color(0xFFC2603A);
  static const ice = Color(0xFFEDF3F6);
  static const space = Color(0xFF1E2633);
  static const electron = Color(0xFF34618E);
  static const copper = Color(0xFFB87333);
  static const grey = Color(0xFFBDBDBD);
}

/// 0 before [a], 1 after [b], and a straight ramp between.
double seg(double t, double a, double b) => ((t - a) / (b - a)).clamp(0.0, 1.0);

/// Ease in and out.
double ease(double x) => x < 0.5 ? 4 * x * x * x : 1 - math.pow(-2 * x + 2, 3) / 2;

/// 0 → 1 → 0 over x in 0..1.
double tri(double x) => 1 - (2 * x.clamp(0.0, 1.0) - 1).abs();

/// The fractional part (for looping motion).
double fr(double x) => x - x.floorToDouble();

Offset lerpO(Offset a, Offset b, double k) => Offset.lerp(a, b, k)!;

Offset polar(Offset c, double r, double angle) => c + Offset(math.cos(angle) * r, math.sin(angle) * r);

const tau = math.pi * 2;

/// A fixed pseudo-random number in 0..1 for particle [i] (and channel [k]): the same every frame.
double rnd(int i, [int k = 0]) => fr(math.sin(i * 12.9898 + k * 78.233) * 43758.5453);

/// The base of every animation: draws on a 1000 × 600 design canvas, fitted (contained) and
/// centred in whatever size the panel gives it. Subclasses draw in [draw] with the helpers below.
abstract class AnimPainter extends CustomPainter {
  AnimPainter(this.f);

  final AnimFrame f;
  double get t => f.t;

  static const double w = 1000, h = 600;

  late Canvas c;
  double _scale = 1;

  /// Whether the picture is set on a dark ground (space): text halos are then dark too.
  bool get darkStage => false;

  /// The background behind the design canvas.
  Color get background => AC.paper;

  void draw();

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;
    c = canvas;
    _scale = math.min(size.width / w, size.height / h);
    canvas.drawRect(Offset.zero & size, Paint()..color = background);
    canvas.save();
    canvas.translate((size.width - w * _scale) / 2, (size.height - h * _scale) / 2);
    canvas.scale(_scale);
    canvas.clipRect(const Rect.fromLTWH(0, 0, w, h));
    draw();
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant AnimPainter old) => old.f != f || old.runtimeType != runtimeType;

  // ---- text ----

  /// The part of an 'English|हिन्दी|ಕನ್ನಡ' string in the frame's language (English if missing).
  String tr(String l3) {
    final parts = l3.split('|');
    final i = f.lang.index;
    return (i < parts.length && parts[i].trim().isNotEmpty) ? parts[i] : parts.first;
  }

  /// Text at [at]; [align] -1 left, 0 centre, 1 right of [at]. Never smaller than 11 px on screen.
  Size text(String s, Offset at, {double size = 18, Color color = AC.ink, FontWeight weight = FontWeight.w500, double align = 0, Color? bg, double maxWidth = 260}) {
    final px = f.thumbnail ? size : math.max(size, 11 / _scale);
    final tp = TextPainter(
      text: TextSpan(
        text: s,
        style: TextStyle(fontSize: px, color: color, fontWeight: weight, height: 1.15, fontFamily: KxFonts.family, fontFamilyFallback: KxFonts.fallback),
      ),
      textAlign: align < 0 ? TextAlign.left : (align > 0 ? TextAlign.right : TextAlign.center),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: math.max(maxWidth, px * 4));
    final topLeft = Offset(at.dx - tp.width * (align + 1) / 2, at.dy - tp.height / 2);
    if (bg != null) {
      c.drawRRect(RRect.fromRectAndRadius((topLeft & tp.size).inflate(5), const Radius.circular(6)), Paint()..color = bg);
    }
    tp.paint(c, topLeft);
    return tp.size;
  }

  /// A label (only when labels are on), in the frame's language. With [to], a fine leader line
  /// runs from the label to a dot on the thing it names.
  void label(String l3, Offset at, {Offset? to, Color color = AC.ink, double size = 17, double align = 0, double opacity = 1}) {
    if (!f.labels || opacity <= 0) return;
    if (to != null) {
      c.drawLine(at, to, linePaint(TP.ink2.withValues(alpha: 0.85 * opacity), LW.hair * 1.2));
      c.drawCircle(to, 2.2, Paint()..color = TP.ink.withValues(alpha: opacity));
    }
    note(tr(l3), at, size: size * 0.92, color: color == AC.ink ? (darkStage ? const Color(0xFFE4E8EC) : TP.ink) : color, align: align, opacity: opacity, weight: FontWeight.w500, maxWidth: 260);
  }

  /// A formula or particle name in a quiet tinted tag (always shown: it is part of the picture).
  void chip(String s, Offset at, Color col, {double size = 15, double opacity = 1}) {
    if (opacity <= 0) return;
    final px = f.thumbnail ? size : math.max(size, 10 / _scale);
    final ink = Color.lerp(col, Colors.black, 0.35)!;
    final tp = TextPainter(
      text: TextSpan(text: s, style: TextStyle(fontSize: px * 0.92, color: ink.withValues(alpha: opacity), fontWeight: FontWeight.w600, fontFamily: KxFonts.family, fontFamilyFallback: KxFonts.fallback)),
      textDirection: TextDirection.ltr,
    )..layout();
    final r = Rect.fromCenter(center: at, width: tp.width + 10, height: tp.height + 3);
    final rr = RRect.fromRectAndRadius(r, const Radius.circular(4));
    c.drawRRect(rr, Paint()..color = Color.lerp(col, Colors.white, 0.84)!.withValues(alpha: 0.95 * opacity));
    c.drawRRect(rr, linePaint(col.withValues(alpha: 0.8 * opacity), LW.hair));
    tp.paint(c, Offset(at.dx - tp.width / 2, at.dy - tp.height / 2));
  }

  // ---- shapes ----

  Paint fill(Color col) => Paint()..color = col;
  Paint stroke(Color col, [double w = 3]) => Paint()
    ..color = col
    ..style = PaintingStyle.stroke
    ..strokeWidth = w
    ..strokeCap = StrokeCap.round
    ..strokeJoin = StrokeJoin.round;

  void circle(Offset o, double r, Color fillC, {Color? line, double w = 2}) {
    if (r >= 5 && fillC.a > 0.6 && fillC != Colors.white && (line == null || line == Colors.white)) {
      sphere(o, r, fillC.withValues(alpha: 1), opacity: fillC.a);
      return;
    }
    c.drawCircle(o, r, fill(fillC));
    if (line != null && line != Colors.white) c.drawCircle(o, r, stroke(line, w * 0.6));
  }

  void ring(Offset o, double r, Color col, [double w = 2]) => c.drawCircle(o, r, stroke(col, w));

  void oval(Rect r, Color fillC, {Color? line, double w = 2}) {
    c.drawOval(r, fill(fillC));
    if (line != null) c.drawOval(r, stroke(line, w));
  }

  void rect(Rect r, Color fillC, {Color? line, double w = 2, double radius = 0}) {
    final rr = RRect.fromRectAndRadius(r, Radius.circular(radius));
    c.drawRRect(rr, fill(fillC));
    if (line != null) c.drawRRect(rr, stroke(line, w));
  }

  void line(Offset a, Offset b, Color col, [double w = 3]) => c.drawLine(a, b, stroke(col, w * 0.7));

  void path(Path p, Color col, [double w = 3]) => c.drawPath(p, stroke(col, w));

  void fillPath(Path p, Color col, {Color? line, double w = 2}) {
    c.drawPath(p, fill(col));
    if (line != null) c.drawPath(p, stroke(line, w));
  }

  void dashed(Offset a, Offset b, Color col, {double w = 2, double dash = 8}) {
    final d = b - a;
    final n = (d.distance / (dash * 2)).floor();
    for (var i = 0; i < n; i++) {
      line(a + d * (i * 2 * dash / d.distance), a + d * ((i * 2 + 1) * dash / d.distance), col, w);
    }
  }

  void _head(Offset tip, double angle, Color col, double head) {
    final p = Path()
      ..moveTo(tip.dx, tip.dy)
      ..lineTo(tip.dx - head * math.cos(angle - 0.45), tip.dy - head * math.sin(angle - 0.45))
      ..lineTo(tip.dx - head * math.cos(angle + 0.45), tip.dy - head * math.sin(angle + 0.45))
      ..close();
    c.drawPath(p, fill(col));
  }

  /// A straight arrow from [a] to [b] (drawn slender: the weights are scaled to the plates').
  void arrow(Offset a, Offset b, Color col, {double w = 4, double head = 14, double opacity = 1}) {
    if (opacity <= 0 || (b - a).distance < 1) return;
    arrowTo(a, b, col, w: math.max(1.2, w * 0.5), len: head * 0.8, opacity: opacity);
  }

  /// The first [upto] of [p], drawn as an arrow.
  void arrowPath(Path p, Color col, {double w = 4, double head = 14, double upto = 1, double opacity = 1}) {
    if (opacity <= 0 || upto <= 0) return;
    final cc = col.withValues(alpha: col.a * opacity);
    for (final m in p.computeMetrics()) {
      final len = m.length * upto.clamp(0.0, 1.0);
      if (len < 2) continue;
      c.drawPath(m.extractPath(0, math.max(0, len - head * 0.5)), stroke(cc, math.max(1.2, w * 0.5)));
      final tan = m.getTangentForOffset(len)!;
      dart(tan.position, -tan.angle, cc, len: head * 0.8);
    }
  }

  /// The point [k] (0..1) of the way along [p].
  Offset along(Path p, double k) {
    final m = p.computeMetrics().first;
    return m.getTangentForOffset(m.length * k.clamp(0.0, 1.0))!.position;
  }

  /// A wavy light ray from [a] to [b], its wiggle moving with [phase].
  void ray(Offset a, Offset b, Color col, {double phase = 0, double amp = 6, double waves = 5, double w = 3}) {
    final d = b - a;
    final len = d.distance;
    final n = Offset(-d.dy / len, d.dx / len);
    final p = Path()..moveTo(a.dx, a.dy);
    for (var i = 1; i <= 40; i++) {
      final k = i / 40;
      final o = a + d * k + n * (amp * math.sin(k * waves * tau - phase * tau));
      p.lineTo(o.dx, o.dy);
    }
    path(p, col, w);
    _head(b, math.atan2(d.dy, d.dx), col, 12);
  }

  /// The sun: a soft disc with a warm glow.
  void sun(Offset o, double r) => sunDisc(o, r);

  /// A small cloud (a shaded cumulus).
  void cloud(Offset o, double s, {Color col = Colors.white, Color? edge}) => cumulus(o + Offset(0, 6 * s), s * 0.9);

  /// One arrow of a cycle: muted when idle; when [on], bold, with [n] dots (or [chipText]
  /// pills) running along it.
  void flow(Path p, {required bool on, Color col = AC.accent, String? chipText, int n = 3, double w = 4}) {
    arrowPath(p, on ? col : AC.grey, w: on ? w + 1 : w, head: on ? 16 : 13);
    if (!on) return;
    for (var i = 0; i < n; i++) {
      final at = along(p, fr(t * 6 + i / n) * 0.92);
      chipText == null ? circle(at, 7, col, line: Colors.white, w: 2) : chip(chipText, at, col, size: 12);
    }
  }

  /// A tree (trunk, branches and a shaded crown), [s] its scale.
  void tree(Offset base, double s, {Color crown = AC.leaf}) => broadleaf(base, s * 0.85);

  /// A grazing animal (a cow in profile), facing right.
  void animal(Offset o, double s) => cow(o + Offset(-6, -4) * s, s * 0.85);

  /// A factory with a chimney.
  void mill(Offset base, double s) {
    const wall = Color(0xFF90A4AE), edge = Color(0xFF455A64);
    rect(Rect.fromLTWH(base.dx + 40 * s, base.dy - 150 * s, 26 * s, 150 * s), edge);
    final p = Path()
      ..moveTo(base.dx - 70 * s, base.dy)
      ..lineTo(base.dx - 70 * s, base.dy - 60 * s)
      ..lineTo(base.dx - 35 * s, base.dy - 85 * s)
      ..lineTo(base.dx - 35 * s, base.dy - 60 * s)
      ..lineTo(base.dx, base.dy - 85 * s)
      ..lineTo(base.dx, base.dy - 60 * s)
      ..lineTo(base.dx + 80 * s, base.dy - 60 * s)
      ..lineTo(base.dx + 80 * s, base.dy)
      ..close();
    fillPath(p, wall, line: edge);
    for (var i = 0; i < 3; i++) {
      rect(Rect.fromLTWH(base.dx + (-58 + i * 40) * s, base.dy - 40 * s, 22 * s, 18 * s), const Color(0xFFFFE082));
    }
  }

  /// A lightning bolt from [a] to [b].
  void lightning(Offset a, Offset b, {double opacity = 1}) {
    if (opacity <= 0) return;
    final d = b - a;
    final n = Offset(-d.dy, d.dx) / d.distance;
    final p = Path()..moveTo(a.dx, a.dy);
    for (var i = 1; i <= 5; i++) {
      final q = a + d * (i / 5) + n * (i == 5 ? 0 : (i.isEven ? -18 : 18));
      p.lineTo(q.dx, q.dy);
    }
    path(p, const Color(0xFFFFEB3B).withValues(alpha: opacity), 9);
    path(p, Colors.white.withValues(alpha: opacity), 3);
  }

  /// A heading at the top-left of the canvas (shown with the labels).
  void heading(String l3) {
    if (!f.labels) return;
    text(tr(l3), const Offset(24, 28), size: 22, weight: FontWeight.w700, align: -1, color: AC.ink, maxWidth: 600);
  }
}
