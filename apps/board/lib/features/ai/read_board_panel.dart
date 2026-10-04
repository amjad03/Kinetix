import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../board/chrome.dart';
import 'ai_controller.dart';
import 'ai_widgets.dart';

const readAccent = Color(0xFFFCAD70);

/// Read board: KINETIX AI reads the handwriting on the open page, so the teacher can copy it,
/// or ask about it.
class ReadBoardPanel extends StatelessWidget {
  const ReadBoardPanel({super.key, required this.ai, this.onBack});

  final AiController ai;
  final VoidCallback? onBack;

  void _read(BuildContext context) {
    if (!ai.canUseAi) {
      showBoardMessage(context, 'Sign in with the Teacher app to read the board with KINETIX AI.');
      return;
    }
    ai.readBoard();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AiPanelPage(
      ai: ai,
      icon: Icons.document_scanner_outlined,
      title: 'Read board',
      accent: readAccent,
      onBack: onBack,
      child: ListenableBuilder(
        listenable: Listenable.merge([ai, ai.reading]),
        builder: (context, _) {
          final task = ai.reading;
          final r = task.value;
          return ListView(
            padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s8, Kx.s24, Kx.s24),
            children: [
              if (!ai.canUseAi) ...[const AiSignInNotice(), const SizedBox(height: Kx.s16)],
              Text(
                'Turns the handwriting on this page into text you can copy, check or ask about. Write clearly; one page at a time.',
                style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
              ),
              const SizedBox(height: Kx.s16),
              Align(
                alignment: Alignment.centerLeft,
                child: FilledButton.icon(
                  key: const Key('read-board'),
                  onPressed: task.loading ? null : () => _read(context),
                  icon: const Icon(Icons.document_scanner_outlined),
                  label: Text(r == null ? 'Read this page' : 'Read again'),
                ),
              ),
              if (task.loading) const AiLoading(label: 'Reading the board…'),
              if (task.error != null) ...[const SizedBox(height: Kx.s16), AiError(message: task.error!, onRetry: () => _read(context))],
              if (r != null && !task.loading) ...[
                const SizedBox(height: Kx.s20),
                if (r.meta.preview) ...[AiNotice.preview(), const SizedBox(height: Kx.s12)],
                Container(
                  key: const Key('reading'),
                  padding: const EdgeInsets.all(Kx.s20),
                  decoration: BoxDecoration(color: c.surfaceContainer, borderRadius: BorderRadius.circular(Kx.rLg), border: Border.all(color: c.outlineVariant)),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SelectableText(
                        r.result.text.isEmpty ? 'No writing found on this page.' : r.result.text,
                        style: TextStyle(fontSize: ClassType.lead, height: 1.45, color: c.onSurface),
                      ),
                      if (r.result.math.isNotEmpty) ...[
                        const AiSectionLabel('Maths found'),
                        for (final m in r.result.math)
                          Padding(
                            padding: const EdgeInsets.only(bottom: Kx.s8),
                            child: SelectableText(m, style: TextStyle(fontFamily: 'monospace', fontSize: ClassType.small, color: c.onSurface)),
                          ),
                      ],
                      const SizedBox(height: Kx.s16),
                      Wrap(
                        spacing: Kx.s8,
                        runSpacing: Kx.s8,
                        children: [
                          OutlinedButton.icon(
                            onPressed: r.result.text.isEmpty
                                ? null
                                : () {
                                    Clipboard.setData(ClipboardData(text: r.result.text));
                                    showBoardMessage(context, 'Copied');
                                  },
                            icon: const Icon(Icons.copy),
                            label: const Text('Copy text'),
                          ),
                          FilledButton.tonalIcon(
                            key: const Key('reading-ask'),
                            onPressed: r.result.text.trim().length < 2
                                ? null
                                : () {
                                    ai.open(AiView.home);
                                    ai.ask('Explain this from the board: ${r.result.text.trim()}');
                                  },
                            icon: const Icon(Icons.auto_awesome),
                            label: const Text('Ask KINETIX AI about this'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}
