import 'package:flutter/gestures.dart' show DragStartBehavior;
import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/feature_strings.dart';
import 'mind_map.dart';

FeatureStrings mindMapStrings(BuildContext context) => FeatureStrings(boardLang(context), mindMapStringTable);

const mindMapStringTable = <String, Map<String, String>>{
  'en': {
    'title': 'Mind map',
    'topic': 'Main topic',
    'idea': 'New idea',
    'addChild': 'Add branch',
    'addSibling': 'Add beside',
    'edit': 'Rename',
    'delete': 'Delete',
    'collapse': 'Fold',
    'expand': 'Unfold',
    'autoLayout': 'Tidy up',
    'place': 'Put on board',
    'placed': 'Mind map added to the board',
    'hint': 'Tap an idea, then add branches. Drag ideas to move them.',
    'ok': 'OK',
    'cancel': 'Cancel',
    'text': 'Idea text',
  },
  'hi': {
    'title': 'माइंड मैप',
    'topic': 'मुख्य विषय',
    'idea': 'नया विचार',
    'addChild': 'शाखा जोड़ें',
    'addSibling': 'बगल में जोड़ें',
    'edit': 'नाम बदलें',
    'delete': 'हटाएँ',
    'collapse': 'समेटें',
    'expand': 'खोलें',
    'autoLayout': 'व्यवस्थित करें',
    'place': 'बोर्ड पर रखें',
    'placed': 'माइंड मैप बोर्ड पर जोड़ दिया गया',
    'hint': 'किसी विचार को छुएँ, फिर शाखाएँ जोड़ें। विचारों को खींचकर हिलाएँ।',
    'ok': 'ठीक है',
    'cancel': 'रद्द करें',
    'text': 'विचार का पाठ',
  },
  'kn': {
    'title': 'ಮೈಂಡ್ ಮ್ಯಾಪ್',
    'topic': 'ಮುಖ್ಯ ವಿಷಯ',
    'idea': 'ಹೊಸ ಆಲೋಚನೆ',
    'addChild': 'ಕೊಂಬೆ ಸೇರಿಸಿ',
    'addSibling': 'ಪಕ್ಕದಲ್ಲಿ ಸೇರಿಸಿ',
    'edit': 'ಹೆಸರು ಬದಲಿಸಿ',
    'delete': 'ಅಳಿಸಿ',
    'collapse': 'ಮಡಚಿ',
    'expand': 'ಬಿಡಿಸಿ',
    'autoLayout': 'ಸರಿಪಡಿಸಿ',
    'place': 'ಬೋರ್ಡ್‌ಗೆ ಹಾಕಿ',
    'placed': 'ಮೈಂಡ್ ಮ್ಯಾಪ್ ಬೋರ್ಡ್‌ಗೆ ಸೇರಿಸಲಾಗಿದೆ',
    'hint': 'ಆಲೋಚನೆಯನ್ನು ಒತ್ತಿ, ನಂತರ ಕೊಂಬೆಗಳನ್ನು ಸೇರಿಸಿ. ಎಳೆದು ಸರಿಸಿ.',
    'ok': 'ಸರಿ',
    'cancel': 'ರದ್ದು',
    'text': 'ಆಲೋಚನೆಯ ಪಠ್ಯ',
  },
};

/// The mind map tool: a radial map of ideas (centre topic, branches, sub-branches) laid out for
/// you, in a colour per branch, that folds, grows and drags. It is not a flowchart: no shapes or
/// connectors to place. "Put on board" writes it to the board as blocks and curved branches.
class MindMapEditor extends StatefulWidget {
  const MindMapEditor({super.key, required this.wb, this.initial});

  final WhiteboardController wb;
  final MindMap? initial;

  /// Opens the editor over the board.
  static Future<void> open(BuildContext context, WhiteboardController wb) =>
      showDialog<void>(context: context, barrierDismissible: false, useSafeArea: false, builder: (_) => Dialog.fullscreen(child: MindMapEditor(wb: wb)));

