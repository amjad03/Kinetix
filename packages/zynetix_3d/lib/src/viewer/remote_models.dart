import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../glb.dart';
import '../math3d.dart';
import '../mesh.dart';
import '../model.dart';
import '../model_viewer.dart';
import 'manifest.dart';
import 'strings.dart';

part 'remote_catalogue_data.dart';

/// A named point on a downloadable model, with its name in en, hi and kn. [x], [y], [z] are
/// fractions (-1..1) of the model's bounding radius around its centre.
class ModelHotspot {
  const ModelHotspot(this.name, this.x, this.y, this.z);
  final LocalText name;
  final double x, y, z;
}

/// A model that is not bundled: downloaded on first use to the cache, then kept offline.
class RemoteModelInfo {
  const RemoteModelInfo({
    required this.id,
    required this.title,
    required this.subject,
    required this.topic,
    required this.classes,
    required this.url,
    required this.bytes,
    required this.license,
    required this.credit,
    this.hotspots = const [],
    this.keywords = const [],
    this.viewer = false,
  });

  final String id;
  final LocalText title;
  final String subject;

  /// The class-context model topic (`solar`, `earth`, `human`...), see ToolProfile.models.
  final String topic;
  final List<int> classes;
  final String url;

  /// Download size (the model and its manifest), shown before fetching.
  final int bytes;
  final String license;
  final String credit;
  final List<ModelHotspot> hotspots;
  final List<String> keywords;

  /// Made for the three.js viewer by tool/models (named parts, labels in three languages,
  /// cuts, take-apart): [url] is the GLB and [manifestUrl] its manifest. Otherwise [url] is
  /// a plain GLB that the Dart renderer shows with [hotspots].
  final bool viewer;

  String get manifestUrl => url.replaceFirst(RegExp(r'\.glb$'), '.json');

  /// The model's file name on any model server (`saturn_v.glb`).
  String get fileName => url.substring(url.lastIndexOf('/') + 1);

  /// Where to fetch the model from, in order: the servers set in [RemoteModels.servers] (a
  /// school's own server, the ZYNETIX API's /assets/models), then [url] (GitHub).
  List<String> get urls => [for (final b in RemoteModels.servers) '$b/$fileName', url];

  /// The library picture, bundled so the library looks the same offline.
  String get thumbAsset => 'packages/zynetix_3d/$viewerAssets/thumbs/$id.jpg';
}

/// The downloadable library. Every entry is recorded in docs/licensing/3D_MODELS.md.
class RemoteModels {
  RemoteModels._();

  /// Where tool/models puts the downloadable models (packages/zynetix_3d/remote_models in
  /// the ZYNETIX repository on GitHub): the last place a model is fetched from.
  static const defaultBase = 'https://raw.githubusercontent.com/amjad03/Kinetix/refs/heads/claude/kinetix-ecosystem-overview-lpphjn/packages/zynetix_3d/remote_models';

  /// Model servers tried before GitHub, in order: the board's own setting, the institution's
  /// (from the API's board config) and the ZYNETIX API's /assets/models. Each serves the
  /// files of packages/zynetix_3d/remote_models under the same names.
  static List<String> get servers => _servers;
  static List<String> _servers = const [];
  static set servers(List<String> list) {
    final out = <String>[];
    for (final s in list) {
      final b = cleanServer(s);
      if (b != null && b != defaultBase && !out.contains(b)) out.add(b);
    }
    _servers = List.unmodifiable(out);
  }

  /// [url] as a model server address (http or https, no trailing slash), or null.
  static String? cleanServer(String? url) {
    final t = (url ?? '').trim().replaceAll(RegExp(r'/+$'), '');
    final u = Uri.tryParse(t);
    if (t.isEmpty || u == null || !(u.scheme == 'http' || u.scheme == 'https') || u.host.isEmpty) return null;
    return t;
  }

  /// Every downloadable model: the viewer models tool/models makes, NASA's spacecraft among
  /// them (remote_catalogue_data.dart, written by tool/models/write_catalogue.mjs).
  static const all = _remoteModels;

  /// Where downloaded models are kept. The app points this at its support directory at start-up.
  static Directory get cacheDir => _cacheDir;
  static Directory _cacheDir = Directory('${Directory.systemTemp.path}/zynetix_models');

