import 'package:flutter/material.dart';

import '../l10n/ce_strings.dart';
import 'ce_style.dart';

/// Text that may be too long for its place (a lesson step's caption): up to [maxLines] lines,
/// and when there is more, an ellipsis and a big "More" button that shows all of it, so a teacher
/// can see there is more instead of the words being cut off or hidden in a scroll box.
class CeMoreText extends StatelessWidget {
  const CeMoreText(this.text, {super.key, required this.style, this.maxLines = 2, this.title});

  final String text;
  final TextStyle style;
  final int maxLines;

  /// The heading of the box that shows all of it.
  final String? title;

  /// Whether [text] needs more than [maxLines] lines at [width].
  static bool overflows(String text, TextStyle style, int maxLines, double width, TextScaler scaler) {
    final p = TextPainter(text: TextSpan(text: text, style: style), maxLines: maxLines, textDirection: TextDirection.ltr, textScaler: scaler)..layout(maxWidth: width);
    final more = p.didExceedMaxLines;
    p.dispose();
    return more;
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final more = overflows(text, style, maxLines, box.maxWidth - 140, MediaQuery.textScalerOf(context));
      final shown = Text(text, maxLines: maxLines, overflow: TextOverflow.ellipsis, style: style);
      if (!more) return Text(text, style: style);
      return Row(
        children: [
          Expanded(child: shown),
          const SizedBox(width: 8),
          TextButton.icon(
            key: const Key('ce-more-text'),
            style: TextButton.styleFrom(minimumSize: const Size(ceTarget, ceTarget), foregroundColor: CeC.accent),
            onPressed: () => showDialog<void>(
              context: context,
              builder: (ctx) => AlertDialog(
                key: const Key('ce-more-text-dialog'),
                title: title == null ? null : Text(title!),
                content: SizedBox(width: 640, child: SingleChildScrollView(child: Text(text, style: style))),
                actions: [FilledButton(onPressed: () => Navigator.pop(ctx), child: Text(ceTr('Close')))],
              ),
            ),
            icon: const Icon(Icons.unfold_more_rounded),
            label: Text(ceTr('More')),
          ),
        ],
      );
    },
  );
}
