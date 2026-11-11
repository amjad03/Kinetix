import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'common.dart';

class _Con {
  _Con(this.a, this.b, this.c, this.op);
  double a, b, c;
  String op; // '<=', '<', '>=', '>'
  bool holds(double x, double y) {
    final v = a * x + b * y - c;
    return switch (op) { '<' => v < -1e-9, '>' => v > 1e-9, '>=' => v >= -1e-9, _ => v <= 1e-9 };
  }

  bool onLine(double x, double y) => (a * x + b * y - c).abs() < 1e-6 * (1 + c.abs());
  String get sym => const {'<=': '≤', '<': '<', '>=': '≥', '>': '>'}[op] ?? '≤';
  String get text {
    var s = '${coef(a, 'x', lead: true)}${a == 0 ? coef(b, 'y', lead: true) : coef(b, 'y')}';
    if (s.isEmpty) s = '0';
    return '$s $sym ${fmtT(c)}';
  }
}

/// Linear inequalities: solutions on the number line, how operations keep or flip the sign,
/// half-planes, the feasible region of a linear programme, its corner points and the
/// objective line.
///
/// Preset: {"mode": "line"|"flip"|"double"|"plane", "a": 2, "b": 3, "c": 11, "sign": "<"|"<="|">"|">=",
/// "set": "R"|"Z"|"N", "p": -1, "q": 2, "k": -2, "op": "add"|"mul", "lo": 1, "hi": 3,
/// "constraints": [{"a": 1, "b": 2, "c": 8, "op": "<="}], "nonneg": true, "x": [0, 10], "y": [0, 8],
/// "objective": {"p": 3, "q": 2, "goal": "max"}, "test": [2, 2]}.
class RegionInstrument extends StatefulWidget {
  const RegionInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<RegionInstrument> createState() => _RegionState();
}

class _RegionState extends State<RegionInstrument> {
  String mode = 'plane', sign = '<', set = 'R', op = 'mul', goal = 'max';
  double a = 2, b = 3, c = 11, p = -1, q = 2, k = -2, lo = 1, hi = 3;
  List<_Con> cons = [];
  bool nonneg = true, showObj = true;
  List<double> xr = [0, 10], yr = [0, 8];
  double op1 = 3, op2 = 2, level = 0;
  Offset? test;
  int? active;
  bool _drag = false;

  static final _presets = <String, Map<String, dynamic>>{
    'Furniture dealer': {
      'mode': 'plane',
      'constraints': [
        {'a': 1, 'b': 1, 'c': 50, 'op': '<='},
        {'a': 500, 'b': 2500, 'c': 50000, 'op': '<='},
      ],
      'x': [0, 60], 'y': [0, 30], 'objective': {'p': 50, 'q': 150, 'goal': 'max'},
    },
    'Minimise cost': {
      'mode': 'plane',
      'constraints': [
        {'a': 1, 'b': 2, 'c': 10, 'op': '>='},
        {'a': 3, 'b': 1, 'c': 15, 'op': '>='},
      ],
      'x': [0, 12], 'y': [0, 16], 'objective': {'p': 3, 'q': 5, 'goal': 'min'},
    },
    'Solve ax + b < c': {'mode': 'line', 'a': 3, 'b': 2, 'c': 8, 'sign': '<', 'set': 'R'},
    'Multiply by −2': {'mode': 'flip', 'p': -1, 'q': 2, 'k': -2, 'op': 'mul'},
  };

  @override
  void initState() {
    super.initState();
    _apply(widget.preset.isEmpty ? _presets['Furniture dealer']! : widget.preset);
    if (widget.preset.isEmpty) active = 0;
  }

