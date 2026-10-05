import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../core/i18n.dart';
import '../../engines/biology.dart';
import '../chemistry/glassware.dart';

double _r(double v, int k) => (v * k).round() / k;

/// A small graph panel for the benches that show a curve as it builds up.
void curvePanel(Canvas canvas, Rect r, List<Offset> pts, {required double maxX, required double maxY, String x = '', String y = '', double? refY, Color colour = LabInk.blue}) {
  canvas.drawRect(r, fill(Colors.white));
  canvas.drawRect(r, stroke(LabInk.faint, 1.5));
  final a = r.deflate(22);
  final axis = stroke(LabInk.ink, 1.5);
  canvas.drawLine(a.bottomLeft, a.topLeft, axis);
  canvas.drawLine(a.bottomLeft, a.bottomRight, axis);
  label(canvas, x, Offset(a.center.dx, r.bottom - 9), size: 11, color: LabInk.muted);
  label(canvas, y, Offset(a.left + 4, r.top + 10), size: 11, color: LabInk.muted, centre: false);
  Offset map(Offset p) => Offset(a.left + a.width * (p.dx / maxX).clamp(0, 1), a.bottom - a.height * (p.dy / maxY).clamp(0, 1));
  if (refY != null) dashed(canvas, map(Offset(0, refY)), map(Offset(maxX, refY)), stroke(LabInk.red, 1.5));
  if (pts.length >= 2) {
    final path = Path()..moveTo(map(pts.first).dx, map(pts.first).dy);
    for (final p in pts.skip(1)) {
      path.lineTo(map(p).dx, map(p).dy);
    }
    canvas.drawPath(path, stroke(colour, 2.5));
  }
  if (pts.isNotEmpty) canvas.drawCircle(map(pts.last), 4, fill(colour));
}

/// Rate of photosynthesis of a water plant (Hydrilla) by counting oxygen
/// bubbles, with the lamp at different distances.
class PhotosynthesisBench extends LabBench {
  const PhotosynthesisBench();

