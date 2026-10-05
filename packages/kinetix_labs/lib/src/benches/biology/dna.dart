import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../core/i18n.dart';
import '../../engines/biology.dart';
import 'physiology.dart' show curvePanel;

double _r(double v, int k) => (v * k).round() / k;

/// Agarose gel electrophoresis: a DNA ladder, samples, and fragment sizes
/// read off the ladder's log(size)-against-distance line.
class GelBench extends LabBench {
  const GelBench();

  static const ladder = [3000.0, 2000.0, 1500.0, 1000.0, 700.0, 500.0, 300.0, 200.0, 100.0];

  /// Kit → lane → fragment sizes (bp).
  static const kits = {
    'plasmid': {
      'ladder': ladder,
      'ecori': [3000.0],
      'double': [1800.0, 1200.0],
      'pcr': [650.0],
      'unknown': [1250.0, 420.0],
    },
    'forensic': {
      'ladder': ladder,
      'scene': [1200.0, 800.0, 450.0, 300.0],
      'suspect-1': [1200.0, 700.0, 450.0, 250.0],
      'suspect-2': [1200.0, 800.0, 450.0, 300.0],
      'victim': [1000.0, 800.0, 500.0, 300.0],
    },
  };

  @override
  String get kind => 'gel';

  @override
  LabParams get defaults => {'kit': 'plasmid', 'lane': 'ladder', 'band': 0.0, 'agarose': 1.0, 'volts': 100.0, 'min': 45.0};

  static Map<String, List<double>> lanes(LabParams p) => kits[pStr(p, 'kit', 'plasmid')] ?? kits['plasmid']!;

  static String laneName(String l) => switch (l) {
        'ladder' => tr('DNA ladder'),
        'ecori' => tr('Plasmid cut with EcoRI'),
        'double' => tr('Plasmid cut with EcoRI and BamHI'),
        'pcr' => tr('PCR product'),
        'unknown' => tr('Unknown fragment mix'),
        'scene' => tr('Crime-scene stain'),
        'suspect-1' => tr('Suspect 1'),
        'suspect-2' => tr('Suspect 2'),
        'victim' => tr('Victim'),
        _ => l,
      };

  static String lane(LabParams p) => lanes(p).containsKey(pStr(p, 'lane')) ? pStr(p, 'lane') : 'ladder';

  static int band(LabParams p) => pInt(p, 'band', 0).clamp(0, lanes(p)[lane(p)]!.length - 1);

