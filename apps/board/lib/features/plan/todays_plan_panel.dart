import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/board_controller.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../ai/ai_widgets.dart';
import '../board/side_panel.dart';
import 'plan_timer.dart';

const planAccent = Color(0xFF81C995);

/// Today's plan: the lesson plan the teacher saved in the Teacher App for the period open on
/// the board. Read-only: objectives, timed steps (with a step timer that highlights the current
/// step), materials, how to check understanding and homework. Its topics open in Books, where
/// they can be marked as taught. The step timer is [timer], which outlives the panel.
class TodaysPlanPanel extends StatefulWidget {
  const TodaysPlanPanel({super.key, required this.board, required this.timer, required this.onOpenTopic});

  final BoardController board;
  final PlanTimer timer;

  /// Opens a topic in Books.
  final ValueChanged<String> onOpenTopic;

  @override
  State<TodaysPlanPanel> createState() => _TodaysPlanPanelState();
}

class _TodaysPlanPanelState extends State<TodaysPlanPanel> {
  Future<PeriodLessonPlan?>? _plan;
  String? _sessionId;

  PlanTimer get _timer => widget.timer;

  @override
  void initState() {
    super.initState();
    widget.board.addListener(_onBoard);
    _timer.addListener(_onTimer);
    _onBoard();
  }

  @override
  void dispose() {
    widget.board.removeListener(_onBoard);
    _timer.removeListener(_onTimer);
    super.dispose();
  }

  void _onTimer() => setState(() {});

  /// A different class (or none) means a different plan.
  void _onBoard() {
    final id = widget.board.session?.sessionId;
    if (id == _sessionId && _plan != null) return;
    _sessionId = id;
    final plan = id == null || widget.board.api == null ? null : widget.board.api!.currentLessonPlan();
    setState(() {
      _plan = plan;
    });
  }

  void _reload() {
    final plan = widget.board.api!.currentLessonPlan();
    setState(() {
      _plan = plan;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return PanelPage(
      icon: Icons.event_note_outlined,
      title: l.toolTodaysPlan,
      accent: planAccent,
      child: Column(
        children: [
          // The paired teacher's online classes (Zoom, Google Meet, Teams): the join link opens on the board's browser.
          if (widget.board.api != null)
            OnlineClassesSection(
              key: const Key('board-online-classes'),
              load: () => OnlineApi(baseUrl: widget.board.api!.baseUrl, token: widget.board.api!.sessionToken ?? widget.board.api!.deviceToken).classes(board: true),
              onJoin: (c) => launchUrl(Uri.parse(c.joinUrl), mode: LaunchMode.externalApplication),
              onCopy: (c) {
                Clipboard.setData(ClipboardData(text: c.joinUrl));
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(OnlineStrings(context).copied)));
              },
            ),
          Expanded(child: _body(context)),
        ],
      ),
    );
  }

  Widget _notice(Widget child) => Padding(
    padding: const EdgeInsets.all(Kx.s24),
    child: Align(alignment: Alignment.topCenter, child: child),
  );

