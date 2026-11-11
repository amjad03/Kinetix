import 'package:flutter/material.dart';

import '../../core/bench.dart';
import '../../core/i18n.dart';
import '../puc/kit.dart';
import '../puc/spot_kits.dart';
import 'glassware.dart';

/// What a test shows in a tube: the liquid, any precipitate, what is seen,
/// and what it tells (the radical, food or substance it points to).
class SpotResult {
  final Color liquid;
  final Color? solid;
  final String seen;
  final String means;

  /// The key this result establishes (e.g. 'cu' for Cu²⁺), if any.
  final String? finds;
  const SpotResult(this.liquid, this.seen, this.means, {this.solid, this.finds});
}

const _clear = Color(0x3378B7E0);

/// A kit of reagent tests on unknown samples, given as data: the same bench
/// runs salt analysis, food tests and forensic presumptive tests (setup 'kit').
class SpotKit {
  final List<String> samples, tests;
  final String Function(String sample) sampleName;
  final String Function(String test) testName;
  final SpotResult Function(String sample, String test) run;

  /// What a sample is, once the tests have found [found] in it (null: not yet).
  final String? Function(String sample, Set<String> found) identify;
  const SpotKit({required this.samples, required this.tests, required this.sampleName, required this.testName, required this.run, required this.identify});
}

// ----------------------------------------------------------- salt analysis

const _salts = {'A': ('cu', 'so4'), 'B': ('pb', 'no3'), 'C': ('nh4', 'cl'), 'D': ('zn', 'so4'), 'E': ('fe', 'cl'), 'F': ('ba', 'cl'), 'G': ('mg', 'co3')};

String _radical(String r) => switch (r) {
      'cu' => 'Cu²⁺',
      'pb' => 'Pb²⁺',
      'nh4' => 'NH₄⁺',
      'zn' => 'Zn²⁺',
      'fe' => 'Fe³⁺',
      'ba' => 'Ba²⁺',
      'mg' => 'Mg²⁺',
      'so4' => 'SO₄²⁻',
      'no3' => 'NO₃⁻',
      'cl' => 'Cl⁻',
      _ => 'CO₃²⁻',
    };

String _saltName(String cation, String anion) => switch ('$cation-$anion') {
      'cu-so4' => tr('Copper(II) sulphate, CuSO₄'),
      'pb-no3' => tr('Lead(II) nitrate, Pb(NO₃)₂'),
      'nh4-cl' => tr('Ammonium chloride, NH₄Cl'),
      'zn-so4' => tr('Zinc sulphate, ZnSO₄'),
      'fe-cl' => tr('Iron(III) chloride, FeCl₃'),
      'ba-cl' => tr('Barium chloride, BaCl₂'),
      _ => tr('Magnesium carbonate, MgCO₃'),
    };

