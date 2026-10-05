import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../board/phone_chrome.dart';
import 'fuzzy.dart';
import 'search_index.dart';
import 'search_strings.dart';

/// The last few searches that opened something, newest first, kept on the board.
class RecentSearches {
  RecentSearches._();

  static const key = 'board.search.recent';
  static const max = 8;

  static Future<List<String>> load() async {
    try {
      return (await SharedPreferences.getInstance()).getStringList(key) ?? const [];
    } catch (_) {
      return const [];
    }
  }

  static Future<List<String>> add(String query) async {
    final q = query.trim();
    final list = [...await load()];
    if (q.isEmpty) return list;
    list.removeWhere((r) => normalizeSearch(r) == normalizeSearch(q));
    list.insert(0, q);
    final kept = list.take(max).toList();
    try {
      await (await SharedPreferences.getInstance()).setStringList(key, kept);
    } catch (_) {}
    return kept;
  }

  static Future<void> clear() async {
    try {
      await (await SharedPreferences.getInstance()).remove(key);
    } catch (_) {}
  }
}

/// Search everything on the board: tools, 3D models, labs, formulas, the subject kit,
/// simulations, pictures, books and lessons, concept videos and settings. Full screen on a
/// phone, a large dialog on a panel. [more] adds what has to be loaded (pictures, the
/// syllabus, videos): results show at once and gain those as they arrive.
class UniversalSearch extends StatefulWidget {
  const UniversalSearch({super.key, required this.index, required this.onOpen, this.more = const [], this.initialQuery = ''});

  final SearchIndex index;
  final List<Future<List<SearchItem>>> more;
  final ValueChanged<SearchItem> onOpen;
  final String initialQuery;

  /// Opens the search over [context]; the item picked is opened once the search has closed.
  static Future<void> open(
    BuildContext context, {
    required SearchIndex index,
    required ValueChanged<SearchItem> onOpen,
    List<Future<List<SearchItem>>> more = const [],
    Widget Function(Widget child)? wrap,
  }) async {
    final picked = await showDialog<SearchItem>(
      context: context,
      builder: (_) {
        final search = UniversalSearch(index: index, more: more, onOpen: (_) {});
        return wrap?.call(search) ?? search;
      },
    );
    if (picked != null) onOpen(picked);
  }

  @override
  State<UniversalSearch> createState() => _UniversalSearchState();
}

class _UniversalSearchState extends State<UniversalSearch> {
  late final _text = TextEditingController(text: widget.initialQuery);
  late SearchIndex _index = widget.index;
  List<String> _recent = const [];
  final Set<SearchKind> _expanded = {};

