import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/models.dart' show AiLanguage;
import '../../l10n/feature_strings.dart';
import '../ai/voice_input.dart';

FeatureStrings captionStrings(BuildContext context) => FeatureStrings(boardLang(context), captionStringTable);

const captionStringTable = <String, Map<String, String>>{
  'en': {
    'title': 'Live captions',
    'listening': 'Listening…',
    'stop': 'Stop captions',
    'save': 'Save captions',
    'bigger': 'Bigger',
    'smaller': 'Smaller',
    'unavailable': 'Captions need the board\'s speech recogniser and the microphone.',
    'language': 'This language\'s speech model is not on the board. Download it in the device\'s speech settings.',
    'onDevice': 'On the board: no voice leaves it',
    'top': 'Captions at the top',
    'bottom': 'Captions at the bottom',
    'opacity': 'Background',
    'saveText': 'Save as text',
  },
  'hi': {
    'title': 'लाइव कैप्शन',
    'listening': 'सुन रहा है…',
    'stop': 'कैप्शन बंद करें',
    'save': 'कैप्शन सहेजें',
    'bigger': 'बड़ा',
    'smaller': 'छोटा',
    'unavailable': 'कैप्शन के लिए बोर्ड का स्पीच रिकग्नाइज़र और माइक्रोफ़ोन चाहिए।',
    'language': 'इस भाषा का स्पीच मॉडल बोर्ड पर नहीं है। इसे डिवाइस की स्पीच सेटिंग में डाउनलोड करें।',
    'onDevice': 'बोर्ड पर ही: कोई आवाज़ बाहर नहीं जाती',
    'top': 'कैप्शन ऊपर',
    'bottom': 'कैप्शन नीचे',
    'opacity': 'पृष्ठभूमि',
    'saveText': 'टेक्स्ट में सहेजें',
  },
  'kn': {
    'title': 'ಲೈವ್ ಶೀರ್ಷಿಕೆಗಳು',
    'listening': 'ಆಲಿಸುತ್ತಿದೆ…',
    'stop': 'ಶೀರ್ಷಿಕೆ ನಿಲ್ಲಿಸಿ',
    'save': 'ಶೀರ್ಷಿಕೆ ಉಳಿಸಿ',
    'bigger': 'ದೊಡ್ಡದು',
    'smaller': 'ಚಿಕ್ಕದು',
    'unavailable': 'ಶೀರ್ಷಿಕೆಗಳಿಗೆ ಬೋರ್ಡ್‌ನ ಧ್ವನಿ ಗುರುತಿಸುವಿಕೆ ಮತ್ತು ಮೈಕ್ರೊಫೋನ್ ಬೇಕು.',
    'language': 'ಈ ಭಾಷೆಯ ಧ್ವನಿ ಮಾದರಿ ಬೋರ್ಡ್‌ನಲ್ಲಿ ಇಲ್ಲ. ಸಾಧನದ ಧ್ವನಿ ಸೆಟ್ಟಿಂಗ್‌ನಲ್ಲಿ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ.',
    'onDevice': 'ಬೋರ್ಡ್‌ನಲ್ಲೇ: ಯಾವ ಧ್ವನಿಯೂ ಹೊರಹೋಗದು',
    'top': 'ಶೀರ್ಷಿಕೆ ಮೇಲೆ',
    'bottom': 'ಶೀರ್ಷಿಕೆ ಕೆಳಗೆ',
    'opacity': 'ಹಿನ್ನೆಲೆ',
    'saveText': 'ಪಠ್ಯವಾಗಿ ಉಳಿಸಿ',
  },
};

/// One finished caption: when it started (from the start of captions) and what was said.
typedef Caption = ({Duration at, Duration end, String text});

/// Live captions: the teacher's words as subtitles on the board, recognised on the board itself
/// (the device's speech recogniser, as KINETIX AI's voice input) in English, Hindi or Kannada,
/// for hearing-impaired students; kept as a transcript (WebVTT) for the lesson recording.
class CaptionsController extends ChangeNotifier {
  CaptionsController({VoiceInput Function()? voice, DateTime Function()? now, this.restartDelay = const Duration(milliseconds: 150)})
    : _voice = voice ?? VoiceInput.create,
      _now = now ?? DateTime.now;

  final VoiceInput Function() _voice;
  final DateTime Function() _now;

  /// The pause before listening again (the recogniser needs a moment between sessions).
  final Duration restartDelay;
  VoiceInput? _input;
  Timer? _timer;

  /// Which listening session is current; words from an older one are dropped.
  int _gen = 0;

  bool on = false;
  AiLanguage language = AiLanguage.en;
  double fontSize = 34;

  /// Captions at the top of the board instead of the bottom.
  bool atTop = false;

