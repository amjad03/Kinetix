import 'package:flutter/material.dart';

import '../../core/i18n.dart';
import '../chemistry/spot_tests.dart';

/// Reagent kits for the PUC practicals that run on the spot-test bench:
/// functional groups in organic compounds, Lassaigne's test, tests on urine,
/// and water and soil samples.
const _clear = Color(0x3378B7E0);

// ---------------------------------------------------- functional groups

const _organic = ['alkene', 'ethanol', 'phenol', 'ethanal', 'propanone', 'ethanoic', 'aniline'];
const _organicTests = ['br2', 'can', 'fecl3', 'dnp', 'tollens', 'fehling', 'nitroprusside', 'nahco3', 'carbylamine', 'azo'];

String _organicName(String s) => tr('Compound {s}', {'s': String.fromCharCode(65 + _organic.indexOf(s))});

String _group(String key) => switch (key) {
      'unsat' => tr('unsaturation (C=C)'),
      'alcohol' => tr('an alcoholic –OH group'),
      'phenol' => tr('a phenolic –OH group'),
      'carbonyl' => tr('a carbonyl group (C=O)'),
      'aldehyde' => tr('an aldehyde group (–CHO)'),
      'ketone' => tr('a ketone group (>C=O)'),
      'acid' => tr('a carboxylic acid group (–COOH)'),
      _ => tr('a primary aromatic amino group (–NH₂)'),
    };

SpotResult _org(String s, String t) {
  SpotResult found(Color liquid, String seen, String key, {Color? solid}) => SpotResult(liquid, seen, tr('{g} present', {'g': _group(key)}), solid: solid, finds: key);
  switch ('$s/$t') {
    case 'alkene/br2':
      return found(_clear, tr('The orange-red bromine colour disappears'), 'unsat');
    case 'phenol/br2' || 'aniline/br2':
      return SpotResult(_clear, tr('Bromine decolourised; a white precipitate forms'), tr('An activated benzene ring (phenol or aniline)'), solid: Colors.white);
    case 'ethanol/can':
      return found(const Color(0xCCD84315), tr('The yellow reagent turns red'), 'alcohol');
    case 'phenol/fecl3':
      return found(const Color(0xDD6A1B9A), tr('Violet colour'), 'phenol');
    case 'ethanal/dnp' || 'propanone/dnp':
      return found(const Color(0x88FFB74D), tr('Orange-yellow precipitate'), 'carbonyl', solid: const Color(0xFFF57C00));
    case 'ethanal/tollens':
      return found(const Color(0x55BDBDBD), tr('A silver mirror forms on the warmed tube'), 'aldehyde', solid: const Color(0xFF9E9E9E));
    case 'ethanal/fehling':
      return found(const Color(0x88E65100), tr('Red precipitate on boiling'), 'aldehyde', solid: const Color(0xFFBF360C));
    case 'propanone/nitroprusside':
      return found(const Color(0xCCC62828), tr('Red colour'), 'ketone');
    case 'ethanoic/nahco3':
      return found(_clear, tr('Brisk effervescence: CO₂ turns lime water milky'), 'acid');
    case 'aniline/carbylamine':
      return found(_clear, tr('An offensive smell of isocyanide'), 'amine');
    case 'aniline/azo':
      return found(const Color(0xDDE65100), tr('Orange-red dye forms'), 'amine', solid: const Color(0xFFD84315));
  }
  final colour = switch (t) {
    'br2' => const Color(0xAAE65100),
    'can' => const Color(0x99FBC02D),
    'fecl3' => const Color(0x88F9A825),
    'fehling' => const Color(0x991E88E5),
    'nitroprusside' => const Color(0x66D7CCC8),
    'dnp' => const Color(0x88FFCC80),
    _ => _clear,
  };
  return SpotResult(colour, tr('No change'), tr('Absent'));
}

String _orgTest(String t) => switch (t) {
      'br2' => tr('Bromine water'),
      'can' => tr('Ceric ammonium nitrate'),
      'fecl3' => tr('Neutral ferric chloride'),
      'dnp' => tr('2,4-DNP reagent'),
      'tollens' => tr("Tollens' reagent (warm)"),
      'fehling' => tr("Fehling's solution (boil)"),
      'nitroprusside' => tr('Sodium nitroprusside + NaOH'),
      'nahco3' => tr('Sodium hydrogen carbonate'),
      'carbylamine' => tr('Chloroform + alcoholic KOH (warm)'),
      _ => tr('NaNO₂ + HCl (cold), then β-naphthol'),
    };

String? _orgIdentify(String s, Set<String> found) {
  final key = switch (s) {
    'alkene' => 'unsat',
    'ethanol' => 'alcohol',
    'phenol' => 'phenol',
    'ethanal' => 'aldehyde',
    'propanone' => 'ketone',
    'ethanoic' => 'acid',
    _ => 'amine',
  };
  return found.contains(key) ? tr('{s} contains {g}.', {'s': _organicName(s), 'g': _group(key)}) : null;
}

