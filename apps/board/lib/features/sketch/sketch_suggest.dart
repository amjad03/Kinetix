import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../../core/handwriting/cloud_handwriting.dart' show CloudInkReader, inkPng;
import 'ink_asset_index.dart';
import 'ink_assets_board.dart' show inkAssetElement;
import 'sketch_icons.dart';
import 'sketch_recognizer.dart';

/// Puts asset [a] on the board in the place of ink in [box] (drawn in [color]); null when it
/// cannot be made. [inkAssetElement] on the board, a stub in tests.
typedef InkAssetPlacer = Future<BoardElement?> Function(InkAsset a, Rect box, Color color);

/// Draws an icon as a picture of a size (board units); [renderSketchIcon] on the board, a stub in
/// tests.
typedef SketchIconRenderer = Future<Uint8List> Function(SketchIcon icon, Size size, Color color);

/// Whether a pen stroke starting at [at] carries on the sketch in [group] (board units, [scale]
/// screen pixels per unit): it starts on it or close by. Further away it is a new drawing.
bool joinsSketch(Rect group, Offset at, double scale) {
  final reach = math.max(48 / scale, group.longestSide * 0.35);
  return group.inflate(reach).contains(at);
}

/// Whether [strokes] look like a drawing worth an icon rather than writing, a line or a dot: big
/// enough on screen (at [scale]), all freehand, not too many, and not a wide, short run of
/// strokes as a word or a line of writing is.
bool looksLikeSketch(List<Stroke> strokes, double scale) {
  if (strokes.isEmpty || strokes.length > 60) return false;
  if (strokes.any((s) => s.shape != null || s.points.length < 2)) return false;
  final b = inkBounds(strokes);
  final w = b.width * scale, h = b.height * scale;
  if (math.max(w, h) < 72 || math.min(w, h) < 28) return false;
  // Writing runs along a line: three or more strokes far wider than they are tall.
  if (strokes.length >= 3 && w > h * 2.6) return false;
  return true;
}

/// Something other than an icon the "Did you mean" bar offers.
sealed class InkChoice {
  const InkChoice();

  /// What it is, for the tooltip and screen readers.
  String get label;
}

/// Another reading of what the AI pen converted ([index] into its candidates).
class ReadingChoice extends InkChoice {
  const ReadingChoice(this.index, this.label, {this.math = false});
  final int index;
  @override
  final String label;

  /// LaTeX, drawn as maths.
  final bool math;
}

/// A clean shape the ink fits.
class ShapeChoice extends InkChoice {
  const ShapeChoice(this.kind);
  final FitKind kind;
  @override
  String get label => kind.name;
}

/// Writing read by the board's AI (no handwriting model here): words, or maths in LaTeX.
class TextChoice extends InkChoice {
  const TextChoice({this.text, this.latex}) : assert(text != null || latex != null);
  final String? text;
  final String? latex;
  @override
  String get label => latex ?? text!;
}

/// A picture, diagram, animation or 3D model from the board's shelves.
class AssetChoice extends InkChoice {
  const AssetChoice(this.asset);
  final InkAsset asset;
  @override
  String get label => asset.title;
}

/// What the "Did you mean" bar offers for a sketch.
class SketchSuggestion {
  const SketchSuggestion({required this.strokeIds, required this.bounds, this.icons = const [], this.needsModel = false, this.choices = const [], this.target});

  /// What a pick would take the place of: the strokes, or the element the AI pen made of them.
  final Set<String> strokeIds;

  /// The element the AI pen converted the ink into, when it did (its readings and shapes are
  /// offered); null for ink left as ink.
  final String? target;

  /// Readings, shapes and assets, offered before the icons.
  final List<InkChoice> choices;

  /// Their box on the board.
  final Rect bounds;

  /// The icons, most likely first.
  final List<SketchIcon> icons;

  /// The sketch model is not on this device yet: the bar offers to download it instead.
  final bool needsModel;
}

