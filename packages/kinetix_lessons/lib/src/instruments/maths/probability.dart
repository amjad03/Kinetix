import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'common.dart';

/// Probability: events on one die and on the 36 outcomes of two dice (with conditioning),
/// relative frequency settling towards P(E), the addition rule as overlapping areas,
/// conditional probability as area, Bayes' theorem with causes as columns, and a two-stage
/// tree for drawing balls with or without replacement.
///
/// Preset: {"mode": "die"|"dice"|"frequency"|"area"|"conditional"|"bayes"|"tree"|"space",
/// "A": "even"|"odd"|"prime"|"ge4", "k": 4, "op": "or"|"and"|"butnot"|"notA", "s": 7,
/// "B": "doubles"|"first6"|"second12"|"sumGt8"|"firstEven", "given": false, "p": 0.5, "N": 400,
/// "pA": 0.5, "pB": 0.4, "pAB": 0.15, "pBA": 0.7, "pBn": 0.3, "priors": [0.25, 0.35, 0.4],
/// "rates": [0.05, 0.04, 0.02], "names": ["M₁", "M₂", "M₃"], "red": 3, "blue": 2, "replace": false,
/// "coins": 2, "dice": 1, "people": 200}.
class ProbabilityInstrument extends StatefulWidget {
  const ProbabilityInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<ProbabilityInstrument> createState() => _ProbState();
}

class _ProbState extends State<ProbabilityInstrument> {
  String mode = 'dice', evA = 'even', op = 'or', evB = 'doubles', eventName = 'Head on a coin';
  int k = 4, s = 7, N = 400, red = 3, blue = 2, coins = 2, dice = 1, seed = 1;
  double p = 0.5, pA = 0.5, pB = 0.4, pAB = 0.15, pBA = 0.7, pBn = 0.3;
  bool given = false, replace = false;
  List<double> priors = [0.25, 0.35, 0.4], rates = [0.05, 0.04, 0.02];
  List<String> names = ['M₁', 'M₂', 'M₃'];
  int? people;
  int? active;

  static final _presets = <String, Map<String, dynamic>>{
    'Two dice': {'mode': 'dice', 's': 7, 'B': 'doubles'},
    'Given B': {'mode': 'dice', 's': 8, 'B': 'firstEven', 'given': true},
    'Relative frequency': {'mode': 'frequency', 'p': 0.5, 'N': 400},
    'Addition rule': {'mode': 'area', 'pA': 0.5, 'pB': 0.4, 'pAB': 0.15},
    'Bayes': {'mode': 'bayes', 'priors': [0.25, 0.35, 0.4], 'rates': [0.05, 0.04, 0.02]},
    'Balls from a bag': {'mode': 'tree', 'red': 3, 'blue': 2, 'replace': false},
  };

  @override
  void initState() {
    super.initState();
    _apply(widget.preset.isEmpty ? _presets['Two dice']! : widget.preset);
    if (widget.preset.isEmpty) active = 0;
  }

  void _apply(Map<String, dynamic> m) {
    mode = ps(m, 'mode', 'dice');
    evA = ps(m, 'A', 'even');
    op = ps(m, 'op', 'or');
    evB = ps(m, 'B', 'doubles');
    k = pint(m, 'k', 4);
    s = pint(m, 's', 7);
    N = pint(m, 'N', 400);
    p = pd(m, 'p', 0.5);
    eventName = ps(m, 'event', 'E');
    pA = pd(m, 'pA', 0.5);
    pB = pd(m, 'pB', 0.4);
    pAB = pd(m, 'pAB', 0.15);
    pBA = pd(m, 'pBA', 0.7);
    pBn = pd(m, 'pBn', 0.3);
    given = pb(m, 'given', false);
    priors = pl(m, 'priors', [0.25, 0.35, 0.4]);
    rates = pl(m, 'rates', [0.05, 0.04, 0.02]);
    names = m['names'] is List ? [for (final e in m['names'] as List) '$e'] : [for (var i = 0; i < priors.length; i++) 'E${subscript(i + 1)}'];
    red = pint(m, 'red', 3);
    blue = pint(m, 'blue', 2);
    replace = pb(m, 'replace', false);
    coins = pint(m, 'coins', 2);
    dice = pint(m, 'dice', 1);
    people = m['people'] == null ? null : pint(m, 'people', 200);
  }

