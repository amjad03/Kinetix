import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/study.dart';
import '../../widgets/common.dart';

/// "Above the class average" (green), "Around the class average" or "Below the class average" (amber).
(String, Color, Color)? _comparison(BuildContext context, AssessmentResult a) {
  final c = context.colors;
  if (a.absent) return ('Absent', c.errorContainer, c.onErrorContainer);
  return switch (a.vsAverage) {
    1 => ('Above class average', Tone.goodContainer(context), Tone.good(context)),
    0 => ('At class average', c.secondaryContainer, c.onSecondaryContainer),
    -1 => ('Below class average', Tone.warnContainer(context), Tone.warn(context)),
    _ => null,
  };
}

/// "19 / 25", "Absent" or "Not entered".
String scoreLine(AssessmentResult a) {
  if (a.absent) return 'Absent';
  if (a.marks == null) return 'Not entered';
  return '${Fmt.marks(a.marks!)} / ${Fmt.marks(a.maxMarks)}';
}

Color _subjectTone(BuildContext context, double percent) => percent >= 75
    ? Tone.goodBar(context)
    : percent >= 50
    ? Tone.warnBar(context)
    : context.colors.error;

/// Today's results card: the latest published marks against the class average, and each subject's
/// percentage.
class ResultsCard extends StatelessWidget {
  const ResultsCard({super.key, required this.study});

  final StudyController study;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final marks = study.marks;
    final error = study.marksError;
    void open() => ResultsScreen.open(context, study);

    if (marks == null) {
      return SectionCard(
        key: const Key('resultsCard'),
        icon: Icons.grading_outlined,
        title: 'Results',
        child: error != null ? ErrorBanner(error, onRetry: study.loadMarks) : const LinearProgressIndicator(),
      );
    }
    if (marks.assessments.isEmpty) {
      return SectionCard(
        key: const Key('resultsCard'),
        icon: Icons.grading_outlined,
        title: 'Results',
        child: Text(
          'No marks published yet. When your teachers publish test or exam marks, they show here with the class average.',
          style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
        ),
      );
    }
    return SectionCard(
      key: const Key('resultsCard'),
      icon: Icons.grading_outlined,
      title: 'Results',
      caption: 'Published marks',
      onTap: open,
      footer: CardLink('See all results', onTap: open),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final a in marks.assessments.take(2))
            AssessmentRow(result: a, onTap: () => AssessmentScreen.open(context, result: a)),
          if (marks.subjects.isNotEmpty) ...[
            const SizedBox(height: Kx.s12),
            Text('By subject', style: context.text.titleSmall),
            const SizedBox(height: Kx.s8),
            for (final s in marks.subjects) SubjectBar(result: s),
          ],
        ],
      ),
    );
  }
}

/// One assessment: subject, title, date, the score and how it compares with the class.
class AssessmentRow extends StatelessWidget {
  const AssessmentRow({super.key, required this.result, required this.onTap});

  final AssessmentResult result;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final a = result;
    final cmp = _comparison(context, a);
    return InkWell(
      key: Key('assessment-${a.id}'),
      borderRadius: Kx.radiusMd,
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: Kx.s8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(a.subject, style: context.text.titleSmall),
                  Text(
                    a.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
                  ),
                  Text(
                    '${a.kind.label} · ${Fmt.shortDay(a.heldOn)}${a.classAverage == null ? '' : ' · Class average ${Fmt.marks(a.classAverage!)}'}',
                    style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                  ),
                  if (cmp != null) ...[const SizedBox(height: Kx.s4), Pill(cmp.$1, background: cmp.$2, foreground: cmp.$3)],
                ],
              ),
            ),
            const SizedBox(width: Kx.s12),
            // Shrinks rather than squeezing the title out with very large text.
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 120),
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  scoreLine(a),
                  style: (a.marks == null ? context.text.titleMedium : context.text.headlineSmall)?.copyWith(
                    fontWeight: FontWeight.w500,
                    color: a.absent ? c.error : null,
                  ),
                ),
              ),
            ),
            Icon(Icons.chevron_right, color: c.onSurfaceVariant),
          ],
        ),
      ),
    );
  }
}

/// "Corporate Accounting ███████░░ 76%"
class SubjectBar extends StatelessWidget {
  const SubjectBar({super.key, required this.result});

  final SubjectResult result;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final tone = _subjectTone(context, result.percent);
    return Padding(
      key: Key('subject-${result.subject}'),
      padding: const EdgeInsets.symmetric(vertical: Kx.s4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(result.subject, style: context.text.bodyLarge, maxLines: 1, overflow: TextOverflow.ellipsis)),
              Text(Fmt.percent(result.percent), style: context.text.titleSmall),
            ],
          ),
          const SizedBox(height: Kx.s4),
          ClipRRect(
            borderRadius: Kx.radiusSm,
            child: LinearProgressIndicator(
              value: (result.percent / 100).clamp(0, 1),
              minHeight: 8,
              color: tone,
              backgroundColor: c.surfaceContainerHighest,
            ),
          ),
        ],
      ),
    );
  }
}

/// Every published assessment, with per-subject percentages.
class ResultsScreen extends StatefulWidget {
  const ResultsScreen({super.key, required this.study});

  final StudyController study;

  static Future<void> open(BuildContext context, StudyController study) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => ResultsScreen(study: study)));

  @override
  State<ResultsScreen> createState() => _ResultsScreenState();
}

class _ResultsScreenState extends State<ResultsScreen> {
  @override
  void initState() {
    super.initState();
    widget.study.loadMarks();
  }

