import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../core/i18n.dart';
import '../../engines/biology.dart';
import 'physiology.dart' show curvePanel;

double _r(double v, int k) => (v * k).round() / k;

/// Mendel's crosses in pea plants: a Punnett square, the offspring counted,
/// and a chi-square test of the ratio.
class CrossBench extends LabBench {
  const CrossBench();

  static const monohybrid = ['Aa×Aa', 'Aa×aa', 'AA×aa'];
  static const dihybrid = ['AaBb×AaBb', 'AaBb×aabb'];

  @override
  String get kind => 'cross';

  @override
  LabParams get defaults => {'set': 'mono', 'cross': 'Aa×Aa', 'n': 400.0, 'trial': 1.0};

  @override
  LabParams get preview => {...defaults, 'n': 64.0};

  static List<String> crosses(LabParams p) => pStr(p, 'set', 'mono') == 'di' ? dihybrid : monohybrid;

  static String cross(LabParams p) {
    final c = pStr(p, 'cross', '');
    return crosses(p).contains(c) ? c : crosses(p).first;
  }

  /// The plant a phenotype code describes: A tall / a dwarf for one gene;
  /// A round / a wrinkled seed and B yellow / b green for two.
  static String phenotypeName(String code) {
    if (code.length == 1) return code == 'A' ? tr('Tall') : tr('Dwarf');
    return '${code[0] == 'A' ? tr('Round') : tr('Wrinkled')} ${code[1] == 'B' ? tr('yellow') : tr('green')}';
  }

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('cross', tr('Cross'), [for (final c in crosses(p)) (c, c)]),
        LabChoice('n', tr('Offspring counted'), [for (final n in [16.0, 64.0, 160.0, 400.0, 1600.0]) (n, n.toStringAsFixed(0))]),
        LabSlider('trial', tr('Trial'), 1, 10, divisions: 9),
      ];

  static (Map<String, int>, Map<String, double>) counts(LabParams p) {
    final parts = cross(p).split('×');
    final n = pInt(p, 'n', 400);
    return (Genetics.sample(parts[0], parts[1], n, n * 101 + pInt(p, 'trial', 1) * 7 + crosses(p).indexOf(cross(p))), Genetics.expected(parts[0], parts[1]));
  }

  @override
  List<LabColumn> get columns => [LabColumn(tr('Cross')), LabColumn(tr('Offspring'), 0), LabColumn(tr('Counted')), LabColumn(tr('Expected')), const LabColumn('χ²', 2), LabColumn(tr('Fits the ratio?'))];

  @override
  LabReading read(LabParams p) {
    final (obs, exp) = counts(p);
    final n = pInt(p, 'n', 400);
    final chi = Genetics.chiSquare(obs, exp);
    final ok = chi < Genetics.chi05[exp.length - 2];
    return LabReading.row([
      cross(p),
      n,
      [for (final k in exp.keys) '${phenotypeName(k)} ${obs[k]}'].join(' : '),
      [for (final k in exp.keys) (exp[k]! * n).toStringAsFixed(n < 100 ? 1 : 0)].join(' : '),
      _r(chi, 100),
      ok ? tr('Yes') : tr('No'),
    ]);
  }

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final fit = rows.where((r) => r[5] == tr('Yes')).length;
    final big = [for (final r in rows) if ((r[1] as num) >= 400) (r[4] as num).toDouble()];
    final small = [for (final r in rows) if ((r[1] as num) <= 64) (r[4] as num).toDouble()];
    final out = [tr('{f} of {n} counts fit the expected ratio at the 5 % level (about 1 in 20 true ratios fail by chance).', {'f': '$fit', 'n': '${rows.length}'})];
    if (big.isNotEmpty && small.isNotEmpty) {
      out.add(tr('Small families stray further from the ratio; with many offspring the proportions settle close to it.'));
    }
    return out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final parts = cross(p).split('×');
    final g1 = Genetics.gametes(parts[0]).keys.toList(), g2 = Genetics.gametes(parts[1]).keys.toList();
    // Punnett square.
    final side = math.min(w * 0.5, h * 0.78);
    final cell = side / (math.max(g1.length, g2.length) + 1);
    final o = Offset(w * 0.04, h * 0.1);
    label(canvas, '${parts[0]} × ${parts[1]}', Offset(o.dx + side / 2, o.dy - 4), size: 16, bold: true);
    for (var i = 0; i < g2.length; i++) {
      label(canvas, g2[i], Offset(o.dx + cell * (i + 1.5), o.dy + cell * 0.5), size: 15, bold: true, color: LabInk.blue);
    }
    for (var j = 0; j < g1.length; j++) {
      label(canvas, g1[j], Offset(o.dx + cell * 0.5, o.dy + cell * (j + 1.5)), size: 15, bold: true, color: LabInk.red);
      for (var i = 0; i < g2.length; i++) {
        final z = Genetics.zygote(g1[j], g2[i]);
        final r = Rect.fromLTWH(o.dx + cell * (i + 1), o.dy + cell * (j + 1), cell, cell);
        final ph = Genetics.phenotype(z);
        final dom = ph.split('').where((c) => c == c.toUpperCase()).length / ph.length;
        canvas.drawRect(r, fill(Color.lerp(const Color(0xFFF1F8E9), const Color(0xFFC5E1A5), dom)!));
        canvas.drawRect(r, stroke(LabInk.faint, 1));
        label(canvas, z, r.center, size: math.min(15, cell * 0.28));
      }
    }
    // Offspring counted, as bars against the expected.
    final (obs, exp) = counts(p);
    final n = pInt(p, 'n', 400);
    final chart = Rect.fromLTWH(w * 0.6, h * 0.12, w * 0.36, h * 0.66);
    final barW = chart.width / (exp.length * 1.5);
    final top = exp.values.reduce(math.max) * n * 1.3;
    var k = 0;
    for (final e in exp.entries) {
      final x = chart.left + barW * (0.25 + k * 1.5);
      final hObs = chart.height * (obs[e.key] ?? 0) / top;
      canvas.drawRect(Rect.fromLTWH(x, chart.bottom - hObs, barW, hObs), fill(const Color(0xFF81C784)));
      final yExp = chart.bottom - chart.height * e.value * n / top;
      canvas.drawLine(Offset(x - 4, yExp), Offset(x + barW + 4, yExp), stroke(LabInk.red, 2));
      label(canvas, '${obs[e.key]}', Offset(x + barW / 2, chart.bottom - hObs - 12), size: 13, bold: true);
      label(canvas, phenotypeName(e.key), Offset(x + barW / 2, chart.bottom + 14), size: 11, color: LabInk.muted);
      k++;
    }
    canvas.drawLine(chart.bottomLeft, chart.bottomRight, stroke(LabInk.ink, 1.5));
    label(canvas, 'χ² = ${Genetics.chiSquare(obs, exp).toStringAsFixed(2)}  (5 %: ${Genetics.chi05[exp.length - 2]})', Offset(chart.center.dx, chart.bottom + 40), size: 14, bold: true);
  }
}

