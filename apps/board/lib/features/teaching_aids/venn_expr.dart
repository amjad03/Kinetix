import 'dart:math' as math;
import 'dart:ui';

/// The set-notation symbols the Venn tool understands, in the order the panel offers them.
const vennSymbols = ['∪', '∩', '∖', '′', '⊂', '⊆', '⊃', '⊇', '∈', '∉', '∅', 'U', 'Δ'];

/// What an expression means on a Venn diagram. A region is a bit mask of the sets it lies in
/// (A = 1, B = 2, C = 4; 0 is outside every set but inside the universe).
class VennResult {
  const VennResult({this.shade = const {}, this.second = const {}, this.empty = const {}, this.element, this.error, this.relation});

  /// Regions to shade (a set expression; the left side of a relation).
  final Set<int> shade;

  /// The right side of a relation, shaded in a second colour.
  final Set<int> second;

  /// Regions that must hold nothing for a subset relation to be true.
  final Set<int> empty;

  /// For `x ∈ S` and `x ∉ S`: the element's name and the region it is drawn in.
  final (String, int)? element;

  /// Why the expression could not be read (null when it can).
  final String? error;

  /// The relation symbol when the expression is a statement rather than a set.
  final String? relation;

  bool get ok => error == null;
}

/// Reads [text] as a set expression or statement over [sets] sets (2 or 3), for example
/// `A ∩ B′`, `(A ∪ B) ∖ C`, `A Δ B`, `A ⊆ B`, `x ∈ A ∩ B`. ASCII stand-ins work too: `'` for ′,
/// `\` for ∖.
VennResult parseVenn(String text, {int sets = 3}) {
  final all = {for (var m = 0; m < (1 << sets); m++) m};
  Set<int> setOf(int bit) => {for (final m in all) if (m & bit != 0) m};
  final src = text.replaceAll("'", '′').replaceAll(r'\', '∖').trim();
  if (src.isEmpty) return const VennResult();
  final toks = <String>[];
  for (final r in src.runes) {
    final ch = String.fromCharCode(r);
    if (ch.trim().isEmpty) {
      toks.add(' ');
    } else if (RegExp(r'[A-Za-z0-9_]').hasMatch(ch)) {
      if (toks.isNotEmpty && RegExp(r'^[A-Za-z0-9_]+$').hasMatch(toks.last)) {
        toks.last += ch;
      } else {
        toks.add(ch);
      }
    } else {
      toks.add(ch);
    }
  }
  var i = 0;
  String? error;
  // Words are separated by spaces only when two names would touch; drop spaces otherwise.
  final t = <String>[];
  for (var k = 0; k < toks.length; k++) {
    if (toks[k] == ' ') {
      if (t.isNotEmpty && k + 1 < toks.length && RegExp(r'^[A-Za-z0-9_]+$').hasMatch(t.last) && RegExp(r'^[A-Za-z0-9_]+$').hasMatch(toks[k + 1])) t.add(' ');
      continue;
    }
    t.add(toks[k]);
  }
  String peek() => i < t.length ? t[i] : '';
  Set<int> fail(String e) {
    error ??= e;
    return const {};
  }

  late final Set<int> Function() exprRef;

  late Set<int> Function() expr;

  Set<int> atom() {
    final tok = peek();
    if (tok == '(') {
      i++;
      final v = exprRef();
      if (peek() != ')') return fail('close');
      i++;
      return v;
    }
    i++;
    switch (tok) {
      case 'A':
        return setOf(1);
      case 'B':
        return setOf(2);
      case 'C':
        return sets == 3 ? setOf(4) : fail('C');
      case 'U':
        return all;
      case '∅':
        return {};
    }
    return fail(tok.isEmpty ? 'end' : tok);
  }

  Set<int> factor() {
    var v = atom();
    while (peek() == '′') {
      i++;
      v = all.difference(v);
    }
    return v;
  }

  Set<int> term() {
    var v = factor();
    while (peek() == '∩') {
      i++;
      v = v.intersection(factor());
    }
    return v;
  }

  expr = () {
    var v = term();
    while (const ['∪', '∖', 'Δ'].contains(peek())) {
      final op = peek();
      i++;
      final r = term();
      v = switch (op) {
        '∪' => v.union(r),
        '∖' => v.difference(r),
        _ => v.union(r).difference(v.intersection(r)),
      };
    }
    return v;
  };

  exprRef = expr;

  // x ∈ S / x ∉ S: a name that is not a set, then the membership symbol.
  if (t.length >= 3 && RegExp(r'^[a-z0-9_]+$').hasMatch(t[0]) && (t[1] == '∈' || t[1] == '∉')) {
    final name = t[0];
    final rel = t[1];
    i = 2;
    final s = expr();
    if (error != null || i < t.length) return VennResult(error: error ?? t[i]);
    final home = rel == '∈' ? s : all.difference(s);
    if (home.isEmpty) return VennResult(error: 'empty', relation: rel);
    // Prefer the region with the most sets for ∈, the outside for ∉.
    final pick = (home.toList()..sort((a, b) => rel == '∈' ? _bits(b) - _bits(a) : _bits(a) - _bits(b))).first;
    return VennResult(shade: s, element: (name, pick), relation: rel);
  }

  final left = expr();
  if (error != null) return VennResult(error: error);
  if (i == t.length) return VennResult(shade: left);
  final rel = peek();
  if (!const ['⊂', '⊆', '⊃', '⊇'].contains(rel)) return VennResult(error: rel);
  i++;
  final right = expr();
  if (error != null) return VennResult(error: error);
  if (i < t.length) return VennResult(error: t[i]);
  final sub = rel == '⊂' || rel == '⊆';
  return VennResult(shade: sub ? left : right, second: sub ? right : left, empty: sub ? left.difference(right) : right.difference(left), relation: rel);
}

int _bits(int m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);

/// The drawing of a Venn diagram: where its circles and regions are, in board units.
class VennGeometry {
  VennGeometry(this.sets)
    : centres = sets == 2 ? const [Offset(230, 210), Offset(370, 210)] : const [Offset(230, 190), Offset(370, 190), Offset(300, 310)],
      radius = sets == 2 ? 130 : 120,
      universe = sets == 2 ? const Rect.fromLTRB(20, 20, 580, 400) : const Rect.fromLTRB(20, 20, 580, 475);

  final int sets;
  final List<Offset> centres;
  final double radius;
  final Rect universe;

  /// Where each set's name goes.
  List<Offset> get names => sets == 2 ? const [Offset(180, 55), Offset(420, 55)] : const [Offset(130, 48), Offset(470, 48), Offset(300, 455)];

  /// A spot well inside each region, for marks, dots and region labels.
  Offset anchor(int mask) => (sets == 2
      ? const {1: Offset(150, 210), 2: Offset(450, 210), 3: Offset(300, 210), 0: Offset(60, 365)}
      : const {1: Offset(170, 150), 2: Offset(430, 150), 4: Offset(300, 375), 3: Offset(300, 135), 5: Offset(238, 268), 6: Offset(362, 268), 7: Offset(300, 232), 0: Offset(60, 445)})[mask]!;

  /// The outline of one region as a polygon (with a seam where it has a hole).
  List<Offset> regionPolygon(int mask) {
    var path = Path()..addRect(universe);
    for (var s = 0; s < sets; s++) {
      final circle = Path()..addOval(Rect.fromCircle(center: centres[s], radius: radius));
      path = Path.combine(mask & (1 << s) != 0 ? PathOperation.intersect : PathOperation.difference, path, circle);
    }
    final loops = <List<Offset>>[];
    for (final m in path.computeMetrics()) {
      final n = math.max(12, (m.length / 5).ceil());
      loops.add([for (var k = 0; k < n; k++) m.getTangentForOffset(m.length * k / n)!.position]);
    }
    if (loops.isEmpty) return const [];
    double area(List<Offset> p) {
      var a = 0.0;
      for (var k = 0; k < p.length; k++) {
        final q = p[(k + 1) % p.length];
        a += p[k].dx * q.dy - q.dx * p[k].dy;
      }
      return a / 2;
    }

    loops.sort((a, b) => area(b).abs().compareTo(area(a).abs()));
    var outer = area(loops.first) < 0 ? loops.first.reversed.toList() : loops.first;
    for (final hole0 in loops.skip(1)) {
      final hole = area(hole0) > 0 ? hole0.reversed.toList() : hole0;
      var bi = 0, bj = 0;
      var best = double.infinity;
      for (var a = 0; a < outer.length; a++) {
        for (var b = 0; b < hole.length; b++) {
          final d = (outer[a] - hole[b]).distanceSquared;
          if (d < best) {
            best = d;
            bi = a;
            bj = b;
          }
        }
      }
      outer = [...outer.sublist(0, bi + 1), for (var k = 0; k <= hole.length; k++) hole[(bj + k) % hole.length], ...outer.sublist(bi)];
    }
    return outer;
  }
}
