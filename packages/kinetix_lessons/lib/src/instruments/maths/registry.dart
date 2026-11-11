import 'package:flutter/widgets.dart';

import 'argand.dart';
import 'binomial.dart';
import 'calculus.dart';
import 'conics.dart';
import 'counting.dart';
import 'datachart.dart';
import 'distribution.dart';
import 'integral.dart';
import 'lines.dart';
import 'mapping.dart';
import 'matrix.dart';
import 'plotter.dart';
import 'probability.dart';
import 'region.dart';
import 'scatter.dart';
import 'sequence.dart';
import 'slopefield.dart';
import 'space3d.dart';
import 'statdata.dart';
import 'unitcircle.dart';
import 'venn.dart';

/// Maths instruments. Each entry: id → builder taking the lesson preset.
final Map<String, Widget Function(Map<String, dynamic> preset, Key? key)> mathsInstruments = {
  'maths-plotter': (p, k) => PlotterInstrument(key: k, preset: p),
  'maths-datachart': (p, k) => DataChartInstrument(key: k, preset: p),
  'maths-venn': (p, k) => VennInstrument(key: k, preset: p),
  'maths-mapping': (p, k) => MappingInstrument(key: k, preset: p),
  'maths-unitcircle': (p, k) => UnitCircleInstrument(key: k, preset: p),
  'maths-argand': (p, k) => ArgandInstrument(key: k, preset: p),
  'maths-region': (p, k) => RegionInstrument(key: k, preset: p),
  'maths-counting': (p, k) => CountingInstrument(key: k, preset: p),
  'maths-binomial': (p, k) => BinomialInstrument(key: k, preset: p),
  'maths-sequence': (p, k) => SequenceInstrument(key: k, preset: p),
  'maths-lines': (p, k) => LinesInstrument(key: k, preset: p),
  'maths-conics': (p, k) => ConicsInstrument(key: k, preset: p),
  'maths-space3d': (p, k) => Space3DInstrument(key: k, preset: p),
  'maths-limits': (p, k) => LimitsInstrument(key: k, preset: p),
  'maths-derivative': (p, k) => DerivativeInstrument(key: k, preset: p),
  'maths-integral': (p, k) => IntegralInstrument(key: k, preset: p),
  'maths-slopefield': (p, k) => SlopeFieldInstrument(key: k, preset: p),
  'maths-matrix': (p, k) => MatrixInstrument(key: k, preset: p),
  'maths-probability': (p, k) => ProbabilityInstrument(key: k, preset: p),
  'maths-distribution': (p, k) => DistributionInstrument(key: k, preset: p),
  'maths-statdata': (p, k) => StatDataInstrument(key: k, preset: p),
  'maths-scatter': (p, k) => ScatterInstrument(key: k, preset: p),
};
