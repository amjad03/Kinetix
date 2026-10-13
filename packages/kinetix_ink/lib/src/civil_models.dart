import 'dart:math' as math;

// The figures behind the civil engineering panels (KitElement): a beam with its reactions,
// shear force, bending moment and deflection; a pin-jointed plane truss solved by the method of
// joints; a level book (rise and fall, height of instrument); a compass traverse with its closing
// error and Bowditch correction; and a contour sketch from a grid of spot levels. Pure Dart, read
// from and written to the panel's JSON, so the board, its tests and the page pictures share one
// model. Units: kN and m (moments kN·m, EI kN·m², deflection mm).

double _d(Object? v, [double fallback = 0]) => v is num ? v.toDouble() : (v is String ? double.tryParse(v) ?? fallback : fallback);
int _i(Object? v, [int fallback = 0]) => v is num ? v.toInt() : (v is String ? int.tryParse(v) ?? fallback : fallback);
String _s(Object? v, [String fallback = '']) => v is String ? v : fallback;
List<Object?> _l(Object? v) => v is List ? v : const [];
Map<Object?, Object?> _m(Object? v) => v is Map ? v : const {};
double _r(double v, [int places = 4]) => double.parse(v.toStringAsFixed(places));

// --- Beams -------------------------------------------------------------------------------------

/// How a beam is held at a point: a pin or a roller stops it moving up or down; a fixed end also
/// stops it turning.
enum BeamSupportKind { pin, roller, fixed }

class BeamSupport {
  const BeamSupport(this.x, this.kind);
  factory BeamSupport.fromJson(Object? j) {
    final m = _m(j);
    return BeamSupport(_d(m['x']), BeamSupportKind.values.asNameMap()[m['t']] ?? BeamSupportKind.pin);
  }
  final double x;
  final BeamSupportKind kind;
  BeamSupport copyWith({double? x, BeamSupportKind? kind}) => BeamSupport(x ?? this.x, kind ?? this.kind);
  Map<String, Object?> toJson() => {'x': _r(x), 't': kind.name};
}

/// A point load (kN, down), a uniformly distributed load (kN/m, down, from [x] to [x2]), a
/// uniformly varying load ([w] at [x] to [w2] at [x2]) or a moment (kN·m, clockwise).
enum BeamLoadKind { point, udl, uvl, moment }

class BeamLoad {
  const BeamLoad(this.kind, {required this.x, this.x2 = 0, required this.w, this.w2 = 0});
  factory BeamLoad.fromJson(Object? j) {
    final m = _m(j);
    return BeamLoad(BeamLoadKind.values.asNameMap()[m['k']] ?? BeamLoadKind.point, x: _d(m['x']), x2: _d(m['x2']), w: _d(m['w']), w2: _d(m['w2']));
  }
  final BeamLoadKind kind;
  final double x, x2, w, w2;

  bool get distributed => kind == BeamLoadKind.udl || kind == BeamLoadKind.uvl;
  double get start => distributed ? math.min(x, x2) : x;
  double get end => distributed ? math.max(x, x2) : x;

  /// The intensity at the start and the end of a distributed load.
  double get wStart => kind == BeamLoadKind.udl ? w : (x <= x2 ? w : w2);
  double get wEnd => kind == BeamLoadKind.udl ? w : (x <= x2 ? w2 : w);

  BeamLoad copyWith({BeamLoadKind? kind, double? x, double? x2, double? w, double? w2}) =>
      BeamLoad(kind ?? this.kind, x: x ?? this.x, x2: x2 ?? this.x2, w: w ?? this.w, w2: w2 ?? this.w2);

  /// Moved along the beam by [dx], kept on a beam of length [length].
  BeamLoad shifted(double dx, double length) {
    if (!distributed) return copyWith(x: (x + dx).clamp(0.0, length));
    final span = end - start;
    final s = (start + dx).clamp(0.0, math.max(0.0, length - span)).toDouble();
    return x <= x2 ? copyWith(x: s, x2: s + span) : copyWith(x2: s, x: s + span);
  }

  Map<String, Object?> toJson() => {'k': kind.name, 'x': _r(x), if (distributed) 'x2': _r(x2), 'w': _r(w), if (kind == BeamLoadKind.uvl) 'w2': _r(w2)};
}

/// The textbook beams the editor starts from.
enum BeamType { simplySupported, cantilever, overhanging, propped, fixed, custom }

class BeamModel {
  const BeamModel({this.title = 'Beam', this.length = 6, this.ei = 0, this.type = BeamType.simplySupported, this.supports = const [], this.loads = const []});

  factory BeamModel.fromJson(Map<String, Object?> j) => BeamModel(
    title: _s(j['title'], 'Beam'),
    length: math.max(0.1, _d(j['L'], 6)),
    ei: math.max(0, _d(j['ei'])),
    type: BeamType.values.asNameMap()[j['type']] ?? BeamType.custom,
    supports: [for (final s in _l(j['s'])) BeamSupport.fromJson(s)],
    loads: [for (final l in _l(j['l'])) BeamLoad.fromJson(l)],
  );

  /// The supports of a [type] beam [length] long ([overhang] past the right support).
  static List<BeamSupport> supportsFor(BeamType type, double length, {double? overhang}) => switch (type) {
    BeamType.simplySupported => [const BeamSupport(0, BeamSupportKind.pin), BeamSupport(length, BeamSupportKind.roller)],
    BeamType.cantilever => [const BeamSupport(0, BeamSupportKind.fixed)],
    BeamType.overhanging => [const BeamSupport(0, BeamSupportKind.pin), BeamSupport(_r(length - (overhang ?? length / 4)), BeamSupportKind.roller)],
    BeamType.propped => [const BeamSupport(0, BeamSupportKind.fixed), BeamSupport(length, BeamSupportKind.roller)],
    BeamType.fixed => [const BeamSupport(0, BeamSupportKind.fixed), BeamSupport(length, BeamSupportKind.fixed)],
    BeamType.custom => const [],
  };

