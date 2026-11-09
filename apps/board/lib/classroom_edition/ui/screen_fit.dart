import 'package:flutter/material.dart';

import 'phone_fit.dart';

/// How big the Classroom edition draws everything (College settings → This board → Screen
/// size), saved on the board.
enum CeScreenSize {
  smaller(0.85),
  normal(1),
  larger(1.2);

  const CeScreenSize(this.factor);

  /// How much bigger than Normal.
  final double factor;

  static CeScreenSize parse(String? name) => values.asNameMap()[name] ?? normal;
}

/// The Classroom edition on a big panel. A 4K smartboard that reports a device pixel ratio of 1
/// (many Android panels do) would lay the app out over 3840 × 2160 logical pixels and draw every
/// button at half size. When the ratio is under [maxRatio] and the screen's shortest side is
/// over [bigFrom] physical pixels, the app is laid out at [layoutWidth] logical pixels across
/// (as on a 1080p panel) and scaled up to fill the screen. A 4K panel that reports a ratio of 2
/// already lays out at 1920 and is left alone. The teacher's [size] (Smaller / Normal / Larger)
/// scales on top, on every panel. Phones are left to [CePhoneFit]. Touches and ink land where
/// they are drawn: [FittedBox] maps pointers back into the scaled layout.
class CeScreenFit extends StatelessWidget {
  const CeScreenFit({super.key, required this.enabled, this.size = CeScreenSize.normal, required this.child});

  /// Off: [child] as it is (the KINETIX Board).
  final bool enabled;
  final CeScreenSize size;
  final Widget child;

  static const layoutWidth = 1920.0;
  static const maxRatio = 1.5;
  static const bigFrom = 1300.0;

  /// How much the layout is scaled up on a screen of [logical] size at [ratio] (1: not at all).
  static double scaleFor(Size logical, double ratio, [CeScreenSize size = CeScreenSize.normal]) {
    if (logical.isEmpty || CePhoneFit.isPhone(logical)) return 1;
    final auto = ratio < maxRatio && logical.shortestSide * ratio > bigFrom ? logical.longestSide / layoutWidth : 1.0;
    return (auto < 1 ? 1.0 : auto) * size.factor;
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final k = enabled ? scaleFor(mq.size, mq.devicePixelRatio, size) : 1.0;
    if ((k - 1).abs() < 0.005) return child;
    final inner = mq.size / k;
    return SizedBox.expand(
      key: const Key('ce-screen-fit'),
      child: FittedBox(
        fit: BoxFit.fill,
        child: SizedBox.fromSize(
          size: inner,
          child: MediaQuery(
            data: mq.copyWith(
              size: inner,
              devicePixelRatio: mq.devicePixelRatio * k,
              padding: mq.padding / k,
              viewPadding: mq.viewPadding / k,
              viewInsets: mq.viewInsets / k,
              systemGestureInsets: mq.systemGestureInsets / k,
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}
