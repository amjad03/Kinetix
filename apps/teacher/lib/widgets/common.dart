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

/// Green "done" colours (Shared, Published) that read in both themes: (background, foreground).
(Color, Color) goodColors(BuildContext context) => Theme.of(context).brightness == Brightness.dark
    ? (const Color(0xFF0D3B1E), const Color(0xFF81C995))
    : (const Color(0xFFE6F4EA), const Color(0xFF137333));

/// The signed-in teacher's avatar in a tab's app bar; opens Profile.
class ProfileButton extends StatelessWidget {
  const ProfileButton({super.key, required this.name, required this.onPressed});

  final String name;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(right: Kx.s8),
    child: IconButton(onPressed: onPressed, tooltip: 'Profile', icon: KxAvatar(name: name, size: 32)),
  );
}

/// Asks before leaving a screen with unsaved changes. True when the teacher chose to discard.
Future<bool> confirmDiscard(BuildContext context, {String what = 'marks'}) async =>
    await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Discard changes?'),
        content: Text('You have $what that are not saved yet.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep editing')),
          FilledButton(key: const Key('discardChanges'), onPressed: () => Navigator.pop(ctx, true), child: const Text('Discard')),
        ],
      ),
    ) ??
    false;
