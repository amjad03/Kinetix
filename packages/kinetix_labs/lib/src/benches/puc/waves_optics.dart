import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../core/i18n.dart';
import 'kit.dart';

// ----------------------------------------------------------- sonometer

/// Sonometer with tuning forks and a paper rider: the resonating length l
/// for each fork at a fixed tension (law of length, n ∝ 1/l: task 'length'),
/// or for one fork at several tensions (law of tension, l ∝ √T: 'tension').
/// n = (1/2l)√(T/μ).
class SonometerLawsBench extends LabBench with LabDemo {
  const SonometerLawsBench();

  static const mu = 6.0e-4; // kg/m, the steel wire's mass per unit length
  static const forks = [256.0, 288.0, 320.0, 341.3, 384.0, 426.7, 480.0, 512.0];
  static const window = 0.006; // resonance: within 0.6 % of the fork's frequency

  @override
  String get kind => 'sonometer-laws';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'task': 'length', 'fork': 256.0, 'mass': 3.0, 'len': 30.0, 'strike': true};

  @override
  LabParams get preview => {...defaults, 'len': (resonant(256, 3) * 10).round() / 10};

  static double tension(double mass) => mass * 9.8;

  /// The resonating length (cm) for fork [n] (Hz) with [mass] (kg) hung.
  static double resonant(double n, double mass) => math.sqrt(tension(mass) / mu) / (2 * n) * 100;

  /// The wire's own frequency (Hz) at length [len] cm.
  static double natural(LabParams p) => math.sqrt(tension(pNum(p, 'mass', 3)) / mu) / (2 * pNum(p, 'len', 30) / 100);

  /// How hard the wire vibrates (1 at resonance).
  static double amplitude(LabParams p) {
    if (!pBool(p, 'strike')) return 0;
    final x = (natural(p) - pNum(p, 'fork', 256)) / pNum(p, 'fork', 256) / window;
    return 1 / (1 + x * x);
  }

  static bool resonating(LabParams p) => amplitude(p) >= 0.5;

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('fork', tr('Tuning fork'), [for (final f in forks) (f, '${f.toStringAsFixed(f == f.roundToDouble() ? 0 : 1)} Hz')]),
        LabChoice('mass', tr('Mass on the hanger'), [for (final m in [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0]) (m, '${m.toStringAsFixed(1)} kg')]),
        LabSlider('len', tr('Distance between the bridges'), 5, 100, divisions: 950, unit: ' cm', decimals: 1),
        LabToggle('strike', tr('Strike the fork, press its stem on the box')),
      ];

  @override
  List<LabColumn> get columns => [LabColumn('n (Hz)', 1), LabColumn('M (kg)', 1), LabColumn('T (N)', 1), LabColumn('√T (√N)', 3), LabColumn('l (cm)', 1), LabColumn('1/l (m⁻¹)', 3), LabColumn('n × l (Hz m)', 1)];

  @override
  LabReading read(LabParams p) {
    if (!pBool(p, 'strike')) return LabReading.not(tr('Strike the fork and press its stem on the box first.'));
    if (!resonating(p)) return LabReading.not(natural(p) > pNum(p, 'fork', 256) ? tr('The rider stays: the wire is too short (its note is higher than the fork). Move the bridge out.') : tr('The rider stays: the wire is too long (its note is lower than the fork). Move the bridge in.'));
    final n = pNum(p, 'fork', 256), m = pNum(p, 'mass', 3), l = pNum(p, 'len', 30);
    final t = tension(m);
    return LabReading.row([n, m, t, math.sqrt(t), l, 100 / l, n * l / 100]);
  }

  @override
  List<String> live(LabParams p) => [
        'T = ${tension(pNum(p, 'mass', 3)).toStringAsFixed(1)} N',
        'l = ${pNum(p, 'len', 30).toStringAsFixed(1)} cm',
        if (pBool(p, 'strike')) resonating(p) ? tr('Resonance: the paper rider flies off') : tr('The rider only trembles'),
      ];

  @override
  LabGraph? graph(LabParams p) => pStr(p, 'task', 'length') == 'tension' ? const LabGraph(3, 4, throughOrigin: true) : const LabGraph(5, 0, throughOrigin: true);

  @override
  List<LabParams> demo(LabParams start) => pStr(start, 'task', 'length') == 'tension'
      ? [for (final m in [1.0, 2.0, 3.0, 4.0, 5.0]) {...start, 'fork': 320.0, 'mass': m, 'strike': true, 'len': (resonant(320, m) * 10).round() / 10}]
      : [for (final f in [256.0, 288.0, 320.0, 384.0, 426.7, 512.0]) {...start, 'fork': f, 'mass': 3.0, 'strike': true, 'len': (resonant(f, 3) * 10).round() / 10}];

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    double n(Object o) => (o as num).toDouble();
    final masses = {for (final r in rows) n(r[1])};
    final forksUsed = {for (final r in rows) n(r[0])};
    final out = <String>[];
    if (masses.length == 1 && rows.length > 1) {
      final nl = meanSe([for (final r in rows) n(r[6])]);
      final t = n(rows.first[2]);
      out.add(tr('At T = {t} N, n × l stays {nl} Hz m for every fork: n ∝ 1/l (law of length). μ = T/(4(nl)²) = {mu} × 10⁻⁴ kg/m.', {
        't': t.toStringAsFixed(1),
        'nl': pm(nl.mean, nl.se),
        'mu': (t / (4 * nl.mean * nl.mean) * 1e4).toStringAsFixed(2),
      }));
    }
    if (forksUsed.length == 1 && rows.length > 1) {
      final ratio = meanSe([for (final r in rows) n(r[4]) / 100 / n(r[3])]);
      final f = n(rows.first[0]);
      out.add(tr('With the {f} Hz fork, l/√T stays {r} m/√N: l ∝ √T (law of tension). μ = 1/(4n²(l/√T)²) = {mu} × 10⁻⁴ kg/m.', {
        'f': f.toStringAsFixed(0),
        'r': pm(ratio.mean, ratio.se),
        'mu': (1 / (4 * f * f * ratio.mean * ratio.mean) * 1e4).toStringAsFixed(2),
      }));
    }
    return out.isEmpty ? tr('Keep the tension fixed and change the fork, or keep the fork and change the tension.') : out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final ppc = w * 0.78 / 112; // px per cm of wire
    final x0 = w * 0.06; // the wire's fixed end (0 on the scale is at the first bridge's home)
    final boxTop = h * 0.5, boxBot = h * 0.74;
    Kit.table(canvas, Rect.fromLTWH(0, h * 0.86, w, h * 0.14));
    final box = Rect.fromLTRB(x0, boxTop, x0 + 108 * ppc, boxBot);
    // Hollow box on its feet.
    canvas.drawRect(Rect.fromLTRB(box.left + 10, boxBot, box.left + 40, h * 0.86), fill(Kit.woodDark));
    canvas.drawRect(Rect.fromLTRB(box.right - 40, boxBot, box.right - 10, h * 0.86), fill(Kit.woodDark));
    canvas.drawRect(box, Kit.woodFill(box));
    canvas.drawRect(box, stroke(Kit.woodDark, 1.5));
    for (final f in [0.3, 0.7]) {
      canvas.drawOval(Rect.fromCenter(center: Offset(box.left + box.width * f, box.center.dy + 8), width: box.height * 0.42, height: box.height * 0.42), fill(const Color(0xFF4A3420)));
    }
    // Metre scale on top.
    final sx = x0 + 6 * ppc; // the scale's zero
    final scale = Rect.fromLTRB(sx - 6, boxTop - 16, sx + 100 * ppc + 6, boxTop);
    canvas.drawRect(scale, fill(const Color(0xFFF3E3B5)));
    for (var k = 0; k <= 100; k++) {
      final x = sx + k * ppc;
      canvas.drawLine(Offset(x, boxTop), Offset(x, boxTop - (k % 10 == 0 ? 12 : (k % 5 == 0 ? 8 : 4))), stroke(LabInk.ink, 0.9));
      if (k % 10 == 0) label(canvas, '$k', Offset(x, boxTop + 12), size: 11, color: const Color(0xFF3A2A18));
    }
    // Wire: peg at the left, over the bridges and the pulley.
    final wireY = boxTop - 30;
    final peg = Offset(x0 + 2 * ppc, wireY + 8);
    final l = pNum(p, 'len', 30);
    final b1 = sx + 4 * ppc, b2 = b1 + l * ppc;
    final pulley = Offset(box.right + 18, wireY + 18);
    canvas.drawCircle(peg, 6, fill(Kit.steelDark));
    canvas.drawLine(peg, Offset(b1, wireY), stroke(Kit.steelDark, 1.8));
    canvas.drawLine(Offset(b2, wireY), Offset(pulley.dx, wireY), stroke(Kit.steelDark, 1.8));
    final amp = amplitude(p);
    final shake = amp * 22 * math.sin(t * 40);
    final loop = Path()..moveTo(b1, wireY);
    for (var i = 1; i <= 40; i++) {
      final f = i / 40;
      loop.lineTo(b1 + (b2 - b1) * f, wireY + shake * math.sin(math.pi * f));
    }
    canvas.drawPath(loop, stroke(Kit.steelDark, 1.8));
    if (amp > 0.2) {
      final env = Path()..moveTo(b1, wireY);
      for (var i = 1; i <= 40; i++) {
        env.lineTo(b1 + (b2 - b1) * i / 40, wireY - amp * 22 * math.sin(math.pi * i / 40));
      }
      for (var i = 40; i >= 0; i--) {
        env.lineTo(b1 + (b2 - b1) * i / 40, wireY + amp * 22 * math.sin(math.pi * i / 40));
      }
      canvas.drawPath(env, fill(LabInk.blue.withValues(alpha: 0.1 * amp)));
    }
    for (final bx in [b1, b2]) {
      final bridge = Path()
        ..moveTo(bx, wireY)
        ..lineTo(bx - 9, boxTop - 16)
        ..lineTo(bx + 9, boxTop - 16)
        ..close();
      canvas.drawPath(bridge, fill(const Color(0xFF5D4037)));
    }
    // Paper rider in the middle of the loop, or flying off at resonance.
    final mid = Offset((b1 + b2) / 2, wireY);
    final fly = resonating(p) ? (math.sin(t * 3) * 0.5 + 0.5) : 0.0;
    final rider = mid + Offset(fly * 30, -6 - fly * 60);
    canvas.save();
    canvas.translate(rider.dx, rider.dy);
    canvas.rotate(fly * 1.4);
    canvas.drawPath(
        Path()
          ..moveTo(-9, 6)
          ..lineTo(0, -6)
          ..lineTo(9, 6),
        stroke(LabInk.red, 2.2));
    canvas.restore();
    // Pulley, hanger and slotted masses.
    canvas.drawLine(Offset(box.right, boxTop + 10), pulley, stroke(Kit.steelDark, 3));
    canvas.drawCircle(pulley, 18, stroke(Kit.steelDark, 3));
    canvas.drawCircle(pulley, 4, fill(Kit.steelDark));
    final hang = Offset(pulley.dx + 18, h * 0.62);
    canvas.drawLine(Offset(pulley.dx + 18, pulley.dy), hang, stroke(Kit.steelDark, 1.6));
    final m = pNum(p, 'mass', 3);
    final slots = (m / 0.5).round();
    for (var i = 0; i < slots; i++) {
      final r = Rect.fromCenter(center: Offset(hang.dx, hang.dy + 10 + i * 9.0), width: 46, height: 8);
      canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(2)), Kit.cylinder(r, const Color(0xFF8C939B), vertical: false));
    }
    label(canvas, '${m.toStringAsFixed(1)} kg', Offset(hang.dx, hang.dy + 24 + slots * 9.0), size: 14, bold: true);
    // Tuning fork with its stem on the box.
    final f = pNum(p, 'fork', 256);
    final fc = Offset(box.left + box.width * 0.82, boxTop - 8);
    canvas.drawLine(fc, fc - const Offset(0, 40), stroke(Kit.steelDark, 6));
    final wob = pBool(p, 'strike') ? 2.5 * math.sin(t * 60) : 0.0;
    for (final s in [-1.0, 1.0]) {
      final prong = Path()
        ..moveTo(fc.dx, fc.dy - 40)
        ..quadraticBezierTo(fc.dx + s * 16, fc.dy - 44, fc.dx + s * (14 + wob), fc.dy - 120);
      canvas.drawPath(prong, stroke(Kit.steelMid, 8));
    }
    label(canvas, '${f.toStringAsFixed(f == f.roundToDouble() ? 0 : 1)} Hz', fc - const Offset(0, 136), size: 15, bold: true);
    // Readout of the vibrating length.
    final yA = wireY - 52;
    canvas.drawLine(Offset(b1, yA), Offset(b2, yA), stroke(LabInk.blue, 1.5));
    arrowHead(canvas, Offset(b1, yA), const Offset(-1, 0), fill(LabInk.blue), size: 9);
    arrowHead(canvas, Offset(b2, yA), const Offset(1, 0), fill(LabInk.blue), size: 9);
    label(canvas, 'l = ${l.toStringAsFixed(1)} cm', Offset((b1 + b2) / 2, yA - 14), size: 16, bold: true, color: LabInk.blue, halo: LabInk.paper);
    label(canvas, resonating(p) && pBool(p, 'strike') ? tr('Resonance: the paper rider flies off') : (pBool(p, 'strike') ? tr('The rider only trembles') : tr('Fork not struck')),
        Offset(w * 0.05, h * 0.07), size: 17, bold: true, centre: false, color: resonating(p) && pBool(p, 'strike') ? LabInk.green : LabInk.muted);
    label(canvas, 'n = (1/2l) √(T/μ)', Offset(w * 0.05, h * 0.07 + 30), size: 15, centre: false, color: LabInk.muted);
  }
}

