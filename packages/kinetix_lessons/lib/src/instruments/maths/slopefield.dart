import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'common.dart';
import 'plotter.dart' show SpecModel;

/// Differential equations: the slope field of dy/dx = F(x, y), the solution curve through a
/// point you drag (integrated step by step), and the family of solutions around it.
///
/// Preset: {"dy": "-k*(y - 20)", "fName": "dT/dt = −k(T − 20)", "sliders": [...], "x": [0, 30],
/// "y": [0, 100], "x0": 0, "y0": 90, "family": true, "exact": "20 + (y0 - 20)*exp(-k*x)",
/// "xLabel": "t", "yLabel": "T", "readouts": [...], "at": 10}.
class SlopeFieldInstrument extends StatefulWidget {
  const SlopeFieldInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<SlopeFieldInstrument> createState() => _SFState();
}

class _SFState extends State<SlopeFieldInstrument> {
  late SpecModel model;
  double x0 = 0, y0 = 1;
  int? active = 0;
  bool _drag = false;

  Map<String, dynamic> get p => widget.preset.isEmpty ? _demo : widget.preset;
  static const _demo = {
    'dy': 'k*y',
    'fName': 'dy/dx = ky',
    'sliders': [
      {'name': 'k', 'label': 'k', 'min': -1, 'max': 1, 'step': 0.1, 'value': 0.5},
    ],
    'x': [-4, 4],
    'y': [-4, 4],
    'x0': 0,
    'y0': 1,
    'family': true,
    'exact': 'y0*exp(k*(x - x0))',
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    model = SpecModel(p);
    final e = model.env();
    x0 = Expr.safe(p['x0'] ?? 0)(e);
    y0 = Expr.safe(p['y0'] ?? 1)(e);
  }

  Env get env => model.env();
  double F(double x, double y) => Expr.safe(p['dy'] ?? 'y')({...env, 'x': x, 'y': y});

  /// RK4 from (x0, y0) to xEnd.
  List<Offset> solve(double xs, double ys, double xEnd, {int steps = 400}) {
    final out = <Offset>[Offset(xs, ys)];
    final h = (xEnd - xs) / steps;
    var x = xs, y = ys;
    final xr = range, yr = yrange;
    final span = (yr[1] - yr[0]) * 6;
    for (var i = 0; i < steps; i++) {
      final k1 = F(x, y), k2 = F(x + h / 2, y + h * k1 / 2), k3 = F(x + h / 2, y + h * k2 / 2), k4 = F(x + h, y + h * k3);
      y += h * (k1 + 2 * k2 + 2 * k3 + k4) / 6;
      x += h;
      if (!y.isFinite || y.abs() > span + yr[1].abs() || x < xr[0] - 1 || x > xr[1] + 1) break;
      out.add(Offset(x, y));
    }
    return out;
  }

  List<double> get range => p['x'] is List ? [for (final v in p['x'] as List) Expr.safe(v)(env)] : [-4.0, 4.0];
  List<double> get yrange => p['y'] is List ? [for (final v in p['y'] as List) Expr.safe(v)(env)] : [-4.0, 4.0];

  double valueAt(double x) {
    final pts = solve(x0, y0, x, steps: 600);
    return (pts.last.dx - x).abs() < 1e-6 ? pts.last.dy : double.nan;
  }

