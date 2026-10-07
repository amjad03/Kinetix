import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import '../../core/models.dart';
import '../../l10n/feature_strings.dart';
import '../board/chrome.dart' show showBoardMessage;
import '../extras/board_table.dart';
import '../primary/activities.dart' show say;
import '../primary/matching.dart' show matchPictures;
import 'language_data.dart';

FeatureStrings languageStrings(BuildContext context) => FeatureStrings(boardLang(context), languageStringTable);

const languageStringTable = <String, Map<String, String>>{
  'en': {
    'title': 'Language kit',
    'dictionary': 'Dictionary',
    'phonics': 'Phonics',
    'grammar': 'Grammar',
    'cards': 'Vocabulary cards',
    'searchWord': 'Look up a word (English, हिंदी or ಕನ್ನಡ)',
    'notFound': 'Not in the offline word list.',
    'askAi': 'Meaning from KINETIX AI',
    'aiPreview': 'Sample answer (demo): connect KINETIX AI for real meanings',
    'aiOffline': 'KINETIX AI cannot be reached; the offline list is shown.',
    'makeCard': 'Make a card',
    'toBoard': 'Put on the board',
    'onBoard': 'On the board',
    'english': 'English',
    'hindi': 'हिंदी',
    'kannada': 'ಕನ್ನಡ',
    'tenses': 'Tenses',
    'parts': 'Parts of speech',
    'word': 'Word',
    'meaning': 'Meaning',
    'sentence': 'Example sentence',
    'picture': 'Picture',
    'none': 'None',
    'example': 'Example',
  },
  'hi': {
    'title': 'भाषा किट',
    'dictionary': 'शब्दकोश',
    'phonics': 'ध्वनि (फ़ोनिक्स)',
    'grammar': 'व्याकरण',
    'cards': 'शब्द कार्ड',
    'searchWord': 'शब्द खोजें (English, हिंदी या ಕನ್ನಡ)',
    'notFound': 'ऑफ़लाइन शब्द सूची में नहीं है।',
    'askAi': 'KINETIX AI से अर्थ',
    'aiPreview': 'नमूना उत्तर (डेमो): वास्तविक अर्थ के लिए KINETIX AI जोड़ें',
    'aiOffline': 'KINETIX AI तक नहीं पहुँच सके; ऑफ़लाइन सूची दिखाई गई है।',
    'makeCard': 'कार्ड बनाएँ',
    'toBoard': 'बोर्ड पर रखें',
    'onBoard': 'बोर्ड पर',
    'english': 'English',
    'hindi': 'हिंदी',
    'kannada': 'ಕನ್ನಡ',
    'tenses': 'काल',
    'parts': 'शब्द भेद',
    'word': 'शब्द',
    'meaning': 'अर्थ',
    'sentence': 'उदाहरण वाक्य',
    'picture': 'चित्र',
    'none': 'कोई नहीं',
    'example': 'उदाहरण',
  },
  'kn': {
    'title': 'ಭಾಷಾ ಕಿಟ್',
    'dictionary': 'ನಿಘಂಟು',
    'phonics': 'ಧ್ವನಿ (ಫೋನಿಕ್ಸ್)',
    'grammar': 'ವ್ಯಾಕರಣ',
    'cards': 'ಪದ ಕಾರ್ಡ್‌ಗಳು',
    'searchWord': 'ಪದ ಹುಡುಕಿ (English, हिंदी ಅಥವಾ ಕನ್ನಡ)',
    'notFound': 'ಆಫ್‌ಲೈನ್ ಪದ ಪಟ್ಟಿಯಲ್ಲಿ ಇಲ್ಲ.',
    'askAi': 'KINETIX AI ಇಂದ ಅರ್ಥ',
    'aiPreview': 'ಮಾದರಿ ಉತ್ತರ (ಡೆಮೊ): ನಿಜವಾದ ಅರ್ಥಕ್ಕೆ KINETIX AI ಜೋಡಿಸಿ',
    'aiOffline': 'KINETIX AI ತಲುಪಲಾಗಲಿಲ್ಲ; ಆಫ್‌ಲೈನ್ ಪಟ್ಟಿ ತೋರಿಸಲಾಗಿದೆ.',
    'makeCard': 'ಕಾರ್ಡ್ ಮಾಡಿ',
    'toBoard': 'ಬೋರ್ಡ್‌ಗೆ ಹಾಕಿ',
    'onBoard': 'ಬೋರ್ಡ್‌ನಲ್ಲಿ',
    'english': 'English',
    'hindi': 'हिंदी',
    'kannada': 'ಕನ್ನಡ',
    'tenses': 'ಕಾಲಗಳು',
    'parts': 'ಪದ ವಿಭಾಗಗಳು',
    'word': 'ಪದ',
    'meaning': 'ಅರ್ಥ',
    'sentence': 'ಉದಾಹರಣೆ ವಾಕ್ಯ',
    'picture': 'ಚಿತ್ರ',
    'none': 'ಯಾವುದೂ ಇಲ್ಲ',
    'example': 'ಉದಾಹರಣೆ',
  },
};

