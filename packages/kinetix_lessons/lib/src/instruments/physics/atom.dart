import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'em_kit.dart';
import 'kit.dart';

/// Atoms (2nd PUC ch. 12): Rutherford scattering, line spectra, Bohr orbits, hydrogen's series
/// and de Broglie standing waves on an orbit.
final atomSpec = InstrumentSpec(
  id: 'atom',
  chapter: '2nd PUC Physics · Atoms',
  modes: {'rutherford': _rutherford, 'spectra': _spectra, 'bohr': _bohr, 'series': _series, 'standing': _standing},
);

const _ry = 1.097e7; // m⁻¹

// ── Rutherford scattering ──

/// Path of an α particle (in fm) aimed with impact parameter b at a nucleus whose head-on
/// distance of closest approach is d. Starts far to the left moving right.
List<Offset> _alphaPath(double b, double d) {
  // m = 2, v0 = 1 (K = 1), so the Coulomb constant kq = d K = d; a = d r̂ / (m r²).
  var p = Offset(-260, b), vel = const Offset(1, 0);
  final pts = <Offset>[p];
  for (var i = 0; i < 20000; i++) {
    final r = p.distance;
    final dt = (0.02 * r).clamp(0.02, 2.0);
    final acc = p / r * (d / (2 * r * r));
    vel += acc * dt;
    p += vel * dt;
    if (i % 2 == 0) pts.add(p);
    if (p.dx < -270 || p.dx > 270 || p.dy.abs() > 200) break;
  }
  return pts;
}

final _rutherford = ModeSpec(
  title: 'Alpha particles meet a nucleus',
  formula: 'd = 2Ze²/4πε₀K,  cot(θ/2) = 2b/d',
  values: {'b': 30, 'K': 5, 'Z': 79},
  controls: (v) => const [Sl('b', 'Impact parameter b', 0, 100, unit: 'fm', div: 100), Sl('K', 'Alpha energy K', 1, 15, unit: 'MeV', div: 28), Sl('Z', 'Atomic number Z', 1, 92, div: 91, dp: 0)],
  presets: {'Gold, 5 MeV, b = 30 fm': {'b': 30, 'K': 5, 'Z': 79}, 'Head-on': {'b': 0}, 'Far off-centre': {'b': 90}, 'Geiger–Marsden (7.7 MeV)': {'K': 7.7, 'b': 10}},
  readouts: (v) {
    final d = 2 * v['Z']! * 1.44 / v['K']!;
    final th = 2 * math.atan(d / (2 * math.max(v['b']!, 1e-6)));
    return [Readout('Closest approach (head-on)', fx(d, 1), 'fm', IX.accent), Readout('Scattering angle θ', fx(deg(th), 1), '°', IX.positive), Readout('Gold nucleus radius', '≈ 7', 'fm')];
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.6);
    final d = 2 * v['Z']! * 1.44 / v['K']!;
    final ppf = left.width / 560;
    final o = Offset(left.center.dx, left.center.dy + 20);
    Offset P(Offset q) => o + Offset(q.dx, -q.dy) * ppf;
    for (final bb in [5.0, 15.0, 30.0, 60.0, 100.0]) {
      final pts = [for (final q in _alphaPath(bb, d)) P(q)];
      EM.flowLine(c, pts, IX.muted.withValues(alpha: 0.5), w: 1.6, every: 400);
    }
    final pts = [for (final q in _alphaPath(v['b']!, d)) P(q)];
    EM.flowLine(c, pts, IX.accent, w: 3.5, every: 200, size: 14);
    c.drawCircle(o, d / 2 * ppf, Draw.stroke(IX.positive.withValues(alpha: 0.4), 1.5));
    Draw.ball(c, o, 12, IX.positive);
    Draw.text(c, 'nucleus Z = ${fx(v['Z']!, 0)}', o + const Offset(0, 34), size: 17, color: IX.positive, halo: true);
    Draw.dim(c, P(Offset(-230, 0)), P(Offset(-230, v['b']!)), 'b', color: IX.accent);
    Draw.caption(c, 'Grey paths: other impact parameters. Small b: thrown back. Large b: barely bent.');
    final p = Plot(right, 1, 15, 0, 2 * v['Z']! * 1.44 * 1.1, xl: 'K (MeV)', yl: 'd (fm)', title: 'Closest approach d = 2Z × 1.44/K fm');
    p.frame(c);
    p.fn(c, (x) => 2 * v['Z']! * 1.44 / x, IX.accent, w: 4);
    p.dot(c, v['K']!, d, IX.accent, label: '${fx(d, 1)} fm');
  },
);

