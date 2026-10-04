import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/study.dart';
import '../../widgets/common.dart';
import '../attendance/attendance_screen.dart';
import '../boards/board_screen.dart';
import '../homework/homework_screen.dart';
import '../recordings/recordings.dart';

/// The student's day: attendance, homework due soon, lesson recordings (missed ones first) and
/// the boards teachers shared after class.
class TodayTab extends StatelessWidget {
  const TodayTab({super.key, required this.study, required this.me, this.onAsk, this.now});

  final StudyController study;
  final Me me;

  /// Opens the Learn tab's "Ask a doubt".
  final VoidCallback? onAsk;

  /// For tests; defaults to the device clock.
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) {
    final student = study.student;
    return ListenableBuilder(
      listenable: study,
      builder: (context, _) {
        final summary = study.summary;
        final cards = <Widget>[
          if (summary == null && study.error == null)
            const Padding(
              padding: EdgeInsets.all(Kx.s48),
              child: Center(child: CircularProgressIndicator()),
            ),
          if (study.error != null) ErrorBanner(study.error!, onRetry: study.load),
          if (summary != null) ...[
            AttendanceCard(summary: summary, onOpen: () => AttendanceScreen.open(context, study.api, student)),
            HomeworkCard(summary: summary, sectionName: student.sectionName),
            if (onAsk != null) _AskCard(onAsk: onAsk!),
            RecordingsCard(summary: summary, api: study.api),
            BoardsCard(summary: summary, study: study),
          ],
        ];
        return RefreshIndicator(
          onRefresh: study.load,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverSafeArea(
                bottom: false,
                sliver: CenteredSliver(
                  top: Kx.s24,
                  bottom: Kx.s8,
                  sliver: SliverToBoxAdapter(
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${Fmt.greeting((now ?? DateTime.now)())}, ${me.firstName}',
                                key: const Key('greeting'),
                                style: context.text.headlineSmall,
                              ),
                              const SizedBox(height: Kx.s4),
                              Text(
                                '${student.sectionName} · Roll no. ${student.rollNo}',
                                style: context.text.bodyLarge?.copyWith(color: context.colors.onSurfaceVariant),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: Kx.s12),
                        KxAvatar(name: me.fullName, size: 48),
                      ],
                    ),
                  ),
                ),
              ),
              CenteredSliver(
                top: Kx.s8,
                bottom: Kx.s24,
                sliver: SliverList.separated(
                  itemCount: cards.length,
                  itemBuilder: (_, i) => cards[i],
                  separatorBuilder: (_, _) => const SizedBox(height: Kx.s12),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Big attendance percentage, counts and recent absences.
class AttendanceCard extends StatelessWidget {
  const AttendanceCard({super.key, required this.summary, required this.onOpen});

  final StudentSummary summary;
  final VoidCallback onOpen;

  /// A plain note for the rate: good (85%+), a few missed, or below the usual 75% exam line.
  static String note(double rate) => rate >= 85
      ? 'Good attendance. Keep it up.'
      : rate >= 75
      ? 'You missed a few classes recently.'
      : 'Below 75%. Colleges usually need 75% for you to sit exams.';

  @override
  Widget build(BuildContext context) {
    final a = summary.attendance;
    final c = context.colors;
    final rate = a.effectiveRate;
    final tone = rate == null
        ? c.onSurface
        : rate >= 85
        ? Tone.good(context)
        : rate >= 75
        ? Tone.warn(context)
        : c.error;

    return SectionCard(
      key: const Key('attendanceCard'),
      icon: Icons.fact_check_outlined,
      title: 'Attendance',
      caption: 'Last ${summary.days} days',
      onTap: onOpen,
      footer: CardLink('See attendance history', onTap: onOpen),
      child: rate == null
          ? Text(
              'No attendance has been taken for you in the last ${summary.days} days.',
              style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Wrap(
                  crossAxisAlignment: WrapCrossAlignment.end,
                  spacing: Kx.s12,
                  runSpacing: Kx.s4,
                  children: [
                    Text(
                      Fmt.percent(rate),
                      key: const Key('attendanceRate'),
                      style: context.text.displayMedium?.copyWith(color: tone, fontWeight: FontWeight.w500, height: 1),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text(
                        'Attended ${a.attended} of ${Fmt.plural(a.periods, 'class', 'classes')}',
                        style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: Kx.s12),
                ClipRRect(
                  borderRadius: Kx.radiusSm,
                  child: LinearProgressIndicator(value: rate / 100, minHeight: 8, color: tone, backgroundColor: c.surfaceContainerHighest),
                ),
                const SizedBox(height: Kx.s8),
                Text(note(rate), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                const SizedBox(height: Kx.s16),
                Row(
                  children: [
                    _Stat(key: const Key('presentCount'), label: 'Present', value: a.present, tone: AttendanceStatus.present),
                    const SizedBox(width: Kx.s8),
                    _Stat(key: const Key('absentCount'), label: 'Absent', value: a.absent, tone: AttendanceStatus.absent),
                    const SizedBox(width: Kx.s8),
                    _Stat(key: const Key('lateCount'), label: 'Late', value: a.late, tone: AttendanceStatus.late),
                  ],
                ),
                if (a.excused > 0) ...[
                  const SizedBox(height: Kx.s8),
                  Text('${a.excused} excused (counted as attended)', style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
                ],
                if (a.recentAbsences.isNotEmpty) ...[
                  const SizedBox(height: Kx.s16),
                  Text('Recent absences', style: context.text.titleSmall),
                  const SizedBox(height: Kx.s4),
                  for (final m in a.recentAbsences.take(3))
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: Kx.s4),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Icon(Icons.person_off_outlined, size: 18, color: c.error),
                          ),
                          const SizedBox(width: Kx.s8),
                          Expanded(child: Text(absenceLine(m), style: context.text.bodyMedium)),
                        ],
                      ),
                    ),
                ],
              ],
            ),
    );
  }

  /// "Absent · Corporate Accounting · Thu 1 Oct, 10:00"
  static String absenceLine(ClassMark m) =>
      // Non-breaking spaces keep the date and time together when the line wraps on a phone.
      [
        'Absent',
        ?m.subject,
        '${Fmt.shortDay(m.date)}${m.startsAt == null ? '' : ', ${m.startsAt!.label}'}'.replaceAll(' ', ' '),
      ].join(' · ');
}

class _Stat extends StatelessWidget {
  const _Stat({super.key, required this.label, required this.value, required this.tone});

  final String label;
  final int value;
  final AttendanceStatus tone;

  @override
  Widget build(BuildContext context) {
    // A zero is good news (or nothing to report), so it stays neutral instead of red or amber.
    final (bg, fg) = value == 0 ? (context.colors.surfaceContainerHigh, context.colors.onSurfaceVariant) : Tone.status(context, tone);
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: Kx.s12, horizontal: Kx.s12),
        decoration: BoxDecoration(color: bg, borderRadius: Kx.radiusMd),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '$value',
              style: context.text.headlineSmall?.copyWith(color: fg, fontWeight: FontWeight.w500),
            ),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: context.text.labelLarge?.copyWith(color: fg),
            ),
          ],
        ),
      ),
    );
  }
}

