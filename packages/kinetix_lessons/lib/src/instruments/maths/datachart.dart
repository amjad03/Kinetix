import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'common.dart';
import 'plotter.dart';

/// Data chart: the lesson's quantities as a bar diagram, a pie diagram or points on a number
/// line, driven by its sliders and formulas.
///
/// Preset: {"chart": "bar"|"pie"|"line", "data": {"label": "expr", …}, "groups": [{"label": "Boys",
/// "data": {…}}], "stacked": false, "percent": false, "points": ["a", {"x": "b", "label": "b",
/// "open": true}], "shade": [["a", "b"]], "integers": ["a", "b - 1"], "x": [-6, 6], "y": [0, 40],
/// "sliders": […], "vars": […], "readouts": […], "unit": "", "digits": 0, "caption": "…"}.
class DataChartInstrument extends StatefulWidget {
  const DataChartInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<DataChartInstrument> createState() => _DataChartState();
}

class _DataChartState extends State<DataChartInstrument> {
  late SpecModel model;
  int? active = 0;

  Map<String, dynamic> get p => widget.preset.isEmpty ? _demo : widget.preset;

  static const _demo = {
    'chart': 'bar',
    'title': 'Subsets of a finite set',
    'sliders': [
      {'name': 'n', 'label': 'n(A)', 'min': 0, 'max': 6, 'step': 1, 'value': 3},
    ],
    'data': {'subsets 2ⁿ': '2^n', 'proper subsets': '2^n - 1', 'elements n': 'n'},
    'readouts': [
      {'label': 'subsets 2ⁿ', 'expr': '2^n', 'digits': 0},
    ],
  };

  @override
  void initState() {
    super.initState();
    model = SpecModel(p);
  }

  @override
  void didUpdateWidget(DataChartInstrument old) {
    super.didUpdateWidget(old);
    if (old.preset != widget.preset) model = SpecModel(p);
  }

  String get chart => ps(p, 'chart', 'bar');

  @override
  Widget build(BuildContext context) {
    final env = model.env();
    return InstrumentFrame(
      id: 'maths-datachart',
      subtitle: tx(p['subtitle']) ?? '$kMaths · Data and counting',
      title: tx(p['title']) ?? (chart == 'pie' ? 'Pie diagram' : chart == 'line' ? 'Number line' : 'Bar diagram'),
      formula: tx(p['formula']),
      state: {...model.values},
      readouts: model.readoutCards(env),
      controls: model.controls(setState),
      presets: model.presets(setState, (i) => active = i),
      activePreset: active,
      stage: CustomPaint(painter: _ChartPainter(this, env), size: Size.infinite),
    );
  }
}

List<(String, Expr)> _data(Object? d) {
  if (d is Map) return [for (final e in d.entries) ('${e.key}', Expr.safe(e.value))];
  if (d is List) {
    return [
      for (final e in d)
        if (e is List && e.length >= 2) ('${tx(e[0]) ?? e[0]}', Expr.safe(e[1])) else if (e is Map) (tx(e['label']) ?? '', Expr.safe(e['value'] ?? e['expr'])),
    ];
  }
  return const [];
}

class _ChartPainter extends CustomPainter {
  _ChartPainter(this.s, this.env);
  final _DataChartState s;
  final Env env;

  Map<String, dynamic> get p => s.p;

  @override
  void paint(Canvas c, Size size) {
    final cap = tx(p['caption']);
    final bottom = size.height - (cap != null ? 120 : 30);
    final area = Rect.fromLTRB(40, 40, size.width - 40, bottom);
    switch (s.chart) {
      case 'pie':
        _pie(c, area);
      case 'line':
        _line(c, area);
      default:
        _bars(c, area);
    }
    if (cap != null) MPaint.note(c, cap, Rect.fromLTRB(28, 0, size.width - 28, size.height - 18));
  }

  String _v(double v) {
    final d = pint(p, 'digits', v == v.roundToDouble() ? 0 : 2);
    final u = ps(p, 'unit', '');
    return '${fmt(v, d)}$u';
  }

