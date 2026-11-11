import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'em_kit.dart';
import 'kit.dart';

/// Semiconductor electronics (2nd PUC ch. 14 and 17): energy bands, intrinsic carriers, doping
/// and the mass-action law, the p-n diode, rectifiers, the Zener regulator and the solar cell.
final semiconductorSpec = InstrumentSpec(
  id: 'semiconductor',
  chapter: '2nd PUC Physics · Semiconductor electronics',
  modes: {'bands': _bands, 'intrinsic': _intrinsic, 'doping': _doping, 'diode': _diode, 'rectifier': _rectifier, 'zener': _zener, 'solar': _solar},
);

const _k = 8.617e-5; // eV/K
double _ni(double t) => 1.5e16 * math.pow(t / 300, 1.5) * math.exp(-1.1 / (2 * _k) * (1 / t - 1 / 300));
double _log10(double x) => math.log(x) / math.ln10;

/// A diode symbol from a (anode) to b (cathode).
void _diodeSym(Canvas c, Offset a, Offset b, {Color col = IX.ink}) {
  final d = b - a, len = d.distance, u = d / len, n = Offset(-u.dy, u.dx);
  final m = Offset.lerp(a, b, 0.5)!;
  c.drawLine(a, m - u * 16, Draw.wire(col));
  c.drawLine(m + u * 16, b, Draw.wire(col));
  final tri = Path()..moveTo((m - u * 16 + n * 18).dx, (m - u * 16 + n * 18).dy)..lineTo((m - u * 16 - n * 18).dx, (m - u * 16 - n * 18).dy)..lineTo((m + u * 16).dx, (m + u * 16).dy)..close();
  c.drawPath(tri, Draw.fill(col));
  c.drawLine(m + u * 16 + n * 18, m + u * 16 - n * 18, Draw.stroke(col, 4));
}

// ── energy bands ──

final _bands = ModeSpec(
  title: 'Energy bands: metal, semiconductor, insulator',
  formula: 'electrons across the gap ∝ e^(−E_g/2kT)',
  values: {'T': 300, 'Eg': 1.1},
  controls: (v) => const [Sl('T', 'Temperature T', 50, 600, unit: 'K', div: 55), Sl('Eg', 'Band gap of the middle solid E_g', 0.5, 6, unit: 'eV', div: 55)],
  presets: {'Silicon at 300 K': {'Eg': 1.1, 'T': 300}, 'Germanium': {'Eg': 0.71}, 'Hot silicon (600 K)': {'T': 600}},
  readouts: (v) {
    final f = math.exp(-v['Eg']! / (2 * _k * v['T']!));
    return [Readout('kT', fx(_k * v['T']! * 1000, 1), 'meV'), Readout('e^(−E_g/2kT)', sc(f), '', IX.accent), Readout('Diamond (5.5 eV)', sc(math.exp(-5.5 / (2 * _k * v['T']!))), '')];
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.55);
    final w = (left.width - 80) / 3;
    final rnd = math.Random(2);
    for (final (i, name, gap) in [(0, 'Metal', -0.6), (1, 'Semiconductor', v['Eg']!), (2, 'Insulator', 6.0)]) {
      final x0 = left.left + 30 + i * (w + 10);
      final y = left.center.dy + 40;
      const ppe = 46.0;
      final vb = Rect.fromLTWH(x0, y, w, 130);
      final cbTop = y - gap * ppe - 130;
      final cb = Rect.fromLTWH(x0, cbTop, w, 130);
      c.drawRRect(RRect.fromRectAndRadius(vb, const Radius.circular(8)), Draw.fill(IX.accent.withValues(alpha: 0.25)));
      c.drawRRect(RRect.fromRectAndRadius(cb, const Radius.circular(8)), Draw.fill(IX.positive.withValues(alpha: 0.12)));
      c.drawRRect(RRect.fromRectAndRadius(cb, const Radius.circular(8)), Draw.stroke(IX.positive.withValues(alpha: 0.5), 1.5));
      final frac = gap <= 0 ? 1.0 : math.exp(-gap / (2 * _k * v['T']!));
      final ne = gap <= 0 ? 14 : (frac * 3e9).clamp(0, 14).round();
      for (var k = 0; k < ne; k++) {
        Draw.ball(c, Offset(x0 + 14 + rnd.nextDouble() * (w - 28), cb.bottom - 14 - rnd.nextDouble() * 40), 6, IX.negative);
      }
      if (gap > 0) Draw.dim(c, Offset(x0 + w / 2, cb.bottom), Offset(x0 + w / 2, vb.top), 'E_g = ${fx(gap, 1)} eV', off: 0.01);
      Draw.text(c, name, Offset(x0 + w / 2, vb.bottom + 30), size: 18);
      Draw.text(c, 'conduction', Offset(x0 + w / 2, cb.top + 20), size: 14, color: IX.positive);
      Draw.text(c, 'valence (full)', Offset(x0 + w / 2, vb.bottom - 20), size: 14, color: IX.accent);
    }
    Draw.caption(c, 'Heat lifts a few electrons across a small gap; across a wide gap, practically none.');
    final p = Plot(right, 200, 600, -50, 0, xl: 'T (K)', yl: 'log₁₀ e^(−E_g/2kT)', title: 'Chance of crossing the gap rises steeply with T');
    p.frame(c);
    p.fn(c, (x) => _log10(math.exp(-v['Eg']! / (2 * _k * x))).clamp(-50.0, 0.0), IX.accent, w: 4);
    p.dot(c, v['T']!.clamp(200, 600), _log10(math.exp(-v['Eg']! / (2 * _k * v['T']!.clamp(200, 600)))).clamp(-50.0, 0.0), IX.accent);
  },
);

