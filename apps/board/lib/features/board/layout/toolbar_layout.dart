import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../core/board_controller.dart' show ToolbarDock;
import 'board_chrome.dart' show BarItem;

/// Which tools the main toolbar (a panel) and the phone's bar show, in the teacher's order. The
/// board has a catalogue of tools ([BarItem]s by id, board_screen.dart); a layout is a list of
/// those ids. Tools not on the bar stay in More.
abstract final class ToolbarLayouts {
  /// At most this many tools on a panel's toolbar...
  static const panelMax = 12;

  /// ... and on a phone's bar (beside ⋯).
  static const phoneMax = 7;

  static int maxFor({required bool phone}) => phone ? phoneMax : panelMax;

  /// The toolbar as it comes: the pens and the laser, the drawing tools, undo and redo, Tools,
  /// Add and KINETIX AI (the AI pen and the laser are not on the Simple board).
  static List<String> defaults({required bool phone, required bool primary}) => phone
      ? (primary ? ['pen', 'highlighter', 'eraser', 'shapes', 'undo', 'tools', 'ai'] : ['pen', 'ai-pen', 'eraser', 'select', 'undo', 'tools', 'ai'])
      : [
          'pen',
          if (!primary) 'ai-pen',
          if (!primary) 'laser',
          'highlighter',
          'eraser',
          'select',
          'shapes',
          'undo',
          'redo',
          'tools',
          'insert',
          'ai',
        ];

  /// [ids] as a layout: tools this board has, each once, at most [max]; the defaults when
  /// nothing is left.
  static List<String> clean(List<String>? ids, Iterable<String> available, {required int max, required List<String> fallback}) {
    if (ids == null) return fallback;
    final have = available.toSet();
    final out = <String>[];
    for (final id in ids) {
      if (have.contains(id) && !out.contains(id)) out.add(id);
      if (out.length == max) break;
    }
    return out.isEmpty ? fallback : out;
  }

  /// The group a tool sits in on the toolbar; a thin line separates groups.
  static int group(String id) => switch (id) {
    'pen' || 'ai-pen' || 'laser' || 'highlighter' || 'eraser' || 'select' || 'shapes' || 'text' || 'move' => 0,
    'undo' || 'redo' || 'clear' || 'add-page' => 1,
    'ai' => 3,
    _ => 2,
  };
}

/// Where a toolbar let go at [at] on a screen of [size] docks: the left or right quarter docks
/// it at that edge, anywhere between at the bottom.
ToolbarDock toolbarDockAt(Offset at, Size size) {
  if (at.dx < size.width * 0.25) return ToolbarDock.left;
  if (at.dx > size.width * 0.75) return ToolbarDock.right;
  return ToolbarDock.bottom;
}

/// The toolbar editor's words, in English, Hindi and Kannada.
class ToolbarStrings {
  const ToolbarStrings(this.lang);

  final String lang;

  static ToolbarStrings of(BuildContext context) => ToolbarStrings(Localizations.maybeLocaleOf(context)?.languageCode ?? 'en');

  String t(String key) => (_strings[lang] ?? _strings['en']!)[key] ?? _strings['en']![key]!;

  String get title => t('title');
  String hint(int max) => t('hint').replaceAll('{n}', '$max');
  String onBar(int n, int max) => t('onBar').replaceAll('{n}', '$n').replaceAll('{max}', '$max');
  String get moreTools => t('moreTools');
  String get dropHere => t('dropHere');
  String get full => t('full');
  String get reset => t('reset');
  String get done => t('done');
  String get dock => t('dock');
  String get left => t('left');
  String get bottom => t('bottom');
  String get right => t('right');
  String get remove => t('remove');
  String get customise => t('customise');
  String get search => t('search');
  String get record => t('record');

