import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bio_kit.dart';

/// Diversity, form and growth (1st PUC Biology ch. 1–5, 13, 22): names and the taxonomic
/// hierarchy, two versus five kingdoms, algae and light with depth, gametes and spores, wind
/// pollination in pine, animal body plans, growth by moulting, plant growth curves, stem and
/// fruit morphology, plant growth regulators, and the alimentary canal with its villi.
///
/// Preset: {"mode": "taxonomy"|"kingdoms"|"algae"|"lifecycle"|"pollen"|"bodyplan"|"moult"|
/// "growth"|"morphology"|"regulators"|"gut", "org": "man", "rank": 1, "who": "euglena",
/// "system": "five", "depth": 0, "gamy": "iso", "spores": "homo", "wind": 2, "height": 20,
/// "sym": "bilateral", "layers": 3, "coelom": "true", "days": 15, "gain": 30, "r": 0.3, "W0": 2,
/// "a": 2, "t": 10, "part": "stem", "nodes": 5, "il": 5, "expt": "tropism", "auxin": 5, "ga": 0,
/// "T": 25, "water": 26, "stage": 0, "folds": 3}.
class DiversityInstrument extends StatefulWidget {
  const DiversityInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<DiversityInstrument> createState() => _DivState();
}

class _DivState extends BioState<DiversityInstrument> {
  @override
  String get instrumentId => 'bio-diversity';
  @override
  Map<String, dynamic> get lessonPreset => widget.preset;
  @override
  List<String> get modes => const ['taxonomy', 'kingdoms', 'algae', 'lifecycle', 'pollen', 'bodyplan', 'moult', 'growth', 'morphology', 'regulators', 'gut'];
  @override
  Map<String, Map<String, dynamic>> get presets => const {
    'Taxonomic hierarchy': {'mode': 'taxonomy'},
    'Five kingdoms': {'mode': 'kingdoms'},
    'Algae and depth': {'mode': 'algae'},
    'Gametes and spores': {'mode': 'lifecycle'},
    'Pine pollen': {'mode': 'pollen'},
    'Body plans': {'mode': 'bodyplan'},
    'Moulting': {'mode': 'moult'},
    'Growth curves': {'mode': 'growth'},
    'Stem and fruit': {'mode': 'morphology'},
    'Growth regulators': {'mode': 'regulators'},
    'Alimentary canal': {'mode': 'gut'},
  };
  @override
  Map<String, Object> defaults(String mode) => {
    'org': 'man', 'rank': 1, 'who': 'euglena', 'system': 'five', 'depth': 0, 'gamy': 'iso', 'spores': 'homo', 'wind': 2, 'height': 20,
    'sym': 'bilateral', 'germ': 'triplo', 'coelom': 'true', 'days': 15, 'gain': 30, 'r': 0.3, 'W0': 2, 'a': 2, 't': 10, 'part': 'stem', 'nodes': 5, 'il': 5,
    'expt': 'tropism', 'auxin': 5, 'ga': 0, 'T': 25, 'stage': 0, 'folds': 3,
  };

  static const _sub1 = '1st PUC Biology · The living world';
  static const _sub2 = '1st PUC Biology · Biological classification';
  static const _sub3 = '1st PUC Biology · Plant kingdom';
  static const _sub4 = '1st PUC Biology · Animal kingdom';
  static const _sub13 = '1st PUC Biology · Plant growth and development';

  @override
  Widget build(BuildContext context) => switch (mode) {
    'kingdoms' => _kingdoms(),
    'algae' => _algae(),
    'lifecycle' => _lifecycle(),
    'pollen' => _pollen(),
    'bodyplan' => _bodyplan(),
    'moult' => _moult(),
    'growth' => _growth(),
    'morphology' => _morphology(),
    'regulators' => _regulators(),
    'gut' => _gut(),
    _ => _taxonomy(),
  };

  // ── Taxonomy ──────────────────────────────────────────────────────────────────────
  static const _ranks = ['Species', 'Genus', 'Family', 'Order', 'Class', 'Phylum / Division', 'Kingdom'];
  static const _table = {
    'man': ['Homo sapiens', 'Homo', 'Hominidae', 'Primata', 'Mammalia', 'Chordata', 'Animalia'],
    'housefly': ['Musca domestica', 'Musca', 'Muscidae', 'Diptera', 'Insecta', 'Arthropoda', 'Animalia'],
    'mango': ['Mangifera indica', 'Mangifera', 'Anacardiaceae', 'Sapindales', 'Dicotyledonae', 'Angiospermae', 'Plantae'],
    'wheat': ['Triticum aestivum', 'Triticum', 'Poaceae', 'Poales', 'Monocotyledonae', 'Angiospermae', 'Plantae'],
  };

