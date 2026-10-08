import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/hr_models.dart';
import '../../core/l10n.dart';
import '../../core/work_models.dart';
import '../../widgets/async_body.dart';
import '../../widgets/common.dart';

String riskText(AppLocalizations l, String level) => switch (level) {
  'high' => l.riskHigh,
  'medium' => l.riskMedium,
  'low' => l.riskLow,
  _ => l.riskNone,
};

String sessionModeText(AppLocalizations l, String mode) => switch (mode) {
  'phone' => l.sessionModePhone,
  'online' => l.sessionModeOnline,
  _ => l.sessionModeInPerson,
};

/// The signals behind a mentee's risk level, as short phrases.
List<String> menteeSignals(AppLocalizations l, MenteeInfo m) => [
  if (m.attendancePct != null) l.menteeAttendance('${m.attendancePct}'),
  if (m.failingMarks > 0) l.menteeFailing('${m.failingMarks}'),
  if (m.overdueFees > 0) l.menteeFees('${m.overdueFees}'),
  if (m.openCases > 0) l.menteeCases('${m.openCases}'),
];

/// My mentees, those who need attention first, each with the signals behind their risk flag.
class MentoringScreen extends StatelessWidget {
  const MentoringScreen({super.key, required this.api});

  final TeacherApi api;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    return Scaffold(
      appBar: AppBar(title: Text(l.mentoringTitle)),
      body: AsyncBody<List<MenteeInfo>>(
        load: api.myMentees,
        isEmpty: (rows) => rows.isEmpty,
        empty: l.menteesEmpty,
        builder: (context, rows, reload) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            for (final m in rows)
              ListTile(
                key: Key('mentee-${m.studentId}'),
                leading: Icon(Icons.flag_outlined, color: m.level == 'high' ? c.error : (m.level == 'none' ? null : c.tertiary)),
                title: Text('${m.studentName} · ${m.rollNo}'),
                subtitle: Text('${m.section}\n${[riskText(l, m.level), ...menteeSignals(l, m)].join(' · ')}'),
                isThreeLine: true,
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push<void>(MaterialPageRoute(builder: (_) => MenteeScreen(api: api, mentee: m))),
              ),
          ],
        ),
      ),
    );
  }
}

/// One mentee: sessions held, intervention plans, and logging a session or making a plan.
class MenteeScreen extends StatefulWidget {
  const MenteeScreen({super.key, required this.api, required this.mentee});

  final TeacherApi api;
  final MenteeInfo mentee;

  @override
  State<MenteeScreen> createState() => _MenteeScreenState();
}

class _MenteeScreenState extends State<MenteeScreen> {
  int _round = 0;

