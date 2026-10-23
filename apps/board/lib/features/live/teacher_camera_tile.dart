import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:image/image.dart' as img;
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import '../../core/class_camera/teacher_camera.dart';
import '../../l10n/l10n.dart';
import '../board/chrome.dart' show showBoardMessage;
import '../doc_camera/doc_camera.dart' show DocCameraSource;

/// The teacher's camera: a webcam (or the panel's own camera) facing the teacher.
class PluginTeacherCamera implements DocCameraSource {
  CameraController? _c;
  List<CameraDescription> _cameras = const [];
  int _i = 0;

  @override
  int get cameraCount => _cameras.length;

  @override
  Future<bool> start() async {
    if (Platform.environment.containsKey('FLUTTER_TEST')) return false;
    try {
      _cameras = await availableCameras();
      if (_cameras.isEmpty) return false;
      final front = _cameras.indexWhere((c) => c.lensDirection == CameraLensDirection.front);
      final ext = _cameras.indexWhere((c) => c.lensDirection == CameraLensDirection.external);
      _i = front >= 0 ? front : (ext >= 0 ? ext : 0);
      return await _open();
    } catch (e) {
      debugPrint('Teacher camera: $e');
      return false;
    }
  }

  Future<bool> _open() async {
    await _c?.dispose();
    final c = CameraController(_cameras[_i], ResolutionPreset.medium, enableAudio: false);
    _c = c;
    await c.initialize();
    return true;
  }

  @override
  Widget preview() {
    final c = _c;
    if (c == null || !c.value.isInitialized) return const SizedBox.expand();
    return FittedBox(fit: BoxFit.cover, clipBehavior: Clip.hardEdge, child: SizedBox(width: 320, height: 320 / c.value.aspectRatio, child: CameraPreview(c)));
  }

  @override
  Future<Uint8List?> takePicture() async => null;

  @override
  Future<void> next() async {
    if (_cameras.length < 2) return;
    _i = (_i + 1) % _cameras.length;
    await _open();
  }

  @override
  Future<void> dispose() async => _c?.dispose();
}

/// The teacher camera's tile over the board: draggable, with the camera's picture. While it
/// shows, it gives [TeacherCamera] small JPEG pictures of itself for remote viewers.
class TeacherCameraTile extends StatefulWidget {
  const TeacherCameraTile({super.key, required this.camera, required this.area});

  final TeacherCamera camera;

  /// The board area the tile moves in.
  final Size area;

  /// Where the camera comes from; tests put a fake here.
  static DocCameraSource Function() source = PluginTeacherCamera.new;

  @override
  State<TeacherCameraTile> createState() => _TeacherCameraTileState();
}

class _TeacherCameraTileState extends State<TeacherCameraTile> {
  static const _size = Size(240, 180);
  final _shot = GlobalKey();
  late final DocCameraSource _source = TeacherCameraTile.source();
  bool _ready = false;
  Offset? _at;

  @override
  void initState() {
    super.initState();
    unawaited(_start());
  }

  Future<void> _start() async {
    final ok = await _source.start();
    if (!mounted) return;
    if (!ok) {
      showBoardMessage(context, context.l10n.cameraNotAvailable);
      widget.camera.turnOff();
      return;
    }
    setState(() => _ready = true);
    widget.camera.grab = _grab;
  }

  /// The tile as a 320-pixel-wide JPEG.
  Future<Uint8List?> _grab() async {
    final b = _shot.currentContext?.findRenderObject();
    if (b is! RenderRepaintBoundary || !b.attached || b.debugNeedsPaint) return null;
    final image = await b.toImage(pixelRatio: 320 / _size.width);
    try {
      final data = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
      if (data == null) return null;
      return encodeCameraJpeg(data.buffer.asUint8List(), image.width, image.height);
    } finally {
      image.dispose();
    }
  }

  @override
  void dispose() {
    widget.camera.grab = null;
    unawaited(_source.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final area = widget.area;
    final at = _at ?? Offset(area.width - _size.width - Kx.s16, area.height - _size.height - 96);
    final clamped = Offset(at.dx.clamp(0, (area.width - _size.width).clamp(0, double.infinity)), at.dy.clamp(0, (area.height - _size.height).clamp(0, double.infinity)));
    return Positioned(
      left: clamped.dx,
      top: clamped.dy,
      child: GestureDetector(
        key: const Key('teacher-camera-tile'),
        onPanUpdate: (d) => setState(() => _at = clamped + d.delta),
        child: Material(
          elevation: 6,
          borderRadius: Kx.radiusLg,
          clipBehavior: Clip.antiAlias,
          child: SizedBox.fromSize(
            size: _size,
            child: Stack(
              fit: StackFit.expand,
              children: [
                RepaintBoundary(
                  key: _shot,
                  child: ColoredBox(color: const Color(0xFF000000), child: _ready ? _source.preview() : const Center(child: CircularProgressIndicator())),
                ),
                Positioned(
                  top: 4,
                  right: 4,
                  child: IconButton.filledTonal(
                    key: const Key('teacher-camera-close'),
                    tooltip: context.l10n.cameraHide,
                    iconSize: 18,
                    onPressed: widget.camera.turnOff,
                    icon: const Icon(Icons.videocam_off_outlined),
                  ),
                ),
                if (widget.camera.sending)
                  Positioned(
                    left: 6,
                    bottom: 6,
                    child: Chip(
                      key: const Key('teacher-camera-live'),
                      visualDensity: VisualDensity.compact,
                      avatar: const Icon(Icons.sensors, size: 14, color: Color(0xFFD93025)),
                      label: Text(context.l10n.cameraLive),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// RGBA pixels as a JPEG small enough to send several times a second.
Uint8List encodeCameraJpeg(Uint8List rgba, int width, int height, {int quality = 60}) {
  final image = img.Image.fromBytes(width: width, height: height, bytes: rgba.buffer, bytesOffset: rgba.offsetInBytes, numChannels: 4, order: img.ChannelOrder.rgba);
  return img.encodeJpg(image, quality: quality);
}

/// The camera button beside class audio: shows or hides the teacher's camera tile.
class TeacherCameraButton extends StatelessWidget {
  const TeacherCameraButton({super.key, required this.board});

  final BoardController board;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final cam = board.teacherCamera;
    return IconButton(
      key: const Key('teacher-camera'),
      tooltip: cam.on ? l.cameraHide : l.cameraShow,
      isSelected: cam.on,
      onPressed: () {
        if (cam.on) {
          cam.turnOff();
        } else {
          cam.turnOn();
          if (board.classLive) showBoardMessage(context, l.cameraLiveNote);
        }
      },
      icon: const Icon(Icons.videocam_off_outlined),
      selectedIcon: const Icon(Icons.videocam),
    );
  }
}
