import 'package:flutter/material.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';

/// Opens the lesson player for one of the child's class recordings.
Future<void> openRecording(BuildContext context, ParentApi api, RecordingInfo r) =>
    LessonPlayerScreen.open(context, source: ParentLessonSource(api), recordingId: r.id, initial: r);

/// Home card: lessons the teachers recorded and shared, the ones the child missed first.
class RecordingsCard extends StatelessWidget {
  const RecordingsCard({super.key, required this.child, required this.summary, required this.api});

  static const shown = 3;

  final Child child;
  final ChildSummary summary;
  final ParentApi api;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final all = summary.recordingsMissedFirst;
    final missed = all.where((r) => r.missed).length;
    void seeAll() => ChildRecordingsScreen.open(context, child: child, summary: summary, api: api);
    return SectionCard(
      key: const Key('recordingsCard'),
      icon: Icons.play_circle_outline,
      title: 'Lesson recordings',
      caption: missed > 0 ? '$missed missed' : null,
      footer: all.length > shown ? CardLink('See all ${all.length} recordings', onTap: seeAll) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (all.isEmpty)
            Text(
              'When a teacher records a lesson on the board and shares it, it appears here so ${child.firstName} can watch it again.',
              style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
            ),
          for (final r in all.take(shown)) RecordingRow(recording: r, today: summary.today, onTap: () => openRecording(context, api, r)),
        ],
      ),
    );
  }
}

/// One recording: subject, title, teacher, day and length, and "Missed this class" when the
/// child was absent for it.
class RecordingRow extends StatelessWidget {
  const RecordingRow({super.key, required this.recording, required this.today, required this.onTap});

  final RecordingInfo recording;
  final DateTime today;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final r = recording;
    final headline = r.subjectName ?? r.title;
    return InkWell(
      key: Key('recording-${r.id}'),
      borderRadius: Kx.radiusMd,
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: Kx.s8),
        child: Row(
          children: [
            IconBadge(
              Icons.play_arrow_rounded,
              background: r.missed ? c.errorContainer : c.tertiaryContainer,
              foreground: r.missed ? c.onErrorContainer : c.onTertiaryContainer,
            ),
            const SizedBox(width: Kx.s12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (r.missed) ...[
                    Pill('Missed this class', icon: Icons.event_busy, background: c.errorContainer, foreground: c.onErrorContainer),
                    const SizedBox(height: Kx.s4),
                  ],
                  Text(headline, style: context.text.titleSmall),
                  if (headline != r.title) ...[
                    const SizedBox(height: 2),
                    Text(
                      r.title,
                      style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                  Text(
                    [?r.teacherName, Fmt.relativeDay(r.startedAt, today), LessonFmt.length(r.duration)].join(' · '),
                    style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: c.onSurfaceVariant),
          ],
        ),
      ),
    );
  }
}

/// Every recording in the child's summary, missed ones first.
class ChildRecordingsScreen extends StatelessWidget {
  const ChildRecordingsScreen({super.key, required this.child, required this.summary, required this.api});

  final Child child;
  final ChildSummary summary;
  final ParentApi api;

  static Future<void> open(BuildContext context, {required Child child, required ChildSummary summary, required ParentApi api}) =>
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ChildRecordingsScreen(child: child, summary: summary, api: api),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final all = summary.recordingsMissedFirst;
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar.large(title: Text('${child.firstName}\'s lessons')),
          if (all.isEmpty)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: KxEmptyState(icon: Icons.play_circle_outline, message: 'No lesson recordings have been shared with the class yet.'),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s24),
              sliver: SliverList.separated(
                itemCount: all.length,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (context, i) =>
                    RecordingRow(recording: all[i], today: summary.today, onTap: () => openRecording(context, api, all[i])),
              ),
            ),
        ],
      ),
    );
  }
}
