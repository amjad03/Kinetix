import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'kit.dart';

/// Units and measurement (1st PUC ch. 1) and errors in measurement (ch. 17): units, least count
/// and significant figures, dimensional analysis, accuracy versus precision, and an error budget.
final measurementSpec = InstrumentSpec(
  id: 'measurement',
  chapter: '1st PUC Physics · Units and measurement',
  modes: {'units': _units, 'sigfig': _sigfig, 'dimensions': _dimensions, 'target': _target, 'gerror': _gerror},
);

/// A ruler from 0 to [cm] across [r], with mm ticks.
void _ruler(Canvas c, Rect r, double cm) {
  c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(6)), Draw.fill(const Color(0xFFF7EBD5)));
  c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(6)), Draw.stroke(const Color(0xFFC9AE7E), 1.5));
  final ppc = r.width / cm;
  for (var i = 0; i <= (cm * 10).round(); i++) {
    final x = r.left + i * ppc / 10;
    final len = i % 10 == 0 ? 26.0 : (i % 5 == 0 ? 18.0 : 10.0);
    c.drawLine(Offset(x, r.top), Offset(x, r.top + len), Draw.stroke(IX.ink, i % 10 == 0 ? 2 : 1.2));
    if (i % 10 == 0) Draw.text(c, '${i ~/ 10}', Offset(x, r.top + 40), size: 16, color: IX.ink, w: FontWeight.w500);
  }
}

// ── units: same pencil, different numbers ──

const _unitNames = ['millimetre (mm)', 'centimetre (cm)', 'metre (m)'];
const _unitCm = [0.1, 1.0, 100.0];

final _units = ModeSpec(
  title: 'One pencil, three units',
  formula: 'L = n u  ⇒  n ∝ 1/u',
  values: {'L': 15, 'u': 1},
  controls: (v) => const [Sl('L', 'Pencil length', 5, 20, unit: 'cm', div: 30), Seg('u', 'Measure in', _unitNames)],
  presets: {'In mm': {'u': 0}, 'In cm': {'u': 1}, 'In m': {'u': 2}},
  readouts: (v) {
    final l = v['L']!, u = _unitCm[v['u']!.round()];
    return [Readout('Number n = L/u', l / u >= 1 ? fx(l / u, l / u >= 100 ? 0 : 1) : fx(l / u, 3), '', IX.accent), Readout('Unit size u', fx(u, u < 1 ? 1 : 0), 'cm'), Readout('Length (unchanged)', fx(l, 1), 'cm', IX.positive)];
  },
  paint: (c, s, v, t) {
    final l = v['L']!, ui = v['u']!.round();
    final top = Rect.fromLTWH(0, 0, s.width, s.height * 0.5);
    final ppc = (top.width - 160) / 22;
    final x0 = 80.0, y = 150.0;
    // Pencil.
    final body = Rect.fromLTWH(x0, y - 20, l * ppc - 50, 40);
    c.drawRect(body, Draw.fill(const Color(0xFFE8B84A)));
    c.drawRect(Rect.fromLTWH(x0, y - 20, 30, 40), Draw.fill(const Color(0xFFE79AA0)));
    final tip = Path()..moveTo(body.right, body.top)..lineTo(x0 + l * ppc, y)..lineTo(body.right, body.bottom)..close();
    c.drawPath(tip, Draw.fill(const Color(0xFFF2D7B0)));
    c.drawPath(Path()..moveTo(x0 + l * ppc - 14, y - 6)..lineTo(x0 + l * ppc, y)..lineTo(x0 + l * ppc - 14, y + 6)..close(), Draw.fill(IX.ink));
    _ruler(c, Rect.fromLTWH(x0, y + 34, 22 * ppc, 56), 22);
    Draw.text(c, 'cm', Offset(x0 + 22 * ppc + 30, y + 74), size: 16, color: IX.inkSoft);
    final n = l / _unitCm[ui];
    Draw.tag(c, 'L = ${n >= 1 ? fx(n, n >= 100 ? 0 : 1) : fx(n, 3)} ${['mm', 'cm', 'm'][ui]}', Offset(top.center.dx, y + 150), color: IX.accent, size: 24);
    Draw.bars(c, Rect.fromLTRB(26, top.bottom, s.width - 26, s.height - 22), [('in mm', l * 10, ui == 0 ? IX.accent : IX.muted), ('in cm', l, ui == 1 ? IX.accent : IX.muted), ('in m', l / 100, ui == 2 ? IX.accent : IX.muted)], title: 'Number n for each unit (same pencil)', dp: 2);
  },
);

// ── least count and significant figures ──

const _instr = ['Metre scale (0.1 cm)', 'Vernier callipers (0.01 cm)', 'Screw gauge (0.001 cm)'];

int _sigFigs(String s) {
  final digits = s.replaceAll('.', '').replaceFirst(RegExp(r'^0+'), '');
  return digits.length;
}

