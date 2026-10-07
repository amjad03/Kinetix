import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:google_mlkit_digital_ink_recognition/google_mlkit_digital_ink_recognition.dart' as mlkit;
import 'package:kinetix_ink/kinetix_ink.dart';

/// Handwriting on Android panels and phones: Google ML Kit Digital Ink, on the device itself.
///
/// It reads words, digits and symbols in English (en-US), Hindi (hi-IN) and Kannada (kn-IN), and
/// drawn shapes with ML Kit's shapes model ([InkModels.shapes]). Each model (a few MB to about
/// 20 MB) downloads once from Google: the first time the AI pen is used, from Board settings, or
/// by itself on a demo board; after that it works with no network, and no ink ever leaves the
/// device. ML Kit says itself whether it has a model for a tag ("No model was found" for one it
/// does not), so a language it lacks shows as not available rather than failing later.
class MlKitHandwriting implements HandwritingRecognizer, InkModelReader {
  MlKitHandwriting({mlkit.DigitalInkRecognizerModelManager? manager}) : _manager = manager ?? mlkit.DigitalInkRecognizerModelManager();

  final mlkit.DigitalInkRecognizerModelManager _manager;
  final Map<String, mlkit.DigitalInkRecognizer> _recognizers = {};
  final Set<String> _unsupported = {};

  /// Models (ML Kit tags) downloading now.
  final ValueNotifier<Set<String>> _downloading = ValueNotifier(const {});

  @override
  ValueListenable<Set<String>> get downloadingModels => _downloading;

  /// ML Kit's tag for a board language.
  static String tagFor(String language) => InkModels.text(language);

  @override
  String get engine => 'mlkit';

  @override
  bool get available => true;

  @override
  Future<HandwritingModelState> modelState(String language) => modelStateOf(tagFor(language));

  @override
  Future<bool> prepare(String language) => downloadModel(tagFor(language));

  @override
  Future<HandwritingModelState> modelStateOf(String model) async {
    if (_unsupported.contains(model)) return HandwritingModelState.unsupported;
    if (_downloading.value.contains(model)) return HandwritingModelState.downloading;
    try {
      return await _manager.isModelDownloaded(model) ? HandwritingModelState.ready : HandwritingModelState.needsDownload;
    } on PlatformException catch (e) {
      if (_noModel(e)) {
        _unsupported.add(model);
        return HandwritingModelState.unsupported;
      }
      return HandwritingModelState.needsDownload;
    } on MissingPluginException {
      return HandwritingModelState.unsupported;
    }
  }

  static bool _noModel(PlatformException e) => '${e.code} ${e.message}'.toLowerCase().contains('no model');

  @override
  Future<bool> downloadModel(String model) async {
    if (await modelStateOf(model) == HandwritingModelState.ready) return true;
    if (_unsupported.contains(model)) return false;
    _downloading.value = {..._downloading.value, model};
    try {
      return await _manager.downloadModel(model, isWifiRequired: false);
    } on PlatformException catch (e) {
      if (_noModel(e)) _unsupported.add(model);
      return false;
    } on MissingPluginException {
      return false;
    } finally {
      _downloading.value = {..._downloading.value}..remove(model);
    }
  }

  @override
  Future<List<String>> recognize(List<Stroke> strokes, {required String language, String preContext = ''}) async {
    if (strokes.isEmpty) return const [];
    final box = inkBounds(strokes);
    return readInk(timedInk(strokes, const {}, origin: box.topLeft), tagFor(language), preContext: preContext, writingArea: Size(box.width + 20, box.height + 20));
  }

  @override
  Future<List<String>> readInk(List<List<TimedPoint>> ink, String model, {String preContext = '', Size? writingArea}) async {
    if (ink.isEmpty) return const [];
    final mk = mlkit.Ink();
    for (final s in ink) {
      final stroke = mlkit.Stroke();
      for (final p in s) {
        stroke.points.add(mlkit.StrokePoint(x: p.x, y: p.y, t: p.t));
      }
      mk.strokes.add(stroke);
    }
    final recognizer = _recognizers[model] ??= mlkit.DigitalInkRecognizer(languageCode: model);
    try {
      final shapes = model == InkModels.shapes;
      final result = await recognizer.recognize(
        mk,
        // The shapes model takes no writing context.
        context: shapes
            ? null
            : mlkit.DigitalInkRecognitionContext(
                preContext: preContext.length > 20 ? preContext.substring(preContext.length - 20) : preContext,
                writingArea: writingArea == null ? null : mlkit.WritingArea(width: writingArea.width, height: writingArea.height),
              ),
      );
      return [for (final c in result) c.text];
    } on PlatformException {
      return const [];
    } on MissingPluginException {
      return const [];
    }
  }
}
