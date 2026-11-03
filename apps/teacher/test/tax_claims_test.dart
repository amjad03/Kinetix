// Tax and claims (Profile → Work): the investment declaration with proofs, and reimbursement claims with bills.
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_teacher/core/hr_models.dart';
import 'package:zynetix_teacher/core/models.dart';
import 'package:zynetix_teacher/features/hr/tax_claims_screen.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  late FakeTeacherApi api;
  final bill = ChatUpload(name: 'ticket.pdf', mime: 'application/pdf', bytes: Uint8List.fromList('%PDF-1.4'.codeUnits));
  Future<ChatUpload?> pick(BuildContext _) async => bill;
  setUp(() {
    api = FakeTeacherApi();
    seed(api);
  });

  testWidgets('declares investments under the old regime, submits them, then attaches a proof once approved', (tester) async {
    phone(tester);
    await tester.pumpWidget(
      localizedApp(
        home: TaxClaimsScreen(api: api, pickFile: pick),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Investment declaration, FY 2026-27'), findsOneWidget);
    await tapAndSettle(tester, find.text('Old regime'));
    await tester.enterText(find.byKey(const Key('rent')), '12000');
    await tapAndSettle(tester, find.byKey(const Key('addTaxItem')));
    await tester.enterText(find.byKey(const Key('taxAmount-0')), '70000');
    await tapAndSettle(tester, find.byKey(const Key('saveTax')));
    expect(api.calls, contains('saveTaxDeclaration 2026 old 1200000 80C:7000000'));
    expect(find.text('Draft'), findsOneWidget);
    expect(find.byKey(const Key('taxEstimate')), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('submitTax')));
    await tapAndSettle(tester, find.byKey(const Key('submitTax')));
    expect(api.calls, contains('submitTaxDeclaration 2026 declaration'));
    expect(find.text('Waiting for approval'), findsOneWidget);

    // HR approves: the proof can now be attached and the proofs sent.
    final d = api.taxDeclaration!;
    api.taxDeclaration = TaxDeclarationInfo(
      fy: d.fy,
      fyLabel: d.fyLabel,
      regime: d.regime,
      status: 'approved',
      rentMonthlyPaise: d.rentMonthlyPaise,
      rentMonths: d.rentMonths,
      items: d.items,
      oldTaxPaise: d.oldTaxPaise,
      newTaxPaise: d.newTaxPaise,
      version: d.version,
    );
    await tester.pumpWidget(
      localizedApp(
        home: TaxClaimsScreen(key: const Key('again'), api: api, pickFile: pick),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Approved: attach proofs'), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('proof-0')));
    await tapAndSettle(tester, find.byKey(const Key('proof-0')));
    expect(api.calls, contains('attachTaxProof ti0 ticket.pdf'));
    await tester.ensureVisible(find.byKey(const Key('submitProofs')));
    ScaffoldMessenger.of(tester.element(find.byType(TabBarView))).clearSnackBars();
    await tester.pumpAndSettle();
    await tapAndSettle(tester, find.byKey(const Key('submitProofs')));
    expect(api.calls, contains('submitTaxDeclaration 2026 proofs'));
  });

  testWidgets('claims a bill with the receipt and lists it as waiting', (tester) async {
    phone(tester);
    await tester.pumpWidget(
      localizedApp(
        home: TaxClaimsScreen(api: api, pickFile: pick, now: DateTime(2026, 11, 3)),
      ),
    );
    await tester.pumpAndSettle();
    await tapAndSettle(tester, find.byKey(const Key('tabClaims')));
    expect(find.byKey(const Key('claimsEmpty')), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('newClaim')));
    await tapAndSettle(tester, find.byKey(const Key('sendClaim')));
    expect(find.text('Enter the amount and what the bill was for'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('claimAmount')), '1840');
    await tester.enterText(find.byKey(const Key('claimWhat')), 'Bus to the valuation camp');
    await tapAndSettle(tester, find.byKey(const Key('claimBill')));
    await tapAndSettle(tester, find.byKey(const Key('sendClaim')));
    expect(api.calls, containsAll(['submitClaim travel 2026-11-03 184000', 'attachClaimBill rb1 ticket.pdf']));
    expect(find.textContaining('Official travel'), findsOneWidget);
    expect(find.textContaining('Waiting'), findsOneWidget);
  });

  testWidgets('reads in Kannada', (tester) async {
    phone(tester);
    await tester.pumpWidget(
      localizedApp(
        home: TaxClaimsScreen(api: api, pickFile: pick),
        language: 'kn',
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text(strings('kn').taxClaimsTitle), findsOneWidget);
    expect(strings('hi').claimCatBooks, isNot(strings('en').claimCatBooks));
    expect(taxSectionText(strings('kn'), '80C'), strings('kn').taxSec80c);
  });
}