  void _apply(Map<String, dynamic> m) {
    mode = ps(m, 'mode', 'plane');
    a = pd(m, 'a', 2);
    b = pd(m, 'b', 3);
    c = pd(m, 'c', 11);
    sign = ps(m, 'sign', '<');
    set = ps(m, 'set', 'R');
    p = pd(m, 'p', -1);
    q = pd(m, 'q', 2);
    k = pd(m, 'k', -2);
    op = ps(m, 'op', 'mul');
    lo = pd(m, 'lo', 1);
    hi = pd(m, 'hi', 3);
    cons = [
      if (m['constraints'] is List)
        for (final e in m['constraints'] as List)
          if (e is Map) _Con(pd(e.cast(), 'a', 1), pd(e.cast(), 'b', 1), pd(e.cast(), 'c', 1), ps(e.cast(), 'op', '<=')),
    ];
    nonneg = pb(m, 'nonneg', true);
    xr = pl(m, 'x', [0, 10]);
    yr = pl(m, 'y', [0, 8]);
    final o = (m['objective'] as Map?)?.cast<String, dynamic>();
    showObj = o != null;
    op1 = o == null ? 3 : pd(o, 'p', 3);
    op2 = o == null ? 2 : pd(o, 'q', 2);
    goal = o == null ? 'max' : ps(o, 'goal', 'max');
    final t = pl(m, 'test', []);
    test = t.length == 2 ? Offset(t[0], t[1]) : null;
    level = -1;
  }

  List<_Con> get allCons => [...cons, if (nonneg) _Con(1, 0, 0, '>='), if (nonneg) _Con(0, 1, 0, '>=')];

  /// The feasible region clipped to the view box, and its real corner points.
  (List<Offset>, List<Offset>, bool) region() {
    var poly = [Offset(xr[0], yr[0]), Offset(xr[1], yr[0]), Offset(xr[1], yr[1]), Offset(xr[0], yr[1])];
    for (final k in allCons) {
      final out = <Offset>[];
      double f(Offset p) => (k.op == '<=' || k.op == '<') ? k.c - k.a * p.dx - k.b * p.dy : k.a * p.dx + k.b * p.dy - k.c;
      for (var i = 0; i < poly.length; i++) {
        final cur = poly[i], nxt = poly[(i + 1) % poly.length];
        final fc = f(cur), fn = f(nxt);
        if (fc >= -1e-9) out.add(cur);
        if ((fc >= -1e-9) != (fn >= -1e-9)) {
          final t = fc / (fc - fn);
          out.add(cur + (nxt - cur) * t);
        }
      }
      poly = out;
      if (poly.isEmpty) break;
    }
    // Remove near-duplicate vertices.
    final clean = <Offset>[];
    for (final v in poly) {
      if (clean.isEmpty || (clean.last - v).distance > 1e-7) clean.add(v);
    }
    if (clean.length > 1 && (clean.first - clean.last).distance < 1e-7) clean.removeLast();
    final ac = allCons;
    final corners = <Offset>[];
    var unbounded = false;
    for (final v in clean) {
      // A true corner is where two boundary lines meet; any other vertex is the edge of view.
      if (ac.where((k) => k.onLine(v.dx, v.dy)).length >= 2) {
        corners.add(v);
      } else {
        unbounded = true;
      }
    }
    return (clean, corners, unbounded);
  }

  double z(Offset v) => op1 * v.dx + op2 * v.dy;

  ({Offset? best, double? value, bool exists}) optimum(List<Offset> poly, List<Offset> corners, bool unbounded) {
    if (corners.isEmpty) return (best: null, value: null, exists: false);
    Offset best = corners.first;
    for (final v in corners) {
      if (goal == 'max' ? z(v) > z(best) + 1e-9 : z(v) < z(best) - 1e-9) best = v;
    }
    if (unbounded) {
      // If the region reaches the edge of view with a better Z, the optimum does not exist.
      for (final v in poly) {
        if (goal == 'max' ? z(v) > z(best) + 1e-6 : z(v) < z(best) - 1e-6) return (best: best, value: z(best), exists: false);
      }
    }
    return (best: best, value: z(best), exists: true);
  }

  String get signSym => const {'<=': '≤', '<': '<', '>=': '≥', '>': '>'}[sign] ?? '<';

