import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/gestures.dart' show DragStartBehavior, PointerScrollEvent;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show HardwareKeyboard, KeyDownEvent, LogicalKeyboardKey;
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/feature_strings.dart';
import '../insert/device_files.dart';
import 'mind_map.dart';
import 'mind_map_paint.dart';
import 'mind_map_strings.dart';

export 'mind_map_strings.dart';

FeatureStrings mindMapStrings(BuildContext context) => FeatureStrings(boardLang(context), mindMapStringTable);

/// Asks the teacher for a picture (null when they cancel).
typedef MindPicturePicker = Future<Uint8List?> Function();

Future<Uint8List?> _devicePicture() async => (await PlatformFiles().pickPicture())?.bytes;

/// The mind map tool: a radial map of ideas that is laid out again after every edit, in a colour
/// per branch (or per idea), with shapes, icons and pictures; folds, grows by keyboard or button,
/// re-parents by dragging one idea onto another, zooms and pans, and undoes. "Put on board" writes
/// it as editable blocks and curved branches, or as a picture.
class MindMapEditor extends StatefulWidget {
  const MindMapEditor({super.key, required this.wb, this.initial, this.pickPicture});

  final WhiteboardController wb;
  final MindMap? initial;

  /// How a picture is chosen (the device's file dialog unless a test supplies one).
  final MindPicturePicker? pickPicture;

  /// Opens the editor over the board.
  static Future<void> open(BuildContext context, WhiteboardController wb) =>
      showDialog<void>(context: context, barrierDismissible: false, useSafeArea: false, builder: (_) => Dialog.fullscreen(child: MindMapEditor(wb: wb)));

  @override
  State<MindMapEditor> createState() => _MindMapEditorState();
}

class _MindMapEditorState extends State<MindMapEditor> {
  MindMap? _map;
  String _selected = 'n0';
  final _undo = <MindMap>[];
  var _zoom = 1.0;
  var _pan = Offset.zero;
  var _fit = true, _checkFit = false;
  var _rev = 0;
  Map<String, Offset>? _layout;
  int _layoutRev = -1;
  String? _dragId;
  var _dragDelta = Offset.zero;
  final _images = <String, ui.Image>{};
  final _imageSource = <String, Uint8List>{};

