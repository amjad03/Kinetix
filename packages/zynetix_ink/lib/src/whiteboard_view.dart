import 'package:flutter/material.dart';

import 'board_background.dart';
import 'element_painting.dart';
import 'ink_models.dart';
import 'math_layer.dart';
import 'serialization.dart';

/// Shows one page of a saved board, scaled to fit, read-only. Used by the Parent and Student
/// apps. The board is endless: the view shows the screen the board was drawn on, grown to
/// take in anything drawn beyond it.
class WhiteboardView extends StatefulWidget {
  const WhiteboardView({super.key, required this.board, this.page = 0});

  final SavedBoard board;
  final int page;

  /// The area to show for [elements] drawn on a [canvas]-sized screen.
  static Rect areaFor(List<BoardElement> elements, Size canvas) {
    final screen = Offset.zero & canvas;
    if (elements.isEmpty) return screen;
    final content = contentBounds(elements).inflate(24);
    return screen.contains(content.topLeft) && screen.contains(content.bottomRight) ? screen : screen.expandToInclude(content);
  }

  @override
  State<WhiteboardView> createState() => _WhiteboardViewState();
}

class _WhiteboardViewState extends State<WhiteboardView> {
  final _images = BoardImages();

  @override
  void dispose() {
    _images.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final b = widget.board;
    final elements = widget.page < b.pages.length ? b.pages[widget.page] : const <BoardElement>[];
    final area = WhiteboardView.areaFor(elements, b.canvas);
    return FittedBox(
      fit: BoxFit.contain,
      child: SizedBox.fromSize(
        size: area.size,
        child: ClipRect(
          child: Stack(
            children: [
              CustomPaint(painter: _SavedPagePainter(elements, b.background, area, _images), size: area.size),
              Positioned.fill(child: MathLayer(elements: elements, origin: area.topLeft, background: b.background)),
            ],
          ),
        ),
      ),
    );
  }
}

class _SavedPagePainter extends CustomPainter {
  _SavedPagePainter(this.elements, this.background, this.area, this.images) : super(repaint: images);

  final List<BoardElement> elements;
  final BoardBackground background;
  final Rect area;
  final BoardImages images;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.translate(-area.left, -area.top);
    paintBoardBackground(canvas, area, background);
    for (final e in elements) {
      paintElement(canvas, e, background, images: images);
    }
  }

  @override
  bool shouldRepaint(_SavedPagePainter old) => old.elements != elements || old.background != background || old.area != area;
}
