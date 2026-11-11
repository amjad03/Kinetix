import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../core/i18n.dart';
import 'kit.dart';

/// A moving-coil galvanometer (30-0-30 divisions): its resistance by the
/// half-deflection method with its figure of merit (task 'half'), and its
/// conversion into a voltmeter ('voltmeter', a high resistance in series) or
/// an ammeter ('ammeter', a low shunt in parallel), checked against a
/// standard meter.
class GalvanometerBench extends LabBench with LabDemo {
  const GalvanometerBench([this.mode = 'half']);

  /// 'half', 'voltmeter' or 'ammeter'.
  final String mode;

  /// The galvanometer under test: resistance G (Ω), figure of merit k (A per
  /// division), 30 divisions each side; the cell's EMF E (V).
  static const g = 96.0, k = 2.0e-5, full = 30, emf = 2.0;
  static const ig = full * k; // full-scale current, 6 × 10⁻⁴ A

  @override
  String get kind => mode == 'half' ? 'galvanometer' : 'galv-$mode';

  @override
  LabParams get defaults => {'r': 4000.0, 'k1': false, 'k2': false, 's': 200.0, 'range': 3.0, 'rs': 0.0, 'v': 1.0, 'irange': 30.0, 'sh': 10.0, 'i': 10.0};

  @override
  LabParams get preview => {...defaults, 'k1': true, 'k2': true, 's': 98.0, 'rs': 4904.0, 'sh': 1.96};


  /// Exact deflection (divisions) without and with the shunt (task half).
  static double theta(LabParams p) => pBool(p, 'k1') ? emf / (pNum(p, 'r', 4000) + g) / k : 0;
  static double thetaShunted(LabParams p) {
    if (!pBool(p, 'k1')) return 0;
    if (!pBool(p, 'k2')) return theta(p);
    final s = pNum(p, 's', 200), r = pNum(p, 'r', 4000);
    final i = emf / (r + g * s / (g + s));
    return i * s / (g + s) / k;
  }

  /// Deflection of the converted meter (divisions, signed beyond 30 = off scale).
  static double thetaConverted(LabParams p, bool volt) {
    if (!pBool(p, 'k1')) return 0;
    if (volt) return pNum(p, 'v', 1) / (pNum(p, 'rs') + g) / k;
    final sh = pNum(p, 'sh', 10);
    return pNum(p, 'i', 10) * 1e-3 * sh / (sh + g) / k;
  }

  double needle(LabParams p) => mode == 'half' ? thetaShunted(p) : thetaConverted(p, mode == 'voltmeter');

  /// The series resistance (Ω) for a voltmeter of [range] volts, and the
  /// shunt (Ω) for an ammeter of [ma] milliamperes.
  static double seriesFor(double range) => range / ig - g;
  static double shuntFor(double ma) => ig * g / (ma * 1e-3 - ig);

  @override
  List<LabControl> controls(LabParams p) => switch (mode) {
        'voltmeter' => [
            LabChoice('range', tr('Range wanted'), const [(3.0, '0–3 V'), (5.0, '0–5 V')]),
            LabSlider('rs', tr('Series resistance from the box'), 0, 9000, divisions: 9000, unit: ' Ω'),
            LabToggle('k1', tr('Key in')),
            LabSlider('v', tr('Voltage applied (rheostat)'), 0, 5, divisions: 50, unit: ' V', decimals: 1),
          ],
        'ammeter' => [
            LabChoice('irange', tr('Range wanted'), const [(30.0, '0–30 mA'), (60.0, '0–60 mA')]),
            LabSlider('sh', tr('Shunt resistance'), 0.5, 10, divisions: 950, unit: ' Ω', decimals: 2),
            LabToggle('k1', tr('Key in')),
            LabSlider('i', tr('Current (rheostat)'), 0, 60, divisions: 60, unit: ' mA'),
          ],
        _ => [
            LabChoice('r', tr('High resistance R'), const [(2000.0, '2000 Ω'), (3000.0, '3000 Ω'), (4000.0, '4000 Ω'), (5000.0, '5000 Ω'), (6000.0, '6000 Ω'), (8000.0, '8000 Ω')]),
            LabToggle('k1', tr('Key K₁ in')),
            LabToggle('k2', tr('Key K₂ in (shunt S across G)')),
            LabSlider('s', tr('Shunt S'), 1, 400, divisions: 399, unit: ' Ω'),
          ],
      };

