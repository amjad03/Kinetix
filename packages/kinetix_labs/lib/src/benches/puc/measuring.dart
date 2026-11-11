import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../core/i18n.dart';
import 'kit.dart';

/// Repeat readings of a real object differ a little (it is not perfectly
/// round or flat): the difference, in units of the least count, at [trial].
const _wobble = [0, 1, -1, 2, 0, -1, 1, -2];
int wobble(int trial) => _wobble[trial % _wobble.length];

// ------------------------------------------------------------ vernier

/// Vernier callipers: 1 MSD = 1 mm, 10 VSD = 9 MSD, so the least count is
/// 0.01 cm. Tasks: the diameter of a sphere ('sphere'), the volume of a
/// cylinder ('cylinder'), or the internal volume of a beaker ('beaker').
class VernierBench extends LabBench with LabDemo {
  const VernierBench();

  static const lc = 0.01; // cm

  /// True sizes (cm) of what each task measures.
  static const sizes = <String, double>{'d-sphere': 1.94, 'd-cyl': 2.46, 'l-cyl': 4.37, 'di': 5.38, 'depth': 6.72};

  static List<String> quantities(String task) => switch (task) {
        'cylinder' => const ['zero', 'd-cyl', 'l-cyl'],
        'beaker' => const ['zero', 'di', 'depth'],
        'all' => const ['zero', 'd-sphere', 'd-cyl', 'l-cyl', 'di', 'depth'],
        _ => const ['zero', 'd-sphere'],
      };

  static String quantityName(String q) => switch (q) {
        'zero' => tr('Zero error (jaws closed)'),
        'd-sphere' => tr('Diameter of the sphere'),
        'd-cyl' => tr('Diameter of the cylinder'),
        'l-cyl' => tr('Length of the cylinder'),
        'di' => tr('Internal diameter of the beaker'),
        _ => tr('Depth of the beaker'),
      };

  @override
  String get kind => 'vernier';

  @override
  LabParams get defaults => {'task': 'sphere', 'q': 'd-sphere', 'open': 3.0, 'zero': 0.03, 'trial': 0, 'help': true};

  @override
  LabParams get preview => {...defaults, 'open': 1.94};

  static String quantity(LabParams p) {
    final qs = quantities(pStr(p, 'task', 'sphere'));
    final q = pStr(p, 'q');
    return qs.contains(q) ? q : qs[1];
  }

  /// The size the jaws close on now (cm): zero for the zero-error check.
  static double target(LabParams p) {
    final q = quantity(p);
    if (q == 'zero') return 0;
    return sizes[q]! + wobble(pInt(p, 'trial')) * lc;
  }

  /// Jaw opening (cm): the object stops the jaws.
  static double opening(LabParams p) => math.max(pNum(p, 'open', 3), target(p));

  static bool touching(LabParams p) => pNum(p, 'open', 3) <= target(p) + 0.004;

  /// What the scales show (cm), zero error included.
  static double observed(LabParams p) => ((opening(p) + pNum(p, 'zero')) / lc).round() * lc;

