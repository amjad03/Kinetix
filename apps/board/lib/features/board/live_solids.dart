import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../../l10n/l10n.dart';
import '../search/solids3d.dart' show renderSolidPng, solidStyle;

/// The face colour picker's words in the teacher's language.
FaceColourStrings faceColourStrings(BuildContext context) {
  final l = context.l10n;
  return FaceColourStrings(
    title: l.faceColourTitle,
    hue: l.faceColourHue,
    saturation: l.faceColourSaturation,
    brightness: l.faceColourBrightness,
    hex: l.faceColourHex,
    palette: l.faceColourPalette,
    recent: l.faceColourRecent,
    apply: l.faceColourApply,
    reset: l.faceColourReset,
    cancel: l.cancel,
  );
}

/// A 3D solid put on the board stays live: this layer draws every [ImageElement.isLiveSolid] as
/// a real 3D view above the board. One finger turns it, two fingers resize it, the dot above it
/// moves it, and a tap on a face (when the solid is selected, or after "Face colour") opens the
/// colour picker for that face. Each change is kept in the element's link (and a fresh picture,
/// for viewers that cannot show it live), so it is saved and restored with the page.
class LiveSolidsLayer extends StatelessWidget {
  const LiveSolidsLayer({super.key, required this.wb, required this.view, required this.armed});

  final WhiteboardController wb;
  final ViewState view;

  /// The id of the solid waiting for a tap on a face ("Face colour" was pressed), or null.
  final ValueNotifier<String?> armed;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([wb, armed]),
      builder: (context, _) {
        final live = [
          for (final e in wb.elements)
            if (e is ImageElement && e.isLiveSolid && SolidKind.values.any((k) => k.id == e.link!.id)) e,
        ];
        if (live.isEmpty) return const SizedBox.shrink();
        final tool = wb.tool;
        return Stack(
          clipBehavior: Clip.none,
          children: [
            for (final e in live)
              LiveSolid(
                key: ValueKey('live-solid-${e.id}'),
                wb: wb,
                element: e,
                view: view,
                selected: wb.selection.contains(e.id),
                armed: armed.value == e.id,
                armedNotifier: armed,
                interactive: tool == BoardTool.select || tool == BoardTool.hand || wb.selection.contains(e.id) || armed.value == e.id,
              ),
          ],
        );
      },
    );
  }
}

class LiveSolid extends StatefulWidget {
  const LiveSolid({
    super.key,
    required this.wb,
    required this.element,
    required this.view,
    required this.selected,
    required this.armed,
    required this.armedNotifier,
    required this.interactive,
  });

  final WhiteboardController wb;
  final ImageElement element;
  final ViewState view;
  final bool selected, armed, interactive;
  final ValueNotifier<String?> armedNotifier;

  @override
  State<LiveSolid> createState() => _LiveSolidState();
}

class _LiveSolidState extends State<LiveSolid> {
  late SolidKind _kind;
  late SceneRenderer _renderer;
  late SolidView _look;
  final _pointers = <int, Offset>{};
  Offset _shift = Offset.zero;
  double _k = 1, _pinchStart = 0, _travel = 0;
  bool _changed = false, _busy = false;

