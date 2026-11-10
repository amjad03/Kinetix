import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bio_kit.dart';

/// Neural control and coordination (1st PUC Biology ch. 18): the neuron (tap a part), the
/// action potential, ion gradients and the Nernst potential, the chemical synapse step by
/// step, and the parts of the human brain.
///
/// Preset: {"mode": "neuron"|"ap"|"nernst"|"synapse"|"brain", "focus": id, "myelin": true,
/// "stim": 20, "t": 2.0 (ms), "kIn": 140, "kOut": 5, "naIn": 15, "naOut": 145, "step": 0}.
class NeuronInstrument extends StatefulWidget {
  const NeuronInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<NeuronInstrument> createState() => _NeuronState();
}

const _synSteps = ['Impulse arrives', 'Vesicles fuse', 'Transmitter binds', 'New potential'];

class _NeuronState extends BioState<NeuronInstrument> {
  @override
  String get instrumentId => 'bio-neuron';
  @override
  Map<String, dynamic> get lessonPreset => widget.preset;
  @override
  List<String> get modes => const ['neuron', 'ap', 'nernst', 'synapse', 'brain'];
  @override
  Map<String, Map<String, dynamic>> get presets => const {
    'Myelinated neuron': {'mode': 'neuron'},
    'Non-myelinated': {'mode': 'neuron', 'myelin': false},
    'Action potential': {'mode': 'ap'},
    'Below threshold': {'mode': 'ap', 'stim': 8},
    'Ion gradients': {'mode': 'nernst'},
    'Synapse': {'mode': 'synapse'},
    'The brain': {'mode': 'brain'},
  };
  @override
  Map<String, Object> defaults(String mode) => {'myelin': true, 'stim': 20, 't': 1.2, 'kIn': 140, 'kOut': 5, 'naIn': 15, 'naOut': 145, 'step': 0};

  static const _sub = '1st PUC Biology · Neural control and coordination';
  List<BioPart> _parts = const [];
  Map<String, Offset> _labels = const {};

  @override
  Widget build(BuildContext context) => switch (mode) {
    'ap' => _ap(),
    'nernst' => _nernst(),
    'synapse' => _synapse(),
    'brain' => _brain(),
    _ => _neuron(),
  };

  Widget _tapFrame({required String title, required String formula, required List<Readout> readouts, List<Widget> controls = const [], required List<BioPart> Function(Canvas, Rect) draw, double mid = 0.5}) {
    return frame(
      title: title,
      subtitle: _sub,
      formula: formula,
      readouts: readouts,
      controls: [...controls, Padding(padding: const EdgeInsets.only(top: 4), child: Text('Tap a part to read what it does.', style: IX.text(17, c: IX.inkSoft)))],
      onTap: (at, size) {
        final id = hitPart(_parts, _labels, at);
        setState(() => id == null || id == s['focus'] ? s.remove('focus') : s['focus'] = id);
      },
      painter: BioPainter((c, size) {
        final infoH = 110.0;
        final area = Rect.fromLTWH(0, 0, size.width, size.height - infoH - 30);
        final parts = draw(c, area);
        _parts = parts;
        _labels = layoutLabels(parts, midX: area.width * mid, leftX: area.left + area.width * 0.17, rightX: area.right - area.width * 0.17, top: 40, bottom: area.bottom - 20, gap: 46);
        drawLabels(c, parts, _labels, s['focus']);
        infoCard(c, Rect.fromLTWH(24, size.height - infoH - 16, size.width - 48, infoH), parts.where((q) => q.id == s['focus']).firstOrNull);
      }),
    );
  }

  // ------------------------------------------------------------------ neuron

