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
  },
};

/// One finished caption: when it started (from the start of captions) and what was said.
typedef Caption = ({Duration at, Duration end, String text});

/// Live captions: the teacher's words as subtitles on the board, recognised on the board itself
/// (the device's speech recogniser, as KINETIX AI's voice input) in English, Hindi or Kannada,
/// for hearing-impaired students; kept as a transcript (WebVTT) for the lesson recording.
class CaptionsController extends ChangeNotifier {
  CaptionsController({VoiceInput Function()? voice, DateTime Function()? now})
    : _voice = voice ?? VoiceInput.create,
      _now = now ?? DateTime.now;

  final VoiceInput Function() _voice;
  final DateTime Function() _now;
  VoiceInput? _input;

  bool on = false;
  AiLanguage language = AiLanguage.en;
  double fontSize = 34;

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
    final ok = await _input!.listen(language, onWords: _onWords, onProblem: _onProblem);
    if (!ok && on) {
      on = false;
      notifyListeners();
    }
  }

  void _onWords(String words, bool done) {
    if (!on) return;
    _lineStarted ??= _now();
    current = words;
    if (done) {
      final text = words.trim();
      if (text.isNotEmpty) {
        final at = _lineStarted!.difference(_startedAt!);
        transcript.add((at: at, end: _elapsed, text: text));
      }
      current = '';
      scheduleMicrotask(_listen);
    }
    notifyListeners();
  }

  void _onProblem(VoiceProblem p) {
    if (p == VoiceProblem.noSpeech && on) {
      scheduleMicrotask(_listen);
      return;
    }
    problem = p;
    on = false;
    notifyListeners();
  }

  Future<void> setLanguage(AiLanguage l) async {
    language = l;
    notifyListeners();
    if (on) {
      await _input?.stop();
    }
  }

  void resize(double d) {
    fontSize = (fontSize + d).clamp(20, 72);
    notifyListeners();
  }

  Future<void> stop() async {
    on = false;
    current = '';
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

  @override
  void dispose() {
    on = false;
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
      SharePlus.instance.share(ShareParams(files: [XFile.fromData(bytes, name: name, mimeType: 'text/vtt')], fileNameOverrides: [name]));

  static bool get showing => _entry != null;

  /// Starts captions (or stops them when they are on).
  static Future<void> toggle(BuildContext context) async {
    if (_entry != null) {
      await hide();
      return;
    }
    final c = controller ??= CaptionsController();
    _entry = OverlayEntry(builder: (_) => CaptionsOverlay(controller: c, onClose: hide));
    Overlay.of(context, rootOverlay: true).insert(_entry!);
    await c.start();
  }

  static Future<void> hide() async {
    _entry?.remove();
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
          bottom: 104,
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1200),
              child: Material(
                key: const Key('captions-overlay'),
                color: const Color(0xD9000000),
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