SpotResult _salt(String sample, String test) {
  final (cat, an) = _salts[sample]!;
  SpotResult found(Color liquid, String seen, String key, {Color? solid}) =>
      SpotResult(liquid, seen, tr('{r} present', {'r': _radical(key)}), solid: solid, finds: key);
  final base = cat == 'cu' ? const Color(0x6642A5F5) : (cat == 'fe' ? const Color(0x88E0A040) : _clear);
  switch (test) {
    case 'dil-h2so4':
      if (an == 'co3') return found(_clear, tr('Brisk effervescence; the gas turns lime water milky'), 'co3');
      if (cat == 'ba' || cat == 'pb') return SpotResult(base, tr('White precipitate'), tr('Insoluble sulphate: Ba²⁺ or Pb²⁺ likely'), solid: Colors.white);
    case 'conc-h2so4':
      if (an == 'cl') return found(base, tr('Colourless pungent gas; dense white fumes with a rod dipped in ammonia'), 'cl');
      if (an == 'no3') return found(base, tr('With copper turnings: reddish-brown fumes'), 'no3');
    case 'agno3':
      if (an == 'cl') return found(base, tr('Curdy white precipitate, soluble in ammonium hydroxide'), 'cl', solid: Colors.white);
    case 'bacl2':
      if (an == 'so4') return found(base, tr('White precipitate, insoluble in conc. HCl'), 'so4', solid: Colors.white);
    case 'naoh':
      switch (cat) {
        case 'nh4':
          return found(_clear, tr('On warming, a gas smelling of ammonia; turns moist red litmus blue'), 'nh4');
        case 'cu':
          return SpotResult(_clear, tr('Pale blue precipitate'), tr('Cu²⁺ likely'), solid: const Color(0xFF64B5F6));
        case 'pb' || 'zn':
          return SpotResult(_clear, tr('White precipitate, dissolves in excess NaOH'), tr('Pb²⁺, Zn²⁺ or Al³⁺ likely'), solid: Colors.white);
        case 'fe':
          return SpotResult(_clear, tr('Reddish-brown precipitate'), tr('Fe³⁺ likely'), solid: const Color(0xFF8D4F1F));
        case 'mg':
          return SpotResult(_clear, tr('White precipitate, insoluble in excess NaOH'), tr('Mg²⁺ likely'), solid: Colors.white);
      }
    case 'dil-hcl':
      if (cat == 'pb') return SpotResult(_clear, tr('White precipitate, dissolves in hot water'), tr('Group I: Pb²⁺'), solid: Colors.white);
    case 'h2s-acid':
      if (cat == 'cu') return SpotResult(_clear, tr('Black precipitate'), tr('Group II: Cu²⁺ or Pb²⁺'), solid: const Color(0xFF212121));
      if (cat == 'pb') return SpotResult(_clear, tr('Black precipitate'), tr('Group II: Cu²⁺ or Pb²⁺'), solid: const Color(0xFF212121));
    case 'nh4oh':
      if (cat == 'fe') return SpotResult(_clear, tr('Reddish-brown precipitate'), tr('Group III: Fe³⁺'), solid: const Color(0xFF8D4F1F));
      if (cat == 'cu') return SpotResult(const Color(0xCC1A237E), tr('Deep blue solution with excess'), tr('Cu²⁺ likely'));
      if (cat == 'zn') return SpotResult(_clear, tr('White precipitate, dissolves in excess'), tr('Zn²⁺ likely'));
    case 'k4fecn6':
      if (cat == 'cu') return found(_clear, tr('Chocolate-brown precipitate'), 'cu', solid: const Color(0xFF5D4037));
      if (cat == 'fe') return found(const Color(0xCC0D47A1), tr('Prussian blue colour'), 'fe', solid: const Color(0xFF0D47A1));
      if (cat == 'zn') return found(_clear, tr('Bluish-white precipitate'), 'zn', solid: const Color(0xFFE3F2FD));
    case 'ki':
      if (cat == 'pb') return found(_clear, tr('Bright yellow precipitate'), 'pb', solid: const Color(0xFFFDD835));
    case 'k2cro4':
      if (cat == 'ba') return found(_clear, tr('Yellow precipitate (in acetic acid)'), 'ba', solid: const Color(0xFFFBC02D));
      if (cat == 'pb') return SpotResult(_clear, tr('Yellow precipitate (in acetic acid)'), tr('Pb²⁺ or Ba²⁺'), solid: const Color(0xFFFBC02D));
    case 'na2hpo4':
      if (cat == 'mg') return found(_clear, tr('White crystalline precipitate on scratching'), 'mg', solid: Colors.white);
  }
  return SpotResult(base, tr('No change'), tr('Absent'));
}

String _saltTest(String t) => switch (t) {
      'dil-h2so4' => tr('Dil. H₂SO₄ (on the solid)'),
      'conc-h2so4' => tr('Conc. H₂SO₄ (warm)'),
      'agno3' => tr('Silver nitrate'),
      'bacl2' => tr('Barium chloride'),
      'naoh' => tr('Sodium hydroxide (warm)'),
      'dil-hcl' => tr('Dil. HCl (group I)'),
      'h2s-acid' => tr('H₂S in dil. HCl (group II)'),
      'nh4oh' => tr('NH₄Cl + NH₄OH (group III)'),
      'k4fecn6' => tr('Potassium ferrocyanide'),
      'ki' => tr('Potassium iodide'),
      'k2cro4' => tr('Potassium chromate'),
      _ => tr('Disodium hydrogen phosphate + NH₄OH'),
    };

