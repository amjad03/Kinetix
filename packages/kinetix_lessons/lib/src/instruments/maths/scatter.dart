import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'common.dart';

class _Stats {
  _Stats(List<Offset> p) {
    n = p.length.toDouble();
    mx = p.fold(0.0, (a, b) => a + b.dx) / n;
    my = p.fold(0.0, (a, b) => a + b.dy) / n;
    for (final q in p) {
      sxx += (q.dx - mx) * (q.dx - mx);
      syy += (q.dy - my) * (q.dy - my);
      sxy += (q.dx - mx) * (q.dy - my);
    }
  }
  double n = 0, mx = 0, my = 0, sxx = 0, syy = 0, sxy = 0;
  double get r => sxx == 0 || syy == 0 ? double.nan : sxy / math.sqrt(sxx * syy);
  double get byx => sxx == 0 ? double.nan : sxy / sxx;
  double get bxy => syy == 0 ? double.nan : sxy / syy;
}

/// Bivariate data and series: scatter diagrams for any correlation, Pearson's r from points you
/// drag (with the quadrants of dx·dy), the two regression lines and estimates, Spearman's rank
/// correlation, time-series trends (semi-averages, moving averages, least squares, curves),
/// control charts, and interpolation through given points with the difference table.
///
/// Preset: {"mode": "scatter"|"points"|"regression"|"estimate"|"rank"|"timeseries"|"control"|"interp",
/// "rho": 0.6, "n": 40, "curve": false, "points": [[x, y], …], "r": 0.6, "mx": 40, "my": 40, "sx": 8,
/// "sy": 10, "x0": 50, "ranksA": [1,2,3,4,5], "ranksB": [2,1,3,5,4], "series": [..], "start": 2011,
/// "trend": "semi"|"moving"|"least"|"parabola"|"exp", "k": 4, "season": 4, "cl": 50, "sigma": 2, "nSample": 5,
/// "chart": "x"|"r"|"p"|"np", "xs": [..], "ys": [..], "at": 2.5, "method": "newton"|"lagrange"}.
class ScatterInstrument extends StatefulWidget {
  const ScatterInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<ScatterInstrument> createState() => _ScatterState();
}

class _ScatterState extends State<ScatterInstrument> {
  String mode = 'scatter', trend = 'least', chart = 'x', method = 'newton';
  double rho = 0.6, r = 0.6, mx = 40, my = 40, sx = 8, sy = 10, x0 = 50, cl = 50, sigma = 2, at = 2.5, start = 2011;
  int n = 40, k = 4, seed = 3, nSample = 5;
  bool curve = false, lines = true;
  List<Offset> pts = [];
  List<int> ranksA = [1, 2, 3, 4, 5], ranksB = [2, 1, 3, 5, 4];
  List<double> series = [], xs = [1, 2, 3, 4], ys = [1, 8, 27, 64];
  int? active;
  int _drag = -1;

  static final _presets = <String, Map<String, dynamic>>{
    'Correlation': {'mode': 'scatter', 'rho': 0.7, 'n': 40},
    'Drag the points': {'mode': 'points', 'points': [[2, 3], [4, 4], [5, 7], [7, 6], [8, 9], [10, 10]]},
    'Regression lines': {'mode': 'regression', 'points': [[1, 2], [2, 4], [3, 3], [4, 6], [5, 5], [6, 8]]},
    'Rank correlation': {'mode': 'rank', 'ranksA': [1, 2, 3, 4, 5], 'ranksB': [2, 1, 3, 5, 4]},
    'Trend': {'mode': 'timeseries', 'trend': 'moving', 'k': 4, 'season': 4},
    'Control chart': {'mode': 'control', 'cl': 50, 'sigma': 2},
  };

  @override
  void initState() {
    super.initState();
    _apply(widget.preset.isEmpty ? _presets['Correlation']! : widget.preset);
    if (widget.preset.isEmpty) active = 0;
  }

