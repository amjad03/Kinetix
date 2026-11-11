import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'em_kit.dart';
import 'kit.dart';

/// Electromagnetic waves (2nd PUC ch. 8): displacement current, the travelling E–B wave,
/// radiation pressure and the electromagnetic spectrum.
final emwaveSpec = InstrumentSpec(
  id: 'emwave',
  chapter: '2nd PUC Physics · Electromagnetic waves',
  modes: {'displacement': _displacement, 'wave': _wave, 'pressure': _pressure, 'spectrum': _spectrum},
);

const _c = 2.998e8, _eps0 = 8.854e-12;

// ── displacement current ──

final _displacement = ModeSpec(
  title: 'Displacement current in a capacitor',
  formula: 'i_d = ε₀ dΦ_E/dt = i',
  values: {'E': 6, 'R': 5, 'C': 500, 'sw': 1},
  animate: true,
  controls: (v) => const [Sl('E', 'Battery E', 2, 12, unit: 'V', div: 10), Sl('R', 'Resistance R', 1, 20, unit: 'kΩ', div: 19), Sl('C', 'Capacitance C', 1, 1000, unit: 'µF', div: 999, dp: 0), Seg('sw', 'Battery', ['Disconnected', 'Connected'])],
  presets: {'Slow (τ = 2.5 s)': {'R': 5, 'C': 500}, 'Fast (τ = 0.1 s)': {'R': 5, 'C': 20, 'E': 10}},
  readouts: (v) {
    final tau = v['R']! * 1e3 * v['C']! * 1e-6;
    final i0 = v['E']! / (v['R']! * 1e3);
    return [Readout('Time constant RC', fx(tau, 2), 's', IX.accent), Readout('Starting current', fx(i0 * 1e3, 2), 'mA', IX.amber), Readout('Displacement current', '= wire current', '', IX.green)];
  },
  paint: (c, s, v, t) {
    final tau = v['R']! * 1e3 * v['C']! * 1e-6, i0 = v['E']! / (v['R']! * 1e3);
    final on = v['sw'] == 1;
    final tt = on ? (t % 6) / 6 * 5 * tau : 5 * tau;
    final i = on ? i0 * math.exp(-tt / tau) : 0.0;
    final q = on ? 1 - math.exp(-tt / tau) : 1.0;
    final (left, right) = Lay.split(s, 0.5);
    final o = Offset(left.center.dx, left.center.dy);
    final pl = Rect.fromCenter(center: o, width: 70, height: 280);
    Draw.line(c, [Offset(left.left + 60, o.dy), Offset(pl.left, o.dy)]);
    Draw.line(c, [Offset(pl.right, o.dy), Offset(left.right - 60, o.dy)]);
    c.drawRect(Rect.fromLTWH(pl.left - 10, pl.top, 10, pl.height), Draw.fill(IX.positive));
    c.drawRect(Rect.fromLTWH(pl.right, pl.top, 10, pl.height), Draw.fill(IX.negative));
    for (var y = pl.top + 30; y < pl.bottom; y += 44) {
      IxPaint.arrow(c, Offset(pl.left + 6, y), Offset(pl.left + 6 + (pl.width - 12) * q, y), IX.positive.withValues(alpha: 0.7), width: 2.5, head: 10);
    }
    Draw.text(c, 'E grows: i_d = ε₀ dΦ_E/dt', Offset(o.dx, pl.top - 30), size: 18, color: IX.positive, halo: true);
    if (i > i0 * 0.02) {
      for (final x in [left.left + 120, left.right - 120]) {
        EM.midArrow(c, Offset(x - 20, o.dy), Offset(x + 20, o.dy), IX.amber, size: 14 + 10 * i / i0);
      }
      // Magnetic field loops around the wire and around the gap alike.
      for (final x in [left.left + 160.0, o.dx, left.right - 160]) {
        c.drawOval(Rect.fromCenter(center: Offset(x, o.dy), width: 40, height: 200 + 0 * x), Draw.stroke(EM.field.withValues(alpha: 0.3 + 0.6 * i / i0), 3));
      }
      Draw.text(c, 'B circles the gap too', Offset(o.dx, pl.bottom + 40), size: 18, color: EM.field, halo: true);
    }
    Draw.caption(c, 'No charge crosses the gap, yet the changing E field there acts as a current.');
    final p = Plot(right, 0, 5 * tau, 0, i0 * 1.15e3, xl: 't (s)', yl: 'i (mA)', title: 'Charging current i = (E/R) e^(−t/RC)');
    p.frame(c);
    p.fn(c, (x) => i0 * math.exp(-x / tau) * 1e3, IX.amber, w: 4);
    if (on) p.dot(c, tt, i * 1e3, IX.amber);
  },
);

