import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/feature_strings.dart';
import 'activities.dart' show say;
import 'primary_strings.dart';
import 'tracing.dart' show BigButton;

/// The pictures a matching game can use (drawn by the board, no downloads), by name.
const matchPictures = <String, IconData>{
  'dog': Icons.pets,
  'car': Icons.directions_car,
  'flower': Icons.local_florist,
  'house': Icons.home,
  'sun': Icons.wb_sunny,
  'star': Icons.star,
  'bus': Icons.directions_bus,
  'train': Icons.train,
  'aeroplane': Icons.flight,
  'boat': Icons.directions_boat,
  'umbrella': Icons.umbrella,
  'cake': Icons.cake,
  'ice cream': Icons.icecream,
  'tree': Icons.park,
  'moon': Icons.nightlight_round,
  'cloud': Icons.cloud,
  'book': Icons.menu_book,
  'pencil': Icons.edit,
  'chair': Icons.chair,
  'bed': Icons.bed,
  'phone': Icons.phone,
  'clock': Icons.access_time,
  'bicycle': Icons.directions_bike,
  'ball': Icons.sports_soccer,
};

/// One pair: a picture (a key of [matchPictures]) and the word that goes with it.
typedef MatchPair = ({String picture, String word});

/// Ready games in each language.
const matchSets = <String, List<MatchPair>>{
  'en': [(picture: 'dog', word: 'dog'), (picture: 'car', word: 'car'), (picture: 'sun', word: 'sun'), (picture: 'tree', word: 'tree'), (picture: 'book', word: 'book')],
  'hi': [(picture: 'dog', word: 'कुत्ता'), (picture: 'car', word: 'गाड़ी'), (picture: 'sun', word: 'सूरज'), (picture: 'tree', word: 'पेड़'), (picture: 'book', word: 'किताब')],
  'kn': [(picture: 'dog', word: 'ನಾಯಿ'), (picture: 'car', word: 'ಕಾರು'), (picture: 'sun', word: 'ಸೂರ್ಯ'), (picture: 'tree', word: 'ಮರ'), (picture: 'book', word: 'ಪುಸ್ತಕ')],
};

/// The matching game: the teacher builds it (pictures and words), the class plays it by
/// dragging each word onto its picture. Big targets for small fingers.
class MatchingGame extends StatefulWidget {
  const MatchingGame({super.key, this.pairs, this.random});

  final List<MatchPair>? pairs;
  final math.Random? random;

  @override
  State<MatchingGame> createState() => MatchingGameState();
}

class MatchingGameState extends State<MatchingGame> {
  late final math.Random _rand = widget.random ?? math.Random();
  List<MatchPair>? _pairs;
  bool _editing = false;
  final _matched = <int>{};
  List<int> _order = [];
  int? _wrong;

