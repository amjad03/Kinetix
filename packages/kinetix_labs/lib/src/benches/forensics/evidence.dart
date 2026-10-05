import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../core/i18n.dart';
import '../../engines/biology.dart' show labNoise;
import '../../engines/forensics.dart';
import '../biology/cells.dart' show microscopeField;

double _r(double v, int k) => (v * k).round() / k;

/// ABO and Rh blood grouping with anti-A, anti-B and anti-D sera: clumping
/// (agglutination) shows the antigen is on the red cells.
class BloodTypingBench extends LabBench {
  const BloodTypingBench();

  /// Sample → (antigens, group).
  static const samples = {
    'p1': ({'A', 'D'}, 'A+'),
    'p2': ({'B'}, 'B−'),
    'p3': ({'A', 'B', 'D'}, 'AB+'),
    'p4': ({'D'}, 'O+'),
    'p5': (<String>{}, 'O−'),
    'scene': ({'B'}, 'B−'),
  };
  static const sera = ['A', 'B', 'D'];

  @override
  String get kind => 'blood-typing';

  @override
  LabParams get defaults => {'sample': 'p1', 'serum': 'A'};

  static String sampleName(String s) => s == 'scene' ? tr('Bloodstain from the scene') : tr('Person {n}', {'n': s.substring(1)});
  static String serumName(String s) => 'anti-${s == 'D' ? 'D (Rh)' : s}';

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('sample', tr('Sample'), [for (final s in samples.keys) (s, sampleName(s))]),
        LabChoice('serum', tr('Antiserum'), [for (final s in sera) (s, serumName(s))]),
      ];

  static bool clumps(LabParams p) => samples[pStr(p, 'sample', 'p1')]!.$1.contains(pStr(p, 'serum', 'A'));

  @override
  List<LabColumn> get columns => [LabColumn(tr('Sample')), LabColumn(tr('Antiserum')), LabColumn(tr('Clumping'))];

  @override
  LabReading read(LabParams p) => LabReading.row([sampleName(pStr(p, 'sample', 'p1')), serumName(pStr(p, 'serum', 'A')), clumps(p) ? tr('Yes') : tr('No')]);

  @override
  String? result(List<List<Object>> rows) {
    final groups = <String, String>{};
    for (final s in samples.keys) {
      final tests = {for (final r in rows) if (r[0] == sampleName(s)) r[1] as String: r[2] == tr('Yes')};
      if (tests.length < 3) continue;
      final a = tests[serumName('A')]!, b = tests[serumName('B')]!, d = tests[serumName('D')]!;
      groups[s] = '${a && b ? 'AB' : a ? 'A' : b ? 'B' : 'O'}${d ? '+' : '−'}';
    }
    if (groups.isEmpty) return null;
    final out = [for (final e in groups.entries) '${sampleName(e.key)}: ${e.value}'];
    final scene = groups['scene'];
    if (scene != null) {
      final same = [for (final e in groups.entries) if (e.key != 'scene' && e.value == scene) sampleName(e.key)];
      out.add(same.isEmpty
          ? tr('No one tested so far has the stain’s group {g}.', {'g': scene})
          : tr('The stain is group {g}, the same as {who}; everyone else is excluded. A blood group can exclude a person but not identify one: many people share each group.', {'g': scene, 'who': same.join(', ')}));
    }
    return '${out.join('. ')}.';
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final s = pStr(p, 'sample', 'p1');
    final tile = Rect.fromLTWH(w * 0.08, h * 0.2, w * 0.84, h * 0.5);
    canvas.drawRRect(RRect.fromRectAndRadius(tile, const Radius.circular(10)), fill(Colors.white));
    canvas.drawRRect(RRect.fromRectAndRadius(tile, const Radius.circular(10)), stroke(LabInk.faint, 2));
    for (var i = 0; i < 3; i++) {
      final c = Offset(tile.left + tile.width * (i + 0.5) / 3, tile.center.dy);
      final rad = tile.height * 0.32;
      final tested = sera[i] == pStr(p, 'serum', 'A');
      canvas.drawCircle(c, rad, fill(const Color(0xFFF7F3F3)));
      canvas.drawCircle(c, rad, stroke(tested ? LabInk.accent : LabInk.faint, tested ? 3 : 1.5));
      if (tested) {
        if (clumps(p)) {
          final rnd = math.Random(i * 7 + s.length);
          canvas.drawCircle(c, rad * 0.8, fill(const Color(0x22B71C1C)));
          for (var k = 0; k < 26; k++) {
            final a = rnd.nextDouble() * 2 * math.pi, d = math.sqrt(rnd.nextDouble()) * rad * 0.7;
            canvas.drawCircle(c + Offset(math.cos(a), math.sin(a)) * d, 3 + rnd.nextDouble() * 5, fill(const Color(0xFF8E0E0E)));
          }
        } else {
          canvas.drawCircle(c, rad * 0.8, fill(const Color(0xFFC62828)));
        }
      } else {
        canvas.drawCircle(c, rad * 0.35, fill(const Color(0x55C62828)));
      }
      label(canvas, serumName(sera[i]), Offset(c.dx, tile.bottom + 18), size: 14, bold: tested);
    }
    label(canvas, sampleName(s), Offset(w / 2, h * 0.12), size: 16, bold: true);
    label(canvas, clumps(p) ? tr('Clumps: the antigen is present') : tr('Smooth: no clumping'), Offset(w / 2, h * 0.86), size: 15, bold: true);
  }
}

