import 'dart:math' as math;

// The figures behind the electrical engineering panels (KitElement): a series or parallel RLC
// circuit worked out at one frequency (impedance, phase angle, current, power factor, the P-Q-S
// power triangle, resonance, Q factor and the frequency response) with its phasors; balanced
// three-phase phasors for a star or delta load (line and phase values); a single-line power
// diagram with every element on a common per-unit base and the symmetrical three-phase fault
// level at a bus (a teaching model); and a waveform generator (sine, square, triangle, sawtooth,
// PWM; two superposed) with RMS, average, peak, form and crest factors and Fourier series terms.
// Pure Dart, read from and written to the panel's JSON. SI units: Ω, H, F, Hz, V, A, W.

double _d(Object? v, [double fallback = 0]) => v is num ? v.toDouble() : (v is String ? double.tryParse(v) ?? fallback : fallback);
String _s(Object? v, [String fallback = '']) => v is String ? v : fallback;
bool _b(Object? v, [bool fallback = false]) => v is bool ? v : fallback;
int _i(Object? v, [int fallback = 0]) => v is num ? v.round() : fallback;
List<Object?> _l(Object? v) => v is List ? v : const [];
Map<Object?, Object?> _m(Object? v) => v is Map ? v : const {};
/// [v] kept to [sig] significant figures for the page's JSON.
double _r(double v, [int sig = 8]) => v.isFinite ? double.parse(v.toStringAsPrecision(sig)) : 0;

const _deg = 180 / math.pi;

/// A phasor to draw: [label], its length [mag] (V or A) and [angle] in degrees (counter-clockwise
/// from the reference), and which [kind] of quantity it is (voltages and currents have their own
/// scales).
typedef Phasor = ({String label, double mag, double angle, bool current});

// --- RLC circuits -----------------------------------------------------------------------------

enum RlcTopology { series, parallel }

/// A series or parallel RLC circuit on a sinusoidal supply of [v] volts RMS at [f] hertz. An
/// element of zero value is left out ([l] = 0 or [c] = 0: an RC or RL circuit). [wt] turns the
/// phasor diagram (degrees; the editor runs it to animate the phasors).
class RlcCircuit {
  const RlcCircuit({
    this.title = 'Series RLC circuit',
    this.topology = RlcTopology.series,
    this.r = 10,
    this.l = 0.1,
    this.c = 100e-6,
    this.f = 50,
    this.v = 230,
    this.wt = 0,
    this.showResponse = true,
    this.showTriangle = true,
  });

  factory RlcCircuit.fromJson(Map<String, Object?> j) => RlcCircuit(
    title: _s(j['t'], 'RLC circuit'),
    topology: RlcTopology.values.asNameMap()[j['top']] ?? RlcTopology.series,
    r: math.max(0, _d(j['r'], 10)),
    l: math.max(0, _d(j['l'], 0.1)),
    c: math.max(0, _d(j['c'], 100e-6)),
    f: math.max(0, _d(j['f'], 50)),
    v: math.max(0, _d(j['v'], 230)),
    wt: _d(j['wt']),
    showResponse: _b(j['resp'], true),
    showTriangle: _b(j['tri'], true),
  );

  final String title;
  final RlcTopology topology;

  /// Ω, H, F, Hz and V RMS.
  final double r, l, c, f, v;
  final double wt;
  final bool showResponse, showTriangle;

  bool get hasL => l > 0;
  bool get hasC => c > 0;

  RlcCircuit copyWith({String? title, RlcTopology? topology, double? r, double? l, double? c, double? f, double? v, double? wt, bool? showResponse, bool? showTriangle}) => RlcCircuit(
    title: title ?? this.title,
    topology: topology ?? this.topology,
    r: r ?? this.r,
    l: l ?? this.l,
    c: c ?? this.c,
    f: f ?? this.f,
    v: v ?? this.v,
    wt: wt ?? this.wt,
    showResponse: showResponse ?? this.showResponse,
    showTriangle: showTriangle ?? this.showTriangle,
  );

  Map<String, Object?> toJson() => {
    't': title,
    'top': topology.name,
    'r': _r(r),
    'l': _r(l),
    'c': _r(c),
    'f': _r(f),
    'v': _r(v),
    'wt': _r(wt % 360, 4),
    'resp': showResponse,
    'tri': showTriangle,
  };

  /// The resonant frequency 1/(2π√LC), or null without both L and C.
  double? get resonance => hasL && hasC ? 1 / (2 * math.pi * math.sqrt(l * c)) : null;

