import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../core/i18n.dart';
import '../../engines/chemistry.dart';
import 'glassware.dart';

double _r(double v, int k) => (v * k).round() / k;

void _stopwatch(Canvas canvas, Offset at, double seconds, double r) {
  canvas.drawCircle(at, r, fill(Colors.white));
  canvas.drawCircle(at, r, stroke(LabInk.ink, 2.5));
  final a = -math.pi / 2 + 2 * math.pi * (seconds % 60) / 60;
  canvas.drawLine(at, at + Offset(math.cos(a), math.sin(a)) * r * 0.8, stroke(LabInk.red, 2));
  label(canvas, '${seconds.toStringAsFixed(1)} s', at + Offset(0, r + 14), size: 15, bold: true);
}

/// Rate of reaction of sodium thiosulphate with hydrochloric acid: the time
/// for a cross under the flask to disappear, against concentration and
/// temperature. Rate ∝ [S₂O₃²⁻], doubling about every 10 °C.
class ReactionRateBench extends LabBench {
  const ReactionRateBench();

  /// 1/t (s⁻¹) per mol/L of thiosulphate at 25 °C.
  static const k25 = 0.25;

  @override
  String get kind => 'reaction-rate';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'thio': 50.0, 'temp': 25.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabSlider('thio', tr('Thiosulphate (mL of 0.1 M, made up to 50 mL)'), 10, 50, divisions: 4, unit: ' mL'),
        LabSlider('temp', tr('Temperature'), 20, 50, divisions: 6, unit: ' °C'),
      ];

  static double conc(LabParams p) => 0.1 * pNum(p, 'thio', 50) / 50;

  /// Seconds until the cross disappears.
  static double time(LabParams p) => _r(1 / (Chem.arrhenius(k25, pNum(p, 'temp', 25), ea: 52e3) * conc(p)), 10);

  @override
  List<LabColumn> get columns => [LabColumn('[S₂O₃²⁻] (M)', 3), LabColumn('T (°C)', 0), LabColumn('t (s)', 1), LabColumn('1/t (s⁻¹)', 4)];

  @override
  LabReading read(LabParams p) {
    final t = time(p);
    return LabReading.row([conc(p), pNum(p, 'temp', 25), t, _r(1 / t, 10000)]);
  }

  @override
  List<String> live(LabParams p) => ['t = ${time(p).toStringAsFixed(1)} s'];

  @override
  LabGraph graph(LabParams p) {
    final temp = pNum(p, 'temp', 25);
    return LabGraph(0, 3, throughOrigin: true, include: (r) => r[1] == temp);
  }

  @override
  String? result(List<List<Object>> rows) {
    final out = <String>[];
    final at25 = [for (final r in rows) if (r[1] == rows.first[1]) r];
    if (at25.length >= 3) {
      out.add(tr('At one temperature 1/t is proportional to the thiosulphate concentration: the reaction is first order in thiosulphate.'));
    }
    final full = [for (final r in rows) if ((r[0] as num) == 0.1) r]..sort((a, b) => (a[1] as num).compareTo(b[1] as num));
    if (full.length >= 2) {
      final a = full.first, b = full.last;
      final ratio = (b[3] as num) / (a[3] as num);
      out.add(tr('Raising the temperature from {a} °C to {b} °C made the reaction {r} times faster.', {'a': a[1], 'b': b[1], 'r': ratio.toStringAsFixed(1)}));
    }
    return out.isEmpty ? null : out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final total = time(p);
    final phase = t % (total + 3);
    final cloud = (phase / total).clamp(0.0, 1.0);
    // The cross on paper under the flask, fading as sulphur forms.
    final base = Offset(w * 0.32, h * 0.8);
    canvas.drawRect(Rect.fromCenter(center: base + const Offset(0, 8), width: w * 0.36, height: 16), fill(Colors.white));
    final cross = stroke(LabInk.ink.withValues(alpha: 1 - cloud), 6);
    canvas.drawLine(base + const Offset(-26, -4), base + const Offset(26, 12), cross);
    canvas.drawLine(base + const Offset(26, -4), base + const Offset(-26, 12), cross);
    Glass.conicalFlask(canvas, base, h * 0.42, Color.lerp(const Color(0x2278B7E0), const Color(0xF0F2E9B0), cloud)!, fillFraction: 0.6);
    _stopwatch(canvas, Offset(w * 0.75, h * 0.38), math.min(phase, total), math.min(w, h) * 0.13);
    label(canvas, cloud >= 1 ? tr('The cross has disappeared') : tr('Sulphur is clouding the solution…'), Offset(w * 0.75, h * 0.72), size: 15, color: LabInk.muted);
    label(canvas, '${pNum(p, 'temp', 25).toStringAsFixed(0)} °C', Offset(w * 0.32, h * 0.12), size: 18, bold: true);
  }
}

