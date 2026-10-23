import 'dart:async';
import 'dart:convert';

/// The languages the code lab runs. Python, JavaScript and SQL run on the device, offline;
/// C, C++ and Java are compiled on the institution's runner (in India) through the API.
enum CodeLanguage {
  python('python', 'Python', onDevice: true),
  javascript('javascript', 'JavaScript', onDevice: true),
  sql('sql', 'SQL', onDevice: true),
  c('c', 'C', onDevice: false),
  cpp('cpp', 'C++', onDevice: false),
  java('java', 'Java', onDevice: false);

  const CodeLanguage(this.id, this.label, {required this.onDevice});

  /// The name used by the API, code notes and the colouring (kinetix_ink).
  final String id;
  final String label;
  final bool onDevice;

  static CodeLanguage? byId(String? id) => values.where((l) => l.id == id).firstOrNull;
}

class RunRequest {
  const RunRequest(this.language, this.source, {this.stdin = '', this.database});

  final CodeLanguage language;
  final String source;
  final String stdin;

  /// SQL only: the sample database to start from (students, employees, library), or null for
  /// an empty one.
  final String? database;

  Map<String, Object?> toJson() => {'language': language.id, 'source': source, 'stdin': stdin};
}

/// How a run ended. The names on the wire are snake_case ([wire]).
enum RunStatus {
  ok('ok'),
  compileError('compile_error'),
  runtimeError('runtime_error'),
  timeout('timeout'),
  memoryLimit('memory_limit'),
  outputLimit('output_limit'),
  stopped('stopped'),

  /// The runner could not be reached (offline, not set up on this server, the WebView missing).
  unavailable('unavailable'),
  rateLimited('rate_limited');

  const RunStatus(this.wire);

  final String wire;

  static RunStatus fromWire(String? s) => values.firstWhere((v) => v.wire == s, orElse: () => RunStatus.runtimeError);
}

/// Where a program ran, shown next to its output.
enum RunPlace {
  /// On this board or phone, offline (Python, JavaScript, SQL).
  device,

  /// On the school's code box on the local network (services/code-runner, docs/operations/school-code-box.md).
  box,

  /// On the Zynetix server through the API (POST /v1/code/run).
  server,
}

class RunResult {
  const RunResult({required this.status, this.stdout = '', this.stderr = '', this.compileOutput = '', this.exitCode, this.timeMs = 0, this.message, this.place});

  factory RunResult.fromJson(Map<String, dynamic> j) => RunResult(
    status: RunStatus.fromWire(j['status'] as String?),
    stdout: j['stdout'] as String? ?? '',
    stderr: j['stderr'] as String? ?? '',
    compileOutput: j['compileOutput'] as String? ?? '',
    exitCode: (j['exitCode'] as num?)?.toInt(),
    timeMs: (j['timeMs'] as num?)?.toInt() ?? 0,
  );

  final RunStatus status;
  final String stdout;
  final String stderr;

  /// The compiler's messages (C, C++, Java).
  final String compileOutput;
  final int? exitCode;
  final int timeMs;

  /// A short note for the teacher when the run could not happen at all.
  final String? message;

  /// Where it ran (null when it could not run anywhere).
  final RunPlace? place;

  /// This result, marked as having run at [p].
  RunResult at(RunPlace p) => RunResult(status: status, stdout: stdout, stderr: stderr, compileOutput: compileOutput, exitCode: exitCode, timeMs: timeMs, message: message, place: p);

  bool get ok => status == RunStatus.ok;

  /// Everything the program printed, errors last: what goes on the board.
  String get combined => [
    if (compileOutput.trim().isNotEmpty) compileOutput.trimRight(),
    if (stdout.isNotEmpty) stdout.trimRight(),
    if (stderr.trim().isNotEmpty) stderr.trimRight(),
  ].join('\n');
}

/// Runs code; [stop] ends the run in progress (its result is [RunStatus.stopped]).
abstract class CodeRunner {
  Future<RunResult> run(RunRequest request);
  void stop();
  void dispose() {}
}

/// Limits on the device (the server has its own, stricter, see services/code-runner).
const deviceTimeLimit = Duration(seconds: 10);
const deviceOutputLimit = 64 * 1024;

