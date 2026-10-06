import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../l10n/l10n.dart';
import '../../insert/device_files.dart';
import '../chrome.dart';
import '../popovers.dart' show backgroundName;
import 'layout_strings.dart';

/// The papers in the Templates tab, in the wireframe's order (screen 10).
const templateBackgrounds = [
  BoardBackground.plain,
  BoardBackground.grid,
  BoardBackground.graph,
  BoardBackground.ruled,
  BoardBackground.dots,
  BoardBackground.fourLine,
  BoardBackground.kannadaLines,
  BoardBackground.musicStaff,
  BoardBackground.isometric,
  BoardBackground.ledger,
  BoardBackground.journal,
  BoardBackground.indiaMap,
  BoardBackground.worldMap,
  BoardBackground.twoColumns,
  BoardBackground.threeColumns,
  BoardBackground.chalkboard,
  BoardBackground.cricketField,
  BoardBackground.footballField,
];

const colourBackgrounds = [
  BoardBackground.plain,
  BoardBackground.paperCream,
  BoardBackground.paperSky,
  BoardBackground.paperMint,
  BoardBackground.paperRose,
  BoardBackground.paperSlate,
  BoardBackground.night,
  BoardBackground.chalkboard,
];

/// A paper's name in the board's language.
String paperName(BuildContext context, BoardBackground b) {
  final s = LayoutStrings.of(context);
  final name = s.bgName(b.name);
  return name == 'bg_${b.name}' ? backgroundName(context.l10n, b) : name;
}

/// Backgrounds and templates for this page (or every page): the papers, plain colours, or the
/// teacher's own picture under the ink.
class BackgroundsPopover extends StatefulWidget {
  const BackgroundsPopover({super.key, required this.wb, required this.onChanged, this.width = 600});

  final WhiteboardController wb;

  /// Tells the board (recording, live view, projector) the paper changed.
  final ValueChanged<BoardBackground> onChanged;
  final double width;

  @override
  State<BackgroundsPopover> createState() => _BackgroundsPopoverState();
}

class _BackgroundsPopoverState extends State<BackgroundsPopover> {
  int _tab = 0;
  bool _every = false;

  void _pick(BoardBackground b) {
    if (_every) {
      widget.wb.setAllBackgrounds(b);
    } else {
      widget.wb.background = b;
    }
    widget.onChanged(b);
    setState(() {});
  }

  Future<void> _picture() async {
    final l = context.l10n;
    PickedFile? file;
    try {
      file = await DeviceFiles.instance.pickPicture();
    } catch (_) {
      if (mounted) showBoardMessage(context, l.pictureCouldNotOpen);
      return;
    }
    if (file == null) return;
    final picture = await boardPicture(file.bytes, maxSide: 2400);
    if (!mounted) return;
    if (picture == null) {
      showBoardMessage(context, l.pictureCouldNotOpen);
      return;
    }
    // Fitted to a sheet, under the ink, where it cannot be moved or rubbed out.
    final size = picture.$2;
    final k = math.min(boardSheet.width / size.width, boardSheet.height / size.height);
    final wb = widget.wb;
    wb.setElements([ImageElement(id: newElementId(), rect: Rect.fromLTWH(0, 0, size.width * k, size.height * k), bytes: picture.$1, backdrop: true), ...wb.elements]);
  }

  @override
  Widget build(BuildContext context) {
    final s = LayoutStrings.of(context);
    final current = widget.wb.background;
    Widget tile(BoardBackground b) => InkWell(
      key: Key('bg-${b.name}'),
      onTap: () => _pick(b),
      borderRadius: BorderRadius.circular(Kx.rMd),
      child: SizedBox(
        width: 104,
        child: Column(
          children: [
            Container(
              width: 96,
              height: 56,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(Kx.rMd),
                border: Border.all(color: b == current ? context.colors.primary : context.colors.outlineVariant, width: b == current ? 3 : 1),
              ),
              clipBehavior: Clip.antiAlias,
              // A whole sheet, shrunk: fields and maps show as they are drawn.
              child: CustomPaint(painter: BackgroundPainter(b, scale: 96 / boardSheet.width)),
            ),
            const SizedBox(height: 4),
            Text(paperName(context, b), style: context.text.labelSmall, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
    return PopoverCard(
      key: const Key('backgrounds-popover'),
      title: s.background,
      width: widget.width,
      trailing: SegmentedButton<bool>(
        key: const Key('bg-scope'),
        showSelectedIcon: false,
        style: const ButtonStyle(visualDensity: VisualDensity.compact),
        segments: [ButtonSegment(value: false, label: Text(s.thisPage)), ButtonSegment(value: true, label: Text(s.everyPage))],
        selected: {_every},
        onSelectionChanged: (v) => setState(() => _every = v.single),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          SegmentedButton<int>(
            key: const Key('bg-tabs'),
            showSelectedIcon: false,
            segments: [
              ButtonSegment(value: 0, label: Text(s.templates)),
              ButtonSegment(value: 1, label: Text(s.colours)),
              ButtonSegment(value: 2, label: Text(s.ownPicture)),
            ],
            selected: {_tab},
            onSelectionChanged: (v) => setState(() => _tab = v.single),
          ),
          const SizedBox(height: Kx.s12),
          if (_tab == 2)
            FilledButton.tonalIcon(
              key: const Key('bg-picture'),
              onPressed: _picture,
              icon: const Icon(Icons.add_photo_alternate_outlined),
              label: Text(s.ownPicture),
            )
          else
            Wrap(spacing: Kx.s8, runSpacing: Kx.s8, children: [for (final b in _tab == 0 ? templateBackgrounds : colourBackgrounds) tile(b)]),
        ],
      ),
    );
  }
}
