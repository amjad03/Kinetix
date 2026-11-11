import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'common.dart';

/// Conic sections: slicing a double cone, and the circle, parabola, ellipse and hyperbola in
/// standard position with foci, directrices, latus rectum, asymptotes, a point P that runs
/// along the curve showing the focal property, and the tangent at P.
///
/// Preset: {"conic": "circle"|"parabola"|"ellipse"|"hyperbola"|"cone", "h": 1, "k": 1, "r": 2.5,
/// "a": 4, "e": 0.6, "orient": "right"|"left"|"up"|"down", "t": 40 (degrees along the curve),
/// "tangent": false, "alpha": 30, "beta": 60, "test": [3, 2]}.
class ConicsInstrument extends StatefulWidget {
  const ConicsInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<ConicsInstrument> createState() => _ConicsState();
}

class _ConicsState extends State<ConicsInstrument> {
  String conic = 'ellipse', orient = 'right';
  double h = 1, k = 1, r = 2.5, a = 4, e = 0.6, t = 40, alpha = 30, beta = 60, off = 0;
  bool tangent = false;
  Offset? test;
  int? active;
  bool _drag = false;

  static final _presets = <String, Map<String, dynamic>>{
    'Circle': {'conic': 'circle', 'h': 1, 'k': 1, 'r': 3, 'test': [4, 3]},
    'Parabola': {'conic': 'parabola', 'a': 1.5, 'orient': 'right', 't': 40},
    'Ellipse': {'conic': 'ellipse', 'a': 5, 'e': 0.6, 't': 50},
    'Hyperbola': {'conic': 'hyperbola', 'a': 2, 'e': 1.5, 't': 30},
    'Slice a cone': {'conic': 'cone', 'alpha': 30, 'beta': 60},
  };

  @override
  void initState() {
    super.initState();
    _apply(widget.preset.isEmpty ? _presets['Ellipse']! : widget.preset);
    if (widget.preset.isEmpty) active = 2;
  }

  void _apply(Map<String, dynamic> p) {
    conic = ps(p, 'conic', 'ellipse');
    orient = ps(p, 'orient', 'right');
    h = pd(p, 'h', conic == 'circle' ? 1 : 0);
    k = pd(p, 'k', conic == 'circle' ? 1 : 0);
    r = pd(p, 'r', 2.5);
    a = pd(p, 'a', conic == 'hyperbola' ? 2 : conic == 'parabola' ? 1.5 : 5);
    e = pd(p, 'e', conic == 'hyperbola' ? 1.5 : 0.6);
    t = pd(p, 't', 40);
    tangent = pb(p, 'tangent', false);
    alpha = pd(p, 'alpha', 30);
    beta = pd(p, 'beta', 60);
    off = pd(p, 'offset', 0);
    final tt = pl(p, 'test', []);
    test = tt.length == 2 ? Offset(tt[0], tt[1]) : null;
  }

  double get b => conic == 'hyperbola' ? a * math.sqrt(e * e - 1) : a * math.sqrt(math.max(0, 1 - e * e));
  double get c => a * e;

  /// The point P for the parameter t (degrees), and dy/dx there.
  (Offset, double?) get pointP {
    final th = t * math.pi / 180;
    switch (conic) {
      case 'circle':
        final p = Offset(h + r * math.cos(th), k + r * math.sin(th));
        return (p, math.sin(th).abs() < 1e-9 ? null : -math.cos(th) / math.sin(th));
      case 'parabola':
        // y² = 4ax with y = 2a·u, x = a·u²; u from t.
        final u = th / (math.pi / 2) * 1.6;
        final p0 = Offset(a * u * u, 2 * a * u);
        final slope = u.abs() < 1e-9 ? null : 1 / u; // dy/dx = 2a/y
        return switch (orient) {
          'left' => (Offset(-p0.dx, p0.dy), slope == null ? null : -slope),
          'up' => (Offset(p0.dy, p0.dx), u.abs() < 1e-9 ? 0 : u),
          'down' => (Offset(p0.dy, -p0.dx), u.abs() < 1e-9 ? 0 : -u),
          _ => (p0, slope),
        };
      case 'hyperbola':
        final u = (th / (math.pi / 2)).clamp(-0.98, 0.98) * 1.4;
        final x = a * (math.exp(u) + math.exp(-u)) / 2, y = b * (math.exp(u) - math.exp(-u)) / 2;
        return (Offset(x, y), y.abs() < 1e-9 ? null : b * b * x / (a * a * y));
      default:
        final p = Offset(a * math.cos(th), b * math.sin(th));
        return (p, p.dy.abs() < 1e-9 ? null : -b * b * p.dx / (a * a * p.dy));
    }
  }

