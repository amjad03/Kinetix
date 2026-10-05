import 'package:flutter/material.dart';
import 'package:flutter_math_fork/flutter_math.dart';

import 'board_background.dart';
import 'ink_canvas.dart';
import 'ink_models.dart';
import 'view.dart';

/// Typeset equations, placed over a painted board. Painters cannot typeset LaTeX, so every
/// board view (the board itself, saved boards, recordings, the live view) puts this layer on
/// top of its painter.
class MathLayer extends StatelessWidget {
  /// [origin] is the board point at the layer's top left (for viewers); [view] places the
  /// equations on an endless board instead.
  const MathLayer({
    super.key,
    required this.elements,
    this.origin = Offset.zero,
    this.view,
    this.background = BoardBackground.plain,
    this.hidden = const {},
    this.onMeasured,
  });

  final List<BoardElement> elements;
  final Offset origin;
  final ViewState? view;
  final BoardBackground background;

  /// Ids not to show (being moved, edited or erased).
  final Set<String> hidden;

  /// Called when an equation's typeset size differs from the size it carries.
  final void Function(MathElement e, Size size)? onMeasured;

  @override
  Widget build(BuildContext context) {
    final maths = [
      for (final e in elements)
        if (e is MathElement && !hidden.contains(e.id)) e,
    ];
    if (maths.isEmpty) return const SizedBox.shrink();
    final v = view ?? ViewState(offset: -origin);
    return IgnorePointer(
      child: ClipRect(
        child: SizedBox.expand(
          child: Transform(
            transform: v.matrix,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                for (final m in maths)
                  Positioned(
                    left: m.position.dx,
                    top: m.position.dy,
                    child: Transform.rotate(
                      angle: m.rotation,
                      alignment: Alignment.center,
                      child: BoardMath(key: ValueKey(m.id), element: m, background: background, onMeasured: onMeasured),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// One typeset equation in its board colour (near-black turns chalk white on the chalkboard).
class BoardMath extends StatefulWidget {
  const BoardMath({super.key, required this.element, this.background = BoardBackground.plain, this.onMeasured});

  final MathElement element;
  final BoardBackground background;
  final void Function(MathElement e, Size size)? onMeasured;

  @override
  State<BoardMath> createState() => _BoardMathState();
}

class _BoardMathState extends State<BoardMath> {
  final _key = GlobalKey();

  void _measure() {
    if (!mounted || widget.onMeasured == null) return;
    final box = _key.currentContext?.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) return;
    final s = box.size, old = widget.element.size;
    if ((s.width - old.width).abs() > 1 || (s.height - old.height).abs() > 1) widget.onMeasured!(widget.element, s);
  }

  @override
  Widget build(BuildContext context) {
    final e = widget.element;
    if (widget.onMeasured != null) WidgetsBinding.instance.addPostFrameCallback((_) => _measure());
    final color = inkColorFor(e.color, widget.background);
    return Padding(
      key: _key,
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Math.tex(
        e.latex,
        mathStyle: MathStyle.display,
        textStyle: TextStyle(fontSize: e.fontSize, color: color),
        onErrorFallback: (_) => Text(e.latex, style: TextStyle(fontSize: e.fontSize * 0.7, color: color)),
      ),
    );
  }
}
