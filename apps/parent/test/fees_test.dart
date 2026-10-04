import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_parent/core/format.dart';
import 'package:kinetix_parent/core/models.dart';
import 'package:kinetix_parent/features/fees/fees_screen.dart';
import 'package:kinetix_parent/features/fees/payment_gateway.dart';
import 'package:kinetix_parent/features/fees/razorpay_gateway.dart';

import 'helpers.dart';

void main() {
  Finder inCard(String text) => find.descendant(of: find.byKey(const Key('feesCard')), matching: find.text(text));

  Future<void> scrollTo(WidgetTester tester, Finder f) async {
    await tester.scrollUntilVisible(f, 200, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
  }

  Future<void> openFees(WidgetTester tester) async {
    await scrollTo(tester, find.byKey(const Key('feesCard')));
    await tester.tap(find.byKey(const Key('feesView')));
    await tester.pumpAndSettle();
  }

  group('money', () {
    test('Indian grouping, paise only when non-zero', () {
      expect(Fmt.rupees(0), '₹0');
      expect(Fmt.rupees(100), '₹1');
      expect(Fmt.rupees(99900), '₹999');
      expect(Fmt.rupees(250000), '₹2,500');
      expect(Fmt.rupees(4250050), '₹42,500.50');
      expect(Fmt.rupees(12345600), '₹1,23,456');
      expect(Fmt.rupees(1234567805), '₹1,23,45,678.05');
    });

    test('parses what parents type', () {
      expect(Fmt.parseRupees('2500'), 250000);
      expect(Fmt.parseRupees('2,500.5'), 250050);
      expect(Fmt.parseRupees('₹ 1.05'), 105);
      expect(Fmt.parseRupees('.5'), 50);
      expect(Fmt.parseRupees(''), isNull);
      expect(Fmt.parseRupees('12.345'), isNull);
      expect(Fmt.parseRupees('abc'), isNull);
    });

    test('part payments: at least ₹1 and no more than the balance', () {
      expect(PaySheet.validate('', 250000), 'Enter an amount');
      expect(PaySheet.validate('0.99', 250000), 'The smallest payment is ₹1');
      expect(PaySheet.validate('2500.01', 250000), 'That is more than the ₹2,500 due');
      expect(PaySheet.validate('1', 250000), isNull);
      expect(PaySheet.validate('2500', 250000), isNull);
    });
  });

  testWidgets('the fees card shows what is due, the overdue fee first, and Pay', (tester) async {
    await pumpApp(tester);
    await scrollTo(tester, find.byKey(const Key('feesCard')));
    // ₹32,500 left on tuition + ₹2,500 exam fee.
    expect(inCard('₹35,000'), findsOneWidget);
    expect(inCard('Exam fee'), findsOneWidget);
    expect(inCard('Overdue · was due Thu 1 Oct'), findsOneWidget);
    expect(inCard('2 fees to pay'), findsOneWidget);
    expect(find.byKey(const Key('feesPay')), findsOneWidget);
    expect(find.byKey(const Key('feesView')), findsOneWidget);

    // Diya has paid everything.
    await tester.scrollUntilVisible(find.byKey(const Key('child-c2')), -200, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.byKey(const Key('child-c2')));
    await tester.pumpAndSettle();
    await scrollTo(tester, find.byKey(const Key('feesCard')));
    expect(inCard('All fees paid'), findsOneWidget);
    expect(inCard('Last paid ₹38,000 · Fri 18 Sep'), findsOneWidget);
    expect(find.byKey(const Key('feesPay')), findsNothing);
    expect(inCard('View fees and receipts'), findsOneWidget);
  });

  testWidgets('the fees screen lists dues with part payments, overdue chips and receipts', (tester) async {
    final (api, _) = await pumpApp(tester);
    await openFees(tester);
    expect(find.text("Aarav's fees"), findsOneWidget);
    expect(find.byKey(const Key('totalDue')), findsOneWidget);
    expect(find.text('₹35,000'), findsOneWidget);
    expect(find.text('1 overdue'), findsOneWidget);
    expect(find.byKey(const Key('demoBanner')), findsOneWidget);
    expect(find.text('Demo payment: no money moves'), findsOneWidget);

    // Earliest due first: the overdue exam fee, then tuition with its part payment.
    final exam = tester.getTopLeft(find.byKey(const Key('invoice-i2')));
    final tuition = tester.getTopLeft(find.byKey(const Key('invoice-i1')));
    expect(exam.dy, lessThan(tuition.dy));
    expect(find.text('Overdue · was due Thu 1 Oct'), findsOneWidget);
    expect(find.text('₹10,000 of ₹42,500 paid · ₹32,500 left'), findsOneWidget);
    expect(find.byKey(const Key('pay-i1')), findsOneWidget);
    expect(find.byKey(const Key('pay-i2')), findsOneWidget);

    await tester.scrollUntilVisible(find.byKey(const Key('payment-p1')), 200, scrollable: find.byType(Scrollable).last);
    expect(find.text('₹10,000 · Semester 3 tuition'), findsOneWidget);
    expect(find.text('Mon 28 Sep · Cash · RCPT/2026-27/00001'), findsOneWidget);

    await tester.tap(find.byKey(const Key('payment-p1')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('receipt p1'));
    expect(find.text('RCPT/2026-27/00001'), findsOneWidget);
    expect(find.text('Cash'), findsOneWidget);
    expect(find.text('₹32,500'), findsOneWidget); // balance left
    expect(find.byKey(const Key('paymentSuccessful')), findsNothing);
  });

  testWidgets('Pay on Home takes the overdue fee through the demo checkout to a receipt', (tester) async {
    final (api, _) = await pumpApp(tester);
    await scrollTo(tester, find.byKey(const Key('feesCard')));
    await tester.tap(find.byKey(const Key('feesPay')));
    await tester.pumpAndSettle();

    // The amount sheet opens for the exam fee, full balance selected.
    expect(find.text('Pay Exam fee'), findsOneWidget);
    expect(find.text('Pay ₹2,500'), findsOneWidget);
    await tester.tap(find.byKey(const Key('payContinue')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('checkout i2 250000'));

    // The demo checkout says plainly that no money moves.
    expect(find.text('Demo payment'), findsOneWidget);
    expect(find.descendant(of: find.byType(DemoCheckoutSheet), matching: find.text('Demo payment: no money moves')), findsOneWidget);
    expect(find.byKey(const Key('demoAmount')), findsOneWidget);
    await tester.tap(find.byKey(const Key('demoPay')));
    await tester.pumpAndSettle();

    expect(api.calls, contains('confirm pay10'));
    expect(find.byKey(const Key('paymentSuccessful')), findsOneWidget);
    expect(find.text('₹2,500 paid for Aarav'), findsOneWidget);
    expect(find.text('RCPT/2026-27/00003'), findsOneWidget);
    expect(find.text('Online'), findsOneWidget);
    expect(find.text('Nil · fully paid'), findsOneWidget);
    expect(find.text('Demo College'), findsOneWidget);

    await tester.scrollUntilVisible(find.byKey(const Key('receiptDone')), 200, scrollable: find.byType(Scrollable).last);
    await tester.tap(find.byKey(const Key('receiptDone')));
    await tester.pumpAndSettle();
    // Back on the fees screen: the exam fee moved to Paid and the total dropped.
    expect(find.text('₹32,500'), findsWidgets);
    expect(find.byKey(const Key('invoice-i2')), findsNothing);
    expect(find.byKey(const Key('paid-i2')), findsOneWidget);

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(inCard('₹32,500'), findsOneWidget);
    expect(inCard('Overdue · was due Thu 1 Oct'), findsNothing);
  });

  testWidgets('a part payment is checked against the balance and the minimum', (tester) async {
    final (api, _) = await pumpApp(tester);
    await openFees(tester);
    await tester.tap(find.byKey(const Key('pay-i1')));
    await tester.pumpAndSettle();
    expect(find.text('₹32,500 due'), findsOneWidget);
    await tester.tap(find.byKey(const Key('payPart')));
    await tester.pumpAndSettle();

    final field = find.byKey(const Key('amountField'));
    await tester.tap(find.byKey(const Key('payContinue')));
    await tester.pumpAndSettle();
    expect(find.text('Enter an amount'), findsOneWidget);

    await tester.enterText(field, '0.5');
    await tester.tap(find.byKey(const Key('payContinue')));
    await tester.pumpAndSettle();
    expect(find.text('The smallest payment is ₹1'), findsOneWidget);

    await tester.enterText(field, '40000');
    await tester.pumpAndSettle();
    expect(find.text('That is more than the ₹32,500 due'), findsOneWidget);
    // Letters and a third decimal place can't be typed.
    await tester.enterText(field, '12a');
    expect(tester.widget<TextField>(field).controller!.text, isNot(contains('a')));

    await tester.enterText(field, '5000');
    await tester.pumpAndSettle();
    expect(find.text('Pay ₹5,000'), findsOneWidget);
    await tester.tap(find.byKey(const Key('payContinue')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('checkout i1 500000'));
    await tester.tap(find.byKey(const Key('demoPay')));
    await tester.pumpAndSettle();

    expect(find.text('₹5,000 paid for Aarav'), findsOneWidget);
    expect(find.byKey(const Key('receiptBalance')), findsOneWidget);
    expect(find.text('₹27,500'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('₹15,000 of ₹42,500 paid · ₹27,500 left'), findsOneWidget);
  });

  testWidgets('a payment whose signature does not verify is not recorded', (tester) async {
    PaymentGateway.debugOverride = (_) => DemoPaymentGateway(secret: 'not-the-demo-secret');
    addTearDown(() => PaymentGateway.debugOverride = null);
    final (api, _) = await pumpApp(tester);
    await openFees(tester);
    await tester.tap(find.byKey(const Key('pay-i2')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('payContinue')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('demoPay')));
    await tester.pumpAndSettle();

    expect(api.calls, contains('confirm pay10'));
    expect(find.text("We couldn't confirm this payment"), findsOneWidget);
    expect(find.textContaining('The payment could not be verified'), findsOneWidget);
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('paymentSuccessful')), findsNothing);
    expect(find.byKey(const Key('invoice-i2')), findsOneWidget);
    expect(find.text('₹35,000'), findsOneWidget);
  });

  testWidgets('cancelling the demo checkout pays nothing', (tester) async {
    final (api, _) = await pumpApp(tester);
    await openFees(tester);
    await tester.tap(find.byKey(const Key('pay-i2')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('payContinue')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('demoCancel')));
    await tester.pumpAndSettle();
    expect(find.text('Payment cancelled. Nothing was paid.'), findsOneWidget);
    expect(api.calls.where((c) => c.startsWith('confirm')), isEmpty);
  });

  testWidgets('without online payment, parents are sent to the fees counter', (tester) async {
    await pumpApp(tester, setup: (api) => api.onlinePayments = null);
    await scrollTo(tester, find.byKey(const Key('feesCard')));
    expect(inCard('₹35,000'), findsOneWidget);
    expect(inCard('Please pay at the fees counter.'), findsOneWidget);
    expect(find.byKey(const Key('feesPay')), findsNothing);

    await tester.tap(find.text('View fees and receipts'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('payAtCounter')), findsOneWidget);
    expect(find.textContaining('Please pay at the fees counter'), findsOneWidget);
    expect(find.byKey(const Key('pay-i1')), findsNothing);
    expect(find.byKey(const Key('demoBanner')), findsNothing);
  });

  testWidgets('Razorpay on a desktop build also points to the fees counter', (tester) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.linux;
    try {
      await pumpApp(tester, setup: (api) => api.onlinePayments = 'razorpay');
      await scrollTo(tester, find.byKey(const Key('feesCard')));
      expect(inCard('Please pay at the fees counter.'), findsOneWidget);
      await tester.tap(find.text('View fees and receipts'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Android phones and iPhones'), findsOneWidget);
      expect(find.byKey(const Key('pay-i1')), findsNothing);
    } finally {
      debugDefaultTargetPlatformOverride = null;
    }
  });

  testWidgets('the Razorpay checkout gets the order and reports success, cancel and wallets', (tester) async {
    const channel = MethodChannel('razorpay_flutter');
    Map<String, dynamic>? opened;
    Object? reply;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async {
      if (call.method == 'open') {
        opened = (call.arguments as Map).cast<String, dynamic>();
        return reply;
      }
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, null));

    late BuildContext ctx;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (c) {
            ctx = c;
            return const SizedBox();
          },
        ),
      ),
    );
    final checkout = FeeCheckout(
      paymentId: 'pay1',
      provider: 'razorpay',
      keyId: 'rzp_test_key',
      orderId: 'order_ABC',
      amountPaise: 250000,
      currency: 'INR',
      name: 'Demo College',
      description: 'Exam fee',
      prefillName: 'Rajesh Patel',
      prefillEmail: 'parent@demo.kinetix.in',
      prefillContact: '+919800000001',
    );

    reply = {
      'type': 0,
      'data': {'razorpay_payment_id': 'pay_XYZ', 'razorpay_order_id': 'order_ABC', 'razorpay_signature': 'sig123'},
    };
    final ok = await RazorpayGateway().pay(ctx, checkout);
    expect(opened!['key'], 'rzp_test_key');
    expect(opened!['order_id'], 'order_ABC');
    expect(opened!['amount'], 250000);
    expect(opened!['name'], 'Demo College');
    expect(opened!['description'], 'Exam fee');
    expect(opened!['prefill'], {'name': 'Rajesh Patel', 'email': 'parent@demo.kinetix.in', 'contact': '+919800000001'});
    expect(ok, isA<PaymentSucceeded>().having((r) => r.providerPaymentId, 'id', 'pay_XYZ').having((r) => r.signature, 'sig', 'sig123'));

    reply = {
      'type': 1,
      'data': {'code': 2, 'message': 'Payment cancelled by user'},
    };
    expect(await RazorpayGateway().pay(ctx, checkout), isA<PaymentCancelled>());

    reply = {
      'type': 1,
      'data': {'code': 100, 'message': '{"error":{"description":"Your bank declined the payment"}}'},
    };
    expect(
      await RazorpayGateway().pay(ctx, checkout),
      isA<PaymentFailed>().having((r) => r.message, 'message', 'Your bank declined the payment'),
    );

    reply = {
      'type': 2,
      'data': {'external_wallet': 'paytm'},
    };
    expect(await RazorpayGateway().pay(ctx, checkout), isA<PaymentInWallet>().having((r) => r.walletName, 'wallet', 'paytm'));
  });

  group('fee updates', () {
    AppNotification paid() => AppNotification(
      id: 'f1',
      kind: NotificationKind.fee,
      title: 'Payment received: ₹10,000',
      body: 'Semester 3 tuition for Aarav Patel. Receipt RCPT/2026-27/00001.',
      data: {'paymentId': 'p1', 'studentId': 'c1'},
      createdAt: DateTime.now(),
    );
    AppNotification due() => AppNotification(
      id: 'f2',
      kind: NotificationKind.fee,
      title: 'Fee due: Semester 1 tuition',
      body: '₹38,000 due by Sun 20 Sep. Pay in the app or at the fees counter.',
      data: {'batchId': 'b9'},
      createdAt: DateTime.now(),
    );

    testWidgets('a payment received opens its receipt', (tester) async {
      final (api, _) = await pumpApp(tester, setup: (api) => api.inbox = [paid()]);
      await tester.tap(find.text('Updates'));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.currency_rupee), findsOneWidget);
      await tester.tap(find.byKey(const Key('notification-f1')));
      await tester.pumpAndSettle();
      expect(api.calls, containsAll(['read f1', 'receipt p1']));
      expect(find.text('Receipt'), findsOneWidget);
      expect(find.text('RCPT/2026-27/00001'), findsOneWidget);
    });

    testWidgets("a new fee opens that child's fees", (tester) async {
      await pumpApp(tester, setup: (api) => api.inbox = [due()]);
      await tester.tap(find.text('Updates'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('notification-f2')));
      await tester.pumpAndSettle();
      // The title matches Diya's fee, not the selected child's.
      expect(find.text("Diya's fees"), findsOneWidget);
      expect(find.byKey(const Key('paid-i3')), findsOneWidget);
    });
  });
}
