import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_parent/features/profile/profile_tab.dart';

import 'helpers.dart';

/// Careers (read only) and grievances for a child, both opened from Profile.
void main() {
  Finder profileList() => find.descendant(of: find.byType(ProfileTab), matching: find.byType(Scrollable)).first;

  Future<void> open(WidgetTester tester, String key) async {
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('More')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(Key(key)), 200, scrollable: profileList());
    await Scrollable.ensureVisible(tester.element(find.byKey(Key(key))), alignment: 0.5);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(Key(key)));
    await tester.pumpAndSettle();
  }

  testWidgets('careers: the child\'s drives and eligibility, with no way to register', (tester) async {
    final (api, _) = await pumpApp(tester);
    await open(tester, 'profile-careers-c1');
    expect(api.calls, contains('careerOverview c1'));
    expect(find.text('Acme Corp · Acme campus drive'), findsOneWidget);
    expect(find.text('CGPA is below the minimum'), findsOneWidget);
    expect(find.byKey(const Key('register-d1')), findsNothing);
    expect(find.byKey(const Key('withdraw-d1')), findsNothing);
    expect(find.textContaining('Only your child can register'), findsOneWidget);
  });

  testWidgets('grievances: raising one names the child', (tester) async {
    final (api, _) = await pumpApp(tester);
    await open(tester, 'profile-grievances-c1');
    expect(api.calls, contains('myGrievances'));
    expect(find.text('GRV-0001 · Fee receipt is wrong'), findsOneWidget);
    await tester.tap(find.byKey(const Key('raiseGrievance')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('grievanceSubject')), 'Hostel water');
    await tester.enterText(find.byKey(const Key('grievanceText')), 'No hot water since Monday.');
    await tester.ensureVisible(find.byKey(const Key('grievanceSubmit')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('grievanceSubmit')));
    await tester.pumpAndSettle();
    expect(api.calls.where((c) => c.startsWith('raiseGrievance')), ['raiseGrievance academic anonymous=false student=c1']);
    expect(find.text('GRV-0002 · Hostel water'), findsOneWidget);
  });
}
