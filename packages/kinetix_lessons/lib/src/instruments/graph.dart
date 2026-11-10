import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'design.dart';

enum Family { quadratic, cubic, sine, exponential }

/// Graph explorer (PUC Maths: functions, derivatives, integrals): a function family with a, b,
/// c sliders, a draggable tangent point, and the signed area under the curve between p and q.
///
/// Preset: {"family":"quadratic"|"cubic"|"sine"|"exponential", "a":1, "b":0, "c":0, "x0":1,
/// "from":0, "to":2, "tangent":true, "area":true}.
class GraphInstrument extends StatefulWidget {
  const GraphInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<GraphInstrument> createState() => _GraphState();
}

class _GraphState extends State<GraphInstrument> {
  Family fam = Family.quadratic;
  double a = 1, b = 0, c = 0, x0 = 1, p = 0, q = 2;
  bool tangent = true, area = true;
  bool _drag = false;
  int? preset;

  static final _presets = <String, Map<String, dynamic>>{
    'Parabola': {'family': 'quadratic', 'a': 0.5, 'b': -1, 'c': -2, 'x0': 3, 'from': -1, 'to': 3},
    'Cubic': {'family': 'cubic', 'a': 0.25, 'b': -2, 'c': 0, 'x0': -1.6, 'from': -2.8, 'to': 0},
    'Sine wave': {'family': 'sine', 'a': 2, 'b': 1, 'c': 0, 'x0': 1, 'from': 0, 'to': 3.14159},
    'Exponential': {'family': 'exponential', 'a': 1, 'b': 0.5, 'c': 0, 'x0': 1, 'from': -2, 'to': 2},
  };

  @override
  void initState() {
    super.initState();
    _apply(widget.preset.isEmpty ? _presets['Parabola']! : widget.preset);
    if (widget.preset.isEmpty) preset = 0;
  }

  void _apply(Map<String, dynamic> m) {
    double d(String k, double f) => (m[k] as num?)?.toDouble() ?? f;
    fam = Family.values.firstWhere((f) => f.name == m['family'], orElse: () => Family.quadratic);
    a = d('a', 1);
    b = d('b', 0);
    c = d('c', 0);
    x0 = d('x0', 1);
    p = d('from', 0);
    q = d('to', 2);
    tangent = m['tangent'] as bool? ?? true;
    area = m['area'] as bool? ?? true;
  }

  double f(double x) => switch (fam) {
    Family.quadratic => a * x * x + b * x + c,
    Family.cubic => a * x * x * x + b * x + c,
    Family.sine => a * math.sin(b * x + c),
    Family.exponential => a * math.exp(b * x) + c,
  };

  double df(double x) => switch (fam) {
    Family.quadratic => 2 * a * x + b,
    Family.cubic => 3 * a * x * x + b,
    Family.sine => a * b * math.cos(b * x + c),
    Family.exponential => a * b * math.exp(b * x),
  };

  String get formula => switch (fam) {
    Family.quadratic => 'f(x) = ax² + bx + c',
    Family.cubic => 'f(x) = ax³ + bx + c',
    Family.sine => 'f(x) = a sin(bx + c)',
    Family.exponential => 'f(x) = a eᵇˣ + c',
  };

  double integral() {
    const n = 400;
    final h = (q - p) / n;
    var s = f(p) + f(q);
    for (var i = 1; i < n; i++) {
      s += f(p + i * h) * (i.isOdd ? 4 : 2);
    }
    return s * h / 3;
  }

  String n2(double v) => '${v < 0 ? '−' : ''}${v.abs().toStringAsFixed(2)}';

