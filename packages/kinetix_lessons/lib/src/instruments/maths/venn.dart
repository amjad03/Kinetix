import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'common.dart';

enum VennOp { union, inter, aMinusB, bMinusA, symDiff, compA, compB, compUnion, compInter, a, b }

const _opText = {
  VennOp.union: 'A ∪ B',
  VennOp.inter: 'A ∩ B',
  VennOp.aMinusB: 'A − B',
  VennOp.bMinusA: 'B − A',
  VennOp.symDiff: '(A − B) ∪ (B − A)',
  VennOp.compA: 'A′',
  VennOp.compB: 'B′',
  VennOp.compUnion: '(A ∪ B)′',
  VennOp.compInter: '(A ∩ B)′',
  VennOp.a: 'A',
  VennOp.b: 'B',
};

/// Which of the four regions (only A, A and B, only B, neither) an operation keeps.
List<bool> _regions(VennOp op) => switch (op) {
  VennOp.union => [true, true, true, false],
  VennOp.inter => [false, true, false, false],
  VennOp.aMinusB => [true, false, false, false],
  VennOp.bMinusA => [false, false, true, false],
  VennOp.symDiff => [true, false, true, false],
  VennOp.compA => [false, false, true, true],
  VennOp.compB => [true, false, false, true],
  VennOp.compUnion => [false, false, false, true],
  VennOp.compInter => [true, false, true, true],
  VennOp.a => [true, true, false, false],
  VennOp.b => [false, true, true, false],
};

/// Venn diagrams for sets, logic and the theory of attributes.
///
/// Preset: {"mode": "ops"|"counts"|"logic"|"attributes", "op": "union"|"inter"|"aMinusB"|…,
/// "U": [1,…,10], "A": [..], "B": [..], "n": {"u": 60, "a": 35, "b": 30, "ab": 15},
/// "p": true, "q": false, "connective": "and"|"or"|"implies"|"iff"|"not"|"xor", "circuit": false}.
class VennInstrument extends StatefulWidget {
  const VennInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<VennInstrument> createState() => _VennState();
}

class _VennState extends State<VennInstrument> {
  String mode = 'ops';
  VennOp op = VennOp.union;
  List<String> u = [], a = [], b = [];
  double nu = 60, na = 35, nb = 30, nab = 15;
  bool pv = true, qv = false, circuit = false;
  String conn = 'and';
  double sep = 0.62; // centre separation as a fraction of the radius sum
  int? active;

  static final _presets = <String, Map<String, dynamic>>{
    'Union': {'mode': 'ops', 'op': 'union', 'U': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'A': [2, 4, 6, 8, 10], 'B': [1, 2, 3, 4, 5]},
    'Difference': {'mode': 'ops', 'op': 'aMinusB', 'U': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'A': [2, 4, 6, 8, 10], 'B': [1, 2, 3, 4, 5]},
    'De Morgan': {'mode': 'ops', 'op': 'compUnion', 'U': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'A': [2, 4, 6, 8, 10], 'B': [1, 2, 3, 4, 5]},
    'Counting': {'mode': 'counts', 'n': {'u': 60, 'a': 35, 'b': 30, 'ab': 15}},
  };

  @override
  void initState() {
    super.initState();
    _apply(widget.preset.isEmpty ? _presets['Union']! : widget.preset);
    if (widget.preset.isEmpty) active = 0;
  }

  void _apply(Map<String, dynamic> m) {
    mode = ps(m, 'mode', 'ops');
    op = VennOp.values.firstWhere((o) => o.name == m['op'], orElse: () => mode == 'logic' ? VennOp.inter : VennOp.union);
    List<String> l(String k) => [if (m[k] is List) for (final e in m[k] as List) '$e'];
    u = l('U');
    a = l('A');
    b = l('B');
    if (u.isEmpty) u = {...a, ...b}.toList();
    final n = (m['n'] as Map?)?.cast<String, dynamic>() ?? const {};
    nu = pd(n, 'u', 60);
    na = pd(n, 'a', 35);
    nb = pd(n, 'b', 30);
    nab = pd(n, 'ab', 15);
    pv = pb(m, 'p', true);
    qv = pb(m, 'q', false);
    conn = ps(m, 'connective', 'and');
    circuit = pb(m, 'circuit', false);
    sep = pd(m, 'sep', 0.62);
  }

