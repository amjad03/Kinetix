import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';
import '../insert/insert_entries.dart';
import 'context/context_switcher.dart' show contextStrings;
import 'chrome.dart';
import 'editors.dart';

/// Sticky note colours.
const noteColors = [Color(0xFFFFE58A), Color(0xFFBDEBC6), Color(0xFFFFC9D9), Color(0xFFBFE0FF), Color(0xFFFFD6A8)];

/// Add to the board: equations, notes, word cards, code, covered answers, graphs, 3D models and
/// labs, and the laser pointer.
class InsertPopover extends StatelessWidget {
  const InsertPopover({
    super.key,
    required this.wb,
    required this.primary,
    required this.onEquation,
    required this.onGraph,
    required this.onModel3d,
    required this.onLab,
    required this.onClose,
    this.extras = const [],
    this.categories = const [],
    this.relevant,
    this.showAll = false,
    this.onToggleAll,
  });

  /// Whether an entry (by key, `insert-graph`) belongs to what is being taught; null shows all.
  /// The rest show after "Show all tools".
  final bool Function(String key)? relevant;
  final bool showAll;
  final VoidCallback? onToggleAll;

  /// The spec's Insert categories (§24) as big tiles on top: PDF, Images, Videos, PPT,
  /// Clipboard, Geometry, Table, Flowchart.
  final List<InsertExtra> categories;

  final WhiteboardController wb;
  final bool primary;
  final VoidCallback onEquation;
  final VoidCallback onGraph;
  final VoidCallback onModel3d;
  final VoidCallback onLab;
  final VoidCallback onClose;

  /// Pictures, the picture library, PDF and PowerPoint, simulations (lib/features/insert).
  final List<InsertExtra> extras;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    void then(VoidCallback f) {
      onClose();
      f();
    }

    bool vis(Key? k) {
      final f = relevant;
      return showAll || f == null || k is! ValueKey<String> || f(k.value);
    }

    final cats = [for (final c in categories) if (vis(c.key)) c];
    final more = [for (final e in extras) if (vis(e.key)) e];
    return ListenableBuilder(
      listenable: wb,
      builder: (context, _) => PopoverCard(
        title: l.toolInsert,
        width: 400,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (cats.isNotEmpty) ...[
              Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                children: [
                  for (final c in cats)
                    SizedBox(
                      width: 84,
                      height: 84,
                      child: Material(
                        color: context.colors.surfaceContainerHigh,
                        borderRadius: BorderRadius.circular(Kx.rMd),
                        child: InkWell(
                          key: c.key,
                          borderRadius: BorderRadius.circular(Kx.rMd),
                          onTap: () => then(c.onTap),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(c.icon, size: 30),
                              const SizedBox(height: 4),
                              Text(c.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.labelMedium),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              const Divider(height: Kx.s24),
            ],
            if (vis(const Key('insert-equation')))
              KxMenuItem(
              key: const Key('insert-equation'),
              icon: Icons.functions,
              title: l.stEquation,
              hint: l.insertEquationHint,
              selected: wb.tool == BoardTool.math,
              onTap: () => then(onEquation),
            ),
            for (final k in [NoteKind.note, NoteKind.card, if (!primary) NoteKind.code, NoteKind.answer])
              KxMenuItem(
                key: Key('insert-${k.name}'),
                icon: noteIcon(k),
                title: noteName(l, k),
                hint: switch (k) {
                  NoteKind.answer => l.insertAnswerHint,
                  _ => l.tapToPlace,
                },
                selected: wb.tool == BoardTool.note && wb.noteKind == k,
                onTap: () => then(() => wb.setNoteKind(k)),
              ),
            if (wb.tool == BoardTool.note && wb.noteKind == NoteKind.note)
              Padding(
                padding: const EdgeInsets.fromLTRB(46, 0, 0, Kx.s8),
                child: Wrap(
                  spacing: 8,
                  children: [
                    for (final c in noteColors)
                      InkResponse(
                        onTap: () => wb.setNoteKind(NoteKind.note, color: c),
                        child: Container(
                          width: 32,
                          height: 32,
                          decoration: BoxDecoration(
                            color: c,
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(color: c == wb.noteColor ? context.colors.primary : context.colors.outlineVariant, width: c == wb.noteColor ? 3 : 1),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            if (!primary && vis(const Key('insert-graph'))) KxMenuItem(key: const Key('insert-graph'), icon: Icons.show_chart, title: l.stGraph, hint: l.graphHint, onTap: () => then(onGraph)),
            if (vis(const Key('insert-model3d'))) KxMenuItem(key: const Key('insert-model3d'), icon: Icons.view_in_ar_outlined, title: l.splitModel3d, hint: l.insertModelHint, onTap: () => then(onModel3d)),
            if (vis(const Key('insert-lab'))) KxMenuItem(key: const Key('insert-lab'), icon: Icons.science_outlined, title: l.splitLab, hint: l.insertModelHint, onTap: () => then(onLab)),
            for (final e in more) KxMenuItem(key: e.key, icon: e.icon, title: e.title, hint: e.hint, onTap: () => then(e.onTap)),
            if (!primary)
              KxMenuItem(
                key: const Key('insert-laser'),
                icon: Icons.flare,
                title: l.toolLaser,
                hint: l.laserHint,
                selected: wb.tool == BoardTool.laser,
                onTap: () => then(() => wb.tool = BoardTool.laser),
              ),
            if (wb.canPaste) KxMenuItem(icon: Icons.content_paste, title: l.paste, onTap: () => then(wb.paste)),
            if (relevant != null && onToggleAll != null)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(key: const Key('insert-show-all'), onPressed: onToggleAll, child: Text(showAll ? contextStrings(context)['showRelevant'] : contextStrings(context)['showAll'])),
              ),
          ],
        ),
      ),
    );
  }
}
