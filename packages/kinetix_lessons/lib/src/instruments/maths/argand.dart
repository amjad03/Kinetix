import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'common.dart';

class _C {
  const _C(this.re, this.im);
  final double re, im;
  _C operator +(_C o) => _C(re + o.re, im + o.im);
  _C operator -(_C o) => _C(re - o.re, im - o.im);
  _C operator *(_C o) => _C(re * o.re - im * o.im, re * o.im + im * o.re);
  _C operator /(_C o) {
    final d = o.re * o.re + o.im * o.im;
    return _C((re * o.re + im * o.im) / d, (im * o.re - re * o.im) / d);
  }

  double get mod => math.sqrt(re * re + im * im);
  double get arg => math.atan2(im, re);
  _C get conj => _C(re, -im);
  Offset get o => Offset(re, im);
  String show([int d = 2]) {
    if (im.abs() < 1e-9) return fmtT(re, d);
    final i = (im.abs() - 1).abs() < 1e-9 ? 'i' : '${fmtT(im.abs(), d)}i';
    if (re.abs() < 1e-9) return im < 0 ? '−$i' : i;
    return '${fmtT(re, d)} ${im < 0 ? '−' : '+'} $i';
  }
}

/// The Argand plane: complex numbers as points and arrows. Sum by the parallelogram law,
/// product as "multiply lengths, add angles", conjugates, polar form, powers of i, n-th roots
/// and the complex roots of a quadratic.
///
/// Preset: {"mode": "ops"|"rotate"|"conjugate"|"polar"|"roots"|"quadratic", "op": "add"|"sub"|
/// "mul"|"div", "z": [2, 1], "w": [1, 2], "k": 0, "n": 5, "alpha": 0, "b": 2, "c": 5}.
class ArgandInstrument extends StatefulWidget {
  const ArgandInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<ArgandInstrument> createState() => _ArgandState();
}

class _ArgandState extends State<ArgandInstrument> {
  String mode = 'ops', op = 'add';
  _C z = const _C(2, 1), w = const _C(1, 2);
  int k = 0, n = 5;
  double alpha = 0, b = 2, c = 5;
  int? active;
  int _drag = -1;

  static final _presets = <String, Map<String, dynamic>>{
    'Sum': {'mode': 'ops', 'op': 'add', 'z': [3, 1], 'w': [1, 2]},
    'Product': {'mode': 'ops', 'op': 'mul', 'z': [2, 1], 'w': [1, 1]},
    'Powers of i': {'mode': 'rotate', 'z': [2, 1], 'k': 1},
    'Polar form': {'mode': 'polar', 'z': [-2, 2], 'alpha': 0},
    'Roots of unity': {'mode': 'roots', 'n': 6},
    'Quadratic, D < 0': {'mode': 'quadratic', 'b': 2, 'c': 5},
  };

  @override
  void initState() {
    super.initState();
    _apply(widget.preset.isEmpty ? _presets['Sum']! : widget.preset);
    if (widget.preset.isEmpty) active = 0;
  }

  void _apply(Map<String, dynamic> p) {
    mode = ps(p, 'mode', 'ops');
    op = ps(p, 'op', 'add');
    final zz = pl(p, 'z', [2, 1]), ww = pl(p, 'w', [1, 2]);
    z = _C(zz[0], zz[1]);
    w = _C(ww[0], ww[1]);
    k = pint(p, 'k', 0);
    n = pint(p, 'n', 5);
    alpha = pd(p, 'alpha', 0);
    b = pd(p, 'b', 2);
    c = pd(p, 'c', 5);
  }

  _C get result => switch (op) { 'sub' => z - w, 'mul' => z * w, 'div' => w.mod == 0 ? const _C(double.nan, double.nan) : z / w, _ => z + w };
  String get opSym => const {'add': '+', 'sub': '−', 'mul': '×', 'div': '÷'}[op]!;

