import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'common.dart';
import 'plotter.dart' show SpecModel;

double _num(Object? o, Env env, double f) => o == null ? f : (Expr.safe(o)(env).isFinite ? Expr.safe(o)(env) : f);

/// Limits and continuity: f near x = a with points closing in from the left and the right, a
/// table of values, the left- and right-hand limits, f(a) and the verdict; and the squeeze
/// cos x < sin x / x < 1 drawn in a unit circle.
///
/// Preset: {"mode": "approach"|"squeeze", "f": "if(x < 1, x^2, x + k)", "a": 1, "fa": "2.5" or null,
/// "sliders": [{"name": "k", …}], "h": 0.5, "x": [-1, 3], "y": [-1, 4], "fName": "f(x) = …"}.
class LimitsInstrument extends StatefulWidget {
  const LimitsInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<LimitsInstrument> createState() => _LimitsState();
}

class _LimitsState extends State<LimitsInstrument> {
  late SpecModel model;
  String mode = 'approach';
  double hExp = 0.3; // h = 10^(−hExp·3)
  int? active = 0;

  Map<String, dynamic> get p => widget.preset.isEmpty ? _demo : widget.preset;
  static const _demo = {'f': '(x^2 - 4)/(x - 2)', 'a': 2, 'fName': 'f(x) = (x² − 4)/(x − 2)', 'x': [-1, 5], 'y': [-1, 6]};

  @override
  void initState() {
    super.initState();
    model = SpecModel(p);
    mode = ps(p, 'mode', 'approach');
    hExp = pd(p, 'hExp', 0.25);
  }

  double get h => math.pow(10, -hExp * 3).toDouble();

  @override
  Widget build(BuildContext context) {
    final env = model.env();
    final f = Expr.safe(p['f'] ?? 'x');
    double fx(double x) => f({...env, 'x': x});
    if (mode == 'squeeze') {
      final x = _num(p['x0'], env, 0.8);
      final xv = model.values['xr'] ?? x;
      return InstrumentFrame(
        id: 'maths-limits',
        subtitle: tx(p['subtitle']) ?? '$kMaths · Limits and derivatives',
        title: tx(p['title']) ?? 'Squeezing sin x / x',
        formula: 'cos x < sin x / x < 1,  so  lim sin x / x = 1',
        state: {'x': xv},
        readouts: [
          Readout('x (radians)', fmt(xv, 3), '', IX.ink),
          Readout('cos x', fmt(math.cos(xv), 4), '', IX.accent),
          Readout('sin x / x', fmt(math.sin(xv) / xv, 4), '', IX.positive),
          const Readout('Upper bound', '1', '', IX.green),
        ],
        controls: [IxSlider(label: 'x', value: xv, min: 0.02, max: 1.4, divisions: 138, format: (v) => fmt(v, 2), onChanged: (v) => setState(() => model.values['xr'] = v))],
        presets: [Preset('Start values', () => setState(() => model.values['xr'] = x))],
        stage: CustomPaint(painter: _SqueezePainter(xv), size: Size.infinite),
      );
    }
    final a = _num(p['a'], env, 0);
    final lhl = _side(fx, a, -1), rhl = _side(fx, a, 1);
    final faExpr = p.containsKey('fa') ? p['fa'] : 'f';
    final fa = faExpr == null ? double.nan : (faExpr == 'f' ? fx(a) : _num(faExpr, env, double.nan));
    final exists = lhl.isFinite && rhl.isFinite && (lhl - rhl).abs() < 1e-4;
    final cont = exists && fa.isFinite && (fa - lhl).abs() < 1e-4;
    return InstrumentFrame(
      id: 'maths-limits',
      subtitle: tx(p['subtitle']) ?? '$kMaths · Limits and continuity',
      title: tx(p['title']) ?? 'Left and right limits',
      formula: exists ? 'lim f(x) = ${fmt(lhl, 3)} as x → ${fmtT(a)}' : 'lim f(x) does not exist at x = ${fmtT(a)}',
      state: {...model.values, 'h': h},
      readouts: [
        Readout('Left limit, x → ${fmtT(a)}⁻', _lim(lhl), '', IX.accent),
        Readout('Right limit, x → ${fmtT(a)}⁺', _lim(rhl), '', IX.positive),
        Readout('f(${fmtT(a)})', fa.isFinite ? fmt(fa, 3) : 'not defined', '', IX.ink),
        Readout('Continuous at ${fmtT(a)}?', cont ? 'Yes' : 'No', '', cont ? IX.green : MX.red),
        ...model.readoutCards(env, max: 2),
      ],
      controls: [
        IxSlider(label: 'Distance h from a', value: hExp, min: 0, max: 1, divisions: 60, format: (_) => 'h = ${h >= 0.01 ? fmt(h, 3) : sci(h)}', onChanged: (v) => setState(() => hExp = v)),
        ...model.controls(setState),
      ],
      presets: model.presets(setState, (i) => active = i),
      activePreset: active,
      stage: CustomPaint(painter: _LimitPainter(this, fx, a, fa, lhl, rhl, env), size: Size.infinite),
    );
  }

  String _lim(double v) => v.isNaN ? 'does not exist' : v.isInfinite ? (v > 0 ? '+∞' : '−∞') : fmt(v, 3);

