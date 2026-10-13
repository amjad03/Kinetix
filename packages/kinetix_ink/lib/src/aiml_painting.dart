import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'aiml_models.dart';

// Drawing the AI and machine learning panels on a white card: a neural network as the textbooks
// draw it (neurons and their connections, feature maps for convolutions, big layers collapsed
// with "⋮"), each layer's shape and parameters, and on a tiny net the forward pass with numbers;
// and the ML playground's snapshot (decision regions, the points, the fitted curve, metrics,
// confusion matrix and loss curve).

const _ink = Color(0xFF1B1F24);
const _muted = Color(0xFF6A7078);
const _line = Color(0xFFC9CED6);
const _bad = Color(0xFFC62828);

/// The two classes' colours (class 0 blue, class 1 orange) and the clusters'.
const mlClassColors = [Color(0xFF1E6BD6), Color(0xFFE8710A)];
const mlClusterColors = [Color(0xFF1E6BD6), Color(0xFFE8710A), Color(0xFF2E9D4A), Color(0xFF8E44AD), Color(0xFFC0392B), Color(0xFF00838F)];

void _text(Canvas canvas, String t, Offset at, {double size = 16, Color color = _ink, bool bold = false, TextAlign align = TextAlign.left, double maxWidth = 600}) {
  final tp = TextPainter(
    text: TextSpan(
      text: t,
      style: TextStyle(fontSize: size, color: color, fontWeight: bold ? FontWeight.w700 : FontWeight.w400, fontFamily: KxFonts.board, fontFamilyFallback: KxFonts.fallback),
    ),
    textDirection: TextDirection.ltr,
    maxLines: 1,
    ellipsis: '…',
  )..layout(maxWidth: math.max(0, maxWidth));
  final dx = switch (align) {
    TextAlign.right => at.dx - tp.width,
    TextAlign.center => at.dx - tp.width / 2,
    _ => at.dx,
  };
  tp.paint(canvas, Offset(dx, at.dy - tp.height / 2));
  tp.dispose();
}

Paint _stroke(Color c, double w) => Paint()
  ..color = c
  ..style = PaintingStyle.stroke
  ..strokeWidth = w
  ..strokeCap = StrokeCap.round;

String nnNum(double v) {
  if (!v.isFinite) return '—';
  if (v.abs() >= 100) return v.toStringAsFixed(0);
  final s = v.toStringAsFixed(2);
  return s.contains('.') ? s.replaceFirst(RegExp(r'\.?0+$'), '') : s;
}

// --- Neural network diagram ---------------------------------------------------------------------

/// Neurons drawn per flat layer before it collapses to the first and last few with "⋮".
const nnShownNeurons = 8;

/// Which neurons of a layer of [n] are drawn: all of a small one, else the first three, a gap
/// (-1) and the last three.
List<int> nnShownIndices(int n) => n <= nnShownNeurons ? [for (var i = 0; i < n; i++) i] : [0, 1, 2, -1, n - 3, n - 2, n - 1];

/// Where each layer's column sits and its drawn neurons' centres (an image layer has none).
class NnLayout {
  NnLayout(this.columns, this.neurons, this.radius, this.plot);
  final List<double> columns;
  final List<List<(int, Offset)>> neurons;
  final double radius;
  final Rect plot;
}

NnLayout layoutNn(NnModel m, Size size) {
  final shapes = m.shapes();
  final plot = Rect.fromLTRB(70, 110, size.width - 70, size.height - 200);
  final n = m.layers.length;
  final cols = [for (var i = 0; i < n; i++) n == 1 ? plot.center.dx : plot.left + plot.width * i / (n - 1)];
  final most = shapes.fold(1, (a, s) => s.isImage ? a : math.max(a, nnShownIndices(s.size).length));
  final gap = plot.height / math.max(most, 2);
  final r = math.min(26.0, math.min(gap * 0.36, (n > 1 ? plot.width / (n - 1) : plot.width) * 0.2));
  final neurons = <List<(int, Offset)>>[];
  for (var i = 0; i < n; i++) {
    final s = shapes[i];
    if (s.isImage) {
      neurons.add(const []);
      continue;
    }
    final idx = nnShownIndices(s.size);
    final h = (idx.length - 1) * gap;
    neurons.add([for (final (k, j) in idx.indexed) (j, Offset(cols[i], plot.center.dy - h / 2 + k * gap))]);
  }
  return NnLayout(cols, neurons, r, plot);
}

