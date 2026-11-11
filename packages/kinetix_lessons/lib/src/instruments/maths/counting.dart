import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'common.dart';

/// Counting: the multiplication principle as a tree, filling places (ⁿPᵣ), arrangements with
/// alike objects, selections (ⁿCᵣ) and lines and triangles from points.
///
/// Preset: {"mode": "tree"|"slots"|"alike"|"select"|"points", "m": 3, "n": 5, "k": 0, "r": 3,
/// "repeat": false, "p": 2, "q": 2, "word": "ALLAHABAD", "shape": "line"|"triangle"|"diagonal"}.
class CountingInstrument extends StatefulWidget {
  const CountingInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<CountingInstrument> createState() => _CountingState();
}

class _CountingState extends State<CountingInstrument> {
  String mode = 'slots', shape = 'triangle', word = '';
  int m = 3, n = 5, k = 0, r = 3, p = 2, q = 2, pick = 0;
  bool repeat = false;
  int? active;

  static final _presets = <String, Map<String, dynamic>>{
    'Tree of choices': {'mode': 'tree', 'm': 3, 'n': 2},
    'Fill the places': {'mode': 'slots', 'n': 5, 'r': 3},
    'Alike objects': {'mode': 'alike', 'word': 'ALLAHABAD'},
    'Choose r of n': {'mode': 'select', 'n': 6, 'r': 2},
    'Triangles': {'mode': 'points', 'n': 6, 'shape': 'triangle'},
  };

  @override
  void initState() {
    super.initState();
    _apply(widget.preset.isEmpty ? _presets['Fill the places']! : widget.preset);
    if (widget.preset.isEmpty) active = 1;
  }

  void _apply(Map<String, dynamic> m0) {
    mode = ps(m0, 'mode', 'slots');
    m = pint(m0, 'm', 3);
    n = pint(m0, 'n', 5);
    k = pint(m0, 'k', 0);
    r = pint(m0, 'r', 3);
    p = pint(m0, 'p', 2);
    q = pint(m0, 'q', 2);
    repeat = pb(m0, 'repeat', false);
    word = ps(m0, 'word', '');
    shape = ps(m0, 'shape', 'triangle');
    pick = 0;
  }

  Map<String, int> get letterCounts {
    final c = <String, int>{};
    for (final ch in word.split('')) {
      c[ch] = (c[ch] ?? 0) + 1;
    }
    return c;
  }

  String big(double v) => v >= 1e9 ? sci(v) : fmt(v, 0);