  Widget _neuron() {
    final my = b('myelin');
    return _tapFrame(
      title: my ? 'A myelinated neuron' : 'A non-myelinated neuron',
      formula: 'dendrites → cyton → axon → synaptic knobs',
      readouts: [
        Readout('Type', my ? 'Myelinated' : 'Non-myelinated', '', IX.accent),
        Readout('Conduction', my ? 'Saltatory, fast' : 'Continuous, slower', ''),
        Readout('Found in', my ? 'Spinal and cranial nerves' : 'Autonomic system', ''),
        Readout('Resting potential', '≈ −70', 'mV', IX.inkSoft),
      ],
      mid: 0.36,
      controls: [toggle('myelin', 'Axon', on: 'Myelinated', off: 'Non-myelinated')],
      draw: (c, a) {
        final y = a.center.dy;
        final cx = a.left + a.width * 0.30;
        const body = Color(0xFFE6B8C8);
        // Dendrites.
        final rnd = math.Random(4);
        void dend(Offset from, double ang, double len, int d) {
          final to = from + Offset(math.cos(ang), math.sin(ang)) * len;
          c.drawLine(from, to, Paint()..color = Bio.darken(body, 0.15)..strokeWidth = 2.0 + d * 2.2..strokeCap = StrokeCap.round);
          if (d > 0) {
            dend(to, ang - 0.4 - rnd.nextDouble() * 0.2, len * 0.7, d - 1);
            dend(to, ang + 0.4 + rnd.nextDouble() * 0.2, len * 0.7, d - 1);
          }
        }
        for (var k = 0; k < 6; k++) {
          dend(Offset(cx, y), math.pi * (0.55 + k * 0.18), 80, 3);
        }
        // Cell body with Nissl granules and nucleus.
        Bio.soft(c, Bio.blob(Offset(cx, y), 70, 62, seed: 3, wobble: 0.08), body, stroke: 2.5);
        for (var k = 0; k < 16; k++) {
          final ang = rnd.nextDouble() * 2 * math.pi, d = 30 + rnd.nextDouble() * 22;
          c.drawCircle(Offset(cx, y) + Offset(math.cos(ang), math.sin(ang)) * d, 3.5, Paint()..color = const Color(0xFF6B3A7A));
        }
        Bio.soft(c, Path()..addOval(Rect.fromCircle(center: Offset(cx, y), radius: 24)), BioC.nucleus, stroke: 1.5, shadow: false);
        c.drawCircle(Offset(cx + 6, y - 4), 7, Paint()..color = BioC.nucleolus);
        // Axon hillock and axon.
        final ax0 = cx + 66, ax1 = a.right - a.width * 0.24;
        c.drawPath(Path()..moveTo(ax0 - 8, y - 22)..quadraticBezierTo(ax0 + 20, y - 8, ax0 + 40, y - 6)..lineTo(ax0 + 40, y + 6)..quadraticBezierTo(ax0 + 20, y + 8, ax0 - 8, y + 22)..close(), Paint()..color = body);
        c.drawLine(Offset(ax0 + 30, y), Offset(ax1, y), Paint()..color = Bio.darken(body, 0.1)..strokeWidth = 10);
        if (my) {
          for (var x = ax0 + 50; x < ax1 - 40; x += 92) {
            final seg = RRect.fromRectAndRadius(Rect.fromLTWH(x, y - 22, 80, 44), const Radius.circular(22));
            Bio.soft(c, Path()..addRRect(seg), BioC.myelin, stroke: 2, edge: const Color(0xFFC9AE6A));
            c.drawOval(Rect.fromCenter(center: Offset(x + 40, y + 12), width: 22, height: 12), Paint()..color = const Color(0xFFB59AC8));
          }
        }
        // Axon terminals with synaptic knobs.
        for (var k = -2; k <= 2; k++) {
          final end = Offset(ax1 + 90, y + k * 46.0);
          c.drawPath(Path()..moveTo(ax1, y)..quadraticBezierTo(ax1 + 40, y + k * 10.0, end.dx, end.dy), Paint()..color = Bio.darken(body, 0.1)..strokeWidth = 5..style = PaintingStyle.stroke);
          Bio.soft(c, Path()..addOval(Rect.fromCircle(center: end, radius: 12)), body, stroke: 1.5);
        }
        return [
          BioPart('dend', 'Dendrites', Offset(cx - 150, y - 40), 'Short, branched fibres that carry impulses towards the cell body. They contain Nissl\'s granules.'),
          BioPart('cyton', 'Cell body (cyton)', Offset(cx - 40, y + 30), 'Contains cytoplasm with organelles and Nissl\'s granules (ribosome clusters) around the nucleus.'),
          BioPart('nucleus', 'Nucleus', Offset(cx, y), 'Controls the neuron; neurons do not divide once mature.'),
          BioPart('hillock', 'Axon hillock', Offset(ax0 + 6, y), 'Where the axon leaves the cell body: the action potential starts here.'),
          BioPart('axon', 'Axon', Offset(ax0 + (my ? 96 : 200), y + (my ? 0 : 0)), 'A long fibre that carries impulses away from the cell body to a synapse or a neuromuscular junction.'),
          if (my) BioPart('myelin', 'Myelin sheath (Schwann cells)', Offset(ax0 + 230, y - 20), 'Schwann cells wrap the axon in a fatty myelin sheath that insulates it.'),
          if (my) BioPart('node', 'Node of Ranvier', Offset(ax0 + 50 + 92 * 2 - 6, y), 'Gaps between adjacent myelin sheaths; the impulse jumps from node to node (saltatory conduction).'),
          BioPart('knob', 'Synaptic knobs', Offset(ax1 + 90, y - 92), 'Bulb-like ends of the axon terminals holding synaptic vesicles filled with neurotransmitter.'),
        ];
      },
    );
  }

