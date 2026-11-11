import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bench.dart';
import 'kit.dart';

/// Solutions: ways of stating concentration, Henry's law, Raoult's law and its deviations,
/// elevation of boiling point and depression of freezing point, and the van 't Hoff factor.
/// Water is the solvent throughout (Kb = 0.52, Kf = 1.86 K kg mol⁻¹).

const _kb = 0.52, _kf = 1.86;


/// Henry constants of gases in water at 298 K, in kbar (NCERT Table 1.2 values).
const _gases = [('He', 144.97, Color(0xFF8A90B0)), ('H₂', 69.16, Color(0xFF6B8FD6)), ('N₂', 76.48, IX.accent), ('O₂', 34.86, IX.positive), ('Ar', 40.3, CX.purple), ('CO₂', 1.67, IX.green)];

/// A volumetric flask in [r] filled with a tinted solution, the fill level set by [level].
void _flask(Canvas c, Rect r, Color liquid, double level, {String? label, int dots = 0, Color dot = IX.accent}) {
  final neckW = r.width * 0.16, bulbR = r.width / 2;
  final bc = Offset(r.center.dx, r.bottom - bulbR);
  final neck = Rect.fromLTRB(r.center.dx - neckW / 2, r.top, r.center.dx + neckW / 2, bc.dy - bulbR * 0.86);
  final outline = Path()
    ..moveTo(neck.left, neck.top)
    ..lineTo(neck.left, neck.bottom)
    ..arcTo(Rect.fromCircle(center: bc, radius: bulbR), -math.pi / 2 - math.asin(neckW / 2 / bulbR), -2 * math.pi + 2 * math.asin(neckW / 2 / bulbR), false)
    ..lineTo(neck.right, neck.top);
  final inside = Path()
    ..addRect(neck)
    ..addOval(Rect.fromCircle(center: bc, radius: bulbR));
  c.drawCircle(bc + const Offset(0, 8), bulbR, Paint()..color = const Color(0x1213165A)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 12));
  c.save();
  c.clipPath(inside);
  c.drawPath(inside, fill(const Color(0x14FFFFFF)));
  final top = r.bottom - (r.bottom - neck.top) * level.clamp(0.0, 1.0);
  c.drawRect(Rect.fromLTRB(r.left, top, r.right, r.bottom), fill(liquid));
  c.drawLine(Offset(r.left, top), Offset(r.right, top), stroke(Color.lerp(liquid, Colors.black, 0.2)!, 2));
  var drawn = 0;
  for (var i = 0; i < 2000 && drawn < dots; i++) {
    final a = rnd(i, 501) * 2 * math.pi, d = math.sqrt(rnd(i, 502)) * bulbR * 0.86;
    final p = bc + Offset(math.cos(a) * d, math.sin(a) * d);
    if (p.dy > top + 10) {
      c.drawCircle(p, 6, fill(dot.withValues(alpha: 0.8)));
      drawn++;
    }
  }
  c.restore();
  c.drawPath(outline, stroke(IX.glassEdge, 2.8));
  final mark = neck.top + neck.height * 0.35;
  c.drawLine(Offset(neck.left - 6, mark), Offset(neck.right + 6, mark), stroke(IX.inkSoft, 2));
  c.drawArc(Rect.fromCircle(center: bc, radius: bulbR - 14), -2.6, 0.9, false, stroke(Colors.white.withValues(alpha: 0.9), 5));
  if (label != null) lbl(c, label, Offset(r.center.dx, r.bottom + 28), size: 18, color: IX.ink, w: FontWeight.w600);
}

