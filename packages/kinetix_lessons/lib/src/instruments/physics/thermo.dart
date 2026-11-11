import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'kit.dart';

/// Thermodynamics (1st PUC ch. 11): the zeroth law, work on a P–V diagram, the first law,
/// thermodynamic processes, heat engines and the Carnot cycle.
final thermoSpec = InstrumentSpec(
  id: 'thermo',
  chapter: '1st PUC Physics · Thermodynamics',
  modes: {'zeroth': _zeroth, 'isobaric': _isobaric, 'firstlaw': _firstLaw, 'processes': _processes, 'engine': _engine, 'carnot': _carnot},
);

const _r = 8.314;

/// A gas cylinder with a piston at [frac] (0..1) of its length, gas tinted by temperature.
void _cylinder(Canvas c, Rect r, double frac, double tempK, {bool pinned = false, String? label}) {
  final gasRight = r.left + r.width * frac;
  final warm = ((tempK - 250) / 400).clamp(0.0, 1.0);
  c.drawRect(Rect.fromLTRB(r.left, r.top, gasRight, r.bottom), Draw.fill(Color.lerp(const Color(0xFFDCE8F5), const Color(0xFFF8D5BC), warm)!));
  final rnd = math.Random(3);
  for (var i = 0; i < 26; i++) {
    c.drawCircle(Offset(r.left + 8 + rnd.nextDouble() * (gasRight - r.left - 16), r.top + 8 + rnd.nextDouble() * (r.height - 16)), 4, Draw.fill(IX.accent.withValues(alpha: 0.6)));
  }
  c.drawPath(Path()..moveTo(r.right, r.top)..lineTo(r.left, r.top)..lineTo(r.left, r.bottom)..lineTo(r.right, r.bottom), Draw.stroke(IX.inkSoft, 5));
  Draw.block(c, Rect.fromLTWH(gasRight, r.top + 3, 26, r.height - 6), PX.iron, radius: 3);
  c.drawRect(Rect.fromLTWH(gasRight + 26, r.center.dy - 7, r.right + 60 - gasRight, 14), Draw.fill(IX.steel));
  if (pinned) {
    c.drawCircle(Offset(gasRight + 40, r.top - 12), 9, Draw.fill(IX.positive));
    Draw.text(c, 'pinned', Offset(gasRight + 40, r.top - 36), size: 16, color: IX.positive);
  }
  if (label != null) Draw.text(c, label, Offset((r.left + gasRight) / 2, r.center.dy), size: 19, halo: true);
}

// ── zeroth law ──

List<List<double>> _relax(V v, int steps) {
  var a = v['TA0']!, b = v['TB0']!, cc = v['TC0']!;
  const k = 0.06;
  final out = <List<double>>[];
  for (var i = 0; i <= steps; i++) {
    out.add([a, b, cc]);
    final ca = v['cc'] == 1 ? k * (cc - a) : 0.0, cb = v['cc'] == 1 ? k * (cc - b) : 0.0, ab = v['ab'] == 1 ? k * (b - a) : 0.0;
    a += ca + ab;
    b += cb - ab;
    cc -= ca + cb;
  }
  return out;
}

