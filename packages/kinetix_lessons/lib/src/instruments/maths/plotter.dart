import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'common.dart';

/// The lesson's own model: sliders (with their current values), named intermediate values
/// and readouts, all as expressions. Shared by the function plotter and the data chart.
class SpecModel {
  SpecModel(Map<String, dynamic> p)
      : sliders = SliderSpec.list(p['sliders']),
        vars = varList(p['vars']),
        readouts = ReadoutSpec.list(p['readouts']),
        consts = {
          if (p['consts'] is Map)
            for (final e in (p['consts'] as Map).entries)
              if (e.value is num) e.key as String: (e.value as num).toDouble(),
        },
        variants = [
          if (p['variants'] is List)
            for (final v in p['variants'] as List)
              if (v is Map && v['values'] is Map) (tx(v['label']) ?? 'Variant', {for (final e in (v['values'] as Map).entries) e.key as String: (e.value as num).toDouble()}),
        ] {
    reset();
  }

  final List<SliderSpec> sliders;
  final List<(String, Expr)> vars;
  final List<ReadoutSpec> readouts;
  final Map<String, double> consts;
  final List<(String, Map<String, double>)> variants;
  final values = <String, double>{};

  void reset() {
    values
      ..clear()
      ..addAll({for (final s in sliders) s.name: s.value});
  }

  void applyVariant(Map<String, double> v) {
    reset();
    for (final e in v.entries) {
      final s = sliders.where((s) => s.name == e.key).firstOrNull;
      values[e.key] = s == null ? e.value : e.value.clamp(math.min(s.min, s.max), math.max(s.min, s.max)).toDouble();
    }
  }

  Env env([Map<String, double> extra = const {}]) {
    final e = <String, double>{...consts, ...values, ...extra};
    evalVars(e, vars);
    return e;
  }

  List<Readout> readoutCards(Env e, {int max = 6}) => [
    for (final (i, r) in readouts.take(max).indexed) Readout(r.label, fmt(r.expr(e), r.digits), r.unit, MX.series[i % MX.series.length]),
  ];

  List<Widget> controls(void Function(VoidCallback) setState) => [
    for (final s in sliders) s.build(values[s.name] ?? s.value, (v) => setState(() => values[s.name] = v)),
  ];

  List<Preset> presets(void Function(VoidCallback) setState, void Function(int?) mark) => [
    Preset('Start values', () => setState(() {
      reset();
      mark(0);
    })),
    for (final (i, v) in variants.indexed)
      Preset(v.$1, () => setState(() {
        applyVariant(v.$2);
        mark(i + 1);
      })),
  ];
}

class _Fn {
  _Fn(this.expr, this.label, this.color, this.dashed, this.from, this.to);
  final Expr expr;
  final String label;
  final Color color;
  final bool dashed;
  final Expr? from, to;
}

/// Function plotter: the lesson's curves y = f(x) with its sliders and read-outs, plus
/// optional markers, tangents, shaded areas, points and vertical lines.
///
/// Preset: {"fns": [{"fn": "a*x^2", "label": "y = ax²", "color": "yellow"}], "sliders": [...],
/// "readouts": [...], "x": [-5, 5], "y": [-4, 4], "xLabel": "x", "yLabel": "y", "marker": "x0",
/// "tangent": {"fn": 0, "at": "x0"}, "shade": [{"fn": 0, "g": 1, "from": "p", "to": "q"}],
/// "points": [{"x": "h", "y": "k", "label": "C"}], "vlines": [{"x": "a", "label": "x = a"}],
/// "piTicks": false, "equal": false, "caption": "…", "title": "…"}.
class PlotterInstrument extends StatefulWidget {
  const PlotterInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<PlotterInstrument> createState() => _PlotterState();
}

class _PlotterState extends State<PlotterInstrument> {
  late SpecModel model;
  late List<_Fn> fns;
  int? active = 0;
  bool _drag = false;

  Map<String, dynamic> get p => widget.preset.isEmpty ? _demo : widget.preset;