  static const _strings = {
    'en': {
      'title': 'Customise toolbar',
      'hint': 'Drag tools onto the bar, off it and into order. Up to {n} fit on the bar; the rest stay in More.',
      'onBar': 'On the toolbar ({n} of {max})',
      'moreTools': 'In More',
      'dropHere': 'Drop a tool here',
      'full': 'The toolbar is full: take a tool off first.',
      'reset': 'Reset to default',
      'done': 'Done',
      'dock': 'Dock the toolbar',
      'left': 'Left',
      'bottom': 'Bottom',
      'right': 'Right',
      'remove': 'Take off the toolbar',
      'customise': 'Customise toolbar',
      'search': 'Search',
      'record': 'Record',
    },
    'hi': {
      'title': 'टूलबार बदलें',
      'hint': 'टूल को बार पर, बार से बाहर और क्रम में खींचें। बार पर {n} तक आते हैं; बाकी "और" में रहते हैं।',
      'onBar': 'टूलबार पर ({max} में से {n})',
      'moreTools': '"और" में',
      'dropHere': 'टूल यहाँ छोड़ें',
      'full': 'टूलबार भरा है: पहले कोई टूल हटाएँ।',
      'reset': 'डिफ़ॉल्ट पर लौटाएँ',
      'done': 'हो गया',
      'dock': 'टूलबार की जगह',
      'left': 'बाएँ',
      'bottom': 'नीचे',
      'right': 'दाएँ',
      'remove': 'टूलबार से हटाएँ',
      'customise': 'टूलबार बदलें',
      'search': 'खोजें',
      'record': 'रिकॉर्ड',
    },
    'kn': {
      'title': 'ಟೂಲ್‌ಬಾರ್ ಬದಲಿಸಿ',
      'hint': 'ಉಪಕರಣಗಳನ್ನು ಬಾರ್‌ಗೆ, ಬಾರ್‌ನಿಂದ ಹೊರಗೆ ಮತ್ತು ಕ್ರಮದಲ್ಲಿ ಎಳೆಯಿರಿ. ಬಾರ್‌ನಲ್ಲಿ {n} ವರೆಗೆ ಹಿಡಿಯುತ್ತವೆ; ಉಳಿದವು "ಇನ್ನಷ್ಟು" ನಲ್ಲಿ ಇರುತ್ತವೆ.',
      'onBar': 'ಟೂಲ್‌ಬಾರ್‌ನಲ್ಲಿ ({max} ರಲ್ಲಿ {n})',
      'moreTools': '"ಇನ್ನಷ್ಟು" ನಲ್ಲಿ',
      'dropHere': 'ಉಪಕರಣವನ್ನು ಇಲ್ಲಿ ಬಿಡಿ',
      'full': 'ಟೂಲ್‌ಬಾರ್ ತುಂಬಿದೆ: ಮೊದಲು ಒಂದು ಉಪಕರಣ ತೆಗೆಯಿರಿ.',
      'reset': 'ಡೀಫಾಲ್ಟ್‌ಗೆ ಮರಳಿಸಿ',
      'done': 'ಆಯಿತು',
      'dock': 'ಟೂಲ್‌ಬಾರ್ ಸ್ಥಾನ',
      'left': 'ಎಡ',
      'bottom': 'ಕೆಳಗೆ',
      'right': 'ಬಲ',
      'remove': 'ಟೂಲ್‌ಬಾರ್‌ನಿಂದ ತೆಗೆಯಿರಿ',
      'customise': 'ಟೂಲ್‌ಬಾರ್ ಬದಲಿಸಿ',
      'search': 'ಹುಡುಕಿ',
      'record': 'ರೆಕಾರ್ಡ್',
    },
  };
}

/// Edit toolbar: every tool the board has, those on the bar in order (drag to reorder, drag or
/// × to take off) and the rest (drag onto the bar, or +), the dock (a panel's toolbar: left,
/// bottom or right) and Reset to default. Each change is applied (and saved) at once.
class ToolbarEditor extends StatefulWidget {
  const ToolbarEditor({
    super.key,
    required this.catalog,
    required this.ids,
    required this.max,
    required this.defaults,
    required this.onChanged,
    this.dock,
    this.onDock,
  });

