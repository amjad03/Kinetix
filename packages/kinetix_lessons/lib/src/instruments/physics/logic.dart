import 'package:flutter/material.dart';

import 'kit.dart';

/// Logic gates (2nd PUC ch. 18): every basic gate with its truth table, and NOT, AND and OR
/// built from NAND gates alone.
final logicSpec = InstrumentSpec(
  id: 'logic',
  chapter: '2nd PUC Physics · Logic gates',
  modes: {'gate': _gate, 'nand': _nand},
);

const _gates = ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR'];

bool _eval(String g, bool a, bool b) => switch (g) {
  'AND' => a && b,
  'OR' => a || b,
  'NOT' => !a,
  'NAND' => !(a && b),
  'NOR' => !(a || b),
  _ => a != b,
};

/// Draws a gate body with its left edge at [o] - (w/2, 0); returns its output point.
Offset _gateSym(Canvas c, String g, Offset o, {double w = 150, double h = 120, Color col = IX.ink}) {
  final l = o.dx - w / 2, r = o.dx + w / 2, t = o.dy - h / 2, b = o.dy + h / 2;
  final bubble = g == 'NOT' || g == 'NAND' || g == 'NOR';
  final path = Path();
  if (g == 'NOT') {
    path..moveTo(l, t)..lineTo(r - 16, o.dy)..lineTo(l, b)..close();
  } else if (g == 'AND' || g == 'NAND') {
    path..moveTo(l, t)..lineTo(o.dx, t)..arcToPoint(Offset(o.dx, b), radius: Radius.circular(h / 2))..lineTo(l, b)..close();
  } else {
    path
      ..moveTo(l, t)
      ..quadraticBezierTo(o.dx + w * 0.15, t, r - (bubble ? 16 : 0), o.dy)
      ..quadraticBezierTo(o.dx + w * 0.15, b, l, b)
      ..quadraticBezierTo(l + w * 0.25, o.dy, l, t);
    if (g == 'XOR') c.drawPath(Path()..moveTo(l - 16, t)..quadraticBezierTo(l + w * 0.25 - 16, o.dy, l - 16, b), Draw.stroke(col, 3.5));
  }
  c.drawPath(path, Draw.fill(Colors.white));
  c.drawPath(path, Draw.stroke(col, 3.5));
  var out = Offset(g == 'AND' || g == 'NAND' ? o.dx + h / 2 : r - (bubble ? 16 : 0), o.dy);
  if (bubble) {
    c.drawCircle(out + const Offset(8, 0), 8, Draw.fill(Colors.white));
    c.drawCircle(out + const Offset(8, 0), 8, Draw.stroke(col, 3));
    out += const Offset(16, 0);
  }
  Draw.text(c, g, Offset(o.dx - 8, o.dy), size: 18, color: col);
  return out;
}

void _switch(Canvas c, Offset at, String name, bool on) {
  Draw.tag(c, '$name = ${on ? 1 : 0}', at, color: on ? IX.green : IX.inkSoft, size: 22);
}

