import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bio_kit.dart';

/// Cell cycle and cell division (1st PUC Biology ch. 10): the cell-cycle clock with DNA
/// content, mitosis and meiosis stage by stage with chromosome and chromatid counts, the
/// mitotic index of a root tip, growth by repeated mitosis and independent assortment.
///
/// Preset: {"mode": "cycle"|"mitosis"|"meiosis"|"index"|"doubling"|"assortment", "step": 0,
/// "n2": 4 (diploid number), "plant": false, "g1": 11, "s": 8, "g2": 4, "m": 1 (hours),
/// "dividing": 30, "total": 400, "cycle": 24, "rounds": 3, "pairs": 2, "seed": 0}.
class DivisionInstrument extends StatefulWidget {
  const DivisionInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<DivisionInstrument> createState() => _DivisionState();
}

const _mitosis = ['Interphase (G₂)', 'Prophase', 'Metaphase', 'Anaphase', 'Telophase', 'Cytokinesis'];
const _meiosis = ['Leptotene', 'Zygotene', 'Pachytene', 'Diplotene', 'Diakinesis', 'Metaphase I', 'Anaphase I', 'Telophase I', 'Prophase II', 'Metaphase II', 'Anaphase II', 'Telophase II'];

const _mitosisText = [
  'DNA was copied in S phase: each chromosome now has two sister chromatids. DNA content is 4C but the chromosome number is still 2n. The centriole has duplicated.',
  'Chromatin condenses into chromosomes of two chromatids joined at the centromere. The centrosomes move to opposite poles and the spindle forms; by the end the nucleolus, Golgi, ER and nuclear envelope have gone.',
  'Chromosomes are most condensed — the best stage to study their shape. Spindle fibres attach to the kinetochores and the chromosomes line up on the metaphase plate.',
  'Centromeres split. The sister chromatids, now daughter chromosomes, are pulled to opposite poles, centromere first and arms trailing.',
  'Chromosomes reach the poles and decondense. The nuclear envelope, nucleolus, Golgi and ER form again around each set.',
  'The cytoplasm divides. Animal cells: a furrow in the plasma membrane deepens until the cell splits. Plant cells: a cell plate grows from the centre outwards and becomes the middle lamella.',
];

const _meiosisText = [
  'Meiosis I begins. Chromosomes become visible as long thin threads; compaction continues through leptotene.',
  'Homologous chromosomes start pairing (synapsis) along a synaptonemal complex. Each pair is a bivalent, or tetrad.',
  'Crossing over: homologous non-sister chromatids exchange segments at recombination nodules, helped by recombinase. This recombines genes.',
  'The synaptonemal complex dissolves and the homologues start to separate, except at the crossovers: X-shaped chiasmata. (Diplotene can last months or years in oocytes.)',
  'Chiasmata terminalise; the spindle assembles, and the nucleolus and nuclear envelope disappear.',
  'Bivalents line up on the metaphase plate; spindle fibres from opposite poles attach to the pair of homologues.',
  'Homologous chromosomes separate. Sister chromatids stay joined at their centromeres. This step halves the chromosome number.',
  'Nuclear membrane and nucleolus reappear; cytokinesis gives a dyad of cells, each with n chromosomes of two chromatids. A short interkinesis follows with no DNA replication.',
  'Begins straight after cytokinesis, before the chromosomes fully elongate. The nuclear membrane disappears and the chromosomes condense again.',
  'Chromosomes align at the equator; fibres from opposite poles attach to the kinetochores of the sister chromatids.',
  'Centromeres split at last; the sister chromatids move to opposite poles, as in mitosis.',
  'Four haploid cells (a tetrad) form, each with n single-chromatid chromosomes, all genetically different.',
];

const _mat = Color(0xFFC0504D), _pat = Color(0xFF3F6FB5);

class _DivisionState extends BioState<DivisionInstrument> {
  @override
  String get instrumentId => 'bio-division';
  @override
  Map<String, dynamic> get lessonPreset => widget.preset;
  @override
  List<String> get modes => const ['mitosis', 'meiosis', 'cycle', 'index', 'doubling', 'assortment'];
  @override
  Map<String, Map<String, dynamic>> get presets => const {
    'Mitosis: metaphase': {'mode': 'mitosis', 'step': 2},
    'Plant cytokinesis': {'mode': 'mitosis', 'step': 5, 'plant': true},
    'Meiosis: pachytene': {'mode': 'meiosis', 'step': 2},
    'Meiosis: anaphase I': {'mode': 'meiosis', 'step': 6},
    'Cell cycle clock': {'mode': 'cycle'},
    'Mitotic index': {'mode': 'index'},
    'Growth by mitosis': {'mode': 'doubling'},
    'Independent assortment': {'mode': 'assortment'},
  };
  @override
  Map<String, Object> defaults(String mode) => {
    'step': 0, 'n2': 4, 'plant': false, 'g1': 11, 's': 8, 'g2': 4, 'm': 1, 'dividing': 30, 'total': 400, 'cycle': 24, 'rounds': 3, 'pairs': 2, 'seed': 0,
  };

  @override
  Widget build(BuildContext context) => switch (mode) {
    'meiosis' => _meio(),
    'cycle' => _cycle(),
    'index' => _index(),
    'doubling' => _doubling(),
    'assortment' => _assort(),
    _ => _mito(),
  };

  String get _sub => '1st PUC Biology · Cell cycle and cell division';

  // ------------------------------------------------------------------ mitosis

  Widget _mito() {
    final st = i('step').clamp(0, 5), n2 = i('n2');
    final chromosomes = st == 3 || st == 4 ? 2 * n2 : n2;
    final chromatids = st == 5 ? n2 : 2 * n2;
    final dna = st <= 3 ? '4C' : (st == 4 ? '2C + 2C' : '2C each');
    return frame(
      title: 'Mitosis: ${_mitosis[st]}',
      subtitle: _sub,
      formula: '2n → 2n + 2n',
      readouts: [
        Readout('Stage', _mitosis[st].split(' ').first, '', IX.accent),
        Readout(st == 5 ? 'Chromosomes per cell' : (st >= 3 ? 'Chromosomes (both poles)' : 'Chromosomes'), '$chromosomes', ''),
        Readout(st == 5 ? 'Chromatids per cell' : 'Chromatids', '$chromatids', '', IX.inkSoft),
        Readout('DNA content', dna, '', IX.green),
      ],
      controls: [
        stepper('step', _mitosis),
        toggle('plant', 'Cell', on: 'Plant', off: 'Animal'),
        slider('n2', 'Diploid number 2n (counts)', 2, 48, div: 23, fmt: (x) => '${x.round()}'),
      ],
      painter: BioPainter((c, size) {
        final ctr = Offset(size.width * 0.5, (size.height - 190) / 2 + 10);
        final r = math.min(size.width * 0.25, (size.height - 190) * 0.42);
        _mitosisCell(c, ctr, r, st, b('plant'));
        _textCard(c, Rect.fromLTWH(24, size.height - 180, size.width - 48, 160), _mitosis[st], _mitosisText[st], size, 'Drawn with 2n = 4');
      }),
    );
  }

