import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/models.dart';
import '../../widgets/common.dart';
import 'ask_controller.dart';
import 'topic_screen.dart';

/// "Ask a doubt": the question box with language (and subject) choice, then the answer and the
/// earlier questions of this session. Scrolls as one list.
class AskView extends StatefulWidget {
  const AskView({super.key, required this.controller, this.subjects, this.header});

  final AskController controller;

  /// The class's subjects, offered as context chips when known.
  final List<Subject>? subjects;

  /// Shown above the question box (e.g. an intro line).
  final Widget? header;

  @override
  State<AskView> createState() => _AskViewState();
}

class _AskViewState extends State<AskView> {
  final _answerKey = GlobalKey();
  AskTurn? _shown;
  bool _shownLoading = false;

  AskController get controller => widget.controller;

  @override
  void initState() {
    super.initState();
    _shown = controller.current;
    _shownLoading = _shown?.loading ?? false;
    controller.addListener(_changed);
  }

  @override
  void didUpdateWidget(AskView old) {
    super.didUpdateWidget(old);
    if (old.controller != controller) {
      old.controller.removeListener(_changed);
      controller.addListener(_changed);
    }
  }

  @override
  void dispose() {
    controller.removeListener(_changed);
    super.dispose();
  }

  /// A new question (or an earlier one shown again), and again once its answer arrives: bring
  /// the answer into view, since on a phone it starts below the question box. (While it is
  /// still "thinking" the card is short, so the list may not scroll far enough yet.)
  void _changed() {
    final turn = controller.current;
    final loading = turn?.loading ?? false;
    final isNew = !identical(turn, _shown);
    if (!isNew && loading == _shownLoading) return;
    _shown = turn;
    _shownLoading = loading;
    if (isNew) FocusManager.instance.primaryFocus?.unfocus();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ctx = _answerKey.currentContext;
      if (ctx != null && ctx.mounted) {
        Scrollable.ensureVisible(ctx, duration: const Duration(milliseconds: 300), curve: Curves.easeOutCubic);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final turn = controller.current;
        return LayoutBuilder(
          builder: (context, box) => ListView(
            key: const Key('askList'),
            padding: EdgeInsets.fromLTRB(sideGutter(box.maxWidth), Kx.s16, sideGutter(box.maxWidth), Kx.s32),
            children: [
              ?widget.header,
              _Composer(controller: controller, subjects: widget.subjects),
              if (turn != null)
                // The gap is inside the key so scrolling to the answer leaves a little air above it.
                Padding(
                  key: _answerKey,
                  padding: const EdgeInsets.only(top: Kx.s16),
                  child: AnswerCard(turn: turn, controller: controller),
                ),
              if (controller.history.isNotEmpty) ...[
                const SizedBox(height: Kx.s24),
                Text('Earlier questions', style: context.text.titleSmall?.copyWith(color: context.colors.primary)),
                const SizedBox(height: Kx.s4),
                for (final (i, t) in controller.history.indexed)
                  ListTile(
                    key: Key('history-$i'),
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.history),
                    title: Text(t.question.question, maxLines: 2, overflow: TextOverflow.ellipsis),
                    subtitle: Text(t.question.language.label),
                    onTap: () => controller.show(t),
                  ),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({required this.controller, this.subjects});

  final AskController controller;
  final List<Subject>? subjects;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final topic = controller.topic;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(Icons.auto_awesome, color: c.primary, size: 20),
                const SizedBox(width: Kx.s8),
                Expanded(
                  child: Text('Ask a doubt', style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w500)),
                ),
              ],
            ),
            const SizedBox(height: Kx.s4),
            Text(
              'KINETIX AI explains it step by step, following your syllabus.',
              style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
            ),
            const SizedBox(height: Kx.s12),
            if (topic != null) ...[
              Align(
                alignment: Alignment.centerLeft,
                child: InputChip(
                  key: const Key('topicContext'),
                  avatar: const Icon(Icons.menu_book_outlined, size: 18),
                  label: Text('About: ${topic.title}', maxLines: 1, overflow: TextOverflow.ellipsis),
                  onDeleted: controller.clearTopic,
                  deleteButtonTooltipMessage: 'Ask about anything',
                ),
              ),
              const SizedBox(height: Kx.s8),
            ],
            TextField(
              key: const Key('question'),
              controller: controller.input,
              minLines: 2,
              maxLines: 5,
              maxLength: 1000,
              textInputAction: TextInputAction.newline,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(hintText: 'e.g. What is forfeiture of shares?', counterText: ''),
            ),
            const SizedBox(height: Kx.s12),
            Text('Answer in', style: context.text.labelLarge?.copyWith(color: c.onSurfaceVariant)),
            const SizedBox(height: Kx.s4),
            Wrap(
              spacing: Kx.s8,
              runSpacing: Kx.s4,
              children: [
                for (final l in AiLanguage.values)
                  ChoiceChip(
                    key: Key('lang-${l.name}'),
                    label: Text(l.label),
                    tooltip: l.englishName,
                    selected: controller.language == l,
                    onSelected: (_) => controller.setLanguage(l),
                  ),
              ],
            ),
            if (topic == null && (subjects?.isNotEmpty ?? false)) ...[
              const SizedBox(height: Kx.s12),
              Text('Subject', style: context.text.labelLarge?.copyWith(color: c.onSurfaceVariant)),
              const SizedBox(height: Kx.s4),
              Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s4,
                children: [
                  ChoiceChip(
                    key: const Key('subject-any'),
                    label: const Text('Any'),
                    selected: controller.subject == null,
                    onSelected: (_) => controller.setSubject(null),
                  ),
                  for (final s in subjects!)
                    ChoiceChip(
                      key: Key('subject-${s.id}'),
                      label: Text(s.name),
                      selected: controller.subject?.id == s.id,
                      onSelected: (_) => controller.setSubject(s),
                    ),
                ],
              ),
            ],
            const SizedBox(height: Kx.s16),
            ValueListenableBuilder(
              valueListenable: controller.input,
              builder: (context, value, _) => Align(
                alignment: Alignment.centerRight,
                child: FilledButton.icon(
                  key: const Key('askButton'),
                  onPressed: controller.busy || value.text.trim().length < 2 ? null : () => controller.ask(),
                  icon: const Icon(Icons.send),
                  label: const Text('Ask'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The answer to one question: loading, an error with what to do, or the explanation with key
/// points, the topics it was based on and follow-up questions. A preview answer (no AI server
/// connected) says so plainly.
class AnswerCard extends StatelessWidget {
  const AnswerCard({super.key, required this.turn, required this.controller});

  final AskTurn turn;
  final AskController controller;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final q = turn.question;
    final answer = turn.answer;
    final error = turn.error;

    final question = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('You asked', style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant)),
        const SizedBox(height: 2),
        Text(q.question, key: const Key('askedQuestion'), style: context.text.titleMedium),
        const SizedBox(height: Kx.s4),
        Wrap(
          spacing: Kx.s8,
          runSpacing: Kx.s4,
          children: [
            Pill(q.language.label, icon: Icons.translate, background: c.secondaryContainer, foreground: c.onSecondaryContainer),
            if (q.topic != null)
              Pill(q.topic!.title, icon: Icons.menu_book_outlined, background: c.secondaryContainer, foreground: c.onSecondaryContainer)
            else if (q.subject != null)
              Pill(q.subject!.name, icon: Icons.class_outlined, background: c.secondaryContainer, foreground: c.onSecondaryContainer),
          ],
        ),
      ],
    );

    final List<Widget> body;
    if (error != null) {
      final e = describeAiError(error);
      final soft = !e.retry;
      final (bg, fg) = soft ? (Tone.warnContainer(context), Tone.warn(context)) : (c.errorContainer, c.onErrorContainer);
      body = [
        Container(
          key: const Key('aiError'),
          padding: const EdgeInsets.all(Kx.s12),
          decoration: BoxDecoration(color: bg, borderRadius: Kx.radiusMd),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(e.icon, color: fg, size: 20),
              const SizedBox(width: Kx.s12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(e.title, style: context.text.titleSmall?.copyWith(color: fg)),
                    const SizedBox(height: 2),
                    Text(e.message, style: context.text.bodyMedium?.copyWith(color: soft ? c.onSurface : fg)),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (e.retry)
          Align(
            alignment: Alignment.centerRight,
            child: Padding(
              padding: const EdgeInsets.only(top: Kx.s8),
              child: TextButton.icon(
                key: const Key('aiRetry'),
                onPressed: controller.retry,
                icon: const Icon(Icons.refresh),
                label: const Text('Try again'),
              ),
            ),
          ),
      ];
    } else if (answer == null) {
      body = [
        const ClipRRect(
          borderRadius: Kx.radiusSm,
          child: LinearProgressIndicator(key: Key('aiThinking')),
        ),
        const SizedBox(height: Kx.s8),
        Text('KINETIX AI is thinking…', style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
      ];
    } else {
      body = [
        if (answer.preview) ...[const _PreviewNotice(), const SizedBox(height: Kx.s12)],
        SelectableText(answer.answer, key: const Key('answerText'), style: context.text.bodyLarge?.copyWith(height: 1.5)),
        if (answer.keyPoints.isNotEmpty) ...[
          const SizedBox(height: Kx.s16),
          Text('Key points', style: context.text.titleSmall),
          const SizedBox(height: Kx.s4),
          for (final p in answer.keyPoints) BulletLine(p, icon: Icons.check_circle_outline),
        ],
        if (answer.sources.isNotEmpty) ...[
          const SizedBox(height: Kx.s16),
          Text('Based on', style: context.text.labelLarge?.copyWith(color: c.onSurfaceVariant)),
          const SizedBox(height: Kx.s4),
          Wrap(
            spacing: Kx.s8,
            runSpacing: Kx.s4,
            children: [
              for (final s in answer.sources)
                ActionChip(
                  key: Key('source-${s.id}'),
                  avatar: Icon(Icons.menu_book_outlined, size: 18, color: c.primary),
                  label: Text(s.title),
                  tooltip: 'Open the topic notes',
                  onPressed: () => TopicScreen.open(context, controller.api, s.id, controller: controller),
                ),
            ],
          ),
        ],
        if (answer.followUps.isNotEmpty) ...[
          const SizedBox(height: Kx.s16),
          Text('Ask next', style: context.text.labelLarge?.copyWith(color: c.onSurfaceVariant)),
          const SizedBox(height: Kx.s4),
          // Rows rather than chips: follow-up questions are often long and should wrap.
          for (final (i, f) in answer.followUps.indexed)
            Padding(
              padding: const EdgeInsets.only(bottom: Kx.s8),
              child: Material(
                shape: RoundedRectangleBorder(
                  borderRadius: Kx.radiusSm,
                  side: BorderSide(color: c.outlineVariant),
                ),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  key: Key('followUp-$i'),
                  onTap: () => controller.ask(f),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: Kx.target),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: Kx.s12, vertical: Kx.s8),
                      child: Row(
                        children: [
                          Icon(Icons.subdirectory_arrow_right, size: 18, color: c.primary),
                          const SizedBox(width: Kx.s8),
                          Expanded(child: Text(f, style: context.text.bodyMedium)),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
        const SizedBox(height: Kx.s16),
        Text(
          'KINETIX AI can make mistakes. Check important answers with your teacher or textbook.',
          style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
        ),
      ];
    }

    return Card(
      key: const Key('answerCard'),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            question,
            const Divider(height: Kx.s24),
            ...body,
          ],
        ),
      ),
    );
  }
}

class _PreviewNotice extends StatelessWidget {
  const _PreviewNotice();

  @override
  Widget build(BuildContext context) {
    final fg = Tone.warn(context);
    return Container(
      key: const Key('previewNotice'),
      padding: const EdgeInsets.all(Kx.s12),
      decoration: BoxDecoration(color: Tone.warnContainer(context), borderRadius: Kx.radiusMd),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.science_outlined, color: fg, size: 20),
          const SizedBox(width: Kx.s12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Preview answer', style: context.text.titleSmall?.copyWith(color: fg)),
                const SizedBox(height: 2),
                Text(
                  "KINETIX AI isn't connected at your college yet, so this is a sample, not a real explanation.",
                  style: context.text.bodyMedium,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
