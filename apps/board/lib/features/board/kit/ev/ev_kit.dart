import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../chrome.dart';
import '../../layout/tools_drawer.dart';
import '../../panel/panel_host.dart';
import 'ev_editors.dart';
import 'ev_strings.dart';

/// Which part of the EV kit to show first.
enum EvSection { charging, flow, models }

/// The EV 3D models in the library, in the kit's order.
const evModels = ['ev_battery_pack', 'pmsm_motor', 'ev_drivetrain', 'induction_motor'];

/// Ready-made charging setups: (key, view, charger kW).
const evChargePresets = [
  ('l1', EvChargeView.ac, 3.3),
  ('l2', EvChargeView.ac, 7.4),
  ('ac22', EvChargeView.ac, 22.0),
  ('dc60', EvChargeView.dc, 60.0),
  ('dc150', EvChargeView.dc, 150.0),
];

bool isEvKit(KitKind k) => k == KitKind.evCharging || k == KitKind.evPowerFlow;

/// Opens an EV panel's editor; null when cancelled.
Future<KitElement?> editEvKit(BuildContext context, KitElement e) => showPanelDialog<KitElement>(
  context: context,
  builder: (_) => BoardChromeTheme(child: e.kind == KitKind.evCharging ? EvChargingEditorDialog(element: e) : EvFlowEditorDialog(element: e)),
);

KitElement evChargingPanel(EvChargeView view, double kw, Color accent) =>
    KitElement.sized(kind: KitKind.evCharging, data: EvChargingPanel(view: view, chargerKw: kw).toJson(), color: accent);

KitElement evFlowPanel(EvMode mode, Color accent) {
  var m = EvPowerFlow(mode: mode, speedKmh: mode == EvMode.charging || mode == EvMode.idle ? 0 : 60);
  if (mode == EvMode.regen) m = m.copyWith(torqueNm: 80);
  return KitElement.sized(kind: KitKind.evPowerFlow, data: m.toJson(), color: accent);
}

/// The EV technology kit (M.Tech / PG EV Technology): charging circuits (AC through the onboard
/// charger, DC fast charging) with the CC-CV curve and connectors, the power flow between
/// battery, inverter, motor and wheels in each mode, and the battery pack, traction motor and
/// drivetrain models. Panels go on the board as live KitElements; everything works offline.
class EvKitPanel extends StatelessWidget {
  const EvKitPanel({super.key, required this.wb, required this.accent, this.first = EvSection.charging, this.onOpenModel});

  final WhiteboardController wb;
  final Color accent;
  final EvSection first;

  /// Opens a 3D model (by its library id) beside the board.
  final ValueChanged<String>? onOpenModel;

  @override
  Widget build(BuildContext context) {
    final s = evStrings(context);
    Widget section(String t) => Padding(padding: const EdgeInsets.fromLTRB(4, Kx.s16, 4, Kx.s8), child: Text(t, style: context.text.titleSmall));
    Widget hint(String t) => Padding(padding: const EdgeInsets.fromLTRB(4, 0, 4, Kx.s8), child: Text(t, style: context.text.bodySmall));
    Widget item(String key, IconData icon, String label, VoidCallback? onTap, {IconData trailing = Icons.add}) => Card(
      margin: const EdgeInsets.only(bottom: Kx.s8),
      child: ListTile(key: Key('ev-$key'), leading: Icon(icon, color: accent), title: Text(label), trailing: Icon(trailing), onTap: onTap),
    );
    Future<void> put(KitElement k) async {
      final edited = await editEvKit(context, k);
      if (edited != null) wb.insert([edited]);
    }

    final parts = <EvSection, List<Widget>>{
      EvSection.charging: [
        section(s['chargeSection']),
        hint(s['chargeHint']),
        for (final (key, view, kw) in evChargePresets)
          item('charge-$key', view == EvChargeView.ac ? Icons.power_outlined : Icons.ev_station_outlined, s['preset.$key'], () => put(evChargingPanel(view, kw, accent))),
      ],
      EvSection.flow: [
        section(s['flowSection']),
        hint(s['flowHint']),
        for (final (mode, icon) in [(EvMode.driving, Icons.directions_car_outlined), (EvMode.regen, Icons.battery_charging_full), (EvMode.charging, Icons.ev_station_outlined), (EvMode.idle, Icons.local_parking)])
          item('flow-${mode.name}', icon, s['mode.${mode.name}'], () => put(evFlowPanel(mode, accent))),
      ],
      EvSection.models: [
        section(s['modelsSection']),
        hint(s['modelsHint']),
        for (final id in evModels)
          item('model-$id', Icons.view_in_ar_outlined, s['model.$id'], onOpenModel == null ? null : () => onOpenModel!(id), trailing: Icons.open_in_new),
      ],
    };
    final order = [first, ...EvSection.values.where((c) => c != first)];
    return ListView(key: const Key('ev-kit'), padding: const EdgeInsets.all(Kx.s12), children: [for (final c in order) ...parts[c]!]);
  }
}

/// The kit's tiles in the tools drawer: charging circuits and power flow.
List<DrawerTool> evDrawerTools(
  BuildContext context, {
  required WhiteboardController wb,
  required Color accent,
  required Color color,
  required void Function(String title, IconData icon, WidgetBuilder builder) openPage,
  required void Function(VoidCallback) run,
  ValueChanged<String>? onOpenModel,
}) {
  final s = evStrings(context);
  VoidCallback open(EvSection first) =>
      () => run(() => openPage(s['kitTitle'], Icons.electric_car_outlined, (_) => EvKitPanel(key: ValueKey(first), wb: wb, accent: accent, first: first, onOpenModel: onOpenModel)));
  return [
    DrawerTool('ev-charging', Icons.ev_station_outlined, s['chargeTool'], const [ToolGroup.science], color, open(EvSection.charging)),
    DrawerTool('ev-power-flow', Icons.electric_car_outlined, s['flowTool'], const [ToolGroup.science], color, open(EvSection.flow)),
  ];
}
