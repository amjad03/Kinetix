import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';

/// "An update from KINETIX AI": a short note about the child, written from their own marks, attendance and homework.
/// It is asked for on demand and says plainly that it is a machine's summary and the class teacher knows best.
class AiUpdateCard extends StatefulWidget {
  const AiUpdateCard({super.key, required this.api, required this.child});

  final ParentApi api;
  final Child child;

  @override
  State<AiUpdateCard> createState() => _AiUpdateCardState();
}

class _AiUpdateCardState extends State<AiUpdateCard> {
  AiUpdate? _update;
  ApiException? _error;
  bool _busy = false;

  Future<void> _ask() async {
    final language = const {'hi': 'hi', 'kn': 'kn'}[Localizations.localeOf(context).languageCode] ?? 'en';
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final u = await widget.api.aiUpdate(widget.child.id, language: language);
      if (mounted) setState(() => _update = u);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final u = _update;
    final c = context.colors;
    Widget list(String title, List<String> items) => items.isEmpty
        ? const SizedBox.shrink()
        : Padding(
            padding: const EdgeInsets.only(top: Kx.s12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [Text(title, style: context.text.titleSmall), for (final s in items) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text('• $s'))],
            ),
          );
    return KxCard(
      key: const Key('aiUpdateCard'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [Icon(Icons.auto_awesome_outlined, color: c.primary), const SizedBox(width: Kx.s8), Expanded(child: Text(l.aiUpdateTitle, style: context.text.titleMedium))]),
          const SizedBox(height: Kx.s8),
          if (u == null)
            Align(
              alignment: Alignment.centerLeft,
              child: FilledButton.tonalIcon(
                key: const Key('aiUpdateAsk'),
                onPressed: _busy ? null : _ask,
                icon: _busy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.refresh),
                label: Text(l.aiUpdateAsk(widget.child.firstName)),
              ),
            )
          else ...[
            Text(u.headline, key: const Key('aiUpdateHeadline'), style: context.text.bodyLarge),
            list(l.aiUpdateGood, u.highlights),
            list(l.aiUpdateWatch, u.risks),
            list(l.aiUpdateDo, u.suggestions),
            if (u.preview) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(l.aiUpdatePreview, key: const Key('aiUpdatePreview'), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant))),
          ],
          if (_error != null) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(context.errorText(_error!), key: const Key('aiUpdateError'), style: TextStyle(color: c.error))),
          Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(l.aiUpdateNote(widget.child.firstName), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant))),
        ],
      ),
    );
  }
}
