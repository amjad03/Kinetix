import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'common.dart';

/// Sequences and series: terms as bars with their partial sums, Gauss's pairing for an A.P.,
/// bounce heights and the infinite sum of a G.P., A.M. ≥ G.M. in a semicircle, and induction
/// as falling dominoes.
///
/// Preset: {"mode": "terms"|"gauss"|"bounce"|"gpsum"|"amgm"|"induction"|"divisible",
/// "rule": "ap"|"gp"|"odd"|"triangular"|"fibonacci"|"alternating", "a": 2, "d": 3, "r": 0.5, "n": 8,
/// "N": 4, "h": 8, "b": 8, "showSum": true, "base": true, "step": true}.
class SequenceInstrument extends StatefulWidget {
  const SequenceInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<SequenceInstrument> createState() => _SeqState();
}

class _SeqState extends State<SequenceInstrument> {
  String mode = 'terms', rule = 'ap';
  double a = 2, d = 3, r = 0.5, h = 8, b = 8;
  int n = 8, N = 4;
  bool showSum = false, base = true, step = true;
  int? active;

  static final _presets = <String, Map<String, dynamic>>{
    'A.P.': {'mode': 'terms', 'rule': 'ap', 'a': 2, 'd': 3, 'n': 8, 'N': 5, 'showSum': true},
    'G.P.': {'mode': 'terms', 'rule': 'gp', 'a': 1, 'r': 2, 'n': 7, 'N': 4},
    'Gauss sum': {'mode': 'gauss', 'a': 2, 'd': 1, 'n': 6},
    'Sum to infinity': {'mode': 'gpsum', 'a': 1, 'r': 0.5, 'n': 4},
    'A.M. ≥ G.M.': {'mode': 'amgm', 'a': 2, 'b': 8},
    'Induction': {'mode': 'induction', 'n': 10},
  };

  @override
  void initState() {
    super.initState();
    _apply(widget.preset.isEmpty ? _presets['A.P.']! : widget.preset);
    if (widget.preset.isEmpty) active = 0;
  }

  void _apply(Map<String, dynamic> m) {
    mode = ps(m, 'mode', 'terms');
    rule = ps(m, 'rule', 'ap');
    a = pd(m, 'a', 2);
    d = pd(m, 'd', 3);
    r = pd(m, 'r', 0.5);
    h = pd(m, 'h', 8);
    b = pd(m, 'b', 8);
    n = pint(m, 'n', 8);
    N = pint(m, 'N', 4).clamp(1, math.max(1, n));
    showSum = pb(m, 'showSum', false);
    base = pb(m, 'base', true);
    step = pb(m, 'step', true);
  }

  double term(int k) => switch (rule) {
    'gp' => a * math.pow(r, k - 1),
    'odd' => 2.0 * k - 1,
    'triangular' => k * (k + 1) / 2,
    'fibonacci' => _fib(k).toDouble(),
    'alternating' => (k.isOdd ? 1.0 : -1.0) * k,
    'square' => k * k.toDouble(),
    _ => a + (k - 1) * d,
  };

  static int _fib(int k) {
    var x = 1, y = 1;
    for (var i = 2; i < k; i++) {
      final t = x + y;
      x = y;
      y = t;
    }
    return k <= 2 ? 1 : y;
  }

  double sumTo(int k) => [for (var i = 1; i <= k; i++) term(i)].fold(0.0, (x, y) => x + y);

  String get ruleText => switch (rule) {
    'gp' => 'aₙ = ${fmtT(a)} · ${fmtT(r)}ⁿ⁻¹',
    'odd' => 'aₙ = 2n − 1',
    'triangular' => 'aₙ = n(n + 1)/2',
    'fibonacci' => 'aₙ = aₙ₋₁ + aₙ₋₂',
    'alternating' => 'aₙ = (−1)ⁿ⁺¹ n',
    'square' => 'aₙ = n²',
    _ => 'aₙ = ${fmtT(a)} + (n − 1)·${fmtT(d)}',
  };