/// Hardy–Weinberg: genotype counts in a sample from a population, p and q,
/// and a chi-square test of equilibrium.
class HardyWeinbergBench extends LabBench {
  const HardyWeinbergBench();

  /// Population → AA, Aa, aa frequencies.
  static const populations = {
    'town': (0.49, 0.42, 0.09),
    'island': (0.432, 0.336, 0.232),
    'pooled': (0.45, 0.30, 0.25),
  };

  @override
  String get kind => 'hardy-weinberg';

  @override
  LabParams get defaults => {'pop': 'town', 'n': 200.0, 'trial': 1.0};

  static String popName(String k) => switch (k) {
        'island' => tr('Small island (much inbreeding)'),
        'pooled' => tr('Two villages counted together'),
        _ => tr('Large town (random mating)'),
      };

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('pop', tr('Population'), [for (final k in populations.keys) (k, popName(k))]),
        LabChoice('n', tr('Sample size'), [for (final n in [50.0, 100.0, 200.0, 500.0]) (n, n.toStringAsFixed(0))]),
        LabSlider('trial', tr('Sample'), 1, 10, divisions: 9),
      ];

  static (int, int, int) sample(LabParams p) {
    final k = pStr(p, 'pop', 'town');
    return Population.draw(pInt(p, 'n', 200), populations[k] ?? populations['town']!, populations.keys.toList().indexOf(k) * 1000 + pInt(p, 'n', 200) + pInt(p, 'trial', 1) * 13);
  }

  @override
  List<LabColumn> get columns => [LabColumn(tr('Population')), const LabColumn('AA', 0), const LabColumn('Aa', 0), const LabColumn('aa', 0), const LabColumn('p', 3), const LabColumn('q', 3), const LabColumn('χ²', 2)];

  @override
  LabReading read(LabParams p) {
    final (a, b, c) = sample(p);
    final f = Population.p(a, b, c);
    return LabReading.row([popName(pStr(p, 'pop', 'town')), a, b, c, _r(f, 1000), _r(1 - f, 1000), _r(Population.chiSquare(a, b, c), 100)]);
  }

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final out = <String>[];
    for (final k in populations.keys) {
      final rs = [for (final r in rows) if (r[0] == popName(k)) r];
      if (rs.isEmpty) continue;
      final fails = rs.where((r) => (r[6] as num) >= 3.841).length;
      final het = rs.fold<int>(0, (s, r) => s + (r[2] as int));
      final n = rs.fold<int>(0, (s, r) => s + (r[1] as int) + (r[2] as int) + (r[3] as int));
      final pp = meanSe([for (final r in rs) (r[4] as num).toDouble()]).mean;
      final expectHet = 2 * pp * (1 - pp);
      out.add(fails * 2 > rs.length
          ? tr('{pop}: χ² is above 3.84 (1 degree of freedom, 5 %) in most samples. Heterozygotes are {h} % against the {e} % expected: the population is not in Hardy–Weinberg equilibrium.', {'pop': popName(k), 'h': (100 * het / n).toStringAsFixed(0), 'e': (100 * expectHet).toStringAsFixed(0)})
          : tr('{pop}: p = {p}; the genotype counts fit p², 2pq, q² (χ² below 3.84): consistent with equilibrium.', {'pop': popName(k), 'p': pp.toStringAsFixed(2)}));
    }
    return out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final (a, b, c) = sample(p);
    final n = a + b + c;
    // Individuals as dots coloured by genotype.
    final cols = (math.sqrt(n * 1.6)).ceil();
    final rows = (n / cols).ceil();
    final area = Rect.fromLTWH(w * 0.04, h * 0.1, w * 0.56, h * 0.78);
    final step = math.min(area.width / cols, area.height / rows);
    final rnd = math.Random(n + a);
    final kinds = [for (var i = 0; i < a; i++) 0, for (var i = 0; i < b; i++) 1, for (var i = 0; i < c; i++) 2]..shuffle(rnd);
    const colours = [Color(0xFF1565C0), Color(0xFF8E24AA), Color(0xFFE53935)];
    for (var i = 0; i < kinds.length; i++) {
      canvas.drawCircle(Offset(area.left + step * (i % cols + 0.5), area.top + step * (i ~/ cols + 0.5)), step * 0.36, fill(colours[kinds[i]]));
    }
    final f = Population.p(a, b, c);
    final (e1, e2, e3) = Population.expected(a, b, c);
    var y = h * 0.16;
    for (final (i, name, o, e) in [(0, 'AA', a, e1), (1, 'Aa', b, e2), (2, 'aa', c, e3)]) {
      canvas.drawCircle(Offset(w * 0.68, y), 8, fill(colours[i]));
      label(canvas, '$name  $o  (${tr('expected')} ${e.toStringAsFixed(1)})', Offset(w * 0.7, y - 9), size: 15, centre: false);
      y += 36;
    }
    label(canvas, 'p = ${f.toStringAsFixed(3)}   q = ${(1 - f).toStringAsFixed(3)}', Offset(w * 0.67, y + 6), size: 16, bold: true, centre: false);
    label(canvas, 'χ² = ${Population.chiSquare(a, b, c).toStringAsFixed(2)}', Offset(w * 0.67, y + 36), size: 16, bold: true, centre: false);
  }
}

