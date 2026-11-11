import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bench.dart';
import 'elements.dart';
import 'kit.dart';

/// The periodic table: trends in size, ionisation enthalpy and electronegativity; Döbereiner's
/// triads; IUPAC names for new elements; effective nuclear charge; the 3d series and the
/// lanthanoid contraction.

const _props = ['Covalent radius', 'Ionisation enthalpy', 'Electronegativity'];
const _units = ['pm', 'kJ/mol', ''];
double? _prop(El e, int k) => k == 0 ? e.r : k == 1 ? e.ie : e.en;

Color _heat(double f) => Color.lerp(const Color(0xFFEFF3FB), const Color(0xFF1D3F9E), f.clamp(0, 1))!;

void _table(Canvas c, Rect r, int sel, int k, {Set<int> mark = const {}}) {
  final vals = elements.where((e) => e.z <= 54).map((e) => _prop(e, k)).whereType<double>();
  final lo = vals.reduce(math.min), hi = vals.reduce(math.max);
  final cw = r.width / 18, ch = r.height / 5;
  for (final e in elements.where((e) => e.z <= 54)) {
    final cell = Rect.fromLTWH(r.left + (e.group - 1) * cw, r.top + (e.period - 1) * ch, cw - 4, ch - 4);
    final p = _prop(e, k);
    final f = p == null ? null : (p - lo) / (hi - lo);
    final on = e.z == sel;
    final inWalk = mark.contains(e.z);
    c.drawRRect(RRect.fromRectAndRadius(cell, const Radius.circular(7)), fill(f == null ? IX.page : _heat(f)));
    if (on || inWalk) c.drawRRect(RRect.fromRectAndRadius(cell.deflate(1), const Radius.circular(7)), stroke(on ? IX.amber : IX.ink.withValues(alpha: 0.5), on ? 4 : 1.6));
    final dark = f != null && f > 0.5;
    lbl(c, '${e.z}', cell.topLeft + const Offset(6, 4), size: 12, color: dark ? Colors.white70 : IX.muted, align: Alignment.topLeft);
    lbl(c, e.sym, cell.center + const Offset(0, 2), size: 21, color: dark ? Colors.white : IX.ink, w: FontWeight.w700);
    if (p != null) lbl(c, k == 2 ? p.toStringAsFixed(2) : p.toStringAsFixed(0), cell.bottomCenter + const Offset(0, -11), size: 12, color: dark ? Colors.white70 : IX.inkSoft);
  }
  // Key.
  final key = Rect.fromLTWH(r.left + cw * 2.6, r.top + 6, cw * 9, 16);
  for (var i = 0; i < 40; i++) {
    c.drawRect(Rect.fromLTWH(key.left + key.width * i / 40, key.top, key.width / 40 + 0.5, key.height), fill(_heat(i / 39)));
  }
  lbl(c, '${_props[k]}${_units[k].isEmpty ? '' : ' (${_units[k]})'}', key.bottomCenter + const Offset(0, 16), size: 15, color: IX.inkSoft, w: FontWeight.w600);
  lbl(c, k == 2 ? lo.toStringAsFixed(2) : lo.toStringAsFixed(0), key.centerLeft - const Offset(8, 0), size: 14, color: IX.inkSoft, align: Alignment.centerRight);
  lbl(c, k == 2 ? hi.toStringAsFixed(2) : hi.toStringAsFixed(0), key.centerRight + const Offset(8, 0), size: 14, color: IX.inkSoft, align: Alignment.centerLeft);
}

List<El> _walk(V v) {
  final e = el(v.i('Z', 11).clamp(1, 54));
  return v.i('walk') == 0 ? elements.where((x) => x.period == e.period && x.z <= 54).toList() : elements.where((x) => x.group == e.group && x.z <= 56).toList();
}

const _triads = [
  ('Li', 'Na', 'K', 6.94, 22.99, 39.10),
  ('Ca', 'Sr', 'Ba', 40.08, 87.62, 137.33),
  ('Cl', 'Br', 'I', 35.45, 79.90, 126.90),
  ('S', 'Se', 'Te', 32.06, 78.97, 127.60),
];