  @override
  List<LabColumn> get columns => switch (mode) {
        'voltmeter' => [LabColumn('Rs (Ω)', 0), LabColumn(tr('Standard V (V)'), 2), LabColumn('θ (div)', 1), LabColumn(tr('V from θ (V)'), 2), LabColumn('ΔV (V)', 2)],
        'ammeter' => [LabColumn('S (Ω)', 2), LabColumn(tr('Standard I (mA)'), 1), LabColumn('θ (div)', 1), LabColumn(tr('I from θ (mA)'), 1), LabColumn('ΔI (mA)', 1)],
        _ => [LabColumn('R (Ω)', 0), LabColumn('θ (div)', 0), LabColumn('S (Ω)', 0), LabColumn('θ/2 (div)', 1), LabColumn('G (Ω)', 1), LabColumn('k (10⁻⁵ A/div)', 3)],
      };

  @override
  LabReading read(LabParams p) {
    if (!pBool(p, 'k1')) return LabReading.not(tr('Put the key in first.'));
    switch (mode) {
      case 'half':
        final th = theta(p).roundToDouble();
        if (th > full) return LabReading.not(tr('The deflection is off the scale: use a larger R.'));
        if (!pBool(p, 'k2')) return LabReading.not(tr('Note θ, then put K₂ in and adjust S until the deflection is halved.'));
        final half = thetaShunted(p);
        if ((half - th / 2).abs() > 0.3) return LabReading.not(tr('Adjust S until the deflection is exactly θ/2 = {h} div.', {'h': (th / 2).toStringAsFixed(1)}));
        final r = pNum(p, 'r', 4000), s = pNum(p, 's', 200);
        final gg = r * s / (r - s);
        final kk = emf / ((r + gg) * th);
        return LabReading.row([r, th, s, th / 2, gg, kk * 1e5]);
      case 'voltmeter':
        final th = thetaConverted(p, mode == 'voltmeter');
        if (th > full + 0.5) return LabReading.not(tr('Off the scale: the series resistance is too small for this voltage.'));
        final range = pNum(p, 'range', 3), v = pNum(p, 'v', 1);
        final thr = (th * 2).round() / 2;
        final vg = thr * range / full;
        return LabReading.row([pNum(p, 'rs'), v, thr, vg, vg - v]);
      default:
        final th = thetaConverted(p, mode == 'voltmeter');
        if (th > full + 0.5) return LabReading.not(tr('Off the scale: the shunt is too large for this current.'));
        final range = pNum(p, 'irange', 30), i = pNum(p, 'i', 10);
        final thr = (th * 2).round() / 2;
        final ia = thr * range / full;
        return LabReading.row([pNum(p, 'sh', 10), i, thr, ia, ia - i]);
    }
  }

  @override
  List<String> live(LabParams p) => switch (mode) {
        'half' => [
            'θ = ${needle(p).toStringAsFixed(1)} div',
            if (pBool(p, 'k1') && !pBool(p, 'k2')) tr('K₂ out: full current through G'),
            if (pBool(p, 'k2')) 'S = ${pNum(p, 's', 200).toStringAsFixed(0)} Ω',
          ],
        'voltmeter' => [
            'Ig = 30 × k = 6 × 10⁻⁴ A',
            tr('Needed: R = V/Ig − G = {r} Ω', {'r': seriesFor(pNum(p, 'range', 3)).toStringAsFixed(0)}),
            'θ = ${needle(p).toStringAsFixed(1)} div',
          ],
        _ => [
            'Ig = 6 × 10⁻⁴ A',
            tr('Needed: S = IgG/(I − Ig) = {s} Ω', {'s': shuntFor(pNum(p, 'irange', 30)).toStringAsFixed(2)}),
            'θ = ${needle(p).toStringAsFixed(1)} div',
          ],
      };

  @override
  LabGraph? graph(LabParams p) => mode == 'half' ? null : const LabGraph(1, 3, throughOrigin: true);