// ---------------------------------------------- liquid with convex lens

/// Refractive index of a liquid with a convex lens and a plane mirror: the
/// pin coincides with its own image (no parallax) at the focal length. With a
/// liquid under the lens the combination's F gives the liquid lens's f₂, and
/// n = 1 + R/|f₂|.
class LiquidLensBench extends LabBench with LabDemo {
  const LiquidLensBench();

  static const radius = 20.0, glass = 1.5, thick = 0.8; // cm
  static const liquids = <String, double>{'none': 1.0, 'water': 1.333, 'kerosene': 1.44, 'glycerine': 1.47};

  static String liquidName(String l) => switch (l) {
        'water' => tr('Water'),
        'kerosene' => tr('Kerosene'),
        'glycerine' => tr('Glycerine'),
        _ => tr('No liquid (lens alone)'),
      };

  @override
  String get kind => 'liquid-lens';

  @override
  LabParams get defaults => {'liquid': 'none', 'pin': 30.0};

  @override
  LabParams get preview => {...defaults, 'pin': focal('none') + thick / 2};

  static double f1() => radius / (2 * (glass - 1));

  /// Focal length (cm) of the lens with [liquid] under it.
  static double focal(String liquid) {
    final n = liquids[liquid] ?? 1;
    if (n == 1) return f1();
    final f2 = -radius / (n - 1);
    return 1 / (1 / f1() + 1 / f2);
  }