/// Paper chromatography (setup 'mixture'): leaf pigments, or inks from a
/// questioned document against suspects' pens. Each substance moves a fixed
/// fraction (Rf) of the way the solvent front goes.
class ChromatographyBench extends LabBench {
  const ChromatographyBench();

  /// Mixtures: each spot is (name key, colour, Rf).
  static final mixtures = <String, List<(String, Color, double)>>{
    'leaf': [('carotene', const Color(0xFFFF9800), 0.95), ('xanthophyll', const Color(0xFFFFD54F), 0.71), ('chl-a', const Color(0xFF2E7D32), 0.53), ('chl-b', const Color(0xFF9CCC65), 0.42)],
    'note': [('violet', const Color(0xFF6A1B9A), 0.78), ('blue', const Color(0xFF1565C0), 0.52), ('yellow', const Color(0xFFFBC02D), 0.24)],
    'pen-a': [('violet', const Color(0xFF6A1B9A), 0.78), ('blue', const Color(0xFF1565C0), 0.52), ('yellow', const Color(0xFFFBC02D), 0.24)],
    'pen-b': [('blue', const Color(0xFF1565C0), 0.52), ('pink', const Color(0xFFE91E63), 0.36)],
    'pen-c': [('violet', const Color(0xFF6A1B9A), 0.78), ('cyan', const Color(0xFF00ACC1), 0.62)],
  };

  @override
  String get kind => 'chromatography';

  @override
  bool get animated => false;

  @override
  LabParams get defaults => {'mixture': 'leaf', 'sample': 'note', 'min': 0.0, 'spot': 0};

  @override
  LabParams get preview => {...defaults, 'min': 25.0};

  static bool inks(LabParams p) => pStr(p, 'mixture', 'leaf') == 'inks';
  static String sampleKey(LabParams p) => inks(p) ? pStr(p, 'sample', 'note') : 'leaf';

  static String sampleName(String s) => switch (s) {
        'note' => tr('Ink from the questioned note'),
        'pen-a' => tr('Pen A (suspect 1)'),
        'pen-b' => tr('Pen B (suspect 2)'),
        'pen-c' => tr('Pen C (suspect 3)'),
        _ => tr('Spinach leaf extract'),
      };

  static String spotName(String s) => switch (s) {
        'carotene' => tr('Carotene (orange)'),
        'xanthophyll' => tr('Xanthophyll (yellow)'),
        'chl-a' => tr('Chlorophyll a (blue-green)'),
        'chl-b' => tr('Chlorophyll b (yellow-green)'),
        'violet' => tr('Violet dye'),
        'blue' => tr('Blue dye'),
        'yellow' => tr('Yellow dye'),
        'pink' => tr('Pink dye'),
        _ => tr('Cyan dye'),
      };

  @override
  List<LabControl> controls(LabParams p) {
    final spots = mixtures[sampleKey(p)]!;
    return [
      if (inks(p)) LabChoice('sample', tr('Sample'), [for (final s in ['note', 'pen-a', 'pen-b', 'pen-c']) (s, sampleName(s))]),
      LabSlider('min', tr('Time'), 0, 30, divisions: 60, unit: ' min', decimals: 1),
      LabChoice('spot', tr('Measure spot'), [for (var i = 0; i < spots.length; i++) (i, spotName(spots[i].$1))]),
    ];
  }

  @override
  LabParams act(String action, LabParams p) => action == 'set:sample' ? {...p, 'min': 0.0, 'spot': 0} : p;

  static double front(LabParams p) => Chromatography.front(pNum(p, 'min'));

