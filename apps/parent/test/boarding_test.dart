import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_parent/core/boarding.dart';

import 'helpers.dart';

/// Hostel nights (an absence stands out) and the canteen wallet with online top-up, opened from Home.
void main() {
  Future<void> openBoarding(WidgetTester tester) async {
    await tester.scrollUntilVisible(find.byKey(const Key('boardingCard')), 200, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('boardingCard')));
    await tester.pumpAndSettle();
  }

  test('parses the hostel view and the wallet', () {
    final b = BoardingView.fromJson({
      'resident': true,
      'bed': {'block': 'A', 'room': '101', 'bed': 'B1', 'since': '2026-06-01'},
      'passes': [],
      'nights': [
        {'night': '2026-10-07', 'status': 'absent'},
      ],
    });
    expect((b.resident, b.room, b.nights.single.absent), (true, '101', true));
    expect(BoardingView.fromJson({'resident': false, 'bed': null, 'passes': []}).nights, isEmpty);
    final w = WalletView.fromJson({'balancePaise': 5000, 'txns': [], 'meals': [{'date': '2026-10-07', 'meal': 'lunch'}], 'onlinePayments': 'demo'});
    expect((w.balancePaise, w.meals.single.meal), (5000, 'lunch'));
  });

  testWidgets('shows the bed, flags the absent night, the balance and recent meals', (tester) async {
    final (api, _) = await pumpApp(tester);
    await openBoarding(tester);
    expect(api.calls, containsAll(['boarding c1', 'wallet c1']));
    expect(find.text('Block A, room 101, bed B1'), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('nightRoll')), matching: find.text('Absent')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('nightRoll')), matching: find.text('Present')), findsOneWidget);
    expect(find.byKey(const Key('walletBalance')), findsOneWidget);
    expect(find.text('₹250'), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('mealList')), matching: find.text('Lunch')), findsOneWidget);
  });

  testWidgets('tops the wallet up through the demo checkout and shows the new balance', (tester) async {
    final (api, _) = await pumpApp(tester);
    await openBoarding(tester);
    await tester.tap(find.byKey(const Key('walletTopUp')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('preset-500')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('walletCheckout c1 50000'));
    expect(find.text('Demo payment'), findsOneWidget);
    await tester.tap(find.byKey(const Key('demoPay')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('confirmWallet topup1'));
    expect(find.text('₹750'), findsOneWidget);
    expect(find.text('₹500 added to the wallet'), findsOneWidget);
  });

  testWidgets('a small amount is refused before any checkout; without online payment there is no button', (tester) async {
    final (api, _) = await pumpApp(tester);
    await openBoarding(tester);
    await tester.tap(find.byKey(const Key('walletTopUp')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('walletAmount')), '0.5');
    await tester.tap(find.byKey(const Key('walletAmountOk')));
    await tester.pumpAndSettle();
    expect(api.calls.where((c) => c.startsWith('walletCheckout')), isEmpty);
    expect(find.byKey(const Key('walletAmount')), findsOneWidget);
  });

  testWidgets('with online payment off the wallet says so', (tester) async {
    await pumpApp(tester, setup: (api) => api.onlinePayments = null);
    await openBoarding(tester);
    expect(find.byKey(const Key('walletTopUp')), findsNothing);
    expect(find.text('Balance'), findsOneWidget);
  });
}
