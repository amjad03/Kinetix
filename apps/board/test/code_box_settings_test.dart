import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/features/board/kit/cs/code_box_settings.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_cs/kinetix_cs.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late List<Uri> asked;
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    CodeBoxSettings.reset();
    asked = [];
    // A box at 192.168.1.20 that runs C, C++ and Java; nothing else answers.
    CodeBox.shared = CodeBox(
      newClient: () => MockClient((req) async {
        asked.add(req.url);
        if (req.url.host == '192.168.1.20' && req.url.path == '/health') {
          return http.Response(jsonEncode({'ok': true, 'languages': ['c', 'cpp', 'java'], 'name': 'Lab PC'}), 200);
        }
        return http.Response('', 404);
      }),
    );
  });
  tearDown(CodeBoxSettings.reset);

  Future<void> pump(WidgetTester tester, {Locale locale = const Locale('en')}) async {
    tester.view.physicalSize = const Size(900, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        theme: KinetixTheme.light(),
        locale: locale,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: const Scaffold(body: SingleChildScrollView(child: CodeBoxSection())),
      ),
    );
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    await tester.pumpAndSettle();
  }

  testWidgets('the teacher types the box address, saves, and the board finds what it runs', (tester) async {
    await pump(tester);
    expect(find.byKey(const Key('code-box-none')), findsOneWidget);
    // The Board ships Pyodide with JupyterLite, so Python is ready with nothing to fetch.
    expect(find.text('Ready (comes with the board app)'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('code-box-url')), 'not a url ::');
    await tester.tap(find.byKey(const Key('code-box-save')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Enter an address like'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('code-box-url')), '192.168.1.20');
    await tester.enterText(find.byKey(const Key('code-box-key')), 'secret');
    await tester.tap(find.byKey(const Key('code-box-save')));
    await tester.pumpAndSettle();
    expect(find.text('Code box found: Lab PC · 192.168.1.20'), findsOneWidget);
    expect(find.text('Runs: C, C++, Java'), findsOneWidget);
    expect(asked.last, Uri.parse('http://192.168.1.20:8181/health'));
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('kinetix.codeBox.url'), 'http://192.168.1.20:8181');
    expect(prefs.getString('kinetix.codeBox.key'), 'secret');
    // Python can then come from the box.
    expect(PythonRuntime.shared.servers.first, 'http://192.168.1.20:8181/assets/pyodide/${PythonRuntime.version}/');
  });

  testWidgets("the institution's code box comes with the board config", (tester) async {
    await CodeBoxSettings.attach(null);
    CodeBoxSettings.applyConfig({'codeBoxUrl': '10.1.2.3'});
    expect(CodeBox.shared.institution, 'http://10.1.2.3:8181');
    expect(await CodeBox.shared.candidates(), ['http://10.1.2.3:8181']);
    CodeBoxSettings.applyConfig({});
    expect(CodeBox.shared.institution, isNull);
  });

  testWidgets('the section speaks Kannada', (tester) async {
    await pump(tester, locale: const Locale('kn'));
    expect(find.text('ಶಾಲಾ ಕೋಡ್ ಬಾಕ್ಸ್'), findsOneWidget);
  });

  test('every string has Hindi and Kannada', () {
    for (final lang in ['hi', 'kn']) {
      expect(codeBoxStringTable[lang]!.keys.toSet(), codeBoxStringTable['en']!.keys.toSet(), reason: lang);
    }
  });
}
