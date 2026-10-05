import 'dart:math' as math;
import 'dart:ui' show PointMode;

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'ink_models.dart';
import 'sheet_formula.dart';

/// Colours for chart slices and bars, readable on white.
const sheetChartColors = [Color(0xFF0057C2), Color(0xFFD97706), Color(0xFF0F8A5F), Color(0xFFB4235A), Color(0xFF6D4BC4), Color(0xFF00838F), Color(0xFF7A4F00)];

const _ink = Color(0xFF1B1F24);
const _muted = Color(0xFF6A7078);
const _line = Color(0x33000000);

void _label(Canvas canvas, String t, Rect box, {double size = 16, Color color = _ink, bool bold = false, TextAlign align = TextAlign.left}) {
  final tp = TextPainter(
    text: TextSpan(
      text: t,
      style: TextStyle(fontSize: size, color: color, fontWeight: bold ? FontWeight.w700 : FontWeight.w400, fontFamily: KxFonts.board, fontFamilyFallback: KxFonts.fallback),
    ),
    textDirection: TextDirection.ltr,
    maxLines: 1,
    ellipsis: '…',
    textAlign: align,
  )..layout(maxWidth: math.max(0, box.width));
  final dx = switch (align) {
    TextAlign.right => box.right - tp.width,
    TextAlign.center => box.center.dx - tp.width / 2,
    _ => box.left,
  };
  tp.paint(canvas, Offset(dx, box.center.dy - tp.height / 2));
  tp.dispose();
}

/// A sheet on a white card: column letters and row numbers, its grid, numbers to the right,
/// and its chart underneath. Laid out at [SheetElement.naturalSize] and scaled to its rect.
void paintSheet(Canvas canvas, SheetElement s) {
  final n = s.naturalSize;
  if (n.width <= 0 || n.height <= 0) return;
  canvas
    ..save()
    ..translate(s.rect.left, s.rect.top)
    ..scale(s.rect.width / n.width, s.rect.height / n.height);
  final card = RRect.fromRectAndRadius(Offset.zero & n, const Radius.circular(8));
  canvas.drawRRect(card, Paint()..color = const Color(0xFFFFFFFF));
  const hh = SheetElement.headerHeight, hw = SheetElement.headerWidth, rh = SheetElement.rowHeight;
  final gridBottom = hh + s.rows * rh;
  final tint = Paint()..color = s.color.withValues(alpha: 0.08);
  canvas.drawRect(Rect.fromLTWH(0, 0, n.width, hh), tint);
  canvas.drawRect(Rect.fromLTWH(0, hh, hw, s.rows * rh), tint);
  if (s.header) canvas.drawRect(Rect.fromLTWH(hw, hh, n.width - hw, rh), Paint()..color = s.color.withValues(alpha: 0.16));
  final grid = Paint()
    ..color = _line
    ..strokeWidth = 1;
  var x = hw;
  final xs = <double>[hw];
  for (var c = 0; c < s.cols; c++) {
    _label(canvas, columnName(c), Rect.fromLTWH(x, 0, s.widths[c], hh), size: 13, color: _muted, align: TextAlign.center);
    x += s.widths[c];
    xs.add(x);
  }
  for (final gx in [0.0, ...xs]) {
    canvas.drawLine(Offset(gx, 0), Offset(gx, gridBottom), grid);
  }
  for (var r = 0; r <= s.rows; r++) {
    canvas.drawLine(Offset(0, hh + r * rh), Offset(n.width, hh + r * rh), grid);
  }
  canvas.drawLine(Offset.zero, Offset(n.width, 0), grid);
  final values = evaluateSheet(s);
  for (var r = 0; r < s.rows; r++) {
    final y = hh + r * rh;
    _label(canvas, '${r + 1}', Rect.fromLTWH(0, y, hw, rh), size: 13, color: _muted, align: TextAlign.center);
    for (var c = 0; c < s.cols; c++) {
      final v = values[r * s.cols + c];
      if (v.isEmpty) continue;
      final box = Rect.fromLTRB(xs[c] + 8, y, xs[c + 1] - 8, y + rh);
      final head = s.header && r == 0;
      _label(
        canvas,
        displaySheetCell(s, r, c),
        box,
        bold: head,
        color: v.error != null ? const Color(0xFFC62828) : (head ? s.color : _ink),
        align: v.number != null ? TextAlign.right : (head ? TextAlign.center : TextAlign.left),
      );
    }
  }
  if (s.chart != null) paintSheetChart(canvas, s, Rect.fromLTWH(hw, gridBottom + 16, n.width - hw - 16, SheetElement.chartHeight - 32));
  canvas.drawRRect(
    card,
    Paint()
      ..color = _line
      ..style = PaintingStyle.stroke,
  );
  canvas.restore();
}