  ImageElement get e => widget.element;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _kind = SolidKind.values.firstWhere((k) => k.id == e.link!.id);
    _renderer = SceneRenderer(Solid(_kind).toModel(grid: false));
    _look = SolidView.decode(e.link!.preset) ?? const SolidView();
  }

  @override
  void didUpdateWidget(LiveSolid old) {
    super.didUpdateWidget(old);
    if (old.element.link != e.link && _pointers.isEmpty) {
      if (old.element.link!.id != e.link!.id) {
        _renderer.dispose();
        _load();
      } else {
        _look = SolidView.decode(e.link!.preset) ?? _look;
      }
    }
  }

  @override
  void dispose() {
    _renderer.dispose();
    super.dispose();
  }

  bool _fingerOrMouse(PointerEvent p) => p.kind == PointerDeviceKind.touch || p.kind == PointerDeviceKind.mouse;

  void _down(PointerDownEvent p) {
    if (!widget.interactive || !_fingerOrMouse(p)) return;
    _pointers[p.pointer] = p.localPosition;
    if (_pointers.length == 1) {
      _travel = 0;
      _changed = false;
    } else if (_pointers.length == 2) {
      final pts = _pointers.values.toList();
      _pinchStart = math.max(1, (pts[0] - pts[1]).distance);
    }
  }

  void _move(PointerMoveEvent p) {
    final last = _pointers[p.pointer];
    if (last == null) return;
    _pointers[p.pointer] = p.localPosition;
    if (_pointers.length >= 2) {
      final pts = _pointers.values.toList();
      setState(() => _k = ((pts[0] - pts[1]).distance / _pinchStart).clamp(0.3, 4.0));
      _changed = true;
      return;
    }
    final d = p.localPosition - last;
    _travel += d.distance;
    if (_travel < 8 && !_changed) return;
    _changed = true;
    setState(() => _look = _look.copyWith(yaw: _look.yaw + d.dx * 0.45, pitch: (_look.pitch + d.dy * 0.45).clamp(-89.0, 89.0)));
  }

  void _up(PointerEvent p) {
    if (_pointers.remove(p.pointer) == null) return;
    if (_pointers.isNotEmpty) return;
    if (p is PointerUpEvent && !_changed && _travel < 8) {
      _tap(p.localPosition);
    } else if (_changed) {
      unawaited(_commit());
    }
  }

  void _tap(Offset at) {
    final wb = widget.wb;
    if (!widget.selected && !widget.armed) {
      wb.select({e.id});
      return;
    }
    final t = _renderer.hitTriangle(at);
    if (t == null) {
      widget.armedNotifier.value = null;
      return;
    }
    unawaited(_pickFace(t));
  }

  Future<void> _pickFace(int t) async {
    final face = _renderer.planarFace(t);
    final now = _look.faces[t];
    final r = await showFaceColourPicker(context, current: now == null ? null : Color(now), strings: faceColourStrings(context));
    if (r == null || !mounted) return;
    final faces = {..._look.faces};
    if (r.color == null) {
      face.forEach(faces.remove);
    } else {
      for (final f in face) {
        faces[f] = r.color!.toARGB32();
      }
    }
    setState(() => _look = _look.copyWith(faces: faces));
    widget.armedNotifier.value = null;
    await _commit();
  }

  /// Keeps the turn, size, position and painted faces in the page (one undo step), with a fresh
  /// picture for viewers that cannot show the solid live.
  Future<void> _commit() async {
    if (_busy) return;
    _busy = true;
    final look = _look, k = _k, shift = _shift;
    final before = widget.wb.byId(e.id);
    if (before is! ImageElement) {
      _busy = false;
      return;
    }
    final center = before.rect.center + shift;
    final rect = Rect.fromCenter(center: center, width: before.rect.width * k, height: before.rect.height * k);
    final png = await renderSolidPng(_kind, yaw: look.yaw, pitch: look.pitch, faceColors: look.faces);
    _busy = false;
    if (!mounted) return;
    final now = widget.wb.byId(e.id);
    if (now is! ImageElement) return;
    widget.wb.replace(now.copyWith(rect: rect, bytes: png, link: EmbedLink(kind: EmbedLink.model3d, id: _kind.id, preset: look.encode())));
    setState(() {
      _k = 1;
      _shift = Offset.zero;
    });
  }

  @override
  Widget build(BuildContext context) {
    final v = widget.view;
    final base = e.rect.shift(_shift);
    final c = v.toScreen(base.center);
    final w = base.width * _k * v.scale, h = base.height * _k * v.scale;
    const handleBand = 44.0;
    final l = context.l10n;
    final outline = widget.armed ? Theme.of(context).colorScheme.tertiary : Theme.of(context).colorScheme.primary;
    return Positioned(
      left: c.dx - w / 2,
      top: c.dy - h / 2 - handleBand,
      width: w,
      height: h + handleBand,
      child: Transform.rotate(
        angle: e.rotation,
        origin: const Offset(0, handleBand / 2),
        child: Column(
          children: [
            SizedBox(
              height: handleBand,
              child: widget.selected
                  ? Center(
                      child: GestureDetector(
                        key: const Key('live-solid-move'),
                        behavior: HitTestBehavior.opaque,
                        onPanUpdate: (d) => setState(() => _shift += d.delta / v.scale),
                        onPanEnd: (_) => unawaited(_commit()),
                        child: Tooltip(
                          message: l.liveSolidMove,
                          child: Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(color: Theme.of(context).colorScheme.primary, shape: BoxShape.circle),
                            child: Icon(Icons.open_with, size: 22, color: Theme.of(context).colorScheme.onPrimary),
                          ),
                        ),
                      ),
                    )
                  : null,
            ),
            Expanded(
              child: Listener(
                key: const Key('live-solid-view'),
                behavior: widget.interactive ? HitTestBehavior.opaque : HitTestBehavior.translucent,
                onPointerDown: _down,
                onPointerMove: _move,
                onPointerUp: _up,
                onPointerCancel: _up,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    CustomPaint(painter: _SolidPainter(_renderer, _look)),
                    if (widget.selected || widget.armed) IgnorePointer(child: DecoratedBox(decoration: BoxDecoration(border: Border.all(color: outline, width: widget.armed ? 3 : 1.5)))),
                    if (widget.armed)
                      Positioned(
                        left: 0,
                        right: 0,
                        top: 4,
                        child: IgnorePointer(
                          child: Center(
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(color: outline, borderRadius: BorderRadius.circular(14)),
                              child: Text(l.faceColourTapHint, style: TextStyle(color: Theme.of(context).colorScheme.onTertiary, fontWeight: FontWeight.w700)),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SolidPainter extends CustomPainter {
  _SolidPainter(this.renderer, this.look);

  final SceneRenderer renderer;
  final SolidView look;

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;
    final scale = (size.shortestSide / 520).clamp(0.6, 1.3);
    renderer.paint(canvas, size, OrbitCamera(yaw: look.yaw, pitch: look.pitch), solidStyle(labelScale: scale * 1.1), RenderOptions(labels: true, faceColors: look.faces));
  }

  @override
  bool shouldRepaint(_SolidPainter old) => true;
}
