import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'common.dart';

/// Straight lines in the coordinate plane: distance, section formula and area of a triangle,
/// slope and inclination, the angle between two lines, the forms of the equation of a line,
/// and the distance of a point from a line.
///
/// Preset: {"mode": "triangle"|"slope"|"angle"|"forms"|"distance", "A": [-4, -2], "B": [4, 3],
/// "C": [1, 5], "k": 1, "external": false, "a1": 30, "a2": 120, "m": 0.5, "form": "point"|"two"|"intercept"|"slope",
/// "line": [3, 4, -6], "P": [4, 3]}.
class LinesInstrument extends StatefulWidget {
  const LinesInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<LinesInstrument> createState() => _LinesState();
}

class _LinesState extends State<LinesInstrument> {
  String mode = 'triangle', form = 'point';
  Offset A = const Offset(-4, -2), B = const Offset(4, 3), C = const Offset(1, 5), P = const Offset(4, 3);
  double k = 1, a1 = 30, a2 = 120, m = 0.5, la = 3, lb = 4, lc = -6;
  bool external = false;
  int? active;
  int _drag = -1;

  static final _presets = <String, Map<String, dynamic>>{
    'Triangle': {'mode': 'triangle', 'A': [-4, -2], 'B': [4, 3], 'C': [1, 5], 'k': 1},
    'Slope': {'mode': 'slope', 'A': [-3, -1], 'B': [3, 3]},
    'Angle between lines': {'mode': 'angle', 'a1': 30, 'a2': 120, 'A': [0, 0]},
    'Intercept form': {'mode': 'forms', 'form': 'intercept', 'A': [4, 0], 'B': [0, 3]},
    'Point to line': {'mode': 'distance', 'line': [3, 4, -12], 'P': [5, 4]},
  };

  @override
  void initState() {
    super.initState();
    _apply(widget.preset.isEmpty ? _presets['Triangle']! : widget.preset);
    if (widget.preset.isEmpty) active = 0;
  }

  void _apply(Map<String, dynamic> p) {
    Offset o(String key, Offset f) {
      final l = pl(p, key, []);
      return l.length == 2 ? Offset(l[0], l[1]) : f;
    }

    mode = ps(p, 'mode', 'triangle');
    form = ps(p, 'form', 'point');
    A = o('A', const Offset(-4, -2));
    B = o('B', const Offset(4, 3));
    C = o('C', const Offset(1, 5));
    P = o('P', const Offset(4, 3));
    k = pd(p, 'k', 1);
    external = pb(p, 'external', false);
    a1 = pd(p, 'a1', 30);
    a2 = pd(p, 'a2', 120);
    m = pd(p, 'm', 0.5);
    final l = pl(p, 'line', [3, 4, -6]);
    la = l[0];
    lb = l[1];
    lc = l[2];
  }

  double dist(Offset u, Offset v) => (u - v).distance;
  double? slope(Offset u, Offset v) => (v.dx - u.dx).abs() < 1e-9 ? null : (v.dy - u.dy) / (v.dx - u.dx);
  Offset get section => external ? (B * k - A) / (k - 1) : (B * k + A) / (k + 1);
  double get area => ((A.dx * (B.dy - C.dy) + B.dx * (C.dy - A.dy) + C.dx * (A.dy - B.dy)) / 2).abs();
  String pt(Offset v) => '(${fmtT(v.dx, 1)}, ${fmtT(v.dy, 1)})';

  /// y = mx + c written neatly, or x = constant.
  String eqn(Offset p0, double? mm) {
    if (mm == null) return 'x = ${fmtT(p0.dx, 2)}';
    final cc = p0.dy - mm * p0.dx;
    final mx = coef(mm, 'x', lead: true);
    if (mx.isEmpty) return 'y = ${fmtT(cc, 2)}';
    return 'y = $mx${cc.abs() < 1e-9 ? '' : ' ${signed(cc)}'}';
  }

  /// Ax + By + C = 0 through two points, with small integers where possible.
  String general(Offset u, Offset v) {
    var a = v.dy - u.dy, b = u.dx - v.dx, c = -(a * u.dx + b * u.dy);
    if (a < 0 || (a == 0 && b < 0)) {
      a = -a;
      b = -b;
      c = -c;
    }
    final s = '${coef(a, 'x', lead: true)}${a == 0 ? coef(b, 'y', lead: true) : coef(b, 'y')}';
    return '$s${c.abs() < 1e-9 ? '' : ' ${signed(c)}'} = 0';
  }

