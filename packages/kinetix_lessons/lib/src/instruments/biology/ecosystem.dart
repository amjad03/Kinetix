import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bio_kit.dart';

/// Ecosystem (2nd PUC Biology ch. 12): stratification and light through the canopy, the flow
/// from sunlight to GPP, NPP and consumers, decomposition of detritus, energy through trophic
/// levels (the 10 per cent law) and pyramids of number, biomass and energy.
///
/// Preset: {"mode": "strata"|"productivity"|"decomposition"|"flow"|"pyramid", "k": 0.6, "I0": 100,
/// "eff": 5, "resp": 50, "ce": 10, "gpp": 0 (kcal/m²/yr; 0 = from sunlight), "kd": 0.3, "month": 6,
/// "detritus": "leaves", "E": 20000, "f": 10, "kind": "energy", "case": "grassland"}.
class EcosystemInstrument extends StatefulWidget {
  const EcosystemInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<EcosystemInstrument> createState() => _EcoState();
}

class _EcoState extends BioState<EcosystemInstrument> {
  @override
  String get instrumentId => 'bio-ecosystem';
  @override
  Map<String, dynamic> get lessonPreset => widget.preset;
  @override
  List<String> get modes => const ['strata', 'productivity', 'decomposition', 'flow', 'pyramid'];
  @override
  Map<String, Map<String, dynamic>> get presets => const {
    'Forest layers': {'mode': 'strata'},
    'Sunlight to food': {'mode': 'productivity'},
    'GPP and NPP': {'mode': 'productivity', 'gpp': 2400, 'R': 900},
    'Decomposition': {'mode': 'decomposition'},
    'Energy flow': {'mode': 'flow'},
    'Pyramid of energy': {'mode': 'pyramid'},
    'Inverted: tree': {'mode': 'pyramid', 'kind': 'number', 'case': 'tree'},
    'Inverted: sea': {'mode': 'pyramid', 'kind': 'biomass', 'case': 'sea'},
  };
  @override
  Map<String, Object> defaults(String mode) => {'k': 0.6, 'I0': 100, 'eff': 5, 'resp': 50, 'ce': 10, 'gpp': 0, 'R': 900, 'kd': 0.3, 'month': 6, 'E': 20000, 'f': 10, 'kind': 'energy', 'case': 'grassland'};

  static const _sub = '2nd PUC Biology · Ecosystem';
  static const _lv = [Color(0xFF4E8A33), Color(0xFFC9A227), Color(0xFFD9824B), Color(0xFFB0475A)];

  @override
  Widget build(BuildContext context) => switch (mode) {
    'productivity' => _productivity(),
    'decomposition' => _decomposition(),
    'flow' => _flow(),
    'pyramid' => _pyramid(),
    _ => _strata(),
  };

