import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../board/chrome.dart';
import '../board/sb_strings.dart';
import 'ai_controller.dart';
import 'ai_widgets.dart';

/// A titled list of lines, skipped when empty.
Widget _section(BuildContext context, String title, List<String> lines, {Key? key}) {
  if (lines.isEmpty) return const SizedBox.shrink();
  return Padding(
    key: key,
    padding: const EdgeInsets.only(bottom: Kx.s16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: context.text.titleMedium),
        const SizedBox(height: Kx.s4),
        for (final line in lines) Padding(padding: const EdgeInsets.only(bottom: 4), child: Text('• $line', style: context.text.bodyLarge)),
      ],
    ),
  );
}

/// The result's actions: put it on the board (as text, for the teacher to edit or rub out).
Widget _toBoard(BuildContext context, AiController ai, String text, String key) => Align(
  alignment: Alignment.centerLeft,
  child: OutlinedButton.icon(
    key: Key(key),
    onPressed: ai.addTextToBoard == null || text.trim().isEmpty ? null : () => ai.addTextToBoard!(text.trim()),
    icon: const Icon(Icons.note_add_outlined),
    label: Text(SbStrings.of(context)('addToBoard')),
  ),
);

/// Summary AI (spec §41): the board's pages (or a topic) as teacher summary, student notes,
/// revision sheet or class recap.
class SummaryPanel extends StatefulWidget {
  const SummaryPanel({super.key, required this.ai, this.onBack});

  final AiController ai;
  final VoidCallback? onBack;

  @override
  State<SummaryPanel> createState() => _SummaryPanelState();
}

class _SummaryPanelState extends State<SummaryPanel> {
  @override
  Widget build(BuildContext context) {
    final s = SbStrings.of(context);
    final l = context.l10n;
    final ai = widget.ai;
    return AiPanelPage(
      ai: ai,
      icon: Icons.summarize_outlined,
      title: s('smartSummary'),
      onBack: widget.onBack,
      child: ListenableBuilder(
        listenable: ai.summary,
        builder: (context, _) {
          final t = ai.summary;
          final r = t.value?.result;
          return ListView(
            padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s8, Kx.s24, Kx.s24),
            children: [
              if (!ai.canUseAi) ...[const AiSignInNotice(), const SizedBox(height: Kx.s16)],
              Text(s('sumFormat'), style: context.text.labelLarge),
              const SizedBox(height: Kx.s4),
              SegmentedButton<String>(
                key: const Key('summary-format'),
                showSelectedIcon: false,
                segments: [
                  ButtonSegment(value: 'teacher', label: Text(s('sumTeacher'))),
                  ButtonSegment(value: 'student', label: Text(s('sumStudent'))),
                  ButtonSegment(value: 'revision', label: Text(s('sumRevision'))),
                  ButtonSegment(value: 'recap', label: Text(s('sumRecap'))),
                ],
                selected: {ai.summaryFormat},
                onSelectionChanged: (v) => setState(() => ai.summaryFormat = v.single),
              ),
              const SizedBox(height: Kx.s16),
              Align(
                alignment: Alignment.centerLeft,
                child: FilledButton.icon(
                  key: const Key('summary-generate'),
                  onPressed: t.loading || !ai.canUseAi ? null : () => ai.summarise(),
                  icon: const Icon(Icons.auto_awesome),
                  label: Text(s('sumFromBoard')),
                ),
              ),
              const SizedBox(height: Kx.s16),
              if (t.loading) AiLoading(label: s('sumFromBoard')),
              if (t.error != null) AiError(message: aiErrorMessage(l, t.error!), onRetry: () => ai.summarise()),
              if (r != null && !t.loading) ...[
                Text(s('aiDraft'), style: context.text.bodySmall),
                const SizedBox(height: Kx.s12),
                _section(context, s('sumConcepts'), r.keyConcepts, key: const Key('summary-concepts')),
                _section(context, s('sumDefinitions'), [for (final (t, m) in r.definitions) '$t: $m']),
                _section(context, s('sumFormulas'), r.formulas),
                _section(context, s('sumExamples'), r.examples),
                _section(context, s('sumPoints'), r.importantPoints),
                _section(context, s('sumQuestions'), r.questions),
                _toBoard(context, ai, _summaryText(s, r), 'summary-to-board'),
              ],
            ],
          );
        },
      ),
    );
  }

  static String _summaryText(SbStrings s, BoardSummary r) => [
    if (r.keyConcepts.isNotEmpty) '${s('sumConcepts')}:\n${r.keyConcepts.map((x) => '• $x').join('\n')}',
    if (r.formulas.isNotEmpty) '${s('sumFormulas')}:\n${r.formulas.map((x) => '• $x').join('\n')}',
    if (r.importantPoints.isNotEmpty) '${s('sumPoints')}:\n${r.importantPoints.map((x) => '• $x').join('\n')}',
  ].join('\n\n');
}

