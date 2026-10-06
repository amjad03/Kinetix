import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_windows/webview_windows.dart' as win;

import 'engine.dart';
import 'manifest.dart';
import 'protocol.dart';

const _background = Color(0xFF16191E);

/// Under `flutter test` there is no WebView, whatever the host.
bool get _testing => Platform.environment.containsKey('FLUTTER_TEST');

bool engineAvailable() {
  if (_testing) return false;
  if (Platform.isAndroid || Platform.isIOS) return WebViewPlatform.instance != null;
  return Platform.isWindows;
}

Viewer3dEngine? createEngine() {
  if (!engineAvailable()) return null;
  return Platform.isWindows ? _WebView2Engine() : _WebViewEngine();
}

/// Serves the viewer and its models from the app's assets on 127.0.0.1 only (never the
/// school network), so the page can fetch its files the way a web page does. One server
/// for the whole app.
class ViewerServer {
  static Future<String>? _base;

  static Future<String> start() => _base ??= _start();

  static Future<String> _start() async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen(_serve, onError: (Object e) => debugPrint('3D viewer server: $e'));
    return 'http://127.0.0.1:${server.port}';
  }

  static const _types = {
    'html': 'text/html; charset=utf-8',
    'js': 'text/javascript; charset=utf-8',
    'json': 'application/json; charset=utf-8',
    'glb': 'model/gltf-binary',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'txt': 'text/plain; charset=utf-8',
  };

  static Future<void> _serve(HttpRequest req) async {
    final res = req.response;
    try {
      final path = Uri.decodeComponent(req.uri.path).replaceFirst(RegExp(r'^/+'), '');
      if (path.contains('..')) throw const FileSystemException('outside the viewer');
      final data = await loadViewerAsset(path.isEmpty ? 'index.html' : path);
      res.headers.contentType = ContentType.parse(_types[path.split('.').last] ?? 'application/octet-stream');
      res.add(data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes));
    } catch (_) {
      res.statusCode = HttpStatus.notFound;
    }
    await res.close();
  }

  /// The page for [modelId] (or a scene: [Viewer3dEngine.sceneTarget]) in [lang].
  static Future<Uri> pageFor(String modelId, String lang) async {
    final scene = Viewer3dEngine.sceneOf(modelId);
    final what = scene != null ? 'scene=${Uri.encodeComponent(scene)}' : 'model=${Uri.encodeComponent(modelId)}';
    return Uri.parse('${await start()}/index.html?$what&lang=$lang');
  }
}

/// Android (and iOS): the system WebView through webview_flutter.
class _WebViewEngine extends QueuedEngine {
  late final WebViewController _controller = WebViewController()
    ..setJavaScriptMode(JavaScriptMode.unrestricted)
    ..setBackgroundColor(_background)
    ..addJavaScriptChannel('KX', onMessageReceived: (m) => receive(m.message))
    ..setNavigationDelegate(NavigationDelegate(
      onWebResourceError: (e) {
        if (e.isForMainFrame ?? true) receive(ViewerEvent({'event': 'error', 'message': e.description}));
      },
    ));

  @override
  Future<void> open(String modelId, {required String lang}) async {
    reset();
    await _controller.loadRequest(await ViewerServer.pageFor(modelId, lang));
  }

  @override
  void deliver(Map<String, dynamic> command) {
    _controller.runJavaScript('kx.cmd(${jsonEncode(command)})').catchError((Object e) {
      debugPrint('3D viewer command ${command['cmd']} failed: $e');
    });
  }

  @override
  Widget view() => WebViewWidget(
    controller: _controller,
    // The model takes every touch: one finger turns it, two zoom and move.
    gestureRecognizers: {Factory<OneSequenceGestureRecognizer>(() => EagerGestureRecognizer())},
  );

  @override
  void dispose() {
    super.dispose();
    // Stop the page's drawing loop straight away.
    unawaited(_controller.loadRequest(Uri.parse('about:blank')).catchError((_) {}));
  }
}

/// Windows: Edge WebView2 through webview_windows. Panels without the WebView2 runtime
/// get an error event marked `noViewer`, and the app falls back.
class _WebView2Engine extends QueuedEngine {
  final _controller = win.WebviewController();
  final _subs = <StreamSubscription<Object?>>[];
  Future<void>? _ready;

  Future<void> _init() async {
    await _controller.initialize();
    await _controller.setBackgroundColor(_background);
    await _controller.setPopupWindowPolicy(win.WebviewPopupWindowPolicy.deny);
    _subs
      ..add(_controller.webMessage.listen(receive, onError: (Object e) => debugPrint('3D viewer sent something unreadable: $e')))
      ..add(_controller.onLoadError.listen((e) => receive(ViewerEvent({'event': 'error', 'message': 'load: ${e.name}'}))));
  }

  @override
  Future<void> open(String modelId, {required String lang}) async {
    reset();
    try {
      await (_ready ??= _init());
    } catch (e) {
      receive(ViewerEvent({'event': 'error', 'message': 'WebView2 is not available: $e', 'noViewer': true}));
      return;
    }
    await _controller.loadUrl((await ViewerServer.pageFor(modelId, lang)).toString());
  }

  @override
  void deliver(Map<String, dynamic> command) {
    if (disposed || !_controller.value.isInitialized) return;
    _controller.executeScript('kx.cmd(${jsonEncode(command)})').catchError((Object e) {
      debugPrint('3D viewer command ${command['cmd']} failed: $e');
    });
  }

  @override
  Widget view() => ValueListenableBuilder<win.WebviewValue>(
    valueListenable: _controller,
    builder: (context, v, _) => v.isInitialized ? win.Webview(_controller) : const ColoredBox(color: _background, child: SizedBox.expand()),
  );

  @override
  void dispose() {
    super.dispose();
    for (final s in _subs) {
      s.cancel();
    }
    unawaited(_controller.dispose());
  }
}