/// Glass fragments: what each one is.
class GlassFragment {
  final double density, index, mass;
  const GlassFragment(this.density, this.index, this.mass);
}

const glassFragments = {
  'scene': GlassFragment(2.506, 1.5204, 1.236),
  'window': GlassFragment(2.506, 1.5205, 4.812),
  'bottle': GlassFragment(2.470, 1.5162, 3.150),
  'headlamp': GlassFragment(2.230, 1.4760, 2.402),
};

String glassName(String g) => switch (g) {
      'window' => tr('Broken window at the scene'),
      'bottle' => tr('Bottle found nearby'),
      'headlamp' => tr('Suspect car headlamp'),
      _ => tr('Fragment from the suspect’s shoe'),
    };

String _glass(LabParams p) => glassFragments.containsKey(pStr(p, 'glass')) ? pStr(p, 'glass') : 'scene';

/// Density of glass fragments by weighing in air and in water (Archimedes).
class GlassDensityBench extends LabBench {
  const GlassDensityBench();

  @override
  String get kind => 'glass-density';

  @override
  LabParams get defaults => {'glass': 'scene', 'in': 'air'};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('glass', tr('Fragment'), [for (final g in glassFragments.keys) (g, glassName(g))]),
        LabChoice('in', tr('Weigh it'), [('air', tr('In air')), ('water', tr('Hanging in water'))]),
      ];

  static (double, double) masses(String g) {
    final f = glassFragments[g]!;
    return (f.mass, _r(f.mass * (1 - 0.997 / f.density), 1000));
  }

  @override
  List<LabColumn> get columns => [LabColumn(tr('Fragment')), LabColumn(tr('In air (g)'), 3), LabColumn(tr('In water (g)'), 3), LabColumn(tr('Density (g/cm³)'), 3)];

  /// Density and its uncertainty from a 0.001 g balance.
  static (double, double) density(String g) {
    final (a, wt) = masses(g);
    final rho = GlassEvidence.density(a, wt);
    final u = rho * math.sqrt(math.pow(0.001 / a, 2) + math.pow(0.0014 / (a - wt), 2));
    return (rho, u);
  }

  @override
  LabReading read(LabParams p) {
    final g = _glass(p);
    final (a, wt) = masses(g);
    return LabReading.row([glassName(g), a, wt, _r(density(g).$1, 1000)]);
  }

  @override
  String? result(List<List<Object>> rows) {
    final seen = {for (final g in glassFragments.keys) if (rows.any((r) => r[0] == glassName(g))) g};
    if (!seen.contains('scene') || seen.length < 2) return null;
    final (rs, us) = density('scene');
    final out = [tr('Shoe fragment: {d} g/cm³.', {'d': pm(rs, us)})];
    for (final g in seen.where((g) => g != 'scene')) {
      final (r, u) = density(g);
      final close = (r - rs).abs() <= 2 * math.sqrt(u * u + us * us);
      out.add(close
          ? tr('{g}: {d} g/cm³, the same within the uncertainty: it could be the source.', {'g': glassName(g), 'd': pm(r, u)})
          : tr('{g}: {d} g/cm³, different: excluded.', {'g': glassName(g), 'd': pm(r, u)}));
    }
    return out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final g = _glass(p);
    final water = pStr(p, 'in', 'air') == 'water';
    final (a, wt) = masses(g);
    // Balance with the fragment on a hook, a beaker of water raised under it.
    final pan = Rect.fromLTWH(w * 0.3, h * 0.12, w * 0.4, h * 0.14);
    canvas.drawRRect(RRect.fromRectAndRadius(pan, const Radius.circular(8)), fill(const Color(0xFF2E343C)));
    label(canvas, '${(water ? wt : a).toStringAsFixed(3)} g', pan.center, size: pan.height * 0.4, bold: true, color: const Color(0xFF9FD8B9));
    final hook = Offset(w * 0.5, pan.bottom);
    canvas.drawLine(hook, hook + Offset(0, h * 0.34), stroke(LabInk.wire, 1.5));
    final frag = Path()
      ..moveTo(hook.dx - 14, hook.dy + h * 0.34)
      ..lineTo(hook.dx + 16, hook.dy + h * 0.33)
      ..lineTo(hook.dx + 8, hook.dy + h * 0.4)
      ..lineTo(hook.dx - 10, hook.dy + h * 0.41)
      ..close();
    canvas.drawPath(frag, fill(const Color(0x9980CBC4)));
    canvas.drawPath(frag, stroke(const Color(0xFF26A69A), 1.5));
    if (water) {
      final beaker = Rect.fromLTWH(w * 0.38, h * 0.52, w * 0.24, h * 0.36);
      canvas.drawRect(Rect.fromLTRB(beaker.left, beaker.top + h * 0.02, beaker.right, beaker.bottom), fill(LabInk.water));
      canvas.drawLine(beaker.topLeft, beaker.bottomLeft, stroke(LabInk.ink, 2));
      canvas.drawLine(beaker.bottomLeft, beaker.bottomRight, stroke(LabInk.ink, 2));
      canvas.drawLine(beaker.bottomRight, beaker.topRight, stroke(LabInk.ink, 2));
    }
    label(canvas, glassName(g), Offset(w / 2, h * 0.94), size: 14, bold: true);
  }
}

