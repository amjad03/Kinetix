import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import 'annotations.dart';
import 'credits.dart';
import 'engine.dart';
import 'laser.dart';
import 'manifest.dart';
import 'protocol.dart';
import 'scenes.dart';
import 'snapshot.dart';
import 'strings.dart';

/// Drives a [Model3dViewer] from outside: take a snapshot, put the laser out.
class Model3dViewerController extends ChangeNotifier {
  _Model3dViewerState? _state;

  /// Whether the model is on screen and answering.
  bool get loaded => _state?._loaded ?? false;

  bool get laser => _state?._laser ?? false;
  set laser(bool on) => _state?._setLaser(on);

  /// The part under the laser tip, if any.
  String? get laserPart => _state?._laserPart;

  /// The part tapped, if any.
  String? get picked => _state?._picked;

  /// A picture of the view as the class sees it, or null if the model is not showing.
  Future<Model3dSnapshot?> snapshot() => _state?._snapshot() ?? Future.value();

  /// What has been written on the model.
  Model3dAnnotations get annotations => _state?._notes ?? Model3dAnnotations.empty;

  void _changed() => notifyListeners();
}

/// A three.js model from the catalogue ([ViewerModelInfo]): turn it, tap a part to name it,
/// show all labels, cut it, take it apart, play its animations, point at it with a laser,
/// and put a picture of it on the board. Fills the space it is given: the controls go
/// beside the model when there is room, under it otherwise.
///
/// With [sceneId] it plays a narrated process scene instead ([ProcessScene]): a timeline of
/// steps, each flying the camera to its subject, lighting up and naming parts, with a
/// caption in English, Hindi or Kannada (read aloud on request); play, pause, step, scrub
/// and change speed below the view. Tapping, labels, the laser, cuts and notes work there too.
///
/// Where the platform has no WebView (tests, Linux, the web) it lists the model's parts (a
/// scene's steps and parts).
class Model3dViewer extends StatefulWidget {
  const Model3dViewer({
    super.key,
    this.modelId = '',
    this.sceneId,
    this.onReadAloud,
    this.variant,
    this.lang,
    this.controller,
    this.onSnapshot,
    this.mirror,
    this.showTitle = true,
    this.annotations,
    this.onAnnotationsChanged,
  }) : assert(modelId != '' || sceneId != null, 'give a modelId or a sceneId');

  /// A viewer model id (heart, orbitals…; see [ViewerModelInfo.all]).
  final String modelId;

  /// A narrated scene to play instead of a model (photosynthesis…; see [ProcessScene.all]).
  final String? sceneId;

  /// Reads a scene's captions aloud as its steps go by (the "Read aloud" switch shows when
  /// there is a voice). Falls back to [Model3dScope.readAloud].
  final Model3dReadAloud? onReadAloud;

  /// The version to show first (an element of "atoms", a molecule of "molecules").
  final String? variant;

  /// en, hi or kn; the ambient locale when null.
  final String? lang;
  final Model3dViewerController? controller;

  /// Shows "Put on board" and receives the picture. Falls back to [Model3dScope].
  final ValueChanged<Model3dSnapshot>? onSnapshot;

  /// The students' screen. Falls back to [Model3dScope].
  final Model3dMirror? mirror;

  /// The model's title above it (off when the host already shows one).
  final bool showTitle;

  /// The notes and drawing to put on the model when it opens (saved with the lesson's
  /// board). When null, a [Model3dScope]'s [Model3dAnnotationStore] gives them, if any.
  final Model3dAnnotations? annotations;

  /// Hears every change to the notes and drawing, to save them.
  final ValueChanged<Model3dAnnotations>? onAnnotationsChanged;

  @override
  State<Model3dViewer> createState() => _Model3dViewerState();
}

enum _Tab { steps, parts, cut, apart, animate, views, notes }

/// The writing tool in hand: pin a note, draw on the model's surface, draw over the view.
enum _Pen { pin, surface, screen }

const _penColors = [Color(0xFFE53935), Color(0xFFF2B33D), Color(0xFF3D8BF2), Color(0xFF2EAD5B), Color(0xFFFFFFFF), Color(0xFF16191E)];

class _Model3dViewerState extends State<Model3dViewer> with SingleTickerProviderStateMixin {
  Viewer3dEngine? _engine;
  StreamSubscription<ViewerEvent>? _sub;
  ViewerManifest? _model;
  bool _loaded = false;
  bool _noViewer = false;
  String? _problem;
  String _lang = 'en';

  // What the teacher has set; the viewer is told each change.
  LabelMode _labels = LabelMode.picked;
  String? _picked;
  final _hidden = <String>{};
  final _shown = <String>{}; // parts hidden at first that the teacher turned on
  String? _slice; // a ready-made cut's id
  CutMode _cutMode = CutMode.off;
  CutAxis _cutAxis = CutAxis.z;
  bool _cutFlip = false;
  double _cutAt = 0; // where a half or a slab is, -0.5..0.5 of the model's size
  double _wedgeAngle = 90;
  double _wedgeTurn = 0;
  double _slabThickness = 0.2;
  double _depth = 0.4;
  bool _sweeping = false;
  int _peel = 0;
  int _peelLayers = 0; // as the page counted them; 0 until it has
  double _explode = 0;
  String? _anim;
  int _step = 0;
  bool _turning = false;
  _Tab _tab = _Tab.parts;
  String? _variant;
  bool _panelOpen = true;

  // The laser.
  bool _laser = false;
  String? _laserPart;
  final _trail = LaserTrail();
  late final _batcher = LaserBatcher(send: (c) => _engine?.send(c), fade: _trail.fade);
  late final Ticker _laserTicker = createTicker(_laserTick);
  final _laserFrame = ValueNotifier(0);
  final _pointers = <int, Offset>{};
  bool _orbiting = false;
  Offset? _orbitAt;
  double _orbitSpread = 0;

  ViewerPart? get _laserPartInfo => _model?.part(_laserPart);

  // A narrated scene: where its timeline is, as the page last said.
  ProcessScene? _scene;
  SceneProgress _progress = const SceneProgress(step: 0, time: 0, total: 0);
  double? _scrubTo; // while the teacher drags the timeline
  bool _narrate = false;
  int _spoken = -1;
  ViewerQuality _quality = ViewerQuality.high;

  /// What the engine opens and notes are kept under: the model, or the scene.
  String get _target => _sceneId != null ? Viewer3dEngine.sceneTarget(_sceneId!) : widget.modelId;

  /// The scene to play: [Model3dViewer.sceneId], or a model id that names one (a picture on
  /// the board links back to its scene as `scene:<id>`).
  String? get _sceneId => widget.sceneId ?? Viewer3dEngine.sceneOf(widget.modelId);

  Model3dReadAloud? get _readAloud => widget.onReadAloud ?? Model3dScope.maybeOf(context)?.readAloud;

  // Notes and drawing.
  Model3dAnnotations _notes = Model3dAnnotations.empty;
  bool _notesShown = true;
  _Pen? _pen;
  Color _penColor = _penColors.first;
  final _penPointers = <int, Offset>{};
  final _penPending = <Offset>[];
  Offset? _penDownAt;
  bool _penDrawing = false;
  Duration? _penSent;
  bool _penOrbiting = false;
  bool _editingPin = false;

  @override
  void initState() {
    super.initState();
    widget.controller?._state = this;
    _engine = Viewer3dEngine.create();
    _sub = _engine?.events.listen(_onEvent);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final lang = widget.lang ?? viewerLangOf(context);
    if (_model == null && _problem == null) {
      _lang = lang;
      _open();
    } else if (lang != _lang) {
      setState(() => _lang = lang);
      _engine?.send(ViewerCommands.lang(lang));
    }
  }

  @override
  void didUpdateWidget(Model3dViewer old) {
    super.didUpdateWidget(old);
    if (old.controller != widget.controller) {
      old.controller?._state = null;
      widget.controller?._state = this;
    }
    if (widget.lang != null && widget.lang != _lang) {
      _lang = widget.lang!;
      _engine?.send(ViewerCommands.lang(_lang));
    }
    final given = widget.annotations;
    if (given != null && given != old.annotations && given != _notes) {
      _notes = given;
      _engine?.send(ViewerCommands.setNotes(given));
    }
  }

  Model3dAnnotationStore? get _store => Model3dScope.maybeOf(context)?.annotations;

  Future<void> _open() async {
    final notes = widget.annotations ?? _store?.of(_target) ?? Model3dAnnotations.empty;
    setState(() {
      _problem = null;
      _loaded = false;
      _notes = notes;
    });
    try {
      final scene = ProcessScene.byId(_sceneId);
      if (_sceneId != null && scene == null) throw StateError('no scene $_sceneId');
      final m = scene?.toManifest() ?? await ViewerManifest.load(widget.modelId);
      if (!mounted) return;
      final start = m.variants.any((v) => v.id == widget.variant) ? widget.variant : m.variants.firstOrNull?.id;
      setState(() {
        _model = m;
        _scene = scene;
        _variant = start;
        _noViewer = _engine == null;
        if (scene != null) {
          _tab = _Tab.steps;
          _progress = SceneProgress(step: 0, time: 0, total: scene.seconds, playing: true);
        }
      });
      if (_engine == null) return;
      await _engine!.open(_target, lang: _lang);
      if (start != null && start != m.variants.firstOrNull?.id) _engine!.send(ViewerCommands.variant(start));
      if (notes.isNotEmpty) _engine!.send(ViewerCommands.setNotes(notes));
    } catch (e) {
      debugPrint('3D model $_target could not be opened: $e');
      if (mounted) setState(() => _problem = Viewer3dStrings(_lang).couldNotOpen);
    }
  }

