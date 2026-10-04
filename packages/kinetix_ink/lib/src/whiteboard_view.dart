import 'package:flutter/material.dart';

import 'board_background.dart';
import 'ink_canvas.dart';
import 'ink_models.dart';
import 'serialization.dart';

/// Shows one page of a saved board, scaled to fit, read-only. Used by the Parent and Student
/// apps and by the ERP's Flutter Web viewer.
class WhiteboardView extends StatelessWidget {
  const WhiteboardView({super.key, required this.board, this.page = 0});

  final SavedBoard board;
  final int page;

  @override
  Widget build(BuildContext context) {
    final strokes = page < board.pages.length ? board.pages[page] : const <Stroke>[];
    return FittedBox(
      fit: BoxFit.contain,
      child: SizedBox.fromSize(
        size: board.canvas,
        child: ClipRect(
          child: CustomPaint(painter: _SavedPagePainter(strokes, board.background), size: board.canvas),
        ),
      ),
    );
  }
}

class _SavedPagePainter extends CustomPainter {
  _SavedPagePainter(this.strokes, this.background);

  final List<Stroke> strokes;
  final BoardBackground background;

  @override
  void paint(Canvas canvas, Size size) {
    BackgroundPainter(background).paint(canvas, size);
    for (final s in strokes) {
      paintStroke(canvas, s, background);
    }
  }

  @override
  bool shouldRepaint(_SavedPagePainter old) => old.strokes != strokes || old.background != background;
}
