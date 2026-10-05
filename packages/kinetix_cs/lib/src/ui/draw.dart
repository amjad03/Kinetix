import 'dart:math' as math;

import 'package:flutter/painting.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../algo/frames.dart';

/// Board elements for the CS kit, laid out around (0, 0): the algorithm steps, tables and
/// diagrams are made of ordinary board elements, so the player draws them with the board's
/// own painter and "Put on board" inserts exactly what the class saw.

const inkColor = Color(0xFF1B1F24);

Color markColor(Mark m) => switch (m) {
  Mark.none => const Color(0xFF9AA0A6),
  Mark.compare => const Color(0xFFF2A900),
  Mark.swap => const Color(0xFFD93025),
  Mark.sorted => const Color(0xFF188038),
  Mark.pivot => const Color(0xFF8E24AA),
  Mark.found => const Color(0xFF0F9D58),
  Mark.active => const Color(0xFF1A73E8),
  Mark.visited => const Color(0xFF00897B),
  Mark.dim => const Color(0xFFDADCE0),
};

TextElement text(String t, Offset at, {Color color = inkColor, double size = 20, bool bold = false, bool center = false}) {
  final s = measureBoardText(t, size, bold: bold);
  return TextElement(id: newElementId(), position: center ? at - Offset(s.width / 2, s.height / 2) : at, text: t, color: color, fontSize: size, size: s, bold: bold);
}

PolygonElement poly(List<Offset> pts, {Color color = inkColor, Color? fill, double width = 2.5, bool closed = true}) =>
    PolygonElement(id: newElementId(), points: pts, color: color, width: width, fill: fill, closed: closed);

PolygonElement box(Rect r, {Color color = inkColor, Color? fill, double width = 2.5}) => poly([r.topLeft, r.topRight, r.bottomRight, r.bottomLeft], color: color, fill: fill, width: width);

Stroke shape(ShapeKind kind, Offset a, Offset b, {Color color = inkColor, double width = 2.5, Color? fill}) => Stroke(
  id: newElementId(),
  style: InkStyle(tool: InkTool.shape, color: color, width: width, shape: kind),
  shape: kind,
  fill: fill,
  points: shapePoints(kind, a, b),
);

Stroke line(Offset a, Offset b, {Color color = inkColor, double width = 2.5}) => shape(ShapeKind.line, a, b, color: color, width: width);

Stroke arrow(Offset a, Offset b, {Color color = inkColor, double width = 2.5}) => shape(ShapeKind.arrow, a, b, color: color, width: width);

Stroke circle(Offset c, double r, {Color color = inkColor, Color? fill, double width = 2.5}) => shape(ShapeKind.ellipse, c - Offset(r, r), c + Offset(r, r), color: color, fill: fill, width: width);

/// A dashed line, as short strokes.
List<BoardElement> dashed(Offset a, Offset b, {Color color = inkColor, double dash = 10, double gap = 7, double width = 2.5}) {
  final d = b - a;
  final len = d.distance;
  if (len == 0) return const [];
  final u = d / len;
  return [for (var s = 0.0; s < len; s += dash + gap) line(a + u * s, a + u * math.min(s + dash, len), color: color, width: width)];
}

/// A monospaced card: code (coloured) or a program's output and tables ([language] `output`).
NoteElement codeCard(String body, {String? language, Color color = const Color(0xFF006879), double fontSize = 22}) {
  final lines = body.replaceAll('\t', '    ').split('\n');
  final longest = lines.fold(0, (m, l) => l.length > m ? l.length : m);
  final scale = fontSize / 22;
  final size = Size(((longest * 11.3 + 40) * scale).clamp(200, 2000).toDouble(), ((lines.length * 25.4 + 50) * scale).clamp(80, 2400).toDouble());
  return NoteElement(id: newElementId(), rect: Offset.zero & size, text: body, color: color, kind: NoteKind.code, language: language, fontSize: fontSize);
}

/// [elements] moved so their box starts at [at].
List<BoardElement> placed(List<BoardElement> elements, Offset at) {
  final b = contentBounds(elements);
  return [for (final e in elements) e.translated(at - b.topLeft)];
}

