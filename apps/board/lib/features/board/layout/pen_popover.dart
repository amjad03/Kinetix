import 'dart:math' as math;

import 'package:flutter/material.dart';
import '../pen_config/pen_config_screen.dart';
import '../pen_config/pen_config_strings.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../core/board_controller.dart';
import '../../../l10n/l10n.dart';
import '../ai_pen_ui.dart' show SnapShapesSwitch;
import '../chrome.dart';
import '../popovers.dart' show highlighterPalette, inkPalette;
import 'layout_strings.dart';
import 'pen_modes.dart';

/// The pen types of the pen popover (screen 2). Calligraphy, dashed and the arrow pen are the
/// pen (or the AI pen) with another nib.
enum PenType { pen, highlighter, aiPen, calligraphy, dashed, arrow, laser }

/// The last three colour and thickness pairs, shown as quick swatches.
class PenMemory extends ChangeNotifier {
  final List<(Color, double)> _recent = [];
  List<(Color, double)> get recent => List.unmodifiable(_recent);

  void remember(Color c, double w) {
    _recent.removeWhere((r) => r.$1 == c && r.$2 == w);
    _recent.insert(0, (c, w));
    if (_recent.length > 3) _recent.removeLast();
    notifyListeners();
  }
}

String penTypeName(AppLocalizations l, LayoutStrings s, PenType t) => switch (t) {
  PenType.pen => l.pen,
  PenType.highlighter => l.highlighter,
  PenType.aiPen => l.aiPen,
  PenType.calligraphy => s.calligraphy,
  PenType.dashed => s.dashed,
  PenType.arrow => s.arrowPen,
  PenType.laser => l.toolLaser,
};

IconData penTypeIcon(PenType t) => switch (t) {
  PenType.pen => Icons.edit_outlined,
  PenType.highlighter => Icons.border_color_outlined,
  PenType.aiPen => Icons.draw_outlined,
  PenType.calligraphy => Icons.history_edu,
  PenType.dashed => Icons.more_horiz,
  PenType.arrow => Icons.trending_flat,
  PenType.laser => Icons.flare,
};

/// The pen's options: type, thickness with a live preview, opacity, eight colours and a colour
/// wheel, smoothing, pressure, palm rejection, single or multi touch, and for the AI pen what it
/// converts and when. The AI pen shares every pen option.
class PenPopover extends StatefulWidget {
  const PenPopover({super.key, required this.wb, required this.board, required this.memory, this.primary = false, this.width = 480});

  final WhiteboardController wb;
  final BoardController board;
  final PenMemory memory;

  /// Primary boards have no AI pen and no laser.
  final bool primary;
  final double width;

  @override
  State<PenPopover> createState() => _PenPopoverState();
}

class _PenPopoverState extends State<PenPopover> {
  bool _wheel = false;

  /// Two Side's settings are open (the pen keeps writing meanwhile).
  bool _twoSide = false;

  WhiteboardController get wb => widget.wb;
  bool get _hl => wb.tool == BoardTool.highlighter;
  Color get _colour => _hl ? wb.highlighterColor : wb.penColor;
  double get _width => _hl ? wb.highlighterWidth : wb.penWidth;

  bool _isType(PenType t) => switch (t) {
    PenType.pen => wb.tool == BoardTool.pen && wb.penNib == PenNib.round,
    PenType.highlighter => wb.tool == BoardTool.highlighter,
    PenType.aiPen => wb.tool == BoardTool.aiPen,
    PenType.calligraphy => (wb.tool == BoardTool.pen || wb.tool == BoardTool.aiPen) && wb.penNib == PenNib.calligraphy,
    PenType.dashed => (wb.tool == BoardTool.pen || wb.tool == BoardTool.aiPen) && wb.penNib == PenNib.dashed,
    PenType.arrow => (wb.tool == BoardTool.pen || wb.tool == BoardTool.aiPen) && wb.penNib == PenNib.arrow,
    PenType.laser => wb.tool == BoardTool.laser,
  };

