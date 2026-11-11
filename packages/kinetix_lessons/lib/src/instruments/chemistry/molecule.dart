import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bench.dart';
import 'kit.dart';

/// Molecular shape: VSEPR ball-and-stick models (drag to turn), electron-pair counting,
/// hybrid orbitals, formal charge and the conformations of ethane.
class _Vs {
  const _Vs(this.formula, this.centre, this.ligand, this.n, this.lone, this.angle, {this.orders, this.squeeze = 0, this.bond = 1.55});
  final String formula, centre, ligand, angle;
  final int n, lone;
  final int? orders;
  final double squeeze, bond;
}

const _mols = [
  _Vs('BeCl₂', 'Be', 'Cl', 2, 0, '180°'),
  _Vs('CO₂', 'C', 'O', 2, 0, '180°', orders: 2, bond: 1.35),
  _Vs('BF₃', 'B', 'F', 3, 0, '120°'),
  _Vs('SO₂', 'S', 'O', 2, 1, '119°', orders: 2, squeeze: 0.02),
  _Vs('CH₄', 'C', 'H', 4, 0, '109.5°', bond: 1.3),
  _Vs('NH₃', 'N', 'H', 3, 1, '107°', squeeze: 0.04, bond: 1.3),
  _Vs('H₂O', 'O', 'H', 2, 2, '104.5°', squeeze: 0.06, bond: 1.3),
  _Vs('PCl₅', 'P', 'Cl', 5, 0, '90°, 120°', bond: 1.75),
  _Vs('SF₄', 'S', 'F', 4, 1, '173°, 102°', squeeze: 0.06),
  _Vs('ClF₃', 'Cl', 'F', 3, 2, '87.5°', squeeze: 0.05),
  _Vs('XeF₂', 'Xe', 'F', 2, 3, '180°', bond: 1.75),
  _Vs('SF₆', 'S', 'F', 6, 0, '90°'),
  _Vs('BrF₅', 'Br', 'F', 5, 1, '84.8°', squeeze: 0.05, bond: 1.65),
  _Vs('XeF₄', 'Xe', 'F', 4, 2, '90°', bond: 1.7),
];

const _shape = {
  '2,0': 'Linear', '3,0': 'Trigonal planar', '2,1': 'Bent', '4,0': 'Tetrahedral', '3,1': 'Trigonal pyramidal', '2,2': 'Bent',
  '5,0': 'Trigonal bipyramidal', '4,1': 'See-saw', '3,2': 'T-shaped', '2,3': 'Linear', '6,0': 'Octahedral', '5,1': 'Square pyramidal', '4,2': 'Square planar',
  '1,0': 'Linear', '1,1': 'Linear', '1,2': 'Linear', '1,3': 'Linear',
};
const _arrangement = {2: 'Linear', 3: 'Trigonal planar', 4: 'Tetrahedral', 5: 'Trigonal bipyramidal', 6: 'Octahedral'};
const _hyb = {2: 'sp', 3: 'sp²', 4: 'sp³', 5: 'sp³d', 6: 'sp³d²'};
const _ideal = {2: '180°', 3: '120°', 4: '109.5°', 5: '90°, 120°', 6: '90°'};

String _axe(int m, int lone) => 'AX${m > 1 ? sub(m) : ''}${lone > 0 ? 'E${lone > 1 ? sub(lone) : ''}' : ''}';

