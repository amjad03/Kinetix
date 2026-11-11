import 'package:flutter/material.dart';

import 'design.dart';
import 'efield.dart';
import 'graph.dart';
import 'optics.dart';
import 'titration.dart';
import 'physics/registry.dart';
import 'chemistry/registry.dart';
import 'biology/registry.dart';
import 'maths/registry.dart';

export 'design.dart' show BoardSnapshot, InstrumentBoardScope, IX;

final _domains = [physicsInstruments, chemistryInstruments, biologyInstruments, mathsInstruments];

/// The instrument library: one parameterised instrument serves many lessons. A lesson step
/// references one by id with a topic preset:
///
///   {"type": "interactive", "kind": "instrument", "instrument": "efield",
///    "preset": {"charges": [{"q": 2, "x": -5, "y": 0}, {"q": -2, "x": 5, "y": 0}]}}
List<String> get instrumentIds => ['efield', 'optics', 'titration', 'graph', for (final d in _domains) ...d.keys];

/// Builds the instrument a lesson step names, or null for an id the library does not have.
Widget? buildInstrument(String id, Map<String, dynamic> preset, {Key? key}) => switch (id) {
  'efield' => EFieldInstrument(key: key, preset: preset),
  'optics' => OpticsInstrument(key: key, preset: preset),
  'titration' => TitrationInstrument(key: key, preset: preset),
  'graph' => GraphInstrument(key: key, preset: preset),
  _ => (() {
    for (final d in _domains) {
      final b = d[id];
      if (b != null) return b(preset, key);
    }
    return null;
  })(),
};

/// The lesson block for `kind: instrument`.
class InstrumentBlockView extends StatelessWidget {
  const InstrumentBlockView({super.key, required this.raw});
  final Map<String, dynamic> raw;
  static const design = Size(1920, 1080);
  @override
  Widget build(BuildContext context) {
    final id = raw['instrument'] as String? ?? '';
    final preset = (raw['preset'] as Map?)?.cast<String, dynamic>() ?? const <String, dynamic>{};
    final w = buildInstrument(id, preset, key: ValueKey('instrument:$id'));
    if (w == null) return ColoredBox(color: IX.page, child: Center(child: Text('Instrument "$id" is not in this version.', style: IX.text(28, c: IX.inkSoft))));
    // Instruments are laid out for a 1920 x 1080 board: a smaller stage shows them scaled down.
    return LayoutBuilder(
      builder: (context, c) => !c.hasBoundedWidth || !c.hasBoundedHeight || (c.maxWidth >= design.width - 1 && c.maxHeight >= design.height - 1)
          ? w
          : ColoredBox(
              color: IX.page,
              child: FittedBox(child: SizedBox.fromSize(size: design, child: w)),
            ),
    );
  }
}