  void _pickType(PenType t) {
    final ai = wb.tool == BoardTool.aiPen;
    switch (t) {
      case PenType.pen:
        wb.penNib = PenNib.round;
        wb.tool = BoardTool.pen;
      case PenType.highlighter:
        wb.tool = BoardTool.highlighter;
      case PenType.aiPen:
        wb.tool = BoardTool.aiPen;
      case PenType.calligraphy || PenType.dashed || PenType.arrow:
        wb.penNib = switch (t) {
          PenType.calligraphy => PenNib.calligraphy,
          PenType.dashed => PenNib.dashed,
          _ => PenNib.arrow,
        };
        // The AI pen keeps every pen option: it stays the AI pen with the new nib.
        wb.tool = ai ? BoardTool.aiPen : BoardTool.pen;
      case PenType.laser:
        wb.tool = BoardTool.laser;
    }
    wb.update(() {});
  }

  void _set({Color? colour, double? width}) {
    if (colour != null && wb.selection.isNotEmpty) wb.recolorSelection(colour);
    final keep = wb.tool;
    if (_hl) {
      wb.setHighlighter(color: colour, width: width);
    } else {
      wb.setPen(color: colour, width: width);
      // setPen picks the pen; the AI pen and the laser stay as they were.
      if (keep == BoardTool.aiPen || keep == BoardTool.laser) wb.tool = keep;
    }
    widget.memory.remember(_colour, _width);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = LayoutStrings.of(context);
    final board = widget.board;
    final label = context.text.labelLarge?.copyWith(color: context.colors.onSurfaceVariant);
    return ListenableBuilder(
      listenable: Listenable.merge([wb, board, widget.memory]),
      builder: (context, _) {
        final types = [
          for (final t in PenType.values)
            if (!widget.primary || (t != PenType.aiPen && t != PenType.laser)) t,
        ];
        final palette = _hl ? highlighterPalette : inkPalette.take(8).toList();
        final opaque = _colour.withValues(alpha: 1);
        return PopoverCard(
          key: const Key('pen-popover'),
          title: l.pen,
          width: widget.width,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (!widget.primary) ...[
                PenModeBar(
                  mode: currentPenMode(wb, board, twoSide: _twoSide),
                  onPick: (m) {
                    setState(() => _twoSide = m == PenMode.twoSide);
                    pickPenMode(m, wb, board);
                  },
                ),
                const SizedBox(height: Kx.s12),
                if (_twoSide) ...[TwoSideSettings(wb: wb, board: board), const SizedBox(height: Kx.s12)],
                if (currentPenMode(wb, board) == PenMode.textAi) ...[TextAiSettings(board: board), const SizedBox(height: Kx.s12)],
                const Divider(height: Kx.s8),
              ],
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final t in types)
                    FilterChip(
                      key: Key('pen-type-${t.name}'),
                      avatar: Icon(penTypeIcon(t), size: 18),
                      label: Text(penTypeName(l, s, t)),
                      showCheckmark: false,
                      selected: _isType(t),
                      onSelected: (_) => _pickType(t),
                    ),
                ],
              ),
              if (wb.tool != BoardTool.laser) ...[
                const SizedBox(height: Kx.s12),
                Row(
                  children: [
                    Expanded(child: Text(s.preview, style: label)),
                    if (widget.memory.recent.isNotEmpty) ...[
                      Text(s.recentPens, style: label),
                      const SizedBox(width: Kx.s8),
                      for (final (i, r) in widget.memory.recent.indexed)
                        Padding(
                          padding: const EdgeInsets.only(left: 4),
                          child: RecentPenSwatch(key: Key('recent-pen-$i'), colour: r.$1, width: r.$2, onTap: () => _set(colour: r.$1, width: r.$2)),
                        ),
                    ],
                  ],
                ),
                const SizedBox(height: Kx.s8),
                Container(
                  key: const Key('pen-preview'),
                  height: 56,
                  decoration: BoxDecoration(color: wb.background.paper, borderRadius: BorderRadius.circular(Kx.rMd), border: Border.all(color: context.colors.outlineVariant)),
                  child: CustomPaint(painter: _PreviewPainter(colour: _colour, width: _width, nib: _hl ? PenNib.round : wb.penNib, highlighter: _hl, background: wb.background)),
                ),
                const SizedBox(height: Kx.s8),
                _slider(context, l.thickness, '${_width.round()} px', Slider(
                  key: const Key('pen-thickness'),
                  min: 1,
                  max: _hl ? 16 : 24,
                  value: _width.clamp(1, _hl ? 16 : 24).toDouble(),
                  onChanged: (v) => _set(width: v.roundToDouble()),
                )),
                _slider(context, s.opacity, '${(_colour.a * 100).round()}%', Slider(
                  key: const Key('pen-opacity'),
                  min: 0.2,
                  max: 1,
                  value: _colour.a.clamp(0.2, 1.0),
                  onChanged: (v) => _set(colour: _colour.withValues(alpha: v)),
                )),
                const SizedBox(height: Kx.s4),
                Text(l.colour, style: label),
                const SizedBox(height: Kx.s8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    for (final (i, c) in palette.indexed)
                      _Swatch(
                        key: Key('pen-colour-$i'),
                        colour: inkColorFor(c, wb.background),
                        selected: opaque == c,
                        onTap: () => _set(colour: c.withValues(alpha: _colour.a)),
                      ),
                    IconButton.outlined(
                      key: const Key('pen-colour-custom'),
                      tooltip: s.customColour,
                      isSelected: _wheel,
                      onPressed: () => setState(() => _wheel = !_wheel),
                      icon: const Icon(Icons.palette_outlined),
                    ),
                  ],
                ),
                if (_wheel) ...[
                  const SizedBox(height: Kx.s8),
                  ColourWheel(key: const Key('colour-wheel'), colour: opaque, onChanged: (c) => _set(colour: c.withValues(alpha: _colour.a))),
                ],
                if (!_hl) ...[
                  const SizedBox(height: Kx.s8),
                  _slider(context, s.smoothing, '${(wb.penSmoothing * 100).round()}%', Slider(
                    key: const Key('pen-smoothing'),
                    value: wb.penSmoothing,
                    onChanged: (v) => wb.update(() => wb.penSmoothing = v),
                  )),
                  SwitchListTile(
                    key: const Key('pen-pressure'),
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    title: Text(s.pressure),
                    value: wb.penPressure,
                    onChanged: (v) => wb.update(() => wb.penPressure = v),
                  ),
                ],
              ],
              SwitchListTile(
                key: const Key('pen-palm'),
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: Text(s.palmRejection),
                subtitle: Text(s.palmHint),
                value: board.palmRejection,
                onChanged: board.setPalmRejection,
              ),
              SegmentedButton<bool>(
                key: const Key('pen-touch'),
                showSelectedIcon: false,
                segments: [
                  ButtonSegment(value: false, icon: const Icon(Icons.touch_app_outlined), label: Text(s.singleTouch)),
                  ButtonSegment(value: true, icon: const Icon(Icons.groups_outlined), label: Text(s.multiTouch)),
                ],
                selected: {board.multiWriter},
                onSelectionChanged: (v) => board.setMultiTouch(v.single),
              ),
              TextButton.icon(
                key: const Key('pen-config-open'),
                onPressed: () => openPenConfig(context, board),
                icon: const Icon(Icons.tune),
                label: Text(PenConfigStrings.of(context)('penConfig')),
              ),
              if (wb.tool == BoardTool.aiPen) ...[
                const SizedBox(height: Kx.s12),
                Text('${l.aiPen} · ${s.aiConvert}', style: label),
                const SizedBox(height: Kx.s8),
                Wrap(
                  spacing: 6,
                  children: [
                    for (final (k, name) in [('shapes', s.aiShapes), ('maths', s.aiMaths), ('text', s.aiText)])
                      FilterChip(
                        key: Key('ai-convert-$k'),
                        label: Text(name),
                        selected: board.aiPenConvert.contains(k),
                        onSelected: (v) => board.setAiPenConvert(k, v),
                      ),
                  ],
                ),
                const SizedBox(height: Kx.s8),
                Text(s.aiWhen, style: label),
                const SizedBox(height: Kx.s8),
                SegmentedButton<AiPenMode>(
                  key: const Key('ai-pen-when'),
                  showSelectedIcon: false,
                  segments: [
                    ButtonSegment(value: AiPenMode.auto, label: Text(s.aiAuto, key: const Key('ai-pen-mode-auto'))),
                    ButtonSegment(value: AiPenMode.tap, label: Text(s.aiTap, key: const Key('ai-pen-mode-tap'))),
                  ],
                  selected: {board.aiPenMode == AiPenMode.tap ? AiPenMode.tap : AiPenMode.auto},
                  onSelectionChanged: (v) => board.setAiPenMode(v.single),
                ),
                const SizedBox(height: Kx.s8),
                SegmentedButton<BoardLanguage>(
                  key: const Key('ai-pen-language'),
                  showSelectedIcon: false,
                  segments: [for (final lang in BoardLanguage.values) ButtonSegment(value: lang, label: Text(lang.label))],
                  selected: {board.aiPenLanguage},
                  onSelectionChanged: (v) => board.setAiPenLanguage(v.single),
                ),
              ],
              if (wb.tool == BoardTool.pen) SnapShapesSwitch(board: board),
            ],
          ),
        );
      },
    );
  }

  Widget _slider(BuildContext context, String name, String value, Widget slider) => Row(
    children: [
      SizedBox(width: 110, child: Text(name, style: context.text.labelLarge, overflow: TextOverflow.ellipsis)),
      Expanded(child: slider),
      SizedBox(width: 52, child: Text(value, textAlign: TextAlign.end, style: context.text.labelMedium)),
    ],
  );
}

