import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'astronomy.dart';
import 'chemistry.dart';
import 'model.dart';
import 'model_viewer.dart';
import 'solid_explorer.dart';
import 'solids.dart';

/// One entry in the model catalogue. Ids are stable: the content library links topics to them.
class ModelEntry {
  const ModelEntry({required this.id, required this.title, required this.subjects, required this.levels, this.solid, this.build});

  final String id;
  final String title;
  final List<String> subjects;

  /// Class or course tags, e.g. 'CBSE 10', 'Class 9'.
  final List<String> levels;

  /// Set for solids: shown with dimension sliders and measurements.
  final SolidKind? solid;

  /// Builds the model (for everything that is not a solid).
  final Model3D Function()? build;

  Model3D buildModel() => solid != null ? Solid(solid!).toModel() : build!();
}

/// Every built-in model, built procedurally (no downloads).
abstract final class ModelCatalogue {
  static final List<ModelEntry> entries = [
    for (final k in SolidKind.values)
      ModelEntry(
        id: k.id,
        title: k.title,
        subjects: const ['Maths'],
        levels: k == SolidKind.triangularPrism || k == SolidKind.squarePyramid || k == SolidKind.tetrahedron
            ? const ['Class 8', 'Class 10']
            : const ['CBSE 9', 'CBSE 10'],
        solid: k,
      ),
    const ModelEntry(id: 'chem.water', title: 'Water molecule (H₂O)', subjects: ['Chemistry'], levels: ['Class 9', 'CBSE 10'], build: ChemistryModels.water),
    const ModelEntry(id: 'chem.methane', title: 'Methane (CH₄)', subjects: ['Chemistry'], levels: ['CBSE 10'], build: ChemistryModels.methane),
    const ModelEntry(id: 'chem.co2', title: 'Carbon dioxide (CO₂)', subjects: ['Chemistry'], levels: ['CBSE 10'], build: ChemistryModels.carbonDioxide),
    const ModelEntry(id: 'chem.nacl', title: 'Sodium chloride lattice (NaCl)', subjects: ['Chemistry'], levels: ['CBSE 10'], build: ChemistryModels.sodiumChloride),
    const ModelEntry(id: 'astro.solar-system', title: 'The Solar System', subjects: ['Science', 'Geography'], levels: ['Class 6', 'Class 8'], build: AstronomyModels.solarSystem),
    const ModelEntry(id: 'astro.earth', title: 'The Earth: tilt, day and night', subjects: ['Geography', 'Science'], levels: ['Class 6', 'Class 9'], build: AstronomyModels.earth),
  ];

  static ModelEntry? byId(String id) {
    for (final e in entries) {
      if (e.id == id) return e;
    }
    return null;
  }

  static List<String> get ids => [for (final e in entries) e.id];
}

/// Shows a catalogue model by id: a [SolidExplorer] for solids, a [ModelViewer] otherwise.
class ModelView extends StatefulWidget {
  const ModelView({super.key, required this.id});
  final String id;

  @override
  State<ModelView> createState() => _ModelViewState();
}

class _ModelViewState extends State<ModelView> {
  Model3D? _model;
  String? _builtFor;

  @override
  Widget build(BuildContext context) {
    final entry = ModelCatalogue.byId(widget.id);
    if (entry == null) {
      return KxEmptyState(icon: Icons.view_in_ar_outlined, message: 'There is no 3D model called "${widget.id}".');
    }
    if (entry.solid != null) return SolidExplorer(kind: entry.solid!);
    if (_builtFor != entry.id) {
      _model = entry.buildModel();
      _builtFor = entry.id;
    }
    return ModelViewer(model: _model!);
  }
}
