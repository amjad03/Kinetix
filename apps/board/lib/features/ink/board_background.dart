import 'package:flutter/material.dart';

enum BoardBackground { plain, ruled, grid, chalkboard }

extension BoardBackgroundColors on BoardBackground {
  bool get isDark => this == BoardBackground.chalkboard;
  Color get paper => isDark ? const Color(0xFF1F2A24) : const Color(0xFFFDFDFB);
  Color get lines => isDark ? const Color(0x33FFFFFF) : const Color(0x22000000);

  String get label => switch (this) {
        BoardBackground.plain => 'Plain',
        BoardBackground.ruled => 'Ruled',
        BoardBackground.grid => 'Grid',
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
        for (var y = 48.0; y < size.height; y += 40) {
          canvas.drawLine(Offset(0, y), Offset(size.width, y), line);
        }
      case BoardBackground.grid:
        for (var x = 0.0; x < size.width; x += 32) {
          canvas.drawLine(Offset(x, 0), Offset(x, size.height), line);
        }
        for (var y = 0.0; y < size.height; y += 32) {
          canvas.drawLine(Offset(0, y), Offset(size.width, y), line);
        }
      case BoardBackground.plain:
      case BoardBackground.chalkboard:
        break;
    }
  }

  @override
  bool shouldRepaint(BackgroundPainter old) => old.background != background;
}
