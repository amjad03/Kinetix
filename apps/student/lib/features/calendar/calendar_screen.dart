import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// Colours and icon for each kind of calendar entry.
(IconData, Color, Color) calendarTone(BuildContext context, CalendarKind k) {
  final c = context.colors;
  return switch (k) {
    CalendarKind.holiday => (Icons.beach_access_outlined, Tone.goodContainer(context), Tone.good(context)),
    CalendarKind.exam => (Icons.edit_note, Tone.warnContainer(context), Tone.warn(context)),
    CalendarKind.event => (Icons.celebration_outlined, c.tertiaryContainer, c.onTertiaryContainer),
  };
}

String calendarKindLabel(AppLocalizations l, CalendarKind k) => switch (k) {
  CalendarKind.holiday => l.kindHoliday,
  CalendarKind.exam => l.kindExams,
  CalendarKind.event => l.kindEvent,
};

/// "Today", "Tomorrow", "In 5 days", or nothing for later ones (the date says it).
String? calendarWhen(AppLocalizations l, CalendarEvent e, DateTime today) {
  if (e.covers(today)) return l.today;
  final days = Fmt.daysBetween(today, e.startsOn);
  if (days == 1) return l.tomorrow;
  if (days > 1 && days <= 14) return l.inDays(days);
  return null;
}

/// The academic calendar: holidays, exams and events for the next six months, by month.
class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key, required this.api, this.program, this.highlightId});

  final StudentApi api;

  /// The student's program: entries for other programs are left out.
  final String? program;

  /// An entry to point out (opened from its notification).
  final String? highlightId;

  static Future<void> open(BuildContext context, StudentApi api, {String? program, String? highlightId}) => Navigator.of(context).push(
    MaterialPageRoute(builder: (_) => CalendarScreen(api: api, program: program, highlightId: highlightId)),
  );

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  CalendarRange? _range;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final now = DateTime.now();
      final r = await widget.api.calendar(from: now, to: now.add(const Duration(days: 182)));
      if (mounted) setState(() => _range = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final r = _range;
    final events = r?.events.where((e) => e.appliesTo(widget.program)).toList() ?? const <CalendarEvent>[];
    // By the month each entry starts in (or this month, for one already under way).
    final months = <DateTime, List<CalendarEvent>>{};
    for (final e in events) {
      final start = r != null && e.startsOn.isBefore(r.today) ? r.today : e.startsOn;
      months.putIfAbsent(DateTime(start.year, start.month), () => []).add(e);
    }
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverAppBar.large(title: Text(l.calendar)),
            if (_error != null)
              CenteredSliver(sliver: SliverToBoxAdapter(child: ErrorBanner(_error!, onRetry: _load)))
            else if (r == null)
              const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
            else if (events.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: KxEmptyState(key: const Key('calendarEmpty'), icon: Icons.event_available_outlined, message: l.calendarEmpty),
              )
            else
              for (final MapEntry(key: month, value: list) in months.entries)
                CenteredSliver(
                  bottom: Kx.s8,
                  sliver: SliverList.list(
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(top: Kx.s16, bottom: Kx.s8),
                        child: Text(context.fmt.month(month), style: context.text.titleMedium?.copyWith(color: context.colors.primary)),
                      ),
                      for (final e in list)
                        Padding(
                          padding: const EdgeInsets.only(bottom: Kx.s8),
                          child: CalendarEntryCard(event: e, today: r.today, highlighted: e.id == widget.highlightId),
                        ),
                    ],
                  ),
                ),
            const SliverToBoxAdapter(child: SizedBox(height: Kx.s32)),
          ],
        ),
      ),
    );
  }
}

/// One holiday, exam or event: its kind, title, days and who it is for.
class CalendarEntryCard extends StatelessWidget {
  const CalendarEntryCard({super.key, required this.event, required this.today, this.highlighted = false});

