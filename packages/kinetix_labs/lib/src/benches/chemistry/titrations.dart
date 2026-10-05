import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../core/i18n.dart';
import '../../engines/chemistry.dart';
import 'glassware.dart';

double _r(double v, int k) => (v * k).round() / k;

/// One titration: what is in the flask (10 mL by pipette), what is in the
/// burette, and how many moles of titrant react with one of the analyte.
class TitrationPair {
  final String flask, burette;

  /// Concentration (mol/L) of the solution of known strength.
  final double known;

  /// Whether the burette solution is the one being found.
  final bool unknownInBurette;

  /// Moles of titrant per mole of analyte at equivalence.
  final double ratio;
  final bool redox;
  final Acid Function(double molar)? acid;
  const TitrationPair(this.flask, this.burette, this.known, {required this.unknownInBurette, required this.ratio, this.redox = false, this.acid});
}

/// Titrations: acid–base with an indicator, and KMnO₄ (its own indicator)
/// against oxalic acid or Mohr's salt (setup 'pair'). The unknown samples
/// A, B and C have different concentrations.
class TitrationBench extends LabBench {
  const TitrationBench();

  static const flaskMl = 10.0;
  static const samples = {'A': 0.0982, 'B': 0.1215, 'C': 0.0756};
  static const kmno4 = {'A': 0.0196, 'B': 0.0243, 'C': 0.0151};

  static final pairs = <String, TitrationPair>{
    // NaOH (unknown) in the burette against 0.05 M oxalic acid.
    'oxalic-naoh': TitrationPair('oxalic', 'naoh', 0.05, unknownInBurette: true, ratio: 2, acid: (m) => Acid('oxalic', m, flaskMl, ka: const [5.9e-2, 6.4e-5])),
    // HCl (unknown) in the flask against 0.1 M NaOH.
    'hcl-naoh': TitrationPair('hcl', 'naoh', 0.1, unknownInBurette: false, ratio: 1, acid: (m) => Acid('HCl', m, flaskMl)),
    // KMnO₄ (unknown) against 0.05 M oxalic acid: 2 MnO₄⁻ react with 5 C₂O₄²⁻.
    'kmno4-oxalic': const TitrationPair('oxalic', 'kmno4', 0.05, unknownInBurette: true, ratio: 2 / 5, redox: true),
    // KMnO₄ (unknown) against 0.1 M Mohr's salt: 1 MnO₄⁻ reacts with 5 Fe²⁺.
    'kmno4-mohr': const TitrationPair('mohr', 'kmno4', 0.1, unknownInBurette: true, ratio: 1 / 5, redox: true),
  };

  @override
  String get kind => 'titration';

  @override
  LabParams get defaults => {'pair': 'oxalic-naoh', 'sample': 'A', 'v': 0.0, 'indicator': 'phenolphthalein'};

  @override
  LabParams get preview => {...defaults, 'v': 10.25};