  static double distance(LabParams p, double bp) =>
      Dna.migration(bp, agarose: pNum(p, 'agarose', 1), volts: pNum(p, 'volts', 100), minutes: pNum(p, 'min', 45));

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('lane', tr('Lane'), [for (final l in lanes(p).keys) (l, laneName(l))]),
        LabSlider('band', tr('Band (from the top)'), 0, math.max(1, lanes(p)[lane(p)]!.length - 1).toDouble(), divisions: math.max(1, lanes(p)[lane(p)]!.length - 1)),
        LabChoice('agarose', tr('Agarose'), [for (final a in [0.8, 1.0, 1.5, 2.0]) (a, '$a %')]),
        LabSlider('volts', tr('Voltage'), 50, 150, divisions: 4, unit: ' V'),
        LabSlider('min', tr('Run time'), 15, 90, divisions: 5, unit: ' min'),
      ];

  @override
  List<LabColumn> get columns => [LabColumn(tr('Lane')), LabColumn(tr('Band'), 0), LabColumn(tr('Distance (mm)'), 1), LabColumn(tr('Size (bp)'), 0), const LabColumn('log₁₀ bp', 3)];

  @override
  LabReading read(LabParams p) {
    final l = lane(p);
    final bp = lanes(p)[l]![band(p)];
    final d = (distance(p, bp) * 2 + 0.6 * labNoise('$l|${band(p)}|${p['agarose']}|${p['volts']}|${p['min']}')).round() / 2;
    if (d < 4) return LabReading.not(tr('The bands have hardly left the wells: run the gel longer.'));
    final known = l == 'ladder';
    return LabReading.row([laneName(l), band(p) + 1, d, known ? bp : '?', known ? _r(math.log(bp) / math.ln10, 1000) : '?']);
  }

  @override
  LabGraph graph(LabParams p) => LabGraph(2, 4, line: true, fromZero: false);

  @override
  String? result(List<List<Object>> rows) {
    final std = [for (final r in rows) if (r[4] is num) r];
    if (std.length < 3) return null;
    final f = LinearFit.of([for (final r in std) (r[2] as num).toDouble()], [for (final r in std) (r[4] as num).toDouble()])!;
    final out = [tr('Ladder: log₁₀(bp) falls in a straight line with distance (slope {m} per mm, r² = {r2}).', {'m': pm(f.slope, f.slopeSe), 'r2': f.r2.toStringAsFixed(3)})];
    final sizes = <String, List<double>>{};
    for (final r in rows) {
      if (r[4] is num) continue;
      final d = (r[2] as num).toDouble();
      final bp = math.pow(10, f.at(d)).toDouble();
      // Spread of the ladder points about the line, as an uncertainty in log size.
      final res = math.sqrt([for (final s in std) math.pow((s[4] as num) - f.at((s[2] as num).toDouble()), 2)].reduce((a, b) => a + b) / math.max(1, std.length - 2));
      final u = bp * math.ln10 * res;
      sizes.putIfAbsent(r[0] as String, () => []).add(bp);
      out.add(tr('{lane}, band {b}: about {s} bp.', {'lane': r[0] as String, 'b': '${r[1]}', 's': pm(bp, math.max(u, bp * 0.01))}));
    }
    final scene = sizes[laneName('scene')];
    if (scene != null) {
      for (final s in ['suspect-1', 'suspect-2', 'victim']) {
        final other = sizes[laneName(s)];
        if (other == null || other.length != scene.length) continue;
        final same = [for (var i = 0; i < scene.length; i++) (scene[i] - other[i]).abs() / scene[i] < 0.06].every((x) => x);
        out.add(same
            ? tr('{s} has the same band pattern as the crime-scene stain: they could share a source.', {'s': laneName(s)})
            : tr('{s} has a different band pattern: excluded as the source of the stain.', {'s': laneName(s)}));
      }
    }
    return out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final ls = lanes(p);
    final gel = Rect.fromLTWH(w * 0.08, h * 0.08, w * 0.62, h * 0.82);
    canvas.drawRRect(RRect.fromRectAndRadius(gel, const Radius.circular(6)), fill(const Color(0xFF1B1530)));
    // Scale: 80 mm of gel.
    final mm = (gel.height - 30) / 80;
    final laneW = gel.width / ls.length;
    var i = 0;
    for (final e in ls.entries) {
      final x = gel.left + laneW * (i + 0.5);
      canvas.drawRect(Rect.fromCenter(center: Offset(x, gel.top + 14), width: laneW * 0.6, height: 6), fill(const Color(0xFF3B3355)));
      for (var b = 0; b < e.value.length; b++) {
        final d = distance(p, e.value[b]);
        final y = gel.top + 14 + d * mm;
        final sel = e.key == lane(p) && b == band(p);
        canvas.drawRect(Rect.fromCenter(center: Offset(x, y), width: laneW * 0.6, height: 4), fill(sel ? const Color(0xFFFFEB3B) : const Color(0xFFE1F5FE).withValues(alpha: 0.85)));
        if (sel) {
          dashed(canvas, Offset(gel.right + 6, gel.top + 14), Offset(gel.right + 6, y), stroke(LabInk.ink, 1.5));
          label(canvas, '${(d).toStringAsFixed(1)} mm', Offset(gel.right + 48, y), size: 13, bold: true);
        }
      }
      label(canvas, laneName(e.key), Offset(x, gel.bottom + 14), size: 10, color: LabInk.muted);
      i++;
    }
    label(canvas, '−', Offset(gel.left - 12, gel.top + 14), size: 18, bold: true);
    label(canvas, '+', Offset(gel.left - 12, gel.bottom - 10), size: 18, bold: true, color: LabInk.red);
    label(canvas, '${pNum(p, 'agarose', 1)} % · ${pNum(p, 'volts', 100).toStringAsFixed(0)} V · ${pNum(p, 'min', 45).toStringAsFixed(0)} min', Offset(w * 0.86, h * 0.12), size: 13, color: LabInk.muted);
  }
}

/// Real-time PCR: amplification curves and the threshold cycle (Ct) of a
/// dilution series, giving the efficiency and the copies in an unknown.
class PcrBench extends LabBench {
  const PcrBench();

  static const threshold = 1e10;

  /// Copies in the unknown sample.
  static const unknownCopies = 4.0e4;

