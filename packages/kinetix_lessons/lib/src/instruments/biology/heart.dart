import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bio_kit.dart';

/// Body fluids and circulation (1st PUC Biology ch. 15): the human heart in section (tap a part),
/// the cardiac cycle with the ECG, cardiac output, nervous control of the heart rate, blood
/// pressure, ABO transfusion, and the differential leucocyte count.
///
/// Preset: {"mode": "heart"|"cycle"|"output"|"regulation"|"bp"|"blood"|"wbc", "focus": part id,
/// "t": 0.25 (s into the cycle), "hr": 72, "sv": 70, "symp": 0, "para": 0, "sys": 120, "dia": 80,
/// "donor": "O", "recipient": "A", "total": 7000, "neut": 62}.
class HeartInstrument extends StatefulWidget {
  const HeartInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<HeartInstrument> createState() => _HeartState();
}

class _HeartState extends BioState<HeartInstrument> {
  @override
  String get instrumentId => 'bio-heart';
  @override
  Map<String, dynamic> get lessonPreset => widget.preset;
  @override
  List<String> get modes => const ['heart', 'cycle', 'output', 'regulation', 'bp', 'blood', 'wbc'];
  @override
  Map<String, Map<String, dynamic>> get presets => const {
    'The heart': {'mode': 'heart'},
    'Conducting system': {'mode': 'heart', 'focus': 'sa'},
    'Cardiac cycle and ECG': {'mode': 'cycle'},
    'Cardiac output': {'mode': 'output'},
    'Nerves and the heart rate': {'mode': 'regulation'},
    'Blood pressure': {'mode': 'bp'},
    'Blood transfusion': {'mode': 'blood'},
    'WBC count': {'mode': 'wbc'},
  };
  @override
  Map<String, Object> defaults(String mode) => {
    't': 0.25, 'hr': 72, 'sv': 70, 'symp': 0, 'para': 0, 'sys': 120, 'dia': 80, 'donor': 'O', 'recipient': 'A', 'total': 7000, 'neut': 62,
  };

  static const _sub = '1st PUC Biology · Body fluids and circulation';
  List<BioPart> _parts = const [];
  Map<String, Offset> _labels = const {};

  @override
  Widget build(BuildContext context) => switch (mode) {
    'cycle' => _cycle(),
    'output' => _output(),
    'regulation' => _regulation(),
    'bp' => _bp(),
    'blood' => _blood(),
    'wbc' => _wbc(),
    _ => _heartMode(),
  };

  // ------------------------------------------------------------------ drawing the heart

  /// Draws the heart in section centred at [c] with scale [s] (about the half-width in px).
  /// [atria] and [vent] are contraction amounts 0–1; [avOpen], [slOpen] valve states.
  List<BioPart> drawHeart(Canvas cv, Offset c, double s, {double atria = 0, double vent = 0, bool avOpen = true, bool slOpen = false, bool conduction = true, double flash = 0}) {
    Offset p(double x, double y) => c + Offset(x * s, y * s);
    const oxyC = Color(0xFFE6777A), deoC = Color(0xFF7D93D1);
    Path tube(List<Offset> pts, double w) {
      final path = Bio.smooth(pts, closed: false);
      return path;
    }

    void vessel(List<Offset> pts, double w, Color col) {
      final path = tube(pts, w);
      cv.drawPath(path.shift(const Offset(0, 4)), Paint()..color = const Color(0x2213165A)..style = PaintingStyle.stroke..strokeWidth = w..strokeCap = StrokeCap.butt..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4));
      cv.drawPath(path, Paint()..color = Bio.darken(col, 0.3)..style = PaintingStyle.stroke..strokeWidth = w + 4..strokeCap = StrokeCap.butt);
      cv.drawPath(path, Paint()..color = col..style = PaintingStyle.stroke..strokeWidth = w..strokeCap = StrokeCap.butt);
      cv.drawPath(path, Paint()..color = Colors.white.withValues(alpha: 0.25)..style = PaintingStyle.stroke..strokeWidth = w * 0.25..strokeCap = StrokeCap.butt);
    }

    // Vessels behind the heart.
    vessel([p(-0.36, -1.05), p(-0.36, -0.6), p(-0.36, -0.3)], 0.16 * s, BioC.deoxy); // superior vena cava
    vessel([p(-0.42, 0.95), p(-0.44, 0.6), p(-0.42, 0.12)], 0.16 * s, BioC.deoxy); // inferior vena cava
    vessel([p(0.42, -0.36), p(0.62, -0.38), p(0.86, -0.42)], 0.09 * s, BioC.oxy); // pulmonary veins
    vessel([p(0.42, -0.2), p(0.62, -0.2), p(0.86, -0.16)], 0.09 * s, BioC.oxy);
    vessel([p(-0.06, -0.2), p(-0.06, -0.62), p(-0.3, -0.72), p(-0.7, -0.7)], 0.15 * s, BioC.deoxy); // pulmonary trunk, left branch
    vessel([p(-0.06, -0.62), p(0.3, -0.66), p(0.7, -0.6)], 0.12 * s, BioC.deoxy);
    vessel([p(0.1, -0.1), p(0.08, -0.7), p(0.2, -1.0), p(0.48, -0.98), p(0.6, -0.72), p(0.6, -0.4)], 0.18 * s, BioC.oxy); // aorta arch

