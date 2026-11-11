import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'kit.dart';

/// Current electricity (2nd PUC ch. 3) and the metre bridge and potentiometer (ch. 15): drawn
/// circuits solved exactly (Ohm and Kirchhoff), with meters and the matching graph.
final circuitSpec = InstrumentSpec(
  id: 'circuit',
  chapter: '2nd PUC Physics · Current electricity',
  modes: {'drift': _drift, 'resistivity': _resistivity, 'bulbs': _bulbs, 'transmission': _transmission, 'cell': _cell, 'wheatstone': _wheatstone, 'metrebridge': _metreBridge, 'potentiometer': _potentiometer},
);

// ── drift velocity ──

final _drift = ModeSpec(
  title: 'Electrons drifting in a wire',
  formula: 'I = n e A v_d',
  values: {'I': 1.5, 'A': 1},
  animate: true,
  controls: (v) => const [Sl('I', 'Current I', 0.5, 10, unit: 'A', div: 19), Sl('A', 'Cross-section A', 0.1, 2, unit: 'mm²', div: 19)],
  presets: {'1.5 A in 1 mm²': {'I': 1.5, 'A': 1}, 'Thin wire': {'I': 1.5, 'A': 0.1}, 'Heavy current': {'I': 10, 'A': 1}},
  readouts: (v) {
    final vd = v['I']! / (8.5e28 * 1.602e-19 * v['A']! * 1e-6);
    return [Readout('Drift speed v_d', fx(vd * 1000, 3), 'mm/s', IX.accent), Readout('Current density J', fx(v['I']! / v['A']!, 2), 'A/mm²'), Readout('Time to drift 1 m', fx(1 / vd / 60, 0), 'min', IX.positive)];
  },
  paint: (c, s, v, t) {
    final vd = v['I']! / (8.5e28 * 1.602e-19 * v['A']! * 1e-6);
    final top = Rect.fromLTWH(0, 0, s.width, s.height * 0.5);
    final h = 60 + v['A']! * 70;
    final wire = Rect.fromCenter(center: Offset(top.center.dx, top.center.dy + 20), width: top.width - 200, height: h);
    c.drawRRect(RRect.fromRectAndRadius(wire, Radius.circular(h / 2)), Draw.fill(const Color(0xFFF3DCC8)));
    c.drawRRect(RRect.fromRectAndRadius(wire, Radius.circular(h / 2)), Draw.stroke(PX.copper, 3));
    // Fixed ions and electrons: random jiggle plus a slow drift to the left (against E).
    final rnd = math.Random(4);
    for (var i = 0; i < 70; i++) {
      final x0 = rnd.nextDouble(), y0 = rnd.nextDouble();
      c.drawCircle(Offset(wire.left + 20 + x0 * (wire.width - 40), wire.top + 10 + y0 * (wire.height - 20)), 5, Draw.fill(PX.copper.withValues(alpha: 0.5)));
    }
    for (var i = 0; i < 60; i++) {
      final x0 = rnd.nextDouble(), y0 = rnd.nextDouble(), ph = rnd.nextDouble() * 6;
      final jx = math.sin(t * 7 + ph) * 12, jy = math.cos(t * 9 + ph * 1.3) * 8;
      final drift = (x0 - t * vd * 1000 * 0.02) % 1.0;
      c.drawCircle(Offset(wire.left + 20 + drift * (wire.width - 40) + jx, (wire.top + 12 + y0 * (wire.height - 24) + jy).clamp(wire.top + 6, wire.bottom - 6)), 5, Draw.fill(IX.negative));
    }
    IxPaint.arrow(c, Offset(wire.left + 40, wire.top - 40), Offset(wire.right - 40, wire.top - 40), IX.positive, width: 4, head: 16);
    Draw.text(c, 'E and conventional current →', Offset(wire.center.dx, wire.top - 66), size: 18, color: IX.positive);
    Draw.text(c, '← electrons drift (slowed picture)', Offset(wire.center.dx, wire.bottom + 36), size: 18, color: IX.negative);
    final p = Plot(Rect.fromLTRB(26, top.bottom + 20, s.width - 26, s.height - 22), 0, 10, 0, 6, xl: 'I (A)', yl: 'v_d (mm/s)', title: 'v_d = I / (neA), copper n = 8.5 × 10²⁸ m⁻³');
    p.frame(c);
    p.fn(c, (x) => x / (8.5e28 * 1.602e-19 * v['A']! * 1e-6) * 1000, IX.accent, w: 4);
    p.dot(c, v['I']!, vd * 1000, IX.accent, label: '${fx(vd * 1000, 3)} mm/s');
  },
);

// ── resistivity and temperature ──

