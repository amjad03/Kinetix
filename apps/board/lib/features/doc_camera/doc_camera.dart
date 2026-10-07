import 'dart:async';
import 'dart:io' show Platform;
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/feature_strings.dart';
import '../board/chrome.dart' show showBoardMessage;
import '../insert/insert_actions.dart' show placePicture;

/// The document camera's words.
FeatureStrings docCameraStrings(BuildContext context) => FeatureStrings(boardLang(context), docCameraStringTable);

const docCameraStringTable = <String, Map<String, String>>{
  'en': {
    'title': 'Document camera',
    'freeze': 'Freeze',
    'live': 'Live',
    'capture': 'Add to board',
    'zoom': 'Zoom',
    'rotate': 'Rotate',
    'annotate': 'Annotate',
    'clear': 'Clear marks',
    'switch': 'Next camera',
    'noCamera': 'No camera found. Connect a visualiser (USB document camera) or allow the camera in settings.',
    'starting': 'Starting the camera…',
    'added': 'The camera picture is on the board',
    'failed': 'Could not take the picture',
    'retry': 'Try again',
  },
  'hi': {
    'title': 'डॉक्यूमेंट कैमरा',
    'freeze': 'रोकें',
    'live': 'लाइव',
    'capture': 'बोर्ड पर जोड़ें',
    'zoom': 'ज़ूम',
    'rotate': 'घुमाएँ',
    'annotate': 'निशान लगाएँ',
    'clear': 'निशान मिटाएँ',
    'switch': 'अगला कैमरा',
    'noCamera': 'कोई कैमरा नहीं मिला। विज़ुअलाइज़र (USB डॉक्यूमेंट कैमरा) जोड़ें या सेटिंग में कैमरे की अनुमति दें।',
    'starting': 'कैमरा शुरू हो रहा है…',
    'added': 'कैमरे का चित्र बोर्ड पर है',
    'failed': 'चित्र नहीं लिया जा सका',
    'retry': 'फिर से कोशिश करें',
  },
  'kn': {
    'title': 'ಡಾಕ್ಯುಮೆಂಟ್ ಕ್ಯಾಮೆರಾ',
    'freeze': 'ನಿಲ್ಲಿಸಿ',
    'live': 'ಲೈವ್',
    'capture': 'ಬೋರ್ಡ್‌ಗೆ ಸೇರಿಸಿ',
    'zoom': 'ಜೂಮ್',
    'rotate': 'ತಿರುಗಿಸಿ',
    'annotate': 'ಗುರುತು ಹಾಕಿ',
    'clear': 'ಗುರುತು ಅಳಿಸಿ',
    'switch': 'ಮುಂದಿನ ಕ್ಯಾಮೆರಾ',
    'noCamera': 'ಕ್ಯಾಮೆರಾ ಸಿಗಲಿಲ್ಲ. ವಿಶುವಲೈಸರ್ (USB ಡಾಕ್ಯುಮೆಂಟ್ ಕ್ಯಾಮೆರಾ) ಜೋಡಿಸಿ ಅಥವಾ ಸೆಟ್ಟಿಂಗ್‌ನಲ್ಲಿ ಕ್ಯಾಮೆರಾಗೆ ಅನುಮತಿ ನೀಡಿ.',
    'starting': 'ಕ್ಯಾಮೆರಾ ಆರಂಭವಾಗುತ್ತಿದೆ…',
    'added': 'ಕ್ಯಾಮೆರಾ ಚಿತ್ರ ಬೋರ್ಡ್‌ನಲ್ಲಿದೆ',
    'failed': 'ಚಿತ್ರ ತೆಗೆಯಲಾಗಲಿಲ್ಲ',
    'retry': 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',
  },
};

/// Where the document camera's pictures come from: the device's camera (a USB visualiser on a
/// Windows panel, the panel's own camera on Android). Tests put a fake in [create].
abstract class DocCameraSource {
  static DocCameraSource Function() create = PluginDocCamera.new;

  /// False when there is no camera (or it was refused).
  Future<bool> start();

  /// The live picture.
  Widget preview();

  /// A still of what the camera sees now (JPEG or PNG).
  Future<Uint8List?> takePicture();

  /// How many cameras there are; [next] moves to the next one.
  int get cameraCount;
  Future<void> next();

  Future<void> dispose();
}

/// The `camera` plugin (camera_android_camerax, camera_windows).
class PluginDocCamera implements DocCameraSource {
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
      // A visualiser plugged in shows up as an external camera; else the one facing away.
      final ext = _cameras.indexWhere((c) => c.lensDirection == CameraLensDirection.external);
      final back = _cameras.indexWhere((c) => c.lensDirection == CameraLensDirection.back);
      _i = ext >= 0 ? ext : (back >= 0 ? back : 0);
      return await _open();
    } catch (e) {
      debugPrint('Document camera: $e');
      return false;
    }
  }

  Future<bool> _open() async {
    await _c?.dispose();
    final c = CameraController(_cameras[_i], ResolutionPreset.high, enableAudio: false);
    _c = c;
    await c.initialize();
    return true;
  }

  @override
  Widget preview() {
    final c = _c;
    if (c == null || !c.value.isInitialized) return const SizedBox.expand();
    return AspectRatio(aspectRatio: c.value.aspectRatio, child: CameraPreview(c));
  }

  @override
  Future<Uint8List?> takePicture() async {
    final c = _c;
    if (c == null || !c.value.isInitialized) return null;
    final f = await c.takePicture();
    return f.readAsBytes();
  }

  @override
  Future<void> next() async {
    if (_cameras.length < 2) return;
    _i = (_i + 1) % _cameras.length;
    await _open();
  }

  @override
  Future<void> dispose() async => _c?.dispose();
}