  @override
  List<LabColumn> get columns => [LabColumn(tr('Sample')), LabColumn(tr('Spot')), LabColumn(tr('Spot distance (cm)'), 1), LabColumn(tr('Solvent front (cm)'), 1), const LabColumn('Rf', 2)];

  @override
  LabReading read(LabParams p) {
    final f = front(p);
    if (f < 6) return LabReading.not(tr('Let the solvent run further before measuring (at least half-way up).'));
    final spots = mixtures[sampleKey(p)]!;
    final i = pInt(p, 'spot').clamp(0, spots.length - 1);
    final (name, _, rf) = spots[i];
    final d = _r(rf * f, 10), ff = _r(f, 10);
    return LabReading.row([sampleName(sampleKey(p)), spotName(name), d, ff, _r(d / ff, 100)]);
  }

  @override
  List<String> live(LabParams p) => [tr('Solvent front {f} cm', {'f': front(p).toStringAsFixed(1)})];

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final bySample = <String, Set<String>>{};
    for (final r in rows) {
      bySample.putIfAbsent(r[0] as String, () => {}).add('${r[1]}@${r[4]}');
    }
    final note = bySample[sampleName('note')];
    if (note == null) {
      return tr('Each pigment has its own Rf: the more soluble in the solvent and the less held by the paper, the higher it travels.');
    }
    final match = [
      for (final pen in ['pen-a', 'pen-b', 'pen-c'])
        if (bySample[sampleName(pen)] case final s? when s.containsAll(note) && note.containsAll(s)) sampleName(pen),
    ];
    return match.isEmpty
        ? tr('No pen measured so far gives the same spots and Rf values as the note.')
        : tr('The ink of the note separates into the same dyes with the same Rf values as {p}: that pen could have written it (supporting, not conclusive, evidence).', {'p': match.join(', ')});
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final strips = inks(p) ? ['note', 'pen-a', 'pen-b', 'pen-c'] : ['leaf'];
    final tankL = w * 0.08, tankR = w * 0.92, base = h * 0.9, line = h * 0.8;
    canvas.drawRect(Rect.fromLTRB(tankL, h * 0.04, tankR, base), stroke(LabInk.ink, 2));
    canvas.drawRect(Rect.fromLTRB(tankL, h * 0.84, tankR, base), fill(const Color(0x3378B7E0)));
    final cmPx = (line - h * 0.08) / 12;
    final f = front(p);
    final sw = (tankR - tankL) / (strips.length * 1.6);
    for (var k = 0; k < strips.length; k++) {
      final cx = tankL + (tankR - tankL) * (k + 0.5) / strips.length;
      final strip = Rect.fromLTRB(cx - sw / 2, h * 0.06, cx + sw / 2, h * 0.88);
      canvas.drawRect(strip, fill(Colors.white));
      canvas.drawRect(strip, stroke(LabInk.faint, 1));
      canvas.drawRect(Rect.fromLTRB(strip.left, line - f * cmPx, strip.right, strip.bottom), fill(const Color(0x1878B7E0)));
      dashed(canvas, Offset(strip.left, line), Offset(strip.right, line), stroke(LabInk.muted, 1));
      final selected = sampleKey(p) == strips[k];
      for (final (_, col, rf) in mixtures[strips[k]]!) {
        final (c, spread) = Chromatography.spot(rf, f);
        final centre = Offset(cx, line - c * cmPx);
        canvas.drawOval(Rect.fromCenter(center: centre, width: sw * 0.55, height: (spread * 2 + 0.2) * cmPx), Paint()
          ..color = col.withValues(alpha: f < 0.3 ? 0.9 : 0.75)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3));
      }
      if (f > 0) canvas.drawLine(Offset(strip.left, line - f * cmPx), Offset(strip.right, line - f * cmPx), stroke(LabInk.blue, 1.5));
      if (strips.length > 1) label(canvas, ['?', 'A', 'B', 'C'][k], Offset(cx, h * 0.96), size: 16, bold: true, color: selected ? LabInk.red : LabInk.ink);
    }
    label(canvas, '${pNum(p, 'min').toStringAsFixed(1)} min', Offset(w * 0.5, h * 0.025 + 8), size: 14, bold: true);
  }
}

/// Enthalpy of neutralisation in a calorimeter: strong acid + strong base
/// gives about −57 kJ/mol; acetic acid a little less.
class NeutralisationBench extends LabBench {
  const NeutralisationBench();

