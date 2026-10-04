import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/foundation.dart';

import 'ink_models.dart';

/// Holds the strokes on one board page and turns pointer events into ink.
///
/// Every pointer (finger, pen, mouse) is tracked separately by its id, so any number of
/// people can write at the same time. Undo and redo follow the order actions finished.
class InkController extends ChangeNotifier {
  InkController({InkStyle? style, this.palmRadius = 28, this.palmMode = PalmMode.ignore})
    : _style = style ?? const InkStyle(tool: InkTool.pen, color: Color(0xFF1B1B1F), width: 4);

  /// Contacts with a radius above this (logical px) count as a palm. See [palmMode].
  double palmRadius;
  PalmMode palmMode;

  /// Width of the eraser circle, in logical pixels.
  double eraserRadius = 18;

  InkStyle _style;
  InkStyle get style => _style;
  set style(InkStyle value) {
    if (value.tool != InkTool.select) _selection.clear();
    _style = value;
    notifyListeners();
  }

  /// Measurement labels on shapes.
  bool _showLengths = false, _showAngles = false;
  bool get showLengths => _showLengths;
  bool get showAngles => _showAngles;
  set showLengths(bool v) => _setLabels(() => _showLengths = v);
  set showAngles(bool v) => _setLabels(() => _showAngles = v);
  void _setLabels(VoidCallback f) {
    f();
    committed.value++;
    notifyListeners();
  }

  /// Lets multi-user zones give each pointer its own pen. Defaults to [style].
  InkStyle Function(int pointer, Offset position)? styleForPointer;

  final List<Stroke> _strokes = [];
  final Map<int, Stroke> _active = {};
  final Map<int, InkTool> _activeTool = {};
  final Map<int, Offset> _shapeStart = {};
  final Map<int, double> _eraseRadius = {};
  final Map<int, List<(int, Stroke)>> _pendingErase = {};
  final List<_Action> _undo = [];
  final List<_Action> _redo = [];
  int _nextId = 0;

  // Selection (one selecting pointer at a time).
  final Set<Stroke> _selection = {};
  int? _selectPointer;
  Offset? _marqueeStart, _lastSelectPoint;
  Rect? _marquee;
  Offset _moved = Offset.zero;

  /// Fires only when finished strokes change, so their layer is not repainted on every move.
  final ValueNotifier<int> committed = ValueNotifier(0);

  List<Stroke> get strokes => List.unmodifiable(_strokes);
  Iterable<Stroke> get activeStrokes => _active.values;
  int get activePointerCount => _activeTool.length;
  bool get canUndo => _undo.isNotEmpty;
  bool get canRedo => _redo.isNotEmpty;
  bool get isEmpty => _strokes.isEmpty && _active.isEmpty;
  Set<Stroke> get selection => Set.unmodifiable(_selection);
  Rect? get marquee => _marquee;

  /// The box drawn around the selection, wide enough to clear any measurement labels.
  Rect? get selectionBounds {
    if (_selection.isEmpty) return null;
    final labels = (_showLengths || _showAngles) && _selection.any((s) => s.shape != null);
    return _selection.map((s) => s.bounds).reduce((a, b) => a.expandToInclude(b)).inflate(labels ? 26 : 0);
  }

  /// [forceEraser] is for the eraser end of a stylus, which erases whatever tool is selected.
  void pointerDown(int pointer, InkPoint p, {double contactRadius = 0, bool forceEraser = false}) {
    var style = styleForPointer?.call(pointer, p.offset) ?? _style;
    final palm = palmMode != PalmMode.off && contactRadius > palmRadius;
    if (palm && palmMode == PalmMode.ignore) return;
    if (forceEraser || palm) style = style.copyWith(tool: InkTool.eraser);
    _activeTool[pointer] = style.tool;

    switch (style.tool) {
      case InkTool.eraser:
        // A palm erases a wide band, like a duster.
        _eraseRadius[pointer] = palm ? math.max(eraserRadius, contactRadius * 1.5) : eraserRadius;
        _eraseAt(p.offset, pointer);
      case InkTool.shape:
        _shapeStart[pointer] = p.offset;
        _active[pointer] = Stroke(
          id: 's${_nextId++}',
          style: style,
          shape: style.shape,
          points: shapePoints(style.shape, p.offset, p.offset),
        );
      case InkTool.select:
        if (_selectPointer != null) {
          _activeTool.remove(pointer); // one selection gesture at a time
          return;
        }
        _selectPointer = pointer;
        _lastSelectPoint = p.offset;
        _moved = Offset.zero;
        final bounds = selectionBounds;
        if (bounds == null || !bounds.inflate(16).contains(p.offset)) {
          _selection.clear();
          _marqueeStart = p.offset;
          _marquee = Rect.fromPoints(p.offset, p.offset);
        }
      case InkTool.pen:
      case InkTool.highlighter:
        _active[pointer] = Stroke(id: 's${_nextId++}', style: style, points: [p]);
    }
    notifyListeners();
  }