  @override
  String get kind => 'photosynthesis';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'cm': 20.0, 'co2': 1.0, 'temp': 25.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabSlider('cm', tr('Lamp distance'), 10, 50, divisions: 8, unit: ' cm'),
        LabChoice('co2', tr('Sodium bicarbonate'), [for (final c in [0.0, 0.5, 1.0, 2.0]) (c, '$c %')]),
        LabSlider('temp', tr('Water temperature'), 15, 40, divisions: 5, unit: ' °C'),
      ];

  static double rate(LabParams p) => Photosynthesis.rate(cm: pNum(p, 'cm', 20), bicarbonate: pNum(p, 'co2', 1), celsius: pNum(p, 'temp', 25));

  static int bubbles(LabParams p) {
    final key = '${pNum(p, 'cm', 20)}|${pNum(p, 'co2', 1)}|${pNum(p, 'temp', 25)}';
    return math.max(0, (rate(p) * (1 + 0.04 * labNoise(key))).round());
  }

  @override
  List<LabColumn> get columns => [
        LabColumn(tr('Distance (cm)'), 0),
        LabColumn(tr('Light (1000/d²)'), 2),
        LabColumn(tr('Bicarbonate (%)'), 1),
        LabColumn(tr('Temperature (°C)'), 0),
        LabColumn(tr('Bubbles per minute'), 0),
      ];

  @override
  LabReading read(LabParams p) {
    final d = pNum(p, 'cm', 20);
    return LabReading.row([d, _r(1000 / (d * d), 100), pNum(p, 'co2', 1), pNum(p, 'temp', 25), bubbles(p)]);
  }

  @override
  List<String> live(LabParams p) => [tr('{n} bubbles a minute', {'n': '${bubbles(p)}'})];

  @override
  LabGraph graph(LabParams p) {
    final co2 = pNum(p, 'co2', 1), temp = pNum(p, 'temp', 25);
    return LabGraph(1, 4, curve: true, include: (r) => r[2] == co2 && r[3] == temp);
  }

  @override
  String? result(List<List<Object>> rows) {
    final groups = <String, List<List<Object>>>{};
    for (final r in rows) {
      groups.putIfAbsent('${r[2]}|${r[3]}', () => []).add(r);
    }
    final out = <String>[];
    for (final g in groups.values) {
      if (g.length < 4) continue;
      g.sort((a, b) => (a[1] as num).compareTo(b[1] as num));
      // Slope of rate against light over the dim half and over the bright half.
      double slope(Iterable<List<Object>> part) =>
          LinearFit.of([for (final r in part) (r[1] as num).toDouble()], [for (final r in part) (r[4] as num).toDouble()])?.slope ?? 0;
      final half = (g.length + 1) ~/ 2;
      final s1 = slope(g.take(half)), s2 = slope(g.skip(g.length - half));
      out.add(s2 < s1 * 0.5
          ? tr('With {c} % bicarbonate at {t} °C the rate rises with light at first, then levels off: something else (carbon dioxide or temperature) becomes the limiting factor.', {'c': '${g[0][2]}', 't': '${g[0][3]}'})
          : tr('With {c} % bicarbonate at {t} °C the rate is still rising with light: light is the limiting factor here.', {'c': '${g[0][2]}', 't': '${g[0][3]}'}));
    }
    return out.isEmpty ? null : out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final d = pNum(p, 'cm', 20);
    // Beaker with an inverted funnel over the plant and a test tube on top.
    final bx = w * 0.62, base = h * 0.86;
    Glass.beaker(canvas, Offset(bx, base), w * 0.24, h * 0.42, const Color(0x5578B7E0), fillFraction: 0.85);
    final funnel = Path()
      ..moveTo(bx - w * 0.08, base - 6)
      ..lineTo(bx - 10, base - h * 0.2)
      ..lineTo(bx - 10, base - h * 0.3)
      ..moveTo(bx + 10, base - h * 0.3)
      ..lineTo(bx + 10, base - h * 0.2)
      ..lineTo(bx + w * 0.08, base - 6);
    canvas.drawPath(funnel, stroke(LabInk.ink.withValues(alpha: 0.6), 2));
    canvas.drawRect(Rect.fromLTWH(bx - 12, base - h * 0.55, 24, h * 0.25), stroke(LabInk.ink.withValues(alpha: 0.6), 2));
    // The plant.
    final leaf = fill(const Color(0xFF2E7D32));
    for (var k = 0; k < 5; k++) {
      final y = base - 12 - k * h * 0.035;
      canvas.drawLine(Offset(bx, base - 8), Offset(bx, base - h * 0.2), stroke(const Color(0xFF33691E), 2.5));
      for (final s in [-1.0, 1.0]) {
        canvas.drawOval(Rect.fromCenter(center: Offset(bx + s * 12, y), width: 22, height: 7), leaf);
      }
    }
    // Bubbles rising up the tube at the rate.
    final n = bubbles(p);
    if (n > 0) {
      final period = 60 / n;
      for (var k = 0; k < 6; k++) {
        final phase = ((t / period) + k / 6) % 1;
        final y = base - h * 0.2 - phase * h * 0.33;
        canvas.drawCircle(Offset(bx + math.sin(phase * 9 + k) * 2, y), 3, stroke(Colors.white, 1.5));
      }
    }
    // Lamp at distance d (scale: 50 cm across the gap).
    final lx = bx - w * 0.1 - (w * 0.42) * d / 50;
    canvas.drawCircle(Offset(lx, base - h * 0.2), 16, fill(const Color(0xFFFFE082)));
    canvas.drawLine(Offset(lx, base - h * 0.2 + 16), Offset(lx, base), stroke(LabInk.wire, 3));
    final glow = (Photosynthesis.light(d)).clamp(0.0, 1.0);
    for (var k = -1; k <= 1; k++) {
      canvas.drawLine(Offset(lx + 20, base - h * 0.2 + k * 8), Offset(bx - w * 0.12, base - h * 0.2 + k * 20), stroke(const Color(0xFFFFC107).withValues(alpha: 0.2 + 0.6 * glow), 2));
    }
    dashed(canvas, Offset(lx, base + 14), Offset(bx, base + 14), stroke(LabInk.muted, 1.2));
    label(canvas, '${d.toStringAsFixed(0)} cm', Offset((lx + bx) / 2, base + 26), size: 13, color: LabInk.muted);
    label(canvas, '${pNum(p, 'temp', 25).toStringAsFixed(0)} °C · NaHCO₃ ${pNum(p, 'co2', 1)} %', Offset(bx, h * 0.12), size: 14, color: LabInk.muted);
  }
}

