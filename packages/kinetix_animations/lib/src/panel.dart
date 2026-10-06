import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'catalogue.dart';
import 'model.dart';
import 'player.dart';
import 'strings.dart';

int _classNo(String level) => int.tryParse(level.replaceAll(RegExp(r'[^0-9]'), '')) ?? 99;

/// The board's animations panel: Subject, Topic and Class dropdowns, a search, and thumbnails;
/// a tap plays the animation in the whole panel.
///
/// [subject] and [topic] (the lesson's, if any) pick the starting filters: a subject the
/// catalogue does not name itself (e.g. 'Science', 'Geography') still filters by its aliases;
/// a topic it does not know becomes the search when that finds something.
class AnimationsPanel extends StatefulWidget {
  const AnimationsPanel({super.key, this.subject, this.topic, this.onAddToBoard, this.lang, this.animations});

  final String? subject;
  final String? topic;

  /// "Add to board": a PNG of the frame showing and its title.
  final void Function(Uint8List png, String title)? onAddToBoard;

  /// The language (default: the app's).
  final AnimLang? lang;

  /// The animations to offer (default: [animationCatalogue]).
  final List<KxAnimation>? animations;

  @override
  State<AnimationsPanel> createState() => _AnimationsPanelState();
}

class _AnimationsPanelState extends State<AnimationsPanel> {
  final _query = TextEditingController();
  String? _subject, _topic, _level;
  KxAnimation? _open;

  List<KxAnimation> get _all => widget.animations ?? animationCatalogue;

  @override
  void initState() {
    super.initState();
    _applyContext();
  }

  @override
  void didUpdateWidget(AnimationsPanel old) {
    super.didUpdateWidget(old);
    if (old.subject != widget.subject || old.topic != widget.topic) _applyContext();
  }

