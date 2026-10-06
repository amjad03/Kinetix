import 'package:flutter/material.dart';

import 'strings.dart';
import 'tokens.dart';

/// One choice in a [KxPicker]. Choices with the same [group] are listed under it (a class, with
/// its subjects under it).
class KxPickerItem<T> {
  const KxPickerItem({required this.value, required this.label, this.group, this.subtitle});

  final T value;
  final String label;
  final String? group;
  final String? subtitle;

  /// What the field shows once chosen: "BCom Sem 3 A · Accounting".
  String get display => group == null ? label : '$group · $label';

  bool matches(String q) {
    final s = q.toLowerCase();
    return label.toLowerCase().contains(s) || (group?.toLowerCase().contains(s) ?? false) || (subtitle?.toLowerCase().contains(s) ?? false);
  }
}

/// The KINETIX choice field: shows the selection, and opens a searchable bottom sheet grouped
/// by [KxPickerItem.group] with a check mark on the chosen item. Use it in place of a dropdown
/// for anything with more than three choices. Works in a [Form] ([validator]).
class KxPicker<T> extends FormField<T> {
  KxPicker({
    super.key,
    required String label,
    required List<KxPickerItem<T>> items,
    required T? value,
    required ValueChanged<T> onChanged,
    IconData? icon,
    String? hint,
    super.validator,
    super.enabled = true,
  }) : super(
         initialValue: value,
         builder: (field) {
           final state = field as _KxPickerState<T>;
           final enabled = field.widget.enabled;
           final context = field.context;
           final selected = items.where((i) => i.value == state.value).firstOrNull;
           final colors = Theme.of(context).colorScheme;
           return InkWell(
             borderRadius: Kx.radiusMd,
             onTap: enabled && items.isNotEmpty
                 ? () async {
                     final chosen = await showKxPickerSheet<T>(context, title: label, items: items, selected: state.value);
                     if (chosen != null) {
                       field.didChange(chosen);
                       onChanged(chosen);
                     }
                   }
                 : null,
             child: InputDecorator(
               isEmpty: selected == null,
               decoration: InputDecoration(
                 labelText: label,
                 hintText: hint ?? KxStrings.of(context).choose,
                 prefixIcon: icon == null ? null : Icon(icon),
                 suffixIcon: const Icon(Icons.unfold_more),
                 errorText: field.errorText,
                 enabled: enabled,
               ),
               child: selected == null
                   ? null
                   : Text(
                       selected.display,
                       maxLines: 1,
                       overflow: TextOverflow.ellipsis,
                       style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: enabled ? null : colors.onSurfaceVariant),
                     ),
             ),
           );
         },
       );

  @override
  FormFieldState<T> createState() => _KxPickerState<T>();
}

class _KxPickerState<T> extends FormFieldState<T> {
  @override
  void didUpdateWidget(KxPicker<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    // The parent's value wins (it may reset a subject when the class changes).
    if (widget.initialValue != value) setValue(widget.initialValue);
  }
}

/// The picker's sheet on its own: returns the chosen value, or null when dismissed.
Future<T?> showKxPickerSheet<T>(BuildContext context, {required String title, required List<KxPickerItem<T>> items, T? selected}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    useSafeArea: true,
    builder: (_) => _PickerSheet<T>(title: title, items: items, selected: selected),
  );
}

class _PickerSheet<T> extends StatefulWidget {
  const _PickerSheet({required this.title, required this.items, required this.selected});

  final String title;
  final List<KxPickerItem<T>> items;
  final T? selected;

  @override
  State<_PickerSheet<T>> createState() => _PickerSheetState<T>();
}

class _PickerSheetState<T> extends State<_PickerSheet<T>> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final s = KxStrings.of(context);
    final c = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final q = _query.trim();
    final shown = q.isEmpty ? widget.items : widget.items.where((i) => i.matches(q)).toList();
    // Groups in the order they first appear.
    final groups = <String?, List<KxPickerItem<T>>>{};
    for (final i in shown) {
      groups.putIfAbsent(i.group, () => []).add(i);
    }
    final rows = <Widget>[
      for (final MapEntry(key: group, value: list) in groups.entries) ...[
        if (group != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, Kx.s4),
            child: Text(group, style: text.labelLarge?.copyWith(color: c.primary, fontWeight: FontWeight.w600)),
          ),
        for (final item in list)
          ListTile(
            key: ValueKey('kxPickerItem-${item.display}'),
            title: Text(item.label),
            subtitle: item.subtitle == null ? null : Text(item.subtitle!),
            selected: item.value == widget.selected,
            trailing: item.value == widget.selected ? Icon(Icons.check, color: c.primary) : null,
            contentPadding: EdgeInsets.only(left: group == null ? Kx.s16 : Kx.s32, right: Kx.s16),
            onTap: () => Navigator.pop(context, item.value),
          ),
      ],
    ];
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: widget.items.length > 6 ? 0.7 : 0.5,
      minChildSize: 0.3,
      maxChildSize: 0.95,
      builder: (context, controller) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s8),
            child: Text(widget.title, style: text.titleLarge),
          ),
          if (widget.items.length > 6)
            Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s8),
              child: TextField(
                key: const Key('kxPickerSearch'),
                autofocus: false,
                onChanged: (v) => setState(() => _query = v),
                decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: s.search, isDense: true),
              ),
            ),
          Expanded(
            child: rows.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(Kx.s24),
                      child: Text(s.noMatches(q), style: text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
                    ),
                  )
                : ListView(controller: controller, padding: const EdgeInsets.only(bottom: Kx.s24), children: rows),
          ),
        ],
      ),
    );
  }
}
