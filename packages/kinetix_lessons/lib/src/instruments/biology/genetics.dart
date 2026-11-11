import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bio_kit.dart';

/// Principles of inheritance and variation (2nd PUC Biology ch. 4): monohybrid and dihybrid
/// Punnett squares with Mendel's peas, incomplete dominance, ABO multiple alleles, polygenic
/// inheritance, sex-linked inheritance with family risk, and pedigree charts.
///
/// Preset: {"mode": "mono"|"dihybrid"|"abo"|"polygenic"|"sexlinked"|"pedigree", "p1": "Tt", "p2": "Tt",
/// "dominance": "complete", "batch": 100, "seed": 0, "d1": "RrYy", "d2": "RrYy", "rf": 0,
/// "mother": "IAi", "father": "IBi", "alleles": 3, "genes": 3, "xm": "XHXh", "xf": "XHY", "risk": 25,
/// "children": 3, "trait": "xlinked"}.
class GeneticsInstrument extends StatefulWidget {
  const GeneticsInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<GeneticsInstrument> createState() => _GenState();
}

class _GenState extends BioState<GeneticsInstrument> {
  @override
  String get instrumentId => 'bio-genetics';
  @override
  Map<String, dynamic> get lessonPreset => widget.preset;
  @override
  List<String> get modes => const ['mono', 'dihybrid', 'abo', 'polygenic', 'sexlinked', 'pedigree'];
  @override
  Map<String, Map<String, dynamic>> get presets => const {
    'Monohybrid Tt × Tt': {'mode': 'mono'},
    'Test cross Tt × tt': {'mode': 'mono', 'p2': 'tt'},
    'Incomplete dominance': {'mode': 'mono', 'dominance': 'incomplete'},
    'Dihybrid RrYy × RrYy': {'mode': 'dihybrid'},
    'ABO blood groups': {'mode': 'abo'},
    'Polygenic: skin colour': {'mode': 'polygenic'},
    'Haemophilia carrier': {'mode': 'sexlinked'},
    'Pedigree': {'mode': 'pedigree'},
  };
  @override
  Map<String, Object> defaults(String mode) => {
    'p1': 'Tt', 'p2': 'Tt', 'dominance': 'complete', 'batch': 100, 'seed': 0, 'd1': 'RrYy', 'd2': 'RrYy', 'rf': 0, 'mother': 'IAi', 'father': 'IBi',
    'alleles': 3, 'genes': 3, 'xm': 'XHXh', 'xf': 'XHY', 'risk': 25, 'children': 3, 'trait': 'xlinked',
  };

  static const _sub = '2nd PUC Biology · Principles of inheritance and variation';

  @override
  Widget build(BuildContext context) => switch (mode) {
    'dihybrid' => _dihybrid(),
    'abo' => _abo(),
    'polygenic' => _polygenic(),
    'sexlinked' => _sexlinked(),
    'pedigree' => _pedigree(),
    _ => _mono(),
  };

  /// A Punnett square: gametes across the top and down the side; [cell] draws each box.
  void punnett(Canvas c, Rect r, List<String> top, List<String> side, void Function(Rect box, int i, int j) cell, {String topLabel = '♂ gametes', String sideLabel = '♀ gametes', double gameteSize = 22}) {
    final head = math.min(r.width, r.height) * 0.14;
    final cw = (r.width - head) / top.length, ch = (r.height - head) / side.length;
    IxPaint.label(c, topLabel, Offset(r.left + head + (r.width - head) / 2, r.top - 18), size: 17, color: IX.inkSoft, w: FontWeight.w600);
    c.save();
    c.translate(r.left - 18, r.top + head + (r.height - head) / 2);
    c.rotate(-math.pi / 2);
    IxPaint.label(c, sideLabel, Offset.zero, size: 17, color: IX.inkSoft, w: FontWeight.w600);
    c.restore();
    for (var i = 0; i < top.length; i++) {
      final b = Rect.fromLTWH(r.left + head + i * cw, r.top, cw, head).deflate(4);
      c.drawCircle(b.center, math.min(b.width, b.height) * 0.42, Paint()..color = const Color(0xFFE6EEFB));
      IxPaint.label(c, top[i], b.center, size: gameteSize, color: BioC.male, w: FontWeight.w700);
    }
    for (var j = 0; j < side.length; j++) {
      final b = Rect.fromLTWH(r.left, r.top + head + j * ch, head, ch).deflate(4);
      c.drawCircle(b.center, math.min(b.width, b.height) * 0.42, Paint()..color = const Color(0xFFFBE7EF));
      IxPaint.label(c, side[j], b.center, size: gameteSize, color: BioC.female, w: FontWeight.w700);
    }
    for (var i = 0; i < top.length; i++) {
      for (var j = 0; j < side.length; j++) {
        final b = Rect.fromLTWH(r.left + head + i * cw, r.top + head + j * ch, cw, ch);
        c.drawRect(b, Paint()..color = IX.paper);
        cell(b.deflate(3), i, j);
        c.drawRect(b, Paint()..color = IX.rule..style = PaintingStyle.stroke..strokeWidth = 2);
      }
    }
  }

