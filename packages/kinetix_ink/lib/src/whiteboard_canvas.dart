import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'board_background.dart';
import 'element_painting.dart';
import 'geometry_tools.dart';
import 'ink_canvas.dart' show inkColorFor;
import 'ink_models.dart';
import 'lesson.dart' show paintLaser;
import 'math_layer.dart';
import 'view.dart';
import 'whiteboard_controller.dart';

/// Who may write with what.
enum InputMode {
  /// Fingers write until a pen touches the board; from then on fingers move and zoom and only
  /// the pen writes (palm rejection).
  auto,

  /// Only a pen writes; fingers move and zoom the board.
  pen,

  /// Fingers write (two fingers move and zoom, unless every finger writes on a panel).
  finger,
}

/// Tells a palm or fist from a finger by contact size. Panels report sizes in their own units
/// (a logical pixel on a 75-inch panel is almost a millimetre), so the detector learns this
/// screen's usual finger size and calls anything three times bigger a palm.
class PalmDetector {
  double _finger = 8;
  int _seen = 0;

  /// Contacts at least this big (logical pixels) are palms.
  double get threshold => math.max(24.0, _finger * 3);

  /// [radius] 0 means the screen does not report contact size: never a palm.
  bool isPalm(double radius) {
    if (radius <= 0) return false;
    if (radius >= threshold) return true;
    // A finger: learn from it (quickly at first, then slowly).
    _seen++;
    final k = _seen < 10 ? 1 / _seen : 0.1;
    _finger += (radius - _finger) * k;
    return false;
  }
}

/// Words the canvas shows itself (the board passes them in the teacher's language).
class WhiteboardCanvasLabels {
  const WhiteboardCanvasLabels({
    this.typeHint = 'Type…',
    this.hideRuler = 'Hide ruler',
    this.hideProtractor = 'Hide protractor',
    this.turn = 'Turn',
  });

  final String typeHint;
  final String hideRuler;
  final String hideProtractor;
  final String turn;
}

/// The teacher's whiteboard: the endless, zoomable board of a [WhiteboardController], with
/// raw pointer input (every pen and finger tracked on its own), pinch and pan, the selection's
/// handles, the ruler and protractor, typing, and the laser.
///
/// Equations and notes are written in editors the app provides ([editMath], [editNote]); the
/// app also supplies the actions shown beside a selection ([selectionActions]).
class WhiteboardCanvas extends StatefulWidget {
  const WhiteboardCanvas({
    super.key,
    required this.controller,
    this.inputMode = InputMode.auto,
    this.multiWriter = false,
    this.images,
    this.editMath,
    this.editNote,
    this.selectionActions,
    this.onLongPress,
    this.onPenSeen,
    this.fingerTaps = true,
    this.labels = const WhiteboardCanvasLabels(),
  });

  final WhiteboardController controller;
  final InputMode inputMode;

  /// Every finger writes its own line (interactive panels, where several children write at
  /// once). The board is then moved with the hand tool, the mouse or the zoom buttons.
  final bool multiWriter;

  /// Decoded pictures; the canvas makes its own when null.
  final BoardImages? images;

  /// Opens the equation editor with the current LaTeX (null for a new one); returns the new
  /// LaTeX, '' to delete, or null when cancelled.
  final Future<String?> Function(String? latex)? editMath;

  /// Opens the note editor; returns the text, '' to delete, or null when cancelled.
  final Future<String?> Function(String? text, NoteKind kind)? editNote;

  /// Actions shown under the selection (screen box of the selection).
  final Widget Function(BuildContext context, Rect box)? selectionActions;

  /// A finger held still: the quick menu at this screen point.
  final void Function(Offset screen)? onLongPress;

  /// The first time a pen touches the board (in auto mode, fingers stop writing).
  final VoidCallback? onPenSeen;

  /// A quick tap with two fingers undoes, with three fingers redoes (not with [multiWriter],
  /// where every finger writes). Two fingers held or moved still move and zoom the board.
  final bool fingerTaps;
  final WhiteboardCanvasLabels labels;

  /// The longest a finger tap may last, and how far its fingers may move.
  static const tapTimeout = Duration(milliseconds: 250);
  static const tapSlop = 20.0;

