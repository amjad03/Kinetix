import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../design.dart';

/// Shared drawing for the chemistry bench: plots, bars, glassware, panels and molecules.
abstract final class CX {
  static const purple = Color(0xFF6B46A8);
  static const teal = Color(0xFF0F766E);
  static const rose = Color(0xFFB4235A);
  static const slate = Color(0xFF475569);
  static const water = Color(0xFFDCEBF7);
  static const series = [IX.accent, IX.positive, IX.green, purple, IX.amber, teal, rose, slate];
}

void lbl(Canvas c, String s, Offset at, {double size = 18, Color color = IX.inkSoft, FontWeight w = FontWeight.w500, Alignment align = Alignment.center, bool halo = false}) =>
    IxPaint.label(c, s, at, size: size, color: color, w: w, align: align, halo: halo);

/// Text that wraps inside [width], top-left at [at]. Returns its height.
double para(Canvas c, String s, Offset at, double width, {double size = 18, Color color = IX.inkSoft, FontWeight w = FontWeight.w400, TextAlign align = TextAlign.left}) {
  final tp = TextPainter(text: TextSpan(text: s, style: IX.text(size, w: w, c: color, height: 1.3)), textDirection: TextDirection.ltr, textAlign: align)..layout(maxWidth: width);
  tp.paint(c, at);
  return tp.height;
}

double textW(String s, double size, {FontWeight w = FontWeight.w500}) => (TextPainter(text: TextSpan(text: s, style: IX.text(size, w: w)), textDirection: TextDirection.ltr)..layout()).width;

const _sup = {'-': '⁻', '+': '⁺', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'};
const _sub = {'0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋'};
String sup(Object s) => '$s'.split('').map((ch) => _sup[ch] ?? ch).join();
/// '₂' → '2', '⁺' → '+': the plain id a lesson preset uses for a formula.
String ascii(String s) => s.split('').map((ch) => {for (final e in _sub.entries) e.value: e.key, for (final e in _sup.entries) e.value: e.key}[ch] ?? ch).join();
String sub(Object s) => '$s'.split('').map((ch) => _sub[ch] ?? ch).join();

/// "2+" style charge written as a superscript: 2 → ²⁺, −1 → ⁻, 0 → ''.
String charge(int q) => q == 0 ? '' : sup('${q.abs() == 1 ? '' : q.abs()}${q > 0 ? '+' : '-'}');

/// A number for the board with [sig] significant figures, written × 10ⁿ when very large or small.
/// (Uses a double power of ten, so it is safe beyond 10¹⁸.)
String sx(double v, {int sig = 3}) {
  if (v.isNaN || v.isInfinite) return '—';
  if (v == 0) return '0';
  final e = (math.log(v.abs()) / math.ln10).floor();
  if (e >= -2 && e < 5) return v.toStringAsFixed((sig - 1 - e).clamp(0, 4));
  var m = v / math.pow(10.0, e.toDouble());
  var ee = e;
  if (double.parse(m.abs().toStringAsFixed(sig - 1)) >= 10) {
    m /= 10;
    ee += 1;
  }
  return '${m < 0 ? '\u2212' : ''}${m.abs().toStringAsFixed(sig - 1)} \u00D7 10${sup(ee)}';
}

/// A signed number with a true minus sign.
String sgn(double x, [int d = 1]) => '${x >= 0 ? '+' : '−'}${x.abs().toStringAsFixed(d)}';
String nf(double x, [int d = 1]) => x < 0 ? '−${(-x).toStringAsFixed(d)}' : x.toStringAsFixed(d);

/// A stable pseudo-random number in [0, 1) for particle [i] and channel [k].
double rnd(int i, [int k = 0]) {
  var h = (i * 374761393 + k * 668265263) & 0x7fffffff;
  h = ((h ^ (h >> 13)) * 1274126177) & 0x7fffffff;
  return (h ^ (h >> 16)) / 0x7fffffff;
}

Paint stroke(Color c, [double w = 2]) => Paint()
  ..color = c
  ..style = PaintingStyle.stroke
  ..strokeWidth = w
  ..strokeCap = StrokeCap.round
  ..strokeJoin = StrokeJoin.round;
Paint fill(Color c) => Paint()..color = c;

/// A soft card on the stage with a small caps title, for splitting the stage into parts.
void panel(Canvas c, Rect r, [String? title]) {
  c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(16)), fill(const Color(0xFFF7F9FC)));
  c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(16)), stroke(IX.rule, 1.5));
  if (title != null) lbl(c, title.toUpperCase(), r.topLeft + const Offset(22, 18), size: 15, color: IX.muted, w: FontWeight.w600, align: Alignment.topLeft);
}

