import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bench.dart';
import 'kit.dart';

/// Organic chemistry: degree of unsaturation, IUPAC names, chain isomers, the inductive effect,
/// the alkane series, Hückel's rule, boiling-point comparisons, SN1/SN2 mechanisms and optical
/// rotation of enantiomer mixtures.

// ───────────────────────────── 2-D structures ─────────────────────────────

/// One labelled atom of a 2-D structure, at (x, y) in bond lengths.
typedef _A = (String, double, double, Color);

/// Draws a condensed structure: bonds as lines (double and triple drawn parallel), atom labels
/// on white chips over the bond ends. Returns the screen position of each atom.
List<Offset> _struct(Canvas c, Offset o, double u, List<_A> atoms, List<(int, int, int)> bonds, {double size = 26, Set<int> hi = const {}}) {
  final pts = [for (final a in atoms) o + Offset(a.$2, a.$3) * u];
  for (final (a, b, order) in bonds) {
    final d = pts[b] - pts[a], n = Offset(-d.dy, d.dx) / d.distance;
    final offs = order == 1 ? [0.0] : order == 2 ? [-4.5, 4.5] : [-7.0, 0.0, 7.0];
    for (final k in offs) {
      c.drawLine(pts[a] + n * k, pts[b] + n * k, stroke(IX.ink, 3));
    }
  }
  for (final (i, a) in atoms.indexed) {
    if (a.$1.isEmpty) continue;
    final w = textW(a.$1, size, w: FontWeight.w700) + 14, h = size * 1.35;
    final r = RRect.fromRectAndRadius(Rect.fromCenter(center: pts[i], width: w, height: h), const Radius.circular(8));
    c.drawRRect(r, fill(hi.contains(i) ? IX.accentSoft : IX.paper));
    if (hi.contains(i)) c.drawRRect(r, stroke(IX.accent, 1.6));
    lbl(c, a.$1, pts[i], size: size, color: a.$4, w: FontWeight.w700);
  }
  return pts;
}

String _ch(int h) => h <= 0 ? 'C' : h == 1 ? 'CH' : 'CH${sub(h)}';

const _roots = ['meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec'];
const _fgs = ['Alkane', 'Alkene', 'Alkyne', 'Alcohol', 'Aldehyde', 'Ketone', 'Carboxylic acid', 'Haloalkane'];
const _fgIds = ['alkane', 'alkene', 'alkyne', 'alcohol', 'aldehyde', 'ketone', 'acid', 'chloro'];

/// The chain of [n] carbons with functional group [fg]: atoms, bonds, name parts and formula.
(List<_A>, List<(int, int, int)>, List<(String, Color)>, String) _chain(int n, int fg) {
  final atoms = <_A>[], bonds = <(int, int, int)>[];
  final orders = List.filled(n, 0); // bond order sum per carbon
  for (var i = 0; i < n; i++) {
    atoms.add(('', i * 1.0, i.isOdd ? 0.55 : 0.0, IX.ink));
  }
  for (var i = 0; i + 1 < n; i++) {
    final o = (fg == 1 || fg == 2) && i == 0 ? fg + 1 : 1;
    bonds.add((i, i + 1, o));
    orders[i] += o;
    orders[i + 1] += o;
  }
  void add(String t, int at, double dx, double dy, int order, Color col) {
    atoms.add((t, atoms[at].$2 + dx, atoms[at].$3 + dy, col));
    bonds.add((at, atoms.length - 1, order));
    orders[at] += order;
  }

  final up = -0.9;
  switch (fg) {
    case 3:
      add('OH', 0, -0.4, up, 1, IX.positive);
    case 4:
      add('O', 0, -0.4, up, 2, IX.positive);
    case 5:
      add('O', 1, 0, n > 1 && 1.isOdd ? 0.9 : up, 2, IX.positive);
    case 6:
      add('O', 0, -0.5, up, 2, IX.positive);
      add('OH', 0, -0.95, 0.35, 1, IX.positive);
    case 7:
      add('Cl', 0, -0.4, up, 1, IX.green);
  }
  for (var i = 0; i < n; i++) {
    atoms[i] = (_ch(4 - orders[i]), atoms[i].$2, atoms[i].$3, IX.ink);
  }
  final r = _roots[n - 1];
  final List<(String, Color)> parts = switch (fg) {
    0 => [(r, IX.ink), ('ane', IX.accent)],
    1 => [(r, IX.ink), (n >= 4 ? '-1-ene' : 'ene', IX.accent)],
    2 => [(r, IX.ink), (n >= 4 ? '-1-yne' : 'yne', IX.accent)],
    3 => [(r, IX.ink), ('an', IX.accent), (n >= 3 ? '-1-ol' : 'ol', IX.positive)],
    4 => [(r, IX.ink), ('an', IX.accent), ('al', IX.positive)],
    5 => [(r, IX.ink), ('an', IX.accent), (n >= 5 ? '-2-one' : 'one', IX.positive)],
    6 => [(r, IX.ink), ('an', IX.accent), ('oic acid', IX.positive)],
    _ => [(n >= 3 ? '1-chloro' : 'chloro', IX.green), (r, IX.ink), ('ane', IX.accent)],
  };
  var h = 0;
  for (var i = 0; i < n; i++) {
    h += 4 - orders[i];
  }
  final f = switch (fg) {
    3 => 'C${n == 1 ? '' : sub(n)}H${sub(h + 1)}O',
    4 || 5 => 'C${n == 1 ? '' : sub(n)}H${sub(h)}O',
    6 => 'C${n == 1 ? '' : sub(n)}H${sub(h + 1)}O₂',
    7 => 'C${n == 1 ? '' : sub(n)}H${sub(h)}Cl',
    _ => 'C${n == 1 ? '' : sub(n)}H${sub(h)}',
  };
  return (atoms, bonds, parts, f);
}

int _minC(int fg) => fg == 1 || fg == 2 ? 2 : fg == 5 ? 3 : 1;

// ───────────────────────────── data ─────────────────────────────

const _alkBp = [111.7, 184.6, 231.1, 272.7, 309.2, 341.9, 371.6, 398.8, 424.0, 447.3];
const _alkDh = [890.0, 1560, 2220, 2877, 3509, 4163, 4817, 5470, 6125, 6778];
const _alkNames = ['Methane', 'Ethane', 'Propane', 'Butane', 'Pentane', 'Hexane', 'Heptane', 'Octane', 'Nonane', 'Decane'];

class _Ring {
  const _Ring(this.name, this.formula, this.sides, this.pi, {this.planar = true, this.conj = true, this.charge = '', this.fused = false});
  final String name, formula, charge;
  final int sides, pi;
  final bool planar, conj, fused;
}