  // Region counts: only A, both, only B, neither.
  List<double> get counts {
    if (mode == 'ops') {
      final sa = a.toSet(), sb = b.toSet();
      return [sa.difference(sb).length.toDouble(), sa.intersection(sb).length.toDouble(), sb.difference(sa).length.toDouble(), u.where((e) => !sa.contains(e) && !sb.contains(e)).length.toDouble()];
    }
    return [na - nab, nab, nb - nab, nu - na - nb + nab];
  }

  bool logicValue(bool p, bool q) => switch (conn) {
    'or' => p || q,
    'implies' => !p || q,
    'iff' => p == q,
    'not' => !p,
    'xor' => p != q,
    'converse' => !q || p,
    'inverse' => p || !q,
    'contrapositive' => q || !p,
    _ => p && q,
  };

  List<bool> get logicRegions => [logicValue(true, false), logicValue(true, true), logicValue(false, true), logicValue(false, false)];

  String get connText => switch (conn) {
    'or' => 'p or q',
    'implies' => 'p → q',
    'iff' => 'p ↔ q',
    'not' => '~p',
    'xor' => 'p ⊻ q',
    'converse' => 'q → p',
    'inverse' => '~p → ~q',
    'contrapositive' => '~q → ~p',
    _ => 'p and q',
  };