class _Swatch extends StatelessWidget {
  const _Swatch({super.key, required this.colour, required this.selected, required this.onTap});

  final Color colour;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkResponse(
    onTap: onTap,
    radius: 24,
    child: Container(
      width: 38,
      height: 38,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: selected ? context.colors.primary : Colors.transparent, width: 3),
      ),
      child: DecoratedBox(
        decoration: BoxDecoration(color: colour, shape: BoxShape.circle, border: Border.all(color: Colors.black26)),
        child: selected ? const Icon(Icons.check, size: 16, color: Colors.white) : null,
      ),
    ),
  );
}

/// A remembered colour and thickness: a dot as thick as the line, in its colour.
class RecentPenSwatch extends StatelessWidget {
  const RecentPenSwatch({super.key, required this.colour, required this.width, required this.onTap, this.size = 32});

  final Color colour;
  final double width;
  final VoidCallback onTap;
  final double size;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: '${width.round()} px',
    child: InkResponse(
      onTap: onTap,
      radius: size / 2 + 4,
      child: Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: context.colors.outlineVariant)),
        child: Container(
          width: (width * 1.4).clamp(6.0, size - 8),
          height: (width * 1.4).clamp(6.0, size - 8),
          decoration: BoxDecoration(color: colour, shape: BoxShape.circle),
        ),
      ),
    ),
  );
}

