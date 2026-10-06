import 'dart:async';
import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart' show EdgeInsets;

import 'board_background.dart';
import 'flow_chart.dart' show absorbTextIntoFlow;
import 'ink_models.dart';
import 'serialization.dart';
import 'tools/geo_tool.dart';
import 'view.dart';

/// Evens out [points] in place: each inner point moves towards the average of its
/// neighbours, [amount] (0..1) sets how far around it looks. The ends stay where they are.
void smoothStroke(List<InkPoint> points, double amount) {
  final k = (amount.clamp(0.0, 1.0) * 4).round();
  if (k == 0 || points.length < 3) return;
  final src = List.of(points);
  for (var i = 1; i < src.length - 1; i++) {
    var x = 0.0, y = 0.0, p = 0.0, n = 0;
    for (var j = math.max(0, i - k); j <= math.min(src.length - 1, i + k); j++) {
      x += src[j].x;
      y += src[j].y;
      p += src[j].pressure;
      n++;
    }
    points[i] = InkPoint(x / n, y / n, p / n);
  }
}

/// What a pointer does on the board.
enum BoardTool {
  /// Tap to pick, drag a loop to pick several, drag the picked things to move them.
  select,

  /// Drag to move around the board.
  hand,
  pen,
  highlighter,
  eraser,
  shape,
  text,
  math,
  note,

  /// Points without drawing: a red trail that fades.
  laser,

  /// Press at the centre, drag out the radius: a circle.
  compass,

  /// The AI pen: writes like the pen, then rough shapes become clean ones and handwriting
  /// becomes text or typeset maths (see AiPenController).
  aiPen,
}

extension BoardToolDraws on BoardTool {
  /// Tools that put ink down where the pointer goes.
  bool get draws => this == BoardTool.pen || this == BoardTool.highlighter || this == BoardTool.shape || this == BoardTool.compass || this == BoardTool.aiPen;
}

/// The handles around a selection: four corners and four sides resize, the knob above turns.
enum SelectionHandle { topLeft, top, topRight, right, bottomRight, bottom, bottomLeft, left, rotate }

/// One page of the board: its elements (bottom first), its groups and the view the teacher
/// left it at.
class WhiteboardPage {
  WhiteboardPage({String? id, List<BoardElement>? elements, Map<String, String>? groups, this.background = BoardBackground.plain})
    : id = id ?? 'p${newElementId()}',
      elements = elements ?? [],
      groups = groups ?? {};

  final String id;
  List<BoardElement> elements;

  /// This page's paper (each page keeps its own: graph paper on one, a map on the next).
  BoardBackground background;

  /// Element id → group id. Elements in a group select and move together (everything one AI
  /// answer wrote, a diagram with its labels).
  Map<String, String> groups;

  /// The view the teacher chose on this page, or null to start from the top left.
  ViewState? view;

  /// All ids sharing a group with any of [ids].
  Set<String> expandGroups(Set<String> ids) {
    final gs = {
      for (final i in ids)
        if (groups[i] != null) groups[i]!,
    };
    if (gs.isEmpty) return ids;
    return {
      ...ids,
      for (final e in groups.entries)
        if (gs.contains(e.value)) e.key,
    };
  }

  /// Groups as lists of element positions, for saving.
  List<List<int>> get groupIndexes {
    final byGroup = <String, List<int>>{};
    for (var i = 0; i < elements.length; i++) {
      final g = groups[elements[i].id];
      if (g != null) byGroup.putIfAbsent(g, () => []).add(i);
    }
    return byGroup.values.where((g) => g.length > 1).toList();
  }
}

/// The on-screen ruler, in board units. Pen lines started on its edge run straight along it.
@immutable
class RulerState {
  const RulerState({this.visible = false, this.center = const Offset(400, 300), this.angle = 0, this.length = 720});

  final bool visible;
  final Offset center;
  final double angle;
  final double length;
  static const thickness = 64.0;

  RulerState copyWith({bool? visible, Offset? center, double? angle}) =>
      RulerState(visible: visible ?? this.visible, center: center ?? this.center, angle: angle ?? this.angle, length: length);

  Offset get direction => Offset(math.cos(angle), math.sin(angle));
  Offset get normal => Offset(-math.sin(angle), math.cos(angle));

  /// The two drawing edges, as (start, end).
  List<(Offset, Offset)> get edges => [
    for (final side in [-1.0, 1.0])
      (center + normal * (side * thickness / 2) - direction * (length / 2), center + normal * (side * thickness / 2) + direction * (length / 2)),
  ];

  bool contains(Offset p) {
    final d = p - center;
    final along = d.dx * direction.dx + d.dy * direction.dy;
    final across = d.dx * normal.dx + d.dy * normal.dy;
    return along.abs() <= length / 2 && across.abs() <= thickness / 2;
  }

  /// The edge a line starting at [p] should follow, if it starts within [tolerance] of one.
  (Offset, Offset)? snapEdge(Offset p, double tolerance) {
    for (final e in edges) {
      final ab = e.$2 - e.$1;
      final t = ((p - e.$1).dx * ab.dx + (p - e.$1).dy * ab.dy) / ab.distanceSquared;
      if (t < -0.02 || t > 1.02) continue;
      if (distanceToSegment(p, e.$1, e.$2) <= tolerance) return e;
    }
    return null;
  }

  /// [p] moved onto [edge].
  static Offset project(Offset p, (Offset, Offset) edge) {
    final ab = edge.$2 - edge.$1;
    final t = ((p - edge.$1).dx * ab.dx + (p - edge.$1).dy * ab.dy) / ab.distanceSquared;
    return edge.$1 + ab * t.clamp(0.0, 1.0);
  }
}

/// The on-screen protractor, in board units: [center] is the middle of its straight edge.
@immutable
class ProtractorState {
  const ProtractorState({this.visible = false, this.center = const Offset(400, 400), this.angle = 0});

  final bool visible;
  final Offset center;
  final double angle;
  static const radius = 220.0;

  ProtractorState copyWith({bool? visible, Offset? center, double? angle}) =>
      ProtractorState(visible: visible ?? this.visible, center: center ?? this.center, angle: angle ?? this.angle);
}

/// One point of the laser pointer's trail: where, and when (milliseconds).
@immutable
class LaserPoint {
  const LaserPoint(this.at, this.t);

  final Offset at;
  final int t;
}

/// What a lesson recorder or live stream needs from a board, so the same recorder works for the
/// whiteboard and the older page-of-strokes boards ([BoardPages]).
abstract interface class RecordableBoard {
  /// Fires on every change: pages, elements, strokes being drawn, the view, the laser.
  Listenable get changes;

  /// One object per page, the same object for as long as the page exists.
  List<Object> get pageKeys;
  int get pageIndex;

  /// The finished elements on page [i], bottom first.
  List<BoardElement> elementsOf(int i);

  /// Strokes being drawn on the open page right now. Their points grow in place.
  Iterable<Stroke> get activeStrokes;
  /// The paper, when the board knows it (otherwise the recorder is told).
  BoardBackground? get background;

