import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bench.dart';
import 'kit.dart';

/// Electrolysis and conductance: Faraday's laws at an electrolytic cell, and molar conductivity
/// against concentration for strong and weak electrolytes (Kohlrausch).

const _f = 96485.0;
const _metals = [('Cu', 'Cu²⁺', 2, 63.55, Color(0xFFB8733A), Color(0xFFB9D5F0)), ('Ag', 'Ag⁺', 1, 107.87, Color(0xFFC4CAD4), Color(0xFFEFF4FA)), ('Ni', 'Ni²⁺', 2, 58.69, Color(0xFF8C9890), Color(0xFFCFE8D2)), ('Zn', 'Zn²⁺', 2, 65.38, Color(0xFF9EA6B4), Color(0xFFEFF4FA)), ('Al', 'Al³⁺', 3, 26.98, Color(0xFFC6CCD6), Color(0xFFEFF4FA))];

class _El {
  const _El(this.name, this.l0, this.a, {this.ka});
  final String name;
  final double l0, a; // S cm² mol⁻¹, slope
  final double? ka;
  double lm(double c) {
    if (ka == null) return l0 - a * math.sqrt(c);
    final alpha = (-ka! + math.sqrt(ka! * ka! + 4 * ka! * c)) / (2 * c);
    return alpha * l0;
  }
}

const _els = [_El('KCl', 149.9, 94.0), _El('NaCl', 126.4, 89.0), _El('HCl', 425.9, 160.0), _El('CH₃COOH', 390.5, 0, ka: 1.8e-5)];

