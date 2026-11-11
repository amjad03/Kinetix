import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bench.dart';
import 'elements.dart';
import 'kit.dart';

/// The atom: build an atom or ion from Z, A and charge; quantum numbers with the orbital's
/// shape and hydrogen radial distribution; filling orbitals by Aufbau, Pauli and Hund; and the
/// group from the outer configuration.

const _sCol = Color(0xFF2F6FB3), _pCol = Color(0xFFC2410C), _dCol = Color(0xFF15803D), _fCol = Color(0xFF6B46A8);
Color _subCol(String s) => {'s': _sCol, 'p': _pCol, 'd': _dCol, 'f': _fCol}[s[s.length - 1]]!;

/// Hydrogen radial function R_nl(r) with r in Bohr radii (unnormalised).
double _radial(int n, int l, double r) {
  final rho = 2 * r / n;
  final k = n - l - 1, a = 2 * l + 1;
  var l0 = 1.0, l1 = 1 + a - rho;
  double lag = k == 0 ? l0 : l1;
  for (var j = 1; j < k; j++) {
    final l2 = ((2 * j + 1 + a - rho) * l1 - (j + a) * l0) / (j + 1);
    l0 = l1;
    l1 = l2;
    lag = l2;
  }
  return math.pow(rho, l) * math.exp(-rho / 2) * lag;
}

void _nucleus(Canvas c, Offset o, int p, int n) {
  final total = p + n;
  final r = 13.0;
  final pts = <Offset>[];
  // Packed on a sunflower spiral so the nucleus reads as a cluster.
  for (var i = 0; i < total; i++) {
    final rr = r * 0.95 * math.sqrt(i + 0.5);
    final a = i * 2.39996;
    pts.add(o + Offset(math.cos(a), math.sin(a)) * rr);
  }
  final order = List.generate(total, (i) => i)..sort((a, b) => (rnd(a, 3)).compareTo(rnd(b, 3)));
  final isP = {for (var i = 0; i < total; i++) order[i]: i < p};
  for (var i = total - 1; i >= 0; i--) {
    ball(c, pts[i], r, isP[i]! ? IX.positive : const Color(0xFF8A93A8));
  }
}

void _orbitalShape(Canvas c, Offset o, double R, int n, int l, int ml) {
  final pos = const Color(0xFF3F7CC4), neg = const Color(0xFFD9822B);
  void lobe(double ang, double len, double wid, Color col) {
    c.save();
    c.translate(o.dx, o.dy);
    c.rotate(ang);
    final path = Path()
      ..moveTo(0, 0)
      ..cubicTo(len * 0.2, -wid, len * 1.05, -wid * 0.95, len, 0)
      ..cubicTo(len * 1.05, wid * 0.95, len * 0.2, wid, 0, 0);
    c.drawPath(path, Paint()..shader = ui.Gradient.radial(Offset(len * 0.62, -wid * 0.25), len * 0.7, [Color.lerp(col, Colors.white, 0.55)!, col.withValues(alpha: 0.85)]));
    c.drawPath(path, stroke(Color.lerp(col, Colors.black, 0.25)!, 1.5));
    c.restore();
  }

  if (l == 0) {
    c.drawCircle(o, R * 0.8, Paint()..shader = ui.Gradient.radial(o - Offset(R * 0.25, R * 0.3), R, [Color.lerp(pos, Colors.white, 0.6)!, pos.withValues(alpha: 0.8)]));
    for (var k = 1; k < n; k++) {
      c.drawCircle(o, R * 0.8 * k / n, stroke(Colors.white, 3));
      c.drawCircle(o, R * 0.8 * k / n, stroke(IX.ink.withValues(alpha: 0.35), 1));
    }
  } else if (l == 1) {
    final a = ml == 0 ? -math.pi / 2 : ml == 1 ? 0.0 : -math.pi / 4;
    lobe(a, R, R * 0.42, pos);
    lobe(a + math.pi, R, R * 0.42, neg);
  } else if (l == 2) {
    if (ml == 0) {
      lobe(-math.pi / 2, R, R * 0.36, pos);
      lobe(math.pi / 2, R, R * 0.36, pos);
      c.drawOval(Rect.fromCenter(center: o, width: R * 0.95, height: R * 0.32), Paint()..color = neg.withValues(alpha: 0.85));
      c.drawOval(Rect.fromCenter(center: o, width: R * 0.95, height: R * 0.32), stroke(Color.lerp(neg, Colors.black, 0.25)!, 1.5));
    } else {
      final base = ml.abs() == 2 ? 0.0 : math.pi / 4;
      for (var i = 0; i < 4; i++) {
        lobe(base + i * math.pi / 2, R * 0.92, R * 0.34, i.isEven ? pos : neg);
      }
    }
  } else {
    for (var i = 0; i < 6; i++) {
      lobe(i * math.pi / 3 + math.pi / 6, R * 0.9, R * 0.24, i.isEven ? pos : neg);
    }
  }
  c.drawCircle(o, 6, fill(IX.ink));
}

