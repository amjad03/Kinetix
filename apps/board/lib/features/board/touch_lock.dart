import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';

/// Touch lock: the board stays on show but takes no touches (little hands on the panel, a
/// phone in a pocket) until the lock button is held for [hold].
class TouchLockOverlay extends StatefulWidget {
  const TouchLockOverlay({super.key, required this.onUnlock, this.hold = const Duration(seconds: 2)});

  final VoidCallback onUnlock;
  final Duration hold;

  @override
  State<TouchLockOverlay> createState() => _TouchLockOverlayState();
}

class _TouchLockOverlayState extends State<TouchLockOverlay> with SingleTickerProviderStateMixin {
  late final _progress = AnimationController(vsync: this, duration: widget.hold)
    ..addStatusListener((s) {
      if (s == AnimationStatus.completed) widget.onUnlock();
    });

  @override
  void dispose() {
    _progress.dispose();
    super.dispose();
  }

  void _release() {
    if (_progress.status != AnimationStatus.completed) _progress.reverse();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final safe = MediaQuery.paddingOf(context);
    return Stack(
      key: const Key('touch-lock'),
      children: [
        // Every touch stops here.
        Positioned.fill(
          child: Listener(behavior: HitTestBehavior.opaque, child: const SizedBox.expand()),
        ),
        Positioned(
          right: Kx.s16 + safe.right,
          bottom: Kx.s16 + safe.bottom,
          child: Listener(
            key: const Key('touch-unlock'),
            onPointerDown: (_) => _progress.forward(),
            onPointerUp: (_) => _release(),
            onPointerCancel: (_) => _release(),
            child: Material(
              color: c.inverseSurface,
              shape: const StadiumBorder(),
              elevation: 6,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(Kx.s8, Kx.s8, Kx.s16, Kx.s8),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox.square(
                      dimension: 40,
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          AnimatedBuilder(
                            animation: _progress,
                            builder: (context, _) => CircularProgressIndicator(value: _progress.value, strokeWidth: 3, color: c.inversePrimary),
                          ),
                          Icon(Icons.lock_outline, color: c.onInverseSurface, size: 20),
                        ],
                      ),
                    ),
                    const SizedBox(width: Kx.s8),
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(l.touchLocked, style: context.text.labelLarge?.copyWith(color: c.onInverseSurface)),
                        Text(l.touchUnlockHold, style: context.text.labelSmall?.copyWith(color: c.onInverseSurface.withValues(alpha: 0.8))),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Screen Freeze (spec §61): what is on the board stays exactly as it is and takes no touch,
/// pen or gesture (a student can come up and point) until Close, bottom left, is tapped.
class ScreenFreezeOverlay extends StatelessWidget {
  const ScreenFreezeOverlay({super.key, required this.onClose, required this.closeLabel, required this.frozenLabel});

  final VoidCallback onClose;
  final String closeLabel;
  final String frozenLabel;

  @override
  Widget build(BuildContext context) {
    return Stack(
      key: const Key('screen-freeze'),
      children: [
        // Swallows every pointer (stylus, palm, fingers) before the canvas sees it.
        Positioned.fill(
          child: Semantics(
            label: frozenLabel,
            child: Listener(behavior: HitTestBehavior.opaque, onPointerDown: (_) {}, child: const AbsorbPointer(child: SizedBox.expand())),
          ),
        ),
        Positioned(
          left: Kx.s12,
          bottom: Kx.s12,
          child: FilledButton.icon(
            key: const Key('unfreeze'),
            style: FilledButton.styleFrom(minimumSize: const Size(120, 56)),
            onPressed: onClose,
            icon: const Icon(Icons.close),
            label: Text(closeLabel),
          ),
        ),
      ],
    );
  }
}
