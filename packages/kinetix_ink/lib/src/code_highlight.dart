import 'package:flutter/widgets.dart';

/// Syntax colouring for code on the board (code notes) and in the code editor: a small
/// hand-written tokenizer for the languages taught in class (Python, JavaScript, SQL, C, C++,
/// Java). It never fails: anything it does not know is plain text.

enum CodeTokenKind { plain, keyword, type, string, number, comment, function, preprocessor }

class CodeToken {
  const CodeToken(this.start, this.end, this.kind);

  final int start;
  final int end;
  final CodeTokenKind kind;

  @override
  String toString() => '$kind[$start,$end)';
}

/// Colours for each kind of token.
class CodeTheme {
  const CodeTheme({
    required this.plain,
    required this.keyword,
    required this.type,
    required this.string,
    required this.number,
    required this.comment,
    required this.function,
    required this.preprocessor,
    required this.background,
  });

  final Color plain, keyword, type, string, number, comment, function, preprocessor, background;

  /// The dark card of code notes, readable from the back of the class.
  static const dark = CodeTheme(
    plain: Color(0xFFD7E3F4),
    keyword: Color(0xFFC792EA),
    type: Color(0xFFFFCB6B),
    string: Color(0xFFC3E88D),
    number: Color(0xFFF78C6C),
    comment: Color(0xFF8A96A3),
    function: Color(0xFF82AAFF),
    preprocessor: Color(0xFF89DDFF),
    background: Color(0xFF1E2430),
  );

  Color of(CodeTokenKind k) => switch (k) {
    CodeTokenKind.plain => plain,
    CodeTokenKind.keyword => keyword,
    CodeTokenKind.type => type,
    CodeTokenKind.string => string,
    CodeTokenKind.number => number,
    CodeTokenKind.comment => comment,
    CodeTokenKind.function => function,
    CodeTokenKind.preprocessor => preprocessor,
  };
}

class _Lang {
  const _Lang({required this.keywords, this.types = const {}, this.line = '//', this.block = true, this.hash = false, this.triple = false, this.backtick = false, this.caseless = false});

  final Set<String> keywords;
  final Set<String> types;

  /// The line-comment marker.
  final String line;

  /// Whether /* … */ comments exist.
  final bool block;

  /// C's #include lines.
  final bool hash;

  /// Python's ''' and """ strings.
  final bool triple;

  /// JavaScript's `template` strings.
  final bool backtick;

  /// SQL keywords in any case.
  final bool caseless;
}

const _cTypes = {'int', 'char', 'float', 'double', 'void', 'long', 'short', 'unsigned', 'signed', 'bool', 'size_t', 'FILE', 'struct', 'union', 'enum'};
const _cKeywords = {
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'goto', 'sizeof', 'typedef', 'const', 'static', //
  'extern', 'volatile', 'register', 'inline', 'NULL', 'true', 'false',
};