/// A sheet's chart in [area]: bars, a line or a pie, labelled.
void paintSheetChart(Canvas canvas, SheetElement s, Rect area) {
  final (:labels, :values) = sheetChartData(s);
  if (values.isEmpty) {
    _label(canvas, '—', area, color: _muted, align: TextAlign.center);
    return;
  }
  final kind = s.chart!.kind;
  if (kind == SheetChartKind.pie) {
    final total = values.where((v) => v > 0).fold(0.0, (a, b) => a + b);
    if (total <= 0) return;
    final r = math.min(area.height / 2, area.width / 4);
    final c = Offset(area.left + r + 8, area.center.dy);
    var a = -math.pi / 2;
    for (var i = 0; i < values.length; i++) {
      if (values[i] <= 0) continue;
      final sweep = values[i] / total * 2 * math.pi;
      canvas.drawArc(Rect.fromCircle(center: c, radius: r), a, sweep, true, Paint()..color = sheetChartColors[i % sheetChartColors.length]);
      a += sweep;
    }
    final lx = c.dx + r + 24;
    final rowH = math.min(26.0, area.height / values.length);
    for (var i = 0; i < values.length; i++) {
      final y = area.top + i * rowH;
      canvas.drawRect(Rect.fromLTWH(lx, y + rowH / 2 - 6, 12, 12), Paint()..color = sheetChartColors[i % sheetChartColors.length]);
      final pct = values[i] > 0 ? values[i] / total * 100 : 0;
      _label(canvas, '${labels[i]}  ${pct.toStringAsFixed(1)}%', Rect.fromLTWH(lx + 18, y, area.right - lx - 18, rowH), size: 14);
    }
    return;
  }
  final hi = math.max(0.0, values.reduce(math.max)), lo = math.min(0.0, values.reduce(math.min));
  final span = hi - lo == 0 ? 1.0 : hi - lo;
  final plot = Rect.fromLTRB(area.left + 8, area.top + 22, area.right, area.bottom - 24);
  double yOf(double v) => plot.bottom - (v - lo) / span * plot.height;
  final axis = Paint()
    ..color = const Color(0xFF3A4048)
    ..strokeWidth = 1.4;
  canvas.drawLine(Offset(plot.left, yOf(0)), Offset(plot.right, yOf(0)), axis);
  canvas.drawLine(Offset(plot.left, plot.top), Offset(plot.left, plot.bottom), axis);
  final step = plot.width / values.length;
  final pts = <Offset>[];
  for (var i = 0; i < values.length; i++) {
    final cx = plot.left + step * (i + 0.5);
    final top = yOf(values[i]);
    if (kind == SheetChartKind.bar) {
      canvas.drawRect(Rect.fromLTRB(cx - step * 0.32, math.min(top, yOf(0)), cx + step * 0.32, math.max(top, yOf(0))), Paint()..color = s.color.withValues(alpha: 0.85));
    } else {
      pts.add(Offset(cx, top));
    }
    _label(canvas, formatGeneral(double.parse(values[i].toStringAsFixed(2))), Rect.fromLTWH(cx - step / 2, top - 20, step, 18), size: 12, color: _muted, align: TextAlign.center);
    _label(canvas, labels[i], Rect.fromLTWH(cx - step / 2, plot.bottom + 4, step, 20), size: 13, align: TextAlign.center);
  }
  if (pts.isNotEmpty) {
    canvas.drawPoints(
      PointMode.polygon,
      pts,
      Paint()
        ..color = s.color
        ..strokeWidth = 3
        ..strokeCap = StrokeCap.round,
    );
    for (final p in pts) {
      canvas.drawCircle(p, 5, Paint()..color = s.color);
    }
  }
}