const _mats = ['Silver', 'Tungsten', 'Nichrome', 'Manganin'];
const _rho0 = [1.6, 5.6, 100.0, 48.0]; // × 10⁻⁸ Ω m at 20 °C
const _alpha = [4.1e-3, 4.5e-3, 0.4e-3, 0.002e-3];

final _resistivity = ModeSpec(
  title: 'Resistance changes with temperature',
  formula: 'ρ = ρ₀[1 + α(T − T₀)],  R = ρL/A',
  values: {'mat': 1, 'T': 20, 'L': 1, 'A': 0.5},
  controls: (v) => const [Seg('mat', 'Material', _mats), Sl('T', 'Temperature T', 0, 500, unit: '°C', div: 100), Sl('L', 'Length L', 0.5, 5, unit: 'm', div: 9), Sl('A', 'Cross-section A', 0.1, 2, unit: 'mm²', div: 19)],
  presets: {'Room temperature': {'T': 20}, 'Hot (300 °C)': {'T': 300}, 'Manganin (steady)': {'mat': 3, 'T': 300}},
  readouts: (v) {
    final i = v['mat']!.round();
    final rho = _rho0[i] * (1 + _alpha[i] * (v['T']! - 20));
    return [Readout('Resistivity ρ', fx(rho, 2), '× 10⁻⁸ Ω m', IX.accent), Readout('Resistance R', fx(rho * 1e-8 * v['L']! / (v['A']! * 1e-6), 3), 'Ω', IX.positive), Readout('α', fx(_alpha[i] * 1000, 3), '× 10⁻³ /°C')];
  },
  paint: (c, s, v, t) {
    final i = v['mat']!.round(), tc = v['T']!;
    final left = Rect.fromLTWH(0, 0, s.width * 0.42, s.height);
    final glow = (tc / 500).clamp(0.0, 1.0);
    // A coil of the wire over a flame-coloured heater block.
    final coil = Path();
    final cy = left.center.dy - 30;
    for (var k = 0; k <= 200; k++) {
      final f = k / 200;
      final x = 80 + f * (left.width - 160);
      final y = cy + math.sin(f * 2 * math.pi * 9) * 50;
      k == 0 ? coil.moveTo(x, y) : coil.lineTo(x, y);
    }
    c.drawPath(coil, Draw.stroke(Color.lerp(IX.steel, const Color(0xFFE0571F), glow)!, 4 + v['A']! * 3));
    Draw.block(c, Rect.fromLTWH(60, cy + 110, left.width - 120, 40), Color.lerp(const Color(0xFFBFC6D3), const Color(0xFFE88C4A), glow)!, label: '${fx(tc, 0)} °C', radius: 6);
    Draw.text(c, _mats[i], Offset(left.center.dx, cy - 90), size: 20);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 0, 500, 0, 3.2, xl: 'T (°C)', yl: 'ρ / ρ₂₀', title: 'Resistivity relative to its value at 20 °C');
    p.frame(c);
    for (var k = 0; k < 4; k++) {
      p.fn(c, (x) => 1 + _alpha[k] * (x - 20), [IX.muted, IX.positive, IX.amber, IX.green][k], w: k == i ? 4.5 : 2.5, label: _mats[k], labelAt: k == 0 ? 380 : (k == 1 ? 450 : 470));
    }
    p.dot(c, tc, 1 + _alpha[i] * (tc - 20), IX.accent);
  },
);

// ── bulbs in series and parallel ──

