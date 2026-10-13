import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'cs_diagram_models.dart';

// Drawing the computer science diagram panels: UML (class, use-case, sequence, activity, state),
// ER diagrams in Chen notation, relational schemas with keys, and automata with the states a
// string has reached lit up. Words are as the teacher typed them.

const _ink = Color(0xFF1B1F24);
const _muted = Color(0xFF5F6368);
const _paper = Color(0xFFFFFFFF);

TextPainter _tp(String t, double size, {bool bold = false, bool italic = false, Color color = _ink, bool underline = false, double maxWidth = 900}) => TextPainter(
  text: TextSpan(
    text: t,
    style: TextStyle(
      fontSize: size,
      color: color,
      fontWeight: bold ? FontWeight.w700 : FontWeight.w400,
      fontStyle: italic ? FontStyle.italic : FontStyle.normal,
      decoration: underline ? TextDecoration.underline : null,
      fontFamily: KxFonts.board,
      fontFamilyFallback: KxFonts.fallback,
    ),
  ),
  textDirection: TextDirection.ltr,
  maxLines: 1,
  ellipsis: '…',
)..layout(maxWidth: maxWidth);

void _text(Canvas c, String t, Offset at, {double size = 17, bool bold = false, bool italic = false, Color color = _ink, bool underline = false, bool center = true, double maxWidth = 900}) {
  if (t.isEmpty) return;
  final tp = _tp(t, size, bold: bold, italic: italic, color: color, underline: underline, maxWidth: maxWidth);
  tp.paint(c, center ? at - Offset(tp.width / 2, tp.height / 2) : Offset(at.dx, at.dy - tp.height / 2));
  tp.dispose();
}

Paint _pen(Color c, [double w = 2]) => Paint()
  ..color = c
  ..style = PaintingStyle.stroke
  ..strokeWidth = w
  ..strokeJoin = StrokeJoin.round
  ..strokeCap = StrokeCap.round;

Paint _fill(Color c) => Paint()..color = c;

void _dash(Canvas c, Offset a, Offset b, Paint p, {double on = 8, double off = 6}) {
  final len = (b - a).distance;
  if (len == 0) return;
  final u = (b - a) / len;
  for (var t = 0.0; t < len; t += on + off) {
    c.drawLine(a + u * t, a + u * math.min(len, t + on), p);
  }
}

void _dashedOval(Canvas c, Rect r, Paint p) {
  const n = 28;
  for (var i = 0; i < n; i += 2) {
    final a = 2 * math.pi * i / n, b = 2 * math.pi * (i + 1) / n;
    c.drawArc(r, a, b - a, false, p);
  }
}

Path _diamond(Rect r) => Path()
  ..moveTo(r.center.dx, r.top)
  ..lineTo(r.right, r.center.dy)
  ..lineTo(r.center.dx, r.bottom)
  ..lineTo(r.left, r.center.dy)
  ..close();

/// Where the line from [c] towards [to] leaves a node of [size] and [kind].
Offset _rim(DiagramNode n, Offset c, Offset to) {
  final s = diagramNodeSize(n);
  final d = to - c;
  if (d.distance < 1) return c;
  final round = const {'usecase', 'attribute', 'key', 'partial', 'multi', 'derived', 'initial', 'final', 'astate'}.contains(n.kind);
  if (round) {
    final a = s.width / 2, b = s.height / 2;
    final t = 1 / math.sqrt((d.dx * d.dx) / (a * a) + (d.dy * d.dy) / (b * b));
    return c + d * t;
  }
  if (n.kind == 'decision' || n.kind == 'relationship' || n.kind == 'idrel') {
    final t = 1 / (d.dx.abs() / (s.width / 2) + d.dy.abs() / (s.height / 2));
    return c + d * t;
  }
  if (n.kind == 'actor') {
    final t = math.min((s.width / 2 + 4) / math.max(d.dx.abs(), 1e-6), (s.height / 2) / math.max(d.dy.abs(), 1e-6));
    return c + d * math.min(1, t);
  }
  final t = math.min((s.width / 2) / math.max(d.dx.abs(), 1e-6), (s.height / 2) / math.max(d.dy.abs(), 1e-6));
  return c + d * math.min(1, t);
}