  @override
  Widget build(BuildContext context) {
    String title, formula;
    late List<Readout> ro;
    late List<Widget> ctl;
    Widget sl(String l, int v, int lo, int hi, ValueChanged<int> on) => IxSlider(label: l, value: v.toDouble(), min: lo.toDouble(), max: hi.toDouble(), divisions: hi - lo, format: (x) => fmt(x, 0), onChanged: (x) => setState(() { on(x.round()); active = null; pick = 0; }));
    switch (mode) {
      case 'tree':
        final total = m * n * (k > 0 ? k : 1);
        title = 'The multiplication principle';
        formula = k > 0 ? 'm × n × k = $total' : 'm × n = $total';
        ro = [
          Readout('First choice', '$m ways', '', IX.accent),
          Readout('Second choice', '$n ways', '', IX.green),
          if (k > 0) Readout('Third choice', '$k ways', '', MX.violet),
          Readout('Outcomes', '$total', '', IX.positive),
        ];
        ctl = [
          sl('m (shirts)', m, 1, 4, (v) => m = v),
          sl('n (trousers)', n, 1, 4, (v) => n = v),
          sl('k (caps, 0 = none)', k, 0, 3, (v) => k = v),
          IxButton('Next outcome', icon: Icons.arrow_forward_rounded, onTap: () => setState(() => pick = (pick + 1) % total)),
        ];
      case 'alike':
        final useWord = word.isNotEmpty;
        final nn = useWord ? word.length : n;
        final reps = useWord ? (letterCounts.values.where((v) => v > 1).toList()) : [p, q].where((v) => v > 1).toList();
        final den = reps.fold<double>(1, (a, b) => a * factorial(b));
        title = useWord ? 'Arrangements of $word' : 'Arrangements with alike objects';
        formula = useWord ? '$nn! / (${reps.map((v) => '$v!').join(' ')})' : 'n! / (p! q!)';
        ro = [
          Readout('n!', big(factorial(nn)), '', IX.ink),
          Readout(useWord ? 'Product of repeats!' : 'p! × q!', big(den), '', IX.accent),
          Readout('Different arrangements', big(factorial(nn) / den), '', IX.positive),
        ];
        ctl = useWord
            ? [Text('Letters that repeat are drawn in the same colour.', style: IX.text(18, c: IX.inkSoft))]
            : [sl('n tiles', n, 2, 10, (v) => n = math.max(v, p + q)), sl('p red alike', p, 0, n, (v) => p = math.min(v, n - q)), sl('q blue alike', q, 0, n, (v) => q = math.min(v, n - p))];
      case 'select':
        title = 'Selections: ⁿCᵣ';
        formula = 'ⁿCᵣ = ⁿPᵣ / r!';
        ro = [
          Readout('ⁿCᵣ  (selections)', big(nCr(n, r)), '', IX.positive),
          Readout('ⁿPᵣ  (arrangements)', big(nPr(n, r)), '', IX.accent),
          Readout('r!  (orders of one choice)', big(factorial(r)), '', IX.ink),
          Readout('ⁿCₙ₋ᵣ', big(nCr(n, n - r)), '', IX.inkSoft),
        ];
        ctl = [sl('n', n, 1, 10, (v) => n = v), sl('r', r, 0, n, (v) => r = math.min(v, n))];
      case 'points':
        final lines = nCr(n, 2), tris = nCr(n, 3);
        title = 'Lines and triangles from $n points';
        formula = shape == 'line' ? 'ⁿC₂ = ${fmt(lines, 0)}' : shape == 'diagonal' ? 'ⁿC₂ − n = ${fmt(lines - n, 0)}' : 'ⁿC₃ = ${fmt(tris, 0)}';
        ro = [
          Readout('Lines ⁿC₂', fmt(lines, 0), '', IX.accent),
          Readout('Triangles ⁿC₃', fmt(tris, 0), '', IX.positive),
          Readout('Diagonals ⁿC₂ − n', fmt(lines - n, 0), '', IX.green),
          Readout('ⁿP₃ = ⁿC₃ × 3!', fmt(nPr(n, 3), 0), '', IX.inkSoft),
        ];
        ctl = [
          sl('n points', n, 3, 10, (v) => n = v),
          IxSegments<String>(label: 'Count', options: const {'line': 'Lines', 'triangle': 'Triangles', 'diagonal': 'Diagonals'}, value: shape, onChanged: (v) => setState(() => shape = v)),
          IxButton('Pick another', icon: Icons.shuffle_rounded, onTap: () => setState(() => pick++)),
        ];
      default:
        final val = repeat ? math.pow(n, r).toDouble() : nPr(n, r);
        title = 'Fill the places';
        formula = repeat ? 'nʳ = ${big(val)}' : 'ⁿPᵣ = n!/(n − r)! = ${big(val)}';
        ro = [
          Readout(repeat ? 'nʳ (repetition allowed)' : 'ⁿPᵣ', big(val), '', IX.positive),
          Readout('n!', big(factorial(n)), '', IX.ink),
          Readout('(n − r)!', r <= n ? big(factorial(n - r)) : '—', '', IX.inkSoft),
        ];
        ctl = [
          sl('n objects', n, 1, 10, (v) => n = v),
          sl('r places', r, 1, repeat ? 8 : n, (v) => r = v),
          IxToggle(label: 'Repetition allowed', value: repeat, onChanged: (v) => setState(() { repeat = v; if (!v) r = math.min(r, n); })),
        ];
    }
    return InstrumentFrame(
      id: 'maths-counting',
      subtitle: tx(widget.preset['subtitle']) ?? '$kMaths · Permutations and combinations',
      title: tx(widget.preset['title']) ?? title,
      formula: formula,
      state: {'mode': mode, 'm': m, 'n': n, 'k': k, 'r': r, 'p': p, 'q': q, 'repeat': repeat},
      readouts: ro,
      controls: ctl,
      presets: [for (final (i, e) in _presets.entries.indexed) Preset(e.key, () => setState(() { _apply(e.value); active = i; }))],
      activePreset: active,
      stage: CustomPaint(painter: _CountPainter(this), size: Size.infinite),
    );
  }
}

