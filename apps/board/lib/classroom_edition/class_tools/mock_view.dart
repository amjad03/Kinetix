import 'package:flutter/material.dart';

import '../ui/ce_style.dart';
import 'bank.dart';
import 'class_logic.dart';
import 'class_records.dart';
import 'paper.dart';
import 'paper_pdf.dart';
import 'paper_preview.dart';
import 'tool_ui.dart';

/// Mock test: the PUC board pattern (or an entrance pattern) built from the chosen chapters,
/// previewed as it prints with a Roll No. line, printed for the class or exported as PDF with the
/// answer key on its own page, then the marks entered by roll number.
class MockTestView extends StatefulWidget {
  const MockTestView({super.key, required this.env});
  final ToolEnv env;

  @override
  State<MockTestView> createState() => _MockTestViewState();
}

class _MockTestViewState extends State<MockTestView> {
  ToolEnv get env => widget.env;
  late List<String> chapters = [?env.startChapter?.id];
  late PaperPattern pattern = env.bank.source == BankSource.school ? pucPatterns.first : pucPatterns.last;
  late List<PaperPart> parts = pattern.parts;
  late int seed = env.now().millisecondsSinceEpoch % 100000;
  bool shuffle = true;
  bool busy = false;
  bool entering = false;

  int get mockNo => env.records.records.mocks.length + 1;
  String get mockId => 'mock-$seed-${pattern.id}-${chapters.join(',')}';
  MockRecord? get saved => env.records.records.mocks.where((m) => m.id == mockId).firstOrNull;
  String get title => saved?.title ?? 'Mock test $mockNo';

  PaperPattern get effective => PaperPattern(id: pattern.id, name: pattern.name, minutes: pattern.minutes, parts: parts, note: pattern.note);

  Paper get paper =>
      buildPaper(chapters: [for (final id in chapters) ?env.bank.chapter(id)], pattern: effective, title: title, seed: seed, college: env.college, className: env.className, subject: env.subject);

  List<PaperPattern> get patterns => [...pucPatterns, for (final e in env.bank.patterns) entranceAsPattern(e, env.bank.subject)];

  void _pick(PaperPattern p) => setState(() {
    pattern = p;
    parts = p.parts;
  });

  void _count(int part, int delta) => setState(() {
    final p = parts[part];
    final first = p.slots.first;
    parts = [
      for (final (i, x) in parts.indexed) i == part ? x.withSlots([PaperSlot(first.kind, (first.count + delta).clamp(0, 60), first.marks), ...p.slots.skip(1)]) : x,
    ];
  });

  /// Keeps this paper as a mock test of the class (its topics feed the mastery map).
  Future<MockRecord> _record(Paper p) async {
    final had = saved;
    if (had != null) return had;
    final m = MockRecord(
      id: mockId,
      at: env.now(),
      title: p.title,
      maxMarks: p.maxMarks.toDouble(),
      chapterIds: chapters,
      topics: {for (final k in p.topicKeys) k: env.bank.topicTitle(k.split('|').first, k.split('|').last)},
    );
    await env.records.putMock(m);
    return m;
  }

  Future<void> _out({required bool print}) async {
    final p = paper;
    if (p.isEmpty) return;
    setState(() => busy = true);
    try {
      await _record(p);
      final sets = shuffle ? [p.copyWith(set: 'A'), shuffledPaper(p, seed: seed + 1)] : [p];
      final copies = print ? env.present.length.clamp(1, 200) : 1;
      final bytes = await paperPdf(print ? sets : [sets.first], copies: copies);
      await (print ? ClassToolsOut.print : ClassToolsOut.share)(bytes, p.fileName);
    } catch (e) {
      env.host.showMessage('Could not make the PDF: $e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _putOnBoard() async {
    final p = paper;
    env.host.newPage();
    await env.host.putWidget(
      PaperPage(paper: p, maxItems: 8),
      size: const Size(1000, 1300),
      context: context,
      pixelRatio: 1.5,
      at: const Offset(460, 40),
    );
    env.host.showMessage('The paper is on the board');
  }

  @override
  Widget build(BuildContext context) {
    if (env.bank.chapters.isEmpty) {
      return Column(
        children: [
          ToolHeader(title: 'Mock test', onBack: env.back),
          Expanded(child: noBank(env)),
        ],
      );
    }
    if (entering) return _MarksEntry(env: env, mockId: mockId, onDone: () => setState(() => entering = false));
    final p = paper;
    return LayoutBuilder(
      builder: (context, box) {
        final wide = box.maxWidth > 1300;
        final rail = _rail(p, wide);
        if (wide) {
          return Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(width: 640, child: rail),
              const SizedBox(width: 36),
              Expanded(child: PaperDesk(paper: p)),
            ],
          );
        }
        return rail;
      },
    );
  }