class HomeworkCard extends StatelessWidget {
  const HomeworkCard({super.key, required this.summary, required this.sectionName});

  final StudentSummary summary;
  final String sectionName;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SectionCard(
      key: const Key('homeworkCard'),
      icon: Icons.assignment_outlined,
      title: 'Homework',
      caption: summary.upcoming.isEmpty ? null : '${summary.upcoming.length} due',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (summary.upcoming.isEmpty)
            Text(
              'Nothing due right now. New homework from your teachers will show here.',
              style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
            ),
          for (final hw in summary.upcoming) HomeworkRow(homework: hw, today: summary.today, sectionName: sectionName),
          if (summary.pastHomework.isNotEmpty)
            Theme(
              data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                key: const Key('pastHomework'),
                tilePadding: EdgeInsets.zero,
                childrenPadding: EdgeInsets.zero,
                shape: const Border(),
                title: Text(
                  'Past homework (${summary.pastHomework.length})',
                  style: context.text.titleSmall?.copyWith(color: c.onSurfaceVariant),
                ),
                children: [
                  for (final hw in summary.pastHomework)
                    HomeworkRow(homework: hw, today: summary.today, sectionName: sectionName, past: true),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class HomeworkRow extends StatelessWidget {
  const HomeworkRow({super.key, required this.homework, required this.today, required this.sectionName, this.past = false});

  final Homework homework;
  final DateTime today;
  final String sectionName;
  final bool past;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final days = Fmt.daysBetween(today, homework.dueOn);
    final (bg, fg) = past
        ? (c.surfaceContainerHighest, c.onSurfaceVariant)
        : days <= 1
        ? (Tone.warnContainer(context), Tone.warn(context))
        : (c.secondaryContainer, c.onSecondaryContainer);
    return InkWell(
      key: Key('homework-${homework.id}'),
      borderRadius: Kx.radiusMd,
      onTap: () => HomeworkScreen.open(context, homework: homework, today: today, sectionName: sectionName),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: Kx.s8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            IconBadge(
              Icons.assignment_outlined,
              background: past ? c.surfaceContainerHighest : null,
              foreground: past ? c.onSurfaceVariant : null,
            ),
            const SizedBox(width: Kx.s12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(homework.title, style: context.text.titleSmall, maxLines: 2, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 2),
                  Text(
                    '${homework.subject} · ${homework.teacher}',
                    style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: Kx.s4),
                  Pill(Fmt.due(homework.dueOn, today), background: bg, foreground: fg),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(top: Kx.s8),
              child: Icon(Icons.chevron_right, color: c.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}

/// A gentle nudge to the Learn tab.
class _AskCard extends StatelessWidget {
  const _AskCard({required this.onAsk});

  final VoidCallback onAsk;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Card(
      key: const Key('askCard'),
      color: c.primaryContainer,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onAsk,
        child: Padding(
          padding: const EdgeInsets.all(Kx.s16),
          child: Row(
            children: [
              IconBadge(Icons.auto_awesome, background: c.primary, foreground: c.onPrimary),
              const SizedBox(width: Kx.s16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Stuck on something?', style: context.text.titleMedium?.copyWith(color: c.onPrimaryContainer)),
                    const SizedBox(height: 2),
                    Text(
                      'Ask KINETIX AI to explain it, in English, हिन्दी or ಕನ್ನಡ.',
                      style: context.text.bodyMedium?.copyWith(color: c.onPrimaryContainer),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: c.onPrimaryContainer),
            ],
          ),
        ),
      ),
    );
  }
}

class BoardsCard extends StatelessWidget {
  const BoardsCard({super.key, required this.summary, required this.study});

  final StudentSummary summary;
  final StudyController study;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SectionCard(
      key: const Key('boardsCard'),
      icon: Icons.co_present_outlined,
      title: 'Class boards',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (summary.boards.isEmpty)
            Text(
              'When a teacher shares the class board after a lesson, it appears here so you can revise.',
              style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
            ),
          for (final b in summary.boards)
            InkWell(
              key: Key('board-${b.id}'),
              borderRadius: Kx.radiusMd,
              onTap: () => BoardScreen.open(context, study.api, b.id, summary: b),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: Kx.s8),
                child: Row(
                  children: [
                    IconBadge(Icons.co_present_outlined, background: c.tertiaryContainer, foreground: c.onTertiaryContainer),
                    const SizedBox(width: Kx.s12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(boardHeadline(b, summary.today), style: context.text.titleSmall),
                          const SizedBox(height: 2),
                          Text(
                            b.title,
                            style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            [
                              ?b.teacherName,
                              if (b.sharedAt != null) Fmt.relativeDay(b.sharedAt!, summary.today),
                              Fmt.plural(b.pageCount, 'page'),
                            ].join(' · '),
                            style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                          ),
                        ],
                      ),
                    ),
                    Icon(Icons.chevron_right, color: c.onSurfaceVariant),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// "Today's board: Corporate Accounting", or "Corporate Accounting" for older ones.
  static String boardHeadline(BoardSummary b, DateTime today) {
    final subject = b.subjectName ?? b.title;
    final isToday = b.sharedAt != null && Fmt.daysBetween(today, b.sharedAt!) == 0;
    return isToday ? "Today's board: $subject" : subject;
  }
}