  Offset get focus => switch (orient) { 'left' => Offset(-a, 0), 'up' => Offset(0, a), 'down' => Offset(0, -a), _ => Offset(a, 0) };

  String get coneName {
    if (beta >= 89.999) return off.abs() < 1e-9 ? 'a point (degenerate)' : 'circle';
    if ((beta - alpha).abs() < 0.5) return off.abs() < 1e-9 ? 'a line (degenerate)' : 'parabola';
    if (beta > alpha) return off.abs() < 1e-9 ? 'a point (degenerate)' : 'ellipse';
    return off.abs() < 1e-9 ? 'two lines (degenerate)' : 'hyperbola';
  }

  @override
  Widget build(BuildContext context) {
    final (P, m) = pointP;
    String title, formula;
    late List<Readout> ro;
    Widget sl(String l, double v, double lo, double hi, ValueChanged<double> on, {double step = 0.5, int d = 1, String unit = ''}) => IxSlider(label: l, value: v.clamp(lo, hi), min: lo, max: hi, divisions: ((hi - lo) / step).round(), unit: unit, format: (x) => fmt(x, d), onChanged: (x) => setState(() { on(x); active = null; }));
    final ctl = <Widget>[];
    switch (conic) {
      case 'cone':
        final ecc = math.cos(beta * math.pi / 180) / math.cos(alpha * math.pi / 180);
        title = 'Slice a double cone';
        formula = 'e = cos β / cos α';
        ro = [
          Readout('Section', coneName, '', IX.positive),
          Readout('e = cos β / cos α', fmt(ecc, 3), '', IX.accent),
          Readout('β − α', '${fmtT(beta - alpha, 1)}°', '', IX.ink),
        ];
        ctl.addAll([
          sl('Semi-vertical angle α', alpha, 15, 60, (x) => alpha = x, step: 1, d: 0, unit: '°'),
          sl('Plane angle β to the axis', beta, 0, 90, (x) => beta = x, step: 1, d: 0, unit: '°'),
          sl('Plane offset from the vertex', off, -3, 3, (x) => off = x, step: 0.5),
        ]);
      case 'circle':
        final sP = test == null ? 0.0 : math.pow(test!.dx - h, 2) + math.pow(test!.dy - k, 2) - r * r;
        title = 'A circle as a locus';
        formula = '(x − h)² + (y − k)² = r²';
        ro = [
          Readout('Centre (h, k)', '(${fmtT(h)}, ${fmtT(k)})', '', IX.ink),
          Readout('Radius r', fmt(r, 2), '', IX.accent),
          Readout('General form', 'x² + y²${coef(-2 * h, 'x')}${coef(-2 * k, 'y')} ${signed(h * h + k * k - r * r)} = 0'.replaceAll(' + 0 = 0', ' = 0'), '', IX.inkSoft),
          if (test != null) Readout('P is', sP.abs() < 1e-9 ? 'on the circle' : sP < 0 ? 'inside' : 'outside', '', IX.positive),
          if (tangent) Readout('Slope of tangent at P', m == null ? 'not defined' : fmt(m, 3), '', IX.positive),
        ];
        ctl.addAll([
          sl('h', h, -4, 4, (x) => h = x),
          sl('k', k, -3, 3, (x) => k = x),
          sl('r', r, 0.5, 4, (x) => r = x),
          if (tangent) sl('Point on the circle', t, 0, 360, (x) => t = x, step: 5, d: 0, unit: '°'),
          if (test != null) Text('Drag the test point P.', style: IX.text(17, c: IX.inkSoft)),
        ]);
      case 'parabola':
        final f = focus;
        final eqs = const {'right': 'y² = 4ax', 'left': 'y² = −4ax', 'up': 'x² = 4ay', 'down': 'x² = −4ay'};
        final dirs = {'right': 'x = −${fmtT(a)}', 'left': 'x = ${fmtT(a)}', 'up': 'y = −${fmtT(a)}', 'down': 'y = ${fmtT(a)}'};
        final ps0 = (P - f).distance;
        title = 'Parabola: focus and directrix';
        formula = '${eqs[orient]},  PS = PM';
        ro = [
          Readout('PS (to the focus)', fmt(ps0, 3), '', IX.positive),
          Readout('PM (to the directrix)', fmt(ps0, 3), '', IX.accent),
          Readout('Focus', '(${fmtT(f.dx)}, ${fmtT(f.dy)})', '', IX.ink),
          Readout('Directrix', dirs[orient]!, '', IX.inkSoft),
          Readout('Latus rectum 4a', fmt(4 * a, 2), '', IX.green),
          if (tangent) Readout('Slope of tangent at P', m == null ? 'not defined' : fmt(m, 3), '', IX.positive),
        ];
        ctl.addAll([
          segs<String>('Opens', const {'right': 'y² = 4ax', 'left': 'y² = −4ax', 'up': 'x² = 4ay', 'down': 'x² = −4ay'}, orient, (v) => setState(() => orient = v)),
          sl('a', a, 0.5, 2.5, (x) => a = x, step: 0.25, d: 2),
          sl('Move P', t, -90, 90, (x) => t = x, step: 2, d: 0),
        ]);
      case 'hyperbola':
        final d1 = (P - Offset(-c, 0)).distance, d2 = (P - Offset(c, 0)).distance;
        title = 'Hyperbola: difference of focal distances';
        formula = 'x²/a² − y²/b² = 1,  |PF₁ − PF₂| = 2a';
        ro = [
          Readout('b = a√(e² − 1)', fmt(b, 3), '', IX.ink),
          Readout('c = ae', fmt(c, 3), '', IX.accent),
          Readout('|PF₁ − PF₂|', fmt((d1 - d2).abs(), 3), '= 2a', IX.positive),
          Readout('Latus rectum 2b²/a', fmt(2 * b * b / a, 3), '', IX.green),
          Readout('Asymptotes', 'y = ±${fmtT(b / a, 3)}x', '', IX.inkSoft),
          if (tangent) Readout('Slope of tangent at P', m == null ? 'not defined' : fmt(m, 3), '', IX.positive),
        ];
        ctl.addAll([sl('a', a, 1, 4, (x) => a = x, step: 0.25, d: 2), sl('Eccentricity e', e, 1.05, 2.5, (x) => e = x, step: 0.05, d: 2), sl('Move P', t, -90, 90, (x) => t = x, step: 2, d: 0)]);
      default:
        final d1 = (P - Offset(-c, 0)).distance, d2 = (P - Offset(c, 0)).distance;
        title = 'Ellipse: sum of focal distances';
        formula = 'x²/a² + y²/b² = 1,  PF₁ + PF₂ = 2a';
        ro = [
          Readout('b = a√(1 − e²)', fmt(b, 3), '', IX.ink),
          Readout('c = ae', fmt(c, 3), '', IX.accent),
          Readout('PF₁ + PF₂', fmt(d1 + d2, 3), '= 2a', IX.positive),
          Readout('Latus rectum 2b²/a', fmt(2 * b * b / a, 3), '', IX.green),
          Readout('Area πab', fmt(math.pi * a * b, 2), 'sq. units', IX.inkSoft),
          if (tangent) Readout('Slope of tangent at P', m == null ? 'not defined' : fmt(m, 3), '', IX.positive),
        ];
        ctl.addAll([sl('a', a, 2, 6, (x) => a = x, step: 0.25, d: 2), sl('Eccentricity e', e, 0, 0.95, (x) => e = x, step: 0.05, d: 2), sl('Move P', t, 0, 360, (x) => t = x, step: 5, d: 0, unit: '°')]);
    }
    if (conic != 'cone' && conic != 'circle') ctl.add(IxToggle(label: 'Tangent at P', value: tangent, onChanged: (v) => setState(() => tangent = v)));
    return InstrumentFrame(
      id: 'maths-conics',
      subtitle: tx(widget.preset['subtitle']) ?? '$kMaths · Conic sections',
      title: tx(widget.preset['title']) ?? title,
      formula: formula,
      state: {'conic': conic, 'a': a, 'e': e, 'h': h, 'k': k, 'r': r, 'orient': orient, 't': t, 'alpha': alpha, 'beta': beta},
      readouts: ro,
      controls: ctl,
      presets: [for (final (i, en) in _presets.entries.indexed) Preset(en.key, () => setState(() { _apply(en.value); active = i; }))],
      activePreset: active,
      stage: LayoutBuilder(builder: (context, box) {
        final size = box.biggest;
        final pln = _plane(size);
        return GestureDetector(
          onPanStart: (e) => _drag = test != null && (pln.p(test!.dx, test!.dy) - e.localPosition).distance < 50,
          onPanUpdate: (e) {
            if (!_drag) return;
            final w = pln.w(e.localPosition);
            setState(() => test = Offset((w.dx * 2).round() / 2, (w.dy * 2).round() / 2));
          },
          onPanEnd: (_) => _drag = false,
          child: CustomPaint(size: size, painter: _ConicPainter(this, pln)),
        );
      }),
    );
  }

