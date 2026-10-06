import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'search_strings.dart';

/// A browser's own search field: one line, a clear button once something is typed.
class ModuleSearchField extends StatefulWidget {
  const ModuleSearchField({super.key, required this.hint, required this.onChanged, this.initial = '', this.autofocus = false, this.padding});

  final String hint;
  final ValueChanged<String> onChanged;
  final String initial;
  final bool autofocus;
  final EdgeInsetsGeometry? padding;

  @override
  State<ModuleSearchField> createState() => _ModuleSearchFieldState();
}

/// A rounded search box; outlined only while focused. (The theme's filled fields have an
/// underline border, which leaves room for a label above the text and so sets it low.)
OutlineInputBorder _pill([Color? focused]) => OutlineInputBorder(
  borderRadius: BorderRadius.circular(Kx.rMd),
  borderSide: focused == null ? BorderSide.none : BorderSide(color: focused, width: 2),
);

class _ModuleSearchFieldState extends State<ModuleSearchField> {
  late final _text = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: widget.padding ?? const EdgeInsets.fromLTRB(Kx.s12, Kx.s8, Kx.s12, Kx.s4),
    child: TextField(
      controller: _text,
      autofocus: widget.autofocus,
      textInputAction: TextInputAction.search,
      // The text sits in the middle of the field, level with the icons.
      textAlignVertical: TextAlignVertical.center,
      onChanged: (v) {
        setState(() {});
        widget.onChanged(v);
      },
      decoration: InputDecoration(
        hintText: widget.hint,
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: Kx.s12, vertical: Kx.s12),
        constraints: const BoxConstraints(minHeight: 48),
        border: _pill(),
        enabledBorder: _pill(),
        focusedBorder: _pill(context.colors.primary),
        prefixIcon: const Icon(Icons.search, size: 20),
        suffixIcon: _text.text.isEmpty
            ? null
            : IconButton(
                tooltip: MaterialLocalizations.of(context).deleteButtonTooltip,
                icon: const Icon(Icons.close, size: 18),
                onPressed: () {
                  _text.clear();
                  setState(() {});
                  widget.onChanged('');
                },
              ),
      ),
    ),
  );
}

/// One dropdown of a filter bar: shows its name, or what is picked; "All" clears it.
class FilterMenu extends StatelessWidget {
  const FilterMenu({super.key, required this.id, required this.label, required this.value, required this.options, required this.onChanged});

  /// For keys: `filter-<id>` on the button, `filter-<id>-<value>` on each choice.
  final String id;
  final String label;
  final String? value;

  /// (value, what it is called), in order.
  final List<(String, String)> options;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final s = SearchStrings.of(context);
    final picked = options.where((o) => o.$1 == value).firstOrNull;
    final on = picked != null;
    return PopupMenuButton<String>(
      key: Key('filter-$id'),
      tooltip: label,
      enabled: options.isNotEmpty,
      position: PopupMenuPosition.under,
      constraints: const BoxConstraints(minWidth: 180, maxWidth: 320),
      onSelected: (v) => onChanged(v.isEmpty ? null : v),
      itemBuilder: (context) => [
        PopupMenuItem(key: Key('filter-$id-all'), value: '', child: _choice(context, s.all, !on)),
        for (final (v, name) in options) PopupMenuItem(key: Key('filter-$id-$v'), value: v, child: _choice(context, name, v == value)),
      ],
      child: Container(
        constraints: const BoxConstraints(minHeight: 40, maxWidth: 240),
        padding: const EdgeInsets.only(left: Kx.s12, right: Kx.s4),
        decoration: BoxDecoration(
          color: on ? c.secondaryContainer : null,
          border: Border.all(color: on ? c.secondaryContainer : c.outlineVariant),
          borderRadius: BorderRadius.circular(Kx.rSm),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                on ? picked.$2 : label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.text.labelLarge?.copyWith(color: on ? c.onSecondaryContainer : c.onSurfaceVariant),
              ),
            ),
            Icon(Icons.arrow_drop_down, color: on ? c.onSecondaryContainer : c.onSurfaceVariant),
          ],
        ),
      ),
    );
  }

  Widget _choice(BuildContext context, String text, bool selected) => Row(
    children: [
      SizedBox(width: 28, child: selected ? Icon(Icons.check, size: 18, color: context.colors.primary) : null),
      Expanded(child: Text(text)),
    ],
  );
}

/// Dropdowns side by side, wrapping onto a second line on a narrow phone when what is picked
/// has long names (each is at most 240 px, ellipsised).
class FilterBar extends StatelessWidget {
  const FilterBar({super.key, required this.menus, this.trailing});

  final List<Widget> menus;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(Kx.s12, 4, Kx.s12, 4),
    child: Wrap(
      spacing: Kx.s8,
      runSpacing: Kx.s4,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [...menus, ?trailing],
    ),
  );
}