  @override
  Widget build(BuildContext context) {
    String title, formula;
    late List<Readout> ro;
    late List<Widget> ctl;
    Widget sl(String l, double v, double lo, double hi, ValueChanged<double> on, {double step = 1, int d = 0}) => IxSlider(label: l, value: v, min: lo, max: hi, divisions: ((hi - lo) / step).round(), format: (x) => fmt(x, d), onChanged: (x) => setState(() { on(x); active = null; }));
    switch (mode) {
      case 'line':
        final x0 = (c - b) / a;
        final flips = a < 0;
        final s2 = flips ? const {'<': '>', '<=': '>=', '>': '<', '>=': '<='}[sign]! : sign;
        title = 'Solve ${coef(a, 'x', lead: true)} ${signed(b)} $signSym ${fmtT(c)}';
        formula = 'x ${const {'<=': '≤', '<': '<', '>=': '≥', '>': '>'}[s2]} ${fmtT(x0, 3)}${flips ? '  (sign reversed: a < 0)' : ''}';
        ro = [
          Readout('Boundary x = (c − b)/a', fmt(x0, 3), '', IX.accent),
          Readout('Dividing by a', flips ? 'reverses the sign' : 'keeps the sign', '', flips ? IX.positive : IX.green),
          Readout('x lives in', set == 'R' ? 'R, real numbers' : set == 'Z' ? 'Z, integers' : 'N, natural numbers', '', IX.inkSoft),
        ];
        ctl = [
          IxSegments<double>(label: 'a', options: {-3.0: '−3', -2.0: '−2', -1.0: '−1', 1.0: '1', 2.0: '2', 3.0: '3'}, value: a, onChanged: (v) => setState(() => a = v)),
          sl('b', b, -6, 6, (v) => b = v),
          sl('c', c, -10, 10, (v) => c = v),
          IxSegments<String>(label: 'Sign', options: const {'<': '<', '<=': '≤', '>': '>', '>=': '≥'}, value: sign, onChanged: (v) => setState(() => sign = v)),
          IxSegments<String>(label: 'Set', options: const {'R': 'R', 'Z': 'Z', 'N': 'N'}, value: set, onChanged: (v) => setState(() => set = v)),
        ];
      case 'flip':
        final p2 = op == 'add' ? p + k : p * k, q2 = op == 'add' ? q + k : q * k;
        title = 'What keeps or flips the sign?';
        formula = '${fmtT(p)} < ${fmtT(q)}  ⇒  ${fmtT(p2)} ${p2 < q2 ? '<' : p2 > q2 ? '>' : '='} ${fmtT(q2)}';
        ro = [
          Readout('New p', fmt(p2, 1), '', IX.accent),
          Readout('New q', fmt(q2, 1), '', IX.positive),
          Readout('Order', p2 < q2 ? 'kept' : p2 > q2 ? 'reversed' : 'lost (k = 0)', '', p2 < q2 ? IX.green : MX.red),
        ];
        ctl = [
          IxSegments<String>(label: 'Operation', options: const {'add': 'Add k', 'mul': 'Multiply by k'}, value: op, onChanged: (v) => setState(() => op = v)),
          sl('p', p, -4, 4, (v) => p = math.min(v, q - 0.5), step: 0.5, d: 1),
          sl('q', q, -4, 4, (v) => q = math.max(v, p + 0.5), step: 0.5, d: 1),
          sl('k', k, -3, 3, (v) => k = v, step: 0.5, d: 1),
        ];
      case 'double':
        final m1 = math.min(p * lo + q, p * hi + q), m2 = math.max(p * lo + q, p * hi + q);
        title = 'Carry a double inequality through px + q';
        formula = '${fmtT(lo)} ≤ x ≤ ${fmtT(hi)}  ⇒  ${fmtT(m1)} ≤ ${coef(p, 'x', lead: true)} ${signed(q)} ≤ ${fmtT(m2)}';
        ro = [
          Readout('Smallest px + q', fmt(m1, 2), '', IX.accent),
          Readout('Largest px + q', fmt(m2, 2), '', IX.positive),
          Readout('p < 0?', p < 0 ? 'Yes: both signs reverse' : 'No: signs kept', '', p < 0 ? MX.red : IX.green),
        ];
        ctl = [
          sl('lo', lo, -5, 5, (v) => lo = math.min(v, hi), step: 0.5, d: 1),
          sl('hi', hi, -5, 5, (v) => hi = math.max(v, lo), step: 0.5, d: 1),
          sl('p', p, -3, 3, (v) => p = v, step: 0.5, d: 1),
          sl('q', q, -5, 5, (v) => q = v, step: 0.5, d: 1),
        ];
      default:
        final (poly, corners, unb) = region();
        final opt = optimum(poly, corners, unb);
        final maxZ = math.max(1.0, [for (final v in poly) z(v)].fold<double>(0, math.max));
        if (level < 0) level = opt.value ?? maxZ / 2;
        title = showObj ? '${goal == 'max' ? 'Maximise' : 'Minimise'} Z = ${coef(op1, 'x', lead: true)}${coef(op2, 'y')}' : 'Graph of a system of inequalities';
        formula = showObj ? (opt.exists ? 'Z${goal == 'max' ? 'max' : 'min'} = ${fmt(opt.value!, 2)} at (${fmtT(opt.best!.dx)}, ${fmtT(opt.best!.dy)})' : poly.isEmpty ? 'No feasible region' : 'Unbounded: no ${goal == 'max' ? 'maximum' : 'minimum'}') : (poly.isEmpty ? 'No common region' : 'Shaded: all conditions hold');
        final tIn = test != null && allCons.every((k) => k.holds(test!.dx, test!.dy));
        ro = [
          Readout('Corner points', '${corners.length}', '', IX.accent),
          if (showObj) Readout('Best corner', opt.best == null ? '—' : '(${fmtT(opt.best!.dx)}, ${fmtT(opt.best!.dy)})', '', IX.positive),
          if (showObj) Readout('Z there', opt.value == null ? '—' : fmt(opt.value!, 2), '', IX.green),
          Readout('Region', poly.isEmpty ? 'Empty' : unb ? 'Unbounded' : 'Bounded', '', unb ? IX.amber : IX.inkSoft),
          if (test != null) Readout('Test point (${fmtT(test!.dx, 1)}, ${fmtT(test!.dy, 1)})', tIn ? 'Inside' : 'Outside', '', tIn ? IX.green : MX.red),
        ];
        ctl = [
          if (showObj) ...[
            sl('Z: coefficient of x', op1, -10, math.max(10, op1 * 2), (v) => op1 = v, step: math.max(0.5, op1.abs() / 20).roundToDouble(), d: 0),
            sl('Z: coefficient of y', op2, -10, math.max(10, op2 * 2), (v) => op2 = v, step: math.max(0.5, op2.abs() / 20).roundToDouble(), d: 0),
            sl('Slide the line Z = k', level.clamp(0, maxZ * 1.2), 0, maxZ * 1.2, (v) => level = v, step: maxZ * 1.2 / 120, d: 0),
            IxSegments<String>(label: 'Goal', options: const {'max': 'Maximise', 'min': 'Minimise'}, value: goal, onChanged: (v) => setState(() => goal = v)),
          ],
          for (final (i, k) in cons.indexed) sl('Constraint ${i + 1}: right side', k.c, 0, math.max(k.c * 2, 10), (v) => k.c = v, step: math.max(k.c * 2, 10) / 100, d: 0),
          if (test != null) Text('Drag the test point.', style: IX.text(17, c: IX.inkSoft)),
        ];
    }
    return InstrumentFrame(
      id: 'maths-region',
      subtitle: tx(widget.preset['subtitle']) ?? (mode == 'plane' ? (showObj ? '$kMaths · Linear programming' : '$kMaths · Linear inequalities') : '$kMaths · Linear inequalities'),
      title: tx(widget.preset['title']) ?? title,
      formula: formula,
      state: {'mode': mode, 'objective': {'p': op1, 'q': op2, 'goal': goal}, 'constraints': [for (final k in cons) {'a': k.a, 'b': k.b, 'c': k.c, 'op': k.op}]},
      readouts: ro,
      controls: ctl,
      presets: [for (final (i, e) in _presets.entries.indexed) Preset(e.key, () => setState(() { _apply(e.value); active = i; }))],
      activePreset: active,
      stage: LayoutBuilder(builder: (context, box) {
        final size = box.biggest;
        final pln = _plane(size);
        return GestureDetector(
          onPanStart: (e) => _drag = test != null && (pln.p(test!.dx, test!.dy) - e.localPosition).distance < 50,
          onPanUpdate: (e) {
            if (!_drag) return;
            final w = pln.w(e.localPosition);
            setState(() => test = Offset((w.dx * 2).round() / 2, (w.dy * 2).round() / 2));
          },
          onPanEnd: (_) => _drag = false,
          child: CustomPaint(size: size, painter: _RegionPainter(this, pln)),
        );
      }),
    );
  }

