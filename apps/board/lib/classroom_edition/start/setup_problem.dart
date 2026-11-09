import 'package:flutter/material.dart';

import '../local/classroom_store.dart';
import '../ui/ce_style.dart';

/// Over the start screen when the board's saved college set-up could not be read
/// ([ClassroomStore.problem]): what the board is showing now, that the damaged copy is kept,
/// and the two ways on: keep this, or restore a backup.
class CeSetupProblemBanner extends StatelessWidget {
  const CeSetupProblemBanner({super.key, required this.problem, required this.onKeep, this.onRestore});

  final SetupProblem problem;
  final VoidCallback onKeep;

  /// Restore a backup (Settings → Backup & restore, after the PIN); null hides the button.
  final VoidCallback? onRestore;

  @override
  Widget build(BuildContext context) => Container(
    key: const Key('ce-setup-problem'),
    constraints: const BoxConstraints(maxWidth: 1100),
    padding: const EdgeInsets.fromLTRB(32, 26, 32, 26),
    decoration: ceCard(color: CeC.butter, r: 28),
    child: Row(
      children: [
        ceIconDot(Icons.report_problem_outlined, bg: Colors.white, size: 64),
        const SizedBox(width: 24),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('This board’s college settings could not be read', style: ceHeading(26)),
              const SizedBox(height: 8),
              Text(
                problem.usedPrevious
                    ? 'The board is using the copy saved just before the last change, so check the newest teachers, classes and periods. The damaged copy is kept safely on the board.'
                    : 'The board is showing the standard classes for now. The damaged copy is kept safely on the board: restore a backup to get your teachers, classes and timetable back.',
                style: ceText(17, c: CeC.navy),
              ),
            ],
          ),
        ),
        const SizedBox(width: 24),
        SizedBox(
          width: 300,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (onRestore != null) ...[
                FilledButton.icon(
                  key: const Key('ce-setup-restore'),
                  style: ceBigButton(),
                  onPressed: onRestore,
                  icon: const Icon(Icons.settings_backup_restore),
                  label: const Text('Restore a backup'),
                ),
                const SizedBox(height: 12),
              ],
              OutlinedButton(key: const Key('ce-setup-keep'), style: ceSoftButton(), onPressed: onKeep, child: Text(problem.usedPrevious ? 'Keep this copy' : 'Start with these classes')),
            ],
          ),
        ),
      ],
    ),
  );
}
