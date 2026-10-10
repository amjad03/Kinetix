import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:kinetix_ink/kinetix_ink.dart' show GraphElement, compileGraph, paintGraph;
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';
import '../board/context/class_context.dart' show showAllToolsByDefault;
import '../board/context/context_switcher.dart' show contextStrings;
import '../search/filter_bar.dart';
import '../search/fuzzy.dart';
import '../search/search_strings.dart';

/// The six interactive simulations from the KINETIX prototype. They open in a window over the
/// board (they are not written on it).
enum SimKind { pendulum, projectile, grapher, fractions, wave, pythagoras }

String simName(AppLocalizations l, SimKind k) => switch (k) {
  SimKind.pendulum => l.simPendulum,
  SimKind.projectile => l.simProjectile,
  SimKind.grapher => l.simGrapher,
  SimKind.fractions => l.simFractions,
  SimKind.wave => l.simWave,
  SimKind.pythagoras => l.simPythagoras,
};

IconData simIcon(SimKind k) => switch (k) {
  SimKind.pendulum => Icons.access_time,
  SimKind.projectile => Icons.sports_baseball_outlined,
  SimKind.grapher => Icons.show_chart,
  SimKind.fractions => Icons.view_week_outlined,
  SimKind.wave => Icons.waves,
  SimKind.pythagoras => Icons.change_history,
};

/// Where each simulation starts.
Map<String, Object> defaultSimParams(SimKind k) => switch (k) {
  SimKind.pendulum => {'length': 1.0, 'gravity': 9.8, 'angle': 20.0},
  SimKind.projectile => {'speed': 20.0, 'angle': 45.0, 'gravity': 9.8},
  SimKind.grapher => {'expr': 'x^2 - 4'},
  SimKind.fractions => {'n1': 1, 'd1': 2, 'n2': 2, 'd2': 4},
  SimKind.wave => {'amplitude': 1.0, 'frequency': 1.0, 'wavelength': 4.0},
  SimKind.pythagoras => {'a': 3.0, 'b': 4.0},
};

/// 2, 2.5, 0.33: up to two decimals, no trailing zeros.
String fmtNum(double v) {
  if (v == v.roundToDouble()) return v.toStringAsFixed(0);
  return v.toStringAsFixed(2).replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
}

int _gcd(int a, int b) => b == 0 ? a.abs() : _gcd(b, a % b);

/// The numbers a simulation shows under its drawing, worked out from its settings.
List<String> simReadouts(AppLocalizations l, SimKind kind, Map<String, Object> p) {
  double v(String k) => (p[k] as num).toDouble();
  switch (kind) {
    case SimKind.pendulum:
      final t = 2 * math.pi * math.sqrt(v('length') / v('gravity'));
      return ['L = ${v('length').toStringAsFixed(2)} m', 'g = ${v('gravity').toStringAsFixed(1)} m/s²', 'T ≈ ${t.toStringAsFixed(2)} s'];
    case SimKind.projectile:
      final s = v('speed'), a = v('angle') * math.pi / 180, g = v('gravity');
      return [
        'v = ${s.toStringAsFixed(0)} m/s',
        'θ = ${v('angle').toStringAsFixed(0)}°',
        l.simRange((s * s * math.sin(2 * a) / g).toStringAsFixed(1)),
        l.simMaxHeight((s * s * math.pow(math.sin(a), 2) / (2 * g)).toStringAsFixed(1)),
        l.simFlightTime((2 * s * math.sin(a) / g).toStringAsFixed(2)),
      ];
    case SimKind.grapher:
      return ['y = ${p['expr']}'];
    case SimKind.fractions:
      final n1 = p['n1'] as int, d1 = p['d1'] as int, n2 = p['n2'] as int, d2 = p['d2'] as int;
      final cmp = n1 * d2 == n2 * d1 ? '=' : (n1 * d2 > n2 * d1 ? '>' : '<');
      final sn = n1 * d2 + n2 * d1, sd = d1 * d2, g = math.max(1, _gcd(sn, sd));
      return ['$n1/$d1 $cmp $n2/$d2', '$n1/$d1 + $n2/$d2 = ${sn ~/ g}/${sd ~/ g}'];
    case SimKind.wave:
      final f = v('frequency'), w = v('wavelength');
      return ['A = ${v('amplitude').toStringAsFixed(1)}', 'f = ${f.toStringAsFixed(1)} Hz', 'λ = ${w.toStringAsFixed(1)} m', 'v = fλ = ${(f * w).toStringAsFixed(1)} m/s'];
    case SimKind.pythagoras:
      final a = v('a'), b = v('b');
      return ['a² + b² = ${fmtNum(a * a)} + ${fmtNum(b * b)} = ${fmtNum(a * a + b * b)}', 'c = √${fmtNum(a * a + b * b)} ≈ ${math.sqrt(a * a + b * b).toStringAsFixed(2)}'];
  }
}

