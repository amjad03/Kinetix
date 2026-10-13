import 'protocol.dart';

/// A line the compiler or the interpreter complained about: tapping it in the code lab puts the
/// cursor on that line.
class CodeIssue {
  const CodeIssue(this.line, this.message, {this.column, this.error = true});

  /// 1-based, in the program as typed.
  final int line;
  final int? column;
  final String message;

  /// An error (false: a warning).
  final bool error;

  @override
  bool operator ==(Object other) => other is CodeIssue && other.line == line && other.column == column && other.message == message && other.error == error;

  @override
  int get hashCode => Object.hash(line, column, message, error);

  @override
  String toString() => 'CodeIssue($line:${column ?? ''} $message)';
}

final _gcc = RegExp(r'^(?:[^\s:]*/)?main\.(?:c|cpp):(\d+):(?:(\d+):)?\s*(?:fatal\s+)?(error|warning):\s*(.+)$', multiLine: true);
final _javac = RegExp(r'^(?:[^\s:]*/)?[A-Za-z_]\w*\.java:(\d+):\s*(error|warning):\s*(.+)$', multiLine: true);
final _python = RegExp(r'File "(?:main\.py|<exec>|<string>)", line (\d+)');
final _jsLine = RegExp(r'at line (\d+)(?::(\d+))?');
final _sqlite = RegExp(r'(?:near line|line) (\d+)');
final _sqlIn = RegExp(r'^Error in: (.+)$', multiLine: true);

/// The lines named in [r]'s compiler output or error, in order, at most [max]. Python's
/// traceback names the last line of the program it reached; the JavaScript worker adds
/// "at line N:C" from the stack, and SQL names the statement that failed (found in [source])
/// or, on the code box, SQLite's "near line N".
List<CodeIssue> issuesOf(CodeLanguage lang, RunResult r, {String source = '', int max = 8}) {
  final out = <CodeIssue>[];
  void add(CodeIssue i) {
    if (i.line > 0 && !out.contains(i) && out.length < max) out.add(i);
  }

  final text = '${r.compileOutput}\n${r.stderr}';
  switch (lang) {
    case CodeLanguage.c || CodeLanguage.cpp:
      for (final m in _gcc.allMatches(text)) {
        add(CodeIssue(int.parse(m[1]!), m[4]!.trim(), column: m[2] == null ? null : int.parse(m[2]!), error: m[3] == 'error'));
      }
    case CodeLanguage.java:
      for (final m in _javac.allMatches(text)) {
        add(CodeIssue(int.parse(m[1]!), m[3]!.trim(), error: m[2] == 'error'));
      }
    case CodeLanguage.python:
      final lines = _python.allMatches(text).toList();
      if (lines.isNotEmpty) add(CodeIssue(int.parse(lines.last[1]!), _lastLine(text)));
    case CodeLanguage.javascript:
      final m = _jsLine.firstMatch(text);
      if (m != null) add(CodeIssue(int.parse(m[1]!), _firstLine(text), column: m[2] == null ? null : int.parse(m[2]!)));
    case CodeLanguage.sql:
      final at = _sqlIn.firstMatch(text);
      final msg = at == null ? _firstLine(text) : text.substring(at.end).trim().split('\n').first;
      final first = at?[1]!.trim().replaceFirst(RegExp(r';$'), '');
      final i = first == null || first.isEmpty ? -1 : source.split('\n').indexWhere((l) => l.trim().startsWith(first));
      if (i >= 0) {
        add(CodeIssue(i + 1, msg));
      } else if (_sqlite.firstMatch(text) case final m?) {
        add(CodeIssue(int.parse(m[1]!), msg));
      }
  }
  return out;
}

String _lastLine(String s) => s.trim().split('\n').where((l) => l.trim().isNotEmpty).lastOrNull?.trim() ?? '';
String _firstLine(String s) => s.trim().split('\n').where((l) => l.trim().isNotEmpty).firstOrNull?.trim() ?? '';

/// The text offset where 1-based [line] starts in [code] (the end if there are fewer lines).
int offsetOfLine(String code, int line) {
  var at = 0;
  for (var i = 1; i < line; i++) {
    final nl = code.indexOf('\n', at);
    if (nl < 0) return code.length;
    at = nl + 1;
  }
  return at;
}
