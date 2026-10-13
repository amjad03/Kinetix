import 'dart:convert' show LineSplitter;
import 'dart:math' as math;
import 'dart:ui' show Offset, Rect;

// The figures behind the live business panels (KitElement): a BCG matrix, a decision tree, a
// break-even chart and a chart from data. Pure Dart, read from and written to the panel's
// JSON, so the board, its tests and the page pictures share one model.

double _d(Object? v, [double fallback = 0]) => v is num ? v.toDouble() : (v is String ? double.tryParse(v) ?? fallback : fallback);
String _s(Object? v, [String fallback = '']) => v is String ? v : fallback;
List<Object?> _l(Object? v) => v is List ? v : const [];

// --- BCG growth–share matrix -------------------------------------------------------------------

enum BcgQuadrant { star, questionMark, cashCow, dog }

/// A product or business unit: its market's growth rate (% a year), its share relative to the
/// largest rival (1 = as big; 2 = twice as big) and its revenue (the bubble's area).
class BcgProduct {
  const BcgProduct(this.name, {required this.growth, required this.share, required this.revenue});

  factory BcgProduct.fromJson(Object? j) {
    final m = j is Map ? j : const {};
    return BcgProduct(_s(m['n']), growth: _d(m['g']), share: math.max(0.01, _d(m['s'], 1)), revenue: math.max(0, _d(m['r'], 1)));
  }

  final String name;
  final double growth, share, revenue;

  BcgProduct copyWith({String? name, double? growth, double? share, double? revenue}) =>
      BcgProduct(name ?? this.name, growth: growth ?? this.growth, share: share ?? this.share, revenue: revenue ?? this.revenue);

  Map<String, Object?> toJson() => {'n': name, 'g': _r2(growth), 's': _r2(share), 'r': _r2(revenue)};
}

double _r2(double v) => double.parse(v.toStringAsFixed(2));

/// The matrix: products on growth (up) against relative share (log scale, high share on the
/// left, as Henderson drew it). A product is "high" at or above [growthSplit] % and
/// [shareSplit]×.
class BcgMatrix {
  const BcgMatrix({this.title = 'BCG matrix', this.products = const [], this.growthSplit = 10, this.shareSplit = 1, this.growthMin = -10, this.growthMax = 30, this.shareMin = 0.1, this.shareMax = 10});

  factory BcgMatrix.fromJson(Map<String, Object?> j) => BcgMatrix(
    title: _s(j['title'], 'BCG matrix'),
    products: [for (final p in _l(j['p'])) BcgProduct.fromJson(p)],
    growthSplit: _d(j['gs'], 10),
    shareSplit: math.max(0.01, _d(j['ss'], 1)),
    growthMin: _d(j['g0'], -10),
    growthMax: _d(j['g1'], 30),
    shareMin: math.max(0.01, _d(j['s0'], 0.1)),
    shareMax: math.max(0.02, _d(j['s1'], 10)),
  );

  final String title;
  final List<BcgProduct> products;
  final double growthSplit, shareSplit, growthMin, growthMax, shareMin, shareMax;

  Map<String, Object?> toJson() => {
    'title': title,
    'p': [for (final p in products) p.toJson()],
    'gs': growthSplit,
    'ss': shareSplit,
    'g0': growthMin,
    'g1': growthMax,
    's0': shareMin,
    's1': shareMax,
  };

  BcgMatrix copyWith({String? title, List<BcgProduct>? products}) => BcgMatrix(
    title: title ?? this.title,
    products: products ?? this.products,
    growthSplit: growthSplit,
    shareSplit: shareSplit,
    growthMin: growthMin,
    growthMax: growthMax,
    shareMin: shareMin,
    shareMax: shareMax,
  );

  BcgQuadrant quadrantOf(BcgProduct p) {
    final hiGrowth = p.growth >= growthSplit, hiShare = p.share >= shareSplit;
    return hiGrowth ? (hiShare ? BcgQuadrant.star : BcgQuadrant.questionMark) : (hiShare ? BcgQuadrant.cashCow : BcgQuadrant.dog);
  }

