import 'package:flutter/material.dart';

import 'ink_models.dart';

enum BoardBackground { plain, ruled, grid, dots, chalkboard }

extension BoardBackgroundColors on BoardBackground {
  bool get isDark => this == BoardBackground.chalkboard;
  Color get paper => isDark ? const Color(0xFF1F2A24) : const Color(0xFFFCFCFA);
  Color get lines => isDark ? const Color(0x33FFFFFF) : const Color(0x1F1A3A6B);

  String get label => switch (this) {
    BoardBackground.plain => 'Plain',
    BoardBackground.ruled => 'Ruled',
    BoardBackground.grid => 'Grid (1 cm)',
    BoardBackground.dots => 'Dots',
    BoardBackground.chalkboard => 'Chalkboard',
  };
}

class BackgroundPainter extends CustomPainter {
  BackgroundPainter(this.background);

  final BoardBackground background;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = background.paper);
    final line = Paint()
      ..color = background.lines
      ..strokeWidth = 1;
    switch (background) {
      case BoardBackground.ruled:
        for (var y = 72.0; y < size.height; y += 44) {
          canvas.drawLine(Offset(0, y), Offset(size.width, y), line);
        }
      case BoardBackground.grid:
        for (var x = 0.0; x < size.width; x += pxPerCm) {
          canvas.drawLine(Offset(x, 0), Offset(x, size.height), line);
        }
        for (var y = 0.0; y < size.height; y += pxPerCm) {
          canvas.drawLine(Offset(0, y), Offset(size.width, y), line);
        }
      case BoardBackground.dots:
        final dot = Paint()..color = background.lines.withValues(alpha: 0.35);
        for (var x = pxPerCm; x < size.width; x += pxPerCm) {
          for (var y = pxPerCm; y < size.height; y += pxPerCm) {
            canvas.drawCircle(Offset(x, y), 1.6, dot);
          }
        }
      case BoardBackground.plain:
      case BoardBackground.chalkboard:
        break;
    }
  }

  @override
  bool shouldRepaint(BackgroundPainter old) => old.background != background;
}