// ------------------------------------------------------------ Lassaigne

const _lassaigne = ['urea', 'thiourea', 'chlorobenzene', 'sulphanilic', 'glucose'];
const _lassaigneTests = ['fes04', 'nitroprusside', 'pbac', 'agno3', 'fecl3'];

String _lName(String s) => tr('Compound {s}', {'s': 'P${_lassaigne.indexOf(s) + 1}'});

(bool, bool, bool) _elements(String s) => switch (s) {
      'urea' => (true, false, false),
      'thiourea' => (true, true, false),
      'chlorobenzene' => (false, false, true),
      'sulphanilic' => (true, true, false),
      _ => (false, false, false),
    };

SpotResult _lass(String s, String t) {
  final (n, sul, cl) = _elements(s);
  switch (t) {
    case 'fes04':
      if (n) return SpotResult(const Color(0xDD0D47A1), tr('Prussian blue colour'), tr('Nitrogen present'), solid: const Color(0xFF0D47A1), finds: 'N');
    case 'nitroprusside':
      if (sul) return SpotResult(const Color(0xDD7B1FA2), tr('Violet colour'), tr('Sulphur present'), finds: 'S');
    case 'pbac':
      if (sul) return SpotResult(_clear, tr('Black precipitate of PbS'), tr('Sulphur present'), solid: const Color(0xFF212121), finds: 'S');
    case 'agno3':
      if (cl) return SpotResult(_clear, tr('Curdy white precipitate, soluble in ammonia'), tr('Chlorine present'), solid: Colors.white, finds: 'Cl');
    case 'fecl3':
      if (n && sul) return SpotResult(const Color(0xDDB71C1C), tr('Blood-red colour (thiocyanate)'), tr('Nitrogen and sulphur both present'), finds: 'NS');
  }
  return SpotResult(_clear, tr('No change'), tr('Absent'));
}

String _lTest(String t) => switch (t) {
      'fes04' => tr('FeSO₄, boil, then FeCl₃ + dil. H₂SO₄'),
      'nitroprusside' => tr('Sodium nitroprusside'),
      'pbac' => tr('Acetic acid + lead acetate'),
      'agno3' => tr('Dil. HNO₃ (boil) + AgNO₃'),
      _ => tr('Ferric chloride'),
    };

String? _lIdentify(String s, Set<String> found) {
  final (n, sul, cl) = _elements(s);
  final want = {if (n) 'N', if (sul) 'S', if (cl) 'Cl'};
  if (want.isEmpty || !found.containsAll(want)) return null;
  return tr('{s} contains {e}.', {
    's': _lName(s),
    'e': [if (n) tr('nitrogen'), if (sul) tr('sulphur'), if (cl) tr('chlorine')].join(', '),
  });
}

// ----------------------------------------------------------------- urine

const _urine = ['normal', 'diabetic', 'albumin', 'jaundice'];
const _urineTests = ['benedict', 'heat', 'hay', 'gmelin'];

String _uName(String s) => tr('Urine sample {s}', {'s': '${_urine.indexOf(s) + 1}'});

SpotResult _ur(String s, String t) {
  const straw = Color(0x88F9E79F);
  switch ('$s/$t') {
    case 'diabetic/benedict':
      return SpotResult(const Color(0xCCE65100), tr('Brick-red precipitate on boiling'), tr('Glucose present (glycosuria)'), solid: const Color(0xFFBF360C), finds: 'sugar');
    case 'albumin/heat':
      return SpotResult(const Color(0xCCF5F5F5), tr('White cloud that stays with acetic acid'), tr('Albumin present (albuminuria)'), finds: 'albumin');
    case 'jaundice/hay':
      return SpotResult(const Color(0xAAF9A825), tr('Sulphur powder sinks'), tr('Bile salts present'), finds: 'bile');
    case 'jaundice/gmelin':
      return SpotResult(const Color(0xAA2E7D32), tr('Green, blue and violet rings at the junction'), tr('Bile pigments present'), finds: 'pigment');
    case 'normal/benedict' || 'albumin/benedict' || 'jaundice/benedict':
      return SpotResult(const Color(0x881E88E5), tr('Stays blue'), tr('No glucose'));
    case 'normal/hay' || 'diabetic/hay' || 'albumin/hay':
      return SpotResult(straw, tr('Sulphur powder floats'), tr('No bile salts'));
  }
  return SpotResult(s == 'jaundice' ? const Color(0xAAE6A23C) : straw, tr('No change'), tr('Absent'));
}