  static TitrationPair pairOf(LabParams p) => pairs[pStr(p, 'pair', 'oxalic-naoh')]!;

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('sample', tr('Sample'), [for (final s in samples.keys) (s, s)]),
        if (!pairOf(p).redox) LabChoice('indicator', tr('Indicator'), [('phenolphthalein', tr('Phenolphthalein')), ('methyl-orange', tr('Methyl orange'))]),
        LabSlider('v', tr('Burette'), 0, 25, divisions: 500, unit: ' mL', decimals: 2),
        LabAction('refill', tr('New titration'), Icons.replay),
      ];

  @override
  LabParams act(String action, LabParams p) {
    if (action == 'refill' || action == 'set:sample' || action == 'set:indicator') return {...p, 'v': 0.0};
    // The burette only runs out: going back up means starting again.
    return p;
  }

  /// Concentrations (mol/L) of the flask and burette solutions.
  static (double flask, double burette) strengths(LabParams p) {
    final pair = pairOf(p), s = pStr(p, 'sample', 'A');
    final unknown = pair.redox ? kmno4[s]! : samples[s]!;
    return pair.unknownInBurette ? (pair.known, unknown) : (unknown, pair.known);
  }

  /// Volume (mL) of titrant that exactly reacts with the flask.
  static double endPoint(LabParams p) {
    final (cf, cb) = strengths(p);
    return pairOf(p).ratio * cf * flaskMl / cb;
  }

  static double phOf(LabParams p) {
    final pair = pairOf(p);
    final (cf, cb) = strengths(p);
    return Chem.ph(pair.acid!(cf), cb, pNum(p, 'v'));
  }

  /// The flask's colour and the name of it.
  static (Color, String) colour(LabParams p) {
    final pair = pairOf(p);
    if (pair.redox) {
      final excess = pNum(p, 'v') - endPoint(p);
      if (excess < 0) return (const Color(0x22FFFFFF), 'colourless');
      final t = (excess / 0.3).clamp(0.0, 1.0);
      return (Color.lerp(const Color(0xFFF8D7EE), const Color(0xFF9C1E7A), t)!, t < 0.4 ? 'light pink' : 'pink');
    }
    return Chem.indicator(pStr(p, 'indicator', 'phenolphthalein'), phOf(p));
  }

  static String colourName(String c) => switch (c) {
        'light pink' => tr('Light pink'),
        'pink' => tr('Pink'),
        'red' => tr('Red'),
        'orange' => tr('Orange'),
        'yellow' => tr('Yellow'),
        _ => tr('Colourless'),
      };

  /// Within one drop (0.05 mL) past the end point: the first permanent change.
  static bool atEndPoint(LabParams p) {
    final over = pNum(p, 'v') - endPoint(p);
    if (pairOf(p).redox || pStr(p, 'indicator', 'phenolphthalein') == 'phenolphthalein') return over >= -0.02 && over <= 0.1;
    // Methyl orange changes before the true end point of a weak acid.
    return colour(p).$2 == 'orange';
  }

  @override
  List<LabColumn> get columns => [LabColumn(tr('Sample')), LabColumn(tr('Initial (mL)'), 2), LabColumn(tr('Final (mL)'), 2), LabColumn(tr('Volume used (mL)'), 2), LabColumn(tr('Molarity found (M)'), 4)];

  @override
  LabReading read(LabParams p) {
    final v = pNum(p, 'v');
    if (v == 0) return LabReading.not(tr('Run the titrant in from the burette first.'));
    if (v - endPoint(p) > 0.1 && atEndPoint(p) == false && colour(p).$2 != 'colourless') {
      return LabReading.not(tr('You have gone past the end point (the colour is too deep). Start a new titration.'));
    }
    if (!atEndPoint(p)) return LabReading.not(tr('Not at the end point yet: add the titrant drop by drop, swirling the flask.'));
    return LabReading.row([pStr(p, 'sample', 'A'), 0.0, _r(v, 100), _r(v, 100), _r(molarityFrom(pStr(p, 'pair', 'oxalic-naoh'), _r(v, 100)), 10000)]);
  }

  @override
  List<String> live(LabParams p) => [
        tr('Burette {v} mL', {'v': pNum(p, 'v').toStringAsFixed(2)}),
        colourName(colour(p).$2),
        if (!pairOf(p).redox) 'pH ${phOf(p).toStringAsFixed(1)}',
      ];

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final out = <String>[];
    for (final s in samples.keys) {
      final mine = [for (final r in rows) if (r[0] == s) r];
      if (mine.isEmpty) continue;
      final vs = [for (final r in mine) (r[3] as num).toDouble()]..sort();
      // Concordant: readings within 0.1 mL of each other.
      final concordant = vs.length >= 2 && vs.last - vs.first <= 0.1;
      final mean = vs.reduce((a, b) => a + b) / vs.length;
      final m = meanSe([for (final r in mine) (r[4] as num).toDouble()]);
      out.add(tr('Sample {s}: mean titre {v} mL{c}, so its molarity is {m} M.', {'s': s, 'v': mean.toStringAsFixed(2), 'c': concordant ? tr(' (concordant)') : '', 'm': m.mean.toStringAsFixed(4)}));
    }
    return out.join(' ');
  }

  /// The unknown's molarity from a titre, for the result shown by setups.
  static double molarityFrom(String pairKey, double titre) {
    final pair = pairs[pairKey]!;
    return pair.unknownInBurette ? pair.ratio * pair.known * flaskMl / titre : pair.known * titre / (pair.ratio * flaskMl);
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final pair = pairOf(p);
    final titrant = pair.burette == 'kmno4' ? const Color(0xCC8E1E7A) : const Color(0x3378B7E0);
    // Stand and burette.
    canvas.drawRect(Rect.fromLTWH(w * 0.2, h * 0.92, w * 0.3, 8), fill(LabInk.wire));
    canvas.drawRect(Rect.fromLTWH(w * 0.22, h * 0.04, 6, h * 0.88), fill(LabInk.wire));
    Glass.burette(canvas, Offset(w * 0.36, h * 0.04), h * 0.55, pNum(p, 'v'), capacity: 25, colour: titrant);
    final (col, name) = colour(p);
    Glass.conicalFlask(canvas, Offset(w * 0.36, h * 0.92), h * 0.24, pair.redox ? Color.alphaBlend(col, const Color(0x11FFFFFF)) : Color.alphaBlend(col, const Color(0x2278B7E0)));
    // A drop falling while titrant is in the flask.
    if (pNum(p, 'v') > 0) canvas.drawCircle(Offset(w * 0.36, h * 0.66 + (t * 120) % (h * 0.08)), 2.5, fill(titrant));
    final cx = w * 0.72;
    label(canvas, '${pNum(p, 'v').toStringAsFixed(2)} mL', Offset(cx, h * 0.2), size: 26, bold: true);
    label(canvas, colourName(name), Offset(cx, h * 0.32), size: 20, bold: true, color: name == 'colourless' ? LabInk.muted : col.withValues(alpha: 1));
    label(canvas, '${_name(pair.flask)} (10 mL)', Offset(cx, h * 0.5), size: 14, color: LabInk.muted);
    label(canvas, tr('in the burette: {b}', {'b': _name(pair.burette)}), Offset(cx, h * 0.58), size: 14, color: LabInk.muted);
    if (atEndPoint(p)) label(canvas, tr('End point'), Offset(cx, h * 0.72), size: 18, bold: true, color: LabInk.green);
  }

  static String _name(String s) => switch (s) {
        'oxalic' => tr('Oxalic acid'),
        'naoh' => tr('Sodium hydroxide'),
        'hcl' => tr('Hydrochloric acid'),
        'mohr' => tr("Mohr's salt"),
        _ => tr('Potassium permanganate'),
      };
}

