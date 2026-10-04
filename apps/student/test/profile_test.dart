import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/core/api.dart';
import 'package:kinetix_student/core/format.dart';
import 'package:kinetix_student/core/models.dart';

import 'helpers.dart';

void main() {
  Future<void> openProfile(WidgetTester tester) => openTab(tester, 'Profile');

  testWidgets('shows the student details and class', (tester) async {
    await pumpApp(tester);
    await openProfile(tester);
    expect(find.text('Aarav Patel'), findsOneWidget);
    expect(find.text('aarav@demo.kinetix.in'), findsOneWidget);
    expect(find.text('U03BC001'), findsOneWidget);
    expect(find.text('BCom · Undergraduate'), findsOneWidget);
    expect(find.text('Demo College'), findsOneWidget);
    expect(find.text('80% attended in the last 30 days'), findsOneWidget);
  });

  testWidgets('attendance history opens from Profile', (tester) async {
    await pumpApp(tester);
    await openProfile(tester);
    await tester.tap(find.byKey(const Key('attendanceHistory')));
    await tester.pumpAndSettle();
    expect(find.text('Your attendance'), findsOneWidget);
  });

  testWidgets('fees: amount due, overdue, read-only note, invoices and a receipt', (tester) async {
    final (api, _) = await pumpApp(tester);
    await openProfile(tester);
    await scrollTo(tester, find.byKey(const Key('openFees')));
    expect(find.descendant(of: find.byKey(const Key('feesTotal')), matching: find.text('₹1,850')), findsOneWidget);
    expect(find.text('1 fee overdue · next: Exam fee (Nov 2026)'), findsOneWidget);
    expect(find.text('2 fees · 1 receipt'), findsOneWidget);

    await tester.tap(find.byKey(const Key('openFees')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('feesNote')), findsOneWidget);
    expect(find.textContaining('paid by your parent or guardian'), findsOneWidget);
    // No way to pay here.
    expect(find.textContaining('Pay now'), findsNothing);
    expect(find.text('Overdue'), findsOneWidget);
    expect(find.text('Paid'), findsOneWidget);
    await scrollTo(tester, find.byKey(const Key('payment-p1')));
    await tester.tap(find.byKey(const Key('payment-p1')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('receipt p1'));
    expect(find.byKey(const Key('receipt')), findsOneWidget);
    expect(find.text('₹42,500'), findsWidgets);
    expect(find.text('UPI'), findsOneWidget);
    expect(find.text('Nil'), findsOneWidget);
  });

  testWidgets('fees all paid and no payments read calmly', (tester) async {
    await pumpApp(
      tester,
      setup: (api) => api.feeAccount = FeeAccount(duePaise: 0, invoices: [], payments: []),
    );
    await openProfile(tester);
    await scrollTo(tester, find.byKey(const Key('openFees')));
    expect(find.text('All paid'), findsOneWidget);
    await tester.tap(find.byKey(const Key('openFees')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('noPayments')), findsOneWidget);
    expect(find.text('No fees have been issued to you.'), findsOneWidget);
  });

  testWidgets('a fees error offers a retry', (tester) async {
    final (api, _) = await pumpApp(tester, setup: (api) => api.feesError = ApiException(0, "Can't reach KINETIX."));
    await openProfile(tester);
    await scrollTo(tester, find.text("Can't reach KINETIX."));
    api.feesError = null;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('feesTotal')), findsOneWidget);
  });

  testWidgets('changes the KINETIX AI language', (tester) async {
    final (_, state) = await pumpApp(tester);
    await openProfile(tester);
    await scrollTo(tester, find.byKey(const Key('aiLanguage')));
    await tester.tap(find.byKey(const Key('aiLanguage')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('pickLang-hi')));
    await tester.pumpAndSettle();
    expect(state.aiLanguage, AiLanguage.hi);
    expect(find.text('हिन्दी'), findsOneWidget);
  });

  testWidgets('soon entries explain themselves', (tester) async {
    await pumpApp(tester);
    await openProfile(tester);
    await scrollTo(tester, find.text('Timetable'));
    await tester.tap(find.text('Timetable'));
    await tester.pump();
    expect(find.text('Timetable is coming in a later update'), findsOneWidget);
    // Results and library are built now.
    expect(find.text('Marks'), findsNothing);
    expect(find.text('Soon'), findsOneWidget);
  });

  testWidgets('signs out after confirming', (tester) async {
    final (_, state) = await pumpApp(tester);
    await openProfile(tester);
    await scrollTo(tester, find.byKey(const Key('signOut')));
    await tester.tap(find.byKey(const Key('signOut')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('confirmSignOut')));
    await tester.pumpAndSettle();
    expect(state.signedIn, isFalse);
    expect(state.prefs.getString('token'), isNull);
    expect(find.byKey(const Key('signIn')), findsOneWidget);
    // The institution and login are still there for next time.
    expect(state.rememberedTenant, isNotNull);
  });

  test('money in Indian style', () {
    expect(Fmt.rupees(4250000), '₹42,500');
    expect(Fmt.rupees(1234567800), '₹1,23,45,678');
    expect(Fmt.rupees(12350), '₹123.50');
    expect(Fmt(en).paymentMethod('bank_transfer'), 'Bank transfer');
  });
}