/// A thermometer with a zoomed scale from [lo] to [hi] °C, reading [t] against a reference [t0].
void _thermo(Canvas c, Rect r, double lo, double hi, double t0, double t, String title, Color col) {
  final tube = Rect.fromLTWH(r.center.dx - 13, r.top + 40, 26, r.height - 110);
  final bulb = Offset(r.center.dx, tube.bottom + 26);
  double y(double x) => tube.bottom - (x - lo) / (hi - lo) * tube.height;
  c.drawRRect(RRect.fromRectAndRadius(tube.inflate(4), const Radius.circular(17)), fill(IX.paper));
  c.drawRRect(RRect.fromRectAndRadius(tube.inflate(4), const Radius.circular(17)), stroke(IX.glassEdge, 2.4));
  c.drawCircle(bulb, 30, fill(IX.paper));
  c.drawCircle(bulb, 30, stroke(IX.glassEdge, 2.4));
  c.drawCircle(bulb, 22, fill(col));
  c.drawRect(Rect.fromLTRB(tube.left + 6, y(t.clamp(lo, hi)), tube.right - 6, bulb.dy), fill(col));
  final step = niceStep(hi - lo, 5);
  for (var x = (lo / step).ceil() * step; x <= hi + 1e-9; x += step) {
    c.drawLine(Offset(tube.left - 4, y(x)), Offset(tube.left - 18, y(x)), stroke(IX.inkSoft, 1.6));
    lbl(c, x.toStringAsFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0), Offset(tube.left - 24, y(x)), size: 15, align: Alignment.centerRight);
  }
  IxPaint.dashed(c, Offset(tube.right + 6, y(t0)), Offset(tube.right + 70, y(t0)), Paint()..color = IX.muted..strokeWidth = 2);
  lbl(c, 'water ${t0.toStringAsFixed(2)}', Offset(tube.right + 76, y(t0)), size: 15, color: IX.muted, align: Alignment.centerLeft);
  c.drawLine(Offset(tube.right + 6, y(t)), Offset(tube.right + 70, y(t)), stroke(col, 3));
  lbl(c, 'solution ${t.toStringAsFixed(2)}', Offset(tube.right + 76, y(t)), size: 16, color: col, align: Alignment.centerLeft, w: FontWeight.w700);
  lbl(c, title, Offset(r.center.dx + 20, r.top + 8), size: 19, color: IX.ink, w: FontWeight.w600);
}

double _molality(V v) => v.g('w2', 18) / math.max(1, v.g('M2', 180)) / (v.g('w1', 500) / 1000);