final _langs = <String, _Lang>{
  'python': const _Lang(
    line: '#',
    block: false,
    triple: true,
    keywords: {
      'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', //
      'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
      'while', 'with', 'yield', 'print', 'input', 'range', 'len', 'self',
    },
    types: {'int', 'float', 'str', 'list', 'dict', 'set', 'tuple', 'bool'},
  ),
  'javascript': const _Lang(
    backtick: true,
    keywords: {
      'var', 'let', 'const', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'new', //
      'class', 'extends', 'this', 'super', 'typeof', 'instanceof', 'in', 'of', 'try', 'catch', 'finally', 'throw', 'async', 'await', 'yield',
      'import', 'export', 'from', 'null', 'undefined', 'true', 'false', 'console',
    },
    types: {'Array', 'Object', 'String', 'Number', 'Math', 'Map', 'Set', 'Promise', 'JSON'},
  ),
  'sql': const _Lang(
    line: '--',
    caseless: true,
    keywords: {
      'select', 'from', 'where', 'and', 'or', 'not', 'insert', 'into', 'values', 'update', 'set', 'delete', 'create', 'table', 'drop', 'alter', //
      'add', 'primary', 'key', 'foreign', 'references', 'join', 'inner', 'left', 'right', 'outer', 'on', 'group', 'by', 'order', 'having',
      'asc', 'desc', 'limit', 'distinct', 'as', 'in', 'is', 'null', 'like', 'between', 'union', 'all', 'exists', 'case', 'when', 'then', 'else',
      'end', 'count', 'sum', 'avg', 'min', 'max', 'unique', 'default', 'check', 'index', 'view', 'begin', 'commit', 'rollback',
    },
    types: {'integer', 'int', 'text', 'varchar', 'char', 'real', 'numeric', 'date', 'decimal', 'boolean', 'blob'},
  ),
  'c': const _Lang(hash: true, keywords: _cKeywords, types: _cTypes),
  'cpp': const _Lang(
    hash: true,
    keywords: {
      ..._cKeywords,
      'class', 'public', 'private', 'protected', 'virtual', 'override', 'new', 'delete', 'this', 'namespace', 'using', 'template', 'typename', //
      'try', 'catch', 'throw', 'nullptr', 'friend', 'operator', 'cout', 'cin', 'endl', 'std',
    },
    types: {..._cTypes, 'string', 'vector', 'map', 'auto'},
  ),
  'java': const _Lang(
    keywords: {
      'abstract', 'class', 'extends', 'implements', 'interface', 'public', 'private', 'protected', 'static', 'final', 'new', 'this', 'super', //
      'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'try', 'catch', 'finally', 'throw',
      'throws', 'import', 'package', 'null', 'true', 'false', 'instanceof', 'enum', 'var',
    },
    types: {'int', 'long', 'short', 'byte', 'char', 'float', 'double', 'boolean', 'void', 'String', 'Scanner', 'System', 'Integer', 'List', 'ArrayList', 'Map', 'HashMap'},
  ),
};

/// The canonical language name for [name] ("py", "C++", "js" → "python", "cpp", "javascript"),
/// or null when it is not one the board colours.
String? normalizeCodeLanguage(String? name) {
  final n = (name ?? '').trim().toLowerCase();
  return switch (n) {
    'python' || 'py' || 'python3' => 'python',
    'javascript' || 'js' || 'node' => 'javascript',
    'sql' || 'sqlite' || 'mysql' => 'sql',
    'c' => 'c',
    'cpp' || 'c++' || 'cc' => 'cpp',
    'java' => 'java',
    _ => null,
  };
}

/// A best guess at the language of [code] (for code notes saved without one).
String guessCodeLanguage(String code) {
  final c = code;
  if (RegExp(r'#include\s*<(iostream|bits/|vector|string)>|std::|cout\s*<<|cin\s*>>').hasMatch(c)) return 'cpp';
  if (RegExp(r'#include\s*[<"]').hasMatch(c)) return 'c';
  if (RegExp(r'\bpublic\s+(static\s+)?(class|void)\b|System\.out\.').hasMatch(c)) return 'java';
  if (RegExp(r'^\s*(select|insert|update|delete|create\s+table|drop)\b', caseSensitive: false, multiLine: true).hasMatch(c)) return 'sql';
  if (RegExp(r'\b(console\.log|function\s*\w*\s*\(|let |const |=>)').hasMatch(c)) return 'javascript';
  if (RegExp(r'^\s*(def |import |from \w+ import|print\(|for \w+ in |elif )', multiLine: true).hasMatch(c)) return 'python';
  if (RegExp(r'\b(printf|scanf)\s*\(').hasMatch(c)) return 'c';
  return 'python';
}

