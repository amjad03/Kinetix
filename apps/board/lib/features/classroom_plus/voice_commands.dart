import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/models.dart' show AiLanguage;
import '../../l10n/feature_strings.dart';
import '../ai/voice_input.dart';
import 'plus_strings.dart';

/// What a spoken command asks the board to do.
enum VoiceAction { nextPage, previousPage, newPage, nextSlide, previousSlide, startTimer, stopTimer, pickStudent, attendance, undo, redo }

class VoiceCommand {
  const VoiceCommand(this.action, {this.duration});
  final VoiceAction action;

  /// For [VoiceAction.startTimer].
  final Duration? duration;

  @override
  bool operator ==(Object other) => other is VoiceCommand && other.action == action && other.duration == duration;

  @override
  int get hashCode => Object.hash(action, duration);

  @override
  String toString() => 'VoiceCommand($action, $duration)';

  /// What the board says it did ("Next page", "Timer for 5 minutes").
  String describe(FeatureStrings s) => switch (action) {
    VoiceAction.nextPage => s['cmdNextPage'],
    VoiceAction.previousPage => s['cmdPreviousPage'],
    VoiceAction.newPage => s['cmdNewPage'],
    VoiceAction.nextSlide => s['cmdNextSlide'],
    VoiceAction.previousSlide => s['cmdPreviousSlide'],
    VoiceAction.startTimer => s.n('cmdTimer', _minutesText(duration ?? const Duration(minutes: 1))),
    VoiceAction.stopTimer => s['cmdStopTimer'],
    VoiceAction.pickStudent => s['cmdPick'],
    VoiceAction.attendance => s['cmdAttendance'],
    VoiceAction.undo => s['cmdUndo'],
    VoiceAction.redo => s['cmdRedo'],
  };
}

String _minutesText(Duration d) => d.inSeconds % 60 == 0 ? '${d.inMinutes}' : (d.inSeconds / 60).toStringAsFixed(1);

/// Number words the recognisers write out, in English, Hindi and Kannada.
const _numberWords = <String, int>{
  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'fifteen': 15, 'twenty': 20, 'thirty': 30, 'half': 0,
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पाँच': 5, 'पांच': 5, 'छह': 6, 'छः': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10,
  'पंद्रह': 15, 'बीस': 20, 'तीस': 30,
  'ಒಂದು': 1, 'ಎರಡು': 2, 'ಮೂರು': 3, 'ನಾಲ್ಕು': 4, 'ಐದು': 5, 'ಆರು': 6, 'ಏಳು': 7, 'ಎಂಟು': 8, 'ಒಂಬತ್ತು': 9, 'ಹತ್ತು': 10,
  'ಹದಿನೈದು': 15, 'ಇಪ್ಪತ್ತು': 20, 'ಮೂವತ್ತು': 30,
};

/// The first number in [text]: digits (also Devanagari and Kannada digits) or a number word.
int? _number(String text) {
  final western = text.replaceAllMapped(RegExp('[०-९೦-೯]'), (m) {
    final c = m[0]!.codeUnitAt(0);
    return '${c >= 0x0CE6 ? c - 0x0CE6 : c - 0x0966}';
  });
  final digits = RegExp(r'\d+').firstMatch(western);
  if (digits != null) return int.parse(digits[0]!);
  for (final word in western.split(RegExp(r'[\s,.!?]+'))) {
    final n = _numberWords[word];
    if (n != null && n > 0) return n;
  }
  return null;
}

bool _any(String text, List<String> words) => words.any(text.contains);