final _bulbs = ModeSpec(
  title: 'Bulbs in series and in parallel',
  formula: 'R = V²/P_rated,  P = I²R',
  values: {'V': 220, 'P1': 100, 'P2': 40, 'par': 0},
  controls: (v) => const [Seg('par', 'Connection', ['Series', 'Parallel']), Sl('V', 'Supply voltage', 0, 240, unit: 'V', div: 24), Sl('P1', 'Bulb 1 rating (220 V)', 25, 200, unit: 'W', div: 7), Sl('P2', 'Bulb 2 rating (220 V)', 25, 200, unit: 'W', div: 7)],
  presets: {'Series 100 W + 40 W': {'par': 0}, 'Parallel 100 W + 40 W': {'par': 1}},
  readouts: (v) {
    final (p1, p2, i) = _bulbP(v);
    return [Readout('Power in bulb 1', fx(p1, 1), 'W', IX.amber), Readout('Power in bulb 2', fx(p2, 1), 'W', IX.amber), Readout('Total current', fx(i, 3), 'A'), Readout('Energy in one hour', fx((p1 + p2) / 1000, 3), 'kWh')];
  },
  paint: (c, s, v, t) {
    final (p1, p2, _) = _bulbP(v);
    final par = v['par'] == 1;
    final x0 = 160.0, x1 = s.width - 160, y0 = 160.0, y1 = s.height - 160;
    if (!par) {
      final xa = x0 + (x1 - x0) / 3, xb = x0 + 2 * (x1 - x0) / 3;
      Draw.line(c, [Offset(x0, y1), Offset(x0, y0), Offset(xa - 40, y0)]);
      Draw.line(c, [Offset(xa + 40, y0), Offset(xb - 40, y0)]);
      Draw.line(c, [Offset(xb + 40, y0), Offset(x1, y0), Offset(x1, y1), Offset(s.width / 2 + 40, y1)]);
      Draw.line(c, [Offset(s.width / 2 - 40, y1), Offset(x0, y1)]);
      Draw.bulb(c, Offset(xa, y0), (p1 / 100).clamp(0, 1), r: 40);
      Draw.bulb(c, Offset(xb, y0), (p2 / 100).clamp(0, 1), r: 40);
      Draw.text(c, 'bulb 1 (${fx(v['P1']!, 0)} W): ${fx(p1, 1)} W', Offset(xa, y0 + 80), size: 18, color: IX.amber);
      Draw.text(c, 'bulb 2 (${fx(v['P2']!, 0)} W): ${fx(p2, 1)} W', Offset(xb, y0 + 80), size: 18, color: IX.amber);
    } else {
      final xm = s.width / 2;
      Draw.line(c, [Offset(x0, y1), Offset(x0, y0), Offset(x1, y0), Offset(x1, y1), Offset(xm + 40, y1)]);
      Draw.line(c, [Offset(xm - 40, y1), Offset(x0, y1)]);
      for (final (k, x, pw) in [(1, xm - 200, p1), (2, xm + 200, p2)]) {
        Draw.node(c, Offset(x, y0));
        Draw.node(c, Offset(x, y1 - 80));
        Draw.line(c, [Offset(x, y0), Offset(x, (y0 + y1) / 2 - 80)]);
        Draw.bulb(c, Offset(x, (y0 + y1) / 2 - 40), (pw / 100).clamp(0, 1), r: 40);
        Draw.line(c, [Offset(x, (y0 + y1) / 2), Offset(x, y1 - 80)]);
        Draw.text(c, 'bulb $k: ${fx(pw, 1)} W', Offset(x + (k == 1 ? -110 : 110), (y0 + y1) / 2 - 40), size: 18, color: IX.amber);
      }
      Draw.line(c, [Offset(xm - 200, y1 - 80), Offset(xm + 200, y1 - 80)]);
      Draw.line(c, [Offset(xm, y1 - 80), Offset(xm, y1)]);
    }
    Draw.cell(c, Offset(s.width / 2 - 40, y1), Offset(s.width / 2 + 40, y1), label: '${fx(v['V']!, 0)} V AC', labelOff: const Offset(0, 44));
    Draw.caption(c, par ? 'Parallel: each bulb gets the full voltage and gives its rated power.' : 'Series: same current; the lower-wattage bulb (higher R) glows brighter.');
  },
);

(double, double, double) _bulbP(V v) {
  final r1 = 220 * 220 / v['P1']!, r2 = 220 * 220 / v['P2']!, vv = v['V']!;
  if (v['par'] == 1) return (vv * vv / r1, vv * vv / r2, vv / r1 + vv / r2);
  final i = vv / (r1 + r2);
  return (i * i * r1, i * i * r2, i);
}

// ── transmission line ──