  // ------------------------------------------------------------------ action potential

  static double vm(double t, bool fires, double stim) {
    if (t < 1) return -70;
    if (!fires) return -70 + stim * 0.7 * math.exp(-(t - 1) * 1.6) * (1 - math.exp(-(t - 1) * 8));
    final x = t - 1;
    if (x < 0.3) return -70 + 15 * x / 0.3;
    if (x < 0.8) return -55 + 95 * ((x - 0.3) / 0.5);
    if (x < 1.8) return 40 - 120 * ((x - 0.8) / 1.0);
    if (x < 3.5) return -80 + 10 * ((x - 1.8) / 1.7);
    return -70;
  }

  Widget _ap() {
    final st = n('stim'), t = n('t');
    final fires = st >= 15;
    final v = vm(t, fires, st);
    final x = t - 1;
    final phase = !fires || t < 1 ? 'Resting / polarised' : (x < 0.8 ? 'Depolarisation (Na⁺ in)' : (x < 1.8 ? 'Repolarisation (K⁺ out)' : (x < 3.5 ? 'Hyperpolarisation' : 'Resting / polarised')));
    return frame(
      title: 'An action potential',
      subtitle: _sub,
      formula: 'all or none: threshold ≈ −55 mV',
      readouts: [
        Readout('Membrane potential', f0(v), 'mV', IX.accent),
        Readout('Phase', phase.split(' (').first, '', IX.ink),
        Readout('Stimulus', fires ? 'Above threshold' : 'Below threshold', '', fires ? IX.green : IX.positive),
        Readout('Outside the membrane', v > 0 ? 'Negative' : 'Positive', ''),
      ],
      controls: [
        slider('stim', 'Stimulus strength', 0, 40, unit: 'mV'),
        slider('t', 'Time', 0, 6, unit: 'ms', dp: 1, div: 60),
      ],
      painter: BioPainter((c, size) {
        // Membrane patch above.
        final m = Rect.fromLTWH(40, 40, size.width - 80, size.height * 0.30);
        final y = m.center.dy;
        final depol = fires && x > 0.3 && x < 1.0;
        final repol = fires && x >= 0.8 && x < 1.9;
        c.drawRect(Rect.fromLTRB(m.left, m.top, m.right, y - 22), Paint()..color = const Color(0xFFEFF4FB));
        c.drawRect(Rect.fromLTRB(m.left, y + 22, m.right, m.bottom), Paint()..color = const Color(0xFFFBF1F4));
        Bio.bilayer(c, Offset(m.left, y), Offset(m.right, y), h: 44);
        IxPaint.label(c, 'Outside (tissue fluid)', Offset(m.left + 10, m.top + 14), size: 16, color: IX.inkSoft, w: FontWeight.w700, align: Alignment.centerLeft);
        IxPaint.label(c, 'Axoplasm', Offset(m.left + 10, m.bottom - 14), size: 16, color: IX.inkSoft, w: FontWeight.w700, align: Alignment.centerLeft);
        final outerSign = v > 0 ? '−' : '+', innerSign = v > 0 ? '+' : '−';
        for (var k = 0; k < 14; k++) {
          final xx = m.left + 240 + k * (m.width - 280) / 13;
          IxPaint.label(c, outerSign, Offset(xx, y - 40), size: 22, color: v > 0 ? IX.negative : IX.positive, w: FontWeight.w700);
          IxPaint.label(c, innerSign, Offset(xx, y + 40), size: 22, color: v > 0 ? IX.positive : IX.negative, w: FontWeight.w700);
        }
        final naX = m.left + m.width * 0.35, kX = m.left + m.width * 0.65;
        for (final (xx, col, name, open, down) in [(naX, IX.amber, 'Na⁺ channel', depol, true), (kX, IX.accent, 'K⁺ channel', repol, false)]) {
          final gap = open ? 12.0 : 2.0;
          Bio.soft(c, Bio.blob(Offset(xx - 14 - gap, y), 14, 30, seed: 2), col, stroke: 1.5);
          Bio.soft(c, Bio.blob(Offset(xx + 14 + gap, y), 14, 30, seed: 4), col, stroke: 1.5);
          IxPaint.label(c, '$name ${open ? '(open)' : '(closed)'}', Offset(xx, m.top + 14), size: 16, color: Bio.darken(col, 0.2), w: FontWeight.w700, halo: true);
          if (open) IxPaint.arrow(c, Offset(xx, down ? y - 60 : y + 60), Offset(xx, down ? y + 60 : y - 60), col, width: 4);
        }
        // Trace.
        final plot = Plot(Rect.fromLTRB(120, size.height * 0.44, size.width - 60, size.height - 80), 0, 6, -90, 50);
        plot.frame(c, xs: [0, 1, 2, 3, 4, 5, 6], ys: [-80, -55, -40, 0, 40], xLabel: 'Time (ms)', yLabel: 'Membrane potential (mV)', fy: (y2) => f0(y2));
        plot.hline(c, -55, IX.positive, label: 'threshold');
        plot.hline(c, -70, IX.muted, label: 'resting');
        plot.curve(c, (tt) => vm(tt, fires, st), IX.accent, w: 3);
        plot.curve(c, (tt) => vm(tt, fires, st), IX.accent, w: 5, to: t);
        plot.dot(c, t, v, IX.accent, label: phase, align: t > 4 ? Alignment.centerRight : Alignment.centerLeft);
      }),
    );
  }

