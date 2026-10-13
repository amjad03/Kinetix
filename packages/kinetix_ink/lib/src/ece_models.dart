import 'dart:math' as math;

import 'logic_models.dart';

// The figures behind the electronics and communication panels (KitElement): timing diagrams
// (drawn by hand, or from a logic circuit's clocked simulation), a signal and spectrum plotter
// (sampled signals, a radix-2 FFT, windows, aliasing) and Bode plots (poles, zeros and gain, or
// the standard first- and second-order filters; actual and asymptotic). Pure Dart, read from and
// written to the panel's JSON.

double _d(Object? v, [double fallback = 0]) => v is num ? v.toDouble() : (v is String ? double.tryParse(v) ?? fallback : fallback);
String _s(Object? v, [String fallback = '']) => v is String ? v : fallback;
bool _b(Object? v, [bool fallback = false]) => v is bool ? v : fallback;
int _i(Object? v, [int fallback = 0]) => v is num ? v.round() : fallback;
List<Object?> _l(Object? v) => v is List ? v : const [];
double _r(double v, [int sig = 8]) => v.isFinite ? double.parse(v.toStringAsPrecision(sig)) : 0;

// --- Timing diagrams --------------------------------------------------------------------------

/// The levels a bit signal takes in a step: 0, 1, unknown (x) and high impedance (z).
const timingLevels = ['0', '1', 'x', 'z'];

/// One row of a timing diagram: a bit signal (each step '0', '1', 'x' or 'z') or a bus (each step
/// its value as text; equal neighbours make one segment).
class TimingSignal {
  TimingSignal({required this.name, this.bus = false, List<String>? values}) : values = values ?? [];
  String name;
  bool bus;
  final List<String> values;

  Map<String, Object?> toJson() => {'n': name, if (bus) 'b': true, 'v': [...values]};
  static TimingSignal fromJson(Object? o) {
    final m = o is Map ? o : const {};
    final bus = _b(m['b']);
    return TimingSignal(
      name: _s(m['n'], 'SIG'),
      bus: bus,
      values: [for (final v in _l(m['v'])) bus ? '${v ?? ''}' : (timingLevels.contains(v) ? v as String : '0')],
    );
  }
}

/// A labelled line across the diagram at step [at] (its left edge).
typedef TimingMarker = ({int at, String label});

/// A timing diagram: [steps] equal time steps (half clock periods when made from a circuit), a
/// row per signal, and markers.
class TimingDiagram {
  TimingDiagram({this.title = 'Timing diagram', this.steps = 16, List<TimingSignal>? signals, List<TimingMarker>? markers})
    : signals = signals ?? [],
      markers = markers ?? [] {
    fit();
  }

  factory TimingDiagram.fromJson(Map<String, Object?> j) => TimingDiagram(
    title: _s(j['t'], 'Timing diagram'),
    steps: _i(j['steps'], 16).clamp(1, 128),
    signals: [for (final s in _l(j['sig'])) TimingSignal.fromJson(s)],
    markers: [
      for (final m in _l(j['mk']))
        if (m is Map) (at: _i(m['at']), label: _s(m['l'])),
    ],
  );

  Map<String, Object?> toJson() => {
    't': title,
    'steps': steps,
    'sig': [for (final s in signals) s.toJson()],
    'mk': [for (final m in markers) {'at': m.at, 'l': m.label}],
  };

  String title;
  int steps;
  final List<TimingSignal> signals;
  final List<TimingMarker> markers;

  TimingDiagram copy() => TimingDiagram.fromJson(toJson());

  /// Every row exactly [steps] long (padded with its last value).
  void fit() {
    for (final s in signals) {
      while (s.values.length < steps) {
        s.values.add(s.values.isEmpty ? (s.bus ? '' : '0') : s.values.last);
      }
      if (s.values.length > steps) s.values.removeRange(steps, s.values.length);
    }
    markers.removeWhere((m) => m.at < 0 || m.at > steps);
  }

  void setSteps(int n) {
    steps = n.clamp(1, 128);
    fit();
  }

  /// Bit signal [row] at [step] to the next level: 0 → 1 → x → z → 0.
  void cycle(int row, int step) {
    final s = signals[row];
    if (s.bus || step < 0 || step >= steps) return;
    s.values[step] = timingLevels[(timingLevels.indexOf(s.values[step]) + 1) % timingLevels.length];
  }

