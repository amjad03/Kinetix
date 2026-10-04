import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers.dart';

void main() {
  testWidgets('profile lists the children, opens fees, results and library, shows the language setting and signs out', (tester) async {
    final (_, state) = await pumpApp(tester);
    await tester.tap(find.text('Profile'));
    await tester.pumpAndSettle();
    expect(find.text('Rajesh Patel'), findsOneWidget);
    expect(find.text('+91 98000 00001'), findsOneWidget);
    expect(find.text('Your children'), findsOneWidget);
    expect(find.text('BCom Sem 3 A · Roll no. U03BC001'), findsOneWidget);
    expect(find.text('BCA Sem 1 A · Roll no. U01CA001'), findsOneWidget);

    // Fees, results and library are built: one entry per child instead of a Soon tile.
    final list = find.byType(Scrollable).last;
    for (final f in ['Fees & receipts', "Aarav's fees", "Diya's fees", "Aarav's results", "Diya's library books"]) {
      await tester.scrollUntilVisible(find.text(f), 200, scrollable: list);
      expect(find.text(f), findsOneWidget);
    }
    await tester.scrollUntilVisible(find.byKey(const Key('signOut')), 200, scrollable: list);
    // Language is built now (see language_test.dart); nothing is marked Soon.
    expect(find.descendant(of: find.byKey(const Key('languageSetting')), matching: find.text('English')), findsOneWidget);
    expect(find.text('Soon'), findsNothing);

    await tester.scrollUntilVisible(find.text("Diya's library books"), -200, scrollable: list);
    // Clear of the collapsed app bar.
    await Scrollable.ensureVisible(tester.element(find.text("Diya's library books")), alignment: 0.5);
    await tester.pumpAndSettle();
    await tester.tap(find.text("Diya's library books"));
    await tester.pumpAndSettle();
    expect(find.text("Diya's library"), findsOneWidget);
    expect(find.text('Discrete Mathematics and Its Applications'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('signOut')), 200, scrollable: list);
    await tester.tap(find.byKey(const Key('signOut')));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Sign out'));
    await tester.pumpAndSettle();
    expect(state.signedIn, isFalse);
    expect(find.byKey(const Key('signIn')), findsOneWidget);
  });

  testWidgets('Home lays out without overflow with large text', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 1.3;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await pumpApp(tester);
    final scrollable = find.byType(Scrollable).first;
    for (var i = 0; i < 8; i++) {
      await tester.drag(scrollable, const Offset(0, -400));
      await tester.pumpAndSettle();
    }
    expect(tester.takeException(), isNull);
  });
}