  Plane _plane(Size size) {
    final lim = switch (conic) { 'circle' => 7.0, 'parabola' => 4.5 + a * 2, 'hyperbola' => math.max(8.0, c * 1.6), _ => a * 1.35 + 0.5 };
    return Plane(Rect.fromLTRB(70, 40, size.width - 40, size.height - 50), -lim, lim, -lim * 0.62, lim * 0.62, equal: true);
  }
}

class _ConicPainter extends CustomPainter {
  _ConicPainter(this.s, this.pl);
  final _ConicsState s;
  final Plane pl;

  Path param(Offset Function(double) f, double t0, double t1, {int n = 400}) {
    final path = Path();
    for (var i = 0; i <= n; i++) {
      final p = f(t0 + (t1 - t0) * i / n);
      final q = pl.p(p.dx, p.dy);
      i == 0 ? path.moveTo(q.dx, q.dy) : path.lineTo(q.dx, q.dy);
    }
    return path;
  }

  void focusDot(Canvas c, Offset f, String name) {
    MPaint.dot(c, pl.p(f.dx, f.dy), IX.positive, r: 9);
    IxPaint.label(c, name, pl.p(f.dx, f.dy) + const Offset(0, 24), size: 20, color: IX.positive, w: FontWeight.w700);
  }

