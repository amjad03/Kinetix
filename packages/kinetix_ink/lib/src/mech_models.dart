import 'dart:math' as math;

// The figures behind the mechanical engineering panels (KitElement): an engineering drawing
// sheet (title block, grid, first- or third-angle projection of points with the XY line,
// projectors and the 45° miter line); air-standard and steam cycles worked out state by state
// (Otto, Diesel, Dual, Brayton, Carnot, simple Rankine) for P-V and T-s charts; and a free-body
// diagram (a body, forces with magnitude and angle, ΣFx, ΣFy, ΣM, and one unknown force solved).
// Pure Dart, read from and written to the panel's JSON. Units: mm on the sheet; kPa, m³/kg, K,
// kJ/kg and kJ/kg·K for the cycles (air: R = 0.287 kJ/kg·K); N, m and N·m for forces.

double _d(Object? v, [double fallback = 0]) => v is num ? v.toDouble() : (v is String ? double.tryParse(v) ?? fallback : fallback);
String _s(Object? v, [String fallback = '']) => v is String ? v : fallback;
bool _b(Object? v, [bool fallback = false]) => v is bool ? v : fallback;
List<Object?> _l(Object? v) => v is List ? v : const [];
Map<Object?, Object?> _m(Object? v) => v is Map ? v : const {};
double _r(double v, [int places = 4]) => v.isFinite ? double.parse(v.toStringAsFixed(places)) : 0;

// --- Engineering drawing sheet ----------------------------------------------------------------

enum DrawingGrid { none, square, isometric }

enum DrawingProjection { first, third }

enum SheetSize { a4, a3, a2 }

/// The drawing scales a sheet offers (drawing size : true size), as SP 46 lists them.
const drawingScales = ['1:1', '1:2', '1:5', '1:10', '2:1', '5:1'];

/// A point to project: [x] along XY from the left of the drawing (mm, true size), [h] above
/// the HP (its front view's distance from XY) and [d] in front of the VP (its top view's).
/// Negative [h] is below the HP, negative [d] behind the VP.
class DrawingPoint {
  const DrawingPoint(this.label, {required this.x, required this.h, required this.d});
  factory DrawingPoint.fromJson(Object? j) {
    final m = _m(j);
    return DrawingPoint(_s(m['l'], 'A'), x: _d(m['x']), h: _d(m['h']), d: _d(m['d']));
  }
  final String label;
  final double x, h, d;

  /// Which quadrant it lies in: I (above HP, in front of VP), II, III or IV; 0 on a plane.
  int get quadrant => h == 0 || d == 0 ? 0 : (h > 0 ? (d > 0 ? 1 : 2) : (d > 0 ? 4 : 3));

  DrawingPoint copyWith({String? label, double? x, double? h, double? d}) => DrawingPoint(label ?? this.label, x: x ?? this.x, h: h ?? this.h, d: d ?? this.d);
  Map<String, Object?> toJson() => {'l': label, 'x': _r(x, 2), 'h': _r(h, 2), 'd': _r(d, 2)};
}

/// Where a point's views land on the sheet, in drawing mm from the XY line's left end (y down,
/// XY at y = 0): front view a′, top view a, side view a″ (through the 45° miter line at [sideX]).
typedef PointViews = ({double x, double front, double top, double sideX});

class DrawingSheet {
  const DrawingSheet({
    this.title = 'Projections of points',
    this.size = SheetSize.a3,
    this.grid = DrawingGrid.square,
    this.gridMm = 10,
    this.projection = DrawingProjection.first,
    this.scale = '1:1',
    this.showXY = true,
    this.showMiter = true,
    this.showLegend = true,
    this.points = const [],
    this.name = '',
    this.institution = '',
    this.sheetNo = '1',
  });

  factory DrawingSheet.fromJson(Map<String, Object?> j) {
    final tb = _m(j['tb']);
    return DrawingSheet(
      title: _s(j['t'], 'Drawing sheet'),
      size: SheetSize.values.asNameMap()[j['size']] ?? SheetSize.a3,
      grid: DrawingGrid.values.asNameMap()[j['grid']] ?? DrawingGrid.square,
      gridMm: _d(j['gs'], 10).clamp(2, 50),
      projection: DrawingProjection.values.asNameMap()[j['proj']] ?? DrawingProjection.first,
      scale: drawingScales.contains(j['scale']) ? j['scale']! as String : '1:1',
      showXY: _b(j['xy'], true),
      showMiter: _b(j['miter'], true),
      showLegend: _b(j['legend'], true),
      points: [for (final p in _l(j['pts'])) DrawingPoint.fromJson(p)],
      name: _s(tb['name']),
      institution: _s(tb['inst']),
      sheetNo: _s(tb['no'], '1'),
    );
  }

