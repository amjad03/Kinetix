import 'dart:math' as math;

/// Vector outlines of the handwritten maths symbols the AI pen reads, and the synthesiser that
/// turns them into many plausible handwritten samples.
///
/// The symbol recogniser (symbol_recognizer.dart) is trained on samples made here: each glyph
/// is drawn the ways children and teachers in Indian classrooms commonly write it (a 4 open or
/// closed, a 1 with or without its flag, the single-storey a), then bent, slanted, squashed and
/// wobbled with a seeded random generator. tool/generate_symbol_templates.dart writes the
/// templates the board ships with; test/pen/symbol_recognizer_test.dart measures accuracy on a
/// held-out set made with another seed and stronger distortion.
///
/// Pure Dart (no dart:ui), so the generator runs with `dart run`.

/// A point of a glyph outline or of ink, in any units; y grows downward.
typedef Pt = ({double x, double y});

/// One stroke: the points from pen down to pen up.
typedef GlyphStroke = List<Pt>;

/// One way of writing [symbol].
class GlyphVariant {
  const GlyphVariant(this.symbol, this.strokes);

  final String symbol;
  final List<GlyphStroke> strokes;
}

// --- Drawing helpers (unit cell: x-height from y = 0 to 1, ascenders above 0) ----------------

Pt _p(double x, double y) => (x: x, y: y);

/// A straight run through [xy] (x0, y0, x1, y1, …).
List<Pt> _poly(List<double> xy) {
  final out = <Pt>[];
  for (var i = 0; i + 3 < xy.length; i += 2) {
    final a = _p(xy[i], xy[i + 1]), b = _p(xy[i + 2], xy[i + 3]);
    final n = math.max(2, (math.sqrt(math.pow(b.x - a.x, 2) + math.pow(b.y - a.y, 2)) * 24).ceil());
    for (var k = (i == 0 ? 0 : 1); k <= n; k++) {
      out.add(_p(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n));
    }
  }
  return out;
}

/// An elliptical arc about (cx, cy) from angle [a0] to [a1] in degrees (0 is right, 90 down).
List<Pt> _arc(double cx, double cy, double rx, double ry, double a0, double a1) {
  final n = math.max(6, ((a1 - a0).abs() / 8).ceil());
  return [
    for (var k = 0; k <= n; k++) _p(cx + rx * math.cos((a0 + (a1 - a0) * k / n) * math.pi / 180), cy + ry * math.sin((a0 + (a1 - a0) * k / n) * math.pi / 180)),
  ];
}

/// A cubic Bézier through control points (x0, y0 … x3, y3).
List<Pt> _bez(double x0, double y0, double x1, double y1, double x2, double y2, double x3, double y3) {
  const n = 20;
  return [
    for (var k = 0; k <= n; k++)
      () {
        final t = k / n, u = 1 - t;
        return _p(
          u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
        );
      }(),
  ];
}

/// A dot: a tiny tap of the pen.
List<Pt> _dot(double x, double y) => [_p(x, y), _p(x + 0.02, y + 0.02)];

/// Joins pieces drawn without lifting the pen.
GlyphStroke _join(List<List<Pt>> parts) => [for (final p in parts) ...p];

GlyphVariant _g(String symbol, List<GlyphStroke> strokes) => GlyphVariant(symbol, strokes);

