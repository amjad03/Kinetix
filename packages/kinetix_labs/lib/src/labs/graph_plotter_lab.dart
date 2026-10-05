import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../lab_scaffold.dart';
import '../models/plotter.dart';

String _n(double v, [int d = 2]) {
  var s = v.toStringAsFixed(d);
  if (double.parse(s) == 0) s = (0).toStringAsFixed(d);
  return s.replaceFirst('-', '−');
}

/// A coefficient with its slider range.
class _Coef {
  const _Coef(this.name, this.min, this.max, this.step);
  final String name;
  final double min, max, step;
}

/// Plots y = f(x) with coefficient sliders; marks roots, vertex and y-intercept; drag to pan,
/// pinch or scroll to zoom.
class GraphPlotterLab extends StatefulWidget {
  const GraphPlotterLab({super.key, this.preset});

  /// 'linear', 'quadratic', 'sine', 'cosine' or 'custom'.
  final String? preset;

  @override
  State<GraphPlotterLab> createState() => _GraphPlotterLabState();
}

class _GraphPlotterLabState extends State<GraphPlotterLab> {
  late PlotFunction _fn;
  final _custom = TextEditingController(text: 'x^3 - 4x');
  String? _error;

  // View: centre and zoom; spans come from the mode.
  double _cx = 0, _cy = 0, _zoom = 1, _scaleStart = 1;

  @override
  void initState() {
    super.initState();
    _reset();
  }

  @override
  void dispose() {
    _custom.dispose();
    super.dispose();
  }

  void _reset() {
    final mode = PlotMode.values.firstWhere((m) => m.name == widget.preset, orElse: () => PlotMode.quadratic);
    _setMode(mode);
    _custom.text = 'x^3 - 4x';
    _error = null;
  }

  void _setMode(PlotMode mode) {
    _fn = switch (mode) {
      PlotMode.linear => const PlotFunction(mode: PlotMode.linear, a: 2, b: -3),
      PlotMode.quadratic => const PlotFunction(mode: PlotMode.quadratic, a: 1, b: -2, c: -3),
      PlotMode.sine => const PlotFunction(mode: PlotMode.sine, a: 2, b: 1, c: 0, d: 0),
      PlotMode.cosine => const PlotFunction(mode: PlotMode.cosine, a: 2, b: 1, c: 0, d: 0),
      PlotMode.custom => PlotFunction(mode: PlotMode.custom, custom: _tryParse(_custom.text)),
    };
    _resetView();
  }

  void _resetView() {
    _cx = 0;
    _cy = 0;
    _zoom = 1;
  }

  Expr? _tryParse(String s) {
    try {
      final e = ExpressionParser.parse(s);
      _error = null;
      return e;
    } on FormatException catch (e) {
      _error = e.message;
      return null;
    }
  }

  List<_Coef> get _coefs => switch (_fn.mode) {
        PlotMode.linear => const [_Coef('m', -5, 5, 0.25), _Coef('c', -10, 10, 0.5)],
        PlotMode.quadratic => const [_Coef('a', -3, 3, 0.25), _Coef('b', -10, 10, 0.5), _Coef('c', -10, 10, 0.5)],
        PlotMode.sine || PlotMode.cosine => const [_Coef('A', 0.5, 5, 0.5), _Coef('B', 0.5, 4, 0.25), _Coef('C', -180, 180, 15), _Coef('D', -3, 3, 0.5)],
        PlotMode.custom => const [],
      };

  double _coef(int i) => switch (i) {
        0 => _fn.a,
        1 => _fn.b,
        2 => _fn.c,
        _ => _fn.d,
      };

  void _setCoef(int i, double v) => setState(() => _fn = switch (i) {
        0 => _fn.copyWith(a: v),
        1 => _fn.copyWith(b: v),
        2 => _fn.copyWith(c: v),
        _ => _fn.copyWith(d: v),
      });