  /// A cache made before the app set the folder would keep downloading to the old one while the
  /// viewer read from the new one, so a new folder starts a new cache.
  static set cacheDir(Directory dir) {
    if (dir.path == _cacheDir.path) return;
    _cacheDir = dir;
    _cache = null;
  }

  static ModelCache? _cache;
  static ModelCache get cache => _cache ??= ModelCache(cacheDir);

  static RemoteModelInfo? byId(String id) {
    for (final m in all) {
      if (m.id == id) return m;
    }
    return null;
  }

  /// A downloaded viewer file (`<id>.glb`, `<id>.json`) from the cache, if it is there.
  static File? cachedFile(String name) {
    if (name.contains('/') || name.contains('..')) return null;
    final f = File('${cacheDir.path}/$name');
    return f.existsSync() ? f : null;
  }

  /// Filters by subject, class, class-context topics and a search [query] (matched in the
  /// title in every language and in the keywords).
  static List<RemoteModelInfo> filter({String? subject, int? grade, String query = '', Set<String>? topics, List<RemoteModelInfo> from = all}) {
    final q = query.trim().toLowerCase();
    return [
      for (final m in from)
        if ((subject == null || m.subject == subject) &&
            (grade == null || m.classes.contains(grade)) &&
            (topics == null || topics.isEmpty || topics.contains(m.topic)) &&
            (q.isEmpty || m.keywords.any((k) => k.contains(q)) || m.title.byLang.values.any((t) => t.toLowerCase().contains(q))))
          m,
    ];
  }
}

/// Raised when a download is needed but the device is offline.
class OfflineException implements Exception {
  const OfflineException();
  @override
  String toString() => 'No internet connection';
}

/// Fetches [url], reporting `(received, total)`. Replaced in tests.
typedef ModelFetcher = Future<Uint8List> Function(String url, void Function(int received, int total) onProgress);

Future<Uint8List> httpModelFetcher(String url, void Function(int received, int total) onProgress) async {
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 15);
  try {
    final req = await client.getUrl(Uri.parse(url));
    final res = await req.close();
    if (res.statusCode != 200) throw HttpException('HTTP ${res.statusCode}', uri: Uri.parse(url));
    final out = BytesBuilder(copy: false);
    await for (final chunk in res) {
      out.add(chunk);
      onProgress(out.length, res.contentLength);
    }
    return out.takeBytes();
  } on SocketException {
    throw const OfflineException();
  } on TimeoutException {
    throw const OfflineException();
  } finally {
    client.close();
  }
}

/// Whether [bytes] start like a glTF 2.0 binary of their full length (viewer models are
/// meshopt-compressed, which only the viewer reads).
bool looksLikeGlb(Uint8List bytes) {
  if (bytes.length < 20) return false;
  final d = ByteData.sublistView(bytes);
  return d.getUint32(0, Endian.little) == 0x46546C67 && d.getUint32(4, Endian.little) == 2 && d.getUint32(8, Endian.little) == bytes.length;
}

/// Downloaded models on disk. A file is written whole under a temporary name and renamed, so
/// a download cut off by a lost connection never leaves a broken model behind. A viewer
/// model is its GLB and its manifest; it counts as downloaded once both are there.
class ModelCache {
  ModelCache(this.dir, {ModelFetcher? fetcher}) : _fetch = fetcher ?? httpModelFetcher;
  final Directory dir;
  final ModelFetcher _fetch;

  File fileFor(RemoteModelInfo m) => File('${dir.path}/${m.id}.glb');
  File manifestFor(RemoteModelInfo m) => File('${dir.path}/${m.id}.json');
  bool isCached(RemoteModelInfo m) => fileFor(m).existsSync() && (!m.viewer || manifestFor(m).existsSync());

