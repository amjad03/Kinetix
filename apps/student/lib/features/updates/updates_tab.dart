import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/study.dart';
import '../../widgets/common.dart';
import '../attendance/attendance_screen.dart';
import '../boards/board_screen.dart';
import '../fees/fees_screen.dart';
import '../homework/homework_screen.dart';
import '../recordings/recordings.dart';
import 'message_screen.dart';
import 'updates_controller.dart';

/// Notifications grouped Today / Earlier. Tapping one marks it read and opens what it is about.
class UpdatesTab extends StatelessWidget {
  const UpdatesTab({super.key, required this.controller, required this.study, this.now});

  final UpdatesController controller;
  final StudyController study;

  /// For tests; defaults to the device clock.
  final DateTime Function()? now;

  static IconData iconFor(NotificationKind k) => switch (k) {
    NotificationKind.absence => Icons.person_off,
    NotificationKind.homework => Icons.assignment,
    NotificationKind.boardShared => Icons.co_present,
    NotificationKind.recording => Icons.play_circle,
    NotificationKind.fee => Icons.receipt_long,
    NotificationKind.broadcast => Icons.campaign,
    NotificationKind.other => Icons.notifications,
  };

  Future<void> _open(BuildContext context, AppNotification n) async {
    controller.markRead(n);
    final api = study.api;
    switch (n.kind) {
      case NotificationKind.absence:
        final date = n.data['date'] is String ? parseIsoDate(n.data['date'] as String) : null;
        return AttendanceScreen.open(context, api, study.student, highlightDate: date);
      case NotificationKind.homework:
        final hw = n.homeworkId == null ? null : await study.findHomework(n.homeworkId!);
        if (hw != null && context.mounted) {
          return HomeworkScreen.open(context, homework: hw, today: study.today, sectionName: study.student.sectionName);
        }
      case NotificationKind.boardShared:
        if (n.whiteboardId != null) return BoardScreen.open(context, api, n.whiteboardId!);
      case NotificationKind.recording:
        if (n.recordingId != null) return openRecording(context, api, n.recordingId!, initial: study.findRecording(n.recordingId!));
      case NotificationKind.fee:
        if (n.paymentId != null) return ReceiptScreen.open(context, api, n.paymentId!);
        return FeesScreen.open(context, api, study.student.id, today: study.today);
      case NotificationKind.broadcast:
      case NotificationKind.other:
        break;
    }
    // Anything we can't open more specifically (or that is no longer available) shows the full message.
    if (context.mounted) await MessageScreen.open(context, n);
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final today = (now ?? DateTime.now)();
        final items = controller.items;
        final todays = items.where((n) => Fmt.daysBetween(n.createdAt, today) == 0).toList();
        final earlier = items.where((n) => Fmt.daysBetween(n.createdAt, today) != 0).toList();

        Widget group(String title, List<AppNotification> list) => CenteredSliver(
          sliver: SliverList.list(
            children: [
              _GroupHeader(title),
              for (final n in list) NotificationTile(n: n, today: today, onTap: () => _open(context, n)),
            ],
          ),
        );

        return RefreshIndicator(
          onRefresh: controller.load,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverAppBar.large(
                title: const Text('Updates'),
                actions: [
                  if (controller.unread > 0)
                    IconButton(
                      key: const Key('markAllRead'),
                      tooltip: 'Mark all as read',
                      onPressed: controller.markAllRead,
                      icon: const Icon(Icons.done_all),
                    ),
                  const SizedBox(width: Kx.s8),
                ],
              ),
              if (controller.error != null)
                CenteredSliver(
                  top: Kx.s8,
                  bottom: Kx.s8,
                  sliver: SliverToBoxAdapter(child: ErrorBanner(controller.error!, onRetry: controller.load)),
                ),
              if (!controller.loaded && controller.loading)
                const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
              else if (controller.loaded && items.isEmpty)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: KxEmptyState(
                    icon: Icons.notifications_none,
                    message: "You're all caught up.\nNew homework, shared boards, lesson recordings and messages from your college will appear here.",
                  ),
                )
              else ...[
                if (todays.isNotEmpty) group('Today', todays),
                if (earlier.isNotEmpty) group('Earlier', earlier),
                const SliverToBoxAdapter(child: SizedBox(height: Kx.s24)),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _GroupHeader extends StatelessWidget {
  const _GroupHeader(this.title);

  final String title;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(0, Kx.s16, 0, Kx.s4),
    child: Text(title, style: context.text.titleSmall?.copyWith(color: context.colors.primary)),
  );
}

class NotificationTile extends StatelessWidget {
  const NotificationTile({super.key, required this.n, required this.today, required this.onTap});

  final AppNotification n;
  final DateTime today;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (bg, fg) = switch (n.kind) {
      NotificationKind.absence => (c.errorContainer, c.error),
      NotificationKind.homework => (c.secondaryContainer, c.onSecondaryContainer),
      NotificationKind.boardShared => (c.tertiaryContainer, c.onTertiaryContainer),
      NotificationKind.recording => (c.tertiaryContainer, c.onTertiaryContainer),
      NotificationKind.fee => (Tone.warnContainer(context), Tone.warn(context)),
      _ => (c.primaryContainer, c.onPrimaryContainer),
    };
    final when = Fmt.daysBetween(n.createdAt, today) == 0 ? Fmt.time(n.createdAt) : Fmt.relativeDay(n.createdAt, today);
    return InkWell(
      key: Key('notification-${n.id}'),
      borderRadius: Kx.radiusMd,
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(color: n.unread ? c.primaryContainer.withValues(alpha: 0.25) : null, borderRadius: Kx.radiusMd),
        padding: const EdgeInsets.fromLTRB(Kx.s8, Kx.s12, Kx.s4, Kx.s12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            IconBadge(UpdatesTab.iconFor(n.kind), background: bg, foreground: fg),
            const SizedBox(width: Kx.s16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          n.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: context.text.titleSmall?.copyWith(fontWeight: n.unread ? FontWeight.w700 : FontWeight.w500),
                        ),
                      ),
                      const SizedBox(width: Kx.s8),
                      Text(when, style: context.text.labelMedium?.copyWith(color: n.unread ? c.primary : c.onSurfaceVariant)),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    n.displayBody,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
                  ),
                ],
              ),
            ),
            SizedBox(
              width: 20,
              child: n.unread
                  ? Padding(
                      padding: const EdgeInsets.only(top: 22, left: 6),
                      child: Container(
                        key: const Key('unreadDot'),
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(color: c.primary, shape: BoxShape.circle),
                      ),
                    )
                  : null,
            ),
          ],
        ),
      ),
    );
  }
}