  static double _side(double Function(double) f, double a, int sgn) {
    final v1 = f(a + sgn * 1e-6), v2 = f(a + sgn * 1e-7), v3 = f(a + sgn * 1e-5);
    if (!v1.isFinite || !v2.isFinite) {
      if (v1.isFinite && v1.abs() > 1e5) return v1.sign * double.infinity;
      return double.nan;
    }
    if (v2.abs() > 1e5 && (v2.abs() > v3.abs() * 5)) return v2.sign * double.infinity;
    if ((v1 - v2).abs() > 1e-3 * (1 + v1.abs())) return double.nan; // oscillates
    final r = (v2 * 1e4).roundToDouble() / 1e4;
    return r == 0 ? 0 : r;
  }
}

class _LimitPainter extends CustomPainter {
  _LimitPainter(this.s, this.f, this.a, this.fa, this.lhl, this.rhl, this.env);
  final _LimitsState s;
  final double Function(double) f;
  final double a, fa, lhl, rhl;
  final Env env;

  @override
  void paint(Canvas c, Size size) {
    final p = s.p;
    final xr = p['x'] is List ? [for (final v in p['x'] as List) Expr.safe(v)(env)] : [a - 3, a + 3];
    final yr = p['y'] is List ? [for (final v in p['y'] as List) Expr.safe(v)(env)] : [-2.0, 6.0];
    final pl = Plane(Rect.fromLTRB(80, 50, size.width * 0.66, size.height - 60), xr[0], xr[1], yr[0], yr[1]);
    pl.paintGrid(c);
    // Curve on each side of a, so a jump is not joined.
    pl.curve(c, f, IX.ink, width: 4.5, to: a - 1e-9);
    pl.curve(c, f, IX.ink, width: 4.5, from: a + 1e-9);
    IxPaint.dashed(c, Offset(pl.sx(a), pl.rect.top), Offset(pl.sx(a), pl.rect.bottom), MPaint.stroke(IX.steel, 1.8), dash: 8, gap: 6);
    IxPaint.label(c, 'x = ${fmtT(a)}', Offset(pl.sx(a) + 8, pl.rect.top + 12), size: 18, color: IX.inkSoft, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
    // End points at a.
    for (final (v, col) in [(lhl, IX.accent), (rhl, IX.positive)]) {
      if (v.isFinite && pl.contains(a, v) && !(fa.isFinite && (fa - v).abs() < 1e-4)) MPaint.hole(c, pl.p(a, v), col, r: 9);
    }
    if (fa.isFinite && pl.contains(a, fa)) MPaint.dot(c, pl.p(a, fa), IX.ink, r: 9);
    // Approaching points.
    final h = s.h;
    for (final (sg, col) in [(-1, IX.accent), (1, IX.positive)]) {
      final x = a + sg * math.max(h, (pl.xb - pl.xa) / 400);
      final y = f(x);
      if (!y.isFinite || !pl.contains(x, y)) continue;
      IxPaint.dashed(c, pl.p(x, 0.0.clamp(pl.ya, pl.yb)), pl.p(x, y), MPaint.stroke(col, 2), dash: 5, gap: 4);
      IxPaint.handle(c, pl.p(x, y), col, r: 12);
      IxPaint.arrow(c, pl.p(x, y) + Offset(-sg * 60.0, 0), pl.p(x, y) + Offset(-sg * 22.0, 0), col, width: 3, head: 12);
    }
    // Table of values.
    final tx0 = size.width * 0.7, ty = 70.0;
    final tw = size.width - tx0 - 30;
    IxPaint.label(c, tx(p['fName']) ?? 'f(x)', Offset(tx0, ty), size: 22, color: IX.ink, w: FontWeight.w700, align: Alignment.centerLeft);
    final rows = [0.1, 0.01, 0.001];
    final rh = 52.0;
    final top = ty + 40;
    c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(tx0, top, tw, rh * 4), const Radius.circular(12)), MPaint.stroke(IX.rule, 1.5));
    final hdr = ['h', 'f(a − h)', 'f(a + h)'];
    for (var j = 0; j < 3; j++) {
      IxPaint.label(c, hdr[j], Offset(tx0 + tw * (j + 0.5) / 3, top + rh / 2), size: 18, color: [IX.inkSoft, IX.accent, IX.positive][j], w: FontWeight.w700);
    }
    for (final (i, hh) in rows.indexed) {
      final y = top + rh * (i + 1);
      c.drawLine(Offset(tx0, y), Offset(tx0 + tw, y), MPaint.stroke(IX.rule, 1));
      final vals = [fmtT(hh, 3), fmt(f(a - hh), 4), fmt(f(a + hh), 4)];
      for (var j = 0; j < 3; j++) {
        IxPaint.label(c, vals[j], Offset(tx0 + tw * (j + 0.5) / 3, y + rh / 2), size: 19, color: IX.ink, w: FontWeight.w500);
      }
    }
    final cap = tx(p['caption']);
    if (cap != null) MPaint.note(c, cap, Rect.fromLTRB(tx0, top + rh * 4 + 20, size.width - 24, size.height - 20), size: 18);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}

class _SqueezePainter extends CustomPainter {
  _SqueezePainter(this.x);
  final double x;

