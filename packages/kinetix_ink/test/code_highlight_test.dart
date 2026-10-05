import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

List<(String, CodeTokenKind)> words(String code, String? lang) => [for (final t in tokenizeCode(code, lang)) (code.substring(t.start, t.end), t.kind)];

void main() {
  test('python: keywords, strings, numbers, comments and calls', () {
    final w = words('def area(r):\n    # pi r squared\n    return 3.14 * r * r  # done\nprint("hi")', 'python');
    expect(w, contains(('def', CodeTokenKind.keyword)));
    expect(w, contains(('area', CodeTokenKind.function)));
    expect(w, contains(('# pi r squared', CodeTokenKind.comment)));
    expect(w, contains(('3.14', CodeTokenKind.number)));
    expect(w, contains(('"hi"', CodeTokenKind.string)));
    expect(w, contains(('print', CodeTokenKind.keyword)));
  });

  test('C: #include lines, types and block comments', () {
    final w = words('#include <stdio.h>\n/* sum */\nint main() { printf("%d", 1); }', 'c');
    expect(w.first, ('#include <stdio.h>', CodeTokenKind.preprocessor));
    expect(w, contains(('/* sum */', CodeTokenKind.comment)));
    expect(w, contains(('int', CodeTokenKind.type)));
    expect(w, contains(('printf', CodeTokenKind.function)));
  });

  test('SQL keywords in any case; -- comments', () {
    final w = words("SELECT name FROM students -- all\nwhere marks > 50 and city = 'Mysuru';", 'sql');
    expect(w, containsAll([('SELECT', CodeTokenKind.keyword), ('where', CodeTokenKind.keyword), ('-- all', CodeTokenKind.comment), ("'Mysuru'", CodeTokenKind.string), ('50', CodeTokenKind.number)]));
  });

  test('unclosed strings and comments never throw', () {
    for (final code in ['"abc', "'''x", '/* open', 'x = `a\nb', '\\', '"a\\']) {
      for (final lang in ['python', 'javascript', 'c', 'java', 'sql', null]) {
        expect(() => highlightCode(code, lang, const TextStyle()).toPlainText(), returnsNormally);
        expect(highlightCode(code, lang, const TextStyle()).toPlainText(), code);
      }
    }
  });

  test('guesses the language of notes saved without one', () {
    expect(guessCodeLanguage('#include <iostream>\nint main(){ std::cout << 1; }'), 'cpp');
    expect(guessCodeLanguage('#include <stdio.h>'), 'c');
    expect(guessCodeLanguage('public class Main { public static void main(String[] a) {} }'), 'java');
    expect(guessCodeLanguage('select * from library;'), 'sql');
    expect(guessCodeLanguage('const x = 2;\nconsole.log(x)'), 'javascript');
    expect(guessCodeLanguage('for i in range(3):\n  print(i)'), 'python');
    expect(normalizeCodeLanguage('C++'), 'cpp');
    expect(normalizeCodeLanguage('Py'), 'python');
    expect(normalizeCodeLanguage('cobol'), isNull);
  });

  test('the highlighted text is the code, unchanged, and coloured', () {
    const code = 'for (int i = 0; i < 3; i++) { /* x */ }';
    final span = highlightCode(code, 'java', const TextStyle(fontSize: 12));
    expect(span.toPlainText(), code);
    expect(span.children!.whereType<TextSpan>().any((s) => s.style?.color == CodeTheme.dark.keyword), isTrue);
  });

  test('code notes keep their language through copies', () {
    const n = NoteElement(id: 'a', rect: Rect.zero, text: 'x', color: Color(0xFF000000), kind: NoteKind.code, language: 'python');
    expect(n.copyWith(text: 'y').language, 'python');
    expect(n.copyWith(language: 'c').language, 'c');
  });
}
