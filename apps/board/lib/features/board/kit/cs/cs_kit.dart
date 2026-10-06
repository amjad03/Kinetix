import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_cs/kinetix_cs.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../../core/board_controller.dart';
import '../../chrome.dart';
import '../subjects.dart';
import '../../panel/panel_host.dart';

/// The Computer Science kit (BCA/MCA and school computer science): the code lab, algorithm
/// and data-structure animations, CS labs (numbers, logic, networks, OS, DBMS) and diagram
/// parts. The engines and screens live in packages/kinetix_cs (shared with the Student App);
/// this file puts them in the board's kit and on the board.
class CsKitTab extends StatelessWidget {
  const CsKitTab({super.key, required this.tab, required this.wb, required this.accent, this.board});

  final KitTab tab;
  final WhiteboardController wb;
  final Color accent;
  final BoardController? board;

  @override
  Widget build(BuildContext context) {
    final s = CsStrings.of(context);
    Widget section(String t) => Padding(padding: const EdgeInsets.fromLTRB(4, Kx.s16, 4, Kx.s8), child: Text(t, style: context.text.titleSmall));
    Widget item(String key, IconData icon, String label, VoidCallback onTap, {IconData trailing = Icons.open_in_new}) => Card(
      margin: const EdgeInsets.only(bottom: Kx.s8),
      child: ListTile(key: Key('cs-$key'), leading: Icon(icon, color: accent), title: Text(label), trailing: Icon(trailing), onTap: onTap),
    );
    final children = switch (tab) {
      KitTab.algorithms => [
        item('codeLab', Icons.terminal, s.t('codeLab'), () => openCodeLab(context, wb: wb, accent: accent, board: board)),
        for (final MapEntry(key: group, value: kinds) in algoGroups.entries) ...[
          section(s.t(group)),
          for (final k in kinds)
            item(
              k.name,
              algoIcon(k),
              s.t('algo_${k.name}'),
              () => showCsDialog(context, s.t('algo_${k.name}'), (close) => AlgoPlayer(kind: k, accent: accent, onInsert: (els) => close(els)), wb),
            ),
        ],
      ],
      KitTab.csLabs => [
        for (final MapEntry(key: group, value: kinds) in simGroups.entries) ...[
          section(s.t(group)),
          for (final k in kinds)
            item(k.name, simIcon(k), s.t('sim_${k.name}'), () => showCsDialog(context, s.t('sim_${k.name}'), (close) => SimPanel(kind: k, accent: accent, onInsert: (els) => close(els)), wb)),
        ],
      ],
      _ => [_Diagrams(wb: wb, accent: accent)],
    };
    return ListView(padding: const EdgeInsets.all(Kx.s12), children: children);
  }
}

/// A large dialog for a CS screen; what [build]'s close callback gets goes on the board.
Future<void> showCsDialog(BuildContext context, String title, Widget Function(void Function(List<BoardElement>) close) build, WhiteboardController wb) async {
  final els = await showPanelDialog<List<BoardElement>>(
    context: context,
    builder: (ctx) {
      final size = MediaQuery.sizeOf(ctx);
      final phone = size.shortestSide < 600;
      return BoardChromeTheme(
        child: Dialog(
          insetPadding: EdgeInsets.all(phone ? 8 : 24),
          child: SizedBox(
            width: math.min(1240, size.width - (phone ? 16 : 48)),
            height: math.min(860, size.height - (phone ? 16 : 48)),
            child: Padding(
              padding: EdgeInsets.all(phone ? 10 : 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text(title, style: Theme.of(ctx).textTheme.titleLarge, overflow: TextOverflow.ellipsis)),
                      IconButton(key: const Key('cs-close'), tooltip: CsStrings.of(ctx).t('close'), icon: const Icon(Icons.close), onPressed: () => Navigator.pop(ctx)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Expanded(child: build((els) => Navigator.pop(ctx, els))),
                ],
              ),
            ),
          ),
        ),
      );
    },
  );
  if (els != null && els.isNotEmpty) wb.insert(els);
}

/// The code lab over the board: C, C++ and Java go to the API with the board's class session.
Future<void> openCodeLab(BuildContext context, {required WhiteboardController wb, required Color accent, BoardController? board}) {
  final server = ServerRunner(
    endpoint: () {
      final api = board?.api;
      return api == null || api.sessionToken == null ? null : Uri.parse('${api.baseUrl}/v1/code/run');
    },
    headers: () async => {if (board?.api?.sessionToken case final t?) 'authorization': 'Bearer $t'},
  );
  return showCsDialog(context, CsStrings.of(context).t('codeLab'), (close) => CodeLab(server: server, accent: accent, onInsert: close), wb);
}

/// Flowchart, UML and ER parts, and connectors between two selected shapes.
class _Diagrams extends StatelessWidget {
  const _Diagrams({required this.wb, required this.accent});

  final WhiteboardController wb;
  final Color accent;

  Future<String?> _ask(BuildContext context, String title, {String initial = '', int lines = 1, String? hint}) =>
      showPanelDialog<String>(context: context, builder: (_) => BoardChromeTheme(child: _LabelDialog(title: title, initial: initial, lines: lines, hint: hint)));

