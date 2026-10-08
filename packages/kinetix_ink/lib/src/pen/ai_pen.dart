import 'dart:async';
import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:kinetix_math/kinetix_math.dart' show MathTex;

import '../element_painting.dart' show measureBoardText;
import '../ink_models.dart';
import '../whiteboard_controller.dart';
import 'assisted_symbols.dart';
import 'gestures.dart';
import 'handwriting.dart';
import 'ink_model.dart';
import 'ink_parser.dart';
import 'math_ink.dart';
import 'shape_fit.dart';
import 'symbol_recognizer.dart';

/// The AI pen: write or draw as with the pen; a moment later rough shapes become clean shapes,
/// handwritten maths becomes a typeset equation and words become text.
///
/// Everything it makes is an ordinary board element, put on the page with the controller's
/// own operations (one undo step each), so it can be selected, moved and undone, and the live
/// view and lesson recordings show it like anything else. The ink it replaced is kept (see
/// [conversions]): a tap on a converted element with the AI pen shows other readings and puts
/// the ink back.
///
/// Shapes and maths are read on the board itself with no model (ink_parser.dart,
/// math_ink.dart). Words need the platform's handwriting recogniser ([HandwritingRecognizer]);
/// without one they stay as ink. When that recogniser can read timed ink with named models
/// ([InkModelReader]: ML Kit Digital Ink on Android), the AI pen also uses it for what the
/// pure-Dart readers miss: writing is read with when each stroke was written, drawn shapes are
/// checked (and sketches that are no clean shape recognised) with the shapes model, and each
/// symbol of laid-out maths is read with the text model while the board keeps the layout. The
/// pure-Dart readers stay as the fallback whenever a model is not downloaded.

/// When the AI pen converts.
enum AiPenMode {
  /// About a second after the teacher stops writing.
  auto,

  /// Word by word: a word converts when the next one starts.
  live,

  /// Only when the teacher taps Convert.
  tap,
}

/// What a conversion made.
enum ConversionKind { text, maths, shape }

/// Something the board should tell the teacher.
enum AiPenNotice {
  /// Words stay as ink: this board has no handwriting reader (maths and shapes still convert).
  wordsStayInk,

  /// Words stay as ink: the handwriting model for the language is not on the board yet.
  modelNeeded,

  /// Words stay as ink: this board cannot read handwriting in the language.
  languageUnsupported,

  /// The selection had no ink the AI pen could read.
  nothingToConvert,
}

/// A converted element and the ink it came from.
class PenConversion {
  PenConversion({
    required this.kind,
    required this.ink,
    required this.inkBox,
    required this.origin,
    this.candidates = const [],
    this.plains = const [],
    this.chosen = 0,
  });

  final ConversionKind kind;

  /// The strokes as written.
  final List<Stroke> ink;

  /// Where the ink was.
  final Rect inkBox;

  /// The top left of the element's frame when it was made: the ink goes back where the element
  /// is now, if it was moved.
  final Offset origin;

  /// Readings, most likely first: words for text, LaTeX for maths.
  final List<String> candidates;

  /// For maths: each reading in the solver's syntax.
  final List<String> plains;
  int chosen;

  String? get text => candidates.isEmpty ? null : candidates[chosen];
  String? get plain => plains.length > chosen ? plains[chosen] : null;
}

class AiPenController extends ChangeNotifier {
  AiPenController(this.board, {HandwritingRecognizer handwriting = const NoHandwritingRecognizer(), SymbolRecognizer? symbols, int Function()? clock})
    : _handwriting = handwriting,
      _symbols = symbols,
      _clock = clock ?? _stopwatch() {
    board.onStrokeStart = _strokeStarted;
    board.onStrokeEnd = _strokeEnded;
  }

  final WhiteboardController board;
  final SymbolRecognizer? _symbols;
  final int Function() _clock;

  static int Function() _stopwatch() {
    final w = Stopwatch()..start();
    return () => w.elapsedMilliseconds;
  }

  /// When each AI pen stroke was written (pen down, pen up), by stroke id: a pause splits a line
  /// of writing, and the model reads the ink as it was written.
  final Map<String, StrokeTime> strokeTimes = {};
  int? _penDownAt;

  /// The recogniser's timed, model-based reading, when it has one (ML Kit on Android).
  InkModelReader? get _reader => _handwriting is InkModelReader ? _handwriting as InkModelReader : null;
  final Set<String> _readyModels = {};

