import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'model.dart';
import 'renderer.dart';

/// Camera, toggles, selection and animation clock of a [ModelViewer]. Pass one in to drive
/// the viewer from outside (or to read its state in tests).
class ModelViewController extends ChangeNotifier {
  ModelViewController({double yaw = -30, double pitch = 20, this.labels = true, this.wireframe = false, this.autoRotate = false, this.playing = true})
      : camera = OrbitCamera(yaw: yaw, pitch: pitch),
        _homeYaw = yaw,
        _homePitch = pitch;

  final OrbitCamera camera;
  double _homeYaw, _homePitch;
  bool labels, wireframe, autoRotate, playing;
  String? selectedPartId;

  /// Animation time in seconds (orbits, spin).
  double time = 0;

  /// Face colouring (spec §20): while set, a tap paints the tapped flat face this colour
  /// instead of selecting a part. The solid stays rotatable.
  Color? paintColor;

  /// Painted faces: triangle index → ARGB.
  final Map<int, int> faceColors = {};

  void setPaintColor(Color? c) {
    paintColor = c;
    notifyListeners();
  }

  void paintFaces(Iterable<int> triangles, Color c) {
    for (final t in triangles) {
      faceColors[t] = c.toARGB32();
    }
    notifyListeners();
  }

  void clearFaceColors() {
    faceColors.clear();
    notifyListeners();
  }

  void setHome(double yaw, double pitch) {
    _homeYaw = yaw;
    _homePitch = pitch;
  }

  void rotateBy(double dYaw, double dPitch) {
    camera.rotateBy(dYaw, dPitch);
    notifyListeners();
  }

  void zoomBy(double f) {
    camera.zoomBy(f);
    notifyListeners();
  }

  void resetView() {
    camera
      ..yaw = _homeYaw
      ..pitch = _homePitch
      ..zoom = 1;
    selectedPartId = null;
    notifyListeners();
  }

  void toggleLabels() {
    labels = !labels;
    notifyListeners();
  }

  void toggleWireframe() {
    wireframe = !wireframe;
    notifyListeners();
  }

  void toggleAutoRotate() {
    autoRotate = !autoRotate;
    notifyListeners();
  }

  void togglePlaying() {
    playing = !playing;
    notifyListeners();
  }

  void select(String? partId) {
    selectedPartId = partId;
    notifyListeners();
  }

  void tick(double dt, {required bool animated}) {
    var changed = false;
    if (autoRotate) {
      camera.rotateBy(dt * 18, 0);
      changed = true;
    }
    if (animated && playing) {
      time += dt;
      changed = true;
    }
    if (changed) notifyListeners();
  }
}

/// An interactive view of a [Model3D]: drag to rotate, pinch or scroll to zoom, double-tap to
/// reset, tap a part to see its name. Fills whatever space it is given.
class ModelViewer extends StatefulWidget {
  const ModelViewer({
    super.key,
    required this.model,
    this.controller,
    this.showHeader = true,
    this.showCaption = true,
    this.autoRotate = false,
    this.fitRadius,
    this.toolbarLeading = const [],
  });

  final Model3D model;
  final ModelViewController? controller;

  /// Title and subject tags in the top-left corner.
  final bool showHeader;

  /// Caption (or the tapped part's name) along the bottom.
  final bool showCaption;
  final bool autoRotate;

  /// Fit the camera to this radius instead of the model's own bounds (keeps the scale steady
  /// while a solid's dimensions change).
  final double? fitRadius;

  /// Extra buttons placed at the start of the toolbar.
  final List<Widget> toolbarLeading;

  @override
  State<ModelViewer> createState() => _ModelViewerState();
}

class _ModelViewerState extends State<ModelViewer> with SingleTickerProviderStateMixin {
  late ModelViewController _ctrl;
  late SceneRenderer _renderer;
  late final Ticker _ticker;
  Duration _last = Duration.zero;
  double _lastScale = 1;

  @override
  void initState() {
    super.initState();
    _ctrl = widget.controller ?? ModelViewController(yaw: widget.model.initialYaw, pitch: widget.model.initialPitch, autoRotate: widget.autoRotate);
    if (widget.controller != null) _ctrl.setHome(widget.model.initialYaw, widget.model.initialPitch);
    _renderer = SceneRenderer(widget.model);
    _ticker = createTicker(_onTick);
    _ctrl.addListener(_syncTicker);
    _syncTicker();
  }

