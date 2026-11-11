import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'kit.dart';

/// Thermal properties of matter (1st PUC ch. 10): temperature scales, expansion, calorimetry,
/// change of state, conduction, radiation and Newton's law of cooling.
final thermalSpec = InstrumentSpec(
  id: 'thermal',
  chapter: '1st PUC Physics · Thermal properties of matter',
  modes: {'gasthermo': _gasThermo, 'scales': _scales, 'expansion': _expansion, 'calorimetry': _calorimetry, 'phase': _phase, 'conduction': _conduction, 'radiation': _radiation, 'cooling': _cooling},
);

/// A liquid-in-glass thermometer from [lo] to [hi] °C showing [tc].
void _thermometer(Canvas c, Offset bottom, double height, double tc, {double lo = -20, double hi = 120, String label = '', Color col = const Color(0xFFC2410C)}) {
  final tube = Rect.fromLTWH(bottom.dx - 9, bottom.dy - height, 18, height - 20);
  c.drawRRect(RRect.fromRectAndRadius(tube.inflate(4), const Radius.circular(12)), Draw.fill(Colors.white));
  c.drawRRect(RRect.fromRectAndRadius(tube.inflate(4), const Radius.circular(12)), Draw.stroke(IX.glassEdge, 2));
  c.drawCircle(bottom, 20, Draw.fill(col));
  c.drawCircle(bottom, 20, Draw.stroke(IX.glassEdge, 2));
  final f = ((tc - lo) / (hi - lo)).clamp(0.0, 1.0);
  c.drawRect(Rect.fromLTRB(tube.left + 4, tube.bottom - f * (tube.height - 10), tube.right - 4, bottom.dy), Draw.fill(col));
  final step = niceStep(hi - lo, 6);
  for (var x = (lo / step).ceil() * step; x <= hi; x += step) {
    final y = tube.bottom - (x - lo) / (hi - lo) * (tube.height - 10);
    c.drawLine(Offset(tube.right + 4, y), Offset(tube.right + 14, y), Draw.stroke(IX.inkSoft, 1.5));
    Draw.text(c, fx(x, 0), Offset(tube.right + 18, y), size: 14, color: IX.inkSoft, w: FontWeight.w500, align: Alignment.centerLeft);
  }
  if (label.isNotEmpty) Draw.text(c, label, Offset(bottom.dx, bottom.dy + 40), size: 18);
}

// ── constant-volume gas thermometer ──

const _amounts = ['Less', 'Medium', 'More'];
const _p0 = [50.0, 100.0, 150.0];