// ── intrinsic carriers ──

void _lattice(Canvas c, Rect r, {int? dopant, int broken = 0, bool field = false, double t = 0}) {
  const n = 6;
  final dx = r.width / n, dy = r.height / n;
  Offset at(int i, int j) => Offset(r.left + dx * (i + 0.5), r.top + dy * (j + 0.5));
  for (var j = 0; j < n; j++) {
    for (var i = 0; i < n; i++) {
      if (i < n - 1) c.drawLine(at(i, j), at(i + 1, j), Draw.stroke(IX.rule, 6));
      if (j < n - 1) c.drawLine(at(i, j), at(i, j + 1), Draw.stroke(IX.rule, 6));
    }
  }
  final rnd = math.Random(9);
  for (var j = 0; j < n; j++) {
    for (var i = 0; i < n; i++) {
      final isD = dopant != null && i == 2 && j == 2;
      Draw.ball(c, at(i, j), 22, isD ? (dopant == 5 ? IX.green : PX.violet) : const Color(0xFF9AA3B5));
      Draw.text(c, isD ? (dopant == 5 ? 'P' : 'B') : 'Si', at(i, j), size: 14, color: Colors.white);
    }
  }
  for (var k = 0; k < broken; k++) {
    final i = rnd.nextInt(n - 1), j = rnd.nextInt(n);
    final hole = Offset.lerp(at(i, j), at(i + 1, j), 0.5)!;
    final drift = field ? (t * 30) % dx : 0.0;
    c.drawCircle(hole + Offset(drift, 0), 8, Draw.stroke(IX.positive, 3));
    Draw.ball(c, hole + Offset(-drift, -dy * 0.35), 7, IX.negative);
  }
}

final _intrinsic = ModeSpec(
  title: 'Electrons and holes in pure silicon',
  formula: 'n_e = n_h = n_i ∝ T^(3/2) e^(−E_g/2kT)',
  values: {'T': 300, 'fld': 0},
  animate: true,
  controls: (v) => const [Sl('T', 'Temperature T', 200, 500, unit: 'K', div: 30), Seg('fld', 'Electric field', ['Off', 'On'])],
  presets: {'Room temperature': {'T': 300}, 'Hot (450 K)': {'T': 450}, 'With a field': {'fld': 1}},
  readouts: (v) => [Readout('n_i', sc(_ni(v['T']!)), 'm⁻³', IX.accent), Readout('n_e = n_h', 'equal', ''), Readout('Atoms per m³', '5 × 10²⁸', '')],
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.48);
    final broken = ((_log10(_ni(v['T']!)) - 12) * 1.2).clamp(0, 14).round();
    _lattice(c, left.deflate(50).translate(0, 20), broken: broken, field: v['fld'] == 1, t: t);
    if (v['fld'] == 1) Draw.force(c, Offset(left.left + 60, left.top + 60), Offset(left.left + 220, left.top + 60), IX.positive, 'E');
    Draw.caption(c, 'Each broken bond frees an electron (blue) and leaves a hole (ring).');
    final p = Plot(right, 250, 500, 12, 22, xl: 'T (K)', yl: 'log₁₀ n_i (m⁻³)', title: 'n_i of silicon rises steeply with temperature');
    p.frame(c);
    p.fn(c, (x) => _log10(_ni(x)), IX.accent, w: 4);
    p.dot(c, v['T']!.clamp(250, 500), _log10(_ni(v['T']!.clamp(250, 500))), IX.accent);
  },
);