  @override
  void didUpdateWidget(ModelViewer old) {
    super.didUpdateWidget(old);
    if (old.controller != widget.controller) {
      _ctrl.removeListener(_syncTicker);
      _ctrl = widget.controller ?? ModelViewController(yaw: widget.model.initialYaw, pitch: widget.model.initialPitch);
      _ctrl.addListener(_syncTicker);
    }
    if (!identical(old.model, widget.model)) {
      _renderer.dispose();
      _renderer = SceneRenderer(widget.model);
      if (old.model.title != widget.model.title) {
        _ctrl.setHome(widget.model.initialYaw, widget.model.initialPitch);
        _ctrl.selectedPartId = null;
      }
    }
    _shownSelection = _ctrl.selectedPartId; // this build already reflects it
    _syncTicker();
  }

  bool get _needsTicker => _ctrl.autoRotate || (widget.model.animated && _ctrl.playing);

  String? _shownSelection;

  void _syncTicker() {
    if (_ctrl.selectedPartId != _shownSelection && mounted) {
      _shownSelection = _ctrl.selectedPartId;
      // Only the caption depends on the selection.
      setState(() {});
    }
    if (_needsTicker && !_ticker.isActive) {
      _last = Duration.zero;
      _ticker.start();
    } else if (!_needsTicker && _ticker.isActive) {
      _ticker.stop();
    }
  }

  void _onTick(Duration elapsed) {
    final dt = _last == Duration.zero ? 0.0 : (elapsed - _last).inMicroseconds / 1e6;
    _last = elapsed;
    _ctrl.tick(math.min(dt, 0.1), animated: widget.model.animated);
  }

  @override
  void dispose() {
    _ticker.dispose();
    _ctrl.removeListener(_syncTicker);
    if (widget.controller == null) _ctrl.dispose();
    _renderer.dispose();
    super.dispose();
  }

  RenderStyle _style(BuildContext context, Size size) {
    final c = context.colors;
    return RenderStyle(
      foreground: c.onSurface,
      labelBackground: c.surfaceContainerHighest,
      labelForeground: c.onSurface,
      accent: const Color(0xFFFFB300),
      onAccent: const Color(0xFF231A00),
      measure: Theme.of(context).brightness == Brightness.dark ? const Color(0xFFFFD54F) : const Color(0xFFC25E00),
      textStyle: context.text.labelLarge ?? const TextStyle(fontSize: 14),
      labelScale: (math.min(size.width, size.height) / 640).clamp(0.85, 1.35),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return LayoutBuilder(builder: (context, box) {
      final size = box.biggest;
      final compact = size.width < 560;
      final style = _style(context, size);
      final selected = _ctrl.selectedPartId == null ? null : widget.model.partById(_ctrl.selectedPartId!);
      return ClipRect(
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: const Alignment(0, -0.2),
              radius: 1.1,
              colors: [c.surfaceContainerHigh, c.surfaceContainerLowest],
            ),
          ),
          child: Stack(
            fit: StackFit.expand,
            children: [
              Listener(
                onPointerSignal: (e) {
                  if (e is PointerScrollEvent) _ctrl.zoomBy(math.pow(1.0015, -e.scrollDelta.dy).toDouble());
                },
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onScaleStart: (_) => _lastScale = 1,
                  onScaleUpdate: (d) {
                    if (d.pointerCount >= 2) {
                      _ctrl.zoomBy(d.scale / _lastScale);
                      _lastScale = d.scale;
                    }
                    _ctrl.rotateBy(d.focalPointDelta.dx * 0.45, d.focalPointDelta.dy * 0.45);
                  },
                  onDoubleTap: _ctrl.resetView,
                  onTapUp: (d) {
                    final paint = _ctrl.paintColor;
                    if (paint != null) {
                      final t = _renderer.hitTriangle(d.localPosition);
                      if (t != null) _ctrl.paintFaces(_renderer.planarFace(t), paint);
                      return;
                    }
                    final id = _renderer.hitTest(d.localPosition);
                    _ctrl.select(id == _ctrl.selectedPartId ? null : id);
                  },
                  child: CustomPaint(
                    key: const ValueKey('kx3d-canvas'),
                    painter: _ScenePainter(_renderer, _ctrl, style, widget.fitRadius),
                    size: Size.infinite,
                  ),
                ),
              ),
              Positioned(
                top: Kx.s12,
                left: Kx.s12,
                right: Kx.s12,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: widget.showHeader ? _Header(model: widget.model, compact: compact) : const SizedBox()),
                    const SizedBox(width: Kx.s8),
                    _Toolbar(ctrl: _ctrl, animated: widget.model.animated, leading: widget.toolbarLeading),
                  ],
                ),
              ),
              if (widget.showCaption && (selected != null || widget.model.caption.isNotEmpty))
                Positioned(
                  left: Kx.s12,
                  right: Kx.s12,
                  bottom: Kx.s12,
                  child: Align(
                    alignment: Alignment.bottomLeft,
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 640),
                      child: _CaptionCard(model: widget.model, selected: selected, onClose: () => _ctrl.select(null), compact: compact),
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
    });
  }
}