  @override
  State<WhiteboardCanvas> createState() => WhiteboardCanvasState();
}

class WhiteboardCanvasState extends State<WhiteboardCanvas> with SingleTickerProviderStateMixin {
  WhiteboardController get c => widget.controller;
  late final BoardImages _ownImages = BoardImages();
  BoardImages get images => widget.images ?? _ownImages;

  final _palm = PalmDetector();
  bool _penSeen = false;

  /// True once a pen has touched the board (in auto mode fingers then navigate).
  bool get penSeen => _penSeen;

  // Pointers.
  final Map<int, Offset> _touches = {}; // touch pointers, screen positions
  final Set<int> _drawing = {}; // pointers handed to the controller
  final Map<int, Offset> _downAt = {};
  int? _panPointer;
  Offset? _panLast;
  bool _pinching = false;
  ViewState _pinchStart = const ViewState();
  Offset _pinchFocal = Offset.zero;
  double _pinchDistance = 1;
  int? _transformPointer;
  int? _tapPointer; // text, equation and note tools
  double _trackpadScale = 1;

  // A tap with two or three fingers (undo, redo): when the first finger landed, how many
  // fingers joined it in time, and the view before any pinch began.
  Duration? _tapStart;
  int _tapFingers = 0;
  bool _tapLifted = false;
  ViewState? _tapView;
  Timer? _hold;
  Offset? _hover;

  // Typing.
  TextElement? _editing;
  bool _editingIsNew = false;
  final _text = TextEditingController();
  final _textFocus = FocusNode();

  late final Ticker _laserTicker;

  @override
  void initState() {
    super.initState();
    _laserTicker = createTicker((_) {
      if (!c.pruneLaser()) _laserTicker.stop();
      setState(() {});
    });
    c.addListener(_onController);
    c.onToolChanging = commitText;
  }

  @override
  void didUpdateWidget(WhiteboardCanvas oldWidget) {
    final old = oldWidget;
    super.didUpdateWidget(old);
    if (old.controller != widget.controller) {
      old.controller.removeListener(_onController);
      if (old.controller.onToolChanging == commitText) old.controller.onToolChanging = null;
      widget.controller.addListener(_onController);
      widget.controller.onToolChanging = commitText;
    }
  }

  @override
  void dispose() {
    c.removeListener(_onController);
    if (c.onToolChanging == commitText) c.onToolChanging = null;
    _hold?.cancel();
    _laserTicker.dispose();
    _text.dispose();
    _textFocus.dispose();
    _ownImages.dispose();
    super.dispose();
  }

  void _onController() {
    if (c.laser.value.isNotEmpty && !_laserTicker.isActive) _laserTicker.start();
  }

  double get _scale => c.view.value.scale;
  Offset _board(Offset screen) => c.view.value.toBoard(screen);

  InkPoint _point(PointerEvent e) {
    // Mice and most fingers report pressure 0 or 1; only pens give a useful range.
    final pressure = e.kind == PointerDeviceKind.stylus && e.pressureMax > e.pressureMin
        ? ((e.pressure - e.pressureMin) / (e.pressureMax - e.pressureMin)).clamp(0.0, 1.0)
        : 0.5;
    final b = _board(e.localPosition);
    return InkPoint(b.dx, b.dy, pressure);
  }

  bool get _fingersNavigate => switch (widget.inputMode) {
    InputMode.pen => true,
    InputMode.finger => false,
    InputMode.auto => _penSeen,
  };

  // --- Input ----------------------------------------------------------------------------------

