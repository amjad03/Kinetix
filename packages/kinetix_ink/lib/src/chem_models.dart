import 'dart:math' as math;
import 'dart:ui';

// The chemical engineering panels' figures: a process flow diagram (ISA/ISO-style equipment and
// instrument symbols joined by numbered streams, with its stream table) and the unit operations
// worked out live: McCabe–Thiele stepping for a binary distillation column, a heat exchanger's
// temperature profiles and LMTD, and a CSTR against a PFR for a first-order reaction with the
// Levenspiel plot. Plain Dart, no Flutter widgets: the board paints them (chem_painting.dart) and
// the editors change them. JSON is tolerant: a missing or bad value falls back to a default.

double _d(Object? v, double fallback) => v is num && v.isFinite ? v.toDouble() : fallback;
int _i(Object? v, int fallback) => v is num && v.isFinite ? v.toInt() : fallback;
String _s(Object? v, String fallback) => v is String ? v : fallback;
bool _b(Object? v, bool fallback) => v is bool ? v : fallback;
List<Object?> _list(Object? v) => v is List ? v : const [];
Map<String, Object?> _map(Object? v) => v is Map ? v.cast<String, Object?>() : const {};

// --- Process flow diagram -------------------------------------------------------------------------

/// The equipment and instrument symbols of the PFD kit.
enum PfdUnitType { pump, compressor, gateValve, globeValve, controlValve, checkValve, vessel, tank, heatExchanger, reactor, column, separator, mixer, filter, instrument }

/// The default tag prefix of each symbol (P-101, E-101, V-101 …), as plant drawings number them.
const pfdTagPrefix = {
  PfdUnitType.pump: 'P',
  PfdUnitType.compressor: 'K',
  PfdUnitType.gateValve: 'HV',
  PfdUnitType.globeValve: 'HV',
  PfdUnitType.controlValve: 'FV',
  PfdUnitType.checkValve: 'NRV',
  PfdUnitType.vessel: 'V',
  PfdUnitType.tank: 'TK',
  PfdUnitType.heatExchanger: 'E',
  PfdUnitType.reactor: 'R',
  PfdUnitType.column: 'C',
  PfdUnitType.separator: 'S',
  PfdUnitType.mixer: 'M',
  PfdUnitType.filter: 'F',
  PfdUnitType.instrument: 'FIC',
};

/// A symbol's size on the diagram (panel units).
Size pfdUnitSize(PfdUnitType t) => switch (t) {
  PfdUnitType.pump || PfdUnitType.compressor => const Size(56, 56),
  PfdUnitType.gateValve || PfdUnitType.globeValve || PfdUnitType.checkValve => const Size(40, 24),
  PfdUnitType.controlValve => const Size(40, 44),
  PfdUnitType.vessel || PfdUnitType.reactor => const Size(70, 120),
  PfdUnitType.tank => const Size(100, 90),
  PfdUnitType.heatExchanger => const Size(64, 64),
  PfdUnitType.column => const Size(56, 220),
  PfdUnitType.separator => const Size(120, 56),
  PfdUnitType.mixer || PfdUnitType.filter => const Size(56, 40),
  PfdUnitType.instrument => const Size(44, 44),
};

/// One symbol on the diagram, centred at [pos].
class PfdUnit {
  const PfdUnit({required this.id, required this.type, required this.pos, this.tag = '', this.label = ''});

  final String id;
  final PfdUnitType type;
  final Offset pos;

  /// The equipment tag (P-101) or, for an instrument, its loop number (101).
  final String tag;

  /// A name under the symbol (Feed pump) or, for an instrument, its letters (FIC, TIC, LIC).
  final String label;

  Rect get rect => Rect.fromCenter(center: pos, width: pfdUnitSize(type).width, height: pfdUnitSize(type).height);

  PfdUnit copyWith({PfdUnitType? type, Offset? pos, String? tag, String? label}) =>
      PfdUnit(id: id, type: type ?? this.type, pos: pos ?? this.pos, tag: tag ?? this.tag, label: label ?? this.label);

  Map<String, Object?> toJson() => {'id': id, 'type': type.name, 'x': pos.dx, 'y': pos.dy, 'tag': tag, 'label': label};

