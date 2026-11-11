import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'common.dart';
import 'distribution.dart' show normCdf;

double _mean(List<double> d) => d.isEmpty ? double.nan : d.reduce((a, b) => a + b) / d.length;
double _median(List<double> d) {
  if (d.isEmpty) return double.nan;
  final s = [...d]..sort();
  return s.length.isOdd ? s[s.length ~/ 2] : (s[s.length ~/ 2 - 1] + s[s.length ~/ 2]) / 2;
}

double _var(List<double> d) {
  final m = _mean(d);
  return d.map((x) => (x - m) * (x - m)).reduce((a, b) => a + b) / d.length;
}

/// Statistics of a data set: dot plots with mean, median and mode, deviations about any point
/// A (mean deviation and the sum of squares), two classes with the same mean and different
/// spread, variance as an average square, the mean as the balance point, histograms with the
/// mean, σ, mode and median from the table, ogives, shifting and stretching data, the
/// coefficient of variation, quartiles of a frequency curve, A.M. ≥ G.M. ≥ H.M. for speeds, and
/// moments about any point.
///
/// Preset: {"mode": "dots"|"two"|"squares"|"balance"|"histogram"|"ogive"|"transform"|"cv"|"quartiles"|
/// "means"|"moments", "data": [3, 5, 6, 7, 9, 12, 18], "data2": [...], "A": 7, "curve": "md"|"ss"|"none",
/// "start": 0, "width": 10, "freq": [2, 5, 9, 6, 3], "mu": 50, "sigma": 15, "k": 1, "c": 10, "mA": 60,
/// "sA": 15, "mB": 30, "sB": 9, "v1": 30, "v2": 60, "skew": false, "values": [1,2,3,4,5]}.
class StatDataInstrument extends StatefulWidget {
  const StatDataInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<StatDataInstrument> createState() => _StatState();
}

class _StatState extends State<StatDataInstrument> {
  String mode = 'dots', curve = 'none';
  List<double> data = [3, 5, 6, 7, 9, 12, 18], data2 = [], freq = [2, 5, 9, 6, 3], values = [1, 2, 3, 4, 5];
  double A = 7, start = 0, width = 10, mu = 50, sigma = 15, k = 1, c = 10, mA = 60, sA = 15, mB = 30, sB = 9, v1 = 30, v2 = 60, spread = 6, spread2 = 16;
  bool skew = false, useMuSigma = false, showMedian = true, showMode = false;
  int? active;
  int _drag = -1;

  static final _presets = <String, Map<String, dynamic>>{
    'Mean and median': {'mode': 'dots', 'data': [2, 4, 5, 9, 10]},
    'Mean deviation': {'mode': 'dots', 'data': [2, 3, 5, 9, 16], 'A': 12, 'curve': 'md'},
    'Histogram': {'mode': 'histogram', 'start': 0, 'width': 10, 'freq': [2, 5, 9, 12, 8, 4]},
    'Ogives': {'mode': 'ogive', 'start': 0, 'width': 10, 'freq': [6, 14, 12, 8]},
    'Coefficient of variation': {'mode': 'cv', 'mA': 60, 'sA': 15, 'mB': 30, 'sB': 9},
    'Variance as squares': {'mode': 'squares', 'data': [2, 4, 7, 11]},
  };

  @override
  void initState() {
    super.initState();
    _apply(widget.preset.isEmpty ? _presets['Mean and median']! : widget.preset);
    if (widget.preset.isEmpty) active = 0;
  }

  void _apply(Map<String, dynamic> m) {
    mode = ps(m, 'mode', 'dots');
    curve = ps(m, 'curve', 'none');
    data = pl(m, 'data', [3, 5, 6, 7, 9, 12, 18]);
    data2 = pl(m, 'data2', []);
    freq = pl(m, 'freq', [2, 5, 9, 6, 3]);
    values = pl(m, 'values', [1, 2, 3, 4, 5]);
    A = pd(m, 'A', _median(data));
    start = pd(m, 'start', 0);
    width = pd(m, 'width', 10);
    useMuSigma = m['mu'] != null && mode == 'histogram';
    mu = pd(m, 'mu', 50);
    sigma = pd(m, 'sigma', 15);
    k = pd(m, 'k', 1);
    c = pd(m, 'c', 0);
    mA = pd(m, 'mA', 60);
    sA = pd(m, 'sA', 15);
    mB = pd(m, 'mB', 30);
    sB = pd(m, 'sB', 9);
    v1 = pd(m, 'v1', 30);
    v2 = pd(m, 'v2', 60);
    spread = pd(m, 'spread', 6);
    spread2 = pd(m, 'spread2', 16);
    skew = pb(m, 'skew', false);
    showMedian = pb(m, 'median', true);
    showMode = pb(m, 'showMode', false);
    if (mode == 'two' && data2.isEmpty) data2 = data;
  }

  List<double> get freqs {
    if (!useMuSigma) return freq;
    // A bell-shaped set of 200 marks in classes 0–10, …, 90–100.
    return [for (var i = 0; i < 10; i++) (200 * (normCdf((start + (i + 1) * width - mu) / sigma) - normCdf((start + i * width - mu) / sigma))).roundToDouble()];
  }

  /// Two rows with mean 50 whose spread is set by s.
  List<double> row(double s, int seed) {
    final base = [-1.0, -0.78, -0.55, -0.3, -0.1, 0.1, 0.3, 0.55, 0.78, 1.0];
    return [for (final b in base) (50 + s * b * 2).roundToDouble()];
  }