  /// Whether [model] is on the board (asked until it is, so a stroke then costs no platform call).
  Future<bool> _ready(String model) async {
    final r = _reader;
    if (r == null) return false;
    if (_readyModels.contains(model)) return true;
    try {
      if (await r.modelStateOf(model) != HandwritingModelState.ready) return false;
    } catch (_) {
      return false;
    }
    _readyModels.add(model);
    return true;
  }

  /// Forgets which models were ready (after a download, or when one was deleted).
  void modelsChanged() => _readyModels.clear();

  HandwritingRecognizer _handwriting;
  HandwritingRecognizer get handwriting => _handwriting;
  set handwriting(HandwritingRecognizer h) {
    _handwriting = h;
    _readyModels.clear();
    notifyListeners();
  }

  AiPenMode _mode = AiPenMode.auto;
  AiPenMode get mode => _mode;
  set mode(AiPenMode m) {
    _mode = m;
    _timer?.cancel();
    if (m != AiPenMode.tap && _pending.isNotEmpty) _schedule();
    notifyListeners();
  }

  /// The language words are read in (en, hi, kn).
  String language = 'en';

  /// Text AI's font for converted words (Kalam, the teacher's own); null: the board's font.
  BoardFont? textFont;

  /// How long after the last stroke [AiPenMode.auto] converts.
  Duration pause = const Duration(milliseconds: 900);

  /// The ordinary pen tidies rough shapes too (never reads words). Off unless the teacher
  /// turns it on; the one AI pen feature primary classes may use.
  bool snapShapes = false;

  /// What the AI pen converts (the pen popover): rough shapes, maths, and words.
  bool convertShapes = true;
  bool convertMaths = true;
  bool convertText = true;

  /// A back-and-forth scribble over something with the AI pen (or the pen, when it tidies
  /// shapes) rubs it out.
  bool scribbleErase = true;

  /// Typical height of this teacher's handwriting in screen pixels, learnt from what they
  /// write: a circle drawn at letter size in a line of writing is read as "o", a bigger one
  /// stays a circle.
  double letterPx = 46;

  /// Told when [letterPx] is learnt, so the board can keep it for this teacher.
  ValueChanged<double>? onLetterSize;

  /// Told when the teacher should know something.
  ValueChanged<AiPenNotice>? onNotice;

  /// Converted elements on any page, by element id.
  final Map<String, PenConversion> conversions = {};

  /// The converted element whose readings are being shown, if any.
  final ValueNotifier<String?> inspecting = ValueNotifier(null);

  final List<Stroke> _pending = [];
  final List<Stroke> _pendingShapes = [];
  Timer? _timer;
  bool _converting = false;
  final Set<AiPenNotice> _told = {};

  /// AI pen ink not converted yet (still on the page).
  List<Stroke> get pending {
    final ids = {for (final e in board.page.elements) e.id};
    return [
      for (final s in _pending)
        if (ids.contains(s.id)) s,
    ];
  }

  bool get converting => _converting;

  // --- Pen events ---------------------------------------------------------------------------

  void _strokeStarted(BoardTool tool, Offset at) {
    if (tool != BoardTool.aiPen) return;
    _penDownAt = _clock();
    _timer?.cancel();
    final p = pending;
    if (_mode != AiPenMode.live || p.isEmpty) return;
    // Starting clearly to the right of (or below) the word means the word is finished.
    final b = inkBounds(p);
    final h = math.max(24.0, b.height);
    if (at.dx > b.right + h * 0.45 || at.dy > b.bottom + h * 0.6 || at.dx < b.left - h) unawaited(convertPending());
  }

