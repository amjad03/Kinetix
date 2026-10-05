import 'dart:math' as math;

/// A small circuit simulator by modified nodal analysis (MNA): DC operating
/// point (Newton–Raphson for diodes and transistors), transient (backward
/// Euler, for capacitors, inductors, rectifiers, the 555) and AC (complex
/// phasors, for RLC). SI units throughout: volts, amperes, ohms, farads,
/// henries, seconds, hertz.
///
/// Nodes are named by strings; '0' (or 'gnd') is ground.
///
/// ```dart
/// final c = Circuit()
///   ..add(VSource('V1', 'a', '0', 9))
///   ..add(Resistor('R1', 'a', 'b', 1000))
///   ..add(Resistor('R2', 'b', '0', 2000));
/// c.dc().v('b'); // 6.0
/// ```
class Circuit {
  final parts = <Part>[];
  final _nodes = <String, int>{'0': 0, 'gnd': 0};

  void add(Part p) {
    parts.add(p);
    for (final n in p.terminals) {
      _nodes.putIfAbsent(n, () => _nodes.values.reduce(math.max) + 1);
    }
  }

  void addAll(Iterable<Part> ps) => ps.forEach(add);

  Part? operator [](String id) => parts.where((p) => p.id == id).firstOrNull;

  int get nodeCount => _nodes.values.reduce(math.max);
  int node(String name) => _nodes[name] ?? (throw ArgumentError('no node $name'));
  bool hasNode(String name) => _nodes.containsKey(name);

  /// The DC operating point. [state] carries digital and op-amp states
  /// between solves; [time] is for time-varying sources (their value at t).
  Solution dc({double time = 0}) => _solve(_Mode.dc, time: time);

  /// Steps the circuit from [start] (default: its DC point with capacitors
  /// uncharged, unless [fromDc]) for [duration] seconds in steps of [dt],
  /// calling [sample] after every step.
  List<Solution> transient({required double duration, required double dt, Solution? start, bool fromDc = false, void Function(Solution s)? sample, int keepEvery = 1}) {
    var prev = start ?? (fromDc ? dc() : Solution._zero(this));
    final out = <Solution>[];
    final steps = (duration / dt).round();
    for (var k = 1; k <= steps; k++) {
      final t = k * dt;
      final s = _solve(_Mode.tran, time: t, h: dt, prev: prev);
      for (final p in parts) {
        p._afterStep(s);
      }
      sample?.call(s);
      if (k % keepEvery == 0) out.add(s);
      prev = s;
    }
    return out;
  }

  /// Phasors at [hz] for the linear parts (sources give their [VSource.ac]
  /// amplitude, phase 0).
  AcSolution ac(double hz) {
    final n = nodeCount;
    var extra = 0;
    final rows = <Part, int>{};
    for (final p in parts) {
      if (p._acBranch) rows[p] = n + extra++;
    }
    final size = n + extra;
    final a = List.generate(size, (_) => List.filled(size, Complex.zero));
    final b = List.filled(size, Complex.zero);
    final w = 2 * math.pi * hz;
    void y(int i, int j, Complex g) {
      if (i > 0) a[i - 1][i - 1] += g;
      if (j > 0) a[j - 1][j - 1] += g;
      if (i > 0 && j > 0) {
        a[i - 1][j - 1] -= g;
        a[j - 1][i - 1] -= g;
      }
    }

    for (final p in parts) {
      final t = [for (final x in p.terminals) node(x)];
      switch (p) {
        case Resistor r:
          y(t[0], t[1], Complex(1 / r.ohms, 0));
        case Capacitor c:
          y(t[0], t[1], Complex(0, w * c.farads));
        case Inductor l:
          y(t[0], t[1], Complex(0, -1 / (w * l.henries)));
        case Switch s:
          y(t[0], t[1], Complex(s.closed ? 1e3 : 1e-9, 0));
        case VSource v:
          _acBranchStamp(a, rows[p]!, t[0], t[1]);
          b[rows[p]!] = Complex(v.ac, 0);
        case Ammeter _:
          _acBranchStamp(a, rows[p]!, t[0], t[1]);
        default:
          throw UnsupportedError('${p.runtimeType} has no AC model');
      }
    }
    final x = _solveComplex(a, b);
    return AcSolution._(this, x, rows);
  }

