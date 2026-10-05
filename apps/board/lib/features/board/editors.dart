import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';

/// The small editors the board opens for what is written on it: equations, notes, graphs and
/// number lines. Each returns its result with Navigator.pop, or null when cancelled.

/// Equation: LaTeX with a live preview and buttons for the common signs, so teachers who do
/// not know LaTeX can still write fractions and roots.
class MathEditorDialog extends StatefulWidget {
  const MathEditorDialog({super.key, this.initial, this.chemistry = false});

  final String? initial;

  /// Chemical equations: subscripts and reaction arrows first.
  final bool chemistry;

  @override
  State<MathEditorDialog> createState() => _MathEditorDialogState();
}

class _MathEditorDialogState extends State<MathEditorDialog> {
  late final _tex = TextEditingController(text: widget.initial ?? '');

  static const _maths = [
    (r'\frac{a}{b}', r'\frac{}{}'),
    (r'x^2', '^{}'),
    (r'x_1', '_{}'),
    (r'\sqrt{x}', r'\sqrt{}'),
    (r'\pi', r'\pi '),
    (r'\theta', r'\theta '),
    (r'\times', r'\times '),
    (r'\div', r'\div '),
    (r'\pm', r'\pm '),
    (r'\leq', r'\leq '),
    (r'\geq', r'\geq '),
    (r'\neq', r'\neq '),
    (r'\angle', r'\angle '),
    (r'90^\circ', r'^\circ'),
  ];

  static const _chemistry = [
    (r'\mathrm{H_2O}', r'\mathrm{H_2O}'),
    (r'x_2', '_{}'),
    (r'x^{2+}', '^{}'),
    (r'\rightarrow', r'\rightarrow '),
    (r'\rightleftharpoons', r'\rightleftharpoons '),
    (r'\uparrow', r'\uparrow '),
    (r'\downarrow', r'\downarrow '),
    (r'\Delta', r'\Delta '),
  ];

  void _insert(String s) {
    final sel = _tex.selection;
    final at = sel.isValid ? sel.start : _tex.text.length;
    final end = sel.isValid ? sel.end : _tex.text.length;
    final text = _tex.text.replaceRange(at, end, s);
    // Put the cursor in the first empty braces, ready to type.
    final hole = s.indexOf('{}');
    _tex.value = TextEditingValue(text: text, selection: TextSelection.collapsed(offset: at + (hole >= 0 ? hole + 1 : s.length)));
    setState(() {});
  }

  @override
  void dispose() {
    _tex.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final keys = widget.chemistry ? [..._chemistry, ..._maths.take(4)] : _maths;
    return AlertDialog(
      scrollable: true,
      icon: const Icon(Icons.functions),
      title: Text(widget.chemistry ? l.stChemEquation : l.stEquation),
      content: SizedBox(
        width: 560,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              key: const Key('math-preview'),
              height: 110,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: context.colors.surfaceContainerLowest, borderRadius: Kx.radiusLg, border: Border.all(color: context.colors.outlineVariant)),
              child: _tex.text.trim().isEmpty
                  ? Text(l.equationPreview, style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant))
                  : FittedBox(
                      child: Padding(
                        padding: const EdgeInsets.all(Kx.s12),
                        child: BoardMath(
                          element: MathElement(id: 'preview', position: Offset.zero, latex: _tex.text, color: KxColor.ink, fontSize: 34, size: const Size(1, 1)),
                        ),
                      ),
                    ),
            ),
            const SizedBox(height: Kx.s12),
            Wrap(
              spacing: Kx.s8,
              runSpacing: Kx.s8,
              children: [
                for (final (label, insert) in keys)
                  ActionChip(
                    label: SizedBox(
                      height: 28,
                      child: BoardMath(element: MathElement(id: label, position: Offset.zero, latex: label, color: KxColor.ink, fontSize: 16, size: const Size(1, 1))),
                    ),
                    onPressed: () => _insert(insert),
                  ),
              ],
            ),
            const SizedBox(height: Kx.s12),
            TextField(
              key: const Key('math-tex'),
              controller: _tex,
              autofocus: true,
              style: const TextStyle(fontFamily: KxFonts.code),
              decoration: InputDecoration(labelText: l.equationLatex, hintText: r'\frac{1}{2}mv^2'),
              onChanged: (_) => setState(() {}),
              onSubmitted: (_) => Navigator.pop(context, _tex.text.trim()),
            ),
          ],
        ),
      ),
      actions: [
        if (widget.initial != null) TextButton(onPressed: () => Navigator.pop(context, ''), child: Text(l.delete)),
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(key: const Key('math-done'), onPressed: () => Navigator.pop(context, _tex.text.trim()), child: Text(l.putOnBoard)),
      ],
    );
  }
}

/// A note, word card, code block or answer card: its words.
class NoteEditorDialog extends StatefulWidget {
  const NoteEditorDialog({super.key, this.initial, required this.kind});

  final String? initial;
  final NoteKind kind;

  @override
  State<NoteEditorDialog> createState() => _NoteEditorDialogState();
}