  MindMap get map => _map!;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _map ??= widget.initial ?? MindMap(mindMapStrings(context)['topic']);
  }

  /// Runs an edit that can be undone; the map is laid out again afterwards.
  void _edit(void Function() f) {
    _undo.add(map.clone());
    if (_undo.length > 80) _undo.removeAt(0);
    setState(() {
      f();
      _rev++;
      _checkFit = true;
    });
  }

  @visibleForTesting
  void undo() {
    if (_undo.isEmpty) return;
    setState(() {
      _map = _undo.removeLast();
      if (map.find(_selected) == null) _selected = map.root.id;
      _rev++;
      _checkFit = true;
    });
  }

  Map<String, Offset> get _base {
    if (_layoutRev != _rev || _layout == null) {
      _layout = map.layout();
      _layoutRev = _rev;
    }
    return _layout!;
  }

  void _addChild() {
    final text = mindMapStrings(context)['idea'];
    _edit(() => _selected = map.addChild(_selected, text)!.id);
  }

  void _addSibling() {
    final text = mindMapStrings(context)['idea'];
    _edit(() => _selected = map.addSibling(_selected, text)!.id);
  }

  void _delete() {
    if (_selected == map.root.id) return;
    _edit(() {
      final p = map.parentOf(_selected)?.id ?? map.root.id;
      map.remove(_selected);
      _selected = p;
    });
  }

  void _toggle(String id) => _edit(() => map.toggle(id));

  Future<void> _rename(MindNode n) async {
    final text = await showDialog<String>(context: context, builder: (_) => _RenameDialog(initial: n.text));
    if (text != null && text.trim().isNotEmpty && mounted) _edit(() => n.text = text.trim());
  }

  Future<void> _pickColor(MindNode n) async {
    final r = await showDialog<(Color?, bool)>(context: context, builder: (_) => _ColorDialog(map: map, node: n));
    if (r != null && mounted) _edit(() => map.setColor(n.id, r.$1, branch: r.$2));
  }

  Future<void> _choose(String title, List<Widget> Function(void Function(Object?) pick) items) async {
    final s = mindMapStrings(context);
    await showDialog<void>(
      context: context,
      builder: (dc) => AlertDialog(
        title: Text(title),
        content: SingleChildScrollView(child: Wrap(spacing: 8, runSpacing: 8, children: items((v) => Navigator.pop(dc, v)))),
        actions: [TextButton(onPressed: () => Navigator.pop(dc), child: Text(s['cancel']))],
      ),
    );
  }

  Future<void> _shape(MindNode n) async {
    final s = mindMapStrings(context);
    MindShape? chosen;
    await _choose(s['shape'], (pick) => [
      for (final sh in MindShape.values)
        ChoiceChip(key: Key('mm-shape-${sh.name}'), label: Text(s['shape_${sh.name}']), selected: n.shape == sh, onSelected: (_) {
          chosen = sh;
          pick(sh);
        }),
    ]);
    if (chosen != null && mounted) _edit(() => n.shape = chosen!);
  }

  Future<void> _icon(MindNode n) async {
    final s = mindMapStrings(context);
    var done = false;
    int? chosen;
    await _choose(s['icon'], (pick) => [
      ActionChip(key: const Key('mm-icon-none'), label: Text(s['iconNone']), onPressed: () {
        done = true;
        pick(null);
      }),
      for (final (i, ic) in mindIcons.indexed)
        IconButton.outlined(key: Key('mm-icon-$i'), icon: Icon(ic), onPressed: () {
          done = true;
          chosen = i;
          pick(i);
        }),
    ]);
    if (done && mounted) _edit(() => n.icon = chosen);
  }

  Future<void> _themeDialog() async {
    final s = mindMapStrings(context);
    int? chosen;
    await _choose(s['theme'], (pick) => [
      for (final (i, t) in mindThemes.indexed)
        InkWell(
          key: Key('mm-theme-${t.key}'),
          onTap: () {
            chosen = i;
            pick(i);
          },
          child: Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(border: Border.all(color: i == map.themeIndex ? Colors.black : Colors.black26, width: i == map.themeIndex ? 3 : 1), borderRadius: BorderRadius.circular(10)),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Row(mainAxisSize: MainAxisSize.min, children: [for (final c in [t.root, ...t.branches.take(4)]) Container(width: 16, height: 16, margin: const EdgeInsets.all(1), color: c)]),
              const SizedBox(height: 4),
              Text(s['theme_${t.key}']),
            ]),
          ),
        ),
    ]);
    if (chosen != null && mounted) _edit(() => map.themeIndex = chosen!);
  }

  Future<void> _pickImage(MindNode n) async {
    final bytes = await (widget.pickPicture ?? _devicePicture)();
    if (bytes != null && mounted) _edit(() => n.image = bytes);
  }

  /// Decodes pictures that are new so they can be painted.
  void _syncImages() {
    for (final n in map.visible) {
      final b = n.image;
      if (b == null) {
        _images.remove(n.id)?.dispose();
        _imageSource.remove(n.id);
      } else if (!identical(_imageSource[n.id], b)) {
        _imageSource[n.id] = b;
        unawaited(() async {
          try {
            final codec = await ui.instantiateImageCodec(b, targetWidth: 160);
            final img = (await codec.getNextFrame()).image;
            if (!mounted || !identical(_imageSource[n.id], b)) return;
            setState(() => _images[n.id] = img);
          } catch (_) {
            // A broken picture just shows as a tinted square.
          }
        }());
      }
    }
  }

  void _place() {
    widget.wb.insert(map.toElements());
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(mindMapStrings(context)['placed'])));
    Navigator.pop(context);
  }

  Future<void> _placePicture() async {
    final msg = mindMapStrings(context)['placed'];
    final nav = Navigator.of(context);
    final messenger = ScaffoldMessenger.maybeOf(context);
    final png = await mindMapPng(map, images: _images);
    final at = map.layout();
    final b = map.boundsOf(at).inflate(40);
    widget.wb.insert([ImageElement(id: newElementId(), rect: b, bytes: png)]);
    messenger?.showSnackBar(SnackBar(content: Text(msg)));
    nav.pop();
  }

  void _zoomBy(double f) => setState(() => _zoom = (_zoom * f).clamp(0.25, 3.0));

  KeyEventResult _key(FocusNode _, KeyEvent e) {
    if (e is! KeyDownEvent) return KeyEventResult.ignored;
    final k = e.logicalKey;
    final sel = map.find(_selected) ?? map.root;
    final cmd = HardwareKeyboard.instance.isControlPressed || HardwareKeyboard.instance.isMetaPressed;
    if (cmd && k == LogicalKeyboardKey.keyZ) {
      undo();
    } else if (k == LogicalKeyboardKey.tab) {
      _addChild();
    } else if (k == LogicalKeyboardKey.enter || k == LogicalKeyboardKey.numpadEnter) {
      _addSibling();
    } else if (k == LogicalKeyboardKey.delete || k == LogicalKeyboardKey.backspace) {
      _delete();
    } else if (k == LogicalKeyboardKey.f2) {
      unawaited(_rename(sel));
    } else if (k == LogicalKeyboardKey.space) {
      if (sel.children.isNotEmpty) _toggle(sel.id);
    } else if (k == LogicalKeyboardKey.arrowLeft) {
      final p = map.parentOf(sel.id);
      if (p != null) setState(() => _selected = p.id);
    } else if (k == LogicalKeyboardKey.arrowRight) {
      if (sel.children.isNotEmpty && !sel.collapsed) setState(() => _selected = sel.children.first.id);
    } else if (k == LogicalKeyboardKey.arrowUp || k == LogicalKeyboardKey.arrowDown) {
      final sibs = map.parentOf(sel.id)?.children;
      if (sibs != null) {
        final i = sibs.indexOf(sel) + (k == LogicalKeyboardKey.arrowDown ? 1 : -1);
        if (i >= 0 && i < sibs.length) setState(() => _selected = sibs[i].id);
      }
    } else {
      return KeyEventResult.ignored;
    }
    return KeyEventResult.handled;
  }

  /// The idea (not [id] or under it) whose box holds the map point [p].
  MindNode? _dropTarget(String id, Offset p, Map<String, Offset> at) {
    for (final n in map.visible) {
      if (n.id == id || map.isInside(n.id, id)) continue;
      if (map.rectOf(n, at[n.id]!).contains(p)) return n;
    }
    return null;
  }

  @override
  void dispose() {
    for (final i in _images.values) {
      i.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = mindMapStrings(context);
    final sel = map.find(_selected) ?? map.root;
    _syncImages();
    return Focus(
      autofocus: true,
      onKeyEvent: _key,
      child: Scaffold(
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
            // Every action in sight where there is room; a phone (upright or on its side) scrolls
            // the row sideways so the map keeps its height.
            LayoutBuilder(
              builder: (context, box) {
                final actions = <Widget>[
                  _action(const Key('mm-undo'), Icons.undo, s['undo'], _undo.isEmpty ? null : undo),
                  _action(const Key('mm-add-child'), Icons.subdirectory_arrow_right, s['addChild'], _addChild),
                  _action(const Key('mm-add-sibling'), Icons.add_circle_outline, s['addSibling'], _addSibling),
                  _action(const Key('mm-edit'), Icons.edit_outlined, s['edit'], () => _rename(sel)),
                  _action(const Key('mm-collapse'), sel.collapsed ? Icons.unfold_more : Icons.unfold_less, sel.collapsed ? s['expand'] : s['collapse'], sel.children.isNotEmpty ? () => _toggle(sel.id) : null),
                  _action(const Key('mm-delete'), Icons.delete_outline, s['delete'], sel == map.root ? null : _delete),
                  _action(const Key('mm-color'), Icons.palette_outlined, s['color'], () => _pickColor(sel)),
                  _action(const Key('mm-shape'), Icons.category_outlined, s['shape'], () => _shape(sel)),
                  _action(const Key('mm-icon'), Icons.emoji_objects_outlined, s['icon'], () => _icon(sel)),
                  _action(const Key('mm-image'), Icons.image_outlined, s['image'], () => _pickImage(sel)),
                  if (sel.image != null) _action(const Key('mm-image-remove'), Icons.hide_image_outlined, s['imageRemove'], () => _edit(() => sel.image = null)),
                  _action(const Key('mm-theme'), Icons.color_lens_outlined, s['theme'], _themeDialog),
                  _action(const Key('mm-zoom-out'), Icons.zoom_out, s['zoomOut'], () => _zoomBy(1 / 1.25)),
                  _action(const Key('mm-zoom-in'), Icons.zoom_in, s['zoomIn'], () => _zoomBy(1.25)),
                  _action(const Key('mm-auto'), Icons.fit_screen_outlined, s['autoLayout'], () => setState(() => _fit = true)),
                  _action(const Key('mm-place-picture'), Icons.photo_outlined, s['placePicture'], _placePicture),
                ];
                return box.maxWidth >= 600 && MediaQuery.sizeOf(context).height >= 600
                    ? Padding(padding: const EdgeInsets.all(Kx.s8), child: Wrap(runSpacing: Kx.s8, children: actions))
                    : SingleChildScrollView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.all(Kx.s8), child: Row(children: actions));
              },
            ),
            Padding(padding: const EdgeInsets.symmetric(horizontal: Kx.s12), child: Align(alignment: Alignment.centerLeft, child: Text(s['hint'], style: context.text.bodySmall))),
            const Divider(height: 1),
            Expanded(child: LayoutBuilder(builder: (context, box) => _canvas(context, box))),
          ],
        ),
      ),
    );
  }

  Widget _canvas(BuildContext context, BoxConstraints box) {
    final base = _base;
    final bounds = map.boundsOf(base);
    final size = Size(box.maxWidth, box.maxHeight);
    if (_fit) {
      _zoom = math.min(size.width / (bounds.width + 100), size.height / (bounds.height + 100)).clamp(0.25, 1.4);
      _pan = -bounds.center * _zoom;
      _fit = false;
      _checkFit = false;
    } else if (_checkFit) {
      _checkFit = false;
      final view = Rect.fromLTWH(0, 0, size.width, size.height);
      final o = Offset(size.width / 2, size.height / 2) + _pan;
      final screen = Rect.fromLTRB(o.dx + bounds.left * _zoom, o.dy + bounds.top * _zoom, o.dx + bounds.right * _zoom, o.dy + bounds.bottom * _zoom);
      if (!view.contains(screen.topLeft) || !view.contains(screen.bottomRight)) {
        _zoom = math.min(_zoom, math.min(size.width / (bounds.width + 100), size.height / (bounds.height + 100))).clamp(0.25, 1.4);
        _pan = -bounds.center * _zoom;
      }
    }
    final origin = Offset(size.width / 2, size.height / 2) + _pan;
    final id = _dragId;
    final at = {...base};
    String? dropOn;
    if (id != null) {
      void move(MindNode n) {
        at[n.id] = base[n.id]! + _dragDelta;
        if (!n.collapsed) n.children.forEach(move);
      }

      move(map.find(id)!);
      dropOn = _dropTarget(id, at[id]!, base)?.id;
    }
    Offset screen(Offset p) => origin + p * _zoom;
    Rect screenRect(Rect r) => Rect.fromPoints(screen(r.topLeft), screen(r.bottomRight));
    return Listener(
      onPointerSignal: (e) {
        if (e is PointerScrollEvent) _zoomBy(e.scrollDelta.dy < 0 ? 1.1 : 1 / 1.1);
      },
      child: GestureDetector(
        key: const Key('mm-canvas'),
        behavior: HitTestBehavior.opaque,
        onTap: () => setState(() => _selected = map.root.id),
        onScaleStart: (_) => _baseZoom = _zoom,
        onScaleUpdate: (d) => setState(() {
          _pan += d.focalPointDelta;
          if (d.scale != 1) _zoom = (_baseZoom * d.scale).clamp(0.25, 3.0);
        }),
        child: ClipRect(
          child: Stack(
            children: [
              Positioned.fill(child: CustomPaint(painter: MindMapPainter(map, at, origin, _zoom, selected: _selected, dropOn: dropOn, dragging: id, images: _images, revision: _rev))),
              for (final n in map.visible)
                Positioned.fromRect(
                  key: ValueKey('mm-pos-${n.id}'),
                  rect: screenRect(map.rectOf(n, at[n.id]!)),
                  child: Semantics(
                    label: n.text,
                    button: true,
                    selected: n.id == _selected,
                    child: GestureDetector(
                      key: Key('mm-node-${n.id}'),
                      behavior: HitTestBehavior.opaque,
                      onTap: () => setState(() => _selected = n.id),
                      onDoubleTap: () => _rename(n),
                      onLongPress: () => _rename(n),
                      dragStartBehavior: DragStartBehavior.down,
                      onPanStart: n == map.root ? null : (_) => setState(() {
                        _dragId = n.id;
                        _dragDelta = Offset.zero;
                        _selected = n.id;
                      }),
                      onPanUpdate: n == map.root ? null : (d) => setState(() => _dragDelta += d.delta / _zoom),
                      onPanEnd: n == map.root ? null : (_) => _endDrag(n, base),
                      onPanCancel: () => setState(() => _dragId = null),
                      child: const SizedBox.expand(),
                    ),
                  ),
                ),
              for (final n in map.visible)
                if (n.children.isNotEmpty)
                  Positioned.fromRect(
                    key: ValueKey('mm-fold-${n.id}'),
                    rect: Rect.fromCenter(center: screen(foldBadgeCentre(map.rectOf(n, at[n.id]!))), width: 30, height: 30),
                    child: Semantics(
                      label: mindMapStrings(context)[n.collapsed ? 'expand' : 'collapse'],
                      button: true,
                      child: GestureDetector(key: Key('mm-toggle-${n.id}'), behavior: HitTestBehavior.opaque, onTap: () => _toggle(n.id), child: const SizedBox.expand()),
                    ),
                  ),
            ],
          ),
        ),
      ),
    );
  }

  var _baseZoom = 1.0;

  void _endDrag(MindNode n, Map<String, Offset> base) {
    final target = _dropTarget(n.id, base[n.id]! + _dragDelta, base);
    setState(() => _dragId = null);
    if (target != null && map.canReparent(n.id, target.id)) _edit(() => map.reparent(n.id, target.id));
  }

  Widget _action(Key key, IconData icon, String label, VoidCallback? onTap) => Padding(
    padding: const EdgeInsets.only(right: Kx.s8),
    child: OutlinedButton.icon(key: key, onPressed: onTap, icon: Icon(icon, size: 18), label: Text(label)),
  );
}

