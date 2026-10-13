import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'eee_models.dart';

// Drawing the electrical engineering panels (KitElement) on a white card: the RLC circuit with
// its phasor diagram, results, power triangle and frequency response; three-phase phasors with
// the star or delta connection; the single-line diagram with its per-unit table and fault level;
// and the waveform generator's plot, values and harmonics. Panel words are in English, as in the
// textbooks; symbols follow IEC 60617 / IS 12032.

const _ink = Color(0xFF1B1F24);
const _muted = Color(0xFF6A7078);
const _grid = Color(0x22000000);
const _good = Color(0xFF0F8A5F);
const _bad = Color(0xFFC62828);

/// The phase colours of Indian practice: R red, Y yellow (drawn dark gold to read on white), B blue.
const phaseColors = [Color(0xFFC62828), Color(0xFFB58900), Color(0xFF1565C0)];

const _series = [Color(0xFF0F8A5F), Color(0xFFC62828), Color(0xFF1565C0), Color(0xFF8E5FB5), Color(0xFFD98A2B)];

void _text(Canvas canvas, String t, Offset at, {double size = 16, Color color = _ink, bool bold = false, TextAlign align = TextAlign.left, double maxWidth = 600}) {
  final tp = TextPainter(
    text: TextSpan(
      text: t,
      style: TextStyle(fontSize: size, color: color, fontWeight: bold ? FontWeight.w700 : FontWeight.w400, fontFamily: KxFonts.board, fontFamilyFallback: KxFonts.fallback),
    ),
    textDirection: TextDirection.ltr,
    maxLines: 1,
    ellipsis: '…',
  )..layout(maxWidth: math.max(0, maxWidth));
  final dx = switch (align) {
    TextAlign.right => at.dx - tp.width,
    TextAlign.center => at.dx - tp.width / 2,
    _ => at.dx,
  };
  tp.paint(canvas, Offset(dx, at.dy - tp.height / 2));
  tp.dispose();
}

Paint _stroke(Color c, double w) => Paint()
  ..color = c
  ..style = PaintingStyle.stroke
  ..strokeWidth = w
  ..strokeCap = StrokeCap.round
  ..strokeJoin = StrokeJoin.round;

void _dashed(Canvas canvas, Offset a, Offset b, Paint p, {double dash = 8, double gap = 6}) {
  final len = (b - a).distance;
  if (len == 0) return;
  final dir = (b - a) / len;
  for (var t = 0.0; t < len; t += dash + gap) {
    canvas.drawLine(a + dir * t, a + dir * math.min(len, t + dash), p);
  }
}

void _arrow(Canvas canvas, Offset from, Offset to, Color c, {double w = 3, double head = 14}) {
  final d = to - from;
  if (d.distance < 0.5) return;
  final u = d / d.distance, n = Offset(-u.dy, u.dx);
  final h = math.min(head, d.distance * 0.6);
  canvas.drawLine(from, to - u * h * 0.6, _stroke(c, w));
  final path = Path()
    ..moveTo(to.dx, to.dy)
    ..lineTo(to.dx - u.dx * h + n.dx * h * 0.45, to.dy - u.dy * h + n.dy * h * 0.45)
    ..lineTo(to.dx - u.dx * h - n.dx * h * 0.45, to.dy - u.dy * h - n.dy * h * 0.45)
    ..close();
  canvas.drawPath(path, Paint()..color = c);
}

/// A figure with about 4 significant digits.
String eeeNum(double v) {
  if (!v.isFinite) return '∞';
  final a = v.abs();
  // Fixed to [p] places without trailing zeros: 10.00 → 10, 47.10 → 47.1.
  String fixed(int p) {
    final s = v.toStringAsFixed(p);
    if (double.parse(s) == 0) return '0';
    return p == 0 ? s : s.replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
  }

  if (a == 0) return '0';
  if (a >= 10000) return fixed(0);
  if (a >= 100) return fixed(1);
  if (a >= 10) return fixed(2);
  if (a >= 0.001) return fixed(4);
  return v.toStringAsExponential(2);
}

/// [v] in [unit] with an SI prefix: 0.1 H → "100 mH", 4700 Ω → "4.7 kΩ".
String eeeSi(double v, String unit) {
  if (!v.isFinite) return '∞ $unit';
  final a = v.abs();
  for (final (f, p) in const [(1e9, 'G'), (1e6, 'M'), (1e3, 'k'), (1.0, ''), (1e-3, 'm'), (1e-6, 'µ'), (1e-9, 'n'), (1e-12, 'p')]) {
    if (a >= f * 0.9999 || f == 1e-12) return '${eeeNum(v / f)} $p$unit';
  }
  return '0 $unit';
}

// --- Shared: phasor diagrams and plots --------------------------------------------------------

/// Draws [phasors] from the centre of [r]: voltages scaled to the longest voltage, currents to
/// the longest current (each to the circle's radius, currents to 75 % of it) so both read.
void _phasorDiagram(Canvas canvas, Rect r, List<Phasor> phasors, List<Color> colors, {String? note}) {
  final c = r.center;
  final radius = math.min(r.width, r.height) / 2 - 40;
  canvas
    ..drawCircle(c, radius, _stroke(_grid, 1))
    ..drawLine(Offset(c.dx - radius - 12, c.dy), Offset(c.dx + radius + 12, c.dy), _stroke(_grid, 1))
    ..drawLine(Offset(c.dx, c.dy - radius - 12), Offset(c.dx, c.dy + radius + 12), _stroke(_grid, 1));
  double maxOf(bool current) => phasors.where((p) => p.current == current && p.mag.isFinite).fold(0.0, (m, p) => math.max(m, p.mag));
  final vMax = maxOf(false), iMax = maxOf(true);
  for (final (k, p) in phasors.indexed) {
    final top = p.current ? iMax : vMax;
    if (top <= 0 || !p.mag.isFinite) continue;
    final len = p.mag / top * radius * (p.current ? 0.75 : 1);
    if (len < 1) continue;
    final a = p.angle * math.pi / 180;
    final tip = c + Offset(math.cos(a), -math.sin(a)) * len;
    final col = colors[k % colors.length];
    _arrow(canvas, c, tip, col, w: p.current ? 2.4 : 3.4, head: p.current ? 12 : 16);
    final lab = c + Offset(math.cos(a), -math.sin(a)) * (len + 20);
    _text(canvas, _sub(p.label), lab, size: 17, bold: true, color: col, align: TextAlign.center);
  }
  _text(canvas, 'ωt = ${eeeNum(_wrap(phasors.isEmpty ? 0 : phasors.first.angle))}°', Offset(r.left + 8, r.bottom - 14), size: 13, color: _muted);
  if (note != null) _text(canvas, note, Offset(r.right - 8, r.bottom - 14), size: 13, color: _muted, align: TextAlign.right, maxWidth: r.width - 120);
}

