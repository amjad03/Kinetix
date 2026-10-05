import 'package:flutter/services.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

/// Words from handwriting on Windows panels: the handwriting recogniser built into Windows
/// (Windows.UI.Input.Inking), on the panel itself, with no download.
///
/// The runner answers on the `kinetix/handwriting` channel (apps/board/windows/runner/
/// handwriting_channel.cpp):
/// * `languages` → the board languages (en, hi, kn) Windows has a recogniser for. Windows has
///   one for each handwriting language added in Settings → Time & language.
/// * `recognize` {language, strokes: [[x0, y0, x1, y1, …], …]} → for each word, its readings,
///   most likely first.
///
/// When the runner does not answer (an older build) or Windows has no recogniser, words stay
/// as ink.
class WindowsHandwriting implements HandwritingRecognizer {
  WindowsHandwriting({MethodChannel? channel}) : _channel = channel ?? const MethodChannel('kinetix/handwriting');

  final MethodChannel _channel;
  Future<Set<String>>? _languages;

  Future<Set<String>> _available() => _languages ??= () async {
    try {
      final list = await _channel.invokeListMethod<String>('languages');
      return {...?list};
    } on PlatformException {
      return <String>{};
    } on MissingPluginException {
      return <String>{};
    }
  }();

  @override
  String get engine => 'windows';

  @override
  bool get available => true;

  @override
  Future<HandwritingModelState> modelState(String language) async =>
      (await _available()).contains(language) ? HandwritingModelState.ready : HandwritingModelState.unsupported;

  /// Nothing to download: a language is added in Windows settings. Checks again, in case it was.
  @override
  Future<bool> prepare(String language) async {
    _languages = null;
    return (await _available()).contains(language);
  }

  @override
  Future<List<String>> recognize(List<Stroke> strokes, {required String language, String preContext = ''}) async {
    if (strokes.isEmpty || !(await _available()).contains(language)) return const [];
    try {
      final words = await _channel.invokeListMethod<Object?>('recognize', {
        'language': language,
        'strokes': [
          for (final s in strokes) [for (final p in s.points) ...[p.x, p.y]],
        ],
      });
      return lineReadings([
        for (final w in words ?? const [])
          if (w is List) [for (final c in w) '$c'],
      ]);
    } on PlatformException {
      return const [];
    } on MissingPluginException {
      return const [];
    }
  }

  /// A line's readings from its words' readings: the best word each time first, then the line
  /// with one word read another way.
  static List<String> lineReadings(List<List<String>> words, {int limit = 5}) {
    final ws = words.where((w) => w.isNotEmpty).toList();
    if (ws.isEmpty) return const [];
    final best = [for (final w in ws) w.first];
    final out = [best.join(' ')];
    for (var i = 0; i < ws.length && out.length < limit; i++) {
      for (final alt in ws[i].skip(1)) {
        final line = [...best]..[i] = alt;
        final s = line.join(' ');
        if (!out.contains(s)) out.add(s);
        if (out.length >= limit) break;
      }
    }
    return out;
  }
}