  factory PfdUnit.fromJson(Map<String, Object?> j) => PfdUnit(
    id: _s(j['id'], ''),
    type: PfdUnitType.values.asNameMap()[j['type']] ?? PfdUnitType.vessel,
    pos: Offset(_d(j['x'], 100), _d(j['y'], 100)),
    tag: _s(j['tag'], ''),
    label: _s(j['label'], ''),
  );
}

/// A numbered process stream from one unit to another (or in from / out to the diagram's edge
/// when [from] / [to] is empty, at [a] / [b]), with its stream-table figures.
class PfdStream {
  const PfdStream({
    required this.number,
    this.from = '',
    this.to = '',
    this.a = Offset.zero,
    this.b = Offset.zero,
    this.flow = 0,
    this.temp = 25,
    this.pressure = 1,
    this.composition = '',
    this.signal = false,
    this.fromSide = '',
    this.toSide = '',
  });

  final int number;
  final String from, to;
  final Offset a, b;

  /// kg/h, °C, bar (absolute) and a short composition (mass fractions, e.g. "H2 0.75, N2 0.25").
  final double flow, temp, pressure;
  final String composition;

  /// An instrument signal line (dashed, no stream number, not in the stream table).
  final bool signal;

  /// Which side of the unit the stream leaves / enters ('l', 'r', 't', 'b'); empty: the side
  /// facing the other end.
  final String fromSide, toSide;

  PfdStream copyWith({int? number, String? from, String? to, Offset? a, Offset? b, double? flow, double? temp, double? pressure, String? composition, bool? signal, String? fromSide, String? toSide}) => PfdStream(
    number: number ?? this.number,
    from: from ?? this.from,
    to: to ?? this.to,
    a: a ?? this.a,
    b: b ?? this.b,
    flow: flow ?? this.flow,
    temp: temp ?? this.temp,
    pressure: pressure ?? this.pressure,
    composition: composition ?? this.composition,
    signal: signal ?? this.signal,
    fromSide: fromSide ?? this.fromSide,
    toSide: toSide ?? this.toSide,
  );

  Map<String, Object?> toJson() => {
    'n': number,
    'from': from,
    'to': to,
    'ax': a.dx,
    'ay': a.dy,
    'bx': b.dx,
    'by': b.dy,
    'flow': flow,
    't': temp,
    'p': pressure,
    'comp': composition,
    if (signal) 'signal': true,
    if (fromSide.isNotEmpty) 'fs': fromSide,
    if (toSide.isNotEmpty) 'ts': toSide,
  };

  factory PfdStream.fromJson(Map<String, Object?> j) => PfdStream(
    number: _i(j['n'], 1),
    from: _s(j['from'], ''),
    to: _s(j['to'], ''),
    a: Offset(_d(j['ax'], 0), _d(j['ay'], 0)),
    b: Offset(_d(j['bx'], 0), _d(j['by'], 0)),
    flow: _d(j['flow'], 0),
    temp: _d(j['t'], 25),
    pressure: _d(j['p'], 1),
    composition: _s(j['comp'], ''),
    signal: _b(j['signal'], false),
    fromSide: _s(j['fs'], ''),
    toSide: _s(j['ts'], ''),
  );
}

/// The ready-made diagrams.
enum PfdSample { distillation, ammonia, blank }

/// A process flow diagram: units, streams and (optionally) the stream table under it.
class PfdDiagram {
  const PfdDiagram({this.title = 'Process flow diagram', this.units = const [], this.streams = const [], this.showTable = true});

  final String title;
  final List<PfdUnit> units;
  final List<PfdStream> streams;
  final bool showTable;

  /// The drawing area (panel units); the stream table sits below it.
  static const area = Rect.fromLTWH(20, 70, 1200, 560);

  /// The snapping grid.
  static const grid = 20.0;

  static Offset snap(Offset p) => Offset((p.dx / grid).roundToDouble() * grid, (p.dy / grid).roundToDouble() * grid);

  PfdUnit? unitById(String id) {
    for (final u in units) {
      if (u.id == id) return u;
    }
    return null;
  }

  /// The next free stream number and unit id.
  int get nextStreamNumber => streams.fold(0, (m, s) => math.max(m, s.number)) + 1;
  String get nextUnitId {
    var n = units.length + 1;
    while (unitById('u$n') != null) {
      n++;
    }
    return 'u$n';
  }

