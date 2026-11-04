import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_student/core/attachments.dart';
import 'package:zynetix_student/features/profile/profile_tab.dart';

import 'fake_api.dart';
import 'helpers.dart';

/// The student's placement dashboard (Profile → Careers → My placement): where they stand, documents with upload,
/// each drive's rounds and interview slot, offers, training, AICTE credits and alumni referrals; and the resume
/// filled from the student's record.
void main() {
  Finder profileList() => find.descendant(of: find.byType(ProfileTab), matching: find.byType(Scrollable)).first;
  Finder board() => find.byType(Scrollable).last;

  Future<void> openDashboard(WidgetTester tester) async {
    await openTab(tester, 'Profile');
    await scrollTo(tester, find.byKey(const Key('openCareers')), scrollable: profileList());
    await tester.tap(find.byKey(const Key('openCareers')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('openPlacementDashboard')));
    await tester.pumpAndSettle();
  }

  testWidgets('shows the standing, rounds with the interview slot, training and credits', (tester) async {
    final (api, _) = await pumpApp(tester);
    await openDashboard(tester);
    expect(api.calls.any((c) => c.startsWith('placementDashboard ')), isTrue);
    expect(find.text('CGPA 7.82 · 0 backlogs now · 1 subjects ever failed'), findsOneWidget);
    expect(find.text('Class 10: 88.4% · Class 12: 79.5%'), findsOneWidget);
    expect(find.text('3 drives open to you · 2 registered · 1 shortlisted · 1 offers'), findsOneWidget);
    expect(find.text('Waiting for the cell'), findsOneWidget);
    expect(find.text('Aptitude test · Cleared'), findsOneWidget);
    // The next round shows its slot: 10:00 IST on 9 November in Seminar Hall 2.
    expect(find.textContaining('Technical interview · Waiting · '), findsOneWidget);
    expect(find.textContaining('Seminar Hall 2'), findsOneWidget);
    await tester.scrollUntilVisible(find.byKey(const Key('ppCredits')), 300, scrollable: board());
    expect(find.text('Attendance 83.3% · Aptitude test 1: 38 of 50'), findsOneWidget);
    // 5 of the 14 credits: 9 short.
    expect(find.text('5 of 14 credits earned · 9 short'), findsOneWidget);
  });

  testWidgets('uploads a resume for the cell to verify, and asks an alumnus for a referral', (tester) async {
    final picker = FakeAttachmentPicker();
    AttachmentPicker.instance = picker;
    addTearDown(() => AttachmentPicker.instance = const DeviceAttachmentPicker());
    final (api, _) = await pumpApp(tester, setup: (a) => ((a.placementBoard['standing'] as Map)['documents'] as List)[0]['status'] = 'rejected');
    await openDashboard(tester);
    expect(find.text('Not accepted: upload again'), findsOneWidget);
    await tester.tap(find.byKey(const Key('ppUpload-resume')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('uploadPlacementDocument resume answers.pdf'));
    expect(find.text('Uploaded; the placement cell will verify it'), findsOneWidget);
    expect(find.text('Waiting for the cell'), findsOneWidget);

    // Let the notice go, so it does not cover the button.
    ScaffoldMessenger.of(tester.element(find.byKey(const Key('ppStanding')))).hideCurrentSnackBar();
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('ppAskReferral')), 300, scrollable: board());
    await tester.ensureVisible(find.byKey(const Key('ppAskReferral')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('ppAskReferral')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('alumniMentors'));
    // The company follows the alumnus picked; the message must say something.
    expect(tester.widget<TextField>(find.byKey(const Key('ppRefCompany'))).controller!.text, 'Infosys');
    expect(tester.widget<FilledButton>(find.byKey(const Key('ppRefSend'))).onPressed, isNull);
    await tester.enterText(find.byKey(const Key('ppRefRole')), 'Systems engineer');
    await tester.enterText(find.byKey(const Key('ppRefMessage')), 'Could you refer me for the systems engineer role?');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('ppRefSend')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('requestReferral a1 Infosys'));
    expect(find.text('Request sent'), findsOneWidget);
    expect(find.text('Requested'), findsOneWidget);
  });

  testWidgets('a drive closed by new criteria says why in words', (tester) async {
    final (_, _) = await pumpApp(
      tester,
      setup: (a) => ((a.careers['drives'] as List)[1]['eligibility'] as Map)['reasons'] = ['twelfth_below', 'documents_not_verified'],
    );
    await openTab(tester, 'Profile');
    await scrollTo(tester, find.byKey(const Key('openCareers')), scrollable: profileList());
    await tester.tap(find.byKey(const Key('openCareers')));
    await tester.pumpAndSettle();
    expect(find.text('Class 12 marks are below the minimum · Your documents are not verified yet'), findsOneWidget);
  });

  testWidgets('fills the resume from the record without losing what is there', (tester) async {
    final (api, _) = await pumpApp(tester);
    await openTab(tester, 'Profile');
    await scrollTo(tester, find.byKey(const Key('openCareers')), scrollable: profileList());
    await tester.tap(find.byKey(const Key('openCareers')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('openCareerPrep')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('prepResume')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('fillResume')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('resumeDraft'));
    expect(find.text('Filled from your record; check it and save'), findsOneWidget);
    await tester.scrollUntilVisible(find.textContaining('Class 12 / PUC'), 300, scrollable: find.byType(Scrollable).last);
    expect(find.textContaining('Class 12 / PUC'), findsOneWidget);
  });
}