class _PreviewPainter extends CustomPainter {
  _PreviewPainter({required this.colour, required this.width, required this.nib, required this.highlighter, required this.background});

  final Color colour;
  final double width;
  final PenNib nib;
  final bool highlighter;
  final BoardBackground background;

  @override
  void paint(Canvas canvas, Size size) {
    final pts = [
      for (var i = 0; i <= 24; i++)
        InkPoint(24 + (size.width - 48) * i / 24, size.height / 2 + math.sin(i / 24 * math.pi * 2) * size.height * 0.22),
    ];
    paintStroke(
      canvas,
      Stroke(
        id: 'preview',
        style: InkStyle(tool: highlighter ? InkTool.highlighter : InkTool.pen, color: colour, width: width, nib: nib),
        points: pts,
      ),
      background,
    );
  }

  @override
  bool shouldRepaint(_PreviewPainter old) => old.colour != colour || old.width != width || old.nib != nib || old.background != background;
}

/// A colour wheel: hue round the circle, strength out from the centre, and a lightness slider.
class ColourWheel extends StatefulWidget {
  const ColourWheel({super.key, required this.colour, required this.onChanged, this.size = 168});

  final Color colour;
  final ValueChanged<Color> onChanged;
  final double size;

  @override
  State<ColourWheel> createState() => _ColourWheelState();
}