// ── travelling wave ──

final _wave = ModeSpec(
  title: 'An electromagnetic wave',
  formula: 'c = fλ,  B₀ = E₀/c',
  values: {'lam': 500, 'E0': 50},
  animate: true,
  controls: (v) => const [Sl('lam', 'Wavelength λ', 400, 700, unit: 'nm', div: 30), Sl('E0', 'Field amplitude E₀', 1, 100, unit: 'V/m', div: 99)],
  presets: {'Green 500 nm': {'lam': 500}, 'Red 700 nm': {'lam': 700}, 'Violet 400 nm': {'lam': 400}},
  readouts: (v) => [Readout('Frequency f = c/λ', fx(_c / (v['lam']! * 1e-9) / 1e14, 2), '× 10¹⁴ Hz', IX.accent), Readout('B₀ = E₀/c', fx(v['E0']! / _c * 1e8, 2), '× 10⁻⁸ T', EM.field), Readout('Intensity ½cε₀E₀²', fx(0.5 * _c * _eps0 * v['E0']! * v['E0']!, 2), 'W/m²')],
  paint: (c, s, v, t) {
    final lamPx = 160 + (v['lam']! - 400) * 0.8;
    final a = 60 + v['E0']! * 1.6;
    final y = s.height * 0.48, x0 = 90.0, x1 = s.width - 70;
    final ph = -t * 2.4;
    c.drawLine(Offset(x0 - 20, y), Offset(x1 + 30, y), Draw.stroke(IX.inkSoft, 2));
    IxPaint.arrow(c, Offset(x1, y), Offset(x1 + 40, y), IX.inkSoft, width: 2, head: 14);
    Draw.text(c, 'direction of travel', Offset(x1 - 60, y + 30), size: 17, color: IX.inkSoft);
    // E vertical (in the screen), B drawn in oblique perspective (out of the screen).
    const ob = Offset(-0.55, 0.5);
    final pe = Path(), pb = Path();
    for (var x = x0; x <= x1; x += 4) {
      final sv = math.sin(2 * math.pi * (x - x0) / lamPx + ph);
      final e = Offset(x, y - a * sv), b = Offset(x, y) + ob * (a * 0.8 * sv);
      x == x0 ? pe.moveTo(e.dx, e.dy) : pe.lineTo(e.dx, e.dy);
      x == x0 ? pb.moveTo(b.dx, b.dy) : pb.lineTo(b.dx, b.dy);
      if (((x - x0) / 4).round() % 6 == 0) {
        c.drawLine(Offset(x, y), e, Draw.stroke(EM.efield.withValues(alpha: 0.35), 1.6));
        c.drawLine(Offset(x, y), b, Draw.stroke(EM.field.withValues(alpha: 0.35), 1.6));
      }
    }
    c.drawPath(pb, Draw.stroke(EM.field, 3.5));
    c.drawPath(pe, Draw.stroke(EM.efield, 3.5));
    Draw.text(c, 'E', Offset(x0 - 30, y - a), size: 24, color: EM.efield);
    Draw.text(c, 'B', Offset(x0 - 30, y + a * 0.5), size: 24, color: EM.field);
    Draw.dim(c, Offset(x0 + lamPx * 0.25, y - a - 40), Offset(x0 + lamPx * 1.25, y - a - 40), 'λ = ${fx(v['lam']!, 0)} nm');
    c.drawRect(Rect.fromLTWH(s.width - 230, 40, 180, 40), Draw.fill(Draw.spectral(v['lam']!)));
    Draw.text(c, 'colour', Offset(s.width - 260, 60), size: 17, color: IX.inkSoft, align: Alignment.centerRight);
    Draw.caption(c, 'E and B oscillate in phase, at right angles to each other and to the direction of travel.');
  },
);

