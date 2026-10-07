import 'dart:math' as math;
import 'dart:ui';

import '../ink_models.dart';
import 'ink_parser.dart' show inkBounds, offsetsOf;
import 'shape_fit.dart' show resampleBy, segmentDistance;
import 'symbol_glyphs.dart' show GlyphStroke;
import 'symbol_recognizer.dart';

/// Handwritten maths, read symbol by symbol and laid out the way it was written.
///
/// Text recognisers read a handwritten "+" as "t" and know nothing of stacked fractions or
/// raised powers. Here the layout comes from where the ink sits: a bar with ink above and below
/// is a fraction, a tick with a roof over ink is a square root, a small symbol raised after
/// another is a power. Each symbol in between is read by the on-board [SymbolRecognizer], so
/// this works on every platform with no handwriting model at all.
///
/// The result is a small tree ([MathNode]) that gives both the LaTeX for a [MathElement] and
/// the plain syntax of the maths solver (package:kinetix_math), e.g. `x^(2)+(1)/(2)`.

// --- The tree -------------------------------------------------------------------------------

sealed class MathNode {
  const MathNode();

  /// LaTeX, as a [MathElement] shows it.
  String get latex;

  /// The maths solver's syntax.
  String get plain;
}

/// One symbol: a digit, a letter, an operator or a bracket.
class MathSymbol extends MathNode {
  const MathSymbol(this.symbol, [this.guesses = const []]);

  /// What it reads as, after the layout's judgement ("×" for a cross between numbers).
  final String symbol;

  /// What the recogniser offered, best first (for other readings).
  final List<SymbolGuess> guesses;

  static const _tex = {
    '×': r'\times',
    '÷': r'\div',
    '·': r'\cdot',
    'α': r'\alpha',
    'β': r'\beta',
    'θ': r'\theta',
    'π': r'\pi',
    'λ': r'\lambda',
    'μ': r'\mu',
    'σ': r'\sigma',
    'Δ': r'\Delta',
    '∫': r'\int',
    'Σ': r'\sum',
    '√': r'\surd',
    '≤': r'\le',
    '≥': r'\ge',
    '[': '[',
    ']': ']',
  };

  @override
  String get latex => _tex[symbol] ?? symbol;

  @override
  String get plain => switch (symbol) {
    '·' => '×',
    _ => symbol,
  };

  bool get isDigit => symbol.length == 1 && symbol.codeUnitAt(0) >= 48 && symbol.codeUnitAt(0) <= 57;
  bool get isLetter => RegExp(r'^[a-zα-ωΔ]$').hasMatch(symbol);
  bool get isRelation => const {'=', '<', '>', '≤', '≥'}.contains(symbol);
  bool get isBinary => const {'+', '-', '×', '÷', '·'}.contains(symbol);
}

class MathRow extends MathNode {
  const MathRow(this.items);

  final List<MathNode> items;

  bool get isEmpty => items.isEmpty;

  @override
  String get latex {
    final b = StringBuffer();
    for (final n in items) {
      final t = n.latex;
      if (n is MathSymbol && (n.isRelation || n.isBinary) && b.isNotEmpty) {
        b.write(' $t ');
        continue;
      }
      // A command followed by a letter needs a space (\pi r, not \pir).
      if (b.isNotEmpty && RegExp(r'\\[a-zA-Z]+$').hasMatch(b.toString()) && RegExp(r'^[a-zA-Z0-9]').hasMatch(t)) b.write(' ');
      b.write(t);
    }
    return b.toString().trim().replaceAll(RegExp(' +'), ' ');
  }

  @override
  String get plain => items.map((n) => n.plain).join();
}

class MathFraction extends MathNode {
  const MathFraction(this.numerator, this.denominator);

  final MathRow numerator, denominator;

  @override
  String get latex => '\\frac{${numerator.latex}}{${denominator.latex}}';

