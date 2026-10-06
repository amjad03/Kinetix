import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../l10n/l10n.dart';
import '../../search/filter_bar.dart';
import '../../search/fuzzy.dart';
import '../chrome.dart';
import 'layout_strings.dart';

/// The tools drawer's groups (screen 4).
enum ToolGroup { geometry, maths, science, commerce, cs, classroom }

String toolGroupName(LayoutStrings s, ToolGroup g) => switch (g) {
  ToolGroup.geometry => s.geometry,
  ToolGroup.maths => s.maths,
  ToolGroup.science => s.science,
  ToolGroup.commerce => s.commerce,
  ToolGroup.cs => s.cs,
  ToolGroup.classroom => s.classGroup,
};

/// One smart tool. On-board tools float on the board; content tools open in the split panel.
class DrawerTool {
  const DrawerTool(this.id, this.icon, this.label, this.groups, this.color, this.onTap);

  /// For keys: `drawer-<id>`.
  final String id;
  final IconData icon;
  final String label;

  /// The first group is the tool's home; it shows under the others too.
  final List<ToolGroup> groups;
  final Color color;
  final VoidCallback onTap;
}

/// Every smart tool in one grid, grouped, with filter chips and a search. [order] puts the
/// period's subject first; [preferred] tools lead their group (a commerce class sees the
/// spreadsheet and formulas first).
class ToolsDrawer extends StatefulWidget {
  const ToolsDrawer({super.key, required this.tools, required this.order, this.preferred = const [], this.width = 640, this.maxHeight = 560});

  final List<DrawerTool> tools;
  final List<ToolGroup> order;
  final List<String> preferred;
  final double width;
  final double maxHeight;

  @override
  State<ToolsDrawer> createState() => _ToolsDrawerState();
}

class _ToolsDrawerState extends State<ToolsDrawer> {
  ToolGroup? _group;
  String _q = '';

  List<DrawerTool> _sorted(Iterable<DrawerTool> tools) {
    final pref = widget.preferred;
    final list = tools.toList();
    int rank(DrawerTool t) => pref.contains(t.id) ? pref.indexOf(t.id) : pref.length + list.indexOf(t);
    return list..sort((a, b) => rank(a).compareTo(rank(b)));
  }

  @override
  Widget build(BuildContext context) {
    final s = LayoutStrings.of(context);
    final tools = widget.tools;
    final tileWidth = widget.width < 420 ? (widget.width - 3 * Kx.s8) / 3 : 104.0;
    Widget grid(List<DrawerTool> list) => Wrap(
      spacing: Kx.s8,
      runSpacing: Kx.s8,
      children: [for (final t in list) ChromeTile(key: Key('drawer-${t.id}'), icon: t.icon, label: t.label, color: t.color, width: tileWidth, onTap: t.onTap)],
    );
    final children = <Widget>[];
    if (_q.trim().isNotEmpty) {
      final found = matching(tools, (t) => [t.label, for (final g in t.groups) toolGroupName(s, g)], _q);
      children.add(found.isEmpty ? Padding(padding: const EdgeInsets.all(Kx.s24), child: Center(child: Text(s.noTools))) : grid(found));
    } else {
      final groups = _group == null ? widget.order : [_group!];
      for (final g in groups) {
        // In "All" each tool shows once, under its home group; a filter shows every tool in it.
        final inGroup = _sorted(tools.where((t) => _group == null ? t.groups.first == g : t.groups.contains(g)));
        if (inGroup.isEmpty) continue;
        if (_group == null) {
          children.add(
            Padding(
              padding: const EdgeInsets.fromLTRB(2, Kx.s12, 0, Kx.s8),
              child: Text(toolGroupName(s, g), style: context.text.titleSmall?.copyWith(color: context.colors.onSurfaceVariant)),
            ),
          );
        }
        children.add(grid(inGroup));
      }
    }
    return PopoverCard(
      key: const Key('tools-drawer'),
      title: context.l10n.toolTools,
      width: widget.width,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final g in [null, ...widget.order])
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: ChoiceChip(
                      key: Key('drawer-filter-${g?.name ?? 'all'}'),
                      label: Text(g == null ? s.all : toolGroupName(s, g)),
                      selected: _group == g,
                      onSelected: (_) => setState(() => _group = g),
                    ),
                  ),
              ],
            ),
          ),
          ModuleSearchField(key: const Key('tools-search'), hint: s.searchTools, padding: const EdgeInsets.symmetric(vertical: Kx.s8), onChanged: (v) => setState(() => _q = v)),
          ConstrainedBox(
            constraints: BoxConstraints(maxHeight: widget.maxHeight),
            child: SingleChildScrollView(
              key: const Key('tools-drawer-scroll'),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
            ),
          ),
        ],
      ),
    );
  }
}
