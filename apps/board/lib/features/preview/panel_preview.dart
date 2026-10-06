import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../board/layout/ui_strings.dart';

/// "Preview as interactive panel" (Board settings, and the menu): the whole app laid out as on a
/// 1920 × 1080 smartboard (its size, pixel density and no system bars, through [MediaQuery]),
/// scaled down to fit this screen, so a teacher trying the demo build on a phone sees exactly
/// what the panel will show. Everything works as usual: taps and strokes land where they are
/// drawn ([FittedBox] maps the pointer back into the panel's coordinates). A phone is turned on
/// its side while the preview is on.
class PanelPreview extends StatefulWidget {
  const PanelPreview({super.key, required this.enabled, required this.onExit, required this.child});

  final bool enabled;
  final VoidCallback onExit;
  final Widget child;

  /// The panel the preview shows: a 1080p interactive panel, as the board is designed for.
  static const panel = Size(1920, 1080);

  @override
  State<PanelPreview> createState() => _PanelPreviewState();
}

class _PanelPreviewState extends State<PanelPreview> {
  @override
  void initState() {
    super.initState();
    if (widget.enabled) _orient(true);
  }

  @override
  void didUpdateWidget(PanelPreview old) {
    super.didUpdateWidget(old);
    if (old.enabled != widget.enabled) _orient(widget.enabled);
  }

  @override
  void dispose() {
    if (widget.enabled) _orient(false);
    super.dispose();
  }

  /// On its side while previewing; back to the app's own orientations after.
  void _orient(bool landscape) => unawaited(
    SystemChrome.setPreferredOrientations(landscape ? const [DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight] : const []).catchError((Object _) {}),
  );

  @override
  Widget build(BuildContext context) {
    // The same tree either way, so turning the preview on or off keeps the board as it is.
    final mq = MediaQuery.of(context);
    final screen = mq.size;
    final on = widget.enabled;
    final scale = on ? (screen.width / PanelPreview.panel.width).clamp(0.0, screen.height / PanelPreview.panel.height) : 1.0;
    final content = on
        ? MediaQuery(
            data: mq.copyWith(
              size: PanelPreview.panel,
              devicePixelRatio: mq.devicePixelRatio * scale,
              padding: EdgeInsets.zero,
              viewPadding: EdgeInsets.zero,
              viewInsets: EdgeInsets.zero,
              systemGestureInsets: EdgeInsets.zero,
              textScaler: TextScaler.noScaling,
            ),
            child: widget.child,
          )
        : widget.child;
    return ColoredBox(
      color: on ? const Color(0xFF0B0D0C) : Colors.transparent,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Center(
            child: FittedBox(
              key: const Key('panel-preview'),
              fit: on ? BoxFit.contain : BoxFit.none,
              child: SizedBox(width: on ? PanelPreview.panel.width : screen.width, height: on ? PanelPreview.panel.height : screen.height, child: content),
            ),
          ),
          if (on)
            Positioned(
              left: mq.padding.left + Kx.s4,
              top: mq.padding.top + Kx.s4,
              child: _ExitPreview(onExit: widget.onExit),
            ),
        ],
      ),
    );
  }
}

/// The way out of the preview, in the margin beside the scaled-down panel.
class _ExitPreview extends StatelessWidget {
  const _ExitPreview({required this.onExit});

  final VoidCallback onExit;

  @override
  Widget build(BuildContext context) {
    final s = UiStrings.of(context);
    // (Above the app's navigator: no overlay here for a tooltip.)
    return Semantics(
      button: true,
      label: '${s.previewBadge} · ${s.exitPreview}',
      child: Material(
        color: const Color(0xE6222624),
        shape: const StadiumBorder(),
        child: InkWell(
          key: const Key('exit-panel-preview'),
          customBorder: const StadiumBorder(),
          onTap: onExit,
          child: const SizedBox(width: 48, height: 48, child: Icon(Icons.close_fullscreen, color: Colors.white, size: 22)),
        ),
      ),
    );
  }
}
