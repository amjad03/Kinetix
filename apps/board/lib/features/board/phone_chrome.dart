import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';
import 'chrome.dart';

/// The board on a phone (a teacher's own phone, the demo build): the rails and the bottom
/// toolbar do not fit, so the everyday tools sit in one compact bar at the bottom and the rest
/// in a More sheet; side panels open full screen and popovers span the width.

/// Phones have a shortest side under 600 logical pixels (Material's compact window class);
/// tablets, panels and desktops keep the rails or the bottom toolbar.
const phoneBreakpoint = 600.0;

bool isPhoneSize(Size size) => size.shortestSide < phoneBreakpoint;

extension BoardFormFactor on BuildContext {
  /// True on a phone, in portrait or landscape.
  bool get isPhone => isPhoneSize(MediaQuery.sizeOf(this));
}

/// The phone's bar's height (the buttons and the surface's padding), for the board's safe area.
const phoneBarHeight = 48.0 + 2 * 4;

/// Touch targets on a phone are never smaller than this.
const phoneTarget = 48.0;

/// The phone's bar: select, pen, eraser, undo, redo, insert and More, shared out across the
/// width (never under 44 px each) and no wider than a comfortable reach in landscape.
class PhoneToolbar extends StatelessWidget {
  const PhoneToolbar({
    super.key,
    required this.wb,
    required this.writeOpen,
    required this.eraseOpen,
    required this.insertOpen,
    required this.onTool,
    required this.onInsert,
    required this.onMore,
  });

  final WhiteboardController wb;

  /// The pen's, the eraser's and Insert's popovers are open.
  final bool writeOpen;
  final bool eraseOpen;
  final bool insertOpen;

