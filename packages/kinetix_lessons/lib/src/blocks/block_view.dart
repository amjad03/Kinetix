import 'dart:async';

import 'package:flutter/material.dart';

import '../core/strings.dart';
import '../core/theme.dart';
import '../engine/lesson_controller.dart';
import '../engine/model.dart';
import '../engine/support.dart';
import 'activity/activity_view.dart';
import 'challenge_view.dart';
import 'embeds.dart';
import 'explainer_view.dart';
import 'interactive_view.dart';
import '../instruments/instruments.dart';
import 'lesson_cards.dart';
import 'math_text.dart';
import 'quick_check.dart';
import 'whiteboard_view.dart';

/// Draws the current block of [c] for the Classroom edition's lesson panel, on the Zynetix
/// layout canvas (put it in a [ZCanvas]). Ported from the Zynetix board's BlockView: the same
/// renderers, with the panel's own caption and Back/Next around it, quizzes as quick checks
/// the teacher reveals, and sims, labs and 3D from the board's Kinetix packages ([embeds]).
class LessonBlockView extends StatelessWidget {
  const LessonBlockView({super.key, required this.c, required this.embeds, required this.room, this.paper, this.whiteboardKey, this.video});
  final LessonController c;
  final Embeds embeds;
  final ClassRoom room;

  /// The whiteboard's light page colour (null: the dark chalkboard).
  final Color? paper;

  /// Lets the panel's Next walk a whiteboard's steps and Put on board copy them.
  final GlobalKey<WhiteboardViewState>? whiteboardKey;

  /// A concept video's card (it opens the video when online); null: a plain note.
  final Widget Function(VideoRef v, Lang lang)? video;