/// A pH-metric (potentiometric) titration of acetic acid with NaOH: the
/// equivalence point is where pH rises most steeply, and pH = pKa halfway there.
class PhTitrationBench extends LabBench {
  const PhTitrationBench();

  static const acid = Acid('acetic', 0.1, 25, ka: [1.8e-5]);
  static const base = 0.1;

  @override
  String get kind => 'ph-titration';

  @override
  LabParams get defaults => {'v': 0.0};

  @override
  LabParams get preview => {'v': 20.0};

  @override
  List<LabControl> controls(LabParams p) => [LabSlider('v', tr('NaOH added'), 0, 40, divisions: 160, unit: ' mL', decimals: 2)];

  static double ph(LabParams p) => Chem.ph(acid, base, pNum(p, 'v'));

  @override
  List<LabColumn> get columns => [LabColumn('V (mL)', 2), LabColumn('pH', 2)];

  @override
  LabReading read(LabParams p) => LabReading.row([pNum(p, 'v'), _r(ph(p), 100)]);

  @override
  List<String> live(LabParams p) => ['pH = ${ph(p).toStringAsFixed(2)}'];

  @override
  LabGraph graph(LabParams p) => const LabGraph(0, 1, curve: true);

  @override
  String? result(List<List<Object>> rows) {
    final s = [...rows]..sort((a, b) => (a[0] as num).compareTo(b[0] as num));
    if (s.length < 5) return s.isEmpty ? null : tr('Take more readings, closer together near the steep rise.');
    var best = 0.0, at = 0.0;
    for (var k = 1; k < s.length; k++) {
      final dv = (s[k][0] as num) - (s[k - 1][0] as num);
      if (dv <= 0) continue;
      final slope = ((s[k][1] as num) - (s[k - 1][1] as num)) / dv;
      if (slope > best) {
        best = slope.toDouble();
        at = ((s[k][0] as num) + (s[k - 1][0] as num)) / 2;
      }
    }
    // pH at half the equivalence volume, by interpolation.
    final half = at / 2;
    double? phHalf;
    for (var k = 1; k < s.length; k++) {
      final v0 = (s[k - 1][0] as num).toDouble(), v1 = (s[k][0] as num).toDouble();
      if (v0 <= half && v1 >= half && v1 > v0) phHalf = (s[k - 1][1] as num) + ((s[k][1] as num) - (s[k - 1][1] as num)) * (half - v0) / (v1 - v0);
    }
    final conc = at * base / acid.ml;
    return tr('Steepest rise (largest ΔpH/ΔV) at {v} mL: the equivalence point, so the acid is {c} M.{pka}', {
      'v': at.toStringAsFixed(2),
      'c': conc.toStringAsFixed(3),
      'pka': phHalf == null ? '' : ' ${tr('At half that volume pH = pKa = {p} (Ka = {k} × 10⁻⁵).', {'p': phHalf.toStringAsFixed(2), 'k': (math.pow(10, -phHalf) * 1e5).toStringAsFixed(2)})}',
    });
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    Glass.burette(canvas, Offset(w * 0.25, h * 0.04), h * 0.5, pNum(p, 'v'), capacity: 50);
    Glass.beaker(canvas, Offset(w * 0.25, h * 0.92), w * 0.16, h * 0.2, Color.alphaBlend(Chem.universal(ph(p)).withValues(alpha: 0.18), const Color(0x2278B7E0)));
    // Glass electrode dipping in.
    canvas.drawLine(Offset(w * 0.29, h * 0.6), Offset(w * 0.29, h * 0.88), stroke(LabInk.ink, 4));
    canvas.drawLine(Offset(w * 0.29, h * 0.6), Offset(w * 0.5, h * 0.45), stroke(LabInk.ink, 1.5));
    Glass.readout(canvas, Rect.fromLTWH(w * 0.5, h * 0.35, w * 0.22, h * 0.16), ph(p).toStringAsFixed(2), tr('pH meter'));
    // The titration curve.
    final r = Rect.fromLTWH(w * 0.76, h * 0.1, w * 0.21, h * 0.75);
    canvas.drawRect(r, fill(Colors.white));
    canvas.drawRect(r, stroke(LabInk.faint, 1));
    final path = Path();
    for (var k = 0; k <= 80; k++) {
      final v = 40.0 * k / 80;
      final q = Offset(r.left + r.width * v / 40, r.bottom - r.height * Chem.ph(acid, base, v) / 14);
      k == 0 ? path.moveTo(q.dx, q.dy) : path.lineTo(q.dx, q.dy);
    }
    canvas.drawPath(path, stroke(LabInk.blue.withValues(alpha: 0.35), 2));
    canvas.drawCircle(Offset(r.left + r.width * pNum(p, 'v') / 40, r.bottom - r.height * ph(p) / 14), 5, fill(LabInk.accent));
  }
}

