import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../core/i18n.dart';
import '../../engines/specimen.dart';

double _r(double v, int k) => (v * k).round() / k;

/// The square counting field of a microscope with its graticule; [draw] paints
/// the specimen in the field's own box.
void microscopeField(Canvas canvas, Size size, Color background, void Function(Rect box) draw, {String caption = ''}) {
  final side = math.min(size.width * 0.62, size.height * 0.86);
  final box = Rect.fromCenter(center: Offset(size.width * 0.38, size.height * 0.48), width: side, height: side);
  canvas.drawRect(box.inflate(10), fill(const Color(0xFF22262B)));
  canvas.save();
  canvas.clipRect(box);
  canvas.drawRect(box, fill(background));
  draw(box);
  // Counting grid.
  final g = stroke(const Color(0x33000000), 1);
  for (var i = 1; i < 4; i++) {
    canvas.drawLine(Offset(box.left + side * i / 4, box.top), Offset(box.left + side * i / 4, box.bottom), g);
    canvas.drawLine(Offset(box.left, box.top + side * i / 4), Offset(box.right, box.top + side * i / 4), g);
  }
  canvas.restore();
  if (caption.isNotEmpty) label(canvas, caption, Offset(box.center.dx, box.bottom + 24), size: 14, color: LabInk.muted);
}

/// A tally card beside the field: what was counted.
void tally(Canvas canvas, Size size, List<(String, String)> lines) {
  final x = size.width * 0.74;
  var y = size.height * 0.2;
  for (final (k, v) in lines) {
    label(canvas, k, Offset(x, y), size: 14, color: LabInk.muted, centre: false);
    label(canvas, v, Offset(x, y + 18), size: 20, bold: true, centre: false);
    y += 54;
  }
}

/// Stomatal index of a leaf peel: S ÷ (S + E) × 100, counted in several fields.
class StomataBench extends LabBench {
  const StomataBench();

  /// Leaf surface → (stomata, epidermal cells) proportions.
  static const leaves = {'dicot-lower': (1.0, 3.6), 'dicot-upper': (1.0, 9.0), 'monocot': (1.0, 5.0)};

  @override
  String get kind => 'stomata';

  @override
  LabParams get defaults => {'leaf': 'dicot-lower', 'field': 1};