  _C powI(_C v, int k) {
    var r = v;
    for (var j = 0; j < ((k % 4) + 4) % 4; j++) {
      r = _C(-r.im, r.re);
    }
    return r;
  }

  String ang(double rad) => '${fmtT(rad * 180 / math.pi, 1)}°';

  @override
  Widget build(BuildContext context) {
    String title, formula;
    late List<Readout> ro;
    late List<Widget> ctl;
    Widget sl(String l, double v, double lo, double hi, ValueChanged<double> on, {int d = 1, double step = 0.5}) => IxSlider(label: l, value: v, min: lo, max: hi, divisions: ((hi - lo) / step).round(), format: (x) => fmt(x, d), onChanged: (x) => setState(() { on(x); active = null; }));
    switch (mode) {
      case 'rotate':
        final r = powI(z, k);
        title = 'Multiplying by i turns by 90°';
        formula = 'i² = −1,  i⁴ = 1';
        ro = [
          Readout('z', z.show(), '', IX.accent),
          Readout('i${k == 1 ? '' : superscript(k)} z', r.show(), '', IX.positive),
          Readout('i${k == 1 ? '' : superscript(k)}', const ['1', 'i', '−1', '−i'][k % 4], '', IX.ink),
          Readout('Turned through', '${90 * k}°', '', IX.inkSoft),
        ];
        ctl = [
          IxButton('Multiply by i', icon: Icons.rotate_left_rounded, onTap: () => setState(() => k = (k + 1) % 8)),
          IxButton('Reset to z', onTap: () => setState(() => k = 0)),
          sl('Re z', z.re, -3, 3, (x) => z = _C(x, z.im)),
          sl('Im z', z.im, -3, 3, (x) => z = _C(z.re, x)),
        ];
      case 'conjugate':
        title = 'Conjugate, negative and modulus';
        formula = 'z · z̄ = |z|²';
        ro = [
          Readout('z', z.show(), '', IX.accent),
          Readout('z̄', z.conj.show(), '', IX.green),
          Readout('−z', (const _C(0, 0) - z).show(), '', IX.positive),
          Readout('|z|', fmt(z.mod, 3), '', IX.ink),
          Readout('z · z̄', fmt(z.mod * z.mod, 2), '', MX.violet),
        ];
        ctl = [sl('Re z', z.re, -4, 4, (x) => z = _C(x, z.im)), sl('Im z', z.im, -4, 4, (x) => z = _C(z.re, x))];
      case 'polar':
        final rot = z * _C(math.cos(alpha * math.pi / 180), math.sin(alpha * math.pi / 180));
        title = 'Polar form: modulus and argument';
        formula = 'z = r(cos θ + i sin θ)';
        ro = [
          Readout('z', z.show(), '', IX.accent),
          Readout('r = |z|', fmt(z.mod, 3), '', IX.ink),
          Readout('θ = arg z', '${ang(z.arg)} = ${piFrac(z.arg)}', '', IX.positive),
          if (alpha != 0) Readout('arg after turning by α', ang(rot.arg), '', IX.green),
        ];
        ctl = [
          sl('Re z', z.re, -4, 4, (x) => z = _C(x, z.im)),
          sl('Im z', z.im, -4, 4, (x) => z = _C(z.re, x)),
          sl('Turn by α', alpha, -180, 180, (x) => alpha = x, d: 0, step: 5),
        ];
      case 'roots':
        title = 'The n-th roots of unity';
        formula = 'zᵏ = cos(2πk/n) + i sin(2πk/n)';
        ro = [
          Readout('n', '$n', '', IX.ink),
          Readout('Angle between roots', '${fmtT(360 / n, 2)}°', '', IX.accent),
          Readout('First root ω', _C(math.cos(2 * math.pi / n), math.sin(2 * math.pi / n)).show(3), '', IX.positive),
          const Readout('Sum of all roots', '0', '', IX.green),
        ];
        ctl = [sl('n', n.toDouble(), 2, 12, (x) => n = x.round(), d: 0, step: 1)];
      case 'quadratic':
        final d = b * b - 4 * c;
        title = 'Where the roots go when D < 0';
        formula = 'x = (−b ± √D) / 2,  D = b² − 4c';
        ro = [
          Readout('D = b² − 4c', fmt(d, 2), '', d < 0 ? MX.red : IX.green),
          Readout('Real part', fmt(-b / 2, 3), '', IX.accent),
          Readout(d < 0 ? 'Imaginary part ±' : 'Roots', d < 0 ? fmt(math.sqrt(-d) / 2, 3) : '${fmt((-b - math.sqrt(d)) / 2, 2)}, ${fmt((-b + math.sqrt(d)) / 2, 2)}', '', IX.positive),
          Readout('Nature', d < 0 ? 'Conjugate pair' : d == 0 ? 'Equal real' : 'Two real', '', IX.inkSoft),
        ];
        ctl = [sl('b', b, -4, 4, (x) => b = x, step: 0.25, d: 2), sl('c', c, -4, 8, (x) => c = x, step: 0.25, d: 2)];
      default:
        final r = result;
        title = op == 'add' || op == 'sub' ? 'Sum on the Argand plane' : op == 'mul' ? 'Product: lengths multiply, angles add' : 'Quotient: lengths divide, angles subtract';
        formula = 'z₁ $opSym z₂ = ${r.show()}';
        ro = [
          Readout('z₁', z.show(), '', IX.accent),
          Readout('z₂', w.show(), '', IX.green),
          Readout('z₁ $opSym z₂', r.show(), '', IX.positive),
          Readout('|z₁ $opSym z₂|', fmt(r.mod, 3), '', IX.ink),
          if (op == 'mul' || op == 'div') Readout('arg z₁ ${op == 'mul' ? '+' : '−'} arg z₂', ang(op == 'mul' ? z.arg + w.arg : z.arg - w.arg), '', IX.inkSoft),
        ];
        ctl = [
          IxSegments<String>(label: 'Operation', options: const {'add': 'z₁ + z₂', 'sub': 'z₁ − z₂', 'mul': 'z₁ × z₂', 'div': 'z₁ ÷ z₂'}, value: op, onChanged: (x) => setState(() => op = x)),
          sl('Re z₂', w.re, -4, 4, (x) => w = _C(x, w.im)),
          sl('Im z₂', w.im, -4, 4, (x) => w = _C(w.re, x)),
          Text('Drag z₁ on the plane.', style: IX.text(17, c: IX.inkSoft)),
        ];
    }
    return InstrumentFrame(
      id: 'maths-argand',
      subtitle: tx(widget.preset['subtitle']) ?? '$kMaths · Complex numbers',
      title: tx(widget.preset['title']) ?? title,
      formula: formula,
      state: {'mode': mode, 'op': op, 'z': [z.re, z.im], 'w': [w.re, w.im], 'k': k, 'n': n, 'b': b, 'c': c},
      readouts: ro,
      controls: ctl,
      presets: [for (final (i, e) in _presets.entries.indexed) Preset(e.key, () => setState(() { _apply(e.value); active = i; }))],
      activePreset: active,
      stage: LayoutBuilder(builder: (context, box) {
        final size = box.biggest;
        final pl = _ArgandPainter.plane(this, size);
        return GestureDetector(
          onPanStart: (e) {
            _drag = -1;
            if (mode == 'roots' || mode == 'quadratic') return;
            if ((pl.p(z.re, z.im) - e.localPosition).distance < 50) _drag = 0;
            if (mode == 'ops' && (pl.p(w.re, w.im) - e.localPosition).distance < 50) _drag = 1;
          },
          onPanUpdate: (e) {
            if (_drag < 0) return;
            final q = pl.w(e.localPosition);
            final v = _C((q.dx * 2).round() / 2, (q.dy * 2).round() / 2);
            setState(() {
              active = null;
              _drag == 0 ? z = v : w = v;
            });
          },
          onPanEnd: (_) => _drag = -1,
          child: CustomPaint(size: size, painter: _ArgandPainter(this, pl)),
        );
      }),
    );
  }
}