const _rings = [
  _Ring('Benzene', 'C₆H₆', 6, 6),
  _Ring('Cyclobutadiene', 'C₄H₄', 4, 4),
  _Ring('Cyclopentadienyl anion', 'C₅H₅⁻', 5, 6, charge: '−'),
  _Ring('Tropylium cation', 'C₇H₇⁺', 7, 6, charge: '+'),
  _Ring('Cyclopentadiene', 'C₅H₆', 5, 4, conj: false),
  _Ring('Cyclooctatetraene', 'C₈H₈', 8, 8, planar: false),
  _Ring('Naphthalene', 'C₁₀H₈', 6, 10, fused: true),
  _Ring('[18]Annulene', 'C₁₈H₁₈', 18, 18),
];

typedef _Bar = (String, double, String);

const _sets = <(String, String, String, List<_Bar>)>[
  ('Boiling points of the halomethanes', 'Boiling point (K)', 'Heavier halogen, bigger and more polarisable molecule, stronger van der Waals forces.', [('CH₃F', 195, 'M 34'), ('CH₃Cl', 249, 'M 50.5'), ('CH₃Br', 277, 'M 95'), ('CH₃I', 315, 'M 142')]),
  ('Ethers boil like alkanes', 'Boiling point (K)', 'Similar molar mass (72–74 g/mol). The ether has no O–H, so no hydrogen bonds between its molecules.', [('n-Pentane', 309, 'van der Waals'), ('Ethoxyethane', 308, 'weak dipole'), ('Butan-1-ol', 390, 'H-bonds')]),
  ('Where carbonyl compounds boil', 'Boiling point (K)', 'Molar mass 58–60 g/mol. The polar C=O raises the boiling point above ethers, but not as far as the O–H of alcohols.', [('n-Butane', 273, 'van der Waals'), ('Methoxyethane', 281, 'weak dipole'), ('Propanal', 322, 'C=O dipole'), ('Propanone', 329, 'C=O dipole'), ('Propan-1-ol', 370, 'H-bonds')]),
  ('Acids boil highest', 'Boiling point (K)', 'Molar mass 72–74 g/mol. Carboxylic acids form hydrogen-bonded dimers, so they boil above alcohols.', [('Pentane', 309, 'van der Waals'), ('Butanal', 348, 'C=O dipole'), ('Butan-1-ol', 391, 'H-bonds'), ('Propanoic acid', 414, 'H-bonded dimer')]),
  ('Dehydration gets easier from 1° to 3°', 'Temperature needed (K)', 'Tertiary alcohols lose water most easily because they form the most stable carbocation.', [('1° ethanol (conc. H₂SO₄)', 443, ''), ('2° butan-2-ol (85 % H₃PO₄)', 440, ''), ('3° 2-methylpropan-2-ol (20 % H₃PO₄)', 358, '')]),
  ('Nitro groups make substitution easier', 'Temperature to replace Cl by OH (K)', 'Each nitro group at an ortho or para position withdraws electrons and stabilises the intermediate carbanion.', [('Chlorobenzene', 623, '0 NO₂'), ('4-Nitro', 443, '1 NO₂'), ('2,4-Dinitro', 368, '2 NO₂'), ('2,4,6-Trinitro', 323, '3 NO₂')]),
];

// ───────────────────────────── SN1 / SN2 ─────────────────────────────

double _sm(double u) => (1 - math.cos(math.pi * u.clamp(0.0, 1.0))) / 2;

/// The 3-D frame of a substitution at progress [s] (0–1). Returns the molecule and the C–Nu
/// and C–X distances for drawing partial bonds.
(Mol3, double, double) _sn(bool sn1, double s, bool back) {
  double cx, dn, dxl;
  var xDir = const P3(1, 0, 0);
  if (!sn1) {
    dn = 4.4 - 2.5 * _sm(s / 0.6);
    dxl = 1.9 + 2.5 * _sm((s - 0.4) / 0.6);
    cx = -1 / 3 + 2 / 3 * _sm((s - 0.2) / 0.6);
  } else {
    dxl = 1.9 + 2.6 * _sm(s / 0.45);
    xDir = P3(1, -0.8 * _sm(s / 0.45), 0).unit;
    final attack = _sm((s - 0.55) / 0.45);
    dn = 4.4 - 2.5 * attack;
    cx = -1 / 3 * (1 - _sm(s / 0.45)) + (back ? -1 / 3 : 1 / 3) * attack;
  }
  final sx = math.sqrt(1 - cx * cx);
  final groups = sn1 ? const [('CH₃', Color(0xFF3C4250)), ('C₂H₅', Color(0xFF6B46A8)), ('C₃H₇', Color(0xFF0F766E))] : const [('H', Color(0xFFEEF1F5)), ('CH₃', Color(0xFF3C4250)), ('C₂H₅', Color(0xFF6B46A8))];
  final nuDir = sn1 && back ? const P3(0.2, 1, 0).unit * -1 + const P3(1.2, 0, 0) : const P3(-1, 0, 0);
  final atoms = <Atom3>[
    const Atom3('C', P3(0, 0, 0), r: 0.42),
    for (var k = 0; k < 3; k++) Atom3(groups[k].$1 == 'H' ? 'H' : 'X', P3(cx, sx * math.cos(math.pi / 2 + k * 2 * math.pi / 3), sx * math.sin(math.pi / 2 + k * 2 * math.pi / 3)) * 1.55, label: groups[k].$1, r: groups[k].$1 == 'H' ? 0.32 : 0.5, color: groups[k].$2),
    Atom3('Br', xDir * dxl, label: dxl > 2.6 ? 'Br⁻' : 'Br', r: 0.56),
    Atom3('O', nuDir.unit * dn, label: dn > 2.6 ? 'OH⁻' : 'OH', r: 0.5),
  ];
  return (Mol3(atoms, [(0, 1, 1), (0, 2, 1), (0, 3, 1), if (dxl < 2.05) (0, 4, 1), if (dn < 2.05) (0, 5, 1)]), dn, dxl);
}

