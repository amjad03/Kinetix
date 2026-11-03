import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// The week's timetable as the student has it: pick a day; each period with its teacher (and who it is covering for),
/// room, batch, elective and extra classes; holidays and compensatory working days say so. Previous and next week.
class TimetableScreen extends StatefulWidget {
  const TimetableScreen({super.key, required this.load, this.title, this.now});

  /// Loads the week that starts on the Monday given (null: this week).
  final Future<TimetableWeek> Function(DateTime? from) load;
  final String? title;

  /// The clock, for "now" (tests pin it).
  final DateTime Function()? now;

  static Future<void> open(BuildContext context, ParentApi api, String studentId, {String? title}) => Navigator.of(context).push(
    MaterialPageRoute(builder: (_) => TimetableScreen(load: (from) => api.timetable(studentId, from: from), title: title)),
  );

  @override
  State<TimetableScreen> createState() => _TimetableScreenState();
}

class _TimetableScreenState extends State<TimetableScreen> {
  TimetableWeek? _week;
  ApiException? _error;
  DateTime? _from;
  int _day = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final w = await widget.load(_from);
      if (!mounted) return;
      final today = w.days.indexWhere((d) => d.date == w.today);
      setState(() {
        _week = w;
        _day = _from == null && today >= 0 ? today : 0;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  void _shift(int weeks) {
    final w = _week;
    if (w == null) return;
    _from = w.from.add(Duration(days: 7 * weeks));
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final w = _week;
    final day = w != null && w.days.isNotEmpty ? w.days[_day.clamp(0, w.days.length - 1)] : null;
    final now = (widget.now ?? DateTime.now)();
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title ?? l.timetable),
        actions: [
          IconButton(key: const Key('ttPrevWeek'), tooltip: l.ttPrevWeek, icon: const Icon(Icons.chevron_left), onPressed: w == null ? null : () => _shift(-1)),
          IconButton(key: const Key('ttNextWeek'), tooltip: l.ttNextWeek, icon: const Icon(Icons.chevron_right), onPressed: w == null ? null : () => _shift(1)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            if (_error != null)
              CenteredSliver(sliver: SliverToBoxAdapter(child: ErrorBanner(_error!, onRetry: _load)))
            else if (w == null)
              const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
            else ...[
              CenteredSliver(
                top: Kx.s8,
                sliver: SliverToBoxAdapter(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        for (final (i, d) in w.days.indexed)
                          Padding(
                            padding: const EdgeInsets.only(right: Kx.s8),
                            child: ChoiceChip(
                              key: Key('ttDay${d.weekday}'),
                              selected: i == _day,
                              onSelected: (_) => setState(() => _day = i),
                              label: Text('${context.fmt.weekdayShort(d.date)} ${d.date.day}${d.holiday != null ? ' ·' : ''}'),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              if (day != null) ...[
                if (day.holiday != null)
                  CenteredSliver(top: Kx.s12, sliver: SliverToBoxAdapter(child: _Note(key: const Key('ttHoliday'), icon: Icons.beach_access_outlined, text: l.ttHoliday(day.holiday!))))
                else if (day.follows != day.weekday)
                  CenteredSliver(top: Kx.s12, sliver: SliverToBoxAdapter(child: _Note(key: const Key('ttFollows'), icon: Icons.swap_horiz, text: l.ttFollows(context.fmt.weekdayName(day.follows))))),
                if (day.periods.isEmpty && day.holiday == null)
                  SliverFillRemaining(hasScrollBody: false, child: KxEmptyState(key: const Key('ttEmpty'), icon: Icons.event_available_outlined, message: l.ttNoClasses))
                else
                  CenteredSliver(
                    top: Kx.s12,
                    bottom: Kx.s24,
                    sliver: SliverList.list(
                      children: [
                        for (final p in day.periods)
                          Padding(padding: const EdgeInsets.only(bottom: Kx.s8), child: _PeriodTile(p: p, now: day.date == w.today && p.isNowAt(now))),
                      ],
                    ),
                  ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({super.key, required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(leading: Icon(icon), title: Text(text)),
  );
}

class _PeriodTile extends StatelessWidget {
  const _PeriodTile({required this.p, required this.now});

  final TimetablePeriod p;
  final bool now;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final tags = [
      if (now) l.ttNow,
      if (p.batch != null) l.ttBatch(p.batch!),
      if (p.elective) l.ttElective,
      if (p.special) l.ttSpecial,
    ];
    return Card(
      key: Key('ttPeriod${p.startsAt}'),
      color: now ? c.primaryContainer : null,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 56,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [Text(p.startsAt, style: context.text.titleSmall), Text(p.endsAt, style: context.text.bodySmall)],
              ),
            ),
            const SizedBox(width: Kx.s12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(p.subject, style: context.text.titleMedium),
                  const SizedBox(height: 2),
                  Text(
                    [
                      p.usualTeacher != null ? l.ttSubstitute(p.teacher, p.usualTeacher!) : p.teacher,
                      if (p.room != null) p.room!,
                      ...tags,
                    ].join(' · '),
                    style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
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