  // ------------------------------------------------------------------ Nernst

  Widget _nernst() {
    final ki = n('kIn'), ko = n('kOut'), ni = n('naIn'), no = n('naOut');
    final ek = 61.5 * math.log(ko / ki) / math.ln10, ena = 61.5 * math.log(no / ni) / math.ln10;
    return frame(
      title: 'Ion gradients and voltage',
      subtitle: _sub,
      formula: 'E = 61.5 log(out ÷ in) mV at 37 °C',
      readouts: [
        Readout('E(K⁺)', f0(ek), 'mV', IX.accent),
        Readout('E(Na⁺)', '+${f0(ena)}', 'mV', IX.amber),
        Readout('K⁺ in : out', '${f0(ki / ko)} : 1', ''),
        Readout('Na⁺ out : in', '${f1(no / ni)} : 1', ''),
      ],
      controls: [
        slider('kIn', 'K⁺ inside axon', 100, 160, unit: 'mM'),
        slider('kOut', 'K⁺ outside', 2, 20, unit: 'mM', dp: 1, div: 36),
        slider('naOut', 'Na⁺ outside', 100, 160, unit: 'mM'),
        slider('naIn', 'Na⁺ inside', 5, 30, unit: 'mM'),
      ],
      painter: BioPainter((c, size) {
        final m = Rect.fromLTWH(40, 40, size.width * 0.38, size.height - 80);
        c.drawRRect(RRect.fromRectAndRadius(m, const Radius.circular(18)), Paint()..color = const Color(0xFFEFF4FB));
        final inner = Rect.fromCenter(center: m.center, width: m.width * 0.6, height: m.height * 0.6);
        Bio.soft(c, Path()..addRRect(RRect.fromRectAndRadius(inner, const Radius.circular(60))), const Color(0xFFFBF1F4), stroke: 6, edge: BioC.membrane);
        final rnd = math.Random(3);
        void ions(Rect area, int count, String s0, Color col, bool insideArea) {
          var placed = 0;
          for (var k = 0; k < 400 && placed < count; k++) {
            final p = Offset(area.left + rnd.nextDouble() * area.width, area.top + rnd.nextDouble() * area.height);
            if (insideArea != inner.deflate(14).contains(p)) continue;
            if (!insideArea && inner.inflate(14).contains(p)) continue;
            IxPaint.label(c, s0, p, size: 16, color: col, w: FontWeight.w700);
            placed++;
          }
        }
        ions(inner, (ki / 6).round(), 'K⁺', IX.accent, true);
        ions(inner, (ni / 6).round(), 'Na⁺', IX.amber, true);
        ions(m, (ko / 1.5).round(), 'K⁺', IX.accent, false);
        ions(m, (no / 6).round(), 'Na⁺', IX.amber, false);
        IxPaint.label(c, 'Axoplasm', inner.topCenter + const Offset(0, 20), size: 17, color: IX.inkSoft, w: FontWeight.w700, halo: true);
        IxPaint.label(c, 'Na⁺/K⁺ pump: 3 Na⁺ out, 2 K⁺ in (ATP)', m.bottomCenter + const Offset(0, -22), size: 16, color: IX.ink, w: FontWeight.w600, halo: true);
        final plot = Plot(Rect.fromLTRB(size.width * 0.55, 90, size.width - 60, size.height - 120), 1, 30, -140, 0);
        plot.frame(c, xs: [1, 5, 10, 15, 20, 25, 30], ys: [-140, -120, -100, -80, -60, -40, -20, 0], xLabel: 'K⁺ outside (mM)', yLabel: 'E(K⁺) (mV)', title: 'Potassium equilibrium potential');
        plot.curve(c, (x) => 61.5 * math.log(x / ki) / math.ln10, IX.accent);
        plot.hline(c, -70, IX.muted, label: 'resting ≈ −70');
        plot.dot(c, ko, ek, IX.accent, label: '${f0(ek)} mV');
      }),
    );
  }