class _NoteEditorDialogState extends State<NoteEditorDialog> {
  late final _text = TextEditingController(text: widget.initial ?? '');

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final code = widget.kind == NoteKind.code;
    return AlertDialog(
      scrollable: true,
      icon: Icon(noteIcon(widget.kind)),
      title: Text(noteName(l, widget.kind)),
      content: SizedBox(
        width: 520,
        child: TextField(
          key: const Key('note-text'),
          controller: _text,
          autofocus: true,
          minLines: code ? 6 : 3,
          maxLines: code ? 14 : 6,
          maxLength: code ? 4000 : 400,
          style: code ? const TextStyle(fontFamily: KxFonts.code) : null,
          decoration: InputDecoration(hintText: widget.kind == NoteKind.answer ? l.answerHint : null),
        ),
      ),
      actions: [
        if (widget.initial != null) TextButton(onPressed: () => Navigator.pop(context, ''), child: Text(l.delete)),
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(key: const Key('note-done'), onPressed: () => Navigator.pop(context, _text.text.trimRight()), child: Text(l.putOnBoard)),
      ],
    );
  }
}

IconData noteIcon(NoteKind k) => switch (k) {
  NoteKind.note => Icons.sticky_note_2_outlined,
  NoteKind.code => Icons.code,
  NoteKind.card => Icons.style_outlined,
  NoteKind.answer => Icons.visibility_off_outlined,
};

String noteName(AppLocalizations l, NoteKind k) => switch (k) {
  NoteKind.note => l.noteSticky,
  NoteKind.code => l.stCode,
  NoteKind.card => l.stWordCard,
  NoteKind.answer => l.noteAnswer,
};

/// Graph: y = f(x) and the window to draw it in.
class GraphDialog extends StatefulWidget {
  const GraphDialog({super.key});

  @override
  State<GraphDialog> createState() => _GraphDialogState();
}

class _GraphDialogState extends State<GraphDialog> {
  final _expr = TextEditingController(text: 'x^2 - 4');
  final _x = TextEditingController(text: '10');
  final _y = TextEditingController(text: '10');

  @override
  void dispose() {
    _expr.dispose();
    _x.dispose();
    _y.dispose();
    super.dispose();
  }

  void _done() {
    final x = double.tryParse(_x.text)?.abs() ?? 10, y = double.tryParse(_y.text)?.abs() ?? 10;
    Navigator.pop(context, (expression: _expr.text.trim(), x: x == 0 ? 10.0 : x, y: y == 0 ? 10.0 : y));
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final ok = _expr.text.trim().isEmpty || compileGraph(_expr.text) != null;
    return AlertDialog(
      icon: const Icon(Icons.show_chart),
      title: Text(l.stGraph),
      content: SizedBox(
        width: 460,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              key: const Key('graph-expression'),
              controller: _expr,
              autofocus: true,
              decoration: InputDecoration(prefixText: 'y = ', labelText: l.graphFunction, errorText: ok ? null : l.graphCannotRead, helperText: l.graphHint),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: Kx.s12),
            Row(
              children: [
                Expanded(
                  child: TextField(controller: _x, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l.graphXRange)),
                ),
                const SizedBox(width: Kx.s12),
                Expanded(
                  child: TextField(controller: _y, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l.graphYRange)),
                ),
              ],
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(key: const Key('graph-done'), onPressed: ok ? _done : null, child: Text(l.putOnBoard)),
      ],
    );
  }
}

/// Number line: from, to and the step.
class NumberLineDialog extends StatefulWidget {
  const NumberLineDialog({super.key});

  @override
  State<NumberLineDialog> createState() => _NumberLineDialogState();
}

class _NumberLineDialogState extends State<NumberLineDialog> {
  final _from = TextEditingController(text: '-5');
  final _to = TextEditingController(text: '5');
  final _step = TextEditingController(text: '1');

  @override
  void dispose() {
    _from.dispose();
    _to.dispose();
    _step.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    Widget field(TextEditingController c, String label) => Expanded(
      child: TextField(
        controller: c,
        keyboardType: const TextInputType.numberWithOptions(signed: true, decimal: true),
        decoration: InputDecoration(labelText: label),
      ),
    );
    return AlertDialog(
      scrollable: true,
      icon: const Icon(Icons.linear_scale),
      title: Text(l.stNumberLine),
      content: SizedBox(
        width: 420,
        child: Row(children: [field(_from, l.numberFrom), const SizedBox(width: Kx.s12), field(_to, l.numberTo), const SizedBox(width: Kx.s12), field(_step, l.numberStep)]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(
          key: const Key('numberline-done'),
          onPressed: () {
            final from = double.tryParse(_from.text) ?? -5, to = double.tryParse(_to.text) ?? 5, step = (double.tryParse(_step.text) ?? 1).abs();
            if (to <= from || step == 0) return;
            Navigator.pop(context, (from: from, to: to, step: step));
          },
          child: Text(l.putOnBoard),
        ),
      ],
    );
  }
}
