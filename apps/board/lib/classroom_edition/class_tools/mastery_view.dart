import 'package:flutter/material.dart';

import '../ui/ce_style.dart';
import 'class_logic.dart';
import 'paper_pdf.dart';
import 'tool_ui.dart';
import '../l10n/ce_strings.dart';

const masteryColours = {
  MasteryLevel.none: Color(0xFFF8FAFC),
  MasteryLevel.notYet: Color(0xFFFBE3EC),
  MasteryLevel.gettingThere: Color(0xFFFFF4CC),
  MasteryLevel.secure: Color(0xFFCFEBDC),
  MasteryLevel.mastered: Color(0xFF80C99F),
};

/// Mastery map: topics × roll numbers from the class quizzes and mock tests, the class's score
/// per topic and what to do next. Roll numbers only.
class MasteryView extends StatefulWidget {
  const MasteryView({super.key, required this.env, this.chapterId});
  final ToolEnv env;
  final String? chapterId;

  @override
  State<MasteryView> createState() => _MasteryViewState();
}

class _MasteryViewState extends State<MasteryView> {
  ToolEnv get env => widget.env;

  /// Chapters with records, latest first.
  List<String> get recorded {
    final out = <String>[];
    for (final q in env.records.records.quizzes.reversed) {
      if (!out.contains(q.chapterId)) out.add(q.chapterId);
    }
    for (final m in env.records.records.mocks.reversed) {
      for (final k in m.topics.keys) {
        final c = k.split('|').first;
        if (m.marks.isNotEmpty && !out.contains(c)) out.add(c);
      }
    }
    return out;
  }

  late String? chapterId = widget.chapterId ?? recorded.firstOrNull;

  String chapterTitle(String id) => env.bank.chapter(id)?.title ?? (id.isEmpty ? ceTr('Questions') : id);

  MasteryMap get map => buildMastery(records: env.records.records, rolls: env.rolls, chapterId: chapterId, titleOf: (c, t) => env.bank.topicTitle(c, t), now: env.now());

  Future<void> _print(MasteryMap m) async {
    try {
      final bytes = await masteryPdf(m, title: context.ce('Mastery map'), subtitle: [env.classLine, if (chapterId != null) chapterTitle(chapterId!)].join(' · '));
      await ClassToolsOut.print(bytes, 'Mastery-map.pdf');
    } catch (e) {
      env.host.showMessage(ceTr('Could not print: {error}', {'error': e}));
    }
  }

