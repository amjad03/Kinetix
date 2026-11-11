import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bio_kit.dart';

/// Chemical coordination and integration (1st PUC Biology ch. 19; homeostasis ch. 7 and 2nd PUC
/// ch. 11): the endocrine glands (tap one), the hypothalamus–pituitary–thyroid feedback loop
/// with iodine and goitre, insulin and blood glucose, regulators and conformers, and the two
/// mechanisms of hormone action.
///
/// Preset: {"mode": "glands"|"thyroid"|"glucose"|"thermo"|"action", "focus": id, "iodine": 100
/// (% of need), "carb": 75 (g), "insulin": 100 (%), "ambient": 20 (°C), "kind": "protein"}.
class EndocrineInstrument extends StatefulWidget {
  const EndocrineInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<EndocrineInstrument> createState() => _EndoState();
}

class _EndoState extends BioState<EndocrineInstrument> {
  @override
  String get instrumentId => 'bio-endocrine';
  @override
  Map<String, dynamic> get lessonPreset => widget.preset;
  @override
  List<String> get modes => const ['glands', 'thyroid', 'glucose', 'thermo', 'action'];
  @override
  Map<String, Map<String, dynamic>> get presets => const {
    'Endocrine glands': {'mode': 'glands'},
    'Pituitary': {'mode': 'glands', 'focus': 'pituitary'},
    'Thyroid feedback': {'mode': 'thyroid'},
    'Iodine deficiency': {'mode': 'thyroid', 'iodine': 20},
    'Insulin and glucose': {'mode': 'glucose'},
    'Diabetes mellitus': {'mode': 'glucose', 'insulin': 15},
    'Regulators and conformers': {'mode': 'thermo'},
    'How hormones act': {'mode': 'action'},
  };
  @override
  Map<String, Object> defaults(String mode) => {'iodine': 100, 'carb': 75, 'insulin': 100, 'ambient': 20, 'kind': 'protein'};

  List<BioPart> _parts = const [];
  Map<String, Offset> _labels = const {};

  @override
  Widget build(BuildContext context) => switch (mode) {
    'thyroid' => _thyroid(),
    'glucose' => _glucose(),
    'thermo' => _thermo(),
    'action' => _action(),
    _ => _glands(),
  };

  static const _sub = '1st PUC Biology · Chemical coordination and integration';

  /// A human figure, front view, centred at [c], [k] px per unit (figure ≈ 600 units tall).
  static void figure(Canvas c, Offset ctr, double k, {Color fill = const Color(0xFFF6E2D6)}) {
    Offset p(double x, double y) => ctr + Offset(x, y) * k;
    final body = Bio.smooth([
      p(0, -300), p(42, -290), p(52, -250), p(40, -205), p(30, -190), p(110, -170), p(130, -120), p(140, 20), p(118, 30), p(100, -90), p(95, 60), p(70, 300), p(30, 300), p(10, 110),
      p(-10, 110), p(-30, 300), p(-70, 300), p(-95, 60), p(-100, -90), p(-118, 30), p(-140, 20), p(-130, -120), p(-110, -170), p(-30, -190), p(-40, -205), p(-52, -250), p(-42, -290),
    ]);
    Bio.soft(c, body, fill, stroke: 2.5, edge: const Color(0xFFD1A891), light: 0.4);
  }