  final String title;
  final SheetSize size;
  final DrawingGrid grid;
  final double gridMm;
  final DrawingProjection projection;
  final String scale;
  final bool showXY, showMiter, showLegend;
  final List<DrawingPoint> points;
  final String name, institution, sheetNo;

  /// The sheet's size in mm, landscape (IS 10711).
  (double, double) get sheetMm => switch (size) {
    SheetSize.a4 => (297, 210),
    SheetSize.a3 => (420, 297),
    SheetSize.a2 => (594, 420),
  };

  /// Drawing size ÷ true size: 0.5 for 1:2, 2 for 2:1.
  double get scaleFactor {
    final p = scale.split(':');
    final a = double.tryParse(p.first) ?? 1, b = double.tryParse(p.length > 1 ? p[1] : '1') ?? 1;
    return b == 0 ? 1 : a / b;
  }

  /// Where the views of [p] land (see [PointViews]), with the side view's miter line at [miterX].
  PointViews views(DrawingPoint p, double miterX) {
    final k = scaleFactor;
    final first = projection == DrawingProjection.first;
    // First angle: the front view above XY, the top view below; third angle the other way.
    final front = (first ? -p.h : p.h) * k;
    final top = (first ? p.d : -p.d) * k;
    // The left side view (first angle) / right side view (third angle) sits to the right: a
    // horizontal projector from the top view meets the 45° line, then runs to the front view's level.
    return (x: p.x * k, front: front, top: top, sideX: miterX + p.d.abs() * k * (p.d >= 0 ? 1 : -1));
  }

  DrawingSheet copyWith({
    String? title,
    SheetSize? size,
    DrawingGrid? grid,
    double? gridMm,
    DrawingProjection? projection,
    String? scale,
    bool? showXY,
    bool? showMiter,
    bool? showLegend,
    List<DrawingPoint>? points,
    String? name,
    String? institution,
    String? sheetNo,
  }) => DrawingSheet(
    title: title ?? this.title,
    size: size ?? this.size,
    grid: grid ?? this.grid,
    gridMm: gridMm ?? this.gridMm,
    projection: projection ?? this.projection,
    scale: scale ?? this.scale,
    showXY: showXY ?? this.showXY,
    showMiter: showMiter ?? this.showMiter,
    showLegend: showLegend ?? this.showLegend,
    points: points ?? this.points,
    name: name ?? this.name,
    institution: institution ?? this.institution,
    sheetNo: sheetNo ?? this.sheetNo,
  );

  Map<String, Object?> toJson() => {
    't': title,
    'size': size.name,
    'grid': grid.name,
    'gs': _r(gridMm, 2),
    'proj': projection.name,
    'scale': scale,
    'xy': showXY,
    'miter': showMiter,
    'legend': showLegend,
    'pts': [for (final p in points) p.toJson()],
    'tb': {'name': name, 'inst': institution, 'no': sheetNo},
  };
}

// --- Thermodynamic cycles ---------------------------------------------------------------------

enum CycleKind { otto, diesel, dual, brayton, carnot, rankine }

/// How a process runs between two states (it sets the curve on the charts).
enum ProcessKind { isentropic, isochoric, isobaric, isothermal, pump, boiler, condenser }

/// One state of a cycle: pressure (kPa), specific volume (m³/kg), temperature (K), entropy
/// (kJ/kg·K, from state 1 for air; from saturated water at 0.01 °C for steam), enthalpy (kJ/kg).
class CycleState {
  const CycleState({required this.p, required this.v, required this.t, required this.s, this.h = double.nan, this.x});
  final double p, v, t, s, h;

  /// Dryness fraction (steam), when wet.
  final double? x;
}

class CycleProcess {
  const CycleProcess(this.from, this.to, this.kind, {this.heatIn = 0, this.heatOut = 0});

  /// State indices (0-based) the process runs between.
  final int from, to;
  final ProcessKind kind;
  final double heatIn, heatOut;
}

class CycleResult {
  const CycleResult({required this.states, required this.processes, required this.heatIn, required this.heatOut, required this.efficiency, this.mep, this.formula = '', this.error});
  final List<CycleState> states;
  final List<CycleProcess> processes;

  /// Heat added and rejected per kg (kJ/kg); net work = heatIn − heatOut.
  final double heatIn, heatOut;
  final double efficiency;

  /// Mean effective pressure (kPa) for the piston engines.
  final double? mep;

  /// The textbook efficiency formula and its value, as shown.
  final String formula;

  /// Why the inputs do not make a cycle (the charts stay empty).
  final String? error;

  double get work => heatIn - heatOut;
  bool get ok => error == null;

