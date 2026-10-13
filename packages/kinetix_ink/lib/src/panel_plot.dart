import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

// Small drawing helpers shared by the chemical engineering and EV panels: text, strokes, dashes,
// arrows, number formatting and plot axes with nice ticks. Not exported from the package.

const panelInk = Color(0xFF1B1F24);
const panelMuted = Color(0xFF6A7078);
const panelGrid = Color(0xFFE3E6EA);
const panelHot = Color(0xFFD32F2F);
const panelCold = Color(0xFF1565C0);
const panelGood = Color(0xFF0F8A5F);
const panelWarn = Color(0xFFE8710A);

/// Draws [t] at [at] (middle-left by default; [middle] false puts its top there).
Size panelText(Canvas canvas, String t, Offset at, {double size = 16, Color color = panelInk, bool bold = false, TextAlign align = TextAlign.left, double maxWidth = 600, bool middle = true, int maxLines = 1, Color? background}) {
  final tp = TextPainter(
    text: TextSpan(
      text: t,
      style: TextStyle(fontSize: size, color: color, fontWeight: bold ? FontWeight.w700 : FontWeight.w400, fontFamily: KxFonts.board, fontFamilyFallback: KxFonts.fallback),
    ),
    textDirection: TextDirection.ltr,
    textAlign: align,
    maxLines: maxLines,
    ellipsis: '…',
  )..layout(maxWidth: math.max(0, maxWidth));
  final dx = switch (align) {
    TextAlign.right => at.dx - tp.width,
    TextAlign.center => at.dx - tp.width / 2,
    _ => at.dx,
  };
  final o = Offset(dx, middle ? at.dy - tp.height / 2 : at.dy);
  if (background != null) canvas.drawRRect(RRect.fromRectAndRadius((o & tp.size).inflate(2), const Radius.circular(3)), Paint()..color = background);
  tp.paint(canvas, o);
  final s = tp.size;
  tp.dispose();
  return s;
}

Paint panelStroke(Color c, double w) => Paint()
  ..color = c
  ..style = PaintingStyle.stroke
  ..strokeWidth = w
  ..strokeCap = StrokeCap.round
  ..strokeJoin = StrokeJoin.round;

Paint panelFill(Color c) => Paint()..color = c;

void panelDashed(Canvas canvas, Offset a, Offset b, Paint p, {double dash = 8, double gap = 6, double phase = 0}) {
  final len = (b - a).distance;
  if (len == 0) return;
  final dir = (b - a) / len;
  for (var t = -(phase % (dash + gap)); t < len; t += dash + gap) {
    final t0 = math.max(0.0, t), t1 = math.min(len, t + dash);
    if (t1 > t0) canvas.drawLine(a + dir * t0, a + dir * t1, p);
  }
}

/// A filled arrow head at [tip], pointing along [dir].
void panelArrowHead(Canvas canvas, Offset tip, Offset dir, Color c, {double size = 12}) {
  final d = dir.distance == 0 ? const Offset(1, 0) : dir / dir.distance;
  final n = Offset(-d.dy, d.dx);
  final path = Path()
    ..moveTo(tip.dx, tip.dy)
    ..lineTo((tip - d * size + n * size * 0.45).dx, (tip - d * size + n * size * 0.45).dy)
    ..lineTo((tip - d * size - n * size * 0.45).dx, (tip - d * size - n * size * 0.45).dy)
    ..close();
  canvas.drawPath(path, panelFill(c));
}

/// A short number: 3 significant figures, no trailing zeros, thousands grouped.
String panelNum(double v, {int digits = 3}) {
  if (!v.isFinite) return '—';
  if (v == 0) return '0';
  final a = v.abs();
  if (a >= 10000) {
    final s = v.round().toString();
    final neg = s.startsWith('-');
    final d = neg ? s.substring(1) : s;
    final b = StringBuffer();
    for (var i = 0; i < d.length; i++) {
      if (i > 0 && (d.length - i) % 3 == 0) b.write(',');
      b.write(d[i]);
    }
    return '${neg ? '-' : ''}$b';
  }
  final places = math.max(0, digits - 1 - (math.log(a) / math.ln10).floor());
  final s = v.toStringAsFixed(math.min(places, 4));
  return s.contains('.') ? s.replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '') : s;
}

/// Nice tick values from [lo] to [hi].
List<double> panelTicks(double lo, double hi, {int count = 5}) {
  if (!(hi > lo)) return [lo];
  final raw = (hi - lo) / count;
  final p = math.pow(10, (math.log(raw) / math.ln10).floor()).toDouble();
  final m = raw / p;
  final step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  final out = <double>[];
  for (var v = (lo / step).ceil() * step; v <= hi + step * 1e-6; v += step) {
    out.add(double.parse(v.toStringAsFixed(6)));
  }
  return out;
}

/// A plot frame: maps data (x0..x1, y0..y1) into [r], draws grid, ticks and axis titles.
class PanelPlot {
  PanelPlot(this.r, this.x0, this.x1, this.y0, this.y1);
  final Rect r;
  final double x0, x1, y0, y1;

  Offset at(double x, double y) => Offset(r.left + (x - x0) / (x1 - x0) * r.width, r.bottom - (y - y0) / (y1 - y0) * r.height);

  void frame(Canvas canvas, {String xTitle = '', String yTitle = '', int xCount = 5, int yCount = 5, String Function(double)? xFmt, String Function(double)? yFmt}) {
    final grid = panelStroke(panelGrid, 1);
    for (final t in panelTicks(x0, x1, count: xCount)) {
      final p = at(t, y0);
      canvas.drawLine(Offset(p.dx, r.top), Offset(p.dx, r.bottom), grid);
      panelText(canvas, (xFmt ?? panelNum)(t), Offset(p.dx, r.bottom + 14), size: 13, color: panelMuted, align: TextAlign.center);
    }
    for (final t in panelTicks(y0, y1, count: yCount)) {
      final p = at(x0, t);
      canvas.drawLine(Offset(r.left, p.dy), Offset(r.right, p.dy), grid);
      panelText(canvas, (yFmt ?? panelNum)(t), Offset(r.left - 8, p.dy), size: 13, color: panelMuted, align: TextAlign.right);
    }
    canvas.drawRect(r, panelStroke(panelMuted, 1.4));
    if (xTitle.isNotEmpty) panelText(canvas, xTitle, Offset(r.center.dx, r.bottom + 36), size: 14, color: panelMuted, align: TextAlign.center, maxWidth: r.width);
    if (yTitle.isNotEmpty) {
      canvas
        ..save()
        ..translate(r.left - 52, r.center.dy)
        ..rotate(-math.pi / 2);
      panelText(canvas, yTitle, Offset.zero, size: 14, color: panelMuted, align: TextAlign.center, maxWidth: r.height);
      canvas.restore();
    }
  }

  /// A curve through f(x) for x from [a] to [b], clipped to the frame.
  void curve(Canvas canvas, double Function(double) f, double a, double b, Paint p, {int n = 120}) {
    final path = Path();
    var first = true;
    for (var i = 0; i <= n; i++) {
      final x = a + (b - a) * i / n;
      final y = f(x);
      if (!y.isFinite) continue;
      final q = at(x, y.clamp(y0 - (y1 - y0), y1 + (y1 - y0)).toDouble());
      if (first) {
        path.moveTo(q.dx, q.dy);
        first = false;
      } else {
        path.lineTo(q.dx, q.dy);
      }
    }
    canvas
      ..save()
      ..clipRect(r.inflate(1))
      ..drawPath(path, p)
      ..restore();
  }
}