/// [rows] stacked with [gap] between them, left-aligned.
List<BoardElement> stack(List<List<BoardElement>> rows, {double gap = 24}) {
  final out = <BoardElement>[];
  var y = 0.0;
  for (final r in rows.where((r) => r.isNotEmpty)) {
    out.addAll(placed(r, Offset(0, y)));
    y += contentBounds(r).height + gap;
  }
  return out;
}

// --- Algorithm frames ------------------------------------------------------------------------

/// A step as board elements, with its [caption] above when given.
List<BoardElement> frameElements(AlgoFrame f, {String? caption}) {
  final body = switch (f.view) {
    ArrayView v => _array(v),
    LineView v => _line(v),
    TreeView v => _tree(v),
    GraphView v => _graph(v),
    HashView v => _hash(v),
  };
  return stack([
    if (caption != null) [text(caption, Offset.zero, size: 24, bold: true)],
    body,
  ]);
}

List<BoardElement> _pointerLabels(Map<String, int> pointers, double Function(int) xOf, double y) {
  final out = <BoardElement>[];
  final byIndex = <int, List<String>>{};
  pointers.forEach((name, i) => (byIndex[i] ??= []).add(name));
  byIndex.forEach((i, names) {
    out
      ..add(arrow(Offset(xOf(i), y + 26), Offset(xOf(i), y + 2), color: markColor(Mark.active), width: 2))
      ..add(text(names.join(', '), Offset(xOf(i), y + 40), color: markColor(Mark.active), size: 18, bold: true, center: true));
  });
  return out;
}

List<BoardElement> _array(ArrayView v) {
  const w = 56.0, gap = 8.0, maxH = 220.0;
  final out = <BoardElement>[];
  final n = v.values.length;
  if (n == 0) return [text('[ ]', Offset.zero, size: 26)];
  double xOf(int i) => i * (w + gap) + w / 2;
  final lo = math.min(0, v.values.reduce(math.min)), hi = math.max(1, v.values.reduce(math.max));
  if (v.split case (final a, final b)) {
    out.add(box(Rect.fromLTRB(a * (w + gap) - 4, -6, b * (w + gap) - gap + 4, (v.bars ? maxH : w) + 6), color: const Color(0x00000000), fill: const Color(0x221A73E8), width: 0.1));
  }
  for (var i = 0; i < n; i++) {
    final mark = v.marks[i] ?? Mark.none;
    final fill = markColor(mark).withValues(alpha: mark == Mark.none ? 0.35 : 0.85);
    final x = i * (w + gap);
    if (v.bars) {
      final h = 24 + (v.values[i] - lo) / (hi - lo) * (maxH - 24);
      out
        ..add(box(Rect.fromLTWH(x, maxH - h, w, h), color: inkColor, fill: fill, width: 2))
        ..add(text('${v.values[i]}', Offset(x + w / 2, maxH + 18), size: 20, bold: true, center: true));
    } else {
      out
        ..add(box(Rect.fromLTWH(x, 0, w, w), fill: fill, width: 2))
        ..add(text('${v.values[i]}', Offset(x + w / 2, w / 2), size: 22, bold: true, center: true))
        ..add(text('$i', Offset(x + w / 2, w + 14), color: const Color(0xFF5F6368), size: 15, center: true));
    }
  }
  out.addAll(_pointerLabels(v.pointers, xOf, v.bars ? maxH + 34 : w + 28));
  return out;
}