  void _onDown(PointerDownEvent e) {
    if (_editing != null) commitText();
    final kind = e.kind;
    final pen = kind == PointerDeviceKind.stylus || kind == PointerDeviceKind.invertedStylus;
    if (pen && !_penSeen) {
      _penSeen = true;
      widget.onPenSeen?.call();
    }
    _downAt[e.pointer] = e.localPosition;

    // The right or middle mouse button moves the board.
    if (kind == PointerDeviceKind.mouse && (e.buttons & (kSecondaryMouseButton | kMiddleMouseButton)) != 0) {
      _startPan(e.pointer, e.localPosition);
      return;
    }

    if (kind == PointerDeviceKind.touch) {
      // A second or third finger that lands at once is a tap or a pinch, never a palm (phones
      // report broad contacts for thumbs).
      final joining = _joinsTap(e);
      // A palm or fist: rubbed out or ignored by the controller, never a finger.
      if (!joining && c.palmMode != PalmMode.off && _palm.isPalm(e.radiusMajor)) {
        _drawing.add(e.pointer);
        c.pointerDown(e.pointer, _point(e), scale: _scale, palm: true, contactRadius: e.radiusMajor / _scale);
        return;
      }
      _touches[e.pointer] = e.localPosition;
      _trackTap(e, joining);
      final navigate = c.tool == BoardTool.hand || _fingersNavigate;
      if (navigate || !widget.multiWriter) {
        if (_touches.length >= 2) {
          // A second finger means "move the board": drop what the first finger began.
          for (final p in _touches.keys) {
            if (_drawing.remove(p)) c.pointerCancel(p);
          }
          if (_tapPointer != null) _tapPointer = null;
          _startPinch();
          return;
        }
        if (navigate) {
          _startPan(e.pointer, e.localPosition);
          _startHold(e.localPosition);
          return;
        }
      }
    }

    // A handle of the selection resizes or turns it, whatever the tool.
    if (_transformPointer == null && _drawing.isEmpty && c.selection.isNotEmpty) {
      final h = handleAt(e.localPosition);
      if (h != null) {
        _transformPointer = e.pointer;
        c.beginTransform(h, _board(e.localPosition));
        return;
      }
    }
    if (c.tool == BoardTool.hand) {
      _startPan(e.pointer, e.localPosition);
      return;
    }
    // A tap on a covered answer shows it (with any tool but the eraser).
    if (c.tool != BoardTool.eraser) {
      final b = _board(e.localPosition);
      final answer = c.hiddenAnswers.where((a) => a.hitTest(b, 0)).firstOrNull;
      if (answer != null) {
        _tapPointer = e.pointer;
        _tapAnswer = answer.id;
        return;
      }
    }
    if (c.tool == BoardTool.text || c.tool == BoardTool.math || c.tool == BoardTool.note) {
      _tapPointer = e.pointer;
      return;
    }
    if (kind == PointerDeviceKind.touch) _startHold(e.localPosition);
    _drawing.add(e.pointer);
    c.pointerDown(e.pointer, _point(e), scale: _scale, forceEraser: kind == PointerDeviceKind.invertedStylus);
  }

  String? _tapAnswer;

  void _onMove(PointerMoveEvent e) {
    if (_touches.containsKey(e.pointer)) _touches[e.pointer] = e.localPosition;
    final down = _downAt[e.pointer];
    if (down != null && (e.localPosition - down).distance > 10) _hold?.cancel();
    if (down != null && _tapStart != null && (e.localPosition - down).distance > WhiteboardCanvas.tapSlop) _tapStart = null;
    if (_pinching) {
      _updatePinch();
      return;
    }
    if (e.pointer == _panPointer) {
      if (_panLast != null) c.panBy(e.localPosition - _panLast!);
      _panLast = e.localPosition;
      return;
    }
    if (e.pointer == _transformPointer) {
      c.updateTransform(_board(e.localPosition));
      return;
    }
    if (_drawing.contains(e.pointer)) {
      c.pointerMove(e.pointer, _point(e));
      if (c.tool == BoardTool.eraser) setState(() => _hover = e.localPosition);
    }
  }

  void _onUp(PointerUpEvent e) {
    _hold?.cancel();
    final down = _downAt.remove(e.pointer);
    final wasTouch = _touches.remove(e.pointer) != null;
    if (wasTouch) _endTap(e);
    if (_pinching) {
      if (_touches.length < 2) {
        _pinching = false;
        // The finger left behind keeps moving the board rather than suddenly drawing.
        if (_touches.length == 1) _startPan(_touches.keys.first, _touches.values.first);
      }
      return;
    }
    if (e.pointer == _panPointer) {
      _panPointer = null;
      _panLast = null;
      return;
    }
    if (e.pointer == _transformPointer) {
      _transformPointer = null;
      c.endTransform();
      return;
    }
    if (e.pointer == _tapPointer) {
      _tapPointer = null;
      final tap = down != null && (e.localPosition - down).distance < 10;
      final answer = _tapAnswer;
      _tapAnswer = null;
      if (!tap) return;
      if (answer != null) {
        c.revealAnswers(id: answer);
      } else {
        _tapWithTool(_board(e.localPosition));
      }
      return;
    }
    if (_drawing.remove(e.pointer)) c.pointerUp(e.pointer);
    if (wasTouch && _touches.isEmpty) _panPointer = null;
  }

