import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';
import '../comfort/eye_comfort.dart';
import '../search/filter_bar.dart';
import '../search/fuzzy.dart';
import '../search/search_strings.dart';
import '../search/solids3d.dart';

import 'package:kinetix_ink/kinetix_ink.dart';

import 'chrome.dart';

const inkPalette = [
  Color(0xFF1B1B1F), // black (chalk white on dark boards)
  Color(0xFFD93025), // red
  Color(0xFF1A73E8), // blue
  Color(0xFF188038), // green
  Color(0xFFE8710A), // orange
  Color(0xFFF9AB00), // yellow
  Color(0xFF9334E6), // purple
  Color(0xFFE52592), // pink
  Color(0xFF12B5CB), // teal
  Color(0xFF5F6368), // grey
];

const _widths = [2.0, 4.0, 7.0, 12.0];

/// Highlighter colours: see-through over ink.
const highlighterPalette = [
  Color(0xFFFFD84D), // yellow
  Color(0xFF39D98A), // green
  Color(0xFFFF7AB8), // pink
  Color(0xFF57B8FF), // blue
  Color(0xFFFFA64D), // orange
];

/// Write: pen or highlighter, colour and thickness. With something selected, a colour
/// recolours it.
class WritePopover extends StatelessWidget {
  const WritePopover({super.key, required this.wb, this.footer});

  final WhiteboardController wb;

  /// Under the pen's settings (tidying shapes as they are drawn).
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: wb,
      builder: (context, _) {
        final hl = wb.tool == BoardTool.highlighter;
        final color = hl ? wb.highlighterColor : wb.penColor;
        final width = hl ? wb.highlighterWidth : wb.penWidth;
        final l = context.l10n;
        void setColor(Color c) {
          if (wb.selection.isNotEmpty) {
            wb.recolorSelection(c);
          } else if (hl) {
            wb.setHighlighter(color: c);
          } else {
            wb.setPen(color: c);
          }
        }

        return PopoverCard(
          title: l.toolWrite,
          width: 460,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SegmentedButton<bool>(
                segments: [
                  ButtonSegment(value: false, icon: const Icon(Icons.edit_outlined), label: Text(l.pen)),
                  ButtonSegment(value: true, icon: const Icon(Icons.border_color_outlined), label: Text(l.highlighter)),
                ],
                selected: {hl},
                onSelectionChanged: (s) => s.first ? wb.setHighlighter() : wb.setPen(),
              ),
              const SizedBox(height: Kx.s20),
              Text(l.colour, style: context.text.labelLarge?.copyWith(color: context.colors.onSurfaceVariant)),
              const SizedBox(height: Kx.s8),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  for (final c in hl ? highlighterPalette : inkPalette)
                    _Swatch(color: inkColorFor(c, wb.background), selected: color == c, onTap: () => setColor(c)),
                ],
              ),
              const SizedBox(height: Kx.s20),
              Text(l.thickness, style: context.text.labelLarge?.copyWith(color: context.colors.onSurfaceVariant)),
              const SizedBox(height: Kx.s8),
              Row(
                children: [
                  for (final w in hl ? const [4.0, 6.0, 9.0] : _widths)
                    Padding(
                      padding: const EdgeInsets.only(right: Kx.s8),
                      child: _WidthChip(
                        width: hl ? w * 1.6 : w,
                        color: inkColorFor(color, BoardBackground.chalkboard),
                        selected: width == w,
                        onTap: () => hl ? wb.setHighlighter(width: w) : wb.setPen(width: w),
                      ),
                    ),
                ],
              ),
              if (footer != null && !hl) ...[const SizedBox(height: Kx.s12), footer!],
            ],
          ),
        );
      },
    );
  }
}

class _Swatch extends StatelessWidget {
  const _Swatch({required this.color, required this.selected, required this.onTap});

  final Color color;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkResponse(
      onTap: onTap,
      radius: 26,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 120),
        width: 40,
        height: 40,
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: selected ? context.colors.primary : Colors.transparent, width: 3),
        ),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white24),
          ),
          child: selected ? const Icon(Icons.check, size: 18, color: Colors.white) : null,
        ),
      ),
    );
  }
}

class _WidthChip extends StatelessWidget {
  const _WidthChip({required this.width, required this.color, required this.selected, required this.onTap});