/// Refractive index of glass fragments by immersion in a heated oil: the
/// Becke line vanishes when the oil's index equals the glass's.
class GlassIndexBench extends LabBench {
  const GlassIndexBench();

  @override
  String get kind => 'glass-index';

  @override
  LabParams get defaults => {'glass': 'scene', 'temp': 50.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('glass', tr('Fragment'), [for (final g in glassFragments.keys) (g, glassName(g))]),
        LabSlider('temp', tr('Hot stage'), 25, 110, divisions: 170, unit: ' °C', decimals: 1),
      ];

  /// Glass index minus oil index.
  static double diff(LabParams p) => glassFragments[_glass(p)]!.index - GlassEvidence.oil(pNum(p, 'temp', 50));

  static String becke(double d) => d.abs() < 0.00025
      ? tr('Edges vanish: match')
      : d > 0
          ? tr('Bright line moves into the glass')
          : tr('Bright line moves into the oil');

  @override
  List<LabColumn> get columns => [LabColumn(tr('Fragment')), LabColumn(tr('Temperature (°C)'), 1), LabColumn(tr('Becke line (focus raised)')), LabColumn(tr('Oil index'), 4)];

  @override
  LabReading read(LabParams p) => LabReading.row([glassName(_glass(p)), pNum(p, 'temp', 50), becke(diff(p)), _r(GlassEvidence.oil(pNum(p, 'temp', 50)), 10000)]);

  @override
  List<String> live(LabParams p) => [becke(diff(p))];

