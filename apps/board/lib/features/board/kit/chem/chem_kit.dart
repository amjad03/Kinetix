import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../chrome.dart';
import '../../layout/tools_drawer.dart';
import '../../panel/panel_host.dart';
import 'chem_editors.dart';
import 'chem_strings.dart';

/// Which part of the chemical engineering kit to show first.
enum ChemSection { pfd, unitOps, models }

/// The chemical engineering 3D models in the library, in the kit's order.
const chemModels = ['molecules', 'organic_molecules', 'crystal_lattices', 'cstr_reactor', 'pfr_reactor', 'packed_bed_reactor', 'shell_tube_hx', 'distillation_column'];

bool isChemKit(KitKind k) => k == KitKind.pfd || k == KitKind.unitOp;

/// Opens a chemical engineering panel's editor (the PFD editor or the unit operations); null
/// when cancelled.
Future<KitElement?> editChemKit(BuildContext context, KitElement e) => showPanelDialog<KitElement>(
  context: context,
  builder: (_) => BoardChromeTheme(child: e.kind == KitKind.pfd ? PfdEditorDialog(element: e) : UnitOpEditorDialog(element: e)),
);

KitElement pfdPanel(PfdSample s, Color accent) => KitElement.sized(kind: KitKind.pfd, data: PfdDiagram.sample(s).toJson(), color: accent);

KitElement unitOpPanel(UnitOp op, Color accent) => KitElement.sized(kind: KitKind.unitOp, data: UnitOpPanel(op: op).toJson(), color: accent);

/// The chemical engineering kit (B.E. Chemical): process flow diagrams with ISA/ISO-style
/// symbols and a stream table, the unit operations worked out live (McCabe–Thiele, heat
/// exchanger LMTD, CSTR vs PFR) and the process equipment and molecule models. Panels go on the
/// board as live KitElements that open again in their editors; everything works offline.
class ChemKitPanel extends StatelessWidget {
  const ChemKitPanel({super.key, required this.wb, required this.accent, this.first = ChemSection.pfd, this.onOpenModel});

  final WhiteboardController wb;
  final Color accent;
  final ChemSection first;

  /// Opens a 3D model (by its library id) beside the board.
  final ValueChanged<String>? onOpenModel;

  @override
  Widget build(BuildContext context) {
    final s = chemStrings(context);
    Widget section(String t) => Padding(padding: const EdgeInsets.fromLTRB(4, Kx.s16, 4, Kx.s8), child: Text(t, style: context.text.titleSmall));
    Widget hint(String t) => Padding(padding: const EdgeInsets.fromLTRB(4, 0, 4, Kx.s8), child: Text(t, style: context.text.bodySmall));
    Widget item(String key, IconData icon, String label, VoidCallback? onTap, {IconData trailing = Icons.add}) => Card(
      margin: const EdgeInsets.only(bottom: Kx.s8),
      child: ListTile(key: Key('chem-$key'), leading: Icon(icon, color: accent), title: Text(label), trailing: Icon(trailing), onTap: onTap),
    );
    Future<void> put(KitElement k) async {
      final edited = await editChemKit(context, k);
      if (edited != null) wb.insert([edited]);
    }

    final parts = <ChemSection, List<Widget>>{
      ChemSection.pfd: [
        section(s['pfdSection']),
        hint(s['pfdHint']),
        for (final (p, icon) in [(PfdSample.distillation, Icons.view_column_outlined), (PfdSample.ammonia, Icons.autorenew), (PfdSample.blank, Icons.crop_landscape)])
          item('pfd-${p.name}', icon, s['sample.${p.name}'], () => put(pfdPanel(p, accent))),
      ],
      ChemSection.unitOps: [
        section(s['unitSection']),
        hint(s['unitHint']),
        for (final (op, icon) in [(UnitOp.mccabeThiele, Icons.stairs_outlined), (UnitOp.heatExchanger, Icons.thermostat_outlined), (UnitOp.reactors, Icons.science_outlined)])
          item('op-${op.name}', icon, s['op.${op.name}'], () => put(unitOpPanel(op, accent))),
      ],
      ChemSection.models: [
        section(s['modelsSection']),
        hint(s['modelsHint']),
        for (final id in chemModels)
          item('model-$id', Icons.view_in_ar_outlined, s['model.$id'], onOpenModel == null ? null : () => onOpenModel!(id), trailing: Icons.open_in_new),
      ],
    };
    final order = [first, ...ChemSection.values.where((c) => c != first)];
    return ListView(key: const Key('chem-kit'), padding: const EdgeInsets.all(Kx.s12), children: [for (final c in order) ...parts[c]!]);
  }
}

/// The kit's tiles in the tools drawer: PFD symbols and unit operations.
List<DrawerTool> chemDrawerTools(
  BuildContext context, {
  required WhiteboardController wb,
  required Color accent,
  required Color color,
  required void Function(String title, IconData icon, WidgetBuilder builder) openPage,
  required void Function(VoidCallback) run,
  ValueChanged<String>? onOpenModel,
}) {
  final s = chemStrings(context);
  VoidCallback open(ChemSection first) =>
      () => run(() => openPage(s['kitTitle'], Icons.science_outlined, (_) => ChemKitPanel(key: ValueKey(first), wb: wb, accent: accent, first: first, onOpenModel: onOpenModel)));
  return [
    DrawerTool('pfd-kit', Icons.account_tree_outlined, s['pfdTool'], const [ToolGroup.science], color, open(ChemSection.pfd)),
    DrawerTool('unit-ops', Icons.stairs_outlined, s['unitOpsTool'], const [ToolGroup.science], color, open(ChemSection.unitOps)),
  ];
}