  /// Points along process [i] for the charts: (p, v, T, s).
  List<CycleState> path(int i, {int n = 40}) {
    final pr = processes[i];
    final a = states[pr.from], b = states[pr.to];
    CycleState at(double f) {
      switch (pr.kind) {
        case ProcessKind.isentropic:
          // pv^k = c, with k from the end states (γ for air; about 1.1–1.13 for wet steam).
          final v = a.v * math.pow(b.v / a.v, f);
          final k = math.log(b.p / a.p) / math.log(a.v / b.v);
          final p = a.p * math.pow(a.v / v, k);
          // Steam in the dome is at its saturation temperature; air follows pv = RT.
          final t = a.h.isFinite ? saturated(p / 100).t + 273.15 : a.t * (p * v) / (a.p * a.v);
          return CycleState(p: p, v: v, t: f == 0 ? a.t : (f == 1 ? b.t : t), s: a.s + (b.s - a.s) * f);
        case ProcessKind.isochoric:
          final t = a.t + (b.t - a.t) * f;
          return CycleState(p: a.p * t / a.t, v: a.v, t: t, s: a.s + (b.s - a.s) * math.log(t / a.t) / math.log(b.t / a.t));
        case ProcessKind.isobaric:
          final v = a.v + (b.v - a.v) * f;
          final t = a.t * v / a.v;
          return CycleState(p: a.p, v: v, t: t, s: a.s + (b.s - a.s) * (math.log(t / a.t) / math.log(b.t / a.t)));
        case ProcessKind.isothermal:
          final v = a.v * math.pow(b.v / a.v, f);
          return CycleState(p: a.p * a.v / v, v: v, t: a.t, s: a.s + (b.s - a.s) * f);
        case ProcessKind.pump:
          return CycleState(p: a.p + (b.p - a.p) * f, v: a.v, t: a.t + (b.t - a.t) * f, s: a.s + (b.s - a.s) * f);
        case ProcessKind.condenser:
          // Constant pressure and temperature in the dome: v and s fall together.
          return CycleState(p: a.p, v: a.v * math.pow(b.v / a.v, f), t: a.t, s: a.s + (b.s - a.s) * f);
        case ProcessKind.boiler:
          // Liquid heated along the saturated-liquid line, then boiled at constant T.
          return steamBoilerPoint(a, b, f);
      }
    }

    return [for (var k = 0; k <= n; k++) at(k / n)];
  }
}

/// Air as an ideal gas.
const airR = 0.287;

/// An air-standard or steam cycle and its inputs: state 1 at [p1] kPa and [t1] K; [r] the
/// compression ratio (Otto, Diesel, Dual), [rc] the cut-off ratio (Diesel, Dual), [rp] the
/// pressure ratio (Dual: in the constant-volume heating; Brayton: of the compressor), [tMax] the
/// highest temperature (Otto, Brayton, Carnot), [expansion] the Carnot cycle's isothermal
/// expansion ratio, and for the Rankine cycle the boiler and condenser pressures in bar.
class ThermoCycle {
  const ThermoCycle({
    this.title = '',
    this.kind = CycleKind.otto,
    this.gamma = 1.4,
    this.p1 = 100,
    this.t1 = 300,
    this.r = 8,
    this.rc = 2,
    this.rp = 1.5,
    this.tMax = 1500,
    this.expansion = 2,
    this.boilerBar = 40,
    this.condenserBar = 0.1,
    this.shade = true,
  });

  factory ThermoCycle.fromJson(Map<String, Object?> j) => ThermoCycle(
    title: _s(j['t']),
    kind: CycleKind.values.asNameMap()[j['k']] ?? CycleKind.otto,
    gamma: _d(j['g'], 1.4),
    p1: _d(j['p1'], 100),
    t1: _d(j['t1'], 300),
    r: _d(j['r'], 8),
    rc: _d(j['rc'], 2),
    rp: _d(j['rp'], 1.5),
    tMax: _d(j['tmax'], 1500),
    expansion: _d(j['e'], 2),
    boilerBar: _d(j['pb'], 40),
    condenserBar: _d(j['pc'], 0.1),
    shade: _b(j['shade'], true),
  );

  final String title;
  final CycleKind kind;
  final double gamma, p1, t1, r, rc, rp, tMax, expansion, boilerBar, condenserBar;
  final bool shade;

  /// The title shown: the panel's own, else the cycle's name.
  String get heading => title.isNotEmpty ? title : cycleNames[kind]!;

