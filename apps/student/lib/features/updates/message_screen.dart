import 'package:flutter/material.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart' show LessonStrings;
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'updates_tab.dart';

/// The full text of an update: a message from the college, or one we can't open more specifically.
class MessageScreen extends StatelessWidget {
  const MessageScreen({super.key, required this.notification});

  final AppNotification notification;

  static Future<void> open(BuildContext context, AppNotification n) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => MessageScreen(notification: n)));

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final n = notification;
    final l = context.l10n;
    final from = switch (n.kind) {
      NotificationKind.broadcast => l.fromCollege,
      NotificationKind.absence => l.attendance,
      NotificationKind.homework => l.homework,
      NotificationKind.boardShared => l.classBoard,
      NotificationKind.recording => LessonStrings.of(context).lessonRecording,
      NotificationKind.fee => l.fees,
      NotificationKind.library => l.library,
      NotificationKind.marks => l.results,
      NotificationKind.message => l.message,
      NotificationKind.live => l.liveClass,
      NotificationKind.calendar => l.calendar,
      NotificationKind.other => l.update,
    };
    return Scaffold(
      appBar: AppBar(title: Text(from)),
      body: LayoutBuilder(
        builder: (context, box) => ListView(
          padding: EdgeInsets.fromLTRB(sideGutter(box.maxWidth), Kx.s8, sideGutter(box.maxWidth), Kx.s32),
          children: [
            Row(
              children: [
                Icon(UpdatesTab.iconFor(n.kind), color: c.primary),
                const SizedBox(width: Kx.s8),
                Expanded(
                  child: Text(
                    '${context.fmt.longDay(n.createdAt)} · ${context.fmt.time(n.createdAt)}',
                    style: context.text.labelLarge?.copyWith(color: c.onSurfaceVariant),
                  ),
                ),
              ],
            ),
            const SizedBox(height: Kx.s16),
            Text(n.title, style: context.text.headlineSmall),
            const SizedBox(height: Kx.s16),
            SelectableText(n.displayBody, style: context.text.bodyLarge?.copyWith(height: 1.5)),
          ],
        ),
      ),
    );
  }
}
