import 'package:flutter/material.dart';

import 'design.dart';
import 'efield.dart';
import 'graph.dart';
import 'optics.dart';
import 'titration.dart';

export 'design.dart' show BoardSnapshot, InstrumentBoardScope, IX;

/// The instrument library: one parameterised instrument serves many lessons. A lesson step
/// references one by id with a topic preset:
///
///   {"type": "interactive", "kind": "instrument", "instrument": "efield",
///    "preset": {"charges": [{"q": 2, "x": -5, "y": 0}, {"q": -2, "x": 5, "y": 0}]}}
const instrumentIds = ['efield', 'optics', 'titration', 'graph'];

/// Builds the instrument a lesson step names, or null for an id the library does not have.
Widget? buildInstrument(String id, Map<String, dynamic> preset, {Key? key}) => switch (id) {
  'efield' => EFieldInstrument(key: key, preset: preset),
  'optics' => OpticsInstrument(key: key, preset: preset),
  'titration' => TitrationInstrument(key: key, preset: preset),
  'graph' => GraphInstrument(key: key, preset: preset),
  _ => null,
};

/// The lesson block for `kind: instrument`.
class InstrumentBlockView extends StatelessWidget {
  const InstrumentBlockView({super.key, required this.raw});
  final Map<String, dynamic> raw;
  @override
  Widget build(BuildContext context) {
    final id = raw['instrument'] as String? ?? '';
    final preset = (raw['preset'] as Map?)?.cast<String, dynamic>() ?? const <String, dynamic>{};
    return buildInstrument(id, preset, key: ValueKey('instrument:$id')) ??
        ColoredBox(color: IX.page, child: Center(child: Text('Instrument "$id" is not in this version.', style: IX.text(28, c: IX.inkSoft))));
  }
}
