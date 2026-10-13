import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_cs/kinetix_cs.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../../l10n/feature_strings.dart';
import '../../../../l10n/l10n.dart';
import '../../chrome.dart';
import '../../panel/panel_host.dart';
import 'cs_diagram_strings.dart';

/// Opens the editor of a computer science diagram panel; returns the edited panel (same id and
/// place), or null when cancelled.
Future<KitElement?> editCsDiagram(BuildContext context, KitElement e) =>
    showPanelDialog<KitElement>(context: context, builder: (_) => BoardChromeTheme(child: CsDiagramEditor(element: e)));

/// Opens SQL in the code lab (tests replace it).
Future<void> Function(BuildContext context, String sql) openSqlInCodeLab = (context, sql) => showPanelDialog<void>(
  context: context,
  builder: (ctx) => BoardChromeTheme(
    child: Dialog(
      insetPadding: const EdgeInsets.all(24),
      child: SizedBox(
        width: math.min(1100, MediaQuery.sizeOf(ctx).width - 48),
        height: math.min(780, MediaQuery.sizeOf(ctx).height - 48),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: CodeLab(initialSample: Sample('sampleErSql', CodeLanguage.sql, sql), initialLanguage: CodeLanguage.sql),
        ),
      ),
    ),
  ),
);

/// The editor: the diagram drawn live (drag a box to move it), its text below, and for automata
/// a string to run through it step by step; ER diagrams and schemas give their SQL.
class CsDiagramEditor extends StatefulWidget {
  const CsDiagramEditor({super.key, required this.element});
  final KitElement element;

  @override
  State<CsDiagramEditor> createState() => _CsDiagramEditorState();
}

class _CsDiagramEditorState extends State<CsDiagramEditor> {
  late final CsDiagram _d = CsDiagram.fromJson(widget.element.data);
  late final _title = TextEditingController(text: _d.title);
  late final _spec = TextEditingController(text: _d.spec);
  late final _input = TextEditingController(text: _d.input);
  String? _dragging;

  KitElement get _current {
    _d
      ..title = _title.text
      ..spec = _spec.text
      ..input = _input.text;
    return widget.element.copyWith(data: _d.toJson());
  }

  @override
  void dispose() {
    for (final c in [_title, _spec, _input]) {
      c.dispose();
    }
    super.dispose();
  }

