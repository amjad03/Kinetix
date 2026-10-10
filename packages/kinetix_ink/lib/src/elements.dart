part of 'ink_models.dart';

/// Everything that can sit on a board page: ink ([Stroke], which includes shapes), typed text,
/// pictures, equations, graphs, straight-sided figures and notes.
///
/// Elements on a page are not changed in place: moving, resizing, turning or recolouring makes
/// a new element with the same [id]. That makes undo a matter of keeping the old list, and lets
/// the lesson recorder tell a move from an edit (see [movedFromOf]).
///
/// Extension points: the AI pen turns strokes into [TextElement], [MathElement] and
/// [PolygonElement]s (or shape strokes) on this model; 3D models and labs put an [ImageElement]
/// snapshot on the board whose [ImageElement.link] reopens them.
sealed class BoardElement {
  const BoardElement();

  /// Unique on its page. Groups and the selection refer to elements by id.
  String get id;

  /// The axis-aligned box around everything the element paints, in board units.
  Rect get bounds;

  /// The unturned box of a boxed element (text, picture, equation, graph, note); for ink and
  /// figures, just the bounds.
  Rect get frame => bounds;

  /// How far a boxed element is turned about its frame's centre, in radians.
  double get rotation => 0;

  /// True when a circle of [radius] around board point [p] touches this element.
  bool hitTest(Offset p, double radius) => bounds.inflate(radius).contains(p);

  /// Moved by [d]. Records where it came from, so a recorder can send a move instead of the
  /// whole element again.
  BoardElement translated(Offset d);

  /// Scaled about [origin] by [sx] and [sy], as a resize handle does. Text, equations and notes
  /// grow evenly (by the geometric mean); ink keeps its look.
  BoardElement scaled(Offset origin, double sx, double sy);

  /// Turned by [angle] radians about [center], as the turn handle does.
  BoardElement rotated(Offset center, double angle);

  /// In colour [c] (pictures keep theirs).
  BoardElement recolored(Color c);

  /// The same element under another id (copy, paste, duplicate).
  BoardElement withId(String id);
}

final _movedFrom = Expando<(BoardElement, Offset)>('movedFrom');

T _moved<T extends BoardElement>(BoardElement from, Offset d, T to) {
  _movedFrom[to] = (from, d);
  return to;
}

/// The element [e] was translated from, and by how much, when it was made by
/// [BoardElement.translated]; null otherwise. Kept weakly: it costs nothing once either is gone.
(BoardElement, Offset)? movedFromOf(BoardElement e) => _movedFrom[e];

var _seq = 0;
final _session = math.Random().nextInt(1 << 30).toRadixString(36);

/// A new element id, unique on this board and unlikely to clash with one pasted from another.
String newElementId() => 'e$_session${(_seq++).toRadixString(36)}';

// --- Geometry ------------------------------------------------------------------------------

Offset scalePoint(Offset p, Offset o, double sx, double sy) => Offset(o.dx + (p.dx - o.dx) * sx, o.dy + (p.dy - o.dy) * sy);

Offset rotatePoint(Offset p, Offset c, double a) {
  if (a == 0) return p;
  final d = p - c;
  final cs = math.cos(a), sn = math.sin(a);
  return c + Offset(d.dx * cs - d.dy * sn, d.dx * sn + d.dy * cs);
}

/// The axis-aligned box around [r] turned by [a] about its centre.
Rect rotatedBounds(Rect r, double a) {
  if (a == 0) return r;
  final c = r.center;
  final pts = [for (final p in [r.topLeft, r.topRight, r.bottomLeft, r.bottomRight]) rotatePoint(p, c, a)];
  var out = Rect.fromPoints(pts[0], pts[0]);
  for (final p in pts.skip(1)) {
    out = out.expandToInclude(Rect.fromPoints(p, p));
  }
  return out;
}

/// [r] scaled about [o]: its centre moves with the scale, its size grows by |sx| and |sy| (in
/// its own axes when it is turned).
Rect scaleFrame(Rect r, Offset o, double sx, double sy) =>
    Rect.fromCenter(center: scalePoint(r.center, o, sx, sy), width: r.width * sx.abs(), height: r.height * sy.abs());