String _uTest(String t) => switch (t) {
      'benedict' => tr("Benedict's solution (boil)"),
      'heat' => tr('Heat the upper part, add acetic acid'),
      'hay' => tr("Hay's test (sulphur powder)"),
      _ => tr("Gmelin's test (conc. HNO₃)"),
    };

String? _uIdentify(String s, Set<String> found) {
  if (s == 'normal') return null;
  final want = switch (s) { 'diabetic' => 'sugar', 'albumin' => 'albumin', _ => 'bile' };
  if (!found.contains(want)) return null;
  return switch (s) {
    'diabetic' => tr('{s}: glucose in urine, a sign of diabetes mellitus.', {'s': _uName(s)}),
    'albumin' => tr('{s}: albumin in urine, a sign of kidney disease.', {'s': _uName(s)}),
    _ => tr('{s}: bile salts and pigments in urine, a sign of jaundice.', {'s': _uName(s)}),
  };
}

// ----------------------------------------------------------- water, soil

const _water = ['tap', 'pond', 'borewell', 'garden', 'roadside'];
const _waterTests = ['ph', 'clarity', 'soap', 'agno3'];

String _wName(String s) => switch (s) {
      'tap' => tr('Tap water'),
      'pond' => tr('Pond water'),
      'borewell' => tr('Borewell water'),
      'garden' => tr('Garden soil (in water)'),
      _ => tr('Roadside soil (in water)'),
    };

const _ph = {'tap': 7.0, 'pond': 6.5, 'borewell': 7.8, 'garden': 6.0, 'roadside': 8.5};

Color _phColour(double ph) => ph < 6.5
    ? const Color(0xCCF9A825)
    : ph < 7.5
        ? const Color(0xCC7CB342)
        : ph < 8.2
            ? const Color(0xCC26A69A)
            : const Color(0xCC1E88E5);

SpotResult _wat(String s, String t) {
  switch (t) {
    case 'ph':
      final ph = _ph[s]!;
      final what = ph < 6.8 ? tr('acidic') : (ph > 7.2 ? tr('alkaline') : tr('neutral'));
      return SpotResult(_phColour(ph), tr('Universal indicator: pH about {p}', {'p': ph.toStringAsFixed(1)}), tr('pH {p}: {w}', {'p': ph.toStringAsFixed(1), 'w': what}), finds: 'ph');
    case 'clarity':
      final turbid = s == 'pond' || s == 'garden' || s == 'roadside';
      return SpotResult(
        turbid ? (s == 'pond' ? const Color(0x997CB342) : const Color(0xAA8D6E63)) : _clear,
        turbid ? tr('Turbid: the black cross under the tube is hard to see') : tr('Clear: the black cross is sharp'),
        turbid ? tr('Suspended particles present') : tr('Clear water'),
        solid: turbid ? const Color(0xFF6D4C41) : null,
        finds: 'clarity',
      );
    case 'soap':
      final hard = s == 'borewell' || s == 'roadside';
      return SpotResult(hard ? const Color(0x66ECEFF1) : const Color(0x33FFFFFF), hard ? tr('Scum forms, little lather') : tr('Plenty of lather'), hard ? tr('Hard (Ca²⁺, Mg²⁺ salts)') : tr('Soft'), solid: hard ? Colors.white : null);
    default:
      final salty = s == 'borewell' || s == 'roadside';
      return SpotResult(salty ? const Color(0x99ECEFF1) : _clear, salty ? tr('White turbidity') : tr('Stays clear'), salty ? tr('Chloride present') : tr('Little chloride'));
  }
}

String _wTest(String t) => switch (t) {
      'ph' => tr('Universal indicator'),
      'clarity' => tr('Clarity over a black cross'),
      'soap' => tr('Shake with soap solution'),
      _ => tr('Silver nitrate + dil. HNO₃'),
    };

String? _wIdentify(String s, Set<String> found) {
  if (!found.containsAll(['ph', 'clarity'])) return null;
  final ph = _ph[s]!;
  final turbid = s == 'pond' || s == 'garden' || s == 'roadside';
  return tr('{s}: pH {p}, {c}.', {'s': _wName(s), 'p': ph.toStringAsFixed(1), 'c': turbid ? tr('turbid') : tr('clear')});
}

final pucSpotKits = <String, SpotKit>{
  'organic': SpotKit(samples: _organic, tests: _organicTests, sampleName: _organicName, testName: _orgTest, run: _org, identify: _orgIdentify),
  'lassaigne': SpotKit(samples: _lassaigne, tests: _lassaigneTests, sampleName: _lName, testName: _lTest, run: _lass, identify: _lIdentify),
  'urine': SpotKit(samples: _urine, tests: _urineTests, sampleName: _uName, testName: _uTest, run: _ur, identify: _uIdentify),
  'water': SpotKit(samples: _water, tests: _waterTests, sampleName: _wName, testName: _wTest, run: _wat, identify: _wIdentify),
};
