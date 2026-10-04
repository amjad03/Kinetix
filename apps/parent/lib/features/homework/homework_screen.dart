import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// One piece of homework: what to do, by when, and who set it.
class HomeworkScreen extends StatelessWidget {
  const HomeworkScreen({super.key, required this.homework, required this.today, required this.child});

  final Homework homework;
  final DateTime today;
  final Child child;

  static Future<void> open(BuildContext context, {required Homework homework, required DateTime today, required Child child}) =>
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => HomeworkScreen(homework: homework, today: today, child: child),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final hw = homework;
    final days = Fmt.daysBetween(today, hw.dueOn);
    final (bg, fg) = days < 0
        ? (c.surfaceContainerHighest, c.onSurfaceVariant)
        : days <= 1
        ? (Tone.warnContainer(context), Tone.warn(context))
        : (c.secondaryContainer, c.onSecondaryContainer);

    Widget fact(IconData icon, String label, String value) => Padding(
      padding: const EdgeInsets.symmetric(vertical: Kx.s8),
      child: Row(
        children: [
          Icon(icon, color: c.onSurfaceVariant),
          const SizedBox(width: Kx.s16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant)),
                Text(value, style: context.text.bodyLarge),
              ],
            ),
          ),
        ],
      ),
    );

    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.homework)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Pill(context.fmt.due(hw.dueOn, today), icon: Icons.event_outlined, background: bg, foreground: fg),
          ),
          const SizedBox(height: Kx.s12),
          Text(hw.title, style: context.text.headlineSmall),
          const SizedBox(height: Kx.s4),
          Text('${hw.subject} · ${child.sectionName}', style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
          const SizedBox(height: Kx.s24),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(Kx.s16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(context.l10n.instructions, style: context.text.titleSmall),
                  const SizedBox(height: Kx.s8),
                  SelectableText(
                    hw.instructions.isEmpty ? context.l10n.noInstructions : hw.instructions,
                    style: context.text.bodyLarge?.copyWith(height: 1.5),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: Kx.s16),
          fact(Icons.event_outlined, context.l10n.factDue, context.fmt.longDay(hw.dueOn)),
          fact(Icons.person_outline, context.l10n.setBy, hw.teacher),
          if (hw.createdAt != null) fact(Icons.schedule_outlined, context.l10n.givenOn, context.fmt.longDay(hw.createdAt!)),
          fact(Icons.face_outlined, context.l10n.homeworkFor, '${child.fullName} · ${child.sectionName}'),
        ],
      ),
    );
  }
}
