import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bench.dart';
import 'kit.dart';

/// Electrochemical cells: zinc displacing copper, a galvanic cell from any two electrodes with the
/// Nernst equation, the electrochemical series with ΔG° and K, and the hydrogen–oxygen fuel cell.

class _Ec {
  const _Ec(this.metal, this.ion, this.z, this.e0, this.sol, this.rod);
  final String metal, ion;
  final int z;
  final double e0;
  final Color sol, rod;
}

const _ecs = [
  _Ec('Mg', 'Mg²⁺', 2, -2.36, Color(0xFFEFF4FA), Color(0xFFB9BFC9)),
  _Ec('Al', 'Al³⁺', 3, -1.66, Color(0xFFEFF4FA), Color(0xFFC6CCD6)),
  _Ec('Zn', 'Zn²⁺', 2, -0.76, Color(0xFFEFF4FA), Color(0xFF9EA6B4)),
  _Ec('Fe', 'Fe²⁺', 2, -0.44, Color(0xFFE3F0D8), Color(0xFF6E6A66)),
  _Ec('Ni', 'Ni²⁺', 2, -0.25, Color(0xFFCFE8D2), Color(0xFF8C9890)),
  _Ec('Pb', 'Pb²⁺', 2, -0.13, Color(0xFFEFF4FA), Color(0xFF6F7585)),
  _Ec('H₂', 'H⁺', 1, 0.00, Color(0xFFEFF4FA), Color(0xFFC9CED8)),
  _Ec('Cu', 'Cu²⁺', 2, 0.34, Color(0xFFB9D5F0), Color(0xFFB8733A)),
  _Ec('Ag', 'Ag⁺', 1, 0.80, Color(0xFFEFF4FA), Color(0xFFC4CAD4)),
];
const _ecIds = ['Mg', 'Al', 'Zn', 'Fe', 'Ni', 'Pb', 'H2', 'Cu', 'Ag'];

int _gcd(int a, int b) => b == 0 ? a : _gcd(b, a % b);

/// (anode, cathode, n, E°, E) for electrodes [i], [j] with ion concentrations [ci], [cj].
(_Ec, _Ec, int, double, double, double) _cell(int i, int j, double ci, double cj) {
  var a = _ecs[i], c = _ecs[j];
  var ca = ci, cc = cj;
  if (a.e0 > c.e0) {
    (a, c) = (c, a);
    (ca, cc) = (cc, ca);
  }
  final n = a.z * c.z ~/ _gcd(a.z, c.z);
  final e0 = c.e0 - a.e0;
  final logQ = (n / a.z) * math.log(ca) / math.ln10 - (n / c.z) * math.log(cc) / math.ln10;
  return (a, c, n, e0, e0 - 0.0591 / n * logQ, logQ);
}

void _electrode(Canvas c, Rect rod, Color col, {double deposit = 0, double etch = 0}) {
  final r = Rect.fromLTRB(rod.left + etch * 6, rod.top, rod.right - etch * 6, rod.bottom);
  c.drawRect(r, Paint()..shader = ui.Gradient.linear(r.centerLeft, r.centerRight, [Color.lerp(col, Colors.black, 0.25)!, Color.lerp(col, Colors.white, 0.35)!, Color.lerp(col, Colors.black, 0.2)!], [0, 0.45, 1]));
  if (deposit > 0) {
    for (var i = 0; i < (deposit * 40).round(); i++) {
      final p = Offset(r.left + (rnd(i, 91) < 0.5 ? -2 : r.width + 2), r.top + r.height * 0.35 + rnd(i, 92) * r.height * 0.62);
      c.drawCircle(p, 3 + rnd(i, 93) * 3, fill(const Color(0xFFB0602C)));
    }
  }
}

void _voltmeter(Canvas c, Offset o, double e) {
  c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: o, width: 170, height: 96), const Radius.circular(16)), fill(const Color(0xFF2B3042)));
  c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: o + const Offset(0, -6), width: 140, height: 56), const Radius.circular(8)), fill(const Color(0xFFE4F0DF)));
  lbl(c, '${e.toStringAsFixed(3)} V', o + const Offset(0, -6), size: 28, color: const Color(0xFF1F3B1A), w: FontWeight.w700);
  lbl(c, 'V', o + const Offset(0, 34), size: 14, color: Colors.white70, w: FontWeight.w600);
}