final _transmission = ModeSpec(
  title: 'Loss in a transmission line',
  formula: 'I = P/V,  loss = I²R_c',
  values: {'P': 1, 'V': 11, 'Rc': 10},
  controls: (v) => const [Sl('P', 'Power sent P', 0.1, 5, unit: 'MW', div: 49), Sl('V', 'Line voltage V', 1, 100, unit: 'kV', div: 99), Sl('Rc', 'Line resistance R_c', 1, 20, unit: 'Ω', div: 19)],
  presets: {'11 kV': {'V': 11}, '220 V (absurd)': {'V': 1}, '66 kV': {'V': 66}},
  readouts: (v) {
    final i = 1000 * v['P']! / v['V']!;
    final loss = i * i * v['Rc']! / 1000;
    return [Readout('Line current', fx(i, 1), 'A', IX.accent), Readout('Power lost', fx(loss, 1), 'kW', IX.positive), Readout('Fraction lost', fx(loss / (v['P']! * 1000) * 100, 2), '%')];
  },
  paint: (c, s, v, t) {
    final i = 1000 * v['P']! / v['V']!;
    final frac = (i * i * v['Rc']! / 1000 / (v['P']! * 1000)).clamp(0.0, 1.0);
    final top = Rect.fromLTWH(0, 0, s.width, s.height * 0.42);
    final y = top.center.dy;
    Draw.block(c, Rect.fromLTWH(60, y - 70, 160, 120), PX.iron, label: 'Power station');
    for (var k = 0; k < 4; k++) {
      final x = 330.0 + k * (top.width - 640) / 3;
      c.drawLine(Offset(x, y + 60), Offset(x - 30, y + 120), Draw.stroke(IX.inkSoft, 3));
      c.drawLine(Offset(x, y + 60), Offset(x + 30, y + 120), Draw.stroke(IX.inkSoft, 3));
      c.drawLine(Offset(x, y - 50), Offset(x, y + 60), Draw.stroke(IX.inkSoft, 4));
      c.drawLine(Offset(x - 30, y - 40), Offset(x + 30, y - 40), Draw.stroke(IX.inkSoft, 3));
    }
    final wire = Path()..moveTo(220, y - 40);
    for (var x = 220.0; x <= top.width - 220; x += 10) {
      wire.lineTo(x, y - 40 + 10 * math.sin((x - 220) / (top.width - 440) * math.pi * 3).abs());
    }
    c.drawPath(wire, Draw.stroke(Color.lerp(IX.ink, const Color(0xFFE0571F), frac * 3)!, 3 + i / 60));
    Draw.block(c, Rect.fromLTWH(top.width - 220, y - 70, 160, 120), const Color(0xFFB9C2D0), label: 'Town');
    Draw.text(c, 'I = ${fx(i, 0)} A', Offset(top.center.dx, y - 80), size: 20, color: IX.accent);
    final p = Plot(Rect.fromLTRB(26, top.bottom, s.width - 26, s.height - 22), 1, 100, 0, math.max(10.0, 1000 * v['P']! * v['P']! * v['Rc']! / 100), xl: 'V (kV)', yl: 'loss (kW)', title: 'Loss falls as 1/V²: send power at high voltage');
    p.frame(c);
    p.fn(c, (x) => 1000 * v['P']! * v['P']! * v['Rc']! / (x * x), IX.positive, w: 4, a: 1);
    p.dot(c, v['V']!, i * i * v['Rc']! / 1000, IX.positive);
  },
);

// ── emf and internal resistance ──

final _cell = ModeSpec(
  title: 'Emf and terminal voltage',
  formula: 'V = E − Ir',
  values: {'E': 6, 'r': 1, 'R': 5, 'sw': 1},
  controls: (v) => const [Sl('E', 'Emf E', 1, 24, unit: 'V', div: 23), Sl('r', 'Internal resistance r', 0.1, 5, unit: 'Ω', div: 49), Sl('R', 'Load R', 0, 50, unit: 'Ω', div: 100), Seg('sw', 'Switch', ['Open', 'Closed'])],
  presets: {'Open circuit': {'sw': 0}, 'Light load': {'R': 20}, 'Heavy load': {'R': 1}, 'Short circuit': {'R': 0}},
  readouts: (v) {
    final i = v['sw'] == 1 ? v['E']! / (v['R']! + v['r']!) : 0.0;
    return [Readout('Current I', fx(i, 2), 'A', IX.accent), Readout('Terminal voltage V', fx(v['E']! - i * v['r']!, 2), 'V', IX.positive), Readout('Power in R', fx(i * i * v['R']!, 2), 'W', IX.amber), Readout('Efficiency R/(R + r)', v['sw'] == 1 ? fx(100 * v['R']! / (v['R']! + v['r']!), 0) : '—', '%')];
  },
  paint: (c, s, v, t) {
    final e = v['E']!, r = v['r']!, rl = v['R']!, on = v['sw'] == 1;
    final i = on ? e / (rl + r) : 0.0;
    final vt = e - i * r;
    final left = Rect.fromLTWH(0, 0, s.width * 0.45, s.height);
    final x0 = 90.0, x1 = left.right - 50, y0 = 150.0, y1 = s.height * 0.62;
    // The cell: emf and internal r inside a dashed box.
    final box = Rect.fromLTRB(x0 + 20, y1 - 50, x0 + 300, y1 + 50);
    final dp = Draw.stroke(IX.muted, 2);
    for (final (a, b) in [(box.topLeft, box.topRight), (box.topRight, box.bottomRight), (box.bottomRight, box.bottomLeft), (box.bottomLeft, box.topLeft)]) {
      IxPaint.dashed(c, a, b, dp);
    }
    Draw.text(c, 'cell', box.topLeft + const Offset(26, -16), size: 16, color: IX.muted);
    Draw.line(c, [Offset(x0, y1), Offset(box.left + 20, y1)]);
    Draw.cell(c, Offset(box.left + 20, y1), Offset(box.left + 110, y1), label: 'E', labelOff: const Offset(0, -36));
    Draw.resistor(c, Offset(box.left + 120, y1), Offset(box.right - 20, y1), label: 'r', labelOff: const Offset(0, -30));
    Draw.line(c, [Offset(box.right - 20, y1), Offset(x1, y1), Offset(x1, y0 + 60)]);
    Draw.resistor(c, Offset(x1, y0 + 60), Offset(x1, y0), label: 'R', labelOff: const Offset(34, 0));
    Draw.line(c, [Offset(x1, y0), Offset(left.center.dx + 40, y0)]);
    final swp = Offset(left.center.dx - 30, y0);
    Draw.node(c, swp);
    Draw.node(c, swp + const Offset(70, 0));
    c.drawLine(swp, swp + Offset(66, on ? 0 : -36), Draw.stroke(IX.ink, 4));
    Draw.line(c, [swp, Offset(x0, y0), Offset(x0, y1)]);
    // Voltmeter across the terminals.
    Draw.line(c, [Offset(box.left - 0, y1), Offset(box.left, y1 + 120), Offset(box.center.dx - 34, y1 + 120)]);
    Draw.meter(c, Offset(box.center.dx, y1 + 120), 'V', r: 34, needle: vt / 24 * 2 - 1);
    Draw.line(c, [Offset(box.center.dx + 34, y1 + 120), Offset(box.right + 30, y1 + 120), Offset(box.right + 30, y1)]);
    Draw.text(c, '${fx(vt, 2)} V', Offset(box.center.dx, y1 + 180), size: 20, color: IX.positive);
    final imax = e / r;
    final p1 = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height / 2 - 6), 0, imax * 1.05, 0, e * 1.15, xl: 'I (A)', yl: 'V (V)', title: 'V = E − Ir: intercept E, slope −r');
    p1.frame(c);
    p1.fn(c, (x) => e - x * r, IX.positive, w: 4);
    p1.dot(c, i, vt, IX.accent);
    final p2 = Plot(Rect.fromLTRB(left.right, s.height / 2 + 6, s.width - 26, s.height - 26), 0, 50, 0, e * e / (4 * r) * 1.15, xl: 'R (Ω)', yl: 'P (W)', title: 'Power in the load is greatest when R = r');
    p2.frame(c);
    p2.fn(c, (x) => e * e * x / ((x + r) * (x + r)), IX.amber, w: 4);
    p2.vline(c, r, IX.muted, label: 'R = r');
    if (on) p2.dot(c, rl, i * i * rl, IX.amber);
  },
);

