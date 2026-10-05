import 'dart:async';
import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_cs/kinetix_cs.dart';

/// A runner page that answers like assets/runner/index.html, from a script of replies.
class FakePage implements RunnerPage {
  FakePage(this.onEval);

  final void Function(FakePage page, String js) onEval;
  final _messages = StreamController<Object?>.broadcast();
  final evals = <String>[];
  int opens = 0;

  void post(Map<String, Object?> m) => _messages.add(jsonEncode(m));

  @override
  Stream<Object?> get messages => _messages.stream;

  @override
  Future<void> open() async {
    opens++;
    scheduleMicrotask(() => post({'event': 'ready'}));
  }

  @override
  void eval(String js) {
    evals.add(js);
    onEval(this, js);
  }

  @override
  Widget view() => const SizedBox();

  @override
  void dispose() => _messages.close();
}

Map<String, dynamic> job(String js) => jsonDecode(js.substring('kx.run('.length, js.length - 1)) as Map<String, dynamic>;

void main() {
  group('RunnerSession', () {
    test('collects output for its run and ends on done', () async {
      late RunnerSession s;
      s = RunnerSession((js) {
        if (!js.startsWith('kx.run(')) return;
        final id = job(js)['id'];
        scheduleMicrotask(() {
          s.receive(jsonEncode({'id': id, 'event': 'out', 'text': 'hello\n'}));
          s.receive(jsonEncode({'id': id - 1, 'event': 'out', 'text': 'stale\n'}));
          s.receive(jsonEncode({'id': id, 'event': 'err', 'text': 'warn\n'}));
          // WebView2 may encode twice.
          s.receive(jsonEncode(jsonEncode({'id': id, 'event': 'done', 'status': 'ok', 'ms': 12})));
        });
      });
      final r = await s.run(const RunRequest(CodeLanguage.python, 'print("hello")'));
      expect(r.status, RunStatus.ok);
      expect(r.stdout, 'hello\n');
      expect(r.stderr, 'warn\n');
      expect(r.timeMs, 12);
      expect(r.combined, 'hello\nwarn');
    });

    test('sends the job as JSON, so any code is safe to pass', () async {
      final sent = <String>[];
      final s = RunnerSession(sent.add);
      unawaited(s.run(const RunRequest(CodeLanguage.javascript, 'console.log("a\')\\n")', stdin: '1\n2\n')));
      final j = job(sent.single);
      expect(j['lang'], 'javascript');
      expect(j['code'], 'console.log("a\')\\n")');
      expect(j['stdin'], '1\n2\n');
      s.stop();
    });

    test('times out, stops, and caps output', () async {
      final sent = <String>[];
      final s = RunnerSession(sent.add, timeLimit: const Duration(milliseconds: 50), outputLimit: 10);
      final r = await s.run(const RunRequest(CodeLanguage.python, 'while True: pass'));
      expect(r.status, RunStatus.timeout);
      expect(sent.last, 'kx.stop(1)');

      final pending = s.run(const RunRequest(CodeLanguage.python, 'x'));
      s.stop();
      expect((await pending).status, RunStatus.stopped);
      expect(sent.last, 'kx.stop(2)');

      final flood = s.run(const RunRequest(CodeLanguage.python, 'x'));
      s.receive(jsonEncode({'id': 3, 'event': 'out', 'text': 'x' * 25}));
      final f = await flood;
      expect(f.status, RunStatus.outputLimit);
      expect(f.stdout.length, 10);
      expect(sent.last, 'kx.stop(3)');
    });

    test('a new run stops the one before', () async {
      final s = RunnerSession((_) {});
      final first = s.run(const RunRequest(CodeLanguage.python, 'a'));
      unawaited(s.run(const RunRequest(CodeLanguage.python, 'b')));
      expect((await first).status, RunStatus.stopped);
      s.dispose();
    });

    test('Python loading time does not count against the program', () async {
      final s = RunnerSession((_) {}, timeLimit: const Duration(milliseconds: 60), startLimit: const Duration(seconds: 5));
      final loading = <String>[];
      s.loading.listen(loading.add);
      final run = s.run(const RunRequest(CodeLanguage.python, 'print(1)'));
      s.receive(jsonEncode({'event': 'loading', 'text': 'python'}));
      await Future<void>.delayed(const Duration(milliseconds: 120));
      expect(s.running, isTrue);
      s.receive(jsonEncode({'event': 'loaded'}));
      s.receive(jsonEncode({'id': 1, 'event': 'done', 'status': 'runtime_error'}));
      expect((await run).status, RunStatus.runtimeError);
      expect(loading, ['python', '']);
    });
  });

  group('WebRunner', () {
    test('opens the page once, waits for ready, and runs', () async {
      final page = FakePage((p, js) {
        if (js.startsWith('kx.run(')) {
          final id = job(js)['id'];
          p.post({'id': id, 'event': 'out', 'text': '${job(js)['lang']}\n'});
          p.post({'id': id, 'event': 'done', 'status': 'ok'});
        }
      });
      final w = WebRunner(page: page);
      expect((await w.run(const RunRequest(CodeLanguage.javascript, '1'))).stdout, 'javascript\n');
      expect((await w.run(const RunRequest(CodeLanguage.python, '1'))).stdout, 'python\n');
      expect(page.opens, 1);
      w.dispose();
    });

    test('without a WebView, Python says it cannot run here', () async {
      final r = await WebRunner().run(const RunRequest(CodeLanguage.python, 'print(1)'));
      expect(r.status, RunStatus.unavailable);
    });
  });

  group('ServerRunner', () {
    ServerRunner server(MockClient c, {Uri? url}) => ServerRunner(
      endpoint: () => url ?? Uri.parse('https://api.test/v1/code/run'),
      headers: () async => {'authorization': 'Bearer t'},
      newClient: () => c,
    );

    test('posts the job and reads the result', () async {
      late http.Request seen;
      final r = await server(MockClient((req) async {
        seen = req;
        return http.Response(jsonEncode({'status': 'compile_error', 'compileOutput': "main.c:1: error: expected ';'", 'stdout': '', 'stderr': '', 'exitCode': 1, 'timeMs': 230}), 200);
      })).run(const RunRequest(CodeLanguage.c, 'int main(){}', stdin: '5'));
      expect(seen.headers['authorization'], 'Bearer t');
      expect(jsonDecode(seen.body), {'language': 'c', 'source': 'int main(){}', 'stdin': '5'});
      expect(r.status, RunStatus.compileError);
      expect(r.combined, contains('expected'));
      expect(r.timeMs, 230);
    });

    test('maps limits, sign-in and outages', () async {
      expect((await server(MockClient((_) async => http.Response('{}', 429))).run(const RunRequest(CodeLanguage.java, ''))).status, RunStatus.rateLimited);
      expect((await server(MockClient((_) async => http.Response('{}', 401))).run(const RunRequest(CodeLanguage.java, ''))).message, 'signIn');
      expect((await server(MockClient((_) async => http.Response('{}', 503))).run(const RunRequest(CodeLanguage.java, ''))).status, RunStatus.unavailable);
      expect((await server(MockClient((_) async => throw http.ClientException('offline'))).run(const RunRequest(CodeLanguage.java, ''))).status, RunStatus.unavailable);
      final none = ServerRunner(endpoint: () => null, headers: () async => {});
      expect((await none.run(const RunRequest(CodeLanguage.cpp, ''))).message, 'signIn');
    });
  });

  test('HybridRunner sends each language where it runs', () async {
    final page = FakePage((p, js) {
      if (js.startsWith('kx.run(')) p.post({'id': job(js)['id'], 'event': 'done', 'status': 'ok'});
    });
    final calls = <String>[];
    final h = HybridRunner(
      web: WebRunner(page: page),
      sql: SqlRunner(),
      server: ServerRunner(
        endpoint: () => Uri.parse('https://api.test/v1/code/run'),
        headers: () async => {},
        newClient: () => MockClient((req) async {
          calls.add(jsonDecode(req.body)['language'] as String);
          return http.Response(jsonEncode({'status': 'ok', 'stdout': 'ran\n'}), 200);
        }),
      ),
    );
    for (final l in CodeLanguage.values) {
      final r = await h.run(RunRequest(l, l == CodeLanguage.sql ? 'SELECT 1 AS x;' : 'x'));
      expect(r.status, RunStatus.ok, reason: l.name);
    }
    expect(calls, ['c', 'cpp', 'java']);
    expect(page.evals.where((e) => e.startsWith('kx.run(')).length, 2);
    final offline = HybridRunner(web: WebRunner(page: page), sql: SqlRunner());
    expect((await offline.run(const RunRequest(CodeLanguage.java, 'x'))).message, 'noServer');
  });

  test('every language has samples, and the SQL ones run on their database', () {
    for (final l in CodeLanguage.values) {
      expect(samplesFor(l).length, greaterThanOrEqualTo(3), reason: l.name);
    }
    for (final s in samplesFor(CodeLanguage.sql)) {
      final (out, status) = runSql(s.code, database: s.database);
      expect(status, RunStatus.ok, reason: '${s.key}: ${out.$2}');
      expect(out.$1, contains('in set'));
    }
  });
}