  bool inA1(int f) => switch (evA) { 'odd' => f.isOdd, 'prime' => f == 2 || f == 3 || f == 5, 'ge4' => f >= 4, _ => f.isEven };
  bool inB1(int f) => f >= k;
  bool inOp(int f) => switch (op) { 'and' => inA1(f) && inB1(f), 'butnot' => inA1(f) && !inB1(f), 'notA' => !inA1(f), _ => inA1(f) || inB1(f) };
  String get aText => const {'even': 'an even number', 'odd': 'an odd number', 'prime': 'a prime', 'ge4': '4 or more'}[evA]!;
  String get opText => const {'or': 'A or B', 'and': 'A and B', 'butnot': 'A but not B', 'notA': 'not A'}[op]!;

  bool dA(int a, int b) => a + b == s;
  bool dB(int a, int b) => switch (evB) { 'first6' => a == 6, 'second12' => b <= 2, 'sumGt8' => a + b > 8, 'firstEven' => a.isEven, 'sumLt5' => a + b < 5, _ => a == b };
  String get bText => const {'doubles': 'doubles', 'first6': 'first die shows 6', 'second12': 'second die shows 1 or 2', 'sumGt8': 'sum more than 8', 'firstEven': 'first die even', 'sumLt5': 'sum less than 5'}[evB]!;

  List<double> get trials {
    final rnd = math.Random(seed * 101 + (p * 1000).round());
    var hits = 0;
    return [for (var i = 1; i <= N; i++) (hits += rnd.nextDouble() < p ? 1 : 0) / i];
  }

  String pf(double v) => fmt(v, 3);

