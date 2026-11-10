import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bio_kit.dart';

/// Breathing and exchange of gases (1st PUC Biology ch. 14; frog ch. 7): the respiratory
/// system and the mechanism of breathing, spirometer volumes, partial pressures at an
/// alveolus, the oxygen dissociation curve, and the three breathing routes of a frog.
///
/// Preset: {"mode": "system"|"spirometer"|"alveolus"|"odc"|"frog", "inhale": true, "focus": id,
/// "tv": 500, "irv": 2750, "erv": 1050, "rv": 1150, "rate": 12, "pAlv": 104, "pO2in": 40,
/// "pCO2in": 45, "thick": 1, "area": 100, "pO2": 40, "pH": 7.4, "T": 37, "p50": 26,
/// "medium": "land", "temp": 25}.
class LungsInstrument extends StatefulWidget {
  const LungsInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<LungsInstrument> createState() => _LungsState();
}

class _LungsState extends BioState<LungsInstrument> {
  @override
  String get instrumentId => 'bio-lungs';
  @override
  Map<String, dynamic> get lessonPreset => widget.preset;
  @override
  List<String> get modes => const ['system', 'spirometer', 'alveolus', 'odc', 'frog'];
  @override
  Map<String, Map<String, dynamic>> get presets => const {
    'Breathing in': {'mode': 'system', 'inhale': true},
    'Breathing out': {'mode': 'system', 'inhale': false},
    'Spirometer': {'mode': 'spirometer'},
    'Alveolus': {'mode': 'alveolus'},
    'High altitude': {'mode': 'alveolus', 'pAlv': 60},
    'O₂ dissociation curve': {'mode': 'odc'},
    'Bohr shift (tissues)': {'mode': 'odc', 'pH': 7.2, 'T': 39},
    'Frog breathing': {'mode': 'frog'},
  };
  @override
  Map<String, Object> defaults(String mode) => {
    'inhale': true, 'tv': 500, 'irv': 2750, 'erv': 1050, 'rv': 1150, 'rate': 12, 'pAlv': 104, 'pO2in': 40, 'pCO2in': 45, 'thick': 1, 'area': 100,
    'pO2': 40, 'pH': 7.4, 'T': 37, 'p50': 26, 'medium': 'land', 'temp': 25,
  };

  static const _sub = '1st PUC Biology · Breathing and exchange of gases';
  List<BioPart> _parts = const [];
  Map<String, Offset> _labels = const {};

  @override
  Widget build(BuildContext context) => switch (mode) {
    'spirometer' => _spiro(),
    'alveolus' => _alveolus(),
    'odc' => _odc(),
    'frog' => _frog(),
    _ => _system(),
  };

  // ------------------------------------------------------------------ system

