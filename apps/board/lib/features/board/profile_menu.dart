import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart' show InputMode;
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import '../../l10n/l10n.dart';
import '../kiosk/kiosk_ui.dart';
import '../profiles/profiles_ui.dart';
import '../projector/projector_ui.dart';
import 'ai_pen_ui.dart';
import 'chrome.dart';

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
    this.onRecordings,
    this.onImport,
    this.onHelp,
    this.onTour,
  });

  final BoardController board;
  final VoidCallback onSignIn;
  final VoidCallback onNewPage;
  final VoidCallback onWhiteboards;
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
            item(Icons.note_add_outlined, l.toolNewPage, onNewPage),
            if (onImport != null) item(Icons.folder_open_outlined, l.importFiles, onImport!, key: const Key('menu-import')),
            item(Icons.dashboard_outlined, l.yourWhiteboards, onWhiteboards, key: const Key('menu-whiteboards')),
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
            item(Icons.settings_outlined, l.boardSettings, onSettings, key: const Key('menu-settings')),
            if (onHelp != null) item(Icons.help_outline, l.helpTitle, onHelp!, key: const Key('menu-help')),
            if (onTour != null) item(Icons.school_outlined, l.guidedTour, onTour!, key: const Key('menu-tour')),
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
/// the AI pen's handwriting models and kiosk mode.
class BoardSettingsDialog extends StatelessWidget {
  const BoardSettingsDialog({super.key, required this.board});

  final BoardController board;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: board,
      builder: (context, _) {
        final l = context.l10n;
        final hint = context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant);
        return AlertDialog(
          icon: const Icon(Icons.settings_outlined),
          title: Text(l.boardSettings),
          // Scrolls on a 720p board in the longer languages.
          scrollable: true,
          content: SizedBox(
            width: 560,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
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
                const SizedBox(height: Kx.s24),
                Text(l.layoutTitle, style: context.text.titleSmall),
                const SizedBox(height: Kx.s4),
                Text(l.layoutHint, style: hint),
                const SizedBox(height: Kx.s12),
                SegmentedButton<BoardLayout>(
                  key: const Key('board-layout'),
                  showSelectedIcon: false,
                  segments: [
                    ButtonSegment(value: BoardLayout.rails, icon: const Icon(Icons.view_sidebar_outlined), label: Text(l.layoutRails, key: const Key('layout-rails'))),
                    ButtonSegment(value: BoardLayout.bottomBar, icon: const Icon(Icons.call_to_action_outlined), label: Text(l.layoutBottomBar, key: const Key('layout-bottomBar'))),
                  ],
                  selected: {board.layout},
                  onSelectionChanged: (s) => board.setLayout(s.single),
                ),
                const SizedBox(height: Kx.s24),
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
                const SizedBox(height: Kx.s24),
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
                const SizedBox(height: Kx.s24),
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
                const SizedBox(height: Kx.s24),
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
                const SizedBox(height: Kx.s24),
                AiPenSettingsSection(board: board),
                const SizedBox(height: Kx.s24),
                ProjectorSettingsSection(projector: board.projector),
                const SizedBox(height: Kx.s24),
                ProfileSettingsSection(board: board),
                const SizedBox(height: Kx.s24),
                KioskSettingsSection(kiosk: board.kiosk),
              ],
            ),
          ),
          actions: [FilledButton(onPressed: () => Navigator.pop(context), child: Text(l.done))],
        );
      },
    );
  }
}
