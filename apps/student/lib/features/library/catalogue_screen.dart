import 'dart:async';

import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/self_service.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import '../../widgets/load_view.dart';

/// The library catalogue: search by title, author, subject or ISBN, copies on the shelf by branch,
/// joining the queue for a book that is out, and my reservations.
class CatalogueScreen extends StatefulWidget {
  const CatalogueScreen({super.key, required this.api, this.debounce = const Duration(milliseconds: 400)});

  final StudentApi api;
  final Duration debounce;

  static Future<void> open(BuildContext context, StudentApi api) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CatalogueScreen(api: api)));

  @override
  State<CatalogueScreen> createState() => _CatalogueScreenState();
}

class _CatalogueScreenState extends State<CatalogueScreen> {
  final _query = TextEditingController();
  Timer? _wait;
  bool _shelfOnly = false;
  CataloguePage? _page;
  List<CatalogueBook> _books = [];
  List<BookReservation>? _reservations;
  ApiException? _error;
  bool _loading = false;
  String? _reserving;

  @override
  void initState() {
    super.initState();
    _loadReservations();
  }

  @override
  void dispose() {
    _wait?.cancel();
    _query.dispose();
    super.dispose();
  }

  Future<void> _loadReservations() async {
    try {
      final r = await widget.api.myReservations();
      if (mounted) setState(() => _reservations = r);
    } on ApiException {
      if (mounted) setState(() => _reservations = const []);
    }
  }

  void _changed(String _) {
    _wait?.cancel();
    _wait = Timer(widget.debounce, () => _search());
  }

