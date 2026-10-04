import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';

/// A class's year plan for one subject: the syllabus spread over the weeks of the term.
class YearPlanController extends ChangeNotifier {
  YearPlanController({required this.api, required this.section, required this.subject});

  final TeacherApi api;
  final Ref section;
  final Ref subject;

  YearPlan? plan;

  /// Loaded, and there is no plan yet.
  bool none = false;
  bool loading = false;

  /// Making the plan or saving a change.
  bool busy = false;
  ApiException? error;

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      plan = await api.yearPlan(sectionId: section.id, subjectId: subject.id);
      none = plan == null;
    } on ApiException catch (e) {
      error = e;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// Makes or remakes the plan. Throws [ApiException] for the caller to show.
  Future<void> generate({DateTime? startsOn, DateTime? endsOn}) => _busy(() async {
    plan = await api.generateYearPlan(
      sectionId: section.id,
      subjectId: subject.id,
      startsOn: startsOn == null ? null : isoDate(startsOn),
      endsOn: endsOn == null ? null : isoDate(endsOn),
    );
    none = false;
  });

  /// Moves a topic to another week and/or changes its periods. Throws [ApiException].
  Future<void> move(YearPlanItem item, {required DateTime weekOf, required int periods}) => _busy(() async {
    plan = await api.moveYearPlanItem(plan!.id, topicId: item.topicId, weekOf: isoDate(weekOf), periods: periods);
  });

  Future<void> _busy(Future<void> Function() f) async {
    busy = true;
    notifyListeners();
    try {
      await f();
    } finally {
      busy = false;
      notifyListeners();
    }
  }
}

/// The year plan: a status banner, then each week with its topics (this week highlighted),
/// taught ticks and late markers. A topic can move to another week or get more periods; the
/// whole plan can be remade from new dates.
class YearPlanScreen extends StatefulWidget {
  const YearPlanScreen({super.key, required this.api, required this.section, required this.subject});

  final TeacherApi api;
  final Ref section;
  final Ref subject;

  @override
  State<YearPlanScreen> createState() => _YearPlanScreenState();
}

