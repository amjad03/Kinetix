import 'dart:math' as math;
import 'dart:typed_data';

import 'symbol_glyphs.dart';
import 'symbol_templates.g.dart';

/// Reads one handwritten maths symbol: digits, + − × ÷ = < > ( ) [ ], x y z a b c n, the Greek
/// letters α β θ π λ μ σ Δ, √ ∫ Σ, the fraction bar, the decimal point, ^ and !.
///
/// Pure Dart and on the board itself: it works on every platform with no download and no
/// network. It is a $P point-cloud recogniser (Vatavu, Anthony and Wobbrock, 2012): the ink is
/// resampled to 32 points, scaled and centred, and matched against bundled templates
/// (symbol_templates.g.dart, made by tool/generate_symbol_templates.dart from the outlines in
/// symbol_glyphs.dart). A point cloud does not care about stroke order or direction, which
/// suits handwriting. Shapes a point cloud cannot tell apart by themselves are decided first
/// from geometry: a dot (by its size against the line), a bar, = and ÷.
///
/// It returns "x" for both the letter and the times sign, and "-" for both a minus and a
/// fraction bar: the layout (math_ink.dart) tells them apart by their neighbours.

/// A reading of one symbol: what it is and how sure (0–1, higher is better).
class SymbolGuess {
  const SymbolGuess(this.symbol, this.score);

  final String symbol;
  final double score;

  @override
  String toString() => '$symbol ${score.toStringAsFixed(2)}';
}

/// Points per cloud.
const symbolCloudSize = 32;

class _Template {
  _Template(this.symbol, this.strokes, this.xs, this.ys) : grid = _grid(xs, ys);

  final String symbol;

  /// How many strokes it was written with.
  final int strokes;
  final Float64List xs, ys;
  final Float64List grid;
}

class SymbolRecognizer {
  /// A recogniser with [templates] as (symbol, code) pairs (see [generateSymbolTemplates]); the bundled ones by default.
  SymbolRecognizer({List<(String, String)>? templates}) : _templates = [for (final (s, code) in templates ?? bundledSymbolTemplates) _decode(s, code)];

  /// The shared recogniser with the bundled templates (built on first use).
  static final SymbolRecognizer instance = SymbolRecognizer();

  final List<_Template> _templates;

  /// Symbols it knows.
  Set<String> get symbols => {for (final t in _templates) t.symbol};

  /// Readings of [strokes], best first, at most [limit]. [lineHeight] is the height of ordinary
  /// symbols around it (same units as the ink); without it a dot cannot be told from a tiny
  /// symbol.
  List<SymbolGuess> recognize(List<GlyphStroke> strokes, {double? lineHeight, int limit = 5}) {
    final ink = [
      for (final s in strokes)
        if (s.isNotEmpty) s,
    ];
    if (ink.isEmpty) return const [];
    final geo = _geometric(ink, lineHeight);
    if (geo != null && geo.score >= 1) return [geo];
    final cloud = normalizeCloud(ink);
    if (cloud == null) return geo == null ? const [] : [geo];
    final (xs, ys) = cloud;
    final g = _grid(xs, ys);
    // Coarse first: only the closest templates by ink layout get the full match.
    final order = [for (var i = 0; i < _templates.length; i++) i]
      ..sort((a, b) => _gridDistance(g, _templates[a].grid).compareTo(_gridDistance(g, _templates[b].grid)));
    final best = <String, double>{};
    var bound = double.infinity;
    for (final i in order.take(72)) {
      final t = _templates[i];
      // Written with another number of strokes: possible (people differ), but less likely.
      final k = 1 + 0.12 * (t.strokes - ink.length).abs();
      final d = _greedyMatch(xs, ys, t.xs, t.ys, math.min(bound * 3, best[t.symbol] ?? double.infinity) / k) * k;
      if (d < (best[t.symbol] ?? double.infinity)) best[t.symbol] = d;
      if (d < bound) bound = d;
    }
    final ranked = best.entries.toList()..sort((a, b) => a.value.compareTo(b.value));
    return [
      ?geo,
      for (final e in ranked)
        if (e.key != geo?.symbol) SymbolGuess(e.key, 1 / (1 + e.value)),
    ].take(limit).toList();
  }

  /// The best reading, or null for no ink.
  String? read(List<GlyphStroke> strokes, {double? lineHeight}) => recognize(strokes, lineHeight: lineHeight, limit: 1).firstOrNull?.symbol;
}

