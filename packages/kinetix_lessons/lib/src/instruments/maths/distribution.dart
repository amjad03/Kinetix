import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'common.dart';

double lnGamma(double x) {
  // Lanczos approximation (g = 7).
  const g = 7.0;
  const cf = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return math.log(math.pi / math.sin(math.pi * x)) - lnGamma(1 - x);
  x -= 1;
  var a = cf[0];
  final t = x + g + 0.5;
  for (var i = 1; i < 9; i++) {
    a += cf[i] / (x + i);
  }
  return 0.5 * math.log(2 * math.pi) + (x + 0.5) * math.log(t) - t + math.log(a);
}

double normPdf(double x, [double mu = 0, double sd = 1]) => math.exp(-0.5 * math.pow((x - mu) / sd, 2)) / (sd * math.sqrt(2 * math.pi));

double normCdf(double z) {
  // Abramowitz and Stegun 26.2.17, error below 7.5e-8.
  final t = 1 / (1 + 0.2316419 * z.abs());
  final d = normPdf(z);
  final p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

/// Continuous and discrete distributions: binomial, Poisson, hypergeometric, a discrete random
/// variable of your own, the normal curve with its areas, Student's t, χ², F, the operating
/// characteristic curve of a sampling plan, and shape families for skewness and kurtosis.
/// Shaded areas, critical regions and test statistics are marked on the curve.
///
/// Preset: {"dist": "binomial"|"poisson"|"hyper"|"discrete"|"normal"|"t"|"chi2"|"f"|"oc"|"lognormal"|"gnormal",
/// "n": 10, "p": 0.5, "lambda": 3, "N": 20, "K": 7, "mu": 0, "sigma": 1, "df": 5, "df2": 10, "c": 2,
/// "values": [0,1,2,3], "probs": [0.1,0.3,0.4,0.2], "from": -1, "to": 1, "tail": "two"|"right"|"left",
/// "alpha": 0.05, "stat": 2.1, "compare": true, "shape": 2, "s": 0.4}.
class DistributionInstrument extends StatefulWidget {
  const DistributionInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<DistributionInstrument> createState() => _DistState();
}

class _DistState extends State<DistributionInstrument> {
  String dist = 'binomial', tail = 'none';
  int n = 10, N = 20, K = 7, df = 5, df2 = 10, c = 2;
  double p = 0.5, lambda = 3, mu = 0, sigma = 1, alpha = 0.05, shape = 2, sk = 0.4;
  double? from, to, stat;
  bool compare = false;
  List<double> values = [0, 1, 2, 3], probs = [0.1, 0.3, 0.4, 0.2];
  int? active;

  static final _presets = <String, Map<String, dynamic>>{
    'Binomial': {'dist': 'binomial', 'n': 10, 'p': 0.3},
    'Poisson': {'dist': 'poisson', 'lambda': 3, 'compare': true, 'n': 30},
    'Normal area': {'dist': 'normal', 'mu': 0, 'sigma': 1, 'from': -1, 'to': 1},
    'Z test': {'dist': 'normal', 'tail': 'two', 'alpha': 0.05, 'stat': 2.1},
    'Student’s t': {'dist': 't', 'df': 4, 'compare': true},
    'χ²': {'dist': 'chi2', 'df': 4, 'tail': 'right', 'alpha': 0.05},
  };

  @override
  void initState() {
    super.initState();
    _apply(widget.preset.isEmpty ? _presets['Binomial']! : widget.preset);
    if (widget.preset.isEmpty) active = 0;
  }

  void _apply(Map<String, dynamic> m) {
    dist = ps(m, 'dist', 'binomial');
    n = pint(m, 'n', 10);
    p = pd(m, 'p', 0.5);
    lambda = pd(m, 'lambda', 3);
    N = pint(m, 'N', 20);
    K = pint(m, 'K', 7);
    mu = pd(m, 'mu', 0);
    sigma = pd(m, 'sigma', 1);
    df = pint(m, 'df', 5);
    df2 = pint(m, 'df2', 10);
    c = pint(m, 'c', 2);
    from = m['from'] == null ? null : pd(m, 'from', 0);
    to = m['to'] == null ? null : pd(m, 'to', 0);
    tail = ps(m, 'tail', 'none');
    alpha = pd(m, 'alpha', 0.05);
    stat = m['stat'] == null ? null : pd(m, 'stat', 0);
    compare = pb(m, 'compare', false);
    values = pl(m, 'values', [0, 1, 2, 3]);
    probs = pl(m, 'probs', [0.1, 0.3, 0.4, 0.2]);
    shape = pd(m, 'shape', 2);
    sk = pd(m, 's', 0.4);
  }

  bool get discrete => const {'binomial', 'poisson', 'hyper', 'discrete'}.contains(dist);

  double pmf(int k) => switch (dist) {
    'poisson' => k < 0 ? 0 : math.exp(-lambda + k * math.log(lambda) - lnGamma(k + 1.0)),
    'hyper' => nCr(K, k) * nCr(N - K, n - k) / nCr(N, n),
    'discrete' => () {
      final i = values.indexWhere((v) => v.round() == k);
      return i < 0 ? 0.0 : probs[i];
    }(),
    _ => nCr(n, k) * math.pow(p, k) * math.pow(1 - p, n - k),
  };

  (int, int) get support => switch (dist) {
    'poisson' => (0, math.max(10, (lambda + 4 * math.sqrt(lambda) + 2).ceil())),
    'hyper' => (math.max(0, n - (N - K)), math.min(n, K)),
    'discrete' => (values.reduce(math.min).round(), values.reduce(math.max).round()),
    _ => (0, n),
  };

  double gnScale(double s) => math.exp(0.5 * (lnGamma(1 / s) - lnGamma(3 / s))); // unit variance

  double pdf(double x) => switch (dist) {
    't' => math.exp(lnGamma((df + 1) / 2) - lnGamma(df / 2)) / math.sqrt(df * math.pi) * math.pow(1 + x * x / df, -(df + 1) / 2),
    'chi2' => x <= 0 ? 0 : math.exp((df / 2 - 1) * math.log(x) - x / 2 - (df / 2) * math.ln2 - lnGamma(df / 2)),
    'f' => x <= 0 ? 0 : math.exp(0.5 * (df * math.log(df * x) + df2 * math.log(df2.toDouble()) - (df + df2) * math.log(df * x + df2)) - math.log(x) - (lnGamma(df / 2) + lnGamma(df2 / 2) - lnGamma((df + df2) / 2))),
    'lognormal' => x <= 0 ? 0 : math.exp(-math.pow(math.log(x), 2) / (2 * sk * sk)) / (x * sk * math.sqrt(2 * math.pi)),
    'gnormal' => () {
      final a = gnScale(shape);
      return shape / (2 * a * math.exp(lnGamma(1 / shape))) * math.exp(-math.pow(x.abs() / a, shape));
    }(),
    _ => normPdf(x, mu, sigma),
  };

  (double, double) get xRange => switch (dist) {
    't' => (-5, 5),
    'chi2' => (0, math.max(12, df + 5 * math.sqrt(2 * df))),
    'f' => (0, 5),
    'lognormal' => (0, 4),
    'gnormal' => (-4, 4),
    'oc' => (0, 1),
    _ => (mu - 4 * sigma, mu + 4 * sigma),
  };

  double cdf(double x) {
    if (dist == 'normal') return normCdf((x - mu) / sigma);
    final (lo, _) = xRange;
    final a = dist == 't' || dist == 'gnormal' ? -40.0 : lo;
    if (x <= a) return 0;
    const m = 2000;
    final h = (x - a) / m;
    var s = pdf(a) + pdf(x);
    for (var i = 1; i < m; i++) {
      s += pdf(a + i * h) * (i.isOdd ? 4 : 2);
    }
    return (s * h / 3).clamp(0.0, 1.0);
  }

  double quantile(double q) {
    var lo = dist == 't' || dist == 'normal' || dist == 'gnormal' ? -50.0 : 0.0, hi = 200.0;
    if (dist == 'normal') {
      lo = mu - 10 * sigma;
      hi = mu + 10 * sigma;
    }
    for (var i = 0; i < 80; i++) {
      final m = (lo + hi) / 2;
      if (cdf(m) < q) {
        lo = m;
      } else {
        hi = m;
      }
    }
    return (lo + hi) / 2;
  }

  double oc(double pp) => [for (var k = 0; k <= c; k++) nCr(n, k) * math.pow(pp, k) * math.pow(1 - pp, n - k)].fold(0.0, (a, b) => a + b);

  ({double mean, double variance}) get moments {
    switch (dist) {
      case 'poisson':
        return (mean: lambda, variance: lambda);
      case 'hyper':
        return (mean: n * K / N, variance: n * K / N * (1 - K / N) * (N - n) / (N - 1));
      case 'discrete':
        final m = [for (var i = 0; i < values.length; i++) values[i] * probs[i]].fold(0.0, (a, b) => a + b);
        final v = [for (var i = 0; i < values.length; i++) values[i] * values[i] * probs[i]].fold(0.0, (a, b) => a + b) - m * m;
        return (mean: m, variance: v);
      case 't':
        return (mean: 0, variance: df > 2 ? df / (df - 2) : double.infinity);
      case 'chi2':
        return (mean: df.toDouble(), variance: 2.0 * df);
      case 'f':
        return (mean: df2 > 2 ? df2 / (df2 - 2) : double.nan, variance: df2 > 4 ? 2 * df2 * df2 * (df + df2 - 2) / (df * math.pow(df2 - 2, 2) * (df2 - 4)) : double.nan);
      case 'lognormal':
        return (mean: math.exp(sk * sk / 2), variance: (math.exp(sk * sk) - 1) * math.exp(sk * sk));
      case 'gnormal':
        return (mean: 0, variance: 1);
      case 'normal':
        return (mean: mu, variance: sigma * sigma);
      default:
        return (mean: n * p, variance: n * p * (1 - p));
    }
  }

  String get name => const {'binomial': 'Binomial distribution', 'poisson': 'Poisson distribution', 'hyper': 'Hypergeometric distribution', 'discrete': 'A discrete random variable', 'normal': 'The normal curve', 't': 'Student’s t distribution', 'chi2': 'The χ² distribution', 'f': 'The F distribution', 'oc': 'Operating characteristic curve', 'lognormal': 'Mean, median and mode pull apart', 'gnormal': 'Peaked or flat?'}[dist]!;

  String get formulaText => switch (dist) {
    'poisson' => 'P(X = x) = e^(−λ) λˣ / x!',
    'hyper' => 'P(X = x) = ᴷCₓ · ᴺ⁻ᴷCₙ₋ₓ / ᴺCₙ',
    'discrete' => 'E(X) = Σ x p(x)',
    'normal' => 'Z = (X − μ)/σ',
    't' => 't with ν = $df degrees of freedom',
    'chi2' => 'χ² with ν = $df degrees of freedom',
    'f' => 'F(ν₁ = $df, ν₂ = $df2)',
    'oc' => 'Pₐ = P(at most c defectives in n)',
    'lognormal' => 'Karl Pearson’s Sk = (mean − mode)/σ',
    'gnormal' => 'β₂ = μ₄/μ₂²',
    _ => 'P(X = x) = ⁿCₓ pˣ (1 − p)ⁿ⁻ˣ',
  };

  @override
  Widget build(BuildContext context) {
    final mo = moments;
    final ro = <Readout>[];
    final ctl = <Widget>[];
    Widget sl(String l, num v, num lo, num hi, ValueChanged<double> on, {int d = 0, int? div}) => IxSlider(label: l, value: v.toDouble().clamp(lo.toDouble(), hi.toDouble()), min: lo.toDouble(), max: hi.toDouble(), divisions: div ?? (hi - lo).round(), format: (x) => fmt(x, d), onChanged: (x) => setState(() { on(x); active = null; }));
    switch (dist) {
      case 'oc':
        ro.addAll([Readout('Sample size n', '$n', '', IX.ink), Readout('Acceptance number c', '$c', '', IX.accent), Readout('Pₐ at p = ${fmtT(p, 3)}', fmt(oc(p), 3), '', IX.positive), Readout('Producer’s risk at p', fmt(1 - oc(p), 3), '', IX.inkSoft)]);
        ctl.addAll([sl('n', n, 5, 100, (x) => n = x.round()), sl('c', c, 0, 10, (x) => c = x.round()), sl('Lot fraction defective p', p, 0, 0.5, (x) => p = x, d: 3, div: 100)]);
      case 'lognormal':
        final mean = math.exp(sk * sk / 2), med = 1.0, mode = math.exp(-sk * sk), sd = math.sqrt(mo.variance);
        final q1 = math.exp(-0.6744898 * sk), q3 = math.exp(0.6744898 * sk);
        ro.addAll([Readout('Mean', fmt(mean, 3), '', IX.positive), Readout('Median', fmt(med, 3), '', IX.accent), Readout('Mode', fmt(mode, 3), '', IX.green), Readout('Karl Pearson’s Sk', fmt((mean - mode) / sd, 3), '', IX.ink), Readout('Bowley’s Sk', fmt((q3 + q1 - 2 * med) / (q3 - q1), 3), '', IX.inkSoft)]);
        ctl.add(sl('Skewness', sk, 0.05, 0.6, (x) => sk = x, d: 2, div: 55));
      case 'gnormal':
        final b2 = math.exp(lnGamma(5 / shape) + lnGamma(1 / shape) - 2 * lnGamma(3 / shape));
        ro.addAll([Readout('β₂ = μ₄/μ₂²', fmt(b2, 3), '', IX.positive), Readout('γ₂ = β₂ − 3', fmt(b2 - 3, 3), '', IX.accent), Readout('Shape', (b2 - 3).abs() < 0.02 ? 'mesokurtic' : b2 > 3 ? 'leptokurtic' : 'platykurtic', '', IX.ink), Readout('Height of the peak', fmt(pdf(0), 3), '', IX.inkSoft)]);
        ctl.add(sl('Shape p (2 = normal)', shape, 1, 8, (x) => shape = x, d: 1, div: 70));
      default:
        ro.addAll([Readout('Mean', fmt(mo.mean, 3), '', IX.accent), Readout('Variance', fmt(mo.variance, 3), '', IX.green), Readout('Standard deviation', fmt(math.sqrt(mo.variance), 3), '', IX.inkSoft)]);
        if (discrete && from != null) {
          final a = from!.round(), b = (to ?? from!).round();
          ro.add(Readout('P(${a == b ? 'X = $a' : '$a ≤ X ≤ $b'})', fmt([for (var k = a; k <= b; k++) pmf(k)].fold(0.0, (x, y) => x + y), 4), '', IX.positive));
        } else if (!discrete && from != null) {
          ro.add(Readout('P(${fmtT(from!)} < X < ${fmtT(to ?? xRange.$2)})', fmt(cdf(to ?? xRange.$2) - cdf(from!), 4), '', IX.positive));
        }
        if (tail != 'none' && !discrete) {
          final (l, r) = crit;
          ro.add(Readout('Critical value${tail == 'two' ? 's' : ''}', tail == 'two' ? '±${fmt(r!, 3)}' : fmt((tail == 'left' ? l : r)!, 3), '', MX.red));
          if (stat != null) {
            final rej = (tail == 'right' && stat! > r!) || (tail == 'left' && stat! < l!) || (tail == 'two' && (stat! > r! || stat! < l!));
            ro.add(Readout('Statistic ${fmt(stat!, 3)}', rej ? 'Reject H₀' : 'Do not reject H₀', '', rej ? MX.red : IX.green));
          }
        }
        switch (dist) {
          case 'binomial':
            ctl.addAll([sl('n', n, 1, 40, (x) => n = x.round()), sl('p', p, 0.01, 0.99, (x) => p = x, d: 2, div: 98)]);
            if (compare) ctl.add(IxToggle(label: 'Compare with Poisson λ = np', value: compare, onChanged: (v) => setState(() => compare = v)));
          case 'poisson':
            ctl.addAll([sl('λ', lambda, 0.2, 12, (x) => lambda = x, d: 1, div: 59), IxToggle(label: 'Compare with binomial (n, λ/n)', value: compare, onChanged: (v) => setState(() => compare = v)), if (compare) sl('n for the binomial', n, 5, 200, (x) => n = x.round(), div: 195)]);
          case 'hyper':
            ctl.addAll([sl('Population N', N, 5, 40, (x) { N = x.round(); K = math.min(K, N); n = math.min(n, N); }), sl('Successes K in it', K, 1, N, (x) => K = x.round()), sl('Sample n', n, 1, N, (x) => n = x.round()), IxToggle(label: 'Compare with binomial (with replacement)', value: compare, onChanged: (v) => setState(() => compare = v))]);
          case 'discrete':
            for (var i = 0; i < probs.length; i++) {
              ctl.add(sl('p(${fmtT(values[i])})', probs[i], 0, 1, (x) {
                final rest = [for (var j = 0; j < probs.length; j++) if (j != i) probs[j]].fold(0.0, (a, b) => a + b);
                final sc = rest == 0 ? 0.0 : (1 - x) / rest;
                probs = [for (var j = 0; j < probs.length; j++) j == i ? x : probs[j] * sc];
              }, d: 2, div: 100));
            }
          case 'normal':
            ctl.addAll([
              sl('μ', mu, -3, 3, (x) => mu = x, d: 1, div: 12),
              sl('σ', sigma, 0.5, 2.5, (x) => sigma = x, d: 2, div: 20),
              if (from != null) sl('From', from!, mu - 4 * sigma, mu + 4 * sigma, (x) => from = x, d: 2, div: 160),
              if (to != null) sl('To', to!, mu - 4 * sigma, mu + 4 * sigma, (x) => to = x, d: 2, div: 160),
              if (stat != null) sl('Test statistic', stat!, -4, 4, (x) => stat = x, d: 2, div: 160),
              if (tail != 'none') IxSegments<double>(label: 'Level α', options: {0.01: '1%', 0.05: '5%', 0.10: '10%'}, value: alpha, onChanged: (v) => setState(() => alpha = v)),
            ]);
          case 't' || 'chi2':
            ctl.addAll([
              sl('Degrees of freedom ν', df, 1, 30, (x) => df = x.round()),
              if (dist == 't') IxToggle(label: 'Compare with the normal curve', value: compare, onChanged: (v) => setState(() => compare = v)),
              if (stat != null) sl('Test statistic', stat!, dist == 't' ? -5 : 0, dist == 't' ? 5 : xRange.$2, (x) => stat = x, d: 2, div: 200),
              if (tail != 'none') IxSegments<double>(label: 'Level α', options: {0.01: '1%', 0.05: '5%', 0.10: '10%'}, value: alpha, onChanged: (v) => setState(() => alpha = v)),
            ]);
          case 'f':
            ctl.addAll([sl('ν₁', df, 1, 30, (x) => df = x.round()), sl('ν₂', df2, 1, 40, (x) => df2 = x.round()), if (stat != null) sl('F statistic', stat!, 0, 5, (x) => stat = x, d: 2, div: 100)]);
        }
    }
    return InstrumentFrame(
      id: 'maths-distribution',
      subtitle: tx(widget.preset['subtitle']) ?? '$kStats · Distributions',
      title: tx(widget.preset['title']) ?? name,
      formula: formulaText,
      state: {'dist': dist, 'n': n, 'p': p, 'lambda': lambda, 'mu': mu, 'sigma': sigma, 'df': df},
      readouts: ro,
      controls: ctl,
      presets: [for (final (i, e) in _presets.entries.indexed) Preset(e.key, () => setState(() { _apply(e.value); active = i; }))],
      activePreset: active,
      stage: CustomPaint(painter: _DistPainter(this), size: Size.infinite),
    );
  }

  (double?, double?) get crit => switch (tail) {
    'right' => (null, quantile(1 - alpha)),
    'left' => (quantile(alpha), null),
    'two' => (quantile(alpha / 2), quantile(1 - alpha / 2)),
    _ => (null, null),
  };
}

class _DistPainter extends CustomPainter {
  _DistPainter(this.s);
  final _DistState s;

  @override
  void paint(Canvas c, Size size) {
    final rect = Rect.fromLTRB(100, 50, size.width - 50, size.height - 70);
    if (s.dist == 'oc') {
      final pl = Plane(rect, 0, 0.5, 0, 1.05);
      pl.paintGrid(c, xLabel: 'p', yLabel: 'Pₐ', yStep: 0.25);
      pl.curve(c, s.oc, IX.accent, width: 4.5);
      MPaint.dot(c, pl.p(s.p, s.oc(s.p)), IX.positive, r: 10);
      IxPaint.label(c, 'Pₐ = ${fmt(s.oc(s.p), 3)}', pl.p(s.p, s.oc(s.p)) + const Offset(16, -18), size: 20, color: IX.positive, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
      IxPaint.label(c, 'Plan: inspect n = ${s.n}, accept the lot if at most c = ${s.c} are defective', Offset(rect.left + 16, rect.top + 10), size: 20, color: IX.ink, w: FontWeight.w600, align: Alignment.topLeft, halo: true);
      return;
    }
    if (s.discrete) {
      final (lo, hi) = s.support;
      final ps0 = [for (var k = lo; k <= hi; k++) s.pmf(k)];
      var top = ps0.reduce(math.max);
      List<double>? cmp;
      if (s.compare) {
        if (s.dist == 'poisson') {
          final pp = s.lambda / s.n;
          cmp = [for (var k = lo; k <= hi; k++) nCr(s.n, k) * math.pow(pp, k) * math.pow(1 - pp, s.n - k)];
        } else if (s.dist == 'binomial') {
          final lam = s.n * s.p;
          cmp = [for (var k = lo; k <= hi; k++) math.exp(-lam + k * math.log(lam) - lnGamma(k + 1.0))];
        } else if (s.dist == 'hyper') {
          final pp = s.K / s.N;
          cmp = [for (var k = lo; k <= hi; k++) nCr(s.n, k) * math.pow(pp, k) * math.pow(1 - pp, s.n - k)];
        }
        if (cmp != null) top = math.max(top, cmp.reduce(math.max));
      }
      final pl = Plane(rect, lo - 0.7, hi + 0.7, 0, top * 1.2 + 1e-9);
      pl.paintGrid(c, xLabel: 'x', yLabel: 'P(X = x)', xStep: niceStep((hi - lo + 1).toDouble(), 16).clamp(1, 100).toDouble());
      final bw = math.min(pl.ux * 0.7, 80.0);
      final mean = s.moments.mean;
      for (var k = lo; k <= hi; k++) {
        final v = ps0[k - lo];
        final inSh = s.from != null && k >= s.from!.round() && k <= (s.to ?? s.from!).round();
        final off = cmp == null ? 0.0 : -bw * 0.22;
        final r = Rect.fromLTRB(pl.sx(k.toDouble()) - bw / 2 + off, pl.sy(v), pl.sx(k.toDouble()) + bw / 2 + off - (cmp == null ? 0 : bw * 0.44), pl.sy(0));
        c.drawRRect(RRect.fromRectAndCorners(r, topLeft: const Radius.circular(5), topRight: const Radius.circular(5)), Paint()..color = (inSh ? IX.positive : IX.accent).withValues(alpha: 0.8));
        if (cmp != null) {
          final v2 = cmp[k - lo];
          final r2 = Rect.fromLTRB(r.right + 2, pl.sy(v2), r.right + 2 + bw * 0.5, pl.sy(0));
          c.drawRRect(RRect.fromRectAndCorners(r2, topLeft: const Radius.circular(5), topRight: const Radius.circular(5)), Paint()..color = IX.green.withValues(alpha: 0.7));
        }
        if (hi - lo <= 16 && v > top * 0.04) IxPaint.label(c, fmt(v, 3), Offset(pl.sx(k.toDouble()), r.top - 8), size: hi - lo > 10 ? 13 : 16, color: IX.inkSoft, align: Alignment.bottomCenter);
      }
      IxPaint.dashed(c, Offset(pl.sx(mean), pl.rect.top + 30), Offset(pl.sx(mean), pl.rect.bottom), MPaint.stroke(IX.ink, 2), dash: 8, gap: 6);
      IxPaint.label(c, 'mean ${fmt(mean, 2)}', Offset(pl.sx(mean), pl.rect.top + 22), size: 18, color: IX.ink, w: FontWeight.w700, align: Alignment.bottomCenter, halo: true);
      if (s.dist == 'discrete') {
        // The fulcrum: E(X) is the balance point.
        final f = Path()..moveTo(pl.sx(mean), pl.rect.bottom + 4)..lineTo(pl.sx(mean) - 14, pl.rect.bottom + 28)..lineTo(pl.sx(mean) + 14, pl.rect.bottom + 28)..close();
        c.drawPath(f, Paint()..color = IX.positive);
      }
      if (cmp != null) MPaint.legend(c, Offset(pl.rect.right - 330, pl.rect.top + 6), [(IX.accent, s.dist == 'poisson' ? 'Poisson λ = ${fmtT(s.lambda)}' : s.dist == 'hyper' ? 'hypergeometric' : 'binomial'), (IX.green, s.dist == 'binomial' ? 'Poisson λ = np' : 'binomial')], size: 17);
      return;
    }
    final (x0, x1) = s.xRange;
    var top = 0.0;
    for (var i = 0; i <= 300; i++) {
      final v = s.pdf(x0 + (x1 - x0) * i / 300);
      if (v.isFinite) top = math.max(top, v);
    }
    if (s.compare && s.dist == 't') top = math.max(top, normPdf(0));
    top = math.min(top, 3.0);
    final pl = Plane(rect, x0, x1, 0, top * 1.18);
    pl.paintGrid(c, xLabel: s.dist == 'normal' ? 'x' : s.dist == 'chi2' ? 'χ²' : s.dist == 'f' ? 'F' : s.dist == 't' ? 't' : 'x', yLabel: 'f(x)');
    // Shaded area.
    if (s.from != null) pl.fillBetween(c, s.pdf, null, s.from!, s.to ?? x1, IX.positive.withValues(alpha: 0.28));
    final (l, r) = s.crit;
    if (r != null) pl.fillBetween(c, s.pdf, null, r, x1, MX.red.withValues(alpha: 0.3));
    if (l != null) pl.fillBetween(c, s.pdf, null, x0, l, MX.red.withValues(alpha: 0.3));
    if (s.compare && s.dist == 't') pl.curve(c, normPdf, IX.green, width: 3, dashed: true);
    pl.curve(c, s.pdf, IX.accent, width: 4.5);
    for (final v in [l, r]) {
      if (v == null) continue;
      IxPaint.dashed(c, pl.p(v, 0), pl.p(v, top * 1.05), MPaint.stroke(MX.red, 2), dash: 7, gap: 5);
      IxPaint.label(c, fmt(v, 3), pl.p(v, top * 1.05) + const Offset(0, -6), size: 17, color: MX.red, w: FontWeight.w700, align: Alignment.bottomCenter, halo: true);
    }
    if (s.stat != null) {
      final st = s.stat!.clamp(x0, x1);
      c.drawLine(pl.p(st, 0), pl.p(st, top * 0.8), MPaint.stroke(IX.ink, 3.5));
      IxPaint.label(c, 'statistic ${fmt(s.stat!, 2)}', pl.p(st, top * 0.8) + const Offset(0, -8), size: 18, color: IX.ink, w: FontWeight.w700, align: Alignment.bottomCenter, halo: true);
    }
    if (s.dist == 'normal' && s.from == null && s.tail == 'none') {
      for (var k = 1; k <= 3; k++) {
        for (final sg in [-1, 1]) {
          final x = s.mu + sg * k * s.sigma;
          IxPaint.dashed(c, pl.p(x, 0), pl.p(x, s.pdf(x)), MPaint.stroke(IX.steel, 1.6), dash: 5, gap: 4);
        }
      }
      IxPaint.label(c, '68.27% within μ ± σ,  95.45% within μ ± 2σ,  99.73% within μ ± 3σ', Offset(rect.left + 16, rect.top + 10), size: 19, color: IX.inkSoft, align: Alignment.topLeft, halo: true);
    }
    if (s.dist == 'lognormal') {
      final mean = math.exp(s.sk * s.sk / 2), mode = math.exp(-s.sk * s.sk);
      for (final (v, col, n) in [(mode, IX.green, 'mode'), (1.0, IX.accent, 'median'), (mean, IX.positive, 'mean')]) {
        c.drawLine(pl.p(v, 0), pl.p(v, s.pdf(v)), MPaint.stroke(col, 3));
        IxPaint.label(c, n, pl.p(v, s.pdf(v)) + Offset(0, n == 'median' ? -30 : -10), size: 18, color: col, w: FontWeight.w700, align: Alignment.bottomCenter, halo: true);
      }
    }
    if (s.dist == 'gnormal') {
      final saved = s.shape;
      s.shape = 2;
      pl.curve(c, s.pdf, IX.steel, width: 2.5, dashed: true);
      s.shape = saved;
      IxPaint.label(c, 'dashed: the normal curve (β₂ = 3)', Offset(rect.left + 16, rect.top + 10), size: 19, color: IX.inkSoft, align: Alignment.topLeft, halo: true);
    }
    if (s.compare && s.dist == 't') MPaint.legend(c, Offset(pl.rect.right - 280, pl.rect.top + 6), [(IX.accent, 't, ν = ${s.df}'), (IX.green, 'standard normal')], size: 17);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