final _zeroth = ModeSpec(
  title: 'Three bodies and the zeroth law',
  formula: 'A ~ C and B ~ C  ⇒  A ~ B',
  values: {'TA0': 80, 'TB0': 20, 'TC0': 50, 'cc': 1, 'ab': 0, 'tt': 30},
  controls: (v) => const [Sl('TA0', 'A starts at', 0, 100, unit: '°C', div: 100), Sl('TB0', 'B starts at', 0, 100, unit: '°C', div: 100), Sl('TC0', 'C starts at', 0, 100, unit: '°C', div: 100), Sl('tt', 'Time', 0, 100, unit: 's', div: 100), Seg('cc', 'C touches A and B (diathermic)', ['No', 'Yes']), Seg('ab', 'A touches B', ['No', 'Yes'])],
  presets: {'Start': {'tt': 0}, 'Equilibrium': {'tt': 100}, 'Then join A and B': {'tt': 100, 'ab': 1}},
  readouts: (v) {
    final st = _relax(v, v['tt']!.round()).last;
    return [Readout('A', fx(st[0], 1), '°C', IX.positive), Readout('B', fx(st[1], 1), '°C', IX.accent), Readout('C', fx(st[2], 1), '°C', IX.green)];
  },
  paint: (c, s, v, t) {
    final hist = _relax(v, 100);
    final now = hist[v['tt']!.round()];
    final top = Rect.fromLTWH(0, 0, s.width, s.height * 0.46);
    Color tint(double tc) => Color.lerp(const Color(0xFF7FA8D6), const Color(0xFFE08A5A), tc / 100)!;
    final w = 230.0, h = 140.0, y = 70.0;
    final ra = Rect.fromLTWH(top.center.dx - w - 10, y, w, h), rb = Rect.fromLTWH(top.center.dx + 10, y, w, h);
    final rc = Rect.fromLTWH(top.center.dx - w - 10, y + h + 20, 2 * w + 20, 90);
    for (final (r, n, tc) in [(ra, 'A', now[0]), (rb, 'B', now[1]), (rc, 'C', now[2])]) {
      Draw.block(c, r, tint(tc), label: '$n  ${fx(tc, 1)} °C');
    }
    // Walls: thick hatched = adiabatic, thin = diathermic.
    final wall = v['ab'] == 1 ? Draw.stroke(IX.amber, 3) : Draw.stroke(IX.ink, 10);
    c.drawLine(Offset(top.center.dx, y), Offset(top.center.dx, y + h), wall);
    c.drawLine(Offset(ra.left, y + h + 10), Offset(rb.right, y + h + 10), v['cc'] == 1 ? Draw.stroke(IX.amber, 3) : Draw.stroke(IX.ink, 10));
    Draw.text(c, v['ab'] == 1 ? 'conducting wall' : 'insulating wall', Offset(top.center.dx, y - 18), size: 16, color: IX.inkSoft);
    final p = Plot(Rect.fromLTRB(26, top.bottom, s.width - 26, s.height - 22), 0, 100, 0, 100, xl: 'time (s)', yl: 'T (°C)', title: 'Temperatures settle to one common value');
    p.frame(c);
    for (var k = 0; k < 3; k++) {
      p.poly(c, [for (var i = 0; i <= 100; i++) Offset(i.toDouble(), hist[i][k])], [IX.positive, IX.accent, IX.green][k], w: 4);
    }
    p.legend(c, [('A', IX.positive), ('B', IX.accent), ('C', IX.green)]);
    p.vline(c, v['tt']!, IX.muted);
  },
);

// ── work at constant pressure ──

final _isobaric = ModeSpec(
  title: 'Work done by a gas at constant pressure',
  formula: 'W = P(V₂ − V₁)',
  values: {'P': 100, 'V1': 2, 'V2': 4},
  controls: (v) => const [Sl('P', 'Pressure P', 50, 500, unit: 'kPa', div: 45), Sl('V1', 'Initial volume V₁', 1, 20, unit: 'L', div: 19), Sl('V2', 'Final volume V₂', 1, 20, unit: 'L', div: 19)],
  presets: {'Expansion': {'V1': 2, 'V2': 4}, 'Compression (W < 0)': {'V1': 10, 'V2': 4}},
  readouts: (v) => [Readout('Work W = P(V₂ − V₁)', sg(v['P']! * (v['V2']! - v['V1']!), 0), 'J', IX.accent), Readout('ΔV', sg(v['V2']! - v['V1']!, 1), 'L')],
  paint: (c, s, v, t) {
    final pk = v['P']!, v1 = v['V1']!, v2 = v['V2']!;
    final left = Rect.fromLTWH(0, 0, s.width * 0.4, s.height);
    _cylinder(c, Rect.fromLTWH(40, left.center.dy - 90, left.width - 140, 180), v2 / 22, 300, label: '${fx(v2, 1)} L');
    IxPaint.dashed(c, Offset(40 + (left.width - 140) * v1 / 22, left.center.dy - 120), Offset(40 + (left.width - 140) * v1 / 22, left.center.dy + 120), Draw.stroke(IX.muted, 2));
    Draw.text(c, 'V₁', Offset(40 + (left.width - 140) * v1 / 22, left.center.dy - 136), size: 17, color: IX.muted);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 22, 0, 550, xl: 'V (L)', yl: 'P (kPa)', title: 'P–V diagram: work = area under the path');
    p.frame(c);
    p.area(c, (x) => pk, math.min(v1, v2), math.max(v1, v2), v2 >= v1 ? IX.accent : IX.positive);
    p.poly(c, [Offset(v1, pk), Offset(v2, pk)], IX.ink, w: 4);
    p.dot(c, v1, pk, IX.ink, label: '1');
    p.dot(c, v2, pk, IX.accent, label: '2');
    Draw.text(c, 'W = ${sg(pk * (v2 - v1), 0)} J', p.p((v1 + v2) / 2, pk / 2), size: 19, color: IX.accent, halo: true);
  },
);

