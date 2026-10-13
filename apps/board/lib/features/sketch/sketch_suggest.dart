import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import 'sketch_icons.dart';
import 'sketch_recognizer.dart';

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

/// What the "Did you mean" bar offers for a sketch.
class SketchSuggestion {
  const SketchSuggestion({required this.strokeIds, required this.bounds, this.icons = const [], this.needsModel = false});

  /// The strokes an icon would take the place of.
  final Set<String> strokeIds;

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
/// It listens alongside the AI pen: strokes drawn with the AI pen are its, and the plain pen's
/// strokes it tidies into shapes leave the page before the pause is over, so neither is offered.
class SketchSuggestController extends ChangeNotifier {
  SketchSuggestController(this.board, this.recognizer, {this.pause = const Duration(milliseconds: 700), SketchIconRenderer? render, int Function()? clock})
    : _render = render ?? ((icon, size, color) => renderSketchIcon(icon, size, color: color)),
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

  /// The strokes of the drawing going on now, and when each was written.
  final List<String> _group = [];
  final Map<String, StrokeTime> _times = {};
  int? _penDownAt;
  Timer? _timer;

  /// Bumped whenever the drawing changes, so a reading that comes back late is dropped.
  int _generation = 0;

  /// The download is offered once a session; after "x" the board stays quiet about it.
  bool _modelOffered = false;

  bool get _active => _enabled && recognizer.available;

  List<Stroke> _strokes(Iterable<String> ids) {
    final want = ids.toSet();
    return [for (final e in board.page.elements) if (e is Stroke && want.contains(e.id)) e];
  }

  void _strokeStarted(BoardTool tool, Offset at) {
    _prevStart?.call(tool, at);
    if (tool != BoardTool.pen || !_active) return;
    _timer?.cancel();
    _penDownAt = _clock();
    final strokes = _strokes(_group);
    if (strokes.isEmpty || !joinsSketch(inkBounds(strokes), at, board.inputScale)) {
      _group.clear();
      _times.clear();
    }
    _generation++;
    _show(null);
  }

  void _strokeEnded(BoardTool tool, Stroke s) {
    _prevEnd?.call(tool, s);
    if (tool != BoardTool.pen || !_active) return;
    final end = _clock();
    _times[s.id] = (start: math.min(_penDownAt ?? end, end), end: end);
    _penDownAt = null;
    _group.add(s.id);
    _timer?.cancel();
    _timer = Timer(pause, () => unawaited(suggestNow()));
  }

  /// Reads the drawing now (the pause after the last stroke calls it).
  @visibleForTesting
  Future<void> suggestNow() async {
    _timer?.cancel();
    if (!_active) return;
    final strokes = _strokes(_group);
    if (!looksLikeSketch(strokes, board.inputScale)) return;
    final gen = ++_generation;
    final ids = {for (final s in strokes) s.id};
    final box = inkBounds(strokes);
    final state = await recognizer.modelState();
    if (gen != _generation) return;
    if (state == HandwritingModelState.needsDownload) {
      if (_modelOffered) return;
      _modelOffered = true;
      _show(SketchSuggestion(strokeIds: ids, bounds: box, needsModel: true));
      return;
    }
    if (state != HandwritingModelState.ready) return;
    List<String> labels;
    try {
      labels = await recognizer.recognize(timedInk(strokes, _times, origin: box.topLeft), box.size);
    } catch (e) {
      debugPrint('Sketch recogniser: $e');
      return;
    }
    if (gen != _generation || _strokes(ids).length != ids.length) return;
    final icons = sketchIconsFor(labels);
    if (icons.isEmpty) return;
    _show(SketchSuggestion(strokeIds: ids, bounds: box, icons: icons));
  }

  /// Puts [icon] in the place of the suggested drawing, as one undo step. False when the drawing
  /// has gone meanwhile.
  Future<bool> pick(SketchIcon icon) async {
    final s = _suggestion;
    if (s == null) return false;
    final strokes = _strokes(s.strokeIds);
    if (strokes.length != s.strokeIds.length) {
      _reset();
      return false;
    }
    final box = contentBounds(strokes);
    final gen = _generation;
    final bytes = await _render(icon, box.size, strokes.first.style.color);
    if (gen != _generation || _strokes(s.strokeIds).length != s.strokeIds.length) return false;
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
    if (_strokes(s.strokeIds).length != s.strokeIds.length) _reset();
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
