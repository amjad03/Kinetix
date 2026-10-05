import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../board/kit/subject_data.dart';
import 'filter_bar.dart';
import 'fuzzy.dart';
import 'search_strings.dart';

/// The formula sheets, for the kit and for search: maths and physics formulas by chapter, and
/// physics constants (as a sheet with one chapter).
enum FormulaSet { maths, physics, constants }

/// One line of a sheet.
typedef SheetFormula = ({FormulaSet set, String chapter, String name, String tex});

List<SheetFormula> formulasOf(FormulaSet set) => switch (set) {
  FormulaSet.maths => [for (final f in mathsFormulas) (set: set, chapter: f.chapter, name: f.name, tex: f.tex)],
  FormulaSet.physics => [for (final f in physicsFormulas) (set: set, chapter: f.chapter, name: f.name, tex: f.tex)],
  FormulaSet.constants => [for (final c in physicsConstants) (set: set, chapter: '', name: c.name, tex: c.tex)],
};

/// Every formula and constant, for the board's search.
List<SheetFormula> get allFormulas => [for (final s in FormulaSet.values) ...formulasOf(s)];

/// Chapters of [set], in sheet order.
List<String> chaptersOf(FormulaSet set) => {for (final f in formulasOf(set)) if (f.chapter.isNotEmpty) f.chapter}.toList();

/// The searchable words of a formula's TeX: `\frac{a}{b}` gives "frac a b".
String texWords(String tex) => tex.replaceAll(RegExp(r'[\\{}^_]'), ' ');

/// The formulas of [set] in [chapter] (null: all) matching [query], best first, or in sheet
/// order with no query (the chapter being taught, [prefer], first).
List<SheetFormula> filterFormulas(FormulaSet set, {String? chapter, String query = '', String prefer = ''}) {
  final inChapter = [for (final f in formulasOf(set)) if (chapter == null || f.chapter == chapter) f];
  if (normalizeSearch(query).isNotEmpty) return matching(inChapter, (f) => [f.name, f.chapter, texWords(f.tex)], query);
  final p = prefer.toLowerCase();
  bool first(SheetFormula f) => p.isNotEmpty && f.chapter.isNotEmpty && p.contains(f.chapter.toLowerCase());
  return [...inChapter.where(first), ...inChapter.where((f) => !first(f))];
}

String formulaSetName(SearchStrings s, FormulaSet set) => switch (set) {
  FormulaSet.maths => '${s.subjectName('maths')} · ${s.formulas}',
  FormulaSet.physics => '${s.subjectName('physics')} · ${s.formulas}',
  FormulaSet.constants => '${s.subjectName('physics')} · ${s.constants}',
};

/// The kit's formula sheets: Subject and Chapter dropdowns and a search field over the
/// formulas; a tap puts one on the board.
class FormulaBrowser extends StatefulWidget {
  const FormulaBrowser({super.key, required this.initialSet, required this.onInsert, this.prefer = '', this.searchHint});

  final FormulaSet initialSet;

  /// Puts the formula's TeX on the board.
  final ValueChanged<String> onInsert;

  /// The subject being taught, so its chapter comes first.
  final String prefer;
  final String? searchHint;

  @override
  State<FormulaBrowser> createState() => _FormulaBrowserState();
}

class _FormulaBrowserState extends State<FormulaBrowser> {
  late FormulaSet _set = widget.initialSet;
  String? _chapter;
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final s = SearchStrings.of(context);
    final c = context.colors;
    final list = filterFormulas(_set, chapter: _chapter, query: _q, prefer: widget.prefer);
    final chapters = chaptersOf(_set);
    final grouped = normalizeSearch(_q).isEmpty;
    String? last;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ModuleSearchField(key: const Key('formula-search'), hint: widget.searchHint ?? s.search, onChanged: (v) => setState(() => _q = v)),
        FilterBar(
          menus: [
            FilterMenu(
              id: 'formula-set',
              label: s.subject,
              value: _set.name,
              options: [for (final f in FormulaSet.values) (f.name, formulaSetName(s, f))],
              onChanged: (v) => setState(() {
                _set = v == null ? widget.initialSet : FormulaSet.values.byName(v);
                _chapter = null;
              }),
            ),
            if (chapters.isNotEmpty)
              FilterMenu(
                id: 'formula-chapter',
                label: s.chapter,
                value: _chapter,
                options: [for (final ch in chapters) (ch, ch)],
                onChanged: (v) => setState(() => _chapter = v),
              ),
          ],
        ),
        Expanded(
          child: list.isEmpty
              ? KxEmptyState(icon: Icons.search_off, message: s.noneMatch)
              : ListView(
                  key: const Key('formula-list'),
                  padding: const EdgeInsets.fromLTRB(Kx.s12, 0, Kx.s12, Kx.s12),
                  children: [
                    for (final f in list) ...[
                      if (grouped && f.chapter.isNotEmpty && f.chapter != last)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(4, Kx.s16, 4, Kx.s8),
                          child: Text(last = f.chapter, style: context.text.titleSmall),
                        ),
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Material(
                          color: c.surfaceContainerLow,
                          borderRadius: Kx.radiusMd,
                          child: InkWell(
                            key: Key('formula-${f.name}'),
                            borderRadius: Kx.radiusMd,
                            onTap: () => widget.onInsert(f.tex),
                            child: Padding(
                              padding: const EdgeInsets.all(10),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          grouped || f.chapter.isEmpty ? f.name : '${f.name} · ${f.chapter}',
                                          style: context.text.labelSmall?.copyWith(color: c.onSurfaceVariant),
                                        ),
                                        const SizedBox(height: 4),
                                        SingleChildScrollView(
                                          scrollDirection: Axis.horizontal,
                                          child: BoardMath(
                                            element: MathElement(id: f.tex, position: Offset.zero, latex: f.tex, color: c.onSurface, fontSize: 17, size: const Size(1, 1)),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Icon(Icons.add, size: 18, color: c.onSurfaceVariant),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}