  @override
  Widget build(BuildContext context) {
    String title, formula;
    late List<Readout> ro;
    late List<Widget> ctl;
    Widget sl(String l, double v, double lo, double hi, ValueChanged<double> on, {int d = 2, int? div}) => IxSlider(label: l, value: v.clamp(lo, hi), min: lo, max: hi, divisions: div ?? ((hi - lo) * 20).round(), format: (x) => fmt(x, d), onChanged: (x) => setState(() { on(x); active = null; }));
    switch (mode) {
      case 'die':
        final nA = [for (var f = 1; f <= 6; f++) if (inA1(f)) f].length, nB = [for (var f = 1; f <= 6; f++) if (inB1(f)) f].length;
        final nR = [for (var f = 1; f <= 6; f++) if (inOp(f)) f].length;
        final nAB = [for (var f = 1; f <= 6; f++) if (inA1(f) && inB1(f)) f].length;
        title = 'Events on a die: or, and, not';
        formula = 'P($opText) = $nR/6';
        ro = [Readout('n(A)', '$nA', '', IX.accent), Readout('n(B)', '$nB', '', IX.green), Readout('n(A ∩ B)', '$nAB', '', MX.violet), Readout('P($opText)', pf(nR / 6), '', IX.positive)];
        ctl = [
          IxSegments<String>(label: 'Event A', options: const {'even': 'Even', 'odd': 'Odd', 'prime': 'Prime', 'ge4': '4 or more'}, value: evA, onChanged: (v) => setState(() => evA = v)),
          sl('B: at least k', k.toDouble(), 1, 7, (v) => k = v.round(), d: 0, div: 6),
          IxSegments<String>(label: 'Event', options: const {'or': 'A or B', 'and': 'A and B', 'butnot': 'A − B', 'notA': 'not A'}, value: op, onChanged: (v) => setState(() => op = v)),
        ];
      case 'frequency':
        final t = trials;
        title = 'Relative frequency settles down';
        formula = 'm/n → P(E) as n grows';
        ro = [Readout('Trials n', '$N', '', IX.ink), Readout('Relative frequency m/n', pf(t.last), '', IX.accent), Readout('P(E)', pf(p), '', IX.positive), Readout('Difference', fmt(t.last - p, 3), '', IX.inkSoft)];
        ctl = [
          sl('Trials n', N.toDouble(), 10, 2000, (v) => N = v.round(), d: 0, div: 199),
          sl('P(E)', p, 0.02, 0.98, (v) => p = v, div: 96),
          IxButton('New run of trials', icon: Icons.refresh_rounded, onTap: () => setState(() => seed++)),
        ];
      case 'area':
        final q = pAB.clamp(math.max(0.0, pA + pB - 1), math.min(pA, pB)).toDouble();
        title = 'The addition rule';
        formula = 'P(A ∪ B) = P(A) + P(B) − P(A ∩ B)';
        ro = [Readout('P(A ∩ B) used', pf(q), '', MX.violet), Readout('P(A ∪ B)', pf(pA + pB - q), '', IX.positive), Readout('P(A only)', pf(pA - q), '', IX.accent), Readout('P(neither)', pf(1 - pA - pB + q), '', IX.inkSoft)];
        ctl = [sl('P(A)', pA, 0.05, 0.95, (v) => pA = v), sl('P(B)', pB, 0.05, 0.95, (v) => pB = v), sl('P(A ∩ B)', pAB, 0, 0.95, (v) => pAB = v)];
      case 'conditional':
        final pab = pA * pBA, pb = pab + (1 - pA) * pBn;
        title = 'Conditional probability as area';
        formula = 'P(A ∩ B) = P(A) · P(B | A)';
        ro = [Readout('P(A ∩ B)', pf(pab), '', MX.violet), Readout('P(B)', pf(pb), '', IX.green), Readout('P(A | B)', pf(pab / pb), '', IX.positive), Readout('Independent?', (pBA - pBn).abs() < 1e-9 ? 'Yes: P(B|A) = P(B|A′)' : 'No', '', IX.inkSoft)];
        ctl = [sl('P(A)', pA, 0.1, 0.9, (v) => pA = v), sl('P(B | A)', pBA, 0.05, 0.95, (v) => pBA = v), sl('P(B | A′)', pBn, 0.05, 0.95, (v) => pBn = v)];
      case 'bayes':
        final joint = [for (var i = 0; i < priors.length; i++) priors[i] * rates[i]];
        final tot = joint.fold(0.0, (a, b) => a + b);
        title = people != null ? 'Bayes with $people people' : 'Bayes’ theorem';
        formula = 'P(Eᵢ | A) = P(Eᵢ) P(A | Eᵢ) / Σ P(Eⱼ) P(A | Eⱼ)';
        ro = [
          Readout('P(A) = Σ P(Eᵢ)P(A | Eᵢ)', fmt(tot, 4), '', IX.ink),
          for (var i = 0; i < priors.length; i++) Readout('P(${names[i]} | A)', fmt(joint[i] / tot, 3), '', MX.series[i % MX.series.length]),
        ];
        ctl = [
          sl('Prior P(${names[0]})', priors[0], 0.05, 0.9, (v) {
            final rest = priors.sublist(1).fold(0.0, (a, b) => a + b);
            final scale = rest == 0 ? 0.0 : (1 - v) / rest;
            priors = [v, for (final x in priors.sublist(1)) x * scale];
          }),
          for (var i = 0; i < rates.length; i++) sl('P(A | ${names[i]})', rates[i], 0.0, rates[i] > 0.2 ? 1.0 : 0.2, (v) => rates[i] = v, d: rates[i] > 0.2 ? 2 : 3, div: 100),
        ];
      case 'tree':
        final t = red + blue;
        final pRR = red / t * (replace ? red / t : (red - 1) / (t - 1)), pBB = blue / t * (replace ? blue / t : (blue - 1) / (t - 1));
        title = replace ? 'Two balls, with replacement' : 'Two balls, without replacement';
        formula = 'P(A ∩ B) = P(A) · P(B | A)';
        ro = [Readout('P(both red)', pf(pRR), '', MX.red), Readout('P(both blue)', pf(pBB), '', IX.accent), Readout('P(one of each)', pf(1 - pRR - pBB), '', MX.violet), Readout('P(2nd red | 1st red)', pf(replace ? red / t : (red - 1) / (t - 1)), '', IX.inkSoft)];
        ctl = [sl('Red balls', red.toDouble(), 1, 8, (v) => red = v.round(), d: 0, div: 7), sl('Blue balls', blue.toDouble(), 1, 8, (v) => blue = v.round(), d: 0, div: 7), IxToggle(label: 'Put the first ball back', value: replace, onChanged: (v) => setState(() => replace = v))];
      case 'space':
        final n = math.pow(2, coins) * math.pow(6, dice);
        title = 'How big is the sample space?';
        formula = 'n(S) = 2ⁿ × 6ᵐ';
        ro = [Readout('n(S)', fmt(n.toDouble(), 0), '', IX.positive), Readout('One outcome has probability', n > 1e6 ? sci(1 / n) : fmt(1 / n, 5), '', IX.accent), Readout('Events (subsets)', n > 30 ? '2^${fmt(n.toDouble(), 0)}' : fmt(math.pow(2, n).toDouble(), 0), '', IX.inkSoft)];
        ctl = [sl('Coins n', coins.toDouble(), 0, 10, (v) => coins = v.round(), d: 0, div: 10), sl('Dice m', dice.toDouble(), 0, 4, (v) => dice = v.round(), d: 0, div: 4)];
      default:
        int cnt(bool Function(int, int) f) => [for (var a = 1; a <= 6; a++) for (var b = 1; b <= 6; b++) if (f(a, b)) 1].length;
        final nA = cnt(dA), nB = cnt(dB), nAB = cnt((a, b) => dA(a, b) && dB(a, b));
        title = given ? 'Conditional probability on two dice' : 'Events in the sample space of two dice';
        formula = given ? 'P(A | B) = n(A ∩ B)/n(B) = $nAB/$nB' : 'P(A ∪ B) = (n(A) + n(B) − n(A ∩ B))/36';
        ro = [
          Readout('n(A): sum is $s', '$nA', '', IX.accent),
          Readout('n(B): $bText', '$nB', '', IX.green),
          Readout('n(A ∩ B)', '$nAB', '', MX.violet),
          given ? Readout('P(A | B)', nB == 0 ? '—' : pf(nAB / nB), '', IX.positive) : Readout('P(A ∪ B)', pf((nA + nB - nAB) / 36), '', IX.positive),
          Readout('A and B', nAB == 0 ? 'mutually exclusive' : (nAB * 36 - nA * nB).abs() == 0 ? 'independent' : 'not independent', '', IX.inkSoft),
        ];
        ctl = [
          sl('A: the sum is s', s.toDouble(), 2, 12, (v) => s = v.round(), d: 0, div: 10),
          segs<String>('Event B', const {'doubles': 'Doubles', 'first6': 'First is 6', 'second12': 'Second 1 or 2', 'firstEven': 'First even', 'sumGt8': 'Sum > 8'}, evB, (v) => setState(() => evB = v)),
          IxToggle(label: 'Given that B has happened', value: given, onChanged: (v) => setState(() => given = v)),
        ];
    }
    return InstrumentFrame(
      id: 'maths-probability',
      subtitle: tx(widget.preset['subtitle']) ?? '$kMaths · Probability',
      title: tx(widget.preset['title']) ?? title,
      formula: formula,
      state: {'mode': mode, 's': s, 'B': evB, 'given': given, 'p': p, 'N': N},
      readouts: ro,
      controls: ctl,
      presets: [for (final (i, e) in _presets.entries.indexed) Preset(e.key, () => setState(() { _apply(e.value); active = i; }))],
      activePreset: active,
      stage: CustomPaint(painter: _ProbPainter(this), size: Size.infinite),
    );
  }
}