/// Genetic drift: the frequency of an allele wandering from generation to
/// generation in small and large populations.
class DriftBench extends LabBench {
  const DriftBench();

  @override
  String get kind => 'drift';

  @override
  LabParams get defaults => {'size': 20.0, 'gen': 50.0, 'trial': 1.0, 's': 0.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('size', tr('Population size'), [for (final n in [10.0, 20.0, 100.0, 1000.0]) (n, n.toStringAsFixed(0))]),
        LabSlider('gen', tr('Generations'), 0, 100, divisions: 20),
        LabSlider('trial', tr('Trial'), 1, 8, divisions: 7),
        LabChoice('s', tr('Selection against aa'), [for (final s in [0.0, 0.1, 0.3]) (s, s == 0 ? tr('None') : 's = $s')]),
      ];

  static List<double> path(LabParams p) => Population.drift(0.5, pInt(p, 'size', 20), 100, pInt(p, 'size', 20) * 31 + pInt(p, 'trial', 1), s: pNum(p, 's', 0));

  @override
  List<LabColumn> get columns => [const LabColumn('N', 0), const LabColumn('s', 1), LabColumn(tr('Trial'), 0), LabColumn(tr('Generation'), 0), const LabColumn('p', 3)];

  @override
  LabReading read(LabParams p) => LabReading.row([pNum(p, 'size', 20), pNum(p, 's', 0), pNum(p, 'trial', 1), pNum(p, 'gen', 50), _r(path(p)[pInt(p, 'gen', 50)], 1000)]);