/// Conductometric titration of a strong (HCl) or weak (acetic) acid with
/// NaOH: the conductance changes slope at the equivalence point.
class ConductometricBench extends LabBench {
  const ConductometricBench();

  static const acidMolar = 0.01, acidMl = 100.0, base = 0.1;

  @override
  String get kind => 'conductometric';

  @override
  LabParams get defaults => {'acid': 'strong', 'v': 0.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('acid', tr('Acid'), [('strong', tr('Hydrochloric acid')), ('weak', tr('Acetic acid'))]),
        LabSlider('v', tr('NaOH added'), 0, 20, divisions: 80, unit: ' mL', decimals: 2),
      ];

  @override
  LabParams act(String action, LabParams p) => action == 'set:acid' ? {...p, 'v': 0.0} : p;

  static double g(LabParams p) => Chem.conductance(acidMolar, acidMl, base, pNum(p, 'v'), weak: pStr(p, 'acid') == 'weak');

  @override
  List<LabColumn> get columns => [LabColumn(tr('Acid')), LabColumn('V (mL)', 2), LabColumn('G (mS)', 3)];

  @override
  LabReading read(LabParams p) => LabReading.row([pStr(p, 'acid') == 'weak' ? tr('Acetic acid') : tr('Hydrochloric acid'), pNum(p, 'v'), _r(g(p), 1000)]);

