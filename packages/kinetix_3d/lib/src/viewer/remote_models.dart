import 'dart:async';
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
  });

  final String id;
  final LocalText title;
  final String subject;

  /// The class-context model topic (`solar`, `earth`, `human`...), see ToolProfile.models.
  final String topic;
  final List<int> classes;
  final String url;

  /// Download size, shown before fetching.
  final int bytes;
  final String license;
  final String credit;
  final List<ModelHotspot> hotspots;
  final List<String> keywords;
}

/// The downloadable library. Every entry is recorded in docs/licensing/3D_MODELS.md.
class RemoteModels {
  RemoteModels._();

  static const _nasa = 'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models';
  static const _nasaCredit = 'NASA 3D Resources, public domain (NASA media usage guidelines)';

  static const all = <RemoteModelInfo>[
    RemoteModelInfo(
      id: 'saturn_v',
      title: LocalText({'en': 'Saturn V rocket', 'hi': 'सैटर्न V रॉकेट', 'kn': 'ಸ್ಯಾಟರ್ನ್ V ರಾಕೆಟ್'}),
      subject: 'Physics',
      topic: 'solar',
      classes: [8, 9, 11],
      url: '$_nasa/Saturn%20V/Saturn%20V.glb',
      bytes: 927212,
      license: 'Public domain',
      credit: _nasaCredit,
      keywords: ['rocket', 'launch', 'newton third law', 'space', 'stages'],
      hotspots: [
        ModelHotspot(LocalText({'en': 'Command module', 'hi': 'कमांड मॉड्यूल', 'kn': 'ಕಮಾಂಡ್ ಮಾಡ್ಯೂಲ್'}), 0, 0.95, 0),
        ModelHotspot(LocalText({'en': 'Engines', 'hi': 'इंजन', 'kn': 'ಎಂಜಿನ್‌ಗಳು'}), 0, -0.95, 0),
      ],
    ),
    RemoteModelInfo(
      id: 'apollo_lunar_module',
      title: LocalText({'en': 'Apollo Lunar Module', 'hi': 'अपोलो चंद्र मॉड्यूल', 'kn': 'ಅಪೊಲೊ ಚಂದ್ರ ಮಾಡ್ಯೂಲ್'}),
      subject: 'Geography',
      topic: 'solar',
      classes: [6, 7, 8],
      url: '$_nasa/Apollo%20Lunar%20Module/Apollo%20Lunar%20Module.glb',
      bytes: 716840,
      license: 'Public domain',
      credit: _nasaCredit,
      keywords: ['moon', 'lander', 'apollo', 'space exploration'],
    ),
    RemoteModelInfo(
      id: 'hubble_telescope',
      title: LocalText({'en': 'Hubble Space Telescope', 'hi': 'हबल अंतरिक्ष दूरबीन', 'kn': 'ಹಬಲ್ ಬಾಹ್ಯಾಕಾಶ ದೂರದರ್ಶಕ'}),
      subject: 'Physics',
      topic: 'solar',
      classes: [8, 10, 12],
      url: '$_nasa/Hubble%20Space%20Telescope%20(A)/Hubble%20Space%20Telescope%20(A).glb',
      bytes: 1694988,
      license: 'Public domain',
      credit: _nasaCredit,
      keywords: ['telescope', 'optics', 'mirror', 'space', 'astronomy'],
    ),
  ];

  static RemoteModelInfo? byId(String id) {
    for (final m in all) {
      if (m.id == id) return m;
    }
    return null;
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

/// Downloaded models on disk. A file is written whole under a temporary name and renamed, so
/// a download cut off by a lost connection never leaves a broken model behind.
class ModelCache {
  ModelCache(this.dir, {ModelFetcher? fetcher}) : _fetch = fetcher ?? httpModelFetcher;
  final Directory dir;
  final ModelFetcher _fetch;

  File fileFor(RemoteModelInfo m) => File('${dir.path}/${m.id}.glb');
  bool isCached(RemoteModelInfo m) => fileFor(m).existsSync();

  /// The model's bytes: from the cache, else downloaded (and kept). Throws [OfflineException] offline.
  Future<Uint8List> load(RemoteModelInfo m, {void Function(int received, int total)? onProgress}) async {
    final f = fileFor(m);
    if (f.existsSync()) return f.readAsBytes();
    final bytes = await _fetch(m.url, onProgress ?? (_, _) {});
    GlbLoader.parse(bytes); // reject anything that is not a readable GLB before keeping it
    dir.createSync(recursive: true);
    final tmp = File('${f.path}.part');
    await tmp.writeAsBytes(bytes, flush: true);
    await tmp.rename(f.path);
    return bytes;
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
    if (_error != null) {
      final offline = _error is OfflineException;
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(
            offline ? 'This model needs a one-time download (${(widget.info.bytes / 1e6).toStringAsFixed(1)} MB). Connect to the internet and try again.' : 'The model could not be loaded.',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 12),
          FilledButton(onPressed: _start, child: const Text('Try again')),
        ]),
      );
    }
    final base = _model;
    if (base == null) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('Downloading ${widget.info.title.of(widget.lang)}'),
          const SizedBox(height: 12),
          SizedBox(width: 280, child: LinearProgressIndicator(value: _progress == 0 ? null : _progress)),
        ]),
      );
    }
    var shown = explodedModel(base, _explode);
    if (_hotspots) shown = withHotspots(shown, widget.info, widget.lang);
    return Column(children: [
      Expanded(child: ModelViewer(model: shown)),
      Row(children: [
        const SizedBox(width: 12),
        const Text('Assemble'),
        Expanded(child: Slider(value: _explode, onChanged: (v) => setState(() => _explode = v))),
        const Text('Explode'),
        const SizedBox(width: 12),
        FilterChip(label: const Text('Labels'), selected: _hotspots, onSelected: (v) => setState(() => _hotspots = v)),
        const SizedBox(width: 12),
      ]),
    ]);
  }
}
