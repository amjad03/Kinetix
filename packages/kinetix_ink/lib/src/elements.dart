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
}

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
  });

  @override
  final String id;
  final Rect rect;
  final String expression;
  final Color color;
  final double xMin, xMax, yMin, yMax;
  @override
  final double rotation;

  @override
  Rect get frame => rect;
  @override
  Rect get bounds => rotatedBounds(rect, rotation);
  @override
  bool hitTest(Offset p, double radius) => rect.inflate(radius).contains(unturn(p, rect, rotation));

  GraphElement copyWith({String? id, Rect? rect, String? expression, Color? color, double? rotation}) => GraphElement(
    id: id ?? this.id,
    rect: rect ?? this.rect,
    expression: expression ?? this.expression,
    color: color ?? this.color,
    xMin: xMin,
    xMax: xMax,
    yMin: yMin,
    yMax: yMax,
    rotation: rotation ?? this.rotation,
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

// --- Figures -------------------------------------------------------------------------------

/// A straight-sided figure with any corners: a tidied hand drawing, a geometry diagram, a
/// circuit symbol's parts.
class PolygonElement extends BoardElement {
  const PolygonElement({required this.id, required this.points, required this.color, required this.width, this.closed = true, this.fill});

  @override
  final String id;
  final List<Offset> points;
  final Color color;
  final double width;
  final bool closed;
  final Color? fill;

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

  PolygonElement copyWith({String? id, List<Offset>? points, Color? color, Color? fill, bool clearFill = false}) => PolygonElement(
    id: id ?? this.id,
    points: points ?? this.points,
    color: color ?? this.color,
    width: width,
    closed: closed,
    fill: clearFill ? null : (fill ?? this.fill),
  );

  @override
  PolygonElement translated(Offset d) => _moved(this, d, copyWith(points: [for (final p in points) p + d]));
  @override
  PolygonElement scaled(Offset origin, double sx, double sy) => copyWith(points: [for (final p in points) scalePoint(p, origin, sx, sy)]);
  @override
  PolygonElement rotated(Offset center, double angle) => copyWith(points: [for (final p in points) rotatePoint(p, center, angle)]);
  @override
  PolygonElement recolored(Color c) => copyWith(color: c, fill: fill == null ? null : c.withValues(alpha: fill!.a));
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
