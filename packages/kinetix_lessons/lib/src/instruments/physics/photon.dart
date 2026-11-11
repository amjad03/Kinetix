import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'em_kit.dart';
import 'kit.dart';

/// Dual nature of radiation and matter (2nd PUC ch. 11): the photoelectric effect, photocurrent
/// and stopping potential, Einstein's equation, photons in a beam and de Broglie waves.
final photonSpec = InstrumentSpec(
  id: 'photon',
  chapter: '2nd PUC Physics · Dual nature of radiation and matter',
  modes: {'photoelectric': _photoelectric, 'photocurrent': _photocurrent, 'einstein': _einstein, 'photons': _photons, 'debroglie': _debroglie},
);

const _h = 4.1357e-15; // eV s
const _metals = [('Caesium', 2.14), ('Potassium', 2.30), ('Sodium', 2.75), ('Calcium', 3.20), ('Copper', 4.65), ('Platinum', 5.65)];

/// A metal plate on the left of [r] with photons arriving and electrons leaving.
void _plate(Canvas c, Rect r, double nu, double intensity, double kmax, double t) {
  final px = r.left + r.width * 0.45;
  Draw.block(c, Rect.fromLTRB(px, r.top + 60, px + 40, r.bottom - 60), const Color(0xFFA8B0BF), radius: 4);
  final col = nu >= 7.5 ? Draw.spectral(math.max(380, 2998 / nu)) : Draw.spectral(2998 / nu);
  final n = intensity.round().clamp(1, 10);
  for (var k = 0; k < n; k++) {
    final y = r.top + 90 + k * (r.height - 180) / math.max(1, n - 1);
    final ph = ((t * 0.8 + k * 0.37) % 1.0);
    final x = r.left + 20 + ph * (px - r.left - 60);
    EM.photon(c, Offset(x - 90, y - 50), Offset(x, y), col, amp: 5, lambda: 10 + 2998 / nu / 30);
  }
  if (kmax > 0) {
    final sp = 60 + 220 * math.sqrt(kmax / 8);
    for (var k = 0; k < n; k++) {
      final y = r.top + 100 + k * (r.height - 200) / math.max(1, n - 1);
      final ph = ((t * 0.8 + k * 0.53) % 1.0);
      final e = Offset(px + 50 + ph * sp, y + (k.isEven ? -1 : 1) * ph * 30);
      Draw.ball(c, e, 8, IX.negative);
    }
  } else {
    Draw.tag(c, 'No electrons: hν < φ₀', Offset(px + 200, r.center.dy), color: IX.positive);
  }
}

// ── photoelectric effect ──

final _photoelectric = ModeSpec(
  title: 'Light knocks out electrons',
  formula: 'K_max = hν − φ₀,  λ₀ = hc/φ₀',
  values: {'nu': 8, 'Int': 5, 'phi': 2.75},
  animate: true,
  controls: (v) => const [Sl('nu', 'Frequency ν', 4, 15, unit: '× 10¹⁴ Hz', div: 22), Sl('Int', 'Intensity', 1, 10, div: 9, dp: 0), Sl('phi', 'Work function φ₀', 1, 6, unit: 'eV', div: 50)],
  presets: {'Sodium, green light': {'phi': 2.75, 'nu': 6}, 'Sodium, violet': {'phi': 2.75, 'nu': 7.5}, 'Copper, UV': {'phi': 4.65, 'nu': 15}},
  readouts: (v) {
    final e = _h * v['nu']! * 1e14, k = e - v['phi']!;
    return [Readout('Photon energy hν', fx(e, 2), 'eV', IX.accent), Readout('K_max', k > 0 ? fx(k, 2) : '0', 'eV', IX.negative), Readout('Threshold ν₀', fx(v['phi']! / _h / 1e14, 2), '× 10¹⁴ Hz'), Readout('Threshold λ₀', fx(1239.8 / v['phi']!, 0), 'nm', IX.green)];
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.5);
    final e = _h * v['nu']! * 1e14, k = e - v['phi']!;
    _plate(c, left, v['nu']!, v['Int']!, k, t);
    Draw.caption(c, 'Brighter light frees more electrons, not faster ones. Only ν sets K_max.');
    final p = Plot(right, 0, 15, -6, 6, xl: 'ν (× 10¹⁴ Hz)', yl: 'K_max (eV)', title: 'K_max = hν − φ₀: a line of slope h');
    p.frame(c);
    p.hline(c, 0, IX.muted);
    p.fn(c, (x) => _h * x * 1e14 - v['phi']!, IX.muted, w: 2, dash: true);
    p.fn(c, (x) => _h * x * 1e14 - v['phi']!, IX.accent, w: 4, a: v['phi']! / _h / 1e14);
    p.vline(c, v['phi']! / _h / 1e14, IX.green, label: 'ν₀');
    p.dot(c, v['nu']!, math.max(0, k), IX.accent);
  },
);