void paintNnDiagram(Canvas canvas, NnModel m, Size size, Color accent) {
  _text(canvas, m.title, const Offset(28, 44), size: 30, bold: true, color: accent, maxWidth: size.width - 56);
  if (m.layers.isEmpty) {
    _text(canvas, 'Add a layer', size.center(Offset.zero), size: 22, color: _muted, align: TextAlign.center);
    return;
  }
  final shapes = m.shapes();
  final lay = layoutNn(m, size);
  final fwd = m.step >= 0 ? m.forward() : null;
  final r = lay.radius;
  final colWidth = m.layers.length > 1 ? lay.plot.width / (m.layers.length - 1) : lay.plot.width;

  Rect boxOf(int i) {
    final s = shapes[i].shape;
    final side = (lay.plot.height * 0.18 + math.sqrt(s[0].toDouble()) * lay.plot.height * 0.06).clamp(40.0, lay.plot.height * 0.6);
    final w = math.min(side, colWidth * 0.55);
    return Rect.fromCenter(center: Offset(lay.columns[i], lay.plot.center.dy), width: w, height: side);
  }

  // Connections, behind the neurons.
  final edge = _stroke(_line, 1);
  for (var i = 1; i < m.layers.length; i++) {
    final from = lay.neurons[i - 1], to = lay.neurons[i];
    final active = fwd != null && m.step == i;
    final w = i < m.weights.length ? m.weights[i] : null;
    if (from.isEmpty || to.isEmpty) {
      // Feature maps: a few lines from box to box (or box to neurons).
      final a = from.isEmpty ? boxOf(i - 1) : Rect.fromCircle(center: from.first.$2, radius: r);
      final b = to.isEmpty ? boxOf(i) : null;
      final targets = b != null ? [b.topLeft, b.bottomLeft, b.centerLeft] : [for (final (j, p) in to) if (j >= 0) p - Offset(r, 0)];
      for (final t in targets) {
        canvas.drawLine(from.isEmpty ? a.centerRight : a.center, t, edge);
      }
      continue;
    }
    if (m.layers[i].type == NnLayerType.dropout) {
      for (var k = 0; k < math.min(from.length, to.length); k++) {
        if (from[k].$1 >= 0) canvas.drawLine(from[k].$2 + Offset(r, 0), to[k].$2 - Offset(r, 0), edge);
      }
      continue;
    }
    for (final (jt, pt) in to) {
      if (jt < 0) continue;
      for (final (jf, pf) in from) {
        if (jf < 0) continue;
        if (active && w != null && jt < w.length && jf < w[jt].length) {
          final v = w[jt][jf];
          final c = v >= 0 ? accent : _bad;
          canvas.drawLine(pf + Offset(r, 0), pt - Offset(r, 0), _stroke(c.withValues(alpha: 0.8), (1 + v.abs() / 4).clamp(1.5, 5.0)));
          final at = Offset.lerp(pf, pt, 0.3)!;
          canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: at, width: 46, height: 22), const Radius.circular(5)), Paint()..color = const Color(0xF0FFFFFF));
          _text(canvas, nnNum(v), at, size: 14, color: c, bold: true, align: TextAlign.center);
        } else {
          canvas.drawLine(pf + Offset(r, 0), pt - Offset(r, 0), edge);
        }
      }
    }
  }

  // Layers.
  for (var i = 0; i < m.layers.length; i++) {
    final l = m.layers[i];
    final s = shapes[i];
    final x = lay.columns[i];
    final on = fwd != null && i <= m.step;
    final current = m.step == i;
    if (current) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(x, lay.plot.center.dy), width: math.max(r * 4, 60), height: lay.plot.height + 40), const Radius.circular(14)),
        Paint()..color = accent.withValues(alpha: 0.10),
      );
    }
    if (s.isImage) {
      final b = boxOf(i);
      final maps = math.min(s.shape[2], 4);
      for (var k = maps - 1; k >= 0; k--) {
        final rr = b.shift(Offset(k * 7.0, -k * 7.0));
        canvas
          ..drawRect(rr, Paint()..color = Color.lerp(Colors.white, accent, l.type == NnLayerType.pool ? 0.10 : 0.18)!)
          ..drawRect(rr, _stroke(accent, current ? 3 : 1.6));
      }
      if (l.type == NnLayerType.conv) {
        final k = (b.width * l.kernel / math.max(1, s.shape[0] + l.kernel - 1)).clamp(8.0, b.width / 2);
        canvas.drawRect(Rect.fromLTWH(b.left + 6, b.top + 6, k, k), _stroke(_ink, 1.4));
      }
      _text(canvas, s.shape[2] > 1 ? '${s.shape[2]}@${s.shape[0]}×${s.shape[1]}' : '${s.shape[0]}×${s.shape[1]}', Offset(x, b.top - 24), size: 15, color: _muted, align: TextAlign.center, maxWidth: colWidth);
    } else {
      final dropout = l.type == NnLayerType.dropout;
      for (final (j, p) in lay.neurons[i]) {
        if (j < 0) {
          _text(canvas, '⋮', p, size: r * 1.4, color: _muted, align: TextAlign.center);
          continue;
        }
        final value = fwd != null && on && fwd.a[i].length > j ? fwd.a[i][j] : null;
        final fill = value == null ? Colors.white : Color.lerp(Colors.white, accent, value.clamp(0.0, 1.0) * 0.75)!;
        canvas.drawCircle(p, r, Paint()..color = fill);
        if (dropout && j.isOdd && fwd == null) {
          canvas.drawCircle(p, r, _stroke(_muted, 1.4));
          canvas
            ..drawLine(p + Offset(-r * 0.6, -r * 0.6), p + Offset(r * 0.6, r * 0.6), _stroke(_bad, 2))
            ..drawLine(p + Offset(r * 0.6, -r * 0.6), p + Offset(-r * 0.6, r * 0.6), _stroke(_bad, 2));
        } else {
          canvas.drawCircle(p, r, _stroke(l.type == NnLayerType.input ? _ink : accent, current ? 3.2 : 2));
        }
        if (value != null) {
          _text(canvas, nnNum(value), p, size: math.min(18, r * 0.8), bold: true, color: value > 0.6 ? Colors.white : _ink, align: TextAlign.center, maxWidth: r * 2);
          if (fwd != null && current && i > 0 && fwd.z[i].length > j && l.type != NnLayerType.dropout) {
            _text(canvas, 'z = ${nnNum(fwd.z[i][j])}', p + Offset(0, r + 14), size: 13, color: _muted, align: TextAlign.center, maxWidth: colWidth);
          }
        }
      }
      if (s.size > nnShownNeurons) {
        _text(canvas, '${s.size} neurons', Offset(x, lay.plot.top - 20), size: 14, color: _muted, align: TextAlign.center, maxWidth: colWidth);
      }
    }
    // Captions under the column.
    final base = lay.plot.bottom + 34;
    final name = nnLayerNames[l.type]!;
    final act = l.activation == NnActivation.none || l.type == NnLayerType.input || l.type == NnLayerType.pool || l.type == NnLayerType.flatten || l.type == NnLayerType.dropout ? '' : ' · ${nnActivationNames[l.activation]}';
    final extra = switch (l.type) {
      NnLayerType.conv => ' ${l.kernel}×${l.kernel}',
      NnLayerType.pool => ' ${l.kernel}×${l.kernel}',
      NnLayerType.dropout => ' ${nnNum(l.rate)}',
      _ => '',
    };
    final cw = math.max(110.0, colWidth - 8);
    _text(canvas, '$name$extra$act', Offset(x, base), size: 16, bold: true, color: s.error != null ? _bad : _ink, align: TextAlign.center, maxWidth: cw);
    _text(canvas, s.error ?? s.text, Offset(x, base + 24), size: 15, color: s.error != null ? _bad : _muted, align: TextAlign.center, maxWidth: cw);
    _text(canvas, s.params > 0 ? '${groupThousands(s.params)} params' : '—', Offset(x, base + 46), size: 14, color: _muted, align: TextAlign.center, maxWidth: cw);
    if (l.label.isNotEmpty) _text(canvas, l.label, Offset(x, base + 68), size: 14, color: accent, align: TextAlign.center, maxWidth: cw);
  }

  final total = 'Total parameters: ${groupThousands(m.totalParams)}';
  _text(canvas, total, Offset(size.width - 28, size.height - 30), size: 20, bold: true, color: accent, align: TextAlign.right, maxWidth: size.width / 2);
  if (fwd != null) {
    final x = m.input.map(nnNum).join(', ');
    final y = fwd.a.last.map(nnNum).join(', ');
    _text(canvas, 'x = [$x]  →  ${m.step >= m.layers.length - 1 ? 'y = [$y]' : '…'}', Offset(28, size.height - 30), size: 20, bold: true, maxWidth: size.width / 2);
  }
}

