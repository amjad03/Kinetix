import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'common.dart';

/// Three-dimensional geometry and vectors on a turntable view (drag to turn): points and
/// octants, distance as a box diagonal, triangles from coordinates, direction cosines, the
/// line r = a + λb, the angle between two lines, skew lines and their shortest distance, and
/// vectors (sum, scalar multiple, section formula, dot product and projection, cross product).
///
/// Preset: {"mode": "point"|"distance"|"triangle"|"dircos"|"line"|"angle"|"skew"|"vectors",
/// "P": [2, 3, 4], "Q": [4, -1, 5], "A": [2, 0, 0], "B": [0, 2, 0], "C": [3, 2, 1],
/// "a": [1, 2, 0], "b": [2, 1, 2], "a2": [..], "b2": [..], "lambda": 1, "op": "add"|"scale"|
/// "section"|"dot"|"cross"|"components", "k": 2, "m": 2, "n": 1, "planes": true, "yaw": 35, "pitch": 22}.
class Space3DInstrument extends StatefulWidget {
  const Space3DInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<Space3DInstrument> createState() => _S3State();
}

class _S3State extends State<Space3DInstrument> {
  String mode = 'point', op = 'add';
  V3 P = const V3(2, 3, 4), Q = const V3(4, -1, 5), A = const V3(2, 0, 0), B = const V3(0, 2, 0), C = const V3(3, 2, 1);
  V3 a = const V3(1, 2, 0), b = const V3(2, 1, 2), a2 = const V3(0, 0, 3), b2 = const V3(1, -1, 0);
  double lambda = 1, k = 2, m = 2, n = 1, yaw = 35, pitch = 22;
  bool planes = false;
  int? active;

  static final _presets = <String, Map<String, dynamic>>{
    'Point and octant': {'mode': 'point', 'P': [2, 3, 4], 'planes': true},
    'Distance': {'mode': 'distance', 'P': [1, 2, 3], 'Q': [4, -1, 5]},
    'Direction cosines': {'mode': 'dircos', 'P': [2, 3, 4]},
    'Line r = a + λb': {'mode': 'line', 'a': [1, 2, 0], 'b': [2, 1, 2], 'lambda': 1},
    'Skew lines': {'mode': 'skew', 'a': [1, 0, 0], 'b': [0, 1, 1], 'a2': [0, 0, 3], 'b2': [1, 1, 0]},
    'Cross product': {'mode': 'vectors', 'op': 'cross', 'a': [3, 0, 0], 'b': [1, 2, 0]},
  };

  @override
  void initState() {
    super.initState();
    _apply(widget.preset.isEmpty ? _presets['Point and octant']! : widget.preset);
    if (widget.preset.isEmpty) active = 0;
  }

  void _apply(Map<String, dynamic> p) {
    mode = ps(p, 'mode', 'point');
    op = ps(p, 'op', 'add');
    P = V3.from(p['P'], const V3(2, 3, 4));
    Q = V3.from(p['Q'], const V3(4, -1, 5));
    A = V3.from(p['A'], const V3(2, 0, 0));
    B = V3.from(p['B'], const V3(0, 2, 0));
    C = V3.from(p['C'], const V3(3, 2, 1));
    a = V3.from(p['a'], const V3(1, 2, 0));
    b = V3.from(p['b'], const V3(2, 1, 2));
    a2 = V3.from(p['a2'], const V3(0, 0, 3));
    b2 = V3.from(p['b2'], const V3(1, -1, 0));
    lambda = pd(p, 'lambda', 1);
    k = pd(p, 'k', 2);
    m = pd(p, 'm', 2);
    n = pd(p, 'n', 1);
    planes = pb(p, 'planes', false);
    yaw = pd(p, 'yaw', 35);
    pitch = pd(p, 'pitch', 22);
  }

  String d(double v, [int dg = 3]) => fmt(v, dg);
  String deg(double rad) => '${fmtT(rad * 180 / math.pi, 1)}°';

  int get octant {
    final s = (P.x >= 0 ? 0 : 1) + (P.y >= 0 ? 0 : 2) + (P.z >= 0 ? 0 : 4);
    return const [1, 2, 4, 3, 5, 6, 8, 7][s];
  }

