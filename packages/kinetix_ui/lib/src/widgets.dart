import 'package:flutter/material.dart';

import 'theme.dart';
import 'tokens.dart';

/// Initials avatar used for teachers and students, e.g. "AS" for Anita Sharma.
class KxAvatar extends StatelessWidget {
  const KxAvatar({super.key, required this.name, this.size = 40});

  final String name;
  final double size;

  static String initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty && !p.endsWith('.')).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first[0] + parts.last[0]).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    return CircleAvatar(
      radius: size / 2,
      backgroundColor: context.colors.primaryContainer,
      foregroundColor: context.colors.onPrimaryContainer,
      child: Text(initials(name), style: TextStyle(fontSize: size * 0.38, fontWeight: FontWeight.w500)),
    );
  }
}

/// A section title with optional trailing action, as in Google apps ("Today" ... "See all").
class KxSectionHeader extends StatelessWidget {
  const KxSectionHeader(this.title, {super.key, this.trailing});

  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s24, Kx.s16, Kx.s8),
      child: Row(children: [
        Expanded(child: Text(title, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w500))),
        ?trailing,
      ]),
    );
  }
}

/// Centered empty / error state with an icon, a line of text and an optional action.
class KxEmptyState extends StatelessWidget {
  const KxEmptyState({super.key, required this.icon, required this.message, this.action});

  final IconData icon;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Kx.s32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 48, color: context.colors.onSurfaceVariant),
          const SizedBox(height: Kx.s16),
          Text(message, textAlign: TextAlign.center, style: context.text.bodyLarge?.copyWith(color: context.colors.onSurfaceVariant)),
          if (action != null) ...[const SizedBox(height: Kx.s16), action!],
        ]),
      ),
    );
  }
}

// --- Floating chrome (Material 3 Expressive): toolbars that sit over the board, and buttons
// whose shape changes when they are selected. Colours come from the theme, so the same widgets
// work on the light board chrome and in the apps.

/// A floating toolbar: a pill on the surface colour with a soft shadow.
class KxToolbar extends StatelessWidget {
  const KxToolbar({super.key, this.axis = Axis.vertical, required this.children, this.padding = const EdgeInsets.all(6), this.color});

  final Axis axis;
  final List<Widget> children;
  final EdgeInsetsGeometry padding;
  final Color? color;

  @override
  Widget build(BuildContext context) => Container(
    padding: padding,
    decoration: Kx.floating(radius: 32, color: color ?? context.colors.surfaceContainerLowest),
    child: Material(
      type: MaterialType.transparency,
      child: Flex(direction: axis, mainAxisSize: MainAxisSize.min, children: children),
    ),
  );
}

/// A gap with a hairline between groups of a toolbar.
class KxToolbarGap extends StatelessWidget {
  const KxToolbarGap({super.key, this.axis = Axis.vertical});

  final Axis axis;

  @override
  Widget build(BuildContext context) => Container(
    width: axis == Axis.vertical ? 24 : 1,
    height: axis == Axis.vertical ? 1 : 24,
    margin: axis == Axis.vertical ? const EdgeInsets.symmetric(vertical: 6) : const EdgeInsets.symmetric(horizontal: 6),
    color: context.colors.outlineVariant,
  );
}

/// A toolbar button: a circle at rest that springs into a rounded square filled with the
/// container colour when selected. With a [label] the name sits under the icon (primary
/// classes and the Simple board).
class KxToolButton extends StatelessWidget {
  const KxToolButton({
    super.key,
    required this.icon,
    required this.tooltip,
    this.selected = false,
    this.busy = false,
    this.onTap,
    this.onLongPress,
    this.size = 48,
    this.selectedColor,
    this.onSelected,
    this.iconColor,
    this.label,
    this.badge,
  });

  final Widget icon;
  final String tooltip;
  final bool selected;
  final bool busy;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final double size;

  /// Fill and icon colours when selected (the brand's container by default).
  final Color? selectedColor;
  final Color? onSelected;

  /// Icon colour at rest (muted by default).
  final Color? iconColor;