// ── doping ──

final _doping = ModeSpec(
  title: 'Doping: n-type and p-type',
  formula: 'n_e n_h = n_i²',
  values: {'s': 21, 'type': 0},
  controls: (v) => const [Sl('s', 'Dopant density, log₁₀ (m⁻³)', 17, 24, div: 70), Seg('type', 'Dopant', ['Pentavalent (n-type)', 'Trivalent (p-type)'])],
  presets: {'n-type, 10²¹': {'s': 21, 'type': 0}, 'p-type, 10²¹': {'s': 21, 'type': 1}, 'Light doping 10¹⁷': {'s': 17}},
  readouts: (v) {
    final nd = math.pow(10, v['s']!).toDouble(), ni = 1.5e16;
    final maj = nd / 2 + math.sqrt(nd * nd / 4 + ni * ni), min = ni * ni / maj;
    final n = v['type'] == 0;
    return [Readout('Electrons n_e', sc(n ? maj : min), 'm⁻³', IX.negative), Readout('Holes n_h', sc(n ? min : maj), 'm⁻³', IX.positive), Readout('Majority carriers', n ? 'electrons' : 'holes', '', IX.accent)];
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.48);
    final n = v['type'] == 0;
    final r = left.deflate(50).translate(0, 20);
    _lattice(c, r, dopant: n ? 5 : 3);
    final d = Offset(r.left + r.width / 6 * 2.5, r.top + r.height / 6 * 2.5);
    if (n) {
      Draw.ball(c, d + const Offset(36, -40), 8, IX.negative);
      Draw.text(c, 'fifth electron, free', d + const Offset(60, -70), size: 16, color: IX.negative, halo: true);
    } else {
      c.drawCircle(Offset.lerp(d, d + Offset(r.width / 6, 0), 0.5)!, 9, Draw.stroke(IX.positive, 3));
      Draw.text(c, 'missing bond: a hole', d + const Offset(60, -50), size: 16, color: IX.positive, halo: true);
    }
    Draw.caption(c, n ? 'Phosphorus gives one electron: n-type.' : 'Boron leaves a bond short: p-type.');
    final p = Plot(right, 17, 24, 6, 25, xl: 'log₁₀ N (m⁻³)', yl: 'log₁₀ density', title: 'Majority rises with doping; minority falls (n_i² fixed)');
    p.frame(c);
    double maj(double x) {
      final nd = math.pow(10, x).toDouble();
      return _log10(nd / 2 + math.sqrt(nd * nd / 4 + 2.25e32));
    }

    p.fn(c, maj, n ? IX.negative : IX.positive, w: 4, label: n ? 'n_e' : 'n_h', labelAt: 23);
    p.fn(c, (x) => 2 * _log10(1.5e16) - maj(x), n ? IX.positive : IX.negative, w: 4, label: n ? 'n_h' : 'n_e', labelAt: 23);
    p.hline(c, _log10(1.5e16), IX.muted, label: 'n_i');
    p.vline(c, v['s']!, IX.muted);
  },
);

// ── diode ──

double _id(double vv, double eta) => 1e-10 * (math.exp(vv / (eta * 0.026)) - 1);