  Widget _glands() {
    final focus = s['focus'];
    return frame(
      title: 'Human endocrine glands',
      subtitle: _sub,
      formula: 'hormones: chemical messengers in blood',
      readouts: const [
        Readout('Master link', 'Hypothalamus', '→ pituitary', IX.accent),
        Readout('Largest gland', 'Thyroid', ''),
        Readout('Mixed gland', 'Pancreas', ''),
        Readout('Glands shown', '9', ''),
      ],
      controls: [Padding(padding: const EdgeInsets.only(top: 4), child: Text('Tap a gland to see its hormones and what they do.', style: IX.text(18, c: IX.inkSoft)))],
      onTap: (at, size) {
        final id = hitPart(_parts, _labels, at);
        setState(() => id == null || id == s['focus'] ? s.remove('focus') : s['focus'] = id);
      },
      painter: BioPainter((c, size) {
        final infoH = 118.0;
        final k = (size.height - infoH - 70) / 620;
        final ctr = Offset(size.width * 0.5, 30 + 310 * k);
        figure(c, ctr, k);
        Offset p(double x, double y) => ctr + Offset(x, y) * k;
        void gland(Offset at, double rx, double ry, Color col, {int seed = 2}) => Bio.soft(c, Bio.blob(at, rx * k, ry * k, seed: seed, wobble: 0.08), col, stroke: 1.8);
        gland(p(0, -262), 12, 8, const Color(0xFFC98A9E));
        gland(p(0, -246), 7, 7, const Color(0xFFB0475A));
        gland(p(10, -272), 5, 5, const Color(0xFF8C6BB1));
        gland(p(-14, -192), 12, 16, const Color(0xFFC0504D));
        gland(p(14, -192), 12, 16, const Color(0xFFC0504D));
        for (final o in [const Offset(-14, -200), const Offset(14, -200), const Offset(-14, -184), const Offset(14, -184)]) {
          c.drawCircle(p(o.dx, o.dy), 3.5 * k, Paint()..color = const Color(0xFFE0A030));
        }
        gland(p(0, -150), 22, 16, const Color(0xFFD9A3B0));
        for (final sd in [-1.0, 1.0]) {
          gland(p(sd * 34, -40), 13, 9, const Color(0xFFE0A030), seed: 5);
          c.drawOval(Rect.fromCenter(center: p(sd * 34, -22), width: 22 * k, height: 34 * k), Paint()..color = const Color(0xFFB5577A).withValues(alpha: 0.35));
        }
        gland(p(10, -10), 36, 9, const Color(0xFFE6B87A), seed: 7);
        for (final sd in [-1.0, 1.0]) {
          gland(p(sd * 14, 108), 9, 13, const Color(0xFF6E8FC7), seed: 9);
        }
        final parts = [
          BioPart('hypo', 'Hypothalamus', p(0, -262), 'Neurosecretory cells make releasing hormones (e.g. GnRH, TRH) and inhibiting hormones (e.g. somatostatin) that control the pituitary through a portal system. Oxytocin and vasopressin are made here and stored in the posterior pituitary.'),
          BioPart('pituitary', 'Pituitary', p(0, -246), 'Adenohypophysis: GH, PRL, TSH, ACTH, LH, FSH (and MSH). Neurohypophysis releases oxytocin and vasopressin (ADH). Too much GH in childhood → gigantism; too little → pituitary dwarfism.'),
          BioPart('pineal', 'Pineal', p(10, -272), 'Secretes melatonin: regulates the 24-hour diurnal rhythm, sleep–wake cycle and body temperature.'),
          BioPart('thyroid', 'Thyroid', p(-14, -192), 'Two lobes joined by an isthmus. Thyroxine (T₄) and T₃ regulate the basal metabolic rate; thyrocalcitonin lowers blood calcium. Iodine deficiency → goitre; in pregnancy, stunted growth (cretinism) of the baby.'),
          BioPart('para', 'Parathyroid', p(14, -184), 'Four glands on the back of the thyroid. Parathyroid hormone raises blood Ca²⁺ (from bone, kidney, gut): hypercalcaemic.'),
          BioPart('thymus', 'Thymus', p(0, -150), 'A lobular gland over the heart; thymosins help T-lymphocytes differentiate and promote antibody production. It shrinks with age.'),
          BioPart('adrenal', 'Adrenal', p(34, -40), 'Medulla: adrenaline and noradrenaline (catecholamines), the "fight or flight" hormones. Cortex: glucocorticoids (cortisol), mineralocorticoids (aldosterone) and some androgens. Deficiency of cortex hormones → Addison\'s disease.'),
          BioPart('pancreas', 'Pancreas (islets)', p(10, -10), 'Islets of Langerhans: α-cells make glucagon (raises blood glucose), β-cells make insulin (lowers it). Lack of insulin action → diabetes mellitus.'),
          BioPart('gonad', 'Testis / ovary', p(14, 108), 'Testis: androgens, mainly testosterone (Leydig cells). Ovary: estrogen (growing follicles) and progesterone (corpus luteum), which support pregnancy.'),
        ];
        _parts = parts;
        _labels = layoutLabels(parts, midX: ctr.dx, leftX: ctr.dx - 170 * k - 30, rightX: ctr.dx + 170 * k + 30, top: 30, bottom: size.height - infoH - 40, gap: 48);
        drawLabels(c, parts, _labels, focus);
        infoCard(c, Rect.fromLTWH(24, size.height - infoH - 16, size.width - 48, infoH), parts.where((q) => q.id == focus).firstOrNull);
      }),
    );
  }