  double get _logSpan => math.log(shareMax) - math.log(shareMin);

  /// Where [p]'s bubble sits in [plot] (clamped to it).
  Offset placement(BcgProduct p, Rect plot) {
    final s = p.share.clamp(shareMin, shareMax), g = p.growth.clamp(growthMin, growthMax);
    final x = plot.left + (math.log(shareMax) - math.log(s)) / _logSpan * plot.width;
    final y = plot.top + (growthMax - g) / (growthMax - growthMin) * plot.height;
    return Offset(x, y);
  }

  /// The growth and share at [at] in [plot]: what dragging a bubble there sets.
  ({double growth, double share}) valuesAt(Offset at, Rect plot) {
    final fx = ((at.dx - plot.left) / plot.width).clamp(0.0, 1.0), fy = ((at.dy - plot.top) / plot.height).clamp(0.0, 1.0);
    return (growth: growthMax - fy * (growthMax - growthMin), share: math.exp(math.log(shareMax) - fx * _logSpan));
  }

  /// The dividing lines in [plot]: x of the share split and y of the growth split.
  Offset splitAt(Rect plot) => placement(BcgProduct('', growth: growthSplit, share: shareSplit, revenue: 0), plot);

  /// A bubble's radius: its area in proportion to revenue, the largest [maxRadius].
  double radiusOf(BcgProduct p, double maxRadius) {
    final top = products.fold(0.0, (a, b) => math.max(a, b.revenue));
    if (top <= 0) return maxRadius * 0.4;
    return math.max(maxRadius * 0.18, maxRadius * math.sqrt(p.revenue / top));
  }
}

// --- Decision tree ------------------------------------------------------------------------------

enum DtKind { decision, chance, end }

/// A node of a decision tree. The branch into it carries [probability] (when its parent is a
/// chance node) and [cost] (paid on the way, e.g. the cost of an option); an end node has a
/// [payoff].
class DtNode {
  DtNode(this.kind, {this.label = '', this.probability = 0, this.cost = 0, this.payoff = 0, List<DtNode>? children}) : children = children ?? [];

  factory DtNode.fromJson(Object? j) {
    final m = j is Map ? j : const {};
    final kind = DtKind.values.asNameMap()[m['k']] ?? DtKind.end;
    return DtNode(
      kind,
      label: _s(m['l']),
      probability: _d(m['p']),
      cost: _d(m['c']),
      payoff: _d(m['v']),
      children: kind == DtKind.end ? [] : [for (final c in _l(m['ch'])) DtNode.fromJson(c)],
    );
  }

  DtKind kind;
  String label;
  double probability, cost, payoff;
  final List<DtNode> children;

  Map<String, Object?> toJson() => {
    'k': kind.name,
    if (label.isNotEmpty) 'l': label,
    if (probability != 0) 'p': probability,
    if (cost != 0) 'c': cost,
    if (kind == DtKind.end) 'v': payoff,
    if (kind != DtKind.end && children.isNotEmpty) 'ch': [for (final c in children) c.toJson()],
  };

  /// Every node under and including this one, depth first.
  Iterable<DtNode> get all sync* {
    yield this;
    for (final c in children) {
      yield* c.all;
    }
  }

  /// The end nodes under this one, top to bottom.
  int get leafCount => kind == DtKind.end || children.isEmpty ? 1 : children.fold(0, (a, c) => a + c.leafCount);

  int get depth => children.isEmpty ? 0 : 1 + children.map((c) => c.depth).reduce(math.max);

  DtNode? parentOf(DtNode n) {
    for (final c in children) {
      if (identical(c, n)) return this;
      final p = c.parentOf(n);
      if (p != null) return p;
    }
    return null;
  }
}

