import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import 'package:kinetix_teacher/core/api.dart';
import 'package:kinetix_teacher/app.dart';
import 'package:kinetix_teacher/core/app_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_api.dart';
import 'helpers.dart' show openMore;

void main() {
  Future<FakeTeacherApi> pumpRecordings(WidgetTester tester, [void Function(FakeTeacherApi)? setup]) async {
    tester.view.physicalSize = const Size(412, 892);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    LessonAudio.debugFactory = (_, _, length) async => SilentLessonAudio(length, audible: true);
    addTearDown(() => LessonAudio.debugFactory = null);
    SharedPreferences.setMockInitialValues({'token': 'tok'});
    final api = FakeTeacherApi();
    setup?.call(api);
    final state = AppState(api, await SharedPreferences.getInstance());
    await tester.pumpWidget(TeacherApp(state: state));
    await state.restore();
    await tester.pumpAndSettle();
    expect(api.calls, isNot(contains('recordings')));
    await openMore(tester, 'navRecordings');
    await tester.pumpAndSettle();
    return api;
  }

  Finder inCard(String id, Finder f) => find.descendant(of: find.byKey(Key('recording-$id')), matching: f);

  testWidgets('lists recordings with their status', (tester) async {
    final api = await pumpRecordings(tester);
    expect(api.calls, contains('recordings'));
    expect(find.text('Issue of shares'), findsOneWidget);
    expect(inCard('r1', find.text('Not shared')), findsOneWidget);
    expect(inCard('r1', find.text('Preparing transcript')), findsOneWidget);
    expect(inCard('r1', find.text('BCom Sem 3 A · Corporate Accounting')), findsOneWidget);
    expect(inCard('r1', find.textContaining('24 min')), findsOneWidget);
    expect(inCard('r1', find.text('Share with class')), findsOneWidget);

    expect(inCard('r2', find.text('Shared with class')), findsOneWidget);
    expect(inCard('r2', find.text('Transcript ready')), findsOneWidget);
    expect(inCard('r2', find.text('Share with class')), findsNothing);

    await tester.scrollUntilVisible(find.byKey(const Key('recording-r4')), 200, scrollable: find.byType(Scrollable).first);
    expect(inCard('r3', find.text('Uploading')), findsOneWidget);
    expect(inCard('r3', find.byIcon(Icons.play_arrow)), findsNothing);
    expect(inCard('r4', find.text('No class')), findsOneWidget);
    expect(inCard('r4', find.text('Not linked to a class')), findsOneWidget);
    expect(inCard('r4', find.text('No sound')), findsOneWidget);
    expect(inCard('r4', find.text('Share with class')), findsNothing);
  });

  testWidgets('shares a recording after confirming', (tester) async {
    final api = await pumpRecordings(tester);
    await tester.tap(inCard('r1', find.text('Share with class')));
    await tester.pumpAndSettle();
    expect(find.text('Share with the class?'), findsOneWidget);
    expect(find.textContaining('Students of BCom Sem 3 A and their families'), findsOneWidget);

    // Cancel does nothing.
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(api.calls, isNot(contains('share r1')));

    await tester.tap(inCard('r1', find.text('Share with class')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('confirmShare')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('share r1'));
    expect(find.text('Shared with BCom Sem 3 A'), findsOneWidget);
    expect(inCard('r1', find.text('Shared with class')), findsOneWidget);
    expect(inCard('r1', find.text('Share with class')), findsNothing);
  });

  testWidgets('a refused share explains why', (tester) async {
    await pumpRecordings(tester, (api) => api.shareError = 'The recording is still uploading');
    await tester.tap(inCard('r1', find.text('Share with class')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('confirmShare')));
    await tester.pumpAndSettle();
    expect(find.text('The recording is still uploading'), findsOneWidget);
    expect(inCard('r1', find.text('Not shared')), findsOneWidget);
  });

  testWidgets('tapping a recording plays it', (tester) async {
    final api = await pumpRecordings(tester);
    await tester.tap(find.byKey(const Key('play-r1')));
    await tester.pumpAndSettle();
    expect(api.calls, containsAll(['recording r1', 'lesson r1']));
    expect(find.byType(LessonView), findsOneWidget);
    expect(find.text('Transcript is being prepared. Check back in a few minutes.'), findsOneWidget);
  });

  testWidgets('no recordings yet', (tester) async {
    await pumpRecordings(tester, (api) => api.recordings = []);
    expect(find.textContaining('No recordings yet.'), findsOneWidget);
  });

  group('retention', () {
    testWidgets('shows when each recording is deleted, highlighted within a week, or that it is kept', (tester) async {
      await pumpRecordings(tester, (api) {
        api.recordings.add(FakeTeacherApi.recordingJson('r5', 'Underwriting', expiresOn: FakeTeacherApi.inDays(30)));
      });
      expect(inCard('r1', find.byKey(const Key('expires-soon-r1'))), findsOneWidget);
      expect(inCard('r1', find.textContaining('Deleted on')), findsOneWidget);
      expect(inCard('r1', find.text('Keep')), findsOneWidget);
      expect(inCard('r2', find.text('Kept')), findsOneWidget);
      expect(inCard('r2', find.text("Don't keep")), findsOneWidget);
      await tester.scrollUntilVisible(find.byKey(const Key('recording-r5')), 200, scrollable: find.byType(Scrollable).first);
      expect(inCard('r5', find.byKey(const Key('expires-r5'))), findsOneWidget);
      // Uploading, or without a class (no term): nothing to keep.
      expect(find.byKey(const Key('keep-r3')), findsNothing);
      expect(find.byKey(const Key('keep-r4')), findsNothing);
    });

    testWidgets('Keep shows at once and is confirmed by the server', (tester) async {
      final gate = Completer<void>();
      final api = await pumpRecordings(tester, (api) => api.keepGate = gate);
      await tester.tap(find.byKey(const Key('keep-r1')));
      await tester.pump();
      expect(inCard('r1', find.text('Kept')), findsOneWidget);
      expect(inCard('r1', find.textContaining('Deleted on')), findsNothing);
      gate.complete();
      await tester.pumpAndSettle();
      expect(api.calls, contains('keep r1 true'));
      expect(inCard('r1', find.text('Kept')), findsOneWidget);
      expect(inCard('r1', find.text("Don't keep")), findsOneWidget);

      // Don't keep: the term's date comes back.
      await tester.tap(find.byKey(const Key('keep-r2')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('keep r2 false'));
      expect(inCard('r2', find.byKey(const Key('expires-r2'))), findsOneWidget);
      expect(inCard('r2', find.text('Keep')), findsOneWidget);
    });

    testWidgets('a refused Keep is undone and explained', (tester) async {
      await pumpRecordings(tester, (api) => api.keepError = ApiException(403, 'Only the teacher who recorded it can keep it'));
      await tester.tap(find.byKey(const Key('keep-r1')));
      await tester.pumpAndSettle();
      expect(find.text('Only the teacher who recorded it can keep it'), findsOneWidget);
      expect(inCard('r1', find.text('Kept')), findsNothing);
      expect(inCard('r1', find.byKey(const Key('expires-soon-r1'))), findsOneWidget);
    });
  });
}