  static (double, int) split(double obs) {
    final msr = obs < 0 ? -0.1 : (obs * 10 + 1e-6).floorToDouble() / 10;
    return (msr, ((obs - msr) / lc).round());
  }

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('q', tr('Measure'), [for (final q in quantities(pStr(p, 'task', 'sphere'))) (q, quantityName(q))]),
        LabSlider('open', tr('Slide the jaw'), 0, 12, divisions: 1200, unit: ' cm', decimals: 2),
        LabAction('close', tr('Close the jaws gently'), Icons.compress, primary: true),
        LabAction('turn', tr('Turn the object'), Icons.rotate_right),
        LabChoice('zero', tr('Zero error of this instrument'), const [(0.0, '0.00 cm'), (0.03, '+0.03 cm'), (-0.04, '−0.04 cm')]),
        LabToggle('help', tr('Show how to read it')),
      ];

  @override
  LabParams act(String action, LabParams p) => switch (action) {
        'close' => {...p, 'open': target(p)},
        'turn' => {...p, 'trial': pInt(p, 'trial') + 1, 'open': target({...p, 'trial': pInt(p, 'trial') + 1}) + 0.5},
        'set:q' => {...p, 'open': target(p) + 0.6},
        _ => p,
      };

  @override
  List<LabColumn> get columns => [LabColumn(tr('Quantity')), LabColumn('MSR (cm)', 1), LabColumn('VSC', 0), LabColumn(tr('Observed (cm)'), 2), LabColumn(tr('Corrected (cm)'), 2)];

  @override
  LabReading read(LabParams p) {
    if (!touching(p)) return LabReading.not(tr('The jaws are not touching: close them gently on the object.'));
    final obs = observed(p);
    final (msr, vsc) = split(obs);
    final q = quantity(p);
    final corr = q == 'zero' ? 0.0 : ((obs - pNum(p, 'zero')) / lc).round() * lc;
    return LabReading.row([quantityName(q), msr, vsc, obs, corr]);
  }

  @override
  List<String> live(LabParams p) {
    final (msr, vsc) = split(observed(p));
    return [
      touching(p) ? tr('Jaws touching') : tr('Jaws open'),
      'LC = 0.01 cm',
      if (pBool(p, 'help')) 'MSR ${msr.toStringAsFixed(1)} cm + $vsc × 0.01',
    ];
  }

  @override
  List<LabParams> demo(LabParams start) {
    final task = pStr(start, 'task', 'sphere');
    final out = <LabParams>[];
    for (final q in quantities(task)) {
      for (var t = 0; t < (q == 'zero' ? 1 : (task == 'all' ? 2 : 3)); t++) {
        final p = {...start, 'q': q, 'trial': t};
        out.add({...p, 'open': target(p)});
      }
    }
    return out;
  }

  @override
  String? result(List<List<Object>> rows) {
    double? mean(String q) {
      final vs = [for (final r in rows) if (r[0] == quantityName(q)) (r[4] as num).toDouble()];
      return vs.isEmpty ? null : vs.reduce((a, b) => a + b) / vs.length;
    }

    String f(double v) => v.toStringAsFixed(3);
    final zs = [for (final r in rows) if (r[0] == quantityName('zero')) (r[3] as num).toDouble()];
    final out = <String>[if (zs.isNotEmpty) tr('Zero error = {e} cm (subtracted from every reading).', {'e': zs.last.toStringAsFixed(2)})];
    final d = mean('d-sphere');
    if (d != null) out.add(tr('Mean diameter d = {d} cm, so the volume V = πd³/6 = {v} cm³.', {'d': f(d), 'v': (math.pi * d * d * d / 6).toStringAsFixed(2)}));
    final dc = mean('d-cyl'), l = mean('l-cyl');
    if (dc != null && l != null) out.add(tr('d = {d} cm, l = {l} cm, so V = πd²l/4 = {v} cm³.', {'d': f(dc), 'l': f(l), 'v': (math.pi * dc * dc * l / 4).toStringAsFixed(2)}));
    final di = mean('di'), h = mean('depth');
    if (di != null && h != null) out.add(tr('Internal diameter {d} cm and depth {h} cm: internal volume V = πd²h/4 = {v} cm³ ({v} mL).', {'d': f(di), 'h': f(h), 'v': (math.pi * di * di * h / 4).toStringAsFixed(1)}));
    return out.isEmpty ? tr('Record each quantity three times; the mean goes into the formula.') : out.join(' ');
  }

  /// Main scale (mm ticks, numbered every cm) along y = [y] from [x0] (its
  /// zero), and the vernier with its zero at main-scale reading [v0] cm.
  static void scales(Canvas canvas, double x0, double y, double ppc, double v0, {double from = -0.5, double to = 15.5, int? hit, double text = 13}) {
    final tick = stroke(LabInk.ink, 1.1);
    for (var mm = (from * 10).ceil(); mm <= to * 10; mm++) {
      final x = x0 + mm / 10 * ppc;
      final len = mm % 10 == 0 ? ppc * 0.34 : (mm % 5 == 0 ? ppc * 0.25 : ppc * 0.17);
      canvas.drawLine(Offset(x, y), Offset(x, y - len), tick);
      if (mm % 10 == 0 && mm >= 0) label(canvas, '${mm ~/ 10}', Offset(x, y - ppc * 0.34 - text * 0.8), size: text, bold: true);
    }
    for (var k = 0; k <= 10; k++) {
      final x = x0 + (v0 + k * 0.09) * ppc;
      final len = k % 5 == 0 ? ppc * 0.3 : ppc * 0.2;
      final on = k == hit;
      canvas.drawLine(Offset(x, y + 1), Offset(x, y + len), stroke(on ? LabInk.red : LabInk.ink, on ? 2.2 : 1.1));
      if (k % 5 == 0) label(canvas, '$k', Offset(x, y + ppc * 0.3 + text * 0.75), size: text * 0.9, color: on ? LabInk.red : LabInk.ink, bold: on);
    }
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final q = quantity(p);
    final ppc = math.min(w * 0.6 / 16.5, h * 0.09);
    final xz = w * 0.06 + ppc * 1.2; // main-scale zero = fixed-jaw face
    final beamTop = h * 0.26, beamH = ppc * 1.05, beamBot = beamTop + beamH;
    final yms = beamTop + beamH * 0.62;
    final open = opening(p), obs = observed(p), e = pNum(p, 'zero');
    final face = xz + open * ppc;
    final jawLen = ppc * 3.2, jawW = ppc * 0.9;
    Kit.table(canvas, Rect.fromLTWH(0, h * 0.86, w, h * 0.14));

    // The object.
    final objC = Offset((xz + face) / 2, beamBot + jawLen * 0.55);
    switch (q) {
      case 'd-sphere':
        Kit.ball(canvas, objC, target(p) * ppc / 2, const Color(0xFF8C9AA6));
      case 'd-cyl':
        final r = Rect.fromCenter(center: objC, width: target(p) * ppc, height: target(p) * ppc * 1.1);
        canvas.drawRect(r, Kit.cylinder(r, const Color(0xFFB0773C)));
        canvas.drawOval(Rect.fromCenter(center: r.topCenter, width: r.width, height: r.width * 0.25), fill(const Color(0xFFD9A066)));
      case 'l-cyl':
        final r = Rect.fromCenter(center: objC, width: target(p) * ppc, height: 2.46 * ppc);
        canvas.drawRect(r, Kit.cylinder(r, const Color(0xFFB0773C), vertical: false));
        canvas.drawOval(Rect.fromCenter(center: r.centerRight, width: r.height * 0.25, height: r.height), fill(const Color(0xFFD9A066)));
      case 'di':
        // The beaker upside down over the upper jaws: its inner walls touch them.
        final inner = Rect.fromLTRB(xz - ppc * 0.5, beamTop - ppc * 2.6, xz - ppc * 0.5 + target(p) * ppc, beamTop - ppc * 0.15);
        final glass = Path()
          ..addRect(Rect.fromLTRB(inner.left - 8, inner.top - 8, inner.right + 8, inner.bottom))
          ..addRect(Rect.fromLTRB(inner.left, inner.top, inner.right, inner.bottom + 1))
          ..fillType = PathFillType.evenOdd;
        canvas.drawPath(glass, fill(const Color(0x8878B7E0)));
        canvas.drawPath(glass, stroke(const Color(0xFF4A86B0), 1.2));
      case 'depth':
        // The beaker on its side: the beam end rests on the rim, the rod reaches the base.
        final end = xz + 15 * ppc;
        final r = Rect.fromLTWH(end, beamTop - ppc * 1.7, target(p) * ppc, ppc * 4.2);
        canvas.drawRect(Rect.fromLTRB(r.left, r.top, r.right + 8, r.top + 8), fill(const Color(0x8878B7E0)));
        canvas.drawRect(Rect.fromLTRB(r.left, r.bottom - 8, r.right + 8, r.bottom), fill(const Color(0x8878B7E0)));
        canvas.drawRect(Rect.fromLTRB(r.right, r.top, r.right + 8, r.bottom), fill(const Color(0x8878B7E0)));
        canvas.drawRect(Rect.fromLTRB(r.left, r.top, r.right + 8, r.bottom), stroke(const Color(0xFF4A86B0), 1.2));
    }

    // Fixed jaws (lower: outside; upper: inside) and the beam.
    final fixedLower = Path()
      ..moveTo(xz - jawW * 1.4, beamTop)
      ..lineTo(xz, beamTop)
      ..lineTo(xz, beamBot + jawLen)
      ..lineTo(xz - jawW * 0.35, beamBot + jawLen - ppc * 0.25)
      ..lineTo(xz - jawW * 1.4, beamBot)
      ..close();
    canvas.drawPath(fixedLower, Kit.steel(fixedLower.getBounds(), vertical: true));
    canvas.drawPath(fixedLower, stroke(Kit.steelDark, 1.2));
    final up = ppc * 0.5;
    final fixedUpper = Path()
      ..moveTo(xz - up, beamTop)
      ..lineTo(xz - up, beamTop - ppc * 1.5)
      ..lineTo(xz - up * 0.4, beamTop - ppc * 1.3)
      ..lineTo(xz - up * 0.15, beamTop)
      ..close();
    canvas.drawPath(fixedUpper, Kit.steel(fixedUpper.getBounds(), vertical: true));
    canvas.drawPath(fixedUpper, stroke(Kit.steelDark, 1.2));
    final beam = Rect.fromLTRB(xz - jawW * 1.4, beamTop, xz + 15.6 * ppc, beamBot);
    canvas.drawRect(beam, Kit.steel(beam));
    canvas.drawRect(beam, stroke(Kit.steelDark, 1.2));
    label(canvas, 'cm', Offset(xz + 15.25 * ppc, beamTop + beamH * 0.18), size: 11, color: LabInk.muted);

    // The sliding vernier with its jaws, thumb rest and depth rod.
    final v0 = open + e; // vernier zero (cm on the main scale)
    final xv = xz + v0 * ppc;
    final slider = Rect.fromLTRB(face - ppc * 0.15, yms, face + ppc * 3.6, beamBot + ppc * 0.3);
    final movingLower = Path()
      ..moveTo(face, beamBot)
      ..lineTo(face, beamBot + jawLen)
      ..lineTo(face + jawW * 0.35, beamBot + jawLen - ppc * 0.25)
      ..lineTo(face + jawW * 1.5, slider.bottom)
      ..close();
    canvas.drawPath(movingLower, Kit.steel(movingLower.getBounds(), vertical: true));
    canvas.drawPath(movingLower, stroke(Kit.steelDark, 1.2));
    final movingUpper = Path()
      ..moveTo(face - up * 1.0 - 0.0, beamTop)
      ..lineTo(face - up * 0.85, beamTop - ppc * 1.3)
      ..lineTo(face - up * 0.5, beamTop - ppc * 1.5)
      ..lineTo(face - up * 0.5, beamTop)
      ..close();
    canvas.drawPath(movingUpper.shift(Offset(-up * 0.0, 0)), Kit.steel(movingUpper.getBounds(), vertical: true));
    canvas.drawPath(movingUpper, stroke(Kit.steelDark, 1.2));
    canvas.drawRRect(RRect.fromRectAndRadius(slider, const Radius.circular(3)), Kit.steel(slider));
    canvas.drawRRect(RRect.fromRectAndRadius(slider, const Radius.circular(3)), stroke(Kit.steelDark, 1.2));
    // Locking screw and thumb rest.
    final screw = Offset(slider.left + ppc * 1.8, beamTop - ppc * 0.18);
    canvas.drawRect(Rect.fromCenter(center: screw + Offset(0, ppc * 0.12), width: ppc * 0.22, height: ppc * 0.3), fill(Kit.steelDark));
    canvas.drawOval(Rect.fromCenter(center: screw, width: ppc * 0.55, height: ppc * 0.28), Kit.steel(Rect.fromCenter(center: screw, width: ppc * 0.55, height: ppc * 0.28)));
    for (var i = 0; i < 6; i++) {
      final x = slider.right - ppc * 0.9 + i * ppc * 0.12;
      canvas.drawLine(Offset(x, slider.bottom), Offset(x, slider.bottom + ppc * 0.18), stroke(Kit.steelDark, 1.4));
    }
    final rodY = beamTop + beamH * 0.18;
    final rodEnd = xz + 15 * ppc + open * ppc;
    canvas.drawLine(Offset(xz + 15.6 * ppc, rodY), Offset(rodEnd, rodY), stroke(Kit.steelDark, ppc * 0.12));
    // Scales.
    final (msr, vsc) = split(obs);
    scales(canvas, xz, yms, ppc, v0, from: -0.5, to: 15, hit: pBool(p, 'help') ? vsc : null, text: math.max(10, ppc * 0.26));

    label(canvas, quantityName(q), Offset(w * 0.06, h * 0.07), size: 18, bold: true, centre: false);
    label(canvas, touching(p) ? tr('Jaws touching') : tr('Jaws open'), Offset(w * 0.06, h * 0.07 + 28), size: 14, color: touching(p) ? LabInk.green : LabInk.muted, centre: false);
    if (q != 'depth') label(canvas, tr('Main scale'), Offset(xz + 9.5 * ppc, beamTop - 14), size: 13, color: LabInk.muted);
    label(canvas, tr('Vernier scale'), Offset(xv + 0.45 * ppc, slider.bottom + 16), size: 13, color: LabInk.muted);

    // Magnifier on the vernier.
    final mc = Offset(w * 0.8, h * 0.64), mr = math.min(w * 0.17, h * 0.27);
    final zoom = mr * 2 / 1.6; // px per cm inside: about 1.6 cm across
    Kit.magnifier(canvas, mc, mr, (c) {
      c.drawRect(Rect.fromCircle(center: mc, radius: mr), fill(Kit.steelLight));
      c.drawRect(Rect.fromLTRB(mc.dx - mr, mc.dy, mc.dx + mr, mc.dy + mr), fill(const Color(0xFFD5DADF)));
      final x0 = mc.dx - (v0 + 0.45) * zoom;
      scales(c, x0, mc.dy, zoom, v0, from: v0 - 1.2, to: v0 + 1.6, hit: pBool(p, 'help') ? vsc : null, text: 14);
    }, caption: pBool(p, 'help') ? '${msr.toStringAsFixed(1)} + $vsc × 0.01 = ${obs.toStringAsFixed(2)} cm' : tr('Read the scales'));
    label(canvas, '× 6', mc + Offset(mr * 0.72, -mr * 0.82), size: 14, bold: true, color: LabInk.muted);
  }
}

