import 'dart:ui';

import 'package:flutter/foundation.dart';

import '../ink_models.dart';
import 'handwriting.dart';
import 'shape_fit.dart';

/// When a stroke was written: pen down and pen up, in milliseconds on one clock.
typedef StrokeTime = ({int start, int end});

/// A point of ink with the time it was written, for a model that reads writing as it was
/// written.
typedef TimedPoint = ({double x, double y, int t});

/// The on-device models the AI pen reads ink with (Google ML Kit Digital Ink on Android).
abstract final class InkModels {
  /// Shapes: rectangle, triangle, ellipse, line, arrow and the like.
  static const shapes = 'zxx-Zsym-x-shapes';

  /// Text (with digits and symbols) in a board language.
  static String text(String language) => switch (language) {
    'hi' => 'hi-IN',
    'kn' => 'kn-IN',
    'ar' => 'ar',
    'mr' => 'mr-IN',
    'gu' => 'gu-IN',
    'ta' => 'ta-IN',
    'pa' => 'pa-Guru-IN',
    'te' => 'te-IN',
    'bn' => 'bn-IN',
    'or' => 'or-IN',
    'ml' => 'ml-IN',
    'ne' => 'ne-NP',
    _ => 'en-US',
  };
}

/// Reads timed ink with a named on-device model: words, digits and symbols in English, Hindi
/// and Kannada, and shapes. A [HandwritingRecognizer] that can (ML Kit on Android) implements it
/// too; the AI pen then reads writing with the stroke timing, checks drawn shapes with the
/// shapes model and reads the symbols of laid-out maths with the text model. Where there is
/// none (Windows, tests), the pure-Dart readers do it all.
abstract class InkModelReader {
  /// Whether [model] (an [InkModels] tag) can be used now, or after a download.
  Future<HandwritingModelState> modelStateOf(String model);

  /// Downloads [model] if it needs it. True when it is ready.
  Future<bool> downloadModel(String model);

  /// The models downloading now.
  ValueListenable<Set<String>> get downloadingModels;

  /// Readings of [ink] with [model], most likely first; empty when nothing could be read.
  Future<List<String>> readInk(List<List<TimedPoint>> ink, String model, {String preContext = '', Size? writingArea});
}

/// [strokes] as timed ink, relative to [origin]: each stroke's points spread evenly between its
/// pen-down and pen-up times in [times]; a stroke with no time (ink from before, a test) gets a
/// plausible one after the stroke before it.
List<List<TimedPoint>> timedInk(List<Stroke> strokes, Map<String, StrokeTime> times, {Offset origin = Offset.zero}) {
  final out = <List<TimedPoint>>[];
  var clock = 0;
  for (final s in strokes) {
    if (s.points.isEmpty) continue;
    final known = times[s.id];
    final start = known?.start ?? clock + 250;
    final end = known == null ? start + 8 * (s.points.length - 1) : known.end;
    final n = s.points.length;
    out.add([
      for (var i = 0; i < n; i++) (x: s.points[i].x - origin.dx, y: s.points[i].y - origin.dy, t: n == 1 ? start : start + ((end - start) * i / (n - 1)).round()),
    ]);
    clock = end;
  }
  return out;
}

/// What the shapes model's label says a drawing is: the kind to fit (with its corners for a
/// polygon), or an arrow; null for a label the board has no clean shape for.
({FitKind kind, int sides, bool arrow})? shapeFromLabel(String label) {
  final l = label.toLowerCase();
  if (l.contains('arrow')) return (kind: FitKind.line, sides: 0, arrow: true);
  if (l.contains('circle')) return (kind: FitKind.circle, sides: 0, arrow: false);
  if (l.contains('ellipse') || l.contains('oval')) return (kind: FitKind.ellipse, sides: 0, arrow: false);
  if (l.contains('square') || l.contains('rect')) return (kind: FitKind.rectangle, sides: 4, arrow: false);
  if (l.contains('triangle')) return (kind: FitKind.triangle, sides: 3, arrow: false);
  if (l.contains('diamond') || l.contains('rhomb') || l.contains('parallelogram') || l.contains('trapez')) return (kind: FitKind.quad, sides: 4, arrow: false);
  if (l.contains('pentagon')) return (kind: FitKind.polygon, sides: 5, arrow: false);
  if (l.contains('hexagon')) return (kind: FitKind.polygon, sides: 6, arrow: false);
  if (l.contains('octagon')) return (kind: FitKind.polygon, sides: 8, arrow: false);
  if (l.contains('line')) return (kind: FitKind.line, sides: 0, arrow: false);
  return null;
}
