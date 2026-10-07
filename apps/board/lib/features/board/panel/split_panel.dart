import 'package:flutter/gestures.dart' show DragStartBehavior;
import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../l10n/l10n.dart';
import '../../extras/board_extras.dart' show extrasStrings;
import '../../phet/phet_strings.dart';
import '../layout/layout_strings.dart';

/// The split panel's tabs (docs/design/board-wireframes.html, screen 3).
enum PanelTab { ai, model3d, labs, videos, books, kit, animations, sims, camera, web }

extension PanelTabInfo on PanelTab {
  String label(LayoutStrings s) => switch (this) {
    PanelTab.ai => s.tabAi,
    PanelTab.model3d => s.tab3d,
    PanelTab.labs => s.tabLabs,
    PanelTab.videos => s.tabVideos,
    PanelTab.books => s.tabBooks,
    PanelTab.kit => s.tabKit,
    PanelTab.animations => s.tabAnimations,
    PanelTab.sims => PhetStrings(s.lang).tab,
    PanelTab.camera => extrasStrings(s.lang)['tabCamera'],
    PanelTab.web => extrasStrings(s.lang)['tabWeb'],
  };

  IconData get icon => switch (this) {
    PanelTab.ai => Icons.auto_awesome,
    PanelTab.model3d => Icons.view_in_ar_outlined,
    PanelTab.labs => Icons.science_outlined,
    PanelTab.videos => Icons.smart_display_outlined,
    PanelTab.books => Icons.menu_book_outlined,
    PanelTab.kit => Icons.backpack_outlined,
    PanelTab.animations => Icons.animation,
    PanelTab.sims => Icons.science,
    PanelTab.camera => Icons.document_scanner_outlined,
    PanelTab.web => Icons.travel_explore,
  };
}

/// How the panel sits: beside the board (a share of its width), across all of it, or (on a
/// phone held upright) as a sheet over the lower part of the board.
enum PanelMode { side, full, sheet }

/// Panel widths as a share of the screen: opens at 42 %, the divider drags between 30 % and 60 %.
const panelDefault = 0.42, panelMin = 0.30, panelMax = 0.60;

/// The split panel: its tabs, ⤢ full width, ✕ close, an optional "Add to board", and its
/// body. The board stays live beside it; [writeOnPanel] puts a layer over the body that the
/// pen and the laser write on.
class SplitPanelFrame extends StatelessWidget {
  const SplitPanelFrame({
    super.key,
    required this.tab,
    required this.onTab,
    required this.mode,
    required this.onFull,
    required this.onClose,
    required this.child,
    this.onAddToBoard,
    this.writeOnPanel = false,
    this.onWriteOnPanel,
    this.inkLayer,
    this.onSheetDrag,
    this.onSheetDragEnd,
  });

  /// The tab showing (null for a tool or a dialog that has no tab).
  final PanelTab? tab;
  final ValueChanged<PanelTab> onTab;
  final PanelMode mode;
  final VoidCallback onFull;
  final VoidCallback onClose;
  final Widget child;
  final VoidCallback? onAddToBoard;
  final bool writeOnPanel;
  final VoidCallback? onWriteOnPanel;

  /// The layer the pen writes on over the body, while [writeOnPanel].
  final Widget? inkLayer;