  /// Picks a tool; a second tap on the tool in use opens its options.
  final ValueChanged<BoardTool> onTool;
  final VoidCallback onInsert;
  final VoidCallback onMore;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return ListenableBuilder(
      listenable: wb,
      builder: (context, _) {
        final tool = wb.tool;
        Widget button(Key key, Widget icon, String label, bool selected, VoidCallback? onTap, {Color? iconColor}) => Expanded(
          child: Center(
            child: KxToolButton(key: key, size: phoneTarget, icon: icon, tooltip: label, selected: selected, iconColor: iconColor, onTap: onTap),
          ),
        );
        final pen = tool == BoardTool.pen || tool == BoardTool.highlighter || tool == BoardTool.aiPen;
        return ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: ChromeSurface(
            radius: Kx.rXl,
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
            child: Row(
              children: [
                button(
                  const Key('tool-select'),
                  Transform.rotate(angle: -1.5708, child: const Icon(Icons.near_me_outlined)),
                  l.toolSelect,
                  tool == BoardTool.select,
                  () => onTool(BoardTool.select),
                ),
                button(
                  const Key('tool-write'),
                  Icon(tool == BoardTool.highlighter ? Icons.border_color_outlined : Icons.edit_outlined),
                  l.pen,
                  pen || writeOpen,
                  () => onTool(pen ? tool : BoardTool.pen),
                ),
                button(const Key('tool-erase'), const Icon(Icons.auto_fix_normal), l.toolErase, tool == BoardTool.eraser || eraseOpen, () => onTool(BoardTool.eraser)),
                button(const Key('undo'), const Icon(Icons.undo), l.toolUndo, false, wb.canUndo ? wb.undo : null),
                button(const Key('redo'), const Icon(Icons.redo), l.toolRedo, false, wb.canRedo ? wb.redo : null),
                button(
                  const Key('tool-insert'),
                  const Icon(Icons.add),
                  l.toolInsert,
                  insertOpen || tool == BoardTool.note || tool == BoardTool.math || tool == BoardTool.laser,
                  onInsert,
                ),
                button(const Key('phone-more'), const Icon(Icons.more_horiz), l.toolMore, false, onMore),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// One button in the More sheet.
class MoreItem {
  const MoreItem(this.key, this.icon, this.label, this.onTap, {this.color, this.selected = false, this.enabled = true});
  final Key key;
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;
  final bool selected;
  final bool enabled;
}

/// The More sheet: everything the phone's bar has no room for, in titled groups. [top] sits
/// above the groups (the pages and the zoom). A tap closes the sheet, then acts.
class BoardMoreSheet extends StatelessWidget {
  const BoardMoreSheet({super.key, required this.groups, this.top});

  final List<(String, List<MoreItem>)> groups;
  final Widget? top;

  /// Opens the sheet over [context]'s board.
  static Future<void> show(BuildContext context, {required List<(String, List<MoreItem>)> groups, Widget? top}) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => BoardChromeTheme(child: BoardMoreSheet(groups: groups, top: top)),
  );

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.85),
      child: SingleChildScrollView(
        key: const Key('more-sheet'),
        padding: EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s16 + MediaQuery.viewInsetsOf(context).bottom),
        child: LayoutBuilder(
          builder: (context, box) {
            // Four tiles a row on a phone in portrait, more in landscape; never under 76 px.
            final perRow = (box.maxWidth / 96).floor().clamp(3, 8);
            final tileWidth = (box.maxWidth - (perRow - 1) * Kx.s8) / perRow;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (top != null) ...[top!, const SizedBox(height: Kx.s12)],
                for (final (title, items) in groups)
                  if (items.isNotEmpty) ...[
                    Padding(
                      padding: const EdgeInsets.only(top: Kx.s8, bottom: Kx.s8),
                      child: Text(title, style: context.text.titleSmall?.copyWith(color: c.onSurfaceVariant)),
                    ),
                    Wrap(
                      spacing: Kx.s8,
                      runSpacing: Kx.s8,
                      children: [
                        for (final i in items)
                          ChromeTile(
                            key: i.key,
                            icon: i.icon,
                            label: i.label,
                            color: i.color,
                            selected: i.selected,
                            width: tileWidth,
                            onTap: i.enabled
                                ? () {
                                    Navigator.pop(context);
                                    i.onTap();
                                  }
                                : null,
                          ),
                      ],
                    ),
                  ],
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Pages and zoom for the More sheet: two short rows that fit a phone's width.
class PhonePagesBar extends StatelessWidget {
  const PhonePagesBar({super.key, required this.wb, required this.primary});

  final WhiteboardController wb;
  final bool primary;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    Widget icon(Key key, IconData i, String tip, VoidCallback? onTap) => IconButton(
      key: key,
      tooltip: tip,
      style: IconButton.styleFrom(minimumSize: const Size.square(phoneTarget)),
      onPressed: onTap,
      icon: Icon(i),
    );
    return ListenableBuilder(
      listenable: Listenable.merge([wb, wb.view]),
      builder: (context, _) => Wrap(
        alignment: WrapAlignment.spaceEvenly,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: Kx.s8,
        runSpacing: Kx.s4,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              icon(const Key('previous-page'), Icons.chevron_left, l.toolPrevious, wb.hasPrevious ? wb.previous : null),
              SizedBox(
                width: 56,
                child: Text('${wb.pageIndex + 1}/${wb.pageCount}', key: const Key('page-indicator'), textAlign: TextAlign.center, style: context.text.titleMedium),
              ),
              icon(const Key('next-page'), wb.hasNext ? Icons.chevron_right : Icons.add, wb.hasNext ? l.toolNext : l.toolNewPage, wb.hasNext ? wb.next : wb.addPage),
            ],
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              icon(const Key('zoom-out'), Icons.remove, l.zoomOut, () => wb.zoomBy(1 / 1.25)),
              Tooltip(
                message: l.zoomReset,
                child: InkWell(
                  key: const Key('zoom-reset'),
                  borderRadius: BorderRadius.circular(Kx.rMd),
                  onTap: wb.resetZoom,
                  child: SizedBox(
                    width: 60,
                    height: phoneTarget,
                    child: Center(child: Text('${(wb.view.value.scale * 100).round()}%', style: context.text.labelLarge)),
                  ),
                ),
              ),
              icon(const Key('zoom-in'), Icons.add, l.zoomIn, () => wb.zoomBy(1.25)),
              icon(const Key('zoom-fit'), Icons.fit_screen_outlined, l.zoomFit, wb.fitContent),
            ],
          ),
        ],
      ),
    );
  }
}
