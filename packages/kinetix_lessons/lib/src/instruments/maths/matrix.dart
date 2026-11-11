// Matrix names follow mathematical notation (A, M₃, P₁).
// ignore_for_file: non_constant_identifier_names, constant_identifier_names

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'common.dart';

typedef M2 = List<List<double>>;

M2 mul(M2 a, M2 b) => [
  for (var i = 0; i < a.length; i++) [for (var j = 0; j < b[0].length; j++) [for (var k = 0; k < b.length; k++) a[i][k] * b[k][j]].fold(0.0, (x, y) => x + y)],
];

double det2(M2 m) => m[0][0] * m[1][1] - m[0][1] * m[1][0];
double det3(M2 m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

List<List<String>> show(M2 m, [int d = 2]) => [for (final r in m) [for (final v in r) fmtT(v, d)]];

/// Matrices and determinants as geometry: a 2 × 2 matrix transforming the plane (the
/// determinant is the area factor), AB versus BA, kP + B moving a triangle, transpose and the
/// symmetric + skew split, column operations, area of a triangle, minors and cofactors, the
/// adjoint and inverse, systems of two equations, and 2 × 2 games (saddle point, mixed strategy).
///
/// Preset: {"mode": "transform"|"product"|"scaleshift"|"transpose"|"det"|"triangle"|"cofactor"|"adjoint"|
/// "system"|"game"|"columns", "A": [[1, 1], [0, 1]], "B": [[..]], "M3": [[..],[..],[..]], "k": 1.5,
/// "p": 0, "q": 0, "alpha": 90, "s": 2, "i": 1, "j": 1, "shape": "F"|"square"|"triangle", "rhs": [3, 5],
/// "payoff": [[..], [..]], "tri": [[1, 1], [5, 2], [3, 4]], "inverse": false}.
class MatrixInstrument extends StatefulWidget {
  const MatrixInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<MatrixInstrument> createState() => _MatrixState();
}

class _MatrixState extends State<MatrixInstrument> {
  String mode = 'transform', shape = 'F';
  M2 A = [[1, 1], [0, 1]];
  M2 M3 = [[1, 2, 3], [4, 5, 6], [7, 8, 10]];
  M2 pay = [[3, -1], [-2, 4]];
  List<Offset> tri = const [Offset(1, 1), Offset(5, 2), Offset(3, 4)];
  double k = 1.5, p = 0, q = 0, alpha = 90, s = 2, c1 = 3, c2 = 5;
  int i = 1, j = 1;
  bool inverse = false, ba = false;
  int? active;

  static final _presets = <String, Map<String, dynamic>>{
    'Shear': {'mode': 'transform', 'A': [[1, 1], [0, 1]], 'shape': 'F'},
    'Determinant as area': {'mode': 'det', 'A': [[3, 1], [1, 2]]},
    'AB or BA?': {'mode': 'product', 'alpha': 90, 's': 2},
    'Inverse': {'mode': 'transform', 'A': [[1.5, 0.5], [-0.5, 1]], 'inverse': true, 'shape': 'F'},
    'Two equations': {'mode': 'system', 'A': [[1, 1], [1, 2]], 'rhs': [3, 5]},
    'Cofactors': {'mode': 'cofactor', 'M3': [[1, 2, 3], [4, 5, 6], [7, 8, 10]], 'i': 1, 'j': 1},
  };

  @override
  void initState() {
    super.initState();
    _apply(widget.preset.isEmpty ? _presets['Shear']! : widget.preset);
    if (widget.preset.isEmpty) active = 0;
  }

  M2 _m(Object? o, M2 f) {
    if (o is List && o.isNotEmpty && o.every((r) => r is List)) return [for (final r in o) [for (final v in r as List) (v as num).toDouble()]];
    return f;
  }

  void _apply(Map<String, dynamic> m) {
    mode = ps(m, 'mode', 'transform');
    shape = ps(m, 'shape', 'F');
    A = _m(m['A'], [[1, 1], [0, 1]]);
    M3 = _m(m['M3'], [[1, 2, 3], [4, 5, 6], [7, 8, 10]]);
    pay = _m(m['payoff'], [[3, -1], [-2, 4]]);
    final t = _m(m['tri'], []);
    tri = t.length == 3 ? [for (final r in t) Offset(r[0], r[1])] : const [Offset(1, 1), Offset(5, 2), Offset(3, 4)];
    k = pd(m, 'k', mode == 'det' ? 0 : 1.5);
    p = pd(m, 'p', 0);
    q = pd(m, 'q', 0);
    alpha = pd(m, 'alpha', 90);
    s = pd(m, 's', 2);
    i = pint(m, 'i', 1);
    j = pint(m, 'j', 1);
    final r = pl(m, 'rhs', [3, 5]);
    c1 = r[0];
    c2 = r[1];
    inverse = pb(m, 'inverse', false);
    ba = ps(m, 'order', 'AB') == 'BA';
  }

  M2 get rot {
    // Snap floating-point noise (cos 90° = 6e-17) to exact zeros so the matrices read cleanly.
    double z(double v) => v.abs() < 1e-12 ? 0 : v;
    final r = alpha * math.pi / 180;
    return [[z(math.cos(r)), z(-math.sin(r))], [z(math.sin(r)), z(math.cos(r))]];
  }
  M2 get stretch => [[s, 0], [0, 1]];
  M2 get colOp => [[A[0][0] + k * A[0][1], A[0][1]], [A[1][0] + k * A[1][1], A[1][1]]];

  double minor(int r, int c) {
    final rows = [0, 1, 2]..remove(r - 1);
    final cols = [0, 1, 2]..remove(c - 1);
    return M3[rows[0]][cols[0]] * M3[rows[1]][cols[1]] - M3[rows[0]][cols[1]] * M3[rows[1]][cols[0]];
  }

  Widget entry(String l, double v, ValueChanged<double> on, {double lo = -3, double hi = 3, double step = 0.5}) =>
      IxSlider(label: l, value: v.clamp(lo, hi), min: lo, max: hi, divisions: ((hi - lo) / step).round(), format: (x) => fmt(x, step < 1 ? 1 : 0), onChanged: (x) => setState(() { on(x); active = null; }));

  List<Widget> entries2(M2 m, String name, {double lo = -3, double hi = 3, double step = 0.5}) => [
    for (var r = 0; r < 2; r++)
      for (var c = 0; c < 2; c++) entry('$name${subscript(r + 1)}${subscript(c + 1)}', m[r][c], (v) => m[r][c] = v, lo: lo, hi: hi, step: step),
  ];

  @override
  Widget build(BuildContext context) {
    String title, formula;
    late List<Readout> ro;
    late List<Widget> ctl;
    switch (mode) {
      case 'product':
        final ab = mul(rot, stretch), bA = mul(stretch, rot);
        final m = ba ? bA : ab;
        title = 'AB or BA?';
        formula = 'A: rotate by ${fmtT(alpha)}°,  B: stretch across by ${fmtT(s)}';
        ro = [
          Readout(ba ? 'BA, row 1' : 'AB, row 1', '${fmt(m[0][0], 2)}   ${fmt(m[0][1], 2)}', '', IX.accent),
          Readout(ba ? 'BA, row 2' : 'AB, row 2', '${fmt(m[1][0], 2)}   ${fmt(m[1][1], 2)}', '', IX.accent),
          Readout('AB = BA?', List.generate(4, (t) => (ab[t ~/ 2][t % 2] - bA[t ~/ 2][t % 2]).abs() < 1e-9).every((v) => v) ? 'Yes, here' : 'No', '', IX.positive),
        ];
        ctl = [
          IxSegments<bool>(label: 'Order', options: const {false: 'AB: stretch, then rotate', true: 'BA: rotate, then stretch'}, value: ba, onChanged: (v) => setState(() => ba = v)),
          entry('Rotation α', alpha, (v) => alpha = v, lo: 0, hi: 180, step: 15),
          entry('Stretch s', s, (v) => s = v, lo: 0.5, hi: 3, step: 0.25),
        ];
      case 'scaleshift':
        final area = 2 * k * k;
        title = 'kP + B moves a triangle';
        formula = 'columns of P are the corners';
        ro = [Readout('k', fmt(k, 2), '', IX.ink), Readout('Shift (p, q)', '(${fmtT(p)}, ${fmtT(q)})', '', IX.green), Readout('Area of the new triangle', fmt(area, 2), '', IX.positive), Readout('Area ÷ original', fmt(k * k, 2), '= k²', IX.inkSoft)];
        ctl = [entry('k', k, (v) => k = v, lo: -2, hi: 2, step: 0.25), entry('p', p, (v) => p = v, lo: -4, hi: 4), entry('q', q, (v) => q = v, lo: -4, hi: 4)];
      case 'transpose':
        title = 'Transpose: symmetric + skew-symmetric';
        formula = 'A = ½(A + A′) + ½(A − A′)';
        ro = [
          Readout('P₁₂ = P₂₁', fmt((A[0][1] + A[1][0]) / 2, 2), '', IX.green),
          Readout('Q₁₂ = −Q₂₁', fmt((A[0][1] - A[1][0]) / 2, 2), '', IX.positive),
          Readout('A symmetric?', (A[0][1] - A[1][0]).abs() < 1e-9 ? 'Yes' : 'No', '', IX.ink),
        ];
        ctl = entries2(A, 'a', lo: -5, hi: 5, step: 1);
      case 'det':
        final m = colOp;
        title = 'The determinant is an area';
        formula = '|A| = ad − bc';
        ro = [
          Readout('|A| now', fmt(det2(m), 2), '', IX.positive),
          Readout('|A| before the operation', fmt(det2(A), 2), '', IX.ink),
          Readout('Orientation', det2(m) > 0 ? 'kept' : det2(m) < 0 ? 'flipped' : 'flattened', '', IX.inkSoft),
        ];
        ctl = [
          entry('C₁ → C₁ + k C₂: k', k, (v) => k = v, lo: -2, hi: 2, step: 0.25),
          IxButton('Swap the columns', icon: Icons.swap_horiz_rounded, onTap: () => setState(() => A = [[A[0][1], A[0][0]], [A[1][1], A[1][0]]])),
          ...entries2(A, 'a'),
        ];
      case 'triangle':
        final [P1, P2, P3] = tri;
        final D = P1.dx * (P2.dy - P3.dy) + P2.dx * (P3.dy - P1.dy) + P3.dx * (P1.dy - P2.dy);
        title = 'Area of a triangle by determinant';
        formula = 'Δ = ½ |x₁(y₂ − y₃) + x₂(y₃ − y₁) + x₃(y₁ − y₂)|';
        ro = [Readout('Determinant', fmt(D, 2), '', IX.ink), Readout('Area Δ', fmt(D.abs() / 2, 2), 'sq. units', IX.positive), Readout('Collinear?', D.abs() < 1e-9 ? 'Yes, Δ = 0' : 'No', '', D.abs() < 1e-9 ? MX.red : IX.green)];
        ctl = [
          entry('Third corner: x', P3.dx, (v) => tri = [P1, P2, Offset(v, P3.dy)], lo: -5, hi: 10),
          entry('Third corner: y', P3.dy, (v) => tri = [P1, P2, Offset(P3.dx, v)], lo: -5, hi: 10),
        ];
      case 'cofactor':
        final mn = minor(i, j), cf = ((i + j).isEven ? 1 : -1) * mn;
        final ex = [for (var c = 1; c <= 3; c++) M3[i - 1][c - 1] * (((i + c).isEven ? 1 : -1) * minor(i, c))].fold(0.0, (x, y) => x + y);
        title = 'Minors and cofactors';
        formula = 'Aᵢⱼ = (−1)ⁱ⁺ʲ Mᵢⱼ';
        ro = [
          Readout('Minor M${subscript(i)}${subscript(j)}', fmt(mn, 2), '', IX.accent),
          Readout('Cofactor A${subscript(i)}${subscript(j)}', fmt(cf, 2), '', IX.positive),
          Readout('|A| along row $i', fmt(ex, 2), '', IX.ink),
          Readout('|A| directly', fmt(det3(M3), 2), '', IX.green),
        ];
        ctl = [
          IxSegments<int>(label: 'Row i', options: const {1: '1', 2: '2', 3: '3'}, value: i, onChanged: (v) => setState(() => i = v)),
          IxSegments<int>(label: 'Column j', options: const {1: '1', 2: '2', 3: '3'}, value: j, onChanged: (v) => setState(() => j = v)),
          entry('a₁₁', M3[0][0], (v) => M3[0][0] = v, lo: -5, hi: 5, step: 1),
          entry('a₂₂', M3[1][1], (v) => M3[1][1] = v, lo: -5, hi: 10, step: 1),
          entry('a₃₃', M3[2][2], (v) => M3[2][2] = v, lo: -5, hi: 15, step: 1),
        ];
      case 'adjoint':
        final d = det2(A);
        title = 'The adjoint and the inverse';
        formula = 'A · adj A = |A| I,   A⁻¹ = adj A / |A|';
        ro = [Readout('|A|', fmt(d, 2), '', IX.ink), Readout('|adj A|', fmt(d, 2), '', IX.accent), Readout('A⁻¹ exists?', d.abs() < 1e-9 ? 'No: |A| = 0' : 'Yes', '', d.abs() < 1e-9 ? MX.red : IX.green)];
        ctl = entries2(A, 'a', lo: -4, hi: 4, step: 1);
      case 'system':
        final d = det2(A);
        final x = d.abs() < 1e-9 ? double.nan : (c1 * A[1][1] - A[0][1] * c2) / d, y = d.abs() < 1e-9 ? double.nan : (A[0][0] * c2 - c1 * A[1][0]) / d;
        final adjB = [A[1][1] * c1 - A[0][1] * c2, -A[1][0] * c1 + A[0][0] * c2];
        final kind = d.abs() > 1e-9 ? 'one solution' : (adjB[0].abs() < 1e-9 && adjB[1].abs() < 1e-9) ? 'infinitely many' : 'no solution';
        title = 'One, none or infinitely many';
        formula = 'AX = B,  X = A⁻¹B when |A| ≠ 0';
        ro = [Readout('|A|', fmt(d, 2), '', IX.ink), Readout('Solutions', kind, '', d.abs() > 1e-9 ? IX.green : MX.red), if (d.abs() > 1e-9) Readout('x', fmt(x, 3), '', IX.accent), if (d.abs() > 1e-9) Readout('y', fmt(y, 3), '', IX.positive), if (d.abs() < 1e-9) Readout('(adj A)B', '(${fmtT(adjB[0])}, ${fmtT(adjB[1])})', '', IX.inkSoft)];
        ctl = [entry('a (coefficient of x, eq. 1)', A[0][0], (v) => A[0][0] = v, lo: -1, hi: 3, step: 0.5), entry('c₁', c1, (v) => c1 = v, lo: -4, hi: 8), entry('c₂', c2, (v) => c2 = v, lo: -4, hi: 8)];
      case 'game':
        final rowMin = [for (final r in pay) r.reduce(math.min)];
        final colMax = [for (var c = 0; c < pay[0].length; c++) [for (final r in pay) r[c]].reduce(math.max)];
        final maximin = rowMin.reduce(math.max), minimax = colMax.reduce(math.min);
        final saddle = (maximin - minimax).abs() < 1e-9;
        String mixed = '—', val = fmt(maximin, 2);
        if (!saddle && pay.length == 2 && pay[0].length == 2) {
          final a11 = pay[0][0], a12 = pay[0][1], a21 = pay[1][0], a22 = pay[1][1];
          final den = a11 + a22 - a12 - a21;
          final pp = (a22 - a21) / den;
          mixed = 'p = ${fmt(pp, 3)},  1 − p = ${fmt(1 - pp, 3)}';
          val = fmt((a11 * a22 - a12 * a21) / den, 3);
        }
        title = saddle ? 'Hunt for the saddle point' : 'Play the mixed strategy';
        formula = 'maximin = ${fmtT(maximin)},  minimax = ${fmtT(minimax)}';
        ro = [
          Readout('Saddle point', saddle ? 'Yes' : 'No', '', saddle ? IX.green : MX.red),
          Readout('Value of the game', val, '', IX.positive),
          if (!saddle) Readout('Player A plays row 1 with', mixed, '', IX.accent),
        ];
        ctl = [for (var r = 0; r < pay.length; r++) for (var c = 0; c < pay[0].length; c++) entry('a${subscript(r + 1)}${subscript(c + 1)}', pay[r][c], (v) => pay[r][c] = v, lo: -6, hi: 6, step: 1)];
      case 'columns':
        title = 'Column matrices as arrows';
        formula = 'A + B adds the arrows';
        final u = Offset(A[0][0], A[1][0]), v = Offset(A[0][1], A[1][1]);
        ro = [Readout('A', '(${fmtT(u.dx)}, ${fmtT(u.dy)})', '', IX.accent), Readout('B', '(${fmtT(v.dx)}, ${fmtT(v.dy)})', '', IX.green), Readout('A + B', '(${fmtT(u.dx + v.dx)}, ${fmtT(u.dy + v.dy)})', '', IX.positive), Readout('kA', '(${fmtT(k * u.dx)}, ${fmtT(k * u.dy)})', '', IX.inkSoft)];
        ctl = [...entries2(A, 'col '), entry('k', k, (x) => k = x, lo: -2, hi: 3, step: 0.5)];
      default:
        final d = det2(A);
        title = inverse ? 'Apply A, then undo it' : 'A matrix transforms the plane';
        formula = '|A| = ${fmt(d, 2)}: areas are multiplied by ${fmt(d.abs(), 2)}';
        ro = [
          Readout('|A|', fmt(d, 2), '', IX.positive),
          Readout('A î', '(${fmtT(A[0][0])}, ${fmtT(A[1][0])})', '', MX.red),
          Readout('A ĵ', '(${fmtT(A[0][1])}, ${fmtT(A[1][1])})', '', IX.green),
          Readout('Inverse', d.abs() < 1e-9 ? 'none: |A| = 0' : 'exists', '', d.abs() < 1e-9 ? MX.red : IX.ink),
        ];
        ctl = [
          ...entries2(A, 'a', lo: -2, hi: 2, step: 0.25),
          IxToggle(label: 'Then apply A⁻¹', value: inverse, onChanged: (v) => setState(() => inverse = v)),
          IxSegments<String>(label: 'Shape', options: const {'F': 'Letter F', 'square': 'Unit square', 'triangle': 'Triangle'}, value: shape, onChanged: (v) => setState(() => shape = v)),
        ];
    }
    return InstrumentFrame(
      id: 'maths-matrix',
      subtitle: tx(widget.preset['subtitle']) ?? (mode == 'game' ? '$kStats · Game theory' : ['det', 'triangle', 'cofactor', 'adjoint', 'system'].contains(mode) ? '$kMaths · Determinants' : '$kMaths · Matrices'),
      title: tx(widget.preset['title']) ?? title,
      formula: formula,
      state: {'mode': mode, 'A': A, 'k': k},
      readouts: ro,
      controls: ctl,
      presets: [for (final (n, e) in _presets.entries.indexed) Preset(e.key, () => setState(() { _apply(e.value); active = n; }))],
      activePreset: active,
      stage: CustomPaint(painter: _MatPainter(this), size: Size.infinite),
    );
  }
}

class _MatPainter extends CustomPainter {
  _MatPainter(this.s);
  final _MatrixState s;

  static const _F = [Offset(0, 0), Offset(0, 3), Offset(2, 3), Offset(2, 2.5), Offset(0.6, 2.5), Offset(0.6, 1.7), Offset(1.6, 1.7), Offset(1.6, 1.2), Offset(0.6, 1.2), Offset(0.6, 0)];

  List<Offset> shapePts(String shape) => switch (shape) {
    'square' => const [Offset(0, 0), Offset(1, 0), Offset(1, 1), Offset(0, 1)],
    'triangle' => const [Offset(1, 1), Offset(3, 1), Offset(2, 3)],
    _ => _F,
  };

  Offset ap(M2 m, Offset v) => Offset(m[0][0] * v.dx + m[0][1] * v.dy, m[1][0] * v.dx + m[1][1] * v.dy);

  void poly(Canvas c, Plane pl, List<Offset> pts, Color col, {double fill = 0.18, double w = 3, bool dashed = false}) {
    final path = Path()..addPolygon([for (final v in pts) pl.p(v.dx, v.dy)], true);
    if (fill > 0) c.drawPath(path, Paint()..color = col.withValues(alpha: fill));
    dashed ? MPaint.dashedPath(c, path, MPaint.stroke(col, w)) : c.drawPath(path, MPaint.stroke(col, w));
  }

  void gridImage(Canvas c, Plane pl, M2 m) {
    c.save();
    c.clipRect(pl.rect);
    final pnt = MPaint.stroke(IX.accent.withValues(alpha: 0.18), 1.5);
    for (var t = -8; t <= 8; t++) {
      c.drawLine(pl.p(ap(m, Offset(t.toDouble(), -8)).dx, ap(m, Offset(t.toDouble(), -8)).dy), pl.p(ap(m, Offset(t.toDouble(), 8)).dx, ap(m, Offset(t.toDouble(), 8)).dy), pnt);
      c.drawLine(pl.p(ap(m, Offset(-8, t.toDouble())).dx, ap(m, Offset(-8, t.toDouble())).dy), pl.p(ap(m, Offset(8, t.toDouble())).dx, ap(m, Offset(8, t.toDouble())).dy), pnt);
    }
    c.restore();
  }

  void arrow(Canvas c, Plane pl, Offset to, Color col, String name, {Offset from = Offset.zero}) {
    IxPaint.arrow(c, pl.p(from.dx, from.dy), pl.p(to.dx, to.dy), col, width: 4, head: 16);
    IxPaint.label(c, name, pl.p(to.dx, to.dy) + const Offset(14, -16), size: 20, color: col, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
  }

  @override
  void paint(Canvas c, Size size) {
    final left = Rect.fromLTRB(70, 40, size.width * 0.66, size.height - 50);
    final side = Rect.fromLTRB(size.width * 0.69, 50, size.width - 30, size.height - 50);
    switch (s.mode) {
      case 'product':
        final pl = Plane(left, -4, 4, -4, 4, equal: true);
        pl.paintGrid(c);
        final m = s.ba ? mul(s.stretch, s.rot) : mul(s.rot, s.stretch);
        final other = s.ba ? mul(s.rot, s.stretch) : mul(s.stretch, s.rot);
        poly(c, pl, _F, IX.steel, fill: 0.08, w: 2);
        poly(c, pl, [for (final v in _F) ap(other, v)], IX.steel, fill: 0, w: 2, dashed: true);
        poly(c, pl, [for (final v in _F) ap(m, v)], IX.positive, w: 3.5);
        MPaint.legend(c, Offset(pl.rect.left + 16, pl.rect.top + 8), [(IX.steel, 'F'), (IX.positive, s.ba ? 'BA · F' : 'AB · F'), (IX.steel, s.ba ? 'AB · F (dashed)' : 'BA · F (dashed)')], size: 17);
        _matrices(c, side, [('A', s.rot), ('B', s.stretch), (s.ba ? 'BA' : 'AB', m)]);
      case 'scaleshift':
        final pl = Plane(left, -6, 8, -5, 8, equal: true);
        pl.paintGrid(c);
        const P = [Offset(1, 1), Offset(3, 1), Offset(2, 3)];
        poly(c, pl, P, IX.steel, fill: 0.1, w: 2);
        final Q = [for (final v in P) v * s.k + Offset(s.p, s.q)];
        poly(c, pl, Q, IX.positive, w: 3.5);
        for (final (n, v) in Q.indexed) {
          MPaint.dot(c, pl.p(v.dx, v.dy), IX.positive, r: 7);
          IxPaint.label(c, '(${fmtT(v.dx)}, ${fmtT(v.dy)})', pl.p(v.dx, v.dy) + Offset(12, n == 2 ? -16 : 18), size: 17, color: IX.positive, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
        }
        _matrices(c, side, [('P', [[1, 3, 2], [1, 1, 3]]), ('kP + B', [[for (final v in Q) v.dx], [for (final v in Q) v.dy]])]);
      case 'transpose':
        final A = s.A;
        final At = [[A[0][0], A[1][0]], [A[0][1], A[1][1]]];
        final P = [[A[0][0], (A[0][1] + A[1][0]) / 2], [(A[0][1] + A[1][0]) / 2, A[1][1]]];
        final Q = [[0.0, (A[0][1] - A[1][0]) / 2], [(A[1][0] - A[0][1]) / 2, 0.0]];
        var x = 80.0;
        final y = size.height * 0.36;
        for (final (n, m, col) in [('A', A, IX.ink), ('A′', At, IX.accent)]) {
          IxPaint.label(c, '$n =', Offset(x, y + 50), size: 30, color: col, w: FontWeight.w700, align: Alignment.centerLeft);
          final sz = MPaint.matrix(c, Offset(x + 70, y), show(m), size: 30, color: col, cellColors: [[null, IX.amber.withValues(alpha: 0.2)], [IX.amber.withValues(alpha: 0.2), null]]);
          x += sz.width + 160;
        }
        final y2 = size.height * 0.66;
        x = 80;
        IxPaint.label(c, 'A =', Offset(x, y2 + 50), size: 28, color: IX.ink, w: FontWeight.w700, align: Alignment.centerLeft);
        x += 70;
        var sz = MPaint.matrix(c, Offset(x, y2), show(P), size: 28, color: IX.green);
        IxPaint.label(c, 'symmetric P', Offset(x + sz.width / 2, y2 + sz.height + 24), size: 18, color: IX.green, w: FontWeight.w600);
        x += sz.width + 30;
        IxPaint.label(c, '+', Offset(x, y2 + 50), size: 30, color: IX.ink, w: FontWeight.w700, align: Alignment.centerLeft);
        x += 50;
        sz = MPaint.matrix(c, Offset(x, y2), show(Q), size: 28, color: IX.positive);
        IxPaint.label(c, 'skew-symmetric Q', Offset(x + sz.width / 2, y2 + sz.height + 24), size: 18, color: IX.positive, w: FontWeight.w600);
        IxPaint.label(c, 'Transpose: a₁₂ and a₂₁ swap across the leading diagonal', Offset(80, 60), size: 21, color: IX.inkSoft, align: Alignment.centerLeft);
      case 'det':
        final m = s.colOp;
        final pl = Plane(left, -5, 6, -4, 6, equal: true);
        pl.paintGrid(c);
        final u = Offset(m[0][0], m[1][0]), v = Offset(m[0][1], m[1][1]);
        final u0 = Offset(s.A[0][0], s.A[1][0]);
        if (s.k != 0) poly(c, pl, [Offset.zero, u0, u0 + v, v], IX.steel, fill: 0.06, w: 1.6, dashed: true);
        final d = det2(m);
        poly(c, pl, [Offset.zero, u, u + v, v], d >= 0 ? IX.accent : IX.positive, fill: 0.2);
        arrow(c, pl, u, MX.red, 'C₁');
        arrow(c, pl, v, IX.green, 'C₂');
        final ctr = (u + v) / 2;
        IxPaint.label(c, 'area ${fmt(d.abs(), 2)}', pl.p(ctr.dx, ctr.dy), size: 22, color: IX.ink, w: FontWeight.w700, halo: true);
        _matrices(c, side, [('A', m)]);
      case 'triangle':
        final pl = Plane(left, -5, 10, -5, 10, equal: true);
        pl.paintGrid(c);
        poly(c, pl, s.tri, IX.green, fill: 0.18);
        for (final (n, v) in s.tri.indexed) {
          MPaint.dot(c, pl.p(v.dx, v.dy), IX.ink, r: 8);
          IxPaint.label(c, '${'ABC'[n]}(${fmtT(v.dx)}, ${fmtT(v.dy)})', pl.p(v.dx, v.dy) + const Offset(14, -18), size: 19, color: IX.ink, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
        }
        _matrices(c, side, [('½ ×', [for (final v in s.tri) [v.dx, v.dy, 1]])]);
      case 'cofactor':
        final cells = [for (var r = 0; r < 3; r++) [for (var cc = 0; cc < 3; cc++) r == s.i - 1 && cc == s.j - 1 ? IX.positive.withValues(alpha: 0.25) : (r == s.i - 1 || cc == s.j - 1) ? IX.rule.withValues(alpha: 0.6) : IX.accent.withValues(alpha: 0.12)]];
        IxPaint.label(c, 'A =', Offset(80, size.height * 0.3), size: 32, color: IX.ink, w: FontWeight.w700, align: Alignment.centerLeft);
        final sz = MPaint.matrix(c, Offset(160, size.height * 0.3 - 80), show(s.M3, 0), size: 34, cellColors: cells, cellW: 50);
        final rows = [0, 1, 2]..remove(s.i - 1);
        final cols = [0, 1, 2]..remove(s.j - 1);
        final sub = [for (final r in rows) [for (final cc in cols) s.M3[r][cc]]];
        final x2 = 160 + sz.width + 120;
        IxPaint.label(c, 'M${subscript(s.i)}${subscript(s.j)} =', Offset(x2, size.height * 0.3), size: 28, color: IX.accent, w: FontWeight.w700, align: Alignment.centerLeft);
        final sz2 = MPaint.matrix(c, Offset(x2 + 110, size.height * 0.3 - 54), show(sub, 0), size: 30, color: IX.accent);
        IxPaint.label(c, '= ${fmt(s.minor(s.i, s.j), 0)}', Offset(x2 + 130 + sz2.width, size.height * 0.3), size: 28, color: IX.accent, w: FontWeight.w700, align: Alignment.centerLeft);
        IxPaint.label(c, 'A${subscript(s.i)}${subscript(s.j)} = (−1)${superscript(s.i + s.j)} × ${fmt(s.minor(s.i, s.j), 0)} = ${fmt(((s.i + s.j).isEven ? 1 : -1) * s.minor(s.i, s.j), 0)}', Offset(80, size.height * 0.66), size: 30, color: IX.positive, w: FontWeight.w700, align: Alignment.centerLeft);
        IxPaint.label(c, 'Cross out row ${s.i} and column ${s.j}; the 2 × 2 determinant left is the minor.', Offset(80, size.height * 0.8), size: 21, color: IX.inkSoft, align: Alignment.centerLeft);
      case 'adjoint':
        final A = s.A, d = det2(A);
        final adj = [[A[1][1], -A[0][1]], [-A[1][0], A[0][0]]];
        var x = 70.0;
        final y = size.height * 0.25;
        for (final (n, m, col) in [('A', A, IX.ink), ('adj A', adj, IX.accent), ('A · adj A', mul(A, adj), IX.positive)]) {
          IxPaint.label(c, n, Offset(x, y - 30), size: 22, color: col, w: FontWeight.w700, align: Alignment.centerLeft);
          final sz = MPaint.matrix(c, Offset(x, y), show(m), size: 30, color: col);
          x += sz.width + 90;
        }
        IxPaint.label(c, '= ${fmt(d, 2)} I', Offset(x - 70, y + 50), size: 28, color: IX.positive, w: FontWeight.w700, align: Alignment.centerLeft);
        if (d.abs() > 1e-9) {
          IxPaint.label(c, 'A⁻¹ = adj A / |A| =', Offset(70, size.height * 0.68), size: 26, color: IX.ink, w: FontWeight.w700, align: Alignment.centerLeft);
          MPaint.matrix(c, Offset(330, size.height * 0.68 - 50), show([[adj[0][0] / d, adj[0][1] / d], [adj[1][0] / d, adj[1][1] / d]], 3), size: 28, color: IX.green);
        } else {
          IxPaint.label(c, '|A| = 0: A is singular and has no inverse', Offset(70, size.height * 0.68), size: 26, color: MX.red, w: FontWeight.w700, align: Alignment.centerLeft);
        }
        IxPaint.label(c, 'For a 2 × 2 matrix: swap a and d, change the signs of b and c.', Offset(70, size.height - 50), size: 20, color: IX.inkSoft, align: Alignment.centerLeft);
      case 'system':
        final pl = Plane(left, -4, 8, -4, 8, equal: true);
        pl.paintGrid(c);
        void line(double a, double b, double cc, Color col, String name, double t) {
          c.save();
          c.clipRect(pl.rect);
          if (b.abs() > 1e-9) {
            c.drawLine(pl.p(pl.xa, (cc - a * pl.xa) / b), pl.p(pl.xb, (cc - a * pl.xb) / b), MPaint.stroke(col, 4));
          } else {
            c.drawLine(pl.p(cc / a, pl.ya), pl.p(cc / a, pl.yb), MPaint.stroke(col, 4));
          }
          c.restore();
          final x = pl.xa + (pl.xb - pl.xa) * t;
          final y = b.abs() > 1e-9 ? (cc - a * x) / b : 0.0;
          if (pl.contains(x, y)) IxPaint.label(c, name, pl.p(x, y) + const Offset(10, -18), size: 19, color: col, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
        }
        final A = s.A;
        line(A[0][0], A[0][1], s.c1, IX.accent, '${coef(A[0][0], 'x', lead: true)}${A[0][0] == 0 ? coef(A[0][1], 'y', lead: true) : coef(A[0][1], 'y')} = ${fmtT(s.c1)}', 0.15);
        line(A[1][0], A[1][1], s.c2, IX.positive, '${coef(A[1][0], 'x', lead: true)}${coef(A[1][1], 'y')} = ${fmtT(s.c2)}', 0.7);
        final d = det2(A);
        if (d.abs() > 1e-9) {
          final x = (s.c1 * A[1][1] - A[0][1] * s.c2) / d, y = (A[0][0] * s.c2 - s.c1 * A[1][0]) / d;
          if (pl.contains(x, y)) {
            MPaint.dot(c, pl.p(x, y), IX.ink, r: 10);
            IxPaint.label(c, '(${fmt(x, 2)}, ${fmt(y, 2)})', pl.p(x, y) + const Offset(16, 20), size: 20, color: IX.ink, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
          }
        }
        _matrices(c, side, [('A', A), ('B', [[s.c1], [s.c2]])]);
      case 'game':
        final rows = s.pay.length, cols = s.pay[0].length;
        final rowMin = [for (final r in s.pay) r.reduce(math.min)];
        final colMax = [for (var cc = 0; cc < cols; cc++) [for (final r in s.pay) r[cc]].reduce(math.max)];
        final cw = 110.0, rh = 74.0;
        final o = Offset(140, 110);
        for (var cc = 0; cc < cols; cc++) {
          IxPaint.label(c, 'B${subscript(cc + 1)}', o + Offset(cw * (cc + 0.5), -24), size: 22, color: IX.green, w: FontWeight.w700);
        }
        IxPaint.label(c, 'row min', o + Offset(cw * (cols + 0.6), -24), size: 18, color: IX.inkSoft, w: FontWeight.w600);
        for (var r = 0; r < rows; r++) {
          IxPaint.label(c, 'A${subscript(r + 1)}', o + Offset(-34, rh * (r + 0.5)), size: 22, color: IX.accent, w: FontWeight.w700);
          for (var cc = 0; cc < cols; cc++) {
            final v = s.pay[r][cc];
            final isSaddle = v == rowMin[r] && v == colMax[cc];
            final rect = Rect.fromLTWH(o.dx + cw * cc, o.dy + rh * r, cw, rh);
            c.drawRect(rect, Paint()..color = isSaddle ? IX.positive.withValues(alpha: 0.2) : Colors.white);
            c.drawRect(rect, MPaint.stroke(IX.rule, 1.5));
            IxPaint.label(c, fmtT(v), rect.center, size: 28, color: IX.ink, w: FontWeight.w700);
          }
          IxPaint.label(c, fmtT(rowMin[r]), o + Offset(cw * (cols + 0.6), rh * (r + 0.5)), size: 24, color: IX.accent, w: FontWeight.w600);
        }
        IxPaint.label(c, 'column max', o + Offset(-60, rh * rows + 30), size: 18, color: IX.inkSoft, w: FontWeight.w600, align: Alignment.centerRight);
        for (var cc = 0; cc < cols; cc++) {
          IxPaint.label(c, fmtT(colMax[cc]), o + Offset(cw * (cc + 0.5), rh * rows + 30), size: 24, color: IX.green, w: FontWeight.w600);
        }
        if (rows == 2 && cols == 2) {
          // Expected payoff of A against each pure strategy of B, as p varies.
          final pl = Plane(Rect.fromLTRB(size.width * 0.5, 70, size.width - 50, size.height - 70), 0, 1, [for (final r in s.pay) ...r].reduce(math.min) - 1, [for (final r in s.pay) ...r].reduce(math.max) + 1);
          pl.paintGrid(c, xLabel: 'p', yLabel: 'payoff', xStep: 0.25);
          for (var cc = 0; cc < 2; cc++) {
            pl.curve(c, (x) => s.pay[0][cc] * x + s.pay[1][cc] * (1 - x), MX.series[cc + 1], width: 3.5);
          }
          pl.curve(c, (x) => math.min(s.pay[0][0] * x + s.pay[1][0] * (1 - x), s.pay[0][1] * x + s.pay[1][1] * (1 - x)), IX.ink, width: 2, dashed: true);
          MPaint.legend(c, Offset(pl.rect.left + 12, pl.rect.top + 6), [(MX.series[1], 'if B plays B₁'), (MX.series[2], 'if B plays B₂')], size: 16);
        }
      case 'columns':
        final pl = Plane(left, -6, 6, -5, 6, equal: true);
        pl.paintGrid(c);
        final u = Offset(s.A[0][0], s.A[1][0]), v = Offset(s.A[0][1], s.A[1][1]);
        IxPaint.dashed(c, pl.p(u.dx, u.dy), pl.p(u.dx + v.dx, u.dy + v.dy), MPaint.stroke(IX.green.withValues(alpha: 0.5), 2));
        IxPaint.dashed(c, pl.p(v.dx, v.dy), pl.p(u.dx + v.dx, u.dy + v.dy), MPaint.stroke(IX.accent.withValues(alpha: 0.5), 2));
        arrow(c, pl, u * s.k, IX.inkSoft, 'kA');
        arrow(c, pl, u, IX.accent, 'A');
        arrow(c, pl, v, IX.green, 'B');
        arrow(c, pl, u + v, IX.positive, 'A + B');
        _matrices(c, side, [('A', [[u.dx], [u.dy]]), ('B', [[v.dx], [v.dy]]), ('A + B', [[u.dx + v.dx], [u.dy + v.dy]])]);
      default:
        final pl = Plane(left, -5, 5, -4, 5, equal: true);
        pl.paintGrid(c);
        gridImage(c, pl, s.A);
        final pts = shapePts(s.shape);
        poly(c, pl, pts, IX.steel, fill: 0.08, w: 2);
        final img = [for (final v in pts) ap(s.A, v)];
        final d = det2(s.A);
        poly(c, pl, img, IX.accent, w: 3.5);
        arrow(c, pl, ap(s.A, const Offset(1, 0)), MX.red, 'Aî');
        arrow(c, pl, ap(s.A, const Offset(0, 1)), IX.green, 'Aĵ');
        if (s.inverse && d.abs() > 1e-9) {
          final inv = [[s.A[1][1] / d, -s.A[0][1] / d], [-s.A[1][0] / d, s.A[0][0] / d]];
          poly(c, pl, [for (final v in img) ap(inv, v)], IX.positive, fill: 0, w: 3, dashed: true);
          IxPaint.label(c, 'A⁻¹A = I: back where it started', Offset(pl.rect.left + 16, pl.rect.bottom - 24), size: 19, color: IX.positive, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
        } else if (s.inverse) {
          IxPaint.label(c, '|A| = 0: the plane is flattened onto a line; nothing can undo it', Offset(pl.rect.left + 16, pl.rect.bottom - 24), size: 19, color: MX.red, w: FontWeight.w600, align: Alignment.centerLeft, halo: true);
        }
        _matrices(c, side, [('A', s.A), if (d.abs() > 1e-9) ('A⁻¹', [[s.A[1][1] / d, -s.A[0][1] / d], [-s.A[1][0] / d, s.A[0][0] / d]])]);
    }
  }

  void _matrices(Canvas c, Rect box, List<(String, M2)> ms) {
    var y = box.top + 10;
    for (final (n, m) in ms) {
      IxPaint.label(c, n, Offset(box.left, y), size: 22, color: IX.inkSoft, w: FontWeight.w700, align: Alignment.topLeft);
      final sz = MPaint.matrix(c, Offset(box.left, y + 34), show(m), size: m[0].length > 2 ? 22 : 26);
      y += sz.height + 70;
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