  @override
  void initState() {
    super.initState();
    unawaited(RecentSearches.load().then((r) {
      if (mounted) setState(() => _recent = r);
    }));
    for (final f in widget.more) {
      unawaited(
        f.then((items) {
          if (mounted && items.isNotEmpty) setState(() => _index = _index.plus(items));
        }, onError: (_) {}),
      );
    }
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _open(SearchItem item) async {
    await RecentSearches.add(_text.text);
    if (!mounted) return;
    widget.onOpen(item);
    await Navigator.of(context).maybePop(item);
  }

  void _query(String q) {
    _text.text = q;
    _text.selection = TextSelection.collapsed(offset: q.length);
    setState(_expanded.clear);
  }

  @override
  Widget build(BuildContext context) {
    final s = SearchStrings.of(context);
    final phone = context.isPhone;
    final groups = _index.grouped(_text.text);
    final field = Padding(
      padding: const EdgeInsets.fromLTRB(Kx.s8, Kx.s8, Kx.s8, Kx.s8),
      child: Row(
        children: [
          IconButton(
            key: const Key('universal-search-close'),
            tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const Icon(Icons.arrow_back),
          ),
          Expanded(
            child: CallbackShortcuts(
              bindings: {const SingleActivator(LogicalKeyboardKey.escape): () => Navigator.of(context).maybePop()},
              child: TextField(
                key: const Key('universal-search-field'),
                controller: _text,
                autofocus: true,
                textInputAction: TextInputAction.search,
                onChanged: (_) => setState(_expanded.clear),
                onSubmitted: (_) {
                  if (groups.isNotEmpty) unawaited(_open(groups.first.$2.first.item));
                },
                decoration: InputDecoration(
                  hintText: s.searchHint,
                  isDense: true,
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _text.text.isEmpty
                      ? null
                      : IconButton(tooltip: MaterialLocalizations.of(context).deleteButtonTooltip, onPressed: () => _query(''), icon: const Icon(Icons.close)),
                ),
              ),
            ),
          ),
        ],
      ),
    );
    final body = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        field,
        const Divider(height: 1),
        Expanded(child: normalizeSearch(_text.text).isEmpty ? _start(s) : _results(s, groups)),
      ],
    );
    if (phone) return Dialog.fullscreen(key: const Key('universal-search'), child: SafeArea(child: body));
    final size = MediaQuery.sizeOf(context);
    return Dialog(
      key: const Key('universal-search'),
      alignment: Alignment.topCenter,
      insetPadding: const EdgeInsets.fromLTRB(Kx.s24, 48, Kx.s24, Kx.s24),
      clipBehavior: Clip.antiAlias,
      child: SizedBox(width: 760, height: size.height * 0.8, child: body),
    );
  }

  Widget _start(SearchStrings s) {
    final c = context.colors;
    return ListView(
      key: const Key('universal-search-start'),
      padding: const EdgeInsets.all(Kx.s16),
      children: [
        if (_recent.isNotEmpty) ...[
          Row(
            children: [
              Expanded(child: Text(s.recent, style: context.text.titleSmall)),
              TextButton(
                key: const Key('recent-clear'),
                onPressed: () async {
                  await RecentSearches.clear();
                  if (mounted) setState(() => _recent = const []);
                },
                child: Text(s.clearRecent),
              ),
            ],
          ),
          Wrap(
            spacing: Kx.s8,
            runSpacing: Kx.s8,
            children: [
              for (final r in _recent) ActionChip(key: Key('recent-$r'), avatar: const Icon(Icons.history, size: 18), label: Text(r), onPressed: () => _query(r)),
            ],
          ),
          const SizedBox(height: Kx.s16),
        ],
        Text(s.tryThese, style: context.text.titleSmall),
        const SizedBox(height: Kx.s8),
        Wrap(
          spacing: Kx.s8,
          runSpacing: Kx.s8,
          children: [for (final t in s.suggestions) ActionChip(label: Text(t), onPressed: () => _query(t))],
        ),
        const SizedBox(height: Kx.s16),
        Text(s.offlineHint, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
      ],
    );
  }

  Widget _results(SearchStrings s, List<(SearchKind, List<SearchHit>)> groups) {
    final c = context.colors;
    if (groups.isEmpty) {
      return KxEmptyState(key: const Key('universal-search-empty'), icon: Icons.search_off, message: s.noResults(_text.text.trim()));
    }
    const shown = 4;
    return ListView(
      key: const Key('universal-search-results'),
      padding: const EdgeInsets.fromLTRB(Kx.s8, Kx.s8, Kx.s8, Kx.s24),
      children: [
        for (final (kind, hits) in groups) ...[
          Padding(
            key: Key('group-${kind.name}'),
            padding: const EdgeInsets.fromLTRB(Kx.s8, Kx.s12, Kx.s8, Kx.s4),
            child: Row(
              children: [
                Icon(searchKindIcon(kind), size: 18, color: c.primary),
                const SizedBox(width: Kx.s8),
                Expanded(child: Text(s.kindName(kind.name), style: context.text.titleSmall?.copyWith(color: c.primary))),
                Text('${hits.length}', style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant)),
              ],
            ),
          ),
          for (final h in _expanded.contains(kind) ? hits : hits.take(shown))
            ListTile(
              key: Key('result-${kind.name}-${h.item.id}'),
              dense: true,
              minTileHeight: phoneTarget,
              leading: Icon(h.item.icon ?? searchKindIcon(kind), color: c.onSurfaceVariant),
              title: Text(h.item.titleIn(s.lang), maxLines: 2, overflow: TextOverflow.ellipsis),
              subtitle: switch (searchSubtitle(h.item, s.lang)) {
                '' => null,
                final sub => Text(sub, maxLines: 1, overflow: TextOverflow.ellipsis),
              },
              onTap: () => _open(h.item),
            ),
          if (hits.length > shown && !_expanded.contains(kind))
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton(
                key: Key('show-all-${kind.name}'),
                onPressed: () => setState(() => _expanded.add(kind)),
                child: Text(s.showAll(hits.length)),
              ),
            ),
        ],
      ],
    );
  }
}