  /// The quality factor at resonance: (1/R)√(L/C) in series, R√(C/L) in parallel.
  double? get qFactor {
    if (!hasL || !hasC || r <= 0) return null;
    return topology == RlcTopology.series ? math.sqrt(l / c) / r : r * math.sqrt(c / l);
  }

  /// The half-power bandwidth f₀/Q (Hz).
  double? get bandwidth {
    final f0 = resonance, q = qFactor;
    return f0 == null || q == null || q == 0 ? null : f0 / q;
  }

  /// The impedance at [freq] as (R, X): resistance and reactance (positive: inductive).
  (double, double) impedanceAt(double freq) {
    final w = 2 * math.pi * freq;
    if (topology == RlcTopology.series) {
      final xl = hasL ? w * l : 0.0;
      final xc = hasC ? (w == 0 ? double.infinity : 1 / (w * c)) : 0.0;
      return (r, xl - xc);
    }
    // Parallel: Y = G + jB with B = ωC − 1/(ωL); Z = 1/Y.
    final g = r > 0 ? 1 / r : 0.0;
    final bc = hasC ? w * c : 0.0;
    final bl = hasL ? (w == 0 ? double.infinity : 1 / (w * l)) : 0.0;
    final b = bc - bl;
    if (!b.isFinite) return (0, 0); // a short through L at DC
    final y2 = g * g + b * b;
    if (y2 == 0) return (double.infinity, 0);
    return (g / y2, -b / y2);
  }

  /// The curve the frequency response draws: the current V/|Z| for a series circuit (it peaks at
  /// resonance), |Z| for a parallel one (it peaks there too).
  double responseAt(double freq) {
    final (zr, zx) = impedanceAt(freq);
    final z = math.sqrt(zr * zr + zx * zx);
    return topology == RlcTopology.series ? (z == 0 ? double.infinity : v / z) : z;
  }

  RlcResult solve() {
    final w = 2 * math.pi * f;
    final xl = hasL ? w * l : 0.0;
    final xc = hasC && w > 0 ? 1 / (w * c) : (hasC ? double.infinity : 0.0);
    final (zr, zx) = impedanceAt(f);
    final z = math.sqrt(zr * zr + zx * zx);
    final phi = math.atan2(zx, zr) * _deg; // + : current lags (inductive)
    final i = z == 0 ? double.infinity : v / z;
    final pf = z == 0 ? 1.0 : zr / z;
    final p = v * i * pf, s = v * i;
    final q = v * i * math.sin(phi / _deg);
    final List<Phasor> phasors;
    if (topology == RlcTopology.series) {
      // The current is common: the reference. V_R with it, V_L 90° ahead, V_C 90° behind.
      phasors = [
        (label: 'I', mag: i, angle: wt, current: true),
        (label: 'V_R', mag: i * r, angle: wt, current: false),
        if (hasL) (label: 'V_L', mag: i * xl, angle: wt + 90, current: false),
        if (hasC) (label: 'V_C', mag: i * xc, angle: wt - 90, current: false),
        (label: 'V', mag: v, angle: wt + phi, current: false),
      ];
    } else {
      // The voltage is common: the reference. I_R with it, I_C 90° ahead, I_L 90° behind.
      phasors = [
        (label: 'V', mag: v, angle: wt, current: false),
        if (r > 0) (label: 'I_R', mag: v / r, angle: wt, current: true),
        if (hasL) (label: 'I_L', mag: xl == 0 ? double.infinity : v / xl, angle: wt - 90, current: true),
        if (hasC) (label: 'I_C', mag: xc.isInfinite ? 0 : v / xc, angle: wt + 90, current: true),
        (label: 'I', mag: i, angle: wt - phi, current: true),
      ];
    }
    return RlcResult(xl: xl, xc: xc, r: zr, x: zx, z: z, phi: phi, i: i, pf: pf, p: p, q: q, s: s, phasors: phasors);
  }
}

class RlcResult {
  const RlcResult({required this.xl, required this.xc, required this.r, required this.x, required this.z, required this.phi, required this.i, required this.pf, required this.p, required this.q, required this.s, required this.phasors});

  /// X_L and X_C (Ω), the equivalent R + jX and |Z| (Ω).
  final double xl, xc, r, x, z;

  /// The impedance angle in degrees: positive when the current lags (inductive).
  final double phi;

  /// The supply current (A RMS) and the power factor cos φ.
  final double i, pf;

  /// Real (W), reactive (var; positive drawn by an inductive load) and apparent (VA) power.
  final double p, q, s;
  final List<Phasor> phasors;

  bool get lagging => phi > 1e-9;
  bool get leading => phi < -1e-9;
  bool get ok => z.isFinite && i.isFinite;
}