/// The words of the offline list matching [query] in English, Hindi or Kannada (whole words
/// first, then the rest that contain it).
List<Word> lookUpWords(String query) {
  final q = query.trim().toLowerCase();
  if (q.isEmpty) return const [];
  final exact = basicWords.where((w) => w.en == q || w.hi == q || w.kn == q);
  final part = basicWords.where((w) => !exact.contains(w) && (w.en.contains(q) || w.hi.contains(q) || w.kn.contains(q) || w.meaning.contains(q)));
  return [...exact, ...part];
}

enum LanguageTab { dictionary, phonics, grammar, cards }

/// The language kit (English, Hindi, Kannada): a dictionary (offline list, and KINETIX AI's
/// meaning), phonics charts, grammar tables and a vocabulary card builder.
class LanguageKitPanel extends StatefulWidget {
  const LanguageKitPanel({super.key, required this.board, required this.wb, this.initial = LanguageTab.dictionary});

  final BoardController board;
  final WhiteboardController wb;
  final LanguageTab initial;

  @override
  State<LanguageKitPanel> createState() => _LanguageKitPanelState();
}

class _LanguageKitPanelState extends State<LanguageKitPanel> {
  late LanguageTab _tab = widget.initial;
  Word? _cardFrom;

  Color get _ink => widget.wb.background.isDark ? WhiteboardController.chalkWhite : WhiteboardController.inkBlack;

  void _insert(List<BoardElement> els) {
    widget.wb.insert(els);
    showBoardMessage(context, languageStrings(context)['onBoard']);
  }

  @override
  Widget build(BuildContext context) {
    final s = languageStrings(context);
    final icons = {LanguageTab.dictionary: Icons.menu_book_outlined, LanguageTab.phonics: Icons.record_voice_over_outlined, LanguageTab.grammar: Icons.spellcheck, LanguageTab.cards: Icons.style_outlined};
    return Column(
      key: const Key('language-kit'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.all(Kx.s8),
          child: Row(
            children: [
              for (final t in LanguageTab.values)
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: ChoiceChip(key: Key('language-tab-${t.name}'), avatar: Icon(icons[t], size: 18), label: Text(s[t.name]), showCheckmark: false, selected: _tab == t, onSelected: (_) => setState(() => _tab = t)),
                ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: switch (_tab) {
            LanguageTab.dictionary => _Dictionary(
              board: widget.board,
              onCard: (w) => setState(() {
                _cardFrom = w;
                _tab = LanguageTab.cards;
              }),
            ),
            LanguageTab.phonics => _Phonics(onBoard: (rows) => _insert(boardTable(rows, _ink, size: 26))),
            LanguageTab.grammar => _Grammar(onBoard: (rows) => _insert(boardTable(rows, _ink, size: 20, header: const Color(0x334F8CFF)))),
            LanguageTab.cards => VocabCardBuilder(key: ValueKey(_cardFrom), from: _cardFrom, onBoard: _insert),
          },
        ),
      ],
    );
  }
}

class _Dictionary extends StatefulWidget {
  const _Dictionary({required this.board, required this.onCard});
  final BoardController board;
  final ValueChanged<Word> onCard;

