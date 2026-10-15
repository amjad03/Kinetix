import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../core/i18n.dart';
import '../../engines/ray_optics.dart';

/// An optical bench with a metre scale and uprights: the u–v method for a
/// convex lens or a concave mirror, a concave lens in contact with a convex
/// one, and a convex mirror found with the help of a convex lens (setup
/// 'task'). The image needle is placed by removing parallax.
class OpticalBench extends LabBench {
  const OpticalBench();

  /// The unknown components (labelled A, B, C): focal lengths in cm.
  static const focal = {'A': 10.0, 'B': 15.0, 'C': 20.0};
  static const concave = {'A': 15.0, 'B': 20.0, 'C': 25.0};

  /// The known convex lens used with the convex mirror, and the one put in
  /// contact with the concave lens.
  static const auxLens = 15.0, contactLens = 10.0;
  static const length = 150.0, lensAt = 70.0, tolerance = 0.3;

  @override
  String get kind => 'optical-bench';

  @override
  LabParams get defaults => {'task': 'lens-uv', 'item': 'B', 'u': 25.0, 'needle': 20.0, 'mirror': 100.0};

  @override
  LabParams get preview => {...defaults, 'needle': 37.5};

  static String task(LabParams p) => pStr(p, 'task', 'lens-uv');

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('item', task(p) == 'mirror-uv' ? tr('Mirror') : (task(p) == 'convex-mirror' ? tr('Convex mirror') : tr('Lens')), [
          for (final k in focal.keys) (k, k),
        ]),
        LabSlider('u', tr('Object distance u'), 5, 70, divisions: 130, unit: ' cm', decimals: 1),
        if (task(p) == 'convex-mirror')
          LabSlider('mirror', tr('Mirror position'), 70, 150, divisions: 800, unit: ' cm', decimals: 1)
        else
          LabSlider('needle', tr('Image needle'), 0, 75, divisions: 750, unit: ' cm', decimals: 1),
      ];

  /// Focal length (cm) of what is on the bench: the convex lens, the
  /// concave mirror, or the lens combination.
  static double effectiveFocal(LabParams p) {
    final item = pStr(p, 'item', 'B');
    return switch (task(p)) {
      'concave-lens' => RayOptics.combined(contactLens, -concave[item]!),
      _ => focal[item]!,
    };
  }

  /// Where the real image is (distance from the lens or mirror, cm), or null
  /// when it is virtual or off the bench.
  static double? image(LabParams p) {
    final u = pNum(p, 'u', 25);
    final f = task(p) == 'convex-mirror' ? auxLens : effectiveFocal(p);
    final v = task(p) == 'mirror-uv' ? RayOptics.mirrorImage(u, f) : RayOptics.lensImage(-u, f);
    if (v == null || v <= 0) return null;
    return v;
  }

  /// For the convex mirror: where its centre of curvature must be (the
  /// lens's image point P) and the mirror position that sends light back on
  /// itself.
  static (double p, double m)? convexMirror(LabParams p) {
    final v = image(p);
    if (v == null) return null;
    final at = lensAt + v;
    return (at, at - 2 * focal[pStr(p, 'item', 'B')]!);
  }

  /// How far the image needle (or the mirror) is from the right place, cm.
  static double? parallax(LabParams p) {
    if (task(p) == 'convex-mirror') {
      final c = convexMirror(p);
      return c == null ? null : pNum(p, 'mirror', 100) - c.$2;
    }
    final v = image(p);
    return v == null ? null : pNum(p, 'needle', 20) - v;
  }

  @override
  List<LabColumn> get columns => [LabColumn('u (cm)', 1), LabColumn('v (cm)', 1), LabColumn('1/u (cm⁻¹)', 4), LabColumn('1/v (cm⁻¹)', 4), LabColumn('f (cm)', 2)];

  @override
  LabReading read(LabParams p) {
    final v = image(p), d = parallax(p);
    if (v == null) return LabReading.not(tr('No real image forms: move the object beyond the focus.'));
    if (v > 75) return LabReading.not(tr('The image is beyond the end of the bench: move the object farther away.'));
    if (d!.abs() > tolerance) return LabReading.not(tr('There is still parallax between the image and the needle.'));
    final u = pNum(p, 'u', 25), vv = (pNum(p, 'needle', 20) * 10).round() / 10;
    return LabReading.row([u, vv, (10000 / u).round() / 10000, (10000 / vv).round() / 10000, (u * vv / (u + vv) * 100).round() / 100]);
  }

  @override
  List<String> live(LabParams p) {
    final d = parallax(p);
    return [
      'u = ${pNum(p, 'u', 25).toStringAsFixed(1)} cm',
      if (d == null) tr('No real image') else if (d.abs() <= tolerance) tr('No parallax') else tr('Parallax: move the needle'),
    ];
  }

  @override
  LabGraph? graph(LabParams p) => const LabGraph(2, 3, line: true);

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final fs = [for (final r in rows) (r[4] as num).toDouble()];
    final m = meanSe(fs);
    final out = [tr('Mean focal length f = uv/(u + v) = {f} cm.', {'f': pm(m.mean, m.se)})];
    final fit = LinearFit.of([for (final r in rows) (r[2] as num).toDouble()], [for (final r in rows) (r[3] as num).toDouble()]);
    if (fit != null && rows.length >= 3) {
      out.add(tr('The 1/v–1/u graph is a straight line meeting each axis at about 1/f: intercept {c} cm⁻¹ gives f = {f} cm.',
          {'c': fit.intercept.toStringAsFixed(4), 'f': (1 / fit.intercept).toStringAsFixed(1)}));
    }
    return out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final x0 = w * 0.05, x1 = w * 0.95, rail = h * 0.72;
    double at(double cm) => x0 + (x1 - x0) * cm / length;
    // The rail and its scale.
    canvas.drawRect(Rect.fromLTRB(x0, rail, x1, rail + 16), fill(const Color(0xFF8A9199)));
    for (var cm = 0; cm <= length; cm += 5) {
      canvas.drawLine(Offset(at(cm.toDouble()), rail), Offset(at(cm.toDouble()), rail + (cm % 10 == 0 ? 12 : 7)), stroke(LabInk.ink, 1));
      if (cm % 20 == 0) label(canvas, '$cm', Offset(at(cm.toDouble()), rail + 26), size: 11, color: LabInk.muted);
    }
    final axis = h * 0.42;
    canvas.drawLine(Offset(x0, axis), Offset(x1, axis), stroke(LabInk.faint, 1));
    void upright(double cm) => canvas.drawLine(Offset(at(cm), rail), Offset(at(cm), axis + 30), stroke(LabInk.muted, 3));
    void needle(double cm, {bool down = false, Color color = LabInk.ink}) {
      upright(cm);
      final tip = Offset(at(cm), down ? axis + h * 0.12 : axis - h * 0.12);
      canvas.drawLine(Offset(at(cm), axis), tip, stroke(color, 3));
      arrowHead(canvas, tip, tip - Offset(at(cm), axis), stroke(color, 3), size: 10);
    }

    void lens(double cm, {bool concaveToo = false}) {
      upright(cm);
      final c = Offset(at(cm), axis);
      final path = Path()
        ..moveTo(c.dx, c.dy - h * 0.2)
        ..quadraticBezierTo(c.dx + 14, c.dy, c.dx, c.dy + h * 0.2)
        ..quadraticBezierTo(c.dx - 14, c.dy, c.dx, c.dy - h * 0.2);
      canvas.drawPath(path, fill(LabInk.glass));
      canvas.drawPath(path, stroke(LabInk.blue, 2));
      if (concaveToo) {
        final r = Rect.fromCenter(center: c + const Offset(12, 0), width: 14, height: h * 0.4);
        canvas.drawRect(r, fill(LabInk.glass));
        canvas.drawLine(r.topLeft, r.bottomLeft, stroke(LabInk.blue, 2));
        canvas.drawLine(r.topRight, r.bottomRight, stroke(LabInk.blue, 2));
      }
    }

    void mirror(double cm, {required bool convex}) {
      upright(cm);
      final c = Offset(at(cm), axis);
      final arc = Path()
        ..moveTo(c.dx + (convex ? 0 : 10), c.dy - h * 0.2)
        ..quadraticBezierTo(c.dx + (convex ? 14 : -4), c.dy, c.dx + (convex ? 0 : 10), c.dy + h * 0.2);
      canvas.drawPath(arc, stroke(LabInk.ink, 4));
      for (var k = -4; k <= 4; k++) {
        final y = c.dy + k * h * 0.045;
        canvas.drawLine(Offset(c.dx + 14, y), Offset(c.dx + 22, y - 6), stroke(LabInk.muted, 1));
      }
    }

    final u = pNum(p, 'u', 25);
    final v = image(p);
    final d = parallax(p);
    final ok = d != null && d.abs() <= tolerance;
    switch (task(p)) {
      case 'mirror-uv':
        const m = 145.0;
        mirror(m, convex: false);
        needle(m - u);
        needle(m - pNum(p, 'needle', 20), down: true, color: ok ? LabInk.green : LabInk.red);
        if (v != null) _rays(canvas, Offset(at(m - u), axis - h * 0.12), Offset(at(m), axis), Offset(at(m - v), axis + h * 0.12 * v / u));
        label(canvas, tr('Concave mirror {k}', {'k': pStr(p, 'item', 'B')}), Offset(at(m), axis - h * 0.27), size: 14, bold: true);
      case 'convex-mirror':
        lens(lensAt);
        needle(lensAt - u);
        final c = convexMirror(p);
        mirror(pNum(p, 'mirror', 100), convex: true);
        if (c != null && c.$1 < length) dashed(canvas, Offset(at(c.$1), axis - 40), Offset(at(c.$1), axis + 40), stroke(LabInk.muted, 1.5));
        if (c != null) label(canvas, 'P', Offset(at(math.min(c.$1, length - 1)), axis - 52), size: 14, color: LabInk.muted);
        label(canvas, tr('Convex mirror {k}', {'k': pStr(p, 'item', 'B')}), Offset(at(pNum(p, 'mirror', 100)), axis - h * 0.27), size: 14, bold: true);
        label(canvas, ok ? tr('Image coincides with the needle') : tr('Image and needle do not coincide'), Offset(w / 2, h * 0.1), size: 16, bold: true, color: ok ? LabInk.green : LabInk.red);
      default:
        lens(lensAt, concaveToo: task(p) == 'concave-lens');
        needle(lensAt - u);
        needle(lensAt + pNum(p, 'needle', 20), down: true, color: ok ? LabInk.green : LabInk.red);
        if (v != null && v < 80) _rays(canvas, Offset(at(lensAt - u), axis - h * 0.12), Offset(at(lensAt), axis), Offset(at(lensAt + v), axis + h * 0.12 * v / u));
        label(canvas, task(p) == 'concave-lens' ? tr('Convex lens (10 cm) + concave lens {k}', {'k': pStr(p, 'item', 'B')}) : tr('Convex lens {k}', {'k': pStr(p, 'item', 'B')}),
            Offset(at(lensAt), axis - h * 0.27), size: 14, bold: true);
    }
    if (task(p) != 'convex-mirror') {
      label(canvas, d == null ? tr('No real image') : (ok ? tr('No parallax') : tr('Parallax: move the needle')), Offset(w / 2, h * 0.1), size: 16, bold: true, color: ok ? LabInk.green : LabInk.red);
    }
  }

  /// Two rays from the object tip through the optic to the image tip.
  static void _rays(Canvas canvas, Offset tip, Offset centre, Offset img) {
    final ray = stroke(LabInk.accent, 1.8);
    final top = Offset(centre.dx, tip.dy);
    canvas.drawLine(tip, top, ray);
    canvas.drawLine(top, img, ray);
    canvas.drawLine(tip, img, ray);
  }
}