  /// The part of the board the class can see, when the board can be moved and zoomed.
  Rect? get visibleArea;

  /// The laser pointer's trail, newest last.
  List<LaserPoint> get laserPoints;
}

class _Snapshot {
  _Snapshot(List<BoardElement> elements, Map<String, String> groups) : elements = List.of(elements), groups = Map.of(groups);
  final List<BoardElement> elements;
  final Map<String, String> groups;
}

/// The whiteboard: an endless, zoomable board of pages holding [BoardElement]s, the tools that
/// draw on it, the selection, per-page undo and redo, the ruler, protractor, compass and laser.
///
/// Pointer input arrives in board units (the canvas converts from the screen), one pointer at
/// a time or many at once: every pen, finger or mouse is tracked by its id, so several people
/// can write at the same time. Changes to the elements bump [committed], so finished ink is not
/// repainted on every move.
class WhiteboardController extends ChangeNotifier implements RecordableBoard {
  WhiteboardController({this.palmMode = PalmMode.ignore}) {
    _pages.add(WhiteboardPage());
  }

  final List<WhiteboardPage> _pages = [];
  int _index = 0;

  /// Bumped whenever finished elements change (painters of the finished layer listen).
  final ValueNotifier<int> committed = ValueNotifier(0);

  // --- Pages --------------------------------------------------------------------------------

  WhiteboardPage get page => _pages[_index];
  List<WhiteboardPage> get pages => List.unmodifiable(_pages);
  @override
  int get pageIndex => _index;
  int get pageCount => _pages.length;
  bool get hasPrevious => _index > 0;
  bool get hasNext => _index < _pages.length - 1;

  /// The open page's elements, bottom first.
  List<BoardElement> get elements => List.unmodifiable(page.elements);

  /// True when no page has anything on it.
  bool get isBlank => _pages.every((p) => p.elements.isEmpty);

  void previous() => goToPage(_index - 1);
  void next() => goToPage(_index + 1);

  void goToPage(int i) {
    if (i < 0 || i >= _pages.length || i == _index) return;
    _finishGestures();
    page.view = _autoView ? null : view.value;
    final was = page.background;
    _index = i;
    _paperChanged(was, page.background);
    _selection.clear();
    _showPage();
    _changed(content: false);
  }

  /// Adds a blank page after the open one and opens it.
  void addPage() {
    _finishGestures();
    page.view = _autoView ? null : view.value;
    _pages.insert(_index + 1, WhiteboardPage(background: page.background));
    _index++;
    _selection.clear();
    _showPage();
    _changed(content: false);
  }

  /// Adds [pages] after the open page (an imported PDF or slide deck, one board page each)
  /// and opens the first of them.
  void addPages(List<List<BoardElement>> pages) {
    if (pages.isEmpty) return;
    _finishGestures();
    page.view = _autoView ? null : view.value;
    _pages.insertAll(_index + 1, [for (final els in pages) WhiteboardPage(elements: List.of(els), background: page.background)]);
    _index++;
    _selection.clear();
    _showPage();
    _changed();
  }

  /// A copy of page [i] (new ids) after it, opened.
  void duplicatePage(int i) {
    final src = _pages[i];
    final ids = <String, String>{};
    final copy = WhiteboardPage(elements: [for (final e in src.elements) e.withId(ids[e.id] = newElementId())], background: src.background);
    final groupIds = <String, String>{};
    for (final g in src.groups.entries) {
      if (ids[g.key] != null) copy.groups[ids[g.key]!] = groupIds[g.value] ??= newElementId();
    }
    _pages.insert(i + 1, copy);
    goToPage(i + 1);
  }

  /// Removes page [i] (a board keeps at least one page: the last one is cleared instead).
  void deletePage(int i) {
    if (_pages.length == 1) {
      if (page.elements.isNotEmpty) setElements([]);
      return;
    }
    _finishGestures();
    final was = page.background;
    final removed = _pages.removeAt(i);
    _undo.remove(removed.id);
    _redo.remove(removed.id);
    if (_index >= _pages.length) _index = _pages.length - 1;
    if (i < _index) _index--;
    _paperChanged(was, page.background);
    _selection.clear();
    _showPage();
    _changed();
  }

  /// Replaces every page with a saved board's and opens the first. Clears undo.
  void load(SavedBoard board) {
    _finishGestures();
    final was = _pages.isEmpty ? BoardBackground.plain : page.background;
    _pages
      ..clear()
      ..addAll([
        for (var p = 0; p < math.max(1, board.pages.length); p++)
          if (p >= board.pages.length)
            WhiteboardPage(background: board.background)
          else
            _pageFrom(board.pages[p], p < board.groups.length ? board.groups[p] : const [])..background = board.backgroundOf(p),
      ]);
    _index = 0;
    _paperChanged(was, page.background);
    _undo.clear();
    _redo.clear();
    _selection.clear();
    _showPage();
    _changed();
  }

  WhiteboardPage _pageFrom(List<BoardElement> saved, List<List<int>> groups) {
    // Saved elements get fresh ids, unique on this board.
    final els = [for (final e in saved) e.withId(newElementId())];
    final page = WhiteboardPage(elements: els);
    for (final g in groups) {
      final gid = newElementId();
      for (final i in g) {
        if (i < els.length) page.groups[els[i].id] = gid;
      }
    }
    return page;
  }

  /// The board as it stands, ready to save. [canvas] is the screen size it was drawn on.
  SavedBoard toSaved(Size canvas) => SavedBoard(
    background: _pages.first.background,
    canvas: canvas,
    pages: [for (final p in _pages) List.of(p.elements)],
    groups: [for (final p in _pages) p.groupIndexes],
    pageBackgrounds: [for (final p in _pages) p.background],
  );

  /// Moves a page from [from] to [to] (the page overview's drag to reorder); the open page
  /// stays open.
  void movePage(int from, int to) {
    if (from == to || from < 0 || to < 0 || from >= _pages.length || to >= _pages.length) return;
    _finishGestures();
    final open = page;
    _pages.insert(to, _pages.removeAt(from));
    _index = _pages.indexOf(open);
    _changed(content: false);
  }

  // --- Paper --------------------------------------------------------------------------------

  /// The open page's paper. Setting it changes this page only; new pages take the paper of
  /// the page they are added after.
  @override
  BoardBackground get background => page.background;
  set background(BoardBackground b) {
    if (b == page.background) return;
    final was = page.background;
    page.background = b;
    _paperChanged(was, b);
    _changed(content: false);
  }

  /// Sets every page's paper at once.
  void setAllBackgrounds(BoardBackground b) {
    final was = page.background;
    for (final p in _pages) {
      p.background = b;
    }
    _paperChanged(was, b);
    _changed(content: false);
  }

  /// The pen keeps its logical colour across papers: black ink is drawn white on a dark board
  /// ([inkColorFor]), so chalk white picked on a dark board becomes black again.
  void _paperChanged(BoardBackground from, BoardBackground to) {
    if (from.isDark != to.isDark && penColor == chalkWhite) penColor = inkBlack;
  }

