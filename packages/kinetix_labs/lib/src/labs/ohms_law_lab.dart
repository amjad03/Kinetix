import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../lab_scaffold.dart';
import '../models/circuit.dart';

String _fmt(double v, [int d = 2]) {
  final s = v.toStringAsFixed(d);
  return s.startsWith('-0.') && double.parse(s) == 0 ? s.substring(1) : s;
}

/// Ohm's law: a cell, plug key, ammeter, voltmeter and 1–3 resistors in series or parallel.
class OhmsLawLab extends StatefulWidget {
  const OhmsLawLab({super.key, this.preset});

  /// 'series' or 'parallel' opens with three resistors connected that way.
  final String? preset;

  @override
  State<OhmsLawLab> createState() => _OhmsLawLabState();
}

class _OhmsLawLabState extends State<OhmsLawLab> with SingleTickerProviderStateMixin {
  late Circuit _circuit;
  int _count = 1;
  final _all = <double>[5, 10, 15];
  final _points = <double, double>{}; // V -> I
  late final Ticker _ticker;
  final _phase = ValueNotifier<double>(0);
  Duration _last = Duration.zero;

  @override
  void initState() {
    super.initState();
    _reset();
    _ticker = createTicker((elapsed) {
      final dt = _last == Duration.zero ? 0.0 : (elapsed - _last).inMicroseconds / 1e6;
      _last = elapsed;
      _phase.value += math.min(dt, 0.1);
    });
    _syncTicker();
  }

  void _reset() {
    _all.setAll(0, [5, 10, 15]);
    final p = widget.preset;
    _count = p == 'series' || p == 'parallel' ? 3 : 1;
    _circuit = Circuit(
      voltage: 3,
      resistors: _all.sublist(0, _count),
      arrangement: p == 'parallel' ? Arrangement.parallel : Arrangement.series,
    );
    _points.clear();
    _record();
  }

  void _record() {
    if (_circuit.keyClosed) _points[_circuit.voltage] = _circuit.current;
  }

  void _set(Circuit c, {bool clearGraph = false}) {
    setState(() {
      _circuit = c;
      if (clearGraph) _points.clear();
      _record();
    });
    _syncTicker();
  }

  void _syncTicker() {
    final run = _circuit.current > 0;
    if (run && !_ticker.isActive) {
      _last = Duration.zero;
      _ticker.start();
    } else if (!run && _ticker.isActive) {
      _ticker.stop();
    }
  }

