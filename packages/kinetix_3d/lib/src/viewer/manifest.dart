import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

/// Where the three.js viewer and its models live in this package's assets.
const viewerAssets = 'assets/viewer3d';

/// The interface languages; anything else falls back to English.
const viewerLanguages = ['en', 'hi', 'kn'];

/// [lang] if the viewer speaks it, else English.
String viewerLang(String? lang) => viewerLanguages.contains(lang) ? lang! : 'en';

/// The viewer's language for [context]'s locale.
String viewerLangOf(BuildContext context) => viewerLang(Localizations.maybeLocaleOf(context)?.languageCode);

/// Text in the three interface languages, as written in a model's manifest
/// (tool/models/recipes). Falls back to English.
class LocalText {
  const LocalText(this.byLang);

  factory LocalText.from(Object? j) => LocalText(j is Map ? j.map((k, v) => MapEntry('$k', '$v')) : const {});

  final Map<String, String> byLang;

  String of(String lang) => byLang[lang] ?? byLang['en'] ?? '';
  String get en => of('en');

  /// Whether there is (non-empty) text in each of [viewerLanguages].
  bool get complete => viewerLanguages.every((l) => (byLang[l] ?? '').trim().isNotEmpty);
}

/// Reads one of the viewer's files from the bundle. Apps see a package's assets under
/// `packages/kinetix_3d/`; the package's own tests see them at the plain path.
Future<ByteData> loadViewerAsset(String path, [AssetBundle? bundle]) async {
  final b = bundle ?? rootBundle;
  try {
    return await b.load('packages/kinetix_3d/$viewerAssets/$path');
  } catch (_) {
    return b.load('$viewerAssets/$path');
  }
}

Future<String> _loadString(String path, [AssetBundle? bundle]) async {
  final data = await loadViewerAsset(path, bundle);
  return utf8.decode(data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes));
}

class ViewerPart {
  const ViewerPart({
    required this.id,
    required this.group,
    required this.color,
    required this.name,
    required this.info,
    this.hiddenAtStart = false,
    this.minor = false,
    this.variant,
  });

  factory ViewerPart.fromJson(Map<String, dynamic> j) => ViewerPart(
    id: j['id'] as String,
    group: j['group'] as String? ?? '',
    color: j['color'] as String? ?? '#888888',
    hiddenAtStart: j['hidden'] == true,
    minor: j['minor'] == true,
    variant: j['variant'] as String?,
    name: LocalText.from(j['name']),
    info: LocalText.from(j['info']),
  );

  final String id;
  final String group;
  final String color;
  final LocalText name;
  final LocalText info;

  /// Starts hidden (blood in the heart's chambers, a field's force arrows).
  final bool hiddenAtStart;

  /// Left out of "all labels" (small parts that would crowd the picture).
  final bool minor;

  /// For models with versions (each solid, each element): the version this part belongs
  /// to; null for parts every version shares.
  final String? variant;