  String deg(double d) => '${fmtT(d, 1)}°';

  @override
  Widget build(BuildContext context) {
    String title, formula;
    late List<Readout> ro;
    late List<Widget> ctl;
    Widget sl(String l, double v, double lo, double hi, ValueChanged<double> on, {double step = 1, int d = 0, String unit = ''}) => IxSlider(label: l, value: v.clamp(lo, hi), min: lo, max: hi, divisions: ((hi - lo) / step).round(), unit: unit, format: (x) => fmt(x, d), onChanged: (x) => setState(() { on(x); active = null; }));
    switch (mode) {
      case 'slope':
        final s = slope(A, B);
        final th = s == null ? 90.0 : (math.atan(s) * 180 / math.pi + 180) % 180;
        title = 'Slope from two points';
        formula = 'm = (y₂ − y₁)/(x₂ − x₁) = tan θ';
        ro = [
          Readout('Slope m', s == null ? 'not defined' : fmt(s, 3), '', IX.accent),
          Readout('Inclination θ', deg(th), '', IX.amber),
          Readout('Perpendicular slope', s == null ? '0' : s.abs() < 1e-9 ? 'not defined' : fmt(-1 / s, 3), '', IX.green),
          Readout('Line PQ', eqn(A, s), '', IX.ink),
        ];
        ctl = [Text('Drag P and Q.', style: IX.text(18, c: IX.inkSoft))];
      case 'angle':
        final m1 = math.tan(a1 * math.pi / 180), m2 = math.tan(a2 * math.pi / 180);
        var th = (a2 - a1).abs() % 180;
        if (th > 90) th = 180 - th;
        title = 'The angle between two lines';
        formula = 'tan θ = |(m₂ − m₁)/(1 + m₁m₂)|';
        ro = [
          Readout('m₁ = tan α₁', (a1 - 90).abs() < 1e-9 ? 'not defined' : fmt(m1, 3), '', IX.accent),
          Readout('m₂ = tan α₂', (a2 - 90).abs() < 1e-9 ? 'not defined' : fmt(m2, 3), '', IX.positive),
          Readout('Acute angle θ', deg(th), '', IX.amber),
          Readout('Obtuse angle', deg(180 - th), '', IX.inkSoft),
          Readout('Lines are', th.abs() < 1e-9 ? 'parallel' : (th - 90).abs() < 1e-9 ? 'perpendicular (m₁m₂ = −1)' : 'neither ∥ nor ⊥', '', IX.green),
        ];
        ctl = [sl('α₁', a1, 0, 175, (x) => a1 = x, step: 5, unit: '°'), sl('α₂', a2, 0, 175, (x) => a2 = x, step: 5, unit: '°'), Text('Drag the meeting point.', style: IX.text(18, c: IX.inkSoft))];
      case 'forms':
        final s = form == 'point' ? m : slope(A, B);
        final cc = s == null ? double.nan : A.dy - s * A.dx;
        title = const {'point': 'Point-slope form', 'two': 'Two-point form', 'intercept': 'Intercept form', 'slope': 'Slope-intercept form'}[form]!;
        formula = const {'point': 'y − y₀ = m(x − x₀)', 'two': 'y − y₁ = (y₂ − y₁)/(x₂ − x₁) · (x − x₁)', 'intercept': 'x/a + y/b = 1', 'slope': 'y = mx + c'}[form]!;
        final xi = s == null ? A.dx : (s.abs() < 1e-9 ? double.nan : -cc / s);
        ro = [
          Readout('Slope m', s == null ? 'not defined' : fmt(s, 3), '', IX.accent),
          Readout('y-intercept c', s == null ? 'none' : fmt(cc, 2), '', IX.green),
          Readout('x-intercept', xi.isNaN ? 'none' : fmt(xi, 2), '', IX.positive),
          Readout('Equation', eqn(A, s), '', IX.ink),
          Readout('General form', form == 'point' ? general(A, A + Offset(1, m)) : general(A, B), '', IX.inkSoft),
        ];
        ctl = [
          segs<String>('Form', const {'point': 'Point-slope', 'two': 'Two-point', 'intercept': 'Intercepts', 'slope': 'y = mx + c'}, form, (v) => setState(() {
            form = v;
            if (v == 'intercept') {
              A = Offset(A.dx == 0 ? 4 : A.dx, 0);
              B = Offset(0, B.dy == 0 ? 3 : B.dy);
            }
            if (v == 'slope') A = Offset(0, A.dy);
          })),
          if (form == 'point' || form == 'slope') sl('Slope m', m, -4, 4, (x) => m = x, step: 0.25, d: 2),
          Text(form == 'intercept' ? 'Drag the intercepts on the axes.' : 'Drag the points.', style: IX.text(18, c: IX.inkSoft)),
        ];
      case 'distance':
        final n2 = la * la + lb * lb;
        final val = la * P.dx + lb * P.dy + lc;
        final d = val.abs() / math.sqrt(n2);
        title = 'Distance from a point to a line';
        formula = 'd = |Ax₁ + By₁ + C| / √(A² + B²)';
        ro = [
          Readout('Ax₁ + By₁ + C', fmt(val, 2), '', IX.ink),
          Readout('Distance d', fmt(d, 3), 'units', IX.positive),
          Readout('Distance of O', fmt(lc.abs() / math.sqrt(n2), 3), 'units', IX.inkSoft),
          Readout('P is on the', val.abs() < 1e-9 ? 'line' : val > 0 ? 'side Ax + By + C > 0' : 'side Ax + By + C < 0', '', IX.accent),
        ];
        ctl = [sl('A', la, -5, 5, (x) => la = x == 0 && lb == 0 ? 0.5 : x, step: 0.5, d: 1), sl('B', lb, -5, 5, (x) => lb = x == 0 && la == 0 ? 0.5 : x, step: 0.5, d: 1), sl('C', lc, -12, 12, (x) => lc = x), Text('Drag P.', style: IX.text(18, c: IX.inkSoft))];
      default:
        final sp = section;
        title = 'Distance, section and area';
        formula = external ? 'P = (kx₂ − x₁)/(k − 1), …' : 'P = (kx₂ + x₁)/(k + 1), …';
        ro = [
          Readout('AB', fmt(dist(A, B), 3), '', IX.accent),
          Readout('BC', fmt(dist(B, C), 3), '', IX.inkSoft),
          Readout('P divides AB as k : 1', pt(sp), '', IX.positive),
          Readout('Area of ABC', fmt(area, 2), 'sq. units', IX.green),
          if (area < 1e-9) const Readout('A, B, C', 'collinear', '', MX.red),
        ];
        ctl = [
          sl('Ratio k : 1', k, 0.25, 4, (x) => k = external && (x - 1).abs() < 0.1 ? 1.25 : x, step: 0.25, d: 2),
          IxToggle(label: 'External division', value: external, onChanged: (v) => setState(() { external = v; if (v && (k - 1).abs() < 0.1) k = 2; })),
          Text('Drag A, B and C.', style: IX.text(18, c: IX.inkSoft)),
        ];
    }
    return InstrumentFrame(
      id: 'maths-lines',
      subtitle: tx(widget.preset['subtitle']) ?? '$kMaths · Straight lines',
      title: tx(widget.preset['title']) ?? title,
      formula: formula,
      state: {'mode': mode, 'A': [A.dx, A.dy], 'B': [B.dx, B.dy], 'C': [C.dx, C.dy], 'P': [P.dx, P.dy], 'k': k, 'line': [la, lb, lc]},
      readouts: ro,
      controls: ctl,
      presets: [for (final (i, e) in _presets.entries.indexed) Preset(e.key, () => setState(() { _apply(e.value); active = i; }))],
      activePreset: active,
      stage: LayoutBuilder(builder: (context, box) {
        final size = box.biggest;
        final pln = Plane(Rect.fromLTRB(70, 40, size.width - 40, size.height - 50), -9, 9, -6, 7, equal: true);
        final handles = <Offset>[if (mode != 'distance') A, if (mode == 'triangle' || mode == 'slope' || (mode == 'forms' && form != 'point' && form != 'slope')) B, if (mode == 'triangle') C, if (mode == 'distance') P];
        return GestureDetector(
          onPanStart: (e) {
            _drag = -1;
            for (final (i, h) in handles.indexed) {
              if ((pln.p(h.dx, h.dy) - e.localPosition).distance < 50) _drag = i;
            }
          },
          onPanUpdate: (e) {
            if (_drag < 0) return;
            final w = pln.w(e.localPosition);
            var v = Offset((w.dx * 2).round() / 2, (w.dy * 2).round() / 2);
            setState(() {
              active = null;
              if (mode == 'distance') {
                P = v;
                return;
              }
              if (mode == 'forms' && form == 'intercept') v = _drag == 0 ? Offset(v.dx == 0 ? 0.5 : v.dx, 0) : Offset(0, v.dy == 0 ? 0.5 : v.dy);
              if (mode == 'forms' && form == 'slope') v = Offset(0, v.dy);
              switch (_drag) {
                case 0:
                  A = v;
                case 1:
                  B = v;
                default:
                  C = v;
              }
            });
          },
          onPanEnd: (_) => _drag = -1,
          child: CustomPaint(size: size, painter: _LinesPainter(this, pln)),
        );
      }),
    );
  }
}

