import 'dart:async';
import 'dart:isolate';

import 'package:sqlite3/sqlite3.dart';

import 'protocol.dart';
import 'sample_databases.dart';

/// SQL on SQLite, on the device. Each run starts from a fresh in-memory copy of the chosen
/// sample database and runs the statements in order: a query prints its rows as a table,
/// anything else how many rows it changed. It runs in its own isolate, so Stop (and the time
/// limit) can end even a runaway recursive query.
class SqlRunner implements CodeRunner {
  SqlRunner({this.timeLimit = deviceTimeLimit});

  final Duration timeLimit;
  Isolate? _isolate;
  Completer<RunResult>? _pending;

  @override
  Future<RunResult> run(RunRequest r) async {
    stop();
    final done = _pending = Completer<RunResult>();
    final port = ReceivePort();
    final watch = Stopwatch()..start();
    final timer = Timer(timeLimit, () => _end(RunResult(status: RunStatus.timeout, timeMs: watch.elapsedMilliseconds)));
    port.listen((m) {
      if (m is List) _end(RunResult(status: RunStatus.fromWire(m[0] as String), stdout: m[1] as String, stderr: m[2] as String, timeMs: watch.elapsedMilliseconds));
    });
    try {
      _isolate = await Isolate.spawn(_main, [port.sendPort, r.source, r.database]);
    } catch (e) {
      _end(RunResult(status: RunStatus.unavailable, message: '$e'));
    }
    final result = await done.future;
    timer.cancel();
    port.close();
    return result;
  }

  void _end(RunResult r) {
    _isolate?.kill(priority: Isolate.immediate);
    _isolate = null;
    final p = _pending;
    _pending = null;
    if (p != null && !p.isCompleted) p.complete(r);
  }

  @override
  void stop() => _end(const RunResult(status: RunStatus.stopped));

  @override
  void dispose() => stop();

  static void _main(List<Object?> args) {
    final (out, status) = runSql(args[1] as String, database: args[2] as String?);
    (args[0] as SendPort).send([status.wire, out.$1, out.$2]);
  }
}

/// Runs [source] on a fresh database (synchronously; [SqlRunner] calls it in an isolate).
/// Returns (stdout, stderr) and the status.
((String, String), RunStatus) runSql(String source, {String? database}) {
  final db = sqlite3.openInMemory();
  final out = StringBuffer();
  try {
    final seed = sampleDatabases[database];
    if (seed != null) db.execute(seed);
    for (final sql in splitSql(source)) {
      try {
        final stmt = db.prepare(sql);
        try {
          final rows = stmt.select();
          if (rows.columnNames.isNotEmpty) {
            out.writeln(formatTable(rows.columnNames, [for (final r in rows.rows) r]));
          } else if (!stmt.isReadOnly) {
            out.writeln(changedRows(sql, db.updatedRows));
          }
        } finally {
          stmt.close();
        }
        if (out.length > deviceOutputLimit) return ((out.toString().substring(0, deviceOutputLimit), ''), RunStatus.outputLimit);
      } on SqliteException catch (e) {
        final first = sql.trim().split('\n').first;
        return ((out.toString(), 'Error in: $first\n${e.message}\n'), RunStatus.runtimeError);
      }
    }
    return ((out.toString(), ''), RunStatus.ok);
  } finally {
    db.close();
  }
}

/// "3 rows inserted." and the like.
String changedRows(String sql, int n) {
  final bare = sql.replaceAll(RegExp(r'--[^\n]*|/\*[\s\S]*?\*/'), '');
  final verb = RegExp(r'^\s*(\w+)', caseSensitive: false).firstMatch(bare)?[1]?.toLowerCase() ?? '';
  return switch (verb) {
    'insert' || 'replace' => '$n row${n == 1 ? '' : 's'} inserted.',
    'update' => '$n row${n == 1 ? '' : 's'} updated.',
    'delete' => '$n row${n == 1 ? '' : 's'} deleted.',
    'create' => 'Created.',
    'drop' => 'Dropped.',
    'alter' => 'Altered.',
    _ => 'Done.',
  };
}

/// Rows as a boxed text table, as MySQL's client prints them (NULL for nulls).
String formatTable(List<String> columns, List<List<Object?>> rows) {
  String cell(Object? v) => v == null ? 'NULL' : (v is double && v == v.roundToDouble() && v.abs() < 1e15 ? v.toStringAsFixed(1) : '$v');
  final widths = [for (var c = 0; c < columns.length; c++) rows.fold(columns[c].length, (w, r) => cell(r[c]).length > w ? cell(r[c]).length : w)];
  final line = '+${[for (final w in widths) '-' * (w + 2)].join('+')}+';
  String row(List<String> cells) => '| ${[for (var c = 0; c < cells.length; c++) cells[c].padRight(widths[c])].join(' | ')} |';
  return [
    line,
    row(columns),
    line,
    for (final r in rows) row([for (final v in r) cell(v)]),
    line,
    '${rows.length} row${rows.length == 1 ? '' : 's'} in set',
  ].join('\n');
}

/// Splits a script into statements on ';', minding quotes, comments and the BEGIN … END of
/// triggers. Empty statements are dropped.
List<String> splitSql(String s) {
  final out = <String>[];
  var start = 0, i = 0, depth = 0;
  final n = s.length;
  bool word(String w) => s.length >= i + w.length && s.substring(i, i + w.length).toUpperCase() == w && (i == 0 || !_isWord(s.codeUnitAt(i - 1))) && (i + w.length == n || !_isWord(s.codeUnitAt(i + w.length)));
  while (i < n) {
    final c = s[i];
    if (c == "'" || c == '"' || c == '`') {
      final end = s.indexOf(c, i + 1);
      i = end < 0 ? n : end + 1;
    } else if (c == '[') {
      final end = s.indexOf(']', i + 1);
      i = end < 0 ? n : end + 1;
    } else if (s.startsWith('--', i)) {
      final end = s.indexOf('\n', i);
      i = end < 0 ? n : end + 1;
    } else if (s.startsWith('/*', i)) {
      final end = s.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
    } else if (word('BEGIN') && RegExp(r'CREATE\s+(TEMP\s+|TEMPORARY\s+)?TRIGGER', caseSensitive: false).hasMatch(s.substring(start, i))) {
      depth++;
      i += 5;
    } else if (depth > 0 && word('END')) {
      depth--;
      i += 3;
    } else if (c == ';' && depth == 0) {
      out.add(s.substring(start, i));
      start = ++i;
    } else {
      i++;
    }
  }
  out.add(s.substring(start));
  return [
    for (final x in out)
      if (x.replaceAll(RegExp(r'--[^\n]*|/\*[\s\S]*?\*/'), '').trim().isNotEmpty) x.trim(),
  ];
}

bool _isWord(int c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c == 95;
