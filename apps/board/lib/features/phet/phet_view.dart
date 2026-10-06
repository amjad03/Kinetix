import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_windows/webview_windows.dart' as win;

/// Serves the downloaded sims from the board's own storage on 127.0.0.1 only (never the school
/// network), like the 3D viewer's server (packages/kinetix_3d): the WebView opens
/// `http://127.0.0.1:<port>/<id>_all.html?locale=hi` and needs no internet. Android allows
/// cleartext to 127.0.0.1 only (res/xml/network_security_config.xml).
class PhetServer {
  static Future<String>? _base;
  static Directory? _dir;

  /// Starts the server (once) for the sims in [dir].
  static Future<String> start(Directory dir) {
    _dir = dir;
    return _base ??= _start();
  }

  static Future<String> _start() async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen(_serve, onError: (Object e) => debugPrint('PhET server: $e'));
    return 'http://127.0.0.1:${server.port}';
  }

  static final _file = RegExp(r'^[a-z0-9-]+_all\.html$');

  static Future<void> _serve(HttpRequest req) async {
    final res = req.response;
    final name = req.uri.pathSegments.length == 1 ? req.uri.pathSegments.single : '';
    final file = File('${_dir?.path}${Platform.pathSeparator}$name');
    if (_dir == null || !_file.hasMatch(name) || !await file.exists()) {
      res.statusCode = HttpStatus.notFound;
      await res.close();
      return;
    }
    res.headers
      ..contentType = ContentType.html
      ..set('cache-control', 'no-store');
    res.contentLength = await file.length();
    await res.addStream(file.openRead());
    await res.close();
  }

  static Future<Uri> pageFor(Directory dir, String id, String locale) async =>
      Uri.parse('${await start(dir)}/${id}_all.html?locale=${Uri.encodeQueryComponent(locale)}');
}

/// A sim's page in the panel: Android's WebView (webview_flutter) or Edge WebView2 on Windows
/// (webview_windows). [create] gives null where there is none (tests, Linux).
abstract class PhetWebView {
  Future<void> load(Uri page);
  Widget view();

  /// A PNG of the sim as the class sees it, from PhET's own screenshot generator in the page
  /// (a platform view cannot be pictured from Flutter on Android); null if the page cannot.
  Future<Uint8List?> screenshot();
  void dispose();

  static PhetWebView? Function()? debugOverride;

  static PhetWebView? create() {
    if (debugOverride != null) return debugOverride!();
    if (Platform.environment.containsKey('FLUTTER_TEST')) return null;
    if (Platform.isWindows) return _WindowsView();
    if (Platform.isAndroid || Platform.isIOS) return WebViewPlatform.instance == null ? null : _AndroidView();
    return null;
  }
}

/// PhET's sims register themselves on `window.phet`; joist's ScreenshotGenerator draws the sim
/// (without its navigation bar) to a data URL.
const _shotJs = '(function(){try{return phet.joist.ScreenshotGenerator.generateScreenshot(phet.joist.sim,"image/png");}catch(e){return "";}})()';

Uint8List? _decodeShot(Object? result) {
  var s = result is String ? result : '$result';
  if (s.startsWith('"')) s = jsonDecode(s) as String; // Android returns the string JSON-encoded
  final comma = s.indexOf(',');
  if (!s.startsWith('data:image/') || comma < 0) return null;
  try {
    return base64Decode(s.substring(comma + 1));
  } catch (_) {
    return null;
  }
}

class _AndroidView implements PhetWebView {
  final _controller = WebViewController()
    ..setJavaScriptMode(JavaScriptMode.unrestricted)
    ..setBackgroundColor(const Color(0xFF000000));

  @override
  Future<void> load(Uri page) => _controller.loadRequest(page);

  @override
  Widget view() => WebViewWidget(
    controller: _controller,
    // The sim takes every touch (dragging, sliders) while the pen is not writing over it.
    gestureRecognizers: {Factory<OneSequenceGestureRecognizer>(() => EagerGestureRecognizer())},
  );

  @override
  Future<Uint8List?> screenshot() async {
    try {
      return _decodeShot(await _controller.runJavaScriptReturningResult(_shotJs));
    } catch (e) {
      debugPrint('PhET screenshot failed: $e');
      return null;
    }
  }

  @override
  void dispose() => unawaited(_controller.loadRequest(Uri.parse('about:blank')).catchError((_) {}));
}

class _WindowsView implements PhetWebView {
  final _controller = win.WebviewController();
  Future<void>? _ready;

  Future<void> _init() async {
    await _controller.initialize();
    await _controller.setPopupWindowPolicy(win.WebviewPopupWindowPolicy.deny);
  }

  @override
  Future<void> load(Uri page) async {
    await (_ready ??= _init());
    await _controller.loadUrl(page.toString());
  }

  @override
  Widget view() => ValueListenableBuilder<win.WebviewValue>(
    valueListenable: _controller,
    builder: (context, v, _) => v.isInitialized ? win.Webview(_controller) : const SizedBox.expand(),
  );

  @override
  Future<Uint8List?> screenshot() async {
    try {
      return _decodeShot(await _controller.executeScript(_shotJs));
    } catch (e) {
      debugPrint('PhET screenshot failed: $e');
      return null;
    }
  }

  @override
  void dispose() => unawaited(_controller.dispose());
}
