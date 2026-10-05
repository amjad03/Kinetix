import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// Tossing a coin or throwing a die many times. Results come from a random
/// number generator seeded from the count so far, so the projector, the
/// teacher's tablet and the tests all see the same throws.
class ProbabilityBench extends LabBench {
  const ProbabilityBench();

  @override
  String get kind => 'probability';

  @override
  LabParams get defaults => {'exp': 'coin', 'face': 6, 'counts': [0, 0], 'last': -1, 'seed': 1};

  @override
  LabParams get preview => {...defaults, 'counts': [27, 23], 'last': 0};

  static bool coin(LabParams p) => pStr(p, 'exp', 'coin') != 'die';

  static List<int> counts(LabParams p) {
    final c = [for (final v in (p['counts'] as List? ?? const [])) (v as num).toInt()];
    final want = coin(p) ? 2 : 6;
    return c.length == want ? c : List.filled(want, 0);
  }

  static int trials(LabParams p) => counts(p).fold(0, (a, b) => a + b);

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('exp', tr('Experiment'), [('coin', tr('Toss a coin')), ('die', tr('Throw a die'))]),
        if (!coin(p)) LabChoice('face', tr('Event: the die shows'), [for (var f = 1; f <= 6; f++) (f, '$f')]),
        LabAction('t1', coin(p) ? tr('Toss once') : tr('Throw once'), Icons.casino_outlined, primary: true),
        LabAction('t10', '×10', Icons.fast_forward_outlined),
        LabAction('t100', '×100', Icons.fast_forward_outlined),
        LabAction('t1000', '×1000', Icons.double_arrow_outlined),
        LabAction('reset', tr('Start again'), Icons.restart_alt),
      ];

  @override
  LabParams act(String action, LabParams p) {
    if (action == 'set:exp') return {...p, 'counts': List.filled(coin(p) ? 2 : 6, 0), 'last': -1};
    if (action == 'reset') return {...p, 'counts': List.filled(coin(p) ? 2 : 6, 0), 'last': -1, 'seed': pInt(p, 'seed', 1) + 1};
    final n = switch (action) { 't1' => 1, 't10' => 10, 't100' => 100, 't1000' => 1000, _ => 0 };
    if (n == 0) return p;
    final c = counts(p);
    final rnd = math.Random(pInt(p, 'seed', 1) * 100003 + trials(p));
    var last = -1;
    for (var k = 0; k < n; k++) {
      last = rnd.nextInt(c.length);
      c[last]++;
    }
    return {...p, 'counts': c, 'last': last};
  }

  static String _event(LabParams p) => coin(p) ? tr('Head') : tr('The die shows {n}', {'n': pInt(p, 'face', 6)});

  static int _eventCount(LabParams p) => coin(p) ? counts(p)[0] : counts(p)[(pInt(p, 'face', 6) - 1).clamp(0, 5)];

  @override
  List<LabColumn> get columns => [
        LabColumn(tr('Experiment')),
        LabColumn(tr('Trials'), 0),
        LabColumn(tr('Event')),
        LabColumn(tr('Times it happened'), 0),
        LabColumn(tr('Experimental probability'), 3),
        LabColumn(tr('Theoretical probability')),
      ];

  @override
  LabReading read(LabParams p) {
    final n = trials(p);
    if (n == 0) return LabReading.not(coin(p) ? tr('Toss the coin first.') : tr('Throw the die first.'));
    final k = _eventCount(p);
    return LabReading.row([coin(p) ? tr('Coin') : tr('Die'), n, _event(p), k, (k / n * 1000).round() / 1000, coin(p) ? '1/2' : '1/6']);
  }

  @override
  List<String> live(LabParams p) {
    final n = trials(p);
    return [
      tr('Trials: {n}', {'n': n}),
      if (n > 0) 'P = ${_eventCount(p)} ÷ $n = ${(_eventCount(p) / n).toStringAsFixed(3)}',
      tr('Theoretical {p}', {'p': coin(p) ? '1/2 = 0.5' : '1/6 ≈ 0.167'}),
    ];
  }

  @override
  LabGraph graph(LabParams p) {
    final exp = coin(p) ? tr('Coin') : tr('Die'), ev = _event(p);
    return LabGraph(1, 4, refY: coin(p) ? 0.5 : 1 / 6, include: (r) => r[0] == exp && r[2] == ev);
  }

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final last = rows.last;
    return tr('After {n} trials the experimental probability of "{event}" is {p}; the theoretical probability is {t}. More trials bring them closer.',
        {'n': last[1], 'event': last[2], 'p': (last[4] as num).toStringAsFixed(3), 't': last[5]});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final c = counts(p);
    final n = trials(p);
    final last = pInt(p, 'last', -1);
    final isCoin = coin(p);

    // The last result, large.
    final centre = Offset(w * 0.2, h * 0.42);
    final r = math.min(w, h) * 0.16;
    if (isCoin) {
      canvas.drawCircle(centre, r, fill(const Color(0xFFE2B84A)));
      canvas.drawCircle(centre, r, stroke(const Color(0xFF8C6A1E), 4));
      canvas.drawCircle(centre, r * 0.82, stroke(const Color(0xFFB88F2E), 2));
      label(canvas, last < 0 ? '?' : (last == 0 ? tr('Head') : tr('Tail')), centre, size: r * 0.32, bold: true, color: const Color(0xFF5C4410));
    } else {
      final sq = Rect.fromCenter(center: centre, width: r * 1.7, height: r * 1.7);
      canvas.drawRRect(RRect.fromRectAndRadius(sq, Radius.circular(r * 0.25)), fill(Colors.white));
      canvas.drawRRect(RRect.fromRectAndRadius(sq, Radius.circular(r * 0.25)), stroke(LabInk.ink, 3));
      if (last < 0) {
        label(canvas, '?', centre, size: r * 0.8, bold: true);
      } else {
        const pips = {
          1: [(0.5, 0.5)],
          2: [(0.25, 0.25), (0.75, 0.75)],
          3: [(0.25, 0.25), (0.5, 0.5), (0.75, 0.75)],
          4: [(0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75)],
          5: [(0.25, 0.25), (0.75, 0.25), (0.5, 0.5), (0.25, 0.75), (0.75, 0.75)],
          6: [(0.25, 0.22), (0.75, 0.22), (0.25, 0.5), (0.75, 0.5), (0.25, 0.78), (0.75, 0.78)],
        };
        for (final (x, y) in pips[last + 1]!) {
          canvas.drawCircle(Offset(sq.left + sq.width * x, sq.top + sq.height * y), r * 0.14, fill(last + 1 == 1 ? LabInk.red : LabInk.ink));
        }
      }
    }
    label(canvas, tr('Trials: {n}', {'n': n}), centre + Offset(0, r + 30), size: 18, bold: true);

    // Bar chart of how often each outcome came.
    final chart = Rect.fromLTRB(w * 0.44, h * 0.12, w * 0.95, h * 0.78);
    canvas.drawLine(chart.bottomLeft, chart.bottomRight, stroke(LabInk.ink, 2));
    final maxCount = math.max(1, c.reduce(math.max));
    final expected = n / c.length;
    final top = math.max(maxCount.toDouble(), expected) * 1.15;
    final bw = chart.width / c.length;
    final event = isCoin ? 0 : (pInt(p, 'face', 6) - 1).clamp(0, 5);
    for (var k = 0; k < c.length; k++) {
      final bh = chart.height * c[k] / top;
      final bar = Rect.fromLTWH(chart.left + k * bw + bw * 0.18, chart.bottom - bh, bw * 0.64, bh);
      canvas.drawRect(bar, fill(k == event ? LabInk.accent : const Color(0xFF9FB7D9)));
      canvas.drawRect(bar, stroke(LabInk.ink, 1.2));
      label(canvas, '${c[k]}', bar.topCenter - const Offset(0, 12), size: 13, bold: true);
      if (n > 0) label(canvas, (c[k] / n).toStringAsFixed(2), bar.topCenter - const Offset(0, 28), size: 11, color: LabInk.muted);
      final name = isCoin ? (k == 0 ? tr('Head') : tr('Tail')) : '${k + 1}';
      label(canvas, name, Offset(bar.center.dx, chart.bottom + 16), size: 14, bold: true);
    }
    if (n > 0) {
      final y = chart.bottom - chart.height * expected / top;
      dashed(canvas, Offset(chart.left, y), Offset(chart.right, y), stroke(LabInk.green, 2));
      label(canvas, tr('Expected {x}', {'x': expected.toStringAsFixed(expected < 10 ? 1 : 0)}), Offset(chart.right - 50, y - 12), size: 12, color: LabInk.green, halo: LabInk.paper);
    }
  }
}