const _roots = ['nil', 'un', 'bi', 'tri', 'quad', 'pent', 'hex', 'sept', 'oct', 'enn'];
const _official = {
  100: ('Fermium', 'Fm'), 101: ('Mendelevium', 'Md'), 102: ('Nobelium', 'No'), 103: ('Lawrencium', 'Lr'), 104: ('Rutherfordium', 'Rf'), 105: ('Dubnium', 'Db'),
  106: ('Seaborgium', 'Sg'), 107: ('Bohrium', 'Bh'), 108: ('Hassium', 'Hs'), 109: ('Meitnerium', 'Mt'), 110: ('Darmstadtium', 'Ds'), 111: ('Roentgenium', 'Rg'),
  112: ('Copernicium', 'Cn'), 113: ('Nihonium', 'Nh'), 114: ('Flerovium', 'Fl'), 115: ('Moscovium', 'Mc'), 116: ('Livermorium', 'Lv'), 117: ('Tennessine', 'Ts'), 118: ('Oganesson', 'Og'),
};

/// IUPAC's temporary name: digit roots + 'ium', eliding the 'i' of bi/tri before 'ium' and the
/// 'n' of enn before nil.
(String, String) iupacName(int z) {
  final digits = '$z'.split('').map(int.parse).toList();
  var name = '';
  for (var i = 0; i < digits.length; i++) {
    var root = _roots[digits[i]];
    if (root == 'nil' && name.endsWith('enn')) root = 'il';
    name += root;
  }
  name = name.endsWith('i') ? '${name}um' : '${name}ium';
  final sym = digits.map((d) => _roots[d][0]).join();
  return ('${name[0].toUpperCase()}${name.substring(1)}', '${sym[0].toUpperCase()}${sym.substring(1)}');
}

// 3d series (Sc–Zn), NCERT Table 8.2 values.
const _d3 = ['Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn'];
const _dProps = ['Metallic radius', 'Ionisation enthalpy', 'Melting point', 'E°(M²⁺/M)', 'E°(M³⁺/M²⁺)'];
const _dUnits = ['pm', 'kJ/mol', 'K', 'V', 'V'];
const _dData = <List<double?>>[
  [164, 147, 135, 129, 137, 126, 125, 125, 128, 137],
  [631, 656, 650, 653, 717, 762, 758, 736, 745, 906],
  [1814, 1941, 2183, 2180, 1519, 1811, 1768, 1728, 1358, 693],
  [null, -1.63, -1.18, -0.90, -1.18, -0.44, -0.28, -0.25, 0.34, -0.76],
  [null, -0.37, -0.26, -0.41, 1.57, 0.77, 1.97, null, null, null],
];

// Ln³⁺ ionic radii, pm (six-coordinate, Shannon).
const _ln = ['La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu'];
const _lnR = [103.2, 101.0, 99.0, 98.3, 97.0, 95.8, 94.7, 93.8, 92.3, 91.2, 90.1, 89.0, 88.0, 86.8, 86.1];