  Future<void> _push(Widget screen) async {
    final changed = await Navigator.of(context).push<bool>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => screen));
    if (changed == true && mounted) setState(() => _round++);
  }

  Future<void> _toggle(InterventionPlan p, int i) async {
    final actions = [for (var k = 0; k < p.actions.length; k++) k == i ? PlanAction(p.actions[k].text, !p.actions[k].done) : p.actions[k]];
    if (await runOrSnack(context, () => widget.api.updateInterventionPlan(p.id, actions)) && mounted) setState(() => _round++);
  }

  Future<void> _close(InterventionPlan p) async {
    final l = context.l10n;
    final outcome = TextEditingController();
    var rating = 'improved';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: Text(l.planClose),
          content: SingleChildScrollView(
            child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(key: const Key('planOutcome'), controller: outcome, maxLines: 3, decoration: InputDecoration(labelText: l.planOutcome)),
              const SizedBox(height: Kx.s12),
              Wrap(
                spacing: Kx.s8,
                children: [
                  for (final (code, label) in [('improved', l.planRatingImproved), ('no_change', l.planRatingNoChange), ('worsened', l.planRatingWorsened)])
                    ChoiceChip(key: Key('rating-$code'), label: Text(label), selected: rating == code, onSelected: (_) => setLocal(() => rating = code)),
                ],
              ),
            ],
          ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.cancel)),
            FilledButton(key: const Key('confirmClosePlan'), onPressed: () => Navigator.pop(ctx, outcome.text.trim().length >= 3), child: Text(l.planClose)),
          ],
        ),
      ),
    );
    final text = outcome.text.trim();
    if (ok == true && mounted && await runOrSnack(context, () => widget.api.closeInterventionPlan(p.id, outcome: text, rating: rating)) && mounted) {
      setState(() => _round++);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    final m = widget.mentee;
    return Scaffold(
      appBar: AppBar(title: Text(m.studentName)),
      body: AsyncBody<(List<MentoringSession>, List<InterventionPlan>)>(
        key: ValueKey(_round),
        load: () async => (await widget.api.mentoringSessions(m.studentId), await widget.api.interventionPlans(studentId: m.studentId)),
        builder: (context, data, reload) {
          final (sessions, plans) = data;
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(bottom: Kx.s32),
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
                child: Text([riskText(l, m.level), ...menteeSignals(l, m)].join(' · ')),
              ),
              Padding(
                padding: const EdgeInsets.all(Kx.s16),
                child: Wrap(
                  spacing: Kx.s8,
                  children: [
                    FilledButton.icon(key: const Key('logSession'), onPressed: () => _push(LogSessionScreen(api: widget.api, mentee: m)), icon: const Icon(Icons.edit_calendar_outlined), label: Text(l.mentorLogSession)),
                    OutlinedButton.icon(key: const Key('newPlan'), onPressed: () => _push(NewPlanScreen(api: widget.api, mentee: m)), icon: const Icon(Icons.add), label: Text(l.planNew)),
                  ],
                ),
              ),
              KxSectionHeader(l.mentorPlans),
              if (plans.isEmpty) Padding(padding: const EdgeInsets.symmetric(horizontal: Kx.s16), child: Text(l.plansNone, key: const Key('noPlans'))),
              for (final p in plans)
                Card(
                  key: Key('plan-${p.id}'),
                  margin: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s4),
                  child: Padding(
                    padding: const EdgeInsets.all(Kx.s12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(p.goal, style: context.text.titleSmall),
                        Text(p.closed ? l.planClosed : l.planReviewOn(f.shortDay(parseDay(p.reviewOn)))),
                        for (var i = 0; i < p.actions.length; i++)
                          CheckboxListTile(
                            key: Key('action-${p.id}-$i'),
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            value: p.actions[i].done,
                            title: Text(p.actions[i].text),
                            onChanged: p.closed ? null : (_) => _toggle(p, i),
                          ),
                        if (!p.closed) Align(alignment: Alignment.centerRight, child: TextButton(key: Key('closePlan-${p.id}'), onPressed: () => _close(p), child: Text(l.planClose))),
                      ],
                    ),
                  ),
                ),
              KxSectionHeader(l.mentorSessions),
              if (sessions.isEmpty) Padding(padding: const EdgeInsets.symmetric(horizontal: Kx.s16), child: Text(l.sessionsNone, key: const Key('noSessions'))),
              for (final s in sessions)
                ListTile(
                  key: Key('session-${s.id}'),
                  title: Text('${f.shortDay(parseDay(s.heldOn))} · ${sessionModeText(l, s.mode)}'),
                  subtitle: Text([s.summary, if (s.privateNotes != null) s.privateNotes!].join('\n')),
                  isThreeLine: s.privateNotes != null,
                ),
            ],
          );
        },
      ),
    );
  }
}

/// Logs a mentoring session held today (or on a day picked), with optional private notes and a follow-up date.
class LogSessionScreen extends StatefulWidget {
  const LogSessionScreen({super.key, required this.api, required this.mentee});

  final TeacherApi api;
  final MenteeInfo mentee;

  @override
  State<LogSessionScreen> createState() => _LogSessionScreenState();
}

class _LogSessionScreenState extends State<LogSessionScreen> {
  final _summary = TextEditingController();
  final _notes = TextEditingController();
  String _mode = 'in_person';
  DateTime? _followUp;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _summary.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _pickFollowUp() async {
    final now = DateTime.now();
    final d = await showDatePicker(context: context, initialDate: now.add(const Duration(days: 7)), firstDate: now, lastDate: now.add(const Duration(days: 365)));
    if (d != null) setState(() => _followUp = d);
  }