  final String title;

  /// Span in m.
  final double length;

  /// Flexural rigidity in kN·m²; 0 when not given (the deflection is then shown in units of 1/EI).
  final double ei;
  final BeamType type;
  final List<BeamSupport> supports;
  final List<BeamLoad> loads;

  Map<String, Object?> toJson() => {
    'title': title,
    'L': _r(length),
    'ei': ei,
    'type': type.name,
    's': [for (final s in supports) s.toJson()],
    'l': [for (final l in loads) l.toJson()],
  };

  BeamModel copyWith({String? title, double? length, double? ei, BeamType? type, List<BeamSupport>? supports, List<BeamLoad>? loads}) => BeamModel(
    title: title ?? this.title,
    length: length ?? this.length,
    ei: ei ?? this.ei,
    type: type ?? this.type,
    supports: supports ?? this.supports,
    loads: loads ?? this.loads,
  );

  BeamResult solve() => BeamResult.of(this);
}

/// A support's reaction: [force] up (kN) and, at a fixed end, [moment] (kN·m, anticlockwise).
class BeamReaction {
  const BeamReaction(this.support, this.force, this.moment);
  final BeamSupport support;
  final double force, moment;
}

/// A beam worked out: reactions from the stiffness method (so propped and fixed beams are solved
/// too), then shear force and bending moment by statics from the left (sagging positive), the
/// deflection from the same solution, the maxima, and the points of contraflexure.
class BeamResult {
  BeamResult._(this.beam, this.reactions, this.stable, this._nodes, this._v);

  factory BeamResult.of(BeamModel b) {
    final cached = _cache[b];
    if (cached != null) return cached;
    final r = _solve(b);
    _cache[b] = r;
    return r;
  }

  static final _cache = Expando<BeamResult>();

  final BeamModel beam;
  final List<BeamReaction> reactions;

  /// False when the supports cannot hold the beam (a mechanism: no support, or one roller).
  final bool stable;
  final List<double> _nodes;

  /// Deflection (m × EI, up positive) at [_nodes].
  final List<double> _v;

  static BeamResult _solve(BeamModel b) {
    final L = b.length;
    // Nodes: the ends, supports and load points; the reactions come from these alone (exact for
    // these loads, and well conditioned), the deflection curve from a fine mesh (at most L/160).
    final keys = <double>{0, L};
    for (final s in b.supports) {
      if (s.x >= 0 && s.x <= L) keys.add(s.x);
    }
    for (final l in b.loads) {
      for (final x in [l.start, l.end]) {
        if (x > 0 && x < L) keys.add(x);
      }
    }
    final sorted = keys.toList()..sort();
    final coarse = <double>[sorted.first];
    for (final x in sorted.skip(1)) {
      if (x - coarse.last >= 1e-9) coarse.add(x);
    }
    final nodes = <double>[coarse.first];
    final maxH = L / 160;
    for (var i = 1; i < coarse.length; i++) {
      final a = coarse[i - 1], c = coarse[i];
      final n = math.max(1, ((c - a) / maxH).ceil());
      for (var k = 1; k <= n; k++) {
        nodes.add(a + (c - a) * k / n);
      }
    }
    final exact = _fe(b, coarse), fine = _fe(b, nodes);
    if (exact == null || fine == null) {
      return BeamResult._(b, [for (final s in b.supports) BeamReaction(s, 0, 0)], false, nodes, List.filled(nodes.length, 0));
    }
    return BeamResult._(b, exact.reactions, true, nodes, fine.v);
  }

  /// The stiffness method on [nodes] (EI = 1): the reactions and the deflection at each node;
  /// null when the beam is a mechanism.
  static ({List<BeamReaction> reactions, List<double> v})? _fe(BeamModel b, List<double> nodes) {
    final nn = nodes.length, dof = 2 * nn;
    // Banded stiffness (half-bandwidth 3) with EI = 1; loads up and anticlockwise positive.
    const bw = 3;
    final k = List.generate(dof, (_) => List<double>.filled(2 * bw + 1, 0));
    void addK(int r, int c, double v) => k[r][c - r + bw] += v;
    final f = List<double>.filled(dof, 0);
    int nodeAt(double x) {
      var best = 0;
      for (var i = 1; i < nn; i++) {
        if ((nodes[i] - x).abs() < (nodes[best] - x).abs()) best = i;
      }
      return best;
    }

    for (var e = 0; e < nn - 1; e++) {
      final h = nodes[e + 1] - nodes[e];
      final ke = [
        [12 / (h * h * h), 6 / (h * h), -12 / (h * h * h), 6 / (h * h)],
        [6 / (h * h), 4 / h, -6 / (h * h), 2 / h],
        [-12 / (h * h * h), -6 / (h * h), 12 / (h * h * h), -6 / (h * h)],
        [6 / (h * h), 2 / h, -6 / (h * h), 4 / h],
      ];
      final ids = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
      for (var p = 0; p < 4; p++) {
        for (var q = 0; q < 4; q++) {
          addK(ids[p], ids[q], ke[p][q]);
        }
      }
      // Consistent loads of the distributed loads over this element (linear within it).
      final mid = (nodes[e] + nodes[e + 1]) / 2;
      for (final l in b.loads.where((l) => l.distributed && l.start <= mid && mid <= l.end && l.end > l.start)) {
        final w1 = -_intensity(l, nodes[e]), w2 = -_intensity(l, nodes[e + 1]);
        f[2 * e] += h * (7 * w1 + 3 * w2) / 20;
        f[2 * e + 1] += h * h * (3 * w1 + 2 * w2) / 60;
        f[2 * e + 2] += h * (3 * w1 + 7 * w2) / 20;
        f[2 * e + 3] -= h * h * (2 * w1 + 3 * w2) / 60;
      }
    }
    for (final l in b.loads) {
      if (l.kind == BeamLoadKind.point) f[2 * nodeAt(l.x)] -= l.w;
      if (l.kind == BeamLoadKind.moment) f[2 * nodeAt(l.x) + 1] -= l.w;
    }
    final fixedDofs = <int>{};
    for (final s in b.supports) {
      final n = nodeAt(s.x);
      fixedDofs.add(2 * n);
      if (s.kind == BeamSupportKind.fixed) fixedDofs.add(2 * n + 1);
    }
    // Keep the unconstrained K for the reactions.
    final kFull = [for (final row in k) [...row]];
    final rhs = [...f];
    for (final d in fixedDofs) {
      for (var c = math.max(0, d - bw); c <= math.min(dof - 1, d + bw); c++) {
        k[d][c - d + bw] = 0;
        k[c][d - c + bw] = 0;
      }
      k[d][bw] = 1;
      rhs[d] = 0;
    }
    final u = _bandSolve(k, rhs, bw);
    if (u == null || fixedDofs.isEmpty) return null;
    double ku(int r) {
      var sum = 0.0;
      for (var c = math.max(0, r - bw); c <= math.min(dof - 1, r + bw); c++) {
        sum += kFull[r][c - r + bw] * u[c];
      }
      return sum;
    }

    // Supports at the same node share it: the first takes the reaction.
    final seen = <int>{};
    final reactions = <BeamReaction>[];
    for (final s in b.supports) {
      final n = nodeAt(s.x);
      if (!seen.add(n)) {
        reactions.add(BeamReaction(s, 0, 0));
        continue;
      }
      final hasMoment = fixedDofs.contains(2 * n + 1);
      reactions.add(BeamReaction(s, ku(2 * n) - f[2 * n], hasMoment ? ku(2 * n + 1) - f[2 * n + 1] : 0));
    }
    return (reactions: reactions, v: [for (var i = 0; i < nn; i++) u[2 * i]]);
  }

