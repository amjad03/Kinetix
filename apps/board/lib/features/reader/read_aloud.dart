import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';
import '../board/panel/panel_host.dart';

/// Read aloud and the immersive reader (from the KINETIX prototype): the board's own voices
/// (Android text-to-speech, Windows speech) read English, Hindi and Kannada where the device
/// has them. Nothing is sent anywhere.

/// The words on a page in reading order (top to bottom, then left to right): typed text and
/// notes. Covered answers stay covered; code is skipped (read out, code is noise).
List<String> readableElements(Iterable<BoardElement> elements) {
  final items = <(Rect, String)>[
    for (final e in elements)
      if (e is TextElement && e.text.trim().isNotEmpty)
        (e.bounds, e.text.trim())
      else if (e is NoteElement && !e.hidden && e.kind != NoteKind.code && e.text.trim().isNotEmpty)
        (e.bounds, e.text.trim()),
  ];
  // Things on (about) the same line read left to right.
  items.sort((a, b) {
    final dy = a.$1.top - b.$1.top;
    if (dy.abs() > 12) return dy.sign.toInt();
    return a.$1.left.compareTo(b.$1.left);
  });
  return [for (final (_, t) in items) t];
}

/// The voice for [text]: Hindi for Devanagari, Kannada for Kannada script, else Indian English.
String readerLang(String text) {
  if (RegExp(r'[ಀ-೿]').hasMatch(text)) return 'kn-IN';
  if (RegExp(r'[ऀ-ॿ]').hasMatch(text)) return 'hi-IN';
  return 'en-IN';
}

/// Speaks for the reader (tests swap in a fake).
abstract class ReaderVoice {
  static ReaderVoice Function() make = TtsReaderVoice.new;

  /// The word being spoken: character offsets in the text.
  void Function(int start, int end)? onWord;
  VoidCallback? onDone;

  /// False when this device has no voice for [lang] ("hi-IN").
  Future<bool> speak(String text, String lang, double rate);
  Future<void> stop();
  void dispose();
}

class TtsReaderVoice implements ReaderVoice {
  TtsReaderVoice() {
    _tts.setProgressHandler((text, start, end, word) => onWord?.call(start, end));
    _tts.setCompletionHandler(() => onDone?.call());
  }

  final _tts = FlutterTts();
  Set<String>? _languages;

  @override
  void Function(int start, int end)? onWord;
  @override
  VoidCallback? onDone;

  /// Whether the device lists a voice for [lang]: "hi-IN", else any Hindi ("hi_IN", "hi").
  Future<bool> _has(String lang) async {
    try {
      _languages ??= {for (final l in (await _tts.getLanguages as List? ?? const [])) '$l'.toLowerCase().replaceAll('_', '-')};
    } catch (_) {
      _languages = {};
    }
    final want = lang.toLowerCase();
    final base = want.split('-').first;
    if (_languages!.isEmpty) {
      // Engines that cannot list their languages: ask about this one.
      try {
        return await _tts.isLanguageAvailable(lang) != false;
      } catch (_) {
        return base == 'en';
      }
    }
    return _languages!.any((l) => l == want || l == base || l.startsWith('$base-'));
  }

  @override
  Future<bool> speak(String text, String lang, double rate) async {
    try {
      if (!await _has(lang)) return false;
      await _tts.setLanguage(lang);
      await _tts.setSpeechRate(rate);
      await _tts.speak(text);
      return true;
    } catch (e) {
      debugPrint('Read aloud: $e');
      return false;
    }
  }

  @override
  Future<void> stop() async {
    try {
      await _tts.stop();
    } catch (_) {}
  }

  @override
  void dispose() => unawaited(stop());
}

/// Which paragraph and word are being read, and how the reader looks.
class ReaderController extends ChangeNotifier {
  ReaderController(this.paragraphs, {ReaderVoice? voice}) : _voice = voice ?? ReaderVoice.make() {
    _voice.onWord = (s, e) {
      word = (s, e);
      _changed();
    };
    _voice.onDone = _next;
  }

