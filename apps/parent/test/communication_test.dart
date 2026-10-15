import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_parent/core/attachments.dart';
import 'package:zynetix_parent/core/models.dart';

import 'fake_api.dart';
import 'helpers.dart';

/// Announcements from the institution, and chat with the office: attachments, ticks, office hours, closed threads.
void main() {
  Future<void> openUpdates(WidgetTester tester) async {
    await tester.tap(find.byKey(const Key('navUpdates')));
    await tester.pumpAndSettle();
  }

  Future<void> openMessages(WidgetTester tester) async {
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('More')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('openMessages')), 200, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('openMessages')));
    await tester.pumpAndSettle();
  }

  group('announcements', () {
    testWidgets('pinned important notice on top, read on opening, then acknowledged', (tester) async {
      final (api, _) = await pumpApp(tester);
      await openUpdates(tester);
      expect(find.descendant(of: find.byKey(const Key('announcementsBadge')), matching: find.text('1')), findsOneWidget);
      // The pinned notice names itself on the card.
      expect(find.descendant(of: find.byKey(const Key('openAnnouncements')), matching: find.text('School closed on Friday')), findsOneWidget);

      await tester.tap(find.byKey(const Key('openAnnouncements')));
      await tester.pumpAndSettle();
      expect(find.text('Pinned'), findsOneWidget);
      expect(find.text('Important'), findsOneWidget);
      expect(find.text('Please acknowledge'), findsOneWidget);
      expect(find.byKey(const Key('announcementUnread-an1')), findsOneWidget);
      expect(find.text('Library timings'), findsOneWidget);

      await tester.tap(find.byKey(const Key('announcement-an1')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('announcementRead an1'));
      expect(find.byKey(const Key('announcementTitle')), findsOneWidget);
      // Bold, list items and the link are rendered, not shown as markup.
      expect(find.textContaining('**'), findsNothing);
      expect(find.text('•'), findsNWidgets(2));
      expect(find.byKey(const Key('announcementFile-f1')), findsOneWidget);

      await tester.scrollUntilVisible(find.byKey(const Key('acknowledgeAnnouncement')), 200, scrollable: find.byType(Scrollable).last);
      await tester.tap(find.byKey(const Key('acknowledgeAnnouncement')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('announcementAck an1'));
      expect(find.byKey(const Key('announcementAcknowledged')), findsOneWidget);

      await tester.pageBack();
      await tester.pumpAndSettle();
      // Acknowledged: no longer pinned, and nothing unread.
      expect(find.text('Pinned'), findsNothing);
      expect(find.byKey(const Key('announcementUnread-an1')), findsNothing);
    });

    testWidgets('an empty inbox says so', (tester) async {
      await pumpApp(tester, setup: (api) => api.announcementList = []);
      await openUpdates(tester);
      await tester.tap(find.byKey(const Key('openAnnouncements')));
      await tester.pumpAndSettle();
      expect(find.textContaining('No announcements yet'), findsOneWidget);
    });
  });

  group('chat with the school', () {
    testWidgets('writes to the office with a photo, sees the office-hours note and ticks', (tester) async {
      final picker = FakeAttachmentPicker();
      AttachmentPicker.instance = picker;
      addTearDown(() => AttachmentPicker.instance = const DeviceAttachmentPicker());
      final (api, _) = await pumpApp(tester, setup: (api) => api.officeHoursOutside = (start: '09:00', end: '17:00'));
      await openMessages(tester);
      await tester.tap(find.byKey(const Key('newMessage')));
      await tester.pumpAndSettle();
      // The class teacher is marked; the office is offered too.
      expect(find.text('Class teacher · Corporate Accounting · Cost Accounting'), findsOneWidget);
      await tester.tap(find.byKey(const Key('pickOffice')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('startOffice c1'));
      expect(find.text('Office'), findsWidgets);
      expect(find.byKey(const Key('afterHoursNote')), findsOneWidget);
      expect(find.text('We reply between 09:00 and 17:00. Your message has been delivered.'), findsOneWidget);

      await tester.tap(find.byKey(const Key('attachFile')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('attachGallery')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('pendingAttachment')), findsOneWidget);
      // A photo alone can be sent.
      await tester.tap(find.byKey(const Key('sendMessage')));
      await tester.pumpAndSettle();
      expect(api.calls.where((c) => c.endsWith('+page2.png')), hasLength(1));
      expect(find.text('page2.png'), findsOneWidget);
      expect(find.byKey(const Key('pendingAttachment')), findsNothing);
    });

    testWidgets("the parent's own messages show read ticks once the teacher replied", (tester) async {
      await pumpApp(tester);
      await openMessages(tester);
      await tester.tap(find.byKey(const Key('thread-cv1')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('tick-m1-read')), findsOneWidget);
      // The teacher's message has no tick.
      expect(find.byWidgetPredicate((w) => w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('tick-m2')), findsNothing);
    });

    testWidgets('a closed thread cannot be written to', (tester) async {
      await pumpApp(tester, setup: (api) => api.threadStatus['cv1'] = ThreadStatus.closed);
      await openMessages(tester);
      expect(find.textContaining('Closed'), findsOneWidget);
      await tester.tap(find.byKey(const Key('thread-cv1')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chatClosed')), findsOneWidget);
      expect(find.byKey(const Key('messageField')), findsNothing);
    });
  });
}