  List<MatchPair> get pairs => _pairs!;
  Set<int> get matched => _matched;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_pairs == null) {
      _pairs = [...?widget.pairs ?? matchSets[primaryStrings(context).lang] ?? matchSets['en']];
      _shuffle();
    }
  }

  void _shuffle() {
    _matched.clear();
    _wrong = null;
    _order = List.generate(_pairs!.length, (i) => i)..shuffle(_rand);
  }

  /// A word (pair [word]) dropped on picture [target].
  void drop(int word, int target) {
    setState(() {
      if (word == target) {
        _matched.add(word);
        _wrong = null;
      } else {
        _wrong = target;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = primaryStrings(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.all(Kx.s8),
          child: Row(
            children: [
              Expanded(child: Text(_editing ? s['edit'] : s['matchHint'], style: context.text.titleMedium)),
              SegmentedButton<bool>(
                key: const Key('match-mode'),
                showSelectedIcon: false,
                segments: [
                  ButtonSegment(value: false, label: Text(s['play'], key: const Key('match-play')), icon: const Icon(Icons.play_arrow)),
                  ButtonSegment(value: true, label: Text(s['edit'], key: const Key('match-edit')), icon: const Icon(Icons.edit)),
                ],
                selected: {_editing},
                onSelectionChanged: (v) => setState(() {
                  _editing = v.first;
                  if (!_editing) _shuffle();
                }),
              ),
            ],
          ),
        ),
        Expanded(child: _editing ? _editor(s) : _game(s)),
      ],
    );
  }

  Widget _editor(FeatureStrings s) => ListView(
    padding: const EdgeInsets.all(Kx.s8),
    children: [
      for (final (i, p) in _pairs!.indexed)
        Padding(
          padding: const EdgeInsets.only(bottom: Kx.s8),
          child: Row(
            children: [
              PopupMenuButton<String>(
                key: Key('match-pic-$i'),
                tooltip: s['picture'],
                itemBuilder: (_) => [
                  for (final e in matchPictures.entries)
                    PopupMenuItem(value: e.key, child: Row(children: [Icon(e.value), const SizedBox(width: Kx.s8), Text(e.key)])),
                ],
                onSelected: (v) => setState(() => _pairs![i] = (picture: v, word: p.word)),
                child: Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(color: context.colors.surfaceContainerHigh, borderRadius: Kx.radiusMd),
                  child: Icon(matchPictures[p.picture] ?? Icons.image, size: 44),
                ),
              ),
              const SizedBox(width: Kx.s8),
              Expanded(
                child: TextFormField(
                  key: Key('match-word-$i'),
                  initialValue: p.word,
                  style: context.text.titleLarge,
                  decoration: InputDecoration(labelText: s['word']),
                  onChanged: (v) => _pairs![i] = (picture: _pairs![i].picture, word: v.trim()),
                ),
              ),
              IconButton(
                key: Key('match-remove-$i'),
                onPressed: _pairs!.length <= 2 ? null : () => setState(() => _pairs!.removeAt(i)),
                icon: const Icon(Icons.delete_outline),
              ),
            ],
          ),
        ),
      Align(
        alignment: Alignment.centerLeft,
        child: BigButton(
          key: const Key('match-add'),
          icon: Icons.add,
          label: s['addPair'],
          onTap: () => setState(() {
            final used = _pairs!.map((p) => p.picture).toSet();
            final pic = matchPictures.keys.firstWhere((k) => !used.contains(k), orElse: () => 'star');
            _pairs!.add((picture: pic, word: pic));
          }),
        ),
      ),
    ],
  );

  Widget _game(FeatureStrings s) {
    final pairs = _pairs!;
    final done = _matched.length == pairs.length;
    final words = [for (final i in _order) if (!_matched.contains(i)) i];
    return LayoutBuilder(
      builder: (context, box) {
        final tile = math.min(150.0, math.max(96.0, box.maxWidth / 4));
        return ListView(
          padding: const EdgeInsets.all(Kx.s8),
          children: [
            Wrap(
              spacing: Kx.s12,
              runSpacing: Kx.s12,
              children: [
                for (final (i, p) in pairs.indexed)
                  DragTarget<int>(
                    key: Key('match-target-$i'),
                    onAcceptWithDetails: (d) {
                      drop(d.data, i);
                      if (d.data == i) say(context, p.word);
                    },
                    builder: (context, hovering, _) => AnimatedContainer(
                      duration: Kx.fast,
                      width: tile,
                      height: tile + 36,
                      decoration: BoxDecoration(
                        color: _matched.contains(i)
                            ? const Color(0xFFD7F5DD)
                            : (_wrong == i ? const Color(0xFFFFDAD6) : (hovering.isNotEmpty ? context.colors.primaryContainer : context.colors.surfaceContainerLow)),
                        borderRadius: Kx.radiusLg,
                        border: Border.all(color: _matched.contains(i) ? Kx.success : context.colors.outlineVariant, width: 3),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(matchPictures[p.picture] ?? Icons.image, size: tile * 0.55),
                          if (_matched.contains(i)) Text(p.word, style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: Kx.s24),
            if (done)
              Text(s['allMatched'], key: const Key('match-done'), textAlign: TextAlign.center, style: context.text.displaySmall?.copyWith(color: Kx.success, fontWeight: FontWeight.w800))
            else
              Wrap(
                spacing: Kx.s12,
                runSpacing: Kx.s12,
                alignment: WrapAlignment.center,
                children: [
                  for (final i in words)
                    Draggable<int>(
                      key: Key('match-word-chip-$i'),
                      data: i,
                      feedback: Material(color: Colors.transparent, child: _wordChip(context, pairs[i].word, lifted: true)),
                      childWhenDragging: Opacity(opacity: 0.3, child: _wordChip(context, pairs[i].word)),
                      child: _wordChip(context, pairs[i].word),
                    ),
                ],
              ),
            const SizedBox(height: Kx.s16),
            Center(child: BigButton(key: const Key('match-again'), icon: Icons.shuffle, label: s['newGame'], onTap: () => setState(_shuffle))),
          ],
        );
      },
    );
  }

  Widget _wordChip(BuildContext context, String word, {bool lifted = false}) => Container(
    constraints: const BoxConstraints(minWidth: 120, minHeight: 72),
    alignment: Alignment.center,
    padding: const EdgeInsets.symmetric(horizontal: Kx.s20, vertical: Kx.s12),
    decoration: BoxDecoration(
      color: const Color(0xFFFFE082),
      borderRadius: Kx.radiusLg,
      boxShadow: lifted ? const [BoxShadow(blurRadius: 12, color: Color(0x44000000))] : null,
    ),
    child: Text(word, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: Color(0xFF1B1F24))),
  );
}