  static double _intensity(BeamLoad l, double x) {
    if (l.kind == BeamLoadKind.udl) return l.w;
    final span = l.end - l.start;
    if (span <= 0) return l.wStart;
    return l.wStart + (l.wEnd - l.wStart) * ((x - l.start) / span).clamp(0.0, 1.0);
  }

  /// Shear force just right of [x] (kN; up on the left part positive).
  double shearAt(double x) {
    var v = 0.0;
    for (final r in reactions) {
      if (r.support.x <= x + 1e-9) v += r.force;
    }
    for (final l in beam.loads) {
      switch (l.kind) {
        case BeamLoadKind.point when l.x <= x + 1e-9:
          v -= l.w;
        case BeamLoadKind.udl || BeamLoadKind.uvl when l.start < x:
          final c = math.min(x, l.end);
          v -= (l.wStart + _intensity(l, c)) * (c - l.start) / 2;
        default:
      }
    }
    return v;
  }

  /// Bending moment just right of [x] (kN·m; sagging positive).
  double momentAt(double x) {
    var m = 0.0;
    for (final r in reactions) {
      if (r.support.x <= x + 1e-9) m += r.force * (x - r.support.x) - r.moment;
    }
    for (final l in beam.loads) {
      switch (l.kind) {
        case BeamLoadKind.point when l.x <= x + 1e-9:
          m -= l.w * (x - l.x);
        case BeamLoadKind.moment when l.x <= x + 1e-9:
          m += l.w;
        case BeamLoadKind.udl || BeamLoadKind.uvl when l.start < x:
          final c = math.min(x, l.end), h = c - l.start, w1 = l.wStart, wc = _intensity(l, c);
          final force = (w1 + wc) * h / 2;
          final firstMoment = l.start * force + h * h * (w1 + 2 * wc) / 6; // ∫ w(s)·s ds
          m -= force * x - firstMoment;
        default:
      }
    }
    return m;
  }

  /// Points along the beam for drawing the diagrams: each node, with the key points twice (just
  /// left and just right) so jumps show.
  List<double> get samples {
    final out = <double>[];
    final keys = {for (final s in beam.supports) s.x, for (final l in beam.loads) ...[l.start, l.end]};
    for (final x in _nodes) {
      if (keys.any((k) => (k - x).abs() < 1e-9) && x > 0) out.add(x - 1e-7);
      out.add(x);
    }
    return out;
  }

  /// Deflection in mm (down negative) at the nodes when EI is given, else in units of 1/EI (m).
  List<(double x, double v)> get deflection {
    final scale = beam.ei > 0 ? 1000 / beam.ei : 1.0;
    return [for (var i = 0; i < _nodes.length; i++) (_nodes[i], _v[i] * scale)];
  }

  ({double x, double v}) get maxDeflection {
    var best = (x: 0.0, v: 0.0);
    for (final (x, v) in deflection) {
      if (v.abs() > best.v.abs()) best = (x: x, v: v);
    }
    return best;
  }

  ({double x, double v}) _extreme(double Function(double) f) {
    var best = (x: 0.0, v: 0.0);
    for (final x in samples) {
      final v = f(x);
      if (v.abs() > best.v.abs() + 1e-9) best = (x: x, v: v);
    }
    return best;
  }

  ({double x, double v}) get maxShear => _extreme(shearAt);

  /// The largest bending moment by size, looked for at every node and where the shear changes sign.
  ({double x, double v}) get maxMoment {
    var best = _extreme(momentAt);
    for (final x in zeroShear) {
      final v = momentAt(x);
      if (v.abs() > best.v.abs() + 1e-9) best = (x: x, v: v);
    }
    return best;
  }