  static void _acBranchStamp(List<List<Complex>> a, int r, int p, int n) {
    if (p > 0) {
      a[p - 1][r] += Complex.one;
      a[r][p - 1] += Complex.one;
    }
    if (n > 0) {
      a[n - 1][r] -= Complex.one;
      a[r][n - 1] -= Complex.one;
    }
  }

  // ------------------------------------------------------------------ solve

  Solution _solve(_Mode mode, {double time = 0, double h = 0, Solution? prev}) {
    final n = nodeCount;
    var extra = 0;
    final rows = <Part, int>{};
    for (final p in parts) {
      final k = p._branches(mode);
      if (k > 0) {
        rows[p] = n + extra;
        extra += k;
      }
    }
    final size = n + extra;
    var x = List<double>.filled(size, 0);
    if (prev != null && prev._x.length == size) x = List.of(prev._x);

    final ctx = _Stamp(this, size, mode, time, h, prev, rows);
    // Outer loop: discrete states (op-amp saturation, logic levels) settle.
    for (var outer = 0; outer < 12; outer++) {
      var converged = false;
      for (var it = 0; it < 200; it++) {
        ctx.reset(x);
        for (final p in parts) {
          p._stamp(ctx);
        }
        final next = _solveReal(ctx.a, ctx.b);
        // Damped Newton: limit how far any node voltage jumps per step.
        var maxStep = 0.0;
        for (var i = 0; i < size; i++) {
          var d = next[i] - x[i];
          if (i < n && d.abs() > 2.0 && ctx.nonlinear) d = d.sign * 2.0;
          maxStep = math.max(maxStep, d.abs() / (1 + x[i].abs()));
          x[i] += d;
        }
        if (!ctx.nonlinear || maxStep < 1e-9) {
          converged = true;
          break;
        }
      }
      if (!converged) throw StateError('circuit did not converge');
      final s = Solution._(this, x, rows, time);
      var changed = false;
      for (final p in parts) {
        changed |= p._update(s);
      }
      if (!changed) return s;
    }
    return Solution._(this, x, rows, time);
  }
}

enum _Mode { dc, tran }

/// The MNA matrix being built for one Newton step.
class _Stamp {
  final Circuit c;
  final int size;
  final _Mode mode;
  final double time, h;
  final Solution? prev;
  final Map<Part, int> rows;
  late List<List<double>> a;
  late List<double> b;
  late List<double> x;
  bool nonlinear = false;

  _Stamp(this.c, this.size, this.mode, this.time, this.h, this.prev, this.rows);

  void reset(List<double> guess) {
    a = List.generate(size, (_) => List.filled(size, 0.0));
    b = List.filled(size, 0.0);
    x = guess;
    nonlinear = false;
  }

  int n(String name) => c.node(name);
  double v(int node) => node == 0 ? 0 : x[node - 1];

  /// A conductance g between nodes i and j.
  void g(int i, int j, double g) {
    if (i > 0) a[i - 1][i - 1] += g;
    if (j > 0) a[j - 1][j - 1] += g;
    if (i > 0 && j > 0) {
      a[i - 1][j - 1] -= g;
      a[j - 1][i - 1] -= g;
    }
  }

  /// A current source pushing [amps] from node i through itself into node j.
  void current(int i, int j, double amps) {
    if (i > 0) b[i - 1] -= amps;
    if (j > 0) b[j - 1] += amps;
  }

  /// A voltage source v(p) − v(n) = [volts], its current in extra row [row].
  void vsrc(int row, int p, int nn, double volts) {
    if (p > 0) {
      a[p - 1][row] += 1;
      a[row][p - 1] += 1;
    }
    if (nn > 0) {
      a[nn - 1][row] -= 1;
      a[row][nn - 1] -= 1;
    }
    b[row] += volts;
  }

