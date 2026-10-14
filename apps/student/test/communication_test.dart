import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/core/attachments.dart';
import 'package:kinetix_student/core/models.dart';

import 'fake_api.dart';
import 'helpers.dart';

/// Announcements from the institution, and chat with teachers and the office (colleges).
void main() {
  Future<void> openMessages(WidgetTester tester) async {
    await openTab(tester, 'Profile');
    await scrollTo(tester, find.byKey(const Key('openMessages')));
    await tester.tap(find.byKey(const Key('openMessages')));
    await tester.pumpAndSettle();
  }

  testWidgets('announcements: pinned on top, read on opening, acknowledged', (tester) async {
    final (api, _) = await pumpApp(tester);
    await openTab(tester, 'Updates');
    expect(find.descendant(of: find.byKey(const Key('announcementsBadge')), matching: find.text('1')), findsOneWidget);
    await tester.tap(find.byKey(const Key('openAnnouncements')));
    await tester.pumpAndSettle();
    expect(find.text('Pinned'), findsOneWidget);
    await tester.tap(find.byKey(const Key('announcement-an1')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('announcementRead an1'));
    expect(find.textContaining('**'), findsNothing);
    await tester.scrollUntilVisible(find.byKey(const Key('acknowledgeAnnouncement')), 200, scrollable: find.byType(Scrollable).last);
    await tester.tap(find.byKey(const Key('acknowledgeAnnouncement')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('announcementAck an1'));
    expect(find.byKey(const Key('announcementAcknowledged')), findsOneWidget);
  });

  testWidgets('chat: the office, a PDF, office hours and ticks', (tester) async {
    final picker = FakeAttachmentPicker();
    AttachmentPicker.instance = picker;
    addTearDown(() => AttachmentPicker.instance = const DeviceAttachmentPicker());
    final (api, _) = await pumpApp(tester, setup: (api) => api.officeHoursOutside = (start: '09:00', end: '16:00'));
    await openMessages(tester);
    await tester.tap(find.byKey(const Key('newMessage')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('pickOffice')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('startOffice s1'));
    expect(find.text('We reply between 09:00 and 16:00. Your message has been delivered.'), findsOneWidget);

    await tester.tap(find.byKey(const Key('attachFile')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('attachPdf')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('messageField')), 'My fee receipt');
    await tester.pump();
    await tester.tap(find.byKey(const Key('sendMessage')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('send office1 My fee receipt +answers.pdf'));
    // Delivered (no reply yet).
    expect(find.byWidgetPredicate((w) => w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.endsWith('-delivered')), findsOneWidget);
  });

  testWidgets('chat: a closed thread cannot be written to', (tester) async {
    await pumpApp(
      tester,
      setup: (api) {
        api.chats['cv1'] = [ChatMessage(id: 'm1', senderId: 't1', body: 'Please see me tomorrow.', createdAt: DateTime.now().subtract(const Duration(hours: 1)))];
        api.threadStatus['cv1'] = ThreadStatus.closed;
      },
    );
    await openMessages(tester);
    await tester.tap(find.byKey(const Key('thread-cv1')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('chatClosed')), findsOneWidget);
    expect(find.byKey(const Key('messageField')), findsNothing);
  });
}