class _LinesPainter extends CustomPainter {
  _LinesPainter(this.s, this.pl);
  final _LinesState s;
  final Plane pl;

  void fullLine(Canvas c, Offset p0, double? m, Color col, {double w = 3.5, bool dashed = false}) {
    c.save();
    c.clipRect(pl.rect);
    final a = m == null ? Offset(p0.dx, pl.ya) : Offset(pl.xa, p0.dy + m * (pl.xa - p0.dx));
    final b = m == null ? Offset(p0.dx, pl.yb) : Offset(pl.xb, p0.dy + m * (pl.xb - p0.dx));
    if (dashed) {
      IxPaint.dashed(c, pl.p(a.dx, a.dy), pl.p(b.dx, b.dy), MPaint.stroke(col, w), dash: 12, gap: 8);
    } else {
      c.drawLine(pl.p(a.dx, a.dy), pl.p(b.dx, b.dy), MPaint.stroke(col, w));
    }
    c.restore();
  }

  void point(Canvas c, Offset v, String name, Color col, {bool handle = true, Offset off = const Offset(16, -22)}) {
    handle ? IxPaint.handle(c, pl.p(v.dx, v.dy), col, r: 13) : MPaint.dot(c, pl.p(v.dx, v.dy), col, r: 8);
    IxPaint.label(c, '$name${s.pt(v)}', pl.p(v.dx, v.dy) + off, size: 20, color: col, w: FontWeight.w700, align: off.dx >= 0 ? Alignment.centerLeft : Alignment.centerRight, halo: true);
  }

