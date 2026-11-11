import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bio_kit.dart';

/// Molecular basis of inheritance (2nd PUC Biology ch. 5; Chargaff in 1st PUC ch. 9): the double
/// helix and Chargaff's rule, DNA length, Griffith's transformation, the replication fork and
/// Meselson–Stahl, transcription, the genetic code and frameshifts, and the lac operon.
///
/// Preset: {"mode": "helix"|"griffith"|"replication"|"meselson"|"transcription"|"code"|"lac",
/// "A": 30 (%), "bpExp": 9.8 (log₁₀ bp), "gen": 1, "model": "semi", "step": 0, "shift": 0,
/// "k": 3, "len": 300, "lactose": 0, "griffith": 3}.
class DnaInstrument extends StatefulWidget {
  const DnaInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<DnaInstrument> createState() => _DnaState();
}

const _txSteps = ['Initiation', 'Elongation', 'Termination'];

class _DnaState extends BioState<DnaInstrument> {
  @override
  String get instrumentId => 'bio-dna';
  @override
  Map<String, dynamic> get lessonPreset => widget.preset;
  @override
  List<String> get modes => const ['helix', 'griffith', 'replication', 'meselson', 'transcription', 'code', 'lac'];
  @override
  Map<String, Map<String, dynamic>> get presets => const {
    'Double helix': {'mode': 'helix'},
    'Griffith': {'mode': 'griffith'},
    'Replication fork': {'mode': 'replication'},
    'Meselson–Stahl': {'mode': 'meselson'},
    'Transcription': {'mode': 'transcription'},
    'Genetic code': {'mode': 'code'},
    'Lac operon: off': {'mode': 'lac', 'lactose': 0},
    'Lac operon: on': {'mode': 'lac', 'lactose': 60},
  };
  @override
  Map<String, Object> defaults(String mode) => {'A': 30, 'bpExp': 9.82, 'gen': 1, 'model': 'semi', 'step': 0, 'shift': 0, 'k': 3, 'len': 300, 'lactose': 0, 'griffith': 3};

  static const _sub = '2nd PUC Biology · Molecular basis of inheritance';
  static const _base = {'A': BioC.dnaA, 'T': BioC.dnaT, 'G': BioC.dnaG, 'C': BioC.dnaC, 'U': Color(0xFFB45309)};

  @override
  Widget build(BuildContext context) => switch (mode) {
    'griffith' => _griffith(),
    'replication' => _replication(),
    'meselson' => _meselson(),
    'transcription' => _transcription(),
    'code' => _code(),
    'lac' => _lac(),
    _ => _helix(),
  };

  /// A double helix along x from [a] to [b]: two backbones and coloured base pairs.
  void helix(Canvas c, Offset a, double len, double amp, String seq, {double turns = 3, double phase = 0}) {
    final n = seq.length;
    Offset at(double t, double ph) => a + Offset(len * t, amp * math.sin(2 * math.pi * turns * t + ph + phase));
    // Back strand first, then pairs, then front strand.
    for (final front in [false, true]) {
      for (final ph in [0.0, math.pi]) {
        final path = Path();
        for (var k = 0; k <= 160; k++) {
          final t = k / 160;
          final p = at(t, ph);
          k == 0 ? path.moveTo(p.dx, p.dy) : path.lineTo(p.dx, p.dy);
        }
        if (!front) {
          c.drawPath(path, Paint()..color = (ph == 0 ? const Color(0xFF59627E) : const Color(0xFF8A90B0)).withValues(alpha: 0.35)..style = PaintingStyle.stroke..strokeWidth = 10);
        }
        if (front) {
          // Draw only the half of each strand that faces the viewer, thicker.
          for (var k = 0; k < 160; k++) {
            final t0 = k / 160, t1 = (k + 1) / 160;
            final facing = math.cos(2 * math.pi * turns * t0 + ph + phase) > 0;
            if (!facing) continue;
            c.drawLine(at(t0, ph), at(t1, ph), Paint()..color = ph == 0 ? const Color(0xFF3B4254) : const Color(0xFF6A7088)..strokeWidth = 12..strokeCap = StrokeCap.round);
          }
        }
      }
      if (!front) {
        for (var k = 0; k < n; k++) {
          final t = (k + 0.5) / n;
          final p1 = at(t, 0), p2 = at(t, math.pi);
          final mid = (p1 + p2) / 2;
          final b1 = seq[k];
          final b2 = const {'A': 'T', 'T': 'A', 'G': 'C', 'C': 'G'}[b1]!;
          c.drawLine(p1, mid, Paint()..color = _base[b1]!..strokeWidth = 8);
          c.drawLine(mid, p2, Paint()..color = _base[b2]!..strokeWidth = 8);
        }
      }
    }
  }

  // ------------------------------------------------------------------ helix

