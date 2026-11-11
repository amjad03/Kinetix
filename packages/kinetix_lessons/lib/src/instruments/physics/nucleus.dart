import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'kit.dart';

/// Nuclei and radioactivity (2nd PUC ch. 13 and 16): composition, size, the binding-energy
/// curve, the nuclear force, chain reactions, a decay chain and half-life.
final nucleusSpec = InstrumentSpec(
  id: 'nucleus',
  chapter: '2nd PUC Physics · Nuclei',
  modes: {'build': _build, 'size': _size, 'binding': _binding, 'force': _force, 'fission': _fission, 'decay': _decay, 'halflife': _halflife},
);

const _sym = 'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm';
String _el(int z) {
  final l = _sym.split(' ');
  return z >= 1 && z <= l.length ? l[z - 1] : '?';
}

/// A packed ball of [z] protons and [n] neutrons centred at [o].
void _nucleus(Canvas c, Offset o, int z, int n, double rb) {
  final a = z + n;
  final rnd = math.Random(a * 31 + z);
  final kinds = List<bool>.generate(a, (i) => i < z)..shuffle(rnd);
  for (var i = a - 1; i >= 0; i--) {
    // Sunflower packing keeps the nucleus round and dense at any A.
    final r = rb * 1.05 * math.sqrt(i + 0.5);
    final th = i * 2.39996;
    Draw.ball(c, o + Offset(math.cos(th), math.sin(th)) * r, rb, kinds[i] ? IX.positive : const Color(0xFF9AA3B5));
  }
}

// ── composition ──

final _build = ModeSpec(
  title: 'Build a nucleus',
  formula: 'A = Z + N',
  values: {'Z': 6, 'N': 6},
  controls: (v) => const [Sl('Z', 'Protons Z', 1, 100, div: 99, dp: 0), Sl('N', 'Neutrons N', 0, 160, div: 160, dp: 0)],
  presets: {'Carbon-12': {'Z': 6, 'N': 6}, 'Carbon-14 (isotope)': {'Z': 6, 'N': 8}, 'Nitrogen-14 (isobar of C-14)': {'Z': 7, 'N': 7}, 'Gold-197': {'Z': 79, 'N': 118}},
  readouts: (v) {
    final z = v['Z']!.round(), n = v['N']!.round();
    return [Readout('Element', _el(z), '', IX.positive), Readout('Mass number A', '${z + n}', '', IX.accent), Readout('Symbol', '${_supA(z + n)}${_el(z)}', ''), Readout('N/Z', fx(n / z, 2), '')];
  },
  paint: (c, s, v, t) {
    final z = v['Z']!.round(), n = v['N']!.round();
    final (left, right) = Lay.split(s, 0.55);
    final rb = (110 / math.sqrt(z + n)).clamp(7.0, 34.0);
    _nucleus(c, Offset(left.center.dx, left.center.dy + 10), z, n, rb);
    Draw.text(c, '${z + n}', Offset(left.left + 70, left.top + 70), size: 30, color: IX.accent);
    Draw.text(c, '$z', Offset(left.left + 70, left.top + 150), size: 30, color: IX.positive);
    Draw.text(c, _el(z), Offset(left.left + 130, left.top + 110), size: 64, w: FontWeight.w700);
    Draw.caption(c, 'Red: protons. Grey: neutrons. Z alone fixes the element.', at: const Offset(28, 210));
    Draw.bars(c, right, [('protons Z', z.toDouble(), IX.positive), ('neutrons N', n.toDouble(), const Color(0xFF7A8396)), ('A', (z + n).toDouble(), IX.accent)], title: 'Nucleons', dp: 0);
  },
);

// ── size ──

