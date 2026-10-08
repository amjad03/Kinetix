import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart' show InputMode;
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import '../../l10n/l10n.dart';
import '../kiosk/kiosk_ui.dart';
import '../profiles/profiles_ui.dart';
import '../projector/projector_ui.dart';
import '../search/filter_bar.dart';
import '../search/fuzzy.dart';
import '../search/search_strings.dart';
import 'ai_pen_ui.dart';
import 'chrome.dart';
import 'sb_strings.dart';
import 'panel/panel_host.dart';
import 'layout/ui_strings.dart';

/// The menu that opens from the avatar in the bottom-left corner.
class ProfileMenu extends StatelessWidget {
  const ProfileMenu({
    super.key,
    required this.board,
    required this.onSignIn,
    required this.onNewPage,
    required this.onWhiteboards,
    required this.onSettings,
    required this.onClose,
    this.onNewBoard,
    this.onClassrooms,
    this.onTraining,
    this.onWhatsNew,
    this.onExit,
    this.onRecordings,
    this.onImport,
    this.onHelp,
    this.onTour,
  });

  final BoardController board;
  final VoidCallback onSignIn;
  final VoidCallback onNewPage;
  final VoidCallback onWhiteboards;

  /// New (a fresh whiteboard), Your Classrooms, Schedule a Training, What's New and Exit
  /// (spec §8 teacher profile).
  final VoidCallback? onNewBoard, onClassrooms, onTraining, onWhatsNew, onExit;
  final VoidCallback? onRecordings;