/// The table of shapes by electron pairs and lone pairs, with the current one marked.
void _shapeTable(Canvas c, Rect r, int pairs, int lone) {
  panel(c, r, 'VSEPR shapes');
  const rows = [2, 3, 4, 5, 6];
  final top = r.top + 52, h = (r.height - 64) / rows.length;
  final cw = (r.width - 70) / 4;
  for (final (i, p) in rows.indexed) {
    final y = top + h * i;
    final on = p == pairs;
    lbl(c, '$p', Offset(r.left + 34, y + h / 2), size: 24, color: on ? IX.accent : IX.muted, w: FontWeight.w700);
    for (var l = 0; l <= math.min(3, p - 2); l++) {
      final cr = Rect.fromLTWH(r.left + 62 + cw * l, y + 5, cw - 7, h - 10);
      final sel = on && l == lone;
      c.drawRRect(RRect.fromRectAndRadius(cr, const Radius.circular(10)), fill(sel ? IX.accent : IX.paper));
      c.drawRRect(RRect.fromRectAndRadius(cr, const Radius.circular(10)), stroke(sel ? IX.accent : IX.rule, 1.2));
      lbl(c, _axe(p - l, l), cr.topLeft + const Offset(8, 7), size: 14, color: sel ? Colors.white70 : IX.muted, align: Alignment.topLeft, w: FontWeight.w600);
      final tp = TextPainter(text: TextSpan(text: _shape['${p - l},$l'] ?? '', style: IX.text(13.5, w: FontWeight.w600, c: sel ? Colors.white : IX.ink, height: 1.1)), textDirection: TextDirection.ltr)..layout(maxWidth: cr.width - 10);
      tp.paint(c, Offset(cr.left + 6, cr.bottom - tp.height - 7));
      // A small sketch of the shape: bonds as lines to dots, lone pairs as faint lobes.
      final dirs = pairDirections(p, l);
      final ctr = Offset(cr.center.dx, cr.top + (cr.height - tp.height) * 0.52);
      final sz = math.min(cr.width, cr.height) * 0.26;
      final ink = sel ? Colors.white : IX.inkSoft;
      for (final (k, d) in dirs.indexed) {
        final q = d.rot(0.5, -0.3);
        final e = ctr + Offset(q.x, -q.y) * sz;
        if (k < p - l) {
          c.drawLine(ctr, e, stroke(ink, 2));
          c.drawCircle(e, 3.6, fill(ink));
        } else {
          c.drawOval(Rect.fromCenter(center: Offset.lerp(ctr, e, 0.6)!, width: 9, height: 9), fill((sel ? Colors.white : IX.accent).withValues(alpha: 0.35)));
        }
      }
      c.drawCircle(ctr, 4.6, fill(sel ? Colors.white : IX.ink));
    }
  }
  lbl(c, 'electron pairs  ·  columns: 0, 1, 2, 3 lone pairs', Offset(r.center.dx, r.bottom - 14), size: 13, color: IX.muted);
}

void _vsepr(Canvas c, Size s, V v, String centre, String ligand, int m, int lone, {int orders = 1, double squeeze = 0, double bond = 1.55, String? angle}) {
  final model = vseprMol(centre, List.filled(m, ligand), lone, orders: List.filled(m, orders), squeeze: squeeze, bond: bond);
  final split = s.width - 480;
  final pos = drawMol(c, Offset(split / 2, s.height / 2), math.min(split, s.height) / 4.4, model, v.g('yaw'), v.g('pitch'));
  if (m >= 2 && angle != null) {
    // Mark the bond angle between the first two ligands.
    final o = pos[0], a = pos[1], b = pos[2];
    final r = 70.0;
    final a1 = math.atan2(a.dy - o.dy, a.dx - o.dx), a2 = math.atan2(b.dy - o.dy, b.dx - o.dx);
    var sweep = a2 - a1;
    while (sweep > math.pi) {
      sweep -= 2 * math.pi;
    }
    while (sweep < -math.pi) {
      sweep += 2 * math.pi;
    }
    c.drawArc(Rect.fromCircle(center: o, radius: r), a1, sweep, false, stroke(IX.amber, 3));
    final mid = a1 + sweep / 2;
    lbl(c, angle.split(',').first, o + Offset(math.cos(mid), math.sin(mid)) * (r + 30), size: 20, color: IX.amber, w: FontWeight.w700, halo: true);
  }
  lbl(c, 'Drag the model to turn it', Offset(24, s.height - 28), size: 16, color: IX.muted, align: Alignment.centerLeft);
  if (lone > 0) {
    c.drawOval(Rect.fromCenter(center: Offset(36, s.height - 64), width: 34, height: 18), fill(const Color(0x998FB0E0)));
    lbl(c, 'lone pair', Offset(62, s.height - 64), size: 16, color: IX.inkSoft, align: Alignment.centerLeft);
  }
  _shapeTable(c, Rect.fromLTWH(split, 24, 456, s.height - 48), m + lone, lone);
}