  @override
  Widget build(BuildContext context) {
    final e = {...env, 'x0': x0, 'y0': y0};
    final at = p['at'] != null ? Expr.safe(p['at'])(e) : null;
    final exact = p['exact'] != null ? Expr.safe(p['exact']) : null;
    return InstrumentFrame(
      id: 'maths-slopefield',
      subtitle: tx(p['subtitle']) ?? '$kMaths · Differential equations',
      title: tx(p['title']) ?? 'Slope field and solution curves',
      formula: tx(p['fName']) ?? 'dy/dx = F(x, y)',
      state: {...model.values, 'x0': x0, 'y0': y0},
      readouts: [
        Readout('Start point', '(${fmt(x0, 2)}, ${fmt(y0, 2)})', '', IX.ink),
        Readout('Slope there', fmt(F(x0, y0), 3), '', IX.positive),
        if (at != null) Readout('${tx(p['yLabel']) ?? 'y'} at ${tx(p['xLabel']) ?? 'x'} = ${fmtT(at, 2)}', fmt(valueAt(at), 3), '', IX.accent),
        if (at != null && exact != null) Readout('Exact solution there', fmt(exact({...e, 'x': at}), 3), '', IX.green),
        ...model.readoutCards({...e, 'x0': x0, 'y0': y0}, max: 3),
      ],
      controls: [
        ...model.controls(setState),
        IxSlider(label: 'Start value ${tx(p['yLabel']) ?? 'y'}₀', value: y0.clamp(yrange[0], yrange[1]), min: yrange[0], max: yrange[1], divisions: 80, format: (v) => fmt(v, 2), onChanged: (v) => setState(() { y0 = v; active = null; })),
        Text('Drag the start point on the field.', style: IX.text(17, c: IX.inkSoft)),
      ],
      presets: [Preset('Start values', () => setState(() { _load(); active = 0; }))],
      activePreset: active,
      stage: LayoutBuilder(builder: (context, box) {
        final size = box.biggest;
        final pl = Plane(Rect.fromLTRB(90, 46, size.width - 50, size.height - 60), range[0], range[1], yrange[0], yrange[1], equal: p['equal'] == true);
        return GestureDetector(
          onPanStart: (d) => _drag = (pl.p(x0, y0) - d.localPosition).distance < 60,
          onPanUpdate: (d) {
            if (!_drag) return;
            final w = pl.w(d.localPosition);
            setState(() {
              x0 = w.dx.clamp(pl.xa, pl.xb);
              y0 = w.dy.clamp(pl.ya, pl.yb);
              active = null;
            });
          },
          onPanEnd: (_) => _drag = false,
          child: CustomPaint(size: size, painter: _SFPainter(this, pl)),
        );
      }),
    );
  }
}

class _SFPainter extends CustomPainter {
  _SFPainter(this.s, this.pl);
  final _SFState s;
  final Plane pl;

  Path pathOf(List<Offset> pts) {
    final path = Path();
    for (final (i, q) in pts.indexed) {
      final o = pl.p(q.dx, q.dy);
      i == 0 ? path.moveTo(o.dx, o.dy) : path.lineTo(o.dx, o.dy);
    }
    return path;
  }

  @override
  void paint(Canvas c, Size size) {
    pl.paintGrid(c, xLabel: tx(s.p['xLabel']) ?? 'x', yLabel: tx(s.p['yLabel']) ?? 'y');
    // Field.
    const nx = 26, ny = 16;
    final seg = math.min(pl.rect.width / nx, pl.rect.height / ny) * 0.36;
    for (var i = 0; i < nx; i++) {
      for (var j = 0; j < ny; j++) {
        final px = pl.rect.left + pl.rect.width * (i + 0.5) / nx, py = pl.rect.top + pl.rect.height * (j + 0.5) / ny;
        final x = pl.wx(px), y = pl.wy(py);
        final m = s.F(x, y);
        if (!m.isFinite) continue;
        // Direction in screen space respects the axis scales.
        final d = Offset(pl.ux, -m * pl.uy);
        final u = d / d.distance * seg;
        c.drawLine(Offset(px, py) - u, Offset(px, py) + u, MPaint.stroke(IX.steel.withValues(alpha: 0.75), 2));
      }
    }
    c.save();
    c.clipRect(pl.rect);
    if (s.p['family'] != false) {
      final yr = s.yrange;
      for (var k = 1; k <= 9; k++) {
        final ys = yr[0] + (yr[1] - yr[0]) * k / 10;
        if ((ys - s.y0).abs() < (yr[1] - yr[0]) / 30) continue;
        for (final end in [pl.xa, pl.xb]) {
          c.drawPath(pathOf(s.solve(s.x0, ys, end)), MPaint.stroke(IX.accent.withValues(alpha: 0.28), 2));
        }
      }
    }
    for (final end in [pl.xa, pl.xb]) {
      c.drawPath(pathOf(s.solve(s.x0, s.y0, end)), MPaint.stroke(IX.positive, 4.5));
    }
    c.restore();
    IxPaint.handle(c, pl.p(s.x0, s.y0), IX.positive, r: 14, active: s._drag);
    IxPaint.label(c, tx(s.p['fName']) ?? 'dy/dx = F(x, y)', Offset(pl.rect.left + 16, pl.rect.top + 10), size: 22, color: IX.ink, w: FontWeight.w700, align: Alignment.topLeft, halo: true);
    IxPaint.label(c, 'Each dash has the slope the equation gives at that point', Offset(pl.rect.left + 16, pl.rect.top + 46), size: 17, color: IX.inkSoft, align: Alignment.topLeft, halo: true);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