  /// The next free tag for a [type] (P-101, P-102 …; instrument loops 101, 102 …).
  String nextTag(PfdUnitType type) {
    final prefix = pfdTagPrefix[type]!;
    var n = 101;
    final used = {for (final u in units) u.tag};
    while (used.contains(type == PfdUnitType.instrument ? '$n' : '$prefix-$n')) {
      n++;
    }
    return type == PfdUnitType.instrument ? '$n' : '$prefix-$n';
  }

  /// The streams in the stream table (process streams, by number).
  List<PfdStream> get tableStreams => [...streams.where((s) => !s.signal)]..sort((x, y) => x.number.compareTo(y.number));

  /// Where a stream leaves [u] towards [toward]: the middle of the side facing it.
  static Offset port(PfdUnit u, Offset toward, [String side = '']) {
    final r = u.rect;
    switch (side) {
      case 'l':
        return Offset(r.left, u.pos.dy);
      case 'r':
        return Offset(r.right, u.pos.dy);
      case 't':
        return Offset(u.pos.dx, r.top);
      case 'b':
        return Offset(u.pos.dx, r.bottom);
    }
    final d = toward - u.pos;
    if (d.dx.abs() * r.height >= d.dy.abs() * r.width) return Offset(d.dx >= 0 ? r.right : r.left, u.pos.dy);
    return Offset(u.pos.dx, d.dy >= 0 ? r.bottom : r.top);
  }

  /// The stream's route: from its source port to its destination port with right-angled bends.
  List<Offset> path(PfdStream s) {
    final from = unitById(s.from), to = unitById(s.to);
    final aim0 = to?.pos ?? s.b, aim1 = from?.pos ?? s.a;
    final p0 = from == null ? s.a : port(from, aim0, s.fromSide);
    final p1 = to == null ? s.b : port(to, aim1, s.toSide);
    if ((p0.dx - p1.dx).abs() < 0.5 || (p0.dy - p1.dy).abs() < 0.5) return [p0, p1];
    // Leave horizontally from a left/right port, vertically from a top/bottom one.
    final horizontal = from == null || (p0.dy - from.pos.dy).abs() < 0.5;
    if (horizontal) {
      final mx = (p0.dx + p1.dx) / 2;
      final endsVertical = to != null && (p1.dx - to.pos.dx).abs() < 0.5;
      return endsVertical ? [p0, Offset(p1.dx, p0.dy), p1] : [p0, Offset(mx, p0.dy), Offset(mx, p1.dy), p1];
    }
    final my = (p0.dy + p1.dy) / 2;
    final endsHorizontal = to == null || (p1.dy - to.pos.dy).abs() < 0.5;
    return endsHorizontal ? [p0, Offset(p0.dx, p1.dy), p1] : [p0, Offset(p0.dx, my), Offset(p1.dx, my), p1];
  }

  /// The unit under [p], top-most first; null when none.
  PfdUnit? unitAt(Offset p, {double slop = 6}) {
    for (final u in units.reversed) {
      if (u.rect.inflate(slop).contains(p)) return u;
    }
    return null;
  }

  /// The stream whose route passes within [slop] of [p]; null when none.
  PfdStream? streamAt(Offset p, {double slop = 8}) {
    for (final s in streams.reversed) {
      final pts = path(s);
      for (var i = 1; i < pts.length; i++) {
        if (_segDist(p, pts[i - 1], pts[i]) <= slop) return s;
      }
    }
    return null;
  }

  /// Joins [from] to [to] with a new stream (a signal line when either end is an instrument).
  PfdDiagram connect(String from, String to) {
    if (from == to || unitById(from) == null || unitById(to) == null) return this;
    final signal = unitById(from)!.type == PfdUnitType.instrument || unitById(to)!.type == PfdUnitType.instrument;
    return copyWith(streams: [...streams, PfdStream(number: signal ? 0 : nextStreamNumber, from: from, to: to, signal: signal)]);
  }

  /// Adds a [type] symbol at [at] (snapped) with the next free tag.
  PfdDiagram add(PfdUnitType type, Offset at) => copyWith(
    units: [...units, PfdUnit(id: nextUnitId, type: type, pos: snap(at), tag: nextTag(type), label: type == PfdUnitType.instrument ? 'FIC' : '')],
  );

  /// Moves a unit to [to] (snapped to the grid, kept inside the drawing area).
  PfdDiagram move(String id, Offset to) {
    final p = snap(Offset(to.dx.clamp(area.left + 20, area.right - 20), to.dy.clamp(area.top + 20, area.bottom - 20)));
    return copyWith(units: [for (final u in units) u.id == id ? u.copyWith(pos: p) : u]);
  }