  String get _equation {
    final f = _fn;
    String term(double v, String s, {bool first = false}) {
      if (v == 0) return '';
      final sign = v < 0 ? (first ? '−' : ' − ') : (first ? '' : ' + ');
      final a = v.abs();
      final num = (a == 1 && s.isNotEmpty) ? '' : _trim(a);
      return '$sign$num$s';
    }

    return switch (f.mode) {
      PlotMode.linear => 'y = ${[term(f.a, 'x', first: true), term(f.b, '', first: f.a == 0)].join()}'.replaceAll(RegExp(r'= $'), '= 0'),
      PlotMode.quadratic => 'y = ${[term(f.a, 'x²', first: true), term(f.b, 'x', first: f.a == 0), term(f.c, '', first: f.a == 0 && f.b == 0)].join()}'.replaceAll(RegExp(r'= $'), '= 0'),
      PlotMode.sine || PlotMode.cosine =>
        'y = ${_trim(f.a)} ${f.mode == PlotMode.sine ? 'sin' : 'cos'}(${f.b == 1 ? '' : _trim(f.b)}x${f.c == 0 ? '' : (f.c > 0 ? ' + ' : ' − ')}${f.c == 0 ? '' : '${_trim(f.c.abs())}°'})${term(f.d, '')}',
      PlotMode.custom => 'y = ${_custom.text}',
    };
  }