  Future<void> _save() async {
    final l = context.l10n;
    if (_summary.text.trim().isEmpty) {
      setState(() => _error = l.requestFieldNeeded(l.sessionSummary));
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final notes = _notes.text.trim();
      await widget.api.logMentoringSession(
        studentId: widget.mentee.studentId,
        heldOn: dayString(DateTime.now()),
        mode: _mode,
        summary: _summary.text.trim(),
        privateNotes: notes.isEmpty ? null : notes,
        followUpOn: _followUp == null ? null : dayString(_followUp!),
      );
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = l.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.mentorLogSession)),
      body: ListView(
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          Text(widget.mentee.studentName, style: context.text.titleMedium),
          DropdownButtonFormField<String>(
            key: const Key('sessionMode'),
            initialValue: _mode,
            decoration: InputDecoration(labelText: l.sessionModeLabel),
            items: [for (final m in const ['in_person', 'phone', 'online']) DropdownMenuItem(value: m, child: Text(sessionModeText(l, m)))],
            onChanged: (v) => setState(() => _mode = v!),
          ),
          TextField(key: const Key('sessionSummary'), controller: _summary, maxLines: 4, maxLength: 4000, decoration: InputDecoration(labelText: l.sessionSummary)),
          TextField(key: const Key('sessionNotes'), controller: _notes, maxLines: 3, decoration: InputDecoration(labelText: l.sessionNotes)),
          ListTile(
            key: const Key('pickFollowUp'),
            contentPadding: EdgeInsets.zero,
            title: Text(l.sessionFollowUp),
            trailing: Text(_followUp == null ? '—' : f.shortDay(_followUp!)),
            onTap: _pickFollowUp,
          ),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: ErrorBanner(_error!)),
          const SizedBox(height: Kx.s16),
          FilledButton(key: const Key('saveSession'), onPressed: _busy ? null : _save, child: Text(l.sessionSave)),
        ],
      ),
    );
  }
}

/// A new intervention plan: a goal, one action per line and a review date.
class NewPlanScreen extends StatefulWidget {
  const NewPlanScreen({super.key, required this.api, required this.mentee});

  final TeacherApi api;
  final MenteeInfo mentee;

  @override
  State<NewPlanScreen> createState() => _NewPlanScreenState();
}

class _NewPlanScreenState extends State<NewPlanScreen> {
  final _goal = TextEditingController();
  final _actions = TextEditingController();
  DateTime _review = DateUtils.dateOnly(DateTime.now().add(const Duration(days: 14)));
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _goal.dispose();
    _actions.dispose();
    super.dispose();
  }

  Future<void> _pickReview() async {
    final now = DateTime.now();
    final d = await showDatePicker(context: context, initialDate: _review, firstDate: now, lastDate: now.add(const Duration(days: 365)));
    if (d != null) setState(() => _review = d);
  }

  Future<void> _save() async {
    final l = context.l10n;
    final lines = [for (final a in _actions.text.split('\n')) if (a.trim().isNotEmpty) a.trim()];
    if (_goal.text.trim().length < 3) {
      setState(() => _error = l.requestFieldNeeded(l.planGoal));
      return;
    }
    if (lines.isEmpty) {
      setState(() => _error = l.requestFieldNeeded(l.planActionsLabel));
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.createInterventionPlan(studentId: widget.mentee.studentId, goal: _goal.text.trim(), actions: lines, reviewOn: dayString(_review));
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = l.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.planNew)),
      body: ListView(
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          Text(widget.mentee.studentName, style: context.text.titleMedium),
          TextField(key: const Key('planGoal'), controller: _goal, maxLines: 2, maxLength: 1000, decoration: InputDecoration(labelText: l.planGoal)),
          TextField(key: const Key('planActions'), controller: _actions, maxLines: 5, decoration: InputDecoration(labelText: l.planActionsLabel)),
          ListTile(key: const Key('pickReview'), contentPadding: EdgeInsets.zero, title: Text(l.planReviewLabel), trailing: Text(f.shortDay(_review)), onTap: _pickReview),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: ErrorBanner(_error!)),
          const SizedBox(height: Kx.s16),
          FilledButton(key: const Key('savePlan'), onPressed: _busy ? null : _save, child: Text(l.planCreate)),
        ],
      ),
    );
  }
}
