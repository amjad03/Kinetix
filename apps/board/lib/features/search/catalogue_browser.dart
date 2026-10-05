import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'catalogue_facets.dart';
import 'filter_bar.dart';
import 'search_strings.dart';

IconData subjectIcon(String subject) => switch (subject) {
  'physics' => Icons.bolt_outlined,
  'chemistry' => Icons.science_outlined,
  'biology' => Icons.biotech_outlined,
  'maths' => Icons.functions,
  'electronics' => Icons.memory_outlined,
  'geography' => Icons.public,
  'space' => Icons.brightness_3_outlined,
  'forensics' => Icons.fingerprint,
  _ => Icons.category_outlined,
};

/// The 3D models or the virtual labs that work offline on the board: a search field and
/// Subject, Topic and Class dropdowns over the list (grouped by subject until something is
/// typed, then best match first).
class CatalogueBrowser extends StatefulWidget {
  const CatalogueBrowser({super.key, required this.kind, required this.onPick, this.initialSubject, this.initialQuery = ''});

  final CatalogueKind kind;
  final ValueChanged<String> onPick;
  final String? initialSubject;
  final String initialQuery;

  @override
  State<CatalogueBrowser> createState() => _CatalogueBrowserState();
}

class _CatalogueBrowserState extends State<CatalogueBrowser> {
  late String _query = widget.initialQuery;
  late String? _subject = widget.initialSubject;
  String? _category, _level;

  List<CatalogueItem> get _all => widget.kind == CatalogueKind.model3d ? modelItems : labItems;

  @override
  Widget build(BuildContext context) {
    final s = SearchStrings.of(context);
    final lang = s.lang;
    final c = context.colors;
    final all = _all;
    final subjects = subjectsIn(all);
    final categories = categoriesIn(all, _subject);
    final levels = levelsIn(all, subject: _subject, category: _category);
    final items = filterCatalogue(all, subject: _subject, category: _category, level: _level, query: _query);
    final ranked = _query.trim().isNotEmpty;
    final filtered = _subject != null || _category != null || _level != null;
    final children = <Widget>[];
    if (ranked) {
      children.addAll([for (final i in items) _tile(context, s, lang, i)]);
    } else {
      // Subjects in catalogue order (the solids first among the models).
      for (final subject in {for (final i in items) i.subject}) {
        final group = [for (final i in items) if (i.subject == subject) i];
        if (group.isEmpty) continue;
        children.add(
          Padding(
            padding: const EdgeInsets.fromLTRB(Kx.s8, Kx.s16, Kx.s8, Kx.s8),
            child: Text(s.subjectName(subject), style: context.text.titleSmall?.copyWith(color: c.onSurfaceVariant)),
          ),
        );
        children.addAll([for (final i in group) _tile(context, s, lang, i)]);
      }
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ModuleSearchField(
          key: Key('catalogue-search-${widget.kind.name}'),
          hint: widget.kind == CatalogueKind.model3d ? s.searchModels : s.searchLabs,
          initial: widget.initialQuery,
          onChanged: (v) => setState(() => _query = v),
        ),
        FilterBar(
          menus: [
            FilterMenu(
              id: 'subject',
              label: s.subject,
              value: _subject,
              options: [for (final k in subjects) (k, s.subjectName(k))],
              onChanged: (v) => setState(() {
                _subject = v;
                _category = null;
                if (_level != null && !levelsIn(all, subject: v).contains(_level)) _level = null;
              }),
            ),
            FilterMenu(
              id: 'category',
              label: s.category,
              value: _category,
              options: [for (final k in categories) (k, s.categoryName(k))],
              onChanged: (v) => setState(() {
                _category = v;
                if (_level != null && !levelsIn(all, subject: _subject, category: v).contains(_level)) _level = null;
              }),
            ),
            FilterMenu(
              id: 'level',
              label: s.level,
              value: _level,
              options: [for (final k in levels) (k, s.levelName(k))],
              onChanged: (v) => setState(() => _level = v),
            ),
          ],
          trailing: filtered
              ? TextButton(
                  key: const Key('filter-clear'),
                  onPressed: () => setState(() => _subject = _category = _level = null),
                  child: Text(s.clearFilters),
                )
              : null,
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
          child: Text(s.found(items.length), key: const Key('catalogue-count'), style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant)),
        ),
        Expanded(
          child: items.isEmpty
              ? KxEmptyState(icon: Icons.search_off, message: s.noneMatch)
              : ListView(
                  key: Key('catalogue-${widget.kind.name}'),
                  padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s24),
                  children: children,
                ),
        ),
      ],
    );
  }

  Widget _tile(BuildContext context, SearchStrings s, String lang, CatalogueItem i) {
    final c = context.colors;
    final levels = i.levels.length > 3 ? '${s.levelName(i.levels.first)}–${i.levels.last}' : i.levels.map(s.levelName).join(', ');
    return Card(
      margin: const EdgeInsets.only(bottom: Kx.s8),
      color: c.surfaceContainer,
      elevation: 0,
      child: ListTile(
        key: Key('pick-${i.id}'),
        leading: Icon(widget.kind == CatalogueKind.model3d ? Icons.view_in_ar_outlined : subjectIcon(i.subject), color: c.primary),
        title: Text(i.titleIn(lang)),
        subtitle: Text([s.categoryName(i.category), if (levels.isNotEmpty) levels].join(' · '), maxLines: 2, overflow: TextOverflow.ellipsis),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => widget.onPick(i.id),
      ),
    );
  }
}