// ── Wheatstone bridge ──

/// Node potentials of a Wheatstone bridge (6 V across A–C, galvanometer G = 20 Ω).
(double, double) _bridge(double p, double q, double r, double s, {double e = 6, double g = 20}) {
  // (e − VB)/p = VB/q + (VB − VD)/g ;  (e − VD)/r = VD/s + (VD − VB)/g
  final a11 = 1 / p + 1 / q + 1 / g, a12 = -1 / g, b1 = e / p;
  final a21 = -1 / g, a22 = 1 / r + 1 / s + 1 / g, b2 = e / r;
  final det = a11 * a22 - a12 * a21;
  return ((b1 * a22 - a12 * b2) / det, (a11 * b2 - a21 * b1) / det);
}

final _wheatstone = ModeSpec(
  title: 'Balance a Wheatstone bridge',
  formula: 'balanced when P/Q = R/S',
  values: {'P': 10, 'Q': 20, 'R': 15, 'S': 20},
  controls: (v) => const [Sl('P', 'P', 1, 100, unit: 'Ω', div: 99), Sl('Q', 'Q', 1, 100, unit: 'Ω', div: 99), Sl('R', 'R', 1, 100, unit: 'Ω', div: 99), Sl('S', 'S', 1, 100, unit: 'Ω', div: 99)],
  presets: {'Unbalanced': {'P': 10, 'Q': 20, 'R': 15, 'S': 20}, 'Balanced (S = 30)': {'P': 10, 'Q': 20, 'R': 15, 'S': 30}, 'Equal arms': {'P': 10, 'Q': 10, 'R': 5, 'S': 5}},
  readouts: (v) {
    final (vb, vd) = _bridge(v['P']!, v['Q']!, v['R']!, v['S']!);
    final ig = (vb - vd) / 20 * 1000;
    return [Readout('Galvanometer current', sg(ig, 2), 'mA', IX.positive), Readout('P/Q', fx(v['P']! / v['Q']!, 3), ''), Readout('R/S', fx(v['R']! / v['S']!, 3), ''), Readout('S for balance = QR/P', fx(v['Q']! * v['R']! / v['P']!, 1), 'Ω', IX.green)];
  },
  paint: (c, s, v, t) {
    final (vb, vd) = _bridge(v['P']!, v['Q']!, v['R']!, v['S']!);
    final ig = (vb - vd) / 20 * 1000;
    final left = Rect.fromLTWH(0, 0, s.width * 0.48, s.height);
    final cx = left.center.dx, cy = left.center.dy - 30, rr = 200.0;
    final a = Offset(cx - rr, cy), b = Offset(cx, cy - rr * 0.8), cc = Offset(cx + rr, cy), d = Offset(cx, cy + rr * 0.8);
    Draw.resistor(c, a, b, label: 'P = ${fx(v['P']!, 0)} Ω', labelOff: const Offset(-60, -24));
    Draw.resistor(c, b, cc, label: 'Q = ${fx(v['Q']!, 0)} Ω', labelOff: const Offset(60, -24));
    Draw.resistor(c, a, d, label: 'R = ${fx(v['R']!, 0)} Ω', labelOff: const Offset(-60, 24));
    Draw.resistor(c, d, cc, label: 'S = ${fx(v['S']!, 0)} Ω', labelOff: const Offset(60, 24));
    Draw.line(c, [b, Offset(cx, cy - 34)]);
    Draw.meter(c, Offset(cx, cy), 'G', r: 34, needle: (ig / 20).clamp(-1, 1));
    Draw.line(c, [Offset(cx, cy + 34), d]);
    for (final (p, n) in [(a, 'A'), (b, 'B'), (cc, 'C'), (d, 'D')]) {
      Draw.node(c, p, n, p == d ? const Offset(0, 26) : (p == a ? const Offset(-24, 0) : (p == cc ? const Offset(24, 0) : const Offset(0, -24))));
    }
    final by = cy + rr * 0.8 + 110;
    Draw.line(c, [a, Offset(a.dx, by), Offset(cx - 40, by)]);
    Draw.cell(c, Offset(cx - 40, by), Offset(cx + 40, by), label: '6 V', labelOff: const Offset(0, 36));
    Draw.line(c, [Offset(cx + 40, by), Offset(cc.dx, by), cc]);
    final p = Plot(Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26), 1, 100, -3, 3, xl: 'S (Ω)', yl: 'V_B − V_D (V)', title: 'Galvanometer voltage crosses zero at balance');
    p.frame(c);
    p.fn(c, (x) => 6 * v['Q']! / (v['P']! + v['Q']!) - 6 * x / (v['R']! + x), IX.accent, w: 4);
    final sb = v['Q']! * v['R']! / v['P']!;
    p.vline(c, sb, IX.green, label: 'S = QR/P');
    p.dot(c, v['S']!, 6 * v['Q']! / (v['P']! + v['Q']!) - 6 * v['S']! / (v['R']! + v['S']!), IX.accent);
  },
);