    // Outer muscle.
    final outer = Bio.smooth([p(-0.5, -0.32), p(-0.2, -0.42), p(0.2, -0.40), p(0.48, -0.30), p(0.58, 0.05), p(0.48, 0.45), p(0.18, 0.82), p(0.02, 0.98), p(-0.18, 0.72), p(-0.5, 0.35), p(-0.6, 0.0)]);
    Bio.soft(cv, outer, BioC.muscle, stroke: 3, light: 0.35);
    // Chambers, shrinking when they contract.
    final ka = 1 - 0.18 * atria, kv = 1 - 0.22 * vent;
    final ra = Bio.blob(p(-0.33, -0.1), 0.19 * s * ka, 0.19 * s * ka, seed: 2, wobble: 0.04);
    final la = Bio.blob(p(0.27, -0.14), 0.17 * s * ka, 0.15 * s * ka, seed: 3, wobble: 0.04);
    final rv = Bio.smooth([p(-0.42, 0.14), p(-0.12, 0.08 + 0.06 * vent), p(-0.06, 0.3), p(-0.12, 0.6 - 0.1 * vent), p(-0.36, 0.38)].map((q) => Offset.lerp(p(-0.25, 0.32), q, kv)!).toList());
    final lv = Bio.smooth([p(0.06, 0.12), p(0.36, 0.06), p(0.42, 0.3), p(0.2, 0.68), p(0.05, 0.72), p(0.04, 0.4)].map((q) => Offset.lerp(p(0.22, 0.38), q, kv)!).toList());
    for (final (ch, col, k) in [(ra, deoC, atria), (rv, deoC, vent), (la, oxyC, atria), (lv, oxyC, vent)]) {
      Bio.soft(cv, ch, Color.lerp(col, Bio.darken(col, 0.2), k)!, stroke: 2, edge: Bio.darken(BioC.muscle, 0.3), shadow: false, light: 0.3);
    }
    // Valves.
    final valve = Paint()..color = Colors.white..strokeWidth = 5..strokeCap = StrokeCap.round;
    void flaps(Offset at, double w, bool open, double dir) {
      final drop = open ? 0.12 * s : 0.02 * s;
      cv.drawLine(at + Offset(-w, 0), at + Offset(-w * (open ? 0.6 : 0.05), drop * dir), valve);
      cv.drawLine(at + Offset(w, 0), at + Offset(w * (open ? 0.6 : 0.05), drop * dir), valve);
    }
    flaps(p(-0.26, 0.09), 0.09 * s, avOpen, 1);
    flaps(p(0.24, 0.04), 0.09 * s, avOpen, 1);
    flaps(p(-0.06, -0.2), 0.065 * s, slOpen, -1);
    flaps(p(0.1, -0.1), 0.07 * s, slOpen, -1);
    // Conducting system.
    if (conduction) {
      final y = Paint()..color = Color.lerp(BioC.nerve, const Color(0xFFFFF59D), flash)!..strokeWidth = 4..style = PaintingStyle.stroke..strokeCap = StrokeCap.round;
      cv.drawPath(Path()..moveTo(p(-0.08, 0.06).dx, p(-0.08, 0.06).dy)..lineTo(p(-0.02, 0.2).dx, p(-0.02, 0.2).dy)..lineTo(p(-0.02, 0.62).dx, p(-0.02, 0.62).dy), y);
      cv.drawPath(Bio.smooth([p(-0.02, 0.62), p(-0.2, 0.62), p(-0.42, 0.34)], closed: false), y..strokeWidth = 3);
      cv.drawPath(Bio.smooth([p(-0.02, 0.62), p(0.18, 0.78), p(0.44, 0.4)], closed: false), y);
      for (final q in [p(-0.36, -0.28), p(-0.08, 0.06)]) {
        cv.drawCircle(q, 0.045 * s, Paint()..color = Color.lerp(const Color(0xFFE0A030), const Color(0xFFFFF59D), flash)!);
        cv.drawCircle(q, 0.045 * s, Paint()..color = Bio.darken(BioC.nerve, 0.4)..style = PaintingStyle.stroke..strokeWidth = 1.5);
      }
    }
    return [
      BioPart('svc', 'Superior vena cava', p(-0.36, -0.82), 'Brings deoxygenated blood from the head and upper body into the right atrium.'),
      BioPart('ivc', 'Inferior vena cava', p(-0.43, 0.75), 'Brings deoxygenated blood from the lower body into the right atrium.'),
      BioPart('ra', 'Right atrium', p(-0.38, -0.08), 'Thin-walled receiving chamber for deoxygenated blood from the body. The SA node lies in its upper right corner.'),
      BioPart('rv', 'Right ventricle', p(-0.25, 0.36), 'Pumps deoxygenated blood into the pulmonary artery, to the lungs (pulmonary circulation).'),
      BioPart('la', 'Left atrium', p(0.28, -0.14), 'Receives oxygenated blood from the lungs through the pulmonary veins.'),
      BioPart('lv', 'Left ventricle', p(0.24, 0.38), 'The thickest wall: pumps oxygenated blood into the aorta, round the whole body (systemic circulation).'),
      BioPart('tri', 'Tricuspid valve', p(-0.26, 0.1), 'Three muscular flaps guard the opening between the right atrium and right ventricle; they stop backflow.'),
      BioPart('bi', 'Bicuspid (mitral) valve', p(0.24, 0.05), 'Two flaps between the left atrium and left ventricle.'),
      BioPart('sl', 'Semilunar valves', p(0.1, -0.12), 'At the openings of the pulmonary artery and the aorta; they stop blood flowing back into the ventricles.'),
      BioPart('aorta', 'Aorta', p(0.34, -1.0), 'Carries oxygenated blood from the left ventricle to the body.'),
      BioPart('pa', 'Pulmonary artery', p(-0.5, -0.71), 'Carries deoxygenated blood from the right ventricle to the lungs.'),
      BioPart('pv', 'Pulmonary veins', p(0.72, -0.18), 'Bring oxygenated blood from the lungs to the left atrium.'),
      BioPart('sa', 'SA node (pacemaker)', p(-0.36, -0.28), 'The sino-atrial node in the right atrium generates 70–75 action potentials a minute and starts every beat: the pacemaker.'),
      BioPart('av', 'AV node', p(-0.08, 0.06), 'The atrio-ventricular node passes the wave from the atria to the bundle of His after a short delay.'),
      BioPart('his', 'Bundle of His, Purkinje fibres', p(-0.02, 0.45), 'Carry the impulse down the interventricular septum and through the ventricular walls so the ventricles contract together.'),
      BioPart('septum', 'Interventricular septum', p(-0.0, 0.22), 'A thick muscular wall separating the left and right ventricles.'),
    ];
  }

  Widget _heartMode() {
    final focus = s['focus'];
    return frame(
      title: 'The human heart',
      subtitle: _sub,
      formula: 'double circulation',
      readouts: const [
        Readout('Chambers', '4', '2 atria, 2 ventricles', IX.accent),
        Readout('Heart rate', '72', 'beats/min'),
        Readout('Pacemaker', 'SA node', '', IX.amber),
        Readout('Made of', 'Cardiac muscle', ''),
      ],
      controls: [Padding(padding: const EdgeInsets.only(top: 4, bottom: 4), child: Text('Tap a part of the heart to read what it does. Blue: deoxygenated blood. Red: oxygenated blood.', style: IX.text(18, c: IX.inkSoft)))],
      onTap: (at, size) {
        final id = hitPart(_parts, _labels, at);
        setState(() => id == null || id == s['focus'] ? s.remove('focus') : s['focus'] = id);
      },
      painter: BioPainter((c, size) {
        final infoH = 110.0;
        final s0 = math.min((size.height - infoH - 80) / 2.15, size.width * 0.22);
        final ctr = Offset(size.width * 0.5, 40 + s0 * 1.08);
        final parts = drawHeart(c, ctr, s0);
        _parts = parts;
        _labels = layoutLabels(parts, midX: ctr.dx, leftX: ctr.dx - s0 * 0.95 - 40, rightX: ctr.dx + s0 * 0.95 + 40, top: 30, bottom: size.height - infoH - 40, gap: 42);
        drawLabels(c, parts, _labels, focus, size: 17);
        infoCard(c, Rect.fromLTWH(24, size.height - infoH - 16, size.width - 48, infoH), parts.where((p) => p.id == focus).firstOrNull);
      }),
    );
  }

  // ------------------------------------------------------------------ cardiac cycle

  static double ecg(double ph) {
    // ph 0–1 of a cycle scaled from the 0.8 s textbook cycle.
    double g(double mu, double sd, double a) => a * math.exp(-math.pow((ph - mu) / sd, 2) / 2);
    return g(0.06, 0.018, 0.18) + g(0.135, 0.006, -0.12) + g(0.15, 0.007, 1.0) + g(0.165, 0.007, -0.25) + g(0.42, 0.035, 0.32);
  }

  Widget _cycle() {
    final hr = n('hr'), sv = n('sv');
    final period = 60 / hr;
    final t = n('t') % period;
    final ph = t / period;
    final phase = ph < 0.125 ? 0 : (ph < 0.5 ? 1 : 2);
    final names = ['Atrial systole', 'Ventricular systole', 'Joint diastole'];
    final atria = phase == 0 ? math.sin(ph / 0.125 * math.pi) : 0.0;
    final vent = phase == 1 ? math.sin((ph - 0.125) / 0.375 * math.pi) : 0.0;
    return frame(
      title: 'The cardiac cycle and the ECG',
      subtitle: _sub,
      formula: 'cycle = 60 ÷ heart rate',
      readouts: [
        Readout('Phase', names[phase], '', IX.accent),
        Readout('Cycle length', f2(period), 's'),
        Readout('Cardiac output', f2(hr * sv / 1000), 'L/min', IX.green),
        Readout('Sound', phase == 1 && ph < 0.17 ? '"Lub" (AV close)' : (phase == 2 && ph < 0.56 ? '"Dub" (SL close)' : '—'), ''),
      ],
      controls: [
        slider('t', 'Time in the cycle', 0, period, unit: 's', dp: 2, div: 80),
        slider('hr', 'Heart rate', 40, 180, unit: 'beats/min'),
        slider('sv', 'Stroke volume', 40, 120, unit: 'mL'),
      ],
      painter: BioPainter((c, size) {
        final s0 = math.min(size.height * 0.24, size.width * 0.15);
        final hc = Offset(size.width * 0.2, size.height * 0.36);
        drawHeart(c, hc, s0, atria: atria, vent: vent, avOpen: phase != 1, slOpen: phase == 1 && ph > 0.16, flash: phase == 0 ? atria : 0);
        IxPaint.label(c, names[phase], hc + Offset(0, s0 * 1.18), size: 22, color: IX.accent, w: FontWeight.w700);
        final what = [
          'Atria contract and push the last ~30% of blood into the ventricles. AV valves open, semilunar valves shut.',
          'Ventricles contract. AV valves close (first sound, lub); pressure rises until the semilunar valves open and blood is ejected into the pulmonary artery and aorta.',
          'All chambers relax. Semilunar valves close (second sound, dub); AV valves open and blood flows into the ventricles.',
        ];
        Bio.note(c, what[phase], Offset(size.width * 0.40, 50), maxWidth: size.width * 0.56, size: 19, color: IX.ink);
        // Phase timeline.
        final tl = Rect.fromLTRB(size.width * 0.40, 190, size.width - 50, 230);
        final segs = [(0.0, 0.125, 'Atrial systole', BioC.deoxy), (0.125, 0.5, 'Ventricular systole', BioC.oxy), (0.5, 1.0, 'Joint diastole', IX.muted)];
        for (final (a, b, nm, col) in segs) {
          final r = Rect.fromLTRB(tl.left + tl.width * a + 2, tl.top, tl.left + tl.width * b - 2, tl.bottom);
          c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(8)), Paint()..color = col.withValues(alpha: 0.85));
          IxPaint.label(c, r.width > 200 ? '$nm ${f2((b - a) * period)} s' : '${f2((b - a) * period)} s', r.center, size: 15, color: Colors.white, w: FontWeight.w700);
        }
        final mx = tl.left + tl.width * ph;
        c.drawLine(Offset(mx, tl.top - 10), Offset(mx, tl.bottom + 10), Paint()..color = IX.ink..strokeWidth = 3);
        // ECG over two cycles.
        final plot = Plot(Rect.fromLTRB(size.width * 0.40, size.height * 0.40, size.width - 50, size.height * 0.88), 0, 2 * period, -0.4, 1.15);
        plot.frame(c, xs: [0, period / 2, period, 1.5 * period, 2 * period], ys: [], xLabel: 'Time (s)', fx: (x) => f2(x), title: 'Electrocardiogram (lead II)');
        plot.curve(c, (x) => ecg((x % period) / period), const Color(0xFF15803D), w: 3.5);
        for (final k in [0, 1]) {
          final b = k * period;
          IxPaint.label(c, 'P', plot.pt(b + 0.06 * period, 0.32), size: 18, color: IX.ink, w: FontWeight.w700);
          IxPaint.label(c, 'QRS', plot.pt(b + 0.15 * period, 1.1), size: 18, color: IX.ink, w: FontWeight.w700);
          IxPaint.label(c, 'T', plot.pt(b + 0.42 * period, 0.48), size: 18, color: IX.ink, w: FontWeight.w700);
        }
        plot.vline(c, t, IX.accent, w: 3);
        Bio.note(c, 'P: atria depolarise → atrial systole.  QRS: ventricles depolarise → ventricular systole.  T: ventricles repolarise → end of systole.  Count QRS complexes to get the heart rate.', Offset(size.width * 0.04, size.height - 20), align: Alignment.bottomLeft, maxWidth: size.width * 0.34, size: 17, color: IX.inkSoft);
      }),
    );
  }

  // ------------------------------------------------------------------ cardiac output

  Widget _output() {
    final hr = n('hr'), sv = n('sv');
    final co = hr * sv / 1000;
    return frame(
      title: 'Cardiac output',
      subtitle: _sub,
      formula: 'cardiac output = heart rate × stroke volume',
      readouts: [
        Readout('Heart rate', f0(hr), 'beats/min', IX.accent),
        Readout('Stroke volume', f0(sv), 'mL'),
        Readout('Cardiac output', f2(co), 'L/min', IX.green),
        Readout('Resting normal', '≈ 5', 'L/min', IX.inkSoft),
      ],
      controls: [
        slider('hr', 'Heart rate', 40, 200, unit: 'beats/min'),
        slider('sv', 'Stroke volume', 40, 140, unit: 'mL'),
      ],
      painter: BioPainter((c, size) {
        final plot = Plot(Rect.fromLTRB(120, 90, size.width * 0.66, size.height - 110), 40, 200, 0, 30);
        plot.frame(c, xs: [40, 80, 120, 160, 200], ys: [0, 5, 10, 15, 20, 25, 30], xLabel: 'Heart rate (beats/min)', yLabel: 'Cardiac output (L/min)', title: 'Output rises with rate and with stroke volume');
        for (final s2 in [50.0, 100.0, 140.0]) {
          plot.curve(c, (x) => x * s2 / 1000, IX.muted, w: 2, dashed: true, label: '${f0(s2)} mL', labelX: 190);
        }
        plot.curve(c, (x) => x * sv / 1000, IX.accent, label: 'SV ${f0(sv)} mL', labelX: 150);
        plot.dot(c, hr, co, IX.accent, label: '${f2(co)} L/min');
        final hc = Offset(size.width * 0.84, size.height * 0.40);
        drawHeart(c, hc, math.min(size.width * 0.11, size.height * 0.2), vent: 0.5, avOpen: false, slOpen: true, conduction: false);
        Bio.note(c, 'At rest: 72 beats/min × 70 mL ≈ 5 L/min. Sympathetic nerves and adrenaline raise both the rate and the strength of contraction; an athlete\'s cardiac output can rise several-fold.', Offset(size.width * 0.70, size.height * 0.66), maxWidth: size.width * 0.28, size: 17, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ regulation

  Widget _regulation() {
    final sy = n('symp'), pa = n('para');
    final hr = (72 * (1 + sy / 100 * 1.2) * (1 - pa / 100 * 0.5)).clamp(30, 200).toDouble();
    final sv = 70 * (1 + sy / 100 * 0.4);
    return frame(
      title: 'Nerves and hormones set the heart rate',
      subtitle: _sub,
      formula: 'neural centre: medulla oblongata',
      readouts: [
        Readout('Heart rate', f0(hr), 'beats/min', IX.accent),
        Readout('Stroke volume', f0(sv), 'mL'),
        Readout('Cardiac output', f2(hr * sv / 1000), 'L/min', IX.green),
        Readout('Beat starts at', 'SA node', '', IX.amber),
      ],
      controls: [
        slider('symp', 'Sympathetic signals (and adrenaline)', 0, 100, unit: '%'),
        slider('para', 'Parasympathetic (vagus) signals', 0, 100, unit: '%'),
      ],
      painter: BioPainter((c, size) {
        final hc = Offset(size.width * 0.62, size.height * 0.40);
        final s0 = math.min(size.height * 0.26, size.width * 0.17);
        drawHeart(c, hc, s0, conduction: true);
        final med = Offset(size.width * 0.14, size.height * 0.18);
        Bio.soft(c, Bio.blob(med, 110, 70, seed: 3, wobble: 0.08), const Color(0xFFE9C7CF), stroke: 2);
        Bio.soft(c, Bio.blob(med + const Offset(40, 70), 26, 46, seed: 4), const Color(0xFFDDAFB9), stroke: 2);
        IxPaint.label(c, 'Medulla oblongata', med + const Offset(0, -94), size: 18, color: IX.ink, w: FontWeight.w700);
        final sa = hc + Offset(-0.36 * s0, -0.28 * s0);
        final symCol = Color.lerp(IX.muted, IX.positive, sy / 100)!, parCol = Color.lerp(IX.muted, IX.accent, pa / 100)!;
        Bio.curvedArrow(c, med + const Offset(70, 100), sa + const Offset(-14, -12), symCol, bend: -60, width: 2 + sy / 20);
        Bio.curvedArrow(c, med + const Offset(30, 120), sa + const Offset(-14, 8), parCol, bend: 80, width: 2 + pa / 20);
        IxPaint.label(c, 'Sympathetic: faster, stronger', Offset(size.width * 0.32, size.height * 0.10), size: 18, color: symCol, w: FontWeight.w700, halo: true);
        IxPaint.label(c, 'Vagus (parasympathetic): slower', Offset(size.width * 0.22, size.height * 0.52), size: 18, color: parCol, w: FontWeight.w700, halo: true);
        final adr = Offset(size.width * 0.13, size.height * 0.40);
        Bio.tag(c, 'Adrenal medulla hormones', adr, sy > 30 ? IX.positive : IX.muted, size: 16);
        final period = 60 / hr;
        final plot = Plot(Rect.fromLTRB(80, size.height * 0.66, size.width - 50, size.height - 60), 0, 4, -0.4, 1.15);
        plot.frame(c, xs: [0, 1, 2, 3, 4], ys: [], xLabel: 'Time (s)', title: 'ECG at ${f0(hr)} beats/min');
        plot.curve(c, (x) => ecg((x % period) / period), const Color(0xFF15803D), w: 3);
      }),
    );
  }

  // ------------------------------------------------------------------ blood pressure

  Widget _bp() {
    final sy = n('sys'), di = math.min(n('dia'), n('sys') - 10);
    final cat = sy >= 140 || di >= 90 ? 'Hypertension' : (sy <= 90 || di <= 60 ? 'Low' : (sy <= 120 && di <= 80 ? 'Normal' : 'Above normal'));
    return frame(
      title: 'Blood pressure',
      subtitle: _sub,
      formula: 'written systolic / diastolic (mm Hg)',
      readouts: [
        Readout('Reading', '${f0(sy)}/${f0(di)}', 'mm Hg', IX.accent),
        Readout('Pulse pressure', f0(sy - di), 'mm Hg'),
        Readout('Category', cat, '', cat == 'Hypertension' ? IX.positive : IX.green),
        Readout('Normal', '120/80', 'mm Hg', IX.inkSoft),
      ],
      controls: [
        slider('sys', 'Systolic pressure', 80, 200, unit: 'mm Hg'),
        slider('dia', 'Diastolic pressure', 40, 130, unit: 'mm Hg'),
      ],
      painter: BioPainter((c, size) {
        final plot = Plot(Rect.fromLTRB(80, size.height * 0.30, size.width - 80, size.height * 0.30 + 40), 40, 200, 0, 1);
        final ax = Paint()..color = IX.inkSoft..strokeWidth = 4..strokeCap = StrokeCap.round;
        final band = Rect.fromLTRB(plot.pt(140, 0).dx, plot.r.top - 20, plot.pt(200, 0).dx, plot.r.top + 20);
        c.drawRRect(RRect.fromRectAndRadius(band, const Radius.circular(10)), Paint()..color = IX.positive.withValues(alpha: 0.12));
        IxPaint.label(c, 'hypertension range (≥ 140/90)', band.topCenter + const Offset(0, -18), size: 16, color: IX.positive, w: FontWeight.w600);
        c.drawLine(plot.pt(40, 0), plot.pt(200, 0), ax);
        for (var x = 40; x <= 200; x += 20) {
          final p = plot.pt(x.toDouble(), 0);
          c.drawLine(p - const Offset(0, 10), p + const Offset(0, 10), ax..strokeWidth = 2);
          IxPaint.label(c, '$x', p + const Offset(0, 28), size: 17, color: IX.inkSoft);
        }
        for (final (v, nm, col) in [(80.0, 'normal diastolic', IX.green), (120.0, 'normal systolic', IX.green)]) {
          final p = plot.pt(v, 0);
          IxPaint.label(c, nm, p + const Offset(0, -40), size: 15, color: col, w: FontWeight.w600);
          c.drawCircle(p, 6, Paint()..color = col);
        }
        c.drawLine(plot.pt(di, 0), plot.pt(sy, 0), Paint()..color = IX.accent..strokeWidth = 10..strokeCap = StrokeCap.round);
        plot.dot(c, di, 0, IX.accent);
        plot.dot(c, sy, 0, BioC.oxy);
        IxPaint.label(c, 'diastolic ${f0(di)}', plot.pt(di, 0) + const Offset(0, 64), size: 18, color: IX.accent, w: FontWeight.w700);
        IxPaint.label(c, 'systolic ${f0(sy)}', plot.pt(sy, 0) + const Offset(0, 64), size: 18, color: BioC.oxy, w: FontWeight.w700);
        // Pressure wave in an artery.
        final p2 = Plot(Rect.fromLTRB(120, size.height * 0.58, size.width - 80, size.height - 70), 0, 3, 40, 200);
        p2.frame(c, xs: [0, 1, 2, 3], ys: [40, 80, 120, 160, 200], xLabel: 'Time (s)', yLabel: 'Pressure (mm Hg)', title: 'Pressure in the brachial artery');
        double wave(double x) {
          final ph = (x * 72 / 60) % 1;
          final rise = ph < 0.15 ? math.sin(ph / 0.15 * math.pi / 2) : math.exp(-(ph - 0.15) * 2.6) + (ph > 0.3 && ph < 0.4 ? 0.06 * math.sin((ph - 0.3) / 0.1 * math.pi) : 0);
          final lo = math.exp(-0.85 * 2.6);
          return di + (sy - di) * ((rise - lo) / (1 - lo)).clamp(0, 1.1);
        }
        p2.curve(c, wave, BioC.oxy, w: 3.5);
        p2.hline(c, sy, BioC.oxy, label: 'systolic');
        p2.hline(c, di, IX.accent, label: 'diastolic');
      }),
    );
  }

  // ------------------------------------------------------------------ blood groups

  static const _groups = ['A', 'B', 'AB', 'O'];
  static Set<String> _antigens(String g) => switch (g) { 'A' => {'A'}, 'B' => {'B'}, 'AB' => {'A', 'B'}, _ => <String>{} };
  static Set<String> _antibodies(String g) => switch (g) { 'A' => {'anti-B'}, 'B' => {'anti-A'}, 'AB' => <String>{}, _ => {'anti-A', 'anti-B'} };

  Widget _blood() {
    final d = str('donor', 'O'), r = str('recipient', 'A');
    final clash = _antigens(d).any((a) => _antibodies(r).contains('anti-$a'));
    return frame(
      title: 'Safe and unsafe transfusions',
      subtitle: _sub,
      formula: 'donor antigens vs recipient antibodies',
      readouts: [
        Readout('Donor', 'Group $d', '', IX.accent),
        Readout('Recipient', 'Group $r', ''),
        Readout('Result', clash ? 'Clumping' : 'Safe', '', clash ? IX.positive : IX.green),
        Readout('Donor antigens', _antigens(d).isEmpty ? 'None' : _antigens(d).join(', '), ''),
      ],
      controls: [
        choice('donor', 'Donor', {for (final g in _groups) g: g}),
        choice('recipient', 'Recipient', {for (final g in _groups) g: g}),
      ],
      painter: BioPainter((c, size) {
        // Drop under the microscope.
        final dc = Offset(size.width * 0.27, size.height * 0.42);
        final R = math.min(size.width * 0.2, size.height * 0.32);
        c.drawCircle(dc, R, Paint()..color = const Color(0xFFFBEFEF));
        c.drawCircle(dc, R, Paint()..color = const Color(0xFF2B2F45)..style = PaintingStyle.stroke..strokeWidth = 8);
        final rnd = math.Random(clash ? 2 : 5);
        c.save();
        c.clipPath(Path()..addOval(Rect.fromCircle(center: dc, radius: R - 4)));
        final centres = clash ? [for (var k = 0; k < 6; k++) dc + Offset(math.cos(k * 1.05) * R * 0.5, math.sin(k * 1.05) * R * 0.5)] : <Offset>[];
        for (var k = 0; k < 70; k++) {
          final p = clash ? centres[k % 6] + Offset(rnd.nextDouble() * 50 - 25, rnd.nextDouble() * 50 - 25) : dc + Offset((rnd.nextDouble() * 2 - 1) * R, (rnd.nextDouble() * 2 - 1) * R);
          c.drawOval(Rect.fromCenter(center: p, width: 28, height: 24), Paint()..color = BioC.oxy);
          c.drawOval(Rect.fromCenter(center: p, width: 12, height: 9), Paint()..color = Bio.lighten(BioC.oxy, 0.35));
        }
        c.restore();
        IxPaint.label(c, clash ? 'Agglutination: donor cells clump' : 'Cells stay apart: compatible', dc + Offset(0, R + 34), size: 21, color: clash ? IX.positive : IX.green, w: FontWeight.w700);
        // Table.
        final t = Rect.fromLTWH(size.width * 0.55, 60, size.width * 0.42, 70.0 * 5);
        final cols = ['Group', 'Antigens on RBC', 'Antibodies in plasma', 'Can donate to'];
        final can = {'A': 'A, AB', 'B': 'B, AB', 'AB': 'AB', 'O': 'A, B, AB, O'};
        final cw = [0.16, 0.26, 0.30, 0.28];
        var x = t.left;
        for (var k = 0; k < 4; k++) {
          Bio.note(c, cols[k], Offset(x + 8, t.top), size: 16, color: IX.inkSoft, maxWidth: t.width * cw[k] - 12, w: FontWeight.w700);
          x += t.width * cw[k];
        }
        for (var row = 0; row < 4; row++) {
          final g = _groups[row];
          final y = t.top + 60 + row * 66.0;
          final hl = g == d || g == r;
          if (hl) c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(t.left, y - 8, t.width, 56), const Radius.circular(10)), Paint()..color = (g == d ? IX.accent : IX.amber).withValues(alpha: 0.10));
          final cells = [g, _antigens(g).isEmpty ? 'None' : _antigens(g).join(', '), _antibodies(g).isEmpty ? 'None' : _antibodies(g).join(', '), can[g]!];
          var xx = t.left;
          for (var k = 0; k < 4; k++) {
            IxPaint.label(c, cells[k], Offset(xx + 8, y + 20), size: k == 0 ? 22 : 18, color: IX.ink, w: k == 0 ? FontWeight.w700 : FontWeight.w500, align: Alignment.centerLeft);
            xx += t.width * cw[k];
          }
        }
        Bio.note(c, 'Group O is the universal donor; AB is the universal recipient. Rh: an Rh⁻ mother carrying an Rh⁺ fetus can make anti-Rh antibodies that harm a later Rh⁺ fetus (erythroblastosis fetalis).', Offset(size.width * 0.55, t.bottom + 30), maxWidth: size.width * 0.42, size: 18, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ WBC

  Widget _wbc() {
    final tot = n('total'), ne = n('neut');
    // Others share the remainder in NCERT proportions: lymphocytes 20–25, monocytes 6–8, eosinophils 2–3, basophils 0.5–1.
    final rest = 100 - ne;
    const base = [22.5, 7.0, 2.5, 0.75];
    final k = rest / base.reduce((a, b) => a + b);
    final pcts = [ne, ...base.map((b) => b * k)];
    final names = ['Neutrophils', 'Lymphocytes', 'Monocytes', 'Eosinophils', 'Basophils'];
    final cols = [const Color(0xFFB0475A), const Color(0xFF3F6FB5), const Color(0xFF8C6BB1), const Color(0xFFD9824B), const Color(0xFF4B4F8A)];
    return frame(
      title: 'A differential leucocyte count',
      subtitle: _sub,
      formula: 'normal total 6000–8000 per mm³',
      readouts: [
        Readout('Total WBC', grp(tot), 'per mm³', tot > 11000 ? IX.positive : IX.accent),
        Readout('Neutrophils', grp(tot * ne / 100), 'per mm³', cols[0]),
        Readout('Lymphocytes', grp(tot * pcts[1] / 100), 'per mm³', cols[1]),
        Readout('Picture', tot > 11000 && ne > 70 ? 'Bacterial infection' : 'Normal range', ''),
      ],
      controls: [
        slider('total', 'Total WBC count', 3000, 20000, unit: '/mm³', div: 170),
        slider('neut', 'Neutrophils', 40, 85, unit: '%'),
      ],
      painter: BioPainter((c, size) {
        final ctr = Offset(size.width * 0.22, size.height * 0.45);
        final R = math.min(size.width * 0.17, size.height * 0.3);
        var a = -math.pi / 2;
        for (var i2 = 0; i2 < 5; i2++) {
          final sw = 2 * math.pi * pcts[i2] / 100;
          Bio.soft(c, Path()..moveTo(ctr.dx, ctr.dy)..arcTo(Rect.fromCircle(center: ctr, radius: R), a, sw, false)..close(), cols[i2], stroke: 2.5, edge: Colors.white, shadow: false, light: 0.25);
          if (pcts[i2] > 5) IxPaint.label(c, '${f0(pcts[i2])}%', ctr + Offset(math.cos(a + sw / 2), math.sin(a + sw / 2)) * R * 0.65, size: 19, color: Colors.white, w: FontWeight.w700);
          a += sw;
        }
        // Each cell type drawn.
        final x0 = size.width * 0.46, w = (size.width - x0 - 30) / 5;
        for (var i2 = 0; i2 < 5; i2++) {
          final cc = Offset(x0 + w * (i2 + 0.5), size.height * 0.36);
          final r = math.min(w * 0.4, 64.0) * (i2 == 2 ? 1.15 : (i2 == 1 ? 0.8 : 1.0));
          Bio.soft(c, Bio.blob(cc, r, r * 0.95, seed: i2 + 3, wobble: 0.04), const Color(0xFFF3E6EE), stroke: 2, edge: const Color(0xFFB59AB0));
          final nuc = Paint()..color = cols[i2];
          switch (i2) {
            case 0:
              for (final o in [const Offset(-0.35, -0.1), const Offset(0, 0.2), const Offset(0.35, -0.05)]) {
                c.drawCircle(cc + o * r, r * 0.22, nuc);
              }
              c.drawLine(cc + const Offset(-0.35, -0.1) * r, cc + const Offset(0.35, -0.05) * r, nuc..strokeWidth = r * 0.12);
            case 1:
              c.drawCircle(cc, r * 0.75, nuc);
            case 2:
              Bio.fill(c, Path()..addArc(Rect.fromCircle(center: cc + Offset(0, r * 0.1), radius: r * 0.5), math.pi * 0.1, math.pi * 1.4)..close(), cols[i2]);
              c.drawPath(Bio.smooth([cc + Offset(-r * 0.5, 0), cc + Offset(-r * 0.1, -r * 0.45), cc + Offset(r * 0.5, -r * 0.1), cc + Offset(r * 0.2, r * 0.3), cc + Offset(-r * 0.2, r * 0.25)]), nuc);
            case 3:
              c.drawCircle(cc + Offset(-r * 0.3, 0), r * 0.3, nuc);
              c.drawCircle(cc + Offset(r * 0.3, 0), r * 0.3, nuc);
              final rnd = math.Random(2);
              for (var j = 0; j < 14; j++) {
                c.drawCircle(cc + Offset(rnd.nextDouble() - 0.5, rnd.nextDouble() - 0.5) * r * 1.4, 3.5, Paint()..color = const Color(0xFFE07A5F));
              }
            default:
              Bio.fill(c, Bio.blob(cc, r * 0.45, r * 0.35, seed: 9, wobble: 0.2), cols[i2]);
              final rnd = math.Random(4);
              for (var j = 0; j < 16; j++) {
                c.drawCircle(cc + Offset(rnd.nextDouble() - 0.5, rnd.nextDouble() - 0.5) * r * 1.4, 4, Paint()..color = const Color(0xFF2C2F66));
              }
          }
          IxPaint.label(c, names[i2], cc + Offset(0, r + 26), size: 17, color: cols[i2], w: FontWeight.w700);
          IxPaint.label(c, '${f1(pcts[i2])}%', cc + Offset(0, r + 50), size: 17, color: IX.inkSoft);
        }
        Bio.note(c, 'Neutrophils (60–65%) are phagocytes, the first to rise in a bacterial infection. Lymphocytes (20–25%), B and T cells, make the immune response. Monocytes (6–8%) become macrophages. Eosinophils (2–3%) rise in allergy. Basophils (0.5–1%) release histamine, serotonin and heparin.', Offset(x0, size.height * 0.62), maxWidth: size.width - x0 - 30, size: 18, color: IX.ink);
      }),
    );
  }
}
