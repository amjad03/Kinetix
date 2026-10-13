import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../../l10n/l10n.dart';
import '../builders.dart';
import '../subject_tools.dart' show circuitName;
import 'eee_editors.dart';
import 'eee_samples.dart';
import 'eee_strings.dart';
import 'eee_symbols.dart';

/// Which part of the electrical kit to show first.
enum EeeSection { symbols, rlc, threePhase, singleLine, waveform, models }

/// The electrical 3D models in the library: the kit's name for each and the model it opens.
const eeeModels = {
  'modelDcMachine': 'dc_machine',
  'modelInduction': 'induction_motor',
  'modelTransformer1': 'transformer_1ph',
  'modelTransformer3': 'transformer_3ph',
  'modelAlternator': 'alternator',
  'modelSimpleMotor': 'electric_motor',
  'modelSimpleGenerator': 'ac_generator',
};

/// The electrical and electronics engineering kit (B.E. EEE, M.Tech Power Systems; RLC, phasors
/// and waveforms also for Class 12 physics): IEC circuit symbols, the RLC and phasor panel,
/// three-phase phasors, the single-line diagram with per unit and fault level, the waveform
/// generator and the machine models. Every panel goes on the board as a live KitElement that
/// opens again in its editor, saves with the page and works offline.
class EeeKitPanel extends StatelessWidget {
  const EeeKitPanel({super.key, required this.wb, required this.accent, required this.ink, this.first = EeeSection.rlc, this.onOpenModel});

  final WhiteboardController wb;
  final Color accent;

  /// The board's ink, for the circuit symbols.
  final Color ink;
  final EeeSection first;

  /// Opens a 3D model (by its library id) beside the board.
  final ValueChanged<String>? onOpenModel;

  @override
  Widget build(BuildContext context) {
    final s = eeeStrings(context);
    final l = context.l10n;
    Widget section(String t) => Padding(padding: const EdgeInsets.fromLTRB(4, Kx.s16, 4, Kx.s8), child: Text(t, style: context.text.titleSmall));
    Widget item(String key, IconData icon, String label, VoidCallback? onTap, {IconData trailing = Icons.add}) => Card(
      margin: const EdgeInsets.only(bottom: Kx.s8),
      child: ListTile(key: Key('eee-$key'), leading: Icon(icon, color: accent), title: Text(label), trailing: Icon(trailing), onTap: onTap),
    );
    Future<void> live(KitKind kind, Map<String, Object?> data) async {
      final k = await editEeeKit(context, eeePanel(kind, data, accent));
      if (k != null) wb.insert([k]);
    }

    final parts = <EeeSection, List<Widget>>{
      EeeSection.symbols: [
        section(s['symbols']),
        Padding(padding: const EdgeInsets.fromLTRB(4, 0, 4, Kx.s8), child: Text(s['symbolsHint'], style: context.text.bodySmall)),
        Wrap(
          spacing: Kx.s8,
          runSpacing: Kx.s8,
          children: [
            for (final c in Circuit.values) ActionChip(key: Key('eee-sym-${c.name}'), label: Text(circuitName(l, c)), onPressed: () => wb.insert(circuitSymbol(c, ink))),
            for (final c in EeeSymbol.values) ActionChip(key: Key('eee-sym-${c.name}'), label: Text(s['sym.${c.name}']), onPressed: () => wb.insert(eeeSymbol(c, ink))),
          ],
        ),
      ],
      EeeSection.rlc: [
        section(s['rlcSection']),
        for (final (r, icon) in [(RlcSample.series, Icons.linear_scale), (RlcSample.parallel, Icons.view_column_outlined), (RlcSample.resonance, Icons.vertical_align_center), (RlcSample.rc, Icons.battery_charging_full), (RlcSample.rl, Icons.cable)])
          item('rlc-${r.name}', icon, s['rlc.${r.name}'], () => live(KitKind.rlc, sampleRlc(r).toJson())),
      ],
      EeeSection.threePhase: [
        section(s['threeSection']),
        item('three-star', Icons.call_split, s['threeStar'], () => live(KitKind.threePhase, sampleThreePhase(ThreePhaseConnection.star).toJson())),
        item('three-delta', Icons.change_history, s['threeDelta'], () => live(KitKind.threePhase, sampleThreePhase(ThreePhaseConnection.delta).toJson())),
      ],
      EeeSection.singleLine: [
        section(s['sldSection']),
        for (final (d, icon) in [(SldSample.radial, Icons.electrical_services), (SldSample.parallelGenerators, Icons.device_hub), (SldSample.blank, Icons.crop_landscape)])
          item('sld-${d.name}', icon, s['sld.${d.name}'], () => live(KitKind.singleLine, sampleSld(d).toJson())),
      ],
      EeeSection.waveform: [
        section(s['waveSection']),
        for (final w in WaveSample.values) item('wave-${w.name}', Icons.waves, s['wave.${w.name}'], () => live(KitKind.waveform, sampleWave(w).toJson())),
      ],
      EeeSection.models: [
        section(s['models']),
        Padding(padding: const EdgeInsets.fromLTRB(4, 0, 4, Kx.s8), child: Text(s['modelsHint'], style: context.text.bodySmall)),
        for (final MapEntry(key: m, value: id) in eeeModels.entries)
          item('model-$m', Icons.view_in_ar_outlined, s[m], onOpenModel == null ? null : () => onOpenModel!(id), trailing: Icons.open_in_new),
      ],
    };
    final order = [first, ...EeeSection.values.where((c) => c != first)];
    return ListView(key: const Key('eee-kit'), padding: const EdgeInsets.all(Kx.s12), children: [for (final c in order) ...parts[c]!]);
  }
}