/// A pill-shaped tag with text.
void tag(Canvas c, String s, Offset at, Color color, {double size = 17, Alignment align = Alignment.center, bool solid = false}) {
  final tp = TextPainter(text: TextSpan(text: s, style: IX.text(size, w: FontWeight.w600, c: solid ? Colors.white : color)), textDirection: TextDirection.ltr)..layout();
  final w = tp.width + 24, h = tp.height + 10;
  final o = at - Offset((align.x + 1) / 2 * w, (align.y + 1) / 2 * h);
  final r = RRect.fromRectAndRadius(o & Size(w, h), Radius.circular(h / 2));
  c.drawRRect(r, fill(solid ? color : Color.alphaBlend(color.withValues(alpha: 0.10), IX.paper)));
  if (!solid) c.drawRRect(r, stroke(color.withValues(alpha: 0.5), 1.2));
  tp.paint(c, o + const Offset(12, 5));
}

/// A step that rounds a range into about [n] gridlines: 1, 2, 2.5 or 5 × 10ⁿ.
double niceStep(double range, [int n = 6]) {
  final raw = range / n;
  final p = math.pow(10, (math.log(raw) / math.ln10).floor()).toDouble();
  for (final m in [1.0, 2.0, 2.5, 5.0, 10.0]) {
    if (raw <= m * p) return m * p;
  }
  return 10 * p;
}

String tickText(double x, double step) {
  if (x.abs() < step * 1e-6) return '0';
  final d = step >= 1 ? 0 : (-(math.log(step) / math.ln10).floor()).clamp(0, 4);
  final s = x.abs().toStringAsFixed(step == 2.5 * math.pow(10, (math.log(step) / math.ln10).floor()) && step < 10 ? d + 1 : d);
  return x < 0 ? '−$s' : s;
}

/// A graph in data coordinates, drawn into [r].
class Plot {
  Plot(this.r, this.x0, this.x1, this.y0, this.y1);
  final Rect r;
  final double x0, x1, y0, y1;
  Offset p(double x, double y) => Offset(r.left + (x - x0) / (x1 - x0) * r.width, r.bottom - (y - y0) / (y1 - y0) * r.height);
  double px(double x) => p(x, y0).dx;
  double py(double y) => p(x0, y).dy;