void _head(Canvas c, Offset tip, Offset u, String kind, Color ink) {
  final n = Offset(-u.dy, u.dx);
  switch (kind) {
    case 'arrow':
      c.drawPath(Path()..addPolygon([tip, tip - u * 14 + n * 7, tip - u * 14 - n * 7], true), _fill(ink));
    case 'dashed' || 'open':
      c
        ..drawLine(tip, tip - u * 14 + n * 7, _pen(ink))
        ..drawLine(tip, tip - u * 14 - n * 7, _pen(ink));
    case 'inherit' || 'realize':
      final p = Path()..addPolygon([tip, tip - u * 18 + n * 10, tip - u * 18 - n * 10], true);
      c
        ..drawPath(p, _fill(_paper))
        ..drawPath(p, _pen(ink));
    case 'compose' || 'aggregate':
      final p = Path()..addPolygon([tip, tip - u * 13 + n * 8, tip - u * 26, tip - u * 13 - n * 8], true);
      c
        ..drawPath(p, _fill(kind == 'compose' ? ink : _paper))
        ..drawPath(p, _pen(ink));
  }
}

/// Paints [d] on a panel of [size] in the accent [color]; the automaton's [current] states lit.
void paintCsDiagram(Canvas canvas, CsDiagram d, Size size, Color color) {
  final p = d.parsed;
  final layout = layoutDiagram(p, d.pos, size);
  final tint = color.withValues(alpha: 0.10);
  _text(canvas, d.title, const Offset(28, 40), size: 26, bold: true, center: false, maxWidth: size.width - 56);
  if (p.nodes.isEmpty) {
    _text(canvas, '—', size.center(Offset.zero), color: _muted);
    return;
  }
  if (p.type == CsDiagramType.sequence) {
    _sequence(canvas, p, layout, size, color, tint);
    return;
  }
  // The system boundary around the use cases.
  if (p.type == CsDiagramType.useCase) {
    final cases = [for (final n in p.nodes.values) if (n.kind == 'usecase' && layout[n.id] != null) Rect.fromCenter(center: layout[n.id]!, width: diagramNodeSize(n).width, height: diagramNodeSize(n).height)];
    if (cases.isNotEmpty) {
      final r = cases.reduce((a, b) => a.expandToInclude(b)).inflate(30).translate(0, -10);
      final box = Rect.fromLTRB(r.left, r.top - 22, r.right, r.bottom + 10);
      canvas.drawRect(box, _pen(_ink));
      _text(canvas, p.system.isEmpty ? 'System' : p.system, Offset(box.center.dx, box.top + 18), bold: true);
    }
  }
  final current = d.current;
  // Edges under the nodes; automaton edges between the same two states share one label.
  final seen = <String, int>{};
  final merged = <(String, String), List<String>>{};
  if (p.type == CsDiagramType.automaton) {
    for (final e in p.edges) {
      (merged[(e.from, e.to)] ??= []).add(e.label);
    }
  }
  for (final e in p.edges) {
    final a = p.nodes[e.from], b = p.nodes[e.to];
    final ca = layout[e.from], cb = layout[e.to];
    if (a == null || b == null || ca == null || cb == null) continue;
    if (p.type == CsDiagramType.automaton) {
      final key = '${e.from}>${e.to}';
      if (seen.containsKey(key)) continue;
      seen[key] = 1;
      final label = merged[(e.from, e.to)]!.join(', ');
      _transition(canvas, p, a, b, ca, cb, label, color);
      continue;
    }
    if (e.from == e.to) {
      _selfLoop(canvas, a, ca, e.label, _ink);
      continue;
    }
    final from = _rim(a, ca, cb), to = _rim(b, cb, ca);
    final v = to - from;
    if (v.distance < 2) continue;
    final u = v / v.distance;
    final headLen = switch (e.kind) {
      'inherit' || 'realize' => 18.0,
      'compose' || 'aggregate' => 0.0,
      _ => 0.0,
    };
    final pen = _pen(_ink);
    // Composition and aggregation: the diamond sits at the whole (the "from" end).
    final start = e.kind == 'compose' || e.kind == 'aggregate' ? from + u * 26 : from;
    final end = to - u * headLen;
    if (e.kind == 'dashed' || e.kind == 'realize' || e.kind == 'dotted') {
      _dash(canvas, start, end, pen);
    } else if (e.kind == 'double') {
      final n = Offset(-u.dy, u.dx) * 3;
      canvas
        ..drawLine(start + n, end + n, pen)
        ..drawLine(start - n, end - n, pen);
    } else {
      canvas.drawLine(start, end, pen);
    }
    switch (e.kind) {
      case 'compose' || 'aggregate':
        _head(canvas, from, -u, e.kind, _ink);
      case 'arrow' || 'dashed' || 'inherit' || 'realize':
        _head(canvas, to, u, e.kind, _ink);
    }
    final n = Offset(-u.dy, u.dx);
    if (e.label.isNotEmpty) {
      final erCard = p.type == CsDiagramType.er;
      // ER cardinalities sit near the entity; other labels at the middle, in a white box.
      final at = erCard ? to - u * 22 + n * 14 : (from + to) / 2 + n * 14;
      final tp = _tp(e.label, 16, bold: erCard, italic: e.kind == 'dashed' && p.type == CsDiagramType.useCase);
      final box = Rect.fromCenter(center: at, width: tp.width + 8, height: tp.height + 2);
      canvas.drawRect(box, _fill(_paper.withValues(alpha: 0.85)));
      tp.paint(canvas, box.topLeft + const Offset(4, 1));
      tp.dispose();
    }
    if (e.fromMul.isNotEmpty) _text(canvas, e.fromMul, from + u * 22 + n * 14, size: 16, color: _muted, bold: true);
    if (e.toMul.isNotEmpty) _text(canvas, e.toMul, to - u * (22 + headLen) + n * 14, size: 16, color: _muted, bold: true);
  }
  for (final n in p.nodes.values) {
    final c = layout[n.id];
    if (c == null) continue;
    _node(canvas, n, c, color, tint, lit: current.contains(n.id), start: p.type == CsDiagramType.automaton && p.start == n.id, accept: p.accepts.contains(n.id));
  }
  if (p.type == CsDiagramType.automaton) _automatonFooter(canvas, d, p, size, color);
}