// ── first law ──

const _fs = [3.0, 5.0, 7.0];

final _firstLaw = ModeSpec(
  title: 'Where does the heat go?',
  formula: 'ΔQ = ΔU + ΔW',
  values: {'Q': 1000, 'n': 0.5, 'proc': 1, 'f': 0},
  controls: (v) => const [Seg('proc', 'Piston', ['Pinned: constant V', 'Free: constant P']), Seg('f', 'Gas', ['Monatomic f = 3', 'Diatomic f = 5', 'Vibrating f = 7']), Sl('Q', 'Heat given Q', 100, 1500, unit: 'J', div: 28), Sl('n', 'Amount of gas', 0.2, 5, unit: 'mol', div: 48)],
  presets: {'Constant volume': {'proc': 0}, 'Constant pressure': {'proc': 1}, 'Diatomic, constant P': {'proc': 1, 'f': 1}},
  readouts: (v) {
    final f = _fs[v['f']!.round()], n = v['n']!, q = v['Q']!;
    final cv = f / 2 * _r, cp = cv + _r;
    final dt = v['proc'] == 0 ? q / (n * cv) : q / (n * cp);
    final du = n * cv * dt;
    return [Readout('Temperature rise ΔT', fx(dt, 1), 'K', IX.positive), Readout('ΔU', fx(du, 0), 'J', IX.amber), Readout('Work by the gas ΔW', fx(q - du, 0), 'J', IX.accent), Readout('γ = Cp/Cv', fx(cp / cv, 3), '')];
  },
  paint: (c, s, v, t) {
    final f = _fs[v['f']!.round()], n = v['n']!, q = v['Q']!;
    final cv = f / 2 * _r, cp = cv + _r;
    final pinned = v['proc'] == 0;
    final dt = pinned ? q / (n * cv) : q / (n * cp);
    final du = n * cv * dt;
    final left = Rect.fromLTWH(0, 0, s.width * 0.55, s.height);
    final cyl = Rect.fromLTWH(60, 120, left.width - 200, 200);
    final frac = pinned ? 0.5 : 0.5 * (300 + dt) / 300;
    _cylinder(c, cyl, frac, 300 + dt, pinned: pinned, label: '${fx(300 + dt, 0)} K');
    IxPaint.dashed(c, Offset(cyl.left + cyl.width * 0.5, cyl.top - 20), Offset(cyl.left + cyl.width * 0.5, cyl.bottom + 20), Draw.stroke(IX.muted, 2));
    // Flame under the cylinder.
    for (var i = 0; i < 5; i++) {
      final x = cyl.left + 40 + i * 50.0;
      final fl = Path()..moveTo(x - 14, cyl.bottom + 70)..quadraticBezierTo(x - 10, cyl.bottom + 30, x, cyl.bottom + 18)..quadraticBezierTo(x + 10, cyl.bottom + 30, x + 14, cyl.bottom + 70)..close();
      c.drawPath(fl, Draw.fill(IX.amber.withValues(alpha: 0.8)));
    }
    Draw.text(c, 'Q = ${fx(q, 0)} J in', Offset(cyl.left + 140, cyl.bottom + 100), size: 19, color: IX.amber);
    Draw.bars(c, Rect.fromLTRB(left.right + 10, 26, s.width - 26, s.height - 26), [('Q', q, IX.amber), ('ΔU', du, IX.positive), ('ΔW', q - du, IX.accent)], title: 'Energy (J)', dp: 0);
  },
);

