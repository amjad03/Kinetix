import 'dart:ui';

import 'package:flutter/foundation.dart';

import 'ink_models.dart';

/// Holds the strokes on one board page and turns pointer events into ink.
///
/// Every pointer (finger, pen, mouse) is tracked separately by its id, so any number of
/// people can write at the same time. Undo and redo follow the order strokes were finished.
class InkController extends ChangeNotifier {
  InkController({InkStyle? style, this.palmRadius = 28})
      : _style = style ?? const InkStyle(tool: InkTool.pen, color: Color(0xFF1B1B1F), width: 4);

  /// Touches whose contact radius is larger than this (logical px) are treated as a palm and ignored.
  final double palmRadius;

  /// Width of the eraser circle, in logical pixels.
  double eraserRadius = 18;

  InkStyle _style;
  InkStyle get style => _style;
  set style(InkStyle value) {
    _style = value;
    notifyListeners();
  }

  /// Lets multi-user zones give each pointer its own pen. Defaults to [style].
  InkStyle Function(int pointer, Offset position)? styleForPointer;

  final List<Stroke> _strokes = [];
  final Map<int, Stroke> _active = {};
  final Map<int, InkTool> _activeTool = {};
  final List<_Action> _undo = [];
  final List<_Action> _redo = [];
  int _nextId = 0;

  /// Fires only when finished strokes change, so their layer is not repainted on every move.
  final ValueNotifier<int> committed = ValueNotifier(0);

  List<Stroke> get strokes => List.unmodifiable(_strokes);
  Iterable<Stroke> get activeStrokes => _active.values;
  int get activePointerCount => _activeTool.length;
  bool get canUndo => _undo.isNotEmpty;
  bool get canRedo => _redo.isNotEmpty;
  bool get isEmpty => _strokes.isEmpty && _active.isEmpty;

  /// [forceEraser] is for the eraser end of a stylus, which erases whatever tool is selected.
  void pointerDown(int pointer, InkPoint p, {double contactRadius = 0, bool forceEraser = false}) {
    if (contactRadius > palmRadius) return; // palm rejection
    var style = styleForPointer?.call(pointer, p.offset) ?? _style;
    if (forceEraser) style = style.copyWith(tool: InkTool.eraser);
    _activeTool[pointer] = style.tool;
    if (style.tool == InkTool.eraser) {
      _eraseAt(p.offset, pointer);
    } else {
      _active[pointer] = Stroke(id: 's${_nextId++}', style: style, points: [p]);
    }
    notifyListeners();
  }

  void pointerMove(int pointer, InkPoint p) {
    final tool = _activeTool[pointer];
    if (tool == null) return;
    if (tool == InkTool.eraser) {
      _eraseAt(p.offset, pointer);
      notifyListeners();
      return;
    }
    final stroke = _active[pointer]!;
    // Skip points closer than half a pixel: they add cost and no detail.
    if ((stroke.points.last.offset - p.offset).distanceSquared < 0.25) return;
    stroke.points.add(p);
    notifyListeners();
  }

  void pointerUp(int pointer) {
    final tool = _activeTool.remove(pointer);
    if (tool == null) return;
    if (tool == InkTool.eraser) {
      final erased = _pendingErase.remove(pointer);
      if (erased != null && erased.isNotEmpty) _push(_Erase(erased));
    } else {
      final stroke = _active.remove(pointer)!;
      _strokes.add(stroke);
      _push(_Add(stroke));
    }
    committed.value++;
    notifyListeners();
  }

  /// The OS took the pointer away (e.g. a system gesture). Drop the unfinished stroke.
  void pointerCancel(int pointer) {
    final tool = _activeTool.remove(pointer);
    _active.remove(pointer);
    if (tool == InkTool.eraser) {
      // Erasing already happened; keep it undoable.
      final erased = _pendingErase.remove(pointer);
      if (erased != null && erased.isNotEmpty) _push(_Erase(erased));
      committed.value++;
    }
    notifyListeners();
  }

  void undo() {
    if (_undo.isEmpty) return;
    final a = _undo.removeLast();
    a.revert(_strokes);
    _redo.add(a);
    committed.value++;
    notifyListeners();
  }

  void redo() {
    if (_redo.isEmpty) return;
    final a = _redo.removeLast();
    a.apply(_strokes);
    _undo.add(a);
    committed.value++;
    notifyListeners();
  }

  void clear() {
    if (_strokes.isEmpty) return;
    _push(_Clear(List.of(_strokes)));
    _strokes.clear();
    committed.value++;
    notifyListeners();
  }

  final Map<int, List<(int, Stroke)>> _pendingErase = {};

  void _eraseAt(Offset c, int pointer) {
    final removed = _pendingErase.putIfAbsent(pointer, () => []);
    for (var i = _strokes.length - 1; i >= 0; i--) {
      if (_strokes[i].hitBy(c, eraserRadius)) {
        removed.add((i, _strokes.removeAt(i)));
        committed.value++;
      }
    }
  }

  @override
  void dispose() {
    committed.dispose();
    super.dispose();
  }

  void _push(_Action a) {
    _undo.add(a);
    _redo.clear();
  }
}

sealed class _Action {
  void apply(List<Stroke> strokes);
  void revert(List<Stroke> strokes);
}

class _Add extends _Action {
  _Add(this.stroke);
  final Stroke stroke;
  @override
  void apply(List<Stroke> s) => s.add(stroke);
  @override
  void revert(List<Stroke> s) => s.remove(stroke);
}

class _Erase extends _Action {
  /// (index at removal time, stroke), in removal order.
  _Erase(this.removed);
  final List<(int, Stroke)> removed;
  @override
  void apply(List<Stroke> s) {
    for (final (_, stroke) in removed) {
      s.remove(stroke);
    }
  }

  @override
  void revert(List<Stroke> s) {
    for (final (index, stroke) in removed.reversed) {
      s.insert(index.clamp(0, s.length), stroke);
    }
  }
}

class _Clear extends _Action {
  _Clear(this.removed);
  final List<Stroke> removed;
  @override
  void apply(List<Stroke> s) => s.clear();
  @override
  void revert(List<Stroke> s) => s.addAll(removed);
}
