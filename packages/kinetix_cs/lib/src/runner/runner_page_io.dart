import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_windows/webview_windows.dart' as win;

import 'runner_page.dart';

/// Under `flutter test` there is no WebView, whatever the host.
bool get _testing => Platform.environment.containsKey('FLUTTER_TEST');

RunnerPage? createRunnerPage() {
  if (_testing) return null;
  if (Platform.isAndroid || Platform.isIOS) return WebViewPlatform.instance == null ? null : _AndroidPage();
  if (Platform.isWindows) return _WindowsPage();
  return null;
}

/// Serves assets/runner (the page, its worker and Pyodide) on 127.0.0.1 only, never the school
/// network, as the 3D viewer's server does (kinetix_3d engine_io.dart). One for the app.
class RunnerServer {
  static Future<String>? _base;

  static Future<String> start() => _base ??= _start();

  static Future<String> _start() async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen(_serve, onError: (Object e) => debugPrint('Code runner server: $e'));
    return 'http://127.0.0.1:${server.port}';
  }

  static const _types = {
    'html': 'text/html; charset=utf-8',
    'js': 'text/javascript; charset=utf-8',
    'json': 'application/json; charset=utf-8',
    'wasm': 'application/wasm',
    'zip': 'application/zip',
  };

  static Future<void> _serve(HttpRequest req) async {
    final res = req.response;
    try {
      final path = Uri.decodeComponent(req.uri.path).replaceFirst(RegExp(r'^/+'), '');
      if (path.contains('..')) throw const FileSystemException('outside the runner');
      final data = await rootBundle.load('packages/kinetix_cs/assets/runner/${path.isEmpty ? 'index.html' : path}');
      res.headers.contentType = ContentType.parse(_types[path.split('.').last] ?? 'application/octet-stream');
      res.add(data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes));
    } catch (_) {
      res.statusCode = HttpStatus.notFound;
    }
    await res.close();
  }

  static Future<Uri> page() async => Uri.parse('${await start()}/index.html');
}

class _AndroidPage implements RunnerPage {
  final _messages = StreamController<Object?>.broadcast();
  late final _controller = WebViewController()
    ..setJavaScriptMode(JavaScriptMode.unrestricted)
    ..addJavaScriptChannel('KX', onMessageReceived: (m) => _messages.add(m.message));

  @override
  Stream<Object?> get messages => _messages.stream;

  @override
  Future<void> open() async => _controller.loadRequest(await RunnerServer.page());

  @override
  void eval(String js) => _controller.runJavaScript(js).catchError((Object e) => debugPrint('Code runner: $e'));

  @override
  Widget view() => WebViewWidget(controller: _controller);

  @override
  void dispose() {
    unawaited(_controller.loadRequest(Uri.parse('about:blank')).catchError((_) {}));
    _messages.close();
  }
}

class _WindowsPage implements RunnerPage {
  final _controller = win.WebviewController();
  final _messages = StreamController<Object?>.broadcast();
  StreamSubscription<Object?>? _sub;

  @override
  Stream<Object?> get messages => _messages.stream;

  @override
  Future<void> open() async {
    await _controller.initialize();
    await _controller.setPopupWindowPolicy(win.WebviewPopupWindowPolicy.deny);
    _sub = _controller.webMessage.listen(_messages.add, onError: (Object e) => debugPrint('Code runner: $e'));
    await _controller.loadUrl((await RunnerServer.page()).toString());
  }

  @override
  void eval(String js) {
    if (!_controller.value.isInitialized) return;
    _controller.executeScript(js).catchError((Object e) => debugPrint('Code runner: $e'));
  }

  @override
  Widget view() => ValueListenableBuilder<win.WebviewValue>(
    valueListenable: _controller,
    builder: (context, v, _) => v.isInitialized ? win.Webview(_controller) : const SizedBox.shrink(),
  );

  @override
  void dispose() {
    _sub?.cancel();
    _messages.close();
    unawaited(_controller.dispose());
  }
}