  @override
  List<String> live(LabParams p) => ['G = ${g(p).toStringAsFixed(3)} mS'];

  @override
  LabGraph graph(LabParams p) {
    final acid = pStr(p, 'acid') == 'weak' ? tr('Acetic acid') : tr('Hydrochloric acid');
    return LabGraph(1, 2, curve: true, include: (r) => r[0] == acid);
  }

  @override
  String? result(List<List<Object>> rows) {
    final out = <String>[];
    for (final acid in [tr('Hydrochloric acid'), tr('Acetic acid')]) {
      final s = [for (final r in rows) if (r[0] == acid) r]..sort((a, b) => (a[1] as num).compareTo(b[1] as num));
      if (s.length < 6) continue;
      // Fit lines to the first and last thirds and intersect them.
      final n = s.length ~/ 3;
      LinearFit? fit(List<List<Object>> part) => LinearFit.of([for (final r in part) (r[1] as num).toDouble()], [for (final r in part) (r[2] as num).toDouble()]);
      final a = fit(s.sublist(0, math.max(2, n))), b = fit(s.sublist(s.length - math.max(2, n)));
      if (a == null || b == null || (a.slope - b.slope).abs() < 1e-9) continue;
      final veq = (b.intercept - a.intercept) / (a.slope - b.slope);
      out.add(tr('{a}: the two straight parts meet at {v} mL, the equivalence point, so the acid is {c} M.', {'a': acid, 'v': veq.toStringAsFixed(2), 'c': (veq * base / acidMl).toStringAsFixed(4)}));
    }
    return out.isEmpty ? (rows.isEmpty ? null : tr('Take readings before and well after the turning point.')) : out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    Glass.burette(canvas, Offset(w * 0.25, h * 0.04), h * 0.5, pNum(p, 'v'), capacity: 25);
    Glass.beaker(canvas, Offset(w * 0.25, h * 0.92), w * 0.18, h * 0.22, const Color(0x3378B7E0));
    canvas.drawRect(Rect.fromCenter(center: Offset(w * 0.3, h * 0.82), width: 14, height: 30), stroke(LabInk.ink, 2));
    canvas.drawLine(Offset(w * 0.3, h * 0.67), Offset(w * 0.5, h * 0.5), stroke(LabInk.ink, 1.5));
    Glass.readout(canvas, Rect.fromLTWH(w * 0.5, h * 0.38, w * 0.22, h * 0.16), '${g(p).toStringAsFixed(3)} mS', tr('Conductivity meter'));
    final r = Rect.fromLTWH(w * 0.76, h * 0.1, w * 0.21, h * 0.75);
    canvas.drawRect(r, fill(Colors.white));
    canvas.drawRect(r, stroke(LabInk.faint, 1));
    final weak = pStr(p, 'acid') == 'weak';
    final gMax = Chem.conductance(acidMolar, acidMl, base, 20, weak: weak) * 1.1 + 1;
    final path = Path();
    for (var k = 0; k <= 80; k++) {
      final v = 20.0 * k / 80;
      final q = Offset(r.left + r.width * v / 20, r.bottom - r.height * Chem.conductance(acidMolar, acidMl, base, v, weak: weak) / math.max(gMax, Chem.conductance(acidMolar, acidMl, base, 0) * 1.1));
      k == 0 ? path.moveTo(q.dx, q.dy) : path.lineTo(q.dx, q.dy);
    }
    canvas.drawPath(path, stroke(LabInk.blue.withValues(alpha: 0.35), 2));
  }
}