class _YearPlanScreenState extends State<YearPlanScreen> {
  late final controller = YearPlanController(api: widget.api, section: widget.section, subject: widget.subject)..load();

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  void _say(String message) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));

  Future<void> _make({required bool remake}) async {
    final l = context.l10n;
    if (remake) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(ctx.l10n.remakeYearPlanTitle),
          content: Text(ctx.l10n.remakeYearPlanBody),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(ctx.l10n.cancel)),
            FilledButton(key: const Key('confirmRemake'), onPressed: () => Navigator.pop(ctx, true), child: Text(ctx.l10n.remake)),
          ],
        ),
      );
      if (ok != true || !mounted) return;
    }
    final dates = await showDialog<_Dates>(context: context, builder: (_) => const _DatesDialog());
    if (dates == null || !mounted) return;
    try {
      await controller.generate(startsOn: dates.startsOn, endsOn: dates.endsOn);
      _say(l.yearPlanMade);
    } on ApiException catch (e) {
      _say(l.errorText(e));
    }
  }

  Future<void> _edit(YearPlanItem item) async {
    final l = context.l10n;
    final result = await showDialog<(DateTime, int)>(
      context: context,
      builder: (_) => _MoveDialog(item: item, weeks: controller.plan!.weeks),
    );
    if (result == null || !mounted) return;
    if (result.$1 == item.weekOf && result.$2 == item.periods) return;
    try {
      await controller.move(item, weekOf: result.$1, periods: result.$2);
      _say(l.yearPlanUpdated);
    } on ApiException catch (e) {
      _say(l.errorText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      body: ListenableBuilder(
        listenable: controller,
        builder: (context, _) {
          final plan = controller.plan;
          final thisWeek = mondayOf(DateUtils.dateOnly(DateTime.now()));
          final weeks = <DateTime, List<YearPlanItem>>{};
          for (final i in plan?.items ?? const <YearPlanItem>[]) {
            weeks.putIfAbsent(i.weekOf, () => []).add(i);
          }
          return RefreshIndicator(
            onRefresh: controller.load,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverAppBar.large(
                  title: Text(l.yearPlan),
                  actions: [
                    if (plan != null)
                      PopupMenuButton<String>(
                        key: const Key('yearPlanMenu'),
                        enabled: !controller.busy,
                        onSelected: (_) => _make(remake: true),
                        itemBuilder: (_) => [
                          PopupMenuItem(key: const Key('remakePlan'), value: 'remake', child: Text(l.remakeYearPlan)),
                        ],
                      ),
                  ],
                ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s8),
                    child: Text(
                      '${widget.section.name} · ${widget.subject.name}',
                      style: context.text.titleMedium?.copyWith(color: context.colors.onSurfaceVariant),
                    ),
                  ),
                ),
                if (controller.busy) const SliverToBoxAdapter(child: LinearProgressIndicator()),
                if (controller.error != null)
                  SliverPadding(
                    padding: const EdgeInsets.all(Kx.s16),
                    sliver: SliverToBoxAdapter(child: ErrorBanner.api(controller.error!, onRetry: controller.load)),
                  ),
                if (controller.loading && plan == null)
                  const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
                else if (controller.none)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: KxEmptyState(
                      key: const Key('yearPlanNone'),
                      icon: Icons.calendar_view_week_outlined,
                      message: l.yearPlanNone,
                      action: FilledButton.icon(
                        key: const Key('makeYearPlan'),
                        onPressed: controller.busy ? null : () => _make(remake: false),
                        icon: const Icon(Icons.auto_fix_high_outlined, size: 18),
                        label: Text(l.makeYearPlan),
                      ),
                    ),
                  )
                else if (plan != null) ...[
                  SliverToBoxAdapter(child: _StatusBanner(plan: plan)),
                  for (final w in weeks.entries) ...[
                    SliverToBoxAdapter(
                      child: _WeekHeader(weekOf: w.key, current: w.key == thisWeek),
                    ),
                    SliverList.list(
                      children: [
                        for (final i in w.value)
                          _ItemTile(item: i, current: w.key == thisWeek, onEdit: controller.busy ? null : () => _edit(i)),
                      ],
                    ),
                  ],
                  const SliverToBoxAdapter(child: SizedBox(height: Kx.s32)),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({required this.plan});

  final YearPlan plan;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final p = plan.progress;
    final (good, onGood) = goodColors(context);
    final (bg, fg, icon) = switch (p.status) {
      PlanStatus.behind => (c.errorContainer, c.onErrorContainer, Icons.warning_amber_rounded),
      PlanStatus.onTrack => (good, onGood, Icons.check_circle_outline),
      PlanStatus.ahead => (good, onGood, Icons.rocket_launch_outlined),
      PlanStatus.notStarted => (c.surfaceContainerHigh, c.onSurface, Icons.schedule_outlined),
    };
    final fmt = Fmt.of(context);
    return Card(
      key: const Key('planStatus'),
      color: bg,
      margin: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s8),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: fg),
                const SizedBox(width: Kx.s12),
                Expanded(child: Text(l.planStatus(p), style: context.text.titleMedium?.copyWith(color: fg))),
              ],
            ),
            const SizedBox(height: Kx.s8),
            Text(l.topicsTaught(p.covered, p.total), style: context.text.bodyMedium?.copyWith(color: fg)),
            Text('${fmt.shortDay(plan.startsOn)} – ${fmt.shortDay(plan.endsOn)}', style: context.text.bodySmall?.copyWith(color: fg)),
            const SizedBox(height: Kx.s8),
            ClipRRect(
              borderRadius: Kx.radiusSm,
              child: LinearProgressIndicator(value: p.total == 0 ? 0 : p.covered / p.total, minHeight: 6),
            ),
          ],
        ),
      ),
    );
  }
}

class _WeekHeader extends StatelessWidget {
  const _WeekHeader({required this.weekOf, required this.current});

  final DateTime weekOf;
  final bool current;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    return Padding(
      key: Key('week-${isoDate(weekOf)}'),
      padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, Kx.s4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              l.weekOf(Fmt.of(context).shortDay(weekOf)),
              style: context.text.titleSmall?.copyWith(color: current ? c.primary : null),
            ),
          ),
          if (current) Pill(l.thisWeek, key: const Key('thisWeek'), background: c.primary, foreground: c.onPrimary),
        ],
      ),
    );
  }
}

class _ItemTile extends StatelessWidget {
  const _ItemTile({required this.item, required this.current, required this.onEdit});

  final YearPlanItem item;
  final bool current;
  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final taught = item.coveredOn;
    final details = [
      if (item.chapter.isNotEmpty) item.chapter,
      l.periodsCount(item.periods),
    ].join(' · ');
    return Material(
      color: current ? c.primaryContainer.withValues(alpha: 0.35) : Colors.transparent,
      child: ListTile(
        key: Key('planItem-${item.topicId}'),
        contentPadding: const EdgeInsets.only(left: Kx.s16, right: Kx.s4),
        leading: taught != null
            ? Icon(Icons.check_circle, key: Key('planTaught-${item.topicId}'), color: goodColors(context).$2)
            : item.late
            ? Icon(Icons.error_outline, color: c.error)
            : Icon(Icons.radio_button_unchecked, color: c.outline),
        title: Text(item.title),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(details),
            if (taught != null)
              Text(l.taughtOn(Fmt.of(context).shortDay(taught)), style: context.text.bodySmall?.copyWith(color: c.primary))
            else if (item.late)
              Padding(
                padding: const EdgeInsets.only(top: Kx.s4),
                child: Pill(l.planLate, key: Key('planLate-${item.topicId}'), background: c.errorContainer, foreground: c.onErrorContainer),
              ),
          ],
        ),
        trailing: IconButton(
          key: Key('editPlanItem-${item.topicId}'),
          tooltip: l.changeWeek,
          onPressed: onEdit,
          icon: const Icon(Icons.edit_calendar_outlined),
        ),
      ),
    );
  }
}