  /// A nonlinear device: [i0] are the currents into the device at each of
  /// its [nodes] at the present guess, [jac] their derivatives with respect
  /// to the node voltages.
  void device(List<int> nodes, List<double> i0, List<List<double>> jac) {
    nonlinear = true;
    for (var k = 0; k < nodes.length; k++) {
      final r = nodes[k];
      if (r == 0) continue;
      var lin = i0[k];
      for (var j = 0; j < nodes.length; j++) {
        lin -= jac[k][j] * v(nodes[j]);
        if (nodes[j] > 0) a[r - 1][nodes[j] - 1] += jac[k][j];
      }
      b[r - 1] -= lin;
    }
  }
}

/// Node voltages and branch currents of a solved circuit.
class Solution {
  final Circuit circuit;
  final List<double> _x;
  final Map<Part, int> _rows;
  final double time;
  Solution._(this.circuit, this._x, this._rows, this.time);
  Solution._zero(this.circuit)
      : _x = const [],
        _rows = const {},
        time = 0;

  /// Voltage of [node] to ground.
  double v(String node) {
    final i = circuit.node(node);
    return i == 0 || _x.isEmpty ? 0 : _x[i - 1];
  }

  /// Voltage of [a] relative to [b].
  double vab(String a, String b) => v(a) - v(b);

  /// Current through a part, from its first terminal to its second (for a
  /// source: out of its + terminal into the circuit).
  double i(String id) {
    final p = circuit[id] ?? (throw ArgumentError('no part $id'));
    return p._current(this);
  }
}

/// Phasor results.
class AcSolution {
  final Circuit circuit;
  final List<Complex> _x;
  final Map<Part, int> _rows;
  AcSolution._(this.circuit, this._x, this._rows);

  Complex v(String node) {
    final i = circuit.node(node);
    return i == 0 ? Complex.zero : _x[i - 1];
  }

  /// Phasor current through a source or ammeter (out of + / from a to b).
  Complex i(String id) {
    final p = circuit[id]!;
    final r = _rows[p];
    if (r == null) throw ArgumentError('$id has no branch current');
    final x = _x[r];
    return p is VSource ? Complex(-x.re, -x.im) : x;
  }
}

// -------------------------------------------------------------------- parts

/// One component: its id and the nodes it connects.
abstract class Part {
  final String id;
  const Part(this.id);
  List<String> get terminals;

  int _branches(_Mode mode) => 0;
  bool get _acBranch => false;
  void _stamp(_Stamp s);

  /// After a solve: update discrete state; true when it changed (solve again).
  bool _update(Solution s) => false;

  /// After an accepted transient step.
  void _afterStep(Solution s) {}
  double _current(Solution s) => throw UnsupportedError('no current for $runtimeType');
}

class Resistor extends Part {
  final String a, b;
  final double ohms;
  Resistor(super.id, this.a, this.b, this.ohms) : assert(ohms > 0);
  @override
  List<String> get terminals => [a, b];
  @override
  void _stamp(_Stamp s) => s.g(s.n(a), s.n(b), 1 / ohms);
  @override
  double _current(Solution s) => s.vab(a, b) / ohms;
}

/// A voltage source: v(p) − v(n) = [volts] (or [wave](t) when given), with an
/// optional internal resistance. [ac] is its amplitude in AC analysis.
class VSource extends Part {
  final String p, n;
  final double volts;
  final double Function(double t)? wave;
  final double ac;
  VSource(super.id, this.p, this.n, this.volts, {this.wave, this.ac = 0});

  /// A sine source of peak [peak] volts at [hz].
  factory VSource.sine(String id, String p, String n, double peak, double hz) =>
      VSource(id, p, n, 0, wave: (t) => peak * math.sin(2 * math.pi * hz * t), ac: peak);

  double at(double t) => wave?.call(t) ?? volts;
  @override
  List<String> get terminals => [p, n];
  @override
  int _branches(_Mode mode) => 1;
  @override
  bool get _acBranch => true;
  @override
  void _stamp(_Stamp s) => s.vsrc(s.rows[this]!, s.n(p), s.n(n), at(s.time));
  // The branch variable is the current into the + terminal from the circuit;
  // report the current the source delivers.
  @override
  double _current(Solution s) => -s._x[s._rows[this]!];
}