/// [r] moved so its centre turns by [a] about [c].
Rect turnFrame(Rect r, Offset c, double a) => r.shift(rotatePoint(r.center, c, a) - r.center);

/// [p] in a turned frame's own (unturned) coordinates.
Offset unturn(Offset p, Rect frame, double rotation) => rotatePoint(p, frame.center, -rotation);

double _even(double sx, double sy) => math.sqrt((sx * sy).abs());

/// A box scaled about [o]: corner to corner when it is not turned, about its centre when it is.
Rect _scaleBox(Rect r, double rotation, Offset o, double sx, double sy) =>
    rotation == 0 ? Rect.fromPoints(scalePoint(r.topLeft, o, sx, sy), scalePoint(r.bottomRight, o, sx, sy)) : scaleFrame(r, o, sx, sy);

/// A box that keeps its proportions, scaled evenly about [o] (text, equations).
Rect _scaleEven(Rect r, Offset o, double sx, double sy) {
  final k = _even(sx, sy);
  return Rect.fromCenter(center: scalePoint(r.center, o, sx, sy), width: r.width * k, height: r.height * k);
}

double distanceToSegment(Offset p, Offset a, Offset b) => _distanceToSegment(p, a, b);

// --- Text ----------------------------------------------------------------------------------

/// Fonts for text written on the board.
enum BoardFont {
  /// Inter: the board's everyday text.
  inter,

  /// Andika: single-storey a and g, as children in LKG to Class 5 learn to write them.
  andika,

  /// Kalam: Text AI's handwriting-style font (Latin and Devanagari).
  kalam,

  /// A font the teacher added (Text AI → Font → Custom), loaded on this board as
  /// [customBoardFontFamily]; elsewhere it shows in the everyday font.
  custom,
}

/// The family name a teacher's own font is loaded under (FontLoader).
const customBoardFontFamily = 'KinetixCustom';

/// Typed text. [size] is its laid-out size, measured when the text was committed, so viewers
/// know its box without laying it out again.
class TextElement extends BoardElement {
  const TextElement({
    required this.id,
    required this.position,
    required this.text,
    required this.color,
    required this.fontSize,
    required this.size,
    this.bold = false,
    this.font = BoardFont.inter,
    this.rotation = 0,
  });

  @override
  final String id;
  final Offset position;
  final String text;
  final Color color;
  final double fontSize;
  final Size size;
  final bool bold;
  final BoardFont font;
  @override
  final double rotation;

  @override
  Rect get frame => position & size;
  @override
  Rect get bounds => rotatedBounds(frame, rotation);
  @override
  bool hitTest(Offset p, double radius) => frame.inflate(radius).contains(unturn(p, frame, rotation));

  TextElement copyWith({String? id, Offset? position, String? text, Color? color, double? fontSize, Size? size, bool? bold, BoardFont? font, double? rotation}) =>
      TextElement(
        id: id ?? this.id,
        position: position ?? this.position,
        text: text ?? this.text,
        color: color ?? this.color,
        fontSize: fontSize ?? this.fontSize,
        size: size ?? this.size,
        bold: bold ?? this.bold,
        font: font ?? this.font,
        rotation: rotation ?? this.rotation,
      );

  @override
  TextElement translated(Offset d) => _moved(this, d, copyWith(position: position + d));
  @override
  TextElement scaled(Offset origin, double sx, double sy) {
    final f = _scaleEven(frame, origin, sx, sy);
    return copyWith(position: f.topLeft, size: f.size, fontSize: (fontSize * _even(sx, sy)).clamp(6.0, 400.0));
  }

  @override
  TextElement rotated(Offset center, double angle) => copyWith(position: turnFrame(frame, center, angle).topLeft, rotation: rotation + angle);
  @override
  TextElement recolored(Color c) => copyWith(color: c);
  @override
  TextElement withId(String id) => copyWith(id: id);
}

