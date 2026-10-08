import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/hr_models.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';
import '../attendance/attendance_screen.dart';
import '../board/connect_screen.dart';
import '../hr/leave_screen.dart';
import '../plans/lesson_plan_screen.dart';
import '../remote/remote_screen.dart';
import '../syllabus/syllabus_screen.dart';
import '../today/today_controller.dart';

/// Home: the greeting, today's classes with one tap to start, the quick actions a teacher reaches
/// for between periods, and leave requests waiting for a decision (for heads and principals).
class TeacherHomeTab extends StatefulWidget {
  const TeacherHomeTab({
    super.key,
    required this.controller,
    required this.me,
    required this.photo,
    required this.onOpenProfile,
    required this.onOpenClasses,
    required this.onAssign,
    required this.onNewAssessment,
  });

  final TodayController controller;
  final Me me;
  final ImageProvider? photo;
  final VoidCallback onOpenProfile;

  /// Switches to the Classes tab (the full timetable).
  final VoidCallback onOpenClasses;
  final VoidCallback onAssign;
  final VoidCallback onNewAssessment;

  @override
  State<TeacherHomeTab> createState() => _TeacherHomeTabState();
}

class _TeacherHomeTabState extends State<TeacherHomeTab> {
  List<LeaveRequestInfo>? _pending;
  ApiException? _pendingError;

  TodayController get today => widget.controller;
  TeacherApi get api => today.api;
  bool get _approver => widget.me.roles.any(leaveApproverRoles.contains);

  @override
  void initState() {
    super.initState();
    if (_approver) _loadPending();
  }

  Future<void> _loadPending() async {
    setState(() => _pendingError = null);
    try {
      final p = await api.pendingLeaveRequests();
      if (mounted) setState(() => _pending = p);
    } on ApiException catch (e) {
      if (mounted) setState(() => _pendingError = e);
    }
  }

  Future<void> _refresh() => Future.wait([today.reload(), if (_approver) _loadPending()]);

  Future<void> _start(BuildContext context) async {
    final navigator = Navigator.of(context);
    final connection = today.connection;
    if (connection != null) {
      await navigator.push(MaterialPageRoute<void>(builder: (_) => RemoteScreen(api: api, connection: connection)));
    } else {
      final result = await navigator.push<BoardConnection?>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => ConnectScreen(api: api)));
      if (result != null) today.connected(result);
    }
    await today.refreshConnection();
  }

  /// The period to act on: the one running now, else the next one that has not started.
  Period? _current(List<Period> periods) => periods.where((p) => p.isNow).firstOrNull ?? periods.where((p) => !p.attendanceTaken).firstOrNull ?? periods.firstOrNull;

  Future<void> _attendance(BuildContext context, List<Period> periods) async {
    final p = _current(periods.where((p) => !p.attendanceTaken).toList()) ?? _current(periods);
    if (p == null || today.day == null) return widget.onOpenClasses();
    final taken = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => AttendanceScreen(api: api, period: p, date: today.day!.date)));
    if (taken == true) today.markTaken(p.slotId);
  }

  Future<void> _aiPlan(BuildContext context, List<Period> periods) async {
    if (periods.isEmpty || today.day == null) return widget.onOpenClasses();
    final p = _current(periods)!;
    await Navigator.of(context).push<void>(
      MaterialPageRoute(builder: (_) => LessonPlanScreen(api: api, period: p, date: today.day!.date, onSaved: () => today.markPlanned(p.slotId))),
    );
  }

  Future<void> _decide(LeaveRequestInfo r, bool approve) async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await api.decideLeave(r.id, approve: approve);
      if (!mounted) return;
      setState(() => _pending = _pending?.where((x) => x.id != r.id).toList());
      messenger.showSnackBar(SnackBar(content: Text(approve ? l.leaveStatusApproved : l.leaveStatusRejected)));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(l.errorText(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final fmt = Fmt.of(context);
    return ListenableBuilder(
      listenable: today,
      builder: (context, _) {
        final day = today.day;
        final periods = today.showingNextDay ? const <Period>[] : (day?.periods ?? const <Period>[]);
        return RefreshIndicator(
          onRefresh: _refresh,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverSafeArea(
                bottom: false,
                sliver: SliverToBoxAdapter(
                  child: KxHomeHeader(
                    greeting: fmt.greeting(DateTime.now(), widget.me.firstName),
                    subtitle: l.homeSubtitle,
                    trailing: [ProfileButton(name: widget.me.fullName, image: widget.photo, onPressed: widget.onOpenProfile)],
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s24),
                sliver: SliverList.list(
                  children: [
                    _SectionTitle(l.todaysClasses, action: l.viewAll, onAction: widget.onOpenClasses),
                    if (today.error != null) ErrorBanner.api(today.error!, onRetry: today.reload),
                    if (day == null && today.error == null)
                      const KxLoading()
                    else if (day != null && periods.isEmpty)
                      KxCard(
                        child: Text(day.holiday != null ? l.holidayNoClasses(day.holiday!) : l.noClassesToday, key: const Key('noClassesToday'), style: context.text.bodyLarge),
                      )
                    else
                      KxCard(
                        padding: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s4),
                        child: Column(
                          children: [
                            for (var i = 0; i < periods.length && i < 4; i++) ...[
                              if (i > 0) Divider(height: 1, color: context.colors.outlineVariant),
                              _ClassRow(period: periods[i], onStart: () => _start(context), connected: today.connection != null),
                            ],
                          ],
                        ),
                      ),
                    _SectionTitle(l.quickActions),
                    KxCard(
                      padding: const EdgeInsets.symmetric(horizontal: Kx.s8, vertical: Kx.s8),
                      child: KxActionGrid(
                        children: [
                          KxActionTile(key: const Key('qaAttendance'), icon: Icons.fact_check_outlined, label: l.qaAttendance, onTap: () => _attendance(context, periods)),
                          KxActionTile(key: const Key('qaAssignment'), icon: Icons.assignment_outlined, label: l.qaAssignment, onTap: widget.onAssign),
                          KxActionTile(key: const Key('qaQuiz'), icon: Icons.quiz_outlined, label: l.qaQuiz, onTap: widget.onNewAssessment, tone: KxTone.success),
                          KxActionTile(key: const Key('qaSmartboard'), icon: Icons.cast_for_education_outlined, label: l.qaSmartboard, onTap: () => _start(context)),
                          KxActionTile(
                            key: const Key('qaStudyMaterial'),
                            icon: Icons.menu_book_outlined,
                            label: l.qaStudyMaterial,
                            tone: KxTone.warning,
                            onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => SyllabusClassesScreen(api: api, teacherName: widget.me.fullName))),
                          ),
                          KxActionTile(key: const Key('qaAi'), icon: Icons.auto_awesome, label: l.qaAiAssistant, spark: true, onTap: () => _aiPlan(context, periods)),
                        ],
                      ),
                    ),
                    if (_approver) ...[
                      _SectionTitle(l.pendingApprovals, action: l.viewAll, onAction: () => _openLeave(context)),
                      if (_pendingError != null) ErrorBanner.api(_pendingError!, onRetry: _loadPending),
                      if (_pending == null && _pendingError == null)
                        const KxLoading()
                      else if (_pending != null && _pending!.isEmpty)
                        KxCard(child: Text(l.allCaughtUp, style: context.text.bodyLarge))
                      else if (_pending != null)
                        KxCard(
                          padding: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s4),
                          child: Column(
                            children: [
                              for (var i = 0; i < _pending!.length && i < 3; i++) ...[
                                if (i > 0) Divider(height: 1, color: context.colors.outlineVariant),
                                _LeaveRow(request: _pending![i], onDecide: (approve) => _decide(_pending![i], approve)),
                              ],
                            ],
                          ),
                        ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _openLeave(BuildContext context) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => LeaveScreen(api: api, canApprove: _approver)));
    if (mounted) _loadPending();
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.title, {this.action, this.onAction});

  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: Kx.s16, bottom: Kx.s8),
    child: Row(
      children: [
        Expanded(child: Text(title, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w600))),
        if (action != null) TextButton(onPressed: onAction, child: Text(action!)),
      ],
    ),
  );
}

