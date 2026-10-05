import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';
import 'chrome.dart';
import 'popovers.dart';

/// The actions under a selection: colour, fill, order, copy, paste, duplicate, group, delete;
/// "Open" for a picture of a 3D model or lab; "Read with AI" for what is selected.
class SelectionActions extends StatelessWidget {
  const SelectionActions({super.key, required this.wb, required this.box, this.onOpenLink, this.onEdit, this.onAskAi});

  final WhiteboardController wb;

  /// The selection's box on screen.
  final Rect box;

  /// Opens the 3D model or lab a picture is a snapshot of.
  final void Function(EmbedLink link)? onOpenLink;

  /// Edits the selected equation, note or text.
  final void Function(BoardElement e)? onEdit;

  /// Reads what is selected with KINETIX AI.
  final VoidCallback? onAskAi;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final els = wb.selectedElements;
    if (els.isEmpty) return const SizedBox.shrink();
    final single = els.length == 1 ? els.single : null;
    final link = single is ImageElement ? single.link : null;
    final editable = single is MathElement || single is NoteElement || single is TextElement;
    final size = MediaQuery.sizeOf(context);
    Widget btn(IconData icon, String label, VoidCallback f, {Key? key, bool text = false, bool ai = false}) => Tooltip(
      message: label,
      child: InkWell(
        key: key,
        borderRadius: BorderRadius.circular(Kx.rFull),
        onTap: f,
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: text ? 12 : 10, vertical: 10),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 22, color: ai ? context.colors.tertiary : context.colors.onSurfaceVariant),
              if (text) ...[const SizedBox(width: 6), Text(label, style: context.text.labelLarge)],
            ],
          ),
        ),
      ),
    );
    Widget gap() => Container(width: 1, height: 24, color: context.colors.outlineVariant, margin: const EdgeInsets.symmetric(horizontal: 4));
    final bar = ChromeSurface(
      radius: Kx.rFull,
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (link != null && onOpenLink != null)
            btn(
              link.kind == EmbedLink.lab ? Icons.science_outlined : Icons.view_in_ar_outlined,
              link.kind == EmbedLink.lab ? l.openLab : l.openModel,
              () => onOpenLink!(link),
              key: const Key('sel-open'),
              text: true,
            ),
          if (onAskAi != null) btn(Icons.auto_awesome, l.readWithAi, onAskAi!, key: const Key('sel-ai'), text: true, ai: true),
          if (editable && onEdit != null) btn(Icons.edit_outlined, l.edit, () => onEdit!(single!), key: const Key('sel-edit')),
          gap(),
          Builder(builder: (ctx) => btn(Icons.palette_outlined, l.colour, () => _pickColour(ctx), key: const Key('sel-colour'))),
          if (wb.selectionFillable)
            btn(
              wb.selectionFilled ? Icons.format_color_reset_outlined : Icons.format_color_fill,
              wb.selectionFilled ? l.noFill : l.fill,
              () => wb.setSelectionFill(!wb.selectionFilled),
              key: const Key('sel-fill'),
            ),
          btn(Icons.flip_to_front, l.bringToFront, wb.bringSelectionToFront, key: const Key('sel-front')),
          btn(Icons.flip_to_back, l.sendToBack, wb.sendSelectionToBack, key: const Key('sel-back')),
          gap(),
          btn(Icons.content_copy, l.copy, wb.copySelection, key: const Key('sel-copy')),
          if (wb.canPaste) btn(Icons.content_paste, l.paste, wb.paste, key: const Key('sel-paste')),
          btn(Icons.copy_all_outlined, l.duplicate, wb.duplicateSelection, key: const Key('sel-duplicate')),
          if (els.length > 1)
            wb.selectionGrouped
                ? btn(Icons.layers_clear_outlined, l.ungroup, wb.ungroupSelection, key: const Key('sel-ungroup'))
                : btn(Icons.layers_outlined, l.group, wb.groupSelection, key: const Key('sel-group')),
          btn(Icons.delete_outline, l.deleteSelection(els.length), wb.deleteSelection, key: const Key('delete-selection')),
        ],
      ),
    );
    // Under the selection, clear of its handles; above it (past the turn knob) without room.
    const barH = 52.0;
    final below = box.bottom + 24;
    final top = below + barH < size.height - 96 ? below : box.top - 66 - barH;
    return Stack(
      children: [
        Positioned(
          top: top.clamp(64.0, size.height - barH - 8),
          left: 0,
          right: 0,
          child: Align(
            alignment: Alignment((box.center.dx / size.width * 2 - 1).clamp(-1.0, 1.0), 0),
            child: FittedBox(child: BoardChromeTheme(child: bar)),
          ),
        ),
      ],
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