  @override
  String? result(List<List<Object>> rows) {
    final match = <String, List<double>>{};
    for (final r in rows) {
      if (r[2] == tr('Edges vanish: match')) match.putIfAbsent(r[0] as String, () => []).add((r[3] as num).toDouble());
    }
    final scene = match[glassName('scene')];
    if (match.isEmpty) return null;
    final out = [for (final e in match.entries) tr('{g}: n = {n}.', {'g': e.key, 'n': pm(meanSe(e.value).mean, 0.0002)})];
    if (scene != null) {
      final ns = meanSe(scene).mean;
      for (final e in match.entries.where((e) => e.key != glassName('scene'))) {
        final n = meanSe(e.value).mean;
        out.add((n - ns).abs() <= 0.0004 ? tr('{g} matches the shoe fragment.', {'g': e.key}) : tr('{g} does not match: excluded.', {'g': e.key}));
      }
      final hl = rows.where((r) => r[0] == glassName('headlamp')).toList();
      if (hl.isNotEmpty && !match.containsKey(glassName('headlamp'))) {
        out.add(tr('The headlamp never matches up to 110 °C: its index is far lower (borosilicate glass), so it is excluded.'));
      }
    }
    return out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final d = diff(p);
    microscopeField(canvas, size, const Color(0xFFFFF8E1), (box) {
      final c = box.center;
      final frag = Path()
        ..moveTo(c.dx - box.width * 0.28, c.dy - box.height * 0.1)
        ..lineTo(c.dx + box.width * 0.05, c.dy - box.height * 0.3)
        ..lineTo(c.dx + box.width * 0.3, c.dy + box.height * 0.05)
        ..lineTo(c.dx + box.width * 0.02, c.dy + box.height * 0.28)
        ..lineTo(c.dx - box.width * 0.22, c.dy + box.height * 0.18)
        ..close();
      final contrast = (d.abs() / 0.004).clamp(0.0, 1.0);
      canvas.drawPath(frag, fill(Color.lerp(const Color(0xFFFFF8E1), const Color(0xFFD7CCC8), contrast)!));
      // Dark edge and the bright Becke halo on the side of higher index.
      canvas.drawPath(frag, stroke(Color.fromRGBO(60, 50, 40, contrast), 4));
      if (d.abs() >= 0.00025) {
        canvas.save();
        if (d > 0) {
          canvas.clipPath(frag);
        } else {
          canvas.clipPath(Path.combine(PathOperation.difference, Path()..addRect(box), frag));
        }
        canvas.drawPath(frag, stroke(Colors.white.withValues(alpha: 0.4 + 0.5 * contrast), 9));
        canvas.restore();
      }
    }, caption: '${glassName(_glass(p))} · ${pNum(p, 'temp', 50).toStringAsFixed(1)} °C · n(oil) = ${GlassEvidence.oil(pNum(p, 'temp', 50)).toStringAsFixed(4)}');
  }
}

/// A hair or fibre as seen under the microscope.
class Strand {
  final double width, medulla;
  final String surface;
  const Strand(this.width, this.medulla, this.surface);
}

/// Hair and fibre microscopy: width, medulla and surface, compared with
/// samples of known origin.
class HairFibreBench extends LabBench {
  const HairFibreBench();

  static const hair = {
    'q-hair': Strand(88, 58, 'imbricate'),
    'suspect-hair': Strand(78, 18, 'imbricate'),
    'victim-hair': Strand(62, 0, 'imbricate'),
    'dog': Strand(90, 60, 'imbricate'),
    'cat': Strand(48, 34, 'spinous'),
  };
  static const fibre = {
    'q-fibre': Strand(24, 0, 'scales'),
    'cotton': Strand(17, 0, 'twisted'),
    'wool': Strand(25, 0, 'scales'),
    'silk': Strand(12, 0, 'smooth'),
    'polyester': Strand(20, 0, 'rod'),
    'jute': Strand(20, 0, 'nodes'),
  };

  /// One eyepiece-micrometer division at ×400 (µm).
  static const division = 2.5;

  @override
  String get kind => 'hair-fibre';

  @override
  LabParams get defaults => {'kit': 'hair', 'sample': 'q-hair', 'strand': 1.0};

  static Map<String, Strand> kit(LabParams p) => pStr(p, 'kit', 'hair') == 'fibre' ? fibre : hair;

  static String sample(LabParams p) => kit(p).containsKey(pStr(p, 'sample')) ? pStr(p, 'sample') : kit(p).keys.first;

  static String sampleName(String s) => switch (s) {
        'q-hair' => tr('Hair found on the victim'),
        'suspect-hair' => tr('Suspect’s scalp hair'),
        'victim-hair' => tr('Victim’s scalp hair'),
        'dog' => tr('Hair of the suspect’s dog'),
        'cat' => tr('Cat hair'),
        'q-fibre' => tr('Fibre found at the scene'),
        'cotton' => tr('Cotton'),
        'wool' => tr('Wool (suspect’s sweater)'),
        'silk' => tr('Silk'),
        'polyester' => tr('Polyester'),
        'jute' => tr('Jute'),
        _ => s,
      };

