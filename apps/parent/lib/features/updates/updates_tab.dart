import 'package:flutter/material.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';

import '../../core/family.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import '../attendance/attendance_screen.dart';
import '../boards/board_screen.dart';
import '../calendar/calendar_screen.dart';
import '../fees/fees_screen.dart';
import '../fees/receipt_screen.dart';
import '../homework/homework_screen.dart';
import '../library/library.dart';
import '../marks/marks.dart';
import '../messages/chat_screen.dart';
import '../messages/messages_controller.dart';
import 'message_screen.dart';
import 'updates_controller.dart';

/// Notifications grouped Today / Earlier. Tapping one marks it read and opens what it is about.
class UpdatesTab extends StatelessWidget {
  const UpdatesTab({super.key, required this.controller, required this.family, required this.messages, this.now});

  final UpdatesController controller;
  final FamilyController family;
  final MessagesController messages;

  /// For tests; defaults to the device clock.
  final DateTime Function()? now;

  static IconData iconFor(NotificationKind k) => switch (k) {
    NotificationKind.absence => Icons.person_off,
    NotificationKind.homework => Icons.assignment,
    NotificationKind.boardShared => Icons.co_present,
    NotificationKind.recording => Icons.play_circle,
    NotificationKind.fee => Icons.currency_rupee,
    NotificationKind.library => Icons.local_library,
    NotificationKind.marks => Icons.grading,
    NotificationKind.message => Icons.forum,
    NotificationKind.broadcast => Icons.campaign,
    NotificationKind.calendar => Icons.event,
    NotificationKind.other => Icons.notifications,
  };

  /// Opens what [n] is about (from the list, or from a tapped push notification) and marks it read.
  static Future<void> openNotification(
    BuildContext context,
    AppNotification n, {
    required UpdatesController controller,
    required FamilyController family,
    required MessagesController messages,
  }) async {
    controller.markRead(n);
    final api = family.api;
    switch (n.kind) {
      case NotificationKind.absence:
        if (family.children.isEmpty) await family.load();
        final child = family.byId(n.studentId) ?? family.selected;
        final date = n.data['date'] is String ? parseIsoDate(n.data['date'] as String) : null;
        if (child != null && context.mounted) return AttendanceScreen.open(context, api, child, highlightDate: date);
      case NotificationKind.homework:
        // New homework names the class; "checked" and "to redo" name the child.
        final found = n.homeworkId == null
            ? null
            : await family.findHomework(n.homeworkId!, sectionId: n.sectionId, studentId: n.studentId);
        if (found != null && context.mounted) {
          final (child, hw) = found;
          return HomeworkScreen.open(context, api, homework: hw, today: family.summaryOf(child.id)?.today ?? DateTime.now(), child: child);
        }
      case NotificationKind.boardShared:
        if (n.whiteboardId != null && context.mounted) return BoardScreen.open(context, api, n.whiteboardId!);
      case NotificationKind.recording:
        if (n.recordingId != null && context.mounted) {
          return LessonPlayerScreen.open(
            context,
            source: ParentLessonSource(api),
            recordingId: n.recordingId!,
            initial: family.findRecording(n.recordingId!, sectionId: n.sectionId)?.$2,
          );
        }
      case NotificationKind.fee:
        // "Payment received" → its receipt; "Fee due" → that child's fees.
        if (n.paymentId != null && context.mounted) return ReceiptScreen.open(context, api, paymentId: n.paymentId!);
        // The title is "Fee due: <fee>" in the parent's language (see services/api notifications/texts.ts).
        final prefix = const ['Fee due: ', 'फ़ीस देय: ', 'ಶುಲ್ಕ ಬಾಕಿ: '].where(n.title.startsWith).firstOrNull;
        final child = await family.findFeeChild(title: prefix == null ? null : n.title.substring(prefix.length));
        if (child != null && context.mounted) return FeesScreen.open(context, family, child);
      case NotificationKind.library:
        if (family.children.isEmpty) await family.load();
        final child = family.byId(n.studentId);
        if (child != null && context.mounted) return LibraryScreen.open(context, family, child);
      case NotificationKind.marks:
        // "Marks published": that assessment's result for the child in the class, else all their results.
        final found = await family.findAssessment(n.assessmentId, sectionId: n.sectionId);
        if (found != null && context.mounted) {
          final (child, result) = found;
          if (result != null) return AssessmentScreen.open(context, child: child, result: result);
          return ResultsScreen.open(context, family, child);
        }
      case NotificationKind.message:
        if (n.conversationId != null && context.mounted) return ChatScreen.open(context, messages, n.conversationId!);
      case NotificationKind.calendar:
        return CalendarScreen.open(context, api, highlightId: n.calendarEventId);
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
        final multipleChildren = family.children.length > 1;

        Widget tile(AppNotification n) => NotificationTile(
          n: n,
          today: today,
          child: multipleChildren ? _childFor(n) : null,
          onTap: () => openNotification(context, n, controller: controller, family: family, messages: messages),
        );

        return RefreshIndicator(
          onRefresh: controller.load,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverAppBar.large(
                title: Text(context.l10n.navUpdates),
                actions: [
                  if (controller.unread > 0)
                    // An icon with a tooltip: the words don't fit the bar in every language.
                    IconButton(
                      key: const Key('markAllRead'),
                      tooltip: context.l10n.markAllRead,
                      onPressed: controller.markAllRead,
                      icon: const Icon(Icons.done_all),
                    ),
                  const SizedBox(width: Kx.s8),
                ],
              ),
              if (controller.error != null)
                SliverPadding(
                  padding: const EdgeInsets.all(Kx.s16),
                  sliver: SliverToBoxAdapter(child: ErrorBanner(controller.error!, onRetry: controller.load)),
                ),
              if (!controller.loaded && controller.loading)
                const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
              else if (controller.loaded && items.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: KxEmptyState(icon: Icons.notifications_none, message: context.l10n.noUpdates),
                )
              else ...[
                if (todays.isNotEmpty) ...[
                  SliverToBoxAdapter(child: _GroupHeader(context.l10n.today)),
                  SliverList.list(children: [for (final n in todays) tile(n)]),
                ],
                if (earlier.isNotEmpty) ...[
                  SliverToBoxAdapter(child: _GroupHeader(context.l10n.earlier)),
                  SliverList.list(children: [for (final n in earlier) tile(n)]),
                ],
                const SliverToBoxAdapter(child: SizedBox(height: Kx.s24)),
              ],
            ],
          ),
        );
      },
    );
  }

  /// Which child an update is about, when it says so (absences, homework, boards, recordings, payments).
  Child? _childFor(AppNotification n) {
    final byId = family.byId(n.studentId);
    if (byId != null) return byId;
    final inSection = family.inSection(n.sectionId).toList();
    return inSection.length == 1 ? inSection.single : null;
  }
}