  static const ml = 50.0, molar = 1.0, room = 27.0, calJK = 40.0;

  @override
  String get kind => 'neutralisation';

  @override
  LabParams get defaults => {'acid': 'hcl', 'mixed': false};

  @override
  LabParams get preview => {...defaults, 'mixed': true};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('acid', tr('Acid'), [('hcl', tr('Hydrochloric acid')), ('acetic', tr('Acetic acid'))]),
        LabToggle('mixed', tr('Pour in the NaOH and stir')),
      ];

  @override
  LabParams act(String action, LabParams p) => action == 'set:acid' ? {...p, 'mixed': false} : p;

  static double dh(LabParams p) => pStr(p, 'acid') == 'acetic' ? 55.2e3 : 57.1e3;

  static double rise(LabParams p) => Chem.neutralisationRise(molar * ml / 1000, 2 * ml, dh: dh(p), calJK: calJK);

  @override
  List<LabColumn> get columns => [LabColumn(tr('Acid')), LabColumn(tr('Initial T (°C)'), 1), LabColumn(tr('Highest T (°C)'), 1), LabColumn('ΔT (°C)', 1), LabColumn('ΔH (kJ/mol)', 1)];

  @override
  LabReading read(LabParams p) {
    if (!pBool(p, 'mixed')) return LabReading.not(tr('Mix the acid and the alkali first.'));
    final dt = _r(rise(p), 10);
    final heat = (2 * ml * 4.18 + calJK) * dt;
    return LabReading.row([pStr(p, 'acid') == 'acetic' ? tr('Acetic acid') : tr('Hydrochloric acid'), room, room + dt, dt, _r(-heat / (molar * ml / 1000) / 1000, 10)]);
  }

  @override
  List<String> live(LabParams p) => ['T = ${(room + (pBool(p, 'mixed') ? rise(p) : 0)).toStringAsFixed(1)} °C'];

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    return [
      for (final r in rows) tr('{a}: ΔH = {h} kJ/mol of water formed.', {'a': r[0], 'h': (r[4] as num).toStringAsFixed(1)}),
      if (rows.any((r) => r[0] == tr('Acetic acid')) && rows.any((r) => r[0] == tr('Hydrochloric acid')))
        tr('The weak acid gives slightly less heat: some energy is used to ionise it completely.'),
    ].join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final mixed = pBool(p, 'mixed');
    final cup = Rect.fromLTWH(w * 0.25, h * 0.4, w * 0.24, h * 0.45);
    canvas.drawRRect(RRect.fromRectAndRadius(cup.inflate(8), const Radius.circular(8)), fill(const Color(0xFFF2F2F2)));
    Glass.beaker(canvas, cup.bottomCenter, cup.width, cup.height, const Color(0x3378B7E0), fillFraction: mixed ? 0.75 : 0.4);
    final temp = room + (mixed ? rise(p) : 0);
    final tx = cup.center.dx + 25;
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(tx - 5, h * 0.08, 10, h * 0.72), const Radius.circular(5)), fill(Colors.white));
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(tx - 5, h * 0.08, 10, h * 0.72), const Radius.circular(5)), stroke(LabInk.ink, 1.5));
    final top = h * 0.8 - (temp - 20) / 30 * h * 0.66;
    canvas.drawRect(Rect.fromLTWH(tx - 2.5, top, 5, h * 0.8 - top), fill(LabInk.red));
    label(canvas, '${temp.toStringAsFixed(1)} °C', Offset(w * 0.72, h * 0.4), size: 26, bold: true);
    label(canvas, mixed ? tr('Highest temperature') : tr('Both solutions at room temperature'), Offset(w * 0.72, h * 0.52), size: 14, color: LabInk.muted);
    if (!mixed) Glass.beaker(canvas, Offset(w * 0.72, h * 0.9), w * 0.12, h * 0.18, const Color(0x3378B7E0));
  }
}

/// Kinetics of the acid-catalysed hydrolysis of methyl acetate (first
/// order): titres of the reaction mixture against NaOH rise towards V∞;
/// k = (2.303/t) log((V∞ − V₀)/(V∞ − Vt)).
class EsterHydrolysisBench extends LabBench {
  const EsterHydrolysisBench();