  @override
  String get kind => 'pcr';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'copies': 4.0, 'cycle': 40.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('copies', tr('Template'), [for (final c in [3.0, 4.0, 5.0, 6.0, 7.0]) (c, '10^${c.toStringAsFixed(0)} ${tr('copies')}'), (0.0, tr('Unknown'))]),
        LabSlider('cycle', tr('Cycle'), 0, 40, divisions: 40),
      ];

  static double n0(LabParams p) => pNum(p, 'copies', 4) == 0 ? unknownCopies : math.pow(10, pNum(p, 'copies', 4)).toDouble();

  static double? ct(LabParams p) {
    final c = Dna.ct(n0(p), threshold: threshold);
    return c == null ? null : _r(c + 0.12 * labNoise('ct${p['copies']}'), 100);
  }

  @override
  List<LabColumn> get columns => [LabColumn(tr('Template')), const LabColumn('log₁₀ N₀', 1), const LabColumn('Ct', 2)];

  @override
  LabReading read(LabParams p) {
    final c = ct(p);
    if (c == null || pNum(p, 'cycle', 40) < c) return LabReading.not(tr('The curve has not crossed the threshold yet: run more cycles.'));
    final unknown = pNum(p, 'copies', 4) == 0;
    return LabReading.row([unknown ? tr('Unknown') : tr('Standard'), unknown ? '?' : pNum(p, 'copies', 4), c]);
  }

  @override
  LabGraph graph(LabParams p) => const LabGraph(1, 2, line: true, fromZero: false);

  @override
  String? result(List<List<Object>> rows) {
    final std = [for (final r in rows) if (r[1] is num) r];
    final xs = [for (final r in std) (r[1] as num).toDouble()];
    if (xs.toSet().length < 3) return null;
    final f = LinearFit.of(xs, [for (final r in std) (r[2] as num).toDouble()])!;
    final e = math.pow(10, -1 / f.slope).toDouble() - 1;
    final eSe = (e + 1) * math.ln10 * f.slopeSe / (f.slope * f.slope);
    final out = [tr('Standard curve: Ct = {m} × log₁₀N₀ + {c}. Efficiency = 10^(−1/slope) − 1 = {e} % (100 % is a perfect doubling each cycle).', {'m': pm(f.slope, f.slopeSe), 'c': f.intercept.toStringAsFixed(1), 'e': pm(100 * e, 100 * eSe)})];
    final unk = [for (final r in rows) if (r[1] == '?') (r[2] as num).toDouble()];
    if (unk.isNotEmpty) {
      final lg = (unk.last - f.intercept) / f.slope;
      out.add(tr('The unknown crosses at Ct {ct}, so it held about {n} copies.', {'ct': unk.last.toStringAsFixed(2), 'n': '${(math.pow(10, lg) / 1000).toStringAsFixed(0)} × 10³'}));
    }
    return out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final cyc = pInt(p, 'cycle', 40);
    final copies = Dna.pcr(n0(p), 40);
    // Fluorescence (linear) against cycle, with the threshold.
    double fl(double n) => n / 1e12 * 100;
    curvePanel(canvas, Rect.fromLTWH(w * 0.36, h * 0.06, w * 0.6, h * 0.84), [for (var i = 0; i <= cyc; i++) Offset(i.toDouble(), fl(copies[i]))],
        maxX: 40, maxY: 105, x: tr('Cycle'), y: tr('Fluorescence'), refY: fl(threshold), colour: LabInk.green);
    // Thermocycler steps, cycling while the lab runs.
    final steps = [('95 °C', tr('Denature')), ('55 °C', tr('Anneal primers')), ('72 °C', tr('Extend'))];
    final k = (t ~/ 1.2) % 3;
    for (var i = 0; i < 3; i++) {
      final r = Rect.fromLTWH(w * 0.04, h * (0.12 + i * 0.16), w * 0.26, h * 0.12);
      canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(8)), fill(i == k ? const Color(0xFFFFE0B2) : const Color(0xFFF5F5F5)));
      label(canvas, '${steps[i].$1}  ${steps[i].$2}', r.center, size: 13, bold: i == k);
    }
    final c = ct(p);
    label(canvas, c == null ? 'Ct —' : 'Ct = ${c.toStringAsFixed(2)}', Offset(w * 0.17, h * 0.7), size: 18, bold: true);
    label(canvas, tr('Cycle {n}', {'n': '$cyc'}), Offset(w * 0.17, h * 0.78), size: 14, color: LabInk.muted);
  }
}
