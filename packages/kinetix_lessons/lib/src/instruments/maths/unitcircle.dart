import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'common.dart';

const _d2r = math.pi / 180;

/// Trigonometry on the unit circle: the circle and the unrolled graph, radian measure, all six
/// functions with their gaps, principal values of the inverse functions, and the compound-angle
/// identity cos(x − y) as two equal chords.
///
/// Preset: {"mode": "circle"|"radian"|"six"|"inverse"|"compound"|"tansum", "fn": "sin"|"cos"|"tan"|
/// "cot"|"sec"|"cosec"|"asin"|"acos"|"atan"|"acot", "theta": 60 (degrees), "r": 3, "v": 0.5,
/// "A": 100, "B": 40}.
class UnitCircleInstrument extends StatefulWidget {
  const UnitCircleInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<UnitCircleInstrument> createState() => _UCState();
}

class _UCState extends State<UnitCircleInstrument> {
  String mode = 'circle', fn = 'sin';
  double theta = 60, r = 3, v = 0.5, A = 100, B = 40;
  int? active;
  bool _drag = false;

  static final _presets = <String, Map<String, dynamic>>{
    'sin x': {'mode': 'circle', 'fn': 'sin', 'theta': 60},
    'cos x': {'mode': 'circle', 'fn': 'cos', 'theta': 120},
    'tan x': {'mode': 'six', 'fn': 'tan', 'theta': 45},
    'Radians': {'mode': 'radian', 'theta': 60, 'r': 3},
    'sin⁻¹ v': {'mode': 'inverse', 'fn': 'asin', 'v': 0.5},
    'cos(x − y)': {'mode': 'compound', 'A': 100, 'B': 40},
  };

  @override
  void initState() {
    super.initState();
    _apply(widget.preset.isEmpty ? _presets['sin x']! : widget.preset);
    if (widget.preset.isEmpty) active = 0;
  }

  void _apply(Map<String, dynamic> p) {
    mode = ps(p, 'mode', 'circle');
    fn = ps(p, 'fn', mode == 'inverse' ? 'asin' : 'sin');
    theta = pd(p, 'theta', 60);
    r = pd(p, 'r', 3);
    v = pd(p, 'v', 0.5);
    A = pd(p, 'A', 100);
    B = pd(p, 'B', 40);
  }

  static double f(String fn, double x) => switch (fn) {
    'cos' => math.cos(x),
    'tan' => math.tan(x),
    'cot' => math.cos(x) / math.sin(x),
    'sec' => 1 / math.cos(x),
    'cosec' => 1 / math.sin(x),
    _ => math.sin(x),
  };

  static String fname(String fn) => fn == 'cosec' ? 'cosec' : fn;

  double get principal => switch (fn) {
    'acos' => math.acos(v.clamp(-1.0, 1.0)),
    'atan' => math.atan(v),
    'acot' => math.pi / 2 - math.atan(v),
    _ => math.asin(v.clamp(-1.0, 1.0)),
  };

  String get invName => const {'asin': 'sin⁻¹', 'acos': 'cos⁻¹', 'atan': 'tan⁻¹', 'acot': 'cot⁻¹'}[fn] ?? 'sin⁻¹';
  String get invRange => const {'asin': '[−π/2, π/2]', 'acos': '[0, π]', 'atan': '(−π/2, π/2)', 'acot': '(0, π)'}[fn] ?? '';

  String deg(double d) => '${fmtT(d, 1)}°';
  String radText(double d) {
    final s = piFrac(d * _d2r);
    return s.contains('π') || s == '0' ? s : fmt(d * _d2r, 3);
  }