  @override
  String get plain => '(${numerator.plain})/(${denominator.plain})';
}

class MathRoot extends MathNode {
  const MathRoot(this.radicand);

  final MathRow radicand;

  @override
  String get latex => '\\sqrt{${radicand.latex}}';

  @override
  String get plain => '√(${radicand.plain})';
}

class MathPower extends MathNode {
  const MathPower(this.base, this.exponent);

  final MathNode base;
  final MathRow exponent;

  @override
  String get latex {
    final b = base.latex;
    return '${base is MathFraction || base is MathRoot ? '\\left($b\\right)' : b}^{${exponent.latex}}';
  }

  @override
  String get plain {
    final e = exponent.plain;
    final b = base is MathSymbol ? base.plain : '(${base.plain})';
    return '$b^${e.length == 1 ? e : '($e)'}';
  }
}

/// A subscript: a small symbol written lowered just after a letter (x₁, aₙ, H₂O).
class MathSubscript extends MathNode {
  const MathSubscript(this.base, this.index);

  final MathNode base;
  final MathRow index;

  @override
  String get latex => '${base.latex}_{${index.latex}}';

  @override
  String get plain {
    final i = index.plain;
    return '${base.plain}_${i.length == 1 ? i : '($i)'}';
  }
}

/// Handwritten maths, read.
class MathReading {
  const MathReading(this.row, this.confidence, {this.alternatives = const []});

  final MathRow row;

  /// How sure the weakest symbol is (0–1).
  final double confidence;

  /// Other readings of the same ink, most likely first (one symbol read another way).
  final List<MathRow> alternatives;

  String get latex => row.latex;
  String get plain => row.plain;

  /// True when this is clearly maths, not a word: an operator, a relation, a fraction, a root,
  /// a power, or only digits.
  bool get looksLikeMaths {
    var symbols = 0, digits = 0;
    var structure = false;
    void walk(MathNode n) {
      switch (n) {
        case MathRow(:final items):
          items.forEach(walk);
        case MathFraction() || MathRoot() || MathPower() || MathSubscript():
          structure = true;
        case MathSymbol():
          symbols++;
          if (n.isDigit) digits++;
          if (n.isBinary || n.isRelation || const {'∫', 'Σ', '√', '!', '^'}.contains(n.symbol)) structure = true;
      }
    }

    walk(row);
    return structure || (symbols > 0 && digits == symbols && symbols >= 2);
  }
}

// --- Stroke facts ---------------------------------------------------------------------------

double _length(List<Offset> s) {
  var l = 0.0;
  for (var i = 1; i < s.length; i++) {
    l += (s[i] - s[i - 1]).distance;
  }
  return l;
}

double _straightness(List<Offset> s) {
  final l = _length(s);
  return l == 0 ? 0 : (s.last - s.first).distance / l;
}

/// A straight, level stroke: a minus, a fraction bar, half of an equals sign.
bool _isBar(List<Offset> s, double lineH) {
  final b = _boundsOf(s);
  return _straightness(s) > 0.85 && b.height < b.width * 0.3 && b.width > lineH * 0.25;
}

Rect _boundsOf(List<Offset> pts) {
  var r = Rect.fromPoints(pts.first, pts.first);
  for (final p in pts) {
    r = r.expandToInclude(Rect.fromPoints(p, p));
  }
  return r;
}

/// The height of ordinary symbols in [strokes]: the typical height of the upright ones (bars
/// and dots left out).
double lineHeightOf(List<Stroke> strokes) {
  final hs = <double>[];
  for (final s in strokes) {
    final b = inkBounds([s]);
    if (b.height > b.width * 0.35 && b.longestSide > 4) hs.add(b.height);
  }
  hs.sort();
  if (hs.isEmpty) return math.max(20, inkBounds(strokes).height);
  return math.max(12, hs[hs.length ~/ 2]);
}

// --- Units: symbols and the structures built from them --------------------------------------