/// Lecture AI (spec §42): outline, explanation, examples, analogies, board plan, activities, recap.
class LecturePanel extends StatefulWidget {
  const LecturePanel({super.key, required this.ai, this.onBack});

  final AiController ai;
  final VoidCallback? onBack;

  @override
  State<LecturePanel> createState() => _LecturePanelState();
}

class _LecturePanelState extends State<LecturePanel> {
  late final _topic = TextEditingController(text: widget.ai.defaultTopic);
  int _minutes = 40;

  @override
  void dispose() {
    _topic.dispose();
    super.dispose();
  }

  void _go() {
    if (_topic.text.trim().length < 2) return;
    widget.ai.prepareLecture(_topic.text, minutes: _minutes);
  }

  @override
  Widget build(BuildContext context) {
    final s = SbStrings.of(context);
    final l = context.l10n;
    final ai = widget.ai;
    return AiPanelPage(
      ai: ai,
      icon: Icons.record_voice_over_outlined,
      title: s('smartLecture'),
      onBack: widget.onBack,
      child: ListenableBuilder(
        listenable: ai.lecture,
        builder: (context, _) {
          final t = ai.lecture;
          final r = t.value?.result;
          return ListView(
            padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s8, Kx.s24, Kx.s24),
            children: [
              if (!ai.canUseAi) ...[const AiSignInNotice(), const SizedBox(height: Kx.s16)],
              TextField(key: const Key('lecture-topic'), controller: _topic, decoration: InputDecoration(labelText: l.topicLabel), onSubmitted: (_) => _go()),
              const SizedBox(height: Kx.s12),
              NumberPicker(label: s('minutes'), value: _minutes, options: const [20, 30, 40, 45, 55, 60, 90], onChanged: (v) => setState(() => _minutes = v)),
              const SizedBox(height: Kx.s12),
              Align(
                alignment: Alignment.centerLeft,
                child: FilledButton.icon(key: const Key('lecture-generate'), onPressed: t.loading || !ai.canUseAi ? null : _go, icon: const Icon(Icons.auto_awesome), label: Text(s('lecMake'))),
              ),
              const SizedBox(height: Kx.s16),
              if (t.loading) AiLoading(label: s('lecMake')),
              if (t.error != null) AiError(message: aiErrorMessage(l, t.error!), onRetry: _go),
              if (r != null && !t.loading) ...[
                Text(s('aiDraft'), style: context.text.bodySmall),
                const SizedBox(height: Kx.s12),
                _section(context, s('lecOutline'), r.outline, key: const Key('lecture-outline')),
                _section(context, s('lecExplanation'), [r.explanation]),
                _section(context, s('sumExamples'), r.examples),
                _section(context, s('lecAnalogies'), r.analogies),
                _section(context, s('lecBoardPlan'), r.boardPlan),
                _section(context, s('lecActivities'), r.activities),
                _section(context, s('lecRecap'), [r.recap]),
                _toBoard(context, ai, r.boardPlan.join('\n'), 'lecture-to-board'),
              ],
            ],
          );
        },
      ),
    );
  }
}

