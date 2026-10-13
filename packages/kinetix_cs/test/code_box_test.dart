import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_cs/kinetix_cs.dart';

import 'runner_test.dart' show FakePage, job;

/// A school code box on 127.0.0.1 that answers like infra/school-code-box's gateway.
class FakeBox {
  FakeBox._(this._server, this.languages, this.key);

  static Future<FakeBox> start({List<String> languages = const ['c', 'cpp', 'java', 'python'], String? key}) async {
    final box = FakeBox._(await HttpServer.bind(InternetAddress.loopbackIPv4, 0), languages, key);
    box._server.listen(box._handle);
    return box;
  }

  final HttpServer _server;
  final List<String> languages;
  final String? key;
  final runs = <Map<String, dynamic>>[];
  Map<String, Object?> Function(Map<String, dynamic> job) answer = (j) => {'status': 'ok', 'stdout': 'ran ${j['language']}\n', 'timeMs': 12};

  String get base => 'http://127.0.0.1:${_server.port}';

  Future<void> _handle(HttpRequest req) async {
    final res = req.response..headers.contentType = ContentType.json;
    // Like the gateway: anyone on the network may ask what the box runs; only boards with the
    // key may run code on it.
    if (key != null && req.uri.path == '/run' && req.headers.value('x-code-box-key') != key) {
      res.statusCode = 401;
      res.write('{"error":"unauthorised"}');
    } else if (req.method == 'GET' && req.uri.path == '/health') {
      res.write(jsonEncode({'ok': true, 'languages': languages, 'name': 'lab-pc'}));
    } else if (req.method == 'POST' && req.uri.path == '/run') {
      final j = jsonDecode(await utf8.decodeStream(req)) as Map<String, dynamic>;
      runs.add(j);
      res.write(jsonEncode(answer(j)));
    } else {
      res.statusCode = 404;
    }
    await res.close();
  }

  Future<void> close() => _server.close(force: true);
}