/// Effect of temperature and pH on salivary amylase: time for starch to stop
/// giving a blue-black colour with iodine.
class AmylaseBench extends LabBench {
  const AmylaseBench();

  /// Time (s) at the optimum (37 °C, pH 6.8).
  static const best = 60.0;

  @override
  String get kind => 'amylase';

  @override
  LabParams get defaults => {'temp': 37.0, 'ph': 6.8};

  @override
  List<LabControl> controls(LabParams p) => [
        LabSlider('temp', tr('Water bath'), 10, 70, divisions: 12, unit: ' °C'),
        LabChoice('ph', tr('Buffer pH'), [for (final v in [4.0, 5.0, 6.0, 6.8, 8.0, 9.0]) (v, 'pH $v')]),
      ];

  /// Seconds to the achromic point (null: still blue-black after 15 minutes).
  static double? time(LabParams p) {
    final rel = Enzyme.temperature(pNum(p, 'temp', 37)) / Enzyme.temperature(37) * Enzyme.ph(pNum(p, 'ph', 6.8));
    final t = best / math.max(rel, 1e-6) * (1 + 0.03 * labNoise('${p['temp']}|${p['ph']}'));
    return t > 900 ? null : (t / 5).round() * 5;
  }

  @override
  List<LabColumn> get columns => [LabColumn(tr('Temperature (°C)'), 0), const LabColumn('pH', 1), LabColumn(tr('Time (s)'), 0), LabColumn(tr('Rate (1000/t)'), 1)];

  @override
  LabReading read(LabParams p) {
    final t = time(p);
    return LabReading.row([pNum(p, 'temp', 37), pNum(p, 'ph', 6.8), t ?? '> 900', t == null ? 0.0 : _r(1000 / t, 10)]);
  }

  @override
  LabGraph graph(LabParams p) {
    // The temperature series at this pH.
    final ph = pNum(p, 'ph', 6.8);
    return LabGraph(0, 3, curve: true, include: (r) => r[1] == ph);
  }