  void _applyContext() {
    final s = widget.subject?.trim();
    _subject = (s == null || s.isEmpty || !_all.any((a) => a.matchesSubject(s))) ? null : s;
    final t = widget.topic?.trim();
    _topic = _level = null;
    _query.clear();
    if (t != null && t.isNotEmpty) {
      final known = _topics.where((x) => x.toLowerCase() == t.toLowerCase()).firstOrNull;
      if (known != null) {
        _topic = known;
      } else if (_all.any((a) => (_subject == null || a.matchesSubject(_subject!)) && a.matchesQuery(t))) {
        _query.text = t;
      }
    }
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  List<String> get _subjects {
    final out = <String>[];
    for (final a in _all) {
      if (!out.contains(a.subject)) out.add(a.subject);
    }
    if (_subject != null && !out.any((s) => s.toLowerCase() == _subject!.toLowerCase())) out.insert(0, _subject!);
    return out;
  }

  Iterable<KxAnimation> get _bySubject => _all.where((a) => _subject == null || a.matchesSubject(_subject!));

  List<String> get _topics {
    final out = <String>[];
    for (final a in _bySubject) {
      if (!out.contains(a.topic)) out.add(a.topic);
    }
    return out;
  }

  List<String> get _levels => {for (final a in _all) ...a.levels}.toList()..sort((a, b) => _classNo(a).compareTo(_classNo(b)));

  List<KxAnimation> get _shown => [
        for (final a in _bySubject)
          if ((_topic == null || a.topic == _topic) && (_level == null || a.levels.contains(_level)) && a.matchesQuery(_query.text)) a,
      ];

  @override
  Widget build(BuildContext context) {
    final lang = widget.lang ?? AnimLang.of(context);
    final open = _open;
    if (open != null) {
      return AnimationPlayer(
        key: ValueKey(open.id),
        animation: open,
        lang: widget.lang,
        onBack: () => setState(() => _open = null),
        onAddToBoard: widget.onAddToBoard,
      );
    }
    final shown = _shown;
    final c = context.colors;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s12, Kx.s12, Kx.s4),
        child: TextField(
          key: const ValueKey('anim-search'),
          controller: _query,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            prefixIcon: const Icon(Icons.search),
            hintText: ui3('Search animations', lang),
            border: const OutlineInputBorder(borderRadius: Kx.radiusXl),
            isDense: true,
            suffixIcon: _query.text.isEmpty ? null : IconButton(icon: const Icon(Icons.clear), onPressed: () => setState(_query.clear)),
          ),
        ),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: Kx.s12, vertical: Kx.s4),
        child: Row(children: [
          Expanded(child: _Drop(
            key: const ValueKey('anim-subject'),
            hint: ui3('Subject', lang),
            value: _subject,
            items: {for (final s in _subjects) s: ui3(s, lang)},
            allLabel: ui3('All', lang),
            onChanged: (v) => setState(() {
              _subject = v;
              if (_topic != null && !_topics.contains(_topic)) _topic = null;
            }),
          )),
          const SizedBox(width: Kx.s8),
          Expanded(child: _Drop(
            key: const ValueKey('anim-topic'),
            hint: ui3('Topic', lang),
            value: _topic,
            items: {for (final t in _topics) t: t},
            allLabel: ui3('All', lang),
            onChanged: (v) => setState(() => _topic = v),
          )),
          const SizedBox(width: Kx.s8),
          Expanded(child: _Drop(
            key: const ValueKey('anim-class'),
            hint: ui3('Class', lang),
            value: _level,
            items: {for (final l in _levels) l: l},
            allLabel: ui3('All', lang),
            onChanged: (v) => setState(() => _level = v),
          )),
        ]),
      ),
      Expanded(
        child: shown.isEmpty
            ? KxEmptyState(
                icon: Icons.movie_filter_outlined,
                message: ui3('No animations match.', lang),
                action: TextButton(
                  onPressed: () => setState(() {
                    _subject = _topic = _level = null;
                    _query.clear();
                  }),
                  child: Text(ui3('Clear filters', lang)),
                ),
              )
            : GridView.builder(
                padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s8, Kx.s12, Kx.s16),
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent: 300, mainAxisSpacing: Kx.s12, crossAxisSpacing: Kx.s12, childAspectRatio: 1.12),
                itemCount: shown.length,
                itemBuilder: (_, i) {
                  final a = shown[i];
                  return Material(
                    key: ValueKey('anim-tile-${a.id}'),
                    color: c.surface,
                    shape: RoundedRectangleBorder(borderRadius: Kx.radiusLg, side: const BorderSide(color: KxColor.line)),
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: () => setState(() => _open = a),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        Expanded(
                          child: RepaintBoundary(
                            child: CustomPaint(painter: a.painter(AnimFrame(a.thumbT, labels: false, lang: lang, thumbnail: true)), child: const SizedBox.expand()),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s8, Kx.s12, Kx.s8),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(a.title.of(lang), maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                            Text(
                              '${ui3(a.subject, lang)} · ${a.levels.first}${a.levels.length > 1 ? '–${a.levels.last.replaceAll('Class ', '')}' : ''}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                            ),
                          ]),
                        ),
                      ]),
                    ),
                  );
                },
              ),
      ),
    ]);
  }
}

/// A compact dropdown with an "All" choice (null).
class _Drop extends StatelessWidget {
  const _Drop({super.key, required this.hint, required this.value, required this.items, required this.allLabel, required this.onChanged});

  final String hint, allLabel;
  final String? value;
  final Map<String, String> items;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.only(left: Kx.s12, right: Kx.s4),
      decoration: BoxDecoration(color: KxColor.rail, borderRadius: Kx.radiusXl),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String?>(
          value: items.containsKey(value) ? value : null,
          hint: Text(hint),
          isDense: true,
          isExpanded: true,
          borderRadius: Kx.radiusLg,
          padding: const EdgeInsets.symmetric(vertical: Kx.s8),
          onChanged: onChanged,
          selectedItemBuilder: (_) => [
            Text('$hint: $allLabel', maxLines: 1, overflow: TextOverflow.ellipsis),
            for (final e in items.entries) Text(e.value, maxLines: 1, overflow: TextOverflow.ellipsis),
          ],
          items: [
            DropdownMenuItem<String?>(value: null, child: Text(allLabel)),
            for (final e in items.entries) DropdownMenuItem<String?>(value: e.key, child: Text(e.value, maxLines: 1, overflow: TextOverflow.ellipsis)),
          ],
        ),
      ),
    );
  }
}