// --- Three-phase ------------------------------------------------------------------------------

enum ThreePhaseConnection { star, delta }

/// A balanced three-phase load on a [vLine] volt (line-to-line, RMS) supply, each phase of
/// impedance [zPhase] Ω at a power-factor angle [phi] (degrees, positive lagging). Phase
/// sequence RYB (abc), R-phase voltage the reference.
class ThreePhase {
  const ThreePhase({this.title = 'Three-phase star load', this.connection = ThreePhaseConnection.star, this.vLine = 415, this.zPhase = 10, this.phi = 36.87, this.wt = 0, this.showLine = true});

  factory ThreePhase.fromJson(Map<String, Object?> j) => ThreePhase(
    title: _s(j['t'], 'Three-phase load'),
    connection: ThreePhaseConnection.values.asNameMap()[j['conn']] ?? ThreePhaseConnection.star,
    vLine: math.max(0, _d(j['vl'], 415)),
    zPhase: math.max(1e-6, _d(j['z'], 10)),
    phi: _d(j['phi'], 36.87).clamp(-90, 90).toDouble(),
    wt: _d(j['wt']),
    showLine: _b(j['line'], true),
  );

  final String title;
  final ThreePhaseConnection connection;
  final double vLine, zPhase, phi, wt;

  /// Whether the diagram also draws the line voltages (star) or line currents (delta).
  final bool showLine;

  bool get star => connection == ThreePhaseConnection.star;

  /// Phase voltage: V_L/√3 in star, V_L in delta.
  double get vPhase => star ? vLine / math.sqrt(3) : vLine;
  double get iPhase => vPhase / zPhase;

  /// Line current: I_ph in star, √3·I_ph in delta.
  double get iLine => star ? iPhase : math.sqrt(3) * iPhase;
  double get pf => math.cos(phi / _deg);

  /// √3·V_L·I_L·cos φ (= 3·V_ph·I_ph·cos φ).
  double get power => math.sqrt(3) * vLine * iLine * pf;
  double get reactive => math.sqrt(3) * vLine * iLine * math.sin(phi / _deg);
  double get apparent => math.sqrt(3) * vLine * iLine;

  ThreePhase copyWith({String? title, ThreePhaseConnection? connection, double? vLine, double? zPhase, double? phi, double? wt, bool? showLine}) => ThreePhase(
    title: title ?? this.title,
    connection: connection ?? this.connection,
    vLine: vLine ?? this.vLine,
    zPhase: zPhase ?? this.zPhase,
    phi: phi ?? this.phi,
    wt: wt ?? this.wt,
    showLine: showLine ?? this.showLine,
  );

  Map<String, Object?> toJson() => {'t': title, 'conn': connection.name, 'vl': _r(vLine), 'z': _r(zPhase), 'phi': _r(phi), 'wt': _r(wt % 360, 4), 'line': showLine};

  /// Phase voltages V_R, V_Y, V_B (0°, −120°, +120° from [wt]); phase currents lagging them by φ;
  /// with [showLine] the line voltages (star: V_RY 30° ahead of V_R, √3 times) or line currents
  /// (delta: I_R 30° behind I_RY, √3 times).
  List<Phasor> phasors() {
    const names = ['R', 'Y', 'B'];
    final out = <Phasor>[];
    for (var k = 0; k < 3; k++) {
      final a = wt - 120.0 * k;
      final n = names[k], m = names[(k + 1) % 3];
      if (star) {
        out.add((label: 'V_$n', mag: vPhase, angle: a, current: false));
        out.add((label: 'I_$n', mag: iPhase, angle: a - phi, current: true));
        if (showLine) out.add((label: 'V_$n$m', mag: vLine, angle: a + 30, current: false));
      } else {
        // In delta the phase voltage V_RY is the line voltage, the reference.
        out.add((label: 'V_$n$m', mag: vPhase, angle: a, current: false));
        out.add((label: 'I_$n$m', mag: iPhase, angle: a - phi, current: true));
        if (showLine) out.add((label: 'I_$n', mag: iLine, angle: a - phi - 30, current: true));
      }
    }
    return out;
  }
}

// --- Per unit and the single-line diagram -----------------------------------------------------

/// Changes a per-unit impedance from one base to another:
/// Z_new = Z_old · (kV_old / kV_new)² · (MVA_new / MVA_old).
double perUnitChange(double zOld, {required double mvaOld, required double kvOld, required double mvaNew, required double kvNew}) =>
    mvaOld <= 0 || kvNew <= 0 ? double.nan : zOld * math.pow(kvOld / kvNew, 2) * (mvaNew / mvaOld);