  Widget _helix() {
    final a = n('A').clamp(0, 50).toDouble(), g = 50 - a;
    final bp = math.pow(10, n('bpExp')).toDouble();
    final lenM = bp * 0.34e-9;
    String len() => lenM >= 1 ? '${f2(lenM)} m' : (lenM >= 1e-3 ? '${f1(lenM * 1000)} mm' : (lenM >= 1e-6 ? '${f1(lenM * 1e6)} µm' : '${f1(lenM * 1e9)} nm'));
    final rnd = math.Random(3);
    final seq = String.fromCharCodes([for (var k = 0; k < 30; k++) (rnd.nextDouble() * 100 < 2 * a ? (rnd.nextBool() ? 65 : 84) : (rnd.nextBool() ? 71 : 67))]);
    return frame(
      title: 'The double helix and Chargaff\'s rule',
      subtitle: _sub,
      formula: 'A = T, G = C; 0.34 nm per base pair',
      readouts: [
        Readout('A = T', '${f0(a)}% each', '', BioC.dnaA),
        Readout('G = C', '${f0(g)}% each', '', BioC.dnaG),
        Readout('Base pairs', sci(bp), 'bp'),
        Readout('Length', len(), '', IX.accent),
      ],
      controls: [
        slider('A', 'Adenine', 0, 50, unit: '%'),
        slider('bpExp', 'Base pairs (log scale)', 1, 10, dp: 2, div: 90, fmt: (x) => sci(math.pow(10, x).toDouble())),
        Padding(padding: const EdgeInsets.only(top: 4), child: Text('Human diploid cell: 6.6 × 10⁹ bp ≈ 2.2 m. E. coli: 4.6 × 10⁶ bp. Phage lambda: 48 502 bp.', style: IX.text(17, c: IX.inkSoft))),
      ],
      painter: BioPainter((c, size) {
        helix(c, Offset(60, size.height * 0.32), size.width - 120, 90, seq, turns: 3);
        // Scale bar: one turn = 3.4 nm, 10 bp.
        final turnW = (size.width - 120) / 3;
        final y = size.height * 0.32 + 130;
        c.drawLine(Offset(60, y), Offset(60 + turnW, y), Paint()..color = IX.ink..strokeWidth = 3);
        for (final x in [60.0, 60 + turnW]) {
          c.drawLine(Offset(x, y - 8), Offset(x, y + 8), Paint()..color = IX.ink..strokeWidth = 3);
        }
        IxPaint.label(c, 'one turn: 10 bp = 3.4 nm', Offset(60 + turnW / 2, y + 22), size: 17, color: IX.ink, w: FontWeight.w700);
        IxPaint.label(c, 'diameter 2 nm', Offset(size.width - 70, size.height * 0.32 - 120), size: 17, color: IX.inkSoft, w: FontWeight.w600, align: Alignment.centerRight);
        IxPaint.label(c, '5′', Offset(40, size.height * 0.32), size: 18, color: IX.ink, w: FontWeight.w700);
        IxPaint.label(c, '3′', Offset(size.width - 40, size.height * 0.32), size: 18, color: IX.ink, w: FontWeight.w700);
        // Base composition bars.
        final plot = Plot(Rect.fromLTRB(110, size.height * 0.60, size.width * 0.55, size.height - 70), -0.5, 3.5, 0, 55);
        plot.frame(c, xs: [], ys: [0, 25, 50], yLabel: '% of bases', title: 'Base composition');
        plot.bars(c, [a, a, g, g], [BioC.dnaA, BioC.dnaT, BioC.dnaG, BioC.dnaC], labels: const ['A', 'T', 'G', 'C'], fmt: (v) => '${f0(v)}%');
        Bio.note(c, 'Purines (A, G) always make up half the bases: (A + G) ÷ (T + C) = 1. A pairs with T by two hydrogen bonds, G with C by three. The two strands are antiparallel (5′→3′ and 3′→5′) — Watson and Crick, 1953, from Franklin and Wilkins\' X-ray data.', Offset(size.width * 0.60, size.height * 0.62), maxWidth: size.width * 0.37, size: 18, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ Griffith

  Widget _griffith() {
    final pick = i('griffith').clamp(0, 3);
    final cases = [('Live S strain', true), ('Live R strain', false), ('Heat-killed S', false), ('Heat-killed S + live R', true)];
    return frame(
      title: 'Griffith\'s transforming principle',
      subtitle: _sub,
      formula: 'heat-killed S + live R → mouse dies',
      readouts: [
        Readout('Injected', cases[pick].$1, '', IX.accent),
        Readout('Mouse', cases[pick].$2 ? 'Dies' : 'Lives', '', cases[pick].$2 ? IX.positive : IX.green),
        Readout('Later shown', 'DNA transforms', 'Avery, MacLeod, McCarty'),
      ],
      controls: [stepper('griffith', [for (final c0 in cases) c0.$1], label: 'Experiment')],
      painter: BioPainter((c, size) {
        final w = (size.width - 60) / 4;
        for (var k = 0; k < 4; k++) {
          final r = Rect.fromLTWH(30 + k * w, 40, w - 20, size.height * 0.62);
          final on = k == pick;
          Bio.card(c, r, fill: on ? const Color(0xFFF5F8FF) : IX.paper, edge: on ? IX.accent : IX.rule);
          Bio.note(c, cases[k].$1, r.topCenter + const Offset(0, 18), align: Alignment.topCenter, maxWidth: r.width - 20, size: 18, color: on ? IX.accent : IX.ink, w: FontWeight.w700);
          // Bacteria: smooth (capsule) or rough.
          final bc = r.topCenter + Offset(0, r.height * 0.30);
          for (var j = 0; j < 5; j++) {
            final p = bc + Offset((j - 2) * 22.0, (j.isEven ? -8 : 8));
            final smooth = k == 0 || k == 2 || (k == 3 && j < 3);
            final dead = k == 2 || (k == 3 && j < 3);
            if (smooth) c.drawCircle(p, 12, Paint()..color = const Color(0xFFF2E6C8));
            Bio.fill(c, smooth ? (Path()..addOval(Rect.fromCircle(center: p, radius: 8))) : Bio.blob(p, 8, 8, seed: j, wobble: 0.25, n: 8), dead ? IX.muted : const Color(0xFF7A9A4A));
          }
          // Mouse.
          final mc = r.topCenter + Offset(0, r.height * 0.62);
          final dies = cases[k].$2;
          final body = Bio.blob(mc, 54, 30, seed: 4, wobble: 0.04);
          c.save();
          if (dies) {
            c.translate(mc.dx, mc.dy);
            c.rotate(math.pi);
            c.translate(-mc.dx, -mc.dy);
          }
          Bio.soft(c, body, const Color(0xFFE9E4DD), stroke: 2, edge: const Color(0xFFA89F90));
          c.drawCircle(mc + const Offset(-50, -6), 20, Paint()..color = const Color(0xFFE9E4DD));
          c.drawCircle(mc + const Offset(-50, -6), 20, Paint()..color = const Color(0xFFA89F90)..style = PaintingStyle.stroke..strokeWidth = 2);
          c.drawCircle(mc + const Offset(-44, -24), 9, Paint()..color = const Color(0xFFF2C4C7));
          c.drawCircle(mc + const Offset(-58, -10), 3, Paint()..color = IX.ink);
          c.drawPath(Path()..moveTo(mc.dx + 52, mc.dy)..quadraticBezierTo(mc.dx + 90, mc.dy - 30, mc.dx + 100, mc.dy + 10), Paint()..color = const Color(0xFFD4A5A8)..strokeWidth = 3..style = PaintingStyle.stroke);
          c.restore();
          IxPaint.label(c, dies ? 'Mouse dies' : 'Mouse lives', mc + const Offset(0, 66), size: 19, color: dies ? IX.positive : IX.green, w: FontWeight.w700);
          if (k == 3) IxPaint.label(c, 'live S found in blood', mc + const Offset(0, 96), size: 16, color: IX.inkSoft, w: FontWeight.w600);
        }
        Bio.note(c, 'Something from the dead S cells transformed live R cells into S (with a capsule). Avery, MacLeod and McCarty (1933–44) showed it was DNA: DNase stopped transformation, proteases and RNase did not.', Offset(40, size.height - 30), align: Alignment.bottomLeft, maxWidth: size.width - 80, size: 18, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ replication fork

  Widget _replication() {
    return frame(
      title: 'The replication fork',
      subtitle: _sub,
      formula: 'semi-conservative; new strand grows 5′ → 3′',
      readouts: const [
        Readout('Enzyme', 'DNA polymerase', 'DNA-dependent', IX.accent),
        Readout('Leading strand', 'Continuous', '', IX.green),
        Readout('Lagging strand', 'Okazaki pieces', 'joined by ligase', IX.amber),
        Readout('E. coli speed', '≈ 2000', 'bp/s'),
      ],
      painter: BioPainter((c, size) {
        final y = size.height * 0.42;
        final fx = size.width * 0.42;
        final rnd = math.Random(5);
        final seq = String.fromCharCodes([for (var k = 0; k < 10; k++) 'ATGC'.codeUnitAt(rnd.nextInt(4))]);
        helix(c, Offset(fx, y), size.width - fx - 40, 60, seq, turns: 1.6);
        // Two parental strands splaying left.
        final top = Path()..moveTo(fx, y - 10)..quadraticBezierTo(fx - 120, y - 30, fx - 420, y - 180);
        final bot = Path()..moveTo(fx, y + 10)..quadraticBezierTo(fx - 120, y + 30, fx - 420, y + 180);
        Bio.stroke(c, top, const Color(0xFF3B4254), 12);
        Bio.stroke(c, bot, const Color(0xFF6A7088), 12);
        // Leading strand (continuous) along the top, lagging (fragments) along the bottom.
        final lead = Path()..moveTo(fx - 400, y - 150)..quadraticBezierTo(fx - 140, y - 4, fx - 40, y - 8);
        Bio.stroke(c, lead.shift(const Offset(0, 22)), IX.green, 10);
        IxPaint.arrow(c, Offset(fx - 80, y + 14), Offset(fx - 30, y + 12), IX.green, width: 4);
        for (var k = 0; k < 3; k++) {
          final x0 = fx - 120 - k * 110.0;
          final t0 = (fx - x0) / 420;
          final p0 = Offset(x0, y + 10 + 170 * t0 * t0 - 24);
          final p1 = Offset(x0 - 90, y + 10 + 170 * math.pow((fx - x0 + 90) / 420, 2) - 24);
          c.drawLine(p0, p1, Paint()..color = IX.amber..strokeWidth = 10..strokeCap = StrokeCap.round);
          IxPaint.arrow(c, p0 + const Offset(-60, 0) + Offset(0, (p1.dy - p0.dy) * 0.66), p1 + const Offset(0, 0), IX.amber, width: 3);
        }
        // Enzymes.
        Bio.soft(c, Bio.blob(Offset(fx + 6, y), 30, 34, seed: 3), const Color(0xFF8C6BB1), stroke: 2);
        Bio.soft(c, Bio.blob(Offset(fx - 70, y - 50), 26, 22, seed: 4), IX.accent, stroke: 2);
        Bio.soft(c, Bio.blob(Offset(fx - 200, y + 92), 22, 18, seed: 5), const Color(0xFFC0504D), stroke: 2);
        final parts = [
          BioPart('h', 'Unwinding at the fork', Offset(fx + 6, y - 20)),
          BioPart('p', 'DNA polymerase', Offset(fx - 70, y - 50)),
          BioPart('l', 'Leading strand: continuous', Offset(fx - 240, y - 70)),
          BioPart('o', 'Lagging strand: Okazaki fragments', Offset(fx - 300, y + 110)),
          BioPart('g', 'DNA ligase joins fragments', Offset(fx - 200, y + 92)),
          BioPart('t', 'Parental (template) DNA', Offset(fx + 200, y + 40)),
        ];
        drawLabels(c, parts, layoutLabels(parts, midX: fx - 60, leftX: 40 + 210, rightX: fx + 120, top: 60, bottom: size.height * 0.80), null);
        Bio.note(c, 'Each parental strand is a template; each daughter molecule keeps one old strand (semi-conservative). DNA polymerase adds nucleotides only in the 5′ → 3′ direction, so one strand is copied continuously and the other in short pieces. Replication starts at the origin (ori) and needs dNTPs as substrate and energy.', Offset(40, size.height - 24), align: Alignment.bottomLeft, maxWidth: size.width - 80, size: 18, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ Meselson–Stahl

  Widget _meselson() {
    final g = i('gen').clamp(0, 6);
    final m = str('model', 'semi');
    double heavy, hybrid, light;
    if (m == 'semi') {
      heavy = g == 0 ? 1 : 0;
      hybrid = g == 0 ? 0 : 2 / math.pow(2, g);
      light = 1 - heavy - hybrid;
    } else {
      heavy = 1 / math.pow(2, g);
      hybrid = 0;
      light = 1 - heavy;
    }
    return frame(
      title: 'The Meselson–Stahl experiment',
      subtitle: _sub,
      formula: 'after g generations: 2 of 2ᵍ molecules hybrid',
      readouts: [
        Readout('Generations in ¹⁴N', '$g', '', IX.accent),
        Readout('Heavy ¹⁵N/¹⁵N', '${f0(heavy * 100)}%', '', const Color(0xFF3B4254)),
        Readout('Hybrid ¹⁵N/¹⁴N', '${f0(hybrid * 100)}%', '', IX.amber),
        Readout('Light ¹⁴N/¹⁴N', '${f0(light * 100)}%', '', IX.accent),
      ],
      controls: [
        slider('gen', 'Generations in ¹⁴N (20 min each)', 0, 6),
        choice('model', 'Model', const {'semi': 'Semi-conservative', 'cons': 'Conservative'}),
      ],
      painter: BioPainter((c, size) {
        // Molecules drawn as strand pairs.
        final mx = 60.0;
        final count = math.min(math.pow(2, g).toInt(), 16);
        final per = (size.width * 0.52) / count;
        Bio.heading(c, 'DNA molecules after $g generation${g == 1 ? '' : 's'}', Offset(mx, 30));
        for (var k = 0; k < count; k++) {
          final x = mx + k * per + per / 2;
          bool oldA, oldB;
          if (m == 'semi') {
            oldA = g == 0 || k == 0;
            oldB = g == 0 || k == count - 1;
            if (g > 0) oldB = false;
            if (g > 0 && k == count - 1) {
              oldA = false;
              oldB = true;
            }
          } else {
            oldA = k == 0;
            oldB = k == 0;
          }
          for (final (dx, old) in [(-7.0, oldA), (7.0, oldB)]) {
            c.drawLine(Offset(x + dx, 90), Offset(x + dx, 230), Paint()..color = old ? const Color(0xFF3B4254) : const Color(0xFF7FA7D9)..strokeWidth = math.min(9, per / 4)..strokeCap = StrokeCap.round);
          }
        }
        IxPaint.label(c, 'dark: ¹⁵N strand   light blue: ¹⁴N strand', Offset(mx, 262), size: 16, color: IX.inkSoft, w: FontWeight.w600, align: Alignment.centerLeft);
        // CsCl tube.
        final tc = Offset(size.width * 0.80, size.height * 0.48);
        final tube = RRect.fromRectAndCorners(Rect.fromCenter(center: tc, width: 120, height: size.height * 0.72), bottomLeft: const Radius.circular(60), bottomRight: const Radius.circular(60), topLeft: const Radius.circular(8), topRight: const Radius.circular(8));
        c.drawRRect(tube, Paint()..shader = LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [const Color(0xFFF5F8FB), const Color(0xFFDDE7F0)]).createShader(tube.outerRect));
        c.drawRRect(tube, Paint()..color = IX.glassEdge..style = PaintingStyle.stroke..strokeWidth = 3);
        for (final (frac, y, nm, col) in [(light, 0.40, 'light', IX.accent), (hybrid, 0.55, 'hybrid', IX.amber), (heavy, 0.70, 'heavy', const Color(0xFF3B4254))]) {
          final yy = tube.top + tube.height * y;
          if (frac > 0) c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(tc.dx, yy), width: 100, height: 6 + 20 * frac), const Radius.circular(6)), Paint()..color = col.withValues(alpha: 0.4 + 0.6 * frac));
          IxPaint.label(c, nm, Offset(tc.dx - 76, yy), size: 17, color: frac > 0 ? col : IX.muted, w: FontWeight.w700, align: Alignment.centerRight);
        }
        IxPaint.label(c, 'CsCl density gradient', tc + Offset(0, tube.height / 2 + 24), size: 17, color: IX.ink, w: FontWeight.w700);
        Bio.note(c, m == 'semi' ? 'Observed: after one generation all DNA is hybrid; after two, half hybrid and half light. Only semi-conservative replication gives this.' : 'A conservative model would give heavy and light bands but never a hybrid band — not what Meselson and Stahl saw (1958).', Offset(mx, size.height * 0.40), maxWidth: size.width * 0.52, size: 19, color: IX.ink);
        final plot = Plot(Rect.fromLTRB(mx + 60, size.height * 0.62, size.width * 0.56, size.height - 70), -0.5, 2.5, 0, 110);
        plot.frame(c, xs: [], ys: [0, 50, 100], yLabel: '% of DNA');
        plot.bars(c, [heavy * 100, hybrid * 100, light * 100], [const Color(0xFF3B4254), IX.amber, IX.accent], labels: const ['Heavy', 'Hybrid', 'Light'], fmt: (v) => '${f0(v)}%');
      }),
    );
  }

  // ------------------------------------------------------------------ transcription

  Widget _transcription() {
    final st = i('step').clamp(0, 2);
    return frame(
      title: 'Transcription: ${_txSteps[st]}',
      subtitle: _sub,
      formula: 'template 3′→5′ read; RNA made 5′→3′',
      readouts: [
        Readout('Stage', _txSteps[st], '', IX.accent),
        Readout('Factor', ['σ (sigma)', 'RNA polymerase', 'ρ (rho)'][st], ''),
        Readout('RNA made', st == 0 ? 'None yet' : (st == 1 ? 'Growing' : 'Released'), '', IX.green),
      ],
      controls: [stepper('step', _txSteps)],
      painter: BioPainter((c, size) {
        final y = size.height * 0.36;
        final x0 = 60.0, x1 = size.width - 60;
        final regions = [('Promoter', 0.0, 0.18, IX.positive), ('Structural gene', 0.18, 0.82, IX.accent), ('Terminator', 0.82, 1.0, IX.amber)];
        for (final (nm, a, b2, col) in regions) {
          final r = Rect.fromLTRB(x0 + (x1 - x0) * a, y - 70, x0 + (x1 - x0) * b2, y - 44);
          c.drawRRect(RRect.fromRectAndRadius(r.deflate(2), const Radius.circular(8)), Paint()..color = col.withValues(alpha: 0.18));
          IxPaint.label(c, nm, r.center, size: 17, color: Bio.darken(col, 0.2), w: FontWeight.w700);
        }
        final open = st == 0 ? 0.08 : (st == 1 ? 0.5 : 0.86);
        final bubbleA = open - 0.07, bubbleB = open + 0.07;
        Path strand(double off, bool upper) {
          final p = Path()..moveTo(x0, y + off);
          for (var t = 0.0; t <= 1.0001; t += 0.01) {
            final inB = t > bubbleA && t < bubbleB;
            final bump = inB ? math.sin((t - bubbleA) / (bubbleB - bubbleA) * math.pi) * 34 * (upper ? -1 : 1) : 0;
            p.lineTo(x0 + (x1 - x0) * t, y + off + bump);
          }
          return p;
        }
        Bio.stroke(c, strand(-10, true), const Color(0xFF3B4254), 9);
        Bio.stroke(c, strand(10, false), const Color(0xFF8A90B0), 9);
        IxPaint.label(c, 'Coding strand 5′ → 3′', Offset(x0, y - 100), size: 17, color: const Color(0xFF3B4254), w: FontWeight.w700, align: Alignment.centerLeft);
        IxPaint.label(c, 'Template strand 3′ → 5′', Offset(x0, y + 46), size: 17, color: const Color(0xFF6A7088), w: FontWeight.w700, align: Alignment.centerLeft);
        // RNA polymerase.
        final px = x0 + (x1 - x0) * open;
        Bio.soft(c, Bio.blob(Offset(px, y), 80, 60, seed: 4, wobble: 0.05), const Color(0xFF8C6BB1).withValues(alpha: 0.85), stroke: 2.5);
        IxPaint.label(c, 'RNA polymerase', Offset(px, y + 90), size: 18, color: const Color(0xFF6B4B9A), w: FontWeight.w700, halo: true);
        if (st == 0) Bio.tag(c, 'σ factor', Offset(px - 70, y - 60), IX.positive, size: 16);
        if (st == 2) Bio.tag(c, 'ρ factor', Offset(px + 80, y - 60), IX.amber, size: 16);
        // RNA.
        if (st > 0) {
          final start = Offset(x0 + (x1 - x0) * 0.2, y + 140);
          final end = Offset(px - 20, y + 20);
          final rna = Path()..moveTo(start.dx, start.dy)..quadraticBezierTo((start.dx + end.dx) / 2, y + 170, end.dx, end.dy);
          Bio.stroke(c, rna, const Color(0xFFB45309), 7);
          IxPaint.label(c, st == 2 ? 'mRNA released (5′ cap and tail added in eukaryotes)' : 'RNA grows 5′ → 3′', start + const Offset(0, 30), size: 17, color: const Color(0xFFB45309), w: FontWeight.w700, align: Alignment.centerLeft);
        }
        Bio.note(c, [
          'RNA polymerase binds the promoter with the σ factor and opens the double helix. The promoter defines the template strand and the start.',
          'Using the template strand, the polymerase adds ribonucleoside triphosphates by complementarity (A–U, G–C). The RNA sequence matches the coding strand, with U for T.',
          'At the terminator, the ρ factor ends transcription; the polymerase and RNA fall away. In eukaryotes, introns are then removed by splicing.',
        ][st], Offset(60, size.height - 30), align: Alignment.bottomLeft, maxWidth: size.width - 120, size: 19, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ genetic code

  Widget _code() {
    final sh = i('shift').clamp(-3, 3), k = i('k').clamp(1, 4), len = i('len');
    const sentence = 'RAMHASREDCAP';
    String txt;
    if (sh > 0) {
      txt = '${sentence.substring(0, 6)}${'BIG'.substring(0, sh)}${sentence.substring(6)}';
    } else if (sh < 0) {
      txt = sentence.substring(0, 6) + sentence.substring(6 - sh);
    } else {
      txt = sentence;
    }
    final words = [for (var j = 0; j + 3 <= txt.length; j += 3) txt.substring(j, j + 3)];
    final rest = txt.length % 3 == 0 ? '' : txt.substring(txt.length - txt.length % 3);
    final aa = len ~/ 3 - 1;
    return frame(
      title: 'The genetic code and frameshifts',
      subtitle: _sub,
      formula: '64 = 4³ codons; 61 code, 3 stop',
      readouts: [
        Readout('Letters per codon', '$k', '', IX.accent),
        Readout('Possible codons', '${math.pow(4, k)}', k < 3 ? '< 20: too few' : '≥ 20 amino acids'),
        Readout('mRNA AUG…stop', '$len', 'bases'),
        Readout('Amino acids', '$aa', '(stop codes none)', IX.green),
      ],
      controls: [
        slider('shift', 'Letters inserted (+) or deleted (−) before RED', -3, 3),
        slider('k', 'Letters per codon', 1, 4),
        slider('len', 'Bases from AUG to the stop codon', 6, 900, div: 298),
      ],
      painter: BioPainter((c, size) {
        Bio.heading(c, 'Read in threes from a fixed start', const Offset(50, 40));
        final w = (size.width - 100) / math.max(words.length + (rest.isEmpty ? 0 : 1), 4);
        for (var j = 0; j < words.length; j++) {
          final ok = ['RAM', 'HAS', 'RED', 'CAP', 'BIG'].contains(words[j]) && !(sh.abs() % 3 != 0 && j >= 2);
          final r = Rect.fromLTWH(50 + j * w, 90, w - 14, 90);
          Bio.box(c, r, words[j], color: ok ? IX.green : IX.positive, size: 34, filled: false);
        }
        if (rest.isNotEmpty) Bio.box(c, Rect.fromLTWH(50 + words.length * w, 90, w - 14, 90), rest, color: IX.muted, size: 34);
        Bio.note(c, sh == 0 ? 'RAM HAS RED CAP: the reading frame is intact.' : (sh.abs() % 3 == 0 ? 'Three letters ${sh > 0 ? 'inserted' : 'deleted'}: one word ${sh > 0 ? 'added' : 'lost'}, the rest still reads — the frame is restored.' : '${sh.abs()} letter${sh.abs() > 1 ? 's' : ''} ${sh > 0 ? 'inserted' : 'deleted'}: every word after it is nonsense — a frameshift mutation.'), const Offset(50, 200), maxWidth: size.width - 100, size: 20, color: IX.ink, w: FontWeight.w600);
        // mRNA on a ribosome.
        final y = size.height * 0.62;
        const codons = ['AUG', 'UUU', 'GGC', 'AAA', 'UGG', 'CCU', 'UAA'];
        const amino = ['Met', 'Phe', 'Gly', 'Lys', 'Trp', 'Pro', 'stop'];
        final cw = (size.width - 160) / codons.length;
        Bio.soft(c, Bio.blob(Offset(80 + cw * 2.5, y - 30), cw * 1.4, 110, seed: 3, wobble: 0.04), const Color(0xFFDCCDEB), stroke: 2, edge: const Color(0xFF8C6BB1));
        IxPaint.label(c, 'Ribosome', Offset(80 + cw * 2.5, y - 120), size: 18, color: const Color(0xFF6B4B9A), w: FontWeight.w700);
        for (var j = 0; j < codons.length; j++) {
          final x = 80 + j * cw;
          for (var q = 0; q < 3; q++) {
            final b = codons[j][q];
            c.drawRect(Rect.fromLTWH(x + q * cw / 3, y, cw / 3 - 2, 34), Paint()..color = _base[b]!.withValues(alpha: 0.85));
            IxPaint.label(c, b, Offset(x + q * cw / 3 + cw / 6, y + 17), size: 17, color: Colors.white, w: FontWeight.w700);
          }
          if (j <= 3) {
            Bio.tag(c, amino[j], Offset(x + cw / 2, y - 50 - (j == 3 ? 0 : 0)), j == 3 ? IX.accent : IX.green, size: 17);
          } else {
            IxPaint.label(c, amino[j], Offset(x + cw / 2, y - 30), size: 17, color: IX.inkSoft, w: FontWeight.w600);
          }
        }
        IxPaint.label(c, '5′', Offset(60, y + 17), size: 18, color: IX.ink, w: FontWeight.w700);
        IxPaint.label(c, '3′', Offset(size.width - 60, y + 17), size: 18, color: IX.ink, w: FontWeight.w700);
        Bio.note(c, 'AUG codes methionine and is the start codon. UAA, UAG and UGA are stop codons. The code is degenerate (several codons per amino acid), unambiguous, nearly universal and read without commas.', Offset(50, size.height - 24), align: Alignment.bottomLeft, maxWidth: size.width - 100, size: 18, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ lac operon

  Widget _lac() {
    final lac = n('lactose');
    final on = lac > 5;
    final level = (lac / 100).clamp(0.0, 1.0);
    return frame(
      title: on ? 'The lac operon: switched on' : 'The lac operon: switched off',
      subtitle: _sub,
      formula: 'lactose (inducer) inactivates the repressor',
      readouts: [
        Readout('Lactose', f0(lac), 'units', IX.amber),
        Readout('Repressor', on ? 'Bound to inducer' : 'On the operator', '', on ? IX.green : IX.positive),
        Readout('Genes z, y, a', on ? 'Transcribed' : 'Off', '', on ? IX.green : IX.inkSoft),
        Readout('β-galactosidase', on ? f0(100 * level) : '0', '% max', IX.accent),
      ],
      controls: [
        slider('lactose', 'Lactose added', 0, 100),
        Padding(padding: const EdgeInsets.only(top: 4), child: Text('Jacob and Monod: a negatively regulated, inducible operon. Glucose-free medium with lactose switches it on.', style: IX.text(17, c: IX.inkSoft))),
      ],
      painter: BioPainter((c, size) {
        final y = size.height * 0.40;
        final x0 = 50.0, x1 = size.width - 50;
        final segs = [('i', 0.0, 0.12, const Color(0xFF8C6BB1)), ('p', 0.16, 0.24, IX.positive), ('o', 0.24, 0.31, IX.amber), ('z', 0.31, 0.58, IX.accent), ('y', 0.58, 0.78, const Color(0xFF3F8F5A)), ('a', 0.78, 0.95, const Color(0xFF4FA3A0))];
        c.drawLine(Offset(x0, y), Offset(x1, y), Paint()..color = IX.inkSoft..strokeWidth = 6);
        for (final (nm, a, b2, col) in segs) {
          final r = Rect.fromLTRB(x0 + (x1 - x0) * a, y - 26, x0 + (x1 - x0) * b2, y + 26);
          c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(8)), Paint()..color = col);
          IxPaint.label(c, nm, r.center, size: 24, color: Colors.white, w: FontWeight.w700);
        }
        for (final (nm, x) in [('regulator gene', 0.06), ('promoter', 0.20), ('operator', 0.275), ('β-galactosidase', 0.445), ('permease', 0.68), ('transacetylase', 0.865)]) {
          IxPaint.label(c, nm, Offset(x0 + (x1 - x0) * x, y + 46), size: 16, color: IX.inkSoft, w: FontWeight.w600);
        }
        // Repressor made by i.
        final rep = Offset(x0 + (x1 - x0) * 0.06, y - 140);
        IxPaint.arrow(c, Offset(rep.dx, y - 30), rep + const Offset(0, 40), const Color(0xFF8C6BB1), width: 3);
        final opX = x0 + (x1 - x0) * 0.275;
        Path repressor(Offset at) => Bio.blob(at, 46, 34, seed: 3, wobble: 0.06);
        if (!on) {
          Bio.soft(c, repressor(Offset(opX, y - 50)), const Color(0xFF8C6BB1), stroke: 2);
          IxPaint.label(c, 'repressor on operator', Offset(opX + 60, y - 96), size: 17, color: const Color(0xFF6B4B9A), w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
          final pol = Offset(x0 + (x1 - x0) * 0.17, y - 50);
          Bio.soft(c, Bio.blob(pol, 50, 36, seed: 5), const Color(0xFFB0475A).withValues(alpha: 0.85), stroke: 2);
          IxPaint.label(c, 'RNA polymerase blocked', pol + const Offset(0, -56), size: 17, color: IX.positive, w: FontWeight.w700, halo: true);
          Bio.soft(c, repressor(rep), const Color(0xFF8C6BB1), stroke: 2);
        } else {
          final freed = Offset(opX + 40, y - 190);
          Bio.soft(c, repressor(freed), const Color(0xFF8C6BB1).withValues(alpha: 0.7), stroke: 2);
          Bio.soft(c, Path()..addOval(Rect.fromCircle(center: freed + const Offset(30, 18), radius: 14)), BioC.sugar, stroke: 1.5);
          IxPaint.label(c, 'repressor + inducer: inactive', freed + const Offset(70, -10), size: 17, color: const Color(0xFF6B4B9A), w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
          final px = x0 + (x1 - x0) * (0.40 + 0.35 * level);
          Bio.soft(c, Bio.blob(Offset(px, y - 50), 50, 36, seed: 5), const Color(0xFFB0475A).withValues(alpha: 0.85), stroke: 2);
          IxPaint.label(c, 'RNA polymerase', Offset(px, y - 106), size: 17, color: const Color(0xFFB0475A), w: FontWeight.w700, halo: true);
          final m = Path()..moveTo(x0 + (x1 - x0) * 0.31, y + 90);
          for (var t = 0.31; t < (0.40 + 0.35 * level); t += 0.01) {
            m.lineTo(x0 + (x1 - x0) * t, y + 90 + math.sin(t * 60) * 6);
          }
          Bio.stroke(c, m, const Color(0xFFB45309), 5);
          IxPaint.label(c, 'polycistronic mRNA', Offset(x0 + (x1 - x0) * 0.31, y + 120), size: 17, color: const Color(0xFFB45309), w: FontWeight.w700, align: Alignment.centerLeft);
          for (var k = 0; k < (8 * level).round(); k++) {
            Bio.soft(c, Path()..addOval(Rect.fromCircle(center: Offset(x0 + 120 + k * 60.0, size.height * 0.75), radius: 14)), BioC.sugar, stroke: 1.5);
          }
        }
        // Lactose in the medium.
        final rnd = math.Random(2);
        for (var k = 0; k < (lac / 6).round(); k++) {
          c.drawCircle(Offset(x0 + rnd.nextDouble() * (x1 - x0), 40 + rnd.nextDouble() * 60), 9, Paint()..color = BioC.sugar);
        }
        Bio.note(c, on ? 'Lactose (via allolactose) binds the repressor and changes its shape, so it falls off the operator. RNA polymerase transcribes z, y and a; β-galactosidase breaks lactose into glucose and galactose. When the lactose is used up, the repressor binds again and the operon switches off.' : 'The i gene always makes the repressor. With no lactose, the repressor sits on the operator and stops RNA polymerase from transcribing the structural genes.', Offset(x0, size.height - 24), align: Alignment.bottomLeft, maxWidth: x1 - x0, size: 18, color: IX.ink);
      }),
    );
  }
}