  static const v0 = 21.2, vInf = 41.6, k25 = 0.0049; // mL, mL, per minute

  @override
  String get kind => 'ester-hydrolysis';

  @override
  LabParams get defaults => {'temp': 25.0, 'min': 0.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('temp', tr('Temperature'), [(25.0, '25 °C'), (35.0, '35 °C')]),
        LabSlider('min', tr('Time'), 0, 180, divisions: 36, unit: ' min'),
      ];

  static double k(LabParams p) => Chem.arrhenius(k25, pNum(p, 'temp', 25), ea: 70e3);
  static double titre(LabParams p) => _r(vInf - (vInf - v0) * Chem.firstOrderLeft(k(p), pNum(p, 'min')), 100);

  @override
  List<LabColumn> get columns => [LabColumn('T (°C)', 0), LabColumn('t (min)', 0), LabColumn('Vt (mL)', 2), LabColumn('log(V∞ − Vt)', 4)];

  @override
  LabReading read(LabParams p) {
    final v = titre(p);
    return LabReading.row([pNum(p, 'temp', 25), pNum(p, 'min'), v, _r(math.log(vInf - v) / math.ln10, 10000)]);
  }

  @override
  List<String> live(LabParams p) => ['Vt = ${titre(p).toStringAsFixed(2)} mL', 'V∞ = ${vInf.toStringAsFixed(1)} mL'];

  @override
  LabGraph graph(LabParams p) {
    final temp = pNum(p, 'temp', 25);
    return LabGraph(1, 3, line: true, fromZero: false, include: (r) => r[0] == temp);
  }

  @override
  String? result(List<List<Object>> rows) {
    final out = <String>[];
    for (final temp in {for (final r in rows) (r[0] as num).toDouble()}) {
      final mine = [for (final r in rows) if (r[0] == temp) r];
      if (mine.length < 3) continue;
      final f = LinearFit.of([for (final r in mine) (r[1] as num).toDouble()], [for (final r in mine) (r[3] as num).toDouble()])!;
      final kk = -2.303 * f.slope;
      out.add(tr('{t} °C: log(V∞ − Vt) falls in a straight line, so the reaction is first order; k = −2.303 × slope = {k} per min (half-life {h} min).',
          {'t': temp.toStringAsFixed(0), 'k': '(${pm(kk * 1000, 2.303 * f.slopeSe * 1000)}) × 10⁻³', 'h': (0.693 / kk).toStringAsFixed(0)}));
    }
    return out.isEmpty ? (rows.isEmpty ? null : tr('Take at least three titrations at different times.')) : out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    Glass.beaker(canvas, Offset(w * 0.2, h * 0.85), w * 0.2, h * 0.32, const Color(0x3378B7E0));
    label(canvas, tr('Methyl acetate + HCl'), Offset(w * 0.2, h * 0.92), size: 13, color: LabInk.muted);
    label(canvas, '${pNum(p, 'temp', 25).toStringAsFixed(0)} °C', Offset(w * 0.2, h * 0.42), size: 16, bold: true);
    Glass.burette(canvas, Offset(w * 0.5, h * 0.05), h * 0.55, titre(p), capacity: 50);
    Glass.conicalFlask(canvas, Offset(w * 0.5, h * 0.92), h * 0.2, const Color(0xFFF8D7EE));
    label(canvas, '${pNum(p, 'min').toStringAsFixed(0)} min', Offset(w * 0.78, h * 0.3), size: 24, bold: true);
    label(canvas, 'Vt = ${titre(p).toStringAsFixed(2)} mL', Offset(w * 0.78, h * 0.42), size: 18, bold: true, color: LabInk.blue);
  }
}

/// Beer–Lambert law with a colorimeter: absorbance of KMnO₄ standards is
/// proportional to concentration at λmax; an unknown is read off the line.
class BeerLambertBench extends LabBench {
  const BeerLambertBench();

  static const epsilon = 2400.0, lambdaMax = 525.0, unknown = 2.6e-4;

  @override
  String get kind => 'beer-lambert';