  Color get swatch => Color(int.parse('FF${color.replaceAll('#', '')}', radix: 16));
}

/// One version of a model (the cone of "3D shapes", carbon of "atoms").
class ViewerVariant {
  const ViewerVariant(this.id, this.name);
  final String id;
  final LocalText name;
}

class ViewerGroup {
  const ViewerGroup(this.id, this.name);
  final String id;
  final LocalText name;
}

/// A ready-made direction to look from.
class ViewerViewpoint {
  const ViewerViewpoint(this.id, this.name, this.dir);
  final String id;
  final LocalText name;
  final List<double> dir;
}

/// A ready-made cut: the plane [normal], moved [offset] metres from the middle, and the
/// view it is best seen from. [normal2] makes a wedge (the Earth with a slice taken out).
class ViewerSlice {
  const ViewerSlice(this.id, this.name, this.normal, this.offset, this.view, [this.normal2]);
  final String id;
  final LocalText name;
  final List<double> normal;
  final double offset;
  final String? view;
  final List<double>? normal2;
}

class ViewerAnimation {
  const ViewerAnimation(this.id, this.kind, this.name, this.steps);
  final String id;

  /// beat | breathe | flow | tour | orbit
  final String kind;
  final LocalText name;
  final List<LocalText> steps;
}

/// Everything the app needs to show a model's controls (the viewer page reads the same
/// manifest for the geometry).
class ViewerManifest {
  const ViewerManifest({
    required this.id,
    required this.subject,
    required this.title,
    required this.summary,
    required this.credit,
    required this.size,
    required this.groups,
    required this.parts,
    required this.views,
    required this.slices,
    required this.animations,
    this.file,
    this.variants = const [],
    this.canTakeApart = true,
  });

  static List<double> _vec(Object? v) => [for (final x in (v as List? ?? const [0, 0, 1])) (x as num).toDouble()];

  factory ViewerManifest.fromJson(Map<String, dynamic> j) {
    final parts = (j['parts'] as List? ?? const []).cast<Map<String, dynamic>>();
    return ViewerManifest(
      id: j['id'] as String,
      subject: j['subject'] as String? ?? '',
      file: j['file'] as String?,
      title: LocalText.from(j['title']),
      summary: LocalText.from(j['summary']),
      credit: j['credit'] as String? ?? '',
      size: (j['size'] as num?)?.toDouble() ?? 0.1,
      groups: [for (final g in (j['groups'] as List? ?? const [])) ViewerGroup(g['id'] as String, LocalText.from(g['name']))],
      parts: [for (final p in parts) ViewerPart.fromJson(p)],
      views: [for (final v in (j['views'] as List? ?? const [])) ViewerViewpoint(v['id'] as String, LocalText.from(v['name']), _vec(v['dir']))],
      slices: [
        for (final s in (j['slices'] as List? ?? const []))
          ViewerSlice(s['id'] as String, LocalText.from(s['name']), _vec(s['normal']), (s['offset'] as num?)?.toDouble() ?? 0, s['view'] as String?,
              s['normal2'] == null ? null : _vec(s['normal2'])),
      ],
      variants: [for (final v in (j['variants'] as List? ?? const [])) ViewerVariant(v['id'] as String, LocalText.from(v['name']))],
      // Whether anything moves when the model is taken apart (a magnet's field does not
      // come apart, a heart does).
      canTakeApart: parts.any((p) => p['hinge'] != null || _vec(p['explode'] ?? const [0, 0, 0]).any((v) => v.abs() > 1e-6)),
      animations: [
        for (final a in (j['animations'] as List? ?? const []))
          ViewerAnimation(a['id'] as String, a['kind'] as String? ?? 'spin', LocalText.from(a['name']), [
            for (final s in (a['steps'] as List? ?? const [])) LocalText.from(s['text']),
          ]),
      ],
    );
  }

  final String id;
  final String subject;

  /// The GLB with the geometry, next to the manifest.
  final String? file;
  final LocalText title;
  final LocalText summary;

  /// Who made it (BodyParts3D for the anatomy, KINETIX for the rest).
  final String credit;

  /// The model's size in metres (its longest side), for the cut slider.
  final double size;
  final List<ViewerGroup> groups;
  final List<ViewerPart> parts;
  final List<ViewerViewpoint> views;
  final List<ViewerSlice> slices;
  final List<ViewerAnimation> animations;
  final List<ViewerVariant> variants;
  final bool canTakeApart;

  ViewerPart? part(String? id) => id == null ? null : parts.where((p) => p.id == id).firstOrNull;
  ViewerViewpoint? view(String? id) => id == null ? null : views.where((v) => v.id == id).firstOrNull;
  ViewerAnimation? animation(String? id) => id == null ? null : animations.where((a) => a.id == id).firstOrNull;

  /// Parts of [group] in [variant] (and parts all versions share), in manifest order.
  List<ViewerPart> inGroup(String group, [String? variant]) => [
    for (final p in parts)
      if (p.group == group && (p.variant == null || p.variant == variant)) p,
  ];

  /// Reads a model's manifest from the bundle (tests can replace this with [debugLoad]).
  static Future<ViewerManifest> load(String id, [AssetBundle? bundle]) async {
    if (debugLoad != null) return debugLoad!(id);
    return ViewerManifest.fromJson(jsonDecode(await _loadString('models/$id.json', bundle)) as Map<String, dynamic>);
  }

  static Future<ViewerManifest> Function(String id)? debugLoad;
}