  Plane _plane(Size size) => Plane(Rect.fromLTRB(90, 50, size.width - 60, size.height - 70), xr[0], xr[1], yr[0], yr[1]);
}

class _RegionPainter extends CustomPainter {
  _RegionPainter(this.s, this.pl);
  final _RegionState s;
  final Plane pl;

  @override
  void paint(Canvas c, Size size) {
    switch (s.mode) {
      case 'line':
        _line(c, size);
      case 'flip':
        _flip(c, size);
      case 'double':
        _double(c, size);
      default:
        _plane(c, size);
    }
  }

  void _numberLine(Canvas c, double y, double x0, double x1, Rect r, {String? name}) {
    final pl = Plane(Rect.fromLTRB(r.left, y - 10, r.right, y + 10), x0, x1, -1, 1);
    c.drawLine(Offset(r.left - 20, y), Offset(r.right + 20, y), MPaint.stroke(IX.ink, 2.5));
    for (var k = x0.ceil(); k <= x1.floor(); k++) {
      c.drawLine(Offset(pl.sx(k.toDouble()), y - 8), Offset(pl.sx(k.toDouble()), y + 8), MPaint.stroke(IX.ink, 1.5));
      IxPaint.label(c, fmtT(k.toDouble()), Offset(pl.sx(k.toDouble()), y + 14), size: 16, color: IX.inkSoft, align: Alignment.topCenter);
    }
    if (name != null) IxPaint.label(c, name, Offset(r.left - 30, y), size: 20, color: IX.inkSoft, w: FontWeight.w600, align: Alignment.centerRight);
  }

