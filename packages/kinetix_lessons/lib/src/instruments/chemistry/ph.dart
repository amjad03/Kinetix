import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bench.dart';
import 'kit.dart';

/// Acids, bases and pH: the pH scale, buffers against water, Henderson's equation, how ionised
/// an acid (or protonated a base) is at a given pH, and the pH of weak acid and base solutions.

/// Universal-indicator colour for a pH, kept soft for the board.
Color uiColor(double ph) {
  const stops = [Color(0xFFC8372D), Color(0xFFE0682A), Color(0xFFEBB437), Color(0xFF8DBE45), Color(0xFF2E9E6A), Color(0xFF2F78B5), Color(0xFF5B4BA6)];
  final f = (ph.clamp(0, 14) / 14) * (stops.length - 1);
  final i = f.floor().clamp(0, stops.length - 2);
  return Color.lerp(stops[i], stops[i + 1], f - i)!;
}

void _scale(Canvas c, Rect r, double ph, {String? label, double? second, String? secondLabel}) {
  for (var i = 0; i < 140; i++) {
    c.drawRect(Rect.fromLTWH(r.left + r.width * i / 140, r.top, r.width / 140 + 0.6, r.height), fill(uiColor(i / 10)));
  }
  c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(10)), stroke(IX.ink.withValues(alpha: 0.25), 1.5));
  for (var p = 0; p <= 14; p++) {
    final x = r.left + r.width * p / 14;
    c.drawLine(Offset(x, r.bottom), Offset(x, r.bottom + 10), stroke(IX.ink, 2));
    lbl(c, '$p', Offset(x, r.bottom + 26), size: 17, color: IX.ink, w: FontWeight.w600);
  }
  lbl(c, 'acidic', Offset(r.left + r.width * 0.15, r.bottom + 58), size: 16, color: IX.positive, w: FontWeight.w600);
  lbl(c, 'neutral', Offset(r.center.dx, r.bottom + 58), size: 16, color: IX.green, w: FontWeight.w600);
  lbl(c, 'basic', Offset(r.left + r.width * 0.85, r.bottom + 58), size: 16, color: IX.accent, w: FontWeight.w600);
  void mark(double p, String t, double dy) {
    final x = r.left + r.width * p.clamp(0, 14) / 14;
    final path = Path()..moveTo(x, r.top - 4)..lineTo(x - 14, r.top - 26)..lineTo(x + 14, r.top - 26)..close();
    c.drawPath(path, fill(IX.ink));
    lbl(c, t, Offset(x, r.top - 44 - dy), size: 20, color: IX.ink, w: FontWeight.w700, halo: true);
  }

  if (second != null) mark(second, secondLabel ?? '', 34);
  mark(ph, label ?? 'pH ${ph.toStringAsFixed(2)}', 0);
}

class _Cpd {
  const _Cpd(this.name, this.pk, {this.base = false});
  final String name;
  final double pk; // pKa of the acid, or of the conjugate acid RNH₃⁺ for a base
  final bool base;
}

const _cpds = [
  _Cpd('Ethanol', 15.9),
  _Cpd('Phenol', 10.0),
  _Cpd('4-Nitrophenol', 7.15),
  _Cpd('Acetic acid', 4.76),
  _Cpd('Benzoic acid', 4.19),
  _Cpd('Formic acid', 3.75),
  _Cpd('Chloroacetic acid', 2.86),
  _Cpd('Trichloroacetic acid', 0.65),
  _Cpd('Ammonia', 9.25, base: true),
  _Cpd('Methylamine', 10.64, base: true),
  _Cpd('Dimethylamine', 10.73, base: true),
  _Cpd('Aniline', 4.62, base: true),
];

double _strongPh(int kind, double conc) {
  // [H⁺] including water's own ions (matters for very dilute solutions).
  const kw = 1e-14;
  if (kind == 2) return 7;
  final h = conc / 2 + math.sqrt(conc * conc / 4 + kw);
  return kind == 0 ? -math.log(h) / math.ln10 : 14 + math.log(h) / math.ln10;
}