// --- Pictures ------------------------------------------------------------------------------

/// What a picture on the board came from, so it can be opened again: a snapshot of a 3D model
/// or a virtual lab.
class EmbedLink {
  const EmbedLink({required this.kind, required this.id, this.preset});

  /// `model3d` or `lab` (kinds added later are kept and shown as plain pictures).
  final String kind;
  final String id;

  /// The lab's preset or the model's view, when there is one.
  final String? preset;

  static const model3d = 'model3d';
  static const lab = 'lab';

  Map<String, Object?> toJson() => {'k': kind, 'id': id, 'p': ?preset};

  static EmbedLink? fromJson(Object? j) {
    if (j is! Map) return null;
    final kind = j['k'], id = j['id'];
    if (kind is! String || id is! String) return null;
    return EmbedLink(kind: kind, id: id, preset: j['p'] as String?);
  }

  @override
  bool operator ==(Object other) => other is EmbedLink && other.kind == kind && other.id == id && other.preset == preset;
  @override
  int get hashCode => Object.hash(kind, id, preset);
}

/// A picture: a photo, a diagram, or a snapshot of a 3D model or lab ([link]). [bytes] is
/// PNG or JPEG; boards keep pictures small (the board scales them down when they are added).
///
/// A [backdrop] is an imported PDF page or slide: it sits under the page's ink and cannot be
/// selected, moved or rubbed out, so the teacher writes over it freely.
class ImageElement extends BoardElement {
  const ImageElement({required this.id, required this.rect, required this.bytes, this.rotation = 0, this.link, this.backdrop = false});

  @override
  final String id;
  final Rect rect;
  final Uint8List bytes;
  @override
  final double rotation;
  final EmbedLink? link;
  final bool backdrop;

  @override
  Rect get frame => rect;
  @override
  Rect get bounds => rotatedBounds(rect, rotation);
  @override
  bool hitTest(Offset p, double radius) => rect.inflate(radius).contains(unturn(p, rect, rotation));

  ImageElement copyWith({String? id, Rect? rect, double? rotation}) =>
      ImageElement(id: id ?? this.id, rect: rect ?? this.rect, bytes: bytes, rotation: rotation ?? this.rotation, link: link, backdrop: backdrop);

  @override
  ImageElement translated(Offset d) => _moved(this, d, copyWith(rect: rect.shift(d)));
  @override
  ImageElement scaled(Offset origin, double sx, double sy) => copyWith(rect: _scaleBox(rect, rotation, origin, sx, sy));
  @override
  ImageElement rotated(Offset center, double angle) => copyWith(rect: turnFrame(rect, center, angle), rotation: rotation + angle);
  @override
  ImageElement recolored(Color c) => this;
  @override
  ImageElement withId(String id) => copyWith(id: id);
}

// --- Maths ---------------------------------------------------------------------------------

/// A typeset equation in LaTeX. [size] starts as an estimate and is corrected once the
/// equation has been typeset (see [estimateMathSize]).
class MathElement extends BoardElement {
  const MathElement({
    required this.id,
    required this.position,
    required this.latex,
    required this.color,
    required this.fontSize,
    required this.size,
    this.rotation = 0,
  });

  @override
  final String id;
  final Offset position;
  final String latex;
  final Color color;
  final double fontSize;
  final Size size;
  @override
  final double rotation;

  @override
  Rect get frame => position & size;
  @override
  Rect get bounds => rotatedBounds(frame, rotation);
  @override
  bool hitTest(Offset p, double radius) => frame.inflate(radius).contains(unturn(p, frame, rotation));

  MathElement copyWith({String? id, Offset? position, String? latex, Color? color, double? fontSize, Size? size, double? rotation}) => MathElement(
    id: id ?? this.id,
    position: position ?? this.position,
    latex: latex ?? this.latex,
    color: color ?? this.color,
    fontSize: fontSize ?? this.fontSize,
    size: size ?? this.size,
    rotation: rotation ?? this.rotation,
  );