  @override
  void dispose() {
    _ticker.dispose();
    _phase.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = _circuit;
    final pal = LabPalette(context);
    return LabScaffold(
      title: "Ohm's law",
      subtitle: 'CBSE Class 10 Science · Electricity',
      formula: 'V = IR   ·   Series: R = R1 + R2 + R3   ·   Parallel: 1/R = 1/R1 + 1/R2 + 1/R3',
      aim: 'To find how the current through a resistor depends on the potential difference across it, and to find '
          'the equivalent resistance of resistors in series and in parallel.',
      observe: const [
        'Double the voltage: the ammeter reading doubles. The V–I graph is a straight line through the origin.',
        'The slope of the V–I graph is 1/R: a larger resistance gives a flatter line.',
        'In series the same current flows through every resistor; in parallel each resistor has the full voltage.',
        'Resistors in parallel give a smaller total resistance than the smallest one.',
      ],
      onReset: () {
        setState(_reset);
        _syncTicker();
      },
      simulation: RepaintBoundary(
        child: CustomPaint(painter: _CircuitPainter(c, _phase, pal), size: Size.infinite),
      ),
      belowSimulation: CustomPaint(painter: _ViGraphPainter(_points, c, pal), size: Size.infinite),
      readouts: [
        Readout('Ammeter (current I)', _fmt(c.current, 3), unit: 'A', highlight: true, key: const ValueKey('readout-current')),
        Readout('Voltmeter (V)', _fmt(c.voltmeterReading, 1), unit: 'V'),
        Readout('Equivalent resistance', _fmt(c.equivalentResistance), unit: 'Ω', key: const ValueKey('readout-req')),
        Readout('Power P = VI', _fmt(c.power), unit: 'W'),
      ],
      controls: [
        LabSliderRow(
          key: const ValueKey('slider-voltage'),
          label: 'Battery voltage',
          value: c.voltage,
          min: 0,
          max: 12,
          divisions: 24,
          unit: 'V',
          onChanged: (v) => _set(c.copyWith(voltage: v)),
        ),
        const LabSectionLabel('Resistors'),
        Wrap(
          spacing: Kx.s8,
          runSpacing: Kx.s8,
          children: [
            SegmentedButton<int>(
              showSelectedIcon: false,
              segments: const [ButtonSegment(value: 1, label: Text('1')), ButtonSegment(value: 2, label: Text('2')), ButtonSegment(value: 3, label: Text('3'))],
              selected: {_count},
              onSelectionChanged: (s) {
                _count = s.first;
                _set(c.copyWith(resistors: _all.sublist(0, _count)), clearGraph: true);
              },
            ),
            SegmentedButton<Arrangement>(
              showSelectedIcon: false,
              segments: const [
                ButtonSegment(value: Arrangement.series, label: Text('Series')),
                ButtonSegment(value: Arrangement.parallel, label: Text('Parallel')),
              ],
              selected: {c.arrangement},
              onSelectionChanged: _count == 1 ? null : (s) => _set(c.copyWith(arrangement: s.first), clearGraph: true),
            ),
          ],
        ),
        const SizedBox(height: Kx.s8),
        for (var i = 0; i < _count; i++)
          LabSliderRow(
            key: ValueKey('slider-r$i'),
            label: 'R${i + 1}',
            value: _all[i],
            min: 1,
            max: 20,
            divisions: 19,
            unit: 'Ω',
            format: (v) => v.toStringAsFixed(0),
            onChanged: (v) {
              _all[i] = v;
              _set(c.copyWith(resistors: _all.sublist(0, _count)), clearGraph: true);
            },
          ),
        Row(
          children: [
            Expanded(child: Text('Plug key closed', style: context.text.bodyLarge)),
            Switch(key: const ValueKey('key-switch'), value: c.keyClosed, onChanged: (v) => _set(c.copyWith(keyClosed: v))),
          ],
        ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(onPressed: () => setState(() => _points.clear()), icon: const Icon(Icons.delete_sweep_outlined), label: const Text('Clear graph')),
        ),
      ],
    );
  }
}

class _CircuitPainter extends CustomPainter {
  _CircuitPainter(this.c, this.phase, this.pal) : super(repaint: phase);
  final Circuit c;
  final ValueNotifier<double> phase;
  final LabPalette pal;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final s = (math.min(w / 640, h / 380)).clamp(0.85, 1.8);
    final text = pal.textStyle.copyWith(fontSize: 14 * s, color: pal.ink, fontWeight: FontWeight.w600);
    final small = pal.textStyle.copyWith(fontSize: 12.5 * s, color: pal.muted);
    final wire = Paint()
      ..color = pal.ink
      ..strokeWidth = 2.6 * s
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    final n = c.resistors.length;
    final parallel = c.arrangement == Arrangement.parallel && n > 1;
    final gap = h * 0.17;
    final blockHalf = parallel ? (n - 1) / 2 * gap : 0.0;
    final x0 = w * 0.1, x1 = w * 0.9;
    final y0 = math.max(h * 0.4, blockHalf + h * 0.27);
    final y1 = math.min(h * 0.88, y0 + blockHalf + h * 0.36);
    final xa = w * 0.3, xb = w * 0.7;

    // Main loop wires (leaving gaps for the battery, ammeter and key).
    final batY = (y0 + y1) / 2;
    final ammX = w * 0.38, keyX = w * 0.66;
    final rr = 17.0 * s;
    final path = Path()
      ..moveTo(xb, y0)
      ..lineTo(x1, y0)
      ..lineTo(x1, y1)
      ..lineTo(keyX + 14 * s, y1)
      ..moveTo(keyX - 14 * s, y1)
      ..lineTo(ammX + rr, y1)
      ..moveTo(ammX - rr, y1)
      ..lineTo(x0, y1)
      ..lineTo(x0, batY + 14 * s)
      ..moveTo(x0, batY - 14 * s)
      ..lineTo(x0, y0)
      ..lineTo(xa, y0);
    canvas.drawPath(path, wire);