  Widget _system() {
    final inh = b('inhale');
    return frame(
      title: inh ? 'Inspiration: breathing in' : 'Expiration: breathing out',
      subtitle: _sub,
      formula: 'volume ↑ → pressure ↓ → air in',
      readouts: [
        Readout('Diaphragm', inh ? 'Contracts, flattens' : 'Relaxes, domes up', '', IX.accent),
        Readout('External intercostals', inh ? 'Contract' : 'Relax', ''),
        Readout('Lung pressure', inh ? 'Below atmospheric' : 'Above atmospheric', '', inh ? IX.negative : IX.positive),
        Readout('Breaths', '12–16', 'per min'),
      ],
      controls: [
        toggle('inhale', 'Phase', on: 'Inspiration', off: 'Expiration'),
        Padding(padding: const EdgeInsets.only(top: 4), child: Text('Tap a part to read what it does.', style: IX.text(17, c: IX.inkSoft))),
      ],
      onTap: (at, size) {
        final id = hitPart(_parts, _labels, at);
        setState(() => id == null || id == s['focus'] ? s.remove('focus') : s['focus'] = id);
      },
      painter: BioPainter((c, size) {
        final infoH = 110.0;
        final k = math.min((size.height - infoH - 60) / 860, size.width / 1300);
        final ctr = Offset(size.width * 0.5, 20 + 510 * k);
        Offset p(double x, double y) => ctr + Offset(x, y) * k;
        final ex = inh ? 1.0 : 0.0;
        // Thorax / ribs.
        final cage = Bio.smooth([p(-260 - 20 * ex, -60), p(-290 - 26 * ex, 120), p(-250 - 20 * ex, 300), p(0, 330 + 30 * ex), p(250 + 20 * ex, 300), p(290 + 26 * ex, 120), p(260 + 20 * ex, -60), p(0, -110)]);
        c.drawPath(cage, Paint()..color = const Color(0xFFF7EEE8));
        for (var r = 0; r < 6; r++) {
          final y = -40.0 + r * 56;
          final lift = ex * (12 - r * 1.5);
          for (final sd in [-1.0, 1.0]) {
            final rib = Path()..moveTo(p(sd * 30, y - lift).dx, p(sd * 30, y - lift).dy)..quadraticBezierTo(p(sd * (270 + 20 * ex), y - 30 - lift).dx, p(sd * (270 + 20 * ex), y - 30 - lift).dy, p(sd * (255 + 18 * ex), y + 40 - lift).dx, p(sd * (255 + 18 * ex), y + 40 - lift).dy);
            Bio.stroke(c, rib, BioC.bone, 12 * k);
            Bio.stroke(c, rib, const Color(0xFFD8C9A6), 1.5);
          }
        }
        // Lungs.
        for (final sd in [-1.0, 1.0]) {
          final lung = Bio.smooth([p(sd * 40, -40), p(sd * 120, -110), p(sd * (215 + 25 * ex), -10), p(sd * (240 + 30 * ex), 160), p(sd * (220 + 20 * ex), 240 + 25 * ex), p(sd * 120, 220 + 30 * ex), p(sd * 50, 180)]);
          Bio.soft(c, lung, const Color(0xFFE9A3A8), stroke: 2.5, edge: const Color(0xFFB0475A), light: 0.45);
          // Bronchial tree.
          final tree = Paint()..color = const Color(0xFFF7E7E2)..strokeWidth = 7 * k..strokeCap = StrokeCap.round..style = PaintingStyle.stroke;
          void branch(Offset a, double ang, double len, int depth) {
            if (depth == 0) {
              c.drawCircle(a, 5 * k, Paint()..color = const Color(0xFFF2C4C7));
              return;
            }
            final b2 = a + Offset(math.cos(ang), math.sin(ang)) * len;
            c.drawLine(a, b2, tree..strokeWidth = (2 + depth * 1.6) * k);
            branch(b2, ang - 0.45, len * 0.68, depth - 1);
            branch(b2, ang + 0.45, len * 0.68, depth - 1);
          }
          branch(p(sd * 60, 20), sd > 0 ? 0.6 : math.pi - 0.6, 70 * k, 4);
        }
        // Trachea and larynx.
        final tr = Rect.fromLTRB(p(-18, -330).dx, p(-18, -330).dy, p(18, 20).dx, p(18, 20).dy);
        c.drawRRect(RRect.fromRectAndRadius(tr, Radius.circular(10 * k)), Paint()..color = const Color(0xFFF2D6CF));
        for (var y = -300.0; y < 0; y += 22) {
          c.drawLine(p(-18, y), p(18, y), Paint()..color = const Color(0xFFCBA8A0)..strokeWidth = 4 * k);
        }
        c.drawLine(p(0, 10), p(-60, 30), Paint()..color = const Color(0xFFF2D6CF)..strokeWidth = 20 * k..strokeCap = StrokeCap.round);
        c.drawLine(p(0, 10), p(60, 30), Paint()..color = const Color(0xFFF2D6CF)..strokeWidth = 20 * k..strokeCap = StrokeCap.round);
        Bio.soft(c, Path()..addRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: p(0, -330), width: 70 * k, height: 50 * k), Radius.circular(14 * k))), const Color(0xFFE8C1B6), stroke: 2);
        // Head outline: nasal passage and pharynx.
        final head = Path()..moveTo(p(-20, -360).dx, p(-20, -360).dy)..quadraticBezierTo(p(-30, -440).dx, p(-30, -440).dy, p(60, -470).dx, p(60, -470).dy)..lineTo(p(120, -455).dx, p(120, -455).dy);
        Bio.stroke(c, head, const Color(0xFFCBA8A0), 16 * k);
        // Diaphragm.
        final dome = inh ? 20.0 : 80.0;
        final dia = Path()..moveTo(p(-300, 310).dx, p(-300, 310).dy)..quadraticBezierTo(p(-150, 250 - dome).dx, p(-150, 250 - dome).dy, p(0, 290 - dome * 0.6).dx, p(0, 290 - dome * 0.6).dy)..quadraticBezierTo(p(150, 250 - dome).dx, p(150, 250 - dome).dy, p(300, 310).dx, p(300, 310).dy);
        Bio.stroke(c, dia, BioC.muscle, 16 * k);
        IxPaint.arrow(c, p(0, 300 - dome * 0.6), p(0, 300 - dome * 0.6 + (inh ? 50 : -50)), IX.accent, width: 4);
        IxPaint.arrow(c, p(130, -500), p(130, -440), inh ? IX.accent : IX.muted.withValues(alpha: 0.2), width: 4);
        IxPaint.label(c, inh ? 'air in' : 'air out', p(150, -500), size: 18, color: IX.accent, w: FontWeight.w700, align: Alignment.centerLeft);
        if (!inh) IxPaint.arrow(c, p(130, -440), p(130, -500), IX.accent, width: 4);
        final parts = [
          BioPart('nose', 'Nostrils and nasal passage', p(80, -465), 'Air enters through the external nostrils; the nasal chamber filters, warms and moistens it.'),
          BioPart('larynx', 'Larynx (sound box)', p(0, -330), 'A cartilaginous box; the epiglottis covers the glottis during swallowing so food does not enter.'),
          BioPart('trachea', 'Trachea', p(0, -180), 'A straight tube kept open by incomplete cartilaginous rings; divides into the right and left primary bronchi.'),
          BioPart('bronchi', 'Bronchi and bronchioles', p(-90, 50), 'Branch repeatedly into secondary and tertiary bronchi and bronchioles, ending in thin terminal bronchioles.'),
          BioPart('alveoli', 'Alveoli', p(170, 120), 'Very thin, irregular-walled, vascularised bag-like structures: the site of gas exchange by diffusion.'),
          BioPart('lung', 'Lungs (in pleural sacs)', p(-180, 160), 'Covered by a double pleura with pleural fluid between, which reduces friction on the lung surface.'),
          BioPart('ribs', 'Ribs and intercostal muscles', p(-255, -10), 'External intercostals lift the ribs and sternum in inspiration, increasing the thoracic volume front to back.'),
          BioPart('diaphragm', 'Diaphragm', p(-170, 260 - dome * 0.7), 'A dome-shaped muscle under the lungs; it contracts and flattens in inspiration, increasing the thoracic volume top to bottom.'),
        ];
        _parts = parts;
        _labels = layoutLabels(parts, midX: ctr.dx, leftX: ctr.dx - 330 * k - 40, rightX: ctr.dx + 330 * k + 40, top: 30, bottom: size.height - infoH - 40, gap: 48);
        drawLabels(c, parts, _labels, s['focus']);
        infoCard(c, Rect.fromLTWH(24, size.height - infoH - 16, size.width - 48, infoH), parts.where((q) => q.id == s['focus']).firstOrNull);
      }),
    );
  }

  // ------------------------------------------------------------------ spirometer

  Widget _spiro() {
    final tv = n('tv'), irv = n('irv'), erv = n('erv'), rv = n('rv'), rate = n('rate');
    final vc = tv + irv + erv, tlc = vc + rv;
    return frame(
      title: 'Lung volumes and capacities',
      subtitle: _sub,
      formula: 'VC = ERV + TV + IRV,  TLC = VC + RV',
      readouts: [
        Readout('Vital capacity', grp(vc), 'mL', IX.accent),
        Readout('Total lung capacity', grp(tlc), 'mL'),
        Readout('Inspiratory capacity', grp(tv + irv), 'mL', IX.green),
        Readout('Minute volume', grp(tv * rate), 'mL/min', IX.inkSoft),
      ],
      controls: [
        slider('tv', 'Tidal volume', 300, 800, unit: 'mL', div: 50),
        slider('irv', 'Inspiratory reserve volume', 2000, 3500, unit: 'mL', div: 30),
        slider('erv', 'Expiratory reserve volume', 700, 1400, unit: 'mL', div: 70),
        slider('rv', 'Residual volume', 800, 1500, unit: 'mL', div: 70),
        slider('rate', 'Breaths per minute', 8, 30),
      ],
      painter: BioPainter((c, size) {
        final plot = Plot(Rect.fromLTRB(110, 70, size.width * 0.64, size.height - 90), 0, 30, 0, 6500);
        plot.frame(c, xs: [0, 10, 20, 30], ys: [0, 1000, 2000, 3000, 4000, 5000, 6000], xLabel: 'Time (s)', yLabel: 'Lung volume (mL)', title: 'Spirometer trace');
        final frc = rv + erv;
        double vol(double t) {
          final period = 60 / rate;
          if (t < 14) return frc + tv * (0.5 - 0.5 * math.cos(2 * math.pi * t / period));
          if (t < 18) return frc + (tv + irv) * (0.5 - 0.5 * math.cos(math.pi * (t - 14) / 4));
          if (t < 23) return frc + (tv + irv) - (tv + irv + erv) * (0.5 - 0.5 * math.cos(math.pi * (t - 18) / 5));
          return rv + erv * (0.5 - 0.5 * math.cos(math.pi * math.min(1, (t - 23) / 4)));
        }
        c.drawRect(Rect.fromLTRB(plot.r.left, plot.pt(0, rv).dy, plot.r.right, plot.r.bottom), Paint()..color = IX.grid);
        IxPaint.label(c, 'Residual volume ${grp(rv)} mL (never exhaled)', plot.pt(15, rv / 2), size: 16, color: IX.inkSoft, w: FontWeight.w600);
        plot.curve(c, vol, IX.accent, w: 3.5);
        // Bracket bars on the right.
        final bx = plot.r.right + 30;
        void bracket(double from, double to, String name, Color col, double x) {
          final a = plot.pt(0, from).dy, b2 = plot.pt(0, to).dy;
          c.drawLine(Offset(x, a), Offset(x, b2), Paint()..color = col..strokeWidth = 8..strokeCap = StrokeCap.round);
          IxPaint.label(c, name, Offset(x + 14, (a + b2) / 2), size: 16, color: col, w: FontWeight.w700, align: Alignment.centerLeft);
        }
        bracket(0, rv, 'RV ${grp(rv)}', IX.muted, bx);
        bracket(rv, rv + erv, 'ERV ${grp(erv)}', IX.amber, bx);
        bracket(rv + erv, rv + erv + tv, 'TV ${grp(tv)}', IX.green, bx);
        bracket(rv + erv + tv, tlc, 'IRV ${grp(irv)}', IX.positive, bx);
        final cx = bx + 170;
        bracket(rv, tlc, 'VC ${grp(vc)}', IX.accent, cx);
        bracket(0, rv + erv, 'FRC ${grp(rv + erv)}', IX.inkSoft, cx);
        bracket(0, tlc, 'TLC ${grp(tlc)}', IX.ink, cx + 150);
      }),
    );
  }

  // ------------------------------------------------------------------ alveolus

  Widget _alveolus() {
    final pa = n('pAlv'), pin = n('pO2in'), cin = n('pCO2in'), th = n('thick'), ar = n('area');
    final k = 3.0 * (ar / 100) / th;
    double po2(double x) => pa - (pa - pin) * math.exp(-k * x);
    final out = po2(1);
    return frame(
      title: 'Gas exchange in an alveolus',
      subtitle: _sub,
      formula: 'diffusion ∝ gradient × area ÷ thickness',
      readouts: [
        Readout('O₂ gradient', f0(pa - pin), 'mm Hg', IX.positive),
        Readout('CO₂ gradient', f0(cin - 40), 'mm Hg', IX.accent),
        Readout('pO₂ leaving', f0(out), 'mm Hg', BioC.oxy),
        Readout('Atmospheric pO₂', '159', 'mm Hg', IX.inkSoft),
      ],
      controls: [
        slider('pAlv', 'Alveolar pO₂', 40, 110, unit: 'mm Hg'),
        slider('pO2in', 'pO₂ of blood arriving', 20, 60, unit: 'mm Hg'),
        slider('pCO2in', 'pCO₂ of blood arriving', 40, 60, unit: 'mm Hg'),
        slider('thick', 'Membrane thickness (× normal)', 1, 5, dp: 1, div: 40),
        slider('area', 'Surface area', 20, 100, unit: '%'),
      ],
      painter: BioPainter((c, size) {
        // Alveolus with a capillary wrapping it.
        final ac = Offset(size.width * 0.25, size.height * 0.42);
        final R = math.min(size.width * 0.17, size.height * 0.26);
        Bio.soft(c, Bio.blob(ac, R, R * 0.92, seed: 4, wobble: 0.05), const Color(0xFFFBE9E6), stroke: 3 * th, edge: const Color(0xFFD9939B));
        IxPaint.label(c, 'Alveolar air', ac + Offset(0, -R * 0.3), size: 19, color: IX.ink, w: FontWeight.w700);
        IxPaint.label(c, 'pO₂ ${f0(pa)}  pCO₂ 40', ac + Offset(0, -R * 0.05), size: 18, color: IX.inkSoft, w: FontWeight.w600);
        final cap = Path()..addArc(Rect.fromCircle(center: ac, radius: R + 34), math.pi * 0.15, math.pi * 1.1);
        final m = cap.computeMetrics().first;
        for (var s0 = 0.0; s0 < m.length; s0 += 6) {
          final t = s0 / m.length;
          final col = Color.lerp(BioC.deoxy, BioC.oxy, ((po2(t) - 20) / 90).clamp(0, 1))!;
          c.drawPath(m.extractPath(s0, math.min(s0 + 7, m.length)), Paint()..color = col..style = PaintingStyle.stroke..strokeWidth = 36..strokeCap = StrokeCap.butt);
        }
        final st = m.getTangentForOffset(0)!.position, en = m.getTangentForOffset(m.length)!.position;
        IxPaint.label(c, 'blood in: pO₂ ${f0(pin)}, pCO₂ ${f0(cin)}', st + const Offset(-10, 64), size: 17, color: BioC.deoxy, w: FontWeight.w700, align: Alignment.centerRight, halo: true);
        IxPaint.label(c, 'blood out: pO₂ ${f0(out)}, pCO₂ 40', en + const Offset(30, -56), size: 17, color: BioC.oxy, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
        for (var a = 1.0; a < 3.6; a += 0.6) {
          final o = ac + Offset(math.cos(a), math.sin(a)) * (R - 30), q = ac + Offset(math.cos(a), math.sin(a)) * (R + 24);
          IxPaint.arrow(c, o, q, IX.positive, width: 2.5, head: 10);
        }
        IxPaint.label(c, 'O₂ →', ac + Offset(0, R * 0.45), size: 17, color: IX.positive, w: FontWeight.w700);
        // pO2 along the capillary.
        final plot = Plot(Rect.fromLTRB(size.width * 0.58, 80, size.width - 50, size.height * 0.55), 0, 1, 0, 120);
        plot.frame(c, xs: [0, 0.5, 1], ys: [0, 40, 80, 120], fx: (x) => x == 0 ? 'start' : (x == 1 ? 'end' : 'middle'), xLabel: 'Along the capillary', yLabel: 'pO₂ (mm Hg)', title: 'Blood pO₂ rises to match the alveolus');
        plot.hline(c, pa, IX.positive, label: 'alveolar');
        plot.curve(c, po2, BioC.oxy);
        // Partial-pressure table (NCERT).
        final t = Rect.fromLTWH(size.width * 0.55, size.height * 0.66, size.width * 0.42, size.height * 0.30);
        final rows = [('', 'Atm. air', 'Alveoli', 'Deoxy blood', 'Oxy blood', 'Tissues'), ('O₂', '159', f0(pa), f0(pin), f0(out), '40'), ('CO₂', '0.3', '40', f0(cin), '40', '45')];
        for (var r = 0; r < 3; r++) {
          for (var col = 0; col < 6; col++) {
            final x = t.left + col * t.width / 6;
            final y = t.top + r * 44.0;
            IxPaint.label(c, [rows[r].$1, rows[r].$2, rows[r].$3, rows[r].$4, rows[r].$5, rows[r].$6][col], Offset(x + t.width / 12, y + 16), size: r == 0 ? 14 : 18, color: r == 0 ? IX.inkSoft : IX.ink, w: col == 0 || r == 0 ? FontWeight.w700 : FontWeight.w500);
          }
        }
        IxPaint.label(c, 'Partial pressures (mm Hg)', t.topLeft + const Offset(0, -20), size: 17, color: IX.ink, w: FontWeight.w700, align: Alignment.centerLeft);
      }),
    );
  }

  // ------------------------------------------------------------------ ODC

  Widget _odc() {
    final p = n('pO2'), ph = n('pH'), t = n('T');
    final p50 = n('p50') * math.pow(10, -0.48 * (ph - 7.4)) * math.pow(1.024, t - 37);
    double sat(double x) => 100 * math.pow(x, 2.7) / (math.pow(x, 2.7) + math.pow(p50, 2.7));
    double sat0(double x) => 100 * math.pow(x, 2.7) / (math.pow(x, 2.7) + math.pow(26, 2.7));
    return frame(
      title: 'The oxygen dissociation curve',
      subtitle: _sub,
      formula: 'sigmoid: Hb picks up O₂ in lungs, drops it in tissues',
      readouts: [
        Readout('Saturation at pO₂ ${f0(p)}', f0(sat(p)), '%', IX.accent),
        Readout('P50', f1(p50.toDouble()), 'mm Hg'),
        Readout('In the lungs (100)', f0(sat(100)), '%', BioC.oxy),
        Readout('O₂ delivered per 100 mL', f1((sat(100) - sat(40)) / 100 * 20), 'mL', IX.green),
      ],
      controls: [
        slider('pO2', 'pO₂', 0, 110, unit: 'mm Hg'),
        slider('pH', 'Blood pH', 7.0, 7.6, dp: 2, div: 60),
        slider('T', 'Temperature', 33, 42, unit: '°C', dp: 1, div: 18),
        slider('p50', 'P50 at pH 7.4, 37 °C', 20, 34, unit: 'mm Hg'),
      ],
      painter: BioPainter((c, size) {
        final plot = Plot(Rect.fromLTRB(120, 80, size.width - 70, size.height - 110), 0, 110, 0, 105);
        plot.frame(c, xs: [0, 20, 40, 60, 80, 100], ys: [0, 25, 50, 75, 100], xLabel: 'Partial pressure of O₂ (mm Hg)', yLabel: '% saturation of haemoglobin', title: 'Sigmoid oxygen dissociation curve');
        if ((p50 - 26).abs() > 0.5) plot.curve(c, sat0, IX.muted, w: 2.5, dashed: true, label: 'normal', labelX: 14);
        plot.curve(c, sat, BioC.oxy, label: p50 > 26.5 ? 'shifted right (Bohr effect)' : (p50 < 25.5 ? 'shifted left' : 'pH 7.4, 37 °C'), labelX: 55);
        plot.vline(c, 40, IX.inkSoft, label: 'tissues 40');
        plot.vline(c, 100, IX.inkSoft, label: 'alveoli');
        plot.hline(c, 50, IX.muted, label: '50%');
        plot.dot(c, p, sat(p), IX.accent, label: '${f0(sat(p))}%');
        Bio.note(c, 'In the tissues high pCO₂, high H⁺ (low pH) and higher temperature shift the curve right: Hb lets go of more O₂. In the alveoli the opposite favours oxyhaemoglobin. About 97% of O₂ travels as oxyhaemoglobin; each 100 mL of oxygenated blood delivers about 5 mL to the tissues.', plot.r.bottomRight + const Offset(-20, -20), align: Alignment.bottomRight, maxWidth: 560, size: 17, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ frog

  Widget _frog() {
    final medium = str('medium', 'land');
    final temp = n('temp');
    final (skin, buccal, lung) = switch (medium) {
      'water' => (100.0, 0.0, 0.0),
      'hibernation' => (100.0, 0.0, 0.0),
      _ => (25.0 + (temp < 15 ? 20 : 0), 10.0, 65.0 - (temp < 15 ? 20 : 0)),
    };
    final o2use = medium == 'hibernation' ? 5 : (4 + temp * 0.6);
    return frame(
      title: 'How a frog breathes',
      subtitle: '1st PUC Biology · Structural organisation in animals',
      formula: 'cutaneous + buccal + pulmonary',
      readouts: [
        Readout('Through skin', f0(skin), '%', IX.green),
        Readout('Buccal cavity', f0(buccal), '%', IX.amber),
        Readout('Lungs', f0(lung), '%', BioC.oxy),
        Readout('O₂ demand', f0(o2use.toDouble()), 'relative', IX.inkSoft),
      ],
      controls: [
        choice('medium', 'Where the frog is', const {'water': 'In water', 'land': 'On land', 'hibernation': 'Hibernating'}),
        slider('temp', 'Surrounding temperature', 5, 35, unit: '°C'),
      ],
      painter: BioPainter((c, size) {
        final fc = Offset(size.width * 0.3, size.height * 0.48);
        final k = math.min(size.width / 1400, size.height / 900);
        Offset p(double x, double y) => fc + Offset(x, y) * k;
        if (medium == 'water') c.drawRect(Rect.fromLTWH(0, size.height * 0.25, size.width * 0.6, size.height * 0.75), Paint()..color = const Color(0xFFE2F0F8));
        if (medium == 'hibernation') c.drawRect(Rect.fromLTWH(0, size.height * 0.25, size.width * 0.6, size.height * 0.75), Paint()..color = const Color(0xFFEFE4D4));
        const skinC = Color(0xFF7FA651);
        for (final sd in [-1.0, 1.0]) {
          Bio.soft(c, Bio.smooth([p(sd * 120, 80), p(sd * 260, 120), p(sd * 300, 210), p(sd * 200, 230), p(sd * 150, 160)]), Bio.darken(skinC, 0.08), stroke: 2);
          Bio.soft(c, Bio.smooth([p(sd * 100, -60), p(sd * 200, -40), p(sd * 230, 20), p(sd * 190, 30), p(sd * 120, -10)]), Bio.darken(skinC, 0.08), stroke: 2);
        }
        Bio.soft(c, Bio.blob(p(0, 40), 170 * k, 140 * k, seed: 3, wobble: 0.03), skinC, stroke: 2.5, edge: const Color(0xFF4E6E2E));
        Bio.soft(c, Bio.blob(p(0, -120), 130 * k, 90 * k, seed: 5, wobble: 0.03), skinC, stroke: 2.5, edge: const Color(0xFF4E6E2E));
        for (final sd in [-1.0, 1.0]) {
          Bio.soft(c, Path()..addOval(Rect.fromCircle(center: p(sd * 70, -185), radius: 30 * k)), const Color(0xFFE9E3B0), stroke: 2);
          c.drawCircle(p(sd * 70, -185), 14 * k, Paint()..color = const Color(0xFF202030));
        }
        final rnd = math.Random(2);
        for (var j = 0; j < 22; j++) {
          c.drawCircle(p(rnd.nextDouble() * 260 - 130, rnd.nextDouble() * 220 - 60), (6 + rnd.nextDouble() * 8) * k, Paint()..color = const Color(0xFF5C7F3A));
        }
        // Lungs inside (shown as a cut-away).
        if (lung > 0) {
          for (final sd in [-1.0, 1.0]) {
            Bio.soft(c, Bio.blob(p(sd * 55, 10), 40 * k, 60 * k, seed: 7), const Color(0xFFE9A3A8), stroke: 2, edge: const Color(0xFFB0475A));
          }
        }
        final parts = [
          BioPart('s', 'Moist skin (cutaneous)', p(-130, 120)),
          BioPart('b', 'Buccal cavity', p(0, -110)),
          if (lung > 0) BioPart('l', 'Lungs (pulmonary)', p(55, 10)),
        ];
        drawLabels(c, parts, layoutLabels(parts, midX: fc.dx, leftX: fc.dx - 320 * k, rightX: fc.dx + 320 * k, top: 40, bottom: size.height - 40), null);
        final plot = Plot(Rect.fromLTRB(size.width * 0.66, 100, size.width - 50, size.height - 150), -0.5, 2.5, 0, 110);
        plot.frame(c, xs: [], ys: [0, 25, 50, 75, 100], yLabel: 'Share of gas exchange (%)', title: 'Breathing routes');
        plot.bars(c, [skin, buccal, lung], [IX.green, IX.amber, BioC.oxy], labels: const ['Skin', 'Buccal', 'Lungs'], fmt: (v) => '${f0(v)}%');
        Bio.note(c, 'In water a frog breathes only through its moist, vascular skin. On land the buccal cavity, skin and lungs all work; the lungs take most of the load. During hibernation and aestivation it breathes through the skin alone.', Offset(size.width * 0.04, size.height - 20), align: Alignment.bottomLeft, maxWidth: size.width * 0.55, size: 17, color: IX.ink);
      }),
    );
  }
}
