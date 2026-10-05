import 'dart:math' as math;

import 'package:flutter/widgets.dart';

/// Board units ↔ screen pixels for the endless, zoomable board: screen = board × scale + offset.
@immutable
class ViewState {
  const ViewState({this.scale = 1, this.offset = Offset.zero});

  final double scale;
  final Offset offset;

  static const minScale = 0.15, maxScale = 8.0;

  Offset toScreen(Offset board) => board * scale + offset;
  Offset toBoard(Offset screen) => (screen - offset) / scale;

  /// The part of the board a [viewport] of this size shows.
  Rect visible(Size viewport) => Rect.fromPoints(toBoard(Offset.zero), toBoard(viewport.bottomRight(Offset.zero)));

  Matrix4 get matrix => Matrix4.identity()
    ..translateByDouble(offset.dx, offset.dy, 0, 1)
    ..scaleByDouble(scale, scale, 1, 1);

  /// Zoomed by [factor] about the screen point [focal], within [minScale]..[maxScale].
  ViewState zoomedAt(double factor, Offset focal) {
    final s = (scale * factor).clamp(minScale, maxScale);
    final board = toBoard(focal);
    return ViewState(scale: s, offset: focal - board * s);
  }

  ViewState panned(Offset d) => ViewState(scale: scale, offset: offset + d);

  /// [area] (board units) fitted into [viewport] with a [margin], no closer than [maxScale].
  static ViewState fit(Rect area, Size viewport, {double margin = 40, double maxScale = 2}) {
    if (area.isEmpty || viewport.isEmpty) return const ViewState();
    final s = math
        .min((viewport.width - margin * 2) / area.width, (viewport.height - margin * 2) / area.height)
        .clamp(ViewState.minScale, maxScale);
    return ViewState(scale: s, offset: viewport.center(Offset.zero) - area.center * s);
  }

  @override
  bool operator ==(Object other) => other is ViewState && other.scale == scale && other.offset == offset;

  @override
  int get hashCode => Object.hash(scale, offset);

  @override
  String toString() => 'ViewState(${scale.toStringAsFixed(2)}, $offset)';
}
