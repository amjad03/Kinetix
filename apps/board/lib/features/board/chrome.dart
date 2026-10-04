import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';

/// Building blocks for the board's floating chrome: toolbars, popovers and panels.
/// They use [KinetixTheme.boardChrome] (Material 3, dark) so they read clearly over a bright
/// canvas from the back of a classroom.

/// Wraps [child] in the board chrome theme.
class BoardChromeTheme extends StatelessWidget {
  const BoardChromeTheme({super.key, required this.child});

  final Widget child;

  static final _theme = KinetixTheme.boardChrome();

  @override
  Widget build(BuildContext context) => Theme(data: _theme, child: child);
}

/// A floating, rounded surface (toolbar pill, popover card).
class ChromeSurface extends StatelessWidget {
  const ChromeSurface({super.key, required this.child, this.padding = const EdgeInsets.all(6), this.radius = Kx.rLg});

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: c.surfaceContainer,
      elevation: 6,
      shadowColor: Colors.black54,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(radius),
        side: BorderSide(color: c.outlineVariant.withValues(alpha: 0.4)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Padding(padding: padding, child: child),
    );
  }
}

/// Compact toolbars drop the labels so the whole toolbar fits next to an open side panel or
/// on a 720p tablet. Labels remain available as tooltips.
class ToolbarDensity extends InheritedWidget {
  const ToolbarDensity({super.key, required this.compact, required super.child});

  final bool compact;

  static bool of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<ToolbarDensity>()?.compact ?? false;

  @override
  bool updateShouldNotify(ToolbarDensity old) => old.compact != compact;
}

/// An icon with a label underneath, the main toolbar button (as on Teachmint and Google's
/// navigation rails). [accent] tints the icon tile for the AI group.
class ToolButton extends StatelessWidget {
  const ToolButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.selected = false,
    this.enabled = true,
    this.accent,
    this.badge,
    this.iconColor,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool selected;
  final bool enabled;
  final Color? accent;
  final String? badge;
  final Color? iconColor;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final compact = ToolbarDensity.of(context);
    final fg = !enabled
        ? c.onSurface.withValues(alpha: 0.38)
        : selected
        ? c.onSecondaryContainer
        : c.onSurfaceVariant;
    Widget glyph = Icon(icon, size: 24, color: iconColor ?? (accent != null && enabled ? Colors.white : fg));
    if (accent != null) {
      glyph = Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(color: enabled ? accent : c.surfaceContainerHighest, borderRadius: BorderRadius.circular(Kx.rSm)),
        alignment: Alignment.center,
        child: Icon(icon, size: 20, color: enabled ? Colors.white : fg),
      );
    }
    if (badge != null) {
      glyph = Badge(
        label: Text(badge!, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w600)),
        backgroundColor: c.tertiary,
        textColor: c.onTertiary,
        offset: const Offset(10, -6),
        child: glyph,
      );
    }
    return Tooltip(
      message: label,
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(Kx.rMd),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          // Labels in Hindi and Kannada run longer than English: the button grows a little,
          // then the label is cut with an ellipsis (the tooltip keeps the full name).
          width: compact ? 52 : null,
          constraints: compact ? null : const BoxConstraints(minWidth: 64, maxWidth: 92),
          padding: compact ? null : const EdgeInsets.symmetric(horizontal: 4),
          height: compact ? 52 : 60,
          decoration: BoxDecoration(
            color: selected ? c.secondaryContainer : Colors.transparent,
            borderRadius: BorderRadius.circular(Kx.rMd),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              SizedBox(height: 32, child: Center(widthFactor: 1, child: glyph)),
              if (!compact) const SizedBox(height: 2),
              if (!compact)
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  softWrap: false,
                  textAlign: TextAlign.center,
                  // As wide as the label, not the 92 px the button may grow to.
                  textWidthBasis: TextWidthBasis.longestLine,
                  style: TextStyle(fontSize: 11.5, height: 1.2, fontWeight: selected ? FontWeight.w600 : FontWeight.w500, color: fg),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class ToolbarDivider extends StatelessWidget {
  const ToolbarDivider({super.key});

  @override
  Widget build(BuildContext context) =>
      Container(width: 1, height: 40, margin: const EdgeInsets.symmetric(horizontal: 6), color: context.colors.outlineVariant);
}

/// A popover card with a title row, used above the toolbar.
class PopoverCard extends StatelessWidget {
  const PopoverCard({super.key, required this.title, required this.child, this.width = 420, this.trailing});

  final String title;
  final Widget child;
  final double width;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return ChromeSurface(
      radius: Kx.rXl,
      padding: const EdgeInsets.fromLTRB(Kx.s20, Kx.s16, Kx.s20, Kx.s20),
      child: SizedBox(
        width: width,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(title, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w500)),
                ),
                ?trailing,
              ],
            ),
            const SizedBox(height: Kx.s12),
            child,
          ],
        ),
      ),
    );
  }
}

/// A square tile with an icon and label inside popovers and panels (Tools grid, AI tools).
class ChromeTile extends StatelessWidget {
  const ChromeTile({
    super.key,
    required this.icon,
    required this.label,
    this.onTap,
    this.color,
    this.soon = false,
    this.selected = false,
    this.width = 104,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final Color? color;
  final bool soon;
  final bool selected;
  final double width;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final tint = color ?? c.primary;
    return Material(
      color: selected ? c.secondaryContainer : c.surfaceContainerHigh,
      borderRadius: BorderRadius.circular(Kx.rLg),
      child: InkWell(
        borderRadius: BorderRadius.circular(Kx.rLg),
        onTap: onTap,
        child: SizedBox(
          width: width,
          height: 96,
          child: Stack(
            children: [
              Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: tint.withValues(alpha: soon ? 0.12 : 0.18),
                        borderRadius: BorderRadius.circular(Kx.rMd),
                      ),
                      child: Icon(icon, color: soon ? c.onSurfaceVariant : tint, size: 22),
                    ),
                    const SizedBox(height: Kx.s8),
                    // Two lines, so longer Hindi and Kannada names still fit the tile.
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      child: Text(
                        label,
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12.5, height: 1.15, fontWeight: FontWeight.w500, color: soon ? c.onSurfaceVariant : c.onSurface),
                      ),
                    ),
                  ],
                ),
              ),
              if (soon)
                Positioned(
                  top: 6,
                  right: 6,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(color: c.surfaceContainerHighest, borderRadius: BorderRadius.circular(6)),
                    child: Text(
                      context.l10n.soon,
                      style: TextStyle(fontSize: 9.5, color: c.onSurfaceVariant, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Shows a short message above the bottom toolbar. A snackbar in the default position would
/// cover the toolbar and swallow the teacher's next tap.
void showBoardMessage(BuildContext context, String text) {
  final width = MediaQuery.sizeOf(context).width;
  final side = ((width - 560) / 2).clamp(16.0, double.infinity);
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(text),
        behavior: SnackBarBehavior.floating,
        margin: EdgeInsets.fromLTRB(side, 0, side, 112),
        duration: const Duration(seconds: 3),
      ),
    );
}

/// Shows a short message that a feature is on the way, so no button is silently dead.
void showComingSoon(BuildContext context, String feature) => showBoardMessage(context, context.l10n.comingSoonFeature(feature));
