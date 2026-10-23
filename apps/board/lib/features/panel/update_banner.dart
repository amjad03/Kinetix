import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/panel/panel_controller.dart';
import '../../l10n/l10n.dart';

/// "Zynetix Board 1.4.0 is ready to install": the update the dashboard rolled out to this board,
/// with Update now and Later, the download's progress and what to do when it needs a hand.
/// Device-owner panels install by themselves and show only the progress.
class UpdateBanner extends StatelessWidget {
  const UpdateBanner({super.key, required this.updater});

  final PanelUpdater updater;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: updater,
      builder: (context, _) {
        final o = updater.offer;
        if (o == null || (!updater.prompt && !updater.busy)) return const SizedBox.shrink();
        final l = context.l10n;
        final c = context.colors;
        final String message = switch (updater.phase) {
          UpdatePhase.downloading => l.updateDownloading(((updater.progress ?? 0) * 100).round()),
          UpdatePhase.installing => l.updateInstalling,
          UpdatePhase.failed => l.updateFailed(updater.error ?? ''),
          UpdatePhase.waitingPermission => l.updateNeedsPermission,
          UpdatePhase.opened => l.updateOpened,
          _ => l.updateAvailable(o.version),
        };
        return Material(
          key: const Key('update-banner'),
          color: c.secondaryContainer,
          elevation: 3,
          borderRadius: BorderRadius.circular(Kx.rLg),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s12),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.system_update_alt, color: c.onSecondaryContainer),
                      const SizedBox(width: Kx.s12),
                      Expanded(child: Text(message, style: context.text.titleSmall?.copyWith(color: c.onSecondaryContainer))),
                    ],
                  ),
                  if (o.notes != null && updater.phase == UpdatePhase.available)
                    Padding(
                      padding: const EdgeInsets.only(top: Kx.s4, left: 36),
                      child: Text(o.notes!, maxLines: 3, overflow: TextOverflow.ellipsis, style: context.text.bodySmall?.copyWith(color: c.onSecondaryContainer)),
                    ),
                  if (updater.busy) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: LinearProgressIndicator(value: updater.phase == UpdatePhase.downloading ? updater.progress : null)),
                  if (!updater.busy)
                    Align(
                      alignment: Alignment.centerRight,
                      child: Wrap(
                        spacing: Kx.s8,
                        children: [
                          TextButton(key: const Key('update-later'), onPressed: updater.postpone, child: Text(l.updateLater)),
                          FilledButton(key: const Key('update-now'), onPressed: () => unawaited(updater.apply()), child: Text(l.updateNow)),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
