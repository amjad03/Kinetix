import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'labs/break_even_lab.dart';
import 'labs/graph_plotter_lab.dart';
import 'labs/lens_mirror_lab.dart';
import 'labs/ohms_law_lab.dart';
import 'labs/pendulum_lab.dart';

/// Builds a lab; [preset] is an optional starting configuration (see each lab).
typedef LabBuilder = Widget Function(BuildContext context, String? preset);

/// One lab in the catalogue. Ids are stable: the content library links topics to them.
class LabEntry {
  const LabEntry({required this.id, required this.title, required this.subject, required this.levels, required this.topics, required this.builder, this.presets = const []});

  final String id, title, subject;

  /// Class or course tags.
  final List<String> levels;

  /// Syllabus topics this lab supports (matching the content library's wording).
  final List<String> topics;
  final LabBuilder builder;

  /// Presets the lab understands.
  final List<String> presets;
}

abstract final class LabCatalogue {
  static final List<LabEntry> entries = [
    LabEntry(
      id: 'lab.ohms-law',
      title: "Ohm's law and resistances",
      subject: 'Science (Physics)',
      levels: const ['CBSE 10'],
      topics: const ['Electricity', "Ohm's law and resistances"],
      presets: const ['series', 'parallel'],
      builder: (context, preset) => OhmsLawLab(preset: preset),
    ),
    LabEntry(
      id: 'lab.lens-mirror',
      title: 'Lens and mirror ray diagrams',
      subject: 'Science (Physics)',
      levels: const ['CBSE 10'],
      topics: const ['Light – Reflection and Refraction', 'Mirror and lens formulae'],
      presets: const ['convex-lens', 'concave-lens', 'concave-mirror', 'convex-mirror', 'lens', 'mirror'],
      builder: (context, preset) => LensMirrorLab(preset: preset),
    ),
    LabEntry(
      id: 'lab.pendulum',
      title: 'Simple pendulum',
      subject: 'Physics',
      levels: const ['Class 9', 'Class 11'],
      topics: const ['Oscillations', 'Time period of a simple pendulum'],
      presets: const ['earth', 'moon', 'mars', 'jupiter'],
      builder: (context, preset) => PendulumLab(preset: preset),
    ),
    LabEntry(
      id: 'lab.break-even',
      title: 'Break-even analysis',
      subject: 'Cost Accounting',
      levels: const ['BCom'],
      topics: const ['Marginal costing', 'Break-even analysis'],
      builder: (context, preset) => const BreakEvenLab(),
    ),
    LabEntry(
      id: 'lab.graph-plotter',
      title: 'Graph plotter',
      subject: 'Mathematics',
      levels: const ['CBSE 9', 'CBSE 10', 'Class 11'],
      topics: const ['Polynomials', 'Quadratic Equations', 'Pair of Linear Equations in Two Variables', 'Introduction to Trigonometry'],
      presets: const ['linear', 'quadratic', 'sine', 'cosine', 'custom'],
      builder: (context, preset) => GraphPlotterLab(preset: preset),
    ),
  ];

  static LabEntry? byId(String id) {
    for (final e in entries) {
      if (e.id == id) return e;
    }
    return null;
  }

  static List<String> get ids => [for (final e in entries) e.id];
}

/// Shows a lab by catalogue id, optionally with a preset (e.g. `lab.lens-mirror` as a mirror).
class LabView extends StatelessWidget {
  const LabView({super.key, required this.id, this.preset});
  final String id;
  final String? preset;

  @override
  Widget build(BuildContext context) {
    final e = LabCatalogue.byId(id);
    if (e == null) return KxEmptyState(icon: Icons.science_outlined, message: 'There is no lab called "$id".');
    // Key by id and preset so switching either starts the lab fresh.
    return KeyedSubtree(key: ValueKey('$id|$preset'), child: e.builder(context, preset));
  }
}
