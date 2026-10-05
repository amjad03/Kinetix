import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import 'package:kinetix_student/app.dart';
import 'package:kinetix_student/core/app_state.dart';
import 'package:kinetix_student/core/models.dart';
import 'package:kinetix_student/core/token_store.dart';
import 'package:kinetix_student/demo/demo.dart';
import 'package:kinetix_student/demo/demo_api.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers.dart';

/// The demo build (--dart-define=KINETIX_DEMO=true): sample data, no server.
void main() {
  setUp(() => Demo.enabled = true);
  tearDown(() => Demo.enabled = false);

  Future<(DemoStudentApi, AppState)> pumpDemo(WidgetTester tester) async {
    tester.view.physicalSize = const Size(412, 892);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    LessonAudio.debugFactory = (_, _, length) async => SilentLessonAudio(length, audible: true);
    addTearDown(() => LessonAudio.debugFactory = null);
    SharedPreferences.setMockInitialValues({});
    final api = DemoStudentApi(clock: () => DateTime(2026, 10, 5, 10, 15));
    final state = AppState(api, await SharedPreferences.getInstance(), tokens: MemoryTokenStore(), live: DemoLiveConnection.connector(api));
    await tester.pumpWidget(StudentApp(state: state));
    await state.restore();
    await tester.pumpAndSettle();
    return (api, state);
  }

  testWidgets('signs in as Aarav in one tap and opens every tab with sample data', (tester) async {
    final (api, state) = await pumpDemo(tester);
    expect(find.byKey(const Key('demoBanner')), findsOneWidget);
    expect(find.byKey(const Key('demoChip')), findsOneWidget);

    await tester.tap(find.byKey(const Key('demoSignIn0')));
    await tester.pumpAndSettle();
    expect(state.me!.fullName, 'Aarav Patel');
    expect(find.byKey(const Key('demoChip')), findsOneWidget);
    expect(find.text('Exercise 4.2: Issue of shares'), findsWidgets);

    for (final tab in ['Learn', 'Updates', 'Profile']) {
      await openTab(tester, tab);
    }
    expect(find.text('Aarav Patel'), findsWidgets);

    // Anita's reply arrives a few seconds after sign-in.
    await tester.pump(const Duration(seconds: 9));
    await tester.pumpAndSettle();
    expect(api.chats['cv1']!.last.senderId, 't1');
  });

  testWidgets('phone sign-in accepts the demo code 123456', (tester) async {
    final (_, state) = await pumpDemo(tester);
    expect(find.byKey(const Key('demoOtpHint')), findsOneWidget);
    await signInWithCode(tester);
    expect(state.me?.fullName, 'Aarav Patel');
    await tester.pump(const Duration(seconds: 9));
    await tester.pumpAndSettle();
  });

  test('AI answers are labelled samples; changes stay in memory', () async {
    final api = DemoStudentApi(clock: () => DateTime(2026, 10, 5, 10, 15));
    final a = await api.explain(question: 'What is forfeiture?', language: AiLanguage.en, topicId: 't4');
    expect(a.preview, isTrue);
    expect(a.answer, contains('sample answer'));
    expect((await api.searchTopics('goodwill')).single.id, 't7');
    expect((await api.topic('t5')).title, 'Re-issue of forfeited shares');
    await api.submitHomework('h1', 's1', text: 'Done.');
    expect((await api.submission('h1', 's1')).status, isNotNull);
    expect((await api.submission('h3', 's1')).remark, contains('Well done'));
    await api.sendMessage('cv1', 'Thank you ma’am');
    expect(api.chats['cv1']!.last.body, 'Thank you ma’am');
  });
}
