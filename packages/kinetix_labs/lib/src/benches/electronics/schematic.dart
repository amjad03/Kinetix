import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../engines/circuit.dart' show GateKind;

/// Draws circuit diagrams the way a textbook does, on a grid: [cols] × [rows]
/// cells fitted into the canvas. Positions are grid coordinates (x, y).
class Schematic {
  final Canvas canvas;
  final Rect area;
  final double cols, rows;
  late final double _u = math.min(area.width / cols, area.height / rows);
  late final Offset origin = area.center - Offset(cols * _u / 2, rows * _u / 2);

  Schematic(this.canvas, this.area, {this.cols = 12, this.rows = 8});

  Offset p(double x, double y) => origin + Offset(x * _u, y * _u);
  double get unit => _u;
  Paint get _wire => stroke(LabInk.wire, math.max(2, _u * 0.05));
  Paint get _ink => stroke(LabInk.ink, math.max(2, _u * 0.055));

  /// A wire through grid points.
  void wire(List<(double, double)> pts) {
    final path = Path()..moveTo(p(pts[0].$1, pts[0].$2).dx, p(pts[0].$1, pts[0].$2).dy);
    for (final q in pts.skip(1)) {
      final o = p(q.$1, q.$2);
      path.lineTo(o.dx, o.dy);
    }
    canvas.drawPath(path, _wire);
  }

  /// A junction dot.
  void dot(double x, double y) => canvas.drawCircle(p(x, y), math.max(3.5, _u * 0.08), fill(LabInk.ink));

  void text(String s, double x, double y, {double size = 0.32, Color color = LabInk.ink, bool bold = false, Color? halo}) =>
      label(canvas, s, p(x, y), size: math.max(10, _u * size), color: color, bold: bold, halo: halo);

  // The symbols sit on the segment from a to b (grid points), with leads.
  (Offset, Offset, Offset, Offset) _seg(double ax, double ay, double bx, double by, double body) {
    final a = p(ax, ay), b = p(bx, by);
    final d = b - a, len = d.distance, u = d / len;
    final half = math.min(body * _u, len) / 2;
    final m = (a + b) / 2;
    return (a, m - u * half, m + u * half, u);
  }

  void resistor(double ax, double ay, double bx, double by, [String? name]) {
    final (a, s0, s1, u) = _seg(ax, ay, bx, by, 1.2);
    final b = p(bx, by);
    canvas.drawLine(a, s0, _wire);
    canvas.drawLine(s1, b, _wire);
    zigzag(canvas, s0, s1, _ink, peaks: 4, amp: _u * 0.16);
    if (name != null) _side(name, (s0 + s1) / 2, u);
  }

  /// A variable resistor (rheostat): a resistor with an arrow through it.
  void rheostat(double ax, double ay, double bx, double by, [String? name]) {
    resistor(ax, ay, bx, by, name);
    final (_, s0, s1, u) = _seg(ax, ay, bx, by, 1.2);
    final n = Offset(-u.dy, u.dx);
    final from = (s0 + s1) / 2 - u * _u * 0.5 + n * _u * 0.35, to = (s0 + s1) / 2 + u * _u * 0.5 - n * _u * 0.35;
    canvas.drawLine(from, to, stroke(LabInk.red, 2));
    arrowHead(canvas, to, to - from, stroke(LabInk.red, 2), size: _u * 0.18);
  }

  void capacitor(double ax, double ay, double bx, double by, [String? name]) {
    final (a, s0, s1, u) = _seg(ax, ay, bx, by, 0.3);
    final b = p(bx, by);
    final n = Offset(-u.dy, u.dx) * _u * 0.35;
    canvas.drawLine(a, s0, _wire);
    canvas.drawLine(s1, b, _wire);
    canvas.drawLine(s0 - n, s0 + n, _ink);
    canvas.drawLine(s1 - n, s1 + n, _ink);
    if (name != null) _side(name, (s0 + s1) / 2, u, gap: 0.65);
  }

