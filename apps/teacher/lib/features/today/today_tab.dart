import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';
import '../attendance/attendance_screen.dart';
import '../board/connect_screen.dart';
import '../remote/remote_screen.dart';
import '../plans/lesson_plan_screen.dart';
import '../syllabus/syllabus_screen.dart';
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
        title: Text(ctx.l10n.endClassTitle),
        content: Text(ctx.l10n.endClassBody(c.boardName)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(ctx.l10n.cancel)),
          FilledButton(key: const Key('confirmEndClass'), onPressed: () => Navigator.pop(ctx, true), child: Text(ctx.l10n.endClass)),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    final l = context.l10n;
    try {
      await controller.endClass();
      messenger.showSnackBar(SnackBar(content: Text(l.classEnded(c.boardName))));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(l.errorText(e))));
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
        final l = context.l10n;
        final fmt = Fmt.of(context);
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
                      ? _ConnectedCard(
                          connection: controller.connection!,
                          onEnd: () => _endClass(context),
                          onRemote: controller.connection!.boardId == null
                              ? null
                              : () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => RemoteScreen(api: api, connection: controller.connection!))),
                        )
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
                  sliver: SliverToBoxAdapter(child: ErrorBanner.api(controller.error!, onRetry: controller.reload)),
                ),
              if (day == null && controller.loading)
                const SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.all(Kx.s48),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                )
              else if (day != null && day.periods.isEmpty && day.holiday != null)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        HolidayCard(title: day.holiday!),
                        if (day.nextTeachingDate != null) ...[
                          const SizedBox(height: Kx.s12),
                          Center(
                            child: FilledButton.tonal(
                              key: const Key('showNextTeachingDay'),
                              onPressed: () => controller.select(day.nextTeachingDate!),
                              child: Text(l.showDay(fmt.relativeDay(parseIsoDate(day.nextTeachingDate!), today))),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                )
              else if (day != null && day.periods.isEmpty)
                SliverToBoxAdapter(
                  child: KxEmptyState(
                    icon: Icons.event_available_outlined,
                    message: l.noClassesOn(fmt.weekday(selected)),
                    action: day.nextTeachingDate == null
                        ? null
                        : FilledButton.tonal(
                            onPressed: () => controller.select(day.nextTeachingDate!),
                            child: Text(l.showDay(fmt.relativeDay(parseIsoDate(day.nextTeachingDate!), today))),
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
                        onSyllabus: () => openSyllabus(context, api: api, section: p.section, subject: p.subject, teacherName: me.fullName),
                        onPlan: () => openLessonPlan(
                          context,
                          api: api,
                          period: p,
                          date: controller.selectedDate!,
                          onSaved: () => controller.markPlanned(p.slotId),
                        ),
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
    final fmt = Fmt.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s8, Kx.s20),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(fmt.greeting(DateTime.now(), me.firstName), key: const Key('greeting'), style: context.text.headlineSmall),
                const SizedBox(height: Kx.s4),
                Text(fmt.longDay(today), style: context.text.bodyLarge?.copyWith(color: context.colors.onSurfaceVariant)),
              ],
            ),
          ),
          IconButton(
            onPressed: onAvatar,
            key: const Key('profileButton'),
            tooltip: context.l10n.profile,
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
                        Text(context.l10n.connectToBoard, style: context.text.titleMedium),
                        const SizedBox(height: 2),
                        Text(context.l10n.connectToBoardBody, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
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
                  label: Text(context.l10n.connect),
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
  const _ConnectedCard({required this.connection, required this.onEnd, this.onRemote});

  final BoardConnection connection;
  final VoidCallback onEnd;

  /// Opens the phone remote for this board.
  final VoidCallback? onRemote;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final details = [connection.sectionName, connection.subjectName].whereType<String>().join(' · ');
    final period = Fmt.of(context).period(connection);
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
                      Text(context.l10n.connected, style: context.text.labelLarge?.copyWith(color: c.onSecondaryContainer)),
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
                if (period != null)
                  Expanded(
                    child: Text(period, style: context.text.bodyMedium?.copyWith(color: c.onSecondaryContainer)),
                  )
                else
                  const Spacer(),
                FilledButton.icon(
                  key: const Key('endClassCard'),
                  onPressed: onEnd,
                  icon: const Icon(Icons.stop_circle_outlined, size: 18),
                  label: Text(context.l10n.endClass),
                ),
              ],
            ),
            if (onRemote != null) ...[
              const SizedBox(height: Kx.s8),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  key: const Key('openRemote'),
                  onPressed: onRemote,
                  icon: const Icon(Icons.settings_remote_outlined, size: 18),
                  label: Text(context.l10n.phoneRemote),
                ),
              ),
            ],
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
    final fmt = Fmt.of(context);
    return Semantics(
      selected: isSelected,
      button: true,
      label: fmt.longDay(date),
      child: InkWell(
        onTap: onTap,
        borderRadius: Kx.radiusLg,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              fmt.weekdayShort(date),
              maxLines: 1,
              overflow: TextOverflow.fade,
              softWrap: false,
              style: context.text.labelMedium?.copyWith(color: isToday ? c.primary : c.onSurfaceVariant),
            ),
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
    final l = context.l10n;
    final fmt = Fmt.of(context);
    final count = controller.day?.periods.length ?? 0;
    final distance = selected.difference(today).inDays.abs();
    final title = DateUtils.isSameDay(selected, today)
        ? l.todaysClasses
        : distance < 7
        ? l.weekdayClasses(fmt.weekday(selected))
        : l.classesOn(fmt.shortDay(selected));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (controller.showingNextDay && controller.todayHoliday != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, 0),
            child: HolidayCard(title: controller.todayHoliday!),
          )
        else if (controller.showingNextDay)
          Padding(
            padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, 0),
            child: Row(
              children: [
                Icon(Icons.weekend_outlined, size: 18, color: context.colors.onSurfaceVariant),
                const SizedBox(width: Kx.s8),
                Expanded(
                  child: Text(l.noClassesToday, style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
                ),
              ],
            ),
          ),
        KxSectionHeader(
          key: const Key('dayHeading'),
          title,
          trailing: count == 0
              ? null
              : Text(l.periodCount(count), style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
        ),
      ],
    );
  }
}