class _ClassRow extends StatelessWidget {
  const _ClassRow({required this.period, required this.onStart, required this.connected});

  final Period period;
  final VoidCallback onStart;
  final bool connected;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    final fmt = Fmt.of(context);
    final where = [period.section.name, if (period.room != null) period.room!.name].join(' · ');
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 72),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: Kx.s8),
        child: Row(
          children: [
            Container(width: 4, height: 52, decoration: BoxDecoration(color: period.isNow ? c.primary : c.outlineVariant, borderRadius: Kx.radiusSm)),
            const SizedBox(width: Kx.s12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(fmt.clock(period.startsAt), style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant)),
                  Text(period.subject.name, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600), maxLines: 2, overflow: TextOverflow.ellipsis),
                  Text(where, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant), maxLines: 2, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            const SizedBox(width: Kx.s8),
            if (period.isNow)
              FilledButton(
                key: Key('startClass-${period.slotId}'),
                onPressed: onStart,
                style: FilledButton.styleFrom(minimumSize: const Size(Kx.target, Kx.target)),
                child: Text(connected ? l.connected : l.startClass),
              )
            else if (period.attendanceTaken)
              Icon(Icons.check_circle, color: c.primary, semanticLabel: l.attendanceTaken)
            else
              TextButton(key: Key('startClass-${period.slotId}'), onPressed: onStart, style: TextButton.styleFrom(minimumSize: const Size(Kx.target, Kx.target)), child: Text(l.startClass)),
          ],
        ),
      ),
    );
  }
}

class _LeaveRow extends StatelessWidget {
  const _LeaveRow({required this.request, required this.onDecide});

  final LeaveRequestInfo request;
  final void Function(bool approve) onDecide;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final fmt = Fmt.of(context);
    final days = request.days == request.days.roundToDouble() ? '${request.days.round()}' : '${request.days}';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Kx.s8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(request.userName, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
          Text(
            '${l.leaveRequestLine(request.type.name, days)} · ${fmt.shortDay(request.fromDate)}',
            style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
          ),
          const SizedBox(height: Kx.s8),
          Row(
            children: [
              Expanded(
                child: FilledButton(
                  key: Key('homeApprove-${request.id}'),
                  onPressed: () => onDecide(true),
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)),
                  child: Text(l.leaveApprove),
                ),
              ),
              const SizedBox(width: Kx.s8),
              Expanded(
                child: OutlinedButton(
                  key: Key('homeReject-${request.id}'),
                  onPressed: () => onDecide(false),
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)),
                  child: Text(l.leaveReject),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