  Widget _rail(Paper p, bool wide) {
    final last = env.records.records.mocks.where((m) => m.marks.isNotEmpty).lastOrNull;
    final enterMarks = TextButton.icon(
      key: const Key('ce-mock-enter'),
      onPressed: p.isEmpty
          ? null
          : () async {
              await _record(p);
              setState(() => entering = true);
            },
      icon: const Icon(Icons.edit_note_rounded),
      label: Text('Enter marks for ${p.title}'),
    );
    final content = <Widget>[
      ToolHeader(title: 'Mock test', onBack: env.back),
      Padding(
        padding: const EdgeInsets.only(left: 52),
        child: Text('PUC board pattern. Made from your lessons, on this board.', style: ceText(17)),
      ),
      const SizedBox(height: 22),
      Text(
        'Chapters',
        style: ceText(17, w: FontWeight.w600, c: CeC.navy),
      ),
      const SizedBox(height: 10),
      ChapterPicker(bank: env.bank, selected: chapters, multi: true, onChanged: (s) => setState(() => chapters = s)),
      const SizedBox(height: 18),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (final x in patterns) ...[choiceChip(x.name, on: x.id == pattern.id, offIcon: null, tick: false, key: Key('ce-pattern-${x.id}'), onTap: () => _pick(x)), const SizedBox(width: 8)],
          ],
        ),
      ),
      const SizedBox(height: 14),
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: CeC.peach, borderRadius: BorderRadius.circular(24)),
        child: Column(
          children: [
            for (final (i, part) in parts.indexed) ...[
              if (i > 0) const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.fromLTRB(18, 8, 12, 8),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
                child: Row(
                  children: [
                    Text(
                      'Part ${part.label}',
                      style: ceText(17, w: FontWeight.w700, c: CeC.navy),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Text(
                        part.summary,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ceText(16.5, c: CeC.navy),
                      ),
                    ),
                    stepper(part.slots.first.count, min: 0, max: 60, onChanged: (v) => _count(i, v - part.slots.first.count), key: Key('ce-part-${part.label}')),
                    SizedBox(
                      width: 44,
                      child: Text(
                        fmtMarks(part.total),
                        textAlign: TextAlign.right,
                        style: ceText(17, w: FontWeight.w700, c: CeC.navy),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
      const SizedBox(height: 16),
      Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          toolPill('${fmtMarks(p.maxMarks)} marks', icon: Icons.star_border_rounded, bg: CeC.butter, key: const Key('ce-mock-marks')),
          if (p.minutes > 0) toolPill(fmtMinutes(p.minutes), icon: Icons.timer_outlined, bg: CeC.blue),
          toolPill('Answer key on its own page', icon: Icons.key_outlined, bg: CeC.mint),
        ],
      ),
      if (p.maxMarks < effective.maxMarks) ...[
        const SizedBox(height: 8),
        Text('These chapters have fewer questions than the pattern asks for; the paper is shorter.', style: ceText(14.5, c: CeC.red)),
      ],
      const SizedBox(height: 10),
      SwitchListTile(
        key: const Key('ce-mock-shuffle'),
        contentPadding: EdgeInsets.zero,
        value: shuffle,
        onChanged: (v) => setState(() => shuffle = v),
        title: Text(
          'Shuffle the order for each bench',
          style: ceText(17, w: FontWeight.w600, c: CeC.navy),
        ),
        subtitle: Text('Neighbours get the same questions in a different order', style: ceText(14.5)),
      ),
      const SizedBox(height: 10),
      if (last != null)
        infoCard(
          icon: Icons.insights_rounded,
          title: 'Last time: ${last.title}',
          line: 'Class average ${fmtMarks((last.average ?? 0).round())} of ${fmtMarks(last.maxMarks)}, from ${last.marks.length} roll numbers.',
          action: enterMarks,
        )
      else
        infoCard(icon: Icons.insights_rounded, title: 'After the test', line: 'Enter each roll number\'s marks here. They go into the mastery map with the class quizzes.', action: enterMarks),
      if (!wide) ...[const SizedBox(height: 20), SizedBox(height: 760, child: PaperDesk(paper: p))],
      const SizedBox(height: 20),
    ];
    final actions = Wrap(
      spacing: 12,
      runSpacing: 12,
      children: [
        toolButton('Put on board', icon: Icons.co_present_outlined, onPressed: p.isEmpty ? null : _putOnBoard, key: const Key('ce-mock-board')),
        toolButton('Export PDF', icon: Icons.picture_as_pdf_outlined, onPressed: busy || p.isEmpty ? null : () => _out(print: false), key: const Key('ce-mock-pdf')),
        toolButton('Print ${env.present.length} copies', icon: Icons.print_outlined, filled: true, onPressed: busy || p.isEmpty ? null : () => _out(print: true), key: const Key('ce-mock-print')),
      ],
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: ListView(key: const Key('ce-mock'), padding: EdgeInsets.zero, children: content),
        ),
        const SizedBox(height: 10),
        actions,
      ],
    );
  }
}

