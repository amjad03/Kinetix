import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'benches/registry.dart';
import 'content/library.dart';
import 'core/i18n.dart';
import 'core/lab.dart';
import 'labs/break_even_lab.dart';
import 'labs/graph_plotter_lab.dart';
import 'labs/lens_mirror_lab.dart';
import 'labs/ohms_law_lab.dart';
import 'labs/pendulum_lab.dart';
import 'screen/lab_screen.dart';

/// Builds a lab; [preset] is an optional starting configuration (see each lab).
typedef LabBuilder = Widget Function(BuildContext context, String? preset);

/// One lab in the catalogue. Ids are stable: the content library links topics to them
/// (TopicResource kind 'lab').
class LabEntry {
  const LabEntry({
    required this.id,
    required this.title,
    required this.subject,
    required this.levels,
    required this.topics,
    required this.builder,
    this.presets = const [],
    this.lab,
  });

  final String id, title, subject;

  /// Class or course tags, in English (e.g. 'Class 10', 'UG').
  final List<String> levels;

  /// Syllabus topics this lab supports (matching the content library's wording).
  final List<String> topics;
  final LabBuilder builder;

  /// Presets the lab understands.
  final List<String> presets;

  /// The lab's text in three languages: aim, principle, steps, viva…
  final VirtualLab? lab;

  LabDomain get domain => lab?.domain ?? LabDomain.physics;
  List<LabLevel> get labLevels => lab?.levels ?? const [];
  LabMode get mode => lab?.mode ?? LabMode.explore;

  /// The title in [lang] (English when the lab has no translation).
  String titleIn(LabLang lang) => lab?.title.of(lang) ?? title;

  /// Whether a [LabScreen] runs this lab (the rest are hand-built simulations).
  bool get isBench => lab != null && labBenches.containsKey(lab!.bench);
}

String _levelTag(LabLevel l) => l.schoolClass != null ? 'Class ${l.schoolClass}' : l.code.toUpperCase();

/// The simulations built as their own widgets (explore mode). Their text is in
/// the library under the same ids, with bench 'sim'.
final _simulations = <String, (LabBuilder, List<String>, List<String>)>{
  'lab.ohms-law': ((context, preset) => OhmsLawLab(preset: preset), const ['series', 'parallel'], const ['Electricity', "Ohm's law and resistances"]),
  'lab.lens-mirror': (
    (context, preset) => LensMirrorLab(preset: preset),
    const ['convex-lens', 'concave-lens', 'concave-mirror', 'convex-mirror', 'lens', 'mirror'],
    const ['Light – Reflection and Refraction', 'Mirror and lens formulae'],
  ),
  'lab.pendulum': ((context, preset) => PendulumLab(preset: preset), const ['earth', 'moon', 'mars', 'jupiter'], const ['Oscillations', 'Time period of a simple pendulum']),
  'lab.break-even': ((context, preset) => const BreakEvenLab(), const [], const ['Marginal costing', 'Break-even analysis']),
  'lab.graph-plotter': (
    (context, preset) => GraphPlotterLab(preset: preset),
    const ['linear', 'quadratic', 'sine', 'cosine', 'custom'],
    const ['Polynomials', 'Quadratic Equations', 'Pair of Linear Equations in Two Variables', 'Introduction to Trigonometry'],
  ),
};

/// Every virtual lab, for the board and the Student App: list, filter and open.
abstract final class LabCatalogue {
  static final List<LabEntry> entries = [
    for (final l in LabLibrary.instance.labs)
      if (l.bench == 'sim' && _simulations.containsKey(l.id))
        LabEntry(
          id: l.id,
          title: l.title.of(LabLang.en),
          subject: l.subject,
          levels: [for (final v in l.levels) _levelTag(v)],
          topics: _simulations[l.id]!.$3,
          presets: _simulations[l.id]!.$2,
          builder: _simulations[l.id]!.$1,
          lab: l,
        )
      else if (labBenches.containsKey(l.bench))
        LabEntry(
          id: l.id,
          title: l.title.of(LabLang.en),
          subject: l.subject,
          levels: [for (final v in l.levels) _levelTag(v)],
          topics: l.keywords,
          builder: (context, preset) => LabScreen(labId: l.id),
          lab: l,
        ),
  ];

  static final Map<String, LabEntry> _byId = {for (final e in entries) e.id: e};

  static LabEntry? byId(String id) => _byId[id];

  static List<String> get ids => [for (final e in entries) e.id];

  /// Labs in any of [domains], for any of [levels], whose title, summary or
  /// keywords contain every word of [query] (in any language).
  static List<LabEntry> filter({Set<LabDomain> domains = const {}, Set<LabLevel> levels = const {}, String? subject, LabMode? mode, String query = ''}) => [
        for (final l in LabLibrary.instance.filter(domains: domains, levels: levels, subject: subject, mode: mode, query: query)) ?_byId[l.id],
      ];

  /// Labs that fit a lesson (a chapter title, a topic), best first.
  static List<LabEntry> forLesson(String text) => [for (final l in LabLibrary.instance.matching(text)) ?_byId[l.id]];

  /// Opens a lab full screen (on a phone, or the board's own page).
  static Future<void> open(BuildContext context, String id, {String? preset, LabLang? lang}) {
    final e = byId(id);
    if (e != null && e.isBench) return showLab(context, id, lang: lang);
    return Navigator.of(context).push(MaterialPageRoute(
      builder: (context) => Scaffold(
        appBar: AppBar(title: Text(e?.titleIn(lang ?? LabLang.of(context)) ?? id)),
        body: SafeArea(child: LabView(id: id, preset: preset)),
      ),
    ));
  }
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