  /// A pea seed: round or wrinkled, yellow or green.
  static void pea(Canvas c, Offset at, double r, {bool round = true, bool yellow = true}) {
    final col = yellow ? const Color(0xFFE6C33A) : const Color(0xFF7FAE3E);
    final path = round ? (Path()..addOval(Rect.fromCircle(center: at, radius: r))) : Bio.blob(at, r * 0.95, r * 0.85, seed: 7, wobble: 0.16, n: 9);
    Bio.soft(c, path, col, stroke: 1.5, light: 0.5);
    if (!round) {
      for (var k = 0; k < 3; k++) {
        c.drawArc(Rect.fromCircle(center: at + Offset(-r * 0.3 + k * r * 0.3, 0), radius: r * 0.4), 0.5, 1.6, false, Paint()..color = Bio.darken(col, 0.25)..strokeWidth = 1.5..style = PaintingStyle.stroke);
      }
    }
  }

  static List<String> _gam(String g) => g.length == 2 ? [g[0], g[1]] : [g];

  /// A tall or dwarf pea plant in [r].
  static void plant(Canvas c, Rect r, double h) {
    final base = r.bottomCenter + const Offset(0, -4);
    final top = base + Offset(0, -r.height * h * 0.92);
    c.drawLine(base, top, Paint()..color = const Color(0xFF5F8E3A)..strokeWidth = 3.5..strokeCap = StrokeCap.round);
    final n = (h * 5).round().clamp(2, 5);
    for (var k = 1; k <= n; k++) {
      final y = base.dy + (top.dy - base.dy) * k / (n + 0.4);
      for (final s in [-1.0, 1.0]) {
        Bio.fill(c, Bio.blob(Offset(base.dx + s * r.width * 0.12, y), r.width * 0.11, r.width * 0.05, seed: k, rot: s * 0.4), BioC.leaf);
      }
    }
    c.drawCircle(top, r.width * 0.06, Paint()..color = const Color(0xFFB57FC9));
  }

  // ------------------------------------------------------------------ monohybrid

