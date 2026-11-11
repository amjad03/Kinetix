import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bench.dart';
import 'kit.dart';

/// Light and the atom: Bohr's hydrogen spectrum, the photoelectric effect, de Broglie waves with
/// the uncertainty principle, and Rutherford's alpha-particle scattering.

const _h = 6.626e-34, _e = 1.602e-19, _me = 9.109e-31, _c = 2.998e8;
const _rh = 109677.0; // cm⁻¹

/// The colour of light of wavelength [nm]; ultraviolet and infrared are drawn grey-violet / grey-red.
Color spectral(double nm) {
  if (nm < 380) return const Color(0xFF8E86B8);
  if (nm > 750) return const Color(0xFFA88A86);
  double r, g, b;
  if (nm < 440) {
    r = (440 - nm) / 60; g = 0; b = 1;
  } else if (nm < 490) {
    r = 0; g = (nm - 440) / 50; b = 1;
  } else if (nm < 510) {
    r = 0; g = 1; b = (510 - nm) / 20;
  } else if (nm < 580) {
    r = (nm - 510) / 70; g = 1; b = 0;
  } else if (nm < 645) {
    r = 1; g = (645 - nm) / 65; b = 0;
  } else {
    r = 1; g = 0; b = 0;
  }
  final k = nm < 420 ? 0.4 + 0.6 * (nm - 380) / 40 : nm > 700 ? 0.4 + 0.6 * (750 - nm) / 50 : 1.0;
  final col = Color.fromARGB(255, (255 * r * k).round(), (255 * g * k).round(), (255 * b * k).round());
  return Color.lerp(col, const Color(0xFF30344F), 0.12)!;
}

String _series(int n1) => const {1: 'Lyman (UV)', 2: 'Balmer (visible)', 3: 'Paschen (IR)', 4: 'Brackett (IR)', 5: 'Pfund (IR)'}[n1]!;

List<Offset> _trajectory(double b, double d) {
  // Coulomb repulsion in fm, speed 1 at infinity: a = K r̂ / r², K = d / 2.
  final k = d / 2;
  var x = -420.0, y = b, vx = 1.0, vy = 0.0;
  final out = <Offset>[Offset(x, y)];
  for (var i = 0; i < 6000; i++) {
    final r = math.sqrt(x * x + y * y);
    final dt = (r * 0.02).clamp(0.02, 2.0);
    final a = k / (r * r * r);
    vx += a * x * dt;
    vy += a * y * dt;
    x += vx * dt;
    y += vy * dt;
    if (i % 3 == 0) out.add(Offset(x, y));
    if (x.abs() > 440 || y.abs() > 330) break;
  }
  out.add(Offset(x, y));
  return out;
}

