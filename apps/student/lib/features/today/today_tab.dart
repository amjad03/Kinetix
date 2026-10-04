import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/study.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import '../attendance/attendance_screen.dart';
import '../boards/board_screen.dart';
import '../calendar/calendar_screen.dart';
import '../homework/homework_screen.dart';
import '../library/library.dart';
import '../live/live_class_screen.dart';
import '../marks/marks.dart';
import '../messages/messages_controller.dart';
import '../messages/messages_screen.dart';
import '../recordings/recordings.dart';

/// The student's day: the class being taught live (if any), attendance, homework due soon,
/// results, library books, messages (colleges), lesson recordings (missed ones first) and the
/// boards teachers shared after class.
class TodayTab extends StatelessWidget {
  const TodayTab({super.key, required this.study, required this.me, this.messages, this.onAsk, this.onOpenTopic, this.now});

  final StudyController study;
  final Me me;

  /// Shown as a card only where students may write to teachers (colleges).
  final MessagesController? messages;

  /// Opens the Learn tab's "Ask a doubt".
  final VoidCallback? onAsk;

  /// Opens a syllabus topic (from "Coming up in class").
  final void Function(String topicId)? onOpenTopic;

  /// For tests; defaults to the device clock.
  final DateTime Function()? now;

  void _openCalendar(BuildContext context) => CalendarScreen.open(context, study.api, program: study.student.programName);