  @override
  void paint(Canvas c, Size size) {
    // Unit circle picture.
    final o = Offset(90, size.height * 0.78);
    final r = math.min(size.height * 0.62, size.width * 0.38);
    final A = o + Offset(r, 0), P = o + Offset(math.cos(x), -math.sin(x)) * r, T = o + Offset(r, -math.tan(x).clamp(-3.0, 3.0) * r);
    c.drawArc(Rect.fromCircle(center: o, radius: r), 0, -math.pi / 2, false, MPaint.stroke(IX.steel, 2.5));
    c.drawPath(Path()..moveTo(o.dx, o.dy)..lineTo(A.dx, A.dy)..lineTo(T.dx, T.dy)..close(), Paint()..color = IX.green.withValues(alpha: 0.10));
    c.drawArc(Rect.fromCircle(center: o, radius: r), 0, -x, true, Paint()..color = IX.positive.withValues(alpha: 0.18));
    c.drawPath(Path()..moveTo(o.dx, o.dy)..lineTo(A.dx, A.dy)..lineTo(P.dx, P.dy)..close(), Paint()..color = IX.accent.withValues(alpha: 0.22));
    c.drawLine(o, T, MPaint.stroke(IX.ink, 2));
    c.drawLine(A, T, MPaint.stroke(IX.green, 3));
    c.drawLine(o, A, MPaint.stroke(IX.ink, 2.5));
    c.drawLine(P, Offset(P.dx, o.dy), MPaint.stroke(IX.accent, 3));
    for (final (q, n) in [(o, 'O'), (A, 'A'), (P, 'P'), (T, 'T')]) {
      MPaint.dot(c, q, IX.ink, r: 6);
      IxPaint.label(c, n, q + const Offset(14, -14), size: 20, color: IX.ink, w: FontWeight.w700, align: Alignment.centerLeft);
    }
    final lx = o.dx + r + 70;
    final lines = [('triangle OAP: ½ sin x = ${fmt(math.sin(x) / 2, 3)}', IX.accent), ('sector OAP:  ½ x = ${fmt(x / 2, 3)}', IX.positive), ('triangle OAT: ½ tan x = ${fmt(math.tan(x) / 2, 3)}', IX.green)];
    // Graph of the three functions, top right.
    final pl = Plane(Rect.fromLTRB(lx + 40, 50, size.width - 40, size.height * 0.55), -1.6, 1.6, 0, 1.25);
    pl.paintGrid(c, yStep: 0.25);
    pl.curve(c, math.cos, IX.accent, width: 3);
    pl.curve(c, (t) => 1, IX.green, width: 3);
    pl.curve(c, (t) => t == 0 ? double.nan : math.sin(t) / t, IX.positive, width: 4.5);
    MPaint.hole(c, pl.p(0, 1), IX.positive, r: 7);
    IxPaint.dashed(c, Offset(pl.sx(x), pl.rect.top), Offset(pl.sx(x), pl.rect.bottom), MPaint.stroke(IX.steel, 1.6), dash: 5, gap: 5);
    MPaint.dot(c, pl.p(x, math.sin(x) / x), IX.positive, r: 8);
    MPaint.legend(c, Offset(pl.rect.left + 10, pl.rect.bottom - 150), [(IX.green, 'y = 1'), (IX.positive, 'y = sin x / x'), (IX.accent, 'y = cos x')], size: 17);
    for (final (i, (t, col)) in lines.indexed) {
      IxPaint.label(c, t, Offset(lx + 40, size.height * 0.64 + i * 42.0), size: 21, color: col, w: FontWeight.w600, align: Alignment.centerLeft);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}

/// Derivatives: secant to tangent, the derivative traced as a second graph, increasing and
/// decreasing intervals, local and absolute extrema, concavity, rates of change, the product
/// rule as a growing rectangle and tangents to parametric curves.
///
/// Preset: {"mode": "tangent"|"secant"|"trace"|"monotone"|"extrema"|"concavity"|"interval"|"product"|
/// "parametric"|"ripple", "f": "x^3 - 3*x", "sliders": [...], "x0": 1, "h": 0.5, "x": [-3, 3], "y": [-4, 4],
/// "from": -1, "to": 2, "xt": "t - sin(t)", "yt": "1 - cos(t)", "fName": "f(x) = x³ − 3x",
/// "xLabel": "t", "yLabel": "s"}.
class DerivativeInstrument extends StatefulWidget {
  const DerivativeInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<DerivativeInstrument> createState() => _DerivState();
}

class _DerivState extends State<DerivativeInstrument> {
  late SpecModel model;
  String mode = 'tangent';
  double x0 = 1, h = 0.5, from = -1, to = 2, p = 1, q = 0.5, dT = 0.5;
  int? active = 0;
  bool _drag = false;

  Map<String, dynamic> get pr => widget.preset.isEmpty ? _demo : widget.preset;
  static const _demo = {'mode': 'monotone', 'f': 'x^3 - 3*x', 'fName': 'f(x) = x³ − 3x', 'x0': 1.5, 'x': [-3, 3], 'y': [-4, 4]};

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    model = SpecModel(pr);
    final env = model.env();
    mode = ps(pr, 'mode', 'tangent');
    x0 = _num(pr['x0'], env, 1);
    h = _num(pr['h'], env, 0.5);
    from = _num(pr['from'], env, -1);
    to = _num(pr['to'], env, 2);
    p = pd(pr, 'p', 1);
    q = pd(pr, 'q', 0.5);
    dT = pd(pr, 'D', 0.5);
  }

  Env get env => model.env();
  double f(double x) => Expr.safe(pr['f'] ?? 'x^2')({...env, 'x': x});
  double df(double x) {
    if (pr['df'] != null) return Expr.safe(pr['df'])({...env, 'x': x});
    const e = 1e-5;
    return (f(x + e) - f(x - e)) / (2 * e);
  }

  double d2f(double x) {
    const e = 1e-3;
    return (f(x + e) - 2 * f(x) + f(x - e)) / (e * e);
  }

  List<double> get range => pr['x'] is List ? [for (final v in pr['x'] as List) Expr.safe(v)(env)] : [-4.0, 4.0];

  /// Points where f′ changes sign (or touches zero), found by scanning and bisection.
  List<(double, String)> critical() {
    final xr = range;
    final out = <(double, String)>[];
    const n = 600;
    double? prevX, prevD;
    for (var i = 0; i <= n; i++) {
      final x = xr[0] + (xr[1] - xr[0]) * i / n;
      final d = df(x);
      if (!d.isFinite) {
        prevD = null;
        continue;
      }
      if (prevD != null && prevX != null && (prevD.sign != d.sign || d == 0) && prevD != 0) {
        var lo = prevX, hi = x;
        for (var k = 0; k < 50; k++) {
          final m = (lo + hi) / 2;
          if (df(m).sign == df(lo).sign) {
            lo = m;
          } else {
            hi = m;
          }
        }
        final xc = (lo + hi) / 2;
        final left = df(xc - 1e-3), right = df(xc + 1e-3);
        final kind = left > 0 && right < 0 ? 'local max' : left < 0 && right > 0 ? 'local min' : 'stationary, not an extremum';
        if (out.isEmpty || (out.last.$1 - xc).abs() > 1e-3) out.add((xc, kind));
      }
      prevX = x;
      prevD = d;
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final e = env;
    final fName = tx(pr['fName']) ?? 'f(x)';
    late List<Readout> ro;
    late String title, formula;
    final ctl = <Widget>[];
    Widget sl(String l, double v, double lo, double hi, ValueChanged<double> on, {int d = 2, int div = 100}) => IxSlider(label: l, value: v.clamp(lo, hi), min: lo, max: hi, divisions: div, format: (x) => fmt(x, d), onChanged: (x) => setState(() { on(x); active = null; }));
    final xr = range;
    switch (mode) {
      case 'product':
        const u0 = 2.0, v0 = 1.5;
        title = 'The product rule as a growing rectangle';
        formula = '(uv)′ = u′v + uv′';
        ro = [
          Readout('u′v + uv′', fmt(p * v0 + u0 * q, 3), '', IX.positive),
          Readout('Δ(uv)/Δt', fmt(((u0 + p * dT) * (v0 + q * dT) - u0 * v0) / dT, 3), '', IX.accent),
          Readout('Corner Δu·Δv / Δt', fmt(p * q * dT, 3), '', IX.inkSoft),
        ];
        ctl.addAll([sl('u′ (rate of u)', p, 0, 2, (x) => p = x, div: 20), sl('v′ (rate of v)', q, 0, 2, (x) => q = x, div: 20), sl('Δt', dT, 0.05, 1, (x) => dT = x, div: 19)]);
      case 'parametric':
        final xt = Expr.safe(pr['xt'] ?? 't - sin(t)'), yt = Expr.safe(pr['yt'] ?? '1 - cos(t)');
        double dx(double t) => (xt({...e, 't': t + 1e-5}) - xt({...e, 't': t - 1e-5})) / 2e-5;
        double dy(double t) => (yt({...e, 't': t + 1e-5}) - yt({...e, 't': t - 1e-5})) / 2e-5;
        final m = dx(x0).abs() < 1e-6 ? double.nan : dy(x0) / dx(x0);
        title = tx(pr['title']) ?? 'A rolling wheel: the cycloid';
        formula = 'dy/dx = (dy/dt) / (dx/dt)';
        ro = [
          Readout('t', '${fmt(x0, 2)} rad', '', IX.ink),
          Readout('dx/dt', fmt(dx(x0), 3), '', IX.accent),
          Readout('dy/dt', fmt(dy(x0), 3), '', IX.green),
          Readout('dy/dx', m.isNaN ? 'not defined' : fmt(m, 3), '', IX.positive),
        ];
        ctl.add(sl('t', x0, 0.05, 4 * math.pi - 0.05, (x) => x0 = x, div: 250));
      case 'ripple':
        final v = _num(pr['v'], e, 5);
        final r = v * x0;
        title = 'A ripple spreading in a pond';
        formula = 'dA/dt = 2πr · dr/dt';
        ro = [
          Readout('t', fmt(x0, 1), 's', IX.ink),
          Readout('r = vt', fmt(r, 1), 'cm', IX.accent),
          Readout('A = πr²', fmt(math.pi * r * r, 1), 'cm²', IX.green),
          Readout('dA/dt', fmt(2 * math.pi * r * v, 1), 'cm²/s', IX.positive),
        ];
        ctl.add(sl('Time t', x0, 0.2, 8, (x) => x0 = x, d: 1, div: 39));
      default:
        final y0 = f(x0), m = df(x0);
        final sec = (f(x0 + h) - y0) / h;
        final crit = critical();
        title = switch (mode) {
          'secant' => 'Secant becomes tangent',
          'trace' => 'Trace the derivative',
          'monotone' => 'Increasing and decreasing',
          'extrema' => 'Local maxima and minima',
          'concavity' => 'Cup or cap? The second derivative',
          'interval' => 'Highest and lowest on [a, b]',
          _ => 'Slope of the tangent',
        };
        formula = switch (mode) {
          'secant' || 'trace' => "f′(x) = lim (f(x + h) − f(x))/h",
          'concavity' => 'f″ > 0 cup,  f″ < 0 cap',
          'interval' => 'compare f at critical points and at a, b',
          'monotone' => "f′ > 0 increasing,  f′ < 0 decreasing",
          _ => "f′(c) = 0 at a turning point",
        };
        ro = [
          Readout('x₀', fmt(x0, 2), '', IX.ink),
          Readout("f(x₀)", fmt(y0, 3), '', IX.accent),
          Readout("f′(x₀)", fmt(m, 3), '', IX.positive),
          if (mode == 'secant' || mode == 'trace') Readout('(f(x₀ + h) − f(x₀))/h', fmt(sec, 3), '', MX.violet),
          if (mode == 'concavity') Readout('f″(x₀)', fmt(d2f(x0), 3), '', IX.green),
          if (mode == 'monotone') Readout('At x₀, f is', m > 1e-9 ? 'increasing' : m < -1e-9 ? 'decreasing' : 'stationary', '', m >= 0 ? IX.green : IX.positive),
          if (mode == 'extrema' || mode == 'monotone') Readout('Turning points', crit.isEmpty ? 'none' : crit.map((c) => fmt(c.$1, 2)).join(',  '), '', IX.inkSoft),
          if (mode == 'interval') ..._intervalReadouts(crit),
          ...model.readoutCards(e, max: 2),
        ];
        ctl.addAll([
          sl('x₀', x0, xr[0], xr[1], (x) => x0 = x),
          if (mode == 'secant' || mode == 'trace') IxSlider(label: 'h', value: h.abs().clamp(0.001, 2), min: 0.001, max: 2, divisions: 200, format: (x) => fmt(x, 3), onChanged: (x) => setState(() => h = x)),
          if (mode == 'interval') ...[sl('a', from, xr[0], to, (x) => from = x), sl('b', to, from, xr[1], (x) => to = x)],
          ...model.controls(setState),
        ]);
    }
    return InstrumentFrame(
      id: 'maths-derivative',
      subtitle: tx(pr['subtitle']) ?? (mode == 'secant' || mode == 'trace' || mode == 'product' ? '$kMaths · Limits and derivatives' : '$kMaths · Application of derivatives'),
      title: tx(pr['title']) ?? title,
      formula: mode == 'parametric' || mode == 'product' || mode == 'ripple' ? formula : '$fName   ·   $formula',
      state: {'mode': mode, 'x0': x0, 'h': h, ...model.values},
      readouts: ro,
      controls: ctl,
      presets: [
        Preset('Start values', () => setState(() {
          _load();
          active = 0;
        })),
      ],
      activePreset: active,
      stage: LayoutBuilder(builder: (context, box) {
        final size = box.biggest;
        final top = _DerivPainter.topPlane(this, size);
        return GestureDetector(
          onPanStart: (d) => _drag = mode != 'product' && mode != 'ripple' && mode != 'parametric',
          onPanUpdate: (d) {
            if (!_drag) return;
            setState(() {
              x0 = top.wx(d.localPosition.dx).clamp(xr[0], xr[1]);
              active = null;
            });
          },
          onPanEnd: (_) => _drag = false,
          child: CustomPaint(size: size, painter: _DerivPainter(this, top)),
        );
      }),
    );
  }

  List<Readout> _intervalReadouts(List<(double, String)> crit) {
    final cands = [from, to, for (final c in crit) if (c.$1 > from && c.$1 < to) c.$1];
    var mx = cands.first, mn = cands.first;
    for (final x in cands) {
      if (f(x) > f(mx)) mx = x;
      if (f(x) < f(mn)) mn = x;
    }
    return [Readout('Absolute max', '${fmt(f(mx), 3)} at x = ${fmt(mx, 2)}', '', IX.positive), Readout('Absolute min', '${fmt(f(mn), 3)} at x = ${fmt(mn, 2)}', '', IX.accent)];
  }
}

class _DerivPainter extends CustomPainter {
  _DerivPainter(this.s, this.top);
  final _DerivState s;
  final Plane top;

  static bool twoPanels(_DerivState s) => ['monotone', 'trace', 'concavity', 'extrema'].contains(s.mode);

  static Plane topPlane(_DerivState s, Size size) {
    final xr = s.range;
    final e = s.env;
    List<double> yr = s.pr['y'] is List ? [for (final v in s.pr['y'] as List) Expr.safe(v)(e)] : const [];
    if (yr.length < 2) {
      var lo = double.infinity, hi = -double.infinity;
      for (var i = 0; i <= 200; i++) {
        final y = s.f(xr[0] + (xr[1] - xr[0]) * i / 200);
        if (y.isFinite) {
          lo = math.min(lo, y);
          hi = math.max(hi, y);
        }
      }
      if (!lo.isFinite) (lo, hi) = (-5, 5);
      final pad = (hi - lo) * 0.12 + 0.5;
      yr = [lo - pad, hi + pad];
    }
    final bottom = twoPanels(s) ? size.height * 0.6 : size.height - 60;
    return Plane(Rect.fromLTRB(90, 46, size.width - 50, bottom), xr[0], xr[1], yr[0], yr[1]);
  }

  @override
  void paint(Canvas c, Size size) {
    switch (s.mode) {
      case 'product':
        _product(c, size);
        return;
      case 'parametric':
        _parametric(c, size);
        return;
      case 'ripple':
        _ripple(c, size);
        return;
    }
    final pl = top;
    pl.paintGrid(c, xLabel: tx(s.pr['xLabel']) ?? 'x', yLabel: tx(s.pr['yLabel']) ?? 'y');
    final crit = s.critical();
    // Colour the curve by monotonicity / concavity.
    if (s.mode == 'monotone' || s.mode == 'extrema') {
      const n = 300;
      for (var i = 0; i < n; i++) {
        final x1 = pl.xa + (pl.xb - pl.xa) * i / n, x2 = pl.xa + (pl.xb - pl.xa) * (i + 1) / n;
        final y1 = s.f(x1), y2 = s.f(x2);
        if (!y1.isFinite || !y2.isFinite) continue;
        final up = s.df((x1 + x2) / 2) >= 0;
        c.save();
        c.clipRect(pl.rect);
        c.drawLine(pl.p(x1, y1), pl.p(x2, y2), MPaint.stroke(up ? IX.green : IX.positive, 5));
        c.restore();
      }
    } else if (s.mode == 'concavity') {
      const n = 300;
      for (var i = 0; i < n; i++) {
        final x1 = pl.xa + (pl.xb - pl.xa) * i / n, x2 = pl.xa + (pl.xb - pl.xa) * (i + 1) / n;
        final y1 = s.f(x1), y2 = s.f(x2);
        if (!y1.isFinite || !y2.isFinite) continue;
        final cup = s.d2f((x1 + x2) / 2) >= 0;
        c.save();
        c.clipRect(pl.rect);
        c.drawLine(pl.p(x1, y1), pl.p(x2, y2), MPaint.stroke(cup ? IX.accent : MX.violet, 5));
        c.restore();
      }
    } else {
      if (s.mode == 'interval') {
        pl.fillBetween(c, (x) => pl.yb, (x) => pl.ya, s.from, s.to, IX.accentSoft.withValues(alpha: 0.5));
      }
      pl.curve(c, s.f, IX.ink, width: 4.5);
    }
    if (s.mode == 'extrema' || s.mode == 'monotone' || s.mode == 'interval' || s.mode == 'concavity') {
      for (final (x, kind) in crit) {
        final y = s.f(x);
        if (!pl.contains(x, y)) continue;
        MPaint.dot(c, pl.p(x, y), IX.ink, r: 8);
        IxPaint.label(c, kind, pl.p(x, y) + Offset(0, kind == 'local max' ? -24 : 24), size: 17, color: IX.ink, w: FontWeight.w600, align: kind == 'local max' ? Alignment.bottomCenter : Alignment.topCenter, halo: true);
      }
    }
    if (s.mode == 'interval') {
      for (final x in [s.from, s.to]) {
        MPaint.dot(c, pl.p(x, s.f(x)), IX.accent, r: 8);
      }
    }
    // Tangent and secant at x0.
    final x0 = s.x0, y0 = s.f(x0), m = s.df(x0);
    if (y0.isFinite && m.isFinite) {
      c.save();
      c.clipRect(pl.rect);
      final span = (pl.xb - pl.xa) * 0.22 / math.sqrt(1 + math.pow(m * pl.uy / pl.ux, 2));
      c.drawLine(pl.p(x0 - span, y0 - m * span), pl.p(x0 + span, y0 + m * span), MPaint.stroke(IX.positive, 3.5));
      if (s.mode == 'secant' || s.mode == 'trace') {
        final x1 = x0 + s.h, y1 = s.f(x1);
        final ms = (y1 - y0) / s.h;
        c.drawLine(pl.p(pl.xa, y0 + ms * (pl.xa - x0)), pl.p(pl.xb, y0 + ms * (pl.xb - x0)), MPaint.stroke(MX.violet, 2.5));
        MPaint.dot(c, pl.p(x1, y1), MX.violet, r: 8);
        IxPaint.dashed(c, pl.p(x0, y0), pl.p(x1, y0), MPaint.stroke(MX.violet, 2), dash: 6, gap: 4);
        IxPaint.dashed(c, pl.p(x1, y0), pl.p(x1, y1), MPaint.stroke(MX.violet, 2), dash: 6, gap: 4);
        IxPaint.label(c, 'h', pl.p(x0 + s.h / 2, y0) + const Offset(0, 16), size: 18, color: MX.violet, w: FontWeight.w700, halo: true);
      }
      c.restore();
      IxPaint.handle(c, pl.p(x0, y0), IX.positive, r: 14, active: s._drag);
      IxPaint.label(c, 'slope ${fmt(m, 2)}', pl.p(x0, y0) + const Offset(18, -28), size: 18, color: IX.positive, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
    }
    final fn = tx(s.pr['fName']);
    if (fn != null) IxPaint.label(c, fn, Offset(pl.rect.left + 16, pl.rect.top + 10), size: 22, color: IX.ink, w: FontWeight.w700, align: Alignment.topLeft, halo: true);
    if (s.mode == 'monotone' || s.mode == 'extrema') MPaint.legend(c, Offset(pl.rect.right - 250, pl.rect.top + 6), [(IX.green, 'increasing'), (IX.positive, 'decreasing')], size: 17);
    if (s.mode == 'concavity') MPaint.legend(c, Offset(pl.rect.right - 260, pl.rect.top + 6), [(IX.accent, 'concave up (cup)'), (MX.violet, 'concave down (cap)')], size: 17);
    if (!twoPanels(s)) return;
    // Lower panel: f′ (or the difference quotient, or f″).
    final isD2 = s.mode == 'concavity';
    double g(double x) => isD2 ? s.d2f(x) : s.mode == 'trace' ? (s.f(x + s.h) - s.f(x)) / s.h : s.df(x);
    var lo = double.infinity, hi = -double.infinity;
    for (var i = 0; i <= 200; i++) {
      final v = g(pl.xa + (pl.xb - pl.xa) * i / 200);
      if (v.isFinite) {
        lo = math.min(lo, v);
        hi = math.max(hi, v);
      }
    }
    if (!lo.isFinite) (lo, hi) = (-1, 1);
    final pad = (hi - lo) * 0.15 + 0.3;
    final bp = Plane(Rect.fromLTRB(pl.rect.left, size.height * 0.68, pl.rect.right, size.height - 40), pl.xa, pl.xb, math.min(lo - pad, -0.5), math.max(hi + pad, 0.5));
    bp.paintGrid(c, yLabel: isD2 ? 'f″' : s.mode == 'trace' ? 'quotient' : 'f′', xLabel: 'x');
    bp.fillBetween(c, (x) => math.max(0, g(x)), null, bp.xa, bp.xb, (isD2 ? IX.accent : IX.green).withValues(alpha: 0.15));
    bp.fillBetween(c, (x) => math.min(0, g(x)), null, bp.xa, bp.xb, (isD2 ? MX.violet : IX.positive).withValues(alpha: 0.15));
    if (s.mode == 'trace') {
      bp.curve(c, s.df, IX.steel, width: 2, dashed: true);
      bp.curve(c, g, MX.violet, width: 4, to: x0);
    } else {
      bp.curve(c, g, isD2 ? IX.accent : IX.green, width: 4);
    }
    final gv = g(x0);
    if (gv.isFinite && bp.contains(x0, gv)) MPaint.dot(c, bp.p(x0, gv), IX.positive, r: 8);
    IxPaint.dashed(c, Offset(pl.sx(x0), pl.rect.bottom), Offset(bp.sx(x0), bp.rect.top), MPaint.stroke(IX.steel, 1.5), dash: 5, gap: 5);
  }

  void _product(Canvas c, Size size) {
    const u0 = 2.0, v0 = 1.5;
    final du = s.p * s.dT, dv = s.q * s.dT;
    final u = (size.height - 160) / (v0 + 2 * 1.0);
    final o = Offset(120, 90);
    final W = u0 * u, H = v0 * u, dW = du * u, dH = dv * u;
    c.drawRect(Rect.fromLTWH(o.dx, o.dy, W, H), Paint()..color = IX.accent.withValues(alpha: 0.18));
    c.drawRect(Rect.fromLTWH(o.dx + W, o.dy, dW, H), Paint()..color = IX.green.withValues(alpha: 0.35));
    c.drawRect(Rect.fromLTWH(o.dx, o.dy + H, W, dH), Paint()..color = IX.positive.withValues(alpha: 0.3));
    c.drawRect(Rect.fromLTWH(o.dx + W, o.dy + H, dW, dH), Paint()..color = MX.violet.withValues(alpha: 0.45));
    c.drawRect(Rect.fromLTWH(o.dx, o.dy, W + dW, H + dH), MPaint.stroke(IX.ink, 2.5));
    c.drawRect(Rect.fromLTWH(o.dx, o.dy, W, H), MPaint.stroke(IX.accent, 2.5));
    IxPaint.label(c, 'uv', Offset(o.dx + W / 2, o.dy + H / 2), size: 30, color: IX.accent, w: FontWeight.w700);
    if (dW > 30) IxPaint.label(c, 'v·Δu', Offset(o.dx + W + dW / 2, o.dy + H / 2), size: 20, color: IX.green, w: FontWeight.w700);
    if (dH > 26) IxPaint.label(c, 'u·Δv', Offset(o.dx + W / 2, o.dy + H + dH / 2), size: 20, color: IX.positive, w: FontWeight.w700);
    IxPaint.label(c, 'u = 2', Offset(o.dx + W / 2, o.dy - 18), size: 19, color: IX.inkSoft);
    IxPaint.label(c, 'v = 1.5', Offset(o.dx - 14, o.dy + H / 2), size: 19, color: IX.inkSoft, align: Alignment.centerRight);
    final tx0 = o.dx + W + dW + 80;
    final lines = [
      ('Δ(uv) = v·Δu + u·Δv + Δu·Δv', IX.ink),
      ('Divide by Δt:', IX.inkSoft),
      ('Δ(uv)/Δt = v·Δu/Δt + u·Δv/Δt + Δu·Δv/Δt', IX.ink),
      ('As Δt → 0 the corner term vanishes:', IX.inkSoft),
      ('(uv)′ = u′v + uv′', IX.positive),
    ];
    for (final (i, (t, col)) in lines.indexed) {
      IxPaint.label(c, t, Offset(tx0, o.dy + 30 + i * 54.0), size: i == 4 ? 28 : 21, color: col, w: i == 4 ? FontWeight.w700 : FontWeight.w500, align: Alignment.centerLeft);
    }
  }

  void _parametric(Canvas c, Size size) {
    final e = s.env;
    final xt = Expr.safe(s.pr['xt'] ?? 't - sin(t)'), yt = Expr.safe(s.pr['yt'] ?? '1 - cos(t)');
    final pl = Plane(Rect.fromLTRB(70, 60, size.width - 40, size.height - 60), -0.5, 4 * math.pi + 0.5, -0.4, 2.6, equal: true);
    pl.paintGrid(c, piTicks: true);
    final path = Path();
    for (var i = 0; i <= 400; i++) {
      final t = 4 * math.pi * i / 400;
      final q = pl.p(xt({...e, 't': t}), yt({...e, 't': t}));
      i == 0 ? path.moveTo(q.dx, q.dy) : path.lineTo(q.dx, q.dy);
    }
    c.drawPath(path, MPaint.stroke(IX.accent.withValues(alpha: 0.3), 3));
    final done = Path();
    for (var i = 0; i <= 300; i++) {
      final t = s.x0 * i / 300;
      final q = pl.p(xt({...e, 't': t}), yt({...e, 't': t}));
      i == 0 ? done.moveTo(q.dx, q.dy) : done.lineTo(q.dx, q.dy);
    }
    c.drawPath(done, MPaint.stroke(IX.accent, 4.5));
    final t = s.x0;
    final P = Offset(xt({...e, 't': t}), yt({...e, 't': t}));
    if (s.pr['wheel'] != false) {
      final ctr = pl.p(t, 1);
      c.drawCircle(ctr, pl.ux, MPaint.stroke(IX.steel, 2.5));
      c.drawLine(ctr, pl.p(P.dx, P.dy), MPaint.stroke(IX.steel, 2));
      MPaint.dot(c, ctr, IX.steel, r: 5);
    }
    final dx = (xt({...e, 't': t + 1e-5}) - xt({...e, 't': t - 1e-5})) / 2e-5, dy = (yt({...e, 't': t + 1e-5}) - yt({...e, 't': t - 1e-5})) / 2e-5;
    final len = math.sqrt(dx * dx + dy * dy);
    if (len > 1e-9) {
      final u = Offset(dx, dy) / len * 1.6;
      c.drawLine(pl.p(P.dx - u.dx, P.dy - u.dy), pl.p(P.dx + u.dx, P.dy + u.dy), MPaint.stroke(IX.positive, 3.5));
    }
    MPaint.dot(c, pl.p(P.dx, P.dy), IX.positive, r: 10);
    IxPaint.label(c, 'x = t − sin t,  y = 1 − cos t', Offset(pl.rect.left + 16, pl.rect.top + 10), size: 22, color: IX.ink, w: FontWeight.w700, align: Alignment.topLeft, halo: true);
  }

  void _ripple(Canvas c, Size size) {
    final e = s.env;
    final v = _num(s.pr['v'], e, 5);
    final o = Offset(size.width * 0.24, size.height * 0.5);
    final scale = math.min(size.width * 0.2, size.height * 0.42) / (v * 8);
    c.drawCircle(o, v * 8 * scale + 20, Paint()..color = IX.glass);
    for (var k = 1; k <= 4; k++) {
      final rr = v * s.x0 * scale * k / 4;
      c.drawCircle(o, rr, MPaint.stroke(IX.accent.withValues(alpha: 0.25 + 0.18 * k), k == 4 ? 4 : 2));
    }
    c.drawLine(o, o + Offset(v * s.x0 * scale, 0), MPaint.stroke(IX.positive, 3));
    IxPaint.label(c, 'r = ${fmt(v * s.x0, 1)} cm', o + Offset(v * s.x0 * scale / 2, -18), size: 19, color: IX.positive, w: FontWeight.w700, halo: true);
    final pl = Plane(Rect.fromLTRB(size.width * 0.5, 60, size.width - 50, size.height - 60), 0, 8, 0, math.pi * math.pow(v * 8, 2) * 1.1);
    pl.paintGrid(c, xLabel: 't (s)', yLabel: 'A (cm²)');
    pl.curve(c, (t) => math.pi * v * v * t * t, IX.ink, width: 4);
    final t0 = s.x0, a0 = math.pi * v * v * t0 * t0, m = 2 * math.pi * v * v * t0;
    c.save();
    c.clipRect(pl.rect);
    c.drawLine(pl.p(t0 - 2, a0 - 2 * m), pl.p(t0 + 2, a0 + 2 * m), MPaint.stroke(IX.positive, 3));
    c.restore();
    MPaint.dot(c, pl.p(t0, a0), IX.positive, r: 9);
    IxPaint.label(c, 'slope dA/dt = ${fmt(m, 0)} cm²/s', pl.p(t0, a0) + const Offset(-16, -24), size: 19, color: IX.positive, w: FontWeight.w700, align: Alignment.centerRight, halo: true);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
