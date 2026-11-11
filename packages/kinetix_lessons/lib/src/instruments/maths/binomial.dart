import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'common.dart';

/// The binomial theorem: Pascal's triangle, the expansion of (a + b)ⁿ with its general term and
/// the area picture of (a + b)², and the powers of x in (xᵖ + 1/x^q)ⁿ with the term free of x.
///
/// Preset: {"mode": "pascal"|"expand"|"terms", "n": 5, "r": 2, "a": 3, "b": 2, "p": 1, "q": 1}.
class BinomialInstrument extends StatefulWidget {
  const BinomialInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<BinomialInstrument> createState() => _BinomialState();
}

class _BinomialState extends State<BinomialInstrument> {
  String mode = 'pascal';
  int n = 5, r = 2, p = 1, q = 1;
  double a = 3, b = 2;
  int? active;

  static final _presets = <String, Map<String, dynamic>>{
    'Pascal’s triangle': {'mode': 'pascal', 'n': 5, 'r': 2},
    '(a + b)²': {'mode': 'expand', 'n': 2, 'a': 3, 'b': 2, 'r': 1},
    '(a + b)⁵': {'mode': 'expand', 'n': 5, 'a': 1, 'b': 1, 'r': 2},
    'Term free of x': {'mode': 'terms', 'n': 6, 'p': 1, 'q': 1},
  };

  @override
  void initState() {
    super.initState();
    _apply(widget.preset.isEmpty ? _presets['Pascal’s triangle']! : widget.preset);
    if (widget.preset.isEmpty) active = 0;
  }

  void _apply(Map<String, dynamic> m) {
    mode = ps(m, 'mode', 'pascal');
    n = pint(m, 'n', 5);
    r = pint(m, 'r', 2).clamp(0, n);
    a = pd(m, 'a', 3);
    b = pd(m, 'b', 2);
    p = pint(m, 'p', 1);
    q = pint(m, 'q', 1);
  }

  String pw(String base, int e) => e == 0 ? '' : e == 1 ? base : '$base${superscript(e)}';

  String term(int k) {
    final c = nCr(n, k);
    final body = '${pw('a', n - k)}${pw('b', k)}';
    return '${c == 1 && body.isNotEmpty ? '' : fmt(c, 0)}$body';
  }