final Map<String, Mode> organicModes = {
  'unsaturation': Mode(
    title: 'Degree of unsaturation',
    subtitle: 'Organic chemistry · Structure from the formula',
    formula: 'DBE = C − (H + X)/2 + N/2 + 1  = rings + π bonds',
    titleOf: (v) => 'C${sub(v.i('C', 6))}H${sub(v.i('H', 6))}${v.i('N') > 0 ? 'N${v.i('N') == 1 ? '' : sub(v.i('N'))}' : ''}${v.i('X') > 0 ? 'X${v.i('X') == 1 ? '' : sub(v.i('X'))}' : ''}',
    defaults: {'C': 6, 'H': 6, 'N': 0, 'X': 0},
    knobs: [
      const Slide('C', 'Carbon atoms', 1, 12, digits: 0, step: 1),
      const Slide('H', 'Hydrogen atoms', 0, 26, digits: 0, step: 1),
      const Slide('N', 'Nitrogen atoms', 0, 4, digits: 0, step: 1),
      const Slide('X', 'Halogen atoms', 0, 6, digits: 0, step: 1),
      const Note('Oxygen and sulphur do not change the count. A triple bond counts as two.'),
    ],
    readouts: (v) {
      final c = v.i('C', 6), h = v.i('H', 6), n = v.i('N'), x = v.i('X');
      final dbe = c - (h + x) / 2 + n / 2 + 1;
      final ok = dbe >= 0 && dbe == dbe.roundToDouble();
      return [Readout('DBE', ok ? dbe.toStringAsFixed(0) : 'not possible', '', ok ? IX.accent : IX.positive), Readout('H for a saturated chain', '${2 * c + 2 + n - x}'), Readout('H missing', '${2 * c + 2 + n - x - h}', '', IX.amber), Readout('Example', _dbeExample(c, h, n, x), '', IX.green)];
    },
    paint: (c, s, v) {
      final cn = v.i('C', 6), h = v.i('H', 6), n = v.i('N'), x = v.i('X');
      final full = 2 * cn + 2 + n;
      final missing = full - h - x;
      lbl(c, 'Hydrogen places on a saturated, open chain: 2C + 2 + N = $full', const Offset(70, 70), size: 22, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
      const per = 10;
      const cell = 64.0;
      for (var i = 0; i < math.max(full, h + x); i++) {
        final at = Offset(110 + (i % per) * cell * 1.15 + (i % per ~/ 2) * 10, 150 + (i ~/ per) * cell * 1.2);
        if (i < h) {
          ball(c, at, 24, const Color(0xFFE6EAF2), outline: true);
          lbl(c, 'H', at, size: 20, color: IX.ink, w: FontWeight.w700);
        } else if (i < h + x) {
          ball(c, at, 24, const Color(0xFF3F9A55));
          lbl(c, 'X', at, size: 20, color: Colors.white, w: FontWeight.w700);
        } else if (i < full) {
          IxPaint.dashed(c, at + const Offset(-24, 0), at + const Offset(24, 0), Paint()..color = IX.amber..strokeWidth = 2);
          c.drawCircle(at, 24, stroke(IX.amber.withValues(alpha: 0.6), 2));
        } else {
          c.drawCircle(at, 24, fill(IX.positive.withValues(alpha: 0.15)));
          lbl(c, '!', at, size: 22, color: IX.positive, w: FontWeight.w700);
        }
      }
      final rows = (math.max(full, h + x) / per).ceil();
      final y = 150 + rows * cell * 1.2 + 30;
      final dbe = missing / 2;
      final valid = missing >= 0 && missing.isEven;
      lbl(c, valid ? 'Missing ${missing.toString()} hydrogens = ${dbe.toStringAsFixed(0)} pair${dbe == 1 ? '' : 's'}  →  ${dbe.toStringAsFixed(0)} ring${dbe == 1 ? '' : 's'} or π bond${dbe == 1 ? '' : 's'}' : missing < 0 ? 'More H than a saturated chain can hold: no such compound' : 'An odd number missing: check the formula (an odd H count needs N or X)', Offset(70, y), size: 24, color: valid ? IX.accent : IX.positive, w: FontWeight.w700, align: Alignment.centerLeft);
      para(c, 'Each pair of hydrogens taken away makes one ring or one π bond. Benzene C₆H₆: 14 − 6 = 8 missing → DBE 4 (one ring + three C=C).', Offset(70, y + 40), s.width - 140, size: 19, color: IX.inkSoft);
    },
    presets: {'C₆H₆ benzene': {'C': 6, 'H': 6, 'N': 0, 'X': 0}, 'C₂H₂ ethyne': {'C': 2, 'H': 2}, 'C₆H₁₂': {'C': 6, 'H': 12}, 'C₅H₅N pyridine': {'C': 5, 'H': 5, 'N': 1}, 'C₆H₅Cl': {'C': 6, 'H': 5, 'X': 1}},
  ),
  'iupac': Mode(
    title: 'Build an IUPAC name',
    subtitle: 'Organic chemistry · Nomenclature',
    formula: 'prefix + word root + primary suffix + secondary suffix',
    titleOf: (v) {
      final fg = v.i('fg').clamp(0, 7), n = v.i('n', 3).clamp(_minC(fg), 10);
      final p = _chain(n, fg).$3.map((e) => e.$1).join();
      return p[0].toUpperCase() + p.substring(1);
    },
    defaults: {'n': 3, 'fg': 0},
    knobs: [
      const Slide('n', 'Carbon atoms in the chain', 1, 10, digits: 0, step: 1),
      const Pick('fg', 'Functional group', _fgs, ids: _fgIds, chips: true),
      const Note('Number the chain from the end nearer the functional group; the locant goes before the suffix.'),
    ],
    readouts: (v) {
      final fg = v.i('fg').clamp(0, 7), n = v.i('n', 3).clamp(_minC(fg), 10);
      final r = _chain(n, fg);
      return [Readout('Name', r.$3.map((e) => e.$1).join(), '', IX.accent), Readout('Formula', r.$4), Readout('Word root', '${_roots[n - 1]} (C$n)', '', IX.ink), Readout('Series', _fgs[fg], '', IX.green)];
    },
    paint: (c, s, v) {
      final fg = v.i('fg').clamp(0, 7), n = v.i('n', 3).clamp(_minC(fg), 10);
      final r = _chain(n, fg);
      final u = math.min(118.0, (s.width - 240) / math.max(n, 3));
      final o = Offset(s.width / 2 - (n - 1) * u / 2, s.height * 0.38);
      final pts = _struct(c, o, u, r.$1, r.$2, size: 28, hi: {if (fg != 0) 0, if (fg == 5) 1});
      for (var i = 0; i < n; i++) {
        lbl(c, '${i + 1}', pts[i] + Offset(0, i.isOdd ? 44 : -44) + (fg >= 3 && i == 0 ? const Offset(26, 70) : Offset.zero), size: 17, color: IX.accent, w: FontWeight.w700);
      }
      // Name built from parts.
      var x = 0.0;
      final parts = r.$3;
      final total = parts.fold(0.0, (a, p) => a + textW(p.$1, 52, w: FontWeight.w700) + 18);
      x = s.width / 2 - total / 2;
      final y = s.height * 0.72;
      for (final (t, col) in parts) {
        final w = textW(t, 52, w: FontWeight.w700);
        final box = Rect.fromLTWH(x, y - 40, w + 10, 80);
        c.drawRRect(RRect.fromRectAndRadius(box, const Radius.circular(12)), fill(Color.alphaBlend(col.withValues(alpha: 0.08), IX.paper)));
        c.drawRRect(RRect.fromRectAndRadius(box, const Radius.circular(12)), stroke(col.withValues(alpha: 0.5), 1.5));
        lbl(c, t, box.center, size: 52, color: col, w: FontWeight.w700);
        final kind = col == IX.ink ? 'word root' : col == IX.accent ? (fg == 7 ? 'suffix' : 'primary suffix') : col == IX.green ? 'prefix' : 'secondary suffix';
        lbl(c, kind, Offset(box.center.dx, box.bottom + 24), size: 16, color: IX.muted, w: FontWeight.w600);
        x += w + 18;
      }
    },
    presets: {'Propane': {'n': 3, 'fg': 0}, 'Ethanol': {'n': 2, 'fg': 3}, 'But-1-ene': {'n': 4, 'fg': 1}, 'Propanone': {'n': 3, 'fg': 5}, 'Ethanoic acid': {'n': 2, 'fg': 6}, 'Pentanal': {'n': 5, 'fg': 4}},
  ),
  'isomers': Mode(
    title: 'Chain isomers of pentane',
    subtitle: 'Organic chemistry · Structural isomerism',
    formula: 'C₅H₁₂: same formula, different carbon skeleton',
    titleOf: (v) => const ['n-Pentane (pentane)', 'Isopentane (2-methylbutane)', 'Neopentane (2,2-dimethylpropane)'][v.i('iso').clamp(0, 2)],
    defaults: {'iso': 0},
    knobs: [const Pick('iso', 'Isomer', ['Pentane', '2-Methylbutane', '2,2-Dimethylpropane'], ids: ['n', 'iso', 'neo'], chips: true), const Note('More branching makes a molecule more compact, with less surface for van der Waals contact, so it boils lower.')],
    readouts: (v) {
      final i = v.i('iso').clamp(0, 2);
      return [Readout('Formula', 'C₅H₁₂'), Readout('Boiling point', const ['309 K', '301 K', '282.5 K'][i], '', IX.accent), Readout('Branches', '$i', '', IX.green), Readout('Longest chain', const ['5 C', '4 C', '3 C'][i])];
    },
    paint: (c, s, v) {
      final sel = v.i('iso').clamp(0, 2);
      final skel = <(List<_A>, List<(int, int, int)>)>[
        ([('CH₃', 0, 0, IX.ink), ('CH₂', 1, 0.55, IX.ink), ('CH₂', 2, 0, IX.ink), ('CH₂', 3, 0.55, IX.ink), ('CH₃', 4, 0, IX.ink)], [(0, 1, 1), (1, 2, 1), (2, 3, 1), (3, 4, 1)]),
        ([('CH₃', 0, 0.55, IX.ink), ('CH', 1, 0, IX.ink), ('CH₂', 2, 0.55, IX.ink), ('CH₃', 3, 0, IX.ink), ('CH₃', 1, -1, IX.positive)], [(0, 1, 1), (1, 2, 1), (2, 3, 1), (1, 4, 1)]),
        ([('CH₃', 0, 0, IX.ink), ('C', 1, 0, IX.ink), ('CH₃', 2, 0, IX.ink), ('CH₃', 1, -1, IX.positive), ('CH₃', 1, 1, IX.positive)], [(0, 1, 1), (1, 2, 1), (1, 3, 1), (1, 4, 1)]),
      ];
      final w = (s.width - 100) / 3;
      for (var i = 0; i < 3; i++) {
        final r = Rect.fromLTWH(40 + i * (w + 10), 40, w, s.height * 0.52);
        panel(c, r);
        if (i == sel) c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(16)), stroke(IX.accent, 3));
        final cols = skel[i].$1.map((a) => a.$2).fold(0.0, math.max);
        _struct(c, Offset(r.center.dx - cols * 50, r.center.dy - 10), 100, skel[i].$1, skel[i].$2, size: 24);
        lbl(c, const ['pentane', '2-methylbutane', '2,2-dimethylpropane'][i], Offset(r.center.dx, r.bottom - 32), size: 20, color: i == sel ? IX.accent : IX.ink, w: FontWeight.w700);
      }
      final br = Rect.fromLTWH(140, s.height * 0.52 + 110, s.width - 280, s.height * 0.3);
      bars(c, br, [('pentane', 309, IX.accent), ('2-methylbutane', 301, IX.accent), ('2,2-dimethylpropane', 282.5, IX.accent)], min: 250, max: 320, yLabel: 'b.p. (K)', hi: sel, dy: 20, fmt: (x) => '${x.toStringAsFixed(1)} K');
    },
    presets: {'Straight chain': {'iso': 0}, 'One branch': {'iso': 1}, 'Two branches': {'iso': 2}},
  ),
  'inductive': Mode(
    title: 'Inductive effect and acid strength',
    subtitle: 'Organic chemistry · Electron displacement effects',
    formula: 'pKa = −log Ka     more −I groups → lower pKa → stronger acid',
    titleOf: (v) => _haloAcid(v.i('n', 1).clamp(0, 3), v.i('hal', 1)),
    defaults: {'n': 1, 'hal': 1},
    knobs: [const Slide('n', 'Halogen atoms on the CH₃', 0, 3, digits: 0, step: 1), const Pick('hal', 'Halogen', ['F', 'Cl'], ids: ['F', 'Cl']), const Note('Each halogen pulls σ-electron density towards itself (−I). This spreads the negative charge of the carboxylate ion and stabilises it.')],
    readouts: (v) {
      final n = v.i('n', 1).clamp(0, 3), pk = _pka[v.i('hal', 1).clamp(0, 1)][n];
      final ka = math.pow(10, -pk).toDouble();
      final alpha = (-ka + math.sqrt(ka * ka + 0.4 * ka)) / 0.2;
      return [Readout('pKa', pk.toStringAsFixed(2), '', IX.accent), Readout('Ka', sx(ka), '', IX.positive), Readout('× acetic acid', sx(ka / 1.74e-5), '× stronger', IX.green), Readout('Ionised at 0.1 M', (100 * alpha).toStringAsFixed(1), '%')];
    },
    paint: (c, s, v) {
      final n = v.i('n', 1).clamp(0, 3), hi = v.i('hal', 1).clamp(0, 1);
      final x = const ['F', 'Cl'][hi];
      final o = Offset(s.width * 0.22, s.height * 0.36);
      final subs = [for (var i = 0; i < 3; i++) i < n ? x : 'H'];
      final atoms = <_A>[('C', 0, 0, IX.ink), ('C', 1.2, 0, IX.ink), ('O', 1.8, -1, IX.positive), ('O⁻', 1.8, 1, IX.positive), (subs[0], -1.1, 0, subs[0] == 'H' ? IX.inkSoft : IX.green), (subs[1], 0, -1.1, subs[1] == 'H' ? IX.inkSoft : IX.green), (subs[2], 0, 1.1, subs[2] == 'H' ? IX.inkSoft : IX.green)];
      final pts = _struct(c, o, 120, atoms, [(0, 1, 1), (1, 2, 2), (1, 3, 1), (0, 4, 1), (0, 5, 1), (0, 6, 1)], size: 30);
      for (var i = 0; i < n; i++) {
        final a = pts[0], b = pts[4 + i];
        final m = Offset.lerp(a, b, 0.5)!, d = (b - a) / (b - a).distance;
        IxPaint.arrow(c, m - d * 16 + Offset(-d.dy, d.dx) * 22, m + d * 16 + Offset(-d.dy, d.dx) * 22, IX.green, width: 3, head: 12);
      }
      if (n > 0) IxPaint.arrow(c, Offset.lerp(pts[1], pts[0], 0.3)! + const Offset(0, -24), Offset.lerp(pts[1], pts[0], 0.7)! + const Offset(0, -24), IX.green, width: 3, head: 12);
      lbl(c, 'carboxylate ion: the charge is spread over both O', o + const Offset(110, 230), size: 18, color: IX.inkSoft, w: FontWeight.w600);
      if (n > 0) lbl(c, '−I pull of $n ${x == 'F' ? 'fluorine' : 'chlorine'}${n > 1 ? 's' : ''}', o + const Offset(-80, -190), size: 19, color: IX.green, w: FontWeight.w700);
      final br = Rect.fromLTWH(s.width * 0.56, 90, s.width * 0.38, s.height - 230);
      bars(c, br, [for (var k = 0; k < 4; k++) (_haloAcid(k, hi).replaceAll('COOH', '·COOH'), _pka[hi][k], k == 0 ? IX.steel : IX.accent)], max: 5.5, yLabel: 'pKa', hi: n, dy: 1, fmt: (x) => x.toStringAsFixed(2));
      lbl(c, 'Lower bar = stronger acid', Offset(br.center.dx, br.top - 30), size: 18, color: IX.inkSoft, w: FontWeight.w600);
    },
    presets: {'Acetic acid': {'n': 0}, 'Chloroacetic acid': {'n': 1, 'hal': 1}, 'Trichloroacetic acid': {'n': 3, 'hal': 1}, 'Trifluoroacetic acid': {'n': 3, 'hal': 0}},
  ),
  'alkane': Mode(
    title: 'The alkane series',
    subtitle: 'Hydrocarbons · Alkanes',
    formula: 'CₙH₂ₙ₊₂ + (3n + 1)/2 O₂ → n CO₂ + (n + 1) H₂O',
    titleOf: (v) => '${_alkNames[v.i('n', 4).clamp(1, 10) - 1]}, C${sub(v.i('n', 4).clamp(1, 10))}H${sub(2 * v.i('n', 4).clamp(1, 10) + 2)}',
    defaults: {'n': 4},
    knobs: [const Slide('n', 'Carbon atoms n', 1, 10, digits: 0, step: 1), const Note('C₁–C₄ are gases at room temperature, C₅–C₁₇ liquids. Each extra CH₂ adds roughly 20–30 K to the boiling point.')],
    readouts: (v) {
      final n = v.i('n', 4).clamp(1, 10);
      final bp = _alkBp[n - 1];
      return [Readout('Molar mass', '${14 * n + 2}', 'g/mol'), Readout('Boiling point', bp.toStringAsFixed(1), 'K', IX.accent), Readout('At 298 K', bp < 298 ? 'gas' : 'liquid', '', IX.green), Readout('O₂ to burn 1 mol', ((3 * n + 1) / 2).toStringAsFixed(1), 'mol', IX.positive), Readout('ΔcH°', '−${_alkDh[n - 1].toStringAsFixed(0)}', 'kJ/mol', IX.amber), Readout('Carbon by mass', (1200 * n / (14 * n + 2)).toStringAsFixed(1), '%')];
    },
    paint: (c, s, v) {
      final n = v.i('n', 4).clamp(1, 10);
      final r = _chain(n, 0);
      final u = math.min(110.0, (s.width - 200) / math.max(n, 2));
      _struct(c, Offset(s.width / 2 - (n - 1) * u / 2, 120), u, r.$1, r.$2, size: 25);
      final pr = Rect.fromLTWH(130, 300, s.width - 230, s.height - 410);
      final pl = Plot(pr, 0.5, 10.5, 50, 500);
      pl.axes(c, x: 'Carbon atoms n', y: 'Boiling point (K)', dx: 1, dy: 50);
      pl.area(c, (_) => 298, 0.5, 10.5, IX.accent, base: (_) => 50);
      pl.hline(c, 298, IX.accent, label: 'room temperature 298 K', right: false);
      pl.line(c, [for (var k = 1; k <= 10; k++) Offset(k.toDouble(), _alkBp[k - 1])], IX.ink, w: 3);
      for (var k = 1; k <= 10; k++) {
        pl.dot(c, k.toDouble(), _alkBp[k - 1], k == n ? IX.positive : (_alkBp[k - 1] < 298 ? IX.accent : IX.green), r0: k == n ? 11 : 7, label: k == n ? '${_alkBp[k - 1].toStringAsFixed(0)} K' : null);
      }
      lbl(c, 'gases', pl.p(1.2, 80), size: 18, color: IX.accent, w: FontWeight.w700, align: Alignment.centerLeft);
      lbl(c, 'liquids', pl.p(9.6, 330), size: 18, color: IX.green, w: FontWeight.w700, align: Alignment.centerRight);
    },
    presets: {'Methane': {'n': 1}, 'Butane (LPG)': {'n': 4}, 'Pentane': {'n': 5}, 'Octane (petrol)': {'n': 8}},
  ),
  'huckel': Mode(
    title: "Hückel's rule",
    subtitle: 'Hydrocarbons · Aromaticity',
    formula: 'aromatic: planar, cyclic, fully conjugated, (4n + 2) π electrons',
    titleOf: (v) => '${_rings[v.i('ring').clamp(0, 7)].name}, ${_rings[v.i('ring').clamp(0, 7)].formula}',
    defaults: {'ring': 0},
    knobs: [Pick('ring', 'Ring', [for (final r in _rings) r.name], ids: const ['benzene', 'cyclobutadiene', 'cp-anion', 'tropylium', 'cyclopentadiene', 'cot', 'naphthalene', 'annulene18'], chips: true)],
    readouts: (v) {
      final r = _rings[v.i('ring').clamp(0, 7)];
      final n = (r.pi - 2) / 4;
      final hn = n == n.roundToDouble() && n >= 0;
      return [Readout('π electrons', '${r.pi}', '', IX.accent), Readout('n = (π − 2)/4', n.toStringAsFixed(2), '', hn ? IX.green : IX.positive), Readout('Planar · conjugated', '${r.planar ? 'yes' : 'no'} · ${r.conj ? 'yes' : 'no'}'), Readout('Verdict', _verdict(r), '', _verdict(r) == 'aromatic' ? IX.green : IX.positive)];
    },
    paint: (c, s, v) {
      final r = _rings[v.i('ring').clamp(0, 7)];
      final ctr = Offset(s.width * 0.34, s.height * 0.48);
      final rad = r.sides >= 18 ? 250.0 : 170.0;
      void ring(Offset cc, int k, double rr, double rot, {bool skipLast = false}) {
        final pts = [for (var i = 0; i < k; i++) cc + Offset(math.cos(rot + i * 2 * math.pi / k), math.sin(rot + i * 2 * math.pi / k)) * rr];
        for (var i = 0; i < k; i++) {
          final a = pts[i], b = pts[(i + 1) % k];
          c.drawLine(a, b, stroke(IX.ink, 4));
          final dbl = r.sides == 5 ? i == 0 || i == 2 : r.sides == 7 ? i < 6 && i.isEven : i.isEven;
          if (dbl && !(skipLast && i == k - 1)) {
            final inA = Offset.lerp(a, cc, 0.16)!, inB = Offset.lerp(b, cc, 0.16)!;
            c.drawLine(Offset.lerp(inA, inB, 0.12)!, Offset.lerp(inA, inB, 0.88)!, stroke(IX.ink, 4));
          }
        }
        for (final p in pts) {
          c.drawCircle(p, 6, fill(IX.ink));
        }
      }

      if (r.fused) {
        ring(ctr - Offset(rad * 0.866 * 0.75, 0), 6, rad * 0.75, math.pi / 6);
        ring(ctr + Offset(rad * 0.866 * 0.75, 0), 6, rad * 0.75, math.pi / 6, skipLast: true);
      } else {
        ring(ctr, r.sides, rad, -math.pi / 2 + (r.sides == 4 ? math.pi / 4 : 0));
      }
      if (r.charge.isNotEmpty) tag(c, r.charge, ctr, r.charge == '+' ? IX.positive : IX.accent, size: 34, solid: true);
      if (!r.conj) lbl(c, 'CH₂ (sp³) breaks the conjugation', ctr + Offset(0, rad + 50), size: 19, color: IX.positive, w: FontWeight.w600);
      if (!r.planar) lbl(c, 'tub-shaped: not planar', ctr + Offset(0, rad + 50), size: 19, color: IX.positive, w: FontWeight.w600);
      // π-electron count.
      final pr = Rect.fromLTWH(s.width * 0.66, 90, s.width * 0.3, s.height - 220);
      panel(c, pr, 'π electrons');
      for (var i = 0; i < r.pi; i++) {
        ball(c, Offset(pr.left + 50 + (i % 6) * 52.0, pr.top + 90 + (i ~/ 6) * 56.0), 16, IX.accent);
      }
      final checks = [('4n + 2 = ${r.pi}?', (r.pi - 2) % 4 == 0), ('planar', r.planar), ('cyclic, fully conjugated', r.conj)];
      for (final (i, (t, ok)) in checks.indexed) {
        final y = pr.top + 300 + i * 56.0;
        tag(c, ok ? 'yes' : 'no', Offset(pr.left + 30, y), ok ? IX.green : IX.positive, solid: true, align: Alignment.centerLeft, size: 18);
        lbl(c, t, Offset(pr.left + 110, y), size: 20, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
      }
      lbl(c, _verdict(r).toUpperCase(), Offset(pr.center.dx, pr.bottom - 50), size: 30, color: _verdict(r) == 'aromatic' ? IX.green : IX.positive, w: FontWeight.w700);
    },
    presets: {'Benzene': {'ring': 0}, 'Cyclobutadiene': {'ring': 1}, 'Cyclopentadienyl⁻': {'ring': 2}, 'Cyclooctatetraene': {'ring': 5}, 'Naphthalene': {'ring': 6}},
  ),
  'boiling': Mode(
    title: 'Comparing physical properties',
    subtitle: 'Organic chemistry · Structure and properties',
    formula: 'van der Waals < dipole–dipole < hydrogen bonding',
    titleOf: (v) => _sets[v.i('set').clamp(0, 5)].$1,
    defaults: {'set': 0},
    knobs: [const Pick('set', 'Compare', ['Halomethanes', 'Ethers', 'Carbonyls', 'Acids', 'Dehydration', 'Nitro groups'], ids: ['halomethanes', 'ethers', 'carbonyl', 'acids', 'dehydration', 'nitro'], chips: true)],
    readouts: (v) {
      final d = _sets[v.i('set').clamp(0, 5)].$4;
      final hi = d.reduce((a, b) => a.$2 > b.$2 ? a : b), lo = d.reduce((a, b) => a.$2 < b.$2 ? a : b);
      return [Readout('Highest', hi.$1, '${hi.$2.toStringAsFixed(0)} K', IX.positive), Readout('Lowest', lo.$1, '${lo.$2.toStringAsFixed(0)} K', IX.accent), Readout('Spread', (hi.$2 - lo.$2).toStringAsFixed(0), 'K', IX.green)];
    },
    paint: (c, s, v) {
      final set = _sets[v.i('set').clamp(0, 5)];
      final d = set.$4;
      final top = d.map((e) => e.$2).reduce(math.max);
      final low = d.map((e) => e.$2).reduce(math.min);
      final lo = math.max(0.0, ((low - (top - low) * 0.8) / 50).floor() * 50.0);
      final br = Rect.fromLTWH(120, 110, s.width - 220, s.height - 330);
      bars(c, br, [for (final (i, e) in d.indexed) (e.$1, e.$2, CX.series[i % CX.series.length])], min: lo, max: top + (top - lo) * 0.12, yLabel: set.$2, fmt: (x) => '${x.toStringAsFixed(0)} K');
      final bw = br.width / d.length;
      for (final (i, e) in d.indexed) {
        if (e.$3.isEmpty) continue;
        final y = br.top + (1 - (e.$2 - lo) / (top + (top - lo) * 0.12 - lo)) * br.height;
        tag(c, e.$3, Offset(br.left + bw * (i + 0.5), y + 34), Colors.white, size: 15, solid: false);
      }
      para(c, set.$3, Offset(120, s.height - 130), s.width - 240, size: 20, color: IX.inkSoft);
    },
    presets: {'Halomethanes': {'set': 0}, 'Ethers vs alcohols': {'set': 1}, 'Carbonyl compounds': {'set': 2}, 'Carboxylic acids': {'set': 3}},
  ),
  'sn': Mode(
    title: 'SN1 and SN2',
    subtitle: 'Haloalkanes · Nucleophilic substitution',
    formula: 'SN2: rate = k[RX][Nu⁻]     SN1: rate = k[RX]',
    titleOf: (v) => v.i('mech') == 0 ? 'SN2: OH⁻ + 2-bromobutane, one step with inversion' : 'SN1: 3° bromide → carbocation → racemic alcohol',
    defaults: {'mech': 0, 's': 0.5, 'r': 1, 'nu': 1, 'k': 1, 'face': 0, 'yaw': 0.25, 'pitch': -0.25},
    rotate: true,
    tick: (v, dt) {
      v['s'] = math.min(1, v.g('s') + dt * 0.16);
      if (v.g('s') >= 1) v['_run'] = 0;
    },
    knobsOf: (v) => [
      const Pick('mech', 'Mechanism', ['SN2', 'SN1'], ids: ['sn2', 'sn1']),
      const Slide('s', 'Reaction progress', 0, 1, digits: 2, step: 0.01),
      if (v.i('mech') == 1) const Pick('face', 'Nucleophile attacks', ['Front face', 'Back face'], ids: ['front', 'back']),
      const Slide('r', '[RX]', 0, 2, unit: 'mol/L', digits: 2, step: 0.05),
      const Slide('nu', '[OH⁻]', 0, 2, unit: 'mol/L', digits: 2, step: 0.05),
      Act('Play', (v) {
        v['s'] = 0;
        v['_run'] = 1;
      }),
    ],
    readouts: (v) {
      final sn1 = v.i('mech') == 1, s = v.g('s', 0.5);
      final rate = v.g('k', 1) * v.g('r', 1) * (sn1 ? 1 : v.g('nu', 1));
      final step = sn1 ? (s < 0.3 ? 'C–Br bond breaking (slow)' : s < 0.6 ? 'planar carbocation' : s < 0.9 ? 'OH⁻ attacks (fast)' : 'product') : (s < 0.35 ? 'OH⁻ approaches from the back' : s < 0.65 ? 'transition state: C half-bonded to both' : 'Br⁻ leaves; configuration inverted');
      return [Readout('Now', step, '', IX.accent), Readout('Rate', rate.toStringAsFixed(2), 'mol L⁻¹ s⁻¹ (k = 1)', IX.positive), Readout('Order', sn1 ? '1' : '2 (1 in each)'), Readout('Stereochemistry', sn1 ? 'racemisation' : 'inversion', '', IX.green), Readout('Best substrate', sn1 ? '3° (stable carbocation)' : 'CH₃X, 1° (little crowding)')];
    },
    paint: (c, s, v) {
      final sn1 = v.i('mech') == 1, p = v.g('s', 0.5);
      final (m, dn, dx) = _sn(sn1, p, v.i('face') == 1);
      final mr = Rect.fromLTWH(20, 20, s.width - 40, s.height * 0.58);
      final pos = drawMol(c, mr.center + const Offset(0, 10), 92, m, v.g('yaw', 0.25), v.g('pitch', -0.25));
      if (dn >= 2.05 && dn < 3.2) IxPaint.dashed(c, pos[0], pos[5], Paint()..color = IX.positive..strokeWidth = 3);
      if (dx >= 2.05 && dx < 3.2) IxPaint.dashed(c, pos[0], pos[4], Paint()..color = const Color(0xFF8E3B2A)..strokeWidth = 3);
      if (!sn1 && p > 0.4 && p < 0.62) lbl(c, '[HO···C···Br]⁻  transition state', Offset(mr.center.dx, mr.top + 30), size: 22, color: IX.ink, w: FontWeight.w700, halo: true);
      if (sn1 && p > 0.4 && p < 0.6) lbl(c, 'carbocation: planar, sp²', Offset(mr.center.dx, mr.top + 30), size: 22, color: IX.ink, w: FontWeight.w700, halo: true);
      if (p < 0.3) {
        final q = pos[5];
        curly(c, q + const Offset(20, -30), Offset.lerp(q, pos[0], 0.6)! + const Offset(0, -26), IX.positive, bend: -0.5);
      }
      lbl(c, 'Drag to turn the molecule', Offset(mr.left + 120, mr.bottom - 10), size: 15, color: IX.muted);
      // Energy profile.
      final er = Rect.fromLTWH(110, mr.bottom + 50, s.width * 0.4, s.height - mr.bottom - 120);
      final pe = Plot(er, 0, 1, -0.3, 1.2);
      double prof(double x) => sn1 ? 0.95 * math.exp(-math.pow((x - 0.28) / 0.1, 2)) + 0.5 * _sm((x - 0.15) / 0.25) * (1 - _sm((x - 0.55) / 0.35)) + 0.55 * math.exp(-math.pow((x - 0.68) / 0.07, 2)) * 0.5 - 0.2 * _sm((x - 0.6) / 0.3) : 1.0 * math.exp(-math.pow((x - 0.5) / 0.14, 2)) - 0.2 * _sm((x - 0.5) / 0.3);
      c.drawRect(er, stroke(IX.rule, 1.5));
      pe.curve(c, prof, IX.ink, w: 4);
      pe.dot(c, p, prof(p), IX.positive);
      lbl(c, 'Energy', Offset(er.left - 34, er.center.dy), size: 16, color: IX.inkSoft);
      lbl(c, sn1 ? 'two steps: carbocation intermediate in the dip' : 'one step: a single transition state', Offset(er.center.dx, er.top - 18), size: 17, color: IX.inkSoft, w: FontWeight.w600);
      // Rate law plot.
      final rr = Rect.fromLTWH(s.width * 0.58, mr.bottom + 50, s.width * 0.38, s.height - mr.bottom - 120);
      final pr = Plot(rr, 0, 2, 0, 4.2);
      pr.axes(c, x: '[RX] (mol/L)', y: 'Rate', dx: 0.5, dy: 1);
      pr.curve(c, (x) => v.g('k', 1) * x, IX.green, w: sn1 ? 4.5 : 2.5);
      pr.curve(c, (x) => v.g('k', 1) * x * v.g('nu', 1), IX.accent, w: sn1 ? 2.5 : 4.5);
      pr.legend(c, [('SN1  k[RX]', IX.green), ('SN2  k[RX][OH⁻]', IX.accent)]);
      pr.dot(c, v.g('r', 1), v.g('k', 1) * v.g('r', 1) * (sn1 ? 1 : v.g('nu', 1)), sn1 ? IX.green : IX.accent);
    },
    presets: {'SN2 start': {'mech': 0, 's': 0}, 'SN2 transition state': {'mech': 0, 's': 0.5}, 'SN2 product': {'mech': 0, 's': 1}, 'SN1 carbocation': {'mech': 1, 's': 0.5}, 'SN1 product': {'mech': 1, 's': 1}},
  ),
  'optical': Mode(
    title: 'Rotation of a mixture of enantiomers',
    subtitle: 'Haloalkanes · Optical isomerism',
    formula: 'α(observed) = α(pure) × (2f − 1)     ee = |2f − 1| × 100 %',
    defaults: {'a': 23.1, 'f': 0.75, 'yaw': 0.4, 'pitch': -0.2},
    rotate: true,
    knobs: [
      const Slide('a', 'Rotation of the pure (+) form', 5, 30, unit: '°', digits: 1, step: 0.1),
      const Slide('f', 'Fraction of the (+) enantiomer', 0, 1, digits: 2, step: 0.01),
      const Note('A 50 : 50 (racemic) mixture rotates light by 0°: the two rotations cancel.'),
    ],
    readouts: (v) {
      final a = v.g('a', 23.1), f = v.g('f', 0.75);
      final obs = a * (2 * f - 1);
      return [Readout('Observed rotation', '${obs >= 0 ? '+' : '−'}${obs.abs().toStringAsFixed(1)}', '°', IX.accent), Readout('Enantiomeric excess', (100 * (2 * f - 1).abs()).toStringAsFixed(0), '%', IX.green), Readout('(+) : (−)', '${(100 * f).toStringAsFixed(0)} : ${(100 * (1 - f)).toStringAsFixed(0)}'), Readout('Sign', obs.abs() < 0.05 ? 'racemic (±)' : obs > 0 ? 'dextrorotatory (+)' : 'laevorotatory (−)', '', IX.positive)];
    },
    paint: (c, s, v) {
      final a = v.g('a', 23.1), f = v.g('f', 0.75), obs = a * (2 * f - 1);
      // Two mirror-image molecules (butan-2-ol).
      Mol3 enant(double m) {
        final d = pairDirections(4, 0);
        P3 mir(P3 q) => P3(q.x * m, q.y, q.z);
        return Mol3([
          const Atom3('C', P3(0, 0, 0)),
          Atom3('O', mir(d[0]) * 1.5, label: 'OH', r: 0.48, color: const Color(0xFFC63B2A)),
          Atom3('H', mir(d[1]) * 1.2, r: 0.3),
          Atom3('X', mir(d[2]) * 1.6, label: 'CH₃', r: 0.48, color: const Color(0xFF3C4250)),
          Atom3('X', mir(d[3]) * 1.6, label: 'C₂H₅', r: 0.52, color: const Color(0xFF6B46A8)),
        ], [(0, 1, 1), (0, 2, 1), (0, 3, 1), (0, 4, 1)]);
      }

      final top = s.height * 0.3;
      drawMol(c, Offset(s.width * 0.25, top), 80, enant(1), v.g('yaw', 0.4), v.g('pitch', -0.2));
      drawMol(c, Offset(s.width * 0.75, top), 80, enant(-1), -v.g('yaw', 0.4), v.g('pitch', -0.2));
      IxPaint.dashed(c, Offset(s.width / 2, 40), Offset(s.width / 2, top + 150), Paint()..color = IX.steel..strokeWidth = 3);
      lbl(c, 'mirror', Offset(s.width / 2, top + 172), size: 16, color: IX.muted);
      lbl(c, '(+) enantiomer', Offset(s.width * 0.25, 50), size: 22, color: IX.accent, w: FontWeight.w700);
      lbl(c, '(−) enantiomer', Offset(s.width * 0.75, 50), size: 22, color: IX.positive, w: FontWeight.w700);
      // Mixture strip of 20 molecules.
      final y = top + 230;
      final nPlus = (f * 20).round();
      for (var i = 0; i < 20; i++) {
        final at = Offset(s.width / 2 - 19 * 26 + i * 52.0, y);
        tag(c, i < nPlus ? '+' : '−', at, i < nPlus ? IX.accent : IX.positive, size: 18, solid: true);
      }
      // Polarimeter.
      final py = s.height - 150;
      final x0 = 120.0, x1 = s.width - 120;
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(x0, py), width: 90, height: 70), const Radius.circular(12)), fill(const Color(0xFF2B3042)));
      lbl(c, 'lamp', Offset(x0, py + 56), size: 15, color: IX.muted);
      c.drawLine(Offset(x0 + 45, py), Offset(x1 - 60, py), stroke(const Color(0xFFE8C531), 5));
      void disc(double x, double ang, String name) {
        c.drawCircle(Offset(x, py), 52, fill(IX.paper));
        c.drawCircle(Offset(x, py), 52, stroke(IX.inkSoft, 3));
        final d = Offset(math.sin(ang), -math.cos(ang)) * 44;
        c.drawLine(Offset(x, py) - d, Offset(x, py) + d, stroke(IX.accent, 5));
        lbl(c, name, Offset(x, py + 74), size: 15, color: IX.muted);
      }

      disc(x0 + 170, 0, 'polariser');
      final tube = Rect.fromLTRB(x0 + 260, py - 34, x1 - 260, py + 34);
      c.drawRRect(RRect.fromRectAndRadius(tube, const Radius.circular(34)), fill(const Color(0xFFDCEBF7)));
      c.drawRRect(RRect.fromRectAndRadius(tube, const Radius.circular(34)), stroke(IX.glassEdge, 2.5));
      lbl(c, 'sample tube', Offset(tube.center.dx, py + 56), size: 15, color: IX.muted);
      disc(x1 - 170, obs * math.pi / 180, 'analyser ${obs >= 0 ? '+' : '−'}${obs.abs().toStringAsFixed(1)}°');
      ball(c, Offset(x1 - 40, py), 22, const Color(0xFFE6EAF2));
      lbl(c, 'eye', Offset(x1 - 40, py + 56), size: 15, color: IX.muted);
    },
    presets: {'Pure (+)': {'f': 1}, '75 % (+)': {'f': 0.75}, 'Racemic': {'f': 0.5}, 'Pure (−)': {'f': 0}},
  ),
};

