import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bio_kit.dart';

/// Respiration in plants (1st PUC Biology ch. 12; microbes ch. 8 of 2nd PUC): glycolysis
/// step by step, fermentation, the link reaction and Krebs cycle, the electron transport
/// system and oxidative phosphorylation, and the respiratory quotient.
///
/// Preset: {"mode": "glycolysis"|"fermentation"|"krebs"|"ets"|"rq", "step": 0, "glucose": 1,
/// "grams": 180, "kind": "alcoholic", "share": 100, "nadh": 10, "fadh": 2, "co2": 14, "o2": 20}.
class RespirationInstrument extends StatefulWidget {
  const RespirationInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<RespirationInstrument> createState() => _RespState();
}

// name, product, carbons, atp delta, nadh delta, per-glucose multiplicity
const _gly = [
  ('Glucose → glucose-6-phosphate', 'Hexokinase; ATP → ADP', -1, 0),
  ('Glucose-6-P → fructose-6-phosphate', 'Isomerisation', 0, 0),
  ('Fructose-6-P → fructose-1,6-bisphosphate', 'Phosphofructokinase; ATP → ADP', -1, 0),
  ('Fructose-1,6-bisP → DHAP + 3-PGAL', 'Split into two 3-carbon sugars', 0, 0),
  ('DHAP → 3-PGAL', 'Now two 3-PGAL per glucose', 0, 0),
  ('3-PGAL → 1,3-bisphosphoglycerate', '2 NAD⁺ → 2 NADH + H⁺', 0, 2),
  ('1,3-BPGA → 3-phosphoglyceric acid', '2 ADP → 2 ATP', 2, 0),
  ('3-PGA → 2-phosphoglycerate', 'Phosphate moves', 0, 0),
  ('2-PGA → phosphoenolpyruvate', '2 H₂O removed', 0, 0),
  ('PEP → pyruvic acid', '2 ADP → 2 ATP', 2, 0),
];

class _RespState extends BioState<RespirationInstrument> {
  @override
  String get instrumentId => 'bio-respiration';
  @override
  Map<String, dynamic> get lessonPreset => widget.preset;
  @override
  List<String> get modes => const ['glycolysis', 'fermentation', 'krebs', 'ets', 'rq'];
  @override
  Map<String, Map<String, dynamic>> get presets => const {
    'Glycolysis': {'mode': 'glycolysis'},
    'Alcoholic fermentation': {'mode': 'fermentation'},
    'Lactic acid (muscle)': {'mode': 'fermentation', 'kind': 'lactic'},
    'Krebs cycle': {'mode': 'krebs'},
    'Electron transport': {'mode': 'ets'},
    'Respiratory quotient': {'mode': 'rq'},
  };
  @override
  Map<String, Object> defaults(String mode) => {'step': 0, 'glucose': 1, 'grams': 180, 'kind': 'alcoholic', 'share': 100, 'nadh': 10, 'fadh': 2, 'co2': 14, 'o2': 20, 'days': 3};

  static const _sub = '1st PUC Biology · Respiration in plants';

  @override
  Widget build(BuildContext context) => switch (mode) {
    'fermentation' => _ferm(),
    'krebs' => _krebs(),
    'ets' => _ets(),
    'rq' => _rq(),
    _ => _glycolysis(),
  };

  // ------------------------------------------------------------------ glycolysis