  // ── Stratification ───────────────────────────────────────────────────────────────
  Widget _strata() {
    final k = n('k'), i0 = n('I0');
    const lai = [3.0, 1.5, 1.0];
    final i1 = i0 * math.exp(-k * lai[0]), i2 = i1 * math.exp(-k * lai[1]), i3 = i2 * math.exp(-k * lai[2]);
    return frame(
      title: 'Stratification: layers of a forest',
      subtitle: _sub,
      formula: 'light passing a layer = I × e^(−k × leaf area)',
      readouts: [
        Readout('Under the trees', f0(i1), '% of sunlight', _lv[0]),
        Readout('Under the shrubs', f1(i2), '%', _lv[1]),
        Readout('At the forest floor', f1(i3), '%', _lv[2]),
        Readout('Leaf density k', f2(k), ''),
      ],
      controls: [
        slider('k', 'Leaf density of each layer', 0.2, 1.2, dp: 2, div: 20),
        slider('I0', 'Sunlight at the top', 20, 100, unit: '%'),
      ],
      painter: BioPainter((c, size) {
        final ground = size.height - 90;
        final sky = Rect.fromLTWH(0, 0, size.width * 0.62, ground);
        c.drawRect(sky, Paint()..shader = LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color.lerp(const Color(0xFFFFF4CC), Colors.white, 1 - i0 / 100)!, Color.lerp(const Color(0xFFFFF4CC), const Color(0xFF51604A), 1 - i3 / 100)!]).createShader(sky));
        c.drawRect(Rect.fromLTWH(0, ground, size.width * 0.62, 90), Paint()..color = const Color(0xFF8C6B4A));
        // Sun rays thinning down.
        for (var q = 0; q < 9; q++) {
          final x = 40 + q * sky.width / 9;
          final layers = [(0.0, 120.0, i0), (120.0, ground * 0.55, i1), (ground * 0.55, ground * 0.8, i2), (ground * 0.8, ground, i3)];
          for (final (y0, y1, val) in layers) {
            c.drawLine(Offset(x, y0), Offset(x + (y1 - y0) * 0.15, y1), Paint()..color = const Color(0xFFE6B800).withValues(alpha: 0.12 + 0.5 * val / 100)..strokeWidth = 2 + 6 * val / 100);
          }
        }
        final rnd = math.Random(3);
        // Trees.
        for (var q = 0; q < 4; q++) {
          final x = 80 + q * sky.width / 4 + rnd.nextDouble() * 40;
          c.drawRect(Rect.fromLTRB(x - 10, 200, x + 10, ground), Paint()..color = const Color(0xFF6B4A2B));
          Bio.soft(c, Bio.blob(Offset(x, 170), 95, 70, seed: q, wobble: 0.18, n: 14), _lv[0], stroke: 1.5, light: 0.35);
        }
        // Shrubs.
        for (var q = 0; q < 6; q++) {
          final x = 50 + q * sky.width / 6 + rnd.nextDouble() * 30;
          Bio.soft(c, Bio.blob(Offset(x, ground * 0.66), 52, 38, seed: q + 9, wobble: 0.2), const Color(0xFF6FA347), stroke: 1.5, light: 0.3);
        }
        // Herbs and grasses.
        for (var x = 20.0; x < sky.width - 10; x += 14) {
          final hgt = 30 + rnd.nextDouble() * 40;
          c.drawLine(Offset(x, ground), Offset(x + rnd.nextDouble() * 10 - 5, ground - hgt), Paint()..color = const Color(0xFF8DBA5A)..strokeWidth = 3..strokeCap = StrokeCap.round);
        }
        for (final (y, name, val) in [(150.0, 'Trees (canopy)', i0), (ground * 0.66, 'Shrubs', i1), (ground - 50, 'Herbs and grasses', i2)]) {
          IxPaint.label(c, '$name: ${f0(val)}% light', Offset(sky.right - 14, y), size: 18, color: IX.ink, w: FontWeight.w700, align: Alignment.centerRight, halo: true);
        }
        // Bars on the right.
        final plot = Plot(Rect.fromLTRB(size.width * 0.72, 120, size.width - 30, size.height - 160), -0.5, 3.5, 0, 118);
        plot.frame(c, xs: [], ys: [0, 50, 100], title: 'Light reaching');
        plot.bars(c, [i0, i1, i2, i3], [const Color(0xFFE6B800), _lv[0], const Color(0xFF6FA347), const Color(0xFF8C6B4A)], labels: const ['top', 'trees', 'shrubs', 'floor'], fmt: (x) => '${f0(x)}%', width: 0.7);
        Bio.note(c, 'Shade-tolerant herbs live where little light is left.', Offset(plot.r.left - 40, plot.r.bottom + 50), maxWidth: size.width - plot.r.left + 10, size: 16, color: IX.inkSoft);
      }),
    );
  }

  // ── From sunlight to food ─────────────────────────────────────────────────────────
  Widget _productivity() {
    final fromSun = n('gpp') <= 0;
    const sun = 100000.0; // arbitrary units of incident sunlight
    final par = sun * 0.5;
    final gpp = fromSun ? par * n('eff') / 100 : n('gpp');
    final resp = fromSun ? gpp * n('resp') / 100 : math.min(n('R'), gpp);
    final npp = gpp - resp;
    final cons = npp * n('ce') / 100;
    final unit = fromSun ? 'units' : 'kcal/m²/yr';
    return frame(
      title: fromSun ? 'From sunlight to food' : 'Gross and net primary productivity',
      subtitle: _sub,
      formula: 'NPP = GPP − R',
      readouts: [
        Readout('GPP', grp(gpp), unit, _lv[0]),
        Readout('Respiration R', grp(resp), '${f0(100 * resp / math.max(gpp, 1))}% of GPP', IX.positive),
        Readout('NPP', grp(npp), '${f0(100 * npp / math.max(gpp, 1))}% of GPP', IX.green),
        if (fromSun) Readout('Consumers', grp(cons), unit, _lv[2]) else Readout('Food for herbivores', 'NPP', 'and decomposers', _lv[2]),
      ],
      controls: fromSun
          ? [slider('eff', 'PAR captured by plants', 2, 10, unit: '%'), slider('resp', 'Respiration (share of GPP)', 20, 80, unit: '%'), slider('ce', 'NPP turned into consumer biomass', 5, 20, unit: '%')]
          : [slider('gpp', 'Gross primary productivity', 500, 5000, unit: 'kcal/m²/yr', div: 45), slider('R', 'Respiration by plants', 0, 3000, unit: 'kcal/m²/yr', div: 60)],
      painter: BioPainter((c, size) {
        // Flow chart with arrow widths in proportion.
        final stages = fromSun
            ? [('Sunlight', sun, const Color(0xFFE6B800)), ('PAR (≈ 50%)', par, const Color(0xFFF0A93B)), ('GPP', gpp, _lv[0]), ('NPP', npp, IX.green), ('Consumers', cons, _lv[2])]
            : [('GPP', gpp, _lv[0]), ('NPP', npp, IX.green)];
        final x0 = 60.0, x1 = size.width - 60;
        final y = size.height * 0.36;
        final w = (x1 - x0) / stages.length;
        final maxV = stages.first.$2;
        for (var q = 0; q < stages.length; q++) {
          final (nm, val, col) = stages[q];
          final h = math.max(10.0, 220 * math.sqrt(val / maxV));
          final r = Rect.fromLTWH(x0 + q * w + 12, y - h / 2, w - 24, h);
          c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(10)), Paint()..color = col.withValues(alpha: 0.85));
          IxPaint.label(c, nm, Offset(r.center.dx, y - 150), size: 20, color: IX.ink, w: FontWeight.w700);
          IxPaint.label(c, grp(val), Offset(r.center.dx, y + 140), size: 19, color: Bio.darken(col, 0.2), w: FontWeight.w700);
          if (q > 0) IxPaint.arrow(c, Offset(r.left - 30, y), Offset(r.left - 2, y), IX.inkSoft, width: 3);
        }
        // The losses.
        final losses = fromSun
            ? [('reflected, not PAR', sun - par), ('not captured', par - gpp), ('plant respiration', resp), ('eaten food lost as heat, faeces', npp - cons)]
            : [('respiration by plants', resp)];
        for (var q = 0; q < losses.length; q++) {
          final cx = x0 + (q + 1) * w;
          IxPaint.arrow(c, Offset(cx, y + 50), Offset(cx, y + 210), IX.positive.withValues(alpha: 0.6), width: 3);
          IxPaint.label(c, '− ${grp(losses[q].$2)}', Offset(cx, y + 232), size: 17, color: IX.positive, w: FontWeight.w700);
          Bio.note(c, losses[q].$1, Offset(cx, y + 256), align: Alignment.topCenter, maxWidth: w - 20, size: 16, color: IX.inkSoft);
        }
        Bio.note(c, fromSun
            ? 'Less than half of incident sunlight is photosynthetically active radiation (PAR), and plants capture only 2–10% of it. Yet this small share sustains the whole living world. Annual NPP of the biosphere ≈ 170 billion tonnes (dry weight); the oceans make only 55 billion tonnes of it.'
            : 'GPP is the rate at which plants make organic matter by photosynthesis. Part of it is used up in their own respiration. What remains, NPP, is the biomass available to heterotrophs: herbivores and decomposers.',
            Offset(60, size.height - 40), align: Alignment.bottomLeft, maxWidth: size.width - 120, size: 18, color: IX.ink);
      }),
    );
  }

  // ── Decomposition ─────────────────────────────────────────────────────────────────
  Widget _decomposition() {
    final k = n('kd'), t = n('month');
    final left = 100 * math.exp(-k * t);
    const kinds = {'leaves': ('Soft leaves, warm moist soil', 0.6), 'twig': ('Woody twigs (lignin)', 0.12), 'cold': ('Leaves in cold, waterlogged soil', 0.06)};
    return frame(
      title: 'Decomposition of detritus',
      subtitle: _sub,
      formula: 'detritus left = 100 e^(−kt)',
      readouts: [
        Readout('Left after ${f0(t)} months', f0(left), '%', const Color(0xFF8C6B4A)),
        Readout('Half-life', f1(math.ln2 / k), 'months', IX.accent),
        Readout('Rate k', f2(k), 'per month', IX.green),
        Readout('Becomes', 'Humus + minerals', ''),
      ],
      controls: [
        slider('kd', 'Decomposition rate k', 0.05, 1, dp: 2, div: 19, unit: '/month'),
        slider('month', 'Time', 0, 24, unit: 'months'),
        Padding(padding: const EdgeInsets.only(top: 6), child: Text('Fast: nitrogen-rich, sugary detritus in warm, moist, aerated soil. Slow: lignin, chitin; cold or anaerobic soil.', style: IX.text(17, c: IX.inkSoft))),
      ],
      painter: BioPainter((c, size) {
        // A litter bag drawn as a pile shrinking.
        final pile = Rect.fromLTWH(40, 80, size.width * 0.34, size.height * 0.5);
        Bio.heading(c, 'Leaf litter on the forest floor', Offset(pile.left, 30));
        c.drawRect(Rect.fromLTWH(pile.left, pile.bottom, pile.width, 120), Paint()..color = const Color(0xFF6B4A2B));
        final hum = (100 - left) / 100;
        c.drawRect(Rect.fromLTWH(pile.left, pile.bottom, pile.width, 30 + 40 * hum), Paint()..color = const Color(0xFF3E2A18));
        IxPaint.label(c, 'humus', Offset(pile.right - 14, pile.bottom + 18), size: 16, color: Colors.white, w: FontWeight.w600, align: Alignment.centerRight);
        final rnd = math.Random(5);
        final count = (60 * left / 100).round();
        for (var q = 0; q < count; q++) {
          final base = Offset(pile.left + 30 + rnd.nextDouble() * (pile.width - 60), pile.bottom - 8 - rnd.nextDouble() * pile.height * 0.5 * left / 100);
          final a = rnd.nextDouble() * math.pi;
          drawLeaf(c, base, base + Offset(math.cos(a) * 42, -math.sin(a) * 18), 13, color: Color.lerp(const Color(0xFFC9A227), const Color(0xFF8C5A2B), rnd.nextDouble())!, veins: false);
        }
        // Earthworm.
        final worm = Path()..moveTo(pile.left + 40, pile.bottom + 80);
        for (var q = 1; q <= 8; q++) {
          worm.lineTo(pile.left + 40 + q * 18, pile.bottom + 80 + math.sin(q * 1.1) * 8);
        }
        Bio.stroke(c, worm, const Color(0xFFC9666A), 9);
        IxPaint.label(c, 'earthworm (detritivore)', Offset(pile.left + 200, pile.bottom + 82), size: 16, color: Colors.white, w: FontWeight.w600, align: Alignment.centerLeft);
        final stepsY = pile.bottom + 150;
        Bio.note(c, 'Fragmentation → leaching → catabolism → humification → mineralisation', Offset(pile.left, stepsY), maxWidth: pile.width, size: 17, color: IX.ink, w: FontWeight.w600);
        final plot = Plot(Rect.fromLTRB(size.width * 0.50, 90, size.width - 40, size.height - 120), 0, 24, 0, 100);
        plot.frame(c, xs: [0, 6, 12, 18, 24], ys: [0, 25, 50, 75, 100], xLabel: 'Time (months)', yLabel: 'Detritus left (%)', title: 'Detritus disappears roughly exponentially');
        for (final e in kinds.values) {
          plot.curve(c, (x) => 100 * math.exp(-e.$2 * x), IX.muted, w: 2, dashed: true);
        }
        IxPaint.label(c, 'soft leaves', plot.pt(4, 100 * math.exp(-0.6 * 4)) + const Offset(30, -6), size: 15, color: IX.muted, align: Alignment.centerLeft);
        IxPaint.label(c, 'cold, waterlogged', plot.pt(20, 100 * math.exp(-0.06 * 20)) + const Offset(0, -16), size: 15, color: IX.muted);
        plot.curve(c, (x) => 100 * math.exp(-k * x), const Color(0xFF8C6B4A), w: 4.5);
        plot.hline(c, 50, IX.accent);
        plot.dot(c, t, left, const Color(0xFF8C6B4A), label: '${f0(left)}%', align: Alignment.centerLeft);
      }),
    );
  }

  // ── Energy flow ───────────────────────────────────────────────────────────────────
  Widget _flow() {
    final e = n('E'), f = n('f') / 100;
    final vals = [for (var q = 0; q < 4; q++) e * math.pow(f, q).toDouble()];
    const names = ['Producers', 'Primary consumers', 'Secondary consumers', 'Tertiary consumers'];
    const eg = ['Grass', 'Grasshopper', 'Frog', 'Snake'];
    return frame(
      title: 'Energy flow: the 10 per cent law',
      subtitle: _sub,
      formula: 'energy at next level ≈ ${f0(f * 100)}% of this level',
      readouts: [
        Readout('Producers', grp(vals[0]), 'J', _lv[0]),
        Readout('Herbivores', grp(vals[1]), 'J', _lv[1]),
        Readout('Top carnivores', f1(vals[3]), 'J', _lv[3]),
        Readout('Reaching top', f2(100 * math.pow(f, 3).toDouble()), '% of producers'),
      ],
      controls: [
        slider('E', 'Energy fixed by producers', 1000, 50000, unit: 'J', div: 49, fmt: (x) => grp(x)),
        slider('f', 'Transfer efficiency', 5, 20, unit: '%'),
      ],
      painter: BioPainter((c, size) {
        final x0 = 60.0;
        final w = (size.width - 120) / 4;
        final y = 100.0;
        for (var q = 0; q < 4; q++) {
          final r = Rect.fromLTWH(x0 + q * w + 18, y, w - 36, 120);
          Bio.box(c, r, '${names[q]}\n${eg[q]}', color: _lv[q], size: 19);
          if (q < 3) {
            IxPaint.arrow(c, Offset(r.right + 4, r.center.dy), Offset(r.right + 32, r.center.dy), IX.ink, width: 3);
          }
          IxPaint.arrow(c, Offset(r.center.dx, r.bottom + 6), Offset(r.center.dx, r.bottom + 60), IX.positive.withValues(alpha: 0.6), width: 3);
          IxPaint.label(c, 'heat, respiration', Offset(r.center.dx, r.bottom + 78), size: 15, color: IX.positive);
        }
        final plot = Plot(Rect.fromLTRB(140, 400, size.width - 60, size.height - 80), -0.5, 3.5, 0, vals[0] * 1.15);
        plot.frame(c, xs: [], ys: [0, vals[0] / 2, vals[0]], fy: (v) => grp(v), yLabel: 'Energy (J)');
        plot.bars(c, vals, _lv, labels: const ['T1 producers', 'T2 herbivores', 'T3 carnivores', 'T4 top carnivores'], fmt: (v) => v >= 100 ? grp(v) : f1(v), width: 0.6);
        Bio.note(c, 'Energy flow is one-way: sun → producers → consumers, lost as heat at each step. So food chains rarely have more than four or five links.', Offset(plot.r.right - 10, plot.r.top + 10), align: Alignment.topRight, maxWidth: 520, size: 17, color: IX.ink);
      }),
    );
  }

  // ── Pyramids ──────────────────────────────────────────────────────────────────────
  Widget _pyramid() {
    final kind = str('kind', 'energy'), cs = str('case', 'grassland');
    final f = n('f') / 100;
    // Real NCERT-style values.
    final List<double> vals;
    final List<String> labels;
    var inverted = false;
    if (kind == 'energy') {
      vals = [for (var q = 0; q < 4; q++) 1000 * math.pow(f, q).toDouble()];
      labels = ['Producers ${grp(vals[0])} J', 'Herbivores ${grp(vals[1])} J', 'Carnivores ${f1(vals[2])} J', 'Top carnivores ${f2(vals[3])} J'];
    } else if (kind == 'number') {
      if (cs == 'tree') {
        vals = [1, 50000, 120];
        labels = ['One big tree', 'Insects 50,000', 'Birds 120'];
        inverted = true;
      } else {
        vals = [5842424, 708624, 354904, 3];
        labels = ['Grass 5,842,424', 'Herbivores 708,624', 'Carnivores 354,904', 'Top carnivores 3'];
      }
    } else {
      if (cs == 'sea') {
        vals = [4, 21];
        labels = ['Phytoplankton 4 kg/m²', 'Zooplankton and fish 21 kg/m²'];
        inverted = true;
      } else {
        vals = [809, 37, 11, 1.5];
        labels = ['Producers 809 kg/m²', 'Herbivores 37', 'Carnivores 11', 'Top carnivores 1.5'];
      }
    }
    final upright = kind == 'energy' || !inverted;
    return frame(
      title: 'Ecological pyramid of ${kind == 'energy' ? 'energy' : (kind == 'number' ? 'number' : 'biomass')}',
      subtitle: _sub,
      formula: kind == 'energy' ? 'always upright' : (upright ? 'upright here' : 'inverted here'),
      readouts: [
        Readout('Shape', upright ? 'Upright' : 'Inverted', '', upright ? IX.green : IX.positive),
        Readout('Levels', '${vals.length}', ''),
        Readout('Base', labels.first.split(RegExp(r' \d')).first, '', _lv[0]),
        if (kind == 'energy') Readout('Efficiency', f0(f * 100), '% per step', IX.accent) else Readout('Example', cs == 'tree' ? 'Tree' : (cs == 'sea' ? 'Sea' : 'Grassland'), ''),
      ],
      controls: [
        choice('kind', 'Pyramid of', const {'number': 'Number', 'biomass': 'Biomass', 'energy': 'Energy'}),
        if (kind == 'number') choice('case', 'Ecosystem', const {'grassland': 'Grassland', 'tree': 'One tree'}),
        if (kind == 'biomass') choice('case', 'Ecosystem', const {'grassland': 'Grassland', 'sea': 'Sea'}),
        if (kind == 'energy') slider('f', 'Energy passed on', 5, 20, unit: '%'),
      ],
      painter: BioPainter((c, size) {
        final cx = size.width * 0.42;
        final baseY = size.height - 110;
        final h = (size.height - 220) / vals.length;
        final maxW = size.width * 0.66;
        final mx = vals.reduce(math.max);
        for (var q = 0; q < vals.length; q++) {
          // Width ~ log for numbers (huge range), linear-ish (sqrt) otherwise.
          final frac = kind == 'number' ? (math.log(vals[q] + 1) / math.log(mx + 1)) : math.sqrt(vals[q] / mx);
          final w = math.max(60.0, maxW * frac);
          final r = Rect.fromCenter(center: Offset(cx, baseY - h * (q + 0.5)), width: w, height: h - 10);
          final col = _lv[q % 4];
          c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(6)), Paint()..color = col.withValues(alpha: 0.85));
          c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(6)), Paint()..color = Bio.darken(col, 0.3)..style = PaintingStyle.stroke..strokeWidth = 2);
          IxPaint.label(c, labels[q], Offset(cx + maxW / 2 + 30, r.center.dy), size: 19, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
          IxPaint.label(c, 'T${q + 1}', r.center, size: 20, color: Colors.white, w: FontWeight.w700);
        }
        Bio.note(c, switch ((kind, cs)) {
          ('energy', _) => 'The pyramid of energy is always upright: energy is lost as heat at every step, so each level has less than the one below.',
          ('number', 'tree') => 'One big tree supports thousands of insects, which feed a few birds: an inverted (spindle-shaped) pyramid of number.',
          ('biomass', 'sea') => 'In the sea a small standing crop of fast-dividing phytoplankton supports a larger biomass of zooplankton and fish: inverted.',
          _ => 'Usually upright: producers outnumber and outweigh herbivores, which outnumber carnivores. (Grassland numbers from NCERT.)',
        }, Offset(40, 30), maxWidth: size.width - 80, size: 18, color: IX.ink);
        Bio.note(c, kind == 'number' ? 'Bar widths on a log scale.' : 'Bar widths ∝ √value.', Offset(40, size.height - 40), size: 15, color: IX.muted);
      }),
    );
  }
}