  /// The two shapes selected on the board, as boxes (each group counts once).
  List<Rect> _selectedBoxes() {
    final groups = <String, List<BoardElement>>{};
    for (final e in wb.selectedElements) {
      (groups[wb.page.groups[e.id] ?? e.id] ??= []).add(e);
    }
    return [for (final g in groups.values) contentBounds(g)];
  }

  @override
  Widget build(BuildContext context) {
    final s = CsStrings.of(context);
    Widget chip(String key, IconData icon, String label, Future<void> Function() onTap) =>
        ActionChip(key: Key('cs-$key'), avatar: Icon(icon, size: 18, color: accent), label: Text(label), onPressed: onTap);
    Widget group(String title, List<Widget> chips) => Padding(
      padding: const EdgeInsets.only(bottom: Kx.s12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(padding: const EdgeInsets.fromLTRB(4, Kx.s8, 4, Kx.s8), child: Text(title, style: context.text.titleSmall)),
          Wrap(spacing: 8, runSpacing: 8, children: chips),
        ],
      ),
    );
    Future<void> labelled(String key, List<BoardElement> Function(String) make) async {
      final t = await _ask(context, s.t(key), initial: s.t(key));
      if (t != null) wb.insert(make(t));
    }

    Future<void> link(Connector c) async {
      final boxes = _selectedBoxes();
      if (boxes.length != 2) {
        ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(s.t('selectTwo'))));
        return;
      }
      final label = c == Connector.message || c == Connector.reply || c == Connector.line ? await _ask(context, s.t('conn_${c.name}')) : '';
      if (label == null) return;
      final els = connect(boxes[0], boxes[1], c, label: label);
      if (els.isNotEmpty) wb.insert(els, at: contentBounds(els).topLeft);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        group(s.t('flowchart'), [
          for (final (p, key, icon) in const [
            (FlowPart.startEnd, 'flow_startEnd', Icons.circle_outlined),
            (FlowPart.process, 'flow_process', Icons.crop_square),
            (FlowPart.decision, 'flow_decision', Icons.diamond_outlined),
            (FlowPart.io, 'flow_io', Icons.input),
            (FlowPart.predefined, 'flow_predefined', Icons.view_column_outlined),
            (FlowPart.connector, 'flow_connector', Icons.radio_button_unchecked),
          ])
            chip(key, icon, s.t(key), () => labelled(key, (t) => flowPart(p, t))),
        ]),
        group(s.t('umlClass'), [
          chip('classBox', Icons.view_agenda_outlined, s.t('classBox'), () async {
            final spec = await _ask(context, s.t('classBox'), initial: 'Student\n- rollNo: int\n- name: String\n--\n+ register(): void', lines: 6, hint: s.t('classHint'));
            if (spec != null) wb.insert(umlClass(spec));
          }),
          chip('interfaceBox', Icons.view_agenda_outlined, s.t('interfaceBox'), () async {
            final spec = await _ask(context, s.t('interfaceBox'), initial: 'Shape\n--\n+ area(): double', lines: 4, hint: s.t('classHint'));
            if (spec != null) wb.insert(umlClass(spec, interface: true));
          }),
        ]),
        group(s.t('umlSequence'), [
          chip('lifeline', Icons.more_vert, s.t('lifeline'), () => labelled('lifeline', (t) => lifeline(t))),
          chip('actor', Icons.accessibility_new, s.t('actor'), () => labelled('actor', (t) => lifeline(t, actor: true))),
          chip('activation', Icons.crop_portrait, s.t('activation'), () async => wb.insert(activationBar())),
        ]),
        group(s.t('er'), [
          for (final p in ErPart.values) chip('er_${p.name}', Icons.schema_outlined, s.t('er_${p.name}'), () => labelled('er_${p.name}', (t) => erPart(p, t))),
        ]),
        group(s.t('connectors'), [
          for (final c in Connector.values) chip('conn_${c.name}', Icons.east, s.t('conn_${c.name}'), () => link(c)),
        ]),
        Text(s.t('connectHint'), style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
      ],
    );
  }
}

/// Asks for a shape's words (or a class's lines).
class _LabelDialog extends StatefulWidget {
  const _LabelDialog({required this.title, required this.initial, required this.lines, this.hint});

  final String title;
  final String initial;
  final int lines;
  final String? hint;

  @override
  State<_LabelDialog> createState() => _LabelDialogState();
}

class _LabelDialogState extends State<_LabelDialog> {
  late final _c = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = CsStrings.of(context);
    return AlertDialog(
      title: Text(widget.title),
      content: SizedBox(
        width: 420,
        child: TextField(
          key: const Key('cs-label'),
          controller: _c,
          autofocus: true,
          minLines: widget.lines,
          maxLines: widget.lines,
          decoration: InputDecoration(labelText: s.t('label'), hintText: widget.hint),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(s.t('cancel'))),
        FilledButton(key: const Key('cs-add'), onPressed: () => Navigator.pop(context, _c.text), child: Text(s.t('add'))),
      ],
    );
  }
}
