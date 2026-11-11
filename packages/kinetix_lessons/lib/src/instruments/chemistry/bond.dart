import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bench.dart';
import 'kit.dart';

/// The chemical bond: the potential-energy well (bond length and enthalpy), bond dipoles,
/// electronegativity and ionic character, and molecular orbital diagrams of diatomics.

class _Bond {
  const _Bond(this.name, this.a, this.b, this.de, this.re, this.k);
  final String name, a, b;
  final double de, re, k; // kJ/mol, pm, N/m
  double get alpha => math.sqrt(k / (2 * de * 1000 / 6.022e23)) * 1e-12; // per pm
  double e(double r) => de * math.pow(1 - math.exp(-alpha * (r - re)), 2) - de;
}

const _bonds = [
  _Bond('H₂', 'H', 'H', 436, 74, 575),
  _Bond('HCl', 'H', 'Cl', 431, 127, 516),
  _Bond('Cl₂', 'Cl', 'Cl', 242, 199, 323),
  _Bond('HF', 'H', 'F', 565, 92, 966),
  _Bond('O₂', 'O', 'O', 498, 121, 1177),
  _Bond('N₂', 'N', 'N', 946, 110, 2295),
];

const _species = {
  1: 'H₂⁺', 2: 'H₂', 3: 'He₂⁺', 4: 'He₂', 5: 'Li₂⁺', 6: 'Li₂', 7: 'Be₂⁺', 8: 'Be₂', 9: 'B₂⁺', 10: 'B₂', 11: 'C₂⁺', 12: 'C₂', 13: 'N₂⁺', 14: 'N₂',
  15: 'O₂⁺', 16: 'O₂', 17: 'O₂⁻', 18: 'F₂ (or O₂²⁻)', 19: 'F₂⁻', 20: 'Ne₂',
};

class _Mo {
  const _Mo(this.name, this.deg, this.bonding, this.y);
  final String name;
  final int deg;
  final bool bonding;
  final double y; // energy, arbitrary units
}

List<_Mo> _levels(int n) {
  final light = n <= 14; // s–p mixing puts π2p below σ2p up to N₂
  return [
    const _Mo('σ1s', 1, true, 0.4),
    const _Mo('σ*1s', 1, false, 1.4),
    const _Mo('σ2s', 1, true, 2.6),
    const _Mo('σ*2s', 1, false, 3.5),
    if (light) const _Mo('π2p', 2, true, 4.6) else const _Mo('σ2pz', 1, true, 4.55),
    if (light) const _Mo('σ2pz', 1, true, 5.2) else const _Mo('π2p', 2, true, 5.05),
    const _Mo('π*2p', 2, false, 6.15),
    const _Mo('σ*2pz', 1, false, 7.1),
  ];
}

/// Electrons in each level, Hund's rule within the degenerate π pairs: list of per-orbital counts.
List<List<int>> _fill(int n) {
  final out = <List<int>>[];
  var left = n;
  for (final m in _levels(n)) {
    final e = math.min(left, 2 * m.deg);
    left -= e;
    out.add([for (var i = 0; i < m.deg; i++) e <= m.deg ? (i < e ? 1 : 0) : 1 + (i < e - m.deg ? 1 : 0)]);
  }
  return out;
}

(int, int, int) _moCount(int n) {
  final f = _fill(n), lv = _levels(n);
  var nb = 0, na = 0, unp = 0;
  for (var i = 0; i < lv.length; i++) {
    for (final e in f[i]) {
      if (lv[i].bonding) {
        nb += e;
      } else {
        na += e;
      }
      if (e == 1) unp++;
    }
  }
  return (nb, na, unp);
}

