import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../../core/board_controller.dart';
import 'civil_editors.dart';
import 'civil_samples.dart';
import 'civil_strings.dart';
import 'is_codes.dart';

/// Which part of the civil kit to show first.
enum CivilSection { beams, trusses, survey, codes, models }

/// The civil 3D models in the library (packages/kinetix_3d, built in code by
/// tool/models/recipes): the kit's name for each, and the model it opens in the 3D viewer.
const civilModels = {
  'rccFrame': 'rcc_frame',
  'trussBridge': 'truss_bridge',
  'archBridge': 'arch_bridge',
  'suspension': 'suspension_bridge',
  'cableStayed': 'cable_stayed_bridge',
  'footings': 'footings',
};

/// The civil engineering kit (B.E. Civil, M.Tech Structural): live beam and truss solvers, the
/// survey and levelling pad, IS code tables and the civil 3D models. Every panel goes on
/// the board as a live KitElement that opens again in its editor, saves with the page and works
/// offline.
class CivilKitPanel extends StatelessWidget {
  const CivilKitPanel({super.key, required this.wb, required this.accent, required this.ink, this.board, this.first = CivilSection.beams, this.onOpenModel});

  final WhiteboardController wb;
  final Color accent, ink;
  final BoardController? board;
  final CivilSection first;

  /// Opens a 3D model (by its library id) beside the board.
  final ValueChanged<String>? onOpenModel;

  @override
  Widget build(BuildContext context) {
    final s = civilStrings(context);
    Widget section(String t) => Padding(padding: const EdgeInsets.fromLTRB(4, Kx.s16, 4, Kx.s8), child: Text(t, style: context.text.titleSmall));
    Widget item(String key, IconData icon, String label, VoidCallback onTap, {String? subtitle}) => Card(
      margin: const EdgeInsets.only(bottom: Kx.s8),
      child: ListTile(
        key: Key('civil-$key'),
        leading: Icon(icon, color: accent),
        title: Text(label),
        subtitle: subtitle == null ? null : Text(subtitle),
        trailing: const Icon(Icons.add),
        onTap: onTap,
      ),
    );
    Future<void> live(KitKind kind, Map<String, Object?> data) async {
      final k = await editCivilKit(context, civilPanel(kind, data, accent));
      if (k != null) wb.insert([k]);
    }

    final parts = <CivilSection, List<Widget>>{
      CivilSection.beams: [
        section(s['beams']),
        for (final (t, label, icon) in [
          (BeamType.simplySupported, s['ssBeam'], Icons.horizontal_rule),
          (BeamType.cantilever, s['cantilever'], Icons.border_left),
          (BeamType.overhanging, s['overhang'], Icons.straighten),
          (BeamType.propped, s['propped'], Icons.vertical_align_bottom),
          (BeamType.fixed, s['fixedBeam'], Icons.border_vertical),
          (BeamType.custom, s['blankBeam'], Icons.add_box_outlined),
        ])
          item('beam-${t.name}', icon, label, () => live(KitKind.beam, sampleBeam(t).toJson())),
      ],
      CivilSection.trusses: [
        section(s['trusses']),
        item('truss-pratt', Icons.change_history, s['prattTruss'], () => live(KitKind.truss, prattTruss.toJson())),
        item('truss-simple', Icons.change_history_outlined, s['simpleTruss'], () => live(KitKind.truss, simpleTruss.toJson())),
        item('truss-blank', Icons.add_box_outlined, s['blankTruss'], () => live(KitKind.truss, blankTruss.toJson())),
      ],
      CivilSection.survey: [
        section(s['survey']),
        item('level-rf', Icons.table_rows_outlined, s['levelRf'], () => live(KitKind.levelBook, sampleLevelBook(LevelMethod.riseFall).toJson())),
        item('level-hi', Icons.table_rows_outlined, s['levelHi'], () => live(KitKind.levelBook, sampleLevelBook(LevelMethod.heightOfInstrument).toJson())),
        item('traverse', Icons.explore_outlined, s['traverse'], () => live(KitKind.traverse, sampleTraverse.toJson())),
        item('contour', Icons.terrain_outlined, s['contour'], () => live(KitKind.contour, sampleContours().toJson())),
      ],
      CivilSection.codes: [
        section(s['codes']),
        item('is-codes', Icons.menu_book_outlined, s['codes'], () => openIsCodes(context, wb, accent, ink), subtitle: s['codesHint']),
      ],
      CivilSection.models: [
        section(s['models']),
        Padding(padding: const EdgeInsets.fromLTRB(4, 0, 4, Kx.s8), child: Text(s['modelsHint'], style: context.text.bodySmall)),
        for (final MapEntry(key: m, value: id) in civilModels.entries)
          Card(
            margin: const EdgeInsets.only(bottom: Kx.s8),
            child: ListTile(
              key: Key('civil-model-$m'),
              leading: Icon(Icons.view_in_ar_outlined, color: accent),
              title: Text(s[m]),
              trailing: const Icon(Icons.open_in_new),
              onTap: onOpenModel == null ? null : () => onOpenModel!(id),
            ),
          ),
      ],
    };
    final order = [first, ...CivilSection.values.where((c) => c != first)];
    return ListView(key: const Key('civil-kit'), padding: const EdgeInsets.all(Kx.s12), children: [for (final c in order) ...parts[c]!]);
  }
}