  @override
  String? result(List<List<Object>> rows) {
    final out = <String>[];
    final at68 = [for (final r in rows) if (r[1] == 6.8) r];
    if (at68.map((r) => r[0]).toSet().length >= 4) {
      final top = at68.reduce((a, b) => (a[3] as num) >= (b[3] as num) ? a : b);
      out.add(tr('At pH 6.8 the enzyme works fastest near {t} °C; it is slow when cold and is destroyed (denatured) when hot.', {'t': (top[0] as num).toStringAsFixed(0)}));
    }
    final at37 = [for (final r in rows) if (r[0] == 37.0) r];
    if (at37.map((r) => r[1]).toSet().length >= 3) {
      final top = at37.reduce((a, b) => (a[3] as num) >= (b[3] as num) ? a : b);
      out.add(tr('At 37 °C it works fastest at pH {p}, the pH of saliva.', {'p': '${top[1]}'}));
    }
    return out.isEmpty ? null : out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final end = time(p);
    // Water bath with the test tube.
    final bath = Rect.fromLTWH(w * 0.06, h * 0.45, w * 0.3, h * 0.42);
    final temp = pNum(p, 'temp', 37);
    canvas.drawRect(bath, fill(Color.lerp(const Color(0x5578B7E0), const Color(0x66E57373), ((temp - 10) / 60).clamp(0.0, 1.0))!));
    canvas.drawRect(bath, stroke(LabInk.ink, 2));
    Glass.testTube(canvas, Offset(bath.center.dx, bath.bottom - 10), h * 0.5, const Color(0x66FFF8E1));
    label(canvas, '${temp.toStringAsFixed(0)} °C · pH ${pNum(p, 'ph', 6.8)}', Offset(bath.center.dx, bath.top - 18), size: 14, bold: true);
    // Spotting tile: a drop every minute-or-so into iodine.
    final tile = Rect.fromLTWH(w * 0.44, h * 0.3, w * 0.5, h * 0.44);
    canvas.drawRRect(RRect.fromRectAndRadius(tile, const Radius.circular(8)), fill(Colors.white));
    canvas.drawRRect(RRect.fromRectAndRadius(tile, const Radius.circular(8)), stroke(LabInk.faint, 2));
    const cols = 4, rows = 3;
    final step = (end ?? 900) / (cols * rows - 2);
    for (var i = 0; i < cols * rows; i++) {
      final c = Offset(tile.left + tile.width * (i % cols + 0.5) / cols, tile.top + tile.height * (i ~/ cols + 0.5) / rows);
      final at = i * step;
      final left = end == null ? math.max(0.2, 1 - at / 2400) : (1 - at / end).clamp(0.0, 1.0);
      final colour = Color.lerp(const Color(0xFFC9A227), const Color(0xFF1A1446), left)!;
      canvas.drawCircle(c, tile.height / rows * 0.32, fill(colour));
      label(canvas, '${at.round()} s', c + Offset(0, tile.height / rows * 0.42), size: 10, color: LabInk.muted);
    }
    label(canvas, end == null ? tr('Still blue-black after 15 minutes') : tr('Iodine stops turning blue-black at {t} s', {'t': end.toStringAsFixed(0)}), Offset(tile.center.dx, tile.bottom + 26), size: 14, bold: true);
  }
}

/// Michaelis–Menten kinetics: initial rate against substrate, with and
/// without an inhibitor, and the Lineweaver–Burk plot.
class MichaelisBench extends LabBench {
  const MichaelisBench();

  static const vmax = 120.0, km = 4.0;

  @override
  String get kind => 'michaelis';

  @override
  LabParams get defaults => {'s': 2.0, 'inhibitor': 'none'};

