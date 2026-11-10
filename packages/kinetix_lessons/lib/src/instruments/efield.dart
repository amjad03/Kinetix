import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'design.dart';

/// Electric field and charges (2nd PUC Physics, ch. 1): draggable point charges, field lines
/// traced from each charge, equipotentials, and a test charge with its Coulomb force.
///
/// Preset: {"charges":[{"q":2,"x":-5,"y":0},...] (µC, cm), "test":{"x":0,"y":5,"q":1} (nC),
/// "equipotentials":true, "lines":16}.
class EFieldInstrument extends StatefulWidget {
  const EFieldInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<EFieldInstrument> createState() => _EFieldState();
}

class Charge {
  Charge(this.q, this.p);
  double q; // µC
  Offset p; // cm
}

const _k = 8.9875e9;

class _EFieldState extends State<EFieldInstrument> {
  late List<Charge> charges;
  Offset test = const Offset(0, 5);
  double testQ = 1; // nC
  bool equip = true;
  int lines = 16;
  int? _drag; // index, -1 = test charge
  int? preset;

  static final _presets = <String, Map<String, dynamic>>{
    'Dipole': {'charges': [{'q': 2, 'x': -5, 'y': 0}, {'q': -2, 'x': 5, 'y': 0}], 'test': {'x': 0, 'y': 5}},
    'Like charges': {'charges': [{'q': 2, 'x': -5, 'y': 0}, {'q': 2, 'x': 5, 'y': 0}], 'test': {'x': 0, 'y': 4}},
    'Single charge': {'charges': [{'q': 3, 'x': 0, 'y': 0}], 'test': {'x': 6, 'y': 3}},
    'Unequal (+4, −1)': {'charges': [{'q': 4, 'x': -4, 'y': 0}, {'q': -1, 'x': 5, 'y': 0}], 'test': {'x': 9, 'y': 0}},
  };

  @override
  void initState() {
    super.initState();
    _apply(widget.preset.isEmpty ? _presets['Dipole']! : widget.preset);
    if (widget.preset.isEmpty) preset = 0;
  }

  void _apply(Map<String, dynamic> p) {
    double d(Object? v, double f) => (v as num?)?.toDouble() ?? f;
    charges = [for (final c in (p['charges'] as List? ?? const [])) Charge(d((c as Map)['q'], 1), Offset(d(c['x'], 0), d(c['y'], 0)))];
    final t = p['test'] as Map?;
    test = Offset(d(t?['x'], 0), d(t?['y'], 5));
    testQ = d(t?['q'], 1);
    equip = p['equipotentials'] as bool? ?? true;
    lines = (p['lines'] as num?)?.toInt() ?? 16;
  }

  Offset field(Offset at) {
    var e = Offset.zero;
    for (final c in charges) {
      final r = (at - c.p) / 100; // m
      final d = r.distance;
      if (d < 1e-4) continue;
      e += r / d * (_k * c.q * 1e-6 / (d * d));
    }
    return e; // N/C, y up
  }

  double potential(Offset at) {
    var v = 0.0;
    for (final c in charges) {
      final d = math.max((at - c.p).distance / 100, 0.004);
      v += _k * c.q * 1e-6 / d;
    }
    return v;
  }