  final List<String> paragraphs;
  final ReaderVoice _voice;
  bool _disposed = false;

  int index = 0;
  (int, int)? word;
  bool playing = false;
  double size = 40;
  ReaderTheme theme = ReaderTheme.paper;

  /// Dims every paragraph but the one being read.
  bool focus = false;
  bool slow = false;

  /// The language with no voice on this device, when one was missing ("hi-IN").
  String? missingVoice;

  void _changed() {
    if (!_disposed) notifyListeners();
  }

  Future<void> play() async {
    if (paragraphs.isEmpty) return;
    if (index >= paragraphs.length) index = 0;
    playing = true;
    missingVoice = null;
    word = null;
    _changed();
    final text = paragraphs[index];
    final lang = readerLang(text);
    if (!await _voice.speak(text, lang, slow ? 0.32 : 0.45)) {
      playing = false;
      missingVoice = lang;
      _changed();
    }
  }

  Future<void> pause() async {
    playing = false;
    await _voice.stop();
    _changed();
  }

  void toggle() => unawaited(playing ? pause() : play());

  void _next() {
    if (!playing) return;
    word = null;
    if (index < paragraphs.length - 1) {
      index++;
      unawaited(play());
    } else {
      playing = false;
      _changed();
    }
  }

  /// Reads from paragraph [i] (a tap on it).
  Future<void> jump(int i) async {
    if (i < 0 || i >= paragraphs.length) return;
    final was = playing;
    if (was) await _voice.stop();
    index = i;
    word = null;
    if (was) {
      await play();
    } else {
      _changed();
    }
  }

  void step(int d) => unawaited(jump(index + d));

  void setSize(double v) {
    size = v.clamp(24, 72);
    _changed();
  }

  void setTheme(ReaderTheme t) {
    theme = t;
    _changed();
  }

  void setFocus(bool v) {
    focus = v;
    _changed();
  }

  void setSlow(bool v) {
    slow = v;
    _changed();
  }

  /// Easy read, for students with dyslexia or who are new to reading: Andika (distinct b, d, p
  /// and q, single-storey a and g), wider letter, word and line spacing, and no line focus fade.
  bool easyRead = false;

  void setEasyRead(bool v) {
    easyRead = v;
    _changed();
  }

  @override
  void dispose() {
    _disposed = true;
    _voice.onWord = null;
    _voice.onDone = null;
    _voice.dispose();
    super.dispose();
  }
}

/// Colours that suit different readers: plain paper, warm cream (eases glare), high contrast,
/// and a soft blue tint.
enum ReaderTheme { paper, cream, contrast, blue }

(Color bg, Color fg, Color mark, Color onMark) readerColours(ReaderTheme t) => switch (t) {
  ReaderTheme.paper => (const Color(0xFFFFFDF7), const Color(0xFF1B1B1B), const Color(0xFFB4F0D2), const Color(0xFF002114)),
  ReaderTheme.cream => (const Color(0xFFF6EBD0), const Color(0xFF2B2116), const Color(0xFFFFD27A), const Color(0xFF2B1700)),
  ReaderTheme.contrast => (const Color(0xFF000000), const Color(0xFFFFFFFF), const Color(0xFFFFE14D), const Color(0xFF000000)),
  ReaderTheme.blue => (const Color(0xFFDCEBFA), const Color(0xFF0B2545), const Color(0xFFFFF59D), const Color(0xFF0B2545)),
};

String voiceLanguageName(AppLocalizations l, String lang) => switch (lang.split('-').first) {
  'hi' => 'हिन्दी',
  'kn' => 'ಕನ್ನಡ',
  _ => 'English',
};

/// The immersive reader: the text large, the paragraph and word being read marked, with the
/// text size, colours, line focus and a slower voice.
class ImmersiveReader extends StatefulWidget {
  const ImmersiveReader({super.key, required this.title, required this.paragraphs, this.autoplay = true, this.voice});

