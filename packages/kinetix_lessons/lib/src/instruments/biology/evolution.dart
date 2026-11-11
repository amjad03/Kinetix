import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bio_kit.dart';

/// Evolution and breeding (2nd PUC Biology ch. 6, 1, 14): Hardy–Weinberg and selection against
/// aa, natural selection in peppered moths, radioactive dating, Miller's experiment, loss of
/// heterozygosity by inbreeding (and saved hybrid seed), and the response to artificial selection.
///
/// Preset: {"mode": "hw"|"selection"|"dating"|"miller"|"inbreeding"|"breeding", "q": 0.4, "gen": 0,
/// "select": false, "s": 10 (%), "p0": 1 (%), "industrial": true, "half": 5730, "left": 25 (%),
/// "outcross": false, "h2": 0.4, "S": 10, "mean": 100}.
class EvolutionInstrument extends StatefulWidget {
  const EvolutionInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<EvolutionInstrument> createState() => _EvoState();
}

class _EvoState extends BioState<EvolutionInstrument> {
  @override
  String get instrumentId => 'bio-evolution';
  @override
  Map<String, dynamic> get lessonPreset => widget.preset;
  @override
  List<String> get modes => const ['hw', 'selection', 'dating', 'miller', 'inbreeding', 'breeding'];
  @override
  Map<String, Map<String, dynamic>> get presets => const {
    'Hardy–Weinberg': {'mode': 'hw'},
    'Selection against aa': {'mode': 'hw', 'select': true, 'gen': 5},
    'Peppered moths': {'mode': 'selection'},
    'Radioactive dating': {'mode': 'dating'},
    'Miller\'s experiment': {'mode': 'miller'},
    'Inbreeding': {'mode': 'inbreeding'},
    'Artificial selection': {'mode': 'breeding'},
  };
  @override
  Map<String, Object> defaults(String mode) => {'q': 0.4, 'gen': 0, 'select': false, 's': 10, 'p0': 1, 'industrial': true, 'half': 5730, 'left': 25, 'outcross': false, 'h2': 0.4, 'S': 10, 'mean': 100};

  static const _sub = '2nd PUC Biology · Evolution';

  @override
  Widget build(BuildContext context) => switch (mode) {
    'selection' => _selection(),
    'dating' => _dating(),
    'miller' => _miller(),
    'inbreeding' => _inbreeding(),
    'breeding' => _breeding(),
    _ => _hw(),
  };

  double _qAfter(double q0, int g, bool sel) {
    var q = q0;
    if (!sel) return q;
    for (var k = 0; k < g; k++) {
      q = q / (1 + q);
    }
    return q;
  }