  ThermoCycle copyWith({String? title, CycleKind? kind, double? gamma, double? p1, double? t1, double? r, double? rc, double? rp, double? tMax, double? expansion, double? boilerBar, double? condenserBar, bool? shade}) => ThermoCycle(
    title: title ?? this.title,
    kind: kind ?? this.kind,
    gamma: gamma ?? this.gamma,
    p1: p1 ?? this.p1,
    t1: t1 ?? this.t1,
    r: r ?? this.r,
    rc: rc ?? this.rc,
    rp: rp ?? this.rp,
    tMax: tMax ?? this.tMax,
    expansion: expansion ?? this.expansion,
    boilerBar: boilerBar ?? this.boilerBar,
    condenserBar: condenserBar ?? this.condenserBar,
    shade: shade ?? this.shade,
  );

  Map<String, Object?> toJson() => {
    't': title,
    'k': kind.name,
    'g': _r(gamma),
    'p1': _r(p1),
    't1': _r(t1),
    'r': _r(r),
    'rc': _r(rc),
    'rp': _r(rp),
    'tmax': _r(tMax),
    'e': _r(expansion),
    'pb': _r(boilerBar),
    'pc': _r(condenserBar),
    'shade': shade,
  };

  double get cv => airR / (gamma - 1);
  double get cp => gamma * cv;

  /// The states, processes, heat, work and efficiency.
  CycleResult solve() {
    CycleResult fail(String why) => CycleResult(states: const [], processes: const [], heatIn: 0, heatOut: 0, efficiency: double.nan, error: why);
    if (kind == CycleKind.rankine) return _rankine();
    if (!(gamma > 1 && gamma < 2)) return fail('γ must be between 1 and 2');
    if (!(p1 > 0 && t1 > 0)) return fail('p₁ and T₁ must be positive');
    final g = gamma, cv = this.cv, cp = this.cp;
    final v1 = airR * t1 / p1;
    // Entropy of an ideal gas from state 1.
    double s(double t, double v) => cv * math.log(t / t1) + airR * math.log(v / v1);
    CycleState st(double p, double v, double t) => CycleState(p: p, v: v, t: t, s: s(t, v));
    final one = st(p1, v1, t1);
    switch (kind) {
      case CycleKind.otto:
        if (!(r > 1)) return fail('r must be more than 1');
        final v2 = v1 / r, t2 = t1 * math.pow(r, g - 1), p2 = p1 * math.pow(r, g);
        if (!(tMax > t2)) return fail('T₃ must be above T₂ = ${t2.toStringAsFixed(0)} K');
        final t3 = tMax, p3 = p2 * t3 / t2;
        final t4 = t3 / math.pow(r, g - 1), p4 = p3 / math.pow(r, g);
        final qin = cv * (t3 - t2), qout = cv * (t4 - t1);
        return CycleResult(
          states: [one, st(p2, v2, t2), st(p3, v2, t3), st(p4, v1, t4)],
          processes: [CycleProcess(0, 1, ProcessKind.isentropic), CycleProcess(1, 2, ProcessKind.isochoric, heatIn: qin), CycleProcess(2, 3, ProcessKind.isentropic), CycleProcess(3, 0, ProcessKind.isochoric, heatOut: qout)],
          heatIn: qin,
          heatOut: qout,
          efficiency: 1 - qout / qin,
          mep: (qin - qout) / (v1 - v2),
          formula: 'η = 1 − 1/r^(γ−1)',
        );
      case CycleKind.diesel:
      case CycleKind.dual:
        if (!(r > 1)) return fail('r must be more than 1');
        final dual = kind == CycleKind.dual;
        final pr = dual ? rp : 1.0;
        if (!(rc >= 1) || (dual && !(rp >= 1))) return fail('the cut-off and pressure ratios must be at least 1');
        final v2 = v1 / r, t2 = t1 * math.pow(r, g - 1), p2 = p1 * math.pow(r, g);
        final tx = t2 * pr, px = p2 * pr; // after the constant-volume heating (Dual)
        final v3 = v2 * rc, t3 = tx * rc;
        if (!(v3 < v1)) return fail('the cut-off ratio must be less than r');
        final t4 = t3 * math.pow(v3 / v1, g - 1), p4 = px * math.pow(v3 / v1, g);
        final qin = cv * (tx - t2) + cp * (t3 - tx), qout = cv * (t4 - t1);
        return CycleResult(
          states: [one, st(p2, v2, t2), if (dual) st(px, v2, tx), st(px, v3, t3), st(p4, v1, t4)],
          processes: dual
              ? [CycleProcess(0, 1, ProcessKind.isentropic), CycleProcess(1, 2, ProcessKind.isochoric, heatIn: cv * (tx - t2)), CycleProcess(2, 3, ProcessKind.isobaric, heatIn: cp * (t3 - tx)), CycleProcess(3, 4, ProcessKind.isentropic), CycleProcess(4, 0, ProcessKind.isochoric, heatOut: qout)]
              : [CycleProcess(0, 1, ProcessKind.isentropic), CycleProcess(1, 2, ProcessKind.isobaric, heatIn: qin), CycleProcess(2, 3, ProcessKind.isentropic), CycleProcess(3, 0, ProcessKind.isochoric, heatOut: qout)],
          heatIn: qin,
          heatOut: qout,
          efficiency: 1 - qout / qin,
          mep: (qin - qout) / (v1 - v2),
          formula: dual ? 'η = 1 − (rₚ·r꜀^γ − 1) / (r^(γ−1)·[(rₚ − 1) + γ·rₚ(r꜀ − 1)])' : 'η = 1 − (r꜀^γ − 1) / (γ·r^(γ−1)·(r꜀ − 1))',
        );
      case CycleKind.brayton:
        if (!(rp > 1)) return fail('rₚ must be more than 1');
        final k = math.pow(rp, (g - 1) / g).toDouble();
        final p2 = p1 * rp, t2 = t1 * k, v2 = airR * t2 / p2;
        if (!(tMax > t2)) return fail('T₃ must be above T₂ = ${t2.toStringAsFixed(0)} K');
        final t3 = tMax, v3 = airR * t3 / p2, t4 = t3 / k, v4 = airR * t4 / p1;
        final qin = cp * (t3 - t2), qout = cp * (t4 - t1);
        return CycleResult(
          states: [one, st(p2, v2, t2), st(p2, v3, t3), st(p1, v4, t4)],
          processes: [CycleProcess(0, 1, ProcessKind.isentropic), CycleProcess(1, 2, ProcessKind.isobaric, heatIn: qin), CycleProcess(2, 3, ProcessKind.isentropic), CycleProcess(3, 0, ProcessKind.isobaric, heatOut: qout)],
          heatIn: qin,
          heatOut: qout,
          efficiency: 1 - qout / qin,
          formula: 'η = 1 − 1/rₚ^((γ−1)/γ)',
        );
      case CycleKind.carnot:
        if (!(tMax > t1)) return fail('T_H must be above T_L');
        if (!(expansion > 1)) return fail('the expansion ratio must be more than 1');
        // 1→2 isentropic compression to T_H, 2→3 isothermal expansion (heat in), 3→4 isentropic
        // expansion to T_L, 4→1 isothermal compression (heat out).
        final v2 = v1 * math.pow(t1 / tMax, 1 / (g - 1)), p2 = airR * tMax / v2;
        final v3 = v2 * expansion, p3 = airR * tMax / v3;
        final v4 = v3 * math.pow(tMax / t1, 1 / (g - 1)), p4 = airR * t1 / v4;
        final qin = airR * tMax * math.log(expansion), qout = airR * t1 * math.log(v4 / v1);
        return CycleResult(
          states: [one, st(p2, v2, tMax), st(p3, v3, tMax), st(p4, v4, t1)],
          processes: [CycleProcess(0, 1, ProcessKind.isentropic), CycleProcess(1, 2, ProcessKind.isothermal, heatIn: qin), CycleProcess(2, 3, ProcessKind.isentropic), CycleProcess(3, 0, ProcessKind.isothermal, heatOut: qout)],
          heatIn: qin,
          heatOut: qout,
          efficiency: 1 - qout / qin,
          mep: (qin - qout) / (v4 - v2),
          formula: 'η = 1 − T_L/T_H',
        );
      case CycleKind.rankine:
        return _rankine();
    }
  }

