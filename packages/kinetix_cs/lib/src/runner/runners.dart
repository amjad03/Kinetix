import 'dart:async';
import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:http/http.dart' as http;

import 'code_box.dart';
import 'protocol.dart';
import 'python_runtime.dart';
import 'runner_page.dart';
import 'sql_runner.dart';

/// Python and JavaScript in the runner page, on the device.
class WebRunner implements CodeRunner {
  WebRunner({RunnerPage? page, Duration timeLimit = deviceTimeLimit}) : _page = page ?? RunnerPage.create() {
    final p = _page;
    if (p != null) {
      _session = RunnerSession(p.eval, timeLimit: timeLimit);
      _sub = p.messages.listen((m) {
        if (decodePageMessage(m)?['event'] == 'ready' && !_ready.isCompleted) _ready.complete();
        _session!.receive(m);
      });
    }
  }

  final RunnerPage? _page;
  RunnerSession? _session;
  StreamSubscription<Object?>? _sub;
  final _ready = Completer<void>();
  Future<void>? _opening;

  bool get available => _page != null;

  /// "Starting Python…" while Pyodide loads ('' when it has).
  Stream<String> get loading => _session?.loading ?? const Stream.empty();

  /// The WebView, to keep in the tree (1 × 1 is enough).
  Widget view() => _page?.view() ?? const SizedBox.shrink();

  Future<void> _open() => _opening ??= () async {
    await _page!.open();
    await _ready.future.timeout(const Duration(seconds: 20));
  }();

  /// Loads the page and starts Python early.
  Future<void> warm() async {
    if (_page == null) return;
    try {
      await _open();
      _page.eval('kx.warm()');
    } catch (_) {}
  }

  /// Drops the page's Python, so Python downloaded since is used by the next run.
  void reset() {
    if (_page != null && _opening != null) _page.eval('kx.reset()');
  }

  @override
  Future<RunResult> run(RunRequest r) async {
    if (_page == null) return const RunResult(status: RunStatus.unavailable, message: 'noWebView');
    try {
      await _open();
    } catch (e) {
      _opening = null;
      return RunResult(status: RunStatus.unavailable, message: 'noWebView: $e');
    }
    return _session!.run(r);
  }

  @override
  void stop() => _session?.stop();

  @override
  void dispose() {
    _sub?.cancel();
    _session?.dispose();
    _page?.dispose();
  }
}

/// C, C++ and Java on the institution's runner, through the KINETIX API
/// (POST /v1/code/run). [endpoint] and [headers] come from the app's signed-in client.
class ServerRunner implements CodeRunner {
  ServerRunner({required this.endpoint, required this.headers, this.newClient = http.Client.new});

  /// The full URL of /v1/code/run, or null when not signed in.
  final Uri? Function() endpoint;

  /// The Authorization header and the like.
  final Future<Map<String, String>> Function() headers;
  final http.Client Function() newClient;

  http.Client? _client;
  bool _stopped = false;

  @override
  Future<RunResult> run(RunRequest r) async {
    stop();
    _stopped = false;
    final url = endpoint();
    if (url == null) return const RunResult(status: RunStatus.unavailable, message: 'signIn');
    final client = _client = newClient();
    try {
      final res = await client
          .post(url, headers: {...await headers(), 'content-type': 'application/json'}, body: jsonEncode(r.toJson()))
          .timeout(const Duration(seconds: 45));
      if (res.statusCode == 429) return const RunResult(status: RunStatus.rateLimited);
      if (res.statusCode == 401 || res.statusCode == 403) return const RunResult(status: RunStatus.unavailable, message: 'signIn');
      if (res.statusCode != 200 && res.statusCode != 201) return RunResult(status: RunStatus.unavailable, message: 'server ${res.statusCode}');
      return RunResult.fromJson(jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>);
    } catch (e) {
      if (_stopped) return const RunResult(status: RunStatus.stopped);
      return RunResult(status: RunStatus.unavailable, message: 'offline: $e');
    } finally {
      client.close();
      if (_client == client) _client = null;
    }
  }