  static String surfaceName(String s) => switch (s) {
        'imbricate' => tr('Flattened, overlapping scales'),
        'spinous' => tr('Pointed, petal-like scales'),
        'scales' => tr('Scales on the surface'),
        'twisted' => tr('Flat twisted ribbon'),
        'smooth' => tr('Smooth, glassy, no markings'),
        'rod' => tr('Smooth even rod'),
        'nodes' => tr('Bundles with cross-markings'),
        _ => s,
      };

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('sample', tr('Slide'), [for (final s in kit(p).keys) (s, sampleName(s))]),
        LabSlider('strand', tr('Strand'), 1, 5, divisions: 4),
      ];

  /// Width and medulla of this strand as read on the micrometer (whole divisions).
  static (double, double) measure(LabParams p) {
    final s = sample(p), st = kit(p)[s]!;
    final k = 1 + 0.07 * labNoise('$s${pInt(p, 'strand', 1)}');
    double div(double v) => (v * k / division).round() * division;
    return (div(st.width), div(st.medulla));
  }

  @override
  List<LabColumn> get columns => [LabColumn(tr('Slide')), LabColumn(tr('Width (µm)'), 1), LabColumn(tr('Medulla (µm)'), 1), LabColumn(tr('Medullary index'), 2), LabColumn(tr('Surface'))];

  @override
  LabReading read(LabParams p) {
    final s = sample(p);
    final (wd, md) = measure(p);
    final isHair = pStr(p, 'kit', 'hair') != 'fibre';
    return LabReading.row([sampleName(s), wd, isHair ? md : '—', isHair ? _r(md / wd, 100) : '—', surfaceName(kit(p)[s]!.surface)]);
  }

  @override
  String? result(List<List<Object>> rows) {
    final hairKit = rows.isNotEmpty && rows.first[2] != '—';
    final all = hairKit ? hair : fibre;
    final widths = <String, List<double>>{};
    final mi = <String, List<double>>{};
    for (final r in rows) {
      final key = all.keys.firstWhere((k) => sampleName(k) == r[0], orElse: () => '');
      if (key.isEmpty) continue;
      widths.putIfAbsent(key, () => []).add((r[1] as num).toDouble());
      if (r[3] is num) mi.putIfAbsent(key, () => []).add((r[3] as num).toDouble());
    }
    final q = hairKit ? 'q-hair' : 'q-fibre';
    final qw = widths[q];
    if (qw == null || qw.length < 2 || widths.length < 2) return null;
    final out = <String>[];
    if (hairKit) {
      final m = meanSe(mi[q]!).mean;
      out.add(m >= 0.5
          ? tr('The questioned hair has a medullary index of {m}: more than ½, so it is an animal hair (human hair is below ⅓).', {'m': m.toStringAsFixed(2)})
          : tr('The questioned hair has a medullary index of {m}: below ⅓, typical of human hair.', {'m': m.toStringAsFixed(2)}));
    }
    final qm = meanSe(qw);
    for (final e in widths.entries.where((e) => e.key != q && e.value.length >= 2)) {
      final m = meanSe(e.value);
      final sameLook = all[e.key]!.surface == all[q]!.surface && ((all[e.key]!.medulla > 0) == (all[q]!.medulla > 0));
      final close = (m.mean - qm.mean).abs() <= 2 * math.sqrt(m.se * m.se + qm.se * qm.se) + division;
      out.add(sameLook && close
          ? tr('{s}: width {w} µm and the same appearance: consistent with the questioned strand.', {'s': sampleName(e.key), 'w': pm(m.mean, m.se)})
          : tr('{s}: width {w} µm, different: excluded.', {'s': sampleName(e.key), 'w': pm(m.mean, m.se)}));
    }
    return out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final s = sample(p), st = kit(p)[s]!;
    final (wd, md) = measure(p);
    microscopeField(canvas, size, const Color(0xFFF4F1EA), (box) {
      final px = box.width / 160; // field is 160 µm across
      final c = box.center;
      final half = wd * px / 2;
      canvas.save();
      canvas.translate(c.dx, c.dy);
      canvas.rotate(-0.35);
      final body = Rect.fromLTRB(-box.width, -half, box.width, half);
      final colour = switch (st.surface) {
        'twisted' => const Color(0xFFF5F5F5),
        'smooth' || 'rod' => const Color(0xFFE3F2FD),
        'nodes' => const Color(0xFFD7B98E),
        _ => s == 'victim-hair' ? const Color(0xFF5D4037) : const Color(0xFFA1887F),
      };
      if (st.surface == 'twisted') {
        final path = Path();
        for (var x = -box.width; x <= box.width; x += 4) {
          final y = half * math.cos(x / (half * 1.6));
          x == -box.width ? path.moveTo(x, y) : path.lineTo(x, y);
        }
        for (var x = box.width; x >= -box.width; x -= 4) {
          path.lineTo(x, -half * math.cos(x / (half * 1.6)) * 0.6 - half * 0.4);
        }
        path.close();
        canvas.drawPath(path, fill(colour));
        canvas.drawPath(path, stroke(const Color(0xFF9E9E9E), 1.2));
      } else {
        canvas.drawRect(body, fill(colour));
        canvas.drawLine(body.topLeft, body.topRight, stroke(const Color(0x88000000), 1.4));
        canvas.drawLine(body.bottomLeft, body.bottomRight, stroke(const Color(0x88000000), 1.4));
      }
      if (md > 0) canvas.drawRect(Rect.fromLTRB(-box.width, -md * px / 2, box.width, md * px / 2), fill(const Color(0xFF3E2723).withValues(alpha: 0.75)));
      final mark = stroke(const Color(0x66000000), 1.2);
      switch (st.surface) {
        case 'imbricate' || 'scales':
          for (var x = -box.width; x < box.width; x += half * 0.9) {
            canvas.drawArc(Rect.fromCenter(center: Offset(x, 0), width: half * 1.2, height: half * 2), -math.pi / 2, math.pi, false, mark);
          }
        case 'spinous':
          for (var x = -box.width; x < box.width; x += half * 0.7) {
            canvas.drawLine(Offset(x, -half), Offset(x + half * 0.5, 0), mark);
            canvas.drawLine(Offset(x + half * 0.5, 0), Offset(x, half), mark);
          }
        case 'nodes':
          for (var x = -box.width; x < box.width; x += half * 2.4) {
            canvas.drawLine(Offset(x, -half), Offset(x + 6, half), stroke(const Color(0x99000000), 2));
          }
        case 'smooth':
          canvas.drawLine(Offset(-box.width, -half * 0.3), Offset(box.width, -half * 0.3), stroke(Colors.white, 2));
      }
      canvas.restore();
      // Eyepiece micrometer: 64 divisions of 2.5 µm.
      final y = box.bottom - 24;
      canvas.drawLine(Offset(box.left + 10, y), Offset(box.left + 10 + 64 * division * px, y), stroke(LabInk.ink, 1.5));
      for (var k = 0; k <= 64; k++) {
        final x = box.left + 10 + k * division * px;
        canvas.drawLine(Offset(x, y), Offset(x, y - (k % 10 == 0 ? 10 : k % 5 == 0 ? 7 : 4)), stroke(LabInk.ink, 1));
      }
    }, caption: '${sampleName(s)} · ×400 · ${tr('width')} ${wd.toStringAsFixed(1)} µm');
  }
}

