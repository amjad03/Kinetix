import 'package:flutter/material.dart';

import '../ui/ce_style.dart';
import 'paper.dart';
import '../l10n/ce_strings.dart';

/// A paper as it prints (A4, white): the header with the Roll No. line, the parts and their
/// questions. [maxItems] cuts it short (the board picture shows the first page's worth).
class PaperPage extends StatelessWidget {
  const PaperPage({super.key, required this.paper, this.maxItems, this.footer});

  final Paper paper;
  final int? maxItems;
  final String? footer;

  @override
  Widget build(BuildContext context) {
    final p = paper;
    var left = maxItems ?? 1 << 20;
    final body = <Widget>[];
    for (final s in p.sections) {
      if (left <= 0) break;
      body.add(
        Padding(
          padding: const EdgeInsets.only(top: 14, bottom: 2),
          child: Row(
            children: [
              Expanded(
                child: Text(s.heading, style: ceText(15, w: FontWeight.w700, c: CeC.navy)),
              ),
              Text(s.marksLine, style: ceText(14, w: FontWeight.w700, c: CeC.navy)),
            ],
          ),
        ),
      );
      for (final g in s.groups) {
        if (left <= 0) break;
        body.add(
          Padding(
            padding: const EdgeInsets.only(top: 4, bottom: 2),
            child: Text(
              s.groups.length > 1 ? '${g.instruction} ${g.marksLine}' : g.instruction,
              style: ceText(14, c: CeC.body).copyWith(fontStyle: FontStyle.italic),
            ),
          ),
        );
        for (final i in g.items) {
          if (left-- <= 0) break;
          final n = p.items.indexOf(i) + 1;
          body.add(
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 34,
                    child: Text(
                      '$n.',
                      style: ceText(14.5, w: FontWeight.w700, c: CeC.body),
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(i.text, style: ceText(14.5, c: CeC.body, height: 1.35)),
                        if (i.options.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 3),
                            child: Wrap(
                              spacing: 22,
                              runSpacing: 2,
                              children: [for (final (k, o) in i.options.indexed) Text('(${String.fromCharCode(97 + k)}) $o', style: ceText(13.5, c: CeC.body))],
                            ),
                          ),
                      ],
                    ),
                  ),
                  SizedBox(
                    width: 30,
                    child: Text(
                      i.marks == 1 && i.kind == ItemKind.mcq ? '' : fmtMarks(i.marks),
                      textAlign: TextAlign.right,
                      style: ceText(13.5, c: CeC.muted),
                    ),
                  ),
                ],
              ),
            ),
          );
        }
      }
    }
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(44, 40, 44, 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (p.college.isNotEmpty)
            Text(
              p.college,
              textAlign: TextAlign.center,
              style: ceText(21, w: FontWeight.w700, c: CeC.navy),
            ),
          const SizedBox(height: 4),
          Text(
            [p.className, p.subject, p.title].where((s) => s.isNotEmpty).join(' · '),
            textAlign: TextAlign.center,
            style: ceText(16, c: CeC.body),
          ),
          if (p.chapters.isNotEmpty)
            Text(
              p.chapters.join(', '),
              textAlign: TextAlign.center,
              style: ceText(16, w: FontWeight.w600, c: CeC.navy),
            ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: Text(p.minutes > 0 ? 'Time: ${fmtMinutes(p.minutes)}' : 'Date: ________', style: ceText(13.5, c: CeC.body)),
              ),
              Expanded(
                child: Text(
                  ceTr('Roll No. ________'),
                  textAlign: TextAlign.center,
                  style: ceText(14.5, w: FontWeight.w700, c: CeC.body),
                ),
              ),
              Expanded(
                child: Text(
                  'Max. marks: ${fmtMarks(p.maxMarks)}',
                  textAlign: TextAlign.right,
                  style: ceText(13.5, c: CeC.body),
                ),
              ),
            ],
          ),
          if (p.note.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(p.note, style: ceText(12.5)),
            ),
          const SizedBox(height: 10),
          const Divider(color: CeC.line, height: 1),
          ...body,
          if (footer != null) ...[const SizedBox(height: 24), Text(footer!, textAlign: TextAlign.center, style: ceText(13))],
        ],
      ),
    );
  }
}

/// The paper on a grey desk, scrolling, as in the design.
class PaperDesk extends StatelessWidget {
  const PaperDesk({super.key, required this.paper});
  final Paper paper;

  @override
  Widget build(BuildContext context) => Container(
    key: const Key('ce-paper-preview'),
    decoration: BoxDecoration(color: const Color(0xFFE6EBF2), borderRadius: BorderRadius.circular(28)),
    padding: const EdgeInsets.fromLTRB(28, 28, 28, 0),
    child: ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
      child: SingleChildScrollView(
        child: PaperPage(paper: paper, footer: 'Answer key on its own page'),
      ),
    ),
  );
}