  void _line(Canvas c, Size size) {
    final r = Rect.fromLTRB(80, 0, size.width - 80, size.height);
    const x0 = -10.0, x1 = 10.0;
    final y = size.height * 0.5;
    final pl = Plane(Rect.fromLTRB(r.left, y - 10, r.right, y + 10), x0, x1, -1, 1);
    _numberLine(c, y, x0, x1, r);
    final bnd = (s.c - s.b) / s.a;
    final flips = s.a < 0;
    final s2 = flips ? const {'<': '>', '<=': '>=', '>': '<', '>=': '<='}[s.sign]! : s.sign;
    final right = s2 == '>' || s2 == '>=';
    final incl = s2.contains('=');
    bool ok(double x) => switch (s2) { '<' => x < bnd - 1e-9, '<=' => x <= bnd + 1e-9, '>' => x > bnd + 1e-9, _ => x >= bnd - 1e-9 };
    if (s.set == 'R') {
      final a = right ? bnd : x0 - 1, b = right ? x1 + 1 : bnd;
      c.drawLine(Offset(pl.sx(a.clamp(x0 - 0.6, x1 + 0.6)), y), Offset(pl.sx(b.clamp(x0 - 0.6, x1 + 0.6)), y), MPaint.stroke(IX.accent, 8));
      IxPaint.arrow(c, Offset(pl.sx(right ? x1 : x0), y), Offset(pl.sx(right ? x1 + 0.6 : x0 - 0.6), y), IX.accent, width: 8, head: 22);
      if (bnd >= x0 && bnd <= x1) incl ? MPaint.dot(c, Offset(pl.sx(bnd), y), IX.accent, r: 12) : MPaint.hole(c, Offset(pl.sx(bnd), y), IX.accent, r: 12);
    } else {
      for (var k = x0.ceil(); k <= x1.floor(); k++) {
        if (s.set == 'N' && k < 1) continue;
        if (ok(k.toDouble())) MPaint.dot(c, Offset(pl.sx(k.toDouble()), y), IX.accent, r: 11);
      }
    }
    if (bnd >= x0 && bnd <= x1) {
      c.drawLine(Offset(pl.sx(bnd), y - 30), Offset(pl.sx(bnd), y - 70), MPaint.stroke(IX.positive, 2));
      IxPaint.label(c, 'x = ${fmt(bnd, 2)}', Offset(pl.sx(bnd), y - 78), size: 22, color: IX.positive, w: FontWeight.w700, align: Alignment.bottomCenter, halo: true);
    }
    // Working.
    final steps = [
      '${coef(s.a, 'x', lead: true)} ${signed(s.b)} ${s.signSym} ${fmtT(s.c)}',
      '${coef(s.a, 'x', lead: true)} ${s.signSym} ${fmtT(s.c - s.b)}          (subtract ${fmtT(s.b)} from both sides)',
      'x ${const {'<=': '≤', '<': '<', '>=': '≥', '>': '>'}[s2]} ${fmtT(bnd, 3)}          (divide by ${fmtT(s.a)}${flips ? ': negative, so the sign reverses' : ''})',
    ];
    for (final (i, t) in steps.indexed) {
      IxPaint.label(c, t, Offset(80, 70 + i * 44.0), size: 23, color: i == 2 && flips ? IX.positive : IX.ink, w: i == 2 ? FontWeight.w700 : FontWeight.w500, align: Alignment.centerLeft);
    }
    IxPaint.label(c, s.set == 'R' ? 'Filled circle: end point included.  Open circle: left out.' : 'Only the ${s.set == 'Z' ? 'integers' : 'natural numbers'} that satisfy the inequality are marked.', Offset(80, size.height - 50), size: 19, color: IX.inkSoft, align: Alignment.centerLeft);
  }

