import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';
import 'chrome.dart';
import 'popovers.dart';

/// The bar floating above a selection: colour, line width and style, fill, measurements (on
/// and off, which ones, units), the shape's points and arrow heads, order, flips, align, group,
/// lock, copy, paste, duplicate and delete; "Open" for a picture of a 3D model or lab; "Read
/// with AI" for what is selected; "Solve" for an equation; the AI pen's readings of something
/// it converted, or converting selected ink. On a phone it is a compact bar with the rest under
/// "More".
class SelectionActions extends StatelessWidget {
  const SelectionActions({
    super.key,
    required this.wb,
    required this.box,
    this.onOpenLink,
    this.onEdit,
    this.onAskAi,
    this.onSolve,
    this.onConvertInk,
    this.onReadings,
    this.onReadAloud,
    this.onMeasureUnit,
  });

  final WhiteboardController wb;

  /// The selection's box on screen.
  final Rect box;

  /// Opens the 3D model or lab a picture is a snapshot of.
  final void Function(EmbedLink link)? onOpenLink;

  /// Edits the selected equation, note or text.
  final void Function(BoardElement e)? onEdit;

  /// Reads what is selected with KINETIX AI.
  final VoidCallback? onAskAi;

  /// Sends the selected equation to the maths solver.
  final void Function(MathElement e)? onSolve;

  /// Converts the selected ink with the AI pen.
  final VoidCallback? onConvertInk;

  /// Shows the AI pen's readings of [e], when the AI pen made it (null otherwise).
  final VoidCallback? Function(BoardElement e)? onReadings;

  /// Reads the selected text aloud in the immersive reader (null when nothing selected has text).
  final VoidCallback? onReadAloud;

  /// Keeps the measurement units the teacher picked (the board's setting); without it the
  /// units change on this board only.
  final void Function(MeasureUnit unit)? onMeasureUnit;

  /// Below this width the bar is compact.
  static const compactWidth = 600.0;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final els = wb.selectedElements;
    if (els.isEmpty) return const SizedBox.shrink();
    final size = MediaQuery.sizeOf(context);
    final compact = size.width < compactWidth;
    final single = els.length == 1 ? els.single : null;
    final link = single is ImageElement ? single.link : null;
    final editable = single is MathElement || single is NoteElement || single is TextElement || single is SheetElement;
    final readings = single == null ? null : onReadings?.call(single);
    final locked = wb.selectionLocked;
    final strokes = els.any((e) => e is Stroke && e.style.tool != InkTool.highlighter);
    final widthable = els.any((e) => e is Stroke || e is PolygonElement);
    final measure = wb.selectionMeasure;
    final ends = wb.selectionArrowEnds;