  final double width;
  final Color color;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? context.colors.secondaryContainer : context.colors.surfaceContainerHigh,
      borderRadius: BorderRadius.circular(Kx.rMd),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(Kx.rMd),
        child: SizedBox(
          width: 64,
          height: 44,
          child: Center(
            child: Container(
              width: 34,
              height: width,
              decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(width)),
            ),
          ),
        ),
      ),
    );
  }
}

/// Erase: eraser size and clearing the page.
class ErasePopover extends StatefulWidget {
  const ErasePopover({super.key, required this.wb, required this.onCleared});

  final WhiteboardController wb;
  final VoidCallback onCleared;

  @override
  State<ErasePopover> createState() => _ErasePopoverState();
}

class _ErasePopoverState extends State<ErasePopover> {
  @override
  Widget build(BuildContext context) {
    final wb = widget.wb;
    final l = context.l10n;
    return PopoverCard(
      title: l.toolErase,
      width: 380,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l.eraserSize, style: context.text.labelLarge?.copyWith(color: context.colors.onSurfaceVariant)),
          const SizedBox(height: Kx.s8),
          SegmentedButton<double>(
            segments: [
              ButtonSegment(value: 10, label: Text(l.sizeSmall)),
              ButtonSegment(value: 18, label: Text(l.sizeMedium)),
              ButtonSegment(value: 36, label: Text(l.sizeLarge)),
            ],
            selected: {wb.eraserRadius},
            onSelectionChanged: (s) => setState(() => wb.update(() => wb.eraserRadius = s.first)),
          ),
          const SizedBox(height: Kx.s8),
          Text(
            l.eraseTip,
            style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant),
          ),
          const SizedBox(height: Kx.s16),
          SizedBox(
            width: double.infinity,
            child: FilledButton.tonalIcon(
              key: const Key('clear-page'),
              onPressed: wb.elements.isEmpty
                  ? null
                  : () {
                      wb.clearPage();
                      widget.onCleared();
                    },
              icon: const Icon(Icons.delete_sweep_outlined),
              label: Text(l.clearPage),
            ),
          ),
        ],
      ),
    );
  }
}

/// Theme: the board background.
class ThemePopover extends StatelessWidget {
  const ThemePopover({super.key, required this.background, required this.onChanged});

  final BoardBackground background;
  final ValueChanged<BoardBackground> onChanged;

