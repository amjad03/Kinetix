import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'mech_editors.dart';
import 'mech_samples.dart';
import 'mech_strings.dart';

/// Which part of the mechanical kit to show first.
enum MechSection { drawing, thermo, fbd, models }

/// The mechanical 3D models in the library: the kit's name for each and the model it opens.
const mechModels = {
  'modelEngine': 'engine',
  'modelCam': 'cam_follower',
  'modelGears': 'gears',
  'modelGearTypes': 'gear_types',
  'modelMachines': 'simple_machines',
};

/// The mechanical engineering kit (B.E. Mechanical; FBDs also for Class 11–12 physics): the
/// engineering drawing sheet, P-V and T-s cycle charts, free-body diagrams and the machine
/// models. Every panel goes on the board as a live KitElement that opens again in its editor,
/// saves with the page and works offline.
class MechKitPanel extends StatelessWidget {
  const MechKitPanel({super.key, required this.wb, required this.accent, this.first = MechSection.drawing, this.onOpenModel, this.onPaper});

  final WhiteboardController wb;
  final Color accent;
  final MechSection first;

  /// Opens a 3D model (by its library id) beside the board.
  final ValueChanged<String>? onOpenModel;

  /// Sets this page's paper (isometric or graph).
  final ValueChanged<BoardBackground>? onPaper;

  @override
  Widget build(BuildContext context) {
    final s = mechStrings(context);
    Widget section(String t) => Padding(padding: const EdgeInsets.fromLTRB(4, Kx.s16, 4, Kx.s8), child: Text(t, style: context.text.titleSmall));
    Widget item(String key, IconData icon, String label, VoidCallback? onTap, {IconData trailing = Icons.add}) => Card(
      margin: const EdgeInsets.only(bottom: Kx.s8),
      child: ListTile(key: Key('mech-$key'), leading: Icon(icon, color: accent), title: Text(label), trailing: Icon(trailing), onTap: onTap),
    );
    Future<void> live(KitKind kind, Map<String, Object?> data) async {
      final k = await editMechKit(context, mechPanel(kind, data, accent));
      if (k != null) wb.insert([k]);
    }

    final parts = <MechSection, List<Widget>>{
      MechSection.drawing: [
        section(s['drawing']),
        item('sheet-first', Icons.grid_4x4, s['sheetFirst'], () => live(KitKind.drawingSheet, sampleSheet(DrawingProjection.first).toJson())),
        item('sheet-third', Icons.grid_4x4, s['sheetThird'], () => live(KitKind.drawingSheet, sampleSheet(DrawingProjection.third).toJson())),
        item('sheet-blank', Icons.crop_landscape, s['sheetBlank'], () => live(KitKind.drawingSheet, blankSheet.toJson())),
        item('sheet-iso', Icons.change_history, s['sheetIso'], () => live(KitKind.drawingSheet, isometricSheet.toJson())),
        if (onPaper != null) ...[
          item('paper-iso', Icons.texture, s['paperIso'], () => onPaper!(BoardBackground.isometric), trailing: Icons.wallpaper),
          item('paper-graph', Icons.grid_on, s['paperGraph'], () => onPaper!(BoardBackground.graph), trailing: Icons.wallpaper),
        ],
      ],
      MechSection.thermo: [
        section(s['thermo']),
        for (final k in CycleKind.values) item('cycle-${k.name}', Icons.area_chart_outlined, s[k.name], () => live(KitKind.thermoCycle, sampleCycle(k).toJson())),
      ],
      MechSection.fbd: [
        section(s['fbd']),
        for (final (f, label, icon) in [
          (FbdSample.incline, s['fbdIncline'], Icons.signal_cellular_null),
          (FbdSample.block, s['fbdBlock'], Icons.crop_square),
          (FbdSample.beam, s['fbdBeam'], Icons.horizontal_rule),
          (FbdSample.sphere, s['fbdSphere'], Icons.circle_outlined),
          (FbdSample.pulley, s['fbdPulley'], Icons.settings_outlined),
          (FbdSample.blank, s['fbdBlank'], Icons.open_with),
        ])
          item('fbd-${f.name}', icon, label, () => live(KitKind.fbd, sampleFbd(f).toJson())),
      ],
      MechSection.models: [
        section(s['models']),
        Padding(padding: const EdgeInsets.fromLTRB(4, 0, 4, Kx.s8), child: Text(s['modelsHint'], style: context.text.bodySmall)),
        for (final MapEntry(key: m, value: id) in mechModels.entries)
          item('model-$m', Icons.view_in_ar_outlined, s[m], onOpenModel == null ? null : () => onOpenModel!(id), trailing: Icons.open_in_new),
      ],
    };
    final order = [first, ...MechSection.values.where((c) => c != first)];
    return ListView(key: const Key('mech-kit'), padding: const EdgeInsets.all(Kx.s12), children: [for (final c in order) ...parts[c]!]);
  }
}