  static String leafName(String l) => switch (l) {
        'dicot-upper' => tr('Dicot leaf, upper surface'),
        'monocot' => tr('Monocot (grass) leaf'),
        _ => tr('Dicot leaf, lower surface'),
      };

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('leaf', tr('Leaf peel'), [for (final l in leaves.keys) (l, leafName(l))]),
        LabSlider('field', tr('Field of view'), 1, 8, divisions: 7),
      ];

  static List<SpecimenItem> cells(LabParams p) {
    final leaf = pStr(p, 'leaf', 'dicot-lower');
    final mix = leaves[leaf] ?? leaves['dicot-lower']!;
    return Specimen.field(100 * (leaves.keys.toList().indexOf(leaf) + 1) + pInt(p, 'field', 1), 6, 7, {'stoma': mix.$1, 'cell': mix.$2});
  }

  @override
  List<LabColumn> get columns => [LabColumn(tr('Leaf peel')), LabColumn(tr('Field'), 0), LabColumn(tr('Stomata (S)'), 0), LabColumn(tr('Epidermal cells (E)'), 0), const LabColumn('SI (%)', 1)];

  @override
  LabReading read(LabParams p) {
    final c = Specimen.count(cells(p));
    final s = c['stoma'] ?? 0, e = c['cell'] ?? 0;
    return LabReading.row([leafName(pStr(p, 'leaf', 'dicot-lower')), pInt(p, 'field', 1), s, e, _r(100 * s / (s + e), 10)]);
  }

  @override
  String? result(List<List<Object>> rows) {
    final by = <String, List<double>>{};
    for (final r in rows) {
      by.putIfAbsent(r[0] as String, () => []).add((r[4] as num).toDouble());
    }
    final out = [
      for (final e in by.entries)
        if (e.value.length >= 3) tr('{l}: stomatal index {si} % ({n} fields).', {'l': e.key, 'si': pm(meanSe(e.value).mean, meanSe(e.value).se), 'n': '${e.value.length}'}),
    ];
    if (out.isEmpty) return null;
    final lower = by[leafName('dicot-lower')], upper = by[leafName('dicot-upper')];
    if (lower != null && upper != null && lower.length >= 3 && upper.length >= 3 && meanSe(lower).mean > meanSe(upper).mean) {
      out.add(tr('The lower surface has more stomata: it is shaded and cooler, so less water is lost.'));
    }
    return out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final items = cells(p);
    final c = Specimen.count(items);
    microscopeField(canvas, size, const Color(0xFFEFF5E4), (box) {
      final cw = box.width / 7, ch = box.height / 6;
      final wall = stroke(const Color(0xFF6E8B3D), 1.6);
      for (final it in items) {
        final o = Offset(box.left + it.at.dx * box.width, box.top + it.at.dy * box.height);
        // Wavy epidermal cell walls.
        final path = Path();
        for (var k = 0; k <= 24; k++) {
          final a = 2 * math.pi * k / 24;
          final wob = 1 + 0.08 * math.sin(a * 5 + it.angle * 3);
          final pt = o + Offset(math.cos(a) * cw * 0.5 * wob, math.sin(a) * ch * 0.5 * wob);
          k == 0 ? path.moveTo(pt.dx, pt.dy) : path.lineTo(pt.dx, pt.dy);
        }
        path.close();
        canvas.drawPath(path, fill(const Color(0xFFE2EDCC)));
        canvas.drawPath(path, wall);
        if (it.kind == 'stoma') {
          canvas.save();
          canvas.translate(o.dx, o.dy);
          canvas.rotate(it.angle);
          final gw = cw * 0.18, gh = ch * 0.34;
          for (final s in [-1.0, 1.0]) {
            final r = Rect.fromCenter(center: Offset(s * gw * 0.55, 0), width: gw, height: gh);
            canvas.drawOval(r, fill(const Color(0xFF7DB043)));
            canvas.drawOval(r, stroke(const Color(0xFF3E5F1C), 1.2));
            for (var k = 0; k < 3; k++) {
              canvas.drawCircle(Offset(s * gw * 0.55, (k - 1) * gh * 0.25), 2, fill(const Color(0xFF2E7D32)));
            }
          }
          canvas.drawOval(Rect.fromCenter(center: Offset.zero, width: gw * 0.3, height: gh * 0.6), fill(const Color(0xFF39421F)));
          canvas.restore();
        }
      }
    }, caption: '${leafName(pStr(p, 'leaf', 'dicot-lower'))} · ×400');
    tally(canvas, size, [(tr('Stomata (S)'), '${c['stoma'] ?? 0}'), (tr('Epidermal cells (E)'), '${c['cell'] ?? 0}')]);
  }
}

/// Mitosis in an onion root tip: count the cells in each stage; the mitotic
/// index is the share of cells dividing.
class MitosisBench extends LabBench {
  const MitosisBench();

  static const phases = ['interphase', 'prophase', 'metaphase', 'anaphase', 'telophase'];

  /// Zone → phase proportions.
  static const zones = {
    'tip': [82.0, 9.0, 3.5, 2.0, 3.5],
    'elongation': [97.0, 1.5, 0.5, 0.4, 0.6],
  };

  /// Length of the onion root-tip cell cycle (hours) used to time the phases.
  static const cycleHours = 24.0;

  @override
  String get kind => 'mitosis';

  @override
  LabParams get defaults => {'zone': 'tip', 'field': 1};

  static String zoneName(String z) => z == 'elongation' ? tr('Zone of elongation') : tr('Root tip (meristem)');