  void vline(Canvas c, double x, Color col, String label) {
    if (x < pl.xa || x > pl.xb) return;
    IxPaint.dashed(c, pl.p(x, pl.ya), pl.p(x, pl.yb), MPaint.stroke(col, 2.5), dash: 10, gap: 7);
    IxPaint.label(c, label, pl.p(x, pl.yb) + const Offset(8, 16), size: 18, color: col, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
  }

  void hline(Canvas c, double y, Color col, String label) {
    if (y < math.min(pl.ya, pl.yb) || y > math.max(pl.ya, pl.yb)) return;
    IxPaint.dashed(c, pl.p(pl.xa, y), pl.p(pl.xb, y), MPaint.stroke(col, 2.5), dash: 10, gap: 7);
    IxPaint.label(c, label, pl.p(pl.xb, y) + const Offset(-8, -14), size: 18, color: col, w: FontWeight.w600, align: Alignment.centerRight, halo: true);
  }

  void tangentAt(Canvas c, Offset p, double? m) {
    if (!s.tangent) return;
    c.save();
    c.clipRect(pl.rect);
    final span = (pl.xb - pl.xa) * 0.25;
    if (m == null) {
      c.drawLine(pl.p(p.dx, p.dy - span), pl.p(p.dx, p.dy + span), MPaint.stroke(IX.positive, 3));
    } else {
      final dx = span / math.sqrt(1 + m * m);
      c.drawLine(pl.p(p.dx - dx, p.dy - m * dx), pl.p(p.dx + dx, p.dy + m * dx), MPaint.stroke(IX.positive, 3));
    }
    c.restore();
  }

  @override
  void paint(Canvas c, Size size) {
    if (s.conic == 'cone') {
      _cone(c, size);
      return;
    }
    pl.paintGrid(c);
    final curve = MPaint.stroke(IX.accent, 4.5);
    final (P, m) = s.pointP;
    switch (s.conic) {
      case 'circle':
        final o = pl.p(s.h, s.k);
        c.drawCircle(o, s.r * pl.ux, curve);
        MPaint.dot(c, o, IX.ink, r: 8);
        IxPaint.label(c, 'C(${fmtT(s.h)}, ${fmtT(s.k)})', o + const Offset(14, 20), size: 19, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
        final rp = s.tangent ? P : Offset(s.h + s.r * math.cos(0.7), s.k + s.r * math.sin(0.7));
        c.drawLine(o, pl.p(rp.dx, rp.dy), MPaint.stroke(IX.amber, 3));
        IxPaint.label(c, 'r = ${fmtT(s.r)}', pl.p((s.h + rp.dx) / 2, (s.k + rp.dy) / 2) + const Offset(-10, -18), size: 19, color: IX.amber, w: FontWeight.w600, align: Alignment.centerRight, halo: true);
        if (s.tangent) {
          tangentAt(c, P, m);
          MPaint.dot(c, pl.p(P.dx, P.dy), IX.positive, r: 9);
        }
        if (s.test != null) {
          final t = s.test!;
          final sv = math.pow(t.dx - s.h, 2) + math.pow(t.dy - s.k, 2) - s.r * s.r;
          IxPaint.dashed(c, o, pl.p(t.dx, t.dy), MPaint.stroke(IX.steel, 2), dash: 7, gap: 6);
          IxPaint.handle(c, pl.p(t.dx, t.dy), sv.abs() < 1e-9 ? IX.amber : sv < 0 ? IX.green : MX.red, r: 14, active: s._drag);
          IxPaint.label(c, 'P(${fmtT(t.dx)}, ${fmtT(t.dy)})', pl.p(t.dx, t.dy) + const Offset(20, -20), size: 19, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
        }
      case 'parabola':
        final a = s.a;
        final ymax = (pl.yb - pl.ya) / 2 * 1.1;
        final f = s.focus;
        Offset map(Offset p0) => switch (s.orient) { 'left' => Offset(-p0.dx, p0.dy), 'up' => Offset(p0.dy, p0.dx), 'down' => Offset(p0.dy, -p0.dx), _ => p0 };
        final lim = s.orient == 'up' || s.orient == 'down' ? (pl.xb - pl.xa) / 2 : ymax;
        c.save();
        c.clipRect(pl.rect);
        c.drawPath(param((y) => map(Offset(y * y / (4 * a), y)), -lim, lim), curve);
        c.restore();
        // Directrix, focus, latus rectum.
        if (s.orient == 'right' || s.orient == 'left') {
          vline(c, s.orient == 'right' ? -a : a, MX.red, 'directrix');
          c.drawLine(pl.p(f.dx, -2 * a), pl.p(f.dx, 2 * a), MPaint.stroke(IX.green, 3));
        } else {
          hline(c, s.orient == 'up' ? -a : a, MX.red, 'directrix');
          c.drawLine(pl.p(-2 * a, f.dy), pl.p(2 * a, f.dy), MPaint.stroke(IX.green, 3));
        }
        focusDot(c, f, 'S');
        final M = switch (s.orient) { 'left' => Offset(a, P.dy), 'up' => Offset(P.dx, -a), 'down' => Offset(P.dx, a), _ => Offset(-a, P.dy) };
        c.drawLine(pl.p(P.dx, P.dy), pl.p(f.dx, f.dy), MPaint.stroke(IX.positive, 3));
        c.drawLine(pl.p(P.dx, P.dy), pl.p(M.dx, M.dy), MPaint.stroke(IX.accent, 3));
        MPaint.dot(c, pl.p(M.dx, M.dy), MX.red, r: 7);
        IxPaint.label(c, 'M', pl.p(M.dx, M.dy) + const Offset(-16, -16), size: 20, color: MX.red, w: FontWeight.w700);
        tangentAt(c, P, m);
        IxPaint.handle(c, pl.p(P.dx, P.dy), IX.amber, r: 13);
        IxPaint.label(c, 'P', pl.p(P.dx, P.dy) + const Offset(18, -18), size: 22, color: IX.ink, w: FontWeight.w700);
      case 'hyperbola':
        final a = s.a, b = s.b, cc = s.c;
        final umax = math.log((pl.xb / a) + math.sqrt(math.pow(pl.xb / a, 2) - 1)) * 1.05;
        c.save();
        c.clipRect(pl.rect);
        for (final sg in [1.0, -1.0]) {
          c.drawPath(param((u) => Offset(sg * a * (math.exp(u) + math.exp(-u)) / 2, b * (math.exp(u) - math.exp(-u)) / 2), -umax, umax), curve);
        }
        for (final sg in [1.0, -1.0]) {
          IxPaint.dashed(c, pl.p(pl.xa, sg * b / a * pl.xa), pl.p(pl.xb, sg * b / a * pl.xb), MPaint.stroke(IX.steel, 2), dash: 10, gap: 8);
        }
        c.restore();
        vline(c, a / s.e, MX.red, 'x = a/e');
        vline(c, -a / s.e, MX.red, 'x = −a/e');
        focusDot(c, Offset(-cc, 0), 'F₁');
        focusDot(c, Offset(cc, 0), 'F₂');
        c.drawLine(pl.p(P.dx, P.dy), pl.p(-cc, 0), MPaint.stroke(IX.positive, 3));
        c.drawLine(pl.p(P.dx, P.dy), pl.p(cc, 0), MPaint.stroke(IX.green, 3));
        for (final v in [a, -a]) {
          MPaint.dot(c, pl.p(v, 0), IX.ink, r: 6);
        }
        tangentAt(c, P, m);
        IxPaint.handle(c, pl.p(P.dx, P.dy), IX.amber, r: 13);
        IxPaint.label(c, 'P', pl.p(P.dx, P.dy) + const Offset(18, -18), size: 22, color: IX.ink, w: FontWeight.w700);
      default:
        final a = s.a, b = s.b, cc = s.c;
        c.drawOval(Rect.fromCenter(center: pl.p(0, 0), width: 2 * a * pl.ux, height: 2 * b * pl.uy), curve);
        if (s.e > 0.05) {
          vline(c, a / s.e, MX.red, 'x = a/e');
          vline(c, -a / s.e, MX.red, 'x = −a/e');
        }
        c.drawLine(pl.p(cc, -b * b / a), pl.p(cc, b * b / a), MPaint.stroke(IX.green, 3));
        focusDot(c, Offset(-cc, 0), 'F₁');
        focusDot(c, Offset(cc, 0), 'F₂');
        c.drawLine(pl.p(P.dx, P.dy), pl.p(-cc, 0), MPaint.stroke(IX.positive, 3));
        c.drawLine(pl.p(P.dx, P.dy), pl.p(cc, 0), MPaint.stroke(IX.green, 3));
        IxPaint.label(c, 'a', pl.p(a / 2, 0) + const Offset(0, -16), size: 18, color: IX.inkSoft, w: FontWeight.w600);
        IxPaint.label(c, 'b', pl.p(0, b / 2) + const Offset(12, 0), size: 18, color: IX.inkSoft, w: FontWeight.w600, align: Alignment.centerLeft);
        tangentAt(c, P, m);
        IxPaint.handle(c, pl.p(P.dx, P.dy), IX.amber, r: 13);
        IxPaint.label(c, 'P', pl.p(P.dx, P.dy) + Offset(P.dx >= 0 ? 18 : -18, P.dy >= 0 ? -18 : 18), size: 22, color: IX.ink, w: FontWeight.w700);
    }
  }

  void _cone(Canvas c, Size size) {
    // Side view on the left, the section shape on the right.
    final o = Offset(size.width * 0.3, size.height * 0.5);
    final hgt = size.height * 0.42;
    final al = s.alpha * math.pi / 180, be = s.beta * math.pi / 180;
    final w = hgt * math.tan(al);
    final gen = MPaint.stroke(IX.accent, 3.5);
    c.drawPath(Path()..moveTo(o.dx - w, o.dy - hgt)..lineTo(o.dx + w, o.dy + hgt)..moveTo(o.dx + w, o.dy - hgt)..lineTo(o.dx - w, o.dy + hgt), gen);
    for (final sg in [-1.0, 1.0]) {
      c.drawOval(Rect.fromCenter(center: o + Offset(0, sg * hgt), width: 2 * w, height: w * 0.35), MPaint.stroke(IX.accent.withValues(alpha: 0.6), 2));
    }
    IxPaint.dashed(c, o - Offset(0, hgt + 20), o + Offset(0, hgt + 20), MPaint.stroke(IX.steel, 1.6));
    IxPaint.label(c, 'axis', o - Offset(-8, hgt + 24), size: 16, color: IX.inkSoft, align: Alignment.centerLeft);
    MPaint.dot(c, o, IX.ink, r: 6);
    IxPaint.label(c, 'V', o + const Offset(-18, 0), size: 20, color: IX.ink, w: FontWeight.w700);
    MPaint.arc(c, o, 70, math.pi / 2, -al, IX.accent, w: 2.5);
    IxPaint.label(c, 'α', o + Offset(math.cos(math.pi / 2 - al / 2), -math.sin(math.pi / 2 - al / 2)) * 92, size: 22, color: IX.accent, w: FontWeight.w700);
    // The plane: makes angle β with the axis, passes at distance off from V (along the axis).
    final dir = Offset(math.sin(be), -math.cos(be));
    final p0 = o + Offset(0, -s.off * hgt / 4);
    c.save();
    c.clipRect(Rect.fromLTRB(20, 20, size.width * 0.58, size.height - 20));
    c.drawLine(p0 - dir * size.height, p0 + dir * size.height, MPaint.stroke(IX.amber, 4));
    c.restore();
    IxPaint.label(c, 'plane', p0 + dir * hgt * 0.9 + const Offset(12, 0), size: 18, color: IX.amber, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
    MPaint.arc(c, p0, 54, math.pi / 2, -(math.pi / 2 - (math.pi / 2 - be)), IX.amber, w: 2.5);
    IxPaint.label(c, 'β', p0 + Offset(math.cos(math.pi / 2 - be / 2), -math.sin(math.pi / 2 - be / 2)) * 76, size: 22, color: IX.amber, w: FontWeight.w700);
    // The shape of the section.
    final box = Rect.fromLTRB(size.width * 0.62, 70, size.width - 40, size.height - 70);
    c.drawRRect(RRect.fromRectAndRadius(box, const Radius.circular(18)), Paint()..color = IX.page);
    final ctr = box.center;
    final sc = box.shortestSide * 0.3;
    final name = s.coneName;
    final stroke = MPaint.stroke(IX.positive, 4.5);
    final ecc = math.cos(be) / math.cos(al);
    if (name == 'circle') {
      c.drawCircle(ctr, sc, stroke);
    } else if (name == 'ellipse') {
      c.drawOval(Rect.fromCenter(center: ctr, width: 2 * sc, height: 2 * sc * math.sqrt(math.max(0.05, 1 - ecc * ecc))), stroke);
    } else if (name == 'parabola') {
      final path = Path();
      for (var i = -40; i <= 40; i++) {
        final y = i / 40 * sc * 1.2;
        final x = y * y / (sc * 0.9) - sc * 0.8;
        i == -40 ? path.moveTo(ctr.dx + x, ctr.dy + y) : path.lineTo(ctr.dx + x, ctr.dy + y);
      }
      c.drawPath(path, stroke);
    } else if (name == 'hyperbola') {
      final bb = sc * 0.4 * math.sqrt(math.max(0.05, ecc * ecc - 1));
      for (final sg in [-1.0, 1.0]) {
        final path = Path();
        for (var i = -40; i <= 40; i++) {
          final u = i / 40 * 1.5;
          final x = sg * sc * 0.4 * (math.exp(u) + math.exp(-u)) / 2, y = bb * (math.exp(u) - math.exp(-u)) / 2;
          i == -40 ? path.moveTo(ctr.dx + x, ctr.dy - y) : path.lineTo(ctr.dx + x, ctr.dy - y);
        }
        c.save();
        c.clipRect(box.deflate(10));
        c.drawPath(path, stroke);
        c.restore();
      }
    } else if (name.startsWith('a point')) {
      MPaint.dot(c, ctr, IX.positive, r: 10);
    } else if (name.startsWith('a line')) {
      c.drawLine(ctr - Offset(sc, 0), ctr + Offset(sc, 0), stroke);
    } else {
      c.drawLine(ctr - Offset(sc, sc * 0.7), ctr + Offset(sc, sc * 0.7), stroke);
      c.drawLine(ctr - Offset(sc, -sc * 0.7), ctr + Offset(sc, -sc * 0.7), stroke);
    }
    IxPaint.label(c, name[0].toUpperCase() + name.substring(1), Offset(ctr.dx, box.bottom - 40), size: 26, color: IX.ink, w: FontWeight.w700);
    IxPaint.label(c, 'β = 90°: circle   β > α: ellipse   β = α: parabola   β < α: hyperbola', Offset(size.width * 0.3, size.height - 26), size: 17, color: IX.inkSoft);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