  /// Removes a unit and every stream touching it.
  PfdDiagram removeUnit(String id) => copyWith(units: units.where((u) => u.id != id).toList(), streams: streams.where((s) => s.from != id && s.to != id).toList());

  PfdDiagram removeStream(int index) => copyWith(streams: [...streams]..removeAt(index));

  PfdDiagram copyWith({String? title, List<PfdUnit>? units, List<PfdStream>? streams, bool? showTable}) =>
      PfdDiagram(title: title ?? this.title, units: units ?? this.units, streams: streams ?? this.streams, showTable: showTable ?? this.showTable);

  Map<String, Object?> toJson() => {
    'title': title,
    'units': [for (final u in units) u.toJson()],
    'streams': [for (final s in streams) s.toJson()],
    'table': showTable,
  };

  factory PfdDiagram.fromJson(Map<String, Object?> j) => PfdDiagram(
    title: _s(j['title'], 'Process flow diagram'),
    units: [for (final u in _list(j['units'])) PfdUnit.fromJson(_map(u))],
    streams: [for (final s in _list(j['streams'])) PfdStream.fromJson(_map(s))],
    showTable: _b(j['table'], true),
  );

  /// A ready-made diagram.
  factory PfdDiagram.sample(PfdSample s) => switch (s) {
    PfdSample.distillation => PfdDiagram(
      title: 'Benzene–toluene distillation',
      units: const [
        PfdUnit(id: 'tk', type: PfdUnitType.tank, pos: Offset(120, 420), tag: 'TK-101', label: 'Feed tank'),
        PfdUnit(id: 'p1', type: PfdUnitType.pump, pos: Offset(280, 440), tag: 'P-101', label: 'Feed pump'),
        PfdUnit(id: 'e1', type: PfdUnitType.heatExchanger, pos: Offset(420, 380), tag: 'E-101', label: 'Preheater'),
        PfdUnit(id: 'c1', type: PfdUnitType.column, pos: Offset(600, 360), tag: 'C-101', label: 'Column'),
        PfdUnit(id: 'e2', type: PfdUnitType.heatExchanger, pos: Offset(800, 160), tag: 'E-102', label: 'Condenser'),
        PfdUnit(id: 'v1', type: PfdUnitType.vessel, pos: Offset(960, 220), tag: 'V-101', label: 'Reflux drum'),
        PfdUnit(id: 'p2', type: PfdUnitType.pump, pos: Offset(1100, 320), tag: 'P-102', label: 'Reflux pump'),
        PfdUnit(id: 'e3', type: PfdUnitType.heatExchanger, pos: Offset(800, 540), tag: 'E-103', label: 'Reboiler'),
        PfdUnit(id: 'fic', type: PfdUnitType.instrument, pos: Offset(420, 500), tag: '101', label: 'FIC'),
        PfdUnit(id: 'lic', type: PfdUnitType.instrument, pos: Offset(1060, 160), tag: '102', label: 'LIC'),
        PfdUnit(id: 'tic', type: PfdUnitType.instrument, pos: Offset(700, 440), tag: '103', label: 'TIC'),
      ],
      streams: const [
        PfdStream(number: 1, from: 'tk', to: 'p1', flow: 10000, temp: 25, pressure: 1.0, composition: 'Benzene 0.50, toluene 0.50'),
        PfdStream(number: 2, from: 'p1', to: 'e1', flow: 10000, temp: 25, pressure: 3.0, composition: 'Benzene 0.50, toluene 0.50'),
        PfdStream(number: 3, from: 'e1', to: 'c1', flow: 10000, temp: 92, pressure: 2.0, composition: 'Benzene 0.50, toluene 0.50'),
        PfdStream(number: 4, from: 'c1', to: 'e2', fromSide: 't', flow: 12000, temp: 81, pressure: 1.1, composition: 'Benzene 0.95, toluene 0.05'),
        PfdStream(number: 5, from: 'e2', to: 'v1', flow: 12000, temp: 78, pressure: 1.05, composition: 'Benzene 0.95, toluene 0.05'),
        PfdStream(number: 6, from: 'v1', to: 'p2', fromSide: 'b', flow: 12000, temp: 78, pressure: 1.05, composition: 'Benzene 0.95, toluene 0.05'),
        PfdStream(number: 7, from: 'p2', b: Offset(1200, 320), flow: 5000, temp: 78, pressure: 2.5, composition: 'Benzene 0.95, toluene 0.05'),
        PfdStream(number: 8, from: 'c1', to: 'e3', fromSide: 'b', flow: 5000, temp: 110, pressure: 1.3, composition: 'Benzene 0.05, toluene 0.95'),
        PfdStream(number: 9, from: 'e3', b: Offset(1200, 540), flow: 5000, temp: 110, pressure: 1.3, composition: 'Benzene 0.05, toluene 0.95'),
        PfdStream(number: 0, from: 'fic', to: 'p1', toSide: 'b', signal: true),
        PfdStream(number: 0, from: 'lic', to: 'v1', signal: true),
        PfdStream(number: 0, from: 'tic', to: 'e3', toSide: 't', signal: true),
      ],
    ),
    PfdSample.ammonia => PfdDiagram(
      title: 'Ammonia synthesis loop (Haber–Bosch)',
      units: const [
        PfdUnit(id: 'm1', type: PfdUnitType.mixer, pos: Offset(160, 300), tag: 'M-101', label: 'Make-up + recycle'),
        PfdUnit(id: 'k1', type: PfdUnitType.compressor, pos: Offset(300, 300), tag: 'K-101', label: 'Syngas compressor'),
        PfdUnit(id: 'e1', type: PfdUnitType.heatExchanger, pos: Offset(440, 300), tag: 'E-101', label: 'Feed preheater'),
        PfdUnit(id: 'r1', type: PfdUnitType.reactor, pos: Offset(600, 300), tag: 'R-101', label: 'Converter (Fe catalyst)'),
        PfdUnit(id: 'e2', type: PfdUnitType.heatExchanger, pos: Offset(780, 300), tag: 'E-102', label: 'Chiller'),
        PfdUnit(id: 's1', type: PfdUnitType.separator, pos: Offset(960, 300), tag: 'S-101', label: 'NH₃ separator'),
        PfdUnit(id: 'k2', type: PfdUnitType.compressor, pos: Offset(960, 520), tag: 'K-102', label: 'Recycle compressor'),
        PfdUnit(id: 'tic', type: PfdUnitType.instrument, pos: Offset(600, 160), tag: '101', label: 'TIC'),
        PfdUnit(id: 'lic', type: PfdUnitType.instrument, pos: Offset(960, 180), tag: '102', label: 'LIC'),
      ],
      streams: const [
        PfdStream(number: 1, to: 'm1', a: Offset(40, 300), flow: 8500, temp: 35, pressure: 25, composition: 'H₂ 0.75, N₂ 0.25 (mol)'),
        PfdStream(number: 2, from: 'm1', to: 'k1', flow: 42000, temp: 30, pressure: 25, composition: 'H₂ 0.68, N₂ 0.23, NH₃ 0.03, inerts'),
        PfdStream(number: 3, from: 'k1', to: 'e1', flow: 42000, temp: 120, pressure: 200, composition: 'H₂ 0.68, N₂ 0.23, NH₃ 0.03, inerts'),
        PfdStream(number: 4, from: 'e1', to: 'r1', flow: 42000, temp: 400, pressure: 198, composition: 'H₂ 0.68, N₂ 0.23, NH₃ 0.03, inerts'),
        PfdStream(number: 5, from: 'r1', to: 'e2', flow: 42000, temp: 450, pressure: 195, composition: 'H₂ 0.55, N₂ 0.19, NH₃ 0.17, inerts'),
        PfdStream(number: 6, from: 'e2', to: 's1', flow: 42000, temp: -10, pressure: 193, composition: 'H₂ 0.55, N₂ 0.19, NH₃ 0.17, inerts'),
        PfdStream(number: 7, from: 's1', b: Offset(1200, 400), flow: 8500, temp: -10, pressure: 193, composition: 'NH₃ 0.99 (liquid)'),
        PfdStream(number: 8, from: 's1', to: 'k2', flow: 33500, temp: -10, pressure: 193, composition: 'H₂ 0.66, N₂ 0.22, NH₃ 0.03, inerts'),
        PfdStream(number: 9, from: 'k2', to: 'm1', fromSide: 'l', toSide: 'b', flow: 33500, temp: 20, pressure: 200, composition: 'H₂ 0.66, N₂ 0.22, NH₃ 0.03, inerts'),
        PfdStream(number: 0, from: 'tic', to: 'r1', signal: true),
        PfdStream(number: 0, from: 'lic', to: 's1', signal: true),
      ],
    ),
    PfdSample.blank => const PfdDiagram(title: 'Process flow diagram'),
  };
}