/// The document camera (visualiser) in the split panel: the live camera, Freeze, zoom, rotate,
/// annotate over it, and "Add to board" (the picture as the class sees it, marks included).
class DocCameraPanel extends StatefulWidget {
  const DocCameraPanel({super.key, required this.wb});

  final WhiteboardController wb;

  @override
  State<DocCameraPanel> createState() => DocCameraPanelState();
}

class DocCameraPanelState extends State<DocCameraPanel> {
  late final DocCameraSource _camera = DocCameraSource.create();
  bool? _ready;
  Uint8List? _frozen;
  double zoom = 1;
  int quarterTurns = 0;
  bool _annotate = false;
  Color _penColor = const Color(0xFFE53935);
  final strokes = <(Color, List<Offset>)>[];
  Size _view = Size.zero;
  bool _busy = false;

  bool get frozen => _frozen != null;

  @override
  void initState() {
    super.initState();
    unawaited(_start());
  }

  Future<void> _start() async {
    setState(() => _ready = null);
    final ok = await _camera.start();
    if (mounted) setState(() => _ready = ok);
  }

  @override
  void dispose() {
    unawaited(_camera.dispose());
    super.dispose();
  }

  Future<void> toggleFreeze() async {
    if (_frozen != null) {
      setState(() => _frozen = null);
      return;
    }
    final shot = await _camera.takePicture();
    if (mounted && shot != null) setState(() => _frozen = shot);
  }

  /// Puts the picture (frozen, or taken now) on the board, turned and zoomed as shown, with
  /// the marks drawn over it.
  Future<void> capture() async {
    if (_busy) return;
    final s = docCameraStrings(context);
    _busy = true;
    try {
      final photo = _frozen ?? await _camera.takePicture();
      if (photo == null) throw StateError('no picture');
      final png = await composeDocCameraShot(photo, view: _view.isEmpty ? const Size(1280, 720) : _view, quarterTurns: quarterTurns, zoom: zoom, strokes: strokes);
      placePicture(widget.wb, png, Size(_view.width * 2, _view.height * 2), maxWidth: 720);
      if (mounted) showBoardMessage(context, s['added']);
    } catch (e) {
      debugPrint('Document camera capture: $e');
      if (mounted) showBoardMessage(context, s['failed']);
    } finally {
      _busy = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = docCameraStrings(context);
    final c = context.colors;
    Widget body;
    if (_ready == null) {
      body = Center(child: Column(mainAxisSize: MainAxisSize.min, children: [const CircularProgressIndicator(), const SizedBox(height: Kx.s12), Text(s['starting'])]));
    } else if (_ready == false) {
      body = Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Kx.s24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.videocam_off_outlined, size: 56, color: c.onSurfaceVariant),
              const SizedBox(height: Kx.s12),
              Text(s['noCamera'], key: const Key('doccam-none'), textAlign: TextAlign.center),
              const SizedBox(height: Kx.s12),
              FilledButton.tonal(onPressed: _start, child: Text(s['retry'])),
            ],
          ),
        ),
      );
    } else {
      final picture = _frozen != null ? Image.memory(_frozen!, key: const Key('doccam-frozen'), fit: BoxFit.contain, gaplessPlayback: true) : _camera.preview();
      body = LayoutBuilder(
        builder: (context, box) {
          _view = box.biggest;
          return ClipRect(
            child: Stack(
              fit: StackFit.expand,
              children: [
                ColoredBox(color: Colors.black, child: Transform.scale(scale: zoom, child: RotatedBox(quarterTurns: quarterTurns, child: Center(child: picture)))),
                IgnorePointer(
                  ignoring: !_annotate,
                  child: GestureDetector(
                    key: const Key('doccam-ink'),
                    behavior: HitTestBehavior.opaque,
                    onPanStart: (d) => setState(() => strokes.add((_penColor, [d.localPosition]))),
                    onPanUpdate: (d) => setState(() => strokes.last.$2.add(d.localPosition)),
                    child: CustomPaint(painter: _MarksPainter(strokes), size: Size.infinite),
                  ),
                ),
                if (_frozen != null)
                  Positioned(
                    left: Kx.s8,
                    top: Kx.s8,
                    child: Chip(avatar: const Icon(Icons.pause, size: 16), label: Text(s['freeze']), visualDensity: VisualDensity.compact),
                  ),
              ],
            ),
          );
        },
      );
    }
    final controls = Wrap(
      spacing: Kx.s8,
      runSpacing: Kx.s8,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        FilledButton.tonalIcon(
          key: const Key('doccam-freeze'),
          onPressed: _ready == true ? toggleFreeze : null,
          icon: Icon(_frozen != null ? Icons.play_arrow : Icons.pause),
          label: Text(_frozen != null ? s['live'] : s['freeze']),
        ),
        IconButton.filledTonal(
          key: const Key('doccam-rotate'),
          tooltip: s['rotate'],
          onPressed: () => setState(() => quarterTurns = (quarterTurns + 1) % 4),
          icon: const Icon(Icons.rotate_90_degrees_cw_outlined),
        ),
        IconButton(
          key: const Key('doccam-annotate'),
          tooltip: s['annotate'],
          isSelected: _annotate,
          onPressed: () => setState(() => _annotate = !_annotate),
          icon: const Icon(Icons.edit_outlined),
          selectedIcon: const Icon(Icons.edit),
        ),
        if (_annotate)
          for (final col in const [Color(0xFFE53935), Color(0xFF1E88E5), Color(0xFFFDD835), Color(0xFF212121)])
            InkWell(
              onTap: () => setState(() => _penColor = col),
              customBorder: const CircleBorder(),
              child: Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(color: col, shape: BoxShape.circle, border: Border.all(color: _penColor == col ? c.primary : c.outlineVariant, width: 3)),
              ),
            ),
        if (strokes.isNotEmpty)
          IconButton(key: const Key('doccam-clear'), tooltip: s['clear'], onPressed: () => setState(strokes.clear), icon: const Icon(Icons.layers_clear_outlined)),
        if (_camera.cameraCount > 1)
          IconButton(key: const Key('doccam-switch'), tooltip: s['switch'], onPressed: () async {
            await _camera.next();
            if (mounted) setState(() {});
          }, icon: const Icon(Icons.cameraswitch_outlined)),
        SizedBox(
          width: 200,
          child: Row(
            children: [
              const Icon(Icons.zoom_in, size: 20),
              Expanded(
                child: Slider(key: const Key('doccam-zoom'), value: zoom, min: 1, max: 4, label: '${zoom.toStringAsFixed(1)}×', onChanged: (v) => setState(() => zoom = v)),
              ),
            ],
          ),
        ),
        FilledButton.icon(key: const Key('doccam-capture'), onPressed: _ready == true ? capture : null, icon: const Icon(Icons.add_photo_alternate_outlined), label: Text(s['capture'])),
      ],
    );
    return Column(
      key: const Key('doccam-panel'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(child: body),
        Padding(padding: const EdgeInsets.all(Kx.s8), child: controls),
      ],
    );
  }
}