/// The focal length of a convex mirror, with a convex lens: the mirror sends
/// the light back on itself when its centre of curvature is at the lens's
/// image point P, so R = P − M and f = R/2.
class ConvexMirrorBench extends OpticalBench {
  const ConvexMirrorBench();

  @override
  String get kind => 'convex-mirror';

  @override
  LabParams get defaults => {...super.defaults, 'task': 'convex-mirror', 'u': 22.0, 'mirror': 100.0};

  @override
  LabParams get preview => {...defaults, 'mirror': 87.1};

  @override
  List<LabColumn> get columns => [LabColumn('u (cm)', 1), LabColumn(tr('P (cm)'), 1), LabColumn(tr('Mirror M (cm)'), 1), LabColumn('R = P − M (cm)', 1), LabColumn('f = R/2 (cm)', 2)];

  @override
  LabReading read(LabParams p) {
    final c = OpticalBench.convexMirror(p);
    if (c == null) return LabReading.not(tr('No real image forms: move the object beyond the focus.'));
    if (c.$2 < OpticalBench.lensAt + 2) return LabReading.not(tr('The mirror would have to sit on the lens: move the object nearer the focus so the image point is farther away.'));
    if (OpticalBench.parallax(p)!.abs() > OpticalBench.tolerance) return LabReading.not(tr('The image of the needle does not coincide with the needle yet: move the mirror.'));
    final m = pNum(p, 'mirror', 100), r = c.$1 - m;
    return LabReading.row([pNum(p, 'u', 22), (c.$1 * 10).round() / 10, m, (r * 10).round() / 10, (r / 2 * 100).round() / 100]);
  }

