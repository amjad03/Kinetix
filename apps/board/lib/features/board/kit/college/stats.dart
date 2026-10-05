import 'dart:math' as math;

import 'finance.dart' show Working, n2, n4;

// Business statistics, as taught in BBA / B.Com / M.Com / BSc: descriptive measures,
// probability distributions, correlation and regression, tests of hypotheses, index numbers
// and moving averages. Working in English, as in the textbooks.

/// Numbers in pasted text: commas, spaces, tabs, semicolons or new lines between them
/// (Indian-grouped numbers such as 1,25,000 are not supported here: use spaces).
List<double> parseNumbers(String text) => [
  for (final t in text.split(RegExp(r'[\s,;]+'))) ?double.tryParse(t.replaceAll('₹', '')),
];

/// Rows of numbers, one row a line (pairs for regression, groups for ANOVA).
List<List<double>> parseRows(String text) => [
  for (final line in text.split('\n'))
    if (parseNumbers(line) case final r when r.isNotEmpty) r,
];

// --- Special functions ----------------------------------------------------------------------

double lnGamma(double x) {
  const g = 7.0;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, //
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return math.log(math.pi / math.sin(math.pi * x)) - lnGamma(1 - x);
  x -= 1;
  var a = c[0];
  final t = x + g + 0.5;
  for (var i = 1; i < 9; i++) {
    a += c[i] / (x + i);
  }
  return 0.5 * math.log(2 * math.pi) + (x + 0.5) * math.log(t) - t + math.log(a);
}

/// Regularised lower incomplete gamma P(a, x).
double gammaP(double a, double x) {
  if (x <= 0) return 0;
  if (x < a + 1) {
    var sum = 1 / a, term = sum;
    for (var n = 1; n < 500; n++) {
      term *= x / (a + n);
      sum += term;
      if (term.abs() < sum.abs() * 1e-15) break;
    }
    return sum * math.exp(-x + a * math.log(x) - lnGamma(a));
  }
  // Continued fraction for Q(a, x).
  var b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
  for (var i = 1; i < 500; i++) {
    final an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (d.abs() < 1e-300) d = 1e-300;
    c = b + an / c;
    if (c.abs() < 1e-300) c = 1e-300;
    d = 1 / d;
    final del = d * c;
    h *= del;
    if ((del - 1).abs() < 1e-15) break;
  }
  return 1 - math.exp(-x + a * math.log(x) - lnGamma(a)) * h;
}

/// Regularised incomplete beta I_x(a, b).
double betaI(double a, double b, double x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  final front = math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * math.log(x) + b * math.log(1 - x));
  if (x > (a + 1) / (a + b + 2)) return 1 - betaI(b, a, 1 - x);
  // Lentz's continued fraction.
  var c = 1.0, d = 1 - (a + b) * x / (a + 1);
  if (d.abs() < 1e-300) d = 1e-300;
  d = 1 / d;
  var h = d;
  for (var m = 1; m < 500; m++) {
    final m2 = 2 * m;
    var aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (d.abs() < 1e-300) d = 1e-300;
    c = 1 + aa / c;
    if (c.abs() < 1e-300) c = 1e-300;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (d.abs() < 1e-300) d = 1e-300;
    c = 1 + aa / c;
    if (c.abs() < 1e-300) c = 1e-300;
    d = 1 / d;
    final del = d * c;
    h *= del;
    if ((del - 1).abs() < 1e-15) break;
  }
  return front * h / a;
}

double _erf(double x) {
  // erf from the incomplete gamma function: erf(x) = P(1/2, x²).
  final v = gammaP(0.5, x * x);
  return x < 0 ? -v : v;
}

// --- Distributions --------------------------------------------------------------------------

double normalPdf(double x, [double mu = 0, double sd = 1]) => math.exp(-0.5 * math.pow((x - mu) / sd, 2)) / (sd * math.sqrt(2 * math.pi));
double normalCdf(double x, [double mu = 0, double sd = 1]) => 0.5 * (1 + _erf((x - mu) / (sd * math.sqrt2)));