/// Watches the pen and, when the teacher pauses after a drawing ([pause], about 0.7 s), asks the
/// [recognizer] what it is and offers clean icons for it ([suggestion]). Picking one puts it in
/// the drawing's place as a picture (one undo step, moved and resized like any picture).
///
/// It listens alongside the AI pen. Given the [aiPen], it is also the AI pen's suggestion row:
/// after a group of AI pen strokes (once the pen has converted them) it offers the other
/// readings and shapes of what the pen made, and for ink the pen left as ink what the
/// recogniser (or, with no recogniser here, the board's AI through [cloud]) says it is. Both
/// tools also get matching pictures, diagrams, animations and 3D models from [assets]. Without
/// the AI pen, its strokes are its own and not offered.
class SketchSuggestController extends ChangeNotifier {
  SketchSuggestController(
    this.board,
    this.recognizer, {
    this.pause = const Duration(milliseconds: 700),
    SketchIconRenderer? render,
    int Function()? clock,
    this.aiPen,
    this.cloud,
    this.assets,
    InkAssetPlacer? place,
    this.onOpen,
    Future<Uint8List> Function(List<Stroke> ink)? png,
  }) : _render = render ?? ((icon, size, color) => renderSketchIcon(icon, size, color: color)),
       _place = place ?? inkAssetElement,
       _png = png ?? inkPng,
       _clock = clock ?? _stopwatch() {
    _prevStart = board.onStrokeStart;
    _prevEnd = board.onStrokeEnd;
    board.onStrokeStart = _strokeStarted;
    board.onStrokeEnd = _strokeEnded;
    board.addListener(_boardChanged);
  }

  final WhiteboardController board;
  final SketchRecognizer recognizer;
  final Duration pause;
  final SketchIconRenderer _render;
  final InkAssetPlacer _place;
  final Future<Uint8List> Function(List<Stroke> ink) _png;

  /// The AI pen whose strokes it suggests for (none: AI pen strokes are not its).
  final AiPenController? aiPen;

  /// The board's AI, for boards with no sketch model (or before it is downloaded).
  CloudInkReader? cloud;

  /// The shelves to match readings against.
  final Future<InkAssetIndex> Function()? assets;

  /// A model or an animation was put on the board: open it beside the board.
  final ValueChanged<InkAsset>? onOpen;
  final int Function() _clock;

  static int Function() _stopwatch() {
    final w = Stopwatch()..start();
    return () => w.elapsedMilliseconds;
  }

  void Function(BoardTool, Offset)? _prevStart;
  void Function(BoardTool, Stroke)? _prevEnd;

  /// Off in Board settings: no suggestions.
  bool get enabled => _enabled;
  bool _enabled = true;
  set enabled(bool on) {
    if (on == _enabled) return;
    _enabled = on;
    if (!on) _reset();
  }

  /// Shown on the board while not null.
  SketchSuggestion? get suggestion => _suggestion;
  SketchSuggestion? _suggestion;

  /// The strokes of the drawing going on now, the tool they were drawn with, and when each was
  /// written.
  final List<String> _group = [];
  BoardTool? _groupTool;
  final Map<String, StrokeTime> _times = {};
  int? _penDownAt;
  Timer? _timer;

  /// Bumped whenever the drawing changes, so a reading that comes back late is dropped.
  int _generation = 0;

  /// The download is offered once a session; after "x" the board stays quiet about it.
  bool _modelOffered = false;

  bool _ours(BoardTool tool) => _enabled && (tool == BoardTool.pen || (tool == BoardTool.aiPen && aiPen != null));

  /// Whether the board can say what a drawing is: its own model, or the board's AI.
  bool get _canRead => recognizer.available || cloud != null;

  List<Stroke> _strokes(Iterable<String> ids) {
    final want = ids.toSet();
    return [for (final e in board.page.elements) if (e is Stroke && want.contains(e.id)) e];
  }

  List<BoardElement> _elements(Iterable<String> ids) {
    final want = ids.toSet();
    return [for (final e in board.page.elements) if (want.contains(e.id)) e];
  }

  void _strokeStarted(BoardTool tool, Offset at) {
    _prevStart?.call(tool, at);
    if (!_ours(tool)) return;
    _timer?.cancel();
    _penDownAt = _clock();
    final strokes = _strokes(_group);
    if (tool != _groupTool || strokes.isEmpty || !joinsSketch(inkBounds(strokes), at, board.inputScale)) {
      _group.clear();
      _times.clear();
    }
    _groupTool = tool;
    _generation++;
    _show(null);
  }