/// A current source pushing [amps] from [a] through itself to [b] (so into
/// node [b]).
class ISource extends Part {
  final String a, b;
  final double amps;
  ISource(super.id, this.a, this.b, this.amps);
  @override
  List<String> get terminals => [a, b];
  @override
  void _stamp(_Stamp s) => s.current(s.n(a), s.n(b), amps);
  @override
  double _current(Solution s) => amps;
}

/// An ideal ammeter (zero resistance): current from [a] to [b].
class Ammeter extends Part {
  final String a, b;
  Ammeter(super.id, this.a, this.b);
  @override
  List<String> get terminals => [a, b];
  @override
  int _branches(_Mode mode) => 1;
  @override
  bool get _acBranch => true;
  @override
  void _stamp(_Stamp s) => s.vsrc(s.rows[this]!, s.n(a), s.n(b), 0);
  @override
  double _current(Solution s) => s._x[s._rows[this]!];
}

class Switch extends Part {
  final String a, b;
  final bool closed;
  Switch(super.id, this.a, this.b, {required this.closed});
  @override
  List<String> get terminals => [a, b];
  @override
  void _stamp(_Stamp s) => s.g(s.n(a), s.n(b), closed ? 1e3 : 1e-9);
  @override
  double _current(Solution s) => s.vab(a, b) * (closed ? 1e3 : 1e-9);
}

/// A capacitor: open in DC; in a transient its charge carries over.
class Capacitor extends Part {
  final String a, b;
  final double farads;

  /// Starting voltage (a − b) for a transient from rest.
  final double v0;
  Capacitor(super.id, this.a, this.b, this.farads, {this.v0 = 0});

  double _vPrev(_Stamp s) => s.prev == null || s.prev!._x.isEmpty ? v0 : s.prev!.vab(a, b);

  @override
  List<String> get terminals => [a, b];
  @override
  void _stamp(_Stamp s) {
    if (s.mode == _Mode.dc) {
      s.g(s.n(a), s.n(b), 1e-12);
      return;
    }
    final g = farads / s.h;
    s.g(s.n(a), s.n(b), g);
    s.current(s.n(b), s.n(a), g * _vPrev(s));
  }

  /// Charging current a → b in the last step (zero in DC).
  @override
  double _current(Solution s) => 0;
}

/// An inductor: a short in DC; in a transient its current carries over.
class Inductor extends Part {
  final String a, b;
  final double henries;
  double _i = 0;
  Inductor(super.id, this.a, this.b, this.henries);
  @override
  List<String> get terminals => [a, b];
  @override
  void _stamp(_Stamp s) {
    if (s.mode == _Mode.dc) {
      s.g(s.n(a), s.n(b), 1e3);
      return;
    }
    _h = s.h;
    final g = s.h / henries;
    s.g(s.n(a), s.n(b), g);
    s.current(s.n(a), s.n(b), _i);
  }

  @override
  void _afterStep(Solution s) {
    // i(t) = i(t − h) + (h/L)·v(t), with the step the circuit just took.
    _i = _iAt(s);
  }

  double _iAt(Solution s) => _i + _h * s.vab(a, b) / henries;
  double _h = 0;

  @override
  double _current(Solution s) => _i;
}

/// Exponential with a linear tail, so Newton steps never overflow.
double _limExp(double x) => x < 40 ? math.exp(x) : math.exp(40) * (1 + x - 40);

/// A pn junction diode (Shockley): I = Is(e^(V/nVt) − 1), with an optional
/// reverse breakdown at −[breakdown] volts (a Zener).
class Diode extends Part {
  final String anode, cathode;
  final double isat, n;
  final double? breakdown;
  static const vt = 0.025852; // kT/q at 300 K

  Diode(super.id, this.anode, this.cathode, {this.isat = 1e-14, this.n = 1.0, this.breakdown});