  /// How solid the band behind the words is (0.3 to 1).
  double opacity = 0.85;

  /// The words being said now (not final yet).
  String current = '';
  final transcript = <Caption>[];
  VoiceProblem? problem;
  DateTime? _startedAt, _lineStarted;

  Duration get _elapsed => _now().difference(_startedAt ?? _now());

  Future<void> start() async {
    if (on) return;
    on = true;
    problem = null;
    _startedAt ??= _now();
    _input ??= _voice();
    notifyListeners();
    await _listen();
  }

  Future<void> _listen() async {
    if (!on) return;
    _lineStarted = null;
    final g = ++_gen;
    final ok = await _input!.listen(
      language,
      onWords: (w, d) {
        if (g == _gen) _onWords(w, d);
      },
      onProblem: (p) {
        if (g == _gen) _onProblem(p);
      },
    );
    if (!ok && on && g == _gen) {
      on = false;
      notifyListeners();
    }
  }

  /// Listens again shortly (after a sentence, or after silence).
  void _again([Duration? after]) {
    _timer?.cancel();
    _timer = Timer(after ?? restartDelay, () => unawaited(_listen()));
  }

  void _onWords(String words, bool done) {
    if (!on) return;
    _lineStarted ??= _now();
    current = words;
    if (done) {
      _commit(words);
      _again();
    }
    notifyListeners();
  }

  /// Keeps [words] as a finished caption line.
  void _commit(String words) {
    final text = words.trim();
    if (text.isNotEmpty) {
      final at = (_lineStarted ?? _now()).difference(_startedAt ?? _now());
      transcript.add((at: at, end: _elapsed, text: text));
    }
    current = '';
    _lineStarted = null;
  }

  void _onProblem(VoiceProblem p) {
    if (p == VoiceProblem.noSpeech && on) {
      // Nobody spoke: keep listening, a little slower than after a sentence.
      _commit(current);
      _again(const Duration(milliseconds: 400));
      notifyListeners();
      return;
    }
    problem = p;
    on = false;
    notifyListeners();
  }

  /// Switches the language; if captions are on they carry on in the new language.
  Future<void> setLanguage(AiLanguage l) async {
    language = l;
    if (on) {
      _gen++;
      _timer?.cancel();
      _commit(current);
      problem = null;
      notifyListeners();
      await _input?.stop();
      _again();
    }
    notifyListeners();
  }

  void resize(double d) {
    fontSize = (fontSize + d).clamp(20, 72);
    notifyListeners();
  }

  void toggleTop() {
    atTop = !atTop;
    notifyListeners();
  }

  void setOpacity(double v) {
    opacity = v.clamp(0.3, 1.0);
    notifyListeners();
  }

  Future<void> stop() async {
    on = false;
    _gen++;
    _timer?.cancel();
    _commit(current);
    notifyListeners();
    await _input?.stop();
  }

  /// The captions so far as WebVTT, to go with the lesson's recording.
  String toVtt() {
    String t(Duration d) {
      final h = d.inHours.toString().padLeft(2, '0');
      final m = (d.inMinutes % 60).toString().padLeft(2, '0');
      final s = (d.inSeconds % 60).toString().padLeft(2, '0');
      final ms = (d.inMilliseconds % 1000).toString().padLeft(3, '0');
      return '$h:$m:$s.$ms';
    }

    final b = StringBuffer('WEBVTT\n\n');
    for (final (i, c) in transcript.indexed) {
      final end = c.end > c.at ? c.end : c.at + const Duration(seconds: 2);
      b
        ..writeln('${i + 1}')
        ..writeln('${t(c.at)} --> ${t(end)}')
        ..writeln(c.text)
        ..writeln();
    }
    return b.toString();
  }

  /// The captions as plain text, one line per sentence, with the minute each began.
  String toText() {
    final b = StringBuffer();
    for (final c in transcript) {
      final m = c.at.inMinutes.toString().padLeft(2, '0');
      final s = (c.at.inSeconds % 60).toString().padLeft(2, '0');
      b.writeln('[$m:$s] ${c.text}');
    }
    return b.toString();
  }

  @override
  void dispose() {
    on = false;
    _gen++;
    _timer?.cancel();
    _input?.dispose();
    super.dispose();
  }
}
/// Live captions over the board (an overlay above everything, so the board stays usable).
abstract final class LiveCaptions {
  static CaptionsController? controller;
  static OverlayEntry? _entry;

  /// Saves the transcript (tests replace it).
  static Future<void> Function(String name, Uint8List bytes) share = (name, bytes) =>
      SharePlus.instance.share(ShareParams(files: [XFile.fromData(bytes, name: name, mimeType: name.endsWith('.txt') ? 'text/plain' : 'text/vtt')], fileNameOverrides: [name]));

