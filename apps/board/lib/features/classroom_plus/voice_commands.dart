import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/models.dart' show AiLanguage;
import '../../l10n/feature_strings.dart';
import '../ai/voice_input.dart';
import 'plus_strings.dart';

/// What a spoken command asks the board to do.
enum VoiceAction { nextPage, previousPage, newPage, nextSlide, previousSlide, startTimer, stopTimer, pickStudent, attendance, undo, redo, penColor, usePen, useEraser, useHighlighter, openTool, stopListening }

class VoiceCommand {
  const VoiceCommand(this.action, {this.duration, this.color, this.tool});
  final VoiceAction action;

  /// For [VoiceAction.penColor]: the colour's name in [voiceColors].
  final String? color;

  /// For [VoiceAction.openTool]: the tools-drawer id.
  final String? tool;

  /// For [VoiceAction.startTimer].
  final Duration? duration;

  @override
  bool operator ==(Object other) => other is VoiceCommand && other.action == action && other.duration == duration && other.color == color && other.tool == tool;

  @override
  int get hashCode => Object.hash(action, duration, color, tool);

  @override
  String toString() => 'VoiceCommand($action, $duration, $color, $tool)';

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
    VoiceAction.penColor => s.n('cmdPenColor', color ?? ''),
    VoiceAction.usePen => s['cmdPen'],
    VoiceAction.useEraser => s['cmdEraser'],
    VoiceAction.useHighlighter => s['cmdHighlighter'],
    VoiceAction.openTool => s.n('cmdOpen', tool ?? ''),
    VoiceAction.stopListening => s['cmdStopListening'],
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
  if (_any(t, ['stop listening', 'stop voice', 'close voice', 'सुनना बंद', 'आदेश बंद', 'ಕೇಳುವುದನ್ನು ನಿಲ್ಲಿಸಿ', 'ಆಲಿಸುವುದನ್ನು ನಿಲ್ಲಿಸಿ'])) {
    return const VoiceCommand(VoiceAction.stopListening);
  }
  final penWords = _any(t, ['pen', 'colour', 'color', 'ink', 'पेन', 'कलम', 'रंग', 'ಪೆನ್', 'ಬಣ್ಣ']);
  if (penWords) {
    for (final e in voiceColors.entries) {
      if (_any(t, e.value.$2)) return VoiceCommand(VoiceAction.penColor, color: e.key);
    }
  }
  if (_any(t, ['eraser', 'erase', 'रबर', 'मिटाओ', 'मिटा', 'ಅಳಿಸು', 'ರಬ್ಬರ್'])) return const VoiceCommand(VoiceAction.useEraser);
  if (_any(t, ['highlighter', 'highlight', 'हाइलाइटर', 'ಹೈಲೈಟರ್'])) return const VoiceCommand(VoiceAction.useHighlighter);
  if (penWords && _any(t, ['use', 'switch', 'select', 'pick up', 'back to', 'चुनो', 'इस्तेमाल', 'ಬಳಸಿ', 'ಆರಿಸಿ']) || t == 'pen' || t == 'पेन' || t == 'ಪೆನ್') {
    return const VoiceCommand(VoiceAction.usePen);
  }
  if (_any(t, _openWords)) {
    for (final e in voiceTools.entries) {
      if (_any(t, e.value)) return VoiceCommand(VoiceAction.openTool, tool: e.key);
    }
  }
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

/// Pen colours by the names a teacher says, in English, Hindi and Kannada.
const voiceColors = <String, (Color, List<String>)>{
  'red': (Color(0xFFD93025), ['red', 'लाल', 'ಕೆಂಪು']),
  'blue': (Color(0xFF1A73E8), ['blue', 'नीला', 'नीली', 'ನೀಲಿ']),
  'green': (Color(0xFF188038), ['green', 'हरा', 'हरी', 'ಹಸಿರು']),
  'black': (Color(0xFF202124), ['black', 'काला', 'काली', 'ಕಪ್ಪು']),
  'white': (Color(0xFFFFFFFF), ['white', 'सफेद', 'सफ़ेद', 'ಬಿಳಿ']),
  'yellow': (Color(0xFFF9AB00), ['yellow', 'पीला', 'पीली', 'ಹಳದಿ']),
  'orange': (Color(0xFFE8710A), ['orange', 'नारंगी', 'ಕಿತ್ತಳೆ']),
  'purple': (Color(0xFF9334E6), ['purple', 'बैंगनी', 'ನೇರಳೆ']),
  'pink': (Color(0xFFE91E8C), ['pink', 'गुलाबी', 'ಗುಲಾಬಿ']),
};

/// Tools that can be opened by name: the board's tools-drawer id and what is said for it.
const voiceTools = <String, List<String>>{
  'dictionary': ['dictionary', 'शब्दकोश', 'ನಿಘಂಟು'],
  'calculator': ['calculator', 'कैलकुलेटर', 'कैलक्युलेटर', 'ಕ್ಯಾಲ್ಕುಲೇಟರ್'],
  'timeline': ['key dates', 'timeline', 'history dates', 'महत्वपूर्ण तिथियाँ', 'समयरेखा', 'ಮುಖ್ಯ ದಿನಾಂಕ', 'ಕಾಲರೇಖೆ'],
  'seating-chart': ['seat', 'seating', 'बैठने', 'सीटिंग', 'ಆಸನ'],
  'exit-ticket': ['exit ticket', 'एग्ज़िट टिकट', 'एग्जिट टिकट', 'ಎಕ್ಸಿಟ್ ಟಿಕೆಟ್'],
  'organisers': ['organiser', 'organizer', 'graphic', 'ऑर्गेनाइज़र', 'आयोजक', 'ಆರ್ಗನೈಸರ್'],
  'live-captions': ['caption', 'कैप्शन', 'ಶೀರ್ಷಿಕೆ'],
  'read-aloud': ['read aloud', 'reader', 'पढ़कर सुनाओ', 'रीडर', 'ರೀಡರ್'],
  'ruler': ['ruler', 'रूलर', 'पटरी', 'ರೂಲರ್'],
  'protractor': ['protractor', 'चाँदा', 'चांदा', 'ಚಾಂದ'],
  'compass': ['compass', 'परकार', 'ಕಂಪಾಸ್'],
  'periodic-table': ['periodic table', 'आवर्त सारणी', 'ಆವರ್ತ ಕೋಷ್ಟಕ'],
  'graph-plotter': ['graph', 'ग्राफ', 'ಗ್ರಾಫ್'],
  'buzzer': ['buzzer', 'बज़र', 'ಬಜರ್'],
  'scoreboard': ['scoreboard', 'स्कोरबोर्ड', 'ಸ್ಕೋರ್‌ಬೋರ್ಡ್'],
  'magnifier': ['magnifier', 'magnify', 'मैग्निफ़ायर', 'ಭೂತಗನ್ನಡಿ'],
  'ask-class': ['ask the class', 'ask class', 'poll', 'कक्षा से पूछो', 'ತರಗತಿಯನ್ನು ಕೇಳಿ'],
  'quick-quiz': ['quiz', 'क्विज़', 'ರಸಪ್ರಶ್ನೆ'],
};

const _openWords = ['open', 'show', 'launch', 'start', 'खोल', 'दिखा', 'शुरू', 'ತೆರೆ', 'ತೋರಿಸಿ', 'ಶುರು'];

/// The spoken commands the board understands, by what they do: the phrase to say in each
/// language and the action. The voice dialog lists them.
const voiceGuide = <(String, VoiceAction)>[
  ('guideNextPage', VoiceAction.nextPage),
  ('guideNewPage', VoiceAction.newPage),
  ('guideSlide', VoiceAction.nextSlide),
  ('guideTimer', VoiceAction.startTimer),
  ('guideStopTimer', VoiceAction.stopTimer),
  ('guidePick', VoiceAction.pickStudent),
  ('guideAttendance', VoiceAction.attendance),
  ('guideUndo', VoiceAction.undo),
  ('guidePenColor', VoiceAction.penColor),
  ('guidePen', VoiceAction.usePen),
  ('guideEraser', VoiceAction.useEraser),
  ('guideOpen', VoiceAction.openTool),
  ('guideStop', VoiceAction.stopListening),
];

/// Listens for spoken commands, one after another, and hands each to [run]; shows what was
/// heard, what was done, the commands to say, and keeps listening until it is closed or the
/// teacher says "stop listening".
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
  bool _listening = true, _failed = false;
  final _log = <(bool, String)>[];
  Timer? _timer;
  int _gen = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_listen());
  }

  Future<void> _listen() async {
    if (!mounted || !_listening) return;
    final g = ++_gen;
    final ok = await _voice.listen(
      widget.language,
      onWords: (w, d) {
        if (g == _gen) _words(w, d);
      },
      onProblem: (p) {
        if (g != _gen) return;
        if (p == VoiceProblem.noSpeech) {
          _again();
        } else {
          _fail();
        }
      },
    );
    if (!ok) _fail();
  }

  void _again() {
    _timer?.cancel();
    _timer = Timer(const Duration(milliseconds: 300), () => unawaited(_listen()));
  }

  void _fail() {
    if (!mounted) return;
    setState(() {
      _listening = false;
      _failed = true;
    });
  }

  void _words(String words, bool done) {
    if (!mounted) return;
    setState(() => _heard = words);
    if (!done) return;
    final s = plusStrings(context);
    final c = parseVoiceCommand(words);
    if (c?.action == VoiceAction.stopListening) {
      unawaited(Navigator.maybePop(context));
      return;
    }
    setState(() {
      final ok = c != null && widget.run(c);
      _log.insert(0, (ok, ok ? s.n('voiceDone', c.describe(s)) : s.n('voiceUnknown', words)));
      if (_log.length > 4) _log.removeLast();
    });
    _again();
  }

  @override
  void dispose() {
    _gen++;
    _timer?.cancel();
    unawaited(_voice.stop());
    _voice.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = plusStrings(context);
    final c = context.colors;
    return AlertDialog(
      key: const Key('voice-commands'),
      title: Row(children: [Icon(_listening ? Icons.mic : Icons.mic_off), const SizedBox(width: Kx.s8), Flexible(child: Text(s['voiceCommands']))]),
      content: SizedBox(
        width: 520,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (_listening) Text(s['voiceListening'], key: const Key('voice-listening'), style: context.text.titleMedium),
              if (_failed) Text(s['voiceUnavailable'], key: const Key('voice-result'), style: context.text.bodyLarge?.copyWith(color: c.error)),
              if (_heard.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text('“$_heard”', key: const Key('voice-heard'), style: context.text.titleLarge)),
              for (final (i, (ok, text)) in _log.indexed)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Row(
                    children: [
                      Icon(ok ? Icons.check_circle : Icons.help_outline, size: 18, color: ok ? Kx.success : c.error),
                      const SizedBox(width: 6),
                      Expanded(child: Text(text, key: i == 0 ? const Key('voice-result') : null)),
                    ],
                  ),
                ),
              const Divider(height: Kx.s16),
              Text(s['voiceGuideTitle'], style: context.text.titleSmall),
              const SizedBox(height: 4),
              for (final (key, _) in voiceGuide)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Text('• ${s[key]}', key: Key('voice-guide-$key'), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                ),
            ],
          ),
        ),
      ),
      actions: [TextButton(key: const Key('voice-close'), onPressed: () => Navigator.pop(context), child: Text(s['close']))],
    );
  }
}