  ({double mean, double median, double mode, double sd, double n}) get table {
    final f = freqs;
    final n = f.fold(0.0, (a, b) => a + b);
    final mids = [for (var i = 0; i < f.length; i++) start + (i + 0.5) * width];
    final mean = [for (var i = 0; i < f.length; i++) f[i] * mids[i]].fold(0.0, (a, b) => a + b) / n;
    final v = [for (var i = 0; i < f.length; i++) f[i] * mids[i] * mids[i]].fold(0.0, (a, b) => a + b) / n - mean * mean;
    // Median by interpolation.
    var cf = 0.0, median = double.nan;
    for (var i = 0; i < f.length; i++) {
      if (cf + f[i] >= n / 2 && f[i] > 0) {
        median = start + i * width + (n / 2 - cf) / f[i] * width;
        break;
      }
      cf += f[i];
    }
    // Mode: L + (f1 − f0)/(2f1 − f0 − f2) · h.
    var mi = 0;
    for (var i = 1; i < f.length; i++) {
      if (f[i] > f[mi]) mi = i;
    }
    final f0 = mi > 0 ? f[mi - 1] : 0.0, f1 = f[mi], f2 = mi < f.length - 1 ? f[mi + 1] : 0.0;
    final den = 2 * f1 - f0 - f2;
    final mode = start + mi * width + (den == 0 ? 0.5 : (f1 - f0) / den) * width;
    return (mean: mean, median: median, mode: mode, sd: math.sqrt(math.max(0, v)), n: n);
  }

  String f2(double v) => fmt(v, 2);

