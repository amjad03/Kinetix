import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../core/i18n.dart';
import '../chemistry/glassware.dart';
import 'kit.dart';

// --------------------------------------------------------------- sols

/// Preparing sols: lyophilic (starch, gum, egg albumin) and lyophobic
/// (ferric hydroxide, aluminium hydroxide), with a true solution to compare.
/// A torch shows the Tyndall effect; a little NaCl coagulates only the
/// lyophobic sols.
class ColloidBench extends LabBench with LabDemo {
  const ColloidBench();

  static const sols = ['starch', 'gum', 'egg', 'feoh3', 'aloh3', 'nacl'];

  static String solName(String s) => switch (s) {
        'starch' => tr('Starch sol'),
        'gum' => tr('Gum arabic sol'),
        'egg' => tr('Egg albumin sol'),
        'feoh3' => tr('Ferric hydroxide sol'),
        'aloh3' => tr('Aluminium hydroxide sol'),
        _ => tr('Sodium chloride solution (true solution)'),
      };

  static bool lyophobic(String s) => s == 'feoh3' || s == 'aloh3';

  static String typeOf(String s) => s == 'nacl' ? tr('True solution') : (lyophobic(s) ? tr('Lyophobic sol') : tr('Lyophilic sol'));

  static Color colour(String s) => switch (s) {
        'starch' => const Color(0xB3F4F1EA),
        'gum' => const Color(0xA6EEDDB0),
        'egg' => const Color(0xB3F2EEDC),
        'feoh3' => const Color(0xD9A4401B),
        'aloh3' => const Color(0xB3EEF2F5),
        _ => const Color(0x5578B7E0),
      };

  static String appearance(String s) => switch (s) {
        'starch' => tr('Translucent, faintly milky'),
        'gum' => tr('Clear, pale yellow'),
        'egg' => tr('Translucent, opalescent'),
        'feoh3' => tr('Clear, deep reddish-brown'),
        'aloh3' => tr('Translucent, faintly white'),
        _ => tr('Clear and colourless'),
      };

  static String method(String s) => switch (s) {
        'starch' => tr('Starch paste poured into boiling water, stirring'),
        'gum' => tr('Gum arabic powder stirred into warm water'),
        'egg' => tr('Egg white shaken with 5% NaCl solution'),
        'feoh3' => tr('2% FeCl₃ added drop by drop to boiling water'),
        'aloh3' => tr('Al(OH)₃ freshly precipitated, peptised with a little AlCl₃'),
        _ => tr('Common salt dissolved in water'),
      };

