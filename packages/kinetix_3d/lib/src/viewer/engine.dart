import 'dart:async';
import 'dart:convert';

import 'package:flutter/widgets.dart';

import 'engine_stub.dart' if (dart.library.io) 'engine_io.dart' as platform;
import 'protocol.dart';
import 'scenes.dart';

/// The three.js viewer (assets/viewer3d) as seen from the app: open a model, send it
/// commands ([ViewerCommands]), hear what happens ([ViewerEvent]: a part tapped, the part
/// under the laser, a snapshot ready). On Android it runs in a WebView (webview_flutter),
/// on Windows in WebView2 (webview_windows), both fed by a small server on 127.0.0.1.
/// Where neither is available (tests, Linux, the web) [create] gives null and the app
/// falls back to the pure-Dart renderer or a parts list.
abstract class Viewer3dEngine {
  /// Everything the viewer says.
  Stream<ViewerEvent> get events;

  /// Loads [modelId] with labels in [lang] (en, hi, kn); a narrated scene is opened with
  /// [sceneTarget] as its model id.
  Future<void> open(String modelId, {required String lang});

  /// What [open] takes to open narrated scene [sceneId] ([ProcessScene]).
  static String sceneTarget(String sceneId) => 'scene:$sceneId';

  /// The scene [target] opens, if it is a [sceneTarget].
  static String? sceneOf(String target) => target.startsWith('scene:') ? target.substring(6) : null;

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

  /// The scene opened, if any, and where its timeline is (the fake plays it by the book).
  ProcessScene? scene;
  int sceneStep = 0;
  double sceneTime = 0;
  bool scenePlaying = false;
  double sceneSpeed = 1;

  @override
  Future<void> open(String modelId, {required String lang}) async {
    reset();
    opened.add('$modelId:$lang');
    scene = ProcessScene.byId(Viewer3dEngine.sceneOf(modelId));
    sceneStep = 0;
    sceneTime = 0;
    scenePlaying = scene != null;
    scheduleMicrotask(() {
      receive(ViewerEvent({'event': 'loaded', 'model': modelId}));
      if (scene != null) _tellScene();
    });
  }

  void _tellScene() => receive(ViewerEvent({
    'event': 'scene',
    'id': scene!.id,
    'step': sceneStep,
    'steps': scene!.steps.length,
    'time': sceneTime,
    'total': scene!.seconds,
    'playing': scenePlaying,
    'speed': sceneSpeed,
  }));

  void _scene(Map<String, dynamic> c) {
    final s = scene;
    if (s == null) return;
    void go(int i) {
      sceneStep = i.clamp(0, s.steps.length - 1);
      sceneTime = s.startOf(sceneStep);
    }

    switch (c['op']) {
      case 'play':
        scenePlaying = true;
      case 'pause':
        scenePlaying = false;
      case 'toggle':
        scenePlaying = !scenePlaying;
      case 'next':
        go(sceneStep + 1);
      case 'prev':
        go(sceneStep - 1);
      case 'step':
        go((c['step'] as num).toInt());
      case 'replay':
        go(0);
        scenePlaying = true;
      case 'seek':
        sceneTime = (c['time'] as num).toDouble().clamp(0, s.seconds);
        sceneStep = s.stepAt(sceneTime);
      case 'speed':
        sceneSpeed = (c['speed'] as num).toDouble();
    }
    scheduleMicrotask(_tellScene);
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
      case 'cut' when command['mode'] == 'peel':
        scheduleMicrotask(() => receive(ViewerEvent({'event': 'cut', 'mode': 'peel', 'layers': peelLayers, 'peel': command['peel']})));
      case 'annotate':
        _annotate(command);
      case 'scene':
        _scene(command);
    }
  }

  /// How many layers "peel" finds.
  int peelLayers = 4;

  /// The notes on the fake model, as the page would keep them.
  Map<String, dynamic> notes = {'v': 1, 'pins': <Object>[], 'strokes': <Object>[], 'ink': <Object>[]};
  var _ids = 0;
  final _draft = <List<double>>[];

  void _annotate(Map<String, dynamic> c) {
    List<Object?> list(String k) => notes[k] as List<Object?>;
    void tell([String? pin]) {
      final data = jsonDecode(jsonEncode(notes));
      scheduleMicrotask(() => receive(ViewerEvent({'event': 'annotations', 'data': data, 'pin': ?pin})));
    }

    switch (c['op']) {
      case 'set':
        notes = (jsonDecode(jsonEncode(c['data'])) as Map).cast<String, dynamic>();
      case 'pin':
        final part = partUnder?.call(Offset((c['x'] as num).toDouble(), (c['y'] as num).toDouble()));
        if (part == null) {
          scheduleMicrotask(() => receive(ViewerEvent({'event': 'noteMissed'})));
          return;
        }
        final id = 'p${_ids++}';
        list('pins').add({'id': id, 'part': part, 'at': [0.0, 0.0, 0.1], 'text': c['text'] ?? '', 'color': c['color']});
        tell(id);
      case 'stroke':
        for (final p in (c['pts'] as List? ?? const [])) {
          _draft.add([for (final v in p as List) (v as num).toDouble()]);
        }
        if (c['up'] != true || _draft.isEmpty) return;
        final surface = c['surface'] == true;
        list(surface ? 'strokes' : 'ink').add({
          'id': '${surface ? 's' : 'i'}${_ids++}',
          if (surface) 'part': partUnder?.call(Offset(_draft.first[0], _draft.first[1])) ?? 'part',
          'color': c['color'],
          'width': c['width'] ?? 2,
          'pts': surface ? [for (final p in _draft) [p[0], p[1], 0.0]] : List.of(_draft),
        });
        _draft.clear();
        tell();
      case 'update':
        for (final n in list('pins').cast<Map>()) {
          if (n['id'] != c['id']) continue;
          if (c['text'] != null) n['text'] = c['text'];
          if (c['color'] != null) n['color'] = c['color'];
        }
        tell();
      case 'delete':
        for (final k in ['pins', 'strokes', 'ink']) {
          list(k).removeWhere((n) => (n as Map)['id'] == c['id']);
        }
        tell();
      case 'clear':
        notes = {'v': 1, 'pins': <Object>[], 'strokes': <Object>[], 'ink': <Object>[]};
        tell();
    }
  }

  /// The last command named [cmd], if any.
  Map<String, dynamic>? lastOf(String cmd) => sent.where((c) => c['cmd'] == cmd).lastOrNull;

  /// Every command named [cmd], in order.
  List<Map<String, dynamic>> allOf(String cmd) => [for (final c in sent) if (c['cmd'] == cmd) c];

  @override
  Widget view() => const ColoredBox(key: ValueKey('fake-viewer'), color: Color(0xFF16191E), child: SizedBox.expand());
}