  void axes(Canvas c, {String? x, String? y, double? dx, double? dy, String Function(double)? fx, String Function(double)? fy, String? title}) {
    final sx = dx ?? niceStep(x1 - x0), sy = dy ?? niceStep(y1 - y0);
    final g = Paint()..color = IX.grid..strokeWidth = 1;
    for (var v = (x0 / sx).ceil() * sx; v <= x1 + sx * 1e-6; v += sx) {
      c.drawLine(p(v, y0), p(v, y1), g);
      lbl(c, fx?.call(v) ?? tickText(v, sx), p(v, y0) + const Offset(0, 16), size: 15);
    }
    for (var v = (y0 / sy).ceil() * sy; v <= y1 + sy * 1e-6; v += sy) {
      c.drawLine(p(x0, v), p(x1, v), g);
      lbl(c, fy?.call(v) ?? tickText(v, sy), p(x0, v) - const Offset(10, 0), size: 15, align: Alignment.centerRight);
    }
    if (y0 < 0 && y1 > 0) c.drawLine(p(x0, 0), p(x1, 0), Paint()..color = IX.muted..strokeWidth = 1.5);
    if (x0 < 0 && x1 > 0) c.drawLine(p(0, y0), p(0, y1), Paint()..color = IX.muted..strokeWidth = 1.5);
    c.drawRect(r, stroke(IX.rule, 1.5));
    if (x != null) lbl(c, x, r.bottomCenter + const Offset(0, 44), size: 17);
    if (y != null) {
      c.save();
      c.translate(r.left - 62, r.center.dy);
      c.rotate(-math.pi / 2);
      lbl(c, y, Offset.zero, size: 17);
      c.restore();
    }
    if (title != null) lbl(c, title, r.topLeft + const Offset(0, -30), size: 20, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
  }

  Path path(double Function(double) f, {double? from, double? to, int n = 300}) {
    final a = from ?? x0, b = to ?? x1;
    final path = Path();
    var pen = false;
    for (var i = 0; i <= n; i++) {
      final x = a + (b - a) * i / n;
      final y = f(x);
      if (y.isNaN || y.isInfinite) {
        pen = false;
        continue;
      }
      final q = p(x, y.clamp(y0 - (y1 - y0), y1 + (y1 - y0)));
      pen ? path.lineTo(q.dx, q.dy) : path.moveTo(q.dx, q.dy);
      pen = true;
    }
    return path;
  }

  void curve(Canvas c, double Function(double) f, Color col, {double w = 4, double? from, double? to, bool faint = false, bool dash = false}) {
    c.save();
    c.clipRect(r.inflate(2));
    final pth = path(f, from: from, to: to);
    if (dash) {
      for (final m in pth.computeMetrics()) {
        for (var s = 0.0; s < m.length; s += 18) {
          c.drawPath(m.extractPath(s, s + 10), stroke(col, w));
        }
      }
    } else {
      c.drawPath(pth, stroke(faint ? col.withValues(alpha: 0.25) : col, w));
    }
    c.restore();
  }

  void line(Canvas c, List<Offset> pts, Color col, {double w = 4}) {
    if (pts.length < 2) return;
    final pth = Path()..moveTo(p(pts[0].dx, pts[0].dy).dx, p(pts[0].dx, pts[0].dy).dy);
    for (final q in pts.skip(1)) {
      final s = p(q.dx, q.dy);
      pth.lineTo(s.dx, s.dy);
    }
    c.save();
    c.clipRect(r.inflate(2));
    c.drawPath(pth, stroke(col, w));
    c.restore();
  }

  void area(Canvas c, double Function(double) f, double a, double b, Color col, {double Function(double)? base}) {
    final path = Path();
    const n = 120;
    for (var i = 0; i <= n; i++) {
      final x = a + (b - a) * i / n;
      final q = p(x, f(x).clamp(y0, y1));
      i == 0 ? path.moveTo(q.dx, q.dy) : path.lineTo(q.dx, q.dy);
    }
    for (var i = n; i >= 0; i--) {
      final x = a + (b - a) * i / n;
      final q = p(x, (base?.call(x) ?? math.max(0, y0)).clamp(y0, y1));
      path.lineTo(q.dx, q.dy);
    }
    path.close();
    c.save();
    c.clipRect(r);
    c.drawPath(path, fill(col.withValues(alpha: 0.16)));
    c.restore();
  }

  void dot(Canvas c, double x, double y, Color col, {String? label, Alignment align = Alignment.centerLeft, double r0 = 9}) {
    final q = p(x, y);
    if (!r.inflate(4).contains(q)) return;
    c.drawCircle(q, r0 + 6, fill(col.withValues(alpha: 0.16)));
    c.drawCircle(q, r0, fill(col));
    c.drawCircle(q, r0, stroke(Colors.white, 2.5));
    if (label != null) {
      final a = q.dx > r.right - 110 && align.x < 0 ? Alignment(1, align.y) : align;
      lbl(c, label, q + Offset(a.x == 1 ? -18 : 18, a.y * 24), size: 17, color: col, w: FontWeight.w600, align: a, halo: true);
    }
  }

  void vline(Canvas c, double x, Color col, {String? label, double w = 1.8}) {
    if (x < x0 || x > x1) return;
    IxPaint.dashed(c, p(x, y0), p(x, y1), Paint()..color = col..strokeWidth = w);
    if (label != null) lbl(c, label, p(x, y1) + const Offset(8, 16), size: 15, color: col, align: Alignment.centerLeft, halo: true, w: FontWeight.w600);
  }

  void hline(Canvas c, double y, Color col, {String? label, double w = 1.8, bool right = true}) {
    if (y < y0 || y > y1) return;
    IxPaint.dashed(c, p(x0, y), p(x1, y), Paint()..color = col..strokeWidth = w);
    if (label != null) lbl(c, label, right ? p(x1, y) + const Offset(-8, -14) : p(x0, y) + const Offset(8, -14), size: 15, color: col, align: right ? Alignment.centerRight : Alignment.centerLeft, halo: true, w: FontWeight.w600);
  }

  /// A key of coloured lines in the plot's top-left corner (or [at]).
  void legend(Canvas c, List<(String, Color)> items, {Offset? at, bool right = false}) {
    var y = (at ?? r.topLeft + const Offset(20, 22)).dy;
    final x = (at ?? r.topLeft + const Offset(20, 22)).dx;
    final w = items.map((e) => textW(e.$1, 16)).fold(0.0, math.max) + 70;
    final box = Rect.fromLTWH(right ? r.right - w - 16 : x - 10, y - 14, w, items.length * 28 + 10.0);
    c.drawRRect(RRect.fromRectAndRadius(box, const Radius.circular(10)), fill(const Color(0xF2FFFFFF)));
    c.drawRRect(RRect.fromRectAndRadius(box, const Radius.circular(10)), stroke(IX.rule, 1));
    for (final (s, col) in items) {
      final lx = box.left + 12;
      c.drawLine(Offset(lx, y + 4), Offset(lx + 30, y + 4), stroke(col, 4));
      lbl(c, s, Offset(lx + 42, y + 4), size: 16, color: IX.ink, align: Alignment.centerLeft);
      y += 28;
    }
  }
}

/// A vertical bar chart. Bars: (label, value, colour). [hi] marks one bar.
void bars(Canvas c, Rect r, List<(String, double, Color)> data, {double? max, double? min, String Function(double)? fmt, String? yLabel, String? title, int? hi, double? dy}) {
  final lo = min ?? 0;
  final top = max ?? (data.map((e) => e.$2).fold(0.0, math.max) * 1.15);
  final pl = Plot(r, 0, data.length.toDouble(), lo, top);
  final step = dy ?? niceStep(top - lo, 5);
  final g = Paint()..color = IX.grid..strokeWidth = 1;
  for (var v = (lo / step).ceil() * step; v <= top + 1e-9; v += step) {
    c.drawLine(pl.p(0, v), pl.p(data.length.toDouble(), v), g);
    lbl(c, tickText(v, step), pl.p(0, v) - const Offset(10, 0), size: 15, align: Alignment.centerRight);
  }
  c.drawLine(r.bottomLeft, r.bottomRight, stroke(IX.muted, 1.5));
  final bw = r.width / data.length;
  for (var i = 0; i < data.length; i++) {
    final (name, val, col) = data[i];
    final b = Rect.fromLTRB(r.left + bw * i + bw * 0.18, pl.py(val.clamp(lo, top)), r.left + bw * (i + 1) - bw * 0.18, r.bottom);
    final selected = hi == null || hi == i;
    final cc = selected ? col : Color.lerp(col, IX.paper, 0.6)!;
    c.drawRRect(RRect.fromRectAndCorners(b, topLeft: const Radius.circular(8), topRight: const Radius.circular(8)), Paint()..shader = ui.Gradient.linear(b.centerLeft, b.centerRight, [Color.lerp(cc, Colors.white, 0.12)!, cc, Color.lerp(cc, Colors.black, 0.08)!], [0, 0.6, 1]));
    lbl(c, fmt?.call(val) ?? tickText(val, step / 10), Offset(b.center.dx, b.top - 16), size: 17, color: selected ? IX.ink : IX.muted, w: FontWeight.w600);
    final tp = TextPainter(text: TextSpan(text: name, style: IX.text(16, w: FontWeight.w500, c: selected ? IX.ink : IX.muted, height: 1.15)), textDirection: TextDirection.ltr, textAlign: TextAlign.center)..layout(maxWidth: bw - 4);
    tp.paint(c, Offset(b.center.dx - tp.width / 2, r.bottom + 10));
  }
  if (yLabel != null) {
    c.save();
    c.translate(r.left - 62, r.center.dy);
    c.rotate(-math.pi / 2);
    lbl(c, yLabel, Offset.zero, size: 17);
    c.restore();
  }
  if (title != null) lbl(c, title, r.topLeft + const Offset(0, -30), size: 20, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
}

/// A glass beaker in [r] filled to [level] (0–1) with [liquid]. Returns the liquid rect.
Rect beaker(Canvas c, Rect r, double level, Color liquid, {String? label, bool marks = true}) {
  final body = Path()
    ..moveTo(r.left - 8, r.top)
    ..lineTo(r.left, r.top + 10)
    ..lineTo(r.left, r.bottom - 18)
    ..quadraticBezierTo(r.left, r.bottom, r.left + 18, r.bottom)
    ..lineTo(r.right - 18, r.bottom)
    ..quadraticBezierTo(r.right, r.bottom, r.right, r.bottom - 18)
    ..lineTo(r.right, r.top + 10)
    ..lineTo(r.right + 8, r.top);
  final ly = r.bottom - (r.height - 14) * level.clamp(0.0, 1.0);
  final liq = Rect.fromLTRB(r.left, ly, r.right, r.bottom);
  c.drawRRect(RRect.fromRectAndRadius(r.shift(const Offset(0, 6)), const Radius.circular(18)), Paint()..color = const Color(0x1413165A)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10));
  c.save();
  c.clipRRect(RRect.fromRectAndCorners(r, bottomLeft: const Radius.circular(18), bottomRight: const Radius.circular(18)));
  c.drawRect(r, fill(const Color(0x10FFFFFF)));
  if (level > 0) {
    c.drawRect(liq, Paint()..shader = ui.Gradient.linear(liq.topCenter, liq.bottomCenter, [Color.lerp(liquid, Colors.white, 0.25)!, liquid, Color.lerp(liquid, Colors.black, 0.06)!], [0, 0.4, 1]));
    c.drawLine(Offset(r.left, ly), Offset(r.right, ly), stroke(Color.lerp(liquid, Colors.black, 0.18)!, 2));
  }
  c.restore();
  c.drawPath(body, stroke(IX.glassEdge, 2.6));
  c.drawLine(Offset(r.left + 14, r.top + 30), Offset(r.left + 14, r.bottom - 30), stroke(Colors.white.withValues(alpha: 0.85), 4));
  if (marks) {
    for (var i = 1; i <= 4; i++) {
      final y = r.bottom - (r.height - 14) * i / 5;
      c.drawLine(Offset(r.right - 26, y), Offset(r.right - 8, y), stroke(IX.glassEdge, 1.6));
    }
  }
  if (label != null) lbl(c, label, Offset(r.center.dx, r.bottom + 24), size: 17, color: IX.ink, w: FontWeight.w600);
  return liq;
}

/// A shaded ball, lit from the upper left.
void ball(Canvas c, Offset at, double r, Color col, {bool outline = false}) {
  c.drawCircle(at, r, Paint()..shader = ui.Gradient.radial(at - Offset(r * 0.38, r * 0.42), r * 1.45, [Color.lerp(col, Colors.white, 0.6)!, col, Color.lerp(col, Colors.black, 0.38)!], [0, 0.5, 1]));
  if (outline) c.drawCircle(at, r, stroke(Color.lerp(col, Colors.black, 0.35)!.withValues(alpha: 0.6), 1.2));
}

/// A horizontal energy level with a label on the right.
void level(Canvas c, double x0, double x1, double y, Color col, {String? left, String? right, double w = 4}) {
  c.drawLine(Offset(x0, y), Offset(x1, y), stroke(col, w));
  if (left != null) lbl(c, left, Offset(x0 - 12, y), size: 17, color: col, align: Alignment.centerRight, w: FontWeight.w600);
  if (right != null) lbl(c, right, Offset(x1 + 12, y), size: 17, color: col, align: Alignment.centerLeft);
}

/// An orbital box (square) with up to two spin arrows.
void orbitalBox(Canvas c, Rect b, int electrons, {Color col = IX.ink, bool hi = false}) {
  c.drawRRect(RRect.fromRectAndRadius(b, const Radius.circular(4)), fill(hi ? IX.accentSoft : IX.paper));
  c.drawRRect(RRect.fromRectAndRadius(b, const Radius.circular(4)), stroke(IX.inkSoft, 1.8));
  void spin(double x, bool up) {
    final y0 = b.top + b.height * 0.18, y1 = b.bottom - b.height * 0.18;
    IxPaint.arrow(c, Offset(x, up ? y1 : y0), Offset(x, up ? y0 : y1), col, width: 2.6, head: b.height * 0.28);
  }

  if (electrons >= 1) spin(b.left + b.width * (electrons == 1 ? 0.5 : 0.33), true);
  if (electrons >= 2) spin(b.left + b.width * 0.67, false);
}

/// A curly arrow from [a] to [b], bowed by [bend] (positive bows to the left of travel).
void curly(Canvas c, Offset a, Offset b, Color col, {double bend = 0.4, double w = 3.2}) {
  final d = b - a, n = Offset(-d.dy, d.dx);
  final ctl = a + d / 2 + n * bend;
  final path = Path()..moveTo(a.dx, a.dy)..quadraticBezierTo(ctl.dx, ctl.dy, b.dx, b.dy);
  c.drawPath(path, stroke(col, w));
  final t = (b - ctl);
  final u = t / t.distance, nn = Offset(-u.dy, u.dx);
  const h = 16.0;
  final head = Path()..moveTo(b.dx, b.dy)..lineTo((b - u * h + nn * h * 0.5).dx, (b - u * h + nn * h * 0.5).dy)..lineTo((b - u * h * 0.6).dx, (b - u * h * 0.6).dy)..lineTo((b - u * h - nn * h * 0.5).dx, (b - u * h - nn * h * 0.5).dy)..close();
  c.drawPath(head, fill(col));
}

// ───────────────────────────── 3-D molecules ─────────────────────────────

class P3 {
  const P3(this.x, this.y, this.z);
  final double x, y, z;
  P3 operator +(P3 o) => P3(x + o.x, y + o.y, z + o.z);
  P3 operator -(P3 o) => P3(x - o.x, y - o.y, z - o.z);
  P3 operator *(double k) => P3(x * k, y * k, z * k);
  double get len => math.sqrt(x * x + y * y + z * z);
  P3 get unit => this * (1 / len);
  double dot(P3 o) => x * o.x + y * o.y + z * o.z;
  P3 cross(P3 o) => P3(y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x);
  P3 rot(double yaw, double pitch) {
    final cy = math.cos(yaw), sy = math.sin(yaw), cp = math.cos(pitch), sp = math.sin(pitch);
    final x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    return P3(x1, y * cp - z1 * sp, y * sp + z1 * cp);
  }
}

/// Muted CPK colours and drawing radii (Å-ish) for the elements a PUC course meets.
const elementColor = <String, Color>{
  'H': Color(0xFFEEF1F5), 'C': Color(0xFF3C4250), 'N': Color(0xFF2F5BB7), 'O': Color(0xFFC63B2A), 'F': Color(0xFF7DB356), 'Cl': Color(0xFF3F9A55),
  'Br': Color(0xFF8E3B2A), 'I': Color(0xFF6A3FA0), 'S': Color(0xFFD7A62C), 'P': Color(0xFFD9822B), 'B': Color(0xFFE2A07F), 'Be': Color(0xFF8DA36C),
  'Xe': Color(0xFF3F97AE), 'Si': Color(0xFFB59A6E), 'Co': Color(0xFF5468A8), 'Pt': Color(0xFF8C93A6), 'Ni': Color(0xFF5E8F7E), 'Cu': Color(0xFFB8733A),
  'Fe': Color(0xFFA0522D), 'Cr': Color(0xFF6F8FA8), 'Na': Color(0xFF8A63C2), 'M': Color(0xFF5468A8), 'A': Color(0xFF5468A8), 'X': Color(0xFF3F9A55), 'Ag': Color(0xFFA9B1BF),
};
const _elementR = <String, double>{'H': 0.30, 'C': 0.42, 'N': 0.42, 'O': 0.42, 'F': 0.40, 'Cl': 0.52, 'Br': 0.56, 'I': 0.62, 'S': 0.52, 'P': 0.52, 'B': 0.42, 'Be': 0.44, 'Xe': 0.60, 'Co': 0.58, 'Pt': 0.62, 'Ni': 0.58, 'Cu': 0.58, 'Fe': 0.58, 'Cr': 0.58, 'M': 0.58, 'A': 0.50, 'X': 0.46};

class Atom3 {
  const Atom3(this.el, this.p, {this.label, this.r, this.color});
  final String el;
  final P3 p;
  final String? label;
  final double? r;
  final Color? color;
  double get radius => r ?? _elementR[el] ?? 0.48;
  Color get col => color ?? elementColor[el] ?? IX.steel;
}

class Mol3 {
  Mol3(this.atoms, this.bonds, {this.lobes = const [], this.hybrid = const []});
  final List<Atom3> atoms;
  final List<(int, int, int)> bonds; // a, b, order
  final List<(int, P3)> lobes; // lone pairs: atom, direction
  final List<(int, P3)> hybrid; // hybrid orbital lobes (big): atom, direction
}

/// Draws [m] in perspective, far parts first: shaded spheres, two-tone shaded sticks, lone-pair
/// lobes. [scale] is pixels per Å. Returns the screen position of each atom.
List<Offset> drawMol(Canvas c, Offset center, double scale, Mol3 m, double yaw, double pitch, {bool labels = true, bool shadow = true, double lobeLen = 1.0}) {
  const f = 9.0;
  final rp = [for (final a in m.atoms) a.p.rot(yaw, pitch)];
  double k(P3 q) => f / (f - q.z);
  Offset s(P3 q) => center + Offset(q.x, -q.y) * scale * k(q);
  final items = <(double, void Function())>[];

  if (shadow) {
    final xs = rp.map((q) => q.x), zs = rp.map((q) => q.y);
    final w = (xs.reduce(math.max) - xs.reduce(math.min) + 1.4) * scale;
    final low = zs.reduce(math.min);
    final sc = center + Offset(0, -low * scale + scale * 0.9);
    c.drawOval(Rect.fromCenter(center: sc, width: w, height: w * 0.16), Paint()..color = const Color(0x1C13165A)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 14));
  }