final _sigfig = ModeSpec(
  title: 'How many significant figures can you claim?',
  formula: 'certain digits + one uncertain',
  values: {'len': 2.4637, 'lc': 0},
  controls: (v) => const [Seg('lc', 'Instrument', _instr), Sl('len', 'True length of the rod', 0.5, 9.5, unit: 'cm', dp: 4)],
  presets: {'Metre scale': {'lc': 0}, 'Vernier': {'lc': 1}, 'Screw gauge': {'lc': 2}},
  drag: (v, p, s, start) {
    final ppc = (s.width - 200) / 10;
    v['len'] = ((p.dx - 100) / ppc).clamp(0.5, 9.5);
    return true;
  },
  readouts: (v) {
    final lc = v['lc']!.round() + 1;
    final rep = v['len']!.toStringAsFixed(lc);
    return [Readout('Reading you can report', rep, 'cm', IX.accent), Readout('Significant figures', '${_sigFigs(rep)}', '', IX.positive), Readout('Least count', fx(math.pow(10, -lc).toDouble(), lc), 'cm')];
  },
  paint: (c, s, v, t) {
    final len = v['len']!, lc = v['lc']!.round() + 1;
    final ppc = (s.width - 200) / 10;
    const x0 = 100.0, y = 160.0;
    Draw.block(c, Rect.fromLTWH(x0, y - 50, len * ppc, 40), IX.steel, radius: 4);
    _ruler(c, Rect.fromLTWH(x0, y, 10 * ppc, 60), 10);
    IxPaint.handle(c, Offset(x0 + len * ppc, y - 30), IX.accent, r: 14);
    // Magnifier: the reading digit by digit.
    final rep = len.toStringAsFixed(lc);
    final box = Rect.fromCenter(center: Offset(s.width / 2, s.height * 0.62), width: 760, height: 220);
    c.drawRRect(RRect.fromRectAndRadius(box, const Radius.circular(20)), Draw.fill(const Color(0xFFFAFBFE)));
    c.drawRRect(RRect.fromRectAndRadius(box, const Radius.circular(20)), Draw.stroke(IX.rule, 2));
    Draw.text(c, _instr[lc - 1], Offset(box.center.dx, box.top + 34), size: 20, color: IX.inkSoft);
    final chars = rep.split('');
    double wOf(String ch) => ch == '.' ? 22 : 44;
    final total = chars.fold(0.0, (a, ch) => a + wOf(ch));
    var x = box.center.dx - total / 2;
    for (var i = 0; i < chars.length; i++) {
      final last = i == chars.length - 1;
      final col = chars[i] == '.' ? IX.ink : (last ? IX.positive : IX.accent);
      Draw.text(c, chars[i], Offset(x + wOf(chars[i]) / 2, box.center.dy + 10), size: 64, color: col);
      x += wOf(chars[i]);
    }
    Draw.text(c, 'cm', Offset(x + 40, box.center.dy + 20), size: 28, color: IX.inkSoft);
    Draw.text(c, 'blue: certain digits      orange: first uncertain digit', Offset(box.center.dx, box.bottom - 26), size: 17, color: IX.inkSoft);
    Draw.caption(c, 'Drag the end of the rod.', at: Offset(28, s.height - 40));
  },
);

// ── dimensional analysis of the pendulum ──