  void _textCard(Canvas c, Rect r, String head, String body, Size size, String drawn) {
    Bio.card(c, r);
    Bio.heading(c, head, r.topLeft + const Offset(24, 18), size: 23, color: IX.accent);
    Bio.note(c, body, r.topLeft + const Offset(24, 56), size: 19, color: IX.ink, maxWidth: r.width - 48, w: FontWeight.w400);
    // Legend, top right of the stage.
    var y = 30.0;
    IxPaint.label(c, drawn, Offset(size.width - 30, y), size: 17, color: IX.inkSoft, align: Alignment.centerRight, w: FontWeight.w600);
    for (final (col, t) in [(_mat, 'maternal (from mother)'), (_pat, 'paternal (from father)')]) {
      y += 30;
      IxPaint.label(c, t, Offset(size.width - 30, y), size: 17, color: IX.inkSoft, align: Alignment.centerRight);
      c.drawLine(Offset(size.width - 250, y), Offset(size.width - 222, y), Paint()..color = col..strokeWidth = 10..strokeCap = StrokeCap.round);
    }
  }

  void _cellBody(Canvas c, Offset ctr, double rx, double ry, bool plant, {int seed = 1}) {
    if (plant) {
      final rr = RRect.fromRectAndRadius(Rect.fromCenter(center: ctr, width: rx * 2, height: ry * 2), Radius.circular(rx * 0.12));
      c.drawRRect(rr.inflate(10), Paint()..color = BioC.wall);
      c.drawRRect(rr.inflate(10), Paint()..color = Bio.darken(BioC.wall, 0.3)..style = PaintingStyle.stroke..strokeWidth = 2);
      Bio.soft(c, Path()..addRRect(rr), BioC.cytoplasm, stroke: 2.5, edge: BioC.membrane, shadow: false, light: 0.5);
    } else {
      Bio.soft(c, Bio.blob(ctr, rx, ry, seed: seed, wobble: 0.025), BioC.cytoplasm, stroke: 3.5, edge: BioC.membrane, light: 0.5);
    }
  }

  void _nucleusEnv(Canvas c, Offset at, double r, {bool fading = false, bool threads = true, int seed = 2}) {
    final p = Bio.blob(at, r, r * 0.92, seed: seed, wobble: 0.03);
    if (fading) {
      IxPaint.dashed(c, at + Offset(-r, 0), at + Offset(-r, 0), Paint());
      for (final m in p.computeMetrics()) {
        for (var s = 0.0; s < m.length; s += 26) {
          c.drawPath(m.extractPath(s, s + 14), Paint()..color = BioC.nucleus..style = PaintingStyle.stroke..strokeWidth = 3);
        }
      }
      return;
    }
    Bio.soft(c, p, Bio.lighten(BioC.nucleus, 0.62), stroke: 3, edge: BioC.nucleus, shadow: false);
    if (threads) {
      final rnd = math.Random(seed);
      for (var k = 0; k < 18; k++) {
        final a = at + Offset((rnd.nextDouble() - 0.5) * r * 1.3, (rnd.nextDouble() - 0.5) * r * 1.2);
        final path = Path()..moveTo(a.dx, a.dy)..relativeCubicTo(rnd.nextDouble() * 30 - 15, rnd.nextDouble() * 30 - 15, rnd.nextDouble() * 30 - 15, rnd.nextDouble() * 30 - 15, rnd.nextDouble() * 34 - 17, rnd.nextDouble() * 34 - 17);
        c.drawPath(path, Paint()..color = (k.isEven ? _mat : _pat).withValues(alpha: 0.55)..style = PaintingStyle.stroke..strokeWidth = 2.2..strokeCap = StrokeCap.round);
      }
      c.drawCircle(at + Offset(r * 0.25, -r * 0.2), r * 0.18, Paint()..color = BioC.nucleolus.withValues(alpha: 0.85));
    }
  }

  /// A chromosome centred on its centromere: [l1] and [l2] arm lengths along angle [a]; two
  /// sister chromatids unless [single]. [swap] recolours the tip of the lower chromatid's
  /// long arm (a crossover).
  static void chromo(Canvas c, Offset at, double a, double l1, double l2, Color col, {bool single = false, Color? swap, double w = 13, double splay = 0.22}) {
    final u = Offset(math.cos(a), math.sin(a)), n = Offset(-u.dy, u.dx);
    void rod(double side, Color cc, {double from = -1, double to = 1, Color? tipC}) {
      final path = Path();
      final pts = <Offset>[];
      for (var k = 0; k <= 20; k++) {
        final t = -l1 + (l1 + l2) * k / 20;
        final off = single ? 0.0 : side * (w * 0.48 + splay * t.abs());
        pts.add(at + u * t + n * off);
      }
      path.addPolygon(pts, false);
      c.drawPath(path.shift(const Offset(1.5, 3)), Paint()..color = const Color(0x2213165A)..style = PaintingStyle.stroke..strokeWidth = w..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round);
      c.drawPath(path, Paint()..color = cc..style = PaintingStyle.stroke..strokeWidth = w..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round);
      if (tipC != null) {
        final tip = Path()..addPolygon(pts.sublist(15), false);
        c.drawPath(tip, Paint()..color = tipC..style = PaintingStyle.stroke..strokeWidth = w..strokeCap = StrokeCap.round);
      }
      c.drawPath(path, Paint()..color = Colors.white.withValues(alpha: 0.28)..style = PaintingStyle.stroke..strokeWidth = w * 0.28..strokeCap = StrokeCap.round);
    }

    if (single) {
      rod(0, col, tipC: swap);
    } else {
      rod(-1, col);
      rod(1, col, tipC: swap);
    }
    c.drawCircle(at, w * (single ? 0.5 : 0.62), Paint()..color = Bio.darken(col, 0.35));
  }