  Widget _mono() {
    final p1 = str('p1', 'Tt'), p2 = str('p2', 'Tt');
    final inc = str('dominance') == 'incomplete';
    final g1 = _gam(p1), g2 = _gam(p2);
    final kids = [for (final a in g2) for (final b in g1) _sort(a + b)];
    final counts = {for (final k in {'TT', 'Tt', 'tt'}) k: kids.where((x) => x == k).length / kids.length};
    final dom = (counts['TT'] ?? 0) + (counts['Tt'] ?? 0);
    final nB = i('batch');
    final rnd = math.Random(i('seed') * 17 + nB);
    var tall = 0;
    for (var k = 0; k < nB; k++) {
      final g = _sort(g2[rnd.nextInt(g2.length)] + g1[rnd.nextInt(g1.length)]);
      if (g.contains('T')) tall++;
    }
    final names = inc ? {'TT': 'red RR', 'Tt': 'pink Rr', 'tt': 'white rr'} : {'TT': 'tall TT', 'Tt': 'tall Tt', 'tt': 'dwarf tt'};
    String al(String g) => inc ? g.replaceAll('T', 'R').replaceAll('t', 'r') : g;
    return frame(
      title: inc ? 'Incomplete dominance: snapdragon flower colour' : 'Monohybrid cross: tall and dwarf',
      subtitle: _sub,
      formula: inc ? 'F₂ 1 red : 2 pink : 1 white' : 'F₂ 3 tall : 1 dwarf, genotypes 1 : 2 : 1',
      readouts: [
        Readout('Genotypes', '${f0(4 * (counts['TT'] ?? 0))} : ${f0(4 * (counts['Tt'] ?? 0))} : ${f0(4 * (counts['tt'] ?? 0))}', inc ? 'RR:Rr:rr' : 'TT:Tt:tt', IX.accent),
        Readout('Phenotypes', inc ? '${f0(4 * (counts['TT'] ?? 0))} : ${f0(4 * (counts['Tt'] ?? 0))} : ${f0(4 * (counts['tt'] ?? 0))}' : '${f0(4 * dom)} : ${f0(4 * (1 - dom))}', inc ? 'red:pink:white' : 'tall:dwarf', IX.green),
        Readout('Expected in $nB', inc ? '${f0(nB * (counts['Tt'] ?? 0))} pink' : '${f0(nB * dom)} tall', ''),
        Readout('This batch', inc ? '—' : '$tall tall, ${nB - tall} dwarf', '', IX.inkSoft),
      ],
      controls: [
        choice('p1', 'Parent 1', const {'TT': 'TT', 'Tt': 'Tt', 'tt': 'tt'}),
        choice('p2', 'Parent 2', const {'TT': 'TT', 'Tt': 'Tt', 'tt': 'tt'}),
        choice('dominance', 'Dominance', const {'complete': 'Complete (pea)', 'incomplete': 'Incomplete'}),
        slider('batch', 'Offspring in a batch', 4, 1064),
        action('Grow another batch', Icons.refresh_rounded, () => set('seed', i('seed') + 1)),
      ],
      painter: BioPainter((c, size) {
        final side = math.min(size.width * 0.45, size.height - 120);
        final r = Rect.fromLTWH(70, 70, side, side);
        punnett(c, r, g1.map(al).toList(), g2.map(al).toList(), (b, ii, jj) {
          final g = _sort(g2[jj] + g1[ii]);
          if (inc) {
            final col = {'TT': const Color(0xFFC0392B), 'Tt': const Color(0xFFEFA0B5), 'tt': const Color(0xFFF7F3EE)}[g]!;
            for (var k = 0; k < 5; k++) {
              final a = k / 5 * 2 * math.pi;
              Bio.soft(c, Bio.blob(b.center + Offset(math.cos(a), math.sin(a)) * b.width * 0.16 + const Offset(0, -10), b.width * 0.12, b.width * 0.12, seed: k), col, stroke: 1.2, edge: Bio.darken(col, 0.3), shadow: false);
            }
            c.drawCircle(b.center + const Offset(0, -10), b.width * 0.06, Paint()..color = const Color(0xFFE6C33A));
          } else {
            plant(c, Rect.fromLTWH(b.left + b.width * 0.15, b.top + 6, b.width * 0.7, b.height - 46), g.contains('T') ? 1 : 0.4);
          }
          IxPaint.label(c, al(g), Offset(b.center.dx, b.bottom - 18), size: 21, color: IX.ink, w: FontWeight.w700);
        }, topLabel: 'Parent 1 gametes', sideLabel: 'Parent 2 gametes', gameteSize: 26);
        // Phenotype bars.
        final plot = Plot(Rect.fromLTRB(size.width * 0.62, 110, size.width - 40, size.height * 0.62), -0.5, 2.5, 0, 1.1);
        plot.frame(c, xs: [], ys: [0, 0.25, 0.5, 0.75, 1], fy: (y) => '${f0(y * 100)}%', title: 'Expected offspring');
        plot.bars(c, [counts['TT'] ?? 0, counts['Tt'] ?? 0, counts['tt'] ?? 0], inc ? [const Color(0xFFC0392B), const Color(0xFFEFA0B5), IX.muted] : [IX.green, IX.green, IX.amber], labels: [names['TT']!, names['Tt']!, names['tt']!], fmt: (v) => '${f0(v * 100)}%');
        Bio.note(c, inc ? 'Neither allele is fully dominant: the heterozygote Rr is pink, in between. Phenotype ratio equals genotype ratio, 1 : 2 : 1.' : 'Mendel\'s F₂: 787 tall and 277 dwarf (2.84 : 1). A test cross with tt reveals whether a tall plant is TT or Tt.', Offset(size.width * 0.62, size.height * 0.74), maxWidth: size.width * 0.35, size: 18, color: IX.ink);
      }),
    );
  }

  static String _sort(String g) {
    final ch = g.split('')..sort((a, b) {
      final ua = a.toUpperCase() == a, ub = b.toUpperCase() == b;
      if (a.toLowerCase() != b.toLowerCase()) return a.toLowerCase().compareTo(b.toLowerCase());
      return ua == ub ? 0 : (ua ? -1 : 1);
    });
    return ch.join();
  }