double _wrap(double deg) => ((deg % 360) + 360) % 360;

/// "V_RY" → "VRY": the subscript run in, as on a board.
String _sub(String label) => label.replaceAll('_', '');

List<double> _ticks(double lo, double hi, [int count = 5]) {
  if (!(hi > lo)) return [lo];
  final raw = (hi - lo) / count;
  final mag = math.pow(10, (math.log(raw) / math.ln10).floor()).toDouble();
  final step = [1, 2, 2.5, 5, 10].map((m) => m * mag).firstWhere((s) => s >= raw, orElse: () => 10 * mag);
  return [for (var v = (lo / step).ceil() * step; v <= hi + step * 1e-6; v += step) double.parse(v.toStringAsFixed(8))];
}

/// Axes, grid and labels for a plot in [r]; returns the inner plot rect and the mapping.
({Rect plot, Offset Function(double x, double y) at}) _axes(Canvas canvas, Rect r, double x0, double x1, double y0, double y1, String xLabel, String yLabel) {
  final plot = Rect.fromLTRB(r.left + 64, r.top + 8, r.right - 12, r.bottom - 40);
  Offset at(double x, double y) => Offset(plot.left + (x - x0) / (x1 - x0) * plot.width, plot.bottom - (y - y0) / (y1 - y0) * plot.height);
  final g = _stroke(_grid, 1);
  for (final t in _ticks(y0, y1)) {
    final y = at(x0, t).dy;
    canvas.drawLine(Offset(plot.left, y), Offset(plot.right, y), g);
    _text(canvas, eeeNum(t), Offset(plot.left - 6, y), size: 12, color: _muted, align: TextAlign.right);
  }
  for (final t in _ticks(x0, x1, 6)) {
    final x = at(t, y0).dx;
    canvas.drawLine(Offset(x, plot.top), Offset(x, plot.bottom), g);
    _text(canvas, eeeNum(t), Offset(x, plot.bottom + 12), size: 12, color: _muted, align: TextAlign.center);
  }
  canvas.drawRect(plot, _stroke(_ink.withValues(alpha: 0.6), 1.2));
  if (y0 < 0 && y1 > 0) canvas.drawLine(at(x0, 0), at(x1, 0), _stroke(_ink.withValues(alpha: 0.5), 1.2));
  _text(canvas, xLabel, Offset(plot.center.dx, r.bottom - 10), size: 13, align: TextAlign.center);
  canvas
    ..save()
    ..translate(r.left + 12, plot.center.dy)
    ..rotate(-math.pi / 2);
  _text(canvas, yLabel, Offset.zero, size: 13, align: TextAlign.center);
  canvas.restore();
  return (plot: plot, at: at);
}

void _curve(Canvas canvas, Rect clip, List<Offset> pts, Paint p, {bool dashed = false}) {
  if (pts.length < 2) return;
  canvas
    ..save()
    ..clipRect(clip.inflate(1));
  if (dashed) {
    for (var i = 0; i < pts.length - 1; i += 2) {
      canvas.drawLine(pts[i], pts[i + 1], p);
    }
  } else {
    final path = Path()..moveTo(pts.first.dx, pts.first.dy);
    for (final q in pts.skip(1)) {
      path.lineTo(q.dx, q.dy);
    }
    canvas.drawPath(path, p);
  }
  canvas.restore();
}

// --- Circuit symbols on the panels (IEC 60617) -------------------------------------------------

void _resistor(Canvas canvas, Offset a, Offset b, Paint p) {
  // A rectangle along a→b, 3:1.
  final d = b - a, len = d.distance, u = d / len, n = Offset(-u.dy, u.dx);
  final w = math.min(70.0, len * 0.6), h = w / 3;
  final m = (a + b) / 2;
  canvas
    ..drawLine(a, m - u * w / 2, p)
    ..drawLine(m + u * w / 2, b, p)
    ..drawPath(
      Path()
        ..moveTo((m - u * w / 2 + n * h / 2).dx, (m - u * w / 2 + n * h / 2).dy)
        ..lineTo((m + u * w / 2 + n * h / 2).dx, (m + u * w / 2 + n * h / 2).dy)
        ..lineTo((m + u * w / 2 - n * h / 2).dx, (m + u * w / 2 - n * h / 2).dy)
        ..lineTo((m - u * w / 2 - n * h / 2).dx, (m - u * w / 2 - n * h / 2).dy)
        ..close(),
      p,
    );
}

void _inductor(Canvas canvas, Offset a, Offset b, Paint p) {
  // Four half-loops along a→b.
  final d = b - a, len = d.distance, u = d / len, n = Offset(-u.dy, u.dx);
  final w = math.min(80.0, len * 0.7), r = w / 8;
  final m = (a + b) / 2, s = m - u * w / 2;
  canvas
    ..drawLine(a, s, p)
    ..drawLine(m + u * w / 2, b, p);
  final path = Path()..moveTo(s.dx, s.dy);
  for (var k = 0; k < 4; k++) {
    for (var j = 1; j <= 12; j++) {
      final t = math.pi * j / 12;
      final q = s + u * (r * (2 * k + 1) - r * math.cos(t)) + n * (r * math.sin(t));
      path.lineTo(q.dx, q.dy);
    }
  }
  canvas.drawPath(path, p);
}