  /// A daughter chromosome being pulled: centromere leads towards [dir], arms trail.
  static void vChromo(Canvas c, Offset at, double dir, double l1, double l2, Color col, {Color? swap, double w = 13}) {
    for (final (len, da, tipC) in [(l1, 0.32, null), (l2, -0.32, swap)]) {
      final back = dir + math.pi + da;
      final end = at + Offset(math.cos(back), math.sin(back)) * len;
      final mid = at + Offset(math.cos(back + da * 0.3), math.sin(back + da * 0.3)) * len * 0.5;
      final p = Path()..moveTo(at.dx, at.dy)..quadraticBezierTo(mid.dx, mid.dy, end.dx, end.dy);
      c.drawPath(p, Paint()..color = col..style = PaintingStyle.stroke..strokeWidth = w..strokeCap = StrokeCap.round);
      if (tipC != null) {
        final m = p.computeMetrics().first;
        c.drawPath(m.extractPath(m.length * 0.68, m.length), Paint()..color = tipC..style = PaintingStyle.stroke..strokeWidth = w..strokeCap = StrokeCap.round);
      }
    }
    c.drawCircle(at, w * 0.5, Paint()..color = Bio.darken(col, 0.35));
  }

  void _centrioles(Canvas c, Offset at) {
    for (final (o, a) in [(const Offset(-6, 0), 0.0), (const Offset(6, 6), math.pi / 2)]) {
      c.save();
      c.translate(at.dx + o.dx, at.dy + o.dy);
      c.rotate(a);
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset.zero, width: 22, height: 10), const Radius.circular(3)), Paint()..color = const Color(0xFF59627E));
      c.restore();
    }
    // Aster rays.
    for (var a = 0.0; a < 2 * math.pi; a += math.pi / 8) {
      c.drawLine(at + Offset(math.cos(a), math.sin(a)) * 18, at + Offset(math.cos(a), math.sin(a)) * 40, Paint()..color = IX.muted.withValues(alpha: 0.6)..strokeWidth = 1.4);
    }
  }

  void _spindle(Canvas c, Offset p1, Offset p2, List<Offset> kin) {
    final fib = Paint()..color = const Color(0xFF8E98B8)..strokeWidth = 1.5;
    final mid = (p1 + p2) / 2, len = (p2 - p1).distance;
    for (var k = -3; k <= 3; k++) {
      final ctl = mid + Offset(0, k * len * 0.08);
      final path = Path()..moveTo(p1.dx, p1.dy)..quadraticBezierTo(ctl.dx, ctl.dy, p2.dx, p2.dy);
      c.drawPath(path, Paint()..color = fib.color.withValues(alpha: 0.45)..style = PaintingStyle.stroke..strokeWidth = 1.3);
    }
    for (final q in kin) {
      c.drawLine(p1, q, fib);
      c.drawLine(p2, q, fib);
    }
  }

  void _mitosisCell(Canvas c, Offset ctr, double r, int st, bool plant) {
    final cols = [_mat, _pat, _mat, _pat];
    final arms = [(46.0, 74.0), (46.0, 74.0), (28.0, 40.0), (28.0, 40.0)];
    final poleL = ctr + Offset(-r * 0.78, 0), poleR = ctr + Offset(r * 0.78, 0);
    final labels = <BioPart>[];
    if (st == 5) {
      // Two daughter cells.
      final d = r * 0.52;
      for (final s in [-1.0, 1.0]) {
        final cc = ctr + Offset(s * d * 1.02, 0);
        _cellBody(c, cc, d * 0.98, r * 0.78, plant, seed: s > 0 ? 3 : 4);
        _nucleusEnv(c, cc, d * 0.42, seed: s > 0 ? 5 : 6);
        if (!plant) _centrioles(c, cc + Offset(s * d * 0.6, -r * 0.5));
      }
      if (plant) {
        c.drawLine(ctr + Offset(0, -r * 0.78 - 10), ctr + Offset(0, r * 0.78 + 10), Paint()..color = Bio.darken(BioC.wall, 0.25)..strokeWidth = 7);
        labels.add(BioPart('plate', 'Cell plate → middle lamella', ctr + Offset(0, -r * 0.5)));
      } else {
        labels.add(BioPart('furrow', 'Cleavage furrow complete', ctr + Offset(0, -r * 0.62)));
      }
      labels.add(BioPart('n', 'Daughter nucleus (2n)', ctr + Offset(d * 1.02 + d * 0.2, 0)));
    } else {
      if (st == 4 && !plant) {
        // Furrow starting.
        final body = Path()
          ..moveTo(ctr.dx, ctr.dy - r * 0.62)
          ..cubicTo(ctr.dx + r * 0.5, ctr.dy - r * 0.95, ctr.dx + r * 1.08, ctr.dy - r * 0.6, ctr.dx + r * 1.08, ctr.dy)
          ..cubicTo(ctr.dx + r * 1.08, ctr.dy + r * 0.6, ctr.dx + r * 0.5, ctr.dy + r * 0.95, ctr.dx, ctr.dy + r * 0.62)
          ..cubicTo(ctr.dx - r * 0.5, ctr.dy + r * 0.95, ctr.dx - r * 1.08, ctr.dy + r * 0.6, ctr.dx - r * 1.08, ctr.dy)
          ..cubicTo(ctr.dx - r * 1.08, ctr.dy - r * 0.6, ctr.dx - r * 0.5, ctr.dy - r * 0.95, ctr.dx, ctr.dy - r * 0.62)
          ..close();
        Bio.soft(c, body, BioC.cytoplasm, stroke: 3.5, edge: BioC.membrane, light: 0.5);
        labels.add(BioPart('furrow', 'Furrow begins', ctr + Offset(0, -r * 0.64)));
      } else {
        _cellBody(c, ctr, st == 4 ? r * 1.08 : r, st == 4 ? r * 0.8 : r * 0.86, plant);
      }
      switch (st) {
        case 0:
          _nucleusEnv(c, ctr, r * 0.46);
          if (!plant) _centrioles(c, ctr + Offset(r * 0.55, -r * 0.5));
          labels.addAll([BioPart('nuc', 'Nucleus (chromatin)', ctr + Offset(-r * 0.2, r * 0.2)), BioPart('nl', 'Nucleolus', ctr + Offset(r * 0.25 * 0.46, -r * 0.2 * 0.46)), if (!plant) BioPart('cen', 'Centrioles (duplicated)', ctr + Offset(r * 0.55, -r * 0.5))]);
        case 1:
          _nucleusEnv(c, ctr, r * 0.5, fading: true);
          final pos = [ctr + Offset(-r * 0.2, -r * 0.18), ctr + Offset(r * 0.18, r * 0.2), ctr + Offset(r * 0.2, -r * 0.22), ctr + Offset(-r * 0.22, r * 0.24)];
          final ang = [0.6, -0.9, 2.2, 1.3];
          for (var k = 0; k < 4; k++) {
            chromo(c, pos[k], ang[k], arms[k].$1 * 0.8, arms[k].$2 * 0.8, cols[k], splay: 0.04);
          }
          if (!plant) {
            _centrioles(c, ctr + Offset(-r * 0.62, -r * 0.42));
            _centrioles(c, ctr + Offset(r * 0.62, r * 0.42));
          }
          labels.addAll([BioPart('ch', 'Chromosome: 2 chromatids', pos[2] + Offset(math.cos(2.2), math.sin(2.2)) * 50), BioPart('cm', 'Centromere', pos[1]), BioPart('env', 'Nuclear envelope breaking down', ctr + Offset(-r * 0.5, 0)), if (!plant) BioPart('cen', 'Centrosome moving to pole', ctr + Offset(-r * 0.62, -r * 0.42))]);
        case 2:
          final ys = [-r * 0.42, -r * 0.14, r * 0.12, r * 0.34];
          final kin = [for (final y in ys) ctr + Offset(0, y)];
          _spindle(c, poleL, poleR, kin);
          for (var k = 0; k < 4; k++) {
            chromo(c, kin[k], math.pi / 2, arms[k].$1 * 0.62, arms[k].$1 * 0.62, cols[k], splay: 0.04);
          }
          // Metaphase plate.
          IxPaint.dashed(c, ctr + Offset(0, -r * 0.8), ctr + Offset(0, r * 0.8), Paint()..color = IX.accent.withValues(alpha: 0.5)..strokeWidth = 2);
          if (!plant) {
            _centrioles(c, poleL);
            _centrioles(c, poleR);
          }
          labels.addAll([BioPart('plate', 'Metaphase plate', ctr + Offset(0, r * 0.72)), BioPart('sp', 'Spindle fibre', Offset.lerp(poleR, kin[0], 0.5)!), BioPart('k', 'Kinetochore', kin[1] + const Offset(8, 0)), BioPart('pole', plant ? 'Pole (no centriole)' : 'Centrioles at pole', poleL)]);
        case 3:
          final ys = [-r * 0.36, -r * 0.12, r * 0.12, r * 0.34];
          final kl = [for (final y in ys) ctr + Offset(-r * 0.36, y * 0.8)];
          final kr = [for (final y in ys) ctr + Offset(r * 0.36, y * 0.8)];
          _spindle(c, poleL, poleR, [...kl, ...kr]);
          for (var k = 0; k < 4; k++) {
            vChromo(c, kl[k], math.pi, arms[k].$1 * 0.5, arms[k].$2 * 0.5, cols[k]);
            vChromo(c, kr[k], 0, arms[k].$1 * 0.5, arms[k].$2 * 0.5, cols[k]);
          }
          if (!plant) {
            _centrioles(c, poleL);
            _centrioles(c, poleR);
          }
          labels.addAll([BioPart('d', 'Daughter chromosomes', kr[0]), BioPart('cm', 'Centromere leads', kl[3]), BioPart('sp', 'Spindle shortens', Offset.lerp(poleL, kl[0], 0.4)!)]);
        case 4:
          for (final s in [-1.0, 1.0]) {
            final nc = ctr + Offset(s * r * 0.55, 0);
            _nucleusEnv(c, nc, r * 0.3, seed: s > 0 ? 7 : 8);
          }
          if (plant) {
            for (var y = -0.5; y <= 0.5; y += 0.1) {
              c.drawCircle(ctr + Offset(0, y * r), 6, Paint()..color = BioC.golgi);
            }
            labels.add(BioPart('v', 'Vesicles: cell plate starts', ctr + Offset(0, -r * 0.35)));
          }
          labels.addAll([BioPart('n', 'Nuclear envelope re-forms', ctr + Offset(r * 0.55 + r * 0.3, 0)), BioPart('n2', 'Chromosomes decondense', ctr + Offset(-r * 0.55, 0))]);
      }
    }
    drawLabels(c, labels, layoutLabels(labels, midX: ctr.dx, leftX: ctr.dx - r * 1.12 - 50, rightX: ctr.dx + r * 1.12 + 50, top: ctr.dy - r, bottom: ctr.dy + r), null, size: 17);
  }

  // ------------------------------------------------------------------ meiosis

  Widget _meio() {
    final st = i('step').clamp(0, 11), n2 = i('n2'), nn = n2 ~/ 2;
    final (chr, cht, dna, cells) = switch (st) {
      <= 5 => (n2, 2 * n2, '4C', 1),
      6 => (n2, 2 * n2, '4C', 1),
      7 || 8 || 9 => (nn, n2, '2C', 2),
      10 => (n2, n2, '2C', 2),
      _ => (nn, nn, '1C', 4),
    };
    return frame(
      title: 'Meiosis: ${_meiosis[st]}',
      subtitle: _sub,
      formula: '2n → n + n + n + n',
      readouts: [
        Readout(st <= 4 ? 'Prophase I' : 'Stage', _meiosis[st], '', IX.accent),
        Readout(cells > 1 ? 'Chromosomes per cell' : 'Chromosomes', '$chr', ''),
        Readout(cells > 1 ? 'Chromatids per cell' : 'Chromatids', '$cht', '', IX.inkSoft),
        Readout('DNA per cell', dna, '', IX.green),
      ],
      controls: [
        stepper('step', _meiosis),
        slider('n2', 'Diploid number 2n (counts)', 2, 48, div: 23, fmt: (x) => '${x.round()}  (n = ${x.round() ~/ 2})'),
      ],
      painter: BioPainter((c, size) {
        final ctr = Offset(size.width * 0.5, (size.height - 190) / 2 + 10);
        final r = math.min(size.width * 0.24, (size.height - 190) * 0.42);
        _meiosisCell(c, ctr, r, st);
        _textCard(c, Rect.fromLTWH(24, size.height - 180, size.width - 48, 160), _meiosis[st], _meiosisText[st], size, 'Drawn with 2n = 4, $cells cell${cells > 1 ? 's' : ''}');
      }),
    );
  }

  void _meiosisCell(Canvas c, Offset ctr, double r, int st) {
    final labels = <BioPart>[];
    const long = (40.0, 66.0), short = (24.0, 36.0);
    if (st <= 6) {
      _cellBody(c, ctr, r, r * 0.88, false);
      if (st <= 3) _nucleusEnv(c, ctr, r * 0.6, threads: false, fading: st == 3);
      if (st <= 3) {
        if (st == 0) {
          final rnd = math.Random(3);
          for (var k = 0; k < 4; k++) {
            final a = ctr + Offset((rnd.nextDouble() - 0.5) * r * 0.6, (rnd.nextDouble() - 0.5) * r * 0.6);
            final p = Bio.smooth([for (var j = 0; j < 6; j++) a + Offset(j * 22.0 - 55, math.sin(j * 1.7 + k) * 22)], closed: false);
            Bio.stroke(c, p, k.isEven ? _mat : _pat, 4);
          }
          labels.add(BioPart('t', 'Long, thin chromosomes', ctr + Offset(r * 0.1, -r * 0.1)));
        } else {
          final gap = st == 1 ? 26.0 : (st == 2 ? 14.0 : 22.0);
          for (final (k, (l1, l2), y) in [(0, long, -r * 0.18), (1, short, r * 0.26)]) {
            final at = ctr + Offset(k == 0 ? -r * 0.12 : r * 0.12, y);
            chromo(c, at - Offset(0, gap), 0, l1 * 1.2, l2 * 1.2, _mat, splay: st == 3 ? 0.10 : 0.0, w: 11, swap: st >= 2 && k == 0 ? _pat : null);
            chromo(c, at + Offset(0, gap), 0, l1 * 1.2, l2 * 1.2, _pat, splay: st == 3 ? 0.10 : 0.0, w: 11, swap: st >= 2 && k == 0 ? _mat : null);
            if (st == 2 && k == 0) {
              final x = at + Offset(l2 * 1.2 * 0.62, 0);
              c.drawCircle(x, 14, Paint()..color = IX.amber.withValues(alpha: 0.25));
              c.drawCircle(x, 14, Paint()..color = IX.amber..style = PaintingStyle.stroke..strokeWidth = 2.5);
              labels.add(BioPart('x', 'Crossing over (recombination nodule)', x));
            }
            if (st == 3 && k == 0) labels.add(BioPart('x', 'Chiasma', at + Offset(l2 * 1.2 * 0.6, 0)));
          }
          labels.add(BioPart('b', st == 1 ? 'Synapsis: homologues pair' : 'Bivalent (tetrad)', ctr + Offset(r * 0.12 - short.$1, r * 0.26)));
          if (st == 1) labels.add(BioPart('sc', 'Synaptonemal complex forming', ctr + Offset(-r * 0.12, -r * 0.18)));
        }
      } else {
        final poleL = ctr + Offset(-r * 0.78, 0), poleR = ctr + Offset(r * 0.78, 0);
        if (st == 4) {
          for (final (k, (l1, l2), y) in [(0, long, -r * 0.2), (1, short, r * 0.28)]) {
            final at = ctr + Offset(0, y);
            chromo(c, at - const Offset(0, 22), 0.15, l1, l2, _mat, swap: k == 0 ? _pat : null);
            chromo(c, at + const Offset(0, 22), -0.15, l1, l2, _pat, swap: k == 0 ? _mat : null);
          }
          _centrioles(c, poleL + const Offset(30, -40));
          _centrioles(c, poleR + const Offset(-30, 40));
          labels.addAll([BioPart('t', 'Chiasmata terminalise', ctr + Offset(long.$2 * 0.9, -r * 0.2)), BioPart('s', 'Spindle assembling', poleL + const Offset(30, -40))]);
        } else if (st == 5) {
          final kin = [ctr + Offset(-22, -r * 0.3), ctr + Offset(22, -r * 0.3), ctr + Offset(-18, r * 0.25), ctr + Offset(18, r * 0.25)];
          _spindle(c, poleL, poleR, kin);
          chromo(c, kin[0], math.pi / 2, long.$1 * 0.8, long.$2 * 0.8, _mat, swap: _pat);
          chromo(c, kin[1], math.pi / 2, long.$1 * 0.8, long.$2 * 0.8, _pat, swap: _mat);
          chromo(c, kin[2], math.pi / 2, short.$1, short.$2, _mat);
          chromo(c, kin[3], math.pi / 2, short.$1, short.$2, _pat);
          IxPaint.dashed(c, ctr + Offset(0, -r * 0.8), ctr + Offset(0, r * 0.8), Paint()..color = IX.accent.withValues(alpha: 0.5)..strokeWidth = 2);
          _centrioles(c, poleL);
          _centrioles(c, poleR);
          labels.addAll([BioPart('b', 'Bivalents on the plate', kin[2]), BioPart('s', 'Fibres to each homologue', Offset.lerp(poleR, kin[1], 0.5)!)]);
        } else {
          final kl = [ctr + Offset(-r * 0.38, -r * 0.28), ctr + Offset(-r * 0.38, r * 0.25)];
          final kr = [ctr + Offset(r * 0.38, -r * 0.28), ctr + Offset(r * 0.38, r * 0.25)];
          _spindle(c, poleL, poleR, [...kl, ...kr]);
          chromo(c, kl[0], math.pi / 2, long.$1 * 0.8, long.$2 * 0.8, _mat, swap: _pat);
          chromo(c, kr[0], math.pi / 2, long.$1 * 0.8, long.$2 * 0.8, _pat, swap: _mat);
          chromo(c, kl[1], math.pi / 2, short.$1, short.$2, _pat);
          chromo(c, kr[1], math.pi / 2, short.$1, short.$2, _mat);
          _centrioles(c, poleL);
          _centrioles(c, poleR);
          labels.addAll([BioPart('h', 'Homologues separate', kr[0]), BioPart('s', 'Sister chromatids stay together', kl[1])]);
        }
      }
    } else if (st <= 10) {
      final d = r * 0.62;
      for (final s in [-1.0, 1.0]) {
        final cc = ctr + Offset(s * d * 1.05, 0);
        _cellBody(c, cc, d, r * 0.8, false, seed: s > 0 ? 3 : 4);
        // Left cell got maternal long + paternal short (independent assortment).
        final lc = s < 0 ? _mat : _pat, sc = s < 0 ? _pat : _mat;
        final ls = s < 0 ? _pat : _mat;
        if (st == 7) {
          _nucleusEnv(c, cc, d * 0.6, threads: false);
          chromo(c, cc + const Offset(-10, -20), 0.3, long.$1 * 0.8, long.$2 * 0.8, lc, swap: ls);
          chromo(c, cc + const Offset(10, 40), -0.4, short.$1, short.$2, sc);
        } else if (st == 8) {
          _nucleusEnv(c, cc, d * 0.6, fading: true);
          chromo(c, cc + const Offset(-10, -20), 0.9, long.$1 * 0.8, long.$2 * 0.8, lc, swap: ls);
          chromo(c, cc + const Offset(12, 40), -0.6, short.$1, short.$2, sc);
          _centrioles(c, cc + Offset(0, -r * 0.6));
        } else if (st == 9) {
          final pT = cc + Offset(0, -r * 0.66), pB = cc + Offset(0, r * 0.66);
          final kin = [cc + Offset(-d * 0.28, 0), cc + Offset(d * 0.32, 0)];
          _spindle(c, pT, pB, kin);
          chromo(c, kin[0], 0, long.$1 * 0.7, long.$2 * 0.7, lc, swap: ls, splay: 0.02);
          chromo(c, kin[1], 0, short.$1, short.$2, sc, splay: 0.02);
          IxPaint.dashed(c, cc + Offset(-d * 0.9, 0), cc + Offset(d * 0.9, 0), Paint()..color = IX.accent.withValues(alpha: 0.5)..strokeWidth = 2);
        } else {
          final pT = cc + Offset(0, -r * 0.66), pB = cc + Offset(0, r * 0.66);
          final up = [cc + Offset(-d * 0.28, -r * 0.3), cc + Offset(d * 0.3, -r * 0.3)];
          final dn = [cc + Offset(-d * 0.28, r * 0.3), cc + Offset(d * 0.3, r * 0.3)];
          _spindle(c, pT, pB, [...up, ...dn]);
          vChromo(c, up[0], -math.pi / 2, long.$1 * 0.6, long.$2 * 0.6, lc);
          vChromo(c, dn[0], math.pi / 2, long.$1 * 0.6, long.$2 * 0.6, lc, swap: ls);
          vChromo(c, up[1], -math.pi / 2, short.$1 * 0.8, short.$2 * 0.8, sc);
          vChromo(c, dn[1], math.pi / 2, short.$1 * 0.8, short.$2 * 0.8, sc);
        }
      }
      labels.add(BioPart('d', switch (st) { 7 => 'Dyad: n chromosomes each', 8 => 'Nuclear membrane disappears', 9 => 'Metaphase II plate', _ => 'Sister chromatids separate' }, ctr + Offset(d * 1.05 + d * 0.3, st == 9 ? 0 : -r * 0.3)));
    } else {
      final d = r * 0.5;
      final combos = [(_mat, _pat, _pat), (_mat, _mat, _pat), (_pat, _mat, _mat), (_pat, _pat, _mat)];
      for (var k = 0; k < 4; k++) {
        final cc = ctr + Offset((k % 2 == 0 ? -1 : 1) * d * 1.05, (k < 2 ? -1 : 1) * d * 0.9);
        _cellBody(c, cc, d * 0.95, d * 0.82, false, seed: k + 2);
        _nucleusEnv(c, cc, d * 0.5, threads: false);
        final (lc, tipc, sc) = combos[k];
        chromo(c, cc + const Offset(-8, -10), 0.4, long.$1 * 0.6, long.$2 * 0.6, lc, single: true, swap: k == 1 || k == 2 ? tipc : null);
        chromo(c, cc + const Offset(14, 22), -0.5, short.$1 * 0.8, short.$2 * 0.8, sc, single: true);
      }
      labels.add(BioPart('t', 'Tetrad of 4 haploid cells', ctr + Offset(d * 1.05 + d * 0.5, -d * 0.9)));
      labels.add(BioPart('r', 'Recombinant chromatid', ctr + Offset(-d * 1.05 + 10, d * 0.9 - 20)));
    }
    drawLabels(c, labels, layoutLabels(labels, midX: ctr.dx, leftX: ctr.dx - r * 1.4 - 20, rightX: ctr.dx + r * 1.4 + 20, top: ctr.dy - r, bottom: ctr.dy + r), null, size: 17);
  }

  // ------------------------------------------------------------------ cycle clock

  Widget _cycle() {
    final g1 = n('g1'), sp = n('s'), g2 = n('g2'), m = n('m');
    final tot = g1 + sp + g2 + m;
    return frame(
      title: 'The cell cycle',
      subtitle: _sub,
      formula: 'interphase = G₁ + S + G₂',
      readouts: [
        Readout('Cycle length', f1(tot), 'h', IX.accent),
        Readout('Interphase', '${f0(100 * (tot - m) / tot)}%', '', IX.green),
        Readout('M phase', '${f1(100 * m / tot)}%', '', IX.positive),
        Readout('DNA after S', '4C', ''),
      ],
      controls: [
        slider('g1', 'G₁ (gap 1: growth)', 1, 20, unit: 'h', dp: 1, div: 38),
        slider('s', 'S (DNA synthesis)', 1, 12, unit: 'h', dp: 1, div: 22),
        slider('g2', 'G₂ (gap 2: proteins for mitosis)', 1, 8, unit: 'h', dp: 1, div: 14),
        slider('m', 'M phase (mitosis + cytokinesis)', 0.5, 3, unit: 'h', dp: 1, div: 5),
      ],
      painter: BioPainter((c, size) {
        final ctr = Offset(size.width * 0.25, size.height * 0.5);
        final R = math.min(size.width * 0.2, size.height * 0.34);
        final phases = [('G₁', g1, const Color(0xFF7FA7D9)), ('S', sp, const Color(0xFF8C6BB1)), ('G₂', g2, const Color(0xFF4FA3A0)), ('M', m, const Color(0xFFD9824B))];
        var a = -math.pi / 2;
        for (final (name, h, col) in phases) {
          final sw = 2 * math.pi * h / tot;
          final path = Path()..moveTo(ctr.dx, ctr.dy)..arcTo(Rect.fromCircle(center: ctr, radius: R), a, sw, false)..close();
          Bio.soft(c, path, col, stroke: 3, edge: Colors.white, shadow: false, light: 0.25);
          final mid = a + sw / 2;
          final lp = ctr + Offset(math.cos(mid), math.sin(mid)) * (R + 46);
          IxPaint.label(c, '$name  ${f1(h)} h', lp, size: 19, color: Bio.darken(col, 0.3), w: FontWeight.w700, halo: true);
          a += sw;
        }
        c.drawCircle(ctr, R * 0.52, Paint()..color = IX.paper);
        IxPaint.label(c, f1(tot), ctr + const Offset(0, -12), size: 40, color: IX.ink, w: FontWeight.w700);
        IxPaint.label(c, 'hours per cycle', ctr + const Offset(0, 24), size: 17, color: IX.inkSoft);
        // G0 exit from G1.
        final g0 = ctr + Offset(-R * 0.75, -R - 70);
        Bio.curvedArrow(c, ctr + Offset(math.cos(-math.pi / 2 + 0.6) * R * 0.2, -R * 0.98).translate(-R * 0.35, 0), g0 + const Offset(30, 18), IX.muted, bend: 30, width: 2.5);
        Bio.tag(c, 'G₀ quiescent', g0, IX.muted);
        // DNA content over three cycles.
        final plot = Plot(Rect.fromLTRB(size.width * 0.62, 110, size.width - 40, size.height * 0.62), 0, 3 * tot, 0, 5);
        plot.frame(c, xs: [for (var k = 0; k <= 3; k++) k * tot], ys: [0, 2, 4], xLabel: 'Time (h)', yLabel: 'DNA per cell', fx: (x) => f0(x), fy: (y) => '${y.round()}C', title: 'DNA content through three cycles');
        double dna(double t) {
          final x = t % tot;
          if (x < g1) return 2;
          if (x < g1 + sp) return 2 + 2 * (x - g1) / sp;
          if (x < tot - m * 0.2) return 4;
          return 2;
        }
        plot.curve(c, dna, const Color(0xFF8C6BB1), w: 4);
        Bio.note(c, 'A human cell in culture divides about once in 24 hours; M phase takes about 1 hour, so more than 95% of the cycle is interphase. Yeast takes about 90 minutes.', Offset(size.width * 0.56, size.height * 0.74), maxWidth: size.width * 0.42, size: 18, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ mitotic index

  Widget _index() {
    final div = i('dividing'), tot = math.max(i('total'), div), cyc = n('cycle');
    final mi = 100 * div / tot;
    return frame(
      title: 'Mitotic index of an onion root tip',
      subtitle: _sub,
      formula: 'MI = dividing ÷ total × 100',
      readouts: [
        Readout('Mitotic index', f1(mi), '%', IX.accent),
        Readout('Cells counted', '$tot', ''),
        Readout('Time in M phase', f1(mi / 100 * cyc * 60), 'min', IX.green),
        Readout('Cycle length', f0(cyc), 'h'),
      ],
      controls: [
        slider('dividing', 'Cells in division', 0, 100),
        slider('total', 'Total cells counted', 100, 600, div: 50),
        slider('cycle', 'Length of the cell cycle', 12, 30, unit: 'h'),
      ],
      painter: BioPainter((c, size) {
        final r = Rect.fromLTWH(40, 70, size.width - 80, size.height - 190);
        Bio.heading(c, 'One field of view (squash of root-tip meristem)', const Offset(40, 24));
        final cols = (math.sqrt(tot * r.width / r.height)).ceil();
        final rows = (tot / cols).ceil();
        final w = r.width / cols, h = r.height / rows;
        final rnd = math.Random(7);
        final idx = List.generate(tot, (k) => k)..shuffle(rnd);
        final dividing = idx.take(div).toSet();
        for (var k = 0; k < tot; k++) {
          final x = r.left + (k % cols) * w + ((k ~/ cols).isOdd ? w / 2 : 0), y = r.top + (k ~/ cols) * h;
          if (x + w > r.right + w / 2) continue;
          final cell = RRect.fromRectAndRadius(Rect.fromLTWH(x + 1.5, y + 1.5, w - 3, h - 3), Radius.circular(math.min(w, h) * 0.2));
          final on = dividing.contains(k);
          c.drawRRect(cell, Paint()..color = on ? const Color(0xFFF4E1EC) : const Color(0xFFF7EEDD));
          c.drawRRect(cell, Paint()..color = on ? BioC.membrane : const Color(0xFFCDB894)..style = PaintingStyle.stroke..strokeWidth = on ? 2 : 1.2);
          final cc = cell.center, s = math.min(w, h);
          if (on) {
            final ph = k % 3;
            final p = Paint()..color = const Color(0xFF7A2E5A)..strokeWidth = math.max(1.6, s * 0.09)..strokeCap = StrokeCap.round;
            if (ph == 0) {
              c.drawLine(cc + Offset(0, -s * 0.3), cc + Offset(0, s * 0.3), p);
            } else if (ph == 1) {
              c.drawLine(cc + Offset(-s * 0.25, -s * 0.25), cc + Offset(-s * 0.25, s * 0.25), p);
              c.drawLine(cc + Offset(s * 0.25, -s * 0.25), cc + Offset(s * 0.25, s * 0.25), p);
            } else {
              for (var j = 0; j < 4; j++) {
                c.drawLine(cc + Offset(-s * 0.2 + j * s * 0.13, -s * 0.18), cc + Offset(-s * 0.15 + j * s * 0.1, s * 0.18), p);
              }
            }
          } else {
            c.drawCircle(cc, s * 0.2, Paint()..color = const Color(0xFFB99BC9));
          }
        }
        Bio.box(c, Rect.fromLTWH(40, size.height - 100, size.width - 80, 64), '$div of $tot cells dividing  →  MI = ${f1(mi)}%  →  M phase ≈ ${f1(mi / 100 * cyc)} h of a ${f0(cyc)} h cycle', color: IX.accent, size: 21);
      }),
    );
  }

  // ------------------------------------------------------------------ growth by mitosis

  Widget _doubling() {
    final k = i('rounds'), n2 = i('n2');
    final cells = math.pow(2, k).toInt();
    return frame(
      title: 'Growth by repeated mitosis',
      subtitle: _sub,
      formula: 'cells = 2ⁿ after n rounds',
      readouts: [
        Readout('Rounds of mitosis', '$k', '', IX.accent),
        Readout('Cells', grp(cells), '', IX.green),
        Readout('Chromosomes per cell', '$n2', ''),
        Readout('Rounds to pass 1000', '10', '', IX.inkSoft),
      ],
      controls: [
        slider('rounds', 'Rounds of mitosis', 0, 10),
        slider('n2', 'Chromosomes per cell (2n)', 2, 48, div: 23),
      ],
      painter: BioPainter((c, size) {
        final side = math.min(size.width * 0.55, size.height - 160);
        final r = Rect.fromLTWH(60, (size.height - side) / 2 + 10, side, side);
        final cols = math.pow(2, (k + 1) ~/ 2).toInt(), rows = math.pow(2, k ~/ 2).toInt();
        final w = r.width / cols, h = r.height / rows;
        for (var x = 0; x < cols; x++) {
          for (var y = 0; y < rows; y++) {
            final cell = Rect.fromLTWH(r.left + x * w, r.top + y * h, w, h).deflate(math.min(3, w * 0.06));
            Bio.soft(c, Path()..addRRect(RRect.fromRectAndRadius(cell, Radius.circular(math.min(w, h) * 0.18))), const Color(0xFFF2D7C4), stroke: math.max(0.8, math.min(2.5, w / 20)), edge: BioC.membrane, shadow: false, light: 0.4);
            c.drawCircle(cell.center, math.min(w, h) * 0.18, Paint()..color = BioC.nucleus.withValues(alpha: 0.85));
          }
        }
        Bio.heading(c, 'One cell → ${grp(cells)} cells', r.topLeft + const Offset(0, -40));
        final px = r.right + 60;
        final bars = Rect.fromLTRB(px + 80, 120, size.width - 40, size.height - 220);
        final plot = Plot(bars, -0.5, 10.5, 1, 2000, logY: true);
        plot.frame(c, xs: [0, 2, 4, 6, 8, 10], ys: [1, 10, 100, 1000], xLabel: 'Rounds of mitosis', yLabel: 'Number of cells (log scale)', title: 'Doubling each round');
        for (var j = 0; j <= 10; j++) {
          final p = plot.pt(j.toDouble(), math.pow(2, j).toDouble());
          c.drawCircle(p, j == k ? 10 : 6, Paint()..color = j <= k ? IX.accent : IX.rule);
        }
        Bio.note(c, 'Every daughter cell keeps the full chromosome number (2n = $n2), because each chromatid of every chromosome goes to a different daughter.', Offset(px, size.height - 120), maxWidth: size.width - px - 40, size: 18, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ assortment

  Widget _assort() {
    final pairs = i('pairs').clamp(1, 23), seed = i('seed');
    final kinds = math.pow(2, pairs).toDouble();
    final rnd = math.Random(seed * 31 + pairs);
    final orient = [for (var k = 0; k < pairs; k++) rnd.nextBool()];
    return frame(
      title: 'Independent assortment at metaphase I',
      subtitle: _sub,
      formula: 'kinds of gametes = 2ⁿ',
      readouts: [
        Readout('Pairs of homologues n', '$pairs', '', IX.accent),
        Readout('Kinds of gametes', pairs > 16 ? sci(kinds) : grp(kinds), '', IX.green),
        Readout('Chance two match', pairs > 12 ? '1 in ${sci(kinds)}' : '1 in ${grp(kinds)}', ''),
        Readout('Gamete chromosomes', '$pairs', 'n'),
      ],
      controls: [
        slider('pairs', 'Pairs of homologous chromosomes n', 1, 23),
        action('Make another gamete', Icons.shuffle_rounded, () => set('seed', seed + 1)),
      ],
      painter: BioPainter((c, size) {
        final show = math.min(pairs, 6);
        final ctr = Offset(size.width * 0.33, size.height * 0.5);
        final r = math.min(size.width * 0.24, size.height * 0.40);
        _cellBody(c, ctr, r * 0.8, r, false);
        IxPaint.dashed(c, ctr + Offset(0, -r * 0.95), ctr + Offset(0, r * 0.95), Paint()..color = IX.accent.withValues(alpha: 0.5)..strokeWidth = 2);
        IxPaint.label(c, 'to gamete', ctr + Offset(-r * 0.6, -r * 0.85), size: 17, color: IX.accent, w: FontWeight.w600);
        IxPaint.label(c, 'to other cell', ctr + Offset(r * 0.6, -r * 0.85), size: 17, color: IX.muted, w: FontWeight.w600);
        final gametes = <Color>[];
        for (var k = 0; k < show; k++) {
          final y = ctr.dy - r * 0.7 + (k + 0.5) * r * 1.4 / show;
          final len = 20.0 + (show - k) * 6;
          final left = orient[k] ? _mat : _pat, right = orient[k] ? _pat : _mat;
          chromo(c, Offset(ctr.dx - 26, y), math.pi / 2, len * 0.7, len * 0.7, left, w: 11, splay: 0.03);
          chromo(c, Offset(ctr.dx + 26, y), math.pi / 2, len * 0.7, len * 0.7, right, w: 11, splay: 0.03);
          gametes.add(left);
        }
        if (pairs > show) IxPaint.label(c, '+ ${pairs - show} more pairs', ctr + Offset(0, r * 0.82), size: 17, color: IX.inkSoft, halo: true);
        // The gamete this orientation gives.
        final gc = Offset(size.width * 0.78, size.height * 0.36);
        Bio.heading(c, 'This gamete (n = $pairs)', gc + const Offset(-150, -150));
        Bio.soft(c, Bio.blob(gc, 130, 110, seed: 9, wobble: 0.03), const Color(0xFFF7E8D8), stroke: 3, edge: BioC.membrane);
        for (var k = 0; k < show; k++) {
          final x = gc.dx - 90 + k * 180 / math.max(show - 1, 1);
          chromo(c, Offset(x, gc.dy), math.pi / 2, 20.0 + (show - k) * 6, 20.0 + (show - k) * 6, gametes[k], w: 11, splay: 0);
        }
        Bio.note(c, pairs <= 4 ? 'With n = $pairs the possible gametes are ${grp(kinds)}. Each press lines the pairs up again at random.' : 'With n = 23, as in humans, one person can make 2²³ ≈ 8.4 million kinds of gametes, even before crossing over.', Offset(size.width * 0.62, size.height * 0.62), maxWidth: size.width * 0.35, size: 18, color: IX.ink);
      }),
    );
  }
}