final _gate = ModeSpec(
  title: 'Try every gate',
  formula: 'Y = A·B, A + B, Ā, (A·B)‾, (A + B)‾, A ⊕ B',
  values: {'g': 0, 'A': 1, 'B': 0},
  controls: (v) => const [Seg('g', 'Gate', _gates), Seg('A', 'Input A', ['0', '1']), Seg('B', 'Input B', ['0', '1'])],
  presets: {'AND': {'g': 0}, 'OR': {'g': 1}, 'NOT': {'g': 2}, 'NAND': {'g': 3}},
  readouts: (v) {
    final g = _gates[v['g']!.round()];
    final y = _eval(g, v['A'] == 1, v['B'] == 1);
    return [Readout('Output Y', y ? '1' : '0', '', y ? IX.green : IX.inkSoft), Readout('Gate', g, '', IX.accent)];
  },
  paint: (c, s, v, t) {
    final g = _gates[v['g']!.round()];
    final a = v['A'] == 1, b = v['B'] == 1;
    final y = _eval(g, a, b);
    final (left, right) = Lay.split(s, 0.56);
    final o = Offset(left.center.dx, left.center.dy);
    final out = _gateSym(c, g, o, w: 200, h: 160);
    final ia = Offset(o.dx - 100, g == 'NOT' ? o.dy : o.dy - 45), ib = Offset(o.dx - 100, o.dy + 45);
    Draw.line(c, [Offset(left.left + 150, ia.dy), ia], a ? IX.green : IX.ink);
    _switch(c, Offset(left.left + 100, ia.dy), 'A', a);
    if (g != 'NOT') {
      Draw.line(c, [Offset(left.left + 150, ib.dy), ib], b ? IX.green : IX.ink);
      _switch(c, Offset(left.left + 100, ib.dy), 'B', b);
    }
    Draw.line(c, [out, Offset(left.right - 110, o.dy)], y ? IX.green : IX.ink);
    Draw.bulb(c, Offset(left.right - 70, o.dy), y ? 1 : 0, r: 36);
    Draw.text(c, 'Y = ${y ? 1 : 0}', Offset(left.right - 70, o.dy + 70), size: 22, color: y ? IX.green : IX.inkSoft);
    Draw.caption(c, 'Set the switches (1 = closed) and fill in the truth table.');
    // Truth table.
    final rows = g == 'NOT' ? [(false, false), (true, false)] : [(false, false), (false, true), (true, false), (true, true)];
    final tb = Rect.fromLTRB(right.left + 40, right.top + 40, right.right - 40, right.top + 140 + rows.length * 70.0);
    c.drawRRect(RRect.fromRectAndRadius(tb, const Radius.circular(14)), Draw.fill(const Color(0xFFFAFBFE)));
    c.drawRRect(RRect.fromRectAndRadius(tb, const Radius.circular(14)), Draw.stroke(IX.rule, 1.5));
    final cols = g == 'NOT' ? ['A', 'Y'] : ['A', 'B', 'Y'];
    final cw = tb.width / cols.length;
    for (var k = 0; k < cols.length; k++) {
      Draw.text(c, cols[k], Offset(tb.left + cw * (k + 0.5), tb.top + 36), size: 22, color: IX.accent);
    }
    for (final (i, (ra, rb)) in rows.indexed) {
      final ry = tb.top + 80 + i * 70.0 + 30;
      final cur = ra == a && (g == 'NOT' || rb == b);
      if (cur) c.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(tb.center.dx, ry), width: tb.width - 20, height: 56), const Radius.circular(10)), Draw.fill(IX.accentSoft));
      final vals = g == 'NOT' ? [ra, _eval(g, ra, rb)] : [ra, rb, _eval(g, ra, rb)];
      for (var k = 0; k < vals.length; k++) {
        Draw.text(c, vals[k] ? '1' : '0', Offset(tb.left + cw * (k + 0.5), ry), size: 24, color: k == vals.length - 1 ? IX.green : IX.ink);
      }
    }
  },
);