  void inductor(double ax, double ay, double bx, double by, [String? name]) {
    final (a, s0, s1, u) = _seg(ax, ay, bx, by, 1.4);
    final b = p(bx, by);
    canvas.drawLine(a, s0, _wire);
    canvas.drawLine(s1, b, _wire);
    final n = Offset(-u.dy, u.dx);
    final len = (s1 - s0).distance;
    final path = Path()..moveTo(s0.dx, s0.dy);
    const loops = 4;
    for (var k = 0; k < loops; k++) {
      final c = s0 + u * (len * (k + 0.5) / loops);
      final r = len / loops / 2;
      path.arcTo(Rect.fromCircle(center: c, radius: r), math.atan2(-u.dy, -u.dx), _sweep(n), false);
    }
    canvas.drawPath(path, _ink);
    if (name != null) _side(name, (s0 + s1) / 2, u, gap: 0.6);
  }

  double _sweep(Offset n) => n.dy <= 0 ? math.pi : -math.pi;

  /// A _u or battery, + plate (long) towards a.
  void cell(double ax, double ay, double bx, double by, [String? name, int cells = 1]) {
    final (a, s0, s1, u) = _seg(ax, ay, bx, by, 0.25 + 0.35 * (cells - 1));
    final b = p(bx, by);
    canvas.drawLine(a, s0, _wire);
    canvas.drawLine(s1, b, _wire);
    final n = Offset(-u.dy, u.dx);
    for (var k = 0; k < cells; k++) {
      final c = s0 + u * (k * 0.35 * _u);
      canvas.drawLine(c - n * _u * 0.38, c + n * _u * 0.38, stroke(LabInk.ink, 2));
      final d = c + u * (0.25 * _u);
      canvas.drawLine(d - n * _u * 0.2, d + n * _u * 0.2, stroke(LabInk.ink, math.max(4, _u * 0.11)));
    }
    label(canvas, '+', s0 - u * _u * 0.18 + n * _u * 0.5, size: math.max(11, _u * 0.3), bold: true);
    if (name != null) _side(name, (s0 + s1) / 2, u, gap: 0.75);
  }

  /// An AC source (circle with a sine wave).
  void acSource(double x, double y, [String? name]) {
    final c = p(x, y), r = _u * 0.42;
    canvas.drawCircle(c, r, fill(Colors.white));
    canvas.drawCircle(c, r, _ink);
    final path = Path()..moveTo(c.dx - r * 0.6, c.dy);
    for (var k = 1; k <= 20; k++) {
      final t = k / 20;
      path.lineTo(c.dx - r * 0.6 + r * 1.2 * t, c.dy - math.sin(t * 2 * math.pi) * r * 0.35);
    }
    canvas.drawPath(path, stroke(LabInk.ink, 2));
    if (name != null) text(name, x, y + 0.75, size: 0.28);
  }

