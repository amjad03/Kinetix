import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// Every period's mark over the last 30 days, grouped by day, newest first.
class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({super.key, required this.api, required this.child, this.highlightDate, this.initialStatus});

  final ParentApi api;
  final Child child;

  /// Opened from an absence alert: that day is marked.
  final DateTime? highlightDate;

  /// Opened from a count on Today: only that status.
  final AttendanceStatus? initialStatus;

  static Future<void> open(BuildContext context, ParentApi api, Child child, {DateTime? highlightDate, AttendanceStatus? status}) =>
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => AttendanceScreen(api: api, child: child, highlightDate: highlightDate, initialStatus: status),
        ),
      );

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> {
  static const _days = 30;
  List<ClassMark>? _marks;
  ApiException? _error;

  /// The status shown; null shows every class.
  late AttendanceStatus? _status = widget.initialStatus;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final marks = await widget.api.attendance(widget.child.id, days: _days);
      if (mounted) setState(() => _marks = marks);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final marks = _marks;
    final shown = marks?.where((m) => _status == null || m.status == _status).toList();
    final missed = _status == AttendanceStatus.absent || _status == AttendanceStatus.late;
    final days = <DateTime, List<ClassMark>>{};
    for (final m in shown ?? const <ClassMark>[]) {
      days.putIfAbsent(m.date, () => []).add(m);
    }
    for (final list in days.values) {
      list.sort((a, b) => (a.startsAt?.minutes ?? 0).compareTo(b.startsAt?.minutes ?? 0));
    }
    final dates = days.keys.toList()..sort((a, b) => b.compareTo(a));

    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.childAttendance(widget.child.firstName))),
      body: RefreshIndicator(
        onRefresh: _load,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.l10n.sectionLastDays(widget.child.sectionName, _days),
                      style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
                    ),
                    const SizedBox(height: Kx.s12),
                    KxCountChips<AttendanceStatus?>(
                      padding: EdgeInsets.zero,
                      selected: _status,
                      onSelected: (v) => setState(() => _status = v),
                      chips: [
                        KxCountChip(key: const Key('count-all'), value: null, label: KxStrings.of(context).all, count: marks?.length ?? 0),
                        for (final st in AttendanceStatus.values)
                          if (st != AttendanceStatus.excused || (marks ?? const []).any((m) => m.status == st))
                            KxCountChip(
                              key: Key('count-${st.name}'),
                              value: st,
                              label: context.l10n.attendanceStatus(st),
                              count: (marks ?? const []).where((m) => m.status == st).length,
                              background: Tone.status(context, st).$1,
                              foreground: Tone.status(context, st).$2,
                            ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            if (_error != null)
              SliverPadding(
                padding: const EdgeInsets.all(Kx.s16),
                sliver: SliverToBoxAdapter(child: ErrorBanner(_error!, onRetry: _load)),
              )
            else if (marks == null)
              const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
            else if (dates.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: KxEmptyState(
                  icon: missed ? Icons.celebration_outlined : Icons.event_available_outlined,
                  message: missed ? context.l10n.notMissedAny(widget.child.firstName, _days) : context.l10n.noAttendanceTaken(_days),
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s24),
                sliver: SliverList.separated(
                  itemCount: dates.length,
                  separatorBuilder: (_, _) => const SizedBox(height: Kx.s12),
                  itemBuilder: (context, i) => _DayCard(
                    date: dates[i],
                    marks: days[dates[i]]!,
                    allMarks: marks.where((m) => m.date == dates[i]).toList(),
                    highlighted: widget.highlightDate != null && Fmt.daysBetween(widget.highlightDate!, dates[i]) == 0,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _DayCard extends StatelessWidget {
  const _DayCard({required this.date, required this.marks, required this.allMarks, required this.highlighted});

  final DateTime date;
  final List<ClassMark> marks;
  final List<ClassMark> allMarks;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final attended = allMarks.where((m) => m.status != AttendanceStatus.absent).length;
    final allThere = attended == allMarks.length;
    return Card(
      shape: highlighted
          ? RoundedRectangleBorder(
              borderRadius: Kx.radiusLg,
              side: BorderSide(color: c.primary, width: 2),
            )
          : null,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: Kx.s8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s4),
              child: Row(
                children: [
                  Expanded(child: Text(context.fmt.longDay(date), style: context.text.titleSmall)),
                  const SizedBox(width: Kx.s8),
                  // Longer words (or larger text) wrap instead of pushing past the edge.
                  Flexible(
                    child: Text(
                      allThere ? context.l10n.attendedAll : context.l10n.attendedNofM(attended, allMarks.length),
                      textAlign: TextAlign.end,
                      style: context.text.labelMedium?.copyWith(color: allThere ? Tone.good(context) : c.onSurfaceVariant),
                    ),
                  ),
                ],
              ),
            ),
            for (final m in marks)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s8),
                child: Row(
                  children: [
                    SizedBox(
                      width: 52,
                      child: Text(m.startsAt?.label ?? '–', style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                    ),
                    Expanded(child: Text(m.subject ?? context.l10n.wholeDay, style: context.text.bodyLarge)),
                    const SizedBox(width: Kx.s8),
                    StatusPill(m.status),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
