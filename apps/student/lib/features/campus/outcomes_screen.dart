import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/campus_life.dart';
import '../../core/outcomes.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'surveys_screen.dart';

/// My course outcomes: for each course this year, how far I have reached each CO from internal and end-semester
/// marks, against the threshold the college set. Open course exit surveys are offered at the top, as they feed the
/// same outcomes.
class OutcomesScreen extends StatefulWidget {
  const OutcomesScreen({super.key, required this.api});

  final StudentApi api;

  static Future<void> open(BuildContext context, StudentApi api) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => OutcomesScreen(api: api)));

  @override
  State<OutcomesScreen> createState() => _OutcomesScreenState();
}

class _OutcomesScreenState extends State<OutcomesScreen> {
  MyOutcomes? _data;
  List<MySurvey> _exitSurveys = const [];
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final d = await widget.api.myOutcomes();
      var exits = const <MySurvey>[];
      try {
        exits = [
          for (final s in await widget.api.mySurveys())
            if (s.isExitSurvey && !s.answered) s,
        ];
      } on ApiException {
        // The surveys are a nudge; the outcomes still read without them.
      }
      if (mounted) {
        setState(() {
          _data = d;
          _exitSurveys = exits;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final d = _data;
    return Scaffold(
      appBar: AppBar(title: Text(l.outcomesTitle)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s24),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (d == null && _error == null) const KxLoading(),
            if (_exitSurveys.isNotEmpty) ...[
              KxCard(
                key: const Key('exitSurveyNudge'),
                onTap: () async {
                  await SurveysScreen.open(context, widget.api);
                  await _load();
                },
                child: Row(
                  children: [
                    const KxIconBox(Icons.rate_review_outlined, tone: KxTone.spark),
                    const SizedBox(width: Kx.s12),
                    Expanded(child: Text(l.outcomesExitSurveys(_exitSurveys.length), style: context.text.bodyMedium)),
                    const Icon(Icons.chevron_right),
                  ],
                ),
              ),
              const SizedBox(height: Kx.s12),
            ],
            if (d != null && d.courses.isEmpty) KxEmptyState(icon: Icons.track_changes_outlined, message: l.outcomesNone),
            if (d != null) ...[
              if (d.courses.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: Kx.s8),
                  child: Text(l.outcomesIntro, style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
                ),
              for (final c in d.courses) ...[_CourseCard(course: c), const SizedBox(height: Kx.s12)],
            ],
          ],
        ),
      ),
    );
  }
}

class _CourseCard extends StatelessWidget {
  const _CourseCard({required this.course});

  final MyCourseOutcomes course;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = course;
    return KxCard(
      key: Key('outcomeCourse-${c.subjectId}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${c.code} ${c.name}', style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: Kx.s4),
          Text(
            c.measured == 0 ? l.outcomesNotYet : l.outcomesSummary(c.attained, c.measured, pctText(c.threshold)),
            key: Key('outcomeSummary-${c.subjectId}'),
            style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant),
          ),
          for (final co in c.cos) ...[const SizedBox(height: Kx.s12), _CoRow(co: co, threshold: c.threshold)],
        ],
      ),
    );
  }
}

class _CoRow extends StatelessWidget {
  const _CoRow({required this.co, required this.threshold});

  final MyCo co;
  final double threshold;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final (tone, label) = switch (co.attained) {
      true => (KxTone.success, l.outcomesAttained),
      false => (KxTone.warning, l.outcomesBelow),
      null => (KxTone.neutral, l.outcomesPending),
    };
    final t = kxTone(context, tone);
    String pct(double? v) => v == null ? '–' : '${pctText(v)}%';
    return Column(
      key: Key('outcomeCo-${co.coId}'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 44,
              child: Text(co.code, style: context.text.labelLarge?.copyWith(fontWeight: FontWeight.w600)),
            ),
            Expanded(child: Text(co.statement, style: context.text.bodyMedium)),
            const SizedBox(width: Kx.s8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: Kx.s8, vertical: 2),
              decoration: BoxDecoration(color: t.bg, borderRadius: BorderRadius.circular(999)),
              child: Text(label, style: context.text.labelSmall?.copyWith(color: t.fg)),
            ),
          ],
        ),
        const SizedBox(height: Kx.s4),
        Padding(
          padding: const EdgeInsets.only(left: 44),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              KxProgressBar(value: (co.overall ?? 0) / 100, label: pct(co.overall), tone: tone),
              const SizedBox(height: 2),
              Text(
                l.outcomesDetail(
                  pct(co.cie),
                  pct(co.see),
                  co.classLevel == null ? '–' : co.classLevel!.toStringAsFixed(2),
                  co.target.toStringAsFixed(co.target == co.target.roundToDouble() ? 0 : 1),
                ),
                style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
