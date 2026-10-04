import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_parent/core/models.dart';
import 'package:kinetix_parent/core/push.dart';
import 'package:kinetix_parent/features/homework/homework_screen.dart';
import 'package:kinetix_parent/features/messages/messages_tab.dart';
import 'package:kinetix_parent/features/updates/message_screen.dart';
import 'package:kinetix_parent/features/updates/updates_tab.dart';

import 'fake_push.dart';
import 'helpers.dart';

/// Push notifications: the device token is registered with `POST /v1/push/devices` after sign-in
/// and when it changes, removed on sign-out; a tapped notification opens what it is about.
void main() {
  group('device registration', () {
    testWidgets('a restored session registers the device token for the Parent App', (tester) async {
      final (api, _) = await pumpApp(tester, messaging: FakePushMessaging());
      expect(api.calls, contains('push register device-token-123456 android'));
    });

    testWidgets('signing in with a code registers; a new token is registered again', (tester) async {
      final push = FakePushMessaging();
      final (api, state) = await pumpApp(tester, signedIn: false, messaging: push);
      expect(api.calls.where((c) => c.startsWith('push')), isEmpty);
      await signInWithCode(tester);
      expect(state.signedIn, isTrue);
      expect(api.calls, contains('push register device-token-123456 android'));

      push.rotate('device-token-rotated');
      await tester.pumpAndSettle();
      expect(api.calls, contains('push register device-token-rotated android'));
      expect(state.push.registeredToken, 'device-token-rotated');
    });

    testWidgets('signing out removes the token while still signed in, and stops listening', (tester) async {
      final push = FakePushMessaging();
      final (api, state) = await pumpApp(tester, messaging: push);
      await state.signOut();
      await tester.pumpAndSettle();
      expect(api.calls, contains('push remove device-token-123456'));
      expect(state.push.registeredToken, isNull);
      expect(api.token, isNull);

      api.calls.clear();
      push.rotate('device-token-after');
      await tester.pumpAndSettle();
      expect(api.calls, isEmpty);
    });

    testWidgets('a failed registration never interrupts the parent', (tester) async {
      final push = FakePushMessaging(deviceToken: null);
      final (api, state) = await pumpApp(tester, messaging: push);
      expect(state.signedIn, isTrue);
      expect(api.calls.where((c) => c.startsWith('push')), isEmpty);
      await state.signOut();
      await tester.pumpAndSettle();
      expect(api.calls.where((c) => c.startsWith('push')), isEmpty);
    });

    testWidgets('a build without Firebase registers nothing and never asks', (tester) async {
      final (api, state) = await pumpApp(tester);
      expect(api.calls.where((c) => c.startsWith('push')), isEmpty);
      expect(await state.shouldAskForNotifications(), isFalse);
      expect(find.byKey(const Key('notificationsPrompt')), findsNothing);
    });
  });

  group('permission', () {
    testWidgets('asked once in the app\'s words; "Turn on" brings up the system prompt', (tester) async {
      final push = FakePushMessaging(status: PushPermission.notDetermined);
      final (_, state) = await pumpApp(tester, messaging: push, prefs: {'language': 'hi'});
      expect(find.byKey(const Key('notificationsPrompt')), findsOneWidget);
      expect(find.text('इस फ़ोन पर सूचनाएँ पाएँ?'), findsOneWidget);
      expect(push.permissionRequests, 0);
      await tester.tap(find.byKey(const Key('notificationsAllow')));
      await tester.pumpAndSettle();
      expect(push.permissionRequests, 1);
      expect(state.prefs.getBool('push_asked'), isTrue);

      // Not again on the next start.
      await tester.pumpWidget(const SizedBox());
      await pumpApp(tester, messaging: push, prefs: {'push_asked': true});
      expect(find.byKey(const Key('notificationsPrompt')), findsNothing);
      expect(push.permissionRequests, 1);
    });

    testWidgets('"Not now" leaves the system prompt alone', (tester) async {
      final push = FakePushMessaging(status: PushPermission.notDetermined);
      final (_, state) = await pumpApp(tester, messaging: push);
      await tester.tap(find.byKey(const Key('notificationsLater')));
      await tester.pumpAndSettle();
      expect(push.permissionRequests, 0);
      expect(state.prefs.getBool('push_asked'), isTrue);
    });

    testWidgets('not asked when the system already has an answer', (tester) async {
      await pumpApp(tester, messaging: FakePushMessaging(status: PushPermission.denied));
      expect(find.byKey(const Key('notificationsPrompt')), findsNothing);
    });
  });

  group('tapped notifications', () {
    testWidgets('a homework push that started the app opens that homework and marks it read', (tester) async {
      final push = FakePushMessaging(launchTap: const PushTap(notificationId: 'n1', kind: 'homework'));
      final (api, _) = await pumpApp(tester, messaging: push);
      expect(find.byType(HomeworkScreen), findsOneWidget);
      expect(api.calls, contains('read n1'));
    });

    testWidgets('a tap while the app is open opens the update', (tester) async {
      final push = FakePushMessaging();
      await pumpApp(tester, messaging: push);
      push.tap({'notificationId': 'n3', 'kind': 'broadcast'});
      await tester.pumpAndSettle();
      expect(find.byType(MessageScreen), findsOneWidget);
      expect(find.text('Saturday 10 October, 10:00 in the main hall.'), findsWidgets);
    });

    testWidgets('a push no longer in the inbox opens the tab for its kind', (tester) async {
      final push = FakePushMessaging();
      await pumpApp(tester, messaging: push);
      push.tap({'notificationId': 'gone', 'kind': 'message'});
      await tester.pumpAndSettle();
      expect(find.byType(MessagesTab), findsOneWidget);
      push.tap({'notificationId': 'gone', 'kind': 'fee'});
      await tester.pumpAndSettle();
      expect(find.byType(UpdatesTab), findsOneWidget);
    });

    testWidgets('a tap before sign-in opens once the parent signs in', (tester) async {
      final push = FakePushMessaging(launchTap: const PushTap(notificationId: 'n3', kind: 'broadcast'));
      await pumpApp(tester, signedIn: false, messaging: push);
      expect(find.byType(MessageScreen), findsNothing);
      await signInWithCode(tester);
      expect(find.byType(MessageScreen), findsOneWidget);
    });

    testWidgets('a push arriving while the app is open refreshes Updates', (tester) async {
      final push = FakePushMessaging();
      final (api, _) = await pumpApp(tester, messaging: push);
      await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.byIcon(Icons.notifications_outlined)));
      await tester.pumpAndSettle();
      api.inbox.insert(
        0,
        AppNotification(
          id: 'n9',
          kind: NotificationKind.broadcast,
          title: 'Sports day moved',
          body: 'Now on Friday.',
          data: const {},
          createdAt: DateTime.now(),
        ),
      );
      push.deliver();
      await tester.pumpAndSettle();
      expect(find.text('Sports day moved'), findsOneWidget);
    });
  });
}
