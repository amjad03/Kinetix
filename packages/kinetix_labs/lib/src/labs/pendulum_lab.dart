import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../lab_scaffold.dart';
import '../models/pendulum.dart';

/// A simple pendulum with a stopwatch that times 10 oscillations, as in the practical.
class PendulumLab extends StatefulWidget {
  const PendulumLab({super.key, this.preset});

  /// 'moon', 'mars' or 'jupiter' starts there instead of on Earth.
  final String? preset;

  @override
  State<PendulumLab> createState() => _PendulumLabState();
}

class _PendulumLabState extends State<PendulumLab> with SingleTickerProviderStateMixin {
  double _length = 1.0; // m
  double _amplitude = 10; // degrees
  Gravity _gravity = Gravity.earth;
  late PendulumSim _sim;
  late final Ticker _ticker;
  final _frame = ValueNotifier<int>(0);
  Duration _last = Duration.zero;
  bool _playing = true;
  bool _wasRunning = false;

  @override
  void initState() {
    super.initState();
    _reset();
    _ticker = createTicker(_tick)..start();
  }

  void _reset() {
    _length = 1.0;
    _amplitude = 10;
    _gravity = Gravity.values.firstWhere((g) => g.name == widget.preset, orElse: () => Gravity.earth);
    _sim = PendulumSim(length: _length, g: _gravity.g, amplitudeDeg: _amplitude);
    _playing = true;
  }

  void _restart() {
    _sim = PendulumSim(length: _length, g: _gravity.g, amplitudeDeg: _amplitude);
  }

  void _tick(Duration elapsed) {
    final dt = _last == Duration.zero ? 0.0 : (elapsed - _last).inMicroseconds / 1e6;
    _last = elapsed;
    if (!_playing) return;
    _sim.step(math.min(dt, 0.05));
    _frame.value++;
    // Rebuild the readouts a few times a second, and when the stopwatch stops.
    final running = _sim.stopwatchRunning;
    if (_frame.value % 6 == 0 || running != _wasRunning) setState(() {});
    _wasRunning = running;
  }

  @override
  void dispose() {
    _ticker.dispose();
    _frame.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pal = LabPalette(context);
    final t0 = smallAnglePeriod(_length, _gravity.g);
    final exact = exactPeriod(_length, _gravity.g, _amplitude * math.pi / 180);
    final measured = _sim.measuredPeriod;
    final sw = _sim.stopwatchTime;
    return LabScaffold(
      title: 'Simple pendulum',
      subtitle: 'Physics practical · Time period and length',
      formula: 'T = 2π √(L / g)',
      aim: 'To measure the time period of a simple pendulum by timing 10 oscillations, and to see how it depends on '
          'length, amplitude and g.',
      observe: const [
        'Four times the length gives twice the period (T ∝ √L).',
        'The mass of the bob and a small amplitude do not change T.',
        'Large amplitudes (over about 15°) make T slightly longer than 2π√(L/g).',
        'On the Moon, g is about 1/6 of Earth\'s, so the pendulum swings about 2.5 times slower.',
      ],
      onReset: () => setState(_reset),
      simulation: RepaintBoundary(
        child: CustomPaint(painter: _PendulumPainter(_sim, _frame, pal, _amplitude), size: Size.infinite),
      ),
      readouts: [
        Readout('Formula T = 2π√(L/g)', t0.toStringAsFixed(3), unit: 's', key: const ValueKey('readout-formula')),
        Readout('Stopwatch', sw.toStringAsFixed(2), unit: 's', highlight: _sim.stopwatchRunning),
        Readout('Oscillations counted', '${_sim.oscillations} / ${_sim.target}'),
        Readout('Measured T = t / ${_sim.target}', measured == null ? '–' : measured.toStringAsFixed(3), unit: measured == null ? '' : 's', highlight: measured != null, key: const ValueKey('readout-measured')),
        Readout('Last swing (live)', _sim.lastPeriod == null ? '–' : _sim.lastPeriod!.toStringAsFixed(3), unit: _sim.lastPeriod == null ? '' : 's'),
        Readout('Exact T at ${_amplitude.toStringAsFixed(0)}°', exact.toStringAsFixed(3), unit: 's'),
      ],
      controls: [
        Wrap(
          spacing: Kx.s8,
          runSpacing: Kx.s8,
          children: [
            FilledButton.icon(
              key: const ValueKey('stopwatch-start'),
              onPressed: () => setState(() => _sim.startStopwatch()),
              icon: const Icon(Icons.timer_outlined),
              label: Text(_sim.timing ? 'Restart timing' : 'Time 10 oscillations'),
            ),
            OutlinedButton.icon(
              onPressed: () => setState(() => _playing = !_playing),
              icon: Icon(_playing ? Icons.pause : Icons.play_arrow),
              label: Text(_playing ? 'Pause' : 'Play'),
            ),
          ],
        ),
        Padding(
          padding: const EdgeInsets.only(top: Kx.s8),
          child: Text(
            _sim.timing && !_sim.stopwatchRunning
                ? 'The stopwatch starts when the bob next passes the mean position.'
                : 'The stopwatch counts each time the bob passes the mean position moving right.',
            style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant),
          ),
        ),
        const SizedBox(height: Kx.s8),
        LabSlider(
          key: const ValueKey('slider-length'),
          label: 'Length L',
          value: _length,
          min: 0.1,
          max: 2.0,
          divisions: 38,
          unit: 'm',
          format: (v) => v.toStringAsFixed(2),
          onChanged: (v) => setState(() {
            _length = v;
            _restart();
          }),
        ),
        LabSlider(
          label: 'Amplitude θ',
          value: _amplitude,
          min: 2,
          max: 60,
          divisions: 58,
          unit: '°',
          format: (v) => v.toStringAsFixed(0),
          onChanged: (v) => setState(() {
            _amplitude = v;
            _restart();
          }),
        ),
        const LabSectionLabel('Gravity'),
        Wrap(
          spacing: Kx.s8,
          runSpacing: Kx.s8,
          children: [
            for (final g in Gravity.values)
              ChoiceChip(
                label: Text('${g.title} · ${g.g} m/s²'),
                selected: _gravity == g,
                onSelected: (_) => setState(() {
                  _gravity = g;
                  _restart();
                }),
              ),
          ],
        ),
      ],
    );
  }
}