final Map<String, Mode> quantumModes = {
  'bohr': Mode(
    title: "Bohr's hydrogen atom and its spectrum",
    subtitle: 'Structure of atom · Bohr model and line spectra',
    formula: 'ν̄ = R_H (1/n₁² − 1/n₂²)',
    defaults: {'n1': 2, 'n2': 3},
    knobsOf: (v) => [
      const Slide('n1', 'Lower level n₁', 1, 5, step: 1, digits: 0),
      Slide('n2', 'Upper level n₂', v.g('n1', 2) + 1, 8, step: 1, digits: 0),
      const Note('Eₙ = −13.6/n² eV, so the levels crowd together towards n = ∞ (0 eV, ionisation).'),
    ],
    readouts: (v) {
      final n1 = v.i('n1', 2), n2 = math.max(v.i('n2', 3), n1 + 1);
      final wn = _rh * (1 / (n1 * n1) - 1 / (n2 * n2));
      return [
        Readout('Wavenumber', sx(wn), 'cm⁻¹', IX.accent),
        Readout('Wavelength', (1e7 / wn).toStringAsFixed(1), 'nm', spectral(1e7 / wn)),
        Readout('Photon energy', (13.6 * (1 / (n1 * n1) - 1 / (n2 * n2))).toStringAsFixed(3), 'eV', IX.amber),
        Readout('Frequency', sx(wn * 100 * _c), 'Hz'),
        Readout('Series', _series(n1)),
      ];
    },
    paint: (c, s, v) {
      final n1 = v.i('n1', 2), n2 = math.max(v.i('n2', 3), n1 + 1);
      final lam = 1e7 / (_rh * (1 / (n1 * n1) - 1 / (n2 * n2)));
      final r = Rect.fromLTWH(150, 60, s.width * 0.42, s.height - 120);
      double y(double e) => r.top + (-e / 14.5) * r.height * 0.97 + 20;
      lbl(c, 'Energy (eV)', r.topLeft + const Offset(-100, -24), size: 17, align: Alignment.centerLeft);
      for (var n = 1; n <= 8; n++) {
        final e = -13.6 / (n * n);
        final on = n == n1 || n == n2;
        level(c, r.left, r.right - 120, y(e), on ? IX.ink : IX.muted, w: on ? 4 : 2.5);
        if (n <= 6) {
          lbl(c, 'n = $n', Offset(r.right - 105, y(e)), size: 17, color: on ? IX.ink : IX.muted, align: Alignment.centerLeft, w: on ? FontWeight.w700 : FontWeight.w500);
          lbl(c, nf(e, 2), Offset(r.left - 14, y(e)), size: 16, color: IX.inkSoft, align: Alignment.centerRight);
        }
      }
      IxPaint.dashed(c, Offset(r.left, y(0)), Offset(r.right - 120, y(0)), stroke(IX.muted, 1.5));
      lbl(c, 'n = ∞', Offset(r.right - 105, y(0)), size: 17, color: IX.muted, align: Alignment.centerLeft);
      lbl(c, '0', Offset(r.left - 14, y(0)), size: 16, color: IX.inkSoft, align: Alignment.centerRight);
      // Other lines of the series, faint.
      for (var k = n1 + 1; k <= 8; k++) {
        final x = r.left + 40 + (k - n1 - 1) * 46.0;
        IxPaint.arrow(c, Offset(x, y(-13.6 / (k * k))), Offset(x, y(-13.6 / (n1 * n1))), k == n2 ? spectral(lam) : IX.rule, width: k == n2 ? 6 : 3, head: k == n2 ? 20 : 12);
      }
      final ax = r.left + 40 + (n2 - n1 - 1) * 46.0;
      final mid = (y(-13.6 / (n2 * n2)) + y(-13.6 / (n1 * n1))) / 2;
      // Photon wiggle.
      final path = Path()..moveTo(ax + 16, mid);
      for (var i = 0; i <= 60; i++) {
        path.lineTo(ax + 16 + i * 2.2, mid + math.sin(i * 0.55) * 9);
      }
      c.drawPath(path, stroke(spectral(lam), 3));
      lbl(c, 'hν', Offset(ax + 160, mid), size: 22, color: IX.ink, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
      // Spectrum strip for the series.
      final sp = Rect.fromLTWH(s.width * 0.6, 120, s.width * 0.36, 150);
      final lo = 1e7 / (_rh / (n1 * n1)) * 0.96, hi = 1e7 / (_rh * (1 / (n1 * n1) - 1 / ((n1 + 1) * (n1 + 1)))) * 1.04;
      double sx(double nm) => sp.left + (nm - lo) / (hi - lo) * sp.width;
      c.drawRRect(RRect.fromRectAndRadius(sp, const Radius.circular(10)), fill(const Color(0xFF1E2235)));
      if (n1 == 2) {
        for (var nm = 380.0; nm <= 700; nm += 2) {
          c.drawRect(Rect.fromLTRB(sx(nm), sp.top, sx(nm + 2) + 0.5, sp.top + 12), fill(spectral(nm).withValues(alpha: 0.7)));
        }
      }
      for (var k = n1 + 1; k <= 14; k++) {
        final nm = 1e7 / (_rh * (1 / (n1 * n1) - 1 / (k * k)));
        final on = k == n2;
        c.drawLine(Offset(sx(nm), sp.top + 18), Offset(sx(nm), sp.bottom - 8), Paint()..color = spectral(nm).withValues(alpha: on ? 1 : 0.6)..strokeWidth = on ? 6 : 3);
      }
      final limit = 1e7 / (_rh / (n1 * n1));
      IxPaint.dashed(c, Offset(sx(limit), sp.top + 4), Offset(sx(limit), sp.bottom), stroke(Colors.white54, 1.5));
      lbl(c, '${_series(n1).split(' ').first} series', sp.topLeft + const Offset(0, -28), size: 20, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
      lbl(c, '${lo.toStringAsFixed(0)} nm', sp.bottomLeft + const Offset(0, 18), size: 15, align: Alignment.centerLeft);
      lbl(c, '${hi.toStringAsFixed(0)} nm', sp.bottomRight + const Offset(0, 18), size: 15, align: Alignment.centerRight);
      lbl(c, 'series limit', Offset(sx(limit), sp.bottom + 18), size: 15, color: IX.muted);
      // Orbit picture (radii ∝ n², drawn up to n = 5).
      final oc = Offset(s.width * 0.78, s.height * 0.66);
      final unit = math.min(s.width * 0.18, s.height * 0.3) / 25;
      for (var n = 1; n <= 5; n++) {
        c.drawCircle(oc, n * n * unit, stroke(n == n1 || n == n2 ? IX.inkSoft : IX.rule, n == n1 || n == n2 ? 2.2 : 1.4));
      }
      c.drawCircle(oc, 6, fill(IX.positive));
      if (n2 <= 5) {
        IxPaint.arrow(c, oc + Offset(n2 * n2 * unit * 0.707, -n2 * n2 * unit * 0.707), oc + Offset(n1 * n1 * unit * 0.707, -n1 * n1 * unit * 0.707), spectral(lam), width: 4);
        ball(c, oc + Offset(n2 * n2 * unit * 0.707, -n2 * n2 * unit * 0.707), 9, IX.accent);
      }
      lbl(c, 'orbit radius rₙ = 52.9 n² pm', oc + Offset(0, 25 * unit + 26), size: 15, color: IX.muted);
    },
    presets: {'Hα 3→2': {'n1': 2, 'n2': 3}, 'Hβ 4→2': {'n1': 2, 'n2': 4}, 'Lyman 2→1': {'n1': 1, 'n2': 2}, 'Paschen 4→3': {'n1': 3, 'n2': 4}},
  ),
  'photo': Mode(
    title: 'The photoelectric effect',
    subtitle: 'Structure of atom · Particle nature of light',
    formula: 'hν = W₀ + ½mₑv²',
    defaults: {'W': 2.3, 'nu': 8, 'I': 3},
    autoRun: true,
    tick: (v, dt) {},
    knobs: const [
      Slide('W', 'Work function W₀', 1.5, 5.5, unit: 'eV', digits: 2, step: 0.05),
      Slide('nu', 'Frequency ν', 2, 15, unit: '× 10¹⁴ Hz', digits: 1, step: 0.1),
      Slide('I', 'Intensity (photons per second)', 1, 5, step: 1, digits: 0),
      Note('Brighter light ejects more electrons, but each one\'s energy depends only on ν.'),
    ],
    readouts: (v) {
      final hv = _h * v.g('nu', 8) * 1e14 / _e, ke = hv - v.g('W', 2.3);
      return [
        Readout('Photon energy hν', hv.toStringAsFixed(2), 'eV', IX.accent),
        Readout('Kinetic energy', ke > 0 ? ke.toStringAsFixed(2) : '0', 'eV', ke > 0 ? IX.green : IX.muted),
        Readout('Threshold ν₀', (v.g('W', 2.3) * _e / _h / 1e14).toStringAsFixed(2), '× 10¹⁴ Hz'),
        Readout('Electron speed', ke > 0 ? sx(math.sqrt(2 * ke * _e / _me)) : '0', 'm/s'),
      ];
    },
    paint: (c, s, v) {
      final nu = v.g('nu', 8), w0 = v.g('W', 2.3), t = v.g('_t');
      final hv = _h * nu * 1e14 / _e, ke = hv - w0;
      final lam = _c / (nu * 1e14) * 1e9;
      final col = spectral(lam);
      // Evacuated tube with the metal plate.
      final tube = Rect.fromLTWH(40, 80, s.width * 0.44, s.height * 0.62);
      c.drawRRect(RRect.fromRectAndRadius(tube, const Radius.circular(120)), fill(const Color(0xFFF2F6FA)));
      c.drawRRect(RRect.fromRectAndRadius(tube, const Radius.circular(120)), stroke(IX.glassEdge, 3));
      final plate = Rect.fromLTWH(tube.left + 70, tube.top + 70, 26, tube.height - 140);
      c.drawRect(plate, Paint()..shader = ui.Gradient.linear(plate.centerLeft, plate.centerRight, [const Color(0xFF7D8596), const Color(0xFFC9CFDA), const Color(0xFF7D8596)], [0, 0.5, 1]));
      lbl(c, 'metal', plate.bottomCenter + const Offset(0, 22), size: 16, color: IX.inkSoft);
      final coll = Rect.fromLTWH(tube.right - 96, tube.top + 90, 18, tube.height - 180);
      c.drawRect(coll, fill(const Color(0xFF8A93A8)));
      lbl(c, 'collector', coll.bottomCenter + const Offset(0, 22), size: 16, color: IX.inkSoft);
      // Light beam from the upper right.
      final src = Offset(tube.right - 10, tube.top - 50);
      final beam = Path()..moveTo(src.dx - 20, src.dy)..lineTo(src.dx + 20, src.dy)..lineTo(plate.right + 4, plate.center.dy + 40)..lineTo(plate.right + 4, plate.center.dy - 40)..close();
      c.drawPath(beam, fill(col.withValues(alpha: 0.10 + 0.04 * v.g('I', 3))));
      for (var k = 0; k < v.i('I', 3); k++) {
        final f = ((t * 0.9 + k / v.g('I', 3)) % 1);
        final p = Offset.lerp(src, Offset(plate.right + 6, plate.center.dy - 30 + k * 15.0), f)!;
        final dir = (Offset(plate.right, plate.center.dy) - src);
        final u = dir / dir.distance, n = Offset(-u.dy, u.dx);
        final wig = Path()..moveTo(p.dx, p.dy);
        for (var i = 0; i <= 24; i++) {
          final q = p - u * (i * 2.0) + n * math.sin(i * 0.9) * 6;
          wig.lineTo(q.dx, q.dy);
        }
        c.drawPath(wig, stroke(col, 2.5));
      }
      lbl(c, lam < 380 ? 'ultraviolet  ${lam.toStringAsFixed(0)} nm' : lam > 750 ? 'infrared  ${lam.toStringAsFixed(0)} nm' : '${lam.toStringAsFixed(0)} nm', src + const Offset(0, -24), size: 17, color: IX.ink, w: FontWeight.w600);
      // Electrons.
      if (ke > 0) {
        final speed = math.sqrt(ke) * 0.6;
        for (var k = 0; k < v.i('I', 3) * 3; k++) {
          final f = ((t * speed + rnd(k)) % 1);
          final y0 = plate.top + 20 + rnd(k, 1) * (plate.height - 40);
          final p = Offset(plate.right + 8 + f * (coll.left - plate.right - 16), y0 + (rnd(k, 2) - 0.5) * 60 * f);
          IxPaint.arrow(c, p, p + Offset(20 + 30 * math.sqrt(ke), 0), IX.accent.withValues(alpha: 0.35), width: 2, head: 8);
          ball(c, p, 8, IX.accent);
        }
      } else {
        lbl(c, 'ν < ν₀: no electrons, however bright', tube.center + const Offset(30, 0), size: 19, color: IX.positive, w: FontWeight.w600, halo: true);
      }
      // KE against frequency.
      final pr = Rect.fromLTWH(s.width * 0.58, 70, s.width * 0.37, s.height - 180);
      final pl = Plot(pr, 0, 15, 0, 4.5);
      pl.axes(c, x: 'Frequency ν (× 10¹⁴ Hz)', y: 'Kinetic energy (eV)', dx: 3, dy: 1, title: 'KE = hν − W₀');
      final nu0 = w0 * _e / _h / 1e14;
      pl.curve(c, (x) => x < nu0 ? double.nan : _h * x * 1e14 / _e - w0, IX.accent, from: nu0);
      pl.vline(c, nu0, IX.positive, label: 'ν₀ = ${nu0.toStringAsFixed(1)}');
      pl.dot(c, nu, math.max(0, ke), ke > 0 ? IX.green : IX.muted, label: ke > 0 ? '${ke.toStringAsFixed(2)} eV' : null);
      lbl(c, 'slope = h = 6.626 × 10⁻³⁴ J s', pr.bottomRight + const Offset(-10, -24), size: 15, color: IX.muted, align: Alignment.centerRight);
    },
    presets: {'Sodium, violet': {'W': 2.3, 'nu': 7.5}, 'Sodium, red': {'W': 2.3, 'nu': 4.5}, 'Copper, UV': {'W': 4.8, 'nu': 13}, 'Potassium': {'W': 2.25, 'nu': 10}},
  ),
  'debroglie': Mode(
    title: 'Matter waves and uncertainty',
    subtitle: 'Structure of atom · Dual behaviour of matter',
    formula: 'λ = h/mv     Δx·Δp ≥ h/4π',
    defaults: {'m': 0, 'v': 2, 'dx': 100},
    knobs: [
      Pick('m', 'Particle', const ['Electron', 'Proton', 'α particle'], ids: const ['electron', 'proton', 'alpha']),
      const Slide('v', 'Speed v', 0.1, 10, unit: '× 10⁶ m/s', digits: 1, step: 0.1),
      const Slide('dx', 'Position known to Δx', 10, 1000, unit: 'pm', digits: 0, step: 10),
    ],
    readouts: (v) {
      final m = _mass(v), vel = v.g('v', 2) * 1e6;
      final lam = _h / (m * vel);
      final dv = _h / (4 * math.pi * m * v.g('dx', 100) * 1e-12);
      return [
        Readout('Wavelength λ', sx(lam * 1e12), 'pm', IX.accent),
        Readout('Momentum', sx(m * vel), 'kg m/s'),
        Readout('Least Δv', sx(dv), 'm/s', IX.amber),
        Readout('Δv / v', sx(dv / vel), '', dv / vel > 1 ? IX.positive : IX.green),
      ];
    },
    paint: (c, s, v) {
      final m = _mass(v), vel = v.g('v', 2) * 1e6;
      final lam = _h / (m * vel) * 1e12; // pm
      // Wave along a track, against an atom for scale (≈ 100 pm across).
      final track = Rect.fromLTWH(60, 70, s.width - 120, 260);
      panel(c, track, 'The particle as a wave');
      final pxPerPm = (track.width - 80) / 1000;
      final cy = track.center.dy + 10;
      final path = Path();
      for (var i = 0; i <= 900; i++) {
        final x = track.left + 40 + i * (track.width - 80) / 900;
        final pm = (x - track.left - 40) / pxPerPm;
        final env = math.exp(-math.pow((pm - 500) / 230, 2));
        final y = cy - 70 * env * math.cos(2 * math.pi * pm / math.max(lam, 0.5));
        i == 0 ? path.moveTo(x, y) : path.lineTo(x, y);
      }
      c.drawPath(path, stroke(IX.accent, lam < 4 ? 1.2 : 3));
      final aw = 100 * pxPerPm;
      c.drawCircle(Offset(track.right - 40 - aw / 2, track.bottom - 50), aw / 2, fill(IX.accentSoft));
      c.drawCircle(Offset(track.right - 40 - aw / 2, track.bottom - 50), aw / 2, stroke(IX.accent.withValues(alpha: 0.4), 1.5));
      lbl(c, 'an atom ≈ 100 pm', Offset(track.right - 60 - aw, track.bottom - 50), size: 15, color: IX.inkSoft, align: Alignment.centerRight);
      lbl(c, '1000 pm shown', Offset(track.left + 40, track.bottom - 26), size: 15, color: IX.muted, align: Alignment.centerLeft);
      if (lam < 4) lbl(c, 'λ = ${sx(lam)} pm: far too short to see on this scale', Offset(track.center.dx, track.top + 30), size: 17, color: IX.inkSoft, halo: true);
      // λ against speed.
      final pr = Rect.fromLTWH(140, 420, s.width * 0.42, s.height - 520);
      final top = _h / (m * 1e5) * 1e12;
      final pl = Plot(pr, 0, 10, 0, top * 0.25);
      pl.axes(c, x: 'Speed (× 10⁶ m/s)', y: 'λ (pm)', dx: 2, title: 'λ falls as 1/v');
      pl.curve(c, (x) => _h / (m * x * 1e6) * 1e12, IX.accent, from: 0.05);
      pl.dot(c, v.g('v', 2), lam, IX.amber, label: '${sx(lam)} pm');
      // Uncertainty card.
      final ur = Rect.fromLTWH(s.width * 0.58, 400, s.width * 0.38, s.height - 440);
      panel(c, ur, 'Heisenberg uncertainty');
      final dx = v.g('dx', 100);
      final dv = _h / (4 * math.pi * m * dx * 1e-12);
      final bw = (ur.width - 80) * dx / 1000;
      final bc = Offset(ur.center.dx, ur.top + 120);
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: bc, width: math.max(bw, 6), height: 70), const Radius.circular(10)), fill(IX.accent.withValues(alpha: 0.12)));
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: bc, width: math.max(bw, 6), height: 70), const Radius.circular(10)), stroke(IX.accent, 2));
      for (var i = 0; i < 9; i++) {
        ball(c, bc + Offset((rnd(i, 7) - 0.5) * math.max(bw - 14, 0), (rnd(i, 8) - 0.5) * 46), 6, IX.accent);
      }
      lbl(c, 'Δx = ${dx.toStringAsFixed(0)} pm', bc + const Offset(0, 56), size: 18, color: IX.accent, w: FontWeight.w600);
      lbl(c, 'Δv ≥ h / (4π m Δx) = ${sx(dv)} m/s', Offset(ur.center.dx, ur.bottom - 60), size: 20, color: IX.ink, w: FontWeight.w600);
      lbl(c, 'Pin the position down and the speed becomes uncertain.', Offset(ur.center.dx, ur.bottom - 28), size: 15, color: IX.muted);
    },
    presets: {'Electron': {'m': 0, 'v': 2}, 'Slow electron': {'m': 0, 'v': 0.5}, 'Proton': {'m': 1, 'v': 2}, 'Electron in an atom': {'m': 0, 'v': 2, 'dx': 50}},
  ),
  'rutherford': Mode(
    title: "Rutherford's gold foil experiment",
    subtitle: 'Structure of atom · Nuclear model',
    formula: 'θ = 2 tan⁻¹(d / 2b)',
    defaults: {'b': 40, 'E': 5},
    autoRun: true,
    tick: (v, dt) {},
    knobs: const [
      Slide('b', 'Aim (impact parameter) b', 2, 200, unit: 'fm', digits: 0, step: 1),
      Slide('E', 'Alpha particle energy', 2, 8, unit: 'MeV', digits: 1, step: 0.1),
      Note('d is the head-on distance of closest approach. Only alpha particles aimed within a few d of the tiny nucleus are deflected much.'),
    ],
    readouts: (v) {
      final d = 1.44 * 2 * 79 / v.g('E', 5);
      final b = v.g('b', 40);
      final th = 2 * math.atan(d / (2 * b));
      return [
        Readout('Deflection θ', (th * 180 / math.pi).toStringAsFixed(1), '°', IX.accent),
        Readout('Head-on approach d', d.toStringAsFixed(1), 'fm', IX.amber),
        Readout('Closest approach', (d / 2 * (1 + 1 / math.sin(th / 2))).toStringAsFixed(1), 'fm'),
        Readout('Gold nucleus radius', '≈ 7', 'fm'),
      ];
    },
    paint: (c, s, v) {
      final d = 1.44 * 2 * 79 / v.g('E', 5);
      final o = Offset(s.width * 0.55, s.height * 0.52);
      final k = math.min(s.width / 960, s.height / 680);
      Offset map(Offset q) => o + q * k;
      c.drawCircle(o, 300 * k, Paint()..shader = ui.Gradient.radial(o, 300 * k, [IX.accentSoft.withValues(alpha: 0.6), IX.paper.withValues(alpha: 0)]));
      // A fan of beams, faint, and the chosen one bold.
      final bs = [for (var i = -9; i <= 9; i++) i * 22.0 + 0.5];
      final t = v.g('_t');
      for (final (i, b) in bs.indexed) {
        final tr = _trajectory(b, d);
        final path = Path()..moveTo(map(tr.first).dx, map(tr.first).dy);
        for (final q in tr.skip(1)) {
          path.lineTo(map(q).dx, map(q).dy);
        }
        c.drawPath(path, stroke(IX.positive.withValues(alpha: 0.18), 2));
        final f = ((t * 0.18 + rnd(i, 5)) % 1);
        final idx = (f * (tr.length - 1)).floor();
        ball(c, map(tr[idx]), 6, IX.positive.withValues(alpha: 0.75));
      }
      final b = v.g('b', 40);
      final tr = _trajectory(b, d);
      final path = Path()..moveTo(map(tr.first).dx, map(tr.first).dy);
      for (final q in tr.skip(1)) {
        path.lineTo(map(q).dx, map(q).dy);
      }
      c.drawPath(path, stroke(IX.positive, 4));
      final f = ((t * 0.18) % 1);
      ball(c, map(tr[(f * (tr.length - 1)).floor()]), 11, IX.positive);
      // Impact parameter marker.
      final start = map(Offset(-400, b));
      IxPaint.dashed(c, map(const Offset(-420, 0)), map(const Offset(420, 0)), stroke(IX.muted, 1.2));
      IxPaint.arrow(c, Offset(start.dx, o.dy), Offset(start.dx, start.dy), IX.inkSoft, width: 2, head: 10);
      lbl(c, 'b', Offset(start.dx - 14, (o.dy + start.dy) / 2), size: 20, color: IX.inkSoft, w: FontWeight.w700, align: Alignment.centerRight);
      // Deflection angle at the exit.
      final th = 2 * math.atan(d / (2 * b));
      lbl(c, 'θ = ${(th * 180 / math.pi).toStringAsFixed(1)}°', map(tr.last) + const Offset(0, -24), size: 20, color: IX.positive, w: FontWeight.w700, halo: true, align: Alignment.center);
      ball(c, o, 10, const Color(0xFFD4A72C));
      lbl(c, 'Au nucleus (+79)', o + const Offset(0, 30), size: 16, color: IX.ink, w: FontWeight.w600, halo: true);
      lbl(c, '100 fm', Offset(40 + 50 * k, s.height - 52), size: 15, color: IX.inkSoft);
      c.drawLine(Offset(40, s.height - 34), Offset(40 + 100 * k, s.height - 34), stroke(IX.inkSoft, 3));
      lbl(c, 'α particles (He²⁺)', Offset(30, 40), size: 18, color: IX.positive, w: FontWeight.w600, align: Alignment.centerLeft);
    },
    presets: {'Glancing (b = 150 fm)': {'b': 150}, 'Close (b = 20 fm)': {'b': 20}, 'Nearly head-on': {'b': 4}, 'Faster α (8 MeV)': {'b': 40, 'E': 8}},
  ),
};

double _mass(V v) => [_me, 1.6726e-27, 6.645e-27][v.i('m').clamp(0, 2)];
