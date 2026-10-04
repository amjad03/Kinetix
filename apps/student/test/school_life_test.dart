import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/core/models.dart';
import 'package:kinetix_student/features/messages/chat_screen.dart';
import 'package:kinetix_student/features/profile/profile_tab.dart';

import 'helpers.dart';

/// Results, library books and (at colleges) messages to teachers.
void main() {
  Finder today() => find.byType(Scrollable).first;
  Finder profileList() => find.descendant(of: find.byType(ProfileTab), matching: find.byType(Scrollable)).first;

  testWidgets('results on Today: marks against the class average, subjects, and the detail', (tester) async {
    await pumpApp(tester);
    final card = find.byKey(const Key('resultsCard'));
    await scrollTo(tester, card, scrollable: today());
    expect(find.descendant(of: card, matching: find.text('19 / 25')), findsOneWidget);
    expect(find.descendant(of: card, matching: find.text('Above class average')), findsOneWidget);
    expect(find.descendant(of: card, matching: find.text('76%')), findsOneWidget);

    await tester.tap(find.byKey(const Key('assessment-a1')));
    await tester.pumpAndSettle();
    expect(find.text('Unit test 1: Underwriting of shares'), findsOneWidget);
    expect(find.text('out of 25 · 76%'), findsOneWidget);
    expect(find.text('You'), findsOneWidget);
    expect(find.text('Class average'), findsOneWidget);
    expect(find.text('Good. Revise the journal entries for forfeiture.'), findsOneWidget);
  });

  testWidgets('library on Today: overdue first and in red, fines, and history', (tester) async {
    await pumpApp(tester);
    final card = find.byKey(const Key('libraryCard'));
    await scrollTo(tester, find.text('See library history'), scrollable: today());
    expect(find.descendant(of: card, matching: find.text('2 out')), findsOneWidget);
    expect(find.text('1 book overdue. Please return it to the library.'), findsOneWidget);
    // The overdue book is listed before the one due later.
    expect(tester.getTopLeft(find.text('Overdue by 3 days')).dy, lessThan(tester.getTopLeft(find.text('Due Fri 9 Oct')).dy));
    final chip = tester.widget<Text>(find.text('Overdue by 3 days'));
    expect(chip.style?.color, Theme.of(tester.element(card)).colorScheme.onErrorContainer);
    // The fine if the book came back today (from the server's fineSoFarPaise); none on the book not yet due.
    expect(find.descendant(of: card, matching: find.text('₹6 fine so far')), findsOneWidget);
    expect(find.byKey(const Key('fineSoFar-l1')), findsNothing);
    expect(find.text('Fines for late returns: ₹6'), findsOneWidget);

    await tester.ensureVisible(find.text('See library history'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('See library history'));
    await tester.pumpAndSettle();
    expect(find.text('Library books'), findsOneWidget);
    expect(find.text('Returned (1)'), findsOneWidget);
    expect(find.text('Borrowed Sat 5 Sept · returned Wed 23 Sept · fine ₹6'), findsOneWidget);
  });

  testWidgets('Profile lists results and library instead of Soon entries', (tester) async {
    await pumpApp(tester);
    await openTab(tester, 'Profile');
    await scrollTo(tester, find.byKey(const Key('openLibrary')), scrollable: profileList());
    expect(find.text('1 assessment published'), findsOneWidget);
    expect(find.text('2 books out, 1 overdue'), findsOneWidget);
    expect(find.byKey(const Key('openMessages')), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('openResults')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('openResults')));
    await tester.pumpAndSettle();
    expect(find.text('Results'), findsOneWidget);
    expect(find.text('By subject'), findsOneWidget);
  });

  testWidgets('update routing: marks open the result, library the books', (tester) async {
    await pumpApp(
      tester,
      setup: (api) => api.inbox.insertAll(0, [
        api.notice('n8', NotificationKind.marks, {
          'assessmentId': 'a1',
          'sectionId': 'sec1',
        }, title: 'Marks published: Corporate Accounting'),
        api.notice('n9', NotificationKind.library, {
          'loanId': 'l1',
          'studentId': 's1',
        }, title: 'Library book borrowed: Corporate Accounting'),
      ]),
    );
    await openTab(tester, 'Updates');
    expect(find.byIcon(Icons.grading), findsOneWidget);
    expect(find.byIcon(Icons.local_library), findsOneWidget);
    await tester.tap(find.byKey(const Key('notification-n8')));
    await tester.pumpAndSettle();
    expect(find.text('out of 25 · 76%'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('notification-n9')));
    await tester.pumpAndSettle();
    expect(find.text('Books out (2)'), findsOneWidget);
  });

  group('messages', () {
    testWidgets('at a college: write to a teacher from Today', (tester) async {
      final (api, _) = await pumpApp(tester);
      final card = find.byKey(const Key('messagesCard'));
      await scrollTo(tester, card, scrollable: today());
      expect(find.text('Ask your teachers about a class, homework or a doubt.'), findsOneWidget);
      await tester.ensureVisible(find.text('Write to a teacher'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Write to a teacher'));
      await tester.pumpAndSettle();
      expect(find.textContaining('No messages yet.'), findsOneWidget);

      await tester.tap(find.byKey(const Key('newMessage')));
      await tester.pumpAndSettle();
      expect(find.text('Your teachers · BCom Sem 3 A'), findsOneWidget);
      expect(find.text('Corporate Accounting · Cost Accounting'), findsOneWidget);
      await tester.tap(find.byKey(const Key('pickTeacher-t1')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('start s1 t1'));
      expect(find.byType(ChatScreen), findsOneWidget);

      await tester.enterText(find.byKey(const Key('messageField')), 'Ma’am, could you explain the pro-rata allotment again?');
      await tester.pump();
      await tester.tap(find.byKey(const Key('sendMessage')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('send cv1 Ma’am, could you explain the pro-rata allotment again?'));
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('Anita Sharma'), findsOneWidget);
      expect(find.text('Ma’am, could you explain the pro-rata allotment again?'), findsOneWidget);
    });

    testWidgets('a reply shows unread on Today and opens from its update', (tester) async {
      final (api, _) = await pumpApp(
        tester,
        setup: (api) {
          api.chats['cv1'] = [
            ChatMessage(id: 'm1', senderId: 't1', body: 'Pro-rata allotment is next week. Read section 4.3.', createdAt: DateTime.now()),
          ];
          api.inbox.insert(
            0,
            api.notice('n9', NotificationKind.message, {'conversationId': 'cv1', 'studentId': 's1'}, title: 'Message from Anita Sharma'),
          );
        },
      );
      final card = find.byKey(const Key('messagesCard'));
      await scrollTo(tester, card, scrollable: today());
      expect(find.descendant(of: card, matching: find.text('1 unread')), findsOneWidget);

      await openTab(tester, 'Updates');
      await tester.tap(find.byKey(const Key('notification-n9')));
      await tester.pumpAndSettle();
      expect(find.text('Pro-rata allotment is next week. Read section 4.3.'), findsOneWidget);
      expect(api.calls, contains('chat-read cv1'));
    });

    testWidgets('at a school, students do not get Messages', (tester) async {
      await pumpApp(tester, setup: (api) => api.contactGroups = []);
      await tester.drag(today(), const Offset(0, -3000));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('messagesCard')), findsNothing);
      await openTab(tester, 'Profile');
      await scrollTo(tester, find.byKey(const Key('signOut')), scrollable: profileList());
      expect(find.byKey(const Key('openMessages')), findsNothing);
    });
  });

  testWidgets('results, library and messages fit a small phone with large text', (tester) async {
    await pumpApp(tester, size: const Size(360, 640), textScale: 2);
    await tester.drag(today(), const Offset(0, -6000));
    await tester.pumpAndSettle();
    await openTab(tester, 'Profile');
    for (final key in ['openResults', 'openLibrary', 'openMessages']) {
      await scrollTo(tester, find.byKey(Key(key)), scrollable: profileList());
      await tester.ensureVisible(find.byKey(Key(key)));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(Key(key)));
      await tester.pumpAndSettle();
      await tester.drag(find.byType(Scrollable).last, const Offset(0, -3000));
      await tester.pumpAndSettle();
      if (key == 'openResults') {
        await tester.tap(find.byKey(const Key('assessment-a1')), warnIfMissed: false);
        await tester.pumpAndSettle();
        await tester.pageBack();
        await tester.pumpAndSettle();
      }
      if (key == 'openMessages') {
        await tester.tap(find.byKey(const Key('newMessage')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('pickTeacher-t1')));
        await tester.pumpAndSettle();
      }
      await tester.pageBack();
      await tester.pumpAndSettle();
    }
    expect(tester.takeException(), isNull);
  });
}