// ------------------------------------------------------- screw gauge

/// Screw gauge: pitch 1 mm, 100 head-scale divisions, least count 0.01 mm.
/// Tasks: the diameter of a wire ('wire') or the thickness of a sheet ('sheet').
class ScrewGaugeBench extends LabBench with LabDemo {
  const ScrewGaugeBench();

  static const lc = 0.01; // mm
  static const sizes = <String, double>{'wire': 0.52, 'sheet': 1.37};

  @override
  String get kind => 'screw-gauge';

  @override
  LabParams get defaults => {'task': 'wire', 'q': 'wire', 'gap': 2.0, 'zero': 3, 'trial': 0, 'help': true};

  @override
  LabParams get preview => {...defaults, 'gap': 0.52};

  static List<String> quantities(String task) => switch (task) {
        'sheet' => const ['zero', 'sheet'],
        'all' => const ['zero', 'wire', 'sheet'],
        _ => const ['zero', 'wire'],
      };

  static String quantity(LabParams p) {
    final qs = quantities(pStr(p, 'task', 'wire'));
    final q = pStr(p, 'q');
    return qs.contains(q) ? q : qs[1];
  }

  static String quantityName(String q) => switch (q) {
        'zero' => tr('Zero error (faces touching)'),
        'sheet' => tr('Thickness of the sheet'),
        _ => tr('Diameter of the wire'),
      };

