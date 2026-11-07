import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// The Classroom edition on a phone (shortest side under 600 dp): the whole app laid out as on
/// a 1920 × 1080 classroom board and scaled down to fit, letterboxed, so a phone shows exactly
/// the board's layout zoomed out (screens 12, 13). Touches and ink land where they are drawn:
/// [FittedBox] maps the pointer back into the board's coordinates.
class CePhoneFit extends StatefulWidget {
  const CePhoneFit({super.key, required this.enabled, required this.child});

  /// Off: [child] as it is (a panel, a tablet, or the KINETIX Board).
  final bool enabled;
  final Widget child;

  /// The board's own size.
  static const board = Size(1920, 1080);

  /// Screens this small get the scaled board.
  static const phoneBelow = 600.0;

  /// Whether a screen of [size] is a phone.
  static bool isPhone(Size size) => size.shortestSide < phoneBelow;

  /// The letterbox around the board.
  static const band = Color(0xFF0B1030);

  @override
  State<CePhoneFit> createState() => _CePhoneFitState();
}

class _CePhoneFitState extends State<CePhoneFit> {
  bool? _landscape;

  void _orient(bool phone) {
    if (_landscape == phone) return;
    _landscape = phone;
    // A phone shows the board on its side, full screen.
    unawaited(SystemChrome.setPreferredOrientations(phone ? const [DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight] : const []).catchError((Object _) {}));
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final phone = widget.enabled && CePhoneFit.isPhone(mq.size);
    if (widget.enabled) _orient(phone);
    if (!phone) return widget.child;
    // Inside the safe area (clear of a notch and the gesture strips).
    final insets = EdgeInsets.fromLTRB(
      math.max(mq.viewPadding.left, mq.padding.left),
      math.max(mq.viewPadding.top, mq.padding.top),
      math.max(mq.viewPadding.right, mq.padding.right),
      math.max(math.max(mq.viewPadding.bottom, mq.padding.bottom), mq.systemGestureInsets.bottom),
    );
    final room = insets.deflateSize(mq.size);
    final scale = math.min(room.width / CePhoneFit.board.width, room.height / CePhoneFit.board.height);
    return ColoredBox(
      key: const Key('ce-phone-fit'),
      color: CePhoneFit.band,
      child: Padding(
        padding: insets,
        child: Center(
          child: FittedBox(
            fit: BoxFit.contain,
            child: SizedBox.fromSize(
              size: CePhoneFit.board,
              child: MediaQuery(
                data: mq.copyWith(
                  size: CePhoneFit.board,
                  devicePixelRatio: mq.devicePixelRatio * scale,
                  padding: EdgeInsets.zero,
                  viewPadding: EdgeInsets.zero,
                  viewInsets: EdgeInsets.zero,
                  systemGestureInsets: EdgeInsets.zero,
                  textScaler: TextScaler.noScaling,
                ),
                child: widget.child,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