void _capacitor(Canvas canvas, Offset a, Offset b, Paint p) {
  final d = b - a, len = d.distance, u = d / len, n = Offset(-u.dy, u.dx);
  const gap = 12.0, plate = 22.0;
  final m = (a + b) / 2;
  canvas
    ..drawLine(a, m - u * gap / 2, p)
    ..drawLine(m + u * gap / 2, b, p)
    ..drawLine(m - u * gap / 2 + n * plate, m - u * gap / 2 - n * plate, _stroke(p.color, p.strokeWidth + 1))
    ..drawLine(m + u * gap / 2 + n * plate, m + u * gap / 2 - n * plate, _stroke(p.color, p.strokeWidth + 1));
}

void _acSource(Canvas canvas, Offset c, double r, Paint p) {
  canvas.drawCircle(c, r, p);
  final path = Path()..moveTo(c.dx - r * 0.6, c.dy);
  for (var j = 1; j <= 24; j++) {
    final t = j / 24;
    path.lineTo(c.dx - r * 0.6 + t * r * 1.2, c.dy - math.sin(t * 2 * math.pi) * r * 0.32);
  }
  canvas.drawPath(path, p);
}

/// Series or parallel RLC, in [r]: the supply on the left.
void _rlcSchematic(Canvas canvas, Rect r, RlcCircuit m, Color accent) {
  final p = _stroke(_ink, 2.4);
  final left = r.left + 50, right = r.right - 30, top = r.top + 40, bottom = r.bottom - 30;
  final src = Offset(left, (top + bottom) / 2);
  canvas
    ..drawLine(Offset(left, top), src - const Offset(0, 26), p)
    ..drawLine(src + const Offset(0, 26), Offset(left, bottom), p);
  _acSource(canvas, src, 26, p);
  _text(canvas, '${eeeNum(m.v)} V, ${eeeNum(m.f)} Hz', src + const Offset(34, 0), size: 14, color: _muted);
  final parts = <(String, void Function(Offset, Offset))>[
    ('R = ${eeeSi(m.r, 'Ω')}', (a, b) => _resistor(canvas, a, b, p)),
    if (m.hasL) ('L = ${eeeSi(m.l, 'H')}', (a, b) => _inductor(canvas, a, b, p)),
    if (m.hasC) ('C = ${eeeSi(m.c, 'F')}', (a, b) => _capacitor(canvas, a, b, p)),
  ];
  if (m.topology == RlcTopology.series) {
    // Along the top wire, then down the right and back along the bottom.
    final x0 = left + 0.0, w = (right - x0) / parts.length;
    for (final (k, (label, draw)) in parts.indexed) {
      final a = Offset(x0 + w * k, top), b = Offset(x0 + w * (k + 1), top);
      draw(a, b);
      _text(canvas, label, Offset((a.dx + b.dx) / 2, top - 26), size: 15, align: TextAlign.center, color: accent, bold: true);
    }
    canvas
      ..drawLine(Offset(right, top), Offset(right, bottom), p)
      ..drawLine(Offset(right, bottom), Offset(left, bottom), p);
    _arrow(canvas, Offset(left + 70, bottom), Offset(left + 110, bottom), _bad, w: 2.4, head: 12);
    _text(canvas, 'I', Offset(left + 90, bottom - 16), size: 16, bold: true, color: _bad, align: TextAlign.center);
  } else {
    final x0 = left + 110, w = (right - x0) / math.max(1, parts.length - 1 + 0.0001);
    final xs = [for (var k = 0; k < parts.length; k++) parts.length == 1 ? (x0 + right) / 2 : x0 + w * k];
    canvas
      ..drawLine(Offset(left, top), Offset(xs.last, top), p)
      ..drawLine(Offset(left, bottom), Offset(xs.last, bottom), p);
    for (final (k, (label, draw)) in parts.indexed) {
      draw(Offset(xs[k], top), Offset(xs[k], bottom));
      _text(canvas, label, Offset(xs[k] + 14, (top + bottom) / 2 - 50), size: 15, color: accent, bold: true, maxWidth: 160);
    }
    _arrow(canvas, Offset(left + 40, top), Offset(left + 80, top), _bad, w: 2.4, head: 12);
    _text(canvas, 'I', Offset(left + 60, top - 16), size: 16, bold: true, color: _bad, align: TextAlign.center);
  }
}

// --- RLC panel ---------------------------------------------------------------------------------

void paintRlc(Canvas canvas, RlcCircuit m, Size size, Color accent) {
  _text(canvas, m.title, const Offset(24, 32), size: 24, bold: true, color: accent, maxWidth: size.width - 48);
  final res = m.solve();
  _rlcSchematic(canvas, const Rect.fromLTRB(24, 64, 600, 300), m, accent);
  // Results.
  final f0 = m.resonance, q = m.qFactor, bw = m.bandwidth;
  final kind = res.lagging ? 'lagging (inductive)' : (res.leading ? 'leading (capacitive)' : 'unity (resistive)');
  final lines = <(String, Color)>[
    if (m.topology == RlcTopology.series) ('Z = R + j(X_L − X_C) = ${eeeNum(res.r)} ${res.x < 0 ? '−' : '+'} j${eeeNum(res.x.abs())} Ω', _ink) else ('1/Z = 1/R + j(ωC − 1/ωL);  Z = ${eeeNum(res.r)} ${res.x < 0 ? '−' : '+'} j${eeeNum(res.x.abs())} Ω', _ink),
    ('X_L = ${eeeNum(res.xl)} Ω    X_C = ${eeeNum(res.xc)} Ω    |Z| = ${eeeNum(res.z)} Ω', _ink),
    ('φ = ${eeeNum(res.phi)}°    I = ${eeeNum(res.i)} A', _ink),
    ('Power factor cos φ = ${res.pf.toStringAsFixed(3)} $kind', res.lagging || res.leading ? _ink : _good),
    ('P = ${eeeSi(res.p, 'W')}    Q = ${eeeSi(res.q, 'var')}    S = ${eeeSi(res.s, 'VA')}', _ink),
    if (f0 != null) ('Resonance f₀ = 1/(2π√LC) = ${eeeNum(f0)} Hz', accent) else ('No resonance without both L and C', _muted),
    if (q != null && bw != null) ('Q factor = ${eeeNum(q)}    bandwidth f₀/Q = ${eeeNum(bw)} Hz', accent),
  ];
  for (final (k, (t, c)) in lines.indexed) {
    _text(canvas, t, Offset(28, 334 + k * 36.0), size: 18, color: c, maxWidth: 570, bold: k == 3);
  }
  if (m.showTriangle) _powerTriangle(canvas, const Rect.fromLTRB(24, 612, 600, 862), res, accent);
  // Phasors.
  final colors = m.topology == RlcTopology.series ? [_bad, _series[0], _series[2], _series[3], accent] : [accent, _series[0], _series[2], _series[3], _bad];
  _phasorDiagram(
    canvas,
    const Rect.fromLTRB(620, 56, 1216, 520),
    res.phasors,
    colors,
    note: m.topology == RlcTopology.series ? 'Reference: I (common to all). Voltages and currents to their own scales.' : 'Reference: V (common to all). Voltages and currents to their own scales.',
  );
  _text(canvas, 'Phasor diagram', const Offset(628, 72), size: 16, bold: true);
  if (m.showResponse) _rlcResponse(canvas, const Rect.fromLTRB(620, 540, 1216, 862), m, accent);
}