final Map<String, Mode> phModes = {
  'scale': Mode(
    title: 'pH of acids, bases and water',
    subtitle: 'Equilibrium · Ionisation of water and pH',
    formula: 'pH = −log[H₃O⁺],   pH + pOH = 14 (298 K)',
    titleOf: (v) => v.i('kind') == 2 ? 'Pure water' : '${v.i('kind') == 0 ? 'HCl' : 'NaOH'}, ${_concText(v)}',
    defaults: {'kind': 0, 'C': 1, 'n': 2},
    knobs: const [
      Pick('kind', 'Solution', ['HCl (strong acid)', 'NaOH (strong base)', 'Pure water'], ids: ['HCl', 'NaOH', 'water']),
      Slide('C', 'Concentration: C', 1, 9.9, digits: 1, step: 0.1),
      Slide('n', '× 10⁻ⁿ mol/L, n =', 0, 10, step: 1, digits: 0),
      Note('A very dilute acid never goes above pH 7: water itself supplies 10⁻⁷ mol/L of H₃O⁺.'),
    ],
    readouts: (v) {
      final k = v.i('kind'), conc = v.g('C', 1) * math.pow(10, -v.g('n', 2));
      final ph = _strongPh(k, conc);
      return [
        Readout('pH', ph.toStringAsFixed(2), '', uiColor(ph)),
        Readout('pOH', (14 - ph).toStringAsFixed(2)),
        Readout('[H₃O⁺]', sx(math.pow(10, -ph).toDouble()), 'mol/L', IX.positive),
        Readout('[OH⁻]', sx(math.pow(10, ph - 14).toDouble()), 'mol/L', IX.accent),
        Readout('If [H⁺] = C', (-math.log(conc) / math.ln10).toStringAsFixed(2), 'pH'),
        Readout('If [OH⁻] = C', (14 + math.log(conc) / math.ln10).toStringAsFixed(2), 'pH'),
      ];
    },
    paint: (c, s, v) {
      final k = v.i('kind'), conc = v.g('C', 1) * math.pow(10, -v.g('n', 2));
      final ph = _strongPh(k, conc);
      beaker(c, Rect.fromLTWH(s.width * 0.08, 70, s.width * 0.26, s.height * 0.52), 0.7, uiColor(ph).withValues(alpha: 0.85), label: k == 2 ? 'water + universal indicator' : '${k == 0 ? 'HCl' : 'NaOH'} + universal indicator');
      // Ion bars on a log scale.
      final pr = Rect.fromLTWH(s.width * 0.5, 80, s.width * 0.44, s.height * 0.5);
      final h = -math.log(math.pow(10, -ph)) / math.ln10, oh = 14 - ph;
      final pl = Plot(pr, 0, 2, 0, 14);
      pl.axes(c, y: '−log of concentration', dy: 2, fx: (_) => '', dx: 1);
      for (final (i, name, val, col) in [(0, 'H₃O⁺', h, IX.positive), (1, 'OH⁻', oh, IX.accent)]) {
        final b = Rect.fromPoints(pl.p(i + 0.25, 14), pl.p(i + 0.75, val));
        c.drawRRect(RRect.fromRectAndRadius(b, const Radius.circular(8)), fill(col.withValues(alpha: 0.85)));
        lbl(c, name, pl.p(i + 0.5, 0) + const Offset(0, 22), size: 20, color: col, w: FontWeight.w700);
        lbl(c, '10${sup('-${val.toStringAsFixed(1)}')}', Offset(b.center.dx, b.bottom + 18), size: 18, color: IX.ink, w: FontWeight.w600, halo: true);
      }
      lbl(c, 'Shorter bar = more ions (the axis runs downward: 10⁰ at top)', Offset(pr.center.dx, pr.top - 26), size: 16, color: IX.muted);
      _scale(c, Rect.fromLTWH(70, s.height - 150, s.width - 140, 40), ph);
    },
    presets: {'0.01 M HCl': {'kind': 0, 'C': 1, 'n': 2}, '0.001 M NaOH': {'kind': 1, 'C': 1, 'n': 3}, '10⁻⁸ M HCl': {'kind': 0, 'C': 1, 'n': 8}, 'Pure water': {'kind': 2}},
  ),
  'buffer': Mode(
    title: 'How a buffer resists pH change',
    subtitle: 'Equilibrium · Buffer solutions',
    formula: 'pH = pKa + log([CH₃COO⁻]/[CH₃COOH])',
    defaults: {'add': 0},
    knobs: [
      Act('Add HCl', (v) => v['add'] = (v.g('add') + 0.01).clamp(-0.2, 0.2), icon: Icons.add_rounded),
      Act('Add NaOH', (v) => v['add'] = (v.g('add') - 0.01).clamp(-0.2, 0.2), icon: Icons.add_rounded),
      Act('Reset', (v) => v['add'] = 0, icon: Icons.replay_rounded),
      const Slide('add', 'Acid added (+) or base added (−)', -0.2, 0.2, unit: 'mol', digits: 2, step: 0.01),
      const Note('1 L of buffer: 0.10 M CH₃COOH + 0.10 M CH₃COONa (pKa 4.76), beside 1 L of pure water.'),
    ],
    readouts: (v) {
      final a = v.g('add');
      return [Readout('Buffer pH', _bufPh(a).toStringAsFixed(2), '', uiColor(_bufPh(a))), Readout('Water pH', _waterPh(a).toStringAsFixed(2), '', uiColor(_waterPh(a))), Readout('Added', a == 0 ? 'nothing' : '${a.abs().toStringAsFixed(2)} mol ${a > 0 ? 'HCl' : 'NaOH'}'), Readout('Buffer change', sgn(_bufPh(a) - 4.76, 2), 'pH units', IX.green)];
    },
    paint: (c, s, v) {
      final a = v.g('add');
      final bw = s.width * 0.18;
      beaker(c, Rect.fromLTWH(60, 90, bw, s.height * 0.42), 0.7, uiColor(_bufPh(a)).withValues(alpha: 0.85), label: 'buffer  pH ${_bufPh(a).toStringAsFixed(2)}');
      beaker(c, Rect.fromLTWH(100 + bw, 90, bw, s.height * 0.42), 0.7, uiColor(_waterPh(a)).withValues(alpha: 0.85), label: 'water  pH ${_waterPh(a).toStringAsFixed(2)}');
      lbl(c, a > 0 ? 'Acetate ions mop up the added H⁺:  CH₃COO⁻ + H⁺ → CH₃COOH' : a < 0 ? 'Acetic acid neutralises the added OH⁻:  CH₃COOH + OH⁻ → CH₃COO⁻ + H₂O' : 'Add acid or base 0.01 mol at a time', Offset(60, s.height * 0.42 + 160), size: 18, color: IX.inkSoft, w: FontWeight.w600, align: Alignment.centerLeft);
      final pr = Rect.fromLTWH(s.width * 0.55, 70, s.width * 0.4, s.height - 180);
      final pl = Plot(pr, -0.2, 0.2, 0, 14);
      pl.axes(c, x: 'NaOH added (mol)   ←  0  →   HCl added (mol)', y: 'pH', dx: 0.05, dy: 2, fx: (x) => x.abs().toStringAsFixed(2));
      pl.curve(c, _bufPh, IX.green);
      pl.curve(c, _waterPh, IX.accent);
      pl.dot(c, a, _bufPh(a), IX.green);
      pl.dot(c, a, _waterPh(a), IX.accent);
      pl.legend(c, [('buffer', IX.green), ('water', IX.accent)], right: true, at: pr.topRight + const Offset(0, 22));
    },
    presets: {'Nothing added': {'add': 0}, '+0.05 mol HCl': {'add': 0.05}, '+0.05 mol NaOH': {'add': -0.05}},
  ),
  'henderson': Mode(
    title: 'Buffer pH and weak-acid pH',
    subtitle: 'Equilibrium · Buffer solutions',
    formula: 'pH = pKa + log([salt]/[acid])',
    defaults: {'pka': 4.76, 'lr': 0, 'c': 0.1},
    knobs: const [
      Slide('pka', 'pKa of the acid', 2, 11, digits: 2, step: 0.01),
      Slide('lr', 'log([salt]/[acid])', -2, 2, digits: 2, step: 0.05),
      Slide('c', 'Acid alone: concentration', 0.001, 1, unit: 'mol/L', digits: 3, step: 0.001),
    ],
    readouts: (v) {
      final pka = v.g('pka', 4.76), c0 = v.g('c', 0.1);
      final ka = math.pow(10, -pka).toDouble();
      final alpha = math.min(1.0, math.sqrt(ka / c0));
      return [Readout('Buffer pH', (pka + v.g('lr')).toStringAsFixed(2), '', IX.green), Readout('[salt]/[acid]', math.pow(10, v.g('lr')).toStringAsFixed(2)), Readout('Weak acid alone, pH', (0.5 * (pka - math.log(c0) / math.ln10)).toStringAsFixed(2), '', IX.accent), Readout('Degree of ionisation', (alpha * 100).toStringAsFixed(2), '%', IX.amber)];
    },
    paint: (c, s, v) {
      final pka = v.g('pka', 4.76), lr = v.g('lr');
      final pr = Rect.fromLTWH(140, 70, s.width * 0.55, s.height - 180);
      final pl = Plot(pr, -2, 2, pka - 3, pka + 3);
      pl.axes(c, x: 'log([salt]/[acid])', y: 'pH', dx: 0.5, dy: 1);
      c.drawRect(Rect.fromLTRB(pl.px(-1), pr.top, pl.px(1), pr.bottom), fill(IX.green.withValues(alpha: 0.07)));
      lbl(c, 'useful buffer range: pKa ± 1', Offset(pl.px(0), pr.top + 20), size: 16, color: IX.green, w: FontWeight.w600);
      pl.curve(c, (x) => pka + x, IX.green);
      pl.hline(c, pka, IX.muted, label: 'pH = pKa when [salt] = [acid]', right: false);
      pl.dot(c, lr, pka + lr, IX.amber, label: 'pH ${(pka + lr).toStringAsFixed(2)}');
      // Ratio picture.
      final r = math.pow(10, lr).toDouble();
      final total = 20;
      final ns = (total * r / (1 + r)).round();
      final box = Rect.fromLTWH(s.width * 0.78, 100, s.width * 0.18, s.height - 260);
      c.drawRRect(RRect.fromRectAndRadius(box, const Radius.circular(18)), fill(const Color(0xFFF5F8FC)));
      c.drawRRect(RRect.fromRectAndRadius(box, const Radius.circular(18)), stroke(IX.glassEdge, 2));
      for (var i = 0; i < total; i++) {
        final p = Offset(box.left + 26 + (i % 4) * (box.width - 52) / 3, box.top + 34 + (i ~/ 4) * (box.height - 68) / 4);
        tag(c, i < ns ? 'A⁻' : 'HA', p, i < ns ? IX.positive : IX.accent, size: 15);
      }
      lbl(c, 'salt A⁻ : acid HA', box.bottomCenter + const Offset(0, 24), size: 17, color: IX.ink, w: FontWeight.w600);
    },
    presets: {'Equal amounts': {'pka': 4.76, 'lr': 0}, 'Salt 10×': {'pka': 4.76, 'lr': 1}, 'Acid 10×': {'pka': 4.76, 'lr': -1}, 'NH₄⁺/NH₃': {'pka': 9.25, 'lr': 0}},
  ),
  'species': Mode(
    title: 'How much is ionised at this pH?',
    subtitle: 'Acids and bases · pKa and pH',
    formula: 'half ionised when pH = pKa',
    titleOf: (v) {
      final x = _cpds[v.i('cpd', 3).clamp(0, _cpds.length - 1)];
      return x.base ? '${x.name}: protonated or free base?' : '${x.name}: how much is ionised?';
    },
    defaults: {'cpd': 3, 'pH': 7},
    knobs: [Pick('cpd', 'Compound', [for (final x in _cpds) x.name], ids: [for (final x in _cpds) x.name.toLowerCase().replaceAll(' ', '-')], chips: true), const Slide('pH', 'pH of the solution', 0, 14, digits: 1, step: 0.1)],
    readouts: (v) {
      final x = _cpds[v.i('cpd', 3).clamp(0, _cpds.length - 1)];
      final ph = v.g('pH', 7);
      final frac = x.base ? 1 / (1 + math.pow(10, ph - x.pk)) : 1 / (1 + math.pow(10, x.pk - ph));
      return [
        Readout(x.base ? 'pKa of RNH₃⁺' : 'pKa', x.pk.toStringAsFixed(2), '', IX.amber),
        if (x.base) Readout('pKb', (14 - x.pk).toStringAsFixed(2)),
        Readout(x.base ? 'Protonated (RNH₃⁺)' : 'Ionised (A⁻)', (frac * 100).toStringAsFixed(frac < 0.001 || frac > 0.999 ? 3 : 1), '%', IX.accent),
        Readout(x.base ? 'Free base' : 'Un-ionised', ((1 - frac) * 100).toStringAsFixed(frac < 0.001 || frac > 0.999 ? 3 : 1), '%'),
      ];
    },
    paint: (c, s, v) {
      final x = _cpds[v.i('cpd', 3).clamp(0, _cpds.length - 1)];
      final ph = v.g('pH', 7);
      double f(double p, _Cpd y) => 100 * (y.base ? 1 / (1 + math.pow(10, p - y.pk)) : 1 / (1 + math.pow(10, y.pk - p)));
      final pr = Rect.fromLTWH(140, 70, s.width * 0.62, s.height - 180);
      final pl = Plot(pr, 0, 14, 0, 100);
      pl.axes(c, x: 'pH', y: x.base ? 'Per cent protonated (RNH₃⁺)' : 'Per cent ionised', dx: 1, dy: 25);
      for (final y in _cpds.where((y) => y.base == x.base && y != x)) {
        pl.curve(c, (p) => f(p, y), IX.rule, w: 2.5);
        if (y.pk > 0.5 && y.pk < 13.5) lbl(c, y.name, pl.p(y.pk, 50) + const Offset(6, -12), size: 13, color: IX.muted, align: Alignment.centerLeft);
      }
      pl.curve(c, (p) => f(p, x), IX.accent, w: 5);
      if (x.pk <= 14) pl.vline(c, x.pk, IX.amber, label: 'pKa ${x.pk.toStringAsFixed(2)}');
      pl.hline(c, 50, IX.muted);
      pl.dot(c, ph, f(ph, x), IX.amber, label: '${f(ph, x).toStringAsFixed(1)} %');
      // Species card.
      final card = Rect.fromLTWH(s.width * 0.79, 90, s.width * 0.18, s.height - 220);
      panel(c, card, 'Main form');
      final ion = f(ph, x) > 50;
      final form = x.base ? (ion ? 'RNH₃⁺' : 'RNH₂') : (ion ? 'A⁻' : 'HA');
      lbl(c, form, card.center + const Offset(0, -20), size: 60, color: ion ? IX.positive : IX.accent, w: FontWeight.w700);
      lbl(c, x.base ? (ion ? 'protonated' : 'free base') : (ion ? 'ionised' : 'un-ionised'), card.center + const Offset(0, 40), size: 19, color: IX.inkSoft);
      lbl(c, ph < x.pk ? 'pH < pKa' : 'pH > pKa', card.bottomCenter + const Offset(0, -34), size: 20, color: IX.ink, w: FontWeight.w600);
    },
    presets: {'Phenol vs ethanol at pH 12': {'cpd': 1, 'pH': 12}, 'Acetic acid at pH 4.76': {'cpd': 3, 'pH': 4.76}, 'Chloroacetic acid': {'cpd': 6, 'pH': 3}, 'Methylamine at pH 7': {'cpd': 9, 'pH': 7}, 'Aniline at pH 7': {'cpd': 11, 'pH': 7}},
  ),
  'weak': Mode(
    title: 'pH of a weak acid or base',
    subtitle: 'Equilibrium · Weak acids and bases',
    formula: 'pH ≈ ½(pKa − log c)     pOH ≈ ½(pKb − log c)',
    titleOf: (v) => v.i('base') == 0 ? 'pH of a weak acid solution' : 'pH of a weak base solution',
    defaults: {'base': 0, 'pk': 10, 'c': 0.1},
    knobs: const [
      Pick('base', 'Solute', ['Weak acid (pKa)', 'Weak base (pKb)'], ids: ['acid', 'base']),
      Slide('pk', 'pKa or pKb', 2, 12, digits: 2, step: 0.01),
      Slide('c', 'Concentration c', 0.001, 1, unit: 'mol/L', digits: 3, step: 0.001),
      Note('Valid while the degree of ionisation α = √(K/c) is small.'),
    ],
    readouts: (v) {
      final b = v.i('base') == 1, pk = v.g('pk', 10), c0 = v.g('c', 0.1);
      final half = 0.5 * (pk - math.log(c0) / math.ln10);
      final ph = b ? 14 - half : half;
      return [Readout('pH', ph.toStringAsFixed(2), '', uiColor(ph)), Readout(b ? 'pOH' : 'pOH', (14 - ph).toStringAsFixed(2)), Readout('α (degree of ionisation)', (math.min(1.0, math.sqrt(math.pow(10, -pk) / c0)) * 100).toStringAsFixed(3), '%', IX.amber), Readout(b ? 'Kb' : 'Ka', sx(math.pow(10, -pk).toDouble()))];
    },
    paint: (c, s, v) {
      final b = v.i('base') == 1, pk = v.g('pk', 10), c0 = v.g('c', 0.1);
      double phOf(double k) => b ? 14 - 0.5 * (k - math.log(c0) / math.ln10) : 0.5 * (k - math.log(c0) / math.ln10);
      final pr = Rect.fromLTWH(140, 70, s.width * 0.55, s.height - 260);
      final pl = Plot(pr, 2, 12, 0, 14);
      pl.axes(c, x: b ? 'pKb' : 'pKa', y: 'pH', dx: 1, dy: 2, title: 'c = ${c0.toStringAsFixed(3)} mol/L');
      pl.curve(c, phOf, IX.accent);
      pl.dot(c, pk, phOf(pk), IX.amber, label: 'pH ${phOf(pk).toStringAsFixed(2)}');
      final names = b ? [('NH₃', 4.75), ('CH₃NH₂', 3.36), ('C₆H₅NH₂', 9.38)] : [('CH₃COOH', 4.76), ('Phenol', 10.0), ('HCOOH', 3.75)];
      for (final (n, k) in names) {
        lbl(c, n, pl.p(k, phOf(k)) + const Offset(8, 22), size: 14, color: IX.muted, align: Alignment.centerLeft);
        c.drawCircle(pl.p(k, phOf(k)), 4, fill(IX.muted));
      }
      beaker(c, Rect.fromLTWH(s.width * 0.79, 110, s.width * 0.16, s.height * 0.4), 0.7, uiColor(phOf(pk)).withValues(alpha: 0.85), label: 'with indicator');
      _scale(c, Rect.fromLTWH(70, s.height - 120, s.width - 140, 34), phOf(pk));
    },
    presets: {'Phenol 0.1 M': {'base': 0, 'pk': 10, 'c': 0.1}, 'Acetic acid 0.1 M': {'base': 0, 'pk': 4.76, 'c': 0.1}, 'Methylamine 0.1 M': {'base': 1, 'pk': 3.36, 'c': 0.1}, 'Aniline 0.1 M': {'base': 1, 'pk': 9.38, 'c': 0.1}},
  ),
};

String _concText(V v) {
  final n = v.i('n', 2), cc = v.g('C', 1);
  return '${cc == 1 ? '' : '${cc.toStringAsFixed(1)} × '}10${sup('-$n')} M';
}

double _bufPh(double add) {
  // 0.10 mol acid + 0.10 mol acetate in 1 L; add > 0 is HCl, add < 0 is NaOH.
  const pka = 4.76;
  final acid = 0.1 + add, salt = 0.1 - add;
  if (salt <= 1e-3) return math.min(2.73, add - 0.1 > 1e-9 ? -math.log(add - 0.1) / math.ln10 : 2.73); // excess HCl, or 0.2 M acetic acid
  if (acid <= 1e-3) return math.max(9.03, -add - 0.1 > 1e-9 ? 14 + math.log(-add - 0.1) / math.ln10 : 9.03); // excess NaOH, or 0.2 M acetate
  return (pka + math.log(salt / acid) / math.ln10).clamp(2.73, 9.03).toDouble();
}

double _waterPh(double add) => add.abs() < 1e-9 ? 7 : add > 0 ? -math.log(add) / math.ln10 : 14 + math.log(-add) / math.ln10;
