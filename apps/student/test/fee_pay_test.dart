import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_student/core/models.dart';
import 'package:zynetix_student/features/fees/fee_pay.dart';
import 'package:zynetix_student/features/fees/fees_screen.dart';
import 'package:zynetix_student/l10n/app_localizations.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  Future<void> openFees(WidgetTester tester) async {
    await openTab(tester, 'Profile');
    await scrollTo(tester, find.byKey(const Key('openFees')));
    await tester.tap(find.byKey(const Key('openFees')));
    await tester.pumpAndSettle();
  }

  /// The demo fees with [provider] as the gateway, and the exam fee on instalments (₹1,000 due now).
  void withGateway(FakeStudentApi api, String? provider, {bool allowPartial = true, int minPartPaise = 0}) {
    final a = api.feeAccount;
    api.feeAccount = FeeAccount(
      duePaise: a.duePaise,
      onlinePayments: provider,
      allowPartial: allowPartial,
      minPartPaise: minPartPaise,
      invoices: [
        for (final i in a.invoices)
          i.id == 'i2' ? FeeInvoice(id: i.id, title: i.title, amountPaise: i.amountPaise, paidPaise: i.paidPaise, dueOn: i.dueOn, status: i.status, dueNowPaise: 100000) : i,
      ],
      payments: a.payments,
    );
  }

  testWidgets('the student pays a fee in the demo checkout and sees the receipt', (tester) async {
    final (api, _) = await pumpApp(tester, setup: (api) => withGateway(api, 'demo'));
    await openFees(tester);
    expect(find.textContaining('You can pay here'), findsOneWidget);
    // The paid fee has no Pay button; the one due has.
    expect(find.byKey(const Key('pay-i1')), findsNothing);
    await tester.tap(find.byKey(const Key('pay-i2')));
    await tester.pumpAndSettle();
    expect(find.text('Due: ₹1,850'), findsOneWidget);
    await tester.tap(find.byKey(const Key('payContinue')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('feeCheckout i2'));
    expect(find.byKey(const Key('demoBanner')), findsOneWidget);
    await tester.tap(find.byKey(const Key('demoPay')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('confirmFee fpay1'));
    expect(find.byKey(const Key('receipt')), findsOneWidget);
    expect(find.text('₹1,850'), findsWidgets);
  });

  testWidgets('PayU, Cashfree, Easebuzz and CCAvenue open in the browser; the app checks with the server', (tester) async {
    final opened = <Uri>[];
    FeePayFlow.debugOpener = (u) async {
      opened.add(u);
      return true;
    };
    addTearDown(() => FeePayFlow.debugOpener = null);
    final (api, _) = await pumpApp(tester, setup: (api) => withGateway(api, 'cashfree'));
    await openFees(tester);
    await tester.tap(find.byKey(const Key('pay-i2')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('payContinue')));
    await tester.pumpAndSettle();
    expect(opened.single.path, '/v1/public/checkout/demo-college/fpay1');
    // Not paid yet at the gateway: the app says so and keeps waiting.
    await tester.tap(find.byKey(const Key('checkPayment')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('browserNote')), findsOneWidget);
    api.browserPaid.add('fpay1');
    await tester.tap(find.byKey(const Key('checkPayment')));
    await tester.pumpAndSettle();
    expect(api.calls.where((c) => c == 'refreshFee fpay1'), hasLength(2));
    expect(find.byKey(const Key('receipt')), findsOneWidget);
  });

  testWidgets('the pay sheet offers the instalment due now, and a part only when the college allows it', (tester) async {
    FeePayFlow.debugOpener = (u) async => true;
    addTearDown(() => FeePayFlow.debugOpener = null);
    final (api, _) = await pumpApp(tester, setup: (api) => withGateway(api, 'payu', allowPartial: false));
    await openFees(tester);
    await tester.tap(find.byKey(const Key('pay-i2')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('payPart')), findsNothing);
    await tester.tap(find.byKey(const Key('payInstalment')));
    await tester.pumpAndSettle();
    expect(find.text('Pay ₹1,000'), findsOneWidget);
    await tester.tap(find.byKey(const Key('payContinue')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('feeCheckout i2 100000'));
  });

  testWidgets('a part payment is checked against the balance and the smallest part', (tester) async {
    final (api, _) = await pumpApp(tester, setup: (api) => withGateway(api, 'demo', minPartPaise: 50000));
    await openFees(tester);
    await tester.tap(find.byKey(const Key('pay-i2')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('payPart')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('payAmount')), '5000');
    await tester.tap(find.byKey(const Key('payContinue')));
    await tester.pumpAndSettle();
    expect(find.text('That is more than the ₹1,850 due'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('payAmount')), '200');
    await tester.tap(find.byKey(const Key('payContinue')));
    await tester.pumpAndSettle();
    expect(find.text('Pay at least ₹500 at a time'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('payAmount')), '600');
    await tester.tap(find.byKey(const Key('payContinue')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('feeCheckout i2 60000'));
  });

  testWidgets('a counter-only college shows no Pay button', (tester) async {
    await pumpApp(tester, setup: (api) => withGateway(api, null));
    await openFees(tester);
    expect(find.byKey(const Key('pay-i2')), findsNothing);
    expect(find.textContaining('paid by your parent or guardian'), findsOneWidget);
  });

  testWidgets('a receipt downloads as the office’s PDF', (tester) async {
    final (api, _) = await pumpApp(tester);
    final files = <String>[];
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: ReceiptScreen(
          api: api,
          paymentId: 'p1',
          openFile: (Uint8List bytes, String name, String mime) async {
            files.add('$name $mime ${bytes.length}');
            return true;
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('receiptPdf')), 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.byKey(const Key('receiptPdf')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('feeReceiptPdf p1'));
    expect(files.single, startsWith('receipt-RCPT-2026-27-00001.pdf application/pdf'));
  });

  testWidgets('Razorpay on a desktop build opens its web checkout in the browser', (tester) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.linux;
    final opened = <Uri>[];
    FeePayFlow.debugOpener = (u) async {
      opened.add(u);
      return true;
    };
    try {
      await pumpApp(tester, setup: (api) => withGateway(api, 'razorpay'));
      await openFees(tester);
      await tester.tap(find.byKey(const Key('pay-i2')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('payContinue')));
      await tester.pumpAndSettle();
      expect(opened, hasLength(1));
      expect(find.byKey(const Key('checkPayment')), findsOneWidget);
    } finally {
      debugDefaultTargetPlatformOverride = null;
      FeePayFlow.debugOpener = null;
    }
  });
}