class _CountPainter extends CustomPainter {
  _CountPainter(this.s);
  final _CountingState s;

  void chip(Canvas c, Offset at, String t, Color col, {bool filled = true, double r = 26}) {
    c.drawCircle(at, r, Paint()..color = filled ? col : Colors.white);
    c.drawCircle(at, r, MPaint.stroke(col, 2.5));
    IxPaint.label(c, t, at, size: r * 0.8, color: filled ? Colors.white : col, w: FontWeight.w700);
  }

  @override
  void paint(Canvas c, Size size) {
    switch (s.mode) {
      case 'tree':
        _tree(c, size);
      case 'alike':
        _alike(c, size);
      case 'select':
        _select(c, size);
      case 'points':
        _points(c, size);
      default:
        _slots(c, size);
    }
  }

  void _tree(Canvas c, Size size) {
    final levels = [s.m, s.n, if (s.k > 0) s.k];
    final names = ['S', 'T', 'C'];
    final cols = [IX.accent, IX.green, MX.violet];
    final total = levels.fold(1, (a, b) => a * b);
    final x0 = 90.0, dx = (size.width - 380) / levels.length;
    final top = 50.0, h = size.height - 100;
    final root = Offset(x0, top + h / 2);
    MPaint.dot(c, root, IX.ink, r: 10);
    IxPaint.label(c, 'start', root + const Offset(0, 28), size: 17, color: IX.inkSoft);
    // Leaves are spread evenly; parents sit over the middle of their children.
    final pickIdx = s.pick % total;
    List<int> digits(int idx) {
      final d = <int>[];
      var rem = idx;
      for (var l = levels.length - 1; l >= 0; l--) {
        d.insert(0, rem % levels[l]);
        rem ~/= levels[l];
      }
      return d;
    }

    final chosen = digits(pickIdx);
    void draw(int level, Offset from, double y0, double y1, List<int> path) {
      if (level == levels.length) return;
      final kids = levels[level];
      for (var i = 0; i < kids; i++) {
        final ya = y0 + (y1 - y0) * i / kids, yb = y0 + (y1 - y0) * (i + 1) / kids;
        final at = Offset(x0 + dx * (level + 1), (ya + yb) / 2);
        final p2 = [...path, i];
        final on = List.generate(p2.length, (j) => chosen[j] == p2[j]).every((v) => v);
        c.drawLine(from, at, MPaint.stroke(on ? IX.positive : IX.rule, on ? 4 : 2));
        chip(c, at, '${names[level]}${i + 1}', on ? IX.positive : cols[level], filled: on || level < levels.length - 1, r: math.min(24, (yb - ya) * 0.42));
        if (level == levels.length - 1) {
          final label = [for (var j = 0; j < p2.length; j++) '${names[j]}${p2[j] + 1}'].join(' ');
          IxPaint.label(c, label, at + const Offset(40, 0), size: math.min(19, (yb - ya) * 0.5), color: on ? IX.positive : IX.inkSoft, w: on ? FontWeight.w700 : FontWeight.w500, align: Alignment.centerLeft);
        }
        draw(level + 1, at, ya, yb, p2);
      }
    }

    draw(0, root, top, top + h, []);
    for (var l = 0; l < levels.length; l++) {
      IxPaint.label(c, ['shirts', 'trousers', 'caps'][l], Offset(x0 + dx * (l + 1), 22), size: 18, color: cols[l], w: FontWeight.w600);
    }
  }