  /// The model's bytes: from the cache, else downloaded (and kept). Each of [RemoteModelInfo.urls]
  /// is tried in turn: a server that is down, lacks the model or sends something that is not
  /// the model (a sign-in page) hands over to the next, GitHub last. Throws [OfflineException]
  /// when no server could be reached.
  Future<Uint8List> load(RemoteModelInfo m, {void Function(int received, int total)? onProgress}) async {
    final f = fileFor(m);
    if (isCached(m)) return f.readAsBytes();
    Object? error;
    var reached = false;
    for (final url in m.urls) {
      try {
        final bytes = await _fetch(url, onProgress ?? (_, _) {});
        reached = true;
        // Reject anything that is not a readable model before keeping it.
        if (m.viewer) {
          if (!looksLikeGlb(bytes)) throw GlbFormatException('not a GLB file');
        } else {
          GlbLoader.parse(bytes);
        }
        Uint8List? manifest;
        if (m.viewer) {
          manifest = await _fetch(url.replaceFirst(RegExp(r'\.glb$'), '.json'), (_, _) {});
          final j = jsonDecode(utf8.decode(manifest));
          if (j is! Map || j['id'] != m.id) throw const FormatException('not the model\'s manifest');
        }
        dir.createSync(recursive: true);
        if (manifest != null) await _keep(manifestFor(m), manifest);
        await _keep(f, bytes);
        return bytes;
      } on OfflineException catch (e) {
        error = e;
      } catch (e) {
        reached = true;
        error = e;
      }
    }
    if (!reached) throw const OfflineException();
    throw error ?? const OfflineException();
  }

  Future<void> _keep(File f, Uint8List bytes) async {
    final tmp = File('${f.path}.part');
    await tmp.writeAsBytes(bytes, flush: true);
    await tmp.rename(f.path);
  }

  /// Cached model ids.
  List<String> get cachedIds => [
        if (dir.existsSync())
          for (final e in dir.listSync())
            if (e is File && e.path.endsWith('.glb')) e.uri.pathSegments.last.replaceAll('.glb', ''),
      ];

  void clear() {
    if (dir.existsSync()) dir.deleteSync(recursive: true);
  }
}

/// [model] with every part pushed away from the centre by [t] (0 assembled, 1 fully apart).
Model3D explodedModel(Model3D model, double t) {
  if (t <= 0 || model.parts.length < 2) return model;
  final (c, r) = model.bounds;
  final parts = <ModelPart>[];
  for (final p in model.parts) {
    final pos = p.mesh.positions;
    final n = pos.length ~/ 3;
    if (n == 0) {
      parts.add(p);
      continue;
    }
    var sx = 0.0, sy = 0.0, sz = 0.0;
    for (var i = 0; i < pos.length; i += 3) {
      sx += pos[i];
      sy += pos[i + 1];
      sz += pos[i + 2];
    }
    var dx = sx / n - c.x, dy = sy / n - c.y, dz = sz / n - c.z;
    final len = math.sqrt(dx * dx + dy * dy + dz * dz);
    final k = len < 1e-9 ? 0.0 : r * 0.6 * t / len;
    dx *= k;
    dy *= k;
    dz *= k;
    final moved = Float32List.fromList([
      for (var i = 0; i < pos.length; i += 3) ...[pos[i] + dx, pos[i + 1] + dy, pos[i + 2] + dz],
    ]);
    parts.add(ModelPart(
      id: p.id,
      mesh: Mesh(positions: moved, indices: p.mesh.indices, normals: p.mesh.normals, vertexColors: p.mesh.vertexColors, uvs: p.mesh.uvs),
      color: p.color,
      name: p.name,
      description: p.description,
      doubleSided: p.doubleSided,
    ));
  }
  return Model3D(title: model.title, caption: model.caption, subjects: model.subjects, parts: parts, labels: model.labels, initialYaw: model.initialYaw, initialPitch: model.initialPitch, boundsRadius: r, center: c);
}

/// [model] with [info]'s hotspots as labels in [lang].
Model3D withHotspots(Model3D model, RemoteModelInfo info, String lang) {
  final (c, r) = model.bounds;
  return Model3D(
    title: model.title,
    caption: model.caption,
    subjects: model.subjects,
    parts: model.parts,
    labels: [for (final h in info.hotspots) Label3D(h.name.of(lang), Vec3(c.x + h.x * r, c.y + h.y * r, c.z + h.z * r))],
    initialYaw: model.initialYaw,
    initialPitch: model.initialPitch,
    boundsRadius: r,
    center: c,
  );
}

/// Shows a downloadable model: a progress bar while it downloads, an offline notice if it
/// cannot, then the viewer with a labels switch and an "Explode" slider.
class RemoteModelView extends StatefulWidget {
  const RemoteModelView({super.key, required this.info, required this.cache, this.lang = 'en'});
  final RemoteModelInfo info;
  final ModelCache cache;
  final String lang;

  @override
  State<RemoteModelView> createState() => _RemoteModelViewState();
}