double _segDist(Offset p, Offset a, Offset b) {
  final ab = b - a;
  final len2 = ab.dx * ab.dx + ab.dy * ab.dy;
  if (len2 == 0) return (p - a).distance;
  final t = (((p - a).dx * ab.dx + (p - a).dy * ab.dy) / len2).clamp(0.0, 1.0);
  return (p - (a + ab * t)).distance;
}

// --- Unit operations ------------------------------------------------------------------------------

/// Which unit operation a panel shows.
enum UnitOp { mccabeThiele, heatExchanger, reactors }

/// A binary distillation column by McCabe–Thiele: constant relative volatility [alpha], feed
/// [zF] at quality [q] (1 saturated liquid, 0 saturated vapour), distillate [xD], bottoms [xW]
/// and reflux ratio [reflux] (L/D).
class McCabeThiele {
  const McCabeThiele({this.alpha = 2.5, this.zF = 0.5, this.xD = 0.95, this.xW = 0.05, this.q = 1, this.reflux = 1.65});

  final double alpha, zF, xD, xW, q, reflux;

  /// y in equilibrium with liquid x.
  double yEq(double x) => alpha * x / (1 + (alpha - 1) * x);

  /// x in equilibrium with vapour y.
  double xEq(double y) => y / (alpha - (alpha - 1) * y);