  void _strokeEnded(BoardTool tool, Stroke s) {
    final ai = tool == BoardTool.aiPen;
    if (!ai && !(tool == BoardTool.pen && snapShapes)) return;
    if (ai) {
      final end = _clock();
      strokeTimes[s.id] = (start: math.min(_penDownAt ?? end, end), end: end);
      _penDownAt = null;
    }
    final pts = offsetsOf(s);
    // A tap with the AI pen on something it converted: other readings.
    if (ai && inkBounds([s]).longestSide * board.inputScale < 8) {
      final hit = board.page.elements.reversed
          .where((e) => e.id != s.id && conversions.containsKey(e.id) && e.hitTest(s.points.first.offset, 8 / board.inputScale))
          .firstOrNull;
      if (hit != null) {
        board.amendLastStep(board.page.elements.where((e) => e.id != s.id).toList());
        inspecting.value = hit.id;
        return;
      }
    }
    if (scribbleErase && isScribble(pts)) {
      final hit = scribbledOver(pts, board.page.elements, s.id);
      if (hit.isNotEmpty) {
        // The scribble and what it crossed out go together: one undo brings both back.
        board.amendLastStep(board.page.elements.where((e) => e.id != s.id && !hit.contains(e.id)).toList());
        _pending.removeWhere((p) => hit.contains(p.id));
        return;
      }
    }
    (ai ? _pending : _pendingShapes).add(s);
    notifyListeners();
    if (!ai || _mode != AiPenMode.tap) _schedule();
  }

  void _schedule() {
    _timer?.cancel();
    _timer = Timer(_mode == AiPenMode.live ? pause * 1.6 : pause, () => unawaited(convertPending()));
  }

  // --- Converting ---------------------------------------------------------------------------

  /// Converts the AI pen's ink written since the last conversion (and, when the pen tidies
  /// shapes, the pen's shapes).
  Future<void> convertPending() async {
    _timer?.cancel();
    if (_converting) return;
    final ids = {for (final e in board.page.elements) e.id};
    final batch = [
      for (final s in _pending)
        if (ids.contains(s.id)) s,
    ];
    final shapesOnly = [
      for (final s in _pendingShapes)
        if (ids.contains(s.id)) s,
    ];
    _pending.clear();
    _pendingShapes.clear();
    if (shapesOnly.isNotEmpty && convertShapes) _placeShapes(parseInk(shapesOnly, contextFor(shapesOnly)).shapes);
    if (batch.isEmpty) {
      notifyListeners();
      return;
    }
    _converting = true;
    notifyListeners();
    try {
      final reading = parseInk(batch, contextFor(batch));
      // Drawn shapes become clean shapes; sketches that are no clean shape stay as ink, unless
      // the shapes model knows them.
      if (convertShapes) _placeShapes(await _modelShapes(reading));
      for (final cluster in clusterWriting(reading.writing, times: strokeTimes)) {
        await _convertCluster(cluster);
        _learnLetterSize(cluster);
      }
    } finally {
      _converting = false;
      notifyListeners();
    }
  }

  /// Converts [strokes] already on the page (the selection): shapes and writing. Returns how
  /// many things it made.
  Future<int> convertStrokes(List<Stroke> strokes) async {
    final ink = strokes.where(isPenInk).toList();
    if (ink.isEmpty) {
      onNotice?.call(AiPenNotice.nothingToConvert);
      return 0;
    }
    _converting = true;
    notifyListeners();
    var n = 0;
    try {
      final reading = parseInk(ink, contextFor(ink));
      if (convertShapes) {
        final shapes = await _modelShapes(reading);
        _placeShapes(shapes);
        n += shapes.length;
      }
      for (final cluster in clusterWriting(reading.writing, times: strokeTimes)) {
        if (await _convertCluster(cluster)) n++;
      }
    } finally {
      _converting = false;
      notifyListeners();
    }
    if (n == 0) onNotice?.call(AiPenNotice.nothingToConvert);
    return n;
  }

  /// The zoom, the learnt letter size and the typed text near [strokes].
  InkContext contextFor(List<Stroke> strokes) {
    final area = inkBounds(strokes).inflate(400);
    return InkContext(
      scale: board.view.value.scale,
      letterPx: letterPx,
      textNear: [
        for (final e in board.page.elements)
          if ((e is TextElement || e is MathElement) && e.bounds.overlaps(area)) e.bounds,
      ],
    );
  }

  void _learnLetterSize(List<Stroke> cluster) {
    final h = letterHeightPx(cluster, board.view.value.scale);
    if (h < 12 || h > 200) return;
    letterPx = (letterPx * 0.8 + h * 0.2).clamp(20.0, 140.0);
    onLetterSize?.call(letterPx);
  }

