// Library renewals, meal ratings, repair requests and fee instalments.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_parent/core/campus_extras.dart';
import 'package:kinetix_parent/features/school_life/campus_extras_screens.dart';
import 'package:kinetix_parent/features/fees/instalments_screen.dart';
import 'package:kinetix_parent/features/profile/device_trust_tile.dart';
import 'package:kinetix_parent/l10n/l10n.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'fake_api.dart';
import 'helpers.dart';

Widget screen(Widget home, {String language = 'en'}) => MaterialApp(
  theme: KinetixTheme.light(),
  locale: Locale(language),
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: appLocalizationsDelegates,
  home: home,
);

void main() {
  testWidgets('renews a book that is out from the child library screen', (tester) async {
    final (api, _) = await pumpApp(tester);
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('More')));
    await tester.pumpAndSettle();
    final entry = find.text("Aarav's library books");
    await tester.scrollUntilVisible(entry, 200, scrollable: find.byType(Scrollable).last);
    await Scrollable.ensureVisible(tester.element(entry), alignment: 0.5);
    await tester.pumpAndSettle();
    await tester.tap(entry);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('renew-l1')), findsOneWidget);
    await tester.tap(find.byKey(const Key('renew-l1')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('renewLoan l1'));
    expect(find.text('Renewed. The new due date is shown.'), findsOneWidget);
  });

  testWidgets('rates a meal: needs stars first, then sends the rating with the note', (tester) async {
    final api = FakeParentApi();
    await tester.pumpWidget(screen(RateMealScreen(api: api, now: () => DateTime(2026, 10, 10))));
    await tester.tap(find.byKey(const Key('mealSend')));
    await tester.pump();
    expect(find.text('Pick a star rating first.'), findsOneWidget);
    expect(api.calls.where((c) => c.startsWith('rateMeal')), isEmpty);

    await tester.tap(find.byKey(const Key('meal-dinner')));
    await tester.tap(find.byKey(const Key('star-4')));
    await tester.enterText(find.byKey(const Key('mealComment')), 'Hot and fresh');
    await tester.tap(find.byKey(const Key('mealSend')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('rateMeal 2026-10-10 dinner 4 Hot and fresh'));
  });

  testWidgets('lists repair requests with where each one stands', (tester) async {
    final api = FakeParentApi();
    await tester.pumpWidget(screen(RepairRequestsScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Fix the leaking tap'), findsOneWidget);
    expect(find.text('Being fixed'), findsOneWidget);
    expect(find.text('Checked and closed'), findsOneWidget);

    api.repairList = [];
    await tester.pumpWidget(screen(RepairRequestsScreen(key: UniqueKey(), api: api)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('repairEmpty')), findsOneWidget);
  });

  testWidgets('fees show the instalment plan with due dates and status', (tester) async {
    final api = FakeParentApi();
    await tester.pumpWidget(screen(InstalmentsScreen(api: api, invoiceId: 'i2', title: 'Term 2 fee')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('instalments i2'));
    expect(find.text('Instalment 1'), findsOneWidget);
    expect(find.text('Paid'), findsOneWidget);
    expect(find.text('Overdue'), findsOneWidget);
    expect(find.text('Due'), findsOneWidget);
  });

  testWidgets('a fee that is not split says so', (tester) async {
    final api = FakeParentApi()..instalmentData = const InstalmentSchedule(invoiceId: 'i2', title: 'Term 2 fee', amountPaise: 0, paidPaise: 0, instalments: []);
    await tester.pumpWidget(screen(InstalmentsScreen(api: api, invoiceId: 'i2', title: 'Term 2 fee')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('instalmentsNone')), findsOneWidget);
  });

  testWidgets('Hindi and Kannada read in their own words and fit a 360dp phone', (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    for (final lang in ['hi', 'kn']) {
      final s = lookupAppLocalizations(Locale(lang));
      final api = FakeParentApi();
      await tester.pumpWidget(screen(InstalmentsScreen(api: api, invoiceId: 'i2', title: 'Term 2 fee'), language: lang));
      await tester.pumpAndSettle();
      expect(find.text(s.instalmentsTitle), findsOneWidget);
      await tester.pumpWidget(screen(RepairRequestsScreen(api: api), language: lang));
      await tester.pumpAndSettle();
      expect(find.text(s.repairTitle), findsOneWidget);
      await tester.pumpWidget(screen(RateMealScreen(api: api), language: lang));
      await tester.pumpAndSettle();
      expect(find.text(s.mealRateSend), findsOneWidget);
      await tester.pumpWidget(screen(Scaffold(body: DeviceTrustTile(api: api)), language: lang));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('deviceTrustButton')), findsOneWidget);
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('More offers to trust a new phone, then shows it as trusted', (tester) async {
    final (api, _) = await pumpApp(tester);
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('More')));
    await tester.pumpAndSettle();
    final tile = find.byKey(const Key('deviceTrust'));
    await tester.scrollUntilVisible(tile, 200, scrollable: find.byType(Scrollable).last);
    await Scrollable.ensureVisible(tester.element(tile), alignment: 0.5);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('deviceTrustButton')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('trustDevice Parent App'));
    expect(find.text('Trusted'), findsOneWidget);
    expect(find.byKey(const Key('deviceTrustButton')), findsNothing);
  });
}