// ── metre bridge ──

const _coils = ['Coil A', 'Coil B', 'Coil C'];
const _coilX = [6.0, 9.5, 2.4];

final _metreBridge = ModeSpec(
  title: 'Find the null point on a metre bridge',
  chapter: '2nd PUC Physics · Metre bridge and potentiometer',
  formula: 'X = R(100 − l)/l',
  values: {'R': 4, 'X': 0, 'l': 50},
  controls: (v) => const [Sl('R', 'Known resistance R (left gap)', 1, 20, unit: 'Ω', div: 19), Seg('X', 'Unknown coil (right gap)', _coils), Sl('l', 'Jockey position l', 1, 99, unit: 'cm', div: 196)],
  presets: {'Start at 50 cm': {'l': 50}, 'Coil A balanced': {'R': 4, 'X': 0, 'l': 40}},
  drag: (v, p, s, start) {
    final x0 = 120.0, x1 = s.width - 120;
    if (start && (p.dy < s.height * 0.3 || p.dy > s.height * 0.75)) return false;
    v['l'] = ((p.dx - x0) / (x1 - x0) * 100).clamp(1, 99);
    return true;
  },
  readouts: (v) {
    final l = v['l']!;
    return [Readout('Balance length l', fx(l, 1), 'cm', IX.accent), Readout('X = R(100 − l)/l', fx(v['R']! * (100 - l) / l, 2), 'Ω', IX.positive), Readout('Galvanometer', _mbNeedle(v).abs() < 0.03 ? 'Null: balanced' : (_mbNeedle(v) > 0 ? 'Deflects right' : 'Deflects left'), '')];
  },
  paint: (c, s, v, t) {
    final x0 = 120.0, x1 = s.width - 120, wy = s.height * 0.6;
    final l = v['l']!;
    // Metre scale under the wire.
    final scale = Rect.fromLTRB(x0, wy + 20, x1, wy + 70);
    c.drawRect(scale, Draw.fill(const Color(0xFFF7EBD5)));
    for (var cm = 0; cm <= 100; cm++) {
      final x = x0 + (x1 - x0) * cm / 100;
      c.drawLine(Offset(x, scale.top), Offset(x, scale.top + (cm % 10 == 0 ? 22 : (cm % 5 == 0 ? 14 : 8))), Draw.stroke(IX.ink, cm % 10 == 0 ? 1.8 : 1));
      if (cm % 10 == 0) Draw.text(c, '$cm', Offset(x, scale.top + 36), size: 15, color: IX.ink, w: FontWeight.w500);
    }
    c.drawLine(Offset(x0, wy), Offset(x1, wy), Draw.stroke(const Color(0xFF8A6B3C), 4));
    // Copper strips with the two gaps.
    final sy = wy - 140;
    final g1 = x0 + (x1 - x0) * 0.3, g2 = x0 + (x1 - x0) * 0.7;
    final strip = Draw.stroke(PX.copper, 10);
    c.drawLine(Offset(x0, wy), Offset(x0, sy), strip);
    c.drawLine(Offset(x0, sy), Offset(g1 - 60, sy), strip);
    c.drawLine(Offset(g1 + 60, sy), Offset(g2 - 60, sy), strip);
    c.drawLine(Offset(g2 + 60, sy), Offset(x1, sy), strip);
    c.drawLine(Offset(x1, sy), Offset(x1, wy), strip);
    Draw.resistor(c, Offset(g1 - 60, sy), Offset(g1 + 60, sy), label: 'R = ${fx(v['R']!, 0)} Ω');
    Draw.resistor(c, Offset(g2 - 60, sy), Offset(g2 + 60, sy), label: 'X (${_coils[v['X']!.round()]})');
    // Galvanometer from the middle strip to the jockey.
    final mid = Offset((x0 + x1) / 2, sy);
    final jx = x0 + (x1 - x0) * l / 100;
    Draw.line(c, [mid, Offset(mid.dx, sy + 40)]);
    Draw.meter(c, Offset(mid.dx, sy + 76), 'G', r: 34, needle: _mbNeedle(v));
    Draw.line(c, [Offset(mid.dx, sy + 110), Offset(jx, wy - 30)]);
    final jockey = Path()..moveTo(jx, wy - 2)..lineTo(jx - 12, wy - 30)..lineTo(jx + 12, wy - 30)..close();
    c.drawPath(jockey, Draw.fill(IX.positive));
    Draw.text(c, 'J', Offset(jx + 22, wy - 22), size: 19, color: IX.positive);
    // Battery across the ends.
    final by = 70.0;
    Draw.line(c, [Offset(x0, sy), Offset(x0, by), Offset(mid.dx - 40, by)]);
    Draw.cell(c, Offset(mid.dx - 40, by), Offset(mid.dx + 40, by), label: '2 V', labelOff: const Offset(0, -34));
    Draw.line(c, [Offset(mid.dx + 40, by), Offset(x1, by), Offset(x1, sy)]);
    Draw.text(c, 'A', Offset(x0 - 24, wy), size: 20);
    Draw.text(c, 'C', Offset(x1 + 24, wy), size: 20);
    Draw.caption(c, 'Drag the jockey J along the wire until the galvanometer reads zero.', at: Offset(28, s.height - 50));
  },
);

