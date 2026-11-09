import 'dart:async';

import 'package:flutter/material.dart';

import '../class_tools/tool_ui.dart';
import '../local/classroom_store.dart';
import '../ui/ce_style.dart';
import 'exam_rules.dart';
import 'exam_timer.dart';
import 'paper_import.dart';
import 'paper_library.dart';
import 'paper_model.dart';
import 'paper_viewer.dart';
import 'practice.dart';

/// Past papers (a Class tool): the board's library of KCET, NEET, JEE, COMEDK, PUC and CBSE
/// papers, filtered by exam, year and subject; each shown full screen on the board with its
/// answer key, the exam's timer, and practice from its question set. Papers come in from a USB
/// stick with the school PIN ([openAddPapers]). README.md has the paper-pack format.
class PastPapersView extends StatefulWidget {
  const PastPapersView({super.key, required this.env, this.paperId, this.library});

  final ToolEnv env;

  /// The paper to open on (back from a class quiz).
  final String? paperId;

  /// The library (else the board's own, [PaperLibrary.shared]).
  final PaperLibrary? library;

  @override
  State<PastPapersView> createState() => _PastPapersViewState();
}

class _PastPapersViewState extends State<PastPapersView> {
  ToolEnv get env => widget.env;
  PaperLibrary? lib;
  PaperFilter filter = const PaperFilter();
  final search = TextEditingController();
  String? open;

  /// Practice choices for the open paper's exam.
  bool practising = false;
  Set<int> years = {};
  Set<String> chapters = {};
  List<(Paper, QuestionSet)>? sets;

  static bool _bundledChecked = false;

  @override
  void initState() {
    super.initState();
    open = widget.paperId;
    unawaited(_load());
  }

  Future<void> _load() async {
    final l = widget.library ?? await PaperLibrary.shared();
    if (!l.loaded) await l.load();
    if (!mounted) return;
    setState(() => lib = l);
    l.addListener(_changed);
    if (!_bundledChecked && widget.library == null) {
      _bundledChecked = true;
      final r = await l.importBundled();
      if (r.added.isNotEmpty) env.host.showMessage('${r.added.length} bundled papers added to the library');
    }
  }

  void _changed() => mounted ? setState(() {}) : null;

  @override
  void dispose() {
    lib?.removeListener(_changed);
    search.dispose();
    super.dispose();
  }

  ClassroomStore get store => env.host.store;

  Future<void> _add() async {
    final l = lib;
    if (l == null) return;
    if (!await askPapersPin(context, store)) return;
    if (!mounted) return;
    await openAddPapers(context, l);
  }

  Future<void> _remove(Paper p) async {
    final ok = await askPapersPin(context, store, why: 'Removing ${p.longTitle} takes it off this board for everyone.');
    if (!ok) return;
    await lib!.remove(p);
    setState(() => open = null);
    env.host.showMessage('${p.title} removed from this board');
  }

  void _openPaper(Paper p) => setState(() {
    open = p.id;
    practising = false;
    sets = null;
  });

  @override
  Widget build(BuildContext context) {
    final l = lib;
    if (l == null) return const Center(child: CircularProgressIndicator());
    final p = open == null ? null : l.byId(open!);
    if (p != null) return practising ? _practiceSetup(l, p) : _detail(l, p);
    return _library(l);
  }

  // --- The library ----------------------------------------------------------------------------