  int get _length => _input.text.runes.length;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = csDiagramStrings(context);
    final natural = KitElement.naturalSizeOf(KitKind.csDiagram);
    final size = MediaQuery.sizeOf(context);
    final preview = LayoutBuilder(
      builder: (context, box) {
        final w = math.min(box.maxWidth, 860.0);
        final shown = Size(w, w * natural.height / natural.width);
        final k = natural.width / shown.width;
        final current = _current;
        return Center(
          child: GestureDetector(
            key: const Key('csd-preview'),
            onPanStart: (dd) {
              final p = _d.parsed;
              _dragging = diagramNodeAt(p, layoutDiagram(p, _d.pos, natural), dd.localPosition * k);
              if (_dragging != null) {
                // Pin every box where it is now, so moving one does not shuffle the rest.
                final layout = layoutDiagram(p, _d.pos, natural);
                if (p.type != CsDiagramType.sequence) _d.pos.addAll({for (final e in layout.entries) e.key: _d.pos[e.key] ?? e.value});
              }
            },
            onPanUpdate: (dd) {
              final id = _dragging;
              if (id == null) return;
              final p = _d.parsed;
              final at = _d.pos[id] ?? layoutDiagram(p, _d.pos, natural)[id] ?? Offset.zero;
              final next = at + dd.delta * k;
              setState(() => _d.pos[id] = Offset(next.dx.clamp(20, natural.width - 20), next.dy.clamp(70, natural.height - 20)));
            },
            onPanEnd: (_) => _dragging = null,
            child: CustomPaint(size: shown, painter: _Painter(current)),
          ),
        );
      },
    );
    final automaton = _d.type == CsDiagramType.automaton;
    final sql = _d.type == CsDiagramType.er || _d.type == CsDiagramType.schema;
    return AlertDialog(
      key: const Key('csd-editor'),
      contentPadding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, 0),
      content: SizedBox(
        width: math.min(900, size.width - 64),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(key: const Key('csd-title'), controller: _title, decoration: InputDecoration(isDense: true, labelText: s['heading']), onChanged: (_) => setState(() {})),
              const SizedBox(height: Kx.s12),
              preview,
              const SizedBox(height: Kx.s8),
              Text(s['dragHint'], style: context.text.bodySmall),
              if (automaton) ..._automatonControls(s),
              const SizedBox(height: Kx.s12),
              TextField(
                key: const Key('csd-spec'),
                controller: _spec,
                minLines: 6,
                maxLines: 14,
                style: const TextStyle(fontFamily: 'monospace', fontSize: 15),
                decoration: InputDecoration(labelText: s['text'], alignLabelWithHint: true, border: const OutlineInputBorder()),
                onChanged: (_) => setState(() {
                  if (automaton) _d.step = _d.step.clamp(-1, _length);
                }),
              ),
              const SizedBox(height: Kx.s8),
              Text(s['help.${_d.type.name}'], key: const Key('csd-help'), style: context.text.bodySmall),
              const SizedBox(height: Kx.s8),
              Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                children: [
                  OutlinedButton.icon(key: const Key('csd-tidy'), onPressed: () => setState(_d.pos.clear), icon: const Icon(Icons.auto_fix_high), label: Text(s['tidy'])),
                  if (sql)
                    OutlinedButton.icon(
                      key: const Key('csd-sql'),
                      icon: const Icon(Icons.terminal),
                      label: Text(s['toSql']),
                      onPressed: () {
                        final p = parseDiagram(_d.type, _spec.text);
                        openSqlInCodeLab(context, _d.type == CsDiagramType.er ? erToSql(p) : schemaToSql(p));
                      },
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(key: const Key('csd-cancel'), onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(key: const Key('csd-done'), onPressed: () => Navigator.pop(context, _current), child: Text(l.done)),
      ],
    );
  }

  List<Widget> _automatonControls(FeatureStrings s) {
    final p = parseDiagram(CsDiagramType.automaton, _spec.text);
    final run = runAutomaton(p, _input.text);
    final step = _d.step;
    final done = step >= _length;
    final now = step < 0 ? null : run[step.clamp(0, run.length - 1)];
    return [
      const SizedBox(height: Kx.s12),
      Wrap(
        spacing: Kx.s8,
        runSpacing: Kx.s8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          SizedBox(
            width: 220,
            child: TextField(
              key: const Key('csd-input'),
              controller: _input,
              decoration: InputDecoration(isDense: true, labelText: s['input']),
              onChanged: (_) => setState(() => _d.step = _d.step < 0 ? -1 : 0),
            ),
          ),
          FilledButton.tonalIcon(key: const Key('csd-run'), onPressed: () => setState(() => _d.step = 0), icon: const Icon(Icons.play_arrow), label: Text(s['run'])),
          IconButton(key: const Key('csd-back'), icon: const Icon(Icons.chevron_left), onPressed: step > 0 ? () => setState(() => _d.step--) : null),
          IconButton(key: const Key('csd-next'), icon: const Icon(Icons.chevron_right), onPressed: step >= 0 && step < _length ? () => setState(() => _d.step++) : null),
          IconButton(key: const Key('csd-end'), icon: const Icon(Icons.last_page), onPressed: step < _length ? () => setState(() => _d.step = _length) : null),
          TextButton(key: const Key('csd-reset'), onPressed: () => setState(() => _d.step = -1), child: Text(s['reset'])),
          if (now != null)
            Text(
              done ? (now.any(p.accepts.contains) ? s['accepted'] : s['rejected']) : s.n('states', '{${now.join(', ')}}'),
              key: const Key('csd-verdict'),
              style: context.text.titleSmall,
            ),
        ],
      ),
    ];
  }
}

class _Painter extends CustomPainter {
  _Painter(this.e);
  final KitElement e;

  @override
  void paint(Canvas canvas, Size size) => paintKit(canvas, e.copyWith(rect: Offset.zero & size));

  @override
  bool shouldRepaint(_Painter old) => true;
}
