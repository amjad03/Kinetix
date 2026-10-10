import 'package:flutter/material.dart';
import 'package:kinetix_cards/kinetix_cards.dart' show answerLetters;
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';
import 'class_poll.dart';

/// What the teacher set up in [AskClassDialog].
class AskSetup {
  const AskSetup({required this.kind, required this.question, required this.options, this.correct, this.coIds = const []});
  final PollKind kind;
  final String question;
  final List<String> options;
  final String? correct;
  final List<String> coIds;
}

/// "Ask the class": the question (optional: it can be read out or written on the board), A–B,
/// A–C, A–D, True / False or a number, and the right answer if the teacher wants it marked.
class AskClassDialog extends StatefulWidget {
  const AskClassDialog({super.key, this.question = '', this.outcomes = const []});

  final String question;

  /// The subject's course outcomes (`id`, `code`, `statement`); the question can be tagged with some of them.
  final List<Map<String, dynamic>> outcomes;

  @override
  State<AskClassDialog> createState() => _AskClassDialogState();
}

class _AskClassDialogState extends State<AskClassDialog> {
  late final _question = TextEditingController(text: widget.question);
  final _number = TextEditingController();

  /// 2, 3 or 4 letters; 5 = True / False; 0 = a number; 6 = a word cloud.
  int _choices = 4;
  int? _correct;
  final _cos = <String>{};

  bool get _trueFalse => _choices == 5;
  bool get _numeric => _choices == 0;
  bool get _word => _choices == 6;
  int get _count => _trueFalse ? 2 : _choices;

  @override
  void dispose() {
    _question.dispose();
    _number.dispose();
    super.dispose();
  }

  void _submit() {
    final l = context.l10n;
    final q = _question.text.trim();
    final options = _numeric || _word ? <String>[] : (_trueFalse ? [l.pollTrue, l.pollFalse] : answerLetters.take(_count).toList());
    final number = _number.text.trim();
    Navigator.pop(
      context,
      AskSetup(
        kind: _word ? PollKind.word : (_numeric ? PollKind.numeric : PollKind.mcq),
        question: q.isEmpty ? l.pollDefaultQuestion : q,
        options: options,
        coIds: _cos.toList(),
        correct: _word ? null : _numeric ? (double.tryParse(number) == null ? null : number) : _correct?.toString(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AlertDialog(
      scrollable: true,
      title: Text(l.toolAskClass),
      content: SizedBox(
        width: 480,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l.askClassHint, style: TextStyle(color: context.colors.onSurfaceVariant)),
            const SizedBox(height: Kx.s16),
            TextField(
              key: const Key('ask-question'),
              controller: _question,
              decoration: InputDecoration(labelText: l.askQuestionLabel),
            ),
            const SizedBox(height: Kx.s16),
            Text(l.askAnswersLabel, style: context.text.titleSmall),
            const SizedBox(height: Kx.s8),
            SegmentedButton<int>(
              key: const Key('ask-choices'),
              showSelectedIcon: false,
              segments: [
                ButtonSegment(value: 5, label: Text(l.askTrueFalse)),
                const ButtonSegment(value: 2, label: Text('A–B')),
                const ButtonSegment(value: 3, label: Text('A–C')),
                const ButtonSegment(value: 4, label: Text('A–D')),
                ButtonSegment(value: 0, label: Text(l.askNumber)),
                ButtonSegment(value: 6, label: Text(l.askWordCloud, key: const Key('ask-word-cloud'))),
              ],
              selected: {_choices},
              onSelectionChanged: (s) => setState(() {
                _choices = s.first;
                if (_correct != null && _correct! >= _count) _correct = null;
              }),
            ),
            if (widget.outcomes.isNotEmpty) ...[
              const SizedBox(height: Kx.s16),
              Text(_coTitle(context), style: context.text.titleSmall),
              const SizedBox(height: Kx.s8),
              Wrap(
                spacing: Kx.s8,
                children: [
                  for (final c in widget.outcomes)
                    FilterChip(
                      key: Key('ask-co-${c['id']}'),
                      label: Text('${c['code']}'),
                      selected: _cos.contains(c['id']),
                      onSelected: (v) => setState(() => v ? _cos.add('${c['id']}') : _cos.remove('${c['id']}')),
                    ),
                ],
              ),
            ],
            const SizedBox(height: Kx.s16),
            if (_word)
              Text(l.askWordCloudHint, key: const Key('ask-word-hint'), style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant))
            else ...[
            Text(l.askRightAnswer, style: context.text.titleSmall),
            const SizedBox(height: Kx.s8),
            if (_numeric)
              TextField(
                key: const Key('ask-number'),
                controller: _number,
                keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                decoration: InputDecoration(hintText: l.askNumberHint),
              )
            else
              Wrap(
                spacing: Kx.s8,
                children: [
                  for (var i = 0; i < _count; i++)
                    ChoiceChip(
                      key: Key('ask-correct-$i'),
                      label: Text(_trueFalse ? (i == 0 ? l.pollTrue : l.pollFalse) : answerLetters[i]),
                      selected: _correct == i,
                      onSelected: (v) => setState(() => _correct = v ? i : null),
                    ),
                ],
              ),
            if (_numeric) ...[
              const SizedBox(height: Kx.s8),
              Text(l.askNumberNoCards, style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
            ],
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(key: const Key('ask-start'), onPressed: _submit, child: Text(l.askStart)),
      ],
    );
  }
}

String _coTitle(BuildContext context) => switch (Localizations.maybeLocaleOf(context)?.languageCode) {
      'hi' => 'यह प्रश्न किस पाठ्यक्रम परिणाम को मापता है (वैकल्पिक)',
      'kn' => 'ಈ ಪ್ರಶ್ನೆ ಯಾವ ಕೋರ್ಸ್ ಫಲಿತಾಂಶವನ್ನು ಅಳೆಯುತ್ತದೆ (ಐಚ್ಛಿಕ)',
      _ => 'Course outcomes this question measures (optional)',
    };
