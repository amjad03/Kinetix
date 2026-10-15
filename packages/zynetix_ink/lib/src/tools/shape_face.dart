import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../ink_models.dart';
import '../whiteboard_controller.dart';
import 'tool_strings.dart';

// Colouring one side or the face of a drawn shape on its own: the shape is kept as a
// polygon whose sides can each have a colour (PolygonElement.sideColors), and whose fill is
// the face. The picker shows the shape big so a finger can hit one side on a phone.

/// [e] as a polygon whose sides can be coloured: a polygon itself, or a drawn straight-sided
/// shape (not a line, a circle or a rounded rectangle). Null for anything else.
PolygonElement? sidePaintable(BoardElement e) {
  if (e is PolygonElement) return e.closed && e.points.length >= 3 ? e : null;
  if (e is Stroke && e.shape != null && !e.shape!.isRound && e.corner == 0) {
    final v = e.vertices;
    if (v.length < 3) return null;
    return PolygonElement(id: e.id, points: v, color: e.style.color, width: e.style.width, fill: e.fill, measure: e.measure);
  }
  return null;
}

/// The side of [p] nearest board point [at] if within [tolerance] of it.
int? polygonSideAt(PolygonElement p, Offset at, double tolerance) {
  int? best;
  var bestD = tolerance;
  final n = p.points.length;
  for (var i = 0; i < n; i++) {
    final a = p.points[i], b = p.points[(i + 1) % n];
    final ab = b - a;
    final len2 = ab.distanceSquared;
    final t = len2 == 0 ? 0.0 : (((at - a).dx * ab.dx + (at - a).dy * ab.dy) / len2).clamp(0.0, 1.0);
    final d = (at - (a + ab * t)).distance;
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/// Whether [at] is inside [p] (the face).
bool polygonFaceAt(PolygonElement p, Offset at) {
  var inside = false;
  final pts = p.points;
  for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    if ((pts[i].dy > at.dy) != (pts[j].dy > at.dy) && at.dx < (pts[j].dx - pts[i].dx) * (at.dy - pts[i].dy) / (pts[j].dy - pts[i].dy) + pts[i].dx) {
      inside = !inside;
    }
  }
  return inside;
}

/// [p] with side [side] coloured [c] (or back to the outline colour when [c] is null).
PolygonElement withSideColor(PolygonElement p, int side, Color? c) {
  final m = Map<int, Color>.of(p.sideColors);
  if (c == null) {
    m.remove(side);
  } else {
    m[side] = c;
  }
  return p.copyWith(sideColors: m);
}

/// [p] with its face filled [c] (no fill when null).
PolygonElement withFaceColor(PolygonElement p, Color? c) => c == null ? p.copyWith(clearFill: true) : p.copyWith(fill: c);

/// Applies a tap at board point [at] with colour [c] to [p]: a side near it takes the colour,
/// otherwise the face does. [tolerance] is how near a side a finger counts as on it.
PolygonElement paintAt(PolygonElement p, Offset at, Color c, double tolerance) {
  final s = polygonSideAt(p, at, tolerance);
  if (s != null) return withSideColor(p, s, c);
  if (polygonFaceAt(p, at)) return withFaceColor(p, c.withValues(alpha: 0.45));
  return p;
}

/// Whether the selected element can have sides coloured.
bool canColourSides(WhiteboardController wb) {
  final els = wb.selectedElements;
  return els.length == 1 && sidePaintable(els.first) != null;
}

const _palette = [Color(0xFFE53935), Color(0xFFFB8C00), Color(0xFFFDD835), Color(0xFF43A047), Color(0xFF1E88E5), Color(0xFF8E24AA), Color(0xFF000000)];

/// Opens the side and face colour picker for the selected shape.
Future<void> showShapeFaceDialog(BuildContext context, WhiteboardController wb) async {
  final sel = wb.selectedElements;
  if (sel.length != 1 || sidePaintable(sel.first) == null) return;
  final id = sel.first.id;
  await showDialog<void>(context: context, builder: (_) => _ShapeFaceDialog(wb: wb, id: id));
}

class _ShapeFaceDialog extends StatefulWidget {
  const _ShapeFaceDialog({required this.wb, required this.id});

  final WhiteboardController wb;
  final String id;

  @override
  State<_ShapeFaceDialog> createState() => _ShapeFaceDialogState();
}

class _ShapeFaceDialogState extends State<_ShapeFaceDialog> {
  Color _colour = _palette.first;
  static const _box = Size(300, 260);

  PolygonElement? get _poly {
    for (final e in widget.wb.page.elements) {
      if (e.id == widget.id) return sidePaintable(e);
    }
    return null;
  }

  /// The shape fitted to the preview box: board point = (preview point - offset) / scale.
  (double, Offset) _fit(PolygonElement p) {
    var r = Rect.fromPoints(p.points.first, p.points.first);
    for (final q in p.points) {
      r = r.expandToInclude(Rect.fromPoints(q, q));
    }
    final sc = math.min((_box.width - 40) / math.max(1, r.width), (_box.height - 40) / math.max(1, r.height));
    return (sc, Offset(_box.width / 2, _box.height / 2) - r.center * sc);
  }

  void _set(PolygonElement np) {
    final wb = widget.wb;
    wb.setElements([for (final e in wb.page.elements) e.id == widget.id ? np : e]);
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final s = ToolStrings.of(context);
    final p = _poly;
    if (p == null) return const SizedBox.shrink();
    final (sc, off) = _fit(p);
    return AlertDialog(
      title: Text(s.t('sideColour')),
      content: SizedBox(
        width: _box.width,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(s.t('sideColourHint')),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final (i, c) in _palette.indexed)
                  InkResponse(
                    key: Key('side-colour-$i'),
                    onTap: () => setState(() => _colour = c),
                    child: Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(color: c, shape: BoxShape.circle, border: Border.all(width: _colour == c ? 4 : 1, color: Colors.grey)),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            GestureDetector(
              key: const Key('side-preview'),
              onTapUp: (d) => _set(paintAt(p, (d.localPosition - off) / sc, _colour, 24 / sc)),
              child: CustomPaint(size: _box, painter: _PreviewPainter(p, sc, off)),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(key: const Key('side-clear'), onPressed: () => _set(p.copyWith(sideColors: const {}, clearFill: true)), child: Text(s.t('clearColours'))),
        FilledButton(key: const Key('side-done'), onPressed: () => Navigator.pop(context), child: Text(s.t('done'))),
      ],
    );
  }
}

class _PreviewPainter extends CustomPainter {
  _PreviewPainter(this.p, this.scale, this.offset);

  final PolygonElement p;
  final double scale;
  final Offset offset;

  @override
  void paint(Canvas canvas, Size size) {
    canvas
      ..save()
      ..translate(offset.dx, offset.dy)
      ..scale(scale);
    final path = Path()..addPolygon(p.points, true);
    if (p.fill != null) canvas.drawPath(path, Paint()..color = p.fill!);
    final w = math.max(3.0, 6 / scale);
    canvas.drawPath(
      path,
      Paint()
        ..color = p.color
        ..style = PaintingStyle.stroke
        ..strokeWidth = w
        ..strokeJoin = StrokeJoin.round,
    );
    for (final en in p.sideColors.entries) {
      if (en.key >= p.points.length) continue;
      canvas.drawLine(
        p.points[en.key],
        p.points[(en.key + 1) % p.points.length],
        Paint()
          ..color = en.value
          ..strokeWidth = w * 1.4
          ..strokeCap = StrokeCap.round,
      );
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_PreviewPainter old) => old.p != p || old.scale != scale || old.offset != offset;
}