  /// The shapes in [reading], checked with the shapes model when it is on the board: a drawing
  /// the model names differently is fitted as what it names, and a sketch too rough for the
  /// board's own fitter becomes the shape the model sees in it. Without the model, the board's
  /// own reading.
  Future<List<InkShape>> _modelShapes(InkReading reading) async {
    final reader = _reader;
    if (reader == null || (reading.shapes.isEmpty && reading.drawings.isEmpty) || !await _ready(InkModels.shapes)) return reading.shapes;
    Future<({FitKind kind, int sides, bool arrow})?> label(List<Stroke> strokes) async {
      try {
        final box = inkBounds(strokes);
        final r = await reader.readInk(timedInk(strokes, strokeTimes, origin: box.topLeft), InkModels.shapes, writingArea: box.size);
        return r.isEmpty ? null : shapeFromLabel(r.first);
      } catch (_) {
        return null;
      }
    }

    final out = <InkShape>[];
    for (final s in reading.shapes) {
      final l = await label(s.strokes);
      out.add(l == null ? s : (_fitLabelled(s.strokes, l, current: s) ?? s));
    }
    for (final g in touchingGroups(reading.drawings, board.view.value.scale)) {
      final l = await label(g);
      final shape = l == null ? null : _fitLabelled(g, l);
      if (shape != null) out.add(shape);
    }
    return out;
  }

  /// [strokes] as the shape a model named; null when the ink cannot make it. [current] is the
  /// board's own reading, kept when the model agrees with it.
  InkShape? _fitLabelled(List<Stroke> strokes, ({FitKind kind, int sides, bool arrow}) label, {InkShape? current}) {
    if (label.arrow) {
      if (current?.arrow != null) return current;
      // The longest stroke is the shaft, drawn from tail to tip.
      final shaft = strokes.reduce((a, b) => inkBounds([a]).longestSide >= inkBounds([b]).longestSide ? a : b);
      final pts = offsetsOf(shaft);
      if (pts.length < 2 || (pts.last - pts.first).distance < 8) return null;
      return InkShape(strokes, Fit(FitKind.line, [pts.first, pts.last], 0, 1), arrow: (pts.first, pts.last));
    }
    final f = current?.fit;
    if (f != null && current!.arrow == null) {
      final same = switch (label.kind) {
        FitKind.circle || FitKind.ellipse => f.isOval,
        FitKind.rectangle || FitKind.square => f.kind == FitKind.rectangle || f.kind == FitKind.square,
        FitKind.polygon => f.kind == FitKind.polygon && f.outline.length == label.sides,
        _ => f.kind == label.kind,
      };
      if (same) return current;
    }
    final fit = fitAs([for (final s in strokes) offsetsOf(s)], label.kind, sides: label.sides);
    return fit == null ? null : InkShape(strokes, fit);
  }

  /// Rough drawings become clean shapes, in one undo step.
  void _placeShapes(List<InkShape> shapes) {
    final live = {for (final e in board.page.elements) e.id};
    // The page may have changed while a model was reading (undo, another page).
    shapes = [
      for (final s in shapes)
        if (s.strokes.every((x) => live.contains(x.id))) s,
    ];
    if (shapes.isEmpty) return;
    final replace = <String, BoardElement>{};
    final remove = <String>{};
    for (final s in shapes) {
      final first = s.strokes.first;
      final el = board.withNewShapeMeasure(shapeElement(s, first.style.color, math.max(2.0, first.style.width)));
      conversions[el.id] = PenConversion(kind: ConversionKind.shape, ink: s.strokes, inkBox: inkBounds(s.strokes), origin: el.frame.topLeft);
      replace[first.id] = el;
      remove.addAll(s.strokes.skip(1).map((x) => x.id));
    }
    board.setElements([
      for (final e in board.page.elements)
        if (replace[e.id] != null) replace[e.id]! else if (!remove.contains(e.id)) e,
    ]);
  }