  /// A phone's sheet: the grabber drags it up and down (in pixels), and lets go.
  final ValueChanged<double>? onSheetDrag;
  final VoidCallback? onSheetDragEnd;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final s = LayoutStrings.of(context);
    final l = context.l10n;
    final sheet = mode == PanelMode.sheet;
    final header = Material(
      color: c.surfaceContainerLow,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Kx.s4, vertical: Kx.s4),
        child: Row(
          children: [
            Expanded(
              child: SingleChildScrollView(
                key: const Key('panel-tabs'),
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final t in PanelTab.values)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 2),
                        child: ChoiceChip(
                          key: Key('panel-tab-${t.name}'),
                          avatar: Icon(t.icon, size: 18),
                          label: Text(t.label(s)),
                          showCheckmark: false,
                          selected: tab == t,
                          visualDensity: VisualDensity.compact,
                          onSelected: (_) => onTab(t),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            if (onAddToBoard != null)
              Padding(
                padding: const EdgeInsets.only(left: Kx.s4),
                child: sheet
                    ? IconButton.filledTonal(key: const Key('add-to-board'), tooltip: s.addToBoard, onPressed: onAddToBoard, icon: const Icon(Icons.add_photo_alternate_outlined))
                    : FilledButton.tonalIcon(
                        key: const Key('add-to-board'),
                        onPressed: onAddToBoard,
                        icon: const Icon(Icons.add_photo_alternate_outlined),
                        label: Text(s.addToBoard),
                      ),
              ),
            if (onWriteOnPanel != null)
              IconButton(
                key: const Key('panel-write'),
                tooltip: s.writeOnPanel,
                isSelected: writeOnPanel,
                onPressed: onWriteOnPanel,
                icon: const Icon(Icons.edit_outlined),
                selectedIcon: const Icon(Icons.edit),
              ),
            if (!sheet)
              IconButton(
                key: const Key('panel-full'),
                tooltip: mode == PanelMode.full ? s.besideBoard : s.fullWidth,
                onPressed: onFull,
                icon: Icon(mode == PanelMode.full ? Icons.close_fullscreen : Icons.open_in_full),
              ),
            IconButton(key: const Key('panel-close'), tooltip: l.close, onPressed: onClose, icon: const Icon(Icons.close)),
          ],
        ),
      ),
    );
    return Material(
      key: const Key('split-panel'),
      elevation: 8,
      color: c.surface,
      borderRadius: sheet ? const BorderRadius.vertical(top: Radius.circular(Kx.rXl)) : null,
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (sheet)
            GestureDetector(
              key: const Key('panel-grabber'),
              behavior: HitTestBehavior.opaque,
              onVerticalDragUpdate: (d) => onSheetDrag?.call(d.delta.dy),
              onVerticalDragEnd: (_) => onSheetDragEnd?.call(),
              child: SizedBox(
                height: 20,
                child: Center(
                  child: Container(width: 40, height: 4, decoration: BoxDecoration(color: c.outline, borderRadius: BorderRadius.circular(2))),
                ),
              ),
            ),
          header,
          const Divider(height: 1),
          Expanded(
            child: Stack(
              children: [
                Positioned.fill(child: child),
                if (writeOnPanel && inkLayer != null) Positioned.fill(child: inkLayer!),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// The panel's width snaps to these shares of the screen when let go near one.
const panelSnaps = [panelMin, 0.4, 0.5, panelMax];

/// [fraction] snapped to the nearest of [panelSnaps] within 3 %, and kept within 30–60 %.
double snapPanelFraction(double fraction) {
  final f = fraction.clamp(panelMin, panelMax);
  for (final s in panelSnaps) {
    if ((f - s).abs() <= 0.03) return s;
  }
  return f;
}

/// The width of the bar between the board and the panel: a 24 px touch target (the grip
/// drawn in it is narrower).
const panelDividerWidth = 24.0;

/// The bar between the board and the panel: drag it (a finger, a pen or the mouse) to share
/// the width (30–60 %); it snaps to 30 %, 40 %, half and 60 % when let go near one.
class PanelDivider extends StatefulWidget {
  const PanelDivider({super.key, required this.onDrag, this.onDragEnd});

  /// How far it moved, in logical pixels (to the right is positive).
  final ValueChanged<double> onDrag;
  final VoidCallback? onDragEnd;

  @override
  State<PanelDivider> createState() => _PanelDividerState();
}

class _PanelDividerState extends State<PanelDivider> {
  bool _active = false;
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final on = _active || _hover;
    return Semantics(
      label: LayoutStrings.of(context).dragDivider,
      slider: true,
      child: MouseRegion(
        cursor: SystemMouseCursors.resizeColumn,
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        child: GestureDetector(
          key: const Key('panel-divider'),
          behavior: HitTestBehavior.opaque,
          // The drag starts where the finger went down, so the bar follows it exactly.
          dragStartBehavior: DragStartBehavior.down,
          onHorizontalDragStart: (_) => setState(() => _active = true),
          onHorizontalDragUpdate: (d) => widget.onDrag(d.delta.dx),
          onHorizontalDragEnd: (_) {
            setState(() => _active = false);
            widget.onDragEnd?.call();
          },
          onHorizontalDragCancel: () => setState(() => _active = false),
          child: Container(
            width: panelDividerWidth,
            color: c.surfaceContainerHigh,
            alignment: Alignment.center,
            child: AnimatedContainer(
              duration: Kx.fast,
              width: on ? 6 : 4,
              height: on ? 72 : 48,
              decoration: BoxDecoration(color: on ? c.primary : c.outline, borderRadius: BorderRadius.circular(3)),
            ),
          ),
        ),
      ),
    );
  }
}

/// Over the panel's body while "Write on the panel" is on: the pen writes (on the panel's
/// own layer, cleared with the panel), the laser points, and the eraser rubs out.
class PanelInkLayer extends StatefulWidget {
  const PanelInkLayer({super.key, required this.ink, required this.wb});

  final InkController ink;
  final WhiteboardController wb;

  @override
  State<PanelInkLayer> createState() => _PanelInkLayerState();
}

class _PanelInkLayerState extends State<PanelInkLayer> {
  final _laser = <(Offset, DateTime)>[];

  @override
  Widget build(BuildContext context) {
    final wb = widget.wb;
    return ListenableBuilder(
      listenable: wb,
      builder: (context, _) {
        if (wb.tool == BoardTool.laser) {
          return GestureDetector(
            key: const Key('panel-laser'),
            behavior: HitTestBehavior.opaque,
            onPanUpdate: (d) => setState(() {
              final now = DateTime.now();
              _laser
                ..add((d.localPosition, now))
                ..removeWhere((p) => now.difference(p.$2) > const Duration(milliseconds: 900));
            }),
            onPanEnd: (_) => Future.delayed(const Duration(milliseconds: 950), () {
              if (mounted) setState(_laser.clear);
            }),
            child: CustomPaint(painter: _LaserPainter(List.of(_laser)), size: Size.infinite),
          );
        }
        final hl = wb.tool == BoardTool.highlighter;
        final style = InkStyle(
          tool: wb.tool == BoardTool.eraser ? InkTool.eraser : (hl ? InkTool.highlighter : InkTool.pen),
          color: hl ? wb.highlighterColor : wb.penColor,
          width: hl ? wb.highlighterWidth : wb.penWidth,
        );
        final now = widget.ink.style;
        if (now.tool != style.tool || now.color != style.color || now.width != style.width) widget.ink.style = style;
        return InkCanvas(key: const Key('panel-ink'), controller: widget.ink, background: BoardBackground.plain, transparent: true);
      },
    );
  }
}

class _LaserPainter extends CustomPainter {
  _LaserPainter(this.points);

  final List<(Offset, DateTime)> points;

  @override
  void paint(Canvas canvas, Size size) {
    for (var i = 1; i < points.length; i++) {
      canvas.drawLine(
        points[i - 1].$1,
        points[i].$1,
        Paint()
          ..color = const Color(0xFFFF1744).withValues(alpha: 0.3 + 0.7 * i / points.length)
          ..strokeWidth = 6
          ..strokeCap = StrokeCap.round,
      );
    }
    if (points.isNotEmpty) canvas.drawCircle(points.last.$1, 8, Paint()..color = const Color(0xFFFF1744));
  }

  @override
  bool shouldRepaint(_LaserPainter old) => true;
}
