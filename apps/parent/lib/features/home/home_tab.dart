import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/family.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';
import '../attendance/attendance_screen.dart';
import '../boards/board_screen.dart';
import '../homework/homework_screen.dart';
import 'child_switcher.dart';

/// Home for the selected child: attendance, homework, class participation and shared boards.
class HomeTab extends StatelessWidget {
  const HomeTab({super.key, required this.family, required this.me});

  final FamilyController family;
  final Me me;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: family,
      builder: (context, _) {
        final child = family.selected;
        return RefreshIndicator(
          onRefresh: family.refresh,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverSafeArea(
                bottom: false,
                sliver: SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s24, Kx.s16, Kx.s8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${Fmt.greeting(DateTime.now())}, ${me.firstName}', style: context.text.headlineSmall),
                        const SizedBox(height: Kx.s4),
                        Text(
                          child == null ? me.institution : "Here's how ${child.firstName} is doing",
                          style: context.text.bodyLarge?.copyWith(color: context.colors.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              if (family.children.length > 1)
                SliverToBoxAdapter(
                  child: ChildSwitcher(children: family.children, selected: child, onSelect: family.select),
                ),
              ..._body(context, child),
              const SliverToBoxAdapter(child: SizedBox(height: Kx.s24)),
            ],
          ),
        );
      },
    );
  }

  List<Widget> _body(BuildContext context, Child? child) {
    if (family.children.isEmpty) {
      if (family.loading) return [const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))];
      if (family.error != null) {
        return [
          SliverPadding(
            padding: const EdgeInsets.all(Kx.s16),
            sliver: SliverToBoxAdapter(child: ErrorBanner(family.error!, onRetry: family.load)),
          ),
        ];
      }
      return [
        const SliverFillRemaining(
          hasScrollBody: false,
          child: KxEmptyState(
            icon: Icons.family_restroom,
            message: "No children are linked to your account yet.\nAsk your child's college to add you as their parent.",
          ),
        ),
      ];
    }
    final c = child!;
    final summary = family.summaryOf(c.id);
    final error = family.summaryErrorOf(c.id);
    final cards = <Widget>[
      _ChildCard(child: c),
      if (summary == null && error == null)
        const Padding(
          padding: EdgeInsets.all(Kx.s48),
          child: Center(child: CircularProgressIndicator()),
        ),
      if (error != null) ErrorBanner(error, onRetry: () => family.loadSummary(c.id)),
      if (summary != null) ...[
        AttendanceCard(child: c, summary: summary, onOpen: () => AttendanceScreen.open(context, family.api, c)),
        _HomeworkCard(child: c, summary: summary),
        _InClassCard(child: c, summary: summary),
        _BoardsCard(child: c, summary: summary, family: family),
      ],
    ];
    return [
      SliverPadding(
        padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 0),
        sliver: SliverList.separated(
          itemCount: cards.length,
          itemBuilder: (_, i) => cards[i],
          separatorBuilder: (_, _) => const SizedBox(height: Kx.s12),
        ),
      ),
    ];
  }
}

class _ChildCard extends StatelessWidget {
  const _ChildCard({required this.child});