final _diode = ModeSpec(
  title: 'The p-n junction diode',
  formula: 'I = I_s (e^(V/ηV_T) − 1)',
  values: {'V': 0.65, 'eta': 1},
  controls: (v) => const [Sl('V', 'Applied voltage V', -5, 0.8, unit: 'V', div: 58), Sl('eta', 'Ideality factor η', 1, 2, div: 10)],
  presets: {'Forward 0.65 V': {'V': 0.65}, 'Zero bias': {'V': 0}, 'Reverse −3 V': {'V': -3}},
  readouts: (v) {
    final i = _id(v['V']!, v['eta']!);
    return [Readout('Current', i.abs() < 1e-3 ? sc(i) : fx(i, 2), 'mA', IX.accent), Readout('Bias', v['V']! > 0 ? 'forward' : (v['V']! < 0 ? 'reverse' : 'none'), ''), Readout('Depletion width (rel.)', fx(math.sqrt(math.max(0.05, 0.7 - v['V']!) / 0.7), 2), '× zero-bias')];
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.48);
    final vv = v['V']!;
    final o = Offset(left.center.dx, left.top + 280);
    final wd = 80 * math.sqrt(math.max(0.05, 0.7 - vv) / 0.7);
    final bar = Rect.fromCenter(center: o, width: left.width - 100, height: 160);
    c.drawRect(Rect.fromLTRB(bar.left, bar.top, o.dx, bar.bottom), Draw.fill(IX.positive.withValues(alpha: 0.12)));
    c.drawRect(Rect.fromLTRB(o.dx, bar.top, bar.right, bar.bottom), Draw.fill(IX.negative.withValues(alpha: 0.12)));
    c.drawRect(Rect.fromLTRB(o.dx - wd, bar.top, o.dx + wd, bar.bottom), Draw.fill(const Color(0xFFF1F3F8)));
    c.drawRect(bar, Draw.stroke(IX.inkSoft, 2));
    final rnd = math.Random(4);
    for (var k = 0; k < 26; k++) {
      final y = bar.top + 12 + rnd.nextDouble() * (bar.height - 24);
      final xp = bar.left + 14 + rnd.nextDouble() * (o.dx - wd - bar.left - 24);
      final xn = o.dx + wd + 10 + rnd.nextDouble() * (bar.right - o.dx - wd - 24);
      if (xp < o.dx - wd - 6) c.drawCircle(Offset(xp, y), 6, Draw.stroke(IX.positive, 2.5));
      if (xn > o.dx + wd + 6) Draw.ball(c, Offset(xn, y), 5, IX.negative);
    }
    Draw.text(c, 'p', Offset(bar.left + 30, bar.top - 24), size: 22, color: IX.positive);
    Draw.text(c, 'n', Offset(bar.right - 30, bar.top - 24), size: 22, color: IX.negative);
    Draw.dim(c, Offset(o.dx - wd, bar.bottom + 24), Offset(o.dx + wd, bar.bottom + 24), 'depletion', off: 24);
    final by = bar.bottom + 130;
    Draw.line(c, [Offset(bar.left, bar.center.dy), Offset(bar.left - 20, bar.center.dy), Offset(bar.left - 20, by), Offset(o.dx - 50, by)]);
    Draw.line(c, [Offset(bar.right, bar.center.dy), Offset(bar.right + 20, bar.center.dy), Offset(bar.right + 20, by), Offset(o.dx + 50, by)]);
    if (vv >= 0) {
      Draw.cell(c, Offset(o.dx - 50, by), Offset(o.dx + 50, by), label: '${fx(vv, 2)} V forward', labelOff: const Offset(0, 40));
    } else {
      Draw.cell(c, Offset(o.dx + 50, by), Offset(o.dx - 50, by), label: '${fx(-vv, 1)} V reverse', labelOff: const Offset(0, 40));
    }
    Draw.caption(c, vv > 0 ? 'Forward bias narrows the depletion layer; past the knee the current shoots up.' : 'Reverse bias widens it: only a tiny leakage current flows.');
    final p = Plot(right, -5, 0.8, -2, 20, xl: 'V (volts)', yl: 'I (mA)', title: 'Silicon diode: knee near 0.7 V');
    p.frame(c);
    p.hline(c, 0, IX.muted);
    p.fn(c, (x) => _id(x, v['eta']!).clamp(-2.0, 25.0), IX.accent, w: 4);
    p.dot(c, vv, _id(vv, v['eta']!).clamp(-2.0, 20.0), IX.accent);
  },
);

// ── rectifier ──