/// An impedance in ohms as per unit: Z_pu = Z_Ω · MVA_base / kV_base².
double ohmsToPerUnit(double ohms, {required double mvaBase, required double kvBase}) => kvBase <= 0 ? double.nan : ohms * mvaBase / (kvBase * kvBase);

/// The base current in kA: MVA / (√3 · kV).
double baseCurrentKa(double mva, double kv) => kv <= 0 ? double.nan : mva / (math.sqrt(3) * kv);

enum SldKind { generator, transformer, line, load, motor, breaker, isolator }

/// Elements joined between two buses; the others hang from one.
bool sldSeries(SldKind k) => k == SldKind.transformer || k == SldKind.line || k == SldKind.breaker || k == SldKind.isolator;

/// A bus bar: its [name], voltage [kv] (its base kV) and where it stands across the diagram, [x]
/// from 0 (left) to 1 (right).
class SldBus {
  const SldBus(this.name, {required this.kv, required this.x});
  factory SldBus.fromJson(Object? j) {
    final m = _m(j);
    return SldBus(_s(m['n'], 'Bus'), kv: math.max(0.001, _d(m['kv'], 11)), x: _d(m['x'], 0.5).clamp(0, 1).toDouble());
  }
  final String name;
  final double kv, x;

  SldBus copyWith({String? name, double? kv, double? x}) => SldBus(name ?? this.name, kv: kv ?? this.kv, x: x ?? this.x);
  Map<String, Object?> toJson() => {'n': name, 'kv': _r(kv), 'x': _r(x, 4)};
}

/// One element of the diagram. A series element ([sldSeries]) joins buses [a] and [b]; the
/// others hang from bus [a] on [side] (−1 left, +1 right). [y] is its height along the bus bars
/// (0 top to 1 bottom). Generators, transformers and motors give their reactance [x] in per unit
/// on their own rating ([mva], [kv]); a line gives [ohms] (its reactance); breakers and isolators
/// are [closed] or open. Series elements between the same two buses are one branch, drawn in a
/// row at the first one's height: a breaker there is in series with the transformer or line.
class SldElement {
  const SldElement(this.kind, this.label, {required this.a, this.b = -1, this.side = -1, this.y = 0.5, this.mva = 100, this.kv = 11, this.x = 0.1, this.ohms = 0, this.closed = true});

  factory SldElement.fromJson(Object? j) {
    final m = _m(j);
    return SldElement(
      SldKind.values.asNameMap()[m['k']] ?? SldKind.load,
      _s(m['l']),
      a: _i(m['a']),
      b: _i(m['b'], -1),
      side: _i(m['s'], -1) < 0 ? -1 : 1,
      y: _d(m['y'], 0.5).clamp(0, 1).toDouble(),
      mva: math.max(0, _d(m['mva'], 100)),
      kv: math.max(0, _d(m['kv'], 11)),
      x: math.max(0, _d(m['x'], 0.1)),
      ohms: math.max(0, _d(m['ohm'])),
      closed: _b(m['on'], true),
    );
  }

  final SldKind kind;
  final String label;
  final int a, b, side;
  final double y, mva, kv, x, ohms;
  final bool closed;

  bool get series => sldSeries(kind);

  SldElement copyWith({SldKind? kind, String? label, int? a, int? b, int? side, double? y, double? mva, double? kv, double? x, double? ohms, bool? closed}) => SldElement(
    kind ?? this.kind,
    label ?? this.label,
    a: a ?? this.a,
    b: b ?? this.b,
    side: side ?? this.side,
    y: y ?? this.y,
    mva: mva ?? this.mva,
    kv: kv ?? this.kv,
    x: x ?? this.x,
    ohms: ohms ?? this.ohms,
    closed: closed ?? this.closed,
  );

  Map<String, Object?> toJson() => {
    'k': kind.name,
    'l': label,
    'a': a,
    if (series) 'b': b,
    if (!series) 's': side,
    'y': _r(y, 4),
    if (kind == SldKind.generator || kind == SldKind.transformer || kind == SldKind.motor || kind == SldKind.load) 'mva': _r(mva),
    if (kind == SldKind.generator || kind == SldKind.transformer || kind == SldKind.motor) ...{'kv': _r(kv), 'x': _r(x)},
    if (kind == SldKind.line) 'ohm': _r(ohms),
    if (kind == SldKind.breaker || kind == SldKind.isolator) 'on': closed,
  };
}