  Widget _library(PaperLibrary l) {
    final header = ToolHeader(
      title: 'Past papers',
      onBack: env.back,
      pill: l.isEmpty ? null : toolPill(l.papers.length == 1 ? '1 paper' : '${l.papers.length} papers', key: const Key('ce-papers-count')),
      trailing: [toolButton('Add papers', icon: Icons.usb_rounded, key: const Key('ce-papers-add-button'), onPressed: _add)],
    );
    if (l.isEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [header, Expanded(child: _empty())],
      );
    }
    final choices = filterChoices(l.papers, filter);
    final shown = filterPapers(l.papers, filter);
    return Column(
      key: const Key('ce-papers-library'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        header,
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: TextField(
                key: const Key('ce-papers-search'),
                controller: search,
                style: ceText(18, c: CeC.navy),
                decoration: InputDecoration(
                  hintText: 'Search: exam, year, subject, shift…',
                  prefixIcon: const Icon(Icons.search_rounded),
                  suffixIcon: search.text.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.close_rounded),
                          onPressed: () => setState(() {
                            search.clear();
                            filter = PaperFilter(exam: filter.exam, year: filter.year, subject: filter.subject);
                          }),
                        ),
                  filled: true,
                  fillColor: Colors.white,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(99), borderSide: const BorderSide(color: CeC.line)),
                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(99), borderSide: const BorderSide(color: CeC.line)),
                ),
                onChanged: (v) => setState(() => filter = PaperFilter(exam: filter.exam, year: filter.year, subject: filter.subject, search: v)),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        _chipRow('Exam', [
          choiceChip('All exams', on: filter.exam == null, offIcon: null, tick: false, key: const Key('ce-papers-exam-all'), onTap: () => setState(() => filter = PaperFilter(search: filter.search))),
          for (final e in choices.exams)
            choiceChip(e.label, on: filter.exam == e, offIcon: null, tick: false, key: Key('ce-papers-exam-${e.id}'), onTap: () => setState(() => filter = PaperFilter(exam: filter.exam == e ? null : e, search: filter.search))),
        ]),
        if (choices.years.length > 1) ...[
          const SizedBox(height: 10),
          _chipRow('Year', [
            choiceChip('All years', on: filter.year == null, offIcon: null, tick: false, onTap: () => setState(() => filter = PaperFilter(exam: filter.exam, search: filter.search))),
            for (final y in choices.years)
              choiceChip('$y', on: filter.year == y, offIcon: null, tick: false, key: Key('ce-papers-year-$y'), onTap: () => setState(() => filter = PaperFilter(exam: filter.exam, year: filter.year == y ? null : y, search: filter.search))),
          ]),
        ],
        if (choices.subjects.length > 1) ...[
          const SizedBox(height: 10),
          _chipRow('Subject', [
            choiceChip('All subjects', on: filter.subject == null, offIcon: null, tick: false, onTap: () => setState(() => filter = PaperFilter(exam: filter.exam, year: filter.year, search: filter.search))),
            for (final s in choices.subjects)
              choiceChip(
                s,
                on: filter.subject == s,
                offIcon: null,
                tick: false,
                key: Key('ce-papers-subject-$s'),
                onTap: () => setState(() => filter = PaperFilter(exam: filter.exam, year: filter.year, subject: filter.subject == s ? null : s, search: filter.search)),
              ),
          ]),
        ],
        const SizedBox(height: 18),
        Expanded(
          child: shown.isEmpty
              ? Center(child: Text('No paper matches. Tap All exams, or clear the search.', key: const Key('ce-papers-none'), style: ceText(18)))
              : LayoutBuilder(
                  builder: (context, box) {
                    final cols = box.maxWidth > 1300 ? 4 : (box.maxWidth > 820 ? 3 : 2);
                    final w = (box.maxWidth - 16 * (cols - 1)) / cols;
                    return SingleChildScrollView(
                      child: Wrap(spacing: 16, runSpacing: 16, children: [for (final p in shown) _card(p, w)]),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _chipRow(String label, List<Widget> chips) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      SizedBox(
        width: 84,
        child: Padding(
          padding: const EdgeInsets.only(top: 9),
          child: Text(label, style: ceText(16, w: FontWeight.w600, c: CeC.navy)),
        ),
      ),
      Expanded(child: Wrap(spacing: 8, runSpacing: 8, children: chips)),
    ],
  );

  static Color colourOf(Exam e) => CeC.pastel(e.index);

  Widget _card(Paper p, double width) => SizedBox(
    width: width,
    height: 196,
    child: Material(
      color: colourOf(p.exam),
      borderRadius: BorderRadius.circular(22),
      child: InkWell(
        key: Key('ce-paper-${p.id}'),
        borderRadius: BorderRadius.circular(22),
        onTap: () => _openPaper(p),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Flexible(child: Text(p.exam.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: ceHeading(24))),
                  const SizedBox(width: 10),
                  Text('${p.year}', style: ceHeading(24, w: FontWeight.w400, c: CeC.accent)),
                ],
              ),
              if (p.session.isNotEmpty) Text(p.session, maxLines: 1, overflow: TextOverflow.ellipsis, style: ceText(16, w: FontWeight.w600, c: CeC.navy)),
              const SizedBox(height: 2),
              Text(p.subjectLine, maxLines: 1, overflow: TextOverflow.ellipsis, style: ceText(16, c: CeC.body)),
              const Spacer(),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  if (p.hasKey) _badge(Icons.key_outlined, 'Answer key'),
                  if (p.hasQuestions) _badge(Icons.quiz_outlined, '${p.questionCount} questions'),
                  if (p.language != 'English') _badge(Icons.translate_rounded, p.language),
                ],
              ),
              const SizedBox(height: 8),
              Text(p.source.isEmpty ? 'Source: not given' : 'Source: ${p.source}', maxLines: 1, overflow: TextOverflow.ellipsis, style: ceText(13.5)),
            ],
          ),
        ),
      ),
    ),
  );

  Widget _badge(IconData icon, String text) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.85), borderRadius: BorderRadius.circular(99)),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 15, color: CeC.navy),
        const SizedBox(width: 5),
        Text(text, style: ceText(13, w: FontWeight.w600, c: CeC.navy)),
      ],
    ),
  );

  Widget _empty() => Center(
    child: SingleChildScrollView(
      child: Container(
        key: const Key('ce-papers-empty'),
        constraints: const BoxConstraints(maxWidth: 760),
        padding: const EdgeInsets.all(36),
        decoration: ceCard(shadow: false),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ceIconDot(Icons.history_edu_outlined, bg: CeC.blue, size: 72),
            const SizedBox(height: 18),
            Text('No past papers on this board yet', textAlign: TextAlign.center, style: ceHeading(28)),
            const SizedBox(height: 10),
            Text('Show KCET, NEET, JEE, COMEDK and PUC papers on the board, with their answer keys and the exam\'s timer. Here is how to add them:', textAlign: TextAlign.center, style: ceText(18, height: 1.45)),
            const SizedBox(height: 22),
            for (final (n, line) in const [
              (1, 'Copy the paper PDFs, or a Zynetix paper pack (.zip), onto a USB stick.'),
              (2, 'Plug the USB stick into the board.'),
              (3, 'Tap Add papers, type the school PIN and pick the files.'),
            ])
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      alignment: Alignment.center,
                      decoration: const BoxDecoration(color: CeC.lavender, shape: BoxShape.circle),
                      child: Text('$n', style: ceHeading(20)),
                    ),
                    const SizedBox(width: 16),
                    Expanded(child: Text(line, style: ceText(18, c: CeC.body))),
                  ],
                ),
              ),
            const SizedBox(height: 14),
            toolButton('Add papers', icon: Icons.usb_rounded, filled: true, key: const Key('ce-papers-empty-add'), onPressed: _add),
          ],
        ),
      ),
    ),
  );

  // --- One paper ------------------------------------------------------------------------------

  Widget _detail(PaperLibrary l, Paper p) {
    final rule = p.exam.rule;
    Widget action(IconData icon, String title, String line, Color colour, String key, VoidCallback? onTap) => ConstrainedBox(
      constraints: const BoxConstraints.tightFor(width: 360).copyWith(minHeight: 160),
      child: Opacity(
        opacity: onTap == null ? 0.5 : 1,
        child: Material(
          color: colour,
          borderRadius: BorderRadius.circular(22),
          child: InkWell(
            key: Key(key),
            borderRadius: BorderRadius.circular(22),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  ceIconDot(icon, size: 46),
                  const SizedBox(height: 16),
                  Text(title, style: ceHeading(21)),
                  const SizedBox(height: 2),
                  Text(line, maxLines: 3, overflow: TextOverflow.ellipsis, style: ceText(14.5, height: 1.3)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    return ListView(
      key: const Key('ce-paper-detail'),
      padding: EdgeInsets.zero,
      children: [
        ToolHeader(
          title: p.title,
          onBack: () => setState(() => open = null),
          pill: p.session.isEmpty ? null : toolPill(p.session),
          trailing: [
            TextButton.icon(key: const Key('ce-paper-remove'), onPressed: () => _remove(p), icon: const Icon(Icons.delete_outline), label: const Text('Remove')),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          [p.subjectLine, p.language, if (p.pageCount > 0) '${p.pageCount} pages'].join(' · '),
          style: ceText(18, c: CeC.body),
        ),
        const SizedBox(height: 2),
        Text(p.source.isEmpty ? 'Source: not given' : 'Source: ${p.source}', style: ceText(15)),
        const SizedBox(height: 22),
        Wrap(
          spacing: 16,
          runSpacing: 16,
          children: [
            action(Icons.slideshow_outlined, 'Show on board', 'Full screen, page by page. Pinch to zoom; put a page on the board.', CeC.blue, 'ce-paper-show', () => openPaperViewer(context, lib: l, paper: p, host: env.host)),
            action(
              Icons.key_outlined,
              'Show answer key',
              p.hasKey ? 'The paper and its key side by side.' : 'No answer key yet. Add it with Add papers.',
              CeC.mint,
              'ce-paper-key',
              p.hasKey ? () => openPaperViewer(context, lib: l, paper: p, host: env.host, showKey: true) : null,
            ),
            action(Icons.timer_outlined, 'Exam timer', '${p.exam.label}: ${rule.timeLine}. A big countdown for a full mock.', CeC.butter, 'ce-paper-timer', () => openExamTimer(context, exam: p.exam, title: p.title)),
            action(
              Icons.quiz_outlined,
              'Practise questions',
              p.hasQuestions ? '${p.questionCount} questions, one at a time. ${rule.markingLine}.' : 'This paper has no question set. Paper packs can bring one.',
              CeC.lavender,
              'ce-paper-practise',
              p.hasQuestions ? () => _startPractice(l, p) : null,
            ),
          ],
        ),
      ],
    );
  }

  // --- Practice -------------------------------------------------------------------------------

  Future<void> _startPractice(PaperLibrary l, Paper p) async {
    setState(() {
      practising = true;
      years = {p.year};
      chapters = {};
    });
    final out = <(Paper, QuestionSet)>[];
    for (final x in l.papers.where((x) => x.exam == p.exam && x.hasQuestions)) {
      final s = await l.questions(x);
      if (s != null) out.add((x, s));
    }
    if (mounted) setState(() => sets = out);
  }

  Widget _practiceSetup(PaperLibrary l, Paper p) {
    final all = sets;
    if (all == null) return const Center(child: CircularProgressIndicator());
    final allYears = {for (final (x, _) in all) x.year}.toList()..sort((a, b) => b.compareTo(a));
    final ofYears = selectPractice(all, years: years);
    final allChapters = {for (final it in ofYears) if (it.q.chapter.isNotEmpty) it.q.chapter}.toList()..sort();
    final items = selectPractice(all, years: years, chapters: chapters);
    final quizzable = items.where((it) => it.q.hasOptions && !it.q.multiCorrect).length;
    final title = [p.exam.label, if (years.length == 1) '${years.single}', if (chapters.length == 1) chapters.single].join(' · ');
    return ListView(
      key: const Key('ce-papers-practice-setup'),
      padding: EdgeInsets.zero,
      children: [
        ToolHeader(title: 'Practise ${p.exam.label}', onBack: () => setState(() => practising = false), pill: toolPill(p.exam.rule.markingLine, icon: Icons.rule_rounded, bg: CeC.butter)),
        const SizedBox(height: 8),
        Text('Questions from the ${p.exam.label} papers on this board. Pick the years and chapters.', style: ceText(17)),
        const SizedBox(height: 20),
        _chipRow('Year', [
          for (final y in allYears)
            choiceChip('$y', on: years.contains(y), offIcon: Icons.add, key: Key('ce-practice-year-$y'), onTap: () => setState(() {
              years.contains(y) ? (years.length > 1 ? years.remove(y) : null) : years.add(y);
              chapters = {};
            })),
        ]),
        const SizedBox(height: 14),
        _chipRow('Chapter', [
          choiceChip('All chapters', on: chapters.isEmpty, offIcon: null, tick: false, key: const Key('ce-practice-chapter-all'), onTap: () => setState(() => chapters = {})),
          for (final c in allChapters)
            choiceChip(c, on: chapters.contains(c), offIcon: null, key: Key('ce-practice-chapter-$c'), onTap: () => setState(() => chapters.contains(c) ? chapters.remove(c) : chapters.add(c))),
        ]),
        const SizedBox(height: 24),
        Text(items.length == 1 ? '1 question' : '${items.length} questions', key: const Key('ce-practice-count'), style: ceHeading(26)),
        const SizedBox(height: 14),
        Wrap(
          spacing: 16,
          runSpacing: 16,
          children: [
            infoCard(
              key: const Key('ce-practice-board-card'),
              icon: Icons.co_present_outlined,
              colour: CeC.lavender,
              title: 'Practise on the board',
              line: 'One question at a time, the options as big tiles. Tap the class\'s answer, then Reveal answer.',
              action: toolButton('Start', icon: Icons.play_arrow_rounded, filled: true, key: const Key('ce-practice-start'), onPressed: items.isEmpty ? null : () => openPractice(context, lib: l, items: items, title: title, host: env.host)),
            ),
            infoCard(
              key: const Key('ce-practice-quiz-card'),
              icon: Icons.fact_check_outlined,
              colour: CeC.mint,
              title: 'Class quiz from this paper',
              line: 'Each question on the board; tap roll numbers right or wrong. Scores use ${p.exam.label} marking and go to the class records.${quizzable < items.length ? ' ${items.length - quizzable} numerical or multi-answer questions are left out.' : ''}',
              action: toolButton(
                'Start the class quiz',
                icon: Icons.groups_2_outlined,
                filled: true,
                key: const Key('ce-practice-class-quiz'),
                onPressed: quizzable == 0 ? null : () => env.open('quiz', arg: paperQuiz(env: env, lib: l, items: items, title: '$title class quiz', backArg: p.id)),
              ),
            ),
          ].map((w) => SizedBox(width: 600, child: w)).toList(),
        ),
      ],
    );
  }
}