// --- Geometry first -------------------------------------------------------------------------

({double l, double t, double r, double b}) _box(Iterable<Pt> pts) {
  var l = double.infinity, t = double.infinity, r = -double.infinity, b = -double.infinity;
  for (final p in pts) {
    l = math.min(l, p.x);
    t = math.min(t, p.y);
    r = math.max(r, p.x);
    b = math.max(b, p.y);
  }
  return (l: l, t: t, r: r, b: b);
}

double _len(List<Pt> s) {
  var l = 0.0;
  for (var i = 1; i < s.length; i++) {
    l += _dist(s[i], s[i - 1]);
  }
  return l;
}

double _dist(Pt a, Pt b) => math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));

/// A straight, level stroke.
bool _flat(List<Pt> s) {
  final b = _box(s);
  final w = b.r - b.l, h = b.b - b.t;
  final len = _len(s);
  return w > 0 && h < w * 0.28 && len > 0 && _dist(s.first, s.last) / len > 0.85;
}

/// A straight, upright stroke.
bool _upright(List<Pt> s) {
  final b = _box(s);
  final w = b.r - b.l, h = b.b - b.t;
  final len = _len(s);
  return h > 0 && w < h * 0.35 && len > 0 && _dist(s.first, s.last) / len > 0.85;
}

/// Shapes a point cloud cannot judge alone: a dot (by its size), a bar, = , ÷ and !.
SymbolGuess? _geometric(List<GlyphStroke> ink, double? lineHeight) {
  final all = _box([for (final s in ink) ...s]);
  final size = math.max(all.r - all.l, all.b - all.t);
  if (lineHeight != null && size < lineHeight * 0.22) return const SymbolGuess('.', 1);
  bool tiny(List<Pt> s, double ref) {
    final b = _box(s);
    return math.max(b.r - b.l, b.b - b.t) < ref * 0.3;
  }

  if (ink.length == 1 && _flat(ink[0])) return const SymbolGuess('-', 1);
  if (ink.length == 2 && _flat(ink[0]) && _flat(ink[1])) {
    final a = _box(ink[0]), b = _box(ink[1]);
    final wide = math.max(a.r - a.l, b.r - b.l), narrow = math.min(a.r - a.l, b.r - b.l);
    final overlap = math.min(a.r, b.r) - math.max(a.l, b.l);
    final gap = ((a.t + a.b) / 2 - (b.t + b.b) / 2).abs();
    if (overlap > narrow * 0.5 && narrow > wide * 0.45 && gap > wide * 0.08 && gap < wide * 1.1) return const SymbolGuess('=', 1);
  }
  if (ink.length == 3) {
    final bars = [
      for (final s in ink)
        if (_flat(s)) s,
    ];
    if (bars.length == 1) {
      final bar = _box(bars.first);
      final w = bar.r - bar.l, y = (bar.t + bar.b) / 2;
      final dots = [
        for (final s in ink)
          if (!identical(s, bars.first) && tiny(s, w)) _box(s),
      ];
      if (dots.length == 2 && dots.any((d) => d.b < y) && dots.any((d) => d.t > y) && dots.every((d) => (d.l + d.r) / 2 > bar.l && (d.l + d.r) / 2 < bar.r)) {
        return const SymbolGuess('÷', 1);
      }
    }
  }
  if (ink.length == 2) {
    for (final (stem, dot) in [(ink[0], ink[1]), (ink[1], ink[0])]) {
      final sb = _box(stem), db = _box(dot);
      final h = sb.b - sb.t;
      if (_upright(stem) && tiny(dot, h) && db.t > sb.t + h * 0.6 && (db.l + db.r) / 2 > sb.l - h * 0.3 && (db.l + db.r) / 2 < sb.r + h * 0.3) {
        return const SymbolGuess('!', 1);
      }
    }
  }
  return null;
}

// --- $P ---------------------------------------------------------------------------------------