class _PendulumPainter extends CustomPainter {
  _PendulumPainter(this.sim, Listenable frame, this.pal, this.amplitude) : super(repaint: frame);
  final PendulumSim sim;
  final LabPalette pal;
  final double amplitude;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final s = (math.min(w / 600, h / 420)).clamp(0.85, 1.6);
    final pivot = Offset(w / 2, h * 0.1);
    final pxPerM = h * 0.8 / 2.0;
    final len = sim.length * pxPerM;
    final small = pal.textStyle.copyWith(fontSize: 12.5 * s, color: pal.muted);
    final text = pal.textStyle.copyWith(fontSize: 14 * s, color: pal.ink, fontWeight: FontWeight.w600);

    // Clamp stand.
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: pivot - Offset(0, 8 * s), width: math.min(w * 0.5, 260 * s), height: 12 * s), Radius.circular(4 * s)), Paint()..color = pal.muted);

    // Mean position and amplitude arc.
    final thin = Paint()
      ..color = pal.grid
      ..strokeWidth = 1.6 * s
      ..style = PaintingStyle.stroke;
    for (var y = pivot.dy; y < pivot.dy + len + 30 * s; y += 12 * s) {
      canvas.drawLine(Offset(pivot.dx, y), Offset(pivot.dx, y + 6 * s), thin);
    }
    final a = amplitude * math.pi / 180;
    canvas.drawArc(Rect.fromCircle(center: pivot, radius: len), math.pi / 2 - a, 2 * a, false, thin);

    // Ruler on the left: 10 cm ticks up to 2 m.
    final rx = math.max(16 * s, pivot.dx - math.min(w * 0.3, 240 * s));
    final ruler = Paint()
      ..color = pal.muted
      ..strokeWidth = 1.4 * s;
    canvas.drawLine(Offset(rx, pivot.dy), Offset(rx, pivot.dy + 2 * pxPerM), ruler);
    for (var k = 0; k <= 20; k++) {
      final y = pivot.dy + k * 0.1 * pxPerM;
      canvas.drawLine(Offset(rx, y), Offset(rx + (k % 5 == 0 ? 12 : 6) * s, y), ruler);
      if (k % 5 == 0 && k > 0) paintLabel(canvas, '${(k / 10).toStringAsFixed(1)} m', Offset(rx + 16 * s, y), small, align: Alignment.centerLeft);
    }

    // String and bob.
    final bob = pivot + Offset(math.sin(sim.theta), math.cos(sim.theta)) * len;
    canvas.drawLine(pivot, bob, Paint()
      ..color = pal.ink
      ..strokeWidth = 2 * s);
    canvas.drawCircle(pivot, 4 * s, Paint()..color = pal.ink);
    final r = 18 * s;
    canvas.drawCircle(
      bob,
      r,
      Paint()
        ..shader = RadialGradient(center: const Alignment(-0.4, -0.4), colors: [pal.amber.withValues(alpha: 1), Color.lerp(pal.amber, Colors.black, 0.45)!])
            .createShader(Rect.fromCircle(center: bob, radius: r)),
    );

    // Angle label.
    final deg = sim.theta * 180 / math.pi;
    paintLabel(canvas, 'θ = ${deg.toStringAsFixed(1)}°', pivot + Offset(14 * s, 24 * s), text, align: Alignment.centerLeft);
    paintLabel(canvas, 'L = ${sim.length.toStringAsFixed(2)} m', pivot + Offset(math.sin(sim.theta), math.cos(sim.theta)) * len * 0.5 + Offset(12 * s, 0), small, align: Alignment.centerLeft);
    paintLabel(canvas, 'Mean position', Offset(pivot.dx, math.min(h - 6 * s, pivot.dy + len + 34 * s)), small, align: Alignment.bottomCenter);

    // Stopwatch.
    final c = Offset(w - 58 * s, h - 62 * s);
    final rad = 40 * s;
    canvas.drawCircle(c, rad, Paint()..color = pal.surface);
    canvas.drawCircle(c, rad, Paint()
      ..color = sim.stopwatchRunning ? pal.red : pal.muted
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3 * s);
    final secs = sim.stopwatchTime;
    final hand = secs / 60 * 2 * math.pi;
    canvas.drawLine(c, c + Offset(math.sin(hand), -math.cos(hand)) * rad * 0.8, Paint()
      ..color = pal.red
      ..strokeWidth = 2.4 * s
      ..strokeCap = StrokeCap.round);
    paintLabel(canvas, '${secs.toStringAsFixed(2)} s', c + Offset(0, rad * 0.42), text.copyWith(fontSize: 13 * s));
  }

  @override
  bool shouldRepaint(_PendulumPainter old) => old.sim != sim || old.amplitude != amplitude || old.pal.ink != pal.ink;
}