  @override
  Widget build(BuildContext context) {
    String title, formula;
    late List<Readout> ro;
    late List<Widget> ctl;
    Widget sl(String l, num v, num lo, num hi, ValueChanged<double> on, {int d = 0, int? div}) => IxSlider(label: l, value: v.toDouble(), min: lo.toDouble(), max: hi.toDouble(), divisions: div ?? (hi - lo).round(), format: (x) => fmt(x, d), onChanged: (x) => setState(() { on(x); active = null; }));
    switch (mode) {
      case 'expand':
        title = 'Expanding (a + b)${superscript(n)}';
        formula = 'Tᵣ₊₁ = ⁿCᵣ aⁿ⁻ʳ bʳ';
        final sum = [for (var k = 0; k <= n; k++) nCr(n, k) * math.pow(a, n - k) * math.pow(b, k)].fold<double>(0, (x, y) => x + y);
        ro = [
          Readout('Number of terms', '${n + 1}', '', IX.ink),
          Readout('T${subscript(r + 1)} = ${term(r)}', fmt(nCr(n, r) * math.pow(a, n - r) * math.pow(b, r), 2), '', IX.positive),
          Readout('(a + b)${superscript(n)}', fmt(math.pow(a + b, n).toDouble(), 2), '', IX.accent),
          Readout('Sum of the terms', fmt(sum, 2), '', IX.green),
        ];
        ctl = [
          sl('n', n, 1, 8, (x) { n = x.round(); r = r.clamp(0, n); }),
          sl('r (general term Tᵣ₊₁)', r, 0, n, (x) => r = x.round()),
          sl('a', a, 0.5, 5, (x) => a = x, d: 1, div: 9),
          sl('b', b, 0.5, 5, (x) => b = x, d: 1, div: 9),
        ];
      case 'terms':
        final rr = p * n / (p + q);
        final has0 = (rr - rr.round()).abs() < 1e-9;
        title = 'Powers of x in (x${superscript(p)} + 1/x${q == 1 ? '' : superscript(q)})${superscript(n)}';
        formula = 'power of x in Tᵣ₊₁ = p(n − r) − qr';
        ro = [
          Readout('Number of terms', '${n + 1}', '', IX.ink),
          Readout('Term free of x', has0 ? 'T${subscript(rr.round() + 1)} = ${fmt(nCr(n, rr.round()), 0)}' : 'none', '', has0 ? IX.positive : MX.red),
          Readout('r = pn/(p + q)', fmt(rr, 2), '', IX.accent),
          Readout(n.isEven ? 'Middle term' : 'Middle terms', n.isEven ? 'T${subscript(n ~/ 2 + 1)}' : 'T${subscript((n + 1) ~/ 2)}, T${subscript((n + 3) ~/ 2)}', '', IX.green),
        ];
        ctl = [sl('n', n, 2, 12, (x) => n = x.round()), sl('p', p, 1, 4, (x) => p = x.round()), sl('q', q, 1, 4, (x) => q = x.round())];
      default:
        title = 'Pascal’s triangle';
        formula = 'ⁿCᵣ = ⁿ⁻¹Cᵣ₋₁ + ⁿ⁻¹Cᵣ';
        ro = [
          Readout('ⁿCᵣ', fmt(nCr(n, r), 0), '', IX.positive),
          Readout('Row sum 2ⁿ', fmt(math.pow(2, n).toDouble(), 0), '', IX.accent),
          Readout('Row n gives', '(a + b)${superscript(n)}', '', IX.ink),
        ];
        ctl = [sl('Row n', n, 0, 10, (x) { n = x.round(); r = r.clamp(0, n); }), sl('Place r', r, 0, n, (x) => r = x.round())];
    }
    return InstrumentFrame(
      id: 'maths-binomial',
      subtitle: tx(widget.preset['subtitle']) ?? '$kMaths · Binomial theorem',
      title: tx(widget.preset['title']) ?? title,
      formula: formula,
      state: {'mode': mode, 'n': n, 'r': r, 'a': a, 'b': b, 'p': p, 'q': q},
      readouts: ro,
      controls: ctl,
      presets: [for (final (i, e) in _presets.entries.indexed) Preset(e.key, () => setState(() { _apply(e.value); active = i; }))],
      activePreset: active,
      stage: CustomPaint(painter: _BinPainter(this), size: Size.infinite),
    );
  }
}

class _BinPainter extends CustomPainter {
  _BinPainter(this.s);
  final _BinomialState s;

  @override
  void paint(Canvas c, Size size) {
    switch (s.mode) {
      case 'expand':
        _expand(c, size);
      case 'terms':
        _terms(c, size);
      default:
        _pascal(c, size);
    }
  }

  void _pascal(Canvas c, Size size) {
    final rows = math.max(s.n + 1, 7).clamp(1, 11);
    final dy = (size.height - 100) / rows;
    final dx = math.min(dy * 1.15, (size.width - 80) / rows);
    final rad = math.min(dx * 0.42, 34.0);
    Offset at(int row, int k) => Offset(size.width / 2 + (k - row / 2) * dx, 60 + row * dy);
    for (var row = 0; row < rows; row++) {
      IxPaint.label(c, 'n = $row', Offset(40, at(row, 0).dy), size: 16, color: row == s.n ? IX.accent : IX.muted, w: FontWeight.w600, align: Alignment.centerLeft);
      for (var k = 0; k <= row; k++) {
        final p = at(row, k);
        final isT = row == s.n && k == s.r;
        final isParent = row == s.n - 1 && (k == s.r - 1 || k == s.r);
        final inRow = row == s.n;
        if (isParent) IxPaint.arrow(c, p + Offset(0, rad * 0.7), at(s.n, s.r) + Offset((k == s.r ? 1 : -1) * rad * 0.5, -rad * 0.85), IX.positive, width: 3, head: 12);
        c.drawCircle(p, rad, Paint()..color = isT ? IX.positive : isParent ? const Color(0xFFFBE3D6) : inRow ? IX.accentSoft : IX.page);
        c.drawCircle(p, rad, MPaint.stroke(isT || isParent ? IX.positive : inRow ? IX.accent : IX.rule, isT ? 3 : 1.6));
        final v = nCr(row, k);
        IxPaint.label(c, fmt(v, 0), p, size: (rad * (v >= 100 ? 0.62 : 0.78)).clamp(12, 26), color: isT ? Colors.white : IX.ink, w: FontWeight.w600);
      }
      if (row == s.n) IxPaint.label(c, 'sum ${fmt(math.pow(2, row).toDouble(), 0)}', Offset(at(row, row).dx + rad + 22, at(row, row).dy), size: 18, color: IX.accent, w: FontWeight.w600, align: Alignment.centerLeft);
    }
  }