  // ------------------------------------------------------------------ synapse

  Widget _synapse() {
    final st = i('step').clamp(0, 3);
    final text = [
      'An action potential reaches the axon terminal. Voltage-gated Ca²⁺ channels open.',
      'Ca²⁺ makes the synaptic vesicles move to the membrane and fuse with it, releasing neurotransmitter (e.g. acetylcholine) into the synaptic cleft by exocytosis.',
      'The neurotransmitter diffuses across the cleft (about 20 nm wide) and binds specific receptors on the post-synaptic membrane, opening ion channels.',
      'Ions enter the post-synaptic neuron and a new potential is generated — excitatory or inhibitory. An enzyme removes the transmitter so the signal is brief.',
    ];
    return frame(
      title: 'A chemical synapse',
      subtitle: _sub,
      formula: 'electrical → chemical → electrical',
      readouts: [
        Readout('Step', _synSteps[st], '', IX.accent),
        Readout('Cleft width', '≈ 20', 'nm'),
        Readout('Transmitter', 'Acetylcholine', ''),
        Readout('Direction', 'One way only', '', IX.green),
      ],
      controls: [stepper('step', _synSteps, label: 'Step')],
      painter: BioPainter((c, size) {
        final ctr = Offset(size.width * 0.40, size.height * 0.46);
        final R = math.min(size.width * 0.18, size.height * 0.34);
        const pre = Color(0xFFE6B8C8);
        // Presynaptic knob.
        final knob = Path()..moveTo(ctr.dx - R * 0.3, ctr.dy - R * 1.2)..lineTo(ctr.dx + R * 0.3, ctr.dy - R * 1.2)..cubicTo(ctr.dx + R * 0.35, ctr.dy - R * 0.8, ctr.dx + R * 1.0, ctr.dy - R * 0.6, ctr.dx + R * 0.95, ctr.dy - 18)..lineTo(ctr.dx - R * 0.95, ctr.dy - 18)..cubicTo(ctr.dx - R * 1.0, ctr.dy - R * 0.6, ctr.dx - R * 0.35, ctr.dy - R * 0.8, ctr.dx - R * 0.3, ctr.dy - R * 1.2)..close();
        Bio.soft(c, knob, pre, stroke: 3, edge: BioC.membrane);
        // Postsynaptic membrane.
        final post = Rect.fromLTRB(ctr.dx - R * 1.3, ctr.dy + 18, ctr.dx + R * 1.3, ctr.dy + R * 0.9);
        Bio.soft(c, Path()..addRRect(RRect.fromRectAndCorners(post, topLeft: const Radius.circular(30), topRight: const Radius.circular(30))), const Color(0xFFD9C7E8), stroke: 3, edge: BioC.membrane);
        // Vesicles.
        final rnd = math.Random(5);
        final vs = <Offset>[for (var k = 0; k < 9; k++) ctr + Offset((rnd.nextDouble() - 0.5) * R * 1.2, -R * 0.75 + rnd.nextDouble() * R * 0.45)];
        for (final (k, v) in vs.indexed) {
          final fused = st >= 1 && k < 3;
          final at = fused ? Offset(ctr.dx - R * 0.4 + k * R * 0.4, ctr.dy - 26) : v;
          c.drawCircle(at, 18, Paint()..color = Colors.white);
          c.drawCircle(at, 18, Paint()..color = BioC.membrane..style = PaintingStyle.stroke..strokeWidth = 2.5);
          if (!(st >= 2 && fused)) {
            for (var j = 0; j < 5; j++) {
              c.drawCircle(at + Offset(math.cos(j * 1.3) * 8, math.sin(j * 1.3) * 8), 3.5, Paint()..color = IX.green);
            }
          }
        }
        // Transmitter in the cleft / on receptors.
        if (st >= 1) {
          for (var k = 0; k < 14; k++) {
            final yy = st >= 2 ? ctr.dy + 12 : ctr.dy - 6 + rnd.nextDouble() * 10;
            c.drawCircle(Offset(ctr.dx - R * 0.8 + k * R * 0.12, yy), 4, Paint()..color = IX.green);
          }
        }
        for (var k = 0; k < 6; k++) {
          final rx = ctr.dx - R * 0.75 + k * R * 0.3;
          c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(rx - 8, ctr.dy + 14, 16, 26), const Radius.circular(4)), Paint()..color = st >= 2 ? IX.accent : const Color(0xFF8E98B8));
        }
        if (st >= 3) {
          for (var k = 0; k < 5; k++) {
            IxPaint.arrow(c, Offset(ctr.dx - R * 0.6 + k * R * 0.3, ctr.dy + 20), Offset(ctr.dx - R * 0.6 + k * R * 0.3, ctr.dy + 90), IX.amber, width: 3);
          }
          IxPaint.label(c, 'Na⁺ in → new potential', Offset(ctr.dx, ctr.dy + R * 0.6), size: 18, color: IX.amber, w: FontWeight.w700, halo: true);
        }
        if (st == 0) {
          IxPaint.arrow(c, Offset(ctr.dx, ctr.dy - R * 1.4), Offset(ctr.dx, ctr.dy - R * 0.95), IX.positive, width: 5);
          IxPaint.label(c, 'impulse', Offset(ctr.dx + 14, ctr.dy - R * 1.3), size: 17, color: IX.positive, w: FontWeight.w700, align: Alignment.centerLeft);
          for (final sd in [-1.0, 1.0]) {
            Bio.tag(c, 'Ca²⁺', Offset(ctr.dx + sd * R * 0.9, ctr.dy - R * 0.5), IX.amber, size: 15);
          }
        }
        final parts = [
          BioPart('k', 'Axon terminal', Offset(ctr.dx - R * 0.5, ctr.dy - R * 0.9)),
          BioPart('v', 'Synaptic vesicle', vs[5]),
          BioPart('c', 'Synaptic cleft', Offset(ctr.dx + R * 0.95, ctr.dy)),
          BioPart('r', 'Receptors', Offset(ctr.dx + R * 0.75, ctr.dy + 26)),
          BioPart('p', 'Post-synaptic cell', Offset(ctr.dx - R * 1.1, ctr.dy + 40)),
        ];
        drawLabels(c, parts, layoutLabels(parts, midX: ctr.dx, leftX: ctr.dx - R * 1.4 - 20, rightX: ctr.dx + R * 1.4 + 20, top: 40, bottom: size.height - 40), null);
        final card = Rect.fromLTWH(size.width * 0.72, 50, size.width * 0.28 - 30, size.height - 100);
        Bio.card(c, card);
        Bio.heading(c, _synSteps[st], card.topLeft + const Offset(20, 18), color: IX.accent);
        Bio.note(c, text[st], card.topLeft + const Offset(20, 60), maxWidth: card.width - 40, size: 19, color: IX.ink, w: FontWeight.w400);
      }),
    );
  }

  // ------------------------------------------------------------------ brain

  Widget _brain() {
    return _tapFrame(
      title: 'The human brain (median section)',
      formula: 'forebrain · midbrain · hindbrain',
      readouts: const [
        Readout('Forebrain', 'Cerebrum, thalamus, hypothalamus', '', IX.accent),
        Readout('Hindbrain', 'Pons, cerebellum, medulla', '', IX.green),
      ],
      draw: (c, a) {
        final k = math.min(a.width / 1100, a.height / 640);
        final ctr = a.center + const Offset(0, -10);
        Offset p(double x, double y) => ctr + Offset(x, y) * k;
        // Cerebrum.
        final cer = Bio.smooth([p(-300, 40), p(-310, -100), p(-200, -230), p(0, -270), p(200, -230), p(300, -110), p(300, 30), p(220, 80), p(80, 60), p(-100, 70), p(-240, 90)]);
        Bio.soft(c, cer, const Color(0xFFEBC2C6), stroke: 2.5, edge: const Color(0xFFB0475A));
        final gyri = Paint()..color = const Color(0xFFC98A92)..strokeWidth = 2.5..style = PaintingStyle.stroke..strokeCap = StrokeCap.round;
        for (var j = 0; j < 12; j++) {
          final ang = math.pi + j * math.pi / 11;
          final o = p(0, -20) + Offset(math.cos(ang) * 230 * k, math.sin(ang) * 190 * k);
          c.drawPath(Path()..moveTo(o.dx, o.dy)..relativeQuadraticBezierTo(20 * k, 30 * k, 0, 60 * k), gyri);
        }
        // Corpus callosum.
        c.drawPath(Bio.smooth([p(-150, 0), p(-60, -50), p(60, -50), p(140, -10)], closed: false), Paint()..color = const Color(0xFFF7E7E2)..strokeWidth = 22 * k..style = PaintingStyle.stroke..strokeCap = StrokeCap.round);
        // Thalamus, hypothalamus, pituitary.
        Bio.soft(c, Bio.blob(p(10, 20), 50 * k, 32 * k, seed: 2), const Color(0xFFD9A3B0), stroke: 2);
        Bio.soft(c, Bio.blob(p(-40, 70), 36 * k, 22 * k, seed: 4), const Color(0xFFC98A9E), stroke: 2);
        c.drawLine(p(-50, 88), p(-60, 120), Paint()..color = const Color(0xFFC98A9E)..strokeWidth = 8 * k);
        Bio.soft(c, Path()..addOval(Rect.fromCircle(center: p(-62, 130), radius: 16 * k)), const Color(0xFFB0475A), stroke: 1.5);
        // Pineal.
        Bio.soft(c, Path()..addOval(Rect.fromCircle(center: p(80, 20), radius: 11 * k)), const Color(0xFF8C6BB1), stroke: 1.5);
        // Midbrain, pons, medulla, cerebellum, spinal cord.
        Bio.soft(c, Bio.smooth([p(20, 50), p(80, 60), p(80, 120), p(20, 120)]), const Color(0xFFD7B7C4), stroke: 2);
        Bio.soft(c, Bio.blob(p(50, 160), 55 * k, 40 * k, seed: 6), const Color(0xFFCFA7B6), stroke: 2);
        Bio.soft(c, Bio.smooth([p(20, 190), p(85, 190), p(75, 270), p(35, 270)]), const Color(0xFFC79CB0), stroke: 2);
        c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(p(40, 260).dx, p(40, 260).dy, p(70, 330).dx, p(70, 330).dy), Radius.circular(10 * k)), Paint()..color = const Color(0xFFE2C9D3));
        final cb = Bio.blob(p(190, 150), 110 * k, 70 * k, seed: 8);
        Bio.soft(c, cb, const Color(0xFFD69CA7), stroke: 2, edge: const Color(0xFFB0475A));
        for (var j = 0; j < 7; j++) {
          c.drawPath(Path()..addArc(Rect.fromCircle(center: p(190, 150), radius: (20 + j * 12) * k), -0.6, 1.8), gyri..strokeWidth = 1.8);
        }
        return [
          BioPart('cerebrum', 'Cerebrum', p(-150, -150), 'The largest part: two cerebral hemispheres. Its cortex (grey matter) has motor and sensory areas and association areas for memory, communication and thinking.'),
          BioPart('cc', 'Corpus callosum', p(-60, -40), 'A tract of nerve fibres joining the left and right cerebral hemispheres.'),
          BioPart('thal', 'Thalamus', p(10, 20), 'A major coordinating centre for sensory and motor signalling, wrapped by the cerebrum.'),
          BioPart('hypo', 'Hypothalamus', p(-40, 70), 'Controls body temperature, urge for eating and drinking; makes the hypothalamic hormones (releasing and inhibiting hormones).'),
          BioPart('pit', 'Pituitary gland', p(-62, 130), 'An endocrine gland attached to the hypothalamus by a stalk.'),
          BioPart('pineal', 'Pineal gland', p(80, 20), 'Secretes melatonin, which regulates the 24-hour (diurnal) rhythm.'),
          BioPart('mid', 'Midbrain', p(50, 90), 'Between the thalamus and the pons; the corpora quadrigemina here deal with visual and auditory reflexes.'),
          BioPart('pons', 'Pons', p(50, 160), 'Fibre tracts connecting different regions of the brain; with the medulla, it helps regulate breathing.'),
          BioPart('medulla', 'Medulla oblongata', p(55, 240), 'Connected to the spinal cord; controls respiration, cardiovascular reflexes and gastric secretions.'),
          BioPart('cereb', 'Cerebellum', p(230, 160), 'Has a very convoluted surface to hold more neurons; coordinates movement and maintains balance.'),
          BioPart('cord', 'Spinal cord', p(55, 315), 'Continues from the medulla down the vertebral column; carries signals to and from the brain and controls reflexes.'),
        ];
      },
    );
  }
}
