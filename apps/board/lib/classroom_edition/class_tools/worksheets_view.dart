import 'package:flutter/material.dart';

import '../ui/ce_style.dart';
import 'bank.dart';
import 'paper.dart';
import 'paper_pdf.dart';
import 'paper_preview.dart';
import 'tool_ui.dart';

/// Worksheets from the bank (no AI): pick the chapter and topics and how many of each kind,
/// preview, print or export with a Roll No. line and the answer key on its own page.
class WorksheetsView extends StatefulWidget {
  const WorksheetsView({super.key, required this.env});
  final ToolEnv env;

  @override
  State<WorksheetsView> createState() => _WorksheetsViewState();
}

class _WorksheetsViewState extends State<WorksheetsView> {
  ToolEnv get env => widget.env;
  late String? chapterId = env.startChapter?.id;
  Set<String> topics = {};
  int mcq = 6, short = 2, problems = 2;
  late int seed = env.now().millisecondsSinceEpoch % 100000;
  bool withKey = true, busy = false;

  BankChapter? get chapter => env.bank.chapter(chapterId);

  Paper get sheet => buildPaper(
    chapters: [?chapter],
    pattern: worksheetPattern(mcq: mcq, short: short, problems: problems),
    title: 'Worksheet',
    seed: seed,
    college: env.college,
    className: env.className,
    subject: env.subject,
    topics: topics,
  );

  Future<void> _out(bool print) async {
    final p = sheet;
    setState(() => busy = true);
    try {
      final bytes = await paperPdf([p], withKey: withKey);
      await (print ? ClassToolsOut.print : ClassToolsOut.share)(bytes, p.fileName);
    } catch (e) {
      env.host.showMessage('Could not make the PDF: $e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (env.bank.chapters.isEmpty) {
      return Column(
        children: [
          ToolHeader(title: 'Worksheets', onBack: env.back),
          Expanded(child: noBank(env)),
        ],
      );
    }
    final c = chapter;
    final p = sheet;
    final rail = <Widget>[
      ToolHeader(
        title: 'Worksheets',
        onBack: env.back,
        trailing: [TextButton.icon(key: const Key('ce-ws-new'), onPressed: () => setState(() => seed++), icon: const Icon(Icons.refresh), label: const Text('New set'))],
      ),
      Padding(
        padding: const EdgeInsets.only(left: 52),
        child: Text('From the question bank, with a Roll No. line. Print, or put on the board.', style: ceText(17)),
      ),
      const SizedBox(height: 20),
      Text(
        'Chapter',
        style: ceText(17, w: FontWeight.w600, c: CeC.navy),
      ),
      const SizedBox(height: 10),
      ChapterPicker(
        bank: env.bank,
        selected: [?chapterId],
        onChanged: (s) => setState(() {
          chapterId = s.first;
          topics = {};
        }),
      ),
      if (c != null && c.topics.length > 1) ...[
        const SizedBox(height: 18),
        Text(
          'Topics',
          style: ceText(17, w: FontWeight.w600, c: CeC.navy),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            choiceChip('All topics', on: topics.isEmpty, offIcon: null, onTap: () => setState(() => topics = {})),
            for (final (id, title) in c.topics) choiceChip(title, on: topics.contains(id), offIcon: null, onTap: () => setState(() => topics.contains(id) ? topics.remove(id) : topics.add(id))),
          ],
        ),
      ],
      const SizedBox(height: 18),
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: CeC.peach, borderRadius: BorderRadius.circular(24)),
        child: Column(
          children: [
            _row('Multiple choice', '1 mark each', mcq, (v) => setState(() => mcq = v), 'mcq', max: 20),
            const SizedBox(height: 10),
            _row('Short answers', '2 marks each', short, (v) => setState(() => short = v), 'short', max: 8),
            const SizedBox(height: 10),
            _row('Problems', '3 marks each', problems, (v) => setState(() => problems = v), 'problems', max: 8),
          ],
        ),
      ),
      const SizedBox(height: 10),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        value: withKey,
        onChanged: (v) => setState(() => withKey = v),
        title: Text(
          'Answer key on its own page',
          style: ceText(17, w: FontWeight.w600, c: CeC.navy),
        ),
        subtitle: Text('Printed last, for you', style: ceText(14.5)),
      ),
      if (p.items.length < mcq + short + problems) Text('This chapter has ${p.items.length} questions of these kinds; the sheet is shorter.', style: ceText(14.5, c: CeC.red)),
    ];
    final actions = Wrap(
      spacing: 12,
      runSpacing: 12,
      children: [
        toolButton(
          'Put on board',
          icon: Icons.co_present_outlined,
          onPressed: p.isEmpty
              ? null
              : () async {
                  env.host.newPage();
                  await env.host.putWidget(
                    PaperPage(paper: p, maxItems: 8),
                    size: const Size(1000, 1300),
                    context: context,
                    pixelRatio: 1.5,
                    at: const Offset(460, 40),
                  );
                },
          key: const Key('ce-ws-board'),
        ),
        toolButton('Export PDF', icon: Icons.picture_as_pdf_outlined, onPressed: busy || p.isEmpty ? null : () => _out(false), key: const Key('ce-ws-pdf')),
        toolButton('Print', icon: Icons.print_outlined, filled: true, onPressed: busy || p.isEmpty ? null : () => _out(true), key: const Key('ce-ws-print')),
      ],
    );
    return LayoutBuilder(
      builder: (context, box) {
        final wide = box.maxWidth > 1300;
        final left = Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: ListView(
                key: const Key('ce-worksheets'),
                padding: EdgeInsets.zero,
                children: [
                  ...rail,
                  if (!wide) ...[const SizedBox(height: 18), SizedBox(height: 720, child: PaperDesk(paper: p))],
                ],
              ),
            ),
            const SizedBox(height: 10),
            actions,
          ],
        );
        return wide
            ? Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SizedBox(width: 640, child: left),
                  const SizedBox(width: 36),
                  Expanded(child: PaperDesk(paper: p)),
                ],
              )
            : left;
      },
    );
  }

  Widget _row(String what, String marks, int v, ValueChanged<int> on, String key, {int max = 20}) => Container(
    padding: const EdgeInsets.fromLTRB(18, 8, 12, 8),
    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
    child: Row(
      children: [
        Text(
          what,
          style: ceText(17, w: FontWeight.w700, c: CeC.navy),
        ),
        const SizedBox(width: 12),
        Expanded(child: Text(marks, style: ceText(16))),
        stepper(v, onChanged: on, max: max, key: Key('ce-ws-$key')),
      ],
    ),
  );
}
