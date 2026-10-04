import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers.dart';

void main() {
  testWidgets('profile lists the children, opens fees, marks unbuilt features Soon and signs out', (tester) async {
    final (_, state) = await pumpApp(tester);
    await tester.tap(find.text('Profile'));
    await tester.pumpAndSettle();
    expect(find.text('Rajesh Patel'), findsOneWidget);
    expect(find.text('+91 98000 00001'), findsOneWidget);
    expect(find.text('Your children'), findsOneWidget);
    expect(find.text('BCom Sem 3 A · Roll no. U03BC001'), findsOneWidget);
    expect(find.text('BCA Sem 1 A · Roll no. U01CA001'), findsOneWidget);

    await tester.scrollUntilVisible(find.byKey(const Key('signOut')), 200, scrollable: find.byType(Scrollable).last);
    for (final f in ['Message the teacher', 'Library books', 'Language']) {
      expect(find.text(f), findsOneWidget);
    }
    expect(find.text('Soon'), findsNWidgets(3));
    // Fees are built: one entry per child instead of a Soon tile.
    expect(find.text('Fees & receipts'), findsOneWidget);
    expect(find.text("Aarav's fees"), findsOneWidget);
    expect(find.text("Diya's fees"), findsOneWidget);
    await tester.tap(find.text('Library books'));
    await tester.pump();
    expect(find.text('Library books is coming in a later update'), findsOneWidget);

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