  @override
  Widget build(BuildContext context) {
    final cn = counts;
    final keep = mode == 'logic' ? logicRegions : _regions(op);
    final nOp = [for (var i = 0; i < 4; i++) if (keep[i]) cn[i]].fold<double>(0, (x, y) => x + y);
    final List<Readout> ro;
    final List<Widget> controls;
    String title, formula;
    switch (mode) {
      case 'logic':
        title = circuit ? 'Switching circuits' : 'Truth table and Venn diagram';
        formula = '$connText is ${logicValue(pv, qv) ? 'T' : 'F'}';
        ro = [
          Readout('p', pv ? 'T' : 'F', '', IX.accent),
          Readout('q', qv ? 'T' : 'F', '', IX.green),
          Readout(connText, logicValue(pv, qv) ? 'True' : 'False', '', IX.positive),
          if (circuit) Readout('Series bulb p and q', pv && qv ? 'On' : 'Off', '', IX.amber),
          if (circuit) Readout('Parallel bulb p or q', pv || qv ? 'On' : 'Off', '', IX.amber),
        ];
        controls = [
          IxToggle(label: circuit ? 'Switch p closed' : 'p is true', value: pv, onChanged: (v) => setState(() => pv = v)),
          IxToggle(label: circuit ? 'Switch q closed' : 'q is true', value: qv, onChanged: (v) => setState(() => qv = v)),
          if (!circuit) segs<String>('Connective', const {'and': 'p and q', 'or': 'p or q', 'implies': 'p → q', 'iff': 'p ↔ q', 'not': '~p', 'contrapositive': '~q → ~p'}, conn, (v) => setState(() => conn = v)),
        ];
      case 'attributes':
        final cl = cn;
        final q = (cl[1] * cl[3] - cl[0] * cl[2]) / (cl[1] * cl[3] + cl[0] * cl[2]);
        final consistent = cl.every((v) => v >= 0);
        title = 'Two attributes A and B';
        formula = 'Q = [(AB)(αβ) − (Aβ)(αB)] / [(AB)(αβ) + (Aβ)(αB)]';
        ro = [
          Readout('(AB)', fmt(cl[1], 0), '', MX.violet),
          Readout('Expected (A)(B)/N', fmt(na * nb / nu, 1), '', IX.inkSoft),
          Readout('Yule’s Q', consistent ? fmt(q, 3) : '—', '', IX.accent),
          Readout('Data', consistent ? (cl[1] > na * nb / nu + 1e-9 ? 'Positive association' : cl[1] < na * nb / nu - 1e-9 ? 'Negative association' : 'Independent') : 'Inconsistent', '', consistent ? IX.green : MX.red),
        ];
        controls = [
          IxSlider(label: 'N', value: nu, min: 20, max: 400, divisions: 380, format: (v) => fmt(v, 0), onChanged: (v) => setState(() => nu = v)),
          IxSlider(label: '(A)', value: na, min: 0, max: nu, divisions: nu.round(), format: (v) => fmt(v, 0), onChanged: (v) => setState(() => na = v)),
          IxSlider(label: '(B)', value: nb, min: 0, max: nu, divisions: nu.round(), format: (v) => fmt(v, 0), onChanged: (v) => setState(() => nb = v)),
          IxSlider(label: '(AB)', value: nab, min: 0, max: nu, divisions: nu.round(), format: (v) => fmt(v, 0), onChanged: (v) => setState(() => nab = v)),
        ];
      case 'counts':
        title = 'Counting with a Venn diagram';
        formula = 'n(A ∪ B) = n(A) + n(B) − n(A ∩ B)';
        ro = [
          Readout('n(A ∪ B)', fmt(na + nb - nab, 0), '', IX.accent),
          Readout('n(${_opText[op]})', fmt(nOp, 0), '', IX.positive),
          Readout('Only A', fmt(cn[0], 0), '', IX.inkSoft),
          Readout('Neither', fmt(cn[3], 0), '', cn.any((v) => v < 0) ? MX.red : IX.inkSoft),
        ];
        controls = [
          IxSlider(label: 'n(U)', value: nu, min: 1, max: 200, divisions: 199, format: (v) => fmt(v, 0), onChanged: (v) => setState(() => nu = v)),
          IxSlider(label: 'n(A)', value: na, min: 0, max: nu, divisions: math.max(1, nu.round()), format: (v) => fmt(v, 0), onChanged: (v) => setState(() => na = v)),
          IxSlider(label: 'n(B)', value: nb, min: 0, max: nu, divisions: math.max(1, nu.round()), format: (v) => fmt(v, 0), onChanged: (v) => setState(() => nb = v)),
          IxSlider(label: 'n(A ∩ B)', value: nab, min: 0, max: math.max(1, math.min(na, nb)), divisions: math.max(1, math.min(na, nb).round()), format: (v) => fmt(v, 0), onChanged: (v) => setState(() => nab = v)),
          _opSegs(),
        ];
      default:
        title = 'Operations on sets';
        formula = '${_opText[op]} = {${_members(keep).join(', ')}}';
        if (formula.length > 46) formula = '${_opText[op]} has ${nOp.round()} elements';
        ro = [
          Readout('n(A)', '${a.length}', '', IX.accent),
          Readout('n(B)', '${b.length}', '', IX.green),
          Readout('n(${_opText[op]})', fmt(nOp, 0), '', IX.positive),
          Readout('n(U)', '${u.length}', '', IX.inkSoft),
        ];
        controls = [_opSegs(), IxSlider(label: 'Move B', value: sep, min: 0.2, max: 1.15, format: (v) => v >= 1 ? 'apart' : 'overlap', onChanged: (v) => setState(() => sep = v))];
    }
    return InstrumentFrame(
      id: 'maths-venn',
      subtitle: mode == 'attributes' ? '$kStats · Theory of attributes' : mode == 'logic' ? '$kMaths · Mathematical reasoning' : '$kMaths · Sets',
      title: title,
      formula: formula,
      state: {'mode': mode, 'op': op.name, 'n': {'u': nu, 'a': na, 'b': nb, 'ab': nab}, 'p': pv, 'q': qv, 'connective': conn},
      readouts: ro,
      controls: controls,
      presets: [for (final (i, e) in _presets.entries.indexed) Preset(e.key, () => setState(() { _apply(e.value); active = i; }))],
      activePreset: active,
      stage: CustomPaint(painter: _VennPainter(this, keep), size: Size.infinite),
    );
  }

  Widget _opSegs() => segs<VennOp>('Operation', {for (final o in [VennOp.union, VennOp.inter, VennOp.aMinusB, VennOp.bMinusA, VennOp.compA, VennOp.compUnion]) o: _opText[o]!}, op, (v) => setState(() => op = v));

  List<String> _members(List<bool> keep) {
    final sa = a.toSet(), sb = b.toSet();
    return [
      for (final e in u)
        if (keep[sa.contains(e) && sb.contains(e) ? 1 : sa.contains(e) ? 0 : sb.contains(e) ? 2 : 3]) e,
    ];
  }
}

class _VennPainter extends CustomPainter {
  _VennPainter(this.s, this.keep);
  final _VennState s;
  final List<bool> keep;