  /// The simple Rankine cycle: saturated liquid leaves the condenser (1), is pumped to the
  /// boiler pressure (2), boiled to dry saturated steam (3), and expands isentropically in the
  /// turbine (4). Properties from the saturated steam table, interpolated.
  CycleResult _rankine() {
    CycleResult fail(String why) => CycleResult(states: const [], processes: const [], heatIn: 0, heatOut: 0, efficiency: double.nan, error: why);
    final lo = steamTable.first.p, hi = steamTable.last.p;
    if (!(condenserBar >= lo && boilerBar <= hi && boilerBar > condenserBar)) return fail('pressures must be $lo–$hi bar, boiler above condenser');
    final c = saturated(condenserBar), b = saturated(boilerBar);
    final wp = c.vf * (boilerBar - condenserBar) * 100; // kJ/kg
    final h1 = c.hf, h2 = h1 + wp, h3 = b.hg, s3 = b.sg;
    final x4 = (s3 - c.sf) / c.sfg;
    final h4 = c.hf + x4 * c.hfg;
    final qin = h3 - h2, qout = h4 - h1;
    double k(double t) => t + 273.15;
    return CycleResult(
      states: [
        CycleState(p: condenserBar * 100, v: c.vf, t: k(c.t), s: c.sf, h: h1, x: 0),
        CycleState(p: boilerBar * 100, v: c.vf, t: k(c.t) + 0.1, s: c.sf, h: h2),
        CycleState(p: boilerBar * 100, v: b.vg, t: k(b.t), s: s3, h: h3, x: 1),
        CycleState(p: condenserBar * 100, v: c.vf + x4 * (c.vg - c.vf), t: k(c.t), s: s3, h: h4, x: x4),
      ],
      processes: [CycleProcess(0, 1, ProcessKind.pump), CycleProcess(1, 2, ProcessKind.boiler, heatIn: qin), CycleProcess(2, 3, ProcessKind.isentropic), CycleProcess(3, 0, ProcessKind.condenser, heatOut: qout)],
      heatIn: qin,
      heatOut: qout,
      efficiency: (qin - qout) / qin,
      formula: 'η = [(h₃ − h₄) − w_p] / (h₃ − h₂)',
    );
  }
}