  /// A silicon diode: about 0.6–0.7 V at a few milliamperes.
  factory Diode.silicon(String id, String a, String k) => Diode(id, a, k, isat: 2.5e-9, n: 1.75);

  /// A germanium diode: about 0.25–0.3 V.
  factory Diode.germanium(String id, String a, String k) => Diode(id, a, k, isat: 2e-6, n: 1.3);

  /// A Zener diode breaking down at [vz] volts.
  factory Diode.zener(String id, String a, String k, double vz) => Diode(id, a, k, isat: 2.5e-9, n: 1.75, breakdown: vz);

  /// An LED whose turn-on voltage suits light of [wavelengthNm]: the knee is
  /// near the photon energy, hc/λe (about 1.8 V for red, 3 V for blue).
  factory Diode.led(String id, String a, String k, double wavelengthNm) {
    final eg = 1239.84 / wavelengthNm; // photon energy in eV
    // Choose Is so that I = 1 mA at V ≈ Eg (with n = 2).
    const n = 2.0;
    final isat = 1e-3 / math.exp(eg / (n * vt));
    return Diode(id, a, k, isat: isat, n: n);
  }

  @override
  List<String> get terminals => [anode, cathode];

  /// Current (anode → cathode) at junction voltage [v].
  (double i, double g) iv(double v) {
    final nvt = n * vt;
    final e = _limExp(v / nvt);
    var i = isat * (e - 1);
    var g = isat * (v / nvt < 40 ? e : math.exp(40)) / nvt;
    final bv = breakdown;
    if (bv != null) {
      // Reverse breakdown: a steep exponential past −Vz.
      const nz = 0.02;
      final x = (-v - bv) / nz;
      final ez = _limExp(x);
      i -= 1e-3 * ez;
      g += 1e-3 * (x < 40 ? ez : math.exp(40)) / nz;
    }
    return (i, g + 1e-12);
  }

  @override
  void _stamp(_Stamp s) {
    final a = s.n(anode), k = s.n(cathode);
    final v = s.v(a) - s.v(k);
    final (i, g) = iv(v);
    s.device([a, k], [i, -i], [
      [g, -g],
      [-g, g],
    ]);
  }

  @override
  double _current(Solution s) => iv(s.vab(anode, cathode)).$1;
}

/// An NPN bipolar transistor (Ebers–Moll transport model with the Early
/// effect). Terminals: collector, base, emitter. [beta] is the forward
/// current gain.
class Npn extends Part {
  final String c, b, e;
  final double isat, beta, betaR, earlyV;
  static const vt = Diode.vt;
  Npn(super.id, this.c, this.b, this.e, {this.isat = 1e-14, this.beta = 150, this.betaR = 2, this.earlyV = 100});

  @override
  List<String> get terminals => [c, b, e];

  /// (Ic, Ib) at base-emitter and base-collector voltages.
  (double ic, double ib, double dIcBe, double dIcBc, double dIbBe, double dIbBc) _model(double vbe, double vbc) {
    final ef = _limExp(vbe / vt), er = _limExp(vbc / vt);
    final f = isat * (ef - 1), r = isat * (er - 1);
    final gf = isat * (vbe / vt < 40 ? ef : math.exp(40)) / vt;
    final gr = isat * (vbc / vt < 40 ? er : math.exp(40)) / vt;
    final vce = vbe - vbc;
    final early = 1 + math.max(vce, 0) / earlyV;
    final dEarly = vce > 0 ? 1 / earlyV : 0.0;
    final ic = f * early - r * (1 + 1 / betaR);
    final ib = f / beta + r / betaR;
    return (ic, ib, gf * early + f * dEarly, -f * dEarly - gr * (1 + 1 / betaR), gf / beta, gr / betaR);
  }