final _gasThermo = ModeSpec(
  title: 'Gas thermometer and absolute zero',
  formula: 'T (K) = t (°C) + 273.15',
  values: {'Tc': 30, 'gas': 1, 'ext': 0},
  controls: (v) => const [Sl('Tc', 'Temperature', -200, 200, unit: '°C', div: 80), Seg('gas', 'Amount of gas', _amounts), Seg('ext', 'Extend lines to zero pressure', ['Off', 'On'])],
  presets: {'Room (30 °C)': {'Tc': 30}, 'Boiling water': {'Tc': 100}, 'Liquid nitrogen (−196 °C)': {'Tc': -196}, 'Extrapolate': {'ext': 1, 'Tc': 0}},
  readouts: (v) {
    final tc = v['Tc']!;
    return [Readout('Kelvin', fx(tc + 273.15, 2), 'K', IX.accent), Readout('Fahrenheit', fx(1.8 * tc + 32, 1), '°F'), Readout('Pressure of this gas', fx(_p0[v['gas']!.round()] * (1 + tc / 273.15), 1), 'kPa', IX.positive)];
  },
  paint: (c, s, v, t) {
    final tc = v['Tc']!, gi = v['gas']!.round();
    final left = Rect.fromLTWH(0, 0, s.width * 0.3, s.height);
    // Bulb in a bath plus a pressure gauge.
    final bulb = Offset(left.center.dx - 30, s.height * 0.62);
    c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: bulb, width: 220, height: 200), const Radius.circular(14)), Draw.fill(Color.lerp(const Color(0xFFBFDBF3), const Color(0xFFF6C9A8), ((tc + 200) / 400).clamp(0, 1))!));
    c.drawCircle(bulb, 52, Draw.fill(Colors.white.withValues(alpha: 0.7)));
    c.drawCircle(bulb, 52, Draw.stroke(IX.glassEdge, 3));
    for (var i = 0; i < 5 + gi * 5; i++) {
      final a = i * 2.4, r = 10 + (i * 37 % 34);
      c.drawCircle(bulb + Offset(math.cos(a), math.sin(a)) * r.toDouble(), 4, Draw.fill(IX.accent.withValues(alpha: 0.7)));
    }
    c.drawLine(bulb + const Offset(0, -52), bulb + const Offset(0, -220), Draw.stroke(IX.glassEdge, 6));
    final gauge = bulb + const Offset(0, -270);
    c.drawCircle(gauge, 54, Draw.fill(Colors.white));
    c.drawCircle(gauge, 54, Draw.stroke(IX.ink, 3));
    final pk = _p0[gi] * (1 + tc / 273.15);
    final ang = math.pi * 0.75 + (pk / 300).clamp(0, 1) * math.pi * 1.5;
    c.drawLine(gauge, gauge + Offset(math.cos(ang), math.sin(ang)) * 44, Draw.stroke(IX.positive, 3));
    Draw.text(c, '${fx(pk, 0)} kPa', gauge + const Offset(0, 28), size: 15, color: IX.ink);
    Draw.text(c, 'constant volume', Offset(bulb.dx, bulb.dy + 130), size: 16, color: IX.inkSoft);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), -300, 200, 0, 300, xl: 't (°C)', yl: 'P (kPa)', title: 'Pressure against temperature at constant volume');
    p.frame(c);
    for (var i = 0; i < 3; i++) {
      final col = [IX.green, IX.accent, PX.violet][i];
      p.fn(c, (x) => _p0[i] * (1 + x / 273.15), col, w: i == gi ? 4.5 : 2.5, a: v['ext'] == 1 ? -273.15 : -200);
    }
    if (v['ext'] == 1) {
      p.dot(c, -273.15, 0, IX.positive, label: 'absolute zero −273.15 °C', off: const Offset(14, -26));
    }
    p.dot(c, tc, pk, IX.accent);
  },
);

// ── temperature scales ──

final _scales = ModeSpec(
  title: 'Converting temperatures',
  formula: 't_F = 9/5 t_C + 32,  T = t_C + 273.15',
  values: {'tc': 37},
  controls: (v) => const [Sl('tc', 'Celsius reading', -100, 200, unit: '°C', div: 300)],
  presets: {'Body (37 °C)': {'tc': 37}, 'Ice point': {'tc': 0}, '−40° (C = F)': {'tc': -40}, 'Steam point': {'tc': 100}},
  readouts: (v) => [Readout('Celsius', fx(v['tc']!, 1), '°C'), Readout('Fahrenheit', fx(1.8 * v['tc']! + 32, 1), '°F', IX.positive), Readout('Kelvin', fx(v['tc']! + 273.15, 2), 'K', IX.accent)],
  paint: (c, s, v, t) {
    final tc = v['tc']!;
    final left = Rect.fromLTWH(0, 0, s.width * 0.36, s.height);
    for (final (i, (name, val, lo, hi, col)) in [('°C', tc, -100.0, 200.0, IX.ink), ('°F', 1.8 * tc + 32, -148.0, 392.0, IX.positive), ('K', tc + 273.15, 173.0, 473.0, IX.accent)].indexed) {
      final x = left.width * (0.2 + i * 0.3);
      _thermometer(c, Offset(x, s.height - 110), s.height - 200, val, lo: lo, hi: hi, label: '${fx(val, 1)} $name', col: col == IX.ink ? IX.positive : col);
    }
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), -100, 200, -150, 500, xl: 't_C (°C)', yl: 'reading', title: 'Fahrenheit and kelvin against Celsius');
    p.frame(c);
    p.fn(c, (x) => 1.8 * x + 32, IX.positive, w: 4, label: '°F', labelAt: 170);
    p.fn(c, (x) => x + 273.15, IX.accent, w: 4, label: 'K', labelAt: 120);
    p.fn(c, (x) => x, IX.inkSoft, w: 2.5, dash: true, label: '°C', labelAt: 160);
    p.vline(c, tc, IX.muted);
    p.dot(c, tc, 1.8 * tc + 32, IX.positive);
    p.dot(c, tc, tc + 273.15, IX.accent);
  },
);

