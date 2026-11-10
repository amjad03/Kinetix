import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bio_kit.dart';

/// Photosynthesis in higher plants (1st PUC Biology ch. 11): the balanced equation, absorption
/// and action spectra, the light reaction and chemiosmosis in the thylakoid, the Calvin cycle
/// account, C₃ versus C₄ and photorespiration, and Blackman's limiting factors.
///
/// Preset: {"mode": "equation"|"spectra"|"thylakoid"|"calvin"|"c4"|"limiting", "glucose": 1,
/// "wl": 550, "water": 2, "pHlumen": 5, "pHstroma": 8, "light": 60, "co2": 400, "T": 25,
/// "step": 0, "plant": "c3"}.
class PhotosynthesisInstrument extends StatefulWidget {
  const PhotosynthesisInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<PhotosynthesisInstrument> createState() => _PhotoState();
}

const _calvinSteps = ['Carboxylation', 'Reduction', 'Regeneration'];

class _PhotoState extends BioState<PhotosynthesisInstrument> {
  @override
  String get instrumentId => 'bio-photosynthesis';
  @override
  Map<String, dynamic> get lessonPreset => widget.preset;
  @override
  List<String> get modes => const ['equation', 'spectra', 'thylakoid', 'calvin', 'c4', 'limiting'];
  @override
  Map<String, Map<String, dynamic>> get presets => const {
    'Equation': {'mode': 'equation'},
    'Absorption spectra': {'mode': 'spectra'},
    'Thylakoid: chemiosmosis': {'mode': 'thylakoid'},
    'Calvin cycle': {'mode': 'calvin'},
    'C₃ and C₄': {'mode': 'c4'},
    'Limiting factors': {'mode': 'limiting'},
  };
  @override
  Map<String, Object> defaults(String mode) => {'glucose': 1, 'wl': 550, 'water': 2, 'pHlumen': 5, 'pHstroma': 8, 'light': 60, 'co2': 400, 'T': 25, 'step': 0, 'plant': 'c3'};

  static const _sub = '1st PUC Biology · Photosynthesis in higher plants';

  @override
  Widget build(BuildContext context) => switch (mode) {
    'spectra' => _spectra(),
    'thylakoid' => _thylakoid(),
    'calvin' => _calvin(),
    'c4' => _c4(),
    'limiting' => _limiting(),
    _ => _equation(),
  };

  // ------------------------------------------------------------------ equation

