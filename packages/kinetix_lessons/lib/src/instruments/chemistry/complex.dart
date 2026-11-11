import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bench.dart';
import 'kit.dart';

/// Coordination compounds and the d-block ions: Werner's cobalt ammines, oxidation state,
/// geometric isomers, valence bond theory, spin-only magnetic moments, crystal field splitting
/// and colour, and the effective atomic number.

const _oct = [P3(1, 0, 0), P3(-1, 0, 0), P3(0, 1, 0), P3(0, -1, 0), P3(0, 0, 1), P3(0, 0, -1)];
const _sq = [P3(1, 0, 0), P3(0, 1, 0), P3(-1, 0, 0), P3(0, -1, 0)];

/// A ligand drawn as one ball: (label, colour).
const _nh3 = ('NH₃', Color(0xFF2F5BB7)), _cl = ('Cl', Color(0xFF3F9A55)), _no2 = ('NO₂', Color(0xFFC63B2A));

Mol3 _complex(String metal, List<P3> dirs, List<(String, Color)> ligs, {double bond = 1.9}) => Mol3([
  Atom3('Co', const P3(0, 0, 0), label: metal, r: 0.6, color: const Color(0xFF5468A8)),
  for (final (i, l) in ligs.indexed) Atom3('X', dirs[i] * bond, label: l.$1, r: l.$1.length > 2 ? 0.55 : 0.48, color: l.$2),
], [for (var i = 0; i < ligs.length; i++) (0, i + 1, 1)]);

/// 3d ions as aqua complexes: name, d electrons, unpaired (high spin), colour of the solution.
const _ions = [
  ('Sc³⁺', 0, 0, Color(0xFFF4F6FA), 'colourless'), ('Ti³⁺', 1, 1, Color(0xFF9C6FC0), 'purple'), ('V³⁺', 2, 2, Color(0xFF5E9E5E), 'green'), ('Cr³⁺', 3, 3, Color(0xFF7E6AA8), 'violet'),
  ('Mn³⁺', 4, 4, Color(0xFF8A4FA0), 'violet'), ('Mn²⁺', 5, 5, Color(0xFFF1D6DE), 'pale pink'), ('Fe³⁺', 5, 5, Color(0xFFE2C25A), 'yellow'), ('Fe²⁺', 6, 4, Color(0xFFCFE5C2), 'pale green'),
  ('Co²⁺', 7, 3, Color(0xFFD98AA6), 'pink'), ('Ni²⁺', 8, 2, Color(0xFF6DB37A), 'green'), ('Cu²⁺', 9, 1, Color(0xFF5B9BD8), 'blue'), ('Zn²⁺', 10, 0, Color(0xFFF4F6FA), 'colourless'),
];

double _mu(int n) => math.sqrt(n * (n + 2));

/// A row of orbital boxes for a subshell, with a caption below. Each entry of [fill] is
/// (metal electrons, ligand electrons) in that box.
double _boxes(Canvas c, Offset at, String name, List<(int, int)> fill, {double w = 54}) {
  for (var i = 0; i < fill.length; i++) {
    final b = Rect.fromLTWH(at.dx + i * w, at.dy, w, w);
    final (m, l) = fill[i];
    orbitalBox(c, b, m, hi: l > 0);
    if (l > 0) {
      for (var k = 0; k < l; k++) {
        final x = b.left + b.width * (l == 1 ? 0.5 : k == 0 ? 0.33 : 0.67);
        IxPaint.arrow(c, Offset(x, k == 0 ? b.bottom - 10 : b.top + 10), Offset(x, k == 0 ? b.top + 10 : b.bottom - 10), IX.green, width: 2.6, head: w * 0.28);
      }
    }
  }
  lbl(c, name, Offset(at.dx + fill.length * w / 2, at.dy + w + 22), size: 18, color: IX.inkSoft, w: FontWeight.w600);
  return fill.length * w;
}

/// d-orbital filling for [n] electrons in five boxes, high spin (Hund first) or paired first.
List<int> _fillD(int n, {bool pair = false, int boxes = 5}) {
  final f = List.filled(boxes, 0);
  if (pair) {
    for (var e = 0; e < n; e++) {
      final i = e < boxes * 2 ? (e ~/ 2) : 0;
      f[i.clamp(0, boxes - 1)]++;
    }
    return f;
  }
  for (var e = 0; e < n; e++) {
    f[e % boxes]++;
  }
  return f;
}

/// The colour seen for a complex absorbing at [nm], and a name for it.
(Color, String, String) _seen(double nm) {
  if (nm < 400) return (const Color(0xFFF2F4F8), 'ultraviolet', 'colourless');
  if (nm > 750) return (const Color(0xFFF2F4F8), 'infrared', 'colourless');
  const t = [
    (435.0, 'violet', 'yellow-green', Color(0xFFB5C934)), (480.0, 'blue', 'yellow', Color(0xFFE8C531)), (490.0, 'green-blue', 'orange', Color(0xFFE38B2C)),
    (510.0, 'blue-green', 'purple', Color(0xFF9B3C8C)), (560.0, 'green', 'red-violet', Color(0xFFB0337A)), (580.0, 'yellow-green', 'violet', Color(0xFF6B3FA0)),
    (595.0, 'yellow', 'blue', Color(0xFF2F5BB7)), (605.0, 'orange', 'green-blue', Color(0xFF2A8C9C)), (751.0, 'red', 'blue-green', Color(0xFF2E9C86)),
  ];
  for (final e in t) {
    if (nm < e.$1) return (e.$4, e.$2, e.$3);
  }
  return (const Color(0xFF2E9C86), 'red', 'blue-green');
}