  /// Reads one line (or part of a line) of writing and puts what it says in its place. False
  /// when it stays as ink.
  Future<bool> _convertCluster(List<Stroke> cluster) async {
    if (cluster.isEmpty) return false;
    final box = inkBounds(cluster);
    final neighbour = _lineNeighbour(box);
    final before = neighbour == null ? null : conversions[neighbour.id];
    final pre = before?.text ?? (neighbour is TextElement ? neighbour.text : '');

    // Maths is read on the board, symbol by symbol, on every platform (each symbol read by the
    // text model too, when there is one).
    final maths = await _readMaths(cluster);
    // Words need the platform's recogniser.
    var words = const <String>[];
    if (_handwriting.available) {
      final state = await _handwriting.modelState(language);
      if (state == HandwritingModelState.ready) {
        final context = pre.isEmpty || before?.kind == ConversionKind.maths ? '' : '$pre ';
        words = await _readWords(cluster, box, context);
      } else {
        _tell(state == HandwritingModelState.unsupported ? AiPenNotice.languageUnsupported : AiPenNotice.modelNeeded);
      }
    }
    // The page may have changed while reading (undo, another page).
    final live = {for (final e in board.page.elements) e.id};
    if (!cluster.every((s) => live.contains(s.id))) return false;

    var readings = _readings(maths, words);
    // Maths or words the teacher has turned off stay as ink.
    if (readings != null && (readings.maths ? !convertMaths : !convertText)) readings = null;
    if (readings == null) {
      if (words.isEmpty && !_handwriting.available) _tell(AiPenNotice.wordsStayInk);
      return false;
    }
    final color = cluster.first.style.color;
    final ids = {for (final s in cluster) s.id};

    if (readings.maths) {
      if (neighbour is MathElement && before?.kind == ConversionKind.maths && before!.plain != null) {
        // An equation written in pieces ("2x + 5" … "= 15") stays one equation.
        final plain = '${before.plain}${readings.plains.first}';
        final latex = '${neighbour.latex} ${readings.candidates.first}';
        final el = neighbour.copyWith(latex: latex, size: estimateMathSize(latex, neighbour.fontSize));
        _replace(ids, el, replacing: neighbour.id);
        conversions[el.id] = PenConversion(
          kind: ConversionKind.maths,
          ink: [...before.ink, ...cluster],
          inkBox: before.inkBox.expandToInclude(box),
          origin: before.origin,
          candidates: [latex],
          plains: [plain],
        );
        return true;
      }
      final fs = typedFontSize(cluster, near: _nearSize(box)).clamp(22.0, 160.0);
      final size = estimateMathSize(readings.candidates.first, fs);
      final el = MathElement(
        id: newElementId(),
        position: Offset(box.left, box.center.dy - size.height / 2),
        latex: readings.candidates.first,
        color: color,
        fontSize: fs,
        size: size,
      );
      _replace(ids, el);
      conversions[el.id] = PenConversion(
        kind: ConversionKind.maths,
        ink: cluster,
        inkBox: box,
        origin: el.position,
        candidates: readings.candidates,
        plains: readings.plains,
      );
      return true;
    }

    if (neighbour is TextElement && before?.kind == ConversionKind.text) {
      // The line goes on: the word joins the text before it.
      final text = '${before!.text} ${readings.candidates.first}';
      final el = neighbour.copyWith(
        text: text,
        size: measureBoardText(text, neighbour.fontSize, bold: neighbour.bold, font: neighbour.font),
      );
      _replace(ids, el, replacing: neighbour.id);
      conversions[el.id] = PenConversion(
        kind: ConversionKind.text,
        ink: [...before.ink, ...cluster],
        inkBox: before.inkBox.expandToInclude(box),
        origin: before.origin,
        candidates: [for (final c in readings.candidates) '${before.text} $c'],
      );
      return true;
    }
    // One size for the whole line, from the median letter height (not the ink's box, which
    // ascenders and descenders stretch), or the size of the text just above.
    final fs = typedFontSize(cluster, near: _nearSize(box));
    final text = readings.candidates.first;
    final el = TextElement(
      id: newElementId(),
      position: Offset(box.left, box.center.dy - fs * 0.62),
      text: text,
      color: color,
      fontSize: fs,
      size: measureBoardText(text, fs, font: textFont ?? board.font),
      font: textFont ?? board.font,
    );
    _replace(ids, el);
    conversions[el.id] = PenConversion(kind: ConversionKind.text, ink: cluster, inkBox: box, origin: el.position, candidates: readings.candidates);
    return true;
  }