  @override
  String get kind => 'colloid';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'sol': 'feoh3', 'progress': 0.0, 'beam': false, 'nacl': false};

  @override
  LabParams get preview => {...defaults, 'progress': 1.0, 'beam': true};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('sol', tr('Prepare'), [for (final s in sols) (s, solName(s))]),
        LabSlider('progress', tr('Preparation (heating and adding)'), 0, 1, divisions: 20, decimals: 2),
        LabToggle('beam', tr('Shine a torch through it')),
        LabToggle('nacl', tr('Add a few drops of NaCl solution')),
      ];

  @override
  LabParams act(String action, LabParams p) => action == 'set:sol' ? {...p, 'progress': 0.0, 'nacl': false} : p;

  @override
  List<LabColumn> get columns => [LabColumn(tr('Sol')), LabColumn(tr('Type')), LabColumn(tr('Appearance')), LabColumn(tr('Tyndall effect')), LabColumn(tr('With NaCl'))];

  @override
  LabReading read(LabParams p) {
    final s = pStr(p, 'sol', 'feoh3');
    if (pNum(p, 'progress') < 0.95) return LabReading.not(tr('Finish preparing it first.'));
    if (!pBool(p, 'beam')) return LabReading.not(tr('Shine the torch through it to look for the Tyndall effect.'));
    final tyndall = s == 'nacl' ? tr('No: the beam cannot be seen') : tr('Yes: the beam’s path glows');
    final salt = !pBool(p, 'nacl') ? tr('Not tested') : (lyophobic(s) ? tr('Coagulates and settles') : (s == 'nacl' ? tr('No change') : tr('Stays stable')));
    return LabReading.row([solName(s), typeOf(s), appearance(s), tyndall, salt]);
  }

  @override
  List<String> live(LabParams p) => [method(pStr(p, 'sol', 'feoh3')), '${(pNum(p, 'progress') * 100).round()}%'];

  @override
  List<LabParams> demo(LabParams start) => [for (final s in sols) {...start, 'sol': s, 'progress': 1.0, 'beam': true, 'nacl': true}];

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final phobic = [for (final r in rows) if (r[1] == tr('Lyophobic sol')) r[0]];
    final philic = [for (final r in rows) if (r[1] == tr('Lyophilic sol')) r[0]];
    final out = <String>[];
    if (philic.isNotEmpty) out.add(tr('Lyophilic: {s}. They form directly, scatter light and stay stable with a little electrolyte.', {'s': philic.join(', ')}));
    if (phobic.isNotEmpty) out.add(tr('Lyophobic: {s}. They need special methods, scatter light and coagulate with a little electrolyte.', {'s': phobic.join(', ')}));
    if (rows.any((r) => r[1] == tr('True solution'))) out.add(tr('The true solution shows no Tyndall effect: its particles are too small to scatter light.'));
    return out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final s = pStr(p, 'sol', 'feoh3');
    final prog = pNum(p, 'progress');
    final ground = h * 0.88;
    Kit.table(canvas, Rect.fromLTWH(0, ground, w, h * 0.12));
    final heat = s == 'starch' || s == 'feoh3' || s == 'gum';
    final bc = Offset(w * 0.4, ground - (heat ? h * 0.26 : 0));
    final bw = w * 0.17, bh = h * 0.3;
    if (heat) {
      Kit.tripod(canvas, Offset(bc.dx, ground), bw * 1.3, h * 0.26);
      Kit.burner(canvas, Offset(bc.dx, ground), h * 0.2, lit: prog < 1.0 || s == 'feoh3', t: t);
    }
    final settled = pBool(p, 'nacl') && lyophobic(s) && prog >= 0.95;
    final liquid = settled ? const Color(0x33F4E8DC) : Color.lerp(const Color(0x5578B7E0), colour(s), prog)!;
    Glass.beaker(canvas, bc, bw, bh, liquid, fillFraction: 0.62);
    if (settled) {
      canvas.drawRect(Rect.fromLTWH(bc.dx - bw / 2 + 2, bc.dy - bh * 0.07, bw - 4, bh * 0.07 - 2), fill(s == 'feoh3' ? const Color(0xFF8D3A16) : const Color(0xFFE6E9EC)));
    }
    final top = bc.dy - bh * 0.62;
    // Dropping funnel for the dropwise methods.
    if (s == 'feoh3' && prog < 1.0) {
      final fx = bc.dx + bw * 0.18;
      canvas.drawPath(
          Path()
            ..moveTo(fx - 26, h * 0.06)
            ..lineTo(fx + 26, h * 0.06)
            ..lineTo(fx + 5, h * 0.18)
            ..lineTo(fx - 5, h * 0.18)
            ..close(),
          fill(const Color(0x99E0A040)));
      canvas.drawLine(Offset(fx, h * 0.18), Offset(fx, bc.dy - bh - 6), stroke(LabInk.ink, 2));
      final dy = (t * 160) % (top - (bc.dy - bh));
      canvas.drawCircle(Offset(fx, bc.dy - bh + dy), 4, fill(const Color(0xFFE0A040)));
      label(canvas, '2% FeCl₃', Offset(fx + 60, h * 0.1), size: 14, bold: true);
    }
    // Steam over boiling water.
    if (heat && prog < 1.0) {
      for (var i = 0; i < 4; i++) {
        final y = top - 20 - ((t * 30 + i * 22) % 80);
        canvas.drawCircle(Offset(bc.dx - bw * 0.25 + i * bw * 0.16, y), 6, fill(const Color(0x22808080)));
      }
    }
    // The comparison beaker: a true solution.
    final cc = Offset(w * 0.72, ground);
    if (s != 'nacl') Glass.beaker(canvas, cc, bw * 0.8, bh * 0.85, const Color(0x5578B7E0), fillFraction: 0.62);
    // Torch beam.
    if (pBool(p, 'beam')) {
      final torch = Offset(w * 0.08, top + bh * 0.33);
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: torch - const Offset(26, 0), width: 70, height: 26), const Radius.circular(6)), fill(const Color(0xFF37474F)));
      canvas.drawRect(Rect.fromCenter(center: torch + const Offset(12, 0), width: 10, height: 34), fill(const Color(0xFF263238)));
      final y = torch.dy;
      final inside = Rect.fromLTRB(bc.dx - bw / 2, y - 16, bc.dx + bw / 2, y + 16);
      canvas.drawPath(
          Path()
            ..moveTo(torch.dx + 16, y - 10)
            ..lineTo(w * 0.95, y - 26)
            ..lineTo(w * 0.95, y + 26)
            ..lineTo(torch.dx + 16, y + 10)
            ..close(),
          fill(const Color(0x10FFF59D)));
      if (s != 'nacl' && prog > 0.5 && !settled) {
        canvas.drawRect(inside, Paint()..shader = LinearGradient(colors: [const Color(0xEEFFF8C4), const Color(0x88FFF59D).withValues(alpha: 0.5 * prog)]).createShader(inside));
      }
      label(canvas, s != 'nacl' && prog > 0.5 && !settled ? tr('The beam’s path glows') : tr('No beam seen'), Offset(bc.dx, top - 34), size: 15, bold: true, halo: LabInk.paper);
      if (s != 'nacl') label(canvas, tr('No beam seen'), Offset(cc.dx, cc.dy - bh * 0.85 - 20), size: 13, color: LabInk.muted, halo: LabInk.paper);
    }
    label(canvas, solName(s), Offset(bc.dx, ground + 26), size: 16, bold: true);
    if (s != 'nacl') label(canvas, tr('True solution'), Offset(cc.dx, ground + 26), size: 14, color: LabInk.muted);
    Kit.card(canvas, Offset(w * 0.6, h * 0.05), w * 0.36, typeOf(s), [method(s), if (prog >= 0.95) appearance(s)], size: 14);
  }
}