  static String phaseName(String ph) => switch (ph) {
        'prophase' => tr('Prophase'),
        'metaphase' => tr('Metaphase'),
        'anaphase' => tr('Anaphase'),
        'telophase' => tr('Telophase'),
        _ => tr('Interphase'),
      };

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('zone', tr('Part of the root'), [for (final z in zones.keys) (z, zoneName(z))]),
        LabSlider('field', tr('Field of view'), 1, 8, divisions: 7),
      ];

  static List<SpecimenItem> cells(LabParams p) {
    final z = pStr(p, 'zone', 'tip');
    final w = zones[z] ?? zones['tip']!;
    return Specimen.field((z == 'tip' ? 500 : 900) + pInt(p, 'field', 1), 8, 9, {for (var i = 0; i < phases.length; i++) phases[i]: w[i]}, jitter: 0.08);
  }

  @override
  List<LabColumn> get columns => [
        LabColumn(tr('Part of the root')),
        LabColumn(tr('Field'), 0),
        const LabColumn('I', 0),
        const LabColumn('P', 0),
        const LabColumn('M', 0),
        const LabColumn('A', 0),
        const LabColumn('T', 0),
        LabColumn(tr('Mitotic index (%)'), 1),
      ];

  @override
  LabReading read(LabParams p) {
    final c = Specimen.count(cells(p));
    final counts = [for (final ph in phases) c[ph] ?? 0];
    final total = counts.fold<int>(0, (a, b) => a + b);
    return LabReading.row([zoneName(pStr(p, 'zone', 'tip')), pInt(p, 'field', 1), ...counts, _r(100 * (total - counts[0]) / total, 10)]);
  }

  @override
  String? result(List<List<Object>> rows) {
    final out = <String>[];
    for (final z in zones.keys) {
      final rs = [for (final r in rows) if (r[0] == zoneName(z)) r];
      if (rs.length < 3) continue;
      final mi = meanSe([for (final r in rs) (r[7] as num).toDouble()]);
      out.add(tr('{z}: mitotic index {mi} %.', {'z': zoneName(z), 'mi': pm(mi.mean, mi.se)}));
      if (z == 'tip') {
        final sums = [for (var k = 0; k < 5; k++) rs.fold<int>(0, (a, r) => a + (r[2 + k] as int))];
        final total = sums.fold<int>(0, (a, b) => a + b);
        final times = [for (var k = 1; k < 5; k++) '${phaseName(phases[k])} ${(cycleHours * 60 * sums[k] / total).toStringAsFixed(0)} min'];
        out.add(tr('A stage lasts in proportion to the cells found in it; with a {h}-hour cycle: {list}.', {'h': cycleHours.toStringAsFixed(0), 'list': times.join(', ')}));
      }
    }
    return out.isEmpty ? null : out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final items = cells(p);
    final c = Specimen.count(items);
    const stain = Color(0xFF7B1F4B);
    microscopeField(canvas, size, const Color(0xFFF6E7EC), (box) {
      final cw = box.width / 9, ch = box.height / 8;
      for (final it in items) {
        final o = Offset(box.left + it.at.dx * box.width, box.top + it.at.dy * box.height);
        final cell = Rect.fromCenter(center: o, width: cw * 0.94, height: ch * 0.94);
        canvas.drawRRect(RRect.fromRectAndRadius(cell, const Radius.circular(4)), fill(const Color(0xFFF3D9E2)));
        canvas.drawRRect(RRect.fromRectAndRadius(cell, const Radius.circular(4)), stroke(const Color(0xFFB07A8E), 1.2));
        final chrom = stroke(stain, 2);
        final k = cw * 0.2;
        switch (it.kind) {
          case 'prophase':
            canvas.drawCircle(o, k * 1.2, stroke(stain.withValues(alpha: 0.4), 1));
            for (var i = 0; i < 4; i++) {
              final a = it.angle + i * 1.4;
              canvas.drawLine(o + Offset(math.cos(a), math.sin(a)) * k * 0.2, o + Offset(math.cos(a + 0.8), math.sin(a + 0.8)) * k, chrom);
            }
          case 'metaphase':
            for (var i = -2; i <= 2; i++) {
              canvas.drawLine(o + Offset(-k * 0.25, i * k * 0.35), o + Offset(k * 0.25, i * k * 0.35), chrom);
            }
          case 'anaphase':
            for (final s in [-1.0, 1.0]) {
              for (var i = -1; i <= 1; i++) {
                canvas.drawLine(o + Offset(s * k * 0.6, i * k * 0.4), o + Offset(s * k * 1.2, i * k * 0.25), chrom);
              }
            }
          case 'telophase':
            canvas.drawLine(Offset(o.dx, cell.top + 3), Offset(o.dx, cell.bottom - 3), stroke(const Color(0xFFB07A8E), 1.5));
            for (final s in [-1.0, 1.0]) {
              canvas.drawCircle(o + Offset(s * cw * 0.24, 0), k * 0.7, fill(stain.withValues(alpha: 0.75)));
            }
          default:
            canvas.drawCircle(o, k * 1.05, fill(stain.withValues(alpha: 0.55)));
            canvas.drawCircle(o + Offset(k * 0.3, -k * 0.2), k * 0.3, fill(stain));
        }
      }
    }, caption: '${zoneName(pStr(p, 'zone', 'tip'))} · ×400');
    tally(canvas, size, [for (final ph in phases) (phaseName(ph), '${c[ph] ?? 0}')]);
  }
}

/// Pollen germination on sucrose: the share of grains that put out a tube.
class PollenBench extends LabBench {
  const PollenBench();