  @override
  Widget build(BuildContext context) {
    final study = widget.study;
    return Scaffold(
      appBar: AppBar(title: const Text('Results')),
      body: ListenableBuilder(
        listenable: study,
        builder: (context, _) {
          final c = context.colors;
          final marks = study.marks;
          final error = study.marksError;
          if (marks == null) {
            return error == null
                ? const Center(child: CircularProgressIndicator())
                : Padding(
                    padding: const EdgeInsets.all(Kx.s16),
                    child: ErrorBanner(error, onRetry: study.loadMarks),
                  );
          }
          return RefreshIndicator(
            onRefresh: study.loadMarks,
            child: LayoutBuilder(
              builder: (context, box) => ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: EdgeInsets.fromLTRB(sideGutter(box.maxWidth), Kx.s8, sideGutter(box.maxWidth), Kx.s32),
              children: [
                if (marks.assessments.isEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: Kx.s48),
                    child: KxEmptyState(
                      icon: Icons.grading_outlined,
                      message: 'No marks published yet.\nWhen your teachers publish marks, they show here.',
                    ),
                  ),
                if (marks.subjects.isNotEmpty) ...[
                  Text('By subject', style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w500)),
                  const SizedBox(height: Kx.s4),
                  Text('Marks scored out of the total, across published assessments.', style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
                  const SizedBox(height: Kx.s8),
                  for (final s in marks.subjects) SubjectBar(result: s),
                ],
                if (marks.assessments.isNotEmpty) ...[
                  const SizedBox(height: Kx.s24),
                  Text('Assessments', style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w500)),
                  const SizedBox(height: Kx.s4),
                  for (final (i, a) in marks.assessments.indexed) ...[
                    if (i > 0) const Divider(height: 1),
                    AssessmentRow(result: a, onTap: () => AssessmentScreen.open(context, result: a)),
                  ],
                ],
              ],
            ),
            ),
          );
        },
      ),
    );
  }
}

/// One assessment: your marks next to the class average and highest, and the teacher's remark.
class AssessmentScreen extends StatelessWidget {
  const AssessmentScreen({super.key, required this.result});

  final AssessmentResult result;

  static Future<void> open(BuildContext context, {required AssessmentResult result}) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => AssessmentScreen(result: result)));

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final a = result;
    final cmp = _comparison(context, a);
    final bars = [
      if (a.marks != null) ('You', a.marks!, c.primary),
      if (a.classAverage != null) ('Class average', a.classAverage!, c.secondary),
      if (a.classHighest != null) ('Highest in class', a.classHighest!, c.tertiary),
    ];
    return Scaffold(
      appBar: AppBar(title: Text(a.subject)),
      body: LayoutBuilder(
        builder: (context, box) => ListView(
        padding: EdgeInsets.fromLTRB(sideGutter(box.maxWidth), Kx.s8, sideGutter(box.maxWidth), Kx.s32),
        children: [
          Text(a.title, style: context.text.headlineSmall),
          const SizedBox(height: Kx.s4),
          Text(
            '${a.kind.label} · ${Fmt.longDay(a.heldOn)} · out of ${Fmt.marks(a.maxMarks)}',
            style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
          ),
          const SizedBox(height: Kx.s24),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(Kx.s16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Wrap(
                    crossAxisAlignment: WrapCrossAlignment.end,
                    spacing: Kx.s12,
                    runSpacing: Kx.s4,
                    children: [
                      Text(
                        a.absent ? 'Absent' : (a.marks == null ? 'Not entered' : Fmt.marks(a.marks!)),
                        key: const Key('assessmentScore'),
                        style: context.text.displayMedium?.copyWith(
                          fontWeight: FontWeight.w500,
                          height: 1,
                          color: a.absent ? c.error : null,
                        ),
                      ),
                      if (a.marks != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Text(
                            'out of ${Fmt.marks(a.maxMarks)} · ${Fmt.percent(a.percent!)}',
                            style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
                          ),
                        ),
                    ],
                  ),
                  if (cmp != null) ...[
                    const SizedBox(height: Kx.s12),
                    Align(alignment: Alignment.centerLeft, child: Pill(cmp.$1, background: cmp.$2, foreground: cmp.$3)),
                  ],
                  if (a.absent) ...[
                    const SizedBox(height: Kx.s8),
                    Text(
                      'You were marked absent for this ${a.kind.label.toLowerCase()}.',
                      style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
                    ),
                  ],
                  if (bars.isNotEmpty) ...[
                    const SizedBox(height: Kx.s16),
                    for (final (label, value, color) in bars) _CompareBar(label: label, value: value, max: a.maxMarks, color: color),
                  ],
                ],
              ),
            ),
          ),
          if (a.remark != null) ...[
            const SizedBox(height: Kx.s16),
            Card(
              color: c.secondaryContainer,
              child: Padding(
                padding: const EdgeInsets.all(Kx.s16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("Teacher's remark", style: context.text.titleSmall?.copyWith(color: c.onSecondaryContainer)),
                    const SizedBox(height: Kx.s4),
                    Text(a.remark!, style: context.text.bodyLarge?.copyWith(color: c.onSecondaryContainer)),
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

class _CompareBar extends StatelessWidget {
  const _CompareBar({required this.label, required this.value, required this.max, required this.color});

  final String label;
  final double value;
  final double max;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Kx.s4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(label, style: context.text.bodyMedium)),
              Text(Fmt.marks(value), style: context.text.titleSmall),
            ],
          ),
          const SizedBox(height: Kx.s4),
          ClipRRect(
            borderRadius: Kx.radiusSm,
            child: LinearProgressIndicator(
              value: max == 0 ? 0 : (value / max).clamp(0, 1),
              minHeight: 10,
              color: color,
              backgroundColor: c.surfaceContainerHighest,
            ),
          ),
        ],
      ),
    );
  }
}