  /// Sets the paper of every page that has [from] to [to] (the board following its theme: plain
  /// paper becomes the dark board and back, while pages with a template keep it).
  void replaceBackground(BoardBackground from, BoardBackground to) {
    if (from == to || !_pages.any((p) => p.background == from)) return;
    final was = page.background;
    for (final p in _pages) {
      if (p.background == from) p.background = to;
    }
    _paperChanged(was, page.background);
    _changed(content: false);
  }

  // --- Tools --------------------------------------------------------------------------------

  static const inkBlack = Color(0xFF1B1B1F);
  static const chalkWhite = Color(0xFFFFFFFF);

  BoardTool _tool = BoardTool.pen;
  BoardTool get tool => _tool;
  set tool(BoardTool t) {
    if (t == _tool) return;
    onToolChanging?.call();
    _tool = t;
    if (t != BoardTool.select) _selection.clear();
    notifyListeners();
  }

  /// Called before the tool changes: an open text box commits what was typed.
  VoidCallback? onToolChanging;

  Color penColor = inkBlack;
  double penWidth = 4;

  /// The pen's line (the AI pen's too): round, calligraphy, dashed or an arrow.
  PenNib penNib = PenNib.round;

  /// Line width follows stylus pressure.
  bool penPressure = false;

  /// 0 (as drawn) to 1 (very smooth): finished pen strokes are evened out by this much.
  double penSmoothing = 0;
  Color highlighterColor = const Color(0xFFFFD84D);

  /// The highlighter paints four times this wide.
  double highlighterWidth = 6;

  /// Eraser radius, in screen pixels.
  double eraserRadius = 18;
  ShapeKind shapeKind = ShapeKind.rectangle;
  bool shapeFill = false;
  NoteKind noteKind = NoteKind.note;
  Color noteColor = const Color(0xFFFFE58A);
  double textSize = 32;

  /// Font for new text (Andika on primary boards).
  BoardFont font = BoardFont.inter;

  /// Changes a tool setting and tells the toolbars.
  void setPen({Color? color, double? width}) {
    if (color != null) penColor = color;
    if (width != null) penWidth = width;
    if (_tool != BoardTool.pen && _tool != BoardTool.aiPen && _tool != BoardTool.shape && _tool != BoardTool.compass) _tool = BoardTool.pen;
    notifyListeners();
  }

  void setHighlighter({Color? color, double? width}) {
    if (color != null) highlighterColor = color;
    if (width != null) highlighterWidth = width;
    _tool = BoardTool.highlighter;
    notifyListeners();
  }

  void setShape(ShapeKind kind) {
    shapeKind = kind;
    tool = BoardTool.shape;
    notifyListeners();
  }

  void setNoteKind(NoteKind kind, {Color? color}) {
    noteKind = kind;
    if (color != null) noteColor = color;
    tool = BoardTool.note;
    notifyListeners();
  }

  void update(VoidCallback change) {
    change();
    notifyListeners();
  }

  /// Measurement labels on shapes.
  bool _showLengths = false, _showAngles = false;
  bool get showLengths => _showLengths;
  bool get showAngles => _showAngles;
  set showLengths(bool v) {
    _showLengths = v;
    _changed(content: false, repaint: true);
  }

  set showAngles(bool v) {
    _showAngles = v;
    _changed(content: false, repaint: true);
  }

  /// How large contacts (a palm, a fist) are treated; see [PalmMode].
  /// Read on the next touch; nothing on the board changes, so it may be set while building.
  PalmMode palmMode;

  // --- Undo ---------------------------------------------------------------------------------

  final _undo = <String, List<_Snapshot>>{};
  final _redo = <String, List<_Snapshot>>{};

  bool get canUndo => (_undo[page.id] ?? const []).isNotEmpty;
  bool get canRedo => (_redo[page.id] ?? const []).isNotEmpty;

  _Snapshot get _snap => _Snapshot(page.elements, page.groups);

  void _push(_Snapshot s) {
    final stack = _undo.putIfAbsent(page.id, () => []);
    stack.add(s);
    if (stack.length > 100) stack.removeAt(0);
    _redo[page.id]?.clear();
  }

  void undo() {
    final s = _undo[page.id];
    if (s == null || s.isEmpty) return;
    _finishGestures();
    _redo.putIfAbsent(page.id, () => []).add(_snap);
    _restore(s.removeLast());
  }

  void redo() {
    final s = _redo[page.id];
    if (s == null || s.isEmpty) return;
    _finishGestures();
    _undo.putIfAbsent(page.id, () => []).add(_snap);
    _restore(s.removeLast());
  }

  void _restore(_Snapshot s) {
    page.elements = List.of(s.elements);
    page.groups = Map.of(s.groups);
    _selection.clear();
    _changed();
  }

  void _changed({bool content = true, bool repaint = false}) {
    if (content || repaint) committed.value++;
    notifyListeners();
  }

  // --- Content ------------------------------------------------------------------------------

  /// Replaces the open page's elements as one undo step.
  void setElements(List<BoardElement> els) {
    _push(_snap);
    els = reflowLinks(absorbTextIntoFlow(page.elements, els));
    page.elements = List.of(els);
    final ids = {for (final e in els) e.id};
    page.groups.removeWhere((k, _) => !ids.contains(k));
    _selection.removeWhere((id) => !ids.contains(id));
    _changed();
  }

  void add(BoardElement e) => setElements([...page.elements, e]);

  /// Adds [els] as one undo step; with [group] they select and move together.
  void addAll(List<BoardElement> els, {bool group = false}) {
    if (els.isEmpty) return;
    setElements([...page.elements, ...els]);
    if (group && els.length > 1) _group({for (final e in els) e.id});
  }

  /// Puts [e] in place of the element with its id.
  void replace(BoardElement e) => setElements([for (final x in page.elements) x.id == e.id ? e : x]);

  void removeIds(Set<String> ids) {
    if (ids.isEmpty || !page.elements.any((e) => ids.contains(e.id))) return;
    setElements(page.elements.where((e) => !ids.contains(e.id)).toList());
  }

  /// Replaces the open page's elements as part of the last undo step rather than a new one: a
  /// stroke just finished that turned into something else (a scribble that rubbed out what it
  /// crossed, a tap that opened a menu). Undo then goes back to before the stroke.
  void amendLastStep(List<BoardElement> els) {
    if (!canUndo) {
      setElements(els);
      return;
    }
    els = reflowLinks(absorbTextIntoFlow(page.elements, els));
    page.elements = List.of(els);
    final ids = {for (final e in els) e.id};
    page.groups.removeWhere((k, _) => !ids.contains(k));
    _selection.removeWhere((id) => !ids.contains(id));
    _changed();
  }

  /// A layout-only change, such as an equation's measured size: not an undo step.
  void updateSilently(BoardElement e) {
    final i = page.elements.indexWhere((x) => x.id == e.id);
    if (i < 0) return;
    page.elements = [...page.elements]..[i] = e;
    _changed();
  }