// ── photocurrent ──

double _iv(double vv, double isat, double v0) => vv <= -v0 ? 0 : isat * (1 - math.exp(-(vv + v0) / 0.6));

final _photocurrent = ModeSpec(
  title: 'Photocurrent and stopping potential',
  formula: 'eV₀ = hν − φ₀,  saturation current ∝ intensity',
  values: {'Is': 6, 'nu': 10, 'V': 2, 'cmp': 0},
  controls: (v) => const [Sl('Is', 'Intensity (saturation current)', 1, 10, unit: 'µA', div: 9), Sl('nu', 'Frequency ν', 6, 15, unit: '× 10¹⁴ Hz', div: 18), Sl('V', 'Anode potential V', -5, 5, unit: 'V', div: 100), Seg('cmp', 'Compare', ['Off', 'Half intensity'])],
  presets: {'Saturation': {'V': 4}, 'Near stopping': {'V': -1.8}, 'Half intensity': {'cmp': 1}},
  drag: (v, p, s, start) {
    final (_, right) = Lay.split(s, 0.42);
    final pl = Plot(right, -5, 5, 0, 1);
    if (!pl.r.inflate(30).contains(p)) return false;
    v['V'] = pl.xAt(p.dx).clamp(-5, 5);
    return true;
  },
  readouts: (v) {
    final v0 = math.max(0.0, _h * v['nu']! * 1e14 - 2.3);
    return [Readout('Stopping potential V₀', fx(v0, 2), 'V', IX.positive), Readout('Photocurrent', fx(_iv(v['V']!, v['Is']!, v0), 2), 'µA', IX.accent), Readout('Work function', '2.30', 'eV')];
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.42);
    final v0 = math.max(0.0, _h * v['nu']! * 1e14 - 2.3);
    final i = _iv(v['V']!, v['Is']!, v0);
    // Tube: emitter on the left, collector on the right, battery across.
    final tube = Rect.fromCenter(center: Offset(left.center.dx, left.top + 300), width: left.width - 120, height: 260);
    c.drawRRect(RRect.fromRectAndRadius(tube, const Radius.circular(120)), Draw.fill(PX.glassFill));
    c.drawRRect(RRect.fromRectAndRadius(tube, const Radius.circular(120)), Draw.stroke(IX.glassEdge, 2.5));
    c.drawRect(Rect.fromCenter(center: tube.centerLeft + const Offset(90, 0), width: 14, height: 160), Draw.fill(IX.steel));
    c.drawRect(Rect.fromCenter(center: tube.centerRight - const Offset(90, 0), width: 14, height: 160), Draw.fill(v['V']! >= 0 ? IX.positive : IX.negative));
    Draw.text(c, 'emitter', tube.centerLeft + const Offset(90, 100), size: 16, color: IX.inkSoft);
    Draw.text(c, 'collector ${sg(v['V']!, 1)} V', tube.centerRight + const Offset(-90, 100), size: 16, color: IX.inkSoft);
    final n = (i / 10 * 8).round();
    for (var k = 0; k < n; k++) {
      final x = tube.left + 120 + ((t * 0.6 + k / math.max(1, n)) % 1) * (tube.width - 240);
      Draw.ball(c, Offset(x, tube.center.dy - 60 + k * 17.0), 6, IX.negative);
    }
    EM.photon(c, tube.topLeft + const Offset(40, -80), tube.centerLeft + const Offset(80, -40), Draw.spectral(math.max(380, 2998 / v['nu']!)));
    Draw.tag(c, 'I = ${fx(i, 2)} µA', Offset(left.center.dx, tube.bottom + 70), color: IX.accent);
    Draw.caption(c, 'Drag on the graph to set V. Make it negative enough and even the fastest electrons turn back.');
    final p = Plot(right, -5, 5, 0, 11, xl: 'V (volts)', yl: 'I (µA)', title: 'Same frequency: same V₀; more light: more current');
    p.frame(c);
    p.fn(c, (x) => _iv(x, v['Is']!, v0), IX.accent, w: 4);
    if (v['cmp'] == 1) p.fn(c, (x) => _iv(x, v['Is']! / 2, v0), IX.muted, w: 3, dash: true, label: 'half intensity', labelAt: 3);
    p.vline(c, -v0, IX.positive, label: '−V₀');
    p.dot(c, v['V']!, i, IX.amber, rr: 10);
  },
);

