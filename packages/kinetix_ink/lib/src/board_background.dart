import 'package:flutter/material.dart';

import 'ink_models.dart';

/// The board's paper. Saved by name; readers fall back to plain for a name they do not know,
/// so a new paper never breaks an older viewer.
enum BoardBackground {
  plain,
  ruled,
  grid,
  dots,
  chalkboard,

  /// Four-line handwriting paper: a red top line, two blue lines and a dashed middle, as
  /// children practise letters on.
  fourLine,
}

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
    BoardBackground.fourLine => 'Four-line',
  };
}

/// Ruled lines: the first at 72, then every 44 board units.
const double ruledTop = 72, ruledGap = 44;

/// One band of four-line paper, in board units.
const double fourLineBand = 120;

/// Paints [background] over [area] of the board (in board units; the canvas is already in
/// board units). [scale] is screen pixels per board unit: lines too close together on screen
/// are thinned out so a zoomed-out board stays calm.
void paintBoardBackground(Canvas canvas, Rect area, BoardBackground background, {double scale = 1}) {
  canvas.drawRect(area, Paint()..color = background.paper);
  final line = Paint()
    ..color = background.lines
    ..strokeWidth = 1 / scale;
  double step(double base) {
    var s = base;
    while (s * scale < 8) {
      s *= 2;
    }
    return s;
  }

  double first(double from, double origin, double s) => origin + ((from - origin) / s).floorToDouble() * s;
  switch (background) {
    case BoardBackground.ruled:
      final s = step(ruledGap);
      for (var y = first(area.top, ruledTop, s); y < area.bottom; y += s) {
        if (y >= area.top) canvas.drawLine(Offset(area.left, y), Offset(area.right, y), line);
      }
    case BoardBackground.grid:
      final s = step(pxPerCm);
      for (var x = first(area.left, 0, s); x < area.right; x += s) {
        if (x >= area.left) canvas.drawLine(Offset(x, area.top), Offset(x, area.bottom), line);
      }
      for (var y = first(area.top, 0, s); y < area.bottom; y += s) {
        if (y >= area.top) canvas.drawLine(Offset(area.left, y), Offset(area.right, y), line);
      }
    case BoardBackground.dots:
      final s = step(pxPerCm);
      final dot = Paint()..color = background.lines.withValues(alpha: 0.35);
      for (var x = first(area.left, 0, s); x < area.right; x += s) {
        for (var y = first(area.top, 0, s); y < area.bottom; y += s) {
          if (x > area.left && y > area.top) canvas.drawCircle(Offset(x, y), 1.6 / scale.clamp(0.5, 1.0), dot);
        }
      }
    case BoardBackground.fourLine:
      if (fourLineBand * scale < 18) return;
      const gap = fourLineBand / 4;
      final blue = Paint()
        ..color = const Color(0x552F6FB5)
        ..strokeWidth = 1 / scale;
      final red = Paint()
        ..color = const Color(0x55D7263D)
        ..strokeWidth = 1 / scale;
      for (var y = first(area.top, 0, fourLineBand); y < area.bottom; y += fourLineBand) {
        canvas.drawLine(Offset(area.left, y + gap * 0.5), Offset(area.right, y + gap * 0.5), red);
        canvas.drawLine(Offset(area.left, y + gap * 1.5), Offset(area.right, y + gap * 1.5), blue);
        final dash = 12 / scale;
        for (var x = first(area.left, 0, dash); x < area.right; x += dash) {
          canvas.drawLine(Offset(x, y + gap * 2.5), Offset(x + dash / 2, y + gap * 2.5), blue);
        }
        canvas.drawLine(Offset(area.left, y + gap * 3.5), Offset(area.right, y + gap * 3.5), blue);
      }
    case BoardBackground.plain:
    case BoardBackground.chalkboard:
      break;
  }
}

/// Paints a fixed-size page of paper from (0, 0), for viewers and page pictures.
class BackgroundPainter extends CustomPainter {
  BackgroundPainter(this.background);

  final BoardBackground background;

  @override
  void paint(Canvas canvas, Size size) => paintBoardBackground(canvas, Offset.zero & size, background);

  @override
  bool shouldRepaint(BackgroundPainter old) => old.background != background;
}
