import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/models.dart';

/// Avatar chips to switch between children, as in Google Family Link. Shown only for 2+ children.
class ChildSwitcher extends StatelessWidget {
  const ChildSwitcher({super.key, required this.children, required this.selected, required this.onSelect});

  final List<Child> children;
  final Child? selected;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s4),
      child: Row(
        children: [
          for (final child in children) ...[
            ChoiceChip(
              key: Key('child-${child.id}'),
              selected: child.id == selected?.id,
              showCheckmark: false,
              onSelected: (_) => onSelect(child.id),
              shape: const StadiumBorder(),
              selectedColor: c.secondaryContainer,
              side: BorderSide(color: child.id == selected?.id ? Colors.transparent : c.outlineVariant),
              avatar: KxAvatar(name: child.fullName, size: 28),
              labelPadding: const EdgeInsets.only(left: Kx.s4, right: Kx.s8),
              padding: const EdgeInsets.symmetric(horizontal: Kx.s4, vertical: Kx.s4),
              label: Text(child.firstName, style: context.text.labelLarge),
              tooltip: '${child.fullName} · ${child.sectionName}',
            ),
            const SizedBox(width: Kx.s8),
          ],
        ],
      ),
    );
  }
}
