// New messages over the realtime connection: the list and the open thread update at once.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/core/models.dart';
import 'package:kinetix_teacher/core/realtime.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  late FakeTeacherApi api;
  late FakeRealtime live;

  setUp(() {
    api = FakeTeacherApi();
    live = FakeRealtime();
  });

  Future<void> start(WidgetTester tester) async {
    phone(tester);
    await pumpApp(tester, api, prefs: {'token': 'tok'}, realtime: live);
  }

  /// Sunita writes in thread c2.
  MessageNew sunitaWrites() {
    final m = ChatMessage(id: 'm50', senderId: 'g2', body: 'Can we meet on Friday?', createdAt: DateTime(2026, 10, 4, 12, 30));
    api.chat['c2']!.add(m);
    api.threads = [for (final t in api.threads) t.id == 'c2' ? t.copyWith(lastMessage: m.body, lastMessageAt: m.createdAt, unread: 1) : t];
    return const MessageNew(conversationId: 'c2', messageId: 'm50', senderId: 'g2');
  }

  testWidgets('connects with the signed-in token and disconnects on sign-out', (tester) async {
    await start(tester);
    // The remembered server (the default here) and the signed-in token.
    expect(live.connectedWith, 'http://localhost:4000 tok');
    await openProfile(tester);
    await tester.scrollUntilVisible(find.byKey(const Key('signOut')), 200, scrollable: find.byType(Scrollable).last);
    await tester.ensureVisible(find.byKey(const Key('signOut')));
    await tester.pumpAndSettle();
    await tapAndSettle(tester, find.byKey(const Key('signOut')));
    await tapAndSettle(tester, find.byKey(const Key('confirmSignOut')));
    expect(live.disconnects, greaterThan(0));
  });

  testWidgets('a new message refreshes the inbox and the badge', (tester) async {
    await start(tester);
    await openMore(tester, 'navMessages');
    final loads = api.conversationLoads;
    live.send(sunitaWrites());
    await tester.pumpAndSettle();
    expect(api.conversationLoads, loads + 1);
    expect(find.descendant(of: find.byKey(const Key('conversation-c2')), matching: find.text('Can we meet on Friday?')), findsOneWidget);
    expect(find.byKey(const Key('unread-c2')), findsOneWidget);
    await toRoot(tester);
    expect(find.descendant(of: find.byType(NavigationBar), matching: find.text('3')), findsOneWidget);
  });

  testWidgets('the open thread shows a new message straight away and marks it read', (tester) async {
    await start(tester);
    await openMore(tester, 'navMessages');
    await tapAndSettle(tester, find.byKey(const Key('conversation-c2')));
    api.calls.clear();
    live.send(sunitaWrites());
    await tester.pumpAndSettle();
    expect(find.text('Can we meet on Friday?'), findsOneWidget);
    expect(api.calls, containsAll(['messages c2', 'read c2']));

    // A message for another thread leaves this one alone.
    api.calls.clear();
    live.send(const MessageNew(conversationId: 'c1', messageId: 'm99', senderId: 'g1'));
    await tester.pumpAndSettle();
    expect(api.calls, isNot(contains('messages c2')));
  });

  testWidgets("the teacher's own sent message is not fetched again", (tester) async {
    await start(tester);
    await openMore(tester, 'navMessages');
    await tapAndSettle(tester, find.byKey(const Key('conversation-c1')));
    await tester.enterText(find.byKey(const Key('messageField')), 'See you at 4');
    await tester.pump();
    await tapAndSettle(tester, find.byKey(const Key('sendMessage')));
    final sent = api.chat['c1']!.last;
    api.calls.clear();
    live.send(MessageNew(conversationId: 'c1', messageId: sent.id, senderId: 'u1'));
    await tester.pumpAndSettle();
    expect(api.calls.where((c) => c.startsWith('messages')), isEmpty);
    expect(find.text('See you at 4'), findsOneWidget);
  });

  testWidgets('after a reconnect the inbox catches up', (tester) async {
    await start(tester);
    final loads = api.conversationLoads;
    sunitaWrites();
    live.reconnect();
    await tester.pumpAndSettle();
    expect(api.conversationLoads, loads + 1);
    expect(find.descendant(of: find.byType(NavigationBar), matching: find.text('3')), findsOneWidget);
  });

  testWidgets('without a connection (offline) the app still refreshes on tab changes', (tester) async {
    phone(tester);
    await pumpApp(tester, api, prefs: {'token': 'tok'});
    final loads = api.conversationLoads;
    sunitaWrites();
    await openMore(tester, 'navMessages');
    expect(api.conversationLoads, loads + 1);
    expect(find.text('Can we meet on Friday?'), findsOneWidget);
  });
}