  @override
  Widget build(BuildContext context) {
    final student = study.student;
    return ListenableBuilder(
      listenable: Listenable.merge([study, ?messages]),
      builder: (context, _) {
        final summary = study.summary;
        final live = study.live;
        final cards = <Widget>[
          if (live != null) LiveNowBanner(live: live, onWatch: () => LiveClassScreen.open(context, study, live)),
          if (study.holidaySoon case (final holiday, final isToday))
            HolidayBanner(holiday: holiday, isToday: isToday, onOpen: () => _openCalendar(context)),
          if (summary == null && study.error == null)
            const Padding(
              padding: EdgeInsets.all(Kx.s48),
              child: Center(child: CircularProgressIndicator()),
            ),
          if (study.error != null) ErrorBanner(study.error!, onRetry: study.loadSummary),
          if (summary != null) ...[
            AttendanceCard(summary: summary, onOpen: () => AttendanceScreen.open(context, study.api, student)),
            HomeworkCard(summary: summary, study: study),
            if (study.comingUp.any) ComingUpCard(study: study, onOpenTopic: onOpenTopic),
            if (onAsk != null) _AskCard(onAsk: onAsk!),
            ResultsCard(study: study),
            if (messages?.available ?? false) MessagesCard(controller: messages!),
            LibraryCard(study: study),
            UpcomingCard(
              range: study.calendar,
              program: student.programName,
              error: study.calendarError,
              onRetry: study.loadCalendar,
              onOpen: () => _openCalendar(context),
            ),
            RecordingsCard(summary: summary, api: study.api),
            BoardsCard(summary: summary, study: study),
          ],
        ];
        return RefreshIndicator(
          onRefresh: () => Future.wait([study.load(), if (messages?.available ?? false) messages!.load()]),
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
                                context.l10n.greetingName(context.fmt.greeting((now ?? DateTime.now)()), me.firstName),
                                key: const Key('greeting'),
                                style: context.text.headlineSmall,
                              ),
                              const SizedBox(height: Kx.s4),
                              Text(
                                '${student.sectionName} · ${context.l10n.rollNo(student.rollNo)}',
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
  static String note(AppLocalizations l, double rate) => rate >= 85
      ? l.attendanceGood
      : rate >= 75
      ? l.attendanceFewMissed
      : l.attendanceBelow75;

  @override
  Widget build(BuildContext context) {
    final a = summary.attendance;
    final c = context.colors;
    final l = context.l10n;
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
      title: l.attendance,
      caption: l.lastDays(summary.days),
      onTap: onOpen,
      footer: CardLink(l.seeAttendanceHistory, onTap: onOpen),
      child: rate == null
          ? Text(
              l.noAttendanceForYou(summary.days),
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
                        l.attendedOf(a.attended, a.periods),
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
                Text(note(l, rate), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                const SizedBox(height: Kx.s16),
                Row(
                  children: [
                    _Stat(key: const Key('presentCount'), label: l.statusPresent, value: a.present, tone: AttendanceStatus.present),
                    const SizedBox(width: Kx.s8),
                    _Stat(key: const Key('absentCount'), label: l.statusAbsent, value: a.absent, tone: AttendanceStatus.absent),
                    const SizedBox(width: Kx.s8),
                    _Stat(key: const Key('lateCount'), label: l.statusLate, value: a.late, tone: AttendanceStatus.late),
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
        '${f.shortDay(m.date)}${m.startsAt == null ? '' : ', ${m.startsAt!.label}'}'.replaceAll(' ', ' '),
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
  const HomeworkCard({super.key, required this.summary, required this.study});

  final StudentSummary summary;
  final StudyController study;

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
          if (summary.upcoming.isEmpty)
            Text(
              context.l10n.nothingDue,
              style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
            ),
          for (final hw in summary.upcoming) HomeworkRow(homework: hw, today: summary.today, study: study),
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
                    HomeworkRow(homework: hw, today: summary.today, study: study, past: true),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class HomeworkRow extends StatelessWidget {
  const HomeworkRow({super.key, required this.homework, required this.today, required this.study, this.past = false});

  final Homework homework;
  final DateTime today;
  final StudyController study;
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
      onTap: () => HomeworkScreen.open(context, study, homework),
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
                    Text(context.l10n.stuckTitle, style: context.text.titleMedium?.copyWith(color: c.onPrimaryContainer)),
                    const SizedBox(height: 2),
                    Text(
                      context.l10n.stuckBody,
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
      title: context.l10n.classBoards,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (summary.boards.isEmpty)
            Text(
              context.l10n.boardsEmpty,
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

/// "Coming up in class": this week's topics from the year plans of every subject (next week's
/// when this week has none), so the student can read ahead. Shown only when a plan exists.
class ComingUpCard extends StatelessWidget {
  const ComingUpCard({super.key, required this.study, this.onOpenTopic});

  final StudyController study;
  final void Function(String topicId)? onOpenTopic;

  static const _shown = 4;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    final up = study.comingUp;
    final nextWeek = up.thisWeek.isEmpty && up.nextWeek.isNotEmpty;
    final items = nextWeek ? up.nextWeek : up.thisWeek;
    return SectionCard(
      key: const Key('comingUpCard'),
      icon: Icons.event_note_outlined,
      title: l.comingUpInClass,
      caption: items.isEmpty ? null : '${nextWeek ? l.nextWeekInClass : l.thisWeekInClass} · ${l.topicsCount(items.length)}',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (items.isEmpty)
            Text(l.nothingPlannedThisWeek, style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
          for (final (subject, item) in items.take(_shown))
            InkWell(
              key: Key('comingUp-${item.topicId}'),
              borderRadius: Kx.radiusMd,
              onTap: onOpenTopic == null ? null : () => onOpenTopic!(item.topicId),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: Kx.s4),
                child: Row(
                  children: [
                    Icon(
                      item.taught ? Icons.check_circle : Icons.menu_book_outlined,
                      size: 20,
                      color: item.taught ? Tone.good(context) : c.onSurfaceVariant,
                      semanticLabel: item.taught ? l.taught : null,
                    ),
                    const SizedBox(width: Kx.s12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(item.title, style: context.text.titleSmall, maxLines: 2, overflow: TextOverflow.ellipsis),
                          Text(
                            subject.name,
                            style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    if (onOpenTopic != null) Icon(Icons.chevron_right, color: c.onSurfaceVariant),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
