import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../classroom_hooks.dart';
import '../ui/ce_style.dart';
import 'bank.dart';
import 'class_records.dart';

/// What every Class tool works with: the board ([host]), this class's records, the subject's
/// bank, and the hub's navigation.
class ToolEnv {
  ToolEnv({required this.host, required this.records, required this.bank, required this.back, required this.open});

  final ClassroomHost host;
  final ClassToolsStore records;
  final SubjectBank bank;

  /// Back to the hub's grid.
  final VoidCallback back;

  /// Opens another tool ([arg]: what it starts with, e.g. topic keys for a revision quiz).
  final void Function(String id, {Object? arg}) open;

  String get className => host.currentClass?.name ?? '';
  String get subject => host.subject ?? '';
  String get college => host.store.college;
  DateTime now() => host.store.now();

  /// "1st PUC A · Physics".
  String get classLine => [className, subject].where((s) => s.isNotEmpty).join(' · ');

  List<int> get rolls => host.rolls;
  Set<int> get absent => host.absentRolls;
  List<int> get present => host.presentRolls;

  /// The chapter to start on: today's period's topic, else the last one quizzed, else the first.
  BankChapter? get startChapter {
    final slot = host.store.currentSlot;
    final byTopic = bank.chapterFor(slot?.topic);
    if (byTopic != null) return byTopic;
    for (final q in records.records.quizzes.reversed) {
      final c = bank.chapter(q.chapterId);
      if (c != null) return c;
    }
    return bank.chapters.firstOrNull;
  }

  /// Ink colour for text put on the board.
  Color get ink => host.wb.background.isDark ? WhiteboardController.chalkWhite : WhiteboardController.inkBlack;
}

/// A tool's title row: back to the hub, the title, an optional pill and actions on the right.
class ToolHeader extends StatelessWidget {
  const ToolHeader({super.key, required this.title, required this.onBack, this.pill, this.trailing = const []});

  final String title;
  final VoidCallback onBack;
  final Widget? pill;
  final List<Widget> trailing;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      IconButton(
        key: const Key('ce-tools-back'),
        tooltip: 'All class tools',
        onPressed: onBack,
        icon: const Icon(Icons.arrow_back_rounded, color: CeC.navy),
      ),
      const SizedBox(width: 4),
      Flexible(
        child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: ceHeading(34)),
      ),
      if (pill != null) ...[const SizedBox(width: 14), pill!],
      const Spacer(),
      ...trailing,
    ],
  );
}

/// A small pill (lavender, navy text) like "Question 3 of 5".
Widget toolPill(String text, {IconData? icon, Color bg = CeC.lavender, Key? key}) => Container(
  key: key,
  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
  decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
  child: Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      if (icon != null) ...[Icon(icon, size: 17, color: CeC.navy), const SizedBox(width: 6)],
      Text(
        text,
        style: ceText(14.5, w: FontWeight.w600, c: CeC.navy),
      ),
    ],
  ),
);

/// A chip to pick something: lavender with a tick when on, white with a plus when off.
Widget choiceChip(String label, {required bool on, required VoidCallback onTap, Key? key, IconData? offIcon = Icons.add, bool tick = true}) => Material(
  key: key,
  color: on ? CeC.lavender : Colors.white,
  shape: StadiumBorder(side: BorderSide(color: on ? CeC.lavender : CeC.line)),
  child: InkWell(
    customBorder: const StadiumBorder(),
    onTap: onTap,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (on && tick) const Icon(Icons.check, size: 18, color: CeC.navy) else if (!on && offIcon != null) Icon(offIcon, size: 18, color: CeC.navy),
          if ((on && tick) || (!on && offIcon != null)) const SizedBox(width: 8),
          Flexible(
            child: Text(
              label,
              overflow: TextOverflow.ellipsis,
              style: ceText(15, w: FontWeight.w600, c: CeC.navy),
            ),
          ),
        ],
      ),
    ),
  ),
);