final _size = ModeSpec(
  title: 'How big is a nucleus?',
  formula: 'R = R₀ A^(1/3),  R₀ = 1.2 fm',
  values: {'A': 64, 'cmp': 1},
  controls: (v) => const [Sl('A', 'Mass number A', 1, 240, div: 239, dp: 0), Seg('cmp', 'Compare He-4 and U-238', ['Off', 'On'])],
  presets: {'Copper-64': {'A': 64}, 'Aluminium-27': {'A': 27}, 'Uranium-238': {'A': 238}},
  readouts: (v) {
    final r = 1.2 * math.pow(v['A']!, 1 / 3);
    final rho = v['A']! * 1.6605e-27 / (4 / 3 * math.pi * math.pow(r * 1e-15, 3));
    return [Readout('Radius R', fx(r.toDouble(), 2), 'fm', IX.accent), Readout('Volume', fx(4 / 3 * math.pi * math.pow(r, 3), 0), 'fm³'), Readout('Density', fx(rho / 1e17, 2), '× 10¹⁷ kg/m³', IX.green)];
  },
  paint: (c, s, v, t) {
    final (left, right) = Lay.split(s, 0.55);
    const ppf = 40.0;
    double r(double a) => 1.2 * math.pow(a, 1 / 3).toDouble();
    final o = Offset(left.center.dx, left.center.dy + 20);
    if (v['cmp'] == 1) {
      c.drawCircle(o, r(238) * ppf, Draw.stroke(IX.muted, 2));
      Draw.text(c, 'U-238', o + Offset(0, -r(238) * ppf - 18), size: 16, color: IX.muted);
      c.drawCircle(o + Offset(-r(238) * ppf + r(4) * ppf + 10, 0), r(4) * ppf, Draw.stroke(IX.muted, 2));
      Draw.text(c, 'He-4', o + Offset(-r(238) * ppf + r(4) * ppf + 10, r(4) * ppf + 18), size: 16, color: IX.muted);
    }
    Draw.ball(c, o, r(v['A']!) * ppf, IX.positive.withValues(alpha: 0.85));
    Draw.dim(c, o, o + Offset(r(v['A']!) * ppf, 0), 'R = ${fx(r(v['A']!), 2)} fm', color: Colors.white, off: -18);
    Draw.caption(c, 'Volume grows in step with A, so every nucleus has about the same density.');
    final p = Plot(right, 1, 240, 0, 8, xl: 'A', yl: 'R (fm)', title: 'R = 1.2 A^(1/3) fm');
    p.frame(c);
    p.fn(c, r, IX.accent, w: 4);
    p.dot(c, v['A']!, r(v['A']!), IX.accent);
  },
);

// ── binding energy ──

double _zStable(double a) => a / (1.98 + 0.0155 * math.pow(a, 2 / 3));
double _bePer(double a) {
  final z = _zStable(a);
  final b = 15.8 * a - 18.3 * math.pow(a, 2 / 3) - 0.714 * z * (z - 1) / math.pow(a, 1 / 3) - 23.2 * math.pow(a - 2 * z, 2) / a;
  return b / a;
}

const _measured = [(2.0, 1.11, 'H-2'), (4.0, 7.07, 'He-4'), (6.0, 5.33, 'Li-6'), (12.0, 7.68, 'C-12'), (16.0, 7.98, 'O-16'), (56.0, 8.79, 'Fe-56'), (120.0, 8.51, 'Sn-120'), (238.0, 7.57, 'U-238')];

