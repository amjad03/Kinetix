import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../core/api.dart';
import '../core/l10n.dart';

/// An inline, plain-language error in the error container colour.
class ErrorBanner extends StatelessWidget {
  const ErrorBanner(this.message, {super.key, this.onRetry});

  /// The banner for a failed request, in the app's language.
  static Widget api(ApiException error, {Key? key, VoidCallback? onRetry}) => Builder(
    key: key,
    builder: (context) => ErrorBanner(context.l10n.errorText(error), onRetry: onRetry),
  );

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
              child: Text(context.l10n.retry),
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
  const ProfileButton({super.key, required this.name, required this.onPressed, this.image});

  final String name;
  final VoidCallback onPressed;
  final ImageProvider? image;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(right: Kx.s8),
    child: IconButton(
      key: const Key('profileButton'),
      onPressed: onPressed,
      tooltip: context.l10n.profile,
      icon: KxAvatar(name: name, size: 32, image: image),
    ),
  );
}

/// Asks before leaving a screen with unsaved changes ([body] defaults to the marks wording). True when the teacher chose to discard.
Future<bool> confirmDiscard(BuildContext context, {String? body}) async =>
    await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(ctx.l10n.discardTitle),
        content: Text(body ?? ctx.l10n.discardMarksBody),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(ctx.l10n.keepEditing)),
          FilledButton(key: const Key('discardChanges'), onPressed: () => Navigator.pop(ctx, true), child: Text(ctx.l10n.discard)),
        ],
      ),
    ) ??
    false;
