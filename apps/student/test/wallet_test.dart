// The hostel nights, the canteen wallet and online top-up.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/core/campus_services.dart';
import 'package:kinetix_student/features/wallet/wallet_gateway.dart';
import 'package:kinetix_student/features/wallet/wallet_screen.dart';
import 'package:kinetix_student/l10n/l10n.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'fake_api.dart';

Widget host(Widget child) => MaterialApp(
  theme: KinetixTheme.light(),
  locale: const Locale('en'),
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: appLocalizationsDelegates,
  home: child,
);

void main() {
  late FakeStudentApi api;

  setUp(() => api = FakeStudentApi());

  Future<void> pump(WidgetTester tester) async {
    tester.view.physicalSize = const Size(412, 892);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(host(WalletScreen(api: api, studentId: 's1')));
    await tester.pumpAndSettle();
  }

  test('parses nights, meals and the wallet', () {
    final h = HostelView.fromJson({
      'resident': true,
      'bed': {'block': 'A', 'room': '1', 'bed': 'B'},
      'passes': [],
      'nights': [{'night': '2026-10-07', 'status': 'absent'}],
    });
    expect(h.nights.single.status, 'absent');
    final w = WalletView.fromJson({'balancePaise': 100, 'txns': [], 'meals': [{'date': '2026-10-07', 'meal': 'dinner'}], 'onlinePayments': null});
    expect((w.meals.single.meal, w.onlinePayments), ('dinner', null));
  });

  testWidgets('shows the bed, the absent night, the balance and meals', (tester) async {
    await pump(tester);
    expect(api.calls, containsAll(['hostel s1', 'wallet s1']));
    expect(find.text('Block A, room 101, bed B'), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('nightRoll')), matching: find.text('Absent')), findsOneWidget);
    expect(find.text('₹250'), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('mealList')), matching: find.text('Lunch')), findsOneWidget);
  });

  testWidgets('tops up through the demo checkout and shows the new balance', (tester) async {
    await pump(tester);
    await tester.tap(find.byKey(const Key('walletTopUp')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('preset-500')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('walletCheckout s1 50000'));
    expect(find.descendant(of: find.byKey(const Key('demoBanner')), matching: find.text('Demo payment: no money moves')), findsOneWidget);
    await tester.tap(find.byKey(const Key('demoPay')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('confirmWallet topup1'));
    expect(find.text('₹750'), findsOneWidget);
    expect(find.text('₹500 added to your wallet'), findsOneWidget);
  });

  testWidgets('cancelling pays nothing; a bad signature is refused; a tiny amount is not sent', (tester) async {
    await pump(tester);
    await tester.tap(find.byKey(const Key('walletTopUp')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('walletAmount')), '0.5');
    await tester.tap(find.byKey(const Key('walletAmountOk')));
    await tester.pumpAndSettle();
    expect(api.calls.where((c) => c.startsWith('walletCheckout')), isEmpty);
    await tester.tap(find.byKey(const Key('preset-100')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('demoCancel')));
    await tester.pumpAndSettle();
    expect(find.text('Payment cancelled'), findsOneWidget);
    expect(find.text('₹250'), findsOneWidget);

    PaymentGateway.debugOverride = (_) => _WrongSecret();
    addTearDown(() => PaymentGateway.debugOverride = null);
    await tester.tap(find.byKey(const Key('walletTopUp')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('preset-100')));
    await tester.pumpAndSettle();
    expect(find.text('Payment did not go through'), findsNothing);
    expect(find.text('Could not confirm the payment'), findsOneWidget);
    expect(find.text('₹250'), findsOneWidget);
  });

  testWidgets('without online payment there is no top-up button', (tester) async {
    api.onlinePayments = null;
    await pump(tester);
    expect(find.byKey(const Key('walletTopUp')), findsNothing);
    expect(find.textContaining('Online payment is not set up'), findsOneWidget);
  });
}

class _WrongSecret implements PaymentGateway {
  @override
  Future<PaymentResult> pay(BuildContext context, TopUpCheckout c) async => PaymentSucceeded(providerPaymentId: 'pay_x', signature: DemoPaymentGateway.sign('wrong', c.orderId, 'pay_x'));
}
