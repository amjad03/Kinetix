import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import '../../l10n/l10n.dart';

/// Board settings → This board: the server the board is registered with, and Set up again for a
/// board moved to another network or server. While kiosk mode holds the board, IT unlocks it with
/// the IT PIN first, so a student cannot take the board out of its school.
class ThisBoardSection extends StatelessWidget {
  const ThisBoardSection({super.key, required this.board});

  final BoardController board;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: board.kiosk,
    builder: (context, _) {
      final l = context.l10n;
      final hint = context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant);
      final kiosk = board.kiosk.wanted;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l.thisBoardTitle, style: context.text.titleSmall),
          const SizedBox(height: Kx.s4),
          Text(l.thisBoardServer(board.deviceName ?? '', board.serverUrl ?? ''), key: const Key('this-board-server'), style: context.text.bodyMedium),
          const SizedBox(height: Kx.s4),
          Text(kiosk ? l.setUpAgainKiosk : l.setUpAgainHint, style: hint),
          const SizedBox(height: Kx.s8),
          OutlinedButton.icon(
            key: const Key('set-up-again'),
            onPressed: kiosk ? null : () => _confirm(context),
            icon: const Icon(Icons.settings_backup_restore),
            label: Text(l.setUpAgain),
          ),
        ],
      );
    },
  );

  Future<void> _confirm(BuildContext context) async {
    final l = context.l10n;
    final navigator = Navigator.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        key: const Key('set-up-again-dialog'),
        title: Text(l.setUpAgainTitle),
        content: SizedBox(width: 460, child: Text(l.setUpAgainBody(board.serverUrl ?? ''))),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l.cancel)),
          FilledButton(key: const Key('set-up-again-confirm'), onPressed: () => Navigator.pop(context, true), child: Text(l.setUpAgain)),
        ],
      ),
    );
    if (ok != true) return;
    // Board settings may be a sheet over the board: close it, so the set-up screen is not hidden.
    navigator.popUntil((r) => r.isFirst);
    await board.setUpAgain();
  }
}