void _atoms(Canvas c, Offset a, Offset b, String ea, String eb, {double ra = 50, double rb = 50, Color? ca, Color? cb}) {
  c.drawLine(a, b, Paint()
    ..strokeWidth = 22
    ..shader = ui.Gradient.linear(a + const Offset(0, -11), a + const Offset(0, 11), [const Color(0xFFE3E7EF), IX.steel, const Color(0xFF6E788C)], [0, 0.5, 1]));
  ball(c, a, ra, ca ?? elementColor[ea] ?? IX.steel, outline: true);
  ball(c, b, rb, cb ?? elementColor[eb] ?? IX.steel, outline: true);
  lbl(c, ea, a, size: ra * 0.6, color: (ca ?? elementColor[ea] ?? IX.steel).computeLuminance() > 0.5 ? IX.ink : Colors.white, w: FontWeight.w700);
  lbl(c, eb, b, size: rb * 0.6, color: (cb ?? elementColor[eb] ?? IX.steel).computeLuminance() > 0.5 ? IX.ink : Colors.white, w: FontWeight.w700);
}

/// The chemist's dipole arrow: a crossed tail at the positive end, the head at the negative end.
void dipoleArrow(Canvas c, Offset from, Offset to, Color col) {
  IxPaint.arrow(c, from, to, col, width: 4, head: 20);
  final d = to - from, u = d / d.distance, n = Offset(-u.dy, u.dx);
  final x = from + u * 18;
  c.drawLine(x + n * 12, x - n * 12, stroke(col, 4));
}