class _ScenePainter extends CustomPainter {
  _ScenePainter(this.renderer, this.ctrl, this.style, this.fitRadius) : super(repaint: ctrl);

  final SceneRenderer renderer;
  final ModelViewController ctrl;
  final RenderStyle style;
  final double? fitRadius;

  @override
  void paint(Canvas canvas, Size size) {
    renderer.paint(
      canvas,
      size,
      ctrl.camera,
      style,
      RenderOptions(labels: ctrl.labels, wireframe: ctrl.wireframe, selectedPartId: ctrl.selectedPartId, time: ctrl.time, faceColors: ctrl.faceColors),
      fitRadius: fitRadius,
    );
  }

  @override
  bool shouldRepaint(_ScenePainter old) =>
      old.renderer != renderer || old.style.foreground != style.foreground || old.style.labelScale != style.labelScale || old.fitRadius != fitRadius;
}

class _Header extends StatelessWidget {
  const _Header({required this.model, required this.compact});
  final Model3D model;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          model.title,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: (compact ? context.text.titleMedium : context.text.headlineSmall)?.copyWith(fontWeight: FontWeight.w600, color: c.onSurface),
        ),
        if (!compact && model.subjects.isNotEmpty) ...[
          const SizedBox(height: Kx.s4),
          Wrap(
            spacing: Kx.s4,
            runSpacing: Kx.s4,
            children: [
              for (final s in model.subjects)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: Kx.s8, vertical: 2),
                  decoration: BoxDecoration(color: c.secondaryContainer, borderRadius: Kx.radiusSm),
                  child: Text(s, style: context.text.labelMedium?.copyWith(color: c.onSecondaryContainer)),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

class _Toolbar extends StatelessWidget {
  const _Toolbar({required this.ctrl, required this.animated, required this.leading});
  final ModelViewController ctrl;
  final bool animated;
  final List<Widget> leading;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    Widget btn(String tip, IconData icon, VoidCallback onTap, {bool? on}) => IconButton(
          tooltip: tip,
          isSelected: on,
          onPressed: onTap,
          icon: Icon(icon),
          selectedIcon: Icon(icon, color: c.onSecondaryContainer),
          style: on == true ? IconButton.styleFrom(backgroundColor: c.secondaryContainer) : null,
        );
    return ListenableBuilder(
      listenable: ctrl,
      builder: (context, _) => Material(
        color: c.surfaceContainerHigh.withValues(alpha: 0.92),
        borderRadius: Kx.radiusXl,
        elevation: 1,
        child: Padding(
          padding: const EdgeInsets.all(Kx.s4),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              ...leading,
              btn('Reset view', Icons.center_focus_strong_outlined, ctrl.resetView),
              btn('Labels', Icons.label_outline, ctrl.toggleLabels, on: ctrl.labels),
              btn('Wireframe', Icons.grid_4x4, ctrl.toggleWireframe, on: ctrl.wireframe),
              btn('Auto-rotate', Icons.threesixty, ctrl.toggleAutoRotate, on: ctrl.autoRotate),
              if (animated) btn(ctrl.playing ? 'Pause' : 'Play', ctrl.playing ? Icons.pause : Icons.play_arrow, ctrl.togglePlaying),
            ],
          ),
        ),
      ),
    );
  }
}

class _CaptionCard extends StatelessWidget {
  const _CaptionCard({required this.model, required this.selected, required this.onClose, required this.compact});
  final Model3D model;
  final ModelPart? selected;
  final VoidCallback onClose;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final sel = selected;
    return Material(
      color: (sel != null ? c.tertiaryContainer : c.surfaceContainerHigh).withValues(alpha: 0.94),
      borderRadius: Kx.radiusLg,
      child: Padding(
        padding: EdgeInsets.fromLTRB(Kx.s16, Kx.s12, sel != null ? Kx.s4 : Kx.s16, Kx.s12),
        child: sel == null
            ? Text(
                model.caption,
                maxLines: compact ? 3 : 4,
                overflow: TextOverflow.ellipsis,
                style: (compact ? context.text.bodyMedium : context.text.bodyLarge)?.copyWith(color: c.onSurface),
              )
            : Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(sel.name!, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700, color: c.onTertiaryContainer)),
                        if (sel.description != null)
                          Text(
                            sel.description!,
                            maxLines: compact ? 3 : 4,
                            overflow: TextOverflow.ellipsis,
                            style: context.text.bodyMedium?.copyWith(color: c.onTertiaryContainer),
                          ),
                      ],
                    ),
                  ),
                  IconButton(tooltip: 'Close', onPressed: onClose, icon: Icon(Icons.close, color: c.onTertiaryContainer)),
                ],
              ),
      ),
    );
  }
}