double _mbNeedle(V v) {
  final r = v['R']!, x = _coilX[v['X']!.round()], l = v['l']!;
  final vd = x / (r + x), vj = (100 - l) / 100;
  return ((vj - vd) * 6).clamp(-1.0, 1.0);
}

// ── potentiometer ──

const _cells = ['Leclanché', 'Daniell'];
const _cellE = [1.45, 1.08], _cellR = [1.2, 2.0];

final _potentiometer = ModeSpec(
  title: 'Balance a cell on a potentiometer',
  chapter: '2nd PUC Physics · Metre bridge and potentiometer',
  formula: 'E = kl,  r = R(l₁/l₂ − 1)',
  values: {'cell': 0, 'Rh': 4, 'Rs': 5, 'sh': 0, 'J': 5},
  controls: (v) => const [Seg('cell', 'Cell', _cells), Sl('Rh', 'Rheostat', 0, 20, unit: 'Ω', div: 40), Sl('J', 'Jockey length l', 0.1, 10, unit: 'm', div: 198), Seg('sh', 'Shunt R across the cell', ['Off', 'On']), Sl('Rs', 'Shunt resistance R', 1, 20, unit: 'Ω', div: 19)],
  presets: {'Find l₁ (no shunt)': {'sh': 0}, 'Find l₂ (shunt on)': {'sh': 1}, 'Daniell cell': {'cell': 1}},
  drag: (v, p, s, start) {
    final x0 = 100.0, x1 = s.width - 100;
    if (start && (p.dy < s.height * 0.3 || p.dy > s.height * 0.8)) return false;
    v['J'] = ((p.dx - x0) / (x1 - x0) * 10).clamp(0.1, 10);
    return true;
  },
  readouts: (v) {
    final (k, _, l1, l2) = _pot(v);
    return [Readout('Potential gradient k', fx(k * 1000, 1), 'mV/m', IX.accent), Readout('k × l at the jockey', fx(k * v['J']!, 3), 'V'), Readout('Null at', fx(v['sh'] == 1 ? l2 : l1, 2), 'm', IX.positive), Readout('r = R(l₁/l₂ − 1)', fx(v['Rs']! * (l1 / l2 - 1), 2), 'Ω', IX.green)];
  },
  paint: (c, s, v, t) {
    final (k, vt, _, _) = _pot(v);
    final x0 = 100.0, x1 = s.width - 100, wy = s.height * 0.5;
    final l = v['J']!;
    c.drawLine(Offset(x0, wy), Offset(x1, wy), Draw.stroke(const Color(0xFF8A6B3C), 4));
    for (var m = 0; m <= 10; m++) {
      final x = x0 + (x1 - x0) * m / 10;
      c.drawLine(Offset(x, wy + 10), Offset(x, wy + 26), Draw.stroke(IX.inkSoft, 2));
      Draw.text(c, '$m m', Offset(x, wy + 44), size: 15, color: IX.inkSoft, w: FontWeight.w500);
    }
    Draw.text(c, 'A', Offset(x0 - 26, wy), size: 20);
    Draw.text(c, 'B', Offset(x1 + 26, wy), size: 20);
    // Driver circuit above: 2 V cell, key, rheostat.
    final dy = 90.0;
    Draw.line(c, [Offset(x0, wy), Offset(x0, dy), Offset(s.width * 0.35, dy)]);
    Draw.cell(c, Offset(s.width * 0.35, dy), Offset(s.width * 0.35 + 60, dy), label: 'driver 2 V', labelOff: const Offset(0, -34));
    Draw.line(c, [Offset(s.width * 0.35 + 60, dy), Offset(s.width * 0.6, dy)]);
    Draw.resistor(c, Offset(s.width * 0.6, dy), Offset(s.width * 0.6 + 120, dy), label: 'Rh = ${fx(v['Rh']!, 0)} Ω', labelOff: const Offset(0, -30));
    Draw.line(c, [Offset(s.width * 0.6 + 120, dy), Offset(x1, dy), Offset(x1, wy)]);
    // Cell under test, galvanometer and jockey below.
    final cy = s.height - 120;
    final jx = x0 + (x1 - x0) * l / 10;
    Draw.line(c, [Offset(x0, wy), Offset(x0, cy), Offset(x0 + 80, cy)]);
    Draw.cell(c, Offset(x0 + 80, cy), Offset(x0 + 160, cy), label: _cells[v['cell']!.round()], labelOff: const Offset(0, 40));
    Draw.line(c, [Offset(x0 + 160, cy), Offset(s.width * 0.5 - 34, cy)]);
    final needle = ((vt - k * l) * 4).clamp(-1.0, 1.0);
    Draw.meter(c, Offset(s.width * 0.5, cy), 'G', r: 34, needle: needle);
    Draw.line(c, [Offset(s.width * 0.5 + 34, cy), Offset(jx, cy), Offset(jx, wy + 60)]);
    final jockey = Path()..moveTo(jx, wy + 4)..lineTo(jx - 12, wy + 30)..lineTo(jx + 12, wy + 30)..close();
    c.drawPath(jockey, Draw.fill(IX.positive));
    if (v['sh'] == 1) {
      Draw.line(c, [Offset(x0 + 70, cy), Offset(x0 + 70, cy + 60)]);
      Draw.resistor(c, Offset(x0 + 70, cy + 60), Offset(x0 + 170, cy + 60), label: 'R = ${fx(v['Rs']!, 0)} Ω', labelOff: const Offset(0, 30));
      Draw.line(c, [Offset(x0 + 170, cy + 60), Offset(x0 + 170, cy)]);
    }
    Draw.tag(c, needle.abs() < 0.03 ? 'Null point: k l = ${fx(k * l, 3)} V' : 'Drag the jockey to the null point', Offset(s.width / 2, wy - 70), color: needle.abs() < 0.03 ? IX.green : IX.ink);
  },
);

/// (k V/m, voltage the cell offers now, l₁ without shunt, l₂ with shunt).
(double, double, double, double) _pot(V v) {
  final i = 2 / (20 + v['Rh']!);
  final k = i * 20 / 10;
  final ci = v['cell']!.round();
  final e = _cellE[ci], r = _cellR[ci], rs = v['Rs']!;
  final vsh = e * rs / (rs + r);
  return (k, v['sh'] == 1 ? vsh : e, e / k, vsh / k);
}
