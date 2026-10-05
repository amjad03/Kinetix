import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_cs/kinetix_cs.dart';

import 'helpers.dart';

void main() {
  testWidgets('Learn has a Code lab, and SQL runs on the phone', (tester) async {
    await pumpApp(tester);
    await openTab(tester, 'Learn');
    await tester.tap(find.byKey(const Key('tabCodeLab')));
    await tester.pumpAndSettle();
    expect(find.byType(CodeLab), findsOneWidget);
    // No board here: nothing to put code on.
    expect(find.byKey(const Key('code-put')), findsNothing);

    await tester.ensureVisible(find.text('SQL'));
    await tester.tap(find.text('SQL'));
    await tester.pump();
    await tester.ensureVisible(find.byKey(const Key('code-run')));
    await tester.tap(find.byKey(const Key('code-run')));
    await tester.runAsync(() => Future<void>.delayed(const Duration(seconds: 2)));
    await tester.pump();
    expect(find.textContaining('Ananya Rao'), findsOneWidget);
    expect(find.text('Finished'), findsOneWidget);
  });
}