  /// Every tool, by id, in the board's order.
  final Map<String, BarItem> catalog;
  final List<String> ids;
  final int max;
  final List<String> defaults;
  final ValueChanged<List<String>> onChanged;

  /// The panel toolbar's dock (null on a phone, whose bar stays at the bottom).
  final ToolbarDock? dock;
  final ValueChanged<ToolbarDock>? onDock;

  @override
  State<ToolbarEditor> createState() => _ToolbarEditorState();
}

class _ToolbarEditorState extends State<ToolbarEditor> {
  late List<String> _ids = List.of(widget.ids);
  late ToolbarDock? _dock = widget.dock;

  /// Shown after a tool would not fit.
  bool _full = false;

  void _set(List<String> ids) {
    setState(() {
      _ids = ids;
      _full = false;
    });
    widget.onChanged(List.unmodifiable(ids));
  }

  void _add(String id, [int? at]) {
    if (_ids.contains(id)) return;
    if (_ids.length >= widget.max) {
      setState(() => _full = true);
      return;
    }
    _set([..._ids]..insert((at ?? _ids.length).clamp(0, _ids.length), id));
  }

  void _remove(String id) {
    // The bar keeps at least one tool.
    if (_ids.length <= 1) return;
    _set([..._ids]..remove(id));
  }