  /// The words under the icon, for teachers who are new to the board. Null shows the icon alone.
  final String? label;

  /// A letter or number in the corner: the tool's letter on a primary board, or a count.
  final String? badge;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final enabled = onTap != null;
    final fill = selectedColor ?? c.primaryContainer;
    final fg = selected ? (onSelected ?? c.onPrimaryContainer) : (enabled ? (iconColor ?? c.onSurfaceVariant) : c.onSurfaceVariant.withValues(alpha: 0.38));
    final h = label == null ? size : size + 18;
    Widget glyph = busy
        ? SizedBox(width: size * 0.4, height: size * 0.4, child: CircularProgressIndicator(strokeWidth: 2.5, color: fg))
        : IconTheme(data: IconThemeData(color: fg, size: label == null ? size * 0.46 : 26), child: icon);
    if (badge != null) {
      glyph = Badge(
        label: Text(badge!, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
        backgroundColor: c.primary,
        textColor: c.onPrimary,
        offset: const Offset(10, -8),
        child: glyph,
      );
    }
    return Tooltip(
      message: tooltip,
      child: Semantics(
        button: true,
        selected: selected,
        label: tooltip,
        child: SizedBox(
          width: size,
          height: h,
          child: InkWell(
            onTap: onTap,
            onLongPress: onLongPress,
            customBorder: RoundedRectangleBorder(borderRadius: BorderRadius.circular(size * 0.3)),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Only the shape and colour animate; the size follows the screen at once.
                SizedBox(
                  width: label == null ? size : size - 6,
                  height: label == null ? size : 38,
                  child: AnimatedContainer(
                    duration: Kx.medium,
                    curve: Kx.spring,
                    decoration: BoxDecoration(
                      color: selected ? fill : fill.withValues(alpha: 0),
                      borderRadius: BorderRadius.circular(selected ? (label == null ? size * 0.3 : 16) : size / 2),
                    ),
                    alignment: Alignment.center,
                    child: glyph,
                  ),
                ),
                if (label != null) ...[
                  const SizedBox(height: 2),
                  // Long names (Highlighter, Hindi and Kannada words) shrink to fit.
                  SizedBox(
                    width: size,
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        label!,
                        maxLines: 1,
                        softWrap: false,
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: selected ? c.onSurface : c.onSurfaceVariant),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A surface over the board with the soft floating shadow (menus, chips, bars and windows
/// that sit on the canvas).
class KxSurface extends StatelessWidget {
  const KxSurface({super.key, this.color, this.radius = 20, this.clipBehavior = Clip.none, this.padding, required this.child});

  final Color? color;
  final double radius;
  final Clip clipBehavior;
  final EdgeInsetsGeometry? padding;
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
    decoration: Kx.floating(radius: radius, color: color ?? context.colors.surfaceContainerLowest),
    clipBehavior: clipBehavior,
    padding: padding,
    child: Material(type: MaterialType.transparency, child: child),
  );
}

/// A row in a menu: icon, title and an optional hint.
class KxMenuItem extends StatelessWidget {
  const KxMenuItem({super.key, required this.icon, required this.title, this.hint, this.onTap, this.selected = false, this.danger = false, this.iconColor});

  final IconData icon;
  final String title;
  final String? hint;
  final VoidCallback? onTap;
  final bool selected;
  final bool danger;
  final Color? iconColor;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final fg = danger ? c.error : c.onSurface;
    return InkWell(
      onTap: onTap,
      borderRadius: Kx.radiusMd,
      child: Container(
        constraints: const BoxConstraints(minHeight: 52),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(color: selected ? c.secondaryContainer : null, borderRadius: Kx.radiusMd),
        child: Row(
          children: [
            Icon(icon, size: 22, color: danger ? c.error : (iconColor ?? c.onSurfaceVariant)),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(title, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: fg)),
                  if (hint != null) Text(hint!, style: TextStyle(fontSize: 12.5, color: c.onSurfaceVariant, height: 1.3)),
                ],
              ),
            ),
            if (selected) Icon(Icons.check, size: 20, color: c.primary),
          ],
        ),
      ),
    );
  }
}