  @override
  List<String> live(LabParams p) => ['p = ${path(p)[pInt(p, 'gen', 50)].toStringAsFixed(3)}'];

  @override
  LabGraph graph(LabParams p) => LabGraph(3, 4, curve: true, include: (r) => r[0] == pNum(p, 'size', 20) && r[1] == pNum(p, 's', 0) && r[2] == pNum(p, 'trial', 1));

  @override
  String? result(List<List<Object>> rows) {
    final at = [for (final r in rows) if ((r[3] as num) >= 50 && r[1] == 0.0) r];
    if (at.length < 4) return null;
    final small = [for (final r in at) if ((r[0] as num) <= 20) ((r[4] as num) - 0.5).abs().toDouble()];
    final large = [for (final r in at) if ((r[0] as num) >= 1000) ((r[4] as num) - 0.5).abs().toDouble()];
    final fixed = at.where((r) => r[4] == 0.0 || r[4] == 1.0).length;
    final out = <String>[];
    if (small.isNotEmpty && large.isNotEmpty) {
      out.add(tr('After 50 generations p has moved {s} from 0.5 on average in small populations but only {l} in large ones: drift is strongest when few individuals breed.', {'s': meanSe(small).mean.toStringAsFixed(2), 'l': meanSe(large).mean.toStringAsFixed(2)}));
    }
    if (fixed > 0) out.add(tr('In {n} trials one allele was lost altogether (p = 0 or 1).', {'n': '$fixed'}));
    return out.isEmpty ? null : out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final g = pInt(p, 'gen', 50);
    final ps = path(p);
    // Faint paths of the other trials for comparison.
    final r = Rect.fromLTWH(w * 0.05, h * 0.06, w * 0.9, h * 0.84);
    curvePanel(canvas, r, [for (var i = 0; i <= g; i++) Offset(i.toDouble(), ps[i])], maxX: 100, maxY: 1, x: tr('Generation'), y: 'p', refY: 0.5);
    final a = r.deflate(22);
    for (var k = 1; k <= 8; k++) {
      if (k == pInt(p, 'trial', 1)) continue;
      final other = Population.drift(0.5, pInt(p, 'size', 20), 100, pInt(p, 'size', 20) * 31 + k, s: pNum(p, 's', 0));
      final path = Path()..moveTo(a.left, a.bottom - a.height * other[0]);
      for (var i = 1; i <= g; i++) {
        path.lineTo(a.left + a.width * i / 100, a.bottom - a.height * other[i]);
      }
      canvas.drawPath(path, stroke(LabInk.faint, 1.2));
    }
    label(canvas, 'N = ${pInt(p, 'size', 20)}', Offset(a.right - 40, a.top + 10), size: 15, bold: true);
  }
}