  static const _demo = {
    'title': 'Graph of a quadratic',
    'fns': [
      {'fn': 'a*x^2 + b*x + c', 'label': 'y = ax² + bx + c'},
    ],
    'sliders': [
      {'name': 'a', 'label': 'a', 'min': -3, 'max': 3, 'step': 0.1, 'value': 1},
      {'name': 'b', 'label': 'b', 'min': -4, 'max': 4, 'step': 0.1, 'value': -2},
      {'name': 'c', 'label': 'c', 'min': -4, 'max': 4, 'step': 0.1, 'value': -1},
    ],
    'readouts': [
      {'label': 'Vertex x = −b/2a', 'expr': '-b/(2*a)'},
      {'label': 'Discriminant b² − 4ac', 'expr': 'b^2 - 4*a*c'},
    ],
    'x': [-5, 5],
    'y': [-5, 6],
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(PlotterInstrument old) {
    super.didUpdateWidget(old);
    if (old.preset != widget.preset) _load();
  }

  void _load() {
    model = SpecModel(p);
    fns = [
      if (p['fns'] is List)
        for (final (i, f) in (p['fns'] as List).indexed)
          if (f is Map && f['fn'] != null) _Fn(Expr.safe(f['fn']), tx(f['label']) ?? '', MX.named(f['color'], i), f['dashed'] == true, f['from'] == null ? null : Expr.safe(f['from']), f['to'] == null ? null : Expr.safe(f['to'])),
    ];
  }

  String? get markerName {
    final m = p['marker'];
    if (m is String) return m.isEmpty ? null : m;
    if (m == false) return null;
    for (final n in ['x0', 'x₀', 'xv', 'xx']) {
      if (model.sliders.any((s) => s.name == n)) return n;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final env = model.env();
    final title = tx(p['title']) ?? 'Function plotter';
    return InstrumentFrame(
      id: 'maths-plotter',
      subtitle: tx(p['subtitle']) ?? '$kMaths · Graphs of functions',
      title: title,
      formula: tx(p['formula']),
      state: {...model.values},
      readouts: model.readoutCards(env),
      controls: [...model.controls(setState), if (model.sliders.isEmpty) Text('Drag on the graph to read values.', style: IX.text(18, c: IX.inkSoft))],
      presets: model.presets(setState, (i) => active = i),
      activePreset: active,
      stage: LayoutBuilder(builder: (context, box) {
        final size = box.biggest;
        final plane = _plane(size, env);
        final mk = markerName;
        return GestureDetector(
          onPanStart: (e) => _drag = mk != null,
          onPanUpdate: (e) {
            if (!_drag || mk == null) return;
            final s = model.sliders.firstWhere((s) => s.name == mk);
            var v = plane.wx(e.localPosition.dx).clamp(math.min(s.min, s.max), math.max(s.min, s.max)).toDouble();
            if (s.step != null && s.step! > 0) v = (s.min + ((v - s.min) / s.step!).round() * s.step!);
            setState(() {
              model.values[mk] = v;
              active = null;
            });
          },
          onPanEnd: (_) => _drag = false,
          child: CustomPaint(size: size, painter: _PlotPainter(this, plane, env)),
        );
      }),
    );
  }

  Plane _plane(Size size, Env env) {
    final xr = p['x'] is List ? [for (final v in p['x'] as List) Expr.safe(v)(env)] : [-6.0, 6.0];
    var yr = p['y'] is List ? [for (final v in p['y'] as List) Expr.safe(v)(env)] : <double>[];
    if (yr.length < 2 || yr.any((v) => !v.isFinite)) {
      // Fit the y-range to the curves.
      var lo = double.infinity, hi = -double.infinity;
      for (final f in fns) {
        for (var k = 0; k <= 200; k++) {
          final x = xr[0] + (xr[1] - xr[0]) * k / 200;
          final y = f.expr({...env, 'x': x});
          if (y.isFinite) {
            lo = math.min(lo, y);
            hi = math.max(hi, y);
          }
        }
      }
      if (!lo.isFinite) {
        lo = -5;
        hi = 5;
      }
      final pad = (hi - lo) * 0.12 + 0.5;
      yr = [math.min(lo - pad, 0), math.max(hi + pad, 0)];
    }
    final hasCap = tx(p['caption']) != null;
    final rect = Rect.fromLTRB(78, 56, size.width - 52, size.height - (hasCap ? 128 : 58));
    return Plane(rect, xr[0], xr[1], yr[0], yr[1], equal: p['equal'] == true);
  }
}

class _PlotPainter extends CustomPainter {
  _PlotPainter(this.s, this.pl, this.env);
  final _PlotterState s;
  final Plane pl;
  final Env env;

  double ev(Object? o, [double f = double.nan]) => o == null ? f : Expr.safe(o)(env);
  double Function(double) fnOf(_Fn f) => (x) => f.expr({...env, 'x': x});

  @override
  void paint(Canvas c, Size size) {
    final p = s.p;
    pl.paintGrid(c, xLabel: tx(p['xLabel']) ?? 'x', yLabel: tx(p['yLabel']) ?? 'y', piTicks: p['piTicks'] == true);

    // Shaded regions under or between curves.
    if (p['shade'] is List) {
      for (final (i, sh) in (p['shade'] as List).indexed) {
        if (sh is! Map) continue;
        final fi = (sh['fn'] as num?)?.toInt() ?? 0;
        if (fi >= s.fns.length) continue;
        final gi = (sh['g'] as num?)?.toInt();
        final a = ev(sh['from'], pl.xa), b = ev(sh['to'], pl.xb);
        if (!a.isFinite || !b.isFinite) continue;
        final col = sh['color'] != null ? MX.named(sh['color'], i) : s.fns[fi].color;
        pl.fillBetween(c, fnOf(s.fns[fi]), gi != null && gi < s.fns.length ? fnOf(s.fns[gi]) : null, a, b, col.withValues(alpha: 0.16));
        for (final x in [a, b]) {
          final y = fnOf(s.fns[fi])(x);
          if (y.isFinite && x >= pl.xa && x <= pl.xb) IxPaint.dashed(c, pl.p(x, gi != null && gi < s.fns.length ? fnOf(s.fns[gi])(x).clamp(pl.ya, pl.yb) : 0.0.clamp(pl.ya, pl.yb)), pl.p(x, y.clamp(pl.ya, pl.yb)), MPaint.stroke(col.withValues(alpha: 0.7), 2), dash: 7, gap: 6);
        }
      }
    }
    // y = x mirror line.
    if (p['mirror'] == true) {
      final a = math.max(pl.xa, pl.ya), b = math.min(pl.xb, pl.yb);
      IxPaint.dashed(c, pl.p(a, a), pl.p(b, b), MPaint.stroke(IX.steel, 2), dash: 10, gap: 8);
      IxPaint.label(c, 'y = x', pl.p(b, b) + const Offset(-10, 18), size: 17, color: IX.inkSoft, align: Alignment.centerRight, halo: true);
    }
    // Vertical guide lines.
    if (p['vlines'] is List) {
      for (final v in p['vlines'] as List) {
        if (v is! Map) continue;
        final x = ev(v['x']);
        if (!x.isFinite || x < pl.xa || x > pl.xb) continue;
        final col = v['color'] != null ? MX.named(v['color'], 1) : MX.red;
        IxPaint.dashed(c, Offset(pl.sx(x), pl.rect.top), Offset(pl.sx(x), pl.rect.bottom), MPaint.stroke(col.withValues(alpha: 0.8), 2), dash: 9, gap: 7);
        final lab = tx(v['label']);
        if (lab != null) IxPaint.label(c, lab, Offset(pl.sx(x) + 8, pl.rect.top + 14), size: 17, color: col, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
      }
    }
    // Curves.
    for (final f in s.fns) {
      pl.curve(c, fnOf(f), f.color, width: 4, dashed: f.dashed, from: f.from == null ? null : f.from!(env), to: f.to == null ? null : f.to!(env));
    }
    // Tangent.
    if (p['tangent'] is Map) {
      final t = p['tangent'] as Map;
      final fi = (t['fn'] as num?)?.toInt() ?? 0;
      if (fi < s.fns.length) {
        final f = fnOf(s.fns[fi]);
        final x0 = ev(t['at'], 0);
        const h = 1e-5;
        final y0 = f(x0), m = (f(x0 + h) - f(x0 - h)) / (2 * h);
        if (y0.isFinite && m.isFinite) {
          c.save();
          c.clipRect(pl.rect);
          final span = (pl.xb - pl.xa) * 0.28 / math.sqrt(1 + m * m * (pl.uy / pl.ux) * (pl.uy / pl.ux));
          c.drawLine(pl.p(x0 - span, y0 - m * span), pl.p(x0 + span, y0 + m * span), MPaint.stroke(IX.positive, 3.5));
          c.restore();
          IxPaint.label(c, 'slope ${fmt(m, 2)}', pl.p(x0, y0) + const Offset(16, -26), size: 17, color: IX.positive, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
        }
      }
    }
    // Marker at x = slider.
    final mk = s.markerName;
    if (mk != null) {
      final x0 = env[mk] ?? double.nan;
      if (x0.isFinite && x0 >= pl.xa && x0 <= pl.xb) {
        IxPaint.dashed(c, Offset(pl.sx(x0), pl.rect.top), Offset(pl.sx(x0), pl.rect.bottom), MPaint.stroke(IX.steel, 1.6), dash: 6, gap: 6);
        for (final f in s.fns) {
          final y = fnOf(f)(x0);
          if (y.isFinite && y >= pl.ya && y <= pl.yb) MPaint.dot(c, pl.p(x0, y), f.color, r: 9);
        }
        IxPaint.handle(c, Offset(pl.sx(x0), pl.sy(math.max(pl.ya, math.min(pl.yb, 0)))), IX.accent, r: 14, active: s._drag);
      }
    }
    // Labelled points.
    if (p['points'] is List) {
      for (final (i, q) in (p['points'] as List).indexed) {
        if (q is! Map) continue;
        final x = ev(q['x']), y = ev(q['y']);
        if (!x.isFinite || !y.isFinite || !pl.contains(x, y)) continue;
        final col = q['color'] != null ? MX.named(q['color'], i) : IX.ink;
        q['open'] == true ? MPaint.hole(c, pl.p(x, y), col) : MPaint.dot(c, pl.p(x, y), col);
        final lab = tx(q['label']);
        if (lab != null) IxPaint.label(c, lab, pl.p(x, y) + const Offset(14, -18), size: 18, color: col, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
      }
    }
    // Legend.
    final items = [for (final f in s.fns) if (f.label.isNotEmpty) (f.color, f.label)];
    if (items.isNotEmpty) MPaint.legend(c, Offset(pl.rect.left + 18, pl.rect.top + 8), items);
    final cap = tx(p['caption']);
    if (cap != null) MPaint.note(c, cap, Rect.fromLTRB(28, 0, size.width - 28, size.height - 18));
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