void _powerTriangle(Canvas canvas, Rect r, RlcResult res, Color accent) {
  _text(canvas, 'Power triangle', Offset(r.left + 4, r.top + 10), size: 16, bold: true);
  if (!(res.s > 0) || !res.s.isFinite) return;
  final box = Rect.fromLTRB(r.left + 60, r.top + 34, r.right - 160, r.bottom - 34);
  final k = math.min(box.width / math.max(res.p.abs(), 1e-9), box.height / math.max(res.q.abs(), 1e-9));
  final scale = math.min(k, box.width / res.s);
  final origin = Offset(box.left, res.q >= 0 ? box.bottom : box.top);
  final pEnd = origin + Offset(res.p * scale, 0);
  final sEnd = pEnd + Offset(0, -res.q * scale);
  _arrow(canvas, origin, pEnd, _series[0], w: 3);
  _arrow(canvas, pEnd, sEnd, _series[2], w: 3);
  _arrow(canvas, origin, sEnd, accent, w: 3.4);
  _text(canvas, 'P = ${eeeSi(res.p, 'W')}', Offset((origin.dx + pEnd.dx) / 2, origin.dy + (res.q >= 0 ? 16 : -16)), size: 15, color: _series[0], align: TextAlign.center, bold: true);
  _text(canvas, 'Q = ${eeeSi(res.q, 'var')}', Offset(pEnd.dx + 10, (pEnd.dy + sEnd.dy) / 2), size: 15, color: _series[2], bold: true);
  final mid = (origin + sEnd) / 2;
  _text(canvas, 'S = ${eeeSi(res.s, 'VA')}', mid + Offset(-12, res.q >= 0 ? -16 : 16), size: 15, color: accent, align: TextAlign.right, bold: true);
  if (res.phi.abs() > 0.5) {
    final rad = math.min(46.0, (pEnd - origin).distance * 0.4);
    final a = res.phi * math.pi / 180;
    canvas.drawArc(Rect.fromCircle(center: origin, radius: rad), 0, -a, false, _stroke(_ink, 1.6));
    _text(canvas, 'φ', origin + Offset(rad + 12, res.q >= 0 ? -12 : 12), size: 15, bold: true);
  }
}

void _rlcResponse(Canvas canvas, Rect r, RlcCircuit m, Color accent) {
  final series = m.topology == RlcTopology.series;
  _text(canvas, series ? 'Frequency response: current I vs f' : 'Frequency response: impedance |Z| vs f', Offset(r.left + 4, r.top + 8), size: 16, bold: true);
  final f0 = m.resonance;
  final fMax = math.max(1.0, math.max(f0 == null ? 0.0 : f0 * 2.5, m.f * 1.6));
  const n = 240;
  final ys = <double>[];
  for (var k = 1; k <= n; k++) {
    final y = m.responseAt(fMax * k / n);
    ys.add(y.isFinite ? y : double.nan);
  }
  final finite = ys.where((y) => y.isFinite);
  if (finite.isEmpty) return;
  var top = finite.reduce(math.max);
  // A parallel circuit with no R loss peaks very high: show to 5× the value at f.
  final atF = m.responseAt(m.f);
  if (atF.isFinite && top > atF * 8 && !series) top = math.max(atF * 5, top / 4);
  if (top <= 0) top = 1;
  final ax = _axes(canvas, Rect.fromLTRB(r.left, r.top + 20, r.right, r.bottom), 0, fMax, 0, top * 1.08, 'f (Hz)', series ? 'I (A)' : '|Z| (Ω)');
  final pts = [for (var k = 1; k <= n; k++) if (ys[k - 1].isFinite) ax.at(fMax * k / n, math.min(ys[k - 1], top * 1.08))];
  _curve(canvas, ax.plot, pts, _stroke(accent, 2.8));
  if (f0 != null && f0 <= fMax) {
    _dashed(canvas, ax.at(f0, 0), ax.at(f0, top * 1.08), _stroke(_good, 1.6));
    _text(canvas, 'f₀', ax.at(f0, top * 1.08) + const Offset(10, 12), size: 14, color: _good, bold: true);
    if (series && m.r > 0) {
      final half = m.v / m.r / math.sqrt2;
      _dashed(canvas, ax.at(0, half), ax.at(fMax, half), _stroke(_muted, 1.2), dash: 5, gap: 5);
      _text(canvas, 'I_max/√2', ax.at(fMax, half) + const Offset(-4, -10), size: 12, color: _muted, align: TextAlign.right);
    }
  }
  _dashed(canvas, ax.at(m.f, 0), ax.at(m.f, top * 1.08), _stroke(_bad, 1.6));
  _text(canvas, 'f', ax.at(m.f, top * 1.08) + const Offset(-10, 12), size: 14, color: _bad, bold: true, align: TextAlign.right);
}

// --- Three-phase panel -------------------------------------------------------------------------

