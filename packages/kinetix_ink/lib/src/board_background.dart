import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'ink_models.dart';

/// The board's paper. Saved by name; readers fall back to plain for a name they do not know,
/// so a new paper never breaks an older viewer. Each page has its own.
enum BoardBackground {
  plain,
  ruled,
  grid,
  dots,
  chalkboard,

  /// Four-line handwriting paper: a red top line, two blue lines and a dashed middle, as
  /// children practise letters on.
  fourLine,

  /// Graph paper: millimetre lines with every centimetre stronger.
  graph,

  /// Kannada writing lines: a band with room above for vowel signs and below for ottakshara.
  kannadaLines,
  musicStaff,
  isometric,

  /// Commerce: a ledger account (Dr | Cr) and a journal, ruled with their columns.
  ledger,
  journal,

  /// Map outlines. No public-domain outline is bundled yet: the page shows a framed area with
  /// a note (see docs/design/board-wireframes.html, screen 10).
  indiaMap,
  worldMap,
  twoColumns,
  threeColumns,
  cricketField,
  footballField,

  /// Plain coloured paper.
  paperCream,
  paperSky,
  paperMint,
  paperRose,
  paperSlate,
}

/// One "sheet" of the endless board, for papers drawn once (fields, maps) or by columns.
const Size boardSheet = Size(1920, 1080);

extension BoardBackgroundColors on BoardBackground {
  bool get isDark => this == BoardBackground.chalkboard || this == BoardBackground.paperSlate;
  Color get paper => switch (this) {
    BoardBackground.chalkboard => const Color(0xFF1F2A24),
    BoardBackground.paperSlate => const Color(0xFF263238),
    BoardBackground.paperCream => const Color(0xFFFFF6DC),
    BoardBackground.paperSky => const Color(0xFFE3F1FD),
    BoardBackground.paperMint => const Color(0xFFE2F5EA),
    BoardBackground.paperRose => const Color(0xFFFDE7EE),
    _ => const Color(0xFFFCFCFA),
  };
  Color get lines => isDark ? const Color(0x33FFFFFF) : const Color(0x1F1A3A6B);

  /// A plain colour, with no lines.
  bool get isColour => index >= BoardBackground.paperCream.index;