  /// Maths in [cluster]: the board's layout reading, with each symbol read by the English text
  /// model when it is on the board and the maths is laid out (a fraction, a power, a subscript,
  /// a root), which no line reader understands.
  Future<MathReading> _readMaths(List<Stroke> cluster) async {
    final base = _symbols ?? SymbolRecognizer.instance;
    final reader = _reader;
    final en = InkModels.text('en');
    if (reader == null || !await _ready(en)) return readMathInk(cluster, recognizer: base);
    final assisted = AssistedSymbols(base);
    final first = readMathInk(cluster, recognizer: assisted);
    if (!_hasLayout(first.row)) return first;
    final h = lineHeightOf(cluster);
    for (final g in assisted.asked.toList()) {
      try {
        assisted.hint(g, await reader.readInk(timedGlyph(g), en, writingArea: Size(h * 2, h * 2)));
      } catch (_) {}
    }
    return readMathInk(cluster, recognizer: assisted);
  }

  /// Readings of [cluster] as a line of writing: with the timed model when there is one (and,
  /// for Hindi and Kannada, the English one for digits and symbols), else the platform's reader.
  Future<List<String>> _readWords(List<Stroke> cluster, Rect box, String context) async {
    final reader = _reader;
    final model = InkModels.text(language);
    if (reader == null || !await _ready(model)) return _handwriting.recognize(cluster, language: language, preContext: context);
    Future<List<String>> read(String m) async {
      try {
        return await reader.readInk(
          timedInk(cluster, strokeTimes, origin: box.topLeft),
          m,
          preContext: context.length > 20 ? context.substring(context.length - 20) : context,
          writingArea: Size(box.width + 20, box.height + 20),
        );
      } catch (_) {
        return const [];
      }
    }

    final words = await read(model);
    final en = InkModels.text('en');
    if (model != en && (words.isEmpty || looksMathy(words.first)) && await _ready(en)) {
      final latin = await read(en);
      if (latin.isNotEmpty && looksMathy(latin.first)) return [...latin, ...words];
    }
    return words;
  }

  /// The size of typed text written just above [box], so a paragraph of writing becomes text of
  /// one size.
  double? _nearSize(Rect box) {
    double? best;
    var bestGap = double.infinity;
    for (final e in board.page.elements) {
      if (e is! TextElement) continue;
      final b = e.bounds;
      final hOverlap = math.min(b.right, box.right) - math.max(b.left, box.left);
      final above = box.top - b.bottom;
      if (hOverlap > -box.height * 2 && above > -box.height * 0.3 && above < math.max(box.height, b.height) * 2.5 && above < bestGap) {
        best = e.fontSize;
        bestGap = above;
      }
    }
    return best;
  }

  /// How sure the symbol recogniser must be before maths with no word reader to agree is
  /// typeset (below that the ink stays).
  static const minMathsConfidence = 0.3;

  /// What the ink says: maths (LaTeX and solver syntax) or words, readings best first; null
  /// when it should stay as ink.
  ({bool maths, List<String> candidates, List<String> plains})? _readings(MathReading maths, List<String> words) {
    final clean = <String>[];
    for (final w in words) {
      final t = w.trim();
      if (t.isNotEmpty && !clean.contains(t)) clean.add(t);
    }
    // Words the recogniser read as maths ("2x+5=1S"): through the solver's parser.
    final fromWords = <(String, String)>[];
    for (final w in clean) {
      if (!looksMathy(w)) continue;
      final fixed = mathFix(w);
      final tex = MathTex.fromText(fixed);
      if (tex != null && !fromWords.any((x) => x.$1 == tex)) fromWords.add((tex, fixed));
    }
    // A fraction or a root is maths whatever a word reader says; a raised or lowered letter
    // loses to a reader that clearly read a word ("hay" is no h, a, y with a subscript).
    final wordy = clean.isNotEmpty && RegExp(r'[A-Za-z\u0900-\u0DFF]{3,}').hasMatch(clean.first) && !looksMathy(clean.first);
    final structured = _hasStrongLayout(maths.row) || (_hasLayout(maths.row) && !wordy);
    final wordsSayMaths = clean.isNotEmpty && looksMathy(clean.first) && fromWords.isNotEmpty;
    final inkSaysMaths = maths.looksLikeMaths && (maths.confidence >= minMathsConfidence || structured);
    // A word reader that reads words wins, unless the ink is laid out as maths (a fraction, a
    // root, a power), which no word reader understands.
    final isMaths = wordsSayMaths || (inkSaysMaths && (clean.isEmpty || structured || looksMathy(clean.first)));
    if (isMaths) {
      final ink = [(maths.latex, maths.plain), for (final a in maths.alternatives) (a.latex, a.plain)];
      // Laid out maths is the symbol reader's; a line of maths is read better by a word model.
      final ordered = structured || fromWords.isEmpty ? [...ink, ...fromWords] : [...fromWords, ...ink];
      final seen = <String>{};
      final unique = [
        for (final r in ordered)
          if (r.$1.isNotEmpty && seen.add(r.$1)) r,
      ];
      if (unique.isEmpty) return null;
      return (maths: true, candidates: [for (final r in unique) r.$1], plains: [for (final r in unique) r.$2]);
    }
    if (clean.isEmpty) return null;
    return (maths: false, candidates: clean, plains: const []);
  }

