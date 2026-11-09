import 'package:flutter/material.dart';

import '../ui/ce_style.dart';
import '../ui/pdf_out.dart';
import 'bank.dart';
import 'paper.dart';
import 'paper_pdf.dart';
import 'paper_preview.dart';
import 'tool_ui.dart';
import '../l10n/ce_strings.dart';

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
    title: context.ce('Worksheet'),
    seed: seed,
    college: env.college,
    className: env.className,
    subject: env.subject,
    topics: topics,
  );

  /// [print]: to the printer; [save]: to a USB drive or Downloads; else the share sheet.
  Future<void> _out(bool print, {bool save = false}) async {
    final p = sheet;
    setState(() => busy = true);
    try {
      final bytes = await paperPdf([p], withKey: withKey);
      if (!mounted) return;
      if (save) {
        await ceSavePdf(context, bytes, p.fileName);
      } else if (print) {
        await cePrintOrSave(context, bytes, p.fileName, ClassToolsOut.print);
      } else {
        await ClassToolsOut.share(bytes, p.fileName);
      }
    } catch (e) {
      env.host.showMessage(ceTr('Could not make the PDF: {error}', {'error': e}));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (env.bank.chapters.isEmpty) {
      return Column(
        children: [
          ToolHeader(title: context.ce('Worksheets'), onBack: env.back),
          Expanded(child: noBank(env)),
        ],
      );
    }
    final c = chapter;
    final p = sheet;
    final rail = <Widget>[
      ToolHeader(
        title: context.ce('Worksheets'),
        onBack: env.back,
        trailing: [TextButton.icon(key: Key('ce-ws-new'), onPressed: () => setState(() => seed++), icon: Icon(Icons.refresh), label: Text(context.ce('New set')))],
      ),
      Padding(
        padding: const EdgeInsets.only(left: 52),
        child: Text(context.ce('From the question bank, with a Roll No. line. Print, or put on the board.'), style: ceText(17)),
      ),
      const SizedBox(height: 20),
      Text(
        ceTr('Chapter'),
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
          ceTr('Topics'),
          style: ceText(17, w: FontWeight.w600, c: CeC.navy),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            choiceChip(ceTr('All topics'), on: topics.isEmpty, offIcon: null, onTap: () => setState(() => topics = {})),
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
            _row(ceTr('Multiple choice'), ceTr('1 mark each'), mcq, (v) => setState(() => mcq = v), 'mcq', max: 20),
            const SizedBox(height: 10),
            _row(ceTr('Short answers'), ceTr('2 marks each'), short, (v) => setState(() => short = v), 'short', max: 8),
            const SizedBox(height: 10),
            _row(ceTr('Problems'), ceTr('3 marks each'), problems, (v) => setState(() => problems = v), 'problems', max: 8),
          ],
        ),
      ),
      const SizedBox(height: 10),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        value: withKey,
        onChanged: (v) => setState(() => withKey = v),
        title: Text(
          ceTr('Answer key on its own page'),
          style: ceText(17, w: FontWeight.w600, c: CeC.navy),
        ),
        subtitle: Text(context.ce('Printed last, for you'), style: ceText(14.5)),
      ),
      if (p.items.length < mcq + short + problems) Text(ceTr('This chapter has {n} questions of these kinds; the sheet is shorter.', {'n': p.items.length}), style: ceText(14.5, c: CeC.red)),
    ];
    final actions = Wrap(
      spacing: 12,
      runSpacing: 12,
      children: [
        toolButton(
          ceTr('Put on board'),
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
        // No print service on this board: Save leads (ui/pdf_out.dart).
        if (CePdfOut.leadWithSave) toolButton(cePdfSaveLabel(context), icon: Icons.save_alt, filled: true, onPressed: busy || p.isEmpty ? null : () => _out(false, save: true), key: const Key('ce-ws-save')),
        toolButton(ceTr('Export PDF'), icon: Icons.picture_as_pdf_outlined, onPressed: busy || p.isEmpty ? null : () => _out(false), key: const Key('ce-ws-pdf')),
        toolButton(ceTr('Print'), icon: Icons.print_outlined, filled: !CePdfOut.leadWithSave, onPressed: busy || p.isEmpty ? null : () => _out(true), key: const Key('ce-ws-print')),
        if (!CePdfOut.leadWithSave) toolButton(cePdfSaveLabel(context), icon: Icons.save_alt, onPressed: busy || p.isEmpty ? null : () => _out(false, save: true), key: const Key('ce-ws-save')),
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
