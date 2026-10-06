import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'layout/layout_strings.dart';

/// The split panel's Animations tab. packages/kinetix_animations (built separately) will export
/// `AnimationsPanel` and `animationCatalogue`; at merge [animationsPanel] returns
/// `AnimationsPanel(...)` and [animationsAvailable] becomes true. Until then the tab is
/// registered and shows a placeholder.
const animationsAvailable = false;

Widget animationsPanel(BuildContext context, {required WhiteboardController wb, String? subject}) => const _AnimationsPlaceholder();

class _AnimationsPlaceholder extends StatelessWidget {
  const _AnimationsPlaceholder();

  @override
  Widget build(BuildContext context) =>
      KxEmptyState(key: const Key('animations-placeholder'), icon: Icons.animation, message: LayoutStrings.of(context).animationsSoon);
}
