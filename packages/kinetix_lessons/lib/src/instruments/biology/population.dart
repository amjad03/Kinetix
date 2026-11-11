import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design.dart';
import 'bio_kit.dart';

/// Organisms and populations (2nd PUC Biology ch. 11; also ch. 3, 13 and microbes in 1st PUC
/// ch. 2 and 2nd PUC ch. 8, 14): a pond population year by year (N + B + I − D − E), exponential
/// and logistic growth, predator and prey, the six population interactions, doubling microbes,
/// the species–area relationship, habitat loss, the rivet popper and a tiger reserve.
///
/// Preset: {"mode": "pond"|"exponential"|"logistic"|"predator"|"interactions"|"doubling"|
/// "speciesarea"|"habitat"|"rivet"|"reserve", "N0": 20, "b": 0.4, "d": 0.1, "I": 0, "E": 0,
/// "year": 3, "r": 0.1, "t": 30, "tmax": 60, "unit": "day", "K": 300, "a": 1, "atk": 0.02,
/// "m": 0.5, "kind": "mutualism", "s": 0.4, "what": "bacteria", "g": 20, "lA": 2, "z": 0.15,
/// "C": 20, "f": 50, "rivets": 0, "area": 800, "h": 18, "births": 40, "deaths": 25, "source": "r"}.
class PopulationInstrument extends StatefulWidget {
  const PopulationInstrument({super.key, this.preset = const {}});
  final Map<String, dynamic> preset;
  @override
  State<PopulationInstrument> createState() => _PopState();
}

class _PopState extends BioState<PopulationInstrument> {
  @override
  String get instrumentId => 'bio-population';
  @override
  Map<String, dynamic> get lessonPreset => widget.preset;
  @override
  List<String> get modes => const ['pond', 'exponential', 'logistic', 'predator', 'interactions', 'doubling', 'speciesarea', 'habitat', 'rivet', 'reserve'];
  @override
  Map<String, Map<String, dynamic>> get presets => const {
    'Lotus pond': {'mode': 'pond'},
    'Exponential (J)': {'mode': 'exponential'},
    'Logistic (S)': {'mode': 'logistic'},
    'Predator and prey': {'mode': 'predator'},
    'Interactions': {'mode': 'interactions'},
    'Doubling bacteria': {'mode': 'doubling'},
    'Species–area': {'mode': 'speciesarea'},
    'Habitat loss': {'mode': 'habitat'},
    'Rivet popper': {'mode': 'rivet'},
    'Tiger reserve': {'mode': 'reserve'},
  };
  @override
  Map<String, Object> defaults(String mode) => switch (mode) {
    'pond' => {'N0': 20, 'b': 0.4, 'd': 0.1, 'I': 0, 'E': 0, 'year': 3},
    'exponential' => {'N0': 10, 'r': 0.1, 't': 30, 'tmax': 60, 'unit': 'day', 'source': 'r', 'births': 40, 'deaths': 25},
    'logistic' => {'N0': 4, 'r': 0.3, 'K': 300, 't': 20, 'tmax': 50, 'unit': 'day'},
    'predator' => {'a': 1.0, 'atk': 0.02, 'm': 0.5, 'pred': true},
    'interactions' => {'kind': 'mutualism', 's': 0.4},
    'doubling' => {'what': 'bacteria', 'N0': 1, 'g': 20, 't': 120},
    'speciesarea' => {'lA': 2, 'z': 0.15, 'C': 20},
    'habitat' => {'f': 50, 'z': 0.25},
    'rivet' => {'rivets': 0},
    _ => {'area': 800, 'h': 18},
  };

  static const _sub = '2nd PUC Biology · Organisms and populations';
  static const _cA = Color(0xFF2F7D5B), _cB = Color(0xFFB4532A);

  @override
  Widget build(BuildContext context) => switch (mode) {
    'exponential' => _exponential(),
    'logistic' => _logistic(),
    'predator' => _predator(),
    'interactions' => _interactions(),
    'doubling' => _doubling(),
    'speciesarea' => _speciesArea(),
    'habitat' => _habitat(),
    'rivet' => _rivet(),
    'reserve' => _reserve(),
    _ => _pond(),
  };

  // ── Pond: N(t+1) = N + B + I − D − E ──────────────────────────────────────────────
  List<double> _pondRun(int years) {
    final out = [n('N0')];
    for (var y = 0; y < years; y++) {
      final nn = out.last;
      out.add(math.max(0, nn + n('b') * nn + n('I') - n('d') * nn - n('E')));
    }
    return out;
  }