final Map<String, Mode> cellModes = {
  'displacement': Mode(
    title: 'Zinc in copper sulphate',
    subtitle: 'Redox reactions · Electron transfer',
    formula: 'Zn(s) + Cu²⁺(aq) → Zn²⁺(aq) + Cu(s)',
    defaults: {'x': 0.6, 'rev': 0},
    tick: (v, dt) {
      v['x'] = math.min(1, v.g('x') + dt * 0.12);
      if (v.g('x') >= 1) v['_run'] = 0;
    },
    knobs: [
      const Pick('rev', 'Set-up', ['Zn rod in CuSO₄', 'Cu rod in ZnSO₄'], ids: ['zn', 'cu']),
      const Slide('x', 'Extent of reaction', 0, 1, digits: 2, step: 0.01),
      Act('Dip the rod', (v) {
        v['x'] = 0;
        v['_run'] = 1;
      }, icon: Icons.play_arrow_rounded),
      const Note('100 mL of 1 M CuSO₄. Zinc gives up electrons more readily than copper, so only the zinc rod reacts.'),
    ],
    readouts: (v) {
      final rev = v.i('rev') == 1, x = rev ? 0.0 : v.g('x', 0.6);
      return [Readout('Oxidised', rev ? 'nothing' : 'Zn → Zn²⁺ + 2e⁻', '', IX.positive), Readout('Reduced', rev ? 'nothing' : 'Cu²⁺ + 2e⁻ → Cu', '', IX.accent), Readout('Zn dissolved', (6.54 * x).toStringAsFixed(2), 'g'), Readout('Cu deposited', (6.35 * x).toStringAsFixed(2), 'g'), Readout('Electrons moved', sx(0.2 * x * 6.022e23))];
    },
    paint: (c, s, v) {
      final rev = v.i('rev') == 1, x = rev ? 0.0 : v.g('x', 0.6);
      final sol = rev ? const Color(0xFFEFF4FA) : Color.lerp(const Color(0xFF8DB8E6), const Color(0xFFEFF4FA), x)!;
      final b = Rect.fromLTWH(s.width * 0.1, 160, s.width * 0.3, s.height - 260);
      final liq = beaker(c, b, 0.75, sol, label: rev ? 'ZnSO₄(aq): colourless' : x > 0.95 ? 'ZnSO₄(aq): blue colour gone' : 'CuSO₄(aq): blue');
      _electrode(c, Rect.fromLTWH(b.center.dx - 22, 70, 44, b.bottom - 110), rev ? const Color(0xFFB8733A) : const Color(0xFF9EA6B4), deposit: rev ? 0 : x, etch: rev ? 0 : x);
      lbl(c, rev ? 'Cu rod' : 'Zn rod', Offset(b.center.dx, 48), size: 19, color: IX.ink, w: FontWeight.w600);
      for (var i = 0; i < 18; i++) {
        final p = Offset(liq.left + 30 + rnd(i, 94) * (liq.width - 60), liq.top + 30 + rnd(i, 95) * (liq.height - 60));
        if ((p.dx - b.center.dx).abs() < 46) continue;
        final isZn = rev || i < 18 * x;
        tag(c, isZn ? 'Zn²⁺' : 'Cu²⁺', p, isZn ? IX.inkSoft : IX.accent, size: 14);
      }
      // Electron transfer close-up.
      final z = Rect.fromLTWH(s.width * 0.52, 80, s.width * 0.44, s.height - 200);
      panel(c, z, 'At the surface of the rod');
      if (rev) {
        lbl(c, 'Cu cannot reduce Zn²⁺: E°(Cu²⁺/Cu) = +0.34 V', z.center + const Offset(0, -20), size: 22, color: IX.inkSoft, w: FontWeight.w600);
        lbl(c, 'is above E°(Zn²⁺/Zn) = −0.76 V. No reaction.', z.center + const Offset(0, 16), size: 22, color: IX.inkSoft, w: FontWeight.w600);
        return;
      }
      final zn = Offset(z.left + z.width * 0.25, z.center.dy), cu = Offset(z.left + z.width * 0.75, z.center.dy);
      ball(c, zn, 52, const Color(0xFF9EA6B4));
      lbl(c, 'Zn', zn, size: 30, color: Colors.white, w: FontWeight.w700);
      ball(c, cu, 44, IX.accent);
      lbl(c, 'Cu²⁺', cu, size: 26, color: Colors.white, w: FontWeight.w700);
      final t = v.g('_t');
      for (var k = 0; k < 2; k++) {
        final f = ((t * 0.5 + k * 0.5) % 1);
        final p = Offset.lerp(zn + const Offset(56, -20), cu + const Offset(-48, -20), f)! + Offset(0, -math.sin(f * math.pi) * 70);
        ball(c, p, 10, IX.amber);
        lbl(c, 'e⁻', p + const Offset(0, -22), size: 16, color: IX.amber, w: FontWeight.w700);
      }
      lbl(c, 'oxidised: loses 2e⁻', zn + const Offset(0, 90), size: 19, color: IX.positive, w: FontWeight.w600);
      lbl(c, 'reduced: gains 2e⁻', cu + const Offset(0, 90), size: 19, color: IX.accent, w: FontWeight.w600);
      lbl(c, 'Zn is the reducing agent; Cu²⁺ is the oxidising agent.', Offset(z.center.dx, z.bottom - 40), size: 18, color: IX.inkSoft);
    },
    presets: {'Start': {'x': 0.05}, 'Half way': {'x': 0.5}, 'Complete': {'x': 1}, 'Cu rod in ZnSO₄': {'rev': 1}},
  ),
  'galvanic': Mode(
    title: 'Galvanic cell',
    subtitle: 'Electrochemistry · Galvanic cells and the Nernst equation',
    formula: 'E = E° − (0.0591/n) log Q   (298 K)',
    titleOf: (v) {
      final (a, c, _, _, _, _) = _cell(v.i('L', 2), v.i('R', 7), 1, 1);
      return a.metal == 'Zn' && c.metal == 'Cu' ? 'The Daniell cell' : '${a.metal}–${c.metal} cell';
    },
    defaults: {'L': 2, 'R': 7, 'cL': 1, 'cR': 1},
    autoRun: true,
    tick: (v, dt) {},
    knobs: [
      Pick('L', 'Left electrode', [for (final e in _ecs) e.metal], ids: _ecIds, chips: true),
      Pick('R', 'Right electrode', [for (final e in _ecs) e.metal], ids: _ecIds, chips: true),
      const Slide('cL', 'Left ion concentration', 0.001, 2, unit: 'M', digits: 3, step: 0.001),
      const Slide('cR', 'Right ion concentration', 0.001, 2, unit: 'M', digits: 3, step: 0.001),
    ],
    readouts: (v) {
      final i = v.i('L', 2), j = v.i('R', 7);
      final (a, c, n, e0, e, _) = _cell(i, j, v.g('cL', 1), v.g('cR', 1));
      final same = i == j;
      return [
        Readout('E°cell', same ? '0' : e0.toStringAsFixed(2), 'V'),
        Readout('Ecell', same ? '0' : e.toStringAsFixed(3), 'V', IX.accent),
        Readout('Anode (−)', same ? '—' : a.metal, '', IX.positive),
        Readout('Cathode (+)', same ? '—' : c.metal, '', IX.accent),
        Readout('ΔG = −nFE', same ? '0' : (-n * 96485 * e / 1000).toStringAsFixed(1), 'kJ/mol', IX.green),
        Readout('Electrons, n', '$n'),
      ];
    },
    paint: (c, s, v) {
      final i = v.i('L', 2), j = v.i('R', 7);
      final cl = v.g('cL', 1), cr = v.g('cR', 1);
      final (an, ca, n, e0, e, logQ) = _cell(i, j, cl, cr);
      final left = _ecs[i], right = _ecs[j];
      final leftIsAnode = left == an && i != j;
      final bw = s.width * 0.25, bh = s.height * 0.36;
      final lb = Rect.fromLTWH(s.width * 0.1, 210, bw, bh), rb = Rect.fromLTWH(s.width * 0.65, 210, bw, bh);
      for (final (b, el, conc) in [(lb, left, cl), (rb, right, cr)]) {
        final col = Color.lerp(const Color(0xFFEFF4FA), el.sol, (conc / 1).clamp(0.15, 1))!;
        beaker(c, b, 0.78, col, label: '${el.ion}(aq)  ${conc.toStringAsFixed(conc < 0.1 ? 3 : 2)} M');
        if (el.metal == 'H₂') {
          final pt = Rect.fromLTWH(b.center.dx - 26, b.bottom - 150, 52, 70);
          c.drawRect(pt, fill(const Color(0xFF8C93A6)));
          c.drawRect(Rect.fromLTWH(b.center.dx - 4, 120, 8, pt.top - 120), fill(const Color(0xFF8C93A6)));
          for (var k = 0; k < 8; k++) {
            c.drawCircle(Offset(pt.left + rnd(k, 96) * pt.width, pt.top - 10 - rnd(k, 97) * 60), 5, stroke(IX.glassEdge, 1.5));
          }
          lbl(c, 'H₂ (1 bar), Pt', Offset(b.center.dx, 96), size: 17, color: IX.ink, w: FontWeight.w600);
        } else {
          _electrode(c, Rect.fromLTWH(b.center.dx - 22, 120, 44, b.height + 40), el.rod);
          lbl(c, el.metal, Offset(b.center.dx, 96), size: 22, color: IX.ink, w: FontWeight.w700);
        }
      }
      // Salt bridge.
      final sb = Path()
        ..moveTo(lb.right - 50, lb.top + 120)
        ..lineTo(lb.right - 50, lb.top - 40)
        ..lineTo(rb.left + 50, rb.top - 40)
        ..lineTo(rb.left + 50, rb.top + 120);
      c.drawPath(sb, stroke(const Color(0xFFDCE4EE), 34));
      c.drawPath(sb, stroke(IX.glassEdge.withValues(alpha: 0.5), 2));
      lbl(c, 'salt bridge (KCl in agar)', Offset(s.width / 2, lb.top - 72), size: 16, color: IX.inkSoft);
      // Wire and voltmeter.
      final vm = Offset(s.width / 2, 74);
      final wire = Path()..moveTo(lb.center.dx, 120)..lineTo(lb.center.dx, 74)..lineTo(vm.dx - 85, 74);
      final wire2 = Path()..moveTo(vm.dx + 85, 74)..lineTo(rb.center.dx, 74)..lineTo(rb.center.dx, 120);
      c.drawPath(wire, stroke(IX.ink, 4));
      c.drawPath(wire2, stroke(IX.ink, 4));
      _voltmeter(c, vm, i == j ? 0 : e);
      if (i != j) {
        final t = v.g('_t');
        final from = leftIsAnode ? lb.center.dx : rb.center.dx, to = leftIsAnode ? rb.center.dx : lb.center.dx;
        for (var k = 0; k < 6; k++) {
          final f = (t * 0.25 + k / 6) % 1;
          final x = from + (to - from) * f;
          if ((x - vm.dx).abs() < 95) continue;
          ball(c, Offset(x, 74), 7, IX.amber);
        }
        IxPaint.arrow(c, Offset(s.width / 2 + (leftIsAnode ? -260 : 260), 40), Offset(s.width / 2 + (leftIsAnode ? -120 : 120), 40), IX.amber, width: 3);
        lbl(c, 'e⁻ flow', Offset(s.width / 2 + (leftIsAnode ? -300 : 300), 40), size: 16, color: IX.amber, w: FontWeight.w700);
        for (final (b, isAnode) in [(lb, leftIsAnode), (rb, !leftIsAnode)]) {
          tag(c, isAnode ? 'Anode (−) oxidation' : 'Cathode (+) reduction', Offset(b.center.dx, b.bottom + 64), isAnode ? IX.positive : IX.accent, solid: true, size: 16);
        }
      }
      // Cell notation and half reactions.
      final y = s.height - 120;
      if (i != j) {
        String sideA() => an.metal == 'H₂' ? 'Pt(s) | H₂(g, 1 bar) | H⁺(aq)' : '${an.metal}(s) | ${an.ion}(aq)';
        String sideC() => ca.metal == 'H₂' ? 'H⁺(aq) | H₂(g, 1 bar) | Pt(s)' : '${ca.ion}(aq) | ${ca.metal}(s)';
        lbl(c, '${sideA()} || ${sideC()}', Offset(60, y), size: 22, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
        lbl(c, 'E°cell = E°cathode − E°anode = ${ca.e0.toStringAsFixed(2)} − (${an.e0.toStringAsFixed(2)}) = ${e0.toStringAsFixed(2)} V', Offset(60, y + 38), size: 19, color: IX.inkSoft, align: Alignment.centerLeft);
        lbl(c, 'log Q = ${logQ.toStringAsFixed(2)},  n = $n   →   E = ${e.toStringAsFixed(3)} V', Offset(60, y + 72), size: 19, color: IX.inkSoft, align: Alignment.centerLeft);
      } else {
        lbl(c, 'Choose two different electrodes.', Offset(60, y + 20), size: 22, color: IX.inkSoft, align: Alignment.centerLeft);
      }
      // E against log Q.
      final pr = Rect.fromLTWH(s.width * 0.68, s.height - 170, s.width * 0.28, 130);
      if (i != j) {
        final pl = Plot(pr, -4, 4, e0 - 0.25, e0 + 0.25);
        pl.axes(c, x: 'log Q', dx: 2, dy: 0.25, fy: (q) => q.toStringAsFixed(2));
        pl.curve(c, (q) => e0 - 0.0591 / n * q, IX.accent, w: 3);
        pl.dot(c, logQ.clamp(-4, 4), e, IX.amber, r0: 6);
      }
    },
    presets: {'Daniell, 1 M': {'L': 2, 'R': 7, 'cL': 1, 'cR': 1}, 'Daniell, dilute Cu²⁺': {'L': 2, 'R': 7, 'cL': 1, 'cR': 0.01}, 'Daniell, dilute Zn²⁺': {'L': 2, 'R': 7, 'cL': 0.01, 'cR': 1}, 'Cu–Ag': {'L': 7, 'R': 8}, 'Zn–SHE': {'L': 2, 'R': 6}, 'Mg–Ag': {'L': 0, 'R': 8}},
  ),
  'series': Mode(
    title: 'Standard electrode potentials',
    subtitle: 'Electrochemistry · Electrochemical series',
    formula: 'E°cell = E°cathode − E°anode,   ΔG° = −nFE°',
    defaults: {'c': 7, 'a': 2},
    knobs: [
      Pick('c', 'Cathode (reduction)', [for (final e in _ecs) e.metal], ids: _ecIds, chips: true),
      Pick('a', 'Anode (oxidation)', [for (final e in _ecs) e.metal], ids: _ecIds, chips: true),
      const Note('A positive E°cell means the cell reaction is spontaneous as written; the electrode lower in the series is the anode.'),
    ],
    readouts: (v) {
      final cc = _ecs[v.i('c', 7)], a = _ecs[v.i('a', 2)];
      final n = cc.z * a.z ~/ _gcd(cc.z, a.z);
      final e0 = cc.e0 - a.e0;
      final logK = n * e0 / 0.0591;
      return [Readout('E°cell', sgn(e0, 2), 'V', e0 > 0 ? IX.green : IX.positive), Readout('n', '$n'), Readout('ΔG°', (-n * 96485 * e0 / 1000).toStringAsFixed(1), 'kJ/mol', IX.accent), Readout('K', logK.abs() > 300 ? '10^${logK.toStringAsFixed(0)}' : sx(math.pow(10, logK).toDouble())), Readout('Spontaneous?', e0 > 0 ? 'Yes' : e0 < 0 ? 'No (reverse is)' : 'At equilibrium', '', e0 > 0 ? IX.green : IX.positive)];
    },
    paint: (c, s, v) {
      final ci = v.i('c', 7), ai = v.i('a', 2);
      final top = 60.0, bot = s.height - 60;
      double y(double e) => bot - (e + 2.6) / 3.6 * (bot - top);
      final x = s.width * 0.3;
      c.drawLine(Offset(x, top), Offset(x, bot), stroke(IX.ink, 4));
      for (var e = -2.5; e <= 1.0; e += 0.5) {
        c.drawLine(Offset(x - 10, y(e)), Offset(x, y(e)), stroke(IX.ink, 2));
        lbl(c, sgn(e, 1), Offset(x - 18, y(e)), size: 16, color: IX.inkSoft, align: Alignment.centerRight);
      }
      lbl(c, 'E° (V)', Offset(x, top - 30), size: 18, color: IX.ink, w: FontWeight.w600);
      for (final (k, el) in _ecs.indexed) {
        final on = k == ci || k == ai;
        final col = k == ci ? IX.accent : k == ai ? IX.positive : IX.inkSoft;
        c.drawLine(Offset(x, y(el.e0)), Offset(x + 40, y(el.e0)), stroke(col, on ? 4 : 2));
        lbl(c, '${el.ion} + ${el.z == 1 ? '' : el.z}e⁻ → ${el.metal}', Offset(x + 52, y(el.e0)), size: on ? 22 : 18, color: col, w: on ? FontWeight.w700 : FontWeight.w500, align: Alignment.centerLeft);
        lbl(c, sgn(el.e0, 2), Offset(x + 380, y(el.e0)), size: on ? 22 : 17, color: col, w: on ? FontWeight.w700 : FontWeight.w500, align: Alignment.centerLeft);
      }
      final e0 = _ecs[ci].e0 - _ecs[ai].e0;
      if (ci != ai) {
        final ax = x - 120;
        IxPaint.arrow(c, Offset(ax, y(_ecs[ai].e0)), Offset(ax, y(_ecs[ci].e0)), e0 > 0 ? IX.green : IX.positive, width: 5, head: 20);
        lbl(c, 'E°cell\n${sgn(e0, 2)} V', Offset(ax - 20, (y(_ecs[ai].e0) + y(_ecs[ci].e0)) / 2), size: 20, color: e0 > 0 ? IX.green : IX.positive, w: FontWeight.w700, align: Alignment.centerRight);
      }
      lbl(c, 'stronger oxidising agents ↑', Offset(s.width - 40, top + 10), size: 16, color: IX.muted, align: Alignment.centerRight);
      lbl(c, 'stronger reducing agents ↓', Offset(s.width - 40, bot - 10), size: 16, color: IX.muted, align: Alignment.centerRight);
    },
    presets: {'Daniell (Zn | Cu)': {'c': 7, 'a': 2}, 'Ag | Cu': {'c': 8, 'a': 7}, 'Cu | Zn (reversed)': {'c': 2, 'a': 7}, 'Mg | SHE': {'c': 6, 'a': 0}},
  ),
  'fuel': Mode(
    title: 'Hydrogen–oxygen fuel cell',
    subtitle: 'Electrochemistry · Fuel cells',
    formula: '2H₂ + O₂ → 2H₂O,  w_elec = nFE',
    defaults: {'E': 0.9},
    autoRun: true,
    tick: (v, dt) {},
    knobs: const [Slide('E', 'Cell voltage under load', 0.4, 1.23, unit: 'V', digits: 2, step: 0.01), Note('Per mole of H₂: n = 2, ΔH = −285.8 kJ, ΔG° = −237.1 kJ (E° = 1.23 V). The rest of the heat is lost.')],
    readouts: (v) {
      final e = v.g('E', 0.9);
      final w = 2 * 96485 * e / 1000;
      return [Readout('Electrical work', w.toStringAsFixed(1), 'kJ/mol H₂', IX.accent), Readout('Efficiency', (w / 285.8 * 100).toStringAsFixed(1), '%', IX.green), Readout('Heat released', (285.8 - w).toStringAsFixed(1), 'kJ/mol', IX.positive), Readout('Best possible', '83.0', '%')];
    },
    paint: (c, s, v) {
      final e = v.g('E', 0.9);
      final w = 2 * 96485 * e / 1000;
      final cell = Rect.fromLTWH(60, 140, s.width * 0.5, s.height * 0.5);
      c.drawRRect(RRect.fromRectAndRadius(cell, const Radius.circular(20)), fill(const Color(0xFFF3F6FA)));
      c.drawRRect(RRect.fromRectAndRadius(cell, const Radius.circular(20)), stroke(IX.glassEdge, 3));
      final ea = Rect.fromLTWH(cell.left + cell.width * 0.28, cell.top + 20, 26, cell.height - 40), ec = Rect.fromLTWH(cell.right - cell.width * 0.28 - 26, cell.top + 20, 26, cell.height - 40);
      c.drawRect(Rect.fromLTRB(ea.right, cell.top + 20, ec.left, cell.bottom - 20), fill(const Color(0xFFE2ECF7)));
      lbl(c, 'KOH electrolyte', Offset(cell.center.dx, cell.bottom - 44), size: 16, color: IX.inkSoft);
      c.drawRect(ea, fill(const Color(0xFF4B5367)));
      c.drawRect(ec, fill(const Color(0xFF4B5367)));
      final t = v.g('_t');
      for (var k = 0; k < 8; k++) {
        final f = (t * 0.3 + k / 8) % 1;
        tag(c, 'OH⁻', Offset(ec.left - 30 - f * (ec.left - ea.right - 60), cell.top + 60 + (k % 4) * (cell.height - 140) / 3), IX.accent, size: 14);
      }
      for (var k = 0; k < 10; k++) {
        ball(c, Offset(cell.left + 20 + rnd(k, 98) * (ea.left - cell.left - 40), cell.top + 30 + rnd(k, 99) * (cell.height - 60)), 9, const Color(0xFFDDE2EA), outline: true);
        ball(c, Offset(ec.right + 20 + rnd(k, 100) * (cell.right - ec.right - 40), cell.top + 30 + rnd(k, 101) * (cell.height - 60)), 9, elementColor['O']!);
      }
      lbl(c, 'H₂ in', Offset(cell.left + 60, cell.top - 26), size: 19, color: IX.ink, w: FontWeight.w600);
      lbl(c, 'O₂ in', Offset(cell.right - 60, cell.top - 26), size: 19, color: IX.ink, w: FontWeight.w600);
      lbl(c, 'Anode: 2H₂ + 4OH⁻ → 4H₂O + 4e⁻', Offset(cell.left, cell.bottom + 34), size: 18, color: IX.positive, w: FontWeight.w600, align: Alignment.centerLeft);
      lbl(c, 'Cathode: O₂ + 2H₂O + 4e⁻ → 4OH⁻', Offset(cell.left, cell.bottom + 66), size: 18, color: IX.accent, w: FontWeight.w600, align: Alignment.centerLeft);
      // External circuit with a lamp.
      final lamp = Offset(cell.center.dx, 70);
      c.drawLine(Offset(ea.center.dx, ea.top), Offset(ea.center.dx, 70), stroke(IX.ink, 4));
      c.drawLine(Offset(ea.center.dx, 70), lamp - const Offset(34, 0), stroke(IX.ink, 4));
      c.drawLine(lamp + const Offset(34, 0), Offset(ec.center.dx, 70), stroke(IX.ink, 4));
      c.drawLine(Offset(ec.center.dx, 70), Offset(ec.center.dx, ec.top), stroke(IX.ink, 4));
      c.drawCircle(lamp, 46, fill(const Color(0xFFFFE9A8).withValues(alpha: (e / 1.23).clamp(0.2, 1))));
      c.drawCircle(lamp, 30, fill(const Color(0xFFFFF6D6)));
      c.drawCircle(lamp, 30, stroke(IX.amber, 2.5));
      lbl(c, '${e.toStringAsFixed(2)} V', lamp + const Offset(0, 64), size: 18, color: IX.ink, w: FontWeight.w700, halo: true);
      final br = Rect.fromLTWH(s.width * 0.68, 100, s.width * 0.28, s.height - 240);
      bars(c, br, [('Electrical\nwork', w, IX.accent), ('Heat', 285.8 - w, IX.positive), ('ΔH total', 285.8, IX.inkSoft)], max: 320, dy: 50, fmt: (x) => x.toStringAsFixed(0), title: 'kJ per mol H₂');
    },
    presets: {'Ideal 1.23 V': {'E': 1.23}, 'Typical 0.7 V': {'E': 0.7}, 'Heavy load 0.5 V': {'E': 0.5}},
  ),
  'oxnum': Mode(
    title: 'Oxidation number calculator',
    subtitle: 'Redox reactions · Oxidation number',
    formula: 'a·x + (+1)·h + (−2)·o = charge',
    defaults: {'nA': 2, 'nO': 7, 'nH': 2, 'q': 0},
    knobs: [
      const Slide('nA', 'Atoms of element X', 1, 4, digits: 0, step: 1),
      const Slide('nO', 'Oxygen atoms (−2 each)', 0, 10, digits: 0, step: 1),
      const Slide('nH', 'H or alkali-metal atoms (+1 each)', 0, 6, digits: 0, step: 1),
      const Slide('q', 'Overall charge', -3, 3, digits: 0, step: 1),
      const Note('Peroxides (O = −1) and metal hydrides (H = −1) are the exceptions to these rules.'),
    ],
    readouts: (v) {
      final a = v.i('nA', 2), o = v.i('nO', 7), h = v.i('nH', 2), q = v.i('q');
      final x = (q + 2 * o - h) / a;
      return [Readout('Ox. number of X', x == x.roundToDouble() ? sgn(x, 0) : sgn(x, 2), '', IX.accent), Readout('O contributes', nf(-2.0 * o, 0), '', IX.positive), Readout('H / M contribute', '+$h', '', IX.green), Readout('Charge', '$q')];
    },
    paint: (c, s, v) {
      final a = v.i('nA', 2), o = v.i('nO', 7), h = v.i('nH', 2), q = v.i('q');
      final x = (q + 2 * o - h) / a;
      final items = [for (var i = 0; i < h; i++) ('+1', IX.green, 'H/M'), for (var i = 0; i < a; i++) (x == x.roundToDouble() ? sgn(x, 0) : sgn(x, 1), IX.accent, 'X'), for (var i = 0; i < o; i++) ('−2', IX.positive, 'O')];
      final w = math.min(110.0, (s.width - 160) / math.max(1, items.length));
      for (final (i, it) in items.indexed) {
        final at = Offset(s.width / 2 + (i - (items.length - 1) / 2) * w, s.height * 0.3);
        ball(c, at, math.min(46, w * 0.42), it.$2);
        lbl(c, it.$3, at, size: 20, color: Colors.white, w: FontWeight.w700);
        lbl(c, it.$1, at + const Offset(0, 66), size: 22, color: it.$2, w: FontWeight.w700);
      }
      lbl(c, '$a·x + $h(+1) + $o(−2) = $q', Offset(s.width / 2, s.height * 0.58), size: 38, color: IX.ink, w: FontWeight.w700);
      lbl(c, 'x = ($q + ${2 * o} − $h) / $a = ${x.toStringAsFixed(x == x.roundToDouble() ? 0 : 2)}', Offset(s.width / 2, s.height * 0.7), size: 32, color: IX.accent, w: FontWeight.w700);
    },
    presets: {'K₂Cr₂O₇': {'nA': 2, 'nO': 7, 'nH': 2, 'q': 0}, 'KMnO₄': {'nA': 1, 'nO': 4, 'nH': 1, 'q': 0}, 'H₂SO₄': {'nA': 1, 'nO': 4, 'nH': 2, 'q': 0}, 'NO₃⁻': {'nA': 1, 'nO': 3, 'nH': 0, 'q': -1}, 'S₂O₃²⁻': {'nA': 2, 'nO': 3, 'nH': 0, 'q': -2}, 'Fe₃O₄': {'nA': 3, 'nO': 4, 'nH': 0, 'q': 0}},
  ),
};