/// Orbital boxes for the configuration, each subshell placed at its Aufbau energy.
void _ladder(Canvas c, Rect r, Map<String, int> cfg, {String? hi}) {
  final shown = aufbau.where((s) => cfg.containsKey(s) || aufbau.indexOf(s) <= math.max(2, cfg.keys.map(aufbau.indexOf).fold(0, math.max) + 1)).toList();
  final rows = shown.length;
  final dy = math.min(104.0, (r.height - 40) / rows);
  const bw = 58.0;
  IxPaint.arrow(c, Offset(r.left + 10, r.bottom - 10), Offset(r.left + 10, r.top + 10), IX.muted, width: 2.5);
  c.save();
  c.translate(r.left - 6, r.center.dy);
  c.rotate(-math.pi / 2);
  lbl(c, 'Energy', Offset.zero, size: 16, color: IX.muted);
  c.restore();
  for (var i = 0; i < rows; i++) {
    final s = shown[i];
    final y = r.bottom - 30 - i * dy;
    final boxes = capacity(s) ~/ 2;
    final e = cfg[s] ?? 0;
    final x0 = r.left + 130 + ('spdf'.indexOf(s[1])) * 110.0;
    lbl(c, s, Offset(x0 - 20, y), size: 26, color: _subCol(s), w: FontWeight.w700, align: Alignment.centerRight);
    for (var b = 0; b < boxes; b++) {
      final k = e <= boxes ? (b < e ? 1 : 0) : 1 + (b < e - boxes ? 1 : 0);
      orbitalBox(c, Rect.fromLTWH(x0 + b * bw, y - bw * 0.45, bw, bw * 0.9), k, col: _subCol(s), hi: s == hi);
    }
  }
}

