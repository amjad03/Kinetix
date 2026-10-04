import 'dart:ui';

import 'board_background.dart';
import 'ink_models.dart';

/// A saved board as stored by KINETIX Cloud (`WhiteboardContent` in services/api).
class SavedBoard {
  const SavedBoard({required this.background, required this.canvas, required this.pages});

  final BoardBackground background;

  /// The canvas size the strokes were drawn on, in logical pixels. Viewers scale from this.
  final Size canvas;
  final List<List<Stroke>> pages;

  int get pageCount => pages.length;

  /// The JSON body for `PUT /v1/whiteboards/:id` (title and share are added by the caller).
  Map<String, dynamic> toJson() => {
        'background': background.name,
        'canvas': {'w': canvas.width.round(), 'h': canvas.height.round()},
        'pages': [
          for (final page in pages) {'strokes': [for (final s in page) encodeStroke(s)]},
        ],
      };

  /// Reads `content` from `GET /v1/whiteboards/:id`. Unknown tools or shapes are skipped,
  /// so an older app can still open a board saved by a newer one.
  factory SavedBoard.fromJson(Map<String, dynamic> j) {
    final canvas = j['canvas'] as Map<String, dynamic>?;
    var n = 0;
    return SavedBoard(
      background: BoardBackground.values.asNameMap()[j['background']] ?? BoardBackground.plain,
      canvas: Size(((canvas?['w'] as num?) ?? 1920).toDouble(), ((canvas?['h'] as num?) ?? 1080).toDouble()),
      pages: [
        for (final page in (j['pages'] as List<dynamic>? ?? const []))
          [
            for (final raw in ((page as Map<String, dynamic>)['strokes'] as List<dynamic>? ?? const []))
              ?decodeStroke(raw as Map<String, dynamic>, 'saved${n++}'),
          ],
      ],
    );
  }
}

double _round1(double v) => (v * 10).roundToDouble() / 10;

Map<String, dynamic> encodeStroke(Stroke s) => {
      't': switch (s.style.tool) {
        InkTool.highlighter => 'highlighter',
        InkTool.shape => 'shape',
        _ => 'pen',
      },
      'c': s.style.color.toARGB32(),
      'w': s.style.width,
      if (s.shape != null) 's': s.shape!.name,
      // Flat [x0, y0, x1, y1, …] to 0.1 px: plenty for ink, a third of the size of objects.
      'p': [for (final p in s.points) ...[_round1(p.x), _round1(p.y)]],
    };

Stroke? decodeStroke(Map<String, dynamic> j, String id) {
  final tool = switch (j['t']) {
    'pen' => InkTool.pen,
    'highlighter' => InkTool.highlighter,
    'shape' => InkTool.shape,
    _ => null,
  };
  final flat = (j['p'] as List<dynamic>?)?.cast<num>();
  if (tool == null || flat == null || flat.length < 2) return null;
  final shape = j['s'] == null ? null : ShapeKind.values.asNameMap()[j['s']];
  if (tool == InkTool.shape && shape == null) return null;
  return Stroke(
    id: id,
    shape: shape,
    style: InkStyle(tool: tool, color: Color((j['c'] as num).toInt()), width: (j['w'] as num).toDouble(), shape: shape ?? ShapeKind.rectangle),
    points: [for (var i = 0; i + 1 < flat.length; i += 2) InkPoint(flat[i].toDouble(), flat[i + 1].toDouble())],
  );
}
