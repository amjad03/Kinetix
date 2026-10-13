import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../core/board_controller.dart';
import '../../../demo/demo.dart';
import '../../../l10n/l10n.dart';
import '../../class_check/class_check.dart';
import '../../live_quiz/live_quiz.dart';
import '../chrome.dart';
import 'board_chrome.dart';

/// Live Quiz on the top bar: the game-show quiz (features/live_quiz). A question still up from
/// Ask the class is put away first, so the class answers one thing at a time.
Future<void> openLiveQuiz(BuildContext context, ClassCheck check) {
  check.dismiss();
  return openLiveQuizGame(context, check.board);
}

/// Live Class on the top bar: Go live (the class watches the board's ink on their phones) with
/// the teacher's voice (class audio), started and stopped together.
Future<void> toggleLiveClass(BuildContext context, BoardController board) async {
  await toggleClassLive(context, board);
  if (Demo.enabled || !context.mounted) return;
  final audio = board.classAudio;
  if (board.classLive && !audio.enabled) {
    await audio.turnOn();
  } else if (!board.classLive && audio.enabled) {
    await audio.turnOff();
  }
}

/// The board's top bar (the competitor photo's Live Quiz · Live Class · Share · Record, with the
/// zoom beside them). Each button shows its state: live with the students watching, screens
/// being cast, recording. [labels] off (tablets, phones): icons with tooltips.
class TopActionBar extends StatelessWidget {
  const TopActionBar({
    super.key,
    required this.board,
    required this.wb,
    required this.recording,
    required this.onLiveQuiz,
    required this.onLiveClass,
    required this.onShareBoard,
    required this.onCast,
    required this.onRecord,
    this.labels = true,
    this.showZoom = true,
    this.collapsed = false,
  });

  final BoardController board;
  final WhiteboardController wb;

  /// A lesson is being recorded.
  final bool recording;
  final VoidCallback onLiveQuiz;
  final VoidCallback onLiveClass;
  final VoidCallback onShareBoard;
  final VoidCallback onCast;
  final VoidCallback onRecord;
  final bool labels;
  final bool showZoom;

