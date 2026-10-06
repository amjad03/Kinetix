import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../core/api_client.dart';
import '../../../core/board_controller.dart';
import '../../../demo/demo.dart';
import '../../../l10n/l10n.dart';
import '../../kiosk/kiosk_ui.dart';
import '../../search/search_strings.dart';
import '../chrome.dart';
import 'layout_strings.dart';
import 'pen_popover.dart';

/// The popovers of the new layout; each opens above (or beside) the control that opened it.
enum BoardPopover { pen, erase, shapes, tools, insert, background, menu, profile, pages, eyeComfort }

/// The tools that belong to the Pen button (the AI pen, the nibs and the laser are pen types).
bool isPenTool(BoardTool t) => t == BoardTool.pen || t == BoardTool.aiPen || t == BoardTool.laser;

/// The AI pen's button: its own icon, in the AI colour (marigold) until it is picked.
const aiPenIcon = Icons.gesture;
Color aiPenColor(BuildContext context) => context.colors.brightness == Brightness.dark ? const Color(0xFFFFB95C) : KxColor.spark;

/// The Pen button's icon: the pen's nib, or the laser.
IconData penIcon(WhiteboardController wb) => switch (wb.tool) {
  BoardTool.laser => Icons.flare,
  _ => switch (wb.penNib) {
    PenNib.calligraphy => Icons.history_edu,
    PenNib.dashed || PenNib.dotted => Icons.more_horiz,
    PenNib.arrow => Icons.trending_flat,
    PenNib.round => Icons.edit_outlined,
  },
};

/// The main toolbar (screen 1, callout 2): Pen · Highlighter · Eraser · Select · Shapes │
/// Undo · Redo │ Tools · Add │ KINETIX AI, labels under the icons. It floats at the bottom
/// centre, can be dragged to the left or right edge, and folds away.
class MainToolbar extends StatelessWidget {
  const MainToolbar({
    super.key,
    required this.wb,
    required this.memory,
    required this.dock,
    required this.collapsed,
    required this.popover,
    required this.aiOpen,
    required this.onTool,
    required this.onPopover,
    required this.onAi,
    required this.onCollapse,
    this.onDragStart,
    this.onDragUpdate,
    this.onDragEnd,
    this.showAiPen = true,
  });

  final WhiteboardController wb;

  /// The AI pen's own button beside the pen (not on the Simple board).
  final bool showAiPen;
  final PenMemory memory;
  final ToolbarDock dock;
  final bool collapsed;
  final BoardPopover? popover;
  final bool aiOpen;

  /// The Pen, Highlighter, Eraser and Select buttons (a second tap opens the tool's options).
  final ValueChanged<BoardTool> onTool;
  final ValueChanged<BoardPopover> onPopover;
  final VoidCallback onAi;
  final ValueChanged<bool> onCollapse;