  void _bars(Canvas c, Rect area) {
    final groups = <(String, List<(String, Expr)>)>[
      if (p['groups'] is List)
        for (final g in p['groups'] as List)
          if (g is Map) (tx(g['label']) ?? '', _data(g['data'])),
    ];
    final single = groups.isEmpty;
    final cats = single ? _data(p['data']) : groups.first.$2;
    if (cats.isEmpty) return;
    final stacked = p['stacked'] == true, percent = p['percent'] == true;
    // values[g][k]
    final vals = single ? [for (final d in cats) [d.$2(env)]] : [for (var k = 0; k < cats.length; k++) [for (final g in groups) k < g.$2.length ? g.$2[k].$2(env) : 0.0]];
    if (percent) {
      for (final row in vals) {
        final t = row.fold<double>(0, (a, b) => a + (b.isFinite ? b : 0));
        for (var i = 0; i < row.length; i++) {
          row[i] = t == 0 ? 0 : row[i] / t * 100;
        }
      }
    }
    // For stacked or percent bars each category is one bar split into the groups.
    var hi = 0.0, lo = 0.0;
    for (final row in vals) {
      if (stacked || percent) {
        hi = math.max(hi, row.fold<double>(0, (a, b) => a + (b.isFinite ? math.max(b, 0) : 0)));
      } else {
        for (final v in row) {
          if (v.isFinite) {
            hi = math.max(hi, v);
            lo = math.min(lo, v);
          }
        }
      }
    }
    final yr = pl(p, 'y', []);
    final y0 = yr.length == 2 ? yr[0] : lo * 1.15, y1 = yr.length == 2 ? yr[1] : (hi <= 0 ? 1 : hi * 1.18);
    final legendH = single ? 0.0 : 48.0;
    final plane = Plane(Rect.fromLTRB(area.left + 70, area.top + 20 + legendH, area.right - 20, area.bottom - 56), 0, cats.length.toDouble(), y0.toDouble(), (y1 == y0 ? y0 + 1 : y1).toDouble());
    plane.paintGrid(c, xLabel: tx(p['xLabel']) ?? '', yLabel: tx(p['yLabel']) ?? (percent ? '%' : ''), xTick: (_) => '', xStep: 1000);
    final n = cats.length;
    final slot = plane.rect.width / n;
    final gcount = single || stacked || percent ? 1 : groups.length;
    final bw = math.min(slot * 0.62 / gcount, 150.0);
    for (var k = 0; k < n; k++) {
      final cx = plane.rect.left + slot * (k + 0.5);
      if (single || stacked || percent) {
        var base = 0.0;
        for (var g = 0; g < vals[k].length; g++) {
          final v = vals[k][g];
          if (!v.isFinite) continue;
          final col = single ? MX.series[k % MX.series.length] : MX.series[g % MX.series.length];
          final top = single ? v : base + v;
          final r = Rect.fromLTRB(cx - bw / 2, plane.sy(math.max(single ? 0 : base, top).clamp(plane.ya, plane.yb).toDouble()), cx + bw / 2, plane.sy(math.min(single ? 0 : base, top).clamp(plane.ya, plane.yb).toDouble()));
          c.drawRRect(RRect.fromRectAndCorners(r, topLeft: const Radius.circular(6), topRight: const Radius.circular(6)), Paint()..color = col.withValues(alpha: 0.88));
          if (!single && r.height > 26) IxPaint.label(c, percent ? '${fmt(v, 0)}%' : _v(v), r.center, size: 16, color: Colors.white, w: FontWeight.w600);
          if (single) IxPaint.label(c, _v(v), Offset(cx, r.top - 8), size: 22, color: IX.ink, w: FontWeight.w600, align: Alignment.bottomCenter);
          base += v;
        }
        if (!single && !percent) IxPaint.label(c, _v(base), Offset(cx, plane.sy(base.clamp(plane.ya, plane.yb).toDouble()) - 8), size: 19, color: IX.ink, w: FontWeight.w600, align: Alignment.bottomCenter);
      } else {
        for (var g = 0; g < gcount; g++) {
          final v = vals[k][g];
          if (!v.isFinite) continue;
          final x = cx - bw * gcount / 2 + bw * g;
          final r = Rect.fromLTRB(x + 3, plane.sy(math.max(0, v).clamp(plane.ya, plane.yb).toDouble()), x + bw - 3, plane.sy(math.min(0, v).clamp(plane.ya, plane.yb).toDouble()));
          c.drawRRect(RRect.fromRectAndCorners(r, topLeft: const Radius.circular(5), topRight: const Radius.circular(5)), Paint()..color = MX.series[g % MX.series.length].withValues(alpha: 0.88));
          IxPaint.label(c, _v(v), Offset(r.center.dx, r.top - 6), size: 17, color: IX.ink, w: FontWeight.w600, align: Alignment.bottomCenter);
        }
      }
      IxPaint.label(c, cats[k].$1, Offset(cx, plane.rect.bottom + 14), size: n > 7 ? 15 : 19, color: IX.ink, w: FontWeight.w500, align: Alignment.topCenter);
    }
    if (!single) {
      var x = plane.rect.left;
      for (var g = 0; g < groups.length; g++) {
        c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(x, area.top + 6, 22, 22), const Radius.circular(5)), Paint()..color = MX.series[g % MX.series.length]);
        IxPaint.label(c, groups[g].$1, Offset(x + 32, area.top + 17), size: 18, color: IX.ink, align: Alignment.centerLeft);
        x += 60 + MPaint.measure(groups[g].$1, 18).width;
      }
    }
  }

  void _pie(Canvas c, Rect area) {
    final d = _data(p['data']);
    final vals = [for (final e in d) math.max(0.0, e.$2(env).isFinite ? e.$2(env) : 0.0)];
    final total = vals.fold<double>(0, (a, b) => a + b);
    final r = math.min(area.height * 0.46, area.width * 0.28);
    final o = Offset(area.left + r + 60, area.center.dy);
    if (total <= 0) {
      c.drawCircle(o, r, MPaint.stroke(IX.rule, 2));
      IxPaint.label(c, 'Total is 0', o, size: 22, color: IX.inkSoft);
      return;
    }
    var a = -math.pi / 2;
    for (var k = 0; k < d.length; k++) {
      final sw = vals[k] / total * 2 * math.pi;
      final col = MX.series[k % MX.series.length];
      c.drawArc(Rect.fromCircle(center: o, radius: r), a, sw, true, Paint()..color = col.withValues(alpha: 0.88));
      c.drawArc(Rect.fromCircle(center: o, radius: r), a, sw, true, MPaint.stroke(Colors.white, 3));
      if (sw > 0.22) {
        final mid = a + sw / 2;
        IxPaint.label(c, '${fmt(vals[k] / total * 100, 0)}%', o + Offset(math.cos(mid), math.sin(mid)) * r * 0.66, size: 21, color: Colors.white, w: FontWeight.w600);
      }
      a += sw;
    }
    // Key with values and angles.
    var y = area.center.dy - d.length * 34;
    final kx = o.dx + r + 70;
    IxPaint.label(c, 'Sector', Offset(kx + 34, y - 30), size: 16, color: IX.muted, w: FontWeight.w600, align: Alignment.centerLeft);
    IxPaint.label(c, 'Value', Offset(kx + 300, y - 30), size: 16, color: IX.muted, w: FontWeight.w600, align: Alignment.centerRight);
    IxPaint.label(c, 'Angle', Offset(kx + 420, y - 30), size: 16, color: IX.muted, w: FontWeight.w600, align: Alignment.centerRight);
    for (var k = 0; k < d.length; k++) {
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(kx, y - 11, 22, 22), const Radius.circular(5)), Paint()..color = MX.series[k % MX.series.length]);
      IxPaint.label(c, d[k].$1, Offset(kx + 34, y), size: 20, color: IX.ink, align: Alignment.centerLeft);
      IxPaint.label(c, _v(vals[k]), Offset(kx + 300, y), size: 20, color: IX.ink, w: FontWeight.w600, align: Alignment.centerRight);
      IxPaint.label(c, '${fmt(vals[k] / total * 360, 1)}°', Offset(kx + 420, y), size: 20, color: IX.inkSoft, align: Alignment.centerRight);
      y += 68;
    }
  }

  void _line(Canvas c, Rect area) {
    final xr = pl(p, 'x', [-10, 10]);
    final plane = Plane(Rect.fromLTRB(area.left + 40, area.center.dy - 60, area.right - 40, area.center.dy + 60), xr[0], xr[1], -1, 1);
    final y = plane.sy(0);
    final ax = MPaint.stroke(IX.ink, 2.5);
    c.drawLine(Offset(plane.rect.left - 20, y), Offset(plane.rect.right + 20, y), ax);
    IxPaint.arrow(c, Offset(plane.rect.right, y), Offset(plane.rect.right + 30, y), IX.ink, width: 2.5);
    IxPaint.arrow(c, Offset(plane.rect.left, y), Offset(plane.rect.left - 30, y), IX.ink, width: 2.5);
    final st = niceStep(xr[1] - xr[0], plane.rect.width / 70);
    for (var k = (xr[0] / st).ceil(); k <= (xr[1] / st).floor(); k++) {
      final x = plane.sx(k * st);
      c.drawLine(Offset(x, y - 9), Offset(x, y + 9), MPaint.stroke(IX.ink, 1.6));
      IxPaint.label(c, fmtT(k * st, st >= 1 ? 0 : 1), Offset(x, y + 16), size: 16, color: IX.inkSoft, align: Alignment.topCenter);
    }
    // Shaded intervals.
    final sh = p['shade'];
    final pts = [
      if (p['points'] is List)
        for (final q in p['points'] as List)
          if (q is Map) (Expr.safe(q['x'])(env), tx(q['label']), q['open'] == true) else (Expr.safe(q)(env), q is String ? q.replaceAll('*', '') : null, false),
    ];
    final ints = <(double, double)>[
      if (sh is List)
        for (final iv in sh)
          if (iv is List && iv.length == 2) (Expr.safe(iv[0])(env), Expr.safe(iv[1])(env)),
    ];
    if (ints.isEmpty && pts.length >= 2 && p['interval'] != false) {
      final xs = [for (final q in pts) q.$1]..sort();
      ints.add((xs.first, xs.last));
    }
    for (final (a, b) in ints) {
      if (!a.isFinite || !b.isFinite) continue;
      final l = plane.sx(math.max(math.min(a, b), xr[0] - 1)), r = plane.sx(math.min(math.max(a, b), xr[1] + 1));
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(l, y - 9, r, y + 9), const Radius.circular(9)), Paint()..color = IX.accent.withValues(alpha: 0.22));
      c.drawLine(Offset(l, y), Offset(r, y), MPaint.stroke(IX.accent, 6));
    }
    // Integer elements.
    if (p['integers'] is List && (p['integers'] as List).length == 2) {
      final a = Expr.safe((p['integers'] as List)[0])(env).ceil(), b = Expr.safe((p['integers'] as List)[1])(env).floor();
      for (var k = a; k <= b && k - a < 200; k++) {
        MPaint.dot(c, Offset(plane.sx(k.toDouble()), y), IX.positive, r: 8);
      }
    }
    for (final (i, (x, lab, open)) in pts.indexed) {
      if (!x.isFinite) continue;
      final at = Offset(plane.sx(x.clamp(xr[0], xr[1])), y);
      final col = MX.series[i % MX.series.length];
      open ? MPaint.hole(c, at, col, r: 11) : MPaint.dot(c, at, col, r: 11);
      final up = i.isEven;
      final txt = lab == null ? fmtT(x) : '$lab = ${fmtT(x)}';
      c.drawLine(at + Offset(0, up ? -14 : 14), at + Offset(0, up ? -56 : 56), MPaint.stroke(col, 2));
      IxPaint.label(c, txt, at + Offset(0, up ? -64 : 64), size: 21, color: col, w: FontWeight.w600, align: up ? Alignment.bottomCenter : Alignment.topCenter, halo: true);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
