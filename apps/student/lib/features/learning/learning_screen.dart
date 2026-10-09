import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/learning.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

String _decision(AppLocalizations l, String d) => switch (d) {
  'promoted' => l.myLearningPromoted,
  'promoted_with_grace' => l.myLearningPromotedGrace,
  'compartment' => l.myLearningCompartment,
  _ => l.myLearningDetained,
};

String _band(AppLocalizations l, String b) => switch (b) {
  'on_track' => l.myLearningOnTrack,
  'close' => l.myLearningClose,
  'behind' => l.myLearningBehind,
  _ => l.myLearningNoTests,
};

String _trend(AppLocalizations l, String? t) => switch (t) {
  'up' => l.myLearningRising,
  'down' => l.myLearningFalling,
  'flat' => l.myLearningSteady,
  _ => '',
};

/// What to practise next, mastery by subject, worksheets and their scores, extra help, entrance readiness and the promotion decision.
class LearningScreen extends StatefulWidget {
  const LearningScreen({super.key, required this.api, required this.studentId});

  final StudentApi api;
  final String studentId;

  static Future<void> open(BuildContext context, StudentApi api, String studentId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => LearningScreen(api: api, studentId: studentId)));

  @override
  State<LearningScreen> createState() => _LearningScreenState();
}

class _LearningScreenState extends State<LearningScreen> {
  LearningSummary? _summary;
  LearningAdvice? _advice;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final s = await widget.api.learningSummary(widget.studentId);
      final a = await widget.api.learningAdvice(widget.studentId);
      if (mounted) {
        setState(() {
          _summary = s;
          _advice = a;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = _summary;
    final a = _advice;
    return Scaffold(
      appBar: AppBar(title: Text(l.myLearningTitle)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(Kx.s16),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (s == null && _error == null) const KxLoading(),
            if (s != null && a != null && s.isEmpty && a.practice.isEmpty && a.mastery.isEmpty) KxEmptyState(icon: Icons.school_outlined, message: l.myLearningNothing),
            if (s?.promotion != null)
              Card(
                key: const Key('learnPromotion'),
                child: ListTile(
                  leading: const Icon(Icons.trending_up),
                  title: Text(_decision(l, s!.promotion!.decision)),
                  subtitle: s.promotion!.reasons.isEmpty ? null : Text(s.promotion!.reasons.join('\n')),
                ),
              ),
            if (a != null && a.practice.isNotEmpty) ...[
              Text(l.myLearningPractice, style: context.text.titleMedium),
              for (final p in a.practice)
                ListTile(
                  key: Key('practice-${p.title}'),
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(p.kind == 'overdue' ? Icons.event_busy_outlined : Icons.fitness_center_outlined),
                  title: Text(p.title),
                  subtitle: Text(p.reason),
                ),
              const SizedBox(height: Kx.s16),
            ],
            if (a != null && a.mastery.isNotEmpty) ...[
              Text(l.myLearningMastery, style: context.text.titleMedium),
              for (final m in a.mastery)
                ListTile(
                  key: Key('mastery-${m.subject}'),
                  contentPadding: EdgeInsets.zero,
                  title: Text(m.subject),
                  subtitle: LinearProgressIndicator(value: m.percent / 100),
                  trailing: Text('${m.percent}%'),
                ),
              const SizedBox(height: Kx.s16),
            ],
            if (s != null && s.worksheets.isNotEmpty) ...[
              Text(l.myLearningWorksheets, style: context.text.titleMedium),
              for (final w in s.worksheets)
                ListTile(
                  key: Key('worksheet-${w.id}'),
                  contentPadding: EdgeInsets.zero,
                  title: Text(w.title),
                  subtitle: Text([w.subjectName, if (w.dueOn != null) l.dueOn(w.dueOn!), if (w.remarks.isNotEmpty) w.remarks].join(' · ')),
                  trailing: Text(
                    w.level ?? (w.score != null ? l.myLearningScore(_fmt(w.score!), _fmt(w.maxScore)) : l.myLearningNotScored),
                    style: context.text.titleSmall,
                  ),
                ),
              const SizedBox(height: Kx.s16),
            ],
            if (s != null && s.help.isNotEmpty) ...[
              Text(l.myLearningHelp, style: context.text.titleMedium),
              for (final h in s.help)
                ListTile(
                  key: Key('help-${h.id}'),
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.support_agent_outlined),
                  title: Text(h.subjectName),
                  subtitle: Text([h.plan, if (h.dueOn != null) l.dueOn(h.dueOn!)].join('\n')),
                ),
              const SizedBox(height: Kx.s16),
            ],
            if (s != null && s.readiness.isNotEmpty) ...[
              Text(l.myLearningReadiness, style: context.text.titleMedium),
              for (final r in s.readiness)
                Card(
                  key: Key('readiness-${r.exam}'),
                  child: Padding(
                    padding: const EdgeInsets.all(Kx.s16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(r.exam, style: context.text.titleMedium),
                        Text('${_band(l, r.band)}${_trend(l, r.trend).isEmpty ? '' : ' · ${_trend(l, r.trend)}'}'),
                        Text(l.myLearningTarget(_fmt(r.targetPct))),
                        if (r.averagePct != null) Text(l.myLearningAverage(_fmt(r.averagePct!), r.tests)),
                        if (r.weakSubjects.isNotEmpty) Text(l.myLearningWeak(r.weakSubjects.join(', '))),
                      ],
                    ),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

String _fmt(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1);