  @override
  void stop() {
    // Closing the client ends the request; the server's own limits end the program.
    _stopped = _client != null;
    _client?.close();
  }

  @override
  void dispose() => stop();
}

/// Where [l] can run, best first: on the device when it runs there ([deviceReady]), then the
/// school code box when it runs [l] ([boxLanguages], null: no box), then the KINETIX server
/// for C, C++ and Java ([hasServer]). Empty: nowhere, and [whyNot] says what to do.
List<RunPlace> routeFor(CodeLanguage l, {required bool deviceReady, Set<CodeLanguage>? boxLanguages, bool hasServer = false}) => [
  if (l.onDevice && deviceReady) RunPlace.device,
  if (boxLanguages?.contains(l) ?? false) RunPlace.box,
  if (hasServer && !l.onDevice) RunPlace.server,
];

/// Why [l] cannot run anywhere: 'needsPython' (get Python for offline use, or a code box),
/// 'noWebView' (JavaScript on a device without a WebView), or 'needsBox' (C, C++, Java).
String whyNot(CodeLanguage l, {required bool webView}) => switch (l) {
  CodeLanguage.python when webView => 'needsPython',
  CodeLanguage.python || CodeLanguage.javascript => 'noWebView',
  _ => 'needsBox',
};

/// The code lab's runner. Each run goes to the first place in [routeFor] that can take it and
/// falls back to the next when that one cannot be reached: Python, JavaScript and SQL on the
/// device (offline), C, C++ and Java on the school code box on the local network, then the
/// KINETIX server. The result says where it ran ([RunResult.place]).
class HybridRunner implements CodeRunner {
  HybridRunner({required this.web, required this.sql, this.server, this.box, this.python});

  final WebRunner web;
  final SqlRunner sql;

  /// Null when the app has no server (demo mode).
  final ServerRunner? server;

  /// Null when the app does not look for a school code box.
  final CodeBoxRunner? box;

  /// Where Python comes from on the device (null: assume the page has it).
  final PythonRuntime? python;
  CodeRunner? _active;

  /// Whether [l] can run on the device now.
  Future<bool> deviceReady(CodeLanguage l) async => switch (l) {
    CodeLanguage.sql => true,
    CodeLanguage.javascript => web.available,
    CodeLanguage.python => web.available && (python == null || await python!.locate() != null),
    _ => false,
  };

  /// The places [l] would run, in order.
  Future<List<RunPlace>> plan(CodeLanguage l) async =>
      routeFor(l, deviceReady: await deviceReady(l), boxLanguages: box == null ? null : await box!.languages(), hasServer: server != null);

  CodeRunner _runner(RunPlace p, CodeLanguage l) => switch (p) {
    RunPlace.device => l == CodeLanguage.sql ? sql : web,
    RunPlace.box => box!,
    RunPlace.server => server!,
  };

  @override
  Future<RunResult> run(RunRequest r) async {
    RunResult? last, keyRefused;
    for (final place in await plan(r.language)) {
      final runner = _active = _runner(place, r.language);
      try {
        final res = await runner.run(r);
        if (res.status != RunStatus.unavailable) return res.at(place);
        last = res;
        if (res.message == 'boxKey') keyRefused = res;
      } finally {
        if (_active == runner) _active = null;
      }
    }
    // A wrong box key and signing in are things the teacher can fix now; anything else is
    // the code box or Python.
    if (keyRefused != null) return keyRefused;
    if (last?.message == 'signIn' && box == null) return last!;
    return RunResult(status: RunStatus.unavailable, message: whyNot(r.language, webView: web.available));
  }

  bool get running => _active != null;

  @override
  void stop() => _active?.stop();

  @override
  void dispose() {
    web.dispose();
    sql.dispose();
    server?.dispose();
    box?.dispose();
  }
}