const _pka = [
  [4.76, 2.59, 1.24, 0.23],
  [4.76, 2.86, 1.29, 0.65],
];

String _haloAcid(int n, int hal) {
  final x = const ['F', 'Cl'][hal.clamp(0, 1)];
  return switch (n) { 0 => 'CH₃COOH', 1 => '${x}CH₂COOH', 2 => '$x₂CHCOOH', _ => '$x₃CCOOH' };
}

String _verdict(_Ring r) => !r.planar || !r.conj ? 'non-aromatic' : (r.pi - 2) % 4 == 0 ? 'aromatic' : 'anti-aromatic';

String _dbeExample(int c, int h, int n, int x) =>
    const {
      '6,6,0,0': 'benzene',
      '2,4,0,0': 'ethene',
      '2,2,0,0': 'ethyne',
      '6,12,0,0': 'cyclohexane or hexene',
      '6,14,0,0': 'hexane',
      '4,6,0,0': 'buta-1,3-diene',
      '5,5,1,0': 'pyridine',
      '7,8,0,0': 'toluene',
      '10,8,0,0': 'naphthalene',
      '6,5,0,1': 'chlorobenzene',
      '2,3,0,1': 'chloroethene',
      '3,3,1,0': 'acrylonitrile',
      '1,4,0,0': 'methane',
      '3,6,0,0': 'propene or cyclopropane',
    }['$c,$h,$n,$x'] ??
    '—';