// ── processes ──

const _procs = ['Isothermal', 'Adiabatic', 'Isobaric', 'Isochoric'];

double _pAt(int proc, double vv, double g) => switch (proc) {
  0 => 1000 / vv,
  1 => 100 * math.pow(10 / vv, g).toDouble(),
  _ => 100,
};

final _processes = ModeSpec(
  title: 'Isothermal, adiabatic, isobaric',
  formula: 'PV = const,  PV^γ = const',
  values: {'proc': 0, 'V2': 20, 'g': 1.67, 'all': 1},
  controls: (v) => [const Seg('proc', 'Process', _procs), if (v['proc'] != 3) const Sl('V2', 'Final volume V₂', 4, 30, unit: 'L', div: 26), if (v['proc'] == 3) const Sl('V2', 'Final pressure (× 10 kPa)', 4, 30, div: 26), const Sl('g', 'γ', 1.1, 1.67, div: 57), const Seg('all', 'Show all curves', ['Off', 'On'])],
  presets: {'Isothermal to 20 L': {'proc': 0, 'V2': 20}, 'Adiabatic to 20 L': {'proc': 1, 'V2': 20}, 'Isobaric to 20 L': {'proc': 2, 'V2': 20}, 'Diatomic γ = 1.4': {'proc': 1, 'g': 1.4}},
  readouts: (v) {
    final proc = v['proc']!.round(), v2 = v['V2']!, g = v['g']!;
    // Start: 10 L, 100 kPa, 300 K. Work in J (kPa × L).
    double w, p2, t2, q;
    if (proc == 3) {
      p2 = v2 * 10;
      w = 0;
      t2 = 300 * p2 / 100;
      q = (p2 * 10 - 1000) / (g - 1);
    } else {
      p2 = _pAt(proc, v2, g);
      w = switch (proc) { 0 => 1000 * math.log(v2 / 10), 1 => (1000 - p2 * v2) / (g - 1), _ => 100 * (v2 - 10) };
      t2 = 300 * p2 * v2 / 1000;
      q = (p2 * v2 - 1000) / (g - 1) + w;
    }
    return [Readout('Work done by the gas', sg(w, 0), 'J', IX.accent), Readout('Final pressure', fx(p2, 1), 'kPa'), Readout('Final temperature', fx(t2, 0), 'K', IX.positive), Readout('Heat taken in', sg(q, 0), 'J', IX.amber)];
  },
  paint: (c, s, v, t) {
    final proc = v['proc']!.round(), v2 = v['V2']!, g = v['g']!;
    final p = Plot(Rect.fromLTRB(26, 26, s.width - 26, s.height - 26), 0, 32, 0, 320, xl: 'V (L)', yl: 'P (kPa)', title: 'Start: 10 L, 100 kPa, 300 K. Work = area under the path.');
    p.frame(c);
    if (proc == 3) {
      p.poly(c, [const Offset(10, 100), Offset(10, v2 * 10)], IX.positive, w: 5);
      p.dot(c, 10, v2 * 10, IX.positive, label: 'no volume change: W = 0');
    } else {
      final a = math.min(10.0, v2), b = math.max(10.0, v2);
      p.area(c, (x) => _pAt(proc, x, g), a, b, IX.accent);
      if (v['all'] == 1) {
        for (var k = 0; k < 3; k++) {
          if (k != proc) p.fn(c, (x) => _pAt(k, x, g), [IX.green, IX.positive, IX.amber][k].withValues(alpha: 0.55), w: 2.5, a: 3, b: 31, dash: true, label: _procs[k].toLowerCase(), labelAt: k == 2 ? 28 : 6.5);
        }
      }
      p.fn(c, (x) => _pAt(proc, x, g), [IX.green, IX.positive, IX.amber][proc], w: 5, a: a, b: b);
      p.dot(c, v2, _pAt(proc, v2, g), IX.accent, label: '2');
    }
    p.dot(c, 10, 100, IX.ink, label: '1');
  },
);

