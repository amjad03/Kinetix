import 'package:flutter/widgets.dart';

import 'cell.dart';
import 'division.dart';
import 'enzyme.dart';
import 'photosynthesis.dart';
import 'heart.dart';
import 'lungs.dart';
import 'muscle.dart';
import 'nephron.dart';
import 'neuron.dart';
import 'planttransport.dart';
import 'respiration.dart';

/// Biology instruments. Each entry: id → builder taking the lesson preset.
final Map<String, Widget Function(Map<String, dynamic> preset, Key? key)> biologyInstruments = {
  'bio-cell': (p, k) => CellInstrument(key: k, preset: p),
  'bio-division': (p, k) => DivisionInstrument(key: k, preset: p),
  'bio-enzyme': (p, k) => EnzymeInstrument(key: k, preset: p),
  'bio-photosynthesis': (p, k) => PhotosynthesisInstrument(key: k, preset: p),
  'bio-respiration': (p, k) => RespirationInstrument(key: k, preset: p),
  'bio-planttransport': (p, k) => PlantTransportInstrument(key: k, preset: p),
  'bio-heart': (p, k) => HeartInstrument(key: k, preset: p),
  'bio-lungs': (p, k) => LungsInstrument(key: k, preset: p),
  'bio-nephron': (p, k) => NephronInstrument(key: k, preset: p),
  'bio-neuron': (p, k) => NeuronInstrument(key: k, preset: p),
  'bio-muscle': (p, k) => MuscleInstrument(key: k, preset: p),
};