const cycleNames = {
  CycleKind.otto: 'Otto cycle (petrol engine)',
  CycleKind.diesel: 'Diesel cycle',
  CycleKind.dual: 'Dual (mixed) cycle',
  CycleKind.brayton: 'Brayton cycle (gas turbine)',
  CycleKind.carnot: 'Carnot cycle (air)',
  CycleKind.rankine: 'Rankine cycle (simple, saturated steam)',
};

/// The ideal-cycle efficiencies as the textbooks write them, for checking.
double ottoEfficiency(double r, double g) => 1 - 1 / math.pow(r, g - 1);
double dieselEfficiency(double r, double rc, double g) => 1 - (math.pow(rc, g) - 1) / (g * math.pow(r, g - 1) * (rc - 1));
double dualEfficiency(double r, double rp, double rc, double g) => 1 - (rp * math.pow(rc, g) - 1) / (math.pow(r, g - 1) * ((rp - 1) + g * rp * (rc - 1)));
double braytonEfficiency(double rp, double g) => 1 - 1 / math.pow(rp, (g - 1) / g);
double carnotEfficiency(double tl, double th) => 1 - tl / th;

// --- Steam ------------------------------------------------------------------------------------

/// A row of the saturated steam table (pressure table): bar, °C, m³/kg, kJ/kg, kJ/kg·K.
class SteamRow {
  const SteamRow(this.p, this.t, this.vf, this.vg, this.hf, this.hfg, this.sf, this.sfg);
  final double p, t, vf, vg, hf, hfg, sf, sfg;
  double get hg => hf + hfg;
  double get sg => sf + sfg;
}

/// Saturated water and steam by pressure (standard steam-table values, rounded).
const steamTable = [
  SteamRow(0.05, 32.88, 0.001005, 28.19, 137.82, 2423.7, 0.4764, 7.9187),
  SteamRow(0.1, 45.81, 0.001010, 14.67, 191.83, 2392.8, 0.6493, 7.5009),
  SteamRow(0.2, 60.06, 0.001017, 7.649, 251.40, 2358.3, 0.8320, 7.0766),
  SteamRow(0.5, 81.33, 0.001030, 3.240, 340.49, 2305.4, 1.0910, 6.5029),
  SteamRow(1, 99.63, 0.001043, 1.694, 417.46, 2258.0, 1.3026, 6.0568),
  SteamRow(2, 120.23, 0.001061, 0.8857, 504.70, 2201.9, 1.5301, 5.5970),
  SteamRow(5, 151.86, 0.001093, 0.3749, 640.23, 2108.5, 1.8607, 4.9606),
  SteamRow(10, 179.91, 0.001127, 0.1944, 762.81, 2015.3, 2.1387, 4.4478),
  SteamRow(20, 212.42, 0.001177, 0.09963, 908.79, 1890.7, 2.4474, 3.8935),
  SteamRow(40, 250.40, 0.001252, 0.04978, 1087.31, 1714.1, 2.7964, 3.2737),
  SteamRow(60, 275.64, 0.001319, 0.03244, 1213.35, 1571.0, 3.0267, 2.8625),
  SteamRow(80, 295.06, 0.001384, 0.02352, 1316.64, 1441.3, 3.2068, 2.5364),
  SteamRow(100, 311.06, 0.001452, 0.01803, 1407.56, 1317.1, 3.3596, 2.2544),
  SteamRow(150, 342.24, 0.001658, 0.01034, 1610.5, 1000.0, 3.6848, 1.6249),
  SteamRow(200, 365.81, 0.002036, 0.005834, 1826.3, 583.4, 4.0139, 0.9130),
  SteamRow(220.9, 374.14, 0.003155, 0.003155, 2099.3, 0, 4.4298, 0),
];

