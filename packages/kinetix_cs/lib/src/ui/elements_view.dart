import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

/// Board elements drawn with the board's own painter, scaled to fit (never above [maxScale]).
class ElementsView extends StatelessWidget {
  const ElementsView(this.elements, {super.key, this.maxScale = 1.4, this.padding = 16});

  final List<BoardElement> elements;
  final double maxScale;
  final double padding;

  @override
  Widget build(BuildContext context) => CustomPaint(painter: _ElementsPainter(elements, maxScale, padding), child: const SizedBox.expand());
}

class _ElementsPainter extends CustomPainter {
  _ElementsPainter(this.elements, this.maxScale, this.padding);

  final List<BoardElement> elements;
  final double maxScale;
  final double padding;

  @override
  void paint(Canvas canvas, Size size) {
    if (elements.isEmpty) return;
    final b = contentBounds(elements).inflate(4);
    final room = Size(math.max(1, size.width - 2 * padding), math.max(1, size.height - 2 * padding));
    final s = math.min(maxScale, math.min(room.width / b.width, room.height / b.height));
    canvas
      ..save()
      ..translate((size.width - b.width * s) / 2, (size.height - b.height * s) / 2)
      ..scale(s)
      ..translate(-b.left, -b.top);
    for (final e in elements) {
      paintElement(canvas, e, BoardBackground.plain);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_ElementsPainter old) => old.elements != elements;
}
