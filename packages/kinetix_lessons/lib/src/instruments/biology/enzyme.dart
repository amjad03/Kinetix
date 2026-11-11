import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bio_kit.dart';

/// Biomolecules and enzymes (1st PUC Biology ch. 9; digestion ch. 22): cell composition, an
/// amino acid across pH, building a polypeptide, the activation-energy hill, enzyme activity
/// with temperature and pH, and Michaelis–Menten kinetics with competitive and
/// non-competitive inhibitors.
///
/// Preset: {"mode": "kinetics"|"energy"|"temperature"|"ph"|"aminoacid"|"polypeptide"|"composition",
/// "S": 20, "vmax": 100, "km": 10, "I": 0, "inhibitor": "competitive", "ea": 75, "dg": -30,
/// "lower": 30, "enzymeOn": true, "T": 37, "pH": 7, "enzyme": "all", "n": 51, "water": 70,
/// "protein": 15}.
class EnzymeInstrument extends StatefulWidget {
  const EnzymeInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<EnzymeInstrument> createState() => _EnzymeState();
}

class _EnzymeState extends BioState<EnzymeInstrument> {
  @override
  String get instrumentId => 'bio-enzyme';
  @override
  Map<String, dynamic> get lessonPreset => widget.preset;
  @override
  List<String> get modes => const ['kinetics', 'energy', 'temperature', 'ph', 'aminoacid', 'polypeptide', 'composition'];
  @override
  Map<String, Map<String, dynamic>> get presets => const {
    'Michaelis–Menten': {'mode': 'kinetics'},
    'Competitive inhibitor': {'mode': 'kinetics', 'I': 2, 'inhibitor': 'competitive'},
    'Non-competitive': {'mode': 'kinetics', 'I': 2, 'inhibitor': 'noncompetitive'},
    'Activation energy': {'mode': 'energy'},
    'Temperature': {'mode': 'temperature'},
    'pH and digestive enzymes': {'mode': 'ph'},
    'Amino acid and pH': {'mode': 'aminoacid'},
    'Polypeptide': {'mode': 'polypeptide'},
    'Cell composition': {'mode': 'composition'},
  };
  @override
  Map<String, Object> defaults(String mode) => {
    'S': 20, 'vmax': 100, 'km': 10, 'I': 0, 'inhibitor': 'competitive', 'ea': 75, 'dg': -30, 'lower': 30, 'enzymeOn': true,
    'T': 37, 'pH': mode == 'aminoacid' ? 6 : 7, 'enzyme': 'all', 'n': 51, 'water': 70, 'protein': 15,
  };

  @override
  Widget build(BuildContext context) => switch (mode) {
    'energy' => _energy(),
    'temperature' => _temp(),
    'ph' => _ph(),
    'aminoacid' => _amino(),
    'polypeptide' => _peptide(),
    'composition' => _composition(),
    _ => _kinetics(),
  };

  static const _sub = '1st PUC Biology · Biomolecules';

