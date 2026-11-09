import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../class_tools/bank.dart';
import '../class_tools/class_records.dart';
import '../class_tools/quiz_view.dart';
import '../class_tools/tool_ui.dart';
import '../classroom_hooks.dart';
import '../ui/ce_style.dart';
import 'exam_rules.dart';
import 'page_cache.dart';
import 'paper_library.dart';
import 'paper_model.dart';

/// A question of a past paper, with the paper it is from.
typedef PracticeItem = ({Paper paper, PaperQuestion q});

/// The questions of [sets] for practice: of [years] and [chapters] when given (empty: all),
/// newest paper first, in the paper's order.
List<PracticeItem> selectPractice(List<(Paper, QuestionSet)> sets, {Set<int> years = const {}, Set<String> chapters = const {}, Set<String> subjects = const {}}) {
  final sorted = [...sets]..sort((a, b) => b.$1.year != a.$1.year ? b.$1.year.compareTo(a.$1.year) : a.$1.session.compareTo(b.$1.session));
  return [
    for (final (p, s) in sorted)
      if (years.isEmpty || years.contains(p.year))
        for (final q in s.questions)
          if ((chapters.isEmpty || chapters.contains(q.chapter)) && (subjects.isEmpty || subjects.contains(q.subject))) (paper: p, q: q),
  ];
}

/// The score of a class's answers under each paper's exam marking: (total, right, wrong).
(double, int, int) practiceScore(Iterable<(PracticeItem, Set<int>?)> answers) {
  var total = 0.0;
  var right = 0, wrong = 0;
  for (final (it, chosen) in answers) {
    if (chosen == null || chosen.isEmpty) continue;
    final ok = it.q.isRight(chosen);
    ok ? right++ : wrong++;
    total += it.q.score(it.paper.exam, ok);
  }
  return (total, right, wrong);
}

/// The question's picture as PNG: its own image, or the part of the paper's page it marks.
Future<Uint8List?> questionPicture(PaperLibrary lib, Paper paper, PaperQuestion q, {int width = 1400}) async {
  if (q.image != null) return lib.file(q.image!);
  final c = q.crop;
  if (c == null) return null;
  final bytes = await lib.paperPdf(paper);
  if (bytes == null) return null;
  final pdf = await OpenPdf.open(bytes);
  if (pdf == null || c.page > pdf.pageCount) return null;
  try {
    return await pdf.png(c.page - 1, width: width, crop: Rect.fromLTWH(c.left, c.top, c.width, c.height));
  } finally {
    await pdf.dispose();
  }
}

/// A class quiz from past-paper questions: the class-quiz flow by roll number, the exam's
/// marking for the scores, the totals kept as a test in the class records. Only questions with
/// one right option are asked (numerical and "more than one right" ones are left out).
PresetQuiz paperQuiz({required ToolEnv env, required PaperLibrary lib, required List<PracticeItem> items, required String title, String backArg = ''}) {
  final asked = [
    for (final it in items)
      if (it.q.hasOptions && !it.q.multiCorrect) it,
  ];
  final byId = <String, PracticeItem>{};
  final questions = <BankQuestion>[];
  for (final it in asked) {
    final id = 'paper:${it.paper.id}:${it.q.number}';
    byId[id] = it;
    // Recorded under the bank's chapter when its tag names one (the mastery map then shows
    // it with the class's other quizzes), else under the tag itself.
    final chapterId = env.bank.chapterFor(it.q.chapter)?.id ?? (it.q.chapter.isEmpty ? it.paper.title : it.q.chapter);
    questions.add(BankQuestion(id: id, chapterId: chapterId, stem: it.q.stem, options: it.q.options, answer: it.q.correct.single));
  }
  final exams = {for (final it in asked) it.paper.exam};
  final rule = exams.length == 1 ? exams.single.rule : null;
  final max = asked.fold<double>(0, (s, it) => s + it.q.marking(it.paper.exam).$1);
  return PresetQuiz(
    title: title,
    line: [title, if (asked.length < items.length) '${items.length - asked.length} numerical or multi-answer questions left out'].join(' · '),
    questions: questions,
    topicTitles: {for (final e in byId.entries) e.key: e.value.q.chapter.isEmpty ? e.value.paper.title : e.value.q.chapter},
    picture: (q) async {
      final it = byId[q.id];
      return it == null || !it.q.hasPicture ? null : questionPicture(lib, it.paper, it.q);
    },
    score: (q, right) {
      final it = byId[q.id]!;
      return it.q.score(it.paper.exam, right);
    },
    scoreLine: rule == null ? 'Each paper\'s own marking' : '${exams.single.label} marking: ${rule.markingLine}',
    backTo: 'papers',
    backArg: backArg.isEmpty ? null : backArg,
    onFinish: (totals) async {
      if (totals.isEmpty) return;
      final now = env.now();
      await env.records.putMock(MockRecord(id: 'paper-${now.millisecondsSinceEpoch}', at: now, title: title, maxMarks: max, chapterIds: {for (final q in questions) q.chapterId}.toList(), marks: totals));
    },
  );
}

