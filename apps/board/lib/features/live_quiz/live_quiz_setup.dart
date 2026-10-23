import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_cards/kinetix_cards.dart' show answerLetters;
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import '../../core/models.dart' show AiLanguage;
import '../../demo/demo_class_switcher.dart' show DemoClassSwitcher;
import '../../l10n/l10n.dart';
import '../assessment/assessment.dart' show AssessmentGenerator;
import 'live_quiz_game.dart';

/// What the teacher set up in [LiveQuizSetupDialog].
class LiveQuizSetup {
  const LiveQuizSetup({required this.title, required this.questions, required this.cards});
  final String title;
  final List<GameQuestion> questions;
  final bool cards;
}

/// Live Quiz setup: the topic (today's, to start with), questions made on it (Zynetix AI, the
/// board's notes or the class bank, as exit tickets get them), saved questions from the server
/// (the subject's question bank and questions asked in this class before), questions the teacher
/// writes, the time for each question and whether answer cards play too.
class LiveQuizSetupDialog extends StatefulWidget {
  const LiveQuizSetupDialog({super.key, required this.board, this.generator, this.suggestions, this.initialTopic});

  final BoardController board;

  /// Makes questions on a topic; [AssessmentGenerator.forBoard] when null.
  final AssessmentGenerator? generator;

  /// Saved questions for the class on a topic; the server's when null (and the board has a class open).
  final Future<List<GameQuestion>> Function(String topic)? suggestions;

  final String? initialTopic;

  @override
  State<LiveQuizSetupDialog> createState() => _LiveQuizSetupDialogState();
}

class _LiveQuizSetupDialogState extends State<LiveQuizSetupDialog> {
  final _topic = TextEditingController();
  final _questions = <GameQuestion>[];
  List<GameQuestion>? _saved;
  int _seconds = 20;
  late bool _cards = !_online;
  bool _making = false;
  bool _loadingSaved = false;

  // The question being written.
  bool _editing = false;
  final _text = TextEditingController();
  final _options = [for (var i = 0; i < 4; i++) TextEditingController()];

  /// 5 = True / False; 2, 3 or 4 letters.
  int _choices = 4;
  int? _correct;

  bool get _online => widget.board.isSignedIn && widget.board.session?.sectionName != null && widget.board.api != null;
  bool get _canSuggest => widget.suggestions != null || _online;

  @override
  void initState() {
    super.initState();
    _topic.text = widget.initialTopic ?? DemoClassSwitcher.current?.topic ?? '';
    if (_topic.text.isEmpty) unawaited(_todaysTopic());
  }

  Future<void> _todaysTopic() async {
    try {
      final plan = await widget.board.api?.currentLessonPlan();
      final t = plan?.plan?.topics.firstOrNull?.title;
      if (t != null && mounted && _topic.text.isEmpty) setState(() => _topic.text = t);
    } catch (_) {}
  }