  void _expand(Canvas c, Size size) {
    // The terms in a row.
    final n = s.n;
    final parts = [for (var k = 0; k <= n; k++) s.term(k)];
    var x = 60.0;
    final y = 80.0;
    IxPaint.label(c, '(a + b)${superscript(n)} =', Offset(x, y), size: 30, color: IX.ink, w: FontWeight.w700, align: Alignment.centerLeft);
    x += MPaint.measure('(a + b)${superscript(n)} =', 30, w: FontWeight.w700).width + 16;
    for (var k = 0; k <= n; k++) {
      final t = parts[k] + (k < n ? ' +' : '');
      final w = MPaint.measure(t, 28, w: FontWeight.w600).width;
      if (x + w > size.width - 40) break;
      if (k == s.r) c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(x - 6, y - 24, MPaint.measure(parts[k], 28, w: FontWeight.w600).width + 12, 48), const Radius.circular(10)), Paint()..color = IX.positive.withValues(alpha: 0.15));
      IxPaint.label(c, t, Offset(x, y), size: 28, color: k == s.r ? IX.positive : IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
      x += w + 12;
    }
    final area = Rect.fromLTRB(60, 150, size.width - 60, size.height - 40);
    if (n == 2 || n == 3) {
      // A square of side a + b split into a², 2ab and b² (or, for n = 3, its top face).
      final side = math.min(area.height - 40, area.width * 0.55);
      final u = side / (s.a + s.b);
      final o = Offset(area.left + 40, area.top + 20);
      final pa = s.a * u;
      final cells = [
        (Rect.fromLTWH(o.dx, o.dy, pa, pa), 'a²', IX.accent),
        (Rect.fromLTWH(o.dx + pa, o.dy, side - pa, pa), 'ab', IX.green),
        (Rect.fromLTWH(o.dx, o.dy + pa, pa, side - pa), 'ab', IX.green),
        (Rect.fromLTWH(o.dx + pa, o.dy + pa, side - pa, side - pa), 'b²', IX.positive),
      ];
      for (final (r, t, col) in cells) {
        c.drawRect(r, Paint()..color = col.withValues(alpha: 0.18));
        c.drawRect(r, MPaint.stroke(col, 2.5));
        IxPaint.label(c, t, r.center, size: math.min(34.0, r.shortestSide * 0.4).clamp(14.0, 34.0), color: col, w: FontWeight.w700);
      }
      IxPaint.label(c, 'a = ${fmtT(s.a)}', Offset(o.dx + pa / 2, o.dy - 16), size: 19, color: IX.inkSoft, align: Alignment.bottomCenter);
      IxPaint.label(c, 'b = ${fmtT(s.b)}', Offset(o.dx + pa + (side - pa) / 2, o.dy - 16), size: 19, color: IX.inkSoft, align: Alignment.bottomCenter);
      final tx0 = o.dx + side + 60;
      final lines = n == 2
          ? ['(a + b)² = a² + 2ab + b²', '${fmt(math.pow(s.a + s.b, 2).toDouble(), 2)} = ${fmt(s.a * s.a, 2)} + ${fmt(2 * s.a * s.b, 2)} + ${fmt(s.b * s.b, 2)}']
          : ['(a + b)³ = a³ + 3a²b + 3ab² + b³', 'The square is the top face of the cube', 'of side a + b.'];
      for (final (i, t) in lines.indexed) {
        IxPaint.label(c, t, Offset(tx0, area.top + 60 + i * 52.0), size: i == 0 ? 26 : 22, color: i == 0 ? IX.ink : IX.inkSoft, w: i == 0 ? FontWeight.w700 : FontWeight.w500, align: Alignment.centerLeft);
      }
    } else {
      // Bars: the value of each term for the chosen a and b.
      final vals = [for (var k = 0; k <= n; k++) nCr(n, k) * math.pow(s.a, n - k) * math.pow(s.b, k)];
      final hi = vals.reduce(math.max);
      final pl = Plane(Rect.fromLTRB(area.left + 60, area.top + 30, area.right, area.bottom - 30), -0.6, n + 0.6, 0, hi * 1.2);
      pl.paintGrid(c, xLabel: 'r', yLabel: 'Tᵣ₊₁', xStep: 1, grid: false);
      for (var k = 0; k <= n; k++) {
        final r = Rect.fromLTRB(pl.sx(k - 0.33), pl.sy(vals[k]), pl.sx(k + 0.33), pl.sy(0));
        c.drawRRect(RRect.fromRectAndCorners(r, topLeft: const Radius.circular(6), topRight: const Radius.circular(6)), Paint()..color = (k == s.r ? IX.positive : IX.accent).withValues(alpha: k == s.r ? 0.9 : 0.4));
        IxPaint.label(c, fmt(vals[k], vals[k] >= 100 ? 0 : 1), Offset(r.center.dx, r.top - 8), size: 17, color: IX.ink, w: FontWeight.w600, align: Alignment.bottomCenter);
        IxPaint.label(c, fmt(nCr(n, k), 0), Offset(r.center.dx, r.bottom - 16), size: 15, color: k == s.r ? Colors.white : IX.inkSoft, w: FontWeight.w600);
      }
      IxPaint.label(c, 'Inside each bar: the coefficient ⁿCᵣ from row $n of Pascal’s triangle', Offset(pl.rect.left, area.bottom + 6), size: 18, color: IX.inkSoft, align: Alignment.centerLeft);
    }
  }

  void _terms(Canvas c, Size size) {
    final n = s.n, p = s.p, q = s.q;
    final powers = [for (var r = 0; r <= n; r++) p * (n - r) - q * r];
    final lo = powers.reduce(math.min), hi = powers.reduce(math.max);
    final cmax = nCr(n, n ~/ 2);
    final pl = Plane(Rect.fromLTRB(90, 60, size.width - 50, size.height - 90), lo - 1.0, hi + 1.0, 0, cmax * 1.25);
    pl.paintGrid(c, xLabel: 'power of x', yLabel: 'ⁿCᵣ', xStep: niceStep((hi - lo + 2).toDouble(), 14).clamp(1, 100).toDouble(), grid: false);
    IxPaint.dashed(c, Offset(pl.sx(0), pl.rect.top), Offset(pl.sx(0), pl.rect.bottom), MPaint.stroke(MX.red, 2.5), dash: 10, gap: 7);
    IxPaint.label(c, 'x⁰', Offset(pl.sx(0) + 8, pl.rect.top + 12), size: 20, color: MX.red, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
    final bw = math.min(pl.ux * (p + q) * 0.6, 60.0);
    for (var r = 0; r <= n; r++) {
      final x = powers[r].toDouble(), v = nCr(n, r);
      final isZero = powers[r] == 0;
      final mid = n.isEven ? r == n ~/ 2 : (r == (n - 1) ~/ 2 || r == (n + 1) ~/ 2);
      final rect = Rect.fromLTRB(pl.sx(x) - bw / 2, pl.sy(v), pl.sx(x) + bw / 2, pl.sy(0));
      c.drawRRect(RRect.fromRectAndCorners(rect, topLeft: const Radius.circular(6), topRight: const Radius.circular(6)), Paint()..color = (isZero ? MX.red : mid ? IX.green : IX.accent).withValues(alpha: 0.8));
      IxPaint.label(c, 'T${subscript(r + 1)}', Offset(rect.center.dx, rect.top - 30), size: 17, color: IX.ink, w: FontWeight.w600, align: Alignment.bottomCenter);
      IxPaint.label(c, fmt(v, 0), Offset(rect.center.dx, rect.top - 8), size: 16, color: IX.inkSoft, align: Alignment.bottomCenter);
    }
    IxPaint.label(c, 'Red: the term free of x.  Green: the middle term(s).', Offset(90, size.height - 36), size: 19, color: IX.inkSoft, align: Alignment.centerLeft);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