// ── heat engine ──

final _engine = ModeSpec(
  title: 'Energy flow in a heat engine',
  formula: 'η = W/Q₁ = 1 − Q₂/Q₁',
  values: {'Q1': 1000, 'Q2': 600},
  controls: (v) => [const Sl('Q1', 'Heat taken from the source Q₁', 500, 5000, unit: 'J', div: 45), Sl('Q2', 'Heat rejected to the sink Q₂', 0, v['Q1']!, unit: 'J')],
  presets: {'Petrol engine (~30 %)': {'Q1': 1000, 'Q2': 700}, 'Steam engine (~10 %)': {'Q1': 1000, 'Q2': 900}, 'Impossible: Q₂ = 0': {'Q1': 1000, 'Q2': 0}},
  readouts: (v) {
    final q2 = math.min(v['Q2']!, v['Q1']!);
    return [Readout('Work W = Q₁ − Q₂', fx(v['Q1']! - q2, 0), 'J', IX.accent), Readout('Efficiency η', fx((1 - q2 / v['Q1']!) * 100, 1), '%', IX.green)];
  },
  paint: (c, s, v, t) {
    final q1 = v['Q1']!, q2 = math.min(v['Q2']!, q1), w = q1 - q2;
    final cx = s.width * 0.45;
    final src = Rect.fromCenter(center: Offset(cx, 100), width: 360, height: 90);
    final snk = Rect.fromCenter(center: Offset(cx, s.height - 100), width: 360, height: 90);
    Draw.block(c, src, const Color(0xFFD9653B), label: 'Hot source  T₁');
    Draw.block(c, snk, const Color(0xFF5B8FC7), label: 'Cold sink  T₂');
    final eng = Offset(cx, s.height / 2);
    c.drawCircle(eng, 80, Draw.fill(Colors.white));
    c.drawCircle(eng, 80, Draw.stroke(IX.ink, 4));
    Draw.text(c, 'Engine', eng, size: 22);
    double wd(double q) => 6 + 60 * q / 5000;
    c.drawLine(src.bottomCenter, eng - const Offset(0, 80), Draw.stroke(IX.positive, wd(q1)));
    if (q2 > 1) c.drawLine(eng + const Offset(0, 80), snk.topCenter, Draw.stroke(PX.waterEdge, wd(q2)));
    if (w > 1) {
      c.drawLine(eng + const Offset(80, 0), eng + const Offset(380, 0), Draw.stroke(IX.accent, wd(w)));
      IxPaint.arrow(c, eng + const Offset(370, 0), eng + const Offset(420, 0), IX.accent, width: 2, head: 30 + wd(w) * 0.6);
    }
    Draw.text(c, 'Q₁ = ${fx(q1, 0)} J', Offset.lerp(src.bottomCenter, eng - const Offset(0, 80), 0.5)! + Offset(wd(q1) / 2 + 20, 0), size: 20, color: IX.positive, align: Alignment.centerLeft);
    Draw.text(c, 'Q₂ = ${fx(q2, 0)} J', Offset.lerp(eng + const Offset(0, 80), snk.topCenter, 0.5)! + Offset(wd(q2) / 2 + 20, 0), size: 20, color: PX.waterEdge, align: Alignment.centerLeft);
    Draw.text(c, 'W = ${fx(w, 0)} J', eng + const Offset(240, -50), size: 22, color: IX.accent);
    Draw.tag(c, 'η = ${fx(w / q1 * 100, 1)} %', eng + const Offset(240, 70), color: IX.green, size: 22);
    if (q2 < 1) Draw.tag(c, 'Forbidden by the second law (Kelvin–Planck)', Offset(cx, s.height / 2 + 150), color: IX.positive);
  },
);

// ── Carnot cycle ──