  static bool _hasStrongLayout(MathNode n) => switch (n) {
    MathRow(:final items) => items.any(_hasStrongLayout),
    MathFraction() || MathRoot() => true,
    MathPower(:final base, :final exponent) => _hasStrongLayout(base) || _hasStrongLayout(exponent),
    MathSubscript(:final base, :final index) => _hasStrongLayout(base) || _hasStrongLayout(index),
    MathSymbol() => false,
  };

  static bool _hasLayout(MathNode n) => switch (n) {
    MathRow(:final items) => items.any(_hasLayout),
    MathFraction() || MathRoot() || MathPower() || MathSubscript() => true,
    MathSymbol() => false,
  };

  void _tell(AiPenNotice n) {
    if (_told.add(n)) onNotice?.call(n);
  }

  /// Typed text or an equation just left of [box] on the same line, if any.
  BoardElement? _lineNeighbour(Rect box) {
    BoardElement? best;
    var bestGap = double.infinity;
    for (final e in board.page.elements) {
      if (e is! TextElement && e is! MathElement) continue;
      final b = e.bounds;
      final overlap = math.min(b.bottom, box.bottom) - math.max(b.top, box.top);
      if (overlap < math.min(b.height, box.height) * 0.35) continue;
      final gap = box.left - b.right;
      final limit = math.max(box.height, b.height) * 2.2;
      if (gap > -box.width * 0.3 && gap < limit && gap < bestGap) {
        best = e;
        bestGap = gap;
      }
    }
    return best;
  }

  /// Puts [el] where the ink [removeIds] was (or in place of [replacing]), in one undo step.
  void _replace(Set<String> removeIds, BoardElement el, {String? replacing}) {
    final out = <BoardElement>[];
    var placed = false;
    for (final e in board.page.elements) {
      if (e.id == replacing || (replacing == null && !placed && removeIds.contains(e.id))) {
        out.add(el);
        placed = true;
      } else if (!removeIds.contains(e.id)) {
        out.add(e);
      }
    }
    if (!placed) out.add(el);
    board.setElements(out);
  }

  // --- Corrections --------------------------------------------------------------------------

  /// Picks reading [i] of converted element [id].
  void choose(String id, int i) {
    final conv = conversions[id];
    final el = board.byId(id);
    if (conv == null || el == null || i < 0 || i >= conv.candidates.length) return;
    conv.chosen = i;
    final c = conv.candidates[i];
    switch (el) {
      case TextElement():
        board.replace(
          el.copyWith(
            text: c,
            size: measureBoardText(c, el.fontSize, bold: el.bold, font: el.font),
          ),
        );
      case MathElement():
        board.replace(el.copyWith(latex: c, size: estimateMathSize(c, el.fontSize)));
      default:
        break;
    }
    notifyListeners();
  }

  /// Corrects converted element [id] by typing: maths in the solver's syntax (2x+5=15) or words.
  void edit(String id, String typed) {
    final conv = conversions[id];
    final el = board.byId(id);
    final t = typed.trim();
    if (conv == null || el == null || t.isEmpty) return;
    final tex = conv.kind == ConversionKind.maths ? MathTex.fromText(t) : null;
    if (el is MathElement && tex != null) {
      board.replace(el.copyWith(latex: tex, size: estimateMathSize(tex, el.fontSize)));
      conversions[id] = PenConversion(kind: ConversionKind.maths, ink: conv.ink, inkBox: conv.inkBox, origin: conv.origin, candidates: [tex], plains: [t]);
    } else {
      final fs = el is TextElement ? el.fontSize : (el is MathElement ? el.fontSize * 0.9 : 32.0);
      final at = el is TextElement ? el.position : el.bounds.topLeft;
      final text = TextElement(
        id: id,
        position: at,
        text: t,
        color: _colorOf(el),
        fontSize: fs,
        size: measureBoardText(t, fs, font: board.font),
        font: board.font,
      );
      board.replace(text);
      conversions[id] = PenConversion(kind: ConversionKind.text, ink: conv.ink, inkBox: conv.inkBox, origin: conv.origin, candidates: [t]);
    }
    notifyListeners();
  }