// ------------------------------------------------ melting/boiling point

/// Melting point (capillary in a Thiele tube) or boiling point (Siwoloboff:
/// an inverted capillary in a fusion tube) of an organic compound.
class MeltingPointBench extends LabBench with LabDemo {
  const MeltingPointBench();

  static const mp = <String, double>{'naphthalene': 80.0, 'acetanilide': 114.0, 'benzoic': 122.0, 'urea': 133.0};
  static const bp = <String, double>{'acetone': 56.0, 'methanol': 65.0, 'ethanol': 78.0, 'water': 100.0};

  static String name(String c) => switch (c) {
        'naphthalene' => tr('Naphthalene'),
        'acetanilide' => tr('Acetanilide'),
        'benzoic' => tr('Benzoic acid'),
        'urea' => tr('Urea'),
        'acetone' => tr('Acetone'),
        'methanol' => tr('Methanol'),
        'ethanol' => tr('Ethanol'),
        _ => tr('Water'),
      };

  @override
  String get kind => 'melting-point';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'task': 'mp', 'compound': 'naphthalene', 'temp': 30.0};

  @override
  LabParams get preview => {...defaults, 'temp': 80.0};

  static bool boiling(LabParams p) => pStr(p, 'task', 'mp') == 'bp';
  static Map<String, double> table(LabParams p) => boiling(p) ? bp : mp;
  static String compound(LabParams p) {
    final c = pStr(p, 'compound');
    return table(p).containsKey(c) ? c : table(p).keys.first;
  }

  static double point(LabParams p) => table(p)[compound(p)]!;

  /// 0 solid / no bubbles … 1 fully melted / steady stream.
  static double state(LabParams p) => ((pNum(p, 'temp', 30) - (point(p) - 1.5)) / 1.5).clamp(0.0, 1.0);

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('compound', tr('Compound'), [for (final c in table(p).keys) (c, name(c))]),
        LabSlider('temp', tr('Bath temperature'), 25, 150, divisions: 250, unit: ' °C', decimals: 1),
      ];

  @override
  List<LabColumn> get columns => [LabColumn(tr('Compound')), LabColumn(tr('Observed (°C)'), 1), LabColumn(tr('Literature (°C)'), 1), LabColumn(tr('Difference (°C)'), 1)];

  @override
  LabReading read(LabParams p) {
    final tt = pNum(p, 'temp', 30), pt = point(p);
    if (tt < pt - 0.6) return LabReading.not(boiling(p) ? tr('Only a few slow bubbles: keep heating gently.') : tr('Still solid: keep heating slowly, about 2 °C a minute near the melting point.'));
    if (tt > pt + 0.6) return LabReading.not(boiling(p) ? tr('Too hot: let it cool and note the temperature when the stream of bubbles just stops.') : tr('It has melted below this: let the bath cool and repeat with a fresh capillary, heating slowly.'));
    return LabReading.row([name(compound(p)), tt, pt, tt - pt]);
  }

  @override
  List<String> live(LabParams p) {
    final s = state(p);
    return [
      '${pNum(p, 'temp', 30).toStringAsFixed(1)} °C',
      boiling(p)
          ? (s >= 1 ? tr('A rapid, steady stream of bubbles') : (s > 0 ? tr('Bubbles start to come out') : tr('No bubbles yet')))
          : (s >= 1 ? tr('Completely melted: clear liquid') : (s > 0 ? tr('Shrinking and softening') : tr('White solid'))),
    ];
  }

  @override
  List<LabParams> demo(LabParams start) {
    final keys = table(start).keys.toList();
    return [
      for (final c in keys.take(3))
        for (final d in [-0.5, 0.0, 0.5]) {...start, 'compound': c, 'temp': table(start)[c]! + d},
    ];
  }

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final out = <String>[];
    final names = {for (final r in rows) r[0]};
    for (final n in names) {
      final vs = [for (final r in rows) if (r[0] == n) (r[1] as num).toDouble()];
      final lit = [for (final r in rows) if (r[0] == n) (r[2] as num).toDouble()].first;
      final m = meanSe(vs);
      out.add(tr('{c}: {t} °C (literature {l} °C).', {'c': '$n', 't': pm(m.mean, m.se), 'l': lit.toStringAsFixed(0)}));
    }
    out.add(tr('A pure compound melts or boils sharply, within about 1 °C; impurities lower the melting point and widen the range.'));
    return out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final ground = h * 0.9;
    Kit.table(canvas, Rect.fromLTWH(0, ground, w, h * 0.1));
    final temp = pNum(p, 'temp', 30);
    final s = state(p);
    // Stand and Thiele tube.
    final rodTop = Kit.stand(canvas, Offset(w * 0.12, ground), h * 0.86);
    final tc = Offset(w * 0.32, h * 0.52);
    final tw = h * 0.06;
    final tube = Path()
      ..moveTo(tc.dx - tw, tc.dy - h * 0.3)
      ..lineTo(tc.dx - tw, tc.dy + h * 0.16)
      ..quadraticBezierTo(tc.dx - tw, tc.dy + h * 0.25, tc.dx, tc.dy + h * 0.25)
      ..quadraticBezierTo(tc.dx + h * 0.18, tc.dy + h * 0.25, tc.dx + h * 0.18, tc.dy + h * 0.06)
      ..quadraticBezierTo(tc.dx + h * 0.18, tc.dy - h * 0.08, tc.dx + tw, tc.dy - h * 0.1);
    canvas.drawPath(tube, stroke(const Color(0x66E8D9A8), tw * 1.6));
    canvas.drawPath(tube, stroke(const Color(0xFF4A86B0), 1.4));
    canvas.drawRect(Rect.fromLTRB(rodTop.dx, tc.dy - h * 0.28, tc.dx - tw - 8, tc.dy - h * 0.25), fill(const Color(0xFF3A3F46)));
    // Burner under the side arm.
    final temperatureHot = temp > 40;
    Kit.burner(canvas, Offset(tc.dx + h * 0.18, ground), h * 0.2, lit: temperatureHot, t: t);
    // Thermometer down the tube.
    final th = Rect.fromLTWH(tc.dx - 6, h * 0.04, 12, tc.dy + h * 0.06 - h * 0.04);
    canvas.drawRRect(RRect.fromRectAndRadius(th, const Radius.circular(6)), fill(Colors.white));
    canvas.drawRRect(RRect.fromRectAndRadius(th, const Radius.circular(6)), stroke(LabInk.ink, 1.2));
    canvas.drawCircle(Offset(th.center.dx, th.bottom), 10, fill(LabInk.red));
    double yOf(double c) => th.bottom - 18 - (c - 20) / 140 * (th.height - 40);
    canvas.drawRect(Rect.fromLTRB(th.center.dx - 2.5, yOf(temp), th.center.dx + 2.5, th.bottom), fill(LabInk.red));
    for (var c = 20; c <= 160; c += 10) {
      canvas.drawLine(Offset(th.right, yOf(c.toDouble())), Offset(th.right + (c % 50 == 0 ? 10 : 6), yOf(c.toDouble())), stroke(LabInk.ink, 1));
      if (c % 20 == 0) label(canvas, '$c', Offset(th.right + 24, yOf(c.toDouble())), size: 11, color: LabInk.muted);
    }
    // Capillary or fusion tube tied beside the bulb.
    final cap = Rect.fromLTWH(th.left - 14, th.bottom - 70, 8, 64);
    canvas.drawRect(cap, stroke(LabInk.ink, 1));
    canvas.drawLine(Offset(cap.left - 2, cap.top + 20), Offset(th.right + 2, cap.top + 20), stroke(const Color(0xFFB71C1C), 2));
    label(canvas, '${temp.toStringAsFixed(1)} °C', Offset(th.right + 70, yOf(temp)), size: 17, bold: true, color: LabInk.red, halo: LabInk.paper);
    // Magnified capillary.
    final mc = Offset(w * 0.75, h * 0.45), mr = math.min(w * 0.17, h * 0.3);
    Kit.magnifier(canvas, mc, mr, (c) {
      c.drawRect(Rect.fromCircle(center: mc, radius: mr), fill(const Color(0xFFF7F0D8)));
      if (!boiling(p)) {
        final glass = Rect.fromCenter(center: mc, width: mr * 0.32, height: mr * 1.8);
        c.drawRect(glass, fill(const Color(0x33FFFFFF)));
        c.drawRect(glass, stroke(const Color(0xFF4A86B0), 2));
        final fillTop = mc.dy + mr * 0.25;
        final solidH = (mr * 0.65) * (1 - 0.35 * s);
        final rnd = math.Random(3);
        if (s < 1) {
          for (var i = 0; i < 70; i++) {
            final x = glass.left + 4 + rnd.nextDouble() * (glass.width - 8);
            final y = glass.bottom - 2 - rnd.nextDouble() * solidH;
            c.drawCircle(Offset(x, y), 3.5 * (1 - s * 0.6), fill(Color.lerp(const Color(0xFFF5F5F5), const Color(0xFFDADADA), rnd.nextDouble())!));
            c.drawCircle(Offset(x, y), 3.5 * (1 - s * 0.6), stroke(const Color(0xFFBDBDBD), 0.6));
          }
        }
        if (s > 0) {
          final lh = mr * 0.42 * s;
          c.drawRect(Rect.fromLTRB(glass.left + 2, glass.bottom - lh, glass.right - 2, glass.bottom - 2), fill(const Color(0x88FFF8E1)));
          c.drawArc(Rect.fromLTRB(glass.left + 2, glass.bottom - lh - 6, glass.right - 2, glass.bottom - lh + 6), math.pi, math.pi, false, stroke(const Color(0xFF8D6E63), 1.4));
        }
        label(c, tr('Capillary, sealed at the bottom'), Offset(mc.dx, mc.dy - mr * 0.8), size: 13, color: LabInk.muted);
        if (fillTop < 0) c.drawRect(Rect.zero, fill(Colors.transparent));
      } else {
        final ft = Rect.fromCenter(center: mc + Offset(0, mr * 0.1), width: mr * 0.6, height: mr * 1.6);
        c.drawRect(Rect.fromLTRB(ft.left, ft.bottom - mr * 0.5, ft.right, ft.bottom), fill(const Color(0x7778B7E0)));
        c.drawRect(ft, stroke(const Color(0xFF4A86B0), 2));
        final ic = Rect.fromCenter(center: Offset(mc.dx, ft.bottom - mr * 0.5), width: mr * 0.12, height: mr * 0.9);
        c.drawRect(ic, stroke(LabInk.ink, 1.5));
        final n = (s * 8).round();
        for (var i = 0; i < n; i++) {
          final y = ic.bottom - ((t * 90 * (0.5 + s) + i * 18) % (mr * 0.5));
          c.drawCircle(Offset(mc.dx + math.sin(i * 1.7) * 3, y), 4, stroke(const Color(0xFF1565C0), 1.6));
        }
        label(c, tr('Inverted capillary in the liquid'), Offset(mc.dx, mc.dy - mr * 0.8), size: 13, color: LabInk.muted);
      }
    }, caption: live(p)[1]);
    label(canvas, '${name(compound(p))} · ${boiling(p) ? tr('boiling point') : tr('melting point')}', Offset(w * 0.05, h * 0.05), size: 18, bold: true, centre: false);
  }
}

