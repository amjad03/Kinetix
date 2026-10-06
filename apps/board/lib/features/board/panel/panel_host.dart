import 'package:flutter/material.dart';

/// The board's split panel takes the place of dialogs and full-screen windows: anything shown
/// with [showPanelDialog] opens in the panel beside the board (the board stays writable), and
/// `Navigator.pop(context, value)` inside it closes it and returns [value] as a dialog would.
///
/// The board screen puts a [PanelHost] above everything it shows. Outside one (a test of a
/// single widget, the teacher app) [showPanelDialog] falls back to an ordinary dialog.
class PanelHost extends InheritedWidget {
  const PanelHost({super.key, required this.push, required super.child});

  /// Opens the panel (if it is closed) and shows [builder]'s widget in it.
  final Future<T?> Function<T>(WidgetBuilder builder) push;

  static PanelHost? maybeOf(BuildContext context) => context.getInheritedWidgetOfExactType<PanelHost>();

  /// The board screen's panel, for callers above the [PanelHost] in the tree (the board screen
  /// itself, and anything shown from its context).
  static Future<T?> Function<T>(WidgetBuilder builder)? active;

  @override
  bool updateShouldNotify(PanelHost oldWidget) => false;
}

/// Shows [builder]'s widget (a dialog) in the board's split panel, or as a dialog where there
/// is no panel. Returns what it is popped with.
Future<T?> showPanelDialog<T>({required BuildContext context, required WidgetBuilder builder, bool barrierDismissible = true}) {
  final push = PanelHost.maybeOf(context)?.push ?? PanelHost.active;
  if (push == null) return showDialog<T>(context: context, barrierDismissible: barrierDismissible, builder: builder);
  return push<T>(builder);
}

/// A route inside the panel: the dialog centred on the panel's surface, scrolling sideways
/// rather than overflowing when the panel is narrower than the dialog was made for.
class PanelDialogRoute<T> extends PageRoute<T> {
  PanelDialogRoute({required this.builder, super.settings});

  final WidgetBuilder builder;

  @override
  Color? get barrierColor => null;

  @override
  String? get barrierLabel => null;

  @override
  bool get maintainState => true;

  @override
  bool get opaque => true;

  @override
  Duration get transitionDuration => const Duration(milliseconds: 150);

  @override
  Widget buildPage(BuildContext context, Animation<double> animation, Animation<double> secondaryAnimation) => Material(
    color: Theme.of(context).colorScheme.surface,
    child: LayoutBuilder(
      builder: (context, c) {
        // Dialogs are laid out for at least 560 px; a narrower panel scrolls sideways.
        const minWidth = 560.0;
        final child = MediaQuery(
          data: MediaQuery.of(context).copyWith(size: Size(c.maxWidth < minWidth ? minWidth : c.maxWidth, c.maxHeight)),
          child: Builder(builder: builder),
        );
        if (c.maxWidth >= minWidth) return child;
        return SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: SizedBox(width: minWidth, height: c.maxHeight, child: child),
        );
      },
    ),
  );

  @override
  Widget buildTransitions(BuildContext context, Animation<double> animation, Animation<double> secondaryAnimation, Widget child) =>
      FadeTransition(opacity: animation, child: child);
}
