import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/app.dart';
import 'package:kinetix_teacher/core/app_state.dart';
import 'package:kinetix_teacher/core/models.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_api.dart';

void main() {
  late FakeTeacherApi api;

  setUp(() => api = FakeTeacherApi());

  Future<void> pumpApp(WidgetTester tester) async {
    tester.view.physicalSize = const Size(412, 892);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({'token': 'tok'});
    final state = AppState(api, await SharedPreferences.getInstance());
    await tester.pumpWidget(TeacherApp(state: state));
    await state.restore();
    await tester.pumpAndSettle();
  }

  Finder navBadge() => find.descendant(of: find.byType(NavigationBar), matching: find.text('2'));

  Future<void> openInbox(WidgetTester tester) async {
    await tester.tap(find.text('Messages'));
    await tester.pumpAndSettle();
  }

  testWidgets('the inbox shows threads with unread badges, also on the tab', (tester) async {
    await pumpApp(tester);
    // The badge is there before the tab is opened.
    expect(navBadge(), findsOneWidget);

    await openInbox(tester);
    final c1 = find.byKey(const Key('conversation-c1'));
    expect(find.descendant(of: c1, matching: find.text('Rajesh Patel')), findsOneWidget);
    expect(find.descendant(of: c1, matching: find.text('Parent of Aarav Patel · BCom Sem 3 A')), findsOneWidget);
    expect(find.descendant(of: c1, matching: find.text('Thank you, he will finish it tonight.')), findsOneWidget);
    expect(find.byKey(const Key('unread-c1')), findsOneWidget);
    expect(find.byKey(const Key('unread-c2')), findsNothing);
    expect(find.text('Sunita Gowda'), findsOneWidget);
  });

  testWidgets('opening a thread marks it read; sending adds the message', (tester) async {
    await pumpApp(tester);
    await openInbox(tester);
    await tester.tap(find.byKey(const Key('conversation-c1')));
    await tester.pumpAndSettle();

    expect(api.calls, containsAll(['messages c1', 'read c1']));
    expect(find.text('Aarav had fever on Tuesday. What was covered?'), findsOneWidget);
    expect(find.text('Hope he is better. Please try Exercise 4.2.'), findsOneWidget);
    expect(find.text('Messages about Aarav Patel with Rajesh Patel'), findsOneWidget);

    // Send is off until there is text.
    expect(tester.widget<IconButton>(find.byKey(const Key('sendMessage'))).onPressed, isNull);
    await tester.enterText(find.byKey(const Key('messageField')), '  Good to hear. See you on Monday.  ');
    await tester.pump();
    await tester.tap(find.byKey(const Key('sendMessage')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('send c1 Good to hear. See you on Monday.'));
    expect(find.text('Good to hear. See you on Monday.'), findsOneWidget);
    expect(find.text('12:00 PM'), findsOneWidget);

    // Back in the inbox: read, with the new preview; the tab badge is gone.
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('unread-c1')), findsNothing);
    expect(navBadge(), findsNothing);
    expect(find.descendant(of: find.byKey(const Key('conversation-c1')), matching: find.text('Good to hear. See you on Monday.')), findsOneWidget);
  });

  testWidgets('a message that fails to send can be retried', (tester) async {
    await pumpApp(tester);
    await openInbox(tester);
    await tester.tap(find.byKey(const Key('conversation-c2')));
    await tester.pumpAndSettle();

    api.sendFails = true;
    await tester.enterText(find.byKey(const Key('messageField')), 'Thanks');
    await tester.pump();
    await tester.tap(find.byKey(const Key('sendMessage')));
    await tester.pumpAndSettle();
    expect(find.text('Not sent · tap to retry'), findsOneWidget);

    api.sendFails = false;
    await tester.tap(find.text('Thanks'));
    await tester.pumpAndSettle();
    expect(find.text('Not sent · tap to retry'), findsNothing);
    expect(api.chat['c2']!.last.body, 'Thanks');
  });

  testWidgets('pulling down loads earlier messages', (tester) async {
    api.chat['c1'] = [
      for (var i = 0; i < 60; i++)
        ChatMessage(id: 'old$i', senderId: i.isEven ? 'g1' : 'u1', body: 'Message $i', createdAt: DateTime(2026, 9, 1, 8).add(Duration(hours: i))),
    ];
    await pumpApp(tester);
    await openInbox(tester);
    await tester.tap(find.byKey(const Key('conversation-c1')));
    await tester.pumpAndSettle();
    expect(find.text('Message 59'), findsOneWidget);
    expect(find.text('Message 5'), findsNothing);

    // Scroll to the top of what is loaded, then pull.
    final list = find.byKey(const Key('chatMessages'));
    for (var i = 0; i < 20 && find.text('Pull down for earlier messages').evaluate().isEmpty; i++) {
      await tester.drag(list, const Offset(0, 600));
      await tester.pumpAndSettle();
    }
    expect(find.text('Pull down for earlier messages'), findsOneWidget);
    await tester.fling(list, const Offset(0, 400), 1000);
    await tester.pumpAndSettle();
    expect(api.calls, contains('messages c1 before'));
    // Earlier messages are added above without moving the view; the thread now starts at Message 0.
    for (var i = 0; i < 10 && find.text('Message 0').evaluate().isEmpty; i++) {
      await tester.drag(list, const Offset(0, 300));
      await tester.pumpAndSettle();
    }
    expect(find.text('Message 0'), findsOneWidget);
    expect(find.text('Messages about Aarav Patel with Rajesh Patel'), findsOneWidget);
    expect(find.text('Pull down for earlier messages'), findsNothing);
  });

  testWidgets('New message: class, search a student, choose the guardian, then chat', (tester) async {
    await pumpApp(tester);
    await openInbox(tester);
    await tester.tap(find.byKey(const Key('newMessageFab')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('contacts'));
    expect(find.text('Aarav Patel'), findsOneWidget);

    // A student with no guardian on record says so and cannot be picked.
    await tester.enterText(find.byKey(const Key('studentSearch')), 'bhav');
    await tester.pump();
    expect(find.text('Aarav Patel'), findsNothing);
    expect(find.text('U03BC003 · No parent or guardian on record'), findsOneWidget);
    await tester.tap(find.byKey(const Key('contact-s3')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Write to'), findsNothing);

    // Search by roll number.
    await tester.enterText(find.byKey(const Key('studentSearch')), 'u03bc002');
    await tester.pump();
    expect(find.text('Ananya Gowda'), findsOneWidget);
    await tester.tap(find.byKey(const Key('contact-s2')));
    await tester.pumpAndSettle();
    expect(find.text('Write to Ananya Gowda’s family'), findsOneWidget);
    expect(find.text('Sunita Gowda'), findsOneWidget);
    await tester.tap(find.byKey(const Key('guardian-g3')));
    await tester.pumpAndSettle();

    expect(api.calls, contains('start s2 g3'));
    expect(find.text('Mahesh Gowda'), findsOneWidget);
    expect(find.text('Parent of Ananya Gowda · BCom Sem 3 A'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('messageField')), 'Ananya did very well in the unit test.');
    await tester.pump();
    await tester.tap(find.byKey(const Key('sendMessage')));
    await tester.pumpAndSettle();
    expect(api.chat['c3']!.single.body, 'Ananya did very well in the unit test.');

    // Back in the inbox the new thread is at the top.
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.descendant(of: find.byKey(const Key('conversation-c3')), matching: find.text('Mahesh Gowda')), findsOneWidget);
    expect(tester.getTopLeft(find.byKey(const Key('conversation-c3'))).dy, lessThan(tester.getTopLeft(find.byKey(const Key('conversation-c1'))).dy));
  });

  testWidgets('writing to a family with a thread already open goes to that thread', (tester) async {
    await pumpApp(tester);
    await openInbox(tester);
    await tester.tap(find.byKey(const Key('newMessageFab')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('contact-s1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('guardian-g1')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('start s1 g1'));
    expect(find.text('Thank you, he will finish it tonight.'), findsOneWidget);
  });
}