// -------------------------------------------------------- Daniell cell

/// Zn | Zn²⁺(c₁) || Cu²⁺(c₂) | Cu with a salt bridge: E = E° − (0.0591/2) log(c₁/c₂) at 25 °C.
class DaniellCellBench extends LabBench with LabDemo {
  const DaniellCellBench();

  static const e0 = 1.10;
  static const concs = [0.001, 0.01, 0.05, 0.1, 0.5, 1.0];

  @override
  String get kind => 'daniell-cell';

  @override
  LabParams get defaults => {'zn': 1.0, 'cu': 1.0, 'bridge': false};

  @override
  LabParams get preview => {...defaults, 'bridge': true, 'zn': 0.1};

  static double emf(LabParams p) {
    if (!pBool(p, 'bridge')) return 0;
    final q = pNum(p, 'zn', 1) / pNum(p, 'cu', 1);
    return e0 - 0.0591 / 2 * math.log(q) / math.ln10;
  }

  /// The voltmeter reads to a millivolt, with a millivolt or two of junction potential.
  static double measured(LabParams p) {
    final noise = (hash01((pNum(p, 'zn', 1) * 1000).round(), (pNum(p, 'cu', 1) * 1000).round()) - 0.5) * 0.004;
    return ((emf(p) + (pBool(p, 'bridge') ? noise : 0)) * 1000).round() / 1000;
  }

