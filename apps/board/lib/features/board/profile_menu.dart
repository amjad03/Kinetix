import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import '../../l10n/l10n.dart';
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
  });

  final BoardController board;
  final VoidCallback onSignIn;
  final VoidCallback onNewPage;
  final VoidCallback onWhiteboards;
  final VoidCallback? onRecordings;
  final VoidCallback onSettings;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final s = board.session;
    final l = context.l10n;
    Widget item(IconData icon, String label, VoidCallback onTap, {bool soon = false, Key? key}) => ListTile(
      key: key,
      leading: Icon(icon),
      title: Text(label),
      trailing: soon ? Text(l.soon, style: context.text.labelSmall?.copyWith(color: c.onSurfaceVariant)) : null,
      dense: false,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Kx.rMd)),
      onTap: () {
        onClose();
        soon ? showComingSoon(context, label) : onTap();
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
            item(Icons.folder_open_outlined, l.importFiles, () {}, soon: true),
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
            item(Icons.cast_outlined, l.screenProjection, () {}, soon: true),
            const Divider(height: Kx.s16),
            item(Icons.settings_outlined, l.boardSettings, onSettings, key: const Key('menu-settings')),
            item(Icons.school_outlined, l.guidedTour, () {}, soon: true),
            Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s8),
              child: Text('KINETIX Board 0.2.0', style: context.text.labelSmall?.copyWith(color: c.onSurfaceVariant)),
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

/// Board settings: the board's language and the touch surface type (tablet, interactive
/// panel, IR touch frame).
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
          ),
          actions: [FilledButton(onPressed: () => Navigator.pop(context), child: Text(l.done))],
        );
      },
    );
  }
}