// ── Einstein's equation ──

final _einstein = ModeSpec(
  title: "Einstein's equation on a graph",
  formula: 'eV₀ = hν − φ₀,  slope h/e',
  values: {'nu': 10, 'phi': 2, 'allm': 1},
  controls: (v) => const [Sl('nu', 'Frequency ν', 0, 20, unit: '× 10¹⁴ Hz', div: 40), Sl('phi', 'Work function φ₀', 1, 6, unit: 'eV', div: 50), Seg('allm', 'Other metals', ['Hidden', 'Shown'])],
  presets: {'Caesium': {'phi': 2.14}, 'Sodium': {'phi': 2.75}, 'Copper': {'phi': 4.65}},
  readouts: (v) {
    final v0 = _h * v['nu']! * 1e14 - v['phi']!;
    return [Readout('Stopping potential V₀', v0 > 0 ? fx(v0, 2) : '0 (no emission)', v0 > 0 ? 'V' : '', IX.accent), Readout('Slope h/e', '4.14 × 10⁻¹⁵', 'V s'), Readout('Threshold ν₀', fx(v['phi']! / _h / 1e14, 2), '× 10¹⁴ Hz', IX.green)];
  },
  paint: (c, s, v, t) {
    final p = Plot(Rect.fromLTRB(26, 26, s.width - 26, s.height - 26), 0, 20, 0, 6.5, xl: 'ν (× 10¹⁴ Hz)', yl: 'V₀ (V)', title: 'Every metal: the same slope h/e; only the intercept changes');
    p.frame(c);
    if (v['allm'] == 1) {
      for (final (k, (name, phi)) in _metals.indexed) {
        p.fn(c, (x) => _h * x * 1e14 - phi, PX.series[k % PX.series.length].withValues(alpha: 0.5), w: 2.5, a: phi / _h / 1e14, label: name, labelAt: math.min(19.5, phi / _h / 1e14 + 7.5 + k * 0.4));
      }
    }
    p.fn(c, (x) => _h * x * 1e14 - v['phi']!, IX.accent, w: 4.5, a: v['phi']! / _h / 1e14);
    p.vline(c, v['phi']! / _h / 1e14, IX.green, label: 'ν₀');
    final v0 = _h * v['nu']! * 1e14 - v['phi']!;
    p.dot(c, v['nu']!, math.max(0, v0), IX.accent, label: v0 > 0 ? '${fx(v0, 2)} V' : 'below threshold');
  },
);

// ── photons in a beam ──

