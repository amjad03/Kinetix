import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'ece_editors.dart';
import 'ece_samples.dart';
import 'ece_strings.dart';

/// Which part of the electronics kit to show first.
enum EceSection { logic, timing, signal, bode, pins }

/// The electronics and communication kit (B.E. ECE: digital electronics, signals and systems,
/// communication, DSP, control systems, microcontrollers, VLSI): the logic gates builder and its
/// ready circuits, timing diagrams, the signal and spectrum plotter, Bode plots and
/// microcontroller pin diagrams. Every panel goes on the board as a live KitElement that opens
/// again in its editor, saves with the page and works offline.
class EceKitPanel extends StatelessWidget {
  const EceKitPanel({super.key, required this.wb, required this.accent, this.first = EceSection.logic, this.onOpenLab});

  final WhiteboardController wb;
  final Color accent;
  final EceSection first;

  /// Opens the logic gates builder beside the board.
  final VoidCallback? onOpenLab;

  @override
  Widget build(BuildContext context) {
    final s = eceStrings(context);
    Widget section(String t) => Padding(padding: const EdgeInsets.fromLTRB(4, Kx.s16, 4, Kx.s8), child: Text(t, style: context.text.titleSmall));
    Widget hint(String t) => Padding(padding: const EdgeInsets.fromLTRB(4, 0, 4, Kx.s8), child: Text(t, style: context.text.bodySmall));
    Widget item(String key, IconData icon, String label, VoidCallback? onTap, {IconData trailing = Icons.add}) => Card(
      margin: const EdgeInsets.only(bottom: Kx.s8),
      child: ListTile(key: Key('ece-$key'), leading: Icon(icon, color: accent), title: Text(label), trailing: Icon(trailing), onTap: onTap),
    );
    Future<void> live(KitKind kind, Map<String, Object?> data) async {
      final k = await editEceKit(context, ecePanel(kind, data, accent));
      if (k != null) wb.insert([k]);
    }

    final parts = <EceSection, List<Widget>>{
      EceSection.logic: [
        section(s['logicSection']),
        hint(s['logicHint']),
        item('open-lab', Icons.memory_outlined, s['openLab'], onOpenLab, trailing: Icons.open_in_new),
        Wrap(
          spacing: Kx.s8,
          runSpacing: Kx.s8,
          children: [
            for (final p in LogicPreset.values)
              ActionChip(key: Key('ece-preset-${p.name}'), label: Text(logicPresetName(p)), onPressed: () => live(KitKind.logicCircuit, logicPreset(p).toJson())),
          ],
        ),
      ],
      EceSection.timing: [
        section(s['timingSection']),
        hint(s['timingHint']),
        for (final t in TimingSample.values) item('timing-${t.name}', Icons.stacked_line_chart, s['timing.${t.name}'], () => live(KitKind.timing, sampleTiming(t).toJson())),
      ],
      EceSection.signal: [
        section(s['signalSection']),
        for (final x in SignalSample.values) item('signal-${x.name}', Icons.graphic_eq, s['signal.${x.name}'], () => live(KitKind.signal, sampleSignal(x).toJson())),
      ],
      EceSection.bode: [
        section(s['bodeSection']),
        for (final b in BodeSample.values) item('bode-${b.name}', Icons.show_chart, s['bode.${b.name}'], () => live(KitKind.bode, sampleBode(b).toJson())),
      ],
      EceSection.pins: [
        section(s['pinsSection']),
        hint(s['pinsHint']),
        for (final c in mcuChips) item('pins-${c.id}', Icons.memory, '${c.name} · ${c.package}', () => live(KitKind.pinout, McuPinout(chip: c.id).toJson())),
        hint(s['verify']),
      ],
    };
    final order = [first, ...EceSection.values.where((c) => c != first)];
    return ListView(key: const Key('ece-kit'), padding: const EdgeInsets.all(Kx.s12), children: [for (final c in order) ...parts[c]!]);
  }
}
