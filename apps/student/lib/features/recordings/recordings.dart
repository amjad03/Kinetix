import 'package:flutter/material.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// Opens the lesson player for one of the class's recordings.
Future<void> openRecording(BuildContext context, StudentApi api, String recordingId, {RecordingInfo? initial}) =>
    LessonPlayerScreen.open(context, source: StudentLessonSource(api), recordingId: recordingId, initial: initial);

/// Today card: lessons the teachers recorded and shared, the ones the student missed first.
class RecordingsCard extends StatelessWidget {
  const RecordingsCard({super.key, required this.summary, required this.api});

  static const shown = 3;

  final StudentSummary summary;
  final StudentApi api;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final all = summary.recordingsMissedFirst;
    final missed = all.where((r) => r.missed).length;
    void seeAll() => RecordingsScreen.open(context, summary: summary, api: api);
    return SectionCard(
      key: const Key('recordingsCard'),
      icon: Icons.play_circle_outline,
      title: context.l10n.lessonRecordings,
      caption: missed > 0 ? context.l10n.nMissed(missed) : null,
      footer: all.length > shown ? CardLink(context.l10n.seeAllRecordings(all.length), onTap: seeAll) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (all.isEmpty)
            Text(
              context.l10n.recordingsEmpty,
              style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
            ),
          for (final r in all.take(shown))
            RecordingRow(
              recording: r,
              today: summary.today,
              onTap: () => openRecording(context, api, r.id, initial: r),
            ),
        ],
      ),
    );
  }
}

/// One recording: subject, title, teacher, day and length, and "You missed this class" when the
/// student was absent for it.
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
                    Pill(context.l10n.missedThisClass, icon: Icons.event_busy, background: c.errorContainer, foreground: c.onErrorContainer),
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
                    [?r.teacherName, context.fmt.relativeDay(r.startedAt, today), LessonFmt.length(r.duration, LessonStrings.of(context))].join(' · '),
                    style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                  ),
                  // Deleted on expiresOn (end of term plus grace): watchable until the day before.
                  if (r.expiresOn case final expires?)
                    Text(
                      context.l10n.recordingAvailableUntil(context.fmt.shortDay(DateTime(expires.year, expires.month, expires.day - 1))),
                      key: Key('available-until-${r.id}'),
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

/// Every recording in the summary, missed ones first.
class RecordingsScreen extends StatelessWidget {
  const RecordingsScreen({super.key, required this.summary, required this.api});

  final StudentSummary summary;
  final StudentApi api;

  static Future<void> open(BuildContext context, {required StudentSummary summary, required StudentApi api}) => Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => RecordingsScreen(summary: summary, api: api),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final all = summary.recordingsMissedFirst;
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar.large(title: Text(context.l10n.lessonRecordings)),
          if (all.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: KxEmptyState(icon: Icons.play_circle_outline, message: context.l10n.noRecordingsShared),
            )
          else
            CenteredSliver(
              bottom: Kx.s24,
              sliver: SliverList.separated(
                itemCount: all.length,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (context, i) => RecordingRow(
                  recording: all[i],
                  today: summary.today,
                  onTap: () => openRecording(context, api, all[i].id, initial: all[i]),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