final Map<String, Mode> bondModes = {
  'well': Mode(
    title: 'Bond length and bond enthalpy',
    subtitle: 'Chemical bonding · Formation of a covalent bond',
    titleOf: (v) => 'Energy of ${_bonds[v.i('mol').clamp(0, 5)].name} against distance',
    formula: 'lowest energy at the bond length',
    defaults: {'mol': 0, 'r': 74},
    drag: (v, at, s) {
      final b = _bonds[v.i('mol').clamp(0, 5)];
      final pl = _wellPlot(s, b);
      v['r'] = ((at.dx - pl.r.left) / pl.r.width * (pl.x1 - pl.x0) + pl.x0).clamp(b.re * 0.6, b.re * 4);
    },
    knobsOf: (v) {
      final b = _bonds[v.i('mol').clamp(0, 5)];
      return [
        Pick('mol', 'Molecule', [for (final x in _bonds) x.name], ids: [for (final x in _bonds) ascii(x.name)], chips: true),
        Slide('r', 'Distance between nuclei', b.re * 0.6, b.re * 4, unit: 'pm', digits: 0),
        const Note('Drag across the graph to pull the atoms apart or push them together.'),
      ];
    },
    readouts: (v) {
      final b = _bonds[v.i('mol').clamp(0, 5)];
      final r = v.g('r', b.re), e = b.e(r);
      return [
        Readout('Distance', r.toStringAsFixed(0), 'pm', IX.accent),
        Readout('Potential energy', nf(e, 0), 'kJ/mol', IX.amber),
        Readout('Bond length', b.re.toStringAsFixed(0), 'pm', IX.green),
        Readout('Bond enthalpy', b.de.toStringAsFixed(0), 'kJ/mol', IX.positive),
        Readout('Net force', (r - b.re).abs() < 2 ? 'none' : r < b.re ? 'repulsive' : 'attractive'),
      ];
    },
    paint: (c, s, v) {
      final b = _bonds[v.i('mol').clamp(0, 5)];
      final r = v.g('r', b.re);
      final pl = _wellPlot(s, b);
      // Atoms at the current separation, to the plot's x scale.
      final y = 120.0;
      final xa = pl.px(pl.x0) + 40, xb = xa + (pl.px(r) - pl.px(0));
      final ra = b.a == 'H' ? 30.0 : 44.0, rb = b.b == 'H' ? 30.0 : 44.0;
      _atoms(c, Offset(xa, y), Offset(xb, y), b.a, b.b, ra: ra, rb: rb);
      IxPaint.arrow(c, Offset(xa, y + 70), Offset(xb, y + 70), IX.inkSoft, width: 2, head: 10);
      IxPaint.arrow(c, Offset(xb, y + 70), Offset(xa, y + 70), IX.inkSoft, width: 2, head: 10);
      lbl(c, 'r = ${r.toStringAsFixed(0)} pm', Offset((xa + xb) / 2, y + 92), size: 18, color: IX.ink, w: FontWeight.w600, halo: true);
      pl.axes(c, x: 'Internuclear distance r (pm)', y: 'Potential energy (kJ/mol)', dy: niceStep(b.de * 1.4, 5));
      pl.curve(c, b.e, IX.accent, from: b.re * 0.62);
      pl.hline(c, -b.de, IX.positive, label: 'bond enthalpy ${b.de.toStringAsFixed(0)} kJ/mol', right: true);
      pl.vline(c, b.re, IX.green, label: 'bond length ${b.re.toStringAsFixed(0)} pm');
      final pp = pl.p(b.re, -b.de);
      IxPaint.arrow(c, pl.p(b.re * 3.2, 0), pl.p(b.re * 3.2, -b.de), IX.positive, width: 2.5);
      IxPaint.arrow(c, pl.p(b.re * 3.2, -b.de), pl.p(b.re * 3.2, 0), IX.positive, width: 2.5);
      c.drawCircle(pp, 4, fill(IX.green));
      pl.dot(c, r, b.e(r), IX.amber);
    },
    presets: {'H₂ at bond length': {'mol': 0, 'r': 74}, 'H₂ squeezed': {'mol': 0, 'r': 50}, 'H₂ pulled apart': {'mol': 0, 'r': 160}, 'Cl₂': {'mol': 2, 'r': 199}, 'N₂': {'mol': 5, 'r': 110}},
  ),
  'dipole': Mode(
    title: 'Dipole moment of a polar bond',
    subtitle: 'Chemical bonding · Polarity of bonds',
    formula: 'μ = q × d,   1 e × 1 pm = 0.048 D',
    defaults: {'q': 0.18, 'd': 127, 'X': 1},
    knobs: const [
      Slide('q', 'Partial charge δ (fraction of e)', 0, 1, digits: 2, step: 0.01),
      Slide('d', 'Bond length d', 50, 250, unit: 'pm', digits: 0, step: 1),
      Note('1 D = 3.336 × 10⁻³⁰ C m. The arrow points from δ+ to δ−.'),
    ],
    readouts: (v) {
      final mu = 0.048 * v.g('q', 0.18) * v.g('d', 127);
      return [Readout('Dipole moment μ', mu.toStringAsFixed(2), 'D', IX.accent), Readout('In SI', sx(mu * 3.336e-30), 'C m'), Readout('Ionic character', (v.g('q', 0.18) * 100).toStringAsFixed(0), '%', IX.amber), Readout('Partial charges', '±${v.g('q', 0.18).toStringAsFixed(2)} e')];
    },
    paint: (c, s, v) {
      final q = v.g('q', 0.18), d = v.g('d', 127);
      final cx = s.width / 2, y = s.height * 0.42;
      final px = 2.4;
      final a = Offset(cx - d * px / 2, y), b = Offset(cx + d * px / 2, y);
      // Electron cloud shifted to the δ− end.
      final cloud = Rect.fromCenter(center: Offset.lerp(a, b, 0.5 + q * 0.32)!, width: d * px + 200, height: 220);
      c.drawOval(cloud, Paint()..shader = ui.Gradient.radial(cloud.center + Offset(q * 60, 0), cloud.width * 0.55, [IX.accent.withValues(alpha: 0.20), IX.accent.withValues(alpha: 0.02)]));
      _atoms(c, a, b, 'A', 'B', ra: 62, rb: 70, ca: const Color(0xFFE9C6B8), cb: const Color(0xFFBFD0EE));
      lbl(c, 'δ+', a + const Offset(0, -100), size: 34, color: IX.positive, w: FontWeight.w700);
      lbl(c, 'δ−', b + const Offset(0, -100), size: 34, color: IX.negative, w: FontWeight.w700);
      if (q > 0.005) dipoleArrow(c, a + const Offset(0, 120), b + const Offset(0, 120), IX.ink);
      IxPaint.arrow(c, Offset(a.dx, y + 190), Offset(b.dx, y + 190), IX.muted, width: 2, head: 10);
      IxPaint.arrow(c, Offset(b.dx, y + 190), Offset(a.dx, y + 190), IX.muted, width: 2, head: 10);
      lbl(c, 'd = ${d.toStringAsFixed(0)} pm', Offset(cx, y + 214), size: 18, color: IX.inkSoft, halo: true);
      final mu = 0.048 * q * d;
      lbl(c, 'μ = 0.048 × ${q.toStringAsFixed(2)} × ${d.toStringAsFixed(0)} = ${mu.toStringAsFixed(2)} D', Offset(cx, s.height - 70), size: 26, color: IX.ink, w: FontWeight.w600);
    },
    presets: {'H–Cl': {'q': 0.18, 'd': 127}, 'H–F': {'q': 0.41, 'd': 92}, 'C–Cl in CH₃Cl': {'q': 0.24, 'd': 178}, 'C–Br in CH₃Br': {'q': 0.21, 'd': 193}, 'C–I in CH₃I': {'q': 0.15, 'd': 214}},
  ),
  'polarity': Mode(
    title: 'Electronegativity and bond polarity',
    subtitle: 'Classification of elements · Electronegativity',
    formula: '% ionic = 100(1 − e^(−Δ²/4))',
    defaults: {'a': 2.20, 'b': 3.16},
    knobs: const [Slide('a', 'Electronegativity of A', 0.7, 4.0, digits: 2, step: 0.01), Slide('b', 'Electronegativity of B', 0.7, 4.0, digits: 2, step: 0.01), Note('Δ below about 0.4: non-polar covalent. 0.4 to 1.7: polar covalent. Above 1.7: mainly ionic.')],
    readouts: (v) {
      final dd = (v.g('a', 2.2) - v.g('b', 3.16)).abs();
      final ion = 100 * (1 - math.exp(-dd * dd / 4));
      return [Readout('Difference Δ', dd.toStringAsFixed(2), '', IX.accent), Readout('Ionic character', ion.toStringAsFixed(0), '%', IX.amber), Readout('Bond type', dd < 0.4 ? 'Non-polar covalent' : dd <= 1.7 ? 'Polar covalent' : 'Mainly ionic', '', IX.green)];
    },
    paint: (c, s, v) {
      final ea = v.g('a', 2.2), eb = v.g('b', 3.16);
      final dd = (ea - eb).abs();
      final ion = 1 - math.exp(-dd * dd / 4);
      final y = 170.0, cx = s.width / 2;
      final a = Offset(cx - 170, y), b = Offset(cx + 170, y);
      final toward = eb > ea ? 1.0 : -1.0;
      final pair = Offset(cx + toward * ion * 170, y);
      c.drawOval(Rect.fromCenter(center: pair, width: 300 - ion * 120, height: 170), Paint()..shader = ui.Gradient.radial(pair, 150, [IX.accent.withValues(alpha: 0.22), IX.accent.withValues(alpha: 0.02)]));
      _atoms(c, a, b, 'A', 'B', ra: 56, rb: 56, ca: const Color(0xFFE9C6B8), cb: const Color(0xFFBFD0EE));
      for (final k in [-1.0, 1.0]) {
        ball(c, pair + Offset(k * 10, -78), 8, IX.accent);
      }
      lbl(c, 'shared pair', pair + const Offset(0, -106), size: 16, color: IX.accent, w: FontWeight.w600);
      if (dd > 0.05) {
        lbl(c, 'δ${eb > ea ? '+' : '−'}', a + const Offset(0, 84), size: 28, color: eb > ea ? IX.positive : IX.negative, w: FontWeight.w700);
        lbl(c, 'δ${eb > ea ? '−' : '+'}', b + const Offset(0, 84), size: 28, color: eb > ea ? IX.negative : IX.positive, w: FontWeight.w700);
      }
      lbl(c, 'χ = ${ea.toStringAsFixed(2)}', a + const Offset(0, -80), size: 19, color: IX.inkSoft, w: FontWeight.w600);
      lbl(c, 'χ = ${eb.toStringAsFixed(2)}', b + const Offset(0, -80), size: 19, color: IX.inkSoft, w: FontWeight.w600);
      final pr = Rect.fromLTWH(140, 380, s.width - 240, s.height - 480);
      final pl = Plot(pr, 0, 3.3, 0, 100);
      pl.axes(c, x: 'Electronegativity difference Δ', y: 'Ionic character (%)', dx: 0.5, dy: 25);
      c.drawRect(Rect.fromLTRB(pl.px(0), pr.top, pl.px(0.4), pr.bottom), fill(IX.green.withValues(alpha: 0.06)));
      c.drawRect(Rect.fromLTRB(pl.px(1.7), pr.top, pl.px(3.3), pr.bottom), fill(IX.positive.withValues(alpha: 0.06)));
      lbl(c, 'non-polar', Offset(pl.px(0.2), pr.top + 18), size: 14, color: IX.green, w: FontWeight.w600);
      lbl(c, 'polar covalent', Offset(pl.px(1.05), pr.top + 18), size: 14, color: IX.inkSoft, w: FontWeight.w600);
      lbl(c, 'mainly ionic', Offset(pl.px(2.5), pr.top + 18), size: 14, color: IX.positive, w: FontWeight.w600);
      pl.curve(c, (x) => 100 * (1 - math.exp(-x * x / 4)), IX.accent);
      pl.dot(c, dd, ion * 100, IX.amber, label: '${(ion * 100).toStringAsFixed(0)} %');
    },
    presets: {'H–H': {'a': 2.20, 'b': 2.20}, 'H–Cl': {'a': 2.20, 'b': 3.16}, 'H–F': {'a': 2.20, 'b': 3.98}, 'Na–Cl': {'a': 0.93, 'b': 3.16}, 'C–O': {'a': 2.55, 'b': 3.44}},
  ),
  'mo': Mode(
    title: 'Molecular orbital diagram',
    subtitle: 'Chemical bonding · Molecular orbital theory',
    formula: 'bond order = ½(N_b − N_a)',
    titleOf: (v) => 'Molecular orbitals of ${_species[v.i('n', 16).clamp(1, 20)]}',
    defaults: {'n': 16},
    knobs: const [Slide('n', 'Total electrons', 1, 20, step: 1, digits: 0), Note('Up to N₂ (14 electrons) s–p mixing puts π2p below σ2p. Electrons enter the two equal π orbitals singly first (Hund).')],
    readouts: (v) {
      final n = v.i('n', 16).clamp(1, 20);
      final (nb, na, unp) = _moCount(n);
      final bo = (nb - na) / 2;
      return [
        Readout('Species', _species[n]!, '', IX.accent),
        Readout('Bond order', bo == bo.roundToDouble() ? bo.toStringAsFixed(0) : bo.toStringAsFixed(1), '', IX.green),
        Readout('Bonding electrons', '$nb'),
        Readout('Antibonding electrons', '$na'),
        Readout('Unpaired electrons', '$unp', '', IX.amber),
        Readout('Magnetic', unp > 0 ? 'Paramagnetic' : 'Diamagnetic', '', unp > 0 ? IX.amber : IX.inkSoft),
      ];
    },
    paint: (c, s, v) {
      final n = v.i('n', 16).clamp(1, 20);
      final lv = _levels(n), f = _fill(n);
      final top = 60.0, bot = s.height - 70;
      double y(double e) => bot - e / 7.4 * (bot - top);
      final cx = s.width * 0.5;
      const bw = 64.0;
      // Atomic orbitals on each side.
      final aos = [('1s', 0.9, 1), ('2s', 3.05, 1), ('2p', 5.6, 3)];
      final perAtom = n / 2;
      for (final side in [-1.0, 1.0]) {
        final x = cx + side * s.width * 0.33;
        var left = side < 0 ? perAtom.ceil() : perAtom.floor();
        for (final (name, e, deg) in aos) {
          final ee = math.min(left, 2 * deg);
          left -= ee;
          for (var i = 0; i < deg; i++) {
            final ox = x + (i - (deg - 1) / 2) * (bw + 8);
            level(c, ox - bw / 2, ox + bw / 2, y(e), IX.inkSoft, w: 3);
            final k = ee <= deg ? (i < ee ? 1 : 0) : 1 + (i < ee - deg ? 1 : 0);
            _spins(c, Offset(ox, y(e)), k);
          }
          lbl(c, name, Offset(x + side * ((deg - 1) / 2 * (bw + 8) + bw / 2 + 30), y(e)), size: 19, color: IX.inkSoft, w: FontWeight.w600);
        }
        lbl(c, side < 0 ? 'Atom A' : 'Atom B', Offset(x, bot + 34), size: 18, color: IX.muted, w: FontWeight.w600);
      }
      lbl(c, 'Molecule', Offset(cx, bot + 34), size: 18, color: IX.muted, w: FontWeight.w600);
      // Correlation lines.
      final link = Paint()..color = IX.rule..strokeWidth = 1.5;
      for (var i = 0; i < lv.length; i++) {
        final m = lv[i];
        final ae = m.name.contains('1s') ? 0.9 : m.name.contains('2s') ? 3.05 : 5.6;
        for (final side in [-1.0, 1.0]) {
          IxPaint.dashed(c, Offset(cx + side * (m.deg * (bw + 8) / 2 + 6), y(m.y)), Offset(cx + side * (s.width * 0.33 - (ae > 5 ? 112 : 40)), y(ae)), link, dash: 6, gap: 6);
        }
      }
      for (var i = 0; i < lv.length; i++) {
        final m = lv[i];
        final col = m.bonding ? IX.accent : IX.positive;
        for (var k = 0; k < m.deg; k++) {
          final ox = cx + (k - (m.deg - 1) / 2) * (bw + 8);
          level(c, ox - bw / 2, ox + bw / 2, y(m.y), col, w: 4);
          _spins(c, Offset(ox, y(m.y)), f[i][k]);
        }
        final label = m.name.replaceAll('2pz', '2p${sub('z')}');
        lbl(c, label, Offset(cx + m.deg * (bw + 8) / 2 + 22, y(m.y)), size: 19, color: col, w: FontWeight.w700, align: Alignment.centerLeft);
      }
      lbl(c, 'bonding', Offset(28, 40), size: 16, color: IX.accent, w: FontWeight.w600, align: Alignment.centerLeft);
      lbl(c, 'antibonding (*)', Offset(120, 40), size: 16, color: IX.positive, w: FontWeight.w600, align: Alignment.centerLeft);
    },
    presets: {'H₂': {'n': 2}, 'He₂': {'n': 4}, 'N₂': {'n': 14}, 'O₂': {'n': 16}, 'O₂⁺': {'n': 15}, 'O₂⁻': {'n': 17}},
  ),
};

void _spins(Canvas c, Offset o, int k) {
  if (k >= 1) IxPaint.arrow(c, o + Offset(k == 2 ? -10 : 0, 16), o + Offset(k == 2 ? -10 : 0, -18), IX.ink, width: 2.6, head: 10);
  if (k >= 2) IxPaint.arrow(c, o + const Offset(10, -16), o + const Offset(10, 18), IX.ink, width: 2.6, head: 10);
}

Plot _wellPlot(Size s, _Bond b) => Plot(Rect.fromLTWH(130, 290, s.width - 200, s.height - 380), 0, b.re * 4, -b.de * 1.15, b.de * 0.6);