  for (final (a, b, order) in m.bonds) {
    final pa = rp[a], pb = rp[b];
    final mid = (pa + pb) * 0.5;
    for (final (from, to, col) in [(pa, mid, m.atoms[a].col), (pb, mid, m.atoms[b].col)]) {
      items.add(((from.z + to.z) / 2, () {
        final sa = s(from), sb = s(to);
        final d = sb - sa;
        if (d.distance < 0.5) return;
        final n = Offset(-d.dy, d.dx) / d.distance;
        final width = scale * 0.17 * k(from) * (order == 1 ? 1 : 0.62);
        final offs = order == 1 ? [0.0] : order == 2 ? [-1.0, 1.0] : [-1.8, 0.0, 1.8];
        for (final o in offs) {
          final sh = n * o * width * 0.95;
          final a0 = sa + sh, b0 = sb + sh;
          final cc = Color.lerp(col, const Color(0xFF9AA3B5), col.computeLuminance() > 0.8 ? 0.35 : 0.15)!;
          c.drawLine(a0, b0, Paint()
            ..strokeWidth = width
            ..strokeCap = StrokeCap.butt
            ..shader = ui.Gradient.linear(a0 + n * width / 2, a0 - n * width / 2, [Color.lerp(cc, Colors.white, 0.45)!, cc, Color.lerp(cc, Colors.black, 0.4)!], [0, 0.45, 1]));
        }
      }));
    }
  }