/// A big rounded button (filled, or white with a line).
Widget toolButton(String label, {IconData? icon, VoidCallback? onPressed, bool filled = false, Key? key}) {
  final child = Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      if (icon != null) ...[Icon(icon, size: 20), const SizedBox(width: 8)],
      Text(label),
    ],
  );
  return filled ? FilledButton(key: key, onPressed: onPressed, style: ceBigButton(), child: child) : OutlinedButton(key: key, onPressed: onPressed, style: ceSoftButton(), child: child);
}

/// A card with a pastel background, an icon dot, a title and a line.
Widget infoCard({required IconData icon, required String title, required String line, Color colour = CeC.lavender, Key? key, Widget? action}) => Container(
  key: key,
  padding: const EdgeInsets.all(22),
  decoration: BoxDecoration(color: colour, borderRadius: BorderRadius.circular(24)),
  child: Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      ceIconDot(icon, size: 46),
      const SizedBox(width: 18),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: ceHeading(21)),
            const SizedBox(height: 6),
            Text(line, style: ceText(15, height: 1.4)),
            if (action != null) ...[const SizedBox(height: 10), action],
          ],
        ),
      ),
    ],
  ),
);

/// What a tool shows when it has nothing to work with.
class ToolEmpty extends StatelessWidget {
  const ToolEmpty({super.key, required this.icon, required this.title, required this.line});
  final IconData icon;
  final String title;
  final String line;

  @override
  Widget build(BuildContext context) => Center(
    child: Container(
      key: const Key('ce-tools-empty'),
      constraints: const BoxConstraints(maxWidth: 620),
      padding: const EdgeInsets.all(36),
      decoration: ceCard(shadow: false),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ceIconDot(icon, bg: CeC.lavender, size: 64),
          const SizedBox(height: 18),
          Text(title, textAlign: TextAlign.center, style: ceHeading(24)),
          const SizedBox(height: 10),
          Text(line, textAlign: TextAlign.center, style: ceText(16, height: 1.45)),
        ],
      ),
    ),
  );
}

/// The empty state for a subject with no questions on this board.
Widget noBank(ToolEnv env, {String what = 'questions'}) => ToolEmpty(
  icon: Icons.inventory_2_outlined,
  title: env.subject.isEmpty ? 'Start a class first' : 'No $what for ${env.subject} yet',
  line: env.subject.isEmpty
      ? 'Pick your class on the start screen. The class tools then use its subject and roll numbers.'
      : 'They come with the Zynetix School question bank or with the lessons for this subject. Ask your college\'s IT person to install the latest Zynetix Board.',
);

/// A line saying where the questions come from.
String bankLine(SubjectBank b) => switch (b.source) {
  BankSource.school => 'From Zynetix School',
  BankSource.lessons => 'From the lessons\' quick checks',
  BankSource.none => '',
};

/// Chapter picker: the chosen chapters as lavender chips, two more to add, and "All chapters"
/// for the rest. [multi]: several at once (mock tests), else one.
class ChapterPicker extends StatelessWidget {
  const ChapterPicker({super.key, required this.bank, required this.selected, required this.onChanged, this.multi = false, this.only});

  final SubjectBank bank;
  final List<String> selected;
  final ValueChanged<List<String>> onChanged;
  final bool multi;

  /// Only these chapters are offered (e.g. those with formulas).
  final bool Function(BankChapter c)? only;

  List<BankChapter> get _offered => [
    for (final c in bank.chapters)
      if (only == null || only!(c)) c,
  ];

  void _toggle(String id) {
    if (!multi) return onChanged([id]);
    final s = [...selected];
    s.contains(id) ? (s.length > 1 ? s.remove(id) : null) : s.add(id);
    final order = [for (final c in bank.chapters) c.id];
    s.sort((a, b) => order.indexOf(a).compareTo(order.indexOf(b)));
    onChanged(s);
  }