class _RemoteModelViewState extends State<RemoteModelView> {
  Model3D? _model;
  double _progress = 0;
  Object? _error;
  double _explode = 0;
  bool _hotspots = true;

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    setState(() {
      _error = null;
      _progress = 0;
    });
    try {
      final bytes = await widget.cache.load(widget.info, onProgress: (got, total) {
        if (mounted) setState(() => _progress = total > 0 ? got / total : got / widget.info.bytes);
      });
      final m = GlbLoader.load(bytes, title: widget.info.title.of(widget.lang), caption: widget.info.credit, subjects: [widget.info.subject]);
      if (mounted) setState(() => _model = m);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Viewer3dStrings(widget.lang);
    if (_error != null) return _DownloadProblem(info: widget.info, error: _error!, strings: s, onRetry: _start);
    final base = _model;
    if (base == null) return _DownloadProgress(info: widget.info, progress: _progress, strings: s, lang: widget.lang);
    var shown = explodedModel(base, _explode);
    if (_hotspots) shown = withHotspots(shown, widget.info, widget.lang);
    return Column(children: [
      Expanded(child: ModelViewer(model: shown)),
      Row(children: [
        const SizedBox(width: 12),
        Text(s.assemble),
        Expanded(child: Slider(value: _explode, onChanged: (v) => setState(() => _explode = v))),
        Text(s.explode),
        const SizedBox(width: 12),
        FilterChip(label: Text(s.labels), selected: _hotspots, onSelected: (v) => setState(() => _hotspots = v)),
        const SizedBox(width: 12),
      ]),
    ]);
  }
}

class _DownloadProgress extends StatelessWidget {
  const _DownloadProgress({required this.info, required this.progress, required this.strings, required this.lang});
  final RemoteModelInfo info;
  final double progress;
  final Viewer3dStrings strings;
  final String lang;

  @override
  Widget build(BuildContext context) => Center(
    key: const ValueKey('model3d-downloading'),
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      Text(strings.downloading(info.title.of(lang)), textAlign: TextAlign.center),
      const SizedBox(height: 12),
      SizedBox(width: 280, child: LinearProgressIndicator(value: progress == 0 ? null : progress)),
    ]),
  );
}

class _DownloadProblem extends StatelessWidget {
  const _DownloadProblem({required this.info, required this.error, required this.strings, required this.onRetry});
  final RemoteModelInfo info;
  final Object error;
  final Viewer3dStrings strings;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    key: const ValueKey('model3d-download-problem'),
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(error is OfflineException ? Icons.wifi_off_outlined : Icons.error_outline, size: 40),
        const SizedBox(height: 12),
        Text(error is OfflineException ? strings.needsDownload(info.bytes) : strings.downloadFailed, textAlign: TextAlign.center),
        const SizedBox(height: 12),
        FilledButton(onPressed: onRetry, child: Text(strings.tryAgain)),
      ]),
    ),
  );
}

/// A downloadable viewer model ([RemoteModelInfo.viewer]): downloads it once (progress, an
/// offline notice and Try again), then [builder] shows it in the three.js viewer, which
/// reads it from the cache like a bundled model.
class RemoteViewerGate extends StatefulWidget {
  const RemoteViewerGate({super.key, required this.info, required this.cache, required this.builder, this.lang = 'en'});
  final RemoteModelInfo info;
  final ModelCache cache;
  final WidgetBuilder builder;
  final String lang;

  @override
  State<RemoteViewerGate> createState() => _RemoteViewerGateState();
}

class _RemoteViewerGateState extends State<RemoteViewerGate> {
  bool _ready = false;
  double _progress = 0;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _ready = widget.cache.isCached(widget.info);
    if (!_ready) _start();
  }

  Future<void> _start() async {
    setState(() {
      _error = null;
      _progress = 0;
    });
    try {
      await widget.cache.load(widget.info, onProgress: (got, total) {
        if (mounted) setState(() => _progress = total > 0 ? got / total : got / widget.info.bytes);
      });
      if (mounted) setState(() => _ready = true);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_ready) return widget.builder(context);
    final s = Viewer3dStrings(widget.lang);
    if (_error != null) return _DownloadProblem(info: widget.info, error: _error!, strings: s, onRetry: _start);
    return _DownloadProgress(info: widget.info, progress: _progress, strings: s, lang: widget.lang);
  }
}
