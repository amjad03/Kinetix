import 'dart:ui';

import 'package:kinetix_ink/kinetix_ink.dart';

import '../../core/handwriting/handwriting.dart';

/// Says what a sketch is of ("cat", "house", "sun"), on the board itself: no ink leaves it.
/// Behind an interface so tests use a fake.
abstract class SketchRecognizer {
  /// False where the board has no sketch model at all (Windows, macOS, the web): the "Did you
  /// mean" bar then never shows.
  bool get available;

  /// Whether the model is on this device, can be downloaded, or is not offered.
  Future<HandwritingModelState> modelState();

  /// Downloads the model once. True when it is ready.
  Future<bool> download();

  /// Labels for [ink] (relative to its top left, in an [area] that size), most likely first;
  /// empty when nothing could be read.
  Future<List<String>> recognize(List<List<TimedPoint>> ink, Size area);
}

/// No sketch model on this platform.
class NoSketchRecognizer implements SketchRecognizer {
  const NoSketchRecognizer();

  @override
  bool get available => false;
  @override
  Future<HandwritingModelState> modelState() async => HandwritingModelState.unsupported;
  @override
  Future<bool> download() async => false;
  @override
  Future<List<String>> recognize(List<List<TimedPoint>> ink, Size area) async => const [];
}

/// ML Kit Digital Ink's AutoDraw model ([InkModels.autodraw]) through the board's ML Kit reader,
/// so it downloads, and shows as downloading, like the AI pen's models.
class MlKitSketchRecognizer implements SketchRecognizer {
  MlKitSketchRecognizer(this.reader);

  final InkModelReader reader;

  @override
  bool get available => true;
  @override
  Future<HandwritingModelState> modelState() => reader.modelStateOf(InkModels.autodraw);
  @override
  Future<bool> download() => reader.downloadModel(InkModels.autodraw);
  @override
  Future<List<String>> recognize(List<List<TimedPoint>> ink, Size area) => reader.readInk(ink, InkModels.autodraw, writingArea: area);
}

/// The sketch recogniser for a board's handwriting reader: ML Kit's (Android) has the AutoDraw
/// model; Windows ink and the rest have none.
SketchRecognizer sketchRecognizerFor(HandwritingRecognizer handwriting) =>
    handwriting is MlKitHandwriting ? MlKitSketchRecognizer(handwriting) : const NoSketchRecognizer();