  BoardElement? byId(String id) => page.elements.where((e) => e.id == id).firstOrNull;

  /// Clears the page, keeping an imported page under the ink.
  void clearPage() {
    final kept = page.elements.where((e) => !_selectable(e)).toList();
    if (page.elements.length == kept.length) return;
    setElements(kept);
  }

  /// Whether the open page has anything [clearPage] would take.
  bool get canClearPage => page.elements.any(_selectable);

  /// Whether any page has anything [clearAllPages] would take.
  bool get canClearAllPages => _pages.any((p) => p.elements.any(_selectable));

  /// Clears every page (keeping imported pages under the ink); each page's undo brings its
  /// own back. Returns an undo for them all at once (for the "Undo" of a message).
  VoidCallback clearAllPages() {
    _finishGestures();
    final cleared = <WhiteboardPage, _Snapshot>{};
    for (final p in _pages) {
      final kept = p.elements.where((e) => !_selectable(e)).toList();
      if (p.elements.length == kept.length) continue;
      final snap = _Snapshot(p.elements, p.groups);
      final stack = _undo.putIfAbsent(p.id, () => []);
      stack.add(snap);
      if (stack.length > 100) stack.removeAt(0);
      _redo[p.id]?.clear();
      cleared[p] = snap;
      p.elements = kept;
      final ids = {for (final e in kept) e.id};
      p.groups.removeWhere((k, _) => !ids.contains(k));
    }
    _selection.clear();
    _changed();
    return () {
      for (final MapEntry(key: p, value: snap) in cleared.entries) {
        final stack = _undo[p.id];
        // Only while nothing was done on that page since.
        if (stack == null || stack.isEmpty || !identical(stack.last, snap)) continue;
        stack.removeLast();
        p.elements = List.of(snap.elements);
        p.groups = Map.of(snap.groups);
      }
      _selection.clear();
      _changed();
    };
  }

  /// Places [local] (drawn around 0, 0) in a free spot in view, as one group, and selects it.
  /// For ready-made drawings, AI answers and pictures.
  List<BoardElement> insert(List<BoardElement> local, {Offset? at}) {
    if (local.isEmpty) return const [];
    final b = contentBounds(local);
    final to = at ?? placementPoint(b.size);
    final placed = [for (final e in local) e.translated(to - b.topLeft)];
    addAll(placed, group: true);
    if (_tool != BoardTool.select) {
      onToolChanging?.call();
      _tool = BoardTool.select;
    }
    select({for (final e in placed) e.id});
    return placed;
  }

  /// Covered answers on this page, top to bottom.
  List<NoteElement> get hiddenAnswers => [
    for (final e in page.elements)
      if (e is NoteElement && e.hidden) e,
  ]..sort((a, b) => a.rect.top.compareTo(b.rect.top));

  /// Uncovers answer [id], or the next one, or [all] of them: one undo step.
  void revealAnswers({String? id, bool all = false}) {
    final hidden = hiddenAnswers;
    final ids = {for (final e in all ? hidden : hidden.where((e) => id == null || e.id == id).take(1)) e.id};
    if (ids.isEmpty) return;
    setElements([for (final x in page.elements) x is NoteElement && ids.contains(x.id) ? x.revealed() : x]);
  }

  // --- Selection ----------------------------------------------------------------------------

  final Set<String> _selection = {};
  Set<String> get selection => Set.unmodifiable(_selection);
  List<BoardElement> get selectedElements => [
    for (final e in page.elements)
      if (_selection.contains(e.id)) e,
  ];

  /// Selects [ids] (and everything grouped with them).
  void select(Set<String> ids) {
    _selection
      ..clear()
      ..addAll(page.expandGroups(ids));
    _changed(content: false, repaint: true);
  }

  void clearSelection() {
    if (_selection.isEmpty) return;
    _selection.clear();
    _changed(content: false, repaint: true);
  }

  void selectAll() {
    if (_tool != BoardTool.select) tool = BoardTool.select;
    select({
      for (final e in page.elements)
        if (_selectable(e)) e.id,
    });
  }

  /// The box around the selection, wide enough to clear any measurement labels.
  Rect? get selectionBounds {
    final els = selectedElements;
    if (els.isEmpty) return null;
    final labels = (_showLengths || _showAngles) && els.any((e) => e is Stroke && e.shape != null);
    return contentBounds(els).inflate(labels ? 26 : 0);
  }

  void deleteSelection() {
    final ids = Set.of(_selection);
    _selection.clear();
    removeIds(ids);
  }

  void recolorSelection(Color c) {
    if (_selection.isEmpty) return;
    setElements([for (final e in page.elements) _selection.contains(e.id) ? e.recolored(c) : e]);
  }

  static bool _fillable(BoardElement e) => (e is Stroke && e.shape != null && !(e.shape!.index <= ShapeKind.doubleArrow.index)) || e is PolygonElement;

  bool get selectionFillable => selectedElements.any(_fillable);
  bool get selectionFilled => selectedElements.any((e) => (e is Stroke && e.fill != null) || (e is PolygonElement && e.fill != null));

  void setSelectionFill(bool on) {
    setElements([
      for (final e in page.elements)
        if (!_selection.contains(e.id) || !_fillable(e))
          e
        else if (e is Stroke)
          on ? e.copyWith(fill: e.style.color.withValues(alpha: 0.18)) : e.copyWith(clearFill: true)
        else if (e is PolygonElement)
          on ? e.copyWith(fill: e.color.withValues(alpha: 0.18)) : e.copyWith(clearFill: true)
        else
          e,
    ]);
  }

  void bringSelectionToFront() {
    if (_selection.isEmpty) return;
    setElements([...page.elements.where((e) => !_selection.contains(e.id)), ...page.elements.where((e) => _selection.contains(e.id))]);
  }

  void sendSelectionToBack() {
    if (_selection.isEmpty) return;
    setElements([...page.elements.where((e) => _selection.contains(e.id)), ...page.elements.where((e) => !_selection.contains(e.id))]);
  }

  /// Applies [f] to every selected element as one undo step (keyboard nudges, tests).
  void transformSelection(BoardElement Function(BoardElement) f) {
    if (_selection.isEmpty) return;
    setElements([for (final e in page.elements) _selection.contains(e.id) ? f(e) : e]);
  }

  bool get selectionGrouped {
    final gs = {for (final id in _selection) page.groups[id]};
    return _selection.length > 1 && gs.length == 1 && gs.first != null;
  }

  void groupSelection() {
    if (_selection.length < 2) return;
    _push(_snap);
    _group(_selection);
    _changed(content: false, repaint: true);
  }

  void ungroupSelection() {
    if (_selection.isEmpty) return;
    _push(_snap);
    page.groups.removeWhere((k, _) => _selection.contains(k));
    _changed(content: false, repaint: true);
  }

  void _group(Set<String> ids) {
    final g = newElementId();
    for (final id in ids) {
      page.groups[id] = g;
    }
  }

  // --- Clipboard ----------------------------------------------------------------------------

