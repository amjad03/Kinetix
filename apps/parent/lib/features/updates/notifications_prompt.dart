import 'package:flutter/material.dart';

import '../../core/app_state.dart';
import '../../l10n/l10n.dart';

/// Asks politely before the system does: what notifications bring, then "Turn on" (the system
/// prompt: Android 13+ POST_NOTIFICATIONS, iOS) or "Not now". Asked once per phone, and only
/// when push is set up in this build.
abstract final class NotificationsPrompt {
  static Future<void> askIfNeeded(BuildContext context, AppState state) async {
    if (!await state.shouldAskForNotifications() || !context.mounted) return;
    final allow = await showDialog<bool>(
      context: context,
      builder: (context) {
        final l = context.l10n;
        return AlertDialog(
          key: const Key('notificationsPrompt'),
          icon: const Icon(Icons.notifications_active_outlined),
          title: Text(l.notificationsTitle),
          content: SingleChildScrollView(child: Text(l.notificationsBody)),
          actions: [
            TextButton(key: const Key('notificationsLater'), onPressed: () => Navigator.pop(context, false), child: Text(l.notNow)),
            FilledButton(key: const Key('notificationsAllow'), onPressed: () => Navigator.pop(context, true), child: Text(l.notificationsAllow)),
          ],
        );
      },
    );
    // Dismissed without an answer: ask again next time.
    if (allow != null) await state.answerNotifications(allow: allow);
  }
}