// -------------------------------------------------------------- food tests

SpotResult _food(String sample, String test) {
  switch ('$sample/$test') {
    case 'starch/iodine':
      return SpotResult(const Color(0xEE1A1A40), tr('Blue-black colour'), tr('Starch present'), finds: 'starch');
    case 'glucose/benedict':
      return SpotResult(const Color(0xCCE65100), tr('Brick-red precipitate on boiling'), tr('Reducing sugar present'), solid: const Color(0xFFBF360C), finds: 'sugar');
    case 'milk/benedict':
      return SpotResult(const Color(0xAAFF8F00), tr('Orange-red precipitate on boiling'), tr('Reducing sugar (lactose) present'), solid: const Color(0xFFE65100), finds: 'sugar');
    case 'egg/biuret' || 'milk/biuret':
      return SpotResult(const Color(0xCC7B1FA2), tr('Violet colour'), tr('Protein present'), finds: 'protein');
    case 'oil/sudan':
      return SpotResult(const Color(0x55FFF59D), tr('Red-stained oily layer floats on top'), tr('Fat present'), finds: 'fat');
    case 'milk/sudan':
      return SpotResult(const Color(0x99FFCDD2), tr('Tiny red-stained droplets'), tr('Fat present'), finds: 'fat');
    case 'oil/paper' || 'milk/paper':
      return SpotResult(_clear, tr('Translucent greasy spot on paper'), tr('Fat present'), finds: 'fat');
  }
  final colour = switch (test) {
    'iodine' => const Color(0x88FFB300),
    'benedict' => const Color(0x8842A5F5),
    'biuret' => const Color(0x8890CAF9),
    _ => _clear,
  };
  return SpotResult(colour, tr('No change (the reagent keeps its colour)'), tr('Absent'));
}

String _foodName(String s) => switch (s) {
      'glucose' => tr('Glucose solution'),
      'starch' => tr('Starch solution'),
      'egg' => tr('Egg albumin'),
      'oil' => tr('Groundnut oil'),
      _ => tr('Milk'),
    };

String _foodTest(String t) => switch (t) {
      'iodine' => tr('Iodine solution'),
      'benedict' => tr("Benedict's solution (boil)"),
      'biuret' => tr('Biuret test (NaOH + CuSO₄)'),
      'sudan' => tr('Sudan III'),
      _ => tr('Rub on paper'),
    };

String? _foodIdentify(String s, Set<String> found) => found.isEmpty
    ? null
    : tr('{s} contains: {f}.', {
        's': _foodName(s),
        'f': [
          for (final f in found)
            switch (f) {
              'starch' => tr('starch'),
              'sugar' => tr('reducing sugar'),
              'protein' => tr('protein'),
              _ => tr('fat'),
            },
        ].join(', '),
      });

// --------------------------------------------- forensic presumptive tests

SpotResult _tox(String sample, String test) {
  switch ('$sample/$test') {
    case 's2/marquis':
      return SpotResult(const Color(0xDD6A1B9A), tr('Purple-violet colour'), tr('Presumptive: an opiate (such as morphine)'), finds: 'opiate');
    case 's3/marquis':
      return SpotResult(const Color(0xDDBF5B04), tr('Orange turning brown'), tr('Presumptive: an amphetamine'), finds: 'amphetamine');
    case 's1/fecl3':
      return SpotResult(const Color(0xDD7B1FA2), tr('Violet colour'), tr('Presumptive: a salicylate (such as aspirin)'), finds: 'salicylate');
    case 's2/fecl3':
      return SpotResult(const Color(0xDD1565C0), tr('Blue colour'), tr('Presumptive: a phenol (morphine gives this)'));
    case 's4/scott':
      return SpotResult(const Color(0xDD1E88E5), tr('Blue precipitate'), tr('Presumptive: cocaine'), solid: const Color(0xFF1565C0), finds: 'cocaine');
    case 's5/reinsch':
      return SpotResult(_clear, tr('Dull grey-black deposit on the copper strip'), tr('Presumptive: arsenic (or mercury, antimony)'), finds: 'arsenic');
  }
  final colour = switch (test) {
    'marquis' => const Color(0x22FFFFFF),
    'fecl3' => const Color(0x88F9A825),
    'scott' => const Color(0x88F06292),
    _ => _clear,
  };
  return SpotResult(colour, tr('No change'), tr('Negative'));
}