bool _isIdStart(int c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c == 95 || c == 36;
bool _isId(int c) => _isIdStart(c) || (c >= 48 && c <= 57);
bool _isDigit(int c) => c >= 48 && c <= 57;

/// The coloured tokens of [code] in [language] (guessed when null or unknown). Whitespace and
/// punctuation are left out; the gaps are plain text.
List<CodeToken> tokenizeCode(String code, String? language) {
  final lang = _langs[normalizeCodeLanguage(language) ?? guessCodeLanguage(code)]!;
  final out = <CodeToken>[];
  final n = code.length;
  var i = 0;
  bool at(String s) => code.startsWith(s, i);
  var lineStart = true;
  while (i < n) {
    final ch = code.codeUnitAt(i);
    if (ch == 10) {
      lineStart = true;
      i++;
      continue;
    }
    if (ch == 32 || ch == 9 || ch == 13) {
      i++;
      continue;
    }
    final start = i;
    if (lang.hash && lineStart && ch == 35) {
      // #include <stdio.h>, #define N 10: the whole line.
      while (i < n && code.codeUnitAt(i) != 10) {
        i++;
      }
      out.add(CodeToken(start, i, CodeTokenKind.preprocessor));
      continue;
    }
    lineStart = false;
    if (at(lang.line)) {
      while (i < n && code.codeUnitAt(i) != 10) {
        i++;
      }
      out.add(CodeToken(start, i, CodeTokenKind.comment));
      continue;
    }
    if (lang.block && at('/*')) {
      final end = code.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      out.add(CodeToken(start, i, CodeTokenKind.comment));
      continue;
    }
    if (lang.triple && (at('"""') || at("'''"))) {
      final q = code.substring(i, i + 3);
      final end = code.indexOf(q, i + 3);
      i = end < 0 ? n : end + 3;
      out.add(CodeToken(start, i, CodeTokenKind.string));
      continue;
    }
    if (ch == 34 || ch == 39 || (lang.backtick && ch == 96)) {
      i++;
      while (i < n) {
        final c = code.codeUnitAt(i);
        if (c == 92) {
          i += 2;
          continue;
        }
        if (c == ch) {
          i++;
          break;
        }
        // An unclosed quote ends at the line's end (except template strings).
        if (c == 10 && ch != 96) break;
        i++;
      }
      if (i > n) i = n;
      out.add(CodeToken(start, i, CodeTokenKind.string));
      continue;
    }
    if (_isDigit(ch) || (ch == 46 && i + 1 < n && _isDigit(code.codeUnitAt(i + 1)))) {
      i++;
      while (i < n && (_isId(code.codeUnitAt(i)) || code.codeUnitAt(i) == 46)) {
        i++;
      }
      out.add(CodeToken(start, i, CodeTokenKind.number));
      continue;
    }
    if (_isIdStart(ch)) {
      while (i < n && _isId(code.codeUnitAt(i))) {
        i++;
      }
      final word = code.substring(start, i);
      final key = lang.caseless ? word.toLowerCase() : word;
      var j = i;
      while (j < n && code.codeUnitAt(j) == 32) {
        j++;
      }
      final call = j < n && code.codeUnitAt(j) == 40;
      final kind = lang.keywords.contains(key)
          ? CodeTokenKind.keyword
          : lang.types.contains(key)
          ? CodeTokenKind.type
          : call
          ? CodeTokenKind.function
          : null;
      if (kind != null) out.add(CodeToken(start, i, kind));
      continue;
    }
    i++;
  }
  return out;
}

/// [code] as coloured spans in [style] (its colour is the plain text's).
TextSpan highlightCode(String code, String? language, TextStyle style, {CodeTheme theme = CodeTheme.dark}) {
  final children = <TextSpan>[];
  var pos = 0;
  for (final t in tokenizeCode(code, language)) {
    if (t.start > pos) children.add(TextSpan(text: code.substring(pos, t.start)));
    children.add(
      TextSpan(
        text: code.substring(t.start, t.end),
        style: TextStyle(color: theme.of(t.kind), fontStyle: t.kind == CodeTokenKind.comment ? FontStyle.italic : null),
      ),
    );
    pos = t.end;
  }
  if (pos < code.length) children.add(TextSpan(text: code.substring(pos)));
  return TextSpan(style: style.copyWith(color: theme.plain), children: children);
}

/// A text field's controller that colours its code as it is typed. Set [language] to null to
/// guess it.
class CodeEditingController extends TextEditingController {
  CodeEditingController({super.text, this.language, this.theme = CodeTheme.dark});

  String? language;
  CodeTheme theme;

  @override
  TextSpan buildTextSpan({required BuildContext context, TextStyle? style, required bool withComposing}) {
    // While an IME is composing (Hindi, Kannada keyboards) keep its underline.
    if (withComposing && value.isComposingRangeValid) return super.buildTextSpan(context: context, style: style, withComposing: withComposing);
    return highlightCode(text, language, style ?? const TextStyle(), theme: theme);
  }
}
