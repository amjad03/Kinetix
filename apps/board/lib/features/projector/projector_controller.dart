import 'dart:async';
import 'dart:convert';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../../core/device_store.dart';
import '../board/live_stream.dart';
import 'projector_display.dart';

export 'projector_display.dart';

/// What the board screen gives projector mode: the whiteboard, and pictures of the 3D model or
/// lab open next to it.
class ProjectorSource {
  ProjectorSource({required this.board, required this.background, required this.canvas, this.captureSplit});

  final RecordableBoard board;
  final BoardBackground Function() background;
  final Size Function() canvas;

  /// A PNG of the lab open in the split pane, or null when none is open (the 3D viewer sends
  /// its own pictures through Model3dMirror).
  final Future<Uint8List?> Function()? captureSplit;
}

/// Projector mode (docs/hardware/projector-mode.md): the class sees the board on a second screen
/// (a projector or TV) without the teacher's tool rails and panels, and the 3D model or lab when
/// one is open.
///
/// The second screen runs its own Flutter engine ([projectorMain]); the board streams to it the
/// same event log the live view uses (kinetix_ink's lesson format), plus pictures of the 3D
/// model or lab. Nothing leaves the device.
///
/// On by default: the projector screen opens by itself when a display is attached ([auto]).
class ProjectorController extends ChangeNotifier {
  ProjectorController({ProjectorDisplay? display, DeviceStore? store, this.splitInterval = const Duration(milliseconds: 500)})
    : display = display ?? MethodChannelProjectorDisplay(),
      _store = store ?? DeviceStore();

  final ProjectorDisplay display;
  final DeviceStore _store;
  final Duration splitInterval;

  static const _enabledKey = 'projectorEnabled';
  static const _autoKey = 'projectorAuto';

  /// Board settings → Projector: the board may use a second screen at all.
  bool enabled = true;

  /// Open the projector screen as soon as a display is attached.
  bool auto = true;

  /// Second displays attached now.
  List<ExternalDisplay> displays = const [];

  /// The display the projector screen is open on.
  ExternalDisplay? showing;

  /// The class sees a blank screen (the teacher is preparing something).
  bool blank = false;

  ProjectorSource? _source;
  LiveStream? _stream;
  Timer? _splitTimer;
  bool _splitSent = false;
  String? _last3d;
  final List<StreamSubscription<void>> _subs = [];
  bool _disposed = false;

  bool get available => displays.isNotEmpty;
  bool get isShowing => showing != null;

  /// The 3D viewer's mirror wants pictures only while the class can see them.
  bool get wantsPictures => isShowing && !blank;

  Future<void> start() async {
    try {
      enabled = await _store.setting(_enabledKey) != 'false';
      auto = await _store.setting(_autoKey) != 'false';
    } catch (_) {}
    _subs
      ..add(display.changes.listen((_) => unawaited(refresh())))
      ..add(display.ready.listen((_) => resend()));
    await refresh();
  }

  /// Looks for displays again; opens or closes the projector screen to match.
  Future<void> refresh() async {
    final found = await display.displays();
    if (_disposed) return;
    displays = found;
    final current = showing;
    if (current != null && !found.contains(current)) {
      // Unplugged.
      showing = null;
      _stopStream();
    }
    if (showing == null && enabled && auto && found.isNotEmpty) {
      await show(found.first);
      return;
    }
    notifyListeners();
  }

  /// Opens the projector screen on [d] (the first display by default).
  Future<void> show([ExternalDisplay? d]) async {
    d ??= displays.firstOrNull;
    if (d == null || !enabled) return;
    if (!await display.show(d)) {
      notifyListeners();
      return;
    }
    showing = d;
    _startStream();
    notifyListeners();
  }

  Future<void> hide() async {
    if (showing == null) return;
    showing = null;
    _stopStream();
    notifyListeners();
    await display.hide();
  }

  void setEnabled(bool on) {
    enabled = on;
    unawaited(_store.setSetting(_enabledKey, '$on').catchError((_) {}));
    if (!on) {
      unawaited(hide());
    } else if (auto && displays.isNotEmpty) {
      unawaited(show());
    }
    notifyListeners();
  }

  void setAuto(bool on) {
    auto = on;
    unawaited(_store.setSetting(_autoKey, '$on').catchError((_) {}));
    notifyListeners();
  }

  void setBlank(bool on) {
    blank = on;
    _send({'t': 'blank', 'on': on});
    notifyListeners();
  }

  /// The board screen hands over its whiteboard (and takes it back with null when it closes).
  void attach(ProjectorSource? source) {
    _stopStream();
    _source = source;
    if (isShowing) _startStream();
  }

  /// The 3D viewer's picture (Model3dMirror), null when the model closes.
  void send3d(Uint8List? jpg) {
    _last3d = jpg == null ? null : base64Encode(jpg);
    _send({'t': 'img', 'k': 'm3d', 'd': _last3d});
  }

  /// The projector screen (re)started: everything again.
  void resend() {
    if (!isShowing) return;
    _send({'t': 'blank', 'on': blank});
    _send({'t': 'img', 'k': 'm3d', 'd': _last3d});
    _splitSent = false;
    final s = _source;
    final stream = _stream;
    if (s != null && stream != null) stream.start(background: s.background(), canvas: s.canvas());
  }

  void _startStream() {
    final s = _source;
    if (s == null || _stream != null) return;
    _stream = LiveStream(board: s.board, send: (events) => _send({'t': 'ev', 'e': events}))..start(background: s.background(), canvas: s.canvas());
    _send({'t': 'blank', 'on': blank});
    if (s.captureSplit != null) _splitTimer = Timer.periodic(splitInterval, (_) => unawaited(_sendSplit()));
  }

  void _stopStream() {
    _stream?.stop();
    _stream = null;
    _splitTimer?.cancel();
    _splitTimer = null;
    _splitSent = false;
  }

  bool _capturing = false;

  Future<void> _sendSplit() async {
    final capture = _source?.captureSplit;
    if (capture == null || _capturing || blank) return;
    _capturing = true;
    try {
      final png = await capture();
      if (png == null) {
        if (_splitSent) _send({'t': 'img', 'k': 'split', 'd': null});
        _splitSent = false;
      } else {
        _send({'t': 'img', 'k': 'split', 'd': base64Encode(png)});
        _splitSent = true;
      }
    } catch (e) {
      debugPrint('Lab picture not taken: $e');
    } finally {
      _capturing = false;
    }
  }

  /// Background changes reach the projector with the next frame.
  set background(BoardBackground b) => _stream?.background = b;

  void _send(Map<String, Object?> message) {
    if (!isShowing) return;
    unawaited(display.send(jsonEncode(message)));
  }

  @override
  void dispose() {
    _disposed = true;
    _stopStream();
    for (final s in _subs) {
      unawaited(s.cancel());
    }
    super.dispose();
  }
}