  @override
  Widget build(BuildContext context) {
    final y0 = f(x0), m = df(x0);
    final cInt = y0 - m * x0;
    return InstrumentFrame(
      id: 'graph',
      subtitle: 'PUC Mathematics · Derivatives and integrals',
      title: 'Graph explorer',
      formula: formula,
      state: {'family': fam.name, 'a': a, 'b': b, 'c': c, 'x0': x0, 'from': p, 'to': q},
      readouts: [
        Readout('f(x₀)', n2(y0), '', IX.ink),
        Readout("Slope f′(x₀)", n2(m), '', IX.positive),
        Readout('Area ∫ f dx', n2(integral()), 'sq. units', IX.accent),
        Readout('Tangent', 'y = ${n2(m)}x ${cInt < 0 ? '−' : '+'} ${cInt.abs().toStringAsFixed(2)}', ''),
      ],
      controls: [
        IxSegments<Family>(label: 'Family', options: const {Family.quadratic: 'Quadratic', Family.cubic: 'Cubic', Family.sine: 'Sine', Family.exponential: 'Exp'}, value: fam, onChanged: (x) => setState(() { fam = x; preset = null; })),
        IxSlider(label: 'a', value: a, min: -3, max: 3, format: n2, onChanged: (x) => setState(() { a = x; preset = null; })),
        IxSlider(label: 'b', value: b, min: -3, max: 3, format: n2, onChanged: (x) => setState(() { b = x; preset = null; })),
        IxSlider(label: 'c', value: c, min: -4, max: 4, format: n2, onChanged: (x) => setState(() { c = x; preset = null; })),
        IxSlider(label: 'Area from p to q', value: q, min: p + 0.1, max: 6, format: (v) => '${n2(p)} to ${n2(v)}', onChanged: (x) => setState(() => q = x)),
      ],
      presets: [for (final (i, e) in _presets.entries.indexed) Preset(e.key, () => setState(() { _apply(e.value); preset = i; }))],
      activePreset: preset,
      stage: LayoutBuilder(builder: (context, box) {
        final size = box.biggest;
        final unit = size.height / 12.5;
        final o = Offset(size.width / 2, size.height / 2);
        return GestureDetector(
          onPanStart: (e) => _drag = (Offset(o.dx + x0 * unit, o.dy - f(x0) * unit) - e.localPosition).distance < 70,
          onPanUpdate: (e) {
            if (_drag) setState(() => x0 = ((e.localPosition.dx - o.dx) / unit).clamp(-o.dx / unit + 0.3, o.dx / unit - 0.3));
          },
          onPanEnd: (_) => _drag = false,
          child: CustomPaint(size: size, painter: _GraphPainter(this, unit, o)),
        );
      }),
    );
  }
}

class _GraphPainter extends CustomPainter {
  _GraphPainter(this.s, this.u, this.o);
  final _GraphState s;
  final double u;
  final Offset o;

  Offset pt(double x, double y) => Offset(o.dx + x * u, o.dy - y * u);