List<BoardElement> _line(LineView v) {
  const w = 64.0, h = 52.0;
  final out = <BoardElement>[];
  Color fill(int i) {
    final m = v.marks[i] ?? Mark.none;
    return markColor(m).withValues(alpha: m == Mark.none ? 0.25 : 0.8);
  }

  switch (v.kind) {
    case LineKind.stack:
      // Upright: the bottom of the stack at the bottom, an open-topped container.
      const cap = 6;
      final height = math.max(cap, v.values.length) * h;
      out.addAll([line(const Offset(-6, 0), Offset(-6, height + 6)), line(Offset(-6, height + 6), Offset(w + 6, height + 6)), line(Offset(w + 6, height + 6), const Offset(w + 6, 0))]);
      for (var i = 0; i < v.values.length; i++) {
        final r = Rect.fromLTWH(0, height - (i + 1) * h, w, h - 4);
        out
          ..add(box(r, fill: fill(i), width: 2))
          ..add(text('${v.values[i]}', r.center, size: 22, bold: true, center: true));
      }
      if (v.values.isNotEmpty) {
        final y = height - v.values.length * h + h / 2;
        out
          ..add(arrow(Offset(w + 70, y), Offset(w + 14, y), color: markColor(Mark.active)))
          ..add(text('top', Offset(w + 76, y - 12), color: markColor(Mark.active), size: 18, bold: true));
      }
    case LineKind.queue:
      for (var i = 0; i < v.values.length; i++) {
        final r = Rect.fromLTWH(i * (w + 6), 0, w, h);
        out
          ..add(box(r, fill: fill(i), width: 2))
          ..add(text('${v.values[i]}', r.center, size: 22, bold: true, center: true));
      }
      if (v.values.isEmpty) out.add(box(const Rect.fromLTWH(0, 0, w, h), color: const Color(0xFFBDBDBD), width: 2));
      out.addAll(_pointerLabels(v.pointers, (i) => i * (w + 6) + w / 2, h + 6));
    case LineKind.linkedList:
      const nodeW = 96.0, step = 150.0;
      for (var i = 0; i < v.values.length; i++) {
        final r = Rect.fromLTWH(i * step, 0, nodeW, h);
        out
          ..add(box(r, fill: fill(i), width: 2))
          ..add(line(Offset(r.left + 60, 0), Offset(r.left + 60, h), width: 2))
          ..add(text('${v.values[i]}', Offset(r.left + 30, h / 2), size: 22, bold: true, center: true))
          ..add(arrow(Offset(r.left + 78, h / 2), Offset((i + 1) * step - 4, h / 2), width: 2));
      }
      out.add(text('null', Offset(v.values.length * step + 4, h / 2 - 12), color: const Color(0xFF5F6368), size: 20));
      out.addAll(_pointerLabels(v.pointers, (i) => i * step + 30, h + 6));
  }
  return out;
}

List<BoardElement> _tree(TreeView v) {
  final out = <BoardElement>[];
  if (v.root < 0) return [text('(empty)', Offset.zero, color: const Color(0xFF5F6368), size: 22)];
  // x from the in-order rank, y from the depth.
  final pos = <int, Offset>{};
  var rank = 0;
  void lay(int n, int depth) {
    if (n < 0) return;
    lay(v.left[n], depth + 1);
    pos[n] = Offset(rank++ * 62.0, depth * 84.0);
    lay(v.right[n], depth + 1);
  }

  lay(v.root, 0);
  for (final n in pos.keys) {
    for (final c in [v.left[n], v.right[n]]) {
      if (c >= 0) out.add(line(pos[n]!, pos[c]!, color: const Color(0xFF5F6368), width: 2));
    }
  }
  for (final MapEntry(key: n, value: p) in pos.entries) {
    final m = v.marks[n] ?? Mark.none;
    out
      ..add(circle(p, 26, fill: m == Mark.none ? const Color(0xFFFFFFFF) : markColor(m).withValues(alpha: 0.85), width: 2))
      ..add(text('${v.values[n]}', p, size: 20, bold: true, center: true));
  }
  if (v.output.isNotEmpty) {
    final maxY = pos.values.map((p) => p.dy).reduce(math.max);
    out.add(text(v.output.join('  '), Offset(-26, maxY + 50), color: markColor(Mark.visited), size: 22, bold: true));
  }
  return out;
}