// ── radiation pressure ──

final _pressure = ModeSpec(
  title: 'Light pushes: radiation pressure',
  formula: 'p = (1 + r) I / c',
  values: {'I': 1000, 'A': 1, 'r': 0},
  controls: (v) => const [Sl('I', 'Intensity I', 100, 2000, unit: 'W/m²', div: 19), Sl('A', 'Area A', 0.5, 10, unit: 'm²', div: 19), Sl('r', 'Reflectivity r', 0, 1, div: 10)],
  presets: {'Absorber in sunlight': {'I': 1000, 'r': 0}, 'Mirror': {'r': 1}, 'Laser-like E₀ = 600 V/m': {'I': 478, 'r': 0}},
  readouts: (v) {
    final p = (1 + v['r']!) * v['I']! / _c;
    return [Readout('Pressure', fx(p * 1e6, 3), 'µPa', IX.accent), Readout('Force on the area', fx(p * v['A']! * 1e6, 3), 'µN', IX.green), Readout('Field amplitude E₀', fx(math.sqrt(2 * v['I']! / (_c * _eps0)), 0), 'V/m')];
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.5);
    final r = v['r']!;
    final px = left.right - 120;
    final plate = Rect.fromLTWH(px, left.center.dy - 150, 26, 300);
    Draw.block(c, plate, Color.lerp(const Color(0xFF3B3F5C), const Color(0xFFE5E9F0), r)!, radius: 4);
    final n = (v['I']! / 200).round().clamp(2, 10);
    for (var k = 0; k < n; k++) {
      final y = plate.top + 20 + k * (plate.height - 40) / math.max(1, n - 1);
      EM.photon(c, Offset(left.left + 50, y), Offset(px - 10, y), IX.amber, amp: 6);
      if (r > 0 && k % (1 + ((1 - r) * 4).round()) == 0) EM.photon(c, Offset(px - 10, y + 10), Offset(px - 160, y + 10), IX.amber.withValues(alpha: 0.6), amp: 5);
    }
    final pr = (1 + r) * v['I']! / _c;
    Draw.force(c, Offset(plate.right + 6, left.center.dy), Offset(plate.right + 6 + 30 + 40 * pr / (2 * 2000 / _c), left.center.dy), IX.green, 'F');
    Draw.caption(c, 'Energy U carries momentum U/c. A mirror sends it back and gets twice the push.');
    final p = Plot(right, 0, 1, 0, 2 * v['I']! / _c * 1e6 * 1.15, xl: 'reflectivity r', yl: 'p (µPa)', title: 'From absorber (r = 0) to mirror (r = 1)');
    p.frame(c);
    p.fn(c, (x) => (1 + x) * v['I']! / _c * 1e6, IX.accent, w: 4);
    p.dot(c, r, pr * 1e6, IX.accent);
  },
);

// ── spectrum ──

const _bands = [
  (-20.0, -11.0, 'γ rays', 'nuclear decay, cancer treatment'),
  (-11.0, -8.0, 'X-rays', 'medical imaging'),
  (-8.0, -6.4, 'Ultraviolet', 'sterilising water; absorbed by ozone'),
  (-6.4, -6.15, 'Visible', 'the light we see'),
  (-6.15, -3.0, 'Infrared', 'remote controls, heat'),
  (-3.0, -1.0, 'Microwaves', 'radar, ovens, mobile phones'),
  (-1.0, 6.0, 'Radio waves', 'radio and TV broadcasting'),
];

