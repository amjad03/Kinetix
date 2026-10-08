import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';

import 'helpers.dart';

void main() {
  Future<void> scrollTo(WidgetTester tester, Finder f) async {
    await tester.scrollUntilVisible(f, 200, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
  }

  testWidgets('Home lists recordings with the missed one first and plays it', (tester) async {
    final (api, _) = await pumpApp(tester, section: 'academics');
    final card = find.byKey(const Key('recordingsCard'));
    await scrollTo(tester, card);
    expect(find.descendant(of: card, matching: find.text('Lesson recordings')), findsOneWidget);
    expect(find.descendant(of: card, matching: find.text('1 missed')), findsOneWidget);
    expect(find.descendant(of: card, matching: find.text('Missed this class')), findsOneWidget);

    // Missed first, although it is older.
    final missed = tester.getTopLeft(find.byKey(const Key('recording-r2')));
    final other = tester.getTopLeft(find.byKey(const Key('recording-r1')));
    expect(missed.dy, lessThan(other.dy));
    expect(find.descendant(of: find.byKey(const Key('recording-r2')), matching: find.text('Missed this class')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('recording-r1')), matching: find.text('Missed this class')), findsNothing);
    expect(find.text('Anita Sharma · Today · Under a minute'), findsOneWidget);

    await tester.tap(find.byKey(const Key('recording-r2')));
    await tester.pumpAndSettle();
    expect(api.calls, containsAll(['recording r2', 'lesson r2']));
    expect(find.byType(LessonView), findsOneWidget);
    expect(find.text('Issue of shares'), findsOneWidget);
    expect(find.text('Missed this class. Watch the lesson to catch up.'), findsOneWidget);
    expect(find.text('Shares can be issued at par or at a premium'), findsOneWidget);

    await tester.tap(find.byKey(const Key('lessonPlay')));
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));
    await tester.pump(const Duration(milliseconds: 16));
    expect(tester.widget<LessonView>(find.byType(LessonView)).player.strokes, hasLength(1));
    await tester.pageBack();
    await tester.pumpAndSettle();
  });

  testWidgets('more than three recordings: see all', (tester) async {
    await pumpApp(
      section: 'academics',
      tester,
      setup: (api) => api.recordings = [for (var i = 0; i < 5; i++) RecordingInfo.fromJson(api.recordingJsonFor('x$i', missed: i == 4))],
    );
    await scrollTo(tester, find.text('See all 5 recordings'));
    expect(find.byKey(const Key('recording-x4')), findsOneWidget);
    expect(find.byKey(const Key('recording-x3')), findsNothing);
    await tester.tap(find.text('See all 5 recordings'));
    await tester.pumpAndSettle();
    expect(find.text("Aarav's lessons"), findsWidgets);
    expect(find.byKey(const Key('recording-x3')), findsOneWidget);
  });

  testWidgets('no recordings yet explains where they come from', (tester) async {
    await pumpApp(tester, section: 'academics', setup: (api) => api.recordings = []);
    await scrollTo(tester, find.byKey(const Key('recordingsCard')));
    expect(
      find.text('When a teacher records a lesson on the board and shares it, it appears here so Aarav can watch it again.'),
      findsOneWidget,
    );
  });

  testWidgets('a recording notification opens the player; a missing one explains itself', (tester) async {
    final (api, _) = await pumpApp(
      section: 'academics',
      tester,
      setup: (api) {
        api.inbox.insert(0, api.recordingNotice('nr', 'r2'));
        api.inbox.insert(0, api.recordingNotice('gone', 'r-gone'));
      },
    );
    await tester.tap(find.text('Updates'));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.play_circle), findsNWidgets(2));
    await tester.tap(find.byKey(const Key('notification-nr')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('read nr'));
    expect(find.byType(LessonView), findsOneWidget);
    // The summary told us Aarav missed it.
    expect(find.text('Missed this class. Watch the lesson to catch up.'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('notification-gone')));
    await tester.pumpAndSettle();
    expect(find.text('This recording is no longer shared with the class.'), findsOneWidget);
  });

  testWidgets('a recording deleted with its term says until when it can be watched', (tester) async {
    await pumpApp(tester, section: 'academics');
    final card = find.byKey(const Key('recordingsCard'));
    await scrollTo(tester, card);
    // expiresOn 2027-01-10 is the day it is deleted: available until the day before.
    expect(find.descendant(of: find.byKey(const Key('recording-r1')), matching: find.text('Available until Sat 9 Jan')), findsOneWidget);
    expect(find.byKey(const Key('available-until-r2')), findsNothing);
  });
}