  static String _trim(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : _n(v).replaceAll(RegExp(r'0$'), '');

  @override
  Widget build(BuildContext context) {
    final pal = LabPalette(context);
    final f = _fn;
    final spanX = (f.mode.isTrig ? 720.0 : 20.0) / _zoom;
    final lo = _cx - spanX / 2, hi = _cx + spanX / 2;
    final roots = f.mode == PlotMode.custom && f.custom == null ? <double>[] : f.roots(lo, hi);
    final vertex = f.vertex;
    final unit = f.mode.isTrig ? '°' : '';
    return LabScaffold(
      title: 'Graph plotter',
      subtitle: 'Maths · Linear, quadratic and trigonometric graphs',
      formula: _equation,
      aim: 'To see how the coefficients change the shape and position of a graph, and to read its roots (zeros) and '
          'turning point.',
      observe: const [
        'Linear: m changes the slope, c moves the line up or down (the y-intercept).',
        'Quadratic: the sign of a decides whether the parabola opens up or down; D = b² − 4ac decides the number of real roots.',
        'The vertex of y = ax² + bx + c is at x = −b/2a.',
        'Sine and cosine: A stretches the wave vertically, B changes how often it repeats (period 360°/B).',
      ],
      onReset: () => setState(_reset),
      simulation: LayoutBuilder(builder: (context, box) {
        final size = box.biggest;
        double ux() => spanX / size.width; // units per pixel
        double uy() => f.mode.isTrig ? 8 / _zoom / size.height : ux();
        return Stack(
          children: [
            Positioned.fill(
              child: Listener(
                onPointerSignal: (e) {
                  if (e is PointerScrollEvent) setState(() => _zoom = (_zoom * math.pow(1.0015, -e.scrollDelta.dy)).clamp(0.05, 50));
                },
                child: GestureDetector(
                  onScaleStart: (_) => _scaleStart = _zoom,
                  onScaleUpdate: (d) => setState(() {
                    _cx -= d.focalPointDelta.dx * ux();
                    _cy += d.focalPointDelta.dy * uy();
                    if (d.pointerCount >= 2) _zoom = (_scaleStart * d.scale).clamp(0.05, 50);
                  }),
                  onDoubleTap: () => setState(_resetView),
                  child: CustomPaint(
                    key: const ValueKey('plot-canvas'),
                    painter: _PlotPainter(f, _cx, _cy, ux(), uy(), roots, vertex, pal, unit),
                    size: Size.infinite,
                  ),
                ),
              ),
            ),
            Positioned(
              right: Kx.s8,
              top: Kx.s8,
              child: Material(
                color: context.colors.surfaceContainerHigh,
                borderRadius: Kx.radiusXl,
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  IconButton(tooltip: 'Zoom in', onPressed: () => setState(() => _zoom = math.min(50, _zoom * 1.5)), icon: const Icon(Icons.zoom_in)),
                  IconButton(tooltip: 'Zoom out', onPressed: () => setState(() => _zoom = math.max(0.05, _zoom / 1.5)), icon: const Icon(Icons.zoom_out)),
                  IconButton(tooltip: 'Reset view', onPressed: () => setState(_resetView), icon: const Icon(Icons.center_focus_strong_outlined)),
                ]),
              ),
            ),
          ],
        );
      }),
      readouts: [
        Readout(
          roots.length == 1 ? 'Root (in view)' : 'Roots (in view)',
          roots.isEmpty ? 'None' : roots.take(4).map((r) => 'x = ${_n(r)}$unit').join(',  ') + (roots.length > 4 ? ' …' : ''),
          highlight: true,
          key: const ValueKey('readout-roots'),
        ),
        if (vertex != null) Readout('Vertex (turning point)', '(${_n(vertex.$1)}, ${_n(vertex.$2)})', key: const ValueKey('readout-vertex')),
        if (f.discriminant != null)
          Readout('Discriminant D = b² − 4ac', _n(f.discriminant!), unit: f.discriminant! > 1e-12 ? '2 real roots' : (f.discriminant!.abs() <= 1e-12 ? '1 repeated root' : 'no real roots')),
        Readout('y-intercept', f.eval(0).isFinite ? '(0, ${_n(f.eval(0))})' : '–'),
        if (f.mode.isTrig) Readout('Period 360°/B', '${_n(360 / f.b, 1)}°'),
        if (f.mode == PlotMode.linear) Readout('Slope m', _n(f.a)),
      ],
      controls: [
        Wrap(
          spacing: Kx.s8,
          runSpacing: Kx.s8,
          children: [
            for (final m in PlotMode.values)
              ChoiceChip(label: Text(m.title), selected: f.mode == m, onSelected: (_) => setState(() => _setMode(m))),
          ],
        ),
        const SizedBox(height: Kx.s8),
        Text(f.mode.form, style: context.text.titleMedium?.copyWith(color: context.colors.onSurfaceVariant)),
        const SizedBox(height: Kx.s8),
        for (final (i, c) in _coefs.indexed)
          LabSliderRow(
            key: ValueKey('coef-${c.name}'),
            label: c.name,
            value: _coef(i),
            min: c.min,
            max: c.max,
            divisions: ((c.max - c.min) / c.step).round(),
            format: (v) => c.name == 'C' ? '${v.toStringAsFixed(0)}°' : _n(v),
            onChanged: (v) => _setCoef(i, v),
          ),
        if (f.mode == PlotMode.custom) ...[
          TextField(
            key: const ValueKey('custom-expr'),
            controller: _custom,
            decoration: InputDecoration(labelText: 'y =', errorText: _error, helperText: 'e.g. x^2 - 4, 2sin(x), (x-1)(x+2), sqrt(x). Angles in degrees.'),
            onChanged: (s) => setState(() => _fn = PlotFunction(mode: PlotMode.custom, custom: _tryParse(s))),
          ),
          const SizedBox(height: Kx.s8),
          Wrap(
            spacing: Kx.s8,
            runSpacing: Kx.s8,
            children: [
              for (final ex in const ['x^2 - 4', '(x - 1)(x + 2)(x - 3)', '2x + 1', 'sqrt(x)', '1/x'])
                ActionChip(
                  label: Text(ex),
                  onPressed: () => setState(() {
                    _custom.text = ex;
                    _fn = PlotFunction(mode: PlotMode.custom, custom: _tryParse(ex));
                  }),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

class _PlotPainter extends CustomPainter {
  _PlotPainter(this.f, this.cx, this.cy, this.ux, this.uy, this.roots, this.vertex, this.pal, this.unit);
  final PlotFunction f;
  final double cx, cy, ux, uy;
  final List<double> roots;
  final (double, double)? vertex;
  final LabPalette pal;
  final String unit;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    if (w < 20 || h < 20) return;
    final s = (math.min(w / 700, h / 420)).clamp(0.85, 1.5);
    final small = pal.textStyle.copyWith(fontSize: 12 * s, color: pal.muted);
    final label = pal.textStyle.copyWith(fontSize: 13.5 * s, color: pal.ink, fontWeight: FontWeight.w700);
    double sx(double x) => w / 2 + (x - cx) / ux;
    double sy(double y) => h / 2 - (y - cy) / uy;
    final x0 = cx - w / 2 * ux, x1 = cx + w / 2 * ux;
    final y0 = cy - h / 2 * uy, y1 = cy + h / 2 * uy;

    // Grid.
    final stepX = f.mode.isTrig && 90 / ux > 40 ? _trigStep(ux) : _step(ux * 80);
    final stepY = _step(uy * 60);
    final minor = Paint()
      ..color = pal.grid.withValues(alpha: 0.6)
      ..strokeWidth = 1;
    final axisY = sy(0).clamp(0.0, h), axisX = sx(0).clamp(0.0, w);
    for (var x = (x0 / stepX).floorToDouble() * stepX; x <= x1; x += stepX) {
      canvas.drawLine(Offset(sx(x), 0), Offset(sx(x), h), minor);
      if (x.abs() > stepX / 2 && sx(x) > 24 * s && sx(x) < w - 24 * s) {
        paintLabel(canvas, '${_fmt(x, stepX)}$unit', Offset(sx(x), (axisY + 4 * s).clamp(0, h - 18 * s)), small, align: Alignment.topCenter);
      }
    }
    for (var y = (y0 / stepY).floorToDouble() * stepY; y <= y1; y += stepY) {
      canvas.drawLine(Offset(0, sy(y)), Offset(w, sy(y)), minor);
      if (y.abs() > stepY / 2 && sy(y) > 12 * s && sy(y) < h - 12 * s) {
        paintLabel(canvas, _fmt(y, stepY), Offset((axisX - 6 * s).clamp(30 * s, w), sy(y)), small, align: Alignment.centerRight);
      }
    }
    final axis = Paint()
      ..color = pal.ink
      ..strokeWidth = 1.8 * s;
    canvas.drawLine(Offset(0, sy(0)), Offset(w, sy(0)), axis);
    canvas.drawLine(Offset(sx(0), 0), Offset(sx(0), h), axis);
    paintLabel(canvas, 'x', Offset(w - 8 * s, sy(0) - 6 * s), label, align: Alignment.bottomRight);
    paintLabel(canvas, 'y', Offset(sx(0) + 8 * s, 8 * s), label, align: Alignment.topLeft);

    // Curve, sampled every pixel; break at gaps and asymptotes.
    final path = Path();
    var pen = false;
    double? lastY;
    for (var px = 0.0; px <= w; px += 1) {
      final y = f.eval(x0 + px * ux);
      final py = sy(y);
      final ok = y.isFinite && py.abs() < h * 20;
      if (ok && pen && lastY != null && (py - lastY).abs() > h * 2) pen = false;
      if (!ok) {
        pen = false;
        lastY = null;
        continue;
      }
      if (pen) {
        path.lineTo(px, py);
      } else {
        path.moveTo(px, py);
        pen = true;
      }
      lastY = py;
    }
    canvas.drawPath(path, Paint()
      ..color = pal.blue
      ..strokeWidth = 3.2 * s
      ..style = PaintingStyle.stroke
      ..strokeJoin = StrokeJoin.round);

    // Roots, vertex and y-intercept.
    for (final r in roots.take(8)) {
      final p = Offset(sx(r), sy(0));
      canvas.drawCircle(p, 6.5 * s, Paint()..color = pal.red);
      paintLabel(canvas, 'x = ${_n(r)}$unit', p + Offset(0, -10 * s), label.copyWith(color: pal.red), align: Alignment.bottomCenter, background: pal.surface.withValues(alpha: 0.85));
    }
    final v = vertex;
    if (v != null) {
      final p = Offset(sx(v.$1), sy(v.$2));
      canvas.drawCircle(p, 6.5 * s, Paint()..color = pal.purple);
      paintLabel(canvas, 'Vertex (${_n(v.$1)}, ${_n(v.$2)})', p + Offset(0, f.a > 0 ? 12 * s : -12 * s), label.copyWith(color: pal.purple),
          align: f.a > 0 ? Alignment.topCenter : Alignment.bottomCenter, background: pal.surface.withValues(alpha: 0.85));
    }
    final yi = f.eval(0);
    if (yi.isFinite && f.mode != PlotMode.custom) {
      canvas.drawCircle(Offset(sx(0), sy(yi)), 5 * s, Paint()..color = pal.green);
    }
  }

  static double _step(double raw) {
    final e = math.pow(10, (math.log(raw) / math.ln10).floor()).toDouble();
    for (final m in [1.0, 2.0, 5.0, 10.0]) {
      if (raw <= m * e) return m * e;
    }
    return 10 * e;
  }

  static double _trigStep(double ux) {
    for (final st in [15.0, 30.0, 45.0, 90.0, 180.0, 360.0]) {
      if (st / ux >= 70) return st;
    }
    return 720;
  }

  static String _fmt(double v, double step) {
    final d = step >= 1 ? 0 : (-(math.log(step) / math.ln10).floor()).clamp(0, 6);
    return _n(v, d);
  }

  @override
  bool shouldRepaint(_PlotPainter old) => true;
}