class _ProbPainter extends CustomPainter {
  _ProbPainter(this.s);
  final _ProbState s;

  void face(Canvas c, Rect r, int n, Color fill, Color pip) {
    c.drawRRect(RRect.fromRectAndRadius(r, Radius.circular(r.width * 0.16)), Paint()..color = fill);
    c.drawRRect(RRect.fromRectAndRadius(r, Radius.circular(r.width * 0.16)), MPaint.stroke(IX.ink.withValues(alpha: 0.5), 2));
    const pos = {
      1: [Offset(0.5, 0.5)],
      2: [Offset(0.25, 0.25), Offset(0.75, 0.75)],
      3: [Offset(0.25, 0.25), Offset(0.5, 0.5), Offset(0.75, 0.75)],
      4: [Offset(0.25, 0.25), Offset(0.75, 0.25), Offset(0.25, 0.75), Offset(0.75, 0.75)],
      5: [Offset(0.25, 0.25), Offset(0.75, 0.25), Offset(0.5, 0.5), Offset(0.25, 0.75), Offset(0.75, 0.75)],
      6: [Offset(0.27, 0.22), Offset(0.73, 0.22), Offset(0.27, 0.5), Offset(0.73, 0.5), Offset(0.27, 0.78), Offset(0.73, 0.78)],
    };
    for (final q in pos[n]!) {
      c.drawCircle(r.topLeft + Offset(q.dx * r.width, q.dy * r.height), r.width * 0.085, Paint()..color = pip);
    }
  }