class _ArgandPainter extends CustomPainter {
  _ArgandPainter(this.s, this.pl);
  final _ArgandState s;
  final Plane pl;

  static Plane plane(_ArgandState s, Size size) {
    final right = s.mode == 'quadratic' ? size.width * 0.5 : size.width - 40;
    final lim = switch (s.mode) { 'roots' => 1.6, 'quadratic' => 3.5, 'ops' => 6.0, _ => 5.0 };
    return Plane(Rect.fromLTRB(s.mode == 'quadratic' ? 70 : 60, 50, right, size.height - 50), -lim, lim, -lim, lim, equal: true);
  }

  void vec(Canvas c, Offset to, Color col, String label, {Offset from = Offset.zero, bool dashed = false, double w = 4}) {
    if (!to.dx.isFinite || !to.dy.isFinite) return;
    final a = pl.p(from.dx, from.dy), b = pl.p(to.dx, to.dy);
    if (dashed) {
      IxPaint.dashed(c, a, b, MPaint.stroke(col, 2.5), dash: 9, gap: 7);
    } else {
      IxPaint.arrow(c, a, b, col, width: w, head: 18);
    }
    final d = (b - a);
    final nrm = d.distance == 0 ? const Offset(0, -1) : Offset(-d.dy, d.dx) / d.distance;
    IxPaint.label(c, label, b + nrm * 22 + d / (d.distance + 1e-9) * 14, size: 21, color: col, w: FontWeight.w700, halo: true);
  }