  List<BoardElement> _clipboard = const [];
  bool _clipboardGrouped = false;
  bool get canPaste => _clipboard.isNotEmpty;

  void copySelection() {
    _clipboard = selectedElements;
    _clipboardGrouped = _clipboard.length > 1;
    notifyListeners();
  }

  void cutSelection() {
    copySelection();
    deleteSelection();
  }

  /// Pastes beside the original when it is still in view, else in the middle of the view.
  void paste() {
    if (_clipboard.isEmpty) return;
    final b = contentBounds(_clipboard);
    final visible = visibleArea ?? Rect.largest;
    final shift = visible.contains(b.center) ? const Offset(28, 28) : visible.center - b.center;
    _addCopies([for (final e in _clipboard) e.withId(newElementId()).translated(shift)], group: _clipboardGrouped);
  }

  void duplicateSelection() {
    final els = selectedElements;
    if (els.isEmpty) return;
    _addCopies([for (final e in els) e.withId(newElementId()).translated(const Offset(24, 24))], group: els.length > 1);
  }

  void _addCopies(List<BoardElement> copies, {required bool group}) {
    addAll(copies, group: group);
    if (_tool != BoardTool.select) {
      onToolChanging?.call();
      _tool = BoardTool.select;
    }
    select({for (final e in copies) e.id});
  }

  // --- View ---------------------------------------------------------------------------------

  /// The open page's view: where the board is and how far it is zoomed.
  final ValueNotifier<ViewState> view = ValueNotifier(const ViewState());

  /// True until the teacher moves or zooms this page; the view then follows the screen.
  bool _autoView = true;
  Size _viewport = Size.zero;
  Size get viewport => _viewport;

  /// Set by the canvas when its size changes (during layout: the view follows a moment later,
  /// outside the frame).
  set viewport(Size s) {
    if (s == _viewport) return;
    _viewport = s;
    if (_autoView) scheduleMicrotask(() => _autoView ? view.value = _startView() : null);
  }

  /// Edges of the canvas covered by floating toolbars. The start view, fitting and placement
  /// keep clear of them.
  EdgeInsets _safeInsets = EdgeInsets.zero;
  EdgeInsets get safeInsets => _safeInsets;
  set safeInsets(EdgeInsets e) {
    if (e == _safeInsets) return;
    _safeInsets = e;
    if (_autoView && !_viewport.isEmpty) scheduleMicrotask(() => _autoView ? view.value = _startView() : null);
  }

  /// The part of the canvas the toolbars leave free, in screen pixels.
  Rect get safeRect {
    final r = _safeInsets.deflateRect(Offset.zero & _viewport);
    return r.width < 200 || r.height < 200 ? Offset.zero & _viewport : r;
  }

  /// The board area the class can see clear of the toolbars, in board units.
  @override
  Rect? get visibleArea {
    if (_viewport.isEmpty) return null;
    final r = safeRect;
    return Rect.fromPoints(view.value.toBoard(r.topLeft), view.value.toBoard(r.bottomRight));
  }

  ViewState _startView() {
    // A new page starts at the top left of the board, at full size, so a saved board looks as
    // it was drawn; prepared pages wider than the screen are shrunk to fit their width.
    final els = page.elements;
    if (_viewport.isEmpty || els.isEmpty) return const ViewState();
    final right = contentBounds(els).right + 40;
    if (right <= _viewport.width) return const ViewState();
    return ViewState(scale: math.max(0.35, _viewport.width / right));
  }

  void _showPage() {
    final saved = page.view;
    _autoView = saved == null;
    view.value = saved ?? _startView();
  }

  void setView(ViewState v) {
    _autoView = false;
    view.value = ViewState(scale: v.scale.clamp(ViewState.minScale, ViewState.maxScale), offset: v.offset);
    notifyListeners();
  }

  void zoomBy(double factor, [Offset? focal]) => setView(view.value.zoomedAt(factor, focal ?? safeRect.center));
  void panBy(Offset d) => setView(view.value.panned(d));

  /// Back to 100 %, keeping the middle of the view where it is.
  void resetZoom() => zoomBy(1 / view.value.scale);

  /// Everything on the page in view.
  void fitContent() {
    if (page.elements.isEmpty) {
      setView(const ViewState());
      return;
    }
    final safe = safeRect;
    final f = ViewState.fit(contentBounds(page.elements), safe.size, maxScale: 2.5);
    setView(ViewState(scale: f.scale, offset: f.offset + safe.topLeft));
  }

  /// A free spot in view for something of [size] (board units).
  Offset placementPoint(Size size) {
    final w = visibleArea ?? (Offset.zero & const Size(1280, 720));
    final all = page.elements;
    final visible = all.where((e) => w.overlaps(e.bounds)).toList();
    if (visible.isEmpty) return w.center - Offset(size.width / 2, size.height / 2);
    final content = contentBounds(visible);
    // Beside what is on screen, if that spot is free...
    final beside = Offset(content.right + 40, content.top) & size;
    if (beside.right < w.right && !all.any((e) => e.bounds.overlaps(beside.inflate(20)))) return beside.topLeft;
    // ...otherwise under everything in that column.
    final x = math.max(w.left + 40, content.left);
    var bottom = content.bottom;
    for (final e in all) {
      if (e.bounds.right > x && e.bounds.left < x + size.width) bottom = math.max(bottom, e.bounds.bottom);
    }
    return Offset(x, bottom + 40);
  }

  /// Moves the view (keeping the zoom) so [r] is in view.
  void reveal(Rect r) {
    final w = visibleArea;
    if (w == null || (w.contains(r.topLeft) && w.contains(r.bottomRight))) return;
    final safe = safeRect;
    final f = ViewState.fit(w.expandToInclude(r), safe.size, margin: 72, maxScale: view.value.scale);
    setView(ViewState(scale: f.scale, offset: f.offset + safe.topLeft));
  }

  // --- Ruler, protractor, laser -------------------------------------------------------------

  final ValueNotifier<RulerState> ruler = ValueNotifier(const RulerState());
  final ValueNotifier<ProtractorState> protractor = ValueNotifier(const ProtractorState());

  void toggleRuler() {
    final r = ruler.value;
    final c = visibleArea?.center;
    ruler.value = r.visible ? r.copyWith(visible: false) : r.copyWith(visible: true, center: c ?? r.center);
    notifyListeners();
  }

  void toggleProtractor() {
    final p = protractor.value;
    final c = visibleArea?.center;
    protractor.value = p.visible ? p.copyWith(visible: false) : p.copyWith(visible: true, center: c == null ? p.center : c + const Offset(0, 120));
    notifyListeners();
  }

  /// The geometry box on the board: any number of rulers, protractors, set squares and
  /// compasses at once (see [GeoTool]). Not part of the page: they are instruments, and what is
  /// drawn with them is ink.
  final ValueNotifier<List<GeoTool>> geoTools = ValueNotifier(const []);

  /// The line being drawn along a tool's edge (for its live length), or null.
  final ValueNotifier<GeoEdge?> edgeLine = ValueNotifier(null);