  /// The rectifying (top) operating line.
  double yTop(double x) => reflux / (reflux + 1) * x + xD / (reflux + 1);

  /// Where the q-line meets the rectifying line (the operating lines cross there).
  Offset get intersection {
    if ((q - 1).abs() < 1e-9) return Offset(zF, yTop(zF));
    // q-line: y = q/(q−1)·x − zF/(q−1)
    final m = q / (q - 1), c = -zF / (q - 1);
    final r = reflux / (reflux + 1), d = xD / (reflux + 1);
    final x = (d - c) / (m - r);
    return Offset(x, r * x + d);
  }

  /// The stripping (bottom) operating line, through (xW, xW) and the intersection.
  double yBottom(double x) {
    final p = intersection;
    if ((p.dx - xW).abs() < 1e-12) return x;
    return xW + (p.dy - xW) * (x - xW) / (p.dx - xW);
  }

  /// Where the q-line meets the equilibrium curve (the pinch at minimum reflux).
  Offset get pinch {
    if ((q - 1).abs() < 1e-9) return Offset(zF, yEq(zF));
    // Bisection on f(x) = yEq(x) − qline(x) between 0 and 1.
    double qline(double x) => q / (q - 1) * x - zF / (q - 1);
    var lo = 0.0, hi = 1.0;
    double f(double x) => yEq(x) - qline(x);
    final rising = f(hi) > f(lo);
    for (var i = 0; i < 60; i++) {
      final mid = (lo + hi) / 2;
      if ((f(mid) > 0) == rising) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    final x = (lo + hi) / 2;
    return Offset(x, yEq(x));
  }

  /// The minimum reflux ratio: the top operating line through the pinch.
  double get minReflux {
    final p = pinch;
    final slope = (xD - p.dy) / (xD - p.dx);
    return slope / (1 - slope);
  }

  /// The minimum number of stages at total reflux (Fenske).
  double get minStages => math.log((xD / (1 - xD)) * ((1 - xW) / xW)) / math.log(alpha);

  /// Whether the column can work: compositions in order and reflux above the minimum.
  bool get feasible => alpha > 1 && xW < zF && zF < xD && xD < 1 && xW > 0 && reflux > minReflux;

  /// Steps down from (xD, xD): each step a horizontal to the equilibrium curve and a vertical to
  /// the operating line. [stages] counts whole stages (the reboiler included); [fraction] is the
  /// last stage's fractional part; [feedStage] is the stage that straddles the intersection.
  ({List<Offset> corners, int stages, double fraction, int feedStage}) step({int maxStages = 60}) {
    final corners = <Offset>[Offset(xD, xD)];
    if (!feasible) return (corners: corners, stages: 0, fraction: 0, feedStage: 0);
    final xi = intersection.dx;
    var x = xD, y = xD, n = 0, feed = 0;
    var fraction = 1.0;
    while (n < maxStages) {
      final xNew = xEq(y);
      n++;
      corners.add(Offset(xNew, y));
      if (xNew <= xW) {
        fraction = (x - xW) / (x - xNew);
        break;
      }
      if (feed == 0 && xNew < xi) feed = n;
      final yNew = xNew >= xi ? yTop(xNew) : yBottom(xNew);
      corners.add(Offset(xNew, yNew));
      x = xNew;
      y = yNew;
    }
    return (corners: corners, stages: n, fraction: fraction, feedStage: feed == 0 ? n : feed);
  }

  McCabeThiele copyWith({double? alpha, double? zF, double? xD, double? xW, double? q, double? reflux}) => McCabeThiele(
    alpha: alpha ?? this.alpha,
    zF: zF ?? this.zF,
    xD: xD ?? this.xD,
    xW: xW ?? this.xW,
    q: q ?? this.q,
    reflux: reflux ?? this.reflux,
  );

  Map<String, Object?> toJson() => {'alpha': alpha, 'zF': zF, 'xD': xD, 'xW': xW, 'q': q, 'R': reflux};

  factory McCabeThiele.fromJson(Map<String, Object?> j) => McCabeThiele(
    alpha: _d(j['alpha'], 2.5),
    zF: _d(j['zF'], 0.5),
    xD: _d(j['xD'], 0.95),
    xW: _d(j['xW'], 0.05),
    q: _d(j['q'], 1),
    reflux: _d(j['R'], 1.65),
  );
}

/// The log-mean temperature difference of the two end differences (equal ends give that value).
double lmtd(double dt1, double dt2) {
  if (dt1 <= 0 || dt2 <= 0) return double.nan;
  if ((dt1 - dt2).abs() < 1e-9) return dt1;
  return (dt1 - dt2) / math.log(dt1 / dt2);
}

/// A double-pipe / shell-and-tube heat exchanger: hot fluid [thIn] → [thOut], cold fluid enters
/// at [tcIn]; heat capacity rates [ch] and [cc] (kW/K) fix the cold outlet by the energy balance;
/// overall coefficient [u] (W/m²K) gives the area. [counter] is counter-current, else co-current.
class HeatExchanger {
  const HeatExchanger({this.thIn = 150, this.thOut = 90, this.tcIn = 30, this.ch = 2.0, this.cc = 3.0, this.u = 500, this.counter = true});