final _nand = ModeSpec(
  title: 'Build gates from NAND',
  formula: 'NAND is universal',
  values: {'tgt': 0, 'A': 1, 'B': 0},
  controls: (v) => const [Seg('tgt', 'Build', ['NOT', 'AND', 'OR']), Seg('A', 'Input A', ['0', '1']), Seg('B', 'Input B', ['0', '1'])],
  presets: {'NOT from NAND': {'tgt': 0}, 'AND from NAND': {'tgt': 1}, 'OR from NAND': {'tgt': 2}},
  readouts: (v) {
    final a = v['A'] == 1, b = v['B'] == 1;
    final tgt = v['tgt']!.round();
    final y = [!a, a && b, a || b][tgt];
    return [Readout('NAND build output', y ? '1' : '0', '', IX.green), Readout('Real ${['NOT', 'AND', 'OR'][tgt]} gate', y ? '1' : '0', ''), Readout('NAND gates used', '${[1, 2, 3][tgt]}', '')];
  },
  paint: (c, s, v, t) {
    final a = v['A'] == 1, b = v['B'] == 1;
    final tgt = v['tgt']!.round();
    final cy = s.height / 2;
    Color w(bool x) => x ? IX.green : IX.ink;
    void wire(List<Offset> p, bool x) => Draw.line(c, p, w(x));
    void val(Offset at, bool x) => Draw.tag(c, x ? '1' : '0', at, color: w(x), size: 18);
    _switch(c, Offset(110, cy - 90), 'A', a);
    if (tgt != 0) _switch(c, Offset(110, cy + 90), 'B', b);
    if (tgt == 0) {
      final o = _gateSym(c, 'NAND', Offset(s.width * 0.45, cy), w: 180, h: 140);
      wire([Offset(170, cy - 90), Offset(s.width * 0.45 - 140, cy - 90), Offset(s.width * 0.45 - 140, cy - 35), Offset(s.width * 0.45 - 90, cy - 35)], a);
      wire([Offset(s.width * 0.45 - 140, cy - 35), Offset(s.width * 0.45 - 140, cy + 35), Offset(s.width * 0.45 - 90, cy + 35)], a);
      wire([o, Offset(s.width - 180, cy)], !a);
      Draw.bulb(c, Offset(s.width - 140, cy), !a ? 1 : 0, r: 34);
      Draw.caption(c, 'Tie both inputs together: (A·A)‾ = Ā.');
    } else if (tgt == 1) {
      final x1 = s.width * 0.35, x2 = s.width * 0.62;
      final o1 = _gateSym(c, 'NAND', Offset(x1, cy), w: 170, h: 130);
      wire([Offset(170, cy - 90), Offset(x1 - 120, cy - 90), Offset(x1 - 120, cy - 32), Offset(x1 - 85, cy - 32)], a);
      wire([Offset(170, cy + 90), Offset(x1 - 120, cy + 90), Offset(x1 - 120, cy + 32), Offset(x1 - 85, cy + 32)], b);
      final m = !(a && b);
      final o2 = _gateSym(c, 'NAND', Offset(x2, cy), w: 170, h: 130);
      wire([o1, Offset(x2 - 120, cy), Offset(x2 - 120, cy - 32), Offset(x2 - 85, cy - 32)], m);
      wire([Offset(x2 - 120, cy), Offset(x2 - 120, cy + 32), Offset(x2 - 85, cy + 32)], m);
      val(Offset((o1.dx + x2 - 120) / 2, cy - 30), m);
      wire([o2, Offset(s.width - 180, cy)], a && b);
      Draw.bulb(c, Offset(s.width - 140, cy), a && b ? 1 : 0, r: 34);
      Draw.caption(c, 'NAND, then NAND as NOT: ((A·B)‾)‾ = A·B.');
    } else {
      final x1 = s.width * 0.33, x2 = s.width * 0.62;
      final oa = _gateSym(c, 'NAND', Offset(x1, cy - 150), w: 150, h: 110);
      final ob = _gateSym(c, 'NAND', Offset(x1, cy + 150), w: 150, h: 110);
      wire([Offset(170, cy - 90), Offset(x1 - 110, cy - 90), Offset(x1 - 110, cy - 177), Offset(x1 - 75, cy - 177)], a);
      wire([Offset(x1 - 110, cy - 150), Offset(x1 - 110, cy - 123), Offset(x1 - 75, cy - 123)], a);
      wire([Offset(170, cy + 90), Offset(x1 - 110, cy + 90), Offset(x1 - 110, cy + 177), Offset(x1 - 75, cy + 177)], b);
      wire([Offset(x1 - 110, cy + 150), Offset(x1 - 110, cy + 123), Offset(x1 - 75, cy + 123)], b);
      final o = _gateSym(c, 'NAND', Offset(x2, cy), w: 170, h: 130);
      wire([oa, Offset(x2 - 130, oa.dy), Offset(x2 - 130, cy - 32), Offset(x2 - 85, cy - 32)], !a);
      wire([ob, Offset(x2 - 130, ob.dy), Offset(x2 - 130, cy + 32), Offset(x2 - 85, cy + 32)], !b);
      val(Offset(oa.dx + 40, oa.dy - 30), !a);
      val(Offset(ob.dx + 40, ob.dy + 30), !b);
      wire([o, Offset(s.width - 180, cy)], a || b);
      Draw.bulb(c, Offset(s.width - 140, cy), a || b ? 1 : 0, r: 34);
      Draw.caption(c, 'Invert each input, then NAND: (Ā·B̄)‾ = A + B.');
    }
  },
);