class _ColourWheelState extends State<ColourWheel> {
  late HSVColor _hsv = HSVColor.fromColor(widget.colour);

  void _at(Offset p) {
    final r = widget.size / 2;
    final d = p - Offset(r, r);
    final hue = (math.atan2(d.dy, d.dx) * 180 / math.pi + 360) % 360;
    final sat = (d.distance / r).clamp(0.0, 1.0);
    setState(() => _hsv = _hsv.withHue(hue).withSaturation(sat));
    widget.onChanged(_hsv.toColor());
  }

  @override
  Widget build(BuildContext context) {
    final s = LayoutStrings.of(context);
    return Row(
      children: [
        GestureDetector(
          key: const Key('colour-wheel-disc'),
          onTapDown: (d) => _at(d.localPosition),
          onPanUpdate: (d) => _at(d.localPosition),
          child: CustomPaint(size: Size.square(widget.size), painter: _WheelPainter(_hsv)),
        ),
        const SizedBox(width: Kx.s12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(s.lightness, style: context.text.labelLarge),
              Slider(
                key: const Key('colour-wheel-value'),
                value: _hsv.value,
                onChanged: (v) {
                  setState(() => _hsv = _hsv.withValue(v));
                  widget.onChanged(_hsv.toColor());
                },
              ),
              Container(width: 48, height: 32, decoration: BoxDecoration(color: _hsv.toColor(), borderRadius: BorderRadius.circular(Kx.rSm), border: Border.all(color: Colors.black26))),
            ],
          ),
        ),
      ],
    );
  }
}

class _WheelPainter extends CustomPainter {
  _WheelPainter(this.hsv);

  final HSVColor hsv;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.shortestSide / 2;
    final rect = Rect.fromCircle(center: c, radius: r);
    canvas.drawCircle(
      c,
      r,
      Paint()
        ..shader = SweepGradient(colors: [for (var h = 0; h <= 360; h += 60) HSVColor.fromAHSV(1, h % 360.0, 1, hsv.value).toColor()]).createShader(rect),
    );
    canvas.drawCircle(
      c,
      r,
      Paint()..shader = RadialGradient(colors: [HSVColor.fromAHSV(1, 0, 0, hsv.value).toColor(), HSVColor.fromAHSV(1, 0, 0, hsv.value).toColor().withValues(alpha: 0)]).createShader(rect),
    );
    final a = hsv.hue * math.pi / 180;
    final at = c + Offset(math.cos(a), math.sin(a)) * r * hsv.saturation;
    canvas.drawCircle(at, 9, Paint()..color = Colors.white..style = PaintingStyle.stroke..strokeWidth = 3);
    canvas.drawCircle(at, 9, Paint()..color = Colors.black54..style = PaintingStyle.stroke..strokeWidth = 1);
  }

  @override
  bool shouldRepaint(_WheelPainter old) => old.hsv != hsv;
}