  @override
  void _stamp(_Stamp s) {
    final nc = s.n(c), nb = s.n(b), ne = s.n(e);
    final vbe = s.v(nb) - s.v(ne), vbc = s.v(nb) - s.v(nc);
    final (ic, ib, icBe, icBc, ibBe, ibBc) = _model(vbe, vbc);
    // d/dV for [Vc, Vb, Ve]: Vbe = Vb − Ve, Vbc = Vb − Vc.
    final dIc = [-icBc, icBe + icBc, -icBe];
    final dIb = [-ibBc, ibBe + ibBc, -ibBe];
    final dIe = [for (var k = 0; k < 3; k++) -(dIc[k] + dIb[k])];
    s.device([nc, nb, ne], [ic, ib, -(ic + ib)], [dIc, dIb, dIe]);
  }

  /// Collector current.
  @override
  double _current(Solution s) => _model(s.vab(b, e), s.vab(b, c)).$1;

  double baseCurrent(Solution s) => _model(s.vab(b, e), s.vab(b, c)).$2;
}

/// An ideal op-amp (infinite gain, no input current) whose output stays
/// between the rails ±[vsat].
class OpAmp extends Part {
  final String plus, minus, out;
  final double vsat;
  int _rail = 0; // 0 linear, +1 high, −1 low
  OpAmp(super.id, this.plus, this.minus, this.out, {this.vsat = 13.5});

  @override
  List<String> get terminals => [plus, minus, out];
  @override
  int _branches(_Mode mode) => 1;
  @override
  void _stamp(_Stamp s) {
    final row = s.rows[this]!;
    final o = s.n(out);
    // The output delivers whatever current the circuit needs.
    if (o > 0) s.a[o - 1][row] += 1;
    if (_rail == 0) {
      final p = s.n(plus), m = s.n(minus);
      if (p > 0) s.a[row][p - 1] += 1;
      if (m > 0) s.a[row][m - 1] -= 1;
    } else {
      if (o > 0) s.a[row][o - 1] += 1;
      s.b[row] += _rail * vsat;
    }
  }

  @override
  bool _update(Solution s) {
    final vo = s.v(out), vd = s.vab(plus, minus);
    final was = _rail;
    if (_rail == 0 && vo.abs() > vsat) _rail = vo.sign.toInt();
    if (_rail != 0 && vd * _rail < 0) _rail = 0;
    return _rail != was;
  }

  bool get saturated => _rail != 0;
  @override
  double _current(Solution s) => -s._x[s._rows[this]!];
}

/// Logic gates (5 V logic: above 2.5 V is 1). The output is an ideal source
/// of 5 V or 0 V.
enum GateKind { and, or, not, nand, nor, xor, xnor }

class Gate extends Part {
  final GateKind kind;
  final List<String> inputs;
  final String out;
  static const high = 5.0;
  bool _q = false;
  Gate(super.id, this.kind, this.inputs, this.out);

  static bool eval(GateKind k, List<bool> x) => switch (k) {
        GateKind.and => x.every((b) => b),
        GateKind.or => x.any((b) => b),
        GateKind.not => !x.first,
        GateKind.nand => !x.every((b) => b),
        GateKind.nor => !x.any((b) => b),
        GateKind.xor => x.where((b) => b).length.isOdd,
        GateKind.xnor => x.where((b) => b).length.isEven,
      };

  @override
  List<String> get terminals => [...inputs, out];
  @override
  int _branches(_Mode mode) => 1;
  @override
  void _stamp(_Stamp s) => s.vsrc(s.rows[this]!, s.n(out), 0, _q ? high : 0);
  @override
  bool _update(Solution s) {
    final q = eval(kind, [for (final i in inputs) s.v(i) > high / 2]);
    final changed = q != _q;
    _q = q;
    return changed;
  }

  bool get output => _q;
}

/// A 555 timer wired as an astable (behavioural): the output is high and
/// the discharge pin open while the timing capacitor charges to ⅔ Vcc, then
/// the output is low and discharge shorts to ground until it falls to ⅓ Vcc.
class Timer555 extends Part {
  final String vcc, trig, dis, out;
  bool _high = true;
  Timer555(super.id, {required this.vcc, required this.trig, required this.dis, required this.out});