  String get label => switch (this) {
    BoardBackground.plain => 'Plain',
    BoardBackground.ruled => 'Ruled',
    BoardBackground.grid => 'Grid (1 cm)',
    BoardBackground.dots => 'Dots',
    BoardBackground.chalkboard => 'Chalkboard',
    BoardBackground.fourLine => 'Four-line',
    BoardBackground.graph => 'Graph paper',
    BoardBackground.kannadaLines => 'Kannada lines',
    BoardBackground.musicStaff => 'Music staff',
    BoardBackground.isometric => 'Isometric',
    BoardBackground.ledger => 'Ledger',
    BoardBackground.journal => 'Journal',
    BoardBackground.indiaMap => 'India map',
    BoardBackground.worldMap => 'World map',
    BoardBackground.twoColumns => 'Two columns',
    BoardBackground.threeColumns => 'Three columns',
    BoardBackground.cricketField => 'Cricket field',
    BoardBackground.footballField => 'Football field',
    BoardBackground.paperCream => 'Cream',
    BoardBackground.paperSky => 'Sky',
    BoardBackground.paperMint => 'Mint',
    BoardBackground.paperRose => 'Rose',
    BoardBackground.paperSlate => 'Slate',
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
  void hLines(double origin, double s, Paint p) {
    for (var y = first(area.top, origin, s); y < area.bottom; y += s) {
      if (y >= area.top) canvas.drawLine(Offset(area.left, y), Offset(area.right, y), p);
    }
  }

  void vLines(double origin, double s, Paint p) {
    for (var x = first(area.left, origin, s); x < area.right; x += s) {
      if (x >= area.left) canvas.drawLine(Offset(x, area.top), Offset(x, area.bottom), p);
    }
  }

  Paint coloured(int argb, [double width = 1]) => Paint()
    ..color = Color(argb)
    ..strokeWidth = width / scale
    ..style = PaintingStyle.stroke;

  switch (background) {
    case BoardBackground.ruled:
      hLines(ruledTop, step(ruledGap), line);
    case BoardBackground.grid:
      final s = step(pxPerCm);
      vLines(0, s, line);
      hLines(0, s, line);
    case BoardBackground.graph:
      final minor = Paint()
        ..color = const Color(0x2218A058)
        ..strokeWidth = 0.6 / scale;
      final major = Paint()
        ..color = const Color(0x5518A058)
        ..strokeWidth = 1.2 / scale;
      if (pxPerCm / 5 * scale >= 5) {
        vLines(0, pxPerCm / 5, minor);
        hLines(0, pxPerCm / 5, minor);
      }
      final s = step(pxPerCm);
      vLines(0, s, major);
      hLines(0, s, major);
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
      final blue = coloured(0x552F6FB5);
      final red = coloured(0x55D7263D);
      for (var y = first(area.top, 0, fourLineBand); y < area.bottom; y += fourLineBand) {
        canvas.drawLine(Offset(area.left, y + gap * 0.5), Offset(area.right, y + gap * 0.5), red);
        canvas.drawLine(Offset(area.left, y + gap * 1.5), Offset(area.right, y + gap * 1.5), blue);
        _dashedH(canvas, area, y + gap * 2.5, 12 / scale, blue);
        canvas.drawLine(Offset(area.left, y + gap * 3.5), Offset(area.right, y + gap * 3.5), blue);
      }
    case BoardBackground.kannadaLines:
      // A 160-unit band: vowel signs above, the letter body, ottakshara below.
      const band = 160.0;
      if (band * scale < 20) return;
      final blue = coloured(0x552F6FB5);
      final red = coloured(0x55D7263D);
      for (var y = first(area.top, 0, band); y < area.bottom; y += band) {
        canvas.drawLine(Offset(area.left, y + 24), Offset(area.right, y + 24), blue);
        canvas.drawLine(Offset(area.left, y + 52), Offset(area.right, y + 52), red);
        _dashedH(canvas, area, y + 82, 12 / scale, blue);
        canvas.drawLine(Offset(area.left, y + 112), Offset(area.right, y + 112), red);
        canvas.drawLine(Offset(area.left, y + 140), Offset(area.right, y + 140), blue);
      }
    case BoardBackground.musicStaff:
      const staff = 140.0, gap = 14.0;
      if (gap * scale < 3) return;
      final p = coloured(0x66303A44);
      for (var y = first(area.top, 40, staff); y < area.bottom; y += staff) {
        for (var i = 0; i < 5; i++) {
          canvas.drawLine(Offset(area.left, y + i * gap), Offset(area.right, y + i * gap), p);
        }
      }
    case BoardBackground.isometric:
      final s = step(48);
      final h = s * math.sqrt(3) / 2;
      // Vertical lines, and lines at ±30° through a triangular lattice.
      vLines(0, h, line);
      final t = math.tan(math.pi / 6);
      for (var c = first(area.top - area.right * t, 0, s); c < area.bottom - area.left * t; c += s) {
        canvas.drawLine(Offset(area.left, area.left * t + c), Offset(area.right, area.right * t + c), line);
      }
      for (var c = first(area.top + area.left * t, 0, s); c < area.bottom + area.right * t; c += s) {
        canvas.drawLine(Offset(area.left, c - area.left * t), Offset(area.right, c - area.right * t), line);
      }
    case BoardBackground.ledger || BoardBackground.journal:
      _paintAccounts(canvas, area, background, scale, hLines);
    case BoardBackground.twoColumns || BoardBackground.threeColumns:
      final n = background == BoardBackground.twoColumns ? 2 : 3;
      final p = coloured(0x553A4A5A, 2);
      for (var sx = first(area.left, 0, boardSheet.width); sx < area.right; sx += boardSheet.width) {
        for (var i = 1; i < n; i++) {
          final x = sx + boardSheet.width * i / n;
          canvas.drawLine(Offset(x, area.top), Offset(x, area.bottom), p);
        }
      }
    case BoardBackground.cricketField:
      _paintCricket(canvas, scale);
    case BoardBackground.footballField:
      _paintFootball(canvas, scale);
    case BoardBackground.indiaMap || BoardBackground.worldMap:
      _paintMapPlaceholder(canvas, scale, background == BoardBackground.indiaMap ? 'India map' : 'World map');
    case BoardBackground.plain ||
        BoardBackground.chalkboard ||
        BoardBackground.paperCream ||
        BoardBackground.paperSky ||
        BoardBackground.paperMint ||
        BoardBackground.paperRose ||
        BoardBackground.paperSlate:
      break;
  }
}

void _dashedH(Canvas canvas, Rect area, double y, double dash, Paint p) {
  for (var x = (area.left / dash).floorToDouble() * dash; x < area.right; x += dash) {
    canvas.drawLine(Offset(x, y), Offset(x + dash / 2, y), p);
  }
}

void _label(Canvas canvas, String text, Offset at, {double size = 18, Color color = const Color(0x99303A44), bool centre = false}) {
  final tp = TextPainter(
    text: TextSpan(text: text, style: TextStyle(fontSize: size, color: color, fontWeight: FontWeight.w600)),
    textDirection: TextDirection.ltr,
  )..layout();
  tp.paint(canvas, centre ? at - Offset(tp.width / 2, tp.height / 2) : at);
}

/// A ledger account (Dr | Cr, each with Date, Particulars, J.F., Amount) or a journal (Date,
/// Particulars, L.F., Debit, Credit), repeated across the board a sheet at a time.
void _paintAccounts(Canvas canvas, Rect area, BoardBackground b, double scale, void Function(double, double, Paint) hLines) {
  const rowH = 44.0, top = 96.0;
  final rows = Paint()
    ..color = const Color(0x1F1A3A6B)
    ..strokeWidth = 1 / scale;
  final red = Paint()
    ..color = const Color(0x88D7263D)
    ..strokeWidth = 1.5 / scale;
  final head = Paint()
    ..color = const Color(0x553A4A5A)
    ..strokeWidth = 2 / scale;
  if (rowH * scale >= 6) hLines(top, rowH, rows);
  final ledger = b == BoardBackground.ledger;
  // Column edges as fractions of a sheet, and their headings.
  final cols = ledger ? const [0.0, 0.08, 0.32, 0.38, 0.5, 0.58, 0.82, 0.88, 1.0] : const [0.0, 0.1, 0.62, 0.7, 0.85, 1.0];
  final heads = ledger
      ? const ['Date', 'Particulars', 'J.F.', 'Amount ₹', 'Date', 'Particulars', 'J.F.', 'Amount ₹']
      : const ['Date', 'Particulars', 'L.F.', 'Debit ₹', 'Credit ₹'];
  final w = boardSheet.width;
  for (var sx = (area.left / w).floorToDouble() * w; sx < area.right; sx += w) {
    for (var i = 0; i < cols.length; i++) {
      final x = sx + cols[i] * (w - 40) + 20;
      final strong = ledger && i == 4;
      canvas.drawLine(Offset(x, math.max(area.top, top - rowH)), Offset(x, area.bottom), strong ? head : red);
      if (i < heads.length && scale > 0.3) _label(canvas, heads[i], Offset(x + 8, top - rowH + 10));
    }
    canvas.drawLine(Offset(sx + 20, top - rowH), Offset(sx + w - 20, top - rowH), head);
    canvas.drawLine(Offset(sx + 20, top), Offset(sx + w - 20, top), head);
    if (ledger && scale > 0.3) {
      _label(canvas, 'Dr.', Offset(sx + 24, top - rowH - 34), size: 22);
      _label(canvas, 'Cr.', Offset(sx + w - 70, top - rowH - 34), size: 22);
    }
  }
}

Paint _fieldLine(double scale) => Paint()
  ..color = const Color(0x881E7B3C)
  ..strokeWidth = 3 / scale
  ..style = PaintingStyle.stroke;

void _paintCricket(Canvas canvas, double scale) {
  final c = boardSheet.center(Offset.zero);
  canvas.drawOval(Rect.fromCenter(center: c, width: 1500, height: 980), Paint()..color = const Color(0x1A2E9E4F));
  final p = _fieldLine(scale);
  canvas.drawOval(Rect.fromCenter(center: c, width: 1500, height: 980), p);
  // The 30-yard circle and the pitch with its creases.
  canvas.drawOval(Rect.fromCenter(center: c, width: 760, height: 520), p..color = const Color(0x661E7B3C));
  canvas.drawRect(Rect.fromCenter(center: c, width: 44, height: 220), Paint()..color = const Color(0x33B08A4A));
  canvas.drawRect(Rect.fromCenter(center: c, width: 44, height: 220), p);
  for (final dy in const [-90.0, 90.0]) {
    canvas.drawLine(c + Offset(-40, dy), c + Offset(40, dy), p);
  }
}

void _paintFootball(Canvas canvas, double scale) {
  const field = Rect.fromLTWH(120, 90, 1680, 900);
  canvas.drawRect(field, Paint()..color = const Color(0x1A2E9E4F));
  final p = _fieldLine(scale);
  canvas.drawRect(field, p);
  final c = field.center;
  canvas.drawLine(Offset(c.dx, field.top), Offset(c.dx, field.bottom), p);
  canvas.drawCircle(c, 110, p);
  canvas.drawCircle(c, 4, Paint()..color = p.color);
  for (final left in [true, false]) {
    final x = left ? field.left : field.right;
    final dir = left ? 1.0 : -1.0;
    final box = Rect.fromPoints(Offset(x, c.dy - 240), Offset(x + dir * 220, c.dy + 240));
    final small = Rect.fromPoints(Offset(x, c.dy - 110), Offset(x + dir * 70, c.dy + 110));
    canvas.drawRect(box, p);
    canvas.drawRect(small, p);
    canvas.drawCircle(Offset(x + dir * 150, c.dy), 4, Paint()..color = p.color);
  }
}

/// No outline is bundled (no public-domain one of a size the board can ship was available):
/// a frame with a note, so the page still works as a map area to draw on.
void _paintMapPlaceholder(Canvas canvas, double scale, String title) {
  const frame = Rect.fromLTWH(160, 90, 1600, 900);
  final p = Paint()
    ..color = const Color(0x553A4A5A)
    ..strokeWidth = 2 / scale
    ..style = PaintingStyle.stroke;
  canvas.drawRRect(RRect.fromRectAndRadius(frame, const Radius.circular(24)), p);
  _label(canvas, title, frame.center - const Offset(0, 24), size: 40, centre: true);
  _label(canvas, 'Outline not bundled yet: draw or add a picture', frame.center + const Offset(0, 30), size: 22, centre: true);
}

/// Paints a fixed-size page of paper from (0, 0), for viewers and page pictures.
class BackgroundPainter extends CustomPainter {
  BackgroundPainter(this.background, {this.scale = 1});

  final BoardBackground background;

  /// Board units per pixel shown (a thumbnail of a whole sheet is about 0.06).
  final double scale;

  @override
  void paint(Canvas canvas, Size size) {
    if (scale == 1) return paintBoardBackground(canvas, Offset.zero & size, background);
    canvas.save();
    canvas.scale(scale);
    paintBoardBackground(canvas, Offset.zero & (size / scale), background, scale: scale);
    canvas.restore();
  }

  @override
  bool shouldRepaint(BackgroundPainter old) => old.background != background || old.scale != scale;
}