class _MarksPainter extends CustomPainter {
  _MarksPainter(this.strokes);
  final List<(Color, List<Offset>)> strokes;

  @override
  void paint(Canvas canvas, Size size) => paintMarks(canvas, strokes);

  @override
  bool shouldRepaint(_MarksPainter old) => true;
}

void paintMarks(Canvas canvas, List<(Color, List<Offset>)> strokes) {
  for (final (color, pts) in strokes) {
    final p = Paint()
      ..color = color
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;
    if (pts.length == 1) {
      canvas.drawCircle(pts.first, 3, p..style = PaintingStyle.fill);
    } else {
      canvas.drawPath(Path()..addPolygon(pts, false), p);
    }
  }
}

/// The camera's [photo] as the panel shows it ([view] big, turned [quarterTurns] times, zoomed
/// [zoom] times about the middle) with [strokes] over it, as a PNG twice the view's size.
Future<Uint8List> composeDocCameraShot(Uint8List photo, {required Size view, required int quarterTurns, required double zoom, required List<(Color, List<Offset>)> strokes}) async {
  final codec = await ui.instantiateImageCodec(photo);
  final frame = await codec.getNextFrame();
  final img = frame.image;
  const k = 2.0;
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  canvas.scale(k);
  canvas.drawRect(Offset.zero & view, Paint()..color = const Color(0xFF000000));
  canvas.save();
  canvas.clipRect(Offset.zero & view);
  canvas.translate(view.width / 2, view.height / 2);
  canvas.scale(zoom);
  canvas.rotate(quarterTurns * math.pi / 2);
  final box = quarterTurns.isOdd ? Size(view.height, view.width) : view;
  final iw = img.width.toDouble(), ih = img.height.toDouble();
  final fit = math.min(box.width / iw, box.height / ih);
  final dst = Rect.fromCenter(center: Offset.zero, width: iw * fit, height: ih * fit);
  canvas.drawImageRect(img, Offset.zero & Size(iw, ih), dst, Paint()..filterQuality = FilterQuality.medium);
  canvas.restore();
  paintMarks(canvas, strokes);
  final out = await recorder.endRecording().toImage((view.width * k).round(), (view.height * k).round());
  try {
    final data = await out.toByteData(format: ui.ImageByteFormat.png);
    return Uint8List.view(data!.buffer);
  } finally {
    out.dispose();
    img.dispose();
  }
}
