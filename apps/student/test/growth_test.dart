// Data rights (DPDP), my house and homework peer review.
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/features/campus/house_screen.dart';
import 'package:kinetix_student/features/profile/profile_tab.dart';
import 'package:kinetix_student/features/homework/peer_review_screen.dart';
import 'package:kinetix_student/features/privacy/dpdp_screen.dart';
import 'package:kinetix_student/l10n/l10n.dart';
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

Finder profileList() => find.descendant(of: find.byType(ProfileTab), matching: find.byType(Scrollable)).first;

void main() {
  late FakeStudentApi api;
  setUp(() => api = FakeStudentApi());

  testWidgets('data rights: officer, export summary and PDF, correction, erasure with a retention notice', (tester) async {
    tester.view.physicalSize = const Size(412, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    String? opened;
    await tester.pumpWidget(screen(DpdpScreen(api: api, openFile: (Uint8List bytes, String name, String mime)async {
      opened = name;
      return true;
    })));
    await tester.pumpAndSettle();
    expect(find.textContaining('Gita Rao'), findsOneWidget);
    expect(find.textContaining('Correction · Done'), findsOneWidget);

    await tester.tap(find.byKey(const Key('dpdpShowExport')));
    await tester.pumpAndSettle();
    expect(find.text('attendance: 40 records'), findsOneWidget);
    await tester.tap(find.byKey(const Key('dpdpExportPdf')));
    await tester.pumpAndSettle();
    expect(opened, 'my-data.pdf');

    await tester.tap(find.byKey(const Key('dpdpCorrect')));
    await tester.pumpAndSettle();
    expect(find.text('Enter the correct value.'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('dpdpValue')), 'Aarav R Patel');
    await tester.tap(find.byKey(const Key('dpdpCorrect')));
    await tester.pumpAndSettle();
    expect(api.calls.last, 'dpdpRequest correction fullName=Aarav R Patel ""');
    expect(find.byKey(const Key('dpdpNotice')), findsOneWidget);

    await tester.enterText(find.byKey(const Key('dpdpWhy')), 'Leaving');
    await tester.tap(find.byKey(const Key('dpdpErase')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('confirmErase')));
    await tester.pumpAndSettle();
    expect(api.calls.last, 'dpdpRequest erasure -=- "Leaving"');
    expect(find.text('• Fee records are kept for 8 years'), findsOneWidget);
    expect(find.byKey(const Key('dpdpRequest-r3')), findsOneWidget);
  });

  testWidgets('my house: shows my house, rank, my points, recent points and the leaderboard', (tester) async {
    await tester.pumpWidget(screen(HouseScreen(api: api, studentId: 's1')));
    await tester.pumpAndSettle();
    expect(find.text('Kaveri'), findsWidgets);
    expect(find.text('Rank 2 · 90 points'), findsOneWidget);
    expect(find.text('My points: 20'), findsOneWidget);
    expect(find.text('Won the quiz'), findsOneWidget);
    expect(find.byKey(const Key('leader-h2')), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(screen(HouseScreen(api: api, studentId: 'nobody')));
    await tester.pumpAndSettle();
    expect(find.text('You have not been placed in a house yet.'), findsOneWidget);
  });

  testWidgets('peer review: scores a classmate\'s anonymous work and reads feedback on mine', (tester) async {
    tester.view.physicalSize = const Size(412, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(screen(PeerReviewScreen(api: api, homeworkId: 'h1')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Names are hidden'), findsOneWidget);
    expect(find.text('Goodwill is the extra value of a business.'), findsOneWidget);

    await tester.tap(find.byKey(const Key('peerSave-pr1')));
    await tester.pumpAndSettle();
    expect(find.text('Give a score for each and write a comment.'), findsOneWidget);
    await tester.tap(find.byKey(const Key('rubric-pr1-clarity-5')));
    await tester.tap(find.byKey(const Key('rubric-pr1-accuracy-4')));
    await tester.tap(find.byKey(const Key('rubric-pr1-effort-3')));
    await tester.enterText(find.byKey(const Key('peerComment-pr1')), 'Clear and tidy');
    await tester.tap(find.byKey(const Key('peerSave-pr1')));
    await tester.pumpAndSettle();
    expect(api.calls.last, 'peerReview h1 pr1 5/4/3 "Clear and tidy"');
    expect(find.text('Work A ✓'), findsOneWidget);

    await tester.tap(find.text('My feedback'));
    await tester.pumpAndSettle();
    expect(find.text('Average score (out of 15): 12.0'), findsOneWidget);
    expect(find.text('Clear and tidy'), findsWidgets);
    expect(find.text('12/15'), findsOneWidget);
    expect(find.byKey(const Key('peerPending')), findsOneWidget);
  });

  testWidgets('Profile links to my house and my data rights', (tester) async {
    final (_, _) = await pumpApp(tester);
    await openTab(tester, 'Profile');
    await scrollTo(tester, find.byKey(const Key('openHouse')), scrollable: profileList());
    expect(find.byKey(const Key('openHouse')), findsOneWidget);
    await scrollTo(tester, find.byKey(const Key('openDpdp')), scrollable: profileList());
    await tester.tap(find.byKey(const Key('openDpdp')));
    await tester.pumpAndSettle();
    expect(find.byType(DpdpScreen), findsOneWidget);
  });

  testWidgets('reads in Hindi and Kannada', (tester) async {
    for (final lang in ['hi', 'kn']) {
      final s = lookupAppLocalizations(Locale(lang));
      await tester.pumpWidget(screen(DpdpScreen(api: api), language: lang));
      await tester.pumpAndSettle();
      expect(find.text(s.dpdpTitle), findsOneWidget);
      expect(find.text('My data rights'), findsNothing);
      await tester.pumpWidget(screen(PeerReviewScreen(api: api, homeworkId: 'h1'), language: lang));
      await tester.pumpAndSettle();
      expect(find.text(s.peerToReview), findsOneWidget);
      await tester.pumpWidget(screen(HouseScreen(api: api, studentId: 's1'), language: lang));
      await tester.pumpAndSettle();
      expect(find.text(s.houseLeaderboard), findsOneWidget);
    }
  });
}