// ── expansion of rails ──

const _metals = ['Steel (12)', 'Copper (17)', 'Aluminium (25)'];
const _alphas = [12.0, 17.0, 25.0];
const _ymods = [200.0, 120.0, 70.0];

final _expansion = ModeSpec(
  title: 'Why rails have gaps',
  formula: 'ΔL = αLΔT,  stress = YαΔT',
  values: {'met': 0, 'dT': 20, 'L': 12, 'g0': 6},
  controls: (v) => const [Seg('met', 'Metal (α in 10⁻⁶ /K)', _metals), Sl('dT', 'Temperature rise ΔT', 0, 100, unit: 'K', div: 100), Sl('L', 'Rail length L', 5, 25, unit: 'm', div: 20), Sl('g0', 'Gap when laid', 2, 12, unit: 'mm', div: 20)],
  presets: {'Summer day (+20 K)': {'dT': 20}, 'Heat wave (+45 K)': {'dT': 45}, 'Long rails': {'L': 25, 'dT': 30}},
  readouts: (v) {
    final i = v['met']!.round();
    final dl = _alphas[i] * 1e-6 * v['L']! * v['dT']! * 1000;
    final gap = v['g0']! - dl;
    return [
      Readout('Expansion ΔL', fx(dl, 2), 'mm', IX.positive),
      Readout('Gap left', gap > 0 ? fx(gap, 2) : '0 (buckles)', gap > 0 ? 'mm' : '', IX.accent),
      Readout('Rise that closes the gap', fx(v['g0']! / 1000 / (_alphas[i] * 1e-6 * v['L']!), 0), 'K'),
      Readout('Stress if clamped YαΔT', fx(_ymods[i] * 1e9 * _alphas[i] * 1e-6 * v['dT']! / 1e6, 0), 'MPa'),
    ];
  },
  paint: (c, s, v, t) {
    final i = v['met']!.round();
    final dl = _alphas[i] * 1e-6 * v['L']! * v['dT']! * 1000; // mm
    final gap = v['g0']! - dl;
    final top = Rect.fromLTWH(0, 0, s.width, s.height * 0.5);
    // Joint, magnified: 1 mm drawn as 18 px.
    const mmPx = 18.0;
    final cx = top.center.dx, y = top.center.dy - 10;
    final gpx = math.max(0.0, gap) * mmPx;
    final railCol = [IX.steel, PX.copper, const Color(0xFFCBD2DC)][i];
    final hot = (v['dT']! / 100).clamp(0.0, 1.0);
    final col = Color.lerp(railCol, const Color(0xFFE07A3C), hot * 0.45)!;
    for (final sgn in [-1.0, 1.0]) {
      final inner = cx + sgn * gpx / 2;
      final r = sgn < 0 ? Rect.fromLTRB(40, y - 40, inner, y + 40) : Rect.fromLTRB(inner, y - 40, top.width - 40, y + 40);
      Draw.block(c, r, col, radius: 3);
    }
    if (gap <= 0) {
      Draw.tag(c, 'Gap closed: the rails push on each other and buckle', Offset(cx, y - 90), color: IX.positive);
    } else {
      Draw.dim(c, Offset(cx - gpx / 2, y + 70), Offset(cx + gpx / 2, y + 70), '${fx(gap, 2)} mm', color: IX.accent, off: 26);
    }
    for (final sgn in [-1.0, 1.0]) {
      final ghost = cx + sgn * v['g0']! * mmPx / 2;
      IxPaint.dashed(c, Offset(ghost, y - 60), Offset(ghost, y + 60), Draw.stroke(IX.muted, 2));
    }
    Draw.caption(c, 'Joint between two rails, magnified (1 mm = 18 px). Dashed: rail ends when laid.');
    final p = Plot(Rect.fromLTRB(26, top.bottom, s.width - 26, s.height - 22), 0, 100, 0, math.max(v['g0']! * 1.5, _alphas[i] * 1e-6 * v['L']! * 100 * 1000), xl: 'ΔT (K)', yl: 'ΔL (mm)', title: 'ΔL = αLΔT');
    p.frame(c);
    p.fn(c, (x) => _alphas[i] * 1e-6 * v['L']! * x * 1000, IX.positive, w: 4);
    p.hline(c, v['g0']!, IX.accent, label: 'gap when laid');
    p.dot(c, v['dT']!, dl, IX.positive);
  },
);