  static const sucroses = [0.0, 5.0, 10.0, 15.0, 20.0, 30.0];

  /// Highest share that germinates at each sucrose concentration.
  static double gMax(double s) => switch (s) {
        0 => 0.05,
        5 => 0.35,
        10 => 0.70,
        15 => 0.78,
        20 => 0.55,
        _ => 0.15,
      };

  static double germinated(double s, double minutes) => minutes <= 15 ? 0 : gMax(s) * (1 - math.exp(-(minutes - 15) / 30));

  @override
  String get kind => 'pollen';

  @override
  LabParams get defaults => {'sucrose': 10.0, 'min': 60.0, 'field': 1};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('sucrose', tr('Sucrose'), [for (final s in sucroses) (s, '${s.toStringAsFixed(0)} %')]),
        LabSlider('min', tr('Time after sowing'), 0, 120, divisions: 12, unit: ' min'),
        LabSlider('field', tr('Field of view'), 1, 6, divisions: 5),
      ];

  static List<SpecimenItem> grains(LabParams p) {
    final s = pNum(p, 'sucrose', 10);
    final g = germinated(s, pNum(p, 'min', 60));
    return Specimen.field(s.round() * 17 + pInt(p, 'field', 1), 5, 6, {'germinated': g, 'grain': 1 - g}, jitter: 0.5);
  }

  @override
  List<LabColumn> get columns => [LabColumn(tr('Sucrose (%)'), 0), LabColumn(tr('Time (min)'), 0), LabColumn(tr('Germinated'), 0), LabColumn(tr('Total'), 0), LabColumn(tr('Germination (%)'), 0)];

  @override
  LabReading read(LabParams p) {
    final c = Specimen.count(grains(p));
    final g = c['germinated'] ?? 0, n = g + (c['grain'] ?? 0);
    return LabReading.row([pNum(p, 'sucrose', 10), pNum(p, 'min', 60), g, n, _r(100 * g / n, 1)]);
  }

  @override
  LabGraph graph(LabParams p) {
    final s = pNum(p, 'sucrose', 10);
    return LabGraph(1, 4, curve: true, include: (r) => r[0] == s);
  }

  @override
  String? result(List<List<Object>> rows) {
    final late = <double, List<double>>{};
    for (final r in rows) {
      if ((r[1] as num) >= 90) late.putIfAbsent((r[0] as num).toDouble(), () => []).add((r[4] as num).toDouble());
    }
    if (late.length < 3) return null;
    final means = {for (final e in late.entries) e.key: meanSe(e.value).mean};
    final best = means.entries.reduce((a, b) => a.value >= b.value ? a : b);
    return tr('After 90 minutes or more, germination is highest at {s} % sucrose ({g} %). Too little sugar gives no food for the tube; too much draws water out of the grain.', {'s': best.key.toStringAsFixed(0), 'g': best.value.toStringAsFixed(0)});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final items = grains(p);
    final c = Specimen.count(items);
    final grow = (pNum(p, 'min', 60) - 15).clamp(0, 105) / 105;
    microscopeField(canvas, size, const Color(0xFFFDF7E3), (box) {
      final cell = box.width / 6;
      for (final it in items) {
        final o = Offset(box.left + it.at.dx * box.width, box.top + it.at.dy * box.height);
        if (it.kind == 'germinated') {
          final a = it.angle * 2;
          final len = cell * (0.4 + 0.9 * grow) * it.size;
          final path = Path()..moveTo(o.dx, o.dy);
          final end = o + Offset(math.cos(a), math.sin(a)) * len;
          final mid = o + Offset(math.cos(a + 0.5), math.sin(a + 0.5)) * len * 0.5;
          path.quadraticBezierTo(mid.dx, mid.dy, end.dx, end.dy);
          canvas.drawPath(path, stroke(const Color(0xFFC9A227), 3));
        }
        canvas.drawCircle(o, cell * 0.16 * it.size, fill(const Color(0xFFF2C94C)));
        canvas.drawCircle(o, cell * 0.16 * it.size, stroke(const Color(0xFFA67C00), 1.4));
      }
    }, caption: '${pNum(p, 'sucrose', 10).toStringAsFixed(0)} % · ${pNum(p, 'min', 60).toStringAsFixed(0)} min · ×100');
    tally(canvas, size, [(tr('Germinated'), '${c['germinated'] ?? 0}'), (tr('Total'), '${items.length}')]);
  }
}
