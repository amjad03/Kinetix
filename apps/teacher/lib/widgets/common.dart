import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

/// An inline, plain-language error in the error container colour.
class ErrorBanner extends StatelessWidget {
  const ErrorBanner(this.message, {super.key, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s12, Kx.s8, Kx.s12),
      decoration: BoxDecoration(color: c.errorContainer, borderRadius: Kx.radiusMd),
      child: Row(
        children: [
          Icon(Icons.error_outline, color: c.onErrorContainer, size: 20),
          const SizedBox(width: Kx.s12),
          Expanded(
            child: Text(message, style: context.text.bodyMedium?.copyWith(color: c.onErrorContainer)),
          ),
          if (onRetry != null)
            TextButton(
              onPressed: onRetry,
              style: TextButton.styleFrom(foregroundColor: c.onErrorContainer),
              child: const Text('Retry'),
            ),
        ],
      ),
    );
  }
}

/// A small rounded label: "Now", "Taken", "Due tomorrow".
class Pill extends StatelessWidget {
  const Pill(this.label, {super.key, this.icon, required this.background, required this.foreground});

  final String label;
  final IconData? icon;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Kx.s8, vertical: 3),
      decoration: BoxDecoration(color: background, borderRadius: Kx.radiusSm),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 14, color: foreground), const SizedBox(width: Kx.s4)],
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: context.text.labelMedium?.copyWith(color: foreground, fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }
}