void _node(Canvas c, DiagramNode n, Offset at, Color color, Color tint, {bool lit = false, bool start = false, bool accept = false}) {
  final s = diagramNodeSize(n);
  final r = Rect.fromCenter(center: at, width: s.width, height: s.height);
  final pen = _pen(_ink);
  switch (n.kind) {
    case 'class' || 'abstract' || 'interface' || 'enum':
      final stereo = switch (n.kind) {
        'interface' => '«interface»',
        'enum' => '«enumeration»',
        'abstract' => '«abstract»',
        _ => '',
      };
      final headH = 38.0 + (stereo.isEmpty ? 0 : 20);
      final attrH = math.max(1, n.lines.length) * 24.0 + 10;
      c
        ..drawRect(r, _fill(_paper))
        ..drawRect(Rect.fromLTWH(r.left, r.top, r.width, headH), _fill(tint))
        ..drawRect(r, pen)
        ..drawLine(Offset(r.left, r.top + headH), Offset(r.right, r.top + headH), pen)
        ..drawLine(Offset(r.left, r.top + headH + attrH), Offset(r.right, r.top + headH + attrH), pen);
      if (stereo.isNotEmpty) _text(c, stereo, Offset(at.dx, r.top + 15), size: 14, color: _muted);
      _text(c, n.label, Offset(at.dx, r.top + headH - 19), size: 18, bold: true, italic: n.kind == 'abstract');
      for (final (i, l) in n.lines.indexed) {
        _text(c, l, Offset(r.left + 10, r.top + headH + 17 + i * 24), size: 16, center: false, underline: l.contains('{static}'));
      }
      for (final (i, l) in n.methods.indexed) {
        _text(c, l, Offset(r.left + 10, r.top + headH + attrH + 17 + i * 24), size: 16, center: false, italic: l.contains('{abstract}'));
      }
    case 'table':
      c
        ..drawRect(r, _fill(_paper))
        ..drawRect(Rect.fromLTWH(r.left, r.top, r.width, 40), _fill(tint))
        ..drawRect(r, pen)
        ..drawLine(Offset(r.left, r.top + 40), Offset(r.right, r.top + 40), pen);
      _text(c, n.label, Offset(at.dx, r.top + 20), size: 18, bold: true);
      for (final (i, l) in n.lines.indexed) {
        final col = schemaColumn(l);
        final y = r.top + 40 + 18 + i * 28;
        _text(c, col.name, Offset(r.left + 12, y), size: 16, center: false, bold: col.pk, underline: col.pk, italic: col.ref != null);
        _text(c, '${col.type}${col.ref != null ? '  →' : ''}', Offset(r.right - 12 - diagramTextWidth('${col.type}${col.ref != null ? '  →' : ''}', 15), y), size: 15, center: false, color: _muted);
      }
    case 'actor':
      final head = Offset(at.dx, r.top + 14);
      c
        ..drawCircle(head, 12, pen)
        ..drawLine(head + const Offset(0, 12), head + const Offset(0, 50), pen)
        ..drawLine(head + const Offset(-22, 26), head + const Offset(22, 26), pen)
        ..drawLine(head + const Offset(0, 50), head + const Offset(-16, 76), pen)
        ..drawLine(head + const Offset(0, 50), head + const Offset(16, 76), pen);
      _text(c, n.label, Offset(at.dx, r.bottom - 10), size: 16, bold: true);
    case 'usecase':
      c
        ..drawOval(r, _fill(tint))
        ..drawOval(r, pen);
      _text(c, n.label, at, size: 16, maxWidth: r.width - 16);
    case 'participant':
      c
        ..drawRect(r, _fill(tint))
        ..drawRect(r, pen);
      _text(c, n.label, at, size: 17, bold: true, underline: n.label.contains(':'));
    case 'initial':
      c.drawCircle(at, s.width / 2, _fill(_ink));
    case 'final':
      c
        ..drawCircle(at, s.width / 2, pen)
        ..drawCircle(at, s.width / 2 - 6, _fill(_ink));
    case 'decision':
      final path = _diamond(r);
      c
        ..drawPath(path, _fill(tint))
        ..drawPath(path, pen);
      _text(c, n.label, at, size: 15, maxWidth: r.width - 30);
    case 'fork':
      c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(3)), _fill(_ink));
    case 'entity' || 'weak':
      c
        ..drawRect(r, _fill(tint))
        ..drawRect(r, pen);
      if (n.kind == 'weak') c.drawRect(r.deflate(5), pen);
      _text(c, n.label, at, size: 17, bold: true);
    case 'relationship' || 'idrel':
      final path = _diamond(r);
      c
        ..drawPath(path, _fill(tint))
        ..drawPath(path, pen);
      if (n.kind == 'idrel') c.drawPath(_diamond(r.deflate(8)), pen);
      _text(c, n.label, at, size: 15, maxWidth: r.width - 40);
    case 'attribute' || 'key' || 'partial' || 'multi' || 'derived':
      c.drawOval(r, _fill(_paper));
      if (n.kind == 'derived') {
        _dashedOval(c, r, pen);
      } else {
        c.drawOval(r, pen);
      }
      if (n.kind == 'multi') c.drawOval(r.deflate(5), pen);
      _text(c, n.label, at, size: 15, underline: n.kind == 'key', maxWidth: r.width - 14);
      if (n.kind == 'partial') {
        final w = math.min(diagramTextWidth(n.label, 15), r.width - 14);
        _dash(c, Offset(at.dx - w / 2, at.dy + 11), Offset(at.dx + w / 2, at.dy + 11), _pen(_ink, 1.5), on: 5, off: 4);
      }
    case 'astate':
      final rad = s.width / 2;
      c
        ..drawCircle(at, rad, _fill(lit ? color.withValues(alpha: 0.35) : _paper))
        ..drawCircle(at, rad, _pen(lit ? color : _ink, lit ? 3.5 : 2));
      if (accept) c.drawCircle(at, rad - 6, _pen(lit ? color : _ink, 2));
      if (start) {
        final from = at - Offset(rad + 44, 0), to = at - Offset(rad + 2, 0);
        c.drawLine(from, to, pen);
        _head(c, to, const Offset(1, 0), 'arrow', _ink);
      }
      _text(c, n.label, at, size: 17, bold: true);
    default: // action, state
      final rr = RRect.fromRectAndRadius(r, Radius.circular(n.kind == 'state' ? 14 : 22));
      c
        ..drawRRect(rr, _fill(tint))
        ..drawRRect(rr, pen);
      _text(c, n.label, Offset(at.dx, n.lines.isEmpty ? at.dy : r.top + 18), size: 16, bold: n.kind == 'state', maxWidth: r.width - 12);
      for (final (i, l) in n.lines.indexed) {
        _text(c, l, Offset(r.left + 10, r.top + 42 + i * 20), size: 13, center: false, color: _muted);
      }
  }
}