  void lobe(P3 from, P3 dir, double len, double wid, Color col, double alpha) {
    final tip = from + dir.unit * len;
    items.add(((from.z + tip.z) / 2 + 0.01, () {
      final sa = s(from), sb = s(tip);
      final d = sb - sa;
      final w = wid * scale * k(from);
      final ang = math.atan2(d.dy, d.dx);
      final l = math.max(d.distance, w * 0.9);
      c.save();
      c.translate(sa.dx, sa.dy);
      c.rotate(ang);
      final path = Path()
        ..moveTo(0, 0)
        ..cubicTo(l * 0.25, -w * 0.9, l * 1.05, -w * 0.75, l * 1.02, 0)
        ..cubicTo(l * 1.05, w * 0.75, l * 0.25, w * 0.9, 0, 0);
      c.drawPath(path, Paint()..shader = ui.Gradient.radial(Offset(l * 0.6, -w * 0.2), l * 0.8, [Color.lerp(col, Colors.white, 0.55)!.withValues(alpha: alpha), col.withValues(alpha: alpha * 0.85)]));
      c.drawPath(path, stroke(Color.lerp(col, Colors.black, 0.2)!.withValues(alpha: 0.55), 1.4));
      c.restore();
    }));
  }

  for (final (a, d) in m.lobes) {
    lobe(rp[a], d.rot(yaw, pitch), 0.95 * lobeLen, 0.34, const Color(0xFF8FB0E0), 0.55);
  }
  for (final (a, d) in m.hybrid) {
    lobe(rp[a], d.rot(yaw, pitch), 1.7 * lobeLen, 0.62, const Color(0xFF7FA3D9), 0.62);
  }