/// The conversation with the runner page (assets/runner/index.html), whatever WebView it is
/// in. To the page: `kx.run({id, lang, code, stdin})` and `kx.stop(id)`. From the page, JSON
/// messages: `{event: ready}` once Pyodide or the JS worker is up, `{event: loading, text}`
/// while Python loads, `{id, event: out|err, text}` as the program prints, and
/// `{id, event: done, status, ms}` at the end (status ok, runtime_error or stopped; unavailable
/// with `reason: python_missing` when Python is not on this device yet). `kx.reset()` drops the
/// Python worker, so a Python fetched since starts fresh.
class RunnerSession {
  RunnerSession(this._eval, {this.timeLimit = deviceTimeLimit, this.startLimit = const Duration(seconds: 60), this.outputLimit = deviceOutputLimit});

  /// Runs a line of JavaScript in the page.
  final void Function(String js) _eval;
  final Duration timeLimit;

  /// How long Python may take to start (slow panels, first run).
  final Duration startLimit;
  final int outputLimit;

  int _nextId = 0;
  _Run? _current;
  final _loading = StreamController<String>.broadcast();

  /// "Loading Python…" messages while Pyodide starts (the first run takes a few seconds).
  Stream<String> get loading => _loading.stream;

  bool get running => _current != null;

  Future<RunResult> run(RunRequest r) {
    _finish(RunStatus.stopped);
    final run = _current = _Run(++_nextId);
    run.timer = Timer(timeLimit, () => _timeout(run));
    _eval('kx.run(${jsonEncode({'id': run.id, 'lang': r.language.id, 'code': r.source, 'stdin': r.stdin})})');
    return run.done.future;
  }

  void _timeout(_Run run) {
    if (_current != run) return;
    _eval('kx.stop(${run.id})');
    _finish(RunStatus.timeout);
  }

  void stop() {
    final run = _current;
    if (run == null) return;
    _eval('kx.stop(${run.id})');
    _finish(RunStatus.stopped);
  }

  /// A message from the page: JSON text (WebView2 may encode it twice, or hand over the map).
  void receive(Object? message) {
    final m = decodePageMessage(message);
    if (m == null) return;
    final event = m['event'];
    if (event == 'loading' || event == 'loaded') {
      _loading.add(event == 'loading' ? '${m['text'] ?? ''}' : '');
      // Python takes a few seconds to start the first time: that is not the program's time.
      final run = _current;
      if (run != null) {
        run.timer?.cancel();
        run.timer = Timer(event == 'loading' ? startLimit : timeLimit, () => _timeout(run));
      }
      return;
    }
    final run = _current;
    // Messages from a run that was stopped or timed out are dropped.
    if (run == null || m['id'] != run.id) return;
    switch (event) {
      case 'out' || 'err':
        final buf = event == 'out' ? run.out : run.err;
        buf.write(m['text'] ?? '');
        if (run.out.length + run.err.length > outputLimit) {
          _eval('kx.stop(${run.id})');
          _finish(RunStatus.outputLimit);
        }
      case 'done':
        _finish(RunStatus.fromWire(m['status'] as String?), ms: (m['ms'] as num?)?.toInt(), message: m['reason'] == 'python_missing' ? 'needsPython' : null);
    }
  }

  void _finish(RunStatus status, {int? ms, String? message}) {
    final run = _current;
    if (run == null) return;
    _current = null;
    run.timer?.cancel();
    String cap(String s) => s.length > outputLimit ? s.substring(0, outputLimit) : s;
    run.done.complete(
      RunResult(status: status, stdout: cap(run.out.toString()), stderr: cap(run.err.toString()), timeMs: ms ?? run.watch.elapsedMilliseconds, message: message),
    );
  }

  void dispose() {
    _finish(RunStatus.stopped);
    _loading.close();
  }
}

/// A message from the runner page as a map, or null.
Map<String, dynamic>? decodePageMessage(Object? message) {
  Object? decoded = message;
  for (var i = 0; i < 2 && decoded is String; i++) {
    try {
      decoded = jsonDecode(decoded);
    } catch (_) {
      return null;
    }
  }
  return decoded is Map ? decoded.cast<String, dynamic>() : null;
}

class _Run {
  _Run(this.id);

  final int id;
  final out = StringBuffer();
  final err = StringBuffer();
  final done = Completer<RunResult>();
  final watch = Stopwatch()..start();
  Timer? timer;
}