  @override
  Widget build(BuildContext context) {
    final e = field(test);
    final f = e * (testQ * 1e-9);
    final v = potential(test);
    final angle = math.atan2(e.dy, e.dx) * 180 / math.pi;
    return InstrumentFrame(
      id: 'efield',
      subtitle: '2nd PUC Physics · Electric charges and fields',
      title: 'Electric field of point charges',
      formula: 'F = kq₁q₂ / r²',
      state: {'charges': [for (final c in charges) {'q': c.q, 'x': c.p.dx, 'y': c.p.dy}], 'test': {'x': test.dx, 'y': test.dy, 'q': testQ}},
      readouts: [
        Readout('Field |E|', sci(e.distance), 'N/C', IX.accent),
        Readout('Direction', '${angle.toStringAsFixed(0)}°', 'from +x'),
        Readout('Force on q₀', sci(f.distance), 'N', IX.green),
        Readout('Potential V', sci(v), 'V'),
      ],
      controls: [
        for (var i = 0; i < charges.length; i++)
          IxSlider(label: 'Charge q${i + 1}', value: charges[i].q, min: -5, max: 5, divisions: 20, unit: 'µC', format: (x) => '${x > 0 ? '+' : ''}${x.toStringAsFixed(1)}', onChanged: (x) => setState(() { charges[i].q = x.abs() < 0.1 ? 0.5 : x; preset = null; })),
        IxSlider(label: 'Test charge q₀', value: testQ, min: 0.5, max: 5, divisions: 9, unit: 'nC', onChanged: (x) => setState(() => testQ = x)),
        IxSegments<bool>(label: 'Equipotentials', options: const {true: 'Shown', false: 'Hidden'}, value: equip, onChanged: (x) => setState(() => equip = x)),
      ],
      presets: [
        for (final (i, e) in _presets.entries.indexed) Preset(e.key, () => setState(() { _apply(e.value); preset = i; })),
      ],
      activePreset: preset,
      stage: LayoutBuilder(builder: (context, box) {
        final size = box.biggest;
        final scale = size.width / 30; // px per cm: 30 cm across
        final origin = size.center(Offset.zero);
        Offset toPx(Offset cm) => origin + Offset(cm.dx, -cm.dy) * scale;
        Offset toCm(Offset px) => Offset((px - origin).dx, -(px - origin).dy) / scale;
        return GestureDetector(
          onPanStart: (d) {
            final p = d.localPosition;
            if ((toPx(test) - p).distance < 60) {
              _drag = -1;
            } else {
              int? best;
              var bd = 70.0;
              for (var i = 0; i < charges.length; i++) {
                final dd = (toPx(charges[i].p) - p).distance;
                if (dd < bd) { bd = dd; best = i; }
              }
              _drag = best;
            }
            setState(() {});
          },
          onPanUpdate: (d) {
            if (_drag == null) return;
            final cm = toCm(d.localPosition);
            final c = Offset(cm.dx.clamp(-14, 14), cm.dy.clamp(-size.height / scale / 2 + 1, size.height / scale / 2 - 1));
            setState(() {
              if (_drag == -1) { test = c; } else { charges[_drag!].p = c; preset = null; }
            });
          },
          onPanEnd: (_) => setState(() => _drag = null),
          child: CustomPaint(size: size, painter: _EFieldPainter(this, scale, origin)),
        );
      }),
    );
  }
}

class _EFieldPainter extends CustomPainter {
  _EFieldPainter(this.s, this.scale, this.origin);
  final _EFieldState s;
  final double scale;
  final Offset origin;

  Offset px(Offset cm) => origin + Offset(cm.dx, -cm.dy) * scale;

  @override
  void paint(Canvas c, Size size) {
    IxPaint.grid(c, size, step: scale);
    // Axis ticks: 1 cm grid, labelled every 5 cm along the bottom.
    for (var x = -15; x <= 15; x += 5) {
      IxPaint.label(c, '$x', Offset(px(Offset(x.toDouble(), 0)).dx, size.height - 22), size: 14, color: IX.muted);
    }
    IxPaint.label(c, 'cm', Offset(size.width - 28, size.height - 22), size: 14, color: IX.muted);

    if (s.equip) _equipotentials(c, size);
    _fieldLines(c, size);

    // Charges: shaded spheres with a sign and the value beside.
    for (final (i, q) in s.charges.indexed) {
      final p = px(q.p);
      final col = q.q >= 0 ? IX.positive : IX.negative;
      final r = 22 + 4 * q.q.abs();
      IxPaint.handle(c, p, col, r: r, active: s._drag == i);
      final sp = Paint()..color = Colors.white..strokeWidth = 4..strokeCap = StrokeCap.round;
      c.drawLine(p - const Offset(9, 0), p + const Offset(9, 0), sp);
      if (q.q >= 0) c.drawLine(p - const Offset(0, 9), p + const Offset(0, 9), sp);
      IxPaint.label(c, 'q${i + 1} = ${q.q > 0 ? '+' : '−'}${q.q.abs().toStringAsFixed(1)} µC', p + Offset(0, r + 22), size: 18, color: col, w: FontWeight.w600, halo: true);
    }

    // Test charge and force vector (log-scaled length so it stays readable).
    final tp = px(s.test);
    final e = s.field(s.test);
    if (e.distance > 0) {
      final len = (60 + 22 * math.log(1 + e.distance / 1e4)).clamp(40.0, 220.0);
      final dir = Offset(e.dx, -e.dy) / e.distance;
      IxPaint.arrow(c, tp + dir * 20, tp + dir * (20 + len), IX.green, width: 5, head: 22);
      IxPaint.label(c, 'F', tp + dir * (len + 46), size: 24, color: IX.green, w: FontWeight.w600, halo: true);
    }
    IxPaint.handle(c, tp, const Color(0xFF6B7280), r: 16, active: s._drag == -1);
    IxPaint.label(c, 'q₀', tp + const Offset(0, -34), size: 18, color: IX.ink, w: FontWeight.w600, halo: true);
  }