  /// A diode from anode a to cathode b. [zener] bends the bar; [glow] (an
  /// LED colour) adds the light arrows and lights it.
  void diode(double ax, double ay, double bx, double by, {String? name, bool zener = false, Color? glow, double brightness = 0}) {
    final (a, s0, s1, u) = _seg(ax, ay, bx, by, 0.6);
    final b = p(bx, by);
    canvas.drawLine(a, s0, _wire);
    canvas.drawLine(s1, b, _wire);
    final n = Offset(-u.dy, u.dx) * _u * 0.3;
    if (glow != null && brightness > 0) {
      canvas.drawCircle((s0 + s1) / 2, _u * (0.5 + 0.4 * brightness), Paint()..color = glow.withValues(alpha: 0.25 + 0.5 * brightness)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8));
    }
    final tri = Path()
      ..moveTo((s0 + n).dx, (s0 + n).dy)
      ..lineTo((s0 - n).dx, (s0 - n).dy)
      ..lineTo(s1.dx, s1.dy)
      ..close();
    canvas.drawPath(tri, fill(glow ?? LabInk.ink));
    canvas.drawPath(tri, stroke(LabInk.ink, 1.5));
    canvas.drawLine(s1 + n, s1 - n, _ink);
    if (zener) {
      final w = u * _u * 0.15;
      canvas.drawLine(s1 + n, s1 + n - w, _ink);
      canvas.drawLine(s1 - n, s1 - n + w, _ink);
    }
    if (glow != null) {
      final out = Offset(-u.dy, u.dx) * -1;
      for (final k in [-0.12, 0.12]) {
        final from = (s0 + s1) / 2 + u * _u * k + out * _u * 0.4;
        final to = from + (out + u * 0.6) * _u * 0.35;
        canvas.drawLine(from, to, stroke(LabInk.ink, 1.5));
        arrowHead(canvas, to, to - from, stroke(LabInk.ink, 1.5), size: _u * 0.12);
      }
    }
    if (name != null) _side(name, (s0 + s1) / 2, u, gap: 0.65);
  }

  /// A switch or plug key between a and b.
  void key(double ax, double ay, double bx, double by, {required bool closed, String? name}) {
    final (a, s0, s1, u) = _seg(ax, ay, bx, by, 0.8);
    final b = p(bx, by);
    canvas.drawLine(a, s0, _wire);
    canvas.drawLine(s1, b, _wire);
    canvas.drawCircle(s0, 3.5, fill(LabInk.ink));
    canvas.drawCircle(s1, 3.5, fill(LabInk.ink));
    final n = Offset(-u.dy, u.dx);
    canvas.drawLine(s0, closed ? s1 : s0 + (u * 0.8 + n * 0.55) * (s1 - s0).distance, _ink);
    if (name != null) _side(name, (s0 + s1) / 2, u);
  }

  /// A meter (A, mA, µA, V, G) at (x, y) showing [reading].
  void meterAt(double x, double y, String letter, double value, double full, String reading) =>
      meter(canvas, p(x, y), _u * 0.45, letter, value, full, reading);

  /// A galvanometer: a centre-zero needle.
  void galvanometer(double x, double y, double deflection) {
    final c = p(x, y), r = _u * 0.45;
    canvas.drawCircle(c, r, fill(Colors.white));
    canvas.drawCircle(c, r, _ink);
    final a = -math.pi / 2 + deflection.clamp(-1.0, 1.0) * 0.9;
    canvas.drawLine(c, c + Offset(math.cos(a), math.sin(a)) * r * 0.8, stroke(LabInk.red, 2));
    label(canvas, 'G', c + Offset(0, r * 0.4), size: r * 0.5, bold: true);
  }

  void ground(double x, double y) {
    final c = p(x, y);
    for (var k = 0; k < 3; k++) {
      final w = _u * (0.3 - k * 0.1);
      canvas.drawLine(c + Offset(-w, k * _u * 0.1), c + Offset(w, k * _u * 0.1), stroke(LabInk.ink, 2));
    }
  }

  /// An op-amp centred at (x, y), pointing right. Returns the grid points of
  /// its − input, + input and output.
  ((double, double), (double, double), (double, double)) opamp(double x, double y) {
    final c = p(x, y), h = _u * 1.0;
    final tri = Path()
      ..moveTo(c.dx - h, c.dy - h)
      ..lineTo(c.dx - h, c.dy + h)
      ..lineTo(c.dx + h, c.dy)
      ..close();
    canvas.drawPath(tri, fill(Colors.white));
    canvas.drawPath(tri, _ink);
    label(canvas, '−', c + Offset(-h * 0.7, -h * 0.5), size: h * 0.45, bold: true);
    label(canvas, '+', c + Offset(-h * 0.7, h * 0.5), size: h * 0.45, bold: true);
    return ((x - 1, y - 0.5), (x - 1, y + 0.5), (x + 1, y));
  }

  /// An NPN transistor centred at (x, y): returns collector, base and
  /// emitter grid points.
  ((double, double), (double, double), (double, double)) npn(double x, double y) {
    final c = p(x, y), r = _u * 0.6;
    canvas.drawCircle(c, r, fill(Colors.white));
    canvas.drawCircle(c, r, _ink);
    final barTop = c + Offset(-r * 0.25, -r * 0.45), barBot = c + Offset(-r * 0.25, r * 0.45);
    canvas.drawLine(barTop, barBot, stroke(LabInk.ink, math.max(3, _u * 0.08)));
    canvas.drawLine(p(x - 1, y), c + Offset(-r * 0.25, 0), _wire);
    final col = p(x + 0.4, y - 1), em = p(x + 0.4, y + 1);
    canvas.drawLine(c + Offset(-r * 0.25, -r * 0.2), c + Offset(r * 0.45, -r * 0.65), _ink);
    canvas.drawLine(c + Offset(r * 0.45, -r * 0.65), col, _wire);
    canvas.drawLine(c + Offset(-r * 0.25, r * 0.2), c + Offset(r * 0.45, r * 0.65), _ink);
    canvas.drawLine(c + Offset(r * 0.45, r * 0.65), em, _wire);
    arrowHead(canvas, c + Offset(r * 0.42, r * 0.62), const Offset(0.7, 0.45), stroke(LabInk.ink, 2), size: _u * 0.2);
    label(canvas, 'C', col + Offset(_u * 0.3, _u * 0.15), size: _u * 0.26, color: LabInk.muted);
    label(canvas, 'B', p(x - 0.8, y - 0.3), size: _u * 0.26, color: LabInk.muted);
    label(canvas, 'E', em + Offset(_u * 0.3, -_u * 0.15), size: _u * 0.26, color: LabInk.muted);
    return ((x + 0.4, y - 1), (x - 1, y), (x + 0.4, y + 1));
  }

  /// A logic gate (IEEE distinctive shapes) centred at (x, y), 2 cells wide.
  /// Returns its input points and output point.
  (List<(double, double)>, (double, double)) gate(GateKind k, double x, double y, {bool lit = false}) {
    final c = p(x, y), w = _u * 1.0, h = _u * 0.8;
    final body = Path();
    final not = k == GateKind.not || k == GateKind.nand || k == GateKind.nor || k == GateKind.xnor;
    switch (k) {
      case GateKind.and || GateKind.nand:
        body
          ..moveTo(c.dx - w, c.dy - h)
          ..lineTo(c.dx, c.dy - h)
          ..arcToPoint(Offset(c.dx, c.dy + h), radius: Radius.circular(h))
          ..lineTo(c.dx - w, c.dy + h)
          ..close();
      case GateKind.not:
        body
          ..moveTo(c.dx - w, c.dy - h)
          ..lineTo(c.dx + w * 0.75, c.dy)
          ..lineTo(c.dx - w, c.dy + h)
          ..close();
      default:
        body
          ..moveTo(c.dx - w, c.dy - h)
          ..quadraticBezierTo(c.dx + w * 0.3, c.dy - h, c.dx + w * 0.85, c.dy)
          ..quadraticBezierTo(c.dx + w * 0.3, c.dy + h, c.dx - w, c.dy + h)
          ..quadraticBezierTo(c.dx - w * 0.55, c.dy, c.dx - w, c.dy - h)
          ..close();
        if (k == GateKind.xor || k == GateKind.xnor) {
          final back = Path()
            ..moveTo(c.dx - w * 1.2, c.dy - h)
            ..quadraticBezierTo(c.dx - w * 0.75, c.dy, c.dx - w * 1.2, c.dy + h);
          canvas.drawPath(back, _ink);
        }
    }
    canvas.drawPath(body, fill(lit ? const Color(0xFFFFF1C9) : Colors.white));
    canvas.drawPath(body, _ink);
    final tipX = k == GateKind.and || k == GateKind.nand ? h : (k == GateKind.not ? w * 0.75 : w * 0.85);
    if (not) {
      canvas.drawCircle(c + Offset(tipX + _u * 0.12, 0), _u * 0.12, fill(Colors.white));
      canvas.drawCircle(c + Offset(tipX + _u * 0.12, 0), _u * 0.12, _ink);
    }
    final ins = k == GateKind.not ? [(x - 1.6, y)] : [(x - 1.6, y - 0.45), (x - 1.6, y + 0.45)];
    for (final i in ins) {
      canvas.drawLine(p(i.$1, i.$2), Offset(c.dx - w * (k == GateKind.xor || k == GateKind.xnor ? 0.85 : 0.95), p(i.$1, i.$2).dy), _wire);
    }
    final outX = x + (tipX + (not ? _u * 0.24 : 0)) / _u;
    canvas.drawLine(p(outX, y), p(x + 1.6, y), _wire);
    return (ins, (x + 1.6, y));
  }

  /// A lamp or LED indicator at (x, y), lit when [on].
  void indicator(double x, double y, bool on, {Color color = LabInk.red}) {
    final c = p(x, y), r = _u * 0.32;
    if (on) canvas.drawCircle(c, r * 2.2, Paint()..color = color.withValues(alpha: 0.35)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10));
    canvas.drawCircle(c, r, fill(on ? color : const Color(0xFFDADDE1)));
    canvas.drawCircle(c, r, stroke(LabInk.ink, 2));
  }

  void _side(String name, Offset at, Offset u, {double gap = 0.55}) {
    final n = Offset(-u.dy, u.dx);
    // Labels go above horizontal parts and left of vertical ones.
    final side = (n.dy < 0 || (n.dy == 0 && n.dx < 0)) ? n : -n;
    label(canvas, name, at + side * _u * gap, size: math.max(11, _u * 0.28), color: LabInk.ink, halo: LabInk.paper);
  }
}

