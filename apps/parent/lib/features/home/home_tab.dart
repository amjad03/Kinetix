import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/family.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import '../attendance/attendance_screen.dart';
import '../boards/board_screen.dart';
import '../calendar/calendar_screen.dart';
import '../fees/fees_card.dart';
import '../homework/homework_screen.dart';
import '../library/library.dart';
import '../transport/bus_screen.dart';
import '../marks/marks.dart';
import '../recordings/recordings.dart';
import 'child_switcher.dart';

/// Home for the selected child: attendance, homework, results, fees, library books, lesson
/// recordings, class participation and shared boards.
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
        final l = context.l10n;
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
                        Text(l.greetingName(context.fmt.greeting(DateTime.now()), me.firstName), style: context.text.headlineSmall),
                        const SizedBox(height: Kx.s4),
                        Text(
                          child == null ? me.institution : l.homeSubtitle(child.firstName),
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
        SliverFillRemaining(
          hasScrollBody: false,
          child: KxEmptyState(icon: Icons.family_restroom, message: context.l10n.noChildrenLinked),
        ),
      ];
    }
    final c = child!;
    final summary = family.summaryOf(c.id);
    final error = family.summaryErrorOf(c.id);
    final holiday = family.holidaySoon(c);
    void openCalendar() => CalendarScreen.open(context, family.api, program: c.programName);
    final cards = <Widget>[
      if (holiday case (final h, final isToday)) HolidayBanner(holiday: h, isToday: isToday, onOpen: openCalendar),
      _ChildCard(child: c),
      if (summary == null && error == null)
        const Padding(
          padding: EdgeInsets.all(Kx.s48),
          child: Center(child: CircularProgressIndicator()),
        ),
      if (error != null) ErrorBanner(error, onRetry: () => family.loadSummary(c.id)),
      if (summary != null) ...[
        AttendanceCard(
          child: c,
          summary: summary,
          onOpen: () => AttendanceScreen.open(context, family.api, c),
          onStatus: (s) => AttendanceScreen.open(context, family.api, c, status: s),
        ),
        _HomeworkCard(child: c, summary: summary, api: family.api),
        ResultsCard(family: family, child: c),
        SectionCard(
          key: const Key('badgesCard'),
          icon: Icons.military_tech_outlined,
          title: KxStrings.of(context).badges,
          child: KxBadgeShelf(
            entries: [
              for (final b in family.badgesOf(c.id) ?? const <BadgeAward>[])
                if (KxBadge.fromApi(b.badge) case final kind?)
                  KxBadgeEntry(badge: kind, teacher: b.teacherName, subject: b.subjectName, awardedAt: b.awardedAt),
            ],
            formatDate: context.fmt.shortDay,
          ),
        ),
        FeesCard(family: family, child: c, today: summary.today),
        LibraryCard(family: family, child: c, today: summary.today),
        SectionCard(
          key: const Key('busCard'),
          icon: Icons.directions_bus_outlined,
          title: context.l10n.bus,
          onTap: () => BusScreen.open(context, family, c),
          child: Text(context.l10n.busSubtitle, style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
        ),
        UpcomingCard(
          range: family.calendar,
          program: c.programName,
          error: family.calendarError,
          onRetry: family.loadCalendar,
          onOpen: openCalendar,
        ),
        RecordingsCard(child: c, summary: summary, api: family.api),
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
                    context.l10n.rollNo(child.rollNo),
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
  const AttendanceCard({super.key, required this.child, required this.summary, required this.onOpen, this.onStatus});

  final Child child;
  final ChildSummary summary;
  final VoidCallback onOpen;

  /// Tapping a count opens the history showing only that status.
  final void Function(AttendanceStatus status)? onStatus;

  @override
  Widget build(BuildContext context) {
    final a = summary.attendance;
    final c = context.colors;
    final l = context.l10n;
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
        ? l.attendanceGood
        : rate >= 75
        ? l.attendanceFewMissed
        : l.attendanceBelow75;

    return SectionCard(
      key: const Key('attendanceCard'),
      icon: Icons.fact_check_outlined,
      title: l.attendance,
      caption: l.lastDays(summary.days),
      onTap: onOpen,
      footer: CardLink(l.seeAttendanceHistory, onTap: onOpen),
      child: a.periods == 0
          ? Text(l.noAttendanceFor(child.firstName, summary.days), style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant))
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
                          l.attendedOf(a.attended, a.periods),
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
                    _Stat(
                      key: const Key('presentCount'),
                      label: l.statusPresent,
                      value: a.present,
                      tone: AttendanceStatus.present,
                      onTap: onStatus == null ? null : () => onStatus!(AttendanceStatus.present),
                    ),
                    const SizedBox(width: Kx.s8),
                    _Stat(
                      key: const Key('absentCount'),
                      label: l.statusAbsent,
                      value: a.absent,
                      tone: AttendanceStatus.absent,
                      onTap: onStatus == null ? null : () => onStatus!(AttendanceStatus.absent),
                    ),
                    const SizedBox(width: Kx.s8),
                    _Stat(
                      key: const Key('lateCount'),
                      label: l.statusLate,
                      value: a.late,
                      tone: AttendanceStatus.late,
                      onTap: onStatus == null ? null : () => onStatus!(AttendanceStatus.late),
                    ),
                  ],
                ),
                if (a.excused > 0) ...[
                  const SizedBox(height: Kx.s8),
                  Text(l.excusedNote(a.excused), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
                ],
                if (a.recentAbsences.isNotEmpty) ...[
                  const SizedBox(height: Kx.s16),
                  Text(l.recentAbsences, style: context.text.titleSmall),
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
                          Expanded(child: Text(absenceLine(context.fmt, m), style: context.text.bodyMedium)),
                        ],
                      ),
                    ),
                ],
              ],
            ),
    );
  }

  /// "Absent · Corporate Accounting · Thu 1 Oct, 10:00"
  static String absenceLine(Fmt f, ClassMark m) =>
      // Non-breaking spaces keep the date and time together when the line wraps on a phone.
      [
        f.l.statusAbsent,
        ?m.subject,
        '${f.shortDay(m.date)}${m.startsAt == null ? '' : ', ${m.startsAt!.label}'}'.replaceAll(' ', '\u00a0'),
      ].join(' · ');
}