/// Reads a spoken command in English, Hindi or Kannada; null when it is not one. Only the
/// words, never the voice, are used, and only on the board.
VoiceCommand? parseVoiceCommand(String spoken) {
  final t = spoken.toLowerCase().trim();
  if (t.isEmpty) return null;
  const timer = ['timer', 'टाइमर', 'ಟೈಮರ್'];
  if (_any(t, timer)) {
    if (_any(t, ['stop', 'cancel', 'end', 'रोको', 'रोकें', 'बंद', 'ನಿಲ್ಲಿಸಿ', 'ನಿಲ್ಲಿಸು'])) return const VoiceCommand(VoiceAction.stopTimer);
    final n = _number(t) ?? 1;
    final seconds = _any(t, ['second', 'सेकंड', 'ಸೆಕೆಂಡ್']);
    final d = seconds ? Duration(seconds: n.clamp(5, 3600)) : Duration(minutes: n.clamp(1, 60));
    return VoiceCommand(VoiceAction.startTimer, duration: d);
  }
  final slide = _any(t, ['slide', 'स्लाइड', 'ಸ್ಲೈಡ್']);
  final next = _any(t, ['next', 'forward', 'अगला', 'अगली', 'आगे', 'ಮುಂದಿನ', 'ಮುಂದೆ']);
  final back = _any(t, ['previous', 'back', 'last', 'पिछला', 'पिछली', 'पीछे', 'ಹಿಂದಿನ', 'ಹಿಂದೆ']);
  if (slide && next) return const VoiceCommand(VoiceAction.nextSlide);
  if (slide && back) return const VoiceCommand(VoiceAction.previousSlide);
  if (_any(t, ['new page', 'add page', 'blank page', 'add a page', 'नया पेज', 'नया पन्ना', 'ಹೊಸ ಪುಟ'])) return const VoiceCommand(VoiceAction.newPage);
  if (_any(t, ['attendance', 'हाज़िरी', 'हाजिरी', 'उपस्थिति', 'ಹಾಜರಾತಿ', 'ಹಾಜರಿ'])) return const VoiceCommand(VoiceAction.attendance);
  if (_any(t, ['pick a student', 'pick someone', 'random student', 'choose a student', 'pick student', 'विद्यार्थी चुन', 'छात्र चुन', 'बच्चा चुन', 'ವಿದ್ಯಾರ್ಥಿಯನ್ನು ಆರಿಸಿ', 'ವಿದ್ಯಾರ್ಥಿ ಆರಿಸಿ'])) {
    return const VoiceCommand(VoiceAction.pickStudent);
  }
  if (_any(t, ['redo', 'फिर से करो', 'फिर से करें', 'ಮತ್ತೆ ಮಾಡಿ'])) return const VoiceCommand(VoiceAction.redo);
  if (_any(t, ['undo', 'पूर्ववत', 'वापस लो', 'ರದ್ದುಮಾಡಿ', 'ರದ್ದು ಮಾಡಿ'])) return const VoiceCommand(VoiceAction.undo);
  final page = _any(t, ['page', 'पेज', 'पन्ना', 'पृष्ठ', 'ಪುಟ']);
  if (next && (page || t.split(' ').length <= 2)) return const VoiceCommand(VoiceAction.nextPage);
  if (back && (page || t.split(' ').length <= 2)) return const VoiceCommand(VoiceAction.previousPage);
  return null;
}

/// Listens for one spoken command and hands it to [run]; shows what was heard and what was done.
class VoiceCommandDialog extends StatefulWidget {
  const VoiceCommandDialog({super.key, required this.language, required this.run});

  final AiLanguage language;

  /// Does the command; false when the board could not (no slides open, say).
  final bool Function(VoiceCommand c) run;

  static Future<void> open(BuildContext context, {required AiLanguage language, required bool Function(VoiceCommand c) run}) =>
      showDialog<void>(context: context, builder: (_) => VoiceCommandDialog(language: language, run: run));

  @override
  State<VoiceCommandDialog> createState() => _VoiceCommandDialogState();
}

class _VoiceCommandDialogState extends State<VoiceCommandDialog> {
  final VoiceInput _voice = VoiceInput.create();
  String _heard = '';
  String? _result;
  bool _listening = true;

  @override
  void initState() {
    super.initState();
    unawaited(_listen());
  }

  Future<void> _listen() async {
    final ok = await _voice.listen(widget.language, onWords: _words, onProblem: (_) => _fail());
    if (!ok) _fail();
  }

  void _fail() {
    if (!mounted) return;
    setState(() {
      _listening = false;
      _result = plusStrings(context)['voiceUnavailable'];
    });
  }

  void _words(String words, bool done) {
    if (!mounted) return;
    setState(() => _heard = words);
    if (!done) return;
    final s = plusStrings(context);
    final c = parseVoiceCommand(words);
    setState(() {
      _listening = false;
      _result = c != null && widget.run(c) ? s.n('voiceDone', c.describe(s)) : s.n('voiceUnknown', words);
    });
    if (c != null) {
      Future.delayed(const Duration(milliseconds: 900), () {
        if (mounted) unawaited(Navigator.maybePop(context));
      });
    }
  }

  @override
  void dispose() {
    unawaited(_voice.stop());
    _voice.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = plusStrings(context);
    return AlertDialog(
      key: const Key('voice-commands'),
      title: Row(children: [Icon(_listening ? Icons.mic : Icons.mic_none), const SizedBox(width: Kx.s8), Flexible(child: Text(s['voiceCommands']))]),
      content: SizedBox(
        width: 460,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (_listening) Text(s['voiceListening'], style: context.text.titleMedium),
            if (_heard.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text('“$_heard”', key: const Key('voice-heard'), style: context.text.titleLarge)),
            if (_result != null) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(_result!, key: const Key('voice-result'), style: context.text.bodyLarge)),
            const SizedBox(height: Kx.s12),
            Text(s['voiceExamples'], style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
          ],
        ),
      ),
      actions: [
        if (_listening) TextButton(key: const Key('voice-stop'), onPressed: () => unawaited(_voice.stop()), child: Text(s['voiceStop'])),
        TextButton(onPressed: () => Navigator.pop(context), child: Text(s['close'])),
      ],
    );
  }
}