  for (var i = 0; i < m.atoms.length; i++) {
    final at = m.atoms[i], q = rp[i];
    items.add((q.z, () {
      final o = s(q), r = at.radius * scale * k(q);
      ball(c, o, r, at.col, outline: at.col.computeLuminance() > 0.7);
      if (labels) {
        final light = at.col.computeLuminance() > 0.45;
        lbl(c, at.label ?? at.el, o, size: (r * 0.62).clamp(13, 28), color: light ? IX.ink : Colors.white, w: FontWeight.w700);
      }
    }));
  }
  items.sort((a, b) => a.$1.compareTo(b.$1));
  for (final it in items) {
    it.$2();
  }
  return [for (final q in rp) s(q)];
}

/// Unit vectors of the ideal electron-pair arrangements, bond positions first, then the lone
/// pair positions VSEPR chooses (equatorial in a trigonal bipyramid, trans in an octahedron).
List<P3> pairDirections(int pairs, int lone) {
  final t = 1 / math.sqrt(3);
  switch (pairs) {
    case 2:
      return const [P3(-1, 0, 0), P3(1, 0, 0)];
    case 3:
      final d = [for (var i = 0; i < 3; i++) P3(math.sin(i * 2 * math.pi / 3), math.cos(i * 2 * math.pi / 3), 0)];
      return lone == 0 ? d : [d[1], d[2], d[0]];
    case 4:
      final d = [P3(t, t, t), P3(-t, -t, t), P3(-t, t, -t), P3(t, -t, -t)];
      // Keep a lone pair on top so the pyramid / bent shape sits upright.
      final up = P3(0, 1, 0);
      final m = <P3>[for (final q in d) _align(q, d[0], up)];
      return [...m.sublist(1), m[0]];
    case 5:
      final ax = [const P3(0, 1, 0), const P3(0, -1, 0)];
      final eq = [for (var i = 0; i < 3; i++) P3(math.cos(i * 2 * math.pi / 3 + math.pi / 2), 0, math.sin(i * 2 * math.pi / 3 + math.pi / 2))];
      final lp = eq.sublist(3 - lone.clamp(0, 3));
      final bpEq = eq.sublist(0, 3 - lone.clamp(0, 3));
      return [...ax, ...bpEq, ...lp];
    default:
      const o = [P3(1, 0, 0), P3(-1, 0, 0), P3(0, 0, 1), P3(0, 0, -1), P3(0, -1, 0), P3(0, 1, 0)];
      return o;
  }
}

