import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../core/study.dart';
import '../../l10n/l10n.dart';

/// "Live question" on Today while the teacher has a question open on the board. Tapping it
/// opens [LiveQuestionSheet]; once answered it says what the student chose (they can change it
/// until the teacher ends the question).
class LiveQuestionBanner extends StatelessWidget {
  const LiveQuestionBanner({super.key, required this.study, required this.question});

  final StudyController study;
  final ClassQuestion question;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    final answered = question.myAnswer;
    return Card(
      key: const Key('liveQuestionBanner'),
      color: c.tertiaryContainer,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => LiveQuestionSheet.open(context, study),
        child: Padding(
          padding: const EdgeInsets.all(Kx.s16),
          child: Row(
            children: [
              CircleAvatar(radius: 24, backgroundColor: c.tertiary, child: Icon(Icons.how_to_vote_outlined, color: c.onTertiary)),
              const SizedBox(width: Kx.s16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(l.liveQuestion, style: context.text.labelLarge?.copyWith(color: c.onTertiaryContainer)),
                    Text(question.question, maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.titleMedium?.copyWith(color: c.onTertiaryContainer)),
                    Text(
                      answered == null ? l.liveQuestionTapToAnswer : l.liveQuestionYourAnswer(question.label(answered)),
                      style: context.text.bodyMedium?.copyWith(color: c.onTertiaryContainer),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: c.onTertiaryContainer),
            ],
          ),
        ),
      ),
    );
  }
}

/// Answering the question: a big button per option, or a number.
class LiveQuestionSheet extends StatefulWidget {
  const LiveQuestionSheet({super.key, required this.study});

  final StudyController study;

  static Future<void> open(BuildContext context, StudyController study) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => LiveQuestionSheet(study: study),
  );

  @override
  State<LiveQuestionSheet> createState() => _LiveQuestionSheetState();
}

class _LiveQuestionSheetState extends State<LiveQuestionSheet> {
  final _number = TextEditingController();
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _number.dispose();
    super.dispose();
  }

  Future<void> _answer(String answer) async {
    final l = context.l10n;
    setState(() => (_sending = true, _error = null));
    try {
      await widget.study.answerQuestion(answer);
      if (mounted) Navigator.pop(context);
    } on ApiException catch (e) {
      final q = widget.study.question;
      final message = e.status != 400
          ? l.liveQuestionClosed
          : q?.numeric == true
          ? l.liveQuestionNotNumber
          : q?.word == true
          ? l.liveQuestionNotWords
          : l.liveQuestionClosed;
      if (mounted) setState(() => _error = message);
      await widget.study.loadQuestion();
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final q = widget.study.question;
    final c = context.colors;
    return Padding(
      padding: EdgeInsets.fromLTRB(Kx.s24, 0, Kx.s24, Kx.s24 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l.liveQuestion, style: context.text.labelLarge?.copyWith(color: c.primary)),
          const SizedBox(height: Kx.s4),
          Text(q?.question ?? l.liveQuestionClosed, style: context.text.titleLarge),
          if (q?.subject != null) Text('${q!.subject} · ${q.teacher}', style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
          const SizedBox(height: Kx.s16),
          if (q != null && !q.numeric && !q.word)
            for (final (i, option) in q.options.indexed)
              Padding(
                padding: const EdgeInsets.only(bottom: Kx.s8),
                child: q.myAnswer == '$i'
                    ? FilledButton(key: Key('answer-$i'), onPressed: _sending ? null : () => _answer('$i'), child: Text(option))
                    : OutlinedButton(key: Key('answer-$i'), onPressed: _sending ? null : () => _answer('$i'), child: Text(option)),
              ),
          if (q != null && (q.numeric || q.word)) ...[
            TextField(
              key: const Key('answer-number'),
              controller: _number..text = _number.text.isEmpty ? (q.myAnswer ?? '') : _number.text,
              keyboardType: q.word ? TextInputType.text : const TextInputType.numberWithOptions(decimal: true, signed: true),
              maxLength: q.word ? 40 : null,
              decoration: InputDecoration(labelText: q.word ? l.liveQuestionYourWords : l.liveQuestionYourNumber),
              onSubmitted: (v) => _answer(v.trim()),
            ),
            const SizedBox(height: Kx.s12),
            FilledButton(key: const Key('answer-send'), onPressed: _sending ? null : () => _answer(_number.text.trim()), child: Text(l.liveQuestionSend)),
          ],
          if (_error != null) ...[
            const SizedBox(height: Kx.s8),
            Text(_error!, key: const Key('answer-error'), style: TextStyle(color: c.error)),
          ],
        ],
      ),
    );
  }
}
