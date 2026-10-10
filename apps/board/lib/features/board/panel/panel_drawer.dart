import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';

import 'split_panel.dart';

/// Below this share of the screen, letting go of the drawer's handle closes it.
const drawerCloseBelow = 0.2;

/// A fling to the right faster than this (logical px/s) closes the drawer.
const drawerCloseVelocity = 900.0;

/// The right-hand drawer: slides in over the board from the right edge on a spring, with a
/// drag handle on its left edge (drag to resize, drag or fling right to close). The board
/// underneath is not resized or moved; the drawer is stacked on top of it.
class PanelDrawer extends StatefulWidget {
  const PanelDrawer({
    super.key,
    required this.screenWidth,
    required this.fraction,
    required this.full,
    required this.onFraction,
    required this.onClose,
    required this.child,
    this.scrim = false,
  });

  final double screenWidth;

  /// The drawer's width as a share of the screen (while it is not [full]).
  final double fraction;
  final bool full;

  /// The handle moved: the new share (may dip under the minimum while dragging); [settled] is
  /// true when the finger lets go and the share should snap.
  final void Function(double fraction, {required bool settled}) onFraction;
  final VoidCallback onClose;
  final Widget child;

  /// A dimming layer over the board; tapping it closes the drawer.
  final bool scrim;

  @override
  State<PanelDrawer> createState() => _PanelDrawerState();
}

class _PanelDrawerState extends State<PanelDrawer> with SingleTickerProviderStateMixin {
  late final AnimationController _slide = AnimationController.unbounded(vsync: this, value: 0);
  static final _spring = SpringDescription.withDampingRatio(mass: 1, stiffness: 320, ratio: 0.82);

  @override
  void initState() {
    super.initState();
    _slide.animateWith(SpringSimulation(_spring, 0, 1, 0));
  }

  /// The share while a drag is going on (the unclamped running total).
  double? _dragging;

  Future<void> _closeAnimated() async {
    await _slide.animateTo(0, duration: const Duration(milliseconds: 180), curve: Curves.easeIn);
    if (mounted) widget.onClose();
  }

  @override
  void dispose() {
    _slide.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final w = widget.screenWidth;
    final total = widget.full ? w : w * widget.fraction + panelDividerWidth;
    return Stack(
      children: [
        if (widget.scrim)
          Positioned.fill(
            child: AnimatedBuilder(
              animation: _slide,
              builder: (context, _) => GestureDetector(
                key: const Key('drawer-scrim'),
                onTap: _closeAnimated,
                child: ColoredBox(color: Theme.of(context).colorScheme.scrim.withValues(alpha: 0.28 * _slide.value.clamp(0.0, 1.0))),
              ),
            ),
          ),
        AnimatedBuilder(
          animation: _slide,
          builder: (context, child) => Positioned(right: -(1 - _slide.value) * total, top: 0, bottom: 0, width: total, child: child!),
          child: Row(
            key: const Key('panel-drawer'),
            children: [
              if (!widget.full)
                PanelDivider(
                  onDrag: (dx) {
                    // Added up here, so events that arrive before the next frame are not lost.
                    _dragging = (_dragging ?? widget.fraction) - dx / w;
                    widget.onFraction(_dragging!, settled: false);
                  },
                  onDragEnd: () {
                    final f = _dragging ?? widget.fraction;
                    _dragging = null;
                    if (f < drawerCloseBelow) {
                      _closeAnimated();
                    } else {
                      widget.onFraction(f, settled: true);
                    }
                  },
                  onFling: (v) {
                    if (v > drawerCloseVelocity) _closeAnimated();
                  },
                ),
              Expanded(child: widget.child),
            ],
          ),
        ),
      ],
    );
  }
}