  @override
  void paint(Canvas c, Size size) {
    final xm = o.dx / u, ym = o.dy / u;
    // Minor and major grid.
    final minor = Paint()..color = IX.grid..strokeWidth = 1;
    final major = Paint()..color = IX.rule..strokeWidth = 1.2;
    for (var i = -(xm * 2).ceil(); i <= (xm * 2).ceil(); i++) {
      c.drawLine(pt(i / 2, -ym), pt(i / 2, ym), i.isEven ? major : minor);
    }
    for (var j = -(ym * 2).ceil(); j <= (ym * 2).ceil(); j++) {
      c.drawLine(pt(-xm, j / 2), pt(xm, j / 2), j.isEven ? major : minor);
    }
    final axis = Paint()..color = IX.ink..strokeWidth = 2;
    c.drawLine(Offset(0, o.dy), Offset(size.width, o.dy), axis);
    c.drawLine(Offset(o.dx, 0), Offset(o.dx, size.height), axis);
    for (var i = -xm.floor(); i <= xm.floor(); i++) {
      if (i == 0) continue;
      IxPaint.label(c, '${i < 0 ? '−' : ''}${i.abs()}', pt(i.toDouble(), 0) + const Offset(0, 18), size: 15, color: IX.inkSoft);
    }
    for (var j = -ym.floor(); j <= ym.floor(); j++) {
      if (j == 0) continue;
      IxPaint.label(c, '${j < 0 ? '−' : ''}${j.abs()}', pt(0, j.toDouble()) - const Offset(10, 0), size: 15, color: IX.inkSoft, align: Alignment.centerRight);
    }
    IxPaint.label(c, 'x', Offset(size.width - 18, o.dy - 20), size: 20, color: IX.ink, w: FontWeight.w600);
    IxPaint.label(c, 'y', Offset(o.dx + 18, 16), size: 20, color: IX.ink, w: FontWeight.w600);

    c.save();
    c.clipRect(Offset.zero & size);
    // Area under the curve, positive part blue, negative part warm.
    if (s.area) {
      const n = 240;
      for (final sign in [1, -1]) {
        final path = Path()..moveTo(pt(s.p, 0).dx, pt(s.p, 0).dy);
        for (var i = 0; i <= n; i++) {
          final x = s.p + (s.q - s.p) * i / n;
          final y = s.f(x);
          final yy = sign > 0 ? math.max(0.0, y) : math.min(0.0, y);
          final pp = pt(x, yy.clamp(-ym - 1, ym + 1));
          path.lineTo(pp.dx, pp.dy);
        }
        path..lineTo(pt(s.q, 0).dx, pt(s.q, 0).dy)..close();
        c.drawPath(path, Paint()..color = (sign > 0 ? IX.accent : IX.positive).withValues(alpha: 0.16));
      }
      for (final x in [s.p, s.q]) {
        IxPaint.dashed(c, pt(x, 0), pt(x, s.f(x).clamp(-ym, ym)), Paint()..color = IX.accent.withValues(alpha: 0.7)..strokeWidth = 2);
      }
      IxPaint.label(c, 'p', pt(s.p, 0) + const Offset(0, 46), size: 18, color: IX.accent, w: FontWeight.w600, halo: true);
      IxPaint.label(c, 'q', pt(s.q, 0) + const Offset(0, 46), size: 18, color: IX.accent, w: FontWeight.w600, halo: true);
    }
    // The curve.
    final path = Path();
    var started = false;
    for (var px = 0.0; px <= size.width; px += 2) {
      final x = (px - o.dx) / u;
      final y = s.f(x);
      if (y.abs() > ym * 3) {
        started = false;
        continue;
      }
      final pp = pt(x, y);
      started ? path.lineTo(pp.dx, pp.dy) : path.moveTo(pp.dx, pp.dy);
      started = true;
    }
    c.drawPath(path, Paint()..color = IX.ink..style = PaintingStyle.stroke..strokeWidth = 4..strokeJoin = StrokeJoin.round..strokeCap = StrokeCap.round);
    // Tangent at x0.
    if (s.tangent) {
      final y0 = s.f(x0), m = s.df(x0);
      final span = 3.0 / math.sqrt(1 + m * m);
      c.drawLine(pt(x0 - span * 1.6, y0 - m * span * 1.6), pt(x0 + span * 1.6, y0 + m * span * 1.6), Paint()..color = IX.positive..strokeWidth = 3.5..strokeCap = StrokeCap.round);
      // Rise-over-run triangle.
      final run = 1.0;
      final tri = Paint()..color = IX.positive.withValues(alpha: 0.7)..strokeWidth = 2;
      IxPaint.dashed(c, pt(x0, y0), pt(x0 + run, y0), tri, dash: 6, gap: 5);
      IxPaint.dashed(c, pt(x0 + run, y0), pt(x0 + run, y0 + m * run), tri, dash: 6, gap: 5);
      IxPaint.label(c, '1', pt(x0 + run / 2, y0) + Offset(0, m >= 0 ? 16 : -16), size: 15, color: IX.positive, w: FontWeight.w600);
      IxPaint.label(c, "f′ = ${m.toStringAsFixed(2)}", pt(x0 + run, y0 + m * run / 2) + const Offset(12, 0), size: 16, color: IX.positive, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
      IxPaint.handle(c, pt(x0, y0), IX.positive, r: 18, active: s._drag);
      IxPaint.label(c, '(x₀, f(x₀))', pt(x0, y0) + const Offset(-30, 34), size: 16, color: IX.ink, w: FontWeight.w600, align: Alignment.centerRight, halo: true);
    }
    c.restore();
  }

  double get x0 => s.x0;

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