/// Stature from footprints: the ratio of height to foot length from known
/// people, applied to a print from the scene.
class FootprintBench extends LabBench {
  const FootprintBench();

  /// Person → (foot length cm, stature cm); null stature for the scene print.
  static const people = {
    'v1': (24.2, 160.0),
    'v2': (25.8, 171.0),
    'v3': (23.1, 152.0),
    'v4': (27.0, 178.0),
    'v5': (26.3, 172.0),
    'v6': (22.6, 151.0),
    'scene': (26.6, null),
  };

  @override
  String get kind => 'footprint';

  @override
  LabParams get defaults => {'print': 'v1'};

  static String printName(String k) => k == 'scene' ? tr('Footprint at the scene') : tr('Volunteer {n}', {'n': k.substring(1)});

  @override
  List<LabControl> controls(LabParams p) => [LabChoice('print', tr('Footprint'), [for (final k in people.keys) (k, printName(k))])];

  static String key(LabParams p) => people.containsKey(pStr(p, 'print')) ? pStr(p, 'print') : 'v1';

  @override
  List<LabColumn> get columns => [LabColumn(tr('Footprint')), LabColumn(tr('Foot length (cm)'), 1), LabColumn(tr('Height (cm)'), 0), LabColumn(tr('Height ÷ foot'), 2)];

  @override
  LabReading read(LabParams p) {
    final k = key(p);
    final (l, s) = people[k]!;
    return LabReading.row([printName(k), l, s ?? '?', s == null ? '?' : _r(s / l, 100)]);
  }