  /// The largest sagging (positive) and hogging (negative) moments.
  ({double x, double v}) get maxSagging {
    var best = (x: 0.0, v: 0.0);
    for (final x in [...samples, ...zeroShear]) {
      final v = momentAt(x);
      if (v > best.v + 1e-9) best = (x: x, v: v);
    }
    return best;
  }

  ({double x, double v}) get maxHogging {
    var best = (x: 0.0, v: 0.0);
    for (final x in [...samples, ...zeroShear]) {
      final v = momentAt(x);
      if (v < best.v - 1e-9) best = (x: x, v: v);
    }
    return best;
  }

  double get _momentScale => math.max(1e-9, samples.fold(0.0, (a, x) => math.max(a, momentAt(x).abs())));
  double get _shearScale => math.max(1e-9, samples.fold(0.0, (a, x) => math.max(a, shearAt(x).abs())));

  /// Where the shear force crosses zero gradually (under a distributed load), found by bisection.
  List<double> get zeroShear => _roots(shearAt, _shearScale);

  /// Points of contraflexure: where the bending moment changes sign within the span.
  List<double> get contraflexure {
    final tol = _momentScale * 1e-6;
    return [
      for (final x in _roots(momentAt, _momentScale))
        if (x > 1e-6 && x < beam.length - 1e-6 && momentAt(x - 1e-4).sign != momentAt(x + 1e-4).sign && momentAt(x).abs() <= tol * 100) x,
    ];
  }

  List<double> _roots(double Function(double) f, double scale) {
    final xs = samples, out = <double>[];
    final tol = scale * 1e-6;
    for (var i = 1; i < xs.length; i++) {
      var a = xs[i - 1], b = xs[i];
      if (b - a < 1e-6) continue;
      var fa = f(a + 1e-9), fb = f(b - 1e-9);
      if (fa.abs() <= tol || fb.abs() <= tol || fa.sign == fb.sign) continue;
      for (var k = 0; k < 60; k++) {
        final c = (a + b) / 2, fc = f(c);
        if (fc.sign == fa.sign) {
          a = c;
          fa = fc;
        } else {
          b = c;
          fb = fc;
        }
      }
      final x = (a + b) / 2;
      if (f(x).abs() <= scale * 1e-3) out.add(x);
    }
    // Moment exactly zero at an interior node between opposite signs.
    for (var i = 1; i < xs.length - 1; i++) {
      if (f(xs[i]).abs() <= tol && f(xs[i - 1]).abs() > tol && f(xs[i + 1]).abs() > tol && f(xs[i - 1]).sign != f(xs[i + 1]).sign) out.add(xs[i]);
    }
    out.sort();
    return out;
  }
}

/// Solves a symmetric banded system (rows hold columns r−bw..r+bw); null when it is singular.
List<double>? _bandSolve(List<List<double>> a, List<double> b, int bw) {
  final n = b.length;
  final m = [for (final r in a) [...r]];
  final x = [...b];
  var scale = 0.0;
  for (final r in m) {
    scale = math.max(scale, r[bw].abs());
  }
  for (var i = 0; i < n; i++) {
    final p = m[i][bw];
    if (p.abs() <= scale * 1e-10) return null;
    for (var r = i + 1; r <= math.min(n - 1, i + bw); r++) {
      final f = m[r][i - r + bw] / p;
      if (f == 0) continue;
      for (var c = i; c <= math.min(n - 1, i + bw); c++) {
        m[r][c - r + bw] -= f * m[i][c - i + bw];
      }
      x[r] -= f * x[i];
    }
  }
  for (var i = n - 1; i >= 0; i--) {
    var s = x[i];
    for (var c = i + 1; c <= math.min(n - 1, i + bw); c++) {
      s -= m[i][c - i + bw] * x[c];
    }
    x[i] = s / m[i][bw];
  }
  return x;
}

/// Solves a small dense system with partial pivoting; null when it is singular.
List<double>? solveDense(List<List<double>> a, List<double> b) {
  final n = b.length;
  final m = [for (var i = 0; i < n; i++) [...a[i], b[i]]];
  var scale = 0.0;
  for (final r in a) {
    for (final v in r) {
      scale = math.max(scale, v.abs());
    }
  }
  if (scale == 0) return null;
  for (var c = 0; c < n; c++) {
    var p = c;
    for (var r = c + 1; r < n; r++) {
      if (m[r][c].abs() > m[p][c].abs()) p = r;
    }
    if (m[p][c].abs() <= scale * 1e-9) return null;
    final t = m[p];
    m[p] = m[c];
    m[c] = t;
    for (var r = c + 1; r < n; r++) {
      final f = m[r][c] / m[c][c];
      if (f == 0) continue;
      for (var k = c; k <= n; k++) {
        m[r][k] -= f * m[c][k];
      }
    }
  }
  final x = List<double>.filled(n, 0);
  for (var i = n - 1; i >= 0; i--) {
    var s = m[i][n];
    for (var k = i + 1; k < n; k++) {
      s -= m[i][k] * x[k];
    }
    x[i] = s / m[i][i];
  }
  return x;
}

// --- Trusses -----------------------------------------------------------------------------------

/// A pin (holds both ways), or a roller that holds across its direction: [TrussSupportKind.rollerX]
/// rolls along x (holds y), [TrussSupportKind.rollerY] rolls along y (holds x).
enum TrussSupportKind { pin, rollerX, rollerY }

class TrussNode {
  const TrussNode(this.x, this.y, {this.label = '', this.support, this.fx = 0, this.fy = 0});
  factory TrussNode.fromJson(Object? j) {
    final m = _m(j);
    return TrussNode(_d(m['x']), _d(m['y']), label: _s(m['n']), support: TrussSupportKind.values.asNameMap()[m['s']], fx: _d(m['fx']), fy: _d(m['fy']));
  }
  final double x, y;
  final String label;
  final TrussSupportKind? support;