/// One trace on the oscilloscope: (t, v) points.
class ScopeTrace {
  final List<Offset> points;
  final Color color;
  final String name;
  const ScopeTrace(this.points, this.color, this.name);
}

/// A cathode-ray oscilloscope screen: 10 × 8 divisions, [timePerDiv]
/// seconds and [voltsPerDiv] volts per division, 0 V in the middle.
void paintScope(Canvas canvas, Rect r, List<ScopeTrace> traces, {required double timePerDiv, required double voltsPerDiv, double offset = 0}) {
  canvas.drawRRect(RRect.fromRectAndRadius(r.inflate(8), const Radius.circular(10)), fill(const Color(0xFF2B3138)));
  canvas.drawRect(r, fill(const Color(0xFF0E1A14)));
  final grid = stroke(const Color(0xFF2E5B45), 1);
  for (var i = 0; i <= 10; i++) {
    final x = r.left + r.width * i / 10;
    canvas.drawLine(Offset(x, r.top), Offset(x, r.bottom), grid);
  }
  for (var j = 0; j <= 8; j++) {
    final y = r.top + r.height * j / 8;
    canvas.drawLine(Offset(r.left, y), Offset(r.right, y), grid);
  }
  canvas.drawLine(Offset(r.left, r.center.dy), Offset(r.right, r.center.dy), stroke(const Color(0xFF4F8F6E), 1.5));
  canvas.save();
  canvas.clipRect(r);
  final t0 = traces.isEmpty || traces.first.points.isEmpty ? 0.0 : traces.first.points.first.dx;
  for (final tr in traces) {
    if (tr.points.length < 2) continue;
    final path = Path();
    for (var k = 0; k < tr.points.length; k++) {
      final q = tr.points[k];
      final x = r.left + (q.dx - t0) / (timePerDiv * 10) * r.width;
      final y = r.center.dy - (q.dy + offset) / (voltsPerDiv * 4) * (r.height / 2);
      k == 0 ? path.moveTo(x, y) : path.lineTo(x, y);
    }
    canvas.drawPath(path, stroke(tr.color, 2.2));
  }
  canvas.restore();
  var lx = r.left + 8;
  for (final tr in traces) {
    final tp = layoutText(tr.name, 12, tr.color, bold: true);
    tp.paint(canvas, Offset(lx, r.top + 6));
    lx += tp.width + 14;
  }
  final scale = layoutText('${_eng(timePerDiv, 's')}/div   ${_eng(voltsPerDiv, 'V')}/div', 12, const Color(0xFF9FD8B9));
  scale.paint(canvas, Offset(r.right - scale.width - 8, r.bottom - scale.height - 4));
}