  void _flip(Canvas c, Size size) {
    final r = Rect.fromLTRB(140, 0, size.width - 80, size.height);
    final y1 = size.height * 0.33, y2 = size.height * 0.68;
    const x0 = -12.0, x1 = 12.0;
    final pa = Plane(Rect.fromLTRB(r.left, y1 - 10, r.right, y1 + 10), x0, x1, -1, 1);
    _numberLine(c, y1, x0, x1, r, name: 'before');
    _numberLine(c, y2, x0, x1, r, name: 'after');
    final p2 = s.op == 'add' ? s.p + s.k : s.p * s.k, q2 = s.op == 'add' ? s.q + s.k : s.q * s.k;
    for (final (v, v2, col, n) in [(s.p, p2, IX.accent, 'p'), (s.q, q2, IX.positive, 'q')]) {
      final a = Offset(pa.sx(v), y1), b = Offset(pa.sx(v2.clamp(x0, x1)), y2);
      IxPaint.arrow(c, a + const Offset(0, 16), b - const Offset(0, 18), col.withValues(alpha: 0.6), width: 2.5);
      MPaint.dot(c, a, col, r: 12);
      MPaint.dot(c, b, col, r: 12);
      IxPaint.label(c, '$n = ${fmtT(v, 1)}', a - const Offset(0, 22), size: 21, color: col, w: FontWeight.w700, align: Alignment.bottomCenter, halo: true);
      IxPaint.label(c, '${s.op == 'add' ? '$n + k' : 'k$n'} = ${fmtT(v2, 1)}', b + const Offset(0, 44), size: 21, color: col, w: FontWeight.w700, align: Alignment.topCenter, halo: true);
    }
    final kept = p2 < q2;
    IxPaint.label(c, kept ? 'The order is kept' : p2 == q2 ? 'k = 0 squashes both to one point' : 'Multiplying by a negative number reverses the order', Offset(size.width / 2, size.height - 46), size: 24, color: kept ? IX.green : MX.red, w: FontWeight.w700);
  }

