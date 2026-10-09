import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/study.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'peer_review_screen.dart';
import 'submission_panel.dart';

/// One piece of homework: what to do, by when, who set it, and handing it in.
class HomeworkScreen extends StatelessWidget {
  const HomeworkScreen({super.key, required this.homework, required this.study});

  final Homework homework;
  final StudyController study;

  static Future<void> open(BuildContext context, StudyController study, Homework homework) => Navigator.of(context).push(
    MaterialPageRoute(builder: (_) => HomeworkScreen(homework: homework, study: study)),
  );

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final hw = homework;
    final today = study.today;
    final sectionName = study.student.sectionName;
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
      body: LayoutBuilder(
        builder: (context, box) => ListView(
          padding: EdgeInsets.fromLTRB(sideGutter(box.maxWidth), Kx.s8, sideGutter(box.maxWidth), Kx.s32),
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: Pill(context.fmt.due(hw.dueOn, today), icon: Icons.event_outlined, background: bg, foreground: fg),
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
            SubmissionPanel(api: study.api, homework: hw, studentId: study.student.id),
            const SizedBox(height: Kx.s8),
            OutlinedButton.icon(
              key: const Key('openPeerReview'),
              onPressed: () => PeerReviewScreen.open(context, study.api, hw.id),
              icon: const Icon(Icons.rate_review_outlined),
              label: Text(context.l10n.peerOpen),
            ),
            const SizedBox(height: Kx.s16),
            fact(Icons.event_outlined, context.l10n.factDue, context.fmt.longDay(hw.dueOn)),
            fact(Icons.person_outline, context.l10n.setBy, hw.teacher),
            if (hw.createdAt != null) fact(Icons.schedule_outlined, context.l10n.givenOn, context.fmt.longDay(hw.createdAt!)),
            const SizedBox(height: Kx.s16),
            Text(
              context.l10n.homeworkHandIn(context.l10n.navLearn),
              style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}