  Widget _body(BuildContext context) {
    final l = context.l10n;
    final future = _plan;
    if (future == null) {
      return _notice(AiNotice(key: const Key('plan-signin'), icon: Icons.lock_outline, message: l.planSignIn));
    }
    return FutureBuilder<PeriodLessonPlan?>(
      future: future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) return AiLoading(label: l.planOpening);
        if (snap.hasError) return _notice(AiError(message: l.planCouldNotOpen, onRetry: _reload));
        final period = snap.data;
        if (period == null) {
          return _notice(AiNotice(key: const Key('plan-no-class'), icon: Icons.event_busy_outlined, message: l.planNoClass));
        }
        final plan = period.plan;
        if (plan == null) {
          return KxEmptyState(key: const Key('plan-none'), icon: Icons.edit_note, message: l.planNone);
        }
        _timer.show(period.period, [for (final s in plan.content.steps) s.minutes]);
        return _planView(context, period, plan);
      },
    );
  }

  Widget _planView(BuildContext context, PeriodLessonPlan period, SavedLessonPlan plan) {
    final l = context.l10n;
    final c = context.colors;
    final p = plan.content;
    final total = p.steps.fold(0, (s, x) => s + x.minutes);
    const body = TextStyle(fontSize: ClassType.body, height: 1.4);
    Widget bullet(IconData icon, String text) => Padding(
      padding: const EdgeInsets.only(bottom: Kx.s8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(padding: const EdgeInsets.only(top: 3), child: Icon(icon, size: 20, color: planAccent)),
          const SizedBox(width: Kx.s12),
          Expanded(child: Text(text, style: body)),
        ],
      ),
    );

    final running = _timer.running;
    final step = _timer.step;
    final done = _timer.done;
    return ListView(
      key: const Key('plan-view'),
      padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s8, Kx.s24, Kx.s24),
      children: [
        Text(period.subjectName, style: context.text.titleLarge),
        if (plan.aiDrafted)
          Padding(
            padding: const EdgeInsets.only(top: Kx.s4),
            child: Text(l.planAiDrafted, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
          ),
        if (plan.topics.isNotEmpty) ...[
          AiSectionLabel(l.planTopics),
          Wrap(
            spacing: Kx.s8,
            runSpacing: Kx.s8,
            children: [
              for (final t in plan.topics)
                ActionChip(
                  key: Key('plan-topic-${t.id}'),
                  avatar: const Icon(Icons.menu_book_outlined, size: 18),
                  label: Text(t.title, style: const TextStyle(fontSize: 16)),
                  tooltip: l.planOpenInBooks,
                  onPressed: () => widget.onOpenTopic(t.id),
                ),
            ],
          ),
        ],
        if (p.objectives.isNotEmpty) ...[
          AiSectionLabel(l.lessonObjectives),
          for (final o in p.objectives) bullet(Icons.flag_outlined, o),
        ],
        if (p.steps.isNotEmpty) ...[
          AiSectionLabel(period.minutes > 0 ? l.planStepsOf(total, period.minutes) : l.lessonSteps(total)),
          Wrap(
            spacing: Kx.s8,
            runSpacing: Kx.s8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              FilledButton.tonalIcon(
                key: const Key('plan-timer'),
                onPressed: _timer.toggle,
                icon: Icon(running ? Icons.pause : Icons.play_arrow),
                label: Text(running ? l.pause : (step == null || done ? l.planStartTimer : l.planResumeTimer)),
              ),
              if (step != null && !done)
                OutlinedButton.icon(
                  key: const Key('plan-next'),
                  onPressed: _timer.next,
                  icon: const Icon(Icons.skip_next),
                  label: Text(l.planNextStep),
                ),
              if (done) Text(l.planAllStepsDone, key: const Key('plan-done'), style: context.text.titleSmall),
            ],
          ),
          const SizedBox(height: Kx.s12),
          for (var i = 0; i < p.steps.length; i++) _stepRow(context, p.steps, i),
        ],
        if (p.materials.isNotEmpty) ...[
          AiSectionLabel(l.lessonMaterials),
          Wrap(
            spacing: Kx.s8,
            runSpacing: Kx.s8,
            children: [
              for (final m in p.materials)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: Kx.s12, vertical: 6),
                  decoration: BoxDecoration(border: Border.all(color: c.outlineVariant), borderRadius: BorderRadius.circular(Kx.rSm)),
                  child: Text(m, style: const TextStyle(fontSize: 16)),
                ),
            ],
          ),
        ],
        if (p.assessment.trim().isNotEmpty) ...[AiSectionLabel(l.lessonCheck), Text(p.assessment, style: body)],
        if (plan.homework.trim().isNotEmpty) ...[AiSectionLabel(l.planHomework), bullet(Icons.assignment_outlined, plan.homework)],
      ],
    );
  }

  Widget _stepRow(BuildContext context, List<LessonStep> steps, int i) {
    final c = context.colors;
    final l = context.l10n;
    final s = steps[i];
    final current = _timer.step == i;
    final left = Duration(minutes: s.minutes) - _timer.elapsed;
    final mm = left.inMinutes.toString().padLeft(2, '0');
    final ss = (left.inSeconds % 60).toString().padLeft(2, '0');
    return Padding(
      key: Key('plan-step-$i'),
      padding: const EdgeInsets.only(bottom: Kx.s8),
      child: Material(
        color: current ? planAccent.withValues(alpha: 0.18) : Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Kx.rMd),
          side: BorderSide(color: current ? planAccent : Colors.transparent, width: 2),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(Kx.rMd),
          onTap: () => _timer.jump(i),
          child: Padding(
            padding: const EdgeInsets.all(Kx.s12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  constraints: const BoxConstraints(minWidth: 72),
                  padding: const EdgeInsets.symmetric(horizontal: Kx.s8, vertical: Kx.s4),
                  decoration: BoxDecoration(
                    color: current ? planAccent : c.secondaryContainer,
                    borderRadius: BorderRadius.circular(Kx.rSm),
                  ),
                  child: Text(
                    current ? '$mm:$ss' : l.minutesShort(s.minutes),
                    key: current ? const Key('plan-step-left') : null,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: current ? Colors.black : c.onSecondaryContainer,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ),
                const SizedBox(width: Kx.s12),
                Expanded(
                  child: Text(
                    s.activity,
                    style: TextStyle(fontSize: ClassType.body, height: 1.4, fontWeight: current ? FontWeight.w600 : null),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