final _dimensions = ModeSpec(
  title: 'Find the pendulum formula by dimensions',
  formula: 'T = k mᵃ lᵇ gᶜ  ⇒  [Mᵃ Lᵇ⁺ᶜ T⁻²ᶜ] = [T]',
  values: {'a': 1, 'b': 1, 'c': 0},
  controls: (v) => const [Sl('a', 'Power of mass, a', -2, 2, div: 8), Sl('b', 'Power of length, b', -2, 2, div: 8), Sl('c', 'Power of g, c', -2, 2, div: 8)],
  presets: {'Start': {'a': 1, 'b': 1, 'c': 0}, 'Solution': {'a': 0, 'b': 0.5, 'c': -0.5}},
  readouts: (v) {
    final a = v['a']!, b = v['b']!, cc = v['c']!;
    final ok = a.abs() < 1e-6 && (b + cc).abs() < 1e-6 && (-2 * cc - 1).abs() < 1e-6;
    return [Readout('Power of M', fx(a, 1), '', IX.accent), Readout('Power of L', fx(b + cc, 1), '', IX.green), Readout('Power of T', fx(-2 * cc, 1), '', IX.positive), Readout('Result', ok ? 'T = k√(l/g)  (k = 2π)' : 'not yet [T]', '')];
  },
  paint: (c, s, v, t) {
    final a = v['a']!, b = v['b']!, cc = v['c']!;
    final ok = a.abs() < 1e-6 && (b + cc).abs() < 1e-6 && (-2 * cc - 1).abs() < 1e-6;
    final left = Rect.fromLTWH(0, 0, s.width * 0.36, s.height);
    final piv = Offset(left.center.dx, 80);
    c.drawLine(piv - const Offset(90, 0), piv + const Offset(90, 0), Draw.stroke(IX.inkSoft, 5));
    final bob = piv + Offset(math.sin(0.35), math.cos(0.35)) * 380;
    c.drawLine(piv, bob, Draw.stroke(IX.ink, 2.5));
    Draw.ball(c, bob, 26, IX.accent);
    Draw.text(c, 'l', Offset.lerp(piv, bob, 0.5)! + const Offset(18, 0), size: 22, color: IX.ink);
    Draw.text(c, 'm', bob + const Offset(40, 0), size: 22, color: IX.accent);
    Draw.force(c, bob + const Offset(0, 30), bob + const Offset(0, 120), IX.positive, 'g', w: 4);
    Draw.tag(c, ok ? 'T = 2π√(l/g)' : 'T = k m^${fx(a, 1)} l^${fx(b, 1)} g^${fx(cc, 1)}', Offset(left.center.dx, s.height - 60), color: ok ? IX.green : IX.ink, size: 22);
    final r = Rect.fromLTRB(left.right, 26, s.width - 26, s.height - 26);
    c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(16)), Draw.fill(const Color(0xFFFAFBFE)));
    c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(16)), Draw.stroke(IX.rule, 1.5));
    Draw.text(c, 'Powers of M, L and T on the right side, against the target [T¹]', Offset(r.left + 20, r.top + 18), size: 18, align: Alignment.topLeft);
    final zero = r.center.dy + 20, unit = (r.height - 160) / 6;
    c.drawLine(Offset(r.left + 20, zero), Offset(r.right - 20, zero), Draw.stroke(IX.inkSoft, 2));
    for (final (i, (lab, val, target, col)) in [('M', a, 0.0, IX.accent), ('L', b + cc, 0.0, IX.green), ('T', -2 * cc, 1.0, IX.positive)].indexed) {
      final cx = r.left + r.width * (0.2 + i * 0.3);
      final h = val.clamp(-3.0, 3.0) * unit;
      c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(cx - 40, math.min(zero, zero - h), cx + 40, math.max(zero, zero - h)), const Radius.circular(6)), Draw.fill(col.withValues(alpha: 0.85)));
      final ty = zero - target * unit;
      IxPaint.dashed(c, Offset(cx - 70, ty), Offset(cx + 70, ty), Draw.stroke(IX.ink, 3), dash: 10, gap: 6);
      Draw.text(c, 'target ${fx(target, 0)}', Offset(cx + 74, ty), size: 15, color: IX.ink, align: Alignment.centerLeft);
      Draw.text(c, lab, Offset(cx, r.bottom - 30), size: 22, color: col);
      Draw.text(c, fx(val, 1), Offset(cx, val >= 0 ? zero - h - 18 : zero - h + 18), size: 18, color: col);
    }
  },
);

// ── accuracy and precision ──

final _target = ModeSpec(
  title: 'Accuracy and precision',
  chapter: '1st PUC Physics · Errors in measurement',
  formula: 'systematic → accuracy, random → precision',
  values: {'bias': 0, 'sd': 0.4, 'seed': 1},
  controls: (v) => const [Sl('bias', 'Systematic offset', 0, 4, div: 40), Sl('sd', 'Random scatter', 0.1, 2, div: 19), Sl('seed', 'New readings', 1, 20, div: 19, dp: 0)],
  presets: {'Accurate and precise': {'bias': 0, 'sd': 0.2}, 'Precise, not accurate': {'bias': 2.5, 'sd': 0.2}, 'Accurate, not precise': {'bias': 0, 'sd': 1.6}, 'Neither': {'bias': 2.5, 'sd': 1.6}},
  readouts: (v) {
    final pts = _readings(v);
    final mx = pts.fold(0.0, (a, p) => a + p.dx) / pts.length, my = pts.fold(0.0, (a, p) => a + p.dy) / pts.length;
    return [Readout('Offset of the mean', fx(math.sqrt(mx * mx + my * my), 2), 'units', IX.positive), Readout('Scatter (rms)', fx(v['sd']!, 2), 'units', IX.accent), Readout('Verdict', '${v['bias']! < 0.6 ? 'Accurate' : 'Not accurate'}, ${v['sd']! < 0.6 ? 'precise' : 'not precise'}', '')];
  },
  paint: (c, s, v, t) {
    final o = Offset(s.width * 0.42, s.height / 2), unit = (s.height - 120) / 12;
    for (var k = 5; k >= 1; k--) {
      c.drawCircle(o, k * unit * 1.1, Draw.fill(k.isOdd ? const Color(0xFFF1F4F9) : Colors.white));
      c.drawCircle(o, k * unit * 1.1, Draw.stroke(IX.rule, 2));
    }
    c.drawCircle(o, 10, Draw.fill(IX.positive));
    Draw.text(c, 'true value', o + const Offset(0, -26), size: 16, color: IX.positive, halo: true);
    final pts = _readings(v);
    for (final p in pts) {
      c.drawCircle(o + p * unit, 9, Draw.fill(IX.accent.withValues(alpha: 0.8)));
    }
    final mx = pts.fold(0.0, (a, p) => a + p.dx) / pts.length, my = pts.fold(0.0, (a, p) => a + p.dy) / pts.length;
    final m = o + Offset(mx, my) * unit;
    c.drawLine(m - const Offset(14, 0), m + const Offset(14, 0), Draw.stroke(IX.ink, 3));
    c.drawLine(m - const Offset(0, 14), m + const Offset(0, 14), Draw.stroke(IX.ink, 3));
    Draw.text(c, 'mean', m + const Offset(24, 0), size: 16, align: Alignment.centerLeft, halo: true);
    Draw.tag(c, 'Each dot is one reading.', Offset(s.width - 40, 50), align: Alignment.centerRight);
  },
);