/// The tree worked back from the ends: each node's expected value, the option chosen at each
/// decision, and the nodes on the best path.
class DtRollback {
  DtRollback._(this.value, this.best, this.onBestPath, this.badProbabilities);

  /// Worked back from the ends: an end's payoff; a chance node's Σ p × (value − cost); a
  /// decision's best (value − cost) among its options.
  factory DtRollback.of(DtNode root) {
    final value = Map<DtNode, double>.identity(), best = Map<DtNode, DtNode>.identity();
    final bad = Set<DtNode>.identity();
    double work(DtNode n) {
      if (n.kind == DtKind.end || n.children.isEmpty) return value[n] = n.kind == DtKind.end ? n.payoff : 0;
      if (n.kind == DtKind.chance) {
        var ev = 0.0, sum = 0.0;
        for (final c in n.children) {
          ev += c.probability * (work(c) - c.cost);
          sum += c.probability;
        }
        if ((sum - 1).abs() > 1e-6) bad.add(n);
        return value[n] = ev;
      }
      DtNode? pick;
      var top = double.negativeInfinity;
      for (final c in n.children) {
        final v = work(c) - c.cost;
        if (v > top + 1e-12) {
          top = v;
          pick = c;
        }
      }
      best[n] = pick!;
      return value[n] = top;
    }

    work(root);
    final path = Set<DtNode>.identity();
    void walk(DtNode n) {
      path.add(n);
      if (n.kind == DtKind.decision) {
        if (best[n] != null) walk(best[n]!);
      } else {
        n.children.forEach(walk);
      }
    }

    walk(root);
    return DtRollback._(value, best, path, bad);
  }

  final Map<DtNode, double> value;
  final Map<DtNode, DtNode> best;
  final Set<DtNode> onBestPath;

  /// Chance nodes whose branch probabilities do not add up to 1.
  final Set<DtNode> badProbabilities;
}

/// A tidy left-to-right layout: x is the depth, y the middle of the node's leaves, both in
/// slots (multiply by the column width and row height).
Map<DtNode, Offset> layoutDecisionTree(DtNode root) {
  final out = Map<DtNode, Offset>.identity();
  var leaf = 0;
  double place(DtNode n, int depth) {
    if (n.kind == DtKind.end || n.children.isEmpty) {
      final y = (leaf++).toDouble();
      out[n] = Offset(depth.toDouble(), y);
      return y;
    }
    final ys = [for (final c in n.children) place(c, depth + 1)];
    final y = (ys.first + ys.last) / 2;
    out[n] = Offset(depth.toDouble(), y);
    return y;
  }

  place(root, 0);
  return out;
}

class DecisionTreeModel {
  DecisionTreeModel({this.title = 'Decision tree', required this.root});

  factory DecisionTreeModel.fromJson(Map<String, Object?> j) =>
      DecisionTreeModel(title: _s(j['title'], 'Decision tree'), root: j['root'] is Map ? DtNode.fromJson(j['root']) : DtNode(DtKind.decision, label: 'Decide'));

  String title;
  DtNode root;

  Map<String, Object?> toJson() => {'title': title, 'root': root.toJson()};
}

// --- Break-even ---------------------------------------------------------------------------------

/// Marginal costing at one price: fixed cost, variable cost per unit and planned sales.
class BreakEvenModel {
  const BreakEvenModel({this.title = 'Break-even chart', required this.fixedCost, required this.variableCost, required this.price, required this.units});

  factory BreakEvenModel.fromJson(Map<String, Object?> j) => BreakEvenModel(
    title: _s(j['title'], 'Break-even chart'),
    fixedCost: math.max(0, _d(j['fc'], 60000)),
    variableCost: math.max(0, _d(j['vc'], 30)),
    price: math.max(0, _d(j['sp'], 50)),
    units: math.max(0, _d(j['q'], 5000)),
  );

  final String title;
  final double fixedCost, variableCost, price, units;