  void _apply(Map<String, dynamic> m) {
    mode = ps(m, 'mode', 'scatter');
    rho = pd(m, 'rho', 0.6);
    n = pint(m, 'n', 40);
    curve = pb(m, 'curve', false);
    pts = [if (m['points'] is List) for (final q in m['points'] as List) Offset((q[0] as num).toDouble(), (q[1] as num).toDouble())];
    r = pd(m, 'r', 0.6);
    mx = pd(m, 'mx', 40);
    my = pd(m, 'my', 40);
    sx = pd(m, 'sx', 8);
    sy = pd(m, 'sy', 10);
    x0 = pd(m, 'x0', mx + sx);
    ranksA = m['ranksA'] is List ? [for (final e in m['ranksA'] as List) (e as num).round()] : [1, 2, 3, 4, 5];
    ranksB = m['ranksB'] is List ? [for (final e in m['ranksB'] as List) (e as num).round()] : [2, 1, 3, 5, 4];
    trend = ps(m, 'trend', 'least');
    k = pint(m, 'k', 4);
    series = pl(m, 'series', []);
    start = pd(m, 'start', 2011);
    if (series.isEmpty && (mode == 'timeseries')) {
      final season = pint(m, 'season', 0);
      final growth = ps(m, 'growth', 'linear');
      series = [
        for (var t = 0; t < 16; t++)
          (growth == 'exp' ? 20 * math.pow(1.12, t) : growth == 'parabola' ? 20 + 0.6 * t * t - 2 * t : 30 + 3.0 * t) + (season > 0 ? 8 * math.sin(2 * math.pi * t / season) : 0) + 3 * math.sin(t * 2.7),
      ];
    }
    cl = pd(m, 'cl', 50);
    sigma = pd(m, 'sigma', 2);
    nSample = pint(m, 'nSample', 5);
    chart = ps(m, 'chart', 'x');
    xs = pl(m, 'xs', [1, 2, 3, 4]);
    ys = pl(m, 'ys', [1, 8, 27, 64]);
    at = pd(m, 'at', (xs.first + xs.last) / 2 + 0.3);
    method = ps(m, 'method', 'newton');
  }

  /// A deterministic cloud with correlation close to rho.
  List<Offset> get cloud {
    final rnd = math.Random(seed);
    final out = <Offset>[];
    for (var i = 0; i < n; i++) {
      final u1 = rnd.nextDouble(), u2 = rnd.nextDouble(), u3 = rnd.nextDouble(), u4 = rnd.nextDouble();
      final z1 = math.sqrt(-2 * math.log(u1 + 1e-12)) * math.cos(2 * math.pi * u2);
      final z2 = math.sqrt(-2 * math.log(u3 + 1e-12)) * math.cos(2 * math.pi * u4);
      final x = z1;
      final y = curve ? (z1 * z1 - 1) * 0.9 + 0.3 * z2 : rho * z1 + math.sqrt(math.max(0, 1 - rho * rho)) * z2;
      out.add(Offset(50 + 12 * x, 50 + 12 * y));
    }
    return out;
  }

  List<Offset> get data => mode == 'scatter' ? cloud : pts;

  double lagrange(double x) {
    var s = 0.0;
    for (var i = 0; i < xs.length; i++) {
      var t = ys[i];
      for (var j = 0; j < xs.length; j++) {
        if (j != i) t *= (x - xs[j]) / (xs[i] - xs[j]);
      }
      s += t;
    }
    return s;
  }

  List<List<double>> get diffTable {
    final t = <List<double>>[ys];
    while (t.last.length > 1) {
      final l = t.last;
      t.add([for (var i = 0; i < l.length - 1; i++) l[i + 1] - l[i]]);
    }
    return t;
  }

  /// Trend values for the series (index t = 0, 1, …).
  List<double?> get trendValues {
    final y = series, N = y.length;
    switch (trend) {
      case 'semi':
        final h = N ~/ 2;
        final a1 = y.sublist(0, h).reduce((a, b) => a + b) / h, a2 = y.sublist(N - h).reduce((a, b) => a + b) / h;
        final t1 = (h - 1) / 2, t2 = N - h + (h - 1) / 2;
        final slope = (a2 - a1) / (t2 - t1);
        return [for (var t = 0; t < N; t++) a1 + slope * (t - t1)];
      case 'moving':
        final out = List<double?>.filled(N, null);
        if (k.isOdd) {
          for (var t = k ~/ 2; t < N - k ~/ 2; t++) {
            out[t] = y.sublist(t - k ~/ 2, t + k ~/ 2 + 1).reduce((a, b) => a + b) / k;
          }
        } else {
          // Centred: average of two successive k-period averages.
          for (var t = k ~/ 2; t < N - k ~/ 2; t++) {
            final m1 = y.sublist(t - k ~/ 2, t + k ~/ 2).reduce((a, b) => a + b) / k;
            final m2 = y.sublist(t - k ~/ 2 + 1, t + k ~/ 2 + 1).reduce((a, b) => a + b) / k;
            out[t] = (m1 + m2) / 2;
          }
        }
        return out;
      case 'parabola':
        final c = _polyFit(2);
        return [for (var t = 0; t < N; t++) c[0] + c[1] * t + c[2] * t * t];
      case 'exp':
        final lg = [for (final v in y) math.log(v)];
        final st = _Stats([for (var t = 0; t < N; t++) Offset(t.toDouble(), lg[t])]);
        return [for (var t = 0; t < N; t++) math.exp(st.my + st.byx * (t - st.mx))];
      default:
        final st = _Stats([for (var t = 0; t < N; t++) Offset(t.toDouble(), y[t])]);
        return [for (var t = 0; t < N; t++) st.my + st.byx * (t - st.mx)];
    }
  }

