import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import 'activities.dart';
import 'matching.dart';
import 'primary_strings.dart';
import 'tracing.dart';

/// The primary activities (LKG to Class 5), one tab each.
enum PrimaryActivity { tracing, numbers, shapes, matching, rhymes, stars }

IconData primaryActivityIcon(PrimaryActivity a) => switch (a) {
  PrimaryActivity.tracing => Icons.gesture,
  PrimaryActivity.numbers => Icons.pin_outlined,
  PrimaryActivity.shapes => Icons.category_outlined,
  PrimaryActivity.matching => Icons.extension_outlined,
  PrimaryActivity.rhymes => Icons.music_note_outlined,
  PrimaryActivity.stars => Icons.star_rounded,
};

/// Letter and number tracing, counting, shapes and colours, the matching game, rhymes and the
/// star wall, in the split panel. Big tabs and buttons for little hands.
class PrimaryActivitiesPanel extends StatefulWidget {
  const PrimaryActivitiesPanel({super.key, required this.board, this.wb, this.initial = PrimaryActivity.tracing});

  final BoardController board;
  final WhiteboardController? wb;
  final PrimaryActivity initial;

  @override
  State<PrimaryActivitiesPanel> createState() => _PrimaryActivitiesPanelState();
}

class _PrimaryActivitiesPanelState extends State<PrimaryActivitiesPanel> {
  late PrimaryActivity _tab = widget.initial;
  TraceScript _script = TraceScript.english;

  @override
  Widget build(BuildContext context) {
    final s = primaryStrings(context);
    return Column(
      key: const Key('primary-panel'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: Kx.s8, vertical: Kx.s8),
          child: Row(
            children: [
              for (final a in PrimaryActivity.values)
                Padding(
                  padding: const EdgeInsets.only(right: Kx.s8),
                  child: ChoiceChip(
                    key: Key('primary-tab-${a.name}'),
                    avatar: Icon(primaryActivityIcon(a), size: 26),
                    label: Text(s[a.name], style: context.text.titleMedium),
                    padding: const EdgeInsets.symmetric(horizontal: Kx.s8, vertical: Kx.s8),
                    showCheckmark: false,
                    selected: _tab == a,
                    onSelected: (_) => setState(() => _tab = a),
                  ),
                ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: switch (_tab) {
            PrimaryActivity.tracing => TracingActivity(key: ValueKey(_script), wb: widget.wb, initialScript: _script),
            PrimaryActivity.numbers => CountingActivity(
              onTrace: () => setState(() {
                _script = TraceScript.digits;
                _tab = PrimaryActivity.tracing;
              }),
            ),
            PrimaryActivity.shapes => const ShapesColoursActivity(),
            PrimaryActivity.matching => const MatchingGame(),
            PrimaryActivity.rhymes => const RhymesActivity(),
            PrimaryActivity.stars => StarWall(board: widget.board),
          },
        ),
      ],
    );
  }
}