  Widget _taxonomy() {
    final org = _table.containsKey(str('org')) ? str('org') : 'man';
    final rk = i('rank').clamp(1, 7);
    final names = _table[org]!;
    return frame(
      title: 'Climb the taxonomic hierarchy',
      subtitle: _sub1,
      formula: 'binomial: Genus species (italics; genus capitalised)',
      readouts: [
        Readout('Scientific name', names[0], '', IX.accent),
        Readout('Category', _ranks[rk - 1], 'level $rk of 7', IX.green),
        Readout('Taxon', names[rk - 1], ''),
        Readout('Shared characters', rk <= 2 ? 'Most' : (rk >= 6 ? 'Fewest' : 'Fewer'), 'as you climb'),
      ],
      controls: [
        choice('org', 'Organism', const {'man': 'Man', 'housefly': 'Housefly', 'mango': 'Mango', 'wheat': 'Wheat'}),
        slider('rank', 'Category', 1, 7),
      ],
      painter: BioPainter((c, size) {
        // Ladder as nested widening bands.
        final cx = size.width * 0.36;
        final top = 60.0, step = (size.height - 220) / 7;
        for (var q = 6; q >= 0; q--) {
          final y = top + (6 - q) * step;
          final w = 440 + q * (size.width * 0.62 - 440) / 6;
          final on = q == rk - 1;
          final col = Color.lerp(const Color(0xFF2F7D5B), const Color(0xFF3F6FB5), q / 6)!;
          final r = Rect.fromCenter(center: Offset(cx, y + step / 2), width: w, height: step - 10);
          c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(12)), Paint()..color = on ? col : col.withValues(alpha: q < rk ? 0.32 : 0.10));
          IxPaint.label(c, _ranks[q], Offset(r.left + 18, r.center.dy), size: 18, color: on ? Colors.white : Bio.darken(col, 0.2), w: FontWeight.w700, align: Alignment.centerLeft);
          IxPaint.label(c, names[q], Offset(r.right - 18, r.center.dy), size: 20, color: on ? Colors.white : IX.ink, w: FontWeight.w600, align: Alignment.centerRight);
        }
        // Binomial card.
        final x = size.width * 0.72;
        Bio.card(c, Rect.fromLTWH(x, 60, size.width - x - 30, 240));
        Bio.heading(c, 'Writing the name', Offset(x + 20, 76), color: IX.accent);
        final g = names[0].split(' ');
        final tp = TextPainter(text: TextSpan(children: [TextSpan(text: g[0], style: IX.text(30, w: FontWeight.w600).copyWith(fontStyle: FontStyle.italic)), TextSpan(text: ' ${g[1]}', style: IX.text(30, w: FontWeight.w600).copyWith(fontStyle: FontStyle.italic)), TextSpan(text: org == 'man' || org == 'mango' ? '  L.' : '', style: IX.text(22, c: IX.inkSoft))]), textDirection: TextDirection.ltr)..layout();
        tp.paint(c, Offset(x + 20, 120));
        Bio.note(c, 'Genus (capital) + specific epithet (small). Printed in italics; handwritten, underline each word separately. The author\'s name may follow (L. = Linnaeus). Latin names are the same in every language.', Offset(x + 20, 172), maxWidth: size.width - x - 70, size: 16, color: IX.ink);
        Bio.card(c, Rect.fromLTWH(x, 330, size.width - x - 30, size.height - 460));
        Bio.heading(c, 'Panthera and Felis', Offset(x + 20, 346), color: IX.accent);
        Bio.note(c, 'Lion (P. leo), tiger (P. tigris) and leopard (P. pardus) share the genus Panthera; the cat is Felis. Both are in family Felidae, which with Canidae (dogs) is in order Carnivora.', Offset(x + 20, 386), maxWidth: size.width - x - 70, size: 17, color: IX.ink);
        Bio.note(c, 'Higher categories hold more organisms that share fewer characters. Local names differ from place to place (mango: aam, maavu, ambo …); one scientific name avoids confusion (ICBN for plants, ICZN for animals).', Offset(40, size.height - 60), maxWidth: size.width - 80, size: 17, color: IX.ink);
      }),
    );
  }

  // ── Kingdoms ──────────────────────────────────────────────────────────────────────
  static const _orgs = {
    'bacterium': ('Bacterium', 'Plantae', 'Monera', 'prokaryotic, unicellular'),
    'euglena': ('Euglena', '— (plant and animal)', 'Protista', 'photosynthetic in light, heterotrophic in the dark'),
    'mushroom': ('Mushroom', 'Plantae', 'Fungi', 'eukaryotic, cell wall of chitin, saprophytic'),
    'mango': ('Mango tree', 'Plantae', 'Plantae', 'eukaryotic, cellulose wall, autotrophic'),
    'frog': ('Frog', 'Animalia', 'Animalia', 'no cell wall, holozoic, tissue level'),
  };

  Widget _kingdoms() {
    final who = _orgs.containsKey(str('who')) ? str('who') : 'euglena';
    final five = str('system', 'five') == 'five';
    final (name, two, fiveK, why) = _orgs[who]!;
    final light = n('light', 1) > 0.5;
    return frame(
      title: five ? 'Whittaker\'s five kingdoms' : 'Linnaeus\'s two kingdoms',
      subtitle: _sub2,
      formula: 'cell type · body · nutrition · reproduction · phylogeny',
      readouts: [
        Readout('Organism', name, '', IX.accent),
        Readout('Two kingdoms', two, '', IX.inkSoft),
        Readout('Five kingdoms', fiveK, '', IX.green),
        Readout('Because', why.split(',').first, ''),
      ],
      controls: [
        choice('who', 'Organism', {for (final e in _orgs.entries) e.key: e.value.$1.split(' ').first}),
        choice('system', 'System', const {'two': 'Two kingdoms', 'five': 'Five kingdoms'}),
        if (who == 'euglena') toggle('light', 'Light', on: 'On', off: 'Dark'),
      ],
      painter: BioPainter((c, size) {
        final ks = five ? ['Monera', 'Protista', 'Fungi', 'Plantae', 'Animalia'] : ['Plantae', 'Animalia'];
        final w = (size.width - 80) / ks.length;
        const cols = [Color(0xFFB0475A), Color(0xFF8C6BB1), Color(0xFFC9A227), Color(0xFF4E8A33), Color(0xFF3F6FB5)];
        for (var q = 0; q < ks.length; q++) {
          final col = five ? cols[q] : (q == 0 ? cols[3] : cols[4]);
          final on = ks[q] == (five ? fiveK : two);
          final r = Rect.fromLTWH(40 + q * w + 8, 60, w - 16, 120);
          Bio.box(c, r, ks[q], color: col, size: 22, filled: on);
        }
        if (!five && who == 'euglena') Bio.note(c, 'Euglena does not fit: it photosynthesises like a plant yet moves and feeds like an animal.', const Offset(40, 200), maxWidth: size.width - 80, size: 18, color: IX.positive, w: FontWeight.w600);
        // Organism portrait.
        final ctr = Offset(size.width * 0.30, size.height * 0.62);
        switch (who) {
          case 'euglena':
            final body = Bio.smooth([ctr + const Offset(-140, 0), ctr + const Offset(-60, -50), ctr + const Offset(80, -36), ctr + const Offset(140, 0), ctr + const Offset(80, 36), ctr + const Offset(-60, 50)]);
            Bio.soft(c, body, light ? const Color(0xFFCFE6B8) : const Color(0xFFE8E2CF), stroke: 2.5, edge: const Color(0xFF6E8F4A));
            for (var q = 0; q < 8; q++) {
              c.drawOval(Rect.fromCenter(center: ctr + Offset(-60 + q * 18.0, (q.isEven ? -14 : 14)), width: 26, height: 12), Paint()..color = light ? BioC.chloro : BioC.chloro.withValues(alpha: 0.3));
            }
            c.drawCircle(ctr + const Offset(-110, -8), 8, Paint()..color = IX.positive);
            c.drawPath(Path()..moveTo(ctr.dx - 140, ctr.dy)..cubicTo(ctr.dx - 200, ctr.dy - 40, ctr.dx - 230, ctr.dy + 40, ctr.dx - 290, ctr.dy), Paint()..color = const Color(0xFF6E8F4A)..style = PaintingStyle.stroke..strokeWidth = 3);
            Bio.leader(c, ctr + const Offset(-110, -8), ctr + const Offset(-120, -120), 'eyespot');
            Bio.leader(c, ctr + const Offset(-6, 14), ctr + const Offset(120, -120), light ? 'chloroplasts: makes food' : 'chloroplasts idle: absorbs food');
            Bio.leader(c, ctr + const Offset(-250, 6), ctr + const Offset(-200, 100), 'flagellum');
          case 'bacterium':
            Bio.soft(c, Path()..addRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: ctr, width: 300, height: 120), const Radius.circular(60))), const Color(0xFFF2D8C9), stroke: 2.5, edge: BioC.lyso);
            c.drawPath(Bio.blob(ctr, 70, 30, seed: 3, wobble: 0.3), Paint()..color = BioC.chromatin..style = PaintingStyle.stroke..strokeWidth = 3);
            Bio.leader(c, ctr + const Offset(40, 20), ctr + const Offset(140, 120), 'nucleoid: naked DNA, no envelope');
          case 'mushroom':
            c.drawRect(Rect.fromCenter(center: ctr + const Offset(0, 60), width: 50, height: 160), Paint()..color = const Color(0xFFEDE3CF));
            Bio.soft(c, Path()..addArc(Rect.fromCenter(center: ctr, width: 300, height: 200), math.pi, math.pi), const Color(0xFFB98A5E), stroke: 2.5);
          case 'mango':
            c.drawRect(Rect.fromCenter(center: ctr + const Offset(0, 90), width: 40, height: 150), Paint()..color = const Color(0xFF6B4A2B));
            Bio.soft(c, Bio.blob(ctr, 160, 110, seed: 2, wobble: 0.15, n: 14), BioC.leaf, stroke: 2);
          default:
            const skin = Color(0xFF7FA35A);
            for (final sd in [-1.0, 1.0]) {
              final leg = Path()..moveTo(ctr.dx + 60, ctr.dy + sd * 20)..quadraticBezierTo(ctr.dx + 170, ctr.dy + sd * 90, ctr.dx + 60, ctr.dy + sd * 110)..lineTo(ctr.dx + 10, ctr.dy + sd * 120);
              Bio.stroke(c, leg, Bio.darken(skin, 0.15), 22);
              Bio.stroke(c, Path()..moveTo(ctr.dx - 70, ctr.dy + sd * 30)..lineTo(ctr.dx - 90, ctr.dy + sd * 85)..lineTo(ctr.dx - 120, ctr.dy + sd * 95), Bio.darken(skin, 0.15), 14);
            }
            Bio.soft(c, Bio.smooth([ctr + const Offset(-150, 0), ctr + const Offset(-90, -55), ctr + const Offset(40, -60), ctr + const Offset(110, 0), ctr + const Offset(40, 60), ctr + const Offset(-90, 55)]), skin, stroke: 2.5);
            for (final sd in [-1.0, 1.0]) {
              c.drawCircle(ctr + Offset(-95, sd * 34), 15, Paint()..color = const Color(0xFFF1E6C8));
              c.drawCircle(ctr + Offset(-95, sd * 34), 7, Paint()..color = const Color(0xFF1E2A10));
            }
            for (var q = 0; q < 6; q++) {
              c.drawCircle(ctr + Offset(-20 + q * 22.0, (q.isEven ? -20 : 18)), 7, Paint()..color = Bio.darken(skin, 0.3));
            }
            IxPaint.label(c, 'Frog (Rana), top view', ctr + const Offset(0, 150), size: 17, color: IX.inkSoft, w: FontWeight.w600);
        }
        Bio.card(c, Rect.fromLTWH(size.width * 0.60, 260, size.width * 0.40 - 30, size.height - 300));
        Bio.heading(c, '$name → $fiveK', Offset(size.width * 0.60 + 24, 280), color: IX.accent);
        Bio.note(c, '${why[0].toUpperCase()}${why.substring(1)}.\n\nTwo kingdoms put bacteria, fungi and plants together because all have a cell wall, though they differ in cell type and nutrition. Whittaker (1969) separated them by cell structure, body organisation, mode of nutrition, reproduction and phylogeny.', Offset(size.width * 0.60 + 24, 320), maxWidth: size.width * 0.40 - 80, size: 17, color: IX.ink);
      }),
    );
  }

  // ── Algae and light ───────────────────────────────────────────────────────────────
  Widget _algae() {
    final d = n('depth');
    // Attenuation coefficients (per m) in clear ocean water.
    double ir(double z) => 100 * math.exp(-0.35 * z);
    double igf(double z) => 100 * math.exp(-0.07 * z);
    double ibf(double z) => 100 * math.exp(-0.03 * z);
    final best = d < 8 ? 'Green algae' : (d < 25 ? 'Brown algae' : 'Red algae');
    return frame(
      title: 'Which algae can live deep?',
      subtitle: _sub3,
      formula: 'light left = e^(−k·depth); red fades first',
      readouts: [
        Readout('Red light left', f1(ir(d)), '%', IX.positive),
        Readout('Green light left', f1(igf(d)), '%', IX.green),
        Readout('Blue light left', f1(ibf(d)), '%', IX.accent),
        Readout('Thrives here', best, '', IX.ink),
      ],
      controls: [slider('depth', 'Depth', 0, 60, unit: 'm')],
      painter: BioPainter((c, size) {
        final col = Rect.fromLTWH(40, 40, size.width * 0.40, size.height - 80);
        c.drawRect(col, Paint()..shader = const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF9CD3E8), Color(0xFF2B6E9C), Color(0xFF0F2F57)]).createShader(col));
        double y(double z) => col.top + col.height * z / 60;
        void alga(double z, Color cc, String lab) {
          final at = Offset(col.left + 80 + z * 3, y(z));
          for (var q = 0; q < 5; q++) {
            drawLeaf(c, at + Offset(0, 30), at + Offset(math.sin(q * 1.3) * 40, -30 - q * 6.0), 10, color: cc, veins: false);
          }
          IxPaint.label(c, lab, at + const Offset(70, 0), size: 17, color: Colors.white, w: FontWeight.w700, align: Alignment.centerLeft);
        }
        alga(3, const Color(0xFF5FAE3A), 'Green (Chlorophyceae)');
        alga(18, const Color(0xFF9A7A2A), 'Brown (fucoxanthin)');
        alga(45, const Color(0xFFC0405A), 'Red (r-phycoerythrin)');
        c.drawLine(Offset(col.left, y(d)), Offset(col.right, y(d)), Paint()..color = Colors.white..strokeWidth = 3);
        IxPaint.label(c, '${f0(d)} m', Offset(col.right - 10, y(d) - 16), size: 18, color: Colors.white, w: FontWeight.w700, align: Alignment.centerRight);
        final plot = Plot(Rect.fromLTRB(size.width * 0.54, 90, size.width - 40, size.height - 120), 0, 60, 0, 100);
        plot.frame(c, xs: [0, 10, 20, 30, 40, 50, 60], ys: [0, 50, 100], xLabel: 'Depth (m)', yLabel: 'Light left (%)', title: 'Each colour fades at its own rate');
        plot.curve(c, ir, IX.positive, label: 'red', labelX: 4);
        plot.curve(c, igf, IX.green, label: 'green', labelX: 25);
        plot.curve(c, ibf, IX.accent, label: 'blue', labelX: 50);
        plot.vline(c, d, IX.ink);
      }),
    );
  }

  // ── Gametes and spores ────────────────────────────────────────────────────────────
  Widget _lifecycle() {
    final gamy = str('gamy', 'iso'), spores = str('spores', 'homo');
    return frame(
      title: 'Gametes and spores in plants',
      subtitle: _sub3,
      formula: 'gamete + gamete → zygote',
      readouts: [
        Readout('Gametes', switch (gamy) { 'aniso' => 'Anisogamy', 'oo' => 'Oogamy', _ => 'Isogamy' }, '', IX.accent),
        Readout('Example', switch (gamy) { 'aniso' => 'Eudorina', 'oo' => 'Volvox, Fucus', _ => 'Chlamydomonas, Spirogyra' }, ''),
        Readout('Spores', spores == 'homo' ? 'Homosporous' : 'Heterosporous', '', IX.green),
        Readout('Example', spores == 'homo' ? 'Most ferns' : 'Selaginella, Salvinia', ''),
      ],
      controls: [
        choice('gamy', 'Gametes', const {'iso': 'Isogamy', 'aniso': 'Anisogamy', 'oo': 'Oogamy'}),
        choice('spores', 'Spores', const {'homo': 'Homospory', 'hetero': 'Heterospory'}),
      ],
      painter: BioPainter((c, size) {
        final y = size.height * 0.28;
        Bio.heading(c, 'Fusion of gametes', const Offset(40, 24));
        final (ra, rb, fa, fb) = switch (gamy) { 'aniso' => (34.0, 18.0, true, true), 'oo' => (60.0, 12.0, false, true), _ => (24.0, 24.0, true, true) };
        void gam(Offset at, double r, bool flag, Color col) {
          Bio.soft(c, Path()..addOval(Rect.fromCircle(center: at, radius: r)), col, stroke: 2);
          if (flag) {
            for (final sd in [-1.0, 1.0]) {
              c.drawPath(Path()..moveTo(at.dx - r, at.dy)..quadraticBezierTo(at.dx - r - 30, at.dy + sd * 30, at.dx - r - 60, at.dy + sd * 10), Paint()..color = col..style = PaintingStyle.stroke..strokeWidth = 2.5);
            }
          }
        }
        gam(Offset(size.width * 0.18, y), ra, fa, BioC.female);
        gam(Offset(size.width * 0.42, y), rb, fb, BioC.male);
        IxPaint.arrow(c, Offset(size.width * 0.50, y), Offset(size.width * 0.62, y), IX.inkSoft);
        Bio.soft(c, Path()..addOval(Rect.fromCircle(center: Offset(size.width * 0.72, y), radius: 40)), const Color(0xFF8C6BB1), stroke: 2);
        IxPaint.label(c, 'zygote (2n)', Offset(size.width * 0.72, y + 64), size: 17, color: IX.ink, w: FontWeight.w600);
        IxPaint.label(c, gamy == 'oo' ? 'large non-motile egg' : 'gamete', Offset(size.width * 0.18, y + ra + 26), size: 16, color: IX.inkSoft);
        IxPaint.label(c, gamy == 'oo' ? 'small motile male' : 'gamete', Offset(size.width * 0.42, y + rb + 26), size: 16, color: IX.inkSoft);
        final y2 = size.height * 0.66;
        Bio.heading(c, 'Spores of pteridophytes', Offset(40, y2 - 110));
        if (spores == 'homo') {
          for (var q = 0; q < 6; q++) {
            c.drawCircle(Offset(120 + q * 40.0, y2), 12, Paint()..color = const Color(0xFF9A7A2A));
          }
          IxPaint.arrow(c, Offset(380, y2), Offset(480, y2), IX.inkSoft);
          Bio.soft(c, Bio.blob(Offset(600, y2), 90, 60, seed: 3), const Color(0xFF8DBA5A), stroke: 2);
          Bio.note(c, 'One kind of spore → a small free-living bisexual prothallus with both antheridia and archegonia.', Offset(720, y2 - 30), maxWidth: size.width - 760, size: 18, color: IX.ink);
        } else {
          c.drawCircle(Offset(140, y2 - 40), 34, Paint()..color = BioC.female);
          for (var q = 0; q < 8; q++) {
            c.drawCircle(Offset(100 + q * 22.0, y2 + 50), 8, Paint()..color = BioC.male);
          }
          IxPaint.label(c, 'megaspore → female gametophyte', Offset(200, y2 - 40), size: 17, color: BioC.female, w: FontWeight.w600, align: Alignment.centerLeft);
          IxPaint.label(c, 'microspores → male gametophytes', Offset(290, y2 + 50), size: 17, color: BioC.male, w: FontWeight.w600, align: Alignment.centerLeft);
          Bio.note(c, 'Female gametophytes are retained on the parent sporophyte; the zygote develops there: a precursor to the seed habit, an important step in evolution.', Offset(40, y2 + 110), maxWidth: size.width - 80, size: 18, color: IX.ink);
        }
      }),
    );
  }

  // ── Pine pollen ───────────────────────────────────────────────────────────────────
  Widget _pollen() {
    final w = n('wind'), h = n('height');
    const vs = 0.04; // sinking speed m/s with air sacs
    final dist = w * h / vs;
    return frame(
      title: 'Pine pollen on the wind',
      subtitle: _sub3,
      formula: 'distance ≈ wind speed × height ÷ sinking speed',
      readouts: [
        Readout('Sinking speed', f0(vs * 100), 'cm/s (two air sacs)', IX.accent),
        Readout('Time aloft', f0(h / vs / 60), 'min', IX.ink),
        Readout('Distance drifted', dist >= 1000 ? '${f1(dist / 1000)} km' : '${f0(dist)} m', '', IX.green),
        Readout('Without air sacs', '${f0(w * h / 0.12)} m', '(≈ 12 cm/s)', IX.muted),
      ],
      controls: [slider('wind', 'Wind speed', 0.5, 5, unit: 'm/s', dp: 1, div: 9), slider('height', 'Release height', 5, 40, unit: 'm')],
      painter: BioPainter((c, size) {
        final g = size.height - 80;
        c.drawRect(Rect.fromLTWH(0, g, size.width, 80), Paint()..color = const Color(0xFFD9CBA4));
        final x0 = 120.0, top = g - (g - 80) * h / 40;
        c.drawRect(Rect.fromLTRB(x0 - 12, top, x0 + 12, g), Paint()..color = const Color(0xFF6B4A2B));
        for (var q = 0; q < 6; q++) {
          final yy = top + q * (g - top) / 7;
          c.drawPath(Path()..addPolygon([Offset(x0, yy - 20), Offset(x0 - 60 - q * 8, yy + 50), Offset(x0 + 60 + q * 8, yy + 50)], true), Paint()..color = const Color(0xFF2F6B2A));
        }
        // Trajectory.
        final scale = (size.width - x0 - 80) / math.max(dist, 1);
        final p = Path()..moveTo(x0, top);
        p.lineTo(x0 + dist * scale, g);
        IxPaint.dashed(c, Offset(x0, top), Offset(x0 + dist * scale, g), Paint()..color = const Color(0xFFE0A030)..strokeWidth = 3);
        for (var q = 1; q < 6; q++) {
          final at = Offset.lerp(Offset(x0, top), Offset(x0 + dist * scale, g), q / 6)!;
          c.drawCircle(at, 7, Paint()..color = const Color(0xFFE0A030));
          c.drawCircle(at + const Offset(-8, -3), 5, Paint()..color = const Color(0xFFF4E3B2));
          c.drawCircle(at + const Offset(8, -3), 5, Paint()..color = const Color(0xFFF4E3B2));
        }
        IxPaint.arrow(c, Offset(size.width * 0.4, 80), Offset(size.width * 0.4 + 40 * w, 80), IX.accent, width: 4);
        IxPaint.label(c, 'wind ${f1(w)} m/s', Offset(size.width * 0.4, 56), size: 17, color: IX.accent, w: FontWeight.w600, align: Alignment.centerLeft);
        IxPaint.label(c, 'lands ${dist >= 1000 ? '${f1(dist / 1000)} km' : '${f0(dist)} m'} away', Offset(x0 + dist * scale, g + 30), size: 18, color: IX.green, w: FontWeight.w700, align: Alignment.centerRight);
        Bio.note(c, 'Gymnosperms are wind-pollinated. Pinus pollen carries two air sacs, so it sinks slowly and drifts far before landing on a female cone. Pollen is made in huge numbers since most is wasted.', Offset(size.width * 0.45, 140), maxWidth: size.width * 0.5, size: 18, color: IX.ink);
      }),
    );
  }

  // ── Body plans ────────────────────────────────────────────────────────────────────
  Widget _bodyplan() {
    final sym = str('sym', 'bilateral'), germ = str('germ', 'triplo'), coel = str('coelom', 'true');
    final dip = germ == 'diplo';
    final example = dip ? (sym == 'radial' ? 'Cnidaria (Hydra), Ctenophora' : 'Diploblastic, bilateral: rare') : (sym == 'radial' ? 'Echinoderm adult (starfish)' : switch (coel) { 'none' => 'Platyhelminthes (Taenia)', 'pseudo' => 'Aschelminthes (Ascaris)', _ => 'Annelida, Arthropoda, Mollusca, Chordata' });
    return frame(
      title: 'Build a body plan',
      subtitle: _sub4,
      formula: 'symmetry · germ layers · body cavity',
      readouts: [
        Readout('Symmetry', sym == 'radial' ? 'Radial' : 'Bilateral', '', IX.accent),
        Readout('Germ layers', dip ? 'Diploblastic' : 'Triploblastic', '', IX.green),
        Readout('Body cavity', dip ? 'None (mesoglea)' : switch (coel) { 'none' => 'Acoelomate', 'pseudo' => 'Pseudocoelomate', _ => 'Coelomate' }, ''),
        Readout('Example', example, ''),
      ],
      controls: [
        choice('sym', 'Symmetry', const {'radial': 'Radial', 'bilateral': 'Bilateral'}),
        choice('germ', 'Germ layers', const {'diplo': 'Two', 'triplo': 'Three'}),
        if (!dip) choice('coelom', 'Body cavity', const {'none': 'None', 'pseudo': 'Pseudocoelom', 'true': 'True coelom'}),
      ],
      painter: BioPainter((c, size) {
        // Transverse section.
        final ctr = Offset(size.width * 0.27, size.height * 0.48);
        const rr = 230.0;
        const ecto = Color(0xFF3F6FB5), meso = Color(0xFFC9666A), endo = Color(0xFFE0A030);
        c.drawCircle(ctr, rr, Paint()..color = Bio.lighten(ecto, 0.3));
        if (dip) {
          c.drawCircle(ctr, rr - 30, Paint()..color = const Color(0xFFEDE7F4));
          c.drawCircle(ctr, rr - 60, Paint()..color = Bio.lighten(endo, 0.3));
          c.drawCircle(ctr, rr - 90, Paint()..color = Colors.white);
          Bio.leader(c, ctr + const Offset(0, -rr + 45), Offset(ctr.dx + rr + 40, ctr.dy - 160), 'mesoglea');
        } else {
          c.drawCircle(ctr, rr - 30, Paint()..color = Bio.lighten(meso, 0.3));
          if (coel == 'true') {
            c.drawCircle(ctr, rr - 70, Paint()..color = const Color(0xFFF6F1E6));
            c.drawCircle(ctr, rr - 150, Paint()..color = Bio.lighten(meso, 0.3));
            Bio.leader(c, ctr + const Offset(0, -rr + 110), Offset(ctr.dx + rr + 40, ctr.dy - 160), 'true coelom');
          } else if (coel == 'pseudo') {
            c.drawCircle(ctr, rr - 70, Paint()..color = const Color(0xFFF6F1E6));
            Bio.leader(c, ctr + const Offset(0, -rr + 110), Offset(ctr.dx + rr + 40, ctr.dy - 160), 'pseudocoelom');
          }
          c.drawCircle(ctr, rr - (coel == 'none' ? 60 : 150), Paint()..color = Bio.lighten(meso, 0.3));
          c.drawCircle(ctr, rr - 170, Paint()..color = Bio.lighten(endo, 0.3));
          c.drawCircle(ctr, rr - 195, Paint()..color = Colors.white);
          Bio.leader(c, ctr + const Offset(-rr + 45, 0), Offset(ctr.dx - rr - 40, ctr.dy + 120), 'mesoderm');
        }
        Bio.leader(c, ctr + const Offset(-rr + 12, -40), Offset(ctr.dx - rr - 40, ctr.dy - 160), 'ectoderm');
        Bio.leader(c, ctr + Offset(dip ? 70 : 45, 10), Offset(ctr.dx + rr + 40, ctr.dy + 120), 'endoderm');
        // Symmetry lines.
        final ln = Paint()..color = IX.ink..strokeWidth = 2;
        if (sym == 'radial') {
          for (var q = 0; q < 4; q++) {
            final a = q * math.pi / 4;
            IxPaint.dashed(c, ctr - Offset(math.cos(a), math.sin(a)) * (rr + 20), ctr + Offset(math.cos(a), math.sin(a)) * (rr + 20), ln);
          }
        } else {
          IxPaint.dashed(c, ctr - const Offset(0, rr + 30), ctr + const Offset(0, rr + 30), ln..color = IX.positive..strokeWidth = 3);
        }
        Bio.card(c, Rect.fromLTWH(size.width * 0.70, 60, size.width * 0.30 - 30, size.height - 120));
        Bio.heading(c, 'Example', Offset(size.width * 0.70 + 24, 80), color: IX.accent);
        Bio.note(c, '$example\n\n${sym == 'radial' ? 'Radial: any plane through the central axis gives two equal halves.' : 'Bilateral: only one plane divides the body into left and right halves.'}\n\nSponges have cellular grade organisation with a canal system: collar cells draw water in through ostia and out through the osculum. Annelids are metamerically segmented and move by waves of circular and longitudinal muscles.', Offset(size.width * 0.70 + 24, 120), maxWidth: size.width * 0.30 - 80, size: 17, color: IX.ink);
      }),
    );
  }

  // ── Moulting ──────────────────────────────────────────────────────────────────────
  Widget _moult() {
    final dm = n('days'), g = n('gain') / 100;
    final moults = (90 / dm).floor();
    final arth = math.pow(1 + g, moults).toDouble();
    return frame(
      title: 'Growing inside armour: moulting',
      subtitle: _sub4,
      formula: 'size × (1 + gain) at each moult',
      readouts: [
        Readout('Moults in 90 days', '$moults', '', IX.accent),
        Readout('Arthropod size', '× ${f2(arth)}', '', IX.positive),
        Readout('Mollusc shell', '× ${f2(1 + (arth - 1) * 0.9)}', 'grows smoothly', IX.green),
        Readout('Exoskeleton', 'Chitin', 'cannot stretch'),
      ],
      controls: [slider('days', 'Days between moults', 10, 30, unit: 'd'), slider('gain', 'Growth at each moult', 10, 40, unit: '%')],
      painter: BioPainter((c, size) {
        final yMax = math.max(arth * 1.15, 2.0);
        final plot = Plot(Rect.fromLTRB(120, 90, size.width - 60, size.height - 140), 0, 90, 0, yMax);
        plot.frame(c, xs: [0, 30, 60, 90], ys: [0, 1, yMax.floorToDouble()], xLabel: 'Days', yLabel: 'Body size (relative)', title: 'Steps for an arthropod, a smooth ramp for a mollusc');
        plot.curve(c, (x) => math.pow(1 + g, (x / dm).floor()).toDouble(), IX.positive, w: 4.5, label: 'arthropod (ecdysis)', labelX: 80);
        plot.curve(c, (x) => 1 + (arth - 1) * 0.9 * x / 90, IX.green, w: 3.5, dashed: true, label: 'mollusc shell', labelX: 45);
        for (var q = 1; q <= moults; q++) {
          plot.vline(c, q * dm, IX.muted, w: 1);
        }
        Bio.note(c, 'After each moult the soft new cuticle stretches while the animal swells with water or air, then hardens.', Offset(120, size.height - 60), maxWidth: size.width - 180, size: 17, color: IX.ink);
      }),
    );
  }

  // ── Growth curves ─────────────────────────────────────────────────────────────────
  Widget _growth() {
    final r = n('r'), w0 = n('W0'), a = n('a'), t = n('t');
    final ari = w0 + a * t, geo = w0 * math.exp(r * t);
    const k = 60.0;
    final sig = k / (1 + (k / w0 - 1) * math.exp(-r * t));
    return frame(
      title: 'Arithmetic, geometric and sigmoid growth',
      subtitle: _sub13,
      formula: 'Lₜ = L₀ + rt  ·  Wₜ = W₀ eʳᵗ',
      readouts: [
        Readout('Arithmetic', f1(ari), 'size', IX.accent),
        Readout('Geometric', f1(geo), 'size', IX.positive),
        Readout('Sigmoid', f1(sig), 'levels at $k', IX.green),
        Readout('Doubling (geometric)', f1(math.ln2 / r), 'days'),
      ],
      controls: [
        slider('W0', 'Starting size', 1, 10),
        slider('a', 'Arithmetic rate per day', 0.5, 5, dp: 1, div: 9),
        slider('r', 'Relative growth rate r', 0.05, 0.6, dp: 2, div: 11),
        slider('t', 'Time', 0, 20, unit: 'days'),
      ],
      painter: BioPainter((c, size) {
        final plot = Plot(Rect.fromLTRB(120, 90, size.width * 0.66, size.height - 120), 0, 20, 0, 80);
        plot.frame(c, xs: [0, 5, 10, 15, 20], ys: [0, 20, 40, 60, 80], xLabel: 'Time (days)', yLabel: 'Size', title: 'Three ways to grow');
        plot.curve(c, (x) => w0 + a * x, IX.accent, label: 'arithmetic', labelX: 19.5);
        plot.curve(c, (x) => w0 * math.exp(r * x), IX.positive, label: 'geometric', labelX: math.min(19, math.log(70 / w0) / r - 1));
        plot.curve(c, (x) => k / (1 + (k / w0 - 1) * math.exp(-r * x)), IX.green, w: 3, dashed: true, label: 'sigmoid', labelX: 7);
        plot.vline(c, t, IX.ink);
        final x = size.width * 0.70;
        Bio.note(c, 'Arithmetic: after mitosis only one daughter keeps dividing (a root elongating at a constant rate).\n\nGeometric: both daughters divide; growth is exponential at first, then slows as nutrients run short, giving a sigmoid curve (lag, log, stationary).\n\nRoot zones: cells divide in the meristem, lengthen in the region of elongation and mature (root hairs) further back.', Offset(x, 90), maxWidth: size.width - x - 30, size: 17, color: IX.ink);
      }),
    );
  }

  // ── Stem and fruit ────────────────────────────────────────────────────────────────
  Widget _morphology() {
    final part = str('part', 'stem');
    final nodes = i('nodes'), il = n('il');
    return frame(
      title: part == 'stem' ? 'Nodes, internodes and buds' : 'From flower to fruit: the mango drupe',
      subtitle: '1st PUC Biology · Morphology of flowering plants',
      formula: part == 'stem' ? 'stem length = nodes × internode' : 'ovary wall → pericarp; ovule → seed',
      readouts: part == 'stem'
          ? [Readout('Nodes', '$nodes', '', IX.green), Readout('Stem length', f0(nodes * il), 'cm', IX.accent), Readout('Leaves', '$nodes', 'alternate', IX.green), Readout('Axillary buds', '$nodes', '')]
          : const [Readout('Fruit', 'Drupe', 'one seed', IX.accent), Readout('Epicarp', 'Thin skin', ''), Readout('Mesocarp', 'Fleshy, edible', '', IX.amber), Readout('Endocarp', 'Hard, stony', '')],
      controls: [
        choice('part', 'Show', const {'stem': 'Stem', 'fruit': 'Fruit'}),
        if (part == 'stem') ...[slider('nodes', 'Nodes', 2, 8), slider('il', 'Internode length', 3, 6, unit: 'cm')],
      ],
      painter: BioPainter((c, size) {
        if (part == 'stem') {
          final base = Offset(size.width * 0.32, size.height - 60);
          final seg = (size.height - 140) / 8 * il / 5;
          c.drawLine(base, base - Offset(0, seg * nodes + 30), Paint()..color = const Color(0xFF6F9A3A)..strokeWidth = 14..strokeCap = StrokeCap.round);
          for (var q = 1; q <= nodes; q++) {
            final at = base - Offset(0, seg * q);
            c.drawLine(at - const Offset(12, 0), at + const Offset(12, 0), Paint()..color = const Color(0xFF3F6B1F)..strokeWidth = 5);
            final sd = q.isEven ? 1.0 : -1.0;
            drawLeaf(c, at, at + Offset(sd * 150, -50), 34);
            c.drawCircle(at + Offset(sd * 16, -14), 7, Paint()..color = const Color(0xFF9DBB63));
          }
          Bio.leader(c, base - Offset(0, seg * 2), Offset(size.width * 0.62, base.dy - seg * 2), 'node: leaf and axillary bud');
          Bio.leader(c, base - Offset(0, seg * 2.5), Offset(size.width * 0.62, base.dy - seg * 2.5 - 60), 'internode ${f1(il)} cm');
        } else {
          final ctr = Offset(size.width * 0.36, size.height * 0.5);
          Bio.soft(c, Bio.blob(ctr, 220, 300, seed: 5, wobble: 0.04), const Color(0xFF7FA35A), stroke: 3);
          Bio.soft(c, Bio.blob(ctr, 205, 285, seed: 5, wobble: 0.04), const Color(0xFFF2B33D), stroke: 1, shadow: false);
          Bio.soft(c, Bio.blob(ctr, 110, 190, seed: 2, wobble: 0.05), const Color(0xFFEDE3CF), stroke: 2.5, edge: const Color(0xFF9A7A4A));
          Bio.soft(c, Bio.blob(ctr, 80, 160, seed: 3, wobble: 0.05), const Color(0xFFB98A5E), stroke: 1.5);
          Bio.leader(c, ctr + const Offset(210, -60), Offset(ctr.dx + 300, ctr.dy - 200), 'epicarp');
          Bio.leader(c, ctr + const Offset(150, 40), Offset(ctr.dx + 300, ctr.dy - 60), 'mesocarp (fleshy)');
          Bio.leader(c, ctr + const Offset(105, 100), Offset(ctr.dx + 300, ctr.dy + 80), 'endocarp (stony)');
          Bio.leader(c, ctr + const Offset(40, 0), Offset(ctr.dx + 300, ctr.dy + 220), 'seed');
        }
      }),
    );
  }

  // ── Growth regulators ─────────────────────────────────────────────────────────────
  Widget _regulators() {
    final ex = str('expt', 'tropism');
    final aux = n('auxin'), ga = n('ga'), temp = n('T');
    final angle = 3.2 * aux; // Went's curvature ~ auxin dose
    final rip = math.min(100, 100 * (temp - 4) / 25 * 0.9).clamp(0, 100).toDouble();
    return frame(
      title: switch (ex) { 'apical' => 'Apical dominance and gibberellins', 'ethylene' => 'Ethylene ripens fruit', 'plasticity' => 'Plasticity: heterophylly', _ => 'Darwin and Went: auxin bends the shoot' },
      subtitle: _sub13,
      formula: switch (ex) { 'apical' => 'auxin from the tip suppresses lateral buds', 'ethylene' => 'ethylene → ripening → more ethylene', 'plasticity' => 'one plant, two leaf forms', _ => 'curvature ∝ auxin in the agar block' },
      readouts: switch (ex) {
        'apical' => [Readout('Tip', ga > 50 ? 'Present, GA sprayed' : 'Present', ''), Readout('Stem height', f0(30 + ga * 0.5), 'cm (GA lengthens internodes)', IX.green), const Readout('Lateral buds', 'Dormant', 'remove tip to release', IX.amber), const Readout('Use', 'Tea, hedges', 'pruning')],
        'ethylene' => [Readout('Storage temperature', f0(temp), '°C', IX.accent), Readout('Ripening in a week', f0(rip), '%', IX.amber), const Readout('Climacteric', 'Yes', 'banana, mango'), const Readout('Gas', 'C₂H₄', 'ethephon releases it')],
        'plasticity' => const [Readout('Under water', 'Dissected leaves', '', IX.accent), Readout('In air', 'Broad leaves', '', IX.green), Readout('Example', 'Buttercup', 'also cotton, coriander'), Readout('Called', 'Heterophylly', '')],
        _ => [Readout('Auxin in block', f0(aux), 'units', IX.amber), Readout('Curvature', f0(angle), '°', IX.accent), const Readout('Discovered by', 'F. W. Went', '1928, oat coleoptile'), const Readout('Hormone', 'Auxin (IAA)', '')],
      },
      controls: [
        choice('expt', 'Experiment', const {'tropism': 'Went', 'apical': 'Apical', 'ethylene': 'Ethylene', 'plasticity': 'Plasticity'}),
        if (ex == 'tropism') slider('auxin', 'Auxin in the agar block', 0, 10),
        if (ex == 'apical') slider('ga', 'Gibberellin sprayed', 0, 100, unit: '%'),
        if (ex == 'ethylene') slider('T', 'Storage temperature', 5, 35, unit: '°C'),
      ],
      painter: BioPainter((c, size) {
        final base = Offset(size.width * 0.34, size.height - 100);
        c.drawRect(Rect.fromLTWH(base.dx - 120, base.dy, 240, 60), Paint()..color = const Color(0xFF9A7653));
        switch (ex) {
          case 'tropism':
            final a = angle * math.pi / 180;
            final p = Path()..moveTo(base.dx, base.dy);
            var at = base, dir = -math.pi / 2;
            for (var q = 0; q < 30; q++) {
              dir += a / 30;
              at += Offset(math.cos(dir), math.sin(dir)) * 12;
              p.lineTo(at.dx, at.dy);
            }
            Bio.stroke(c, p, const Color(0xFFB5CF6B), 26);
            c.drawRect(Rect.fromCenter(center: at + Offset(math.cos(dir), math.sin(dir)) * 16, width: 40, height: 24), Paint()..color = const Color(0xFFF2E3B3));
            IxPaint.label(c, 'agar block with auxin', at + const Offset(40, -30), size: 16, color: IX.amber, w: FontWeight.w600, align: Alignment.centerLeft);
            IxPaint.label(c, '${f0(angle)}°', base + const Offset(80, -100), size: 22, color: IX.accent, w: FontWeight.w700);
          case 'apical':
            final hgt = 300 + ga * 1.2;
            c.drawLine(base, base - Offset(0, hgt), Paint()..color = const Color(0xFF6F9A3A)..strokeWidth = 14);
            for (var q = 1; q <= 4; q++) {
              final at = base - Offset(0, hgt * q / 5);
              drawLeaf(c, at, at + Offset(q.isEven ? 90 : -90, -30), 22);
              c.drawCircle(at + Offset(q.isEven ? -14 : 14, -10), 8, Paint()..color = const Color(0xFF9DBB63));
            }
            c.drawCircle(base - Offset(0, hgt + 10), 14, Paint()..color = const Color(0xFF4E8A33));
            Bio.leader(c, base - Offset(0, hgt + 10), Offset(base.dx + 220, base.dy - hgt), 'shoot tip: makes auxin');
            Bio.leader(c, base - Offset(-14, hgt * 0.4 + 10), Offset(base.dx + 220, base.dy - hgt * 0.4), 'lateral buds held dormant');
          case 'ethylene':
            for (var q = 0; q < 5; q++) {
              final at = base + Offset(-100 + q * 50.0, -60 - (q % 2) * 20);
              final col = Color.lerp(const Color(0xFF7FA35A), const Color(0xFFF2C53D), (rip / 100 * (0.6 + q * 0.1)).clamp(0, 1))!;
              c.drawPath(Path()..moveTo(at.dx, at.dy)..quadraticBezierTo(at.dx + 30, at.dy - 140, at.dx + 10, at.dy - 200), Paint()..color = col..style = PaintingStyle.stroke..strokeWidth = 34..strokeCap = StrokeCap.round);
            }
          default:
            c.drawRect(Rect.fromLTWH(base.dx - 200, base.dy - 260, 400, 260), Paint()..color = const Color(0xFF9CC7DA).withValues(alpha: 0.6));
            c.drawLine(base, base - const Offset(0, 520), Paint()..color = const Color(0xFF6F9A3A)..strokeWidth = 10);
            for (var q = 1; q <= 6; q++) {
              final at = base - Offset(0, 80.0 * q);
              final sd = q.isEven ? 1.0 : -1.0;
              if (q <= 3) {
                for (var k = 0; k < 5; k++) {
                  c.drawLine(at, at + Offset(sd * (60 + k * 8), -20 + k * 10), Paint()..color = const Color(0xFF4E8A33)..strokeWidth = 3);
                }
              } else {
                drawLeaf(c, at, at + Offset(sd * 110, -30), 40);
              }
            }
            IxPaint.label(c, 'water level', base + const Offset(210, -260), size: 16, color: const Color(0xFF2B6E9C), w: FontWeight.w600, align: Alignment.centerLeft);
        }
        final x = size.width * 0.62;
        Bio.note(c, switch (ex) {
          'apical' => 'Remove the tip and the buds grow into branches (tea plantations, hedge-making). Auxin paste on the cut stump keeps them dormant. Gibberellins lengthen internodes: sugarcane yield rises by up to 20 tonnes per acre.',
          'ethylene' => 'A ripening fruit makes ethylene, which speeds its own ripening: the climacteric rise. A ripe fruit in the bag adds ethylene; ventilation removes it; cold storage slows everything.',
          'plasticity' => 'Plants follow different paths in response to environment or life stage. Leaves of the juvenile and adult cotton, coriander and larkspur differ; buttercup leaves under water are finely dissected.',
          _ => 'The Darwins saw that a canary grass coleoptile bends towards light only if its tip is present and uncovered. Went collected the signal from tips in agar blocks: a block placed on one side of a decapitated coleoptile makes it bend, more auxin → more bending.',
        }, Offset(x, 90), maxWidth: size.width - x - 30, size: 18, color: IX.ink);
      }),
    );
  }

  // ── Alimentary canal ──────────────────────────────────────────────────────────────
  static const _stops = [
    ('Mouth', 'Saliva: salivary amylase (pH 6.8)', '1 min', Offset(0.50, 0.08)),
    ('Oesophagus', 'Peristalsis only', '10 s', Offset(0.50, 0.22)),
    ('Stomach', 'Gastric juice: pepsin, HCl (pH 1.8)', '3–4 h', Offset(0.58, 0.40)),
    ('Duodenum', 'Bile, pancreatic juice: trypsin, lipase', '1 h', Offset(0.46, 0.50)),
    ('Small intestine', 'Succus entericus; absorption by villi', '3–5 h', Offset(0.50, 0.66)),
    ('Large intestine', 'Water absorbed; faeces formed', '12–36 h', Offset(0.36, 0.60)),
  ];

  Widget _gut() {
    final st = i('stage').clamp(0, 5), folds = i('folds').clamp(0, 3);
    final mult = [1, 3, 30, 600][folds];
    final (name, juice, time, _) = _stops[st];
    return frame(
      title: 'The alimentary canal',
      subtitle: '1st PUC Biology · Digestion and absorption',
      formula: 'folds × villi × microvilli ≈ 600 × surface',
      readouts: [
        Readout('Food is in', name, '', IX.accent),
        Readout('Stays about', time, ''),
        Readout('Juice', juice.split(':').first, '', IX.green),
        Readout('Absorbing surface', '× $mult', ['plain tube', '+ circular folds', '+ villi', '+ microvilli'][folds], IX.amber),
      ],
      controls: [
        stepper('stage', [for (final s in _stops) s.$1], label: 'Stop'),
        slider('folds', 'Levels of folding (small intestine)', 0, 3),
      ],
      painter: BioPainter((c, size) {
        final w = size.width * 0.55, h = size.height - 60;
        Offset p(Offset f) => Offset(30 + f.dx * w, 30 + f.dy * h);
        final tube = Path()
          ..moveTo(p(const Offset(0.50, 0.04)).dx, p(const Offset(0.50, 0.04)).dy)
          ..lineTo(p(const Offset(0.50, 0.30)).dx, p(const Offset(0.50, 0.30)).dy);
        Bio.stroke(c, tube, const Color(0xFFE8A9A0), 22);
        Bio.soft(c, Bio.blob(p(const Offset(0.60, 0.38)), 90, 60, seed: 3, rot: -0.4), const Color(0xFFE8A9A0), stroke: 2);
        final si = Bio.smooth([for (var q = 0; q < 9; q++) p(Offset(q == 0 ? 0.48 : (q.isEven ? 0.38 : 0.66), 0.48 + q * 0.035))], closed: false);
        Bio.stroke(c, si, const Color(0xFFC9806E), 22);
        Bio.stroke(c, si, const Color(0xFFF0BFA8), 16);
        final li = Path()..moveTo(p(const Offset(0.70, 0.78)).dx, p(const Offset(0.70, 0.78)).dy)..lineTo(p(const Offset(0.78, 0.78)).dx, p(const Offset(0.78, 0.78)).dy)..lineTo(p(const Offset(0.78, 0.45)).dx, p(const Offset(0.78, 0.45)).dy)..lineTo(p(const Offset(0.24, 0.45)).dx, p(const Offset(0.24, 0.45)).dy)..lineTo(p(const Offset(0.24, 0.90)).dx, p(const Offset(0.24, 0.90)).dy);
        Bio.stroke(c, li, const Color(0xFFC98A7A), 30);
        for (var q = 0; q < _stops.length; q++) {
          final at = p(_stops[q].$4);
          final on = q == st;
          c.drawCircle(at, on ? 16 : 8, Paint()..color = on ? IX.accent : IX.inkSoft);
          IxPaint.label(c, _stops[q].$1, at + const Offset(26, 0), size: 17, color: on ? IX.accent : IX.ink, w: on ? FontWeight.w700 : FontWeight.w500, align: Alignment.centerLeft, halo: true);
        }
        // Villus panel.
        final x = size.width * 0.62;
        Bio.card(c, Rect.fromLTWH(x, 40, size.width - x - 30, 220));
        Bio.heading(c, name, Offset(x + 20, 56), color: IX.accent);
        Bio.note(c, '$juice.\nTime spent: $time.', Offset(x + 20, 96), maxWidth: size.width - x - 70, size: 18, color: IX.ink);
        final vy = 330.0, vh = size.height - vy - 40;
        Bio.heading(c, 'Folding multiplies the surface', Offset(x, vy - 30), size: 19);
        final vw = size.width - x - 30;
        c.drawRect(Rect.fromLTWH(x, vy + vh - 40, vw, 40), Paint()..color = const Color(0xFFE8A9A0));
        if (folds >= 1) {
          for (var q = 0; q < 3; q++) {
            c.drawPath(Path()..addArc(Rect.fromLTWH(x + q * vw / 3, vy + vh - 120, vw / 3, 160), math.pi, math.pi), Paint()..color = const Color(0xFFE8A9A0));
          }
        }
        if (folds >= 2) {
          for (var q = 0; q < 12; q++) {
            final bx = x + 12 + q * (vw - 24) / 12;
            final r = RRect.fromRectAndRadius(Rect.fromLTWH(bx, vy + 40 + (q % 3) * 10, (vw - 24) / 12 - 6, vh - 140), const Radius.circular(12));
            Bio.soft(c, Path()..addRRect(r), const Color(0xFFF0BFA8), stroke: 1.2, shadow: false);
            if (folds >= 3) {
              for (var k = 0; k < 6; k++) {
                c.drawLine(Offset(r.left + 2 + k * (r.width - 4) / 5, r.top), Offset(r.left + 2 + k * (r.width - 4) / 5, r.top - 8), Paint()..color = const Color(0xFFC98A7A)..strokeWidth = 1.5);
              }
            }
          }
        }
      }),
    );
  }
}
