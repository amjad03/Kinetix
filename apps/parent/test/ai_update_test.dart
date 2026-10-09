// An update from KINETIX AI about the child, asked for on demand.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_parent/core/api.dart';

import 'helpers.dart';

void main() {
  testWidgets('asks for an update and shows what is going well, what to watch and what to do', (tester) async {
    final (api, _) = await pumpApp(tester);
    final card = find.byKey(const Key('aiUpdateCard'));
    await tester.scrollUntilVisible(card, 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('Get an update on Aarav'), findsOneWidget);
    await tester.tap(find.byKey(const Key('aiUpdateAsk')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('aiUpdate c1 en'));
    expect(find.byKey(const Key('aiUpdateHeadline')), findsOneWidget);
    expect(find.text('• Attendance is 92 percent.'), findsOneWidget);
    expect(find.text('• Accounting marks are 48 percent.'), findsOneWidget);
    expect(find.text('What you can do'), findsOneWidget);
    expect(find.textContaining('It can be wrong'), findsOneWidget);
    expect(find.byKey(const Key('aiUpdatePreview')), findsNothing);
  });

  testWidgets('shows why it failed and lets the parent try again', (tester) async {
    final (api, _) = await pumpApp(tester, setup: (a) => a.aiUpdateError = ApiException(503, 'KINETIX AI is not reachable right now.'));
    final card = find.byKey(const Key('aiUpdateCard'));
    await tester.scrollUntilVisible(card, 300, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.byKey(const Key('aiUpdateAsk')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('aiUpdateError')), findsOneWidget);
    api.aiUpdateError = null;
    await tester.tap(find.byKey(const Key('aiUpdateAsk')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('aiUpdateError')), findsNothing);
    expect(find.byKey(const Key('aiUpdateHeadline')), findsOneWidget);
  });
}