typedef _Dates = ({DateTime? startsOn, DateTime? endsOn});

/// Start and end dates for a new plan. A date is sent only when the teacher changed it, so the
/// server's default (16 weeks, up to the end of the academic year) applies otherwise.
class _DatesDialog extends StatefulWidget {
  const _DatesDialog();

  @override
  State<_DatesDialog> createState() => _DatesDialogState();
}

class _DatesDialogState extends State<_DatesDialog> {
  final _today = DateUtils.dateOnly(DateTime.now());
  DateTime? _start;
  DateTime? _end;

  DateTime get start => _start ?? _today;
  DateTime get end => _end ?? start.add(const Duration(days: 16 * 7 - 1));

  Future<void> _pick({required bool isStart}) async {
    final first = isStart ? _today.subtract(const Duration(days: 365)) : start;
    final picked = await showDatePicker(
      context: context,
      initialDate: isStart ? start : (end.isBefore(start) ? start : end),
      firstDate: first,
      lastDate: _today.add(const Duration(days: 2 * 365)),
      helpText: isStart ? context.l10n.planStartsOn : context.l10n.planEndsOn,
    );
    if (picked == null) return;
    setState(() {
      if (isStart) {
        _start = picked;
        if (_end != null && _end!.isBefore(picked)) _end = null;
      } else {
        _end = picked;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final fmt = Fmt.of(context);
    return AlertDialog(
      title: Text(l.makeYearPlan),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l.planDatesNote, style: context.text.bodyMedium),
            const SizedBox(height: Kx.s8),
            ListTile(
              key: const Key('planStart'),
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.event_outlined),
              title: Text(l.planStartsOn),
              subtitle: Text(fmt.shortDay(start)),
              onTap: () => _pick(isStart: true),
            ),
            ListTile(
              key: const Key('planEnd'),
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.event_available_outlined),
              title: Text(l.planEndsOn),
              subtitle: Text(fmt.shortDay(end)),
              onTap: () => _pick(isStart: false),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(
          key: const Key('generatePlan'),
          onPressed: () => Navigator.pop<_Dates>(context, (startsOn: _start, endsOn: _end)),
          child: Text(l.makePlan),
        ),
      ],
    );
  }
}

/// Moves a topic to another week of the plan and sets its periods.
class _MoveDialog extends StatefulWidget {
  const _MoveDialog({required this.item, required this.weeks});

  final YearPlanItem item;
  final List<DateTime> weeks;

  @override
  State<_MoveDialog> createState() => _MoveDialogState();
}

class _MoveDialogState extends State<_MoveDialog> {
  late DateTime _week = widget.item.weekOf;
  late int _periods = widget.item.periods;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final fmt = Fmt.of(context);
    final weeks = {...widget.weeks, widget.item.weekOf}.toList()..sort();
    return AlertDialog(
      title: Text(widget.item.title, maxLines: 3, overflow: TextOverflow.ellipsis),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DropdownButtonFormField<DateTime>(
            key: const Key('weekPicker'),
            initialValue: _week,
            isExpanded: true,
            decoration: InputDecoration(labelText: l.planWeek),
            items: [
              for (final w in weeks)
                DropdownMenuItem(
                  value: w,
                  child: Text(l.weekOf(fmt.shortDay(w)), maxLines: 1, overflow: TextOverflow.ellipsis),
                ),
            ],
            onChanged: (w) => setState(() => _week = w ?? _week),
          ),
          const SizedBox(height: Kx.s16),
          Row(
            children: [
              Expanded(child: Text(l.planPeriods, style: context.text.bodyLarge)),
              IconButton(
                key: const Key('periodsLess'),
                tooltip: l.fewerPeriods,
                onPressed: _periods > 1 ? () => setState(() => _periods--) : null,
                icon: const Icon(Icons.remove_circle_outline),
              ),
              Text('$_periods', key: const Key('periodsValue'), style: context.text.titleMedium),
              IconButton(
                key: const Key('periodsMore'),
                tooltip: l.morePeriods,
                onPressed: _periods < 40 ? () => setState(() => _periods++) : null,
                icon: const Icon(Icons.add_circle_outline),
              ),
            ],
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(key: const Key('saveMove'), onPressed: () => Navigator.pop(context, (_week, _periods)), child: Text(l.save)),
      ],
    );
  }
}

Future<void> openYearPlan(BuildContext context, {required TeacherApi api, required Ref section, required Ref subject}) =>
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => YearPlanScreen(api: api, section: section, subject: subject)));