  @override
  void dispose() {
    _topic.dispose();
    _text.dispose();
    for (final c in _options) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _make() async {
    final topic = _topic.text.trim();
    if (topic.isEmpty) return;
    setState(() => _making = true);
    try {
      final gen = widget.generator ?? AssessmentGenerator.forBoard(widget.board, language: AiLanguage.fromCode(widget.board.session?.language));
      final (made, _) = await gen.choices(topic, 5);
      if (!mounted) return;
      setState(() {
        for (final q in made) {
          if (q.options.length < 2 || q.options.length > 4 || q.answer < 0 || q.answer >= q.options.length) continue;
          final tf = q.options.length == 2 && q.options.first.toLowerCase() == 'true';
          _questions.add(GameQuestion(kind: tf ? QuizKind.tf : QuizKind.mcq, question: q.question, options: q.options, correct: q.answer, seconds: _seconds));
        }
      });
    } catch (_) {
      // Nothing made: the teacher can still write questions.
    } finally {
      if (mounted) setState(() => _making = false);
    }
  }

  Future<void> _loadSaved() async {
    setState(() => _loadingSaved = true);
    try {
      final topic = _topic.text.trim();
      final got = widget.suggestions != null ? await widget.suggestions!(topic) : [for (final j in await widget.board.api!.quizQuestions(topic: topic)) GameQuestion.fromJson(j, seconds: _seconds)];
      if (mounted) setState(() => _saved = got);
    } catch (_) {
      if (mounted) setState(() => _saved = const []);
    } finally {
      if (mounted) setState(() => _loadingSaved = false);
    }
  }

  bool _has(GameQuestion q) => _questions.any((x) => x.question == q.question);

  void _addWritten() {
    final l = context.l10n;
    final text = _text.text.trim();
    final tf = _choices == 5;
    final count = tf ? 2 : _choices;
    final options = tf ? [l.pollTrue, l.pollFalse] : [for (var i = 0; i < count; i++) _options[i].text.trim().isEmpty ? answerLetters[i] : _options[i].text.trim()];
    if (text.isEmpty || _correct == null || _correct! >= count) return;
    setState(() {
      _questions.add(GameQuestion(kind: tf ? QuizKind.tf : QuizKind.mcq, question: text, options: options, correct: _correct!, seconds: _seconds));
      _editing = false;
      _text.clear();
      for (final c in _options) {
        c.clear();
      }
      _correct = null;
    });
  }

  void _start() {
    if (_questions.isEmpty) return;
    final topic = _topic.text.trim();
    Navigator.pop(context, LiveQuizSetup(title: topic.isEmpty ? context.l10n.topLiveQuiz : topic, questions: [for (final q in _questions) q.withSeconds(_seconds)], cards: _cards));
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    return AlertDialog(
      scrollable: true,
      title: Text(l.topLiveQuiz),
      content: SizedBox(
        width: 560,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l.quizSetupHint, style: TextStyle(color: c.onSurfaceVariant)),
            const SizedBox(height: Kx.s16),
            TextField(
              key: const Key('quiz-topic'),
              controller: _topic,
              decoration: InputDecoration(labelText: l.quizTopic),
            ),
            const SizedBox(height: Kx.s8),
            Wrap(
              spacing: Kx.s8,
              runSpacing: Kx.s8,
              children: [
                FilledButton.tonalIcon(
                  key: const Key('quiz-make'),
                  onPressed: _making ? null : _make,
                  icon: _making ? const SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.auto_awesome_outlined),
                  label: Text(l.quizMakeQuestions),
                ),
                if (_canSuggest)
                  OutlinedButton.icon(key: const Key('quiz-saved'), onPressed: _loadingSaved ? null : _loadSaved, icon: const Icon(Icons.inventory_2_outlined), label: Text(l.quizFromBank)),
                OutlinedButton.icon(key: const Key('quiz-add'), onPressed: () => setState(() => _editing = true), icon: const Icon(Icons.add), label: Text(l.quizAddQuestion)),
              ],
            ),
            if (_saved != null) ...[
              const SizedBox(height: Kx.s8),
              if (_saved!.isEmpty)
                Text(l.quizNoSuggestions, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant))
              else
                for (final (i, q) in _saved!.indexed)
                  CheckboxListTile(
                    key: Key('quiz-saved-$i'),
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    value: _has(q),
                    title: Text(q.question, maxLines: 2, overflow: TextOverflow.ellipsis),
                    subtitle: Text(q.options.join(' · '), maxLines: 1, overflow: TextOverflow.ellipsis),
                    onChanged: (v) => setState(() => v == true ? _questions.add(q) : _questions.removeWhere((x) => x.question == q.question)),
                  ),
            ],
            if (_editing) ...[const SizedBox(height: Kx.s12), _editor(context)],
            const SizedBox(height: Kx.s16),
            Text(l.quizQuestionCount(_questions.length), style: context.text.titleSmall),
            if (_questions.isEmpty) Text(l.quizNeedsQuestion, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
            for (final (i, q) in _questions.indexed)
              ListTile(
                key: Key('quiz-q-$i'),
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: CircleAvatar(radius: 14, child: Text('${i + 1}')),
                title: Text(q.question, maxLines: 2, overflow: TextOverflow.ellipsis),
                subtitle: Text([for (final (k, o) in q.options.indexed) k == q.correct ? '✓ $o' : o].join(' · '), maxLines: 1, overflow: TextOverflow.ellipsis),
                trailing: IconButton(key: Key('quiz-q-remove-$i'), tooltip: l.delete, icon: const Icon(Icons.delete_outline), onPressed: () => setState(() => _questions.removeAt(i))),
              ),
            const SizedBox(height: Kx.s16),
            Text(l.quizSeconds, style: context.text.titleSmall),
            const SizedBox(height: Kx.s8),
            SegmentedButton<int>(
              key: const Key('quiz-seconds'),
              showSelectedIcon: false,
              segments: [
                for (final s in quizSecondsChoices)
                  ButtonSegment(
                    value: s,
                    label: Text(l.quizSecondsValue(s), key: Key('quiz-seconds-$s')),
                  ),
              ],
              selected: {_seconds},
              onSelectionChanged: (s) => setState(() => _seconds = s.first),
            ),
            const SizedBox(height: Kx.s8),
            SwitchListTile(
              key: const Key('quiz-cards'),
              contentPadding: EdgeInsets.zero,
              value: _cards,
              title: Text(l.quizUseCards),
              subtitle: Text(l.quizUseCardsHint),
              onChanged: (v) => setState(() => _cards = v),
            ),
            if (!_online) Text(l.quizNotSaved, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(key: const Key('quiz-start-game'), onPressed: _questions.isEmpty ? null : _start, child: Text(l.quizStartGame)),
      ],
    );
  }

