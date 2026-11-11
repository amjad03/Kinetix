import 'package:flutter/widgets.dart';

import 'bench.dart';
import 'molecule.dart';
import 'atom.dart';
import 'quantum.dart';
import 'periodic.dart';
import 'bond.dart';
import 'stoich.dart';
import 'thermo.dart';
import 'equilibrium.dart';
import 'ph.dart';
import 'cell.dart';
import 'electrolysis.dart';
import 'solution.dart';
import 'kinetics.dart';
import 'complex.dart';
import 'organic.dart';
import 'bio.dart';

Widget Function(Map<String, dynamic>, Key?) _bench(String id, Map<String, Mode> modes) => (p, k) => ChemBench(key: k, id: id, modes: modes, preset: p);

/// Chemistry instruments. Each entry: id → builder taking the lesson preset; the preset's
/// "mode" picks the view and any other key sets a value.
final Map<String, Widget Function(Map<String, dynamic> preset, Key? key)> chemistryInstruments = {
  for (final e in chemistryModes.entries) e.key: _bench(e.key, e.value),
};

/// Every view of every chemistry instrument, for tests and the authoring map.
final Map<String, Map<String, Mode>> chemistryModes = {
  'chem.molecule': moleculeModes,
  'chem.atom': atomModes,
  'chem.quantum': quantumModes,
  'chem.periodic': periodicModes,
  'chem.bond': bondModes,
  'chem.stoich': stoichModes,
  'chem.thermo': thermoModes,
  'chem.equilibrium': equilibriumModes,
  'chem.ph': phModes,
  'chem.cell': cellModes,
  'chem.electrolysis': electrolysisModes,
  'chem.solution': solutionModes,
  'chem.kinetics': kineticsModes,
  'chem.complex': complexModes,
  'chem.organic': organicModes,
  'chem.bio': bioModes,
};