/// One simulation. With [onChanged] it shows the teacher's controls; without it (the
/// students' screen) only the drawing and its numbers, large.
class SimView extends StatefulWidget {
  const SimView({super.key, required this.kind, required this.params, this.onChanged, this.dark = false});

  final SimKind kind;
  final Map<String, Object> params;
  final ValueChanged<Map<String, Object>>? onChanged;
  final bool dark;

  @override
  State<SimView> createState() => _SimViewState();
}

class _SimViewState extends State<SimView> with SingleTickerProviderStateMixin {
  late final Ticker _ticker;
  double _t = 0;
  Duration _last = Duration.zero;

  // The pendulum, integrated with the full (non-linear) equation.
  double _theta = 0, _omega = 0;
  Object? _pendulumAngle;

  bool get _moves => widget.kind == SimKind.pendulum || widget.kind == SimKind.projectile || widget.kind == SimKind.wave;

  @override
  void initState() {
    super.initState();
    _ticker = createTicker(_tick);
    if (_moves) _ticker.start();
  }

  @override
  void didUpdateWidget(SimView old) {
    super.didUpdateWidget(old);
    if (_moves && !_ticker.isActive) {
      _last = Duration.zero;
      _ticker.start();
    } else if (!_moves && _ticker.isActive) {
      _ticker.stop();
    }
  }

  void _tick(Duration d) {
    final dt = ((d - _last).inMicroseconds / 1e6).clamp(0.0, 0.05);
    _last = d;
    setState(() {
      _t += dt;
      if (widget.kind == SimKind.pendulum) _stepPendulum(dt);
    });
  }

  double _p(String k) => (widget.params[k] as num).toDouble();