  @override
  Widget build(BuildContext context) {
    String title, formula;
    late List<Readout> ro;
    late List<Widget> ctl;
    Widget sl(String l, num v, num lo, num hi, ValueChanged<double> on, {int dg = 0, int? div}) => IxSlider(label: l, value: v.toDouble().clamp(lo.toDouble(), hi.toDouble()), min: lo.toDouble(), max: hi.toDouble(), divisions: div ?? (hi - lo).round(), format: (x) => fmt(x, dg), onChanged: (x) => setState(() { on(x); active = null; }));
    switch (mode) {
      case 'gauss':
        final l = a + (n - 1) * d;
        title = 'Add an A.P. the Gauss way';
        formula = 'Sₙ = n(a + l)/2';
        ro = [
          Readout('Last term l', fmt(l, 1), '', IX.ink),
          Readout('Each column a + l', fmt(a + l, 1), '', IX.positive),
          Readout('Sₙ', fmt(n * (a + l) / 2, 1), '', IX.accent),
        ];
        ctl = [sl('a', a, 1, 6, (x) => a = x), sl('d', d, 0, 3, (x) => d = x), sl('n', n, 1, 10, (x) => n = x.round()), IxToggle(label: 'Show the reversed copy', value: showSum, onChanged: (v) => setState(() => showSum = v))];
      case 'bounce':
        title = 'Bounce heights form a G.P.';
        formula = 'peak k = h rᵏ';
        ro = [
          Readout('First peak a = hr', fmt(h * r, 2), 'm', IX.accent),
          Readout('Peak $N = h r${superscript(N)}', fmt(h * math.pow(r, N), 3), 'm', IX.positive),
          Readout('Common ratio', fmt(r, 2), '', IX.ink),
          Readout('Total distance', fmt(h + 2 * h * r / (1 - r), 2), 'm', IX.green),
        ];
        ctl = [sl('Drop height h', h, 2, 10, (x) => h = x, dg: 1, div: 16), sl('Ratio r', r, 0.3, 0.9, (x) => r = x, dg: 2, div: 12), sl('Bounce N', N, 1, 8, (x) => N = x.round())];
      case 'gpsum':
        final sinf = a / (1 - r);
        title = 'The sum of a G.P. to infinity';
        formula = 'S∞ = a/(1 − r),  |r| < 1';
        ro = [
          Readout('Terms added n', '$n', '', IX.ink),
          Readout('Sₙ = a(1 − rⁿ)/(1 − r)', fmt(a * (1 - math.pow(r, n)) / (1 - r), 4), '', IX.accent),
          Readout('S∞', fmt(sinf, 4), '', IX.positive),
          Readout('Gap a rⁿ/(1 − r)', fmt(a * math.pow(r, n) / (1 - r), 4), '', IX.inkSoft),
        ];
        ctl = [sl('a', a, 1, 4, (x) => a = x), sl('r', r, 0.1, 0.9, (x) => r = x, dg: 2, div: 16), sl('Terms n', n, 1, 12, (x) => n = x.round())];
      case 'amgm':
        title = 'A.M. and G.M. in a semicircle';
        formula = 'A.M. = (a + b)/2 ≥ √(ab) = G.M.';
        ro = [
          Readout('A.M.', fmt((a + b) / 2, 3), '', IX.green),
          Readout('G.M.', fmt(math.sqrt(a * b), 3), '', IX.amber),
          Readout('A.M. − G.M.', fmt((a + b) / 2 - math.sqrt(a * b), 3), '', IX.ink),
          Readout('H.M. = G.M.²/A.M.', fmt(a * b / ((a + b) / 2), 3), '', IX.inkSoft),
        ];
        ctl = [sl('a', a, 0.5, 8, (x) => a = x, dg: 1, div: 15), sl('b', b, 0.5, 8, (x) => b = x, dg: 1, div: 15)];
      case 'induction':
        final fallen = !base ? 0 : !step ? 1 : n;
        title = 'Induction as falling dominoes';
        formula = 'P(1) true, and P(k) ⇒ P(k + 1)';
        ro = [
          Readout('Dominoes fallen', base && step ? 'all $n' : '$fallen', '', IX.positive),
          Readout('1 + 2 + … + n', fmt(n * (n + 1) / 2, 0), '', IX.accent),
          Readout('n(n + 1)/2', fmt(n * (n + 1) / 2, 0), '', IX.green),
        ];
        ctl = [
          sl('n', n, 1, 20, (x) => n = x.round()),
          IxToggle(label: 'Base case P(1)', value: base, onChanged: (v) => setState(() => base = v)),
          IxToggle(label: 'Inductive step', value: step, onChanged: (v) => setState(() => step = v)),
        ];
      case 'divisible':
        title = 'Watch the inductive step work';
        formula = 'f(k + 1) = a·f(k) + (a − 1)';
        final fN = math.pow(a, N) - 1;
        ro = [
          Readout('f($N) = a${superscript(N)} − 1', fmt(fN.toDouble(), 0), '', IX.accent),
          Readout('f($N) ÷ (a − 1)', fmt(fN / (a - 1), 0), '', IX.positive),
          Readout('Remainder', '0', '', IX.green),
        ];
        ctl = [sl('a', a, 2, 10, (x) => a = x.roundToDouble()), sl('n', N, 1, 6, (x) => N = x.round())];
      default:
        title = rule == 'ap' ? 'Arithmetic progression' : rule == 'gp' ? 'Geometric progression' : 'A sequence, term by term';
        formula = ruleText;
        ro = [
          Readout('a${subscript(N)}', fmt(term(N), 2), '', IX.positive),
          Readout('Next term', fmt(term(N + 1), 2), '', IX.accent),
          Readout('S${subscript(N)}', fmt(sumTo(N), 2), '', IX.green),
          if (rule == 'gp' && r.abs() < 1) Readout('S∞ = a/(1 − r)', fmt(a / (1 - r), 3), '', IX.inkSoft),
        ];
        ctl = [
          if (rule == 'ap' || rule == 'gp') sl('First term a', a, rule == 'gp' ? 0.5 : -5, 10, (x) => a = x, dg: 1, div: rule == 'gp' ? 19 : 30),
          if (rule == 'ap') sl('Common difference d', d, -3, 5, (x) => d = x, dg: 1, div: 16),
          if (rule == 'gp') sl('Common ratio r', r, -2, 3, (x) => r = x, dg: 2, div: 20),
          sl('Terms shown', n, 3, 12, (x) { n = x.round(); N = N.clamp(1, n); }),
          sl('Term N', N, 1, n, (x) => N = x.round()),
          IxToggle(label: 'Show partial sums Sₙ', value: showSum, onChanged: (v) => setState(() => showSum = v)),
        ];
    }
    return InstrumentFrame(
      id: 'maths-sequence',
      subtitle: tx(widget.preset['subtitle']) ?? (mode == 'induction' || mode == 'divisible' ? '$kMaths · Mathematical induction' : '$kMaths · Sequences and series'),
      title: tx(widget.preset['title']) ?? title,
      formula: formula,
      state: {'mode': mode, 'rule': rule, 'a': a, 'd': d, 'r': r, 'n': n, 'N': N},
      readouts: ro,
      controls: ctl,
      presets: [for (final (i, e) in _presets.entries.indexed) Preset(e.key, () => setState(() { _apply(e.value); active = i; }))],
      activePreset: active,
      stage: CustomPaint(painter: _SeqPainter(this), size: Size.infinite),
    );
  }
}