/// Pick a colour for an idea or its whole branch.
class _ColorDialog extends StatefulWidget {
  const _ColorDialog({required this.map, required this.node});
  final MindMap map;
  final MindNode node;

  @override
  State<_ColorDialog> createState() => _ColorDialogState();
}

class _ColorDialogState extends State<_ColorDialog> {
  var _branch = false;

  @override
  Widget build(BuildContext context) {
    final s = mindMapStrings(context);
    final colors = [widget.map.theme.root, ...widget.map.theme.branches, ...mindExtraColors];
    final current = widget.map.colorOf(widget.node.id);
    return AlertDialog(
      title: Text(s['color']),
      content: SizedBox(
        width: 360,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SegmentedButton<bool>(
                key: const Key('mm-color-scope'),
                segments: [
                  ButtonSegment(value: false, label: Text(s['colorNode'], key: const Key('mm-color-scope-node'))),
                  ButtonSegment(value: true, label: Text(s['colorBranch'], key: const Key('mm-color-scope-branch'))),
                ],
                selected: {_branch},
                onSelectionChanged: (v) => setState(() => _branch = v.first),
              ),
              const SizedBox(height: Kx.s12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final (i, c) in colors.indexed)
                    InkWell(
                      key: Key('mm-color-$i'),
                      customBorder: const CircleBorder(),
                      onTap: () => Navigator.pop(context, (c, _branch)),
                      child: Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(color: c, shape: BoxShape.circle, border: Border.all(color: c == current ? Colors.black : Colors.black26, width: c == current ? 3 : 1)),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(key: const Key('mm-color-reset'), onPressed: () => Navigator.pop(context, (null, _branch)), child: Text(s['colorReset'])),
        TextButton(onPressed: () => Navigator.pop(context), child: Text(s['cancel'])),
      ],
    );
  }
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
      content: TextField(key: const Key('mm-text-field'), controller: _c, autofocus: true, minLines: 1, maxLines: 4, decoration: InputDecoration(labelText: s['text'])),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(s['cancel'])),
        FilledButton(key: const Key('mm-text-ok'), onPressed: () => Navigator.pop(context, _c.text), child: Text(s['ok'])),
      ],
    );
  }
}