  void _double(Canvas c, Size size) {
    final r = Rect.fromLTRB(140, 0, size.width - 80, size.height);
    final y1 = size.height * 0.68, y2 = size.height * 0.3;
    const x0 = -15.0, x1 = 15.0;
    final pa = Plane(Rect.fromLTRB(r.left, 0, r.right, 1), x0, x1, 0, 1);
    _numberLine(c, y1, x0, x1, r, name: 'x');
    _numberLine(c, y2, x0, x1, r, name: 'px + q');
    c.drawLine(Offset(pa.sx(s.lo), y1), Offset(pa.sx(s.hi), y1), MPaint.stroke(IX.accent, 8));
    final m1 = s.p * s.lo + s.q, m2 = s.p * s.hi + s.q;
    c.drawLine(Offset(pa.sx(m1.clamp(x0, x1)), y2), Offset(pa.sx(m2.clamp(x0, x1)), y2), MPaint.stroke(IX.positive, 8));
    for (var t = 0; t <= 8; t++) {
      final x = s.lo + (s.hi - s.lo) * t / 8;
      final xx = (s.p * x + s.q).clamp(x0, x1);
      c.drawLine(Offset(pa.sx(x), y1 - 12), Offset(pa.sx(xx), y2 + 12), MPaint.stroke((t == 0 || t == 8 ? IX.ink : IX.steel).withValues(alpha: t == 0 || t == 8 ? 0.8 : 0.4), t == 0 || t == 8 ? 2.5 : 1.5));
    }
    for (final (x, n) in [(s.lo, 'lo'), (s.hi, 'hi')]) {
      MPaint.dot(c, Offset(pa.sx(x), y1), IX.accent, r: 11);
      IxPaint.label(c, '$n = ${fmtT(x)}', Offset(pa.sx(x), y1 + 44), size: 20, color: IX.accent, w: FontWeight.w600, align: Alignment.topCenter, halo: true);
      final v = s.p * x + s.q;
      MPaint.dot(c, Offset(pa.sx(v.clamp(x0, x1)), y2), IX.positive, r: 11);
      IxPaint.label(c, fmtT(v), Offset(pa.sx(v.clamp(x0, x1)), y2 - 22), size: 20, color: IX.positive, w: FontWeight.w600, align: Alignment.bottomCenter, halo: true);
    }
    IxPaint.label(c, s.p < 0 ? 'p < 0: the mapping lines cross, so both signs reverse' : 'p > 0: the order is kept', Offset(size.width / 2, size.height - 40), size: 22, color: s.p < 0 ? MX.red : IX.green, w: FontWeight.w600);
  }

