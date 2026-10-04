import 'package:flutter/material.dart';

/// How the board is divided. The teacher can keep the whiteboard on one side and
/// slides, a PDF or a video on the other.
enum SplitMode { single, half, wide }

extension SplitModeInfo on SplitMode {
  /// Share of the width given to the primary pane.
  double get primaryFraction => switch (this) {
        SplitMode.single => 1,
        SplitMode.half => 0.5,
        SplitMode.wide => 2 / 3,
      };

  String get label => switch (this) {
        SplitMode.single => 'Full',
        SplitMode.half => '50 : 50',
        SplitMode.wide => '70 : 30',
      };
}

/// Lays out a primary and a secondary pane side by side. When [primaryOnLeft] is false the
/// primary pane moves to the right, so the teacher can stand on whichever side suits the room.
class SplitLayout extends StatelessWidget {
  const SplitLayout({
    super.key,
    required this.mode,
    required this.primaryOnLeft,
    required this.primary,
    required this.secondary,
  });

  final SplitMode mode;
  final bool primaryOnLeft;
  final Widget primary;
  final Widget secondary;

  @override
  Widget build(BuildContext context) {
    if (mode == SplitMode.single) return primary;
    final primaryFlex = (mode.primaryFraction * 100).round();
    final panes = [
      Expanded(key: const ValueKey('primary'), flex: primaryFlex, child: primary),
      const VerticalDivider(width: 6, thickness: 6, color: Color(0xFF2C2C34)),
      Expanded(key: const ValueKey('secondary'), flex: 100 - primaryFlex, child: secondary),
    ];
    return Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: primaryOnLeft ? panes : panes.reversed.toList());
  }
}
