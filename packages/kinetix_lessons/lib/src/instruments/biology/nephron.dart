import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bio_kit.dart';

/// Excretory products and their elimination (1st PUC Biology ch. 16): the nephron in its
/// regions (tap a part), filtration and reabsorption, the countercurrent medullary gradient,
/// and ADH concentrating the urine.
///
/// Preset: {"mode": "nephron"|"filtration"|"gradient"|"adh", "focus": id, "gfr": 125 (mL/min),
/// "urine": 1.5 (L/day), "inner": 1200 (mOsm/L), "adh": 50 (%), "solutes": 600 (mOsm/day)}.
class NephronInstrument extends StatefulWidget {
  const NephronInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<NephronInstrument> createState() => _NephronState();
}

class _NephronState extends BioState<NephronInstrument> {
  @override
  String get instrumentId => 'bio-nephron';
  @override
  Map<String, dynamic> get lessonPreset => widget.preset;
  @override
  List<String> get modes => const ['nephron', 'filtration', 'gradient', 'adh'];
  @override
  Map<String, Map<String, dynamic>> get presets => const {
    'The nephron': {'mode': 'nephron'},
    'Henle\'s loop': {'mode': 'nephron', 'focus': 'loop'},
    'Filtration and reabsorption': {'mode': 'filtration'},
    'Failing kidneys': {'mode': 'filtration', 'gfr': 60},
    'Medullary gradient': {'mode': 'gradient'},
    'ADH': {'mode': 'adh'},
    'No ADH (diabetes insipidus)': {'mode': 'adh', 'adh': 0},
  };
  @override
  Map<String, Object> defaults(String mode) => {'gfr': 125, 'urine': 1.5, 'inner': 1200, 'adh': 50, 'solutes': 600};

  static const _sub = '1st PUC Biology · Excretory products and their elimination';
  List<BioPart> _parts = const [];
  Map<String, Offset> _labels = const {};

  @override
  Widget build(BuildContext context) => switch (mode) {
    'filtration' => _filtration(),
    'gradient' => _gradient(),
    'adh' => _adh(),
    _ => _nephron(),
  };