  final Child child;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Card(
      color: c.primaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Row(
          children: [
            CircleAvatar(
              radius: 28,
              backgroundColor: c.primary,
              foregroundColor: c.onPrimary,
              child: Text(KxAvatar.initials(child.fullName), style: context.text.titleLarge?.copyWith(color: c.onPrimary)),
            ),
            const SizedBox(width: Kx.s16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(child.fullName, style: context.text.titleLarge?.copyWith(color: c.onPrimaryContainer)),
                  const SizedBox(height: 2),
                  Text(child.sectionName, style: context.text.bodyLarge?.copyWith(color: c.onPrimaryContainer)),
                  Text(
                    'Roll no. ${child.rollNo}',
                    style: context.text.bodyMedium?.copyWith(color: c.onPrimaryContainer.withValues(alpha: 0.8)),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Big attendance percentage, counts and recent absences.
class AttendanceCard extends StatelessWidget {
  const AttendanceCard({super.key, required this.child, required this.summary, required this.onOpen});

  final Child child;
  final ChildSummary summary;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final a = summary.attendance;
    final c = context.colors;
    final rate = a.rate ?? (a.periods == 0 ? null : a.attended * 100 / a.periods);
    final tone = rate == null
        ? c.onSurface
        : rate >= 85
        ? Tone.good(context)
        : rate >= 75
        ? Tone.warn(context)
        : c.error;
    final note = rate == null
        ? null
        : rate >= 85
        ? 'Good attendance. Keep it up.'
        : rate >= 75
        ? 'Missed a few classes recently.'
        : 'Below 75%. Colleges usually need 75% to sit exams.';

    return SectionCard(
      key: const Key('attendanceCard'),
      icon: Icons.fact_check_outlined,
      title: 'Attendance',
      caption: 'Last ${summary.days} days',
      onTap: onOpen,
      footer: CardLink('See attendance history', onTap: onOpen),
      child: a.periods == 0
          ? Text(
              'No attendance has been taken for ${child.firstName} in the last ${summary.days} days.',
              style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      Fmt.percent(rate!),
                      key: const Key('attendanceRate'),
                      style: context.text.displayMedium?.copyWith(color: tone, fontWeight: FontWeight.w500, height: 1),
                    ),
                    const SizedBox(width: Kx.s12),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Text(
                          'Attended ${a.attended} of ${Fmt.plural(a.periods, 'class', 'classes')}',
                          style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: Kx.s12),
                ClipRRect(
                  borderRadius: Kx.radiusSm,
                  child: LinearProgressIndicator(value: rate / 100, minHeight: 8, color: tone, backgroundColor: c.surfaceContainerHighest),
                ),
                if (note != null) ...[
                  const SizedBox(height: Kx.s8),
                  Text(note, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                ],
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
        '${Fmt.shortDay(m.date)}${m.startsAt == null ? '' : ', ${m.startsAt!.label}'}'.replaceAll(' ', '\u00a0'),
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
            Text(label, style: context.text.labelLarge?.copyWith(color: fg)),
          ],
        ),
      ),
    );
  }
}

class _HomeworkCard extends StatelessWidget {
  const _HomeworkCard({required this.child, required this.summary});

  final Child child;
  final ChildSummary summary;

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
              'Nothing due right now. New homework from teachers will show here.',
              style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
            ),
          for (final hw in summary.upcoming) HomeworkRow(homework: hw, today: summary.today, child: child),
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
                  for (final hw in summary.pastHomework) HomeworkRow(homework: hw, today: summary.today, child: child, past: true),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class HomeworkRow extends StatelessWidget {
  const HomeworkRow({super.key, required this.homework, required this.today, required this.child, this.past = false});

  final Homework homework;
  final DateTime today;
  final Child child;
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
      borderRadius: Kx.radiusMd,
      onTap: () => HomeworkScreen.open(context, homework: homework, today: today, child: child),
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

class _InClassCard extends StatelessWidget {
  const _InClassCard({required this.child, required this.summary});

  final Child child;
  final ChildSummary summary;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final hasSkipped = summary.participation.any((p) => p.skipped > 0);
    return SectionCard(
      key: const Key('inClassCard'),
      icon: Icons.record_voice_over_outlined,
      title: 'In class',
      caption: 'Last ${summary.days} days',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Answers when the teacher picked ${child.firstName} to answer a question in class.',
            style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
          ),
          const SizedBox(height: Kx.s12),
          if (summary.participation.isEmpty)
            Text('${child.firstName} was not picked to answer in class yet.', style: context.text.bodyLarge),
          for (final p in summary.participation) ...[ParticipationRow(p), const SizedBox(height: Kx.s12)],
          if (summary.participation.isNotEmpty)
            Wrap(
              spacing: Kx.s16,
              runSpacing: Kx.s4,
              children: [
                _Legend('Correct', Tone.goodBar(context)),
                _Legend('Partly correct', Tone.warnBar(context)),
                _Legend('Not correct', c.error),
                if (hasSkipped) _Legend('No answer', c.outline),
              ],
            ),
        ],
      ),
    );
  }
}

class ParticipationRow extends StatelessWidget {
  const ParticipationRow(this.p, {super.key});

  final Participation p;

  /// "Answered 5 questions in Corporate Accounting, 4 correct and 1 partly correct."
  static String sentence(Participation p) {
    if (p.answered == 0) return 'Was asked ${Fmt.plural(p.skipped, 'question')} in ${p.subject} but did not answer.';
    final String detail;
    if (p.correct == p.answered) {
      detail = p.answered == 1 ? 'correctly' : 'all correct';
    } else {
      final parts = [
        if (p.correct > 0) '${p.correct} correct',
        if (p.partial > 0) '${p.partial} partly correct',
        if (p.incorrect > 0) '${p.incorrect} not correct',
      ];
      detail = parts.length == 1 ? parts.single : '${parts.sublist(0, parts.length - 1).join(', ')} and ${parts.last}';
    }
    final answered = 'Answered ${Fmt.plural(p.answered, 'question')} in ${p.subject}${detail == 'correctly' ? ' ' : ', '}$detail.';
    return p.skipped == 0 ? answered : '$answered Did not answer ${p.skipped}.';
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final segments = [
      (p.correct, Tone.goodBar(context)),
      (p.partial, Tone.warnBar(context)),
      (p.incorrect, c.error),
      (p.skipped, c.outline),
    ].where((s) => s.$1 > 0).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // The subject is bold inside the sentence instead of repeated as a heading.
        Builder(
          builder: (context) {
            final text = sentence(p);
            final at = text.indexOf(p.subject);
            if (at < 0) return Text(text, style: context.text.bodyLarge);
            return Text.rich(
              TextSpan(
                children: [
                  TextSpan(text: text.substring(0, at)),
                  TextSpan(
                    text: p.subject,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  TextSpan(text: text.substring(at + p.subject.length)),
                ],
              ),
              style: context.text.bodyLarge,
            );
          },
        ),
        const SizedBox(height: Kx.s8),
        ClipRRect(
          borderRadius: Kx.radiusSm,
          child: SizedBox(
            height: 10,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final (i, s) in segments.indexed) ...[
                  if (i > 0) SizedBox(width: 2, child: ColoredBox(color: c.surfaceContainerLow)),
                  Expanded(
                    flex: s.$1,
                    child: ColoredBox(color: s.$2),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend(this.label, this.color);

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3)),
      ),
      const SizedBox(width: 6),
      Text(label, style: context.text.labelMedium?.copyWith(color: context.colors.onSurfaceVariant)),
    ],
  );
}

class _BoardsCard extends StatelessWidget {
  const _BoardsCard({required this.child, required this.summary, required this.family});

  final Child child;
  final ChildSummary summary;
  final FamilyController family;

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
              'When a teacher shares the class board after a lesson, it appears here so ${child.firstName} can revise.',
              style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
            ),
          for (final b in summary.boards)
            InkWell(
              borderRadius: Kx.radiusMd,
              onTap: () => BoardScreen.open(context, family.api, b.id, summary: b),
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