  Widget _hw() {
    final q0 = n('q'), g = i('gen'), sel = b('select');
    final q = _qAfter(q0, g, sel), p = 1 - q;
    return frame(
      title: sel ? 'Hardy–Weinberg, then selection against aa' : 'Hardy–Weinberg equilibrium',
      subtitle: _sub,
      formula: 'p² + 2pq + q² = 1',
      readouts: [
        Readout('p (allele A)', f2(p), '', IX.accent),
        Readout('q (allele a)', f2(q), '', IX.amber),
        Readout('Carriers 2pq', '${f1(200 * p * q)}%', '', IX.green),
        Readout('Affected q²', '${f1(100 * q * q)}%', '', IX.positive),
      ],
      controls: [
        slider('q', 'Starting q (allele a)', 0.01, 0.99, dp: 2, div: 98),
        toggle('select', 'Remove aa before breeding', on: 'Yes', off: 'No'),
        slider('gen', 'Generation', 0, 20),
      ],
      painter: BioPainter((c, size) {
        // Population of 100 individuals coloured by genotype.
        final r = Rect.fromLTWH(40, 60, size.width * 0.42, size.height * 0.55);
        Bio.heading(c, 'A population of 100 (generation $g)', Offset(r.left, 24));
        final nAA = (100 * p * p).round(), nAa = (100 * 2 * p * q).round();
        for (var k = 0; k < 100; k++) {
          final cx = r.left + (k % 10 + 0.5) * r.width / 10, cy = r.top + (k ~/ 10 + 0.5) * r.height / 10;
          final col = k < nAA ? IX.accent : (k < nAA + nAa ? IX.green : IX.positive);
          Bio.soft(c, Path()..addOval(Rect.fromCircle(center: Offset(cx, cy), radius: math.min(r.width, r.height) / 26)), col, stroke: 1.2, shadow: false);
        }
        var ly = r.bottom + 30;
        for (final (nm, col) in [('AA', IX.accent), ('Aa carrier', IX.green), ('aa affected', IX.positive)]) {
          c.drawCircle(Offset(r.left + 12, ly), 10, Paint()..color = col);
          IxPaint.label(c, nm, Offset(r.left + 30, ly), size: 17, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
          ly += 32;
        }
        final bars = Plot(Rect.fromLTRB(size.width * 0.56, 90, size.width - 40, size.height * 0.46), -0.5, 2.5, 0, 1.05);
        bars.frame(c, xs: [], ys: [0, 0.5, 1], fy: (y) => f1(y), title: 'Genotype frequencies');
        bars.bars(c, [p * p, 2 * p * q, q * q], [IX.accent, IX.green, IX.positive], labels: const ['AA  p²', 'Aa  2pq', 'aa  q²'], fmt: f2);
        final plot = Plot(Rect.fromLTRB(size.width * 0.56, size.height * 0.60, size.width - 40, size.height - 70), 0, 20, 0, 1);
        plot.frame(c, xs: [0, 5, 10, 15, 20], ys: [0, 0.5, 1], fy: f1, xLabel: 'Generation', yLabel: 'q');
        plot.curve(c, (x) => q0, IX.muted, w: 2, dashed: true, label: 'no selection', labelX: 17);
        if (sel) plot.curve(c, (x) => _qAfter(q0, x.floor(), true), IX.amber, label: 'aa removed', labelX: 12);
        plot.dot(c, g.toDouble(), q, IX.amber);
      }),
    );
  }

  Widget _selection() {
    final s = n('s') / 100, p0 = n('p0') / 100;
    final ind = b('industrial');
    double share(double g) {
      final w = ind ? 1 + s : 1 - s * 0.6;
      final odds = p0 / (1 - p0) * math.pow(w, g);
      return odds / (1 + odds);
    }
    final now = share(50);
    return frame(
      title: 'Natural selection: peppered moths',
      subtitle: _sub,
      formula: 'share rises if fitness > 1',
      readouts: [
        Readout('Advantage', '${f0(s * 100)}%', 'per generation', IX.accent),
        Readout('Dark moths at start', '${f1(p0 * 100)}%', ''),
        Readout('After 50 generations', '${f0(now * 100)}%', '', const Color(0xFF3B4254)),
        Readout('Bark', ind ? 'Sooty (industrial)' : 'Lichen-covered', ''),
      ],
      controls: [
        toggle('industrial', 'Tree bark', on: 'Polluted, dark', off: 'Clean, light'),
        slider('s', 'Advantage per generation', 1, 40, unit: '%'),
        slider('p0', 'Starting share of dark moths', 1, 50, unit: '%'),
      ],
      painter: BioPainter((c, size) {
        // Bark with moths.
        final bark = Rect.fromLTWH(40, 40, size.width * 0.36, size.height - 80);
        c.drawRRect(RRect.fromRectAndRadius(bark, const Radius.circular(16)), Paint()..color = ind ? const Color(0xFF4A4642) : const Color(0xFFD9D4C5));
        final rnd = math.Random(4);
        for (var k = 0; k < 40; k++) {
          final x = bark.left + rnd.nextDouble() * bark.width;
          c.drawLine(Offset(x, bark.top), Offset(x + rnd.nextDouble() * 20 - 10, bark.bottom), Paint()..color = (ind ? Colors.black : const Color(0xFFB9B29C)).withValues(alpha: 0.3)..strokeWidth = 2 + rnd.nextDouble() * 3);
        }
        if (!ind) {
          for (var k = 0; k < 14; k++) {
            Bio.fill(c, Bio.blob(Offset(bark.left + rnd.nextDouble() * bark.width, bark.top + rnd.nextDouble() * bark.height), 26, 16, seed: k, wobble: 0.3), const Color(0xFFC5CFA8).withValues(alpha: 0.8));
          }
        }
        final dark = (12 * now).round();
        for (var k = 0; k < 12; k++) {
          final at = Offset(bark.left + 50 + (k % 3) * (bark.width - 100) / 2 + rnd.nextDouble() * 30, bark.top + 60 + (k ~/ 3) * (bark.height - 120) / 3);
          final isDark = k < dark;
          final col = isDark ? const Color(0xFF2B2826) : const Color(0xFFEDE8DA);
          for (final sd in [-1.0, 1.0]) {
            Bio.soft(c, Bio.blob(at + Offset(sd * 20, 0), 22, 14, seed: k, rot: sd * 0.3), col, stroke: 1.2, edge: isDark ? Colors.black : const Color(0xFF9A9580), shadow: false);
          }
          c.drawOval(Rect.fromCenter(center: at, width: 8, height: 26), Paint()..color = Bio.darken(col, 0.2));
        }
        final plot = Plot(Rect.fromLTRB(size.width * 0.50, 90, size.width - 40, size.height - 110), 0, 50, 0, 100);
        plot.frame(c, xs: [0, 10, 20, 30, 40, 50], ys: [0, 25, 50, 75, 100], xLabel: 'Generations', yLabel: 'Dark moths (%)', title: 'Share of the dark (melanic) form');
        plot.curve(c, (g) => 100 * share(g), const Color(0xFF3B4254));
        Bio.note(c, ind ? 'On soot-darkened trees, birds pick off the conspicuous light moths; dark moths survive and leave more offspring. Their share rises over generations — directional natural selection (England, 1850–1920).' : 'On clean, lichen-covered bark the light moths are camouflaged and dark ones are eaten more.', plot.r.bottomRight + const Offset(-10, -14), align: Alignment.bottomRight, maxWidth: 480, size: 17, color: IX.ink);
      }),
    );
  }

  Widget _dating() {
    final h = n('half'), left = n('left');
    final age = h * math.log(100 / left) / math.ln2;
    return frame(
      title: 'Dating a fossil',
      subtitle: _sub,
      formula: 'age = half-life × log₂(100 ÷ % left)',
      readouts: [
        Readout('Half-life', grp(h), 'years', IX.accent),
        Readout('Isotope left', f1(left), '%'),
        Readout('Half-lives passed', f2(math.log(100 / left) / math.ln2), ''),
        Readout('Age of fossil', grp(age), 'years', IX.green),
      ],
      controls: [
        slider('half', 'Half-life', 1000, 20000, unit: 'yr', div: 190, fmt: (x) => grp(x)),
        slider('left', 'Isotope left in fossil', 1, 100, unit: '%', dp: 1, div: 99),
        Padding(padding: const EdgeInsets.only(top: 4), child: Text('Carbon-14: half-life 5730 years, useful up to about 50 000 years.', style: IX.text(17, c: IX.inkSoft))),
      ],
      painter: BioPainter((c, size) {
        final plot = Plot(Rect.fromLTRB(110, 80, size.width - 60, size.height - 110), 0, 5 * h, 0, 105);
        plot.frame(c, xs: [for (var k = 0; k <= 5; k++) k * h], ys: [0, 25, 50, 75, 100], fx: (x) => grp(x), xLabel: 'Time (years)', yLabel: 'Isotope remaining (%)', title: 'Radioactive decay halves every half-life');
        for (var k = 1; k <= 4; k++) {
          final p = plot.pt(k * h, 100 / math.pow(2, k));
          c.drawLine(Offset(p.dx, plot.r.bottom), p, Paint()..color = IX.grid..strokeWidth = 2);
          IxPaint.label(c, '${f1(100 / math.pow(2, k))}%', p + const Offset(18, -14), size: 16, color: IX.inkSoft, w: FontWeight.w600, align: Alignment.centerLeft);
        }
        plot.curve(c, (t) => 100 * math.pow(0.5, t / h).toDouble(), IX.accent);
        plot.hline(c, left, IX.amber);
        plot.vline(c, math.min(age, 5 * h), IX.green, label: '${grp(age)} years');
        plot.dot(c, math.min(age, 5 * h), left, IX.green);
      }),
    );
  }

  Widget _miller() {
    return frame(
      title: 'Miller\'s experiment (1953)',
      subtitle: _sub,
      formula: 'CH₄ + NH₃ + H₂ + H₂O + spark → amino acids',
      readouts: const [
        Readout('Gases', 'CH₄, H₂, NH₃', '+ water vapour', IX.accent),
        Readout('Energy', 'Electric discharge', ''),
        Readout('Temperature', '800 °C', '(flask heated)'),
        Readout('After a week', 'Amino acids', '', IX.green),
      ],
      painter: BioPainter((c, size) {
        final k = math.min(size.width / 1300, size.height / 900);
        final o = Offset(size.width * 0.38, size.height * 0.5);
        Offset p(double x, double y) => o + Offset(x, y) * k;
        final glass = Paint()..color = IX.glassEdge..style = PaintingStyle.stroke..strokeWidth = 4;
        final tube = Paint()..color = IX.glassEdge..style = PaintingStyle.stroke..strokeWidth = 14..strokeCap = StrokeCap.round;
        final tubeIn = Paint()..color = const Color(0xFFF2F7FB)..style = PaintingStyle.stroke..strokeWidth = 8..strokeCap = StrokeCap.round;
        final loop = Path()..moveTo(p(-300, 200).dx, p(-300, 200).dy)..lineTo(p(-300, -230).dx, p(-300, -230).dy)..lineTo(p(240, -230).dx, p(240, -230).dy)..lineTo(p(240, -60).dx, p(240, -60).dy)..moveTo(p(240, 60).dx, p(240, 60).dy)..lineTo(p(240, 260).dx, p(240, 260).dy)..lineTo(p(-200, 260).dx, p(-200, 260).dy);
        c.drawPath(loop, tube);
        c.drawPath(loop, tubeIn);
        // Boiling flask with water.
        final bf = p(-300, 260);
        Bio.soft(c, Path()..addOval(Rect.fromCircle(center: bf, radius: 90 * k)), const Color(0xFFDCEAF6), stroke: 3, edge: IX.glassEdge);
        c.drawArc(Rect.fromCircle(center: bf, radius: 88 * k), 0.1, math.pi - 0.2, false, Paint()..color = BioC.water.withValues(alpha: 0.5));
        for (var j = 0; j < 5; j++) {
          final fx = bf + Offset((j - 2) * 22 * k, 120 * k);
          c.drawPath(Path()..moveTo(fx.dx - 8, fx.dy + 20)..quadraticBezierTo(fx.dx, fx.dy - 20, fx.dx + 8, fx.dy + 20)..close(), Paint()..color = const Color(0xFFE0A030));
        }
        // Spark chamber.
        final sc = p(240, 0);
        Bio.soft(c, Path()..addOval(Rect.fromCircle(center: sc, radius: 110 * k)), const Color(0xFFF4F1FA), stroke: 3, edge: IX.glassEdge);
        for (final sd in [-1.0, 1.0]) {
          c.drawLine(sc + Offset(sd * 150 * k, 0), sc + Offset(sd * 30 * k, 0), Paint()..color = const Color(0xFF59627E)..strokeWidth = 6);
        }
        final zig = Path()..moveTo(sc.dx - 30 * k, sc.dy);
        for (var j = 1; j <= 6; j++) {
          zig.lineTo(sc.dx - 30 * k + j * 10 * k, sc.dy + (j.isOdd ? -14 : 14) * k);
        }
        Bio.stroke(c, zig, const Color(0xFFE0A030), 3);
        // Condenser.
        final cd = Rect.fromCenter(center: p(0, 260), width: 220 * k, height: 60 * k);
        c.drawRRect(RRect.fromRectAndRadius(cd, Radius.circular(20 * k)), Paint()..color = const Color(0xFFE2F0F8));
        c.drawRRect(RRect.fromRectAndRadius(cd, Radius.circular(20 * k)), glass);
        // Trap with brown liquid.
        final tr = p(-200, 300);
        c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: tr, width: 50 * k, height: 90 * k), Radius.circular(20 * k)), Paint()..color = const Color(0xFFC9A66B));
        final parts = [
          BioPart('w', 'Boiling water (ocean)', bf),
          BioPart('s', 'Spark chamber: CH₄, NH₃, H₂', sc + Offset(0, -60 * k)),
          BioPart('e', 'Electrodes (lightning)', sc + Offset(130 * k, 0)),
          BioPart('c', 'Condenser (cooling: rain)', cd.center),
          BioPart('t', 'Trap: amino acids collect', tr),
        ];
        drawLabels(c, parts, layoutLabels(parts, midX: o.dx - 50 * k, leftX: o.dx - 420 * k, rightX: o.dx + 400 * k, top: 40, bottom: size.height - 40), null);
        Bio.note(c, 'S. L. Miller recreated Oparin and Haldane\'s early-Earth conditions in a closed flask and found simple amino acids formed — evidence for chemical evolution before life. Others later obtained sugars, nitrogen bases, pigments and fats.', Offset(size.width - 30, size.height - 30), align: Alignment.bottomRight, maxWidth: size.width * 0.3, size: 17, color: IX.ink);
      }),
    );
  }

  Widget _inbreeding() {
    final g = i('gen').clamp(0, 10), out = b('outcross');
    final h = out ? 0.5 : 0.5 * math.pow(0.5, g).toDouble();
    return frame(
      title: 'Inbreeding and heterozygosity',
      subtitle: '2nd PUC Biology · Food production; Sexual reproduction in flowering plants',
      formula: 'selfing halves heterozygosity each generation',
      readouts: [
        Readout('Generations of selfing', '$g', '', IX.accent),
        Readout('Heterozygous plants', '${f1(h * 100)}%', '', IX.green),
        Readout('Homozygous', '${f1((1 - h) * 100)}%', '', IX.amber),
        Readout('Inbreeding depression', g > 3 && !out ? 'Likely' : 'Low', '', g > 3 && !out ? IX.positive : IX.ink),
      ],
      controls: [
        slider('gen', 'Generations of selfing / saved seed', 0, 10),
        toggle('outcross', 'Out-cross once', on: 'Yes', off: 'No'),
      ],
      painter: BioPainter((c, size) {
        final plot = Plot(Rect.fromLTRB(110, 90, size.width * 0.6, size.height - 110), 0, 10, 0, 55);
        plot.frame(c, xs: [0, 2, 4, 6, 8, 10], ys: [0, 12.5, 25, 37.5, 50], xLabel: 'Generations of selfing', yLabel: 'Heterozygous (%)', title: 'Heterozygosity falls by half each generation');
        for (var k = 0; k <= 10; k++) {
          final v = 50 * math.pow(0.5, k).toDouble();
          final top = plot.pt(k - 0.3, v), bot = plot.pt(k + 0.3, 0);
          c.drawRRect(RRect.fromRectAndCorners(Rect.fromLTRB(top.dx, top.dy, bot.dx, bot.dy), topLeft: const Radius.circular(4), topRight: const Radius.circular(4)), Paint()..color = k == g ? IX.green : IX.green.withValues(alpha: 0.3));
        }
        if (out) plot.dot(c, g.toDouble(), 50, IX.accent, label: 'out-cross restores');
        // Field of plants, stunted ones homozygous recessive.
        final fx = size.width * 0.66;
        final rnd = math.Random(3);
        final weak = ((1 - h * 2) * 0.25 * 30).round();
        for (var k = 0; k < 30; k++) {
          final at = Offset(fx + (k % 6) * 66.0, 120 + (k ~/ 6) * 120.0);
          final small = rnd.nextInt(30) < weak && !out;
          final hh = small ? 50.0 : 90.0;
          c.drawLine(at + const Offset(0, 50), at + Offset(0, 50 - hh), Paint()..color = const Color(0xFF6E8B3D)..strokeWidth = 3);
          for (var j = 0; j < 3; j++) {
            Bio.fill(c, Bio.blob(at + Offset(j.isEven ? -10 : 10, 40 - hh * (j + 1) / 4), small ? 9 : 14, 5, seed: j, rot: j.isEven ? 0.4 : -0.4), small ? const Color(0xFFB7B36A) : BioC.leaf);
          }
        }
        Bio.note(c, 'Hybrid (F₁) seed is heterozygous and high-yielding. Seed saved from it segregates, so heterozygosity halves every generation and harmful recessive alleles show up. Apomixis would fix the hybrid: seed without fertilisation keeps the F₁ genotype.', Offset(fx, size.height - 24), align: Alignment.bottomLeft, maxWidth: size.width - fx - 30, size: 17, color: IX.ink);
      }),
    );
  }

  Widget _breeding() {
    final h2 = n('h2'), sd = n('S'), g = i('gen').clamp(0, 10), m0 = n('mean');
    final r = h2 * sd;
    return frame(
      title: 'Selection over generations',
      subtitle: '2nd PUC Biology · Strategies for enhancement in food production',
      formula: 'response R = h² × S',
      readouts: [
        Readout('Heritability h²', f2(h2), '', IX.accent),
        Readout('Selection differential S', f1(sd), 'units'),
        Readout('Gain per generation', f1(r), 'units', IX.green),
        Readout('Mean after $g', f1(m0 + g * r), 'units'),
      ],
      controls: [
        slider('h2', 'Heritability h²', 0, 1, dp: 2, div: 100),
        slider('S', 'Selection differential S', 0, 30, dp: 1, div: 60),
        slider('gen', 'Generation', 0, 10),
      ],
      painter: BioPainter((c, size) {
        final mean = m0 + g * r;
        final plot = Plot(Rect.fromLTRB(110, 90, size.width * 0.58, size.height - 110), mean - 50, mean + 60, 0, 1.15);
        plot.frame(c, xs: [for (var x = ((mean - 50) / 10).ceil() * 10.0; x <= mean + 60; x += 20) x], ys: [], xLabel: 'Trait value (e.g. grain yield)', title: 'Population, selected parents and offspring');
        double gauss(double x, double mu) => math.exp(-math.pow((x - mu) / 15, 2) / 2);
        plot.curve(c, (x) => gauss(x, mean), IX.muted, label: 'this generation', labelX: mean - 30);
        plot.curve(c, (x) => gauss(x, mean + sd) * 0.5, IX.amber, label: 'selected parents', labelX: mean + sd + 18);
        plot.curve(c, (x) => gauss(x, mean + r), IX.green, w: 3, dashed: true, label: 'offspring', labelX: mean + r + 10);
        plot.vline(c, mean, IX.muted);
        plot.vline(c, mean + sd, IX.amber, label: 'S');
        plot.vline(c, mean + r, IX.green, label: 'R');
        final p2 = Plot(Rect.fromLTRB(size.width * 0.66, 90, size.width - 40, size.height - 110), 0, 10, m0, m0 + math.max(10 * r, 20));
        p2.frame(c, xs: [0, 5, 10], ys: [m0, m0 + math.max(10 * r, 20)], fy: f0, xLabel: 'Generation', yLabel: 'Mean', title: 'Mean rises steadily');
        p2.curve(c, (x) => m0 + x.floor() * r, IX.green);
        p2.dot(c, g.toDouble(), m0 + g * r, IX.green);
      }),
    );
  }
}