  static String _c(double c) => c >= 0.1 ? c.toStringAsFixed(1) : c.toString();

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('zn', tr('[Zn²⁺] in the zinc half-cell'), [for (final c in concs) (c, '${_c(c)} M')]),
        LabChoice('cu', tr('[Cu²⁺] in the copper half-cell'), [for (final c in concs) (c, '${_c(c)} M')]),
        LabToggle('bridge', tr('Salt bridge in place')),
      ];

  @override
  List<LabColumn> get columns => [LabColumn('[Zn²⁺] (M)', 3), LabColumn('[Cu²⁺] (M)', 3), LabColumn('log([Zn²⁺]/[Cu²⁺])', 2), LabColumn(tr('E measured (V)'), 3), LabColumn(tr('E Nernst (V)'), 3)];

  @override
  LabReading read(LabParams p) {
    if (!pBool(p, 'bridge')) return LabReading.not(tr('No reading without the salt bridge: the circuit is open.'));
    final zn = pNum(p, 'zn', 1), cu = pNum(p, 'cu', 1);
    return LabReading.row([zn, cu, math.log(zn / cu) / math.ln10, measured(p), emf(p)]);
  }

  @override
  List<String> live(LabParams p) => [pBool(p, 'bridge') ? 'E = ${measured(p).toStringAsFixed(3)} V' : tr('Salt bridge out: 0.000 V'), 'E° = 1.10 V'];

  @override
  LabGraph? graph(LabParams p) => const LabGraph(2, 3, line: true, fromZero: false);

  @override
  List<LabParams> demo(LabParams start) => [
        for (final (zn, cu) in [(1.0, 1.0), (0.1, 1.0), (0.01, 1.0), (0.001, 1.0), (1.0, 0.1), (1.0, 0.01)]) {...start, 'zn': zn, 'cu': cu, 'bridge': true},
      ];

  @override
  String? result(List<List<Object>> rows) {
    if (rows.length < 2) return rows.isEmpty ? null : tr('Change a concentration and record again.');
    final f = LinearFit.of([for (final r in rows) (r[2] as num).toDouble()], [for (final r in rows) (r[3] as num).toDouble()]);
    if (f == null) return tr('Change a concentration and record again.');
    return tr('E falls in a straight line as log([Zn²⁺]/[Cu²⁺]) rises: slope {s} V (Nernst: −0.0296 V, so n = {n} electrons), intercept E° = {e} V.', {
      's': pm(f.slope, f.slopeSe),
      'n': (0.0591 / f.slope.abs()).toStringAsFixed(1),
      'e': f.intercept.toStringAsFixed(3),
    });
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final ground = h * 0.88;
    Kit.table(canvas, Rect.fromLTWH(0, ground, w, h * 0.12));
    final bw = w * 0.2, bh = h * 0.36;
    final zc = Offset(w * 0.26, ground), cc = Offset(w * 0.64, ground);
    final cu = pNum(p, 'cu', 1), zn = pNum(p, 'zn', 1);
    final blue = Color.lerp(const Color(0x3378B7E0), const Color(0xCC1E6FD9), (math.log(cu * 1000) / math.log(1000)).clamp(0.0, 1.0))!;
    Glass.beaker(canvas, zc, bw, bh, const Color(0x44D6E4EA), fillFraction: 0.7);
    Glass.beaker(canvas, cc, bw, bh, blue, fillFraction: 0.7);
    // Electrodes.
    final top = ground - bh - h * 0.1;
    final znR = Rect.fromLTWH(zc.dx - bw * 0.22, top, 22, bh * 0.95);
    final cuR = Rect.fromLTWH(cc.dx + bw * 0.22 - 22, top, 22, bh * 0.95);
    canvas.drawRect(znR, Kit.cylinder(znR, const Color(0xFF9EA7AE)));
    canvas.drawRect(cuR, Kit.cylinder(cuR, const Color(0xFFC46A3A)));
    label(canvas, 'Zn', znR.center + Offset(0, bh * 0.25), size: 15, bold: true, color: Colors.white);
    label(canvas, 'Cu', cuR.center + Offset(0, bh * 0.25), size: 15, bold: true, color: Colors.white);
    // Salt bridge.
    if (pBool(p, 'bridge')) {
      final y0 = ground - bh * 0.35, yTop = ground - bh - h * 0.06;
      final bridge = Path()
        ..moveTo(zc.dx + bw * 0.12, y0)
        ..lineTo(zc.dx + bw * 0.12, yTop + 30)
        ..quadraticBezierTo(zc.dx + bw * 0.12, yTop, zc.dx + bw * 0.12 + 30, yTop)
        ..lineTo(cc.dx - bw * 0.12 - 30, yTop)
        ..quadraticBezierTo(cc.dx - bw * 0.12, yTop, cc.dx - bw * 0.12, yTop + 30)
        ..lineTo(cc.dx - bw * 0.12, y0);
      canvas.drawPath(bridge, stroke(const Color(0xCCF2EDE2), 26));
      canvas.drawPath(bridge, stroke(const Color(0xFF4A86B0), 1.2));
      label(canvas, tr('Salt bridge (KCl in agar)'), Offset((zc.dx + cc.dx) / 2, yTop - 24), size: 14, color: LabInk.muted);
    }
    // Voltmeter and leads.
    final vm = Rect.fromCenter(center: Offset((zc.dx + cc.dx) / 2, h * 0.14), width: w * 0.2, height: h * 0.16);
    canvas.drawPath(Path()..moveTo(znR.center.dx, top)..lineTo(znR.center.dx, vm.center.dy)..lineTo(vm.left, vm.center.dy), stroke(LabInk.ink, 2.2));
    canvas.drawPath(Path()..moveTo(cuR.center.dx, top)..lineTo(cuR.center.dx, vm.center.dy)..lineTo(vm.right, vm.center.dy), stroke(LabInk.red, 2.2));
    canvas.drawRRect(RRect.fromRectAndRadius(vm, const Radius.circular(10)), fill(const Color(0xFFF2B233)));
    final lcd = vm.deflate(14).translate(0, -4);
    canvas.drawRRect(RRect.fromRectAndRadius(lcd, const Radius.circular(4)), fill(const Color(0xFFB9C6A2)));
    label(canvas, '${measured(p).toStringAsFixed(3)} V', lcd.center, size: math.min(34, lcd.height * 0.62), bold: true, color: const Color(0xFF1B2A12));
    label(canvas, '−', Offset(vm.left + 12, vm.bottom - 10), size: 14, bold: true);
    label(canvas, '+', Offset(vm.right - 12, vm.bottom - 10), size: 14, bold: true);
    label(canvas, 'ZnSO₄ ${_c(zn)} M', Offset(zc.dx, ground + 24), size: 15, bold: true);
    label(canvas, 'CuSO₄ ${_c(cu)} M', Offset(cc.dx, ground + 24), size: 15, bold: true);
    label(canvas, tr('Anode (−)'), Offset(zc.dx - bw * 0.62, ground - bh * 0.5), size: 13, color: LabInk.muted);
    label(canvas, tr('Cathode (+)'), Offset(cc.dx + bw * 0.62, ground - bh * 0.5), size: 13, color: LabInk.muted);
    Kit.card(canvas, Offset(w * 0.8, h * 0.06), w * 0.18, 'Nernst', ['E = E° − (0.0591/2) log([Zn²⁺]/[Cu²⁺])', 'E° = 1.10 V'], size: 13);
  }
}