  /// Opens a PDF or PowerPoint (lib/features/insert); Help, the tour and practice (lib/features/help).
  final VoidCallback? onImport;
  final VoidCallback? onHelp;
  final VoidCallback? onTour;
  final VoidCallback onSettings;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final s = board.session;
    final l = context.l10n;
    Widget item(IconData icon, String label, VoidCallback onTap, {Key? key}) => ListTile(
      key: key,
      leading: Icon(icon),
      title: Text(label),
      dense: false,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Kx.rMd)),
      onTap: () {
        onClose();
        onTap();
      },
    );

    return ChromeSurface(
      radius: Kx.rXl,
      padding: const EdgeInsets.all(Kx.s8),
      child: SizedBox(
        width: 340,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.all(Kx.s12),
              child: Row(
                children: [
                  s == null
                      ? CircleAvatar(
                          radius: 24,
                          backgroundColor: c.surfaceContainerHighest,
                          child: Icon(Icons.person_outline, color: c.onSurfaceVariant),
                        )
                      : KxAvatar(name: s.teacherName, size: 48),
                  const SizedBox(width: Kx.s12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(s?.teacherName ?? l.guest, style: context.text.titleMedium),
                        Text(
                          s == null ? (board.deviceName ?? l.practiceBoard) : (s.classLabel ?? l.noClassTimetabled),
                          style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                          maxLines: 2,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (s == null && board.isEnrolled)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: Kx.s12, vertical: Kx.s4),
                child: FilledButton.icon(
                  key: const Key('menu-sign-in'),
                  onPressed: () {
                    onClose();
                    onSignIn();
                  },
                  icon: const Icon(Icons.qr_code_2),
                  label: Text(l.signInWithTeacherApp),
                ),
              ),
            const Divider(height: Kx.s16),
            if (onNewBoard != null) item(Icons.add_box_outlined, SbStrings.of(context)('profileNew'), onNewBoard!, key: const Key('menu-new')),
            item(Icons.note_add_outlined, l.toolNewPage, onNewPage),
            if (onImport != null) item(Icons.folder_open_outlined, l.importFiles, onImport!, key: const Key('menu-import')),
            item(Icons.dashboard_outlined, l.yourWhiteboards, onWhiteboards, key: const Key('menu-whiteboards')),
            if (onClassrooms != null && s != null) item(Icons.meeting_room_outlined, SbStrings.of(context)('yourClassrooms'), onClassrooms!, key: const Key('menu-classrooms')),
            if (onRecordings != null)
              ListTile(
                key: const Key('menu-recordings'),
                leading: const Icon(Icons.video_library_outlined),
                title: Text(l.recordings),
                trailing: board.recordings.pending == 0
                    ? null
                    : Text(l.recordingsToUpload(board.recordings.pending), style: context.text.labelSmall?.copyWith(color: c.onSurfaceVariant)),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Kx.rMd)),
                onTap: () {
                  onClose();
                  onRecordings!();
                },
              ),
            // Projector mode (features/projector): show or stop the board on the second screen.
            if (board.projector.available && board.projector.enabled)
              item(
                board.projector.isShowing ? Icons.cancel_presentation_outlined : Icons.cast_outlined,
                board.projector.isShowing ? l.projectorStop : l.projectorShow,
                () => unawaited(board.projector.isShowing ? board.projector.hide() : board.projector.show()),
                key: const Key('menu-projector'),
              )
            else
              item(Icons.cast_outlined, l.screenProjection, () => unawaited(showProjectorDialog(context, board.projector, theme: (d) => BoardChromeTheme(child: d))), key: const Key('menu-projector')),
            // Shared-board profiles (features/profiles).
            if (s != null && board.isEnrolled) ...[
              item(Icons.switch_account_outlined, l.switchTeacher, onSignIn, key: const Key('menu-switch-teacher')),
              if (board.profiles.current?.pinSet == true) item(Icons.lock_outline, l.lockBoard, board.profiles.lock, key: const Key('menu-lock')),
            ],
            const Divider(height: Kx.s16),
            item(Icons.tune, SbStrings.of(context)('configurations'), onSettings, key: const Key('menu-settings')),
            if (onTraining != null) item(Icons.school_outlined, SbStrings.of(context)('scheduleTraining'), onTraining!, key: const Key('menu-training')),
            if (onWhatsNew != null) item(Icons.new_releases_outlined, SbStrings.of(context)('whatsNew'), onWhatsNew!, key: const Key('menu-whats-new')),
            if (onHelp != null) item(Icons.help_outline, l.helpTitle, onHelp!, key: const Key('menu-help')),
            if (onTour != null) item(Icons.school_outlined, l.guidedTour, onTour!, key: const Key('menu-tour')),
            if (onExit != null && s != null) item(Icons.logout, SbStrings.of(context)('exit'), onExit!, key: const Key('menu-exit')),
            // Also IT's way out of kiosk mode: hold for 3 seconds.
            KioskExitGesture(
              key: const Key('kiosk-exit-version'),
              kiosk: board.kiosk,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s8),
                child: Text('KINETIX Board 0.2.0', style: context.text.labelSmall?.copyWith(color: c.onSurfaceVariant)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

extension TouchProfileText on TouchProfile {
  String label(AppLocalizations l) => switch (this) {
    TouchProfile.tablet => l.touchTablet,
    TouchProfile.panel => l.touchPanel,
    TouchProfile.irFrame => l.touchIrFrame,
  };

  String description(AppLocalizations l) => switch (this) {
    TouchProfile.tablet => l.touchTabletHint,
    TouchProfile.panel => l.touchPanelHint,
    TouchProfile.irFrame => l.touchIrFrameHint,
  };
}

/// Board settings: the board's language, the layout of its tools, the Simple board, who may
/// write (pen or fingers), the touch surface type (tablet, interactive panel, IR touch frame),
/// the AI pen's handwriting models and kiosk mode. A search field at the top narrows them to
/// the sections that match ([initialQuery] when opened from the board's search).
class BoardSettingsDialog extends StatefulWidget {
  const BoardSettingsDialog({super.key, required this.board, this.initialQuery = ''});

  final BoardController board;
  final String initialQuery;

  @override
  State<BoardSettingsDialog> createState() => _BoardSettingsDialogState();
}

class _BoardSettingsDialogState extends State<BoardSettingsDialog> {
  late String _q = widget.initialQuery;

  @override
  Widget build(BuildContext context) {
    final board = widget.board;
    return ListenableBuilder(
      listenable: board,
      builder: (context, _) {
        final l = context.l10n;
        final hint = context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant);
        // Each section: the words it is found by, and what it shows.
        final sections = <(List<String>, List<Widget>)>[
          (
            [l.language, l.languageHint, for (final lang in BoardLanguage.values) lang.label],
            [
              Text(l.language, style: context.text.titleSmall),
              const SizedBox(height: Kx.s4),
              Text(l.languageHint, style: hint),
              const SizedBox(height: Kx.s12),
              SegmentedButton<BoardLanguage>(
                key: const Key('board-language'),
                showSelectedIcon: false,
                segments: [
                  for (final lang in BoardLanguage.values)
                    ButtonSegment(
                      value: lang,
                      label: Text(lang.label, key: Key('board-language-${lang.name}')),
                    ),
                ],
                selected: {board.language},
                onSelectionChanged: (s) => board.setBoardLanguage(s.single),
              ),
            ],
          ),
          (
            [l.appThemeTitle, l.appThemeHint, l.themeLight, l.themeDark, l.themeChalkboard, l.themeSystem],
            [
              Text(l.appThemeTitle, style: context.text.titleSmall),
              const SizedBox(height: Kx.s4),
              Text(l.appThemeHint, style: hint),
              const SizedBox(height: Kx.s12),
              Wrap(
                key: const Key('board-theme'),
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                children: [
                  for (final t in BoardTheme.values)
                    ChoiceChip(
                      key: Key('theme-${t.name}'),
                      label: Text(switch (t) {
                        BoardTheme.light => l.themeLight,
                        BoardTheme.dark => l.themeDark,
                        BoardTheme.chalkboard => l.themeChalkboard,
                        BoardTheme.system => l.themeSystem,
                      }),
                      avatar: Icon(switch (t) {
                        BoardTheme.light => Icons.light_mode_outlined,
                        BoardTheme.dark => Icons.dark_mode_outlined,
                        BoardTheme.chalkboard => Icons.school_outlined,
                        BoardTheme.system => Icons.brightness_auto_outlined,
                      }),
                      showCheckmark: false,
                      selected: board.theme == t,
                      onSelected: (_) => board.setTheme(t),
                    ),
                ],
              ),
            ],
          ),
          (
            [UiStrings.of(context).previewPanel, UiStrings.of(context).previewPanelHint, UiStrings.of(context).display],
            [
              SwitchListTile(
                key: const Key('panel-preview'),
                contentPadding: EdgeInsets.zero,
                secondary: const Icon(Icons.aspect_ratio),
                title: Text(UiStrings.of(context).previewPanel),
                subtitle: Text(UiStrings.of(context).previewPanelHint),
                value: board.panelPreview,
                onChanged: board.setPanelPreview,
              ),
            ],
          ),
          (
            [l.simpleBoardTitle, l.simpleBoardHint],
            [
              Text(l.simpleBoardTitle, style: context.text.titleSmall),
              const SizedBox(height: Kx.s4),
              Text(l.simpleBoardHint, style: hint),
              const SizedBox(height: Kx.s12),
              SegmentedButton<SimpleBoard>(
                key: const Key('simple-board'),
                showSelectedIcon: false,
                segments: [
                  ButtonSegment(value: SimpleBoard.auto, label: Text(l.simpleBoardAuto, key: const Key('simple-auto'))),
                  ButtonSegment(value: SimpleBoard.on, label: Text(l.simpleBoardOn, key: const Key('simple-on'))),
                  ButtonSegment(value: SimpleBoard.off, label: Text(l.simpleBoardOff, key: const Key('simple-off'))),
                ],
                selected: {board.simpleBoard},
                onSelectionChanged: (s) => board.setSimpleBoard(s.single),
              ),
            ],
          ),
          (
            [l.inputTitle, l.inputHint, l.inputPen, l.inputFinger, l.fingerTapsTitle, l.fingerTapsHint],
            [
              Text(l.inputTitle, style: context.text.titleSmall),
              const SizedBox(height: Kx.s4),
              Text(l.inputHint, style: hint),
              const SizedBox(height: Kx.s12),
              SegmentedButton<InputMode>(
                key: const Key('input-mode'),
                showSelectedIcon: false,
                segments: [
                  ButtonSegment(value: InputMode.auto, label: Text(l.inputAuto, key: const Key('input-auto'))),
                  ButtonSegment(value: InputMode.pen, icon: const Icon(Icons.draw_outlined), label: Text(l.inputPen, key: const Key('input-pen'))),
                  ButtonSegment(value: InputMode.finger, icon: const Icon(Icons.touch_app_outlined), label: Text(l.inputFinger, key: const Key('input-finger'))),
                ],
                selected: {board.inputMode},
                onSelectionChanged: (s) => board.setInputMode(s.single),
              ),
              const SizedBox(height: Kx.s8),
              SwitchListTile(
                key: const Key('finger-taps'),
                contentPadding: EdgeInsets.zero,
                title: Text(l.fingerTapsTitle),
                subtitle: Text(l.fingerTapsHint),
                value: board.fingerTaps,
                onChanged: board.setFingerTaps,
              ),
            ],
          ),
          (
            [l.touchScreen, l.touchScreenHint, for (final p in TouchProfile.values) p.label(l)],
            [
              Text(l.touchScreen, style: context.text.titleSmall),
              const SizedBox(height: Kx.s4),
              Text(l.touchScreenHint, style: hint),
              const SizedBox(height: Kx.s8),
              RadioGroup<TouchProfile>(
                groupValue: board.touchProfile,
                onChanged: (p) => board.setTouchProfile(p!),
                child: Column(
                  children: [
                    for (final p in TouchProfile.values)
                      RadioListTile<TouchProfile>(
                        key: Key('touch-${p.name}'),
                        value: p,
                        title: Text(p.label(l)),
                        subtitle: Text(p.description(l)),
                        contentPadding: EdgeInsets.zero,
                      ),
                  ],
                ),
              ),
            ],
          ),
          ([l.aiPen], [AiPenSettingsSection(board: board)]),
          ([l.projectorTitle], [ProjectorSettingsSection(projector: board.projector)]),
          ([l.profilesTitle, l.switchTeacher], [ProfileSettingsSection(board: board)]),
          ([l.kioskTitle], [KioskSettingsSection(kiosk: board.kiosk)]),
        ];
        final shown = matching(sections, (s) => s.$1, _q);
        final c = context.colors;
        // A sheet: the title and search stay at the top, Done at the bottom, the sections
        // scroll between them.
        return Material(
          key: const Key('board-settings'),
          color: Theme.of(context).dialogTheme.backgroundColor ?? c.surface,
          child: SafeArea(
            left: false,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s16, Kx.s8, Kx.s8),
                  child: Row(
                    children: [
                      Icon(Icons.settings_outlined, color: c.onSurfaceVariant),
                      const SizedBox(width: Kx.s12),
                      Expanded(child: Text(l.boardSettings, style: context.text.titleLarge, maxLines: 1, overflow: TextOverflow.ellipsis)),
                      // In the split panel, its own ✕ closes it.
                      if (ModalRoute.of(context) is! PanelDialogRoute)
                        IconButton(key: const Key('settings-close'), tooltip: l.close, onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close)),
                    ],
                  ),
                ),
                ModuleSearchField(
                  key: const Key('settings-search'),
                  hint: SearchStrings.of(context).searchSettings,
                  initial: widget.initialQuery,
                  padding: const EdgeInsets.fromLTRB(Kx.s24, 0, Kx.s24, Kx.s12),
                  onChanged: (v) => setState(() => _q = v),
                ),
                const Divider(height: 1),
                Expanded(
                  // Built all at once (a few sections), so search and "Show me" can reach any.
                  child: SingleChildScrollView(
                    key: const Key('settings-list'),
                    padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s16, Kx.s24, Kx.s24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (shown.isEmpty) Text(SearchStrings.of(context).noneMatch, key: const Key('settings-none'), style: hint),
                        for (final (i, (_, children)) in shown.indexed) ...[
                          if (i > 0) const Padding(padding: EdgeInsets.symmetric(vertical: Kx.s20), child: Divider(height: 1)),
                          ...children,
                        ],
                      ],
                    ),
                  ),
                ),
                const Divider(height: 1),
                Padding(
                  padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s12, Kx.s24, Kx.s12),
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: FilledButton(key: const Key('settings-done'), onPressed: () => Navigator.pop(context), child: Text(l.done)),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// Opens Board settings: a side sheet on a panel (in the split panel, the board writable beside
/// it; along the right edge where there is no split panel), a full-height sheet on a phone. [query] narrows it to the matching sections.
Future<void> showBoardSettings(BuildContext context, BoardController board, {String query = ''}) {
  final phone = MediaQuery.sizeOf(context).shortestSide < 600;
  Widget sheet(BuildContext context) => BoardChromeTheme(child: BoardSettingsDialog(board: board, initialQuery: query));
  if (phone) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: false,
      clipBehavior: Clip.antiAlias,
      builder: (context) => SizedBox(height: MediaQuery.sizeOf(context).height, child: sheet(context)),
    );
  }
  // On a panel it opens in the split panel beside the board, which stays writable.
  final panel = PanelHost.maybeOf(context)?.push ?? PanelHost.active;
  if (panel != null) return panel<void>(sheet);
  return showGeneralDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
    barrierColor: Colors.black26,
    transitionDuration: Kx.fast,
    pageBuilder: (context, _, _) => Align(
      alignment: Alignment.centerRight,
      child: Padding(
        padding: const EdgeInsets.all(Kx.s12),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: math.min(560, MediaQuery.sizeOf(context).width - 2 * Kx.s12)),
          child: Material(
            elevation: 12,
            shadowColor: Colors.black45,
            borderRadius: Kx.radiusXl,
            clipBehavior: Clip.antiAlias,
            child: sheet(context),
          ),
        ),
      ),
    ),
    transitionBuilder: (context, animation, _, child) => SlideTransition(
      position: Tween(begin: const Offset(0.15, 0), end: Offset.zero).animate(CurvedAnimation(parent: animation, curve: Kx.emphasized)),
      child: FadeTransition(opacity: animation, child: child),
    ),
  );
}