class _Unit {
  _Unit.ink(Stroke s) : strokes = [s], box = inkBounds([s]), node = null;
  _Unit.node(this.node, this.box, this.strokes);

  final List<Stroke> strokes;
  final Rect box;

  /// A fraction or root built from other units; null for plain ink.
  final MathNode? node;

  bool get isInk => node == null;
  List<Offset> get points => offsetsOf(strokes.single);
}

/// Reads [strokes] as maths. [recognizer] reads the symbols (the bundled one by default).
MathReading readMathInk(List<Stroke> strokes, {SymbolRecognizer? recognizer}) {
  final reader = _Reader(recognizer ?? SymbolRecognizer.instance, lineHeightOf(strokes));
  final row = reader.row([for (final s in strokes) _Unit.ink(s)]);
  return MathReading(row, reader.weakest, alternatives: reader.alternatives(row));
}

class _Reader {
  _Reader(this.rec, this.lineH);

  final SymbolRecognizer rec;
  final double lineH;
  double weakest = 1;

  MathRow row(List<_Unit> units) {
    if (units.isEmpty) return const MathRow([]);
    var pool = _roots(units);
    pool = _fractions(pool);
    return _assemble(_symbols(pool));
  }

  // A square root: a tick, then a roof over what is inside. One stroke, or a tick and a
  // separate roof.
  List<_Unit> _roots(List<_Unit> units) {
    final pool = List.of(units);
    final ticks = [
      for (final u in pool)
        if (u.isInk) (u, _rootShape(u.points)),
    ].where((t) => t.$2 != null).toList()..sort((a, b) => a.$1.box.width.compareTo(b.$1.box.width));
    for (final (tick, roof) in ticks) {
      if (!pool.contains(tick)) continue;
      var r = roof!;
      final parts = [tick];
      if (r.width < lineH * 0.3) {
        // A tick without its roof: a level stroke starting where the tick ends.
        final top = r.topRight;
        final bar = pool.where((u) => u.isInk && u != tick && _isBar(u.points, lineH) && (u.box.centerLeft - top).distance < lineH * 0.45).firstOrNull;
        if (bar == null) continue;
        parts.add(bar);
        r = Rect.fromLTRB(r.left, math.min(r.top, bar.box.top), bar.box.right, r.bottom);
      }
      final inside = [
        for (final u in pool)
          if (!parts.contains(u) &&
              u.box.center.dx > r.left &&
              u.box.center.dx < r.right + lineH * 0.2 &&
              u.box.center.dy > r.top &&
              u.box.top > r.top - lineH * 0.3)
            u,
      ];
      if (inside.isEmpty) continue;
      final radicand = row(inside);
      final box = [...parts, ...inside].map((u) => u.box).reduce((a, b) => a.expandToInclude(b));
      pool
        ..removeWhere((u) => parts.contains(u) || inside.contains(u))
        ..add(
          _Unit.node(MathRoot(radicand), box, [
            for (final u in [...parts, ...inside]) ...u.strokes,
          ]),
        );
    }
    return pool;
  }