  /// A clock row: low then high, [half] steps each.
  static TimingSignal clock(String name, int steps, {int half = 1}) => TimingSignal(name: name, values: [for (var i = 0; i < steps; i++) (i ~/ half).isOdd ? '1' : '0']);

  /// The segments of a row: runs of equal values as (first step, length, value).
  static List<(int, int, String)> runs(TimingSignal s) {
    final out = <(int, int, String)>[];
    for (var i = 0; i < s.values.length; i++) {
      if (out.isNotEmpty && out.last.$3 == s.values[i]) {
        out[out.length - 1] = (out.last.$1, out.last.$2 + 1, s.values[i]);
      } else {
        out.add((i, 1, s.values[i]));
      }
    }
    return out;
  }
}

/// The timing diagram of [circuit] run for [cycles] clock periods (two steps each, starting low):
/// the clocks, the switches, each flip-flop's Q, the LEDs and, with two or more flip-flops, the
/// count they hold (first flip-flop least significant). The circuit itself is left as it was.
TimingDiagram simulateTiming(LogicCircuit circuit, {int cycles = 8, String title = 'Timing diagram'}) {
  final sim = circuit.copy();
  final steps = (cycles * 2).clamp(2, 128);
  final rows = <(String, String)>[
    for (final p in sim.parts.where((p) => p.kind == PartKind.clock)) (p.id, p.label),
    for (final p in sim.parts.where((p) => p.kind == PartKind.input)) (p.id, p.label),
    for (final p in sim.flipFlops) (p.id, '${p.label}.Q'),
    for (final p in sim.leds) (p.id, p.label),
  ];
  final signals = [for (final r in rows) TimingSignal(name: r.$2)];
  final ffs = sim.flipFlops;
  final count = ffs.length >= 2 ? TimingSignal(name: 'Count', bus: true) : null;
  for (var s = 0; s < steps; s++) {
    final v = sim.evaluate();
    for (final (i, r) in rows.indexed) {
      signals[i].values.add((v[r.$1] ?? false) ? '1' : '0');
    }
    if (count != null) {
      var n = 0;
      for (final (i, f) in ffs.indexed) {
        if (f.state) n |= 1 << i;
      }
      count.values.add('$n');
    }
    sim.tick();
  }
  return TimingDiagram(title: title, steps: steps, signals: [...signals, ?count]);
}

// --- Signals and spectra ----------------------------------------------------------------------

enum SignalKind { sine, sumOfSines, square, am, fm, noise }

enum WindowKind { rectangular, hann, hamming, blackman }

/// The window's coefficients for an [n]-point FFT (the periodic form used for spectra).
List<double> windowCoeffs(WindowKind w, int n) => [
  for (var k = 0; k < n; k++)
    switch (w) {
      WindowKind.rectangular => 1.0,
      WindowKind.hann => 0.5 - 0.5 * math.cos(2 * math.pi * k / n),
      WindowKind.hamming => 0.54 - 0.46 * math.cos(2 * math.pi * k / n),
      WindowKind.blackman => 0.42 - 0.5 * math.cos(2 * math.pi * k / n) + 0.08 * math.cos(4 * math.pi * k / n),
    },
];

bool isPowerOfTwo(int n) => n > 0 && n & (n - 1) == 0;

