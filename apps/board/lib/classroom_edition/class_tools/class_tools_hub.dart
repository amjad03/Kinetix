import 'package:flutter/material.dart';

import '../classroom_hooks.dart';
import '../ui/ce_style.dart';

/// A tile of the Class tools hub (Classroom Apps → Class tools, and the panel's Class tools
/// tab): an id, its icon, title, one line and the pastel behind it.
typedef ClassTool = ({String id, IconData icon, String title, String line, Color colour});

/// The Class tools (Classroom edition): tools that work without phones or the internet, by roll
/// number — class quiz, mock test, formula drill, teams, class plan, mastery map, worksheets,
/// pick a roll number, timer.
///
/// PHASE 2 SEAM (README.md): the Class tools agent replaces this placeholder. Keep
/// `ClassToolsHub(host: …, initialTool: …)` and [classTools] (Classroom Apps shows the same
/// tiles and opens the hub at the tile tapped).
class ClassToolsHub extends StatelessWidget {
  const ClassToolsHub({super.key, required this.host, this.initialTool});

  final ClassroomHost host;

  /// The tool to open at once (a tile tapped in Classroom Apps), else the hub's grid.
  final String? initialTool;

  @override
  Widget build(BuildContext context) => ColoredBox(
    key: const Key('ce-class-tools-panel'),
    color: CeC.page,
    child: ListView(
      padding: const EdgeInsets.all(28),
      children: [
        Text('Class tools', style: ceHeading(32)),
        const SizedBox(height: 6),
        Text('From Zynetix School. Work without phones and without internet.', style: ceText(16)),
        const SizedBox(height: 20),
        LayoutBuilder(
          builder: (context, box) {
            final w = (box.maxWidth - 32) / 3;
            return Wrap(spacing: 16, runSpacing: 16, children: [for (final t in classTools) classToolTile(t, width: w, height: 150)]);
          },
        ),
      ],
    ),
  );
}

/// The Class tools, in the hub's order.
const classTools = <ClassTool>[
  (id: 'quiz', icon: Icons.fact_check_outlined, title: 'Class quiz', line: 'Tap roll numbers right or wrong', colour: CeC.lavender),
  (id: 'mock', icon: Icons.assignment_outlined, title: 'Mock test', line: 'PUC board pattern, ready to print', colour: CeC.peach),
  (id: 'drill', icon: Icons.functions, title: 'Formula drill', line: 'One formula at a time, quick recall', colour: CeC.butter),
  (id: 'teams', icon: Icons.groups_2_outlined, title: 'Teams', line: 'Split the class by roll number', colour: CeC.mint),
  (id: 'plan', icon: Icons.event_note_outlined, title: 'Class plan', line: 'Today’s 55 minutes, step by step', colour: CeC.blue),
  (id: 'mastery', icon: Icons.grid_view_rounded, title: 'Mastery map', line: 'Every topic, by roll number', colour: CeC.pink),
  (id: 'worksheets', icon: Icons.description_outlined, title: 'Worksheets', line: 'Print, or put on the board', colour: CeC.peach),
  (id: 'picker', icon: Icons.casino_outlined, title: 'Pick a roll no.', line: 'Fair turns, nobody left out', colour: CeC.butter),
  (id: 'timer', icon: Icons.timer_outlined, title: 'Timer', line: 'Big countdown the class can see', colour: CeC.mint),
];

/// One Class tools tile.
Widget classToolTile(ClassTool t, {double width = 240, double height = 128, VoidCallback? onTap}) => SizedBox(
  width: width,
  height: height,
  child: Material(
    color: t.colour,
    borderRadius: BorderRadius.circular(22),
    child: InkWell(
      key: Key('ce-tool-${t.id}'),
      borderRadius: BorderRadius.circular(22),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ceIconDot(t.icon, size: 40),
            const Spacer(),
            Text(t.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: ceHeading(18)),
            const SizedBox(height: 2),
            Flexible(child: Text(t.line, maxLines: 2, overflow: TextOverflow.ellipsis, style: ceText(13.5, height: 1.25))),
          ],
        ),
      ),
    ),
  ),
);
