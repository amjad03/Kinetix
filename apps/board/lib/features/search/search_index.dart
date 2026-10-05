import 'package:flutter/material.dart';

import 'catalogue_facets.dart';
import 'formula_browser.dart';
import 'fuzzy.dart';
import 'search_strings.dart';

/// The board's universal search: everything a teacher can open, in one index, matched by
/// title (English, Hindi, Kannada) and keywords with typos forgiven, results grouped by type.

/// What a result is, in the order groups are listed when they score alike.
enum SearchKind { tool, model3d, lab, formula, kit, sim, picture, book, video, setting }

IconData searchKindIcon(SearchKind k) => switch (k) {
  SearchKind.tool => Icons.work_outline,
  SearchKind.model3d => Icons.view_in_ar_outlined,
  SearchKind.lab => Icons.science_outlined,
  SearchKind.formula => Icons.functions,
  SearchKind.kit => Icons.backpack_outlined,
  SearchKind.sim => Icons.science,
  SearchKind.picture => Icons.image_outlined,
  SearchKind.book => Icons.menu_book_outlined,
  SearchKind.video => Icons.smart_display_outlined,
  SearchKind.setting => Icons.settings_outlined,
};

/// One thing search can find and open.
class SearchItem {
  SearchItem({required this.kind, required this.id, required Map<String, String> titles, this.subtitle = '', this.keywords = const [], this.icon, this.payload})
    : titles = {for (final e in titles.entries) if (e.value.trim().isNotEmpty) e.key: e.value};

  final SearchKind kind;

  /// Unique within [kind].
  final String id;

  /// By language code; at least English.
  final Map<String, String> titles;
  final String subtitle;
  final List<String> keywords;
  final IconData? icon;

  /// What opening it needs (a catalogue id, a formula's TeX, an action…).
  final Object? payload;

  late final SearchTarget target = SearchTarget([
    for (final t in {...titles.values}) SearchField(t),
    for (final k in keywords) SearchField(k, 0.7),
    if (subtitle.isNotEmpty) SearchField(subtitle, 0.5),
  ]);

  String titleIn(String lang) => titles[lang] ?? titles['en'] ?? titles.values.first;
}

class SearchHit {
  const SearchHit(this.item, this.score);
  final SearchItem item;
  final double score;
}

class SearchIndex {
  SearchIndex(Iterable<SearchItem> items) : items = List.unmodifiable(items);

  final List<SearchItem> items;

  SearchIndex plus(Iterable<SearchItem> more) => SearchIndex([...items, ...more]);

  /// Everything matching [query], best first.
  List<SearchHit> search(String query) {
    if (normalizeSearch(query).isEmpty) return const [];
    final hits = [
      for (final i in items)
        if (i.target.score(query) case final s when s > 0) SearchHit(i, s),
    ]..sort((a, b) => b.score.compareTo(a.score));
    return hits;
  }

  /// [search]'s hits by kind, the group with the best hit first.
  List<(SearchKind, List<SearchHit>)> grouped(String query) {
    final by = <SearchKind, List<SearchHit>>{};
    for (final h in search(query)) {
      by.putIfAbsent(h.item.kind, () => []).add(h);
    }
    return [for (final e in by.entries) (e.key, e.value)]
      ..sort((a, b) {
        final d = b.$2.first.score.compareTo(a.$2.first.score);
        return d != 0 ? d : a.$1.index.compareTo(b.$1.index);
      });
  }
}

/// The 3D models and the virtual labs (payload: the catalogue id).
List<SearchItem> catalogueSearchItems() => [
  for (final i in [...modelItems, ...labItems])
    SearchItem(
      kind: i.kind == CatalogueKind.model3d ? SearchKind.model3d : SearchKind.lab,
      id: i.id,
      titles: i.titles,
      subtitle: [SearchStrings('en').subjectName(i.subject), SearchStrings('en').categoryName(i.category)].join(' · '),
      keywords: [
        ...i.keywords,
        for (final lang in searchLanguages) ...[SearchStrings(lang).subjectName(i.subject), SearchStrings(lang).categoryName(i.category)],
      ],
      payload: i.id,
    ),
];

/// The formula sheets and constants (payload: the TeX).
List<SearchItem> formulaSearchItems() => [
  for (final f in allFormulas)
    SearchItem(
      kind: SearchKind.formula,
      id: '${f.set.name}/${f.name}',
      titles: {'en': f.name},
      subtitle: f.chapter.isEmpty ? 'Physics constants' : f.chapter,
      keywords: [f.chapter, texWords(f.tex), f.set == FormulaSet.maths ? 'maths' : 'physics', for (final lang in searchLanguages) SearchStrings(lang).formulas],
      payload: f.tex,
    ),
];

final _facets = {for (final c in [...modelItems, ...labItems]) '${c.kind.name}/${c.id}': c};

/// A subtitle for a result in [lang].
String searchSubtitle(SearchItem i, String lang) {
  if (i.kind == SearchKind.model3d || i.kind == SearchKind.lab) {
    final c = _facets['${i.kind.name}/${i.id}'];
    if (c != null) {
      final s = SearchStrings(lang);
      return '${s.subjectName(c.subject)} · ${s.categoryName(c.category)}';
    }
  }
  return i.subtitle;
}