/// A single-line diagram on a common [baseMva], with the buses' own kV as base kV, and the bus
/// [faultBus] chosen for the fault level (−1 for none).
class SingleLineDiagram {
  const SingleLineDiagram({this.title = 'Single-line diagram', this.baseMva = 100, this.buses = const [], this.elements = const [], this.faultBus = -1, this.prefault = 1});

  factory SingleLineDiagram.fromJson(Map<String, Object?> j) => SingleLineDiagram(
    title: _s(j['t'], 'Single-line diagram'),
    baseMva: math.max(0.001, _d(j['mva'], 100)),
    buses: [for (final b in _l(j['bus'])) SldBus.fromJson(b)],
    elements: [for (final e in _l(j['el'])) SldElement.fromJson(e)],
    faultBus: _i(j['fault'], -1),
    prefault: math.max(0, _d(j['e'], 1)),
  );

  final String title;
  final double baseMva;
  final List<SldBus> buses;
  final List<SldElement> elements;
  final int faultBus;

  /// The pre-fault voltage in per unit (1.0 in the usual teaching model).
  final double prefault;

  SingleLineDiagram copyWith({String? title, double? baseMva, List<SldBus>? buses, List<SldElement>? elements, int? faultBus, double? prefault}) => SingleLineDiagram(
    title: title ?? this.title,
    baseMva: baseMva ?? this.baseMva,
    buses: buses ?? this.buses,
    elements: elements ?? this.elements,
    faultBus: faultBus ?? this.faultBus,
    prefault: prefault ?? this.prefault,
  );

  Map<String, Object?> toJson() => {
    't': title,
    'mva': _r(baseMva),
    'bus': [for (final b in buses) b.toJson()],
    'el': [for (final e in elements) e.toJson()],
    'fault': faultBus,
    'e': _r(prefault),
  };

  bool _valid(int i) => i >= 0 && i < buses.length;

  /// Element [e]'s reactance in per unit on the common base (NaN when it has none: loads,
  /// breakers and isolators). A generator, motor or transformer is changed from its own rating
  /// to the base MVA and the kV of the bus it stands on; a line's ohms use its buses' kV.
  double perUnit(SldElement e) {
    if (!_valid(e.a)) return double.nan;
    final kvBus = buses[e.a].kv;
    return switch (e.kind) {
      SldKind.generator || SldKind.motor || SldKind.transformer => perUnitChange(e.x, mvaOld: e.mva, kvOld: e.kv <= 0 ? kvBus : e.kv, mvaNew: baseMva, kvNew: kvBus),
      SldKind.line => ohmsToPerUnit(e.ohms, mvaBase: baseMva, kvBase: kvBus),
      _ => double.nan,
    };
  }

  /// The symmetrical three-phase fault at [bus] (default [faultBus]): the Thevenin reactance there
  /// (sources behind their reactances to neutral, transformers and lines in series, an open
  /// breaker or isolator cutting its branch, loads and resistance left out), the fault MVA
  /// (E·MVA_base / X_th) and the fault current in kA. Null when no source reaches the bus.
  SldFault? fault([int? bus]) {
    final k = bus ?? faultBus;
    if (!_valid(k)) return null;
    final n = buses.length;
    // Breakers and isolators sit in the branch between their two buses: an open one cuts every
    // element of that branch; closed ones on a branch with nothing else are a bus coupler (the
    // two buses are one node).
    int pairKey(SldElement e) => math.min(e.a, e.b) * 4096 + math.max(e.a, e.b);
    bool isSwitch(SldElement e) => e.kind == SldKind.breaker || e.kind == SldKind.isolator;
    final open = <int>{}, hasImpedance = <int>{}, coupled = <int>{};
    for (final e in elements) {
      if (!e.series || !_valid(e.a) || !_valid(e.b)) continue;
      if (isSwitch(e)) {
        (e.closed ? coupled : open).add(pairKey(e));
      } else {
        hasImpedance.add(pairKey(e));
      }
    }
    final parent = List<int>.generate(n, (i) => i);
    int find(int i) => parent[i] == i ? i : (parent[i] = find(parent[i]));
    for (final e in elements) {
      final key = e.series && _valid(e.a) && _valid(e.b) ? pairKey(e) : -1;
      if (isSwitch(e) && key >= 0 && coupled.contains(key) && !open.contains(key) && !hasImpedance.contains(key)) parent[find(e.a)] = find(e.b);
    }
    final roots = <int>{for (var i = 0; i < n; i++) find(i)}.toList();
    final node = {for (final (i, r) in roots.indexed) r: i};
    final m = roots.length;
    // The susceptance matrix B (1/X), real since everything is a reactance.
    final y = List.generate(m, (_) => List<double>.filled(m, 0));
    var sources = false;
    for (final e in elements) {
      if (!_valid(e.a)) continue;
      final x = perUnit(e);
      if (!(x > 0)) continue;
      final i = node[find(e.a)]!;
      if (e.kind == SldKind.generator || e.kind == SldKind.motor) {
        y[i][i] += 1 / x;
        sources = true;
      } else if (_valid(e.b)) {
        if (open.contains(pairKey(e))) continue;
        final j = node[find(e.b)]!;
        if (i == j) continue;
        y[i][i] += 1 / x;
        y[j][j] += 1 / x;
        y[i][j] -= 1 / x;
        y[j][i] -= 1 / x;
      }
    }
    if (!sources) return null;
    // Z_kk of the bus impedance matrix: solve Y·z = e_k for the islands that hold a source.
    final kk = node[find(k)]!;
    final z = _solve(y, kk);
    if (z == null || !(z > 0) || !z.isFinite) return null;
    final mva = prefault * baseMva / z;
    return SldFault(bus: k, xth: z, mva: mva, ka: prefault / z * baseCurrentKa(baseMva, buses[k].kv));
  }