/// The FFT of [re] + j[im] in place (iterative radix-2 Cooley–Tukey, decimation in time):
/// X[k] = Σ x[n]·e^(−j2πkn/N). The length must be a power of two.
void fft(List<double> re, List<double> im) {
  final n = re.length;
  if (im.length != n || !isPowerOfTwo(n)) throw ArgumentError('FFT length must be a power of two');
  // Bit-reversed order.
  for (var i = 1, j = 0; i < n; i++) {
    var bit = n >> 1;
    for (; j & bit != 0; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      final tr = re[i], ti = im[i];
      re[i] = re[j];
      im[i] = im[j];
      re[j] = tr;
      im[j] = ti;
    }
  }
  for (var len = 2; len <= n; len <<= 1) {
    final ang = -2 * math.pi / len;
    final wr = math.cos(ang), wi = math.sin(ang);
    for (var i = 0; i < n; i += len) {
      var cr = 1.0, ci = 0.0;
      for (var k = 0; k < len ~/ 2; k++) {
        final ar = re[i + k], ai = im[i + k];
        final br = re[i + k + len ~/ 2] * cr - im[i + k + len ~/ 2] * ci;
        final bi = re[i + k + len ~/ 2] * ci + im[i + k + len ~/ 2] * cr;
        re[i + k] = ar + br;
        im[i + k] = ai + bi;
        re[i + k + len ~/ 2] = ar - br;
        im[i + k + len ~/ 2] = ai - bi;
        final nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/// The DFT by its definition (O(N²)), the reference the FFT is checked against.
(List<double>, List<double>) dft(List<double> re, List<double> im) {
  final n = re.length;
  final outR = List<double>.filled(n, 0), outI = List<double>.filled(n, 0);
  for (var k = 0; k < n; k++) {
    for (var t = 0; t < n; t++) {
      final a = -2 * math.pi * k * t / n;
      outR[k] += re[t] * math.cos(a) - im[t] * math.sin(a);
      outI[k] += re[t] * math.sin(a) + im[t] * math.cos(a);
    }
  }
  return (outR, outI);
}

/// One bin of a one-sided spectrum: its frequency (Hz), amplitude (the tone's peak, corrected
/// for the window) and phase (degrees; 0 where the bin is next to nothing).
typedef SpectrumBin = ({double f, double mag, double phase});

/// A sampled signal and its spectrum: a sine, two summed sines, a square wave, AM, FM or white
/// noise ([noise] adds noise of that amplitude to any of them), sampled at [fs] Hz for [n]
/// points (a power of two) and windowed before the FFT.
class SignalPanel {
  const SignalPanel({
    this.title = 'Signal and spectrum',
    this.kind = SignalKind.sine,
    this.f1 = 5,
    this.a1 = 1,
    this.f2 = 12,
    this.a2 = 0.5,
    this.fc = 40,
    this.fm = 4,
    this.m = 0.5,
    this.beta = 2,
    this.noise = 0,
    this.fs = 128,
    this.n = 128,
    this.window = WindowKind.rectangular,
    this.showPhase = false,
    this.seed = 1,
  });

  factory SignalPanel.fromJson(Map<String, Object?> j) {
    final n = _i(j['n'], 128);
    return SignalPanel(
      title: _s(j['t'], 'Signal and spectrum'),
      kind: SignalKind.values.asNameMap()[j['k']] ?? SignalKind.sine,
      f1: math.max(0, _d(j['f1'], 5)),
      a1: _d(j['a1'], 1),
      f2: math.max(0, _d(j['f2'], 12)),
      a2: _d(j['a2'], 0.5),
      fc: math.max(0, _d(j['fc'], 40)),
      fm: math.max(0, _d(j['fm'], 4)),
      m: math.max(0, _d(j['m'], 0.5)),
      beta: math.max(0, _d(j['beta'], 2)),
      noise: math.max(0, _d(j['noise'])),
      fs: math.max(1, _d(j['fs'], 128)),
      n: isPowerOfTwo(n) ? n.clamp(16, 4096) : 128,
      window: WindowKind.values.asNameMap()[j['w']] ?? WindowKind.rectangular,
      showPhase: _b(j['ph']),
      seed: _i(j['seed'], 1),
    );
  }

  Map<String, Object?> toJson() => {
    't': title,
    'k': kind.name,
    'f1': _r(f1),
    'a1': _r(a1),
    'f2': _r(f2),
    'a2': _r(a2),
    'fc': _r(fc),
    'fm': _r(fm),
    'm': _r(m),
    'beta': _r(beta),
    'noise': _r(noise),
    'fs': _r(fs),
    'n': n,
    'w': window.name,
    if (showPhase) 'ph': true,
    'seed': seed,
  };

  final String title;
  final SignalKind kind;

  /// Tone 1 and 2 (Hz and peak), carrier and message (Hz), AM index, FM index, noise peak.
  final double f1, a1, f2, a2, fc, fm, m, beta, noise;

  /// Sampling rate (Hz) and points.
  final double fs;
  final int n;
  final WindowKind window;
  final bool showPhase;
  final int seed;

  SignalPanel copyWith({String? title, SignalKind? kind, double? f1, double? a1, double? f2, double? a2, double? fc, double? fm, double? m, double? beta, double? noise, double? fs, int? n, WindowKind? window, bool? showPhase}) => SignalPanel(
    title: title ?? this.title,
    kind: kind ?? this.kind,
    f1: f1 ?? this.f1,
    a1: a1 ?? this.a1,
    f2: f2 ?? this.f2,
    a2: a2 ?? this.a2,
    fc: fc ?? this.fc,
    fm: fm ?? this.fm,
    m: m ?? this.m,
    beta: beta ?? this.beta,
    noise: noise ?? this.noise,
    fs: fs ?? this.fs,
    n: n ?? this.n,
    window: window ?? this.window,
    showPhase: showPhase ?? this.showPhase,
    seed: seed,
  );

  /// How long the samples last (s).
  double get duration => n / fs;
  double get nyquist => fs / 2;
  bool get noisy => kind == SignalKind.noise || noise > 0;

  /// The signal's value at time [t] without noise (the "analogue" curve).
  double at(double t) {
    const tau = 2 * math.pi;
    return switch (kind) {
      SignalKind.sine => a1 * math.sin(tau * f1 * t),
      SignalKind.sumOfSines => a1 * math.sin(tau * f1 * t) + a2 * math.sin(tau * f2 * t),
      SignalKind.square => a1 * (math.sin(tau * f1 * t) >= 0 ? 1 : -1),
      SignalKind.am => a1 * (1 + m * math.cos(tau * fm * t)) * math.cos(tau * fc * t),
      SignalKind.fm => a1 * math.cos(tau * fc * t + beta * math.sin(tau * fm * t)),
      SignalKind.noise => 0,
    };
  }

  /// The [n] samples x[k] = x(k/fs), with the noise (repeatable: the same seed gives the same).
  List<double> samples() {
    final rnd = math.Random(seed);
    final amp = kind == SignalKind.noise ? math.max(a1, noise) : noise;
    return [for (var k = 0; k < n; k++) at(k / fs) + (amp > 0 ? amp * (rnd.nextDouble() * 2 - 1) : 0)];
  }

  /// The one-sided spectrum, bins 0 to n/2, of the windowed samples.
  List<SpectrumBin> spectrum() {
    final w = windowCoeffs(window, n);
    final x = samples();
    final re = [for (var k = 0; k < n; k++) x[k] * w[k]];
    final im = List<double>.filled(n, 0);
    fft(re, im);
    final gain = w.fold(0.0, (s, v) => s + v) / n; // coherent gain
    final mags = [for (var k = 0; k <= n ~/ 2; k++) math.sqrt(re[k] * re[k] + im[k] * im[k]) / n / gain * (k == 0 || k == n ~/ 2 ? 1 : 2)];
    final top = mags.fold(0.0, math.max);
    return [
      for (var k = 0; k <= n ~/ 2; k++)
        (f: k * fs / n, mag: mags[k], phase: mags[k] > top * 0.01 ? math.atan2(im[k], re[k]) * 180 / math.pi : 0.0),
    ];
  }

  /// The frequencies the signal is made of (Hz), before sampling.
  List<double> get tones => switch (kind) {
    SignalKind.sine || SignalKind.square => [f1],
    SignalKind.sumOfSines => [f1, f2],
    SignalKind.am => [fc - fm, fc, fc + fm],
    SignalKind.fm => [fc],
    SignalKind.noise => const [],
  };

  /// Where a tone of [f] Hz shows after sampling at [fs]: folded into 0 to fs/2.
  double aliasOf(double f) => aliasFrequency(f, fs);

  /// The tones above the Nyquist frequency (they alias).
  List<double> get aliased => [for (final f in tones) if (f > nyquist + 1e-9) f];
}

/// [f] Hz sampled at [fs] Hz shows at |f − fs·round(f/fs)|.
double aliasFrequency(double f, double fs) => (f - fs * (f / fs).roundToDouble()).abs();

// --- Bode plots -------------------------------------------------------------------------------

/// A complex number (a pole or zero), in rad/s.
class Cplx {
  const Cplx(this.re, [this.im = 0]);
  final double re, im;
  double get abs => math.sqrt(re * re + im * im);
  double get arg => math.atan2(im, re);
  Cplx operator -(Cplx o) => Cplx(re - o.re, im - o.im);
  Cplx operator *(Cplx o) => Cplx(re * o.re - im * o.im, re * o.im + im * o.re);
  Cplx operator /(Cplx o) {
    final d = o.re * o.re + o.im * o.im;
    return Cplx((re * o.re + im * o.im) / d, (im * o.re - re * o.im) / d);
  }

  bool get isZero => re == 0 && im == 0;

  @override
  String toString() {
    String n(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : _r(v, 4).toString();
    if (im == 0) return n(re);
    return '${n(re)}${im < 0 ? '−' : '+'}${n(im.abs())}j';
  }

  @override
  bool operator ==(Object other) => other is Cplx && other.re == re && other.im == im;
  @override
  int get hashCode => Object.hash(re, im);
}

/// Reads roots as written: "-10, -100, -2±3j, 0" (± gives the conjugate pair; j or i). Throws
/// [FormatException] when it cannot.
List<Cplx> parseRoots(String text) {
  final out = <Cplx>[];
  for (final raw in text.split(RegExp(r'[,;]'))) {
    final t = raw.replaceAll(' ', '').replaceAll('−', '-').replaceAll('i', 'j');
    if (t.isEmpty) continue;
    final pm = RegExp(r'^([+-]?[\d.]+(?:e[+-]?\d+)?)(?:±|\+-|\+/-)([\d.]*)j$').firstMatch(t);
    if (pm != null) {
      final re = double.parse(pm[1]!), im = pm[2]!.isEmpty ? 1.0 : double.parse(pm[2]!);
      out
        ..add(Cplx(re, im))
        ..add(Cplx(re, -im));
      continue;
    }
    final c = RegExp(r'^([+-]?[\d.]+(?:e[+-]?\d+)?)?(?:([+-])([\d.]*)j)?$').firstMatch(t);
    if (c == null || (c[1] == null && c[2] == null)) throw FormatException('Not a root: $raw');
    final re = c[1] == null ? 0.0 : double.parse(c[1]!);
    final im = c[2] == null ? 0.0 : (c[3]!.isEmpty ? 1.0 : double.parse(c[3]!)) * (c[2] == '-' ? -1 : 1);
    out.add(Cplx(re, im));
    if (im != 0 && !out.any((x) => x.re == re && x.im == -im)) out.add(Cplx(re, -im));
  }
  return out;
}

/// Roots as text, conjugate pairs as one "a±bj".
String rootsText(List<Cplx> roots) {
  final parts = <String>[];
  final used = <int>{};
  for (var i = 0; i < roots.length; i++) {
    if (used.contains(i)) continue;
    final r = roots[i];
    final j = r.im == 0 ? -1 : roots.indexWhere((x) => x.re == r.re && x.im == -r.im);
    if (j > i && !used.contains(j)) {
      used.add(j);
      parts.add('${Cplx(r.re)}±${Cplx(r.im.abs())}j');
    } else {
      parts.add('$r');
    }
  }
  return parts.join(', ');
}

enum BodeMode { standard, polesZeros }

enum FilterKind { lowPass1, highPass1, lowPass2, highPass2, bandPass2 }

/// One point of a Bode sweep: angular frequency (rad/s), magnitude (dB) and phase (degrees),
/// actual and asymptotic.
typedef BodePoint = ({double w, double db, double phase, double asymDb, double asymPhase});

/// A Bode plot of H(s) = K·Π(s − zᵢ)/Π(s − pᵢ): either a standard filter (first-order low or high
/// pass, second-order low, high or band pass with corner [fc] Hz and damping [zeta]; its gain [k]
/// in the pass band, the axis in Hz), or poles and zeros entered in rad/s with leading
/// coefficient [k] (the axis in rad/s).
class BodePanel {
  const BodePanel({
    this.title = 'Bode plot',
    this.mode = BodeMode.standard,
    this.filter = FilterKind.lowPass1,
    this.fc = 1000,
    this.zeta = 0.707,
    this.k = 1,
    this.zeros = const [],
    this.poles = const [Cplx(-10)],
    this.showAsymptotes = true,
  });

  factory BodePanel.fromJson(Map<String, Object?> j) {
    List<Cplx> roots(Object? v) => [
      for (final r in _l(v))
        if (r is List && r.length >= 2) Cplx(_d(r[0]), _d(r[1])),
    ];
    return BodePanel(
      title: _s(j['t'], 'Bode plot'),
      mode: BodeMode.values.asNameMap()[j['mode']] ?? BodeMode.standard,
      filter: FilterKind.values.asNameMap()[j['f']] ?? FilterKind.lowPass1,
      fc: math.max(1e-6, _d(j['fc'], 1000)),
      zeta: _d(j['z'], 0.707).clamp(0.001, 10.0),
      k: _d(j['k'], 1) == 0 ? 1 : _d(j['k'], 1),
      zeros: roots(j['zeros']),
      poles: roots(j['poles']),
      showAsymptotes: _b(j['asym'], true),
    );
  }

  Map<String, Object?> toJson() => {
    't': title,
    'mode': mode.name,
    'f': filter.name,
    'fc': _r(fc),
    'z': _r(zeta),
    'k': _r(k),
    'zeros': [for (final z in zeros) [_r(z.re), _r(z.im)]],
    'poles': [for (final p in poles) [_r(p.re), _r(p.im)]],
    'asym': showAsymptotes,
  };

  final String title;
  final BodeMode mode;
  final FilterKind filter;
  final double fc, zeta, k;
  final List<Cplx> zeros, poles;
  final bool showAsymptotes;

  BodePanel copyWith({String? title, BodeMode? mode, FilterKind? filter, double? fc, double? zeta, double? k, List<Cplx>? zeros, List<Cplx>? poles, bool? showAsymptotes}) => BodePanel(
    title: title ?? this.title,
    mode: mode ?? this.mode,
    filter: filter ?? this.filter,
    fc: fc ?? this.fc,
    zeta: zeta ?? this.zeta,
    k: k ?? this.k,
    zeros: zeros ?? this.zeros,
    poles: poles ?? this.poles,
    showAsymptotes: showAsymptotes ?? this.showAsymptotes,
  );

  /// Whether the axis is in Hz (the standard filters) rather than rad/s.
  bool get hz => mode == BodeMode.standard;

  /// The transfer function as leading coefficient, zeros and poles (rad/s).
  ({double gain, List<Cplx> zeros, List<Cplx> poles}) get tf {
    if (mode == BodeMode.polesZeros) return (gain: k, zeros: zeros, poles: poles);
    final wc = 2 * math.pi * fc;
    List<Cplx> quadratic() {
      // s² + 2ζωc·s + ωc² = 0.
      final disc = zeta * zeta - 1;
      if (disc < 0) return [Cplx(-zeta * wc, wc * math.sqrt(-disc)), Cplx(-zeta * wc, -wc * math.sqrt(-disc))];
      final r = math.sqrt(disc);
      return [Cplx(-wc * (zeta - r)), Cplx(-wc * (zeta + r))];
    }

    return switch (filter) {
      FilterKind.lowPass1 => (gain: k * wc, zeros: const [], poles: [Cplx(-wc)]),
      FilterKind.highPass1 => (gain: k, zeros: const [Cplx(0)], poles: [Cplx(-wc)]),
      FilterKind.lowPass2 => (gain: k * wc * wc, zeros: const [], poles: quadratic()),
      FilterKind.highPass2 => (gain: k, zeros: const [Cplx(0), Cplx(0)], poles: quadratic()),
      FilterKind.bandPass2 => (gain: k * 2 * zeta * wc, zeros: const [Cplx(0)], poles: quadratic()),
    };
  }

  /// H(jω).
  Cplx h(double w) {
    final t = tf;
    final s = Cplx(0, w);
    var out = Cplx(t.gain);
    for (final z in t.zeros) {
      out = out * (s - z);
    }
    for (final p in t.poles) {
      out = out / (s - p);
    }
    return out;
  }

  /// |H(jω)| in dB.
  double magDb(double w) {
    final t = tf;
    final s = Cplx(0, w);
    var db = 20 * math.log(t.gain.abs()) / math.ln10;
    for (final z in t.zeros) {
      db += 20 * math.log((s - z).abs) / math.ln10;
    }
    for (final p in t.poles) {
      db -= 20 * math.log((s - p).abs) / math.ln10;
    }
    return db;
  }

  /// The phase of H(jω) in degrees, each factor's angle added (so it does not jump at ±180°).
  double phaseDeg(double w) {
    final t = tf;
    final s = Cplx(0, w);
    var ph = t.gain < 0 ? -math.pi : 0.0;
    for (final z in t.zeros) {
      ph += (s - z).arg;
    }
    for (final p in t.poles) {
      ph -= (s - p).arg;
    }
    return ph * 180 / math.pi;
  }

  /// The straight-line magnitude: the low-frequency gain, then ±20 dB/decade at each corner.
  double asymDb(double w) {
    final t = tf;
    var k0 = t.gain.abs();
    var origin = 0;
    for (final z in t.zeros) {
      if (z.isZero) {
        origin++;
      } else {
        k0 *= z.abs;
      }
    }
    for (final p in t.poles) {
      if (p.isZero) {
        origin--;
      } else {
        k0 /= p.abs;
      }
    }
    double lg(double x) => math.log(x) / math.ln10;
    var db = 20 * lg(k0) + 20 * origin * lg(w);
    for (final z in t.zeros) {
      if (!z.isZero && w > z.abs) db += 20 * lg(w / z.abs);
    }
    for (final p in t.poles) {
      if (!p.isZero && w > p.abs) db -= 20 * lg(w / p.abs);
    }
    return db;
  }

  /// The straight-line phase: each corner's angle changes linearly over the two decades around it.
  double asymPhase(double w) {
    final t = tf;
    double part(Cplx r) {
      if (r.isZero) return 90;
      final start = Cplx(-r.re, -r.im).arg * 180 / math.pi;
      final x = math.log(w / r.abs) / math.ln10;
      if (x <= -1) return start;
      if (x >= 1) return 90;
      return start + (90 - start) * (x + 1) / 2;
    }

    var ph = t.gain < 0 ? -180.0 : 0.0;
    for (final z in t.zeros) {
      ph += part(z);
    }
    for (final p in t.poles) {
      ph -= part(p);
    }
    return ph;
  }

  /// The corner frequencies (rad/s) of the poles and zeros off the origin.
  List<double> get corners {
    final t = tf;
    return {for (final r in [...t.zeros, ...t.poles]) if (!r.isZero) r.abs}.toList()..sort();
  }

  /// The sweep's range (rad/s): a decade either side of the corners (two decades at least).
  (double, double) get range {
    final c = corners;
    double lg(double x) => math.log(x) / math.ln10;
    if (c.isEmpty) return (0.1, 1000);
    var lo = lg(c.first).floorToDouble() - 1, hi = lg(c.last).ceilToDouble() + 1;
    if (hi - lo < 3) hi = lo + 3;
    return (math.pow(10, lo).toDouble(), math.pow(10, hi).toDouble());
  }

  List<BodePoint> sweep({int points = 300}) {
    final (lo, hi) = range;
    final a = math.log(lo), b = math.log(hi);
    return [
      for (var i = 0; i < points; i++)
        () {
          final w = math.exp(a + (b - a) * i / (points - 1));
          return (w: w, db: magDb(w), phase: phaseDeg(w), asymDb: asymDb(w), asymPhase: asymPhase(w));
        }(),
    ];
  }

  /// The text of H(s), e.g. "H(s) = 6283/(s + 6283)".
  String get formula {
    final t = tf;
    String factor(Cplx r) => r.isZero ? 's' : (r.im == 0 ? '(s ${r.re < 0 ? '+' : '−'} ${Cplx(r.re.abs())})' : '(s − ($r))');
    final num = t.zeros.isEmpty ? '' : t.zeros.map(factor).join('');
    final den = t.poles.isEmpty ? '1' : t.poles.map(factor).join('');
    final g = Cplx(_r(t.gain, 4)).toString();
    return 'H(s) = ${num.isEmpty ? g : '${t.gain == 1 ? '' : g}$num'}/$den';
  }
}