  /// Draws a nephron in [r]; [hl] highlights a region; [adh] 0–1 colours the collecting duct.
  List<BioPart> drawNephron(Canvas c, Rect r, {String? hl, double adh = -1, bool gradient = true}) {
    Offset p(double x, double y) => Offset(r.left + r.width * x, r.top + r.height * y);
    // Cortex and medulla, the medulla shaded by osmolarity.
    final cortexB = 0.36;
    c.drawRect(Rect.fromLTRB(r.left, r.top, r.right, p(0, cortexB).dy), Paint()..color = const Color(0xFFF6EBDD));
    final med = Rect.fromLTRB(r.left, p(0, cortexB).dy, r.right, r.bottom);
    c.drawRect(med, Paint()..shader = LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: gradient ? [const Color(0xFFF3E1D3), const Color(0xFFE3B9A0)] : [const Color(0xFFF3E1D3), const Color(0xFFF3E1D3)]).createShader(med));
    IxPaint.label(c, 'CORTEX', p(0.02, 0.03), size: 16, color: IX.inkSoft, w: FontWeight.w700, align: Alignment.topLeft);
    IxPaint.label(c, 'MEDULLA', p(0.02, cortexB + 0.02), size: 16, color: IX.inkSoft, w: FontWeight.w700, align: Alignment.topLeft);
    if (gradient) {
      for (final (y, v) in [(0.40, 300), (0.62, 600), (0.80, 900), (0.96, 1200)]) {
        IxPaint.label(c, '$v mOsm/L', p(0.98, y), size: 15, color: Bio.darken(const Color(0xFFE3B9A0), 0.45), w: FontWeight.w600, align: Alignment.centerRight);
      }
    }
    const tub = Color(0xFFF5D88A);
    Color col(String id) => hl == id ? const Color(0xFFF0B429) : tub;
    void seg(List<Offset> pts, String id, double w) {
      final path = Bio.smooth(pts, closed: false);
      c.drawPath(path, Paint()..color = Bio.darken(col(id), 0.35)..style = PaintingStyle.stroke..strokeWidth = w + 5..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round);
      c.drawPath(path, Paint()..color = col(id)..style = PaintingStyle.stroke..strokeWidth = w..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round);
      c.drawPath(path, Paint()..color = Colors.white.withValues(alpha: 0.35)..style = PaintingStyle.stroke..strokeWidth = w * 0.25..strokeCap = StrokeCap.round);
    }
    final w = r.width * 0.026;
    // Blood vessels: afferent in, efferent out to peritubular capillaries and vasa recta.
    final vessel = Paint()..style = PaintingStyle.stroke..strokeCap = StrokeCap.round;
    c.drawPath(Bio.smooth([p(0.0, 0.08), p(0.08, 0.10), p(0.17, 0.13)], closed: false), vessel..color = BioC.oxy..strokeWidth = w * 0.9);
    c.drawPath(Bio.smooth([p(0.20, 0.10), p(0.30, 0.06), p(0.42, 0.10), p(0.47, 0.30), p(0.46, 0.92), p(0.53, 0.94), p(0.56, 0.4), p(0.60, 0.14), p(0.80, 0.06), p(1.0, 0.07)], closed: false), vessel..color = const Color(0xFFB45C7A)..strokeWidth = w * 0.55);
    // Bowman's capsule and glomerulus.
    final gc = p(0.20, 0.16), gr = r.width * 0.07;
    final cup = Path()..addArc(Rect.fromCircle(center: gc, radius: gr), -math.pi * 0.15, math.pi * 1.7);
    c.drawPath(cup, Paint()..color = Bio.darken(col('bowman'), 0.3)..style = PaintingStyle.stroke..strokeWidth = w * 0.9 + 5);
    c.drawPath(cup, Paint()..color = col('bowman')..style = PaintingStyle.stroke..strokeWidth = w * 0.9);
    final rnd = math.Random(3);
    for (var k = 0; k < 9; k++) {
      final a = rnd.nextDouble() * 2 * math.pi, d = rnd.nextDouble() * gr * 0.45;
      c.drawCircle(gc + Offset(math.cos(a), math.sin(a)) * d, gr * 0.22, Paint()..color = (hl == 'glom' ? const Color(0xFFE05A5A) : BioC.oxy)..style = PaintingStyle.stroke..strokeWidth = 5);
    }
    // PCT (convoluted), loop, DCT, collecting duct.
    seg([p(0.27, 0.12), p(0.32, 0.20), p(0.26, 0.26), p(0.34, 0.31), p(0.28, 0.36), p(0.36, 0.38), p(0.40, 0.33)], 'pct', w);
    seg([p(0.40, 0.33), p(0.43, 0.40), p(0.43, 0.88), p(0.47, 0.95)], 'loop', w * 0.7);
    seg([p(0.47, 0.95), p(0.52, 0.90), p(0.52, 0.60), p(0.53, 0.38)], 'loop', w * 0.8);
    seg([p(0.53, 0.38), p(0.56, 0.30), p(0.50, 0.24), p(0.60, 0.20), p(0.66, 0.26), p(0.72, 0.18), p(0.78, 0.22)], 'dct', w);
    final ductCol = adh >= 0 ? Color.lerp(tub, const Color(0xFFE59A3A), adh)! : col('duct');
    final duct = Bio.smooth([p(0.78, 0.22), p(0.80, 0.24), p(0.81, 0.6), p(0.82, 1.0)], closed: false);
    c.drawPath(duct, Paint()..color = Bio.darken(ductCol, 0.35)..style = PaintingStyle.stroke..strokeWidth = w * 1.3 + 5);
    c.drawPath(duct, Paint()..color = ductCol..style = PaintingStyle.stroke..strokeWidth = w * 1.3);
    seg([p(0.92, 0.10), p(0.85, 0.16), p(0.80, 0.24)], 'duct', w * 0.8);
    return [
      BioPart('glom', 'Glomerulus', gc, 'A tuft of capillaries from the afferent arteriole. Blood is filtered here (ultrafiltration) at about 125 mL/min: the GFR.'),
      BioPart('bowman', 'Bowman\'s capsule', gc + Offset(-gr * 0.95, gr * 0.3), 'A double-walled cup around the glomerulus; together they form the Malpighian body (renal corpuscle). Podocytes leave filtration slits.'),
      BioPart('aff', 'Afferent arteriole', p(0.06, 0.09), 'Brings blood to the glomerulus; it is wider than the efferent arteriole, which keeps the glomerular pressure high.'),
      BioPart('eff', 'Efferent arteriole', p(0.30, 0.06), 'Carries blood out of the glomerulus to the peritubular capillaries and vasa recta.'),
      BioPart('pct', 'Proximal convoluted tubule', p(0.30, 0.30), 'Lined by brush-border epithelium: reabsorbs nearly all nutrients and 70–80% of electrolytes and water; secretes H⁺ and NH₃ to keep pH balanced.'),
      BioPart('loop', 'Henle\'s loop', p(0.43, 0.75), 'Descending limb: permeable to water, almost impermeable to electrolytes. Ascending limb: impermeable to water, actively or passively moves electrolytes out. Builds the medullary gradient.'),
      BioPart('vasa', 'Vasa recta', p(0.46, 0.55), 'A U-shaped capillary running parallel to Henle\'s loop; with the loop it forms the countercurrent system.'),
      BioPart('dct', 'Distal convoluted tubule', p(0.66, 0.24), 'Conditional reabsorption of Na⁺ and water; reabsorbs HCO₃⁻ and secretes H⁺, K⁺ and NH₃.'),
      BioPart('duct', 'Collecting duct', p(0.815, 0.7), 'Runs from cortex to inner medulla. Reabsorbs large amounts of water under ADH to concentrate urine; passes some urea into the medulla.'),
    ];
  }

  Widget _nephron() {
    final focus = s['focus'];
    return frame(
      title: 'The nephron',
      subtitle: _sub,
      formula: 'filtration → reabsorption → secretion',
      readouts: const [
        Readout('Nephrons per kidney', '≈ 1 million', '', IX.accent),
        Readout('Filtrate per day', '180', 'L'),
        Readout('Urine per day', '1–1.5', 'L', IX.green),
        Readout('Reabsorbed', '≈ 99', '%'),
      ],
      controls: [Padding(padding: const EdgeInsets.only(top: 4), child: Text('Tap a part of the nephron to read what it does. Cortical nephrons have short loops; juxtamedullary nephrons have long loops that dip deep into the medulla.', style: IX.text(17, c: IX.inkSoft)))],
      onTap: (at, size) {
        final id = hitPart(_parts, _labels, at);
        setState(() => id == null || id == s['focus'] ? s.remove('focus') : s['focus'] = id);
      },
      painter: BioPainter((c, size) {
        final infoH = 118.0;
        final area = Rect.fromLTWH(size.width * 0.20, 20, size.width * 0.60, size.height - infoH - 50);
        c.save();
        c.clipRRect(RRect.fromRectAndRadius(area, const Radius.circular(16)));
        final parts = drawNephron(c, area, hl: focus);
        c.restore();
        _parts = parts;
        _labels = layoutLabels(parts, midX: area.left + area.width * 0.5, leftX: area.left - 30, rightX: area.right + 30, top: 40, bottom: area.bottom - 10, gap: 52);
        drawLabels(c, parts, _labels, focus);
        infoCard(c, Rect.fromLTWH(24, size.height - infoH - 16, size.width - 48, infoH), parts.where((q) => q.id == focus).firstOrNull);
      }),
    );
  }

  // ------------------------------------------------------------------ filtration

  Widget _filtration() {
    final gfr = n('gfr'), ur = n('urine');
    final filt = gfr * 1440 / 1000;
    final reab = filt - ur;
    return frame(
      title: 'Filtration and reabsorption',
      subtitle: _sub,
      formula: 'filtrate per day = GFR × 1440 min',
      readouts: [
        Readout('Filtrate', f0(filt), 'L/day', IX.accent),
        Readout('Urine', f1(ur), 'L/day', IX.amber),
        Readout('Reabsorbed', f1(reab), 'L/day', IX.green),
        Readout('Share reabsorbed', f1(100 * reab / filt), '%', IX.green),
      ],
      controls: [
        slider('gfr', 'Glomerular filtration rate', 20, 150, unit: 'mL/min'),
        slider('urine', 'Urine output', 0.5, 5, unit: 'L/day', dp: 1, div: 45),
      ],
      painter: BioPainter((c, size) {
        final area = Rect.fromLTWH(30, 30, size.width * 0.42, size.height - 60);
        c.save();
        c.clipRRect(RRect.fromRectAndRadius(area, const Radius.circular(16)));
        drawNephron(c, area, gradient: false);
        c.restore();
        // Flow diagram: filtrate column vs urine column.
        final plot = Plot(Rect.fromLTRB(size.width * 0.58, 100, size.width - 60, size.height - 120), -0.5, 1.5, 0, 220);
        plot.frame(c, xs: [], ys: [0, 50, 100, 150, 200], yLabel: 'Litres per day', title: 'Most of the filtrate returns to the blood');
        plot.bars(c, [filt, ur], [IX.accent, IX.amber], labels: const ['Filtrate', 'Urine'], fmt: (v) => v < 10 ? f1(v) : f0(v));
        final top = plot.pt(0.31, filt), bot = plot.pt(0.31, ur);
        IxPaint.arrow(c, top + const Offset(40, 10), Offset(top.dx + 40, math.max(bot.dy - 10, top.dy + 20)), IX.green, width: 4);
        IxPaint.label(c, '${f1(reab)} L reabsorbed', Offset(top.dx + 56, (top.dy + bot.dy) / 2), size: 18, color: IX.green, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
        Bio.note(c, gfr < 90 ? 'A low GFR means less filtration: wastes such as urea build up in the blood (uraemia). Severe kidney failure is treated by haemodialysis.' : 'The JGA (juxtaglomerular apparatus) keeps GFR steady: a fall releases renin, raising blood pressure and GFR.', Offset(size.width * 0.58, size.height - 30), align: Alignment.bottomLeft, maxWidth: size.width * 0.38, size: 17, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ gradient

  Widget _gradient() {
    final inner = n('inner');
    double inter(double d) => 300 + (inner - 300) * d;
    return frame(
      title: 'The countercurrent medullary gradient',
      subtitle: _sub,
      formula: 'cortex 300 → inner medulla ≈ 1200 mOsm/L',
      readouts: [
        Readout('Cortex', '300', 'mOsm/L'),
        Readout('Inner medulla', f0(inner), 'mOsm/L', IX.positive),
        Readout('Max urine concentration', f0(inner), 'mOsm/L', IX.amber),
        Readout('× plasma', f1(inner / 300), '×', IX.accent),
      ],
      controls: [slider('inner', 'Osmolarity of the inner medulla', 300, 1400, unit: 'mOsm/L', div: 110)],
      painter: BioPainter((c, size) {
        // Loop schematic with numbers.
        final lx = size.width * 0.12, top = 90.0, bot = size.height - 90;
        double y(double d) => top + (bot - top) * d;
        final med = Rect.fromLTRB(lx - 60, top, lx + 240, bot);
        c.drawRect(med, Paint()..shader = LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [const Color(0xFFF6EBDD), Color.lerp(const Color(0xFFF6EBDD), const Color(0xFFD9956F), (inner - 300) / 1100)!]).createShader(med));
        final dl = Path()..moveTo(lx, top)..lineTo(lx, bot - 30)..quadraticBezierTo(lx + 40, bot + 10, lx + 80, bot - 30)..lineTo(lx + 80, top);
        Bio.stroke(c, dl, const Color(0xFFB08A3E), 26);
        Bio.stroke(c, dl, const Color(0xFFF5D88A), 20);
        c.drawLine(Offset(lx + 160, top), Offset(lx + 160, bot), Paint()..color = const Color(0xFFB08A3E)..strokeWidth = 30);
        c.drawLine(Offset(lx + 160, top), Offset(lx + 160, bot), Paint()..color = const Color(0xFFF0C46A)..strokeWidth = 24);
        for (final d in [0.15, 0.4, 0.65, 0.88]) {
          IxPaint.arrow(c, Offset(lx - 6, y(d)), Offset(lx - 40, y(d)), BioC.water, width: 3);
          IxPaint.arrow(c, Offset(lx + 86, y(d) + 20), Offset(lx + 124, y(d) + 20), IX.positive, width: 3);
          IxPaint.arrow(c, Offset(lx + 154, y(d) - 10), Offset(lx + 120, y(d) - 10), BioC.water, width: 3);
          IxPaint.label(c, f0(inter(d)), Offset(lx + 210, y(d)), size: 16, color: IX.ink, w: FontWeight.w700);
        }
        IxPaint.label(c, 'H₂O out', Offset(lx - 30, top - 20), size: 15, color: BioC.water, w: FontWeight.w700);
        IxPaint.label(c, 'NaCl out', Offset(lx + 80, top - 20), size: 15, color: IX.positive, w: FontWeight.w700);
        IxPaint.label(c, 'Collecting duct', Offset(lx + 160, bot + 24), size: 15, color: IX.inkSoft, w: FontWeight.w700);
        IxPaint.label(c, 'Henle\'s loop', Offset(lx + 40, bot + 24), size: 15, color: IX.inkSoft, w: FontWeight.w700);
        final plot = Plot(Rect.fromLTRB(size.width * 0.44, 90, size.width - 60, size.height - 110), 0, 1, 0, 1500);
        plot.frame(c, xs: [0, 0.5, 1], ys: [0, 300, 600, 900, 1200, 1500], fx: (x) => x == 0 ? 'cortex' : (x == 1 ? 'inner medulla' : 'outer medulla'), xLabel: 'Depth into the kidney', yLabel: 'Osmolarity (mOsm/L)', title: 'Interstitium and filtrate in the ascending limb');
        plot.curve(c, inter, IX.amber, label: 'interstitial fluid', labelX: 0.7);
        plot.curve(c, (d) => math.max(100, inter(d) - 200), IX.accent, label: 'ascending limb filtrate', labelX: 0.35);
        Bio.note(c, 'Flow in opposite directions in the two limbs of Henle\'s loop (and in the vasa recta) — the countercurrent — keeps NaCl and urea concentrated deep in the medulla. This gradient lets the collecting duct draw water out and concentrate the urine about four times.', plot.r.bottomRight + const Offset(-10, -14), align: Alignment.bottomRight, maxWidth: 520, size: 17, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ ADH

  Widget _adh() {
    final a = n('adh') / 100, sol = n('solutes');
    final osm = 60 + (1200 - 60) * a;
    final vol = sol / osm;
    return frame(
      title: 'ADH and concentrated urine',
      subtitle: _sub,
      formula: 'urine volume = solutes ÷ osmolarity',
      readouts: [
        Readout('ADH', f0(a * 100), '%', IX.accent),
        Readout('Urine osmolarity', f0(osm), 'mOsm/L', IX.amber),
        Readout('Urine volume', f1(vol), 'L/day', BioC.water),
        Readout('Condition', a < 0.08 ? 'Diabetes insipidus' : (a > 0.8 ? 'Dehydrated' : 'Normal'), '', a < 0.08 ? IX.positive : IX.ink),
      ],
      controls: [
        slider('adh', 'ADH level', 0, 100, unit: '%'),
        slider('solutes', 'Solutes to remove', 300, 1200, unit: 'mOsm/day', div: 90),
      ],
      painter: BioPainter((c, size) {
        final area = Rect.fromLTWH(30, 30, size.width * 0.42, size.height - 60);
        c.save();
        c.clipRRect(RRect.fromRectAndRadius(area, const Radius.circular(16)));
        drawNephron(c, area, adh: a);
        c.restore();
        // Hypothalamus → posterior pituitary → kidney.
        final hx = size.width * 0.52;
        Bio.box(c, Rect.fromLTWH(hx, 40, size.width * 0.44, 56), 'Osmoreceptors in the hypothalamus sense water loss', color: IX.accent, size: 17);
        IxPaint.arrow(c, Offset(hx + size.width * 0.22, 100), Offset(hx + size.width * 0.22, 130), IX.inkSoft);
        Bio.box(c, Rect.fromLTWH(hx, 134, size.width * 0.44, 56), 'Neurohypophysis releases ADH (vasopressin)', color: IX.accent, size: 17, filled: a > 0.3);
        IxPaint.arrow(c, Offset(hx + size.width * 0.22, 194), Offset(hx + size.width * 0.22, 224), IX.inkSoft);
        Bio.box(c, Rect.fromLTWH(hx, 228, size.width * 0.44, 56), 'Collecting duct and DCT reabsorb more water', color: IX.amber, size: 17, filled: a > 0.3);
        // Urine beaker.
        final bk = Rect.fromLTWH(hx + 40, size.height * 0.42, 170, size.height * 0.44);
        final fill = (vol / 10).clamp(0.02, 1.0);
        final ucol = Color.lerp(const Color(0xFFFFFBE0), const Color(0xFFE0A030), a)!;
        c.drawRect(Rect.fromLTRB(bk.left, bk.bottom - bk.height * fill, bk.right, bk.bottom), Paint()..color = ucol);
        c.drawPath(Path()..moveTo(bk.left, bk.top)..lineTo(bk.left, bk.bottom)..lineTo(bk.right, bk.bottom)..lineTo(bk.right, bk.top), Paint()..color = IX.glassEdge..style = PaintingStyle.stroke..strokeWidth = 4);
        for (var l = 2; l <= 10; l += 2) {
          final yy = bk.bottom - bk.height * l / 10;
          c.drawLine(Offset(bk.right - 20, yy), Offset(bk.right, yy), Paint()..color = IX.inkSoft..strokeWidth = 2);
          IxPaint.label(c, '$l L', Offset(bk.right + 8, yy), size: 15, color: IX.inkSoft, align: Alignment.centerLeft);
        }
        IxPaint.label(c, 'Urine per day', bk.bottomCenter + const Offset(0, 22), size: 17, color: IX.ink, w: FontWeight.w700);
        Bio.note(c, a < 0.08 ? 'Without ADH the collecting duct stays impermeable to water: large volumes of dilute urine — diabetes insipidus.' : 'ADH makes the collecting-duct walls permeable to water, which leaves for the concentrated medulla. ADH also constricts blood vessels, raising blood pressure.', Offset(hx + 290, size.height * 0.46), maxWidth: size.width - hx - 320, size: 17, color: IX.ink);
      }),
    );
  }
}