  /// Puts a new tool of [kind] in the middle of the view and returns it.
  GeoTool addGeoTool(GeoKind kind) {
    final c = visibleArea?.center ?? const Offset(400, 300);
    // Each new tool a little below the last, so several do not land on top of each other.
    final t = GeoTool.create(kind, c + Offset(0, 40.0 * (geoTools.value.length % 5)));
    geoTools.value = [...geoTools.value, t];
    notifyListeners();
    return t;
  }

  void updateGeoTool(GeoTool t) {
    geoTools.value = [for (final x in geoTools.value) x.id == t.id ? t : x];
  }

  void removeGeoTool(String id) {
    geoTools.value = geoTools.value.where((t) => t.id != id).toList();
    notifyListeners();
  }

  /// Told when a block or graph is tapped twice (the canvas opens its editor).
  void Function(BoardElement e)? onDoubleTapElement;
  String? _lastTapId;
  int _lastTapAt = 0;

  /// The laser trail, newest last; points older than [laserLife] are dropped by [pruneLaser].
  final ValueNotifier<List<LaserPoint>> laser = ValueNotifier(const []);
  static const laserLife = 1000;

  @override
  List<LaserPoint> get laserPoints => laser.value;

  /// The clock for the laser trail (tests replace it).
  int Function() now = () => DateTime.now().millisecondsSinceEpoch;

  void _addLaser(Offset p) {
    laser.value = [...laser.value, LaserPoint(p, now())];
    notifyListeners();
  }

  /// Drops faded laser points. Returns false when the trail is gone.
  bool pruneLaser() {
    final t = now();
    final kept = laser.value.where((p) => t - p.t < laserLife).toList();
    if (kept.length != laser.value.length) laser.value = kept;
    return kept.isNotEmpty;
  }

  // --- Pointers -----------------------------------------------------------------------------

  final Map<int, Stroke> _active = {};
  final Map<int, BoardTool> _activeTool = {};
  final Map<int, Offset> _shapeStart = {};
  final Map<int, (Offset, Offset)> _rulerEdge = {};
  final Map<int, double> _eraseRadius = {};
  _Snapshot? _eraseSnapshot;
  final Set<int> _erasing = {};

  // One selecting pointer at a time.
  int? _selectPointer;
  Offset? _selectDown, _lastSelect;
  bool _selectMoved = false;
  _Snapshot? _moveSnapshot;
  final List<Offset> _lasso = [];

  /// The loop being drawn to select, in board units.
  List<Offset> get lasso => List.unmodifiable(_lasso);

  /// Strokes and shapes being drawn now.
  @override
  Iterable<Stroke> get activeStrokes => _active.values;
  int get activePointerCount => _activeTool.length;
  bool get isMovingSelection => _selectPointer != null && _lasso.isEmpty && _selectMoved;

  /// A compass being dragged: its centre and radius, for the overlay.
  (Offset, double)? get compass {
    for (final e in _activeTool.entries) {
      if (e.value == BoardTool.compass) {
        final c = _shapeStart[e.key]!;
        final s = _active[e.key];
        if (s != null && s.points.isNotEmpty) return (c, (s.points.first.offset - c).distance);
      }
    }
    return null;
  }

  double _scale = 1;

  /// The view's zoom when the last pointer touched the board (screen pixels per board unit).
  double get inputScale => _scale;

  /// Told when a pen or AI pen stroke starts at a board point, and when it is on the page (the
  /// AI pen listens to both).
  void Function(BoardTool tool, Offset at)? onStrokeStart;
  void Function(BoardTool tool, Stroke stroke)? onStrokeEnd;

  /// A pointer touched the board at [p] (board units). [scale] is the view's zoom (screen pixels
  /// per board unit), for sizes given in pixels. [palm] marks a contact the canvas judged to be a
  /// palm or fist; [contactRadius] is its size in board units. [forceEraser] is for the eraser
  /// end of a stylus.
  void pointerDown(int pointer, InkPoint p, {double scale = 1, bool palm = false, double contactRadius = 0, bool forceEraser = false}) {
    _scale = scale;
    var tool = _tool;
    if (palm && palmMode != PalmMode.off) {
      if (palmMode == PalmMode.ignore) return;
      tool = BoardTool.eraser;
    }
    if (forceEraser) tool = BoardTool.eraser;
    if (_selection.isNotEmpty && tool != BoardTool.select && tool != BoardTool.eraser) {
      // Just placed or pasted: anything else lets it go and carries on with the tool.
      _selection.clear();
      committed.value++;
    }
    final at = p.offset;
    _activeTool[pointer] = tool;
    switch (tool) {
      case BoardTool.pen || BoardTool.highlighter || BoardTool.aiPen:
        final hl = tool == BoardTool.highlighter;
        final style = InkStyle(
          tool: hl ? InkTool.highlighter : InkTool.pen,
          color: hl ? highlighterColor : penColor,
          width: hl ? highlighterWidth : penWidth,
          nib: hl ? PenNib.round : penNib,
          pressure: !hl && penPressure,
        );
        final r = ruler.value;
        var edge = !hl && r.visible ? r.snapEdge(at, 28 / scale) : null;
        // The edges of the geometry box guide the pen the same way.
        if (!hl && edge == null && geoTools.value.isNotEmpty) edge = snapToTools(geoTools.value, at, 28 / scale);
        if (edge != null) {
          // Along the ruler: a straight line from where the pen landed.
          _rulerEdge[pointer] = edge;
          final a = RulerState.project(at, edge);
          _active[pointer] = Stroke(
            id: newElementId(),
            style: style.copyWith(shape: ShapeKind.line),
            shape: ShapeKind.line,
            points: [InkPoint(a.dx, a.dy), InkPoint(a.dx, a.dy)],
          );
        } else {
          _active[pointer] = Stroke(id: newElementId(), style: style, points: [p]);
        }
        if (!hl) onStrokeStart?.call(tool, at);
      case BoardTool.shape:
        _shapeStart[pointer] = at;
        _active[pointer] = Stroke(
          id: newElementId(),
          style: InkStyle(tool: InkTool.shape, color: penColor, width: math.max(2, penWidth), shape: shapeKind),
          shape: shapeKind,
          fill: shapeFill ? penColor.withValues(alpha: 0.18) : null,
          points: shapePoints(shapeKind, at, at),
        );
      case BoardTool.compass:
        _shapeStart[pointer] = at;
        _active[pointer] = Stroke(
          id: newElementId(),
          style: InkStyle(tool: InkTool.shape, color: penColor, width: math.max(2, penWidth), shape: ShapeKind.circle),
          shape: ShapeKind.circle,
          points: shapePoints(ShapeKind.circle, at, at),
        );
      case BoardTool.eraser:
        _eraseSnapshot ??= _snap;
        _erasing.add(pointer);
        // A palm rubs out a wide band, like a duster.
        _eraseRadius[pointer] = palm ? math.max(eraserRadius / scale, contactRadius * 1.5) : eraserRadius / scale;
        _eraseAt(at, pointer);
      case BoardTool.laser:
        _addLaser(at);
      case BoardTool.select:
        if (_selectPointer != null) {
          _activeTool.remove(pointer); // one selecting gesture at a time
          return;
        }
        _selectPointer = pointer;
        _selectDown = _lastSelect = at;
        _selectMoved = false;
        final b = selectionBounds;
        if (b == null || !b.inflate(12 / scale).contains(at)) {
          _lasso
            ..clear()
            ..add(at);
        }
      case BoardTool.hand || BoardTool.text || BoardTool.math || BoardTool.note:
        // The canvas handles these (panning, typing, editors).
        _activeTool.remove(pointer);
        return;
    }
    notifyListeners();
  }