  void _plane(Canvas c, Size size) {
    pl.paintGrid(c);
    final (poly, corners, unb) = s.region();
    // Each half-plane, faint.
    for (final (i, k) in s.cons.indexed) {
      final col = MX.series[(i + 1) % MX.series.length];
      _lineOf(c, k, col, i);
    }
    if (poly.length >= 3) {
      final path = Path()..addPolygon([for (final v in poly) pl.p(v.dx, v.dy)], true);
      c.drawPath(path, Paint()..color = IX.accent.withValues(alpha: 0.18));
      c.drawPath(path, MPaint.stroke(IX.accent, 2.5));
    }
    // Objective line Z = level.
    if (s.showObj && poly.isNotEmpty) {
      final lv = s.level;
      if (s.op2.abs() > 1e-9) {
        final a = Offset(pl.xa, (lv - s.op1 * pl.xa) / s.op2), b = Offset(pl.xb, (lv - s.op1 * pl.xb) / s.op2);
        c.save();
        c.clipRect(pl.rect);
        IxPaint.dashed(c, pl.p(a.dx, a.dy), pl.p(b.dx, b.dy), MPaint.stroke(IX.positive, 3.5), dash: 14, gap: 8);
        c.restore();
        final mid = Offset(pl.xa + (pl.xb - pl.xa) * 0.72, (lv - s.op1 * (pl.xa + (pl.xb - pl.xa) * 0.72)) / s.op2);
        if (pl.contains(mid.dx, mid.dy)) IxPaint.label(c, 'Z = ${fmt(lv, 0)}', pl.p(mid.dx, mid.dy) + const Offset(10, -20), size: 19, color: IX.positive, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
      }
    }
    final opt = s.optimum(poly, corners, unb);
    for (final v in corners) {
      final best = opt.exists && opt.best == v && s.showObj;
      MPaint.dot(c, pl.p(v.dx, v.dy), best ? IX.positive : IX.ink, r: best ? 12 : 9);
      final lab = '(${fmtT(v.dx, 1)}, ${fmtT(v.dy, 1)})${s.showObj ? '  Z = ${fmt(s.z(v), 0)}' : ''}';
      final right = pl.sx(v.dx) < pl.rect.center.dx;
      IxPaint.label(c, lab, pl.p(v.dx, v.dy) + Offset(right ? 16 : -16, -20), size: 18, color: best ? IX.positive : IX.ink, w: FontWeight.w600, align: right ? Alignment.centerLeft : Alignment.centerRight, halo: true);
    }
    if (s.test != null) {
      final t = s.test!;
      final inside = s.allCons.every((k) => k.holds(t.dx, t.dy));
      IxPaint.handle(c, pl.p(t.dx, t.dy), inside ? IX.green : MX.red, r: 15, active: s._drag);
    }
    if (unb && poly.isNotEmpty) IxPaint.label(c, 'The region goes on beyond the edge of the graph', Offset(pl.rect.right - 10, pl.rect.top + 14), size: 18, color: IX.amber, w: FontWeight.w600, align: Alignment.topRight, halo: true);
  }

  void _lineOf(Canvas c, _Con k, Color col, int i) {
    final pts = <Offset>[];
    if (k.b.abs() > 1e-9) {
      for (final x in [pl.xa, pl.xb]) {
        pts.add(Offset(x, (k.c - k.a * x) / k.b));
      }
    } else if (k.a.abs() > 1e-9) {
      pts.addAll([Offset(k.c / k.a, pl.ya), Offset(k.c / k.a, pl.yb)]);
    }
    if (pts.length < 2) return;
    c.save();
    c.clipRect(pl.rect);
    final paint = MPaint.stroke(col, 3);
    if (k.op == '<' || k.op == '>') {
      IxPaint.dashed(c, pl.p(pts[0].dx, pts[0].dy), pl.p(pts[1].dx, pts[1].dy), paint);
    } else {
      c.drawLine(pl.p(pts[0].dx, pts[0].dy), pl.p(pts[1].dx, pts[1].dy), paint);
    }
    c.restore();
    // Label where the line meets the view, near an axis.
    final t = 0.18 + 0.2 * i;
    var at = pts[0] + (pts[1] - pts[0]) * t;
    for (var j = 0; j < 20 && !pl.contains(at.dx, at.dy); j++) {
      at = pts[0] + (pts[1] - pts[0]) * (0.05 + j * 0.045);
    }
    if (pl.contains(at.dx, at.dy)) IxPaint.label(c, k.text, pl.p(at.dx, at.dy) + const Offset(12, -16), size: 19, color: col, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
