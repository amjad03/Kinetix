import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import '../board/chrome.dart' show showBoardMessage;
import '../search/filter_bar.dart';
import '../search/fuzzy.dart';
import 'phet_catalogue.dart';
import 'phet_downloads.dart';
import 'phet_strings.dart';
import 'phet_view.dart';

/// What the Sims tab is showing, kept by the board screen so its "Add to board" can picture the
/// open sim, and so a topic's "Related PhET sims" can open one.
class PhetPanelController extends ChangeNotifier {
  String? _openId;
  PhetWebView? _view;
  final boundaryKey = GlobalKey();

  /// The sim open in the panel (null: the browser).
  String? get openId => _openId;

  /// Whether a downloaded sim is showing (so there is something to put on the board).
  bool get showing => _openId != null && _showing;
  bool _showing = false;

  void open(String id) {
    _openId = id;
    notifyListeners();
  }

  void close() {
    _openId = null;
    _showing = false;
    notifyListeners();
  }

  void _attach(PhetWebView? view) {
    _view = view;
    _showing = true;
    WidgetsBinding.instance.addPostFrameCallback((_) => notifyListeners());
  }

  void _detach(PhetWebView? view) {
    if (_view != view) return;
    _view = null;
    _showing = false;
    WidgetsBinding.instance.addPostFrameCallback((_) => notifyListeners());
  }

  /// A PNG of the open sim: PhET's own screenshot from the page, else the panel as Flutter
  /// draws it (Windows, tests).
  Future<Uint8List?> capture() async {
    final fromPage = await _view?.screenshot();
    if (fromPage != null) return fromPage;
    final boundary = boundaryKey.currentContext?.findRenderObject();
    if (boundary is! RenderRepaintBoundary) return null;
    final image = await boundary.toImage(pixelRatio: math.min(1.0, 1280 / math.max(1, boundary.size.width)));
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    return data == null ? null : Uint8List.view(data.buffer);
  }
}

/// The board's downloads, resolving links through the board's API (our mirror) when it has one.
PhetDownloads phetDownloadsFor(BoardController board) {
  _board = board;
  return PhetDownloads.shared ??= PhetDownloads(
    resolve: (id, locale) async {
      final api = _board?.api;
      if (api == null) return phetOriginUrl(id, locale);
      try {
        return await api.phetSimUrl(id, locale);
      } catch (e) {
        debugPrint('PhET link from the API failed ($e); using phet.colorado.edu');
        return phetOriginUrl(id, locale);
      }
    },
  );
}

BoardController? _board;

/// "Add to board": a picture of the open sim, with PhET's attribution under it.
Future<void> addPhetShotToBoard(BuildContext context, WhiteboardController wb, PhetPanelController c, {required bool dark}) async {
  final s = PhetStrings.of(context);
  final id = c.openId;
  final png = await c.capture();
  if (!context.mounted) return;
  if (png == null || id == null) {
    showBoardMessage(context, s.shotFailed);
    return;
  }
  final sim = (await PhetCatalogue.load())[id];
  final size = _pngSize(png);
  final w = math.min(560.0, size.width), h = w * size.height / math.max(1, size.width);
  final credit = '${sim?.title(s.lang) ?? id} · ${PhetStrings.attribution}';
  wb.insert([
    ImageElement(id: newElementId(), rect: Rect.fromLTWH(0, 0, w, h), bytes: png),
    TextElement(
      id: newElementId(),
      position: Offset(0, h + 6),
      text: credit,
      color: dark ? WhiteboardController.chalkWhite : WhiteboardController.inkBlack,
      fontSize: 14,
      size: measureBoardText(credit, 14),
    ),
  ]);
  if (context.mounted) showBoardMessage(context, s.shotAdded);
}

Size _pngSize(Uint8List png) {
  if (png.length < 24) return const Size(640, 420);
  final d = ByteData.sublistView(png);
  return Size(d.getUint32(16).toDouble(), d.getUint32(20).toDouble());
}

/// The split panel's Sims tab: PhET's HTML5 sims with Subject, Topic and Class dropdowns and a
/// search; each downloads once (progress, cancel) and then opens offline in the panel, in the
/// board's language where PhET has it. A storage view lists what is on the board.
class PhetPanel extends StatefulWidget {
  const PhetPanel({super.key, required this.downloads, required this.controller, this.subject});

  final PhetDownloads downloads;
  final PhetPanelController controller;

  /// The period's subject (KINETIX's name, e.g. "Physics"), picked first when it matches.
  final String? subject;

  @override
  State<PhetPanel> createState() => _PhetPanelState();
}

class _PhetPanelState extends State<PhetPanel> {
  late final Future<PhetCatalogue> _load = PhetCatalogue.load();
  String _q = '';
  String? _subject, _topic, _level;
  bool _storage = false;

