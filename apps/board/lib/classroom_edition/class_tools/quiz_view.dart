import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../ui/ce_style.dart';
import 'bank.dart';
import 'class_logic.dart';
import 'tool_ui.dart';
import '../l10n/ce_strings.dart';

/// A class quiz with its questions chosen already (a past paper's, `past_papers/`): no setup,
/// its own title, the paper's pictures on the board and the exam's marking per roll number.
class PresetQuiz {
  const PresetQuiz({required this.title, required this.questions, this.line = '', this.topicTitles = const {}, this.picture, this.score, this.scoreLine = '', this.onFinish, this.backTo, this.backArg});

  /// "NEET 2023 · class quiz".
  final String title;
  final List<BankQuestion> questions;

  /// Under the summary's title ("NEET 2023 · Electrostatics").
  final String line;

  /// The record's topic title by question id (its chapter tag).
  final Map<String, String> topicTitles;

  /// The question's picture, put on the board above its options.
  final Future<Uint8List?> Function(BankQuestion q)? picture;

  /// Marks for a right ([right] true) or wrong answer under the exam's marking.
  final double Function(BankQuestion q, bool right)? score;

  /// "NEET marking: +4 right, −1 wrong".
  final String scoreLine;

  /// Called with each present roll number's total when the quiz ends.
  final Future<void> Function(Map<int, double> totals)? onFinish;

  /// The tool (and its argument) the back arrow returns to, else the hub.
  final String? backTo;
  final Object? backArg;
}

/// Class quiz with no phones: the question goes on the board, the class answers aloud or on
/// paper, and the teacher taps roll numbers right or wrong (absent ones are skipped). Each
/// question's marks are kept by roll number for the mastery map. [topicKeys] ("chapterId|t3")
/// starts a revision quiz on those topics.
class ClassQuizView extends StatefulWidget {
  const ClassQuizView({super.key, required this.env, this.topicKeys = const [], this.preset});

  final ToolEnv env;
  final List<String> topicKeys;
  final PresetQuiz? preset;

  @override
  State<ClassQuizView> createState() => _ClassQuizViewState();
}

class _ClassQuizViewState extends State<ClassQuizView> {
  ToolEnv get env => widget.env;
  late String? chapterId = widget.topicKeys.isNotEmpty ? widget.topicKeys.first.split('|').first : env.startChapter?.id;
  late Set<String> topics = {
    for (final k in widget.topicKeys)
      if (k.startsWith('$chapterId|')) k.split('|').last,
  };
  int count = 5;
  List<BankQuestion> questions = const [];
  int index = 0;
  late QuizMarks marks;
  final results = <(BankQuestion, int right, int wrong, int notMarked)>[];
  bool finished = false;
  bool onBoard = true;

  BankChapter? get chapter => env.bank.chapter(chapterId);
  BankQuestion get q => questions[index];
  PresetQuiz? get preset => widget.preset;

  /// Each present roll number's marks so far under the preset's marking.
  final totals = <int, double>{};

  void _back() {
    final p = preset;
    p?.backTo == null ? env.back() : env.open(p!.backTo!, arg: p.backArg);
  }

