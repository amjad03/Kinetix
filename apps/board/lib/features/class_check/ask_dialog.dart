import 'package:flutter/material.dart';
import 'package:kinetix_cards/kinetix_cards.dart' show answerLetters;
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';
import 'class_poll.dart';

/// What the teacher set up in [AskClassDialog].
class AskSetup {
  const AskSetup({required this.kind, required this.question, required this.options, this.correct});
  final PollKind kind;
  final String question;
  final List<String> options;
  final String? correct;
}

/// "Ask the class": the question (optional: it can be read out or written on the board), A–B,
/// A–C, A–D, True / False or a number, and the right answer if the teacher wants it marked.
class AskClassDialog extends StatefulWidget {
  const AskClassDialog({super.key, this.question = ''});

  final String question;

  @override
  State<AskClassDialog> createState() => _AskClassDialogState();
}

class _AskClassDialogState extends State<AskClassDialog> {
  late final _question = TextEditingController(text: widget.question);
  final _number = TextEditingController();

  /// 2, 3 or 4 letters; 5 = True / False; 0 = a number.
  int _choices = 4;
  int? _correct;

  bool get _trueFalse => _choices == 5;
  bool get _numeric => _choices == 0;
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
    final options = _numeric ? <String>[] : (_trueFalse ? [l.pollTrue, l.pollFalse] : answerLetters.take(_count).toList());
    final number = _number.text.trim();
    Navigator.pop(
      context,
      AskSetup(
        kind: _numeric ? PollKind.numeric : PollKind.mcq,
        question: q.isEmpty ? l.pollDefaultQuestion : q,
        options: options,
        correct: _numeric ? (double.tryParse(number) == null ? null : number) : _correct?.toString(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AlertDialog(
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
              ],
              selected: {_choices},
              onSelectionChanged: (s) => setState(() {
                _choices = s.first;
                if (_correct != null && _correct! >= _count) _correct = null;
              }),
            ),
            const SizedBox(height: Kx.s16),
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
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(key: const Key('ask-start'), onPressed: _submit, child: Text(l.askStart)),
      ],
    );
  }
}