  void _onCancel(PointerCancelEvent e) {
    _hold?.cancel();
    _downAt.remove(e.pointer);
    if (_touches.remove(e.pointer) != null) _tapStart = null;
    if (_touches.length < 2) _pinching = false;
    if (e.pointer == _panPointer) _panPointer = null;
    if (e.pointer == _tapPointer) _tapPointer = null;
    if (e.pointer == _transformPointer) {
      _transformPointer = null;
      c.cancelTransform();
    }
    if (_drawing.remove(e.pointer)) c.pointerCancel(e.pointer);
  }

  void _onSignal(PointerSignalEvent e) {
    if (e is PointerScrollEvent) {
      final keys = HardwareKeyboard.instance;
      if (keys.isControlPressed || keys.isMetaPressed) {
        c.zoomBy(math.exp(-e.scrollDelta.dy / 300), e.localPosition);
      } else {
        c.panBy(-e.scrollDelta);
      }
    }
  }

  bool get _tapsOn => widget.fingerTaps && !widget.multiWriter;

  /// Whether this finger joins a finger tap or pinch begun a moment ago.
  bool _joinsTap(PointerDownEvent e) {
    final start = _tapStart;
    return _tapsOn && start != null && _touches.isNotEmpty && !_tapLifted && e.timeStamp - start < WhiteboardCanvas.tapTimeout;
  }

  void _trackTap(PointerDownEvent e, bool joining) {
    if (!_tapsOn) return;
    if (_touches.length == 1) {
      _tapStart = e.timeStamp;
      _tapFingers = 1;
      _tapLifted = false;
      _tapView = c.view.value;
    } else if (joining) {
      _tapFingers = math.max(_tapFingers, _touches.length);
    } else {
      // Too late, or after a finger lifted: a pinch or writing, not a tap.
      _tapStart = null;
    }
  }

  /// A finger of a possible tap lifted; with the last one, two fingers undo and three redo.
  void _endTap(PointerUpEvent e) {
    final start = _tapStart;
    if (start == null) return;
    final held = e.timeStamp - start;
    if (held >= WhiteboardCanvas.tapTimeout * (_tapLifted ? 2 : 1)) {
      _tapStart = null;
      return;
    }
    _tapLifted = true;
    if (_touches.isNotEmpty) return;
    _tapStart = null;
    if (_tapFingers < 2) return;
    // The fingers barely moved, but put back any zoom they made before undoing.
    final view = _tapView;
    if (view != null && c.view.value != view) c.setView(view);
    if (_tapFingers == 2) {
      c.undo();
    } else {
      c.redo();
    }
  }

  void _startPan(int pointer, Offset at) {
    _panPointer = pointer;
    _panLast = at;
  }

  void _startPinch() {
    final pts = _touches.values.take(2).toList();
    _pinching = true;
    _panPointer = null;
    _pinchStart = c.view.value;
    _pinchFocal = (pts[0] + pts[1]) / 2;
    _pinchDistance = math.max(1, (pts[0] - pts[1]).distance);
  }

  void _updatePinch() {
    final pts = _touches.values.take(2).toList();
    if (pts.length < 2) return;
    final focal = (pts[0] + pts[1]) / 2;
    final distance = math.max(1.0, (pts[0] - pts[1]).distance);
    final scale = (_pinchStart.scale * distance / _pinchDistance).clamp(ViewState.minScale, ViewState.maxScale);
    final board = _pinchStart.toBoard(_pinchFocal);
    c.setView(ViewState(scale: scale, offset: focal - board * scale));
  }