  void pointerMove(int pointer, InkPoint p) {
    final tool = _activeTool[pointer];
    if (tool == null) return;
    final at = p.offset;
    switch (tool) {
      case BoardTool.pen || BoardTool.highlighter || BoardTool.aiPen:
        final s = _active[pointer]!;
        final edge = _rulerEdge[pointer];
        if (edge != null) {
          final b = RulerState.project(at, edge);
          s.points[1] = InkPoint(b.dx, b.dy);
          edgeLine.value = (s.points[0].offset, b);
        } else {
          // Points closer than half a screen pixel add cost and no detail.
          if ((s.points.last.offset - at).distanceSquared * _scale * _scale < 0.25) return;
          s.points.add(p);
        }
      case BoardTool.shape:
        final s = _active[pointer]!;
        s.points
          ..clear()
          ..addAll(shapePoints(s.shape!, _shapeStart[pointer]!, at));
      case BoardTool.compass:
        final s = _active[pointer]!;
        s.points
          ..clear()
          ..addAll(shapePoints(ShapeKind.circle, _shapeStart[pointer]!, at));
      case BoardTool.eraser:
        _eraseAt(at, pointer);
      case BoardTool.laser:
        _addLaser(at);
      case BoardTool.select:
        if (pointer != _selectPointer) return;
        if (_lasso.isNotEmpty) {
          _lasso.add(at);
        } else {
          final d = at - _lastSelect!;
          if (!_selectMoved && (at - _selectDown!).distance * _scale < 4) return;
          if (!_selectMoved) {
            _selectMoved = true;
            _moveSnapshot = _snap;
          }
          // Moved live (each element knows it was moved, so viewers get a move, not a redraw).
          // Arrows follow the blocks they join.
          page.elements = reflowLinks([for (final e in page.elements) _selection.contains(e.id) ? e.translated(d) : e]);
          _lastSelect = at;
          committed.value++;
        }
      case BoardTool.hand || BoardTool.text || BoardTool.math || BoardTool.note:
        return;
    }
    notifyListeners();
  }

  void pointerUp(int pointer) {
    final tool = _activeTool.remove(pointer);
    if (tool == null) return;
    switch (tool) {
      case BoardTool.pen || BoardTool.highlighter || BoardTool.aiPen:
        final s = _active.remove(pointer)!;
        _rulerEdge.remove(pointer);
        edgeLine.value = null;
        // A ruler line that never left its start point is a stray tap.
        if (s.shape == ShapeKind.line && (s.points.first.offset - s.points.last.offset).distance * _scale < 4) break;
        if (s.shape == null && tool != BoardTool.highlighter && penSmoothing > 0) smoothStroke(s.points, penSmoothing);
        _commit(s);
        if (tool != BoardTool.highlighter) onStrokeEnd?.call(tool, s);
      case BoardTool.shape || BoardTool.compass:
        final s = _active.remove(pointer)!;
        _shapeStart.remove(pointer);
        // A tap without a drag would leave an invisible dot.
        if (s.bounds.width * _scale > 6 || s.bounds.height * _scale > 6) _commit(s, selectAfter: tool == BoardTool.shape);
      case BoardTool.eraser:
        _finishErase(pointer);
      case BoardTool.laser:
        break;
      case BoardTool.select:
        _finishSelect();
      case BoardTool.hand || BoardTool.text || BoardTool.math || BoardTool.note:
        break;
    }
    committed.value++;
    notifyListeners();
  }

  /// The system took the pointer away: the unfinished stroke is dropped; erasing and moving
  /// that already happened stay (and undo as usual).
  void pointerCancel(int pointer) {
    final tool = _activeTool.remove(pointer);
    _active.remove(pointer);
    _shapeStart.remove(pointer);
    _rulerEdge.remove(pointer);
    edgeLine.value = null;
    if (tool == BoardTool.eraser) _finishErase(pointer);
    if (tool == BoardTool.select) {
      _lasso.clear();
      _finishSelect();
    }
    committed.value++;
    notifyListeners();
  }

  void _commit(Stroke s, {bool selectAfter = false}) {
    _push(_snap);
    page.elements = [...page.elements, s];
    if (selectAfter) {
      // Selected at once, so its handles resize and turn it straight away.
      _selection
        ..clear()
        ..add(s.id);
    }
    _changed();
  }

  /// The eraser takes ink and typed words; pictures, graphs and notes are removed with Delete,
  /// so a hand resting on them cannot wipe them.
  static bool _erasable(BoardElement e) => e is Stroke || e is PolygonElement || e is TextElement || e is MathElement;

  /// Imported pages ([ImageElement.backdrop]) stay put under the ink: taps, loops and Select
  /// all pass over them.
  static bool _selectable(BoardElement e) => !(e is ImageElement && e.backdrop);

  void _eraseAt(Offset c, int pointer) {
    final r = _eraseRadius[pointer] ?? eraserRadius / _scale;
    final hit = <String>{
      for (final e in page.elements)
        if (_erasable(e) && e.hitTest(c, r)) e.id,
    };
    if (hit.isEmpty) return;
    page.elements = page.elements.where((e) => !hit.contains(e.id)).toList();
    page.groups.removeWhere((k, _) => hit.contains(k));
    _selection.removeAll(hit);
    committed.value++;
  }

  void _finishErase(int pointer) {
    _erasing.remove(pointer);
    _eraseRadius.remove(pointer);
    if (_erasing.isNotEmpty) return;
    final before = _eraseSnapshot;
    _eraseSnapshot = null;
    if (before != null && before.elements.length != page.elements.length) _push(before);
  }

  void _finishSelect() {
    final down = _selectDown;
    if (_lasso.isNotEmpty) {
      if (_lassoSpan() * _scale < 8 && down != null) {
        // A tap: the topmost thing under it (with its group), or nothing.
        final hit = page.elements.reversed.where((e) => _selectable(e) && e.hitTest(down, 8 / _scale)).firstOrNull;
        _selection.clear();
        if (hit != null) _selection.addAll(page.expandGroups({hit.id}));
        _tapped(hit);
      } else {
        _selection
          ..clear()
          ..addAll(page.expandGroups(_lassoPick()));
      }
      _lasso.clear();
    } else if (_selectMoved && _moveSnapshot != null) {
      _push(_moveSnapshot!);
    } else if (!_selectMoved && down != null) {
      // A tap inside the selection's box: pick what is under it (with its group).
      final hit = page.elements.reversed.where((e) => _selectable(e) && e.hitTest(down, 8 / _scale)).firstOrNull;
      _selection.clear();
      if (hit != null) _selection.addAll(page.expandGroups({hit.id}));
      _tapped(hit);
    }
    _moveSnapshot = null;
    _selectPointer = null;
    _selectDown = _lastSelect = null;
    _selectMoved = false;
  }