void _selfLoop(Canvas c, DiagramNode n, Offset at, String label, Color ink) {
  final s = diagramNodeSize(n);
  final top = at - Offset(0, s.height / 2);
  final rect = Rect.fromCenter(center: top - const Offset(0, 18), width: 40, height: 40);
  c.drawArc(rect, math.pi * 0.85, math.pi * 1.3, false, _pen(ink));
  final tip = Offset(rect.center.dx + math.cos(math.pi * 2.15) * 20, rect.center.dy + math.sin(math.pi * 2.15) * 20);
  const end = math.pi * 2.15;
  _head(c, tip, Offset(-math.sin(end), math.cos(end)), 'arrow', ink);
  if (label.isNotEmpty) _text(c, label, top - const Offset(0, 50), size: 16, bold: true);
}

void _transition(Canvas c, ParsedDiagram p, DiagramNode a, DiagramNode b, Offset ca, Offset cb, String label, Color color) {
  if (a.id == b.id) {
    _selfLoop(c, a, ca, label, _ink);
    return;
  }
  // Bend when the other way exists too, so the two do not overlap.
  final twoWay = p.edges.any((e) => e.from == b.id && e.to == a.id);
  final d = cb - ca;
  final u = d / d.distance, n = Offset(-u.dy, u.dx);
  final bend = twoWay ? 34.0 : 0.0;
  final ctrl = (ca + cb) / 2 + n * bend * 2;
  final from = _rim(a, ca, ctrl), to = _rim(b, cb, ctrl);
  final path = Path()
    ..moveTo(from.dx, from.dy)
    ..quadraticBezierTo(ctrl.dx, ctrl.dy, to.dx, to.dy);
  c.drawPath(path, _pen(_ink));
  final end = to - ctrl;
  _head(c, to, end / end.distance, 'arrow', _ink);
  final tp = _tp(label, 17, bold: true, color: color.withValues(alpha: 1));
  final at = (ca + cb) / 2 + n * (bend + 14);
  final box = Rect.fromCenter(center: at, width: tp.width + 8, height: tp.height + 2);
  c.drawRect(box, _fill(_paper.withValues(alpha: 0.9)));
  tp.paint(c, box.topLeft + const Offset(4, 1));
  tp.dispose();
}