  @override
  Widget build(BuildContext context) {
    final t = theta * _d2r;
    String title, formula;
    late List<Readout> ro;
    late List<Widget> ctl;
    switch (mode) {
      case 'radian':
        title = 'Radian measure';
        formula = 'l = r θ  (θ in radians)';
        ro = [
          Readout('θ in degrees', deg(theta), '', IX.ink),
          Readout('θ in radians', radText(theta), '', IX.accent),
          Readout('Arc length l = rθ', fmt(r * t, 2), 'units', IX.positive),
          Readout('l ÷ r', fmt(t, 3), 'radians', IX.inkSoft),
        ];
        ctl = [
          IxSlider(label: 'θ', value: theta, min: 0, max: 360, divisions: 72, unit: '°', format: (x) => fmt(x, 0), onChanged: (x) => setState(() => theta = x)),
          IxSlider(label: 'Radius r', value: r, min: 1, max: 4, divisions: 30, format: (x) => fmt(x, 1), onChanged: (x) => setState(() => r = x)),
        ];
      case 'inverse':
        title = 'Principal value of $invName';
        formula = '$invName v ∈ $invRange';
        final pv = principal;
        ro = [
          Readout('v', fmt(v, 2), '', IX.ink),
          Readout('$invName v', piFrac(pv).contains('π') ? piFrac(pv) : fmt(pv, 3), 'rad', IX.accent),
          Readout('In degrees', deg(pv / _d2r), '', IX.positive),
          Readout('Principal range', invRange, '', IX.inkSoft),
        ];
        final lim = fn == 'asin' || fn == 'acos' ? 1.0 : 4.0;
        ctl = [
          IxSegments<String>(label: 'Function', options: const {'asin': 'sin⁻¹', 'acos': 'cos⁻¹', 'atan': 'tan⁻¹', 'acot': 'cot⁻¹'}, value: fn, onChanged: (x) => setState(() { fn = x; v = v.clamp(-1.0, 1.0); })),
          IxSlider(label: 'Value v', value: v.clamp(-lim, lim), min: -lim, max: lim, divisions: lim == 1 ? 40 : 80, format: (x) => fmt(x, 2), onChanged: (x) => setState(() => v = x)),
        ];
      case 'compound':
        final a = A * _d2r, b = B * _d2r;
        final c12 = math.sqrt(math.pow(math.cos(a) - math.cos(b), 2) + math.pow(math.sin(a) - math.sin(b), 2));
        final c03 = math.sqrt(math.pow(math.cos(a - b) - 1, 2) + math.pow(math.sin(a - b), 2));
        title = 'Why cos(x − y) = cos x cos y + sin x sin y';
        formula = 'P₁P₂ = P₀P₃';
        ro = [
          Readout('P₁P₂', fmt(c12, 3), '', IX.accent),
          Readout('P₀P₃', fmt(c03, 3), '', IX.positive),
          Readout('cos(x − y)', fmt(math.cos(a - b), 4), '', IX.ink),
          Readout('cos x cos y + sin x sin y', fmt(math.cos(a) * math.cos(b) + math.sin(a) * math.sin(b), 4), '', IX.green),
        ];
        ctl = [
          IxSlider(label: 'x', value: A, min: 0, max: 360, divisions: 72, unit: '°', format: (x) => fmt(x, 0), onChanged: (x) => setState(() => A = x)),
          IxSlider(label: 'y', value: B, min: 0, max: 360, divisions: 72, unit: '°', format: (x) => fmt(x, 0), onChanged: (x) => setState(() => B = x)),
        ];
      case 'tansum':
        final x = A, y = B;
        final sum = math.atan(x) + math.atan(y), form = math.atan((x + y) / (1 - x * y));
        title = 'Adding two inverse tangents';
        formula = 'tan⁻¹x + tan⁻¹y = tan⁻¹((x + y)/(1 − xy)),  xy < 1';
        ro = [
          Readout('tan⁻¹x + tan⁻¹y', deg(sum / _d2r), '', IX.green),
          Readout('tan⁻¹((x + y)/(1 − xy))', deg(form / _d2r), '', MX.red),
          Readout('xy', fmt(x * y, 2), '', IX.ink),
          Readout('Difference', deg((sum - form) / _d2r), '', IX.inkSoft),
        ];
        ctl = [
          IxSlider(label: 'x', value: A.clamp(-4, 4), min: -4, max: 4, divisions: 80, format: (v) => fmt(v, 1), onChanged: (v) => setState(() => A = v)),
          IxSlider(label: 'y', value: B.clamp(-4, 4), min: -4, max: 4, divisions: 80, format: (v) => fmt(v, 1), onChanged: (v) => setState(() => B = v)),
        ];
      case 'six':
        final val = f(fn, t);
        title = 'The graph of ${fname(fn)} x';
        formula = const {'sin': 'range [−1, 1]', 'cos': 'range [−1, 1]', 'tan': 'not defined at x = (2n + 1)π/2', 'cot': 'not defined at x = nπ', 'sec': 'not defined at x = (2n + 1)π/2', 'cosec': 'not defined at x = nπ'}[fn]!;
        ro = [
          Readout('x', deg(theta), '', IX.ink),
          Readout('${fname(fn)} x', val.abs() > 1e6 ? 'not defined' : fmt(val, 3), '', IX.accent),
          Readout('Period', fn == 'tan' || fn == 'cot' ? 'π' : '2π', '', IX.positive),
          Readout('Range', fn == 'sin' || fn == 'cos' ? '[−1, 1]' : fn == 'tan' || fn == 'cot' ? 'R' : 'R − (−1, 1)', '', IX.green),
        ];
        ctl = [
          segs<String>('Function', const {'sin': 'sin', 'cos': 'cos', 'tan': 'tan', 'cot': 'cot', 'sec': 'sec', 'cosec': 'cosec'}, fn, (x) => setState(() => fn = x)),
          IxSlider(label: 'x', value: theta, min: -360, max: 360, divisions: 144, unit: '°', format: (x) => fmt(x, 0), onChanged: (x) => setState(() => theta = x)),
        ];
      default:
        final q = (((theta % 360) + 360) % 360);
        final quad = q == 0 || q == 90 || q == 180 || q == 270 ? 'on an axis' : 'quadrant ${q < 90 ? 'I' : q < 180 ? 'II' : q < 270 ? 'III' : 'IV'}';
        title = 'From the unit circle to the graph';
        formula = 'P = (cos x, sin x)';
        ro = [
          Readout('x', '${deg(theta)} = ${radText(theta)}', '', IX.ink),
          Readout('sin x', fmt(math.sin(t), 3), '', MX.red),
          Readout('cos x', fmt(math.cos(t), 3), '', IX.accent),
          Readout('tan x', math.cos(t).abs() < 1e-9 ? 'not defined' : fmt(math.tan(t), 3), '', IX.green),
          Readout('P lies', quad, '', IX.inkSoft),
        ];
        ctl = [
          IxSegments<String>(label: 'Graph', options: const {'sin': 'sin x', 'cos': 'cos x', 'tan': 'tan x'}, value: fn == 'cos' || fn == 'tan' ? fn : 'sin', onChanged: (x) => setState(() => fn = x)),
          IxSlider(label: 'x', value: theta.clamp(0, 360), min: 0, max: 360, divisions: 72, unit: '°', format: (x) => fmt(x, 0), onChanged: (x) => setState(() => theta = x)),
        ];
    }
    return InstrumentFrame(
      id: 'maths-unitcircle',
      subtitle: tx(widget.preset['subtitle']) ?? (mode == 'inverse' || mode == 'tansum' ? '$kMaths · Inverse trigonometric functions' : '$kMaths · Trigonometric functions'),
      title: tx(widget.preset['title']) ?? title,
      formula: formula,
      state: {'mode': mode, 'fn': fn, 'theta': theta, 'r': r, 'v': v, 'A': A, 'B': B},
      readouts: ro,
      controls: ctl,
      presets: [for (final (i, e) in _presets.entries.indexed) Preset(e.key, () => setState(() { _apply(e.value); active = i; }))],
      activePreset: active,
      stage: LayoutBuilder(builder: (context, box) {
        final size = box.biggest;
        final circ = _UCPainter.circle(this, size);
        return GestureDetector(
          onPanStart: (e) => _drag = mode != 'six' && mode != 'tansum' && (e.localPosition - circ.$1).distance < circ.$2 * 1.4,
          onPanUpdate: (e) {
            if (!_drag) return;
            final d = e.localPosition - circ.$1;
            var ang = math.atan2(-d.dy, d.dx) / _d2r;
            if (ang < 0) ang += 360;
            setState(() {
              active = null;
              if (mode == 'compound') {
                A = (ang / 5).round() * 5.0;
              } else if (mode == 'inverse') {
                final a = ang * _d2r;
                v = switch (fn) { 'acos' => math.cos(a), 'atan' => math.tan(a).clamp(-4.0, 4.0), 'acot' => (math.cos(a) / math.sin(a)).clamp(-4.0, 4.0), _ => math.sin(a) };
              } else {
                theta = (ang / 5).round() * 5.0;
              }
            });
          },
          onPanEnd: (_) => _drag = false,
          child: CustomPaint(size: size, painter: _UCPainter(this)),
        );
      }),
    );
  }
}