class _GroupHeader extends StatelessWidget {
  const _GroupHeader(this.title);

  final String title;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, Kx.s4),
    child: Text(title, style: context.text.titleSmall?.copyWith(color: context.colors.primary)),
  );
}

class NotificationTile extends StatelessWidget {
  const NotificationTile({super.key, required this.n, required this.today, required this.onTap, this.child});

  final AppNotification n;
  final DateTime today;
  final VoidCallback onTap;
  final Child? child;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (bg, fg) = switch (n.kind) {
      NotificationKind.absence => (c.errorContainer, c.error),
      NotificationKind.homework => (c.secondaryContainer, c.onSecondaryContainer),
      NotificationKind.boardShared => (c.tertiaryContainer, c.onTertiaryContainer),
      NotificationKind.recording => (c.tertiaryContainer, c.onTertiaryContainer),
      _ => (c.primaryContainer, c.onPrimaryContainer),
    };
    final f = context.fmt;
    final when = Fmt.daysBetween(n.createdAt, today) == 0 ? f.time(n.createdAt) : f.relativeDay(n.createdAt, today);
    return InkWell(
      key: Key('notification-${n.id}'),
      onTap: onTap,
      child: Container(
        color: n.unread ? c.primaryContainer.withValues(alpha: 0.25) : null,
        padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s12, Kx.s16, Kx.s12),
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
                    children: [
                      Expanded(
                        flex: 3,
                        child: Text(
                          n.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: context.text.titleSmall?.copyWith(fontWeight: n.unread ? FontWeight.w700 : FontWeight.w500),
                        ),
                      ),
                      const SizedBox(width: Kx.s8),
                      // A long day name ("ಮಂಗಳ 29 ಸೆಪ್ಟೆಂ") wraps rather than squeezing past the edge.
                      Flexible(
                        flex: 2,
                        child: Text(
                          when,
                          textAlign: TextAlign.end,
                          style: context.text.labelMedium?.copyWith(color: n.unread ? c.primary : c.onSurfaceVariant),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    n.displayBody,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
                  ),
                  if (child != null) ...[
                    const SizedBox(height: Kx.s4),
                    Text(
                      child!.firstName,
                      style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant, fontWeight: FontWeight.w500),
                    ),
                  ],
                ],
              ),
            ),
            SizedBox(
              width: 20,
              child: n.unread
                  ? Padding(
                      padding: const EdgeInsets.only(top: 22, left: 10),
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