  Widget _pond() {
    final yr = i('year');
    final run = _pondRun(10);
    final now = run[yr];
    final births = n('b') * now, deaths = n('d') * now;
    return frame(
      title: 'Population density: a pond of lotus plants',
      subtitle: _sub,
      formula: 'N(t+1) = N + B + I − D − E',
      readouts: [
        Readout('Plants this year (N)', f0(now), 'year $yr', IX.accent),
        Readout('Births B = bN', f0(births), 'per year', IX.green),
        Readout('Deaths D = dN', f0(deaths), 'per year', IX.positive),
        Readout('Next year', f0(run[math.min(yr + 1, 10)]), 'plants', IX.ink),
      ],
      controls: [
        slider('N0', 'Plants at the start', 5, 300, div: 59),
        slider('b', 'Birth rate b (per plant per year)', 0, 1, dp: 2, div: 20),
        slider('d', 'Death rate d (per plant per year)', 0, 1, dp: 2, div: 20),
        slider('I', 'Immigration I (plants per year)', 0, 20),
        slider('E', 'Emigration E (plants per year)', 0, 20),
        slider('year', 'Year', 0, 10),
      ],
      painter: BioPainter((c, size) {
        // The pond, seen from above.
        final pond = Rect.fromLTWH(30, 70, size.width * 0.44, size.height * 0.62);
        Bio.heading(c, 'Year $yr: ${f0(now)} lotus plants', Offset(pond.left, 24));
        final shore = Bio.blob(pond.center, pond.width / 2, pond.height / 2, seed: 3, wobble: 0.06, n: 16);
        c.drawPath(shore.shift(const Offset(0, 6)), Paint()..color = const Color(0xFFCBB89A));
        Bio.soft(c, shore, const Color(0xFF9CC7DA), stroke: 3, edge: const Color(0xFF6F9DB3), light: 0.3);
        c.save();
        c.clipPath(shore);
        final rnd = math.Random(11);
        final shown = math.min(now.round(), 400);
        final rad = shown > 150 ? 11.0 : (shown > 60 ? 15.0 : 20.0);
        for (var k = 0; k < shown; k++) {
          final a = rnd.nextDouble() * 2 * math.pi, rr = math.sqrt(rnd.nextDouble()) * 0.92;
          final at = pond.center + Offset(math.cos(a) * pond.width / 2 * rr, math.sin(a) * pond.height / 2 * rr);
          final pad = Path()
            ..moveTo(at.dx, at.dy)
            ..arcTo(Rect.fromCircle(center: at, radius: rad), a + 0.35, 2 * math.pi - 0.7, false)
            ..close();
          Bio.soft(c, pad, k.isEven ? const Color(0xFF5F9E3A) : const Color(0xFF4E8A33), stroke: 1, shadow: false, light: 0.3);
          if (k % 7 == 0) Bio.soft(c, Path()..addOval(Rect.fromCircle(center: at + Offset(rad * 0.2, -rad * 0.2), radius: rad * 0.42)), BioC.petal, stroke: 1, shadow: false);
        }
        c.restore();
        if (now > 400) Bio.note(c, 'Only 400 of the plants are drawn.', Offset(pond.left, pond.bottom + 14), size: 16, color: IX.muted);
        // Flux bars for this year.
        final fx = Rect.fromLTWH(pond.left, pond.bottom + 50, pond.width, size.height - pond.bottom - 70);
        final items = [('B', births, IX.green, '+'), ('I', n('I'), _cA, '+'), ('D', deaths, IX.positive, '−'), ('E', n('E'), _cB, '−')];
        final mx = math.max(1.0, items.map((e) => e.$2).reduce(math.max));
        for (var k = 0; k < items.length; k++) {
          final (lab, val, col, sign) = items[k];
          final y = fx.top + k * fx.height / 4 + 4;
          IxPaint.label(c, '$sign $lab', Offset(fx.left, y + 12), size: 18, color: col, w: FontWeight.w700, align: Alignment.centerLeft);
          final w = (fx.width - 160) * val / mx;
          c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(fx.left + 56, y, math.max(w, 2), 24), const Radius.circular(6)), Paint()..color = col.withValues(alpha: 0.8));
          IxPaint.label(c, f0(val), Offset(fx.left + 66 + w, y + 12), size: 17, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
        }
        // Growth over ten years.
        final top = run.reduce(math.max);
        final yMax = _nice(math.max(top, 10));
        final plot = Plot(Rect.fromLTRB(size.width * 0.58, 80, size.width - 40, size.height - 100), -0.5, 10.5, 0, yMax);
        plot.frame(c, xs: [0, 2, 4, 6, 8, 10], ys: [0, yMax / 2, yMax], xLabel: 'Year', yLabel: 'Number of plants N', title: 'Year by year');
        plot.bars(c, run, [for (var k = 0; k <= 10; k++) k == yr ? IX.accent : const Color(0xFF9DB7E8)], width: 0.7);
        Bio.note(c, 'b − d = ${f2(n('b') - n('d'))} per plant per year${n('b') > n('d') ? ': the pond fills up.' : (n('b') < n('d') ? ': the population shrinks.' : ': steady.')}', Offset(plot.r.left, plot.r.bottom + 50), size: 17, color: IX.ink, maxWidth: plot.r.width);
      }),
    );
  }

  static double _nice(double v) {
    final p = math.pow(10, (math.log(v) / math.ln10).floor()).toDouble();
    for (final m in [1.0, 2.0, 2.5, 5.0, 10.0]) {
      if (m * p >= v) return m * p;
    }
    return 10 * p;
  }

  // ── Exponential growth ─────────────────────────────────────────────────────────────
  double get _r => str('source') == 'bd' ? (n('births') - n('deaths')) / 1000 : n('r');

  Widget _exponential() {
    final r = _r, n0 = n('N0'), t = n('t'), tm = n('tmax');
    final u = str('unit', 'day');
    final human = str('source') == 'bd' || u == 'year' && n0 >= 10 && str('what') == 'crore';
    final nt = n0 * math.exp(r * t);
    final td = r > 0 ? math.ln2 / r : double.infinity;
    final yMax = _nice(n0 * math.exp(math.max(r, 0.0001) * tm));
    final unitN = human ? 'crore' : '';
    return frame(
      title: human ? 'Exponential growth of a human population' : 'Exponential growth: unlimited resources',
      subtitle: human ? '2nd PUC Biology · Reproductive health' : _sub,
      formula: 'dN/dt = rN  ⇒  N = N₀ eʳᵗ',
      readouts: [
        Readout('r', human ? '${f2(r * 100)}%' : f2(r), 'per $u', IX.accent),
        Readout('Doubling time', td.isFinite ? f1(td) : '—', '${u}s  (0.69 ÷ r)', IX.green),
        Readout('N at t = ${f0(t)}', nt >= 1e5 ? grp(nt) : f1(nt), unitN, IX.amber),
        Readout('Growth now dN/dt', f1(r * nt), '$unitN per $u'),
      ],
      controls: [
        if (str('source') == 'bd') ...[
          slider('births', 'Birth rate (per 1000 per year)', 10, 45),
          slider('deaths', 'Death rate (per 1000 per year)', 5, 30),
        ] else
          slider('r', 'Intrinsic rate r (per $u)', 0.01, human ? 0.04 : 0.7, dp: human ? 3 : 2, div: human ? 39 : 69),
        slider('N0', 'Starting number N₀', human ? 10 : 2, human ? 150 : 1000, div: human ? 140 : 499),
        slider('t', 'Time ($u)', 0, tm),
      ],
      painter: BioPainter((c, size) {
        final plot = Plot(Rect.fromLTRB(120, 90, size.width - 60, size.height - 120), 0, tm, 0, yMax);
        plot.frame(c, xs: [for (var k = 0; k <= 5; k++) tm * k / 5], ys: [0, yMax / 4, yMax / 2, yMax * 3 / 4, yMax], fy: (y) => y >= 1e4 ? grp(y) : (y == y.roundToDouble() ? f0(y) : f1(y)), xLabel: 'Time t ($u)', yLabel: 'Population N${human ? ' (crore)' : ''}', title: 'A J-shaped curve: the bigger N, the faster it grows');
        // Doubling ladder.
        if (td.isFinite) {
          var k = 1;
          for (var tt = td; tt <= tm && k < 12; tt += td, k++) {
            final p = plot.pt(tt, n0 * math.pow(2, k));
            if (p.dy < plot.r.top) break;
            IxPaint.dashed(c, Offset(p.dx, plot.r.bottom), p, Paint()..color = IX.green.withValues(alpha: 0.5)..strokeWidth = 1.6);
            IxPaint.label(c, '×${math.pow(2, k).toInt()}', p + const Offset(-8, -18), size: 15, color: IX.green, w: FontWeight.w700, align: Alignment.centerRight, halo: true);
          }
        }
        plot.curve(c, (x) => n0 * math.exp(r * x), IX.amber, w: 4.5);
        plot.dot(c, t, math.min(nt, yMax * 1.04), IX.amber, label: 'N = ${nt >= 1e5 ? grp(nt) : f1(nt)}', align: Alignment.centerRight);
        Bio.note(c, 'Each doubling takes the same time, ${td.isFinite ? f1(td) : '∞'} ${u}s, whatever the size. Real populations cannot keep this up: food and space run out (see logistic growth).', Offset(plot.r.left + 20, plot.r.top + 16), maxWidth: 520, size: 17, color: IX.ink);
      }),
    );
  }

  // ── Logistic growth ────────────────────────────────────────────────────────────────
  double _logN(double t, double r, double k, double n0) => k / (1 + (k / n0 - 1) * math.exp(-r * t));

  Widget _logistic() {
    final r = n('r'), k = n('K'), n0 = math.min(n('N0'), n('K') - 1), t = n('t'), tm = n('tmax');
    final u = str('unit', 'day');
    final nt = _logN(t, r, k, n0);
    final dn = r * nt * (k - nt) / k;
    final tHalf = math.log(k / n0 - 1) / r;
    final phase = nt < 0.1 * k ? 'Lag' : (nt < 0.5 * k ? 'Acceleration' : (nt < 0.9 * k ? 'Deceleration' : 'Asymptote'));
    final yMax = k * 1.25;
    return frame(
      title: 'Logistic growth: limited resources',
      subtitle: _sub,
      formula: 'dN/dt = rN (K − N) / K',
      readouts: [
        Readout('N now', f0(nt), 'of K = ${f0(k)}', IX.green),
        Readout('Phase', phase, '', IX.accent),
        Readout('Growth dN/dt', f1(dn), 'per $u', IX.amber),
        Readout('Fastest at N = K/2', f1(r * k / 4), 'per $u at t = ${f1(tHalf)}'),
      ],
      controls: [
        slider('r', 'Intrinsic rate r (per $u)', 0.1, 1.5, dp: 2, div: 28),
        slider('K', 'Carrying capacity K', 100, 2000, div: 38),
        slider('N0', 'Starting number N₀', 2, 100, div: 98),
        slider('t', 'Time ($u)', 0, tm),
      ],
      painter: BioPainter((c, size) {
        final plot = Plot(Rect.fromLTRB(120, 90, size.width * 0.66, size.height - 120), 0, tm, 0, yMax);
        // Phase bands.
        double tAt(double frac) => math.log((k / n0 - 1) / (1 / frac - 1)) / r;
        final cuts = [0.0, tAt(0.1).clamp(0, tm), tAt(0.5).clamp(0, tm), tAt(0.9).clamp(0, tm), tm];
        const names = ['Lag', 'Acceleration', 'Deceleration', 'Asymptote'];
        const shades = [Color(0xFFF3F6FB), Color(0xFFE8F3EC), Color(0xFFFFF3E3), Color(0xFFEFF1F8)];
        for (var q = 0; q < 4; q++) {
          final a = plot.pt(cuts[q].toDouble(), yMax), b = plot.pt(cuts[q + 1].toDouble(), 0);
          if (b.dx - a.dx < 2) continue;
          c.drawRect(Rect.fromPoints(a, b), Paint()..color = shades[q]);
          if (b.dx - a.dx > 70) IxPaint.label(c, names[q], Offset((a.dx + b.dx) / 2, a.dy + 18), size: 16, color: IX.inkSoft, w: FontWeight.w600);
        }
        plot.frame(c, xs: [for (var q = 0; q <= 5; q++) tm * q / 5], ys: [0, k / 2, k], fy: (y) => y == k ? 'K' : (y == k / 2 ? 'K/2' : '0'), xLabel: 'Time ($u)', yLabel: 'Population N', title: 'Verhulst–Pearl logistic growth');
        plot.hline(c, k, IX.green, label: 'carrying capacity K = ${f0(k)}');
        plot.curve(c, (x) => n0 * math.exp(r * x), IX.amber, w: 3, dashed: true, label: 'exponential (J)', labelX: math.min(tm * 0.3, math.log(k * 1.1 / n0) / r));
        plot.curve(c, (x) => _logN(x, r, k, n0), IX.green, w: 4.5, label: 'logistic (S)', labelX: tm * 0.62);
        plot.dot(c, t, nt, IX.accent);
        // dN/dt against N.
        final p2 = Plot(Rect.fromLTRB(size.width * 0.74, 120, size.width - 40, size.height * 0.55), 0, k, 0, r * k / 4 * 1.15);
        p2.frame(c, xs: [0, k / 2, k], ys: [0, r * k / 4], fx: (x) => x == 0 ? '0' : (x == k ? 'K' : 'K/2'), fy: (y) => f1(y), xLabel: 'N', title: 'Growth rate dN/dt');
        p2.curve(c, (x) => r * x * (k - x) / k, IX.amber, w: 3.5);
        p2.dot(c, nt, dn, IX.accent);
        Bio.note(c, 'Growth is fastest at N = K/2 and stops at K, where births balance deaths. Resources are limiting, so individuals compete: the fittest survive and reproduce.', Offset(size.width * 0.74 - 10, size.height * 0.55 + 70), maxWidth: size.width * 0.26, size: 17, color: IX.ink);
      }),
    );
  }

  // ── Predator and prey (Lotka–Volterra with prey limited by food) ─────────────────────
  List<Offset> _lv(double tm) {
    final a = n('a'), bAtk = n('atk'), m = n('m');
    const k = 400.0, e = 0.25;
    final pred = b('pred');
    var h = 60.0, p = pred ? 10.0 : 0.0;
    final out = <Offset>[Offset(h, p)];
    const dt = 0.01;
    for (var s = 0; s < tm / dt; s++) {
      final dh = a * h * (1 - h / k) - bAtk * h * p;
      final dp = e * bAtk * h * p - m * p;
      h = math.max(0, h + dh * dt);
      p = math.max(0, p + dp * dt);
      if (s % 10 == 9) out.add(Offset(h, p));
    }
    return out;
  }

  Widget _predator() {
    const tm = 60.0;
    final run = _lv(tm);
    final hMax = run.map((o) => o.dx).reduce(math.max), pMax = run.map((o) => o.dy).reduce(math.max);
    final last = run.last;
    final pred = b('pred');
    return frame(
      title: 'Predator and prey',
      subtitle: _sub,
      formula: 'prey: dH/dt = aH(1 − H/K) − bHP',
      readouts: [
        Readout('Prey peak', f0(hMax), 'hares', _cA),
        Readout('Predator peak', f0(pMax), 'lynx', _cB),
        Readout('Prey settle at', f0(last.dx), '', _cA),
        Readout('Predators settle at', f0(last.dy), '', _cB),
      ],
      controls: [
        toggle('pred', 'Predators', on: 'Present', off: 'Removed'),
        slider('a', 'Prey growth rate a', 0.5, 1.5, dp: 2, div: 20),
        slider('atk', 'Attack rate b', 0.01, 0.04, dp: 3, div: 30),
        slider('m', 'Predator death rate m', 0.2, 0.8, dp: 2, div: 12),
      ],
      painter: BioPainter((c, size) {
        final yMax = _nice(math.max(math.max(hMax, pred ? 5 * pMax : 0), 50) * 1.1);
        final plot = Plot(Rect.fromLTRB(120, 90, size.width * 0.62, size.height - 120), 0, tm, 0, yMax);
        plot.frame(c, xs: [0, 10, 20, 30, 40, 50, 60], ys: [0, yMax / 2, yMax], xLabel: 'Time (years)', yLabel: 'Number', title: 'The predator peak follows the prey peak');
        final ph = Path(), pp = Path();
        for (var q = 0; q < run.length; q++) {
          final x = tm * q / (run.length - 1);
          final a1 = plot.pt(x, run[q].dx), a2 = plot.pt(x, run[q].dy * 5);
          q == 0 ? ph.moveTo(a1.dx, a1.dy) : ph.lineTo(a1.dx, a1.dy);
          q == 0 ? pp.moveTo(a2.dx, a2.dy) : pp.lineTo(a2.dx, a2.dy);
        }
        c.save();
        c.clipRect(plot.r.inflate(4));
        Bio.stroke(c, ph, _cA, 4.5);
        if (pred) Bio.stroke(c, pp, _cB, 4.5);
        c.restore();
        IxPaint.label(c, 'prey (hares)', plot.r.topRight + const Offset(-10, 18), size: 18, color: _cA, w: FontWeight.w700, align: Alignment.centerRight, halo: true);
        if (pred) IxPaint.label(c, 'predators × 5 (lynx)', plot.r.topRight + const Offset(-10, 48), size: 18, color: _cB, w: FontWeight.w700, align: Alignment.centerRight, halo: true);
        // Phase portrait.
        if (pred) {
          final p2 = Plot(Rect.fromLTRB(size.width * 0.72, 120, size.width - 40, size.height * 0.56), 0, yMax, 0, _nice(math.max(pMax, 5) * 1.1));
          p2.frame(c, xs: [0, yMax], ys: [0, p2.y1], xLabel: 'Prey H', yLabel: 'Predators P', title: 'A spiral to balance');
          final sp = Path();
          for (var q = 0; q < run.length; q++) {
            final o = p2.pt(run[q].dx, run[q].dy);
            q == 0 ? sp.moveTo(o.dx, o.dy) : sp.lineTo(o.dx, o.dy);
          }
          Bio.stroke(c, sp, IX.accent, 2.5);
          p2.dot(c, last.dx, last.dy, IX.accent);
        }
        Bio.note(c, pred ? 'Predators keep the prey in check and so help keep a community stable. When prey are many, predators feed well and multiply; then prey fall, and predators starve.' : 'Without predators the prey rise to the limit set by their food (K = 400) — as when prickly pear cactus spread in Australia until a moth that eats it was brought in.', Offset(size.width * 0.72 - 10, size.height * 0.56 + 70), maxWidth: size.width * 0.27, size: 17, color: IX.ink);
      }),
    );
  }

  // ── Interactions ──────────────────────────────────────────────────────────────────
  static const _kinds = {
    'mutualism': ('Mutualism', 1, 1, 'Lichen: fungus and alga. Fig and fig wasp.'),
    'competition': ('Competition', -1, -1, 'Flamingos and fish feeding on zooplankton.'),
    'predation': ('Predation', 1, -1, 'Tiger and deer; a sparrow eating seeds.'),
    'parasitism': ('Parasitism', 1, -1, 'Cuscuta on hedge plants; the liver fluke.'),
    'commensalism': ('Commensalism', 1, 0, 'Orchid on a mango branch; barnacles on a whale.'),
    'amensalism': ('Amensalism', -1, 0, 'Penicillium mould inhibits bacteria.'),
  };

  List<Offset> _pair(int ea, int eb, double s) {
    var na = 10.0, nb = 10.0;
    const ka = 100.0, kb = 100.0;
    final out = <Offset>[Offset(na, nb)];
    const dt = 0.05;
    for (var q = 0; q < 600; q++) {
      final da = 0.5 * na * (1 - na / ka + ea * s * nb / kb);
      final db = 0.5 * nb * (1 - nb / kb + eb * s * na / ka);
      na = math.max(0, na + da * dt);
      nb = math.max(0, nb + db * dt);
      if (q % 6 == 5) out.add(Offset(na, nb));
    }
    return out;
  }

  Widget _interactions() {
    final keys = _kinds.keys.toList();
    final kind = v.containsKey('ki') ? keys[i('ki').clamp(0, keys.length - 1)] : (_kinds.containsKey(str('kind')) ? str('kind') : 'mutualism');
    v['ki'] = keys.indexOf(kind).toDouble();
    final (name, ea, eb, eg) = _kinds[kind]!;
    final s = n('s');
    final run = _pair(ea, eb, s);
    String sign(int e) => e > 0 ? '+' : (e < 0 ? '−' : '0');
    return frame(
      title: 'Population interactions: $name',
      subtitle: _sub,
      formula: 'species A ${sign(ea)} / species B ${sign(eb)}',
      readouts: [
        Readout('Species A settles at', f0(run.last.dx), 'alone: 100', _cA),
        Readout('Species B settles at', f0(run.last.dy), 'alone: 100', _cB),
        Readout('Effect on A / B', '${sign(ea)} / ${sign(eb)}', '', IX.accent),
        Readout('Example', name, ''),
      ],
      controls: [
        stepper('ki', [for (final e in _kinds.values) e.$1], label: 'Interaction'),
        slider('s', 'Strength of the effect', 0, 0.6, dp: 2, div: 12),
      ],
      painter: BioPainter((c, size) {
        // Table of the six interactions.
        final tb = Rect.fromLTWH(30, 70, size.width * 0.42, 430);
        Bio.heading(c, 'Effect of each species on the other', Offset(tb.left, 24));
        final rowH = tb.height / 7;
        IxPaint.label(c, 'Interaction', Offset(tb.left + 14, tb.top + rowH / 2), size: 17, color: IX.inkSoft, w: FontWeight.w600, align: Alignment.centerLeft);
        IxPaint.label(c, 'A', Offset(tb.left + tb.width * 0.62, tb.top + rowH / 2), size: 17, color: _cA, w: FontWeight.w700);
        IxPaint.label(c, 'B', Offset(tb.left + tb.width * 0.82, tb.top + rowH / 2), size: 17, color: _cB, w: FontWeight.w700);
        var q = 1;
        for (final e in _kinds.entries) {
          final y = tb.top + q * rowH;
          final on = e.key == kind;
          final row = Rect.fromLTWH(tb.left, y + 3, tb.width, rowH - 6);
          if (on) Bio.card(c, row, fill: IX.accentSoft, edge: IX.accent.withValues(alpha: 0.5), radius: 10);
          IxPaint.label(c, e.value.$1, Offset(tb.left + 14, y + rowH / 2), size: 19, color: on ? IX.accent : IX.ink, w: on ? FontWeight.w700 : FontWeight.w500, align: Alignment.centerLeft);
          for (final (x, ef) in [(0.62, e.value.$2), (0.82, e.value.$3)]) {
            final col = ef > 0 ? IX.green : (ef < 0 ? IX.positive : IX.muted);
            c.drawCircle(Offset(tb.left + tb.width * x, y + rowH / 2), 17, Paint()..color = col.withValues(alpha: 0.14));
            IxPaint.label(c, sign(ef), Offset(tb.left + tb.width * x, y + rowH / 2), size: 22, color: col, w: FontWeight.w700);
          }
          q++;
        }
        Bio.card(c, Rect.fromLTWH(tb.left, tb.bottom + 24, tb.width, 110));
        Bio.heading(c, 'Example', Offset(tb.left + 20, tb.bottom + 40), size: 18, color: IX.accent);
        Bio.note(c, eg, Offset(tb.left + 20, tb.bottom + 70), size: 19, color: IX.ink, maxWidth: tb.width - 40);
        // Two populations over time.
        final yMax = _nice(math.max(run.map((o) => math.max(o.dx, o.dy)).reduce(math.max), 100) * 1.15);
        final plot = Plot(Rect.fromLTRB(size.width * 0.55, 90, size.width - 40, size.height - 120), 0, 30, 0, yMax);
        plot.frame(c, xs: [0, 10, 20, 30], ys: [0, 50, 100, yMax], xLabel: 'Time', yLabel: 'Population', title: 'Each grows towards its own K = 100');
        plot.hline(c, 100, IX.muted, label: 'alone');
        for (final (sel, col) in [(0, _cA), (1, _cB)]) {
          final p = Path();
          for (var k = 0; k < run.length; k++) {
            final o = plot.pt(30 * k / (run.length - 1), sel == 0 ? run[k].dx : run[k].dy + (ea == eb ? 0.0 : 0));
            k == 0 ? p.moveTo(o.dx, o.dy) : p.lineTo(o.dx, o.dy);
          }
          if (sel == 1 && ea == eb) {
            IxPaint.label(c, 'A and B overlap', plot.pt(22, run.last.dy) + const Offset(0, 22), size: 16, color: IX.inkSoft, halo: true);
          }
          Bio.stroke(c, p, col, sel == 0 ? 5 : 3.5);
        }
        IxPaint.label(c, 'species A', plot.pt(26, run.last.dx) + const Offset(0, -20), size: 17, color: _cA, w: FontWeight.w700, halo: true);
        IxPaint.label(c, 'species B', plot.pt(14, run[(run.length * 0.47).round()].dy) + const Offset(0, 22), size: 17, color: _cB, w: FontWeight.w700, halo: true);
      }),
    );
  }

  // ── Doubling microbes ─────────────────────────────────────────────────────────────
  Widget _doubling() {
    final what = str('what', 'bacteria');
    final g = n('g'), t = n('t'), n0 = n('N0');
    final gens = t / g;
    switch (what) {
      case 'lab':
        // Curd: LAB in milk, log10 cells per mL, g in hours, 8 h overnight.
        final l0 = n('N0') < 4 ? 6.0 : n('N0');
        final lt = l0 + gens * math.log(2) / math.ln10;
        return _dblFrame(
          title: 'Lactic acid bacteria turn milk into curd',
          subtitle: '2nd PUC Biology · Microbes in human welfare',
          formula: 'log N = log N₀ + (t/g) log 2',
          readouts: [
            Readout('Doublings overnight', f1(gens), 'in ${f0(t)} h', IX.accent),
            Readout('Multiplied by', grp(math.pow(2, gens)), '×', IX.green),
            Readout('LAB at the end', '10^${f1(lt)}', 'cells per mL', IX.amber),
            Readout('Acid', lt > 8.5 ? 'Curd sets' : 'Still milk', '', lt > 8.5 ? IX.green : IX.inkSoft),
          ],
          controls: [slider('N0', 'Starting LAB (log₁₀ cells per mL)', 4, 8, dp: 1, div: 8), slider('g', 'Doubling time', 0.5, 4, unit: 'h', dp: 1, div: 7), slider('t', 'Time', 0, 12, unit: 'h')],
          tUnit: 'h', tMax: 12, logFn: (x) => l0 + x / g * math.log(2) / math.ln10, yLabel: 'log₁₀ LAB per mL', yMin: 4, yMaxV: 12, cur: t, curLabel: '10^${f1(lt)} per mL',
          drawLeft: (c, r) => _milk(c, r, ((lt - 6) / 3).clamp(0, 1).toDouble()),
          note: 'LAB make lactic acid, which coagulates and partly digests milk proteins. A pinch of curd is the inoculum. Curd also gains vitamin B₁₂, and LAB in the gut check harmful microbes.',
        );
      case 'scp':
        final m0 = n('N0') < 50 ? 250.0 : n('N0');
        final hrs = t;
        final mb = m0 * math.pow(2, hrs / g);
        return _dblFrame(
          title: 'Single cell protein: microbes versus a calf',
          subtitle: '2nd PUC Biology · Food production',
          formula: 'mass = m₀ × 2^(t/g)',
          readouts: [
            Readout('Microbial biomass', mb >= 1e6 ? '${grp(mb / 1e6)} t' : (mb >= 1000 ? '${f1(mb / 1000)} kg' : '${f0(mb)} g'), 'after ${f0(hrs)} h', IX.green),
            Readout('Calf gains', f1(hrs / 24), 'kg (≈ 1 kg/day)', _cB),
            Readout('Doublings', f1(hrs / g), '', IX.accent),
            Readout('Protein in SCP', '≈ 40–60', '% of dry mass'),
          ],
          controls: [slider('g', 'Doubling time', 1, 6, unit: 'h', dp: 1, div: 10), slider('N0', 'Starting mass', 50, 500, unit: 'g', div: 45), slider('t', 'Time', 0, 72, unit: 'h')],
          tUnit: 'h', tMax: 72, logFn: (x) => math.log(m0 * math.pow(2, x / g)) / math.ln10, yLabel: 'log₁₀ mass (g)', yMin: 0, yMaxV: 10, cur: hrs, curLabel: 'microbes',
          extra: (c, p) {
            p.curve(c, (x) => math.log(250000 + 1000 * x / 24) / math.ln10, _cB, w: 3.5, label: '250 kg calf', labelX: 60);
          },
          drawLeft: (c, r) => _fermenter(c, r, ((math.log(mb) / math.ln10 - 2) / 6).clamp(0, 1).toDouble()),
          note: 'Spirulina or Methylophilus grow on waste such as straw, molasses or sewage. 250 g of Methylophilus could make about 25 tonnes of protein a day.',
        );
      case 'tumour':
        final nn = n('N0') < 1 ? 1.0 : n('N0'), td = g;
        final cells = math.pow(2, nn).toDouble();
        return _dblFrame(
          title: 'How fast does a tumour grow?',
          subtitle: '2nd PUC Biology · Human health and disease',
          formula: 'cells = 2ⁿ;  time = n × doubling time',
          readouts: [
            Readout('Cells', cells >= 1e6 ? '${f1(cells / math.pow(10, (math.log(cells) / math.ln10).floor()))} × 10^${(math.log(cells) / math.ln10).floor()}' : grp(cells), '', IX.positive),
            Readout('Time taken', f1(nn * td / 365), 'years', IX.accent),
            Readout('Detectable', nn >= 30 ? 'Yes (≈ 1 g lump)' : 'Not yet', '', nn >= 30 ? IX.positive : IX.green),
            Readout('Doubling time', f0(td), 'days'),
          ],
          controls: [slider('N0', 'Number of doublings', 1, 40), slider('g', 'Days per doubling', 10, 300, div: 29)],
          tUnit: 'doubling', tMax: 40, logFn: (x) => x * math.log(2) / math.ln10, yLabel: 'log₁₀ number of cells', yMin: 0, yMaxV: 13, cur: nn, curLabel: '2^${f0(nn)}',
          extra: (c, p) => p.hline(c, 9, IX.positive, label: 'about 10⁹ cells ≈ 1 g: detectable'),
          drawLeft: (c, r) => _cluster(c, r, nn),
          note: 'Cancer cells lose contact inhibition and divide without control. A tumour can grow for years before it can be felt: most of its doublings happen unseen. Malignant cells can spread (metastasis).',
        );
      default:
        final nt = n0 * math.pow(2, gens);
        return _dblFrame(
          title: 'Bacteria multiply by binary fission',
          subtitle: '1st PUC Biology · Biological classification',
          formula: 'N = N₀ × 2^(t/g)',
          readouts: [
            Readout('Generations', f1(gens), 't ÷ g', IX.accent),
            Readout('Bacteria now', grp(nt), 'cells', IX.green),
            Readout('After 24 h', '10^${f1(math.log(n0 * math.pow(2, 1440 / g)) / math.ln10)}', 'cells, if food lasted', IX.amber),
            Readout('Generation time', f0(g), 'min'),
          ],
          controls: [slider('N0', 'Starting cells', 1, 10), slider('g', 'Generation time', 20, 60, unit: 'min', div: 8), slider('t', 'Time', 0, 240, unit: 'min', div: 48)],
          tUnit: 'min', tMax: 240, logFn: (x) => math.log(n0 * math.pow(2, x / g)) / math.ln10, yLabel: 'log₁₀ number of cells', yMin: 0, yMaxV: 5, cur: t, curLabel: grp(nt),
          drawLeft: (c, r) => _dish(c, r, nt.round()),
          note: 'Each cell copies its circular DNA and splits in two. A straight line on the log axis means steady doubling. With limited food, growth slows and levels off.',
        );
    }
  }

  Widget _dblFrame({required String title, required String subtitle, required String formula, required List<Readout> readouts, required List<Widget> controls, required String tUnit, required double tMax, required double Function(double) logFn, required String yLabel, required double yMin, required double yMaxV, required double cur, required String curLabel, required void Function(Canvas, Rect) drawLeft, required String note, void Function(Canvas, Plot)? extra}) {
    return frame(
      title: title,
      subtitle: subtitle,
      formula: formula,
      readouts: readouts,
      controls: controls,
      painter: BioPainter((c, size) {
        final left = Rect.fromLTWH(30, 40, size.width * 0.36, size.height * 0.62);
        drawLeft(c, left);
        Bio.note(c, note, Offset(left.left, left.bottom + 30), maxWidth: left.width, size: 18, color: IX.ink);
        final plot = Plot(Rect.fromLTRB(size.width * 0.47, 90, size.width - 50, size.height - 120), 0, tMax, yMin, yMaxV);
        final ys = <double>[for (var y = yMin; y <= yMaxV + 0.01; y += (yMaxV - yMin) > 8 ? 2 : 1) y];
        plot.frame(c, xs: [for (var k = 0; k <= 4; k++) tMax * k / 4], ys: ys, fy: (y) => y.toStringAsFixed(0), xLabel: tUnit == 'doubling' ? 'Number of doublings n' : 'Time ($tUnit)', yLabel: yLabel, title: 'Steady doubling is a straight line on a log scale');
        extra?.call(c, plot);
        plot.curve(c, logFn, IX.green, w: 4.5);
        plot.dot(c, cur, logFn(cur), IX.green, label: curLabel, align: Alignment.centerRight);
      }),
    );
  }

  void _dish(Canvas c, Rect r, int count) {
    final ctr = r.center, rad = math.min(r.width, r.height) / 2 - 10;
    c.drawCircle(ctr + const Offset(0, 8), rad + 8, Paint()..color = const Color(0x2213165A)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10));
    c.drawCircle(ctr, rad + 8, Paint()..color = const Color(0xFFE8F1F8));
    c.drawCircle(ctr, rad + 8, Paint()..color = IX.glassEdge..style = PaintingStyle.stroke..strokeWidth = 3);
    c.drawCircle(ctr, rad, Paint()..color = const Color(0xFFF3E3B5));
    final rnd = math.Random(5);
    final shown = math.min(count, 300);
    final len = shown > 120 ? 14.0 : 22.0;
    for (var k = 0; k < shown; k++) {
      final a = rnd.nextDouble() * 2 * math.pi, rr = math.sqrt(rnd.nextDouble()) * (rad - 20);
      final at = ctr + Offset(math.cos(a) * rr, math.sin(a) * rr);
      final ang = rnd.nextDouble() * math.pi;
      c.save();
      c.translate(at.dx, at.dy);
      c.rotate(ang);
      final body = RRect.fromRectAndRadius(Rect.fromCenter(center: Offset.zero, width: len, height: len * 0.42), Radius.circular(len * 0.21));
      Bio.soft(c, Path()..addRRect(body), const Color(0xFFB0475A), stroke: 1, shadow: false, light: 0.4);
      if (k == 0 && shown < 40) c.drawLine(Offset(0, -len * 0.21), Offset(0, len * 0.21), Paint()..color = Colors.white..strokeWidth = 1.5);
      c.restore();
    }
    IxPaint.label(c, count > 300 ? '${grp(count)} cells (300 drawn)' : '${grp(count)} cells', Offset(ctr.dx, ctr.dy + rad + 30), size: 19, color: IX.ink, w: FontWeight.w600);
  }

  void _milk(Canvas c, Rect r, double set) {
    final bowl = Path()
      ..moveTo(r.left + 30, r.top + r.height * 0.3)
      ..cubicTo(r.left + 40, r.bottom, r.right - 40, r.bottom, r.right - 30, r.top + r.height * 0.3)
      ..close();
    Bio.soft(c, bowl, const Color(0xFFB98A5E), stroke: 2.5, light: 0.3);
    final top = Rect.fromLTRB(r.left + 30, r.top + r.height * 0.3 - 24, r.right - 30, r.top + r.height * 0.3 + 24);
    c.drawOval(top, Paint()..color = Color.lerp(const Color(0xFFFDFCF7), const Color(0xFFF4EDD8), set)!);
    c.drawOval(top, Paint()..color = const Color(0xFF8C6B4A)..style = PaintingStyle.stroke..strokeWidth = 3);
    if (set > 0.5) {
      final rnd = math.Random(2);
      for (var k = 0; k < 18; k++) {
        c.drawCircle(top.center + Offset((rnd.nextDouble() - 0.5) * top.width * 0.8, (rnd.nextDouble() - 0.5) * top.height * 0.6), 4 + rnd.nextDouble() * 6, Paint()..color = const Color(0xFFE9DFC3));
      }
    }
    Bio.heading(c, set > 0.66 ? 'Curd (dahi)' : 'Warm milk + a spoon of curd', Offset(r.center.dx, r.top + 20), align: Alignment.topCenter);
  }

  void _fermenter(Canvas c, Rect r, double fill) {
    final tank = RRect.fromRectAndRadius(Rect.fromLTWH(r.left + r.width * 0.25, r.top + 60, r.width * 0.5, r.height - 90), const Radius.circular(30));
    c.drawRRect(tank, Paint()..color = IX.glass);
    final h = tank.height * 0.8;
    final broth = Rect.fromLTWH(tank.left, tank.bottom - h, tank.width, h);
    c.save();
    c.clipRRect(tank);
    c.drawRect(broth, Paint()..color = Color.lerp(const Color(0xFFD7EAD0), const Color(0xFF2E7D4F), fill)!);
    final rnd = math.Random(3);
    for (var k = 0; k < 40 * fill + 5; k++) {
      c.drawCircle(Offset(broth.left + rnd.nextDouble() * broth.width, broth.top + rnd.nextDouble() * broth.height), 3 + rnd.nextDouble() * 3, Paint()..color = Colors.white.withValues(alpha: 0.5));
    }
    c.restore();
    c.drawRRect(tank, Paint()..color = IX.glassEdge..style = PaintingStyle.stroke..strokeWidth = 3);
    c.drawLine(Offset(tank.center.dx, r.top + 30), Offset(tank.center.dx, tank.bottom - 40), Paint()..color = IX.steel..strokeWidth = 6);
    for (final sd in [-1.0, 1.0]) {
      c.drawLine(Offset(tank.center.dx, tank.bottom - 60), Offset(tank.center.dx + sd * 40, tank.bottom - 70), Paint()..color = IX.steel..strokeWidth = 8..strokeCap = StrokeCap.round);
    }
    Bio.heading(c, 'Spirulina in a fermenter', Offset(r.center.dx, r.top + 10), align: Alignment.topCenter);
  }

  void _cluster(Canvas c, Rect r, double doublings) {
    final ctr = r.center;
    final rad = (20 + (r.width / 2 - 30) * (doublings / 40)).clamp(20, r.width / 2 - 10).toDouble();
    Bio.soft(c, Bio.blob(ctr, r.width / 2, r.height / 2.2, seed: 8, wobble: 0.04), BioC.tissue, stroke: 2, light: 0.3);
    final rnd = math.Random(4);
    for (var k = 0; k < 140; k++) {
      final a = rnd.nextDouble() * 2 * math.pi, rr = math.sqrt(rnd.nextDouble());
      final at = ctr + Offset(math.cos(a) * r.width / 2.3 * rr, math.sin(a) * r.height / 2.5 * rr);
      if ((at - ctr).distance < rad) continue;
      Bio.soft(c, Bio.blob(at, 13, 11, seed: k, wobble: 0.12), const Color(0xFFF5D2C4), stroke: 1, shadow: false);
      c.drawCircle(at, 4, Paint()..color = BioC.nucleus.withValues(alpha: 0.6));
    }
    Bio.soft(c, Bio.blob(ctr, rad, rad * 0.9, seed: 3, wobble: 0.15, n: 14), const Color(0xFFB0475A), stroke: 2);
    Bio.leader(c, ctr + Offset(rad * 0.5, -rad * 0.4), Offset(r.right - 10, r.top + 30), 'tumour', active: true);
  }

  // ── Species–area ──────────────────────────────────────────────────────────────────
  Widget _speciesArea() {
    final la = n('lA'), z = n('z'), cc = n('C');
    final a = math.pow(10, la).toDouble();
    final sp = cc * math.pow(a, z);
    return frame(
      title: 'Species–area relationship',
      subtitle: '2nd PUC Biology · Biodiversity and conservation',
      formula: 'S = C·Aᶻ   ⇔   log S = log C + Z log A',
      readouts: [
        Readout('Area A', grp(a), 'km²', IX.accent),
        Readout('Species S', grp(sp), '', IX.green),
        Readout('Slope Z', f2(z), z > 0.5 ? 'very large areas' : 'small regions', IX.amber),
        Readout('10 × area gives', '× ${f2(math.pow(10, z).toDouble())}', 'species'),
      ],
      controls: [
        slider('lA', 'Area: log₁₀ A (km²)', 0, 6, dp: 1, div: 60),
        slider('z', 'Slope Z', 0.1, 1.2, dp: 2, div: 22),
        slider('C', 'Constant C (species in 1 km²)', 1, 50, div: 49),
      ],
      painter: BioPainter((c, size) {
        final yTop = cc * math.pow(1e6, z);
        final xm = _nice(math.max(a * 2, 10));
        final yTopL = cc * math.pow(xm, z);
        final lin = Plot(Rect.fromLTRB(110, 90, size.width * 0.46, size.height - 130), 0, xm, 0, _nice(yTopL.toDouble()));
        lin.frame(c, xs: [0, xm / 2, xm], ys: [0, lin.y1 / 2, lin.y1], fx: (x) => grp(x), fy: (y) => grp(y), xLabel: 'Area A (km²)', yLabel: 'Species richness S', title: 'Ordinary axes: a curve');
        lin.curve(c, (x) => cc * math.pow(math.max(x, 0), z).toDouble(), IX.green);
        lin.dot(c, a, sp, IX.green);
        final lmax = (math.log(yTop) / math.ln10).ceilToDouble();
        final lg = Plot(Rect.fromLTRB(size.width * 0.58, 90, size.width - 40, size.height - 130), 0, 6, 0, math.max(lmax, 2));
        lg.frame(c, xs: [0, 1, 2, 3, 4, 5, 6], ys: [for (var y = 0.0; y <= lg.y1; y++) y], fx: (x) => '10${_sup(x.toInt())}', fy: (y) => '10${_sup(y.toInt())}', xLabel: 'Area A (km², log scale)', title: 'Log–log axes: a straight line');
        lg.curve(c, (x) => math.log(cc) / math.ln10 + z * x, IX.green);
        // slope triangle
        final p1 = lg.pt(1, math.log(cc) / math.ln10 + z), p2 = lg.pt(3, math.log(cc) / math.ln10 + z);
        final p3 = lg.pt(3, math.log(cc) / math.ln10 + 3 * z);
        IxPaint.dashed(c, p1, p2, Paint()..color = IX.amber..strokeWidth = 2);
        IxPaint.dashed(c, p2, p3, Paint()..color = IX.amber..strokeWidth = 2);
        IxPaint.label(c, 'slope Z = ${f2(z)}', p2 + const Offset(12, -20), size: 17, color: IX.amber, w: FontWeight.w700, align: Alignment.centerLeft, halo: true);
        lg.dot(c, la, math.log(sp) / math.ln10, IX.green, label: 'S = ${grp(sp)}', align: Alignment.centerRight);
        IxPaint.label(c, 'intercept log C', lg.pt(0, math.log(cc) / math.ln10) + const Offset(14, 18), size: 16, color: IX.inkSoft, align: Alignment.centerLeft, halo: true);
        Bio.note(c, 'Alexander von Humboldt, South American jungles. Z ≈ 0.1–0.2 for most regions; for very large areas such as whole continents Z is 0.6–1.2 (fruit-eating birds and mammals of tropical forests: 1.15).', Offset(110, size.height - 50), maxWidth: size.width - 150, size: 17, color: IX.ink);
      }),
    );
  }

  static String _sup(int k) => k.toString().split('').map((d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[int.parse(d)]).join();

  // ── Habitat loss ──────────────────────────────────────────────────────────────────
  Widget _habitat() {
    final f = n('f') / 100, z = n('z');
    final left = math.pow(1 - f, z).toDouble();
    return frame(
      title: 'Habitat loss and species loss',
      subtitle: '2nd PUC Biology · Biodiversity and conservation',
      formula: 'species surviving = (habitat left)ᶻ',
      readouts: [
        Readout('Habitat destroyed', f0(f * 100), '%', IX.positive),
        Readout('Species surviving', f0(left * 100), '%', IX.green),
        Readout('Species lost', f0(100 - left * 100), '%', IX.positive),
        Readout('Slope Z', f2(z), ''),
      ],
      controls: [
        slider('f', 'Habitat destroyed', 0, 95, unit: '%'),
        slider('z', 'Z of the region', 0.15, 0.35, dp: 2, div: 20),
      ],
      painter: BioPainter((c, size) {
        // Forest grid with cleared plots.
        final g = Rect.fromLTWH(30, 70, size.width * 0.44, size.width * 0.44 * 0.75);
        Bio.heading(c, 'A forest, ${f0(f * 100)}% cleared', Offset(g.left, 24));
        const cols = 16, rows = 12;
        final cw = g.width / cols, ch = g.height / rows;
        final order = List.generate(cols * rows, (k) => k)..shuffle(math.Random(7));
        final cleared = order.take((f * cols * rows).round()).toSet();
        final rnd = math.Random(9);
        for (var k = 0; k < cols * rows; k++) {
          final rr = Rect.fromLTWH(g.left + (k % cols) * cw, g.top + (k ~/ cols) * ch, cw, ch);
          if (cleared.contains(k)) {
            c.drawRect(rr, Paint()..color = const Color(0xFFE2CFA6));
            if (rnd.nextDouble() < 0.3) c.drawCircle(rr.center, 3, Paint()..color = const Color(0xFF9A7653));
          } else {
            c.drawRect(rr, Paint()..color = const Color(0xFFDCEBD0));
            Bio.soft(c, Path()..addOval(Rect.fromCircle(center: rr.center + Offset(rnd.nextDouble() * 4 - 2, rnd.nextDouble() * 4 - 2), radius: cw * 0.42)), k.isEven ? const Color(0xFF4E8A33) : const Color(0xFF5F9E3A), stroke: 1, shadow: false);
          }
        }
        c.drawRect(g, Paint()..color = IX.rule..style = PaintingStyle.stroke..strokeWidth = 2);
        Bio.note(c, 'Habitat loss and fragmentation is the most important cause of extinction — first of the "Evil Quartet", with over-exploitation, alien species invasions and co-extinctions. Tropical rain forests once covered 14% of the land; now under 6%. The Amazon is cleared for soya beans and cattle.', Offset(g.left, g.bottom + 24), maxWidth: g.width, size: 17, color: IX.ink);
        final plot = Plot(Rect.fromLTRB(size.width * 0.58, 90, size.width - 40, size.height - 120), 0, 100, 0, 100);
        plot.frame(c, xs: [0, 25, 50, 75, 100], ys: [0, 25, 50, 75, 100], xLabel: 'Habitat destroyed (%)', yLabel: 'Species surviving (%)', title: 'Most species survive at first, then losses race');
        plot.curve(c, (x) => 100 * math.pow(math.max(1 - x / 100, 0), z).toDouble(), IX.green);
        plot.curve(c, (x) => 100 - x, IX.muted, w: 2, dashed: true, label: 'habitat left', labelX: 30);
        plot.dot(c, f * 100, left * 100, IX.positive, label: '${f0(left * 100)}% survive', align: Alignment.centerRight);
      }),
    );
  }

  // ── Rivet popper ──────────────────────────────────────────────────────────────────
  Widget _rivet() {
    final r = i('rivets');
    const total = 50;
    // Illustrative risk: a few rivets do little; key losses compound.
    final risk = 100 * math.pow(r / 44, 2.6).clamp(0, 1).toDouble();
    return frame(
      title: 'The rivet popper hypothesis',
      subtitle: '2nd PUC Biology · Biodiversity and conservation',
      formula: 'species = rivets; ecosystem = aeroplane',
      readouts: [
        Readout('Rivets removed', '$r', 'species lost', IX.positive),
        Readout('Rivets left', '${total - r}', 'of $total', IX.green),
        Readout('Risk of failure', f0(risk), '% (illustrative)', IX.positive),
        Readout('Proposed by', 'Paul Ehrlich', 'Stanford ecologist'),
      ],
      controls: [slider('rivets', 'Rivets removed', 0, 40)],
      painter: BioPainter((c, size) {
        final ctr = Offset(size.width * 0.5, size.height * 0.36);
        final w = size.width * 0.8;
        // Fuselage and wing, side-top view.
        final body = RRect.fromRectAndRadius(Rect.fromCenter(center: ctr, width: w, height: 90), const Radius.circular(45));
        final wing = Path()
          ..moveTo(ctr.dx - 80, ctr.dy)
          ..lineTo(ctr.dx + 60, ctr.dy)
          ..lineTo(ctr.dx - 60, ctr.dy + 230)
          ..lineTo(ctr.dx - 170, ctr.dy + 230)
          ..close();
        final wing2 = Path()
          ..moveTo(ctr.dx - 80, ctr.dy)
          ..lineTo(ctr.dx + 60, ctr.dy)
          ..lineTo(ctr.dx - 60, ctr.dy - 230)
          ..lineTo(ctr.dx - 170, ctr.dy - 230)
          ..close();
        final tail = Path()
          ..moveTo(ctr.dx + w / 2 - 110, ctr.dy)
          ..lineTo(ctr.dx + w / 2 - 20, ctr.dy)
          ..lineTo(ctr.dx + w / 2 - 50, ctr.dy - 110)
          ..lineTo(ctr.dx + w / 2 - 100, ctr.dy - 110)
          ..close();
        const metal = Color(0xFFC9D2DE);
        Bio.soft(c, wing2, metal, stroke: 2);
        Bio.soft(c, tail, metal, stroke: 2);
        Bio.soft(c, Path()..addRRect(body), const Color(0xFFDCE3EC), stroke: 2.5);
        Bio.soft(c, wing, metal, stroke: 2);
        for (var k = 0; k < 9; k++) {
          c.drawCircle(Offset(ctr.dx - w / 2 + 120 + k * 50.0, ctr.dy - 14), 9, Paint()..color = const Color(0xFF6E8FC7));
        }
        // Rivets: 30 on the fuselage seam, 20 on the wing (the key ones).
        final pts = <Offset>[
          for (var k = 0; k < 30; k++) Offset(ctr.dx - w / 2 + 60 + k * (w - 120) / 29, ctr.dy + 26),
          for (var k = 0; k < 10; k++) Offset.lerp(Offset(ctr.dx - 50, ctr.dy + 20), Offset(ctr.dx - 120, ctr.dy + 215), k / 9)!,
          for (var k = 0; k < 10; k++) Offset.lerp(Offset(ctr.dx - 50, ctr.dy - 20), Offset(ctr.dx - 120, ctr.dy - 215), k / 9)!,
        ];
        final order = List.generate(total, (k) => k)..shuffle(math.Random(3));
        final gone = order.take(r).toSet();
        for (var k = 0; k < total; k++) {
          final p = pts[k];
          if (gone.contains(k)) {
            c.drawCircle(p, 6, Paint()..color = const Color(0xFF3B4254));
            c.drawCircle(p, 6, Paint()..color = IX.positive..style = PaintingStyle.stroke..strokeWidth = 2);
          } else {
            c.drawCircle(p, 6, Paint()..color = const Color(0xFF7D8796));
            c.drawCircle(p - const Offset(1.5, 1.5), 2, Paint()..color = Colors.white.withValues(alpha: 0.7));
          }
        }
        Bio.leader(c, pts[45], Offset(ctr.dx + 140, ctr.dy - 200), 'key rivets on the wings: keystone species', active: true);
        // Risk bar.
        final bar = Rect.fromLTWH(60, size.height - 210, size.width - 120, 30);
        c.drawRRect(RRect.fromRectAndRadius(bar, const Radius.circular(15)), Paint()..color = IX.grid);
        c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(bar.left, bar.top, math.max(bar.width * risk / 100, 30), bar.height), const Radius.circular(15)), Paint()..color = Color.lerp(IX.green, IX.positive, risk / 100)!);
        IxPaint.label(c, 'Risk that the plane (ecosystem) fails: ${f0(risk)}%', Offset(bar.left, bar.top - 22), size: 18, color: IX.ink, w: FontWeight.w600, align: Alignment.centerLeft);
        Bio.note(c, 'Popping one rivet (one species) may not affect safety at first, but as more go the plane weakens; losing rivets on the wings (key species that drive major ecosystem functions) is a much more serious threat than losing a few seats or windows.', Offset(60, size.height - 150), maxWidth: size.width - 120, size: 18, color: IX.ink);
      }),
    );
  }

  // ── Tiger reserve ─────────────────────────────────────────────────────────────────
  Widget _reserve() {
    final area = n('area'), h = n('h') / 100;
    const r = 0.25;
    final k = area / 10;
    final eq = math.max(0.0, k * (1 - h / r));
    List<double> run() {
      var nn = 20.0;
      final out = [nn];
      for (var y = 0; y < 50; y++) {
        nn = math.max(0, nn + r * nn * (1 - nn / k) - h * nn);
        out.add(nn);
      }
      return out;
    }
    final traj = run();
    return frame(
      title: 'Saving tigers in situ',
      subtitle: '2nd PUC Biology · Biodiversity and conservation',
      formula: 'dN/dt = rN(1 − N/K) − hN',
      readouts: [
        Readout('Carrying capacity K', f0(k), 'tigers (1 per 10 km²)', IX.green),
        Readout('Tigers after 50 years', f0(traj.last), '', IX.accent),
        Readout('Poaching', f0(h * 100), '% per year', IX.positive),
        Readout('Outcome', h >= r ? 'Dies out' : 'Persists', '', h >= r ? IX.positive : IX.green),
      ],
      controls: [
        slider('area', 'Reserve area', 200, 1500, unit: 'km²', div: 26),
        slider('h', 'Poaching', 0, 30, unit: '%/yr'),
      ],
      painter: BioPainter((c, size) {
        final m = Rect.fromLTWH(30, 70, size.width * 0.4, size.height * 0.62);
        Bio.heading(c, 'Reserve of ${grp(area)} km²', Offset(m.left, 24));
        final side = m.width * math.sqrt(area / 1500);
        final core = Rect.fromCenter(center: m.center, width: side, height: side * m.height / m.width);
        Bio.soft(c, Bio.blob(core.center, core.width / 2 + 30, core.height / 2 + 30, seed: 6, wobble: 0.06, n: 14), const Color(0xFFE8F0D8), stroke: 2, edge: const Color(0xFFB9C99A));
        Bio.soft(c, Bio.blob(core.center, core.width / 2, core.height / 2, seed: 4, wobble: 0.07, n: 14), const Color(0xFFB9D49A), stroke: 2, edge: const Color(0xFF7FA35A));
        IxPaint.label(c, 'buffer zone', Offset(core.center.dx, core.top - 14), size: 16, color: IX.inkSoft, w: FontWeight.w600, halo: true);
        final rnd = math.Random(2);
        final count = traj.last.round().clamp(0, 150);
        for (var q = 0; q < count; q++) {
          final at = core.center + Offset((rnd.nextDouble() - 0.5) * core.width * 0.75, (rnd.nextDouble() - 0.5) * core.height * 0.75);
          Bio.soft(c, Bio.blob(at, 9, 5, seed: q, wobble: 0.1), const Color(0xFFE08A2E), stroke: 1, shadow: false, edge: const Color(0xFF7A3F0E));
          c.drawLine(at + const Offset(-2, -4), at + const Offset(-2, 4), Paint()..color = const Color(0xFF3B2A1A)..strokeWidth = 1.5);
          c.drawLine(at + const Offset(3, -4), at + const Offset(3, 4), Paint()..color = const Color(0xFF3B2A1A)..strokeWidth = 1.5);
        }
        Bio.note(c, 'Project Tiger (1973) protects tigers in their natural habitat: in situ conservation, with core and buffer zones. Zoos, botanical gardens and seed or gamete banks are ex situ conservation.', Offset(m.left, m.bottom + 30), maxWidth: m.width, size: 17, color: IX.ink);
        final yMax = _nice(math.max(k, 20) * 1.15);
        final plot = Plot(Rect.fromLTRB(size.width * 0.55, 90, size.width - 40, size.height - 120), 0, 50, 0, yMax);
        plot.frame(c, xs: [0, 10, 20, 30, 40, 50], ys: [0, yMax / 2, yMax], xLabel: 'Years', yLabel: 'Tigers', title: 'Tigers in the reserve');
        plot.hline(c, k, IX.green, label: 'K = ${f0(k)}');
        if (h > 0 && eq > 0) plot.hline(c, eq, IX.amber, label: 'with poaching: ${f0(eq)}');
        final p = Path();
        for (var y = 0; y <= 50; y++) {
          final o = plot.pt(y.toDouble(), traj[y]);
          y == 0 ? p.moveTo(o.dx, o.dy) : p.lineTo(o.dx, o.dy);
        }
        Bio.stroke(c, p, const Color(0xFFE08A2E), 4.5);
      }),
    );
  }
}