/// The z with P(Z ≤ z) = [p] (Acklam's approximation, polished by one Newton step).
double normalInv(double p) {
  if (p <= 0) return double.negativeInfinity;
  if (p >= 1) return double.infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  double x;
  if (p < 0.02425) {
    final q = math.sqrt(-2 * math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - 0.02425) {
    final q = p - 0.5, r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    final q = math.sqrt(-2 * math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  final e = normalCdf(x) - p;
  return x - e / normalPdf(x);
}

double binomialPmf(int n, double p, int k) {
  if (k < 0 || k > n) return 0;
  final lc = lnGamma(n + 1.0) - lnGamma(k + 1.0) - lnGamma(n - k + 1.0);
  if (p == 0) return k == 0 ? 1 : 0;
  if (p == 1) return k == n ? 1 : 0;
  return math.exp(lc + k * math.log(p) + (n - k) * math.log(1 - p));
}

double poissonPmf(double lambda, int k) => k < 0 ? 0 : math.exp(-lambda + k * math.log(lambda) - lnGamma(k + 1.0));

double tPdf(double t, double df) => math.exp(lnGamma((df + 1) / 2) - lnGamma(df / 2) - 0.5 * math.log(df * math.pi) - (df + 1) / 2 * math.log(1 + t * t / df));
double tCdf(double t, double df) {
  final x = df / (df + t * t);
  final tail = 0.5 * betaI(df / 2, 0.5, x);
  return t >= 0 ? 1 - tail : tail;
}

double chiSquarePdf(double x, double df) => x <= 0 ? 0 : math.exp((df / 2 - 1) * math.log(x) - x / 2 - df / 2 * math.ln2 - lnGamma(df / 2));
double chiSquareCdf(double x, double df) => gammaP(df / 2, x / 2);
double fCdf(double f, double d1, double d2) => f <= 0 ? 0 : betaI(d1 / 2, d2 / 2, d1 * f / (d1 * f + d2));

/// The x where [cdf] reaches [p], by bisection on [lo, hi].
double _inverse(double Function(double) cdf, double p, double lo, double hi) {
  for (var i = 0; i < 200; i++) {
    final mid = (lo + hi) / 2;
    if (cdf(mid) < p) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

double tInv(double p, double df) => _inverse((t) => tCdf(t, df), p, -1000, 1000);
double chiSquareInv(double p, double df) => _inverse((x) => chiSquareCdf(x, df), p, 0, 10000);
double fInv(double p, double d1, double d2) => _inverse((x) => fCdf(x, d1, d2), p, 0, 10000);

// --- Descriptive ----------------------------------------------------------------------------

class Descriptive {
  Descriptive(List<double> data) : sorted = [...data]..sort();
  final List<double> sorted;

  int get n => sorted.length;
  double get sum => sorted.fold(0.0, (a, b) => a + b);
  double get mean => sum / n;
  double get median => quantilePos((n + 1) / 2);

  /// The value at position [pos] (1-based) of the sorted data, between neighbours as needed:
  /// the (n + 1)/4 method of Indian textbooks.
  double quantilePos(double pos) {
    if (pos <= 1) return sorted.first;
    if (pos >= n) return sorted.last;
    final i = pos.floor();
    return sorted[i - 1] + (pos - i) * (sorted[i] - sorted[i - 1]);
  }

  double get q1 => quantilePos((n + 1) / 4);
  double get q3 => quantilePos(3 * (n + 1) / 4);
  double get iqr => q3 - q1;
  double get min => sorted.first;
  double get max => sorted.last;
  double get range => max - min;

  /// Every value that occurs most often (empty when each occurs once).
  List<double> get modes {
    final counts = <double, int>{};
    for (final v in sorted) {
      counts[v] = (counts[v] ?? 0) + 1;
    }
    final top = counts.values.fold(0, math.max);
    return top < 2 ? const [] : [for (final e in counts.entries) if (e.value == top) e.key];
  }

  double get _ss => sorted.fold(0.0, (a, v) => a + (v - mean) * (v - mean));
  double get variance => _ss / n;
  double get sd => math.sqrt(variance);
  double get sampleVariance => n < 2 ? 0 : _ss / (n - 1);
  double get sampleSd => math.sqrt(sampleVariance);
  double get cv => sd / mean * 100;
  double get skewness => sd == 0 ? 0 : 3 * (mean - median) / sd;

  Working get working => Working('Descriptive statistics', [
    'n = $n, Σx = ${n2(sum)}',
    'Mean x̄ = Σx ÷ n = ${n2(sum)} ÷ $n = ${n4(mean)}',
    'Median = value of the (n + 1)/2 = ${n2((n + 1) / 2)}th item = ${n4(median)}',
    'Mode = ${modes.isEmpty ? 'none (no value repeats)' : modes.map(n4).join(', ')}',
    'Q1 = (n + 1)/4th item = ${n4(q1)}, Q3 = 3(n + 1)/4th item = ${n4(q3)}, IQR = ${n4(iqr)}',
    'Quartile deviation = (Q3 − Q1) ÷ 2 = ${n4(iqr / 2)}',
    'Range = ${n4(max)} − ${n4(min)} = ${n4(range)}',
    'σ² = Σ(x − x̄)² ÷ n = ${n4(variance)}, σ = ${n4(sd)}',
    's (sample, n − 1) = ${n4(sampleSd)}',
    'CV = σ ÷ x̄ × 100 = ${n2(cv)}%',
    'Karl Pearson’s skewness = 3(x̄ − Median) ÷ σ = ${n4(skewness)}',
  ], 'x̄ = ${n4(mean)}, σ = ${n4(sd)}');

  /// Equal-width classes for a histogram: (lower limits, counts).
  ({List<double> edges, List<int> counts}) histogram([int? bins]) {
    final k = (bins ?? (1 + 3.322 * math.log(n) / math.ln10).ceil()).clamp(1, 20);
    final w = range == 0 ? 1.0 : range / k;
    final counts = List.filled(k, 0);
    for (final v in sorted) {
      counts[math.min(k - 1, ((v - min) / w).floor())]++;
    }
    return (edges: [for (var i = 0; i <= k; i++) min + i * w], counts: counts);
  }
}

// --- Correlation and regression -------------------------------------------------------------

class Regression {
  Regression(this.x, this.y) : assert(x.length == y.length);
  final List<double> x, y;

  int get n => x.length;
  double get mx => x.fold(0.0, (a, b) => a + b) / n;
  double get my => y.fold(0.0, (a, b) => a + b) / n;
  double get sxy => [for (var i = 0; i < n; i++) (x[i] - mx) * (y[i] - my)].fold(0.0, (a, b) => a + b);
  double get sxx => x.fold(0.0, (a, v) => a + (v - mx) * (v - mx));
  double get syy => y.fold(0.0, (a, v) => a + (v - my) * (v - my));
  double get r => sxy / math.sqrt(sxx * syy);

  /// y = a + b x
  double get b => sxy / sxx;
  double get a => my - b * mx;

  /// x = a' + b' y
  double get bxy => sxy / syy;

  Working get working => Working('Correlation and regression', [
    'n = $n, x̄ = ${n4(mx)}, ȳ = ${n4(my)}',
    'Σ(x − x̄)(y − ȳ) = ${n4(sxy)}, Σ(x − x̄)² = ${n4(sxx)}, Σ(y − ȳ)² = ${n4(syy)}',
    'r = Σ(x − x̄)(y − ȳ) ÷ √(Σ(x − x̄)² · Σ(y − ȳ)²) = ${n4(r)}',
    'r² = ${n4(r * r)} (${n2(r * r * 100)}% of the variation in y explained)',
    'b_yx = ${n4(b)}, b_xy = ${n4(bxy)}; r = ±√(b_yx · b_xy)',
    'Regression of y on x: y − ${n4(my)} = ${n4(b)}(x − ${n4(mx)})',
    'Regression of x on y: x − ${n4(mx)} = ${n4(bxy)}(y − ${n4(my)})',
  ], 'y = ${n4(a)} ${b < 0 ? '−' : '+'} ${n4(b.abs())}x, r = ${n4(r)}');
}

// --- Tests of hypotheses --------------------------------------------------------------------

/// A test's outcome.
class TestResult {
  const TestResult(this.working, this.statistic, this.critical, this.p, this.reject);
  final Working working;
  final double statistic, critical, p;
  final bool reject;
}

String _decide(bool reject, double alpha) =>
    reject ? 'Reject H₀ at ${n2(alpha * 100)}% level of significance' : 'Do not reject H₀ at ${n2(alpha * 100)}% level of significance';

/// One-sample z test of a mean (σ known, or a large sample), two-tailed.
TestResult zTest({required double mean, required double mu0, required double sd, required int n, double alpha = 0.05}) {
  final se = sd / math.sqrt(n);
  final z = (mean - mu0) / se;
  final crit = normalInv(1 - alpha / 2);
  final p = 2 * (1 - normalCdf(z.abs()));
  final reject = z.abs() > crit;
  return TestResult(
    Working('z test (one mean)', [
      'H₀: μ = ${n4(mu0)}; H₁: μ ≠ ${n4(mu0)} (two-tailed)',
      'SE = σ ÷ √n = ${n4(sd)} ÷ √$n = ${n4(se)}',
      'z = (x̄ − μ₀) ÷ SE = (${n4(mean)} − ${n4(mu0)}) ÷ ${n4(se)} = ${n4(z)}',
      'Critical value z(${n2(alpha / 2)}) = ±${n4(crit)}; p-value = ${n4(p)}',
    ], _decide(reject, alpha)),
    z,
    crit,
    p,
    reject,
  );
}

/// One-sample t test from the data, two-tailed.
TestResult tTestOne({required List<double> data, required double mu0, double alpha = 0.05}) {
  final d = Descriptive(data);
  final se = d.sampleSd / math.sqrt(d.n);
  final t = (d.mean - mu0) / se;
  final df = d.n - 1.0;
  final crit = tInv(1 - alpha / 2, df);
  final p = 2 * (1 - tCdf(t.abs(), df));
  final reject = t.abs() > crit;
  return TestResult(
    Working('t test (one mean)', [
      'H₀: μ = ${n4(mu0)}; H₁: μ ≠ ${n4(mu0)}',
      'x̄ = ${n4(d.mean)}, s = ${n4(d.sampleSd)}, n = ${d.n}',
      't = (x̄ − μ₀) ÷ (s ÷ √n) = ${n4(t)}, df = n − 1 = ${df.round()}',
      'Critical value t(${n2(alpha / 2)}, ${df.round()}) = ±${n4(crit)}; p-value = ${n4(p)}',
    ], _decide(reject, alpha)),
    t,
    crit,
    p,
    reject,
  );
}

/// Two independent samples, equal variances (pooled), two-tailed.
TestResult tTestTwo({required List<double> a, required List<double> b, double alpha = 0.05}) {
  final x = Descriptive(a), y = Descriptive(b);
  final df = x.n + y.n - 2.0;
  final sp2 = ((x.n - 1) * x.sampleVariance + (y.n - 1) * y.sampleVariance) / df;
  final se = math.sqrt(sp2 * (1 / x.n + 1 / y.n));
  final t = (x.mean - y.mean) / se;
  final crit = tInv(1 - alpha / 2, df);
  final p = 2 * (1 - tCdf(t.abs(), df));
  final reject = t.abs() > crit;
  return TestResult(
    Working('t test (two means)', [
      'H₀: μ₁ = μ₂; H₁: μ₁ ≠ μ₂',
      'x̄₁ = ${n4(x.mean)}, s₁ = ${n4(x.sampleSd)}, n₁ = ${x.n}; x̄₂ = ${n4(y.mean)}, s₂ = ${n4(y.sampleSd)}, n₂ = ${y.n}',
      'Pooled s² = ((n₁ − 1)s₁² + (n₂ − 1)s₂²) ÷ (n₁ + n₂ − 2) = ${n4(sp2)}',
      't = (x̄₁ − x̄₂) ÷ √(s²(1/n₁ + 1/n₂)) = ${n4(t)}, df = ${df.round()}',
      'Critical value = ±${n4(crit)}; p-value = ${n4(p)}',
    ], _decide(reject, alpha)),
    t,
    crit,
    p,
    reject,
  );
}

/// χ² test. One row: goodness of fit against [expected] (equal when null). Several rows: a
/// contingency table, testing independence.
TestResult chiSquareTest({required List<List<double>> observed, List<double>? expected, double alpha = 0.05}) {
  var chi = 0.0;
  double df;
  final steps = <String>[];
  if (observed.length == 1) {
    final o = observed.first;
    final total = o.fold(0.0, (a, b) => a + b);
    final e = expected != null && expected.length == o.length ? expected : List.filled(o.length, total / o.length);
    for (var i = 0; i < o.length; i++) {
      chi += math.pow(o[i] - e[i], 2) / e[i];
    }
    df = o.length - 1.0;
    steps
      ..add('H₀: the data fit the expected frequencies')
      ..add('O = ${o.map(n2).join(', ')}; E = ${e.map(n2).join(', ')}')
      ..add('χ² = Σ (O − E)² ÷ E = ${n4(chi)}, df = k − 1 = ${df.round()}');
  } else {
    final rows = observed.length, cols = observed.first.length;
    final rt = [for (final r in observed) r.fold(0.0, (a, b) => a + b)];
    final ct = [for (var c = 0; c < cols; c++) observed.fold(0.0, (a, r) => a + (c < r.length ? r[c] : 0))];
    final total = rt.fold(0.0, (a, b) => a + b);
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        final e = rt[r] * ct[c] / total;
        chi += math.pow((c < observed[r].length ? observed[r][c] : 0) - e, 2) / e;
      }
    }
    df = (rows - 1.0) * (cols - 1.0);
    steps
      ..add('H₀: the two attributes are independent')
      ..add('E = Row total × Column total ÷ Grand total (grand total ${n2(total)})')
      ..add('χ² = Σ (O − E)² ÷ E = ${n4(chi)}, df = (r − 1)(c − 1) = ${df.round()}');
  }
  final crit = chiSquareInv(1 - alpha, df);
  final p = 1 - chiSquareCdf(chi, df);
  final reject = chi > crit;
  steps.add('Critical value χ²(${n2(alpha)}, ${df.round()}) = ${n4(crit)}; p-value = ${n4(p)}');
  return TestResult(Working('Chi-square test', steps, _decide(reject, alpha)), chi, crit, p, reject);
}

/// One-way ANOVA for [groups].
TestResult anova(List<List<double>> groups, {double alpha = 0.05}) {
  final all = [for (final g in groups) ...g];
  final n = all.length, k = groups.length;
  final grand = all.fold(0.0, (a, b) => a + b) / n;
  var ssb = 0.0, ssw = 0.0;
  for (final g in groups) {
    final m = g.fold(0.0, (a, b) => a + b) / g.length;
    ssb += g.length * (m - grand) * (m - grand);
    for (final v in g) {
      ssw += (v - m) * (v - m);
    }
  }
  final d1 = k - 1.0, d2 = n - k.toDouble();
  final msb = ssb / d1, msw = ssw / d2;
  final f = msb / msw;
  final crit = fInv(1 - alpha, d1, d2);
  final p = 1 - fCdf(f, d1, d2);
  final reject = f > crit;
  return TestResult(
    Working(
      'One-way ANOVA',
      [
        'H₀: all $k group means are equal',
        'Grand mean = ${n4(grand)}, N = $n, k = $k',
        'SSB = Σ nᵢ(x̄ᵢ − x̄)² = ${n4(ssb)}, df = ${d1.round()}, MSB = ${n4(msb)}',
        'SSW = ΣΣ(x − x̄ᵢ)² = ${n4(ssw)}, df = ${d2.round()}, MSW = ${n4(msw)}',
        'F = MSB ÷ MSW = ${n4(f)}',
        'Critical value F(${n2(alpha)}; ${d1.round()}, ${d2.round()}) = ${n4(crit)}; p-value = ${n4(p)}',
      ],
      _decide(reject, alpha),
      table: [
        ['Source', 'SS', 'df', 'MS', 'F'],
        ['Between groups', n4(ssb), '${d1.round()}', n4(msb), n4(f)],
        ['Within groups', n4(ssw), '${d2.round()}', n4(msw), ''],
        ['Total', n4(ssb + ssw), '${n - 1}', '', ''],
      ],
    ),
    f,
    crit,
    p,
    reject,
  );
}

// --- Index numbers --------------------------------------------------------------------------

/// Laspeyres, Paasche and Fisher price indices from (p0, q0, p1, q1) rows.
Working indexNumbers(List<List<double>> rows) {
  var p1q0 = 0.0, p0q0 = 0.0, p1q1 = 0.0, p0q1 = 0.0, sp1 = 0.0, sp0 = 0.0;
  for (final r in rows.where((r) => r.length >= 4)) {
    final (p0, q0, p1, q1) = (r[0], r[1], r[2], r[3]);
    p1q0 += p1 * q0;
    p0q0 += p0 * q0;
    p1q1 += p1 * q1;
    p0q1 += p0 * q1;
    sp1 += p1;
    sp0 += p0;
  }
  final l = p1q0 / p0q0 * 100, p = p1q1 / p0q1 * 100, f = math.sqrt(l * p);
  return Working('Price index numbers', [
    'Σp₁q₀ = ${n2(p1q0)}, Σp₀q₀ = ${n2(p0q0)}, Σp₁q₁ = ${n2(p1q1)}, Σp₀q₁ = ${n2(p0q1)}',
    'Simple aggregative = Σp₁ ÷ Σp₀ × 100 = ${n2(sp1 / sp0 * 100)}',
    'Laspeyres P₀₁ = Σp₁q₀ ÷ Σp₀q₀ × 100 = ${n2(l)}',
    'Paasche P₀₁ = Σp₁q₁ ÷ Σp₀q₁ × 100 = ${n2(p)}',
    'Fisher P₀₁ = √(L × P) = ${n2(f)}',
  ], 'Fisher’s ideal index = ${n2(f)}');
}

/// Laspeyres, Paasche and Fisher, as numbers (for tests and charts).
({double laspeyres, double paasche, double fisher}) priceIndices(List<List<double>> rows) {
  var a = 0.0, b = 0.0, c = 0.0, d = 0.0;
  for (final r in rows) {
    a += r[2] * r[1];
    b += r[0] * r[1];
    c += r[2] * r[3];
    d += r[0] * r[3];
  }
  return (laspeyres: a / b * 100, paasche: c / d * 100, fisher: math.sqrt(a / b * c / d) * 100);
}

// --- Time series ----------------------------------------------------------------------------

/// [k]-period moving averages, centred: null where there is none. An even [k] is centred by
/// averaging pairs (a 2 × k moving average).
List<double?> movingAverage(List<double> y, int k) {
  final out = List<double?>.filled(y.length, null);
  if (k < 2 || k > y.length) return out;
  final plain = [for (var i = 0; i + k <= y.length; i++) y.sublist(i, i + k).fold(0.0, (a, b) => a + b) / k];
  if (k.isOdd) {
    for (var i = 0; i < plain.length; i++) {
      out[i + k ~/ 2] = plain[i];
    }
  } else {
    for (var i = 0; i + 1 < plain.length; i++) {
      out[i + k ~/ 2] = (plain[i] + plain[i + 1]) / 2;
    }
  }
  return out;
}

Working movingAverageWorking(List<double> y, int k) {
  final ma = movingAverage(y, k);
  return Working(
    '$k-period moving average',
    [
      k.isOdd ? 'Each average of $k values is placed against the middle one' : 'Averages of $k values are centred by averaging each pair (2 × $k MA)',
      'First trend value = ${ma.firstWhere((v) => v != null, orElse: () => null) == null ? '—' : n4(ma.firstWhere((v) => v != null)!)}',
    ],
    '${ma.whereType<double>().length} trend values',
    table: [
      ['t', 'y', '$k-period MA'],
      for (var i = 0; i < y.length; i++) ['${i + 1}', n4(y[i]), ma[i] == null ? '' : n4(ma[i]!)],
    ],
  );
}