void _automatonFooter(Canvas c, CsDiagram d, ParsedDiagram p, Size size, Color color) {
  final kind = isDeterministic(p) ? 'DFA' : 'NFA';
  _text(c, kind, Offset(size.width - 40, 40), size: 20, bold: true, color: _muted);
  if (d.step < 0) return;
  final run = runAutomaton(p, d.input);
  final step = d.step.clamp(0, run.length - 1);
  final chars = d.input.runes.map(String.fromCharCode).toList();
  final base = Offset(40, size.height - 56);
  var x = base.dx;
  _text(c, 'Input:', Offset(x, base.dy), size: 18, bold: true, center: false);
  x += 70;
  for (final (i, ch) in chars.indexed) {
    final r = Rect.fromLTWH(x, base.dy - 18, 34, 36);
    c
      ..drawRect(r, _fill(i < step ? color.withValues(alpha: 0.18) : (i == step ? color.withValues(alpha: 0.45) : _paper)))
      ..drawRect(r, _pen(_ink, 1.5));
    _text(c, ch, r.center, size: 18, bold: true);
    x += 36;
  }
  final states = run[step];
  final done = step >= chars.length;
  final verdict = !done ? '{${states.join(', ')}}' : (states.any(p.accepts.contains) ? 'ACCEPTED  {${states.join(', ')}}' : 'REJECTED  {${states.join(', ')}}');
  _text(c, verdict, Offset(x + 24, base.dy), size: 18, bold: true, center: false, color: done ? (states.any(p.accepts.contains) ? const Color(0xFF0F8A5F) : const Color(0xFFC62828)) : color);
}