  @override
  Widget build(BuildContext context) {
    String title, formula;
    final ro = <Readout>[];
    final ctl = <Widget>[];
    Widget sl(String l, double v, double lo, double hi, ValueChanged<double> on, {int d = 0, int? div}) => IxSlider(label: l, value: v.clamp(lo, hi), min: lo, max: hi, divisions: div ?? (hi - lo).round(), format: (x) => fmt(x, d), onChanged: (x) => setState(() { on(x); active = null; }));
    switch (mode) {
      case 'two':
        final a = row(spread, 1), b = row(spread2, 2);
        title = 'Same mean, different spread';
        formula = 'range = largest − smallest';
        ro.addAll([Readout('Mean of A', f2(_mean(a)), '', IX.accent), Readout('Mean of B', f2(_mean(b)), '', IX.positive), Readout('Range of A', fmt(a.reduce(math.max) - a.reduce(math.min), 0), '', IX.accent), Readout('Range of B', fmt(b.reduce(math.max) - b.reduce(math.min), 0), '', IX.positive), Readout('σ of A', f2(math.sqrt(_var(a))), '', IX.inkSoft), Readout('σ of B', f2(math.sqrt(_var(b))), '', IX.inkSoft)]);
        ctl.addAll([sl('Spread of A', spread, 0, 20, (x) => spread = x), sl('Spread of B', spread2, 0, 20, (x) => spread2 = x)]);
      case 'squares':
        final m = _mean(data), v = _var(data);
        title = 'Variance as an average square';
        formula = 'σ² = Σ(xᵢ − x̄)² / n';
        ro.addAll([Readout('Mean x̄', f2(m), '', IX.ink), Readout('Variance σ²', f2(v), '', IX.positive), Readout('Standard deviation σ', f2(math.sqrt(v)), '', IX.accent)]);
        ctl.add(Text('Drag the data points along the line.', style: IX.text(18, c: IX.inkSoft)));
      case 'balance':
        final m = _mean(data);
        title = 'The mean is the balance point';
        formula = 'Σ(x − x̄) = 0';
        ro.addAll([Readout('Σx', fmt(data.fold(0.0, (a, b) => a + b), 1), '', IX.ink), Readout('Mean x̄', f2(m), '', IX.positive), Readout('Pivot', f2(A), '', IX.accent), Readout('Σ(x − pivot)', f2(data.fold(0.0, (a, b) => a + b - A)), '', (data.fold(0.0, (a, b) => a + b - A)).abs() < 1e-9 ? IX.green : MX.red)]);
        ctl.addAll([sl('Pivot', A, 0, 20, (x) => A = x, d: 1, div: 40), Text('Drag the weights along the beam.', style: IX.text(18, c: IX.inkSoft))]);
      case 'histogram':
        final t = table;
        title = 'Histogram, mean and σ';
        formula = 'x̄ = Σfx/N,   σ² = Σfx²/N − x̄²';
        ro.addAll([Readout('N = Σf', fmt(t.n, 0), '', IX.ink), Readout('Mean x̄', f2(t.mean), '', IX.positive), Readout('σ', f2(t.sd), '', IX.accent), Readout('Median', f2(t.median), '', IX.green), Readout('Mode', f2(t.mode), '', MX.violet)]);
        if (useMuSigma) {
          ctl.addAll([sl('Centre of the marks', mu, 20, 80, (x) => mu = x), sl('Spread', sigma, 6, 20, (x) => sigma = x)]);
        } else {
          for (var i = 0; i < freq.length; i++) {
            ctl.add(sl('f: ${fmtT(start + i * width)}–${fmtT(start + (i + 1) * width)}', freq[i], 0, 30, (x) => freq[i] = x));
          }
        }
        ctl.add(IxToggle(label: 'Locate the mode on the histogram', value: showMode, onChanged: (v) => setState(() => showMode = v)));
      case 'ogive':
        final t = table;
        title = 'The median from the ogives';
        formula = 'the ogives cross at N/2, above the median';
        ro.addAll([Readout('N', fmt(t.n, 0), '', IX.ink), Readout('N/2', fmt(t.n / 2, 1), '', IX.inkSoft), Readout('Median', f2(t.median), '', IX.positive)]);
        for (var i = 0; i < freq.length; i++) {
          ctl.add(sl('f: ${fmtT(start + i * width)}–${fmtT(start + (i + 1) * width)}', freq[i], 1, 30, (x) => freq[i] = x));
        }
      case 'transform':
        final y = [for (final x in data) k * x + c];
        title = 'Shift and stretch the data';
        formula = 'y = kx + c:  ȳ = k x̄ + c,  σᵧ = |k| σₓ';
        ro.addAll([Readout('x̄', f2(_mean(data)), '', IX.accent), Readout('σₓ', f2(math.sqrt(_var(data))), '', IX.accent), Readout('ȳ', f2(_mean(y)), '', IX.positive), Readout('σᵧ', f2(math.sqrt(_var(y))), '', IX.positive)]);
        ctl.addAll([sl('k', k, -2, 3, (x) => k = x, d: 1, div: 50), sl('c', c, -20, 20, (x) => c = x)]);
      case 'cv':
        title = 'Who is more consistent?';
        formula = 'C.V. = σ / x̄ × 100';
        final cvA = 100 * sA / mA, cvB = 100 * sB / mB;
        ro.addAll([Readout('C.V. of A', '${fmt(cvA, 1)}%', '', IX.accent), Readout('C.V. of B', '${fmt(cvB, 1)}%', '', IX.positive), Readout('More consistent', cvA < cvB ? 'A' : cvB < cvA ? 'B' : 'equal', '', IX.green)]);
        ctl.addAll([sl('Mean of A', mA, 20, 80, (x) => mA = x), sl('σ of A', sA, 2, 25, (x) => sA = x), sl('Mean of B', mB, 20, 80, (x) => mB = x), sl('σ of B', sB, 2, 25, (x) => sB = x)]);
      case 'quartiles':
        final (q1, md, q3) = quart;
        title = 'Quartiles and the middle half';
        formula = 'Q.D. = (Q₃ − Q₁)/2';
        ro.addAll([Readout('Q₁', f2(q1), '', IX.accent), Readout('Median', f2(md), '', IX.ink), Readout('Q₃', f2(q3), '', IX.positive), Readout('Q.D.', f2((q3 - q1) / 2), '', IX.green), Readout('Coefficient of Q.D.', fmt((q3 - q1) / (q3 + q1), 3), '', IX.inkSoft), Readout('Bowley’s Sk', fmt((q3 + q1 - 2 * md) / (q3 - q1), 3), '', MX.violet)]);
        ctl.addAll([sl('Spread', spread, 4, 16, (x) => spread = x), IxToggle(label: 'Skewed to the right', value: skew, onChanged: (v) => setState(() => skew = v))]);
      case 'means':
        final am = (v1 + v2) / 2, gm = math.sqrt(v1 * v2), hm = 2 * v1 * v2 / (v1 + v2);
        title = 'Average speed: which mean?';
        formula = 'equal distances: average speed = H.M.';
        ro.addAll([Readout('A.M.', fmt(am, 2), 'km/h', IX.accent), Readout('G.M.', fmt(gm, 2), 'km/h', IX.green), Readout('H.M.', fmt(hm, 2), 'km/h', IX.positive), Readout('True average = 120 ÷ time', fmt(120 / (60 / v1 + 60 / v2), 2), 'km/h', IX.ink)]);
        ctl.addAll([sl('Speed going', v1, 20, 80, (x) => v1 = x), sl('Speed returning', v2, 20, 80, (x) => v2 = x)]);
      case 'moments':
        final n = freq.fold(0.0, (a, b) => a + b);
        double raw(int r) => [for (var i = 0; i < values.length; i++) freq[i] * math.pow(values[i] - A, r)].fold(0.0, (a, b) => a + b) / n;
        final m = [for (var i = 0; i < values.length; i++) freq[i] * values[i]].fold(0.0, (a, b) => a + b) / n;
        double cen(int r) => [for (var i = 0; i < values.length; i++) freq[i] * math.pow(values[i] - m, r)].fold(0.0, (a, b) => a + b) / n;
        title = 'Moments about any point';
        formula = 'μᵣ′ = Σf(x − A)ʳ/N,   μᵣ = Σf(x − x̄)ʳ/N';
        ro.addAll([Readout('μ₁′ = x̄ − A', fmt(raw(1), 3), '', IX.accent), Readout('μ₂′', fmt(raw(2), 3), '', IX.accent), Readout('μ₂ (variance)', fmt(cen(2), 3), '', IX.positive), Readout('μ₃', fmt(cen(3), 3), '', IX.positive), Readout('β₁ = μ₃²/μ₂³', fmt(math.pow(cen(3), 2) / math.pow(cen(2), 3), 3), '', IX.inkSoft), Readout('β₂ = μ₄/μ₂²', fmt(cen(4) / math.pow(cen(2), 2), 3), '', IX.inkSoft)]);
        ctl.add(sl('A', A, values.first - 1, values.last + 1, (x) => A = x, d: 1, div: ((values.last - values.first + 2) * 2).round()));
        for (var i = 0; i < freq.length; i++) {
          ctl.add(sl('f at x = ${fmtT(values[i])}', freq[i], 0, 20, (x) => freq[i] = x));
        }
      default:
        final m = _mean(data), md = _median(data);
        final md0 = data.map((x) => (x - A).abs()).reduce((a, b) => a + b) / data.length;
        final ss = data.map((x) => (x - A) * (x - A)).reduce((a, b) => a + b);
        title = curve == 'md' ? 'Mean deviation about any point' : curve == 'ss' ? 'Deviations from the mean' : 'Mean or median?';
        formula = curve == 'md' ? 'M.D.(A) = Σ|x − A| / n is least at the median' : curve == 'ss' ? 'Σ(x − A)² is least at the mean' : 'x̄ = Σx/n';
        ro.addAll([
          Readout('Mean x̄', f2(m), '', IX.positive),
          Readout('Median', f2(md), '', IX.accent),
          if (curve == 'md') Readout('M.D. about A = ${fmtT(A, 1)}', f2(md0), '', IX.ink),
          if (curve == 'md') Readout('M.D. about the median', f2(data.map((x) => (x - md).abs()).reduce((a, b) => a + b) / data.length), '', IX.green),
          if (curve == 'md') Readout('M.D. about the mean', f2(data.map((x) => (x - m).abs()).reduce((a, b) => a + b) / data.length), '', IX.inkSoft),
          if (curve == 'ss') Readout('Σ(x − A)', f2(data.fold(0.0, (a, b) => a + b - A)), '', IX.ink),
          if (curve == 'ss') Readout('Σ(x − A)²', f2(ss), '', IX.green),
          if (curve == 'none') Readout('Range', f2(data.reduce(math.max) - data.reduce(math.min)), '', IX.ink),
          if (curve == 'none') Readout('σ', f2(math.sqrt(_var(data))), '', IX.inkSoft),
        ]);
        if (curve != 'none') ctl.add(sl('A', A, (data.reduce(math.min) - 3).floorToDouble(), (data.reduce(math.max) + 3).ceilToDouble(), (x) => A = x, d: 1, div: ((data.reduce(math.max) - data.reduce(math.min) + 6) * 2).round()));
        ctl.add(Text('Drag the data points along the line.', style: IX.text(18, c: IX.inkSoft)));
    }
    return InstrumentFrame(
      id: 'maths-statdata',
      subtitle: tx(widget.preset['subtitle']) ?? '$kStats · Measures of central tendency and dispersion',
      title: tx(widget.preset['title']) ?? title,
      formula: formula,
      state: {'mode': mode, 'data': data, 'freq': freq, 'A': A},
      readouts: ro,
      controls: ctl,
      presets: [for (final (i, e) in _presets.entries.indexed) Preset(e.key, () => setState(() { _apply(e.value); active = i; }))],
      activePreset: active,
      stage: LayoutBuilder(builder: (context, box) {
        final size = box.biggest;
        final pl = _StatPainter.dotPlane(this, size);
        final draggable = mode == 'dots' || mode == 'squares' || mode == 'balance';
        return GestureDetector(
          onPanStart: (d) {
            _drag = -1;
            if (!draggable) return;
            var best = 60.0;
            for (var i = 0; i < data.length; i++) {
              final dd = (pl.sx(data[i]) - d.localPosition.dx).abs();
              if (dd < best) {
                best = dd;
                _drag = i;
              }
            }
          },
          onPanUpdate: (d) {
            if (_drag < 0) return;
            setState(() {
              data = [...data];
              data[_drag] = (pl.wx(d.localPosition.dx) * 2).round() / 2;
              data[_drag] = data[_drag].clamp(pl.xa, pl.xb);
              active = null;
            });
          },
          onPanEnd: (_) => _drag = -1,
          child: CustomPaint(size: size, painter: _StatPainter(this, pl)),
        );
      }),
    );
  }