  List<double> _polyFit(int deg) {
    final N = series.length;
    final m = List.generate(deg + 1, (_) => List<double>.filled(deg + 2, 0));
    for (var t = 0; t < N; t++) {
      for (var i = 0; i <= deg; i++) {
        for (var j = 0; j <= deg; j++) {
          m[i][j] += math.pow(t, i + j).toDouble();
        }
        m[i][deg + 1] += series[t] * math.pow(t, i);
      }
    }
    for (var i = 0; i <= deg; i++) {
      for (var r = i + 1; r <= deg; r++) {
        final f = m[r][i] / m[i][i];
        for (var c = i; c <= deg + 1; c++) {
          m[r][c] -= f * m[i][c];
        }
      }
    }
    final x = List<double>.filled(deg + 1, 0);
    for (var i = deg; i >= 0; i--) {
      var s = m[i][deg + 1];
      for (var j = i + 1; j <= deg; j++) {
        s -= m[i][j] * x[j];
      }
      x[i] = s / m[i][i];
    }
    return x;
  }

  List<double> get samples {
    final rnd = math.Random(seed * 13);
    return [
      for (var i = 0; i < 20; i++)
        cl + sigma / math.sqrt(nSample) * (math.sqrt(-2 * math.log(rnd.nextDouble() + 1e-12)) * math.cos(2 * math.pi * rnd.nextDouble())) + (i >= 14 && shift != 0 ? shift : 0),
    ];
  }

  double shift = 0;