final _binding = ModeSpec(
  title: 'The binding energy curve',
  formula: 'B = [Z m_p + N m_n − M] c²',
  values: {'A': 56, 'meas': 1},
  controls: (v) => const [Sl('A', 'Mass number A', 4, 240, div: 236, dp: 0), Seg('meas', 'Measured values', ['Hidden', 'Shown'])],
  presets: {'Iron-56 (peak)': {'A': 56}, 'Uranium-238': {'A': 238}, 'Helium-4': {'A': 4}},
  readouts: (v) {
    final b = _bePer(v['A']!);
    return [Readout('B/A (liquid drop)', fx(b, 2), 'MeV', IX.accent), Readout('Total B', fx(b * v['A']!, 0), 'MeV'), Readout('Energy from', v['A']! < 56 ? 'fusion' : 'fission', '', IX.green)];
  },
  paint: (c, s, v, t) {
    final p = Plot(Rect.fromLTRB(26, 26, s.width - 26, s.height - 26), 0, 240, 0, 10, xl: 'mass number A', yl: 'B/A (MeV)', title: 'Binding energy per nucleon peaks near iron');
    p.frame(c);
    p.area(c, (x) => x < 3 ? 0 : _bePer(x).clamp(0.0, 10.0), 56, 240, IX.accent);
    p.fn(c, (x) => x < 3 ? double.nan : _bePer(x), IX.accent, w: 4, a: 3);
    if (v['meas'] == 1) {
      for (final (a, b, name) in _measured) {
        p.dot(c, a, b, IX.positive, label: name, rr: 6);
      }
    }
    p.vline(c, 56, IX.green, label: 'A ≈ 56');
    p.dot(c, v['A']!, _bePer(v['A']!), IX.accent, rr: 11);
    Draw.text(c, '← fusion releases energy', p.p(25, 3), size: 19, color: IX.green, halo: true);
    Draw.text(c, 'fission releases energy →', p.p(190, 3), size: 19, color: IX.green, halo: true);
  },
);

// ── nuclear force ──

double _vn(double r) => 4000 * math.exp(-6 * r) / r - 200 * math.exp(-1.6 * r) / r;

final _force = ModeSpec(
  title: 'The nuclear force between two nucleons',
  formula: 'strong, short-range, repulsive below ~0.8 fm',
  values: {'r': 1.5},
  controls: (v) => const [Sl('r', 'Separation r', 0.5, 5, unit: 'fm', div: 45)],
  presets: {'Too close (0.6 fm)': {'r': 0.6}, 'Bound (1 fm)': {'r': 1}, 'Far (4 fm)': {'r': 4}},
  readouts: (v) {
    final r = v['r']!;
    final f = -(_vn(r + 0.001) - _vn(r - 0.001)) / 0.002;
    return [Readout('Nuclear energy (model)', fx(_vn(r), 1), 'MeV', IX.accent), Readout('Coulomb energy (2 protons)', fx(1.44 / r, 2), 'MeV', IX.positive), Readout('Nuclear force', f > 0.5 ? 'repulsive' : (f < -0.5 ? 'attractive' : 'tiny'), '')];
  },
  paint: (c, s, v, t) {
    final (top, bot) = Lay.stack(s, 0.36);
    final r = v['r']!;
    final cx = top.center.dx;
    const ppf = 110.0;
    Draw.ball(c, Offset(cx - r * ppf / 2, top.center.dy + 20), 40, IX.positive);
    Draw.ball(c, Offset(cx + r * ppf / 2, top.center.dy + 20), 40, const Color(0xFF9AA3B5));
    Draw.dim(c, Offset(cx - r * ppf / 2, top.center.dy + 90), Offset(cx + r * ppf / 2, top.center.dy + 90), 'r = ${fx(r, 1)} fm', off: 22);
    Draw.caption(c, 'A model nucleon–nucleon potential (blue) beside the Coulomb energy of two protons (orange).');
    final p = Plot(bot, 0.5, 5, -60, 100, xl: 'r (fm)', yl: 'U (MeV)', title: 'The nuclear pull is far stronger than Coulomb, but only over a few fm');
    p.frame(c);
    p.hline(c, 0, IX.muted);
    p.fn(c, _vn, IX.accent, w: 4);
    p.fn(c, (x) => 1.44 / x, IX.positive, w: 3);
    p.dot(c, r, _vn(r).clamp(-60.0, 100.0), IX.accent);
  },
);

// ── chain reaction ──