  static Color _colorOf(BoardElement e) => switch (e) {
    TextElement(:final color) || MathElement(:final color) || PolygonElement(:final color) => color,
    Stroke(:final style) => style.color,
    _ => const Color(0xFF1B1B1F),
  };

  /// Puts the handwriting back in place of converted element [id] (where the element is now,
  /// if it was moved), in one undo step.
  void revertToInk(String id) {
    final conv = conversions.remove(id);
    final el = board.byId(id);
    inspecting.value = null;
    if (conv == null || el == null) return;
    final d = el.frame.topLeft - conv.origin;
    final ink = [for (final s in conv.ink) d == Offset.zero ? s : s.translated(d)];
    board.setElements([
      for (final e in board.page.elements)
        if (e.id == id) ...ink else e,
    ]);
    notifyListeners();
  }

  /// "That was a shape, not writing": fits the original ink of [id] as a shape. False when
  /// no clean shape explains it.
  bool toShape(String id) {
    final conv = conversions[id];
    final el = board.byId(id);
    if (conv == null || el == null) return false;
    final pts = [for (final s in conv.ink) offsetsOf(s)];
    final r = shapeOfGroup(conv.ink) ?? (fitClosed(pts) == null ? null : (fitClosed(pts)!, null));
    if (r == null) return false;
    conversions.remove(id);
    final first = conv.ink.first;
    final shape = board.withNewShapeMeasure(shapeElement(InkShape(conv.ink, r.$1, arrow: r.$2), first.style.color, math.max(2.0, first.style.width)));
    board.setElements([for (final e in board.page.elements) e.id == id ? shape : e]);
    conversions[shape.id] = PenConversion(kind: ConversionKind.shape, ink: conv.ink, inkBox: conv.inkBox, origin: shape.frame.topLeft);
    // Writing mistaken for a shape at this size: this teacher's letters are this big.
    final h = letterHeightPx(conv.ink, board.view.value.scale);
    if (h > 0 && h < letterPx * 2.5) {
      letterPx = (letterPx * 0.7 + (h / 2.3) * 0.3).clamp(20.0, 140.0);
      onLetterSize?.call(letterPx);
    }
    inspecting.value = null;
    notifyListeners();
    return true;
  }

  /// "That was writing, not a shape": puts the ink of shape [id] back and reads it as writing.
  Future<void> toWriting(String id) async {
    final conv = conversions[id];
    if (conv == null || conv.kind != ConversionKind.shape) return;
    final ink = conv.ink;
    revertToInk(id);
    // A shape mistaken for writing at this size: this teacher writes bigger.
    final h = letterHeightPx(ink, board.view.value.scale);
    if (h > letterPx) {
      letterPx = (letterPx * 0.6 + h * 0.4).clamp(20.0, 140.0);
      onLetterSize?.call(letterPx);
    }
    final live = {for (final e in board.page.elements) e.id};
    final back = board.page.elements.whereType<Stroke>().where((s) => live.contains(s.id) && ink.any((i) => i.id == s.id)).toList();
    _converting = true;
    notifyListeners();
    try {
      for (final c in clusterWriting(back)) {
        await _convertCluster(c);
      }
    } finally {
      _converting = false;
      notifyListeners();
    }
  }

  /// The maths solver's syntax for equation [e]: the AI pen's own reading when it wrote it,
  /// otherwise read back from its LaTeX.
  String solverText(MathElement e) {
    final conv = conversions[e.id];
    if (conv?.kind == ConversionKind.maths && conv!.plain != null && conv.text == e.latex) return conv.plain!;
    return MathTex.toText(e.latex);
  }

  @override
  void dispose() {
    _timer?.cancel();
    if (board.onStrokeStart == _strokeStarted) board.onStrokeStart = null;
    if (board.onStrokeEnd == _strokeEnded) board.onStrokeEnd = null;
    inspecting.dispose();
    super.dispose();
  }
}