  @override
  Widget build(BuildContext context) {
    String title, formula;
    final ro = <Readout>[];
    final ctl = <Widget>[];
    Widget sl(String l, double v, double lo, double hi, ValueChanged<double> on, {int d = 2, int? div}) => IxSlider(label: l, value: v.clamp(lo, hi), min: lo, max: hi, divisions: div ?? 100, format: (x) => fmt(x, d), onChanged: (x) => setState(() { on(x); active = null; }));
    switch (mode) {
      case 'rank':
        final d2 = [for (var i = 0; i < ranksA.length; i++) math.pow(ranksA[i] - ranksB[i], 2).toDouble()].fold(0.0, (a, b) => a + b);
        final nn = ranksA.length;
        title = 'Two judges, one ranking';
        formula = 'ρ = 1 − 6ΣD² / [n(n² − 1)]';
        ro.addAll([Readout('ΣD²', fmt(d2, 0), '', IX.ink), Readout('ρ', fmt(1 - 6 * d2 / (nn * (nn * nn - 1)), 3), '', IX.positive), Readout('Largest ΣD² (ρ = −1)', fmt(nn * (nn * nn - 1) / 3, 0), '', IX.inkSoft)]);
        for (var i = 0; i < nn - 1; i++) {
          ctl.add(IxButton('Swap judge B’s ranks of ${String.fromCharCode(80 + i)} and ${String.fromCharCode(81 + i)}', onTap: () => setState(() {
            final t = ranksB[i];
            ranksB = [...ranksB]..[i] = ranksB[i + 1];
            ranksB[i + 1] = t;
          })));
        }
      case 'estimate':
        final byx = r * sy / sx, bxy = r * sx / sy;
        final yhat = my + byx * (x0 - mx);
        title = 'Estimate with a regression line';
        formula = 'y − ȳ = b_yx (x − x̄),  b_yx = r σᵧ/σₓ';
        ro.addAll([Readout('b_yx = rσᵧ/σₓ', fmt(byx, 3), '', IX.accent), Readout('b_xy = rσₓ/σᵧ', fmt(bxy, 3), '', IX.green), Readout('b_yx × b_xy = r²', fmt(byx * bxy, 3), '', IX.ink), Readout('Estimate ŷ at x = ${fmtT(x0, 1)}', fmt(yhat, 2), '', IX.positive)]);
        ctl.addAll([sl('r', r, -1, 1, (x) => r = x), sl('σₓ', sx, 4, 16, (x) => sx = x, d: 1, div: 24), sl('σᵧ', sy, 4, 16, (x) => sy = x, d: 1, div: 24), sl('x for the estimate', x0, 10, 70, (x) => x0 = x, d: 1, div: 60)]);
      case 'timeseries':
        title = const {'semi': 'Trend by semi-averages', 'moving': 'Moving averages smooth the cycle', 'least': 'Least-squares trend line', 'parabola': 'A parabolic trend', 'exp': 'An exponential trend'}[trend]!;
        formula = const {'semi': 'join the means of the two halves', 'moving': 'average of k successive values', 'least': 'y = a + bt by least squares', 'parabola': 'y = a + bt + ct²', 'exp': 'y = abᵗ  (log y is linear in t)'}[trend]!;
        final tv = trendValues;
        final valid = [for (var i = 0; i < series.length; i++) if (tv[i] != null) (series[i] - tv[i]!) * (series[i] - tv[i]!)];
        ro.addAll([Readout('Values', '${series.length}', '', IX.ink), if (trend == 'moving') Readout('Values lost at each end', '${k ~/ 2}', '', IX.inkSoft), Readout('Mean squared gap to trend', fmt(valid.fold(0.0, (a, b) => a + b) / math.max(1, valid.length), 2), '', IX.positive)]);
        ctl.add(segs<String>('Trend', const {'semi': 'Semi-averages', 'moving': 'Moving average', 'least': 'Least squares', 'parabola': 'Parabola', 'exp': 'Exponential'}, trend, (v) => setState(() => trend = v)));
        if (trend == 'moving') ctl.add(IxSegments<int>(label: 'Period k', options: const {3: '3', 4: '4 (centred)', 5: '5'}, value: k, onChanged: (v) => setState(() => k = v)));
      case 'control':
        final se = chart == 'x' ? sigma / math.sqrt(nSample) : sigma;
        final ucl = cl + 3 * se, lcl = math.max(chart == 'x' ? -1e9 : 0.0, cl - 3 * se);
        final out = samples.where((v) => v > ucl || v < lcl).length;
        title = chart == 'x' ? 'A control chart for the mean' : chart == 'r' ? 'The R chart' : chart == 'p' ? 'A p chart' : 'An np chart';
        formula = 'UCL, LCL = CL ± 3σ';
        ro.addAll([Readout('CL', fmt(cl, 2), '', IX.ink), Readout('UCL', fmt(ucl, 2), '', MX.red), Readout('LCL', fmt(lcl, 2), '', MX.red), Readout('Points out of control', '$out', '', out > 0 ? MX.red : IX.green), Readout('Process', out > 0 ? 'out of control' : 'in control', '', out > 0 ? MX.red : IX.green)]);
        ctl.addAll([sl('Shift in the process after sample 14', shift, -4 * se, 4 * se, (x) => shift = x), IxButton('New samples', icon: Icons.refresh_rounded, onTap: () => setState(() => seed++))]);
      case 'interp':
        final v = lagrange(at);
        final dt = diffTable;
        title = method == 'lagrange' ? 'Lagrange’s curve through the points' : 'Newton’s forward difference formula';
        formula = method == 'lagrange' ? 'y = Σ yᵢ Π (x − xⱼ)/(xᵢ − xⱼ)' : 'y = y₀ + uΔy₀ + u(u − 1)/2! Δ²y₀ + …';
        ro.addAll([Readout('x', fmt(at, 2), '', IX.ink), Readout('Interpolated y', fmt(v, 3), '', IX.positive), Readout('u = (x − x₀)/h', fmt((at - xs.first) / (xs.length > 1 ? xs[1] - xs[0] : 1), 3), '', IX.inkSoft), Readout(at < xs.first || at > xs.last ? 'Extrapolation' : 'Interpolation', at < xs.first || at > xs.last ? 'outside the data' : 'inside the data', '', at < xs.first || at > xs.last ? MX.red : IX.green), if (dt.length > 1) Readout('Last difference', fmt(dt.last.first, 2), '', IX.accent)]);
        ctl.add(sl('x', at, xs.first - (xs.last - xs.first) * 0.3, xs.last + (xs.last - xs.first) * 0.3, (x) => at = x, div: 160));
        for (var i = 0; i < ys.length; i++) {
          final span = (ys.reduce(math.max) - ys.reduce(math.min)).abs() + 10;
          ctl.add(sl('y at x = ${fmtT(xs[i])}', ys[i], ys[i] - span / 2, ys[i] + span / 2, (x) => ys = [...ys]..[i] = x.roundToDouble(), d: 0, div: span.round()));
        }
      default:
        final st = _Stats(data);
        title = mode == 'regression' ? 'Two regression lines' : mode == 'points' ? 'Drag the points, watch Pearson’s r' : 'Scatter diagrams';
        formula = mode == 'regression' ? 'both lines pass through (x̄, ȳ)' : 'r = Σdx·dy / √(Σdx² · Σdy²)';
        ro.addAll([
          Readout('Pearson’s r', fmt(st.r, 3), '', IX.positive),
          if (mode == 'points') Readout('Cov(x, y)', fmt(st.sxy / st.n, 3), '', IX.ink),
          if (mode == 'points') Readout('σₓ, σᵧ', '${fmt(math.sqrt(st.sxx / st.n), 2)}, ${fmt(math.sqrt(st.syy / st.n), 2)}', '', IX.inkSoft),
          if (mode == 'regression') Readout('b_yx', fmt(st.byx, 3), '', IX.accent),
          if (mode == 'regression') Readout('b_xy', fmt(st.bxy, 3), '', IX.green),
          if (mode == 'regression') Readout('b_yx × b_xy = r²', fmt(st.byx * st.bxy, 3), '', IX.inkSoft),
          if (mode == 'scatter') Readout('r² (variation explained)', fmt(st.r * st.r, 3), '', IX.inkSoft),
        ]);
        if (mode == 'scatter') {
          ctl.addAll([
            sl('Correlation set', rho, -1, 1, (x) => rho = x),
            IxToggle(label: 'Curved relation', value: curve, onChanged: (v) => setState(() => curve = v)),
            IxToggle(label: 'Show the regression lines', value: lines, onChanged: (v) => setState(() => lines = v)),
            IxButton('New sample', icon: Icons.refresh_rounded, onTap: () => setState(() => seed++)),
          ]);
        } else {
          ctl.add(Text('Drag the points.', style: IX.text(18, c: IX.inkSoft)));
        }
    }
    return InstrumentFrame(
      id: 'maths-scatter',
      subtitle: tx(widget.preset['subtitle']) ?? (mode == 'timeseries' ? '$kStats · Time series' : mode == 'control' ? '$kStats · Statistical quality control' : mode == 'interp' ? '$kStats · Interpolation' : '$kStats · Correlation and regression'),
      title: tx(widget.preset['title']) ?? title,
      formula: formula,
      state: {'mode': mode, 'rho': rho, 'points': [for (final q in pts) [q.dx, q.dy]]},
      readouts: ro,
      controls: ctl,
      presets: [for (final (i, e) in _presets.entries.indexed) Preset(e.key, () => setState(() { _apply(e.value); active = i; }))],
      activePreset: active,
      stage: LayoutBuilder(builder: (context, box) {
        final size = box.biggest;
        final pl = _ScPainter.plane(this, size);
        return GestureDetector(
          onPanStart: (d) {
            _drag = -1;
            if (mode != 'points' && mode != 'regression') return;
            for (final (i, q) in pts.indexed) {
              if ((pl.p(q.dx, q.dy) - d.localPosition).distance < 44) _drag = i;
            }
          },
          onPanUpdate: (d) {
            if (_drag < 0) return;
            final w = pl.w(d.localPosition);
            setState(() {
              pts = [...pts]..[_drag] = Offset((w.dx * 2).round() / 2, (w.dy * 2).round() / 2);
              active = null;
            });
          },
          onPanEnd: (_) => _drag = -1,
          child: CustomPaint(size: size, painter: _ScPainter(this, pl)),
        );
      }),
    );
  }
}