/// "Holiday: Gandhi Jayanti. No classes."
class HolidayCard extends StatelessWidget {
  const HolidayCard({super.key, required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Card(
      key: const Key('holidayCard'),
      margin: EdgeInsets.zero,
      color: c.tertiaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Row(
          children: [
            Icon(Icons.beach_access_outlined, color: c.onTertiaryContainer),
            const SizedBox(width: Kx.s16),
            Expanded(
              child: Text(context.l10n.holidayNoClasses(title), style: context.text.bodyLarge?.copyWith(color: c.onTertiaryContainer)),
            ),
          ],
        ),
      ),
    );
  }
}

class _PeriodCard extends StatelessWidget {
  const _PeriodCard({
    required this.period,
    required this.canTakeAttendance,
    required this.onAttendance,
    required this.onSyllabus,
    required this.onPlan,
    this.onTeach,
  });

  final Period period;
  final bool canTakeAttendance;
  final VoidCallback onAttendance;
  final VoidCallback onSyllabus;
  final VoidCallback onPlan;
  final VoidCallback? onTeach;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    final fmt = Fmt.of(context);
    final now = period.isNow;
    final onCard = now ? c.onPrimaryContainer : c.onSurface;
    final muted = now ? c.onPrimaryContainer : c.onSurfaceVariant;
    final where = [period.section.name, if (period.room != null) period.room!.name].join(' · ');

    final Widget attendance;
    if (period.attendanceTaken) {
      attendance = OutlinedButton.icon(
        onPressed: onAttendance,
        icon: Icon(Icons.check_circle, size: 18, color: c.primary),
        label: Text(l.attendanceTaken),
      );
    } else if (!canTakeAttendance) {
      attendance = Text(
        l.attendanceOpensOnDay,
        key: const Key('attendanceNotOpen'),
        style: context.text.bodySmall?.copyWith(color: muted),
      );
    } else if (now) {
      attendance = FilledButton.icon(
        key: Key('takeAttendance-${period.slotId}'),
        onPressed: onAttendance,
        icon: const Icon(Icons.fact_check_outlined, size: 18),
        label: Text(l.takeAttendance),
      );
    } else {
      attendance = FilledButton.tonalIcon(
        key: Key('takeAttendance-${period.slotId}'),
        onPressed: onAttendance,
        icon: const Icon(Icons.fact_check_outlined, size: 18),
        label: Text(l.takeAttendance),
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
                        fmt.clock(period.startsAt),
                        style: context.text.titleSmall?.copyWith(color: onCard, fontWeight: FontWeight.w500),
                      ),
                      Text(fmt.clock(period.endsAt), style: context.text.bodySmall?.copyWith(color: muted)),
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
                if (now) Pill(l.now, key: const Key('nowPill'), background: c.primary, foreground: c.onPrimary),
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
                  TextButton.icon(
                    key: Key('plan-${period.slotId}'),
                    onPressed: onPlan,
                    icon: Icon(period.lessonPlanned ? Icons.task_alt : Icons.edit_note, size: 18),
                    label: Text(period.lessonPlanned ? l.lessonPlanned : l.planLesson),
                  ),
                  TextButton.icon(
                    key: Key('syllabus-${period.slotId}'),
                    onPressed: onSyllabus,
                    icon: const Icon(Icons.menu_book_outlined, size: 18),
                    label: Text(l.syllabus),
                  ),
                  if (onTeach != null)
                    TextButton.icon(onPressed: onTeach, icon: const Icon(Icons.cast, size: 18), label: Text(l.teachOnBoard)),
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