  @override
  State<_Dictionary> createState() => _DictionaryState();
}

class _DictionaryState extends State<_Dictionary> {
  final _q = TextEditingController();
  List<Word> _found = const [];
  String? _ai;
  bool _aiPreview = false, _busy = false;

  void _search(String v) => setState(() {
    _found = lookUpWords(v);
    _ai = null;
  });

  Future<void> _askAi(FeatureStrings s) async {
    final word = _q.text.trim();
    if (word.isEmpty) return;
    final api = widget.board.api;
    setState(() => _busy = true);
    try {
      if (api == null || widget.board.session == null) throw StateError('offline');
      final lang = AiLanguage.values.firstWhere((l) => l.name == s.lang, orElse: () => AiLanguage.en);
      final r = await api.explain('Give the meaning of the word "$word", its part of speech, an example sentence, and the word in Hindi and Kannada.', lang).timeout(const Duration(seconds: 60));
      _ai = [r.result.answer, ...r.result.keyPoints.map((k) => '• $k')].join('\n');
      _aiPreview = r.meta.preview;
    } catch (_) {
      _ai = s['aiOffline'];
      _aiPreview = false;
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = languageStrings(context);
    final c = context.colors;
    return ListView(
      padding: const EdgeInsets.all(Kx.s12),
      children: [
        TextField(
          key: const Key('dictionary-search'),
          controller: _q,
          decoration: InputDecoration(hintText: s['searchWord'], prefixIcon: const Icon(Icons.search), border: const OutlineInputBorder()),
          onChanged: _search,
        ),
        const SizedBox(height: Kx.s8),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(key: const Key('dictionary-ai'), onPressed: _busy ? null : () => _askAi(s), icon: const Icon(Icons.auto_awesome), label: Text(s['askAi'])),
        ),
        if (_busy) const LinearProgressIndicator(),
        if (_ai != null)
          Card(
            key: const Key('dictionary-ai-answer'),
            elevation: 0,
            color: c.secondaryContainer,
            child: Padding(
              padding: const EdgeInsets.all(Kx.s12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (_aiPreview) Text(s['aiPreview'], style: context.text.labelSmall),
                  Text(_ai!),
                ],
              ),
            ),
          ),
        if (_q.text.trim().isNotEmpty && _found.isEmpty) Padding(padding: const EdgeInsets.all(Kx.s12), child: Text(s['notFound'], key: const Key('dictionary-none'))),
        for (final w in _found)
          Card(
            key: Key('dictionary-word-${w.en}'),
            elevation: 0,
            color: c.surfaceContainerLow,
            child: ListTile(
              title: Text('${w.en}  ·  ${w.hi}  ·  ${w.kn}', style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
              subtitle: Text('(${w.pos}) ${w.meaning}\n${s['example']}: ${w.example}'),
              isThreeLine: true,
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(onPressed: () => say(context, w.en), icon: const Icon(Icons.volume_up_outlined)),
                  IconButton(key: Key('dictionary-card-${w.en}'), tooltip: s['makeCard'], onPressed: () => widget.onCard(w), icon: const Icon(Icons.style_outlined)),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _Phonics extends StatefulWidget {
  const _Phonics({required this.onBoard});
  final ValueChanged<List<List<String>>> onBoard;

  @override
  State<_Phonics> createState() => _PhonicsState();
}

class _PhonicsState extends State<_Phonics> {
  String _script = 'en';

  @override
  Widget build(BuildContext context) {
    final s = languageStrings(context);
    final groups = switch (_script) {
      'hi' => hindiVarnamala,
      'kn' => kannadaVarnamale,
      _ => const <(String, List<String>)>[],
    };
    Widget tile(String big, String small, String speak) => InkWell(
      key: Key('phonics-$big'),
      borderRadius: Kx.radiusMd,
      onTap: () => say(context, speak),
      child: Container(
        width: 96,
        padding: const EdgeInsets.all(Kx.s8),
        decoration: BoxDecoration(color: context.colors.surfaceContainerLow, borderRadius: Kx.radiusMd),
        child: Column(
          children: [
            Text(big, style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w700, fontFamilyFallback: KxFonts.fallback)),
            if (small.isNotEmpty) Text(small, textAlign: TextAlign.center, style: context.text.bodySmall),
          ],
        ),
      ),
    );
    final rows = _script == 'en'
        ? [
            ['Letter', 'Sound', 'Word'],
            for (final p in englishPhonics) [p.$1, p.$2, p.$3],
          ]
        : [for (final g in groups) [g.$1, g.$2.join('  ')]];
    return ListView(
      padding: const EdgeInsets.all(Kx.s12),
      children: [
        Row(
          children: [
            Expanded(
              child: SegmentedButton<String>(
                showSelectedIcon: false,
                segments: [
                  ButtonSegment(value: 'en', label: Text(s['english'], key: const Key('phonics-en'))),
                  ButtonSegment(value: 'hi', label: Text(s['hindi'], key: const Key('phonics-hi'))),
                  ButtonSegment(value: 'kn', label: Text(s['kannada'], key: const Key('phonics-kn'))),
                ],
                selected: {_script},
                onSelectionChanged: (v) => setState(() => _script = v.first),
              ),
            ),
            IconButton(key: const Key('phonics-board'), tooltip: s['toBoard'], onPressed: () => widget.onBoard(rows), icon: const Icon(Icons.open_in_new)),
          ],
        ),
        const SizedBox(height: Kx.s12),
        if (_script == 'en')
          Wrap(spacing: Kx.s8, runSpacing: Kx.s8, children: [for (final p in englishPhonics) tile(p.$1, '${p.$2} ${p.$3}', '${p.$1.split(' ').first}, ${p.$3}')])
        else
          for (final g in groups) ...[
            Padding(padding: const EdgeInsets.only(top: Kx.s8, bottom: Kx.s4), child: Text(g.$1, style: context.text.titleMedium)),
            Wrap(spacing: Kx.s8, runSpacing: Kx.s8, children: [for (final l in g.$2) tile(l, '', l)]),
          ],
      ],
    );
  }
}

class _Grammar extends StatefulWidget {
  const _Grammar({required this.onBoard});
  final ValueChanged<List<List<String>>> onBoard;

  @override
  State<_Grammar> createState() => _GrammarState();
}

class _GrammarState extends State<_Grammar> {
  String _table = 'tenses-en';

  @override
  Widget build(BuildContext context) {
    final s = languageStrings(context);
    final tables = {
      'tenses-en': ('${s['tenses']} · English', englishTenses),
      'tenses-hi': ('${s['tenses']} · हिंदी', hindiTenses),
      'tenses-kn': ('${s['tenses']} · ಕನ್ನಡ', kannadaTenses),
      'parts': (s['parts'], partsOfSpeech),
    };
    final rows = tables[_table]!.$2;
    return ListView(
      padding: const EdgeInsets.all(Kx.s12),
      children: [
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final e in tables.entries) ChoiceChip(key: Key('grammar-${e.key}'), label: Text(e.value.$1), selected: _table == e.key, onSelected: (_) => setState(() => _table = e.key)),
          ],
        ),
        const SizedBox(height: Kx.s8),
        Align(
          alignment: Alignment.centerLeft,
          child: FilledButton.tonalIcon(key: const Key('grammar-board'), onPressed: () => widget.onBoard(rows), icon: const Icon(Icons.open_in_new), label: Text(s['toBoard'])),
        ),
        const SizedBox(height: Kx.s8),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: DataTable(
            key: Key('grammar-table-$_table'),
            columns: [for (final h in rows.first) DataColumn(label: Text(h, style: const TextStyle(fontWeight: FontWeight.w700)))],
            rows: [
              for (final r in rows.skip(1)) DataRow(cells: [for (final cell in r) DataCell(Text(cell))]),
            ],
          ),
        ),
      ],
    );
  }
}

/// Builds a vocabulary card (word, meaning, an example, a picture) and puts it on the board.
class VocabCardBuilder extends StatefulWidget {
  const VocabCardBuilder({super.key, required this.onBoard, this.from});