void paintThreePhase(Canvas canvas, ThreePhase m, Size size, Color accent) {
  _text(canvas, m.title, const Offset(24, 32), size: 24, bold: true, color: accent, maxWidth: size.width - 48);
  final ph = m.phasors();
  final colors = [for (final p in ph) phaseColors[_phaseIndex(p.label)].withValues(alpha: _isLine(p.label, m.star) ? 0.55 : 1)];
  _phasorDiagram(canvas, const Rect.fromLTRB(24, 56, 700, 740), ph, colors, note: m.star ? 'Phase voltages, phase currents and line voltages' : 'Phase voltages (= line), phase currents and line currents');
  _connection(canvas, const Rect.fromLTRB(720, 60, 1216, 360), m);
  final lines = <(String, Color)>[
    (m.star ? 'Star (Y):  V_L = √3 · V_ph,   I_L = I_ph' : 'Delta (Δ):  V_L = V_ph,   I_L = √3 · I_ph', accent),
    ('V_L = ${eeeNum(m.vLine)} V     V_ph = ${eeeNum(m.vPhase)} V', _ink),
    ('Z_ph = ${eeeNum(m.zPhase)} Ω at φ = ${eeeNum(m.phi)}° ${m.phi > 0 ? 'lagging' : (m.phi < 0 ? 'leading' : '')}', _ink),
    ('I_ph = V_ph / Z_ph = ${eeeNum(m.iPhase)} A     I_L = ${eeeNum(m.iLine)} A', _ink),
    ('Power factor cos φ = ${m.pf.toStringAsFixed(3)}', _ink),
    ('P = √3 · V_L · I_L · cos φ = ${eeeSi(m.power, 'W')}', _series[0]),
    ('Q = √3 · V_L · I_L · sin φ = ${eeeSi(m.reactive, 'var')}', _series[2]),
    ('S = √3 · V_L · I_L = ${eeeSi(m.apparent, 'VA')}', accent),
    (m.star ? 'Line voltage leads its phase voltage by 30°' : 'Line current lags its phase current by 30°', _muted),
    ('Sequence R → Y → B, 120° apart', _muted),
  ];
  for (final (k, (t, c)) in lines.indexed) {
    _text(canvas, t, Offset(724, 392 + k * 34.0), size: 17, color: c, maxWidth: 490, bold: k == 0);
  }
}

int _phaseIndex(String label) {
  final i = label.indexOf('_');
  final ch = i < 0 || i + 1 >= label.length ? 'R' : label[i + 1];
  return switch (ch) {
    'Y' => 1,
    'B' => 2,
    _ => 0,
  };
}

bool _isLine(String label, bool star) => star ? label.startsWith('V_') && label.length > 3 : label.startsWith('I_') && label.length == 3;

/// The star or delta connection: three windings and the R, Y, B lines.
void _connection(Canvas canvas, Rect r, ThreePhase m) {
  final c = Offset(r.center.dx - 40, r.center.dy + 10);
  final p = _stroke(_ink, 2.2);
  const names = ['R', 'Y', 'B'];
  final rad = math.min(r.width, r.height) * 0.36;
  final ends = [for (var k = 0; k < 3; k++) c + Offset(math.cos(math.pi / 2 - 2 * math.pi * k / 3), -math.sin(math.pi / 2 - 2 * math.pi * k / 3)) * rad];
  if (m.star) {
    for (var k = 0; k < 3; k++) {
      final dir = (ends[k] - c) / rad;
      _inductor(canvas, c, ends[k], _stroke(phaseColors[k], 2.6));
      canvas.drawLine(ends[k], ends[k] + dir * 30, p);
      _text(canvas, names[k], ends[k] + dir * 48, size: 18, bold: true, color: phaseColors[k], align: TextAlign.center);
    }
    canvas.drawCircle(c, 5, Paint()..color = _ink);
    _text(canvas, 'N', c + const Offset(12, 12), size: 15, bold: true);
  } else {
    for (var k = 0; k < 3; k++) {
      _inductor(canvas, ends[k], ends[(k + 1) % 3], _stroke(phaseColors[k], 2.6));
      final dir = (ends[k] - c) / rad;
      canvas
        ..drawCircle(ends[k], 4, Paint()..color = _ink)
        ..drawLine(ends[k], ends[k] + dir * 30, p);
      _text(canvas, names[k], ends[k] + dir * 48, size: 18, bold: true, color: phaseColors[k], align: TextAlign.center);
    }
  }
  _text(canvas, m.star ? 'Star (Y) connection' : 'Delta (Δ) connection', Offset(r.right - 4, r.top + 12), size: 16, bold: true, align: TextAlign.right);
}

// --- Single-line diagram -----------------------------------------------------------------------

/// Where the diagram's parts sit on a panel of [size] (the editor drags them in the same frame).
class SldFrame {
  SldFrame(this.size) : area = Rect.fromLTRB(24, 70, size.width - 24, 520);
  final Size size;
  final Rect area;

  double get top => area.top + 34;
  double get bottom => area.bottom - 24;
  double busX(double x) => area.left + 150 + x * (area.width - 300);
  double fracX(double px) => ((px - area.left - 150) / (area.width - 300)).clamp(0, 1).toDouble();
  double y(double frac) => top + frac * (bottom - top);
  double fracY(double py) => ((py - top) / (bottom - top)).clamp(0, 1).toDouble();

  /// The centre of element [e]'s symbol: a series element in its branch's row, evenly spaced.
  Offset centre(SingleLineDiagram d, SldElement e) {
    if (e.series && e.a >= 0 && e.b >= 0 && e.a < d.buses.length && e.b < d.buses.length) {
      final (k, count, lane) = d.branchSlot(e);
      final xa = busX(d.buses[e.a].x), xb = busX(d.buses[e.b].x);
      final l = math.min(xa, xb), r = math.max(xa, xb);
      return Offset(l + (r - l) * (k + 1) / (count + 1), this.y(lane));
    }
    final y = this.y(e.y);
    if (e.a < 0 || e.a >= d.buses.length) return Offset(area.center.dx, y);
    final xa = busX(d.buses[e.a].x);
    if (e.series) {
      if (e.b < 0 || e.b >= d.buses.length) return Offset(xa + 80, y);
      return Offset((xa + busX(d.buses[e.b].x)) / 2, y);
    }
    return Offset(xa + e.side * 96, y);
  }
}