  void _stepPendulum(double dt) {
    // A new start angle lets go of the bob again from there.
    if (_pendulumAngle != widget.params['angle']) {
      _pendulumAngle = widget.params['angle'];
      _theta = _p('angle') * math.pi / 180;
      _omega = 0;
    }
    final g = _p('gravity'), l = _p('length');
    const sub = 8;
    for (var i = 0; i < sub; i++) {
      final h = dt / sub;
      _omega += -(g / l) * math.sin(_theta) * h;
      _theta += _omega * h;
    }
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  void _set(String k, Object v) => widget.onChanged?.call({...widget.params, k: v});

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final fg = widget.dark ? Colors.white : const Color(0xFF1B1F24);
    return LayoutBuilder(
      builder: (context, c) {
        final big = c.maxWidth > 700;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: ClipRect(
                child: CustomPaint(
                  key: Key('sim-${widget.kind.name}'),
                  painter: SimPainter(widget.kind, widget.params, _t, _theta, widget.dark),
                  child: const SizedBox.expand(),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s8, Kx.s12, Kx.s4),
              child: Wrap(
                spacing: 18,
                runSpacing: 6,
                children: [
                  for (final r in simReadouts(l, widget.kind, widget.params))
                    Text(r, style: TextStyle(color: fg, fontSize: big ? 22 : 15, fontWeight: FontWeight.w600, fontFeatures: const [FontFeature.tabularFigures()])),
                ],
              ),
            ),
            if (widget.onChanged != null) ..._controls(context, fg),
          ],
        );
      },
    );
  }

  List<Widget> _controls(BuildContext context, Color fg) {
    final l = context.l10n;
    Widget slider(String label, String key, double min, double max, {int? divisions, String unit = ''}) => Row(
      children: [
        SizedBox(width: 110, child: Text(label, style: TextStyle(color: fg.withValues(alpha: 0.75), fontSize: 14))),
        Expanded(
          child: Slider(key: Key('sim-slider-$key'), value: _p(key).clamp(min, max), min: min, max: max, divisions: divisions, onChanged: (v) => _set(key, v)),
        ),
        SizedBox(
          width: 64,
          child: Text('${_p(key).toStringAsFixed(max - min > 20 ? 0 : 1)}$unit', textAlign: TextAlign.right, style: TextStyle(color: fg, fontSize: 14)),
        ),
      ],
    );
    Widget stepper(String label, String key, int min, int max) {
      final v = widget.params[key] as int;
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: TextStyle(color: fg.withValues(alpha: 0.75), fontSize: 14)),
          IconButton(key: Key('sim-$key-down'), onPressed: v > min ? () => _set(key, v - 1) : null, icon: const Icon(Icons.remove_circle_outline)),
          Text('$v', style: TextStyle(color: fg, fontSize: 16, fontWeight: FontWeight.w700)),
          IconButton(key: Key('sim-$key-up'), onPressed: v < max ? () => _set(key, v + 1) : null, icon: const Icon(Icons.add_circle_outline)),
        ],
      );
    }

    return switch (widget.kind) {
      SimKind.pendulum => [
        slider(l.simLength, 'length', 0.2, 3, unit: ' m'),
        slider(l.simGravity, 'gravity', 1.6, 25),
        slider(l.simStartAngle, 'angle', 5, 80, unit: '°'),
      ],
      SimKind.projectile => [slider(l.simSpeed, 'speed', 5, 50), slider(l.simAngle, 'angle', 5, 85, unit: '°'), slider(l.simGravity, 'gravity', 1.6, 25)],
      SimKind.grapher => [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Kx.s12, vertical: Kx.s8),
          child: _ExprField(value: widget.params['expr'] as String, onSubmit: (v) => _set('expr', v)),
        ),
      ],
      SimKind.fractions => [
        Wrap(
          alignment: WrapAlignment.center,
          children: [stepper(l.simTop(1), 'n1', 0, 12), stepper(l.simBottom(1), 'd1', 1, 12), stepper(l.simTop(2), 'n2', 0, 12), stepper(l.simBottom(2), 'd2', 1, 12)],
        ),
      ],
      SimKind.wave => [
        slider(l.simAmplitude, 'amplitude', 0.2, 2),
        slider(l.simFrequency, 'frequency', 0.2, 3, unit: ' Hz'),
        slider(l.simWavelength, 'wavelength', 1, 8, unit: ' m'),
      ],
      SimKind.pythagoras => [slider(l.simSide('a'), 'a', 1, 12, divisions: 22), slider(l.simSide('b'), 'b', 1, 12, divisions: 22)],
    };
  }
}

class _ExprField extends StatefulWidget {
  const _ExprField({required this.value, required this.onSubmit});
  final String value;
  final ValueChanged<String> onSubmit;

  @override
  State<_ExprField> createState() => _ExprFieldState();
}

class _ExprFieldState extends State<_ExprField> {
  late final _c = TextEditingController(text: widget.value);
  bool _bad = false;

  void _submit() {
    final ok = compileGraph(_c.text) != null;
    setState(() => _bad = !ok);
    if (ok) widget.onSubmit(_c.text.trim());
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(
    key: const Key('sim-expr'),
    controller: _c,
    onSubmitted: (_) => _submit(),
    decoration: InputDecoration(
      prefixText: 'y = ',
      errorText: _bad ? context.l10n.simBadExpression : null,
      isDense: true,
      border: const OutlineInputBorder(),
      suffixIcon: IconButton(key: const Key('sim-expr-go'), tooltip: context.l10n.simDraw, icon: const Icon(Icons.check), onPressed: _submit),
    ),
  );
}

TextPainter _label(String text, double size, Color color, {bool bold = false}) => TextPainter(
  text: TextSpan(text: text, style: TextStyle(fontSize: size, color: color, fontWeight: bold ? FontWeight.w700 : FontWeight.w400)),
  textDirection: TextDirection.ltr,
)..layout();

/// Draws a simulation at time [t] (the pendulum at angle [theta]).
class SimPainter extends CustomPainter {
  SimPainter(this.kind, this.p, this.t, this.theta, this.dark);

  final SimKind kind;
  final Map<String, Object> p;
  final double t;
  final double theta;
  final bool dark;