  final CalendarEvent event;
  final DateTime today;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    final (icon, bg, fg) = calendarTone(context, event.kind);
    final when = calendarWhen(l, event, today);
    return Card(
      key: Key('calendar-${event.id}'),
      shape: highlighted ? RoundedRectangleBorder(borderRadius: Kx.radiusMd, side: BorderSide(color: c.primary, width: 2)) : null,
      child: Padding(
        padding: const EdgeInsets.all(Kx.s12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            IconBadge(icon, background: bg, foreground: fg),
            const SizedBox(width: Kx.s12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(event.title, style: context.text.titleSmall),
                  const SizedBox(height: 2),
                  Text(
                    context.fmt.dayRange(event.startsOn, event.endsOn),
                    style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
                  ),
                  if (event.programs != null && event.programs!.isNotEmpty)
                    Text(
                      l.forPrograms(event.programs!.join(', ')),
                      style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                    ),
                  const SizedBox(height: Kx.s4),
                  Wrap(
                    spacing: Kx.s8,
                    runSpacing: Kx.s4,
                    children: [
                      Pill(calendarKindLabel(l, event.kind), background: bg, foreground: fg),
                      if (when != null) Pill(when, background: c.secondaryContainer, foreground: c.onSecondaryContainer),
                    ],
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

/// "Holiday today: Diwali · No classes" at the top of Today.
class HolidayBanner extends StatelessWidget {
  const HolidayBanner({super.key, required this.holiday, required this.isToday, required this.onOpen});

  final CalendarEvent holiday;
  final bool isToday;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final bg = Tone.goodContainer(context), fg = Tone.good(context);
    return Card(
      key: const Key('holidayBanner'),
      color: bg,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.all(Kx.s16),
          child: Row(
            children: [
              Icon(Icons.beach_access_outlined, color: fg),
              const SizedBox(width: Kx.s16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isToday ? l.holidayToday(holiday.title) : l.holidayTomorrow(holiday.title),
                      style: context.text.titleMedium?.copyWith(color: fg),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      holiday.multiDay ? l.noClassesUntil(context.fmt.shortDay(holiday.endsOn)) : l.noClasses,
                      style: context.text.bodyMedium?.copyWith(color: fg),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: fg),
            ],
          ),
        ),
      ),
    );
  }
}

/// The next few holidays, exams and events, with a link to the whole calendar.
class UpcomingCard extends StatelessWidget {
  const UpcomingCard({super.key, required this.range, required this.program, required this.onOpen, this.error, this.onRetry});

  final CalendarRange? range;
  final String? program;
  final VoidCallback onOpen;
  final ApiException? error;
  final VoidCallback? onRetry;

  static const shown = 3;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    final r = range;
    final events = r?.events.where((e) => e.appliesTo(program)).take(shown).toList() ?? const <CalendarEvent>[];
    return SectionCard(
      key: const Key('calendarCard'),
      icon: Icons.event_outlined,
      title: l.calendar,
      caption: l.upcoming,
      onTap: onOpen,
      footer: CardLink(l.seeCalendar, onTap: onOpen),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (error != null && r == null)
            ErrorBanner(error!, onRetry: onRetry)
          else if (r == null)
            const Center(child: CircularProgressIndicator())
          else if (events.isEmpty)
            Text(l.calendarEmpty, style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
          for (final e in events)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: Kx.s4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Builder(
                    builder: (context) {
                      final (icon, bg, fg) = calendarTone(context, e.kind);
                      return IconBadge(icon, background: bg, foreground: fg, size: 36);
                    },
                  ),
                  const SizedBox(width: Kx.s12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(e.title, style: context.text.titleSmall, maxLines: 2, overflow: TextOverflow.ellipsis),
                        Text(
                          [calendarKindLabel(l, e.kind), calendarWhen(l, e, r!.today) ?? context.fmt.dayRange(e.startsOn, e.endsOn)].join(' · '),
                          style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