  @override
  MathElement translated(Offset d) => _moved(this, d, copyWith(position: position + d));
  @override
  MathElement scaled(Offset origin, double sx, double sy) {
    final f = _scaleEven(frame, origin, sx, sy);
    return copyWith(position: f.topLeft, size: f.size, fontSize: (fontSize * _even(sx, sy)).clamp(6.0, 400.0));
  }

  @override
  MathElement rotated(Offset center, double angle) => copyWith(position: turnFrame(frame, center, angle).topLeft, rotation: rotation + angle);
  @override
  MathElement recolored(Color c) => copyWith(color: c);
  @override
  MathElement withId(String id) => copyWith(id: id);
}

/// A first guess at an equation's size before it is typeset: wide enough for its characters.
Size estimateMathSize(String latex, double fontSize) {
  final visible = latex.replaceAll(RegExp(r'\\[a-zA-Z]+|[{}^_]'), '').length;
  final tall = latex.contains(r'\frac') || latex.contains(r'\sqrt') || latex.contains(r'\sum');
  return Size(math.max(fontSize, visible * fontSize * 0.55), fontSize * (tall ? 2.2 : 1.4));
}

/// A plotted function y = f(x) on axes, inside [rect]. The expression uses the maths solver's
/// syntax (`2x^2 - 3`, `sin(x)`, `sqrt(x)`).
///
/// A graph from a template is editable: its [expression] and [curves] may use single-letter
/// [params] (`a*x^2 + b*x + c`; never `x` or `e`), put in as numbers before plotting
/// ([resolve]). It may also carry marked [points] (draggable in the graph editor), a [shade]d
/// band, axis labels and a [title].
class GraphElement extends BoardElement {
  const GraphElement({
    required this.id,
    required this.rect,
    required this.expression,
    required this.color,
    this.xMin = -10,
    this.xMax = 10,
    this.yMin = -10,
    this.yMax = 10,
    this.rotation = 0,
    this.curves = const [],
    this.params = const {},
    this.points = const [],
    this.shade,
    this.xLabel = '',
    this.yLabel = '',
    this.title = '',
  });

  @override
  final String id;
  final Rect rect;
  final String expression;
  final Color color;
  final double xMin, xMax, yMin, yMax;
  @override
  final double rotation;

  /// More curves on the same axes (supply with demand, cost curves), in their own colours.
  final List<String> curves;

  /// Values of the letters in [expression] and [curves].
  final Map<String, double> params;
  final List<GraphPoint> points;
  final GraphShade? shade;
  final String xLabel, yLabel, title;

  /// [template] with each of [params] put in as a number in brackets.
  String resolve(String template) {
    var out = template;
    for (final e in params.entries) {
      out = out.replaceAll(RegExp('(?<![a-z])${RegExp.escape(e.key)}(?![a-z])'), '(${graphNum(e.value)})');
    }
    return out;
  }

  String get resolvedExpression => resolve(expression);
  List<String> get resolvedCurves => [for (final c in curves) resolve(c)];

  @override
  Rect get frame => rect;
  @override
  Rect get bounds => rotatedBounds(rect, rotation);
  @override
  bool hitTest(Offset p, double radius) => rect.inflate(radius).contains(unturn(p, rect, rotation));

  /// Board point of graph point ([x], [y]), before the graph is turned.
  Offset toBoard(double x, double y) =>
      Offset(rect.left + (x - xMin) / (xMax - xMin) * rect.width, rect.bottom - (y - yMin) / (yMax - yMin) * rect.height);

  /// Graph point under board point [p] (unturned).
  Offset toGraph(Offset p) =>
      Offset(xMin + (p.dx - rect.left) / rect.width * (xMax - xMin), yMin + (rect.bottom - p.dy) / rect.height * (yMax - yMin));