  static String inhibitorName(String i) => switch (i) {
        'competitive' => tr('Competitive inhibitor'),
        'non-competitive' => tr('Non-competitive inhibitor'),
        _ => tr('No inhibitor'),
      };

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('s', tr('Substrate [S]'), [for (final s in [0.5, 1.0, 2.0, 4.0, 8.0, 16.0, 32.0]) (s, '$s mM')]),
        LabChoice('inhibitor', tr('Inhibitor'), [for (final i in ['none', 'competitive', 'non-competitive']) (i, inhibitorName(i))]),
      ];

  static double v0(LabParams p) {
    final s = pNum(p, 's', 2);
    final inh = pStr(p, 'inhibitor', 'none');
    return _r(Enzyme.inhibited(s, vmax, km, inh) * (1 + 0.02 * labNoise('$s|$inh')), 10);
  }

  @override
  List<LabColumn> get columns => [LabColumn(tr('Inhibitor')), const LabColumn('[S] (mM)', 1), const LabColumn('v₀ (µmol/min)', 1), const LabColumn('1/[S]', 3), const LabColumn('1/v₀', 4)];

  @override
  LabReading read(LabParams p) {
    final s = pNum(p, 's', 2), v = v0(p);
    return LabReading.row([inhibitorName(pStr(p, 'inhibitor', 'none')), s, v, _r(1 / s, 1000), _r(1 / v, 100000)]);
  }

  @override
  List<String> live(LabParams p) => ['v₀ = ${v0(p).toStringAsFixed(1)} µmol/min'];

  @override
  LabGraph graph(LabParams p) {
    final name = inhibitorName(pStr(p, 'inhibitor', 'none'));
    return LabGraph(3, 4, line: true, include: (r) => r[0] == name);
  }

  /// Km and Vmax with their standard errors from the Lineweaver–Burk line.
  static ({double km, double kmSe, double vmax, double vmaxSe})? fit(List<List<Object>> rows) {
    final f = LinearFit.of([for (final r in rows) (r[3] as num).toDouble()], [for (final r in rows) (r[4] as num).toDouble()]);
    if (f == null || rows.length < 3 || f.intercept <= 0) return null;
    final v = 1 / f.intercept, k = f.slope / f.intercept;
    return (vmax: v, vmaxSe: f.interceptSe / (f.intercept * f.intercept), km: k, kmSe: k * math.sqrt(math.pow(f.slopeSe / f.slope, 2) + math.pow(f.interceptSe / f.intercept, 2)));
  }

  @override
  String? result(List<List<Object>> rows) {
    final fits = <String, ({double km, double kmSe, double vmax, double vmaxSe})>{};
    for (final i in ['none', 'competitive', 'non-competitive']) {
      final f = fit([for (final r in rows) if (r[0] == inhibitorName(i)) r]);
      if (f != null) fits[i] = f;
    }
    if (fits.isEmpty) return null;
    final out = [
      for (final e in fits.entries)
        tr('{i}: Vmax = {v} µmol/min, Km = {k} mM.', {'i': inhibitorName(e.key), 'v': pm(e.value.vmax, e.value.vmaxSe), 'k': pm(e.value.km, e.value.kmSe)}),
    ];
    final base = fits['none'];
    if (base != null) {
      for (final e in fits.entries.where((e) => e.key != 'none')) {
        final sameV = (e.value.vmax - base.vmax).abs() < 0.1 * base.vmax;
        out.add(sameV
            ? tr('{i}: same Vmax, larger Km: the lines meet on the 1/v axis, so the inhibitor competes for the active site.', {'i': inhibitorName(e.key)})
            : tr('{i}: lower Vmax, same Km: the lines meet on the 1/[S] axis, so the inhibitor binds elsewhere on the enzyme.', {'i': inhibitorName(e.key)}));
      }
    }
    return out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    // Cuvette in a spectrophotometer, and the v-against-[S] curve.
    final inh = pStr(p, 'inhibitor', 'none');
    final s = pNum(p, 's', 2);
    curvePanel(
      canvas,
      Rect.fromLTWH(w * 0.42, h * 0.08, w * 0.54, h * 0.8),
      [for (var x = 0.0; x <= 32; x += 0.5) Offset(x, Enzyme.inhibited(x, vmax, km, inh))],
      maxX: 32,
      maxY: vmax * 1.1,
      x: '[S] (mM)',
      y: 'v₀',
      refY: vmax,
    );
    final cuv = Rect.fromLTWH(w * 0.12, h * 0.3, w * 0.12, h * 0.36);
    canvas.drawRect(cuv, fill(Color.lerp(const Color(0x22FFF59D), const Color(0xFFFBC02D), (s / 32).clamp(0.0, 1.0))!));
    canvas.drawRect(cuv, stroke(LabInk.ink, 2));
    label(canvas, '[S] = $s mM', Offset(cuv.center.dx, cuv.bottom + 20), size: 14, bold: true);
    label(canvas, inhibitorName(inh), Offset(cuv.center.dx, cuv.bottom + 42), size: 12, color: LabInk.muted);
    Glass.readout(canvas, Rect.fromLTWH(w * 0.06, h * 0.08, w * 0.26, h * 0.14), v0(p).toStringAsFixed(1), 'v₀ (µmol/min)');
  }
}

