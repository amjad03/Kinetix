import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:speech_to_text/speech_recognition_error.dart';
import 'package:speech_to_text/speech_to_text.dart';

import '../../core/models.dart';

/// Why listening stopped without words.
enum VoiceProblem {
  /// No recogniser, or the microphone was refused.
  unavailable,

  /// The device has no on-device model for the language (it can be downloaded in the device's
  /// speech settings).
  language,

  /// Nothing was heard.
  noSpeech,
}

/// Spoken questions for KINETIX AI: the device's own speech recogniser, on the device (no voice
/// leaves the board), in English, Hindi or Kannada.
abstract class VoiceInput {
  /// The board's recogniser; tests put a fake here.
  static VoiceInput Function() create = SpeechVoiceInput.new;

  /// Listens in [language]: [onWords] gets the words so far and, once, the final words
  /// (`done`); [onProblem] when it cannot. False when listening could not start.
  Future<bool> listen(AiLanguage language, {required void Function(String words, bool done) onWords, required void Function(VoiceProblem p) onProblem});

  /// Stops listening; what was heard arrives as the final words.
  Future<void> stop();

  void dispose() {}
}

/// The `speech_to_text` plugin (Android's SpeechRecognizer, Windows speech).
class SpeechVoiceInput extends VoiceInput {
  final _speech = SpeechToText();
  bool? _ready;
  void Function(VoiceProblem p)? _onProblem;

  static const _tags = {AiLanguage.en: 'en_IN', AiLanguage.hi: 'hi_IN', AiLanguage.kn: 'kn_IN'};

  @override
  Future<bool> listen(AiLanguage language, {required void Function(String words, bool done) onWords, required void Function(VoiceProblem p) onProblem}) async {
    _onProblem = onProblem;
    try {
      _ready ??= await _speech.initialize(onError: _error);
    } catch (e) {
      debugPrint('Speech recognition not available: $e');
      _ready = false;
    }
    if (_ready != true) {
      onProblem(VoiceProblem.unavailable);
      return false;
    }
    final locale = await _locale(language);
    await _speech.listen(
      onResult: (r) => onWords(r.recognizedWords, r.finalResult),
      listenOptions: SpeechListenOptions(localeId: locale, onDevice: true, partialResults: true, cancelOnError: true, listenFor: const Duration(seconds: 30), pauseFor: const Duration(seconds: 3)),
    );
    return true;
  }

  /// The recogniser's own tag for [language] (en-IN, hi_IN or similar), or the nearest it has.
  Future<String?> _locale(AiLanguage language) async {
    final want = _tags[language]!;
    try {
      final all = await _speech.locales();
      String norm(String s) => s.replaceAll('-', '_').toLowerCase();
      return all.where((l) => norm(l.localeId) == norm(want)).firstOrNull?.localeId ??
          all.where((l) => norm(l.localeId).startsWith('${language.name}_')).firstOrNull?.localeId ??
          want;
    } catch (_) {
      return want;
    }
  }

  void _error(SpeechRecognitionError e) {
    final msg = e.errorMsg;
    _onProblem?.call(switch (msg) {
      'error_no_match' || 'error_speech_timeout' => VoiceProblem.noSpeech,
      'error_language_not_supported' || 'error_language_unavailable' || 'error_server' || 'error_network' => VoiceProblem.language,
      _ => VoiceProblem.unavailable,
    });
  }

  @override
  Future<void> stop() => _speech.stop();

  @override
  void dispose() => unawaited(_speech.cancel());
}