  /// Parallax: how far the image tip sits from the pin tip as the eye moves
  /// (0 at the focal length).
  static double parallax(LabParams p) => pNum(p, 'pin', 30) - thick / 2 - focal(pStr(p, 'liquid', 'none'));

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('liquid', tr('Under the lens'), [for (final l in liquids.keys) (l, liquidName(l))]),
        LabSlider('pin', tr('Height of the pin above the mirror'), 10, 60, divisions: 500, unit: ' cm', decimals: 1),
      ];

  @override
  List<LabColumn> get columns => [LabColumn(tr('Liquid')), LabColumn('x₁ (cm)', 1), LabColumn('x₂ (cm)', 1), LabColumn('F = (x₁ + x₂)/2 (cm)', 2)];

  @override
  LabReading read(LabParams p) {
    final d = parallax(p);
    if (d.abs() > 0.15) return LabReading.not(d > 0 ? tr('There is parallax: the image moves against the eye. Lower the pin.') : tr('There is parallax: the image moves with the eye. Raise the pin.'));
    final x1 = pNum(p, 'pin', 30);
    return LabReading.row([liquidName(pStr(p, 'liquid', 'none')), x1, x1 - thick, x1 - thick / 2]);
  }

  @override
  List<String> live(LabParams p) {
    final d = parallax(p);
    return ['x₁ = ${pNum(p, 'pin', 30).toStringAsFixed(1)} cm', d.abs() <= 0.15 ? tr('No parallax: the tips stay together') : (d > 0 ? tr('Parallax: lower the pin') : tr('Parallax: raise the pin'))];
  }

  @override
  List<LabParams> demo(LabParams start) => [
        for (final l in ['none', 'none', 'water', 'water', 'glycerine', 'kerosene']) {...start, 'liquid': l, 'pin': ((focal(l) + thick / 2) * 10).round() / 10},
      ];

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    double? mean(String l) {
      final vs = [for (final r in rows) if (r[0] == liquidName(l)) (r[3] as num).toDouble()];
      return vs.isEmpty ? null : vs.reduce((a, b) => a + b) / vs.length;
    }

    final fl = mean('none');
    if (fl == null) return tr('First find f₁ with the lens alone on the mirror.');
    final out = [tr('Lens alone: f₁ = {f} cm.', {'f': fl.toStringAsFixed(2)})];
    for (final l in ['water', 'kerosene', 'glycerine']) {
      final F = mean(l);
      if (F == null || F <= fl) continue;
      final f2 = fl * F / (F - fl);
      out.add(tr('{l}: F = {F} cm, f₂ = f₁F/(F − f₁) = −{f2} cm, n = 1 + R/|f₂| = {n} (R = 20.0 cm).', {
        'l': liquidName(l),
        'F': F.toStringAsFixed(2),
        'f2': f2.toStringAsFixed(1),
        'n': (1 + radius / f2).toStringAsFixed(3),
      }));
    }
    return out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final liquid = pStr(p, 'liquid', 'none');
    final ground = h * 0.86;
    Kit.table(canvas, Rect.fromLTWH(0, ground, w, h * 0.14));
    final ppc = (h * 0.7) / 62;
    final cx = w * 0.3;
    // Plane mirror on the table.
    final mirror = Rect.fromLTRB(cx - 120, ground - 10, cx + 120, ground);
    canvas.drawRect(mirror, fill(const Color(0xFFCFD8DC)));
    canvas.drawRect(Rect.fromLTRB(mirror.left, mirror.bottom - 3, mirror.right, mirror.bottom), fill(const Color(0xFF546E7A)));
    // Liquid under the lens and the lens itself.
    final lensW = 170.0, lensT = thick * ppc * 3;
    final base = mirror.top;
    final lensBottom = Path()
      ..moveTo(cx - lensW / 2, base - lensT * 0.5)
      ..quadraticBezierTo(cx, base + lensT * 0.35, cx + lensW / 2, base - lensT * 0.5);
    if (liquid != 'none') {
      final liq = Path()
        ..moveTo(cx - lensW / 2 - 14, base)
        ..lineTo(cx - lensW / 2, base - lensT * 0.5)
        ..quadraticBezierTo(cx, base + lensT * 0.35, cx + lensW / 2, base - lensT * 0.5)
        ..lineTo(cx + lensW / 2 + 14, base)
        ..close();
      final colour = switch (liquid) { 'glycerine' => const Color(0x99E8D9A8), 'kerosene' => const Color(0x99F3E3B0), _ => const Color(0x8878B7E0) };
      canvas.drawPath(liq, fill(colour));
    }
    final lens = Path()
      ..moveTo(cx - lensW / 2, base - lensT * 0.5)
      ..quadraticBezierTo(cx, base - lensT * 2.0, cx + lensW / 2, base - lensT * 0.5)
      ..quadraticBezierTo(cx, base + lensT * 0.35, cx - lensW / 2, base - lensT * 0.5)
      ..close();
    canvas.drawPath(lens, fill(const Color(0x66B3E5FC)));
    canvas.drawPath(lens, stroke(const Color(0xFF4A86B0), 1.6));
    canvas.drawPath(lensBottom, stroke(const Color(0xFF4A86B0), 1.6));
    // Stand, clamp and the horizontal pin above the lens centre.
    final x1 = pNum(p, 'pin', 30);
    final pinY = base - x1 * ppc;
    final rodTop = Kit.stand(canvas, Offset(w * 0.56, ground), h * 0.84);
    canvas.drawRect(Rect.fromLTRB(cx + 30, pinY - 5, rodTop.dx + 10, pinY + 5), Kit.steel(Rect.fromLTRB(cx + 30, pinY - 5, rodTop.dx + 10, pinY + 5)));
    canvas.drawRect(Rect.fromCenter(center: Offset(rodTop.dx, pinY), width: 22, height: 26), fill(const Color(0xFF3A3F46)));
    canvas.drawLine(Offset(cx + 34, pinY), Offset(cx, pinY), stroke(Kit.steelDark, 2.2));
    canvas.drawCircle(Offset(cx + 36, pinY), 5, fill(LabInk.red));
    // Height arrows.
    final ax = cx - lensW / 2 - 50;
    canvas.drawLine(Offset(ax, base), Offset(ax, pinY), stroke(LabInk.blue, 1.4));
    arrowHead(canvas, Offset(ax, pinY), const Offset(0, -1), fill(LabInk.blue), size: 9);
    arrowHead(canvas, Offset(ax, base), const Offset(0, 1), fill(LabInk.blue), size: 9);
    label(canvas, 'x₁ = ${x1.toStringAsFixed(1)} cm', Offset(ax - 8, (base + pinY) / 2), size: 15, bold: true, color: LabInk.blue, halo: LabInk.paper);
    // The eye above.
    final eye = Offset(cx, math.max(24, pinY - 70));
    canvas.drawOval(Rect.fromCenter(center: eye, width: 46, height: 22), stroke(LabInk.ink, 2));
    canvas.drawCircle(eye, 6, fill(LabInk.ink));
    dashed(canvas, eye + const Offset(0, 14), Offset(cx, base - lensT), stroke(LabInk.muted, 1));
    label(canvas, liquidName(liquid), Offset(cx, ground + 26), size: 15, bold: true);
    // Inset: looking down, the pin and its inverted image.
    final d = parallax(p);
    final mc = Offset(w * 0.8, h * 0.42), mr = math.min(w * 0.15, h * 0.27);
    Kit.magnifier(canvas, mc, mr, (c) {
      c.drawCircle(mc, mr, fill(const Color(0xFFEFF6FA)));
      final sway = math.sin(t * 1.6);
      final off = (d.clamp(-6.0, 6.0)) * mr * 0.06 * sway;
      final tip = mc + const Offset(10, 0);
      c.drawLine(tip, tip + Offset(mr * 0.9, 0), stroke(Kit.steelDark, 4));
      final img = mc + Offset(-10 + off, 0);
      c.drawLine(img, img - Offset(mr * 0.9, 0), stroke(const Color(0xFF90A4AE), 4));
      label(c, tr('Pin'), tip + Offset(mr * 0.45, -18), size: 13, color: LabInk.muted);
      label(c, tr('Image'), img - Offset(mr * 0.45, 18), size: 13, color: LabInk.muted);
    }, caption: d.abs() <= 0.15 ? tr('No parallax: the tips stay together') : (d > 0 ? tr('Parallax: lower the pin') : tr('Parallax: raise the pin')));
    label(canvas, tr('Seen from above as the eye moves sideways'), mc - Offset(0, mr + 22), size: 13, color: LabInk.muted);
  }
}

