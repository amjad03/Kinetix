import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';

/// The academic calendar: upcoming holidays, exams and events, by month (Profile → Calendar).
class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key, required this.api});

  final TeacherApi api;

  /// How far ahead the list goes.
  static const days = 180;

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  List<CalendarEvent>? _events;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final to = DateUtils.dateOnly(DateTime.now()).add(const Duration(days: CalendarScreen.days));
      final events = await widget.api.calendar(to: isoDate(to));
      if (mounted) setState(() => _events = events);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final events = _events;
    final locale = Fmt.of(context).locale;
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverAppBar.large(title: Text(l.calendar)),
            if (_error != null)
              SliverPadding(
                padding: const EdgeInsets.all(Kx.s16),
                sliver: SliverToBoxAdapter(child: ErrorBanner.api(_error!, onRetry: _load)),
              ),
            if (events == null && _error == null)
              const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
            else if (events != null && events.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: KxEmptyState(key: const Key('calendarEmpty'), icon: Icons.event_outlined, message: l.calendarEmpty),
              )
            else if (events != null)
              SliverPadding(
                padding: const EdgeInsets.only(bottom: Kx.s24),
                sliver: SliverList.list(
                  children: [
                    for (final (i, e) in events.indexed) ...[
                      if (i == 0 || !_sameMonth(events[i - 1].startsOn, e.startsOn))
                        KxSectionHeader(DateFormat('MMMM y', locale).format(e.startsOn)),
                      _EventTile(event: e),
                    ],
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  static bool _sameMonth(DateTime a, DateTime b) => a.year == b.year && a.month == b.month;
}

class _EventTile extends StatelessWidget {
  const _EventTile({required this.event});

  final CalendarEvent event;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    final fmt = Fmt.of(context);
    final e = event;
    final (icon, bg, fg) = switch (e.kind) {
      CalendarKind.holiday => (Icons.beach_access_outlined, c.tertiaryContainer, c.onTertiaryContainer),
      CalendarKind.exam => (Icons.edit_note, c.errorContainer, c.onErrorContainer),
      CalendarKind.event => (Icons.celebration_outlined, c.secondaryContainer, c.onSecondaryContainer),
    };
    final when = DateUtils.isSameDay(e.startsOn, e.endsOn)
        ? fmt.shortDay(e.startsOn)
        : '${fmt.shortDay(e.startsOn)} – ${fmt.shortDay(e.endsOn)}';
    final programs = e.programs;
    return Padding(
      key: Key('event-${e.id}'),
      padding: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: bg,
            child: Icon(icon, color: fg, size: 20),
          ),
          const SizedBox(width: Kx.s16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(e.title, style: context.text.titleMedium),
                const SizedBox(height: 2),
                Text(when, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                if (programs != null && programs.isNotEmpty)
                  Text(l.calendarFor(programs.join(', ')), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
                const SizedBox(height: Kx.s4),
                Pill(l.calendarKind(e.kind), background: bg, foreground: fg),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
