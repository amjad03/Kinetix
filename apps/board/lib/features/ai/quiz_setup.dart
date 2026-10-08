import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../board/sb_strings.dart';
import 'ai_controller.dart';

/// Quiz AI setup beyond topic, count and difficulty (spec §43): where the questions come from
/// (a topic, or Scan the Board: complete pages or chosen pages), the question types, and the
/// class/board/subject.
class QuizSetup extends StatefulWidget {
  const QuizSetup({super.key, required this.ai, required this.onChanged, this.homework = false});

  final AiController ai;
  final VoidCallback onChanged;

  /// Homework AI's formats instead of the quiz's question types.
  final bool homework;

  @override
  State<QuizSetup> createState() => _QuizSetupState();
}

class _QuizSetupState extends State<QuizSetup> {
  late final _level = TextEditingController(text: widget.ai.level ?? '');

  @override
  void dispose() {
    _level.dispose();
    super.dispose();
  }

  void _set(VoidCallback f) {
    setState(f);
    widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    final s = SbStrings.of(context);
    final ai = widget.ai;
    final pages = ai.pageCount?.call() ?? 1;
    final scan = ai.quizScan;
    final label = context.text.labelLarge?.copyWith(color: context.colors.onSurfaceVariant);
    final types = widget.homework
        ? const [('qa', 'hwQa'), ('fillBlank', 'hwFill'), ('mcq', 'hwMcq'), ('trueFalse', 'hwTf'), ('twoMark', 'hw2'), ('threeMark', 'hw3'), ('fiveMark', 'hw5'), ('diagram', 'hwDiagram')]
        : const [('mcq', 'qtMcq'), ('trueFalse', 'qtTrueFalse'), ('fillBlank', 'qtFillBlank'), ('shortAnswer', 'qtShortAnswer')];
    final chosen = widget.homework ? ai.homeworkTypes : ai.quizTypes;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (!widget.homework) ...[
          Text(s('quizSource'), style: label),
          const SizedBox(height: Kx.s4),
          SegmentedButton<bool>(
            key: const Key('quiz-source'),
            showSelectedIcon: false,
            segments: [ButtonSegment(value: false, label: Text(s('fromTopic'))), ButtonSegment(value: true, label: Text(s('scanBoard')))],
            selected: {scan != null},
            onSelectionChanged: (v) => _set(() => ai.quizScan = v.single ? const [] : null),
          ),
          if (scan != null) ...[
            const SizedBox(height: Kx.s8),
            Wrap(
              spacing: Kx.s8,
              runSpacing: Kx.s8,
              children: [
                ChoiceChip(key: const Key('scan-all'), label: Text(s('scanAll')), selected: scan.isEmpty, onSelected: (_) => _set(() => ai.quizScan = const [])),
                for (var i = 0; i < pages; i++)
                  FilterChip(
                    key: Key('scan-page-$i'),
                    label: Text(s('pageN', {'n': i + 1})),
                    selected: scan.contains(i),
                    onSelected: (on) => _set(() {
                      final next = {...scan};
                      on ? next.add(i) : next.remove(i);
                      ai.quizScan = (next.toList()..sort());
                    }),
                  ),
              ],
            ),
          ],
          const SizedBox(height: Kx.s12),
        ],
        Text(s('formats'), style: label),
        const SizedBox(height: Kx.s4),
        Wrap(
          spacing: Kx.s8,
          runSpacing: Kx.s8,
          children: [
            for (final (id, key) in types)
              FilterChip(
                key: Key('${widget.homework ? 'hw' : 'qt'}-$id'),
                label: Text(s(key)),
                selected: chosen.contains(id),
                onSelected: (on) => _set(() {
                  if (on) {
                    chosen.add(id);
                  } else if (chosen.length > 1) {
                    chosen.remove(id);
                  }
                }),
              ),
          ],
        ),
        const SizedBox(height: Kx.s12),
        TextField(
          key: Key(widget.homework ? 'hw-level' : 'quiz-level'),
          controller: _level,
          decoration: InputDecoration(labelText: s('level'), hintText: s('levelHint')),
          onChanged: (v) => ai.level = v.trim().isEmpty ? null : v.trim(),
        ),
      ],
    );
  }
}
