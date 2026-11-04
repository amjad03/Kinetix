// Indents (Profile → Work): a head of department approves a department indent (it goes on to the principal) and
// rejects another with a reason; their own indent never offers the decision; in Kannada too.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_teacher/features/work/office_screens.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  late FakeTeacherApi api;
  Map<String, dynamic> row(String id, String number, String by, String reason) => {'id': id, 'number': number, 'status': 'submitted', 'reason': reason, 'step': 'hod', 'decisionNote': null, 'neededBy': null, 'createdAt': '2026-11-02T05:00:00.000Z', 'estimatedPaise': 96000, 'department': 'Commerce', 'requestedBy': by, 'requester': by == 'me' ? 'Dr. Kavitha Murthy' : 'Sudhir Kamath', 'lines': [{'itemId': 'it1', 'item': 'Whiteboard marker', 'unit': 'box', 'qty': 2}]};
  setUp(() {
    api = FakeTeacherApi();
    seed(api);
    api.indentRows = [row('d1', 'REQ-0021', 'u-sudhir', 'Markers for Room 104'), row('d2', 'REQ-0022', 'u-sudhir', 'Extra registers'), row('m1', 'REQ-0023', 'me', 'My own request')];
  });

  testWidgets('approves one, rejects another with a reason, and never decides its own', (tester) async {
    phone(tester);
    await tester.pumpWidget(localizedApp(home: IndentsScreen(api: api, userId: 'me')));
    await tester.pumpAndSettle();
    expect(find.text('Raised by Sudhir Kamath'), findsNWidgets(2));
    expect(find.byKey(const Key('indentApprove-m1')), findsNothing);
    await tapAndSettle(tester, find.byKey(const Key('indentApprove-d1')));
    expect(api.calls, contains('decideIndent d1 approve'));
    expect(find.text('Approved; it goes on to the principal'), findsOneWidget);
    expect(find.byKey(const Key('indentApprove-d1')), findsNothing);
    await tapAndSettle(tester, find.byKey(const Key('indentReject-d2')));
    // A rejection needs its reason.
    await tapAndSettle(tester, find.byKey(const Key('indentRejectGo')));
    expect(api.calls.where((c) => c.startsWith('decideIndent d2')), isEmpty);
    await tapAndSettle(tester, find.byKey(const Key('indentReject-d2')));
    await tester.enterText(find.byKey(const Key('indentRejectReason')), 'Registers were issued last week');
    await tapAndSettle(tester, find.byKey(const Key('indentRejectGo')));
    expect(api.calls, contains('decideIndent d2 reject Registers were issued last week'));
    expect(find.text('Registers were issued last week'), findsOneWidget);
  });

  testWidgets('reads in Kannada', (tester) async {
    phone(tester);
    await tester.pumpWidget(localizedApp(home: IndentsScreen(api: api, userId: 'me'), language: 'kn'));
    await tester.pumpAndSettle();
    expect(find.text(strings('kn').indentApprove), findsNWidgets(2));
    expect(find.text(strings('kn').indentRaisedBy('Sudhir Kamath')), findsNWidgets(2));
  });
}
