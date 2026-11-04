// Governance in the Teacher App (Profile → Staff tools → Governance): policies to read and acknowledge, minutes of
// committee meetings to approve or object to, and the committee actions the teacher owns.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_teacher/core/governance_models.dart';
import 'package:zynetix_teacher/features/work/governance_screen.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  late FakeTeacherApi api;
  setUp(() {
    api = FakeTeacherApi();
    seed(api);
    api.policies = [
      const MyPolicy(versionId: 'v1', code: 'POL/AR/01', title: 'Anti-ragging policy', version: 2, mustAcknowledge: true, pending: true, effectiveFrom: '2026-09-20'),
      MyPolicy(versionId: 'v2', code: 'POL/GEN/01', title: 'Code of conduct for staff', version: 1, mustAcknowledge: true, pending: false, acknowledgedAt: DateTime.utc(2026, 9, 3, 6)),
      const MyPolicy(versionId: 'v3', code: 'POL/ENV/01', title: 'Green campus', version: 1, mustAcknowledge: false, pending: false),
    ];
    api.policyTexts = {'v1': const PolicyText(title: 'Anti-ragging policy', version: 2, body: 'Ragging in any form is prohibited.', mustAcknowledge: true)};
    api.governance = const MyGovernance(
      committees: [(name: 'Internal Complaints Committee', role: 'chair')],
      toSign: [MinutesToSign(meetingId: 'm1', title: 'ICC meeting 2', meetingOn: '2026-10-28', committee: 'Internal Complaints Committee')],
      actions: [CommitteeAction(id: 'a1', title: 'Book the auditorium', dueOn: '2026-10-30', status: 'open', committee: 'Internal Complaints Committee', overdue: true)],
    );
    api.minutes = {
      'm1': const MeetingMinutes(id: 'm1', title: 'ICC meeting 2', meetingOn: '2026-10-28', committee: 'Internal Complaints Committee', minutes: 'The committee met.', items: [(seq: 1, title: 'Awareness week', resolution: 'Hold it next month')], canSign: true),
    };
  });

  test('parses the API shapes', () {
    final p = MyPolicy.fromJson({'versionId': 'v', 'code': 'C', 'title': 'T', 'version': 3, 'mustAcknowledge': true, 'pending': false, 'acknowledgedAt': '2026-10-01T05:00:00.000Z'});
    expect((p.version, p.pending, p.acknowledgedAt!.day), (3, false, 1));
    final g = MyGovernance.fromJson({
      'committees': [{'name': 'IQAC', 'role': 'secretary'}],
      'toSign': [{'meetingId': 'm', 'title': 'Q2', 'meetingOn': '2026-10-10', 'committee': 'IQAC'}],
      'actions': [{'id': 'a', 'title': 'X', 'dueOn': '2026-10-12', 'status': 'open', 'committee': 'IQAC', 'overdue': true}],
      'upcoming': [],
    });
    expect((g.committees.single.role, g.toSign.single.meetingId, g.actions.single.overdue), ('secretary', 'm', true));
    final m = MeetingMinutes.fromJson({'id': 'm', 'title': 'Q2', 'meetingOn': '2026-10-10', 'committee': {'name': 'IQAC'}, 'minutes': 'Met', 'agenda': [{'seq': 1, 'title': 'A', 'resolution': 'R'}], 'canSign': true, 'minutesHash': 'abc'});
    expect((m.committee, m.items.single.resolution, m.canSign, m.fingerprint), ('IQAC', 'R', true, 'abc'));
  });

  testWidgets('reads a policy and acknowledges it', (tester) async {
    phone(tester);
    await tester.pumpWidget(localizedApp(home: GovernanceScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Version 2: please read and acknowledge'), findsOneWidget);
    expect(find.text('Version 1, for information'), findsOneWidget);
    expect(find.textContaining('Acknowledged on'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('policy-v1')));
    expect(find.text('Ragging in any form is prohibited.'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('acknowledge')));
    expect(api.calls.last, 'acknowledgePolicy v1');
    expect(find.text('Version 2: please read and acknowledge'), findsNothing);
  });

  testWidgets('approves the minutes, objects with a reason, and reports an action', (tester) async {
    phone(tester);
    await tester.pumpWidget(localizedApp(home: GovernanceScreen(api: api)));
    await tester.pumpAndSettle();
    await tapAndSettle(tester, find.byKey(const Key('tabMinutes')));
    expect(find.text('ICC meeting 2'), findsOneWidget);
    expect(find.text('Chairperson'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('minutes-m1')));
    expect(find.text('Resolved: Hold it next month'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('objectMinutes')));
    await tester.enterText(find.byKey(const Key('objection')), 'Item 1 needs the date');
    await tapAndSettle(tester, find.byKey(const Key('sendObjection')));
    expect(api.calls.last, 'signMinutes m1 object Item 1 needs the date');
    expect(find.byKey(const Key('minutes-m1')), findsNothing);

    await tapAndSettle(tester, find.byKey(const Key('tabActions')));
    expect(find.text('Overdue'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('report-a1')));
    await tester.enterText(find.byKey(const Key('actionTaken')), 'Booked for three days');
    await tapAndSettle(tester, find.byKey(const Key('sendReport')));
    expect(api.calls.last, 'reportCommitteeAction a1 done Booked for three days');
    expect(find.byKey(const Key('emptyState')), findsOneWidget);
  });

  testWidgets('speaks Hindi and Kannada', (tester) async {
    for (final lang in ['hi', 'kn']) {
      phone(tester);
      await tester.pumpWidget(localizedApp(home: GovernanceScreen(api: api), language: lang));
      await tester.pumpAndSettle();
      final s = strings(lang);
      expect(find.text(s.govTitle), findsOneWidget);
      expect(find.text(s.govToAcknowledge(2)), findsOneWidget);
      expect(s.govTitle, isNot(strings('en').govTitle));
    }
  });
}
