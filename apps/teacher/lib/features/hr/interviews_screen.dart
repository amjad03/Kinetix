import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/desk_models.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../widgets/async_body.dart';
import '../../widgets/common.dart';

String criterionName(AppLocalizations l, String c) => switch (c) {
  'subject_knowledge' => l.ivSubjectKnowledge,
  'teaching_ability' => l.ivTeachingAbility,
  'communication' => l.ivCommunication,
  'research' => l.ivResearch,
  'attitude' => l.ivAttitude,
  _ => c,
};

String recommendationName(AppLocalizations l, String r) => switch (r) {
  'select' => l.ivSelect,
  'reject' => l.ivReject,
  _ => l.ivHold,
};

/// Interviews where the teacher sits on the hiring panel: coming up and done, with their own scores.
class InterviewsScreen extends StatefulWidget {
  const InterviewsScreen({super.key, required this.api, required this.userId, this.today});

  final TeacherApi api;

  /// The signed-in teacher, to find their own scores.
  final String userId;
  final DateTime? today;

  @override
  State<InterviewsScreen> createState() => _InterviewsScreenState();
}

class _InterviewsScreenState extends State<InterviewsScreen> {
  var _version = 0;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    final today = DateUtils.dateOnly(widget.today ?? DateTime.now());
    return Scaffold(
      appBar: AppBar(title: Text(l.ivTitle)),
      body: AsyncBody<List<PanelInterview>>(
        key: ValueKey('interviews-$_version'),
        load: widget.api.myInterviews,
        isEmpty: (rows) => rows.isEmpty,
        empty: l.ivEmpty,
        builder: (context, rows, reload) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(Kx.s16),
          children: [
            for (final i in rows)
              Card(
                key: Key('interview-${i.id}'),
                child: ListTile(
                  leading: Icon(i.scoredByMe ? Icons.task_alt : Icons.person_search_outlined, color: i.scoredByMe ? context.colors.primary : null),
                  title: Text(i.applicant),
                  subtitle: Text([i.opening, l.ivRound(i.round), '${f.shortDay(i.scheduledAt)} ${f.time(i.scheduledAt)}', if (i.venue.isNotEmpty) i.venue].join(' · ')),
                  trailing: Text(
                    i.status == 'cancelled' ? l.ivCancelled : (i.scoredByMe ? l.ivScored : (DateUtils.dateOnly(i.scheduledAt).isAfter(today) ? l.ivUpcoming : l.ivToScore)),
                    style: context.text.labelLarge?.copyWith(color: !i.scoredByMe && i.status == 'scheduled' && !DateUtils.dateOnly(i.scheduledAt).isAfter(today) ? context.colors.error : null),
                  ),
                  onTap: i.status == 'cancelled'
                      ? null
                      : () async {
                          final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => ScoreInterviewScreen(api: widget.api, interview: i, userId: widget.userId, today: today)));
                          if (saved == true) setState(() => _version++);
                        },
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Scoring one interview: 0 to 10 for each criterion, a recommendation and remarks. Scores can be
/// given (and corrected) on the day, until the whole panel has scored.
class ScoreInterviewScreen extends StatefulWidget {
  const ScoreInterviewScreen({super.key, required this.api, required this.interview, required this.userId, required this.today});

  final TeacherApi api;
  final PanelInterview interview;
  final String userId;
  final DateTime today;

  @override
  State<ScoreInterviewScreen> createState() => _ScoreInterviewScreenState();
}

class _ScoreInterviewScreenState extends State<ScoreInterviewScreen> {
  InterviewScores? _data;
  ApiException? _error;
  final _scores = <String, double>{};
  String _recommendation = 'hold';
  final _remarks = TextEditingController();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _remarks.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final d = await widget.api.interviewScores(widget.interview.id);
      if (!mounted) return;
      final mine = d.scores.where((s) => s.panelistId == widget.userId).firstOrNull;
      setState(() {
        _data = d;
        for (final c in d.criteria) {
          _scores[c] = mine?.scores[c] ?? 5;
        }
        if (mine != null) {
          _recommendation = mine.recommendation;
          _remarks.text = mine.remarks;
        }
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  double get _total => _scores.isEmpty ? 0 : _scores.values.fold<double>(0, (a, b) => a + b) / (_scores.length * 10) * 100;

  Future<void> _save() async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    final ok = await runOrSnack(context, () => widget.api.scoreInterview(widget.interview.id, scores: Map.of(_scores), recommendation: _recommendation, remarks: _remarks.text.trim()));
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) {
      messenger.showSnackBar(SnackBar(content: Text(l.ivSaved)));
      Navigator.of(context).pop(true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final i = widget.interview;
    final d = _data;
    final early = DateUtils.dateOnly(i.scheduledAt).isAfter(widget.today);
    final open = i.status == 'scheduled' && !early;
    return Scaffold(
      appBar: AppBar(title: Text(i.applicant)),
      body: d == null
          ? (_error == null ? const Center(child: CircularProgressIndicator()) : ListView(padding: const EdgeInsets.all(Kx.s16), children: [ErrorBanner.api(_error!, onRetry: _load)]))
          : ListView(
              padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
              children: [
                Text('${i.opening} · ${l.ivRound(i.round)}', style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                if (early) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(l.ivOnTheDay, key: const Key('ivEarly'), style: context.text.bodyMedium?.copyWith(color: c.error))),
                if (i.status == 'completed') Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(l.ivClosed, style: context.text.bodyMedium)),
                const SizedBox(height: Kx.s8),
                for (final crit in d.criteria) ...[
                  Row(
                    children: [
                      Expanded(child: Text(criterionName(l, crit), style: context.text.titleSmall)),
                      Text(_score(_scores[crit] ?? 0), key: Key('score-$crit'), style: context.text.titleMedium),
                    ],
                  ),
                  Slider(
                    key: Key('slider-$crit'),
                    value: _scores[crit] ?? 0,
                    min: 0,
                    max: 10,
                    divisions: 20,
                    label: _score(_scores[crit] ?? 0),
                    onChanged: open ? (v) => setState(() => _scores[crit] = v) : null,
                  ),
                ],
                Text(l.ivTotal(_total.toStringAsFixed(0)), key: const Key('ivTotal'), style: context.text.titleMedium?.copyWith(color: c.primary)),
                const SizedBox(height: Kx.s12),
                SegmentedButton<String>(
                  segments: [
                    ButtonSegment(value: 'select', label: Text(l.ivSelect)),
                    ButtonSegment(value: 'hold', label: Text(l.ivHold)),
                    ButtonSegment(value: 'reject', label: Text(l.ivReject)),
                  ],
                  selected: {_recommendation},
                  onSelectionChanged: open ? (s) => setState(() => _recommendation = s.first) : null,
                ),
                TextField(key: const Key('ivRemarks'), controller: _remarks, enabled: open, maxLength: 1000, maxLines: 3, decoration: InputDecoration(labelText: l.ivRemarks)),
                if (open) FilledButton(key: const Key('ivSave'), onPressed: _busy ? null : _save, child: Text(l.ivSaveScores)),
                KxSectionHeader(l.ivPanel),
                for (final p in d.panel)
                  ListTile(
                    key: Key('panelist-${p.id}'),
                    dense: true,
                    leading: Icon(p.scored ? Icons.check_circle : Icons.radio_button_unchecked, color: p.scored ? c.primary : c.onSurfaceVariant),
                    title: Text(p.fullName),
                    trailing: Text(p.scored ? l.ivScored : l.ivNotYet),
                  ),
                if (d.average != null) Text(l.ivAverage(d.average!.toStringAsFixed(1)), style: context.text.bodyMedium),
              ],
            ),
    );
  }
}

/// "7", "7.5".
String _score(double v) => v == v.roundToDouble() ? v.round().toString() : v.toStringAsFixed(1);
