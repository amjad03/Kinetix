// Policies in the Student App (Profile → Policies): the college's rules that apply to the student, read and
// acknowledged; public ones for information.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_student/core/policies.dart';
import 'package:zynetix_student/features/privacy/policies_screen.dart';
import 'package:zynetix_student/l10n/l10n.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import 'fake_api.dart';

Widget host(Widget child, {String lang = 'en'}) => MaterialApp(
  theme: ZynetixTheme.light(),
  locale: Locale(lang),
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: appLocalizationsDelegates,
  home: child,
);

void main() {
  late FakeStudentApi api;
  setUp(() {
    api = FakeStudentApi();
    api.policies = [
      const MyPolicy(versionId: 'v1', title: 'Anti-ragging policy', version: 2, mustAcknowledge: true, pending: true),
      const MyPolicy(versionId: 'v2', title: 'Green campus', version: 1, mustAcknowledge: false, pending: false),
    ];
    api.policyTexts = {'v1': const PolicyText(title: 'Anti-ragging policy', version: 2, body: 'Ragging in any form is prohibited.', mustAcknowledge: true)};
  });

  test('parses the API shape', () {
    final p = MyPolicy.fromJson({'versionId': 'v', 'title': 'T', 'version': 4, 'mustAcknowledge': true, 'pending': true});
    expect((p.version, p.pending, p.acknowledgedAt), (4, true, null));
  });

  testWidgets('reads a policy and acknowledges it', (tester) async {
    await tester.pumpWidget(host(PoliciesScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Version 2: please read and acknowledge'), findsOneWidget);
    expect(find.text('Version 1, for information'), findsOneWidget);
    await tester.tap(find.byKey(const Key('policy-v1')));
    await tester.pumpAndSettle();
    expect(find.text('Ragging in any form is prohibited.'), findsOneWidget);
    await tester.tap(find.byKey(const Key('acknowledge')));
    await tester.pumpAndSettle();
    expect(api.calls.last, 'acknowledgePolicy v1');
    expect(find.text('Version 2: please read and acknowledge'), findsNothing);
    expect(find.textContaining('Acknowledged on'), findsOneWidget);
  });

  testWidgets('says so when none apply, in Hindi and Kannada too', (tester) async {
    api.policies = [];
    for (final lang in ['en', 'hi', 'kn']) {
      await tester.pumpWidget(host(PoliciesScreen(api: api), lang: lang));
      await tester.pumpAndSettle();
      final s = lookupAppLocalizations(Locale(lang));
      expect(find.text(s.govNoPolicies), findsOneWidget);
      if (lang != 'en') expect(s.govNoPolicies, isNot(lookupAppLocalizations(const Locale('en')).govNoPolicies));
    }
  });
}