String _toxName(String s) => tr('Exhibit {n}', {'n': s.substring(1)});

String _toxTest(String t) => switch (t) {
      'marquis' => tr('Marquis reagent'),
      'fecl3' => tr('Ferric chloride'),
      'scott' => tr('Scott (cobalt thiocyanate) test'),
      _ => tr('Reinsch test (copper strip)'),
    };

String? _toxIdentify(String s, Set<String> found) => found.isEmpty
    ? null
    : tr('{s}: {f}. A presumptive test only narrows it down; a laboratory confirms with chromatography or spectroscopy.', {
        's': _toxName(s),
        'f': [
          for (final f in found)
            switch (f) {
              'opiate' => tr('an opiate'),
              'amphetamine' => tr('an amphetamine'),
              'salicylate' => tr('a salicylate'),
              'cocaine' => tr('cocaine'),
              _ => tr('arsenic'),
            },
        ].join(', '),
      });

final spotKits = <String, SpotKit>{
  'salt': SpotKit(
    samples: _salts.keys.toList(),
    tests: const ['dil-h2so4', 'conc-h2so4', 'agno3', 'bacl2', 'naoh', 'dil-hcl', 'h2s-acid', 'nh4oh', 'k4fecn6', 'ki', 'k2cro4', 'na2hpo4'],
    sampleName: (s) => tr('Salt {s}', {'s': s}),
    testName: _saltTest,
    run: _salt,
    identify: (s, found) {
      final (cat, an) = _salts[s]!;
      if (!found.contains(cat) || !found.contains(an)) return null;
      return tr('Salt {s} is {n}.', {'s': s, 'n': _saltName(cat, an)});
    },
  ),
  'food': SpotKit(
    samples: const ['glucose', 'starch', 'egg', 'oil', 'milk'],
    tests: const ['iodine', 'benedict', 'biuret', 'sudan', 'paper'],
    sampleName: _foodName,
    testName: _foodTest,
    run: _food,
    identify: _foodIdentify,
  ),
  'toxicology': SpotKit(
    samples: const ['s1', 's2', 's3', 's4', 's5', 's6'],
    tests: const ['marquis', 'fecl3', 'scott', 'reinsch'],
    sampleName: _toxName,
    testName: _toxTest,
    run: _tox,
    identify: _toxIdentify,
  ),
  ...pucSpotKits,
};

/// Reagent tests in test tubes: choose a sample and a reagent, see and
/// record what happens; the result names what the tests have found.
class SpotTestBench extends LabBench with LabDemo {
  const SpotTestBench();

  @override
  String get kind => 'spot-test';

  @override
  LabParams get defaults => {'kit': 'salt', 'sample': '', 'test': '', 'added': false, 'history': const <String>[]};

  static SpotKit kitOf(LabParams p) => spotKits[pStr(p, 'kit', 'salt')] ?? spotKits['salt']!;
  static String sampleOf(LabParams p) {
    final k = kitOf(p), s = pStr(p, 'sample');
    return k.samples.contains(s) ? s : k.samples.first;
  }

  static String testOf(LabParams p) {
    final k = kitOf(p), t = pStr(p, 'test');
    return k.tests.contains(t) ? t : k.tests.first;
  }

  @override
  LabParams get preview => {...defaults, 'added': true};