class _ScPainter extends CustomPainter {
  _ScPainter(this.s, this.pl);
  final _ScatterState s;
  final Plane pl;

  static Plane plane(_ScatterState s, Size size) {
    final rect = Rect.fromLTRB(100, 50, size.width - 50, size.height - 70);
    switch (s.mode) {
      case 'points':
      case 'regression':
        final xsv = s.pts.map((q) => q.dx), ysv = s.pts.map((q) => q.dy);
        final hx = xsv.isEmpty ? 10.0 : xsv.reduce(math.max), hy = ysv.isEmpty ? 10.0 : ysv.reduce(math.max);
        return Plane(rect, 0, (hx * 1.3).ceilToDouble(), 0, (hy * 1.3).ceilToDouble());
      case 'estimate':
        return Plane(rect, 0, 80, 0, 80);
      case 'interp':
        final lo = s.xs.first, hi = s.xs.last, sp = hi - lo;
        final ylo = s.ys.reduce(math.min), yhi = s.ys.reduce(math.max), ysp = (yhi - ylo).abs() + 1;
        return Plane(Rect.fromLTRB(100, 50, size.width * 0.62, size.height - 70), lo - sp * 0.35, hi + sp * 0.35, math.min(0, ylo - ysp * 0.3), yhi + ysp * 0.3);
      default:
        return Plane(rect, 10, 90, 10, 90);
    }
  }