void _sequence(Canvas c, ParsedDiagram p, Map<String, Offset> layout, Size size, Color color, Color tint) {
  final bottom = size.height - 40;
  for (final n in p.nodes.values) {
    final at = layout[n.id]!;
    final s = diagramNodeSize(n);
    _dash(c, Offset(at.dx, at.dy + s.height / 2), Offset(at.dx, bottom), _pen(_muted, 1.6));
    _node(c, n, at, color, tint);
  }
  final top = 110 + 80.0;
  final rows = p.edges.length;
  final gap = rows == 0 ? 0.0 : math.min(64.0, (bottom - top - 20) / rows);
  for (final (i, e) in p.edges.indexed) {
    final a = layout[e.from], b = layout[e.to];
    if (a == null || b == null) continue;
    final y = top + 20 + i * gap;
    final pen = _pen(_ink);
    if (e.from == e.to) {
      final path = Path()
        ..moveTo(a.dx, y)
        ..lineTo(a.dx + 50, y)
        ..lineTo(a.dx + 50, y + gap * 0.5)
        ..lineTo(a.dx + 4, y + gap * 0.5);
      c.drawPath(path, pen);
      _head(c, Offset(a.dx + 4, y + gap * 0.5), const Offset(-1, 0), 'arrow', _ink);
      _text(c, '${i + 1}: ${e.label}', Offset(a.dx + 58, y + 2), size: 15, center: false);
      continue;
    }
    final dir = b.dx > a.dx ? 1.0 : -1.0;
    final from = Offset(a.dx, y), to = Offset(b.dx - dir * 2, y);
    final reply = e.kind == 'dashed' || e.kind == 'dotted';
    if (reply) {
      _dash(c, from, to, pen);
    } else {
      c.drawLine(from, to, pen);
    }
    _head(c, to, Offset(dir, 0), reply ? 'open' : 'arrow', _ink);
    _text(c, '${i + 1}: ${e.label}', Offset((a.dx + b.dx) / 2, y - 13), size: 15, italic: reply);
  }
}