  /// The handle: drag the toolbar to an edge.
  final GestureDragStartCallback? onDragStart;
  final GestureDragUpdateCallback? onDragUpdate;
  final GestureDragEndCallback? onDragEnd;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = LayoutStrings.of(context);
    final vertical = dock != ToolbarDock.bottom;
    return ListenableBuilder(
      listenable: Listenable.merge([wb, memory]),
      builder: (context, _) {
        final tool = wb.tool;
        final handle = GestureDetector(
          key: const Key('toolbar-handle'),
          behavior: HitTestBehavior.opaque,
          onPanStart: onDragStart,
          onPanUpdate: onDragUpdate,
          onPanEnd: onDragEnd,
          child: MouseRegion(
            cursor: SystemMouseCursors.grab,
            child: Tooltip(
              message: s.dragToolbar,
              waitDuration: const Duration(seconds: 1),
              child: Padding(
                padding: const EdgeInsets.all(6),
                child: Icon(vertical ? Icons.drag_handle : Icons.drag_indicator, color: context.colors.onSurfaceVariant),
              ),
            ),
          ),
        );
        final chromePaper = context.colors.brightness == Brightness.dark ? BoardBackground.night : BoardBackground.plain;
        final pen = ToolButton(
          key: const Key('tool-pen'),
          icon: penIcon(wb),
          label: tool == BoardTool.laser ? l.toolLaser : l.pen,
          iconColor: tool == BoardTool.pen ? inkColorFor(wb.penColor.withValues(alpha: 1), chromePaper) : null,
          selected: tool == BoardTool.pen || tool == BoardTool.laser || (popover == BoardPopover.pen && tool != BoardTool.aiPen),
          onTap: () => onTool(BoardTool.pen),
        );
        // The AI pen, next to the pen: shapes, maths and words from handwriting (not on the
        // Simple board).
        final aiPen = showAiPen
            ? ToolButton(
                key: const Key('tool-ai-pen'),
                icon: aiPenIcon,
                label: l.aiPen,
                iconColor: tool == BoardTool.aiPen ? null : aiPenColor(context),
                selected: tool == BoardTool.aiPen,
                onTap: () => onTool(BoardTool.aiPen),
              )
            : null;
        if (collapsed) {
          return ChromeSurface(
            key: const Key('main-toolbar'),
            child: Flex(
              direction: vertical ? Axis.vertical : Axis.horizontal,
              mainAxisSize: MainAxisSize.min,
              children: [
                handle,
                pen,
                ToolButton(key: const Key('toolbar-expand'), icon: vertical ? Icons.unfold_more : Icons.expand_less, label: s.expand, onTap: () => onCollapse(false)),
              ],
            ),
          );
        }
        Widget divider() => vertical ? Container(height: 1, width: 40, margin: const EdgeInsets.symmetric(vertical: 4), color: context.colors.outlineVariant) : const ToolbarDivider();
        final recent = memory.recent;
        return ChromeSurface(
          key: const Key('main-toolbar'),
          child: Flex(
            direction: vertical ? Axis.vertical : Axis.horizontal,
            mainAxisSize: MainAxisSize.min,
            children: [
              handle,
              pen,
              ?aiPen,
              if (recent.isNotEmpty)
                Flex(
                  direction: vertical ? Axis.horizontal : Axis.vertical,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (final (i, r) in recent.indexed)
                      Padding(
                        padding: const EdgeInsets.all(1),
                        child: RecentPenSwatch(
                          key: Key('toolbar-recent-$i'),
                          colour: r.$1,
                          width: r.$2,
                          size: 18,
                          onTap: () {
                            wb.setPen(color: r.$1, width: r.$2);
                          },
                        ),
                      ),
                  ],
                ),
              ToolButton(
                key: const Key('tool-highlighter'),
                icon: Icons.border_color_outlined,
                label: l.highlighter,
                selected: tool == BoardTool.highlighter,
                onTap: () => onTool(BoardTool.highlighter),
              ),
              ToolButton(
                key: const Key('tool-erase'),
                icon: Icons.auto_fix_normal,
                label: s.eraser,
                selected: tool == BoardTool.eraser || popover == BoardPopover.erase,
                onTap: () => onTool(BoardTool.eraser),
              ),
              ToolButton(key: const Key('tool-select'), icon: Icons.highlight_alt, label: l.toolSelect, selected: tool == BoardTool.select, onTap: () => onTool(BoardTool.select)),
              ToolButton(
                key: const Key('tool-shapes'),
                icon: Icons.category_outlined,
                label: l.toolShapes,
                selected: tool == BoardTool.shape || popover == BoardPopover.shapes,
                onTap: () => onPopover(BoardPopover.shapes),
              ),
              divider(),
              ToolButton(key: const Key('undo'), icon: Icons.undo, label: l.toolUndo, enabled: wb.canUndo, onTap: wb.undo),
              ToolButton(key: const Key('redo'), icon: Icons.redo, label: l.toolRedo, enabled: wb.canRedo, onTap: wb.redo),
              divider(),
              ToolButton(key: const Key('tool-tools'), icon: Icons.grid_view_rounded, label: l.toolTools, selected: popover == BoardPopover.tools, onTap: () => onPopover(BoardPopover.tools)),
              ToolButton(
                key: const Key('tool-insert'),
                icon: Icons.add_box_outlined,
                label: s.add,
                selected: popover == BoardPopover.insert || tool == BoardTool.note || tool == BoardTool.math || tool == BoardTool.text,
                onTap: () => onPopover(BoardPopover.insert),
              ),
              divider(),
              ToolButton(key: const Key('panel-ai'), icon: Icons.auto_awesome, label: s.kinetixAi, accent: const Color(0xFF835400), selected: aiOpen, onTap: onAi),
              ToolButton(key: const Key('toolbar-collapse'), icon: vertical ? Icons.unfold_less : Icons.expand_more, label: s.collapse, onTap: () => onCollapse(true)),
            ],
          ),
        );
      },
    );
  }
}