  Future<void> _all(BuildContext context) async {
    final picked = await showDialog<String>(
      context: context,
      builder: (ctx) => Dialog(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 640, maxHeight: 720),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(8, 24, 8, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Text('Chapters', style: ceHeading(26)),
                ),
                const SizedBox(height: 8),
                Flexible(
                  child: ListView(
                    shrinkWrap: true,
                    children: [
                      for (final c in _offered)
                        ListTile(
                          key: Key('ce-chapter-${c.id}'),
                          leading: Icon(selected.contains(c.id) ? Icons.check_circle : Icons.circle_outlined, color: selected.contains(c.id) ? CeC.accent : CeC.line),
                          title: Text(
                            '${c.number > 0 ? '${c.number}. ' : ''}${c.title}',
                            style: ceText(17, w: FontWeight.w500, c: CeC.body),
                          ),
                          onTap: () => Navigator.of(ctx).pop(c.id),
                        ),
                    ],
                  ),
                ),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Close')),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    if (picked != null) _toggle(picked);
  }

  @override
  Widget build(BuildContext context) {
    final offered = _offered;
    final chosen = [
      for (final c in offered)
        if (selected.contains(c.id)) c,
    ];
    final last = chosen.isEmpty ? -1 : offered.indexOf(chosen.last);
    final next = [
      for (final c in offered.skip(last + 1))
        if (!selected.contains(c.id)) c,
    ].take(2).toList();
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        for (final c in chosen) choiceChip(c.title, on: true, onTap: () => _toggle(c.id), key: Key('ce-chip-${c.id}')),
        for (final c in next) choiceChip(c.title, on: false, onTap: () => _toggle(c.id), key: Key('ce-chip-${c.id}'), offIcon: multi ? Icons.add : Icons.swap_horiz),
        if (offered.length > chosen.length + next.length) choiceChip('All chapters', on: false, offIcon: Icons.list_rounded, onTap: () => _all(context), key: const Key('ce-chapters-all')),
      ],
    );
  }
}

/// A − n + stepper.
Widget stepper(int value, {required ValueChanged<int> onChanged, int min = 0, int max = 99, Key? key}) => Row(
  key: key,
  mainAxisSize: MainAxisSize.min,
  children: [
    _roundIcon(Icons.remove, value > min ? () => onChanged(value - 1) : null),
    SizedBox(
      width: 40,
      child: Text('$value', textAlign: TextAlign.center, style: ceHeading(20)),
    ),
    _roundIcon(Icons.add, value < max ? () => onChanged(value + 1) : null),
  ],
);

Widget _roundIcon(IconData i, VoidCallback? onTap) => Material(
  color: Colors.white,
  shape: const CircleBorder(side: BorderSide(color: CeC.line)),
  child: InkWell(
    customBorder: const CircleBorder(),
    onTap: onTap,
    child: Padding(
      padding: const EdgeInsets.all(7),
      child: Icon(i, size: 18, color: onTap == null ? CeC.line : CeC.navy),
    ),
  ),
);

/// Wraps [text] into lines of at most [width] characters (for text put on the board).
String wrapText(String text, int width) {
  final out = <String>[];
  for (final para in text.split('\n')) {
    var line = '';
    for (final w in para.split(' ')) {
      if (line.isEmpty) {
        line = w;
      } else if (line.length + 1 + w.length <= width) {
        line = '$line $w';
      } else {
        out.add(line);
        line = w;
      }
    }
    out.add(line);
  }
  return out.join('\n');
}

/// Typed lines on the board, one under the other: (text, size, bold).
List<BoardElement> boardLines(List<(String, double, bool)> lines, Color ink, {double gap = 14}) {
  final out = <BoardElement>[];
  var y = 0.0;
  for (final (text, size, bold) in lines) {
    final s = measureBoardText(text, size, bold: bold);
    out.add(TextElement(id: newElementId(), position: Offset(0, y), text: text, color: ink, fontSize: size, bold: bold, size: s));
    y += s.height + gap;
  }
  return out;
}