  double v(String k) => (p[k] as num).toDouble();
  Color get ink => dark ? Colors.white : const Color(0xFF1B1F24);
  static const accent = Color(0xFFE8A33D);
  static const blue = Color(0xFF1F5FD6);

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;
    switch (kind) {
      case SimKind.pendulum:
        _pendulum(canvas, size);
      case SimKind.projectile:
        _projectile(canvas, size);
      case SimKind.grapher:
        final r = (Offset.zero & size).deflate(8);
        paintGraph(
          canvas,
          GraphElement(id: 'sim', rect: r, expression: p['expr'] as String, color: blue, yMin: -10 * r.height / r.width, yMax: 10 * r.height / r.width),
        );
      case SimKind.fractions:
        _fractions(canvas, size);
      case SimKind.wave:
        _wave(canvas, size);
      case SimKind.pythagoras:
        _pythagoras(canvas, size);
    }
  }

  Paint _stroke(Color c, double w) => Paint()
    ..color = c
    ..style = PaintingStyle.stroke
    ..strokeWidth = w;

  void _pendulum(Canvas canvas, Size size) {
    final pivot = Offset(size.width / 2, size.height * 0.08);
    final len = size.height * 0.82 * (v('length') / 3).clamp(0.08, 1.0);
    final bob = pivot + Offset(math.sin(theta), math.cos(theta)) * len;
    final a0 = v('angle') * math.pi / 180;
    canvas.drawArc(Rect.fromCircle(center: pivot, radius: len), math.pi / 2 - a0, 2 * a0, false, _stroke(ink.withValues(alpha: 0.18), 2));
    canvas.drawLine(pivot, pivot + Offset(0, len), _stroke(ink.withValues(alpha: 0.15), 1.5));
    canvas.drawLine(Offset(pivot.dx - 60, pivot.dy), Offset(pivot.dx + 60, pivot.dy), _stroke(ink, 5));
    canvas.drawLine(pivot, bob, _stroke(ink, 2.5));
    canvas.drawCircle(bob, 22, Paint()..color = accent);
    canvas.drawCircle(bob, 22, _stroke(ink, 2));
  }

  void _projectile(Canvas canvas, Size size) {
    final speed = v('speed'), ang = v('angle') * math.pi / 180, g = v('gravity');
    final tof = 2 * speed * math.sin(ang) / g;
    final range = speed * speed * math.sin(2 * ang) / g;
    final hmax = speed * speed * math.pow(math.sin(ang), 2) / (2 * g);
    // A fixed world window, so a new angle visibly changes the range.
    final worldW = math.max(260.0, range * 1.1), worldH = math.max(worldW * size.height / size.width * 0.8, hmax * 1.2);
    final ground = size.height - 28;
    final s = math.min((size.width - 40) / worldW, (ground - 16) / worldH);
    Offset map(double x, double y) => Offset(20 + x * s, ground - y * s);
    canvas.drawLine(Offset(0, ground), Offset(size.width, ground), _stroke(ink, 2));
    for (var m = 0; m <= worldW; m += 50) {
      _label('$m m', 11, ink.withValues(alpha: 0.6)).paint(canvas, map(m.toDouble(), 0) + const Offset(-10, 6));
    }
    final path = Path();
    for (var i = 0; i <= 80; i++) {
      final tt = tof * i / 80;
      final pt = map(speed * math.cos(ang) * tt, speed * math.sin(ang) * tt - g * tt * tt / 2);
      i == 0 ? path.moveTo(pt.dx, pt.dy) : path.lineTo(pt.dx, pt.dy);
    }
    canvas.drawPath(path, _stroke(blue.withValues(alpha: 0.5), 2.5));
    final tt = (t % (tof + 0.8)).clamp(0.0, tof);
    final ball = map(speed * math.cos(ang) * tt, math.max(0, speed * math.sin(ang) * tt - g * tt * tt / 2));
    canvas.drawCircle(ball, 11, Paint()..color = accent);
    canvas.drawCircle(ball, 11, _stroke(ink, 2));
    final o = map(0, 0);
    canvas.drawLine(o, o + Offset(math.cos(ang), -math.sin(ang)) * 60, _stroke(ink, 3));
  }

  void _fractions(Canvas canvas, Size size) {
    void bar(int n, int d, double y, Color c) {
      final w = size.width - 60, h = math.min(80.0, size.height / 4);
      const left = 30.0;
      for (var i = 0; i < d; i++) {
        final r = Rect.fromLTWH(left + w * i / d, y, w / d, h);
        if (i < n) canvas.drawRect(r, Paint()..color = c);
        canvas.drawRect(r, _stroke(ink, 2));
      }
      _label('$n/$d', 22, ink, bold: true).paint(canvas, Offset(left, y + h + 6));
    }

    bar(p['n1'] as int, p['d1'] as int, size.height * 0.12, accent);
    bar(p['n2'] as int, p['d2'] as int, size.height * 0.56, blue.withValues(alpha: 0.8));
  }

