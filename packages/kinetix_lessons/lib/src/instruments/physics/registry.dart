import 'package:flutter/widgets.dart';

import 'kit.dart';
import 'ac.dart';
import 'atom.dart';
import 'circuit.dart';
import 'electro.dart';
import 'emwave.dart';
import 'energy.dart';
import 'forces.dart';
import 'gas.dart';
import 'gravitation.dart';
import 'induction.dart';
import 'kinematics.dart';
import 'logic.dart';
import 'magnet.dart';
import 'magnetism.dart';
import 'matter.dart';
import 'measurement.dart';
import 'nucleus.dart';
import 'oscillations.dart';
import 'photon.dart';
import 'plane.dart';
import 'refraction.dart';
import 'rotation.dart';
import 'semiconductor.dart';
import 'thermal.dart';
import 'thermo.dart';
import 'vectors.dart';
import 'waveoptics.dart';

final _specs = <InstrumentSpec>[
  kinematicsSpec,
  vectorsSpec,
  projectileSpec,
  circularSpec,
  forcesSpec,
  energySpec,
  rotationSpec,
  gravitationSpec,
  elasticitySpec,
  fluidsSpec,
  thermalSpec,
  thermoSpec,
  gasSpec,
  oscillatorSpec,
  wavesSpec,
  measurementSpec,
  chargesSpec,
  capacitorSpec,
  circuitSpec,
  magneticSpec,
  magnetSpec,
  inductionSpec,
  acSpec,
  emwaveSpec,
  refractionSpec,
  waveOpticsSpec,
  photonSpec,
  atomSpec,
  nucleusSpec,
  semiconductorSpec,
  logicSpec,
];

/// Physics instruments. Each entry: id → builder taking the lesson preset.
final Map<String, Widget Function(Map<String, dynamic> preset, Key? key)> physicsInstruments = {
  for (final s in _specs) s.id: (preset, key) => PhysInstrument(key: key, spec: s, preset: preset),
};