class _Stat extends StatelessWidget {
  const _Stat({super.key, required this.label, required this.value, required this.tone, this.onTap});

  final VoidCallback? onTap;
  final String label;
  final int value;
  final AttendanceStatus tone;

  @override
  Widget build(BuildContext context) {
    // A zero is good news (or nothing to report), so it stays neutral instead of red or amber.
    final (bg, fg) = value == 0 ? (context.colors.surfaceContainerHigh, context.colors.onSurfaceVariant) : Tone.status(context, tone);
    return Expanded(
      child: Material(
        color: bg,
        borderRadius: Kx.radiusMd,
        child: InkWell(
          borderRadius: Kx.radiusMd,
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: Kx.s12, horizontal: Kx.s12),
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
        ),
      ),
    );
  }
}

class _HomeworkCard extends StatelessWidget {
  const _HomeworkCard({required this.child, required this.summary, required this.api});

  final Child child;
  final ChildSummary summary;
  final ParentApi api;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SectionCard(
      key: const Key('homeworkCard'),
      icon: Icons.assignment_outlined,
      title: context.l10n.homework,
      caption: summary.upcoming.isEmpty ? null : context.l10n.dueCount(summary.upcoming.length),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (summary.upcoming.isEmpty) Text(context.l10n.nothingDue, style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
          for (final hw in summary.upcoming) HomeworkRow(homework: hw, today: summary.today, child: child, api: api),
          if (summary.pastHomework.isNotEmpty)
            Theme(
              data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                key: const Key('pastHomework'),
                tilePadding: EdgeInsets.zero,
                childrenPadding: EdgeInsets.zero,
                shape: const Border(),
                title: Text(
                  context.l10n.pastHomework(summary.pastHomework.length),
                  style: context.text.titleSmall?.copyWith(color: c.onSurfaceVariant),
                ),
                children: [
                  for (final hw in summary.pastHomework)
                    HomeworkRow(homework: hw, today: summary.today, child: child, api: api, past: true),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class HomeworkRow extends StatelessWidget {
  const HomeworkRow({super.key, required this.homework, required this.today, required this.child, required this.api, this.past = false});

  final Homework homework;
  final DateTime today;
  final Child child;
  final ParentApi api;
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
      onTap: () => HomeworkScreen.open(context, api, homework: homework, today: today, child: child),
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
                  Pill(context.fmt.due(homework.dueOn, today), background: bg, foreground: fg),
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
    final l = context.l10n;
    return SectionCard(
      key: const Key('inClassCard'),
      icon: Icons.record_voice_over_outlined,
      title: l.inClass,
      caption: l.lastDays(summary.days),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l.inClassIntro(child.firstName), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
          const SizedBox(height: Kx.s12),
          if (summary.participation.isEmpty) Text(l.notPickedYet(child.firstName), style: context.text.bodyLarge),
          for (final p in summary.participation) ...[ParticipationRow(p), const SizedBox(height: Kx.s12)],
          if (summary.participation.isNotEmpty)
            Wrap(
              spacing: Kx.s16,
              runSpacing: Kx.s4,
              children: [
                _Legend(l.legendCorrect, Tone.goodBar(context)),
                _Legend(l.legendPartly, Tone.warnBar(context)),
                _Legend(l.legendNotCorrect, c.error),
                if (hasSkipped) _Legend(l.legendNoAnswer, c.outline),
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
  static String sentence(AppLocalizations l, Participation p) {
    if (p.answered == 0) return l.askedNoAnswer(p.skipped, p.subject);
    final String answered;
    if (p.correct == p.answered) {
      answered = p.answered == 1 ? l.answeredOneCorrectly(p.subject) : l.answeredAllCorrect(p.answered, p.subject);
    } else {
      final parts = [
        if (p.correct > 0) l.nCorrect(p.correct),
        if (p.partial > 0) l.nPartly(p.partial),
        if (p.incorrect > 0) l.nNotCorrect(p.incorrect),
      ];
      answered = l.answeredDetail(p.answered, p.subject, Fmt(l).list(parts));
    }
    return p.skipped == 0 ? answered : '$answered ${l.didNotAnswer(p.skipped)}';
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
            final text = sentence(context.l10n, p);
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
      title: context.l10n.classBoards,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (summary.boards.isEmpty)
            Text(context.l10n.boardsEmpty(child.firstName), style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
          for (final b in summary.boards)
            InkWell(
              key: Key('board-${b.id}'),
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
                          Text(boardHeadline(context.l10n, b, summary.today), style: context.text.titleSmall),
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
                              if (b.sharedAt != null) context.fmt.relativeDay(b.sharedAt!, summary.today),
                              context.l10n.pages(b.pageCount),
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
  static String boardHeadline(AppLocalizations l, BoardSummary b, DateTime today) {
    final subject = b.subjectName ?? b.title;
    final isToday = b.sharedAt != null && Fmt.daysBetween(today, b.sharedAt!) == 0;
    return isToday ? l.todaysBoard(subject) : subject;
  }
}