  /// The load on the joint (kN; up and right positive).
  final double fx, fy;

  TrussNode copyWith({double? x, double? y, String? label, TrussSupportKind? support, bool clearSupport = false, double? fx, double? fy}) =>
      TrussNode(x ?? this.x, y ?? this.y, label: label ?? this.label, support: clearSupport ? null : (support ?? this.support), fx: fx ?? this.fx, fy: fy ?? this.fy);

  Map<String, Object?> toJson() => {'x': _r(x), 'y': _r(y), 'n': label, if (support != null) 's': support!.name, if (fx != 0) 'fx': _r(fx), if (fy != 0) 'fy': _r(fy)};
}

class TrussModel {
  const TrussModel({this.title = 'Truss', this.nodes = const [], this.members = const []});

  factory TrussModel.fromJson(Map<String, Object?> j) {
    final nodes = [for (final n in _l(j['n'])) TrussNode.fromJson(n)];
    return TrussModel(
      title: _s(j['title'], 'Truss'),
      nodes: nodes,
      members: [
        for (final m in _l(j['m']))
          if (_l(m) case [final a, final b] when _i(a) != _i(b) && _i(a) >= 0 && _i(b) >= 0 && _i(a) < nodes.length && _i(b) < nodes.length) (_i(a), _i(b)),
      ],
    );
  }

  final String title;
  final List<TrussNode> nodes;
  final List<(int, int)> members;

  Map<String, Object?> toJson() => {
    'title': title,
    'n': [for (final n in nodes) n.toJson()],
    'm': [for (final (a, b) in members) [a, b]],
  };

  TrussModel copyWith({String? title, List<TrussNode>? nodes, List<(int, int)>? members}) =>
      TrussModel(title: title ?? this.title, nodes: nodes ?? this.nodes, members: members ?? this.members);

  String nameOf(int i) => nodes[i].label.isNotEmpty ? nodes[i].label : String.fromCharCode(65 + i % 26);

  double lengthOf(int m) {
    final (a, b) = members[m];
    return math.sqrt(math.pow(nodes[b].x - nodes[a].x, 2) + math.pow(nodes[b].y - nodes[a].y, 2));
  }

  TrussResult solve() => TrussResult.of(this);
}

enum TrussStatus { determinate, indeterminate, unstable }

/// A truss worked out: member forces (kN, tension positive) and the support reactions. A
/// determinate truss (m + r = 2j) is solved by the method of joints, all joint equations at once
/// as one matrix; an indeterminate one by the stiffness method with every member's AE the same.
class TrussResult {
  TrussResult._(this.status, this.forces, this.reactions);

  factory TrussResult.of(TrussModel t) {
    final cached = _cache[t];
    if (cached != null) return cached;
    final r = _solve(t);
    _cache[t] = r;
    return r;
  }

  static final _cache = Expando<TrussResult>();

  final TrussStatus status;

  /// Force in each member, tension positive; empty when unstable.
  final List<double> forces;

  /// Each restrained joint's reaction (kN; up and right positive).
  final Map<int, ({double rx, double ry})> reactions;

  static List<(int node, bool isX)> _restraints(TrussModel t) => [
    for (final (i, n) in t.nodes.indexed) ...switch (n.support) {
      TrussSupportKind.pin => [(i, true), (i, false)],
      TrussSupportKind.rollerX => [(i, false)],
      TrussSupportKind.rollerY => [(i, true)],
      null => const <(int, bool)>[],
    },
  ];

  static TrussResult _solve(TrussModel t) {
    final j = t.nodes.length, m = t.members.length;
    final rs = _restraints(t);
    final unstable = TrussResult._(TrussStatus.unstable, const [], const {});
    if (j < 2 || m == 0 || m + rs.length < 2 * j) return unstable;
    for (var k = 0; k < m; k++) {
      if (t.lengthOf(k) < 1e-9) return unstable;
    }
    if (m + rs.length == 2 * j) {
      // Method of joints: at each joint ΣFx = 0 and ΣFy = 0 with the member forces (pulling
      // away from the joint when in tension) and the reactions as unknowns.
      final a = List.generate(2 * j, (_) => List<double>.filled(m + rs.length, 0));
      final b = List<double>.filled(2 * j, 0);
      for (final (k, (p, q)) in t.members.indexed) {
        final len = t.lengthOf(k), cx = (t.nodes[q].x - t.nodes[p].x) / len, cy = (t.nodes[q].y - t.nodes[p].y) / len;
        a[2 * p][k] += cx;
        a[2 * p + 1][k] += cy;
        a[2 * q][k] -= cx;
        a[2 * q + 1][k] -= cy;
      }
      for (final (k, (node, isX)) in rs.indexed) {
        a[2 * node + (isX ? 0 : 1)][m + k] = 1;
      }
      for (final (i, n) in t.nodes.indexed) {
        b[2 * i] = -n.fx;
        b[2 * i + 1] = -n.fy;
      }
      final x = solveDense(a, b);
      if (x == null) return unstable;
      return TrussResult._(TrussStatus.determinate, x.sublist(0, m), _gather(rs, x.sublist(m)));
    }
    // Stiffness method (AE = 1).
    final n = 2 * j;
    final k = List.generate(n, (_) => List<double>.filled(n, 0));
    final dirs = <(double, double)>[];
    for (final (e, (p, q)) in t.members.indexed) {
      final len = t.lengthOf(e), c = (t.nodes[q].x - t.nodes[p].x) / len, s = (t.nodes[q].y - t.nodes[p].y) / len;
      dirs.add((c, s));
      final ids = [2 * p, 2 * p + 1, 2 * q, 2 * q + 1];
      final v = [-c, -s, c, s];
      for (var r = 0; r < 4; r++) {
        for (var cc = 0; cc < 4; cc++) {
          k[ids[r]][ids[cc]] += v[r] * v[cc] / len;
        }
      }
    }
    final fixed = {for (final (node, isX) in rs) 2 * node + (isX ? 0 : 1)};
    final free = [for (var d = 0; d < n; d++) if (!fixed.contains(d)) d];
    final f = [for (final nd in t.nodes) ...[nd.fx, nd.fy]];
    final u0 = solveDense([for (final r in free) [for (final c in free) k[r][c]]], [for (final r in free) f[r]]);
    if (u0 == null) return unstable;
    final u = List<double>.filled(n, 0);
    for (final (i, d) in free.indexed) {
      u[d] = u0[i];
    }
    final forces = [
      for (final (e, (p, q)) in t.members.indexed) (dirs[e].$1 * (u[2 * q] - u[2 * p]) + dirs[e].$2 * (u[2 * q + 1] - u[2 * p + 1])) / t.lengthOf(e),
    ];
    final react = <double>[];
    for (final (node, isX) in rs) {
      final d = 2 * node + (isX ? 0 : 1);
      var s = 0.0;
      for (var c = 0; c < n; c++) {
        s += k[d][c] * u[c];
      }
      react.add(s - f[d]);
    }
    return TrussResult._(TrussStatus.indeterminate, forces, _gather(rs, react));
  }

