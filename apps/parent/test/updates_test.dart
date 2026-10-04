import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers.dart';

void main() {
  Future<void> openUpdates(WidgetTester tester) async {
    await tester.tap(find.text('Updates'));
    await tester.pumpAndSettle();
  }

  Finder badgeLabel(String text) => find.descendant(of: find.byType(Badge), matching: find.text(text));

  testWidgets('groups updates into Today and Earlier with an unread badge', (tester) async {
    await pumpApp(tester);
    expect(badgeLabel('2'), findsOneWidget);
    await openUpdates(tester);
    expect(find.text('Today'), findsOneWidget);
    expect(find.text('Earlier'), findsOneWidget);
    expect(find.text('Homework: Corporate Accounting'), findsOneWidget);
    // Raw ISO dates become words.
    expect(find.text('Exercise 4.2: Issue of shares · due Mon 5 Oct'), findsOneWidget);
    expect(find.byIcon(Icons.person_off), findsOneWidget);
    expect(find.byIcon(Icons.campaign), findsOneWidget);
    expect(find.byKey(const Key('unreadDot')), findsNWidgets(2));
  });

  testWidgets('tapping an update marks it read and opens what it is about', (tester) async {
    final (api, _) = await pumpApp(tester);
    await openUpdates(tester);
    await tester.tap(find.byKey(const Key('notification-n1')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('read n1'));
    // Homework detail with its instructions.
    expect(find.text('Solve questions 1 to 5 from the textbook. Show journal entries for each.'), findsOneWidget);

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('unreadDot')), findsOneWidget);
    expect(badgeLabel('1'), findsOneWidget);

    // An absence opens the attendance history.
    await tester.tap(find.byKey(const Key('notification-n2')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('read n2'));
    expect(find.text("Aarav's attendance"), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    // A message from the college opens in full.
    await tester.tap(find.byKey(const Key('notification-n3')));
    await tester.pumpAndSettle();
    expect(find.text('Message from the college'), findsOneWidget);
    expect(find.text('Saturday 10 October, 10:00 in the main hall.'), findsOneWidget);
    // Already read: no second call.
    expect(api.calls.where((c) => c == 'read n3'), isEmpty);
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
}