  String vecText(V3 v) {
    var s = '${coef(v.x, 'î', lead: true)}${v.x == 0 ? coef(v.y, 'ĵ', lead: true) : coef(v.y, 'ĵ')}';
    s += s.isEmpty ? coef(v.z, 'k̂', lead: true) : coef(v.z, 'k̂');
    return s.isEmpty ? '0' : s;
  }

  Widget xyz(String name, V3 v, ValueChanged<V3> on, {double lo = -5, double hi = 5}) => Column(children: [
    for (final (i, ax) in ['x', 'y', 'z'].indexed)
      IxSlider(label: '$name: $ax', value: [v.x, v.y, v.z][i], min: lo, max: hi, divisions: ((hi - lo) * 2).round(), format: (x) => fmt(x, 1), onChanged: (x) => setState(() {
        active = null;
        on(V3(i == 0 ? x : v.x, i == 1 ? x : v.y, i == 2 ? x : v.z));
      })),
  ]);

  @override
  Widget build(BuildContext context) {
    String title, formula;
    late List<Readout> ro;
    late List<Widget> ctl;
    switch (mode) {
      case 'distance':
        final dd = Q - P;
        title = 'Distance as a box diagonal';
        formula = 'PQ = √(Δx² + Δy² + Δz²)';
        ro = [
          Readout('Floor diagonal √(Δx² + Δy²)', d(math.sqrt(dd.x * dd.x + dd.y * dd.y)), '', IX.green),
          Readout('Height |Δz|', d(dd.z.abs()), '', IX.amber),
          Readout('PQ', d(dd.len), '', IX.positive),
          Readout('Mid-point', ((P + Q) * 0.5).show(), '', IX.inkSoft),
        ];
        ctl = [xyz('Q', Q, (v) => Q = v)];
      case 'triangle':
        final ab = (B - A).len, bc = (C - B).len, ca = (A - C).len;
        final sides = [ab, bc, ca]..sort();
        final col = (sides[0] + sides[1] - sides[2]).abs() < 1e-6;
        final right = (sides[0] * sides[0] + sides[1] * sides[1] - sides[2] * sides[2]).abs() < 1e-6;
        final kind = col ? 'Collinear: no triangle' : (ab - bc).abs() < 1e-6 && (bc - ca).abs() < 1e-6 ? 'Equilateral' : right ? 'Right-angled${(sides[0] - sides[1]).abs() < 1e-6 ? ', isosceles' : ''}' : (ab - bc).abs() < 1e-6 || (bc - ca).abs() < 1e-6 || (ca - ab).abs() < 1e-6 ? 'Isosceles' : 'Scalene';
        title = 'What kind of triangle?';
        formula = 'collinear when the two short sides add up to the long one';
        ro = [
          Readout('AB', d(ab), '', IX.accent),
          Readout('BC', d(bc), '', IX.green),
          Readout('CA', d(ca), '', IX.positive),
          Readout('A, B, C', kind, '', col ? MX.red : IX.ink),
        ];
        ctl = [xyz('C', C, (v) => C = v, lo: -3, hi: 5)];
      case 'dircos':
        final l = P.x / P.len, mm = P.y / P.len, nn = P.z / P.len;
        title = 'Direction cosines of a line';
        formula = 'l² + m² + n² = 1';
        ro = [
          Readout('l = cos α', d(l), '', MX.red),
          Readout('m = cos β', d(mm), '', IX.green),
          Readout('n = cos γ', d(nn), '', IX.accent),
          Readout('α, β, γ', '${deg(math.acos(l))}, ${deg(math.acos(mm))}, ${deg(math.acos(nn))}', '', IX.inkSoft),
          Readout('l² + m² + n²', d(l * l + mm * mm + nn * nn), '', IX.positive),
        ];
        ctl = [xyz('Direction ratios', P, (v) => P = v.len == 0 ? const V3(0, 0, 1) : v)];
      case 'line':
        final pt = a + b * lambda;
        title = 'Walking along r = a + λb';
        formula = 'r = (${vecText(a)}) + λ(${vecText(b)})';
        ro = [
          Readout('λ', fmt(lambda, 2), '', IX.ink),
          Readout('Point on the line', pt.show(), '', IX.positive),
          Readout('Distance from A', d((b * lambda).len), '', IX.accent),
          Readout('Cartesian form', '(x − ${fmtT(a.x)})/${fmtT(b.x)} = (y − ${fmtT(a.y)})/${fmtT(b.y)} = (z − ${fmtT(a.z)})/${fmtT(b.z)}'.replaceAll('− −', '+ '), '', IX.inkSoft),
        ];
        ctl = [IxSlider(label: 'λ', value: lambda, min: -2, max: 3, divisions: 50, format: (x) => fmt(x, 1), onChanged: (x) => setState(() => lambda = x)), xyz('b', b, (v) => b = v, lo: -3, hi: 3)];
      case 'angle':
        final ct = (b.dot(b2)).abs() / (b.len * b2.len);
        title = 'The angle between two lines';
        formula = 'cos θ = |b₁ · b₂| / (|b₁| |b₂|)';
        ro = [
          Readout('b₁ · b₂', fmt(b.dot(b2), 2), '', IX.ink),
          Readout('cos θ', d(ct), '', IX.accent),
          Readout('θ', deg(math.acos(ct.clamp(-1.0, 1.0))), '', IX.positive),
          Readout('Lines are', ct < 1e-9 ? 'perpendicular' : (ct - 1).abs() < 1e-9 ? 'parallel' : 'neither ∥ nor ⊥', '', IX.green),
        ];
        ctl = [xyz('b₁', b, (v) => b = v, lo: -3, hi: 3), xyz('b₂', b2, (v) => b2 = v, lo: -3, hi: 3)];
      case 'skew':
        final cr = b.cross(b2);
        final sd = cr.len < 1e-9 ? ((a2 - a).cross(b)).len / b.len : ((a2 - a).dot(cr)).abs() / cr.len;
        title = 'Shortest distance between skew lines';
        formula = cr.len < 1e-9 ? 'parallel: d = |b × (a₂ − a₁)| / |b|' : 'd = |(a₂ − a₁) · (b₁ × b₂)| / |b₁ × b₂|';
        ro = [
          Readout('b₁ × b₂', cr.show(), '', MX.violet),
          Readout('(a₂ − a₁) · (b₁ × b₂)', fmt((a2 - a).dot(cr), 2), '', IX.ink),
          Readout('Shortest distance', d(sd), '', IX.positive),
          Readout('The lines', sd < 1e-9 ? 'intersect' : cr.len < 1e-9 ? 'are parallel' : 'are skew', '', IX.green),
        ];
        ctl = [xyz('a₂', a2, (v) => a2 = v, lo: -3, hi: 4), xyz('b₂', b2, (v) => b2 = v, lo: -3, hi: 3)];
      case 'vectors':
        (title, formula, ro, ctl) = _vectorPanel();
      default:
        title = 'Coordinates of a point in space';
        formula = 'P(x, y, z) lies in octant ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][octant - 1]}';
        ro = [
          Readout('Octant', ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][octant - 1], '', IX.positive),
          Readout('From the XY-plane |z|', fmt(P.z.abs(), 1), '', IX.accent),
          Readout('From the YZ-plane |x|', fmt(P.x.abs(), 1), '', MX.red),
          Readout('From the ZX-plane |y|', fmt(P.y.abs(), 1), '', IX.green),
          Readout('From the x-axis √(y² + z²)', d(math.sqrt(P.y * P.y + P.z * P.z)), '', IX.inkSoft),
          Readout('OP', d(P.len), '', IX.ink),
        ];
        ctl = [xyz('P', P, (v) => P = v, lo: -4, hi: 4), IxToggle(label: 'Show coordinate planes', value: planes, onChanged: (v) => setState(() => planes = v))];
    }
    return InstrumentFrame(
      id: 'maths-space3d',
      subtitle: tx(widget.preset['subtitle']) ?? (mode == 'vectors' ? '$kMaths · Vector algebra' : '$kMaths · Three-dimensional geometry'),
      title: tx(widget.preset['title']) ?? title,
      formula: formula,
      state: {'mode': mode, 'op': op, 'P': [P.x, P.y, P.z], 'Q': [Q.x, Q.y, Q.z], 'a': [a.x, a.y, a.z], 'b': [b.x, b.y, b.z], 'lambda': lambda},
      readouts: ro,
      controls: [...ctl, Text('Drag the picture to turn it.', style: IX.text(17, c: IX.inkSoft))],
      presets: [for (final (i, e) in _presets.entries.indexed) Preset(e.key, () => setState(() { _apply(e.value); active = i; }))],
      activePreset: active,
      stage: GestureDetector(
        onPanUpdate: (e) => setState(() {
          yaw = (yaw - e.delta.dx * 0.4) % 360;
          pitch = (pitch + e.delta.dy * 0.3).clamp(-10.0, 80.0);
        }),
        child: CustomPaint(painter: _S3Painter(this), size: Size.infinite),
      ),
    );
  }

  (String, String, List<Readout>, List<Widget>) _vectorPanel() {
    switch (op) {
      case 'scale':
        return (
          'Scalar multiple of a vector',
          'k a has length |k| |a|',
          [
            Readout('a', vecText(a), '', IX.accent),
            Readout('k a', vecText(a * k), '', IX.positive),
            Readout('|k a|', d((a * k).len), '', IX.ink),
            Readout('Direction', k > 0 ? 'same as a' : k < 0 ? 'opposite to a' : 'zero vector', '', IX.inkSoft),
          ],
          [IxSlider(label: 'k', value: k, min: -2, max: 3, divisions: 20, format: (x) => fmt(x, 2), onChanged: (x) => setState(() => k = x)), xyz('a', a, (v) => a = v, lo: -3, hi: 3)],
        );
      case 'section':
        final r = (b * m + a * n) * (1 / (m + n));
        return (
          'The section formula',
          'r = (m b + n a) / (m + n)',
          [
            Readout('A (position a)', a.show(), '', IX.accent),
            Readout('B (position b)', b.show(), '', IX.green),
            Readout('R divides AB as m : n', r.show(), '', IX.positive),
            Readout('Mid-point', ((a + b) * 0.5).show(), '', IX.inkSoft),
          ],
          [
            IxSlider(label: 'm', value: m, min: 0.5, max: 5, divisions: 9, format: (x) => fmt(x, 1), onChanged: (x) => setState(() => m = x)),
            IxSlider(label: 'n', value: n, min: 0.5, max: 5, divisions: 9, format: (x) => fmt(x, 1), onChanged: (x) => setState(() => n = x)),
          ],
        );
      case 'dot':
        final ct = a.dot(b) / (a.len * b.len);
        return (
          'Dot product and projection',
          'a · b = |a| |b| cos θ',
          [
            Readout('a · b', fmt(a.dot(b), 2), '', IX.positive),
            Readout('θ', deg(math.acos(ct.clamp(-1.0, 1.0))), '', IX.amber),
            Readout('Projection of a on b', d(a.dot(b) / b.len), '', IX.accent),
            Readout('a ⊥ b?', a.dot(b).abs() < 1e-9 ? 'Yes, a · b = 0' : 'No', '', IX.inkSoft),
          ],
          [xyz('a', a, (v) => a = v, lo: -3, hi: 3), xyz('b', b, (v) => b = v, lo: -3, hi: 3)],
        );
      case 'cross':
        final cr = a.cross(b);
        return (
          'The cross product stands up',
          '|a × b| = |a| |b| sin θ',
          [
            Readout('a × b', vecText(cr), '', MX.violet),
            Readout('|a × b| = area', d(cr.len), 'sq. units', IX.positive),
            Readout('Triangle on a, b', d(cr.len / 2), 'sq. units', IX.green),
            Readout('b × a', vecText(cr * -1), '', IX.inkSoft),
          ],
          [xyz('a', a, (v) => a = v, lo: -3, hi: 3), xyz('b', b, (v) => b = v, lo: -3, hi: 3)],
        );
      case 'components':
        return (
          'A vector and its components',
          'a = x î + y ĵ + z k̂',
          [
            Readout('a', vecText(a), '', IX.accent),
            Readout('|a|', d(a.len), '', IX.positive),
            Readout('Unit vector â', '${fmt(a.x / a.len, 2)}, ${fmt(a.y / a.len, 2)}, ${fmt(a.z / a.len, 2)}', '', IX.ink),
            Readout('Direction cosines', '${fmt(a.x / a.len, 3)}, ${fmt(a.y / a.len, 3)}, ${fmt(a.z / a.len, 3)}', '', IX.inkSoft),
          ],
          [xyz('a', a, (v) => a = v.len == 0 ? const V3(1, 0, 0) : v, lo: -4, hi: 4)],
        );
      default:
        return (
          'Triangle law of addition',
          'a + b = ${vecText(a + b)}',
          [
            Readout('a', vecText(a), '', IX.accent),
            Readout('b', vecText(b), '', IX.green),
            Readout('a + b', vecText(a + b), '', IX.positive),
            Readout('|a + b|', d((a + b).len), '', IX.ink),
            Readout('|a| + |b|', d(a.len + b.len), '', IX.inkSoft),
          ],
          [xyz('a', a, (v) => a = v, lo: -3, hi: 3), xyz('b', b, (v) => b = v, lo: -3, hi: 3)],
        );
    }
  }
}