final Map<String, Mode> electrolysisModes = {
  'faraday': Mode(
    title: "Faraday's laws of electrolysis",
    subtitle: 'Electrochemistry · Electrolysis',
    formula: 'm = (I t / zF) × M',
    titleOf: (v) => 'Depositing ${_metals[v.i('m').clamp(0, 4)].$1} at the cathode',
    defaults: {'m': 0, 'I': 2, 't': 30},
    tick: (v, dt) {
      v['t'] = math.min(120, v.g('t') + dt * 12);
      if (v.g('t') >= 120) v['_run'] = 0;
    },
    knobs: [
      Pick('m', 'Metal ion', [for (final x in _metals) x.$2], ids: [for (final x in _metals) x.$1], chips: true),
      const Slide('I', 'Current I', 0.1, 10, unit: 'A', digits: 1, step: 0.1),
      const Slide('t', 'Time t', 0, 120, unit: 'min', digits: 0, step: 1),
      Act('Switch on', (v) {
        v['t'] = 0;
        v['_run'] = 1;
      }, icon: Icons.power_settings_new_rounded),
    ],
    readouts: (v) {
      final x = _metals[v.i('m').clamp(0, 4)];
      final q = v.g('I', 2) * v.g('t', 30) * 60;
      return [Readout('Charge Q = It', q.toStringAsFixed(0), 'C', IX.amber), Readout('Moles of e⁻', (q / _f).toStringAsFixed(4), 'mol'), Readout('Mass of ${x.$1}', (q / (x.$3 * _f) * x.$4).toStringAsFixed(3), 'g', IX.accent), Readout('Electrochemical equivalent', sx(x.$4 / (x.$3 * _f)), 'g/C')];
    },
    paint: (c, s, v) {
      final x = _metals[v.i('m').clamp(0, 4)];
      final q = v.g('I', 2) * v.g('t', 30) * 60;
      final mass = q / (x.$3 * _f) * x.$4;
      final b = Rect.fromLTWH(70, 170, s.width * 0.36, s.height - 290);
      final liq = beaker(c, b, 0.78, x.$6, label: '${x.$2} solution');
      final cat = Rect.fromLTWH(b.left + b.width * 0.22, 110, 40, b.height + 20), an = Rect.fromLTWH(b.right - b.width * 0.22 - 40, 110, 40, b.height + 20);
      c.drawRect(cat, fill(const Color(0xFF8C93A6)));
      final dep = (mass * 4).clamp(0.0, 14.0);
      c.drawRect(Rect.fromLTRB(cat.left - dep, liq.top + 10, cat.right + dep, cat.bottom), fill(x.$5));
      c.drawRect(an, fill(const Color(0xFF6F7585)));
      lbl(c, 'cathode (−)', Offset(cat.center.dx, 86), size: 17, color: IX.accent, w: FontWeight.w600);
      lbl(c, 'anode (+)', Offset(an.center.dx, 86), size: 17, color: IX.positive, w: FontWeight.w600);
      // Battery and ammeter.
      final y = 50.0;
      c.drawLine(Offset(cat.center.dx, 110), Offset(cat.center.dx, y), stroke(IX.ink, 4));
      c.drawLine(Offset(an.center.dx, 110), Offset(an.center.dx, y), stroke(IX.ink, 4));
      c.drawLine(Offset(cat.center.dx, y), Offset(b.center.dx - 20, y), stroke(IX.ink, 4));
      c.drawLine(Offset(b.center.dx + 20, y), Offset(an.center.dx, y), stroke(IX.ink, 4));
      c.drawLine(Offset(b.center.dx - 12, y - 26), Offset(b.center.dx - 12, y + 26), stroke(IX.ink, 4));
      c.drawLine(Offset(b.center.dx + 12, y - 14), Offset(b.center.dx + 12, y + 14), stroke(IX.ink, 7));
      lbl(c, '${v.g('I', 2).toStringAsFixed(1)} A', Offset(b.center.dx, y + 44), size: 18, color: IX.ink, w: FontWeight.w700, halo: true);
      for (var i = 0; i < 14; i++) {
        final p = Offset(liq.left + 90 + rnd(i, 111) * (liq.width - 180), liq.top + 30 + rnd(i, 112) * (liq.height - 60));
        tag(c, x.$2, p, IX.accent, size: 13);
      }
      lbl(c, '${x.$2} + ${x.$3 == 1 ? '' : x.$3}e⁻ → ${x.$1}(s)', Offset(b.center.dx, b.bottom + 64), size: 22, color: IX.ink, w: FontWeight.w600);
      final pr = Rect.fromLTWH(s.width * 0.55, 70, s.width * 0.4, s.height - 180);
      final pl = Plot(pr, 0, 120, 0, v.g('I', 2) * 7200 / _f * 107.87 * 1.08);
      pl.axes(c, x: 'Time (min)', y: 'Mass deposited (g)', dx: 20, title: 'Same charge, mass ∝ M / z');
      for (final (k, m) in _metals.indexed) {
        pl.curve(c, (t) => v.g('I', 2) * t * 60 / (m.$3 * _f) * m.$4, k == v.i('m') ? IX.accent : IX.rule, w: k == v.i('m') ? 4.5 : 2.5);
        final end = pl.p(120, v.g('I', 2) * 120 * 60 / (m.$3 * _f) * m.$4);
        if (pr.inflate(2).contains(end)) lbl(c, m.$1, end + const Offset(10, 0), size: 15, color: k == v.i('m') ? IX.accent : IX.muted, align: Alignment.centerLeft, w: FontWeight.w600);
      }
      pl.dot(c, v.g('t', 30), mass, IX.amber, label: '${mass.toStringAsFixed(3)} g');
    },
    presets: {'Cu, 2 A, 30 min': {'m': 0, 'I': 2, 't': 30}, 'Ag, 1 A, 60 min': {'m': 1, 'I': 1, 't': 60}, 'Cu, 10 A, 2 h': {'m': 0, 'I': 10, 't': 120}},
  ),
  'conductance': Mode(
    title: 'Molar conductivity and dilution',
    subtitle: 'Electrochemistry · Conductance of solutions',
    formula: 'Λm = κ / c,   strong: Λm = Λ°m − A√c',
    titleOf: (v) => 'Molar conductivity of ${_els[v.i('el').clamp(0, 3)].name}',
    defaults: {'el': 0, 'c': 0.01},
    knobsOf: (v) {
      final i = v.i('el').clamp(0, 3), e = _els[i];
      final weak = e.ka != null;
      v.putIfAbsent('L0$i', () => e.l0);
      v.putIfAbsent('A$i', () => e.a);
      return [
        Pick('el', 'Electrolyte', [for (final e in _els) e.name], ids: [for (final e in _els) ascii(e.name)]),
        const Slide('c', 'Concentration c', 0.0005, 0.04, unit: 'mol/L', digits: 4, step: 0.0005),
        if (!weak) Slide('L0$i', 'Limiting molar conductivity Λ°m', 50, 450, unit: 'S cm² mol⁻¹', digits: 1, step: 0.5),
        if (!weak) Slide('A$i', 'Slope A', 0, 200, digits: 0, step: 1),
        if (weak) const Note('Kohlrausch: Λ°m(CH₃COOH) = Λ°(HCl) + Λ°(CH₃COONa) − Λ°(NaCl) = 425.9 + 91.0 − 126.4 = 390.5 S cm² mol⁻¹.'),
      ];
    },
    readouts: (v) {
      final e = _el(v), c0 = v.g('c', 0.01);
      final lm = e.lm(c0);
      return [Readout('Λm', lm.toStringAsFixed(1), 'S cm² mol⁻¹', IX.accent), Readout('κ = Λm c / 1000', (lm * c0 / 1000).toStringAsFixed(5), 'S cm⁻¹', IX.amber), Readout('Λ°m', e.l0.toStringAsFixed(1), 'S cm² mol⁻¹'), Readout(e.ka == null ? 'Strong electrolyte' : 'Degree of dissociation α', e.ka == null ? 'fully ionised' : (lm / e.l0).toStringAsFixed(3), '', IX.green)];
    },
    paint: (c, s, v) {
      final e = _el(v), c0 = v.g('c', 0.01);
      final b = Rect.fromLTWH(70, 150, s.width * 0.28, s.height - 280);
      final liq = beaker(c, b, 0.78, const Color(0xFFEFF5FB), label: '${e.name}  ${c0.toStringAsFixed(4)} M');
      c.drawRect(Rect.fromLTWH(b.center.dx - 70, liq.top + 40, 12, liq.height - 80), fill(const Color(0xFF8C93A6)));
      c.drawRect(Rect.fromLTWH(b.center.dx + 58, liq.top + 40, 12, liq.height - 80), fill(const Color(0xFF8C93A6)));
      lbl(c, 'platinised Pt electrodes', Offset(b.center.dx, b.top - 22), size: 15, color: IX.inkSoft);
      final ions = e.ka == null ? (c0 / 0.04 * 20).round().clamp(2, 20) : ((e.lm(c0) / e.l0) * c0 / 0.04 * 20 * 6).round().clamp(1, 20);
      final mol = e.ka == null ? 0 : ((1 - e.lm(c0) / e.l0) * c0 / 0.04 * 20).round().clamp(0, 18);
      for (var i = 0; i < ions; i++) {
        final p = Offset(liq.left + 28 + rnd(i, 121) * (liq.width - 56), liq.top + 24 + rnd(i, 122) * (liq.height - 48));
        tag(c, '+', p, IX.positive, size: 13);
        tag(c, '−', p + Offset(22 + rnd(i, 123) * 30, 18), IX.accent, size: 13);
      }
      for (var i = 0; i < mol; i++) {
        ball(c, Offset(liq.left + 28 + rnd(i, 124) * (liq.width - 56), liq.top + 24 + rnd(i, 125) * (liq.height - 48)), 8, IX.steel);
      }
      if (e.ka != null) lbl(c, 'grey: un-ionised CH₃COOH', Offset(b.center.dx, b.bottom + 56), size: 15, color: IX.muted);
      final pr = Rect.fromLTWH(s.width * 0.45, 70, s.width * 0.5, s.height - 180);
      final pl = Plot(pr, 0, 0.2, 0, math.max(450, e.l0 * 1.1));
      pl.axes(c, x: '√c  (mol/L)^½', y: 'Λm (S cm² mol⁻¹)', dx: 0.05, dy: 100);
      for (final x in _els) {
        if (x.name == e.name) continue;
        pl.curve(c, (r) => x.lm(math.max(r * r, 1e-7)), IX.rule, w: 2.5, from: 0.003);
        lbl(c, x.name, pl.p(0.2, x.lm(0.04)) + const Offset(-6, -14), size: 14, color: IX.muted, align: Alignment.centerRight);
      }
      pl.curve(c, (r) => e.lm(math.max(r * r, 1e-7)), IX.accent, from: 0.003);
      if (e.ka == null) pl.curve(c, (r) => e.l0 - e.a * r, IX.accent, dash: true, w: 2, to: 0.05);
      pl.dot(c, 0, e.l0, IX.green, label: 'Λ°m ${e.l0.toStringAsFixed(1)}', align: Alignment.centerLeft);
      pl.dot(c, math.sqrt(c0), e.lm(c0), IX.amber, label: e.lm(c0).toStringAsFixed(1));
      lbl(c, e.ka == null ? 'Strong: gentle straight-line fall; extrapolate to √c = 0 for Λ°m' : 'Weak: steep rise on dilution as α grows; Λ°m cannot be found by extrapolation', Offset(pr.center.dx, pr.top - 26), size: 17, color: IX.inkSoft, w: FontWeight.w600);
    },
    presets: {'KCl': {'el': 0}, 'HCl': {'el': 2}, 'Acetic acid': {'el': 3, 'c': 0.001}, 'Dilute KCl': {'el': 0, 'c': 0.001}},
  ),
};

_El _el(V v) {
  final i = v.i('el').clamp(0, 3), e = _els[i];
  return e.ka != null ? e : _El(e.name, v.g('L0$i', e.l0), v.g('A$i', e.a));
}