final _fission = ModeSpec(
  title: 'A fission chain reaction',
  formula: 'N = kⁿ,  ~200 MeV per fission',
  values: {'k': 2, 'rods': 0, 'm': 1},
  controls: (v) => const [Sl('k', 'Multiplication factor k', 0.5, 3, div: 25), Seg('rods', 'Control rods', ['Out', 'In (k = 1)']), Sl('m', 'Mass of U-235 fissioned', 0.1, 10, unit: 'g', div: 99)],
  presets: {'Runaway (k = 2)': {'k': 2, 'rods': 0}, 'Reactor (k = 1)': {'rods': 1}, 'Dying out (k = 0.8)': {'k': 0.8, 'rods': 0}},
  readouts: (v) {
    final k = v['rods'] == 1 ? 1.0 : v['k']!;
    final e = v['m']! / 235 * 6.022e23 * 200 * 1.602e-13;
    return [Readout('Fissions in generation 10', fx(math.pow(k, 10).toDouble(), 1), ''), Readout('Energy from the mass', fx(e / 3.6e6, 0), 'kWh', IX.amber), Readout('State', k > 1.001 ? 'supercritical' : (k < 0.999 ? 'subcritical' : 'critical'), '', IX.accent)];
  },
  paint: (c, s, v, t) {
    final k = v['rods'] == 1 ? 1.0 : v['k']!;
    final (left, right) = Lay.split(s, 0.5);
    final rnd = math.Random(5);
    var prev = <Offset>[Offset(left.center.dx, left.top + 90)];
    for (var g = 1; g <= 5; g++) {
      final y = left.top + 90 + g * (left.height - 150) / 5;
      final count = math.max(0, math.min(32, (math.pow(k, g) + 0.5 * (rnd.nextDouble() - 0.5)).round()));
      final cur = [for (var i = 0; i < count; i++) Offset(left.left + 40 + (i + 0.5) * (left.width - 80) / math.max(1, count), y)];
      for (final q in cur) {
        c.drawLine(prev[(rnd.nextDouble() * prev.length).floor()], q, Draw.stroke(IX.muted, 1.5));
      }
      for (final q in cur) {
        Draw.ball(c, q, count > 16 ? 7 : 11, IX.amber);
      }
      Draw.text(c, 'gen $g: ${fx(math.pow(k, g).toDouble(), 1)}', Offset(left.left + 20, y - 26), size: 15, color: IX.inkSoft, align: Alignment.centerLeft);
      if (cur.isEmpty) break;
      prev = cur;
    }
    Draw.ball(c, Offset(left.center.dx, left.top + 90), 12, IX.positive);
    Draw.caption(c, 'Each fission frees 2–3 neutrons; k of them cause another fission.');
    final p = Plot(right, 0, 20, 0, math.max(2, math.min(1000.0, math.pow(k, 20).toDouble())) * 1.05, xl: 'generation n', yl: 'fissions', title: 'N = kⁿ');
    p.frame(c);
    p.fn(c, (x) => math.pow(k, x).toDouble(), IX.amber, w: 4);
  },
);

// ── decay chain ──