  @override
  void initState() {
    super.initState();
    final p = preset;
    if (p != null) {
      questions = p.questions;
      _fresh();
      if (questions.isNotEmpty) WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? _putQuestion() : null);
      return;
    }
    if (widget.topicKeys.isNotEmpty) WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? _start() : null);
  }

  void _start() {
    final c = chapter;
    if (c == null) return;
    final recent = {for (final r in env.records.records.quizzes.reversed.take(60)) r.questionId};
    setState(() {
      questions = pickQuizQuestions(c, topics: topics, count: count, seed: env.now().millisecondsSinceEpoch, recent: recent);
      index = 0;
      results.clear();
      finished = false;
      _fresh();
    });
    _putQuestion();
  }

  void _fresh() => marks = QuizMarks(rolls: env.rolls, absent: env.absent);

  /// The question (and options) on a fresh page of the board.
  Future<void> _putQuestion() async {
    if (!onBoard || questions.isEmpty) return;
    final host = env.host;
    final question = q;
    final picture = await preset?.picture?.call(question);
    if (!mounted || question != q) return;
    if (host.wb.elements.isNotEmpty) host.newPage();
    if (picture != null) {
      await host.putImage(picture, width: 1100, title: 'Q${index + 1}.${question.stem.isEmpty ? '' : ' ${question.stem}'}', at: const Offset(96, 120));
      host.putElements(
        boardLines([for (final (i, o) in question.options.indexed) (wrapText('${String.fromCharCode(65 + i)}   $o', 24), 40, false)], env.ink, gap: 18),
        at: const Offset(1260, 220),
      );
      return;
    }
    host.putElements(
      boardLines(
        [(wrapText('Q${index + 1}. ${question.stem}', 32), 52, true), ('', 12, false), for (final (i, o) in question.options.indexed) (wrapText('${String.fromCharCode(65 + i)}   $o', 38), 44, false)],
        env.ink,
        gap: 18,
      ),
      at: const Offset(96, 220),
    );
  }

  Future<void> _save() async {
    final rec = marks.record(at: env.now(), q: q, topicTitle: preset?.topicTitles[q.id] ?? chapter?.topicTitle(q.topic) ?? '');
    results.add((q, marks.right.length, marks.wrong.length, marks.notMarked));
    final score = preset?.score;
    if (score != null) {
      for (final r in marks.present) {
        totals[r] = (totals[r] ?? 0) + switch (marks.of(r)) {
          Mark.right => score(q, true),
          Mark.wrong => score(q, false),
          Mark.none => 0,
        };
      }
    }
    if (rec != null) await env.records.addQuiz(rec);
  }

  Future<void> _next() async {
    await _save();
    if (!mounted) return;
    if (index == questions.length - 1) {
      setState(() => finished = true);
      await preset?.onFinish?.call(Map.of(totals));
      return;
    }
    setState(() {
      index++;
      _fresh();
    });
    _putQuestion();
  }

  Future<void> _showResult() async {
    final right = marks.right, wrong = marks.wrong;
    await env.host.putWidget(
      _ResultCard(question: q, number: index + 1, right: right.length, wrong: wrong.length, notMarked: marks.notMarked, revisit: wrong),
      size: const Size(960, 560),
      context: context,
      at: const Offset(980, 260),
    );
    env.host.showMessage(ceTr('Result on the board'));
  }

  @override
  Widget build(BuildContext context) {
    if (preset != null) {
      if (questions.isEmpty) {
        return Column(
          children: [
            ToolHeader(title: preset!.title, onBack: _back),
            Expanded(
              child: ToolEmpty(icon: Icons.quiz_outlined, title: context.ce('No questions to ask'), line: context.ce('This paper has no multiple-choice questions for a class quiz.')),
            ),
          ],
        );
      }
      return finished ? _summary() : _asking();
    }
    if (env.bank.chapters.isEmpty || env.bank.chapters.every((c) => c.questions.isEmpty)) {
      return Column(
        children: [
          ToolHeader(title: context.ce('Class quiz'), onBack: env.back),
          Expanded(child: noBank(env)),
        ],
      );
    }
    if (questions.isEmpty) return _setup();
    if (finished) return _summary();
    return _asking();
  }

  Widget _setup() {
    final c = chapter;
    return ListView(
      key: const Key('ce-quiz-setup'),
      padding: EdgeInsets.zero,
      children: [
        ToolHeader(
          title: context.ce('Class quiz'),
          onBack: env.back,
          pill: toolPill(ceTr('No phones needed'), icon: Icons.phonelink_erase_outlined, bg: CeC.mint),
        ),
        const SizedBox(height: 8),
        Text(context.ce('The question goes on the board. The class answers aloud or on paper; you tap roll numbers right or wrong.'), style: ceText(17, height: 1.4)),
        const SizedBox(height: 22),
        Text(
          ceTr('Chapter'),
          style: ceText(17, w: FontWeight.w600, c: CeC.navy),
        ),
        const SizedBox(height: 10),
        ChapterPicker(
          bank: env.bank,
          selected: [?chapterId],
          only: (c) => c.questions.isNotEmpty,
          onChanged: (s) => setState(() {
            chapterId = s.first;
            topics = {};
          }),
        ),
        if (c != null && c.topics.length > 1) ...[
          const SizedBox(height: 22),
          Text(
            ceTr('Topics'),
            style: ceText(17, w: FontWeight.w600, c: CeC.navy),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              choiceChip(ceTr('All topics'), on: topics.isEmpty, offIcon: null, onTap: () => setState(() => topics = {})),
              for (final (id, title) in c.topics)
                if (c.questions.any((q) => q.topic == id))
                  choiceChip(title, on: topics.contains(id), offIcon: null, key: Key('ce-quiz-topic-$id'), onTap: () => setState(() => topics.contains(id) ? topics.remove(id) : topics.add(id))),
            ],
          ),
        ],
        const SizedBox(height: 22),
        Row(
          children: [
            Text(
              ceTr('Questions'),
              style: ceText(17, w: FontWeight.w600, c: CeC.navy),
            ),
            const SizedBox(width: 16),
            for (final n in const [3, 5, 10]) ...[choiceChip('$n', on: count == n, offIcon: null, tick: false, onTap: () => setState(() => count = n)), const SizedBox(width: 8)],
          ],
        ),
        const SizedBox(height: 14),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: onBoard,
          onChanged: (v) => setState(() => onBoard = v),
          title: Text(
            ceTr('Put each question on a new board page'),
            style: ceText(17, w: FontWeight.w600, c: CeC.navy),
          ),
          subtitle: Text(context.ce('The answer stays on this panel, for you.'), style: ceText(14.5)),
        ),
        const SizedBox(height: 18),
        Row(
          children: [
            toolButton(ceTr('Start the quiz'), icon: Icons.play_arrow_rounded, filled: true, onPressed: c == null ? null : _start, key: const Key('ce-quiz-start')),
            const SizedBox(width: 16),
            Flexible(child: Text('${bankLine(env.bank)} · ${ceTr('{n} questions in this chapter', {'n': c?.questions.length ?? 0})}', style: ceText(15))),
          ],
        ),
      ],
    );
  }

  Widget _asking() => LayoutBuilder(
    builder: (context, box) {
      final cols = env.rolls.length > 48 ? 10 : 8;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ToolHeader(
            title: preset?.title ?? ceTr('Class quiz'),
            onBack: _back,
            pill: toolPill(ceTr('Question {n} of {total}', {'n': index + 1, 'total': questions.length}), key: const Key('ce-quiz-progress')),
            trailing: [toolPill(ceTr('No phones needed'), icon: Icons.phonelink_erase_outlined, bg: CeC.mint)],
          ),
          const SizedBox(height: 14),
          _questionCard(),
          const SizedBox(height: 18),
          Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: context.ce('Tap a roll number  '),
                  style: ceText(17, w: FontWeight.w700, c: CeC.navy),
                ),
                TextSpan(text: ceTr('once for right, twice for wrong') + (env.absent.isEmpty ? '' : ' · ${ceTr('absent ones are greyed out')}'), style: ceText(16)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Expanded(child: _grid(cols)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _stat('${marks.right.length}', 'right', CeC.mint, CeC.green, const Key('ce-quiz-right'))),
              const SizedBox(width: 12),
              Expanded(child: _stat('${marks.wrong.length}', 'wrong', CeC.pink, const Color(0xFFBE185D), const Key('ce-quiz-wrong'))),
              const SizedBox(width: 12),
              Expanded(child: _stat('${marks.notMarked}', ceTr('not marked'), Colors.white, CeC.navy, const Key('ce-quiz-unmarked'))),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            runSpacing: 10,
            children: [
              Wrap(
                spacing: 12,
                runSpacing: 10,
                children: [
                  toolButton(ceTr('Mark all right'), onPressed: () => setState(marks.markRestRight), key: const Key('ce-quiz-all-right')),
                  toolButton(index == questions.length - 1 ? ceTr('Finish') : ceTr('Next question'), onPressed: _next, key: const Key('ce-quiz-next')),
                ],
              ),
              toolButton(ceTr('Show result on board'), icon: Icons.bar_chart_rounded, filled: true, onPressed: _showResult, key: const Key('ce-quiz-result')),
            ],
          ),
        ],
      );
    },
  );

  Widget _questionCard() => Container(
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(color: CeC.lavender, borderRadius: BorderRadius.circular(24)),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          q.stem.isEmpty ? ceTr('The question is the picture on the board.') : q.stem,
          key: const Key('ce-quiz-stem'),
          maxLines: 5,
          overflow: TextOverflow.ellipsis,
          style: ceText(21, c: CeC.navy, height: 1.3),
        ),
        const SizedBox(height: 14),
        LayoutBuilder(
          builder: (context, box) {
            final w = (box.maxWidth - 12) / 2;
            return Wrap(
              spacing: 12,
              runSpacing: 10,
              children: [
                for (final (i, o) in q.options.indexed)
                  Container(
                    width: q.options.every((o) => o.length < 60) ? w : box.maxWidth,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    decoration: BoxDecoration(
                      color: i == q.answer ? CeC.mint : Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: i == q.answer ? CeC.green : Colors.white, width: 2),
                    ),
                    child: Row(
                      children: [
                        Text(
                          String.fromCharCode(65 + i),
                          style: ceText(17, w: FontWeight.w700, c: CeC.navy),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Text(
                            o,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: ceText(17, c: CeC.navy),
                          ),
                        ),
                        if (i == q.answer) const Icon(Icons.check_circle, color: CeC.green, size: 26),
                      ],
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    ),
  );

  Widget _grid(int cols) => LayoutBuilder(
    builder: (context, box) {
      const gap = 10.0;
      final rows = (env.rolls.length / cols).ceil();
      final w = (box.maxWidth - gap * (cols - 1)) / cols;
      final fitH = rows == 0 ? w : (box.maxHeight - gap * (rows - 1)) / rows;
      final h = fitH.clamp(56.0, w);
      return SingleChildScrollView(
        child: Wrap(
          spacing: gap,
          runSpacing: gap,
          children: [for (final r in env.rolls) SizedBox(width: w, height: h, child: _cell(r))],
        ),
      );
    },
  );

  Widget _cell(int r) {
    final absent = marks.isAbsent(r);
    final m = marks.of(r);
    final (bg, border, icon, fg) = switch (m) {
      _ when absent => (const Color(0xFFEFF2F6), const Color(0xFFE2E8F0), null, const Color(0xFF94A3B8)),
      Mark.right => (CeC.mint, const Color(0xFF86C9A2), Icons.check, CeC.green),
      Mark.wrong => (CeC.pink, const Color(0xFFF2A7C3), Icons.close, const Color(0xFFBE185D)),
      Mark.none => (Colors.white, CeC.line, null, CeC.navy),
    };
    return Material(
      color: bg,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: border, width: 1.5),
      ),
      child: InkWell(
        key: Key('ce-roll-$r'),
        borderRadius: BorderRadius.circular(14),
        onTap: absent ? null : () => setState(() => marks.tap(r)),
        child: Center(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(rollLabel(r), style: ceHeading(26, c: absent ? fg : CeC.navy)),
              if (icon != null) ...[const SizedBox(width: 6), Icon(icon, size: 20, color: fg)],
              if (absent) ...[
                const SizedBox(width: 6),
                Text(
                  ceTr('AB'),
                  style: ceText(12, w: FontWeight.w700, c: fg),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  /// Each present roll number's score under the exam's marking, highest first.
  Widget _scores() {
    final rows = totals.entries.toList()..sort((a, b) => b.value != a.value ? b.value.compareTo(a.value) : a.key.compareTo(b.key));
    String n(double v) => v == v.roundToDouble() ? '${v.toInt()}'.replaceFirst('-', '−') : v.toStringAsFixed(1).replaceFirst('-', '−');
    return Container(
      key: const Key('ce-quiz-scores'),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: CeC.butter, borderRadius: BorderRadius.circular(22)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(context.ce('Scores by roll number'), style: ceHeading(22)),
          const SizedBox(height: 4),
          Text(preset!.scoreLine, style: ceText(15)),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final e in rows)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
                  child: Text('${rollLabel(e.key)}   ${n(e.value)}', style: ceText(16, w: FontWeight.w600, c: CeC.navy)),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _stat(String n, String label, Color bg, Color fg, Key key) => Container(
    key: key,
    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
    decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(16)),
    child: Row(
      children: [
        Text(n, style: ceHeading(30, c: fg)),
        const SizedBox(width: 10),
        Flexible(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: ceText(17, w: FontWeight.w600, c: CeC.navy),
          ),
        ),
      ],
    ),
  );

  Widget _summary() {
    final c = chapter;
    return ListView(
      key: const Key('ce-quiz-summary'),
      padding: EdgeInsets.zero,
      children: [
        ToolHeader(
          title: preset?.title ?? ceTr('Class quiz'),
          onBack: _back,
          pill: toolPill(ceTr('Done'), icon: Icons.check, bg: CeC.mint),
        ),
        const SizedBox(height: 8),
        Text('${preset?.line ?? c?.title ?? ''} · ${ceTr('saved by roll number for the mastery map')}', style: ceText(17)),
        const SizedBox(height: 18),
        if (preset?.score != null && totals.isNotEmpty) ...[_scores(), const SizedBox(height: 18)],
        for (final (i, (q, right, wrong, _)) in results.indexed)
          Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(16),
            decoration: ceCard(shadow: false),
            child: Row(
              children: [
                SizedBox(width: 44, child: Text('Q${i + 1}', style: ceHeading(20))),
                Expanded(
                  child: Text(
                    q.stem.isEmpty ? ceTr('The question in the picture') : q.stem,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: ceText(16, c: CeC.body),
                  ),
                ),
                const SizedBox(width: 16),
                SizedBox(
                  width: 180,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(99),
                    child: LinearProgressIndicator(value: right + wrong == 0 ? 0 : right / (right + wrong), minHeight: 12, backgroundColor: CeC.pink, color: const Color(0xFF6CC08F)),
                  ),
                ),
                const SizedBox(width: 12),
                SizedBox(
                  width: 92,
                  child: Text(
                    right + wrong == 0 ? ceTr('not marked') : ceTr('{n} of {total}', {'n': right, 'total': right + wrong}),
                    textAlign: TextAlign.right,
                    style: ceText(15, w: FontWeight.w600, c: CeC.navy),
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: 16),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            toolButton(
              ceTr('Open the mastery map'),
              icon: Icons.grid_view_rounded,
              filled: true,
              onPressed: () => env.open('mastery', arg: chapterId),
              key: const Key('ce-quiz-mastery'),
            ),
            if (preset == null)
              toolButton(ceTr('Another quiz'), icon: Icons.refresh, onPressed: () => setState(() => questions = const []))
            else
              toolButton(ceTr('Back to the paper'), icon: Icons.arrow_back_rounded, onPressed: _back, key: const Key('ce-quiz-back-to-paper')),
          ],
        ),
      ],
    );
  }
}

/// The result put on the board: right, wrong and not marked, the answer, and who to revisit.
class _ResultCard extends StatelessWidget {
  const _ResultCard({required this.question, required this.number, required this.right, required this.wrong, required this.notMarked, required this.revisit});

  final BankQuestion question;
  final int number, right, wrong, notMarked;
  final List<int> revisit;

  @override
  Widget build(BuildContext context) {
    final total = right + wrong + notMarked;
    Widget bar(int n, Color c, String label) => Row(
      children: [
        SizedBox(
          width: 150,
          child: Text(
            label,
            style: ceText(26, w: FontWeight.w600, c: CeC.navy),
          ),
        ),
        Expanded(
          child: LayoutBuilder(
            builder: (context, box) => Align(
              alignment: Alignment.centerLeft,
              child: Container(
                width: total == 0 ? 0 : box.maxWidth * n / total,
                height: 40,
                decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ),
        ),
        SizedBox(
          width: 70,
          child: Text('$n', textAlign: TextAlign.right, style: ceHeading(34)),
        ),
      ],
    );
    return Container(
      padding: const EdgeInsets.all(36),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: CeC.line, width: 2),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(ceTr('Q{n} result', {'n': number}), style: ceHeading(40)),
          const SizedBox(height: 24),
          bar(right, const Color(0xFF6CC08F), ceTr('Right')),
          const SizedBox(height: 14),
          bar(wrong, const Color(0xFFF2A7C3), ceTr('Wrong')),
          const SizedBox(height: 14),
          bar(notMarked, CeC.line, ceTr('Not marked')),
          const SizedBox(height: 26),
          Text(
            ceTr('Answer: {answer}', {'answer': question.answerText}),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: ceText(28, w: FontWeight.w600, c: CeC.green),
          ),
          const Spacer(),
          if (revisit.isNotEmpty) Text(context.ce('Let’s go over it again together.'), style: ceText(24, c: CeC.muted)),
        ],
      ),
    );
  }
}
