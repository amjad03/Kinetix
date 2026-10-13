import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_3d/kinetix_3d.dart' show ModelCatalogue, ModelEntry, RemoteModelInfo;
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';
import '../board/chrome.dart' show showBoardMessage;
import 'catalogue_facets.dart';
import 'filter_bar.dart';
import 'model_downloads.dart';
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
/// typed, then best match first). The 3D models show as a grid of tiles, each with where the
/// model comes from (with the app, saved offline, or online with a download button), with
/// "Download all for offline" and "Request a 3D model" above it.
class CatalogueBrowser extends StatefulWidget {
  const CatalogueBrowser({super.key, required this.kind, required this.onPick, this.initialSubject, this.initialLevel, this.initialQuery = '', this.onRequestModel, this.downloads});

  final CatalogueKind kind;
  final ValueChanged<String> onPick;
  final String? initialSubject;

  /// The class level ('1' to '12') the list opens on.
  final String? initialLevel;
  final String initialQuery;

  /// "Request a 3D model" (model_request.dart); no link without it.
  final VoidCallback? onRequestModel;

  /// The cloud models' downloads; [ModelDownloads.instance] by default.
  final ModelDownloads? downloads;

  @override
  State<CatalogueBrowser> createState() => _CatalogueBrowserState();
}

class _CatalogueBrowserState extends State<CatalogueBrowser> {
  late String _query = widget.initialQuery;
  late String? _subject = widget.initialSubject;
  String? _category;
  late String? _level = widget.initialLevel;

  List<CatalogueItem> get _all => widget.kind == CatalogueKind.model3d ? modelItems : labItems;

  ModelDownloads get _downloads => widget.downloads ?? ModelDownloads.instance;