  final String title;
  final List<String> paragraphs;
  final bool autoplay;
  final ReaderVoice? voice;

  /// Opens the reader over the board.
  static Future<void> open(BuildContext context, {required String title, required List<String> paragraphs, bool autoplay = true}) => showPanelDialog<void>(
    context: context,
    builder: (_) => ImmersiveReader(title: title, paragraphs: paragraphs, autoplay: autoplay),
  );

  @override
  State<ImmersiveReader> createState() => _ImmersiveReaderState();
}

class _ImmersiveReaderState extends State<ImmersiveReader> {
  late final ReaderController _r = ReaderController(widget.paragraphs, voice: widget.voice);
  final _keys = <int, GlobalKey>{};
  int _shown = 0;

  @override
  void initState() {
    super.initState();
    _r.addListener(_follow);
    if (widget.autoplay && widget.paragraphs.isNotEmpty) unawaited(_r.play());
  }

  /// Keeps the paragraph being read in view.
  void _follow() {
    if (_r.index == _shown) return;
    _shown = _r.index;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final c = _keys[_shown]?.currentContext;
      if (c != null && mounted) unawaited(Scrollable.ensureVisible(c, alignment: 0.3, duration: Kx.medium, curve: Kx.emphasized));
    });
  }

  @override
  void dispose() {
    _r.removeListener(_follow);
    _r.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return ListenableBuilder(
      listenable: _r,
      builder: (context, _) {
        final (bg, fg, mark, onMark) = readerColours(_r.theme);
        return Scaffold(
          backgroundColor: bg,
          appBar: AppBar(
            backgroundColor: bg,
            foregroundColor: fg,
            title: Text(widget.title),
            leading: IconButton(key: const Key('reader-close'), tooltip: l.close, icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context)),
          ),
          body: Column(
            children: [
              if (_r.missingVoice case final lang?)
                MaterialBanner(
                  key: const Key('reader-no-voice'),
                  content: Text(l.readerNoVoice(voiceLanguageName(l, lang))),
                  leading: const Icon(Icons.record_voice_over_outlined),
                  actions: [TextButton(onPressed: () => setState(() => _r.missingVoice = null), child: Text(l.ok))],
                ),
              Expanded(
                child: widget.paragraphs.isEmpty
                    ? Center(child: Text(l.readerNothing, style: TextStyle(color: fg, fontSize: 22)))
                    : ListView(
                        padding: const EdgeInsets.fromLTRB(48, 32, 48, 48),
                        children: [
                          for (final (n, p) in widget.paragraphs.indexed)
                            AnimatedOpacity(
                              key: _keys.putIfAbsent(n, GlobalKey.new),
                              duration: Kx.fast,
                              opacity: _r.focus && n != _r.index ? 0.25 : 1,
                              child: GestureDetector(
                                behavior: HitTestBehavior.opaque,
                                onTap: () => unawaited(_r.jump(n)),
                                child: Container(
                                  key: Key('reader-p-$n'),
                                  margin: EdgeInsets.only(bottom: _r.size * 0.5),
                                  padding: EdgeInsets.symmetric(horizontal: _r.size * 0.3, vertical: _r.size * 0.12),
                                  decoration: BoxDecoration(
                                    color: n == _r.index ? mark.withValues(alpha: _r.theme == ReaderTheme.contrast ? 0.22 : 0.35) : null,
                                    borderRadius: BorderRadius.circular(_r.size * 0.3),
                                  ),
                                  child: Text.rich(_spans(p, n == _r.index ? _r.word : null, mark, onMark), style: readerTextStyle(_r.size, fg, easyRead: _r.easyRead)),
                                ),
                              ),
                            ),
                        ],
                      ),
              ),
              _controls(context, l),
            ],
          ),
        );
      },
    );
  }

  /// The word being spoken, marked.
  TextSpan _spans(String p, (int, int)? w, Color mark, Color onMark) {
    if (w == null) return TextSpan(text: p);
    final a = w.$1.clamp(0, p.length), b = w.$2.clamp(0, p.length);
    if (b <= a) return TextSpan(text: p);
    return TextSpan(
      children: [
        TextSpan(text: p.substring(0, a)),
        TextSpan(text: p.substring(a, b), style: TextStyle(backgroundColor: mark, color: onMark)),
        TextSpan(text: p.substring(b)),
      ],
    );
  }

  Widget _controls(BuildContext context, AppLocalizations l) {
    final themes = {
      ReaderTheme.paper: l.readerPaper,
      ReaderTheme.cream: l.readerCream,
      ReaderTheme.contrast: l.readerContrast,
      ReaderTheme.blue: l.readerBlue,
    };
    return Material(
      color: context.colors.surfaceContainer,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s8),
          child: Wrap(
            alignment: WrapAlignment.center,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: Kx.s12,
            runSpacing: Kx.s8,
            children: [
              IconButton(tooltip: l.readerPrevious, onPressed: _r.index > 0 ? () => _r.step(-1) : null, icon: const Icon(Icons.skip_previous)),
              FilledButton.icon(
                key: const Key('reader-play'),
                onPressed: widget.paragraphs.isEmpty ? null : _r.toggle,
                icon: Icon(_r.playing ? Icons.pause : Icons.play_arrow),
                label: Text(_r.playing ? l.pause : l.readAloud),
              ),
              IconButton(tooltip: l.readerNext, onPressed: _r.index < widget.paragraphs.length - 1 ? () => _r.step(1) : null, icon: const Icon(Icons.skip_next)),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.format_size),
                  SizedBox(width: 160, child: Slider(key: const Key('reader-size'), value: _r.size, min: 24, max: 72, onChanged: _r.setSize)),
                ],
              ),
              DropdownButton<ReaderTheme>(
                key: const Key('reader-theme'),
                value: _r.theme,
                items: [for (final e in themes.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
                onChanged: (t) => t == null ? null : _r.setTheme(t),
              ),
              FilterChip(key: const Key('reader-focus'), label: Text(l.readerLineFocus), selected: _r.focus, onSelected: _r.setFocus),
              FilterChip(key: const Key('reader-slow'), label: Text(l.readerSlower), selected: _r.slow, onSelected: _r.setSlow),
              FilterChip(key: const Key('reader-easy'), label: Text(l.readerEasyRead), selected: _r.easyRead, onSelected: _r.setEasyRead),
            ],
          ),
        ),
      ),
    );
  }
}