  Widget _chip(BarItem item, {Widget? trailing}) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(item.icon, size: 22, color: item.color),
      const SizedBox(width: Kx.s8),
      Flexible(child: Text(item.label, overflow: TextOverflow.ellipsis)),
      ?trailing,
    ],
  );

  @override
  Widget build(BuildContext context) {
    final s = ToolbarStrings.of(context);
    final c = context.colors;
    final rest = [
      for (final id in widget.catalog.keys)
        if (!_ids.contains(id)) id,
    ];
    final onBar = DragTarget<String>(
      onWillAcceptWithDetails: (d) => !_ids.contains(d.data),
      onAcceptWithDetails: (d) => _add(d.data),
      builder: (context, candidate, _) => Container(
        decoration: BoxDecoration(
          color: candidate.isEmpty ? c.surfaceContainerLow : c.primaryContainer,
          borderRadius: BorderRadius.circular(Kx.rMd),
        ),
        child: ReorderableListView(
          key: const Key('tbar-on-bar'),
          shrinkWrap: true,
          buildDefaultDragHandles: false,
          padding: const EdgeInsets.all(Kx.s4),
          onReorderItem: (from, to) {
            final ids = [..._ids];
            ids.insert(to, ids.removeAt(from));
            _set(ids);
          },
          children: [
            for (final (i, id) in _ids.indexed)
              Material(
                key: ValueKey('tbar-item-$id'),
                color: Colors.transparent,
                child: ListTile(
                  dense: true,
                  minTileHeight: 44,
                  // Drag the tool off the bar (into More), or by its grip into order.
                  title: Draggable<String>(
                    data: id,
                    hitTestBehavior: HitTestBehavior.opaque,
                    feedback: Material(elevation: 4, borderRadius: BorderRadius.circular(Kx.rMd), child: Padding(padding: const EdgeInsets.all(Kx.s8), child: _chip(widget.catalog[id]!))),
                    childWhenDragging: Opacity(opacity: 0.4, child: _chip(widget.catalog[id]!)),
                    child: _chip(widget.catalog[id]!),
                  ),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(key: Key('tbar-remove-$id'), tooltip: s.remove, icon: const Icon(Icons.close), onPressed: _ids.length > 1 ? () => _remove(id) : null),
                      ReorderableDragStartListener(index: i, child: const Padding(padding: EdgeInsets.all(Kx.s8), child: Icon(Icons.drag_indicator))),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
    final more = DragTarget<String>(
      onWillAcceptWithDetails: (d) => _ids.contains(d.data),
      onAcceptWithDetails: (d) => _remove(d.data),
      builder: (context, candidate, _) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(Kx.s8),
        decoration: BoxDecoration(
          color: candidate.isEmpty ? Colors.transparent : c.secondaryContainer,
          border: Border.all(color: c.outlineVariant),
          borderRadius: BorderRadius.circular(Kx.rMd),
        ),
        child: rest.isEmpty
            ? Padding(padding: const EdgeInsets.all(Kx.s8), child: Text(s.dropHere, style: TextStyle(color: c.onSurfaceVariant)))
            : Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                children: [
                  for (final id in rest)
                    Draggable<String>(
                      data: id,
                      hitTestBehavior: HitTestBehavior.opaque,
                      feedback: Material(elevation: 4, borderRadius: BorderRadius.circular(Kx.rMd), child: Padding(padding: const EdgeInsets.all(Kx.s8), child: _chip(widget.catalog[id]!))),
                      child: ActionChip(
                        key: Key('tbar-add-$id'),
                        avatar: Icon(widget.catalog[id]!.icon, size: 18),
                        label: Text(widget.catalog[id]!.label),
                        onPressed: () => _add(id),
                      ),
                    ),
                ],
              ),
      ),
    );
    return AlertDialog(
      key: const Key('toolbar-editor'),
      title: Text(s.title),
      contentPadding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s12, Kx.s24, 0),
      content: Builder(
        builder: (context) {
          final screen = MediaQuery.sizeOf(context);
          // Side by side where there is room (a panel), so a tool drags straight from one to
          // the other; one above the other on a phone (the + and × buttons work there too).
          final wide = screen.width >= 900;
          final barTitle = Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(s.onBar(_ids.length, widget.max), key: const Key('tbar-count'), style: context.text.titleSmall),
              if (_full) Text(s.full, key: const Key('tbar-full'), style: context.text.bodyMedium?.copyWith(color: c.error)),
              const SizedBox(height: Kx.s8),
            ],
          );
          final moreTitle = Padding(padding: const EdgeInsets.only(bottom: Kx.s8), child: Text(s.moreTools, style: context.text.titleSmall));
          final top = <Widget>[
            Text(s.hint(widget.max), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
            if (_dock != null && widget.onDock != null) ...[
              const SizedBox(height: Kx.s12),
              Text(s.dock, style: context.text.titleSmall),
              const SizedBox(height: Kx.s8),
              SegmentedButton<ToolbarDock>(
                key: const Key('tbar-dock'),
                segments: [
                  ButtonSegment(value: ToolbarDock.left, icon: const Icon(Icons.align_horizontal_left), label: Text(s.left, key: const Key('tbar-dock-left'))),
                  ButtonSegment(value: ToolbarDock.bottom, icon: const Icon(Icons.align_vertical_bottom), label: Text(s.bottom, key: const Key('tbar-dock-bottom'))),
                  ButtonSegment(value: ToolbarDock.right, icon: const Icon(Icons.align_horizontal_right), label: Text(s.right, key: const Key('tbar-dock-right'))),
                ],
                selected: {_dock!},
                onSelectionChanged: (v) {
                  setState(() => _dock = v.first);
                  widget.onDock!(v.first);
                },
              ),
            ],
            const SizedBox(height: Kx.s12),
          ];
          if (wide) {
            return SizedBox(
              width: math.min(900, screen.width - 160),
              height: math.min(640, screen.height - 280),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ...top,
                  Expanded(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [barTitle, Flexible(child: onBar)])),
                        const SizedBox(width: Kx.s16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [moreTitle, Flexible(child: SingleChildScrollView(child: more))],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          }
          return SizedBox(
            width: 560,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [...top, barTitle, onBar, const SizedBox(height: Kx.s12), moreTitle, more, const SizedBox(height: Kx.s12)],
              ),
            ),
          );
        },
      ),
      actions: [
        TextButton.icon(key: const Key('tbar-reset'), onPressed: () => _set(List.of(widget.defaults)), icon: const Icon(Icons.restart_alt), label: Text(s.reset)),
        FilledButton(key: const Key('tbar-done'), onPressed: () => Navigator.pop(context), child: Text(s.done)),
      ],
    );
  }
}