List<Offset> _readings(V v) {
  final rnd = math.Random(v['seed']!.round());
  double gauss() => math.sqrt(-2 * math.log(1 - rnd.nextDouble())) * math.cos(2 * math.pi * rnd.nextDouble());
  return [for (var i = 0; i < 16; i++) Offset(v['bias']! + v['sd']! * gauss(), -v['bias']! * 0.5 + v['sd']! * gauss())];
}

// ── error budget for g ──

final _gerror = ModeSpec(
  title: 'Error budget for g from a pendulum',
  chapter: '1st PUC Physics · Errors in measurement',
  formula: 'Δg/g = ΔL/L + 2ΔT/T',
  values: {'L': 1, 'dL': 1, 'n': 10, 'lc': 0.2},
  controls: (v) => const [Sl('L', 'Length L', 0.4, 1.6, unit: 'm', div: 12), Sl('dL', 'Error in L', 0.5, 5, unit: 'mm', div: 9), Sl('n', 'Oscillations timed', 1, 50, div: 49, dp: 0), Sl('lc', 'Stopwatch least count', 0.1, 1, unit: 's', div: 9)],
  presets: {'Time 1 swing': {'n': 1}, 'Time 10 swings': {'n': 10}, 'Time 50 swings': {'n': 50}},
  readouts: (v) {
    final (tp, el, et) = _budget(v);
    return [Readout('Period T', fx(tp, 3), 's'), Readout('% error from L', fx(el, 2), '%', IX.accent), Readout('% error from T (×2)', fx(et, 2), '%', IX.positive), Readout('% error in g', fx(el + et, 2), '%', IX.ink)];
  },
  paint: (c, s, v, t) {
    final (tp, el, et) = _budget(v);
    final left = Rect.fromLTWH(0, 0, s.width * 0.4, s.height);
    final piv = Offset(left.center.dx, 70);
    final lpx = (s.height - 260) * v['L']! / 1.6;
    c.drawLine(piv - const Offset(90, 0), piv + const Offset(90, 0), Draw.stroke(IX.inkSoft, 5));
    final bob = piv + Offset(math.sin(0.15), math.cos(0.15)) * lpx;
    c.drawLine(piv, bob, Draw.stroke(IX.ink, 2.5));
    Draw.ball(c, bob, 20, IX.accent);
    Draw.dim(c, piv + const Offset(-110, 0), piv + Offset(-110, lpx), 'L = ${fx(v['L']!, 2)} ± ${fx(v['dL']! / 1000, 4)} m', off: -20);
    // Stopwatch.
    final sw = Offset(left.center.dx, s.height - 110);
    c.drawCircle(sw, 64, Draw.fill(Colors.white));
    c.drawCircle(sw, 64, Draw.stroke(IX.ink, 4));
    Draw.text(c, fx(tp * v['n']!, 1), sw, size: 26);
    Draw.text(c, '${fx(v['n']!, 0)} swings', sw + const Offset(0, 30), size: 14, color: IX.inkSoft);
    Draw.bars(c, Rect.fromLTRB(left.right + 10, 26, s.width - 26, s.height - 26), [('from L', el, IX.accent), ('from T', et, IX.positive), ('total in g', el + et, IX.ink)], title: 'Percentage error in g', unit: '%', dp: 2);
  },
);

(double, double, double) _budget(V v) {
  final tp = 2 * math.pi * math.sqrt(v['L']! / 9.8);
  final el = v['dL']! / 1000 / v['L']! * 100;
  final et = 2 * v['lc']! / (v['n']! * tp) * 100;
  return (tp, el, et);
}
