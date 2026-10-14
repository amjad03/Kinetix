import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/app.dart';
import 'package:kinetix_teacher/core/app_state.dart';
import 'package:kinetix_teacher/core/models.dart';
import 'package:kinetix_teacher/features/messages/chat_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_api.dart';
import 'helpers.dart' show openMore;

/// Staff announcements, and managing a family thread: close, reopen, mute, photos, ticks.
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

  Future<void> openThread(WidgetTester tester) async {
    await openMore(tester, 'navMessages');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('conversation-c1')));
    await tester.pumpAndSettle();
  }

  Future<void> menu(WidgetTester tester, String item) async {
    await tester.tap(find.byKey(const Key('threadMenu')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(Key(item)));
    await tester.pumpAndSettle();
  }

  testWidgets('announcements open from Messages, with the unread count; acknowledging unpins', (tester) async {
    await pumpApp(tester);
    await openMore(tester, 'navMessages');
    await tester.pumpAndSettle();
    final card = find.byKey(const Key('openAnnouncements'));
    expect(find.descendant(of: card, matching: find.text('1')), findsOneWidget);
    await tester.tap(card);
    await tester.pumpAndSettle();
    expect(find.text('Pinned'), findsOneWidget);
    await tester.tap(find.byKey(const Key('announcement-an1')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('announcementRead an1'));
    await tester.scrollUntilVisible(find.byKey(const Key('acknowledgeAnnouncement')), 200, scrollable: find.byType(Scrollable).last);
    await tester.tap(find.byKey(const Key('acknowledgeAnnouncement')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('announcementAck an1'));
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Pinned'), findsNothing);
  });

  testWidgets('close, reopen and mute a thread; the system lines show who did it', (tester) async {
    await pumpApp(tester);
    await openThread(tester);
    await menu(tester, 'threadClose');
    expect(api.calls, contains('status c1 closed'));
    expect(find.byKey(const Key('threadClosedNote')), findsOneWidget);
    expect(find.textContaining('Closed by'), findsOneWidget);

    await menu(tester, 'threadReopen');
    expect(api.calls, contains('status c1 open'));
    expect(find.byKey(const Key('threadClosedNote')), findsNothing);

    await menu(tester, 'threadMute');
    expect(api.calls, contains('mute c1 true'));
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.textContaining('Muted'), findsOneWidget);
  });

  testWidgets('sends a photo and shows its tick', (tester) async {
    chatPhotoPicker = (_) async => ChatUpload(name: 'board.jpg', mime: 'image/jpeg', bytes: Uint8List(2048));
    addTearDown(() => chatPhotoPicker = pickChatPhoto);
    await pumpApp(tester);
    await openThread(tester);
    await tester.tap(find.byKey(const Key('attachFile')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('attachGallery')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('pendingAttachment')), findsOneWidget);
    await tester.tap(find.byKey(const Key('sendMessage')));
    await tester.pumpAndSettle();
    expect(api.calls.where((c) => c.startsWith('send c1') && c.endsWith('+board.jpg')), hasLength(1));
    expect(find.text('board.jpg'), findsOneWidget);
    expect(find.byWidgetPredicate((w) => w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.endsWith('-sent')), findsOneWidget);
  });
}
