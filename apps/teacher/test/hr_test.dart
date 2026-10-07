// Leave, check-in and payslips (Profile → Work), and the helpers behind them.
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/core/hr_models.dart';
import 'package:kinetix_teacher/features/hr/check_in_screen.dart';
import 'package:kinetix_teacher/features/hr/leave_screen.dart';
import 'package:kinetix_teacher/features/hr/payslips_screen.dart';

import 'fake_api.dart';
import 'helpers.dart';

LeaveRequestInfo request(String id, {LeaveStatus status = LeaveStatus.pending, String who = 'Ravi'}) => LeaveRequestInfo(
  id: id,
  userId: 'u-$who',
  userName: who,
  type: const LeaveTypeInfo(id: 'lt-cl', code: 'CL', name: 'Casual leave', paid: true),
  fromDate: DateTime.utc(2026, 10, 12),
  toDate: DateTime.utc(2026, 10, 13),
  halfDay: false,
  days: 2,
  reason: 'Family',
  status: status,
);

void main() {
  late FakeTeacherApi api;
  setUp(() {
    api = FakeTeacherApi();
    seed(api);
  });

  test('previews working days: Sundays and holidays are not counted, a half day is 0.5', () {
    // Thu 1 Oct – Mon 5 Oct 2026: the 2nd is a holiday and the 4th a Sunday.
    expect(leaveDays(DateTime.utc(2026, 10, 1), DateTime.utc(2026, 10, 5), holidays: {'2026-10-02'}), 3);
    expect(leaveDays(DateTime.utc(2026, 10, 4), DateTime.utc(2026, 10, 4)), 0);
    expect(leaveDays(DateTime.utc(2026, 10, 5), DateTime.utc(2026, 10, 5), halfDay: true), 0.5);
    expect(daysText(0.5), '0.5');
    expect(daysText(3), '3');
    expect(dayString(parseDay('2026-02-09')), '2026-02-09');
  });

  test('parses the API shapes', () {
    final r = LeaveRequestInfo.fromJson({
      'id': 'r1', 'user': {'id': 'u', 'fullName': 'Asha'}, 'leaveType': {'id': 't', 'code': 'CL', 'name': 'Casual', 'paid': true},
      'fromDate': '2026-10-12', 'toDate': '2026-10-13', 'halfDay': false, 'days': 2, 'reason': '', 'status': 'approved', 'decisionNote': 'Ok',
    });
    expect((r.status, r.days, r.decisionNote), (LeaveStatus.approved, 2.0, 'Ok'));
    final a = MyAttendance.fromJson({'today': null, 'month': '2026-10', 'days': [{'date': '2026-10-05', 'status': 'half_day', 'checkInAt': '2026-10-05T03:30:00.000Z', 'checkOutAt': null}]});
    expect(a.today, isNull);
    expect(a.days.single.checkInAt, isNotNull);
    final p = PayslipInfo.fromJson({
      'id': 'p', 'month': '2026-10', 'lopDays': 3.5, 'paidDays': 27.5, 'grossPaise': 2483900, 'deductionsPaise': 180000, 'netPaise': 2303900,
      'earnings': [{'code': 'BASIC', 'name': 'Basic pay', 'amountPaise': 1774200}], 'deductions': [{'code': 'PF', 'name': 'Provident Fund', 'amountPaise': 180000}],
    });
    expect((p.netPaise, p.earnings.single.name, p.paidDays), (2303900, 'Basic pay', 27.5));
  });

  test('formats rupees with Indian grouping', () {
    expect(rupeesText(17362500), '₹1,73,625');
    expect(rupeesText(125050), '₹1,250.50');
    expect(rupeesText(99900), '₹999');
    expect(payslipMonth('2026-10'), 'October 2026');
  });

  testWidgets('applies for leave, then cancels the pending request', (tester) async {
    phone(tester);
    await tester.pumpWidget(localizedApp(home: LeaveScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('balance-CL')), findsOneWidget);
    expect(find.text('4 left'), findsOneWidget);
    expect(find.byKey(const Key('noLeave')), findsOneWidget);

    await tapAndSettle(tester, find.byKey(const Key('applyLeave')));
    await tester.enterText(find.byKey(const Key('leaveReason')), 'Family function');
    await tapAndSettle(tester, find.byKey(const Key('submitLeave')));
    expect(api.calls.single, startsWith('applyLeave lt-cl '));
    expect(api.calls.single, endsWith(' full Family function'));
    expect(find.textContaining('Pending'), findsOneWidget);

    await tapAndSettle(tester, find.byKey(const Key('cancel-lr1')));
    expect(api.calls.last, 'cancelLeave lr1');
    expect(find.textContaining('Cancelled'), findsOneWidget);
  });

  testWidgets('an approver sees pending requests and decides with a note; others do not', (tester) async {
    phone(tester);
    api.pendingLeaves = [request('p1'), request('p2', who: 'Meena')];
    await tester.pumpWidget(localizedApp(home: LeaveScreen(api: api, canApprove: true)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('pending-p1')), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('approve-p1')));
    await tester.enterText(find.byKey(const Key('decisionNote')), 'Enjoy');
    await tapAndSettle(tester, find.byKey(const Key('confirmDecision')));
    await tapAndSettle(tester, find.byKey(const Key('reject-p2')));
    await tapAndSettle(tester, find.byKey(const Key('confirmDecision')));
    expect(api.calls, ['decideLeave p1 approve Enjoy', 'decideLeave p2 reject -']);
    expect(find.byKey(const Key('noApprovals')), findsOneWidget);

    await tester.pumpWidget(localizedApp(home: LeaveScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('noApprovals')), findsNothing);
  });

  testWidgets('checks in and out, and lists the month', (tester) async {
    phone(tester);
    await tester.pumpWidget(localizedApp(home: CheckInScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('You have not checked in today.'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('checkIn')));
    expect(find.textContaining('Checked in at 9:05'), findsOneWidget);
    expect(find.byKey(const Key('day-2026-10-20')), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('checkOut')));
    expect(find.textContaining('Checked out at 5:30'), findsOneWidget);
    expect(find.byKey(const Key('checkOut')), findsNothing);
    expect(api.calls, ['checkIn', 'checkOut']);
  });

  testWidgets('lists payslips, shows the breakdown and opens the PDF', (tester) async {
    phone(tester);
    api.payslipList = [
      const PayslipInfo(
        id: 'p1', month: '2026-10', lopDays: 3.5, paidDays: 27.5, grossPaise: 2483900, deductionsPaise: 180000, netPaise: 2303900,
        earnings: [PayslipLineInfo(name: 'Basic pay', amountPaise: 1774200), PayslipLineInfo(name: 'HRA', amountPaise: 709700)],
        deductions: [PayslipLineInfo(name: 'Provident Fund', amountPaise: 180000)],
      ),
    ];
    Uint8List? opened;
    String? mime;
    await tester.pumpWidget(localizedApp(home: PayslipsScreen(api: api, openFile: (b, n, m) async {
      opened = b;
      mime = m;
      return true;
    })));
    await tester.pumpAndSettle();
    expect(find.text('October 2026'), findsOneWidget);
    expect(find.textContaining('₹23,039'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('payslip-2026-10')));
    expect(find.text('Basic pay'), findsOneWidget);
    expect(find.text('Provident Fund'), findsOneWidget);
    expect(find.text('Paid days 27.5, loss of pay 3.5'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('openPdf')));
    expect(api.calls, ['payslipPdf p1']);
    expect(mime, 'application/pdf');
    expect(String.fromCharCodes(opened!), startsWith('%PDF'));
  });

  testWidgets('shows an empty state with no payslips, and works in Hindi', (tester) async {
    phone(tester);
    await tester.pumpWidget(localizedApp(home: PayslipsScreen(api: api), language: 'hi'));
    await tester.pumpAndSettle();
    expect(find.text(strings('hi').payslipsEmpty), findsOneWidget);
    expect(strings('kn').leaveTitle, isNot(strings('en').leaveTitle));
    expect(find.byType(CheckInScreen), findsNothing);
  });
}