  /// The diagonal entry [k] of Y⁻¹ by Gaussian elimination over the buses joined to [k] (other
  /// islands are left out). Null when no source reaches [k] (its island's matrix is singular).
  static double? _solve(List<List<double>> y, int k) {
    final seen = <int>{k}, todo = [k];
    while (todo.isNotEmpty) {
      final i = todo.removeLast();
      for (var j = 0; j < y.length; j++) {
        if (j != i && y[i][j].abs() > 1e-12 && seen.add(j)) todo.add(j);
      }
    }
    final live = seen.toList()..sort();
    if (y[k][k].abs() < 1e-12) return null;
    final n = live.length;
    final a = [for (final i in live) [for (final j in live) y[i][j], if (i == k) 1.0 else 0.0]];
    for (var c = 0; c < n; c++) {
      var p = c;
      for (var r = c + 1; r < n; r++) {
        if (a[r][c].abs() > a[p][c].abs()) p = r;
      }
      if (a[p][c].abs() < 1e-12) return null; // an island with no source: singular
      final t = a[c];
      a[c] = a[p];
      a[p] = t;
      for (var r = 0; r < n; r++) {
        if (r == c) continue;
        final f = a[r][c] / a[c][c];
        if (f == 0) continue;
        for (var j = c; j <= n; j++) {
          a[r][j] -= f * a[c][j];
        }
      }
    }
    final row = live.indexOf(k);
    return a[row][n] / a[row][row];
  }

  /// The series elements of the branch between [e]'s two buses, in order: [e]'s place among
  /// them and how many there are (for drawing them in a row).
  (int, int, double) branchSlot(SldElement e) {
    var k = 0, count = 0;
    double? lane;
    for (final x in elements) {
      if (!x.series || {x.a, x.b}.difference({e.a, e.b}).isNotEmpty || x.a == x.b) continue;
      lane ??= x.y;
      if (identical(x, e)) k = count;
      count++;
    }
    return (k, math.max(1, count), lane ?? e.y);
  }

  /// The nearest bus to [x] (0..1 across the diagram), for snapping.
  int nearestBus(double x) {
    var best = -1;
    var d = double.infinity;
    for (final (i, b) in buses.indexed) {
      if ((b.x - x).abs() < d) {
        d = (b.x - x).abs();
        best = i;
      }
    }
    return best;
  }

  /// The two buses either side of [x], left one first, for snapping a series element; null with
  /// fewer than two buses.
  (int, int)? busesAround(double x) {
    if (buses.length < 2) return null;
    final order = [for (var i = 0; i < buses.length; i++) i]..sort((p, q) => buses[p].x.compareTo(buses[q].x));
    for (var k = 0; k < order.length - 1; k++) {
      if (x <= buses[order[k + 1]].x || k == order.length - 2) return (order[k], order[k + 1]);
    }
    return (order[0], order[1]);
  }
}

class SldFault {
  const SldFault({required this.bus, required this.xth, required this.mva, required this.ka});
  final int bus;

  /// Thevenin reactance (pu), fault level (MVA) and fault current (kA).
  final double xth, mva, ka;
}

// --- Waveforms --------------------------------------------------------------------------------

enum WaveKind { sine, square, triangle, sawtooth, pwm }