  void _fieldLines(Canvas c, Size size) {
    final linePaint = Paint()..color = IX.ink.withValues(alpha: 0.55)..strokeWidth = 2..style = PaintingStyle.stroke..strokeCap = StrokeCap.round;
    final total = s.charges.fold<double>(0, (a, q) => a + q.q.abs());
    final sources = s.charges.where((q) => q.q > 0).toList();
    final fromNeg = sources.isEmpty;
    for (final q in fromNeg ? s.charges : sources) {
      final n = math.max(6, (s.lines * 2 * q.q.abs() / math.max(total, 0.1)).round());
      for (var k = 0; k < n; k++) {
        final a = 2 * math.pi * (k + 0.5) / n;
        var p = q.p + Offset(math.cos(a), math.sin(a)) * 0.8;
        final path = Path()..moveTo(px(p).dx, px(p).dy);
        final pts = <Offset>[px(p)];
        for (var step = 0; step < 900; step++) {
          Offset dir(Offset at) {
            final f = s.field(at);
            final d = f.distance;
            return d == 0 ? Offset.zero : f / d * (fromNeg ? -1 : 1);
          }
          const h = 0.12;
          final k1 = dir(p), k2 = dir(p + k1 * h / 2), k3 = dir(p + k2 * h / 2), k4 = dir(p + k3 * h);
          p += (k1 + k2 * 2 + k3 * 2 + k4) * (h / 6);
          final pp = px(p);
          if (pp.dx < -20 || pp.dy < -20 || pp.dx > size.width + 20 || pp.dy > size.height + 20) break;
          if (s.charges.any((o) => !identical(o, q) && (o.p - p).distance < 0.7)) break;
          path.lineTo(pp.dx, pp.dy);
          pts.add(pp);
        }
        c.drawPath(path, linePaint);
        // A small arrowhead mid-line shows the field direction.
        if (pts.length > 30) {
          final m = pts.length ~/ 3;
          var a0 = pts[m - 2], a1 = pts[m + 2];
          if (fromNeg) (a0, a1) = (a1, a0);
          _chevron(c, pts[m], a1 - a0);
        }
      }
    }
  }

  void _chevron(Canvas c, Offset at, Offset d) {
    if (d.distance == 0) return;
    final u = d / d.distance, n = Offset(-u.dy, u.dx);
    final path = Path()
      ..moveTo((at + u * 8).dx, (at + u * 8).dy)
      ..lineTo((at - u * 6 + n * 7).dx, (at - u * 6 + n * 7).dy)
      ..lineTo((at - u * 6 - n * 7).dx, (at - u * 6 - n * 7).dy)
      ..close();
    c.drawPath(path, Paint()..color = IX.ink.withValues(alpha: 0.7));
  }

  void _equipotentials(Canvas c, Size size) {
    const cell = 8.0;
    final nx = (size.width / cell).ceil() + 1, ny = (size.height / cell).ceil() + 1;
    final v = List.generate(ny, (j) => List.generate(nx, (i) {
      final cm = Offset((i * cell - origin.dx) / scale, -(j * cell - origin.dy) / scale);
      return s.potential(cm);
    }));
    final vmax = s.charges.fold<double>(0, (a, q) => math.max(a, _k * q.q.abs() * 1e-6 / 0.02));
    final levels = <double>[];
    for (final f in [0.04, 0.08, 0.16, 0.32, 0.6]) {
      levels..add(vmax * f)..add(-vmax * f);
    }
    if (s.charges.any((q) => q.q > 0) && s.charges.any((q) => q.q < 0)) levels.add(0);
    for (final lv in levels) {
      final col = lv > 0 ? IX.positive : (lv < 0 ? IX.negative : IX.muted);
      final p = Paint()..color = col.withValues(alpha: 0.45)..strokeWidth = 1.6..style = PaintingStyle.stroke;
      final path = Path();
      for (var j = 0; j < ny - 1; j++) {
        for (var i = 0; i < nx - 1; i++) {
          final a = v[j][i], b = v[j][i + 1], cc = v[j + 1][i + 1], d = v[j + 1][i];
          final pts = <Offset>[];
          void edge(double v0, double v1, Offset p0, Offset p1) {
            if ((v0 - lv) * (v1 - lv) < 0) pts.add(Offset.lerp(p0, p1, (lv - v0) / (v1 - v0))!);
          }
          final x = i * cell, y = j * cell;
          edge(a, b, Offset(x, y), Offset(x + cell, y));
          edge(b, cc, Offset(x + cell, y), Offset(x + cell, y + cell));
          edge(cc, d, Offset(x + cell, y + cell), Offset(x, y + cell));
          edge(d, a, Offset(x, y + cell), Offset(x, y));
          if (pts.length >= 2) path..moveTo(pts[0].dx, pts[0].dy)..lineTo(pts[1].dx, pts[1].dy);
          if (pts.length == 4) path..moveTo(pts[2].dx, pts[2].dy)..lineTo(pts[3].dx, pts[3].dy);
        }
      }
      c.drawPath(path, p);
    }
    // Soft potential wash near the charges.
    for (final q in s.charges) {
      final p = px(q.p);
      final col = q.q >= 0 ? IX.positive : IX.negative;
      c.drawCircle(p, 140, Paint()..shader = ui.Gradient.radial(p, 140, [col.withValues(alpha: 0.10), col.withValues(alpha: 0)]));
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