// ── calorimetry ──

const _cmet = ['Aluminium', 'Copper', 'Lead'];
const _cs = [900.0, 386.4, 127.7];

final _calorimetry = ModeSpec(
  title: 'Hot metal in cold water',
  formula: 'm₁c₁(T₁ − T) = m₂c_w(T − T₂)',
  values: {'met': 0, 'm1': 200, 'T1': 100, 'm2': 300, 'Tw': 25},
  controls: (v) => const [Seg('met', 'Metal', _cmet), Sl('m1', 'Metal mass m₁', 50, 1000, unit: 'g', div: 95), Sl('T1', 'Metal temperature T₁', 40, 300, unit: '°C', div: 52), Sl('m2', 'Water mass m₂', 50, 1000, unit: 'g', div: 95), Sl('Tw', 'Water starts at', 10, 40, unit: '°C', div: 30)],
  presets: {'Aluminium': {'met': 0}, 'Copper': {'met': 1}, 'Lead (small c)': {'met': 2}},
  readouts: (v) {
    final c1 = v['m1']! / 1000 * _cs[v['met']!.round()], c2 = v['m2']! / 1000 * 4186;
    final tf = (c1 * v['T1']! + c2 * v['Tw']!) / (c1 + c2);
    return [Readout('Final temperature', fx(tf, 1), '°C', IX.accent), Readout('Heat lost by metal', fx(c1 * (v['T1']! - tf), 0), 'J', IX.positive), Readout('Heat gained by water', fx(c2 * (tf - v['Tw']!), 0), 'J', PX.waterEdge)];
  },
  paint: (c, s, v, t) {
    final c1 = v['m1']! / 1000 * _cs[v['met']!.round()], c2 = v['m2']! / 1000 * 4186;
    final tf = (c1 * v['T1']! + c2 * v['Tw']!) / (c1 + c2);
    final left = Rect.fromLTWH(0, 0, s.width * 0.42, s.height);
    // Calorimeter: insulated jacket, copper cup, water, metal block, thermometer.
    final cup = Rect.fromCenter(center: Offset(left.center.dx - 20, s.height * 0.62), width: 260, height: 300);
    c.drawRRect(RRect.fromRectAndRadius(cup.inflate(26), const Radius.circular(18)), Draw.fill(const Color(0xFFE9E3D3)));
    c.drawRRect(RRect.fromRectAndRadius(cup.inflate(26), const Radius.circular(18)), Draw.stroke(const Color(0xFFB8AC8C), 2));
    final wl = cup.bottom - 60 - v['m2']! / 1000 * 220;
    c.drawRect(Rect.fromLTRB(cup.left, wl, cup.right, cup.bottom), Paint()..shader = ui.Gradient.linear(Offset(0, wl), Offset(0, cup.bottom), [PX.water, PX.waterEdge.withValues(alpha: 0.6)]));
    c.drawPath(Path()..moveTo(cup.left, cup.top)..lineTo(cup.left, cup.bottom)..lineTo(cup.right, cup.bottom)..lineTo(cup.right, cup.top), Draw.stroke(PX.copper, 5));
    final bs = 50 + math.sqrt(v['m1']!) * 2.4;
    Draw.block(c, Rect.fromCenter(center: Offset(cup.center.dx - 40, cup.bottom - bs / 2 - 8), width: bs, height: bs), [const Color(0xFFCBD2DC), PX.copper, PX.iron][v['met']!.round()], radius: 4);
    _thermometer(c, Offset(cup.center.dx + 70, cup.bottom - 40), 420, tf, lo: 0, hi: 120);
    Draw.text(c, 'final ${fx(tf, 1)} °C', Offset(cup.center.dx + 70, cup.top - 150), size: 19, color: IX.accent, halo: true);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 1, 0, math.max(v['T1']!, 100) * 1.05, xl: 'mass of water m₂ (kg)', yl: 'T (°C)', title: 'Final temperature against mass of water');
    p.frame(c);
    p.fn(c, (x) => (c1 * v['T1']! + x * 4186 * v['Tw']!) / (c1 + x * 4186), IX.accent, w: 4, a: 0.01);
    p.hline(c, v['Tw']!, PX.waterEdge, label: 'water start');
    p.dot(c, v['m2']! / 1000, tf, IX.accent);
  },
);