/// The hue of light of wavelength [nm] (for the spectrum bar).
Color _hue(double nm) {
  final h = nm < 440 ? 270 - (nm - 380) / 60 * 30 : nm < 490 ? 240 - (nm - 440) / 50 * 60 : nm < 510 ? 180 - (nm - 490) / 20 * 60 : nm < 580 ? 120 - (nm - 510) / 70 * 60 : nm < 645 ? 60 - (nm - 580) / 65 * 60 : 0.0;
  return HSLColor.fromAHSL(1, h.clamp(0, 300).toDouble(), 0.62, 0.52).toColor();
}

void _tube(Canvas c, Rect r, Color liquid, String label) {
  final path = Path()
    ..moveTo(r.left, r.top)
    ..lineTo(r.left, r.bottom - r.width / 2)
    ..arcToPoint(Offset(r.right, r.bottom - r.width / 2), radius: Radius.circular(r.width / 2), clockwise: false)
    ..lineTo(r.right, r.top);
  c.save();
  c.clipPath(Path()..addRRect(RRect.fromRectAndCorners(r, bottomLeft: Radius.circular(r.width / 2), bottomRight: Radius.circular(r.width / 2))));
  c.drawRect(Rect.fromLTRB(r.left, r.top + r.height * 0.3, r.right, r.bottom), fill(liquid));
  c.restore();
  c.drawPath(path, stroke(IX.glassEdge, 2.6));
  c.drawLine(Offset(r.left + 8, r.top + 20), Offset(r.left + 8, r.bottom - 30), stroke(Colors.white.withValues(alpha: 0.8), 4));
  lbl(c, label, Offset(r.center.dx, r.bottom + 24), size: 17, color: IX.ink, w: FontWeight.w600);
}