  Map<String, Object?> toJson() => {'title': title, 'fc': _r2(fixedCost), 'vc': _r2(variableCost), 'sp': _r2(price), 'q': _r2(units)};

  BreakEvenModel copyWith({String? title, double? fixedCost, double? variableCost, double? price, double? units}) => BreakEvenModel(
    title: title ?? this.title,
    fixedCost: fixedCost ?? this.fixedCost,
    variableCost: variableCost ?? this.variableCost,
    price: price ?? this.price,
    units: units ?? this.units,
  );

  double get contribution => price - variableCost;
  bool get canBreakEven => contribution > 0;

  /// P/V ratio, as a fraction of price.
  double get pvRatio => price == 0 ? 0 : contribution / price;
  double get bepUnits => canBreakEven ? fixedCost / contribution : double.infinity;
  double get bepSales => bepUnits * price;
  double get sales => units * price;
  double get marginOfSafetyUnits => units - bepUnits;
  double get marginOfSafetySales => marginOfSafetyUnits * price;

  /// Margin of safety as a percentage of planned sales.
  double get marginOfSafetyPercent => units == 0 ? 0 : marginOfSafetyUnits / units * 100;
  double get profit => units * contribution - fixedCost;
  double costAt(double q) => fixedCost + variableCost * q;
  double revenueAt(double q) => price * q;

  /// The chart's last unit: past both the plan and the break-even point.
  double get chartUnits {
    final top = math.max(units, canBreakEven ? bepUnits : units) * 1.4;
    return top <= 0 ? 100 : niceCeil(top);
  }
}

/// [v] rounded up to 1, 2, 2.5 or 5 times a power of ten.
double niceCeil(double v) {
  if (v <= 0 || !v.isFinite) return 1;
  final p = math.pow(10, (math.log(v) / math.ln10).floor()).toDouble();
  for (final m in [1.0, 2.0, 2.5, 5.0, 10.0]) {
    if (m * p >= v - 1e-9) return m * p;
  }
  return 10 * p;
}

// --- Charts from data ----------------------------------------------------------------------------

enum KitChartKind { line, bar, pie, scatter }

class ChartSeries {
  const ChartSeries(this.name, this.values);
  final String name;

  /// NaN where a value is missing.
  final List<double> values;
}

/// A chart: labels along the bottom (x values for a scatter), one or more series, and a note
/// such as the source of the figures.
class ChartData {
  const ChartData({this.kind = KitChartKind.line, this.title = '', this.labels = const [], this.series = const [], this.xLabel = '', this.yLabel = '', this.note = ''});

  factory ChartData.fromJson(Map<String, Object?> j) => ChartData(
    kind: KitChartKind.values.asNameMap()[j['k']] ?? KitChartKind.line,
    title: _s(j['title']),
    labels: [for (final v in _l(j['l'])) v is String ? v : '$v'],
    series: [
      for (final s in _l(j['s']))
        if (s is Map) ChartSeries(_s(s['n']), [for (final v in _l(s['v'])) v is num ? v.toDouble() : double.nan]),
    ],
    xLabel: _s(j['x']),
    yLabel: _s(j['y']),
    note: _s(j['note']),
  );

  final KitChartKind kind;
  final String title, xLabel, yLabel, note;
  final List<String> labels;
  final List<ChartSeries> series;

  Map<String, Object?> toJson() => {
    'k': kind.name,
    if (title.isNotEmpty) 'title': title,
    'l': labels,
    's': [
      for (final s in series) {'n': s.name, 'v': [for (final v in s.values) v.isFinite ? v : null]},
    ],
    if (xLabel.isNotEmpty) 'x': xLabel,
    if (yLabel.isNotEmpty) 'y': yLabel,
    if (note.isNotEmpty) 'note': note,
  };