final Map<String, Mode> periodicModes = {
  'trend': Mode(
    title: 'Periodic trends',
    subtitle: 'Classification of elements · Periodic trends',
    formula: 'across ↓ size, ↑ IE, ↑ EN',
    titleOf: (v) => '${_props[v.i('prop')]} ${v.i('walk') == 0 ? 'across period ${el(v.i('Z', 11)).period}' : 'down group ${el(v.i('Z', 11)).group}'}',
    defaults: {'Z': 11, 'prop': 1, 'walk': 0},
    knobs: const [
      Pick('prop', 'Property', ['Radius', 'Ionisation', 'Electro-\nnegativity'], ids: ['radius', 'ie', 'en']),
      Pick('walk', 'Step along', ['A period', 'A group'], ids: ['period', 'group']),
      Slide('Z', 'Element (atomic number)', 1, 54, step: 1, digits: 0),
    ],
    readouts: (v) {
      final e = el(v.i('Z', 11).clamp(1, 54));
      return [
        Readout('Element', '${e.sym}  ${e.name}', '', IX.amber),
        Readout('Covalent radius', e.r.toStringAsFixed(0), 'pm', IX.accent),
        Readout('Ionisation enthalpy', e.ie.toStringAsFixed(0), 'kJ/mol', IX.positive),
        Readout('Electronegativity', e.en?.toStringAsFixed(2) ?? '—', '', IX.green),
        Readout('Period, group', '${e.period}, ${e.group}'),
      ];
    },
    paint: (c, s, v) {
      final k = v.i('prop'), z = v.i('Z', 11).clamp(1, 54);
      final walk = _walk(v);
      _table(c, Rect.fromLTWH(30, 26, s.width - 60, s.height * 0.44), z, k, mark: {for (final e in walk) e.z});
      final data = [for (final e in walk) (e.sym, _prop(e, k) ?? 0, e.z == z ? IX.amber : CX.series[k == 0 ? 0 : k == 1 ? 1 : 2])];
      final br = Rect.fromLTWH(110, s.height * 0.52 + 40, s.width - 160, s.height * 0.48 - 120);
      bars(c, br, data, fmt: (x) => x == 0 ? '—' : k == 2 ? x.toStringAsFixed(2) : x.toStringAsFixed(0), yLabel: '${_props[k]}${_units[k].isEmpty ? '' : ' (${_units[k]})'}', title: v.i('walk') == 0 ? 'Across period ${el(z).period}' : 'Down group ${el(z).group}', hi: walk.indexWhere((e) => e.z == z));
    },
    presets: {'Period 3, IE': {'Z': 11, 'prop': 1, 'walk': 0}, 'Period 2, radius': {'Z': 3, 'prop': 0, 'walk': 0}, 'Group 1, radius': {'Z': 11, 'prop': 0, 'walk': 1}, 'Group 17, EN': {'Z': 9, 'prop': 2, 'walk': 1}, 'Group 2, IE': {'Z': 12, 'prop': 1, 'walk': 1}},
  ),
  'triads': Mode(
    title: "Döbereiner's triads",
    subtitle: 'Classification of elements · Early classification',
    formula: 'middle ≈ ½(first + third)',
    defaults: {'t': 0},
    knobs: const [Pick('t', 'Triad', ['Li  Na  K', 'Ca  Sr  Ba', 'Cl  Br  I', 'S  Se  Te'], ids: ['LiNaK', 'CaSrBa', 'ClBrI', 'SSeTe'])],
    readouts: (v) {
      final t = _triads[v.i('t').clamp(0, 3)];
      final mean = (t.$4 + t.$6) / 2;
      return [Readout('Mean of 1st and 3rd', mean.toStringAsFixed(2), 'u', IX.accent), Readout('Middle element', t.$5.toStringAsFixed(2), 'u', IX.green), Readout('Difference', (t.$5 - mean).abs().toStringAsFixed(2), 'u', IX.amber), Readout('Error', '${((t.$5 - mean).abs() / t.$5 * 100).toStringAsFixed(1)} %')];
    },
    paint: (c, s, v) {
      final t = _triads[v.i('t').clamp(0, 3)];
      final syms = [t.$1, t.$2, t.$3], ms = [t.$4, t.$5, t.$6];
      final mean = (t.$4 + t.$6) / 2;
      final cw = 230.0, gap = 70.0;
      final x0 = s.width / 2 - (3 * cw + 2 * gap) / 2;
      for (var i = 0; i < 3; i++) {
        final r = Rect.fromLTWH(x0 + i * (cw + gap), 70, cw, 250);
        final col = i == 1 ? IX.green : IX.accent;
        c.drawRRect(RRect.fromRectAndRadius(r.shift(const Offset(0, 6)), const Radius.circular(20)), Paint()..color = const Color(0x1413165A)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10));
        c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(20)), fill(IX.paper));
        c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(20)), stroke(col, 3));
        lbl(c, syms[i], r.center + const Offset(0, -26), size: 90, color: IX.ink, w: FontWeight.w600);
        lbl(c, '${ms[i].toStringAsFixed(2)} u', r.bottomCenter + const Offset(0, -40), size: 26, color: col, w: FontWeight.w600);
      }
      // Number line of atomic mass.
      final pl = Plot(Rect.fromLTWH(120, s.height * 0.62, s.width - 240, 10), 0, 140, 0, 1);
      c.drawLine(pl.p(0, 0), pl.p(140, 0), stroke(IX.ink, 3));
      for (var m = 0; m <= 140; m += 20) {
        c.drawLine(pl.p(m.toDouble(), 0) + const Offset(0, -10), pl.p(m.toDouble(), 0) + const Offset(0, 10), stroke(IX.ink, 2));
        lbl(c, '$m', pl.p(m.toDouble(), 0) + const Offset(0, 32), size: 16);
      }
      lbl(c, 'Atomic mass (u)', pl.p(70, 0) + const Offset(0, 70), size: 17);
      for (var i = 0; i < 3; i++) {
        final p = pl.p(ms[i], 0);
        ball(c, p, 14, i == 1 ? IX.green : IX.accent);
        lbl(c, syms[i], p + const Offset(0, -36), size: 22, color: IX.ink, w: FontWeight.w700);
      }
      final pm = pl.p(mean, 0);
      c.drawLine(pm + const Offset(0, -60), pm + const Offset(0, 20), stroke(IX.amber, 3));
      lbl(c, 'mean ${mean.toStringAsFixed(1)}', pm + const Offset(0, -76), size: 19, color: IX.amber, w: FontWeight.w700, halo: true);
      lbl(c, '½(${ms[0].toStringAsFixed(2)} + ${ms[2].toStringAsFixed(2)}) = ${mean.toStringAsFixed(2)}  ≈  ${ms[1].toStringAsFixed(2)}', Offset(s.width / 2, 370), size: 26, color: IX.ink, w: FontWeight.w600);
    },
    presets: {'Li, Na, K': {'t': 0}, 'Ca, Sr, Ba': {'t': 1}, 'Cl, Br, I': {'t': 2}},
  ),
  'iupac': Mode(
    title: 'IUPAC names for new elements',
    subtitle: 'Classification of elements · Nomenclature of Z > 100',
    formula: '0 nil 1 un 2 bi 3 tri 4 quad 5 pent 6 hex 7 sept 8 oct 9 enn',
    defaults: {'Z': 114},
    knobs: const [Slide('Z', 'Atomic number Z', 100, 130, step: 1, digits: 0)],
    readouts: (v) {
      final z = v.i('Z', 114);
      final (n, sy) = iupacName(z);
      final off = _official[z];
      return [Readout('IUPAC name', n, '', IX.accent), Readout('Symbol', sy, '', IX.green), Readout('Official name', off == null ? 'not yet named' : '${off.$1} (${off.$2})')];
    },
    paint: (c, s, v) {
      final z = v.i('Z', 114);
      final digits = '$z'.split('').map(int.parse).toList();
      final (n, sy) = iupacName(z);
      final cw = 220.0;
      final x0 = s.width / 2 - digits.length * cw / 2;
      for (var i = 0; i < digits.length; i++) {
        final r = Rect.fromLTWH(x0 + i * cw + 15, 80, cw - 30, 150);
        c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(18)), fill(IX.accentSoft));
        lbl(c, '${digits[i]}', r.center, size: 90, color: IX.accent, w: FontWeight.w700);
        IxPaint.arrow(c, r.bottomCenter + const Offset(0, 14), r.bottomCenter + const Offset(0, 74), IX.muted, width: 3);
        final root = _roots[digits[i]];
        tag(c, root, r.bottomCenter + const Offset(0, 110), IX.ink, size: 30);
      }
      lbl(c, '+ ium', Offset(x0 + digits.length * cw + 40, 340), size: 30, color: IX.inkSoft, w: FontWeight.w600, align: Alignment.centerLeft);
      final card = Rect.fromCenter(center: Offset(s.width / 2, s.height * 0.72), width: 560, height: 260);
      c.drawRRect(RRect.fromRectAndRadius(card, const Radius.circular(22)), fill(IX.paper));
      c.drawRRect(RRect.fromRectAndRadius(card, const Radius.circular(22)), stroke(IX.ink, 3));
      lbl(c, '$z', card.topLeft + const Offset(26, 20), size: 30, color: IX.inkSoft, w: FontWeight.w600, align: Alignment.topLeft);
      lbl(c, sy, card.center + const Offset(0, -16), size: 110, color: IX.ink, w: FontWeight.w600);
      lbl(c, n, card.bottomCenter + const Offset(0, -34), size: 30, color: IX.accent, w: FontWeight.w600);
      final off = _official[z];
      if (off != null) lbl(c, 'Now named ${off.$1} (${off.$2})', card.bottomCenter + const Offset(0, 36), size: 20, color: IX.muted);
    },
    presets: {'Z = 101': {'Z': 101}, 'Z = 109': {'Z': 109}, 'Z = 114': {'Z': 114}, 'Z = 120': {'Z': 120}},
  ),
  'zeff': Mode(
    title: 'Effective nuclear charge and size',
    subtitle: 'Classification of elements · Atomic radius',
    formula: 'r = 52.9 n² / Z_eff pm',
    defaults: {'n': 2, 'Z': 2.6},
    knobs: const [Slide('n', 'Shell n', 1, 4, step: 1, digits: 0), Slide('Z', 'Effective nuclear charge Z_eff', 1, 8, step: 0.05, digits: 2), Note('Across a period n is fixed and Z_eff rises, so the atom shrinks and holds its electron more tightly.')],
    readouts: (v) {
      final n = v.g('n', 2), z = v.g('Z', 2.6);
      final r = 52.9 * n * n / z, ie = 13.6 * z * z / (n * n);
      return [Readout('Radius', r.toStringAsFixed(1), 'pm', IX.accent), Readout('Ionisation energy', ie.toStringAsFixed(1), 'eV', IX.positive), Readout('In kJ/mol', (ie * 96.485).toStringAsFixed(0), 'kJ/mol'), Readout('Z_eff', z.toStringAsFixed(2), '', IX.amber)];
    },
    paint: (c, s, v) {
      final n = v.g('n', 2), z = v.g('Z', 2.6);
      final r = 52.9 * n * n / z;
      final o = Offset(s.width * 0.25, s.height / 2);
      final px = math.min(s.width * 0.22, s.height * 0.42) / 200;
      c.drawCircle(o, r * px, fill(IX.accentSoft));
      c.drawCircle(o, r * px, stroke(IX.accent, 3));
      ball(c, o + Offset(r * px, 0), 12, IX.accent);
      c.drawLine(o, o + Offset(r * px, 0), stroke(IX.inkSoft, 2));
      lbl(c, '${r.toStringAsFixed(0)} pm', o + Offset(r * px / 2, -18), size: 18, color: IX.ink, w: FontWeight.w600, halo: true);
      ball(c, o, 18, IX.positive);
      lbl(c, '+${z.toStringAsFixed(1)}', o + const Offset(0, 36), size: 18, color: IX.positive, w: FontWeight.w700, halo: true);
      lbl(c, 'Scale: 200 pm', Offset(o.dx, s.height - 40), size: 15, color: IX.muted);
      c.drawLine(Offset(o.dx - 100 * px, s.height - 62), Offset(o.dx + 100 * px, s.height - 62), stroke(IX.muted, 3));
      final pr = Rect.fromLTWH(s.width * 0.56, 70, s.width * 0.38, s.height - 180);
      final pl = Plot(pr, 1, 8, 0, 400);
      pl.axes(c, x: 'Z_eff', y: 'Radius (pm)', dx: 1, dy: 100, title: 'Radius against Z_eff, n = ${n.toInt()}');
      for (var k = 1; k <= 4; k++) {
        pl.curve(c, (x) => 52.9 * k * k / x, k == n.round() ? IX.accent : IX.rule, w: k == n.round() ? 4 : 2.5);
      }
      pl.dot(c, z, r, IX.amber, label: '${r.toStringAsFixed(0)} pm');
    },
    presets: {'H (n 1, Z_eff 1)': {'n': 1, 'Z': 1}, 'Li (n 2, Z_eff 1.3)': {'n': 2, 'Z': 1.3}, 'F (n 2, Z_eff 5.1)': {'n': 2, 'Z': 5.1}, 'Na (n 3, Z_eff 2.5)': {'n': 3, 'Z': 2.5}},
  ),
  'dblock': Mode(
    title: 'Trends across the 3d series',
    subtitle: 'd- and f-block elements · 3d series',
    titleOf: (v) => '${_dProps[v.i('prop')]} across the 3d series',
    defaults: {'prop': 2, 'Z': 25},
    knobs: const [Pick('prop', 'Property', ['Radius', 'Ionisation', 'Melting point', 'E°(M²⁺/M)', 'E°(M³⁺/M²⁺)'], ids: ['radius', 'ie', 'mp', 'e2', 'e3'], chips: true), Slide('Z', 'Element', 21, 30, step: 1, fmt: _dName)],
    readouts: (v) {
      final i = (v.i('Z', 25) - 21).clamp(0, 9);
      final z = 21 + i;
      String f(int k) => _dData[k][i] == null ? '—' : k >= 3 ? sgn(_dData[k][i]!, 2) : _dData[k][i]!.toStringAsFixed(0);
      return [
        Readout('Element', '${el(z).name} (${el(z).sym})', '', IX.amber),
        Readout('Configuration', configText(z), '', IX.accent),
        Readout('Melting point', f(2), 'K'),
        Readout('Metallic radius', f(0), 'pm'),
        Readout('E°(M²⁺/M)', f(3), 'V'),
        Readout('E°(M³⁺/M²⁺)', f(4), 'V'),
      ];
    },
    paint: (c, s, v) {
      final k = v.i('prop'), i = (v.i('Z', 25) - 21).clamp(0, 9);
      final vals = _dData[k];
      final signed = k >= 3;
      final lo = signed ? (k == 3 ? -2.0 : -1.0) : 0.0, hi = signed ? (k == 3 ? 0.6 : 2.2) : vals.whereType<double>().reduce(math.max) * 1.15;
      final r = Rect.fromLTWH(140, 80, s.width - 220, s.height - 200);
      if (!signed) {
        bars(c, r, [for (var j = 0; j < 10; j++) (_d3[j], vals[j] ?? 0, j == i ? IX.amber : IX.accent)], max: hi, hi: i, yLabel: '${_dProps[k]} (${_dUnits[k]})', fmt: (x) => x.toStringAsFixed(0));
      } else {
        final pl = Plot(r, 0, 10, lo, hi);
        final g = Paint()..color = IX.grid..strokeWidth = 1;
        for (var y = lo; y <= hi + 1e-9; y += 0.5) {
          c.drawLine(pl.p(0, y), pl.p(10, y), g);
          lbl(c, sgn(y, 1), pl.p(0, y) - const Offset(10, 0), size: 15, align: Alignment.centerRight);
        }
        c.drawLine(pl.p(0, 0), pl.p(10, 0), stroke(IX.ink, 2));
        for (var j = 0; j < 10; j++) {
          final x = j + 0.5;
          lbl(c, _d3[j], pl.p(x, lo) + const Offset(0, 20), size: 18, color: j == i ? IX.ink : IX.inkSoft, w: FontWeight.w600);
          final val = vals[j];
          if (val == null) {
            lbl(c, '—', pl.p(x, 0) + const Offset(0, -16), size: 18, color: IX.muted);
            continue;
          }
          final b = Rect.fromPoints(pl.p(x - 0.32, 0), pl.p(x + 0.32, val));
          c.drawRRect(RRect.fromRectAndRadius(b, const Radius.circular(6)), fill(j == i ? IX.amber : val >= 0 ? IX.positive : IX.accent));
          lbl(c, sgn(val, 2), Offset(b.center.dx, val >= 0 ? b.top - 16 : b.bottom + 16), size: 16, color: IX.ink, w: FontWeight.w600);
        }
        c.save();
        c.translate(r.left - 70, r.center.dy);
        c.rotate(-math.pi / 2);
        lbl(c, '${_dProps[k]} (V)', Offset.zero, size: 17);
        c.restore();
        lbl(c, k == 3 ? 'Negative E°: the metal gives H₂ with 1 M acid (all but Cu)' : 'High E°: Mn³⁺ and Co³⁺ are strong oxidising agents (Mn²⁺ is d⁵, very stable)', Offset(r.center.dx, r.top - 30), size: 18, color: IX.inkSoft, w: FontWeight.w600);
      }
      if (k == 2) lbl(c, 'Peak near the middle (most unpaired d electrons for metallic bonding); dip at Mn; Zn lowest (3d¹⁰)', Offset(r.center.dx, r.top - 30), size: 18, color: IX.inkSoft, w: FontWeight.w600);
    },
    presets: {'Melting points': {'prop': 2, 'Z': 25}, 'Radii': {'prop': 0, 'Z': 26}, 'E°(M²⁺/M)': {'prop': 3, 'Z': 29}, 'E°(M³⁺/M²⁺)': {'prop': 4, 'Z': 25}},
  ),
  'lanthanoid': Mode(
    title: 'The lanthanoid contraction',
    subtitle: 'd- and f-block elements · Lanthanoids',
    formula: 'Ln³⁺ radius falls La → Lu',
    defaults: {'i': 0},
    knobs: const [Slide('i', 'Lanthanoid', 0, 14, step: 1, fmt: _lnName), Note('Each added 4f electron shields the others poorly, so the effective nuclear charge grows and the ions shrink steadily. As a result Zr (160 pm) and Hf (159 pm) are almost the same size.')],
    readouts: (v) {
      final i = v.i('i').clamp(0, 14);
      return [Readout('Ion', '${_ln[i]}³⁺', '', IX.amber), Readout('Z', '${57 + i}'), Readout('Ionic radius', _lnR[i].toStringAsFixed(1), 'pm', IX.accent), Readout('4f electrons in Ln³⁺', '$i', '', CX.purple), Readout('Shrinkage from La³⁺', (_lnR[0] - _lnR[i]).toStringAsFixed(1), 'pm')];
    },
    paint: (c, s, v) {
      final i = v.i('i').clamp(0, 14);
      final pr = Rect.fromLTWH(130, 80, s.width * 0.56, s.height - 200);
      final pl = Plot(pr, 56.5, 71.5, 84, 106);
      pl.axes(c, x: 'Atomic number', y: 'Ln³⁺ ionic radius (pm)', dx: 2, dy: 4, fx: (x) => x.round().isOdd ? '${x.round()} ${_ln[x.round() - 57]}' : '');
      pl.line(c, [for (var j = 0; j < 15; j++) Offset(57.0 + j, _lnR[j])], IX.accent);
      for (var j = 0; j < 15; j++) {
        pl.dot(c, 57.0 + j, _lnR[j], j == i ? IX.amber : IX.accent, r0: j == i ? 9 : 5);
      }
      // Ions to scale.
      final x0 = s.width * 0.76;
      for (final (k, j) in [0, i, 14].indexed) {
        final o = Offset(x0 + 120, 170 + k * 230.0);
        final rr = _lnR[j] * 0.9;
        ball(c, o, rr, j == i ? IX.amber : const Color(0xFF7D8FBF));
        lbl(c, '${_ln[j]}³⁺', o, size: 26, color: Colors.white, w: FontWeight.w700);
        lbl(c, '${_lnR[j].toStringAsFixed(1)} pm', o + Offset(-rr - 14, 0), size: 17, color: IX.inkSoft, align: Alignment.centerRight);
      }
    },
    presets: {'La³⁺': {'i': 0}, 'Gd³⁺': {'i': 7}, 'Lu³⁺': {'i': 14}},
  ),
};

String _dName(double z) => el(z.round()).sym;
String _lnName(double i) => '${_ln[i.round().clamp(0, 14)]} (${57 + i.round()})';