  @override
  List<String> get terminals => [vcc, trig, dis, out];
  @override
  int _branches(_Mode mode) => 1;
  @override
  void _stamp(_Stamp s) {
    s.nonlinear = true;
    final supply = s.v(s.n(vcc));
    s.vsrc(s.rows[this]!, s.n(out), 0, _high ? supply : 0);
    // Discharge transistor: closed (20 Ω) while the output is low.
    s.g(s.n(dis), 0, _high ? 1e-9 : 1 / 20);
  }

  @override
  void _afterStep(Solution s) {
    final v = s.v(trig), supply = s.v(vcc);
    if (_high && v >= supply * 2 / 3) _high = false;
    if (!_high && v <= supply / 3) _high = true;
  }

  bool get high => _high;
}

// ------------------------------------------------------------------ algebra

/// Gaussian elimination with partial pivoting (small dense systems).
List<double> _solveReal(List<List<double>> a0, List<double> b0) {
  final n = b0.length;
  final a = [for (final r in a0) List.of(r)];
  final b = List.of(b0);
  for (var c = 0; c < n; c++) {
    var p = c;
    for (var r = c + 1; r < n; r++) {
      if (a[r][c].abs() > a[p][c].abs()) p = r;
    }
    if (a[p][c].abs() < 1e-18) {
      // A floating node: tie it weakly to ground.
      a[c][c] += 1e-12;
      p = c;
    }
    if (p != c) {
      final t = a[p];
      a[p] = a[c];
      a[c] = t;
      final tb = b[p];
      b[p] = b[c];
      b[c] = tb;
    }
    for (var r = c + 1; r < n; r++) {
      final f = a[r][c] / a[c][c];
      if (f == 0) continue;
      for (var k = c; k < n; k++) {
        a[r][k] -= f * a[c][k];
      }
      b[r] -= f * b[c];
    }
  }
  final x = List.filled(n, 0.0);
  for (var r = n - 1; r >= 0; r--) {
    var s = b[r];
    for (var k = r + 1; k < n; k++) {
      s -= a[r][k] * x[k];
    }
    x[r] = s / a[r][r];
  }
  return x;
}

List<Complex> _solveComplex(List<List<Complex>> a0, List<Complex> b0) {
  final n = b0.length;
  final a = [for (final r in a0) List.of(r)];
  final b = List.of(b0);
  for (var c = 0; c < n; c++) {
    var p = c;
    for (var r = c + 1; r < n; r++) {
      if (a[r][c].abs > a[p][c].abs) p = r;
    }
    if (p != c) {
      final t = a[p];
      a[p] = a[c];
      a[c] = t;
      final tb = b[p];
      b[p] = b[c];
      b[c] = tb;
    }
    if (a[c][c].abs < 1e-18) a[c][c] += const Complex(1e-12, 0);
    for (var r = c + 1; r < n; r++) {
      final f = a[r][c] / a[c][c];
      for (var k = c; k < n; k++) {
        a[r][k] -= f * a[c][k];
      }
      b[r] -= f * b[c];
    }
  }
  final x = List.filled(n, Complex.zero);
  for (var r = n - 1; r >= 0; r--) {
    var s = b[r];
    for (var k = r + 1; k < n; k++) {
      s -= a[r][k] * x[k];
    }
    x[r] = s / a[r][r];
  }
  return x;
}

/// A complex number (for AC phasors).
class Complex {
  final double re, im;
  const Complex(this.re, this.im);
  static const zero = Complex(0, 0), one = Complex(1, 0);
  Complex operator +(Complex o) => Complex(re + o.re, im + o.im);
  Complex operator -(Complex o) => Complex(re - o.re, im - o.im);
  Complex operator *(Complex o) => Complex(re * o.re - im * o.im, re * o.im + im * o.re);
  Complex operator /(Complex o) {
    final d = o.re * o.re + o.im * o.im;
    return Complex((re * o.re + im * o.im) / d, (im * o.re - re * o.im) / d);
  }

  double get abs => math.sqrt(re * re + im * im);

  /// Phase in radians.
  double get arg => math.atan2(im, re);
  @override
  String toString() => '$re${im < 0 ? '−' : '+'}${im.abs()}j';
}
