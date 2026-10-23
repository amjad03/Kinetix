import 'package:flutter/material.dart';

/// The Zynetix mark, painted (no asset, so it is crisp at any size and needs no loading): a Z drawn
/// as one pen stroke on a gradient tile, with an amber spark where the pen lifts. The master
/// artwork is design/brand/zynetix-mark.svg; the app icons are rendered from the same shapes.
class ZynetixMark extends StatelessWidget {
  const ZynetixMark({super.key, this.size = 32, this.colors = boardColors});

  final double size;

  /// The tile gradient (top-left to bottom-right). Each app has its own; the board is the brand teal.
  final List<Color> colors;

  static const boardColors = [Color(0xFF14B8A6), Color(0xFF0B5F73)];
  static const teacherColors = [Color(0xFF3B82F6), Color(0xFF1E3A8A)];
  static const studentColors = [Color(0xFF8B5CF6), Color(0xFF4C1D95)];
  static const parentColors = [Color(0xFFF43F5E), Color(0xFF9F1239)];

  @override
  Widget build(BuildContext context) => Semantics(
        label: 'Zynetix',
        image: true,
        child: SizedBox.square(dimension: size, child: CustomPaint(painter: _MarkPainter(colors))),
      );
}

/// The mark followed by the name, e.g. "Zynetix Board" with [suffix] "Board".
class ZynetixWordmark extends StatelessWidget {
  const ZynetixWordmark({super.key, this.size = 28, this.suffix, this.colors = ZynetixMark.boardColors, this.style});

  final double size;
  final String? suffix;
  final List<Color> colors;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final base = (style ?? Theme.of(context).textTheme.titleMedium ?? const TextStyle()).copyWith(fontSize: size * 0.62);
    return Row(mainAxisSize: MainAxisSize.min, children: [
      ZynetixMark(size: size, colors: colors),
      SizedBox(width: size * 0.32),
      Text.rich(
        TextSpan(children: [
          TextSpan(text: 'Zynetix', style: base.copyWith(fontWeight: FontWeight.w700)),
          if (suffix != null) TextSpan(text: ' $suffix', style: base.copyWith(fontWeight: FontWeight.w400)),
        ]),
        maxLines: 1,
      ),
    ]);
  }
}

class _MarkPainter extends CustomPainter {
  _MarkPainter(this.colors);

  final List<Color> colors;

  @override
  void paint(Canvas canvas, Size size) {
    final k = size.width / 512;
    final rect = Offset.zero & size;
    canvas.drawRRect(
      RRect.fromRectAndRadius(rect, Radius.circular(120 * k)),
      Paint()..shader = LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: colors).createShader(rect),
    );
    final z = Path()
      ..moveTo(150 * k, 156 * k)
      ..lineTo(340 * k, 156 * k)
      ..lineTo(160 * k, 356 * k)
      ..lineTo(362 * k, 356 * k);
    canvas.drawPath(
      z,
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = 58 * k
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
    canvas.drawCircle(Offset(390 * k, 128 * k), 30 * k, Paint()..color = const Color(0xFFFFB547));
  }

  @override
  bool shouldRepaint(_MarkPainter old) => old.colors != colors;
}
