import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'mind_map.dart';

/// Draws the whole map in map coordinates: curved branches first (so they run behind), then the
/// ideas on top. Used by the editor and, with the same code, to make the picture for the board.
void paintMindMap(Canvas canvas, MindMap map, Map<String, Offset> at, {String? selected, String? dropOn, String? dragging, Map<String, ui.Image> images = const {}}) {
  for (final c in map.connectors(at)) {
    final depth = map.depthOf(c.child);
    canvas.drawPath(
      c.path,
      Paint()
        ..color = c.color
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeWidth = (7 - depth * 1.5).clamp(2.5, 7).toDouble(),
    );
  }
  for (final n in map.visible) {
    final r = map.rectOf(n, at[n.id]!);
    final isRoot = n == map.root;
    final color = map.colorOf(n.id);
    final path = MindMap.shapePath(r, n.shape);
    final fill = isRoot ? color : Color.alphaBlend(color.withValues(alpha: 0.14), Colors.white);
    final ghost = n.id == dragging;
    canvas.drawPath(path, Paint()..color = ghost ? fill.withValues(alpha: 0.6) : fill);
    canvas.drawPath(
      path,
      Paint()
        ..color = n.id == dropOn ? Colors.amber.shade700 : color
        ..style = PaintingStyle.stroke
        ..strokeWidth = n.id == selected || n.id == dropOn ? 5 : 2.5,
    );
    if (n.id == selected) {
      canvas.drawPath(MindMap.shapePath(r.inflate(5), n.shape), Paint()..color = color.withValues(alpha: 0.35)..style = PaintingStyle.stroke..strokeWidth = 3);
    }
    final tp = map.textOf(n);
    final ink = isRoot ? Colors.white : const Color(0xFF1F2933);
    tp.text = TextSpan(text: n.text, style: tp.text!.style!.copyWith(color: ink));
    final iconW = n.icon != null ? 30.0 : 0.0;
    final imageH = n.image != null ? MindMap.imageSide + 8 : 0.0;
    tp.layout(maxWidth: (isRoot ? MindMap.rootTextMax : MindMap.textMax) - iconW);
    final contentW = tp.width + iconW;
    final contentH = tp.height + imageH;
    final left = r.center.dx - contentW / 2, top = r.center.dy - contentH / 2;
    if (n.image != null) {
      final box = Rect.fromLTWH(r.center.dx - MindMap.imageSide / 2, top, MindMap.imageSide, MindMap.imageSide);
      final img = images[n.id];
      if (img != null) {
        paintImage(canvas: canvas, rect: box, image: img, fit: BoxFit.cover);
      } else {
        canvas.drawRect(box, Paint()..color = color.withValues(alpha: 0.2));
      }
    }
    if (n.icon != null) {
      final ic = mindIcons[n.icon!];
      final ip = TextPainter(
        text: TextSpan(text: String.fromCharCode(ic.codePoint), style: TextStyle(fontSize: 22, fontFamily: ic.fontFamily, package: ic.fontPackage, color: isRoot ? Colors.white : color)),
        textDirection: TextDirection.ltr,
      )..layout();
      ip.paint(canvas, Offset(left, top + imageH + (tp.height - ip.height) / 2));
    }
    tp.paint(canvas, Offset(left + iconW, top + imageH));
    if (n.children.isNotEmpty) {
      final c = foldBadgeCentre(r);
      canvas.drawCircle(c, 11, Paint()..color = color);
      final bp = TextPainter(
        text: TextSpan(text: n.collapsed ? '+${n.children.length}' : '−', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white)),
        textDirection: TextDirection.ltr,
      )..layout();
      bp.paint(canvas, c - Offset(bp.width / 2, bp.height / 2));
    }
  }
}

/// The centre of the fold button on an idea's box.
Offset foldBadgeCentre(Rect r) => Offset(r.right - 4, r.top + 4);

/// The map as a PNG picture, [scale] times its size, with a margin round it.
Future<Uint8List> mindMapPng(MindMap map, {double scale = 2, Map<String, ui.Image> images = const {}, Color paper = Colors.white}) async {
  final at = map.layout();
  final b = map.boundsOf(at).inflate(40);
  final rec = ui.PictureRecorder();
  final canvas = Canvas(rec);
  canvas.drawRect(Offset.zero & (b.size * scale), Paint()..color = paper);
  canvas.scale(scale);
  canvas.translate(-b.left, -b.top);
  paintMindMap(canvas, map, at, images: images);
  final img = await rec.endRecording().toImage((b.width * scale).ceil(), (b.height * scale).ceil());
  final data = await img.toByteData(format: ui.ImageByteFormat.png);
  return data!.buffer.asUint8List();
}

/// Paints [map] on the editor's canvas: moved to [origin] and zoomed.
class MindMapPainter extends CustomPainter {
  MindMapPainter(this.map, this.at, this.origin, this.zoom, {this.selected, this.dropOn, this.dragging, this.images = const {}, required this.revision});

  final MindMap map;
  final Map<String, Offset> at;
  final Offset origin;
  final double zoom;
  final String? selected, dropOn, dragging;
  final Map<String, ui.Image> images;
  final int revision;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.translate(origin.dx, origin.dy);
    canvas.scale(zoom);
    paintMindMap(canvas, map, at, selected: selected, dropOn: dropOn, dragging: dragging, images: images);
  }

  @override
  bool shouldRepaint(MindMapPainter old) => true;
}
