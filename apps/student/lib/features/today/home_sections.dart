import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/study.dart';
import '../../l10n/l10n.dart';
import '../live/live_class_screen.dart';

/// Home's "Next class": the class being taught live (to join), else the next topic in the
/// teacher's plan, else a plain line saying nothing is coming up.
class NextClassCard extends StatelessWidget {
  const NextClassCard({super.key, required this.study, required this.onOpenTopic});

  final StudyController study;
  final void Function(String topicId) onOpenTopic;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final live = study.live;
    final next = study.comingUp.thisWeek.firstOrNull ?? study.comingUp.nextWeek.firstOrNull;
    final String? title;
    final String? subtitle;
    final String? caption;
    final String action;
    final VoidCallback? onTap;
    if (live != null) {
      title = live.subject ?? live.teacher;
      subtitle = l.nextClassLive(title);
      caption = null;
      action = l.watchLive;
      onTap = () => LiveClassScreen.open(context, study, live);
    } else if (next != null) {
      title = next.$2.title;
      subtitle = l.nextClassTopic(next.$1.name);
      caption = next.$2.chapter.isEmpty ? null : next.$2.chapter;
      action = l.viewAction;
      onTap = () => onOpenTopic(next.$2.topicId);
    } else {
      title = null;
      subtitle = null;
      caption = null;
      action = '';
      onTap = null;
    }
    return KxCard(
      key: const Key('nextClassCard'),
      color: live != null ? c.primaryContainer : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l.nextClass, style: context.text.labelLarge?.copyWith(color: live != null ? c.onPrimaryContainer : c.onSurfaceVariant)),
          const SizedBox(height: Kx.s8),
          if (title == null)
            Text(l.nextClassNone, style: context.text.bodyLarge)
          else
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w600, color: live != null ? c.onPrimaryContainer : null), maxLines: 2, overflow: TextOverflow.ellipsis),
                      Text(subtitle!, style: context.text.bodyMedium?.copyWith(color: live != null ? c.onPrimaryContainer : c.onSurfaceVariant), maxLines: 2, overflow: TextOverflow.ellipsis),
                      if (caption != null) Text(caption, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant), maxLines: 2, overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
                const SizedBox(width: Kx.s12),
                FilledButton(key: const Key('nextClassAction'), onPressed: onTap, style: FilledButton.styleFrom(minimumSize: const Size(Kx.target, Kx.target)), child: Text(action)),
              ],
            ),
        ],
      ),
    );
  }
}

/// The four tiles under it: attendance, pending assignments, the upcoming exam and the streak.
class HomeTiles extends StatelessWidget {
  const HomeTiles({super.key, required this.study, required this.summary, required this.streak, required this.onAttendance, required this.onAssignments, required this.onExams});

  final StudyController study;
  final StudentSummary summary;
  final int streak;
  final VoidCallback onAttendance;
  final VoidCallback onAssignments;
  final VoidCallback onExams;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final rate = summary.attendance.effectiveRate;
    final pending = summary.upcoming.length;
    final next = study.nextPaper;
    final today = DateTime(study.today.year, study.today.month, study.today.day);
    final days = next?.paper.examDate.difference(today).inDays;
    return KxTileGrid(
      children: [
        KxStatTile(
          key: const Key('tileAttendance'),
          icon: Icons.fact_check_outlined,
          label: l.attendance,
          value: rate == null ? '–' : Fmt.percent(rate),
          tone: rate == null || rate >= 75 ? KxTone.success : KxTone.warning,
          onTap: onAttendance,
        ),
        KxStatTile(
          key: const Key('tileAssignments'),
          icon: Icons.assignment_outlined,
          label: l.tilePendingAssignments,
          value: pending == 0 ? l.tileAllDone : l.tilePendingValue(pending),
          tone: pending == 0 ? KxTone.success : KxTone.primary,
          onTap: onAssignments,
        ),
        KxStatTile(
          key: const Key('tileExam'),
          icon: Icons.event_note_outlined,
          label: l.tileUpcomingExam,
          value: days == null ? l.tileExamNone : (days <= 0 ? l.tileExamToday : l.tileExamDays(days)),
          caption: next?.paper.subject,
          tone: days != null && days <= 7 ? KxTone.warning : KxTone.primary,
          onTap: onExams,
        ),
        KxStatTile(key: const Key('tileStreak'), icon: Icons.local_fire_department_outlined, label: l.tileStreak, value: l.tileStreakDays(streak), tone: KxTone.spark),
      ],
    );
  }
}

/// "Continue learning": the topic the class is on, with how much of that subject has been taught.
class ContinueLearningCard extends StatefulWidget {
  const ContinueLearningCard({super.key, required this.study, required this.onOpenTopic});

  final StudyController study;
  final void Function(String topicId) onOpenTopic;

  @override
  State<ContinueLearningCard> createState() => _ContinueLearningCardState();
}

class _ContinueLearningCardState extends State<ContinueLearningCard> {
  String? _loadedFor;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final study = widget.study;
    final item = study.comingUp.thisWeek.firstOrNull ?? study.comingUp.nextWeek.firstOrNull;
    if (item == null) {
      return KxCard(key: const Key('continueLearning'), child: Text(l.continueLearningEmpty, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)));
    }
    final (subject, plan) = item;
    if (_loadedFor != subject.id) {
      _loadedFor = subject.id;
      // The progress bar: how much of the subject's syllabus has been taught.
      WidgetsBinding.instance.addPostFrameCallback((_) => study.loadCoverage(subject.id));
    }
    final cov = study.coverageOf(subject.id);
    final fraction = cov == null || cov.total == 0 ? 0.0 : cov.covered / cov.total;
    return KxCard(
      key: const Key('continueLearning'),
      onTap: () => widget.onOpenTopic(plan.topicId),
      child: Row(
        children: [
          const KxIconBox(Icons.menu_book_outlined, size: 48),
          const SizedBox(width: Kx.s12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(subject.name, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600), maxLines: 2, overflow: TextOverflow.ellipsis),
                Text(plan.title, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant), maxLines: 2, overflow: TextOverflow.ellipsis),
                const SizedBox(height: Kx.s8),
                KxProgressBar(value: fraction),
                if (cov != null) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(l.continueProgress(cov.covered, cov.total), style: context.text.labelSmall?.copyWith(color: c.onSurfaceVariant))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