final _photons = ModeSpec(
  title: 'A beam is a stream of photons',
  formula: 'E = hc/λ,  p = h/λ,  N = Pλ/hc',
  values: {'lam': 500, 'Pw': 2},
  animate: true,
  controls: (v) => const [Sl('lam', 'Wavelength λ', 200, 1000, unit: 'nm', div: 80), Sl('Pw', 'Beam power P', 0.1, 10, unit: 'mW', div: 99)],
  presets: {'He-Ne laser 1 mW': {'lam': 633, 'Pw': 1}, 'UV 2 mW': {'lam': 250, 'Pw': 2}, 'Infrared 2 mW': {'lam': 900, 'Pw': 2}},
  readouts: (v) {
    final e = 1239.8 / v['lam']!;
    return [Readout('Photon energy', fx(e, 2), 'eV', IX.accent), Readout('Photon momentum h/λ', fx(6.626e-34 / (v['lam']! * 1e-9) * 1e27, 2), '× 10⁻²⁷ kg m/s'), Readout('Photons per second', fx(v['Pw']! * 1e-3 * v['lam']! * 1e-9 / (6.626e-34 * 2.998e8) / 1e15, 2), '× 10¹⁵', IX.green)];
  },
  paint: (c, s, v, t) {
    final (top, bot) = Lay.stack(s, 0.5);
    final lam = v['lam']!;
    final col = Draw.spectral(lam.clamp(380, 780));
    final y = top.center.dy + 10;
    Draw.block(c, Rect.fromCenter(center: Offset(top.left + 90, y), width: 120, height: 90), const Color(0xFF4B5068), label: 'source');
    final n = (v['Pw']! * lam / 500 * 3).round().clamp(1, 40);
    final rnd = math.Random(3);
    for (var k = 0; k < n; k++) {
      final x = top.left + 170 + ((t * 0.25 + rnd.nextDouble()) % 1) * (top.width - 260);
      final yy = y + (rnd.nextDouble() - 0.5) * 120;
      EM.photon(c, Offset(x, yy), Offset(x + 70, yy), col, amp: 6, lambda: lam / 40);
    }
    Draw.caption(c, lam < 380 ? 'Ultraviolet: fewer photons per milliwatt, each carrying more energy.' : (lam > 780 ? 'Infrared: many low-energy photons.' : 'Same power, shorter λ: fewer but more energetic photons.'));
    final p = Plot(bot, 200, 1000, 0, 7, xl: 'λ (nm)', yl: 'E (eV)', title: 'Photon energy E = 1240/λ');
    p.frame(c);
    p.fn(c, (x) => 1239.8 / x, IX.accent, w: 4);
    p.dot(c, lam, 1239.8 / lam, IX.accent);
  },
);

// ── de Broglie ──

final _debroglie = ModeSpec(
  title: 'Matter waves: de Broglie wavelength',
  formula: 'λ = h/p = h/√(2mqV),  electron: λ = 1.227/√V nm',
  values: {'V': 100},
  animate: true,
  controls: (v) => const [Sl('V', 'Accelerating voltage V', 1, 1000, unit: 'V', div: 999, dp: 0)],
  presets: {'100 V': {'V': 100}, '10 V': {'V': 10}, '1000 V': {'V': 1000}},
  readouts: (v) {
    final le = 1.227 / math.sqrt(v['V']!);
    final lp = 6.626e-34 / math.sqrt(2 * 1.673e-27 * 1.602e-19 * v['V']!) * 1e12;
    return [Readout('Electron λ', fx(le, 4), 'nm', IX.accent), Readout('Proton λ', fx(lp, 3), 'pm', IX.positive), Readout('Electron speed', fx(math.sqrt(2 * 1.602e-19 * v['V']! / 9.109e-31) / 1e6, 2), '× 10⁶ m/s')];
  },
  paint: (c, s, v, t) {
    final (top, bot) = Lay.stack(s, 0.42);
    final le = 1.227 / math.sqrt(v['V']!);
    final y = top.center.dy + 10;
    final lamPx = 30 + le * 260;
    c.drawPath(Draw.wave(160, top.right - 60, y, 50, lamPx, -t * 5), Draw.stroke(IX.accent, 3.5));
    Draw.ball(c, Offset(120, y), 12, IX.negative);
    Draw.text(c, 'electron', const Offset(120, 0) + Offset(0, y + 34), size: 17, color: IX.negative);
    Draw.dim(c, Offset(160 + lamPx * 0.25, y - 70), Offset(160 + lamPx * 1.25, y - 70), 'λ = ${fx(le, 3)} nm', color: IX.accent);
    Draw.caption(c, 'Higher voltage: faster electron, shorter wavelength (drawn on a stretched scale).');
    final p = Plot(bot, 1, 1000, 0, 1.3, xl: 'V (volts)', yl: 'λ (nm)', title: 'Electron (blue) and proton (×1000, orange) through the same V');
    p.frame(c);
    p.fn(c, (x) => 1.227 / math.sqrt(x), IX.accent, w: 4);
    p.fn(c, (x) => 6.626e-34 / math.sqrt(2 * 1.673e-27 * 1.602e-19 * x) * 1e9 * 1000, IX.positive, w: 3);
    p.dot(c, v['V']!, le, IX.accent);
  },
);