  @override
  void paint(Canvas c, Size size) {
    switch (s.mode) {
      case 'die':
        final w = math.min(150.0, (size.width - 200) / 6 - 20);
        for (var f = 1; f <= 6; f++) {
          final r = Rect.fromLTWH(100 + (f - 1) * (w + 20), size.height * 0.3, w, w);
          final on = s.inOp(f);
          face(c, r, f, on ? const Color(0xFFFDE7DA) : Colors.white, IX.ink);
          if (on) c.drawRRect(RRect.fromRectAndRadius(r.inflate(6), Radius.circular(w * 0.2)), MPaint.stroke(IX.positive, 4));
          final below = r.bottomCenter + const Offset(0, 30);
          if (s.inA1(f)) MPaint.dot(c, below - const Offset(14, 0), IX.accent, r: 9);
          if (s.inB1(f)) MPaint.dot(c, below + const Offset(14, 0), IX.green, r: 9);
        }
        IxPaint.label(c, 'A: ${s.aText}    B: at least ${s.k}', Offset(100, size.height * 0.16), size: 24, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
        IxPaint.label(c, 'Blue dot: in A   Green dot: in B   Ringed: in "${s.opText}"', Offset(100, size.height * 0.78), size: 20, color: IX.inkSoft, align: Alignment.centerLeft);
      case 'frequency':
        final t = s.trials;
        final pl = Plane(Rect.fromLTRB(100, 60, size.width - 60, size.height - 70), 0, s.N.toDouble(), 0, 1);
        pl.paintGrid(c, xLabel: 'n', yLabel: 'm/n', yStep: 0.25);
        IxPaint.dashed(c, pl.p(0, s.p), pl.p(s.N.toDouble(), s.p), MPaint.stroke(IX.positive, 2.5), dash: 10, gap: 7);
        IxPaint.label(c, 'P(E) = ${fmtT(s.p, 3)}', pl.p(s.N.toDouble(), s.p) + const Offset(-8, -16), size: 19, color: IX.positive, w: FontWeight.w700, align: Alignment.bottomRight, halo: true);
        final path = Path();
        for (var i = 0; i < t.length; i++) {
          final q = pl.p(i + 1.0, t[i]);
          i == 0 ? path.moveTo(q.dx, q.dy) : path.lineTo(q.dx, q.dy);
        }
        c.drawPath(path, MPaint.stroke(IX.accent, 3));
        if (s.eventName != 'E') IxPaint.label(c, 'E: ${s.eventName}', Offset(pl.rect.left + 16, pl.rect.top + 8), size: 21, color: IX.ink, w: FontWeight.w600, align: Alignment.topLeft, halo: true);
      case 'area':
        final q = s.pAB.clamp(math.max(0.0, s.pA + s.pB - 1), math.min(s.pA, s.pB)).toDouble();
        final side = math.min(size.height - 140, size.width * 0.5);
        final o = Offset(80, 70);
        final r = Rect.fromLTWH(o.dx, o.dy, side, side);
        c.drawRect(r, Paint()..color = const Color(0xFFFAFBFE));
        // A: from the left, width P(A); B: from the right edge of A minus overlap.
        final aW = s.pA * side, bStart = (s.pA - q) * side, bW = s.pB * side;
        c.drawRect(Rect.fromLTWH(o.dx, o.dy, aW, side), Paint()..color = IX.accent.withValues(alpha: 0.22));
        c.drawRect(Rect.fromLTWH(o.dx + bStart, o.dy, bW, side), Paint()..color = IX.green.withValues(alpha: 0.22));
        c.drawRect(r, MPaint.stroke(IX.ink, 2.5));
        IxPaint.label(c, 'A', Offset(o.dx + aW / 2 - (q * side) / 2, o.dy + 30), size: 28, color: IX.accent, w: FontWeight.w700);
        IxPaint.label(c, 'B', Offset(o.dx + bStart + bW / 2 + (q * side) / 2, o.dy + side - 30), size: 28, color: IX.green, w: FontWeight.w700);
        if (q > 0.02) IxPaint.label(c, 'A ∩ B', Offset(o.dx + bStart + q * side / 2, o.dy + side / 2), size: 20, color: MX.violet, w: FontWeight.w700, halo: true);
        IxPaint.label(c, 'Total area 1 = the sample space', Offset(o.dx, o.dy + side + 30), size: 19, color: IX.inkSoft, align: Alignment.centerLeft);
        // Bars.
        final bx = o.dx + side + 100;
        final items = [('P(A)', s.pA, IX.accent), ('+ P(B)', s.pB, IX.green), ('− P(A ∩ B)', q, MX.violet), ('= P(A ∪ B)', s.pA + s.pB - q, IX.positive)];
        final bw = size.width - bx - 60;
        for (final (i, (n, v, col)) in items.indexed) {
          final y = o.dy + 40 + i * 92.0;
          IxPaint.label(c, n, Offset(bx, y), size: 22, color: col, w: FontWeight.w700, align: Alignment.centerLeft);
          c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(bx, y + 22, bw, 26), const Radius.circular(13)), Paint()..color = IX.grid);
          c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(bx, y + 22, bw * v.clamp(0, 1), 26), const Radius.circular(13)), Paint()..color = col.withValues(alpha: 0.8));
          IxPaint.label(c, fmt(v, 2), Offset(bx + bw, y), size: 22, color: IX.ink, w: FontWeight.w700, align: Alignment.centerRight);
        }
      case 'conditional':
        final side = math.min(size.height - 140, size.width * 0.5);
        final o = Offset(80, 70);
        final aw = s.pA * side;
        final cols = [(o.dx, aw, s.pBA, 'A'), (o.dx + aw, side - aw, s.pBn, 'A′')];
        for (final (x, w, pb, n) in cols) {
          c.drawRect(Rect.fromLTWH(x, o.dy, w, side), Paint()..color = n == 'A' ? IX.accent.withValues(alpha: 0.08) : const Color(0xFFFAFBFE));
          c.drawRect(Rect.fromLTWH(x, o.dy + side * (1 - pb), w, side * pb), Paint()..color = IX.green.withValues(alpha: n == 'A' ? 0.45 : 0.25));
          IxPaint.label(c, n, Offset(x + w / 2, o.dy - 20), size: 24, color: n == 'A' ? IX.accent : IX.inkSoft, w: FontWeight.w700);
          if (w > 70) IxPaint.label(c, 'B: ${fmt(pb, 2)}', Offset(x + w / 2, o.dy + side * (1 - pb / 2)), size: 19, color: IX.ink, w: FontWeight.w600, halo: true);
        }
        c.drawRect(Rect.fromLTWH(o.dx, o.dy, side, side), MPaint.stroke(IX.ink, 2.5));
        c.drawLine(Offset(o.dx + aw, o.dy), Offset(o.dx + aw, o.dy + side), MPaint.stroke(IX.ink, 2));
        IxPaint.label(c, 'width P(A) = ${fmt(s.pA, 2)}', Offset(o.dx + aw / 2, o.dy + side + 26), size: 18, color: IX.accent, w: FontWeight.w600);
        final tx0 = o.dx + side + 80;
        final pab = s.pA * s.pBA, pb = pab + (1 - s.pA) * s.pBn;
        final lines = ['P(A ∩ B) = P(A) × P(B | A)', '           = ${fmt(s.pA, 2)} × ${fmt(s.pBA, 2)} = ${fmt(pab, 3)}', 'P(B) = ${fmt(pab, 3)} + ${fmt((1 - s.pA) * s.pBn, 3)} = ${fmt(pb, 3)}', 'P(A | B) = P(A ∩ B)/P(B) = ${fmt(pab / pb, 3)}'];
        for (final (i, t) in lines.indexed) {
          IxPaint.label(c, t, Offset(tx0, o.dy + 40 + i * 56.0), size: 22, color: i == 3 ? IX.positive : IX.ink, w: i == 3 ? FontWeight.w700 : FontWeight.w500, align: Alignment.centerLeft);
        }
      case 'bayes':
        final n = s.priors.length;
        final o = Offset(80, 80);
        final W = size.width * 0.5, H = size.height - 200;
        final maxRate = s.rates.reduce(math.max);
        final scale = maxRate > 0.2 ? 1.0 : 0.25 / math.max(maxRate, 0.01) * 0.9;
        var x = o.dx;
        final joint = [for (var i = 0; i < n; i++) s.priors[i] * s.rates[i]];
        final tot = joint.fold(0.0, (a, b) => a + b);
        for (var i = 0; i < n; i++) {
          final w = W * s.priors[i];
          final col = MX.series[i % MX.series.length];
          c.drawRect(Rect.fromLTWH(x, o.dy, w, H), Paint()..color = col.withValues(alpha: 0.1));
          final dh = H * (s.rates[i] * scale).clamp(0, 1);
          c.drawRect(Rect.fromLTWH(x, o.dy + H - dh, w, dh), Paint()..color = MX.red.withValues(alpha: 0.7));
          c.drawRect(Rect.fromLTWH(x, o.dy, w, H), MPaint.stroke(IX.ink, 1.5));
          IxPaint.label(c, s.names[i], Offset(x + w / 2, o.dy - 24), size: 22, color: col, w: FontWeight.w700);
          IxPaint.label(c, fmt(s.priors[i], 2), Offset(x + w / 2, o.dy + H + 22), size: 18, color: IX.inkSoft, w: FontWeight.w600);
          if (s.people != null) IxPaint.label(c, '${(s.people! * joint[i]).round()} of ${(s.people! * s.priors[i]).round()}', Offset(x + w / 2, o.dy + H / 2), size: 18, color: IX.ink, w: FontWeight.w600, halo: true);
          x += w;
        }
        IxPaint.label(c, 'Column widths: priors P(Eᵢ).  Red: P(A | Eᵢ)${scale != 1 ? ' (heights magnified)' : ''}', Offset(o.dx, o.dy + H + 56), size: 18, color: IX.inkSoft, align: Alignment.centerLeft);
        // Posterior bars.
        final bx = o.dx + W + 80, bw = size.width - bx - 60;
        IxPaint.label(c, 'Posterior P(Eᵢ | A): share of all the red', Offset(bx, o.dy - 24), size: 20, color: IX.ink, w: FontWeight.w700, align: Alignment.centerLeft);
        for (var i = 0; i < n; i++) {
          final y = o.dy + 30 + i * 90.0;
          final v = joint[i] / tot;
          final col = MX.series[i % MX.series.length];
          IxPaint.label(c, s.names[i], Offset(bx, y), size: 21, color: col, w: FontWeight.w700, align: Alignment.centerLeft);
          c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(bx, y + 22, bw, 26), const Radius.circular(13)), Paint()..color = IX.grid);
          c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(bx, y + 22, bw * v, 26), const Radius.circular(13)), Paint()..color = col.withValues(alpha: 0.85));
          IxPaint.label(c, fmt(v, 3), Offset(bx + bw, y), size: 21, color: IX.ink, w: FontWeight.w700, align: Alignment.centerRight);
        }
      case 'tree':
        final t = s.red + s.blue;
        final root = Offset(100, size.height / 2);
        final x1 = size.width * 0.38, x2 = size.width * 0.7;
        final h = size.height - 120;
        void node(Offset at, Color col, String lab) {
          c.drawCircle(at, 20, Paint()..color = col);
          IxPaint.label(c, lab, at, size: 17, color: Colors.white, w: FontWeight.w700);
        }

        MPaint.dot(c, root, IX.ink, r: 9);
        for (final (i, (c1, n1, l1)) in [(MX.red, s.red, 'R'), (IX.accent, s.blue, 'B')].indexed) {
          final y1 = 60 + h * (i == 0 ? 0.25 : 0.75);
          final p1 = n1 / t;
          c.drawLine(root, Offset(x1, y1), MPaint.stroke(c1.withValues(alpha: 0.7), 3));
          IxPaint.label(c, '$n1/$t', Offset((root.dx + x1) / 2, (root.dy + y1) / 2 - 18), size: 20, color: c1, w: FontWeight.w700, halo: true);
          node(Offset(x1, y1), c1, l1);
          for (final (j, (c2, n2, l2)) in [(MX.red, s.red, 'R'), (IX.accent, s.blue, 'B')].indexed) {
            final y2 = y1 + h * (j == 0 ? -0.12 : 0.12);
            final num = s.replace ? n2 : n2 - (i == j ? 1 : 0);
            final den = s.replace ? t : t - 1;
            c.drawLine(Offset(x1, y1), Offset(x2, y2), MPaint.stroke(c2.withValues(alpha: 0.7), 3));
            IxPaint.label(c, '$num/$den', Offset((x1 + x2) / 2, (y1 + y2) / 2 - 16), size: 19, color: c2, w: FontWeight.w700, halo: true);
            node(Offset(x2, y2), c2, l2);
            IxPaint.label(c, '$l1$l2:  ${fmt(p1 * num / den, 3)}', Offset(x2 + 40, y2), size: 21, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
          }
        }
        IxPaint.label(c, '${s.red} red, ${s.blue} blue', Offset(100, 50), size: 22, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
      case 'space':
        final items = [for (var i = 0; i < s.coins; i++) 'coin', for (var i = 0; i < s.dice; i++) 'die'];
        final w = math.min(110.0, (size.width - 200) / math.max(1, items.length) - 16);
        for (final (i, it) in items.indexed) {
          final r = Rect.fromLTWH(100 + i * (w + 16), size.height * 0.3, w, w);
          if (it == 'coin') {
            c.drawCircle(r.center, w / 2, Paint()..color = const Color(0xFFF2D9A6));
            c.drawCircle(r.center, w / 2, MPaint.stroke(IX.amber, 3));
            IxPaint.label(c, 'H/T', r.center, size: w * 0.26, color: IX.amber, w: FontWeight.w700);
          } else {
            face(c, r, 5, Colors.white, IX.ink);
          }
          IxPaint.label(c, it == 'coin' ? '× 2' : '× 6', r.bottomCenter + const Offset(0, 28), size: 20, color: IX.inkSoft, w: FontWeight.w600);
        }
        final n = math.pow(2, s.coins) * math.pow(6, s.dice);
        IxPaint.label(c, 'n(S) = ${[for (final it in items) it == 'coin' ? '2' : '6'].join(' × ')} = ${fmt(n.toDouble(), 0)}', Offset(100, size.height * 0.72), size: 30, color: IX.ink, w: FontWeight.w700, align: Alignment.centerLeft);
      default:
        final g = math.min((size.height - 120) / 6, (size.width * 0.62) / 6);
        final o = Offset(110, 50);
        for (var a = 1; a <= 6; a++) {
          IxPaint.label(c, '$a', Offset(o.dx + g * (a - 0.5), o.dy + g * 6 + 20), size: 19, color: IX.inkSoft, w: FontWeight.w600);
          IxPaint.label(c, '$a', Offset(o.dx - 22, o.dy + g * (6 - a + 0.5)), size: 19, color: IX.inkSoft, w: FontWeight.w600);
          for (var b = 1; b <= 6; b++) {
            final r = Rect.fromLTWH(o.dx + g * (a - 1), o.dy + g * (6 - b), g, g).deflate(4);
            final inA = s.dA(a, b), inB = s.dB(a, b);
            final dim = s.given && !inB;
            final col = inA && inB ? MX.violet : inA ? IX.accent : inB ? IX.green : IX.page;
            c.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(8)), Paint()..color = dim ? const Color(0xFFF5F6FA) : (inA || inB ? col.withValues(alpha: 0.85) : IX.page));
            IxPaint.label(c, '$a,$b', r.center, size: g * 0.24, color: dim ? IX.rule : (inA || inB ? Colors.white : IX.inkSoft), w: FontWeight.w600);
          }
        }
        IxPaint.label(c, 'first die →', Offset(o.dx + g * 3, o.dy + g * 6 + 50), size: 17, color: IX.inkSoft);
        final lx = o.dx + g * 6 + 50;
        for (final (i, (col, t)) in [(IX.accent, 'A only: sum is ${s.s}'), (IX.green, 'B only: ${s.bText}'), (MX.violet, 'both A and B')].indexed) {
          c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(lx, o.dy + 20 + i * 50.0, 26, 26), const Radius.circular(6)), Paint()..color = col);
          IxPaint.label(c, t, Offset(lx + 40, o.dy + 33 + i * 50.0), size: 20, color: IX.ink, align: Alignment.centerLeft);
        }
        if (s.given) IxPaint.label(c, 'Given B: only the ${[for (var a = 1; a <= 6; a++) for (var b = 1; b <= 6; b++) if (s.dB(a, b)) 1].length} outcomes in B remain', Offset(lx, o.dy + 200), size: 20, color: IX.positive, w: FontWeight.w600, align: Alignment.centerLeft);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
