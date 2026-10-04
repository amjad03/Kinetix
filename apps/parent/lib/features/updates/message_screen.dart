import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/format.dart';
import '../../core/models.dart';
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
    final from = switch (n.kind) {
      NotificationKind.broadcast => 'Message from the college',
      NotificationKind.absence => 'Attendance',
      NotificationKind.homework => 'Homework',
      NotificationKind.boardShared => 'Class board',
      NotificationKind.recording => 'Lesson recording',
      NotificationKind.fee => 'Fees',
      NotificationKind.library => 'Library',
      NotificationKind.marks => 'Results',
      NotificationKind.message => 'Message',
      NotificationKind.other => 'Update',
    };
    return Scaffold(
      appBar: AppBar(title: Text(from)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
        children: [
          Row(
            children: [
              Icon(UpdatesTab.iconFor(n.kind), color: c.primary),
              const SizedBox(width: Kx.s8),
              Expanded(
                child: Text(
                  '${Fmt.longDay(n.createdAt)} · ${Fmt.time(n.createdAt)}',
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
    );
  }
}