final Map<String, Mode> solutionModes = {
  'concentration': Mode(
    title: 'Ways to state concentration',
    subtitle: 'Solutions · Expressing concentration',
    formula: 'M = n / V(L)    m = n / W(kg)',
    titleOf: (v) => '${v.g('ms', 18).toStringAsFixed(1)} g of solute in ${v.g('mw', 500).toStringAsFixed(0)} g of water',
    defaults: {'ms': 18, 'Mm': 180.16, 'mw': 500, 'V': 500},
    knobs: [
      Slide('ms', 'Mass of solute', 0.5, 60, unit: 'g', digits: 1, step: 0.5),
      Slide('Mm', 'Molar mass of solute', 20, 400, unit: 'g/mol', digits: 1, step: 0.5),
      Slide('mw', 'Mass of water', 100, 1000, unit: 'g', digits: 0, step: 10),
      Slide('V', 'Volume of solution', 100, 2000, unit: 'mL', digits: 0, step: 10),
      const Note('Molarity changes with volume (and so with temperature); molality and mole fraction use masses and do not.'),
    ],
    readouts: (v) {
      final n = v.g('ms', 18) / v.g('Mm', 180.16), nw = v.g('mw', 500) / 18.02;
      return [
        Readout('Moles of solute', n.toStringAsFixed(4), 'mol', IX.accent),
        Readout('Molarity', (n / (v.g('V', 500) / 1000)).toStringAsFixed(4), 'mol/L', IX.positive),
        Readout('Molality', (n / (v.g('mw', 500) / 1000)).toStringAsFixed(4), 'mol/kg', IX.green),
        Readout('Mole fraction x₂', (n / (n + nw)).toStringAsFixed(5)),
        Readout('Mass %', (100 * v.g('ms', 18) / (v.g('ms', 18) + v.g('mw', 500))).toStringAsFixed(2), '%'),
        Readout('ppm (by mass)', sx(1e6 * v.g('ms', 18) / (v.g('ms', 18) + v.g('mw', 500)))),
      ];
    },
    paint: (c, s, v) {
      final n = v.g('ms', 18) / v.g('Mm', 180.16), vol = v.g('V', 500);
      final molar = n / (vol / 1000);
      final fr = Rect.fromLTWH(70, 120, s.width * 0.3, s.height - 240);
      final shade = Color.lerp(const Color(0xFFF1F6FC), const Color(0xFFB9D3EF), (molar / 1.0).clamp(0.0, 1.0))!;
      _flask(c, Rect.fromCenter(center: fr.center, width: fr.width * 0.8, height: fr.height * 0.92), shade, 0.25 + 0.6 * (vol - 100) / 1900, label: '${vol.toStringAsFixed(0)} mL of solution', dots: (n * 100).round().clamp(2, 90));
      lbl(c, 'Each dot ≈ 0.01 mol of solute', Offset(fr.center.dx, fr.bottom + 66), size: 16, color: IX.muted);
      final pr = Rect.fromLTWH(s.width * 0.5, 90, s.width * 0.44, s.height * 0.5);
      final top = math.max(0.5, n / 0.1 * 1.1);
      final pl = Plot(pr, 0, 2000, 0, top);
      pl.axes(c, x: 'Volume of solution V (mL)', y: 'Molarity (mol/L)', dx: 500, title: 'Add water: moles fixed, M falls as 1/V');
      pl.curve(c, (x) => n / (x / 1000), IX.positive, from: 60);
      pl.dot(c, vol, molar, IX.positive, label: '${molar.toStringAsFixed(3)} M');
      // Composition strip: solute vs water by moles.
      final nw = v.g('mw', 500) / 18.02;
      final strip = Rect.fromLTWH(pr.left, pr.bottom + 120, pr.width, 46);
      final f = n / (n + nw);
      final wSol = math.max(6.0, strip.width * f);
      c.drawRRect(RRect.fromRectAndRadius(strip, const Radius.circular(10)), fill(const Color(0xFFDCEBF7)));
      c.drawRRect(RRect.fromRectAndCorners(Rect.fromLTWH(strip.left, strip.top, wSol, strip.height), topLeft: const Radius.circular(10), bottomLeft: const Radius.circular(10)), fill(IX.accent));
      lbl(c, 'Moles in the solution: solute ${n.toStringAsFixed(3)}   ·   water ${nw.toStringAsFixed(1)}', Offset(strip.left, strip.top - 22), size: 18, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
      lbl(c, 'x₂ = ${f.toStringAsFixed(4)}', Offset(strip.left + wSol + 12, strip.center.dy), size: 17, color: IX.accent, w: FontWeight.w700, align: Alignment.centerLeft);
      para(c, 'Molality m = moles of solute ÷ kg of solvent = ${n.toStringAsFixed(4)} ÷ ${(v.g('mw', 500) / 1000).toStringAsFixed(3)} kg = ${(n / (v.g('mw', 500) / 1000)).toStringAsFixed(4)} mol/kg', Offset(strip.left, strip.bottom + 24), strip.width, size: 18, color: IX.inkSoft);
    },
    presets: {'18 g glucose': {'ms': 18, 'Mm': 180.16, 'mw': 500, 'V': 500}, '5.85 g NaCl': {'ms': 5.85, 'Mm': 58.44, 'mw': 500, 'V': 500}, 'Dilute to 2 L': {'ms': 5.85, 'Mm': 58.44, 'V': 2000}, '6 g urea': {'ms': 6, 'Mm': 60.06, 'mw': 250, 'V': 250}},
  ),
  'henry': Mode(
    title: "Henry's law",
    subtitle: 'Solutions · Solubility of gases',
    formula: 'p = K_H · x',
    titleOf: (v) => 'Dissolving ${_gases[v.i('gas', 2).clamp(0, 5)].$1} in water at 298 K',
    defaults: {'gas': 2, 'p': 1},
    knobs: [
      Pick('gas', 'Gas', [for (final g in _gases) g.$1], ids: [for (final g in _gases) ascii(g.$1)], chips: true),
      const Slide('p', 'Partial pressure of the gas', 0.1, 5, unit: 'bar', digits: 2, step: 0.05),
      const Note('A smaller K_H means a more soluble gas. CO₂ is about 45 times more soluble than N₂, which is why soda is bottled under CO₂ pressure.'),
    ],
    readouts: (v) {
      final g = _gases[v.i('gas', 2).clamp(0, 5)];
      final x = v.g('p', 1) / (g.$2 * 1000);
      return [Readout('K_H', g.$2.toStringAsFixed(2), 'kbar', g.$3), Readout('Mole fraction x', sx(x), '', IX.accent), Readout('Gas in 1 L water', (x / (1 - x) * 55.5 * 1000).toStringAsFixed(3), 'mmol'), Readout('Double p →', 'x doubles', '', IX.green)];
    },
    paint: (c, s, v) {
      final gi = v.i('gas', 2).clamp(0, 5), g = _gases[gi];
      final p = v.g('p', 1), x = p / (g.$2 * 1000);
      // Vessel with a piston.
      final vr = Rect.fromLTWH(80, 120, s.width * 0.3, s.height - 230);
      final pistonY = vr.top + 40 + (1 - (p - 0.1) / 4.9) * vr.height * 0.28;
      final water = Rect.fromLTRB(vr.left, vr.top + vr.height * 0.55, vr.right, vr.bottom);
      c.drawRect(Rect.fromLTRB(vr.left, pistonY, vr.right, water.top), fill(const Color(0xFFF8FAFD)));
      c.drawRect(water, fill(const Color(0xFFCFE2F5)));
      c.drawLine(water.topLeft, water.topRight, stroke(const Color(0xFF8FB4DA), 2));
      final gasN = (p * 10).round().clamp(1, 50);
      for (var i = 0; i < gasN; i++) {
        ball(c, Offset(vr.left + 22 + rnd(i, 601) * (vr.width - 44), pistonY + 34 + rnd(i, 602) * (water.top - pistonY - 50)), 9, g.$3);
      }
      final dissolved = (x * 1.5e6).round().clamp(1, 60);
      for (var i = 0; i < dissolved; i++) {
        ball(c, Offset(water.left + 22 + rnd(i, 603) * (water.width - 44), water.top + 22 + rnd(i, 604) * (water.height - 44)), 8, g.$3);
      }
      c.drawRect(Rect.fromLTRB(vr.left - 4, pistonY - 30, vr.right + 4, pistonY), fill(const Color(0xFF8C93A6)));
      c.drawRect(Rect.fromLTRB(vr.center.dx - 12, vr.top - 30, vr.center.dx + 12, pistonY - 30), fill(const Color(0xFF6F7585)));
      final walls = Path()..moveTo(vr.left, vr.top)..lineTo(vr.left, vr.bottom)..lineTo(vr.right, vr.bottom)..lineTo(vr.right, vr.top);
      c.drawPath(walls, stroke(IX.glassEdge, 3));
      lbl(c, 'p = ${p.toStringAsFixed(2)} bar', Offset(vr.center.dx, pistonY - 54), size: 19, color: IX.ink, w: FontWeight.w700, halo: true);
      lbl(c, 'gas above', Offset(vr.right + 14, (pistonY + water.top) / 2), size: 16, color: IX.muted, align: Alignment.centerLeft);
      lbl(c, 'dissolved', Offset(vr.right + 14, water.center.dy), size: 16, color: IX.muted, align: Alignment.centerLeft);
      lbl(c, 'dissolved dots not to scale (x is tiny)', Offset(vr.center.dx, vr.bottom + 28), size: 15, color: IX.muted);
      final pr = Rect.fromLTWH(s.width * 0.52, 90, s.width * 0.42, s.height - 220);
      final pl = Plot(pr, 0, 5, 0, 3.2);
      pl.axes(c, x: 'Partial pressure p (bar)', y: 'Mole fraction x  (× 10⁻⁴)', dx: 1, dy: 0.5, title: 'Straight lines through the origin');
      for (final (i, q) in _gases.indexed) {
        final sel = i == gi;
        pl.curve(c, (pp) => pp / (q.$2 * 1000) * 1e4, sel ? q.$3 : q.$3.withValues(alpha: 0.35), w: sel ? 4.5 : 2.5);
        final yEnd = 5 / (q.$2 * 1000) * 1e4;
        final at = yEnd > 3.2 ? pl.p(3.2 * q.$2 * 1000 / 1e4, 3.2) + const Offset(0, 14) : pl.p(5, yEnd) + const Offset(-8, -14);
        lbl(c, q.$1, at, size: 16, color: sel ? q.$3 : IX.muted, align: Alignment.centerRight, w: FontWeight.w600, halo: true);
      }
      pl.dot(c, p, x * 1e4, g.$3, label: 'x = ${sx(x)}');
    },
    presets: {'N₂ at 1 bar': {'gas': 2, 'p': 1}, 'O₂ from air (0.21 bar)': {'gas': 3, 'p': 0.21}, 'CO₂ in soda (4 bar)': {'gas': 5, 'p': 4}, 'Deep-sea diver N₂': {'gas': 2, 'p': 3.2}},
  ),
  'raoult': Mode(
    title: "Raoult's law and deviations",
    subtitle: 'Solutions · Vapour pressure of liquid–liquid solutions',
    formula: 'p₁ = p₁° x₁   p₂ = p₂° x₂   p = p₁ + p₂',
    titleOf: (v) => ['Ideal solution', 'Positive deviation (A–B weaker than A–A, B–B)', 'Negative deviation (A–B stronger)'][v.i('dev').clamp(0, 2)],
    defaults: {'pa': 40, 'pb': 80, 'xb': 0.5, 'dev': 0},
    knobs: [
      const Pick('dev', 'Solution', ['Ideal', 'Positive', 'Negative'], ids: ['ideal', 'positive', 'negative']),
      const Slide('pa', 'p₁° (pure component 1)', 10, 200, unit: 'mm Hg', digits: 0, step: 1),
      const Slide('pb', 'p₂° (pure component 2)', 10, 200, unit: 'mm Hg', digits: 0, step: 1),
      const Slide('xb', 'Mole fraction of component 2, x₂', 0, 1, digits: 2, step: 0.01),
      const Note('Examples: benzene + toluene (ideal), ethanol + acetone (positive, minimum-boiling azeotrope), chloroform + acetone (negative).'),
    ],
    readouts: (v) {
      final r = _raoult(v, v.g('xb', 0.5));
      return [Readout('p₁', r.$1.toStringAsFixed(1), 'mm Hg', IX.accent), Readout('p₂', r.$2.toStringAsFixed(1), 'mm Hg', IX.positive), Readout('Total p', (r.$1 + r.$2).toStringAsFixed(1), 'mm Hg', IX.ink), Readout('x₂ in vapour, y₂', ((r.$2) / (r.$1 + r.$2)).toStringAsFixed(3), '', IX.green), Readout('ΔmixH', ['0', '> 0 (absorbs heat)', '< 0 (releases heat)'][v.i('dev').clamp(0, 2)])];
    },
    paint: (c, s, v) {
      final xb = v.g('xb', 0.5);
      final pr = Rect.fromLTWH(110, 90, s.width * 0.55, s.height - 220);
      final top = math.max(v.g('pa', 40), v.g('pb', 80)) * (v.i('dev') == 1 ? 1.6 : 1.25);
      final pl = Plot(pr, 0, 1, 0, top);
      pl.axes(c, x: 'Mole fraction of component 2,  x₂', y: 'Vapour pressure (mm Hg)', dx: 0.2, title: 'Vapour pressure against composition');
      if (v.i('dev') != 0) {
        pl.curve(c, (x) => v.g('pa', 40) * (1 - x), IX.accent, w: 1.6, dash: true);
        pl.curve(c, (x) => v.g('pb', 80) * x, IX.positive, w: 1.6, dash: true);
        pl.curve(c, (x) => v.g('pa', 40) * (1 - x) + v.g('pb', 80) * x, IX.ink, w: 1.6, dash: true);
      }
      pl.curve(c, (x) => _raoult(v, x).$1, IX.accent);
      pl.curve(c, (x) => _raoult(v, x).$2, IX.positive);
      pl.curve(c, (x) => _raoult(v, x).$1 + _raoult(v, x).$2, IX.ink, w: 5);
      final r = _raoult(v, xb);
      pl.vline(c, xb, IX.muted);
      pl.dot(c, xb, r.$1, IX.accent);
      pl.dot(c, xb, r.$2, IX.positive);
      pl.dot(c, xb, r.$1 + r.$2, IX.ink, label: '${(r.$1 + r.$2).toStringAsFixed(1)} mm Hg');
      pl.legend(c, [('p total', IX.ink), ('p₁', IX.accent), ('p₂', IX.positive), if (v.i('dev') != 0) ('ideal (Raoult)', IX.muted)]);
      // Closed vessel: liquid and vapour composition.
      final vr = Rect.fromLTWH(s.width * 0.73, 110, s.width * 0.22, s.height - 260);
      panel(c, vr.inflate(16), 'Closed vessel');
      final liq = Rect.fromLTRB(vr.left + 10, vr.center.dy + 40, vr.right - 10, vr.bottom - 10);
      c.drawRect(liq, fill(const Color(0xFFDCEBF7)));
      final y2 = r.$2 / (r.$1 + r.$2);
      for (var i = 0; i < 24; i++) {
        ball(c, Offset(liq.left + 16 + rnd(i, 701) * (liq.width - 32), liq.top + 14 + rnd(i, 702) * (liq.height - 28)), 9, rnd(i, 703) < xb ? IX.positive : IX.accent);
      }
      final vap = (r.$1 + r.$2) / top * 22;
      for (var i = 0; i < vap.round(); i++) {
        ball(c, Offset(vr.left + 26 + rnd(i, 704) * (vr.width - 52), vr.top + 50 + rnd(i, 705) * (liq.top - vr.top - 80)), 8, rnd(i, 706) < y2 ? IX.positive : IX.accent);
      }
      lbl(c, 'vapour: y₂ = ${y2.toStringAsFixed(2)}', Offset(vr.center.dx, liq.top - 18), size: 16, color: IX.ink, w: FontWeight.w600, halo: true);
      lbl(c, 'liquid: x₂ = ${xb.toStringAsFixed(2)}', Offset(vr.center.dx, vr.bottom + 30), size: 16, color: IX.ink, w: FontWeight.w600);
      lbl(c, 'The vapour is richer in the more volatile component.', Offset(pr.center.dx, pr.bottom + 82), size: 17, color: IX.inkSoft);
    },
    presets: {'Ideal: benzene + toluene': {'dev': 0, 'pa': 29, 'pb': 95, 'xb': 0.5}, 'Positive: ethanol + acetone': {'dev': 1, 'pa': 59, 'pb': 200, 'xb': 0.5}, 'Negative: chloroform + acetone': {'dev': 2, 'pa': 200, 'pb': 180, 'xb': 0.5}, 'Pure component 1': {'dev': 0, 'xb': 0}},
  ),
  'colligative': Mode(
    title: 'Boiling point up, freezing point down',
    subtitle: 'Solutions · Colligative properties',
    formula: 'ΔTb = i Kb m     ΔTf = i Kf m',
    titleOf: (v) => '${v.g('w2', 18).toStringAsFixed(1)} g of solute (M = ${v.g('M2', 180).toStringAsFixed(0)}) in ${v.g('w1', 500).toStringAsFixed(0)} g water',
    defaults: {'w2': 18, 'M2': 180, 'w1': 500, 'i': 1},
    knobs: [
      const Slide('w2', 'Mass of solute w₂', 1, 60, unit: 'g', digits: 1, step: 0.5),
      const Slide('M2', 'Molar mass of solute M₂', 30, 400, unit: 'g/mol', digits: 0, step: 1),
      const Slide('w1', 'Mass of water w₁', 100, 1000, unit: 'g', digits: 0, step: 10),
      const Slide('i', "van 't Hoff factor i", 1, 3, digits: 2, step: 0.05),
      const Note('Kb(water) = 0.52 K kg/mol and Kf(water) = 1.86 K kg/mol. Only the number of solute particles matters, not what they are.'),
    ],
    readouts: (v) {
      final m = _molality(v), i = v.g('i', 1);
      return [Readout('Molality m', m.toStringAsFixed(4), 'mol/kg', IX.accent), Readout('ΔTb', (i * _kb * m).toStringAsFixed(3), 'K', IX.positive), Readout('Boiling point', (100 + i * _kb * m).toStringAsFixed(2), '°C', IX.positive), Readout('ΔTf', (i * _kf * m).toStringAsFixed(3), 'K', IX.accent), Readout('Freezing point', (-i * _kf * m).toStringAsFixed(2), '°C', IX.accent), Readout('Osmotic π at 298 K', (i * m * 0.08314 * 298).toStringAsFixed(2), 'bar')];
    },
    paint: (c, s, v) {
      final m = _molality(v), i = v.g('i', 1);
      final tb = 100 + i * _kb * m, tf = -i * _kf * m;
      _thermo(c, Rect.fromLTWH(70, 70, 220, s.height - 150), 99.8, 102, 100, tb.clamp(99.8, 102), 'Boiling', IX.positive);
      _thermo(c, Rect.fromLTWH(380, 70, 220, s.height - 150), -6, 0.2, 0, tf.clamp(-6, 0.2), 'Freezing', IX.accent);
      final pr = Rect.fromLTWH(s.width * 0.58, 90, s.width * 0.37, s.height - 230);
      final pl = Plot(pr, 0, 3, 0, 6);
      pl.axes(c, x: 'i × m  (mol/kg of particles)', y: 'ΔT (K)', dx: 0.5, dy: 1, title: 'Both rise in step with particles');
      pl.curve(c, (x) => _kf * x, IX.accent);
      pl.curve(c, (x) => _kb * x, IX.positive);
      lbl(c, 'ΔTf  (slope Kf = 1.86)', pl.p(2.1, _kf * 2.1) + const Offset(-10, -24), size: 16, color: IX.accent, w: FontWeight.w600, align: Alignment.centerRight, halo: true);
      lbl(c, 'ΔTb  (slope Kb = 0.52)', pl.p(2.9, _kb * 2.9) + const Offset(-6, -22), size: 16, color: IX.positive, w: FontWeight.w600, align: Alignment.centerRight, halo: true);
      pl.dot(c, i * m, _kf * i * m, IX.accent, label: '${(_kf * i * m).toStringAsFixed(2)} K');
      pl.dot(c, i * m, _kb * i * m, IX.positive, label: '${(_kb * i * m).toStringAsFixed(2)} K', align: Alignment.bottomLeft);
      lbl(c, 'Thermometer scales are zoomed: the changes are fractions of a degree.', Offset(335, s.height - 26), size: 16, color: IX.muted);
    },
    presets: {'0.2 m glucose': {'w2': 18, 'M2': 180, 'w1': 500, 'i': 1}, '0.5 m urea': {'w2': 15, 'M2': 60, 'w1': 500, 'i': 1}, '1 m sucrose': {'w2': 34.2, 'M2': 342, 'w1': 100, 'i': 1}, '0.5 m NaCl (i ≈ 1.9)': {'w2': 14.6, 'M2': 58.5, 'w1': 500, 'i': 1.9}},
  ),
  'vanthoff': Mode(
    title: "Abnormal molar mass: the van 't Hoff factor",
    subtitle: 'Solutions · Dissociation and association',
    formula: 'i = 1 + α (n − 1)',
    titleOf: (v) => '${_salts[v.i('n', 2).clamp(1, 5) - 1]} in water',
    defaults: {'n': 2, 'a': 1},
    knobs: [
      const Slide('n', 'Ions per formula unit, n', 1, 5, digits: 0, step: 1),
      const Slide('a', 'Degree of dissociation α', 0, 1, digits: 2, step: 0.01),
      const Note('Molar mass found from a colligative property = true molar mass ÷ i, so a dissociating solute appears lighter than it is.'),
    ],
    readouts: (v) {
      final n = v.i('n', 2).clamp(1, 5), a = v.g('a', 1), i = 1 + a * (n - 1);
      final mt = _saltM[n - 1];
      return [Readout('i', i.toStringAsFixed(2), '', IX.accent), Readout('ΔTf of 0.1 m', (i * _kf * 0.1).toStringAsFixed(3), 'K', IX.positive), Readout('True molar mass', mt.toStringAsFixed(1), 'g/mol'), Readout('Apparent molar mass', (mt / i).toStringAsFixed(1), 'g/mol', IX.amber)];
    },
    paint: (c, s, v) {
      final n = v.i('n', 2).clamp(1, 5), a = v.g('a', 1), i = 1 + a * (n - 1);
      final b = Rect.fromLTWH(70, 140, s.width * 0.36, s.height - 270);
      final liq = beaker(c, b, 0.8, const Color(0xFFE5F0FA), label: '10 formula units dissolved');
      const units = 10;
      final split = (a * units).round();
      var k = 0;
      for (var u = 0; u < units; u++) {
        final cx = liq.left + 50 + (u % 4) * (liq.width - 100) / 3, cy = liq.top + 50 + (u ~/ 4) * (liq.height - 90) / 2.4;
        final at = Offset(cx + (rnd(u, 801) - 0.5) * 20, cy + (rnd(u, 802) - 0.5) * 20);
        if (n == 1 || u >= split) {
          c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: at, width: 26.0 + 12 * n, height: 26), const Radius.circular(8)), fill(IX.steel));
          k++;
        } else {
          for (var j = 0; j < n; j++) {
            final ang = j / n * 2 * math.pi + u;
            final pos = at + Offset(math.cos(ang), math.sin(ang)) * 30;
            final cation = j < (n == 5 ? 2 : n == 4 ? 3 : n == 3 ? 2 : 1);
            tag(c, cation ? '+' : '−', pos, cation ? IX.positive : IX.accent, size: 14);
            k++;
          }
        }
      }
      lbl(c, '$k particles from 10 units  →  i = ${i.toStringAsFixed(2)}', Offset(b.center.dx, b.bottom + 64), size: 19, color: IX.ink, w: FontWeight.w600);
      final pr = Rect.fromLTWH(s.width * 0.55, 90, s.width * 0.39, s.height - 230);
      final pl = Plot(pr, 0, 1, 0, 5.5);
      pl.axes(c, x: 'Degree of dissociation α', y: "van 't Hoff factor i", dx: 0.2, dy: 1, title: 'i rises with α; faster for more ions');
      for (var nn = 1; nn <= 5; nn++) {
        pl.curve(c, (x) => 1 + x * (nn - 1), nn == n ? IX.accent : IX.rule, w: nn == n ? 4.5 : 2.5);
        lbl(c, 'n = $nn', pl.p(1, nn.toDouble()) + const Offset(-8, -16), size: 15, color: nn == n ? IX.accent : IX.muted, align: Alignment.centerRight, w: FontWeight.w600);
      }
      pl.dot(c, a, i, IX.accent, label: 'i = ${i.toStringAsFixed(2)}');
    },
    presets: {'Glucose (n = 1)': {'n': 1, 'a': 0}, 'NaCl, complete': {'n': 2, 'a': 1}, 'K₂SO₄, complete': {'n': 3, 'a': 1}, 'NaCl, 90 %': {'n': 2, 'a': 0.9}},
  ),
};

const _salts = ['Glucose', 'NaCl → Na⁺ + Cl⁻', 'K₂SO₄ → 2K⁺ + SO₄²⁻', 'K₃[Fe(CN)₆] → 3K⁺ + [Fe(CN)₆]³⁻', 'Al₂(SO₄)₃ → 2Al³⁺ + 3SO₄²⁻'];
const _saltM = [180.2, 58.4, 174.3, 329.2, 342.2];

/// Partial pressures (p₁, p₂) at mole fraction [x2] with a one-parameter (Margules) deviation.
(double, double) _raoult(V v, double x2) {
  final a = const [0.0, 1.1, -1.1][v.i('dev').clamp(0, 2)];
  final x1 = 1 - x2;
  return (v.g('pa', 40) * x1 * math.exp(a * x2 * x2), v.g('pb', 80) * x2 * math.exp(a * x1 * x1));
}