  @override
  List<LabParams> demo(LabParams start) {
    switch (mode) {
      case 'voltmeter':
        final rs = seriesFor(pNum(start, 'range', 3)).roundToDouble();
        return [for (final v in [0.5, 1.0, 1.5, 2.0, 2.5, 3.0]) {...start, 'k1': true, 'rs': rs, 'v': v}];
      case 'ammeter':
        final sh = (shuntFor(pNum(start, 'irange', 30)) * 100).round() / 100;
        return [for (final i in [5.0, 10.0, 15.0, 20.0, 25.0, 30.0]) {...start, 'k1': true, 'sh': sh, 'i': i}];
      default:
        return [
          for (final r in [3000.0, 4000.0, 5000.0, 6000.0, 8000.0])
            () {
              final base = {...start, 'k1': true, 'k2': true, 'r': r};
              final th = theta(base).roundToDouble();
              // The S that halves the deflection, to the nearest ohm.
              var best = 1.0, err = 1e9;
              for (var s = 1.0; s <= 400; s++) {
                final e = (thetaShunted({...base, 's': s}) - th / 2).abs();
                if (e < err) {
                  err = e;
                  best = s;
                }
              }
              return {...base, 's': best};
            }(),
        ];
    }
  }

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    double n(Object o) => (o as num).toDouble();
    if (mode == 'half') {
      final mg = meanSe([for (final r in rows) n(r[4])]), mk = meanSe([for (final r in rows) n(r[5])]);
      return tr('G = RS/(R − S) = {g} Ω (mean of {n}); figure of merit k = E/((R + G)θ) = {k} × 10⁻⁵ A/div, so full scale (30 div) is {i} mA.', {
        'g': pm(mg.mean, mg.se),
        'n': rows.length,
        'k': pm(mk.mean, mk.se),
        'i': (mk.mean * 30e-2).toStringAsFixed(2),
      });
    }
    final worst = rows.map((r) => n(r[4]).abs()).reduce(math.max);
    return mode == 'voltmeter'
        ? tr('With a series resistance of {r} Ω the converted voltmeter agrees with the standard one within {e} V: the conversion works (R = V/Ig − G).', {'r': n(rows.last[0]).toStringAsFixed(0), 'e': worst.toStringAsFixed(2)})
        : tr('With a shunt of {s} Ω the converted ammeter agrees with the standard one within {e} mA: the conversion works (S = IgG/(I − Ig)).', {'s': n(rows.last[0]).toStringAsFixed(2), 'e': worst.toStringAsFixed(1)});
  }

  // ---------------------------------------------------------- drawing

  static void _wire(Canvas canvas, List<Offset> pts) {
    final path = Path()..moveTo(pts.first.dx, pts.first.dy);
    for (final q in pts.skip(1)) {
      path.lineTo(q.dx, q.dy);
    }
    canvas.drawPath(path, stroke(const Color(0xFFB2452E), 2.6));
  }

  static void _accumulator(Canvas canvas, Rect r, String text) {
    canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(6)), fill(const Color(0xFF263238)));
    canvas.drawRect(Rect.fromLTWH(r.left + 8, r.top + 8, r.width - 16, r.height * 0.3), fill(const Color(0xFF37474F)));
    Kit.terminal(canvas, Offset(r.left + r.width * 0.25, r.top - 4), 7);
    Kit.terminal(canvas, Offset(r.right - r.width * 0.25, r.top - 4), 7);
    label(canvas, '+', Offset(r.left + r.width * 0.25, r.top + 20), size: 16, bold: true, color: Colors.white);
    label(canvas, '−', Offset(r.right - r.width * 0.25, r.top + 20), size: 16, bold: true, color: Colors.white);
    label(canvas, text, Offset(r.center.dx, r.bottom - r.height * 0.28), size: 14, bold: true, color: Colors.white);
  }

  static void _rheostat(Canvas canvas, Rect r, double f, String text) {
    final tube = Rect.fromLTWH(r.left, r.top + r.height * 0.35, r.width, r.height * 0.45);
    canvas.drawRRect(RRect.fromRectAndRadius(tube, Radius.circular(tube.height / 2)), fill(const Color(0xFFE8DCC2)));
    for (var x = tube.left + 6; x < tube.right - 6; x += 4) {
      canvas.drawLine(Offset(x, tube.top + 2), Offset(x + 2, tube.bottom - 2), stroke(const Color(0xFF8D6E63), 1.2));
    }
    canvas.drawLine(Offset(r.left, r.top + 8), Offset(r.right, r.top + 8), stroke(Kit.steelDark, 4));
    final x = r.left + r.width * f.clamp(0.04, 0.96);
    canvas.drawRect(Rect.fromCenter(center: Offset(x, r.top + 14), width: 18, height: 26), fill(const Color(0xFF263238)));
    label(canvas, text, Offset(r.center.dx, r.bottom + 14), size: 13, color: LabInk.muted);
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    Kit.table(canvas, Rect.fromLTWH(0, h * 0.9, w, h * 0.1));
    final gr = math.min(w * 0.1, h * 0.17);
    final gc = Offset(w * 0.42, h * 0.58);
    final tk = mode;
    final th = needle(p);
    switch (tk) {
      case 'half':
        final top = h * 0.16;
        final cellR = Rect.fromCenter(center: Offset(w * 0.14, top + 24), width: w * 0.12, height: 64);
        final k1 = Offset(w * 0.36, top);
        final rBox = Rect.fromCenter(center: Offset(w * 0.66, top), width: w * 0.2, height: 64);
        final sBox = Rect.fromCenter(center: Offset(gc.dx, h * 0.86 - 30), width: w * 0.16, height: 54);
        final k2 = Offset(gc.dx + w * 0.17, h * 0.86 - 30);
        final left = w * 0.06, right = w * 0.84;
        _wire(canvas, [Offset(cellR.right - cellR.width * 0.25, cellR.top - 4), Offset(cellR.right - cellR.width * 0.25, top - 30), Offset(k1.dx - 20, top - 30), Offset(k1.dx - 20, top)]);
        _wire(canvas, [Offset(k1.dx + 20, top), Offset(rBox.left, top)]);
        _wire(canvas, [Offset(rBox.right, top), Offset(right, top), Offset(right, gc.dy), Offset(gc.dx + gr * 1.15, gc.dy)]);
        _wire(canvas, [Offset(gc.dx - gr * 1.15, gc.dy), Offset(left, gc.dy), Offset(left, top - 30), Offset(cellR.left + cellR.width * 0.25, top - 30), Offset(cellR.left + cellR.width * 0.25, cellR.top - 4)]);
        // Shunt S with K2, across G.
        _wire(canvas, [Offset(left + w * 0.08, gc.dy), Offset(left + w * 0.08, sBox.center.dy), Offset(sBox.left, sBox.center.dy)]);
        _wire(canvas, [Offset(sBox.right, sBox.center.dy), Offset(k2.dx - 20, k2.dy)]);
        _wire(canvas, [Offset(k2.dx + 20, k2.dy), Offset(right - w * 0.06, k2.dy), Offset(right - w * 0.06, gc.dy)]);
        _accumulator(canvas, cellR, 'E = 2 V');
        Kit.plugKey(canvas, k1, pBool(p, 'k1'), name: 'K₁');
        Kit.resistanceBox(canvas, rBox, 'R = ${pNum(p, 'r', 4000).toStringAsFixed(0)} Ω');
        Kit.resistanceBox(canvas, sBox, 'S = ${pNum(p, 's', 200).toStringAsFixed(0)} Ω');
        Kit.plugKey(canvas, k2, pBool(p, 'k2'), name: 'K₂');
        Kit.dial(canvas, gc, gr, 'G', th, -30, 30, majors: 6, reading: '${th.toStringAsFixed(1)} div');
        Kit.card(canvas, Offset(w * 0.62, h * 0.34), w * 0.34, tr('Half-deflection'), [
          tr('K₂ out: θ = E / ((R + G) k)'),
          tr('K₂ in, S adjusted: θ/2'),
          'G = RS / (R − S)',
          'k = E / ((R + G) θ)',
        ]);
      default:
        final volt = tk == 'voltmeter';
        final top = h * 0.18;
        final supply = Rect.fromCenter(center: Offset(w * 0.12, top + 30), width: w * 0.12, height: 64);
        final rh = Rect.fromLTWH(w * 0.28, top - 34, w * 0.2, 46);
        final key = Offset(w * 0.6, top);
        final right = w * 0.86, left = w * 0.05;
        final stdC = volt ? Offset(w * 0.74, h * 0.58) : Offset(w * 0.74, h * 0.58);
        final box = Rect.fromCenter(center: volt ? Offset(gc.dx, h * 0.84) : Offset(gc.dx, h * 0.84), width: w * 0.18, height: 52);
        final frac = volt ? pNum(p, 'v', 1) / 5 : pNum(p, 'i', 10) / 60;
        _accumulator(canvas, supply, volt ? '6 V' : '6 V');
        _rheostat(canvas, rh, frac, tr('Rheostat'));
        _wire(canvas, [Offset(supply.right - supply.width * 0.25, supply.top - 4), Offset(supply.right - supply.width * 0.25, top), Offset(rh.left, top)]);
        _wire(canvas, [Offset(rh.right, top), Offset(key.dx - 20, top)]);
        Kit.plugKey(canvas, key, pBool(p, 'k1'), name: 'K');
        if (volt) {
          // Converted voltmeter (G + Rs) in parallel with the standard voltmeter.
          _wire(canvas, [Offset(key.dx + 20, top), Offset(right, top), Offset(right, h * 0.84), Offset(box.right, box.center.dy)]);
          _wire(canvas, [Offset(box.left, box.center.dy), Offset(left, box.center.dy), Offset(left, top), Offset(supply.left + supply.width * 0.25, top), Offset(supply.left + supply.width * 0.25, supply.top - 4)]);
          _wire(canvas, [Offset(box.left - w * 0.06, box.center.dy), Offset(box.left - w * 0.06, gc.dy), Offset(gc.dx - gr * 1.15, gc.dy)]);
          _wire(canvas, [Offset(gc.dx + gr * 1.15, gc.dy), Offset(box.right + w * 0.03, gc.dy), Offset(box.right + w * 0.03, box.center.dy)]);
          canvas.drawRect(Rect.fromLTWH(box.left, box.center.dy - 3, box.width, 6), fill(const Color(0xFFF7F3EA)));
          Kit.resistanceBox(canvas, box, 'Rs = ${pNum(p, 'rs').toStringAsFixed(0)} Ω');
          _wire(canvas, [Offset(right, h * 0.36), Offset(stdC.dx, h * 0.36), Offset(stdC.dx, stdC.dy - gr)]);
          _wire(canvas, [Offset(stdC.dx, stdC.dy + gr), Offset(stdC.dx, h * 0.94), Offset(left, h * 0.94), Offset(left, box.center.dy)]);
          final v = pBool(p, 'k1') ? pNum(p, 'v', 1) : 0.0;
          Kit.dial(canvas, stdC, gr * 0.85, 'V', v, 0, 5, majors: 5, unit: 'V', reading: '${v.toStringAsFixed(2)} V');
        } else {
          // Standard ammeter in series with the converted ammeter (G with shunt S).
          _wire(canvas, [Offset(key.dx + 20, top), Offset(right, top), Offset(right, stdC.dy - gr), Offset(stdC.dx, stdC.dy - gr)]);
          _wire(canvas, [Offset(stdC.dx, stdC.dy + gr), Offset(stdC.dx, h * 0.84 - 60), Offset(gc.dx + gr * 1.6, h * 0.84 - 60), Offset(gc.dx + gr * 1.6, gc.dy), Offset(gc.dx + gr * 1.15, gc.dy)]);
          _wire(canvas, [Offset(gc.dx - gr * 1.15, gc.dy), Offset(left, gc.dy), Offset(left, top), Offset(supply.left + supply.width * 0.25, top), Offset(supply.left + supply.width * 0.25, supply.top - 4)]);
          _wire(canvas, [Offset(gc.dx - gr * 1.4, gc.dy), Offset(gc.dx - gr * 1.4, box.center.dy), Offset(box.left, box.center.dy)]);
          _wire(canvas, [Offset(box.right, box.center.dy), Offset(gc.dx + gr * 1.6, box.center.dy), Offset(gc.dx + gr * 1.6, h * 0.84 - 60)]);
          Kit.resistanceBox(canvas, box, 'S = ${pNum(p, 'sh', 10).toStringAsFixed(2)} Ω');
          final i = pBool(p, 'k1') ? pNum(p, 'i', 10) : 0.0;
          Kit.dial(canvas, stdC, gr * 0.85, 'mA', i, 0, 60, majors: 6, unit: 'mA', reading: '${i.toStringAsFixed(1)} mA');
        }
        Kit.dial(canvas, gc, gr, 'G', th, -30, 30, majors: 6, reading: th > full + 0.5 ? tr('Off the scale') : '${th.toStringAsFixed(1)} div');
        label(canvas, volt ? tr('Converted voltmeter: G in series with Rs') : tr('Converted ammeter: G with shunt S'), Offset(gc.dx, gc.dy - gr * 1.2), size: 14, bold: true, halo: LabInk.paper);
    }
  }
}