// ── heating curve ──

/// Heat (kJ) to take m kg of ice at ti up to state point q, with stage boundaries.
List<double> _stages(double m, double ti, double ts) => [m * 2.1 * (0 - ti), m * 333, m * 418.6, m * 2260, m * 2.01 * (ts - 100)];

double _tempAt(double q, double m, double ti, double ts) {
  final st = _stages(m, ti, ts);
  var acc = 0.0;
  if (q < acc + st[0]) return ti + q / (m * 2.1);
  acc += st[0];
  if (q < acc + st[1]) return 0;
  acc += st[1];
  if (q < acc + st[2]) return (q - acc) / (m * 4.186);
  acc += st[2];
  if (q < acc + st[3]) return 100;
  acc += st[3];
  return 100 + (q - acc) / (m * 2.01);
}

final _phase = ModeSpec(
  title: 'Heating ice to steam',
  formula: 'Q = mcΔT  or  Q = mL',
  values: {'m': 0.5, 'Ti': -20, 'Ts': 120, 'Pw': 1, 'tmin': 10},
  controls: (v) => const [Sl('m', 'Mass of ice m', 0.1, 2, unit: 'kg', div: 19), Sl('Ti', 'Ice starts at T₁', -40, 0, unit: '°C', div: 40), Sl('Ts', 'Steam ends at T₂', 100, 150, unit: '°C', div: 50), Sl('Pw', 'Heater power', 0.5, 3, unit: 'kW', div: 25), Sl('tmin', 'Heating time', 0, 60, unit: 'min', div: 120)],
  presets: {'Melting': {'tmin': 3}, 'Warming water': {'tmin': 6}, 'Boiling': {'tmin': 20}, 'All steam': {'tmin': 60}},
  readouts: (v) {
    final m = v['m']!, q = v['Pw']! * v['tmin']! * 60;
    final st = _stages(m, v['Ti']!, v['Ts']!);
    final tot = st.fold(0.0, (a, b) => a + b);
    return [Readout('Heat supplied', fx(math.min(q, tot), 0), 'kJ', IX.amber), Readout('Temperature', fx(_tempAt(math.min(q, tot), m, v['Ti']!, v['Ts']!), 1), '°C', IX.positive), Readout('Total for all stages', fx(tot, 0), 'kJ'), Readout('Share of boiling', fx(st[3] / tot * 100, 0), '%')];
  },
  paint: (c, s, v, t) {
    final m = v['m']!, ti = v['Ti']!, ts = v['Ts']!;
    final st = _stages(m, ti, ts);
    final tot = st.fold(0.0, (a, b) => a + b);
    final q = math.min(v['Pw']! * v['tmin']! * 60, tot);
    final (l, r) = (Rect.fromLTRB(26, 26, s.width * 0.62, s.height - 26), Rect.fromLTRB(s.width * 0.62 + 16, 26, s.width - 26, s.height - 26));
    final p = Plot(l, 0, tot * 1.04, -45, 160, xl: 'heat supplied Q (kJ)', yl: 'T (°C)', title: 'Heating curve');
    p.frame(c);
    p.fn(c, (x) => _tempAt(x, m, ti, ts), IX.ink, w: 4, b: tot);
    var acc = 0.0;
    final names = ['ice warms', 'melts at 0 °C', 'water warms', 'boils at 100 °C', 'steam'];
    final cols = [PX.waterEdge, IX.accent, IX.green, IX.positive, IX.amber];
    for (var i = 0; i < 5; i++) {
      if (i == 1 || i == 3) {
        Draw.text(c, names[i], p.p(acc + st[i] / 2, i == 1 ? 0 : 100) + const Offset(0, -22), size: 16, color: cols[i], halo: true);
      }
      acc += st[i];
    }
    p.dot(c, q, _tempAt(q, m, ti, ts), IX.positive);
    Draw.bars(c, r, [for (var i = 0; i < 5; i++) (['ice', 'melt', 'water', 'boil', 'steam'][i], st[i], cols[i])], title: 'Heat in each stage (kJ)', dp: 0);
  },
);

