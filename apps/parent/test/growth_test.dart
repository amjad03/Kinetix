// A guardian's data rights (for themselves and a child) and a child's report cards and promotion.
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_parent/features/exams/report_card_screen.dart';
import 'package:kinetix_parent/features/privacy/dpdp_screen.dart';
import 'package:kinetix_parent/l10n/l10n.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'fake_api.dart';

Widget host(Widget child, {String language = 'en'}) => MaterialApp(
  theme: KinetixTheme.light(),
  locale: Locale(language),
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: appLocalizationsDelegates,
  home: child,
);

void main() {
  late FakeParentApi api;
  final opened = <String>[];
  Future<bool> fakeOpen(Uint8List bytes, String name, String mime) async {
    opened.add(name);
    return true;
  }

  setUp(() {
    api = FakeParentApi();
    opened.clear();
  });

  testWidgets('data rights: export, own correction, a correction and an erasure for a child', (tester) async {
    tester.view.physicalSize = const Size(412, 2600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(host(DpdpScreen(api: api, children: [api.aarav, api.diya], openFile: fakeOpen)));
    await tester.pumpAndSettle();
    expect(find.textContaining('Gita Rao'), findsOneWidget);

    await tester.tap(find.byKey(const Key('dpdpShowExport')));
    await tester.pumpAndSettle();
    expect(find.text('children: 2 records'), findsOneWidget);
    await tester.tap(find.byKey(const Key('dpdpExportPdf')));
    await tester.pumpAndSettle();
    expect(opened, ['my-data.pdf']);

    // My own phone number: sent as a structured correction.
    await tester.tap(find.byKey(const Key('dpdpField')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Phone').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('dpdpValue')), '+91 99999 11111');
    await tester.tap(find.byKey(const Key('dpdpCorrect')));
    await tester.pumpAndSettle();
    expect(api.calls.last, 'dpdpRequest correction phone=+91 99999 11111 ""');

    // A child's name: sent in words, naming the child.
    await tester.tap(find.byKey(const Key('dpdpAbout')));
    await tester.pumpAndSettle();
    await tester.tap(find.text(api.diya.fullName).last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('dpdpValue')), 'Diya R Shah');
    await tester.tap(find.byKey(const Key('dpdpCorrect')));
    await tester.pumpAndSettle();
    expect(api.calls.last, startsWith('dpdpRequest correction -=- "Child: ${api.diya.fullName}'));
    expect(api.calls.last, contains('Phone: Diya R Shah'));

    await tester.enterText(find.byKey(const Key('dpdpWhy')), 'Moving schools');
    await tester.tap(find.byKey(const Key('dpdpErase')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('confirmErase')));
    await tester.pumpAndSettle();
    expect(api.calls.last, contains('erasure'));
    expect(api.calls.last, contains('Moving schools'));
    expect(find.text('• Fee records are kept for 8 years'), findsOneWidget);
  });

  testWidgets('report cards: lists the terms with promotion, opens a card and its PDF', (tester) async {
    tester.view.physicalSize = const Size(412, 2000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(host(ReportCardsScreen(api: api, child: api.aarav, openFile: fakeOpen)));
    await tester.pumpAndSettle();
    expect(api.calls, contains('reportCards ${api.aarav.id}'));
    expect(find.text('Promotion decision pending'), findsOneWidget);
    await tester.tap(find.byKey(const Key('reportCard-rc2')));
    await tester.pumpAndSettle();
    expect(find.text('Promoted'), findsOneWidget);
    expect(find.text('Next class: Class 8'), findsOneWidget);
    expect(find.text('88/100 · A'), findsOneWidget);
    expect(find.text('Football: B'), findsOneWidget);
    expect(find.text('Attendance: 94.5%'), findsOneWidget);
    await tester.tap(find.byKey(const Key('reportCardPdf')));
    await tester.pumpAndSettle();
    expect(opened, ['report-card.pdf']);
  });

  testWidgets('report cards: an empty list says so', (tester) async {
    api.reportCardList = const [];
    await tester.pumpWidget(host(ReportCardsScreen(api: api, child: api.aarav)));
    await tester.pumpAndSettle();
    expect(find.text('No report cards have been published yet.'), findsOneWidget);
  });

  testWidgets('reads in Hindi and Kannada', (tester) async {
    for (final lang in ['hi', 'kn']) {
      final s = lookupAppLocalizations(Locale(lang));
      await tester.pumpWidget(host(DpdpScreen(api: api, children: [api.aarav]), language: lang));
      await tester.pumpAndSettle();
      expect(find.text(s.dpdpTitle), findsOneWidget);
      expect(find.text('My data rights'), findsNothing);
      await tester.pumpWidget(host(ReportCardsScreen(api: api, child: api.aarav), language: lang));
      await tester.pumpAndSettle();
      expect(find.text(s.promotionPending), findsOneWidget);
    }
  });
}
