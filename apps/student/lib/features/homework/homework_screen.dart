import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';

/// One piece of homework: what to do, by when, and who set it.
class HomeworkScreen extends StatelessWidget {
  const HomeworkScreen({super.key, required this.homework, required this.today, required this.sectionName});

  final Homework homework;
  final DateTime today;
  final String sectionName;

  static Future<void> open(BuildContext context, {required Homework homework, required DateTime today, required String sectionName}) =>
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => HomeworkScreen(homework: homework, today: today, sectionName: sectionName),
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
      appBar: AppBar(title: const Text('Homework')),
      body: LayoutBuilder(
        builder: (context, box) => ListView(
          padding: EdgeInsets.fromLTRB(sideGutter(box.maxWidth), Kx.s8, sideGutter(box.maxWidth), Kx.s32),
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: Pill(Fmt.due(hw.dueOn, today), icon: Icons.event_outlined, background: bg, foreground: fg),
            ),
            const SizedBox(height: Kx.s12),
            Text(hw.title, style: context.text.headlineSmall),
            const SizedBox(height: Kx.s4),
            Text('${hw.subject} · $sectionName', style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
            const SizedBox(height: Kx.s24),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(Kx.s16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Instructions', style: context.text.titleSmall),
                    const SizedBox(height: Kx.s8),
                    SelectableText(
                      hw.instructions.isEmpty ? 'No instructions were added.' : hw.instructions,
                      style: context.text.bodyLarge?.copyWith(height: 1.5),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: Kx.s16),
            fact(Icons.event_outlined, 'Due', Fmt.longDay(hw.dueOn)),
            fact(Icons.person_outline, 'Set by', hw.teacher),
            if (hw.createdAt != null) fact(Icons.schedule_outlined, 'Given on', Fmt.longDay(hw.createdAt!)),
            const SizedBox(height: Kx.s16),
            Text(
              'Hand it in the way your teacher asked. Stuck? Ask KINETIX AI in the Learn tab.',
              style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}