// ── conduction ──

const _cmats = ['Copper', 'Steel', 'Glass', 'Wood'];
const _ks = [385.0, 50.2, 0.8, 0.12];

final _conduction = ModeSpec(
  title: 'Heat flowing through a wall',
  formula: 'H = KA(T₁ − T₂)/L',
  values: {'mat': 1, 'Th': 100, 'L': 5, 'A': 1},
  controls: (v) => const [Seg('mat', 'Material', _cmats), Sl('Th', 'Hot side T₁', 50, 200, unit: '°C', div: 30), Sl('L', 'Thickness L', 1, 20, unit: 'cm', div: 19), Sl('A', 'Area A', 0.1, 2, unit: 'm²', div: 19)],
  presets: {'Copper': {'mat': 0}, 'Glass window': {'mat': 2, 'L': 1}, 'Wooden door': {'mat': 3, 'L': 4}},
  animate: true,
  readouts: (v) {
    final h = _ks[v['mat']!.round()] * v['A']! * v['Th']! / (v['L']! / 100);
    return [Readout('Heat current H', h >= 1000 ? fx(h / 1000, 2) : fx(h, 1), h >= 1000 ? 'kW' : 'W', IX.positive), Readout('Temperature gradient', fx(v['Th']! / (v['L']! / 100), 0), '°C/m'), Readout('Ice melted per minute', fx(h * 60 / 333000, 3), 'kg', PX.waterEdge)];
  },
  paint: (c, s, v, t) {
    final i = v['mat']!.round();
    final h = _ks[i] * v['A']! * v['Th']! / (v['L']! / 100);
    final top = Rect.fromLTWH(0, 0, s.width, s.height * 0.55);
    final w = 60 + v['L']! * 22, cx = top.center.dx;
    final slab = Rect.fromCenter(center: Offset(cx, top.center.dy + 10), width: w, height: 300);
    c.drawRect(Rect.fromLTRB(40, slab.top, slab.left, slab.bottom), Paint()..shader = ui.Gradient.linear(Offset(40, 0), Offset(slab.left, 0), [const Color(0xFFF6C9A8), const Color(0xFFE79A6A)]));
    c.drawRect(Rect.fromLTRB(slab.right, slab.top, top.width - 40, slab.bottom), Paint()..shader = ui.Gradient.linear(Offset(slab.right, 0), Offset(top.width - 40, 0), [const Color(0xFFD5E8F7), const Color(0xFFEFF6FC)]));
    c.drawRect(slab, Paint()..shader = ui.Gradient.linear(slab.centerLeft, slab.centerRight, [const Color(0xFFE79A6A), PX.water]));
    c.drawRect(slab, Draw.stroke(IX.inkSoft, 2));
    Draw.text(c, _cmats[i], slab.topCenter + const Offset(0, -20), size: 19);
    Draw.text(c, '${fx(v['Th']!, 0)} °C', Offset(120, slab.center.dy), size: 22, color: IX.positive);
    Draw.text(c, '0 °C (ice)', Offset(top.width - 130, slab.center.dy), size: 22, color: PX.waterEdge);
    // Heat "packets": speed on a log scale of H.
    final sp = 0.05 + 0.08 * math.log(1 + h) / math.ln10;
    for (var k = 0; k < 12; k++) {
      final f = (k / 12 + t * sp) % 1.0;
      final y = slab.top + 30 + (k * 53 % 240);
      c.drawCircle(Offset(slab.left + f * w, y.toDouble()), 6, Draw.fill(IX.amber.withValues(alpha: 0.85)));
    }
    Draw.dim(c, Offset(slab.left, slab.bottom + 30), Offset(slab.right, slab.bottom + 30), 'L = ${fx(v['L']!, 0)} cm', off: 22);
    final p = Plot(Rect.fromLTRB(26, top.bottom, s.width - 26, s.height - 22), 1, 20, 0, 1, xl: 'thickness L (cm)', yl: 'H (relative)', title: 'H ∝ 1/L for the same material and ΔT');
    p.frame(c);
    p.fn(c, (x) => 1 / x, IX.positive, w: 4);
    p.dot(c, v['L']!, 1 / v['L']!, IX.positive, label: h >= 1000 ? '${fx(h / 1000, 2)} kW' : '${fx(h, 1)} W');
  },
);