  /// On a phone: one button in the top row that opens the four as a menu, so nothing floats
  /// over the board; a dot on it while the class is live or a lesson is recording.
  final bool collapsed;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([board, board.cast, wb.view]),
      builder: (context, _) {
        final l = context.l10n;
        final live = board.classLive;
        final casting = board.cast.shown.length;
        final percent = (wb.view.value.scale * 100).round();
        if (collapsed) return _menu(context, l, live, casting);
        return Semantics(
          container: true,
          label: l.topBarLabel,
          child: ChromeSurface(
            key: const Key('top-actions'),
            radius: Kx.rFull,
            padding: const EdgeInsets.all(Kx.s4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                TopActionButton(key: const Key('top-live-quiz'), icon: Icons.quiz_outlined, label: l.topLiveQuiz, tooltip: l.topLiveQuizTooltip, labels: labels, onTap: onLiveQuiz),
                TopActionButton(
                  key: const Key('top-live-class'),
                  icon: live ? Icons.sensors : Icons.cast_for_education_outlined,
                  // How many are watching shows on Go live in the class bar.
                  label: live ? l.topLiveNow : l.topLiveClass,
                  tooltip: !board.isSignedIn ? l.topLiveNeedsSignIn : (live ? l.stopLiveTooltip : l.topLiveClassTooltip),
                  labels: labels,
                  active: live,
                  dot: Kx.live,
                  onTap: board.isSignedIn ? onLiveClass : null,
                ),
                _ShareButton(labels: labels, casting: casting, onShareBoard: onShareBoard, onCast: onCast),
                TopActionButton(
                  key: const Key('top-record'),
                  icon: recording ? Icons.stop_circle_outlined : Icons.fiber_manual_record,
                  iconColor: recording ? null : Kx.record,
                  label: recording ? l.topRecording : l.toolRecord,
                  tooltip: recording ? l.topStopRecordingTooltip : l.topRecordTooltip,
                  labels: labels,
                  active: recording,
                  dot: Kx.record,
                  onTap: onRecord,
                ),
                if (showZoom)
                  Tooltip(
                    message: l.topZoomTooltip(percent),
                    child: TextButton(
                      key: const Key('top-zoom'),
                      style: TextButton.styleFrom(minimumSize: const Size(56, 44), padding: const EdgeInsets.symmetric(horizontal: Kx.s8)),
                      onPressed: percent == 100 ? null : wb.resetZoom,
                      child: Text('$percent%', key: const Key('top-zoom-percent'), style: TextStyle(color: context.colors.onSurface)),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _menu(BuildContext context, AppLocalizations l, bool live, int casting) {
    final c = context.colors;
    MenuItemButton item(String key, IconData icon, String label, VoidCallback? onTap, {Color? tint}) => MenuItemButton(
      key: Key(key),
      leadingIcon: Icon(icon, color: tint == null ? null : Kx.readable(tint, c.surfaceContainer)),
      onPressed: onTap,
      child: Text(label),
    );
    return MenuAnchor(
      style: MenuStyle(backgroundColor: WidgetStatePropertyAll(c.surfaceContainer)),
      menuChildren: [
        item('top-live-quiz', Icons.quiz_outlined, l.topLiveQuiz, onLiveQuiz),
        item('top-live-class', live ? Icons.sensors : Icons.cast_for_education_outlined, live ? l.stopLiveTooltip : (board.isSignedIn ? l.topLiveClass : l.topLiveNeedsSignIn), board.isSignedIn ? onLiveClass : null, tint: live ? Kx.live : null),
        item('top-share-board', Icons.ios_share, l.topShareBoard, onShareBoard),
        item('top-share-cast', casting > 0 ? Icons.cast_connected : Icons.cast, casting > 0 ? l.topCasting(casting) : l.topCastScreen, onCast),
        item('top-record', recording ? Icons.stop_circle_outlined : Icons.fiber_manual_record, recording ? l.topStopRecordingTooltip : l.toolRecord, onRecord, tint: Kx.record),
      ],
      builder: (context, menu, _) => ChromeSurface(
        key: const Key('top-actions'),
        radius: Kx.rFull,
        padding: EdgeInsets.zero,
        child: IconButton(
          key: const Key('top-actions-menu'),
          tooltip: l.topBarLabel,
          isSelected: live || recording,
          onPressed: () => menu.isOpen ? menu.close() : menu.open(),
          icon: Badge(isLabelVisible: live || recording, backgroundColor: Kx.readable(recording ? Kx.record : Kx.live, c.surfaceContainer), smallSize: 8, child: const Icon(Icons.cast_for_education_outlined)),
        ),
      ),
    );
  }
}

/// One button of [TopActionBar]: icon and label (or the icon alone), and while [active] a
/// filled pill with a coloured dot (live, recording).
class TopActionButton extends StatelessWidget {
  const TopActionButton({super.key, required this.icon, required this.label, required this.tooltip, required this.onTap, this.labels = true, this.active = false, this.dot, this.iconColor});

  final IconData icon;
  final String label;
  final String tooltip;
  final VoidCallback? onTap;
  final bool labels;
  final bool active;

  /// The colour of the dot shown while [active].
  final Color? dot;

  /// The icon's own colour when not active (Record's red), kept readable on the bar.
  final Color? iconColor;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final bg = active ? c.secondaryContainer : Colors.transparent;
    final fg = active ? c.onSecondaryContainer : c.onSurface;
    final surface = active ? c.secondaryContainer : (c.brightness == Brightness.light ? c.surfaceContainerLowest : c.surfaceContainer);
    final iconFg = onTap == null ? c.onSurface.withValues(alpha: 0.38) : (iconColor == null ? fg : Kx.readable(iconColor!, surface));
    final glyph = Icon(icon, size: 22, color: iconFg);
    final lead = active && dot != null
        ? Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(width: 8, height: 8, decoration: BoxDecoration(color: Kx.readable(dot!, bg), shape: BoxShape.circle)),
              const SizedBox(width: Kx.s4),
              glyph,
            ],
          )
        : glyph;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Tooltip(
        message: tooltip,
        child: Semantics(
          button: true,
          selected: active,
          label: labels ? null : label,
          child: Material(
            color: bg,
            shape: const StadiumBorder(),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onTap,
              child: ConstrainedBox(
                constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                child: Padding(
                  padding: EdgeInsets.symmetric(horizontal: labels ? Kx.s12 : Kx.s8),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      lead,
                      if (labels) ...[
                        const SizedBox(width: Kx.s8),
                        Text(label, style: context.text.labelLarge?.copyWith(color: onTap == null ? c.onSurface.withValues(alpha: 0.6) : fg)),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Share: the board's notes (PDF, link, QR, WhatsApp) or a laptop or phone cast to the board.
class _ShareButton extends StatelessWidget {
  const _ShareButton({required this.labels, required this.casting, required this.onShareBoard, required this.onCast});

  final bool labels;
  final int casting;
  final VoidCallback onShareBoard;
  final VoidCallback onCast;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return MenuAnchor(
      style: MenuStyle(backgroundColor: WidgetStatePropertyAll(context.colors.surfaceContainer)),
      menuChildren: [
        MenuItemButton(
          key: const Key('top-share-board'),
          leadingIcon: const Icon(Icons.ios_share),
          onPressed: onShareBoard,
          child: _MenuText(title: l.topShareBoard, hint: l.topShareBoardHint),
        ),
        MenuItemButton(
          key: const Key('top-share-cast'),
          leadingIcon: const Icon(Icons.cast),
          onPressed: onCast,
          child: _MenuText(title: l.topCastScreen, hint: casting > 0 ? l.topCasting(casting) : l.topCastScreenHint),
        ),
      ],
      builder: (context, menu, _) => TopActionButton(
        key: const Key('top-share'),
        icon: casting > 0 ? Icons.cast_connected : Icons.share_outlined,
        label: casting > 0 ? l.topCasting(casting) : l.topShare,
        tooltip: casting > 0 ? l.topCasting(casting) : l.topShare,
        labels: labels,
        active: casting > 0,
        onTap: () => menu.isOpen ? menu.close() : menu.open(),
      ),
    );
  }
}

class _MenuText extends StatelessWidget {
  const _MenuText({required this.title, required this.hint});

  final String title;
  final String hint;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: Kx.s8),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: context.text.bodyLarge?.copyWith(color: context.colors.onSurface)),
        Text(hint, style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
      ],
    ),
  );
}