  @override
  void initState() {
    super.initState();
    final s = widget.subject?.toLowerCase() ?? '';
    _subject = PhetCatalogue.subjectOrder.where((x) => s.contains(x == 'maths' ? 'math' : x)).firstOrNull;
    unawaited(widget.downloads.ready.catchError((Object e) => debugPrint('PhET storage: $e')));
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<PhetCatalogue>(
      future: _load,
      builder: (context, snap) {
        if (snap.hasError) return KxEmptyState(icon: Icons.error_outline, message: '${snap.error}');
        if (!snap.hasData) return const Center(child: CircularProgressIndicator());
        final cat = snap.data!;
        return ListenableBuilder(
          listenable: Listenable.merge([widget.downloads, widget.controller]),
          builder: (context, _) {
            final id = widget.controller.openId;
            final sim = id == null ? null : cat[id];
            if (sim != null) return _SimPage(key: ValueKey(sim.id), sim: sim, downloads: widget.downloads, controller: widget.controller);
            if (_storage) return _storageView(cat);
            return _browser(cat);
          },
        );
      },
    );
  }

  Widget _browser(PhetCatalogue cat) {
    final s = PhetStrings.of(context);
    final lang = s.lang;
    final shown = matching(
      cat.filter(subject: _subject, topic: _topic, level: _level),
      (x) => [x.title(lang), x.titles['en']!, ...x.keywords, ...x.topics.map(s.topicName)],
      _q,
    );
    return Column(
      key: const Key('phet-browser'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ModuleSearchField(key: const Key('phet-search'), hint: s.search, initial: _q, onChanged: (q) => setState(() => _q = q)),
        FilterBar(
          menus: [
            FilterMenu(
              id: 'phet-subject',
              label: s.subject,
              value: _subject,
              options: [for (final x in cat.subjects) (x, s.subjectName(x))],
              onChanged: (x) => setState(() {
                _subject = x;
                if (_topic != null && !cat.topicsOf(x).contains(_topic)) _topic = null;
              }),
            ),
            FilterMenu(
              id: 'phet-topic',
              label: s.topic,
              value: _topic,
              options: [for (final x in cat.topicsOf(_subject)) (x, s.topicName(x))],
              onChanged: (x) => setState(() => _topic = x),
            ),
            FilterMenu(
              id: 'phet-level',
              label: s.level,
              value: _level,
              options: [for (final x in PhetCatalogue.levelOrder) (x, s.levelName(x))],
              onChanged: (x) => setState(() => _level = x),
            ),
          ],
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s4, Kx.s8, 0),
          child: Row(
            children: [
              Expanded(child: Text(s.count(shown.length), key: const Key('phet-count'), style: context.text.labelLarge)),
              TextButton.icon(
                key: const Key('phet-storage'),
                onPressed: () => setState(() => _storage = true),
                icon: const Icon(Icons.storage_outlined, size: 18),
                label: Text(phetSize(widget.downloads.usedBytes)),
              ),
            ],
          ),
        ),
        Expanded(
          child: shown.isEmpty
              ? KxEmptyState(key: const Key('phet-none'), icon: Icons.science_outlined, message: s.noneMatch)
              : ListView.builder(
                  key: const Key('phet-list'),
                  padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s4, Kx.s12, Kx.s12),
                  itemCount: shown.length,
                  itemBuilder: (context, i) => _SimTile(sim: shown[i], downloads: widget.downloads, onOpen: () => widget.controller.open(shown[i].id)),
                ),
        ),
        const PhetAttribution(),
      ],
    );
  }

  Widget _storageView(PhetCatalogue cat) {
    final s = PhetStrings.of(context);
    final d = widget.downloads;
    final ids = d.downloaded;
    return Column(
      key: const Key('phet-storage-view'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s4, Kx.s8, Kx.s16, Kx.s8),
          child: Row(
            children: [
              IconButton(key: const Key('phet-back'), tooltip: s.back, onPressed: () => setState(() => _storage = false), icon: const Icon(Icons.arrow_back)),
              const SizedBox(width: Kx.s4),
              Expanded(child: Text(s.storage, style: context.text.titleLarge)),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
          child: Text(s.used(phetSize(d.usedBytes)), key: const Key('phet-used'), style: context.text.titleSmall),
        ),
        Expanded(
          child: ids.isEmpty
              ? KxEmptyState(icon: Icons.download_outlined, message: s.noneDownloaded)
              : ListView(
                  padding: const EdgeInsets.all(Kx.s8),
                  children: [
                    for (final id in ids)
                      ListTile(
                        key: Key('phet-stored-$id'),
                        leading: _Thumb(sim: cat[id], width: 64),
                        title: Text(cat[id]?.title(s.lang) ?? id, maxLines: 1, overflow: TextOverflow.ellipsis),
                        subtitle: Text(phetSize(d.sizeOf(id) ?? 0)),
                        trailing: IconButton(key: Key('phet-delete-$id'), tooltip: s.delete, onPressed: () => unawaited(d.delete(id)), icon: const Icon(Icons.delete_outline)),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}

/// PhET's attribution, shown wherever a sim or the catalogue is (CC BY 4.0).
class PhetAttribution extends StatelessWidget {
  const PhetAttribution({super.key});

  @override
  Widget build(BuildContext context) => Padding(
    key: const Key('phet-attribution'),
    padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s4, Kx.s12, Kx.s8),
    child: Text(
      PhetStrings.attribution,
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
      style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant),
    ),
  );
}

String _levels(PhetStrings s, PhetSim sim) {
  final l = sim.levels;
  if (l.isEmpty) return '';
  if (l.length == 1) return s.levelName(l.first);
  return '${s.levelName(l.first)}–${l.last == 'UG' ? s.levelName('UG') : l.last}';
}

class _Thumb extends StatelessWidget {
  const _Thumb({required this.sim, this.width = 96});

  final PhetSim? sim;
  final double width;

  @override
  Widget build(BuildContext context) {
    final fallback = ColoredBox(
      color: context.colors.surfaceContainerHigh,
      child: Icon(Icons.science_outlined, color: context.colors.onSurfaceVariant),
    );
    final thumb = sim?.thumb;
    return ClipRRect(
      borderRadius: BorderRadius.circular(Kx.rSm),
      child: SizedBox(
        width: width,
        height: width * 105 / 160,
        child: thumb == null ? fallback : Image.asset(thumb, fit: BoxFit.cover, errorBuilder: (_, _, _) => fallback),
      ),
    );
  }
}

class _SimTile extends StatelessWidget {
  const _SimTile({required this.sim, required this.downloads, required this.onOpen});

  final PhetSim sim;
  final PhetDownloads downloads;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final s = PhetStrings.of(context);
    final c = context.colors;
    final d = downloads;
    final id = sim.id;
    final done = d.isDownloaded(id), busy = d.isDownloading(id);
    final badge = done
        ? _Badge(key: Key('phet-badge-downloaded-$id'), icon: Icons.offline_pin, text: s.downloaded, color: const Color(0xFF34A853))
        : _Badge(key: Key('phet-badge-size-$id'), icon: Icons.download_outlined, text: '${sim.sizeEstimated ? '${s.approx} ' : ''}${phetSize(sim.sizeBytes)}', color: c.onSurfaceVariant);
    return Card(
      key: Key('phet-sim-$id'),
      margin: const EdgeInsets.only(bottom: Kx.s8),
      color: c.surfaceContainer,
      elevation: 0,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.all(Kx.s8),
          child: Row(
            children: [
              _Thumb(sim: sim, width: 88),
              const SizedBox(width: Kx.s12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(sim.title(s.lang), maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.titleSmall),
                    const SizedBox(height: 2),
                    Text(
                      '${s.subjectName(sim.subject)} · ${_levels(s, sim)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                    ),
                    const SizedBox(height: Kx.s4),
                    if (busy)
                      LinearProgressIndicator(key: Key('phet-progress-$id'), value: d.progress(id))
                    else
                      badge,
                  ],
                ),
              ),
              if (busy)
                IconButton(key: Key('phet-cancel-$id'), tooltip: s.cancel, onPressed: () => d.cancel(id), icon: const Icon(Icons.close))
              else if (done)
                IconButton.filledTonal(key: Key('phet-open-$id'), tooltip: s.open, onPressed: onOpen, icon: const Icon(Icons.play_arrow))
              else
                IconButton(
                  key: Key('phet-download-$id'),
                  tooltip: d.partialBytes(id) > 0 ? s.resume : s.download,
                  onPressed: () => unawaited(d.download(sim, sim.localeFor(s.lang))),
                  icon: const Icon(Icons.download),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({super.key, required this.icon, required this.text, required this.color});

  final IconData icon;
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 16, color: color),
      const SizedBox(width: 4),
      Flexible(
        child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.labelMedium?.copyWith(color: color)),
      ),
    ],
  );
}

/// One sim: offline in a WebView once downloaded, else its download.
class _SimPage extends StatelessWidget {
  const _SimPage({super.key, required this.sim, required this.downloads, required this.controller});

  final PhetSim sim;
  final PhetDownloads downloads;
  final PhetPanelController controller;

  @override
  Widget build(BuildContext context) {
    final s = PhetStrings.of(context);
    final d = downloads;
    final id = sim.id;
    final done = d.isDownloaded(id), busy = d.isDownloading(id);
    return Column(
      key: Key('phet-page-$id'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s4, Kx.s4, Kx.s8, Kx.s4),
          child: Row(
            children: [
              IconButton(key: const Key('phet-back'), tooltip: s.back, onPressed: controller.close, icon: const Icon(Icons.arrow_back)),
              const SizedBox(width: Kx.s4),
              Expanded(child: Text(sim.title(s.lang), maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.titleMedium)),
              if (done)
                IconButton(
                  key: Key('phet-delete-$id'),
                  tooltip: s.delete,
                  onPressed: () {
                    controller.close();
                    unawaited(d.delete(id));
                  },
                  icon: const Icon(Icons.delete_outline),
                ),
            ],
          ),
        ),
        Expanded(
          child: done
              ? RepaintBoundary(
                  key: controller.boundaryKey,
                  child: _SimWeb(key: ValueKey('$id-${s.lang}'), sim: sim, locale: sim.localeFor(s.lang), downloads: d, controller: controller),
                )
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(Kx.s16),
                  child: Column(
                    children: [
                      _Thumb(sim: sim, width: 240),
                      const SizedBox(height: Kx.s12),
                      Text(s.downloadFirst, textAlign: TextAlign.center),
                      const SizedBox(height: Kx.s12),
                      if (busy) ...[
                        LinearProgressIndicator(key: Key('phet-progress-$id'), value: d.progress(id)),
                        const SizedBox(height: Kx.s8),
                        OutlinedButton.icon(key: Key('phet-cancel-$id'), onPressed: () => d.cancel(id), icon: const Icon(Icons.close), label: Text(s.cancel)),
                      ] else
                        FilledButton.icon(
                          key: Key('phet-download-$id'),
                          onPressed: () => unawaited(d.download(sim, sim.localeFor(s.lang))),
                          icon: const Icon(Icons.download),
                          label: Text('${d.partialBytes(id) > 0 ? s.resume : s.download} · ${sim.sizeEstimated ? '${s.approx} ' : ''}${phetSize(sim.sizeBytes)}'),
                        ),
                      if (d.failed(id))
                        Padding(
                          padding: const EdgeInsets.only(top: Kx.s8),
                          child: Text(s.couldNotDownload, key: const Key('phet-failed'), style: TextStyle(color: context.colors.error)),
                        ),
                      if (d.lastFromMirror == false)
                        Padding(
                          padding: const EdgeInsets.only(top: Kx.s8),
                          child: Text(s.fromPhet, style: context.text.bodySmall),
                        ),
                    ],
                  ),
                ),
        ),
        const PhetAttribution(),
      ],
    );
  }
}

