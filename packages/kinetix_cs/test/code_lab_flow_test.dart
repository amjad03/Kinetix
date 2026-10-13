import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_cs/kinetix_cs.dart';

import 'runner_test.dart' show FakePage, job;

Widget _app(Widget child, {Locale locale = const Locale('en'), Size size = const Size(1400, 900)}) => MaterialApp(
  locale: locale,
  supportedLocales: const [Locale('en'), Locale('hi'), Locale('kn')],
  localizationsDelegates: GlobalMaterialLocalizations.delegates,
  home: Scaffold(body: SizedBox(width: size.width, height: size.height, child: child)),
);

/// A code box answering through http's MockClient (no sockets, so it works in widget tests).
CodeBox _box(List<String> languages, Map<String, Object?> Function(Map<String, dynamic>) answer) => CodeBox(
  own: '192.168.1.20',
  newClient: () => MockClient((req) async {
    if (req.url.path == '/health') return http.Response(jsonEncode({'ok': true, 'languages': languages}), 200);
    return http.Response(jsonEncode(answer(jsonDecode(req.body) as Map<String, dynamic>)), 200);
  }),
);

void main() {
  void size(Size s) {
    final view = TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
    view.physicalSize = s;
    view.devicePixelRatio = 1;
  }

  setUp(() => size(const Size(1400, 900)));

  testWidgets('C runs on the school code box; a compile error links to its line', (tester) async {
    final box = _box(['c', 'cpp', 'java'], (j) => j['source'].toString().contains('oops')
        ? {'status': 'compile_error', 'compileOutput': "main.c: In function 'main':\nmain.c:2:5: error: 'oops' undeclared\n", 'exitCode': 1}
        : {'status': 'ok', 'stdout': 'Namaskara, Asha!\n', 'timeMs': 40});
    await tester.pumpWidget(_app(CodeLab(webRunner: WebRunner(page: FakePage((_, _) {})), box: box, subject: 'c-programming')));
    await tester.pumpAndSettle();
    // The subject opens in C with its own sample, and the chip says where it will run.
    expect(find.textContaining('scanf("%d", &n)'), findsOneWidget);
    expect(find.text("On the school's code box (192.168.1.20)"), findsOneWidget);

    await tester.tap(find.byKey(const Key('code-run')));
    await tester.pumpAndSettle();
    expect(find.text('Namaskara, Asha!'), findsOneWidget);
    expect(find.text("  ·  Ran: On the school's code box (192.168.1.20)"), findsOneWidget);

    await tester.enterText(find.byKey(const Key('code-editor')), 'int main(void) {\n    oops;\n}\n');
    await tester.tap(find.byKey(const Key('code-run')));
    await tester.pumpAndSettle();
    expect(find.text('Compile error'), findsOneWidget);
    await tester.tap(find.text("Line 2: 'oops' undeclared"));
    await tester.pump();
    final editor = tester.widget<TextField>(find.byKey(const Key('code-editor')));
    expect(editor.controller!.selection.textInside(editor.controller!.text), '    oops;');
  });

  testWidgets('Python not on the board: Get Python fetches it once, then it runs offline', (tester) async {
    final root = Directory.systemTemp.createTempSync('kx-py-ui');
    addTearDown(() => root.deleteSync(recursive: true));
    var installed = false;
    final page = FakePage((p, js) {
      if (!js.startsWith('kx.run(')) return;
      final id = job(js)['id'];
      if (!installed) {
        p.post({'id': id, 'event': 'done', 'status': 'unavailable', 'reason': 'python_missing'});
      } else {
        p.post({'id': id, 'event': 'out', 'text': 'Namaskara, Asha!\n'});
        p.post({'id': id, 'event': 'done', 'status': 'ok', 'ms': 3});
      }
    });
    final python = PythonRuntime(
      bundled: const [],
      cacheRoot: () async => root,
      files: [('pyodide.js', 2, sha256.convert(utf8.encode('ok')).toString())],
      cdn: 'http://cdn/',
      newClient: () => MockClient((_) async => http.Response('ok', 200)),
    );
    await tester.pumpWidget(_app(CodeLab(webRunner: WebRunner(page: page), python: python), locale: const Locale('hi')));
    await tester.tap(find.byKey(const Key('code-run')));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 30)));
    await tester.pump();
    expect(find.textContaining('Python अभी इस बोर्ड पर नहीं है'), findsOneWidget);

    // The download writes files, so it runs on the real clock.
    await tester.runAsync(() async {
      await tester.tap(find.byKey(const Key('code-get-python')));
      while (python.state.value.status != PythonStatus.ready) {
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
    });
    installed = true;
    await tester.pump();
    expect(page.evals, contains('kx.reset()'));
    await tester.tap(find.byKey(const Key('code-run')));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 30)));
    await tester.pump();
    expect(find.text('Namaskara, Asha!'), findsOneWidget);
    expect(find.text('  ·  चला: इसी बोर्ड पर, बिना इंटरनेट'), findsOneWidget);
  });

  testWidgets('works on a phone-sized screen', (tester) async {
    size(const Size(390, 780));
    await tester.pumpWidget(_app(CodeLab(webRunner: WebRunner(page: FakePage((_, _) {})), subject: 'dbms'), size: const Size(390, 780)));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.tap(find.byKey(const Key('code-run')));
    await tester.runAsync(() => Future<void>.delayed(const Duration(seconds: 2)));
    await tester.pump();
    expect(find.textContaining('Fathima'), findsWidgets);
  });
}