  final void Function(List<BoardElement>) onBoard;
  final Word? from;

  @override
  State<VocabCardBuilder> createState() => _VocabCardBuilderState();
}

class _VocabCardBuilderState extends State<VocabCardBuilder> {
  late final _word = TextEditingController(text: widget.from?.en ?? '');
  late final _meaning = TextEditingController(text: widget.from == null ? '' : '${widget.from!.meaning} (${widget.from!.hi} / ${widget.from!.kn})');
  late final _sentence = TextEditingController(text: widget.from?.example ?? '');
  String? _picture;
  Color _color = const Color(0xFFFDD663);

  /// The card as board elements: a coloured card with the word, its meaning and an example.
  List<BoardElement> card() {
    final text = [_word.text.trim().toUpperCase(), _meaning.text.trim(), if (_sentence.text.trim().isNotEmpty) '“${_sentence.text.trim()}”'].where((t) => t.isNotEmpty).join('\n');
    final lines = text.split('\n').length;
    return [
      NoteElement(id: newElementId(), rect: Rect.fromLTWH(0, 0, 420, 72.0 + lines * 34), text: text, color: _color, kind: NoteKind.card),
      if (_picture != null) boardLabel(_picture!, const Offset(430, 8), WhiteboardController.inkBlack, size: 18, bold: true),
    ];
  }