class _SeqPainter extends CustomPainter {
  _SeqPainter(this.s);
  final _SeqState s;

  @override
  void paint(Canvas c, Size size) {
    switch (s.mode) {
      case 'gauss':
        _gauss(c, size);
      case 'bounce':
        _bounce(c, size);
      case 'gpsum':
        _gpsum(c, size);
      case 'amgm':
        _amgm(c, size);
      case 'induction':
        _dominoes(c, size);
      case 'divisible':
        _divisible(c, size);
      default:
        _terms(c, size);
    }
  }

  void _terms(Canvas c, Size size) {
    final vals = [for (var k = 1; k <= s.n; k++) s.term(k)];
    final sums = [for (var k = 1; k <= s.n; k++) s.sumTo(k)];
    final all = [...vals, if (s.showSum) ...sums, 0.0];
    var lo = all.reduce(math.min), hi = all.reduce(math.max);
    if (hi - lo < 1) hi = lo + 1;
    final pad = (hi - lo) * 0.15;
    final pl = Plane(Rect.fromLTRB(100, 50, size.width - 50, size.height - 70), 0.3, s.n + 0.7, lo < 0 ? lo - pad : 0, hi + pad);
    pl.paintGrid(c, xLabel: 'n', yLabel: 'aₙ', xStep: 1);
    for (var k = 1; k <= s.n; k++) {
      final v = vals[k - 1];
      final on = k == s.N;
      final rect = Rect.fromLTRB(pl.sx(k - 0.3), pl.sy(math.max(v, 0)), pl.sx(k + 0.3), pl.sy(math.min(v, 0)));
      c.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(5)), Paint()..color = (on ? IX.positive : IX.accent).withValues(alpha: on ? 0.9 : 0.45));
      IxPaint.label(c, fmtT(v, 2), Offset(rect.center.dx, v >= 0 ? rect.top - 8 : rect.bottom + 8), size: s.n > 10 ? 15 : 18, color: on ? IX.positive : IX.ink, w: FontWeight.w600, align: v >= 0 ? Alignment.bottomCenter : Alignment.topCenter);
    }
    if (s.showSum) {
      final path = Path();
      for (var k = 1; k <= s.n; k++) {
        final p = pl.p(k.toDouble(), sums[k - 1]);
        k == 1 ? path.moveTo(p.dx, p.dy) : path.lineTo(p.dx, p.dy);
      }
      c.drawPath(path, MPaint.stroke(IX.green, 3.5));
      for (var k = 1; k <= s.n; k++) {
        MPaint.dot(c, pl.p(k.toDouble(), sums[k - 1]), IX.green, r: 6);
      }
      MPaint.legend(c, Offset(pl.rect.left + 20, pl.rect.top + 6), [(IX.accent, 'terms aₙ'), (IX.green, 'partial sums Sₙ')]);
    }
    if (s.rule == 'gp' && s.r.abs() < 1 && s.showSum) {
      final sinf = s.a / (1 - s.r);
      IxPaint.dashed(c, pl.p(pl.xa, sinf), pl.p(pl.xb, sinf), MPaint.stroke(IX.positive, 2), dash: 9, gap: 7);
      IxPaint.label(c, 'S∞ = ${fmt(sinf, 3)}', pl.p(pl.xb, sinf) + const Offset(-10, -16), size: 18, color: IX.positive, w: FontWeight.w600, align: Alignment.bottomRight, halo: true);
    }
  }

  void _gauss(Canvas c, Size size) {
    final n = s.n, l = s.a + (n - 1) * s.d;
    final pl = Plane(Rect.fromLTRB(100, 50, size.width - 340, size.height - 70), 0.3, n + 0.7, 0, (s.a + l) * 1.12);
    pl.paintGrid(c, xLabel: 'term', yLabel: '', xStep: 1);
    for (var k = 1; k <= n; k++) {
      final v = s.a + (k - 1) * s.d, w = s.a + (n - k) * s.d;
      final r1 = Rect.fromLTRB(pl.sx(k - 0.4), pl.sy(v), pl.sx(k + 0.4), pl.sy(0));
      c.drawRect(r1, Paint()..color = IX.accent.withValues(alpha: 0.75));
      IxPaint.label(c, fmtT(v), r1.center, size: 18, color: Colors.white, w: FontWeight.w700);
      if (s.showSum) {
        final r2 = Rect.fromLTRB(pl.sx(k - 0.4), pl.sy(v + w), pl.sx(k + 0.4), pl.sy(v));
        c.drawRect(r2, Paint()..color = IX.positive.withValues(alpha: 0.6));
        IxPaint.label(c, fmtT(w), r2.center, size: 18, color: Colors.white, w: FontWeight.w700);
      }
    }
    if (s.showSum) {
      IxPaint.dashed(c, pl.p(pl.xa, s.a + l), pl.p(pl.xb, s.a + l), MPaint.stroke(IX.ink, 2), dash: 8, gap: 6);
      IxPaint.label(c, 'a + l = ${fmtT(s.a + l)}', pl.p(pl.xb, s.a + l) + const Offset(12, 0), size: 20, color: IX.ink, w: FontWeight.w700, align: Alignment.centerLeft);
    }
    final x0 = size.width - 300;
    final lines = ['Sₙ = a + (a + d) + … + l', 'Sₙ = l + (l − d) + … + a', '2Sₙ = n(a + l)', 'Sₙ = ${s.n} × ${fmtT(s.a + l)} / 2', '     = ${fmtT(s.n * (s.a + l) / 2)}'];
    for (final (i, t) in lines.indexed) {
      IxPaint.label(c, t, Offset(x0, 120 + i * 50.0), size: 22, color: i == 1 ? IX.positive : i >= 2 ? IX.ink : IX.accent, w: i >= 2 ? FontWeight.w700 : FontWeight.w500, align: Alignment.centerLeft);
    }
  }

  void _bounce(Canvas c, Size size) {
    final ground = size.height - 80;
    final u = (ground - 70) / s.h;
    final x0 = 120.0;
    c.drawLine(Offset(60, ground), Offset(size.width - 40, ground), MPaint.stroke(IX.ink, 3));
    // Drop.
    c.drawLine(Offset(x0, ground - s.h * u), Offset(x0, ground), MPaint.stroke(IX.steel, 2));
    IxPaint.label(c, 'h = ${fmtT(s.h, 1)} m', Offset(x0 - 14, ground - s.h * u), size: 19, color: IX.ink, w: FontWeight.w600, align: Alignment.centerRight);
    var x = x0;
    final span = (size.width - 220) / 8;
    for (var k = 1; k <= 8; k++) {
      final hk = s.h * math.pow(s.r, k);
      final w = span * math.sqrt(math.pow(s.r, k)) * 1.6;
      final path = Path()..moveTo(x, ground);
      for (var t = 0; t <= 30; t++) {
        final tt = t / 30;
        path.lineTo(x + w * tt, ground - 4 * hk * u * tt * (1 - tt));
      }
      final on = k == s.N;
      c.drawPath(path, MPaint.stroke(on ? IX.positive : IX.accent.withValues(alpha: 0.5), on ? 3.5 : 2.5));
      final top = Offset(x + w / 2, ground - hk * u);
      MPaint.dot(c, top, on ? IX.positive : IX.accent, r: on ? 9 : 6);
      if (k <= 5 || on) IxPaint.label(c, 'h r${superscript(k)} = ${fmt(hk, 2)}', top - const Offset(0, 16), size: k <= 2 || on ? 18 : 15, color: on ? IX.positive : IX.inkSoft, w: on ? FontWeight.w700 : FontWeight.w500, align: Alignment.bottomCenter, halo: true);
      x += w;
    }
    c.drawCircle(Offset(x0, ground - s.h * u - 16), 16, Paint()..color = IX.amber);
  }

  void _gpsum(Canvas c, Size size) {
    final sinf = s.a / (1 - s.r);
    final left = 80.0, right = size.width - 80;
    final u = (right - left) / sinf;
    final y = size.height * 0.42, hgt = 90.0;
    c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(left, y - hgt / 2, right, y + hgt / 2), const Radius.circular(10)), MPaint.stroke(IX.ink, 2));
    var x = left;
    for (var k = 0; k < s.n; k++) {
      final t = s.a * math.pow(s.r, k);
      final rect = Rect.fromLTWH(x, y - hgt / 2, t * u, hgt);
      c.drawRect(rect, Paint()..color = MX.series[k % MX.series.length].withValues(alpha: 0.75));
      c.drawRect(rect, MPaint.stroke(Colors.white, 2));
      if (rect.width > 60) IxPaint.label(c, k == 0 ? 'a' : 'ar${k == 1 ? '' : superscript(k)}', rect.center, size: 20, color: Colors.white, w: FontWeight.w700);
      x += t * u;
    }
    IxPaint.label(c, 'S∞ = a/(1 − r) = ${fmt(sinf, 3)}', Offset(right, y - hgt / 2 - 16), size: 22, color: IX.ink, w: FontWeight.w700, align: Alignment.bottomRight);
    IxPaint.label(c, 'Sₙ = ${fmt((x - left) / u, 3)}', Offset(left, y + hgt / 2 + 18), size: 22, color: IX.accent, w: FontWeight.w700, align: Alignment.topLeft);
    if (right - x > 4) {
      c.drawLine(Offset(x, y + hgt / 2 + 10), Offset(right, y + hgt / 2 + 10), MPaint.stroke(MX.red, 3));
      IxPaint.label(c, 'gap ${fmt((right - x) / u, 4)}', Offset((x + right) / 2, y + hgt / 2 + 60), size: 19, color: MX.red, w: FontWeight.w600);
    }
    // Partial sums approaching the limit.
    final pl = Plane(Rect.fromLTRB(110, y + hgt + 130, size.width - 60, size.height - 50), 0, 12.5, 0, sinf * 1.15);
    pl.paintGrid(c, xLabel: 'n', yLabel: 'Sₙ', xStep: 1, yStep: niceStep(sinf, 3));
    IxPaint.dashed(c, pl.p(0, sinf), pl.p(12.5, sinf), MPaint.stroke(IX.positive, 2), dash: 8, gap: 6);
    for (var k = 1; k <= 12; k++) {
      final sk = s.a * (1 - math.pow(s.r, k)) / (1 - s.r);
      MPaint.dot(c, pl.p(k.toDouble(), sk), k <= s.n ? IX.accent : IX.steel, r: 6);
    }
  }

  void _amgm(Canvas c, Size size) {
    final total = s.a + s.b;
    final w = size.width - 200;
    final u = math.min(w / total, (size.height - 160) / (total / 2));
    final o = Offset(size.width / 2, size.height - 90);
    final rad = total / 2 * u;
    final left = o - Offset(rad, 0);
    c.drawArc(Rect.fromCircle(center: o, radius: rad), math.pi, math.pi, false, MPaint.stroke(IX.steel, 3));
    c.drawLine(left, o + Offset(rad, 0), MPaint.stroke(IX.ink, 3));
    final px = left.dx + s.a * u;
    final g = math.sqrt(s.a * s.b) * u;
    c.drawLine(Offset(px, o.dy), Offset(px, o.dy - g), MPaint.stroke(IX.amber, 6));
    c.drawLine(o, Offset(px, o.dy - g), MPaint.stroke(IX.rule, 2));
    c.drawLine(o, o - Offset(0, rad), MPaint.stroke(IX.green, 6));
    IxPaint.label(c, 'a = ${fmtT(s.a, 1)}', Offset((left.dx + px) / 2, o.dy + 26), size: 21, color: IX.accent, w: FontWeight.w700);
    IxPaint.label(c, 'b = ${fmtT(s.b, 1)}', Offset((px + o.dx + rad) / 2, o.dy + 26), size: 21, color: IX.positive, w: FontWeight.w700);
    IxPaint.label(c, 'G.M. = √(ab) = ${fmt(g / u, 2)}', Offset(px + (px < o.dx ? -14 : 14), o.dy - g / 2), size: 21, color: IX.amber, w: FontWeight.w700, align: px < o.dx ? Alignment.centerRight : Alignment.centerLeft, halo: true);
    IxPaint.label(c, 'A.M. = ${fmt(total / 2, 2)}', o - Offset(-14, rad * 0.55), size: 21, color: IX.green, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
    MPaint.dot(c, Offset(px, o.dy), IX.ink, r: 7);
    MPaint.dot(c, o, IX.ink, r: 6);
    IxPaint.label(c, 'A half-chord can never be longer than the radius, so G.M. ≤ A.M.', Offset(size.width / 2, 40), size: 21, color: IX.inkSoft);
  }

  void _dominoes(Canvas c, Size size) {
    final n = math.min(s.n, 20);
    final ground = size.height * 0.5;
    final w = (size.width - 160) / n;
    final hgt = math.min(160.0, w * 2.6);
    final fallen = !s.base ? 0 : !s.step ? 1 : n;
    c.drawLine(Offset(60, ground), Offset(size.width - 60, ground), MPaint.stroke(IX.ink, 2.5));
    for (var k = 1; k <= n; k++) {
      final x = 80 + (k - 1) * w;
      final down = k <= fallen;
      c.save();
      c.translate(x + w * 0.35, ground);
      if (down) c.rotate(math.pi / 2 * 0.72);
      final rect = Rect.fromLTWH(-w * 0.18, -hgt, w * 0.36, hgt);
      c.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(5)), Paint()..color = down ? IX.positive : IX.accent);
      c.restore();
      IxPaint.label(c, '$k', Offset(x + w * 0.35, ground + 22), size: n > 14 ? 14 : 17, color: IX.inkSoft, w: FontWeight.w600);
    }
    final msg = !s.base ? 'No base case: nothing starts the chain' : !s.step ? 'No inductive step: only domino 1 falls' : 'Base case + inductive step: every domino falls';
    IxPaint.label(c, msg, Offset(size.width / 2, 60), size: 24, color: s.base && s.step ? IX.green : MX.red, w: FontWeight.w700);
    // The statement P(n): 1 + 2 + … + n = n(n + 1)/2 as a staircase.
    final st = math.min(18.0, (size.height - ground - 100) / n);
    final sx0 = size.width / 2 - n * st / 2;
    final top = ground + 70;
    for (var k = 1; k <= n; k++) {
      for (var j = 0; j < k; j++) {
        c.drawRect(Rect.fromLTWH(sx0 + (k - 1) * st, top + (n - 1 - j) * st, st - 2, st - 2), Paint()..color = IX.accent.withValues(alpha: 0.55));
      }
    }
    IxPaint.label(c, 'P(${s.n}):  1 + 2 + … + ${s.n} = ${s.n}·${s.n + 1}/2 = ${fmt(s.n * (s.n + 1) / 2, 0)}', Offset(sx0 + n * st + 40, top + n * st / 2), size: 22, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
  }

  void _divisible(Canvas c, Size size) {
    final vals = [for (var k = 1; k <= 6; k++) math.pow(s.a, k) - 1.0];
    final hi = vals.reduce(math.max);
    final logScale = hi > 2000;
    double tr(double v) => logScale ? math.log(v + 1) / math.ln10 : v;
    final pl = Plane(Rect.fromLTRB(110, 60, size.width - 60, size.height - 80), 0.3, 6.7, 0, tr(hi) * 1.18);
    pl.paintGrid(c, xLabel: 'n', yLabel: logScale ? 'f(n), log scale' : 'f(n)', xStep: 1, yTicks: !logScale);
    for (var k = 1; k <= 6; k++) {
      final v = vals[k - 1];
      final on = k == s.N;
      final rect = Rect.fromLTRB(pl.sx(k - 0.3), pl.sy(tr(v)), pl.sx(k + 0.3), pl.sy(0));
      c.drawRRect(RRect.fromRectAndCorners(rect, topLeft: const Radius.circular(6), topRight: const Radius.circular(6)), Paint()..color = (on ? IX.positive : IX.accent).withValues(alpha: on ? 0.9 : 0.45));
      IxPaint.label(c, fmt(v, 0), Offset(rect.center.dx, rect.top - 34), size: 17, color: IX.ink, w: FontWeight.w600, align: Alignment.bottomCenter);
      IxPaint.label(c, '= ${fmtT(s.a - 1)} × ${fmt(v / (s.a - 1), 0)}', Offset(rect.center.dx, rect.top - 10), size: 15, color: IX.inkSoft, align: Alignment.bottomCenter);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