  @override
  LabGraph? graph(LabParams p) => null;

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final m = meanSe([for (final r in rows) (r[4] as num).toDouble()]);
    return tr('Radius of curvature R = {r} cm, so the focal length of the convex mirror is R/2 = {f} cm.', {'r': pm(m.mean * 2, m.se * 2), 'f': pm(m.mean, m.se)});
  }
}

/// A travelling microscope measuring real and apparent depth: the refractive
/// index of a glass slab is real depth ÷ apparent depth = (R₃ − R₁) ÷ (R₃ − R₂).
class TravellingMicroscopeBench extends LabBench {
  const TravellingMicroscopeBench();

  static const base = 5.237; // cm, scale reading when focused on the mark
  static const materials = {'crown': 1.52, 'flint': 1.62, 'perspex': 1.49};

  @override
  String get kind => 'travelling-microscope';

  @override
  LabParams get defaults => {'material': 'crown', 't': 3.0, 'target': 'mark', 'h': 6.0};

  @override
  LabParams get preview => {...defaults, 'h': base};

  static String materialName(String m) => switch (m) {
        'flint' => tr('Flint glass'),
        'perspex' => tr('Perspex'),
        _ => tr('Crown glass'),
      };

  static String targetName(String t) => switch (t) {
        'image' => tr('Mark seen through the slab'),
        'top' => tr('Powder on top of the slab'),
        _ => tr('Mark without the slab'),
      };

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('material', tr('Slab'), [for (final m in materials.keys) (m, materialName(m))]),
        LabChoice('t', tr('Thickness'), [(2.0, '2 cm'), (3.0, '3 cm'), (4.0, '4 cm')]),
        LabChoice('target', tr('Focus on'), [for (final k in ['mark', 'image', 'top']) (k, targetName(k))]),
        LabSlider('h', tr('Microscope'), 4, 11, divisions: 7000, unit: ' cm', decimals: 3),
      ];

  /// The scale reading at which the target is in focus.
  static double focusAt(LabParams p) {
    final t = pNum(p, 't', 3), n = materials[pStr(p, 'material', 'crown')]!;
    return switch (pStr(p, 'target', 'mark')) {
      'image' => base + t - RayOptics.apparentDepth(t, n),
      'top' => base + t,
      _ => base,
    };
  }

  static double blur(LabParams p) => (pNum(p, 'h', 6) - focusAt(p)).abs();

  @override
  List<LabColumn> get columns => [LabColumn(tr('Focused on')), LabColumn(tr('Reading (cm)'), 3)];

  @override
  LabReading read(LabParams p) {
    if (blur(p) > 0.004) return LabReading.not(tr('Not in focus: turn the screw until the view is sharp.'));
    return LabReading.row([targetName(pStr(p, 'target', 'mark')), (pNum(p, 'h', 6) * 1000).round() / 1000]);
  }

  @override
  List<String> live(LabParams p) => [tr('Reading {r} cm', {'r': pNum(p, 'h', 6).toStringAsFixed(3)}), blur(p) <= 0.004 ? tr('In focus') : tr('Out of focus')];

  @override
  String? result(List<List<Object>> rows) {
    double? last(String k) {
      final r = rows.lastWhere((r) => r[0] == targetName(k), orElse: () => const []);
      return r.isEmpty ? null : (r[1] as num).toDouble();
    }

    final r1 = last('mark'), r2 = last('image'), r3 = last('top');
    if (r1 == null || r2 == null || r3 == null) return tr('Record all three: the mark, the mark through the slab, and the top of the slab.');
    final real = r3 - r1, apparent = r3 - r2;
    return tr('Real depth R₃ − R₁ = {a} cm, apparent depth R₃ − R₂ = {b} cm, so n = {n}. The mark appears raised by {s} cm.',
        {'a': real.toStringAsFixed(3), 'b': apparent.toStringAsFixed(3), 'n': (real / apparent).toStringAsFixed(3), 's': (r2 - r1).toStringAsFixed(3)});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final target = pStr(p, 'target', 'mark');
    final slab = target != 'mark';
    final th = pNum(p, 't', 3);
    // Side view: base, slab, microscope on its vertical scale.
    final floor = h * 0.86, cmPx = h * 0.07;
    final bx = w * 0.3;
    canvas.drawRect(Rect.fromLTWH(w * 0.06, floor, w * 0.5, 10), fill(const Color(0xFF6D5B4B)));
    canvas.drawLine(Offset(bx - 12, floor), Offset(bx + 12, floor), stroke(LabInk.red, 3));
    canvas.drawLine(Offset(bx, floor - 6), Offset(bx, floor + 6), stroke(LabInk.red, 3));
    if (slab) {
      final r = Rect.fromLTWH(bx - w * 0.14, floor - th * cmPx, w * 0.28, th * cmPx);
      canvas.drawRect(r, fill(LabInk.glass));
      canvas.drawRect(r, stroke(LabInk.blue, 2));
      if (target == 'top') {
        final rnd = math.Random(7);
        for (var k = 0; k < 40; k++) {
          canvas.drawCircle(Offset(r.left + rnd.nextDouble() * r.width, r.top - 1.5), 1.2, fill(const Color(0xFFC9A248)));
        }
      }
    }
    // Vertical scale and microscope.
    final sx = w * 0.56;
    canvas.drawRect(Rect.fromLTWH(sx, h * 0.04, 12, floor - h * 0.04), fill(const Color(0xFFDADDE1)));
    final hRead = pNum(p, 'h', 6);
    final objY = floor - (hRead - base + 0.0) * cmPx - h * 0.12;
    canvas.drawRect(Rect.fromCenter(center: Offset(bx, objY - h * 0.12), width: 22, height: h * 0.22), fill(const Color(0xFF2E343C)));
    canvas.drawLine(Offset(bx + 11, objY - h * 0.12), Offset(sx, objY - h * 0.12), stroke(const Color(0xFF2E343C), 5));
    label(canvas, '${hRead.toStringAsFixed(3)} cm', Offset(sx + 50, objY - h * 0.12), size: 14, bold: true, halo: LabInk.paper);
    // The view in the eyepiece.
    final view = Offset(w * 0.8, h * 0.4), r = math.min(w, h) * 0.2;
    canvas.drawCircle(view, r, fill(const Color(0xFFF7F3E8)));
    canvas.save();
    canvas.clipPath(Path()..addOval(Rect.fromCircle(center: view, radius: r)));
    final b = (blur(p) * 400).clamp(0.0, 18.0);
    final paint = Paint()
      ..color = target == 'top' ? const Color(0xFFC9A248) : LabInk.red
      ..strokeWidth = 5
      ..maskFilter = b > 0.3 ? MaskFilter.blur(BlurStyle.normal, b) : null;
    if (target == 'top') {
      final rnd = math.Random(3);
      for (var k = 0; k < 60; k++) {
        canvas.drawCircle(view + Offset((rnd.nextDouble() - 0.5) * 2 * r, (rnd.nextDouble() - 0.5) * 2 * r), 3, paint);
      }
    } else {
      canvas.drawLine(view - Offset(r * 0.6, 0), view + Offset(r * 0.6, 0), paint);
      canvas.drawLine(view - Offset(0, r * 0.6), view + Offset(0, r * 0.6), paint);
    }
    canvas.drawLine(view - Offset(r, 0), view + Offset(r, 0), stroke(LabInk.ink, 1));
    canvas.drawLine(view - Offset(0, r), view + Offset(0, r), stroke(LabInk.ink, 1));
    canvas.restore();
    canvas.drawCircle(view, r, stroke(LabInk.ink, 3));
    label(canvas, targetName(target), Offset(view.dx, view.dy + r + 18), size: 14, bold: true);
  }
}