  @override
  String? result(List<List<Object>> rows) {
    final ratios = [for (final r in rows) if (r[3] is num) (r[3] as num).toDouble()];
    if (ratios.length < 3) return null;
    final m = meanSe(ratios);
    final out = [tr('Height is {r} times the foot length ({n} people; spread ± {sd}).', {'r': pm(m.mean, m.se), 'n': '${ratios.length}', 'sd': m.sd.toStringAsFixed(2)})];
    final scene = [for (final r in rows) if (r[3] == '?') (r[1] as num).toDouble()];
    if (scene.isNotEmpty) {
      final l = scene.last;
      // A single person's height varies with the spread (SD), not just the SE.
      final u = l * math.sqrt(m.sd * m.sd + m.se * m.se);
      out.add(tr('The scene print is {l} cm long, so the person was about {h} cm tall.', {'l': l.toStringAsFixed(1), 'h': pm(l * m.mean, u)}));
    }
    return out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final k = key(p);
    final l = people[k]!.$1;
    // Sole outline to scale: 30 cm fills the height.
    final cm = h * 0.8 / 30;
    final heel = Offset(w * 0.4, h * 0.9), toe = heel - Offset(0, l * cm);
    final sole = Path()
      ..moveTo(heel.dx, heel.dy)
      ..cubicTo(heel.dx - 3.2 * cm, heel.dy, heel.dx - 3.4 * cm, heel.dy - l * 0.35 * cm, heel.dx - 2.4 * cm, heel.dy - l * 0.55 * cm)
      ..cubicTo(heel.dx - 4.6 * cm, heel.dy - l * 0.8 * cm, heel.dx - 3.6 * cm, toe.dy, toe.dx - 0.6 * cm, toe.dy)
      ..cubicTo(toe.dx + 2.4 * cm, toe.dy, heel.dx + 4.2 * cm, heel.dy - l * 0.72 * cm, heel.dx + 3.0 * cm, heel.dy - l * 0.5 * cm)
      ..cubicTo(heel.dx + 2.0 * cm, heel.dy - l * 0.3 * cm, heel.dx + 3.0 * cm, heel.dy, heel.dx, heel.dy)
      ..close();
    canvas.drawPath(sole, fill(k == 'scene' ? const Color(0xFFBCAAA4) : const Color(0xFFD7CCC8)));
    canvas.drawPath(sole, stroke(const Color(0xFF6D4C41), 2));
    // Ruler from heel to the tip of the big toe.
    final rx = w * 0.62;
    canvas.drawRect(Rect.fromLTRB(rx, toe.dy - 10, rx + 30, heel.dy), fill(const Color(0xFFFFF59D)));
    for (var c = 0; c <= 30; c++) {
      final y = heel.dy - c * cm;
      if (y < toe.dy - 10) break;
      canvas.drawLine(Offset(rx, y), Offset(rx + (c % 5 == 0 ? 14 : 7), y), stroke(LabInk.ink, 1));
      if (c % 5 == 0) label(canvas, '$c', Offset(rx + 22, y), size: 10);
    }
    dashed(canvas, Offset(toe.dx, toe.dy), Offset(rx, toe.dy), stroke(LabInk.red, 1.5));
    dashed(canvas, Offset(heel.dx, heel.dy), Offset(rx, heel.dy), stroke(LabInk.red, 1.5));
    label(canvas, '${l.toStringAsFixed(1)} cm', Offset(rx + 80, (toe.dy + heel.dy) / 2), size: 18, bold: true);
    label(canvas, printName(k), Offset(w * 0.4, h * 0.05), size: 15, bold: true);
  }
}

/// Bullet trajectory: a hole in a window pane and one in the wall behind,
/// traced back with a rod to the shooter's position.
class BallisticsBench extends LabBench {
  const BallisticsBench();

  /// Case → (wall hole height, pane hole height, pane–wall distance,
  /// distance of the cartridge cases from the wall), metres.
  static const cases = {
    'a': (1.12, 1.24, 1.5, 6.0),
    'b': (1.30, 1.18, 2.0, 5.0),
  };

  @override
  String get kind => 'ballistics';

  @override
  LabParams get defaults => {'case': 'a', 'x': 3.0};

  static String caseName(String c) => tr('Case {c}', {'c': c.toUpperCase()});

