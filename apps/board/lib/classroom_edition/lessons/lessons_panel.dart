import 'package:flutter/material.dart';

import '../classroom_hooks.dart';
import '../ui/ce_style.dart';

/// The Lessons tab of the split panel (Classroom edition): short, ready lessons for Karnataka
/// PUC, taught step by step, each step put on the board with [ClassroomHost.putElements] /
/// [ClassroomHost.putWidget].
///
/// PHASE 2 SEAM (README.md): this placeholder is replaced by the Lessons agent. Keep the
/// constructor (`LessonsPanel(host: …)`); the board screen builds it.
class LessonsPanel extends StatelessWidget {
  const LessonsPanel({super.key, required this.host});

  final ClassroomHost host;

  @override
  Widget build(BuildContext context) {
    final cls = host.currentClass;
    return ColoredBox(
      key: const Key('ce-lessons-panel'),
      color: CeC.page,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(28, 24, 28, 28),
        children: [
          Row(
            children: [
              Expanded(child: Text('Lessons', style: ceHeading(32))),
              cePill('On this board · no internet needed', icon: Icons.offline_pin_outlined),
            ],
          ),
          const SizedBox(height: 6),
          Text('Short, ready lessons for Karnataka PUC. Pick a chapter and teach it step by step.', style: ceText(16)),
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.all(24),
            decoration: ceCard(r: 24),
            child: Text(
              [if (cls != null) '${cls.name} · ${host.subject ?? ''}', 'The lesson library is being added to this board.'].join('\n'),
              style: ceText(17, c: CeC.navy),
            ),
          ),
        ],
      ),
    );
  }
}
