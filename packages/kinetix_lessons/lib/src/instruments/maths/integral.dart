import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'common.dart';
import 'plotter.dart' show SpecModel;

double simpson(double Function(double) f, double a, double b, [int n = 1000]) {
  if (a == b) return 0;
  final h = (b - a) / n;
  var s = f(a) + f(b);
  for (var i = 1; i < n; i++) {
    s += f(a + i * h) * (i.isOdd ? 4 : 2);
  }
  return s * h / 3;
}

/// Integrals as areas: Riemann sums closing in on the definite integral, the area between two
/// curves, horizontal strips, the area function A(x) whose slope is f(x), the family of
/// antiderivatives F(x) + C, and the symmetry of odd and even functions.
///
/// Preset: {"mode": "riemann"|"area"|"between"|"accumulate"|"family"|"ystrips"|"symmetry", "f": "x^2",
/// "g": "x", "fName": "y = x²", "gName": "y = x", "a": 0, "b": 2, "n": 8, "rule": "left"|"right"|"mid"|
/// "trapezium", "auto": true, "sliders": [...], "x": [-1, 3], "y": [-1, 5]}.
class IntegralInstrument extends StatefulWidget {
  const IntegralInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<IntegralInstrument> createState() => _IntState();
}

class _IntState extends State<IntegralInstrument> {
  late SpecModel model;
  String mode = 'riemann', rule = 'mid';
  double a = 0, b = 2, xNow = 1;
  int n = 8;
  int? active = 0;