  @override
  Widget build(BuildContext context) {
    final b = c.current, l = c.lang;
    final text = Theme.of(context).textTheme;
    final narrow = context.narrow;
    final big = text.bodyLarge!.copyWith(fontSize: narrow ? 32 : 36, height: 1.55);
    Widget heading(String s) => Padding(
      padding: const EdgeInsets.only(bottom: 28),
      child: Text(s, style: zTitle(narrow ? 44 : 52)),
    );
    List<Widget> bullets(List<L10n> items, {IconData icon = Icons.check_circle_outline, TextStyle? style}) => [
      for (final p in items)
        Padding(
          padding: const EdgeInsets.only(bottom: 20),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(padding: const EdgeInsets.only(top: 6), child: Icon(icon, size: 40, color: Z.primary)),
              const SizedBox(width: 20),
              Expanded(child: MathText(p.t(l), style: style ?? big)),
            ],
          ),
        ),
    ];
    Widget staged(Widget main, {String? title}) => ZStage(
      title: title,
      padding: const EdgeInsets.all(16),
      child: ClipRRect(borderRadius: BorderRadius.circular(Z.panelRadius), child: main),
    );
    Widget supported(Widget Function() w) => embeds.supports(b) ? w() : KinetixEmbeds.missing(b.s('simId') ?? b.s('labId') ?? b.s('modelId') ?? b.id);
    Widget stepped(Widget Function(int shown, ValueChanged<int> reveal) build) => build(c.revealed, c.revealTo);
    final styled = b.cards.isNotEmpty || b.raw['hero'] is Map || b.reveal || b.speaker != null;
    final questions = c.pack.questionsFor(b.ids('questionIds'));

    final Widget? special = switch (b.type) {
      BlockType.intro || BlockType.concept when styled => stepped(
        (shown, reveal) => SteppedConcept(key: ValueKey('sc:${b.id}'), block: b, lang: l, shown: shown, lessonTitle: c.lesson.title.t(l), tag: blockLabel(b, l), onTap: () => reveal(shown + 1)),
      ),
      BlockType.trick when b.style == 'rule' => RuleCard(key: ValueKey('rule:${b.id}'), block: b, lang: l),
      BlockType.trick when b.style == 'trap' => TrapCard(key: ValueKey('trap:${b.id}'), block: b, lang: l),
      BlockType.classQuiz when b.style == 'pause' && questions.isNotEmpty => stepped(
        (shown, reveal) => PauseThinkView(key: ValueKey('think:${b.id}'), questions: questions, lang: l, shown: shown, onReveal: reveal, recorder: c.recorder),
      ),
      BlockType.pyq when b.style == 'solve' && questions.isNotEmpty => stepped(
        (shown, reveal) => ExamSolveView(
          key: ValueKey('solve:${b.id}'),
          question: questions.first,
          exams: b.ids('exams').isEmpty ? questions.first.exams : b.ids('exams'),
          lang: l,
          shown: shown,
          onReveal: reveal,
          recorder: c.recorder,
        ),
      ),
      BlockType.explainer => stepped((shown, reveal) => ExplainerView(key: ValueKey('ex:${b.id}'), block: b, lang: l, shown: shown, onReveal: reveal)),
      BlockType.conceptVideo => switch (VideoRef.maybe(b.raw['video'])) {
        final v? when video != null => video!(v, l),
        _ => ContentPanel(center: true, tag: blockName(b.type, l), child: Text(b.f('caption').t(l), style: big)),
      },
      BlockType.recap when b.style == 'recall' => stepped((shown, reveal) => RecallView(key: ValueKey('recall:${b.id}'), block: b, lang: l, shown: shown, onTap: () => reveal(shown + 1))),
      BlockType.example when b.reveal => ExampleView(key: ValueKey(b.id), block: b, lang: l, shown: c.revealed - 1, onShowNext: c.revealMore),
      _ => null,
    };
    if (special != null) return KeyedSubtree(key: ValueKey('block:${b.id}'), child: special);

    final Widget body = switch (b.type) {
      BlockType.intro => ContentPanel(
        center: true,
        tag: blockName(b.type, l),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(c.lesson.title.t(l), style: zText(30, FontWeight.w500).copyWith(color: Z.muted)),
            const SizedBox(height: 12),
            Text(b.f('heading').t(l), style: zTitle(narrow ? 52 : 68)),
            const SizedBox(height: 28),
            Text(b.f('hook').t(l), style: big.copyWith(fontSize: narrow ? 34 : 40)),
            if (b.list('objectives').isNotEmpty) ...[
              const SizedBox(height: 48),
              ZSectionTitle(tr('whatYouLearn', l), size: 34),
              const SizedBox(height: 24),
              ...bullets(b.list('objectives')),
            ],
          ],
        ),
      ),
      BlockType.concept => ContentPanel(
        tag: blockName(b.type, l),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            heading(b.title?.t(l) ?? ''),
            MathText(b.f('body').t(l), style: big),
            if (b.s('formula') != null) ...[const SizedBox(height: 36), Formula(b.s('formula')!)],
            const SizedBox(height: 36),
            ...bullets(b.list('points')),
          ],
        ),
      ),
      BlockType.model3d => staged(supported(() => embeds.model3d(b, l))),
      BlockType.simulation => staged(supported(() => embeds.simulation(b, l)), title: b.s('source') == 'phet' ? (b.title?.t(l) ?? blockName(b.type, l)) : null),
      BlockType.virtualLab => staged(supported(() => LabFrame(child: embeds.lab(b.s('labId')!, b.s('preset'), l)))),
      BlockType.example => ExampleView(key: ValueKey(b.id), block: b, lang: l),
      BlockType.classQuiz || BlockType.pyq => QuickCheckView(key: ValueKey('quiz:${b.id}'), questions: questions, lang: l, room: room, mode: b.type == BlockType.pyq ? QuizMode.monitor : b.quizMode, label: blockName(b.type, l), recorder: c.recorder),
      BlockType.trick => ContentPanel(
        center: true,
        tag: tr('trick', l),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            heading(b.f('heading').t(l)),
            MathText(b.f('body').t(l), style: big.copyWith(fontSize: narrow ? 34 : 40)),
            if (b.s('formula') != null) ...[const SizedBox(height: 36), Formula(b.s('formula')!)],
            if (b.maybe('mnemonic') != null) ...[
              const SizedBox(height: 36),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 44, vertical: 36),
                decoration: BoxDecoration(color: Z.tile, borderRadius: BorderRadius.circular(Z.radius)),
                child: Text('“${b.maybe('mnemonic')!.t(l)}”', style: zTitle(narrow ? 36 : 42, FontWeight.w500)),
              ),
            ],
          ],
        ),
      ),
      BlockType.whiteboard => WhiteboardView(key: whiteboardKey ?? ValueKey('wb:${b.id}'), c: c, block: b, compact: true, paper: paper),
      BlockType.interactive when b.s('kind') == 'instrument' => InstrumentBlockView(key: ValueKey('ins:${b.id}'), raw: b.raw),
      BlockType.interactive => InteractiveView(key: ValueKey('ia:${b.id}'), block: b, lang: l),
      BlockType.challenge => ChallengeView(key: ValueKey('ch:${b.id}'), block: b, lang: l, room: room, recorder: c.recorder),
      BlockType.activity => ActivityView(key: ValueKey('act:${b.id}'), block: b, lang: l, recorder: c.recorder),
      BlockType.explainer || BlockType.conceptVideo => const SizedBox.shrink(),
      BlockType.recap => ContentPanel(
        tag: tr('recap', l),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ...bullets(b.list('points')),
            if (b.list('homework').isNotEmpty || b.ids('homeworkQuestionIds').isNotEmpty) ...[
              const SizedBox(height: 36),
              ZSectionTitle(tr('homework', l), size: 36),
              const SizedBox(height: 24),
              ...bullets(b.list('homework'), icon: Icons.edit_note),
              for (final q in c.pack.questionsFor(b.ids('homeworkQuestionIds'))) ...bullets([q.stem], icon: Icons.edit_note),
            ],
          ],
        ),
      ),
    };
    return KeyedSubtree(key: ValueKey('block:${b.id}'), child: body);
  }
}