// ── line spectra ──

const _elements = [
  ('Hydrogen', [410.2, 434.0, 486.1, 656.3]),
  ('Helium', [447.1, 471.3, 492.2, 501.6, 587.6, 667.8]),
  ('Sodium', [498.3, 568.8, 589.0, 589.6]),
  ('Mercury', [404.7, 435.8, 546.1, 577.0, 579.1]),
];

final _spectra = ModeSpec(
  title: 'Emission and absorption spectra',
  formula: 'each element has its own lines',
  values: {'el': 0, 'emis': 1, 'lam': 500},
  controls: (v) => const [Seg('el', 'Element', ['Hydrogen', 'Helium', 'Sodium', 'Mercury']), Seg('emis', 'Spectrum', ['Absorption', 'Emission']), Sl('lam', 'Pointer wavelength', 400, 700, unit: 'nm', div: 300, dp: 0)],
  presets: {'Hydrogen emission': {'el': 0, 'emis': 1}, 'Hydrogen absorption': {'el': 0, 'emis': 0}, 'Sodium (yellow pair)': {'el': 2, 'emis': 1, 'lam': 589}},
  drag: (v, p, s, start) {
    v['lam'] = (400 + (p.dx - 80) / (s.width - 160) * 300).clamp(400, 700).roundToDouble();
    return true;
  },
  readouts: (v) {
    final lines = _elements[v['el']!.round()].$2;
    final near = lines.reduce((a, b) => (a - v['lam']!).abs() < (b - v['lam']!).abs() ? a : b);
    return [Readout('Nearest line', fx(near, 1), 'nm', IX.accent), Readout('Photon energy there', fx(1239.8 / near, 2), 'eV'), Readout('Lines in view', '${lines.length}', '')];
  },
  paint: (c, s, v, t) {
    final (name, lines) = _elements[v['el']!.round()];
    final emis = v['emis'] == 1;
    final x0 = 80.0, x1 = s.width - 80;
    double X(double nm) => x0 + (nm - 400) / 300 * (x1 - x0);
    for (final (k, y0) in [(0, 120.0), (1, 420.0)]) {
      final r = Rect.fromLTRB(x0, y0, x1, y0 + 170);
      final showEm = k == 0 ? emis : !emis;
      if (showEm) {
        c.drawRect(r, Draw.fill(const Color(0xFF16182A)));
        for (final l in lines) {
          c.drawRect(Rect.fromCenter(center: Offset(X(l), r.center.dy), width: 5, height: r.height), Draw.fill(Draw.spectral(l)));
        }
      } else {
        for (var x = x0; x < x1; x += 2) {
          c.drawRect(Rect.fromLTWH(x, r.top, 2.3, r.height), Draw.fill(Draw.spectral(400 + (x - x0) / (x1 - x0) * 300)));
        }
        for (final l in lines) {
          c.drawRect(Rect.fromCenter(center: Offset(X(l), r.center.dy), width: 5, height: r.height), Draw.fill(const Color(0xFF16182A)));
        }
      }
      Draw.text(c, k == 0 ? '$name: ${emis ? 'emission (hot gas glows)' : 'absorption (white light through cool gas)'}' : (emis ? 'absorption, for comparison' : 'emission, for comparison'), Offset(x0, y0 - 24), size: 18, align: Alignment.centerLeft, color: k == 0 ? IX.ink : IX.inkSoft);
    }
    for (var nm = 400; nm <= 700; nm += 50) {
      Draw.text(c, '$nm', Offset(X(nm.toDouble()), 316), size: 16, color: IX.inkSoft);
    }
    Draw.text(c, 'nm', Offset(x1 + 30, 316), size: 16, color: IX.inkSoft);
    final px = X(v['lam']!);
    c.drawLine(Offset(px, 100), Offset(px, 610), Draw.stroke(IX.accent, 3));
    IxPaint.handle(c, Offset(px, 640), IX.accent, r: 14);
    Draw.caption(c, 'Drag the pointer. The dark lines of absorption sit exactly where the bright emission lines are.');
  },
);

// ── Bohr orbits ──