  @override
  LabParams get defaults => {'sample': 2.0, 'nm': 525.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('sample', tr('Solution'), [for (final c in [1.0, 2.0, 3.0, 4.0, 5.0]) (c, '$c × 10⁻⁴ M'), (0.0, tr('Unknown'))]),
        LabSlider('nm', tr('Wavelength'), 400, 700, divisions: 60, unit: ' nm'),
      ];

  static double conc(LabParams p) => pNum(p, 'sample', 2) == 0 ? unknown : pNum(p, 'sample', 2) * 1e-4;

  /// Absorption band: ε falls off around 525 nm.
  static double eps(double nm) => epsilon * math.exp(-math.pow((nm - lambdaMax) / 45, 2));

  static double absorbance(LabParams p) => _r(Chem.absorbance(eps(pNum(p, 'nm', 525)), 1, conc(p)), 1000);

  @override
  List<LabColumn> get columns => [LabColumn(tr('Solution')), LabColumn('λ (nm)', 0), LabColumn('c (10⁻⁴ M)', 1), const LabColumn('A', 3)];

  @override
  LabReading read(LabParams p) {
    final unknownSample = pNum(p, 'sample', 2) == 0;
    return LabReading.row([unknownSample ? tr('Unknown') : tr('Standard'), pNum(p, 'nm', 525), unknownSample ? '?' : pNum(p, 'sample', 2), absorbance(p)]);
  }

  @override
  List<String> live(LabParams p) => ['A = ${absorbance(p).toStringAsFixed(3)}', 'T = ${(Chem.transmittance(absorbance(p)) * 100).toStringAsFixed(1)} %'];

  @override
  LabGraph graph(LabParams p) {
    final nm = pNum(p, 'nm', 525);
    return LabGraph(2, 3, throughOrigin: true, include: (r) => r[1] == nm && r[2] is num);
  }

  @override
  String? result(List<List<Object>> rows) {
    final stds = [for (final r in rows) if (r[2] is num && (r[1] as num) == lambdaMax) r];
    final out = <String>[];
    final scan = [for (final r in rows) if (r[2] is num && (r[2] as num) == 2) r];
    if (scan.length >= 3) {
      final best = scan.reduce((a, b) => (a[3] as num) >= (b[3] as num) ? a : b);
      out.add(tr('The absorbance is largest near {l} nm: work at λmax.', {'l': (best[1] as num).toStringAsFixed(0)}));
    }
    if (stds.length >= 3) {
      final slope = LabGraph.slope([for (final r in stds) Offset((r[2] as num).toDouble(), (r[3] as num).toDouble())])!;
      out.add(tr('A is proportional to c (Beer–Lambert law): slope {s} per 10⁻⁴ M, so ε = {e} L mol⁻¹ cm⁻¹.', {'s': slope.toStringAsFixed(3), 'e': (slope * 1e4).toStringAsFixed(0)}));
      final unk = [for (final r in rows) if (r[2] == '?' && (r[1] as num) == lambdaMax) (r[3] as num).toDouble()];
      if (unk.isNotEmpty) out.add(tr('The unknown has A = {a}, so its concentration is {c} × 10⁻⁴ M.', {'a': unk.last.toStringAsFixed(3), 'c': (unk.last / slope).toStringAsFixed(2)}));
    }
    return out.isEmpty ? null : out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final nm = pNum(p, 'nm', 525);
    // Lamp, monochromator slit, cuvette, detector.
    final y = h * 0.42;
    canvas.drawCircle(Offset(w * 0.08, y), 18, fill(const Color(0xFFFFF59D)));
    final beam = _spectral(nm);
    canvas.drawLine(Offset(w * 0.12, y), Offset(w * 0.35, y), stroke(beam, 6));
    final cuv = Rect.fromCenter(center: Offset(w * 0.42, y), width: 50, height: 90);
    final tint = Color.lerp(const Color(0x10FFFFFF), const Color(0xFF8E1E7A), (conc(p) / 6e-4).clamp(0.0, 1.0))!;
    canvas.drawRect(cuv, fill(tint));
    canvas.drawRect(cuv, stroke(LabInk.ink, 2));
    final tr0 = Chem.transmittance(absorbance(p));
    canvas.drawLine(Offset(cuv.right, y), Offset(w * 0.6, y), stroke(beam.withValues(alpha: tr0.clamp(0.05, 1.0)), 6));
    canvas.drawRect(Rect.fromCenter(center: Offset(w * 0.62, y), width: 16, height: 50), fill(LabInk.wire));
    Glass.readout(canvas, Rect.fromLTWH(w * 0.7, y - h * 0.09, w * 0.26, h * 0.18), 'A = ${absorbance(p).toStringAsFixed(3)}', '${nm.toStringAsFixed(0)} nm');
  }