  Widget _equation() {
    final g = i('glucose').clamp(1, 20);
    return frame(
      title: 'The equation of photosynthesis',
      subtitle: _sub,
      formula: '6CO₂ + 12H₂O → C₆H₁₂O₆ + 6H₂O + 6O₂',
      readouts: [
        Readout('CO₂ used', '${6 * g}', '', IX.inkSoft),
        Readout('H₂O used', '${12 * g}', '', BioC.water),
        Readout('O₂ released', '${6 * g}', '', IX.green),
        Readout('H₂O formed', '${6 * g}', '', BioC.water),
      ],
      controls: [slider('glucose', 'Glucose molecules made', 1, 20)],
      painter: BioPainter((c, size) {
        final lb = Offset(size.width * 0.18, size.height * 0.78), lt = Offset(size.width * 0.62, size.height * 0.22);
        // Stem.
        Bio.stroke(c, Path()..moveTo(lb.dx - 80, lb.dy + 90)..quadraticBezierTo(lb.dx - 40, lb.dy + 30, lb.dx, lb.dy), const Color(0xFF6E8B3D), 10);
        drawLeaf(c, lb, lt, size.height * 0.24);
        final mid = Offset.lerp(lb, lt, 0.5)!;
        // Sun.
        final sun = Offset(size.width * 0.12, size.height * 0.16);
        for (var a = 0.0; a < 2 * math.pi; a += math.pi / 6) {
          c.drawLine(sun + Offset(math.cos(a), math.sin(a)) * 54, sun + Offset(math.cos(a), math.sin(a)) * 76, Paint()..color = const Color(0xFFE0A030)..strokeWidth = 4..strokeCap = StrokeCap.round);
        }
        Bio.soft(c, Path()..addOval(Rect.fromCircle(center: sun, radius: 44)), const Color(0xFFF2C14E), stroke: 0);
        IxPaint.arrow(c, sun + const Offset(70, 50), mid + const Offset(-60, -40), const Color(0xFFE0A030), width: 4);
        IxPaint.label(c, 'Light energy', sun + const Offset(0, 80), size: 18, color: IX.amber, w: FontWeight.w700);
        flowArrow(c, Offset(size.width * 0.86, size.height * 0.20), mid + const Offset(70, -30), '${6 * g} CO₂ in', IX.inkSoft);
        flowArrow(c, Offset(size.width * 0.46, size.height * 0.92), mid + const Offset(0, 50), '${12 * g} H₂O from roots', BioC.water);
        IxPaint.arrow(c, mid + const Offset(90, 30), Offset(size.width * 0.84, size.height * 0.50), IX.green, width: 4, head: 16);
        Bio.tag(c, '${6 * g} O₂ out', Offset(size.width * 0.88, size.height * 0.53), IX.green, size: 18);
        IxPaint.arrow(c, mid + const Offset(60, 60), Offset(size.width * 0.78, size.height * 0.74), BioC.sugar, width: 4, head: 16);
        Bio.tag(c, '$g C₆H₁₂O₆ + ${6 * g} H₂O', Offset(size.width * 0.82, size.height * 0.78), BioC.sugar, size: 18);
        Bio.note(c, 'All the O₂ released comes from water, not CO₂ (van Niel; shown with ¹⁸O). That is why 12 H₂O appear on the left: 12 × O = 6 O₂.', Offset(size.width * 0.03, size.height * 0.98), align: Alignment.bottomLeft, maxWidth: size.width * 0.34, size: 18, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ spectra

  static double _g(double x, double mu, double sd) => math.exp(-math.pow((x - mu) / sd, 2) / 2);
  static double chlA(double w) => 0.95 * _g(w, 430, 14) + 0.75 * _g(w, 662, 12) + 0.12 * _g(w, 580, 30);
  static double chlB(double w) => 1.0 * _g(w, 453, 13) + 0.48 * _g(w, 642, 11) + 0.08 * _g(w, 590, 30);
  static double carot(double w) => 0.62 * _g(w, 450, 16) + 0.72 * _g(w, 478, 14) + 0.3 * _g(w, 425, 12);
  static double actionSpec(double w) => math.min(1, 0.75 * chlA(w) + 0.35 * chlB(w) + 0.25 * carot(w) + 0.05);

  static Color wlColor(double w) {
    final stops = [(400.0, const Color(0xFF7A3DC8)), (450.0, const Color(0xFF3050E0)), (490.0, const Color(0xFF20A8D8)), (530.0, const Color(0xFF40B040)), (575.0, const Color(0xFFE6D030)), (600.0, const Color(0xFFF09030)), (650.0, const Color(0xFFE03C2C)), (700.0, const Color(0xFFA81E1E))];
    for (var k = 0; k < stops.length - 1; k++) {
      if (w <= stops[k + 1].$1) return Color.lerp(stops[k].$2, stops[k + 1].$2, ((w - stops[k].$1) / (stops[k + 1].$1 - stops[k].$1)).clamp(0, 1))!;
    }
    return stops.last.$2;
  }

  Widget _spectra() {
    final w = n('wl');
    return frame(
      title: 'Absorption and action spectra',
      subtitle: _sub,
      formula: 'PAR = 400–700 nm',
      readouts: [
        Readout('Wavelength', f0(w), 'nm', wlColor(w)),
        Readout('Chlorophyll a', f0(100 * chlA(w)), '%', const Color(0xFF2F6B2A)),
        Readout('Chlorophyll b', f0(100 * chlB(w)), '%', const Color(0xFF7FA03A)),
        Readout('Carotenoids', f0(100 * carot(w)), '%', IX.amber),
      ],
      controls: [
        slider('wl', 'Wavelength', 400, 700, unit: 'nm'),
        Padding(padding: const EdgeInsets.only(top: 4), child: Text('Most photosynthesis happens in blue and red light, matching chlorophyll a, the chief pigment. Green is least absorbed, so leaves look green.', style: IX.text(17, c: IX.inkSoft))),
      ],
      painter: BioPainter((c, size) {
        final plot = Plot(Rect.fromLTRB(110, 80, size.width - 60, size.height * 0.48), 400, 700, 0, 1.1);
        plot.frame(c, xs: [400, 450, 500, 550, 600, 650, 700], ys: [0, 0.5, 1], fy: (y) => '${(y * 100).round()}', yLabel: 'Absorption', title: 'Absorption spectra of leaf pigments');
        plot.curve(c, chlA, const Color(0xFF2F6B2A), label: 'Chlorophyll a', labelX: 680);
        plot.curve(c, chlB, const Color(0xFF8DB040), label: 'Chlorophyll b', labelX: 625);
        plot.curve(c, carot, IX.amber, label: 'Carotenoids', labelX: 500);
        plot.vline(c, w, wlColor(w), w: 3);
        // Spectrum band.
        final band = Rect.fromLTRB(plot.r.left, plot.r.bottom + 36, plot.r.right, plot.r.bottom + 60);
        for (var x = 400.0; x < 700; x += 2) {
          final a = plot.pt(x, 0).dx, b2 = plot.pt(x + 2, 0).dx;
          c.drawRect(Rect.fromLTRB(a, band.top, b2 + 0.5, band.bottom), Paint()..color = wlColor(x));
        }
        final p2 = Plot(Rect.fromLTRB(110, size.height * 0.62, size.width - 60, size.height - 70), 400, 700, 0, 1.1);
        p2.frame(c, xs: [400, 450, 500, 550, 600, 650, 700], ys: [0, 0.5, 1], fy: (y) => '${(y * 100).round()}', xLabel: 'Wavelength (nm)', yLabel: 'Rate', title: 'Action spectrum: rate of photosynthesis');
        p2.curve(c, chlA, const Color(0xFF2F6B2A).withValues(alpha: 0.35), w: 2.5, dashed: true);
        p2.curve(c, actionSpec, IX.accent, label: 'Rate of photosynthesis', labelX: 600);
        p2.dot(c, w, actionSpec(w), IX.accent);
      }),
    );
  }

  // ------------------------------------------------------------------ thylakoid

  Widget _thylakoid() {
    final w = i('water'), pl = n('pHlumen'), ps = n('pHstroma'), light = n('light');
    final ratio = math.pow(10, ps - pl).toDouble();
    return frame(
      title: 'The light reaction and chemiosmosis',
      subtitle: _sub,
      formula: '2H₂O → 4H⁺ + O₂ + 4e⁻',
      readouts: [
        Readout('Protons from water', '${2 * w}', 'H⁺', IX.positive),
        Readout('Electrons to PS II', '${2 * w}', 'e⁻', IX.accent),
        Readout('O₂ released', w.isEven ? '${w ~/ 2}' : f1(w / 2), '', IX.green),
        Readout('[H⁺] lumen ÷ stroma', ratio >= 100 ? sci(ratio) : f0(ratio), '×'),
      ],
      controls: [
        slider('water', 'Water molecules split', 1, 20),
        slider('pHlumen', 'pH in the lumen', 4, 8, dp: 1, div: 40),
        slider('pHstroma', 'pH in the stroma', 6, 9, dp: 1, div: 30),
        slider('light', 'Light intensity', 0, 100, unit: '%'),
      ],
      painter: BioPainter((c, size) {
        final y = size.height * 0.50;
        final m = Rect.fromLTRB(30, y - 34, size.width - 30, y + 34);
        Bio.bilayer(c, m.centerLeft, m.centerRight, h: 68, head: BioC.chloro);
        c.drawRect(Rect.fromLTRB(30, 30, size.width - 30, m.top), Paint()..color = const Color(0xFFF2F8EC));
        c.drawRect(Rect.fromLTRB(30, m.bottom, size.width - 30, size.height - 40), Paint()..color = const Color(0xFFFFF6E8));
        IxPaint.label(c, 'STROMA  pH ${f1(ps)}', const Offset(50, 50), size: 19, color: BioC.chloroDark, w: FontWeight.w700, align: Alignment.centerLeft);
        IxPaint.label(c, 'LUMEN  pH ${f1(pl)}  (proton store)', Offset(50, size.height - 64), size: 19, color: IX.amber, w: FontWeight.w700, align: Alignment.centerLeft);
        final xs = [0.17, 0.36, 0.55, 0.83].map((f) => 30 + (size.width - 60) * f).toList();
        final cols = [const Color(0xFF4E9A45), const Color(0xFF8C6BB1), const Color(0xFF3F8F5A), const Color(0xFFC0504D)];
        final names = ['PS II', 'b₆f', 'PS I', 'ATP synthase'];
        final full = ['Photosystem II (P680)', 'Cytochrome b₆f complex', 'Photosystem I (P700)'];
        for (var k = 0; k < 3; k++) {
          Bio.soft(c, Bio.blob(Offset(xs[k], y), 62, 58, seed: k + 2, wobble: 0.07), cols[k], stroke: 2.4);
          IxPaint.label(c, names[k], Offset(xs[k], y), size: 19, color: Colors.white, w: FontWeight.w700);
          IxPaint.label(c, full[k], Offset(xs[k], y + (k == 0 ? 136 : 90)), size: 17, color: Bio.darken(cols[k], 0.2), w: FontWeight.w700, halo: true);
        }
        // ATP synthase: CF0 in the membrane, CF1 head in the stroma.
        final ax = xs[3];
        Bio.soft(c, Path()..addRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(ax, y), width: 60, height: 80), const Radius.circular(14))), cols[3], stroke: 2);
        c.drawRect(Rect.fromCenter(center: Offset(ax, y - 66), width: 16, height: 50), Paint()..color = Bio.darken(cols[3], 0.2));
        Bio.soft(c, Path()..addOval(Rect.fromCenter(center: Offset(ax, y - 110), width: 120, height: 70)), cols[3], stroke: 2);
        IxPaint.label(c, 'CF₁', Offset(ax, y - 110), size: 18, color: Colors.white, w: FontWeight.w700);
        IxPaint.label(c, 'CF₀', Offset(ax, y), size: 18, color: Colors.white, w: FontWeight.w700);
        IxPaint.label(c, names[3], Offset(ax, y - 168), size: 18, color: cols[3], w: FontWeight.w700, halo: true);
        // Light.
        final on = light > 3;
        for (final k in [0, 2]) {
          for (var j = -1; j <= 1; j++) {
            final a = Offset(xs[k] + j * 22 - 70, y - 220), b2 = Offset(xs[k] + j * 14 - 20, y - 70);
            if (on) IxPaint.arrow(c, a, b2, const Color(0xFFE0A030).withValues(alpha: 0.3 + 0.7 * light / 100), width: 3);
          }
        }
        if (on) IxPaint.label(c, 'Light', Offset(xs[0] - 90, y - 236), size: 18, color: IX.amber, w: FontWeight.w700);
        // Electron path.
        final ePath = Path()..moveTo(xs[0], y - 20)..quadraticBezierTo((xs[0] + xs[1]) / 2, y - 80, xs[1], y - 10)..quadraticBezierTo((xs[1] + xs[2]) / 2, y - 80, xs[2], y - 20)..quadraticBezierTo(xs[2] + 50, y - 130, xs[2] + 110, y - 150);
        if (on) {
          Bio.stroke(c, ePath, IX.accent, 3);
          Bio.tag(c, 'e⁻', Offset((xs[0] + xs[1]) / 2, y - 64), IX.accent);
          Bio.tag(c, 'e⁻', Offset((xs[1] + xs[2]) / 2, y - 64), IX.accent);
        }
        Bio.tag(c, 'NADP⁺ + H⁺ → NADPH', Offset(xs[2] + 130, y - 172), BioC.nadh, size: 17);
        // Water splitting on the lumen side.
        Bio.tag(c, '$w H₂O → ${2 * w} H⁺ + ${w.isEven ? w ~/ 2 : f1(w / 2)} O₂ + ${2 * w} e⁻', Offset(xs[0] + 60, y + 190), BioC.water, size: 17);
        // Protons in the lumen (number grows with the gradient).
        final rnd = math.Random(3);
        final nH = (8 + (ps - pl) * 9 * (0.3 + 0.7 * light / 100)).clamp(4, 60).round();
        for (var k = 0; k < nH; k++) {
          final p = Offset(60 + rnd.nextDouble() * (size.width - 120), m.bottom + 120 + rnd.nextDouble() * (size.height - m.bottom - 200));
          IxPaint.label(c, 'H⁺', p, size: 15, color: IX.positive, w: FontWeight.w700);
        }
        for (var k = 0; k < 6; k++) {
          IxPaint.label(c, 'H⁺', Offset(80 + rnd.nextDouble() * (size.width - 160), 100 + rnd.nextDouble() * (m.top - 260)), size: 15, color: IX.positive.withValues(alpha: 0.5), w: FontWeight.w700);
        }
        // Protons through ATP synthase.
        IxPaint.arrow(c, Offset(ax + 50, y + 80), Offset(ax + 50, y - 60), IX.positive, width: 3);
        IxPaint.label(c, 'H⁺ flow', Offset(ax + 62, y + 60), size: 16, color: IX.positive, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
        Bio.tag(c, 'ADP + Pi → ATP', Offset(ax - 150, y - 112), BioC.atp, size: 17);
      }),
    );
  }

  // ------------------------------------------------------------------ calvin

  Widget _calvin() {
    final g = i('glucose').clamp(1, 10), st = i('step').clamp(0, 2);
    final co2 = 6 * g;
    return frame(
      title: 'The Calvin cycle',
      subtitle: _sub,
      formula: 'per CO₂: 3 ATP + 2 NADPH',
      readouts: [
        Readout('CO₂ fixed (turns)', '$co2', '', IX.inkSoft),
        Readout('ATP used', '${3 * co2}', '', BioC.atp),
        Readout('NADPH used', '${2 * co2}', '', BioC.nadh),
        Readout('Glucose made', '$g', '', BioC.sugar),
      ],
      controls: [
        stepper('step', _calvinSteps),
        slider('glucose', 'Glucose molecules', 1, 10),
      ],
      painter: BioPainter((c, size) {
        final ctr = Offset(size.width * 0.34, size.height * 0.5);
        final R = math.min(size.width * 0.19, size.height * 0.29);
        final cols = [IX.green, IX.accent, IX.amber];
        final names = ['1  Carboxylation', '2  Reduction', '3  Regeneration'];
        final angs = [-math.pi / 2 - 0.3, math.pi / 6 - 0.2, 5 * math.pi / 6 + 0.1];
        c.drawCircle(ctr, R, Paint()..color = IX.grid..style = PaintingStyle.stroke..strokeWidth = 18);
        for (var k = 0; k < 3; k++) {
          final a0 = angs[k] - 0.55, sw = 1.6;
          final path = Path()..addArc(Rect.fromCircle(center: ctr, radius: R), a0, sw);
          Bio.stroke(c, path, k == st ? cols[k] : cols[k].withValues(alpha: 0.35), k == st ? 18 : 12);
          final endA = a0 + sw;
          final tip = ctr + Offset(math.cos(endA), math.sin(endA)) * R;
          final t = Offset(-math.sin(endA), math.cos(endA));
          final nn = Offset(math.cos(endA), math.sin(endA));
          c.drawPath(Path()..moveTo((tip + t * 22).dx, (tip + t * 22).dy)..lineTo((tip + nn * 20).dx, (tip + nn * 20).dy)..lineTo((tip - nn * 20).dx, (tip - nn * 20).dy)..close(), Paint()..color = k == st ? cols[k] : cols[k].withValues(alpha: 0.35));
          final lp = ctr + Offset(math.cos(angs[k]), math.sin(angs[k])) * (R * 0.6);
          IxPaint.label(c, names[k], lp, size: 20, color: k == st ? Bio.darken(cols[k], 0.2) : IX.muted, w: FontWeight.w700);
        }
        // Molecules at the junctions (per 6 CO₂ = 1 glucose, times g).
        Offset at(double a, double r) => ctr + Offset(math.cos(a), math.sin(a)) * r;
        Bio.tag(c, '${6 * g} RuBP (5C)', at(angs[0] - 0.95, R), IX.green, size: 18);
        Bio.tag(c, '${12 * g} 3-PGA (3C)', at(angs[1] - 0.75, R), IX.accent, size: 18);
        Bio.tag(c, '${12 * g} triose-P', at(angs[2] - 0.85, R), IX.amber, size: 18);
        flowArrow(c, at(angs[0] - 0.6, R + 150), at(angs[0] - 0.55, R + 14), '${6 * g} CO₂ + H₂O', IX.inkSoft);
        flowArrow(c, at(angs[1] + 0.35, R + 130), at(angs[1], R + 16), '${12 * g} ATP + ${12 * g} NADPH', BioC.nadh);
        flowArrow(c, at(angs[2] + 0.5, R + 150), at(angs[2] + 0.35, R + 14), '${6 * g} ATP', BioC.atp);
        IxPaint.arrow(c, at(angs[2] - 0.5, R + 14), at(angs[2] - 0.6, R + 130), BioC.sugar, width: 4, head: 16);
        Bio.tag(c, '$g glucose', at(angs[2] - 0.6, R + 150), BioC.sugar, size: 18);
        final text = [
          'RuBisCO (RuBP carboxylase-oxygenase) fixes CO₂ onto RuBP. The 6-carbon product splits at once into two molecules of 3-PGA, the first stable product of the C₃ pathway.',
          '3-PGA is reduced to triose phosphate using 2 ATP and 2 NADPH for each CO₂ fixed. Six turns fix 6 CO₂ and let one glucose leave the cycle.',
          'RuBP, the CO₂ acceptor, is rebuilt from triose phosphate using 1 more ATP per CO₂. So each CO₂ costs 3 ATP and 2 NADPH: 18 ATP and 12 NADPH per glucose.',
        ];
        final card = Rect.fromLTWH(size.width * 0.70, 60, size.width * 0.30 - 30, size.height - 120);
        Bio.card(c, card);
        Bio.heading(c, _calvinSteps[st], card.topLeft + const Offset(22, 20), color: cols[st]);
        Bio.note(c, text[st], card.topLeft + const Offset(22, 62), maxWidth: card.width - 44, size: 19, color: IX.ink, w: FontWeight.w400);
        Bio.note(c, 'In  6 CO₂ + 18 ATP + 12 NADPH\nOut  1 glucose + 18 ADP + 12 NADP⁺', card.bottomLeft + const Offset(22, -24), align: Alignment.bottomLeft, maxWidth: card.width - 44, size: 18, color: IX.inkSoft, w: FontWeight.w600);
      }),
    );
  }

  // ------------------------------------------------------------------ C3 and C4

  Widget _c4() {
    final co2 = n('co2'), t = n('T'), g = i('glucose').clamp(1, 10);
    final ox3 = (0.25 * (400 / co2) * math.pow(2, (t - 25) / 15)).clamp(0.02, 0.7).toDouble();
    final ox4 = ox3 * 0.04;
    return frame(
      title: 'C₃ and C₄ plants: avoiding photorespiration',
      subtitle: _sub,
      formula: 'C₄: 30 ATP per glucose, C₃: 18',
      readouts: [
        Readout('C₃: RuBisCO uses O₂', '${f0(100 * ox3)}%', 'of fixations', IX.positive),
        Readout('C₄: RuBisCO uses O₂', '${f1(100 * ox4)}%', 'of fixations', IX.green),
        Readout('ATP, C₃ ($g glucose)', '${18 * g}', ''),
        Readout('ATP, C₄ ($g glucose)', '${30 * g}', ''),
      ],
      controls: [
        slider('co2', 'CO₂ in air', 150, 1000, unit: 'µL/L'),
        slider('T', 'Leaf temperature', 10, 45, unit: '°C'),
        slider('glucose', 'Glucose molecules made', 1, 10),
      ],
      painter: BioPainter((c, size) {
        // Kranz anatomy cross-section.
        final ctr = Offset(size.width * 0.36, size.height * 0.46);
        final R = math.min(size.width * 0.17, size.height * 0.30);
        final rnd = math.Random(5);
        for (var k = 0; k < 14; k++) {
          final a = k / 14 * 2 * math.pi;
          final p = ctr + Offset(math.cos(a), math.sin(a)) * R * 0.92;
          Bio.soft(c, Bio.blob(p, R * 0.2, R * 0.16, seed: k, wobble: 0.08, rot: a), const Color(0xFFCFE5B8), stroke: 1.6, edge: const Color(0xFF7FA05A), shadow: false);
          for (var j = 0; j < 3; j++) {
            c.drawCircle(p + Offset(rnd.nextDouble() * 16 - 8, rnd.nextDouble() * 16 - 8), 4, Paint()..color = BioC.chloro);
          }
        }
        for (var k = 0; k < 10; k++) {
          final a = k / 10 * 2 * math.pi;
          final p = ctr + Offset(math.cos(a), math.sin(a)) * R * 0.56;
          Bio.soft(c, Bio.blob(p, R * 0.17, R * 0.15, seed: k + 20, wobble: 0.05, rot: a), const Color(0xFF8DBF6A), stroke: 2.4, edge: const Color(0xFF3E6B22), shadow: false);
          for (var j = 0; j < 5; j++) {
            c.drawCircle(p + Offset(rnd.nextDouble() * 22 - 11, rnd.nextDouble() * 22 - 11), 4.5, Paint()..color = BioC.chloroDark);
          }
        }
        Bio.soft(c, Path()..addOval(Rect.fromCircle(center: ctr, radius: R * 0.36)), const Color(0xFFE9D9B8), stroke: 2, shadow: false);
        for (var k = 0; k < 7; k++) {
          c.drawCircle(ctr + Offset(math.cos(k * 0.9) * R * 0.18, math.sin(k * 0.9) * R * 0.12 - R * 0.08), R * 0.06, Paint()..color = const Color(0xFFB58A5A)..style = PaintingStyle.stroke..strokeWidth = 3);
        }
        final parts = [
          BioPart('m', 'Mesophyll: PEPcase → OAA (4C)', ctr + Offset(R * 0.92, -R * 0.3)),
          BioPart('b', 'Bundle sheath (Calvin)', ctr + Offset(-R * 0.56, R * 0.1)),
          BioPart('v', 'Vascular bundle', ctr + Offset(0, R * 0.15)),
        ];
        drawLabels(c, parts, layoutLabels(parts, midX: ctr.dx, leftX: ctr.dx - R - 30, rightX: ctr.dx + R + 30, top: ctr.dy - R, bottom: ctr.dy + R), null, size: 17);
        Bio.heading(c, 'Kranz anatomy of a C₄ leaf (maize, sorghum)', Offset(ctr.dx - R, ctr.dy - R - 50));
        // Comparison bars.
        final plot = Plot(Rect.fromLTRB(size.width * 0.74, 110, size.width - 50, size.height - 120), -0.5, 1.5, 0, 70);
        plot.frame(c, xs: [], ys: [0, 20, 40, 60], yLabel: 'RuBisCO binding O₂ (%)', title: 'Photorespiration');
        plot.bars(c, [100 * ox3, 100 * ox4], [IX.positive, IX.green], labels: ['C₃ (wheat, rice)', 'C₄ (maize)'], fmt: (v) => '${f0(v)}%');
        Bio.note(c, 'C₄ plants concentrate CO₂ in the bundle sheath, so RuBisCO rarely binds O₂. Hot, dry conditions and low CO₂ raise photorespiration in C₃ plants.', Offset(ctr.dx - R, size.height - 40), align: Alignment.bottomLeft, maxWidth: size.width * 0.58, size: 18, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ limiting factors

  static double rate(double light, double co2, double t, bool c4) {
    final pmax = c4 ? 100.0 : 100 * (co2 / (co2 + 350)) * 1.9;
    final lightLim = 2.2 * light;
    final tf = math.exp(-math.pow((t - (c4 ? 35 : 25)) / 12, 2));
    final p = pmax.clamp(0, 120) * tf;
    return (lightLim * p / math.sqrt(lightLim * lightLim + p * p)).clamp(0, 120).toDouble();
  }

  Widget _limiting() {
    final light = n('light'), co2 = n('co2'), t = n('T');
    final c4 = str('plant') == 'c4';
    final r = rate(light, co2, t, c4);
    final rL = rate(light * 1.2 + 1, co2, t, c4) - r, rC = rate(light, co2 * 1.2, t, c4) - r, rT = rate(light, co2, t + 2, c4) - r;
    final lim = rL >= rC && rL >= rT.abs() ? 'Light' : (rC >= rT ? 'CO₂' : 'Temperature');
    return frame(
      title: 'Limiting factors',
      subtitle: _sub,
      formula: 'Blackman: the factor in shortest supply limits',
      readouts: [
        Readout('Rate', f0(r), 'units', IX.accent),
        Readout('Limiting factor', lim, '', IX.positive),
        Readout('CO₂', f0(co2), 'µL/L'),
        Readout('Temperature', f0(t), '°C'),
      ],
      controls: [
        choice('plant', 'Plant', const {'c3': 'C₃ (wheat)', 'c4': 'C₄ (maize)'}),
        slider('light', 'Light', 0, 100, unit: '% full sun'),
        slider('co2', 'CO₂ concentration', 100, 1000, unit: 'µL/L'),
        slider('T', 'Temperature', 5, 45, unit: '°C'),
      ],
      painter: BioPainter((c, size) {
        final plot = Plot(Rect.fromLTRB(120, 90, size.width - 70, size.height - 110), 0, 100, 0, 130);
        plot.frame(c, xs: [0, 20, 40, 60, 80, 100], ys: [0, 25, 50, 75, 100, 125], xLabel: 'Light intensity (% of full sunlight)', yLabel: 'Rate of photosynthesis', title: 'Rate against light at different CO₂');
        for (final (cc, a) in [(200.0, 0.35), (400.0, 0.5), (1000.0, 0.35)]) {
          if ((cc - co2).abs() < 30) continue;
          plot.curve(c, (x) => rate(x, cc, t, c4), IX.muted.withValues(alpha: a + 0.3), w: 2.5, dashed: true, label: '${f0(cc)} µL/L', labelX: 92);
        }
        plot.curve(c, (x) => rate(x, co2, t, c4), IX.accent, label: '${f0(co2)} µL/L', labelX: 75);
        plot.dot(c, light, r, IX.accent, label: '$lim limits', align: light > 70 ? Alignment.centerRight : Alignment.centerLeft);
        Bio.note(c, 'On the rising part, light limits: more light, more rate. On the plateau, light no longer helps; CO₂ (or temperature) is limiting. ${c4 ? 'C₄ plants are near their maximum at today\'s CO₂.' : 'C₃ plants gain from extra CO₂ — the basis of CO₂-enriched greenhouses.'}', plot.r.bottomRight + const Offset(-20, -20), align: Alignment.bottomRight, maxWidth: 520, size: 18, color: IX.ink);
      }),
    );
  }
}
