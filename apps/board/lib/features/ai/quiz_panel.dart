import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../board/chrome.dart';
import 'ai_controller.dart';
import 'ai_widgets.dart';
import 'homework_panel.dart';

const quizAccent = Color(0xFF81C995);
const _correct = Color(0xFF188038);

String optionLetter(int i) => String.fromCharCode(65 + i);

/// Quick quiz: generate multiple-choice questions on a topic, review the draft, then present
/// them to the class one at a time or send them as homework.
class QuizPanel extends StatefulWidget {
  const QuizPanel({super.key, required this.ai, this.onBack});

  final AiController ai;
  final VoidCallback? onBack;

  @override
  State<QuizPanel> createState() => _QuizPanelState();
}

class _QuizPanelState extends State<QuizPanel> {
  late final _topic = TextEditingController(text: widget.ai.quizTopic ?? widget.ai.defaultTopic);

  AiController get ai => widget.ai;

  @override
  void dispose() {
    _topic.dispose();
    super.dispose();
  }

  void _generate({bool fresh = false}) {
    if (!ai.canUseAi) {
      showBoardMessage(context, context.l10n.quizNeedsSignIn);
      return;
    }
    if (_topic.text.trim().length < 2) {
      showBoardMessage(context, context.l10n.quizTypeTopic);
      return;
    }
    FocusScope.of(context).unfocus();
    ai.generateQuiz(_topic.text, fresh: fresh);
  }

  Future<void> _sendAsHomework(Quiz quiz) async {
    // Homework goes out in the quiz's language.
    final l = ai.contentL10n;
    final sent = await showSendHomeworkDialog(context, ai: ai, title: l.quizTitle(quiz.topic), instructions: quizAsHomework(quiz, l));
    if (sent && mounted) showHomeworkSent(context, ai);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AiPanelPage(
      ai: ai,
      icon: Icons.quiz_outlined,
      title: l.aiQuickQuiz,
      accent: quizAccent,
      onBack: widget.onBack,
      child: ListenableBuilder(
        listenable: Listenable.merge([ai, ai.quiz]),
        builder: (context, _) {
          final task = ai.quiz;
          final quiz = task.value?.result;
          return ListView(
            padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s8, Kx.s24, Kx.s24),
            children: [
              if (!ai.canUseAi) ...[const AiSignInNotice(), const SizedBox(height: Kx.s16)],
              TextField(
                key: const Key('quiz-topic'),
                controller: _topic,
                style: const TextStyle(fontSize: 18),
                decoration: InputDecoration(labelText: l.topicLabel, hintText: l.quizTopicHint),
                textInputAction: TextInputAction.go,
                onSubmitted: (_) => _generate(),
              ),
              const SizedBox(height: Kx.s12),
              Wrap(
                spacing: Kx.s16,
                runSpacing: Kx.s8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  NumberPicker(
                    label: l.questionsLabel,
                    value: ai.quizCount,
                    options: const [3, 5, 8, 10, 15, 20],
                    onChanged: (v) => setState(() => ai.quizCount = v),
                  ),
                  DifficultyPicker(value: ai.quizDifficulty, onChanged: (v) => setState(() => ai.quizDifficulty = v)),
                ],
              ),
              const SizedBox(height: Kx.s16),
              Align(
                alignment: Alignment.centerLeft,
                child: FilledButton.icon(
                  key: const Key('quiz-generate'),
                  onPressed: task.loading ? null : _generate,
                  icon: const Icon(Icons.auto_awesome),
                  label: Text(quiz == null ? l.quizMake : l.quizMakeNew),
                ),
              ),
              const SizedBox(height: Kx.s16),
              if (task.loading) AiLoading(label: l.writingQuestions(ai.quizCount)),
              if (task.error != null) AiError(message: aiErrorMessage(l, task.error!), onRetry: _generate),
              if (quiz != null && !task.loading) ...[
                const Divider(height: Kx.s32),
                if (task.value!.meta.preview) ...[AiNotice.preview(offline: task.value!.meta.offline), const SizedBox(height: Kx.s16)],
                Text(l.quizHeader(quiz.questions.length, quiz.topic), style: context.text.titleLarge),
                const SizedBox(height: Kx.s4),
                Text(l.quizDraftNote, style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
                const SizedBox(height: Kx.s12),
                Wrap(
                  spacing: Kx.s8,
                  runSpacing: Kx.s8,
                  children: [
                    FilledButton.icon(
                      key: const Key('quiz-present'),
                      onPressed: () => showQuizPresenter(context, quiz, preview: task.value!.meta.preview),
                      icon: const Icon(Icons.slideshow),
                      label: Text(l.quizPresent),
                    ),
                    OutlinedButton.icon(
                      key: const Key('quiz-regenerate'),
                      onPressed: () => _generate(fresh: true),
                      icon: const Icon(Icons.refresh),
                      label: Text(l.regenerate),
                    ),
                    OutlinedButton.icon(
                      key: const Key('quiz-homework'),
                      onPressed: () => _sendAsHomework(quiz),
                      icon: const Icon(Icons.assignment_outlined),
                      label: Text(l.sendAsHomework),
                    ),
                  ],
                ),
                const SizedBox(height: Kx.s16),
                for (var i = 0; i < quiz.questions.length; i++) _QuestionCard(number: i + 1, q: quiz.questions[i]),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _QuestionCard extends StatelessWidget {
  const _QuestionCard({required this.number, required this.q});

  final int number;
  final QuizQuestion q;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      margin: const EdgeInsets.only(bottom: Kx.s12),
      padding: const EdgeInsets.all(Kx.s16),
      decoration: BoxDecoration(color: c.surfaceContainer, borderRadius: BorderRadius.circular(Kx.rLg)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$number. ${q.question}', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w500, height: 1.35)),
          const SizedBox(height: Kx.s8),
          for (var o = 0; o < q.options.length; o++)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(shape: BoxShape.circle, color: o == q.answer ? _correct : c.surfaceContainerHighest),
                    child: o == q.answer
                        ? const Icon(Icons.check, size: 18, color: Colors.white)
                        : Text(
                            optionLetter(o),
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.onSurfaceVariant),
                          ),
                  ),
                  const SizedBox(width: Kx.s12),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(top: 3),
                      child: Text(q.options[o], style: TextStyle(fontSize: 17, fontWeight: o == q.answer ? FontWeight.w600 : FontWeight.w400)),
                    ),
                  ),
                ],
              ),
            ),
          if (q.explanation.isNotEmpty) ...[
            const SizedBox(height: Kx.s8),
            Text(
              context.l10n.quizAnswerExplanation(optionLetter(q.answer), q.explanation),
              style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
            ),
          ],
        ],
      ),
    );
  }
}