/// One periodic wave: [amplitude] (peak, V), [freq] (Hz), [phase] (degrees), [offset] (DC, V)
/// and, for PWM, the [duty] (0..1, the fraction of each period it is high). Square, triangle and
/// sawtooth swing ±amplitude; PWM goes between 0 and amplitude.
class Wave {
  const Wave({this.kind = WaveKind.sine, this.amplitude = 1, this.freq = 50, this.phase = 0, this.offset = 0, this.duty = 0.5});

  factory Wave.fromJson(Object? j) {
    final m = _m(j);
    return Wave(
      kind: WaveKind.values.asNameMap()[m['k']] ?? WaveKind.sine,
      amplitude: _d(m['a'], 1),
      freq: math.max(0, _d(m['f'], 50)),
      phase: _d(m['p']),
      offset: _d(m['o']),
      duty: _d(m['d'], 0.5).clamp(0, 1).toDouble(),
    );
  }

  final WaveKind kind;
  final double amplitude, freq, phase, offset, duty;

  Wave copyWith({WaveKind? kind, double? amplitude, double? freq, double? phase, double? offset, double? duty}) => Wave(
    kind: kind ?? this.kind,
    amplitude: amplitude ?? this.amplitude,
    freq: freq ?? this.freq,
    phase: phase ?? this.phase,
    offset: offset ?? this.offset,
    duty: duty ?? this.duty,
  );

  Map<String, Object?> toJson() => {'k': kind.name, 'a': _r(amplitude), 'f': _r(freq), 'p': _r(phase), 'o': _r(offset), if (kind == WaveKind.pwm) 'd': _r(duty)};

  /// Its value at time [t] seconds.
  double at(double t) => offset + shape(2 * math.pi * freq * t + phase / _deg);

  /// The wave without its offset at phase angle [theta] (radians).
  double shape(double theta) {
    final a = amplitude;
    final u = _frac(theta / (2 * math.pi));
    return switch (kind) {
      WaveKind.sine => a * math.sin(theta),
      WaveKind.square => u < 0.5 ? a : -a,
      WaveKind.triangle => a * (u < 0.25 ? 4 * u : (u < 0.75 ? 2 - 4 * u : 4 * u - 4)),
      WaveKind.sawtooth => a * (2 * _frac(u + 0.5) - 1),
      WaveKind.pwm => u < duty ? a : 0,
    };
  }

  /// The Fourier series terms of the wave (without its offset) up to harmonic [n]: for each
  /// harmonic h, the sine and cosine coefficients b_h, a_h of a·cos(hθ) + b·sin(hθ) with θ the
  /// wave's own phase angle; [dc] is its mean (PWM: D·A).
  ({double dc, List<({int h, double a, double b})> terms}) fourier(int n) {
    final a = amplitude;
    final terms = <({int h, double a, double b})>[];
    var dc = 0.0;
    for (var h = 1; h <= n; h++) {
      switch (kind) {
        case WaveKind.sine:
          if (h == 1) terms.add((h: 1, a: 0, b: a));
        case WaveKind.square:
          // 4A/(hπ) for odd h.
          if (h.isOdd) terms.add((h: h, a: 0, b: 4 * a / (h * math.pi)));
        case WaveKind.triangle:
          // 8A/(π²h²), alternating in sign, odd h.
          if (h.isOdd) terms.add((h: h, a: 0, b: (((h - 1) ~/ 2).isEven ? 1 : -1) * 8 * a / (math.pi * math.pi * h * h)));
        case WaveKind.sawtooth:
          // 2A/(hπ), alternating in sign, every h.
          terms.add((h: h, a: 0, b: (h.isOdd ? 1 : -1) * 2 * a / (h * math.pi)));
        case WaveKind.pwm:
          // a_h = A/(hπ)·sin 2πhD, b_h = A/(hπ)·(1 − cos 2πhD).
          final k = a / (h * math.pi);
          terms.add((h: h, a: k * math.sin(2 * math.pi * h * duty), b: k * (1 - math.cos(2 * math.pi * h * duty))));
      }
    }
    if (kind == WaveKind.pwm) dc = a * duty;
    return (dc: dc, terms: terms);
  }

  /// The textbook values of the wave alone (offset taken into account by sampling only):
  /// RMS, the average over a half cycle (the mean of |x|), peak, form factor (RMS / average)
  /// and crest (peak) factor (peak / RMS). For offset 0.
  WaveStats get ideal {
    final a = amplitude.abs();
    final d = duty;
    return switch (kind) {
      WaveKind.sine => WaveStats(rms: a / math.sqrt2, mean: 0, average: 2 * a / math.pi, peak: a),
      WaveKind.square => WaveStats(rms: a, mean: 0, average: a, peak: a),
      WaveKind.triangle || WaveKind.sawtooth => WaveStats(rms: a / math.sqrt(3), mean: 0, average: a / 2, peak: a),
      WaveKind.pwm => WaveStats(rms: a * math.sqrt(d), mean: a * d, average: a * d, peak: a),
    };
  }
}