/// A spectrometer with a plane transmission grating: λ = d sin θ ÷ n.
class GratingBench extends LabBench {
  const GratingBench();

  static const sources = <String, List<(String, double, Color)>>{
    'mercury': [
      ('violet', 404.7, Color(0xFF7B4DFF)),
      ('blue', 435.8, Color(0xFF2962FF)),
      ('green', 546.1, Color(0xFF2E9D4A)),
      ('yellow', 578.0, Color(0xFFFFC107)),
    ],
    'sodium': [('yellow', 589.3, Color(0xFFFFB300))],
  };

  @override
  String get kind => 'grating';

  @override
  LabParams get defaults => {'source': 'mercury', 'lines': 500.0, 'angle': 0.0};

  @override
  LabParams get preview => {...defaults, 'angle': 15.85};

  static String colourName(String c) => switch (c) {
        'violet' => tr('Violet'),
        'blue' => tr('Blue'),
        'green' => tr('Green'),
        _ => tr('Yellow'),
      };

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('source', tr('Lamp'), [('mercury', tr('Mercury')), ('sodium', tr('Sodium'))]),
        LabChoice('lines', tr('Grating'), [(300.0, '300 /mm'), (500.0, '500 /mm'), (600.0, '600 /mm')]),
        LabSlider('angle', tr('Telescope'), -60, 60, divisions: 12000, unit: '°', decimals: 2),
      ];

  /// Every line in view: (colour, λ nm, order, angle °, colour).
  static List<(String, double, int, double, Color)> spectrum(LabParams p) => [
        for (final (c, nm, col) in sources[pStr(p, 'source', 'mercury')]!)
          for (final n in [-3, -2, -1, 1, 2, 3])
            if (RayOptics.gratingAngle(n, nm * 1e-9, pNum(p, 'lines', 500)) case final a?) (c, nm, n, a, col),
      ];

  static (String, double, int, double, Color)? onCrosswire(LabParams p) {
    final a = pNum(p, 'angle');
    for (final s in spectrum(p)) {
      if ((s.$4 - a).abs() < 0.03) return s;
    }
    return null;
  }

  @override
  List<LabColumn> get columns => [LabColumn(tr('Line')), const LabColumn('n', 0), LabColumn('θ (°)', 2), LabColumn('λ (nm)', 1)];

  @override
  LabReading read(LabParams p) {
    if (pNum(p, 'angle').abs() < 0.05) return LabReading.not(tr('That is the direct (zero-order) image: turn the telescope to a coloured line.'));
    final s = onCrosswire(p);
    if (s == null) return LabReading.not(tr('Set the cross-wire exactly on a spectral line.'));
    final theta = pNum(p, 'angle');
    final n = s.$3;
    final lambda = RayOptics.gratingWavelength(theta.abs(), n.abs(), pNum(p, 'lines', 500)) * 1e9;
    return LabReading.row([colourName(s.$1), n.abs(), (theta.abs() * 100).round() / 100, (lambda * 10).round() / 10]);
  }

  @override
  List<String> live(LabParams p) {
    final s = onCrosswire(p);
    return ['θ = ${pNum(p, 'angle').toStringAsFixed(2)}°', if (s != null) '${colourName(s.$1)}, n = ${s.$3.abs()}'];
  }

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final byLine = <String, List<double>>{};
    for (final r in rows) {
      byLine.putIfAbsent(r[0] as String, () => []).add((r[3] as num).toDouble());
    }
    return [
      for (final e in byLine.entries)
        tr('{c}: λ = {l} nm', {'c': e.key, 'l': pm(meanSe(e.value).mean, meanSe(e.value).se)}),
    ].join('; ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final a = pNum(p, 'angle');
    // Top view: collimator, grating table and the telescope on its arm.
    final c = Offset(w * 0.3, h * 0.6), arm = math.min(w, h) * 0.32;
    canvas.drawCircle(c, arm * 0.35, fill(const Color(0xFFDADDE1)));
    canvas.drawCircle(c, arm * 0.35, stroke(LabInk.ink, 1.5));
    for (var k = -60; k <= 60; k += 10) {
      final ang = RayOptics.rad(k.toDouble()) - math.pi / 2;
      final o = c + Offset(math.cos(ang), math.sin(ang)) * arm * 1.15;
      canvas.drawLine(c + Offset(math.cos(ang), math.sin(ang)) * arm * 1.08, o, stroke(LabInk.muted, 1));
      if (k % 30 == 0) label(canvas, '$k°', c + Offset(math.cos(ang), math.sin(ang)) * arm * 1.27, size: 11, color: LabInk.muted);
    }
    canvas.drawRect(Rect.fromCenter(center: c + Offset(0, arm * 0.75), width: 20, height: arm * 0.8), fill(const Color(0xFF2E343C)));
    label(canvas, tr('Lamp'), c + Offset(0, arm * 1.3), size: 12, color: LabInk.muted);
    canvas.drawLine(c - Offset(arm * 0.3, 0), c + Offset(arm * 0.3, 0), stroke(LabInk.blue, 4));
    final ang = RayOptics.rad(a) - math.pi / 2;
    final dir = Offset(math.cos(ang), math.sin(ang));
    canvas.drawLine(c + dir * arm * 0.4, c + dir * arm, stroke(const Color(0xFF2E343C), 14));
    // The spectrum fanned out (faint) above the table.
    for (final s in spectrum(p)) {
      final sa = RayOptics.rad(s.$4) - math.pi / 2;
      canvas.drawLine(c, c + Offset(math.cos(sa), math.sin(sa)) * arm * 1.05, stroke(s.$5.withValues(alpha: 0.35), 2));
    }
    // The eyepiece view: lines within ±1.5° of the telescope.
    final view = Offset(w * 0.78, h * 0.42), r = math.min(w, h) * 0.22;
    canvas.drawCircle(view, r, fill(const Color(0xFF0D0F12)));
    canvas.save();
    canvas.clipPath(Path()..addOval(Rect.fromCircle(center: view, radius: r)));
    for (final s in [...spectrum(p), ('white', 0.0, 0, 0.0, Colors.white)]) {
      final dx = (s.$4 - a) / 1.5 * r;
      if (dx.abs() > r * 1.2) continue;
      canvas.drawRect(Rect.fromCenter(center: view + Offset(dx, 0), width: 5, height: r * 1.6), Paint()..color = s.$5..maskFilter = const MaskFilter.blur(BlurStyle.normal, 1.5));
    }
    canvas.drawLine(view - Offset(r, 0), view + Offset(r, 0), stroke(Colors.white54, 1));
    canvas.drawLine(view - Offset(0, r), view + Offset(0, r), stroke(Colors.white54, 1));
    canvas.restore();
    canvas.drawCircle(view, r, stroke(LabInk.ink, 3));
    label(canvas, '${a.toStringAsFixed(2)}°', Offset(view.dx, view.dy + r + 18), size: 16, bold: true);
  }
}

