import 'dart:async';

import 'package:flutter/widgets.dart';

import 'engine_stub.dart' if (dart.library.io) 'engine_io.dart' as platform;
import 'protocol.dart';

/// The three.js viewer (assets/viewer3d) as seen from the app: open a model, send it
/// commands ([ViewerCommands]), hear what happens ([ViewerEvent]: a part tapped, the part
/// under the laser, a snapshot ready). On Android it runs in a WebView (webview_flutter),
/// on Windows in WebView2 (webview_windows), both fed by a small server on 127.0.0.1.
/// Where neither is available (tests, Linux, the web) [create] gives null and the app
/// falls back to the pure-Dart renderer or a parts list.
abstract class Viewer3dEngine {
  /// Everything the viewer says.
  Stream<ViewerEvent> get events;

  /// Loads [modelId] with labels in [lang] (en, hi, kn).
  Future<void> open(String modelId, {required String lang});

  /// Sends a command; commands sent before the model has loaded wait for it.
  void send(Map<String, dynamic> command);

  Widget view();

  void dispose();

  /// Tests replace the platform viewer with a fake ([FakeViewerEngine]).
  static Viewer3dEngine? Function()? debugOverride;

  /// The viewer for this platform, or null where there is none.
  static Viewer3dEngine? create() => debugOverride != null ? debugOverride!() : platform.createEngine();

  /// Whether [create] would give a viewer.
  static bool get available => debugOverride != null || platform.engineAvailable();
}

/// Shared by the engines: decoding, and holding commands until the model is there.
abstract class QueuedEngine implements Viewer3dEngine {
  final _events = StreamController<ViewerEvent>.broadcast();
  final _waiting = <Map<String, dynamic>>[];
  bool _loaded = false;
  bool disposed = false;

  @override
  Stream<ViewerEvent> get events => _events.stream;

  /// Delivers a command to the page.
  void deliver(Map<String, dynamic> command);

  @override
  void send(Map<String, dynamic> command) {
    if (disposed) return;
    if (_loaded) {
      deliver(command);
    } else {
      _waiting.add(command);
    }
  }

  /// Called with each message from the page.
  void receive(Object? message) {
    if (disposed) return;
    final event = message is ViewerEvent ? message : ViewerEvent.decode(message);
    if (event == null) return;
    if (event.type == 'loaded') {
      _loaded = true;
      for (final c in _waiting) {
        deliver(c);
      }
      _waiting.clear();
    }
    _events.add(event);
  }

  /// A new model is opening: hold commands again until it has loaded.
  void reset() => _loaded = false;

  @override
  void dispose() {
    disposed = true;
    _events.close();
  }
}

/// For tests: records commands and plays the viewer's part.
class FakeViewerEngine extends QueuedEngine {
  FakeViewerEngine() {
    last = this;
  }

  /// The most recent fake made (the one a widget under test is using).
  static FakeViewerEngine? last;

  final opened = <String>[];
  final sent = <Map<String, dynamic>>[];

  /// The answer to a snapshot request, and the picture sent while mirroring (a 1×1 PNG).
  String snapshotPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  /// What the "laser" finds under its tip: the part for a point (0..1), or null.
  String? Function(Offset at)? partUnder;

  @override
  Future<void> open(String modelId, {required String lang}) async {
    reset();
    opened.add('$modelId:$lang');
    scheduleMicrotask(() => receive(ViewerEvent({'event': 'loaded', 'model': modelId})));
  }

  @override
  void deliver(Map<String, dynamic> command) {
    sent.add(command);
    switch (command['cmd']) {
      case 'snapshot':
        scheduleMicrotask(() => receive(ViewerEvent({'event': 'snapshot', 'png': snapshotPng})));
      case 'mirror' when command['on'] == true:
        scheduleMicrotask(() => receive(ViewerEvent({'event': 'frame', 'jpg': snapshotPng})));
      case 'laser':
        final pts = command['pts'] as List?;
        if (command['off'] == true) {
          scheduleMicrotask(() => receive(ViewerEvent({'event': 'laser', 'part': null})));
        } else if (pts != null && pts.isNotEmpty && partUnder != null) {
          final tip = pts.last as List;
          final part = partUnder!(Offset((tip[0] as num).toDouble(), (tip[1] as num).toDouble()));
          scheduleMicrotask(() => receive(ViewerEvent({'event': 'laser', 'part': part})));
        }
      case 'pick':
        scheduleMicrotask(() => receive(ViewerEvent({'event': 'pick', 'part': command['part']})));
    }
  }

  /// The last command named [cmd], if any.
  Map<String, dynamic>? lastOf(String cmd) => sent.where((c) => c['cmd'] == cmd).lastOrNull;

  /// Every command named [cmd], in order.
  List<Map<String, dynamic>> allOf(String cmd) => [for (final c in sent) if (c['cmd'] == cmd) c];

  @override
  Widget view() => const ColoredBox(key: ValueKey('fake-viewer'), color: Color(0xFF16191E), child: SizedBox.expand());
}