// ── radiation ──

final _radiation = ModeSpec(
  title: 'Radiated power and colour',
  formula: 'H = eσAT⁴,  λₘT = b',
  values: {'em': 1, 'A': 1, 'T': 1500},
  controls: (v) => const [Sl('T', 'Temperature T', 200, 6000, unit: 'K', div: 116), Sl('em', 'Emissivity e', 0.05, 1, div: 19), Sl('A', 'Area A', 0.1, 2, unit: 'm²', div: 19)],
  presets: {'Room (300 K)': {'T': 300}, 'Red hot (1000 K)': {'T': 1000}, 'Bulb filament (2800 K)': {'T': 2800}, 'The Sun (5800 K)': {'T': 5800}},
  readouts: (v) {
    final h = v['em']! * 5.67e-8 * v['A']! * math.pow(v['T']!, 4);
    return [Readout('Power H', sc(h.toDouble()), 'W', IX.positive), Readout('Peak wavelength λₘ', fx(2898 / v['T']!, 3), 'µm', IX.accent), Readout('Peak in', 2898 / v['T']! * 1000 < 400 ? 'ultraviolet' : (2898 / v['T']! * 1000 < 700 ? 'visible' : 'infrared'), '')];
  },
  paint: (c, s, v, t) {
    final tk = v['T']!;
    final left = Rect.fromLTWH(0, 0, s.width * 0.32, s.height);
    final glow = ((tk - 700) / 2500).clamp(0.0, 1.0);
    final col = Color.lerp(const Color(0xFF6B7280), Color.lerp(const Color(0xFFD9480F), const Color(0xFFFFF4D6), ((tk - 1500) / 4000).clamp(0, 1))!, glow)!;
    final o = Offset(left.center.dx, left.center.dy - 30);
    if (glow > 0) c.drawCircle(o, 170, Paint()..shader = ui.Gradient.radial(o, 170, [col.withValues(alpha: 0.55), col.withValues(alpha: 0)]));
    Draw.ball(c, o, 90, col);
    Draw.text(c, '${fx(tk, 0)} K', o + const Offset(0, 140), size: 22);
    // Planck curve, normalised to its peak, with the visible band.
    double planck(double lumUm) {
      final l = lumUm * 1e-6;
      return 1 / (math.pow(l, 5) * (math.exp(0.014388 / (l * tk)) - 1));
    }
    final lm = 2898 / tk;
    final peak = planck(lm);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 4, 0, 1.1, xl: 'λ (µm)', yl: 'intensity (relative)', title: 'Spectrum of a black body: the peak moves as 1/T');
    p.frame(c);
    for (var nm = 400; nm < 700; nm += 10) {
      c.drawRect(Rect.fromLTRB(p.px(nm / 1000), p.r.top, p.px((nm + 10) / 1000), p.r.bottom), Draw.fill(Draw.spectral(nm.toDouble()).withValues(alpha: 0.18)));
    }
    p.fn(c, (x) => x <= 0.05 ? 0 : planck(x) / peak, IX.positive, w: 4, a: 0.05);
    p.vline(c, lm, IX.accent, label: 'λₘ = ${fx(lm, 2)} µm');
  },
);