  @override
  void paint(Canvas c, Size size) {
    switch (s.mode) {
      case 'rank':
        _rank(c, size);
        return;
      case 'timeseries':
        _series(c, size);
        return;
      case 'control':
        _control(c, size);
        return;
      case 'interp':
        _interp(c, size);
        return;
      case 'estimate':
        _estimate(c, size);
        return;
    }
    final d = s.data;
    final st = _Stats(d);
    pl.paintGrid(c, yTicks: s.mode != 'scatter', xTick: s.mode == 'scatter' ? (_) => '' : null);
    if (s.mode == 'points') {
      final o = pl.p(st.mx, st.my);
      c.drawRect(Rect.fromLTRB(o.dx, pl.rect.top, pl.rect.right, o.dy), Paint()..color = IX.green.withValues(alpha: 0.07));
      c.drawRect(Rect.fromLTRB(pl.rect.left, o.dy, o.dx, pl.rect.bottom), Paint()..color = IX.green.withValues(alpha: 0.07));
      c.drawRect(Rect.fromLTRB(pl.rect.left, pl.rect.top, o.dx, o.dy), Paint()..color = MX.red.withValues(alpha: 0.06));
      c.drawRect(Rect.fromLTRB(o.dx, o.dy, pl.rect.right, pl.rect.bottom), Paint()..color = MX.red.withValues(alpha: 0.06));
    }
    if (s.mode != 'scatter' || s.lines) {
      IxPaint.dashed(c, Offset(pl.sx(st.mx), pl.rect.top), Offset(pl.sx(st.mx), pl.rect.bottom), MPaint.stroke(IX.steel, 1.6), dash: 7, gap: 6);
      IxPaint.dashed(c, Offset(pl.rect.left, pl.sy(st.my)), Offset(pl.rect.right, pl.sy(st.my)), MPaint.stroke(IX.steel, 1.6), dash: 7, gap: 6);
    }
    if ((s.mode == 'regression' || (s.mode == 'scatter' && s.lines)) && st.r.isFinite) {
      c.save();
      c.clipRect(pl.rect);
      c.drawLine(pl.p(pl.xa, st.my + st.byx * (pl.xa - st.mx)), pl.p(pl.xb, st.my + st.byx * (pl.xb - st.mx)), MPaint.stroke(IX.accent, 3.5));
      if (st.bxy.abs() > 1e-9) c.drawLine(pl.p(st.mx + st.bxy * (pl.ya - st.my), pl.ya), pl.p(st.mx + st.bxy * (pl.yb - st.my), pl.yb), MPaint.stroke(IX.green, 3.5));
      if (s.mode == 'regression') {
        for (final q in d) {
          final yh = st.my + st.byx * (q.dx - st.mx);
          c.drawLine(pl.p(q.dx, q.dy), pl.p(q.dx, yh), MPaint.stroke(IX.accent.withValues(alpha: 0.5), 2));
        }
      }
      c.restore();
      MPaint.legend(c, Offset(pl.rect.left + 16, pl.rect.top + 6), [(IX.accent, 'Y on X: y − ȳ = b_yx (x − x̄)'), (IX.green, 'X on Y: x − x̄ = b_xy (y − ȳ)')], size: 17);
    }
    for (final q in d) {
      final hd = (q.dx - st.mx) * (q.dy - st.my);
      final col = s.mode == 'points' ? (hd >= 0 ? IX.green : MX.red) : IX.ink;
      if (s.mode == 'scatter') {
        MPaint.dot(c, pl.p(q.dx, q.dy), IX.ink.withValues(alpha: 0.75), r: 6);
      } else {
        IxPaint.handle(c, pl.p(q.dx, q.dy), col, r: 12);
      }
    }
    if (s.mode != 'regression') IxPaint.label(c, 'r = ${fmt(st.r, 2)}', Offset(pl.rect.right - 10, pl.rect.top + 10), size: 28, color: IX.positive, w: FontWeight.w700, align: Alignment.topRight, halo: true);
  }

