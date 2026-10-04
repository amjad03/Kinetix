import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/core/models.dart';
import 'package:kinetix_teacher/core/push.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  late FakeTeacherApi api;
  late FakePush push;

  setUp(() {
    api = FakeTeacherApi();
    seed(api);
    api.notificationItems = [
      const AppNotification(id: 'n1', kind: 'message', data: {'conversationId': 'c1', 'studentId': 's1'}),
    ];
    push = FakePush();
  });

  const messageTap = PushTap(kind: 'message', notificationId: 'n1', data: {'notificationId': 'n1', 'kind': 'message'});

  testWidgets('registers the push token after sign-in and again when it changes; unregisters on sign-out', (tester) async {
    phone(tester);
    final state = await pumpApp(tester, api, prefs: {}, push: push);
    expect(api.pushDevices, isEmpty);

    await state.signIn(server: 'http://test', tenant: 'demo-college', login: 'anita@demo.kinetix.in', password: 'kinetix123');
    await tester.pumpAndSettle();
    expect(push.permissionRequests, 1);
    expect(api.calls, contains('push register fcm-1 android'));

    push.refresh('fcm-2');
    await tester.pumpAndSettle();
    expect(api.calls.last, 'push register fcm-2 android');

    await state.signOut();
    await tester.pumpAndSettle();
    expect(api.calls.last, 'push unregister fcm-2');
    expect(push.tokenDeletes, 1);

    // Signed out, a new token is not registered for anyone.
    push.refresh('fcm-3');
    await tester.pumpAndSettle();
    expect(api.calls.last, 'push unregister fcm-2');
  });

  testWidgets('registers on a restored sign-in; an expired session does not try to unregister', (tester) async {
    phone(tester);
    final state = await pumpApp(tester, api, prefs: {'token': 'tok'}, push: push);
    await tester.pumpAndSettle();
    expect(api.calls, contains('push register fcm-1 android'));

    await state.signOut(expired: true);
    await tester.pumpAndSettle();
    expect(api.calls.where((c) => c.startsWith('push unregister')), isEmpty);
    expect(push.tokenDeletes, 1);
  });

  testWidgets('tapping a message notification opens the conversation', (tester) async {
    phone(tester);
    await pumpApp(tester, api, prefs: {'token': 'tok'}, push: push);
    push.tap(messageTap);
    await tester.pumpAndSettle();
    expect(find.text('Messages about Aarav Patel with Rajesh Patel'), findsOneWidget);
    expect(api.calls, containsAll(['read notification n1', 'messages c1']));

    // Back lands on the Messages tab.
    await pop(tester);
    expect(tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex, 3);
  });

  testWidgets('a push that launched the app opens once the teacher is signed in', (tester) async {
    phone(tester);
    push.launchedBy = messageTap;
    await pumpApp(tester, api, prefs: {'token': 'tok'}, push: push);
    await tester.pumpAndSettle();
    expect(find.text('Messages about Aarav Patel with Rajesh Patel'), findsOneWidget);
  });

  testWidgets('other kinds open their tab, closing what was open', (tester) async {
    phone(tester);
    await pumpApp(tester, api, prefs: {'token': 'tok'}, push: push);
    await tapAndSettle(tester, find.byKey(const Key('profileButton')));
    push.tap(const PushTap(kind: 'homework', notificationId: 'n2'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('profileButton')), findsWidgets);
    expect(tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex, 1);

    // An unknown conversation (deleted, or another account's): the Messages tab.
    api.notificationItems = [];
    push.tap(const PushTap(kind: 'message', notificationId: 'gone'));
    await tester.pumpAndSettle();
    expect(tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex, 3);
  });
}
