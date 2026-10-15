import 'package:flutter/material.dart';

import 'tokens.dart';

/// One count in a [KxCountChips] row: "12 Handed in".
class KxCountChip<T> {
  const KxCountChip({required this.value, required this.label, required this.count, this.background, this.foreground, this.key});

  final T value;
  final String label;
  final int count;
  final Color? background;
  final Color? foreground;
  final Key? key;
}

/// Counts that are also filters: tapping one shows only those rows; tapping it again (or
/// "All", if given) shows everything. The selected chip is outlined and ticked.
class KxCountChips<T> extends StatelessWidget {
  const KxCountChips({super.key, required this.chips, required this.selected, required this.onSelected, this.padding = const EdgeInsets.symmetric(horizontal: Kx.s16)});

  final List<KxCountChip<T>> chips;

  /// The chip whose rows are shown; null shows all.
  final T? selected;
  final ValueChanged<T?> onSelected;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: padding,
      child: Wrap(
        spacing: Kx.s8,
        runSpacing: Kx.s8,
        children: [
          for (final chip in chips)
            Builder(
              builder: (context) {
                final on = chip.value == selected;
                final bg = chip.background ?? c.surfaceContainerHighest;
                final fg = chip.foreground ?? c.onSurfaceVariant;
                return Semantics(
                  button: true,
                  selected: on,
                  child: Material(
                    key: chip.key,
                    color: bg,
                    shape: RoundedRectangleBorder(
                      borderRadius: Kx.radiusMd,
                      side: BorderSide(color: on ? fg : Colors.transparent, width: 2),
                    ),
                    child: InkWell(
                      borderRadius: Kx.radiusMd,
                      onTap: () => onSelected(on ? null : chip.value),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(minHeight: Kx.target - 8),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: Kx.s12, vertical: Kx.s8),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (on) ...[Icon(Icons.check, size: 18, color: fg), const SizedBox(width: Kx.s4)],
                              Text.rich(
                                TextSpan(
                                  children: [
                                    TextSpan(text: '${chip.count} ', style: text.titleMedium?.copyWith(color: fg, fontWeight: FontWeight.w600)),
                                    TextSpan(text: chip.label, style: text.bodyMedium?.copyWith(color: fg)),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
        ],
      ),
    );
  }
}