  final double thIn, thOut, tcIn, ch, cc, u;
  final bool counter;

  /// Heat duty, kW.
  double get duty => ch * (thIn - thOut);

  /// The cold outlet temperature from the energy balance.
  double get tcOut => tcIn + duty / cc;

  /// The two end temperature differences: (hot inlet end, hot outlet end).
  (double, double) get ends => counter ? (thIn - tcOut, thOut - tcIn) : (thIn - tcIn, thOut - tcOut);

  /// LMTD, K (NaN when the temperatures cross: no such exchanger).
  double get lmtdValue => lmtd(ends.$1, ends.$2);

  bool get feasible => thIn > thOut && thOut > tcIn && ch > 0 && cc > 0 && lmtdValue.isFinite;

  /// Area, m² (Q = U·A·ΔT_lm).
  double get area => duty * 1000 / (u * lmtdValue);

  /// The hot and cold temperatures at fraction [s] (0..1) of the length from the hot inlet: the
  /// difference between them changes exponentially along the exchanger.
  (double, double) at(double s) {
    final (a, b) = ends;
    final r = b / a;
    final f = (r - 1).abs() < 1e-9 ? s : (1 - math.pow(r, s)) / (1 - r);
    final th = thIn - (thIn - thOut) * f;
    final dt = a * math.pow(r, s);
    return (th, th - dt);
  }

  HeatExchanger copyWith({double? thIn, double? thOut, double? tcIn, double? ch, double? cc, double? u, bool? counter}) => HeatExchanger(
    thIn: thIn ?? this.thIn,
    thOut: thOut ?? this.thOut,
    tcIn: tcIn ?? this.tcIn,
    ch: ch ?? this.ch,
    cc: cc ?? this.cc,
    u: u ?? this.u,
    counter: counter ?? this.counter,
  );

  Map<String, Object?> toJson() => {'thIn': thIn, 'thOut': thOut, 'tcIn': tcIn, 'ch': ch, 'cc': cc, 'u': u, 'counter': counter};