/// Saturated properties at [bar], interpolated in log p between the table's rows.
SteamRow saturated(double bar) {
  final rows = steamTable;
  if (bar <= rows.first.p) return rows.first;
  if (bar >= rows.last.p) return rows.last;
  var i = 0;
  while (rows[i + 1].p < bar) {
    i++;
  }
  final a = rows[i], b = rows[i + 1];
  final f = (math.log(bar) - math.log(a.p)) / (math.log(b.p) - math.log(a.p));
  double l(double x, double y) => x + (y - x) * f;
  return SteamRow(bar, l(a.t, b.t), l(a.vf, b.vf), math.exp(l(math.log(a.vg), math.log(b.vg))), l(a.hf, b.hf), l(a.hfg, b.hfg), l(a.sf, b.sf), l(a.sfg, b.sfg));
}

/// A point on the boiler's path at fraction [f]: up the saturated-liquid line to the boiling
/// point, then across the dome at constant temperature.
CycleState steamBoilerPoint(CycleState a, CycleState b, double f) {
  final sat = saturated(b.p / 100);
  final tb = sat.t + 273.15;
  // The share of the path spent heating the liquid, by entropy.
  final split = ((sat.sf - a.s) / (b.s - a.s)).clamp(0.0, 1.0);
  if (f <= split && split > 0) {
    final s = a.s + (sat.sf - a.s) * (f / split);
    // Temperature along the saturated-liquid line at this entropy.
    var t = a.t;
    for (var i = 0; i + 1 < steamTable.length; i++) {
      final x = steamTable[i], y = steamTable[i + 1];
      if (s >= x.sf && s <= y.sf) {
        t = x.t + (y.t - x.t) * (s - x.sf) / (y.sf - x.sf) + 273.15;
        break;
      }
    }
    return CycleState(p: b.p, v: a.v, t: math.max(t, a.t), s: s);
  }
  final g = split >= 1 ? 1.0 : (f - split) / (1 - split);
  return CycleState(p: b.p, v: sat.vf * math.pow(b.v / sat.vf, g), t: tb, s: sat.sf + (b.s - sat.sf) * g);
}

// --- Free-body diagrams ----------------------------------------------------------------------

enum FbdBody { block, beam, sphere, incline, pulley }

/// Which part of a force is to be found from equilibrium: nothing, its magnitude (along its
/// given line), or the whole force (magnitude and direction: the equilibrant).
enum FbdUnknown { none, magnitude, force }

/// A force (N) at [angle] degrees anticlockwise from +x, acting at ([x], [y]) m from the body's
/// centre.
class FbdForce {
  const FbdForce(this.label, {required this.magnitude, required this.angle, this.x = 0, this.y = 0, this.unknown = FbdUnknown.none});
  factory FbdForce.fromJson(Object? j) {
    final m = _m(j);
    return FbdForce(_s(m['l'], 'F'), magnitude: _d(m['f']), angle: _d(m['a']), x: _d(m['x']), y: _d(m['y']), unknown: FbdUnknown.values.asNameMap()[m['u']] ?? FbdUnknown.none);
  }
  final String label;
  final double magnitude, angle, x, y;
  final FbdUnknown unknown;

  double get fx => magnitude * math.cos(angle * math.pi / 180);
  double get fy => magnitude * math.sin(angle * math.pi / 180);

  /// Its moment about the body's centre (N·m, anticlockwise positive).
  double get moment => x * fy - y * fx;

  FbdForce copyWith({String? label, double? magnitude, double? angle, double? x, double? y, FbdUnknown? unknown}) =>
      FbdForce(label ?? this.label, magnitude: magnitude ?? this.magnitude, angle: angle ?? this.angle, x: x ?? this.x, y: y ?? this.y, unknown: unknown ?? this.unknown);

  Map<String, Object?> toJson() => {'l': label, 'f': _r(magnitude), 'a': _r(angle), 'x': _r(x), 'y': _r(y), if (unknown != FbdUnknown.none) 'u': unknown.name};
}

class FbdResult {
  const FbdResult({required this.forces, required this.sumFx, required this.sumFy, required this.sumM, this.solved, this.residual = 0, this.note});

  /// The forces with the unknown filled in.
  final List<FbdForce> forces;
  final double sumFx, sumFy, sumM;

  /// The index of the force found from equilibrium.
  final int? solved;

  /// What ΣF the solved magnitude could not cancel (its line is not where equilibrium needs it).
  final double residual;
  final String? note;

  /// Within 0.1 % of the largest force (and moment) of balancing.
  bool get balanced {
    final big = forces.fold<double>(1, (m, f) => math.max(m, f.magnitude.abs()));
    return sumFx.abs() <= big * 1e-3 && sumFy.abs() <= big * 1e-3 && sumM.abs() <= big * 1e-3 * 10;
  }