  Map<String, dynamic> get p => widget.preset.isEmpty ? _demo : widget.preset;
  static const _demo = {'mode': 'riemann', 'f': 'x^2', 'fName': 'y = x²', 'a': 0, 'b': 2, 'n': 8, 'x': [-0.5, 2.5], 'y': [-0.5, 4.5]};

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    model = SpecModel(p);
    final env = model.env();
    mode = ps(p, 'mode', 'riemann');
    rule = ps(p, 'rule', 'mid');
    a = Expr.safe(p['a'] ?? 0)(env);
    b = Expr.safe(p['b'] ?? 2)(env);
    n = pint(p, 'n', 8);
    xNow = p['x0'] != null ? Expr.safe(p['x0'])(env) : (a + b) / 2 + (b - a) * 0.2;
  }

  Env get env => model.env();
  double f(double x) => Expr.safe(p['f'] ?? 'x^2')({...env, 'x': x});
  double g(double x) => Expr.safe(p['g'] ?? '0')({...env, 'x': x});
  double gy(double y) => Expr.safe(p['f'] ?? 'y^2')({...env, 'y': y, 'x': y});

  List<double> get lims {
    if (mode == 'between' && p['auto'] == true) {
      final xr = range;
      final roots = <double>[];
      double d(double x) => f(x) - g(x);
      const k = 800;
      for (var i = 0; i < k; i++) {
        final x1 = xr[0] + (xr[1] - xr[0]) * i / k, x2 = xr[0] + (xr[1] - xr[0]) * (i + 1) / k;
        final d1 = d(x1), d2 = d(x2);
        if (d1 == 0) roots.add(x1);
        if (d1.isFinite && d2.isFinite && d1 * d2 < 0) {
          var lo = x1, hi = x2;
          for (var j = 0; j < 50; j++) {
            final m = (lo + hi) / 2;
            if (d(m) * d(lo) <= 0) {
              hi = m;
            } else {
              lo = m;
            }
          }
          roots.add((lo + hi) / 2);
        }
      }
      if (roots.length >= 2) return [roots.first, roots.last];
    }
    return [a, b];
  }

  List<double> get range => p['x'] is List ? [for (final v in p['x'] as List) Expr.safe(v)(env)] : [math.min(a, b) - 1, math.max(a, b) + 1];

  double riemann() {
    final w = (b - a) / n;
    var s = 0.0;
    for (var i = 0; i < n; i++) {
      final x0 = a + i * w;
      s += switch (rule) { 'left' => f(x0), 'right' => f(x0 + w), 'trapezium' => (f(x0) + f(x0 + w)) / 2, _ => f(x0 + w / 2) } * w;
    }
    return s;
  }

  @override
  Widget build(BuildContext context) {
    final fName = tx(p['fName']) ?? 'y = f(x)';
    final [lo, hi] = lims;
    late List<Readout> ro;
    late String title, formula;
    final ctl = <Widget>[];
    final xr = range;
    Widget sl(String l, double v, double mn, double mx, ValueChanged<double> on, {int d = 2, int div = 100}) => IxSlider(label: l, value: v.clamp(mn, mx), min: mn, max: mx, divisions: div, format: (x) => fmt(x, d), onChanged: (x) => setState(() { on(x); active = null; }));
    switch (mode) {
      case 'between':
        final area = simpson((x) => (f(x) - g(x)).abs(), lo, hi, 2000);
        title = 'Area between two curves';
        formula = 'A = ∫ |f(x) − g(x)| dx from ${fmt(lo, 2)} to ${fmt(hi, 2)}';
        ro = [
          Readout('From x =', fmt(lo, 3), '', IX.ink),
          Readout('To x =', fmt(hi, 3), '', IX.ink),
          Readout('Area', fmt(area, 3), 'sq. units', IX.positive),
          ...model.readoutCards(env, max: 2),
        ];
        if (p['auto'] != true) ctl.addAll([sl('a', a, xr[0], b, (x) => a = x), sl('b', b, a, xr[1], (x) => b = x)]);
      case 'accumulate':
        final A = simpson(f, a, xNow);
        title = 'The area function and its slope';
        formula = 'A(x) = ∫ f(t) dt from a to x,   A′(x) = f(x)';
        ro = [
          Readout('x', fmt(xNow, 2), '', IX.ink),
          Readout('A(x)', fmt(A, 3), '', IX.accent),
          Readout('f(x)', fmt(f(xNow), 3), '', IX.positive),
          Readout('Slope of A at x', fmt((simpson(f, a, xNow + 1e-3) - simpson(f, a, xNow - 1e-3)) / 2e-3, 3), '', IX.green),
        ];
        ctl.add(sl('x', xNow, xr[0], xr[1], (x) => xNow = x));
      case 'family':
        final c0 = model.values['C'] ?? pd(p, 'C', 0);
        title = 'One derivative, many antiderivatives';
        formula = '∫ f(x) dx = F(x) + C';
        ro = [
          Readout('C', fmt(c0, 1), '', IX.positive),
          Readout('F(x₀) + C', fmt(simpson(f, 0, xNow) + c0, 3), '', IX.accent),
          Readout('Slope at x₀ (same for every C)', fmt(f(xNow), 3), '', IX.green),
        ];
        ctl.addAll([sl('x₀', xNow, xr[0], xr[1], (x) => xNow = x), if (!model.values.containsKey('C')) sl('C', c0, -4, 4, (x) => model.values['C'] = x, d: 1, div: 16)]);
      case 'ystrips':
        final area = simpson((y) => gy(y).abs(), a, b, 1000);
        title = 'Horizontal strips';
        formula = 'A = ∫ x dy from y = ${fmtT(a)} to ${fmtT(b)}';
        ro = [Readout('Area', fmt(area, 3), 'sq. units', IX.positive), Readout('Strips', '$n', '', IX.ink), Readout('Sum of strips', fmt(_stripSum(), 3), '', IX.accent)];
        ctl.addAll([sl('c (lower y)', a, 0, b, (x) => a = x), sl('d (upper y)', b, a, xr[1], (x) => b = x), sl('Strips n', n.toDouble(), 2, 40, (x) => n = x.round(), d: 0, div: 38)]);
      case 'symmetry':
        final left = simpson(f, -b, 0), right = simpson(f, 0, b);
        title = 'Odd part cancels, even part doubles';
        formula = '∫ f from −a to a = ${left.abs() < 1e-6 && right.abs() < 1e-6 ? '0' : (left - right).abs() < 1e-6 ? '2∫ f from 0 to a' : (left + right).abs() < 1e-6 ? '0 (odd)' : 'the sum of both halves'}';
        ro = [
          Readout('∫ from −a to 0', fmt(left, 3), '', IX.accent),
          Readout('∫ from 0 to a', fmt(right, 3), '', IX.positive),
          Readout('∫ from −a to a', fmt(left + right, 3), '', IX.ink),
          Readout('f is', (f(0.7) - f(-0.7)).abs() < 1e-9 ? 'even' : (f(0.7) + f(-0.7)).abs() < 1e-9 ? 'odd' : 'neither', '', IX.green),
        ];
        ctl.add(sl('a', b, 0.2, xr[1], (x) => b = x));
      case 'area':
        final signedA = simpson(f, a, b), absA = simpson((x) => f(x).abs(), a, b);
        title = 'Area under a curve';
        formula = '∫ f(x) dx from ${fmtT(a, 2)} to ${fmtT(b, 2)}';
        ro = [
          Readout('Definite integral', fmt(signedA, 3), '', IX.accent),
          Readout('Area (counted positive)', fmt(absA, 3), 'sq. units', IX.positive),
          ...model.readoutCards(env, max: 3),
        ];
        ctl.addAll([sl('a', a, xr[0], b, (x) => a = x), sl('b', b, a, xr[1], (x) => b = x)]);
      default:
        final exact = simpson(f, a, b), sum = riemann();
        title = 'Riemann sums';
        formula = 'Σ f(xᵢ) Δx → ∫ f(x) dx';
        ro = [
          Readout('Strips n', '$n', '', IX.ink),
          Readout('Sum of strips', fmt(sum, 4), '', IX.accent),
          Readout('Exact integral', fmt(exact, 4), '', IX.positive),
          Readout('Error', fmt(sum - exact, 4), '', IX.inkSoft),
        ];
        ctl.addAll([
          sl('Strips n', n.toDouble(), 1, 60, (x) => n = x.round(), d: 0, div: 59),
          IxSegments<String>(label: 'Height from', options: const {'left': 'Left', 'mid': 'Middle', 'right': 'Right', 'trapezium': 'Trapezium'}, value: rule, onChanged: (v) => setState(() => rule = v)),
          sl('a', a, xr[0], b, (x) => a = x),
          sl('b', b, a, xr[1], (x) => b = x),
        ]);
    }
    ctl.addAll(model.controls(setState));
    return InstrumentFrame(
      id: 'maths-integral',
      subtitle: tx(p['subtitle']) ?? (mode == 'between' || mode == 'ystrips' || mode == 'area' ? '$kMaths · Application of integrals' : '$kMaths · Integrals'),
      title: tx(p['title']) ?? title,
      formula: mode == 'between' ? formula : '$fName   ·   $formula',
      state: {'mode': mode, 'a': a, 'b': b, 'n': n, 'rule': rule, ...model.values},
      readouts: ro,
      controls: ctl,
      presets: [Preset('Start values', () => setState(() { _load(); active = 0; }))],
      activePreset: active,
      stage: CustomPaint(painter: _IntPainter(this, lo, hi), size: Size.infinite),
    );
  }

  double _stripSum() {
    final w = (b - a) / n;
    var s = 0.0;
    for (var i = 0; i < n; i++) {
      s += gy(a + (i + 0.5) * w).abs() * w;
    }
    return s;
  }
}