  /// Holding a finger still opens the quick menu instead of drawing a dot.
  void _startHold(Offset at) {
    _hold?.cancel();
    if (widget.onLongPress == null) return;
    _hold = Timer(const Duration(milliseconds: 550), () {
      if (_pinching || c.isMovingSelection) return;
      for (final p in _drawing.toList()) {
        c.pointerCancel(p);
      }
      _drawing.clear();
      _panPointer = null;
      widget.onLongPress!(at);
    });
  }

  // --- Selection handles ----------------------------------------------------------------------

  /// The selection's box as drawn (board units).
  Rect? get _selectionBox => c.selectionBounds?.inflate(8 / _scale);

  Map<SelectionHandle, Offset> _handlePoints(Rect r) {
    final small = r.width * _scale < 72 || r.height * _scale < 72;
    return {
      SelectionHandle.topLeft: r.topLeft,
      SelectionHandle.topRight: r.topRight,
      SelectionHandle.bottomLeft: r.bottomLeft,
      SelectionHandle.bottomRight: r.bottomRight,
      if (!small) ...{
        SelectionHandle.top: r.topCenter,
        SelectionHandle.right: r.centerRight,
        SelectionHandle.bottom: r.bottomCenter,
        SelectionHandle.left: r.centerLeft,
      },
      SelectionHandle.rotate: r.topCenter - Offset(0, 40 / _scale),
    };
  }

  /// The handle under the screen point [screen], if any.
  SelectionHandle? handleAt(Offset screen) {
    final r = _selectionBox;
    if (r == null) return null;
    final w = _board(screen);
    final reach = 24 / _scale;
    SelectionHandle? best;
    var bestD = double.infinity;
    for (final e in _handlePoints(r).entries) {
      final d = (e.value - w).distance;
      if (d <= reach && d < bestD) {
        best = e.key;
        bestD = d;
      }
    }
    return best;
  }

  // --- Text, equations and notes --------------------------------------------------------------

  Future<void> _tapWithTool(Offset at) async {
    final r = 6 / _scale;
    switch (c.tool) {
      case BoardTool.text:
        final hit = c.elements.reversed.whereType<TextElement>().where((t) => t.hitTest(at, r)).firstOrNull;
        startText(at, existing: hit);
      case BoardTool.math:
        final edit = widget.editMath;
        if (edit == null) return;
        final hit = c.elements.reversed.whereType<MathElement>().where((m) => m.hitTest(at, r)).firstOrNull;
        final tex = await edit(hit?.latex);
        if (tex == null || !mounted) return;
        if (hit != null) {
          tex.trim().isEmpty ? c.removeIds({hit.id}) : c.replace(hit.copyWith(latex: tex, size: estimateMathSize(tex, hit.fontSize)));
        } else if (tex.trim().isNotEmpty) {
          const fs = 40.0;
          final size = estimateMathSize(tex, fs);
          c.add(MathElement(id: newElementId(), position: at - Offset(0, size.height / 2), latex: tex, color: c.penColor, fontSize: fs, size: size));
        }
      case BoardTool.note:
        final edit = widget.editNote;
        if (edit == null) return;
        final hit = c.elements.reversed.whereType<NoteElement>().where((n) => n.hitTest(at, r)).firstOrNull;
        final kind = hit?.kind ?? c.noteKind;
        final text = await edit(hit?.text, kind);
        if (text == null || !mounted) return;
        if (hit != null) {
          text.trim().isEmpty ? c.removeIds({hit.id}) : c.replace(hit.copyWith(text: text));
        } else if (text.trim().isNotEmpty) {
          final size = kind == NoteKind.card ? const Size(320, 160) : (kind == NoteKind.code ? _codeSize(text) : const Size(280, 200));
          c.add(NoteElement(id: newElementId(), rect: (at - const Offset(20, 20)) & size, text: text, color: c.noteColor, kind: kind));
        }
      default:
        break;
    }
  }

  static Size _codeSize(String code) {
    final lines = code.replaceAll('\t', '    ').split('\n');
    final longest = lines.fold(0, (m, l) => math.max(m, l.length));
    return Size(math.max(240, longest * 11.3 + 34), math.max(100, lines.length * 25.4 + 50));
  }