/// Opens the quiz full screen over the board.
Future<void> showQuizPresenter(BuildContext context, Quiz quiz, {bool preview = false}) => showDialog<void>(
  context: context,
  useSafeArea: false,
  barrierDismissible: false,
  builder: (_) => BoardChromeTheme(
    child: Dialog.fullscreen(
      child: QuizPresenter(quiz: quiz, preview: preview),
    ),
  ),
);

/// One question at a time, big enough to read from the back row. Reveal shows the answer.
class QuizPresenter extends StatefulWidget {
  const QuizPresenter({super.key, required this.quiz, this.preview = false});

  final Quiz quiz;
  final bool preview;

  @override
  State<QuizPresenter> createState() => _QuizPresenterState();
}

class _QuizPresenterState extends State<QuizPresenter> {
  var _index = 0;
  final _revealed = <int>{};

  List<QuizQuestion> get _qs => widget.quiz.questions;
  bool get _shown => _revealed.contains(_index);

  void _go(int d) => setState(() => _index = (_index + d).clamp(0, _qs.length - 1));
  void _reveal() => setState(() => _shown ? _revealed.remove(_index) : _revealed.add(_index));

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final q = _qs[_index];
    final last = _index == _qs.length - 1;
    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.arrowRight): () => _go(1),
        const SingleActivator(LogicalKeyboardKey.arrowLeft): () => _go(-1),
        const SingleActivator(LogicalKeyboardKey.space): _reveal,
      },
      child: Focus(
        autofocus: true,
        child: LayoutBuilder(
          builder: (context, box) {
            final scale = (box.maxWidth / 1920 < box.maxHeight / 1080 ? box.maxWidth / 1920 : box.maxHeight / 1080).clamp(0.55, 1.4);
            // A phone: the preview mark shrinks to an icon, the arrows to icon buttons.
            final narrow = box.maxWidth < 600;
            return ColoredBox(
              color: c.surface,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: EdgeInsets.fromLTRB(32 * scale, 20 * scale, 20 * scale, 12 * scale),
                    child: Row(
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(color: quizAccent.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(Kx.rMd)),
                          child: const Icon(Icons.quiz_outlined, color: quizAccent),
                        ),
                        const SizedBox(width: Kx.s16),
                        Expanded(
                          child: Text(
                            widget.quiz.topic,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: context.text.titleLarge?.copyWith(color: c.onSurfaceVariant),
                          ),
                        ),
                        if (widget.preview && narrow)
                          Padding(
                            padding: const EdgeInsets.only(right: Kx.s8),
                            child: Tooltip(message: context.l10n.aiPreview, child: Icon(Icons.science_outlined, color: c.onTertiaryContainer)),
                          )
                        else if (widget.preview)
                          Padding(
                            padding: const EdgeInsets.only(right: Kx.s16),
                            child: Chip(
                              avatar: Icon(Icons.science_outlined, size: 18, color: c.onTertiaryContainer),
                              label: Text(context.l10n.aiPreview, style: TextStyle(color: c.onTertiaryContainer)),
                              backgroundColor: c.tertiaryContainer,
                              side: BorderSide.none,
                            ),
                          ),
                        Text(context.l10n.questionOf(_index + 1, _qs.length), key: const Key('presenter-count'), style: narrow ? context.text.titleMedium : context.text.titleLarge),
                        SizedBox(width: narrow ? Kx.s8 : Kx.s16),
                        IconButton.filledTonal(
                          key: const Key('presenter-close'),
                          tooltip: context.l10n.close,
                          iconSize: 28,
                          onPressed: () => Navigator.of(context).pop(),
                          icon: const Icon(Icons.close),
                        ),
                      ],
                    ),
                  ),
                  LinearProgressIndicator(value: (_index + 1) / _qs.length, minHeight: 4, color: quizAccent),
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.fromLTRB(64 * scale, 32 * scale, 64 * scale, 16 * scale),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Expanded(
                            flex: 3,
                            child: FitText(
                              q.question,
                              key: ValueKey('presenter-question-$_index'),
                              maxSize: 52 * scale,
                              minSize: 20,
                              style: TextStyle(fontWeight: FontWeight.w500, color: c.onSurface, height: 1.25),
                            ),
                          ),
                          SizedBox(height: 16 * scale),
                          Expanded(
                            flex: 5,
                            child: Column(
                              children: [
                                for (final row in [
                                  [0, 1],
                                  [2, 3],
                                ])
                                  Expanded(
                                    child: Row(
                                      crossAxisAlignment: CrossAxisAlignment.stretch,
                                      children: [
                                        for (final o in row)
                                          if (o < q.options.length)
                                            Expanded(
                                              child: Padding(
                                                padding: EdgeInsets.all(8 * scale),
                                                child: _OptionCell(
                                                  letter: optionLetter(o),
                                                  text: q.options[o],
                                                  scale: scale,
                                                  state: !_shown ? _Opt.idle : (o == q.answer ? _Opt.correct : _Opt.dimmed),
                                                  onTap: _reveal,
                                                ),
                                              ),
                                            ),
                                      ],
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          if (_shown && q.explanation.isNotEmpty)
                            Container(
                              key: const Key('presenter-explanation'),
                              margin: EdgeInsets.only(top: 12 * scale),
                              padding: EdgeInsets.all(20 * scale),
                              decoration: BoxDecoration(color: _correct.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(Kx.rLg)),
                              child: Row(
                                children: [
                                  Icon(Icons.lightbulb_outline, color: c.onSurface, size: 32 * scale),
                                  SizedBox(width: 16 * scale),
                                  Expanded(
                                    child: Text(
                                      context.l10n.quizAnswerExplanation(optionLetter(q.answer), q.explanation),
                                      maxLines: 3,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(fontSize: 28 * scale, height: 1.3, color: c.onSurface),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  Padding(padding: EdgeInsets.fromLTRB(32 * scale, 8, 32 * scale, 24 * scale), child: _bottomBar(context, scale, last, narrow: narrow)),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _bottomBar(BuildContext context, double scale, bool last, {bool narrow = false}) {
    final c = context.colors;
    final l = context.l10n;
    if (narrow) {
      return Row(
        children: [
          IconButton.outlined(
            key: const Key('presenter-previous'),
            tooltip: l.toolPrevious,
            style: IconButton.styleFrom(minimumSize: const Size.square(Kx.boardTarget)),
            onPressed: _index == 0 ? null : () => _go(-1),
            icon: const Icon(Icons.chevron_left),
          ),
          const SizedBox(width: Kx.s8),
          Expanded(
            child: FilledButton.icon(
              key: const Key('presenter-reveal'),
              style: FilledButton.styleFrom(
                backgroundColor: _shown ? c.secondaryContainer : _correct,
                foregroundColor: _shown ? c.onSecondaryContainer : Colors.white,
                minimumSize: const Size(0, Kx.boardTarget),
              ),
              onPressed: _reveal,
              icon: Icon(_shown ? Icons.visibility_off_outlined : Icons.visibility_outlined),
              label: Text(_shown ? l.hideAnswer : l.revealAnswer, maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
          ),
          const SizedBox(width: Kx.s8),
          IconButton.filledTonal(
            key: const Key('presenter-next'),
            tooltip: last ? l.finish : l.toolNext,
            style: IconButton.styleFrom(minimumSize: const Size.square(Kx.boardTarget)),
            onPressed: last ? () => Navigator.of(context).pop() : () => _go(1),
            icon: Icon(last ? Icons.done : Icons.chevron_right),
          ),
        ],
      );
    }
    // Large buttons: the teacher taps them standing at the board.
    final size = Size(176 * scale, 64 * scale < Kx.boardTarget ? Kx.boardTarget : 64 * scale);
    final text = TextStyle(fontSize: (22 * scale).clamp(16, 26), fontWeight: FontWeight.w500);
    final padding = EdgeInsets.symmetric(horizontal: 28 * scale);
    final iconSize = (28 * scale).clamp(20.0, 32.0);
    return Row(
      children: [
        OutlinedButton.icon(
          key: const Key('presenter-previous'),
          style: OutlinedButton.styleFrom(minimumSize: size, textStyle: text, padding: padding, iconSize: iconSize),
          onPressed: _index == 0 ? null : () => _go(-1),
          icon: const Icon(Icons.chevron_left),
          label: Text(l.toolPrevious),
        ),
        const Spacer(),
        FilledButton.icon(
          key: const Key('presenter-reveal'),
          style: FilledButton.styleFrom(
            backgroundColor: _shown ? c.secondaryContainer : _correct,
            foregroundColor: _shown ? c.onSecondaryContainer : Colors.white,
            minimumSize: size,
            textStyle: text,
            padding: padding,
            iconSize: iconSize,
          ),
          onPressed: _reveal,
          icon: Icon(_shown ? Icons.visibility_off_outlined : Icons.visibility_outlined),
          label: Text(_shown ? l.hideAnswer : l.revealAnswer),
        ),
        const Spacer(),
        FilledButton.tonalIcon(
          key: const Key('presenter-next'),
          style: FilledButton.styleFrom(minimumSize: size, textStyle: text, padding: padding, iconSize: iconSize),
          onPressed: last ? () => Navigator.of(context).pop() : () => _go(1),
          iconAlignment: IconAlignment.end,
          icon: Icon(last ? Icons.done : Icons.chevron_right),
          label: Text(last ? l.finish : l.toolNext),
        ),
      ],
    );
  }
}

enum _Opt { idle, correct, dimmed }

class _OptionCell extends StatelessWidget {
  const _OptionCell({required this.letter, required this.text, required this.scale, required this.state, required this.onTap});

  final String letter;
  final String text;
  final double scale;
  final _Opt state;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final correct = state == _Opt.correct;
    return AnimatedOpacity(
      duration: const Duration(milliseconds: 200),
      opacity: state == _Opt.dimmed ? 0.4 : 1,
      child: Material(
        color: correct ? _correct.withValues(alpha: 0.28) : c.surfaceContainerHigh,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Kx.rLg),
          side: BorderSide(color: correct ? _correct : c.outlineVariant, width: correct ? 3 : 1),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(Kx.rLg),
          onTap: onTap,
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: 24 * scale, vertical: 12 * scale),
            child: Row(
              children: [
                Container(
                  width: 64 * scale,
                  height: 64 * scale,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(shape: BoxShape.circle, color: correct ? _correct : c.primaryContainer),
                  child: correct
                      ? Icon(Icons.check, color: Colors.white, size: 36 * scale)
                      : Text(
                          letter,
                          style: TextStyle(fontSize: 30 * scale, fontWeight: FontWeight.w700, color: c.onPrimaryContainer),
                        ),
                ),
                SizedBox(width: 24 * scale),
                Expanded(
                  child: FitText(
                    text,
                    maxSize: 36 * scale,
                    minSize: 16,
                    style: TextStyle(color: c.onSurface, height: 1.2),
                    center: true,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Text at the largest size (between [minSize] and [maxSize]) that fits the space it is given.
class FitText extends StatelessWidget {
  const FitText(this.text, {super.key, required this.maxSize, required this.minSize, required this.style, this.center = false});

  final String text;
  final double maxSize;
  final double minSize;
  final TextStyle style;

  /// Centre vertically in the space (options); otherwise sit at the top (questions).
  final bool center;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, box) {
        final base = DefaultTextStyle.of(context).style.merge(style);
        var size = maxSize;
        while (size > minSize) {
          final tp = TextPainter(
            text: TextSpan(
              text: text,
              style: base.copyWith(fontSize: size),
            ),
            textDirection: Directionality.of(context),
            textScaler: MediaQuery.textScalerOf(context),
          )..layout(maxWidth: box.maxWidth);
          final fits = tp.height <= box.maxHeight;
          tp.dispose();
          if (fits) break;
          size -= 2;
        }
        return Align(
          alignment: center ? Alignment.centerLeft : Alignment.topLeft,
          child: Text(
            text,
            style: base.copyWith(fontSize: size),
            overflow: TextOverflow.fade,
          ),
        );
      },
    );
  }
}