void main() {
  group('routeFor', () {
    test('on the device first, then the code box, then the server', () {
      expect(routeFor(CodeLanguage.python, deviceReady: true, boxLanguages: {CodeLanguage.python}), [RunPlace.device, RunPlace.box]);
      expect(routeFor(CodeLanguage.python, deviceReady: false, boxLanguages: {CodeLanguage.python}), [RunPlace.box]);
      expect(routeFor(CodeLanguage.python, deviceReady: false, hasServer: true), isEmpty, reason: 'the API runs only C, C++ and Java');
      expect(routeFor(CodeLanguage.sql, deviceReady: true, hasServer: true), [RunPlace.device]);
      expect(routeFor(CodeLanguage.c, deviceReady: true, boxLanguages: {CodeLanguage.c}, hasServer: true), [RunPlace.box, RunPlace.server]);
      expect(routeFor(CodeLanguage.java, deviceReady: true, boxLanguages: {CodeLanguage.python}, hasServer: true), [RunPlace.server]);
      expect(routeFor(CodeLanguage.cpp, deviceReady: true), isEmpty);
    });

    test('says what to do when there is nowhere to run', () {
      expect(whyNot(CodeLanguage.c, webView: true), 'needsBox');
      expect(whyNot(CodeLanguage.java, webView: false), 'needsBox');
      expect(whyNot(CodeLanguage.python, webView: true), 'needsPython');
      expect(whyNot(CodeLanguage.python, webView: false), 'noWebView');
      expect(whyNot(CodeLanguage.javascript, webView: false), 'noWebView');
    });
  });

  group('CodeBox', () {
    test('cleans addresses and adds the box port', () {
      expect(CodeBox.clean('192.168.1.20'), 'http://192.168.1.20:8181');
      expect(CodeBox.clean(' http://box.local:9000/ '), 'http://box.local:9000');
      expect(CodeBox.clean('https://code.school.in'), 'https://code.school.in');
      expect(CodeBox.clean('ftp://x'), isNull);
      expect(CodeBox.clean(''), isNull);
      expect(CodeBox.onSchoolServer('http://10.0.0.5:4000'), 'http://10.0.0.5:8181');
      expect(CodeBox.onSchoolServer('https://api.kinetix.in'), isNull, reason: 'not a school network address');
      expect(CodeBox.isLocalHost('172.20.1.1'), isTrue);
      expect(CodeBox.isLocalHost('172.40.1.1'), isFalse);
    });

    test('tries its own address, the institution, the network and the school server in order', () async {
      final box = CodeBox(own: '10.0.0.9', institution: 'http://10.0.0.9:8181', apiBase: 'http://192.168.1.4:4000', discover: () async => [Uri.parse('http://192.168.1.30:8181')]);
      expect(await box.candidates(), ['http://10.0.0.9:8181', 'http://192.168.1.30:8181', 'http://192.168.1.4:8181']);
      final failing = CodeBox(discover: () async => throw const SocketException('no multicast'));
      expect(await failing.candidates(), isEmpty);
    });

    test('finds the first box that answers, with its languages, and runs on it', () async {
      final fake = await FakeBox.start(key: 'k3y', languages: ['c', 'cpp', 'java', 'python', 'sql']);
      addTearDown(fake.close);
      final box = CodeBox(own: 'http://127.0.0.1:1', institution: fake.base, key: 'k3y');
      final found = await box.find();
      expect(found?.base, fake.base);
      expect(found?.languages, {CodeLanguage.c, CodeLanguage.cpp, CodeLanguage.java, CodeLanguage.python, CodeLanguage.sql});
      expect(box.current.value?.name, 'lab-pc');

      final r = await CodeBoxRunner(box).run(const RunRequest(CodeLanguage.c, 'int main(){}', stdin: '3'));
      expect(r.status, RunStatus.ok);
      expect(r.stdout, 'ran c\n');
      expect(fake.runs.single, {'language': 'c', 'source': 'int main(){}', 'stdin': '3'});

      // SQL starts from the chosen sample database.
      await CodeBoxRunner(box).run(const RunRequest(CodeLanguage.sql, 'SELECT 1;', database: 'library'));
      expect(fake.runs.last['source'], allOf(contains('CREATE TABLE books'), endsWith('SELECT 1;')));
    });

    test('a wrong key, a box without the language, and a box that went away', () async {
      final fake = await FakeBox.start(key: 'right', languages: ['c']);
      final wrong = CodeBox(own: fake.base, key: 'wrong');
      expect((await CodeBoxRunner(wrong).run(const RunRequest(CodeLanguage.c, 'x'))).message, 'boxKey');
      final h = HybridRunner(web: WebRunner(page: FakePage((_, _) {})), sql: SqlRunner(), box: CodeBoxRunner(wrong));
      expect((await h.run(const RunRequest(CodeLanguage.c, 'x'))).message, 'boxKey', reason: 'the teacher can fix the key');

      final box = CodeBox(own: fake.base, key: 'right');
      expect((await CodeBoxRunner(box).run(const RunRequest(CodeLanguage.java, ''))).message, 'needsBox');
      fake.answer = (_) => {'status': 'compile_error', 'compileOutput': "main.c:3:5: error: expected ';' before 'return'", 'exitCode': 1};
      final ce = await CodeBoxRunner(box).run(const RunRequest(CodeLanguage.c, 'x'));
      expect(ce.status, RunStatus.compileError);
      expect(issuesOf(CodeLanguage.c, ce), [const CodeIssue(3, "expected ';' before 'return'", column: 5)]);

      await fake.close();
      final gone = await CodeBoxRunner(box).run(const RunRequest(CodeLanguage.c, 'x'));
      expect(gone.status, RunStatus.unavailable);
      expect(box.current.value, isNull, reason: 'a box that cannot be reached is forgotten');
    });
  });

  group('HybridRunner', () {
    test('C goes to the code box, and falls back to the server when the box is down', () async {
      final fake = await FakeBox.start(languages: ['c', 'cpp', 'java']);
      final serverCalls = <String>[];
      HybridRunner hybrid(CodeBox box) => HybridRunner(
        web: WebRunner(page: FakePage((_, _) {})),
        sql: SqlRunner(),
        box: CodeBoxRunner(box),
        server: ServerRunner(
          endpoint: () => Uri.parse('https://api.test/v1/code/run'),
          headers: () async => {},
          newClient: () => MockClient((req) async {
            serverCalls.add(jsonDecode(req.body)['language'] as String);
            return http.Response(jsonEncode({'status': 'ok', 'stdout': 'server\n'}), 200);
          }),
        ),
      );
      final box = CodeBox(own: fake.base);
      final h = hybrid(box);
      final onBox = await h.run(const RunRequest(CodeLanguage.cpp, 'x'));
      expect((onBox.place, onBox.stdout), (RunPlace.box, 'ran cpp\n'));
      expect(await h.plan(CodeLanguage.java), [RunPlace.box, RunPlace.server]);

      // The box goes away between the plan and the run: the server takes it.
      await fake.close();
      final r = await h.run(const RunRequest(CodeLanguage.java, 'x'));
      expect((r.place, r.stdout), (RunPlace.server, 'server\n'));
      expect(serverCalls, ['java']);
    });

    test('with neither a box nor a server, C says it needs the code box', () async {
      final h = HybridRunner(web: WebRunner(page: FakePage((_, _) {})), sql: SqlRunner(), box: CodeBoxRunner(CodeBox()));
      expect((await h.run(const RunRequest(CodeLanguage.c, 'x'))).message, 'needsBox');
      expect((await h.run(const RunRequest(CodeLanguage.sql, 'SELECT 2 AS n;'))).place, RunPlace.device);
    });

    test('Python missing on the device runs on the code box, or asks to get Python', () async {
      final page = FakePage((p, js) {
        if (js.startsWith('kx.run(')) p.post({'id': job(js)['id'], 'event': 'done', 'status': 'unavailable', 'reason': 'python_missing'});
      });
      final noBox = HybridRunner(web: WebRunner(page: page), sql: SqlRunner());
      expect((await noBox.run(const RunRequest(CodeLanguage.python, 'print(1)'))).message, 'needsPython');

      final fake = await FakeBox.start(languages: ['python']);
      addTearDown(fake.close);
      final withBox = HybridRunner(web: WebRunner(page: page), sql: SqlRunner(), box: CodeBoxRunner(CodeBox(own: fake.base)));
      final r = await withBox.run(const RunRequest(CodeLanguage.python, 'print(1)'));
      expect((r.place, r.stdout), (RunPlace.box, 'ran python\n'));
    });

    test('a runtime that knows Python is missing skips the device', () async {
      final evals = <String>[];
      final page = FakePage((_, js) => evals.add(js));
      final h = HybridRunner(web: WebRunner(page: page), sql: SqlRunner(), python: PythonRuntime(bundled: const []));
      expect(await h.plan(CodeLanguage.python), isEmpty);
      expect((await h.run(const RunRequest(CodeLanguage.python, 'print(1)'))).message, 'needsPython');
      expect(evals.where((e) => e.startsWith('kx.run(')), isEmpty);
    });
  });

  group('issuesOf', () {
    test('maps compiler and interpreter messages to lines', () {
      expect(
        issuesOf(CodeLanguage.cpp, const RunResult(status: RunStatus.compileError, compileOutput: "main.cpp: In function 'int main()':\nmain.cpp:7:12: error: 'x' was not declared in this scope\nmain.cpp:9:1: warning: no return\n")),
        [const CodeIssue(7, "'x' was not declared in this scope", column: 12), const CodeIssue(9, 'no return', column: 1, error: false)],
      );
      expect(issuesOf(CodeLanguage.java, const RunResult(status: RunStatus.compileError, compileOutput: "Main.java:4: error: ';' expected\n        int x = 5\n")), [const CodeIssue(4, "';' expected")]);
      expect(
        issuesOf(CodeLanguage.python, const RunResult(status: RunStatus.runtimeError, stderr: 'Traceback (most recent call last):\n  File "main.py", line 3, in <module>\nZeroDivisionError: division by zero\n')),
        [const CodeIssue(3, 'ZeroDivisionError: division by zero')],
      );
      expect(issuesOf(CodeLanguage.javascript, const RunResult(status: RunStatus.runtimeError, stderr: "TypeError: Cannot read properties of null (reading 'x')\n    at line 2:6\n")).single.line, 2);
      const sql = 'SELECT 1;\nSELEC name FROM students;\n';
      final (out, status) = runSql(sql, database: 'students');
      expect(out.$2, startsWith('Error in: SELEC'));
      expect(issuesOf(CodeLanguage.sql, RunResult(status: status, stdout: out.$1, stderr: out.$2), source: sql).single.line, 2);
      expect(offsetOfLine('a\nbb\nccc', 3), 5);
      expect(offsetOfLine('a', 9), 1);
    });
  });

  group('PythonRuntime', () {
    final tiny = [('pyodide.js', 4, sha256.convert(utf8.encode('js!!')).toString()), ('pyodide.asm.wasm', 3, sha256.convert(utf8.encode('wsm')).toString())];
    late Directory root;
    setUp(() async => root = await Directory.systemTemp.createTemp('kx-py'));
    tearDown(() => root.delete(recursive: true));

    test('is missing until fetched, fetches from the first server with the right files, and keeps them', () async {
      final asked = <String>[];
      final client = MockClient((req) async {
        asked.add(req.url.toString());
        if (req.url.host == 'box') return http.Response('nope', 404);
        if (req.url.host == 'bad') return http.Response(req.url.path.endsWith('.js') ? 'evil' : 'wsm', 200);
        return http.Response(req.url.path.endsWith('.js') ? 'js!!' : 'wsm', 200);
      });
      final py = PythonRuntime(bundled: const [], cacheRoot: () async => root, newClient: () => client, files: tiny, servers: ['http://box/py/', 'http://bad/py/'], cdn: 'http://cdn/py/');
      expect(await py.locate(), isNull);
      expect(py.state.value.status, PythonStatus.missing);
      expect(await py.download(), isTrue);
      expect(asked.first, 'http://box/py/pyodide.js');
      expect(asked.last, 'http://cdn/py/pyodide.asm.wasm', reason: 'the bad copy failed its SHA-256');
      final src = await py.locate();
      expect(src?.downloaded, isTrue);
      expect(utf8.decode((await src!.read('pyodide.js'))!), 'js!!');
      expect(await src.read('../etc/passwd'), isNull);
      expect(py.state.value.status, PythonStatus.ready);
      // A new runtime (the next start of the app) finds the kept copy with no network.
      final again = PythonRuntime(bundled: const [], cacheRoot: () async => root, newClient: () => MockClient((_) async => throw StateError('no network')), files: tiny);
      expect((await again.locate())?.downloaded, isTrue);
      await again.remove();
      expect(again.state.value.status, PythonStatus.missing);
    });

    test('a failed download says so and leaves nothing half-written', () async {
      final py = PythonRuntime(bundled: const [], cacheRoot: () async => root, newClient: () => MockClient((_) async => http.Response('', 500)), files: tiny, cdn: 'http://cdn/');
      expect(await py.download(), isFalse);
      expect(py.state.value.status, PythonStatus.failed);
      expect(root.listSync(recursive: true).whereType<File>(), isEmpty);
      expect(PythonRuntime(bundled: const []).canDownload, isFalse);
    });

    test('uses a copy bundled in the app (the Board ships Pyodide with JupyterLite)', () async {
      final bundle = _Bundle({'assets/jl/pyodide/pyodide.mjs': 'export {}'});
      final py = PythonRuntime(bundled: const [PythonBundle('assets/missing/', module: false), PythonBundle('assets/jl/pyodide/', module: true)], assets: bundle);
      final src = await py.locate();
      expect(src?.module, isTrue);
      expect(src?.downloaded, isFalse);
      expect(utf8.decode((await src!.read('pyodide.mjs'))!), 'export {}');
    });
  });
}

class _Bundle extends CachingAssetBundle {
  _Bundle(this.files);

  final Map<String, String> files;

  @override
  Future<ByteData> load(String key) async {
    final f = files[key];
    if (f == null) throw StateError('missing $key');
    return ByteData.sublistView(Uint8List.fromList(utf8.encode(f)));
  }
}