  void _slots(Canvas c, Size size) {
    final n = s.n, r = s.r;
    // The objects.
    final objW = math.min(90.0, (size.width - 160) / n);
    for (var i = 0; i < n; i++) {
      chip(c, Offset(80 + objW * (i + 0.5), 90), String.fromCharCode(65 + i), MX.series[i % MX.series.length], r: math.min(30, objW * 0.38));
    }
    IxPaint.label(c, '$n different objects', Offset(80, 150), size: 19, color: IX.inkSoft, align: Alignment.centerLeft);
    // The places.
    final bw = math.min(150.0, (size.width - 160) / r - 24);
    final y = size.height * 0.5;
    var prod = <String>[];
    for (var j = 0; j < r; j++) {
      final x = 80 + j * (bw + 24);
      final choices = s.repeat ? n : n - j;
      final rect = Rect.fromLTWH(x, y - bw * 0.5, bw, bw);
      c.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(16)), Paint()..color = choices > 0 ? IX.accentSoft : const Color(0xFFFDE2E2));
      c.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(16)), MPaint.stroke(choices > 0 ? IX.accent : MX.red, 2.5));
      IxPaint.label(c, '$choices', rect.center, size: bw * 0.4, color: IX.accent, w: FontWeight.w700);
      IxPaint.label(c, 'place ${j + 1}', rect.bottomCenter + const Offset(0, 22), size: 17, color: IX.inkSoft);
      if (j < r - 1) IxPaint.label(c, '×', Offset(x + bw + 12, y), size: 30, color: IX.inkSoft, w: FontWeight.w600);
      prod.add('$choices');
    }
    final val = s.repeat ? math.pow(n, r).toDouble() : nPr(n, r);
    IxPaint.label(c, '${prod.join(' × ')} = ${s.big(val)}', Offset(80, size.height - 110), size: 34, color: IX.ink, w: FontWeight.w700, align: Alignment.centerLeft);
    IxPaint.label(c, s.repeat ? 'Each place can take any of the n objects again.' : 'Each place filled leaves one object fewer for the next.', Offset(80, size.height - 58), size: 20, color: IX.inkSoft, align: Alignment.centerLeft);
  }

  void _alike(Canvas c, Size size) {
    final tiles = <(String, Color)>[];
    if (s.word.isNotEmpty) {
      final counts = s.letterCounts;
      final colorOf = <String, Color>{};
      var ci = 0;
      for (final e in counts.entries) {
        colorOf[e.key] = e.value > 1 ? MX.series[ci++ % MX.series.length] : IX.steel;
      }
      for (final ch in s.word.split('')) {
        tiles.add((ch, colorOf[ch]!));
      }
    } else {
      for (var i = 0; i < s.p; i++) {
        tiles.add(('R', IX.positive));
      }
      for (var i = 0; i < s.q; i++) {
        tiles.add(('B', IX.accent));
      }
      for (var i = 0; i < s.n - s.p - s.q; i++) {
        tiles.add(('${i + 1}', IX.steel));
      }
    }
    final tw = math.min(110.0, (size.width - 160) / tiles.length - 12);
    final y = size.height * 0.36;
    for (final (i, t) in tiles.indexed) {
      final rect = Rect.fromLTWH(80 + i * (tw + 12), y - tw / 2, tw, tw);
      c.drawRRect(RRect.fromRectAndRadius(rect.shift(const Offset(0, 4)), const Radius.circular(14)), Paint()..color = const Color(0x1A13165A));
      c.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(14)), Paint()..color = t.$2);
      IxPaint.label(c, t.$1, rect.center, size: tw * 0.45, color: Colors.white, w: FontWeight.w700);
    }
    final reps = s.word.isNotEmpty ? [for (final e in s.letterCounts.entries) if (e.value > 1) '${e.key} × ${e.value}'] : [if (s.p > 1) '${s.p} red alike', if (s.q > 1) '${s.q} blue alike'];
    IxPaint.label(c, 'Repeated: ${reps.isEmpty ? 'none' : reps.join(',  ')}', Offset(80, y + tw / 2 + 50), size: 22, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
    IxPaint.label(c, 'Swapping two alike tiles gives the same row, so n! counts each row', Offset(80, size.height - 120), size: 21, color: IX.inkSoft, align: Alignment.centerLeft);
    IxPaint.label(c, 'p! q! … times over: divide by them.', Offset(80, size.height - 84), size: 21, color: IX.inkSoft, align: Alignment.centerLeft);
  }

  void _select(Canvas c, Size size) {
    final n = s.n, r = s.r;
    final w = math.min(100.0, (size.width - 160) / n);
    for (var i = 0; i < n; i++) {
      chip(c, Offset(80 + w * (i + 0.5), 90), String.fromCharCode(65 + i), i < r ? IX.positive : IX.steel, filled: i < r, r: math.min(30, w * 0.38));
    }
    IxPaint.label(c, 'One selection of $r: {${[for (var i = 0; i < r; i++) String.fromCharCode(65 + i)].join(', ')}}', Offset(80, 150), size: 20, color: IX.positive, w: FontWeight.w600, align: Alignment.centerLeft);
    // Bars of nCr for every r: the row of Pascal's triangle.
    final pl = Plane(Rect.fromLTRB(110, 210, size.width - 60, size.height - 70), -0.6, n + 0.6, 0, nCr(n, n ~/ 2) * 1.2 + 0.5);
    pl.paintGrid(c, xLabel: 'r', yLabel: 'ⁿCᵣ', xStep: 1, grid: false);
    for (var j = 0; j <= n; j++) {
      final v = nCr(n, j);
      final rect = Rect.fromLTRB(pl.sx(j - 0.32), pl.sy(v), pl.sx(j + 0.32), pl.sy(0));
      c.drawRRect(RRect.fromRectAndCorners(rect, topLeft: const Radius.circular(6), topRight: const Radius.circular(6)), Paint()..color = (j == r || j == n - r ? IX.positive : IX.accent).withValues(alpha: j == r ? 0.95 : j == n - r ? 0.5 : 0.35));
      IxPaint.label(c, fmt(v, 0), Offset(rect.center.dx, rect.top - 8), size: 18, color: IX.ink, w: FontWeight.w600, align: Alignment.bottomCenter);
    }
    if (r != n - r) IxPaint.label(c, 'ⁿCᵣ = ⁿCₙ₋ᵣ: choosing r to take is choosing n − r to leave', Offset(pl.rect.right, pl.rect.top - 10), size: 18, color: IX.inkSoft, align: Alignment.bottomRight);
  }

  void _points(Canvas c, Size size) {
    final n = s.n;
    final o = Offset(size.width * 0.4, size.height * 0.5);
    final rr = math.min(size.height * 0.38, size.width * 0.3);
    final pts = [for (var i = 0; i < n; i++) o + Offset(math.cos(-math.pi / 2 + 2 * math.pi * i / n), math.sin(-math.pi / 2 + 2 * math.pi * i / n)) * rr];
    c.drawCircle(o, rr, MPaint.stroke(IX.rule, 1.6));
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        final isSide = j == i + 1 || (i == 0 && j == n - 1);
        if (s.shape == 'diagonal' && isSide) continue;
        c.drawLine(pts[i], pts[j], MPaint.stroke(IX.accent.withValues(alpha: s.shape == 'triangle' ? 0.15 : 0.4), 2));
      }
    }
    if (s.shape == 'triangle') {
      final rnd = math.Random(s.pick * 7 + n);
      final idx = (List.generate(n, (i) => i)..shuffle(rnd)).take(3).toList();
      final path = Path()..addPolygon([for (final i in idx) pts[i]], true);
      c.drawPath(path, Paint()..color = IX.positive.withValues(alpha: 0.18));
      c.drawPath(path, MPaint.stroke(IX.positive, 4));
    } else if (n > 1) {
      final rnd = math.Random(s.pick * 7 + n);
      var i = rnd.nextInt(n), j = (i + (s.shape == 'diagonal' && n > 3 ? 2 + rnd.nextInt(n - 3) : 1 + rnd.nextInt(n - 1))) % n;
      c.drawLine(pts[i], pts[j], MPaint.stroke(IX.positive, 5));
    }
    for (final (i, p) in pts.indexed) {
      MPaint.dot(c, p, IX.ink, r: 10);
      IxPaint.label(c, String.fromCharCode(65 + i), o + (p - o) * (1 + 40 / rr), size: 22, color: IX.ink, w: FontWeight.w700);
    }
    final x = size.width * 0.76;
    IxPaint.label(c, 'No three points on a line', Offset(x, size.height * 0.3), size: 19, color: IX.inkSoft);
    IxPaint.label(c, s.shape == 'line' ? 'a line: choose 2' : s.shape == 'diagonal' ? 'a diagonal: a line\nthat is not a side' : 'a triangle: choose 3', Offset(x, size.height * 0.42), size: 24, color: IX.positive, w: FontWeight.w700);
    IxPaint.label(c, 'order does not matter', Offset(x, size.height * 0.54), size: 19, color: IX.inkSoft);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