  @override
  void paint(Canvas c, Size size) {
    pl.paintGrid(c);
    switch (s.mode) {
      case 'slope':
        final m = s.slope(s.A, s.B);
        fullLine(c, s.A, m, IX.accent);
        fullLine(c, s.A + const Offset(0, 2.5), m, IX.accent.withValues(alpha: 0.4), dashed: true, w: 2.5);
        fullLine(c, s.A, m == null ? 0 : (m.abs() < 1e-9 ? null : -1 / m), IX.green, w: 2.5);
        final corner = Offset(s.B.dx, s.A.dy);
        IxPaint.dashed(c, pl.p(s.A.dx, s.A.dy), pl.p(corner.dx, corner.dy), MPaint.stroke(IX.positive, 2.5), dash: 8, gap: 5);
        IxPaint.dashed(c, pl.p(corner.dx, corner.dy), pl.p(s.B.dx, s.B.dy), MPaint.stroke(IX.positive, 2.5), dash: 8, gap: 5);
        IxPaint.label(c, 'run ${fmtT(s.B.dx - s.A.dx, 1)}', pl.p((s.A.dx + s.B.dx) / 2, s.A.dy) + Offset(0, s.B.dy >= s.A.dy ? 22 : -22), size: 18, color: IX.positive, w: FontWeight.w600, halo: true);
        IxPaint.label(c, 'rise ${fmtT(s.B.dy - s.A.dy, 1)}', pl.p(s.B.dx, (s.A.dy + s.B.dy) / 2) + const Offset(14, 0), size: 18, color: IX.positive, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
        if (m != null) {
          final xAxis = m.abs() < 1e-9 ? null : s.A.dx - s.A.dy / m;
          if (xAxis != null && xAxis > pl.xa && xAxis < pl.xb) {
            final th = (math.atan(m) + math.pi) % math.pi;
            MPaint.arc(c, pl.p(xAxis, 0), 44, 0, th, IX.amber, w: 3);
            IxPaint.label(c, 'θ', pl.p(xAxis, 0) + Offset(math.cos(th / 2), -math.sin(th / 2)) * 64, size: 22, color: IX.amber, w: FontWeight.w700);
          }
        }
        point(c, s.A, 'P', IX.accent, off: const Offset(-16, 22));
        point(c, s.B, 'Q', IX.accent);
        MPaint.legend(c, Offset(pl.rect.left + 16, pl.rect.top + 8), [(IX.accent, 'line PQ'), (IX.green, 'perpendicular through P')]);
      case 'angle':
        final m1 = (s.a1 - 90).abs() < 1e-9 ? null : math.tan(s.a1 * math.pi / 180), m2 = (s.a2 - 90).abs() < 1e-9 ? null : math.tan(s.a2 * math.pi / 180);
        fullLine(c, s.A, m1, IX.accent);
        fullLine(c, s.A, m2, IX.positive);
        final o = pl.p(s.A.dx, s.A.dy);
        final lo = math.min(s.a1, s.a2) * math.pi / 180, hi = math.max(s.a1, s.a2) * math.pi / 180;
        var th = hi - lo;
        final acuteFirst = th <= math.pi / 2;
        if (acuteFirst) {
          c.drawArc(Rect.fromCircle(center: o, radius: 60), -lo, -th, true, Paint()..color = IX.amber.withValues(alpha: 0.2));
          MPaint.arc(c, o, 60, lo, th, IX.amber, w: 3);
          IxPaint.label(c, 'θ', o + Offset(math.cos(lo + th / 2), -math.sin(lo + th / 2)) * 84, size: 24, color: IX.amber, w: FontWeight.w700);
        } else {
          th = math.pi - th;
          c.drawArc(Rect.fromCircle(center: o, radius: 60), -hi, -th, true, Paint()..color = IX.amber.withValues(alpha: 0.2));
          MPaint.arc(c, o, 60, hi, th, IX.amber, w: 3);
          IxPaint.label(c, 'θ', o + Offset(math.cos(hi + th / 2), -math.sin(hi + th / 2)) * 84, size: 24, color: IX.amber, w: FontWeight.w700);
        }
        IxPaint.handle(c, o, IX.ink, r: 12);
        MPaint.legend(c, Offset(pl.rect.left + 16, pl.rect.top + 8), [(IX.accent, 'line 1, α₁ = ${fmtT(s.a1)}°'), (IX.positive, 'line 2, α₂ = ${fmtT(s.a2)}°')]);
      case 'forms':
        final m = s.form == 'point' || s.form == 'slope' ? s.m : s.slope(s.A, s.B);
        fullLine(c, s.A, m, IX.accent, w: 4);
        if (s.form == 'intercept') {
          point(c, s.A, 'a = ${fmtT(s.A.dx)}  ', IX.positive, off: const Offset(10, 26));
          point(c, s.B, 'b = ${fmtT(s.B.dy)}  ', IX.green);
          IxPaint.label(c, 'x/${fmtT(s.A.dx)} + y/${fmtT(s.B.dy)} = 1', Offset(pl.rect.right - 20, pl.rect.top + 20), size: 26, color: IX.ink, w: FontWeight.w700, align: Alignment.topRight, halo: true);
        } else {
          point(c, s.A, s.form == 'slope' ? 'c: ' : 'P', IX.accent, off: const Offset(-16, 22));
          if (s.form == 'two') point(c, s.B, 'Q', IX.accent);
          if (m != null) {
            final q = s.A + const Offset(1, 0);
            IxPaint.dashed(c, pl.p(s.A.dx, s.A.dy), pl.p(q.dx, q.dy), MPaint.stroke(IX.positive, 2.5), dash: 6, gap: 4);
            IxPaint.dashed(c, pl.p(q.dx, q.dy), pl.p(q.dx, q.dy + m), MPaint.stroke(IX.positive, 2.5), dash: 6, gap: 4);
            IxPaint.label(c, 'm = ${fmtT(m, 2)}', pl.p(q.dx, q.dy + m / 2) + const Offset(12, 0), size: 18, color: IX.positive, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
          }
          IxPaint.label(c, s.eqn(s.A, m), Offset(pl.rect.right - 20, pl.rect.top + 20), size: 28, color: IX.ink, w: FontWeight.w700, align: Alignment.topRight, halo: true);
        }
      case 'distance':
        final m = s.lb.abs() < 1e-9 ? null : -s.la / s.lb;
        final p0 = s.lb.abs() < 1e-9 ? Offset(-s.lc / s.la, 0) : Offset(0, -s.lc / s.lb);
        fullLine(c, p0, m, IX.accent, w: 4);
        final n2 = s.la * s.la + s.lb * s.lb;
        final t = (s.la * s.P.dx + s.lb * s.P.dy + s.lc) / n2;
        final f = s.P - Offset(s.la, s.lb) * t;
        c.drawLine(pl.p(s.P.dx, s.P.dy), pl.p(f.dx, f.dy), MPaint.stroke(IX.positive, 4));
        // Right-angle mark.
        final u = (s.P - f).distance < 1e-9 ? const Offset(0, 1) : (s.P - f) / (s.P - f).distance;
        final v = Offset(-u.dy, u.dx);
        final q0 = f + u * 0.35, q1 = f + u * 0.35 + v * 0.35, q2 = f + v * 0.35;
        c.drawPath(Path()..moveTo(pl.sx(q0.dx), pl.sy(q0.dy))..lineTo(pl.sx(q1.dx), pl.sy(q1.dy))..lineTo(pl.sx(q2.dx), pl.sy(q2.dy)), MPaint.stroke(IX.positive, 2));
        MPaint.dot(c, pl.p(f.dx, f.dy), IX.positive, r: 7);
        IxPaint.label(c, 'F', pl.p(f.dx, f.dy) + const Offset(-14, 18), size: 20, color: IX.positive, w: FontWeight.w700);
        IxPaint.label(c, 'd = ${fmt((s.P - f).distance, 3)}', pl.p((s.P.dx + f.dx) / 2, (s.P.dy + f.dy) / 2) + const Offset(16, 0), size: 20, color: IX.positive, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
        point(c, s.P, 'P', IX.ink);
        IxPaint.label(c, '${coef(s.la, 'x', lead: true)}${s.la == 0 ? coef(s.lb, 'y', lead: true) : coef(s.lb, 'y')} ${signed(s.lc)} = 0', Offset(pl.rect.right - 20, pl.rect.top + 20), size: 26, color: IX.accent, w: FontWeight.w700, align: Alignment.topRight, halo: true);
      default:
        final tri = Path()..addPolygon([pl.p(s.A.dx, s.A.dy), pl.p(s.B.dx, s.B.dy), pl.p(s.C.dx, s.C.dy)], true);
        c.drawPath(tri, Paint()..color = IX.green.withValues(alpha: 0.1));
        c.drawPath(tri, MPaint.stroke(IX.ink, 3));
        final sp = s.section;
        if (s.external) {
          c.save();
          c.clipRect(pl.rect);
          IxPaint.dashed(c, pl.p(s.A.dx, s.A.dy), pl.p(sp.dx, sp.dy), MPaint.stroke(IX.positive, 2.5));
          c.restore();
        }
        c.drawLine(pl.p(s.A.dx, s.A.dy), pl.p(s.B.dx, s.B.dy), MPaint.stroke(IX.accent, 4));
        if (pl.contains(sp.dx, sp.dy)) {
          MPaint.dot(c, pl.p(sp.dx, sp.dy), IX.positive, r: 10);
          IxPaint.label(c, 'P${s.pt(sp)}', pl.p(sp.dx, sp.dy) + const Offset(14, 22), size: 19, color: IX.positive, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
        }
        point(c, s.A, 'A', IX.accent, off: const Offset(-16, 22));
        point(c, s.B, 'B', IX.accent);
        point(c, s.C, 'C', IX.green);
        IxPaint.label(c, 'AB = ${fmt(s.dist(s.A, s.B), 2)}', pl.p((s.A.dx + s.B.dx) / 2, (s.A.dy + s.B.dy) / 2) + const Offset(18, 18), size: 18, color: IX.accent, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