    Widget btn(IconData icon, String label, VoidCallback f, {Key? key, bool text = false, bool ai = false, bool on = false}) => Tooltip(
      message: label,
      child: InkWell(
        key: key,
        borderRadius: BorderRadius.circular(Kx.rFull),
        onTap: f,
        child: Container(
          constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
          padding: EdgeInsets.symmetric(horizontal: text ? 12 : 10, vertical: 10),
          decoration: on ? BoxDecoration(color: context.colors.secondaryContainer, borderRadius: BorderRadius.circular(Kx.rFull)) : null,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 22, color: ai ? context.colors.tertiary : (on ? context.colors.onSecondaryContainer : context.colors.onSurfaceVariant)),
              if (text) ...[const SizedBox(width: 6), Text(label, style: context.text.labelLarge)],
            ],
          ),
        ),
      ),
    );
    // A button that opens a menu under itself.
    Widget menuBtn(IconData icon, String label, List<PopupMenuEntry<VoidCallback>> Function() items, {Key? key, bool on = false}) =>
        Builder(builder: (ctx) => btn(icon, label, () => _menu(ctx, items()), key: key, on: on));
    Widget gap() => Container(width: 1, height: 24, color: context.colors.outlineVariant, margin: const EdgeInsets.symmetric(horizontal: 4));
    PopupMenuEntry<VoidCallback> check(String label, bool on, VoidCallback f, {Key? key}) =>
        CheckedPopupMenuItem<VoidCallback>(key: key, value: f, checked: on, child: Text(label));

    final measureToggle = wb.selectionMeasurable && !locked
        ? btn(
            measure.any ? Icons.straighten : Icons.straighten_outlined,
            measure.any ? l.selHideMeasurements : l.selShowMeasurements,
            () => wb.setSelectionMeasure(measure.any ? ShapeMeasure.none : ShapeMeasure.all),
            key: const Key('sel-measure'),
            on: measure.any,
          )
        : null;
    List<PopupMenuEntry<VoidCallback>> measureItems() => [
      check(l.selMeasureLengths, measure.lengths, () => wb.setSelectionMeasure(measure.copyWith(lengths: !measure.lengths)), key: const Key('sel-m-lengths')),
      check(l.selMeasureAngles, measure.angles, () => wb.setSelectionMeasure(measure.copyWith(angles: !measure.angles)), key: const Key('sel-m-angles')),
      check(l.selMeasureRadius, measure.radius, () => wb.setSelectionMeasure(measure.copyWith(radius: !measure.radius)), key: const Key('sel-m-radius')),
      check(l.selMeasureArea, measure.area, () => wb.setSelectionMeasure(measure.copyWith(area: !measure.area)), key: const Key('sel-m-area')),
      const PopupMenuDivider(),
      for (final u in MeasureUnit.values)
        check(u == MeasureUnit.cm ? l.measureUnitCm : l.measureUnitPx, wb.measureUnit == u, () {
          wb.measureUnit = u;
          onMeasureUnit?.call(u);
        }, key: Key('sel-unit-${u.name}')),
    ];
    final measureMenu = wb.selectionMeasurable && !locked ? menuBtn(Icons.tune, l.selMeasureOptions, measureItems, key: const Key('sel-measure-options')) : null;

    // What the selection is: opening, AI, solving, editing.
    final context_ = <Widget>[
      if (link != null && onOpenLink != null)
        btn(
          link.kind == EmbedLink.lab ? Icons.science_outlined : Icons.view_in_ar_outlined,
          link.kind == EmbedLink.lab ? l.openLab : l.openModel,
          () => onOpenLink!(link),
          key: const Key('sel-open'),
          text: !compact,
        ),
      if (onAskAi != null) btn(Icons.auto_awesome, l.readWithAi, onAskAi!, key: const Key('sel-ai'), text: !compact, ai: true),
      if (single is MathElement && onSolve != null) btn(Icons.calculate_outlined, l.mathSolve, () => onSolve!(single), key: const Key('sel-solve'), text: !compact),
      if (readings != null) btn(Icons.auto_awesome_outlined, l.aiPenReadings, readings, key: const Key('sel-readings'), ai: true),
      if (onConvertInk != null && els.any(isPenInk)) btn(Icons.draw_outlined, l.aiPenConvertInk, onConvertInk!, key: const Key('sel-convert'), ai: true),
      if (editable && onEdit != null && !locked) btn(Icons.edit_outlined, l.edit, () => onEdit!(single!), key: const Key('sel-edit')),
      if (onReadAloud != null) btn(Icons.record_voice_over_outlined, l.readAloud, onReadAloud!, key: const Key('sel-read-aloud')),
    ];

    // How it looks.
    final style = <Widget>[
      if (!locked) Builder(builder: (ctx) => btn(Icons.palette_outlined, l.colour, () => _pickColour(ctx), key: const Key('sel-colour'))),
      if (widthable && !locked)
        menuBtn(Icons.line_weight, l.selLineWidth, () {
          final now = wb.selectionWidth;
          return [
            for (final w in const [2.0, 4.0, 6.0, 10.0, 16.0])
              CheckedPopupMenuItem<VoidCallback>(
                key: Key('sel-width-${w.round()}'),
                value: () => wb.setSelectionWidth(w),
                checked: now == w,
                child: Container(width: 72, height: w, decoration: BoxDecoration(color: context.colors.onSurface, borderRadius: BorderRadius.circular(w))),
              ),
          ];
        }, key: const Key('sel-width')),
      if (strokes && !locked)
        menuBtn(Icons.line_style, l.selLineStyle, () {
          final now = wb.selectionLineStyle;
          return [
            check(l.selLineSolid, now == PenNib.round, () => wb.setSelectionLineStyle(PenNib.round), key: const Key('sel-line-solid')),
            check(l.selLineDashed, now == PenNib.dashed, () => wb.setSelectionLineStyle(PenNib.dashed), key: const Key('sel-line-dashed')),
            check(l.selLineDotted, now == PenNib.dotted, () => wb.setSelectionLineStyle(PenNib.dotted), key: const Key('sel-line-dotted')),
          ];
        }, key: const Key('sel-line-style')),
      if (wb.selectionFillable && !locked)
        btn(
          wb.selectionFilled ? Icons.format_color_reset_outlined : Icons.format_color_fill,
          wb.selectionFilled ? l.noFill : l.fill,
          () => wb.setSelectionFill(!wb.selectionFilled),
          key: const Key('sel-fill'),
        ),
      ?measureToggle,
      if (measure.any) ?measureMenu,
      if (wb.canEditPoints) btn(Icons.polyline_outlined, l.selEditPoints, () => wb.editingPoints = !wb.editingPoints, key: const Key('sel-edit-points'), on: wb.editingPoints),
      if (ends != null && !locked)
        menuBtn(Icons.arrow_right_alt, l.selArrowHeads, () {
          final filled = wb.selectionFilledHead;
          return [
            for (final (e, label) in [
              (ArrowEnds.none, l.selArrowNone),
              (ArrowEnds.end, l.selArrowEnd),
              (ArrowEnds.start, l.selArrowStart),
              (ArrowEnds.both, l.selArrowBoth),
            ])
              check(label, ends == e, () => wb.setSelectionArrowEnds(e), key: Key('sel-arrow-${e.name}')),
            const PopupMenuDivider(),
            check(l.selArrowFilled, filled, () => wb.setSelectionFilledHead(!filled), key: const Key('sel-arrow-filled')),
          ];
        }, key: const Key('sel-arrow')),
    ];

    // Where it sits.
    final arrange = <Widget>[
      if (!locked) ...[
        btn(Icons.flip_to_front, l.bringToFront, wb.bringSelectionToFront, key: const Key('sel-front')),
        btn(Icons.flip_to_back, l.sendToBack, wb.sendSelectionToBack, key: const Key('sel-back')),
        btn(Icons.flip, l.selFlipH, () => wb.flipSelection(horizontal: true), key: const Key('sel-flip-h')),
        Transform.rotate(
          angle: 1.5708,
          child: btn(Icons.flip, l.selFlipV, () => wb.flipSelection(horizontal: false), key: const Key('sel-flip-v')),
        ),
        if (els.length > 1)
          menuBtn(Icons.align_horizontal_left, l.selAlign, () => [
            for (final (a, label) in [
              (BoardAlign.left, l.selAlignLeft),
              (BoardAlign.centre, l.selAlignCentre),
              (BoardAlign.right, l.selAlignRight),
              (BoardAlign.top, l.selAlignTop),
              (BoardAlign.middle, l.selAlignMiddle),
              (BoardAlign.bottom, l.selAlignBottom),
            ])
              PopupMenuItem<VoidCallback>(key: Key('sel-align-${a.name}'), value: () => wb.alignSelection(a), child: Text(label)),
          ], key: const Key('sel-align')),
        btn(
          wb.lockAspect ? Icons.lock_outline : Icons.lock_open_outlined,
          l.selKeepProportions,
          () => wb.update(() => wb.lockAspect = !wb.lockAspect),
          key: const Key('sel-aspect'),
          on: wb.lockAspect,
        ),
      ],
      if (els.length > 1)
        wb.selectionGrouped
            ? btn(Icons.layers_clear_outlined, l.ungroup, wb.ungroupSelection, key: const Key('sel-ungroup'))
            : btn(Icons.layers_outlined, l.group, wb.groupSelection, key: const Key('sel-group')),
      btn(locked ? Icons.lock : Icons.lock_person_outlined, locked ? l.selUnlock : l.selLock, () => wb.setSelectionLocked(!locked), key: const Key('sel-lock'), on: locked),
    ];

    final copy = <Widget>[
      btn(Icons.content_copy, l.copy, wb.copySelection, key: const Key('sel-copy')),
      if (wb.canPaste) btn(Icons.content_paste, l.paste, wb.paste, key: const Key('sel-paste')),
      btn(Icons.copy_all_outlined, l.duplicate, wb.duplicateSelection, key: const Key('sel-duplicate')),
      if (!locked) btn(Icons.delete_outline, l.deleteSelection(els.length), wb.deleteSelection, key: const Key('delete-selection')),
    ];

    final List<Widget> row;
    if (compact) {
      // The phone: what is about this selection, colour, measurements, duplicate and delete;
      // the rest under More.
      row = [
        ...context_.take(2),
        if (!locked) style.first,
        ?measureToggle,
        btn(Icons.copy_all_outlined, l.duplicate, wb.duplicateSelection, key: const Key('sel-duplicate')),
        if (!locked) btn(Icons.delete_outline, l.deleteSelection(els.length), wb.deleteSelection, key: const Key('delete-selection')),
        Builder(
          builder: (ctx) => btn(Icons.more_horiz, l.selMore, () => _more(ctx, l), key: const Key('sel-more')),
        ),
      ];
    } else {
      row = [
        ...context_,
        if (context_.isNotEmpty) gap(),
        ...style,
        gap(),
        ...arrange,
        gap(),
        ...copy,
      ];
    }
    final bar = ChromeSurface(
      radius: Kx.rFull,
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      child: Row(mainAxisSize: MainAxisSize.min, children: row),
    );
    // Above the selection, clear of its turn knob and angle readout; below it without room.
    const barH = 52.0, clearance = 96.0;
    final above = box.top - clearance - barH;
    final top = above >= 64 ? above : box.bottom + 24;
    return Stack(
      children: [
        Positioned(
          top: top.clamp(8.0, size.height - barH - 8),
          left: 8,
          right: 8,
          child: Align(
            alignment: Alignment((box.center.dx / size.width * 2 - 1).clamp(-1.0, 1.0), 0),
            child: FittedBox(child: BoardChromeTheme(child: bar)),
          ),
        ),
      ],
    );
  }

  Future<void> _menu(BuildContext context, List<PopupMenuEntry<VoidCallback>> items) async {
    final box = context.findRenderObject() as RenderBox?;
    final overlay = Overlay.of(context).context.findRenderObject() as RenderBox?;
    if (box == null || overlay == null) return;
    final at = box.localToGlobal(Offset.zero, ancestor: overlay);
    final f = await showMenu<VoidCallback>(context: context, position: RelativeRect.fromRect(at & box.size, Offset.zero & overlay.size), items: items);
    f?.call();
  }

  /// The phone's More: everything the compact bar leaves out.
  void _more(BuildContext context, AppLocalizations l) {
    final els = wb.selectedElements;
    final locked = wb.selectionLocked;
    final measure = wb.selectionMeasure;
    PopupMenuItem<VoidCallback> item(IconData icon, String label, VoidCallback f, {Key? key}) => PopupMenuItem<VoidCallback>(
      key: key,
      value: f,
      child: Row(children: [Icon(icon, size: 20), const SizedBox(width: 12), Flexible(child: Text(label))]),
    );
    unawaited(
      _menu(context, [
        if (!locked && els.any((e) => e is Stroke || e is PolygonElement)) ...[
          for (final w in const [2.0, 6.0, 12.0]) item(Icons.line_weight, '${l.selLineWidth} ${w.round()}', () => wb.setSelectionWidth(w), key: Key('more-width-${w.round()}')),
          item(Icons.line_style, '${l.selLineStyle}: ${l.selLineDashed}', () => wb.setSelectionLineStyle(PenNib.dashed), key: const Key('more-dashed')),
          item(Icons.horizontal_rule, '${l.selLineStyle}: ${l.selLineSolid}', () => wb.setSelectionLineStyle(PenNib.round), key: const Key('more-solid')),
        ],
        if (wb.selectionFillable && !locked)
          item(Icons.format_color_fill, wb.selectionFilled ? l.noFill : l.fill, () => wb.setSelectionFill(!wb.selectionFilled), key: const Key('more-fill')),
        if (wb.selectionMeasurable && !locked)
          for (final (on, label, next) in [
            (measure.lengths, l.selMeasureLengths, measure.copyWith(lengths: !measure.lengths)),
            (measure.angles, l.selMeasureAngles, measure.copyWith(angles: !measure.angles)),
            (measure.radius, l.selMeasureRadius, measure.copyWith(radius: !measure.radius)),
            (measure.area, l.selMeasureArea, measure.copyWith(area: !measure.area)),
          ])
            CheckedPopupMenuItem<VoidCallback>(value: () => wb.setSelectionMeasure(next), checked: on, child: Text(label)),
        if (wb.canEditPoints) item(Icons.polyline_outlined, l.selEditPoints, () => wb.editingPoints = !wb.editingPoints, key: const Key('more-edit-points')),
        if (wb.selectionArrowEnds != null && !locked) ...[
          item(Icons.arrow_right_alt, l.selArrowEnd, () => wb.setSelectionArrowEnds(ArrowEnds.end)),
          item(Icons.arrow_left, l.selArrowStart, () => wb.setSelectionArrowEnds(ArrowEnds.start)),
          item(Icons.swap_horiz, l.selArrowBoth, () => wb.setSelectionArrowEnds(ArrowEnds.both)),
          item(Icons.horizontal_rule, l.selArrowNone, () => wb.setSelectionArrowEnds(ArrowEnds.none)),
        ],
        if (!locked) ...[
          item(Icons.flip_to_front, l.bringToFront, wb.bringSelectionToFront),
          item(Icons.flip_to_back, l.sendToBack, wb.sendSelectionToBack),
          item(Icons.flip, l.selFlipH, () => wb.flipSelection(horizontal: true), key: const Key('more-flip-h')),
          item(Icons.flip, l.selFlipV, () => wb.flipSelection(horizontal: false), key: const Key('more-flip-v')),
          if (els.length > 1) ...[
            item(Icons.align_horizontal_left, '${l.selAlign}: ${l.selAlignLeft}', () => wb.alignSelection(BoardAlign.left)),
            item(Icons.align_horizontal_center, '${l.selAlign}: ${l.selAlignCentre}', () => wb.alignSelection(BoardAlign.centre)),
            item(Icons.align_vertical_top, '${l.selAlign}: ${l.selAlignTop}', () => wb.alignSelection(BoardAlign.top)),
          ],
        ],
        if (els.length > 1)
          wb.selectionGrouped ? item(Icons.layers_clear_outlined, l.ungroup, wb.ungroupSelection) : item(Icons.layers_outlined, l.group, wb.groupSelection),
        item(locked ? Icons.lock_open_outlined : Icons.lock_outline, locked ? l.selUnlock : l.selLock, () => wb.setSelectionLocked(!locked), key: const Key('more-lock')),
        item(Icons.content_copy, l.copy, wb.copySelection),
        if (wb.canPaste) item(Icons.content_paste, l.paste, wb.paste),
      ]),
    );
  }

  void _pickColour(BuildContext context) {
    final box = context.findRenderObject() as RenderBox?;
    final overlay = Overlay.of(context).context.findRenderObject() as RenderBox?;
    if (box == null || overlay == null) return;
    final at = box.localToGlobal(Offset.zero, ancestor: overlay);
    showMenu<Color>(
      context: context,
      position: RelativeRect.fromRect(at & box.size, Offset.zero & overlay.size),
      items: [
        PopupMenuItem<Color>(
          enabled: false,
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final c in inkPalette)
                InkResponse(
                  onTap: () {
                    wb.recolorSelection(c);
                    Navigator.pop(context);
                  },
                  child: Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(color: inkColorFor(c, wb.background), shape: BoxShape.circle, border: Border.all(color: Colors.black12)),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

