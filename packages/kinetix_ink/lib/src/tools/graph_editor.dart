import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../element_painting.dart';
import '../graph_expr.dart';
import '../ink_models.dart';
import '../whiteboard_controller.dart';
import 'tool_strings.dart';

/// Edits a graph on the board (a double tap on it): its function and further curves, the
/// value of each letter (sliders), the shaded band, the axis labels and title, and its marked
/// points, dragged on the preview. Applied as one undo step.
Future<void> editGraph(BuildContext context, WhiteboardController c, GraphElement g) async {
  final out = await showDialog<GraphElement>(
    context: context,
    builder: (_) => GraphEditorDialog(graph: g),
  );
  if (out != null && c.byId(g.id) != null) c.replace(out);
}

class GraphEditorDialog extends StatefulWidget {
  const GraphEditorDialog({super.key, required this.graph});

  final GraphElement graph;

  @override
  State<GraphEditorDialog> createState() => _GraphEditorDialogState();
}

class _GraphEditorDialogState extends State<GraphEditorDialog> {
  late GraphElement _g = widget.graph;
  late final _expr = TextEditingController(text: _g.expression);
  late final _curves = TextEditingController(text: _g.curves.join('\n'));
  late final _title = TextEditingController(text: _g.title);
  late final _xl = TextEditingController(text: _g.xLabel);
  late final _yl = TextEditingController(text: _g.yLabel);
  late final _from = TextEditingController(text: _g.shade == null ? '' : graphNum(_g.shade!.from));
  late final _to = TextEditingController(text: _g.shade == null ? '' : graphNum(_g.shade!.to));
  int? _dragging;

  /// Each letter's slider range, fixed when the editor opens.
  late final Map<String, (double, double)> _ranges = {
    for (final e in _g.params.entries)
      e.key: () {
        final span = math.max(5.0, e.value.abs() * 2);
        return (e.value - span, e.value + span);
      }(),
  };

  @override
  void dispose() {
    for (final c in [_expr, _curves, _title, _xl, _yl, _from, _to]) {
      c.dispose();
    }
    super.dispose();
  }

  void _sync() {
    final from = double.tryParse(_from.text), to = double.tryParse(_to.text);
    setState(() {
      _g = _g.copyWith(
        expression: _expr.text.trim(),
        curves: [
          for (final l in _curves.text.split('\n'))
            if (l.trim().isNotEmpty) l.trim(),
        ],
        title: _title.text.trim(),
        xLabel: _xl.text.trim(),
        yLabel: _yl.text.trim(),
        shade: from != null && to != null ? GraphShade(from, to, between: _g.shade?.between ?? false) : null,
        clearShade: from == null || to == null,
      );
    });
  }

  bool get _valid => compileGraph(_g.resolvedExpression) != null && _g.resolvedCurves.every((c) => compileGraph(c) != null);

  /// The preview's graph: the same graph in a box of [size] at the origin.
  GraphElement _preview(Size size) => _g.copyWith(rect: Offset.zero & size, rotation: 0);

  @override
  Widget build(BuildContext context) {
    final s = ToolStrings.of(context);
    Widget field(TextEditingController c, String label, {Key? key, int lines = 1}) => Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: TextField(
        key: key,
        controller: c,
        minLines: lines,
        maxLines: lines,
        decoration: InputDecoration(labelText: label, isDense: true, border: const OutlineInputBorder()),
        onChanged: (_) => _sync(),
      ),
    );
    return AlertDialog(
      title: Text(s.t('editGraph')),
      content: SizedBox(
        width: 760,
        child: SingleChildScrollView(
          child: Wrap(
            spacing: 16,
            runSpacing: 12,
            children: [
              SizedBox(
                width: 380,
                child: Column(
                  children: [
                    AspectRatio(
                      aspectRatio: _g.rect.width / math.max(1, _g.rect.height),
                      child: LayoutBuilder(
                        builder: (context, box) {
                          final pg = _preview(box.biggest);
                          return GestureDetector(
                            key: const Key('graph-preview'),
                            onPanStart: (d) {
                              var best = 28.0;
                              _dragging = null;
                              for (var i = 0; i < pg.points.length; i++) {
                                final dist = (pg.toBoard(pg.points[i].x, pg.points[i].y) - d.localPosition).distance;
                                if (dist < best) {
                                  best = dist;
                                  _dragging = i;
                                }
                              }
                            },
                            onPanUpdate: (d) {
                              final i = _dragging;
                              if (i == null) return;
                              final q = pg.toGraph(d.localPosition);
                              final pts = List.of(_g.points);
                              pts[i] = GraphPoint(_round(q.dx, pg.xMax - pg.xMin), _round(q.dy, pg.yMax - pg.yMin), pts[i].label);
                              setState(() => _g = _g.copyWith(points: pts));
                            },
                            onPanEnd: (_) => _dragging = null,
                            child: CustomPaint(painter: _PreviewPainter(pg), size: box.biggest),
                          );
                        },
                      ),
                    ),
                    if (_g.points.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text(s.t('points'), style: Theme.of(context).textTheme.bodySmall),
                      ),
                  ],
                ),
              ),
              SizedBox(
                width: 340,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    field(_expr, s.t('expression'), key: const Key('graph-expression')),
                    field(_curves, s.t('moreCurves'), lines: 2),
                    for (final e in _g.params.entries)
                      Row(
                        children: [
                          SizedBox(
                            width: 28,
                            child: Text(e.key, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                          ),
                          Expanded(
                            child: Slider(
                              key: Key('graph-param-${e.key}'),
                              value: e.value.clamp(_ranges[e.key]!.$1, _ranges[e.key]!.$2),
                              min: _ranges[e.key]!.$1,
                              max: _ranges[e.key]!.$2,
                              onChanged: (v) =>
                                  setState(() => _g = _g.copyWith(params: {..._g.params, e.key: _round(v, _ranges[e.key]!.$2 - _ranges[e.key]!.$1)})),
                            ),
                          ),
                          SizedBox(width: 56, child: Text(graphNum(e.value), textAlign: TextAlign.end)),
                        ],
                      ),
                    field(_title, s.t('title')),
                    Row(
                      children: [
                        Expanded(child: field(_xl, s.t('xLabel'))),
                        const SizedBox(width: 8),
                        Expanded(child: field(_yl, s.t('yLabel'))),
                      ],
                    ),
                    Row(
                      children: [
                        Expanded(child: field(_from, s.t('shade'))),
                        const SizedBox(width: 8),
                        Expanded(child: field(_to, s.t('shadeTo'))),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(s.t('cancel'))),
        FilledButton(key: const Key('graph-apply'), onPressed: _valid ? () => Navigator.pop(context, _g) : null, child: Text(s.t('apply'))),
      ],
    );
  }
}

/// [v] rounded to a hundredth of [span]'s order, so dragged values read cleanly.
double _round(double v, double span) {
  final step = niceStep(span, 100);
  return (v / step).roundToDouble() * step;
}

class _PreviewPainter extends CustomPainter {
  _PreviewPainter(this.g);

  final GraphElement g;

  @override
  void paint(Canvas canvas, Size size) => paintGraph(canvas, g);

  @override
  bool shouldRepaint(_PreviewPainter old) => true;
}