final Map<String, Mode> complexModes = {
  'werner': Mode(
    title: "Werner's cobalt ammines",
    subtitle: 'Coordination compounds · Primary and secondary valence',
    formula: 'CoCl₃·nNH₃ + AgNO₃ → AgCl↓ (only ionisable Cl⁻)',
    titleOf: (v) => const ['[CoCl₃(NH₃)₃]', '[CoCl₂(NH₃)₄]Cl', '[CoCl(NH₃)₅]Cl₂', '[Co(NH₃)₆]Cl₃'][v.i('n', 6).clamp(3, 6) - 3],
    defaults: {'n': 6, 'mol': 0.5},
    rotate: true,
    knobs: [
      const Slide('n', 'NH₃ per CoCl₃, n', 3, 6, digits: 0, step: 1),
      const Slide('mol', 'Complex taken', 0.1, 1, unit: 'mol', digits: 2, step: 0.05),
      const Note('Coordination number 6 is the secondary valence. Chloride inside the square brackets is bonded to Co and does not precipitate.'),
    ],
    readouts: (v) {
      final n = v.i('n', 6).clamp(3, 6), out = n - 3, mol = v.g('mol', 0.5);
      return [Readout('Ionisable Cl⁻', '$out per formula', '', IX.green), Readout('AgCl precipitated', (mol * out).toStringAsFixed(2), 'mol', IX.accent), Readout('Mass of AgCl', (mol * out * 143.32).toStringAsFixed(1), 'g'), Readout('Ions in solution', out == 0 ? 'non-electrolyte' : '1 : $out electrolyte (${out + 1} ions)', '', IX.positive)];
    },
    paint: (c, s, v) {
      final n = v.i('n', 6).clamp(3, 6), out = n - 3, mol = v.g('mol', 0.5);
      final ligs = [for (var i = 0; i < 6; i++) i < n ? _nh3 : _cl];
      final col = const [Color(0xFF5C79B8), Color(0xFF5E9E6A), Color(0xFF8A4FA0), Color(0xFFD9932C)][n - 3];
      final stage = Rect.fromLTWH(30, 40, s.width * 0.52, s.height - 120);
      lbl(c, const ['mer-[CoCl₃(NH₃)₃]', 'trans-[CoCl₂(NH₃)₄]⁺   praseo (green)', '[CoCl(NH₃)₅]²⁺   purpureo (purple)', '[Co(NH₃)₆]³⁺   luteo (yellow)'][n - 3], Offset(stage.center.dx, 60), size: 22, color: IX.ink, w: FontWeight.w600);
      final m = _complex('Co', n == 4 ? [_oct[0], _oct[1], _oct[4], _oct[5], _oct[2], _oct[3]] : n == 3 ? [_oct[2], _oct[3], _oct[4], _oct[0], _oct[1], _oct[5]] : _oct, ligs);
      drawMol(c, stage.center + const Offset(0, -10), 120, m, v.g('yaw'), v.g('pitch'));
      // Counter ions outside.
      for (var i = 0; i < out; i++) {
        final p = Offset(stage.right - 50, stage.top + 160 + i * 90.0);
        ball(c, p, 26, const Color(0xFF3F9A55));
        lbl(c, 'Cl⁻', p, size: 19, color: Colors.white, w: FontWeight.w700);
      }
      if (out > 0) lbl(c, 'outside: ionisable', Offset(stage.right - 50, stage.top + 110), size: 16, color: IX.green, w: FontWeight.w600);
      lbl(c, 'Drag to turn', Offset(stage.left + 70, stage.bottom + 30), size: 15, color: IX.muted);
      // Beaker with AgCl.
      final b = Rect.fromLTWH(s.width * 0.62, 150, s.width * 0.3, s.height - 330);
      final liq = beaker(c, b, 0.72, Color.lerp(col, Colors.white, 0.6)!, label: '+ excess AgNO₃(aq)');
      final ppt = out * mol / 3;
      if (ppt > 0) {
        final h = liq.height * 0.42 * ppt;
        final pile = Path()..moveTo(liq.left + 4, liq.bottom)..quadraticBezierTo(liq.center.dx, liq.bottom - h * 2, liq.right - 4, liq.bottom)..close();
        c.drawPath(pile, fill(const Color(0xFFF5F5F2)));
        c.drawPath(pile, stroke(const Color(0xFFC9CCD3), 1.5));
        for (var i = 0; i < (ppt * 60).round(); i++) {
          c.drawCircle(Offset(liq.left + 20 + rnd(i, 41) * (liq.width - 40), liq.top + 20 + rnd(i, 42) * (liq.height - 60)), 3, fill(const Color(0xFFE8E9E4)));
        }
        lbl(c, 'white AgCl', Offset(liq.center.dx, liq.bottom - h - 24), size: 17, color: IX.inkSoft, w: FontWeight.w600, halo: true);
      } else {
        lbl(c, 'no precipitate', liq.center, size: 19, color: IX.inkSoft, w: FontWeight.w600, halo: true);
      }
    },
    presets: {'CoCl₃·6NH₃': {'n': 6}, 'CoCl₃·5NH₃': {'n': 5}, 'CoCl₃·4NH₃': {'n': 4}, 'CoCl₃·3NH₃': {'n': 3}},
  ),
  'oxstate': Mode(
    title: 'Oxidation state of the central metal',
    subtitle: 'Coordination compounds · Nomenclature',
    formula: 'x + Σ (ligand charges) = charge of the complex',
    defaults: {'q': -3, 'a': 6, 'b': 0},
    knobs: [
      const Slide('q', 'Charge on the complex ion', -4, 3, digits: 0, step: 1),
      const Slide('a', 'Ligands of charge −1 (Cl⁻, CN⁻, NO₂⁻, OH⁻)', 0, 6, digits: 0, step: 1),
      const Slide('b', 'Ligands of charge −2 (C₂O₄²⁻, CO₃²⁻, SO₄²⁻)', 0, 3, digits: 0, step: 1),
      const Note('Neutral ligands (NH₃, H₂O, CO, en) add nothing to the sum.'),
    ],
    readouts: (v) {
      final q = v.i('q', -3), a = v.i('a', 6), b = v.i('b');
      final x = q + a + 2 * b;
      return [Readout('Oxidation state x', x >= 0 ? '+$x' : '−${-x}', '', IX.accent), Readout('Ligand charge', nf(-(a + 2 * b).toDouble(), 0)), Readout('Roman numeral', const ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][x.clamp(0, 8)], '', IX.green)];
    },
    paint: (c, s, v) {
      final q = v.i('q', -3), a = v.i('a', 6), b = v.i('b');
      final x = q + a + 2 * b;
      final ctr = Offset(s.width * 0.3, s.height * 0.45);
      final total = math.min(6, a + b).toInt();
      final neutral = math.max(0, 6 - a - b);
      final ligs = [for (var i = 0; i < a; i++) ('−1', IX.accent), for (var i = 0; i < b; i++) ('−2', CX.purple), for (var i = 0; i < neutral; i++) ('0', IX.steel)];
      for (var i = 0; i < ligs.length && i < 8; i++) {
        final ang = -math.pi / 2 + i * 2 * math.pi / math.max(6, ligs.length);
        final p = ctr + Offset(math.cos(ang), math.sin(ang)) * 190;
        c.drawLine(ctr, p, stroke(IX.rule, 6));
        ball(c, p, 42, ligs[i].$2);
        lbl(c, ligs[i].$1, p, size: 24, color: Colors.white, w: FontWeight.w700);
      }
      ball(c, ctr, 70, const Color(0xFF5468A8));
      lbl(c, 'M', ctr + const Offset(0, -14), size: 34, color: Colors.white, w: FontWeight.w700);
      lbl(c, 'x = ${x >= 0 ? '+' : '−'}${x.abs()}', ctr + const Offset(0, 24), size: 22, color: Colors.white, w: FontWeight.w700);
      final br = Rect.fromCircle(center: ctr, radius: 260);
      c.drawArc(br, 2.4, 1.5, false, stroke(IX.ink, 4));
      c.drawArc(br, -0.75, 1.5, false, stroke(IX.ink, 4));
      lbl(c, q == 0 ? '' : '${q.abs() == 1 ? '' : q.abs()}${q > 0 ? '+' : '−'}', ctr + const Offset(250, -230), size: 34, color: IX.ink, w: FontWeight.w700);
      lbl(c, '$total charged + $neutral neutral ligands', Offset(ctr.dx, ctr.dy + 300), size: 18, color: IX.muted);
      final pr = Rect.fromLTWH(s.width * 0.6, 120, s.width * 0.36, 420);
      panel(c, pr, 'Bookkeeping');
      final lines = ['x + ($a × −1) + ($b × −2) = ${q >= 0 ? q : '−${-q}'}', 'x − ${a + 2 * b} = ${q >= 0 ? q : '−${-q}'}', 'x = ${x >= 0 ? '+' : '−'}${x.abs()}'];
      for (final (i, t) in lines.indexed) {
        lbl(c, t, Offset(pr.left + 30, pr.top + 100 + i * 80.0), size: i == 2 ? 34 : 26, color: i == 2 ? IX.accent : IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
      }
    },
    presets: {'[Fe(CN)₆]³⁻': {'q': -3, 'a': 6, 'b': 0}, '[Fe(CN)₆]⁴⁻': {'q': -4, 'a': 6, 'b': 0}, '[CoCl(NH₃)₅]²⁺': {'q': 2, 'a': 1, 'b': 0}, '[Co(C₂O₄)₃]³⁻': {'q': -3, 'a': 0, 'b': 3}, '[Ni(CO)₄]': {'q': 0, 'a': 0, 'b': 0}, '[PtCl₂(en)₂]²⁺': {'q': 2, 'a': 2, 'b': 0}},
  ),
  'isomers': Mode(
    title: 'Geometric isomers of complexes',
    subtitle: 'Coordination compounds · Isomerism',
    formula: 'cis: 90° apart     trans: 180° apart',
    titleOf: (v) => const ['[PtCl₂(NH₃)₂]: square planar', '[CoCl₂(NH₃)₄]⁺: octahedral', '[Co(NO₂)₃(NH₃)₃]: octahedral'][v.i('cpx').clamp(0, 2)],
    defaults: {'cpx': 0, 'yaw': 0.35, 'pitch': -0.45},
    rotate: true,
    knobs: [
      const Pick('cpx', 'Complex', ['[MX₂L₂]', '[MX₂L₄]', '[MX₃L₃]'], ids: ['ma2b2', 'ma4b2', 'ma3b3']),
      const Note('Drag to turn both models. Tetrahedral complexes show no geometric isomers: every corner is next to every other.'),
    ],
    readouts: (v) {
      final k = v.i('cpx').clamp(0, 2);
      return [
        Readout('Isomers', k == 2 ? 'fac and mer' : 'cis and trans', '', IX.accent),
        Readout(k == 2 ? 'fac' : 'cis', k == 2 ? 'three X on one face' : 'X–M–X 90°', '', IX.positive),
        Readout(k == 2 ? 'mer' : 'trans', k == 2 ? 'three X around a meridian' : 'X–M–X 180°', '', IX.green),
        Readout('Example', const ['cisplatin is an anticancer drug', 'cis violet, trans green', 'both are known'][k]),
      ];
    },
    paint: (c, s, v) {
      final k = v.i('cpx').clamp(0, 2);
      final List<(String, List<P3>, List<(String, Color)>)> pair = switch (k) {
        0 => [('cis', _sq, [_cl, _cl, _nh3, _nh3]), ('trans', _sq, [_cl, _nh3, _cl, _nh3])],
        1 => [('cis', [_oct[0], _oct[2], _oct[1], _oct[3], _oct[4], _oct[5]], [_cl, _cl, _nh3, _nh3, _nh3, _nh3]), ('trans', [_oct[2], _oct[3], _oct[0], _oct[1], _oct[4], _oct[5]], [_cl, _cl, _nh3, _nh3, _nh3, _nh3])],
        _ => [('fac', [_oct[0], _oct[2], _oct[4], _oct[1], _oct[3], _oct[5]], [_no2, _no2, _no2, _nh3, _nh3, _nh3]), ('mer', [_oct[0], _oct[1], _oct[2], _oct[3], _oct[4], _oct[5]], [_no2, _no2, _no2, _nh3, _nh3, _nh3])],
      };
      final metal = k == 0 ? 'Pt' : 'Co';
      for (final (i, (name, dirs, ligs)) in pair.indexed) {
        final r = Rect.fromLTWH(40 + i * (s.width - 80) / 2, 40, (s.width - 120) / 2, s.height - 110);
        panel(c, r);
        tag(c, name, Offset(r.center.dx, r.top + 40), i == 0 ? IX.positive : IX.green, size: 24, solid: true);
        final pos = drawMol(c, r.center + const Offset(0, 10), 108, _complex(metal, dirs, ligs), v.g('yaw', 0.35), v.g('pitch', -0.45));
        // Mark the X–M–X angle for the first two X ligands.
        final xs = [for (var j = 0; j < ligs.length; j++) if (ligs[j] != _nh3) j + 1];
        if (xs.length >= 2) {
          final a = pos[xs[0]], b = pos[xs[1]];
          IxPaint.dashed(c, a, b, Paint()..color = (i == 0 ? IX.positive : IX.green).withValues(alpha: 0.7)..strokeWidth = 2.4);
        }
        lbl(c, k == 2 ? (i == 0 ? 'NO₂ groups on one triangular face' : 'NO₂ groups in a plane through Co') : (i == 0 ? 'Cl next to Cl: 90°' : 'Cl opposite Cl: 180°'), Offset(r.center.dx, r.bottom - 34), size: 19, color: IX.inkSoft, w: FontWeight.w600);
      }
    },
    presets: {'cis/trans [PtCl₂(NH₃)₂]': {'cpx': 0}, 'cis/trans [CoCl₂(NH₃)₄]⁺': {'cpx': 1}, 'fac/mer [Co(NO₂)₃(NH₃)₃]': {'cpx': 2}},
  ),
  'vbt': Mode(
    title: 'Valence bond theory: inner and outer orbital complexes',
    subtitle: 'Coordination compounds · Bonding',
    formula: 'strong field → pair up → d²sp³ (inner)    weak field → sp³d² (outer)',
    titleOf: (v) => '${_vbtIon(v.i('n', 6))} with ${v.i('L') == 1 ? 'six CN⁻ (strong field)' : 'six H₂O / F⁻ (weak field)'}',
    defaults: {'n': 6, 'L': 1},
    knobs: [
      const Slide('n', '3d electrons of the metal ion', 1, 10, digits: 0, step: 1),
      const Pick('L', 'Ligands', ['Weak field (H₂O, F⁻)', 'Strong field (CN⁻, CO)'], ids: ['weak', 'strong']),
      const Note('Green arrows are electron pairs donated by the six ligands into the hybrid orbitals.'),
    ],
    readouts: (v) {
      final r = _vbt(v.i('n', 6).clamp(1, 10), v.i('L') == 1);
      return [Readout('Hybridisation', r.$2 ? 'd²sp³' : 'sp³d²', '', IX.accent), Readout('Type', r.$2 ? 'inner orbital, low spin' : 'outer orbital, high spin', '', IX.green), Readout('Unpaired electrons', '${r.$3}', '', IX.positive), Readout('μ (spin only)', _mu(r.$3).toStringAsFixed(2), 'BM')];
    },
    paint: (c, s, v) {
      final n = v.i('n', 6).clamp(1, 10);
      final r = _vbt(n, v.i('L') == 1);
      final d = r.$1;
      lbl(c, 'Free ion ${_vbtIon(n)}: 3d${sup(n)}', const Offset(80, 70), size: 22, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
      var x = 80.0;
      x += _boxes(c, Offset(x, 110), '3d', [for (final e in _fillD(n)) (e, 0)]) + 40;
      x += _boxes(c, Offset(x, 110), '4s', [(0, 0)]) + 40;
      x += _boxes(c, Offset(x, 110), '4p', [(0, 0), (0, 0), (0, 0)]) + 40;
      _boxes(c, Offset(x, 110), '4d', [for (var i = 0; i < 5; i++) (0, 0)]);
      lbl(c, 'In the complex', Offset(80, s.height * 0.42), size: 22, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
      final y2 = s.height * 0.42 + 40;
      x = 80.0;
      final inner = r.$2;
      final dBoxes = [for (var i = 0; i < 5; i++) (d[i], inner && i >= 3 ? 2 : 0)];
      final x3d = x;
      x += _boxes(c, Offset(x, y2), '3d', dBoxes) + 40;
      final x4s = x;
      x += _boxes(c, Offset(x, y2), '4s', [(0, 2)]) + 40;
      x += _boxes(c, Offset(x, y2), '4p', [(0, 2), (0, 2), (0, 2)]) + 40;
      final x4d = x;
      _boxes(c, Offset(x, y2), '4d', [for (var i = 0; i < 5; i++) (0, !inner && i < 2 ? 2 : 0)]);
      // Bracket over the six hybrid orbitals.
      final from = inner ? x3d + 3 * 54 : x4s, to = inner ? x4s + 4 * 54 + 40 : x4d + 2 * 54;
      final by = y2 + 54 + 58;
      c.drawLine(Offset(from, by), Offset(to, by), stroke(IX.green, 3));
      c.drawLine(Offset(from, by), Offset(from, by - 10), stroke(IX.green, 3));
      c.drawLine(Offset(to, by), Offset(to, by - 10), stroke(IX.green, 3));
      lbl(c, '${inner ? 'd²sp³' : 'sp³d²'} hybrid orbitals: octahedral', Offset((from + to) / 2, by + 26), size: 20, color: IX.green, w: FontWeight.w700);
      para(c, inner ? 'The strong-field ligands force the 3d electrons to pair, which frees two inner 3d orbitals for bonding. Fewer unpaired electrons: low spin.' : n <= 3 ? 'With three or fewer 3d electrons two 3d orbitals are free anyway, so even weak ligands give d²sp³.' : 'Weak-field ligands leave the 3d electrons unpaired (Hund), so the outer 4d orbitals are used. More unpaired electrons: high spin.', Offset(80, s.height - 150), s.width - 160, size: 19, color: IX.inkSoft);
    },
    presets: {'[Co(NH₃)₆]³⁺ d⁶ inner': {'n': 6, 'L': 1}, '[CoF₆]³⁻ d⁶ outer': {'n': 6, 'L': 0}, '[Fe(CN)₆]³⁻ d⁵': {'n': 5, 'L': 1}, '[Cr(NH₃)₆]³⁺ d³': {'n': 3, 'L': 0}},
  ),
  'magnetic': Mode(
    title: 'Spin-only magnetic moment',
    subtitle: 'd-block · Magnetic properties and colour',
    formula: 'μ = √(n(n + 2)) BM',
    titleOf: (v) => '${_ions[v.i('ion', 7).clamp(0, 11)].$1}(aq): 3d${sup(_ions[v.i('ion', 7).clamp(0, 11)].$2)}',
    defaults: {'ion': 7},
    knobs: [Pick('ion', '3d ion in water', [for (final x in _ions) x.$1], ids: [for (final x in _ions) ascii(x.$1)], chips: true), const Note('Unpaired electrons make an ion paramagnetic. d⁰ and d¹⁰ ions have no d–d transition, so they are colourless.')],
    readouts: (v) {
      final x = _ions[v.i('ion', 7).clamp(0, 11)];
      return [Readout('Unpaired electrons n', '${x.$3}', '', IX.positive), Readout('μ (spin only)', _mu(x.$3).toStringAsFixed(2), 'BM', IX.accent), Readout('Magnetism', x.$3 == 0 ? 'diamagnetic' : 'paramagnetic'), Readout('Colour', x.$5, '', IX.green)];
    },
    paint: (c, s, v) {
      final i = v.i('ion', 7).clamp(0, 11), x = _ions[i];
      lbl(c, '3d', const Offset(90, 120), size: 22, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
      for (final (j, e) in _fillD(x.$2).indexed) {
        orbitalBox(c, Rect.fromLTWH(140 + j * 70.0, 88, 70, 70), e);
      }
      _tube(c, Rect.fromLTWH(170, 230, 90, s.height - 400), x.$4, '${x.$1}(aq)');
      lbl(c, x.$5, Offset(215, s.height - 110), size: 18, color: IX.inkSoft);
      final pr = Rect.fromLTWH(s.width * 0.42, 90, s.width * 0.52, s.height - 220);
      final pl = Plot(pr, 0, 5.5, 0, 6.5);
      pl.axes(c, x: 'Unpaired electrons n', y: 'μ (BM)', dx: 1, dy: 1, title: 'μ rises with n');
      pl.curve(c, (n) => math.sqrt(n * (n + 2)), IX.rule, w: 2.5);
      for (var n = 0; n <= 5; n++) {
        pl.dot(c, n.toDouble(), _mu(n), n == x.$3 ? IX.accent : IX.steel, r0: n == x.$3 ? 11 : 7, label: n == x.$3 ? '${_mu(n).toStringAsFixed(2)} BM' : null);
        lbl(c, _mu(n).toStringAsFixed(2), pl.p(n.toDouble(), _mu(n)) + const Offset(0, 28), size: 14, color: IX.muted);
      }
    },
    presets: {'Ti³⁺ (d¹)': {'ion': 1}, 'Fe²⁺ (n = 4)': {'ion': 7}, 'Mn²⁺ (n = 5)': {'ion': 5}, 'Cu²⁺ (d⁹)': {'ion': 10}, 'Zn²⁺ (d¹⁰)': {'ion': 11}},
  ),
  'cfs': Mode(
    title: 'Crystal field splitting and colour',
    subtitle: 'Coordination compounds · Crystal field theory',
    formula: 'Δo vs P:  Δo < P high spin,  Δo > P low spin     λ = 1/Δo',
    titleOf: (v) => 'Octahedral d${sup(v.i('n', 4))} complex, Δo = ${v.g('D', 20000).toStringAsFixed(0)} cm⁻¹',
    defaults: {'D': 20000, 'P': 20000, 'n': 4},
    knobs: [
      const Slide('D', 'Splitting Δo', 8000, 40000, unit: 'cm⁻¹', digits: 0, step: 100),
      const Slide('P', 'Pairing energy P', 10000, 30000, unit: 'cm⁻¹', digits: 0, step: 100),
      const Slide('n', 'd electrons', 1, 10, digits: 0, step: 1),
    ],
    readouts: (v) {
      final r = _cft(v);
      final nm = 1e7 / v.g('D', 20000);
      final seen = _seen(nm);
      return [Readout('Configuration', 't₂g${sup(r.$1)} eg${sup(r.$2)}', '', IX.accent), Readout('Spin', v.i('n', 4) < 4 || v.i('n', 4) > 7 ? 'one arrangement only' : r.$4 ? 'low spin' : 'high spin', '', IX.positive), Readout('CFSE', '${nf(-0.4 * r.$1 + 0.6 * r.$2, 1)} Δo', '', IX.green), Readout('Unpaired', '${r.$3}'), Readout('Absorbs', '${nm.toStringAsFixed(0)} nm (${seen.$2})'), Readout('Looks', seen.$3, '', IX.amber)];
    },
    paint: (c, s, v) {
      final r = _cft(v), d = v.g('D', 20000);
      final n = v.i('n', 4).clamp(1, 10);
      final cx = s.width * 0.08, mid = s.height * 0.5;
      final sc = math.min(0.016, 560 / d); // px per cm⁻¹
      level(c, cx, cx + 230, mid - 40, IX.inkSoft, w: 3);
      for (var j = 0; j < 5; j++) {
        orbitalBox(c, Rect.fromLTWH(cx + j * 46.0, mid - 40 - 50, 44, 44), 0);
      }
      lbl(c, 'free ion: five d orbitals', Offset(cx + 115, mid - 40 + 30), size: 17, color: IX.inkSoft);
      final x0 = s.width * 0.32;
      final yT = mid - 40 + 0.4 * d * sc, yE = mid - 40 - 0.6 * d * sc;
      IxPaint.dashed(c, Offset(cx + 240, mid - 40), Offset(x0 + 320, mid - 40), Paint()..color = IX.muted..strokeWidth = 1.5);
      lbl(c, 'barycentre', Offset(x0 + 330, mid - 40), size: 15, color: IX.muted, align: Alignment.centerLeft);
      c.drawLine(Offset(cx + 230, mid - 40), Offset(x0, yE), stroke(IX.rule, 2));
      c.drawLine(Offset(cx + 230, mid - 40), Offset(x0, yT), stroke(IX.rule, 2));
      final eg = _split(r.$2, 2), t2 = _split(r.$1, 3);
      for (var j = 0; j < 2; j++) {
        orbitalBox(c, Rect.fromLTWH(x0 + 50 + j * 70.0, yE - 64, 60, 60), eg[j], hi: true);
      }
      for (var j = 0; j < 3; j++) {
        orbitalBox(c, Rect.fromLTWH(x0 + 15 + j * 70.0, yT - 64, 60, 60), t2[j]);
      }
      lbl(c, 'eg  +0.6 Δo', Offset(x0 + 240, yE - 34), size: 18, color: IX.positive, w: FontWeight.w700, align: Alignment.centerLeft);
      lbl(c, 't₂g  −0.4 Δo', Offset(x0 + 240, yT - 34), size: 18, color: IX.accent, w: FontWeight.w700, align: Alignment.centerLeft);
      IxPaint.arrow(c, Offset(x0 - 20, yT - 34), Offset(x0 - 20, yE - 34), IX.ink, width: 2.6);
      IxPaint.arrow(c, Offset(x0 - 20, yE - 34), Offset(x0 - 20, yT - 34), IX.ink, width: 2.6);
      lbl(c, 'Δo', Offset(x0 - 32, (yT + yE) / 2 - 34), size: 20, color: IX.ink, w: FontWeight.w700, align: Alignment.centerRight);
      lbl(c, r.$4 ? 'Δo > P: pair in t₂g first' : n >= 4 && n <= 7 ? 'Δo < P: go up to eg before pairing' : 'd${sup(n)}: same either way', Offset(x0 + 140, s.height - 60), size: 19, color: IX.inkSoft, w: FontWeight.w600);
      // Spectrum, absorbed band and the tube.
      final nm = 1e7 / d;
      final sr = Rect.fromLTWH(s.width * 0.66, 120, s.width * 0.3, 40);
      for (var i = 0; i < sr.width; i++) {
        c.drawLine(Offset(sr.left + i, sr.top), Offset(sr.left + i, sr.bottom), stroke(_hue(380 + 370 * i / sr.width), 1.2));
      }
      lbl(c, 'Visible light 380–750 nm', Offset(sr.center.dx, sr.top - 22), size: 17, color: IX.inkSoft, w: FontWeight.w600);
      lbl(c, '400', Offset(sr.left + 20 / 370 * sr.width, sr.bottom + 18), size: 14, color: IX.muted);
      lbl(c, '700', Offset(sr.left + 320 / 370 * sr.width, sr.bottom + 18), size: 14, color: IX.muted);
      if (nm >= 380 && nm <= 750) {
        final x = sr.left + (nm - 380) / 370 * sr.width;
        c.drawRect(Rect.fromLTRB(x - 14, sr.top - 6, x + 14, sr.bottom + 6), stroke(IX.ink, 3));
        lbl(c, 'absorbed ${nm.toStringAsFixed(0)} nm', Offset(x, sr.bottom + 44), size: 16, color: IX.ink, w: FontWeight.w700, halo: true);
      } else {
        lbl(c, nm < 380 ? 'absorbs in the UV (${nm.toStringAsFixed(0)} nm)' : 'absorbs in the IR (${nm.toStringAsFixed(0)} nm)', Offset(sr.center.dx, sr.bottom + 44), size: 16, color: IX.ink, w: FontWeight.w700);
      }
      final seen = _seen(nm);
      final col = n == 10 ? const Color(0xFFF2F4F8) : seen.$1;
      _tube(c, Rect.fromLTWH(sr.center.dx - 50, sr.bottom + 100, 100, s.height - sr.bottom - 230), Color.lerp(col, Colors.white, 0.15)!, n == 10 ? 'd¹⁰: colourless' : 'looks ${seen.$3}');
    },
    presets: {'[Ti(H₂O)₆]³⁺': {'D': 20300, 'P': 20000, 'n': 1}, '[Fe(H₂O)₆]²⁺ high spin': {'D': 10400, 'P': 17600, 'n': 6}, '[Fe(CN)₆]⁴⁻ low spin': {'D': 32800, 'P': 17600, 'n': 6}, '[Cu(H₂O)₆]²⁺': {'D': 12600, 'P': 20000, 'n': 9}},
  ),
  'ean': Mode(
    title: 'Effective atomic number',
    subtitle: 'Coordination compounds · Sidgwick EAN rule',
    formula: 'EAN = Z − (oxidation state) + 2 × (ligand donor atoms)',
    defaults: {'Z': 26, 'ox': 0, 'L': 5},
    knobs: [
      const Slide('Z', 'Atomic number of the metal', 20, 80, digits: 0, step: 1),
      const Slide('ox', 'Oxidation state', 0, 4, digits: 0, step: 1),
      const Slide('L', 'Ligand donor atoms (2 e⁻ each)', 2, 8, digits: 0, step: 1),
    ],
    readouts: (v) {
      final z = v.i('Z', 26), ox = v.i('ox'), l = v.i('L', 5);
      final e = z - ox + 2 * l;
      final gas = const [(36, 'Kr'), (54, 'Xe'), (86, 'Rn')].firstWhere((g) => g.$1 >= e, orElse: () => (86, 'Rn'));
      return [Readout('Metal electrons', '${z - ox}'), Readout('Donated', '${2 * l}', '', IX.green), Readout('EAN', '$e', '', IX.accent), Readout('Nearest noble gas', '${gas.$2} (${gas.$1})', '', e == gas.$1 ? IX.green : IX.amber)];
    },
    paint: (c, s, v) {
      final z = v.i('Z', 26), ox = v.i('ox'), l = v.i('L', 5);
      final e = z - ox + 2 * l;
      final r = Rect.fromLTWH(140, 160, s.width - 280, 120);
      final pl = Plot(r, 0, 100, 0, 1);
      final mx = pl.px((z - ox).toDouble()), ex = pl.px(e.toDouble());
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(r.left, r.top, mx, r.bottom), const Radius.circular(10)), fill(const Color(0xFF5468A8)));
      c.drawRect(Rect.fromLTRB(mx, r.top, ex, r.bottom), fill(IX.green));
      lbl(c, 'metal ${z - ox} e⁻', Offset((r.left + mx) / 2, r.center.dy), size: 22, color: Colors.white, w: FontWeight.w700);
      if (ex - mx > 60) lbl(c, '+${2 * l}', Offset((mx + ex) / 2, r.center.dy), size: 22, color: Colors.white, w: FontWeight.w700);
      for (final g in const [(18, 'Ar'), (36, 'Kr'), (54, 'Xe'), (86, 'Rn')]) {
        final x = pl.px(g.$1.toDouble());
        IxPaint.dashed(c, Offset(x, r.top - 40), Offset(x, r.bottom + 40), Paint()..color = IX.positive..strokeWidth = 2);
        lbl(c, '${g.$2} ${g.$1}', Offset(x, r.top - 56), size: 18, color: IX.positive, w: FontWeight.w700);
      }
      for (var t = 0; t <= 100; t += 10) {
        lbl(c, '$t', Offset(pl.px(t.toDouble()), r.bottom + 60), size: 14, color: IX.muted);
      }
      lbl(c, 'EAN = $z − $ox + 2 × $l = $e', Offset(s.width / 2, r.bottom + 140), size: 34, color: IX.ink, w: FontWeight.w700);
      final hit = [18, 36, 54, 86].contains(e);
      tag(c, hit ? 'Matches a noble gas: the EAN rule is obeyed' : 'Not a noble-gas number: the rule is not obeyed', Offset(s.width / 2, r.bottom + 210), hit ? IX.green : IX.amber, size: 21);
      para(c, 'Examples: Fe(CO)₅ 26 − 0 + 10 = 36; [Co(NH₃)₆]³⁺ 27 − 3 + 12 = 36; Ni(CO)₄ 28 + 8 = 36; [Fe(CN)₆]³⁻ 26 − 3 + 12 = 35. The rule works for many carbonyls but not for every complex.', Offset(140, s.height - 170), s.width - 280, size: 19, color: IX.inkSoft);
    },
    presets: {'Fe(CO)₅': {'Z': 26, 'ox': 0, 'L': 5}, 'Ni(CO)₄': {'Z': 28, 'ox': 0, 'L': 4}, '[Co(NH₃)₆]³⁺': {'Z': 27, 'ox': 3, 'L': 6}, '[Fe(CN)₆]³⁻': {'Z': 26, 'ox': 3, 'L': 6}, '[PtCl₆]²⁻': {'Z': 78, 'ox': 4, 'L': 6}},
  ),
};

String _vbtIon(int n) => const ['', 'Ti³⁺', 'V³⁺', 'Cr³⁺', 'Mn³⁺', 'Fe³⁺', 'Co³⁺', 'Co²⁺', 'Ni²⁺', 'Cu²⁺', 'Zn²⁺'][n.clamp(1, 10)];

/// (3d filling, inner?, unpaired) for [n] d electrons in an octahedral complex.
(List<int>, bool, int) _vbt(int n, bool strong) {
  final d = strong && n >= 4 ? [..._split(n, 3), 0, 0] : _fillD(n);
  if (strong && n > 6) {
    // Cannot empty two 3d orbitals: pair as far as possible, outer orbital complex.
    final f = _fillD(n, pair: false);
    return (f, false, f.where((e) => e == 1).length);
  }
  final free = d.where((e) => e == 0).length;
  final inner = free >= 2;
  return (d, inner, d.where((e) => e == 1).length);
}

/// (t₂g electrons, eg electrons, unpaired, low spin?)
(int, int, int, bool) _cft(V v) {
  final n = v.i('n', 4).clamp(1, 10), low = v.g('D', 20000) > v.g('P', 20000);
  int t, e;
  if (low) {
    t = math.min(n, 6);
    e = n - t;
  } else {
    final first = math.min(n, 5);
    t = math.min(first, 3) + math.max(0, math.min(n - 5, 3));
    e = n - t;
  }
  final unp = _split(t, 3).where((x) => x == 1).length + _split(e, 2).where((x) => x == 1).length;
  return (t, e, unp, low && n >= 4 && n <= 7);
}

/// Spreads [k] electrons over [boxes] degenerate orbitals (Hund).
List<int> _split(int k, int boxes) => [for (var i = 0; i < boxes; i++) (k > i ? 1 : 0) + (k > boxes + i ? 1 : 0)];