double _frac(double x) => x - x.floorToDouble();

class WaveStats {
  const WaveStats({required this.rms, required this.mean, required this.average, required this.peak});

  /// RMS value, the mean (DC) value, the rectified average (mean of |x|) and the peak (max |x|).
  final double rms, mean, average, peak;

  /// RMS / average (sine 1.11); null when the average is zero.
  double? get formFactor => average > 1e-12 ? rms / average : null;

  /// Peak / RMS (sine 1.414).
  double? get crestFactor => rms > 1e-12 ? peak / rms : null;
}

/// A waveform generator panel: wave [a], optionally a second wave [b] added to it, and the
/// harmonics view (the first [terms] Fourier terms of [a] and their sum).
class WaveformPanel {
  const WaveformPanel({this.title = 'Waveform generator', this.a = const Wave(), this.b = const Wave(kind: WaveKind.sine, amplitude: 0.3, freq: 150), this.superpose = false, this.harmonics = false, this.terms = 5, this.cycles = 2});

  factory WaveformPanel.fromJson(Map<String, Object?> j) => WaveformPanel(
    title: _s(j['t'], 'Waveform generator'),
    a: Wave.fromJson(j['a']),
    b: j['b'] == null ? const Wave(kind: WaveKind.sine, amplitude: 0.3, freq: 150) : Wave.fromJson(j['b']),
    superpose: _b(j['sum']),
    harmonics: _b(j['harm']),
    terms: _i(j['n'], 5).clamp(1, 49),
    cycles: _d(j['cyc'], 2).clamp(0.5, 20).toDouble(),
  );

  final String title;
  final Wave a, b;
  final bool superpose, harmonics;

  /// How many Fourier terms (harmonics) the harmonics view adds up.
  final int terms;

  /// How many cycles of wave [a] the plot shows.
  final double cycles;

  WaveformPanel copyWith({String? title, Wave? a, Wave? b, bool? superpose, bool? harmonics, int? terms, double? cycles}) => WaveformPanel(
    title: title ?? this.title,
    a: a ?? this.a,
    b: b ?? this.b,
    superpose: superpose ?? this.superpose,
    harmonics: harmonics ?? this.harmonics,
    terms: terms ?? this.terms,
    cycles: cycles ?? this.cycles,
  );

  Map<String, Object?> toJson() => {'t': title, 'a': a.toJson(), 'b': b.toJson(), 'sum': superpose, 'harm': harmonics, 'n': terms, 'cyc': _r(cycles, 4)};

  /// The signal drawn: [a], plus [b] when superposed.
  double at(double t) => a.at(t) + (superpose ? b.at(t) : 0);

  /// The first [terms] Fourier terms of [a] added up (with its offset) at time [t].
  double partialSum(double t) {
    final theta = 2 * math.pi * a.freq * t + a.phase / _deg;
    final f = a.fourier(terms);
    var s = a.offset + f.dc;
    for (final x in f.terms) {
      s += x.a * math.cos(x.h * theta) + x.b * math.sin(x.h * theta);
    }
    return s;
  }

  /// One whole period of the signal: [a]'s, or with [b] the common period of the two (their
  /// frequencies read to 0.01 Hz), at most 200 of [a]'s periods.
  double get period {
    final fa = a.freq;
    if (fa <= 0) return 1;
    if (!superpose || b.freq <= 0 || b.amplitude == 0 && b.offset == 0) return 1 / fa;
    final p = (fa * 100).round(), q = (b.freq * 100).round();
    if (p == 0 || q == 0) return 1 / fa;
    final g = _gcd(p, q);
    return math.min(100 / g, 200 / fa);
  }

  /// The signal's RMS, mean, rectified average and peak, sampled over one [period].
  WaveStats stats({int samples = 20000}) {
    final t0 = period;
    var sum = 0.0, sq = 0.0, abs = 0.0, peak = 0.0;
    for (var i = 0; i < samples; i++) {
      final x = at(t0 * (i + 0.5) / samples);
      sum += x;
      sq += x * x;
      abs += x.abs();
      peak = math.max(peak, x.abs());
    }
    return WaveStats(rms: math.sqrt(sq / samples), mean: sum / samples, average: abs / samples, peak: peak);
  }
}

int _gcd(int a, int b) => b == 0 ? a.abs() : _gcd(b, a % b);