  void _strokeEnded(BoardTool tool, Stroke s) {
    _prevEnd?.call(tool, s);
    if (!_ours(tool)) return;
    final end = _clock();
    _times[s.id] = (start: math.min(_penDownAt ?? end, end), end: end);
    _penDownAt = null;
    _groupTool = tool;
    _group.add(s.id);
    _timer?.cancel();
    // The AI pen converts after its own pause: the row waits for what it made.
    final wait = tool == BoardTool.aiPen ? aiPen!.pause + const Duration(milliseconds: 300) : pause;
    _timer = Timer(wait, () => unawaited(suggestNow()));
  }

  /// Reads the drawing now (the pause after the last stroke calls it).
  @visibleForTesting
  Future<void> suggestNow() async {
    _timer?.cancel();
    if (!_enabled) return;
    final pen = _groupTool == BoardTool.aiPen ? aiPen : null;
    if (pen != null && pen.converting) {
      // Still reading: look again when it is done.
      _timer = Timer(const Duration(milliseconds: 250), () => unawaited(suggestNow()));
      return;
    }
    final gen = ++_generation;
    if (pen != null) {
      // What the AI pen made of these strokes, the latest first.
      final group = _group.toSet();
      final made = pen.conversions.entries.where((e) => board.byId(e.key) != null && e.value.ink.any((s) => group.contains(s.id))).lastOrNull;
      if (made != null) return _suggestConverted(pen, made.key, made.value, gen);
    }
    final strokes = _strokes(_group);
    if (strokes.isEmpty) return;
    // The AI pen's ink left as ink is offered at any size the eye can see; the pen's only when it
    // looks like a drawing, not writing.
    if (pen == null ? !looksLikeSketch(strokes, board.inputScale) : inkBounds(strokes).longestSide * board.inputScale < 28) return;
    if (pen == null && !_canRead) return;
    final ids = {for (final s in strokes) s.id};
    final box = inkBounds(strokes);
    var labels = const <String>[];
    final choices = <InkChoice>[];
    final state = recognizer.available ? await recognizer.modelState() : HandwritingModelState.unsupported;
    if (gen != _generation) return;
    if (state == HandwritingModelState.needsDownload && !_modelOffered) {
      _modelOffered = true;
      _show(SketchSuggestion(strokeIds: ids, bounds: box, needsModel: true));
      return;
    }
    try {
      if (state == HandwritingModelState.ready) {
        labels = await recognizer.recognize(timedInk(strokes, _times, origin: box.topLeft), box.size);
      } else if (cloud case final read?) {
        final r = await read(await _png(strokes), pen == null ? 'sketch' : 'auto');
        labels = r?.labels ?? const [];
        if (pen != null && r != null && (r.text != null || r.latex != null)) choices.add(TextChoice(text: r.text, latex: r.latex));
      }
    } catch (e) {
      debugPrint('Sketch recogniser: $e');
    }
    if (gen != _generation || _strokes(ids).length != ids.length) return;
    if (pen != null) choices.addAll([for (final k in shapeFitsOf(strokes).take(3)) ShapeChoice(k)]);
    choices.addAll(await _assetChoices(labels));
    if (gen != _generation || _strokes(ids).length != ids.length) return;
    final icons = sketchIconsFor(labels);
    if (icons.isEmpty && choices.isEmpty) return;
    _show(SketchSuggestion(strokeIds: ids, bounds: box, icons: icons, choices: choices));
  }

  /// The row for something the AI pen converted: its other readings, the shapes its ink fits,
  /// and what the words (or the shape) name on the shelves.
  Future<void> _suggestConverted(AiPenController pen, String id, PenConversion conv, int gen) async {
    final el = board.byId(id)!;
    final choices = <InkChoice>[
      for (final (i, c) in conv.candidates.indexed.take(5))
        if (i != conv.chosen) ReadingChoice(i, c, math: conv.kind == ConversionKind.maths),
      for (final k in pen.shapeAlternatives(id).take(3)) ShapeChoice(k),
    ];
    final labels = switch (conv.kind) {
      ConversionKind.text => [?conv.text],
      ConversionKind.shape => [?conv.fit?.name],
      ConversionKind.maths => const <String>[],
    };
    choices.addAll(await _assetChoices(labels));
    if (gen != _generation || board.byId(id) == null) return;
    final icons = sketchIconsFor(labels, max: 4);
    if (choices.isEmpty && icons.isEmpty) return;
    _show(SketchSuggestion(strokeIds: {id}, target: id, bounds: el.bounds, icons: icons, choices: choices));
  }

