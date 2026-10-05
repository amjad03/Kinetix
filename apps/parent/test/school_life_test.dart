import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_parent/core/models.dart';
import 'package:kinetix_parent/features/messages/chat_screen.dart';

import 'helpers.dart';

/// Library books, results and messages with teachers.
void main() {
  Finder home() => find.byType(Scrollable).first;

  group('library', () {
    testWidgets('the card shows books out with due dates and fines; history on its screen', (tester) async {
      await pumpApp(tester);
      final card = find.byKey(const Key('libraryCard'));
      await tester.scrollUntilVisible(find.text('See library history'), 300, scrollable: home());
      await tester.ensureVisible(find.text('See library history'));
      await tester.pumpAndSettle();
      expect(find.descendant(of: card, matching: find.text('Corporate Accounting')), findsOneWidget);
      expect(find.descendant(of: card, matching: find.text('Due Fri 9 Oct')), findsOneWidget);
      expect(find.descendant(of: card, matching: find.text('1 out')), findsOneWidget);
      expect(find.text('Fines for late returns: ₹6'), findsOneWidget);
      expect(find.byKey(const Key('libraryOverdue')), findsNothing);

      await tester.tap(find.descendant(of: card, matching: find.text('See library history')));
      await tester.pumpAndSettle();
      expect(find.text("Aarav's library"), findsOneWidget);
      expect(find.text('Books out (1)'), findsOneWidget);
      expect(find.text('Returned (1)'), findsOneWidget);
      expect(find.text('Wings of Fire'), findsOneWidget);
      expect(find.text('Borrowed Sat 5 Sept · returned Wed 23 Sept · fine ₹6'), findsOneWidget);
    });

    testWidgets('an overdue book is flagged in red', (tester) async {
      await pumpApp(tester, prefs: {'selected_child': 'c2'});
      final card = find.byKey(const Key('libraryCard'));
      await tester.scrollUntilVisible(card, 300, scrollable: home());
      expect(find.text('1 book overdue. Please return it to the library.'), findsOneWidget);
      final chip = tester.widget<Text>(find.text('Overdue by 4 days'));
      final context = tester.element(find.text('Overdue by 4 days'));
      expect(chip.style?.color, Theme.of(context).colorScheme.onErrorContainer);
      // The fine if the book came back today (from the server's fineSoFarPaise).
      expect(tester.widget<Text>(find.byKey(const Key('fineSoFar-l3'))).data, '₹8 fine so far');
    });

    testWidgets('a "book borrowed" update opens that child\'s library', (tester) async {
      await pumpApp(
        tester,
        setup: (api) => api.inbox.insert(
          0,
          AppNotification(
            id: 'n9',
            kind: NotificationKind.library,
            title: 'Library book borrowed: Discrete Mathematics',
            body: 'Diya borrowed "Discrete Mathematics". Please return it by Wed 30 Sept.',
            data: {'loanId': 'l3', 'studentId': 'c2'},
            createdAt: DateTime.now(),
          ),
        ),
      );
      await tester.tap(find.text('Updates'));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.local_library), findsOneWidget);
      await tester.tap(find.byKey(const Key('notification-n9')));
      await tester.pumpAndSettle();
      expect(find.text("Diya's library"), findsOneWidget);
      // Due Wed 30 Sept: the count depends on today's date.
      final late = DateUtils.dateOnly(DateTime.now()).difference(DateTime(2026, 9, 30)).inDays;
      expect(find.text('Overdue by $late days'), findsOneWidget);
    });
  });

  group('results', () {
    testWidgets('the card compares the latest marks with the class and lists subject percentages', (tester) async {
      await pumpApp(tester);
      final card = find.byKey(const Key('resultsCard'));
      await tester.scrollUntilVisible(card, 300, scrollable: home());
      expect(find.descendant(of: card, matching: find.text('22.5 / 25')), findsOneWidget);
      expect(find.descendant(of: card, matching: find.text('Above class average')), findsOneWidget);
      expect(find.descendant(of: card, matching: find.text('Below class average')), findsOneWidget);
      expect(find.descendant(of: card, matching: find.text('Test · Mon 28 Sept · Class average 18.7')), findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('subject-Corporate Accounting')), matching: find.text('90%')), findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('subject-Cost Accounting')), matching: find.text('50%')), findsOneWidget);

      await tester.tap(find.byKey(const Key('assessment-a1')));
      await tester.pumpAndSettle();
      expect(find.text('Unit test 1: Underwriting of shares'), findsOneWidget);
      expect(find.text('22.5'), findsWidgets);
      expect(find.text('out of 25 · 90%'), findsOneWidget);
      expect(find.text('Class average'), findsOneWidget);
      expect(find.text('18.7'), findsOneWidget);
      expect(find.text('Highest in class'), findsOneWidget);
      expect(find.text('Neat journal entries.'), findsOneWidget);
    });

    testWidgets('all results, and a child with none yet', (tester) async {
      await pumpApp(tester);
      final card = find.byKey(const Key('resultsCard'));
      await tester.scrollUntilVisible(find.text('See all results'), 300, scrollable: home());
      await tester.ensureVisible(find.text('See all results'));
      await tester.pumpAndSettle();
      await tester.tap(find.descendant(of: card, matching: find.text('See all results')));
      await tester.pumpAndSettle();
      expect(find.text("Aarav's results"), findsOneWidget);
      expect(find.text('Cost sheet assignment'), findsOneWidget);
      expect(find.text('5 / 10'), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();

      await tester.drag(home(), const Offset(0, 3000));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('child-c2')));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(card, 300, scrollable: home());
      expect(find.textContaining('No marks published yet.'), findsOneWidget);
    });

    testWidgets('an absent result says so', (tester) async {
      await pumpApp(
        tester,
        setup: (api) => api.childMarks['c1'] = ChildMarks.fromJson({
          'assessments': [
            {
              'id': 'a3',
              'title': 'Unit test 2',
              'kind': 'test',
              'maxMarks': 25,
              'heldOn': '2026-10-02',
              'subject': 'Corporate Accounting',
              'marks': null,
              'absent': true,
              'classAverage': 17,
              'classHighest': 23,
            },
          ],
          'subjects': [],
        }),
      );
      final card = find.byKey(const Key('resultsCard'));
      await tester.scrollUntilVisible(card, 300, scrollable: home());
      expect(find.descendant(of: card, matching: find.text('Absent')), findsNWidgets(2));
      await tester.tap(find.byKey(const Key('assessment-a3')));
      await tester.pumpAndSettle();
      expect(find.text('Aarav was marked absent for this test.'), findsOneWidget);
    });

    testWidgets('a "marks published" update opens that result', (tester) async {
      await pumpApp(
        tester,
        setup: (api) => api.inbox.insert(
          0,
          AppNotification(
            id: 'n9',
            kind: NotificationKind.marks,
            title: 'Marks published: Corporate Accounting',
            body: 'Unit test 1: Underwriting of shares. Open the app to see the marks and the class average.',
            data: {'assessmentId': 'a1', 'sectionId': 'sec1'},
            createdAt: DateTime.now(),
          ),
        ),
      );
      await tester.tap(find.text('Updates'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('notification-n9')));
      await tester.pumpAndSettle();
      expect(find.text('out of 25 · 90%'), findsOneWidget);
      expect(find.text('Neat journal entries.'), findsOneWidget);
    });
  });

  group('messages', () {
    Future<void> openMessages(WidgetTester tester) async {
      await tester.tap(find.text('Messages'));
      await tester.pumpAndSettle();
    }

    Finder messagesBadge(String n) => find.descendant(of: find.byKey(const Key('messagesBadge')), matching: find.text(n));

    testWidgets('lists threads with unread counts; opening one marks it read', (tester) async {
      final (api, _) = await pumpApp(tester);
      expect(messagesBadge('1'), findsOneWidget);
      await openMessages(tester);
      expect(find.text('Anita Sharma'), findsOneWidget);
      expect(find.text('About Aarav · BCom Sem 3 A'), findsOneWidget);
      expect(find.text('Hope he is better now. Please ask him to try Exercise 4.2.'), findsOneWidget);
      expect(find.byKey(const Key('threadUnread-cv1')), findsOneWidget);

      await tester.tap(find.byKey(const Key('thread-cv1')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('chat-read cv1'));
      expect(find.byKey(const Key('message-m1')), findsOneWidget);
      expect(find.byKey(const Key('message-m2')), findsOneWidget);
      expect(find.text('Yesterday'), findsOneWidget);
      // The parent's own message is on the right, the teacher's on the left.
      expect(tester.getCenter(find.byKey(const Key('message-m1'))).dx, greaterThan(206));
      expect(tester.getCenter(find.byKey(const Key('message-m2'))).dx, lessThan(206));

      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('threadUnread-cv1')), findsNothing);
      expect(find.byKey(const Key('messagesBadge')), findsNothing);
    });

    testWidgets('sends a message', (tester) async {
      final (api, _) = await pumpApp(tester);
      await openMessages(tester);
      await tester.tap(find.byKey(const Key('thread-cv1')));
      await tester.pumpAndSettle();
      final send = find.byKey(const Key('sendMessage'));
      expect(tester.widget<IconButton>(send).onPressed, isNull);
      await tester.enterText(find.byKey(const Key('messageField')), '  Thank you, he will do it today.  ');
      await tester.pump();
      await tester.tap(send);
      await tester.pumpAndSettle();
      expect(api.calls, contains('send cv1 Thank you, he will do it today.'));
      expect(find.text('Thank you, he will do it today.'), findsOneWidget);
      expect(tester.widget<TextField>(find.byKey(const Key('messageField'))).controller!.text, isEmpty);
    });

    testWidgets('new message: pick a child, then a teacher with their subjects', (tester) async {
      final (api, _) = await pumpApp(tester);
      await openMessages(tester);
      await tester.tap(find.byKey(const Key('newMessage')));
      await tester.pumpAndSettle();
      expect(find.text("Aarav's teachers · BCom Sem 3 A"), findsOneWidget);
      expect(find.text('Corporate Accounting · Cost Accounting'), findsOneWidget);

      await tester.tap(find.byKey(const Key('pickChild-c2')));
      await tester.pumpAndSettle();
      expect(find.text("Diya's teachers · BCA Sem 1 A"), findsOneWidget);
      await tester.tap(find.byKey(const Key('pickTeacher-t2')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('start c2 t2'));
      expect(find.text('Ravi Kumar'), findsOneWidget);
      expect(find.text('About Diya · BCA Sem 1 A'), findsOneWidget);
      expect(find.textContaining('Write to Ravi Kumar about Diya.'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('messageField')), 'Hello sir');
      await tester.pump();
      await tester.tap(find.byKey(const Key('sendMessage')));
      await tester.pumpAndSettle();
      await tester.pageBack();
      await tester.pumpAndSettle();
      // Back on the list (the picker was replaced by the chat), with the new thread.
      expect(find.text('Ravi Kumar'), findsOneWidget);
      expect(find.text('Hello sir'), findsOneWidget);
    });

    testWidgets('pulling down loads earlier messages', (tester) async {
      final (api, _) = await pumpApp(
        tester,
        setup: (api) {
          final start = DateTime.now().subtract(const Duration(hours: 30));
          api.chats['cv1'] = [
            for (var i = 0; i < 70; i++)
              ChatMessage(
                id: 'x$i',
                senderId: i.isEven ? 'u1' : 't1',
                body: 'Message number $i',
                createdAt: start.add(Duration(minutes: i)),
              ),
          ];
        },
      );
      await openMessages(tester);
      await tester.tap(find.byKey(const Key('thread-cv1')));
      await tester.pumpAndSettle();
      // Opens at the newest message.
      expect(find.text('Message number 69'), findsOneWidget);
      expect(find.byKey(const Key('message-x5')), findsNothing);
      expect(find.text('Pull down for earlier messages'), findsNothing);

      final list = find.byKey(const Key('chatList'));
      expect(api.calls, isNot(contains('messages cv1 before')));
      // Scrolling past the top pulls down the earlier page.
      await tester.drag(list, const Offset(0, 4000));
      await tester.pumpAndSettle();
      if (!api.calls.contains('messages cv1 before')) {
        await tester.fling(list, const Offset(0, 400), 1000);
        await tester.pumpAndSettle();
      }
      expect(api.calls, contains('messages cv1 before'));
      expect(find.text('Pull down for earlier messages'), findsNothing);
      await tester.scrollUntilVisible(find.byKey(const Key('message-x0')), -300, scrollable: find.byType(Scrollable).last);
      expect(find.text('Message number 0'), findsOneWidget);
    });

    testWidgets('a message update opens the conversation', (tester) async {
      await pumpApp(
        tester,
        setup: (api) => api.inbox.insert(
          0,
          AppNotification(
            id: 'n9',
            kind: NotificationKind.message,
            title: 'Message from Anita Sharma',
            body: 'Hope he is better now.',
            data: {'conversationId': 'cv1', 'studentId': 'c1'},
            createdAt: DateTime.now(),
          ),
        ),
      );
      await tester.tap(find.text('Updates'));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.forum), findsOneWidget);
      await tester.tap(find.byKey(const Key('notification-n9')));
      await tester.pumpAndSettle();
      expect(find.byType(ChatScreen), findsOneWidget);
      expect(find.text('Hope he is better now. Please ask him to try Exercise 4.2.'), findsOneWidget);
    });
  });
}