  // ------------------------------------------------------------------ dihybrid

  Widget _dihybrid() {
    final d1 = str('d1', 'RrYy'), d2 = str('d2', 'RrYy');
    List<String> gam(String g) => [for (final a in {g[0], g[1]}) for (final b in {g[2], g[3]}) a + b];
    final g1 = gam(d1), g2 = gam(d2);
    final classes = {'Round yellow': 0, 'Round green': 0, 'Wrinkled yellow': 0, 'Wrinkled green': 0};
    for (final a in g2) {
      for (final bb in g1) {
        final round = (a[0] + bb[0]).contains('R'), yellow = (a[1] + bb[1]).contains('Y');
        classes['${round ? 'Round' : 'Wrinkled'} ${yellow ? 'yellow' : 'green'}'] = classes['${round ? 'Round' : 'Wrinkled'} ${yellow ? 'yellow' : 'green'}']! + 1;
      }
    }
    final tot = g1.length * g2.length;
    final ratio = classes.values.map((v) => v * 16 ~/ tot).join(' : ');
    final nSeeds = i('batch').clamp(16, 1600);
    return frame(
      title: 'Dihybrid cross: seed shape and colour',
      subtitle: _sub,
      formula: 'independent assortment: 9 : 3 : 3 : 1',
      readouts: [
        Readout('Phenotype ratio', ratio, '/16', IX.accent),
        Readout('Gametes per parent', '${g1.length} and ${g2.length}', ''),
        Readout('Round yellow in $nSeeds', f0(nSeeds * classes['Round yellow']! / tot), '', const Color(0xFFB58B00)),
        Readout('Wrinkled green', f0(nSeeds * classes['Wrinkled green']! / tot), '', IX.green),
      ],
      controls: [
        choice('d1', 'Parent 1', const {'RRYY': 'RRYY', 'RrYy': 'RrYy', 'rryy': 'rryy'}),
        choice('d2', 'Parent 2', const {'RRYY': 'RRYY', 'RrYy': 'RrYy', 'rryy': 'rryy'}),
        slider('batch', 'F₂ seeds', 16, 1600, div: 99),
      ],
      painter: BioPainter((c, size) {
        final side = math.min(size.width * 0.55, size.height - 110);
        final r = Rect.fromLTWH(70, 60, side, side);
        punnett(c, r, g1, g2, (b, ii, jj) {
          final a = g2[jj], bb = g1[ii];
          final round = (a[0] + bb[0]).contains('R'), yellow = (a[1] + bb[1]).contains('Y');
          c.drawRect(b, Paint()..color = (yellow ? const Color(0xFFFFF8DC) : const Color(0xFFEFF6E4)));
          pea(c, b.center + Offset(0, -b.height * 0.1), math.min(b.width, b.height) * 0.24, round: round, yellow: yellow);
          IxPaint.label(c, _sort(a[0] + bb[0]) + _sort(a[1] + bb[1]), Offset(b.center.dx, b.bottom - 14), size: math.min(18, b.width / 5), color: IX.ink, w: FontWeight.w700);
        }, gameteSize: g1.length > 2 ? 18 : 24);
        final x0 = size.width * 0.66;
        var y = 90.0;
        for (final e in classes.entries) {
          pea(c, Offset(x0 + 26, y), 22, round: e.key.startsWith('Round'), yellow: e.key.endsWith('yellow'));
          IxPaint.label(c, e.key, Offset(x0 + 64, y), size: 19, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
          IxPaint.label(c, '${e.value * 16 ~/ tot}/16', Offset(size.width - 40, y), size: 20, color: IX.accent, w: FontWeight.w700, align: Alignment.centerRight);
          y += 72;
        }
        Bio.note(c, 'Each gene segregates independently of the other: the 9 : 3 : 3 : 1 is (3 : 1) × (3 : 1). Mendel counted 315 round yellow, 108 round green, 101 wrinkled yellow and 32 wrinkled green. Genes close together on one chromosome are linked and break this rule (Morgan).', Offset(x0, y + 20), maxWidth: size.width - x0 - 30, size: 17, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ ABO

  static const _aboG = {'IAIA': 'IᴬIᴬ', 'IAi': 'Iᴬi', 'IBIB': 'IᴮIᴮ', 'IBi': 'Iᴮi', 'IAIB': 'IᴬIᴮ', 'ii': 'ii'};
  static List<String> _aboGam(String g) => g == 'ii' ? ['i', 'i'] : (g.length == 3 ? [g.substring(0, 2), 'i'] : [g.substring(0, 2), g.substring(2)]);
  static String _group(String a, String b) {
    final s0 = {a, b};
    if (s0.contains('IA') && s0.contains('IB')) return 'AB';
    if (s0.contains('IA')) return 'A';
    if (s0.contains('IB')) return 'B';
    return 'O';
  }

  Widget _abo() {
    final m = str('mother', 'IAi'), f = str('father', 'IBi');
    final gm = _aboGam(m), gf = _aboGam(f);
    final res = {'A': 0, 'B': 0, 'AB': 0, 'O': 0};
    for (final a in gm) {
      for (final b in gf) {
        res[_group(a, b)] = res[_group(a, b)]! + 1;
      }
    }
    final k = i('alleles');
    String pretty(String g) => g.replaceAll('IA', 'Iᴬ').replaceAll('IB', 'Iᴮ');
    return frame(
      title: 'ABO blood groups: multiple alleles',
      subtitle: _sub,
      formula: 'Iᴬ and Iᴮ co-dominant, i recessive',
      readouts: [
        for (final e in res.entries) Readout('Group ${e.key}', '${e.value * 25}', '%', {'A': BioC.oxy, 'B': BioC.deoxy, 'AB': BioC.nucleus, 'O': IX.inkSoft}[e.key]!),
      ],
      controls: [
        for (final (k2, lab) in [('mother', 'Mother'), ('father', 'Father')])
          for (final half in [0, 1])
            IxSegments<String>(
              label: half == 0 ? lab : '',
              options: {for (final e in _aboG.entries.skip(half * 3).take(3)) e.key: e.value},
              value: str(k2),
              onChanged: (x) => set(k2, x),
            ),
        slider('alleles', 'Alleles of a gene in the population', 2, 8),
      ],
      painter: BioPainter((c, size) {
        final side = math.min(size.width * 0.42, size.height - 220);
        final r = Rect.fromLTWH(70, 60, side, side);
        punnett(c, r, gf.map(pretty).toList(), gm.map(pretty).toList(), (b, ii, jj) {
          final g = _group(gm[jj], gf[ii]);
          final col = {'A': BioC.oxy, 'B': BioC.deoxy, 'AB': BioC.nucleus, 'O': IX.inkSoft}[g]!;
          c.drawRect(b, Paint()..color = col.withValues(alpha: 0.10));
          IxPaint.label(c, pretty(gm[jj]) + pretty(gf[ii]), b.center + const Offset(0, -18), size: 20, color: IX.ink, w: FontWeight.w600);
          Bio.tag(c, 'Group $g', b.center + const Offset(0, 22), col, size: 18);
        }, topLabel: 'Father\'s gametes', sideLabel: 'Mother\'s gametes', gameteSize: 24);
        final plot = Plot(Rect.fromLTRB(size.width * 0.58, 110, size.width - 40, size.height * 0.58), -0.5, 3.5, 0, 110);
        plot.frame(c, xs: [], ys: [0, 25, 50, 75, 100], yLabel: 'Chance (%)', title: 'Blood groups of the children');
        plot.bars(c, [for (final v in res.values) v * 25.0], [BioC.oxy, BioC.deoxy, BioC.nucleus, IX.inkSoft], labels: const ['A', 'B', 'AB', 'O'], fmt: (v) => '${f0(v)}%');
        Bio.box(c, Rect.fromLTWH(size.width * 0.58, size.height * 0.70, size.width * 0.40, 70), 'With $k alleles: ${k * (k + 1) ~/ 2} possible genotypes  (k(k+1)/2)', color: IX.accent, size: 19);
        Bio.note(c, 'Three alleles (Iᴬ, Iᴮ, i) give six genotypes but four blood groups. Iᴬ and Iᴮ are co-dominant: both sugars appear on the red cells of an IᴬIᴮ person.', Offset(70, size.height - 24), align: Alignment.bottomLeft, maxWidth: side + 40, size: 17, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ polygenic

  Widget _polygenic() {
    final g = i('genes').clamp(1, 6);
    final m = 2 * g;
    double comb(int nn, int kk) {
      var r = 1.0;
      for (var j = 1; j <= kk; j++) {
        r = r * (nn - kk + j) / j;
      }
      return r;
    }
    final probs = [for (var k = 0; k <= m; k++) comb(m, k) / math.pow(2, m)];
    return frame(
      title: 'Polygenic inheritance: skin colour',
      subtitle: _sub,
      formula: 'n genes → 2n + 1 phenotype classes',
      readouts: [
        Readout('Genes', '$g', '', IX.accent),
        Readout('Phenotype classes', '${m + 1}', ''),
        Readout('Genotypes', '${math.pow(3, g)}', '3ⁿ'),
        Readout('Darkest (all dominant)', '1 in ${grp(math.pow(4, g))}', ''),
      ],
      controls: [slider('genes', 'Number of genes', 1, 6)],
      painter: BioPainter((c, size) {
        final plot = Plot(Rect.fromLTRB(110, 90, size.width - 50, size.height - 170), -0.5, m + 0.5, 0, probs.reduce(math.max) * 1.2);
        plot.frame(c, xs: [], ys: [], yLabel: 'Share of offspring', title: 'Offspring of two parents heterozygous for $g gene${g > 1 ? 's' : ''} (AaBbCc… × AaBbCc…)');
        final cols = [for (var k = 0; k <= m; k++) Color.lerp(const Color(0xFFF6DEC8), const Color(0xFF5A3420), k / m)!];
        plot.bars(c, probs, cols, fmt: (v) => v >= 0.01 ? '${f0(v * 100)}%' : '<1%', width: 0.8);
        for (var k = 0; k <= m; k++) {
          final p = plot.pt(k.toDouble(), 0);
          Bio.soft(c, Path()..addOval(Rect.fromCircle(center: p + const Offset(0, 40), radius: 18)), cols[k], stroke: 1.5);
          IxPaint.label(c, '$k', p + const Offset(0, 76), size: 16, color: IX.inkSoft, w: FontWeight.w600);
        }
        IxPaint.label(c, 'Number of dominant (dark) alleles', Offset(plot.r.center.dx, size.height - 50), size: 17, color: IX.inkSoft, w: FontWeight.w600);
        if (g >= 2) plot.curve(c, (x) => probs.reduce(math.max) * math.exp(-math.pow(x - g, 2) / g), IX.accent.withValues(alpha: 0.6), w: 2.5, dashed: true);
      }),
    );
  }

  // ------------------------------------------------------------------ sex-linked

  Widget _sexlinked() {
    final xm = str('xm', 'XHXh'), xf = str('xf', 'XHY');
    final gm = [xm.substring(0, 2), xm.substring(2)];
    final gf = [xf.substring(0, 2), 'Y'];
    final kids = [for (final a in gm) for (final b in gf) (a, b)];
    int count(bool Function(String, String) t) => kids.where((k) => t(k.$1, k.$2)).length;
    final dAff = count((a, b) => b != 'Y' && a == 'Xh' && b == 'Xh'), dCar = count((a, b) => b != 'Y' && (a == 'Xh') != (b == 'Xh'));
    final sAff = count((a, b) => b == 'Y' && a == 'Xh');
    final r = n('risk') / 100, ch = i('children');
    String pretty(String g) => g.replaceAll('XH', 'Xᴴ').replaceAll('Xh', 'Xʰ');
    return frame(
      title: 'Sex-linked inheritance: haemophilia',
      subtitle: _sub,
      formula: 'X-linked recessive: sons from carrier mothers',
      readouts: [
        Readout('Sons affected', '${f0(100 * sAff / 2)}%', 'of sons', IX.positive),
        Readout('Daughters carriers', '${f0(100 * dCar / 2)}%', 'of daughters', IX.amber),
        Readout('Daughters affected', '${f0(100 * dAff / 2)}%', '', IX.positive),
        Readout('≥ 1 of $ch children (risk ${f0(r * 100)}%)', '${f0(100 * (1 - math.pow(1 - r, ch)).toDouble())}%', '', IX.accent),
      ],
      controls: [
        choice('xm', 'Mother', const {'XHXH': 'XᴴXᴴ normal', 'XHXh': 'XᴴXʰ carrier', 'XhXh': 'XʰXʰ'}),
        choice('xf', 'Father', const {'XHY': 'XᴴY normal', 'XhY': 'XʰY affected'}),
        slider('risk', 'Risk for each child', 0, 50, unit: '%'),
        slider('children', 'Number of children', 1, 8),
      ],
      painter: BioPainter((c, size) {
        final side = math.min(size.width * 0.45, size.height - 160);
        final rr = Rect.fromLTWH(70, 60, side, side);
        punnett(c, rr, gf.map(pretty).toList(), gm.map(pretty).toList(), (b, ii, jj) {
          final a = gm[jj], f = gf[ii];
          final son = f == 'Y';
          final aff = son ? a == 'Xh' : (a == 'Xh' && f == 'Xh');
          final car = !son && !aff && (a == 'Xh' || f == 'Xh');
          final col = aff ? IX.positive : (car ? IX.amber : IX.green);
          c.drawRect(b, Paint()..color = col.withValues(alpha: 0.10));
          // Symbol: square son, circle daughter.
          final sc = b.center + const Offset(0, -16);
          final sym = son ? (Path()..addRect(Rect.fromCenter(center: sc, width: 44, height: 44))) : (Path()..addOval(Rect.fromCircle(center: sc, radius: 23)));
          c.drawPath(sym, Paint()..color = aff ? IX.positive : IX.paper);
          if (car) c.drawCircle(sc, 8, Paint()..color = IX.amber);
          c.drawPath(sym, Paint()..color = IX.ink..style = PaintingStyle.stroke..strokeWidth = 2.5);
          IxPaint.label(c, '${pretty(a)}${pretty(f)}  ${son ? 'son' : 'daughter'}${aff ? ', affected' : (car ? ', carrier' : '')}', Offset(b.center.dx, b.bottom - 20), size: 16, color: IX.ink, w: FontWeight.w600);
        }, topLabel: 'Father\'s gametes', sideLabel: 'Mother\'s gametes', gameteSize: 24);
        final x0 = size.width * 0.62;
        final plot = Plot(Rect.fromLTRB(x0 + 40, 100, size.width - 40, size.height * 0.58), 1, 8, 0, 100);
        plot.frame(c, xs: [1, 2, 4, 6, 8], ys: [0, 25, 50, 75, 100], xLabel: 'Number of children', yLabel: 'Chance ≥ 1 affected (%)', title: 'Risk across a family');
        plot.curve(c, (x) => 100 * (1 - math.pow(1 - r, x)).toDouble(), IX.accent);
        plot.dot(c, ch.toDouble(), 100 * (1 - math.pow(1 - r, ch)).toDouble(), IX.accent);
        Bio.note(c, 'The gene is on the X chromosome. A son gets his only X from his mother, so a carrier mother passes haemophilia to half her sons. Queen Victoria was a carrier. Colour blindness is inherited the same way.', Offset(x0, size.height * 0.72), maxWidth: size.width - x0 - 30, size: 17, color: IX.ink);
      }),
    );
  }

  // ------------------------------------------------------------------ pedigree

  Widget _pedigree() {
    final t = str('trait', 'xlinked');
    // Individuals: (gen, x, male, status 0 normal 1 affected 2 carrier)
    final people = switch (t) {
      'autorec' => [(0, 0.3, true, 2), (0, 0.5, false, 2), (1, 0.15, false, 0), (1, 0.32, true, 1), (1, 0.48, false, 2), (1, 0.64, true, 0), (2, 0.4, true, 1), (2, 0.56, false, 0)],
      'autodom' => [(0, 0.3, true, 1), (0, 0.5, false, 0), (1, 0.15, false, 1), (1, 0.32, true, 0), (1, 0.48, false, 1), (1, 0.64, true, 0), (2, 0.4, true, 1), (2, 0.56, false, 0)],
      _ => [(0, 0.3, true, 0), (0, 0.5, false, 2), (1, 0.15, false, 0), (1, 0.32, true, 1), (1, 0.48, false, 2), (1, 0.64, true, 0), (2, 0.4, true, 1), (2, 0.56, false, 0)],
    };
    return frame(
      title: 'Pedigree analysis',
      subtitle: _sub,
      formula: '□ male  ○ female  ■ affected',
      readouts: [
        Readout('Trait', {'xlinked': 'X-linked recessive', 'autorec': 'Autosomal recessive', 'autodom': 'Autosomal dominant'}[t]!, '', IX.accent),
        Readout('Example', {'xlinked': 'Haemophilia', 'autorec': 'Sickle-cell anaemia', 'autodom': 'Myotonic dystrophy'}[t]!, ''),
      ],
      controls: [choice('trait', 'Pattern', const {'xlinked': 'X-linked rec.', 'autorec': 'Autosomal rec.', 'autodom': 'Autosomal dom.'})],
      painter: BioPainter((c, size) {
        final w = size.width * 0.9, x0 = size.width * 0.02;
        double gy(int g) => 120 + g * (size.height - 300) / 2;
        Offset at(int k) => Offset(x0 + w * people[k].$2 * 1.2, gy(people[k].$1));
        final line = Paint()..color = IX.ink..strokeWidth = 2.5;
        // Matings and offspring.
        void couple(int a, int b, List<int> kids) {
          final pa = at(a), pb = at(b);
          c.drawLine(pa, pb, line);
          final mid = (pa + pb) / 2;
          final yb = mid.dy + 70;
          c.drawLine(mid, Offset(mid.dx, yb), line);
          final xs = kids.map((k) => at(k).dx).toList();
          c.drawLine(Offset(math.min(xs.reduce(math.min), mid.dx), yb), Offset(math.max(xs.reduce(math.max), mid.dx), yb), line);
          for (final k in kids) {
            c.drawLine(Offset(at(k).dx, yb), at(k) - const Offset(0, 30), line);
          }
        }
        couple(0, 1, [2, 3, 4, 5]);
        // Gen-II spouse for 4 (female) and child.
        final sp = at(4) + const Offset(140, 0);
        c.drawLine(at(4), sp, line);
        c.drawRect(Rect.fromCenter(center: sp, width: 56, height: 56), Paint()..color = IX.paper);
        c.drawRect(Rect.fromCenter(center: sp, width: 56, height: 56), Paint()..color = IX.ink..style = PaintingStyle.stroke..strokeWidth = 2.5);
        final mid = (at(4) + sp) / 2;
        c.drawLine(mid, Offset(mid.dx, mid.dy + 70), line);
        c.drawLine(Offset(at(6).dx, mid.dy + 70), Offset(at(7).dx, mid.dy + 70), line);
        for (final k in [6, 7]) {
          c.drawLine(Offset(at(k).dx, mid.dy + 70), at(k) - const Offset(0, 30), line);
        }
        for (var k = 0; k < people.length; k++) {
          final p = at(k);
          final (_, _, male, st) = people[k];
          final sym = male ? (Path()..addRect(Rect.fromCenter(center: p, width: 56, height: 56))) : (Path()..addOval(Rect.fromCircle(center: p, radius: 29)));
          c.drawPath(sym, Paint()..color = st == 1 ? IX.ink : IX.paper);
          if (st == 2) c.drawCircle(p, 9, Paint()..color = IX.ink);
          c.drawPath(sym, Paint()..color = IX.ink..style = PaintingStyle.stroke..strokeWidth = 2.5);
        }
        for (final (g, nm) in [(0, 'I'), (1, 'II'), (2, 'III')]) {
          IxPaint.label(c, nm, Offset(x0 + 10, gy(g)), size: 22, color: IX.inkSoft, w: FontWeight.w700, align: Alignment.centerLeft);
        }
        // Key.
        final kx = size.width * 0.80;
        final key = [('Male', 0), ('Female', 1), ('Affected', 2), ('Carrier', 3)];
        for (final (nm, k) in key) {
          final p = Offset(kx, 120 + k * 64.0);
          final sym = k == 1 || k == 3 ? (Path()..addOval(Rect.fromCircle(center: p, radius: 20))) : (Path()..addRect(Rect.fromCenter(center: p, width: 40, height: 40)));
          c.drawPath(sym, Paint()..color = k == 2 ? IX.ink : IX.paper);
          if (k == 3) c.drawCircle(p, 6, Paint()..color = IX.ink);
          c.drawPath(sym, Paint()..color = IX.ink..style = PaintingStyle.stroke..strokeWidth = 2);
          IxPaint.label(c, nm, p + const Offset(36, 0), size: 18, color: IX.ink, align: Alignment.centerLeft);
        }
        Bio.note(c, {
          'xlinked': 'Affected sons of a carrier mother; the trait skips a generation through carrier daughters. No father-to-son transmission.',
          'autorec': 'Two unaffected carrier parents have an affected child (chance 1 in 4). Males and females are affected equally.',
          'autodom': 'Every affected person has an affected parent; the trait appears in every generation.',
        }[t]!, Offset(kx - 40, 400), maxWidth: size.width - kx + 20, size: 17, color: IX.ink);
      }),
    );
  }
}
