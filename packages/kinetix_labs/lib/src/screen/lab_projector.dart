import 'package:flutter/material.dart';

import '../benches/registry.dart';
import '../core/bench.dart';
import '../core/i18n.dart';

/// The students' view of an open virtual lab, rebuilt from the state the
/// teacher's screen sends ([LabMirror]): the experiment large, with the
/// step, the meter readings and the latest readings beside it.
class LabProjectorView extends StatelessWidget {
  final Map<String, dynamic> state;
  const LabProjectorView({super.key, required this.state});

  static const _accent = Color(0xFFE8A33D);

  @override
  Widget build(BuildContext context) {
    final bench = labBenches[state['b']];
    final params = (state['p'] as Map?)?.cast<String, dynamic>() ?? const {};
    final cols = [for (final c in (state['cols'] as List? ?? const [])) '$c'];
    final rows = [
      for (final r in (state['rows'] as List? ?? const [])) [for (final c in r as List) '$c'],
    ];
    final live = [for (final l in (state['live'] as List? ?? const [])) '$l'];
    final step = state['step'] as String?;
    final result = state['result'] as String?;
    return ColoredBox(
      color: const Color(0xFF16191E),
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Expanded(
          flex: 62,
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(18),
              child: bench == null ? const ColoredBox(color: LabInk.paper) : LabBenchView(key: const ValueKey('projector-lab-bench'), bench: bench, params: params),
            ),
          ),
        ),
        Expanded(
          flex: 38,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(0, 22, 22, 22),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('${state['title'] ?? ''}', style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w600, color: Colors.white, height: 1.15)),
              const SizedBox(height: 14),
              if (step != null)
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: const Color(0xFF242930), borderRadius: BorderRadius.circular(14), border: Border.all(color: _accent)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(tr('Step {n} of {m}', {'n': state['n'], 'm': state['of']}), style: const TextStyle(color: _accent, fontSize: 18, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 6),
                    Text(step, style: const TextStyle(color: Colors.white, fontSize: 22, height: 1.35)),
                  ]),
                ),
              const SizedBox(height: 12),
              Wrap(spacing: 10, runSpacing: 8, children: [
                for (final l in live)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(color: const Color(0xFF2E343C), borderRadius: BorderRadius.circular(10)),
                    child: Text(l, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700)),
                  ),
              ]),
              const SizedBox(height: 12),
              if (rows.isNotEmpty)
                Expanded(
                  child: SingleChildScrollView(
                    child: Table(
                      border: TableBorder.all(color: const Color(0xFF3A4048)),
                      defaultVerticalAlignment: TableCellVerticalAlignment.middle,
                      children: [
                        TableRow(decoration: const BoxDecoration(color: Color(0xFF2E343C)), children: [for (final c in cols) _cell(c, bold: true)]),
                        for (final r in rows) TableRow(children: [for (var k = 0; k < cols.length; k++) _cell(k < r.length ? r[k] : '')]),
                      ],
                    ),
                  ),
                )
              else
                const Spacer(),
              if (result != null && result.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(result, style: const TextStyle(color: Color(0xFFBFE6C9), fontSize: 19, height: 1.35)),
              ],
            ]),
          ),
        ),
      ]),
    );
  }

  Widget _cell(String text, {bool bold = false}) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Text(text, style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: bold ? FontWeight.w600 : FontWeight.w500)),
      );
}
