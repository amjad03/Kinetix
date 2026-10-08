import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import 'package:kinetix_student/core/models.dart';
import 'package:kinetix_student/features/updates/updates_tab.dart';

import 'helpers.dart';

void main() {
  Future<void> openUpdates(WidgetTester tester) => openTab(tester, 'Updates');

  Finder badgeLabel(String text) => find.descendant(of: find.byType(Badge), matching: find.text(text));

  testWidgets('groups updates into Today and Earlier with an unread badge', (tester) async {
    await pumpApp(tester);
    expect(badgeLabel('2'), findsOneWidget);
    await openUpdates(tester);
    expect(find.descendant(of: find.byType(UpdatesTab), matching: find.text('Today')), findsOneWidget);
    expect(find.text('Earlier'), findsOneWidget);
    expect(find.text('Homework: Corporate Accounting'), findsOneWidget);
    // Raw ISO dates become words.
    expect(find.text('Exercise 4.2: Issue of shares · due Mon 5 Oct'), findsOneWidget);
    expect(find.byIcon(Icons.receipt_long), findsOneWidget);
    expect(find.byIcon(Icons.campaign), findsOneWidget);
    expect(find.byKey(const Key('unreadDot')), findsNWidgets(2));
  });

  testWidgets('homework, fee and college messages open what they are about', (tester) async {
    final (api, _) = await pumpApp(tester);
    await openUpdates(tester);
    await tester.tap(find.byKey(const Key('notification-n1')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('read n1'));
    expect(find.text('Solve questions 1 to 5 from the textbook. Show journal entries for each.'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    // One of the two is read now (the bell on Home counts them).
    expect(find.byKey(const Key('unreadDot')), findsOneWidget);

    // A payment opens its receipt.
    await tester.tap(find.byKey(const Key('notification-n2')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('receipt p1'));
    expect(find.text('RCPT/2026-27/00001'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('notification-n3')));
    await tester.pumpAndSettle();
    expect(find.text('Message from the college'), findsOneWidget);
    expect(find.text('Saturday 10 October, 10:00 in the main hall.'), findsOneWidget);
    expect(api.calls.where((c) => c == 'read n3'), isEmpty);
  });

  testWidgets('a fee due notice opens the fees screen', (tester) async {
    final (api, _) = await pumpApp(
      tester,
      setup: (api) => api.inbox.insert(0, api.notice('nf', NotificationKind.fee, {'batchId': 'b1'}, title: 'Fee due: Exam fee')),
    );
    await openUpdates(tester);
    await tester.tap(find.byKey(const Key('notification-nf')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('fees s1'));
    expect(find.byKey(const Key('feesTotal')), findsOneWidget);
  });

  testWidgets('board, recording and absence updates open the viewer, player and history', (tester) async {
    final (api, _) = await pumpApp(
      tester,
      setup: (api) => api.inbox.insertAll(0, [
        api.notice('nb', NotificationKind.boardShared, {'whiteboardId': 'wb1'}, title: "Today's board"),
        api.notice('nr', NotificationKind.recording, {'recordingId': 'r2'}, title: 'Missed Corporate Accounting? Watch the lesson'),
        api.notice('na', NotificationKind.absence, {'studentId': 's1', 'date': '2026-10-01'}, title: 'Aarav was marked absent'),
        api.notice('ng', NotificationKind.recording, {'recordingId': 'gone'}, title: 'Old lesson'),
      ]),
    );
    await openUpdates(tester);
    await tester.tap(find.byKey(const Key('notification-nb')));
    await tester.pumpAndSettle();
    expect(find.text('Page 1 of 2'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('notification-nr')));
    await tester.pumpAndSettle();
    expect(find.byType(LessonView), findsOneWidget);
    // The summary said Aarav missed it.
    expect(find.text('Missed this class. Watch the lesson to catch up.'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('notification-na')));
    await tester.pumpAndSettle();
    expect(find.text('Your attendance'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('notification-ng')));
    await tester.pumpAndSettle();
    expect(find.text('This recording is no longer shared with your class.'), findsOneWidget);
    expect(api.calls, containsAll(['read nb', 'read nr', 'read na', 'read ng']));
  });

  testWidgets('mark all as read clears the dots and the badge', (tester) async {
    final (api, _) = await pumpApp(tester);
    await openUpdates(tester);
    await tester.tap(find.byKey(const Key('markAllRead')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('read-all'));
    expect(find.byKey(const Key('unreadDot')), findsNothing);
    expect(find.byKey(const Key('markAllRead')), findsNothing);
    expect(badgeLabel('2'), findsNothing);
  });

  testWidgets('an empty inbox says you are all caught up', (tester) async {
    await pumpApp(tester, setup: (api) => api.inbox = []);
    await openUpdates(tester);
    expect(find.textContaining("You're all caught up."), findsOneWidget);
  });
}