  Widget _glycolysis() {
    final st = i('step').clamp(0, 9), g = i('glucose').clamp(1, 20);
    var used = 0, made = 0, nadh = 0;
    for (var k = 0; k <= st; k++) {
      final d = _gly[k].$3;
      if (d < 0) used -= d;
      if (d > 0) made += d;
      nadh += _gly[k].$4;
    }
    return frame(
      title: 'Glycolysis (EMP pathway), step ${st + 1}',
      subtitle: _sub,
      formula: 'glucose → 2 pyruvate + 2 ATP + 2 NADH',
      readouts: [
        Readout('ATP used', '${used * g}', '', IX.positive),
        Readout('ATP made', '${made * g}', '', IX.green),
        Readout('Net ATP', '${(made - used) * g}', '', IX.accent),
        Readout('NADH', '${nadh * g}', '', BioC.nadh),
      ],
      controls: [
        stepper('step', [for (final e in _gly) e.$1.split(' → ').last], label: 'Reaction'),
        slider('glucose', 'Glucose molecules', 1, 20),
      ],
      painter: BioPainter((c, size) {
        Bio.heading(c, 'In the cytoplasm', const Offset(40, 24), color: IX.inkSoft);
        final top = 70.0, h = (size.height - top - 40) / 10;
        final x0 = 60.0, w = size.width * 0.50;
        for (var k = 0; k < 10; k++) {
          final r = Rect.fromLTWH(x0, top + k * h + 4, w, h - 12);
          final done = k < st, now = k == st;
          final col = now ? IX.accent : (done ? IX.inkSoft : IX.muted);
          Bio.card(c, r, fill: now ? const Color(0xFFEAF0FE) : (done ? IX.paper : IX.page), edge: now ? IX.accent : IX.rule, radius: 12);
          IxPaint.label(c, '${k + 1}', Offset(r.left + 26, r.center.dy), size: 18, color: col, w: FontWeight.w700);
          IxPaint.label(c, _gly[k].$1, Offset(r.left + 52, r.center.dy), size: 18, color: now ? IX.ink : col, w: now ? FontWeight.w700 : FontWeight.w500, align: Alignment.centerLeft);
          final d = _gly[k].$3, nd = _gly[k].$4;
          final tx = r.right + 24;
          if (d != 0) Bio.tag(c, d < 0 ? '−${-d} ATP' : '+$d ATP', Offset(tx + 50, r.center.dy), d < 0 ? IX.positive : IX.green, size: 16);
          if (nd != 0) Bio.tag(c, '+$nd NADH', Offset(tx + 50, r.center.dy), BioC.nadh, size: 16);
          if (k == 3) IxPaint.label(c, '× 2 from here', Offset(r.right - 12, r.bottom + 6), size: 15, color: IX.amber, w: FontWeight.w700, align: Alignment.centerRight, halo: true);
        }
        // Carbon skeleton illustration of the current molecule.
        final card = Rect.fromLTWH(size.width * 0.70, 70, size.width * 0.30 - 30, size.height - 110);
        Bio.card(c, card);
        Bio.heading(c, _gly[st].$2, card.topLeft + const Offset(20, 18), size: 19, color: IX.accent);
        final carbons = st < 3 ? [6] : [3, 3];
        final cy = card.top + card.height * 0.42;
        for (var m = 0; m < carbons.length; m++) {
          final nC = carbons[m];
          final cx = card.center.dx + (carbons.length == 1 ? 0 : (m == 0 ? -1 : 1) * card.width * 0.22);
          for (var j = 0; j < nC; j++) {
            final p = Offset(cx, cy - (nC - 1) * 22 + j * 44);
            if (j > 0) c.drawLine(p - const Offset(0, 44), p, Paint()..color = IX.inkSoft..strokeWidth = 3);
            Bio.soft(c, Path()..addOval(Rect.fromCircle(center: p, radius: 16)), const Color(0xFF59627E), stroke: 1.5);
            IxPaint.label(c, 'C', p, size: 15, color: Colors.white, w: FontWeight.w700);
          }
          final phos = st == 0 || st == 1 ? [nC - 1] : (st == 2 || st == 3 ? (nC == 6 ? [0, 5] : [2]) : (st >= 9 ? <int>[] : (st == 5 ? [0, 2] : [2])));
          for (final j in phos) {
            final p = Offset(cx + 46, cy - (nC - 1) * 22 + j * 44);
            c.drawLine(p - const Offset(30, 0), p, Paint()..color = IX.amber..strokeWidth = 3);
            Bio.tag(c, 'P', p, IX.amber, size: 15);
          }
        }
        Bio.note(c, st >= 9 ? 'End of glycolysis: 2 pyruvic acid per glucose. With O₂ they enter the mitochondrion; without it they are fermented.' : 'Glycolysis needs no oxygen; it runs in the cytoplasm of every living cell.', card.bottomLeft + const Offset(20, -20), align: Alignment.bottomLeft, maxWidth: card.width - 40, size: 17, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ fermentation

  Widget _ferm() {
    final gr = n('grams'), share = n('share') / 100;
    final lactic = str('kind') == 'lactic';
    final used = gr * share;
    final eth = used * 92 / 180, co2 = used * 88 / 180;
    final mol = used / 180;
    return frame(
      title: lactic ? 'Lactic acid fermentation' : 'Alcoholic fermentation by yeast',
      subtitle: '1st PUC Biology · Respiration; 2nd PUC · Microbes in human welfare',
      formula: lactic ? 'C₆H₁₂O₆ → 2 CH₃CH(OH)COOH' : 'C₆H₁₂O₆ → 2 C₂H₅OH + 2 CO₂',
      readouts: [
        Readout('Glucose fermented', f0(used), 'g', BioC.sugar),
        Readout(lactic ? 'Lactic acid' : 'Ethanol', f0(lactic ? used : eth), 'g', IX.accent),
        Readout('CO₂', lactic ? '0' : f0(co2), 'g', IX.inkSoft),
        Readout('Net ATP', '${f1(mol * 2)} mol', '(2 per glucose)', IX.green),
      ],
      controls: [
        choice('kind', 'Pathway', const {'alcoholic': 'Alcoholic (yeast)', 'lactic': 'Lactic (muscle, LAB)'}),
        slider('grams', 'Glucose', 18, 360, unit: 'g', div: 19),
        slider('share', 'Share of sugar fermented', 0, 100, unit: '%'),
      ],
      painter: BioPainter((c, size) {
        // Flask.
        final cx = size.width * 0.30, base = size.height - 80;
        final bodyW = size.width * 0.30, fh = size.height * 0.55, neckW = 70.0;
        final ft = base - fh;
        final flask = Path()
          ..moveTo(cx - neckW / 2, ft)
          ..lineTo(cx - neckW / 2, ft + fh * 0.3)
          ..quadraticBezierTo(cx - bodyW / 2, ft + fh * 0.55, cx - bodyW / 2, base - 70)
          ..quadraticBezierTo(cx - bodyW / 2, base, cx, base)
          ..quadraticBezierTo(cx + bodyW / 2, base, cx + bodyW / 2, base - 70)
          ..quadraticBezierTo(cx + bodyW / 2, ft + fh * 0.55, cx + neckW / 2, ft + fh * 0.3)
          ..lineTo(cx + neckW / 2, ft)
          ..close();
        c.save();
        c.clipPath(flask);
        final ly = ft + fh * 0.42;
        final liq = Color.lerp(const Color(0xFFF6E7B4), const Color(0xFFE9D7A0), share)!;
        c.drawRect(Rect.fromLTRB(cx - bodyW, ly, cx + bodyW, base), Paint()..color = liq);
        final rnd = math.Random(4);
        if (!lactic) {
          for (var k = 0; k < (40 * share).round(); k++) {
            c.drawCircle(Offset(cx - bodyW * 0.4 + rnd.nextDouble() * bodyW * 0.8, ly + 10 + rnd.nextDouble() * (base - ly - 20)), 3 + rnd.nextDouble() * 5, Paint()..color = Colors.white.withValues(alpha: 0.85)..style = PaintingStyle.stroke..strokeWidth = 1.6);
          }
        }
        for (var k = 0; k < 40; k++) {
          final p = Offset(cx - bodyW * 0.42 + rnd.nextDouble() * bodyW * 0.84, base - 10 - rnd.nextDouble() * 60);
          Bio.soft(c, Bio.blob(p, 7, 6, seed: k, wobble: 0.1), const Color(0xFFD2B48C), stroke: 1, shadow: false);
        }
        c.restore();
        c.drawPath(flask, Paint()..color = IX.glassEdge..style = PaintingStyle.stroke..strokeWidth = 3);
        // Stopper and delivery tube to limewater.
        c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(cx, ft - 6), width: neckW + 16, height: 28), const Radius.circular(6)), Paint()..color = const Color(0xFF8A5A3C));
        if (!lactic) {
          final tube = Path()..moveTo(cx, ft - 20)..lineTo(cx, ft - 60)..lineTo(cx + bodyW * 0.85, ft - 60)..lineTo(cx + bodyW * 0.85, base - 120);
          Bio.stroke(c, tube, IX.glassEdge, 6);
          final tb = Rect.fromCenter(center: Offset(cx + bodyW * 0.85, base - 90), width: 90, height: 160);
          c.drawRRect(RRect.fromRectAndRadius(tb, const Radius.circular(12)), Paint()..color = Color.lerp(const Color(0xFFEFF6FB), const Color(0xFFE6E6E6), share)!);
          c.drawRRect(RRect.fromRectAndRadius(tb, const Radius.circular(12)), Paint()..color = IX.glassEdge..style = PaintingStyle.stroke..strokeWidth = 3);
          IxPaint.label(c, 'Lime water ${share > 0.3 ? 'turns milky' : ''}', tb.bottomCenter + const Offset(0, 22), size: 17, color: IX.inkSoft, w: FontWeight.w600);
        }
        final parts = [
          BioPart('y', lactic ? 'Lactic acid bacteria / muscle cells' : 'Yeast cells', Offset(cx - bodyW * 0.2, base - 30)),
          BioPart('s', lactic ? 'Sugar solution' : 'Sugar solution, no air', Offset(cx - bodyW * 0.3, ly + 40)),
        ];
        drawLabels(c, parts, {'y': Offset(cx - bodyW / 2 - 30, base - 30), 's': Offset(cx - bodyW / 2 - 30, ly + 10)}, null);
        // Pathway.
        final px = size.width * 0.60;
        final bw = size.width * 0.34;
        Bio.box(c, Rect.fromLTWH(px, 60, bw, 64), 'Glucose (6C)', color: BioC.sugar, size: 20);
        IxPaint.arrow(c, Offset(px + bw / 2, 128), Offset(px + bw / 2, 180), IX.inkSoft);
        Bio.box(c, Rect.fromLTWH(px, 184, bw, 64), '2 Pyruvic acid (3C)', color: IX.accent, size: 20);
        IxPaint.label(c, 'glycolysis: +2 ATP, 2 NADH', Offset(px + bw / 2 + 16, 154), size: 16, color: IX.green, w: FontWeight.w600, align: Alignment.centerLeft);
        IxPaint.arrow(c, Offset(px + bw / 2, 252), Offset(px + bw / 2, 330), IX.inkSoft);
        IxPaint.label(c, lactic ? 'lactate dehydrogenase; NADH → NAD⁺' : 'decarboxylase, alcohol dehydrogenase', Offset(px + bw / 2 + 16, 290), size: 16, color: BioC.nadh, w: FontWeight.w600, align: Alignment.centerLeft);
        Bio.box(c, Rect.fromLTWH(px, 334, bw, 64), lactic ? '2 Lactic acid' : '2 Ethanol + 2 CO₂', color: IX.positive, size: 20, filled: true);
        Bio.note(c, 'Only 2 ATP per glucose — less than 7% of the energy in glucose is released, against 38 ATP in aerobic respiration. ${lactic ? 'In muscles during heavy exercise, lactic acid builds up and causes fatigue.' : 'Yeasts poison themselves at about 13% alcohol. The CO₂ makes dough rise; the ethanol evaporates in baking.'}', Offset(px, 440), maxWidth: bw, size: 18, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ krebs

  Widget _krebs() {
    final g = i('glucose').clamp(1, 20);
    return frame(
      title: 'The link reaction and the Krebs cycle',
      subtitle: _sub,
      formula: 'per glucose: 2 turns of the cycle',
      readouts: [
        Readout('CO₂ released', '${6 * g}', '', IX.inkSoft),
        Readout('NADH', '${8 * g}', '(2 link + 6 cycle)', BioC.nadh),
        Readout('FADH₂', '${2 * g}', '', IX.amber),
        Readout('ATP (via GTP)', '${2 * g}', '', BioC.atp),
      ],
      controls: [slider('glucose', 'Glucose molecules', 1, 20)],
      painter: BioPainter((c, size) {
        // Mitochondrion outline behind the cycle.
        final mc = Offset(size.width * 0.5, size.height * 0.45);
        Bio.soft(c, Bio.blob(mc, size.width * 0.47, size.height * 0.40, seed: 4, wobble: 0.02), const Color(0xFFF8E3D2), stroke: 3, edge: BioC.mito);
        IxPaint.label(c, 'Mitochondrial matrix', mc + Offset(size.width * 0.25, -size.height * 0.34), size: 17, color: Bio.darken(BioC.mito, 0.3), w: FontWeight.w700);
        final ctr = mc + const Offset(60, 20);
        final R = math.min(size.width * 0.17, size.height * 0.25);
        c.drawCircle(ctr, R, Paint()..color = Bio.lighten(BioC.mito, 0.4)..style = PaintingStyle.stroke..strokeWidth = 14);
        final nodes = [
          ('Citric acid (6C)', -math.pi / 2),
          ('α-Ketoglutaric acid (5C)', -math.pi / 2 + 1.25),
          ('Succinyl-CoA (4C)', -math.pi / 2 + 2.3),
          ('Succinic acid (4C)', -math.pi / 2 + 3.2),
          ('Malic acid (4C)', -math.pi / 2 + 4.3),
          ('Oxaloacetic acid (4C)', -math.pi / 2 + 5.4),
        ];
        final outs = [
          (0.62, 'CO₂ + NADH', BioC.nadh),
          (1.78, 'CO₂ + NADH', BioC.nadh),
          (2.75, 'GTP → ATP', BioC.atp),
          (3.75, 'FADH₂', IX.amber),
          (4.85, 'NADH', BioC.nadh),
        ];
        for (final (a, t, col) in outs) {
          final ang = -math.pi / 2 + a;
          final p = ctr + Offset(math.cos(ang), math.sin(ang)) * R;
          final q = ctr + Offset(math.cos(ang), math.sin(ang)) * (R + 90);
          IxPaint.arrow(c, p, q, col, width: 3);
          Bio.tag(c, t, ctr + Offset(math.cos(ang), math.sin(ang)) * (R + 120), col, size: 16);
        }
        for (final (name, a) in nodes) {
          final p = ctr + Offset(math.cos(a), math.sin(a)) * R;
          final r = Rect.fromCenter(center: p, width: 220, height: 44);
          Bio.box(c, r, name, color: BioC.mito, size: 16, filled: true);
        }
        // Link reaction.
        final lk = Offset(ctr.dx - R - 270, ctr.dy - R - 40);
        Bio.box(c, Rect.fromCenter(center: lk, width: 220, height: 48), 'Pyruvic acid (3C)', color: IX.accent, size: 17);
        IxPaint.arrow(c, lk + const Offset(0, 26), lk + const Offset(0, 110), IX.inkSoft);
        Bio.tag(c, 'CO₂ + NADH', lk + const Offset(-100, 68), BioC.nadh, size: 16);
        IxPaint.label(c, 'link reaction', lk + const Offset(12, 68), size: 15, color: IX.inkSoft, align: Alignment.centerLeft);
        Bio.box(c, Rect.fromCenter(center: lk + const Offset(0, 136), width: 220, height: 48), 'Acetyl CoA (2C)', color: IX.accent, size: 17, filled: true);
        final ca = ctr + Offset(math.cos(-math.pi / 2), math.sin(-math.pi / 2)) * R;
        Bio.curvedArrow(c, lk + const Offset(110, 136), ca + const Offset(-112, 0), IX.accent, bend: -40);
        Bio.note(c, 'Per pyruvate: 3 CO₂, 4 NADH, 1 FADH₂, 1 ATP. Per glucose (two pyruvates): 6 CO₂, 8 NADH, 2 FADH₂, 2 ATP — every carbon of glucose leaves as CO₂.', Offset(40, size.height - 30), align: Alignment.bottomLeft, maxWidth: size.width * 0.42, size: 17, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ ETS

  Widget _ets() {
    final nd = i('nadh'), fd = i('fadh');
    final atp = 3 * nd + 2 * fd;
    final pairs = nd + fd;
    return frame(
      title: 'Electron transport and oxidative phosphorylation',
      subtitle: _sub,
      formula: 'NADH → 3 ATP, FADH₂ → 2 ATP',
      readouts: [
        Readout('ATP from the chain', '$atp', '', BioC.atp),
        Readout('O₂ used', pairs.isEven ? '${pairs ~/ 2}' : f1(pairs / 2), 'molecules', IX.accent),
        Readout('Water formed', '$pairs', 'H₂O', BioC.water),
        Readout('Glucose total', '38', 'ATP (NCERT)', IX.green),
      ],
      controls: [
        slider('nadh', 'NADH oxidised', 0, 20),
        slider('fadh', 'FADH₂ oxidised', 0, 10),
        Padding(padding: const EdgeInsets.only(top: 4), child: Text('One glucose: 10 NADH and 2 FADH₂ give 34 ATP; with 4 from glycolysis and Krebs, 38 in all.', style: IX.text(17, c: IX.inkSoft))),
      ],
      painter: BioPainter((c, size) {
        final y = size.height * 0.52;
        c.drawRect(Rect.fromLTRB(30, 30, size.width - 30, y - 40), Paint()..color = const Color(0xFFFFF4EA));
        c.drawRect(Rect.fromLTRB(30, y + 40, size.width - 30, size.height - 40), Paint()..color = const Color(0xFFF7E6D6));
        Bio.bilayer(c, Offset(30, y), Offset(size.width - 30, y), h: 80, head: BioC.mito);
        IxPaint.label(c, 'INTERMEMBRANE SPACE (H⁺ build up)', const Offset(50, 54), size: 18, color: Bio.darken(BioC.mito, 0.3), w: FontWeight.w700, align: Alignment.centerLeft);
        IxPaint.label(c, 'MATRIX', Offset(50, size.height - 64), size: 18, color: Bio.darken(BioC.mito, 0.3), w: FontWeight.w700, align: Alignment.centerLeft);
        IxPaint.label(c, 'Inner mitochondrial membrane', Offset(size.width - 50, y - 56), size: 16, color: IX.inkSoft, align: Alignment.centerRight);
        final xs = [0.12, 0.27, 0.40, 0.52, 0.64, 0.84].map((f) => 30 + (size.width - 60) * f).toList();
        final names = ['I', 'II', 'Q', 'III', 'cyt c', 'IV'];
        final cols = [const Color(0xFF7C3AED), const Color(0xFFB45309), const Color(0xFFE0A030), const Color(0xFF3F6FB5), const Color(0xFFC0504D), const Color(0xFF15803D)];
        for (var k = 0; k < 6; k++) {
          final small = k == 2 || k == 4;
          final off = k == 4 ? -50.0 : 0.0;
          Bio.soft(c, Bio.blob(Offset(xs[k], y + off), small ? 28 : 54, small ? 26 : 60, seed: k + 3, wobble: 0.07), cols[k], stroke: 2);
          IxPaint.label(c, names[k], Offset(xs[k], y + off), size: small ? 15 : 22, color: Colors.white, w: FontWeight.w700);
        }
        final ePath = Path()..moveTo(xs[0], y)..lineTo(xs[2], y)..lineTo(xs[3], y)..quadraticBezierTo(xs[4] - 20, y - 60, xs[4], y - 50)..quadraticBezierTo(xs[5] - 40, y - 40, xs[5], y);
        IxPaint.dashed(c, Offset(xs[1], y + 10), Offset(xs[2], y + 10), Paint()..color = IX.accent..strokeWidth = 3);
        Bio.stroke(c, ePath, IX.accent, 3);
        Bio.tag(c, 'NADH → NAD⁺', Offset(xs[0], y + 110), BioC.nadh, size: 16);
        Bio.tag(c, 'FADH₂ → FAD', Offset(xs[1], y + 110), IX.amber, size: 16);
        Bio.tag(c, '½O₂ + 2H⁺ → H₂O', Offset(xs[5], y + 110), BioC.water, size: 16);
        for (final k in [0, 3, 5]) {
          IxPaint.arrow(c, Offset(xs[k] + 26, y + 60), Offset(xs[k] + 26, y - 90), IX.positive, width: 2.5);
          IxPaint.label(c, 'H⁺', Offset(xs[k] + 26, y - 106), size: 16, color: IX.positive, w: FontWeight.w700);
        }
        // Complex V: ATP synthase F0–F1.
        final ax = 30 + (size.width - 60) * 0.95;
        Bio.soft(c, Path()..addRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(ax - 20, y), width: 50, height: 86), const Radius.circular(12))), const Color(0xFFC2410C), stroke: 2);
        c.drawRect(Rect.fromCenter(center: Offset(ax - 20, y + 66), width: 14, height: 46), Paint()..color = const Color(0xFF9A3412));
        Bio.soft(c, Path()..addOval(Rect.fromCenter(center: Offset(ax - 20, y + 110), width: 90, height: 60)), const Color(0xFFC2410C), stroke: 2);
        IxPaint.label(c, 'F₁', Offset(ax - 20, y + 110), size: 17, color: Colors.white, w: FontWeight.w700);
        IxPaint.label(c, 'V', Offset(ax - 20, y), size: 20, color: Colors.white, w: FontWeight.w700);
        IxPaint.arrow(c, Offset(ax - 60, y - 90), Offset(ax - 60, y + 60), IX.positive, width: 3);
        Bio.tag(c, '$atp ATP', Offset(ax - 70, y + 170), BioC.atp, size: 18);
        Bio.note(c, 'Electrons pass from complex I (NADH) or II (FADH₂) through ubiquinone, complex III and cytochrome c to complex IV, where O₂, the final acceptor, forms water. The energy pumps protons; their flow back through complex V (F₀–F₁) makes ATP.', const Offset(50, 90), align: Alignment.topLeft, maxWidth: size.width * 0.8, size: 18, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ RQ

  Widget _rq() {
    final co2 = n('co2'), o2 = n('o2');
    final rq = o2 > 0 ? co2 / o2 : 0.0;
    final sub = rq < 0.8 ? 'Fats' : (rq < 0.95 ? 'Proteins' : (rq <= 1.05 ? 'Carbohydrates' : 'Organic acids'));
    return frame(
      title: 'Respiratory quotient',
      subtitle: _sub,
      formula: 'RQ = CO₂ evolved ÷ O₂ consumed',
      readouts: [
        Readout('RQ', f2(rq), '', IX.accent),
        Readout('Substrate', sub, '', IX.green),
        Readout('CO₂ evolved', f1(co2), 'mL'),
        Readout('O₂ consumed', f1(o2), 'mL'),
      ],
      controls: [
        slider('co2', 'CO₂ evolved', 0, 40, unit: 'mL', dp: 1, div: 80),
        slider('o2', 'O₂ consumed', 1, 40, unit: 'mL', dp: 1, div: 78),
      ],
      painter: BioPainter((c, size) {
        final rows = [
          ('Carbohydrate', 'C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + energy', '6 CO₂ ÷ 6 O₂ = 1.0', 1.0),
          ('Fat (tripalmitin)', '2C₅₁H₉₈O₆ + 145O₂ → 102CO₂ + 98H₂O + energy', '102 ÷ 145 = 0.7', 0.7),
          ('Protein', 'mixed amino acids, varies with the protein', '0.9 (approx.)', 0.9),
          ('Organic acid (malic)', 'C₄H₆O₅ + 3O₂ → 4CO₂ + 3H₂O', '4 ÷ 3 = 1.33', 1.33),
        ];
        final plot = Plot(Rect.fromLTRB(60, 120, size.width - 60, 190), 0.5, 1.5, 0, 1);
        Bio.heading(c, 'Where your measurement falls', const Offset(60, 40));
        final ax = Paint()..color = IX.inkSoft..strokeWidth = 3;
        c.drawLine(plot.pt(0.5, 0.5), plot.pt(1.5, 0.5), ax);
        for (var x = 0.5; x <= 1.51; x += 0.1) {
          final p = plot.pt(x, 0.5);
          c.drawLine(p - const Offset(0, 8), p + const Offset(0, 8), ax..strokeWidth = 2);
          IxPaint.label(c, x.toStringAsFixed(1), p + const Offset(0, 24), size: 16, color: IX.inkSoft);
        }
        for (final r in rows) {
          final p = plot.pt(r.$4, 0.5);
          IxPaint.label(c, r.$1.split(' (').first, p + const Offset(0, -26), size: 16, color: IX.green, w: FontWeight.w700);
        }
        final mp = plot.pt(rq.clamp(0.5, 1.5), 0.5);
        c.drawCircle(mp, 14, Paint()..color = IX.accent);
        c.drawCircle(mp, 14, Paint()..color = Colors.white..style = PaintingStyle.stroke..strokeWidth = 3);
        var y = 260.0;
        final w = size.width - 120;
        for (final r in rows) {
          final on = r.$1.startsWith(sub.substring(0, 4));
          final rect = Rect.fromLTWH(60, y, w, 110);
          Bio.card(c, rect, fill: on ? const Color(0xFFEFF6EE) : IX.paper, edge: on ? IX.green : IX.rule);
          Bio.heading(c, r.$1, rect.topLeft + const Offset(22, 16), size: 21, color: on ? IX.green : IX.ink);
          IxPaint.label(c, r.$2, rect.topLeft + const Offset(22, 74), size: 19, color: IX.ink, align: Alignment.centerLeft);
          IxPaint.label(c, 'RQ = ${r.$3}', rect.topRight + const Offset(-22, 55), size: 21, color: on ? IX.green : IX.inkSoft, w: FontWeight.w700, align: Alignment.centerRight);
          y += 128;
        }
      }),
    );
  }
}
