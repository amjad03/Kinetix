import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart' show BoardBackground;
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';

/// Building blocks for the board's floating chrome: toolbars, popovers and panels.
///
/// The chrome follows the KINETIX design (docs/design/design-system.md) in the teacher's App
/// theme (Board settings), whatever the layout or the device: white floating surfaces with a
/// soft shadow in [KinetixTheme.board], Material 3 dark in [KinetixTheme.boardChrome], or
/// chalkboard green.

/// The app's own theme (screens, panels and dialogs) for a resolved [BoardTheme].
ThemeData boardAppTheme(BoardTheme t) => _appThemes[t.resolve(Brightness.light)]!;

final _appThemes = {
  BoardTheme.light: KinetixTheme.light(),
  BoardTheme.dark: KinetixTheme.dark(),
  BoardTheme.chalkboard: KinetixTheme.chalkboard(),
};

/// The board's own paper in an App theme: white paper in the light theme, a near-black board in
/// the dark theme and a green chalkboard in chalkboard green. A page with another paper or a
/// template keeps it.
BoardBackground themePaper(BoardTheme t) => switch (t) {
  BoardTheme.dark => BoardBackground.night,
  BoardTheme.chalkboard => BoardBackground.chalkboard,
  _ => BoardBackground.plain,
};

/// Every theme's own paper (the papers that follow the theme).
const themePapers = {BoardBackground.plain, BoardBackground.night, BoardBackground.chalkboard};

/// Wraps [child] in the board chrome theme of the teacher's App theme.
class BoardChromeTheme extends StatelessWidget {
  const BoardChromeTheme({super.key, required this.child});

  final Widget child;

  static final _themes = {
    BoardTheme.light: KinetixTheme.board(),
    BoardTheme.dark: KinetixTheme.boardChrome(),
    BoardTheme.chalkboard: KinetixTheme.chalkboard(large: true),
  };

  @override
  Widget build(BuildContext context) => Theme(data: _themes[BoardLook.of(context).resolve(Brightness.light)]!, child: child);
}

/// The App theme in use, resolved (never [BoardTheme.system]). The app puts it above its
/// navigator, so the board, its sheets and its dialogs all see it.
class BoardLook extends InheritedWidget {
  const BoardLook({super.key, required this.look, required super.child});

  final BoardTheme look;

  /// Light where no app sets it (tests of one widget).
  static BoardTheme of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<BoardLook>()?.look ?? BoardTheme.light;

  @override
  bool updateShouldNotify(BoardLook oldWidget) => oldWidget.look != look;
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
    if (c.brightness == Brightness.light) {
      // Light chrome: white with the soft floating shadow, no Material elevation.
      return Container(
        decoration: Kx.floating(radius: radius, color: c.surfaceContainerLowest),
        clipBehavior: Clip.antiAlias,
        child: Material(type: MaterialType.transparency, child: Padding(padding: padding, child: child)),
      );
    }
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
  const ToolbarDensity({super.key, required this.compact, this.big = false, required super.child});

  final bool compact;

  /// Primary classes (LKG–5): bigger buttons and labels.
  final bool big;

  static bool of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<ToolbarDensity>()?.compact ?? false;
  static bool bigOf(BuildContext context) => context.dependOnInheritedWidgetOfExactType<ToolbarDensity>()?.big ?? false;

  @override
  bool updateShouldNotify(ToolbarDensity old) => old.compact != compact || old.big != big;
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
    final big = !compact && ToolbarDensity.bigOf(context);
    final fg = !enabled
        ? c.onSurface.withValues(alpha: 0.38)
        : selected
        ? c.onSecondaryContainer
        : c.onSurfaceVariant;
    Widget glyph = Icon(icon, size: big ? 30 : 24, color: iconColor ?? (accent != null && enabled ? Colors.white : fg));
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
          constraints: compact ? null : (big ? const BoxConstraints(minWidth: 80, maxWidth: 112) : const BoxConstraints(minWidth: 64, maxWidth: 92)),
          padding: compact ? null : const EdgeInsets.symmetric(horizontal: 4),
          height: compact ? 52 : (big ? 76 : 60),
          decoration: BoxDecoration(
            color: selected ? c.secondaryContainer : Colors.transparent,
            borderRadius: BorderRadius.circular(Kx.rMd),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              SizedBox(height: big ? 38 : 32, child: Center(widthFactor: 1, child: glyph)),
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
                  style: TextStyle(fontSize: big ? 14 : 11.5, height: 1.2, fontWeight: selected ? FontWeight.w600 : FontWeight.w500, color: fg),
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
    this.selected = false,
    this.width = 104,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final Color? color;
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
                        color: tint.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(Kx.rMd),
                      ),
                      child: Icon(icon, color: tint, size: 22),
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
                        style: TextStyle(fontSize: 12.5, height: 1.15, fontWeight: FontWeight.w500, color: c.onSurface),
                      ),
                    ),
                  ],
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
/// cover the toolbar and swallow the teacher's next tap. [action] adds a button (Undo).
void showBoardMessage(BuildContext context, String text, {(String, VoidCallback)? action}) {
  final width = MediaQuery.sizeOf(context).width;
  final side = ((width - 560) / 2).clamp(16.0, double.infinity);
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(text),
        behavior: SnackBarBehavior.floating,
        margin: EdgeInsets.fromLTRB(side, 0, side, 112),
        duration: Duration(seconds: action == null ? 3 : 6),
        action: action == null ? null : SnackBarAction(key: const Key('message-action'), label: action.$1, onPressed: action.$2),
      ),
    );
}