/// Newton's rings: dark rings in reflected sodium light under a lens of
/// radius R; Dₙ² = 4nλR, so λ = slope ÷ 4R.
class NewtonRingsBench extends LabBench {
  const NewtonRingsBench();

  static const lambda = 589.3e-9;

  @override
  String get kind => 'newton-rings';

  @override
  LabParams get defaults => {'r': 100.0, 'x': 0.0};

  @override
  LabParams get preview => {...defaults, 'x': 2.43};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('r', tr('Lens radius R'), [(50.0, '50 cm'), (100.0, '100 cm'), (150.0, '150 cm')]),
        LabSlider('x', tr('Microscope'), 0, 6, divisions: 6000, unit: ' mm', decimals: 3),
      ];

  static double radiusM(LabParams p) => pNum(p, 'r', 100) / 100;

  /// The dark ring under the cross-wire (its number), if any.
  static int? ringAt(LabParams p) {
    final x = pNum(p, 'x') * 1e-3;
    if (x < 1e-4) return null;
    final n = (x * x / (lambda * radiusM(p))).round();
    if (n < 1) return null;
    final rn = RayOptics.newtonDarkRadius(n, lambda, radiusM(p));
    return (rn - x).abs() < 8e-6 ? n : null;
  }

  @override
  List<LabColumn> get columns => [LabColumn('R (cm)', 0), const LabColumn('n', 0), LabColumn('D (mm)', 3), LabColumn('D² (mm²)', 3)];

  @override
  LabReading read(LabParams p) {
    final n = ringAt(p);
    if (n == null) return LabReading.not(tr('Set the cross-wire on the middle of a dark ring.'));
    final x = pNum(p, 'x');
    return LabReading.row([pNum(p, 'r', 100), n, 2 * x, (4 * x * x * 1000).round() / 1000]);
  }

  @override
  List<String> live(LabParams p) => ['x = ${pNum(p, 'x').toStringAsFixed(3)} mm', if (ringAt(p) case final n?) tr('Dark ring {n}', {'n': n})];

  @override
  LabGraph graph(LabParams p) {
    final r = pNum(p, 'r', 100);
    return LabGraph(1, 3, line: true, include: (row) => row[0] == r);
  }

  @override
  String? result(List<List<Object>> rows) {
    final out = <String>[];
    for (final rcm in {for (final r in rows) (r[0] as num).toDouble()}) {
      final mine = [for (final r in rows) if ((r[0] as num) == rcm) r];
      if (mine.length < 3) continue;
      final f = LinearFit.of([for (final r in mine) (r[1] as num).toDouble()], [for (final r in mine) (r[3] as num).toDouble()]);
      if (f == null) continue;
      final k = 1e-6 / (4 * rcm / 100) * 1e9; // mm² per ring → nm
      out.add(tr('R = {r} cm: slope of D² against n = {s} mm², so λ = slope ÷ 4R = {l} nm (sodium: 589.3 nm).',
          {'r': rcm.toStringAsFixed(0), 's': pm(f.slope, f.slopeSe), 'l': pm(f.slope * k, f.slopeSe * k)}));
    }
    return out.isEmpty ? (rows.isEmpty ? null : tr('Record at least three rings.')) : out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final view = Offset(w * 0.5, h * 0.5), r = math.min(w, h) * 0.42;
    final mmPx = r / 6;
    canvas.drawCircle(view, r, fill(const Color(0xFF1A1405)));
    canvas.save();
    canvas.clipPath(Path()..addOval(Rect.fromCircle(center: view, radius: r)));
    // Concentric rings drawn as thin circles of the reflected intensity.
    final rm = radiusM(p);
    for (var px = 1.0; px < r * 1.45; px += 1.0) {
      final x = px / mmPx * 1e-3;
      final i = RayOptics.newtonIntensity(x, lambda, rm);
      canvas.drawCircle(view, px, Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2
        ..color = Color.lerp(const Color(0xFF1A1405), const Color(0xFFFFC94D), i)!);
    }
    final xPx = pNum(p, 'x') * mmPx;
    canvas.drawLine(Offset(view.dx + xPx, view.dy - r), Offset(view.dx + xPx, view.dy + r), stroke(Colors.white, 1.5));
    canvas.drawLine(Offset(view.dx - r, view.dy), Offset(view.dx + r, view.dy), stroke(Colors.white38, 1));
    canvas.restore();
    canvas.drawCircle(view, r, stroke(LabInk.ink, 3));
    label(canvas, 'x = ${pNum(p, 'x').toStringAsFixed(3)} mm', Offset(view.dx, view.dy + r + 16), size: 15, bold: true);
  }
}