class _SimWeb extends StatefulWidget {
  const _SimWeb({super.key, required this.sim, required this.locale, required this.downloads, required this.controller});

  final PhetSim sim;
  final String locale;
  final PhetDownloads downloads;
  final PhetPanelController controller;

  @override
  State<_SimWeb> createState() => _SimWebState();
}

class _SimWebState extends State<_SimWeb> {
  final PhetWebView? _view = PhetWebView.create();

  @override
  void initState() {
    super.initState();
    widget.controller._attach(_view);
    if (_view case final v?) {
      unawaited(() async {
        try {
          await v.load(await PhetServer.pageFor(await widget.downloads.directory, widget.sim.id, widget.locale));
        } catch (e) {
          debugPrint('PhET sim failed to open: $e');
        }
      }());
    }
  }

  @override
  void dispose() {
    widget.controller._detach(_view);
    _view?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final v = _view;
    if (v != null) return v.view();
    return KxEmptyState(key: const Key('phet-no-viewer'), icon: Icons.web_asset_off_outlined, message: PhetStrings.of(context).noViewer);
  }
}

/// "Related PhET sims" for a syllabus topic or lab: the sims whose keywords appear in [text].
class RelatedPhetSims extends StatelessWidget {
  const RelatedPhetSims({super.key, required this.text, required this.onOpen});

  final String text;
  final ValueChanged<String> onOpen;

  @override
  Widget build(BuildContext context) {
    final s = PhetStrings.of(context);
    return FutureBuilder<PhetCatalogue>(
      future: PhetCatalogue.load(),
      builder: (context, snap) {
        final sims = snap.data?.related(text) ?? const [];
        if (sims.isEmpty) return const SizedBox.shrink();
        return Column(
          key: const Key('related-phet'),
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: Kx.s16, bottom: Kx.s8),
              child: Text(s.related, style: context.text.titleSmall),
            ),
            Wrap(
              spacing: Kx.s8,
              runSpacing: Kx.s8,
              children: [
                for (final x in sims)
                  ActionChip(
                    key: Key('related-phet-${x.id}'),
                    avatar: const Icon(Icons.science_outlined, size: 18),
                    label: Text(x.title(s.lang)),
                    onPressed: () => onOpen(x.id),
                  ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.only(top: Kx.s4),
              child: Text(PhetStrings.attribution, style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
            ),
          ],
        );
      },
    );
  }
}