/// [strokes] as a $P cloud: [symbolCloudSize] points spread along the ink by length (a dot
/// keeps one point of its own), scaled so the longer side is 1, centred on the origin. Null when
/// there is no ink.
(Float64List, Float64List)? normalizeCloud(List<GlyphStroke> strokes) {
  const n = symbolCloudSize;
  final all = _box([for (final s in strokes) ...s]);
  final size = math.max(all.r - all.l, all.b - all.t);
  if (!size.isFinite) return null;
  final lens = [for (final s in strokes) _len(s)];
  final total = lens.fold(0.0, (a, b) => a + b);
  final dots = [for (var i = 0; i < strokes.length; i++) lens[i] < size * 0.06 || total == 0];
  final dotCount = dots.where((d) => d).length;
  final m = n - dotCount;
  final longTotal = [
    for (var i = 0; i < strokes.length; i++)
      if (!dots[i]) lens[i],
  ].fold(0.0, (a, b) => a + b);
  // Points per stroke, by length, adding up to m.
  final counts = [for (var i = 0; i < strokes.length; i++) dots[i] || longTotal == 0 ? 0 : math.max(2, (lens[i] / longTotal * m).round())];
  if (m > 0 && longTotal > 0) {
    var diff = m - counts.fold(0, (a, b) => a + b);
    while (diff != 0) {
      // Give or take a point from the longest stroke that can spare one.
      var bi = -1;
      for (var i = 0; i < counts.length; i++) {
        if (dots[i] || (diff < 0 && counts[i] <= 2)) continue;
        if (bi < 0 || lens[i] > lens[bi]) bi = i;
      }
      if (bi < 0) break;
      counts[bi] += diff > 0 ? 1 : -1;
      diff -= diff > 0 ? 1 : -1;
    }
  }
  final pts = <Pt>[];
  for (var i = 0; i < strokes.length; i++) {
    final s = strokes[i];
    if (dots[i]) {
      pts.add((x: s.map((p) => p.x).reduce((a, b) => a + b) / s.length, y: s.map((p) => p.y).reduce((a, b) => a + b) / s.length));
    } else {
      pts.addAll(_resample(s, counts[i]));
    }
  }
  while (pts.length < n) {
    pts.add(pts.last);
  }
  if (pts.length > n) pts.removeRange(n, pts.length);
  final s = size == 0 ? 1.0 : size;
  var cx = 0.0, cy = 0.0;
  for (final p in pts) {
    cx += (p.x - all.l) / s;
    cy += (p.y - all.t) / s;
  }
  cx /= n;
  cy /= n;
  final xs = Float64List(n), ys = Float64List(n);
  for (var i = 0; i < n; i++) {
    xs[i] = (pts[i].x - all.l) / s - cx;
    ys[i] = (pts[i].y - all.t) / s - cy;
  }
  return (xs, ys);
}

/// [k] points evenly along a stroke.
List<Pt> _resample(List<Pt> s, int k) {
  if (k <= 0) return const [];
  final len = _len(s);
  if (k == 1 || len == 0) return [s[s.length ~/ 2]];
  final step = len / (k - 1);
  final out = <Pt>[s.first];
  var acc = 0.0;
  var prev = s.first;
  for (var i = 1; i < s.length && out.length < k; i++) {
    var cur = s[i];
    var d = _dist(prev, cur);
    while (acc + d >= step && d > 0 && out.length < k) {
      final t = (step - acc) / d;
      final q = (x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t);
      out.add(q);
      prev = q;
      d = _dist(prev, cur);
      acc = 0;
    }
    acc += d;
    prev = cur;
  }
  while (out.length < k) {
    out.add(s.last);
  }
  return out;
}

/// The $P greedy cloud match: the smaller of the two directions' weighted distances, tried from
/// several starting points. Stops early once past [bound].
double _greedyMatch(Float64List ax, Float64List ay, Float64List bx, Float64List by, double bound) {
  const n = symbolCloudSize;
  final step = math.sqrt(n).floor();
  var best = bound;
  for (var i = 0; i < n; i += step) {
    final d1 = _cloudDistance(ax, ay, bx, by, i, best);
    if (d1 < best) best = d1;
    final d2 = _cloudDistance(bx, by, ax, ay, i, best);
    if (d2 < best) best = d2;
  }
  return best;
}

final _matched = List<bool>.filled(symbolCloudSize, false);

double _cloudDistance(Float64List ax, Float64List ay, Float64List bx, Float64List by, int start, double bound) {
  const n = symbolCloudSize;
  _matched.fillRange(0, n, false);
  var sum = 0.0;
  var i = start;
  var weight = n;
  do {
    var min = double.infinity;
    var index = -1;
    for (var j = 0; j < n; j++) {
      if (_matched[j]) continue;
      final dx = ax[i] - bx[j], dy = ay[i] - by[j];
      final d = dx * dx + dy * dy;
      if (d < min) {
        min = d;
        index = j;
      }
    }
    _matched[index] = true;
    sum += weight-- / n * math.sqrt(min);
    if (sum >= bound) return sum;
    i = (i + 1) % n;
  } while (i != start);
  return sum;
}