  @override
  void paint(Canvas c, Size size) {
    final side = s.mode == 'logic' || s.mode == 'attributes';
    final uRect = Rect.fromLTWH(48, 70, side ? size.width * 0.52 : size.width - 96, size.height - (s.mode == 'ops' ? 210 : 150));
    final r = math.min(uRect.height * 0.36, uRect.width * 0.22);
    final d = r * 2 * s.sep.clamp(0.2, 1.15);
    final ca = Offset(uRect.center.dx - d / 2, uRect.center.dy + 6), cb = Offset(uRect.center.dx + d / 2, uRect.center.dy + 6);
    final pa = Path()..addOval(Rect.fromCircle(center: ca, radius: r));
    final pbp = Path()..addOval(Rect.fromCircle(center: cb, radius: r));
    final pu = Path()..addRRect(RRect.fromRectAndRadius(uRect, const Radius.circular(14)));
    final regions = [
      Path.combine(PathOperation.difference, pa, pbp),
      Path.combine(PathOperation.intersect, pa, pbp),
      Path.combine(PathOperation.difference, pbp, pa),
      Path.combine(PathOperation.difference, pu, Path.combine(PathOperation.union, pa, pbp)),
    ];
    c.drawPath(pu, Paint()..color = const Color(0xFFFAFBFE));
    for (var i = 0; i < 4; i++) {
      if (keep[i]) c.drawPath(regions[i], Paint()..color = IX.positive.withValues(alpha: 0.22));
    }
    c.drawPath(pu, MPaint.stroke(IX.ink, 2.5));
    c.drawPath(pa, MPaint.stroke(IX.accent, 3.5));
    c.drawPath(pbp, MPaint.stroke(IX.green, 3.5));
    final logic = s.mode == 'logic';
    final attr = s.mode == 'attributes';
    IxPaint.label(c, logic ? 'U (all cases)' : attr ? 'N = ${fmt(s.nu, 0)}' : 'U', uRect.topLeft + const Offset(18, 16), size: 22, color: IX.ink, w: FontWeight.w600, align: Alignment.topLeft);
    IxPaint.label(c, logic ? 'p true' : 'A', ca + Offset(-r * 0.55, -r * 1.02), size: 26, color: IX.accent, w: FontWeight.w700, align: Alignment.bottomCenter);
    IxPaint.label(c, logic ? 'q true' : 'B', cb + Offset(r * 0.55, -r * 1.02), size: 26, color: IX.green, w: FontWeight.w700, align: Alignment.bottomCenter);

    // Region centres for labels.
    final overlap = s.sep < 1;
    final cOnlyA = ca + Offset(overlap ? -r * 0.45 : 0, 0), cBoth = Offset((ca.dx + cb.dx) / 2, ca.dy), cOnlyB = cb + Offset(overlap ? r * 0.45 : 0, 0);
    final cNeither = Offset(uRect.right - 70, uRect.bottom - 40);
    if (s.mode == 'ops') {
      final sa = s.a.toSet(), sb = s.b.toSet();
      final groups = [<String>[], <String>[], <String>[], <String>[]];
      for (final e in s.u) {
        groups[sa.contains(e) && sb.contains(e) ? 1 : sa.contains(e) ? 0 : sb.contains(e) ? 2 : 3].add(e);
      }
      final centres = [cOnlyA, cBoth, cOnlyB, cNeither];
      for (var g = 0; g < 4; g++) {
        final items = groups[g];
        if (!overlap && g == 1) continue;
        for (var k = 0; k < items.length; k++) {
          Offset at;
          if (g == 3) {
            // Along the bottom and right margins of U.
            at = Offset(uRect.left + 60 + k * 64.0, uRect.bottom - 34);
            if (at.dx > ca.dx - r - 30 && k > 0) at = Offset(uRect.right - 50, uRect.top + 60 + (k - ((ca.dx - r - 30 - uRect.left - 60) / 64).ceil()) * 56.0);
          } else {
            final cols = g == 1 ? 1 : 2;
            final row = k ~/ cols, col = k % cols;
            final rows = (items.length / cols).ceil();
            at = centres[g] + Offset((col - (cols - 1) / 2) * 58, (row - (rows - 1) / 2) * 52);
          }
          final on = keep[g];
          c.drawCircle(at, 22, Paint()..color = on ? IX.positive : Colors.white);
          c.drawCircle(at, 22, MPaint.stroke(on ? IX.positive : IX.rule, 2));
          IxPaint.label(c, items[k], at, size: 21, color: on ? Colors.white : IX.ink, w: FontWeight.w600);
        }
      }
      final members = s._members(keep);
      final res = '${_opText[s.op]} = {${members.join(', ')}}';
      IxPaint.label(c, members.isEmpty ? '${_opText[s.op]} = φ' : res, Offset(uRect.left, uRect.bottom + 44), size: 28, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
      IxPaint.label(c, 'A = {${s.a.join(', ')}}     B = {${s.b.join(', ')}}', Offset(uRect.left, uRect.bottom + 92), size: 21, color: IX.inkSoft, align: Alignment.centerLeft);
    } else if (!logic) {
      final cn = s.counts;
      final names = attr ? ['(Aβ)', '(AB)', '(αB)', '(αβ)'] : ['only A', 'A ∩ B', 'only B', 'neither'];
      final at = [cOnlyA, cBoth, cOnlyB, cNeither];
      for (var g = 0; g < 4; g++) {
        final bad = cn[g] < 0;
        IxPaint.label(c, fmt(cn[g], 0), at[g] - const Offset(0, 14), size: 36, color: bad ? MX.red : IX.ink, w: FontWeight.w700);
        IxPaint.label(c, names[g], at[g] + const Offset(0, 22), size: 17, color: bad ? MX.red : IX.inkSoft, w: FontWeight.w500);
      }
      if (attr) _attrTable(c, Rect.fromLTWH(uRect.right + 40, uRect.top, size.width - uRect.right - 80, uRect.height));
    } else {
      // A dot for the present case.
      final at = s.pv && s.qv ? cBoth : s.pv ? cOnlyA : s.qv ? cOnlyB : cNeither;
      IxPaint.handle(c, at, IX.amber, r: 16);
      IxPaint.label(c, 'now', at + const Offset(0, 30), size: 16, color: IX.amber, w: FontWeight.w600);
      if (s.circuit) {
        _circuits(c, Rect.fromLTWH(uRect.right + 40, uRect.top, size.width - uRect.right - 80, uRect.height));
      } else {
        _truthTable(c, Rect.fromLTWH(uRect.right + 40, uRect.top, size.width - uRect.right - 80, uRect.height));
      }
      IxPaint.label(c, 'Shaded: the cases where ${s.connText} is true', Offset(uRect.left, uRect.bottom + 40), size: 22, color: IX.inkSoft, align: Alignment.centerLeft);
    }
  }

  void _truthTable(Canvas c, Rect box) {
    final cols = ['p', 'q', s.connText];
    final rows = [(true, true), (true, false), (false, true), (false, false)];
    final cw = box.width / 3, rh = 66.0;
    final top = box.top + 40;
    c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(box.left, top, box.width, rh * 5), const Radius.circular(14)), MPaint.stroke(IX.rule, 1.5));
    for (var j = 0; j < 3; j++) {
      IxPaint.label(c, cols[j], Offset(box.left + cw * (j + 0.5), top + rh / 2), size: 24, color: IX.ink, w: FontWeight.w700);
    }
    for (var i = 0; i < 4; i++) {
      final (p, q) = rows[i];
      final y = top + rh * (i + 1);
      final now = p == s.pv && q == s.qv;
      if (now) c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(box.left + 4, y + 4, box.width - 8, rh - 8), const Radius.circular(10)), Paint()..color = IX.amber.withValues(alpha: 0.16));
      c.drawLine(Offset(box.left, y), Offset(box.right, y), MPaint.stroke(IX.rule, 1.2));
      final v = s.logicValue(p, q);
      for (final (j, t) in [p, q, v].indexed) {
        IxPaint.label(c, t ? 'T' : 'F', Offset(box.left + cw * (j + 0.5), y + rh / 2), size: 26, color: j == 2 ? (t ? IX.green : MX.red) : IX.ink, w: FontWeight.w600);
      }
    }
  }

  void _circuits(Canvas c, Rect box) {
    void bulb(Offset o, bool on) {
      if (on) c.drawCircle(o, 34, Paint()..color = IX.amber.withValues(alpha: 0.25));
      c.drawCircle(o, 20, Paint()..color = on ? const Color(0xFFFDE68A) : Colors.white);
      c.drawCircle(o, 20, MPaint.stroke(on ? IX.amber : IX.steel, 3));
      c.drawLine(o + const Offset(-8, 8), o + const Offset(8, -8), MPaint.stroke(on ? IX.amber : IX.steel, 2));
      c.drawLine(o + const Offset(-8, -8), o + const Offset(8, 8), MPaint.stroke(on ? IX.amber : IX.steel, 2));
    }

    void sw(Offset a, bool closed, String name) {
      final b = a + const Offset(70, 0);
      c.drawCircle(a, 5, Paint()..color = IX.ink);
      c.drawCircle(b, 5, Paint()..color = IX.ink);
      c.drawLine(a, closed ? b : a + const Offset(60, -32), MPaint.stroke(closed ? IX.green : MX.red, 4));
      IxPaint.label(c, name, a + const Offset(35, 26), size: 20, color: IX.ink, w: FontWeight.w600);
    }

    final w = MPaint.stroke(IX.ink, 2.5);
    final x0 = box.left + 20, x1 = box.right - 20;
    // Series.
    final y1 = box.top + 90;
    IxPaint.label(c, 'Series: p and q', Offset(x0, box.top + 28), size: 20, color: IX.inkSoft, w: FontWeight.w600, align: Alignment.centerLeft);
    c.drawLine(Offset(x0, y1), Offset(x0 + 40, y1), w);
    sw(Offset(x0 + 40, y1), s.pv, 'p');
    c.drawLine(Offset(x0 + 110, y1), Offset(x0 + 150, y1), w);
    sw(Offset(x0 + 150, y1), s.qv, 'q');
    c.drawLine(Offset(x0 + 220, y1), Offset(x1 - 60, y1), w);
    bulb(Offset(x1 - 40, y1), s.pv && s.qv);
    // Parallel.
    final y2 = box.top + 260, y3 = y2 + 90;
    IxPaint.label(c, 'Parallel: p or q', Offset(x0, y2 - 62), size: 20, color: IX.inkSoft, w: FontWeight.w600, align: Alignment.centerLeft);
    final mid = (y2 + y3) / 2;
    c.drawLine(Offset(x0, mid), Offset(x0 + 30, mid), w);
    c.drawLine(Offset(x0 + 30, y2), Offset(x0 + 30, y3), w);
    c.drawLine(Offset(x0 + 30, y2), Offset(x0 + 70, y2), w);
    c.drawLine(Offset(x0 + 30, y3), Offset(x0 + 70, y3), w);
    sw(Offset(x0 + 70, y2), s.pv, 'p');
    sw(Offset(x0 + 70, y3), s.qv, 'q');
    c.drawLine(Offset(x0 + 140, y2), Offset(x0 + 190, y2), w);
    c.drawLine(Offset(x0 + 140, y3), Offset(x0 + 190, y3), w);
    c.drawLine(Offset(x0 + 190, y2), Offset(x0 + 190, y3), w);
    c.drawLine(Offset(x0 + 190, mid), Offset(x1 - 60, mid), w);
    bulb(Offset(x1 - 40, mid), s.pv || s.qv);
  }

  void _attrTable(Canvas c, Rect box) {
    final cn = s.counts;
    final rows = [
      ['', 'B', 'β', 'Total'],
      ['A', fmt(cn[1], 0), fmt(cn[0], 0), fmt(s.na, 0)],
      ['α', fmt(cn[2], 0), fmt(cn[3], 0), fmt(s.nu - s.na, 0)],
      ['Total', fmt(s.nb, 0), fmt(s.nu - s.nb, 0), fmt(s.nu, 0)],
    ];
    final cw = box.width / 4, rh = 70.0;
    final top = box.top + 40;
    c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(box.left, top, box.width, rh * 4), const Radius.circular(14)), MPaint.stroke(IX.rule, 1.5));
    for (var i = 0; i < 4; i++) {
      if (i > 0) c.drawLine(Offset(box.left, top + rh * i), Offset(box.right, top + rh * i), MPaint.stroke(IX.rule, 1.2));
      for (var j = 0; j < 4; j++) {
        final v = rows[i][j];
        final bad = v.startsWith('−');
        IxPaint.label(c, v, Offset(box.left + cw * (j + 0.5), top + rh * (i + 0.5)), size: i == 0 || j == 0 ? 22 : 26, color: bad ? MX.red : (i == 0 || j == 0 ? IX.inkSoft : IX.ink), w: FontWeight.w600);
      }
    }
    final ok = cn.every((v) => v >= 0);
    IxPaint.label(c, ok ? 'All class frequencies ≥ 0: consistent' : 'A negative class frequency: inconsistent', Offset(box.left, top + rh * 4 + 36), size: 19, color: ok ? IX.green : MX.red, w: FontWeight.w600, align: Alignment.centerLeft);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