/// One entry of the phone's bar or its ⋯ sheet.
class BarItem {
  const BarItem(this.key, this.icon, this.label, this.onTap, {this.selected = false, this.enabled = true, this.color});

  final Key key;
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool selected;
  final bool enabled;
  final Color? color;
}

/// The phone's bottom bar: the toolbar's order, as many as fit, and ⋯ for the rest.
class PhoneBar extends StatelessWidget {
  const PhoneBar({super.key, required this.wb, required this.items, required this.onMore});

  final WhiteboardController wb;
  final List<BarItem> Function() items;

  /// Opens the ⋯ sheet with the items that did not fit.
  final ValueChanged<List<BarItem>> onMore;

  /// Each button's width on a phone (touch targets stay at least 40 px).
  static const slot = 44.0;

  @override
  Widget build(BuildContext context) {
    final s = LayoutStrings.of(context);
    return ListenableBuilder(
      listenable: wb,
      builder: (context, _) => LayoutBuilder(
        builder: (context, c) {
          final all = items();
          final fit = ((c.maxWidth - 8) / slot).floor() - 1;
          final shown = all.take(fit.clamp(1, all.length)).toList();
          final rest = all.skip(shown.length).toList();
          return ChromeSurface(
            key: const Key('phone-bar'),
            radius: Kx.rXl,
            padding: const EdgeInsets.all(4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final i in shown)
                  SizedBox(
                    width: slot,
                    child: KxToolButton(
                      key: i.key,
                      size: 44,
                      icon: Icon(i.icon),
                      iconColor: i.color,
                      tooltip: i.label,
                      selected: i.selected,
                      onTap: i.enabled ? i.onTap : null,
                    ),
                  ),
                SizedBox(
                  width: slot,
                  child: KxToolButton(key: const Key('phone-more'), size: 44, icon: const Icon(Icons.more_horiz), tooltip: s.more, onTap: () => onMore(rest)),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// Top left (callout 1): class and subject (tap to switch), Go live, attendance (tap to take)
/// and the time left in the period.
class ClassBar extends StatefulWidget {
  const ClassBar({super.key, required this.board, required this.onSignIn, required this.onSwitchClass, required this.onAttendance, this.phone = false});

  final BoardController board;
  final VoidCallback onSignIn;
  final VoidCallback onSwitchClass;
  final VoidCallback onAttendance;

  /// On a phone only the class shows; the rest is in the menu.
  final bool phone;

  @override
  State<ClassBar> createState() => _ClassBarState();
}

class _ClassBarState extends State<ClassBar> {
  late final Timer _tick = Timer.periodic(const Duration(seconds: 20), (_) => setState(() {}));

  @override
  void dispose() {
    _tick.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final board = widget.board;
    final s = board.session;
    final l = context.l10n;
    final ls = LayoutStrings.of(context);
    final marked = board.attendance.length;
    final left = minutesLeft(s?.periodLabel, DateTime.now());
    const gap = SizedBox(width: Kx.s4);
    // One floating pill, like search, the clock and the profile at the top right; its chips
    // sit flat inside it.
    final chips = ChipTheme.of(context).copyWith(side: BorderSide.none, backgroundColor: Colors.transparent, shape: const StadiumBorder());
    return SingleChildScrollView(
      key: const Key('class-bar'),
      scrollDirection: Axis.horizontal,
      // Room for the pill's shadow.
      padding: const EdgeInsets.fromLTRB(2, 2, 2, 8),
      child: ChromeSurface(
        radius: Kx.rFull,
        padding: const EdgeInsets.all(Kx.s4),
        child: ChipTheme(
          data: chips,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (s == null)
                ActionChip(
                  key: const Key('sign-in-chip'),
                  avatar: Icon(board.isEnrolled ? Icons.qr_code_2 : Icons.edit_outlined, size: 18),
                  label: Text(board.isEnrolled ? l.guestSignIn : l.practiceBoard),
                  onPressed: board.isEnrolled ? widget.onSignIn : null,
                )
              else ...[
                ActionChip(
                  key: const Key('class-chip'),
                  avatar: KxAvatar(name: s.teacherName, size: 24),
                  tooltip: ls.switchClass,
                  label: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: widget.phone ? 150 : 320),
                    child: Text(s.classLabel ?? s.teacherName, overflow: TextOverflow.ellipsis),
                  ),
                  onPressed: widget.onSwitchClass,
                ),
                if (!widget.phone) ...[
                  if (board.liveLeaders > 0 && board.liveIndicator) ...[
                    gap,
                    Tooltip(
                      message: l.beingViewedTooltip,
                      child: Chip(key: const Key('being-viewed'), avatar: const Icon(Icons.visibility_outlined, size: 18), label: Text(l.beingViewed(board.liveLeaders))),
                    ),
                  ],
                  gap,
                  GoLiveChip(board: board),
                  gap,
                  ActionChip(
                    key: const Key('attendance-chip'),
                    avatar: const Icon(Icons.groups_outlined, size: 18),
                    label: Text(
                      board.roster.isEmpty
                          ? l.noClassList
                          : marked == 0
                          ? l.takeAttendance(board.roster.length)
                          : l.presentOfTotal(board.pickable.length, board.roster.length),
                    ),
                    onPressed: widget.onAttendance,
                  ),
                  if (left != null) ...[
                    gap,
                    Chip(key: const Key('period-left'), avatar: const Icon(Icons.hourglass_bottom, size: 18), label: Text(ls.minutesLeft(left))),
                  ],
                  gap,
                  ClassAudioButton(board: board),
                ],
              ],
              if (Demo.enabled) ...[gap, const DemoChip()],
              // Privacy: whenever the microphone is going out to the class, the teacher sees it.
              if (board.classAudio.sending) ...[
                gap,
                Tooltip(
                  message: l.micOnTooltip,
                  child: const CircleAvatar(key: Key('mic-on'), radius: 16, backgroundColor: Kx.record, child: Icon(Icons.mic, size: 18, color: Colors.white)),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Minutes left in a period labelled "10:00–10:45" at [now], or null outside it.
int? minutesLeft(String? periodLabel, DateTime now) {
  final parts = periodLabel?.split('–');
  if (parts == null || parts.length != 2) return null;
  DateTime? at(String hhmm) {
    final p = hhmm.trim().split(':');
    if (p.length < 2) return null;
    final h = int.tryParse(p[0]), m = int.tryParse(p[1]);
    return h == null || m == null ? null : DateTime(now.year, now.month, now.day, h, m);
  }

  final start = at(parts[0]), end = at(parts[1]);
  if (start == null || end == null || now.isBefore(start) || !now.isBefore(end)) return null;
  return (end.difference(now).inSeconds / 60).ceil();
}

/// Go live: the class watches the board on their phones (needs KINETIX Cloud).
Future<void> toggleClassLive(BuildContext context, BoardController board) async {
    if (Demo.enabled) {
      showBoardMessage(context, context.l10n.notInDemo);
      return;
    }
    final on = !board.classLive;
    try {
      await board.setClassLive(on);
      if (context.mounted) showBoardMessage(context, on ? context.l10n.liveStarted : context.l10n.liveEnded);
    } on ApiException catch (e) {
      if (context.mounted) showBoardMessage(context, apiErrorText(context.l10n, e));
    } catch (_) {
      if (context.mounted) showBoardMessage(context, context.l10n.cloudUnreachableCheckOnline);
    }
  }

class GoLiveChip extends StatelessWidget {
  const GoLiveChip({super.key, required this.board});

  final BoardController board;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return ActionChip(
      key: const Key('go-live'),
      avatar: Icon(board.classLive ? Icons.stop_circle_outlined : Icons.sensors, size: 18, color: Kx.live),
      label: Text(
        !board.classLive
            ? l.goLive
            : board.liveStudents == 0
            ? l.liveWaiting
            : l.liveStudents(board.liveStudents),
      ),
      tooltip: board.classLive ? l.stopLiveTooltip : l.goLiveTooltip,
      onPressed: () => toggleClassLive(context, board),
    );
  }
}

/// Class audio: the teacher's voice to the class's phones.
class ClassAudioButton extends StatelessWidget {
  const ClassAudioButton({super.key, required this.board});

  final BoardController board;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final on = board.classAudio.enabled;
    return IconButton(
      key: const Key('class-audio'),
      tooltip: on ? l.classAudioTurnOffTooltip : l.classAudioTurnOnTooltip,
      isSelected: on,
      onPressed: () async {
        if (Demo.enabled) {
          showBoardMessage(context, l.notInDemo);
          return;
        }
        final audio = board.classAudio;
        if (audio.enabled) {
          await audio.turnOff();
          if (context.mounted) showBoardMessage(context, l.classAudioStopped);
        } else if (await audio.turnOn() && context.mounted) {
          showBoardMessage(context, l.classAudioStarted);
        }
      },
      icon: const Icon(Icons.mic_off_outlined),
      selectedIcon: const Icon(Icons.mic),
    );
  }
}

/// Top right (callout 5): universal search, the clock and the profile.
class TopRightBar extends StatefulWidget {
  const TopRightBar({super.key, required this.board, required this.onSearch, required this.onProfile, this.profileOpen = false, this.phone = false, this.onMenu});

  final BoardController board;
  final VoidCallback onSearch;
  final VoidCallback onProfile;
  final bool profileOpen;

  /// On a phone: search as an icon, and the menu (⋮) instead of the clock and profile.
  final bool phone;
  final VoidCallback? onMenu;

  @override
  State<TopRightBar> createState() => _TopRightBarState();
}

class _TopRightBarState extends State<TopRightBar> {
  late final Timer _clock = Timer.periodic(const Duration(seconds: 20), (_) => setState(() {}));

  @override
  void dispose() {
    _clock.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final board = widget.board;
    final c = context.colors;
    final l = context.l10n;
    final search = SearchStrings.of(context);
    final s = board.session;
    if (widget.phone) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ChromeSurface(
            radius: Kx.rFull,
            padding: EdgeInsets.zero,
            child: IconButton(key: const Key('open-search'), tooltip: search.searchTooltip, onPressed: widget.onSearch, icon: const Icon(Icons.search)),
          ),
          const SizedBox(width: Kx.s4),
          // Holding the menu for 3 seconds is IT's way out of kiosk mode, as the clock is on a panel.
          KioskExitGesture(
            key: const Key('kiosk-exit-gesture'),
            kiosk: board.kiosk,
            child: ChromeSurface(
              radius: Kx.rFull,
              padding: EdgeInsets.zero,
              child: IconButton(key: const Key('board-menu'), tooltip: LayoutStrings.of(context).menu, onPressed: widget.onMenu, icon: const Icon(Icons.more_vert)),
            ),
          ),
        ],
      );
    }
    final now = DateTime.now();
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ChromeSurface(
          radius: Kx.rFull,
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: TextButton.icon(
            key: const Key('open-search'),
            onPressed: widget.onSearch,
            icon: const Icon(Icons.search),
            label: Text(search.search),
          ),
        ),
        const SizedBox(width: Kx.s8),
        // Holding the clock for 3 seconds is IT's way out of kiosk mode (docs/hardware/kiosk-mode.md).
        KioskExitGesture(
          key: const Key('kiosk-exit-gesture'),
          kiosk: board.kiosk,
          child: ChromeSurface(
            radius: Kx.rFull,
            padding: const EdgeInsets.symmetric(horizontal: Kx.s12, vertical: Kx.s8),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (board.pendingOps > 0)
                  Padding(
                    padding: const EdgeInsets.only(right: Kx.s8),
                    child: Tooltip(message: l.pendingSync(board.pendingOps), child: Icon(Icons.cloud_upload_outlined, color: c.onSurface, size: 20)),
                  ),
                if (board.isEnrolled)
                  Padding(
                    padding: const EdgeInsets.only(right: Kx.s8),
                    child: Tooltip(
                      message: board.online ? l.connectedCloud : l.offlineSaved,
                      child: Icon(board.online ? Icons.cloud_done_outlined : Icons.cloud_off_outlined, color: c.onSurface, size: 20),
                    ),
                  ),
                Text(boardTimeText(now), key: const Key('board-clock'), style: context.text.labelLarge?.copyWith(color: c.onSurface)),
              ],
            ),
          ),
        ),
        const SizedBox(width: Kx.s8),
        ChromeSurface(
          radius: Kx.rFull,
          padding: const EdgeInsets.all(2),
          child: IconButton(
            key: const Key('profile-button'),
            tooltip: s?.teacherName ?? l.guest,
            isSelected: widget.profileOpen,
            onPressed: widget.onProfile,
            icon: s == null ? const Icon(Icons.person) : KxAvatar(name: s.teacherName, size: 32),
          ),
        ),
      ],
    );
  }
}

/// "12:18 pm", with am/pm as classrooms write it (intl's Kannada data abbreviates pm to "p").
String boardTimeText(DateTime now) => DateFormat('h:mm a', dateLocaleFor(const Locale('en'))).format(now);

/// Bottom left (callout 4): the menu, and Record with its running time.
class MenuRecordBar extends StatelessWidget {
  const MenuRecordBar({super.key, required this.onMenu, required this.menuOpen, required this.onRecord, this.recording});

  final VoidCallback onMenu;
  final bool menuOpen;
  final VoidCallback onRecord;

  /// The running recording (time, pause, stop) while a lesson is being recorded.
  final Widget? recording;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = LayoutStrings.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        ChromeSurface(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              ToolButton(key: const Key('board-menu'), icon: Icons.menu, label: s.menu, selected: menuOpen, onTap: onMenu),
              if (recording == null) ToolButton(key: const Key('record'), icon: Icons.fiber_manual_record, iconColor: Kx.record, label: l.toolRecord, onTap: onRecord),
            ],
          ),
        ),
        if (recording != null) ...[const SizedBox(width: Kx.s8), recording!],
      ],
    );
  }
}

