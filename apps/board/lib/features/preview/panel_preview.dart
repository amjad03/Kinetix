import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../board/layout/ui_strings.dart';

/// "Preview as interactive panel" (Board settings, and the menu): the whole app laid out as on a
/// 1920 × 1080 smartboard (its size, pixel density and no system bars, through [MediaQuery]),
/// scaled down to fit this screen, so a teacher trying the demo build on a phone sees exactly
/// what the panel will show. Everything works as usual: taps and strokes land where they are
/// drawn ([FittedBox] maps the pointer back into the panel's coordinates). A phone is turned on
/// its side and its system bars hidden while the preview is on; the panel sits inside the safe
/// area (clear of a notch and the gesture strips) with the exit button in its own strip beside
/// it, so every button of the 1920 × 1080 layout can be reached.
class PanelPreview extends StatefulWidget {
  const PanelPreview({super.key, required this.enabled, required this.onExit, required this.child});

  final bool enabled;
  final VoidCallback onExit;
  final Widget child;

  /// The panel the preview shows: a 1080p interactive panel, as the board is designed for.
  static const panel = Size(1920, 1080);

  /// Where the panel and the exit button go on a screen of [mq]'s size and insets.
  static PreviewLayout layoutFor(MediaQueryData mq) => _layout(mq);

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

  /// On its side and full screen while previewing (the status and navigation bars take the
  /// touches over them, so the panel's top bar and toolbar would be out of reach); back to the
  /// app's own orientations and bars after.
  void _orient(bool landscape) {
    unawaited(
      SystemChrome.setPreferredOrientations(landscape ? const [DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight] : const []).catchError((Object _) {}),
    );
    unawaited(SystemChrome.setEnabledSystemUIMode(landscape ? SystemUiMode.immersiveSticky : SystemUiMode.edgeToEdge).catchError((Object _) {}));
  }

  @override
  Widget build(BuildContext context) {
    // The same tree either way, so turning the preview on or off keeps the board as it is.
    final mq = MediaQuery.of(context);
    final on = widget.enabled;
    final layout = PanelPreview.layoutFor(mq);
    final panel = on ? layout.panel : Offset.zero & mq.size;
    final content = on
        ? MediaQuery(
            data: mq.copyWith(
              size: PanelPreview.panel,
              devicePixelRatio: mq.devicePixelRatio * layout.scale,
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
        children: [
          Positioned.fromRect(
            rect: panel,
            child: FittedBox(
              key: const Key('panel-preview'),
              fit: on ? BoxFit.contain : BoxFit.none,
              alignment: Alignment.topLeft,
              child: SizedBox(width: on ? PanelPreview.panel.width : mq.size.width, height: on ? PanelPreview.panel.height : mq.size.height, child: content),
            ),
          ),
          if (on) Positioned.fromRect(rect: layout.exit, child: _ExitPreview(onExit: widget.onExit)),
        ],
      ),
    );
  }
}

/// Where the preview puts the scaled panel and its exit button on a screen.
typedef PreviewLayout = ({Rect panel, Rect exit, double scale});

/// The size of the exit button, and the strip kept for it beside the panel.
const double _exitSize = 48, _gutter = _exitSize + 2 * Kx.s4;

/// Lays the preview out inside the screen's safe area (clear of the status and navigation bars,
/// the notch and the gesture strips), keeping a strip beside the panel (left or top, whichever
/// leaves the panel bigger) for the exit button, so it never covers the panel's own buttons.
PreviewLayout _layout(MediaQueryData mq) {
  final insets = EdgeInsets.fromLTRB(
    math.max(mq.viewPadding.left, mq.padding.left),
    math.max(mq.viewPadding.top, mq.padding.top),
    math.max(mq.viewPadding.right, mq.padding.right),
    math.max(math.max(mq.viewPadding.bottom, mq.padding.bottom), mq.systemGestureInsets.bottom),
  );
  final safe = insets.deflateRect(Offset.zero & mq.size);
  const p = PanelPreview.panel;
  double fit(Size room) => math.max(0, math.min(room.width / p.width, room.height / p.height));
  final besideScale = fit(Size(safe.width - _gutter, safe.height));
  final aboveScale = fit(Size(safe.width, safe.height - _gutter));
  if (besideScale >= aboveScale) {
    final room = Rect.fromLTRB(safe.left + _gutter, safe.top, safe.right, safe.bottom);
    final size = p * besideScale;
    final panel = Alignment.center.inscribe(size, room);
    // The button sits in the strip, at the panel's top, or in the wider margin when centring
    // left more room on the left than the strip.
    final left = math.max(safe.left, panel.left - _gutter) + Kx.s4;
    return (panel: panel, exit: Rect.fromLTWH(left, panel.top + Kx.s4, _exitSize, _exitSize), scale: besideScale);
  }
  final room = Rect.fromLTRB(safe.left, safe.top + _gutter, safe.right, safe.bottom);
  final size = p * aboveScale;
  final panel = Alignment.center.inscribe(size, room);
  final top = math.max(safe.top, panel.top - _gutter) + Kx.s4;
  return (panel: panel, exit: Rect.fromLTWH(panel.left + Kx.s4, top, _exitSize, _exitSize), scale: aboveScale);
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