/// Short names for the table.
const sldKindNames = {
  SldKind.generator: 'Generator',
  SldKind.transformer: 'Transformer',
  SldKind.line: 'Line',
  SldKind.load: 'Load',
  SldKind.motor: 'Motor',
  SldKind.breaker: 'Circuit breaker',
  SldKind.isolator: 'Isolator',
};

void paintSld(Canvas canvas, SingleLineDiagram d, Size size, Color accent) {
  _text(canvas, d.title, const Offset(24, 32), size: 24, bold: true, color: accent, maxWidth: size.width - 300);
  // The teaching badge.
  final badge = Rect.fromLTRB(size.width - 252, 16, size.width - 24, 48);
  canvas.drawRRect(RRect.fromRectAndRadius(badge, const Radius.circular(16)), Paint()..color = const Color(0xFFFFF3CD));
  _text(canvas, 'TEACHING MODEL', badge.center, size: 14, bold: true, color: const Color(0xFF7A5B00), align: TextAlign.center);
  final f = SldFrame(size);
  final p = _stroke(_ink, 2.4);
  final fault = d.fault();
  // Bus bars.
  for (final (i, b) in d.buses.indexed) {
    final x = f.busX(b.x);
    canvas.drawLine(Offset(x, f.top - 10), Offset(x, f.bottom + 10), _stroke(i == d.faultBus ? _bad : _ink, 7));
    _text(canvas, b.name, Offset(x, f.top - 26), size: 15, bold: true, align: TextAlign.center, color: i == d.faultBus ? _bad : _ink);
    _text(canvas, '${eeeNum(b.kv)} kV', Offset(x, f.bottom + 26), size: 13, color: _muted, align: TextAlign.center);
  }
  // Elements.
  for (final e in d.elements) {
    final c = f.centre(d, e);
    if (e.a < 0 || e.a >= d.buses.length) continue;
    final xa = f.busX(d.buses[e.a].x);
    if (e.series) {
      final xb = e.b >= 0 && e.b < d.buses.length ? f.busX(d.buses[e.b].x) : xa + 160;
      final (k, count, _) = d.branchSlot(e);
      final l = math.min(xa, xb), r = math.max(xa, xb), step = (r - l) / (count + 1);
      // Each element draws the wire from the gap before it to the gap after it.
      _seriesSymbol(canvas, e, Offset(k == 0 ? l : c.dx - step / 2, c.dy), Offset(k == count - 1 ? r : c.dx + step / 2, c.dy), c, p);
    } else {
      final out = c + Offset(e.side * 26.0, 0);
      canvas.drawLine(Offset(xa, c.dy), e.kind == SldKind.load ? c : c - Offset(e.side * 26.0, 0), p);
      _shuntSymbol(canvas, e, c, out, p);
    }
    _text(canvas, e.label, c + const Offset(0, -38), size: 14, bold: true, align: TextAlign.center, maxWidth: 180, color: accent);
  }
  if (fault != null) {
    final x = f.busX(d.buses[fault.bus].x);
    final y = f.bottom - 10;
    final bolt = Path()
      ..moveTo(x + 6, y - 40)
      ..lineTo(x + 30, y - 18)
      ..lineTo(x + 20, y - 16)
      ..lineTo(x + 40, y + 6)
      ..lineTo(x + 14, y - 10)
      ..lineTo(x + 24, y - 12)
      ..close();
    canvas.drawPath(bolt, Paint()..color = _bad);
    _text(canvas, 'F (3φ)', Offset(x + 46, y - 8), size: 14, bold: true, color: _bad);
  }
  _sldTable(canvas, Rect.fromLTRB(24, 548, size.width - 24, size.height - 16), d, fault, accent);
}

void _seriesSymbol(Canvas canvas, SldElement e, Offset a, Offset b, Offset c, Paint p) {
  switch (e.kind) {
    case SldKind.transformer:
      canvas
        ..drawLine(a, c - const Offset(34, 0), p)
        ..drawLine(c + const Offset(34, 0), b, p)
        ..drawCircle(c - const Offset(11, 0), 23, p)
        ..drawCircle(c + const Offset(11, 0), 23, p);
    case SldKind.line:
      canvas.drawLine(a, b, p);
      final w = 36.0;
      canvas.drawRect(Rect.fromCenter(center: c, width: w, height: 14), Paint()..color = Colors.white);
      canvas.drawRect(Rect.fromCenter(center: c, width: w, height: 14), _stroke(_ink, 2));
    case SldKind.breaker:
      canvas
        ..drawLine(a, c - const Offset(14, 0), p)
        ..drawLine(c + const Offset(14, 0), b, p);
      final box = Rect.fromCenter(center: c, width: 28, height: 28);
      if (e.closed) canvas.drawRect(box, Paint()..color = _ink);
      canvas.drawRect(box, p);
    case SldKind.isolator:
      canvas
        ..drawLine(a, c - const Offset(18, 0), p)
        ..drawLine(c + const Offset(18, 0), b, p)
        ..drawCircle(c - const Offset(18, 0), 3.5, Paint()..color = _ink)
        ..drawCircle(c + const Offset(18, 0), 3.5, Paint()..color = _ink)
        ..drawLine(c - const Offset(18, 0), e.closed ? c + const Offset(18, 0) : c + const Offset(14, -22), p)
        ..drawLine(c + const Offset(18, -8), c + const Offset(18, 8), p);
    default:
      canvas.drawLine(a, b, p);
  }
}

void _shuntSymbol(Canvas canvas, SldElement e, Offset c, Offset out, Paint p) {
  switch (e.kind) {
    case SldKind.generator || SldKind.motor:
      canvas
        ..drawCircle(c, 26, Paint()..color = Colors.white)
        ..drawCircle(c, 26, p);
      _text(canvas, e.kind == SldKind.generator ? 'G' : 'M', c - const Offset(0, 6), size: 18, bold: true, align: TextAlign.center);
      _text(canvas, '~', c + const Offset(0, 12), size: 16, align: TextAlign.center);
    case SldKind.load:
      _arrow(canvas, c, out + Offset(e.side * 20.0, 0), _ink, w: 2.4, head: 16);
    default:
      canvas.drawCircle(c, 6, p);
  }
}