  /// Writing a question: the text, True / False or two to four answers, and the right one.
  Widget _editor(BuildContext context) {
    final l = context.l10n;
    final tf = _choices == 5;
    final count = tf ? 2 : _choices;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(Kx.s12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              key: const Key('quiz-edit-question'),
              controller: _text,
              decoration: InputDecoration(labelText: l.quizQuestionLabel),
            ),
            const SizedBox(height: Kx.s12),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: SegmentedButton<int>(
                key: const Key('quiz-edit-choices'),
                showSelectedIcon: false,
                segments: [
                  ButtonSegment(value: 5, label: Text(l.askTrueFalse, key: const Key('quiz-edit-tf'))),
                  const ButtonSegment(value: 2, label: Text('A–B')),
                  const ButtonSegment(value: 3, label: Text('A–C')),
                  const ButtonSegment(value: 4, label: Text('A–D')),
                ],
                selected: {_choices},
                onSelectionChanged: (s) => setState(() {
                  _choices = s.first;
                  if (_correct != null && _correct! >= (_choices == 5 ? 2 : _choices)) _correct = null;
                }),
              ),
            ),
            if (!tf)
              for (var i = 0; i < count; i++)
                TextField(
                  key: Key('quiz-edit-option-$i'),
                  controller: _options[i],
                  decoration: InputDecoration(hintText: l.quizOptionHint(answerLetters[i])),
                ),
            const SizedBox(height: Kx.s12),
            Text(l.quizRightAnswer, style: context.text.titleSmall),
            const SizedBox(height: Kx.s4),
            Wrap(
              spacing: Kx.s8,
              children: [
                for (var i = 0; i < count; i++)
                  ChoiceChip(
                    key: Key('quiz-edit-correct-$i'),
                    label: Text(tf ? (i == 0 ? l.pollTrue : l.pollFalse) : answerLetters[i]),
                    selected: _correct == i,
                    onSelected: (v) => setState(() => _correct = v ? i : null),
                  ),
              ],
            ),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton.tonal(key: const Key('quiz-edit-add'), onPressed: _addWritten, child: Text(l.quizAddThis)),
            ),
          ],
        ),
      ),
    );
  }
}