  @override
  Widget build(BuildContext context) {
    final s = SearchStrings.of(context);
    final lang = s.lang;
    final c = context.colors;
    final all = _all;
    final items = filterCatalogue(all, subject: _subject, category: _category, level: _level, query: _query);
    final ranked = _query.trim().isNotEmpty;
    final filtered = _subject != null || _category != null || _level != null;
    if (widget.kind == CatalogueKind.model3d) {
      return ListenableBuilder(
        listenable: _downloads,
        builder: (context, _) => _layout(context, s, items, filtered, _modelGrid(context, s, lang, items, ranked)),
      );
    }
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
    return _layout(
      context,
      s,
      items,
      filtered,
      ListView(
        key: Key('catalogue-${widget.kind.name}'),
        padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s24),
        children: children,
      ),
    );
  }

  /// The search, the filters and the count over [list].
  Widget _layout(BuildContext context, SearchStrings s, List<CatalogueItem> items, bool filtered, Widget list) {
    final c = context.colors;
    final all = _all;
    final subjects = subjectsIn(all);
    final categories = categoriesIn(all, _subject);
    final levels = levelsIn(all, subject: _subject, category: _category);
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
          child: items.isNotEmpty
              ? list
              : widget.kind == CatalogueKind.model3d
              // Nothing found is when a teacher most wants to ask for a model.
              ? Column(children: [Expanded(child: KxEmptyState(icon: Icons.search_off, message: s.noneMatch)), _modelActions(context, items)])
              : KxEmptyState(icon: Icons.search_off, message: s.noneMatch),
        ),
      ],
    );
  }

  /// The catalogue entries of [items] (3D models).
  List<ModelEntry> _entries(List<CatalogueItem> items) => [for (final i in items) ?ModelCatalogue.byId(i.id)];

  /// "Download all for offline" (the shown cloud models not on the board yet) and "Request a 3D model".
  Widget _modelActions(BuildContext context, List<CatalogueItem> items) {
    final l = context.l10n;
    final d = _downloads;
    final shown = _entries(items);
    final missing = d.missing(shown);
    final anyCloud = shown.any((e) => e.remote != null);
    return Padding(
      padding: const EdgeInsets.fromLTRB(Kx.s8, Kx.s4, Kx.s8, Kx.s4),
      child: Wrap(
        spacing: Kx.s8,
        runSpacing: Kx.s4,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          if (missing.isNotEmpty)
            TextButton.icon(
              key: const Key('download-all'),
              onPressed: d.busy ? null : () => unawaited(_downloadAll(missing)),
              icon: const Icon(Icons.download_for_offline_outlined),
              label: Text(l.model3dDownloadAll(modelSize(missing.fold(0, (n, m) => n + m.bytes)))),
            )
          else if (anyCloud)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: Kx.s8),
              child: Row(
                key: const Key('all-offline'),
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.offline_pin_outlined, size: 18, color: context.colors.onSurfaceVariant),
                  const SizedBox(width: Kx.s4),
                  Text(l.model3dAllSaved, style: context.text.labelMedium?.copyWith(color: context.colors.onSurfaceVariant)),
                ],
              ),
            ),
          if (widget.onRequestModel != null)
            TextButton.icon(key: const Key('request-model'), onPressed: widget.onRequestModel, icon: const Icon(Icons.add_comment_outlined), label: Text(l.model3dRequest)),
        ],
      ),
    );
  }

  Future<void> _download(RemoteModelInfo m) async {
    final title = ModelCatalogue.byId(m.id)?.titleIn(SearchStrings.of(context).lang) ?? m.id;
    final l = context.l10n;
    if (!await _downloads.download(m) && mounted) showBoardMessage(context, l.model3dDownloadFailed(title));
  }

  Future<void> _downloadAll(List<RemoteModelInfo> missing) async {
    final l = context.l10n;
    final lang = SearchStrings.of(context).lang;
    final before = _downloads.failed.length;
    await _downloads.downloadAll(missing);
    if (!mounted || _downloads.failed.length <= before) return;
    final first = missing.firstWhere((m) => _downloads.failed.contains(m.id), orElse: () => missing.first);
    showBoardMessage(context, l.model3dDownloadFailed(ModelCatalogue.byId(first.id)?.titleIn(lang) ?? first.id));
  }

  /// The 3D models as tiles, under their subjects until something is typed.
  Widget _modelGrid(BuildContext context, SearchStrings s, String lang, List<CatalogueItem> items, bool ranked) {
    final c = context.colors;
    const grid = SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent: 240, mainAxisExtent: 216, mainAxisSpacing: Kx.s8, crossAxisSpacing: Kx.s8);
    SliverGrid tiles(List<CatalogueItem> group) => SliverGrid(delegate: SliverChildListDelegate([for (final i in group) _modelTile(context, s, lang, i)]), gridDelegate: grid);
    final slivers = <Widget>[];
    if (ranked) {
      slivers.add(tiles(items));
    } else {
      for (final subject in {for (final i in items) i.subject}) {
        slivers
          ..add(
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(Kx.s8, Kx.s16, Kx.s8, Kx.s8),
                child: Text(s.subjectName(subject), style: context.text.titleSmall?.copyWith(color: c.onSurfaceVariant)),
              ),
            ),
          )
          ..add(tiles([for (final i in items) if (i.subject == subject) i]));
      }
    }
    return CustomScrollView(
      key: const Key('catalogue-model3d'),
      slivers: [
        // Download all and Request a 3D model scroll away with the tiles, leaving them the room.
        SliverToBoxAdapter(child: _modelActions(context, items)),
        for (final sl in slivers) SliverPadding(padding: const EdgeInsets.symmetric(horizontal: Kx.s16), sliver: sl),
        const SliverToBoxAdapter(child: SizedBox(height: Kx.s24)),
      ],
    );
  }

  Widget _modelTile(BuildContext context, SearchStrings s, String lang, CatalogueItem i) {
    final c = context.colors;
    final e = ModelCatalogue.byId(i.id);
    final thumb = e?.info?.thumbAsset ?? e?.remote?.thumbAsset;
    final levels = i.levels.length > 3 ? '${s.levelName(i.levels.first)}–${i.levels.last}' : i.levels.map(s.levelName).join(', ');
    final icon = Icon(Icons.view_in_ar_outlined, size: 40, color: c.primary);
    return Card(
      margin: EdgeInsets.zero,
      color: c.surfaceContainer,
      elevation: 0,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: Key('pick-${i.id}'),
        onTap: () => widget.onPick(i.id),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              height: 88,
              child: ColoredBox(
                color: c.surfaceContainerHighest,
                child: thumb == null ? icon : Image.asset(thumb, fit: BoxFit.cover, errorBuilder: (_, _, _) => icon),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s8, Kx.s8, Kx.s8, 0),
              child: Text(i.titleIn(lang), maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.titleSmall),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: Kx.s8),
              child: Text(
                [s.categoryName(i.category), if (levels.isNotEmpty) levels].join(' · '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.text.labelSmall?.copyWith(color: c.onSurfaceVariant),
              ),
            ),
            const Spacer(),
            if (e != null) _badge(context, e),
          ],
        ),
      ),
    );
  }

  /// Ready (with the app), Saved offline (downloaded), or online with its size and a download
  /// button, and the progress while it downloads.
  Widget _badge(BuildContext context, ModelEntry e) {
    final l = context.l10n;
    final c = context.colors;
    final d = _downloads;
    final style = context.text.labelMedium?.copyWith(color: c.onSurfaceVariant);
    Widget row(IconData icon, String text, {Widget? trailing}) => Padding(
      padding: EdgeInsets.fromLTRB(Kx.s8, 0, trailing == null ? Kx.s8 : 0, trailing == null ? Kx.s8 : 0),
      child: Row(
        children: [
          Icon(icon, size: 16, color: c.onSurfaceVariant),
          const SizedBox(width: Kx.s4),
          Expanded(child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: style)),
          ?trailing,
        ],
      ),
    );
    final remote = e.remote;
    // Downloads go by the model's own id (the catalogue's may differ, `dl.<id>`).
    final progress = remote == null ? null : d.progress(remote.id);
    if (remote != null && progress != null) {
      return Padding(
        key: Key('model-state-${e.id}-downloading'),
        padding: const EdgeInsets.fromLTRB(Kx.s8, 0, Kx.s8, Kx.s8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l.model3dDownloading((progress * 100).round()), style: style),
            const SizedBox(height: Kx.s4),
            LinearProgressIndicator(value: progress == 0 ? null : progress),
          ],
        ),
      );
    }
    return switch (d.of(e)) {
      ModelAvailability.bundled => KeyedSubtree(key: Key('model-state-${e.id}-bundled'), child: row(Icons.check_circle_outline, l.model3dReady)),
      ModelAvailability.downloaded => KeyedSubtree(key: Key('model-state-${e.id}-downloaded'), child: row(Icons.offline_pin_outlined, l.model3dSaved)),
      ModelAvailability.cloud => KeyedSubtree(
        key: Key('model-state-${e.id}-cloud'),
        child: row(
          d.failed.contains(remote!.id) ? Icons.cloud_off_outlined : Icons.cloud_outlined,
          l.model3dCloud(modelSize(remote.bytes)),
          trailing: IconButton(
            key: Key('download-${e.id}'),
            tooltip: l.model3dDownload,
            visualDensity: VisualDensity.compact,
            onPressed: d.busy ? null : () => unawaited(_download(remote)),
            icon: const Icon(Icons.download_outlined),
          ),
        ),
      ),
    };
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