  GraphElement copyWith({
    String? id,
    Rect? rect,
    String? expression,
    Color? color,
    double? rotation,
    double? xMin,
    double? xMax,
    double? yMin,
    double? yMax,
    List<String>? curves,
    Map<String, double>? params,
    List<GraphPoint>? points,
    GraphShade? shade,
    bool clearShade = false,
    String? xLabel,
    String? yLabel,
    String? title,
  }) => GraphElement(
    id: id ?? this.id,
    rect: rect ?? this.rect,
    expression: expression ?? this.expression,
    color: color ?? this.color,
    xMin: xMin ?? this.xMin,
    xMax: xMax ?? this.xMax,
    yMin: yMin ?? this.yMin,
    yMax: yMax ?? this.yMax,
    rotation: rotation ?? this.rotation,
    curves: curves ?? this.curves,
    params: params ?? this.params,
    points: points ?? this.points,
    shade: clearShade ? null : (shade ?? this.shade),
    xLabel: xLabel ?? this.xLabel,
    yLabel: yLabel ?? this.yLabel,
    title: title ?? this.title,
  );

  @override
  GraphElement translated(Offset d) => _moved(this, d, copyWith(rect: rect.shift(d)));
  @override
  GraphElement scaled(Offset origin, double sx, double sy) => copyWith(rect: _scaleBox(rect, rotation, origin, sx, sy));
  @override
  GraphElement rotated(Offset center, double angle) => copyWith(rect: turnFrame(rect, center, angle), rotation: rotation + angle);
  @override
  GraphElement recolored(Color c) => copyWith(color: c);
  @override
  GraphElement withId(String id) => copyWith(id: id);
}

/// [v] written short: whole numbers without a point, others to at most four places.
String graphNum(double v) {
  if (v == v.roundToDouble() && v.abs() < 1e15) return v.toInt().toString();
  return v.toStringAsFixed(4).replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
}

/// A marked point on a graph (an equilibrium, a reading), in graph units.
class GraphPoint {
  const GraphPoint(this.x, this.y, [this.label = '']);

  final double x, y;
  final String label;

  @override
  bool operator ==(Object other) => other is GraphPoint && other.x == x && other.y == y && other.label == label;
  @override
  int get hashCode => Object.hash(x, y, label);
}

/// A shaded band from x = [from] to x = [to]: under the main curve, or between it and the first
/// of [GraphElement.curves] when [between].
class GraphShade {
  const GraphShade(this.from, this.to, {this.between = false});

  final double from, to;
  final bool between;

  @override
  bool operator ==(Object other) => other is GraphShade && other.from == from && other.to == to && other.between == between;
  @override
  int get hashCode => Object.hash(from, to, between);
}

// --- Figures -------------------------------------------------------------------------------

/// A straight-sided figure with any corners: a tidied hand drawing, a geometry diagram, a
/// circuit symbol's parts.
class PolygonElement extends BoardElement {
  const PolygonElement({
    required this.id,
    required this.points,
    required this.color,
    required this.width,
    this.closed = true,
    this.fill,
    this.measure = ShapeMeasure.none,
    this.turn = 0,
    this.sideColors = const {},
  });

  @override
  final String id;
  final List<Offset> points;
  final Color color;
  final double width;
  final bool closed;
  final Color? fill;

  /// Sides coloured on their own: side index (point i to point i + 1) to colour.
  final Map<int, Color> sideColors;

  /// The measurements this figure shows.
  final ShapeMeasure measure;

  /// How far it has been turned since it was made (its points are already turned).
  final double turn;

  @override
  Rect get bounds {
    if (points.isEmpty) return Rect.zero;
    var r = Rect.fromPoints(points.first, points.first);
    for (final p in points) {
      r = r.expandToInclude(Rect.fromPoints(p, p));
    }
    return r.inflate(width / 2);
  }

  @override
  bool hitTest(Offset p, double radius) {
    final r = radius + width / 2;
    final n = points.length;
    for (var i = 0; i < (closed ? n : n - 1); i++) {
      if (_distanceToSegment(p, points[i], points[(i + 1) % n]) <= r) return true;
    }
    return fill != null && closed && _insidePolygon(p, points);
  }