  double get resultant => math.sqrt(sumFx * sumFx + sumFy * sumFy);
}

class FbdModel {
  const FbdModel({this.title = 'Free-body diagram', this.body = FbdBody.block, this.theta = 30, this.mass = 10, this.g = 9.81, this.mu = 0.3, this.forces = const [], this.showComponents = true});

  factory FbdModel.fromJson(Map<String, Object?> j) => FbdModel(
    title: _s(j['t'], 'Free-body diagram'),
    body: FbdBody.values.asNameMap()[j['b']] ?? FbdBody.block,
    theta: _d(j['th'], 30),
    mass: _d(j['m'], 10),
    g: _d(j['g'], 9.81),
    mu: _d(j['mu'], 0.3),
    forces: [for (final f in _l(j['f'])) FbdForce.fromJson(f)],
    showComponents: _b(j['comp'], true),
  );

  final String title;
  final FbdBody body;

  /// The incline's angle (degrees).
  final double theta;
  final double mass, g, mu;
  final List<FbdForce> forces;
  final bool showComponents;

  /// The surface the body rests on rises at this angle (0 when flat).
  double get surfaceAngle => body == FbdBody.incline ? theta : 0;

  /// The body's weight (N), straight down at its centre.
  FbdForce weight() => FbdForce('W', magnitude: _r(mass * g, 3), angle: -90);

  /// The normal reaction, square to the surface; its size balances the weight's share across
  /// the surface (mg cos θ). Like the weight and friction it is drawn through the centre (the
  /// body as a particle), so it has no moment.
  FbdForce normal() {
    final a = surfaceAngle;
    return FbdForce('N', magnitude: _r(mass * g * math.cos(a * math.pi / 180), 3), angle: 90 + a);
  }

  /// Limiting friction μN along the surface, against sliding down (on an incline) or against a
  /// push to the right (on the flat).
  FbdForce friction() {
    final a = surfaceAngle;
    final n = mass * g * math.cos(a * math.pi / 180);
    return FbdForce('f', magnitude: _r(mu * n, 3), angle: body == FbdBody.incline ? a : 180);
  }

  FbdModel copyWith({String? title, FbdBody? body, double? theta, double? mass, double? g, double? mu, List<FbdForce>? forces, bool? showComponents}) => FbdModel(
    title: title ?? this.title,
    body: body ?? this.body,
    theta: theta ?? this.theta,
    mass: mass ?? this.mass,
    g: g ?? this.g,
    mu: mu ?? this.mu,
    forces: forces ?? this.forces,
    showComponents: showComponents ?? this.showComponents,
  );

  Map<String, Object?> toJson() => {
    't': title,
    'b': body.name,
    'th': _r(theta),
    'm': _r(mass),
    'g': _r(g),
    'mu': _r(mu),
    'f': [for (final f in forces) f.toJson()],
    'comp': showComponents,
  };

  /// ΣFx, ΣFy and ΣM about the centre, with the first unknown force found so that ΣF = 0: its
  /// magnitude along its line (least squares when the line cannot cancel all of ΣF), or the whole
  /// force (the equilibrant).
  FbdResult solve() {
    final i = forces.indexWhere((f) => f.unknown != FbdUnknown.none);
    var list = forces;
    String? note;
    var residual = 0.0;
    if (i >= 0) {
      var sx = 0.0, sy = 0.0;
      for (final (j, f) in forces.indexed) {
        if (j == i) continue;
        sx += f.fx;
        sy += f.fy;
      }
      final u = forces[i];
      FbdForce found;
      if (u.unknown == FbdUnknown.force) {
        final m = math.sqrt(sx * sx + sy * sy);
        found = u.copyWith(magnitude: _r(m, 6), angle: m == 0 ? u.angle : _r(math.atan2(-sy, -sx) * 180 / math.pi, 6));
      } else {
        final c = math.cos(u.angle * math.pi / 180), s = math.sin(u.angle * math.pi / 180);
        final m = -(sx * c + sy * s);
        found = u.copyWith(magnitude: _r(m, 6));
        residual = (sx * -s + sy * c).abs();
        if (residual > 1e-6) note = 'the line of ${u.label} cannot balance the other forces';
      }
      list = [for (final (j, f) in forces.indexed) j == i ? found : f];
    }
    var fx = 0.0, fy = 0.0, mz = 0.0;
    for (final f in list) {
      fx += f.fx;
      fy += f.fy;
      mz += f.moment;
    }
    return FbdResult(forces: list, sumFx: fx, sumFy: fy, sumM: mz, solved: i >= 0 ? i : null, residual: residual, note: note);
  }
}