  void pointerMove(int pointer, InkPoint p) {
    final tool = _activeTool[pointer];
    if (tool == null) return;
    switch (tool) {
      case InkTool.eraser:
        _eraseAt(p.offset, pointer);
      case InkTool.shape:
        final s = _active[pointer]!;
        s.points
          ..clear()
          ..addAll(shapePoints(s.shape!, _shapeStart[pointer]!, p.offset));
      case InkTool.select:
        if (_marqueeStart != null) {
          _marquee = Rect.fromPoints(_marqueeStart!, p.offset);
        } else {
          final d = p.offset - _lastSelectPoint!;
          for (final s in _selection) {
            s.translate(d);
          }
          _moved += d;
          committed.value++;
        }
        _lastSelectPoint = p.offset;
      case InkTool.pen:
      case InkTool.highlighter:
        final stroke = _active[pointer]!;
        // Skip points closer than half a pixel: they add cost and no detail.
        if ((stroke.points.last.offset - p.offset).distanceSquared < 0.25) return;
        stroke.points.add(p);
    }
    notifyListeners();
  }

  void pointerUp(int pointer) {
    final tool = _activeTool.remove(pointer);
    if (tool == null) return;
    switch (tool) {
      case InkTool.eraser:
        _finishErase(pointer);
      case InkTool.shape:
        final s = _active.remove(pointer)!;
        _shapeStart.remove(pointer);
        // A tap without a drag would leave an invisible dot.
        if (s.bounds.width > 6 || s.bounds.height > 6) {
          _strokes.add(s);
          _push(_Add(s));
        }
      case InkTool.select:
        if (_marqueeStart != null) {
          final m = _marquee!;
          _selection
            ..clear()
            ..addAll(_strokes.where((s) => m.overlaps(s.bounds)));
        } else if (_moved != Offset.zero) {
          _push(_Move(Set.of(_selection), _moved));
        }
        _selectPointer = null;
        _marqueeStart = null;
        _marquee = null;
      case InkTool.pen:
      case InkTool.highlighter:
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
    _shapeStart.remove(pointer);
    if (tool == InkTool.eraser) {
      // Erasing already happened; keep it undoable.
      _finishErase(pointer);
      committed.value++;
    }
    if (tool == InkTool.select) {
      if (_moved != Offset.zero) _push(_Move(Set.of(_selection), _moved));
      _selectPointer = null;
      _marqueeStart = null;
      _marquee = null;
    }
    notifyListeners();
  }

  /// Replaces the page with saved strokes (opening a saved board). Clears undo history.
  void replaceStrokes(List<Stroke> strokes) {
    _strokes
      ..clear()
      ..addAll(strokes);
    _active.clear();
    _activeTool.clear();
    _selection.clear();
    _undo.clear();
    _redo.clear();
    committed.value++;
    notifyListeners();
  }

  void deleteSelection() {
    if (_selection.isEmpty) return;
    final removed = <(int, Stroke)>[];
    for (var i = _strokes.length - 1; i >= 0; i--) {
      if (_selection.contains(_strokes[i])) removed.add((i, _strokes.removeAt(i)));
    }
    _push(_Erase(removed));
    _selection.clear();
    committed.value++;
    notifyListeners();
  }

  void undo() {
    if (_undo.isEmpty) return;
    final a = _undo.removeLast();
    a.revert(_strokes);
    _redo.add(a);
    _selection.clear();
    committed.value++;
    notifyListeners();
  }

  void redo() {
    if (_redo.isEmpty) return;
    final a = _redo.removeLast();
    a.apply(_strokes);
    _undo.add(a);
    _selection.clear();
    committed.value++;
    notifyListeners();
  }

  void clear() {
    if (_strokes.isEmpty) return;
    _push(_Clear(List.of(_strokes)));
    _strokes.clear();
    _selection.clear();
    committed.value++;
    notifyListeners();
  }

  void _eraseAt(Offset c, int pointer) {
    final removed = _pendingErase.putIfAbsent(pointer, () => []);
    final r = _eraseRadius[pointer] ?? eraserRadius;
    for (var i = _strokes.length - 1; i >= 0; i--) {
      if (_strokes[i].hitBy(c, r)) {
        _selection.remove(_strokes[i]);
        removed.add((i, _strokes.removeAt(i)));
        committed.value++;
      }
    }
  }

  void _finishErase(int pointer) {
    _eraseRadius.remove(pointer);
    final erased = _pendingErase.remove(pointer);
    if (erased != null && erased.isNotEmpty) _push(_Erase(erased));
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

/// Strokes moved with the select tool. The move has already happened when this is recorded.
class _Move extends _Action {
  _Move(this.strokes, this.delta);
  final Set<Stroke> strokes;
  final Offset delta;
  @override
  void apply(List<Stroke> _) {
    for (final s in strokes) {
      s.translate(delta);
    }
  }

  @override
  void revert(List<Stroke> _) {
    for (final s in strokes) {
      s.translate(-delta);
    }
  }
}

/// The pages of one board. Tool settings carry over when the teacher turns the page.
class BoardPages extends ChangeNotifier {
  BoardPages({PalmMode palmMode = PalmMode.ignore}) : _palmMode = palmMode {
    _pages.add(InkController(palmMode: palmMode));
  }

  final List<InkController> _pages = [];
  int _index = 0;
  PalmMode _palmMode;

  InkController get current => _pages[_index];
  int get index => _index;
  int get count => _pages.length;
  bool get hasPrevious => _index > 0;
  bool get hasNext => _index < _pages.length - 1;

  PalmMode get palmMode => _palmMode;
  set palmMode(PalmMode m) {
    _palmMode = m;
    for (final p in _pages) {
      p.palmMode = m;
    }
    notifyListeners();
  }

  /// The pages' controllers, in order (for the lesson recorder).
  List<InkController> get controllers => List.unmodifiable(_pages);

  /// Every page's finished strokes, for saving.
  List<List<Stroke>> get allStrokes => [for (final p in _pages) p.strokes];

  /// True when no page has any ink.
  bool get isBlank => _pages.every((p) => p.strokes.isEmpty);

  /// Replaces all pages with a saved board's pages and opens the first one.
  void load(List<List<Stroke>> pages) {
    final style = current.style.copyWith(tool: current.style.tool == InkTool.select ? InkTool.pen : null);
    for (final p in _pages) {
      p.dispose();
    }
    _pages
      ..clear()
      ..addAll([
        for (final strokes in pages.isEmpty ? [<Stroke>[]] : pages)
          InkController(style: style, palmMode: _palmMode)..replaceStrokes(strokes),
      ]);
    _index = 0;
    notifyListeners();
  }

  void previous() => _go(_index - 1);
  void next() => _go(_index + 1);

  /// Adds a blank page after the current one and opens it.
  void addPage() {
    final old = current;
    _pages.insert(
      _index + 1,
      InkController(
          style: old.style.copyWith(tool: old.style.tool == InkTool.select ? InkTool.pen : null),
          palmMode: _palmMode,
        )
        ..showLengths = old.showLengths
        ..showAngles = old.showAngles,
    );
    _index++;
    notifyListeners();
  }

  void _go(int i) {
    if (i < 0 || i >= _pages.length || i == _index) return;
    final style = current.style;
    _index = i;
    current.style = style;
    notifyListeners();
  }

  @override
  void dispose() {
    for (final p in _pages) {
      p.dispose();
    }
    super.dispose();
  }
}