final _bohr = ModeSpec(
  title: 'Bohr orbits of hydrogen',
  formula: 'r_n = 0.529 n²/Z Å,  E_n = −13.6 Z²/n² eV',
  values: {'n': 2, 'Z': 1, 'orb': 1},
  animate: true,
  controls: (v) => const [Sl('n', 'Orbit number n', 1, 6, div: 5, dp: 0), Sl('Z', 'Atomic number Z', 1, 3, div: 2, dp: 0), Seg('orb', 'Other orbits', ['Hidden', 'Shown'])],
  presets: {'Ground state': {'n': 1}, 'n = 2': {'n': 2}, 'He⁺ (Z = 2)': {'Z': 2, 'n': 1}},
  readouts: (v) {
    final n = v['n']!.round(), z = v['Z']!;
    return [Readout('Radius', fx(0.529 * n * n / z, 3), 'Å', IX.accent), Readout('Speed', fx(2.19 * z / n, 3), '× 10⁶ m/s'), Readout('Energy E_n', fx(-13.6 * z * z / (n * n), 2), 'eV', IX.positive), Readout('Ionisation energy', fx(13.6 * z * z / (n * n), 2), 'eV')];
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.55);
    final n = v['n']!.round(), z = v['Z']!;
    final o = Offset(left.center.dx, left.center.dy + 10);
    const k = 11.0; // px per n²
    if (v['orb'] == 1) {
      for (var m = 1; m <= 6; m++) {
        c.drawCircle(o, k * m * m, Draw.stroke(IX.rule, 2));
        if (m >= 3) Draw.text(c, 'n = $m', o + Offset(k * m * m * 0.72, -k * m * m * 0.72), size: 15, color: IX.muted, halo: true);
      }
    }
    c.drawCircle(o, k * n * n, Draw.stroke(IX.accent, 3));
    Draw.ball(c, o, 9, IX.positive);
    final a = t * 2.4 / (n * n * n) * 6;
    final e = o + Offset(math.cos(a), -math.sin(a)) * (k * n * n);
    Draw.ball(c, e, 8, IX.negative);
    final tan = Offset(-math.sin(a), -math.cos(a));
    Draw.force(c, e, e + tan * (90 / n), IX.accent, 'v');
    Draw.caption(c, 'Radius grows as n², speed falls as 1/n, energy rises as −1/n².');
    // Energy ladder.
    final p = Plot(right, 0, 1, -13.6 * z * z * 1.08, 1, xl: '', yl: 'E (eV)', title: 'Energy levels');
    p.frame(c);
    for (var m = 1; m <= 6; m++) {
      final e = -13.6 * z * z / (m * m);
      c.drawLine(p.p(0.1, e), p.p(0.75, e), Draw.stroke(m == n ? IX.accent : IX.inkSoft, m == n ? 5 : 2.5));
      Draw.text(c, 'n = $m  ${fx(e, 2)} eV', p.p(0.78, e), size: 16, color: m == n ? IX.accent : IX.inkSoft, align: Alignment.centerLeft);
    }
    p.hline(c, 0, IX.muted, label: 'free (E = 0)');
  },
);

// ── spectral series ──

String _seriesName(int nf) => const ['Lyman (UV)', 'Balmer (visible)', 'Paschen (IR)', 'Brackett (IR)', 'Pfund (IR)'][nf - 1];