  Future<void> _search({bool more = false}) async {
    final q = _query.text.trim();
    if (q.isEmpty && !_shelfOnly) {
      setState(() {
        _page = null;
        _books = [];
        _error = null;
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final p = await widget.api.searchCatalogue(q, availableOnly: _shelfOnly, page: more ? (_page?.page ?? 0) + 1 : 1);
      if (!mounted || (q != _query.text.trim())) return;
      setState(() {
        _page = p;
        _books = more ? [..._books, ...p.books] : p.books;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _reserve(CatalogueBook b) async {
    setState(() => _reserving = b.id);
    final ok = await attempt(context, () => widget.api.reserveBook(b.id), done: context.l10n.libReserved);
    if (mounted) setState(() => _reserving = null);
    if (ok) await _loadReservations();
  }

  Future<void> _cancel(BookReservation r) async {
    final ok = await attempt(context, () => widget.api.cancelReservation(r.id), done: context.l10n.libReservationCancelled);
    if (ok) await _loadReservations();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final reserved = {for (final r in _reservations ?? const <BookReservation>[]) r.bookId};
    return Scaffold(
      appBar: AppBar(
        title: Text(l.libCatalogue),
        actions: [IconButton(key: const Key('openSelfCheckout'), tooltip: l.libSelfCheckout, icon: const Icon(Icons.qr_code_scanner), onPressed: () => SelfCheckoutScreen.open(context, widget.api))],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await Future.wait([_search(), _loadReservations()]);
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
          children: [
            TextField(
              key: const Key('catalogueSearch'),
              controller: _query,
              textInputAction: TextInputAction.search,
              onChanged: _changed,
              onSubmitted: (_) => _search(),
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search),
                hintText: l.libSearchHint,
                border: const OutlineInputBorder(borderRadius: Kx.radiusXl),
                suffixIcon: _query.text.isEmpty
                    ? null
                    : IconButton(
                        tooltip: l.libClear,
                        icon: const Icon(Icons.close),
                        onPressed: () {
                          _query.clear();
                          _search();
                        },
                      ),
              ),
            ),
            const SizedBox(height: Kx.s8),
            Wrap(
              children: [
                FilterChip(
                  key: const Key('shelfOnly'),
                  label: Text(l.libOnShelfOnly),
                  selected: _shelfOnly,
                  onSelected: (v) {
                    setState(() => _shelfOnly = v);
                    _search();
                  },
                ),
              ],
            ),
            if ((_reservations ?? const []).isNotEmpty) ...[
              SectionTitle(l.libMyReservations),
              for (final r in _reservations!)
                Card(
                  key: Key('reservation-${r.id}'),
                  color: r.ready ? Tone.goodContainer(context) : null,
                  child: ListTile(
                    leading: Icon(r.ready ? Icons.inventory_2_outlined : Icons.hourglass_top, color: r.ready ? Tone.good(context) : c.onSurfaceVariant),
                    title: Text(r.title),
                    subtitle: Text(r.ready ? (r.expiresAt == null ? l.libReadyPickUp : l.libReadyUntil(context.fmt.dateTime(r.expiresAt!))) : l.libQueuePlace(r.position)),
                    trailing: TextButton(key: Key('cancelReservation-${r.id}'), onPressed: () => _cancel(r), child: Text(l.cancel)),
                  ),
                ),
            ],
            if (_error != null) ...[const SizedBox(height: Kx.s12), ErrorBanner(_error!, onRetry: _search)],
            if (_loading && _books.isEmpty) const Padding(padding: EdgeInsets.all(Kx.s24), child: KxLoading()),
            if (_page == null && !_loading && _error == null)
              KxEmptyState(icon: Icons.local_library_outlined, message: l.libSearchPrompt)
            else if (_page != null && _books.isEmpty && !_loading)
              KxEmptyState(key: const Key('catalogueEmpty'), icon: Icons.search_off, message: l.libNoMatch),
            if (_page != null && _books.isNotEmpty) ...[
              SectionTitle(l.libResults(_page!.total)),
              for (final b in _books) _BookCard(book: b, reserved: reserved.contains(b.id), busy: _reserving == b.id, onReserve: () => _reserve(b)),
              if (_page!.hasMore)
                Center(
                  child: TextButton(key: const Key('catalogueMore'), onPressed: _loading ? null : () => _search(more: true), child: Text(l.libMore)),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _BookCard extends StatelessWidget {
  const _BookCard({required this.book, required this.reserved, required this.busy, required this.onReserve});

  final CatalogueBook book;
  final bool reserved;
  final bool busy;
  final VoidCallback onReserve;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final b = book;
    final onShelf = b.available > 0;
    return Card(
      key: Key('book-${b.id}'),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                IconBadge(Icons.menu_book_outlined, background: onShelf ? null : c.surfaceContainerHighest, foreground: onShelf ? null : c.onSurfaceVariant),
                const SizedBox(width: Kx.s12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(b.title, style: context.text.titleSmall),
                      if (b.author.isNotEmpty) Text(b.author, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                      Text(
                        [if (b.callNo.isNotEmpty) b.callNo, if (b.edition.isNotEmpty) b.edition, if (b.publisher.isNotEmpty) b.publisher, if (b.pubYear != null) '${b.pubYear}'].join(' · '),
                        style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: Kx.s8),
            Wrap(
              spacing: Kx.s8,
              runSpacing: Kx.s4,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Pill(
                  onShelf ? l.libOnShelf(b.available, b.copies) : l.libAllOut,
                  icon: onShelf ? Icons.check_circle_outline : Icons.schedule,
                  background: onShelf ? Tone.goodContainer(context) : Tone.warnContainer(context),
                  foreground: onShelf ? Tone.good(context) : Tone.warn(context),
                ),
                for (final br in b.branches.where((x) => x.branch.isNotEmpty && b.branches.length > 1)) Text('${br.branch}: ${br.available}/${br.copies}', style: context.text.bodySmall),
              ],
            ),
            if (b.reservable)
              Align(
                alignment: Alignment.centerRight,
                child: reserved
                    ? Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(l.libInQueue, style: context.text.labelLarge?.copyWith(color: c.primary)))
                    : TextButton.icon(key: Key('reserve-${b.id}'), onPressed: busy ? null : onReserve, icon: const Icon(Icons.bookmark_add_outlined), label: Text(l.libReserve)),
              ),
          ],
        ),
      ),
    );
  }
}

/// Self-checkout at the library: type (or scan into the box with a barcode keyboard) the number on
/// the book's barcode label; the loan is made on the student's own card.
class SelfCheckoutScreen extends StatefulWidget {
  const SelfCheckoutScreen({super.key, required this.api});

  final StudentApi api;

  static Future<void> open(BuildContext context, StudentApi api) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => SelfCheckoutScreen(api: api)));

  @override
  State<SelfCheckoutScreen> createState() => _SelfCheckoutScreenState();
}

class _SelfCheckoutScreenState extends State<SelfCheckoutScreen> {
  final _code = TextEditingController();
  final _done = <SelfCheckout>[];
  bool _busy = false;
  Object? _problem;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _borrow() async {
    final code = _code.text.trim();
    if (code.isEmpty) return;
    setState(() {
      _busy = true;
      _problem = null;
    });
    try {
      final loan = await widget.api.selfCheckout(code);
      if (!mounted) return;
      setState(() {
        _done.insert(0, loan);
        _code.clear();
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _problem = e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    return Scaffold(
      appBar: AppBar(title: Text(l.libSelfCheckout)),
      body: ListView(
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          Text(l.libSelfCheckoutHelp, style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
          const SizedBox(height: Kx.s16),
          TextField(
            key: const Key('copyCode'),
            controller: _code,
            autofocus: true,
            autocorrect: false,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _borrow(),
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(labelText: l.libCopyCode, prefixIcon: const Icon(Icons.qr_code_2), border: const OutlineInputBorder()),
          ),
          if (_problem != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: ErrorBanner(_problem!)),
          const SizedBox(height: Kx.s16),
          FilledButton.icon(
            key: const Key('borrow'),
            onPressed: _busy || _code.text.trim().isEmpty ? null : _borrow,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)),
            icon: _busy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.library_add_check_outlined),
            label: Text(l.libBorrow),
          ),
          for (final d in _done)
            Card(
              key: Key('borrowed-${d.loanId}'),
              color: Tone.goodContainer(context),
              margin: const EdgeInsets.only(top: Kx.s12),
              child: ListTile(
                leading: Icon(Icons.check_circle, color: Tone.good(context)),
                title: Text(d.title),
                subtitle: Text(l.libBorrowedDue(context.fmt.shortDay(d.dueOn))),
              ),
            ),
        ],
      ),
    );
  }
}