/// Opens the full-screen practice: one question at a time.
Future<void> openPractice(BuildContext context, {required PaperLibrary lib, required List<PracticeItem> items, required String title, ClassroomHost? host}) =>
    Navigator.of(context, rootNavigator: true).push(PageRouteBuilder<void>(pageBuilder: (_, _, _) => PracticeScreen(lib: lib, items: items, title: title, host: host)));

/// Practice on the board: the question big, its options as large tiles (tap the class's
/// answer), Reveal answer, and the marks it earns under the exam's marking.
class PracticeScreen extends StatefulWidget {
  const PracticeScreen({super.key, required this.lib, required this.items, required this.title, this.host});

  final PaperLibrary lib;
  final List<PracticeItem> items;
  final String title;
  final ClassroomHost? host;

  @override
  State<PracticeScreen> createState() => _PracticeScreenState();
}

class _PracticeScreenState extends State<PracticeScreen> {
  int index = 0;
  final chosen = <int, Set<int>>{};
  final revealed = <int>{};
  final _pictures = <int, Future<Uint8List?>>{};

  PracticeItem get it => widget.items[index];
  PaperQuestion get q => it.q;
  Set<int> get pick => chosen[index] ?? const {};
  bool get shown => revealed.contains(index);

  Future<Uint8List?> _picture(int i) => _pictures[i] ??= questionPicture(widget.lib, widget.items[i].paper, widget.items[i].q);

  void _tap(int o) {
    if (shown) return;
    setState(() {
      final s = {...pick};
      if (q.multiCorrect) {
        s.contains(o) ? s.remove(o) : s.add(o);
      } else {
        s
          ..clear()
          ..add(o);
      }
      chosen[index] = s;
    });
  }

  void _go(int i) => setState(() => index = i.clamp(0, widget.items.length - 1));

  Future<void> _put() async {
    final host = widget.host;
    if (host == null) return;
    if (host.wb.elements.isNotEmpty) host.newPage();
    final pic = q.hasPicture ? await _picture(index) : null;
    final ink = host.wb.background.isDark ? WhiteboardController.chalkWhite : WhiteboardController.inkBlack;
    final head = 'Q${q.number}. ${it.paper.title}${q.chapter.isEmpty ? '' : ' · ${q.chapter}'}';
    if (pic != null) {
      await host.putImage(pic, width: 1100, title: head, at: const Offset(80, 60));
      host.putElements(boardLines([for (final (i, o) in q.options.indexed) (wrapText('${PaperQuestion.letter(i)}   $o', 24), 40, false)], ink, gap: 18), at: const Offset(1240, 200));
    } else {
      host.putElements(
        boardLines([(head, 30, false), (wrapText(q.stem, 34), 48, true), ('', 10, false), for (final (i, o) in q.options.indexed) (wrapText('${PaperQuestion.letter(i)}   $o', 40), 42, false)], ink, gap: 18),
        at: const Offset(96, 120),
      );
    }
    host.showMessage('Question ${q.number} is on the board');
  }

