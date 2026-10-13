
import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../layout/tools_drawer.dart';
import 'aiml_strings.dart';
import 'digit_demo.dart';
import 'ml_datasets.dart';
import 'ml_playground.dart';
import 'nn_editor.dart';

/// Which part of the AI kit to show first.
enum AimlSection { nn, playground, demo }

bool isAimlKit(KitKind k) => k == KitKind.nnDiagram || k == KitKind.mlPlot;

/// Opens an AI panel's editor (the network builder or the playground); null when cancelled.
Future<KitElement?> editAimlKit(BuildContext context, KitElement e) => e.kind == KitKind.mlPlot ? openMlPlayground(context, e) : editNnDiagram(context, e);

/// The AI and machine learning kit (B.E. AI & ML, Class 11–12 computer science): neural network
/// diagrams with their shapes, parameters and forward pass; the ML playground (regression,
/// classification and clustering trained live on the board); and the digit recogniser, a model
/// running on this board that a school AI box can take over later. Everything runs offline in
/// Dart; the panels go on the board as live KitElements that open again in their editors.
class AimlKitPanel extends StatelessWidget {
  const AimlKitPanel({super.key, required this.wb, required this.accent, this.first = AimlSection.nn});

  final WhiteboardController wb;
  final Color accent;
  final AimlSection first;

  @override
  Widget build(BuildContext context) {
    final s = aimlStrings(context);
    Widget section(String t) => Padding(padding: const EdgeInsets.fromLTRB(4, Kx.s16, 4, Kx.s8), child: Text(t, style: context.text.titleSmall));
    Widget hint(String t) => Padding(padding: const EdgeInsets.fromLTRB(4, 0, 4, Kx.s8), child: Text(t, style: context.text.bodySmall));
    Widget item(String key, IconData icon, String label, VoidCallback onTap) => Card(
      margin: const EdgeInsets.only(bottom: Kx.s8),
      child: ListTile(key: Key('aiml-$key'), leading: Icon(icon, color: accent), title: Text(label), trailing: const Icon(Icons.add), onTap: onTap),
    );
    Future<void> put(Future<KitElement?> f) async {
      final k = await f;
      if (k != null) wb.insert([k]);
    }

    final parts = <AimlSection, List<Widget>>{
      AimlSection.nn: [
        section(s['nnSection']),
        hint(s['nnHint']),
        Wrap(
          spacing: Kx.s8,
          runSpacing: Kx.s8,
          children: [
            for (final p in NnPreset.values)
              ActionChip(
                key: Key('aiml-preset-${p.name}'),
                avatar: Icon(Icons.hub_outlined, size: 18, color: accent),
                label: Text(s['preset.${p.name}']),
                onPressed: () => put(editNnDiagram(context, nnPanel(NnModel.preset(p), accent))),
              ),
            ActionChip(key: const Key('aiml-nn-new'), avatar: Icon(Icons.add, size: 18, color: accent), label: Text(s['newNet']), onPressed: () => put(editNnDiagram(context, nnPanel(blankNn(), accent)))),
          ],
        ),
      ],
      AimlSection.playground: [
        section(s['playSection']),
        hint(s['playHint']),
        for (final d in MlDataset.values) item('data-${d.name}', Icons.scatter_plot_outlined, s['data.${d.name}'], () => put(openMlPlayground(context, mlPanel(d, accent)))),
      ],
      AimlSection.demo: [
        section(s['demoSection']),
        hint(s['demoHint']),
        item('digit-demo', Icons.draw_outlined, s['digitDemo'], () => put(openDigitDemo(context, accent: accent))),
      ],
    };
    final order = [first, ...AimlSection.values.where((c) => c != first)];
    return ListView(key: const Key('aiml-kit'), padding: const EdgeInsets.all(Kx.s12), children: [for (final c in order) ...parts[c]!]);
  }
}

/// The kit's tiles in the tools drawer: the network builder, the playground and the AI demo.
List<DrawerTool> aimlDrawerTools(
  BuildContext context, {
  required WhiteboardController wb,
  required Color accent,
  required Color color,
  required void Function(String title, IconData icon, WidgetBuilder builder) openPage,
  required void Function(VoidCallback) run,
}) {
  final s = aimlStrings(context);
  VoidCallback open(AimlSection first) => () => run(() => openPage(s['kitTitle'], Icons.psychology_outlined, (_) => AimlKitPanel(key: ValueKey(first), wb: wb, accent: accent, first: first)));
  return [
    DrawerTool('nn-builder', Icons.hub_outlined, s['nnTool'], const [ToolGroup.cs, ToolGroup.maths], color, open(AimlSection.nn)),
    DrawerTool('ml-playground', Icons.scatter_plot_outlined, s['playTool'], const [ToolGroup.cs, ToolGroup.maths], color, open(AimlSection.playground)),
    DrawerTool('ai-box-demo', Icons.psychology_outlined, s['demoTool'], const [ToolGroup.cs], color, open(AimlSection.demo)),
  ];
}