  @override
  void dispose() {
    _word.dispose();
    _meaning.dispose();
    _sentence.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = languageStrings(context);
    return ListView(
      padding: const EdgeInsets.all(Kx.s12),
      children: [
        TextField(key: const Key('vocab-word'), controller: _word, style: context.text.titleLarge, decoration: InputDecoration(labelText: s['word']), onChanged: (_) => setState(() {})),
        TextField(key: const Key('vocab-meaning'), controller: _meaning, decoration: InputDecoration(labelText: s['meaning']), onChanged: (_) => setState(() {})),
        TextField(key: const Key('vocab-sentence'), controller: _sentence, decoration: InputDecoration(labelText: s['sentence']), onChanged: (_) => setState(() {})),
        const SizedBox(height: Kx.s8),
        Row(
          children: [
            Text('${s['picture']}: '),
            DropdownButton<String?>(
              key: const Key('vocab-picture'),
              value: _picture,
              items: [
                DropdownMenuItem(value: null, child: Text(s['none'])),
                for (final e in matchPictures.entries) DropdownMenuItem(value: e.key, child: Row(children: [Icon(e.value, size: 20), const SizedBox(width: 6), Text(e.key)])),
              ],
              onChanged: (v) => setState(() => _picture = v),
            ),
            const Spacer(),
            for (final col in const [Color(0xFFFDD663), Color(0xFFAECBFA), Color(0xFFA8DAB5), Color(0xFFF6AEA9)])
              Padding(
                padding: const EdgeInsets.only(left: 6),
                child: InkWell(
                  onTap: () => setState(() => _color = col),
                  customBorder: const CircleBorder(),
                  child: Container(width: 30, height: 30, decoration: BoxDecoration(color: col, shape: BoxShape.circle, border: Border.all(width: _color == col ? 3 : 1))),
                ),
              ),
          ],
        ),
        const SizedBox(height: Kx.s12),
        Container(
          key: const Key('vocab-preview'),
          padding: const EdgeInsets.all(Kx.s16),
          decoration: BoxDecoration(color: _color, borderRadius: Kx.radiusLg),
          child: Row(
            children: [
              if (_picture != null) Padding(padding: const EdgeInsets.only(right: Kx.s12), child: Icon(matchPictures[_picture], size: 56, color: const Color(0xFF1B1F24))),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_word.text.toUpperCase(), style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: Color(0xFF1B1F24))),
                    Text(_meaning.text, style: const TextStyle(fontSize: 18, color: Color(0xFF1B1F24))),
                    if (_sentence.text.isNotEmpty) Text('“${_sentence.text}”', style: const TextStyle(fontSize: 16, fontStyle: FontStyle.italic, color: Color(0xFF1B1F24))),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: Kx.s12),
        Align(
          alignment: Alignment.centerLeft,
          child: FilledButton.icon(
            key: const Key('vocab-board'),
            onPressed: _word.text.trim().isEmpty ? null : () => widget.onBoard(card()),
            icon: const Icon(Icons.open_in_new),
            label: Text(s['toBoard']),
          ),
        ),
      ],
    );
  }
}