/// Every symbol the recogniser knows, in each common way of writing it. "x" covers the letter
/// and the times sign (the layout tells them apart); a fraction bar is a long minus.
final List<GlyphVariant> glyphVariants = [
  // Digits.
  _g('0', [_arc(0.3, 0.5, 0.28, 0.5, -90, 270)]),
  _g('0', [_arc(0.3, 0.5, 0.26, 0.5, -60, -420)]),
  _g('1', [
    _poly([0.3, 0, 0.3, 1]),
  ]),
  _g('1', [
    _poly([0.08, 0.22, 0.3, 0, 0.3, 1]),
  ]),
  _g('1', [
    _poly([0.08, 0.22, 0.3, 0, 0.3, 1]),
    _poly([0.08, 1, 0.52, 1]),
  ]),
  _g('2', [
    _join([
      _arc(0.3, 0.28, 0.28, 0.26, 200, 380),
      _poly([0.56, 0.37, 0.02, 1, 0.62, 1]),
    ]),
  ]),
  _g('2', [
    _join([
      _arc(0.3, 0.3, 0.28, 0.28, 190, 400),
      _bez(0.51, 0.47, 0.35, 0.7, 0.1, 0.85, 0.02, 1),
      _poly([0.02, 1, 0.65, 0.98]),
    ]),
  ]),
  _g('3', [
    _join([_arc(0.28, 0.25, 0.26, 0.24, 210, 450), _arc(0.28, 0.74, 0.3, 0.26, 270, 510)]),
  ]),
  _g('3', [
    _join([
      _poly([0.02, 0, 0.55, 0, 0.2, 0.42]),
      _arc(0.26, 0.72, 0.3, 0.28, 250, 500),
    ]),
  ]),
  _g('4', [
    _poly([0.45, 0, 0, 0.68, 0.64, 0.68]),
    _poly([0.46, 0.3, 0.46, 1]),
  ]),
  _g('4', [
    _poly([0.06, 0, 0.04, 0.6, 0.62, 0.6]),
    _poly([0.46, 0, 0.46, 1]),
  ]),
  _g('5', [
    _join([
      _poly([0.1, 0, 0.06, 0.45]),
      _bez(0.06, 0.45, 0.6, 0.25, 0.78, 0.82, 0, 0.95),
    ]),
    _poly([0.1, 0, 0.62, 0]),
  ]),
  _g('5', [
    _join([
      _poly([0.62, 0, 0.1, 0, 0.06, 0.45]),
      _bez(0.06, 0.45, 0.6, 0.25, 0.78, 0.82, 0, 0.95),
    ]),
  ]),
  _g('6', [
    _join([_bez(0.55, 0.02, 0.12, 0.1, -0.06, 0.8, 0.3, 1), _arc(0.3, 0.72, 0.27, 0.28, 90, -180)]),
  ]),
  _g('7', [
    _poly([0, 0, 0.62, 0, 0.18, 1]),
  ]),
  _g('7', [
    _poly([0, 0, 0.62, 0, 0.18, 1]),
    _poly([0.14, 0.5, 0.52, 0.5]),
  ]),
  _g('8', [
    // A figure of eight in one stroke, crossing in the middle.
    [for (var k = 0; k <= 48; k++) _p(0.3 + 0.27 * math.sin(4 * math.pi * k / 48), 0.5 - 0.5 * math.cos(2 * math.pi * k / 48))],
  ]),
  _g('8', [
    _join([_arc(0.3, 0.25, 0.22, 0.25, 90, -270), _arc(0.3, 0.75, 0.27, 0.25, -90, 270)]),
  ]),
  _g('9', [
    _join([
      _arc(0.3, 0.28, 0.27, 0.28, 0, -360),
      _poly([0.57, 0.28, 0.52, 1]),
    ]),
  ]),
  _g('9', [
    _join([_arc(0.3, 0.28, 0.27, 0.28, 10, -355), _bez(0.57, 0.25, 0.6, 0.6, 0.55, 0.9, 0.2, 1)]),
  ]),

  // Operators and brackets.
  _g('+', [
    _poly([0.5, 0.1, 0.5, 0.9]),
    _poly([0.1, 0.5, 0.9, 0.5]),
  ]),
  _g('+', [
    _poly([0.1, 0.5, 0.9, 0.5]),
    _poly([0.5, 0.1, 0.5, 0.9]),
  ]),
  _g('-', [
    _poly([0, 0.5, 0.8, 0.5]),
  ]),
  _g('x', [
    _poly([0.15, 0.15, 0.85, 0.85]),
    _poly([0.85, 0.15, 0.15, 0.85]),
  ]),
  _g('x', [_bez(0, 0, 0.45, 0.2, 0.45, 0.8, 0, 1), _bez(0.8, 0, 0.35, 0.2, 0.35, 0.8, 0.8, 1)]),
  _g('÷', [
    _poly([0.1, 0.5, 0.9, 0.5]),
    _dot(0.5, 0.18),
    _dot(0.5, 0.82),
  ]),
  _g('=', [
    _poly([0.1, 0.35, 0.9, 0.35]),
    _poly([0.1, 0.65, 0.9, 0.65]),
  ]),
  _g('<', [
    _poly([0.8, 0.1, 0.1, 0.5, 0.8, 0.9]),
  ]),
  _g('>', [
    _poly([0.1, 0.1, 0.8, 0.5, 0.1, 0.9]),
  ]),
  _g('(', [_arc(0.55, 0.5, 0.45, 0.62, 235, 125)]),
  _g(')', [_arc(-0.05, 0.5, 0.45, 0.62, -55, 55)]),
  _g('[', [
    _poly([0.45, 0, 0.1, 0, 0.1, 1, 0.45, 1]),
  ]),
  _g(']', [
    _poly([0.05, 0, 0.4, 0, 0.4, 1, 0.05, 1]),
  ]),
  _g('^', [
    _poly([0.1, 0.6, 0.4, 0.05, 0.7, 0.6]),
  ]),
  _g('!', [
    _poly([0.2, 0, 0.2, 0.72]),
    _dot(0.2, 0.96),
  ]),
  _g('.', [_dot(0.2, 0.96)]),

  // Letters (x-height from 0 to 1).
  _g('y', [
    _poly([0, 0, 0.36, 0.62]),
    _poly([0.72, 0, 0.1, 1.45]),
  ]),
  _g('y', [
    _join([_bez(0, 0, 0, 0.8, 0.55, 0.8, 0.6, 0), _bez(0.6, 0, 0.62, 0.9, 0.6, 1.5, 0.12, 1.3)]),
  ]),
  _g('z', [
    _poly([0, 0, 0.7, 0, 0, 0.9, 0.72, 0.9]),
  ]),
  _g('z', [
    _poly([0, 0, 0.7, 0, 0, 0.9, 0.72, 0.9]),
    _poly([0.15, 0.45, 0.55, 0.45]),
  ]),
  _g('a', [
    _join([
      _arc(0.3, 0.52, 0.28, 0.46, -20, -380),
      _poly([0.57, 0.05, 0.6, 1]),
    ]),
  ]),
  _g('a', [
    _join([
      _bez(0.08, 0.1, 0.4, -0.12, 0.6, 0.1, 0.58, 0.45),
      _poly([0.58, 0.45, 0.6, 1]),
      _bez(0.58, 0.5, 0.3, 0.35, -0.05, 0.6, 0.15, 0.95),
      _bez(0.15, 0.95, 0.35, 1.05, 0.55, 0.9, 0.58, 0.75),
    ]),
  ]),
  _g('b', [
    _join([
      _poly([0.05, -0.65, 0.05, 1, 0.06, 0.5]),
      _arc(0.3, 0.6, 0.26, 0.42, 200, 520),
    ]),
  ]),
  _g('c', [_arc(0.36, 0.5, 0.34, 0.5, -40, -320)]),
  _g('n', [
    _join([
      _poly([0, 0, 0, 1, 0, 0.32]),
      _arc(0.3, 0.36, 0.3, 0.32, 180, 360),
      _poly([0.6, 0.36, 0.6, 1]),
    ]),
  ]),

  // Greek letters.
  _g('α', [
    _join([_bez(0.8, 0, 0.45, 1.05, -0.05, 1, 0.05, 0.45), _bez(0.05, 0.45, 0.12, -0.05, 0.5, 0, 0.86, 1)]),
  ]),
  _g('β', [
    _join([
      _poly([0.08, 1.45, 0.08, -0.3]),
      _bez(0.08, -0.3, 0.15, -0.68, 0.75, -0.55, 0.55, -0.05),
      _bez(0.55, -0.05, 0.45, 0.15, 0.3, 0.15, 0.25, 0.15),
      _bez(0.25, 0.15, 0.95, 0.15, 0.85, 1, 0.1, 0.85),
    ]),
  ]),
  _g('θ', [
    _arc(0.3, 0.5, 0.28, 0.55, -90, 270),
    _poly([0.04, 0.5, 0.56, 0.5]),
  ]),
  _g('θ', [
    _join([
      _arc(0.3, 0.5, 0.28, 0.55, -90, 270),
      _poly([0.3, -0.05, 0.04, 0.5, 0.56, 0.5]),
    ]),
  ]),
  _g('π', [
    _poly([0, 0.1, 0.82, 0.04]),
    _poly([0.25, 0.08, 0.2, 1]),
    _poly([0.58, 0.07, 0.62, 0.92, 0.72, 1]),
  ]),
  _g('π', [
    _join([
      _poly([0.25, 0.08, 0.2, 1]),
      _poly([0.2, 1, 0.22, 0.1, 0.62, 0.06, 0.62, 1]),
    ]),
    _poly([0, 0.1, 0.82, 0.04]),
  ]),
  _g('λ', [
    _poly([0.1, -0.4, 0.8, 1]),
    _poly([0.42, 0.3, 0.04, 1]),
  ]),
  _g('μ', [
    _poly([0.05, 0, 0.05, 1.45]),
    _join([
      _poly([0.6, 0, 0.6, 0.72]),
      _bez(0.6, 0.72, 0.55, 1.05, 0.1, 1.05, 0.05, 0.62),
    ]),
  ]),
  _g('μ', [
    _join([
      _poly([0.05, 1.45, 0.05, 0]),
      _poly([0.05, 0, 0.05, 0.62]),
      _bez(0.05, 0.62, 0.1, 1.05, 0.55, 1.05, 0.6, 0.6),
      _poly([0.6, 0.6, 0.6, 0, 0.62, 0.9, 0.75, 1]),
    ]),
  ]),
  _g('σ', [
    _join([
      _poly([0.88, 0.2, 0.3, 0.22]),
      _arc(0.3, 0.6, 0.27, 0.38, -90, -450),
    ]),
  ]),
  _g('Δ', [
    _poly([0.4, 0, 0, 1, 0.8, 1, 0.4, 0]),
  ]),
  _g('Δ', [
    _poly([0.4, 0, 0, 1]),
    _poly([0.4, 0, 0.8, 1]),
    _poly([0, 1, 0.8, 1]),
  ]),

  // Big operators.
  _g('√', [
    _poly([0, 0.6, 0.12, 0.5, 0.3, 1, 0.5, 0, 1.1, 0]),
  ]),
  _g('√', [
    _poly([0, 0.6, 0.12, 0.5, 0.3, 1, 0.55, -0.1]),
  ]),
  _g('∫', [
    _join([_bez(0.6, 0, 0.4, -0.15, 0.35, 0.2, 0.3, 0.5), _bez(0.3, 0.5, 0.25, 0.8, 0.2, 1.15, 0, 1)]),
  ]),
  _g('Σ', [
    _poly([0.72, 0, 0, 0, 0.4, 0.5, 0, 1, 0.76, 1]),
  ]),
];

