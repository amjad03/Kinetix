import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';

/// Every period's mark over the last 30 days, grouped by day, newest first.
class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({super.key, required this.api, required this.child, this.highlightDate});

  final ParentApi api;
  final Child child;

  /// Opened from an absence alert: that day is marked.
  final DateTime? highlightDate;

  static Future<void> open(BuildContext context, ParentApi api, Child child, {DateTime? highlightDate}) => Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => AttendanceScreen(api: api, child: child, highlightDate: highlightDate),
    ),
  );

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> {
  static const _days = 30;
  List<ClassMark>? _marks;
  String? _error;
  bool _onlyMissed = false;

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
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final marks = _marks;
    final shown = marks?.where((m) => !_onlyMissed || m.status == AttendanceStatus.absent || m.status == AttendanceStatus.late).toList();
    final days = <DateTime, List<ClassMark>>{};
    for (final m in shown ?? const <ClassMark>[]) {
      days.putIfAbsent(m.date, () => []).add(m);
    }
    for (final list in days.values) {
      list.sort((a, b) => (a.startsAt?.minutes ?? 0).compareTo(b.startsAt?.minutes ?? 0));
    }
    final dates = days.keys.toList()..sort((a, b) => b.compareTo(a));

    return Scaffold(
      appBar: AppBar(title: Text("${widget.child.firstName}'s attendance")),
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
                      '${widget.child.sectionName} · last $_days days',
                      style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
                    ),
                    const SizedBox(height: Kx.s12),
                    Wrap(
                      spacing: Kx.s8,
                      children: [
                        ChoiceChip(
                          label: const Text('All classes'),
                          selected: !_onlyMissed,
                          onSelected: (_) => setState(() => _onlyMissed = false),
                        ),
                        ChoiceChip(
                          key: const Key('onlyMissed'),
                          label: const Text('Absent or late'),
                          selected: _onlyMissed,
                          onSelected: (_) => setState(() => _onlyMissed = true),
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
                  icon: _onlyMissed ? Icons.celebration_outlined : Icons.event_available_outlined,
                  message: _onlyMissed
                      ? '${widget.child.firstName} has not missed a class in the last $_days days.'
                      : 'No attendance has been taken in the last $_days days.',
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
                  Expanded(child: Text(Fmt.longDay(date), style: context.text.titleSmall)),
                  Text(
                    allThere ? 'Attended all' : 'Attended $attended of ${allMarks.length}',
                    style: context.text.labelMedium?.copyWith(color: allThere ? Tone.good(context) : c.onSurfaceVariant),
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
                    Expanded(child: Text(m.subject ?? 'Whole day', style: context.text.bodyLarge)),
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