  @override
  List<LabControl> controls(LabParams p) {
    final k = kitOf(p);
    return [
      LabChoice('sample', tr('Sample'), [for (final s in k.samples) (s, k.sampleName(s))]),
      LabChoice('test', tr('Reagent'), [for (final t in k.tests) (t, k.testName(t))]),
      LabToggle('added', tr('Add the reagent')),
    ];
  }

  @override
  LabParams act(String action, LabParams p) {
    if (action == 'set:sample' || action == 'set:test') return {...p, 'added': false};
    if (action == 'set:added' && pBool(p, 'added')) {
      final past = [for (final h in (p['history'] as List? ?? const [])) '$h'];
      final now = '${sampleOf(p)}|${testOf(p)}';
      if (past.isEmpty || past.last != now) past.add(now);
      return {...p, 'history': past.length > 6 ? past.sublist(past.length - 6) : past};
    }
    return p;
  }

  @override
  List<LabParams> demo(LabParams start) {
    final k = kitOf(start);
    final out = <LabParams>[];
    var p = start;
    for (final s in k.samples.take(4)) {
      for (final t in k.tests) {
        if (k.run(s, t).finds == null) continue;
        p = act('set:added', {...p, 'sample': s, 'test': t, 'added': true});
        out.add(p);
      }
    }
    return out;
  }

  @override
  List<LabColumn> get columns => [LabColumn(tr('Sample')), LabColumn(tr('Test')), LabColumn(tr('Observation')), LabColumn(tr('Inference'))];

  @override
  LabReading read(LabParams p) {
    if (!pBool(p, 'added')) return LabReading.not(tr('Add the reagent first.'));
    final k = kitOf(p);
    final r = k.run(sampleOf(p), testOf(p));
    return LabReading.row([k.sampleName(sampleOf(p)), k.testName(testOf(p)), r.seen, r.means]);
  }