  /// The roof of a square-root sign: the box over its contents (from the top of the tick to its
  /// right end), or null when [pts] is no root sign.
  Rect? _rootShape(List<Offset> pts) {
    final b = _boundsOf(pts);
    if (b.height < lineH * 0.6 || pts.length < 4) return null;
    final size = b.longestSide;
    final simple = _rdp(resampleBy(pts, size / 40), size * 0.07);
    if (simple.length < 3) return null;
    // From the left, down to the lowest point, then up (and maybe along the roof).
    var low = 0;
    for (var i = 1; i < simple.length; i++) {
      if (simple[i].dy > simple[low].dy) low = i;
    }
    if (low == 0 || low == simple.length - 1) return null;
    final start = simple.first, bottom = simple[low];
    // The rise: from the bottom to the first corner near the top after it.
    var top = double.infinity;
    for (var i = low + 1; i < simple.length; i++) {
      top = math.min(top, simple[i].dy);
    }
    var high = low + 1;
    while (simple[high].dy > top + b.height * 0.15) {
      high++;
    }
    final peak = simple[high];
    if (start.dx > bottom.dx || bottom.dx >= peak.dx) return null;
    if (bottom.dy - peak.dy < b.height * 0.75 || bottom.dy - start.dy > b.height * 0.85) return null;
    // The roof: what follows the peak, level and going right.
    final end = simple.last;
    final roofLen = high == simple.length - 1 ? 0.0 : end.dx - peak.dx;
    if (roofLen > 0 && (end.dy - peak.dy).abs() > math.max(roofLen * 0.25, lineH * 0.25)) return null;
    // A tick alone must be steep and tall to count (or it is a v or a check mark in a word).
    return Rect.fromLTRB(peak.dx, peak.dy, math.max(peak.dx, end.dx), bottom.dy);
  }

  // A fraction: a bar with ink above and below it, within its width. The widest first, so a
  // fraction of fractions comes apart from the outside in.
  List<_Unit> _fractions(List<_Unit> units) {
    final pool = List.of(units);
    final bars = pool.where((u) => u.isInk && _isBar(u.points, lineH) && u.box.width > lineH * 0.45).toList()
      ..sort((a, b) => b.box.width.compareTo(a.box.width));
    for (final bar in bars) {
      if (!pool.contains(bar)) continue;
      final y = bar.box.center.dy, tol = bar.box.width * 0.12;
      bool inSpan(_Unit u) => u.box.center.dx > bar.box.left - tol && u.box.center.dx < bar.box.right + tol;
      final above = [
        for (final u in pool)
          if (u != bar && inSpan(u) && u.box.bottom <= y + lineH * 0.15 && y - u.box.bottom < lineH * 1.2) u,
      ];
      final below = [
        for (final u in pool)
          if (u != bar && inSpan(u) && u.box.top >= y - lineH * 0.15 && u.box.top - y < lineH * 1.2) u,
      ];
      bool dotsOnly(List<_Unit> us) => us.every((u) => u.isInk && u.box.longestSide < lineH * 0.3);
      if (above.isEmpty || below.isEmpty || dotsOnly(above) || dotsOnly(below)) continue;
      // Ink that is above or below but not stacked under the bar (another line) stays out.
      final top = _closure(above, pool, bar, up: true), bottom = _closure(below, pool, bar, up: false);
      final wide = math.max(_span(top).width, _span(bottom).width);
      if (bar.box.width < wide * 0.6) continue;
      final f = MathFraction(row(top), row(bottom));
      final all = [bar, ...top, ...bottom];
      pool
        ..removeWhere(all.contains)
        ..add(_Unit.node(f, all.map((u) => u.box).reduce((a, b) => a.expandToInclude(b)), [for (final u in all) ...u.strokes]));
    }
    return pool;
  }

  /// [seed] and the units that overlap it horizontally on the same side of the bar (the parts of
  /// a numerator that stick out past the bar's ends).
  List<_Unit> _closure(List<_Unit> seed, List<_Unit> pool, _Unit bar, {required bool up}) {
    final out = List.of(seed);
    var grew = true;
    while (grew) {
      grew = false;
      final span = _span(out);
      for (final u in pool) {
        if (u == bar || out.contains(u)) continue;
        final side = up ? u.box.bottom <= bar.box.center.dy + lineH * 0.15 : u.box.top >= bar.box.center.dy - lineH * 0.15;
        final near = u.box.left < span.right + lineH * 0.15 && u.box.right > span.left - lineH * 0.15 && (u.box.center.dy - span.center.dy).abs() < lineH;
        if (side && near) {
          out.add(u);
          grew = true;
        }
      }
    }
    return out;
  }

  Rect _span(List<_Unit> us) => us.map((u) => u.box).reduce((a, b) => a.expandToInclude(b));