  static Map<int, ({double rx, double ry})> _gather(List<(int, bool)> rs, List<double> values) {
    final out = <int, ({double rx, double ry})>{};
    for (final (k, (node, isX)) in rs.indexed) {
      final r = out[node] ?? (rx: 0.0, ry: 0.0);
      out[node] = isX ? (rx: r.rx + values[k], ry: r.ry) : (rx: r.rx, ry: r.ry + values[k]);
    }
    return out;
  }
}

// --- Levelling ---------------------------------------------------------------------------------

/// One line of a level book: a station with its back sight, intermediate sight and fore sight
/// (m; empty when not taken). A change point has both a fore sight and a back sight.
class LevelRow {
  const LevelRow(this.station, {this.bs, this.ins, this.fs, this.remark = ''});
  factory LevelRow.fromJson(Object? j) {
    final m = _m(j);
    double? n(Object? v) => v == null || (v is String && v.trim().isEmpty) ? null : _d(v);
    return LevelRow(_s(m['st']), bs: n(m['bs']), ins: n(m['is']), fs: n(m['fs']), remark: _s(m['rm']));
  }
  final String station, remark;
  final double? bs, ins, fs;

  LevelRow copyWith({String? station, double? Function()? bs, double? Function()? ins, double? Function()? fs, String? remark}) => LevelRow(
    station ?? this.station,
    bs: bs != null ? bs() : this.bs,
    ins: ins != null ? ins() : this.ins,
    fs: fs != null ? fs() : this.fs,
    remark: remark ?? this.remark,
  );

  Map<String, Object?> toJson() => {'st': station, if (bs != null) 'bs': bs, if (ins != null) 'is': ins, if (fs != null) 'fs': fs, if (remark.isNotEmpty) 'rm': remark};
}

enum LevelMethod { riseFall, heightOfInstrument }

class LevelBook {
  const LevelBook({this.title = 'Level book', this.method = LevelMethod.riseFall, this.firstRl = 100, this.rows = const []});

  factory LevelBook.fromJson(Map<String, Object?> j) => LevelBook(
    title: _s(j['title'], 'Level book'),
    method: LevelMethod.values.asNameMap()[j['method']] ?? LevelMethod.riseFall,
    firstRl: _d(j['rl'], 100),
    rows: [for (final r in _l(j['r'])) LevelRow.fromJson(r)],
  );

  final String title;
  final LevelMethod method;

  /// Reduced level of the first station (the bench mark), m.
  final double firstRl;
  final List<LevelRow> rows;

  Map<String, Object?> toJson() => {'title': title, 'method': method.name, 'rl': firstRl, 'r': [for (final r in rows) r.toJson()]};

  LevelBook copyWith({String? title, LevelMethod? method, double? firstRl, List<LevelRow>? rows}) =>
      LevelBook(title: title ?? this.title, method: method ?? this.method, firstRl: firstRl ?? this.firstRl, rows: rows ?? this.rows);

  LevelResult reduce() => LevelResult.of(this);
}

/// A level book reduced: each row's rise or fall, height of instrument and reduced level, and the
/// arithmetic checks.
class LevelResult {
  LevelResult._(this.book, this.rise, this.fall, this.hi, this.rl);

  factory LevelResult.of(LevelBook b) {
    final n = b.rows.length;
    final rise = List<double?>.filled(n, null), fall = List<double?>.filled(n, null), hi = List<double?>.filled(n, null), rl = List<double?>.filled(n, null);
    if (n > 0) rl[0] = b.firstRl;
    double? prev = b.rows.isEmpty ? null : b.rows.first.bs;
    double? height = prev == null ? null : b.firstRl + prev;
    if (n > 0) hi[0] = height;
    for (var i = 1; i < n; i++) {
      final row = b.rows[i];
      final sight = row.fs ?? row.ins;
      if (sight == null || prev == null || rl[i - 1] == null) {
        // A line without a reading: carry on from the last one.
        rl[i] = rl[i - 1];
        if (row.bs != null) prev = row.bs;
        continue;
      }
      final diff = prev - sight;
      if (diff >= 0) {
        rise[i] = diff;
      } else {
        fall[i] = -diff;
      }
      rl[i] = b.method == LevelMethod.riseFall ? rl[i - 1]! + diff : height! - sight;
      if (row.bs != null) {
        prev = row.bs;
        height = rl[i]! + row.bs!;
        hi[i] = height;
      } else {
        prev = sight;
      }
    }
    return LevelResult._(b, rise, fall, hi, rl);
  }