final _carnot = ModeSpec(
  title: 'Run a Carnot engine',
  formula: 'η = 1 − T₂/T₁',
  values: {'T1': 500, 'T2': 300, 'shade': 1},
  controls: (v) => const [Sl('T1', 'Hot reservoir T₁', 300, 1500, unit: 'K', div: 120), Sl('T2', 'Cold reservoir T₂', 0, 1000, unit: 'K', div: 100), Seg('shade', 'Shade the work', ['Off', 'On'])],
  presets: {'500 K → 300 K': {'T1': 500, 'T2': 300}, 'Hotter source': {'T1': 1000, 'T2': 300}, 'Small gap': {'T1': 400, 'T2': 350}},
  readouts: (v) {
    final t1 = v['T1']!, t2 = math.min(v['T2']!, t1 - 1);
    final q1 = 0.1 * _r * t1 * math.ln2;
    return [Readout('Efficiency 1 − T₂/T₁', fx((1 - t2 / t1) * 100, 1), '%', IX.green), Readout('Heat in per cycle Q₁', fx(q1, 0), 'J', IX.positive), Readout('Work per cycle', fx(q1 * (1 - t2 / t1), 0), 'J', IX.accent), Readout('Heat out Q₂', fx(q1 * t2 / t1, 0), 'J', PX.waterEdge)];
  },
  paint: (c, s, v, t) {
    final t1 = v['T1']!, t2 = math.max(30.0, math.min(v['T2']!, t1 - 1));
    const n = 0.1, g = 5 / 3;
    // A at 1 L, B at 2 L (isothermal T₁), C and D on the adiabats down to T₂.
    const va = 1.0, vb = 2.0;
    final ratio = math.pow(t1 / t2, 1 / (g - 1)).toDouble();
    final vc = vb * ratio, vd = va * ratio;
    double piso(double vv, double tk) => n * _r * tk / vv; // kPa with V in L
    double padA(double vv, double v0, double tk) => piso(v0, tk) * math.pow(v0 / vv, g);
    final left = Rect.fromLTRB(26, 26, s.width * 0.6, s.height - 26);
    final vmax = vc * 1.1;
    final pmax = piso(va, t1) * 1.15;
    final p = Plot(left, 0, vmax, 0, pmax, xl: 'V (L)', yl: 'P (kPa)', title: 'Carnot cycle, 0.1 mol monatomic gas');
    p.frame(c);
    final path = Path();
    void seg(double a, double b, double Function(double) f, {bool first = false}) {
      for (var i = 0; i <= 60; i++) {
        final x = a + (b - a) * i / 60;
        final q = p.p(x, f(x));
        (first && i == 0) ? path.moveTo(q.dx, q.dy) : path.lineTo(q.dx, q.dy);
      }
    }
    seg(va, vb, (x) => piso(x, t1), first: true);
    seg(vb, vc, (x) => padA(x, vb, t1));
    seg(vc, vd, (x) => piso(x, t2));
    seg(vd, va, (x) => padA(x, va, t1));
    path.close();
    if (v['shade'] == 1) c.drawPath(path, Draw.fill(IX.accent.withValues(alpha: 0.14)));
    c.drawPath(path, Draw.stroke(IX.ink, 4));
    p.dot(c, va, piso(va, t1), IX.positive, label: 'A');
    p.dot(c, vb, piso(vb, t1), IX.positive, label: 'B  (T₁, takes in Q₁)');
    p.dot(c, vc, piso(vc, t2), PX.waterEdge, label: 'C');
    p.dot(c, vd, piso(vd, t2), PX.waterEdge, label: 'D  (T₂, gives out Q₂)', off: const Offset(-14, 22));
    final pr = Plot(Rect.fromLTRB(left.right + 16, 26, s.width - 26, s.height - 26), 0, 1000, 0, 100, xl: 'sink T₂ (K)', yl: 'η (%)', title: 'η against sink temperature');
    pr.frame(c);
    pr.fn(c, (x) => math.max(0, (1 - x / t1) * 100), IX.green, w: 4);
    pr.dot(c, t2, (1 - t2 / t1) * 100, IX.green);
  },
);