  /// Opens the typing box at [at] (board units), or on [existing] text to change it.
  void startText(Offset at, {TextElement? existing}) {
    setState(() {
      if (existing != null) {
        _editing = existing;
        _editingIsNew = false;
        _text.text = existing.text;
      } else {
        final fs = c.textSize;
        _editing = TextElement(
          id: newElementId(),
          position: at - Offset(0, fs * 0.65),
          text: '',
          color: c.penColor,
          fontSize: fs,
          size: Size(fs, fs * 1.25),
          font: c.font,
        );
        _editingIsNew = true;
        _text.clear();
      }
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _textFocus.requestFocus();
    });
  }

  /// Puts what was typed on the board (or removes emptied text).
  void commitText() {
    final ed = _editing;
    if (ed == null) return;
    final text = _text.text.trimRight();
    setState(() => _editing = null);
    if (text.isEmpty) {
      if (!_editingIsNew) c.removeIds({ed.id});
      return;
    }
    final el = ed.copyWith(text: text, size: measureBoardText(text, ed.fontSize, bold: ed.bold, font: ed.font));
    _editingIsNew ? c.add(el) : c.replace(el);
  }

  // --- Build ----------------------------------------------------------------------------------

  MouseCursor get _cursor => switch (c.tool) {
    BoardTool.hand => _panPointer != null ? SystemMouseCursors.grabbing : SystemMouseCursors.grab,
    BoardTool.text => SystemMouseCursors.text,
    BoardTool.select => SystemMouseCursors.basic,
    BoardTool.eraser => SystemMouseCursors.none,
    _ => SystemMouseCursors.precise,
  };

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, box) {
        c.viewport = box.biggest;
        return ListenableBuilder(
          listenable: Listenable.merge([c, c.view, c.ruler, c.protractor]),
          builder: (context, _) {
            final view = c.view.value;
            final hidden = <String>{
              if (c.isTransforming) ...c.selection,
              if (_editing != null && !_editingIsNew) _editing!.id,
            };
            return SizedBox.expand(
              child: Stack(
                children: [
                  Positioned.fill(
                    child: MouseRegion(
                      cursor: _cursor,
                      onHover: (e) {
                        if (c.tool == BoardTool.eraser) setState(() => _hover = e.localPosition);
                      },
                      onExit: (_) => setState(() => _hover = null),
                      child: Listener(
                        behavior: HitTestBehavior.opaque,
                        onPointerDown: _onDown,
                        onPointerMove: _onMove,
                        onPointerUp: _onUp,
                        onPointerCancel: _onCancel,
                        onPointerSignal: _onSignal,
                        onPointerPanZoomStart: (_) => _trackpadScale = 1,
                        onPointerPanZoomUpdate: (e) {
                          c.panBy(e.localPanDelta);
                          if (e.scale != _trackpadScale) {
                            c.zoomBy(e.scale / _trackpadScale, e.localPosition);
                            _trackpadScale = e.scale;
                          }
                        },
                        child: ClipRect(
                          child: Stack(
                            children: [
                              Positioned.fill(
                                child: RepaintBoundary(child: CustomPaint(painter: _PaperPainter(c.background, view))),
                              ),
                              // Finished elements repaint only when they change.
                              Positioned.fill(
                                child: RepaintBoundary(
                                  child: CustomPaint(painter: _ElementsPainter(c, view, images, hidden), isComplex: true),
                                ),
                              ),
                              Positioned.fill(
                                child: ValueListenableBuilder<int>(
                                  valueListenable: c.committed,
                                  builder: (context, _, _) => MathLayer(
                                    elements: c.elements,
                                    view: view,
                                    background: c.background,
                                    hidden: hidden,
                                    onMeasured: (e, size) => c.updateSilently(e.copyWith(size: size)),
                                  ),
                                ),
                              ),
                              // Strokes being drawn, the selection and the laser repaint on every move.
                              Positioned.fill(child: CustomPaint(painter: _ActivePainter(this, view))),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                  if (c.ruler.value.visible) Positioned.fill(child: RulerOverlay(controller: c, closeLabel: widget.labels.hideRuler, turnLabel: widget.labels.turn)),
                  if (c.protractor.value.visible)
                    Positioned.fill(child: ProtractorOverlay(controller: c, closeLabel: widget.labels.hideProtractor, turnLabel: widget.labels.turn)),
                  if (_editing != null) _textEditor(view),
                  if (widget.selectionActions != null) _selectionBar(context, view, box.biggest),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _textEditor(ViewState view) {
    final ed = _editing!;
    final p = view.toScreen(ed.position);
    final fs = ed.fontSize * view.scale;
    final accent = Theme.of(context).colorScheme.primary;
    return Positioned(
      left: p.dx - 6,
      top: p.dy - 6,
      child: Container(
        key: const Key('board-text-editor'),
        constraints: BoxConstraints(minWidth: math.max(160.0, fs * 4), maxWidth: math.max(200.0, c.viewport.width - p.dx - 16)),
        padding: const EdgeInsets.all(5),
        decoration: BoxDecoration(border: Border.all(color: accent, width: 1.5), borderRadius: BorderRadius.circular(6)),
        child: IntrinsicWidth(
          child: CallbackShortcuts(
            bindings: {const SingleActivator(LogicalKeyboardKey.escape): commitText},
            child: TextField(
              controller: _text,
              focusNode: _textFocus,
              maxLines: null,
              cursorColor: ed.color,
              style: boardTextStyle(fontSize: fs, color: inkColorFor(ed.color, c.background), bold: ed.bold, font: ed.font),
              decoration: InputDecoration(isCollapsed: true, filled: false, border: InputBorder.none, hintText: widget.labels.typeHint),
              onTapOutside: (_) => commitText(),
            ),
          ),
        ),
      ),
    );
  }

  Widget _selectionBar(BuildContext context, ViewState view, Size viewport) {
    final r = c.selectionBounds;
    if (r == null || c.isMovingSelection || c.isTransforming || _editing != null || c.lasso.isNotEmpty) return const SizedBox.shrink();
    final box = Rect.fromPoints(view.toScreen(r.topLeft), view.toScreen(r.bottomRight));
    return Positioned.fill(child: widget.selectionActions!(context, box));
  }
}

class _PaperPainter extends CustomPainter {
  _PaperPainter(this.background, this.view);

  final BoardBackground background;
  final ViewState view;

  @override
  void paint(Canvas canvas, Size size) {
    canvas
      ..translate(view.offset.dx, view.offset.dy)
      ..scale(view.scale);
    paintBoardBackground(canvas, view.visible(size), background, scale: view.scale);
  }

  @override
  bool shouldRepaint(_PaperPainter old) => old.background != background || old.view != view;
}

class _ElementsPainter extends CustomPainter {
  _ElementsPainter(this.c, this.view, this.images, this.hidden) : super(repaint: Listenable.merge([c.committed, images]));

  final WhiteboardController c;
  final ViewState view;
  final BoardImages images;
  final Set<String> hidden;

  @override
  void paint(Canvas canvas, Size size) {
    canvas
      ..translate(view.offset.dx, view.offset.dy)
      ..scale(view.scale);
    final visible = view.visible(size).inflate(40 / view.scale);
    for (final e in c.page.elements) {
      if (hidden.contains(e.id) || !visible.overlaps(e.bounds)) continue;
      paintElement(canvas, e, c.background, images: images, lengths: c.showLengths, angles: c.showAngles);
    }
  }

  @override
  bool shouldRepaint(_ElementsPainter old) => old.view != view || old.c != c || old.hidden.length != hidden.length || !old.hidden.containsAll(hidden);
}

class _ActivePainter extends CustomPainter {
  _ActivePainter(this.s, this.view) : super(repaint: Listenable.merge([s.c, s.c.laser]));

  final WhiteboardCanvasState s;
  final ViewState view;

  @override
  void paint(Canvas canvas, Size size) {
    final c = s.c;
    final bg = c.background;
    final k = 1 / view.scale;
    final accent = KxColor.accent;
    canvas
      ..save()
      ..translate(view.offset.dx, view.offset.dy)
      ..scale(view.scale);
    for (final st in c.activeStrokes) {
      paintElement(canvas, st, bg, lengths: c.showLengths, angles: c.showAngles);
    }
    final preview = c.transformPreview;
    var selected = c.selectedElements;
    if (preview != null) {
      selected = [for (final e in selected) preview(e)];
      for (final e in selected) {
        paintElement(canvas, e, bg, images: s.images, lengths: c.showLengths, angles: c.showAngles);
      }
    }
    if (selected.isNotEmpty) {
      final labels = (c.showLengths || c.showAngles) && selected.any((e) => e is Stroke && e.shape != null);
      final r = contentBounds(selected).inflate(labels ? 26 : 0).inflate(8 * k);
      final line = Paint()
        ..color = accent
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5 * k;
      canvas.drawRect(r, line);
      if (!c.isMovingSelection) {
        // Handles: white squares on the corners and sides, a round knob to turn it.
        final pts = s._handlePoints(r);
        final knob = pts[SelectionHandle.rotate]!;
        canvas.drawLine(r.topCenter, knob, line);
        for (final e in pts.entries) {
          if (e.key == SelectionHandle.rotate) continue;
          final rr = RRect.fromRectAndRadius(Rect.fromCenter(center: e.value, width: 14 * k, height: 14 * k), Radius.circular(3 * k));
          canvas.drawRRect(rr.shift(Offset(0, k)), Paint()..color = const Color(0x33000000));
          canvas.drawRRect(rr, Paint()..color = Colors.white);
          canvas.drawRRect(rr, line);
        }
        canvas.drawCircle(knob, 12 * k, Paint()..color = accent);
        final arrow = Paint()
          ..color = Colors.white
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.8 * k
          ..strokeCap = StrokeCap.round;
        canvas.drawArc(Rect.fromCircle(center: knob, radius: 5.5 * k), -2.6, 4.2, false, arrow);
      }
    }
    final lasso = c.lasso;
    if (lasso.length > 1) {
      final path = Path()..addPolygon(lasso, false);
      canvas.drawPath(path, Paint()..color = accent.withValues(alpha: 0.08));
      canvas.drawPath(
        path,
        Paint()
          ..color = accent
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2 * k,
      );
    }
    final compass = c.compass;
    if (compass != null) {
      final (centre, radius) = compass;
      canvas.drawLine(
        centre,
        centre + Offset(radius, 0),
        Paint()
          ..color = accent
          ..strokeWidth = 2 * k,
      );
      canvas.drawCircle(centre, 4 * k, Paint()..color = accent);
    }
    paintLaser(canvas, c.laser.value, c.now(), scale: view.scale);
    canvas.restore();

    if (compass != null) {
      final (centre, radius) = compass;
      _pill(canvas, 'r = ${(radius / pxPerCm).toStringAsFixed(1)} cm', view.toScreen(centre + Offset(radius / 2, 0)) - const Offset(0, 22));
    }
    // The angle while turning.
    if (c.isTransforming && c.transformHandle == SelectionHandle.rotate && selected.isNotEmpty) {
      var deg = c.transformAngle.round() % 360;
      if (deg > 180) deg -= 360;
      _pill(canvas, '$deg°', view.toScreen(contentBounds(selected).topCenter) - const Offset(0, 86));
    }
    final hover = s._hover;
    if (c.tool == BoardTool.eraser && hover != null) {
      canvas.drawCircle(hover, c.eraserRadius, Paint()..color = const Color(0x22000000));
      canvas.drawCircle(
        hover,
        c.eraserRadius,
        Paint()
          ..color = const Color(0xAA3A4048)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5,
      );
    }
  }

  void _pill(Canvas canvas, String text, Offset at) {
    final tp = TextPainter(
      text: TextSpan(
        text: text,
        style: const TextStyle(fontSize: 15, color: KxColor.onInverse, fontWeight: FontWeight.w600, fontFamily: KxFonts.family),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    final pill = RRect.fromRectAndRadius(Rect.fromCenter(center: at, width: tp.width + 20, height: tp.height + 10), const Radius.circular(999));
    canvas.drawRRect(pill, Paint()..color = KxColor.inverse);
    tp.paint(canvas, at - Offset(tp.width / 2, tp.height / 2));
  }

  @override
  bool shouldRepaint(_ActivePainter old) => true;
}