  static Color _spectral(double nm) => nm < 450
      ? const Color(0xFF6A1B9A)
      : nm < 495
          ? const Color(0xFF1E88E5)
          : nm < 570
              ? const Color(0xFF43A047)
              : nm < 590
                  ? const Color(0xFFFDD835)
                  : nm < 620
                      ? const Color(0xFFFB8C00)
                      : const Color(0xFFE53935);
}

/// Relative viscosity with an Ostwald viscometer: η₁/η₂ = ρ₁t₁ / ρ₂t₂.
class OstwaldBench extends LabBench {
  const OstwaldBench();

  /// Liquid: density (g/mL) and viscosity (mPa s) at 25 °C.
  static const liquids = {'water': (0.997, 0.890), 'ethanol': (0.785, 1.074), 'acetone': (0.784, 0.306), 'glycerol': (1.047, 1.54)};
  static const k = 67.4; // s per (mPa s ÷ g/mL) for this viscometer

  @override
  String get kind => 'ostwald';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'liquid': 'water'};

  static String liquidName(String l) => switch (l) {
        'ethanol' => tr('Ethanol'),
        'acetone' => tr('Acetone'),
        'glycerol' => tr('Glycerol (20% in water)'),
        _ => tr('Water'),
      };

  @override
  List<LabControl> controls(LabParams p) => [LabChoice('liquid', tr('Liquid'), [for (final l in liquids.keys) (l, liquidName(l))])];

  static double flowTime(String l) => _r(k * liquids[l]!.$2 / liquids[l]!.$1, 10);

  @override
  List<LabColumn> get columns => [LabColumn(tr('Liquid')), LabColumn('ρ (g/mL)', 3), LabColumn('t (s)', 1), LabColumn('η (mPa s)', 3)];

  @override
  LabReading read(LabParams p) {
    final l = pStr(p, 'liquid', 'water');
    final (rho, _) = liquids[l]!;
    final (rw, ew) = liquids['water']!;
    final t = flowTime(l);
    return LabReading.row([liquidName(l), rho, t, _r(ew * rho * t / (rw * flowTime('water')), 1000)]);
  }

  @override
  List<String> live(LabParams p) => ['t = ${flowTime(pStr(p, 'liquid', 'water')).toStringAsFixed(1)} s'];

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    return [for (final r in rows) if (r[0] != liquidName('water')) tr('{l}: η = η_water × ρt ÷ (ρ_w t_w) = {e} mPa s.', {'l': r[0], 'e': (r[3] as num).toStringAsFixed(3)})].join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final l = pStr(p, 'liquid', 'water');
    final total = flowTime(l);
    final phase = t % (total + 4);
    final drained = (phase / total).clamp(0.0, 1.0);
    // U-tube with a bulb between two marks.
    final x = w * 0.35;
    final bulb = Rect.fromCenter(center: Offset(x, h * 0.3), width: 46, height: 70);
    canvas.drawOval(bulb, fill(const Color(0x3378B7E0)));
    canvas.save();
    canvas.clipRect(Rect.fromLTRB(0, bulb.top, w, bulb.top + bulb.height * drained));
    canvas.drawOval(bulb, fill(LabInk.paper));
    canvas.restore();
    canvas.drawOval(bulb, stroke(LabInk.ink, 2));
    canvas.drawLine(Offset(x, bulb.bottom), Offset(x, h * 0.8), stroke(LabInk.ink, 3));
    canvas.drawLine(Offset(x - 30, bulb.top - 4), Offset(x + 30, bulb.top - 4), stroke(LabInk.red, 2));
    canvas.drawLine(Offset(x - 30, bulb.bottom + 4), Offset(x + 30, bulb.bottom + 4), stroke(LabInk.red, 2));
    _stopwatch(canvas, Offset(w * 0.72, h * 0.38), math.min(phase, total), math.min(w, h) * 0.13);
    label(canvas, liquidName(l), Offset(w * 0.72, h * 0.72), size: 16, bold: true);
  }
}