class _UCPainter extends CustomPainter {
  _UCPainter(this.s);
  final _UCState s;

  /// Centre and radius of the circle for a stage size.
  static (Offset, double) circle(_UCState s, Size size) {
    if (s.mode == 'compound' || s.mode == 'tansum') {
      final r = math.min(size.height * 0.36, size.width * 0.26);
      return (Offset(size.width * 0.36, size.height * 0.5), r);
    }
    final r = math.min(size.height * 0.33, size.width * 0.17);
    return (Offset(r + 90, size.height * 0.5), r);
  }

  @override
  void paint(Canvas c, Size size) {
    switch (s.mode) {
      case 'six':
        _six(c, size);
      case 'radian':
        _radian(c, size);
      case 'inverse':
        _inverse(c, size);
      case 'compound':
        _compound(c, size);
      case 'tansum':
        _tansum(c, size);
      default:
        _circleGraph(c, size);
    }
  }

  void _axesCircle(Canvas c, Offset o, double r, {bool ticks = true}) {
    final ax = MPaint.stroke(IX.ink, 2);
    c.drawLine(o - Offset(r * 1.3, 0), o + Offset(r * 1.3, 0), ax);
    c.drawLine(o + Offset(0, r * 1.3), o - Offset(0, r * 1.3), ax);
    c.drawCircle(o, r, MPaint.stroke(IX.steel, 2.5));
    if (ticks) {
      IxPaint.label(c, '1', o + Offset(r + 8, 14), size: 16, color: IX.inkSoft, align: Alignment.topLeft);
      IxPaint.label(c, '−1', o + Offset(-r - 8, 14), size: 16, color: IX.inkSoft, align: Alignment.topRight);
      IxPaint.label(c, '1', o + Offset(-12, -r - 6), size: 16, color: IX.inkSoft, align: Alignment.bottomRight);
      IxPaint.label(c, '−1', o + Offset(-12, r + 6), size: 16, color: IX.inkSoft, align: Alignment.topRight);
    }
    IxPaint.label(c, 'x', o + Offset(r * 1.3 + 8, 0), size: 20, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
    IxPaint.label(c, 'y', o - Offset(-12, r * 1.3), size: 20, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
  }

  Offset _on(Offset o, double r, double a) => o + Offset(math.cos(a), -math.sin(a)) * r;

  void _circleGraph(Canvas c, Size size) {
    final (o, r) = circle(s, size);
    final t = s.theta * _d2r;
    _axesCircle(c, o, r);
    final p = _on(o, r, t);
    // Angle sector.
    c.drawArc(Rect.fromCircle(center: o, radius: r * 0.28), 0, -t, true, Paint()..color = IX.amber.withValues(alpha: 0.18));
    MPaint.arc(c, o, r * 0.28, 0, t, IX.amber);
    c.drawLine(o, p, MPaint.stroke(IX.ink, 3));
    // cos along x, sin up.
    final foot = Offset(p.dx, o.dy);
    c.drawLine(o, foot, MPaint.stroke(IX.accent, 6));
    c.drawLine(foot, p, MPaint.stroke(MX.red, 6));
    IxPaint.label(c, 'cos x', Offset((o.dx + foot.dx) / 2, o.dy + (math.sin(t) >= 0 ? 22 : -22)), size: 18, color: IX.accent, w: FontWeight.w600, halo: true);
    IxPaint.label(c, 'sin x', foot + Offset(math.cos(t) >= 0 ? 12 : -12, (p.dy - o.dy) / 2), size: 18, color: MX.red, w: FontWeight.w600, align: math.cos(t) >= 0 ? Alignment.centerLeft : Alignment.centerRight, halo: true);
    IxPaint.handle(c, p, IX.amber, r: 16, active: s._drag);
    IxPaint.label(c, 'P', p + Offset(math.cos(t) * 30, -math.sin(t) * 30), size: 22, color: IX.ink, w: FontWeight.w700);
    // Graph.
    final fn = s.fn == 'cos' || s.fn == 'tan' ? s.fn : 'sin';
    final ylim = fn == 'tan' ? 3.0 : 1.4;
    final pl = Plane(Rect.fromLTRB(o.dx + r * 1.6 + 40, o.dy - r * 1.1, size.width - 50, o.dy + r * 1.1), 0, 2 * math.pi, -ylim, ylim);
    pl.paintGrid(c, piTicks: true, xLabel: 'x', yLabel: 'y', yStep: fn == 'tan' ? 1 : 0.5);
    final col = fn == 'cos' ? IX.accent : fn == 'tan' ? IX.green : MX.red;
    pl.curve(c, (x) => _UCState.f(fn, x), col.withValues(alpha: 0.25), width: 3);
    pl.curve(c, (x) => _UCState.f(fn, x), col, width: 4.5, to: t);
    final y = _UCState.f(fn, t);
    if (y.abs() < ylim) {
      final gp = pl.p(t, y);
      if (fn == 'sin') IxPaint.dashed(c, p, gp, MPaint.stroke(MX.red.withValues(alpha: 0.6), 2), dash: 8, gap: 6);
      IxPaint.dashed(c, Offset(gp.dx, pl.sy(0)), gp, MPaint.stroke(col, 2), dash: 6, gap: 5);
      MPaint.dot(c, gp, col, r: 9);
    }
    IxPaint.label(c, 'y = $fn x', Offset(pl.rect.right - 10, pl.rect.top + 14), size: 22, color: col, w: FontWeight.w700, align: Alignment.topRight, halo: true);
  }

  void _six(Canvas c, Size size) {
    final pl = Plane(Rect.fromLTRB(80, 60, size.width - 60, size.height - 70), -2 * math.pi, 2 * math.pi, -4, 4);
    pl.paintGrid(c, piTicks: true, yStep: 1);
    final fn = s.fn;
    // Gaps (asymptotes).
    final gapAt = fn == 'tan' || fn == 'sec' ? (int k) => (2 * k + 1) * math.pi / 2 : fn == 'cot' || fn == 'cosec' ? (int k) => k * math.pi : null;
    if (gapAt != null) {
      for (var k = -5; k <= 5; k++) {
        final x = gapAt(k);
        if (x > pl.xa && x < pl.xb) IxPaint.dashed(c, Offset(pl.sx(x), pl.rect.top), Offset(pl.sx(x), pl.rect.bottom), MPaint.stroke(MX.red.withValues(alpha: 0.6), 2), dash: 9, gap: 7);
      }
    }
    for (final yv in [1.0, -1.0]) {
      IxPaint.dashed(c, pl.p(pl.xa, yv), pl.p(pl.xb, yv), MPaint.stroke(IX.steel, 1.6), dash: 6, gap: 6);
    }
    pl.curve(c, (x) => _UCState.f(fn, x), IX.accent, width: 4.5);
    final t = s.theta * _d2r;
    final y = _UCState.f(fn, t);
    IxPaint.dashed(c, Offset(pl.sx(t), pl.rect.top), Offset(pl.sx(t), pl.rect.bottom), MPaint.stroke(IX.steel, 1.5), dash: 5, gap: 5);
    if (y.abs() < 4) {
      MPaint.dot(c, pl.p(t, y), IX.positive, r: 10);
      IxPaint.label(c, '(${fmtT(s.theta, 0)}°, ${fmt(y, 2)})', pl.p(t, y) + const Offset(16, -22), size: 19, color: IX.positive, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
    }
    IxPaint.label(c, 'y = ${_UCState.fname(fn)} x', Offset(pl.rect.left + 20, pl.rect.top + 12), size: 24, color: IX.accent, w: FontWeight.w700, align: Alignment.topLeft, halo: true);
    if (gapAt != null) IxPaint.label(c, 'Dashed red lines: not defined there', Offset(pl.rect.left + 20, pl.rect.top + 50), size: 18, color: MX.red, align: Alignment.topLeft, halo: true);
  }

  void _radian(Canvas c, Size size) {
    final o = Offset(size.width * 0.42, size.height * 0.52);
    final unit = math.min(size.height, size.width) * 0.1;
    final rr = s.r * unit;
    final t = s.theta * _d2r;
    final ax = MPaint.stroke(IX.rule, 1.6);
    c.drawLine(o - Offset(rr + 60, 0), o + Offset(rr + 60, 0), ax);
    c.drawLine(o - Offset(0, rr + 60), o + Offset(0, rr + 60), ax);
    c.drawCircle(o, rr, MPaint.stroke(IX.steel, 2.5));
    c.drawArc(Rect.fromCircle(center: o, radius: rr), 0, -t, true, Paint()..color = IX.amber.withValues(alpha: 0.14));
    c.drawArc(Rect.fromCircle(center: o, radius: rr), 0, -t, false, MPaint.stroke(IX.positive, 7));
    // Marks every one radius along the arc.
    for (var k = 1; k <= t.floor(); k++) {
      final p = _on(o, rr, k.toDouble());
      c.drawLine(_on(o, rr - 12, k.toDouble()), _on(o, rr + 12, k.toDouble()), MPaint.stroke(IX.ink, 3));
      IxPaint.label(c, '$k r', _on(o, rr + 36, k.toDouble()), size: 18, color: IX.ink, w: FontWeight.w600);
      c.drawLine(o, p, MPaint.stroke(IX.rule, 1.5));
    }
    c.drawLine(o, o + Offset(rr, 0), MPaint.stroke(IX.accent, 4));
    c.drawLine(o, _on(o, rr, t), MPaint.stroke(IX.accent, 4));
    IxPaint.label(c, 'r = ${fmtT(s.r, 1)}', o + Offset(rr / 2, 24), size: 20, color: IX.accent, w: FontWeight.w600, halo: true);
    MPaint.arc(c, o, 44, 0, t, IX.amber);
    IxPaint.label(c, 'θ', _on(o, 70, t / 2), size: 24, color: IX.amber, w: FontWeight.w700);
    IxPaint.label(c, 'l = rθ = ${fmt(s.r * t, 2)}', _on(o, rr + 70, t / 2), size: 22, color: IX.positive, w: FontWeight.w700, halo: true);
    MPaint.dot(c, _on(o, rr, t), IX.positive, r: 10);
    // Conversion card.
    final card = Rect.fromLTWH(size.width - 400, 60, 340, 210);
    c.drawRRect(RRect.fromRectAndRadius(card, const Radius.circular(16)), Paint()..color = IX.page);
    IxPaint.label(c, 'π radians = 180°', card.topLeft + const Offset(24, 24), size: 22, color: IX.ink, w: FontWeight.w600, align: Alignment.topLeft);
    IxPaint.label(c, '1 radian ≈ 57°16′', card.topLeft + const Offset(24, 70), size: 20, color: IX.inkSoft, align: Alignment.topLeft);
    IxPaint.label(c, '${fmtT(s.theta, 0)}° = ${s.radText(s.theta)} rad', card.topLeft + const Offset(24, 120), size: 24, color: IX.accent, w: FontWeight.w700, align: Alignment.topLeft);
  }

  void _inverse(Canvas c, Size size) {
    final (o, r) = circle(s, size);
    _axesCircle(c, o, r);
    final fn = s.fn;
    // Principal arc.
    final (a0, a1) = switch (fn) { 'acos' => (0.0, math.pi), 'acot' => (0.0, math.pi), _ => (-math.pi / 2, math.pi / 2) };
    c.drawArc(Rect.fromCircle(center: o, radius: r), -a0, -(a1 - a0), false, MPaint.stroke(IX.accent.withValues(alpha: 0.35), 12));
    final pv = s.principal;
    final p = _on(o, r, pv);
    c.drawLine(o, p, MPaint.stroke(IX.ink, 3));
    MPaint.arc(c, o, r * 0.3, 0, pv, IX.positive, w: 4);
    if (fn == 'asin') {
      IxPaint.dashed(c, o + Offset(-r * 1.25, -s.v * r), o + Offset(r * 1.25, -s.v * r), MPaint.stroke(MX.red, 2));
      MPaint.hole(c, _on(o, r, math.pi - pv), IX.steel, r: 9);
    } else if (fn == 'acos') {
      IxPaint.dashed(c, o + Offset(s.v * r, -r * 1.25), o + Offset(s.v * r, r * 1.25), MPaint.stroke(MX.red, 2));
      MPaint.hole(c, _on(o, r, -pv), IX.steel, r: 9);
    } else if (fn == 'atan') {
      c.drawLine(o + Offset(r, -r * 1.25), o + Offset(r, r * 1.25), MPaint.stroke(IX.rule, 2));
      final h = (s.v.clamp(-1.25, 1.25)) * r;
      c.drawLine(o, o + Offset(r, -h), MPaint.stroke(MX.red, 2));
      MPaint.dot(c, o + Offset(r, -h), MX.red, r: 7);
    } else {
      c.drawLine(o + Offset(-r * 1.25, -r), o + Offset(r * 1.25, -r), MPaint.stroke(IX.rule, 2));
    }
    IxPaint.handle(c, p, IX.positive, r: 15, active: s._drag);
    IxPaint.label(c, 'principal branch', _on(o, r + 38, (a0 + a1) / 2 + 0.6), size: 17, color: IX.accent, w: FontWeight.w600, halo: true);
    // Graph of the inverse.
    final bounded = fn == 'asin' || fn == 'acos';
    final xr = bounded ? 1.3 : 5.0;
    final pl = Plane(Rect.fromLTRB(o.dx + r * 1.6 + 60, 60, size.width - 50, size.height - 60), -xr, xr, fn == 'asin' || fn == 'atan' ? -1.9 : -0.4, fn == 'asin' || fn == 'atan' ? 1.9 : 3.5);
    pl.paintGrid(c, xLabel: 'v', yLabel: 'θ', yStep: math.pi / 2, yTick: (y) => piFrac(y));
    double inv(double x) => switch (fn) { 'acos' => math.acos(x), 'atan' => math.atan(x), 'acot' => math.pi / 2 - math.atan(x), _ => math.asin(x) };
    pl.curve(c, inv, IX.accent, width: 4.5, from: bounded ? -1 : null, to: bounded ? 1 : null);
    for (final yv in fn == 'asin' || fn == 'atan' ? [-math.pi / 2, math.pi / 2] : [0.0, math.pi]) {
      IxPaint.dashed(c, pl.p(-xr, yv), pl.p(xr, yv), MPaint.stroke(IX.steel, 1.6), dash: 7, gap: 6);
    }
    if (s.v.abs() <= xr) {
      MPaint.dot(c, pl.p(s.v, pv), IX.positive, r: 10);
      IxPaint.label(c, '(${fmt(s.v, 2)}, ${piFrac(pv)})', pl.p(s.v, pv) + const Offset(16, -20), size: 19, color: IX.positive, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
    }
    IxPaint.label(c, 'θ = ${s.invName} v', Offset(pl.rect.left + 16, pl.rect.top + 8), size: 22, color: IX.accent, w: FontWeight.w700, align: Alignment.topLeft, halo: true);
  }

  void _compound(Canvas c, Size size) {
    final (o, r) = circle(s, size);
    _axesCircle(c, o, r);
    final a = s.A * _d2r, b = s.B * _d2r;
    final p0 = _on(o, r, 0), p1 = _on(o, r, a), p2 = _on(o, r, b), p3 = _on(o, r, a - b);
    for (final q in [p1, p2, p3]) {
      c.drawLine(o, q, MPaint.stroke(IX.rule, 2));
    }
    c.drawLine(p1, p2, MPaint.stroke(IX.accent, 5));
    c.drawLine(p0, p3, MPaint.stroke(IX.positive, 5));
    MPaint.arc(c, o, 50, b, a - b, IX.accent, w: 3);
    MPaint.arc(c, o, 70, 0, a - b, IX.positive, w: 3);
    for (final (q, n, ang) in [(p0, 'P₀', 0.0), (p1, 'P₁', a), (p2, 'P₂', b), (p3, 'P₃', a - b)]) {
      MPaint.dot(c, q, IX.ink, r: 8);
      IxPaint.label(c, n, _on(o, r + 30, ang), size: 22, color: IX.ink, w: FontWeight.w700);
    }
    IxPaint.handle(c, p1, IX.accent, r: 14, active: s._drag);
    final x0 = o.dx + r * 1.5 + 30;
    final lines = [
      ('P₁ = (cos x, sin x),  P₂ = (cos y, sin y)', IX.accent),
      ('P₀ = (1, 0),  P₃ = (cos(x − y), sin(x − y))', IX.positive),
      ('Both chords subtend the angle x − y at O,', IX.ink),
      ('so P₁P₂² = P₀P₃²:', IX.ink),
      ('2 − 2(cos x cos y + sin x sin y)', IX.accent),
      ('   = 2 − 2 cos(x − y)', IX.positive),
    ];
    for (final (i, (t, col)) in lines.indexed) {
      IxPaint.label(c, t, Offset(x0, o.dy - r + i * 46.0), size: 21, color: col, w: i >= 4 ? FontWeight.w700 : FontWeight.w500, align: Alignment.centerLeft);
    }
  }

  void _tansum(Canvas c, Size size) {
    final (o, r) = circle(s, size);
    _axesCircle(c, o, r, ticks: false);
    final a = math.atan(s.A), b = math.atan(s.B), sum = a + b, form = math.atan((s.A + s.B) / (1 - s.A * s.B));
    MPaint.arc(c, o, r * 0.35, 0, a, IX.amber, w: 4);
    MPaint.arc(c, o, r * 0.5, a, b, IX.accent, w: 4);
    c.drawLine(o, _on(o, r, a), MPaint.stroke(IX.amber, 3));
    c.drawLine(o, _on(o, r * 1.05, sum), MPaint.stroke(IX.green, 5));
    IxPaint.dashed(c, o, _on(o, r * 1.2, form), MPaint.stroke(MX.red, 3), dash: 10, gap: 7);
    IxPaint.label(c, 'tan⁻¹x', _on(o, r * 0.35 + 34, a / 2), size: 19, color: IX.amber, w: FontWeight.w600, halo: true);
    IxPaint.label(c, '+ tan⁻¹y', _on(o, r * 0.5 + 40, a + b / 2), size: 19, color: IX.accent, w: FontWeight.w600, halo: true);
    IxPaint.label(c, 'sum', _on(o, r * 1.05 + 30, sum), size: 19, color: IX.green, w: FontWeight.w700, halo: true);
    IxPaint.label(c, 'formula', _on(o, r * 1.2 + 30, form), size: 19, color: MX.red, w: FontWeight.w700, halo: true);
    final xy = s.A * s.B;
    final msg = xy < 1 ? 'xy < 1: the formula ray lands on the sum' : xy > 1 ? (s.A > 0 ? 'xy > 1, x > 0: add π to the formula' : 'xy > 1, x < 0: subtract π from the formula') : 'xy = 1: the sum is ±π/2';
    IxPaint.label(c, msg, Offset(o.dx + r * 1.5 + 30, o.dy), size: 22, color: xy < 1 ? IX.green : MX.red, w: FontWeight.w600, align: Alignment.centerLeft);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
