import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';
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
  });

  final WhiteboardController wb;
  final bool primary;
  final VoidCallback onEquation;
  final VoidCallback onGraph;
  final VoidCallback onModel3d;
  final VoidCallback onLab;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    void then(VoidCallback f) {
      onClose();
      f();
    }

    return ListenableBuilder(
      listenable: wb,
      builder: (context, _) => PopoverCard(
        title: l.toolInsert,
        width: 400,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
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
            if (!primary) KxMenuItem(key: const Key('insert-graph'), icon: Icons.show_chart, title: l.stGraph, hint: l.graphHint, onTap: () => then(onGraph)),
            KxMenuItem(key: const Key('insert-model3d'), icon: Icons.view_in_ar_outlined, title: l.splitModel3d, hint: l.insertModelHint, onTap: () => then(onModel3d)),
            KxMenuItem(key: const Key('insert-lab'), icon: Icons.science_outlined, title: l.splitLab, hint: l.insertModelHint, onTap: () => then(onLab)),
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
          ],
        ),
      ),
    );
  }
}
