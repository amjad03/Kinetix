import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:shared_preferences/shared_preferences.dart';

/// Serves the bundled sims (assets/simhub) on 127.0.0.1 only, never the school network, like the
/// PhET server: the WebView opens `http://127.0.0.1:<port>/phet/density.html` and needs no internet.
/// Android allows cleartext to 127.0.0.1 only (res/xml/network_security_config.xml).
class SimAssetServer {
  static Future<String>? _base;

  /// Reads an asset; tests replace it.
  static Future<List<int>> Function(String key) loader = (key) async => (await rootBundle.load(key)).buffer.asUint8List();

  static Future<String> start() => _base ??= _start();

  static Future<String> _start() async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen(handle, onError: (Object e) => debugPrint('Sim server: $e'));
    return 'http://127.0.0.1:${server.port}';
  }

  static final _path = RegExp(r'^[A-Za-z0-9_\-]+(/[A-Za-z0-9_\-.]+)*\.(html|js|css|png|svg|gif|mp3|ogg|wav|json)$');

  static String contentType(String path) => switch (path.substring(path.lastIndexOf('.') + 1)) {
    'html' => 'text/html; charset=utf-8',
    'js' => 'application/javascript; charset=utf-8',
    'css' => 'text/css',
    'png' => 'image/png',
    'svg' => 'image/svg+xml',
    'gif' => 'image/gif',
    'mp3' => 'audio/mpeg',
    'ogg' => 'audio/ogg',
    'wav' => 'audio/wav',
    _ => 'application/json',
  };

  /// True when [path] (the request path without the leading slash) may be served.
  static bool allowed(String path) => !path.contains('..') && _path.hasMatch(path);

  @visibleForTesting
  static Future<void> handle(HttpRequest req) async {
    final res = req.response;
    final path = req.uri.path.startsWith('/') ? req.uri.path.substring(1) : req.uri.path;
    try {
      if (!allowed(path)) throw const FormatException('bad path');
      final bytes = await loader('assets/simhub/$path');
      res.headers
        ..set('content-type', contentType(path))
        ..set('cache-control', 'no-store');
      res.add(bytes);
    } catch (_) {
      res.statusCode = HttpStatus.notFound;
    }
    await res.close();
  }

  static Future<Uri> pageFor(String asset) async => Uri.parse('${await start()}/$asset');
}

/// Sims pinned to a board page: stored per page so a teacher reopens the same sim when they come
/// back to the page. Kept in shared preferences as `simhub.pins` = `page:simId` lines.
class SimPins {
  SimPins._(this._prefs);

  final SharedPreferences _prefs;
  static const _key = 'simhub.pins';

  static Future<SimPins> load() async => SimPins._(await SharedPreferences.getInstance());

  List<(int, String)> all() => [
    for (final s in _prefs.getStringList(_key) ?? const <String>[])
      if (s.contains(':') && int.tryParse(s.split(':').first) != null) (int.parse(s.split(':').first), s.substring(s.indexOf(':') + 1)),
  ];

  /// The sims pinned to [page], oldest first.
  List<String> forPage(int page) => [for (final p in all()) if (p.$1 == page) p.$2];

  bool isPinned(int page, String simId) => forPage(page).contains(simId);

  Future<void> toggle(int page, String simId) async {
    final list = [for (final p in all()) '${p.$1}:${p.$2}'];
    final k = '$page:$simId';
    list.contains(k) ? list.remove(k) : list.add(k);
    await _prefs.setStringList(_key, list);
  }
}