  void _estimate(Canvas c, Size size) {
    pl.paintGrid(c);
    final byx = s.r * s.sy / s.sx, bxy = s.r * s.sx / s.sy;
    c.save();
    c.clipRect(pl.rect);
    c.drawLine(pl.p(0, s.my - byx * s.mx), pl.p(80, s.my + byx * (80 - s.mx)), MPaint.stroke(IX.accent, 3.5));
    if (bxy.abs() > 1e-9) c.drawLine(pl.p(s.mx - bxy * s.my, 0), pl.p(s.mx + bxy * (80 - s.my), 80), MPaint.stroke(IX.green, 3.5));
    c.restore();
    MPaint.dot(c, pl.p(s.mx, s.my), IX.ink, r: 8);
    IxPaint.label(c, '(x̄, ȳ) = (${fmtT(s.mx)}, ${fmtT(s.my)})', pl.p(s.mx, s.my) + const Offset(16, 22), size: 18, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
    final yh = s.my + byx * (s.x0 - s.mx);
    IxPaint.dashed(c, pl.p(s.x0, 0), pl.p(s.x0, yh), MPaint.stroke(IX.positive, 2), dash: 7, gap: 5);
    IxPaint.dashed(c, pl.p(s.x0, yh), pl.p(0, yh), MPaint.stroke(IX.positive, 2), dash: 7, gap: 5);
    IxPaint.handle(c, pl.p(s.x0, yh), IX.positive, r: 12);
    IxPaint.label(c, 'ŷ = ${fmt(yh, 2)}', pl.p(0, yh) + const Offset(12, -16), size: 19, color: IX.positive, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
    MPaint.legend(c, Offset(pl.rect.left + 16, pl.rect.top + 6), [(IX.accent, 'Y on X (for estimating y)'), (IX.green, 'X on Y (for estimating x)')], size: 17);
  }

  void _rank(Canvas c, Size size) {
    final n = s.ranksA.length;
    final xa = size.width * 0.28, xb = size.width * 0.62;
    final top = 110.0, step = (size.height - 200) / (n - 1);
    IxPaint.label(c, 'Judge A', Offset(xa, 60), size: 24, color: IX.accent, w: FontWeight.w700);
    IxPaint.label(c, 'Judge B', Offset(xb, 60), size: 24, color: IX.positive, w: FontWeight.w700);
    for (var r = 1; r <= n; r++) {
      IxPaint.label(c, 'rank $r', Offset(xa - 90, top + (r - 1) * step), size: 17, color: IX.inkSoft, align: Alignment.centerRight);
    }
    for (var i = 0; i < n; i++) {
      final a = Offset(xa, top + (s.ranksA[i] - 1) * step), b = Offset(xb, top + (s.ranksB[i] - 1) * step);
      final col = MX.series[i % MX.series.length];
      c.drawLine(a, b, MPaint.stroke(col.withValues(alpha: 0.7), 3));
      for (final q in [a, b]) {
        c.drawCircle(q, 24, Paint()..color = col);
        IxPaint.label(c, String.fromCharCode(80 + i), q, size: 20, color: Colors.white, w: FontWeight.w700);
      }
      final dd = s.ranksA[i] - s.ranksB[i];
      IxPaint.label(c, 'D = ${dd < 0 ? '−' : ''}${dd.abs()},  D² = ${dd * dd}', Offset(xb + 50, b.dy), size: 18, color: IX.ink, align: Alignment.centerLeft);
    }
  }

  void _series(Canvas c, Size size) {
    final y = s.series;
    final lo = y.reduce(math.min), hi = y.reduce(math.max);
    final p = Plane(Rect.fromLTRB(100, 50, size.width - 50, size.height - 70), -0.6, y.length - 0.4, math.max(0, lo - (hi - lo) * 0.2), hi + (hi - lo) * 0.2);
    p.paintGrid(c, xLabel: 'period t', yLabel: 'value', xStep: 1, xTick: (v) => v.round() % 2 == 0 ? '${v.round() + 1}' : '');
    final path = Path();
    for (var t = 0; t < y.length; t++) {
      final q = p.p(t.toDouble(), y[t]);
      t == 0 ? path.moveTo(q.dx, q.dy) : path.lineTo(q.dx, q.dy);
    }
    c.drawPath(path, MPaint.stroke(IX.steel, 2));
    for (var t = 0; t < y.length; t++) {
      MPaint.dot(c, p.p(t.toDouble(), y[t]), IX.ink, r: 7);
    }
    final tv = s.trendValues;
    final tp = Path();
    var started = false;
    for (var t = 0; t < y.length; t++) {
      final v = tv[t];
      if (v == null) {
        started = false;
        continue;
      }
      final q = p.p(t.toDouble(), v);
      started ? tp.lineTo(q.dx, q.dy) : tp.moveTo(q.dx, q.dy);
      started = true;
    }
    c.drawPath(tp, MPaint.stroke(IX.positive, 4));
    if (s.trend == 'semi') {
      final h = y.length ~/ 2;
      for (final (a, b) in [(0, h), (y.length - h, y.length)]) {
        final m = y.sublist(a, b).reduce((u, v) => u + v) / (b - a);
        MPaint.dot(c, p.p((a + b - 1) / 2, m), IX.accent, r: 10);
      }
    }
    MPaint.legend(c, Offset(p.rect.left + 16, p.rect.top + 6), [(IX.ink, 'data'), (IX.positive, 'trend')], size: 17);
  }

  void _control(Canvas c, Size size) {
    final se = s.chart == 'x' ? s.sigma / math.sqrt(s.nSample) : s.sigma;
    final ucl = s.cl + 3 * se, lcl = s.cl - 3 * se;
    final smp = s.samples;
    final p = Plane(Rect.fromLTRB(100, 50, size.width - 120, size.height - 70), 0.3, 20.7, s.cl - 5 * se, s.cl + 5 * se);
    p.paintGrid(c, xLabel: 'sample', yLabel: s.chart == 'x' ? 'x̄' : 'value', xStep: 1, xTick: (v) => v.round() % 2 == 0 ? '${v.round()}' : '');
    for (final (v, n, col) in [(ucl, 'UCL', MX.red), (s.cl, 'CL', IX.ink), (lcl, 'LCL', MX.red)]) {
      IxPaint.dashed(c, p.p(0.3, v), p.p(20.7, v), MPaint.stroke(col, n == 'CL' ? 2.5 : 2), dash: n == 'CL' ? 1000 : 10, gap: 7);
      IxPaint.label(c, '$n ${fmt(v, 2)}', p.p(20.7, v) + const Offset(10, 0), size: 17, color: col, w: FontWeight.w700, align: Alignment.centerLeft);
    }
    final path = Path();
    for (var i = 0; i < smp.length; i++) {
      final q = p.p(i + 1.0, smp[i]);
      i == 0 ? path.moveTo(q.dx, q.dy) : path.lineTo(q.dx, q.dy);
    }
    c.drawPath(path, MPaint.stroke(IX.accent, 2.5));
    for (var i = 0; i < smp.length; i++) {
      final out = smp[i] > ucl || smp[i] < lcl;
      MPaint.dot(c, p.p(i + 1.0, smp[i]), out ? MX.red : IX.accent, r: out ? 10 : 7);
    }
  }

  void _interp(Canvas c, Size size) {
    pl.paintGrid(c);
    pl.curve(c, s.lagrange, IX.accent, width: 4);
    for (var i = 0; i < s.xs.length; i++) {
      MPaint.dot(c, pl.p(s.xs[i], s.ys[i]), IX.ink, r: 9);
      IxPaint.label(c, '(${fmtT(s.xs[i])}, ${fmtT(s.ys[i])})', pl.p(s.xs[i], s.ys[i]) + const Offset(12, -18), size: 17, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
    }
    final v = s.lagrange(s.at);
    final outside = s.at < s.xs.first || s.at > s.xs.last;
    if (pl.contains(s.at, v)) {
      IxPaint.dashed(c, pl.p(s.at, 0), pl.p(s.at, v), MPaint.stroke(outside ? MX.red : IX.positive, 2), dash: 6, gap: 5);
      IxPaint.handle(c, pl.p(s.at, v), outside ? MX.red : IX.positive, r: 12);
    }
    // Difference table.
    final dt = s.diffTable;
    final x0 = size.width * 0.66, top = 70.0;
    final cw = (size.width - x0 - 30) / (dt.length + 1), rh = math.min(48.0, (size.height - 140) / (s.xs.length * 2));
    final hdr = ['x', 'y', for (var k = 1; k < dt.length; k++) 'Δ${k == 1 ? '' : superscript(k)}y'];
    for (var j = 0; j < hdr.length; j++) {
      IxPaint.label(c, hdr[j], Offset(x0 + cw * (j + 0.5), top), size: 19, color: IX.inkSoft, w: FontWeight.w700);
    }
    for (var i = 0; i < s.xs.length; i++) {
      IxPaint.label(c, fmtT(s.xs[i]), Offset(x0 + cw * 0.5, top + 40 + i * 2 * rh), size: 18, color: IX.ink, w: FontWeight.w600);
    }
    for (var k = 0; k < dt.length; k++) {
      for (var i = 0; i < dt[k].length; i++) {
        IxPaint.label(c, fmtT(dt[k][i], 2), Offset(x0 + cw * (k + 1.5), top + 40 + (i * 2 + k) * rh), size: 18, color: i == 0 ? IX.positive : IX.ink, w: i == 0 ? FontWeight.w700 : FontWeight.w500);
      }
    }
    IxPaint.label(c, 'Leading differences (Newton) in orange', Offset(x0, size.height - 40), size: 16, color: IX.inkSoft, align: Alignment.centerLeft);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
