import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_parent/features/exams/academic_docs_screen.dart';
import 'package:kinetix_parent/l10n/app_localizations.dart';

import 'package:kinetix_parent/demo/fake_api.dart';

void main() {
  testWidgets('a student requests a document and downloads an issued one', (tester) async {
    final api = FakeParentApi();
    var opened = '';
    await tester.pumpWidget(MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: AcademicDocsScreen(api: api, childId: 's1', openFile: (bytes, name, mime) async { opened = name; return true; }),
    ));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('docDownload-d1')), findsOneWidget);
    await tester.tap(find.byKey(const Key('docDownload-d1')));
    await tester.pumpAndSettle();
    expect(opened, contains('GC/2026/0001'));
    await tester.tap(find.byKey(const Key('docRequest')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('requestAcademicDoc transcript'));
  });
}
