import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';
import '../attendance/attendance_screen.dart';
import '../board/connect_screen.dart';
import 'today_controller.dart';

class TodayTab extends StatelessWidget {
  const TodayTab({super.key, required this.controller, required this.me, required this.onOpenProfile});

  final TodayController controller;
  final Me me;
  final VoidCallback onOpenProfile;

  TeacherApi get api => controller.api;

  Future<void> _connect(BuildContext context) async {
    final result = await Navigator.of(context)
        .push<BoardConnection?>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => ConnectScreen(api: api)));
    if (result != null) controller.connected(result);
    await controller.refreshConnection();
  }

  Future<void> _endClass(BuildContext context) async {
    final c = controller.connection!;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('End class?'),
        content: Text('${c.boardName} will sign you out and return to its pairing screen.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('End class')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await controller.endClass();
      messenger.showSnackBar(SnackBar(content: Text('Class ended on ${c.boardName}')));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _takeAttendance(BuildContext context, Period p) async {
    final taken = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => AttendanceScreen(api: api, period: p, date: controller.selectedDate!),
      ),
    );
    if (taken == true) controller.markTaken(p.slotId);
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final day = controller.day;
        final today = controller.today != null ? parseIsoDate(controller.today!) : DateTime.now();
        final selected = controller.selectedDate != null ? parseIsoDate(controller.selectedDate!) : today;
        return RefreshIndicator(
          onRefresh: controller.reload,
          child: CustomScrollView(
            slivers: [
              SliverSafeArea(
                bottom: false,
                sliver: SliverToBoxAdapter(
                  child: _Header(me: me, today: today, onAvatar: onOpenProfile),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
                sliver: SliverToBoxAdapter(
                  child: controller.connection != null
                      ? _ConnectedCard(connection: controller.connection!, onEnd: () => _endClass(context))
                      : _ConnectCard(onConnect: () => _connect(context)),
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: Kx.s16)),
              SliverToBoxAdapter(
                child: _DayStrip(today: today, selected: selected, onSelect: (d) => controller.select(isoDate(d))),
              ),
              SliverToBoxAdapter(
                child: _DayHeading(controller: controller, selected: selected, today: today),
              ),
              if (controller.error != null)
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s12),
                  sliver: SliverToBoxAdapter(child: ErrorBanner(controller.error!, onRetry: controller.reload)),
                ),
              if (day == null && controller.loading)
                const SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.all(Kx.s48),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                )
              else if (day != null && day.periods.isEmpty)
                SliverToBoxAdapter(
                  child: KxEmptyState(
                    icon: Icons.event_available_outlined,
                    message: 'No classes on ${Fmt.weekday(selected)}',
                    action: day.nextTeachingDate == null
                        ? null
                        : FilledButton.tonal(
                            onPressed: () => controller.select(day.nextTeachingDate!),
                            child: Text('Show ${Fmt.relativeDay(parseIsoDate(day.nextTeachingDate!), today)}'),
                          ),
                  ),
                )
              else if (day != null)
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s24),
                  sliver: SliverList.separated(
                    itemCount: day.periods.length,
                    separatorBuilder: (_, _) => const SizedBox(height: Kx.s12),
                    itemBuilder: (context, i) {
                      final p = day.periods[i];
                      return _PeriodCard(
                        period: p,
                        canTakeAttendance: !controller.isSelectedFuture,
                        onAttendance: () => _takeAttendance(context, p),
                        onTeach: p.isNow && controller.connection == null ? () => _connect(context) : null,
                      );
                    },
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.me, required this.today, required this.onAvatar});

  final Me me;
  final DateTime today;
  final VoidCallback onAvatar;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s8, Kx.s20),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${Fmt.greeting(DateTime.now())}, ${me.firstName}', style: context.text.headlineSmall),
                const SizedBox(height: Kx.s4),
                Text(Fmt.longDay(today), style: context.text.bodyLarge?.copyWith(color: context.colors.onSurfaceVariant)),
              ],
            ),
          ),
          IconButton(
            onPressed: onAvatar,
            tooltip: 'Profile',
            icon: KxAvatar(name: me.fullName, size: 36),
          ),
        ],
      ),
    );
  }
}