/// The reader's text: the board's usual text, or easy read (Andika with wider spacing).
TextStyle readerTextStyle(double size, Color colour, {bool easyRead = false}) => easyRead
    ? TextStyle(fontFamily: KxFonts.primary, fontSize: size, height: 1.9, color: colour, letterSpacing: size * 0.06, wordSpacing: size * 0.3)
    : TextStyle(fontSize: size, height: 1.45, color: colour, letterSpacing: 0.2);

ReaderVoice? _quickVoice;

/// Reads [text] once without opening the reader (a lab step, an aim). Returns the language
/// with no voice on this board ("hi-IN"), or null when it is being read.
Future<String?> speakOnce(String text) async {
  final voice = _quickVoice ??= ReaderVoice.make();
  await voice.stop();
  final lang = readerLang(text);
  return await voice.speak(text, lang, 0.45) ? null : lang;
}

/// Read aloud for the board's panels (Books, labs): the board puts this above them.
class ReadAloudScope extends InheritedWidget {
  const ReadAloudScope({super.key, required this.read, required super.child});

  /// Opens the immersive reader on [paragraphs] under [title], reading at once.
  final void Function(String title, List<String> paragraphs) read;

  static ReadAloudScope? maybeOf(BuildContext context) => context.dependOnInheritedWidgetOfExactType<ReadAloudScope>();

  @override
  bool updateShouldNotify(ReadAloudScope old) => old.read != read;
}