  // Symbols: the remaining ink, grouped into symbols by horizontal overlap (= ÷ + x π stay
  // whole, 2 + 3 come apart) and read.
  List<_Unit> _symbols(List<_Unit> units) {
    final ink = units.where((u) => u.isInk).toList();
    final out = units.where((u) => !u.isInk).toList();
    final parent = List.generate(ink.length, (i) => i);
    int find(int i) => parent[i] == i ? i : parent[i] = find(parent[i]);
    bool dot(_Unit u) => u.box.longestSide < math.max(6, lineH * 0.3);
    for (var i = 0; i < ink.length; i++) {
      for (var j = i + 1; j < ink.length; j++) {
        final a = ink[i].box, b = ink[j].box;
        // Upright strokes have no width: they overlap what they cross (the + in a 4).
        final overlap = math.min(a.right, b.right) - math.max(a.left, b.left) + lineH * 0.06;
        final narrow = math.max(lineH * 0.12, math.min(a.width, b.width));
        // A dot joins what it sits over or under (÷, !), not a neighbour.
        final dotJoins =
            (dot(ink[i]) && !dot(ink[j]) && a.center.dx >= b.left - narrow * 0.4 && a.center.dx <= b.right + narrow * 0.4) ||
            (dot(ink[j]) && !dot(ink[i]) && b.center.dx >= a.left - narrow * 0.4 && b.center.dx <= a.right + narrow * 0.4);
        final vGap = math.max(a.top, b.top) - math.min(a.bottom, b.bottom);
        if ((overlap > narrow * 0.35 || dotJoins) && vGap < lineH * 0.9) parent[find(i)] = find(j);
      }
    }
    final groups = <int, List<_Unit>>{};
    for (var i = 0; i < ink.length; i++) {
      groups.putIfAbsent(find(i), () => []).add(ink[i]);
    }
    for (final g in groups.values) {
      final strokes = [for (final u in g) ...u.strokes];
      final guesses = rec.recognize([for (final s in strokes) _glyph(s)], lineHeight: lineH);
      if (guesses.isEmpty) continue;
      out.add(_Unit.node(MathSymbol(guesses.first.symbol, guesses), _span(g), strokes));
    }
    return out;
  }

  GlyphStroke _glyph(Stroke s) => [for (final p in s.points) (x: p.x, y: p.y)];

  /// Units left to right, with powers raised and symbols judged by their neighbours.
  MathRow _assemble(List<_Unit> units) {
    units.sort((a, b) => a.box.left.compareTo(b.box.left));
    final items = <(MathNode, Rect)>[];
    var i = 0;
    while (i < units.length) {
      final u = units[i];
      final prev = items.isEmpty ? null : items.last;
      final base = prev?.$2;
      // Raised and smaller, right after its base: a power. A written ^ raises what follows.
      final caret = prev != null && prev.$1 is MathSymbol && (prev.$1 as MathSymbol).symbol == '^' && items.length >= 2;
      if (caret ||
          (base != null && _raised(u.box, base) && !(prev!.$1 is MathSymbol && ((prev.$1 as MathSymbol).isBinary || (prev.$1 as MathSymbol).isRelation)))) {
        if (caret) items.removeLast();
        final (baseNode, baseBox) = items.removeLast();
        final ref = caret ? baseBox : base!;
        final exp = <_Unit>[u];
        i++;
        while (i < units.length && (caret ? units[i].box.left - exp.last.box.right < lineH * 0.4 && !_isOperator(units[i]) : _raised(units[i].box, ref))) {
          exp.add(units[i]);
          i++;
        }
        final e = _assembleNested(exp);
        items.add((MathPower(baseNode, e), baseBox.expandToInclude(_span(exp))));
        continue;
      }
      // Lowered and smaller, right after a letter: a subscript.
      if (base != null && prev!.$1 is MathSymbol && (prev.$1 as MathSymbol).isLetter && _lowered(u.box, base)) {
        final (baseNode, baseBox) = items.removeLast();
        final sub = <_Unit>[u];
        i++;
        while (i < units.length && _lowered(units[i].box, base) && !_isOperator(units[i])) {
          sub.add(units[i]);
          i++;
        }
        items.add((MathSubscript(baseNode, _assembleNested(sub)), baseBox.expandToInclude(_span(sub))));
        continue;
      }
      items.add((u.node!, u.box));
      i++;
    }
    return MathRow(_judge([for (final (n, _) in items) n]));
  }