List<BoardElement> _graph(GraphView v) {
  const size = 460.0;
  final out = <BoardElement>[];
  Offset p(int i) => Offset(v.positions[i].$1 * size, v.positions[i].$2 * size);
  final weighted = v.dist.isNotEmpty || v.edges.any((e) => e.$3 != 1);
  for (final (i, (a, b, w)) in v.edges.indexed) {
    final m = v.edgeMarks[i];
    final c = m == null ? const Color(0xFF9AA0A6) : markColor(m);
    final d = p(b) - p(a);
    final u = d / d.distance;
    final from = p(a) + u * 26, to = p(b) - u * 26;
    out.add(v.directed ? arrow(from, to, color: c, width: m == null ? 2 : 4) : line(from, to, color: c, width: m == null ? 2 : 4));
    if (weighted) {
      final mid = (p(a) + p(b)) / 2 + Offset(-u.dy, u.dx) * 14;
      out.add(text('$w', mid, color: c == const Color(0xFF9AA0A6) ? const Color(0xFF5F6368) : c, size: 18, bold: true, center: true));
    }
  }
  for (var i = 0; i < v.labels.length; i++) {
    final m = v.marks[i] ?? Mark.none;
    out
      ..add(circle(p(i), 24, fill: m == Mark.none ? const Color(0xFFFFFFFF) : markColor(m).withValues(alpha: 0.85), width: 2))
      ..add(text(v.labels[i], p(i), size: 20, bold: true, center: true));
    if (v.dist.isNotEmpty) {
      final c = p(i) - const Offset(size / 2, size / 2);
      final away = c.distance == 0 ? const Offset(0, -1) : c / c.distance;
      out.add(text(v.dist[i] == null ? '∞' : '${v.dist[i]}', p(i) + away * 44, color: markColor(Mark.pivot), size: 18, bold: true, center: true));
    }
  }
  var y = size + 40;
  if (v.frontier.isNotEmpty) {
    out.add(text('[ ${v.frontier.map((i) => v.labels[i]).join('  ')} ]', Offset(0, y), color: markColor(Mark.compare), size: 20, bold: true));
    y += 34;
  }
  if (v.output.isNotEmpty) out.add(text(v.output.map((i) => v.labels[i]).join(' → '), Offset(0, y), color: markColor(Mark.visited), size: 20, bold: true));
  return out;
}

List<BoardElement> _hash(HashView v) {
  const h = 44.0, w = 56.0;
  final out = <BoardElement>[];
  if (v.key != null) out.add(text('key = ${v.key}', const Offset(0, -46), color: markColor(Mark.active), size: 22, bold: true));
  for (var i = 0; i < v.buckets.length; i++) {
    final y = i * (h + 6);
    final m = v.marks[i];
    out
      ..add(box(Rect.fromLTWH(0, y, 44, h), fill: m == null ? const Color(0x22000000) : markColor(m).withValues(alpha: 0.8), width: 2))
      ..add(text('$i', Offset(22, y + h / 2), size: 18, bold: true, center: true));
    for (var k = 0; k < v.buckets[i].length; k++) {
      final r = Rect.fromLTWH(70 + k * (w + 30), y, w, h);
      out
        ..add(arrow(Offset(r.left - 26, y + h / 2), Offset(r.left - 2, y + h / 2), width: 2))
        ..add(box(r, fill: const Color(0x33188038), width: 2))
        ..add(text('${v.buckets[i][k]}', r.center, size: 20, bold: true, center: true));
    }
  }
  return out;
}

// --- Gantt charts ------------------------------------------------------------------------------

const _ganttColors = [Color(0xFF1A73E8), Color(0xFFF2A900), Color(0xFF188038), Color(0xFFD93025), Color(0xFF8E24AA), Color(0xFF00897B), Color(0xFFE8710A), Color(0xFF5F6368)];

/// Slices (id or null for idle, start, end) as a Gantt chart with times below.
List<BoardElement> ganttElements(List<(String?, int, int)> slices, {required List<String> ids, String idle = 'idle'}) {
  final out = <BoardElement>[];
  if (slices.isEmpty) return out;
  final total = slices.last.$3;
  final unit = math.max(18.0, math.min(60.0, 900.0 / math.max(1, total)));
  for (final (id, s, e) in slices) {
    final r = Rect.fromLTWH(s * unit, 0, (e - s) * unit, 56);
    final c = id == null ? const Color(0xFFDADCE0) : _ganttColors[ids.indexOf(id) % _ganttColors.length];
    out
      ..add(box(r, fill: c.withValues(alpha: id == null ? 0.6 : 0.75), width: 2))
      ..add(text(id ?? idle, r.center, size: id == null ? 15 : 20, bold: id != null, center: true))
      ..add(text('$s', Offset(r.left, 74), size: 16, center: true));
  }
  out.add(text('$total', Offset(total * unit, 74), size: 16, center: true));
  return out;
}
