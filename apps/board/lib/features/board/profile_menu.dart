import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
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
    Widget item(IconData icon, String label, VoidCallback onTap, {bool soon = false, Key? key}) => ListTile(
      key: key,
      leading: Icon(icon),
      title: Text(label),
      trailing: soon ? Text('Soon', style: context.text.labelSmall?.copyWith(color: c.onSurfaceVariant)) : null,
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
                        Text(s?.teacherName ?? 'Guest', style: context.text.titleMedium),
                        Text(
                          s == null ? (board.deviceName ?? 'Practice board') : (s.classLabel ?? 'No class timetabled now'),
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
                  label: const Text('Sign in with Teacher app'),
                ),
              ),
            const Divider(height: Kx.s16),
            item(Icons.note_add_outlined, 'New page', onNewPage),
            item(Icons.folder_open_outlined, 'Import PDF, PPT or image', () {}, soon: true),
            item(Icons.dashboard_outlined, 'Your whiteboards', onWhiteboards, key: const Key('menu-whiteboards')),
            if (onRecordings != null)
              ListTile(
                key: const Key('menu-recordings'),
                leading: const Icon(Icons.video_library_outlined),
                title: const Text('Recordings'),
                trailing: board.recordings.pending == 0
                    ? null
                    : Text('${board.recordings.pending} to upload', style: context.text.labelSmall?.copyWith(color: c.onSurfaceVariant)),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Kx.rMd)),
                onTap: () {
                  onClose();
                  onRecordings!();
                },
              ),
            item(Icons.cast_outlined, 'Screen projection', () {}, soon: true),
            const Divider(height: Kx.s16),
            item(Icons.settings_outlined, 'Board settings', onSettings, key: const Key('menu-settings')),
            item(Icons.school_outlined, 'Guided tour & practice', () {}, soon: true),
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

/// Board settings: the touch surface type (tablet, interactive panel, IR touch frame).
class BoardSettingsDialog extends StatelessWidget {
  const BoardSettingsDialog({super.key, required this.board});

  final BoardController board;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: board,
      builder: (context, _) => AlertDialog(
        icon: const Icon(Icons.settings_outlined),
        title: const Text('Board settings'),
        content: SizedBox(
          width: 560,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Touch screen', style: context.text.titleSmall),
              const SizedBox(height: Kx.s4),
              Text(
                'Choose the hardware this board runs on. It decides what a palm or a large touch does.',
                style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant),
              ),
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
                        title: Text(p.label),
                        subtitle: Text(p.description),
                        contentPadding: EdgeInsets.zero,
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
        actions: [FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Done'))],
      ),
    );
  }
}