  /// A second tap on the same block or graph soon after the first opens its editor.
  void _tapped(BoardElement? hit) {
    final t = now(), previous = _lastTapAt;
    _lastTapAt = t;
    if (hit == null || !(hit is FlowNodeElement || hit is GraphElement)) {
      _lastTapId = null;
      return;
    }
    if (hit.id == _lastTapId && t - previous < 450) {
      _lastTapId = null;
      onDoubleTapElement?.call(hit);
      return;
    }
    _lastTapId = hit.id;
  }

  double _lassoSpan() {
    var r = Rect.fromPoints(_lasso.first, _lasso.first);
    for (final p in _lasso) {
      r = r.expandToInclude(Rect.fromPoints(p, p));
    }
    return r.longestSide;
  }

  /// Elements at least half inside the loop. A drag that does not loop (a mouse, a quick flick)
  /// picks what is inside its box.
  Set<String> _lassoPick() {
    var poly = List.of(_lasso);
    var box = Rect.fromPoints(poly.first, poly.first);
    for (final p in poly) {
      box = box.expandToInclude(Rect.fromPoints(p, p));
    }
    if (_area(poly) < box.width * box.height * 0.25) poly = [box.topLeft, box.topRight, box.bottomRight, box.bottomLeft];
    final picked = <String>{};
    for (final e in page.elements) {
      if (!_selectable(e)) continue;
      final samples = switch (e) {
        Stroke(:final points) => [for (var i = 0; i < points.length; i += math.max(1, points.length ~/ 12)) points[i].offset],
        _ => [e.bounds.center, e.bounds.topLeft, e.bounds.bottomRight, e.bounds.topRight, e.bounds.bottomLeft],
      };
      final inside = samples.where((p) => _insideLoop(p, poly)).length;
      if (samples.isNotEmpty && inside * 2 >= samples.length) picked.add(e.id);
    }
    return picked;
  }

  static double _area(List<Offset> poly) {
    var a = 0.0;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      a += (poly[j].dx + poly[i].dx) * (poly[j].dy - poly[i].dy);
    }
    return a.abs() / 2;
  }

  static bool _insideLoop(Offset p, List<Offset> poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      final a = poly[i], c = poly[j];
      if ((a.dy > p.dy) != (c.dy > p.dy) && p.dx < (c.dx - a.dx) * (p.dy - a.dy) / (c.dy - a.dy) + a.dx) inside = !inside;
    }
    return inside;
  }

  /// Ends gestures in progress before the page changes under them.
  void _finishGestures() {
    for (final p in _activeTool.keys.toList()) {
      pointerCancel(p);
    }
    _transform = null;
  }

  // --- Resizing and turning -----------------------------------------------------------------

  ({SelectionHandle handle, Rect box, Offset from, BoardElement Function(BoardElement) f, double angle})? _transform;

  /// The resize or turn being dragged, applied to an element (for painting the preview).
  BoardElement Function(BoardElement)? get transformPreview => _transform?.f;
  bool get isTransforming => _transform != null;
  SelectionHandle? get transformHandle => _transform?.handle;

  /// How far the selection is being turned, in degrees (for the angle pill).
  double get transformAngle => (_transform?.angle ?? 0) * 180 / math.pi;

  /// Starts dragging [handle] of the selection from board point [p].
  void beginTransform(SelectionHandle handle, Offset p) {
    final els = selectedElements;
    if (els.isEmpty) return;
    _transform = (handle: handle, box: contentBounds(els), from: p, f: (e) => e, angle: 0);
    notifyListeners();
  }

  void updateTransform(Offset w) {
    final t = _transform;
    if (t == null) return;
    final r = t.box, from = t.from, h = t.handle;
    if (h == SelectionHandle.rotate) {
      final c = r.center;
      var a = math.atan2(w.dy - c.dy, w.dx - c.dx) - math.atan2(from.dy - c.dy, from.dx - c.dx);
      // Settles on 15° steps (0°, 45°, 90°…) when close to one.
      final deg = a * 180 / math.pi;
      final step = (deg / 15).round() * 15.0;
      if ((deg - step).abs() < 4) a = step * math.pi / 180;
      _transform = (handle: h, box: r, from: from, f: (e) => e.rotated(c, a), angle: a);
    } else {
      final anchor = switch (h) {
        SelectionHandle.topLeft => r.bottomRight,
        SelectionHandle.topRight => r.bottomLeft,
        SelectionHandle.bottomLeft => r.topRight,
        SelectionHandle.bottomRight => r.topLeft,
        SelectionHandle.top => r.bottomCenter,
        SelectionHandle.bottom => r.topCenter,
        SelectionHandle.left => r.centerRight,
        SelectionHandle.right => r.centerLeft,
        SelectionHandle.rotate => r.center,
      };
      // Measured from where the handle was grabbed, so the box does not jump when it is taken.
      double ratio(double now, double was, double at) => was == at ? 1 : ((now - at) / (was - at)).clamp(0.05, 50.0);
      var sx = 1.0, sy = 1.0;
      switch (h) {
        case SelectionHandle.left || SelectionHandle.right:
          sx = ratio(w.dx, from.dx, anchor.dx);
        case SelectionHandle.top || SelectionHandle.bottom:
          sy = ratio(w.dy, from.dy, anchor.dy);
        default:
          // Corners keep the proportions: scale along the diagonal.
          final d0 = from - anchor, d = w - anchor;
          final k = d0.distanceSquared == 0 ? 1.0 : ((d.dx * d0.dx + d.dy * d0.dy) / d0.distanceSquared).clamp(0.05, 50.0);
          sx = sy = k;
      }
      _transform = (handle: h, box: r, from: from, f: (e) => e.scaled(anchor, sx, sy), angle: 0);
    }
    notifyListeners();
  }

  /// Applies the resize or turn as one undo step.
  void endTransform() {
    final t = _transform;
    _transform = null;
    if (t == null) return;
    setElements([for (final e in page.elements) _selection.contains(e.id) ? t.f(e) : e]);
  }

  void cancelTransform() {
    _transform = null;
    notifyListeners();
  }

  // --- Recording ----------------------------------------------------------------------------

  @override
  Listenable get changes => this;

  @override
  List<Object> get pageKeys => _pages;

  @override
  List<BoardElement> elementsOf(int i) => _pages[i].elements;

  @override
  void dispose() {
    committed.dispose();
    view.dispose();
    ruler.dispose();
    protractor.dispose();
    geoTools.dispose();
    edgeLine.dispose();
    laser.dispose();
    super.dispose();
  }
}