  factory HeatExchanger.fromJson(Map<String, Object?> j) => HeatExchanger(
    thIn: _d(j['thIn'], 150),
    thOut: _d(j['thOut'], 90),
    tcIn: _d(j['tcIn'], 30),
    ch: _d(j['ch'], 2),
    cc: _d(j['cc'], 3),
    u: _d(j['u'], 500),
    counter: _b(j['counter'], true),
  );
}

/// First-order conversion in a CSTR with space time τ and rate constant k: X = kτ/(1 + kτ).
double cstrConversion(double k, double tau) => k * tau / (1 + k * tau);

/// First-order conversion in a PFR: X = 1 − e^(−kτ).
double pfrConversion(double k, double tau) => 1 - math.exp(-k * tau);

/// First-order conversion in [n] equal CSTRs in series sharing the total space time τ.
double cstrSeriesConversion(double k, double tau, int n) => 1 - 1 / math.pow(1 + k * tau / n, n);

/// The space time a CSTR needs for conversion [x] (first order): τ = X / (k(1 − X)).
double cstrSpaceTime(double k, double x) => x / (k * (1 - x));

/// The space time a PFR needs for conversion [x] (first order): τ = −ln(1 − X)/k.
double pfrSpaceTime(double k, double x) => -math.log(1 - x) / k;

/// CSTR against PFR for a first-order reaction A → B: rate constant [k] (1/min), target
/// conversion [target], and the Levenspiel plot (CA0/(−rA) against X).
class ReactorCompare {
  const ReactorCompare({this.k = 0.2, this.target = 0.8, this.tanks = 1});

  final double k, target;

  /// CSTRs in series (1 = a single CSTR).
  final int tanks;

  double get tauCstr => tanks <= 1 ? cstrSpaceTime(k, target) : tanks / k * (math.pow(1 - target, -1 / tanks) - 1);
  double get tauPfr => pfrSpaceTime(k, target);

  /// CA0/(−rA) = 1/(k(1 − X)).
  double levenspiel(double x) => 1 / (k * (1 - x));

  ReactorCompare copyWith({double? k, double? target, int? tanks}) => ReactorCompare(k: k ?? this.k, target: target ?? this.target, tanks: tanks ?? this.tanks);

  Map<String, Object?> toJson() => {'k': k, 'X': target, 'n': tanks};

  factory ReactorCompare.fromJson(Map<String, Object?> j) =>
      ReactorCompare(k: _d(j['k'], 0.2), target: _d(j['X'], 0.8).clamp(0.01, 0.99).toDouble(), tanks: _i(j['n'], 1).clamp(1, 10));
}

/// A unit-operation panel: which operation and its figures (each kept, so switching back keeps them).
class UnitOpPanel {
  const UnitOpPanel({this.title = '', this.op = UnitOp.mccabeThiele, this.mccabe = const McCabeThiele(), this.hx = const HeatExchanger(), this.reactors = const ReactorCompare()});

  final String title;
  final UnitOp op;
  final McCabeThiele mccabe;
  final HeatExchanger hx;
  final ReactorCompare reactors;

  String get heading => title.isNotEmpty
      ? title
      : switch (op) {
          UnitOp.mccabeThiele => 'Distillation: McCabe–Thiele',
          UnitOp.heatExchanger => 'Heat exchanger: temperature profiles and LMTD',
          UnitOp.reactors => 'CSTR vs PFR: first-order reaction',
        };

  UnitOpPanel copyWith({String? title, UnitOp? op, McCabeThiele? mccabe, HeatExchanger? hx, ReactorCompare? reactors}) =>
      UnitOpPanel(title: title ?? this.title, op: op ?? this.op, mccabe: mccabe ?? this.mccabe, hx: hx ?? this.hx, reactors: reactors ?? this.reactors);

  Map<String, Object?> toJson() => {'title': title, 'op': op.name, 'mt': mccabe.toJson(), 'hx': hx.toJson(), 'rx': reactors.toJson()};

  factory UnitOpPanel.fromJson(Map<String, Object?> j) => UnitOpPanel(
    title: _s(j['title'], ''),
    op: UnitOp.values.asNameMap()[j['op']] ?? UnitOp.mccabeThiele,
    mccabe: McCabeThiele.fromJson(_map(j['mt'])),
    hx: HeatExchanger.fromJson(_map(j['hx'])),
    reactors: ReactorCompare.fromJson(_map(j['rx'])),
  );
}