/// The symbols, in a fixed order.
List<String> get glyphSymbols => {for (final g in glyphVariants) g.symbol}.toList();

// --- Synthesis ------------------------------------------------------------------------------

/// A tiny seeded random generator (xorshift32), the same on every platform and Dart version,
/// so the templates can be made again bit for bit.
class SeededRandom {
  SeededRandom(int seed) : _s = (seed * 2654435761 + 1) & 0xFFFFFFFF {
    if (_s == 0) _s = 0x9E3779B9;
    for (var i = 0; i < 8; i++) {
      nextDouble();
    }
  }

  int _s;

  /// 0 ≤ value < 1.
  double nextDouble() {
    var x = _s;
    x ^= (x << 13) & 0xFFFFFFFF;
    x ^= x >> 17;
    x ^= (x << 5) & 0xFFFFFFFF;
    _s = x & 0xFFFFFFFF;
    return _s / 4294967296.0;
  }

  /// Uniform in [-1, 1).
  double signed() => nextDouble() * 2 - 1;

  bool nextBool() => nextDouble() < 0.5;
}

/// One handwritten-looking sample of [g]: slanted, turned, squashed, wobbled, with strokes that
/// over- or undershoot and do not quite meet. [strength] scales every distortion (1 is the
/// training set; the held-out test uses more). Strokes come out in a random order and
/// direction, as people write them.
List<GlyphStroke> synthesize(GlyphVariant g, SeededRandom r, {double strength = 1}) {
  final k = strength;
  final rot = r.signed() * 0.12 * k; // about ±7°
  final slant = r.signed() * 0.22 * k;
  final sx = 1 + r.signed() * 0.14 * k, sy = 1 + r.signed() * 0.1 * k;
  // A smooth wobble: two sine waves across the glyph in each direction.
  final w = [for (var i = 0; i < 8; i++) r.nextDouble()];
  final amp = 0.028 * k;
  Pt warp(Pt p) {
    final wx = amp * (math.sin(p.y * (2 + 3 * w[0]) + w[1] * 6) + 0.6 * math.sin(p.x * (3 + 4 * w[2]) + w[3] * 6));
    final wy = amp * (math.sin(p.x * (2 + 3 * w[4]) + w[5] * 6) + 0.6 * math.sin(p.y * (3 + 4 * w[6]) + w[7] * 6));
    final x = (p.x + wx) * sx + (p.y + wy) * slant, y = (p.y + wy) * sy;
    final c = math.cos(rot), s = math.sin(rot);
    return (x: x * c - y * s, y: x * s + y * c);
  }

  final out = <GlyphStroke>[];
  for (final stroke in g.strokes) {
    // Each stroke lands a little off where it should (strokes do not quite meet).
    final dx = r.signed() * 0.04 * k, dy = r.signed() * 0.04 * k;
    var pts = [for (final p in stroke) warp((x: p.x + dx, y: p.y + dy))];
    if (pts.length > 4) {
      // Over- or undershoot at both ends.
      pts = _trimOrExtend(pts, r.signed() * 0.08 * k, atStart: true);
      pts = _trimOrExtend(pts, r.signed() * 0.08 * k, atStart: false);
    }
    // A shaky hand and an uneven pen sampling rate.
    final step = 1 + (r.nextDouble() * 2).floor();
    pts = [
      for (var i = 0; i < pts.length; i += step) (x: pts[i].x + r.signed() * 0.006 * k, y: pts[i].y + r.signed() * 0.006 * k),
      if ((pts.length - 1) % step != 0) pts.last,
    ];
    if (r.nextBool()) pts = pts.reversed.toList();
    out.add(pts);
  }
  // Strokes in another order now and then.
  if (out.length > 1 && r.nextBool()) out.insert(0, out.removeLast());
  return out;
}

/// Lengthens (positive [f]) or shortens (negative) a stroke by [f] of its length at one end.
List<Pt> _trimOrExtend(List<Pt> pts, double f, {required bool atStart}) {
  final p = atStart ? pts.reversed.toList() : List.of(pts);
  var len = 0.0;
  for (var i = 1; i < p.length; i++) {
    len += math.sqrt(math.pow(p[i].x - p[i - 1].x, 2) + math.pow(p[i].y - p[i - 1].y, 2));
  }
  if (f >= 0) {
    final a = p[p.length - 2], b = p.last;
    final d = math.sqrt(math.pow(b.x - a.x, 2) + math.pow(b.y - a.y, 2));
    if (d > 0) p.add((x: b.x + (b.x - a.x) / d * len * f, y: b.y + (b.y - a.y) / d * len * f));
  } else {
    var cut = -f * len;
    while (p.length > 3 && cut > 0) {
      final a = p[p.length - 2], b = p.last;
      cut -= math.sqrt(math.pow(b.x - a.x, 2) + math.pow(b.y - a.y, 2));
      p.removeLast();
    }
  }
  return atStart ? p.reversed.toList() : p;
}