// ------------------------------------------------------------ flywheel

/// Moment of inertia of a flywheel: a mass m on a cord wound n₁ times round
/// the axle falls through h = 2πrn₁; after the cord slips off, the wheel
/// makes n₂ more turns in t s. ω = 4πn₂/t and
/// I = m(2gh − ω²r²) / (ω²(1 + n₁/n₂)).
class FlywheelBench extends LabBench with LabDemo {
  const FlywheelBench();

  static const inertia = 0.056, axle = 0.012, friction = 0.05, g = 9.8; // kg m², m, J per turn

  @override
  String get kind => 'flywheel';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'m': 0.3, 'n1': 8, 'released': false, 'trial': 0};

  @override
  LabParams get preview => {...defaults, 'released': true};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('m', tr('Mass on the cord'), [for (final m in [0.2, 0.3, 0.4, 0.5]) (m, '${(m * 1000).round()} g')]),
        LabChoice('n1', tr('Turns of cord on the axle (n₁)'), [for (final n in [5, 6, 7, 8, 9, 10]) (n, '$n')]),
        LabAction('release', tr('Release the mass'), Icons.play_arrow, primary: true),
        LabAction('rewind', tr('Wind the cord again'), Icons.replay),
      ];

  @override
  LabParams act(String action, LabParams p) => switch (action) {
        'release' => {...p, 'released': true},
        'rewind' => {...p, 'released': false, 'trial': pInt(p, 'trial') + 1},
        'set:m' || 'set:n1' => {...p, 'released': false},
        _ => p,
      };

  /// What the run gives: (n₂ turns, t seconds) as counted and timed.
  static (int, double) run(LabParams p) {
    final m = pNum(p, 'm', 0.3), n1 = pInt(p, 'n1', 8);
    final h = 2 * math.pi * axle * n1;
    // mgh = ½(I + mr²)ω² + n₁·Ef; then the wheel turns n₂ = ½Iω²/Ef more times, slowing uniformly.
    final w2 = 2 * (m * g * h - n1 * friction) / (inertia + m * axle * axle);
    final omega = math.sqrt(math.max(w2, 0.01));
    final n2 = (0.5 * inertia * w2 / friction);
    final tt = 4 * math.pi * n2 / omega;
    final jitter = (hash01(pInt(p, 'trial'), n1, (m * 10).round()) - 0.5);
    return (n2.round(), ((tt + jitter * 1.2) * 10).round() / 10);
  }

  @override
  List<LabColumn> get columns => [LabColumn('m (kg)', 2), LabColumn('n₁', 0), LabColumn('h (m)', 3), LabColumn('n₂', 0), LabColumn('t (s)', 1), LabColumn('ω (rad/s)', 2), LabColumn('I (kg m²)', 4)];

  static double inertiaFrom(double m, int n1, int n2, double t) {
    final h = 2 * math.pi * axle * n1;
    final omega = 4 * math.pi * n2 / t;
    return m * (2 * g * h - omega * omega * axle * axle) / (omega * omega * (1 + n1 / n2));
  }

  @override
  LabReading read(LabParams p) {
    if (!pBool(p, 'released')) return LabReading.not(tr('Release the mass, count the turns after the cord slips off, and time them.'));
    final m = pNum(p, 'm', 0.3), n1 = pInt(p, 'n1', 8);
    final (n2, tt) = run(p);
    return LabReading.row([m, n1, 2 * math.pi * axle * n1, n2, tt, 4 * math.pi * n2 / tt, inertiaFrom(m, n1, n2, tt)]);
  }

  @override
  List<String> live(LabParams p) {
    if (!pBool(p, 'released')) return [tr('Cord wound: the mass is held'), 'r = 1.2 cm'];
    final (n2, tt) = run(p);
    return ['n₂ = $n2', 't = ${tt.toStringAsFixed(1)} s'];
  }

  @override
  List<LabParams> demo(LabParams start) => [
        for (final (m, n1) in [(0.3, 6), (0.3, 8), (0.4, 8), (0.4, 10), (0.5, 8)]) {...start, 'm': m, 'n1': n1, 'released': true},
      ];

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final m = meanSe([for (final r in rows) (r[6] as num).toDouble()]);
    return tr('I = m(2gh − ω²r²) / (ω²(1 + n₁/n₂)) = {i} kg m² (mean of {n} runs; ½MR² for the 5.0 kg, 15 cm rim is about 0.056).', {'i': pm(m.mean, m.se), 'n': rows.length});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final ground = h * 0.9;
    canvas.drawRect(Rect.fromLTWH(0, 0, w * 0.06, ground), fill(const Color(0xFFE6DED0)));
    Kit.table(canvas, Rect.fromLTWH(0, ground, w, h * 0.1));
    final c = Offset(w * 0.32, h * 0.34);
    final r = math.min(w * 0.17, h * 0.27);
    final released = pBool(p, 'released');
    final (n2, tt) = run(p);
    // Bracket from the wall.
    canvas.drawRect(Rect.fromLTRB(w * 0.06, c.dy - 14, c.dx, c.dy + 14), Kit.steel(Rect.fromLTRB(w * 0.06, c.dy - 14, c.dx, c.dy + 14)));
    // The wheel turns when released, slowing to rest over t (looped).
    final phase = released ? (t % (tt / 6)) / (tt / 6) : 0.0;
    final angle = released ? 6 * math.pi * (2 * phase - phase * phase) : 0.0;
    canvas.drawCircle(c + const Offset(5, 6), r, fill(const Color(0x22000000)));
    canvas.drawCircle(c, r, Paint()..shader = RadialGradient(colors: const [Color(0xFF6B737D), Color(0xFF3A3F46), Color(0xFF8C939B)], stops: const [0.75, 0.9, 1]).createShader(Rect.fromCircle(center: c, radius: r)));
    canvas.drawCircle(c, r * 0.84, fill(LabInk.paper));
    for (var k = 0; k < 6; k++) {
      final a = angle + k * math.pi / 3;
      canvas.drawLine(c, c + Offset(math.cos(a), math.sin(a)) * r * 0.86, stroke(const Color(0xFF4A5058), r * 0.08));
    }
    canvas.drawCircle(c, r * 0.16, fill(const Color(0xFF3A3F46)));
    final mark = c + Offset(math.cos(angle), math.sin(angle)) * r * 0.92;
    canvas.drawCircle(mark, 6, fill(LabInk.red));
    // Axle with the cord, and the mass.
    final ax = r * 0.1;
    canvas.drawCircle(c, ax, fill(Kit.brass));
    final n1 = pInt(p, 'n1', 8);
    final cordX = c.dx + ax;
    final hangY = released ? ground - 40 : c.dy + r * 1.25;
    if (!released) canvas.drawLine(Offset(cordX, c.dy), Offset(cordX, hangY), stroke(LabInk.ink, 1.4));
    final mass = Rect.fromCenter(center: Offset(cordX, hangY + 20), width: 46, height: 40);
    canvas.drawRRect(RRect.fromRectAndRadius(mass, const Radius.circular(4)), Kit.cylinder(mass, const Color(0xFF8C939B)));
    label(canvas, '${(pNum(p, 'm', 0.3) * 1000).round()} g', mass.center, size: 13, bold: true, color: Colors.white);
    // The fall height.
    final hpx = released ? (ground - c.dy - r * 1.25 - 20).clamp(40.0, 400.0) : 0.0;
    if (!released) {
      final x = cordX + 70;
      canvas.drawLine(Offset(x, hangY + 40), Offset(x, ground), stroke(LabInk.blue, 1.4));
      label(canvas, 'h = 2πrn₁ = ${(2 * math.pi * axle * n1 * 100).toStringAsFixed(1)} cm', Offset(x + 10, (hangY + ground) / 2), size: 14, bold: true, color: LabInk.blue, centre: false, halo: LabInk.paper);
    }
    if (hpx > 0) label(canvas, tr('The cord has slipped off the axle'), Offset(cordX, ground - 74), size: 13, color: LabInk.muted, halo: LabInk.paper);
    // Counter and stopwatch.
    final cardX = w * 0.62;
    Kit.card(canvas, Offset(cardX, h * 0.1), w * 0.33, tr('After the cord slips off'), released
        ? [tr('Turns counted: n₂ = {n}', {'n': n2}), tr('Time to stop: t = {t} s', {'t': tt.toStringAsFixed(1)}), 'ω = 4πn₂/t = ${(4 * math.pi * n2 / tt).toStringAsFixed(2)} rad/s']
        : [tr('n₁ = {n} turns of cord on the axle', {'n': n1}), tr('Release the mass, then count and time the turns.')]);
    final sw = Offset(w * 0.78, h * 0.66);
    canvas.drawCircle(sw, 54, fill(Colors.white));
    canvas.drawCircle(sw, 54, stroke(released ? LabInk.red : LabInk.muted, 4));
    final secs = released ? math.min(tt, (t % (tt / 6)) * 6) : 0.0;
    final a = secs / 60 * 2 * math.pi;
    canvas.drawLine(sw, sw + Offset(math.sin(a), -math.cos(a)) * 44, stroke(LabInk.red, 2.5));
    label(canvas, '${secs.toStringAsFixed(1)} s', sw + const Offset(0, 22), size: 15, bold: true);
  }
}