  bool _isOperator(_Unit u) => u.node is MathSymbol && ((u.node as MathSymbol).isBinary || (u.node as MathSymbol).isRelation);

  MathRow _assembleNested(List<_Unit> units) => _assemble(units);

  bool _lowered(Rect r, Rect base) =>
      r.top > base.top + base.height * 0.45 &&
      r.center.dy > base.center.dy + base.height * 0.25 &&
      r.height < base.height * 0.8 &&
      r.left - base.right < lineH * 0.6;

  bool _raised(Rect r, Rect base) =>
      r.bottom < base.top + base.height * 0.5 &&
      r.center.dy < base.center.dy - base.height * 0.25 &&
      r.height < base.height * 0.9 &&
      r.left - base.right < lineH * 0.8;

  /// Symbols decided by their neighbours: a cross between numbers is ×, a letter among digits is
  /// the digit it looks like, a dot between digits is a decimal point.
  List<MathNode> _judge(List<MathNode> items) {
    final out = List.of(items);
    bool numeric(MathNode? n, {required bool before}) => switch (n) {
      MathSymbol(:final symbol) => (n.isDigit || (before ? symbol == ')' : symbol == '(')),
      MathFraction() || MathRoot() => true,
      MathPower() || MathSubscript() => before,
      _ => false,
    };
    for (var i = 0; i < out.length; i++) {
      final n = out[i];
      if (n is! MathSymbol) continue;
      final prev = i > 0 ? out[i - 1] : null, next = i + 1 < out.length ? out[i + 1] : null;
      if (n.symbol == 'x' && numeric(prev, before: true) && numeric(next, before: false)) {
        out[i] = MathSymbol('×', n.guesses);
      } else if (n.isLetter && n.symbol != 'x' && (prev is MathSymbol && prev.isDigit || next is MathSymbol && next.isDigit)) {
        // "2z5" is 225: a digit the recogniser nearly chose wins between digits.
        final digit = n.guesses.skip(1).take(3).where((g) => RegExp(r'^\d$').hasMatch(g.symbol) && g.score > n.guesses.first.score * 0.85).firstOrNull;
        final between = prev is MathSymbol && prev.isDigit && next is MathSymbol && next.isDigit;
        if (digit != null && (between || next == null || prev == null)) out[i] = MathSymbol(digit.symbol, n.guesses);
      }
    }
    for (final n in out) {
      if (n is MathSymbol && n.guesses.isNotEmpty) weakest = math.min(weakest, n.guesses.first.score);
    }
    return out;
  }

  /// Other readings: the least certain symbols read as their runner-up instead.
  List<MathRow> alternatives(MathRow row) {
    final uncertain = <MathSymbol>[];
    void walk(MathNode n) {
      switch (n) {
        case MathRow(:final items):
          items.forEach(walk);
        case MathFraction(:final numerator, :final denominator):
          walk(numerator);
          walk(denominator);
        case MathRoot(:final radicand):
          walk(radicand);
        case MathPower(:final base, :final exponent):
          walk(base);
          walk(exponent);
        case MathSubscript(:final base, :final index):
          walk(base);
          walk(index);
        case MathSymbol():
          if (n.guesses.length > 1) uncertain.add(n);
      }
    }

    walk(row);
    double margin(MathSymbol s) => s.guesses.first.score - s.guesses[1].score;
    uncertain.sort((a, b) => margin(a).compareTo(margin(b)));
    final out = <MathRow>[];
    for (final s in uncertain.take(3)) {
      for (final g in s.guesses.skip(1).take(2)) {
        if (g.symbol == s.symbol) continue;
        out.add(_replace(row, s, MathSymbol(g.symbol, s.guesses)) as MathRow);
      }
    }
    return out.take(4).toList();
  }