  void _wave(Canvas canvas, Size size) {
    final a = v('amplitude'), f = v('frequency'), l = v('wavelength');
    final mid = size.height / 2;
    final pxPerM = size.width / 16;
    final ampPx = (size.height * 0.4) * a / 2;
    canvas.drawLine(Offset(0, mid), Offset(size.width, mid), _stroke(ink.withValues(alpha: 0.25), 1.5));
    final path = Path();
    for (var x = 0.0; x <= size.width; x += 3) {
      final y = mid - ampPx * math.sin(2 * math.pi * ((x / pxPerM) / l - f * t));
      x == 0 ? path.moveTo(x, y) : path.lineTo(x, y);
    }
    canvas.drawPath(path, _stroke(blue, 3.5));
    // A particle at one place only moves up and down: the wave carries energy, not matter.
    final px = size.width * 0.3;
    final py = mid - ampPx * math.sin(2 * math.pi * ((px / pxPerM) / l - f * t));
    canvas.drawCircle(Offset(px, py), 10, Paint()..color = accent);
    final wl = l * pxPerM;
    final my = mid + ampPx + 28;
    canvas.drawLine(Offset(20, my), Offset(20 + wl, my), _stroke(ink, 2));
    _label('λ', 20, ink, bold: true).paint(canvas, Offset(20 + wl / 2 - 6, my + 4));
  }

  void _pythagoras(Canvas canvas, Size size) {
    final a = v('a'), b = v('b');
    final c = math.sqrt(a * a + b * b);
    // The triangle (legs a upright and b flat) with its three squares spans 2a + b across and
    // a + 2b down, in side units.
    final s = math.min(size.width / (2 * a + b), size.height / (a + 2 * b)) * 0.9;
    final top = size.center(Offset.zero) - Offset(b / 2, a / 2) * s;
    final right = top + Offset(0, a * s);
    final end = right + Offset(b * s, 0);
    Path poly(List<Offset> pts) => Path()..addPolygon(pts, true);
    canvas.drawPath(poly([top, right, right - Offset(a * s, 0), top - Offset(a * s, 0)]), Paint()..color = accent.withValues(alpha: 0.35));
    canvas.drawPath(poly([right, end, end + Offset(0, b * s), right + Offset(0, b * s)]), Paint()..color = blue.withValues(alpha: 0.3));
    final d = end - top;
    final n = Offset(d.dy, -d.dx);
    canvas.drawPath(poly([top, end, end + n, top + n]), Paint()..color = const Color(0xFF1E8C4E).withValues(alpha: 0.3));
    canvas.drawPath(poly([top, right, end]), _stroke(ink, 3));
    canvas.drawRect(Rect.fromLTWH(right.dx, right.dy - 14, 14, 14), _stroke(ink, 1.5));
    void label(String text, Offset at) {
      final tp = _label(text, 18, ink, bold: true);
      tp.paint(canvas, at - Offset(tp.width / 2, tp.height / 2));
    }

    label('a² = ${fmtNum(a * a)}', (top + right) / 2 - Offset(a * s / 2, 0));
    label('b² = ${fmtNum(b * b)}', (right + end) / 2 + Offset(0, b * s / 2));
    label('c² = ${fmtNum(double.parse((c * c).toStringAsFixed(2)))}', (top + end) / 2 + n / 2);
  }

  @override
  bool shouldRepaint(SimPainter old) => old.t != t || old.p != p || old.theta != theta || old.kind != kind || old.dark != dark;
}

/// The open simulation and its settings.
class ActiveSim {
  const ActiveSim(this.kind, this.params);
  final SimKind kind;
  final Map<String, Object> params;

  factory ActiveSim.of(SimKind kind) => ActiveSim(kind, defaultSimParams(kind));
}

/// A simulation in a window over the board: drag it by its title, switch to another, close it.
class SimWindow extends StatelessWidget {
  const SimWindow({super.key, required this.sim, required this.onChanged, required this.onClose, required this.onDrag});

