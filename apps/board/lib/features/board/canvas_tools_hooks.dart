import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'layout/layout_strings.dart';

/// The thin seam between the tools drawer and the geometry tools, flowcharts and graph
/// templates (the "canvas-tools" work in packages/kinetix_ink and features/canvas_tools, which
/// will export `CanvasTools`). Until that lands these use the board's current tools: the ruler
/// and protractor overlays, the compass tool, a set square drawn as a shape, the flowchart
/// block menu and a list of ready-made graphs. At merge each body becomes the one-line call to
/// `CanvasTools` named in its comment.
class CanvasToolsHooks {
  const CanvasToolsHooks._();

  /// `CanvasTools.openRuler(context, wb)`.
  static void openRuler(BuildContext context, WhiteboardController wb) => wb.toggleRuler();

  /// `CanvasTools.openProtractor(context, wb)`.
  static void openProtractor(BuildContext context, WhiteboardController wb) => wb.toggleProtractor();

  /// `CanvasTools.openSetSquare45(context, wb)`.
  static void openSetSquare45(BuildContext context, WhiteboardController wb) => _setSquare(wb, 45);

  /// `CanvasTools.openSetSquare3060(context, wb)`.
  static void openSetSquare3060(BuildContext context, WhiteboardController wb) => _setSquare(wb, 30);

  /// `CanvasTools.openCompass(context, wb)`.
  static void openCompass(BuildContext context, WhiteboardController wb) => wb.tool = BoardTool.compass;

  /// `CanvasTools.insertFlowchart(context, wb)`; today the flowchart block menu ([current]).
  static Future<void> insertFlowchart(BuildContext context, WhiteboardController wb, {required Future<void> Function() current}) => current();

  /// `CanvasTools.graphTemplatesPanel(onAdd: …)`: ready-made graphs to add to the board.
  static Widget graphTemplatesPanel({required void Function(List<BoardElement> elements) onAdd, Color color = const Color(0xFF1A73E8)}) =>
      _GraphTemplates(onAdd: onAdd, color: color);

  /// A set square as a right-angled triangle on the board, selected so it moves and turns.
  static void _setSquare(WhiteboardController wb, int angle) {
    const side = 360.0;
    final base = angle == 45 ? side : side * math.sqrt(3);
    final pts = [Offset.zero, const Offset(0, side), Offset(base, side), Offset.zero];
    wb.insert([
      Stroke(
        id: newElementId(),
        style: InkStyle(tool: InkTool.shape, color: wb.penColor, width: 3, shape: ShapeKind.rightTriangle),
        shape: ShapeKind.rightTriangle,
        points: [for (final p in pts) InkPoint(p.dx, p.dy)],
      ),
    ]);
  }
}

/// Graph templates, until CanvasTools brings the subject-and-topic ones.
class _GraphTemplates extends StatelessWidget {
  const _GraphTemplates({required this.onAdd, required this.color});

  final void Function(List<BoardElement> elements) onAdd;
  final Color color;

  static const _graphs = [
    ('y = 2x + 3', '2x+3', 10.0, 10.0),
    ('y = x²', 'x^2', 5.0, 25.0),
    ('y = x² − 4x + 3', 'x^2-4x+3', 6.0, 10.0),
    ('y = sin x', 'sin(x)', 7.0, 1.5),
    ('y = cos x', 'cos(x)', 7.0, 1.5),
    ('y = eˣ', 'exp(x)', 3.0, 20.0),
    ('y = 1/x', '1/x', 5.0, 5.0),
    ('y = |x|', 'abs(x)', 6.0, 6.0),
  ];

  @override
  Widget build(BuildContext context) {
    final s = LayoutStrings.of(context);
    return ListView(
      key: const Key('graph-templates'),
      padding: const EdgeInsets.all(Kx.s16),
      children: [
        for (final (title, expr, x, y) in _graphs)
          Card(
            elevation: 0,
            color: context.colors.surfaceContainer,
            child: ListTile(
              leading: Icon(Icons.show_chart, color: color),
              title: Text(title),
              trailing: FilledButton.tonalIcon(
                key: Key('graph-add-$expr'),
                onPressed: () => onAdd([
                  GraphElement(id: newElementId(), rect: const Rect.fromLTWH(0, 0, 480, 360), expression: expr, color: color, xMin: -x, xMax: x, yMin: -y, yMax: y),
                ]),
                icon: const Icon(Icons.add),
                label: Text(s.addToBoard),
              ),
            ),
          ),
      ],
    );
  }
}