  /// Quartiles of a smooth frequency curve: symmetric (normal) or right-skewed (log-normal).
  (double, double, double) get quart {
    if (!skew) return (50 - 0.6745 * spread, 50.0, 50 + 0.6745 * spread);
    const sg = 0.45;
    final scale = spread / 0.5;
    double q(double z) => 30 + scale * math.exp(sg * z);
    return (q(-0.6745), q(0), q(0.6745));
  }

  double quartPdf(double x) {
    if (!skew) return math.exp(-0.5 * math.pow((x - 50) / spread, 2)) / (spread * math.sqrt(2 * math.pi));
    const sg = 0.45;
    final scale = spread / 0.5;
    final u = (x - 30) / scale;
    if (u <= 0) return 0;
    return math.exp(-math.pow(math.log(u), 2) / (2 * sg * sg)) / (u * sg * math.sqrt(2 * math.pi)) / scale;
  }
}

class _StatPainter extends CustomPainter {
  _StatPainter(this.s, this.pl);
  final _StatState s;
  final Plane pl;

  static Plane dotPlane(_StatState s, Size size) {
    final lo = s.data.isEmpty ? 0.0 : s.data.reduce(math.min), hi = s.data.isEmpty ? 10.0 : s.data.reduce(math.max);
    final span = math.max(10.0, hi - lo);
    final a = s.mode == 'balance' ? 0.0 : (lo - span * 0.25).floorToDouble(), b = s.mode == 'balance' ? 20.0 : (hi + span * 0.25).ceilToDouble();
    final top = s.curve == 'none' ? size.height * 0.42 : size.height * 0.3;
    return Plane(Rect.fromLTRB(90, top - 40, size.width - 60, top + 40), a, b, -1, 1);
  }