  static String caseOf(LabParams p) => cases.containsKey(pStr(p, 'case')) ? pStr(p, 'case') : 'a';

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('case', tr('Case'), [for (final c in cases.keys) (c, caseName(c))]),
        LabSlider('x', tr('Measure at'), 0, 7, divisions: 28, unit: ' m', decimals: 2),
      ];

  static double height(LabParams p) {
    final (hw, hp, d, _) = cases[caseOf(p)]!;
    final x = pNum(p, 'x', 3);
    return _r(Trajectory.heightAt(x, hw, hp, d) + 0.004 * labNoise('${caseOf(p)}$x'), 1000);
  }

  @override
  List<LabColumn> get columns => [LabColumn(tr('Case')), LabColumn(tr('Distance from wall (m)'), 2), LabColumn(tr('Height of the rod (m)'), 3)];

  @override
  LabReading read(LabParams p) => LabReading.row([caseName(caseOf(p)), pNum(p, 'x', 3), height(p)]);

  @override
  LabGraph graph(LabParams p) {
    final c = caseName(caseOf(p));
    return LabGraph(1, 2, line: true, include: (r) => r[0] == c);
  }

  @override
  String? result(List<List<Object>> rows) {
    final out = <String>[];
    for (final c in cases.keys) {
      final rs = [for (final r in rows) if (r[0] == caseName(c)) r];
      if (rs.length < 3) continue;
      final f = LinearFit.of([for (final r in rs) (r[1] as num).toDouble()], [for (final r in rs) (r[2] as num).toDouble()]);
      if (f == null) continue;
      final ang = math.atan(f.slope) * 180 / math.pi, angU = f.slopeSe / (1 + f.slope * f.slope) * 180 / math.pi;
      final dist = cases[c]!.$4;
      final g = f.at(dist), gU = math.sqrt(math.pow(f.interceptSe, 2) + math.pow(dist * f.slopeSe, 2));
      out.add(tr('{c}: the rod rises {a}° from the wall; at the cartridge cases ({d} m) it is {g} m above the floor.', {'c': caseName(c), 'a': pm(ang, angU), 'd': dist.toStringAsFixed(1), 'g': pm(g, gU)}));
      out.add(g > 1.25
          ? tr('A gun held at about shoulder height by a standing person fits.')
          : g < 0.9
              ? tr('Lower than a standing shooter: kneeling, sitting or firing from the hip.')
              : tr('About chest height of a standing person.'));
    }
    if (out.isEmpty) return null;
    out.add(tr('Over a few metres a bullet at 350 m/s drops less than {d} mm, so a straight rod is a fair model.', {'d': (Trajectory.drop(7, 350) * 1000).toStringAsFixed(0)}));
    return out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final (hw, hp, d, dist) = cases[caseOf(p)]!;
    // Side view: wall on the left, 7.5 m of floor, 2.5 m high.
    final floor = h * 0.86, wallX = w * 0.08;
    final mx = (w * 0.86) / 7.5, my = (h * 0.74) / 2.5;
    Offset at(double x, double y) => Offset(wallX + x * mx, floor - y * my);
    canvas.drawRect(Rect.fromLTRB(wallX - 14, floor - 2.5 * my, wallX, floor), fill(const Color(0xFFBDBDBD)));
    canvas.drawLine(Offset(wallX - 14, floor), Offset(w * 0.98, floor), stroke(LabInk.ink, 2));
    // Window pane.
    canvas.drawRect(Rect.fromPoints(at(d, 0.8), at(d, 2.1)).inflate(3), fill(LabInk.glass));
    canvas.drawCircle(at(d, hp), 4, fill(LabInk.ink));
    canvas.drawCircle(at(0, hw), 4, fill(LabInk.ink));
    // Trajectory rod (laser) back to the shooter.
    canvas.drawLine(at(0, hw), at(7.2, Trajectory.heightAt(7.2, hw, hp, d)), stroke(LabInk.red.withValues(alpha: 0.8), 2));
    // Cartridge cases and an outline of a standing person there.
    final feet = at(dist, 0);
    canvas.drawRect(Rect.fromCenter(center: feet - const Offset(0, 3), width: 10, height: 5), fill(const Color(0xFFC9A227)));
    final head = at(dist + 0.25, 1.62);
    canvas.drawCircle(head, 0.11 * my, stroke(LabInk.muted, 1.5));
    canvas.drawLine(head + Offset(0, 0.11 * my), at(dist + 0.25, 0.9), stroke(LabInk.muted, 1.5));
    canvas.drawLine(at(dist + 0.25, 0.9), at(dist + 0.1, 0), stroke(LabInk.muted, 1.5));
    canvas.drawLine(at(dist + 0.25, 0.9), at(dist + 0.4, 0), stroke(LabInk.muted, 1.5));
    // Measuring tape at x.
    final x = pNum(p, 'x', 3);
    final y = height(p);
    dashed(canvas, at(x, 0), at(x, y), stroke(LabInk.blue, 2));
    canvas.drawCircle(at(x, y), 5, fill(LabInk.blue));
    label(canvas, '${y.toStringAsFixed(3)} m', at(x, y) + const Offset(0, -16), size: 14, bold: true, color: LabInk.blue);
    label(canvas, '${x.toStringAsFixed(2)} m', at(x, 0) + const Offset(0, 14), size: 12, color: LabInk.muted);
    label(canvas, caseName(caseOf(p)), Offset(w * 0.5, h * 0.06), size: 15, bold: true);
  }
}