/// Growth of a bacterial culture: optical density against time.
class GrowthBench extends LabBench {
  const GrowthBench();

  @override
  String get kind => 'growth';

  @override
  LabParams get defaults => {'hours': 0.0, 'temp': 37.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabSlider('hours', tr('Time since inoculation'), 0, 14, divisions: 28, unit: ' h', decimals: 1),
        LabChoice('temp', tr('Incubator'), [for (final c in [20.0, 30.0, 37.0, 42.0]) (c, '${c.toStringAsFixed(0)} °C')]),
      ];

  static double od(LabParams p) {
    final h = pNum(p, 'hours', 0), c = pNum(p, 'temp', 37);
    return _r(Growth.od(h, mu: Growth.mu(c)) * (1 + 0.015 * labNoise('$h|$c')), 1000);
  }

  @override
  List<LabColumn> get columns => [LabColumn(tr('Temperature (°C)'), 0), LabColumn(tr('Time (h)'), 1), const LabColumn('OD₆₀₀', 3), const LabColumn('ln OD', 3)];

  @override
  LabReading read(LabParams p) {
    final o = od(p);
    return LabReading.row([pNum(p, 'temp', 37), pNum(p, 'hours', 0), o, _r(math.log(o), 1000)]);
  }

  @override
  List<String> live(LabParams p) => ['OD₆₀₀ = ${od(p).toStringAsFixed(3)}'];

  @override
  LabGraph graph(LabParams p) {
    final c = pNum(p, 'temp', 37);
    return LabGraph(1, 3, curve: true, fromZero: false, include: (r) => r[0] == c);
  }

  /// Growth rate (per hour) from the straight part of ln OD against time.
  static LinearFit? exponential(List<List<Object>> rows) {
    final log = [for (final r in rows) if ((r[2] as num) > 0.04 && (r[2] as num) < 0.6) r];
    if (log.length < 3) return null;
    return LinearFit.of([for (final r in log) (r[1] as num).toDouble()], [for (final r in log) (r[3] as num).toDouble()]);
  }

  @override
  String? result(List<List<Object>> rows) {
    final out = <String>[];
    for (final c in [20.0, 30.0, 37.0, 42.0]) {
      final f = exponential([for (final r in rows) if (r[0] == c) r]);
      if (f == null || f.slope <= 0) continue;
      final g = math.ln2 / f.slope * 60, gSe = g * f.slopeSe / f.slope;
      out.add(tr('{t} °C: in the log phase ln OD rises by {mu} per hour, so the cells double every {g} minutes.', {'t': c.toStringAsFixed(0), 'mu': pm(f.slope, f.slopeSe), 'g': pm(g, gSe)}));
    }
    return out.isEmpty ? null : out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final hours = pNum(p, 'hours', 0), c = pNum(p, 'temp', 37);
    final o = od(p);
    // Flask, cloudier as it grows.
    Glass.conicalFlask(canvas, Offset(w * 0.16, h * 0.82), h * 0.4, Color.lerp(const Color(0x33FFF8E1), const Color(0xCCD7C49E), (o / 1.6).clamp(0.0, 1.0))!);
    Glass.readout(canvas, Rect.fromLTWH(w * 0.04, h * 0.08, w * 0.26, h * 0.14), o.toStringAsFixed(3), 'OD₆₀₀');
    curvePanel(
      canvas,
      Rect.fromLTWH(w * 0.38, h * 0.08, w * 0.58, h * 0.8),
      [for (var x = 0.0; x <= hours + 1e-9; x += 0.25) Offset(x, Growth.od(x, mu: Growth.mu(c)))],
      maxX: 14,
      maxY: 1.8,
      x: tr('Time (h)'),
      y: 'OD₆₀₀',
    );
  }
}