/// Bottom right (callout 3): previous, "3/8", next, add page and the page overview.
class PageBar extends StatelessWidget {
  const PageBar({super.key, required this.wb, required this.onOverview, this.overviewOpen = false, this.compact = false});

  final WhiteboardController wb;
  final VoidCallback onOverview;
  final bool overviewOpen;

  /// On a phone: icons only.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = LayoutStrings.of(context);
    return ListenableBuilder(
      listenable: wb,
      builder: (context, _) {
        Widget button(Key key, IconData icon, String label, VoidCallback? onTap, {bool selected = false}) => compact
            ? IconButton(key: key, tooltip: label, isSelected: selected, onPressed: onTap, icon: Icon(icon))
            : ToolButton(key: key, icon: icon, label: label, enabled: onTap != null, selected: selected, onTap: onTap);
        return ChromeSurface(
          key: const Key('page-bar'),
          radius: compact ? Kx.rFull : Kx.rLg,
          padding: compact ? const EdgeInsets.symmetric(horizontal: 2) : const EdgeInsets.all(6),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              button(const Key('previous-page'), Icons.chevron_left, l.toolPrevious, wb.hasPrevious ? wb.previous : null),
              SizedBox(
                width: compact ? 44 : 52,
                child: Text(
                  '${wb.pageIndex + 1}/${wb.pageCount}',
                  key: const Key('page-indicator'),
                  textAlign: TextAlign.center,
                  style: compact ? context.text.labelLarge : context.text.titleMedium,
                ),
              ),
              button(const Key('next-page'), Icons.chevron_right, l.toolNext, wb.hasNext ? wb.next : null),
              button(const Key('add-page'), Icons.add, s.addPage, wb.addPage),
              button(const Key('page-overview'), Icons.grid_view, s.pageOverview, onOverview, selected: overviewOpen),
            ],
          ),
        );
      },
    );
  }
}