/// Marks by roll number: pick a roll, type the marks on the keypad, Next. Absent rolls are
/// skipped; the marks are saved as they are entered.
class _MarksEntry extends StatefulWidget {
  const _MarksEntry({required this.env, required this.mockId, required this.onDone});
  final ToolEnv env;
  final String mockId;
  final VoidCallback onDone;

  @override
  State<_MarksEntry> createState() => _MarksEntryState();
}

class _MarksEntryState extends State<_MarksEntry> {
  ToolEnv get env => widget.env;
  MockRecord get mock => env.records.records.mocks.firstWhere((m) => m.id == widget.mockId);
  late int? roll = env.present.where((r) => !mock.marks.containsKey(r)).firstOrNull ?? env.present.firstOrNull;
  String typed = '';

  Future<void> _commit() async {
    final r = roll;
    final v = double.tryParse(typed);
    if (r == null || v == null) return;
    await env.records.putMock(mock.withMarks({...mock.marks, r: v.clamp(0, mock.maxMarks).toDouble()}));
    final present = env.present;
    final next = present.skip(present.indexOf(r) + 1).where((x) => !mock.marks.containsKey(x)).firstOrNull;
    setState(() {
      typed = '';
      roll = next ?? r;
    });
  }

  void _key(String k) => setState(() {
    if (k == '⌫') {
      typed = typed.isEmpty ? '' : typed.substring(0, typed.length - 1);
    } else if (k == '.') {
      if (!typed.contains('.')) typed = typed.isEmpty ? '0.5' : '$typed.5';
    } else if (typed.length < 4) {
      typed += k;
    }
  });

  @override
  Widget build(BuildContext context) {
    final m = mock;
    final avg = m.average;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ToolHeader(
          title: 'Marks · ${m.title}',
          onBack: widget.onDone,
          pill: toolPill('out of ${fmtMarks(m.maxMarks)}', bg: CeC.butter),
        ),
        const SizedBox(height: 10),
        Text('Tap a roll number, type the marks, then Next. ${m.marks.length} of ${env.present.length} entered${avg == null ? '' : ' · class average ${avg.toStringAsFixed(1)}'}.', style: ceText(16)),
        const SizedBox(height: 14),
        Expanded(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: SingleChildScrollView(
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final r in env.rolls)
                        SizedBox(
                          width: 76,
                          height: 64,
                          child: Material(
                            color: env.absent.contains(r)
                                ? const Color(0xFFEFF2F6)
                                : r == roll
                                ? CeC.blue
                                : m.marks.containsKey(r)
                                ? CeC.mint
                                : Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                              side: BorderSide(color: r == roll ? CeC.accent : CeC.line, width: r == roll ? 2 : 1),
                            ),
                            child: InkWell(
                              key: Key('ce-marks-roll-$r'),
                              borderRadius: BorderRadius.circular(12),
                              onTap: env.absent.contains(r)
                                  ? null
                                  : () => setState(() {
                                      roll = r;
                                      typed = '';
                                    }),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(
                                    rollLabel(r),
                                    style: ceText(15, w: FontWeight.w700, c: CeC.navy),
                                  ),
                                  Text(
                                    env.absent.contains(r)
                                        ? 'AB'
                                        : m.marks[r] == null
                                        ? '–'
                                        : fmtMarks(m.marks[r]!),
                                    style: ceText(14, c: CeC.muted),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 20),
              SizedBox(
                width: 300,
                child: Column(
                  children: [
                    Container(
                      key: const Key('ce-marks-display'),
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(color: CeC.blue, borderRadius: BorderRadius.circular(18)),
                      child: Column(
                        children: [
                          Text(
                            roll == null ? '' : 'Roll ${rollLabel(roll!)}',
                            style: ceText(17, w: FontWeight.w600, c: CeC.navy),
                          ),
                          Text(typed.isEmpty ? (roll != null && m.marks[roll] != null ? fmtMarks(m.marks[roll]!) : '–') : typed, style: ceHeading(48)),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                    for (final row in const [
                      ['1', '2', '3'],
                      ['4', '5', '6'],
                      ['7', '8', '9'],
                      ['.', '0', '⌫'],
                    ])
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          children: [
                            for (final k in row)
                              Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 4),
                                  child: OutlinedButton(
                                    key: Key('ce-key-$k'),
                                    style: ceSoftButton(),
                                    onPressed: () => _key(k),
                                    child: Text(k == '.' ? '½' : k, style: ceHeading(22)),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    SizedBox(
                      width: double.infinity,
                      child: toolButton('Next', icon: Icons.arrow_forward, filled: true, onPressed: typed.isEmpty ? null : _commit, key: const Key('ce-marks-next')),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