    // Battery: two cells, long plate = +.
    final cell = Paint()
      ..color = pal.ink
      ..strokeCap = StrokeCap.butt;
    for (final dy in [-12.0 * s, 2.0 * s]) {
      canvas.drawLine(Offset(x0 - 16 * s, batY + dy), Offset(x0 + 16 * s, batY + dy), cell..strokeWidth = 2.4 * s);
      canvas.drawLine(Offset(x0 - 8 * s, batY + dy + 7 * s), Offset(x0 + 8 * s, batY + dy + 7 * s), cell..strokeWidth = 5 * s);
    }
    paintLabel(canvas, '+', Offset(x0 - 26 * s, batY - 16 * s), text);
    paintLabel(canvas, '${c.voltage.toStringAsFixed(1)} V', Offset(x0 + 24 * s, batY), text, align: Alignment.centerLeft);

    // Plug key.
    final keyPaint = Paint()..color = pal.ink;
    canvas.drawCircle(Offset(keyX - 14 * s, y1), 4.5 * s, keyPaint);
    canvas.drawCircle(Offset(keyX + 14 * s, y1), 4.5 * s, keyPaint);
    if (c.keyClosed) {
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(keyX, y1 - 6 * s), width: 34 * s, height: 10 * s), Radius.circular(3 * s)), Paint()..color = pal.amber);
    }
    paintLabel(canvas, c.keyClosed ? 'Key (closed)' : 'Key (open)', Offset(keyX, y1 + 12 * s), small, align: Alignment.topCenter);

    // Resistor block.
    if (!parallel) {
      final seg = (xb - xa) / n;
      for (var i = 0; i < n; i++) {
        final a = xa + seg * i, b = a + seg;
        _resistor(canvas, Offset(a, y0), Offset(b, y0), wire, s);
        paintLabel(canvas, 'R${i + 1} = ${c.resistors[i].toStringAsFixed(0)} Ω', Offset((a + b) / 2, y0 - 16 * s), text, align: Alignment.bottomCenter);
        if (n > 1) paintLabel(canvas, '${_fmt(c.resistorVoltages[i])} V', Offset((a + b) / 2, y0 + 16 * s), small, align: Alignment.topCenter);
      }
    } else {
      final top = y0 - blockHalf, bottom = y0 + blockHalf;
      canvas.drawLine(Offset(xa, top), Offset(xa, bottom), wire);
      canvas.drawLine(Offset(xb, top), Offset(xb, bottom), wire);
      for (var i = 0; i < n; i++) {
        final y = top + gap * i;
        final m1 = xa + (xb - xa) * 0.25, m2 = xa + (xb - xa) * 0.75;
        canvas.drawLine(Offset(xa, y), Offset(m1, y), wire);
        canvas.drawLine(Offset(m2, y), Offset(xb, y), wire);
        _resistor(canvas, Offset(m1, y), Offset(m2, y), wire, s);
        paintLabel(canvas, 'R${i + 1} = ${c.resistors[i].toStringAsFixed(0)} Ω', Offset((xa + xb) / 2, y - 14 * s), text, align: Alignment.bottomCenter);
        paintLabel(canvas, '${_fmt(c.resistorCurrents[i], 3)} A', Offset(xb + 8 * s, y - 4 * s), small, align: Alignment.bottomLeft);
      }
      canvas.drawCircle(Offset(xa, y0), 4 * s, keyPaint);
      canvas.drawCircle(Offset(xb, y0), 4 * s, keyPaint);
    }

    // Moving charges (conventional current direction), speed proportional to current.
    if (c.current > 0) {
      final dot = Paint()..color = pal.amber;
      const pxPerAmp = 160.0;
      final t = phase.value;
      final main = Path()
        ..moveTo(xb, y0)
        ..lineTo(x1, y0)
        ..lineTo(x1, y1)
        ..lineTo(x0, y1)
        ..lineTo(x0, y0)
        ..lineTo(xa, y0);
      canvas.save();
      canvas.clipPath(Path()..addRect(Offset.zero & size)..addRect(Rect.fromCenter(center: Offset(x0, batY), width: 40 * s, height: 30 * s))..fillType = PathFillType.evenOdd);
      _dots(canvas, main, t * math.min(c.current * pxPerAmp, 420) * s, dot, s);
      canvas.restore();
      for (final (a, b, i) in _blockPaths(xa, xb, y0, blockHalf, gap, parallel)) {
        _dots(canvas, Path()..moveTo(a.dx, a.dy)..lineTo(b.dx, b.dy), t * math.min(i * pxPerAmp, 420) * s, dot, s);
      }
    }

    // Ammeter.
    _meter(canvas, Offset(ammX, y1), rr, 'A', '${_fmt(c.current, 3)} A', text, small, s, below: true);

    // Voltmeter across the combination.
    final vy = math.max(rr + 26 * s, y0 - blockHalf - h * 0.17);
    final thin = Paint()
      ..color = pal.muted
      ..strokeWidth = 1.8 * s
      ..style = PaintingStyle.stroke;
    final vx = (xa + xb) / 2;
    canvas.drawPath(
      Path()
        ..moveTo(xa - 10 * s, y0)
        ..lineTo(xa - 10 * s, vy)
        ..lineTo(vx - rr, vy)
        ..moveTo(vx + rr, vy)
        ..lineTo(xb + 10 * s, vy)
        ..lineTo(xb + 10 * s, y0),
      thin,
    );
    _meter(canvas, Offset(vx, vy), rr, 'V', '${_fmt(c.voltmeterReading, 1)} V', text, small, s, below: false);

  }

  List<(Offset, Offset, double)> _blockPaths(double xa, double xb, double y0, double blockHalf, double gap, bool parallel) {
    if (!parallel) return [(Offset(xa, y0), Offset(xb, y0), c.current)];
    return [
      for (var i = 0; i < c.resistors.length; i++) (Offset(xa, y0 - blockHalf + gap * i), Offset(xb, y0 - blockHalf + gap * i), c.resistorCurrents[i]),
    ];
  }

  void _dots(Canvas canvas, Path p, double offset, Paint paint, double s) {
    final spacing = 30.0 * s;
    for (final m in p.computeMetrics()) {
      var d = offset % spacing;
      while (d < m.length) {
        final pos = m.getTangentForOffset(d)?.position;
        if (pos != null) canvas.drawCircle(pos, 3.6 * s, paint);
        d += spacing;
      }
    }
  }

  void _resistor(Canvas canvas, Offset a, Offset b, Paint wire, double s) {
    final len = b.dx - a.dx;
    final zl = math.min(len * 0.7, 90 * s);
    final za = a.dx + (len - zl) / 2, zb = za + zl;
    final p = Path()
      ..moveTo(a.dx, a.dy)
      ..lineTo(za, a.dy);
    const teeth = 6;
    for (var i = 0; i < teeth; i++) {
      final x = za + zl * (i + 0.5) / teeth;
      p.lineTo(x, a.dy + (i.isEven ? -8 : 8) * s);
    }
    p
      ..lineTo(zb, a.dy)
      ..lineTo(b.dx, b.dy);
    canvas.drawPath(p, wire);
  }

  void _meter(Canvas canvas, Offset c, double r, String letter, String reading, TextStyle text, TextStyle small, double s, {required bool below}) {
    canvas.drawCircle(c, r, Paint()..color = pal.surface);
    canvas.drawCircle(
      c,
      r,
      Paint()
        ..color = pal.ink
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.4 * s,
    );
    paintLabel(canvas, letter, c, text.copyWith(fontWeight: FontWeight.w800));
    paintLabel(canvas, reading, c + Offset(0, below ? r + 6 * s : -r - 6 * s), text.copyWith(color: pal.blue), align: below ? Alignment.topCenter : Alignment.bottomCenter);
  }

  @override
  bool shouldRepaint(_CircuitPainter old) => old.c != c || old.pal.ink != pal.ink;
}