/// Rotates [q] by the rotation that takes [from] onto [to].
P3 _align(P3 q, P3 from, P3 to) {
  final a = from.unit, b = to.unit;
  final v = a.cross(b);
  final cs = a.dot(b), sn = v.len;
  if (sn < 1e-9) return q;
  final k = v * (1 / sn);
  // Rodrigues.
  return q * cs + k.cross(q) * sn + k * (k.dot(q) * (1 - cs));
}

/// A VSEPR model AXₘEₙ with the given atoms. [compress] narrows the angles toward lone pairs.
Mol3 vseprMol(String centre, List<String> ligands, int lone, {double bond = 1.5, List<int>? orders, double squeeze = 0}) {
  final dirs = pairDirections(ligands.length + lone, lone);
  final bpDirs = dirs.sublist(0, ligands.length);
  final lpDirs = dirs.sublist(ligands.length);
  P3 pushed(P3 d) {
    if (squeeze == 0 || lpDirs.isEmpty) return d;
    var away = const P3(0, 0, 0);
    for (final l in lpDirs) {
      away = away + l;
    }
    if (away.len < 1e-6) return d;
    return (d - away.unit * squeeze).unit;
  }

  final atoms = [Atom3(centre, const P3(0, 0, 0)), for (final (i, l) in ligands.indexed) Atom3(l, pushed(bpDirs[i]) * bond)];
  return Mol3(atoms, [for (var i = 0; i < ligands.length; i++) (0, i + 1, orders?[i] ?? 1)], lobes: [for (final d in lpDirs) (0, d)]);
}