  @override
  List<String> live(LabParams p) => [if (pBool(p, 'added')) kitOf(p).run(sampleOf(p), testOf(p)).seen];

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    // Rebuild what each sample's recorded tests found.
    final out = <String>[];
    for (final entry in spotKits.entries) {
      final k = entry.value;
      for (final s in k.samples) {
        final found = <String>{};
        for (final r in rows) {
          if (r[0] != k.sampleName(s)) continue;
          for (final t in k.tests) {
            if (r[1] == k.testName(t)) {
              final f = k.run(s, t).finds;
              if (f != null) found.add(f);
            }
          }
        }
        if (k.identify(s, found) case final id?) out.add(id);
      }
    }
    return out.isEmpty ? tr('Keep testing: no sample is fully identified yet.') : out.join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final k = kitOf(p);
    final added = pBool(p, 'added');
    final r = k.run(sampleOf(p), testOf(p));
    final ground = h * 0.9;
    Kit.table(canvas, Rect.fromLTWH(0, ground, w, h * 0.1));
    // Wooden stand with the tubes already tested.
    final history = [for (final x in (p['history'] as List? ?? const [])) '$x'];
    final rack = Rect.fromLTWH(w * 0.04, ground - h * 0.3, w * 0.36, h * 0.3);
    canvas.drawRect(Rect.fromLTWH(rack.left, rack.top + rack.height * 0.25, rack.width, 12), Kit.woodFill(rack));
    canvas.drawRect(Rect.fromLTWH(rack.left, ground - 14, rack.width, 14), Kit.woodFill(rack));
    canvas.drawRect(Rect.fromLTWH(rack.left, rack.top + rack.height * 0.25, 10, ground - rack.top - rack.height * 0.25), fill(Kit.woodDark));
    canvas.drawRect(Rect.fromLTWH(rack.right - 10, rack.top + rack.height * 0.25, 10, ground - rack.top - rack.height * 0.25), fill(Kit.woodDark));
    for (var i = 0; i < 6; i++) {
      final x = rack.left + rack.width * (i + 0.6) / 6.4;
      final tubeH = rack.height * 0.95;
      if (i < history.length) {
        final parts = history[i].split('|');
        final res = parts.length == 2 && k.samples.contains(parts[0]) && k.tests.contains(parts[1]) ? k.run(parts[0], parts[1]) : null;
        Glass.testTube(canvas, Offset(x, ground - 16), tubeH, res?.liquid ?? const Color(0x2278B7E0), solid: res?.solid, fillFraction: 0.42);
        if (res != null) label(canvas, '${i + 1}', Offset(x, rack.top - 14), size: 13, bold: true, color: LabInk.muted);
      } else {
        Glass.testTube(canvas, Offset(x, ground - 16), tubeH, const Color(0x00000000), fillFraction: 0);
      }
    }
    label(canvas, tr('Tests done so far'), Offset(rack.center.dx, ground + 22), size: 13, color: LabInk.muted);
    // The tube being tested, in a holder.
    final tx = w * 0.56, tubeH = h * 0.56;
    final base = Offset(tx, ground - h * 0.08);
    Glass.testTube(canvas, base, tubeH, added ? r.liquid : const Color(0x3378B7E0), solid: added ? r.solid : null, fillFraction: 0.42);
    if (added && (r.seen.contains('ffervescence') || r.seen.contains('बुदबुद') || r.finds == 'acid' || r.finds == 'co3')) {
      for (var i = 0; i < 14; i++) {
        canvas.drawCircle(Offset(tx + (hash01(i, 3) - 0.5) * tubeH * 0.16, base.dy - tubeH * (0.05 + hash01(i, 4) * 0.35)), 3 + hash01(i, 5) * 3, stroke(const Color(0xAA4A86B0), 1.2));
      }
    }
    final holder = Rect.fromLTWH(tx - tubeH * 0.13, base.dy - tubeH * 0.86, tubeH * 0.26, 16);
    canvas.drawRRect(RRect.fromRectAndRadius(holder, const Radius.circular(3)), Kit.woodFill(holder));
    canvas.drawRect(Rect.fromLTWH(holder.right, holder.top + 3, w * 0.12, 10), Kit.woodFill(holder));
    // Reagent bottle and dropper.
    final bottle = Rect.fromLTWH(w * 0.72, ground - h * 0.22, w * 0.08, h * 0.22);
    canvas.drawRRect(RRect.fromRectAndRadius(bottle, const Radius.circular(8)), fill(const Color(0x99A1887F)));
    canvas.drawRRect(RRect.fromRectAndRadius(bottle, const Radius.circular(8)), stroke(const Color(0xFF5D4037), 1.4));
    canvas.drawRect(Rect.fromLTWH(bottle.left + bottle.width * 0.3, bottle.top - 16, bottle.width * 0.4, 18), fill(const Color(0xFF3E2723)));
    final tag = Rect.fromLTWH(bottle.left + 4, bottle.top + bottle.height * 0.3, bottle.width - 8, bottle.height * 0.38);
    canvas.drawRect(tag, fill(const Color(0xFFFFFDF5)));
    label(canvas, tr('Reagent'), tag.center, size: 14, bold: true, color: const Color(0xFF3E2723));
    if (!added) {
      final dx = tx, dy = base.dy - tubeH - h * 0.1;
      canvas.drawRect(Rect.fromCenter(center: Offset(dx, dy), width: 10, height: h * 0.1), fill(const Color(0x8890CAF9)));
      canvas.drawRect(Rect.fromCenter(center: Offset(dx, dy), width: 10, height: h * 0.1), stroke(LabInk.ink, 1));
      canvas.drawOval(Rect.fromCenter(center: Offset(dx, dy - h * 0.06), width: 20, height: 26), fill(const Color(0xFF3E2723)));
      canvas.drawCircle(Offset(dx, dy + h * 0.06), 4, fill(const Color(0xAA90CAF9)));
    }
    label(canvas, k.sampleName(sampleOf(p)), Offset(tx, ground + 22), size: 16, bold: true);
    Kit.card(canvas, Offset(w * 0.66, h * 0.05), w * 0.32, k.testName(testOf(p)), added ? [tr('Seen: {s}', {'s': r.seen}), tr('So: {m}', {'m': r.means})] : [tr('Add the reagent and watch the tube.')], size: 15);
  }
}