  void _onEvent(ViewerEvent e) {
    if (!mounted) return;
    switch (e.type) {
      case 'loaded':
        setState(() => _loaded = true);
        _engine!.send(ViewerCommands.labels(_labels));
        if (_quality != ViewerQuality.high) _engine!.send(ViewerCommands.quality(_quality));
        _checkMirror();
        widget.controller?._changed();
      case 'scene':
        final p = e.scene!;
        setState(() => _progress = p);
        if (_narrate && p.step != _spoken) _speakStep(p.step);
      case 'frame':
        final jpg = e.image;
        if (_mirroring && jpg != null) _mirror?.send(jpg);
      case 'pick':
        setState(() => _picked = e.part);
        widget.controller?._changed();
      case 'laser':
        if (_laser || e.part == null) setState(() => _laserPart = e.part);
        widget.controller?._changed();
      case 'snapshot':
        final png = e.image;
        final m = _model;
        _snapping?.complete(png == null || m == null ? null : Model3dSnapshot(png: png, modelId: _target, title: m.title.of(_lang), credit: m.credit, annotations: _notes));
        _snapping = null;
      case 'autoRotate':
        setState(() => _turning = e.data['on'] == true);
      case 'cut':
        setState(() {
          if (e.data['mode'] == 'peel') {
            _peelLayers = (e.data['layers'] as num?)?.toInt() ?? 0;
            _peel = (e.data['peel'] as num?)?.toInt() ?? _peel;
          }
          if (e.data['done'] == true) {
            _sweeping = false;
            _depth = (e.data['depth'] as num?)?.toDouble() ?? _depth;
          }
        });
      case 'annotations':
        final data = e.data['data'];
        if (data is Map) {
          setState(() => _notes = Model3dAnnotations.fromJson(data));
          widget.onAnnotationsChanged?.call(_notes);
          _store?.put(_target, _notes);
          widget.controller?._changed();
        }
        if (e.data['pin'] case final String id) _editPin(id, isNew: true);
      case 'noteMissed':
        ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(Viewer3dStrings(_lang).noteMissed)));
      case 'notePicked':
        if (e.data['id'] case final String id) _editPin(id);
      case 'error':
        debugPrint('3D viewer: ${e.message}');
        if (e.data['noViewer'] == true) {
          setState(() => _noViewer = true);
        } else if (!_loaded) {
          setState(() => _problem = Viewer3dStrings(_lang).couldNotOpen);
        }
    }
  }

  // ------------------------------------------------------------ projector

  Model3dMirror? get _mirror => widget.mirror ?? Model3dScope.maybeOf(context)?.mirror;

  /// Whether the viewer is sending pictures for the students' screen. A students' screen
  /// can be plugged in (or blanked) while the model is open.
  bool _mirroring = false;
  Timer? _mirrorCheck;

  void _checkMirror() {
    final m = _mirror;
    if (m == null || _engine == null) return;
    _mirrorCheck ??= Timer.periodic(const Duration(seconds: 2), (_) {
      if (mounted) _checkMirror();
    });
    final want = m.wanted();
    if (want == _mirroring) return;
    _mirroring = want;
    _engine!.send(ViewerCommands.mirror(want));
    if (!want) m.send(null);
  }

  @override
  void dispose() {
    _mirrorCheck?.cancel();
    if (_mirroring) _mirror?.send(null);
    if (widget.controller?._state == this) widget.controller!._state = null;
    _placedTimer?.cancel();
    _snapping?.complete(null);
    _laserTicker.dispose();
    _laserFrame.dispose();
    _sub?.cancel();
    _engine?.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------- actions

  void _send(Map<String, dynamic> c) => _engine?.send(c);

  void _setLabels(LabelMode m) {
    setState(() => _labels = m);
    _send(ViewerCommands.labels(m));
  }

  void _pick(String? id) {
    setState(() => _picked = id);
    _send(ViewerCommands.pick(id));
  }

  void _sendVisibility() => _send(ViewerCommands.hide(_hidden, _shown));

  bool _visible(ViewerPart p) => p.hiddenAtStart ? _shown.contains(p.id) : !_hidden.contains(p.id);

  void _toggle(ViewerPart p) {
    setState(() {
      if (p.hiddenAtStart) {
        _shown.contains(p.id) ? _shown.remove(p.id) : _shown.add(p.id);
      } else {
        _hidden.contains(p.id) ? _hidden.remove(p.id) : _hidden.add(p.id);
      }
      if (!_visible(p) && _picked == p.id) _picked = null;
    });
    _sendVisibility();
  }

  void _toggleGroup(String group) {
    final parts = _model!.inGroup(group, _variant);
    final anyOn = parts.any(_visible);
    setState(() {
      for (final p in parts) {
        if (_visible(p) != anyOn) continue;
        if (p.hiddenAtStart) {
          anyOn ? _shown.remove(p.id) : _shown.add(p.id);
        } else {
          anyOn ? _hidden.add(p.id) : _hidden.remove(p.id);
        }
      }
    });
    _sendVisibility();
  }

  void _only(ViewerPart p) {
    setState(() {
      _hidden
        ..clear()
        ..addAll([
          for (final q in _model!.parts)
            if (q.id != p.id && !q.hiddenAtStart && (q.variant == null || q.variant == _variant)) q.id,
        ]);
      _shown
        ..clear()
        ..addAll([if (p.hiddenAtStart) p.id]);
    });
    _sendVisibility();
  }

  void _showAll() {
    setState(() {
      _hidden.clear();
      _shown.clear();
    });
    _sendVisibility();
  }

  void _setVariant(String id) {
    setState(() {
      _variant = id;
      if (_model!.part(_picked)?.variant case final v? when v != id) _picked = null;
    });
    _send(ViewerCommands.variant(id));
  }

  /// A ready-made cut from the model's manifest; null closes any cut.
  void _setSlice(ViewerSlice? s) {
    setState(() {
      _slice = s?.id;
      _cutMode = CutMode.off;
      _sweeping = false;
      _peel = 0;
    });
    if (s == null) {
      _send(ViewerCommands.slice());
    } else {
      _send(ViewerCommands.slice(id: s.id, normal: s.normal, offset: s.offset, normal2: s.normal2));
      final v = _model!.view(s.view);
      if (v != null) _send(ViewerCommands.view(v.dir));
    }
  }

  void _sendCut({bool play = false}) => _send(ViewerCommands.cut(
    _cutMode,
    axis: _cutAxis,
    flip: _cutFlip,
    at: _cutAt,
    angle: _wedgeAngle,
    turn: _wedgeTurn,
    thickness: _slabThickness,
    depth: _depth,
    peel: _peel,
    play: play,
  ));

  static const _across = {CutAxis.x: (CutAxis.z, CutAxis.y), CutAxis.y: (CutAxis.x, CutAxis.z), CutAxis.z: (CutAxis.x, CutAxis.y)};
  static List<double> _unit(CutAxis a) => [for (final k in CutAxis.values) k == a ? 1.0 : 0.0];

  /// Where to look from to see the cut faces of the cut now set.
  List<double>? _cutView() {
    final a = _unit(_cutAxis);
    switch (_cutMode) {
      case CutMode.half || CutMode.depth:
        final s = _cutFlip ? -1.0 : 1.0;
        final (u, v) = _across[_cutAxis]!;
        return [for (var i = 0; i < 3; i++) s * a[i] + 0.25 * _unit(u)[i] + 0.2 * _unit(v)[i]];
      case CutMode.wedge:
        // Into the slice: the middle of the wedge, a little along the axis.
        final (u, v) = _across[_cutAxis]!;
        final t = (45 + _wedgeTurn) * math.pi / 180;
        return [for (var i = 0; i < 3; i++) math.cos(t) * _unit(u)[i] + math.sin(t) * _unit(v)[i] + 0.55 * a[i]];
      case CutMode.slab:
        final (u, v) = _across[_cutAxis]!;
        return [for (var i = 0; i < 3; i++) a[i] + 0.45 * _unit(u)[i] + 0.25 * _unit(v)[i]];
      case CutMode.off || CutMode.peel:
        return null;
    }
  }

  void _setCutMode(CutMode m) {
    if (m == CutMode.off) return _setSlice(null);
    setState(() {
      _cutMode = m;
      _slice = null;
      _sweeping = false;
      if (m == CutMode.peel) _peel = math.min(1, math.max(_peelLayers - 1, 1));
      if (m == CutMode.half || m == CutMode.slab) _cutAt = 0;
    });
    _sendCut();
    final v = _cutView();
    if (v != null) _send(ViewerCommands.view(v));
  }

  void _setCutAxis(CutAxis a) {
    setState(() => _cutAxis = a);
    _sendCut();
    final v = _cutView();
    if (v != null) _send(ViewerCommands.view(v));
  }

  /// A setting of the cut changed (a slider); the view stays where it is.
  void _adjustCut(VoidCallback change) {
    setState(() {
      change();
      _sweeping = false;
    });
    _sendCut();
  }

  void _flipCut() {
    setState(() {
      _cutFlip = !_cutFlip;
      _cutAt = -_cutAt;
    });
    _sendCut();
    final v = _cutView();
    if (v != null) _send(ViewerCommands.view(v));
  }

  void _sweep() {
    setState(() => _sweeping = true);
    _sendCut(play: true);
  }

  void _setExplode(double v) {
    setState(() => _explode = v);
    _send(ViewerCommands.explode(v));
  }

  void _animate(ViewerAnimation? a) {
    setState(() {
      _anim = a?.id;
      _step = 0;
    });
    _send(ViewerCommands.animate(a?.id));
  }

  void _goToStep(int s) {
    final a = _model?.animation(_anim);
    if (a == null || a.steps.isEmpty) return;
    final n = s.clamp(0, a.steps.length - 1);
    setState(() => _step = n);
    _send(ViewerCommands.step(n));
  }

  void _turn(bool on) {
    setState(() => _turning = on);
    _send(ViewerCommands.autoRotate(on));
  }

  void _reset() {
    setState(() {
      _slice = null;
      _cutMode = CutMode.off;
      _sweeping = false;
      _peel = 0;
      _explode = 0;
      _anim = null;
      _step = 0;
      _picked = null;
      _hidden.clear();
      _shown.clear();
    });
    _send(ViewerCommands.reset());
    _send(ViewerCommands.pick(null));
    _sendVisibility();
  }

  // ------------------------------------------------------------------ scene

  void _sceneOp(SceneOp op) {
    // Answer at once; the page's next `scene` event confirms.
    if (op == SceneOp.toggle) setState(() => _progress = SceneProgress(step: _progress.step, time: _progress.time, total: _progress.total, playing: !_progress.playing, speed: _progress.speed));
    _send(ViewerCommands.scene(op));
  }

  void _sceneStep(int i) => _send(ViewerCommands.sceneStep(i));

  void _setSpeed(double v) {
    setState(() => _progress = SceneProgress(step: _progress.step, time: _progress.time, total: _progress.total, playing: _progress.playing, speed: v));
    _send(ViewerCommands.sceneSpeed(v));
  }

  void _setQuality(ViewerQuality q) {
    setState(() => _quality = q);
    _send(ViewerCommands.quality(q));
  }

  void _setNarrate(bool on) {
    setState(() => _narrate = on);
    if (on) _speakStep(_progress.step);
  }

  void _speakStep(int i) {
    final sc = _scene;
    final read = _readAloud;
    if (sc == null || read == null || i < 0 || i >= sc.steps.length) return;
    _spoken = i;
    read(sc.steps[i].spoken(_lang), _lang);
  }

  // ------------------------------------------------------------------ laser

  Duration _now() => SchedulerBinding.instance.currentSystemFrameTimeStamp;

  void _setLaser(bool on) {
    if (on == _laser) return;
    if (on && _pen != null) _setPen(null);
    setState(() {
      _laser = on;
      if (!on) {
        _trail.clear();
        _laserPart = null;
        _pointers.clear();
        _orbiting = false;
      }
    });
    if (!on) {
      _batcher.off();
      _laserTicker.stop();
      _laserFrame.value++;
    }
    widget.controller?._changed();
  }

  void _laserTick(Duration _) {
    final now = _now();
    _trail.prune(now);
    _batcher.tick(now);
    _laserFrame.value++;
    if (_trail.isEmpty && !_trail.drawing && !_batcher.hasPending) _laserTicker.stop();
  }

  void _wake() {
    if (!_laserTicker.isActive) _laserTicker.start();
  }

  Offset _norm(Offset p, Size size) => Offset(p.dx / math.max(1, size.width), p.dy / math.max(1, size.height));

  (Offset, double) _twoFingers() {
    final ps = _pointers.values.take(2).toList();
    return ((ps[0] + ps[1]) / 2, (ps[0] - ps[1]).distance);
  }

  void _laserDown(PointerDownEvent e, Size size) {
    _pointers[e.pointer] = e.localPosition;
    final now = _now();
    // A mouse's right button turns the model, like a second finger.
    final mouseTurn = e.kind == PointerDeviceKind.mouse && (e.buttons & kSecondaryMouseButton) != 0;
    if (_pointers.length == 1 && !mouseTurn) {
      _orbiting = false;
      _trail.down(e.localPosition, now);
      _batcher.add(_norm(e.localPosition, size), now);
    } else {
      if (_trail.drawing) {
        _trail.up();
        _batcher.up(now);
      }
      _orbiting = true;
      if (_pointers.length >= 2) {
        final (at, spread) = _twoFingers();
        _orbitAt = at;
        _orbitSpread = spread;
      } else {
        _orbitAt = e.localPosition;
        _orbitSpread = 0;
      }
    }
    _wake();
  }

  void _laserMove(PointerMoveEvent e, Size size) {
    if (!_pointers.containsKey(e.pointer)) return;
    _pointers[e.pointer] = e.localPosition;
    if (_orbiting) {
      final (at, spread) = _pointers.length >= 2 ? _twoFingers() : (e.localPosition, 0.0);
      final cmd = twoFingerOrbit(from: _orbitAt ?? at, to: at, spreadFrom: _orbitSpread, spreadTo: spread, height: size.height);
      if (cmd != null) {
        _send(cmd);
        _orbitAt = at;
        _orbitSpread = spread;
      }
      return;
    }
    final now = _now();
    _trail.move(e.localPosition, now);
    _batcher.add(_norm(e.localPosition, size), now);
    _wake();
  }

  void _laserUp(PointerEvent e) {
    _pointers.remove(e.pointer);
    if (_pointers.isNotEmpty) return;
    if (_trail.drawing) {
      _trail.up();
      _batcher.up(_now());
    }
    _orbiting = false;
    _wake();
  }

  void _laserScroll(PointerSignalEvent e) {
    if (e is PointerScrollEvent) _send(ViewerCommands.orbit(scale: e.scrollDelta.dy < 0 ? 1.1 : 1 / 1.1));
  }

  // ------------------------------------------------------------------ notes

  void _setPen(_Pen? pen) {
    if (pen != null && _laser) _setLaser(false);
    _endStroke();
    setState(() {
      _pen = pen;
      _penPointers.clear();
      _penOrbiting = false;
      if (pen != null && !_notesShown) {
        _notesShown = true;
        _send(ViewerCommands.showNotes(true));
      }
    });
  }

  void _penDown(PointerDownEvent e, Size size) {
    _penPointers[e.pointer] = e.localPosition;
    final mouseTurn = e.kind == PointerDeviceKind.mouse && (e.buttons & kSecondaryMouseButton) != 0;
    if (_penPointers.length == 1 && !mouseTurn) {
      _penOrbiting = false;
      _penDownAt = e.localPosition;
      if (_pen != _Pen.pin) {
        _penDrawing = true;
        _penPending.add(_norm(e.localPosition, size));
        _flushStroke();
      }
      return;
    }
    // A second finger (or the right mouse button) turns the model instead.
    _endStroke();
    _penDownAt = null;
    _penOrbiting = true;
    if (_penPointers.length >= 2) {
      final ps = _penPointers.values.take(2).toList();
      _orbitAt = (ps[0] + ps[1]) / 2;
      _orbitSpread = (ps[0] - ps[1]).distance;
    } else {
      _orbitAt = e.localPosition;
      _orbitSpread = 0;
    }
  }

  void _penMove(PointerMoveEvent e, Size size) {
    if (!_penPointers.containsKey(e.pointer)) return;
    _penPointers[e.pointer] = e.localPosition;
    if (_penOrbiting) {
      final ps = _penPointers.values.take(2).toList();
      final (at, spread) = ps.length >= 2 ? ((ps[0] + ps[1]) / 2, (ps[0] - ps[1]).distance) : (e.localPosition, 0.0);
      final cmd = twoFingerOrbit(from: _orbitAt ?? at, to: at, spreadFrom: _orbitSpread, spreadTo: spread, height: size.height);
      if (cmd != null) {
        _send(cmd);
        _orbitAt = at;
        _orbitSpread = spread;
      }
      return;
    }
    if (!_penDrawing) return;
    _penPending.add(_norm(e.localPosition, size));
    final now = _now();
    if (_penSent == null || now - _penSent! >= const Duration(milliseconds: 33)) _flushStroke();
  }

  void _penUp(PointerEvent e, Size size) {
    final was = _penPointers.remove(e.pointer);
    if (_penPointers.isNotEmpty) return;
    if (!_penOrbiting && _pen == _Pen.pin && was != null && _penDownAt != null && (e.localPosition - _penDownAt!).distance < 12 && e is PointerUpEvent) {
      _send(ViewerCommands.pinNote(_norm(e.localPosition, size), color: _penColor));
    }
    _penDownAt = null;
    _endStroke();
    _penOrbiting = false;
  }

  void _flushStroke({bool up = false}) {
    if (_penPending.isEmpty && !up) return;
    _send(ViewerCommands.stroke(List.of(_penPending), surface: _pen == _Pen.surface, color: _penColor, up: up));
    _penPending.clear();
    _penSent = _now();
  }

  void _endStroke() {
    if (!_penDrawing) return;
    _flushStroke(up: true);
    _penDrawing = false;
  }

  void _showNotes(bool on) {
    setState(() => _notesShown = on);
    _send(ViewerCommands.showNotes(on));
  }

  void _deleteNote(String id) => _send(ViewerCommands.deleteNote(id));

  /// Takes away the last line drawn (on the model or over the view).
  void _undoStroke() {
    final last = [..._notes.strokes, ..._notes.ink];
    if (last.isEmpty) return;
    // Ids are made in time order by the page.
    last.sort((a, b) => a.id.substring(1).compareTo(b.id.substring(1)));
    _deleteNote(last.last.id);
  }

  Future<void> _clearNotes() async {
    final s = Viewer3dStrings(_lang);
    final sure = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        content: Text('${s.clearNotes}?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(s.close)),
          FilledButton(key: const ValueKey('notes-clear-yes'), onPressed: () => Navigator.pop(context, true), child: Text(s.clearNotes)),
        ],
      ),
    );
    if (sure == true) _send(ViewerCommands.clearNotes());
  }

  /// Writes or changes the text and colour of pin [id]; a new pin opens here at once.
  Future<void> _editPin(String id, {bool isNew = false}) async {
    final pin = _notes.pin(id);
    if (pin == null || _editingPin || !mounted) return;
    _editingPin = true;
    final s = Viewer3dStrings(_lang);
    final text = TextEditingController(text: pin.text);
    var colour = pin.color;
    final result = await showDialog<Object>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, set) => AlertDialog(
          key: const ValueKey('pin-editor'),
          title: Text(s.note),
          content: SizedBox(
            width: 360,
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              TextField(
                key: const ValueKey('pin-text'),
                controller: text,
                autofocus: true,
                minLines: 1,
                maxLines: 4,
                decoration: InputDecoration(hintText: s.noteText),
              ),
              const SizedBox(height: 14),
              Text(s.colour, style: Theme.of(context).textTheme.labelMedium),
              const SizedBox(height: 6),
              _swatches(colour, (c) => set(() => colour = c)),
            ]),
          ),
          actions: [
            TextButton.icon(key: const ValueKey('pin-delete'), onPressed: () => Navigator.pop(context, 'delete'), icon: const Icon(Icons.delete_outline), label: Text(s.delete)),
            FilledButton(key: const ValueKey('pin-save'), onPressed: () => Navigator.pop(context, (text.text.trim(), colour)), child: Text(s.save)),
          ],
        ),
      ),
    );
    _editingPin = false;
    if (!mounted) return;
    if (result == 'delete') {
      _deleteNote(id);
    } else if (result case (final String t, final Color c) when t != pin.text || c != pin.color) {
      _send(ViewerCommands.updateNote(id, text: t, color: c));
    }
  }

  Widget _swatches(Color selected, ValueChanged<Color> onPick) => Wrap(spacing: 6, runSpacing: 6, children: [
    for (final c in _penColors)
      InkWell(
        key: ValueKey('swatch-${colorHex(c)}'),
        customBorder: const CircleBorder(),
        onTap: () => onPick(c),
        child: Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(
            color: c,
            shape: BoxShape.circle,
            border: Border.all(color: c == selected ? Theme.of(context).colorScheme.primary : const Color(0x66888888), width: c == selected ? 3 : 1),
          ),
        ),
      ),
  ]);

  // --------------------------------------------------------------- snapshot

  Completer<Model3dSnapshot?>? _snapping;
  bool _placed = false;
  Timer? _placedTimer;

  Future<Model3dSnapshot?> _snapshot() {
    if (!_loaded || _engine == null) return Future.value();
    if (_snapping != null) return _snapping!.future;
    final c = _snapping = Completer<Model3dSnapshot?>();
    _send(ViewerCommands.snapshot());
    return c.future.timeout(const Duration(seconds: 10), onTimeout: () {
      if (identical(_snapping, c)) _snapping = null;
      return null;
    });
  }

  ValueChanged<Model3dSnapshot>? get _onSnapshot => widget.onSnapshot ?? Model3dScope.maybeOf(context)?.onSnapshot;

  Future<void> _toBoard() async {
    final s = await _snapshot();
    if (!mounted) return;
    if (s == null) {
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(Viewer3dStrings(_lang).snapshotFailed)));
      return;
    }
    _onSnapshot?.call(s);
    _placedTimer?.cancel();
    setState(() => _placed = true);
    // For a moment the button says so (a message at the bottom would cover the step card).
    _placedTimer = Timer(const Duration(seconds: 2), () {
      if (mounted) setState(() => _placed = false);
    });
  }

  // ---------------------------------------------------------------- layout

  @override
  Widget build(BuildContext context) {
    final s = Viewer3dStrings(_lang);
    final m = _model;
    final cs = Theme.of(context).colorScheme;
    if (_problem != null) return _message(s, _problem!, retry: true);
    if (m == null) return _message(s, s.opening, busy: true);
    if (_noViewer) return _PartsList(model: m, lang: _lang, variant: _variant, strings: s, scene: _scene);
    return LayoutBuilder(builder: (context, c) {
      final wide = c.maxWidth >= 900;
      final stage = Stack(key: const ValueKey('model3d-stage'), children: [
        Positioned.fill(child: _engine!.view()),
        if (_laser) Positioned.fill(child: _laserLayer()),
        if (_pen != null && _loaded) Positioned.fill(child: _penLayer()),
        if (!_loaded) Positioned.fill(child: _message(s, s.opening, busy: true)),
        if (_loaded) ..._overlays(m, s, wide),
      ]);
      final toolbar = _toolbar(m, s, wide);
      return ColoredBox(
        color: cs.surface,
        child: wide
            ? Row(children: [
                Expanded(child: Column(children: [toolbar, Expanded(child: ClipRect(child: stage))])),
                SizedBox(width: 340, child: _panel(m, s)),
              ])
            : Column(children: [
                toolbar,
                Expanded(child: ClipRect(child: stage)),
                if (m.variants.isNotEmpty) _variants(m),
                _tabBar(s, compact: true),
                if (_panelOpen) SizedBox(height: (c.maxHeight * 0.34).clamp(150.0, 320.0), child: _tabBody(m, s)),
              ]),
      );
    });
  }

  Widget _message(Viewer3dStrings s, String text, {bool busy = false, bool retry = false}) {
    final cs = Theme.of(context).colorScheme;
    return ColoredBox(
      color: busy ? const Color(0xFF16191E) : cs.surface,
      child: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          if (busy) const CircularProgressIndicator() else Icon(Icons.view_in_ar_outlined, size: 44, color: cs.onSurfaceVariant),
          const SizedBox(height: 16),
          Text(text, textAlign: TextAlign.center, style: TextStyle(color: busy ? const Color(0xFFB8BEC6) : cs.onSurface)),
          if (retry) ...[
            const SizedBox(height: 12),
            FilledButton(onPressed: _open, child: Text(s.tryAgain)),
          ],
        ]),
      ),
    );
  }

  Widget _toolbar(ViewerManifest m, Viewer3dStrings s, bool wide) {
    final cs = Theme.of(context).colorScheme;
    // Phones: tighter buttons, so the toolbar fits 360 pixels.
    final density = wide ? null : VisualDensity.compact;
    return Container(
      height: 56,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(color: cs.surfaceContainer, border: Border(bottom: BorderSide(color: cs.outlineVariant))),
      child: Row(children: [
        if (widget.showTitle)
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Text(m.title.of(_lang), maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleMedium),
            ),
          )
        else
          const Spacer(),
        _labelSwitch(s, wide),
        const SizedBox(width: 4),
        IconButton(
          key: const ValueKey('model3d-write'),
          tooltip: s.write,
          visualDensity: density,
          isSelected: _pen != null,
          style: _pen != null ? IconButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.primary, foregroundColor: Theme.of(context).colorScheme.onPrimary) : null,
          icon: const Icon(Icons.edit_outlined),
          onPressed: _loaded ? () => _setPen(_pen == null ? _Pen.pin : null) : null,
        ),
        IconButton(
          key: const ValueKey('model3d-laser'),
          tooltip: s.laser,
          visualDensity: density,
          isSelected: _laser,
          style: _laser ? IconButton.styleFrom(backgroundColor: const Color(0xFFE53935), foregroundColor: Colors.white) : null,
          icon: const Icon(Icons.highlight_outlined),
          onPressed: _loaded ? () => _setLaser(!_laser) : null,
        ),
        IconButton(key: const ValueKey('model3d-reset'), tooltip: s.startAgain, visualDensity: density, icon: const Icon(Icons.restart_alt), onPressed: _loaded ? _reset : null),
        IconButton(key: const ValueKey('model3d-about'), tooltip: s.about, visualDensity: density, icon: const Icon(Icons.info_outline), onPressed: () => showModel3dCredits(context, model: m, lang: _lang)),
        if (_onSnapshot != null) ...[
          const SizedBox(width: 4),
          wide
              ? FilledButton.icon(
                  key: const ValueKey('model3d-board'),
                  onPressed: _loaded && _snapping == null ? _toBoard : null,
                  icon: Icon(_placed ? Icons.check : Icons.add_photo_alternate_outlined),
                  label: Text(_placed ? s.onBoard : s.putOnBoard),
                )
              : IconButton.filled(
                  key: const ValueKey('model3d-board'),
                  tooltip: _placed ? s.onBoard : s.putOnBoard,
                  onPressed: _loaded && _snapping == null ? _toBoard : null,
                  icon: Icon(_placed ? Icons.check : Icons.add_photo_alternate_outlined),
                ),
        ],
      ]),
    );
  }

  Widget _labelSwitch(Viewer3dStrings s, bool wide) {
    final cs = Theme.of(context).colorScheme;
    final items = [
      (LabelMode.none, Icons.label_off_outlined, s.labelsNone),
      (LabelMode.picked, Icons.touch_app_outlined, s.labelsPicked),
      (LabelMode.all, Icons.label_outline, s.labelsAll),
    ];
    return Container(
      decoration: BoxDecoration(color: cs.surfaceContainerHighest, borderRadius: BorderRadius.circular(10)),
      padding: const EdgeInsets.all(3),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        for (final (mode, icon, tip) in items)
          Tooltip(
            message: tip,
            child: InkWell(
              key: ValueKey('labels-${mode.name}'),
              borderRadius: BorderRadius.circular(8),
              onTap: _loaded ? () => _setLabels(mode) : null,
              child: Container(
                padding: EdgeInsets.symmetric(horizontal: wide ? 12 : 8, vertical: 8),
                decoration: BoxDecoration(color: _labels == mode ? cs.primary : null, borderRadius: BorderRadius.circular(8)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(icon, size: 18, color: _labels == mode ? cs.onPrimary : cs.onSurface),
                  if (wide && mode == LabelMode.all) ...[
                    const SizedBox(width: 6),
                    Text(s.labels, style: TextStyle(fontWeight: FontWeight.w600, color: _labels == mode ? cs.onPrimary : cs.onSurface)),
                  ],
                ]),
              ),
            ),
          ),
      ]),
    );
  }

  /// Over the model while the laser is out: one finger draws, two turn the model.
  Widget _laserLayer() => LayoutBuilder(
    builder: (context, box) => Listener(
      key: const ValueKey('model3d-laser-layer'),
      behavior: HitTestBehavior.opaque,
      onPointerDown: (e) => _laserDown(e, box.biggest),
      onPointerMove: (e) => _laserMove(e, box.biggest),
      onPointerUp: _laserUp,
      onPointerCancel: _laserUp,
      onPointerSignal: _laserScroll,
      child: CustomPaint(painter: LaserPainter(_trail, _now, repaint: _laserFrame), size: Size.infinite),
    ),
  );

  /// Over the model while writing: one finger pins or draws, two turn the model.
  Widget _penLayer() => LayoutBuilder(
    builder: (context, box) => Listener(
      key: const ValueKey('model3d-pen-layer'),
      behavior: HitTestBehavior.opaque,
      onPointerDown: (e) => _penDown(e, box.biggest),
      onPointerMove: (e) => _penMove(e, box.biggest),
      onPointerUp: (e) => _penUp(e, box.biggest),
      onPointerCancel: (e) => _penUp(e, box.biggest),
      onPointerSignal: _laserScroll,
      child: const SizedBox.expand(),
    ),
  );

  /// The writing tools over the model: pin, draw on it, draw over the view; colours; undo; done.
  Widget _penPalette(Viewer3dStrings s) {
    final cs = Theme.of(context).colorScheme;
    Widget tool(_Pen p, IconData icon, String tip) => IconButton(
      key: ValueKey('pen-${p.name}'),
      tooltip: tip,
      isSelected: _pen == p,
      style: _pen == p ? IconButton.styleFrom(backgroundColor: cs.primary, foregroundColor: cs.onPrimary) : null,
      icon: Icon(icon),
      onPressed: () => _setPen(p),
    );
    return Material(
      key: const ValueKey('pen-palette'),
      color: cs.surfaceContainerHigh.withValues(alpha: 0.96),
      elevation: 4,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.all(4),
        child: Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 2, runSpacing: 4, children: [
          tool(_Pen.pin, Icons.push_pin_outlined, s.toolPin),
          tool(_Pen.surface, Icons.gesture, s.toolSurface),
          tool(_Pen.screen, Icons.draw_outlined, s.toolScreen),
          const SizedBox(width: 6),
          _swatches(_penColor, (c) => setState(() => _penColor = c)),
          const SizedBox(width: 6),
          IconButton(key: const ValueKey('pen-undo'), tooltip: s.undo, icon: const Icon(Icons.undo), onPressed: _notes.strokes.isEmpty && _notes.ink.isEmpty ? null : _undoStroke),
          IconButton(key: const ValueKey('pen-done'), tooltip: s.done, icon: const Icon(Icons.check), onPressed: () => _setPen(null)),
        ]),
      ),
    );
  }

  List<Widget> _overlays(ViewerManifest m, Viewer3dStrings s, bool wide) {
    final a = m.animation(_anim);
    final p = m.part(_picked);
    final lit = _laserPartInfo;
    final stepCard = a != null && a.steps.isNotEmpty;
    final credit = TextStyle(color: Colors.white.withValues(alpha: 0.55), fontSize: 11);
    final sc = _scene;
    if (sc != null) {
      // A scene: the player along the bottom; what is picked or pointed at at the top.
      final top = _laser || _pen != null ? 52.0 : 10.0;
      return [
        Positioned(left: 12, right: 12, bottom: 12, child: Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 900), child: _scenePlayer(sc, s, wide)))),
        if (_laser && lit != null)
          Positioned(left: 12, top: top, child: _laserChip(lit))
        else if (p != null && _pen == null)
          Positioned(left: 12, top: top, right: wide ? null : 12, child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 400), child: _partCard(m, p, s))),
        if (_laser) Positioned(top: 10, left: 12, child: IgnorePointer(child: _pill(s.laserHint, const Color(0xCC16191E), Colors.white))),
        if (_pen != null)
          Positioned(
            top: 8,
            left: 8,
            right: 8,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              _penPalette(s),
              const SizedBox(height: 6),
              IgnorePointer(child: _pill(_pen == _Pen.pin ? s.pinHint : s.drawHint, const Color(0xCC16191E), Colors.white)),
            ]),
          ),
        if (!_laser && _pen == null)
          Positioned(
            right: 10,
            top: 8,
            child: GestureDetector(key: const ValueKey('model3d-credit'), onTap: () => showModel3dCredits(context, model: m, lang: _lang), child: Text('${m.credit} · three.js', style: credit)),
          ),
      ];
    }
    return [
      if (stepCard)
        Positioned(left: 12, right: 12, bottom: 12, child: _stepCard(a, s))
      else if (_laser && lit != null)
        Positioned(left: 12, bottom: 12, child: _laserChip(lit))
      else if (p != null)
        Positioned(left: 12, bottom: 12, right: wide ? null : 12, child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 440), child: _partCard(m, p, s))),
      if (_laser)
        Positioned(
          top: 10,
          left: 12,
          child: IgnorePointer(child: _pill(s.laserHint, const Color(0xCC16191E), Colors.white)),
        ),
      if (_pen != null)
        Positioned(
          top: 8,
          left: 8,
          right: 8,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            _penPalette(s),
            const SizedBox(height: 6),
            IgnorePointer(child: _pill(_pen == _Pen.pin ? s.pinHint : s.drawHint, const Color(0xCC16191E), Colors.white)),
          ]),
        ),
      // The credit line: who made the model and the viewer (tap for the full credits).
      Positioned(
        right: 10,
        top: stepCard || (p != null && !wide) ? 10 : null,
        bottom: stepCard || (p != null && !wide) ? null : 8,
        child: GestureDetector(
          key: const ValueKey('model3d-credit'),
          onTap: () => showModel3dCredits(context, model: m, lang: _lang),
          child: Text('${m.credit} · three.js', style: credit),
        ),
      ),
    ];
  }

  Widget _pill(String text, Color bg, Color fg) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
    decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
    child: Text(text, style: TextStyle(color: fg, fontSize: 13)),
  );

  Widget _laserChip(ViewerPart p) => Container(
    key: const ValueKey('laser-part'),
    padding: const EdgeInsets.fromLTRB(10, 8, 14, 8),
    decoration: BoxDecoration(
      color: const Color(0xFFE53935),
      borderRadius: BorderRadius.circular(12),
      boxShadow: const [BoxShadow(color: Color(0x66FF3C32), blurRadius: 14)],
    ),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Container(width: 12, height: 12, decoration: BoxDecoration(color: p.swatch, shape: BoxShape.circle, border: Border.all(color: Colors.white))),
      const SizedBox(width: 10),
      Text(p.name.of(_lang), style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600)),
    ]),
  );

  Widget _card({required Widget child}) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 10, 12),
      decoration: BoxDecoration(
        color: cs.surfaceContainerHigh.withValues(alpha: 0.97),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: cs.outlineVariant),
        boxShadow: const [BoxShadow(color: Color(0x66000000), blurRadius: 18)],
      ),
      child: child,
    );
  }

  Widget _partCard(ViewerManifest m, ViewerPart p, Viewer3dStrings s) {
    final cs = Theme.of(context).colorScheme;
    final group = m.groups.where((g) => g.id == p.group).firstOrNull;
    return _card(
      child: Column(key: const ValueKey('part-card'), crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        Row(children: [
          Container(width: 14, height: 14, decoration: BoxDecoration(color: p.swatch, shape: BoxShape.circle)),
          const SizedBox(width: 10),
          Expanded(child: Text(p.name.of(_lang), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600))),
          IconButton(tooltip: s.close, icon: const Icon(Icons.close, size: 20), onPressed: () => _pick(null)),
        ]),
        if (group != null) Text(group.name.of(_lang), style: TextStyle(color: cs.onSurfaceVariant, fontSize: 12)),
        const SizedBox(height: 6),
        Text(p.info.of(_lang), style: const TextStyle(fontSize: 15, height: 1.35)),
        const SizedBox(height: 8),
        Wrap(spacing: 6, runSpacing: 6, children: [
          ActionChip(avatar: const Icon(Icons.visibility_off_outlined, size: 18), label: Text(s.hide), onPressed: () => _toggle(p)),
          ActionChip(avatar: const Icon(Icons.center_focus_strong_outlined, size: 18), label: Text(s.showOnly), onPressed: () => _only(p)),
        ]),
      ]),
    );
  }

  static String _clock(double seconds) {
    final t = seconds.isFinite ? seconds.round() : 0;
    return '${t ~/ 60}:${(t % 60).toString().padLeft(2, '0')}';
  }

  static const _speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

  static String _speedLabel(double v) => '${v == v.roundToDouble() ? v.toInt() : v}×';

  /// A scene's player: the step's title and caption, then back, play or pause, next, the
  /// timeline (drag to scrub), the time, the speed and read aloud.
  Widget _scenePlayer(ProcessScene sc, Viewer3dStrings s, bool wide) {
    final cs = Theme.of(context).colorScheme;
    final pr = _progress;
    final i = pr.step.clamp(0, sc.steps.length - 1);
    final step = sc.steps[i];
    final total = pr.total > 0 ? pr.total : sc.seconds;
    final at = (_scrubTo ?? pr.time).clamp(0.0, total);
    final ended = !pr.playing && at >= total - 0.05;
    final read = _readAloud;
    return Container(
      key: const ValueKey('scene-player'),
      padding: EdgeInsets.fromLTRB(wide ? 18 : 12, 12, wide ? 10 : 6, 4),
      decoration: BoxDecoration(
        color: cs.surfaceContainerHigh.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: cs.outlineVariant),
        boxShadow: const [BoxShadow(color: Color(0x66000000), blurRadius: 18)],
      ),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Text.rich(
              TextSpan(children: [
                TextSpan(text: s.sceneStep(i + 1, sc.steps.length), style: TextStyle(color: cs.onSurfaceVariant, fontWeight: FontWeight.w500)),
                const TextSpan(text: '  ·  '),
                TextSpan(text: step.title.of(_lang), style: TextStyle(color: cs.primary, fontWeight: FontWeight.w700)),
              ]),
              key: const ValueKey('scene-step-title'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13),
            ),
          ),
          if (read != null)
            IconButton(
              key: const ValueKey('scene-read'),
              tooltip: s.readAloud,
              visualDensity: VisualDensity.compact,
              isSelected: _narrate,
              icon: const Icon(Icons.volume_off_outlined),
              selectedIcon: const Icon(Icons.record_voice_over_outlined),
              color: _narrate ? cs.primary : null,
              onPressed: () => _setNarrate(!_narrate),
            ),
          PopupMenuButton<double>(
            key: const ValueKey('scene-speed'),
            tooltip: s.speed,
            initialValue: pr.speed,
            onSelected: _setSpeed,
            itemBuilder: (_) => [for (final v in _speeds) PopupMenuItem(key: ValueKey('scene-speed-$v'), value: v, child: Text(_speedLabel(v)))],
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              child: Text(_speedLabel(pr.speed), style: TextStyle(fontWeight: FontWeight.w600, color: cs.onSurface)),
            ),
          ),
        ]),
        const SizedBox(height: 2),
        Padding(
          padding: const EdgeInsets.only(right: 8),
          child: Text(step.caption.of(_lang), key: const ValueKey('scene-caption'), maxLines: wide ? 4 : 3, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: wide ? 17 : 15, height: 1.38)),
        ),
        Row(children: [
          IconButton(key: const ValueKey('scene-prev'), tooltip: s.previousStep, onPressed: () => _sceneOp(SceneOp.prev), icon: const Icon(Icons.skip_previous_rounded)),
          IconButton.filled(
            key: const ValueKey('scene-play'),
            tooltip: ended ? s.replay : pr.playing ? s.pause : s.play,
            onPressed: () => _sceneOp(ended ? SceneOp.replay : SceneOp.toggle),
            icon: Icon(ended ? Icons.replay_rounded : pr.playing ? Icons.pause_rounded : Icons.play_arrow_rounded),
          ),
          IconButton(key: const ValueKey('scene-next'), tooltip: s.nextStep, onPressed: i < sc.steps.length - 1 ? () => _sceneOp(SceneOp.next) : null, icon: const Icon(Icons.skip_next_rounded)),
          Expanded(child: _timeline(sc, at, total)),
          if (wide) Text('${_clock(at)} / ${_clock(total)}', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant, fontFeatures: const [FontFeature.tabularFigures()])),
          const SizedBox(width: 8),
        ]),
      ]),
    );
  }

  /// The timeline: a slider over the whole scene with a tick where each step begins.
  Widget _timeline(ProcessScene sc, double at, double total) {
    final cs = Theme.of(context).colorScheme;
    return LayoutBuilder(builder: (context, box) {
      const pad = 24.0; // the slider's own inset
      final w = math.max(1.0, box.maxWidth - pad * 2);
      return Stack(alignment: Alignment.center, children: [
        for (var k = 1; k < sc.steps.length; k++)
          Positioned(
            left: pad + w * sc.startOf(k) / total - 1,
            child: IgnorePointer(child: Container(width: 2, height: 10, color: cs.onSurfaceVariant.withValues(alpha: 0.45))),
          ),
        Slider(
          key: const ValueKey('scene-timeline'),
          value: at,
          max: total,
          onChangeStart: (v) => setState(() => _scrubTo = v),
          onChanged: (v) {
            setState(() => _scrubTo = v);
            _send(ViewerCommands.sceneSeek(v));
          },
          onChangeEnd: (v) {
            _send(ViewerCommands.sceneSeek(v));
            setState(() {
              _scrubTo = null;
              _progress = SceneProgress(step: sc.stepAt(v), time: v, total: total, playing: _progress.playing, speed: _progress.speed);
            });
          },
        ),
      ]);
    });
  }

  /// The Steps tab: every step (tap to go there), read aloud and lighter graphics.
  Widget _stepsTab(ProcessScene sc, Viewer3dStrings s) {
    final cs = Theme.of(context).colorScheme;
    return ListView(key: const ValueKey('scene-steps'), padding: const EdgeInsets.only(bottom: 16), children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: Text(sc.summary.of(_lang), style: TextStyle(color: cs.onSurfaceVariant, height: 1.35)),
      ),
      for (var i = 0; i < sc.steps.length; i++)
        Material(
          color: _progress.step == i ? cs.secondaryContainer : Colors.transparent,
          child: ListTile(
            key: ValueKey('scene-step-$i'),
            dense: true,
            leading: CircleAvatar(
              radius: 14,
              backgroundColor: _progress.step == i ? cs.primary : cs.surfaceContainerHighest,
              child: Text('${i + 1}', style: TextStyle(fontSize: 12, color: _progress.step == i ? cs.onPrimary : cs.onSurface)),
            ),
            title: Text(sc.steps[i].title.of(_lang), style: TextStyle(fontWeight: _progress.step == i ? FontWeight.w700 : FontWeight.w500)),
            trailing: Text(_clock(sc.steps[i].seconds), style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
            onTap: () => _sceneStep(i),
          ),
        ),
      const Divider(height: 24),
      if (_readAloud != null) SwitchListTile(key: const ValueKey('scene-read-switch'), title: Text(s.readAloud), value: _narrate, onChanged: _setNarrate),
      SwitchListTile(
        key: const ValueKey('scene-quality'),
        title: Text(s.lighterGraphics),
        subtitle: Text(s.lighterGraphicsHint),
        value: _quality == ViewerQuality.low,
        onChanged: (on) => _setQuality(on ? ViewerQuality.low : ViewerQuality.high),
      ),
    ]);
  }

  Widget _stepCard(ViewerAnimation a, Viewer3dStrings s) {
    final cs = Theme.of(context).colorScheme;
    return _card(
      child: Row(key: const ValueKey('flow-card'), children: [
        IconButton(key: const ValueKey('flow-prev'), tooltip: s.back, onPressed: _step > 0 ? () => _goToStep(_step - 1) : null, icon: const Icon(Icons.chevron_left)),
        const SizedBox(width: 4),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text(s.stepOf(a.name.of(_lang), _step + 1, a.steps.length), style: TextStyle(color: cs.primary, fontWeight: FontWeight.w600, fontSize: 13)),
            const SizedBox(height: 4),
            Text(a.steps[_step].of(_lang), style: const TextStyle(fontSize: 16, height: 1.35)),
          ]),
        ),
        IconButton(key: const ValueKey('flow-next'), tooltip: s.next, onPressed: _step < a.steps.length - 1 ? () => _goToStep(_step + 1) : null, icon: const Icon(Icons.chevron_right)),
        IconButton(key: const ValueKey('flow-stop'), tooltip: s.stop, onPressed: () => _animate(null), icon: const Icon(Icons.stop_circle_outlined)),
      ]),
    );
  }

  // ---------------------------------------------------------------- panel

  List<(_Tab, IconData, String)> _tabs(Viewer3dStrings s) => [
    if (_scene != null) (_Tab.steps, Icons.format_list_numbered, s.tabSteps),
    (_Tab.parts, Icons.category_outlined, s.tabParts),
    (_Tab.cut, Icons.content_cut, s.tabCut),
    if (_model?.canTakeApart ?? true) (_Tab.apart, Icons.open_with, s.tabApart),
    if (_model?.animations.isNotEmpty ?? true) (_Tab.animate, Icons.play_circle_outline, s.tabAnimate),
    (_Tab.views, Icons.threed_rotation, s.tabViews),
    (_Tab.notes, Icons.sticky_note_2_outlined, s.tabNotes),
  ];

  Widget _panel(ViewerManifest m, Viewer3dStrings s) {
    final cs = Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(border: Border(left: BorderSide(color: cs.outlineVariant))),
      child: Column(children: [if (m.variants.isNotEmpty) _variants(m), _tabBar(s, compact: false), Expanded(child: _tabBody(m, s))]),
    );
  }

  /// The versions (each solid, each element): chips when there are a few, a menu when many.
  Widget _variants(ViewerManifest m) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      color: cs.surfaceContainerLow,
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      child: m.variants.length <= 8
          ? Wrap(spacing: 6, runSpacing: 6, children: [
              for (final v in m.variants)
                ChoiceChip(
                  key: ValueKey('variant-${v.id}'),
                  label: Text(v.name.of(_lang)),
                  selected: _variant == v.id,
                  visualDensity: VisualDensity.compact,
                  onSelected: (_) => _setVariant(v.id),
                ),
            ])
          : DropdownButton<String>(
              key: const ValueKey('variant-menu'),
              isExpanded: true,
              value: _variant,
              items: [for (final v in m.variants) DropdownMenuItem(value: v.id, child: Text(v.name.of(_lang)))],
              onChanged: (id) => id == null ? null : _setVariant(id),
            ),
    );
  }

  Widget _tabBar(Viewer3dStrings s, {required bool compact}) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(color: cs.surfaceContainerLow, border: Border.symmetric(horizontal: BorderSide(color: cs.outlineVariant))),
      child: Row(children: [
        for (final (t, icon, label) in _tabs(s))
          Expanded(
            child: InkWell(
              key: ValueKey('tab-${t.name}'),
              onTap: () => setState(() {
                if (compact && _tab == t) {
                  _panelOpen = !_panelOpen;
                } else {
                  _tab = t;
                  _panelOpen = true;
                }
              }),
              child: Container(
                constraints: const BoxConstraints(minHeight: 48),
                padding: const EdgeInsets.symmetric(vertical: 6),
                decoration: BoxDecoration(border: Border(bottom: BorderSide(color: _tab == t && _panelOpen ? cs.primary : Colors.transparent, width: 3))),
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(icon, size: 20, color: _tab == t && _panelOpen ? cs.primary : cs.onSurfaceVariant),
                  const SizedBox(height: 2),
                  Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11, color: _tab == t && _panelOpen ? cs.onSurface : cs.onSurfaceVariant)),
                ]),
              ),
            ),
          ),
      ]),
    );
  }

  Widget _tabBody(ViewerManifest m, Viewer3dStrings s) {
    final tab = _tabs(s).any((e) => e.$1 == _tab) ? _tab : _Tab.parts;
    final sc = _scene;
    // A Material of its own, so list tiles show their ink.
    return Material(
      color: Theme.of(context).colorScheme.surfaceContainerLow,
      child: switch (tab) {
        _Tab.steps => sc == null ? _partsTab(m, s) : _stepsTab(sc, s),
        _Tab.parts => _partsTab(m, s),
        _Tab.cut => _cutTab(m, s),
        _Tab.apart => _apartTab(s),
        _Tab.animate => _animateTab(m, s),
        _Tab.views => _viewsTab(m, s),
        _Tab.notes => _notesTab(m, s),
      },
    );
  }

  Widget _title(String t) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 16, 16, 6),
    child: Text(t, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500)),
  );

  Widget _partsTab(ViewerManifest m, Viewer3dStrings s) {
    final cs = Theme.of(context).colorScheme;
    return ListView(padding: const EdgeInsets.only(bottom: 16), children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        child: Text(m.summary.of(_lang), style: TextStyle(color: cs.onSurfaceVariant, height: 1.35)),
      ),
      if (_hidden.isNotEmpty || _shown.isNotEmpty)
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: Align(alignment: Alignment.centerLeft, child: TextButton.icon(onPressed: _showAll, icon: const Icon(Icons.visibility), label: Text(s.showAllParts))),
        ),
      for (final g in m.groups.where((g) => m.inGroup(g.id, _variant).isNotEmpty)) ...[
        Row(children: [
          Expanded(child: _title(g.name.of(_lang))),
          IconButton(
            key: ValueKey('group-eye-${g.id}'),
            tooltip: s.showOrHide,
            icon: Icon(m.inGroup(g.id, _variant).any(_visible) ? Icons.visibility_outlined : Icons.visibility_off_outlined, size: 20, color: cs.onSurfaceVariant),
            onPressed: () => _toggleGroup(g.id),
          ),
          const SizedBox(width: 6),
        ]),
        for (final p in m.inGroup(g.id, _variant)) _partRow(p, s),
      ],
    ]);
  }

  Widget _partRow(ViewerPart p, Viewer3dStrings s) {
    final cs = Theme.of(context).colorScheme;
    final on = _visible(p);
    final sel = _picked == p.id;
    return Material(
      color: sel ? cs.secondaryContainer : Colors.transparent,
      child: InkWell(
        key: ValueKey('part-${p.id}'),
        onTap: on ? () => _pick(sel ? null : p.id) : () => _toggle(p),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Row(children: [
            const SizedBox(width: 16),
            Container(width: 12, height: 12, decoration: BoxDecoration(color: on ? p.swatch : cs.outlineVariant, shape: BoxShape.circle)),
            const SizedBox(width: 12),
            Expanded(
              child: Text(p.name.of(_lang), style: TextStyle(color: on ? cs.onSurface : cs.onSurfaceVariant, fontWeight: sel ? FontWeight.w600 : FontWeight.w500)),
            ),
            IconButton(
              key: ValueKey('part-eye-${p.id}'),
              tooltip: on ? s.hide : s.show,
              icon: Icon(on ? Icons.visibility_outlined : Icons.visibility_off_outlined, size: 20),
              onPressed: () => _toggle(p),
            ),
            const SizedBox(width: 6),
          ]),
        ),
      ),
    );
  }

  Widget _cutTab(ViewerManifest m, Viewer3dStrings s) {
    final pad = const EdgeInsets.symmetric(horizontal: 12);
    final kinds = [
      (CutMode.half, Icons.vertical_split_outlined, s.cutHalf),
      (CutMode.wedge, Icons.pie_chart_outline, s.cutWedge),
      (CutMode.slab, Icons.view_agenda_outlined, s.cutSlab),
      (CutMode.depth, Icons.layers_outlined, s.cutDepth),
      (CutMode.peel, Icons.blur_circular, s.cutPeel),
    ];
    final axes = [(CutAxis.z, s.front), (CutAxis.x, s.side), (CutAxis.y, s.top)];
    final mode = _cutMode;
    final on = _slice != null || mode != CutMode.off;
    return ListView(padding: const EdgeInsets.only(bottom: 16), children: [
      if (m.slices.isNotEmpty) ...[
        _title(s.readyCuts),
        Padding(
          padding: pad,
          child: Wrap(spacing: 8, runSpacing: 8, children: [
            for (final c in m.slices)
              ChoiceChip(key: ValueKey('slice-${c.id}'), label: Text(c.name.of(_lang)), selected: _slice == c.id, onSelected: (_) => _setSlice(_slice == c.id ? null : c)),
          ]),
        ),
      ],
      _title(s.cutKind),
      Padding(
        padding: pad,
        child: Wrap(spacing: 8, runSpacing: 8, children: [
          for (final (k, icon, label) in kinds)
            ChoiceChip(
              key: ValueKey('cut-mode-${k.name}'),
              avatar: Icon(icon, size: 18),
              label: Text(label),
              selected: mode == k,
              onSelected: (_) => _setCutMode(mode == k ? CutMode.off : k),
            ),
        ]),
      ),
      if (mode != CutMode.off && mode != CutMode.peel) ...[
        _title(s.cutFrom),
        Padding(
          padding: pad,
          child: Wrap(spacing: 8, runSpacing: 8, children: [
            for (final (a, label) in axes)
              ChoiceChip(key: ValueKey('cut-axis-${a.name}'), label: Text(label), selected: _cutAxis == a, onSelected: (_) => _setCutAxis(a)),
          ]),
        ),
      ],
      ...switch (mode) {
        CutMode.half => [
          _title(s.moveCut),
          Slider(key: const ValueKey('cut-depth'), min: -0.5, max: 0.5, value: _cutAt.clamp(-0.5, 0.5), onChanged: (v) => _adjustCut(() => _cutAt = v)),
          Padding(
            padding: pad,
            child: Align(alignment: Alignment.centerLeft, child: TextButton.icon(key: const ValueKey('cut-flip'), onPressed: _flipCut, icon: const Icon(Icons.flip), label: Text(s.otherHalf))),
          ),
        ],
        CutMode.wedge => [
          _title(s.sliceSize(_wedgeAngle.round())),
          Slider(key: const ValueKey('cut-angle'), min: 30, max: 180, divisions: 10, value: _wedgeAngle.clamp(30, 180), onChanged: (v) => _adjustCut(() => _wedgeAngle = v)),
          Padding(
            padding: pad,
            child: Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                key: const ValueKey('cut-turn'),
                onPressed: () {
                  _adjustCut(() => _wedgeTurn = (_wedgeTurn + 90) % 360);
                  final v = _cutView();
                  if (v != null) _send(ViewerCommands.view(v));
                },
                icon: const Icon(Icons.rotate_right),
                label: Text(s.turnSlice),
              ),
            ),
          ),
        ],
        CutMode.slab => [
          _title(s.thickness),
          Slider(key: const ValueKey('cut-thickness'), min: 0.03, max: 0.6, value: _slabThickness.clamp(0.03, 0.6), onChanged: (v) => _adjustCut(() => _slabThickness = v)),
          _title(s.moveCut),
          Slider(key: const ValueKey('cut-depth'), min: -0.5, max: 0.5, value: _cutAt.clamp(-0.5, 0.5), onChanged: (v) => _adjustCut(() => _cutAt = v)),
        ],
        CutMode.depth => [
          _title(s.depthOf((_depth * 100).round())),
          Slider(key: const ValueKey('cut-sweep-depth'), value: _depth.clamp(0, 1), onChanged: (v) => _adjustCut(() => _depth = v)),
          Padding(
            padding: pad,
            child: Wrap(spacing: 8, runSpacing: 8, children: [
              FilledButton.tonalIcon(key: const ValueKey('cut-sweep'), onPressed: _sweeping ? null : _sweep, icon: const Icon(Icons.play_arrow), label: Text(s.sweep)),
              TextButton.icon(key: const ValueKey('cut-flip'), onPressed: _flipCut, icon: const Icon(Icons.flip), label: Text(s.otherHalf)),
            ]),
          ),
        ],
        CutMode.peel => [
          if (_peelLayers > 1) ...[
            _title(s.peeled(_peel, _peelLayers)),
            Slider(
              key: const ValueKey('cut-peel'),
              min: 0,
              max: (_peelLayers - 1).toDouble(),
              divisions: math.max(1, _peelLayers - 1),
              value: _peel.clamp(0, _peelLayers - 1).toDouble(),
              onChanged: (v) => _adjustCut(() => _peel = v.round()),
            ),
          ] else if (_peelLayers == 1)
            Padding(padding: const EdgeInsets.all(16), child: Text(s.onePeel)),
        ],
        CutMode.off => const <Widget>[],
      },
      if (on)
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: Align(alignment: Alignment.centerLeft, child: FilledButton.tonal(key: const ValueKey('slice-off'), onPressed: () => _setSlice(null), child: Text(s.closeCut))),
        ),
    ]);
  }

  Widget _notesTab(ViewerManifest m, Viewer3dStrings s) {
    final cs = Theme.of(context).colorScheme;
    final n = _notes;
    Widget dot(Color c, IconData icon) => Icon(icon, color: c == const Color(0xFFFFFFFF) ? cs.onSurfaceVariant : c);
    Widget remove(String id) => IconButton(key: ValueKey('note-delete-$id'), tooltip: s.delete, icon: const Icon(Icons.delete_outline), onPressed: () => _deleteNote(id));
    return ListView(key: const ValueKey('notes-list'), padding: const EdgeInsets.only(bottom: 16), children: [
      SwitchListTile(key: const ValueKey('notes-show'), title: Text(s.showNotes), value: _notesShown, onChanged: _loaded ? _showNotes : null),
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 4),
        child: Wrap(spacing: 8, runSpacing: 8, children: [
          FilledButton.tonalIcon(key: const ValueKey('notes-pin'), onPressed: _loaded ? () => _setPen(_Pen.pin) : null, icon: const Icon(Icons.push_pin_outlined), label: Text(s.toolPin)),
          OutlinedButton.icon(key: const ValueKey('notes-draw'), onPressed: _loaded ? () => _setPen(_Pen.surface) : null, icon: const Icon(Icons.gesture), label: Text(s.toolSurface)),
        ]),
      ),
      if (n.isEmpty) Padding(padding: const EdgeInsets.all(16), child: Text(s.noNotes, style: TextStyle(color: cs.onSurfaceVariant))),
      for (final p in n.pins)
        ListTile(
          key: ValueKey('note-${p.id}'),
          leading: dot(p.color, Icons.push_pin),
          title: Text(p.text.isEmpty ? s.emptyNote : p.text, maxLines: 2, overflow: TextOverflow.ellipsis),
          subtitle: Text(m.part(p.part)?.name.of(_lang) ?? p.part),
          onTap: () => _editPin(p.id),
          trailing: remove(p.id),
        ),
      for (final k in n.strokes)
        ListTile(key: ValueKey('note-${k.id}'), leading: dot(k.color, Icons.gesture), title: Text(s.drawingOn(m.part(k.part)?.name.of(_lang) ?? '${k.part}')), trailing: remove(k.id)),
      for (final k in n.ink) ListTile(key: ValueKey('note-${k.id}'), leading: dot(k.color, Icons.draw), title: Text(s.drawingOver), trailing: remove(k.id)),
      if (n.isNotEmpty)
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: Align(alignment: Alignment.centerLeft, child: TextButton.icon(key: const ValueKey('notes-clear'), onPressed: _clearNotes, icon: const Icon(Icons.delete_sweep_outlined), label: Text(s.clearNotes))),
        ),
    ]);
  }

  Widget _apartTab(Viewer3dStrings s) => ListView(padding: const EdgeInsets.only(bottom: 16), children: [
    _title(s.tabApart),
    Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Text(s.apartHint)),
    Slider(key: const ValueKey('explode-slider'), value: _explode, onChanged: _setExplode),
    Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(onPressed: _explode > 0 ? () => _setExplode(0) : null, icon: const Icon(Icons.join_inner), label: Text(s.putBack)),
      ),
    ),
  ]);

  Widget _animateTab(ViewerManifest m, Viewer3dStrings s) {
    final cs = Theme.of(context).colorScheme;
    return ListView(padding: const EdgeInsets.only(bottom: 16), children: [
      if (m.animations.isEmpty) Padding(padding: const EdgeInsets.all(16), child: Text(s.noAnimations)),
      for (final a in m.animations)
        ListTile(
          key: ValueKey('anim-${a.id}'),
          leading: Icon(_anim == a.id ? Icons.stop_circle : Icons.play_circle, color: _anim == a.id ? cs.primary : cs.onSurface, size: 30),
          title: Text(a.name.of(_lang), style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: a.steps.isEmpty ? null : Text(s.steps(a.steps.length)),
          onTap: () => _animate(_anim == a.id ? null : a),
        ),
    ]);
  }

  Widget _viewsTab(ViewerManifest m, Viewer3dStrings s) => ListView(padding: const EdgeInsets.only(bottom: 16), children: [
    _title(s.lookFrom),
    Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Wrap(spacing: 8, runSpacing: 8, children: [
        for (final v in m.views) OutlinedButton(key: ValueKey('view-${v.id}'), onPressed: () => _send(ViewerCommands.view(v.dir)), child: Text(v.name.of(_lang))),
      ]),
    ),
    const SizedBox(height: 8),
    SwitchListTile(key: const ValueKey('turn'), title: Text(s.turnSlowly), value: _turning, onChanged: _turn),
    Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 0), child: Text(s.gestureHint)),
  ]);
}