  @override
  State<MindMapEditor> createState() => _MindMapEditorState();
}

class _MindMapEditorState extends State<MindMapEditor> {
  MindMap? _map;
  String _selected = 'n0';
  Offset _pan = Offset.zero;

  MindMap get map => _map!;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _map ??= widget.initial ?? MindMap(mindMapStrings(context)['topic']);
  }

  Future<void> _rename(MindNode n) async {
    final text = await showDialog<String>(context: context, builder: (_) => _RenameDialog(initial: n.text));
    if (text != null && text.trim().isNotEmpty) setState(() => n.text = text.trim());
  }

  void _drag(MindNode n, Offset d) {
    // A branch takes its sub-branches with it.
    void move(MindNode x) {
      x.nudge += d;
      for (final c in x.children) {
        move(c);
      }
    }

    setState(() => move(n));
  }

  void _place() {
    widget.wb.insert(map.toElements());
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(mindMapStrings(context)['placed'])));
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final s = mindMapStrings(context);
    final sel = map.find(_selected) ?? map.root;
    final canCollapse = sel.children.isNotEmpty;
    return Scaffold(
      key: const Key('mind-map'),
      appBar: AppBar(
        title: Text(s['title']),
        leading: IconButton(key: const Key('mm-close'), icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context)),
        actions: [
          FilledButton.icon(key: const Key('mm-place'), onPressed: _place, icon: const Icon(Icons.dashboard_customize_outlined), label: Text(s['place'])),
          const SizedBox(width: Kx.s12),
        ],
      ),
      body: Column(
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.all(Kx.s8),
            child: Row(
              children: [
                _action(const Key('mm-add-child'), Icons.subdirectory_arrow_right, s['addChild'], () => setState(() => _selected = map.addChild(sel.id, s['idea'])!.id)),
                _action(const Key('mm-add-sibling'), Icons.add_circle_outline, s['addSibling'], () => setState(() => _selected = map.addSibling(sel.id, s['idea'])!.id)),
                _action(const Key('mm-edit'), Icons.edit_outlined, s['edit'], () => _rename(sel)),
                _action(const Key('mm-collapse'), sel.collapsed ? Icons.unfold_more : Icons.unfold_less, sel.collapsed ? s['expand'] : s['collapse'], canCollapse ? () => setState(() => map.toggle(sel.id)) : null),
                _action(const Key('mm-delete'), Icons.delete_outline, s['delete'], sel == map.root ? null : () => setState(() {
                  _selected = map.parentOf(sel.id)?.id ?? map.root.id;
                  map.remove(sel.id);
                })),
                _action(const Key('mm-auto'), Icons.auto_fix_high_outlined, s['autoLayout'], () => setState(() {
                  map.autoLayout();
                  _pan = Offset.zero;
                })),
                Padding(padding: const EdgeInsets.only(left: Kx.s8), child: Text(s['hint'], style: context.text.bodySmall)),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: LayoutBuilder(
              builder: (context, box) {
                final centre = Offset(box.maxWidth / 2, box.maxHeight / 2) + _pan;
                final at = map.layout();
                return GestureDetector(
                  key: const Key('mm-canvas'),
                  behavior: HitTestBehavior.opaque,
                  dragStartBehavior: DragStartBehavior.down,
                  onPanUpdate: (d) => setState(() => _pan += d.delta),
                  onTap: () => setState(() => _selected = map.root.id),
                  child: ClipRect(
                    child: Stack(
                      children: [
                        Positioned.fill(child: CustomPaint(painter: _BranchPainter(map, at, centre))),
                        for (final n in map.nodes)
                          if (at[n.id] case final p?) _nodeWidget(context, n, centre + p),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _action(Key key, IconData icon, String label, VoidCallback? onTap) => Padding(
    padding: const EdgeInsets.only(right: Kx.s8),
    child: OutlinedButton.icon(key: key, onPressed: onTap, icon: Icon(icon, size: 18), label: Text(label)),
  );

  Widget _nodeWidget(BuildContext context, MindNode n, Offset centre) {
    final r = map.rectOf(n, centre);
    final color = map.colorOf(n.id);
    final isRoot = n == map.root;
    final selected = n.id == _selected;
    final s = mindMapStrings(context);
    return Positioned.fromRect(
      key: ValueKey('mm-pos-${n.id}'),
      rect: r,
      child: GestureDetector(
        key: Key('mm-node-${n.id}'),
        onTap: () => setState(() => _selected = n.id),
        onLongPress: () => _rename(n),
        // Moves from the first touch, with no slop to cross first.
        dragStartBehavior: DragStartBehavior.down,
        onPanUpdate: (d) => _drag(n, d.delta),
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: color.withValues(alpha: isRoot ? 0.2 : 0.12),
                  borderRadius: BorderRadius.circular(isRoot ? 40 : 26),
                  border: Border.all(color: color, width: selected ? 4 : 2),
                ),
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    child: Text(n.text, maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: (isRoot ? context.text.titleMedium : context.text.bodyMedium)?.copyWith(fontWeight: FontWeight.w600)),
                  ),
                ),
              ),
            ),
            if (n.children.isNotEmpty)
              Positioned(
                // Inside the box, so it can be tapped (hits outside a box do not reach it).
                right: 2,
                top: 2,
                child: Semantics(
                  label: n.collapsed ? s['expand'] : s['collapse'],
                  button: true,
                  child: GestureDetector(
                    key: Key('mm-toggle-${n.id}'),
                    behavior: HitTestBehavior.opaque,
                    onTap: () => setState(() => map.toggle(n.id)),
                    child: CircleAvatar(radius: 13, backgroundColor: color, foregroundColor: Colors.white, child: Text(n.collapsed ? '+${n.children.length}' : '−', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold))),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// The curved branches, thick near the centre and thinner outward, each in its branch's colour.
class _BranchPainter extends CustomPainter {
  _BranchPainter(this.map, this.at, this.centre);

  final MindMap map;
  final Map<String, Offset> at;
  final Offset centre;

  @override
  void paint(Canvas canvas, Size size) {
    void branches(MindNode n, int depth) {
      if (n.collapsed || !at.containsKey(n.id)) return;
      for (final c in n.children) {
        if (!at.containsKey(c.id)) continue;
        final a = centre + at[n.id]!, b = centre + at[c.id]!;
        final mid = Offset.lerp(a, b, 0.5)!;
        // Bend towards the centre side so branches sweep out like a tree's.
        final ctrl = Offset(mid.dx, a.dy);
        final path = Path()
          ..moveTo(a.dx, a.dy)
          ..quadraticBezierTo(ctrl.dx, ctrl.dy, b.dx, b.dy);
        canvas.drawPath(
          path,
          Paint()
            ..color = map.colorOf(c.id)
            ..style = PaintingStyle.stroke
            ..strokeCap = StrokeCap.round
            ..strokeWidth = (7 - depth * 2).clamp(2, 7).toDouble(),
        );
        branches(c, depth + 1);
      }
    }

    branches(map.root, 0);
  }

  @override
  bool shouldRepaint(_BranchPainter old) => true;
}

/// Asks for an idea's new words; owns its text controller so it is disposed with the dialog.
class _RenameDialog extends StatefulWidget {
  const _RenameDialog({required this.initial});
  final String initial;

  @override
  State<_RenameDialog> createState() => _RenameDialogState();
}

class _RenameDialogState extends State<_RenameDialog> {
  late final _c = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = mindMapStrings(context);
    return AlertDialog(
      title: Text(s['edit']),
      content: TextField(key: const Key('mm-text-field'), controller: _c, autofocus: true, decoration: InputDecoration(labelText: s['text']), onSubmitted: (v) => Navigator.pop(context, v)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(s['cancel'])),
        FilledButton(key: const Key('mm-text-ok'), onPressed: () => Navigator.pop(context, _c.text), child: Text(s['ok'])),
      ],
    );
  }
}
