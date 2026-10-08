import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/insights_models.dart';
import '../../core/l10n.dart';
import '../../widgets/common.dart';

/// KINETIX AI for the teacher: explain a topic, or draft a quiz, homework or lesson plan. Every
/// result is labelled a draft; nothing reaches students from here.
class AiCopilotScreen extends StatefulWidget {
  const AiCopilotScreen({super.key, required this.api, this.language = 'en'});

  final TeacherApi api;

  /// The language the draft is written in (the app's language).
  final String language;

  @override
  State<AiCopilotScreen> createState() => _AiCopilotScreenState();
}

class _AiCopilotScreenState extends State<AiCopilotScreen> {
  final _input = TextEditingController();
  AiTask _task = AiTask.explain;
  int _count = 5;
  int _minutes = 45;
  bool _busy = false;
  AiDraft? _draft;
  ApiException? _error;

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _generate() async {
    final text = _input.text.trim();
    if (text.length < 2) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final d = await widget.api.aiDraft(_task, input: text, count: _count, minutes: _minutes, language: widget.language);
      if (mounted) setState(() => _draft = d);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _taskLabel(AppLocalizations l, AiTask t) => switch (t) {
    AiTask.explain => l.copilotExplain,
    AiTask.quiz => l.copilotQuiz,
    AiTask.homework => l.copilotHomework,
    AiTask.lessonPlan => l.copilotLessonPlan,
  };

  String _heading(AppLocalizations l, String key) => switch (key) {
    'keyPoints' => l.copilotKeyPoints,
    'followUps' => l.copilotFollowUps,
    'questions' => l.copilotQuestions,
    'objectives' => l.copilotObjectives,
    'steps' => l.copilotSteps,
    'materials' => l.copilotMaterials,
    'assessment' => l.copilotAssessment,
    _ => '',
  };

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final draft = _draft;
    return Scaffold(
      appBar: AppBar(title: Text(l.copilotTitle)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
        children: [
          Wrap(
            spacing: Kx.s8,
            children: [
              for (final t in AiTask.values)
                ChoiceChip(key: Key('task-${t.name}'), label: Text(_taskLabel(l, t)), selected: _task == t, onSelected: (_) => setState(() => _task = t)),
            ],
          ),
          const SizedBox(height: Kx.s12),
          TextField(
            key: const Key('copilotInput'),
            controller: _input,
            minLines: 2,
            maxLines: 5,
            maxLength: _task == AiTask.explain ? 1000 : 200,
            decoration: InputDecoration(labelText: _task == AiTask.explain ? l.copilotQuestionLabel : l.copilotTopicLabel),
            onChanged: (_) => setState(() {}),
          ),
          if (_task == AiTask.quiz || _task == AiTask.homework)
            Row(
              children: [
                Text(l.copilotHowMany(_count)),
                Expanded(child: Slider(key: const Key('countSlider'), min: 1, max: 15, divisions: 14, value: _count.toDouble(), onChanged: (v) => setState(() => _count = v.round()))),
              ],
            ),
          if (_task == AiTask.lessonPlan)
            Row(
              children: [
                Text(l.copilotMinutes(_minutes)),
                Expanded(child: Slider(key: const Key('minutesSlider'), min: 20, max: 90, divisions: 14, value: _minutes.toDouble(), onChanged: (v) => setState(() => _minutes = v.round()))),
              ],
            ),
          FilledButton.icon(
            key: const Key('generate'),
            onPressed: _busy || _input.text.trim().length < 2 ? null : _generate,
            icon: _busy ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.auto_awesome),
            label: Text(l.copilotGenerate),
          ),
          if (_error != null) ...[
            const SizedBox(height: Kx.s12),
            ErrorBanner.api(_error!, onRetry: _generate),
          ],
          if (draft != null) ...[
            const SizedBox(height: Kx.s16),
            Container(
              key: const Key('draftLabel'),
              padding: const EdgeInsets.all(Kx.s12),
              decoration: BoxDecoration(color: c.tertiaryContainer, borderRadius: Kx.radiusMd),
              child: Row(
                children: [
                  Icon(Icons.edit_note, color: c.onTertiaryContainer),
                  const SizedBox(width: Kx.s8),
                  Expanded(child: Text(draft.sample ? l.copilotSampleDraft : l.copilotDraftNote, style: context.text.bodyMedium?.copyWith(color: c.onTertiaryContainer))),
                ],
              ),
            ),
            const SizedBox(height: Kx.s12),
            KxCard(
              key: const Key('draftResult'),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final s in draft.sections) ...[
                    if (s.heading.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(_heading(l, s.heading), style: context.text.titleSmall)),
                    for (final line in s.lines) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(line, style: context.text.bodyMedium)),
                    const SizedBox(height: Kx.s4),
                  ],
                ],
              ),
            ),
            const SizedBox(height: Kx.s8),
            OutlinedButton.icon(
              key: const Key('copyDraft'),
              onPressed: () async {
                final messenger = ScaffoldMessenger.of(context);
                await Clipboard.setData(ClipboardData(text: draft.plain));
                messenger.showSnackBar(SnackBar(content: Text(l.copilotCopied)));
              },
              icon: const Icon(Icons.copy_outlined),
              label: Text(l.copilotCopy),
            ),
          ],
        ],
      ),
    );
  }
}