  @override
  Widget build(BuildContext context) {
    final chapters = recorded;
    final m = map;
    final header = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ToolHeader(title: context.ce('Mastery map'), onBack: env.back),
        LayoutBuilder(
          builder: (context, box) {
            final sub = Text([env.classLine, if (chapterId != null) chapterTitle(chapterId!), ceTr('from class quizzes and mock tests')].where((s) => s.isNotEmpty).join(' · '), style: ceText(17));
            final legend = Wrap(
              spacing: 18,
              runSpacing: 6,
              children: [
                for (final (l, name) in [(MasteryLevel.notYet, ceTr('Not yet')), (MasteryLevel.gettingThere, ceTr('Getting there')), (MasteryLevel.secure, ceTr('Secure')), (MasteryLevel.mastered, ceTr('Mastered'))])
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 20,
                        height: 20,
                        decoration: BoxDecoration(color: masteryColours[l], borderRadius: BorderRadius.circular(5)),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        name,
                        style: ceText(15.5, w: FontWeight.w600, c: CeC.navy),
                      ),
                    ],
                  ),
              ],
            );
            return box.maxWidth > 1300
                ? Padding(
                    padding: const EdgeInsets.only(left: 52),
                    child: Row(
                      children: [
                        Expanded(child: sub),
                        legend,
                      ],
                    ),
                  )
                : Padding(
                    padding: const EdgeInsets.only(left: 52),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [sub, const SizedBox(height: 10), legend]),
                  );
          },
        ),
        if (chapters.length > 1) ...[
          const SizedBox(height: 14),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final c in chapters) ...[choiceChip(chapterTitle(c), on: c == chapterId, offIcon: null, onTap: () => setState(() => chapterId = c)), const SizedBox(width: 8)],
              ],
            ),
          ),
        ],
        const SizedBox(height: 18),
      ],
    );
    if (m.isEmpty) {
      return Column(
        children: [
          header,
          Expanded(
            child: ToolEmpty(icon: Icons.grid_view_rounded, title: context.ce('Nothing to show yet'), line: context.ce('Give a class quiz, or enter a mock test\'s marks. Every topic then fills in here, by roll number.')),
          ),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        header,
        Expanded(
          child: ListView(key: const Key('ce-mastery'), padding: EdgeInsets.zero, children: [_table(m), const SizedBox(height: 22), _insights(m)]),
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(child: Text(context.ce('Only roll numbers are shown. Updated after every class quiz.'), style: ceText(15))),
            toolButton(ceTr('Print'), icon: Icons.print_outlined, onPressed: () => _print(m), key: const Key('ce-mastery-print')),
            const SizedBox(width: 12),
            toolButton(
              ceTr('Make a revision quiz'),
              icon: Icons.fact_check_outlined,
              filled: true,
              key: const Key('ce-mastery-revise'),
              onPressed: () {
                final weak = [...m.rows]..sort((a, b) => a.classScore!.compareTo(b.classScore!));
                env.open('quiz', arg: [for (final r in weak.take(2)) r.key]);
              },
            ),
          ],
        ),
      ],
    );
  }

  Widget _table(MasteryMap m) => Container(
    padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
    decoration: ceCard(shadow: false),
    child: LayoutBuilder(
      builder: (context, box) {
        final labelW = box.maxWidth > 1300 ? 270.0 : 190.0;
        const classW = 70.0;
        final n = m.rolls.length;
        final cell = ((box.maxWidth - labelW - classW) / n).clamp(10.0, 60.0);
        final rowH = box.maxWidth > 1300 ? 68.0 : 52.0;
        final width = labelW + classW + cell * n;
        final table = SizedBox(
          width: width,
          child: Column(
            children: [
              Row(
                children: [
                  SizedBox(
                    width: labelW,
                    child: Text(
                      ceTr('Roll number'),
                      style: ceText(13.5, w: FontWeight.w600, c: CeC.navy),
                    ),
                  ),
                  for (final r in m.rolls)
                    // Narrow cells: the label is centred on its column and may spill over its
                    // neighbours (only every fifth one shows), never wrapped digit by digit.
                    SizedBox(
                      width: cell,
                      height: 20,
                      child: OverflowBox(
                        minWidth: 0,
                        maxWidth: cell < 48 ? 48 : cell,
                        child: Text(
                          cell < 22 && r % 5 != 0 && r != 1 ? '' : rollLabel(r),
                          textAlign: TextAlign.center,
                          maxLines: 1,
                          softWrap: false,
                          style: ceText(cell < 30 ? 11 : 13.5, c: CeC.navy),
                        ),
                      ),
                    ),
                  SizedBox(
                    width: classW,
                    child: Text(
                      ceTr('Class'),
                      textAlign: TextAlign.right,
                      style: ceText(13.5, w: FontWeight.w600, c: CeC.navy),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              for (final row in m.rows)
                SizedBox(
                  height: rowH,
                  child: Row(
                    children: [
                      SizedBox(
                        width: labelW,
                        child: Text(
                          row.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: ceText(16.5, w: FontWeight.w600, c: CeC.navy),
                        ),
                      ),
                      for (final r in m.rolls)
                        Container(
                          key: Key('ce-cell-${row.topic}-$r'),
                          width: cell - (cell > 16 ? 4 : 1.5),
                          height: rowH - 8,
                          margin: EdgeInsets.symmetric(horizontal: cell > 16 ? 2 : 0.75),
                          decoration: BoxDecoration(color: masteryColours[levelOf(row.scores[r])], borderRadius: BorderRadius.circular(cell > 16 ? 6 : 3)),
                        ),
                      SizedBox(
                        width: classW,
                        child: Text(row.classScore == null ? '–' : '${(row.classScore! * 100).round()}%', textAlign: TextAlign.right, style: ceHeading(20)),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        );
        return width > box.maxWidth + 1 ? SingleChildScrollView(scrollDirection: Axis.horizontal, child: table) : table;
      },
    ),
  );

  Widget _insights(MasteryMap m) {
    final cards = [
      for (final i in m.insights)
        switch (i.kind) {
          'revisit' => infoCard(icon: Icons.replay_rounded, title: i.title, line: i.line, colour: CeC.pink, key: const Key('ce-insight-revisit')),
          'strongest' => infoCard(icon: Icons.emoji_events_outlined, title: i.title, line: i.line, colour: CeC.mint, key: const Key('ce-insight-strongest')),
          _ => infoCard(icon: Icons.groups_2_outlined, title: i.title, line: i.line, colour: CeC.butter, key: const Key('ce-insight-group')),
        },
    ];
    return LayoutBuilder(
      builder: (context, box) => box.maxWidth > 1300
          ? IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final (k, c) in cards.indexed) ...[if (k > 0) const SizedBox(width: 20), Expanded(child: c)],
                ],
              ),
            )
          : Column(
              children: [
                for (final (k, c) in cards.indexed) ...[if (k > 0) const SizedBox(height: 14), c],
              ],
            ),
    );
  }
}