String _eng(double v, String unit) {
  if (v >= 1) return '${_trim(v)} $unit';
  if (v >= 1e-3) return '${_trim(v * 1e3)} m$unit';
  return '${_trim(v * 1e6)} µ$unit';
}

String _trim(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1);

/// Engineering notation for a value with its unit: 4700 Ω → '4.7 kΩ'.
String eng(double v, String unit) {
  final a = v.abs();
  String f(double x) {
    var s = x.abs() >= 100 ? x.toStringAsFixed(0) : (x.abs() >= 10 ? x.toStringAsFixed(1) : x.toStringAsFixed(2));
    if (s.contains('.')) s = s.replaceAll(RegExp(r'0+$'), '').replaceAll(RegExp(r'\.$'), '');
    return s;
  }

  if (a == 0) return '0 $unit';
  if (a >= 1e6) return '${f(v / 1e6)} M$unit';
  if (a >= 1e3) return '${f(v / 1e3)} k$unit';
  if (a >= 1) return '${f(v)} $unit';
  if (a >= 1e-3) return '${f(v * 1e3)} m$unit';
  if (a >= 1e-6) return '${f(v * 1e6)} µ$unit';
  if (a >= 1e-9) return '${f(v * 1e9)} n$unit';
  return '${f(v * 1e12)} p$unit';
}