  void axisLine(Canvas c, Plane p, double y, {double? step}) {
    c.drawLine(Offset(p.rect.left - 10, y), Offset(p.rect.right + 10, y), MPaint.stroke(IX.ink, 2.5));
    final st = step ?? niceStep(p.xb - p.xa, p.rect.width / 70);
    for (var k = (p.xa / st).ceil(); k <= (p.xb / st).floor(); k++) {
      final x = p.sx(k * st);
      c.drawLine(Offset(x, y - 7), Offset(x, y + 7), MPaint.stroke(IX.ink, 1.5));
      IxPaint.label(c, fmtT(k * st, 1), Offset(x, y + 14), size: 16, color: IX.inkSoft, align: Alignment.topCenter);
    }
  }

  void marker(Canvas c, double x, double y0, double y1, Color col, String label, {bool up = true}) {
    IxPaint.dashed(c, Offset(x, y0), Offset(x, y1), MPaint.stroke(col, 2.5), dash: 7, gap: 5);
    IxPaint.label(c, label, Offset(x, up ? y1 - 8 : y1 + 8), size: 19, color: col, w: FontWeight.w700, align: up ? Alignment.bottomCenter : Alignment.topCenter, halo: true);
  }

  @override
  void paint(Canvas c, Size size) {
    switch (s.mode) {
      case 'two':
        _two(c, size);
      case 'squares':
        _squares(c, size);
      case 'balance':
        _balance(c, size);
      case 'histogram':
        _histogram(c, size);
      case 'ogive':
        _ogive(c, size);
      case 'transform':
        _transform(c, size);
      case 'cv':
        _cv(c, size);
      case 'quartiles':
        _quartiles(c, size);
      case 'means':
        _means(c, size);
      case 'moments':
        _moments(c, size);
      default:
        _dots(c, size);
    }
  }