List<double> _rectOut(double vm, double f, bool full, bool filt, double cf, double tEnd, int n) {
  const rl = 1000.0;
  final rc = rl * cf * 1e-6;
  final out = <double>[];
  var vo = 0.0;
  for (var i = 0; i <= n; i++) {
    final tt = tEnd * i / n;
    final src = vm * math.sin(2 * math.pi * f * tt);
    final rect = full ? src.abs() : math.max(0.0, src);
    if (filt) {
      vo = math.max(rect, vo * math.exp(-(tEnd / n) / rc));
    } else {
      vo = rect;
    }
    out.add(vo);
  }
  return out;
}

final _rectifier = ModeSpec(
  title: 'Half-wave and full-wave rectifiers',
  formula: 'half-wave: f pulses/s,  full-wave: 2f pulses/s',
  values: {'Vm': 10, 'f': 50, 'full': 0, 'flt': 0, 'Cf': 100},
  controls: (v) => const [Seg('full', 'Rectifier', ['Half-wave', 'Full-wave']), Sl('Vm', 'Peak input V_m', 1, 20, unit: 'V', div: 19), Sl('f', 'Input frequency f', 25, 100, unit: 'Hz', div: 15), Seg('flt', 'Filter capacitor', ['Off', 'On']), Sl('Cf', 'Capacitor C (1 kΩ load)', 20, 1000, unit: 'µF', div: 49)],
  presets: {'Half-wave': {'full': 0, 'flt': 0}, 'Full-wave': {'full': 1, 'flt': 0}, 'Full-wave, filtered': {'full': 1, 'flt': 1, 'Cf': 470}},
  readouts: (v) {
    final full = v['full'] == 1;
    final out = _rectOut(v['Vm']!, v['f']!, full, v['flt'] == 1, v['Cf']!, 4 / v['f']!, 800);
    final tail = out.sublist(400);
    final ripple = tail.reduce(math.max) - tail.reduce(math.min);
    return [Readout('Output pulses per second', fx(v['f']! * (full ? 2 : 1), 0), '', IX.accent), Readout('Average output', fx(out.reduce((a, b) => a + b) / out.length, 2), 'V'), Readout('Ripple (peak to peak)', fx(ripple, 2), 'V', IX.positive)];
  },
  paint: (c, s, v, t) {
    final (top, bot) = Lay.stack(s, 0.42);
    final full = v['full'] == 1;
    // Circuit: transformer secondary, diode(s), load.
    final y0 = top.top + 90, y1 = top.bottom - 60, xs = top.left + 140;
    final ac = Offset(xs - 20, (y0 + y1) / 2);
    Draw.line(c, [Offset(xs + 40, y0), Offset(ac.dx, y0), Offset(ac.dx, ac.dy - 40)]);
    Draw.line(c, [Offset(ac.dx, ac.dy + 40), Offset(ac.dx, y1), Offset(xs + 40, y1)]);
    c.drawCircle(ac, 40, Draw.fill(Colors.white));
    c.drawCircle(ac, 40, Draw.stroke(IX.ink, 3));
    c.drawPath(Draw.wave(ac.dx - 24, ac.dx + 24, ac.dy, 10, 48, 0, step: 2), Draw.stroke(IX.ink, 3));
    Draw.text(c, full ? 'AC (centre-tapped secondary)' : 'AC in', Offset(ac.dx, y1 + 30), size: 16, color: IX.inkSoft);
    final xl = top.right - 260;
    _diodeSym(c, Offset(xs + 40, y0), Offset(xs + 260, y0));
    Draw.line(c, [Offset(xs + 260, y0), Offset(xl, y0)]);
    if (full) {
      _diodeSym(c, Offset(xs + 40, y1), Offset(xs + 260, y1));
      Draw.line(c, [Offset(xs + 260, y1), Offset(xs + 300, y1), Offset(xs + 300, y0)]);
      Draw.text(c, 'centre tap', Offset(xs + 60, (y0 + y1) / 2), size: 15, color: IX.inkSoft, align: Alignment.centerLeft);
    } else {
      Draw.line(c, [Offset(xs + 40, y1), Offset(xs + 260, y1)]);
    }
    Draw.resistor(c, Offset(xl, y0), Offset(xl, full ? (y0 + y1) / 2 + 60 : y1), label: 'R_L', labelOff: const Offset(40, 0));
    Draw.line(c, [Offset(xl, full ? (y0 + y1) / 2 + 60 : y1), Offset(xl, y1), Offset(full ? xs + 30 : xs + 260, full ? (y0 + y1) / 2 : y1)]);
    if (v['flt'] == 1) {
      Draw.line(c, [Offset(xl, y0), Offset(xl + 120, y0)]);
      Draw.capacitor(c, Offset(xl + 120, y0), Offset(xl + 120, y1), label: 'C', labelOff: const Offset(36, 0));
      Draw.line(c, [Offset(xl + 120, y1), Offset(xl, y1)]);
    }
    final tEnd = 4 / v['f']!;
    final out = _rectOut(v['Vm']!, v['f']!, full, v['flt'] == 1, v['Cf']!, tEnd, 800);
    final vm = v['Vm']!;
    final p = Plot(bot, 0, tEnd * 1000, -vm * 1.15, vm * 1.15, xl: 't (ms)', yl: 'V (volts)', title: 'Input (dashed) and output across the load');
    p.frame(c);
    p.hline(c, 0, IX.muted);
    p.fn(c, (x) => vm * math.sin(2 * math.pi * v['f']! * x / 1000), IX.muted, w: 2.5, dash: true);
    p.poly(c, [for (var i = 0; i < out.length; i++) Offset(tEnd * 1000 * i / (out.length - 1), out[i])], IX.positive, w: 4);
    Draw.caption(c, full ? 'Two diodes take turns: both halves of each cycle reach the load.' : 'One diode passes only the positive half-cycles.');
  },
);