  final LevelBook book;
  final List<double?> rise, fall, hi, rl;

  double _sum(Iterable<double?> v) => v.fold(0.0, (a, b) => a + (b ?? 0));

  double get sumBs => _sum(book.rows.map((r) => r.bs));

  /// The fore sights, counting the last reading as a fore sight when it was booked as an
  /// intermediate sight.
  double get sumFs => _sum(book.rows.map((r) => r.fs));
  double get sumIs => _sum(book.rows.map((r) => r.ins));
  double get sumRise => _sum(rise);
  double get sumFall => _sum(fall);
  double get firstRl => rl.isEmpty ? book.firstRl : rl.first ?? book.firstRl;
  double get lastRl => rl.isEmpty ? book.firstRl : rl.last ?? book.firstRl;

  /// ΣBS − ΣFS = ΣRise − ΣFall = last RL − first RL (rise and fall method).
  bool get riseFallCheck => (sumBs - sumFs - (sumRise - sumFall)).abs() < 5e-4 && (sumBs - sumFs - (lastRl - firstRl)).abs() < 5e-4;

  /// ΣBS − ΣFS = last RL − first RL, and Σ(HI × number of IS and FS read from it) − ΣIS − ΣFS =
  /// ΣRL except the first (height of instrument method).
  bool get hiCheck => (sumBs - sumFs - (lastRl - firstRl)).abs() < 5e-4 && (hiProducts - sumIs - sumFs - rlSumExceptFirst).abs() < 5e-3;

  double get hiProducts {
    var total = 0.0;
    double? height;
    for (var i = 0; i < book.rows.length; i++) {
      final r = book.rows[i];
      if (i > 0 && height != null && (r.fs ?? r.ins) != null) total += height;
      if (hi[i] != null) height = hi[i];
    }
    return total;
  }

  double get rlSumExceptFirst {
    var total = 0.0;
    for (var i = 1; i < rl.length; i++) {
      if ((book.rows[i].fs ?? book.rows[i].ins) != null) total += rl[i] ?? 0;
    }
    return total;
  }

  bool get checks => book.method == LevelMethod.riseFall ? riseFallCheck : hiCheck;
}

// --- Compass traverse --------------------------------------------------------------------------

/// A traverse leg: [length] m on the whole circle bearing [bearing] (degrees from north,
/// clockwise).
class TraverseLeg {
  const TraverseLeg(this.name, {required this.length, required this.bearing});
  factory TraverseLeg.fromJson(Object? j) {
    final m = _m(j);
    return TraverseLeg(_s(m['n']), length: math.max(0, _d(m['l'])), bearing: _d(m['b']));
  }
  final String name;
  final double length, bearing;
  TraverseLeg copyWith({String? name, double? length, double? bearing}) => TraverseLeg(name ?? this.name, length: length ?? this.length, bearing: bearing ?? this.bearing);
  Map<String, Object?> toJson() => {'n': name, 'l': _r(length, 3), 'b': _r(bearing, 4)};

  double get _rad => bearing * math.pi / 180;
  double get latitude => length * math.cos(_rad);
  double get departure => length * math.sin(_rad);

  /// The back bearing (the bearing of the same line taken from its far end).
  double get backBearing => (bearing + 180) % 360;
}

/// "N 30°15′ E" from a whole circle bearing.
String quadrantalBearing(double wcb) {
  final b = wcb % 360;
  final (ns, ew, a) = b <= 90 ? ('N', 'E', b) : (b <= 180 ? ('S', 'E', 180 - b) : (b <= 270 ? ('S', 'W', b - 180) : ('N', 'W', 360 - b)));
  return '$ns ${degreesMinutes(a)} $ew';
}

/// 30.25 → "30°15′".
String degreesMinutes(double deg) {
  var d = deg.floor(), m = ((deg - d) * 60).round();
  if (m == 60) {
    d += 1;
    m = 0;
  }
  return '$d°${m.toString().padLeft(2, '0')}′';
}

class Traverse {
  const Traverse({this.title = 'Compass traverse', this.legs = const [], this.startE = 0, this.startN = 0});

  factory Traverse.fromJson(Map<String, Object?> j) => Traverse(
    title: _s(j['title'], 'Compass traverse'),
    legs: [for (final l in _l(j['legs'])) TraverseLeg.fromJson(l)],
    startE: _d(j['e0']),
    startN: _d(j['n0']),
  );

  final String title;
  final List<TraverseLeg> legs;
  final double startE, startN;

  Map<String, Object?> toJson() => {'title': title, 'legs': [for (final l in legs) l.toJson()], 'e0': startE, 'n0': startN};

  Traverse copyWith({String? title, List<TraverseLeg>? legs}) => Traverse(title: title ?? this.title, legs: legs ?? this.legs, startE: startE, startN: startN);

  double get perimeter => legs.fold(0.0, (a, l) => a + l.length);
  double get sumLatitude => legs.fold(0.0, (a, l) => a + l.latitude);
  double get sumDeparture => legs.fold(0.0, (a, l) => a + l.departure);

  /// The closing error: how far the last station misses the first (m).
  double get closingError => math.sqrt(sumLatitude * sumLatitude + sumDeparture * sumDeparture);

  /// The bearing of the closing error (from the end back to the start is its reverse).
  double get closingBearing => (math.atan2(sumDeparture, sumLatitude) * 180 / math.pi + 360) % 360;

  /// Relative precision 1 in N (N = perimeter ÷ closing error); infinite when it closes.
  double get precision => closingError < 1e-9 ? double.infinity : perimeter / closingError;

  /// Bowditch (compass rule) corrections to each leg's latitude and departure: in proportion
  /// to its length.
  List<({double dLat, double dDep})> get bowditch {
    final p = perimeter;
    if (p <= 0) return [for (final _ in legs) (dLat: 0.0, dDep: 0.0)];
    return [for (final l in legs) (dLat: -sumLatitude * l.length / p, dDep: -sumDeparture * l.length / p)];
  }