  static double target(LabParams p) => quantity(p) == 'zero' ? 0 : sizes[quantity(p)]! + wobble(pInt(p, 'trial')) * lc;
  static double gapOf(LabParams p) => math.max(pNum(p, 'gap', 2), target(p));
  static bool touching(LabParams p) => pNum(p, 'gap', 2) <= target(p) + 0.003;

  /// What the scales show (mm), zero error (in head divisions) included.
  static double observed(LabParams p) => ((gapOf(p) + pInt(p, 'zero') * lc) / lc).round() * lc;

  static (int, int) split(double obs) {
    final psr = obs < 0 ? 0 : (obs + 1e-6).floor();
    return (psr, ((obs - psr) / lc).round());
  }

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('q', tr('Measure'), [for (final q in quantities(pStr(p, 'task', 'wire'))) (q, quantityName(q))]),
        LabSlider('gap', tr('Turn the thimble'), 0, 8, divisions: 800, unit: ' mm', decimals: 2),
        LabAction('close', tr('Turn the ratchet until it clicks'), Icons.settings_backup_restore, primary: true),
        LabAction('turn', tr('Measure at another place'), Icons.swap_horiz),
        LabChoice('zero', tr('Zero error of this instrument'), const [(0, '0'), (3, '+3 div'), (-4, '−4 div')]),
        LabToggle('help', tr('Show how to read it')),
      ];

  @override
  LabParams act(String action, LabParams p) => switch (action) {
        'close' => {...p, 'gap': target(p)},
        'turn' => {...p, 'trial': pInt(p, 'trial') + 1, 'gap': target(p) + 0.8},
        'set:q' => {...p, 'gap': target(p) + 0.8},
        _ => p,
      };

  @override
  List<LabColumn> get columns => [LabColumn(tr('Quantity')), LabColumn('PSR (mm)', 0), LabColumn('HSC', 0), LabColumn(tr('Observed (mm)'), 2), LabColumn(tr('Corrected (mm)'), 2)];

  @override
  LabReading read(LabParams p) {
    if (!touching(p)) return LabReading.not(tr('Turn the ratchet until it clicks: the faces must just hold the object.'));
    final obs = observed(p);
    final (psr, hsc) = split(obs);
    final q = quantity(p);
    final corr = q == 'zero' ? 0.0 : ((obs - pInt(p, 'zero') * lc) / lc).round() * lc;
    return LabReading.row([quantityName(q), psr, hsc, obs, corr]);
  }

  @override
  List<String> live(LabParams p) {
    final (psr, hsc) = split(observed(p));
    return [touching(p) ? tr('Ratchet clicks: faces touching') : tr('Faces apart'), 'LC = 1 mm ÷ 100 = 0.01 mm', if (pBool(p, 'help')) 'PSR $psr mm + $hsc × 0.01'];
  }

  @override
  List<LabParams> demo(LabParams start) {
    final out = <LabParams>[];
    for (final q in quantities(pStr(start, 'task', 'wire'))) {
      for (var t = 0; t < (q == 'zero' ? 1 : 3); t++) {
        final p = {...start, 'q': q, 'trial': t};
        out.add({...p, 'gap': target(p)});
      }
    }
    return out;
  }

  @override
  String? result(List<List<Object>> rows) {
    final out = <String>[];
    for (final q in ['wire', 'sheet']) {
      final vs = [for (final r in rows) if (r[0] == quantityName(q)) (r[4] as num).toDouble()];
      if (vs.isEmpty) continue;
      final m = meanSe(vs);
      if (q == 'wire') {
        out.add(tr('Mean diameter d = {d} mm; area of cross-section πd²/4 = {a} mm².', {'d': pm(m.mean, m.se), 'a': (math.pi * m.mean * m.mean / 4).toStringAsFixed(4)}));
      } else {
        out.add(tr('Mean thickness t = {t} mm; for a 5.00 cm × 2.50 cm sheet the volume is {v} cm³.', {'t': pm(m.mean, m.se), 'v': (5 * 2.5 * m.mean / 10).toStringAsFixed(3)}));
      }
    }
    final zs = [for (final r in rows) if (r[0] == quantityName('zero')) (r[3] as num).toDouble()];
    if (zs.isNotEmpty) out.insert(0, tr('Zero error = {e} mm.', {'e': zs.last.toStringAsFixed(2)}));
    return out.isEmpty ? tr('Take the zero error, then four readings at different places.') : out.join(' ');
  }

  /// The sleeve (linear scale) and thimble (head scale) with the thimble's
  /// edge at main-scale reading [obs] mm; [ppm] pixels per mm; the reference
  /// line along y = [y], sleeve zero at [x0].
  static void barrel(Canvas canvas, double x0, double y, double ppm, double obs, double radius, {bool help = true}) {
    final edge = x0 + obs * ppm;
    final sleeve = Rect.fromLTRB(x0 - ppm * 1.5, y - radius * 0.42, edge + 4, y + radius * 0.42);
    canvas.drawRect(sleeve, Kit.cylinder(sleeve, const Color(0xFFC9CED4), vertical: false));
    canvas.drawLine(Offset(sleeve.left, y), Offset(edge, y), stroke(LabInk.ink, 1.4));
    for (var mm = 0; x0 + mm * ppm < edge - 1; mm++) {
      final x = x0 + mm * ppm;
      canvas.drawLine(Offset(x, y), Offset(x, y - (mm % 5 == 0 ? radius * 0.3 : radius * 0.2)), stroke(LabInk.ink, 1.2));
      if (mm % 5 == 0) label(canvas, '$mm', Offset(x, y - radius * 0.36 - 7), size: math.max(10, radius * 0.16), bold: true);
    }
    // Thimble.
    final th = Rect.fromLTWH(edge, y - radius, radius * 2.1, radius * 2);
    canvas.drawRRect(RRect.fromRectAndCorners(th, topLeft: const Radius.circular(4), bottomLeft: const Radius.circular(4)), Kit.cylinder(th, const Color(0xFFBFC5CC), vertical: false));
    canvas.drawPath(
        Path()
          ..moveTo(edge, y - radius)
          ..lineTo(edge + radius * 0.25, y - radius)
          ..lineTo(edge + radius * 0.25, y + radius)
          ..lineTo(edge, y + radius),
        fill(const Color(0x22000000)));
    final head = ((obs - obs.floorToDouble()) * 100);
    for (var j = -24; j <= 24; j++) {
      final div = (head.round() + j);
      final phi = (div - head) / 100 * 2 * math.pi;
      if (math.cos(phi) <= 0.05) continue;
      final yy = y - radius * math.sin(phi);
      final value = ((div % 100) + 100) % 100;
      final major = value % 5 == 0;
      canvas.drawLine(Offset(edge, yy), Offset(edge + (major ? radius * 0.32 : radius * 0.2), yy), stroke(LabInk.ink, major ? 1.4 : 1));
      if (major && math.cos(phi) > 0.4) label(canvas, '$value', Offset(edge + radius * 0.5, yy), size: math.max(9, radius * 0.15 * math.cos(phi)));
    }
    // Knurled grip.
    final grip = Rect.fromLTWH(th.left + radius * 1.0, th.top + 2, radius * 1.0, th.height - 4);
    for (var k = 0; k < 14; k++) {
      final x = grip.left + grip.width * k / 14;
      canvas.drawLine(Offset(x, grip.top), Offset(x + 4, grip.bottom), stroke(const Color(0x55000000), 1));
    }
    if (help) canvas.drawLine(Offset(edge - 6, y), Offset(edge + radius * 0.45, y), stroke(LabInk.red.withValues(alpha: 0.75), 1.5));
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final q = quantity(p);
    final gap = gapOf(p), obs = observed(p);
    final ppm = math.min(w * 0.024, h * 0.038);
    Kit.table(canvas, Rect.fromLTWH(0, h * 0.86, w, h * 0.14));
    final axisY = h * 0.27;
    final anvilFace = w * 0.24;
    final r = ppm * 2.2;
    // U-frame.
    final frame = Path()
      ..moveTo(anvilFace - ppm * 2.6, axisY - ppm * 1.0)
      ..lineTo(anvilFace - ppm * 2.6, axisY + ppm * 5.5)
      ..quadraticBezierTo(anvilFace - ppm * 2.6, axisY + ppm * 9, anvilFace + ppm * 3, axisY + ppm * 9)
      ..lineTo(anvilFace + ppm * 10, axisY + ppm * 9)
      ..quadraticBezierTo(anvilFace + ppm * 14, axisY + ppm * 9, anvilFace + ppm * 14, axisY + ppm * 4)
      ..lineTo(anvilFace + ppm * 14, axisY - ppm * 1.0)
      ..lineTo(anvilFace + ppm * 10.5, axisY - ppm * 1.0)
      ..lineTo(anvilFace + ppm * 10.5, axisY + ppm * 3.2)
      ..quadraticBezierTo(anvilFace + ppm * 10.5, axisY + ppm * 5.6, anvilFace + ppm * 8, axisY + ppm * 5.6)
      ..lineTo(anvilFace + ppm * 1, axisY + ppm * 5.6)
      ..quadraticBezierTo(anvilFace - ppm * 0.9, axisY + ppm * 5.6, anvilFace - ppm * 0.9, axisY + ppm * 3)
      ..lineTo(anvilFace - ppm * 0.9, axisY - ppm * 1.0)
      ..close();
    canvas.drawPath(frame.shift(const Offset(3, 4)), fill(const Color(0x22000000)));
    canvas.drawPath(frame, fill(Kit.enamel));
    canvas.drawPath(frame, stroke(const Color(0xFF1C2E23), 1.5));
    // Anvil and spindle.
    final anvil = Rect.fromLTRB(anvilFace - ppm * 0.9, axisY - ppm * 0.6, anvilFace, axisY + ppm * 0.6);
    canvas.drawRect(anvil, Kit.steel(anvil));
    final spFace = anvilFace + gap * ppm;
    final x0 = anvilFace + ppm * 14 + ppm * 0.5; // sleeve zero (barrel scale origin)
    final spindle = Rect.fromLTRB(spFace, axisY - ppm * 0.6, x0 + obs * ppm, axisY + ppm * 0.6);
    canvas.drawRect(spindle, Kit.steel(spindle));
    // Object.
    if (q == 'wire') {
      final d = target(p) * ppm;
      canvas.drawLine(Offset((anvilFace + spFace) / 2, axisY - ppm * 4), Offset((anvilFace + spFace) / 2, axisY + ppm * 4), stroke(const Color(0xFFB87333), d));
    } else if (q == 'sheet') {
      final rr = Rect.fromLTRB(anvilFace, axisY - ppm * 3, anvilFace + target(p) * ppm, axisY + ppm * 3);
      canvas.drawRect(rr, fill(const Color(0xAA78B7E0)));
      canvas.drawRect(rr, stroke(const Color(0xFF4A86B0), 1));
    }
    barrel(canvas, x0, axisY, ppm, obs, r, help: pBool(p, 'help'));
    // Ratchet.
    final rat = Rect.fromLTWH(x0 + obs * ppm + r * 2.1, axisY - r * 0.5, r * 0.9, r);
    canvas.drawRRect(RRect.fromRectAndRadius(rat, const Radius.circular(4)), Kit.cylinder(rat, const Color(0xFFBFC5CC), vertical: false));
    label(canvas, tr('Ratchet'), rat.center + Offset(0, r * 0.95), size: 15, bold: true, color: LabInk.muted);
    label(canvas, tr('Anvil'), Offset(anvilFace - ppm * 0.5, axisY - ppm * 3.6), size: 15, bold: true, color: LabInk.muted);
    label(canvas, tr('Spindle'), Offset(spFace + ppm * 3, axisY - ppm * 1.6), size: 15, bold: true, color: LabInk.muted);
    label(canvas, tr('Sleeve'), Offset(x0 - ppm * 0.5, axisY - r * 1.2), size: 15, bold: true, color: LabInk.muted);
    label(canvas, tr('Thimble'), Offset(x0 + obs * ppm + r, axisY + r * 1.25), size: 15, bold: true, color: LabInk.muted);
    label(canvas, quantityName(q), Offset(w * 0.05, h * 0.06), size: 18, bold: true, centre: false);
    label(canvas, touching(p) ? tr('Ratchet clicks: faces touching') : tr('Faces apart'), Offset(w * 0.05, h * 0.06 + 28), size: 14, color: touching(p) ? LabInk.green : LabInk.muted, centre: false);
    // Magnified sleeve and thimble.
    final mc = Offset(w * 0.33, h * 0.79), mr = math.min(w * 0.14, h * 0.16);
    final z = mr / 4.5;
    final (psr, hsc) = split(obs);
    Kit.magnifier(canvas, mc, mr, (c) {
      c.drawRect(Rect.fromCircle(center: mc, radius: mr), fill(const Color(0xFFF4F1EA)));
      barrel(c, mc.dx - obs * z - z * 0.2, mc.dy, z, obs, z * 2.6, help: pBool(p, 'help'));
    }, caption: pBool(p, 'help') ? '$psr + $hsc × 0.01 = ${obs.toStringAsFixed(2)} mm' : tr('Read the scales'));
    // Small inset: the object between the faces.
    final oc = Offset(w * 0.68, h * 0.79), orr = math.min(w * 0.11, h * 0.15);
    Kit.magnifier(canvas, oc, orr, (c) {
      final zz = orr / 1.6;
      final af = oc.dx - (gap / 2) * zz;
      c.drawRect(Rect.fromLTRB(oc.dx - orr, oc.dy - zz * 0.5, af, oc.dy + zz * 0.5), Kit.steel(Rect.fromLTRB(oc.dx - orr, oc.dy - zz * 0.5, af, oc.dy + zz * 0.5)));
      c.drawRect(Rect.fromLTRB(af + gap * zz, oc.dy - zz * 0.5, oc.dx + orr, oc.dy + zz * 0.5), Kit.steel(Rect.fromLTRB(af, oc.dy - zz * 0.5, oc.dx + orr, oc.dy + zz * 0.5)));
      if (q == 'wire') Kit.ball(c, Offset(af + target(p) * zz / 2, oc.dy), target(p) * zz / 2, const Color(0xFFB87333));
      if (q == 'sheet') c.drawRect(Rect.fromLTWH(af, oc.dy - orr, target(p) * zz, orr * 2), fill(const Color(0xAA78B7E0)));
    }, caption: tr('Between the faces'));
  }
}

