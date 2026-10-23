import 'package:flutter/foundation.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../models.dart' show SketchReading;

/// Asks the board's AI what a PNG of some ink says or shows ([mode]: auto, sketch or
/// handwriting); null when it cannot be asked (offline, not signed in).
typedef CloudInkReader = Future<SketchReading?> Function(Uint8List png, String mode);

/// [ink] drawn black on white, cropped to it with a margin, no wider than [maxWidth]: what the
/// board's AI is shown.
Future<Uint8List> inkPng(List<Stroke> ink, {double maxWidth = 768}) {
  final box = inkBounds(ink).inflate(24);
  return renderPagePng(ink, BoardBackground.plain, box.size, area: box, maxWidth: maxWidth);
}

/// Handwriting to text where the board has no model of its own (macOS, a Windows panel without
/// the language, Linux): the board's own reader first when it can read the language, else the
/// institution's AI reads a picture of the ink (POST /v1/ai/recognize-sketch). Only while
/// [online] (signed in and connected): offline, words stay as ink as before.
class CloudHandwriting implements HandwritingRecognizer {
  CloudHandwriting(this.local, {required this.online, required this.read, this.render = inkPng});

  final HandwritingRecognizer local;
  final bool Function() online;
  final CloudInkReader read;
  final Future<Uint8List> Function(List<Stroke> ink) render;

  @override
  String get engine => '${local.engine}+cloud';

  @override
  bool get available => local.available || online();

  @override
  Future<HandwritingModelState> modelState(String language) async {
    final mine = local.available ? await local.modelState(language) : HandwritingModelState.unsupported;
    if (mine == HandwritingModelState.ready || !online()) return mine;
    return HandwritingModelState.ready;
  }

  @override
  Future<bool> prepare(String language) async => (await local.prepare(language)) || online();

  @override
  Future<List<String>> recognize(List<Stroke> strokes, {required String language, String preContext = ''}) async {
    if (local.available && await local.modelState(language) == HandwritingModelState.ready) {
      final mine = await local.recognize(strokes, language: language, preContext: preContext);
      if (mine.isNotEmpty || !online()) return mine;
    }
    if (strokes.isEmpty || !online()) return const [];
    try {
      final r = await read(await render(strokes), 'handwriting');
      final text = r?.text?.trim();
      return text == null || text.isEmpty ? const [] : [text];
    } catch (e) {
      debugPrint('Cloud handwriting: $e');
      return const [];
    }
  }
}
