import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../board_background.dart';
import '../element_painting.dart';
import '../flow_chart.dart';
import '../ink_models.dart';
import '../whiteboard_controller.dart';
import 'tool_strings.dart';

/// The ＋ buttons on the four sides of a selected flowchart block or mind-map topic. Each opens
/// the palette of blocks (drawn as the real shapes) and conditional flows; the choice is added
/// beyond that side, joined and lined up, as one undo step.
class FlowPlusOverlay extends StatelessWidget {
  const FlowPlusOverlay({super.key, required this.controller});

  final WhiteboardController controller;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final sel = c.selectedElements;
    if (sel.length != 1 || sel.first is! FlowNodeElement || c.isTransforming) return const SizedBox.shrink();
    final node = sel.first as FlowNodeElement;
    final view = c.view.value;
    final s = ToolStrings.of(context);
    return Stack(
      children: [
        for (final side in FlowSide.values)
          () {
            final at = view.toScreen(node.anchor(side)) + side.dir * 34;
            return Positioned(
              left: at.dx - 20,
              top: at.dy - 20,
              child: Tooltip(
                message: s.t('addNext'),
                child: Material(
                  key: Key('flow-plus-${side.name}'),
                  color: KxColor.accent,
                  shape: const CircleBorder(),
                  elevation: 3,
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: () => openFlowPalette(context, c, node, side),
                    child: const SizedBox(width: 40, height: 40, child: Icon(Icons.add, color: Colors.white, size: 24)),
                  ),
                ),
              ),
            );
          }(),
      ],
    );
  }
}

/// What the palette returned: a single block or a pattern.
typedef FlowChoice = ({FlowBlock? shape, FlowPattern? pattern});

/// Opens the palette for adding beyond [side] of [node], and adds the choice.
Future<void> openFlowPalette(BuildContext context, WhiteboardController c, FlowNodeElement node, FlowSide side) async {
  final s = ToolStrings.of(context);
  final choice = await showDialog<FlowChoice>(
    context: context,
    builder: (_) => FlowPalette(from: node.shape, strings: s),
  );
  if (choice == null) return;
  final r = addNextFlow(c.elements, node.id, side, shape: choice.shape, pattern: choice.pattern, words: s.flowWords);
  if (r == null) return;
  c.setElements(r.elements);
  c.select({r.focus});
}

/// Every block drawn as itself, and the conditional flows drawn as small diagrams.
class FlowPalette extends StatelessWidget {
  const FlowPalette({super.key, required this.from, required this.strings});

  final FlowBlock from;
  final ToolStrings strings;

  @override
  Widget build(BuildContext context) {
    final s = strings;
    Widget tile(String key, String label, CustomPainter painter, FlowChoice choice) => InkWell(
      key: Key(key),
      borderRadius: BorderRadius.circular(12),
      onTap: () => Navigator.pop(context, choice),
      child: Container(
        width: 116,
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          border: Border.all(color: const Color(0x22000000)),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(width: 96, height: 64, child: CustomPaint(painter: painter)),
            const SizedBox(height: 6),
            Text(label, textAlign: TextAlign.center, maxLines: 2, style: const TextStyle(fontSize: 13)),
          ],
        ),
      ),
    );
    return Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 720, maxHeight: 640),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(s.t('blocks'), style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 10),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  for (final shape in paletteShapes(from))
                    tile('flow-shape-${shape.name}', s.shape(shape), ShapeIconPainter(shape), (shape: shape, pattern: null)),
                ],
              ),
              if (from != FlowBlock.topic) ...[
                const SizedBox(height: 18),
                Text(s.t('conditions'), style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    for (final p in FlowPattern.values)
                      tile('flow-pattern-${p.name}', s.pattern(p), PatternIconPainter(p, s.flowWords), (shape: null, pattern: p)),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// A block's real outline, filling the tile.
class ShapeIconPainter extends CustomPainter {
  ShapeIconPainter(this.shape);

  final FlowBlock shape;

  @override
  void paint(Canvas canvas, Size size) {
    final ds = shape.defaultSize;
    final k = math.min((size.width - 4) / ds.width, (size.height - 4) / ds.height);
    final r = Rect.fromCenter(center: size.center(Offset.zero), width: ds.width * k, height: ds.height * k);
    paintFlowNode(canvas, FlowNodeElement(id: 'icon', rect: r, shape: shape, color: KxColor.accent), BoardBackground.plain);
  }

  @override
  bool shouldRepaint(ShapeIconPainter old) => old.shape != shape;
}

/// A conditional flow as a small diagram: the real blocks and arrows, scaled down.
class PatternIconPainter extends CustomPainter {
  PatternIconPainter(this.pattern, this.words);

  final FlowPattern pattern;
  final FlowWords words;

  @override
  void paint(Canvas canvas, Size size) {
    var n = 0;
    final start = FlowNodeElement(id: 'src', rect: const Rect.fromLTWH(0, 0, 200, 90), shape: FlowBlock.process, color: KxColor.accent);
    final r = addNextFlow(
      [start],
      'src',
      FlowSide.bottom,
      pattern: pattern,
      words: const FlowWords(yes: '', no: '', condition: '', step: '', cases: ['', '', ''], loop: '', forEach: '', done: ''),
      newId: () => 'p${n++}',
    );
    if (r == null) return;
    final els = r.elements.where((e) => e.id != 'src').toList();
    final box = contentBounds(els).inflate(10);
    final k = math.min(size.width / box.width, size.height / box.height);
    canvas
      ..save()
      ..translate(size.width / 2, size.height / 2)
      ..scale(k)
      ..translate(-box.center.dx, -box.center.dy);
    for (final e in els) {
      if (e is FlowLinkElement && (e.from == 'src')) continue;
      paintElement(canvas, e, BoardBackground.plain);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(PatternIconPainter old) => old.pattern != pattern;
}

/// Edits the words in a block (a double tap on it).
Future<void> editFlowNodeText(BuildContext context, WhiteboardController c, FlowNodeElement node) async {
  final s = ToolStrings.of(context);
  final ctl = TextEditingController(text: node.text);
  final text = await showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(s.t('editText')),
      content: TextField(
        key: const Key('flow-text-field'),
        controller: ctl,
        autofocus: true,
        minLines: 1,
        maxLines: 4,
        onSubmitted: (v) => Navigator.pop(ctx, v),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: Text(s.t('cancel'))),
        FilledButton(key: const Key('flow-text-done'), onPressed: () => Navigator.pop(ctx, ctl.text), child: Text(s.t('done'))),
      ],
    ),
  );
  final now = c.byId(node.id);
  if (text == null || now is! FlowNodeElement) return;
  c.replace(now.copyWith(text: text.trim()));
}