class _IntPainter extends CustomPainter {
  _IntPainter(this.s, this.lo, this.hi);
  final _IntState s;
  final double lo, hi;

  Plane plane(Rect r, double Function(double) fn, {List<double Function(double)> more = const []}) {
    final e = s.env;
    final xr = s.range;
    List<double> yr = s.p['y'] is List ? [for (final v in s.p['y'] as List) Expr.safe(v)(e)] : const [];
    if (yr.length < 2) {
      var l = 0.0, h = 0.0;
      for (final g in [fn, ...more]) {
        for (var i = 0; i <= 200; i++) {
          final y = g(xr[0] + (xr[1] - xr[0]) * i / 200);
          if (y.isFinite) {
            l = math.min(l, y);
            h = math.max(h, y);
          }
        }
      }
      final pad = (h - l) * 0.12 + 0.3;
      yr = [l - pad, h + pad];
    }
    return Plane(r, xr[0], xr[1], yr[0], yr[1], equal: s.p['equal'] == true);
  }

  @override
  void paint(Canvas c, Size size) {
    final full = Rect.fromLTRB(90, 46, size.width - 50, size.height - 60);
    switch (s.mode) {
      case 'between':
        final pl = plane(full, s.f, more: [s.g]);
        pl.paintGrid(c);
        pl.fillBetween(c, s.f, s.g, lo, hi, IX.positive.withValues(alpha: 0.2));
        // A few vertical strips to show the element of area.
        for (var i = 0; i < 12; i++) {
          final x = lo + (hi - lo) * (i + 0.5) / 12;
          c.drawLine(pl.p(x, s.f(x)), pl.p(x, s.g(x)), MPaint.stroke(IX.positive.withValues(alpha: 0.35), 1.5));
        }
        pl.curve(c, s.f, IX.accent, width: 4);
        pl.curve(c, s.g, IX.green, width: 4);
        for (final x in [lo, hi]) {
          MPaint.dot(c, pl.p(x, s.f(x)), IX.ink, r: 8);
          IxPaint.label(c, '(${fmt(x, 2)}, ${fmt(s.f(x), 2)})', pl.p(x, s.f(x)) + const Offset(14, -18), size: 17, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
        }
        MPaint.legend(c, Offset(pl.rect.left + 16, pl.rect.top + 8), [(IX.accent, tx(s.p['fName']) ?? 'y = f(x)'), (IX.green, tx(s.p['gName']) ?? 'y = g(x)')]);
      case 'accumulate':
        final tp = plane(Rect.fromLTRB(90, 46, size.width - 50, size.height * 0.52), s.f);
        tp.paintGrid(c, yLabel: 'f');
        tp.fillBetween(c, s.f, null, s.a, s.xNow, IX.accent.withValues(alpha: 0.2));
        tp.curve(c, s.f, IX.ink, width: 4);
        MPaint.dot(c, tp.p(s.xNow, s.f(s.xNow)), IX.positive, r: 8);
        double A(double x) => simpson(s.f, s.a, x, 200);
        final bp = plane(Rect.fromLTRB(90, size.height * 0.6, size.width - 50, size.height - 40), A);
        bp.paintGrid(c, yLabel: 'A(x)');
        bp.curve(c, A, IX.accent, width: 4);
        final ax = A(s.xNow), m = s.f(s.xNow);
        c.save();
        c.clipRect(bp.rect);
        c.drawLine(bp.p(s.xNow - 1, ax - m), bp.p(s.xNow + 1, ax + m), MPaint.stroke(IX.positive, 3));
        c.restore();
        MPaint.dot(c, bp.p(s.xNow, ax), IX.positive, r: 8);
        IxPaint.dashed(c, Offset(tp.sx(s.xNow), tp.rect.bottom), Offset(bp.sx(s.xNow), bp.rect.top), MPaint.stroke(IX.steel, 1.5), dash: 5, gap: 5);
        IxPaint.label(c, 'shaded area = A(x)', Offset(tp.rect.left + 16, tp.rect.top + 10), size: 19, color: IX.accent, w: FontWeight.w600, align: Alignment.topLeft, halo: true);
        IxPaint.label(c, 'slope of A(x) = f(x)', Offset(bp.rect.left + 16, bp.rect.top + 10), size: 19, color: IX.positive, w: FontWeight.w600, align: Alignment.topLeft, halo: true);
      case 'family':
        final c0 = s.model.values['C'] ?? pd(s.p, 'C', 0);
        double F(double x) => simpson(s.f, 0, x, 200);
        final pl = plane(full, (x) => F(x) + 4, more: [(x) => F(x) - 4]);
        pl.paintGrid(c);
        for (var k = -4; k <= 4; k++) {
          pl.curve(c, (x) => F(x) + k, IX.accent.withValues(alpha: 0.25), width: 2);
        }
        pl.curve(c, (x) => F(x) + c0, IX.accent, width: 4.5);
        // Parallel tangents at x0.
        for (final k in [-2.0, 0.0, 2.0, c0]) {
          final y = F(s.xNow) + k, m = s.f(s.xNow);
          c.save();
          c.clipRect(pl.rect);
          c.drawLine(pl.p(s.xNow - 0.8, y - 0.8 * m), pl.p(s.xNow + 0.8, y + 0.8 * m), MPaint.stroke(IX.positive, k == c0 ? 3.5 : 2));
          c.restore();
          MPaint.dot(c, pl.p(s.xNow, y), IX.positive, r: k == c0 ? 8 : 5);
        }
        IxPaint.label(c, 'Every curve F(x) + C has the same slope f(x) at each x', Offset(pl.rect.left + 16, pl.rect.top + 10), size: 19, color: IX.inkSoft, w: FontWeight.w600, align: Alignment.topLeft, halo: true);
      case 'ystrips':
        final pl = plane(full, (x) => 0);
        final e = s.env;
        final yr = s.p['y'] is List ? [for (final v in s.p['y'] as List) Expr.safe(v)(e)] : [0.0, 5.0];
        final pp = Plane(full, pl.xa, pl.xb, yr[0], yr[1], equal: s.p['equal'] == true);
        pp.paintGrid(c);
        final w = (s.b - s.a) / s.n;
        for (var i = 0; i < s.n; i++) {
          final y = s.a + (i + 0.5) * w;
          final x = s.gy(y);
          final r = Rect.fromLTRB(pp.sx(math.min(0, x)), pp.sy(s.a + (i + 1) * w), pp.sx(math.max(0, x)), pp.sy(s.a + i * w));
          c.drawRect(r, Paint()..color = IX.positive.withValues(alpha: 0.25));
          c.drawRect(r, MPaint.stroke(IX.positive.withValues(alpha: 0.6), 1));
        }
        final path = Path();
        for (var i = 0; i <= 300; i++) {
          final y = pp.ya + (pp.yb - pp.ya) * i / 300;
          final q = pp.p(s.gy(y), y);
          i == 0 ? path.moveTo(q.dx, q.dy) : path.lineTo(q.dx, q.dy);
        }
        c.save();
        c.clipRect(pp.rect);
        c.drawPath(path, MPaint.stroke(IX.ink, 4));
        c.restore();
        for (final y in [s.a, s.b]) {
          IxPaint.dashed(c, pp.p(pp.xa, y), pp.p(pp.xb, y), MPaint.stroke(IX.accent, 2), dash: 8, gap: 6);
          IxPaint.label(c, 'y = ${fmtT(y, 2)}', pp.p(pp.xb, y) + const Offset(-8, -14), size: 18, color: IX.accent, w: FontWeight.w600, align: Alignment.centerRight, halo: true);
        }
        IxPaint.label(c, tx(s.p['fName']) ?? 'x = g(y)', Offset(pp.rect.left + 16, pp.rect.top + 10), size: 22, color: IX.ink, w: FontWeight.w700, align: Alignment.topLeft, halo: true);
      case 'symmetry':
        final pl = plane(full, s.f);
        pl.paintGrid(c);
        pl.fillBetween(c, s.f, null, -s.b, 0, IX.accent.withValues(alpha: 0.2));
        pl.fillBetween(c, s.f, null, 0, s.b, IX.positive.withValues(alpha: 0.2));
        pl.curve(c, s.f, IX.ink, width: 4.5);
        for (final x in [-s.b, s.b]) {
          IxPaint.dashed(c, pl.p(x, 0), pl.p(x, s.f(x).clamp(pl.ya, pl.yb)), MPaint.stroke(IX.steel, 2), dash: 6, gap: 5);
        }
        IxPaint.label(c, '−a', pl.p(-s.b, 0) + const Offset(0, 34), size: 19, color: IX.accent, w: FontWeight.w700, halo: true);
        IxPaint.label(c, 'a', pl.p(s.b, 0) + const Offset(0, 34), size: 19, color: IX.positive, w: FontWeight.w700, halo: true);
      case 'area':
        final pl = plane(full, s.f);
        pl.paintGrid(c);
        pl.fillBetween(c, (x) => math.max(0, s.f(x)), null, s.a, s.b, IX.accent.withValues(alpha: 0.22));
        pl.fillBetween(c, (x) => math.min(0, s.f(x)), null, s.a, s.b, IX.positive.withValues(alpha: 0.22));
        pl.curve(c, s.f, IX.ink, width: 4.5);
        for (final x in [s.a, s.b]) {
          IxPaint.dashed(c, pl.p(x, 0), pl.p(x, s.f(x).clamp(pl.ya, pl.yb)), MPaint.stroke(IX.accent, 2), dash: 6, gap: 5);
        }
      default:
        final pl = plane(full, s.f);
        pl.paintGrid(c);
        final w = (s.b - s.a) / s.n;
        for (var i = 0; i < s.n; i++) {
          final x0 = s.a + i * w;
          final col = IX.accent;
          if (s.rule == 'trapezium') {
            final path = Path()..addPolygon([pl.p(x0, 0), pl.p(x0, s.f(x0)), pl.p(x0 + w, s.f(x0 + w)), pl.p(x0 + w, 0)], true);
            c.drawPath(path, Paint()..color = col.withValues(alpha: 0.2));
            c.drawPath(path, MPaint.stroke(col.withValues(alpha: 0.7), 1.5));
          } else {
            final hgt = switch (s.rule) { 'left' => s.f(x0), 'right' => s.f(x0 + w), _ => s.f(x0 + w / 2) };
            final r = Rect.fromLTRB(pl.sx(x0), pl.sy(math.max(0, hgt)), pl.sx(x0 + w), pl.sy(math.min(0, hgt)));
            c.drawRect(r, Paint()..color = (hgt >= 0 ? col : IX.positive).withValues(alpha: 0.2));
            c.drawRect(r, MPaint.stroke((hgt >= 0 ? col : IX.positive).withValues(alpha: 0.7), 1.5));
          }
        }
        pl.curve(c, s.f, IX.ink, width: 4.5);
        IxPaint.label(c, 'a', pl.p(s.a, 0) + const Offset(0, 34), size: 19, color: IX.accent, w: FontWeight.w700, halo: true);
        IxPaint.label(c, 'b', pl.p(s.b, 0) + const Offset(0, 34), size: 19, color: IX.accent, w: FontWeight.w700, halo: true);
    }
    final cap = tx(s.p['caption']);
    if (cap != null && s.mode != 'accumulate') MPaint.note(c, cap, Rect.fromLTRB(110, 0, size.width - 70, size.height - 70), size: 18);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