/// Where there is no WebView: the model's title, summary and parts, so the lesson can
/// still use its names and notes.
class _PartsList extends StatelessWidget {
  const _PartsList({required this.model, required this.lang, required this.variant, required this.strings, this.scene});

  /// A scene's steps, listed before its parts.
  final ProcessScene? scene;

  final ViewerManifest model;
  final String lang;
  final String? variant;
  final Viewer3dStrings strings;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    return ListView(key: const ValueKey('model3d-parts-list'), padding: const EdgeInsets.all(16), children: [
      Text(model.title.of(lang), style: text.titleLarge),
      const SizedBox(height: 6),
      Text(model.summary.of(lang), style: TextStyle(color: cs.onSurfaceVariant, height: 1.35)),
      const SizedBox(height: 12),
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: cs.secondaryContainer, borderRadius: BorderRadius.circular(12)),
        child: Row(children: [
          Icon(Icons.info_outline, color: cs.onSecondaryContainer),
          const SizedBox(width: 10),
          Expanded(child: Text(strings.noViewer, style: TextStyle(color: cs.onSecondaryContainer))),
        ]),
      ),
      if (scene case final sc?) ...[
        Padding(padding: const EdgeInsets.fromLTRB(0, 16, 0, 4), child: Text(strings.tabSteps, style: text.titleSmall)),
        for (var i = 0; i < sc.steps.length; i++)
          ListTile(
            key: ValueKey('scene-text-$i'),
            contentPadding: EdgeInsets.zero,
            leading: CircleAvatar(radius: 13, child: Text('${i + 1}', style: const TextStyle(fontSize: 12))),
            title: Text(sc.steps[i].title.of(lang)),
            subtitle: Text(sc.steps[i].caption.of(lang)),
          ),
      ],
      for (final g in model.groups.where((g) => model.inGroup(g.id, variant).isNotEmpty)) ...[
        Padding(padding: const EdgeInsets.fromLTRB(0, 16, 0, 4), child: Text(g.name.of(lang), style: text.titleSmall)),
        for (final p in model.inGroup(g.id, variant))
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Container(width: 14, height: 14, decoration: BoxDecoration(color: p.swatch, shape: BoxShape.circle)),
            title: Text(p.name.of(lang)),
            subtitle: Text(p.info.of(lang)),
          ),
      ],
      const SizedBox(height: 12),
      Text('${model.credit} · three.js', style: TextStyle(color: cs.onSurfaceVariant, fontSize: 11)),
    ]);
  }
}