final Map<String, Mode> atomModes = {
  'build': Mode(
    title: 'Build an atom or ion',
    subtitle: 'Structure of atom · Atomic number and mass number',
    formula: 'A = Z + N',
    titleOf: (v) {
      final e = el(v.i('Z', 6));
      final q = v.i('q');
      return q == 0 ? 'An atom of ${e.name.toLowerCase()}' : '${e.name} ion, ${e.sym}${charge(q)}';
    },
    defaults: {'Z': 6, 'A': 12, 'q': 0},
    knobsOf: (v) => [
      const Slide('Z', 'Atomic number Z (protons)', 1, 20, step: 1, digits: 0),
      Slide('A', 'Mass number A', v.g('Z', 6), math.max(v.g('Z', 6) * 2.4, v.g('Z', 6) + 1), step: 1, digits: 0),
      const Slide('q', 'Charge', -3, 3, step: 1, digits: 0),
    ],
    readouts: (v) {
      final z = v.i('Z', 6), a = math.max(v.i('A', 12), z), q = v.i('q');
      return [
        Readout('Protons', '$z', '', IX.positive),
        Readout('Neutrons', '${a - z}', '', IX.steel),
        Readout('Electrons', '${math.max(0, z - q)}', '', IX.accent),
        Readout('Symbol', '${sup(a)}${el(z).sym}${charge(q)}'),
      ];
    },
    paint: (c, s, v) {
      final z = v.i('Z', 6), a = math.max(v.i('A', 12), z), q = v.i('q');
      final ne = math.max(0, z - q);
      final o = Offset(s.width * 0.38, s.height / 2);
      final shells = <int>[];
      var left = ne;
      for (final cap in [2, 8, 8, 18]) {
        if (left <= 0) break;
        shells.add(math.min(left, cap));
        left -= cap;
      }
      final r0 = 70 + 8 * math.sqrt(a.toDouble());
      for (var i = 0; i < math.max(shells.length, 1); i++) {
        final rr = r0 + 70 + i * 72;
        c.drawCircle(o, rr, stroke(IX.rule, 2));
        if (i >= shells.length) continue;
        for (var k = 0; k < shells[i]; k++) {
          final ang = -math.pi / 2 + k * 2 * math.pi / shells[i] + i * 0.3;
          final p = o + Offset(math.cos(ang), math.sin(ang)) * rr;
          c.drawCircle(p, 15, fill(IX.accent.withValues(alpha: 0.15)));
          ball(c, p, 10, IX.accent);
        }
        lbl(c, 'n = ${i + 1}', o + Offset(rr * 0.71 + 8, -rr * 0.71 - 8), size: 15, color: IX.muted, align: Alignment.bottomLeft);
      }
      _nucleus(c, o, z, a - z);
      // Nuclide notation card.
      final card = Rect.fromLTWH(s.width * 0.72, s.height / 2 - 170, s.width * 0.24, 340);
      panel(c, card, 'Notation');
      final sym = el(z).sym;
      final cx = card.center.dx + 20, cy = card.center.dy + 10;
      lbl(c, sym, Offset(cx, cy), size: 110, color: IX.ink, w: FontWeight.w600);
      final w = textW(sym, 110, w: FontWeight.w600);
      lbl(c, '$a', Offset(cx - w / 2 - 8, cy - 34), size: 40, color: IX.inkSoft, w: FontWeight.w600, align: Alignment.centerRight);
      lbl(c, '$z', Offset(cx - w / 2 - 8, cy + 40), size: 40, color: IX.positive, w: FontWeight.w600, align: Alignment.centerRight);
      if (q != 0) lbl(c, '${q.abs() == 1 ? '' : q.abs()}${q > 0 ? '+' : '−'}', Offset(cx + w / 2 + 8, cy - 34), size: 40, color: IX.accent, w: FontWeight.w600, align: Alignment.centerLeft);
      lbl(c, 'A = $a   Z = $z   N = ${a - z}', Offset(card.center.dx, card.bottom - 36), size: 18, color: IX.inkSoft);
      for (final (i, (t, col)) in [('proton', IX.positive), ('neutron', const Color(0xFF8A93A8)), ('electron', IX.accent)].indexed) {
        ball(c, Offset(36, s.height - 110 + i * 34.0), 10, col);
        lbl(c, t, Offset(56, s.height - 110 + i * 34.0), size: 17, align: Alignment.centerLeft);
      }
    },
    presets: {'¹²C': {'Z': 6, 'A': 12}, '¹⁴C': {'Z': 6, 'A': 14}, '²³Na⁺': {'Z': 11, 'A': 23, 'q': 1}, '³⁵Cl⁻': {'Z': 17, 'A': 35, 'q': -1}, '¹⁶O²⁻': {'Z': 8, 'A': 16, 'q': -2}},
  ),
  'quantum': Mode(
    title: 'Quantum numbers',
    subtitle: 'Structure of atom · Orbitals and quantum numbers',
    formula: 'l = 0 … n−1,  mₗ = −l … +l',
    titleOf: (v) => 'The ${v.i('n', 2)}${'spdf'[math.min(v.i('l', 1), v.i('n', 2) - 1)]} subshell',
    defaults: {'n': 2, 'l': 1, 'ml': 0},
    knobsOf: (v) {
      final n = v.i('n', 2), l = math.min(v.i('l'), n - 1);
      return [
        const Slide('n', 'Principal quantum number n', 1, 4, step: 1, digits: 0),
        Pick('l', 'Azimuthal quantum number l', [for (var i = 0; i < n; i++) '$i (${'spdf'[i]})']),
        if (l > 0) Slide('ml', 'Magnetic quantum number mₗ', -l.toDouble(), l.toDouble(), step: 1, digits: 0),
      ];
    },
    readouts: (v) {
      final n = v.i('n', 2), l = math.min(v.i('l'), n - 1);
      return [
        Readout('Orbitals', '${2 * l + 1}', '', IX.accent),
        Readout('Max electrons', '${2 * (2 * l + 1)}', '', IX.green),
        Readout('Radial nodes', '${n - l - 1}', '', IX.amber),
        Readout('Angular nodes', '$l', '', CX.purple),
        Readout('Shell can hold', '${2 * n * n}', 'electrons'),
        Readout('mₗ values', l == 0 ? '0' : '−$l … +$l'),
      ];
    },
    paint: (c, s, v) {
      final n = v.i('n', 2), l = math.min(v.i('l'), n - 1), ml = v.i('ml').clamp(-l, l);
      final left = Rect.fromLTWH(24, 24, s.width * 0.42, s.height - 48);
      panel(c, left, 'Orbital shape');
      _orbitalShape(c, left.center + const Offset(0, -40), math.min(left.width, left.height) * 0.36, n, l, ml);
      final main = '$n${'spdf'[l]}';
      final suffix = l == 1 ? const {-1: 'y', 0: 'z', 1: 'x'}[ml]! : l == 2 ? const {-2: 'xy', -1: 'yz', 0: 'z²', 1: 'xz', 2: 'x²−y²'}[ml]! : '';
      final mw = textW(main, 34, w: FontWeight.w700), sw = suffix.isEmpty ? 0.0 : textW(suffix, 22, w: FontWeight.w600) + 4;
      final mx0 = left.center.dx - (mw + sw) / 2;
      lbl(c, main, Offset(mx0, left.bottom - 92), size: 34, color: IX.ink, w: FontWeight.w700, align: Alignment.centerLeft);
      if (suffix.isNotEmpty) lbl(c, suffix, Offset(mx0 + mw + 4, left.bottom - 80), size: 22, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
      lbl(c, 'blue and orange: opposite signs of the wave function', Offset(left.center.dx, left.bottom - 50), size: 15, color: IX.muted);
      // mₗ boxes.
      final bx = left.right + 60, by = 70.0;
      lbl(c, 'One box per orbital (mₗ)', Offset(bx, by - 20), size: 18, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
      for (var m = -l; m <= l; m++) {
        final b = Rect.fromLTWH(bx + (m + l) * 64.0, by + 6, 58, 50);
        orbitalBox(c, b, 2, col: _subCol('spdf'[l]), hi: m == ml && l > 0);
        lbl(c, m == 0 ? '0' : sgn(m.toDouble(), 0), b.bottomCenter + const Offset(0, 16), size: 15, color: IX.inkSoft);
      }
      // Radial distribution.
      final pr = Rect.fromLTRB(left.right + 120, 230, s.width - 40, s.height - 100);
      final rmax = n * n * 2.6 + 6;
      final pts = <Offset>[];
      var mx = 0.0;
      for (var i = 0; i <= 400; i++) {
        final r = rmax * i / 400;
        final p = r * r * math.pow(_radial(n, l, r), 2);
        pts.add(Offset(r, p.toDouble()));
        mx = math.max(mx, p.toDouble());
      }
      final pl = Plot(pr, 0, rmax, 0, 1.15);
      pl.axes(c, x: 'Distance from nucleus r / a₀', y: 'Probability 4πr²ψ²', fy: (_) => '', dy: 0.25, title: 'Radial distribution, hydrogen $n${'spdf'[l]}');
      final norm = [for (final q in pts) Offset(q.dx, q.dy / mx)];
      pl.line(c, norm, IX.accent);
      // Radial nodes.
      for (var i = 1; i < norm.length - 1; i++) {
        if (norm[i].dy < 0.002 && norm[i].dy <= norm[i - 1].dy && norm[i].dy <= norm[i + 1].dy && norm[i].dx > 0.2) {
          pl.dot(c, norm[i].dx, 0, IX.amber, r0: 6);
        }
      }
      if (n - l - 1 > 0) lbl(c, 'radial node${n - l - 1 > 1 ? 's' : ''}', pr.bottomRight + const Offset(-10, -24), size: 15, color: IX.amber, align: Alignment.centerRight, w: FontWeight.w600);
    },
    presets: {'1s': {'n': 1, 'l': 0}, '2s': {'n': 2, 'l': 0}, '2p': {'n': 2, 'l': 1}, '3s': {'n': 3, 'l': 0}, '3d': {'n': 3, 'l': 2}, '4f': {'n': 4, 'l': 3}},
  ),
  'config': Mode(
    title: 'Filling orbitals',
    subtitle: 'Structure of atom · Aufbau, Pauli and Hund',
    formula: '1s 2s 2p 3s 3p 4s 3d 4p',
    titleOf: (v) => '${el(v.i('Z', 8)).name}: ${configText(v.i('Z', 8))}',
    defaults: {'Z': 8, 'max': 36},
    knobsOf: (v) => [Slide('Z', 'Atomic number Z', v.g('min', 1), v.g('max', 36), step: 1, digits: 0), const Note('Lower (n + l) fills first. At most two electrons, of opposite spin, per orbital (Pauli). In a subshell they spread out with parallel spins before pairing (Hund).')],
    readouts: (v) {
      final z = v.i('Z', 8);
      final cfg = configuration(z);
      var unp = 0;
      for (final e in cfg.entries) {
        final b = capacity(e.key) ~/ 2;
        unp += e.value <= b ? e.value : 2 * b - e.value;
      }
      final last = configuration(z, real: false).keys.last;
      return [
        Readout('Element', '${el(z).sym}  (Z = $z)', '', IX.accent),
        Readout('Unpaired electrons', '$unp', '', IX.amber),
        Readout('Last subshell filled', last, '', _subCol(last)),
        Readout('Block', '${el(z).block}-block'),
        Readout(isException(z) ? 'Exception' : 'Configuration', isException(z) ? 'half-filled / full d' : 'follows Aufbau', '', isException(z) ? IX.positive : IX.green),
      ];
    },
    paint: (c, s, v) {
      final z = v.i('Z', 8);
      final cfg = configuration(z);
      _ladder(c, Rect.fromLTWH(40, 24, s.width * 0.6, s.height - 48), cfg, hi: configuration(z, real: false).keys.last);
      final card = Rect.fromLTWH(s.width * 0.66, 30, s.width * 0.31, 300);
      final e = el(z);
      c.drawRRect(RRect.fromRectAndRadius(card, const Radius.circular(18)), fill(_subCol(e.block).withValues(alpha: 0.08)));
      c.drawRRect(RRect.fromRectAndRadius(card, const Radius.circular(18)), stroke(_subCol(e.block), 2.5));
      lbl(c, '$z', card.topLeft + const Offset(24, 20), size: 28, color: IX.inkSoft, w: FontWeight.w600, align: Alignment.topLeft);
      lbl(c, e.mass.toStringAsFixed(e.mass < 100 ? 2 : 1), card.topRight + const Offset(-24, 24), size: 20, color: IX.inkSoft, align: Alignment.topRight);
      lbl(c, e.sym, card.center + const Offset(0, -10), size: 110, color: IX.ink, w: FontWeight.w600);
      lbl(c, e.name, card.bottomCenter + const Offset(0, -34), size: 24, color: IX.ink, w: FontWeight.w500);
      // Aufbau diagonal rule.
      final ar = Rect.fromLTWH(s.width * 0.66, 360, s.width * 0.31, s.height - 384);
      panel(c, ar, 'Order of filling (n + l rule)');
      final cell = math.min((ar.width - 40) / 4, (ar.height - 70) / 6);
      Offset at(int n, int l) => Offset(ar.left + 40 + l * cell, ar.top + 64 + (n - 1) * cell * 0.9);
      for (var n = 1; n <= 6; n++) {
        for (var l = 0; l < math.min(n, 4); l++) {
          final sname = '$n${'spdf'[l]}';
          final filled = (cfg[sname] ?? 0) > 0;
          lbl(c, sname, at(n, l) + Offset(cell / 2, cell * 0.4), size: 19, color: filled ? _subCol(sname) : IX.muted, w: filled ? FontWeight.w700 : FontWeight.w500);
        }
      }
      for (var k = 1; k <= 7; k++) {
        // Diagonal of constant n + l.
        final pts = <Offset>[];
        for (var l = 0; l < 4; l++) {
          final n = k - l + 1;
          if (n > l && n >= 1 && n <= 6) pts.add(at(n, l) + Offset(cell / 2, cell * 0.4));
        }
        if (pts.length >= 2) IxPaint.arrow(c, pts.last + const Offset(16, -14), pts.first + const Offset(-16, 14), IX.accent.withValues(alpha: 0.35), width: 2, head: 10);
      }
    },
    presets: {'O (8)': {'Z': 8}, 'N (7)': {'Z': 7}, 'Fe (26)': {'Z': 26}, 'Cr (24)': {'Z': 24}, 'Cu (29)': {'Z': 29}, 'Kr (36)': {'Z': 36}},
  ),
  'group': Mode(
    title: 'Group from the outer configuration',
    subtitle: 'Classification of elements · Blocks and groups',
    formula: 's, p: group = 10 + s + p    d: group = s + d',
    defaults: {'s': 2, 'p': 4, 'd': 0, 'n': 3},
    knobs: const [
      Slide('n', 'Outer shell n', 2, 5, step: 1, digits: 0),
      Slide('s', 'ns electrons', 1, 2, step: 1, digits: 0),
      Slide('p', 'np electrons', 0, 6, step: 1, digits: 0),
      Slide('d', '(n−1)d electrons', 0, 10, step: 1, digits: 0),
      Note('s-block: group = s. p-block: group = 10 + s + p. d-block: group = s + d.'),
    ],
    readouts: (v) {
      final (g, blk, z) = _group(v);
      return [Readout('Group', g == null ? '—' : '$g', '', IX.accent), Readout('Block', blk), Readout('Period', '${v.i('n', 3)}'), Readout('Element', z == null ? '—' : '${el(z).name} (${el(z).sym})', '', IX.green)];
    },
    paint: (c, s, v) {
      final n = v.i('n', 3), se = v.i('s', 2), pe = v.i('p'), de = n >= 4 ? v.i('d') : 0;
      final (g, blk, z) = _group(v);
      final top = Rect.fromLTWH(40, 30, s.width - 80, 250);
      panel(c, top, 'Outer electrons');
      var x = top.left + 60;
      void sub(String name, int e, int boxes) {
        lbl(c, name, Offset(x, top.center.dy + 6), size: 26, color: _subCol(name), w: FontWeight.w700, align: Alignment.centerRight);
        x += 16;
        for (var b = 0; b < boxes; b++) {
          final k = e <= boxes ? (b < e ? 1 : 0) : 1 + (b < e - boxes ? 1 : 0);
          orbitalBox(c, Rect.fromLTWH(x + b * 58, top.center.dy - 22, 58, 56), k, col: _subCol(name));
        }
        x += boxes * 58 + 90;
      }
      if (n >= 4) sub('${n - 1}d', de, 5);
      sub('${n}s', se, 1);
      sub('${n}p', pe, 3);
      // Periodic table strip of 18 groups with the result marked.
      final strip = Rect.fromLTWH(40, 330, s.width - 80, s.height - 370);
      panel(c, strip, 'Periodic table, period $n');
      final cw = (strip.width - 40) / 18;
      for (var gg = 1; gg <= 18; gg++) {
        final blkOf = gg <= 2 ? 's' : gg <= 12 ? 'd' : 'p';
        final present = n >= 4 || blkOf != 'd';
        final rr = Rect.fromLTWH(strip.left + 20 + (gg - 1) * cw, strip.top + 70, cw - 6, strip.height - 130);
        final on = gg == g;
        final col = _subCol(blkOf);
        c.drawRRect(RRect.fromRectAndRadius(rr, const Radius.circular(8)), fill(!present ? IX.page : on ? col : col.withValues(alpha: 0.10)));
        if (present) c.drawRRect(RRect.fromRectAndRadius(rr, const Radius.circular(8)), stroke(on ? col : col.withValues(alpha: 0.3), on ? 3 : 1));
        lbl(c, '$gg', rr.topCenter + const Offset(0, 22), size: 17, color: on ? Colors.white : IX.inkSoft, w: FontWeight.w600);
        if (present) {
          final zz = _zOf(n, gg);
          if (zz != null) lbl(c, el(zz).sym, rr.center + const Offset(0, 14), size: 22, color: on ? Colors.white : IX.ink, w: FontWeight.w700);
        }
      }
      lbl(c, 's-block', Offset(strip.left + 20 + cw, strip.bottom - 30), size: 16, color: _sCol, w: FontWeight.w600);
      lbl(c, 'd-block', Offset(strip.left + 20 + cw * 7, strip.bottom - 30), size: 16, color: _dCol, w: FontWeight.w600);
      lbl(c, 'p-block', Offset(strip.left + 20 + cw * 15, strip.bottom - 30), size: 16, color: _pCol, w: FontWeight.w600);
      if (g == null) lbl(c, blk, top.bottomCenter + const Offset(0, -26), size: 18, color: IX.positive, w: FontWeight.w600);
      if (z != null && blk == 'd') lbl(c, 'Group = ns + (n−1)d = $se + $de = $g', top.bottomCenter + const Offset(0, -26), size: 19, color: IX.inkSoft, w: FontWeight.w600);
      if (z != null && blk == 'p') lbl(c, 'Group = 10 + ns + np = 10 + $se + $pe = $g', top.bottomCenter + const Offset(0, -26), size: 19, color: IX.inkSoft, w: FontWeight.w600);
      if (z != null && blk == 's') lbl(c, 'Group = ns = $se', top.bottomCenter + const Offset(0, -26), size: 19, color: IX.inkSoft, w: FontWeight.w600);
    },
    presets: {'3s² 3p⁴ (S)': {'n': 3, 's': 2, 'p': 4, 'd': 0}, '4s¹ (K)': {'n': 4, 's': 1, 'p': 0, 'd': 0}, '3d⁶ 4s² (Fe)': {'n': 4, 's': 2, 'p': 0, 'd': 6}, '3d¹⁰ 4s² 4p⁵ (Br)': {'n': 4, 's': 2, 'p': 5, 'd': 10}},
  ),
};

int? _zOf(int period, int group) {
  for (final e in elements) {
    if (e.period == period && e.group == group) return e.z;
  }
  return null;
}

(int?, String, int?) _group(V v) {
  final n = v.i('n', 3), se = v.i('s', 2), pe = v.i('p'), de = n >= 4 ? v.i('d') : 0;
  if (pe > 0 && se < 2) return (null, 'np fills only after ns is full', null);
  if (pe > 0 && n >= 4 && de < 10) return (null, '(n−1)d must be full before np fills', null);
  if (pe > 0) {
    final g = 10 + se + pe;
    return (g, 'p', _zOf(n, g));
  }
  if (de > 0) {
    final g = se + de;
    if (g > 12) return (null, 'not a ground-state configuration', null);
    return (g, 'd', _zOf(n, g));
  }
  return (se, 's', _zOf(n, se));
}