final _series = ModeSpec(
  title: "Hydrogen's spectral series",
  formula: '1/λ = R (1/n_f² − 1/n_i²)',
  values: {'ni': 3, 'nf': 2},
  controls: (v) => const [Sl('ni', 'Upper level n_i', 2, 10, div: 8, dp: 0), Sl('nf', 'Lower level n_f', 1, 5, div: 4, dp: 0)],
  presets: {'H-alpha (3 → 2)': {'ni': 3, 'nf': 2}, 'Lyman alpha (2 → 1)': {'ni': 2, 'nf': 1}, 'Paschen (4 → 3)': {'ni': 4, 'nf': 3}},
  readouts: (v) {
    final ni = v['ni']!.round(), nf = v['nf']!.round();
    if (ni <= nf) return [const Readout('Choose n_i > n_f', '—', '')];
    final lam = 1 / (_ry * (1 / (nf * nf) - 1 / (ni * ni))) * 1e9;
    return [Readout('Wavelength λ', fx(lam, 1), 'nm', IX.accent), Readout('Photon energy', fx(1239.8 / lam, 3), 'eV', IX.positive), Readout('Series', _seriesName(nf), ''), Readout('Series limit', fx(nf * nf / _ry * 1e9, 1), 'nm')];
  },
  paint: (c, s, v, t) {
    final ni = v['ni']!.round(), nf = v['nf']!.round();
    final (left, right) = Lay.split(s, 0.5);
    // Level diagram (energies to scale).
    final y0 = left.top + 80, y1 = left.bottom - 50;
    double Y(double e) => y0 + (e / -13.6) * (y1 - y0);
    for (var m = 1; m <= 7; m++) {
      final e = -13.6 / (m * m);
      EM.level(c, left.left + 120, left.right - 150, Y(e), 'n = $m', '${fx(e, 2)} eV', col: m == ni || m == nf ? IX.accent : IX.inkSoft, w: m == ni || m == nf ? 3.5 : 2);
    }
    EM.level(c, left.left + 120, left.right - 150, Y(0), '∞', '0 eV', col: IX.muted, w: 1.5);
    // All lines of this series, and the chosen one.
    for (var m = nf + 1; m <= 7; m++) {
      final x = left.left + 150 + (m - nf - 1) * 46.0;
      final lam = 1 / (_ry * (1 / (nf * nf) - 1 / (m * m))) * 1e9;
      final col = lam >= 380 && lam <= 780 ? Draw.spectral(lam) : IX.muted;
      IxPaint.arrow(c, Offset(x, Y(-13.6 / (m * m))), Offset(x, Y(-13.6 / (nf * nf))), m == ni ? col : col.withValues(alpha: 0.35), width: m == ni ? 5 : 2.5, head: m == ni ? 18 : 12);
    }
    Draw.caption(c, ni > nf ? '${_seriesName(nf)}: every jump that ends on n = $nf.' : 'Choose n_i larger than n_f.');
    if (ni <= nf) return;
    final p = Plot(right, nf + 1, 10, 0, 13.6 / (nf * nf) * 1.1, xl: 'n_i', yl: 'E (eV)', title: 'Photon energy rises to the limit 13.6/n_f² eV');
    p.frame(c);
    p.fn(c, (x) => 13.6 * (1 / (nf * nf) - 1 / (x * x)), IX.accent, w: 3);
    for (var m = nf + 1; m <= 10; m++) {
      p.dot(c, m.toDouble(), 13.6 * (1 / (nf * nf) - 1 / (m * m)), m == ni ? IX.positive : IX.accent, rr: m == ni ? 10 : 6);
    }
    p.hline(c, 13.6 / (nf * nf), IX.muted, label: 'series limit');
  },
);

// ── standing waves ──

final _standing = ModeSpec(
  title: 'Electron waves that fit an orbit',
  formula: '2πr = nλ  ⇔  mvr = nh/2π',
  values: {'q': 3, 'vib': 1},
  animate: true,
  controls: (v) => const [Sl('q', 'Wavelengths around the orbit', 1, 8, div: 28), Seg('vib', 'Vibrate', ['Off', 'On'])],
  presets: {'n = 3 (fits)': {'q': 3}, '3.5 (does not fit)': {'q': 3.5}, 'n = 6': {'q': 6}},
  readouts: (v) {
    final q = v['q']!;
    final fits = (q - q.round()).abs() < 1e-6;
    return [Readout('Fits?', fits ? 'Yes: allowed orbit n = ${q.round()}' : 'No: the wave cancels itself', '', fits ? IX.green : IX.positive), Readout('Angular momentum', fits ? '${q.round()} h/2π' : '—', '')];
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.5);
    final q = v['q']!;
    final o = Offset(left.center.dx, left.center.dy + 10);
    const r0 = 220.0;
    final amp = v['vib'] == 1 ? math.cos(t * 3) : 1.0;
    c.drawCircle(o, r0, Draw.stroke(IX.rule, 2));
    final path = Path();
    for (var i = 0; i <= 720; i++) {
      final ph = i / 720 * 2 * math.pi;
      final rr = r0 + 40 * amp * math.sin(q * ph);
      final p = o + Offset(math.cos(ph), -math.sin(ph)) * rr;
      i == 0 ? path.moveTo(p.dx, p.dy) : path.lineTo(p.dx, p.dy);
    }
    final fits = (q - q.round()).abs() < 1e-6;
    c.drawPath(path, Draw.stroke(fits ? IX.accent : IX.positive, 3.5));
    Draw.ball(c, o, 10, IX.positive);
    if (!fits) Draw.tag(c, 'the ends do not meet', o + Offset(r0 + 10, 0), color: IX.positive, align: Alignment.centerLeft);
    Draw.caption(c, 'Only a whole number of wavelengths joins smoothly and stands still.');
    final p = Plot(right, 0, 2 * math.pi, -1.3, 1.3, xl: 'angle round the orbit (rad)', yl: 'wave', title: 'The wave unrolled: does the end meet the start?');
    p.frame(c);
    p.hline(c, 0, IX.muted);
    p.fn(c, (x) => math.sin(q * x), fits ? IX.accent : IX.positive, w: 4);
    p.dot(c, 0, 0, IX.green);
    p.dot(c, 2 * math.pi, math.sin(q * 2 * math.pi), IX.green);
  },
);