  PolygonElement copyWith({
    String? id,
    List<Offset>? points,
    Color? color,
    Color? fill,
    bool clearFill = false,
    double? width,
    ShapeMeasure? measure,
    double? turn,
    Map<int, Color>? sideColors,
  }) => PolygonElement(
    id: id ?? this.id,
    points: points ?? this.points,
    color: color ?? this.color,
    width: width ?? this.width,
    closed: closed,
    fill: clearFill ? null : (fill ?? this.fill),
    measure: measure ?? this.measure,
    turn: turn ?? this.turn,
    sideColors: sideColors ?? this.sideColors,
  );

  @override
  PolygonElement translated(Offset d) => _moved(this, d, copyWith(points: [for (final p in points) p + d]));
  @override
  PolygonElement scaled(Offset origin, double sx, double sy) =>
      copyWith(points: [for (final p in points) scalePoint(p, origin, sx, sy)], turn: (sx < 0) != (sy < 0) ? -turn : turn);
  @override
  PolygonElement rotated(Offset center, double angle) => copyWith(points: [for (final p in points) rotatePoint(p, center, angle)], turn: turn + angle);
  @override
  PolygonElement recolored(Color c) => copyWith(color: c, fill: fill == null ? null : c.withValues(alpha: fill!.a), sideColors: const {});
  @override
  PolygonElement withId(String id) => copyWith(id: id);
}

// --- Notes ---------------------------------------------------------------------------------

/// The kinds of note: a sticky note, a code block, a big word card, or an answer kept covered
/// until the teacher shows it (then it becomes a note).
enum NoteKind { note, code, card, answer }

/// A coloured card with wrapped text.
class NoteElement extends BoardElement {
  const NoteElement({
    required this.id,
    required this.rect,
    required this.text,
    required this.color,
    this.fontSize = 22,
    this.kind = NoteKind.note,
    this.language,
    this.rotation = 0,
  });

  @override
  final String id;
  final Rect rect;
  final String text;
  final Color color;
  final double fontSize;
  final NoteKind kind;

  /// A code block's language (e.g. `python`), for its label; null otherwise.
  final String? language;
  @override
  final double rotation;

  /// A covered answer: the class sees only that there is one.
  bool get hidden => kind == NoteKind.answer;

  @override
  Rect get frame => rect;
  @override
  Rect get bounds => rotatedBounds(rect, rotation);
  @override
  bool hitTest(Offset p, double radius) => rect.inflate(radius).contains(unturn(p, rect, rotation));

  NoteElement copyWith({String? id, Rect? rect, String? text, Color? color, double? fontSize, NoteKind? kind, String? language, double? rotation}) => NoteElement(
    id: id ?? this.id,
    rect: rect ?? this.rect,
    text: text ?? this.text,
    color: color ?? this.color,
    fontSize: fontSize ?? this.fontSize,
    kind: kind ?? this.kind,
    language: language ?? this.language,
    rotation: rotation ?? this.rotation,
  );

  /// The answer uncovered, as a note in the same place.
  NoteElement revealed() => copyWith(kind: NoteKind.note);

  @override
  NoteElement translated(Offset d) => _moved(this, d, copyWith(rect: rect.shift(d)));
  @override
  NoteElement scaled(Offset origin, double sx, double sy) =>
      copyWith(rect: _scaleBox(rect, rotation, origin, sx, sy), fontSize: (fontSize * _even(sx, sy)).clamp(8.0, 200.0));
  @override
  NoteElement rotated(Offset center, double angle) => copyWith(rect: turnFrame(rect, center, angle), rotation: rotation + angle);
  @override
  NoteElement recolored(Color c) => copyWith(color: c.withValues(alpha: 1));
  @override
  NoteElement withId(String id) => copyWith(id: id);
}

/// The box around [elements] (Rect.zero for none).
Rect contentBounds(Iterable<BoardElement> elements) {
  Rect? r;
  for (final e in elements) {
    r = r == null ? e.bounds : r.expandToInclude(e.bounds);
  }
  return r ?? Rect.zero;
}
