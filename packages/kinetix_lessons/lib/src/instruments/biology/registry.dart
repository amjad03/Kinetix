import 'package:flutter/widgets.dart';

import 'biotech.dart';
import 'cell.dart';
import 'diversity.dart';
import 'division.dart';
import 'dna.dart';
import 'endocrine.dart';
import 'ecosystem.dart';
import 'enzyme.dart';
import 'evolution.dart';
import 'genetics.dart';
import 'photosynthesis.dart';
import 'heart.dart';
import 'immunity.dart';
import 'lungs.dart';
import 'muscle.dart';
import 'nephron.dart';
import 'neuron.dart';
import 'planttransport.dart';
import 'population.dart';
import 'reproduction.dart';
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
  'bio-endocrine': (p, k) => EndocrineInstrument(key: k, preset: p),
  'bio-genetics': (p, k) => GeneticsInstrument(key: k, preset: p),
  'bio-dna': (p, k) => DnaInstrument(key: k, preset: p),
  'bio-evolution': (p, k) => EvolutionInstrument(key: k, preset: p),
  'bio-population': (p, k) => PopulationInstrument(key: k, preset: p),
  'bio-ecosystem': (p, k) => EcosystemInstrument(key: k, preset: p),
  'bio-immunity': (p, k) => ImmunityInstrument(key: k, preset: p),
  'bio-biotech': (p, k) => BiotechInstrument(key: k, preset: p),
  'bio-reproduction': (p, k) => ReproductionInstrument(key: k, preset: p),
  'bio-diversity': (p, k) => DiversityInstrument(key: k, preset: p),
};