  final ActiveSim sim;
  final ValueChanged<ActiveSim> onChanged;
  final VoidCallback onClose;
  final ValueChanged<Offset> onDrag;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    return Material(
      key: const Key('sim-window'),
      color: Colors.white,
      elevation: 6,
      borderRadius: BorderRadius.circular(Kx.rXl),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onPanUpdate: (d) => onDrag(d.delta),
            child: Container(
              color: c.surfaceContainerHigh,
              padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s4, Kx.s4, Kx.s4),
              child: Row(
                children: [
                  Icon(simIcon(sim.kind), color: c.onSurfaceVariant, size: 20),
                  const SizedBox(width: Kx.s8),
                  Expanded(child: Text(simName(l, sim.kind), style: context.text.titleSmall)),
                  PopupMenuButton<SimKind>(
                    key: const Key('sim-switch'),
                    tooltip: l.simOthers,
                    icon: const Icon(Icons.apps),
                    onSelected: (k) => onChanged(ActiveSim.of(k)),
                    itemBuilder: (_) => [
                      for (final k in SimKind.values)
                        PopupMenuItem(
                          value: k,
                          child: ListTile(leading: Icon(simIcon(k)), title: Text(simName(l, k)), contentPadding: EdgeInsets.zero),
                        ),
                    ],
                  ),
                  IconButton(key: const Key('sim-reset'), tooltip: l.reset, onPressed: () => onChanged(ActiveSim.of(sim.kind)), icon: const Icon(Icons.replay)),
                  IconButton(key: const Key('sim-close'), tooltip: l.close, onPressed: onClose, icon: const Icon(Icons.close)),
                ],
              ),
            ),
          ),
          Expanded(
            child: Theme(
              data: ThemeData.light(useMaterial3: true).copyWith(
                sliderTheme: const SliderThemeData(activeTrackColor: SimPainter.accent, thumbColor: SimPainter.accent),
              ),
              child: Padding(
                padding: const EdgeInsets.all(Kx.s8),
                child: SimView(key: ValueKey(sim.kind), kind: sim.kind, params: sim.params, onChanged: (p) => onChanged(ActiveSim(sim.kind, p))),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Picks a simulation to open.
class SimPickerDialog extends StatefulWidget {
  const SimPickerDialog({super.key, this.relevant});

  /// Whether a simulation (by `SimKind.name`) fits what is being taught; the rest show after "Show all tools".
  final bool Function(String name)? relevant;

  @override
  State<SimPickerDialog> createState() => _SimPickerDialogState();
}

class _SimPickerDialogState extends State<SimPickerDialog> {
  String _q = '';
  bool _all = showAllToolsByDefault;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    // Two to a row on a phone: the dialog's width less its insets (40) and padding (24).
    final room = MediaQuery.sizeOf(context).width - 2 * 40 - 2 * 24;
    final tile = room < 520 ? (room - Kx.s12) / 2 : 160.0;
    return AlertDialog(
      icon: const Icon(Icons.science_outlined),
      title: Text(l.simTitle),
      scrollable: true,
      content: SizedBox(
        width: 520,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ModuleSearchField(
              key: const Key('sims-search'),
              hint: SearchStrings.of(context).searchSims,
              padding: const EdgeInsets.only(bottom: Kx.s12),
              onChanged: (v) => setState(() => _q = v),
            ),
            _grid(l, tile),
            if (widget.relevant != null)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(key: const Key('sims-show-all'), onPressed: () => setState(() => _all = !_all), child: Text(contextStrings(context)[_all ? 'showRelevant' : 'showAll'])),
              ),
          ],
        ),
      ),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel))],
    );
  }

  Widget _grid(AppLocalizations l, double tile) => Wrap(
          spacing: Kx.s12,
          runSpacing: Kx.s12,
          children: [
            for (final k in matchingLabels([for (final k in SimKind.values) if (_all || widget.relevant == null || widget.relevant!(k.name)) k], (k) => simName(l, k), _q))
              SizedBox(
                width: tile,
                child: OutlinedButton(
                  key: Key('open-sim-${k.name}'),
                  style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: Kx.s16, horizontal: Kx.s8)),
                  onPressed: () => Navigator.pop(context, k),
                  child: Column(
                    children: [
                      Icon(simIcon(k), size: 32),
                      const SizedBox(height: Kx.s8),
                      Text(simName(l, k), textAlign: TextAlign.center),
                    ],
                  ),
                ),
              ),
          ],
        );
}
