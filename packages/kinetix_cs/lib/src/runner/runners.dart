import 'dart:async';
import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:http/http.dart' as http;

import 'protocol.dart';
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

/// The code lab's runner: each language where it runs (the decision is HYBRID: Python,
/// JavaScript and SQL on the device, offline; C, C++ and Java on the server in India).
class HybridRunner implements CodeRunner {
  HybridRunner({required this.web, required this.sql, this.server});

  final WebRunner web;
  final SqlRunner sql;

  /// Null when the app has no server (demo mode): C, C++ and Java are then unavailable.
  final ServerRunner? server;
  CodeRunner? _active;

  CodeRunner? runnerFor(CodeLanguage l) => switch (l) {
    CodeLanguage.python || CodeLanguage.javascript => web,
    CodeLanguage.sql => sql,
    _ => server,
  };

  @override
  Future<RunResult> run(RunRequest r) async {
    final runner = runnerFor(r.language);
    if (runner == null) return const RunResult(status: RunStatus.unavailable, message: 'noServer');
    _active = runner;
    try {
      return await runner.run(r);
    } finally {
      if (_active == runner) _active = null;
    }
  }

  bool get running => _active != null;

  @override
  void stop() => _active?.stop();

  @override
  void dispose() {
    web.dispose();
    sql.dispose();
    server?.dispose();
  }
}