void _sldTable(Canvas canvas, Rect r, SingleLineDiagram d, SldFault? fault, Color accent) {
  _text(canvas, 'Per unit on ${eeeNum(d.baseMva)} MVA base (base kV = bus kV):  Z_new = Z_old · (kV_old/kV_new)² · (MVA_new/MVA_old)', Offset(r.left, r.top + 8), size: 15, bold: true, maxWidth: r.width);
  final cols = [r.left, r.left + 200, r.left + 470, r.left + 760, r.left + 960];
  const head = ['Element', 'Rating', 'Given', 'On common base', ''];
  for (final (k, h) in head.indexed) {
    _text(canvas, h, Offset(cols[k], r.top + 40), size: 14, bold: true, color: _muted);
  }
  var y = r.top + 66;
  final rows = [for (final e in d.elements) if (e.kind != SldKind.load && e.kind != SldKind.breaker && e.kind != SldKind.isolator) e];
  for (final e in rows.take(5)) {
    final pu = d.perUnit(e);
    final rating = switch (e.kind) {
      SldKind.line => '${eeeNum(e.a >= 0 && e.a < d.buses.length ? d.buses[e.a].kv : 0)} kV',
      _ => '${eeeNum(e.mva)} MVA, ${eeeNum(e.kv)} kV',
    };
    final given = e.kind == SldKind.line ? 'X = ${eeeNum(e.ohms)} Ω' : 'X = ${eeeNum(e.x)} pu';
    _text(canvas, '${e.label} (${sldKindNames[e.kind]})', Offset(cols[0], y), size: 14, maxWidth: 196);
    _text(canvas, rating, Offset(cols[1], y), size: 14);
    _text(canvas, given, Offset(cols[2], y), size: 14);
    _text(canvas, pu.isFinite ? 'X = ${pu.toStringAsFixed(4)} pu' : '—', Offset(cols[3], y), size: 14, bold: true, color: accent);
    y += 26;
  }
  y = math.max(y + 6, r.bottom - 66);
  if (fault != null) {
    _text(
      canvas,
      'Symmetrical 3-phase fault at ${d.buses[fault.bus].name}:  X_th = ${fault.xth.toStringAsFixed(4)} pu,  fault level = ${eeeNum(d.prefault)} × ${eeeNum(d.baseMva)} / X_th = ${eeeNum(fault.mva)} MVA,  I_f = ${eeeNum(fault.ka)} kA',
      Offset(r.left, y),
      size: 16,
      bold: true,
      color: _bad,
      maxWidth: r.width,
    );
  } else {
    _text(canvas, d.faultBus < 0 ? 'Pick a bus for the fault level.' : 'No source reaches this bus: no fault current.', Offset(r.left, y), size: 15, color: _muted);
  }
  _text(canvas, 'Teaching model: pre-fault voltage ${eeeNum(d.prefault)} pu, resistance, loads and pre-fault current neglected; generators by their reactance.', Offset(r.left, y + 30), size: 13, color: _muted, maxWidth: r.width);
}

// --- Waveform generator -------------------------------------------------------------------------

const waveNames = {WaveKind.sine: 'Sine', WaveKind.square: 'Square', WaveKind.triangle: 'Triangle', WaveKind.sawtooth: 'Sawtooth', WaveKind.pwm: 'PWM'};

void paintWaveform(Canvas canvas, WaveformPanel m, Size size, Color accent) {
  _text(canvas, m.title, const Offset(24, 32), size: 24, bold: true, color: accent, maxWidth: size.width - 48);
  final a = m.a;
  final span = a.freq > 0 ? m.cycles / a.freq : 0.04;
  const n = 900;
  final ts = [for (var k = 0; k <= n; k++) span * k / n];
  final sig = [for (final t in ts) m.at(t)];
  final extra = <List<double>>[
    if (m.superpose) [for (final t in ts) a.at(t)],
    if (m.superpose) [for (final t in ts) m.b.at(t)],
    if (m.harmonics) [for (final t in ts) m.partialSum(t)],
  ];
  final all = [...sig, for (final e in extra) ...e].where((v) => v.isFinite);
  var lo = all.isEmpty ? -1.0 : all.reduce(math.min), hi = all.isEmpty ? 1.0 : all.reduce(math.max);
  lo = math.min(lo, 0);
  hi = math.max(hi, 0);
  final pad = (hi - lo) * 0.1 + 1e-6;
  final ax = _axes(canvas, const Rect.fromLTRB(24, 56, 1216, 500), 0, span * 1000, lo - pad, hi + pad, 't (ms)', 'v (V)');
  List<Offset> pts(List<double> ys) => [for (final (k, t) in ts.indexed) ax.at(t * 1000, ys[k])];
  if (m.superpose) {
    _curve(canvas, ax.plot, pts(extra[0]), _stroke(accent.withValues(alpha: 0.45), 1.8));
    _curve(canvas, ax.plot, pts(extra[1]), _stroke(_series[2].withValues(alpha: 0.5), 1.8));
  }
  _curve(canvas, ax.plot, pts(sig), _stroke(m.superpose ? _ink : accent, 3));
  if (m.harmonics) _curve(canvas, ax.plot, pts(extra.last), _stroke(_bad, 2.2), dashed: true);
  // Legend.
  var lx = ax.plot.left + 10;
  void legend(String t, Color c) {
    canvas.drawLine(Offset(lx, ax.plot.top + 14), Offset(lx + 24, ax.plot.top + 14), _stroke(c, 3));
    _text(canvas, t, Offset(lx + 30, ax.plot.top + 14), size: 13);
    lx += 40 + t.length * 7.5;
  }

  legend('${m.superpose ? 'A: ' : ''}${_waveLabel(a)}', m.superpose ? accent.withValues(alpha: 0.6) : accent);
  if (m.superpose) {
    legend('B: ${_waveLabel(m.b)}', _series[2].withValues(alpha: 0.6));
    legend('A + B', _ink);
  }
  if (m.harmonics) legend('Fourier sum, ${m.terms} harmonic${m.terms == 1 ? '' : 's'}', _bad);
  // Values.
  final s = m.stats();
  final ideal = a.ideal;
  final rows = <(String, String, String)>[
    ('Peak', eeeNum(s.peak), m.superpose || a.offset != 0 ? '' : eeeNum(ideal.peak)),
    ('RMS', eeeNum(s.rms), m.superpose || a.offset != 0 ? '' : eeeNum(ideal.rms)),
    ('Mean (DC)', eeeNum(s.mean), m.superpose || a.offset != 0 ? '' : eeeNum(ideal.mean)),
    ('Average (mean of |v|)', eeeNum(s.average), m.superpose || a.offset != 0 ? '' : eeeNum(ideal.average)),
    ('Form factor RMS/avg', s.formFactor == null ? '—' : s.formFactor!.toStringAsFixed(3), m.superpose || a.offset != 0 || ideal.formFactor == null ? '' : ideal.formFactor!.toStringAsFixed(3)),
    ('Peak (crest) factor', s.crestFactor == null ? '—' : s.crestFactor!.toStringAsFixed(3), m.superpose || a.offset != 0 || ideal.crestFactor == null ? '' : ideal.crestFactor!.toStringAsFixed(3)),
  ];
  _text(canvas, 'Measured over one period', const Offset(28, 530), size: 15, bold: true);
  _text(canvas, 'Formula', const Offset(470, 530), size: 15, bold: true, color: _muted);
  for (final (k, (name, v, f)) in rows.indexed) {
    final y = 562 + k * 32.0;
    _text(canvas, name, Offset(28, y), size: 17);
    _text(canvas, v, Offset(400, y), size: 17, bold: true, color: accent, align: TextAlign.right);
    _text(canvas, f, Offset(470, y), size: 17, color: _muted);
  }
  _text(canvas, _formula(a), const Offset(28, 770), size: 14, color: _muted, maxWidth: 570);
  if (m.harmonics) {
    _spectrum(canvas, const Rect.fromLTRB(620, 520, 1216, 790), a, m.terms, accent);
  } else {
    _text(canvas, 'Fourier series', const Offset(624, 530), size: 15, bold: true);
    for (final (k, t) in _fourierLines(a).indexed) {
      _text(canvas, t, Offset(624, 564 + k * 30.0), size: 16, maxWidth: 590);
    }
  }
}