  @override
  void paint(Canvas c, Size size) {
    pl.paintGrid(c, xLabel: 'Re', yLabel: 'Im', xStep: s.mode == 'roots' ? 0.5 : 1, yStep: s.mode == 'roots' ? 0.5 : 1, yTick: (v) => v == 0 ? '' : '${fmtT(v)}i'.replaceFirst('1i', 'i').replaceFirst('−1i', '−i').replaceAll(RegExp(r'^i$'), 'i'));
    final z = s.z, w = s.w;
    switch (s.mode) {
      case 'rotate':
        c.drawCircle(pl.p(0, 0), z.mod * pl.ux, MPaint.stroke(IX.rule, 1.6));
        for (var j = 0; j < 4; j++) {
          final v = s.powI(z, j);
          final on = j == s.k % 4;
          vec(c, v.o, on ? IX.positive : IX.steel.withValues(alpha: 0.7), j == 0 ? 'z' : 'i${j == 1 ? '' : superscript(j)}z', w: on ? 4.5 : 2.5);
        }
        IxPaint.handle(c, pl.p(z.re, z.im), IX.accent, r: 12, active: s._drag == 0);
        if (s.k % 4 != 0) {
          final a0 = z.arg, sweep = math.pi / 2 * (s.k % 4);
          MPaint.arc(c, pl.p(0, 0), z.mod * pl.ux * 0.35, a0, sweep, IX.amber, w: 3);
        }
      case 'conjugate':
        c.drawCircle(pl.p(0, 0), z.mod * pl.ux, MPaint.stroke(IX.rule, 2));
        IxPaint.dashed(c, pl.p(z.re, z.im), pl.p(z.re, -z.im), MPaint.stroke(IX.steel, 1.6));
        vec(c, z.o, IX.accent, 'z');
        vec(c, z.conj.o, IX.green, 'z̄');
        vec(c, -z.o, IX.positive, '−z');
        vec(c, -z.conj.o, MX.violet, '−z̄', dashed: true);
        IxPaint.handle(c, pl.p(z.re, z.im), IX.accent, r: 13, active: s._drag == 0);
        IxPaint.label(c, '|z| = ${fmt(z.mod, 2)}', pl.p(z.re / 2, z.im / 2) + const Offset(-14, -18), size: 19, color: IX.ink, align: Alignment.centerRight, halo: true);
      case 'polar':
        final o = pl.p(0, 0);
        c.drawLine(o, pl.p(z.re, 0), MPaint.stroke(IX.accent.withValues(alpha: 0.5), 3));
        IxPaint.dashed(c, pl.p(z.re, 0), pl.p(z.re, z.im), MPaint.stroke(IX.positive.withValues(alpha: 0.7), 2.5));
        IxPaint.label(c, 'r cos θ', pl.p(z.re / 2, 0) + Offset(0, z.im >= 0 ? 20 : -20), size: 18, color: IX.accent, w: FontWeight.w600, halo: true);
        IxPaint.label(c, 'r sin θ', pl.p(z.re, z.im / 2) + Offset(z.re >= 0 ? 14 : -14, 0), size: 18, color: IX.positive, w: FontWeight.w600, align: z.re >= 0 ? Alignment.centerLeft : Alignment.centerRight, halo: true);
        MPaint.arc(c, o, 46, 0, z.arg, IX.amber, w: 3.5);
        IxPaint.label(c, 'θ', o + Offset(math.cos(z.arg / 2), -math.sin(z.arg / 2)) * 70, size: 22, color: IX.amber, w: FontWeight.w700);
        if (s.alpha != 0) {
          final rot = z * _C(math.cos(s.alpha * math.pi / 180), math.sin(s.alpha * math.pi / 180));
          MPaint.arc(c, o, z.mod * pl.ux * 0.6, z.arg, s.alpha * math.pi / 180, IX.green, w: 2.5);
          vec(c, rot.o, IX.green, 'z(cos α + i sin α)');
        }
        vec(c, z.o, IX.ink, 'z = ${z.show()}');
        IxPaint.handle(c, pl.p(z.re, z.im), IX.accent, r: 13, active: s._drag == 0);
        IxPaint.label(c, 'r = ${fmt(z.mod, 2)}', pl.p(z.re / 2, z.im / 2) + const Offset(-12, -16), size: 19, color: IX.ink, w: FontWeight.w600, align: Alignment.centerRight, halo: true);
      case 'roots':
        final o = pl.p(0, 0);
        c.drawCircle(o, pl.ux, MPaint.stroke(IX.steel, 2.5));
        final pts = [for (var j = 0; j < s.n; j++) pl.p(math.cos(2 * math.pi * j / s.n), math.sin(2 * math.pi * j / s.n))];
        final poly = Path()..addPolygon(pts, true);
        c.drawPath(poly, Paint()..color = IX.accent.withValues(alpha: 0.07));
        c.drawPath(poly, MPaint.stroke(IX.accent.withValues(alpha: 0.6), 2));
        for (var j = 0; j < s.n; j++) {
          c.drawLine(o, pts[j], MPaint.stroke(IX.rule, 1.5));
          MPaint.dot(c, pts[j], j == 0 ? IX.ink : IX.positive, r: 10);
          final a = 2 * math.pi * j / s.n;
          IxPaint.label(c, j == 0 ? '1' : 'ω${j == 1 ? '' : superscript(j)}', o + Offset(math.cos(a), -math.sin(a)) * (pl.ux + 34), size: 22, color: j == 0 ? IX.ink : IX.positive, w: FontWeight.w700);
        }
        MPaint.arc(c, o, pl.ux * 0.3, 0, 2 * math.pi / s.n, IX.amber, w: 3);
        IxPaint.label(c, '2π/${s.n}', o + Offset(math.cos(math.pi / s.n), -math.sin(math.pi / s.n)) * (pl.ux * 0.3 + 34), size: 18, color: IX.amber, w: FontWeight.w600, halo: true);
      case 'quadratic':
        final d = s.b * s.b - 4 * s.c;
        final roots = d < 0 ? [_C(-s.b / 2, math.sqrt(-d) / 2), _C(-s.b / 2, -math.sqrt(-d) / 2)] : [_C((-s.b - math.sqrt(d)) / 2, 0), _C((-s.b + math.sqrt(d)) / 2, 0)];
        for (final (i, r) in roots.indexed) {
          if (pl.contains(r.re, r.im)) {
            MPaint.dot(c, pl.p(r.re, r.im), i == 0 ? IX.accent : IX.positive, r: 11);
            IxPaint.label(c, r.show(), pl.p(r.re, r.im) + Offset(16, i == 0 ? -20 : 20), size: 20, color: i == 0 ? IX.accent : IX.positive, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
          }
        }
        if (d < 0) IxPaint.dashed(c, pl.p(roots[0].re, roots[0].im), pl.p(roots[1].re, roots[1].im), MPaint.stroke(IX.steel, 1.6));
        IxPaint.label(c, 'Roots on the Argand plane', Offset(pl.rect.center.dx, pl.rect.bottom + 28), size: 19, color: IX.inkSoft, w: FontWeight.w600);
        // The parabola beside it.
        final gp = Plane(Rect.fromLTRB(size.width * 0.58, 60, size.width - 50, size.height - 80), -6, 4, -6, 12);
        gp.paintGrid(c, yStep: 2);
        gp.curve(c, (x) => x * x + s.b * x + s.c, IX.ink, width: 4);
        if (d >= 0) {
          for (final r in roots) {
            MPaint.dot(c, gp.p(r.re, 0), IX.positive, r: 9);
          }
        }
        MPaint.dot(c, gp.p(-s.b / 2, s.c - s.b * s.b / 4), IX.amber, r: 8);
        IxPaint.label(c, 'y = x² ${signed(s.b)}x ${signed(s.c)}'.replaceAll('+ 0x ', '').replaceAll(' + 0', ''), Offset(gp.rect.left + 16, gp.rect.top + 10), size: 21, color: IX.ink, w: FontWeight.w700, align: Alignment.topLeft, halo: true);
        IxPaint.label(c, d < 0 ? 'Never meets the x-axis: no real roots' : 'Meets the x-axis at the real roots', Offset(gp.rect.center.dx, gp.rect.bottom + 34), size: 19, color: d < 0 ? MX.red : IX.green, w: FontWeight.w600);
      default:
        final r = s.result;
        if (s.op == 'add' || s.op == 'sub') {
          final w2 = s.op == 'add' ? w : const _C(0, 0) - w;
          IxPaint.dashed(c, pl.p(z.re, z.im), pl.p(r.re, r.im), MPaint.stroke(IX.green.withValues(alpha: 0.6), 2));
          IxPaint.dashed(c, pl.p(w2.re, w2.im), pl.p(r.re, r.im), MPaint.stroke(IX.accent.withValues(alpha: 0.6), 2));
          final par = Path()..addPolygon([pl.p(0, 0), pl.p(z.re, z.im), pl.p(r.re, r.im), pl.p(w2.re, w2.im)], true);
          c.drawPath(par, Paint()..color = IX.positive.withValues(alpha: 0.06));
          if (s.op == 'sub') vec(c, w2.o, IX.green.withValues(alpha: 0.6), '−z₂', dashed: true);
        } else {
          final o = pl.p(0, 0);
          MPaint.arc(c, o, 50, 0, z.arg, IX.accent, w: 3);
          MPaint.arc(c, o, 64, 0, w.arg, IX.green, w: 3);
          MPaint.arc(c, o, 80, 0, r.arg, IX.positive, w: 3);
        }
        vec(c, z.o, IX.accent, 'z₁');
        vec(c, w.o, IX.green, 'z₂');
        vec(c, r.o, IX.positive, 'z₁ ${s.opSym} z₂', w: 5);
        IxPaint.handle(c, pl.p(z.re, z.im), IX.accent, r: 13, active: s._drag == 0);
        IxPaint.handle(c, pl.p(w.re, w.im), IX.green, r: 11, active: s._drag == 1);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