// ------------------------------------------------------- spherometer

/// Spherometer: pitch 1 mm, 100 disc divisions (least count 0.01 mm); legs
/// l = 4.00 cm apart. R = l²/6h + h/2, h the height of the surface's centre
/// above (or below) the plane of the legs.
class SpherometerBench extends LabBench with LabDemo {
  const SpherometerBench();

  static const lc = 0.01, legsCm = 4.0, base = 4.27; // mm: reading on the plane glass

  /// Radius of curvature (cm) of each surface: + convex, − concave.
  static const surfaces = <String, double>{'plane': 0, 'convex': 40, 'concave': -12};

  static String surfaceName(String s) => switch (s) {
        'convex' => tr('Convex lens surface'),
        'concave' => tr('Concave watch glass'),
        _ => tr('Plane glass plate'),
      };

  @override
  String get kind => 'spherometer';

  @override
  LabParams get defaults => {'surface': 'plane', 'tip': 6.0, 'trial': 0, 'help': true};

  @override
  LabParams get preview => {...defaults, 'surface': 'convex', 'tip': base + sag('convex')};

  /// Height (mm) of the surface's centre above the plane of the legs.
  static double sag(String s) {
    final r = surfaces[s] ?? 0;
    if (r == 0) return 0;
    final a = legsCm / math.sqrt(3); // cm, leg-to-centre distance
    final h = r.abs() - math.sqrt(r * r - a * a);
    return (r > 0 ? h : -h) * 10;
  }

