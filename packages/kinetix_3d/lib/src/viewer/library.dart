import 'package:flutter/material.dart';

import '../catalogue.dart';
import 'annotations.dart';
import 'manifest.dart';
import 'snapshot.dart';
import 'strings.dart';

/// Opens a catalogue model full screen (the board's "open model"). [onSnapshot] receives
/// "Put on board" pictures; [mirror] is the students' screen. Both fall back to a
/// [Model3dScope] above [context].
Future<void> openModel3d(
  BuildContext context,
  String id, {
  ValueChanged<Model3dSnapshot>? onSnapshot,
  Model3dMirror? mirror,
  String? lang,
  Model3dAnnotations? annotations,
  ValueChanged<Model3dAnnotations>? onAnnotationsChanged,
}) {
  final l = lang ?? viewerLangOf(context);
  final entry = ModelCatalogue.byId(id);
  final scope = Model3dScope.maybeOf(context);
  return Navigator.of(context).push(MaterialPageRoute<void>(
    // The scope's notes store goes along to the new page, which is not below it.
    builder: (context) => Model3dScope(
      annotations: scope?.annotations,
      child: Scaffold(
        appBar: AppBar(title: Text(entry?.titleIn(l) ?? id)),
        body: ModelView(
          key: ValueKey(id),
          id: id,
          lang: lang,
          onSnapshot: onSnapshot ?? scope?.onSnapshot,
          mirror: mirror ?? scope?.mirror,
          annotations: annotations,
          onAnnotationsChanged: onAnnotationsChanged,
        ),
      ),
    ),
  ));
}

/// Lets the teacher choose a model: search, filter by subject, pictures. Returns its id.
Future<String?> pickModel3d(BuildContext context, {String? lang}) => showDialog<String>(
  context: context,
  builder: (context) => Dialog(
    insetPadding: const EdgeInsets.all(24),
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 1100, maxHeight: 800),
      child: Model3dLibrary(lang: lang, onPick: (id) => Navigator.of(context).pop(id)),
    ),
  ),
);

/// The model library: every listed catalogue model with its picture, title in the
/// teacher's language, subject and classes.
class Model3dLibrary extends StatefulWidget {
  const Model3dLibrary({super.key, required this.onPick, this.lang, this.classLevel});

  final ValueChanged<String> onPick;
  final String? lang;

  /// Shows the models for this class first.
  final int? classLevel;

  @override
  State<Model3dLibrary> createState() => _Model3dLibraryState();
}

class _Model3dLibraryState extends State<Model3dLibrary> {
  String _query = '';
  String? _subject;

  @override
  Widget build(BuildContext context) {
    final lang = widget.lang ?? viewerLangOf(context);
    final s = Viewer3dStrings(lang);
    final cs = Theme.of(context).colorScheme;
    final all = ModelCatalogue.entries;
    final subjects = {for (final e in all) e.subjects.first}.toList();
    final q = _query.trim().toLowerCase();
    final shown = [
      for (final e in all)
        if ((_subject == null || e.subjects.first == _subject) &&
            (q.isEmpty ||
                e.titleIn(lang).toLowerCase().contains(q) ||
                e.title.toLowerCase().contains(q) ||
                e.keywords.any((k) => k.contains(q)) ||
                e.subjects.any((x) => x.toLowerCase().contains(q))))
          e,
    ];
    if (widget.classLevel != null) {
      // A stable sort: this class's models first, otherwise in library order.
      final order = {for (var i = 0; i < shown.length; i++) shown[i]: i};
      shown.sort((a, b) {
        final ka = a.classes.contains(widget.classLevel) ? 0 : 1, kb = b.classes.contains(widget.classLevel) ? 0 : 1;
        return ka != kb ? ka - kb : order[a]! - order[b]!;
      });
    }
    return Column(key: const ValueKey('model3d-library'), children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
        child: Row(children: [
          Icon(Icons.view_in_ar_outlined, color: cs.primary),
          const SizedBox(width: 10),
          Text(s.library, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(width: 24),
          Expanded(
            child: TextField(
              key: const ValueKey('model3d-search'),
              decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: s.search, isDense: true, border: const OutlineInputBorder()),
              onChanged: (v) => setState(() => _query = v),
            ),
          ),
        ]),
      ),
      SizedBox(
        height: 48,
        child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12), children: [
          for (final sub in [null, ...subjects])
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: ChoiceChip(
                key: ValueKey('model3d-subject-${sub ?? 'all'}'),
                label: Text(sub == null ? s.allSubjects : s.subject(sub)),
                selected: _subject == sub,
                onSelected: (_) => setState(() => _subject = sub),
              ),
            ),
        ]),
      ),
      Expanded(
        child: shown.isEmpty
            ? Center(child: Text(s.noMatch))
            : GridView.extent(
                padding: const EdgeInsets.all(16),
                maxCrossAxisExtent: 260,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 0.92,
                children: [for (final e in shown) _card(context, e, lang, s)],
              ),
      ),
    ]);
  }

  Widget _card(BuildContext context, ModelEntry e, String lang, Viewer3dStrings s) {
    final cs = Theme.of(context).colorScheme;
    final thumb = e.info?.thumbAsset;
    return Card(
      key: ValueKey('model3d-pick-${e.id}'),
      clipBehavior: Clip.antiAlias,
      color: cs.surfaceContainer,
      elevation: 0,
      child: InkWell(
        onTap: () => widget.onPick(e.id),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          AspectRatio(
            aspectRatio: 4 / 3,
            child: ColoredBox(
              color: const Color(0xFF16191E),
              child: thumb == null
                  ? Icon(Icons.view_in_ar_outlined, size: 48, color: cs.primary)
                  : Image.asset(thumb, fit: BoxFit.cover, errorBuilder: (_, _, _) => Icon(Icons.view_in_ar_outlined, size: 48, color: cs.primary)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: Text(e.titleIn(lang), maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 2, 12, 8),
            child: Text(
              [s.subject(e.subjects.first), if (e.classes.isNotEmpty) s.classes(e.classes)].join(' · '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant),
            ),
          ),
        ]),
      ),
    );
  }
}