  // ------------------------------------------------------------------ thyroid

  Widget _thyroid() {
    final io = n('iodine') / 100;
    final t4 = (100 * math.min(1.0, io * 1.4)).clamp(5.0, 100.0).toDouble();
    final tsh = (100 * (1.6 - t4 / 100 * 0.6) * (t4 < 80 ? 1 + (80 - t4) / 40 : 1)).clamp(60.0, 400.0).toDouble();
    final size = 1 + (tsh - 100) / 100;
    return frame(
      title: 'Iodine, TSH and goitre',
      subtitle: _sub,
      formula: 'TRH → TSH → T₃/T₄ ⟲ negative feedback',
      readouts: [
        Readout('Iodine in diet', f0(io * 100), '% of need', IX.accent),
        Readout('T₄ in blood', f0(t4), '% normal', IX.green),
        Readout('TSH', f0(tsh), '% normal', IX.positive),
        Readout('Thyroid size', '${f1(size)}×', size > 1.4 ? 'goitre' : 'normal'),
      ],
      controls: [slider('iodine', 'Iodine in diet', 0, 150, unit: '% of need')],
      painter: BioPainter((c, sz) {
        final x = sz.width * 0.30, w = sz.width * 0.38;
        final boxes = [('Hypothalamus', 'TRH', 70.0), ('Anterior pituitary', 'TSH ${f0(tsh)}%', 240.0), ('Thyroid', 'T₃, T₄ ${f0(t4)}%', 410.0)];
        for (final (nm, _, y) in boxes) {
          Bio.box(c, Rect.fromLTWH(x - w / 2, y, w, 70), nm, color: IX.accent, size: 21);
        }
        IxPaint.arrow(c, Offset(x, 144), Offset(x, 236), IX.green, width: 4);
        IxPaint.label(c, 'TRH', Offset(x + 14, 190), size: 18, color: IX.green, w: FontWeight.w700, align: Alignment.centerLeft);
        IxPaint.arrow(c, Offset(x, 314), Offset(x, 406), IX.green, width: 2 + tsh / 60);
        IxPaint.label(c, 'TSH  ${f0(tsh)}%', Offset(x + 14, 360), size: 18, color: IX.positive, w: FontWeight.w700, align: Alignment.centerLeft);
        IxPaint.arrow(c, Offset(x, 484), Offset(x, 560), IX.green, width: 4);
        IxPaint.label(c, 'T₃, T₄ → body: metabolic rate', Offset(x, 584), size: 18, color: IX.ink, w: FontWeight.w700);
        // Feedback loop.
        final fb = Path()..moveTo(x - w / 2, 445)..cubicTo(x - w / 2 - 140, 400, x - w / 2 - 140, 140, x - w / 2, 105);
        Bio.stroke(c, fb, IX.positive.withValues(alpha: 0.3 + 0.7 * t4 / 100), 4);
        final fb2 = Path()..moveTo(x - w / 2, 455)..cubicTo(x - w / 2 - 70, 420, x - w / 2 - 70, 300, x - w / 2, 275);
        Bio.stroke(c, fb2, IX.positive.withValues(alpha: 0.3 + 0.7 * t4 / 100), 4);
        IxPaint.label(c, '− feedback', Offset(x - w / 2 - 120, 270), size: 18, color: IX.positive, w: FontWeight.w700, halo: true);
        Bio.tag(c, 'Iodine ${f0(io * 100)}%', Offset(x + w / 2 + 70, 445), IX.amber, size: 17);
        IxPaint.arrow(c, Offset(x + w / 2 + 70, 466), Offset(x + w / 2 + 6, 466), IX.amber, width: 3);
        // Neck with thyroid scaled by TSH.
        final nc = Offset(sz.width * 0.78, sz.height * 0.42);
        final kk = math.min(sz.width / 1500, sz.height / 900);
        final neck = Path()..moveTo(nc.dx - 110 * kk, nc.dy - 260 * kk)..lineTo(nc.dx - 110 * kk, nc.dy + 140 * kk)..quadraticBezierTo(nc.dx - 260 * kk, nc.dy + 190 * kk, nc.dx - 300 * kk, nc.dy + 300 * kk)..lineTo(nc.dx + 300 * kk, nc.dy + 300 * kk)..quadraticBezierTo(nc.dx + 260 * kk, nc.dy + 190 * kk, nc.dx + 110 * kk, nc.dy + 140 * kk)..lineTo(nc.dx + 110 * kk, nc.dy - 260 * kk)..close();
        Bio.soft(c, neck, const Color(0xFFF6E2D6), stroke: 2.5, edge: const Color(0xFFD1A891));
        c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: nc + Offset(0, -40 * kk), width: 40 * kk, height: 260 * kk), Radius.circular(16 * kk)), Paint()..color = const Color(0xFFE9CFC6));
        for (final sd in [-1.0, 1.0]) {
          Bio.soft(c, Bio.blob(nc + Offset(sd * 48 * kk * math.sqrt(size), 20 * kk), 40 * kk * size, 64 * kk * size, seed: sd > 0 ? 3 : 4, wobble: 0.06), const Color(0xFFC0504D), stroke: 2);
        }
        c.drawRect(Rect.fromCenter(center: nc + Offset(0, 30 * kk), width: 70 * kk, height: 24 * kk * size), Paint()..color = const Color(0xFFC0504D));
        IxPaint.label(c, size > 1.4 ? 'Enlarged thyroid: goitre' : 'Normal thyroid', nc + Offset(0, 340 * kk), size: 20, color: size > 1.4 ? IX.positive : IX.ink, w: FontWeight.w700);
        Bio.note(c, 'Low iodine → less T₄ → weaker negative feedback → more TSH, which makes the thyroid grow.', nc + Offset(-200, 380 * kk), maxWidth: 400, size: 17, color: IX.inkSoft);
      }),
    );
  }

  // ------------------------------------------------------------------ glucose

  Widget _glucose() {
    final carb = n('carb'), ins = n('insulin') / 100;
    double rise(double t) => carb / 75 * 70 * (t / 0.6) * math.exp(1 - t / 0.6);
    double glucose(double t) => 90 + rise(t) * (1 + (1 - ins) * 1.6) * math.exp(-ins * 0.25 * math.max(0, t - 0.6)) / (1 + ins * 0.2) + (1 - ins) * 60 * (1 - math.exp(-t));
    double insulin(double t) => ins * (10 + carb / 75 * 60 * (t / 0.8) * math.exp(1 - t / 0.8));
    final peak = [for (var t = 0.0; t <= 4; t += 0.05) glucose(t)].reduce(math.max);
    return frame(
      title: 'Insulin and blood glucose after a meal',
      subtitle: '1st PUC Biology · Chemical coordination; 2nd PUC · Biotechnology applications',
      formula: 'insulin ↓ glucose · glucagon ↑ glucose',
      readouts: [
        Readout('Fasting glucose', f0(glucose(0)), 'mg/dL'),
        Readout('Peak glucose', f0(peak), 'mg/dL', peak > 180 ? IX.positive : IX.accent),
        Readout('At 4 h', f0(glucose(4)), 'mg/dL'),
        Readout('Glucose in urine', peak > 180 ? 'Yes (glycosuria)' : 'No', '', peak > 180 ? IX.positive : IX.green),
      ],
      controls: [
        slider('carb', 'Carbohydrate in the meal', 0, 150, unit: 'g'),
        slider('insulin', 'Insulin response', 0, 150, unit: '%'),
      ],
      painter: BioPainter((c, size) {
        final plot = Plot(Rect.fromLTRB(120, 90, size.width - 80, size.height * 0.64), 0, 4, 0, 320);
        plot.frame(c, xs: [0, 1, 2, 3, 4], ys: [0, 80, 160, 240, 320], xLabel: 'Hours after the meal', yLabel: 'Blood glucose (mg/dL)', title: 'Blood glucose');
        c.drawRect(Rect.fromLTRB(plot.r.left, plot.pt(0, 110).dy, plot.r.right, plot.pt(0, 70).dy), Paint()..color = IX.green.withValues(alpha: 0.08));
        plot.hline(c, 180, IX.positive, label: 'renal threshold ≈ 180');
        plot.curve(c, glucose, IX.accent, label: 'glucose', labelX: 3.3);
        final p2 = Plot(Rect.fromLTRB(120, size.height * 0.74, size.width - 80, size.height - 60), 0, 4, 0, 130);
        p2.frame(c, xs: [], ys: [0, 60, 120], yLabel: 'Insulin', title: '');
        p2.curve(c, insulin, IX.amber, label: 'insulin from β-cells', labelX: 2.6);
      }),
    );
  }

  // ------------------------------------------------------------------ thermo

  Widget _thermo() {
    final a = n('ambient');
    final frog = a;
    const human = 37.0;
    return frame(
      title: 'Regulators and conformers',
      subtitle: '1st PUC Biology · Animal kingdom; 2nd PUC · Organisms and populations',
      formula: 'homeostasis: a constant internal environment',
      readouts: [
        Readout('Surroundings', f0(a), '°C', IX.accent),
        Readout('Frog (cold-blooded)', f0(frog), '°C', IX.green),
        Readout('Human (warm-blooded)', f0(human), '°C', BioC.oxy),
        Readout('Human keeps warm by', a < 30 ? 'Shivering, metabolism' : 'Sweating', ''),
      ],
      controls: [slider('ambient', 'Temperature of the surroundings', 0, 45, unit: '°C')],
      painter: BioPainter((c, size) {
        final plot = Plot(Rect.fromLTRB(120, 90, size.width * 0.62, size.height - 110), 0, 45, 0, 45);
        plot.frame(c, xs: [0, 10, 20, 30, 40], ys: [0, 10, 20, 30, 40], xLabel: 'Temperature of surroundings (°C)', yLabel: 'Body temperature (°C)', title: 'Body temperature against surroundings');
        plot.curve(c, (x) => x, IX.green, label: 'conformer (frog, most fishes)', labelX: 12);
        plot.curve(c, (x) => human, BioC.oxy, label: 'regulator (birds, mammals)', labelX: 30);
        plot.dot(c, a, frog, IX.green);
        plot.dot(c, a, human, BioC.oxy);
        // Two thermometers.
        void thermo(Offset at, double t, String name, Color col) {
          final tube = RRect.fromRectAndRadius(Rect.fromCenter(center: at, width: 40, height: 340), const Radius.circular(20));
          c.drawRRect(tube, Paint()..color = IX.paper);
          c.drawRRect(tube, Paint()..color = IX.glassEdge..style = PaintingStyle.stroke..strokeWidth = 3);
          final top = at.dy + 150 - 290 * t / 45;
          c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(at.dx - 10, top, at.dx + 10, at.dy + 170), const Radius.circular(10)), Paint()..color = col);
          c.drawCircle(at + const Offset(0, 180), 30, Paint()..color = col);
          IxPaint.label(c, '${f0(t)} °C', Offset(at.dx, top - 22), size: 19, color: col, w: FontWeight.w700, halo: true);
          IxPaint.label(c, name, at + const Offset(0, 236), size: 18, color: IX.ink, w: FontWeight.w700);
        }
        thermo(Offset(size.width * 0.74, size.height * 0.42), frog, 'Frog', IX.green);
        thermo(Offset(size.width * 0.90, size.height * 0.42), human, 'Human', BioC.oxy);
      }),
    );
  }

  // ------------------------------------------------------------------ action

  Widget _action() {
    final prot = str('kind', 'protein') == 'protein';
    return frame(
      title: prot ? 'Protein hormones: membrane receptors' : 'Steroid hormones: intracellular receptors',
      subtitle: _sub,
      formula: prot ? 'hormone → receptor → second messenger' : 'hormone–receptor complex → genes',
      readouts: [
        Readout('Receptor', prot ? 'On the membrane' : 'Inside the cell', '', IX.accent),
        Readout('Messenger', prot ? 'cAMP, IP₃, Ca²⁺' : 'Acts on genome', ''),
        Readout('Examples', prot ? 'FSH, insulin, glucagon' : 'Cortisol, estrogen, T₄', ''),
      ],
      controls: [choice('kind', 'Hormone', const {'protein': 'Protein / amine', 'steroid': 'Steroid / iodothyronine'})],
      painter: BioPainter((c, size) {
        final ctr = Offset(size.width * 0.42, size.height * 0.56);
        final R = math.min(size.width * 0.30, size.height * 0.38);
        Bio.soft(c, Bio.blob(ctr, R * 1.2, R, seed: 3, wobble: 0.03), BioC.cytoplasm, stroke: 5, edge: BioC.membrane, light: 0.5);
        final nuc = ctr + Offset(R * 0.35, R * 0.2);
        Bio.soft(c, Bio.blob(nuc, R * 0.32, R * 0.28, seed: 5), Bio.lighten(BioC.nucleus, 0.55), stroke: 3, edge: BioC.nucleus);
        // DNA in nucleus.
        final dna = Path()..moveTo(nuc.dx - R * 0.2, nuc.dy);
        for (var k = 0; k < 6; k++) {
          dna.relativeQuadraticBezierTo(R * 0.035, -R * 0.08 * (k.isEven ? 1 : -1), R * 0.07, 0);
        }
        Bio.stroke(c, dna, BioC.chromatin, 3);
        final top = ctr + Offset(-R * 0.3, -R * 0.98);
        final steps = <(Offset, String)>[];
        if (prot) {
          Bio.tag(c, 'Hormone', top + const Offset(0, -80), IX.positive, size: 18);
          Bio.soft(c, Path()..addRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: top, width: 46, height: 70), const Radius.circular(12))), IX.accent, stroke: 2);
          IxPaint.arrow(c, top + const Offset(0, -60), top + const Offset(0, -38), IX.positive, width: 3);
          final m = top + Offset(0, R * 0.4);
          Bio.tag(c, 'cAMP', m, BioC.atp, size: 18);
          IxPaint.arrow(c, top + const Offset(0, 40), m + const Offset(0, -18), IX.inkSoft, width: 3);
          final e = m + Offset(R * 0.25, R * 0.4);
          Bio.tag(c, 'Enzymes activated', e, IX.green, size: 17);
          IxPaint.arrow(c, m + const Offset(10, 18), e + const Offset(-20, -16), IX.inkSoft, width: 3);
          steps.addAll([(top + const Offset(-30, 0), '1  Hormone binds its membrane receptor'), (m, '2  A second messenger is made inside'), (e, '3  It sets off biochemical and physiological responses')]);
        } else {
          final h = ctr + Offset(-R * 0.15, -R * 0.2);
          Bio.tag(c, 'Steroid hormone', top + const Offset(0, -80), IX.positive, size: 18);
          IxPaint.arrow(c, top + const Offset(0, -60), h + const Offset(0, -20), IX.positive, width: 3);
          Bio.soft(c, Bio.blob(h, 30, 22, seed: 2), IX.accent, stroke: 2);
          IxPaint.arrow(c, h + const Offset(30, 10), nuc + Offset(-R * 0.25, -10), IX.inkSoft, width: 3);
          Bio.tag(c, 'mRNA → protein', nuc + Offset(0, R * 0.45), IX.green, size: 17);
          steps.addAll([(top, '1  Lipid-soluble hormone crosses the membrane'), (h, '2  Binds an intracellular receptor'), (nuc, '3  Complex acts on the genome: gene expression changes')]);
        }
        var y = 60.0;
        for (final (_, t) in steps) {
          Bio.note(c, t, Offset(size.width * 0.72, y), maxWidth: size.width * 0.26, size: 19, color: IX.ink, w: FontWeight.w600);
          y += 110;
        }
      }),
    );
  }
}
