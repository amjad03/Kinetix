import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/l10n.dart';
import '../../core/library_models.dart';
import '../../widgets/common.dart';
import '../hr/payslips_screen.dart' show rupeesText;

/// The heading of a facet group.
String facetTitle(AppLocalizations l, String f) => switch (f) {
  'subject' => l.libFacetSubject,
  'language' => l.libFacetLanguage,
  'decade' => l.libFacetDecade,
  'material' => l.libFacetMaterial,
  _ => l.libFacetAuthor,
};

/// The library for a teacher: search the catalogue and narrow by subject, language, decade, material or author;
/// see copies on the shelf per branch and join the queue for a title that is out; and my books with renew, my
/// reservations and what I owe.
class LibraryScreen extends StatefulWidget {
  const LibraryScreen({super.key, required this.api, this.initialTab = 0});

  final TeacherApi api;
  final int initialTab;

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> {
  final _query = TextEditingController();
  final Map<String, String> _facets = {};
  bool _shelfOnly = false;
  LibrarySearch? _search;
  List<LibraryTitle> _titles = [];
  MyLibrary? _mine;
  ApiException? _error;
  ApiException? _mineError;
  bool _loading = false;
  String? _busy;

  @override
  void initState() {
    super.initState();
    _loadMine();
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _loadMine() async {
    try {
      final m = await widget.api.myLibrary();
      if (mounted) setState(() => (_mine = m, _mineError = null));
    } on ApiException catch (e) {
      if (mounted) setState(() => _mineError = e);
    }
  }

  Future<void> _run({bool more = false}) async {
    final q = _query.text.trim();
    if (q.isEmpty && _facets.isEmpty && !_shelfOnly) {
      setState(() => (_search = null, _titles = [], _error = null));
      return;
    }
    setState(() => (_loading = true, _error = null));
    try {
      final s = await widget.api.searchLibrary(q, facets: Map.of(_facets), availableOnly: _shelfOnly, page: more ? (_search?.page ?? 0) + 1 : 1);
      if (!mounted) return;
      setState(() => (_search = s, _titles = more ? [..._titles, ...s.titles] : s.titles));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toggle(String facet, String value) {
    setState(() => _facets[facet] == value ? _facets.remove(facet) : _facets[facet] = value);
    _run();
  }

  Future<void> _act(String id, Future<void> Function() call, String done) async {
    setState(() => _busy = id);
    try {
      await call();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(done)));
      await _loadMine();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.errorText(e))));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return DefaultTabController(
      length: 2,
      initialIndex: widget.initialTab,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l.libTitle),
          bottom: TabBar(tabs: [Tab(key: const Key('libTabSearch'), text: l.libTabSearch), Tab(key: const Key('libTabMine'), text: l.libTabMine)]),
        ),
        body: TabBarView(children: [_searchTab(context), _mineTab(context)]),
      ),
    );
  }

  Widget _searchTab(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final s = _search;
    final reserved = {for (final r in _mine?.reservations ?? const <MyReservation>[]) r.bookId};
    return ListView(
      padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s12, Kx.s16, Kx.s32),
      children: [
        TextField(
          key: const Key('libSearch'),
          controller: _query,
          textInputAction: TextInputAction.search,
          onSubmitted: (_) => _run(),
          decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: l.libSearchHint, border: const OutlineInputBorder(borderRadius: Kx.radiusXl)),
        ),
        const SizedBox(height: Kx.s8),
        Wrap(
          spacing: Kx.s8,
          runSpacing: Kx.s4,
          children: [
            FilterChip(
              key: const Key('libShelfOnly'),
              label: Text(s == null ? l.libOnShelf : l.libOnShelfN(s.availableNow)),
              selected: _shelfOnly,
              onSelected: (v) {
                setState(() => _shelfOnly = v);
                _run();
              },
            ),
            for (final e in _facets.entries) InputChip(key: Key('libChosen-${e.key}'), label: Text('${facetTitle(l, e.key)}: ${e.key == 'decade' ? l.libDecade(e.value) : e.value}'), onDeleted: () => _toggle(e.key, e.value)),
          ],
        ),
        if (s != null)
          for (final f in libraryFacets)
            if ((s.facets[f] ?? const []).where((v) => _facets[f] != v.value).isNotEmpty && _facets[f] == null) ...[
              Padding(padding: const EdgeInsets.only(top: Kx.s8, bottom: Kx.s4), child: Text(facetTitle(l, f), style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant))),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final v in s.facets[f]!.take(8))
                      Padding(
                        padding: const EdgeInsets.only(right: Kx.s8),
                        child: ActionChip(key: Key('libFacet-$f-${v.value}'), label: Text('${f == 'decade' ? l.libDecade(v.value) : v.text} (${v.count})'), onPressed: () => _toggle(f, v.value)),
                      ),
                  ],
                ),
              ),
            ],
        if (_error != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: ErrorBanner.api(_error!, onRetry: _run)),
        if (_loading && _titles.isEmpty) const Padding(padding: EdgeInsets.all(Kx.s24), child: Center(child: CircularProgressIndicator())),
        if (s == null && !_loading && _error == null)
          Padding(padding: const EdgeInsets.only(top: Kx.s24), child: KxEmptyState(icon: Icons.local_library_outlined, message: l.libSearchPrompt))
        else if (s != null && _titles.isEmpty && !_loading)
          Padding(padding: const EdgeInsets.only(top: Kx.s24), child: KxEmptyState(key: const Key('libNoMatch'), icon: Icons.search_off, message: l.libNoMatch)),
        if (s != null && _titles.isNotEmpty) ...[
          KxSectionHeader(l.libResults(s.total)),
          for (final b in _titles)
            Card(
              key: Key('libTitle-${b.id}'),
              child: Padding(
                padding: const EdgeInsets.all(Kx.s12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(b.title, style: context.text.titleSmall),
                    if (b.author.isNotEmpty) Text(b.author, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                    Text([if (b.callNo.isNotEmpty) b.callNo, if (b.publisher.isNotEmpty) b.publisher, if (b.pubYear != null) '${b.pubYear}'].join(' · '), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
                    const SizedBox(height: Kx.s8),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            b.available > 0 ? l.libAvailable(b.available, b.copies) : l.libAllOut,
                            style: context.text.labelLarge?.copyWith(color: b.available > 0 ? c.primary : c.onSurfaceVariant),
                          ),
                        ),
                        if (b.reservable)
                          reserved.contains(b.id)
                              ? Text(l.libInQueue, style: context.text.labelLarge?.copyWith(color: c.primary))
                              : TextButton.icon(key: Key('libReserve-${b.id}'), onPressed: _busy == b.id ? null : () => _act(b.id, () => widget.api.reserveTitle(b.id), l.libReserved), icon: const Icon(Icons.bookmark_add_outlined), label: Text(l.libReserve)),
                      ],
                    ),
                    for (final br in b.branches.where((x) => x.branch.isNotEmpty)) Text('${br.branch}: ${br.available}/${br.copies}', style: context.text.bodySmall),
                  ],
                ),
              ),
            ),
          if (s.hasMore) Center(child: TextButton(key: const Key('libMore'), onPressed: _loading ? null : () => _run(more: true), child: Text(l.libMore))),
        ],
      ],
    );
  }

  Widget _mineTab(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final m = _mine;
    if (_mineError != null && m == null) return Padding(padding: const EdgeInsets.all(Kx.s16), child: ErrorBanner.api(_mineError!, onRetry: _loadMine));
    if (m == null) return const Center(child: CircularProgressIndicator());
    return RefreshIndicator(
      onRefresh: _loadMine,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s12, Kx.s16, Kx.s32),
        children: [
          Card(
            key: const Key('libCard'),
            child: ListTile(
              leading: const Icon(Icons.badge_outlined),
              title: Text(l.libCardNo(m.cardNo)),
              subtitle: Text(l.libRules(m.loanDays, m.maxBooks)),
              trailing: m.unpaidPaise + m.accruingPaise > 0 ? Text(rupeesText(m.unpaidPaise + m.accruingPaise), style: context.text.titleSmall?.copyWith(color: c.error)) : null,
            ),
          ),
          KxSectionHeader(l.libOut(m.current.length)),
          if (m.current.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: Kx.s8), child: Text(l.libNothingOut, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant))),
          for (final x in m.current)
            ListTile(
              key: Key('libLoan-${x.id}'),
              contentPadding: EdgeInsets.zero,
              leading: Icon(x.overdue ? Icons.warning_amber_rounded : Icons.menu_book_outlined, color: x.overdue ? c.error : null),
              title: Text(x.title),
              subtitle: Text(x.overdue ? l.libOverdue(x.dueOn, rupeesText(x.fineSoFarPaise)) : l.libDue(x.dueOn), style: x.overdue ? TextStyle(color: c.error) : null),
              trailing: x.canRenew ? TextButton(key: Key('libRenew-${x.id}'), onPressed: _busy == x.id ? null : () => _act(x.id, () => widget.api.renewMyLoan(x.id), l.libRenewed), child: Text(l.libRenew)) : null,
            ),
          if (m.reservations.isNotEmpty) ...[
            KxSectionHeader(l.libMyReservations),
            for (final r in m.reservations)
              ListTile(
                key: Key('libReservation-${r.id}'),
                contentPadding: EdgeInsets.zero,
                leading: Icon(r.ready ? Icons.inventory_2_outlined : Icons.hourglass_top, color: r.ready ? c.primary : c.onSurfaceVariant),
                title: Text(r.title),
                subtitle: Text(r.ready ? l.libReady : l.libWaiting),
                trailing: TextButton(key: Key('libCancel-${r.id}'), onPressed: _busy == r.id ? null : () => _act(r.id, () => widget.api.cancelMyReservation(r.id), l.libCancelled), child: Text(l.libCancel)),
              ),
          ],
        ],
      ),
    );
  }
}