String _waveLabel(Wave w) => '${waveNames[w.kind]} ${eeeNum(w.amplitude)} V, ${eeeNum(w.freq)} Hz${w.phase != 0 ? ', ${eeeNum(w.phase)}°' : ''}${w.offset != 0 ? ', DC ${eeeNum(w.offset)} V' : ''}${w.kind == WaveKind.pwm ? ', D ${(w.duty * 100).round()} %' : ''}';

String _formula(Wave w) => switch (w.kind) {
  WaveKind.sine => 'Sine: RMS = Vm/√2, average = 2Vm/π, form factor 1.11, crest factor 1.414',
  WaveKind.square => 'Square: RMS = average = peak = Vm, form and crest factor 1',
  WaveKind.triangle || WaveKind.sawtooth => 'RMS = Vm/√3, average = Vm/2, form factor 1.155, crest factor 1.732',
  WaveKind.pwm => 'PWM (0 to Vm, duty D): mean = D·Vm, RMS = Vm·√D, form factor 1/√D',
};

List<String> _fourierLines(Wave w) => switch (w.kind) {
  WaveKind.sine => ['A single term: v = Vm sin ωt (no harmonics).'],
  WaveKind.square => ['v = (4Vm/π) [sin ωt + (1/3) sin 3ωt + (1/5) sin 5ωt + …]', 'Odd harmonics only, falling as 1/n.'],
  WaveKind.triangle => ['v = (8Vm/π²) [sin ωt − (1/9) sin 3ωt + (1/25) sin 5ωt − …]', 'Odd harmonics only, falling as 1/n².'],
  WaveKind.sawtooth => ['v = (2Vm/π) [sin ωt − (1/2) sin 2ωt + (1/3) sin 3ωt − …]', 'Every harmonic, falling as 1/n.'],
  WaveKind.pwm => ['v = D·Vm + Σ (Vm/nπ) [sin 2πnD · cos nωt + (1 − cos 2πnD) · sin nωt]', 'Harmonics vanish where nD is a whole number.'],
};

void _spectrum(Canvas canvas, Rect r, Wave w, int n, Color accent) {
  _text(canvas, 'Harmonics (amplitude of each term)', Offset(r.left + 4, r.top + 10), size: 15, bold: true);
  final f = w.fourier(n);
  final amps = List<double>.filled(n, 0);
  for (final t in f.terms) {
    amps[t.h - 1] = math.sqrt(t.a * t.a + t.b * t.b);
  }
  final top = math.max(1e-9, [f.dc.abs(), ...amps].reduce(math.max));
  final plot = Rect.fromLTRB(r.left + 40, r.top + 34, r.right - 10, r.bottom - 30);
  canvas.drawLine(plot.bottomLeft, plot.bottomRight, _stroke(_ink, 1.4));
  final count = n + (f.dc != 0 ? 1 : 0);
  final w0 = plot.width / math.max(1, count);
  var i = 0;
  void bar(String label, double v, Color c) {
    final h = v / top * plot.height;
    final x = plot.left + w0 * (i + 0.5);
    canvas.drawRect(Rect.fromLTRB(x - w0 * 0.3, plot.bottom - h, x + w0 * 0.3, plot.bottom), Paint()..color = c);
    if (count <= 25 || i % 2 == 0) _text(canvas, label, Offset(x, plot.bottom + 12), size: 11, color: _muted, align: TextAlign.center);
    i++;
  }

  if (f.dc != 0) bar('DC', f.dc.abs(), _muted);
  for (var h = 1; h <= n; h++) {
    bar('$h', amps[h - 1], accent);
  }
  _text(canvas, 'b₁ = ${eeeNum(amps.isEmpty ? 0 : amps[0])} V', Offset(r.right - 8, r.top + 10), size: 13, color: _muted, align: TextAlign.right);
}
