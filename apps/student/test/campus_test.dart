import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/features/profile/profile_tab.dart';

import 'helpers.dart';

/// Careers (drives, offers, internships) and grievances, both opened from Profile.
void main() {
  Finder profileList() => find.descendant(of: find.byType(ProfileTab), matching: find.byType(Scrollable)).first;

  Future<void> open(WidgetTester tester, String key) async {
    await openTab(tester, 'Profile');
    await scrollTo(tester, find.byKey(Key(key)), scrollable: profileList());
    await tester.tap(find.byKey(Key(key)));
    await tester.pumpAndSettle();
  }

  group('careers', () {
    testWidgets('lists drives with eligibility; registering calls the API and shows the new state', (tester) async {
      final (api, _) = await pumpApp(tester);
      await open(tester, 'openCareers');
      expect(api.calls, contains('careerOverview ${api.calls.firstWhere((c) => c.startsWith('careerOverview ')).split(' ').last}'));
      expect(find.text('Acme Corp · Acme campus drive'), findsOneWidget);
      expect(find.byKey(const Key('register-d1')), findsOneWidget);
      // Not eligible: no button, the reason instead.
      expect(find.byKey(const Key('register-d2')), findsNothing);
      expect(find.byKey(const Key('reasons-d2')), findsOneWidget);
      expect(find.text('CGPA is below the minimum'), findsOneWidget);
      expect(find.byKey(const Key('internship-i1')), findsOneWidget);

      await tester.tap(find.byKey(const Key('register-d1')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('registerForDrive d1'));
      expect(find.byKey(const Key('register-d1')), findsNothing);
      expect(find.byKey(const Key('withdraw-d1')), findsOneWidget);
      expect(find.text('Registered'), findsOneWidget);
    });

    testWidgets('accepting an offer marks the student placed', (tester) async {
      final (api, _) = await pumpApp(
        tester,
        setup: (api) => (api.careers['offers'] as List).add({
          'id': 'o1', 'company': 'Acme Corp', 'roleTitle': 'Analyst', 'ctcLpa': 6, 'status': 'offered', 'expiresAt': null, 'driveId': 'd1',
        }),
      );
      await open(tester, 'openCareers');
      await tester.tap(find.byKey(const Key('accept-o1')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('respondToOffer o1 accepted'));
      expect(find.byKey(const Key('careersPlaced')), findsOneWidget);
    });
  });

  group('grievances', () {
    testWidgets('shows earlier tickets with their resolution', (tester) async {
      final (api, _) = await pumpApp(tester);
      await open(tester, 'openGrievances');
      expect(api.calls, contains('myGrievances'));
      expect(find.text('GRV-0001 · Fee receipt is wrong'), findsOneWidget);
      expect(find.text('Resolution: Receipt reissued'), findsOneWidget);
      // A resolved ticket can be rated.
      await tester.tap(find.byKey(const Key('rate-g1-4')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('rateGrievance g1 4'));
    });

    testWidgets('raising one anonymously sends the flag and lists the new ticket', (tester) async {
      final (api, _) = await pumpApp(tester);
      await open(tester, 'openGrievances');
      await tester.tap(find.byKey(const Key('raiseGrievance')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('grievanceSubject')), 'Bus is always late');
      await tester.enterText(find.byKey(const Key('grievanceText')), 'Route 4 arrives after the first period.');
      await tester.tap(find.byKey(const Key('grievanceAnonymous')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('grievanceSubmit')));
      await tester.pumpAndSettle();
      expect(api.calls.where((c) => c.startsWith('raiseGrievance')), ['raiseGrievance academic anonymous=true student=null']);
      expect(find.text('GRV-0002 · Bus is always late'), findsOneWidget);
    });
  });
}