/// A worked example: the problem, then one step at a time (tap, or by itself in Self-Learning).
class ExampleView extends StatefulWidget {
  const ExampleView({super.key, required this.block, required this.lang, this.auto = false, this.stepEvery = const Duration(seconds: 8), this.shown, this.onShowNext});
  final Block block;
  final Lang lang;
  final bool auto;
  final Duration stepEvery;

  /// Steps shown, when the lesson's Next drives them (a `reveal` block); else its own button.
  final int? shown;
  final VoidCallback? onShowNext;
  @override
  State<ExampleView> createState() => _ExampleViewState();
}

class _ExampleViewState extends State<ExampleView> {
  int _shown = 0;
  int get shown => widget.shown ?? _shown;
  set shown(int v) => _shown = v;
  Timer? _t;

  List<L10n> get steps => widget.block.list('steps');
  bool get all => shown > steps.length; // steps, then the answer

  @override
  void initState() {
    super.initState();
    if (widget.auto) _t = Timer.periodic(widget.stepEvery, (_) => all ? _t?.cancel() : setState(() => shown++));
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = widget.lang, narrow = context.narrow;
    final body = Theme.of(context).textTheme.bodyLarge!.copyWith(fontSize: narrow ? 32 : 36, height: 1.55);
    return ContentPanel(
      tag: blockName(BlockType.example, l),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          MathText(widget.block.f('problem').t(l), style: zTitle(narrow ? 38 : 44, FontWeight.w500).copyWith(height: 1.4)),
          const SizedBox(height: 40),
          for (var i = 0; i < shown && i < steps.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 24),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 64,
                    height: 64,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: i == shown - 1 && !all ? Z.primary : Z.segTrack, shape: BoxShape.circle),
                    child: Text('${i + 1}', style: zText(28, FontWeight.w600).copyWith(color: i == shown - 1 && !all ? Colors.white : Z.ink2)),
                  ),
                  const SizedBox(width: 24),
                  Expanded(child: Padding(padding: const EdgeInsets.only(top: 4), child: MathText(steps[i].t(l), style: body))),
                ],
              ),
            ),
          if (all)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 28),
              decoration: BoxDecoration(color: Z.correctBg, borderRadius: BorderRadius.circular(Z.radius)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(tr('answer', l), style: zText(26, FontWeight.w500).copyWith(color: Z.correctLabel)),
                  const SizedBox(height: 4),
                  MathText(widget.block.f('answer').t(l), style: zText(narrow ? 36 : 44, FontWeight.w600).copyWith(color: Z.correct)),
                ],
              ),
            )
          else if (!widget.auto)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: BigButton(icon: Icons.expand_more, label: tr('showStep', l), filled: false, onPressed: widget.onShowNext ?? () => setState(() => shown++)),
            ),
        ],
      ),
    );
  }
}