  Future<List<InkChoice>> _assetChoices(List<String> labels) async {
    final load = assets;
    if (load == null || labels.isEmpty) return const [];
    try {
      final index = await load();
      return [for (final m in index.rank(labels)) AssetChoice(m.asset)];
    } catch (e) {
      debugPrint('Ink assets: $e');
      return const [];
    }
  }

  /// Takes [c] in the suggestion's place (one undo step). False when the drawing has gone or it
  /// could not be made.
  Future<bool> choose(InkChoice c) async {
    final s = _suggestion;
    final pen = aiPen;
    if (s == null) return false;
    final targets = _elements(s.strokeIds);
    if (targets.length != s.strokeIds.length) {
      _reset();
      return false;
    }
    final strokes = targets.whereType<Stroke>().toList();
    switch (c) {
      case ReadingChoice(:final index):
        if (pen == null || s.target == null) return false;
        _reset();
        pen.choose(s.target!, index);
        return true;
      case ShapeChoice(:final kind):
        if (pen == null) return false;
        _reset();
        return s.target != null ? pen.reshape(s.target!, kind) : pen.inkToShape(strokes, kind);
      case TextChoice(:final text, :final latex):
        if (pen == null) return false;
        _reset();
        return pen.placeReading(strokes, text: text, latex: latex);
      case AssetChoice(:final asset):
        final gen = _generation;
        final box = contentBounds(targets);
        final el = await _place(asset, box, _colorOf(targets.first));
        if (el == null || gen != _generation || _elements(s.strokeIds).length != s.strokeIds.length) return false;
        _reset();
        board.setElements([
          for (final e in board.page.elements)
            if (!s.strokeIds.contains(e.id)) e,
          el,
        ]);
        if (asset.kind == InkAssetKind.model3d || asset.kind == InkAssetKind.animation) onOpen?.call(asset);
        return true;
    }
  }

  static Color _colorOf(BoardElement e) => switch (e) {
    Stroke(:final style) => style.color,
    TextElement(:final color) || MathElement(:final color) => color,
    _ => const Color(0xFF1F2937),
  };

  /// Puts [icon] in the place of the suggested drawing, as one undo step. False when the drawing
  /// has gone meanwhile.
  Future<bool> pick(SketchIcon icon) async {
    final s = _suggestion;
    if (s == null) return false;
    final strokes = _elements(s.strokeIds);
    if (strokes.length != s.strokeIds.length) {
      _reset();
      return false;
    }
    final box = contentBounds(strokes);
    final gen = _generation;
    final bytes = await _render(icon, box.size, _colorOf(strokes.first));
    if (gen != _generation || _elements(s.strokeIds).length != s.strokeIds.length) return false;
    _reset();
    board.setElements([
      for (final e in board.page.elements)
        if (!s.strokeIds.contains(e.id)) e,
      ImageElement(id: newElementId(), rect: box, bytes: bytes),
    ]);
    return true;
  }

  /// The sketch model was downloaded: read the drawing that asked for it.
  Future<void> modelReady() async {
    final s = _suggestion;
    _show(null);
    if (s != null && s.needsModel) await suggestNow();
  }

  /// The bar's "x": the drawing stays as it is.
  void dismiss() => _reset();

  void _reset() {
    _timer?.cancel();
    _group.clear();
    _times.clear();
    _generation++;
    _show(null);
  }

  void _show(SketchSuggestion? s) {
    if (s == null && _suggestion == null) return;
    _suggestion = s;
    notifyListeners();
  }

  /// Undo, the eraser or another page took the drawing away: so goes the bar.
  void _boardChanged() {
    final s = _suggestion;
    if (s == null) return;
    if (_elements(s.strokeIds).length != s.strokeIds.length) _reset();
  }

  @override
  void dispose() {
    _timer?.cancel();
    board.removeListener(_boardChanged);
    if (board.onStrokeStart == _strokeStarted) board.onStrokeStart = _prevStart;
    if (board.onStrokeEnd == _strokeEnded) board.onStrokeEnd = _prevEnd;
    super.dispose();
  }
}