  ChartData copyWith({KitChartKind? kind, String? title, String? note, String? xLabel, String? yLabel}) =>
      ChartData(kind: kind ?? this.kind, title: title ?? this.title, labels: labels, series: series, xLabel: xLabel ?? this.xLabel, yLabel: yLabel ?? this.yLabel, note: note ?? this.note);

  bool get isEmpty => series.every((s) => s.values.every((v) => !v.isFinite));

  /// The rows as text, comma-separated, heading first (for editing and copying out).
  String toCsv() {
    String q(String t) => t.contains(',') || t.contains('"') ? '"${t.replaceAll('"', '""')}"' : t;
    String n(double v) => !v.isFinite ? '' : (v == v.roundToDouble() ? v.round().toString() : v.toString());
    return [
      [q(xLabel.isEmpty ? 'Label' : xLabel), for (final s in series) q(s.name)].join(','),
      for (var i = 0; i < labels.length; i++) [q(labels[i]), for (final s in series) n(i < s.values.length ? s.values[i] : double.nan)].join(','),
    ].join('\n');
  }

  /// Rows pasted or read from a CSV file: the first column labels, the others series. A first
  /// row with words in the number columns is the heading. Commas, tabs or semicolons separate;
  /// `₹`, `%` and thousands separators are read past.
  static ChartData fromCsv(String text, {KitChartKind kind = KitChartKind.line, String title = '', String note = ''}) {
    final rows = [
      for (final line in const LineSplitter().convert(text))
        if (line.trim().isNotEmpty) splitCsvLine(line),
    ];
    if (rows.isEmpty) return ChartData(kind: kind, title: title, note: note);
    final width = rows.map((r) => r.length).reduce(math.max);
    final single = width == 1;
    final head = !single && rows.first.skip(1).any((c) => c.trim().isNotEmpty && parseChartNumber(c) == null);
    final body = head ? rows.skip(1).toList() : rows;
    final names = head ? rows.first : <String>[];
    final cols = single ? 1 : width - 1;
    return ChartData(
      kind: kind,
      title: title,
      note: note,
      xLabel: head && names.isNotEmpty ? names.first.trim() : '',
      labels: [for (final (i, r) in body.indexed) single ? '${i + 1}' : r.first.trim()],
      series: [
        for (var c = 0; c < cols; c++)
          ChartSeries(head && c + 1 < names.length ? names[c + 1].trim() : 'Series ${c + 1}', [
            for (final r in body) parseChartNumber(single ? r.first : (c + 1 < r.length ? r[c + 1] : '')) ?? double.nan,
          ]),
      ],
    );
  }
}

/// A number in a data cell: `1,23,456`, `₹500`, `6.5%` (read as 6.5), `(200)` for −200.
double? parseChartNumber(String raw) {
  var s = raw.trim().replaceAll(RegExp(r'[₹$,\s%]'), '');
  if (s.isEmpty) return null;
  var sign = 1.0;
  if (s.startsWith('(') && s.endsWith(')')) {
    sign = -1;
    s = s.substring(1, s.length - 1);
  }
  final v = double.tryParse(s);
  return v == null ? null : v * sign;
}

/// One CSV line split on commas (or tabs or semicolons when it has those), quotes respected.
List<String> splitCsvLine(String line) {
  final sep = line.contains('\t') ? '\t' : (!line.contains(',') && line.contains(';') ? ';' : ',');
  final out = <String>[];
  final cur = StringBuffer();
  var quoted = false;
  for (var i = 0; i < line.length; i++) {
    final ch = line[i];
    if (quoted) {
      if (ch == '"' && i + 1 < line.length && line[i + 1] == '"') {
        cur.write('"');
        i++;
      } else if (ch == '"') {
        quoted = false;
      } else {
        cur.write(ch);
      }
    } else if (ch == '"') {
      quoted = true;
    } else if (ch == sep) {
      out.add(cur.toString());
      cur.clear();
    } else {
      cur.write(ch);
    }
  }
  out.add(cur.toString());
  return out;
}
