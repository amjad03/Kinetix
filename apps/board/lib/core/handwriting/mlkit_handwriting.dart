import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:google_mlkit_digital_ink_recognition/google_mlkit_digital_ink_recognition.dart' as mlkit;
import 'package:kinetix_ink/kinetix_ink.dart';

/// Words from handwriting on Android panels: Google ML Kit Digital Ink, on the panel itself.
///
/// Each language's model (about 20 MB) downloads once from Google when the teacher asks for it
/// in Board settings; after that it works with no network, and no ink ever leaves the panel.
/// English is en-US; Hindi hi-IN and Kannada kn-IN. ML Kit says itself whether it has a model
/// for a tag ("No model was found" for one it does not), so a language it lacks shows as not
/// available rather than failing later.
class MlKitHandwriting implements HandwritingRecognizer {
  MlKitHandwriting({mlkit.DigitalInkRecognizerModelManager? manager}) : _manager = manager ?? mlkit.DigitalInkRecognizerModelManager();

  final mlkit.DigitalInkRecognizerModelManager _manager;
  final Map<String, mlkit.DigitalInkRecognizer> _recognizers = {};
  final Set<String> _unsupported = {};

  /// Languages downloading now.
  final ValueNotifier<Set<String>> downloading = ValueNotifier(const {});

  /// ML Kit's tag for a board language.
  static String tagFor(String language) => switch (language) {
    'hi' => 'hi-IN',
    'kn' => 'kn-IN',
    _ => 'en-US',
  };

  @override
  String get engine => 'mlkit';

  @override
  bool get available => true;

  @override
  Future<HandwritingModelState> modelState(String language) async {
    if (_unsupported.contains(language)) return HandwritingModelState.unsupported;
    if (downloading.value.contains(language)) return HandwritingModelState.downloading;
    try {
      return await _manager.isModelDownloaded(tagFor(language)) ? HandwritingModelState.ready : HandwritingModelState.needsDownload;
    } on PlatformException catch (e) {
      if (_noModel(e)) {
        _unsupported.add(language);
        return HandwritingModelState.unsupported;
      }
      return HandwritingModelState.needsDownload;
    } on MissingPluginException {
      return HandwritingModelState.unsupported;
    }
  }

  static bool _noModel(PlatformException e) => '${e.code} ${e.message}'.toLowerCase().contains('no model');

  @override
  Future<bool> prepare(String language) async {
    if (await modelState(language) == HandwritingModelState.ready) return true;
    if (_unsupported.contains(language)) return false;
    downloading.value = {...downloading.value, language};
    try {
      return await _manager.downloadModel(tagFor(language), isWifiRequired: false);
    } on PlatformException catch (e) {
      if (_noModel(e)) _unsupported.add(language);
      return false;
    } on MissingPluginException {
      return false;
    } finally {
      downloading.value = {...downloading.value}..remove(language);
    }
  }

  @override
  Future<List<String>> recognize(List<Stroke> strokes, {required String language, String preContext = ''}) async {
    if (strokes.isEmpty) return const [];
    final box = inkBounds(strokes);
    final ink = mlkit.Ink();
    // The teacher's stroke order, with plausible timing (the board does not keep it).
    var t = 0;
    for (final s in strokes) {
      final stroke = mlkit.Stroke();
      for (final p in s.points) {
        stroke.points.add(mlkit.StrokePoint(x: p.x - box.left, y: p.y - box.top, t: t));
        t += 8;
      }
      ink.strokes.add(stroke);
      t += 250;
    }
    final recognizer = _recognizers[language] ??= mlkit.DigitalInkRecognizer(languageCode: tagFor(language));
    try {
      final result = await recognizer.recognize(
        ink,
        context: mlkit.DigitalInkRecognitionContext(
          preContext: preContext.length > 20 ? preContext.substring(preContext.length - 20) : preContext,
          writingArea: mlkit.WritingArea(width: box.width + 20, height: box.height + 20),
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