// ── Zener regulator ──

(double vo, double iz, bool on) _zen(double vin, double r, double rl) {
  const vz = 6.0;
  final open = vin * rl / (r + rl);
  if (open < vz) return (open, 0, false);
  final iz = (vin - vz) / r - vz / rl;
  return (vz, iz, true);
}

final _zener = ModeSpec(
  title: 'A Zener regulator',
  formula: 'V_out = V_Z once V_in R_L/(R + R_L) > V_Z  (V_Z = 6 V)',
  values: {'Vin': 12, 'R': 200, 'RL': 1000},
  controls: (v) => const [Sl('Vin', 'Input voltage', 0, 20, unit: 'V', div: 40), Sl('R', 'Series resistor R', 50, 500, unit: 'Ω', div: 45), Sl('RL', 'Load resistance R_L', 100, 2000, unit: 'Ω', div: 38)],
  presets: {'Regulating (12 V)': {'Vin': 12}, 'Too low (5 V)': {'Vin': 5}, 'Heavy load (200 Ω)': {'RL': 200}},
  readouts: (v) {
    final (vo, iz, on) = _zen(v['Vin']!, v['R']!, v['RL']!);
    return [Readout('Output voltage', fx(vo, 2), 'V', IX.accent), Readout('Zener current', on ? fx(iz * 1000, 1) : '0', 'mA', IX.positive), Readout('Load current', fx(vo / v['RL']! * 1000, 1), 'mA'), Readout('Regulating?', on ? 'yes' : 'no', '', on ? IX.green : IX.positive)];
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.5);
    final (vo, iz, on) = _zen(v['Vin']!, v['R']!, v['RL']!);
    final y0 = left.top + 160, y1 = left.bottom - 160;
    final x0 = left.left + 90, xz = left.center.dx + 30, xl = left.right - 70;
    Draw.cell(c, Offset(x0, y1), Offset(x0, y0), label: '${fx(v['Vin']!, 1)} V', labelOff: const Offset(-60, 0));
    Draw.resistor(c, Offset(x0, y0), Offset(xz, y0), label: 'R = ${fx(v['R']!, 0)} Ω');
    Draw.line(c, [Offset(xz, y0), Offset(xl, y0)]);
    _diodeSym(c, Offset(xz, y1), Offset(xz, y0), col: on ? IX.positive : IX.ink);
    Draw.text(c, 'Zener 6 V', Offset(xz + 70, (y0 + y1) / 2), size: 16, color: on ? IX.positive : IX.inkSoft, align: Alignment.centerLeft);
    Draw.resistor(c, Offset(xl, y0), Offset(xl, y1), label: 'R_L', labelOff: const Offset(36, 0));
    Draw.line(c, [Offset(xl, y1), Offset(x0, y1)]);
    Draw.node(c, Offset(xz, y0));
    Draw.node(c, Offset(xz, y1));
    Draw.tag(c, 'V_out = ${fx(vo, 2)} V', Offset(xl - 40, y0 - 60), color: IX.accent);
    if (on) Draw.tag(c, 'I_Z = ${fx(iz * 1000, 1)} mA', Offset(xz, y1 + 60), color: IX.positive);
    Draw.caption(c, on ? 'The Zener takes whatever current keeps V_out at 6 V.' : 'Below breakdown the Zener is off and R, R_L just divide the voltage.');
    final p = Plot(right, 0, 20, 0, 10, xl: 'V_in (V)', yl: 'V_out (V)', title: 'Output levels off at V_Z');
    p.frame(c);
    p.fn(c, (x) => _zen(x, v['R']!, v['RL']!).$1, IX.accent, w: 4);
    p.hline(c, 6, IX.positive, label: 'V_Z');
    p.dot(c, v['Vin']!, vo, IX.accent);
  },
);