  static double target(LabParams p) => base + sag(pStr(p, 'surface', 'plane')) + wobble(pInt(p, 'trial')) * lc;
  static double tipOf(LabParams p) => math.max(pNum(p, 'tip', 6), target(p));
  static bool touching(LabParams p) => pNum(p, 'tip', 6) <= target(p) + 0.003;
  static double observed(LabParams p) => (tipOf(p) / lc).round() * lc;

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('surface', tr('Place it on'), [for (final s in surfaces.keys) (s, surfaceName(s))]),
        LabSlider('tip', tr('Turn the screw'), 0, 9, divisions: 900, unit: ' mm', decimals: 2),
        LabAction('touch', tr('Turn until the tip just touches'), Icons.vertical_align_bottom, primary: true),
        LabAction('again', tr('Lift and repeat'), Icons.replay),
        LabToggle('help', tr('Show how to read it')),
      ];

  @override
  LabParams act(String action, LabParams p) => switch (action) {
        'touch' => {...p, 'tip': target(p)},
        'again' => {...p, 'trial': pInt(p, 'trial') + 1, 'tip': target(p) + 1.2},
        'set:surface' => {...p, 'tip': target(p) + 1.2},
        _ => p,
      };

  @override
  List<LabColumn> get columns => [LabColumn(tr('Surface')), LabColumn('PSR (mm)', 0), LabColumn('CSR', 0), LabColumn(tr('Reading (mm)'), 2)];

  @override
  LabReading read(LabParams p) {
    if (!touching(p)) return LabReading.not(tr('The central tip is not touching: turn the screw until it just touches the surface.'));
    final obs = observed(p);
    final psr = (obs + 1e-6).floor();
    return LabReading.row([surfaceName(pStr(p, 'surface', 'plane')), psr, ((obs - psr) / lc).round(), obs]);
  }

  @override
  List<String> live(LabParams p) => [touching(p) ? tr('Tip touching: all four points rest evenly') : tr('Tip clear of the surface'), 'l = 4.00 cm', 'LC = 0.01 mm'];

  @override
  List<LabParams> demo(LabParams start) => [
        for (final s in ['plane', 'convex', 'concave'])
          for (var t = 0; t < 3; t++)
            () {
              final p = {...start, 'surface': s, 'trial': t};
              return {...p, 'tip': target(p)};
            }(),
      ];

  @override
  String? result(List<List<Object>> rows) {
    double? mean(String s) {
      final vs = [for (final r in rows) if (r[0] == surfaceName(s)) (r[3] as num).toDouble()];
      return vs.isEmpty ? null : vs.reduce((a, b) => a + b) / vs.length;
    }

    final plane = mean('plane');
    if (plane == null) return tr('First take the reading on the plane glass plate.');
    final out = <String>[];
    for (final s in ['convex', 'concave']) {
      final m = mean(s);
      if (m == null) continue;
      final hcm = (m - plane).abs() / 10;
      if (hcm == 0) continue;
      final rr = legsCm * legsCm / (6 * hcm) + hcm / 2;
      out.add(tr('{s}: h = {h} mm, so R = l²/6h + h/2 = {r} cm.', {'s': surfaceName(s), 'h': (hcm * 10).toStringAsFixed(2), 'r': rr.toStringAsFixed(1)}));
    }
    return out.isEmpty ? tr('Now place it on a curved surface.') : out.join(' ');
  }

  /// The disc seen from above with its divisions; [reading] mm.
  static void disc(Canvas canvas, Offset c, double r, double reading, {bool help = true}) {
    canvas.drawCircle(c, r, Paint()..shader = RadialGradient(colors: const [Color(0xFFF2F4F6), Color(0xFFB7BEC6)]).createShader(Rect.fromCircle(center: c, radius: r)));
    canvas.drawCircle(c, r, stroke(Kit.steelDark, 1.5));
    final frac = reading - reading.floorToDouble();
    final csr = (frac * 100).round() % 100;
    for (var k = 0; k < 100; k++) {
      // The pillar (scale edge) is at the right (angle 0); division csr sits there.
      final a = (k - frac * 100) / 100 * 2 * math.pi;
      final u = Offset(math.cos(a), math.sin(a));
      final major = k % 10 == 0, mid = k % 5 == 0;
      canvas.drawLine(c + u * r, c + u * (r - (major ? r * 0.16 : (mid ? r * 0.11 : r * 0.07))), stroke(help && k == csr ? LabInk.red : LabInk.ink, major ? 1.6 : 1));
      if (major) label(canvas, '$k', c + u * (r * 0.72), size: math.max(9, r * 0.1));
    }
    canvas.drawCircle(c, r * 0.18, fill(Kit.steelDark));
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final s = pStr(p, 'surface', 'plane');
    final tip = tipOf(p), obs = observed(p);
    final u = math.min(w * 0.0046, h * 0.0085); // px per mm
    final cx = w * 0.32, surfY = h * 0.76;
    Kit.table(canvas, Rect.fromLTWH(0, h * 0.86, w, h * 0.14));
    // The surface (exaggerated curvature so the sag shows).
    final sagMm = sag(s);
    final half = 4.6 * 10 * u; // 4.6 cm either side
    final glass = Path()..moveTo(cx - half * 1.15, h * 0.86);
    if (s == 'plane') {
      canvas.drawRect(Rect.fromLTRB(cx - half * 1.15, surfY, cx + half * 1.15, h * 0.86), fill(const Color(0x8878B7E0)));
      canvas.drawRect(Rect.fromLTRB(cx - half * 1.15, surfY, cx + half * 1.15, h * 0.86), stroke(const Color(0xFF4A86B0), 1.2));
    } else {
      final k = sagMm * u * 2.2; // drawn sag
      glass
        ..lineTo(cx - half * 1.15, surfY + k * 0.3)
        ..quadraticBezierTo(cx, surfY - k * 1.7, cx + half * 1.15, surfY + k * 0.3)
        ..lineTo(cx + half * 1.15, h * 0.86)
        ..close();
      canvas.drawPath(glass, fill(const Color(0x8878B7E0)));
      canvas.drawPath(glass, stroke(const Color(0xFF4A86B0), 1.2));
    }
    double surfaceAt(double x) => s == 'plane' ? surfY : surfY + sagMm * u * 2.2 * 0.3 - sagMm * u * 2.2 * 2 * (1 - math.pow((x - cx) / (half * 1.15), 2)) * 0.5;
    // Legs (two seen, one behind) resting on the surface.
    final legX = [cx - half * 0.8, cx + half * 0.8, cx + half * 0.15];
    final frameY = surfY - 30 * u;
    final frame = Path()
      ..moveTo(legX[0], frameY)
      ..lineTo(legX[1], frameY)
      ..lineTo(cx + half * 0.15, frameY - 6 * u)
      ..close();
    for (final x in legX) {
      final back = x == legX[2];
      canvas.drawLine(Offset(x, frameY), Offset(x, surfaceAt(x) - (back ? 6 * u : 0)), stroke(back ? Kit.steelMid : Kit.steelDark, back ? 4 : 5));
    }
    canvas.drawPath(frame, fill(Kit.steelMid));
    canvas.drawPath(frame, stroke(Kit.steelDark, 1.4));
    // Central screw, its tip at the drawn height.
    final tipY = surfY - (tip - base) * u * 2.2;
    final screwTop = frameY - 38 * u;
    final screw = Rect.fromLTRB(cx - 3.2 * u, screwTop, cx + 3.2 * u, tipY);
    canvas.drawRect(screw, Kit.steel(screw, vertical: true));
    for (var y = screwTop + 4; y < tipY - 6; y += 6) {
      canvas.drawLine(Offset(screw.left, y), Offset(screw.right, y + 3), stroke(const Color(0x44000000), 1));
    }
    canvas.drawPath(
        Path()
          ..moveTo(screw.left, tipY - 6)
          ..lineTo(cx, tipY)
          ..lineTo(screw.right, tipY - 6)
          ..close(),
        fill(Kit.steelDark));
    // Nut on the frame, disc on top, pillar scale beside it.
    canvas.drawRect(Rect.fromCenter(center: Offset(cx, frameY - 4 * u), width: 14 * u, height: 8 * u), fill(Kit.steelDark));
    final discY = screwTop;
    final discR = 22 * u;
    canvas.drawOval(Rect.fromCenter(center: Offset(cx, discY + 3 * u), width: discR * 2, height: discR * 0.5), fill(Kit.steelDark));
    canvas.drawOval(Rect.fromCenter(center: Offset(cx, discY), width: discR * 2, height: discR * 0.5), Kit.steel(Rect.fromCenter(center: Offset(cx, discY), width: discR * 2, height: discR * 0.5)));
    for (var k = 0; k < 40; k++) {
      final a = k / 40 * math.pi;
      final x = cx + discR * math.cos(a);
      final y = discY + discR * 0.25 * math.sin(a);
      canvas.drawLine(Offset(x, y), Offset(x, y + 3 * u * (k % 4 == 0 ? 1.4 : 0.8)), stroke(LabInk.ink, 1));
    }
    canvas.drawCircle(Offset(cx, discY - 5 * u), 4 * u, fill(Kit.steelDark));
    final pillarX = cx + discR + 4 * u;
    final pillar = Rect.fromLTRB(pillarX - 3 * u, discY - 14 * u, pillarX + 3 * u, frameY);
    canvas.drawRect(pillar, fill(Colors.white));
    canvas.drawRect(pillar, stroke(LabInk.ink, 1.2));
    for (var mm = 0; mm <= 10; mm++) {
      final y = frameY - 4 * u - mm * 4.0 * u;
      if (y < pillar.top + 2) break;
      canvas.drawLine(Offset(pillar.left, y), Offset(pillar.left + (mm % 5 == 0 ? 5 : 3) * u, y), stroke(LabInk.ink, 1));
    }
    label(canvas, tr('Plane of the legs'), Offset(legX[0] - 10, surfY - 10 * u), size: 12, color: LabInk.muted);
    label(canvas, surfaceName(s), Offset(cx, h * 0.92), size: 15, bold: true);
    label(canvas, touching(p) ? tr('Tip touching: all four points rest evenly') : tr('Tip clear of the surface'), Offset(w * 0.05, h * 0.06), size: 16, bold: true, color: touching(p) ? LabInk.green : LabInk.muted, centre: false);
    // Top view of the disc against the pillar scale.
    final mc = Offset(w * 0.76, h * 0.42), mr = math.min(w * 0.17, h * 0.3);
    Kit.magnifier(canvas, mc, mr, (c) {
      c.drawRect(Rect.fromCircle(center: mc, radius: mr), fill(const Color(0xFFF4F1EA)));
      final dc = mc - Offset(mr * 0.28, 0);
      disc(c, dc, mr * 0.78, obs, help: pBool(p, 'help'));
      // Pillar with its mm scale; the disc edge marks the reading.
      final px = dc.dx + mr * 0.78;
      final pill = Rect.fromLTRB(px, mc.dy - mr, px + mr * 0.16, mc.dy + mr);
      c.drawRect(pill, fill(Colors.white));
      c.drawRect(pill, stroke(LabInk.ink, 1.2));
      final mmPx = mr * 0.12;
      for (var mm = 0; mm <= 9; mm++) {
        final y = mc.dy + (obs - mm) * mmPx;
        c.drawLine(Offset(pill.left, y), Offset(pill.left + mr * 0.08, y), stroke(LabInk.ink, 1.2));
        label(c, '$mm', Offset(pill.right + 10, y), size: 12, bold: true);
      }
    }, caption: pBool(p, 'help') ? '${obs.floor()} + ${((obs - obs.floor()) * 100).round()} × 0.01 = ${obs.toStringAsFixed(2)} mm' : tr('Read the scales'));
  }
}