final _spectrum = ModeSpec(
  title: 'The electromagnetic spectrum',
  formula: 'c = fλ,  E = hf = 1240 eV nm / λ',
  values: {'s': -2},
  controls: (v) => const [Sl('s', 'log₁₀ of wavelength in m', -12, 3, div: 150)],
  presets: {'FM radio (3 m)': {'s': 0.5}, 'Microwave (1 cm)': {'s': -2}, 'Green light': {'s': -6.3}, 'X-ray (0.1 nm)': {'s': -10}},
  readouts: (v) {
    final lam = math.pow(10, v['s']!).toDouble();
    final b = _bands.firstWhere((e) => v['s']! >= e.$1 && v['s']! < e.$2, orElse: () => _bands.last);
    return [Readout('Wavelength λ', sc(lam), 'm', IX.accent), Readout('Frequency f', sc(_c / lam), 'Hz'), Readout('Photon energy', sc(1.2398e-6 / lam), 'eV', IX.positive), Readout('Band', b.$3, '', IX.green)];
  },
  paint: (c, s, v, t) {
    final x0 = 70.0, x1 = s.width - 70;
    double X(double lg) => x0 + (lg + 12) / 15 * (x1 - x0);
    final y = s.height * 0.5;
    final cols = [const Color(0xFF6D28D9), const Color(0xFF4F46E5), const Color(0xFF7C3AED), Colors.white, const Color(0xFFB91C1C), const Color(0xFFB45309), const Color(0xFF0F766E)];
    for (final (i, b) in _bands.indexed) {
      final r = Rect.fromLTRB(X(math.max(b.$1, -12)), y - 50, X(math.min(b.$2, 3)), y + 50);
      if (b.$3 == 'Visible') {
        for (var k = 0; k < 30; k++) {
          c.drawRect(Rect.fromLTRB(r.left + r.width * k / 30, r.top, r.left + r.width * (k + 1) / 30 + 0.5, r.bottom), Draw.fill(Draw.spectral(400 + 300 * k / 30)));
        }
      } else {
        c.drawRect(r, Draw.fill(cols[i].withValues(alpha: 0.16)));
      }
      c.drawRect(r, Draw.stroke(IX.rule, 1.5));
      Draw.text(c, b.$3, Offset(r.center.dx, b.$3 == 'Visible' ? y - 76 : y), size: b.$3 == 'Visible' ? 16 : 17, color: IX.ink);
    }
    for (var k = -12; k <= 3; k += 3) {
      c.drawLine(Offset(X(k.toDouble()), y + 50), Offset(X(k.toDouble()), y + 62), Draw.stroke(IX.inkSoft, 2));
      Draw.text(c, '10${_sup(k)} m', Offset(X(k.toDouble()), y + 82), size: 16, color: IX.inkSoft);
      Draw.text(c, '${sc(_c / math.pow(10.0, k), sig: 1)} Hz', Offset(X(k.toDouble()), y + 140), size: 16, color: IX.muted);
    }
    final px = X(v['s']!);
    c.drawLine(Offset(px, y - 110), Offset(px, y + 110), Draw.stroke(IX.accent, 4));
    IxPaint.handle(c, Offset(px, y - 120), IX.accent, r: 14);
    final b = _bands.firstWhere((e) => v['s']! >= e.$1 && v['s']! < e.$2, orElse: () => _bands.last);
    Draw.text(c, 'wavelength', Offset(x0 - 10, y + 108), size: 15, color: IX.inkSoft, align: Alignment.centerLeft);
    Draw.text(c, 'frequency', Offset(x0 - 10, y + 166), size: 15, color: IX.muted, align: Alignment.centerLeft);
    Draw.tag(c, '${b.$3}: ${b.$4}', Offset(s.width / 2, y + 240), color: IX.green, size: 20);
    // A sketch of the wave: longer λ, fewer crests (log-compressed for the eye).
    final lamPx = 20 + (v['s']! + 12) / 15 * 260;
    c.drawPath(Draw.wave(x0, x1, 150, 30, lamPx, 0), Draw.stroke(IX.accent.withValues(alpha: 0.7), 3));
    Draw.caption(c, 'All of these travel at c in vacuum. Short wavelength means high frequency and energetic photons.');
  },
  drag: (v, p, s, start) {
    final x0 = 70.0, x1 = s.width - 70;
    v['s'] = ((p.dx - x0) / (x1 - x0) * 15 - 12).clamp(-12, 3);
    return true;
  },
);

String _sup(int k) {
  const d = {'-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'};
  return k.toString().split('').map((ch) => d[ch]).join();
}