  /// An enzyme: a folded protein with an active-site notch at the top.
  static Path enzymeShape(Offset c, double r, {double open = 1, int seed = 3}) {
    final body = Bio.blob(c, r * 1.15, r, seed: seed, wobble: 0.05);
    final notch = Path()..addRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: c + Offset(0, -r * 0.92), width: r * 0.62 * open, height: r * 0.64), Radius.circular(r * 0.18)));
    return Path.combine(PathOperation.difference, body, notch);
  }

  // ------------------------------------------------------------------ kinetics

  Widget _kinetics() {
    final sv = n('S'), vm = n('vmax'), km = n('km'), ii = n('I');
    final comp = str('inhibitor') == 'competitive';
    final kmA = comp ? km * (1 + ii) : km, vmA = comp ? vm : vm / (1 + ii);
    double v0(double x) => vm * x / (km + x);
    double vi(double x) => vmA * x / (kmA + x);
    return frame(
      title: ii > 0 ? (comp ? 'A competitive inhibitor' : 'A non-competitive inhibitor') : 'Enzyme rate and substrate',
      subtitle: _sub,
      formula: 'V = Vmax·[S] ÷ (Km + [S])',
      readouts: [
        Readout('Rate, no inhibitor', f1(v0(sv)), '% max', IX.accent),
        Readout('Rate with inhibitor', f1(vi(sv)), '% max', IX.positive),
        Readout('Apparent Km', f1(kmA), 'mM'),
        Readout('Apparent Vmax', f0(vmA), '%', IX.green),
      ],
      controls: [
        slider('S', 'Substrate concentration [S]', 0, 100, unit: 'mM'),
        slider('km', 'Km (substrate for half Vmax)', 2, 30, unit: 'mM'),
        slider('I', 'Inhibitor strength [I]/Ki', 0, 5, dp: 1, div: 50),
        choice('inhibitor', 'Inhibitor binds', const {'competitive': 'Active site (competitive)', 'noncompetitive': 'Elsewhere'}),
      ],
      painter: BioPainter((c, size) {
        final plot = Plot(Rect.fromLTRB(110, 80, size.width * 0.55, size.height - 100), 0, 100, 0, 110);
        plot.frame(c, xs: [0, 20, 40, 60, 80, 100], ys: [0, 25, 50, 75, 100], xLabel: 'Substrate concentration [S] (mM)', yLabel: 'Velocity (% of Vmax)', title: 'Rate rises, then levels off at Vmax');
        plot.hline(c, vm, IX.accent.withValues(alpha: 0.5), label: 'Vmax');
        plot.hline(c, vm / 2, IX.muted, label: '½ Vmax');
        plot.curve(c, v0, IX.accent, label: 'no inhibitor', labelX: 70);
        if (ii > 0) plot.curve(c, vi, IX.positive, label: comp ? 'competitive' : 'non-competitive', labelX: comp ? 30 : 85);
        plot.vline(c, km, IX.accent.withValues(alpha: 0.6), label: 'Km');
        plot.dot(c, sv, v0(sv), IX.accent);
        if (ii > 0) plot.dot(c, sv, vi(sv), IX.positive);
        // Illustration: enzyme, substrate, inhibitor.
        final ec = Offset(size.width * 0.80, size.height * 0.40);
        final er = math.min(size.width * 0.11, 120.0);
        final enz = enzymeShape(ec, er);
        Bio.soft(c, enz, const Color(0xFF7FA7D9), stroke: 2.5);
        IxPaint.label(c, 'Enzyme', ec + Offset(0, er * 0.2), size: 19, color: IX.ink, w: FontWeight.w700);
        final site = ec + Offset(0, -er * 0.78);
        final occupiedByI = ii > 0 && comp && ii / (ii + 1 + sv / km) > 0.4;
        Path piece(Offset at, double w) => Path()..addRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: at, width: w, height: er * 0.55), Radius.circular(er * 0.16)));
        if (occupiedByI) {
          Bio.soft(c, piece(site, er * 0.56), IX.positive, stroke: 2);
          Bio.soft(c, piece(site + Offset(-er * 1.3, -er * 0.9), er * 0.56), BioC.sugar, stroke: 2);
          Bio.leader(c, site, site + Offset(er * 0.6, -er * 1.0), 'Inhibitor in site');
          Bio.leader(c, site + Offset(-er * 1.3, -er * 0.9), site + Offset(-er * 1.6, -er * 0.3), 'Substrate shut out');
        } else {
          Bio.soft(c, piece(site, er * 0.56), BioC.sugar, stroke: 2);
          Bio.leader(c, site, site + Offset(-er * 0.9, -er * 0.9), 'Substrate (ES complex)');
          if (ii > 0) {
            final al = ec + Offset(er * 1.05, er * 0.3);
            Bio.soft(c, Path()..addOval(Rect.fromCircle(center: al, radius: er * 0.24)), IX.positive, stroke: 2);
            Bio.leader(c, al, al + Offset(-er * 0.4, er * 1.1), comp ? 'Inhibitor nearby' : 'Inhibitor, other site');
          }
        }
        Bio.note(c, comp
            ? 'A competitive inhibitor looks like the substrate and competes for the active site — e.g. malonate inhibits succinic dehydrogenase. More substrate wins back the rate: Vmax unchanged, Km rises.'
            : 'A non-competitive inhibitor binds away from the active site and changes the enzyme. Extra substrate cannot overcome it: Vmax falls, Km unchanged.',
            Offset(size.width * 0.60, size.height * 0.66), maxWidth: size.width * 0.38, size: 18, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ energy

  Widget _energy() {
    final ea = n('ea'), dg = n('dg'), low = n('lower');
    final on = b('enzymeOn');
    final eaE = math.max(ea - low, 5.0);
    final factor = math.pow(10, (ea - eaE) / 5.9).toDouble();
    return frame(
      title: 'Enzymes lower the activation energy',
      subtitle: _sub,
      formula: '×10 faster per 5.9 kJ/mol at 37 °C',
      readouts: [
        Readout('Ea without enzyme', f0(ea), 'kJ/mol', IX.positive),
        Readout('Ea with enzyme', on ? f0(eaE) : '—', 'kJ/mol', IX.accent),
        Readout('ΔG (product − substrate)', f0(dg), 'kJ/mol'),
        Readout('Speed-up', on ? sci(factor) : '1', '×', IX.green),
      ],
      controls: [
        toggle('enzymeOn', 'Enzyme'),
        slider('ea', 'Activation energy without enzyme', 30, 120, unit: 'kJ/mol'),
        slider('lower', 'Lowering by the enzyme', 0, 60, unit: 'kJ/mol'),
        slider('dg', 'Product minus substrate energy', -60, 30, unit: 'kJ/mol'),
      ],
      painter: BioPainter((c, size) {
        final plot = Plot(Rect.fromLTRB(120, 90, size.width - 80, size.height - 110), 0, 10, -70, 130);
        plot.frame(c, xs: [], ys: [-60, -30, 0, 30, 60, 90, 120], xLabel: 'Progress of reaction →', yLabel: 'Energy (kJ/mol)', title: 'The energy hill');
        double hill(double x, double top) => dg / (1 + math.exp(-(x - 5) * 1.8)) + (top - dg / 2) * math.exp(-math.pow((x - 5) / 1.3, 2));
        plot.curve(c, (x) => hill(x, ea), IX.positive, label: 'without enzyme', labelX: 5.6);
        if (on) plot.curve(c, (x) => hill(x, eaE), IX.accent, label: 'with enzyme', labelX: 6.3);
        final s0 = plot.pt(0.6, 0), p0 = plot.pt(9.4, dg);
        Bio.tag(c, 'Substrate S', s0 + const Offset(30, -26), BioC.sugar);
        Bio.tag(c, 'Product P', p0 + const Offset(-30, -26), IX.green);
        final top = plot.pt(5, hill(5, ea)), topE = plot.pt(5, hill(5, eaE));
        final base = plot.pt(5, 0);
        IxPaint.arrow(c, base + const Offset(-60, 0), Offset(base.dx - 60, top.dy + 4), IX.positive, width: 3);
        IxPaint.label(c, 'Ea ${f0(ea)}', Offset(base.dx - 72, (base.dy + top.dy) / 2), size: 18, color: IX.positive, w: FontWeight.w700, align: Alignment.centerRight, halo: true);
        if (on) {
          IxPaint.arrow(c, base + const Offset(60, 0), Offset(base.dx + 60, topE.dy + 4), IX.accent, width: 3);
          IxPaint.label(c, 'Ea ${f0(eaE)}', Offset(base.dx + 72, (base.dy + topE.dy) / 2), size: 18, color: IX.accent, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
        }
        IxPaint.dashed(c, plot.pt(0, 0), plot.pt(10, 0), Paint()..color = IX.muted..strokeWidth = 1.5);
        Bio.note(c, dg < 0 ? 'Exothermic: products have less energy. The enzyme does not change ΔG, only the hill.' : 'Endothermic: products have more energy. The enzyme does not change ΔG, only the hill.', plot.r.bottomRight + const Offset(0, -16), align: Alignment.bottomRight, maxWidth: 520, size: 18, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ temperature

  static double activityT(double t) {
    final rise = math.pow(2, (t - 40) / 10).toDouble();
    final denat = 1 / (1 + math.exp((t - 46) / 3));
    return 100 * rise * denat / _tMax;
  }

  static final double _tMax = () {
    var m = 0.0;
    for (var t = 0.0; t <= 70; t += 0.1) {
      m = math.max(m, math.pow(2, (t - 40) / 10) / (1 + math.exp((t - 46) / 3)));
    }
    return m;
  }();

  Widget _temp() {
    final t = n('T');
    final a = activityT(t).clamp(0.0, 100.0);
    final state = t < 15 ? 'Inactive (reversibly)' : (t <= 45 ? 'Active' : 'Denatured');
    return frame(
      title: 'Enzyme activity and temperature',
      subtitle: _sub,
      formula: 'rate ≈ ×2 per 10 °C up to the optimum',
      readouts: [
        Readout('Temperature', f0(t), '°C', IX.accent),
        Readout('Activity', f0(a), '% of max', IX.green),
        Readout('Optimum', '≈ 40', '°C'),
        Readout('Enzyme', state, '', t > 45 ? IX.positive : IX.ink),
      ],
      controls: [slider('T', 'Temperature', 0, 70, unit: '°C')],
      painter: BioPainter((c, size) {
        final plot = Plot(Rect.fromLTRB(110, 90, size.width * 0.62, size.height - 100), 0, 70, 0, 110);
        plot.frame(c, xs: [0, 10, 20, 30, 40, 50, 60, 70], ys: [0, 25, 50, 75, 100], xLabel: 'Temperature (°C)', yLabel: 'Enzyme activity (%)', title: 'Rises to an optimum, then falls sharply');
        plot.curve(c, (x) => activityT(x).clamp(0, 100), IX.accent);
        plot.vline(c, 40, IX.green, label: 'optimum');
        plot.dot(c, t, a, IX.accent);
        final ec = Offset(size.width * 0.82, size.height * 0.40);
        final er = math.min(size.width * 0.1, 110.0);
        if (t > 45) {
          final rnd = math.Random(4);
          final pts = [for (var k = 0; k < 14; k++) ec + Offset(math.cos(k * 0.9) * er * (0.5 + rnd.nextDouble() * 0.8), math.sin(k * 1.3) * er * (0.4 + rnd.nextDouble() * 0.6))];
          Bio.stroke(c, Bio.smooth(pts, closed: false), const Color(0xFF7FA7D9), 10);
          IxPaint.label(c, 'Unfolded: active site lost', ec + Offset(0, er * 1.4), size: 18, color: IX.positive, w: FontWeight.w700);
        } else {
          Bio.soft(c, enzymeShape(ec, er), const Color(0xFF7FA7D9), stroke: 2.5);
          IxPaint.label(c, t < 15 ? 'Slow: few collisions' : 'Folded: active site intact', ec + Offset(0, er * 1.4), size: 18, color: IX.ink, w: FontWeight.w700);
        }
        Bio.note(c, 'Low temperature preserves an enzyme in a temporarily inactive state; high temperature destroys its activity because the protein is denatured by heat. Enzymes of thermophiles stay active at 80–90 °C.', Offset(size.width * 0.66, size.height * 0.62), maxWidth: size.width * 0.32, size: 18, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ pH

  static const _enzymes = [
    ('Pepsin (stomach)', 2.0, 1.2, Color(0xFFC2410C)),
    ('Salivary amylase (mouth)', 6.8, 1.3, Color(0xFF1D4ED8)),
    ('Trypsin (small intestine)', 8.0, 1.4, Color(0xFF15803D)),
  ];

  Widget _ph() {
    final ph = n('pH');
    double act(double p, double opt, double w) => 100 * math.exp(-math.pow((p - opt) / w, 2));
    return frame(
      title: 'Each enzyme has its own optimum pH',
      subtitle: '1st PUC Biology · Biomolecules; Digestion and absorption',
      formula: 'activity peaks at the optimum pH',
      readouts: [
        Readout('pH', f1(ph), '', IX.accent),
        for (final (name, opt, w, col) in _enzymes) Readout(name.split(' (').first, f0(act(ph, opt, w)), '%', col),
      ],
      controls: [slider('pH', 'pH', 0, 12, dp: 1, div: 120)],
      painter: BioPainter((c, size) {
        final plot = Plot(Rect.fromLTRB(110, 90, size.width - 60, size.height * 0.68), 0, 12, 0, 110);
        // pH colour band.
        for (var k = 0; k < 120; k++) {
          final x = k / 10;
          final col = HSVColor.fromAHSV(1, (x / 12 * 260).clamp(0, 260), 0.35, 1).toColor();
          final a = plot.pt(x, 0), b2 = plot.pt(x + 0.1, 0);
          c.drawRect(Rect.fromLTRB(a.dx, a.dy + 50, b2.dx + 0.5, a.dy + 64), Paint()..color = col);
        }
        plot.frame(c, xs: [0, 2, 4, 6, 8, 10, 12], ys: [0, 25, 50, 75, 100], yLabel: 'Activity (%)', title: 'Activity across pH');
        IxPaint.label(c, 'pH', plot.r.bottomCenter + const Offset(0, 84), size: 17, color: IX.inkSoft, w: FontWeight.w600);
        for (final (name, opt, w, col) in _enzymes) {
          plot.curve(c, (x) => act(x, opt, w), col);
          IxPaint.label(c, '${name.split(' (').first} · pH ${opt.toStringAsFixed(1)}', plot.pt(opt + (opt > 7.5 ? 1.0 : (opt > 5 ? -1.0 : 0)), 104), size: 17, color: col, w: FontWeight.w700, halo: true);
        }
        plot.vline(c, ph, IX.ink);
        // Gut regions along the bottom.
        final y = size.height * 0.84;
        final regions = [('Mouth · saliva pH 6.8', 6.8), ('Stomach · HCl, pH 1.8', 1.8), ('Small intestine · pH 7.8', 7.8)];
        for (var k = 0; k < 3; k++) {
          final r = Rect.fromLTWH(60 + k * (size.width - 120) / 3, y - 40, (size.width - 120) / 3 - 20, 80);
          final near = (regions[k].$2 - ph).abs() < 0.8;
          Bio.box(c, r, regions[k].$1, color: near ? IX.accent : IX.muted, size: 19, filled: near);
        }
      }),
    );
  }

  // ------------------------------------------------------------------ amino acid

  Widget _amino() {
    final ph = n('pH');
    const pk1 = 2.3, pk2 = 9.6;
    final form = ph < pk1 ? 0 : (ph < pk2 ? 1 : 2);
    final charge = 1 / (1 + math.pow(10, ph - pk1)) - 1 / (1 + math.pow(10, pk2 - ph));
    return frame(
      title: 'An amino acid changes with pH',
      subtitle: _sub,
      formula: 'H₃N⁺–CHR–COO⁻ (zwitterion)',
      readouts: [
        Readout('pH', f1(ph), '', IX.accent),
        Readout('Form', ['Cation', 'Zwitterion', 'Anion'][form], '', [IX.positive, IX.green, IX.negative][form]),
        Readout('Net charge', (charge >= 0 ? '+' : '−') + charge.abs().toStringAsFixed(2), ''),
        Readout('Isoelectric pH (glycine)', '≈ 6.0', ''),
      ],
      controls: [slider('pH', 'pH', 0, 14, dp: 1, div: 140)],
      painter: BioPainter((c, size) {
        final labels = ['Low pH: cation', 'Neutral pH: zwitterion', 'High pH: anion'];
        final amino = ['H₃N⁺', 'H₃N⁺', 'H₂N'];
        final carb = ['COOH', 'COO⁻', 'COO⁻'];
        final w = (size.width - 120) / 3;
        for (var k = 0; k < 3; k++) {
          final r = Rect.fromLTWH(40 + k * (w + 20), 60, w, size.height * 0.52);
          final on = k == form;
          Bio.card(c, r, fill: on ? const Color(0xFFF5F8FF) : IX.paper, edge: on ? IX.accent : IX.rule);
          Bio.heading(c, labels[k], r.topLeft + const Offset(22, 18), size: 21, color: on ? IX.accent : IX.inkSoft);
          final cc = r.center + const Offset(0, 20);
          final txt = on ? IX.ink : IX.muted;
          IxPaint.label(c, 'C', cc, size: 34, color: txt, w: FontWeight.w700);
          final bond = Paint()..color = txt..strokeWidth = 3;
          c.drawLine(cc + const Offset(-20, 0), cc + const Offset(-70, 0), bond);
          c.drawLine(cc + const Offset(20, 0), cc + const Offset(70, 0), bond);
          c.drawLine(cc + const Offset(0, -24), cc + const Offset(0, -64), bond);
          c.drawLine(cc + const Offset(0, 24), cc + const Offset(0, 64), bond);
          IxPaint.label(c, amino[k], cc + const Offset(-76, 0), size: 28, color: on && k < 2 ? IX.positive : txt, w: FontWeight.w700, align: Alignment.centerRight);
          IxPaint.label(c, carb[k], cc + const Offset(76, 0), size: 28, color: on && k > 0 ? IX.negative : txt, w: FontWeight.w700, align: Alignment.centerLeft);
          IxPaint.label(c, 'H', cc + const Offset(0, -82), size: 28, color: txt, w: FontWeight.w700);
          IxPaint.label(c, 'R', cc + const Offset(0, 82), size: 28, color: on ? IX.green : txt, w: FontWeight.w700);
        }
        final plot = Plot(Rect.fromLTRB(110, size.height * 0.70, size.width - 60, size.height - 80), 0, 14, -1, 1);
        plot.frame(c, xs: [0, 2, 4, 6, 8, 10, 12, 14], ys: [-1, 0, 1], xLabel: 'pH', yLabel: 'Charge', fy: (y) => y > 0 ? '+1' : (y < 0 ? '−1' : '0'));
        plot.curve(c, (x) => 1 / (1 + math.pow(10, x - pk1)) - 1 / (1 + math.pow(10, pk2 - x)), IX.accent);
        plot.dot(c, ph, charge.toDouble(), IX.accent);
      }),
    );
  }

  // ------------------------------------------------------------------ polypeptide

  Widget _peptide() {
    final nn = i('n').clamp(2, 200);
    final seqs = nn * math.log(20) / math.ln10;
    return frame(
      title: 'Building a polypeptide',
      subtitle: _sub,
      formula: 'n amino acids → n − 1 peptide bonds',
      readouts: [
        Readout('Amino acids', '$nn', '', IX.accent),
        Readout('Peptide bonds', '${nn - 1}', '', IX.green),
        Readout('Water released', '${nn - 1}', 'H₂O', IX.negative),
        Readout('Possible sequences', '20^$nn ≈ 10^${seqs.toStringAsFixed(0)}', ''),
      ],
      controls: [
        slider('n', 'Number of amino acids', 2, 120),
        Padding(padding: const EdgeInsets.only(top: 4), child: Text('Insulin: 51 amino acids in two chains (A 21 + B 30), held by disulphide bridges.', style: IX.text(17, c: IX.inkSoft))),
      ],
      painter: BioPainter((c, size) {
        final shown = math.min(nn, 30);
        final pal = [const Color(0xFFD9824B), const Color(0xFF7FA7D9), const Color(0xFF8C6BB1), const Color(0xFF5F9E3A), const Color(0xFFE0A030), const Color(0xFFC0504D)];
        final pts = <Offset>[];
        final cols = 10;
        final dx = (size.width - 200) / (cols - 1);
        for (var k = 0; k < shown; k++) {
          final row = k ~/ cols, col = row.isEven ? k % cols : cols - 1 - k % cols;
          pts.add(Offset(100 + col * dx, 120 + row * 150.0 + math.sin(k * 1.1) * 14));
        }
        if (pts.length > 1) Bio.stroke(c, Bio.smooth(pts, closed: false), IX.inkSoft, 4);
        final rnd = math.Random(3);
        for (var k = 0; k < shown; k++) {
          final col = pal[rnd.nextInt(pal.length)];
          Bio.soft(c, Path()..addOval(Rect.fromCircle(center: pts[k], radius: 30)), col, stroke: 2);
          IxPaint.label(c, '${k + 1}', pts[k], size: 17, color: Colors.white, w: FontWeight.w700);
        }
        if (shown >= 2) {
          final mid = (pts[0] + pts[1]) / 2;
          Bio.leader(c, mid, mid + const Offset(40, -60), 'Peptide bond (–CO–NH–)');
          Bio.tag(c, 'H₂O released', mid + const Offset(0, 54), IX.negative);
        }
        Bio.note(c, '${nn > shown ? 'First $shown of $nn shown. ' : ''}N-terminal amino acid on the left (1), C-terminal at the end. Each bond forms by dehydration: the –COOH of one amino acid joins the –NH₂ of the next and a molecule of water leaves.', Offset(60, size.height - 40), align: Alignment.bottomLeft, maxWidth: size.width - 120, size: 18, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ composition

  Widget _composition() {
    final water = n('water'), prot = n('protein');
    final rest = 100 - water - prot;
    // Others in the NCERT ratio: carbohydrate 3, lipid 2, nucleic acid 5–7 (6), ions 1.
    final others = [('Carbohydrates', 3.0), ('Lipids', 2.0), ('Nucleic acids', 6.0), ('Ions', 1.0)];
    final k = math.max(rest, 0) / 12;
    final parts = [('Water', water, BioC.water), ('Proteins', prot, const Color(0xFFC0504D)), for (final (nm, x) in others) (nm, x * k, {'Carbohydrates': BioC.sugar, 'Lipids': const Color(0xFFD9B36A), 'Nucleic acids': BioC.nucleus, 'Ions': IX.muted}[nm]!)];
    final dry = 100 - water;
    return frame(
      title: 'What a cell is made of',
      subtitle: _sub,
      formula: 'water 70–90% of a cell',
      readouts: [
        Readout('Water', f0(water), '%', BioC.water),
        Readout('Proteins', f0(prot), '%', const Color(0xFFC0504D)),
        Readout('Dry matter', f0(dry), '%'),
        Readout('Protein in dry matter', f0(100 * prot / math.max(dry, 1)), '%', IX.green),
      ],
      controls: [
        slider('water', 'Water', 60, 90, unit: '%'),
        slider('protein', 'Proteins', 5, 25, unit: '%'),
      ],
      painter: BioPainter((c, size) {
        final ctr = Offset(size.width * 0.3, size.height * 0.5);
        final R = math.min(size.width * 0.22, size.height * 0.36);
        var a = -math.pi / 2;
        final tot = parts.fold<double>(0, (s, p) => s + p.$2);
        for (final (_, x, col) in parts) {
          final sw = 2 * math.pi * x / tot;
          if (sw <= 0) continue;
          final path = Path()..moveTo(ctr.dx, ctr.dy)..arcTo(Rect.fromCircle(center: ctr, radius: R), a, sw, false)..close();
          Bio.soft(c, path, col, stroke: 2.5, edge: Colors.white, shadow: false, light: 0.25);
          if (x > 4) {
            final m = a + sw / 2;
            IxPaint.label(c, '${f0(x)}%', ctr + Offset(math.cos(m), math.sin(m)) * R * 0.66, size: 20, color: Colors.white, w: FontWeight.w700);
          }
          a += sw;
        }
        var y = size.height * 0.2;
        for (final (name, x, col) in parts) {
          c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(size.width * 0.62, y - 12, 24, 24), const Radius.circular(6)), Paint()..color = col);
          IxPaint.label(c, name, Offset(size.width * 0.62 + 40, y), size: 21, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
          IxPaint.label(c, '${x < 10 ? f1(x) : f0(x)}%', Offset(size.width - 60, y), size: 21, color: IX.ink, w: FontWeight.w700, align: Alignment.centerRight);
          y += 64;
        }
        Bio.note(c, 'Average composition of cells by weight (NCERT). Among the dry matter, proteins are the largest share.', Offset(size.width * 0.62, y + 10), maxWidth: size.width * 0.34, size: 18, color: IX.inkSoft);
      }),
    );
  }
}