  @override
  Widget build(BuildContext context) {
    final items = widget.items;
    final (total, right, wrong) = practiceScore([for (final i in revealed) (items[i], chosen[i])]);
    final (plus, minus) = q.marking(it.paper.exam);
    return Theme(
      data: ceTheme(context),
      child: Scaffold(
        key: const Key('ce-papers-practice'),
        backgroundColor: CeC.page,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(28, 18, 28, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    toolButton('Close', icon: Icons.close_rounded, key: const Key('ce-practice-close'), onPressed: () => Navigator.of(context).pop()),
                    const SizedBox(width: 18),
                    Flexible(child: Text(widget.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: ceHeading(28))),
                    const SizedBox(width: 14),
                    toolPill('Question ${index + 1} of ${items.length}', key: const Key('ce-practice-progress')),
                    const Spacer(),
                    toolPill(minus == 0 ? '+${formatMarks(plus)} right' : '+${formatMarks(plus)} right · −${formatMarks(minus)} wrong', icon: Icons.rule_rounded, bg: CeC.butter),
                    const SizedBox(width: 10),
                    toolPill('Class score ${formatMarks(total)}  ($right right, $wrong wrong)', key: const Key('ce-practice-score'), bg: CeC.mint),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  [it.paper.longTitle, 'Q${q.number}', if (q.section.isNotEmpty) 'Section ${q.section}', if (q.chapter.isNotEmpty) q.chapter].join(' · '),
                  style: ceText(17, w: FontWeight.w600, c: CeC.navy),
                ),
                const SizedBox(height: 14),
                Expanded(child: _question()),
                const SizedBox(height: 16),
                Row(
                  children: [
                    _arrow(Icons.chevron_left_rounded, index > 0 ? () => _go(index - 1) : null, 'ce-practice-prev'),
                    const SizedBox(width: 16),
                    if (widget.host != null) toolButton('Put on board', icon: Icons.move_to_inbox_outlined, key: const Key('ce-practice-put'), onPressed: _put),
                    const Spacer(),
                    if (shown) _verdict() else toolButton('Reveal answer', icon: Icons.visibility_outlined, filled: true, key: const Key('ce-practice-reveal'), onPressed: () => setState(() => revealed.add(index))),
                    const Spacer(),
                    _arrow(Icons.chevron_right_rounded, index < items.length - 1 ? () => _go(index + 1) : null, 'ce-practice-next'),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _verdict() {
    if (!q.hasOptions) {
      return toolPill('Answer: ${q.value}', key: const Key('ce-practice-answer'), bg: CeC.mint);
    }
    final p = pick;
    final (text, bg) = p.isEmpty
        ? ('Answer: ${q.answerLabel}', CeC.mint)
        : q.isRight(p)
        ? ('Right! +${formatMarks(q.score(it.paper.exam, true))}   Answer: ${q.answerLabel}', CeC.mint)
        : ('Not quite ${formatMarks(q.score(it.paper.exam, false))}   Answer: ${q.answerLabel}', CeC.pink);
    return Container(
      key: const Key('ce-practice-answer'),
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: Text(text, style: ceHeading(24)),
    );
  }

  Widget _question() {
    final stem = q.stem.isEmpty ? null : Text(q.stem, key: const Key('ce-practice-stem'), style: ceText(q.hasPicture ? 26 : 34, c: CeC.navy, height: 1.35));
    final picture = q.hasPicture
        ? FutureBuilder<Uint8List?>(
            future: _picture(index),
            builder: (context, snap) => snap.data == null
                ? Center(child: snap.connectionState == ConnectionState.done ? Text('The picture of this question is missing.', style: ceText(18)) : const CircularProgressIndicator())
                : Container(
                    padding: const EdgeInsets.all(10),
                    decoration: ceCard(shadow: false),
                    child: Image.memory(snap.data!, fit: BoxFit.contain, filterQuality: FilterQuality.medium),
                  ),
          )
        : null;
    final options = q.hasOptions ? _tiles() : _numerical();
    return LayoutBuilder(
      builder: (context, box) {
        final wide = picture != null && box.maxWidth > 1100;
        if (wide) {
          return Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                flex: 6,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    ?stem,
                    if (stem != null) const SizedBox(height: 10),
                    Expanded(child: picture),
                  ],
                ),
              ),
              const SizedBox(width: 22),
              Expanded(flex: 5, child: options),
            ],
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ?stem,
            if (picture != null) Expanded(flex: 4, child: Padding(padding: const EdgeInsets.only(top: 10), child: picture)),
            const SizedBox(height: 18),
            Expanded(flex: 5, child: options),
          ],
        );
      },
    );
  }