// --- Coarse filter --------------------------------------------------------------------------

const _cells = 6;

/// Where the ink lies, as a 6 × 6 grid of shares, plus the cloud's width and height.
Float64List _grid(Float64List xs, Float64List ys) {
  final g = Float64List(_cells * _cells + 2);
  var minX = double.infinity, maxX = -double.infinity, minY = double.infinity, maxY = -double.infinity;
  for (var i = 0; i < xs.length; i++) {
    minX = math.min(minX, xs[i]);
    maxX = math.max(maxX, xs[i]);
    minY = math.min(minY, ys[i]);
    maxY = math.max(maxY, ys[i]);
  }
  for (var i = 0; i < xs.length; i++) {
    final cx = ((xs[i] + 0.6) / 1.2 * _cells).floor().clamp(0, _cells - 1);
    final cy = ((ys[i] + 0.6) / 1.2 * _cells).floor().clamp(0, _cells - 1);
    g[cy * _cells + cx] += 1 / xs.length;
  }
  g[_cells * _cells] = (maxX - minX) * 2;
  g[_cells * _cells + 1] = (maxY - minY) * 2;
  return g;
}

double _gridDistance(Float64List a, Float64List b) {
  var d = 0.0;
  for (var i = 0; i < a.length; i++) {
    d += (a[i] - b[i]).abs();
  }
  return d;
}

// --- Templates ------------------------------------------------------------------------------

/// Characters for coordinates in the bundled templates: printable ASCII without quotes,
/// backslash or dollar, so each template is a plain Dart string.
final String _alphabet = String.fromCharCodes([
  for (var c = 33; c <= 126; c++)
    if (c != 34 && c != 39 && c != 92 && c != 36) c,
]);

/// A normalised cloud as a string: two characters per point.
String encodeCloud(Float64List xs, Float64List ys) {
  final q = _alphabet.length - 1;
  final b = StringBuffer();
  for (var i = 0; i < xs.length; i++) {
    b
      ..write(_alphabet[((xs[i] + 1) / 2 * q).round().clamp(0, q)])
      ..write(_alphabet[((ys[i] + 1) / 2 * q).round().clamp(0, q)]);
  }
  return b.toString();
}

/// A template from its code: the number of strokes (one digit), then the cloud.
_Template _decode(String symbol, String code) {
  final q = _alphabet.length - 1;
  final n = (code.length - 1) ~/ 2;
  final xs = Float64List(n), ys = Float64List(n);
  for (var i = 0; i < n; i++) {
    xs[i] = _alphabet.indexOf(code[1 + 2 * i]) / q * 2 - 1;
    ys[i] = _alphabet.indexOf(code[2 + 2 * i]) / q * 2 - 1;
  }
  return _Template(symbol, int.parse(code[0]), xs, ys);
}

/// The templates: for every way of writing every symbol, the clean outline and [perVariant]
/// synthesised samples made with [seed]. Same seed, same templates, on any machine.
List<(String, String)> generateSymbolTemplates({int seed = 1, int perVariant = 10}) {
  final r = SeededRandom(seed);
  final out = <(String, String)>[];
  for (final v in glyphVariants) {
    // A dot has no shape to match: it is told by its size (see _geometric).
    if (v.symbol == '.') continue;
    for (var k = 0; k <= perVariant; k++) {
      final strokes = k == 0 ? v.strokes : synthesize(v, r);
      final c = normalizeCloud(strokes);
      if (c != null) out.add((v.symbol, '${strokes.length}${encodeCloud(c.$1, c.$2)}'));
    }
  }
  return out;
}

/// The Dart source of symbol_templates.g.dart for [templates].
String symbolTemplatesSource(List<(String, String)> templates) {
  final b = StringBuffer()
    ..writeln('// GENERATED by tool/generate_symbol_templates.dart from symbol_glyphs.dart. Do not edit.')
    ..writeln('//')
    ..writeln("// Point clouds of the AI pen's maths symbols (${templates.length} templates, $symbolCloudSize points each, two")
    ..writeln('// characters per point after the number of strokes; see encodeCloud in symbol_recognizer.dart).')
    ..writeln()
    ..writeln('const bundledSymbolTemplates = <(String, String)>[');
  for (final (s, code) in templates) {
    b.writeln("  ('$s', r'$code'),");
  }
  b.writeln('];');
  return b.toString();
}