class _ViGraphPainter extends CustomPainter {
  _ViGraphPainter(Map<double, double> points, this.c, this.pal) : points = Map.of(points);
  final Map<double, double> points;
  final Circuit c;
  final LabPalette pal;

  @override
  void paint(Canvas canvas, Size size) {
    final s = (math.min(size.width / 640, size.height / 260)).clamp(0.85, 1.6);
    final style = pal.textStyle.copyWith(fontSize: 12.5 * s, color: pal.muted);
    final title = pal.textStyle.copyWith(fontSize: 14 * s, color: pal.ink, fontWeight: FontWeight.w700);
    final l = 62.0 * s, r = 24.0 * s, t = 30.0 * s, b = 40.0 * s;
    final plot = Rect.fromLTRB(l, t, size.width - r, size.height - b);
    if (plot.width < 40 || plot.height < 40) return;
    const vMax = 12.0;
    final iMaxRaw = math.max(vMax / c.equivalentResistance, points.values.fold(0.0, math.max));
    final iMax = _nice(iMaxRaw);
    Offset at(double v, double i) => Offset(plot.left + v / vMax * plot.width, plot.bottom - i / iMax * plot.height);

    final grid = Paint()
      ..color = pal.grid
      ..strokeWidth = 1;
    for (var k = 0; k <= 6; k++) {
      final v = vMax * k / 6;
      canvas.drawLine(at(v, 0), at(v, iMax), grid);
      paintLabel(canvas, v.toStringAsFixed(0), at(v, 0) + Offset(0, 6 * s), style, align: Alignment.topCenter);
    }
    for (var k = 0; k <= 5; k++) {
      final i = iMax * k / 5;
      canvas.drawLine(at(0, i), at(vMax, i), grid);
      paintLabel(canvas, i.toStringAsFixed(iMax < 1 ? 2 : 1), at(0, i) - Offset(6 * s, 0), style, align: Alignment.centerRight);
    }
    final axis = Paint()
      ..color = pal.ink
      ..strokeWidth = 1.8 * s;
    canvas.drawLine(plot.bottomLeft, plot.bottomRight, axis);
    canvas.drawLine(plot.bottomLeft, plot.topLeft, axis);
    paintLabel(canvas, 'V (volt) →', Offset(plot.right, plot.bottom + 22 * s), style, align: Alignment.topRight);
    paintLabel(canvas, 'V–I graph   (slope = 1/R = ${_fmt(1 / c.equivalentResistance, 3)} A/V)', Offset(plot.left, 6 * s), title, align: Alignment.topLeft);
    paintLabel(canvas, 'I (A)', Offset(8 * s, t - 4 * s), style, align: Alignment.bottomLeft);

    // Expected line I = V/R.
    final line = Paint()
      ..color = pal.blue.withValues(alpha: 0.6)
      ..strokeWidth = 2 * s;
    canvas.drawLine(at(0, 0), at(vMax, vMax / c.equivalentResistance), line);

    final dot = Paint()..color = pal.red;
    final pts = points.entries.toList()..sort((a, b) => a.key.compareTo(b.key));
    canvas.drawPoints(ui.PointMode.points, [for (final e in pts) at(e.key, e.value)], dot..strokeWidth = 9 * s..strokeCap = StrokeCap.round);
    if (c.keyClosed) {
      final cur = at(c.voltage, c.current);
      canvas.drawCircle(cur, 8 * s, Paint()..color = pal.red.withValues(alpha: 0.25));
    }
  }

  static double _nice(double v) {
    if (v <= 0) return 1;
    final e = math.pow(10, (math.log(v) / math.ln10).floor()).toDouble();
    for (final m in [1.0, 2.0, 2.5, 5.0, 10.0]) {
      if (v <= m * e) return m * e;
    }
    return 10 * e;
  }

  @override
  bool shouldRepaint(_ViGraphPainter old) => true;
}