// ── cooling ──

final _cooling = ModeSpec(
  title: "Newton's law of cooling",
  formula: 'T = Tₛ + (T₀ − Tₛ)e^(−kt)',
  values: {'T0': 90, 'Ts': 25, 'k': 0.05, 'tt': 10, 'lid': 0},
  controls: (v) => const [Sl('T0', 'Starting temperature T₀', 40, 100, unit: '°C', div: 60), Sl('Ts', 'Room temperature Tₛ', 0, 40, unit: '°C', div: 40), Sl('k', 'Cooling constant k', 0.01, 0.5, unit: '/min', dp: 3), Sl('tt', 'Time t', 0, 60, unit: 'min', div: 120), Seg('lid', 'Second cup with a lid (k/2)', ['Off', 'On'])],
  presets: {'Tea, no lid': {'k': 0.05}, 'With a lid': {'k': 0.05, 'lid': 1}, 'Fast cooling': {'k': 0.2}},
  readouts: (v) {
    final tt = v['Ts']! + (v['T0']! - v['Ts']!) * math.exp(-v['k']! * v['tt']!);
    return [Readout('Temperature now', fx(tt, 1), '°C', IX.positive), Readout('Cooling rate now', fx(v['k']! * (tt - v['Ts']!), 2), '°C/min'), Readout('Excess halves every', fx(math.ln2 / v['k']!, 1), 'min', IX.accent)];
  },
  paint: (c, s, v, t) {
    final ts = v['Ts']!, t0 = v['T0']!, k = v['k']!, tt = v['tt']!;
    final left = Rect.fromLTWH(0, 0, s.width * 0.3, s.height);
    final temp = ts + (t0 - ts) * math.exp(-k * tt);
    // A cup with steam whose strength follows the excess temperature.
    final cup = Rect.fromCenter(center: Offset(left.center.dx, s.height * 0.58), width: 170, height: 170);
    c.drawRRect(RRect.fromRectAndCorners(cup, bottomLeft: const Radius.circular(40), bottomRight: const Radius.circular(40)), Draw.fill(const Color(0xFFF1F4F9)));
    c.drawRRect(RRect.fromRectAndCorners(cup, bottomLeft: const Radius.circular(40), bottomRight: const Radius.circular(40)), Draw.stroke(IX.inkSoft, 3));
    c.drawArc(Rect.fromCenter(center: cup.centerRight + const Offset(10, 0), width: 70, height: 80), -math.pi / 2, math.pi, false, Draw.stroke(IX.inkSoft, 6));
    c.drawRect(Rect.fromLTRB(cup.left + 10, cup.top + 20, cup.right - 10, cup.top + 34), Draw.fill(const Color(0xFFB07A4A)));
    final steam = ((temp - ts) / 70).clamp(0.0, 1.0);
    for (var i = -1; i <= 1; i++) {
      final path = Path()..moveTo(cup.center.dx + i * 40, cup.top - 10);
      for (var j = 1; j <= 8; j++) {
        path.lineTo(cup.center.dx + i * 40 + math.sin(j + t * 2 + i) * 10, cup.top - 10 - j * 16);
      }
      c.drawPath(path, Draw.stroke(IX.muted.withValues(alpha: 0.8 * steam), 4));
    }
    Draw.text(c, '${fx(temp, 1)} °C', Offset(cup.center.dx, cup.bottom + 40), size: 24, color: IX.positive);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 60, 0, 100, xl: 't (min)', yl: 'T (°C)', title: 'Cooling curve: fast at first, slow near room temperature');
    p.frame(c);
    p.fn(c, (x) => ts + (t0 - ts) * math.exp(-k * x), IX.positive, w: 4, label: 'no lid', labelAt: 50);
    if (v['lid'] == 1) p.fn(c, (x) => ts + (t0 - ts) * math.exp(-k / 2 * x), IX.accent, w: 4, label: 'with lid', labelAt: 40);
    p.hline(c, ts, IX.muted, label: 'room');
    p.dot(c, tt, temp, IX.positive);
  },
);