  void _dots(Canvas c, Size size) {
    final y = pl.sy(0);
    axisLine(c, pl, y);
    final m = _mean(s.data), md = _median(s.data);
    // Deviations from A.
    if (s.curve != 'none') {
      for (final (i, x) in s.data.indexed) {
        final yy = y - 40 - i * 12.0;
        c.drawLine(Offset(pl.sx(s.A), yy), Offset(pl.sx(x), yy), MPaint.stroke((x >= s.A ? IX.green : MX.red).withValues(alpha: 0.75), 4));
      }
      marker(c, pl.sx(s.A), y + 30, y - 60 - s.data.length * 12.0, IX.ink, 'A');
    }
    final counts = <double, int>{};
    for (final x in s.data) {
      final k = counts[x] ?? 0;
      counts[x] = k + 1;
      MPaint.dot(c, Offset(pl.sx(x), y - k * 26.0), IX.accent, r: 12);
    }
    marker(c, pl.sx(m), y + 40, y + 90, IX.positive, 'mean ${fmt(m, 2)}', up: false);
    if (s.showMedian) {
      c.drawCircle(Offset(pl.sx(md), y), 19, MPaint.stroke(IX.ink, 2.5));
      IxPaint.label(c, 'median ${fmt(md, 2)}', Offset(pl.sx(md), y - 70), size: 19, color: IX.ink, w: FontWeight.w700, align: Alignment.bottomCenter, halo: true);
    }
    IxPaint.label(c, 'Data: ${s.data.map((v) => fmtT(v, 1)).join(', ')}', Offset(90, 40), size: 22, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
    if (s.curve == 'none') return;
    // The curve M.D.(a) or Σ(x − a)² for every a.
    double g(double a) => s.curve == 'md' ? s.data.map((x) => (x - a).abs()).reduce((p, q) => p + q) / s.data.length : s.data.map((x) => (x - a) * (x - a)).reduce((p, q) => p + q);
    var hi = 0.0;
    for (var i = 0; i <= 100; i++) {
      hi = math.max(hi, g(pl.xa + (pl.xb - pl.xa) * i / 100));
    }
    final bp = Plane(Rect.fromLTRB(pl.rect.left, size.height * 0.55, pl.rect.right, size.height - 50), pl.xa, pl.xb, 0, hi * 1.1);
    bp.paintGrid(c, xLabel: 'A', yLabel: s.curve == 'md' ? 'M.D.(A)' : 'Σ(x − A)²');
    bp.curve(c, g, IX.accent, width: 4);
    MPaint.dot(c, bp.p(s.A, g(s.A)), IX.positive, r: 9);
    final best = s.curve == 'md' ? md : m;
    MPaint.dot(c, bp.p(best, g(best)), IX.green, r: 7);
    IxPaint.label(c, s.curve == 'md' ? 'least at the median' : 'least at the mean', bp.p(best, g(best)) + const Offset(0, 22), size: 17, color: IX.green, w: FontWeight.w600, align: Alignment.topCenter, halo: true);
  }

  void _two(Canvas c, Size size) {
    final a = s.row(s.spread, 1), b = s.row(s.spread2, 2);
    final p = Plane(Rect.fromLTRB(140, 0, size.width - 60, size.height), 0, 100, 0, 1);
    for (final (i, (d, col, n)) in [(a, IX.accent, 'Class A'), (b, IX.positive, 'Class B')].indexed) {
      final y = size.height * (0.32 + 0.36 * i);
      axisLine(c, p, y, step: 10);
      IxPaint.label(c, n, Offset(120, y), size: 22, color: col, w: FontWeight.w700, align: Alignment.centerRight);
      final counts = <double, int>{};
      for (final x in d) {
        final k = counts[x] ?? 0;
        counts[x] = k + 1;
        MPaint.dot(c, Offset(p.sx(x), y - 16 - k * 22.0), col, r: 10);
      }
      final lo = d.reduce(math.min), hi = d.reduce(math.max);
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(p.sx(lo), y + 44, p.sx(hi), y + 56), const Radius.circular(6)), Paint()..color = col.withValues(alpha: 0.5));
      IxPaint.label(c, 'range ${fmt(hi - lo, 0)}', Offset(p.sx(hi) + 12, y + 50), size: 18, color: col, w: FontWeight.w600, align: Alignment.centerLeft);
      marker(c, p.sx(50), y - 90, y - 110, IX.ink, i == 0 ? 'mean 50' : '');
    }
  }

  void _squares(Canvas c, Size size) {
    final m = _mean(s.data);
    final y = pl.sy(0);
    axisLine(c, pl, y);
    for (final (i, x) in s.data.indexed) {
      final side = (x - m).abs() * pl.ux;
      final col = MX.series[i % MX.series.length];
      final left = math.min(pl.sx(x), pl.sx(m));
      c.drawRect(Rect.fromLTWH(left, y - side - 2, side, side), Paint()..color = col.withValues(alpha: 0.16));
      c.drawRect(Rect.fromLTWH(left, y - side - 2, side, side), MPaint.stroke(col, 2));
      MPaint.dot(c, Offset(pl.sx(x), y), col, r: 12);
    }
    final sd = math.sqrt(_var(s.data)) * pl.ux;
    c.drawRect(Rect.fromLTWH(pl.sx(m), y + 30, sd, sd), Paint()..color = IX.amber.withValues(alpha: 0.3));
    c.drawRect(Rect.fromLTWH(pl.sx(m), y + 30, sd, sd), MPaint.stroke(IX.amber, 3));
    IxPaint.label(c, 'side σ: area = mean of the squares', Offset(pl.sx(m) + sd + 14, y + 30 + sd / 2), size: 19, color: IX.amber, w: FontWeight.w700, align: Alignment.centerLeft);
    marker(c, pl.sx(m), y + 20, y - 30 - (s.data.map((x) => (x - m).abs()).reduce(math.max)) * pl.ux, IX.ink, 'x̄ = ${fmt(m, 2)}');
  }

  void _balance(Canvas c, Size size) {
    final m = _mean(s.data);
    final torque = s.data.fold(0.0, (a, b) => a + b - s.A);
    final tilt = (torque / 40).clamp(-0.25, 0.25);
    final pivot = Offset(pl.sx(s.A), pl.sy(0) + 40);
    c.save();
    c.translate(pivot.dx, pivot.dy);
    c.rotate(tilt);
    c.translate(-pivot.dx, -pivot.dy);
    final beamY = pivot.dy - 10;
    c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(pl.rect.left - 10, beamY - 8, pl.rect.right + 10, beamY + 8), const Radius.circular(4)), Paint()..color = IX.steel);
    for (var k = 0; k <= 20; k += 2) {
      IxPaint.label(c, '$k', Offset(pl.sx(k.toDouble()), beamY + 14), size: 15, color: IX.inkSoft, align: Alignment.topCenter);
    }
    final counts = <double, int>{};
    for (final x in s.data) {
      final k = counts[x] ?? 0;
      counts[x] = k + 1;
      final r = Rect.fromCenter(center: Offset(pl.sx(x), beamY - 30 - k * 42.0), width: 40, height: 40);
      c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(6)), Paint()..color = IX.accent);
      IxPaint.label(c, fmtT(x, 1), r.center, size: 15, color: Colors.white, w: FontWeight.w700);
    }
    c.restore();
    c.drawPath(Path()..moveTo(pivot.dx, pivot.dy)..lineTo(pivot.dx - 30, pivot.dy + 50)..lineTo(pivot.dx + 30, pivot.dy + 50)..close(), Paint()..color = IX.positive);
    final bal = torque.abs() < 1e-9;
    IxPaint.label(c, bal ? 'Balanced: the pivot is at the mean ${fmt(m, 2)}' : 'Tips ${torque > 0 ? 'right' : 'left'}: move the pivot towards ${fmt(m, 2)}', Offset(size.width / 2, size.height - 60), size: 24, color: bal ? IX.green : MX.red, w: FontWeight.w700);
  }

  void _histogram(Canvas c, Size size) {
    final f = s.freqs;
    final t = s.table;
    final p = Plane(Rect.fromLTRB(100, 50, size.width - 50, size.height - 70), s.start - s.width, s.start + (f.length + 1) * s.width, 0, f.reduce(math.max) * 1.25 + 1);
    p.paintGrid(c, xLabel: 'class', yLabel: 'f', xStep: s.width, grid: false);
    var mi = 0;
    for (var i = 1; i < f.length; i++) {
      if (f[i] > f[mi]) mi = i;
    }
    for (var i = 0; i < f.length; i++) {
      final r = Rect.fromLTRB(p.sx(s.start + i * s.width), p.sy(f[i]), p.sx(s.start + (i + 1) * s.width), p.sy(0));
      c.drawRect(r, Paint()..color = IX.accent.withValues(alpha: s.showMode && i == mi ? 0.5 : 0.3));
      c.drawRect(r, MPaint.stroke(IX.accent, 2));
      IxPaint.label(c, fmt(f[i], 0), Offset(r.center.dx, r.top - 8), size: 17, color: IX.ink, w: FontWeight.w600, align: Alignment.bottomCenter);
    }
    // Frequency polygon.
    final path = Path()..moveTo(p.sx(s.start - s.width / 2), p.sy(0));
    for (var i = 0; i < f.length; i++) {
      path.lineTo(p.sx(s.start + (i + 0.5) * s.width), p.sy(f[i]));
    }
    path.lineTo(p.sx(s.start + (f.length + 0.5) * s.width), p.sy(0));
    c.drawPath(path, MPaint.stroke(IX.positive.withValues(alpha: 0.7), 2.5));
    if (s.showMode && f.length > 2) {
      final x0 = s.start + mi * s.width, x1 = x0 + s.width;
      final f0 = mi > 0 ? f[mi - 1] : 0.0, f2 = mi < f.length - 1 ? f[mi + 1] : 0.0;
      c.drawLine(p.p(x0, f[mi]), p.p(x1, f2), MPaint.stroke(MX.violet, 2.5));
      c.drawLine(p.p(x1, f[mi]), p.p(x0, f0), MPaint.stroke(MX.violet, 2.5));
      marker(c, p.sx(t.mode), p.sy(0), p.sy(f[mi]) - 40, MX.violet, 'mode ${fmt(t.mode, 2)}');
    } else {
      marker(c, p.sx(t.mean), p.sy(0), p.rect.top + 30, IX.ink, 'x̄ = ${fmt(t.mean, 1)}');
      final yb = p.rect.top + 60;
      c.drawLine(Offset(p.sx(t.mean - t.sd), yb), Offset(p.sx(t.mean + t.sd), yb), MPaint.stroke(IX.amber, 4));
      IxPaint.label(c, 'x̄ ± σ', Offset(p.sx(t.mean + t.sd) + 10, yb), size: 18, color: IX.amber, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
    }
  }

  void _ogive(Canvas c, Size size) {
    final f = s.freq;
    final n = f.fold(0.0, (a, b) => a + b);
    final p = Plane(Rect.fromLTRB(100, 50, size.width - 50, size.height - 70), s.start, s.start + f.length * s.width, 0, n * 1.1);
    p.paintGrid(c, xLabel: 'x', yLabel: 'cf', xStep: s.width);
    final less = Path(), more = Path();
    var cf = 0.0;
    less.moveTo(p.sx(s.start), p.sy(0));
    more.moveTo(p.sx(s.start), p.sy(n));
    for (var i = 0; i < f.length; i++) {
      cf += f[i];
      less.lineTo(p.sx(s.start + (i + 1) * s.width), p.sy(cf));
      more.lineTo(p.sx(s.start + (i + 1) * s.width), p.sy(n - cf));
    }
    c.drawPath(less, MPaint.stroke(IX.accent, 4));
    c.drawPath(more, MPaint.stroke(IX.positive, 4));
    final md = s.table.median;
    IxPaint.dashed(c, p.p(s.start, n / 2), p.p(md, n / 2), MPaint.stroke(IX.ink, 2), dash: 7, gap: 5);
    IxPaint.dashed(c, p.p(md, n / 2), p.p(md, 0), MPaint.stroke(IX.ink, 2), dash: 7, gap: 5);
    MPaint.dot(c, p.p(md, n / 2), IX.ink, r: 9);
    IxPaint.label(c, 'median ${fmt(md, 2)}', p.p(md, 0) + const Offset(10, -16), size: 19, color: IX.ink, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
    MPaint.legend(c, Offset(p.rect.left + 16, p.rect.top + 6), [(IX.accent, 'less-than ogive'), (IX.positive, 'more-than ogive')], size: 17);
  }

  void _transform(Canvas c, Size size) {
    final y = [for (final x in s.data) s.k * x + s.c];
    final all = [...s.data, ...y];
    final lo = all.reduce(math.min) - 4, hi = all.reduce(math.max) + 4;
    final p = Plane(Rect.fromLTRB(140, 0, size.width - 60, size.height), lo, hi, 0, 1);
    for (final (i, (d, col, n)) in [(s.data, IX.accent, 'x'), (y, IX.positive, 'y = kx + c')].indexed) {
      final yy = size.height * (0.34 + 0.34 * i);
      axisLine(c, p, yy);
      IxPaint.label(c, n, Offset(120, yy), size: 20, color: col, w: FontWeight.w700, align: Alignment.centerRight);
      for (final v in d) {
        MPaint.dot(c, Offset(p.sx(v), yy - 16), col, r: 10);
      }
      final m = _mean(d), sd = math.sqrt(_var(d));
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(p.sx(m - sd), yy + 40, p.sx(m + sd), yy + 52), const Radius.circular(6)), Paint()..color = col.withValues(alpha: 0.45));
      IxPaint.label(c, 'mean ± σ', Offset(p.sx(m + sd) + 10, yy + 46), size: 17, color: col, w: FontWeight.w600, align: Alignment.centerLeft);
    }
    for (var i = 0; i < s.data.length; i++) {
      IxPaint.dashed(c, Offset(p.sx(s.data[i]), size.height * 0.34 + 8), Offset(p.sx(y[i]), size.height * 0.68 - 30), MPaint.stroke(IX.steel, 1.4), dash: 5, gap: 5);
    }
  }

  void _cv(Canvas c, Size size) {
    final p = Plane(Rect.fromLTRB(100, 60, size.width - 60, size.height - 80), 0, 120, 0, 1);
    for (final (i, (m, sd, col, n)) in [(s.mA, s.sA, IX.accent, 'A'), (s.mB, s.sB, IX.positive, 'B')].indexed) {
      final yy = size.height * (0.3 + 0.36 * i);
      axisLine(c, p, yy, step: 10);
      final rnd = math.Random(7 + i);
      for (var k = 0; k < 20; k++) {
        final u1 = rnd.nextDouble(), u2 = rnd.nextDouble();
        final z = math.sqrt(-2 * math.log(u1 + 1e-12)) * math.cos(2 * math.pi * u2);
        final v = (m + sd * z).clamp(0.0, 120.0);
        MPaint.dot(c, Offset(p.sx(v), yy - 20 - (k % 4) * 16.0), col.withValues(alpha: 0.8), r: 6);
      }
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(p.sx(m - sd), yy + 42, p.sx(m + sd), yy + 54), const Radius.circular(6)), Paint()..color = col.withValues(alpha: 0.5));
      marker(c, p.sx(m), yy, yy - 100, col, '$n: x̄ = ${fmtT(m)}, σ = ${fmtT(sd)}, C.V. = ${fmt(100 * sd / m, 1)}%');
    }
  }

  void _quartiles(Canvas c, Size size) {
    final (q1, md, q3) = s.quart;
    final p = Plane(Rect.fromLTRB(100, 60, size.width - 50, size.height - 80), 0, 100, 0, s.quartPdf(s.skew ? 30 + s.spread / 0.5 * math.exp(-0.45 * 0.45) : 50) * 1.25);
    p.paintGrid(c, xLabel: 'marks', yLabel: 'f', yTicks: false);
    p.fillBetween(c, s.quartPdf, null, q1, q3, IX.accent.withValues(alpha: 0.22));
    p.curve(c, s.quartPdf, IX.ink, width: 4);
    for (final (v, n, col) in [(q1, 'Q₁', IX.accent), (md, 'Md', IX.ink), (q3, 'Q₃', IX.positive)]) {
      c.drawLine(p.p(v, 0), p.p(v, s.quartPdf(v)), MPaint.stroke(col, 3));
      IxPaint.label(c, '$n = ${fmt(v, 1)}', p.p(v, s.quartPdf(v)) + const Offset(0, -10), size: 18, color: col, w: FontWeight.w700, align: Alignment.bottomCenter, halo: true);
    }
    IxPaint.label(c, 'middle 50%', p.p((q1 + q3) / 2, s.quartPdf((q1 + q3) / 2) * 0.35), size: 19, color: IX.accent, w: FontWeight.w700, halo: true);
  }

  void _means(Canvas c, Size size) {
    final am = (s.v1 + s.v2) / 2, gm = math.sqrt(s.v1 * s.v2), hm = 2 * s.v1 * s.v2 / (s.v1 + s.v2);
    final tTrue = 60 / s.v1 + 60 / s.v2;
    final rows = [('Your car', double.nan, IX.ink), ('A.M. car', am, IX.accent), ('G.M. car', gm, IX.green), ('H.M. car', hm, IX.positive)];
    final x0 = 220.0, x1 = size.width - 80;
    for (final (i, (n, v, col)) in rows.indexed) {
      final y = 90 + i * (size.height - 160) / 4;
      c.drawLine(Offset(x0, y + 22), Offset(x1, y + 22), MPaint.stroke(IX.rule, 2));
      IxPaint.label(c, n, Offset(x0 - 20, y), size: 21, color: col, w: FontWeight.w700, align: Alignment.centerRight);
      // Distance covered by the time your car finishes.
      final dist = v.isNaN ? 120.0 : math.min(120.0, v * tTrue);
      final cx = x0 + (x1 - x0) * dist / 120;
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(cx, y), width: 56, height: 26), const Radius.circular(8)), Paint()..color = col);
      IxPaint.label(c, v.isNaN ? '${fmtT(s.v1)} then ${fmtT(s.v2)} km/h' : '${fmt(v, 1)} km/h', Offset(cx - 40, y), size: 17, color: col, w: FontWeight.w600, align: Alignment.centerRight);
      if (!v.isNaN && v * tTrue > 120.01) IxPaint.label(c, 'early', Offset(x1 + 10, y), size: 16, color: col, align: Alignment.centerLeft);
    }
    IxPaint.label(c, 'Positions when your car finishes 120 km (60 km each way)', Offset(size.width / 2, size.height - 40), size: 19, color: IX.inkSoft);
  }

  void _moments(Canvas c, Size size) {
    final n = s.freq.fold(0.0, (a, b) => a + b);
    final m = [for (var i = 0; i < s.values.length; i++) s.freq[i] * s.values[i]].fold(0.0, (a, b) => a + b) / n;
    final p = Plane(Rect.fromLTRB(100, 60, size.width - 50, size.height - 80), s.values.first - 1.5, s.values.last + 1.5, 0, s.freq.reduce(math.max) * 1.3 + 1);
    p.paintGrid(c, xLabel: 'x', yLabel: 'f', xStep: 1);
    for (var i = 0; i < s.values.length; i++) {
      final r = Rect.fromLTRB(p.sx(s.values[i] - 0.3), p.sy(s.freq[i]), p.sx(s.values[i] + 0.3), p.sy(0));
      c.drawRRect(RRect.fromRectAndCorners(r, topLeft: const Radius.circular(6), topRight: const Radius.circular(6)), Paint()..color = IX.accent.withValues(alpha: 0.5));
      IxPaint.label(c, fmt(s.freq[i], 0), Offset(r.center.dx, r.top - 8), size: 17, color: IX.ink, w: FontWeight.w600, align: Alignment.bottomCenter);
    }
    marker(c, p.sx(m), p.sy(0), p.rect.top + 30, IX.positive, 'x̄ = ${fmt(m, 2)}');
    marker(c, p.sx(s.A), p.sy(0), p.rect.top + 70, IX.ink, 'A = ${fmtT(s.A, 1)}');
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