/// The menu (bottom left; ⋮ on a phone): open, save, share, the background, settings, clearing,
/// and signing out. [items] are (key, icon, label, action, enabled).
class BoardMenu extends StatelessWidget {
  const BoardMenu({super.key, required this.items, required this.onClose, this.width = 340});

  final List<(Key, IconData, String, VoidCallback, bool)> items;
  final VoidCallback onClose;
  final double width;

  @override
  Widget build(BuildContext context) {
    return ChromeSurface(
      key: const Key('board-menu-popover'),
      radius: Kx.rXl,
      padding: const EdgeInsets.all(Kx.s8),
      child: SizedBox(
        width: width,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final (i, (key, icon, label, onTap, enabled)) in items.indexed) ...[
              // Grouped as the profile menu is: files, the board's look and settings, clearing,
              // and signing out.
              if (i > 0 && key is ValueKey<String> && _groupStarts.contains(key.value)) const Divider(height: Kx.s16),
              ListTile(
                key: key,
                leading: Icon(icon),
                title: Text(label),
                enabled: enabled,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Kx.rMd)),
                onTap: () {
                  onClose();
                  onTap();
                },
              ),
            ],
          ],
        ),
      ),
    );
  }

  static const _groupStarts = {'menu-open', 'tool-theme', 'clear-board', 'end-class', 'menu-sign-in'};
}