  MathNode _replace(MathNode n, MathSymbol from, MathSymbol to) => switch (n) {
    MathSymbol() => identical(n, from) ? to : n,
    MathRow(:final items) => MathRow([for (final i in items) _replace(i, from, to)]),
    MathFraction(:final numerator, :final denominator) => MathFraction(_replace(numerator, from, to) as MathRow, _replace(denominator, from, to) as MathRow),
    MathRoot(:final radicand) => MathRoot(_replace(radicand, from, to) as MathRow),
    MathPower(:final base, :final exponent) => MathPower(_replace(base, from, to), _replace(exponent, from, to) as MathRow),
    MathSubscript(:final base, :final index) => MathSubscript(_replace(base, from, to), _replace(index, from, to) as MathRow),
  };
}

List<Offset> _rdp(List<Offset> pts, double eps) {
  if (pts.length < 3) return List.of(pts);
  var maxD = 0.0;
  var idx = 0;
  for (var i = 1; i < pts.length - 1; i++) {
    final d = segmentDistance(pts[i], pts.first, pts.last);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= eps) return [pts.first, pts.last];
  final l = _rdp(pts.sublist(0, idx + 1), eps), r = _rdp(pts.sublist(idx), eps);
  return [...l.sublist(0, l.length - 1), ...r];
}

// --- Text from a handwriting recogniser -----------------------------------------------------

final _digit = RegExp(r'[0-9]');

/// Letter-for-digit slips that are near certain inside maths ("1S" is 15, "2t3" is 2+3).
String mathFix(String s) {
  final t = s.trim().replaceAll(' ', '');
  const pairs = {
    'O': '0',
    'o': '0',
    'D': '0',
    'l': '1',
    'I': '1',
    '|': '1',
    'i': '1',
    'S': '5',
    's': '5',
    'Z': '2',
    'z': '2',
    'B': '8',
    'g': '9',
    'q': '9',
    'G': '6',
    'b': '6',
    'T': '7',
  };
  final out = StringBuffer();
  for (var i = 0; i < t.length; i++) {
    final c = t[i];
    final prev = i > 0 ? t[i - 1] : '';
    final next = i + 1 < t.length ? t[i + 1] : '';
    final nearDigit = _digit.hasMatch(prev) || _digit.hasMatch(next);
    // Real unknowns stay: a letter after a digit ("2x", "3b") is algebra.
    if (pairs.containsKey(c) && nearDigit && !(_digit.hasMatch(prev) && 'xyzabcmnpqk'.contains(c) && !_digit.hasMatch(next))) {
      out.write(pairs[c]);
    } else if (c == 'X') {
      out.write('x');
    } else if (c == 't' && prev.isNotEmpty && next.isNotEmpty && RegExp(r'[0-9a-z)]').hasMatch(prev) && RegExp(r'[0-9a-z(]').hasMatch(next)) {
      // "2t3", "atb": a handwritten plus the model read as t.
      out.write('+');
    } else if (c == ':' && _digit.hasMatch(prev) && _digit.hasMatch(next)) {
      out.write('÷');
    } else {
      out.write(c);
    }
  }
  return out.toString();
}

/// True when a line of recognised text looks like maths rather than words.
bool looksMathy(String s) => RegExp(r'[=+×÷^<>≤≥√π]').hasMatch(s) || (RegExp(r'\d').hasMatch(s) && !RegExp(r'[A-Za-z]{3,}').hasMatch(s));