class _S3Painter extends CustomPainter {
  _S3Painter(this.s);
  final _S3State s;

  @override
  void paint(Canvas c, Size size) {
    final pts = <V3>[
      switch (s.mode) {
        'distance' => s.Q,
        'triangle' => s.C,
        'line' => s.a + s.b * 3,
        'skew' => s.a2 + s.b2 * 2,
        'vectors' => s.op == 'cross' ? s.a.cross(s.b) : s.a + s.b,
        _ => s.P,
      },
      s.P, s.a, s.b, if (s.mode == 'vectors' && s.op == 'scale') s.a * s.k, if (s.mode == 'skew') s.a2,
    ];
    final ext = math.max(4.0, pts.map((v) => math.max(v.x.abs(), math.max(v.y.abs(), v.z.abs()))).reduce(math.max) + 1);
    final pr = Proj3(Offset(size.width * 0.5, size.height * 0.56), math.min(size.width, size.height) * 0.47 / ext, s.yaw * math.pi / 180, s.pitch * math.pi / 180);
    if (s.planes) {
      final e = ext * 0.9;
      pr.poly(c, [V3(-e, -e, 0), V3(e, -e, 0), V3(e, e, 0), V3(-e, e, 0)], IX.accent.withValues(alpha: 0.06), edge: IX.accent.withValues(alpha: 0.25));
      pr.poly(c, [V3(0, -e, -e), V3(0, e, -e), V3(0, e, e), V3(0, -e, e)], MX.red.withValues(alpha: 0.05), edge: MX.red.withValues(alpha: 0.2));
      pr.poly(c, [V3(-e, 0, -e), V3(e, 0, -e), V3(e, 0, e), V3(-e, 0, e)], IX.green.withValues(alpha: 0.05), edge: IX.green.withValues(alpha: 0.2));
      IxPaint.label(c, 'XY-plane', pr.p(V3(e, e, 0)) + const Offset(8, 0), size: 16, color: IX.accent, align: Alignment.centerLeft);
    }
    pr.axes(c, ext);
    void pt(V3 v, String name, Color col, {double r = 9}) {
      MPaint.dot(c, pr.p(v), col, r: r);
      IxPaint.label(c, name, pr.p(v) + const Offset(14, -18), size: 20, color: col, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
    }

    void arrow(V3 from, V3 to, Color col, String name, {double w = 4}) {
      IxPaint.arrow(c, pr.p(from), pr.p(to), col, width: w, head: 18);
      final mid = pr.p((from + to) * 0.5);
      IxPaint.label(c, name, mid + const Offset(12, -16), size: 21, color: col, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
    }

    final o = const V3(0, 0, 0);
    switch (s.mode) {
      case 'distance':
        final p = s.P, q = s.Q;
        final r1 = V3(q.x, p.y, p.z), r2 = V3(q.x, q.y, p.z);
        // Box edges.
        for (final (u, v) in [(p, r1), (r1, r2), (p, V3(p.x, q.y, p.z)), (V3(p.x, q.y, p.z), r2)]) {
          pr.line(c, u, v, IX.steel, w: 1.8, dashed: true);
        }
        pr.line(c, p, r2, IX.green, w: 4);
        pr.line(c, r2, q, IX.amber, w: 4);
        pr.line(c, p, q, IX.positive, w: 5);
        pt(p, 'P${p.show(1)}', IX.ink);
        pt(q, 'Q${q.show(1)}', IX.positive);
        pt(r2, 'R', IX.green, r: 6);
      case 'triangle':
        pr.poly(c, [s.A, s.B, s.C], IX.accent.withValues(alpha: 0.12), edge: IX.accent);
        pr.line(c, s.A, s.B, IX.accent, w: 3.5);
        pr.line(c, s.B, s.C, IX.green, w: 3.5);
        pr.line(c, s.C, s.A, IX.positive, w: 3.5);
        pt(s.A, 'A${s.A.show(1)}', IX.ink);
        pt(s.B, 'B${s.B.show(1)}', IX.ink);
        pt(s.C, 'C${s.C.show(1)}', IX.positive);
      case 'dircos':
        final u = s.P.unit * (ext * 0.8);
        arrow(o, u, IX.ink, '', w: 4.5);
        pt(u, 'direction (${fmtT(s.P.x)}, ${fmtT(s.P.y)}, ${fmtT(s.P.z)})', IX.ink, r: 6);
        for (final (axis, col, name) in [(const V3(1, 0, 0), MX.red, 'α'), (const V3(0, 1, 0), IX.green, 'β'), (const V3(0, 0, 1), IX.accent, 'γ')]) {
          final path = Path();
          for (var i = 0; i <= 20; i++) {
            final t = i / 20;
            final v = (axis * (1 - t) + s.P.unit * t).unit * 1.4;
            final q = pr.p(v);
            i == 0 ? path.moveTo(q.dx, q.dy) : path.lineTo(q.dx, q.dy);
          }
          c.drawPath(path, MPaint.stroke(col, 3));
          IxPaint.label(c, name, pr.p((axis + s.P.unit).unit * 1.8), size: 22, color: col, w: FontWeight.w700, halo: true);
        }
      case 'line':
        final p0 = s.a + s.b * -2, p1 = s.a + s.b * 3;
        pr.line(c, p0, p1, IX.accent, w: 3.5);
        arrow(o, s.a, IX.ink.withValues(alpha: 0.7), 'a', w: 3);
        arrow(s.a, s.a + s.b, IX.green, 'b', w: 4);
        final pt0 = s.a + s.b * s.lambda;
        arrow(o, pt0, IX.positive, 'r', w: 3);
        pt(s.a, 'A', IX.ink, r: 7);
        pt(pt0, 'λ = ${fmtT(s.lambda, 1)}', IX.positive);
      case 'angle':
        final m0 = const V3(0, 0, 0);
        pr.line(c, s.b * -1.5, s.b * 2, IX.accent, w: 3.5);
        pr.line(c, s.b2 * -1.5, s.b2 * 2, IX.positive, w: 3.5);
        arrow(m0, s.b, IX.accent, 'b₁');
        arrow(m0, s.b2, IX.positive, 'b₂');
      case 'skew':
        pr.line(c, s.a + s.b * -3, s.a + s.b * 3, IX.accent, w: 3.5);
        pr.line(c, s.a2 + s.b2 * -3, s.a2 + s.b2 * 3, IX.green, w: 3.5);
        // Closest points.
        final w0 = s.a - s.a2;
        final aa = s.b.dot(s.b), bb = s.b.dot(s.b2), cc = s.b2.dot(s.b2), dd = s.b.dot(w0), ee = s.b2.dot(w0);
        final den = aa * cc - bb * bb;
        if (den.abs() > 1e-9) {
          final t1 = (bb * ee - cc * dd) / den, t2 = (aa * ee - bb * dd) / den;
          final p1 = s.a + s.b * t1, p2 = s.a2 + s.b2 * t2;
          pr.line(c, p1, p2, IX.positive, w: 4.5);
          pt(p1, 'P', IX.positive, r: 7);
          pt(p2, 'Q', IX.positive, r: 7);
          IxPaint.label(c, 'shortest distance PQ', pr.p((p1 + p2) * 0.5) + const Offset(-14, 0), size: 18, color: IX.positive, w: FontWeight.w600, align: Alignment.centerRight, halo: true);
        }
        IxPaint.label(c, 'line 1', pr.p(s.a + s.b * 2.6), size: 18, color: IX.accent, w: FontWeight.w600, halo: true);
        IxPaint.label(c, 'line 2', pr.p(s.a2 + s.b2 * 2.6), size: 18, color: IX.green, w: FontWeight.w600, halo: true);
      case 'vectors':
        switch (s.op) {
          case 'scale':
            arrow(o, s.a * s.k, IX.positive, 'k a', w: 6);
            arrow(o, s.a, IX.accent, 'a', w: 3.5);
          case 'section':
            final r = (s.b * s.m + s.a * s.n) * (1 / (s.m + s.n));
            pr.line(c, s.a, s.b, IX.ink, w: 3);
            arrow(o, s.a, IX.accent, 'a', w: 3);
            arrow(o, s.b, IX.green, 'b', w: 3);
            arrow(o, r, IX.positive, 'r', w: 4);
            pt(s.a, 'A', IX.accent, r: 7);
            pt(s.b, 'B', IX.green, r: 7);
            pt(r, 'R (${fmtT(s.m)} : ${fmtT(s.n)})', IX.positive);
          case 'dot':
            final proj = s.b.unit * (s.a.dot(s.b) / s.b.len);
            pr.line(c, s.a, proj, IX.steel, w: 2, dashed: true);
            pr.line(c, o, proj, IX.amber, w: 7);
            arrow(o, s.a, IX.accent, 'a');
            arrow(o, s.b, IX.green, 'b');
            IxPaint.label(c, 'projection', pr.p(proj * 0.5) + const Offset(0, 22), size: 18, color: IX.amber, w: FontWeight.w600, halo: true);
          case 'cross':
            final cr = s.a.cross(s.b);
            pr.poly(c, [o, s.a, s.a + s.b, s.b], IX.accent.withValues(alpha: 0.14), edge: IX.accent.withValues(alpha: 0.5));
            arrow(o, s.a, IX.accent, 'a');
            arrow(o, s.b, IX.green, 'b');
            arrow(o, cr, MX.violet, 'a × b', w: 5);
            IxPaint.label(c, 'area = |a × b|', pr.p((s.a + s.b) * 0.5), size: 18, color: IX.accent, w: FontWeight.w600, halo: true);
          case 'components':
            final a = s.a;
            pr.line(c, o, V3(a.x, 0, 0), MX.red, w: 5);
            pr.line(c, V3(a.x, 0, 0), V3(a.x, a.y, 0), IX.green, w: 5);
            pr.line(c, V3(a.x, a.y, 0), a, IX.accent, w: 5);
            arrow(o, a, IX.ink, 'a', w: 4);
            IxPaint.label(c, '${fmtT(a.x)} î', pr.p(V3(a.x / 2, 0, 0)) + const Offset(0, 20), size: 18, color: MX.red, w: FontWeight.w700, halo: true);
            IxPaint.label(c, '${fmtT(a.y)} ĵ', pr.p(V3(a.x, a.y / 2, 0)) + const Offset(0, 20), size: 18, color: IX.green, w: FontWeight.w700, halo: true);
            IxPaint.label(c, '${fmtT(a.z)} k̂', pr.p(V3(a.x, a.y, a.z / 2)) + const Offset(16, 0), size: 18, color: IX.accent, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
          default:
            arrow(o, s.a, IX.accent, 'a');
            arrow(s.a, s.a + s.b, IX.green, 'b');
            arrow(o, s.a + s.b, IX.positive, 'a + b', w: 5);
            pr.line(c, o, s.b, IX.green.withValues(alpha: 0.4), w: 2, dashed: true);
            pr.line(c, s.b, s.a + s.b, IX.accent.withValues(alpha: 0.4), w: 2, dashed: true);
        }
      default:
        final p = s.P;
        final A = V3(p.x, 0, 0), F = V3(p.x, p.y, 0);
        pr.line(c, o, A, MX.red, w: 4.5);
        pr.line(c, A, F, IX.green, w: 4.5);
        pr.line(c, F, p, IX.accent, w: 4.5);
        pr.line(c, V3(0, p.y, 0), F, IX.steel, w: 1.6, dashed: true);
        pr.line(c, V3(0, 0, p.z), p, IX.steel, w: 1.6, dashed: true);
        pr.line(c, o, p, IX.ink.withValues(alpha: 0.5), w: 2, dashed: true);
        IxPaint.label(c, 'x = ${fmtT(p.x)}', pr.p(A * 0.5) + const Offset(0, 22), size: 18, color: MX.red, w: FontWeight.w700, halo: true);
        IxPaint.label(c, 'y = ${fmtT(p.y)}', pr.p((A + F) * 0.5) + const Offset(0, 22), size: 18, color: IX.green, w: FontWeight.w700, halo: true);
        IxPaint.label(c, 'z = ${fmtT(p.z)}', pr.p((F + p) * 0.5) + const Offset(16, 0), size: 18, color: IX.accent, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
        pt(p, 'P${p.show(1)}', IX.positive, r: 11);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
