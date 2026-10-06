import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../../l10n/l10n.dart';
import '../../chrome.dart';
import 'college_builders.dart' show workingElements;
import 'finance.dart' show Working;
import '../../panel/panel_host.dart';

/// One input of a calculator.
class CalcField {
  const CalcField(this.key, this.label, {this.initial = '', this.lines = 1, this.hint, this.only});
  final String key, label, initial;
  final String? hint;

  /// More than 1 for pasted data.
  final int lines;

  /// Shown only for these choices (all when null).
  final Set<String>? only;
}

/// What the calculator was given.
class CalcInput {
  CalcInput(this.choice, this.text, this.on);
  final String choice;
  final Map<String, String> text;
  final Map<String, bool> on;

  /// A number, or null when the field is blank; throws [FormatException] when it is not one.
  double? opt(String k) {
    final t = (text[k] ?? '').trim().replaceAll(RegExp(r'[₹,\s]'), '');
    if (t.isEmpty) return null;
    return double.tryParse(t) ?? (throw FormatException(k));
  }

  double num(String k) => opt(k) ?? (throw FormatException(k));
  int whole(String k) => num(k).round();
}

/// A worked answer (if any) and the drawings that go with it (built in the board's colours).
class CalcOutput {
  const CalcOutput(this.working, {this.charts = const []});
  final Working? working;
  final List<List<BoardElement> Function(Color ink, Color accent)> charts;
}

/// A calculator: inputs, optional choices (a segmented button) and switches, and the sum.
class CalcSpec {
  const CalcSpec({required this.title, required this.fields, required this.compute, this.choices = const [], this.toggles = const [], this.extraAction});
  final String title;
  final List<CalcField> fields;
  final List<(String, String)> choices;
  final List<(String, String, bool)> toggles;
  final CalcOutput Function(CalcInput i) compute;

  /// A further button (e.g. open the break-even lab): label and what it does.
  final (String, VoidCallback)? extraAction;
}

/// Stacks [parts] top to bottom with a gap, each moved so its box starts at the left.
List<BoardElement> stackParts(List<List<BoardElement>> parts, {double gap = 60}) {
  final out = <BoardElement>[];
  var y = 0.0;
  for (final p in parts.where((p) => p.isNotEmpty)) {
    final b = contentBounds(p);
    out.addAll(p.map((e) => e.translated(Offset(-b.left, y - b.top))));
    y += b.height + gap;
  }
  return out;
}

/// Shows [spec]; returns the elements to put on the board, or null.
Future<List<BoardElement>?> showCalculator(BuildContext context, CalcSpec spec, {required Color ink, required Color accent}) =>
    showPanelDialog<List<BoardElement>>(context: context, builder: (_) => BoardChromeTheme(child: CalculatorDialog(spec: spec, ink: ink, accent: accent)));

class CalculatorDialog extends StatefulWidget {
  const CalculatorDialog({super.key, required this.spec, required this.ink, required this.accent});
  final CalcSpec spec;
  final Color ink, accent;

  @override
  State<CalculatorDialog> createState() => _CalculatorDialogState();
}

class _CalculatorDialogState extends State<CalculatorDialog> {
  late final _ctl = {for (final f in widget.spec.fields) f.key: TextEditingController(text: f.initial)};
  late final _on = {for (final (k, _, v) in widget.spec.toggles) k: v};
  late String _choice = widget.spec.choices.isEmpty ? '' : widget.spec.choices.first.$1;
  CalcOutput? _out;
  String? _error;

  @override
  void dispose() {
    for (final c in _ctl.values) {
      c.dispose();
    }
    super.dispose();
  }

  CalcOutput? _run() {
    try {
      final out = widget.spec.compute(CalcInput(_choice, {for (final e in _ctl.entries) e.key: e.value.text}, Map.of(_on)));
      setState(() {
        _out = out;
        _error = null;
      });
      return out;
    } on Object {
      setState(() {
        _out = null;
        _error = context.l10n.calcCheckInputs;
      });
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final spec = widget.spec;
    final out = _out;
    return AlertDialog(
      key: const Key('calc-dialog'),
      title: Text(spec.title),
      scrollable: true,
      content: SizedBox(
        width: 560,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (spec.choices.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: Kx.s12),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: SegmentedButton<String>(
                    key: const Key('calc-choice'),
                    showSelectedIcon: false,
                    segments: [for (final (k, label) in spec.choices) ButtonSegment(value: k, label: Text(label))],
                    selected: {_choice},
                    onSelectionChanged: (s) => setState(() {
                      _choice = s.first;
                      _out = null;
                    }),
                  ),
                ),
              ),
            for (final f in spec.fields)
              if (f.only == null || f.only!.contains(_choice))
                Padding(
                  padding: const EdgeInsets.only(bottom: Kx.s12),
                  child: TextField(
                    key: Key('calc-${f.key}'),
                    controller: _ctl[f.key],
                    minLines: f.lines,
                    maxLines: f.lines == 1 ? 1 : f.lines + 3,
                    keyboardType: f.lines == 1 ? const TextInputType.numberWithOptions(decimal: true, signed: true) : TextInputType.multiline,
                    decoration: InputDecoration(labelText: f.label, helperText: f.hint, helperMaxLines: 3, isDense: true),
                  ),
                ),
            for (final (k, label, _) in spec.toggles)
              SwitchListTile(
                key: Key('calc-$k'),
                contentPadding: EdgeInsets.zero,
                title: Text(label),
                value: _on[k]!,
                onChanged: (v) => setState(() => _on[k] = v),
              ),
            if (_error != null) Text(_error!, style: TextStyle(color: context.colors.error)),
            if (out?.working case final w?) ...[
              const Divider(),
              Text(w.title, style: context.text.titleMedium),
              const SizedBox(height: Kx.s8),
              SelectableText(w.steps.join('\n'), key: const Key('calc-steps'), style: context.text.bodyMedium),
              const SizedBox(height: Kx.s8),
              Text(w.answer, key: const Key('calc-answer'), style: context.text.titleMedium?.copyWith(color: widget.accent)),
            ],
          ],
        ),
      ),
      actions: [
        if (spec.extraAction case (final label, final action)) TextButton(onPressed: action, child: Text(label)),
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        OutlinedButton(key: const Key('calc-run'), onPressed: _run, child: Text(l.calcWorkOut)),
        FilledButton(
          key: const Key('calc-insert'),
          onPressed: () {
            final o = _run();
            if (o == null) return;
            Navigator.pop(context, stackParts([if (o.working case final w?) workingFor(w), for (final c in o.charts) c(widget.ink, widget.accent)]));
          },
          child: Text(l.calcPutOnBoard),
        ),
      ],
    );
  }

  List<BoardElement> workingFor(Working w) => workingElements(w, widget.ink, widget.accent);
}
