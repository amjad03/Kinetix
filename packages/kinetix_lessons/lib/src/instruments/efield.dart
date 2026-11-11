import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'design.dart';

/// Electric field and charges (2nd PUC Physics, ch. 1): draggable point charges, field lines
/// traced from each charge, equipotentials, and a test charge with its Coulomb force.
///
/// Preset: {"charges":[{"q":2,"x":-5,"y":0},...] (µC, cm), "test":{"x":0,"y":5,"q":1} (nC),
/// "equipotentials":true, "lines":16, "gauss":{"x":0,"y":0,"r":4} (a Gaussian surface, cm)}.
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
  int? _drag; // index, -1 = test charge, -2 = Gaussian surface
  Offset? gauss; // centre of the Gaussian surface (cm), if shown
  double gaussR = 4;

  /// Charge enclosed by the Gaussian surface (µC).
  double get enclosed => gauss == null ? 0 : charges.where((c) => (c.p - gauss!).distance < gaussR).fold(0.0, (a, c) => a + c.q);
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
    final g = p['gauss'] as Map?;
    gauss = g == null ? null : Offset(d(g['x'], 0), d(g['y'], 0));
    gaussR = d(g?['r'], 4);
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
        if (gauss == null) Readout('Direction', '${angle.toStringAsFixed(0)}°', 'from +x')
        else Readout('Flux Φ = q/ε₀', sci(enclosed * 1e-6 / 8.854e-12), 'N m²/C', IX.amber),
        if (gauss != null) Readout('Charge enclosed', '${enclosed > 0 ? '+' : (enclosed < 0 ? '−' : '')}${enclosed.abs().toStringAsFixed(1)}', 'µC', IX.amber),
        Readout('Force on q₀', sci(f.distance), 'N', IX.green),
        Readout('Potential V', sci(v), 'V'),
      ],
      controls: [
        for (var i = 0; i < charges.length; i++)
          IxSlider(label: 'Charge q${i + 1}', value: charges[i].q, min: -5, max: 5, divisions: 20, unit: 'µC', format: (x) => '${x > 0 ? '+' : ''}${x.toStringAsFixed(1)}', onChanged: (x) => setState(() { charges[i].q = x.abs() < 0.1 ? 0.5 : x; preset = null; })),
        if (gauss != null) IxSlider(label: 'Gaussian surface radius', value: gaussR, min: 1, max: 12, unit: 'cm', onChanged: (x) => setState(() => gaussR = x)),
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
              if (best == null && gauss != null && ((toPx(gauss!) - p).distance - gaussR * scale).abs() < 50) _drag = -2;
              if (best == null && gauss != null && (toPx(gauss!) - p).distance < 50) _drag = -2;
            }
            setState(() {});
          },
          onPanUpdate: (d) {
            if (_drag == null) return;
            final cm = toCm(d.localPosition);
            final c = Offset(cm.dx.clamp(-14, 14), cm.dy.clamp(-size.height / scale / 2 + 1, size.height / scale / 2 - 1));
            setState(() {
              if (_drag == -1) { test = c; } else if (_drag == -2) { gauss = c; } else { charges[_drag!].p = c; preset = null; }
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
    for (var x = -10; x <= 10; x += 5) {
      IxPaint.label(c, '$x', Offset(px(Offset(x.toDouble(), 0)).dx, size.height - 22), size: 14, color: IX.muted);
    }
    IxPaint.label(c, 'cm', Offset(size.width - 28, size.height - 22), size: 14, color: IX.muted);

    if (s.equip) _equipotentials(c, size);
    _fieldLines(c, size);
    if (s.gauss != null) {
      final g = px(s.gauss!);
      final r = s.gaussR * scale;
      c.drawCircle(g, r, Paint()..color = IX.amber.withValues(alpha: 0.07));
      final dp = Paint()..color = IX.amber..strokeWidth = 3.5..style = PaintingStyle.stroke;
      for (var a = 0.0; a < 2 * math.pi; a += 0.12) {
        c.drawArc(Rect.fromCircle(center: g, radius: r), a, 0.07, false, dp);
      }
      c.drawCircle(g, 6, Paint()..color = IX.amber);
      final q = s.enclosed;
      IxPaint.label(c, 'Gaussian surface · q inside = ${q > 0 ? '+' : (q < 0 ? '−' : '')}${q.abs().toStringAsFixed(1)} µC', g + Offset(0, -r - 22), size: 18, color: IX.amber, w: FontWeight.w600, halo: true);
    }

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

  /// Equipotentials: true contours of the combined potential V(x, y) = Σ kq/r, traced by
  /// marching squares on a 6 px grid, joined into polylines and labelled with their voltage.
  /// A faint warm/cool wash shows the sign and size of V underneath.
  void _equipotentials(Canvas c, Size size) {
    const cell = 6.0;
    final nx = (size.width / cell).ceil() + 1, ny = (size.height / cell).ceil() + 1;
    final grid = Float64List(nx * ny);
    for (var j = 0; j < ny; j++) {
      for (var i = 0; i < nx; i++) {
        grid[j * nx + i] = s.potential(Offset((i * cell - origin.dx) / scale, -(j * cell - origin.dy) / scale));
      }
    }
    double at(int i, int j) => grid[j * nx + i];
    final qmax = s.charges.fold<double>(0, (a, q) => math.max(a, q.q.abs()));
    if (qmax == 0) return;
    // Reference: the potential of the largest charge 10 cm away.
    final v0 = _k * qmax * 1e-6 / 0.10;

    // Potential wash: vertex-coloured triangles on a coarse grid, tanh-compressed.
    const wc = 4;
    final pos = <Offset>[], cols = <Color>[], idx = <int>[];
    final wx = (nx - 1) ~/ wc + 1, wy = (ny - 1) ~/ wc + 1;
    for (var j = 0; j < wy; j++) {
      for (var i = 0; i < wx; i++) {
        final vv = at(math.min(i * wc, nx - 1), math.min(j * wc, ny - 1));
        final t = _tanh(vv / (2.5 * v0));
        pos.add(Offset(i * wc * cell, j * wc * cell));
        cols.add((t >= 0 ? IX.positive : IX.negative).withValues(alpha: 0.13 * t.abs()));
      }
    }
    for (var j = 0; j < wy - 1; j++) {
      for (var i = 0; i < wx - 1; i++) {
        final a = j * wx + i;
        idx.addAll([a, a + 1, a + wx, a + 1, a + wx + 1, a + wx]);
      }
    }
    c.drawVertices(ui.Vertices(ui.VertexMode.triangles, pos, colors: cols, indices: idx), BlendMode.srcOver, Paint());

    // Levels: evenly spaced in V (the textbook convention, so crowding means a strong field),
    // plus V = 0 between unlike charges and the saddle level where like charges' fields cancel.
    double nice(double x) {
      final e = math.pow(10, (math.log(x.abs()) / math.ln10).floor()).toDouble();
      final f = x / e;
      return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * e;
    }
    final levels = <double>{};
    final hasPos = s.charges.any((q) => q.q > 0), hasNeg = s.charges.any((q) => q.q < 0);
    final dv = nice(v0 / 2);
    for (var k = 1; k <= 9; k++) {
      if (hasPos) levels.add(k * dv);
      if (hasNeg) levels.add(-k * dv);
    }
    if (hasPos && hasNeg) levels.add(0);
    if (s.charges.length > 1) {
      // Saddle: the grid point (away from charges) with the weakest field.
      var best = double.infinity;
      Offset? sp;
      for (var j = 4; j < ny - 4; j += 3) {
        for (var i = 4; i < nx - 4; i += 3) {
          final cm = Offset((i * cell - origin.dx) / scale, -(j * cell - origin.dy) / scale);
          if (s.charges.any((q) => (q.p - cm).distance < 1.5)) continue;
          final e = s.field(cm).distance;
          if (e < best) { best = e; sp = cm; }
        }
      }
      if (sp != null && best < 0.02 * _k * qmax * 1e-6 / 0.01) levels.add(s.potential(sp));
    }

    final placed = <Rect>[];
    for (final lv in levels) {
      final chains = _contour(grid, nx, ny, cell, lv);
      if (chains.isEmpty) continue;
      final col = lv > 1e-9 ? IX.positive : (lv < -1e-9 ? IX.negative : IX.inkSoft);
      final p = Paint()..color = col.withValues(alpha: lv == 0 ? 0.75 : 0.55)..strokeWidth = lv == 0 ? 2.4 : 1.8..style = PaintingStyle.stroke..strokeJoin = StrokeJoin.round;
      List<Offset>? longest;
      var longLen = 0.0;
      for (final ch in chains) {
        final path = Path()..moveTo(ch[0].dx, ch[0].dy);
        var len = 0.0;
        for (var i = 1; i < ch.length; i++) {
          path.lineTo(ch[i].dx, ch[i].dy);
          len += (ch[i] - ch[i - 1]).distance;
        }
        c.drawPath(path, p);
        final inside = ch.where((q) => q.dx > 60 && q.dx < size.width - 60 && q.dy > 50 && q.dy < size.height - 60).length;
        if (inside > ch.length * 0.3 && len > longLen) { longLen = len; longest = ch; }
      }
      // Label each contour once, at its lowest visible point, unless it would collide.
      if (longest != null && longLen > 200) {
        Offset? q;
        for (final o in longest) {
          if (o.dy < size.height - 70 && o.dx > 50 && o.dx < size.width - 50 && (q == null || o.dy > q.dy)) q = o;
        }
        final volts = lv.abs() < 1e-9 ? '0 V' : '${lv > 0 ? '+' : '−'}${_kv(lv.abs())}';
        final box = q == null ? null : Rect.fromCenter(center: q, width: 16.0 + 9 * volts.length, height: 26);
        if (box != null && !placed.any((r) => r.overlaps(box)) && !s.charges.any((ch) => box.overlaps(Rect.fromCenter(center: px(ch.p) + Offset(0, (26 + 4 * ch.q.abs()) / 2 + 12), width: 190, height: 26.0 + 4 * ch.q.abs() + 60)))) {
          placed.add(box);
          IxPaint.label(c, volts, q!, size: 14, color: col, w: FontWeight.w600, halo: true);
        }
      }
    }
  }

  static double _tanh(double x) {
    final e = math.exp(-2 * x.abs().clamp(0, 20));
    return x.sign * (1 - e) / (1 + e);
  }

  static String _kv(double v) => v >= 1e6 ? '${(v / 1e6).toStringAsFixed(v >= 1e7 ? 0 : 1)} MV' : (v >= 1e3 ? '${(v / 1e3).toStringAsFixed(v >= 1e4 ? 0 : 1)} kV' : '${v.toStringAsFixed(0)} V');

  /// Marching squares for one level: returns polylines in pixels. Saddle cells are resolved
  /// with the cell-centre average; segments are chained through shared cell edges.
  static List<List<Offset>> _contour(Float64List g, int nx, int ny, double cell, double lv) {
    // Edge ids: horizontal edge (i, j)→(i+1, j) = 2(j nx + i); vertical (i, j)→(i, j+1) = 2(j nx + i) + 1.
    final pt = <int, Offset>{};
    final link = <int, List<int>>{};
    Offset cross(int e) => pt.putIfAbsent(e, () {
      final k = e >> 1, i = k % nx, j = k ~/ nx;
      final a = g[k], b = (e & 1) == 0 ? g[k + 1] : g[k + nx];
      final t = ((lv - a) / (b - a)).clamp(0.0, 1.0);
      return (e & 1) == 0 ? Offset((i + t) * cell, j * cell) : Offset(i * cell, (j + t) * cell);
    });
    void seg(int a, int b) {
      cross(a);
      cross(b);
      (link[a] ??= []).add(b);
      (link[b] ??= []).add(a);
    }
    for (var j = 0; j < ny - 1; j++) {
      for (var i = 0; i < nx - 1; i++) {
        final k = j * nx + i;
        final a = g[k], b = g[k + 1], cc = g[k + nx + 1], d = g[k + nx];
        if (a.abs() > 4e7 || b.abs() > 4e7 || cc.abs() > 4e7 || d.abs() > 4e7) continue; // inside a charge
        final code = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (cc > lv ? 2 : 0) | (d > lv ? 1 : 0);
        if (code == 0 || code == 15) continue;
        final top = 2 * k, left = 2 * k + 1, bottom = 2 * (k + nx), right = 2 * (k + 1) + 1;
        switch (code) {
          case 1 || 14: seg(left, bottom);
          case 2 || 13: seg(bottom, right);
          case 3 || 12: seg(left, right);
          case 4 || 11: seg(top, right);
          case 6 || 9: seg(top, bottom);
          case 7 || 8: seg(top, left);
          case 5 || 10:
            final centreHigh = (a + b + cc + d) / 4 > lv;
            if ((code == 5) == centreHigh) {
              seg(top, left);
              seg(bottom, right);
            } else {
              seg(top, right);
              seg(left, bottom);
            }
        }
      }
    }
    final chains = <List<Offset>>[];
    final used = <int>{};
    for (final start in link.keys) {
      if (used.contains(start)) continue;
      // Walk to one end first (open contours start at the border), then collect.
      var cur = start;
      int? prev;
      final seen = <int>{cur};
      while (true) {
        final nb = link[cur]!.where((e) => e != prev && !seen.contains(e)).toList();
        if (nb.isEmpty) break;
        prev = cur;
        cur = nb.first;
        seen.add(cur);
      }
      final chain = <Offset>[];
      final first = cur;
      prev = null;
      while (true) {
        used.add(cur);
        chain.add(pt[cur]!);
        final nb = link[cur]!.where((e) => e != prev && !used.contains(e)).toList();
        if (nb.isEmpty) {
          // Close the loop if it returns to its start.
          if (chain.length > 2 && link[cur]!.contains(first)) chain.add(pt[first]!);
          break;
        }
        prev = cur;
        cur = nb.first;
      }
      if (chain.length > 2) chains.add(chain);
    }
    return chains;
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