  @override
  Widget build(BuildContext context) {
    return PopoverCard(
      title: context.l10n.boardTheme,
      width: 600,
      child: Wrap(
        spacing: Kx.s12,
        runSpacing: Kx.s12,
        children: [
          for (final b in BoardBackground.values)
            InkWell(
              onTap: () => onChanged(b),
              borderRadius: BorderRadius.circular(Kx.rMd),
              child: Column(
                children: [
                  Container(
                    width: 100,
                    height: 64,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(Kx.rMd),
                      border: Border.all(
                        color: b == background ? context.colors.primary : context.colors.outlineVariant,
                        width: b == background ? 3 : 1,
                      ),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: CustomPaint(painter: BackgroundPainter(b)),
                  ),
                  const SizedBox(height: 6),
                  Text(backgroundName(context.l10n, b), style: context.text.labelMedium),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Shapes: 2D shapes, filled or not, with optional measurements, and 3D solids to turn round
/// and put on the board (lib/features/search/solids3d.dart).
class ShapesPopover extends StatefulWidget {
  const ShapesPopover({super.key, required this.wb, required this.onPicked, this.primary = false, this.onOpenModel});

  final WhiteboardController wb;
  final VoidCallback onPicked;

  /// Opens a 3D model (a solid's id) in the viewer beside the board.
  final ValueChanged<String>? onOpenModel;

  /// The little ones get the first few shapes and no measurements.
  final bool primary;

  @override
  State<ShapesPopover> createState() => _ShapesPopoverState();
}

/// The shapes in the popover, in order, with their names in the board's language.
Map<ShapeKind, String> shapeNames(AppLocalizations l) => {
  ShapeKind.line: l.shapeLine,
  ShapeKind.arrow: l.shapeArrow,
  ShapeKind.doubleArrow: l.shapeDoubleArrow,
  ShapeKind.circle: l.shapeCircle,
  ShapeKind.ellipse: l.shapeEllipse,
  ShapeKind.triangle: l.shapeTriangle,
  ShapeKind.rightTriangle: l.shapeRightTriangle,
  ShapeKind.rectangle: l.shapeRectangle,
  ShapeKind.parallelogram: l.shapeParallelogram,
  ShapeKind.trapezium: l.shapeTrapezium,
  ShapeKind.rhombus: l.shapeRhombus,
  ShapeKind.pentagon: l.shapePentagon,
  ShapeKind.hexagon: l.shapeHexagon,
};

/// A board background's name in the board's language.
String backgroundName(AppLocalizations l, BoardBackground b) => switch (b) {
  BoardBackground.plain => l.bgPlain,
  BoardBackground.ruled => l.bgRuled,
  BoardBackground.grid => l.bgGrid,
  BoardBackground.dots => l.bgDots,
  BoardBackground.chalkboard => l.bgChalkboard,
  BoardBackground.fourLine => l.bgFourLine,
};

/// An icon for a shape, drawn from the same geometry the board uses, so it always matches.
class ShapeGlyph extends StatelessWidget {
  const ShapeGlyph(this.kind, {super.key, this.size = 26});

  final ShapeKind kind;
  final double size;

  @override
  Widget build(BuildContext context) =>
      CustomPaint(size: Size.square(size), painter: _GlyphPainter(kind, IconTheme.of(context).color ?? context.colors.onSurface));
}

class _GlyphPainter extends CustomPainter {
  _GlyphPainter(this.kind, this.color);

  final ShapeKind kind;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final inset = size.width * 0.12;
    final flat = kind == ShapeKind.line || kind == ShapeKind.arrow || kind == ShapeKind.doubleArrow;
    // An ellipse in a square box would look like the circle; squash it.
    final top = flat ? size.height / 2 : (kind == ShapeKind.ellipse ? size.height * 0.28 : inset);
    final bottom = flat ? size.height / 2 : (kind == ShapeKind.ellipse ? size.height * 0.72 : size.height - inset);
    final a = Offset(inset, top);
    final b = Offset(size.width - inset, bottom);
    final start = kind == ShapeKind.circle ? size.center(Offset.zero) : a;
    final end = kind == ShapeKind.circle ? size.center(Offset.zero) + Offset(size.width / 2 - inset, 0) : b;
    final stroke = Stroke(
      id: 'glyph',
      shape: kind,
      style: InkStyle(tool: InkTool.shape, color: color, width: 2, shape: kind),
      points: shapePoints(kind, start, end),
    );
    paintStroke(canvas, stroke, BoardBackground.plain);
  }

  @override
  bool shouldRepaint(_GlyphPainter old) => old.kind != kind || old.color != color;
}

class _ShapesPopoverState extends State<ShapesPopover> {
  bool _threeD = false;

  @override
  Widget build(BuildContext context) {
    final wb = widget.wb;
    final l = context.l10n;
    const primaryShapes = {ShapeKind.line, ShapeKind.arrow, ShapeKind.circle, ShapeKind.triangle, ShapeKind.rectangle};
    return ListenableBuilder(
      listenable: wb,
      builder: (context, _) => PopoverCard(
        title: l.toolShapes,
        width: 440,
        trailing: SegmentedButton<bool>(
          showSelectedIcon: false,
          segments: const [
            ButtonSegment(value: false, label: Text('2D')),
            ButtonSegment(value: true, label: Text('3D')),
          ],
          selected: {_threeD},
          onSelectionChanged: (s) => setState(() => _threeD = s.first),
        ),
        child: _threeD
            ? Solids3dGrid(onOpen: (k) => Solid3dDialog.open(context, k, onOpenViewer: widget.onOpenModel))
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: Kx.s8,
                    runSpacing: Kx.s8,
                    children: [
                      for (final e in shapeNames(l).entries)
                        if (!widget.primary || primaryShapes.contains(e.key))
                        Tooltip(
                          message: e.value,
                          child: IconButton.filledTonal(
                            key: Key('shape-${e.key.name}'),
                            isSelected: wb.tool == BoardTool.shape && wb.shapeKind == e.key,
                            iconSize: 26,
                            style: IconButton.styleFrom(minimumSize: const Size(52, 52)),
                            onPressed: () {
                              wb.setShape(e.key);
                              widget.onPicked();
                            },
                            icon: ShapeGlyph(e.key),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: Kx.s12),
                  const Divider(),
                  SwitchListTile(
                    key: const Key('shape-fill'),
                    contentPadding: EdgeInsets.zero,
                    title: Text(l.fillShapes),
                    value: wb.shapeFill,
                    onChanged: (v) => wb.update(() => wb.shapeFill = v),
                  ),
                  if (!widget.primary) ...[
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(l.showLengths),
                      subtitle: Text(l.showLengthsHint),
                      value: wb.showLengths,
                      onChanged: (v) => wb.showLengths = v,
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(l.showAngles),
                      value: wb.showAngles,
                      onChanged: (v) => wb.showAngles = v,
                    ),
                  ],
                ],
              ),
      ),
    );
  }
}

/// A classroom tool in the Tools popover.
class ToolEntry {
  const ToolEntry(this.icon, this.label, this.color, this.onTap);
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
}

class ToolsPopover extends StatefulWidget {
  const ToolsPopover({super.key, required this.tools});

  final List<ToolEntry> tools;

  @override
  State<ToolsPopover> createState() => _ToolsPopoverState();
}

class _ToolsPopoverState extends State<ToolsPopover> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final shown = matchingLabels(widget.tools, (t) => t.label, _q);
    return PopoverCard(
      title: context.l10n.toolTools,
      width: 4 * 104 + 3 * Kx.s12,
      // Beside the title, so the grid keeps its room.
      trailing: SizedBox(
        width: 190,
        child: ModuleSearchField(
          key: const Key('tools-search'),
          hint: SearchStrings.of(context).searchTools,
          padding: const EdgeInsets.only(left: Kx.s8),
          onChanged: (v) => setState(() => _q = v),
        ),
      ),
      child: Wrap(
        spacing: Kx.s12,
        runSpacing: Kx.s12,
        children: [for (final t in shown) ChromeTile(icon: t.icon, label: t.label, color: t.color, onTap: t.onTap)],
      ),
    );
  }
}

/// Eye comfort settings.
class EyeComfortPopover extends StatelessWidget {
  const EyeComfortPopover({
    super.key,
    required this.settings,
    required this.onChanged,
    required this.chalkboard,
    required this.onChalkboard,
  });

  final EyeComfortSettings settings;
  final ValueChanged<EyeComfortSettings> onChanged;
  final bool chalkboard;
  final ValueChanged<bool> onChalkboard;

  @override
  Widget build(BuildContext context) {
    final s = settings;
    final l = context.l10n;
    return PopoverCard(
      title: l.toolEyeComfort,
      width: 440,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SwitchListTile(
            key: const Key('eye-protection'),
            contentPadding: EdgeInsets.zero,
            title: Text(l.eyeProtection),
            subtitle: Text(l.eyeProtectionHint),
            value: s.enabled,
            onChanged: (v) => onChanged(s.copyWith(enabled: v)),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(l.adjustSchoolDay),
            value: s.auto,
            onChanged: s.enabled ? (v) => onChanged(s.copyWith(auto: v)) : null,
          ),
          _SliderRow(
            label: l.warmth,
            value: s.warmth,
            onChanged: s.enabled && !s.auto ? (v) => onChanged(s.copyWith(warmth: v)) : null,
          ),
          _SliderRow(
            label: l.dimming,
            value: s.dim,
            onChanged: s.enabled && !s.auto ? (v) => onChanged(s.copyWith(dim: v)) : null,
          ),
          const Divider(),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(l.highContrast),
            subtitle: Text(l.highContrastHint),
            value: s.highContrast,
            onChanged: (v) => onChanged(s.copyWith(highContrast: v)),
          ),
          SwitchListTile(
            key: const Key('chalkboard'),
            contentPadding: EdgeInsets.zero,
            title: Text(l.bgChalkboard),
            subtitle: Text(l.chalkboardHint),
            value: chalkboard,
            onChanged: onChalkboard,
          ),
        ],
      ),
    );
  }
}

class _SliderRow extends StatelessWidget {
  const _SliderRow({required this.label, required this.value, required this.onChanged});

  final String label;
  final double value;
  final ValueChanged<double>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        // Wide enough for the Hindi and Kannada names.
        SizedBox(width: 112, child: Text(label, style: context.text.bodyLarge, maxLines: 2)),
        Expanded(
          child: Slider(value: value, onChanged: onChanged),
        ),
      ],
    );
  }
}