final Map<String, Mode> moleculeModes = {
  'vsepr': Mode(
    title: 'Shapes of molecules (VSEPR)',
    subtitle: 'Chemical bonding · VSEPR theory',
    formula: 'pairs = bond pairs + lone pairs',
    titleOf: (v) => 'Shape of ${_mols[v.i('mol').clamp(0, _mols.length - 1)].formula}',
    defaults: {'mol': 5},
    rotate: true,
    knobs: [Pick('mol', 'Molecule', [for (final m in _mols) m.formula], ids: [for (final m in _mols) ascii(m.formula)], chips: true), const Note('Lone pairs repel more than bond pairs, so they squeeze the bond angles (CH₄ 109.5° > NH₃ 107° > H₂O 104.5°).')],
    readouts: (v) {
      final m = _mols[v.i('mol').clamp(0, _mols.length - 1)];
      return [
        Readout('Shape', _shape['${m.n},${m.lone}']!, '', IX.accent),
        Readout('Type', _axe(m.n, m.lone)),
        Readout('Bond pairs', '${m.n}', '', IX.green),
        Readout('Lone pairs', '${m.lone}', '', CX.purple),
        Readout('Bond angle', m.angle, '', IX.amber),
        Readout('Hybridisation', _hyb[m.n + m.lone]!),
      ];
    },
    paint: (c, s, v) {
      final m = _mols[v.i('mol').clamp(0, _mols.length - 1)];
      _vsepr(c, s, v, m.centre, m.ligand, m.n, m.lone, orders: m.orders ?? 1, squeeze: m.squeeze, bond: m.bond, angle: m.angle);
    },
    presets: {'CH₄': {'mol': 4}, 'NH₃': {'mol': 5}, 'H₂O': {'mol': 6}, 'PCl₅': {'mol': 7}, 'SF₆': {'mol': 11}, 'XeF₄': {'mol': 13}},
  ),
  'pairs': Mode(
    title: 'Counting electron pairs',
    subtitle: 'Chemical bonding · VSEPR theory',
    formula: 'pairs = ½(V + M − charge)',
    defaults: {'V': 6, 'M': 4, 'q': 0},
    rotate: true,
    knobs: const [
      Slide('V', 'Valence electrons of central atom, V', 2, 8, step: 1, digits: 0),
      Slide('M', 'Monovalent atoms bonded, M', 1, 6, step: 1, digits: 0),
      Slide('q', 'Charge on the species', -2, 2, step: 1, fmt: _signed),
      Note('Each monovalent atom (H, F, Cl) shares one electron. An anion adds electrons, a cation removes them.'),
    ],
    readouts: (v) {
      final e = v.i('V') + v.i('M') - v.i('q');
      final pairs = e ~/ 2, lone = pairs - v.i('M');
      final ok = e.isEven && lone >= 0 && pairs <= 6 && pairs >= 2;
      return [
        Readout('Electron pairs', ok ? '$pairs' : e.isOdd ? 'odd' : '—', '', IX.accent),
        Readout('Lone pairs', ok ? '$lone' : '—', '', CX.purple),
        Readout('Arrangement', ok ? _arrangement[pairs]! : '—'),
        Readout('Shape', ok ? _shape['${v.i('M')},$lone'] ?? '—' : 'Not possible', '', IX.green),
      ];
    },
    paint: (c, s, v) {
      final e = v.i('V') + v.i('M') - v.i('q');
      final pairs = e ~/ 2, lone = pairs - v.i('M');
      if (e.isOdd || lone < 0 || pairs > 6 || pairs < 2) {
        lbl(c, e.isOdd ? 'An odd number of electrons: one is unpaired (a radical).' : 'No such molecule: more bonds than electron pairs.', Offset(s.width / 2, s.height / 2), size: 24, color: IX.inkSoft);
        return;
      }
      _vsepr(c, s, v, 'A', 'X', v.i('M'), lone, squeeze: lone > 0 && pairs < 6 ? 0.04 : 0, angle: v.i('M') >= 2 ? (lone == 0 ? _ideal[pairs] : '< ${_ideal[pairs]!.split(',').first}') : null);
    },
    presets: {'CH₄': {'V': 4, 'M': 4, 'q': 0}, 'NH₄⁺': {'V': 5, 'M': 4, 'q': 1}, 'H₂O': {'V': 6, 'M': 2, 'q': 0}, 'ICl₄⁻': {'V': 7, 'M': 4, 'q': -1}, 'SF₆': {'V': 6, 'M': 6, 'q': 0}},
  ),
  'hybrid': Mode(
    title: 'Hybrid orbitals',
    subtitle: 'Chemical bonding · Hybridisation',
    formula: 'cos θ = −1/n   for spⁿ',
    defaults: {'n': 3},
    rotate: true,
    knobs: const [Slide('n', 'p-character n in spⁿ', 1, 3, step: 0.05, digits: 2), Note('Equivalent spⁿ hybrids have s-character 1/(n + 1). Drag the model to turn it; unused p orbitals are grey.')],
    readouts: (v) {
      final n = v.g('n', 3);
      final th = math.acos(-1 / n) * 180 / math.pi;
      final k = n.round();
      return [
        Readout('Angle θ', th.toStringAsFixed(1), '°', IX.amber),
        Readout('s-character', (100 / (n + 1)).toStringAsFixed(1), '%', IX.accent),
        Readout('Nearest', k == 1 ? 'sp' : 'sp${sup(k)}'),
        Readout('Example', const {1: 'BeCl₂, C₂H₂', 2: 'BF₃, C₂H₄', 3: 'CH₄, NH₃'}[k]!),
      ];
    },
    paint: (c, s, v) {
      final n = v.g('n', 3);
      final k = n.round();
      final split = s.width - 460;
      final dirs = pairDirections(k + 1, 0);
      final hy = [for (final d in dirs) (0, d)];
      final model = Mol3([const Atom3('C', P3(0, 0, 0), r: 0.32)], const [], hybrid: hy);
      final cen = Offset(split / 2, s.height / 2);
      final sc = math.min(split, s.height) / 5.2;
      // Unhybridised p orbitals, drawn first and faint.
      final pz = k == 1 ? [const P3(0, 1, 0), const P3(0, 0, 1)] : k == 2 ? [const P3(0, 0, 1)] : <P3>[];
      final pModel = Mol3(const [], const [], hybrid: [for (final d in pz) ...[(0, d), (0, d * -1)]]);
      if (pz.isNotEmpty) {
        c.saveLayer(Offset.zero & s, Paint()..color = const Color(0x77000000));
        drawMol(c, cen, sc * 0.75, Mol3([const Atom3('C', P3(0, 0, 0), r: 0.01)], const [], hybrid: pModel.hybrid), v.g('yaw'), v.g('pitch'), labels: false, shadow: false);
        c.restore();
      }
      drawMol(c, cen, sc, model, v.g('yaw'), v.g('pitch'), shadow: true);
      lbl(c, k == 1 ? 'sp: two hybrids, 180° apart' : k == 2 ? 'sp²: three hybrids in a plane' : 'sp³: four hybrids to a tetrahedron', Offset(split / 2, 44), size: 22, color: IX.ink, w: FontWeight.w600);
      lbl(c, 'Drag to turn', Offset(24, s.height - 28), size: 16, color: IX.muted, align: Alignment.centerLeft);
      final pr = Rect.fromLTWH(split + 70, 90, 360, s.height - 220);
      final pl = Plot(pr, 1, 3, 100, 190);
      pl.axes(c, x: 'n in spⁿ', y: 'Angle θ (°)', dx: 0.5, dy: 10, title: 'θ = cos⁻¹(−1/n)');
      pl.curve(c, (x) => math.acos(-1 / x) * 180 / math.pi, IX.accent);
      for (final (x, name) in [(1.0, 'sp'), (2.0, 'sp²'), (3.0, 'sp³')]) {
        lbl(c, name, pl.p(x, math.acos(-1 / x) * 180 / math.pi) + const Offset(22, 22), size: 15, color: IX.muted, w: FontWeight.w600);
      }
      pl.dot(c, n, math.acos(-1 / n) * 180 / math.pi, IX.amber, label: '${(math.acos(-1 / n) * 180 / math.pi).toStringAsFixed(1)}°', align: Alignment.centerLeft);
    },
    presets: {'sp': {'n': 1}, 'sp²': {'n': 2}, 'sp³': {'n': 3}},
  ),
  'formal': Mode(
    title: 'Formal charge',
    subtitle: 'Chemical bonding · Lewis structures',
    formula: 'FC = V − L − ½S',
    defaults: {'V': 6, 'L': 2, 'S': 6, 'nb': 2},
    knobs: const [
      Slide('V', 'Valence electrons V', 1, 8, step: 1, digits: 0),
      Slide('L', 'Lone-pair electrons L', 0, 8, step: 1, digits: 0),
      Slide('S', 'Shared (bonding) electrons S', 0, 8, step: 2, digits: 0),
      Note('The best Lewis structure keeps formal charges small, with any negative charge on the more electronegative atom.'),
    ],
    readouts: (v) {
      final fc = v.g('V') - v.g('L') - v.g('S') / 2;
      return [
        Readout('Formal charge', fc == 0 ? '0' : '${fc > 0 ? '+' : '−'}${fc.abs().toStringAsFixed(0)}', '', fc > 0 ? IX.positive : fc < 0 ? IX.negative : IX.green),
        Readout('Bonds', (v.g('S') / 2).toStringAsFixed(0)),
        Readout('Lone pairs', (v.g('L') / 2).toStringAsFixed(v.i('L').isOdd ? 1 : 0)),
        Readout('Electrons around', (v.g('L') + v.g('S')).toStringAsFixed(0), '', (v.g('L') + v.g('S')) == 8 ? IX.green : IX.amber),
      ];
    },
    paint: (c, s, v) {
      final v0 = v.i('V'), L = v.i('L'), S = v.i('S');
      final fc = v0 - L - S ~/ 2;
      final el = const {1: 'H', 2: 'Be', 3: 'B', 4: 'C', 5: 'N', 6: 'O', 7: 'F', 8: 'Xe'}[v0]!;
      final bonds = S ~/ 2, lp = (L + 1) ~/ 2;
      final slots = math.max(1, 4 - lp);
      final int nb = bonds == 0 ? 0 : math.min(bonds, v.i('nb', slots).clamp(1, math.max(1, math.min(slots, bonds))));
      final orders = List.generate(nb, (i) => bonds ~/ nb + (i < bonds % nb ? 1 : 0));
      final cen = Offset(s.width * 0.36, s.height * 0.5);
      const R = 210.0;
      final angles = <double>[];
      final total = nb + lp;
      for (var i = 0; i < total; i++) {
        angles.add(-math.pi / 2 + i * 2 * math.pi / math.max(total, 1) + (total == 2 ? math.pi / 2 : 0));
      }
      for (var i = 0; i < nb; i++) {
        final u = Offset(math.cos(angles[i]), math.sin(angles[i]));
        final n = Offset(-u.dy, u.dx);
        for (var k = 0; k < orders[i]; k++) {
          final off = n * (k - (orders[i] - 1) / 2) * 16;
          c.drawLine(cen + u * 70 + off, cen + u * (R - 52) + off, stroke(IX.ink, 5));
        }
        ball(c, cen + u * R, 40, const Color(0xFFCAD2DE));
        lbl(c, '·', cen + u * R, size: 18, color: IX.muted);
      }
      for (var i = 0; i < lp; i++) {
        final a = angles[nb + i];
        final u = Offset(math.cos(a), math.sin(a)), n = Offset(-u.dy, u.dx);
        final single = L.isOdd && i == lp - 1;
        for (final k in single ? [0.0] : [-1.0, 1.0]) {
          c.drawCircle(cen + u * 92 + n * k * 14, 9, fill(CX.purple));
        }
      }
      c.drawCircle(cen, 62, fill(IX.paper));
      lbl(c, el, cen, size: 72, color: IX.ink, w: FontWeight.w700);
      if (fc != 0) {
        final b = cen + const Offset(50, -48);
        c.drawCircle(b, 22, fill(fc > 0 ? IX.positive : IX.negative));
        lbl(c, '${fc.abs() == 1 ? '' : fc.abs()}${fc > 0 ? '+' : '−'}', b, size: 22, color: Colors.white, w: FontWeight.w700);
      }
      final pr = Rect.fromLTWH(s.width * 0.64, s.height / 2 - 170, s.width * 0.32, 320);
      panel(c, pr, 'Counting');
      var y = pr.top + 70;
      for (final (k, val, col) in [('V  valence electrons', '$v0', IX.ink), ('L  lone-pair electrons', '− $L', CX.purple), ('½S  half the shared', '− ${S ~/ 2}', IX.ink)]) {
        lbl(c, k, Offset(pr.left + 24, y), size: 19, align: Alignment.centerLeft);
        lbl(c, val, Offset(pr.right - 24, y), size: 26, color: col, w: FontWeight.w600, align: Alignment.centerRight);
        y += 62;
      }
      c.drawLine(Offset(pr.left + 24, y - 24), Offset(pr.right - 24, y - 24), stroke(IX.ink, 2));
      lbl(c, 'Formal charge', Offset(pr.left + 24, y + 8), size: 20, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
      lbl(c, fc == 0 ? '0' : '${fc > 0 ? '+' : '−'}${fc.abs()}', Offset(pr.right - 24, y + 8), size: 34, color: fc > 0 ? IX.positive : fc < 0 ? IX.negative : IX.green, w: FontWeight.w700, align: Alignment.centerRight);
    },
    presets: {'O₃ centre': {'V': 6, 'L': 2, 'S': 6, 'nb': 2}, 'O₃ single-bonded O': {'V': 6, 'L': 6, 'S': 2, 'nb': 1}, 'O₃ double-bonded O': {'V': 6, 'L': 4, 'S': 4, 'nb': 1}, 'N in NH₄⁺': {'V': 5, 'L': 0, 'S': 8, 'nb': 4}, 'C in CO': {'V': 4, 'L': 2, 'S': 6, 'nb': 1}},
  ),
  'ethane': Mode(
    title: 'Conformations of ethane',
    subtitle: 'Hydrocarbons · Conformations',
    formula: 'E = ½E₀(1 + cos 3φ),  E₀ = 12.5 kJ mol⁻¹',
    defaults: {'phi': 60, 'yaw': 0.45, 'pitch': -0.3},
    rotate: true,
    knobs: const [Slide('phi', 'Dihedral angle φ', 0, 360, step: 1, digits: 0, unit: '°'), Note('Staggered (φ = 60°, 180°, 300°) is lowest; eclipsed (0°, 120°, 240°) is 12.5 kJ mol⁻¹ higher. The barrier is small, so rotation is fast at room temperature.')],
    readouts: (v) {
      final phi = v.g('phi');
      final e = 6.25 * (1 + math.cos(3 * phi * math.pi / 180));
      final mod = phi % 120;
      final name = (mod - 60).abs() < 4 ? 'Staggered' : (mod < 4 || mod > 116) ? 'Eclipsed' : 'Skew';
      return [Readout('Conformation', name, '', IX.accent), Readout('Dihedral φ', phi.toStringAsFixed(0), '°'), Readout('Torsional energy', e.toStringAsFixed(1), 'kJ/mol', IX.amber), Readout('Barrier', '12.5', 'kJ/mol')];
    },
    paint: (c, s, v) {
      final phi = v.g('phi') * math.pi / 180;
      const cc = 0.77;
      final atoms = <Atom3>[const Atom3('C', P3(-cc, 0, 0)), const Atom3('C', P3(cc, 0, 0))];
      final bonds = <(int, int, int)>[(0, 1, 1)];
      for (var i = 0; i < 3; i++) {
        final a = i * 2 * math.pi / 3;
        atoms.add(Atom3('H', P3(-cc - 0.36, 1.03 * math.cos(a), 1.03 * math.sin(a))));
        bonds.add((0, atoms.length - 1, 1));
        final b = a + phi;
        atoms.add(Atom3('H', P3(cc + 0.36, 1.03 * math.cos(b), 1.03 * math.sin(b)), color: const Color(0xFFDCE3EE)));
        bonds.add((1, atoms.length - 1, 1));
      }
      final w = s.width * 0.5;
      drawMol(c, Offset(w * 0.5, s.height * 0.42), math.min(w, s.height) / 5.6, Mol3(atoms, bonds), v.g('yaw'), v.g('pitch'));
      lbl(c, 'Sawhorse model: drag to turn', Offset(w * 0.5, s.height * 0.8), size: 17, color: IX.muted);
      // Newman projection.
      final nc = Offset(w + w * 0.55, s.height * 0.28);
      const nr = 74.0;
      lbl(c, 'Newman projection', nc + const Offset(-nr - 150, -nr - 20), size: 19, color: IX.ink, w: FontWeight.w600);
      for (var i = 0; i < 3; i++) {
        final a = -math.pi / 2 + i * 2 * math.pi / 3 + phi;
        final u = Offset(math.cos(a), math.sin(a));
        c.drawLine(nc + u * nr, nc + u * (nr + 58), stroke(IX.steel, 5));
        ball(c, nc + u * (nr + 70), 14, const Color(0xFFDCE3EE), outline: true);
      }
      c.drawCircle(nc, nr, fill(IX.paper));
      c.drawCircle(nc, nr, stroke(IX.ink, 3));
      for (var i = 0; i < 3; i++) {
        final a = -math.pi / 2 + i * 2 * math.pi / 3;
        final u = Offset(math.cos(a), math.sin(a));
        c.drawLine(nc, nc + u * (nr + 58), stroke(IX.ink, 5));
        ball(c, nc + u * (nr + 70), 14, elementColor['H']!, outline: true);
      }
      c.drawCircle(nc, 8, fill(IX.ink));
      lbl(c, 'front C–H dark, back C–H grey', nc + const Offset(0, nr + 106), size: 15, color: IX.muted);
      final pr = Rect.fromLTWH(w + 90, s.height * 0.6, w - 140, s.height * 0.3);
      final pl = Plot(pr, 0, 360, 0, 14);
      pl.axes(c, x: 'Dihedral angle φ (°)', y: 'E (kJ/mol)', dx: 60, dy: 5);
      pl.curve(c, (x) => 6.25 * (1 + math.cos(3 * x * math.pi / 180)), IX.accent);
      pl.dot(c, v.g('phi'), 6.25 * (1 + math.cos(3 * phi)), IX.amber);
    },
    presets: {'Staggered': {'phi': 60}, 'Eclipsed': {'phi': 0}, 'Skew 30°': {'phi': 30}},
  ),
};

String _signed(double x) => x == 0 ? '0' : '${x > 0 ? '+' : '−'}${x.abs().toStringAsFixed(0)}';