// --- ML playground snapshot ---------------------------------------------------------------------

/// Where the snapshot's plot sits on a panel of [size] (the playground clicks in the same frame).
Rect mlPlotRect(Size size) => Rect.fromLTRB(84, 90, size.width * 0.66, size.height - 70);

/// Data to panel coordinates and back for [s] on [plot].
Offset mlToPlot(MlSnapshot s, Rect plot, double x, double y) =>
    Offset(plot.left + (x - s.xMin) / (s.xMax - s.xMin) * plot.width, plot.bottom - (y - s.yMin) / (s.yMax - s.yMin) * plot.height);

Offset mlFromPlot(MlSnapshot s, Rect plot, Offset p) =>
    Offset(s.xMin + (p.dx - plot.left) / plot.width * (s.xMax - s.xMin), s.yMin + (plot.bottom - p.dy) / plot.height * (s.yMax - s.yMin));

String _metric(double v) => v.abs() >= 1000 ? v.toStringAsFixed(0) : double.parse(v.toStringAsPrecision(3)).toString();

void paintMlSnapshot(Canvas canvas, MlSnapshot s, Size size, Color accent) {
  _text(canvas, s.title, const Offset(28, 40), size: 28, bold: true, color: accent, maxWidth: size.width * 0.62);
  _text(canvas, s.model, Offset(size.width - 28, 40), size: 20, bold: true, align: TextAlign.right, maxWidth: size.width * 0.34);
  final plot = mlPlotRect(size);
  canvas.save();
  canvas.clipRect(plot);
  // Decision regions.
  if (s.grid.isNotEmpty && s.gridW > 0 && s.gridH > 0 && s.grid.length >= s.gridW * s.gridH) {
    final cw = plot.width / s.gridW, ch = plot.height / s.gridH;
    for (var r = 0; r < s.gridH; r++) {
      for (var c = 0; c < s.gridW; c++) {
        final v = s.grid[r * s.gridW + c];
        if (!v.isFinite) continue;
        final Color col;
        if (s.task == MlTask.cluster) {
          col = mlClusterColors[v.round().clamp(0, mlClusterColors.length - 1)].withValues(alpha: 0.16);
        } else {
          final p = v.clamp(0.0, 1.0);
          col = Color.lerp(mlClassColors[0], mlClassColors[1], p)!.withValues(alpha: 0.10 + (p - 0.5).abs() * 0.36);
        }
        canvas.drawRect(Rect.fromLTWH(plot.left + c * cw, plot.top + r * ch, cw + 0.6, ch + 0.6), Paint()..color = col);
      }
    }
  }
  // Grid lines.
  for (var i = 1; i < 10; i++) {
    final gx = plot.left + plot.width * i / 10, gy = plot.top + plot.height * i / 10;
    canvas
      ..drawLine(Offset(gx, plot.top), Offset(gx, plot.bottom), _stroke(const Color(0x14000000), 1))
      ..drawLine(Offset(plot.left, gy), Offset(plot.right, gy), _stroke(const Color(0x14000000), 1));
  }
  // Curves.
  void curve(List<Offset> pts, Paint p, {bool dashed = false}) {
    if (pts.length < 2) return;
    final path = Path();
    for (final (i, o) in pts.indexed) {
      final q = mlToPlot(s, plot, o.dx, o.dy);
      i == 0 ? path.moveTo(q.dx, q.dy) : path.lineTo(q.dx, q.dy);
    }
    if (!dashed) {
      canvas.drawPath(path, p);
      return;
    }
    for (final metric in path.computeMetrics()) {
      for (var d = 0.0; d < metric.length; d += 18) {
        canvas.drawPath(metric.extractPath(d, math.min(metric.length, d + 10)), p);
      }
    }
  }

  curve(s.curve2, _stroke(_muted, 2.4), dashed: true);
  curve(s.curve, _stroke(accent, 3.6));
  // Points.
  for (final p in s.points) {
    final q = mlToPlot(s, plot, p.x, p.y);
    final Color c;
    if (s.task == MlTask.cluster && s.centroids.isNotEmpty) {
      var best = 0;
      for (var j = 1; j < s.centroids.length; j++) {
        if ((s.centroids[j] - Offset(p.x, p.y)).distanceSquared < (s.centroids[best] - Offset(p.x, p.y)).distanceSquared) best = j;
      }
      c = mlClusterColors[best % mlClusterColors.length];
    } else {
      c = p.label >= 0 ? mlClassColors[p.label.clamp(0, 1)] : _ink;
    }
    canvas
      ..drawCircle(q, 7, Paint()..color = c)
      ..drawCircle(q, 7, _stroke(Colors.white, 1.6));
  }
  for (final (i, c) in s.centroids.indexed) {
    final q = mlToPlot(s, plot, c.dx, c.dy);
    final col = mlClusterColors[i % mlClusterColors.length];
    canvas
      ..drawLine(q + const Offset(-12, -12), q + const Offset(12, 12), _stroke(Colors.white, 7))
      ..drawLine(q + const Offset(12, -12), q + const Offset(-12, 12), _stroke(Colors.white, 7))
      ..drawLine(q + const Offset(-12, -12), q + const Offset(12, 12), _stroke(col, 4))
      ..drawLine(q + const Offset(12, -12), q + const Offset(-12, 12), _stroke(col, 4));
  }
  canvas.restore();
  canvas.drawRect(plot, _stroke(const Color(0xFF3A4048), 1.6));
  // Axes' numbers and names.
  for (var i = 0; i <= 4; i++) {
    final x = s.xMin + (s.xMax - s.xMin) * i / 4, y = s.yMin + (s.yMax - s.yMin) * i / 4;
    _text(canvas, _metric(x), Offset(plot.left + plot.width * i / 4, plot.bottom + 16), size: 13, color: _muted, align: TextAlign.center);
    _text(canvas, _metric(y), Offset(plot.left - 8, plot.bottom - plot.height * i / 4), size: 13, color: _muted, align: TextAlign.right);
  }
  _text(canvas, s.xLabel, Offset(plot.center.dx, plot.bottom + 42), size: 16, color: _ink, align: TextAlign.center, maxWidth: plot.width);
  canvas
    ..save()
    ..translate(22, plot.center.dy)
    ..rotate(-math.pi / 2);
  _text(canvas, s.yLabel, Offset.zero, size: 16, align: TextAlign.center, maxWidth: plot.height);
  canvas.restore();

  // The side column: details, metrics, confusion matrix, loss curve.
  final left = plot.right + 40, right = size.width - 28;
  var y = plot.top + 8;
  if (s.details.isNotEmpty) {
    _text(canvas, s.details, Offset(left, y), size: 15, color: _muted, maxWidth: right - left);
    y += 34;
  }
  const names = {'accuracy': 'Accuracy', 'mse': 'MSE', 'r2': 'R²', 'inertia': 'Inertia (WCSS)', 'loss': 'Loss'};
  for (final e in s.metrics.entries) {
    final v = e.key == 'accuracy' ? '${(e.value * 100).toStringAsFixed(1)}%' : _metric(e.value);
    _text(canvas, names[e.key] ?? e.key, Offset(left, y), size: 18, color: _muted, maxWidth: (right - left) * 0.6);
    _text(canvas, v, Offset(right, y), size: 22, bold: true, color: accent, align: TextAlign.right);
    y += 34;
  }
  if (s.confusion case final cm? when cm.length == 2 && cm.every((r) => r.length == 2)) {
    y += 14;
    _text(canvas, 'Confusion matrix', Offset(left, y), size: 16, bold: true);
    y += 20;
    final cell = math.min(70.0, (right - left - 70) / 2);
    _text(canvas, 'predicted →', Offset(left + 70 + cell, y + 6), size: 12, color: _muted, align: TextAlign.center);
    y += 16;
    for (var c = 0; c < 2; c++) {
      _text(canvas, '$c', Offset(left + 70 + cell * (c + 0.5), y + 8), size: 14, bold: true, color: mlClassColors[c], align: TextAlign.center);
    }
    y += 18;
    final most = math.max(1, cm.expand((r) => r).fold(0, math.max));
    for (var r = 0; r < 2; r++) {
      _text(canvas, 'actual $r', Offset(left, y + cell * (r + 0.5)), size: 13, color: mlClassColors[r]);
      for (var c = 0; c < 2; c++) {
        final rect = Rect.fromLTWH(left + 70 + cell * c, y + cell * r, cell, cell);
        canvas
          ..drawRect(rect, Paint()..color = (r == c ? const Color(0xFF2E9D4A) : _bad).withValues(alpha: 0.08 + 0.5 * cm[r][c] / most))
          ..drawRect(rect, _stroke(_line, 1));
        _text(canvas, '${cm[r][c]}', rect.center, size: 22, bold: true, align: TextAlign.center);
      }
    }
    y += cell * 2 + 16;
  }
  final curves = [if (s.loss.length > 1) ('Loss', s.loss, accent), if (s.acc.length > 1) ('Accuracy', s.acc, const Color(0xFF2E9D4A))];
  if (curves.isNotEmpty) {
    final box = Rect.fromLTRB(left, math.max(y + 30, plot.bottom - 170), right, plot.bottom);
    if (box.height > 50) {
      canvas.drawRect(box, _stroke(_line, 1));
      for (final (k, (name, vs, col)) in curves.indexed) {
        final hi = vs.where((v) => v.isFinite).fold(double.negativeInfinity, math.max), lo = name == 'Accuracy' ? 0.0 : math.min(0.0, vs.where((v) => v.isFinite).fold(double.infinity, math.min));
        final top = name == 'Accuracy' ? 1.0 : (hi <= lo ? lo + 1 : hi);
        final path = Path();
        for (final (i, v) in vs.indexed) {
          if (!v.isFinite) continue;
          final q = Offset(box.left + box.width * i / (vs.length - 1), box.bottom - (v - lo) / (top - lo) * box.height);
          i == 0 ? path.moveTo(q.dx, q.dy) : path.lineTo(q.dx, q.dy);
        }
        canvas.drawPath(path, _stroke(col, 2.4)..style = PaintingStyle.stroke);
        _text(canvas, name, Offset(box.left + 6 + k * 110, box.top - 14), size: 14, bold: true, color: col);
      }
      _text(canvas, 'epochs →', Offset(box.right, box.bottom + 14), size: 12, color: _muted, align: TextAlign.right);
    }
  }
}