// ── solar cell ──

double _isc(double g) => 3.5 * g / 1000;
double _sol(double vv, double g) => _isc(g) - 1e-9 * (math.exp(vv / 0.0257) - 1);

final _solar = ModeSpec(
  title: 'The I–V curve of a solar cell',
  formula: 'I = I_sc − I₀(e^(V/V_T) − 1),  P = VI',
  values: {'G': 1000, 'V': 0.3},
  controls: (v) => const [Sl('G', 'Sunlight', 100, 1000, unit: 'W/m²', div: 18), Sl('V', 'Operating voltage', 0, 0.6, unit: 'V', div: 60)],
  presets: {'Full sun': {'G': 1000, 'V': 0.47}, 'Cloudy': {'G': 300}, 'Open circuit': {'V': 0.56}},
  readouts: (v) {
    final i = math.max(0.0, _sol(v['V']!, v['G']!));
    final voc = 0.0257 * math.log(_isc(v['G']!) / 1e-9 + 1);
    var pm = 0.0;
    for (var x = 0.0; x < voc; x += 0.002) {
      pm = math.max(pm, x * _sol(x, v['G']!));
    }
    return [Readout('Current', fx(i, 2), 'A', IX.accent), Readout('Power delivered', fx(v['V']! * i, 2), 'W', IX.amber), Readout('Open-circuit V_oc', fx(voc, 3), 'V'), Readout('Maximum power', fx(pm, 2), 'W', IX.green)];
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.36);
    final g = v['G']!;
    final cell = Rect.fromCenter(center: Offset(left.center.dx, left.center.dy + 60), width: 260, height: 260);
    c.drawRect(cell, Draw.fill(const Color(0xFF243B6B)));
    for (var k = 1; k < 4; k++) {
      c.drawLine(Offset(cell.left + k * 65, cell.top), Offset(cell.left + k * 65, cell.bottom), Draw.stroke(const Color(0xFF9AA3B5), 1.5));
    }
    final sun = Offset(left.left + 70, left.top + 110);
    Draw.lamp(c, sun, IX.amber, r: 24 + g / 100);
    for (var k = 0; k < (g / 200).round() + 1; k++) {
      EM.photon(c, sun + Offset(40, 20.0 + k * 22), cell.topLeft + Offset(40 + k * 40.0, 10), IX.amber, amp: 4);
    }
    Draw.text(c, '100 cm² silicon cell', Offset(cell.center.dx, cell.bottom + 30), size: 17, color: IX.inkSoft);
    Draw.caption(c, 'The load sets V. The area of the rectangle is the power.');
    final p = Plot(right, 0, 0.65, 0, 4, xl: 'V (volts)', yl: 'I (A)', title: 'I–V curve (drawn upright); the rectangle is P = VI');
    p.frame(c);
    final vv = v['V']!, i = math.max(0.0, _sol(vv, g));
    c.drawRect(Rect.fromPoints(p.p(0, 0), p.p(vv, i)), Draw.fill(IX.amber.withValues(alpha: 0.25)));
    c.drawRect(Rect.fromPoints(p.p(0, 0), p.p(vv, i)), Draw.stroke(IX.amber, 2.5));
    p.fn(c, (x) => math.max(0.0, _sol(x, g)), IX.accent, w: 4);
    if (g < 1000) p.fn(c, (x) => math.max(0.0, _sol(x, 1000)), IX.muted, w: 2, dash: true, label: 'full sun', labelAt: 0.2);
    p.dot(c, vv, i, IX.amber);
  },
);