final _decay = ModeSpec(
  title: 'Walk down a decay chain',
  formula: 'α: Z − 2, N − 2;  β⁻: Z + 1, N − 1',
  values: {'na': 0, 'nb': 0},
  controls: (v) => const [Sl('na', 'Alpha decays', 0, 8, div: 8, dp: 0), Sl('nb', 'Beta-minus decays', 0, 6, div: 6, dp: 0)],
  presets: {'Uranium-238': {'na': 0, 'nb': 0}, 'After 1 α (Th-234)': {'na': 1, 'nb': 0}, 'Lead-206 (8 α, 6 β⁻)': {'na': 8, 'nb': 6}},
  readouts: (v) {
    final na = v['na']!.round(), nb = v['nb']!.round();
    final z = 92 - 2 * na + nb, n = 146 - 2 * na - nb;
    return [Readout('Nucleus', '${z + n}${_el(z)}', '', IX.accent), Readout('Z, N', '$z, $n', ''), Readout('Goal', z == 82 && n == 124 ? 'reached Pb-206' : 'Pb-206 (Z 82, N 124)', '', IX.green)];
  },
  paint: (c, s, v, t) {
    final na = v['na']!.round(), nb = v['nb']!.round();
    final p = Plot(Rect.fromLTRB(26, 26, s.width - 26, s.height - 26), 120, 150, 80, 94, xl: 'neutron number N', yl: 'proton number Z', title: 'Chart of nuclides: α moves down-left two, β⁻ moves up-left one');
    p.frame(c);
    // Path: all alphas first, then betas, matching the sliders.
    var z = 92, n = 146;
    final pts = <Offset>[Offset(n.toDouble(), z.toDouble())];
    for (var i = 0; i < na; i++) {
      z -= 2;
      n -= 2;
      pts.add(Offset(n.toDouble(), z.toDouble()));
    }
    for (var i = 0; i < nb; i++) {
      z += 1;
      n -= 1;
      pts.add(Offset(n.toDouble(), z.toDouble()));
    }
    for (var i = 1; i < pts.length; i++) {
      IxPaint.arrow(c, p.p(pts[i - 1].dx, pts[i - 1].dy), p.p(pts[i].dx, pts[i].dy), i <= na ? IX.positive : IX.accent, width: 3.5, head: 14);
    }
    p.dot(c, 146, 92, IX.inkSoft, label: 'U-238');
    p.dot(c, 124, 82, IX.green, label: 'Pb-206');
    p.dot(c, n.toDouble(), z.toDouble(), IX.amber, label: '${z + n}${_el(z)}', rr: 11);
    p.legend(c, [('α', IX.positive), ('β⁻', IX.accent)]);
  },
);

// ── half-life ──

final _halflife = ModeSpec(
  title: 'Watch a sample decay',
  formula: 'N = N₀ (½)^(t/T½),  λ = 0.693/T½',
  values: {'Th': 4},
  animate: true,
  controls: (v) => const [Sl('Th', 'Half-life T½', 1, 10, unit: 's', div: 18)],
  presets: {'Short (2 s)': {'Th': 2}, 'Long (8 s)': {'Th': 8}},
  readouts: (v) => [Readout('Decay constant λ', fx(0.693 / v['Th']!, 3), '/s', IX.accent), Readout('Mean life 1/λ', fx(v['Th']! / 0.693, 2), 's'), Readout('Left after 3 T½', '12.5', '%', IX.green)],
  paint: (c, s, v, t) {
    final th = v['Th']!;
    final tt = t % (5 * th);
    final (left, right) = Lay.split(s, 0.45);
    final rnd = math.Random(17);
    var left0 = 0;
    const cols = 20, rows = 20;
    for (var j = 0; j < rows; j++) {
      for (var i = 0; i < cols; i++) {
        final life = -th / math.ln2 * math.log(1 - rnd.nextDouble());
        final alive = life > tt;
        if (alive) left0++;
        final p = Offset(left.left + 50 + i * (left.width - 90) / (cols - 1), left.top + 90 + j * (left.height - 150) / (rows - 1));
        c.drawCircle(p, 9, Draw.fill(alive ? IX.amber : IX.rule));
      }
    }
    Draw.caption(c, 't = ${fx(tt, 1)} s: $left0 of 400 nuclei left');
    final p = Plot(right, 0, 5 * th, 0, 420, xl: 't (s)', yl: 'nuclei left', title: 'Halves every T½, whatever the starting number');
    p.frame(c);
    p.fn(c, (x) => 400 * math.pow(0.5, x / th).toDouble(), IX.amber, w: 4);
    for (var k = 1; k <= 4; k++) {
      p.vline(c, k * th, IX.muted, label: k == 1 ? 'T½' : '${k}T½');
    }
    p.dot(c, tt, left0.toDouble(), IX.accent);
  },
);

String _supA(int a) => a.toString().split('').map((d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[int.parse(d)]).join();
