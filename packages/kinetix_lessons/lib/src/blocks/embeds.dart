import 'package:flutter/material.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_animations/kinetix_animations.dart';
import 'package:kinetix_cs/kinetix_cs.dart';
import 'package:kinetix_labs/kinetix_labs.dart';

import '../core/theme.dart';
import '../core/ui_scale.dart';
import '../engine/model.dart';

/// The interactive pieces of a lesson, from the board's own Kinetix packages: 3D models
/// (kinetix_3d), animations (kinetix_animations), CS players (kinetix_cs), labs (kinetix_labs).
/// PhET sims are the board's bundled ones ([phet], given by the app). Behind an interface so
/// tests (no WebView, no GPU) swap in placeholders.
abstract class Embeds {
  Widget model3d(Block b, Lang lang);
  Widget simulation(Block b, Lang lang);
  Widget lab(String labId, String? preset, Lang lang);

  /// Whether this board can show the block's sim, lab or model (false: "not on this board").
  bool supports(Block b);
}

/// The Kinetix embeds; [phet] shows a PhET sim by id ("charges-and-fields") from the board's
/// own offline copy (null: none on this board).
class KinetixEmbeds implements Embeds {
  KinetixEmbeds({this.phet, this.hasPhet});
  final Widget Function(String simId)? phet;
  final bool Function(String simId)? hasPhet;

  @override
  Widget model3d(Block b, Lang lang) => DesignPixels(
    child: Model3dViewer(modelId: b.s('modelId')!, variant: b.s('variant'), sceneId: b.s('sceneId'), lang: lang.name, showTitle: false),
  );

  @override
  bool supports(Block b) => switch (b.type) {
    BlockType.virtualLab => LabCatalogue.byId(b.s('labId') ?? '') != null,
    BlockType.simulation => switch (b.s('source')) {
      'phet' => phet != null && (hasPhet?.call(b.s('simId') ?? '') ?? true),
      'animation' => animationById(b.s('simId') ?? '') != null,
      'kinetix_cs' => csSupported(b.s('simId') ?? ''),
      _ => LabCatalogue.byId(b.s('simId') ?? '') != null,
    },
    _ => true,
  };

  @override
  Widget simulation(Block b, Lang lang) => switch (b.s('source')) {
    'phet' => phet == null ? missing(b.s('simId')!) : phet!(b.s('simId')!),
    'animation' => switch (animationById(b.s('simId')!)) {
      final a? => DesignPixels(child: AnimationPlayer(animation: a, lang: lang == Lang.kn ? AnimLang.kn : AnimLang.en)),
      null => missing(b.s('simId')!),
    },
    'kinetix_cs' => DesignPixels(child: csSim(b.s('simId')!)),
    _ => lab(b.s('simId')!, b.s('preset'), lang),
  };

  static (String, String) _split(String id) => switch (id.split('.')) {
    [final k, final n] => (k, n),
    _ => ('', ''),
  };

  static bool csSupported(String id) {
    final (kind, name) = _split(id);
    return switch (kind) {
      'algo' => AlgoKind.values.any((v) => v.name == name),
      'sim' => SimKind.values.any((v) => v.name == name),
      'code' => CodeLanguage.values.any((v) => v.name == name),
      _ => false,
    };
  }

  /// Computer Science players from Kinetix: `algo.<kind>`, `sim.<kind>`, `code.<language>`.
  static Widget csSim(String id) {
    final (kind, name) = _split(id);
    void noInsert(Object _) {}
    switch (kind) {
      case 'algo':
        final a = AlgoKind.values.where((v) => v.name == name).firstOrNull;
        if (a != null) return AlgoPlayer(kind: a, onInsert: noInsert);
      case 'sim':
        final k = SimKind.values.where((v) => v.name == name).firstOrNull;
        if (k != null) return SimPanel(kind: k, onInsert: noInsert);
      case 'code':
        final l = CodeLanguage.values.where((v) => v.name == name).firstOrNull;
        if (l != null) return CodeLab(initialLanguage: l);
    }
    return missing(id);
  }

  @override
  Widget lab(String labId, String? preset, Lang lang) => LabCatalogue.byId(labId) == null
      ? missing(labId)
      : Builder(
          builder: (ctx) => Localizations.override(
            context: ctx,
            locale: Locale(lang.name),
            // No Material strings for Kannada: the lab's chips and dialogs keep English ones.
            delegates: const [_AnyLocale<MaterialLocalizations>(DefaultMaterialLocalizations.load), _AnyLocale<WidgetsLocalizations>(DefaultWidgetsLocalizations.load)],
            child: DesignPixels(child: LabView(id: labId, preset: preset)),
          ),
        );

  /// A lab or player this board does not have.
  static Widget missing(String id) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.extension_off_outlined, size: 72, color: Z.onStage3),
          const SizedBox(height: 20),
          Text('This part is not on this board yet. Teach it from the picture and the caption.', textAlign: TextAlign.center, style: zText(30, FontWeight.w500).copyWith(color: Z.onStage2)),
        ],
      ),
    ),
  );
}

/// Test double: a labelled box per embed.
class PlaceholderEmbeds implements Embeds {
  Widget _box(String s) => Container(key: ValueKey('embed:$s'), color: Colors.black12, alignment: Alignment.center, child: Text(s));
  @override
  Widget model3d(Block b, Lang lang) => _box('3d:${b.s('modelId')}');
  @override
  Widget simulation(Block b, Lang lang) => _box('sim:${b.s('source')}:${b.s('simId')}');
  @override
  Widget lab(String labId, String? preset, Lang lang) => _box('lab:$labId');
  @override
  bool supports(Block b) => true;
}

class _AnyLocale<T> extends LocalizationsDelegate<T> {
  const _AnyLocale(this._load);
  final Future<T> Function(Locale) _load;
  @override
  bool isSupported(Locale locale) => true;
  @override
  Future<T> load(Locale locale) => _load(locale);
  @override
  bool shouldReload(_AnyLocale<T> old) => false;
}