  /// The stations as observed (E, N), from the start; legs.length + 1 points.
  List<(double e, double n)> get observed {
    final out = [(startE, startN)];
    for (final l in legs) {
      final (e, n) = out.last;
      out.add((e + l.departure, n + l.latitude));
    }
    return out;
  }

  /// The stations after the Bowditch correction (the last one back on the first).
  List<(double e, double n)> get corrected {
    final out = [(startE, startN)];
    final c = bowditch;
    for (final (i, l) in legs.indexed) {
      final (e, n) = out.last;
      out.add((e + l.departure + c[i].dDep, n + l.latitude + c[i].dLat));
    }
    return out;
  }
}

// --- Contour sketch ----------------------------------------------------------------------------

/// Spot levels on a square grid ([cols] × [rows], [spacing] m apart; row 0 at the top), and the
/// contour interval.
class ContourGrid {
  const ContourGrid({this.title = 'Contour sketch', this.cols = 5, this.rows = 5, this.spacing = 10, this.interval = 1, this.levels = const []});

  factory ContourGrid.fromJson(Map<String, Object?> j) {
    final cols = _i(j['c'], 5).clamp(2, 30), rows = _i(j['r'], 5).clamp(2, 30);
    final z = [for (final v in _l(j['z'])) _d(v)];
    return ContourGrid(
      title: _s(j['title'], 'Contour sketch'),
      cols: cols,
      rows: rows,
      spacing: math.max(0.01, _d(j['sp'], 10)),
      interval: math.max(0.01, _d(j['ci'], 1)),
      levels: [for (var i = 0; i < cols * rows; i++) i < z.length ? z[i] : 0],
    );
  }

  /// From rows of numbers (one grid row a line, separated by spaces, commas or tabs).
  factory ContourGrid.fromText(String text, {String title = 'Contour sketch', double spacing = 10, double interval = 1}) {
    final lines = [
      for (final line in text.split(RegExp(r'\r?\n')))
        if (line.trim().isNotEmpty) [for (final p in line.trim().split(RegExp(r'[\s,;]+'))) double.tryParse(p) ?? 0],
    ];
    final cols = lines.fold(0, (m, l) => math.max(m, l.length));
    return ContourGrid(
      title: title,
      cols: math.max(2, cols),
      rows: math.max(2, lines.length),
      spacing: spacing,
      interval: interval,
      levels: [for (var r = 0; r < math.max(2, lines.length); r++) for (var c = 0; c < math.max(2, cols); c++) r < lines.length && c < lines[r].length ? lines[r][c] : 0],
    );
  }

  final String title;
  final int cols, rows;
  final double spacing, interval;
  final List<double> levels;

  double at(int c, int r) => levels[r * cols + c];

  String toText() => [for (var r = 0; r < rows; r++) [for (var c = 0; c < cols; c++) _fmt(at(c, r))].join(' ')].join('\n');

  static String _fmt(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : _r(v, 3).toString();

  Map<String, Object?> toJson() => {'title': title, 'c': cols, 'r': rows, 'sp': spacing, 'ci': interval, 'z': [for (final v in levels) _r(v, 3)]};

  ContourGrid copyWith({String? title, double? spacing, double? interval}) =>
      ContourGrid(title: title ?? this.title, cols: cols, rows: rows, spacing: spacing ?? this.spacing, interval: interval ?? this.interval, levels: levels);

  double get minLevel => levels.isEmpty ? 0 : levels.reduce(math.min);
  double get maxLevel => levels.isEmpty ? 0 : levels.reduce(math.max);

  /// The contour values between the lowest and highest spot levels, every [interval].
  List<double> get contourValues {
    if (levels.isEmpty || interval <= 0) return const [];
    final out = <double>[];
    for (var v = (minLevel / interval).ceil() * interval; v <= maxLevel + 1e-9 && out.length < 200; v += interval) {
      out.add(_r(v, 6));
    }
    return out;
  }

  /// The contour at [level] as segments in grid units (x across 0..cols−1, y down 0..rows−1),
  /// by marching squares with linear interpolation between spot levels.
  List<((double, double), (double, double))> segments(double level) {
    final out = <((double, double), (double, double))>[];
    for (var r = 0; r < rows - 1; r++) {
      for (var c = 0; c < cols - 1; c++) {
        // Corners: top-left, top-right, bottom-right, bottom-left.
        final z = [at(c, r), at(c + 1, r), at(c + 1, r + 1), at(c, r + 1)];
        final p = [(c.toDouble(), r.toDouble()), (c + 1.0, r.toDouble()), (c + 1.0, r + 1.0), (c.toDouble(), r + 1.0)];
        final cross = <(double, double)>[];
        for (var e = 0; e < 4; e++) {
          final a = z[e], b = z[(e + 1) % 4];
          final above1 = a >= level, above2 = b >= level;
          if (above1 == above2) continue;
          final t = (level - a) / (b - a);
          final (x1, y1) = p[e];
          final (x2, y2) = p[(e + 1) % 4];
          cross.add((x1 + (x2 - x1) * t, y1 + (y2 - y1) * t));
        }
        if (cross.length == 2) {
          out.add((cross[0], cross[1]));
        } else if (cross.length == 4) {
          // A saddle: pair by the cell's mean.
          final mean = z.reduce((a, b) => a + b) / 4;
          if ((mean >= level) == (z[0] >= level)) {
            out
              ..add((cross[0], cross[3]))
              ..add((cross[1], cross[2]));
          } else {
            out
              ..add((cross[0], cross[1]))
              ..add((cross[2], cross[3]));
          }
        }
      }
    }
    return out;
  }
}