  static bool get showing => _entry != null;

  /// Starts captions (or stops them when they are on).
  static Future<void> toggle(BuildContext context) async {
    if (_entry?.mounted ?? false) {
      await hide();
      return;
    }
    // An entry whose board has gone (a new board, a test) is forgotten.
    _entry = null;
    final overlay = Overlay.of(context, rootOverlay: true);
    final c = controller ??= CaptionsController();
    if (c.on) await c.stop();
    _entry = OverlayEntry(builder: (_) => CaptionsOverlay(controller: c, onClose: hide));
    overlay.insert(_entry!);
    await c.start();
  }

  static Future<void> hide() async {
    if (_entry?.mounted ?? false) _entry!.remove();
    _entry = null;
    await controller?.stop();
  }
}

/// The subtitles: the last line said and the words being said, big, on a dark band at the
/// bottom of the board, with the language, the size, Save and Stop.
class CaptionsOverlay extends StatelessWidget {
  const CaptionsOverlay({super.key, required this.controller, required this.onClose});

  final CaptionsController controller;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final s = captionStrings(context);
        final c = controller;
        final last = c.transcript.isEmpty ? '' : c.transcript.last.text;
        final problem = c.problem;
        final text = problem != null
            ? s[problem == VoiceProblem.language ? 'language' : 'unavailable']
            : [if (last.isNotEmpty) last, if (c.current.isNotEmpty) c.current].join('\n');
        return Positioned(
          left: 0,
          right: 0,
          bottom: c.atTop ? null : 104,
          top: c.atTop ? 16 : null,
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1200),
              child: Material(
                key: const Key('captions-overlay'),
                color: Colors.black.withValues(alpha: c.opacity),
                borderRadius: Kx.radiusLg,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s8, Kx.s12),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Icon(c.on ? Icons.closed_caption : Icons.closed_caption_disabled_outlined, color: Colors.white70, size: 20),
                          const SizedBox(width: Kx.s8),
                          Expanded(child: Text(c.on ? '${s['title']} · ${s['onDevice']}' : s['title'], style: const TextStyle(color: Colors.white70, fontSize: 13), overflow: TextOverflow.ellipsis)),
                          IconButton(key: const Key('captions-stop'), tooltip: s['stop'], color: Colors.white, onPressed: onClose, icon: const Icon(Icons.close)),
                        ],
                      ),
                      Wrap(
                        alignment: WrapAlignment.end,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        spacing: 2,
                        children: [
                          for (final l in AiLanguage.values)
                            ChoiceChip(
                              key: Key('captions-lang-${l.name}'),
                              label: Text(l.short),
                              selected: c.language == l,
                              visualDensity: VisualDensity.compact,
                              onSelected: (_) => c.setLanguage(l),
                            ),
                          IconButton(key: const Key('captions-smaller'), tooltip: s['smaller'], color: Colors.white, onPressed: () => c.resize(-4), icon: const Icon(Icons.text_decrease)),
                          IconButton(key: const Key('captions-bigger'), tooltip: s['bigger'], color: Colors.white, onPressed: () => c.resize(4), icon: const Icon(Icons.text_increase)),
                          IconButton(key: const Key('captions-position'), tooltip: s[c.atTop ? 'bottom' : 'top'], color: Colors.white, onPressed: c.toggleTop, icon: Icon(c.atTop ? Icons.vertical_align_bottom : Icons.vertical_align_top)),
                          IconButton(key: const Key('captions-opacity'), tooltip: s['opacity'], color: Colors.white, onPressed: () => c.setOpacity(c.opacity >= 1 ? 0.4 : c.opacity + 0.2), icon: const Icon(Icons.opacity)),
                          IconButton(
                            key: const Key('captions-save-text'),
                            tooltip: s['saveText'],
                            color: Colors.white,
                            onPressed: c.transcript.isEmpty ? null : () => LiveCaptions.share('KINETIX captions.txt', Uint8List.fromList(utf8.encode(c.toText()))),
                            icon: const Icon(Icons.description_outlined),
                          ),
                          IconButton(
                            key: const Key('captions-save'),
                            tooltip: s['save'],
                            color: Colors.white,
                            onPressed: c.transcript.isEmpty ? null : () => LiveCaptions.share('KINETIX captions.vtt', Uint8List.fromList(utf8.encode(c.toVtt()))),
                            icon: const Icon(Icons.save_alt),
                          ),
                        ],
                      ),
                      Text(
                        text.isEmpty ? s['listening'] : text,
                        key: const Key('captions-text'),
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white, fontSize: c.fontSize, height: 1.25, fontWeight: FontWeight.w600, fontFamilyFallback: KxFonts.fallback),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
