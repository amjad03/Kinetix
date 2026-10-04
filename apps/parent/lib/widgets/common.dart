import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../core/models.dart';

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

/// A small rounded label: "Due tomorrow", "Absent", "Soon".
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

/// "Soon" on features that are not built yet (nothing is silently dead).
class SoonPill extends StatelessWidget {
  const SoonPill({super.key});

  @override
  Widget build(BuildContext context) =>
      Pill('Soon', background: context.colors.tertiaryContainer, foreground: context.colors.onTertiaryContainer);
}

/// Google-palette semantic colours that read well in light and dark themes.
abstract final class Tone {
  static bool _dark(BuildContext context) => Theme.of(context).brightness == Brightness.dark;

  static Color good(BuildContext context) => _dark(context) ? const Color(0xFF81C995) : const Color(0xFF137333);
  static Color goodContainer(BuildContext context) => _dark(context) ? const Color(0xFF0D3B1E) : const Color(0xFFE6F4EA);
  static Color warn(BuildContext context) => _dark(context) ? const Color(0xFFFDD663) : const Color(0xFFB06000);
  static Color warnContainer(BuildContext context) => _dark(context) ? const Color(0xFF473400) : const Color(0xFFFEF7E0);
  static Color warnBar(BuildContext context) => _dark(context) ? const Color(0xFFFDD663) : const Color(0xFFF9AB00);
  static Color goodBar(BuildContext context) => _dark(context) ? const Color(0xFF81C995) : const Color(0xFF1E8E3E);

  /// (background, foreground) for an attendance mark.
  static (Color, Color) status(BuildContext context, AttendanceStatus s) {
    final c = context.colors;
    return switch (s) {
      AttendanceStatus.present => (goodContainer(context), good(context)),
      AttendanceStatus.absent => (c.errorContainer, c.onErrorContainer),
      AttendanceStatus.late => (warnContainer(context), warn(context)),
      AttendanceStatus.excused => (c.secondaryContainer, c.onSecondaryContainer),
    };
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill(this.status, {super.key});

  final AttendanceStatus status;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = Tone.status(context, status);
    return Pill(status.label, background: bg, foreground: fg);
  }
}

/// A tonal Home card with a title row ("Attendance" · "Last 30 days") and an optional tap target.
class SectionCard extends StatelessWidget {
  const SectionCard({super.key, required this.icon, required this.title, this.caption, this.onTap, required this.child, this.footer});

  final IconData icon;
  final String title;
  final String? caption;
  final VoidCallback? onTap;
  final Widget child;

  /// e.g. "See attendance history ›", shown under a divider.
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, 0),
              child: Row(
                children: [
                  Icon(icon, size: 20, color: c.primary),
                  const SizedBox(width: Kx.s8),
                  Expanded(
                    child: Text(title, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w500)),
                  ),
                  if (caption != null) Text(caption!, style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant)),
                ],
              ),
            ),
            Padding(padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s12, Kx.s16, Kx.s16), child: child),
            if (footer != null) ...[const Divider(height: 1, indent: Kx.s16, endIndent: Kx.s16), footer!],
          ],
        ),
      ),
    );
  }
}

/// A "See all ›" row at the bottom of a card.
class CardLink extends StatelessWidget {
  const CardLink(this.label, {super.key, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return InkWell(
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: Kx.target),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
          child: Row(
            children: [
              Expanded(
                child: Text(label, style: context.text.labelLarge?.copyWith(color: c.primary)),
              ),
              Icon(Icons.chevron_right, color: c.primary),
            ],
          ),
        ),
      ),
    );
  }
}

/// A round tonal icon used as a list leading.
class IconBadge extends StatelessWidget {
  const IconBadge(this.icon, {super.key, this.background, this.foreground, this.size = 40});

  final IconData icon;
  final Color? background;
  final Color? foreground;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(color: background ?? context.colors.secondaryContainer, shape: BoxShape.circle),
    child: Icon(icon, size: size * 0.5, color: foreground ?? context.colors.onSecondaryContainer),
  );
}