/// Flame tests: the colour a metal ion gives to a non-luminous flame.
class FlameTestBench extends LabBench {
  const FlameTestBench();

  static final salts = <String, (Color, String)>{
    'na': (const Color(0xFFFFB300), 'golden yellow'),
    'k': (const Color(0xFFB39DDB), 'lilac'),
    'ca': (const Color(0xFFE64A19), 'brick red'),
    'sr': (const Color(0xFFC62828), 'crimson'),
    'ba': (const Color(0xFF9CCC65), 'apple green'),
    'cu': (const Color(0xFF26A69A), 'blue-green'),
    'li': (const Color(0xFFD81B60), 'crimson red'),
  };

  @override
  String get kind => 'flame-test';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'salt': 'na', 'in': false};

  @override
  LabParams get preview => {...defaults, 'in': true, 'salt': 'cu'};

  static String saltName(String s) => switch (s) {
        'k' => tr('Potassium chloride'),
        'ca' => tr('Calcium chloride'),
        'sr' => tr('Strontium chloride'),
        'ba' => tr('Barium chloride'),
        'cu' => tr('Copper(II) chloride'),
        'li' => tr('Lithium chloride'),
        _ => tr('Sodium chloride'),
      };

  static String colourName(String c) => switch (c) {
        'lilac' => tr('Lilac'),
        'brick red' => tr('Brick red'),
        'crimson' => tr('Crimson'),
        'apple green' => tr('Apple green'),
        'blue-green' => tr('Blue-green'),
        'crimson red' => tr('Crimson red'),
        _ => tr('Golden yellow'),
      };

  static String ion(String s) => switch (s) {
        'k' => 'K⁺',
        'ca' => 'Ca²⁺',
        'sr' => 'Sr²⁺',
        'ba' => 'Ba²⁺',
        'cu' => 'Cu²⁺',
        'li' => 'Li⁺',
        _ => 'Na⁺',
      };

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('salt', tr('Salt on the wire'), [for (final s in salts.keys) (s, saltName(s))]),
        LabToggle('in', tr('Hold the wire in the flame')),
      ];

  @override
  LabParams act(String action, LabParams p) => action == 'set:salt' ? {...p, 'in': false} : p;

  @override
  List<LabColumn> get columns => [LabColumn(tr('Salt')), LabColumn(tr('Flame colour')), LabColumn(tr('Metal ion'))];

  @override
  LabReading read(LabParams p) {
    if (!pBool(p, 'in')) return LabReading.not(tr('Put the wire with the salt into the flame first.'));
    final s = pStr(p, 'salt', 'na');
    return LabReading.row([saltName(s), colourName(salts[s]!.$2), ion(s)]);
  }

  @override
  List<String> live(LabParams p) => [if (pBool(p, 'in')) colourName(salts[pStr(p, 'salt', 'na')]!.$2) else tr('Blue flame')];

  @override
  String? result(List<List<Object>> rows) => rows.isEmpty
      ? null
      : tr('Each metal ion gives its own flame colour because its electrons, excited by the heat, give out light of particular wavelengths as they fall back.');

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final s = pStr(p, 'salt', 'na');
    final on = pBool(p, 'in');
    Glass.bunsen(canvas, Offset(w * 0.4, h * 0.92), h * 0.75, flame: on ? salts[s]!.$1 : null, t: t);
    // Nichrome wire loop on a glass rod.
    final tip = on ? Offset(w * 0.4, h * 0.5) : Offset(w * 0.62, h * 0.4);
    canvas.drawLine(tip + const Offset(110, -60), tip, stroke(const Color(0xFF9E9E9E), 2));
    canvas.drawCircle(tip, 5, stroke(const Color(0xFF9E9E9E), 2));
    canvas.drawLine(tip + const Offset(110, -60), tip + const Offset(170, -95), stroke(const Color(0x8890CAF9), 7));
    label(canvas, saltName(s), Offset(w * 0.78, h * 0.65), size: 16, bold: true);
    if (on) label(canvas, colourName(salts[s]!.$2), Offset(w * 0.78, h * 0.74), size: 18, bold: true, color: salts[s]!.$1);
  }
}