  Widget _tiles() => LayoutBuilder(
    builder: (context, box) {
      final n = q.options.length;
      final cols = box.maxWidth > 900 && q.options.every((o) => o.length < 70) ? 2 : 1;
      final rows = (n / cols).ceil();
      const gap = 14.0;
      final h = ((box.maxHeight - gap * (rows - 1)) / rows).clamp(64.0, 180.0);
      final w = (box.maxWidth - gap * (cols - 1)) / cols;
      return SingleChildScrollView(
        child: Wrap(
          spacing: gap,
          runSpacing: gap,
          children: [for (var i = 0; i < n; i++) SizedBox(width: w, height: h, child: _tile(i))],
        ),
      );
    },
  );

  Widget _tile(int i) {
    final isPick = pick.contains(i), isRight = q.correct.contains(i);
    final (bg, border) = switch ((shown, isRight, isPick)) {
      (true, true, _) => (CeC.mint, CeC.green),
      (true, false, true) => (CeC.pink, const Color(0xFFBE185D)),
      (false, _, true) => (CeC.lavender, CeC.accent),
      _ => (Colors.white, CeC.line),
    };
    return Material(
      color: bg,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22), side: BorderSide(color: border, width: 3)),
      child: InkWell(
        key: Key('ce-practice-option-$i'),
        borderRadius: BorderRadius.circular(22),
        onTap: () => _tap(i),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
          child: Row(
            children: [
              Container(
                width: 56,
                height: 56,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: isPick || (shown && isRight) ? Colors.white : CeC.page, shape: BoxShape.circle),
                child: Text(PaperQuestion.letter(i), style: ceHeading(28)),
              ),
              const SizedBox(width: 20),
              Expanded(child: Text(q.options[i], maxLines: 3, overflow: TextOverflow.ellipsis, style: ceText(28, c: CeC.navy, height: 1.25))),
              if (shown && isRight) const Icon(Icons.check_circle, color: CeC.green, size: 40),
              if (shown && !isRight && isPick) const Icon(Icons.cancel, color: Color(0xFFBE185D), size: 40),
            ],
          ),
        ),
      ),
    );
  }

  Widget _numerical() => Center(
    child: Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(color: shown ? CeC.mint : Colors.white, borderRadius: BorderRadius.circular(24)),
      child: Text(shown ? 'Answer: ${q.value}' : 'A numerical answer. Let the class work it out, then tap Reveal answer.', textAlign: TextAlign.center, style: ceText(28, c: CeC.navy)),
    ),
  );

  Widget _arrow(IconData icon, VoidCallback? onTap, String key) => Opacity(
    opacity: onTap == null ? 0.35 : 1,
    child: Material(
      color: Colors.white,
      elevation: 3,
      shape: const CircleBorder(),
      child: InkWell(
        key: Key(key),
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(width: 80, height: 80, child: Icon(icon, size: 56, color: CeC.navy)),
      ),
    ),
  );
}