/// Select & Ask (spec §39): explain, simplify, expand, solve, translate, example, quiz,
/// homework, diagram, board-ready notes, remedial steps or a class activity for what the teacher selected on the board.
class SelectAskPanel extends StatelessWidget {
  const SelectAskPanel({super.key, required this.ai, this.onBack});

  final AiController ai;
  final VoidCallback? onBack;

  static const actions = [
    ('explain', 'saExplain', Icons.lightbulb_outline),
    ('simplify', 'saSimplify', Icons.child_care),
    ('expand', 'saExpand', Icons.unfold_more),
    ('solve', 'saSolve', Icons.calculate_outlined),
    ('translate', 'saTranslate', Icons.translate),
    ('example', 'saExample', Icons.tips_and_updates_outlined),
    ('quiz', 'saQuiz', Icons.quiz_outlined),
    ('homework', 'saHomework', Icons.assignment_outlined),
    ('diagram', 'saDiagram', Icons.schema_outlined),
    ('boardReady', 'saBoardReady', Icons.notes),
    ('remedial', 'saRemedial', Icons.healing_outlined),
    ('activity', 'saActivity', Icons.groups_2_outlined),
  ];

  Future<void> _run(BuildContext context, String action) async {
    var content = ai.selectedContent.trim();
    if (content.isEmpty && ai.captureBoard != null) {
      // Handwriting or a drawing: read the selection first.
      await ai.readBoard();
      content = ai.reading.value?.result.text.trim() ?? '';
    }
    if (content.isEmpty) {
      if (context.mounted) showBoardMessage(context, SbStrings.of(context)('selectNothing'));
      return;
    }
    await ai.askAbout(action, content, target: action == 'translate' ? (ai.language == AiLanguage.en ? AiLanguage.hi : AiLanguage.en) : null);
  }

  @override
  Widget build(BuildContext context) {
    final s = SbStrings.of(context);
    final l = context.l10n;
    return AiPanelPage(
      ai: ai,
      icon: Icons.ads_click,
      title: s('selectAsk'),
      onBack: onBack,
      child: ListenableBuilder(
        listenable: ai.selectAsk,
        builder: (context, _) {
          final t = ai.selectAsk;
          final r = t.value?.result;
          return ListView(
            padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s8, Kx.s24, Kx.s24),
            children: [
              Text(s('selectAskHint'), style: context.text.bodyMedium),
              if (ai.selectedContent.isNotEmpty) ...[
                const SizedBox(height: Kx.s8),
                Container(
                  padding: const EdgeInsets.all(Kx.s12),
                  decoration: BoxDecoration(color: context.colors.surfaceContainerHigh, borderRadius: BorderRadius.circular(Kx.rMd)),
                  child: Text(ai.selectedContent, maxLines: 4, overflow: TextOverflow.ellipsis),
                ),
              ],
              const SizedBox(height: Kx.s12),
              Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                children: [
                  for (final (id, key, icon) in actions)
                    ActionChip(key: Key('sa-$id'), avatar: Icon(icon, size: 18), label: Text(s(key)), onPressed: t.loading || !ai.canUseAi ? null : () => _run(context, id)),
                ],
              ),
              const SizedBox(height: Kx.s16),
              if (t.loading) AiLoading(label: s('selectAsk')),
              if (t.error != null) AiError(message: aiErrorMessage(l, t.error!)),
              if (r != null && !t.loading) ...[
                Text(r.title, style: context.text.titleLarge),
                const SizedBox(height: Kx.s8),
                Text(r.answer, key: const Key('sa-answer'), style: context.text.bodyLarge),
                const SizedBox(height: Kx.s8),
                for (final (i, item) in r.items.indexed) Padding(padding: const EdgeInsets.only(bottom: 4), child: Text('${i + 1}. $item')),
                const SizedBox(height: Kx.s8),
                Text(s('aiDraft'), style: context.text.bodySmall),
                const SizedBox(height: Kx.s8),
                _toBoard(context, ai, [r.answer, ...r.items].join('\n'), 'sa-to-board'),
              ],
            ],
          );
        },
      ),
    );
  }
}