class _ConnectCard extends StatelessWidget {
  const _ConnectCard({required this.onConnect});

  final VoidCallback onConnect;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Card(
      child: InkWell(
        borderRadius: Kx.radiusLg,
        onTap: onConnect,
        child: Padding(
          padding: const EdgeInsets.all(Kx.s16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 24,
                    backgroundColor: c.primaryContainer,
                    child: Icon(Icons.qr_code_scanner, color: c.onPrimaryContainer),
                  ),
                  const SizedBox(width: Kx.s16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Connect to board', style: context.text.titleMedium),
                        const SizedBox(height: 2),
                        Text(
                          'Scan the QR code on the classroom board to start teaching',
                          style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: Kx.s12),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton.icon(
                  key: const Key('connectBoard'),
                  onPressed: onConnect,
                  icon: const Icon(Icons.qr_code_scanner, size: 18),
                  label: const Text('Connect'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ConnectedCard extends StatelessWidget {
  const _ConnectedCard({required this.connection, required this.onEnd});

  final BoardConnection connection;
  final VoidCallback onEnd;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final details = [connection.sectionName, connection.subjectName].whereType<String>().join(' · ');
    return Card(
      color: c.secondaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 24,
                  backgroundColor: c.primary,
                  child: Icon(Icons.cast_connected, color: c.onPrimary),
                ),
                const SizedBox(width: Kx.s16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Connected', style: context.text.labelLarge?.copyWith(color: c.onSecondaryContainer)),
                      Text(connection.boardName, style: context.text.titleMedium?.copyWith(color: c.onSecondaryContainer)),
                      if (details.isNotEmpty) Text(details, style: context.text.bodyMedium?.copyWith(color: c.onSecondaryContainer)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: Kx.s12),
            Row(
              children: [
                if (connection.periodLabel != null)
                  Expanded(
                    child: Text(connection.periodLabel!, style: context.text.bodyMedium?.copyWith(color: c.onSecondaryContainer)),
                  )
                else
                  const Spacer(),
                FilledButton.icon(onPressed: onEnd, icon: const Icon(Icons.stop_circle_outlined, size: 18), label: const Text('End class')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// A scrollable strip of days: last week, this week and the next two, today second from the left.
class _DayStrip extends StatefulWidget {
  const _DayStrip({required this.today, required this.selected, required this.onSelect});

  final DateTime today;
  final DateTime selected;
  final ValueChanged<DateTime> onSelect;

  static const before = 7, after = 13;

  @override
  State<_DayStrip> createState() => _DayStripState();
}

class _DayStripState extends State<_DayStrip> {
  ScrollController? _scroll;

  @override
  void dispose() {
    _scroll?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, box) {
        final itemWidth = (box.maxWidth - Kx.s16) / 7;
        _scroll ??= ScrollController(initialScrollOffset: (_DayStrip.before - 1) * itemWidth);
        final first = DateTime(widget.today.year, widget.today.month, widget.today.day - _DayStrip.before);
        return SizedBox(
          height: 72,
          child: ListView.builder(
            controller: _scroll,
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: Kx.s8),
            itemExtent: itemWidth,
            itemCount: _DayStrip.before + 1 + _DayStrip.after,
            itemBuilder: (context, i) {
              final d = DateTime(first.year, first.month, first.day + i);
              return _DayCell(
                date: d,
                isToday: DateUtils.isSameDay(d, widget.today),
                isSelected: DateUtils.isSameDay(d, widget.selected),
                onTap: () => widget.onSelect(d),
              );
            },
          ),
        );
      },
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({required this.date, required this.isToday, required this.isSelected, required this.onTap});

  final DateTime date;
  final bool isToday;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final fg = isSelected ? c.onPrimary : (isToday ? c.primary : c.onSurface);
    return Semantics(
      selected: isSelected,
      button: true,
      label: Fmt.longDay(date),
      child: InkWell(
        onTap: onTap,
        borderRadius: Kx.radiusLg,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(Fmt.weekdayShort(date), style: context.text.labelMedium?.copyWith(color: isToday ? c.primary : c.onSurfaceVariant)),
            const SizedBox(height: Kx.s4),
            Container(
              width: 36,
              height: 36,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isSelected ? c.primary : null,
                border: isToday && !isSelected ? Border.all(color: c.primary) : null,
              ),
              child: Text(
                '${date.day}',
                style: context.text.titleSmall?.copyWith(color: fg, fontWeight: FontWeight.w500),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DayHeading extends StatelessWidget {
  const _DayHeading({required this.controller, required this.selected, required this.today});

  final TodayController controller;
  final DateTime selected;
  final DateTime today;

  @override
  Widget build(BuildContext context) {
    final count = controller.day?.periods.length ?? 0;
    final distance = selected.difference(today).inDays.abs();
    final title = DateUtils.isSameDay(selected, today)
        ? "Today's classes"
        : distance < 7
        ? "${Fmt.weekday(selected)}'s classes"
        : 'Classes on ${Fmt.shortDay(selected)}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (controller.showingNextDay)
          Padding(
            padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, 0),
            child: Row(
              children: [
                Icon(Icons.weekend_outlined, size: 18, color: context.colors.onSurfaceVariant),
                const SizedBox(width: Kx.s8),
                Text('No classes today', style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
              ],
            ),
          ),
        KxSectionHeader(
          title,
          trailing: count == 0
              ? null
              : Text(
                  '$count ${count == 1 ? 'period' : 'periods'}',
                  style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant),
                ),
        ),
      ],
    );
  }
}

class _PeriodCard extends StatelessWidget {
  const _PeriodCard({required this.period, required this.canTakeAttendance, required this.onAttendance, this.onTeach});

  final Period period;
  final bool canTakeAttendance;
  final VoidCallback onAttendance;
  final VoidCallback? onTeach;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final now = period.isNow;
    final onCard = now ? c.onPrimaryContainer : c.onSurface;
    final muted = now ? c.onPrimaryContainer : c.onSurfaceVariant;
    final where = [period.section.name, if (period.room != null) period.room!.name].join(' · ');

    final Widget attendance;
    if (period.attendanceTaken) {
      attendance = OutlinedButton.icon(
        onPressed: onAttendance,
        icon: Icon(Icons.check_circle, size: 18, color: c.primary),
        label: const Text('Attendance taken'),
      );
    } else if (!canTakeAttendance) {
      attendance = Text('Attendance opens on the day', style: context.text.bodySmall?.copyWith(color: muted));
    } else if (now) {
      attendance = FilledButton.icon(
        onPressed: onAttendance,
        icon: const Icon(Icons.fact_check_outlined, size: 18),
        label: const Text('Take attendance'),
      );
    } else {
      attendance = FilledButton.tonalIcon(
        onPressed: onAttendance,
        icon: const Icon(Icons.fact_check_outlined, size: 18),
        label: const Text('Take attendance'),
      );
    }

    return Card(
      color: now ? c.primaryContainer : null,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, Kx.s12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 76,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        period.startsAt.label,
                        style: context.text.titleSmall?.copyWith(color: onCard, fontWeight: FontWeight.w500),
                      ),
                      Text(period.endsAt.label, style: context.text.bodySmall?.copyWith(color: muted)),
                    ],
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(period.subject.name, style: context.text.titleMedium?.copyWith(color: onCard)),
                      const SizedBox(height: 2),
                      Text(where, style: context.text.bodyMedium?.copyWith(color: muted)),
                    ],
                  ),
                ),
                if (now) Pill('Now', background: c.primary, foreground: c.onPrimary),
              ],
            ),
            const SizedBox(height: Kx.s12),
            SizedBox(
              width: double.infinity,
              child: Wrap(
                alignment: WrapAlignment.end,
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                children: [
                  if (onTeach != null)
                    TextButton.icon(onPressed: onTeach, icon: const Icon(Icons.cast, size: 18), label: const Text('Teach on board')),
                  attendance,
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
