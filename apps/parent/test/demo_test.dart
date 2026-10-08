import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import 'package:kinetix_parent/app.dart';
import 'package:kinetix_parent/core/app_state.dart';
import 'package:kinetix_parent/core/models.dart';
import 'package:kinetix_parent/core/token_store.dart';
import 'package:kinetix_parent/demo/demo.dart';
import 'package:kinetix_parent/demo/demo_api.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The demo build (--dart-define=KINETIX_DEMO=true): sample data, no server.
void main() {
  setUp(() => Demo.enabled = true);
  tearDown(() => Demo.enabled = false);

  Future<(DemoParentApi, AppState)> pumpDemo(WidgetTester tester) async {
    tester.view.physicalSize = const Size(412, 892);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    LessonAudio.debugFactory = (_, _, length) async => SilentLessonAudio(length, audible: true);
    addTearDown(() => LessonAudio.debugFactory = null);
    SharedPreferences.setMockInitialValues({});
    final api = DemoParentApi(clock: () => DateTime(2026, 10, 5, 10, 15));
    final state = AppState(
      api,
      await SharedPreferences.getInstance(),
      tokens: MemoryTokenStore(),
      realtime: DemoRealtimeConnection.connector(api),
    );
    await tester.pumpWidget(ParentApp(state: state));
    await state.restore();
    await tester.pumpAndSettle();
    return (api, state);
  }

  testWidgets('signs in as Rajesh in one tap and opens every tab with sample data', (tester) async {
    final (api, state) = await pumpDemo(tester);
    expect(find.byKey(const Key('demoBanner')), findsOneWidget);
    expect(find.byKey(const Key('demoChip')), findsOneWidget);

    await tester.tap(find.byKey(const Key('demoSignIn0')));
    await tester.pumpAndSettle();
    expect(state.me!.fullName, 'Rajesh Patel');
    expect(find.byKey(const Key('demoChip')), findsOneWidget);
    expect(find.text("Here's how Aarav is doing"), findsOneWidget);
    await tester.tap(find.byKey(const Key('childCard')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('child-c2')));
    await tester.pumpAndSettle();
    expect(find.text("Here's how Diya is doing"), findsOneWidget);

    for (final tab in ['Updates', 'Fees', 'More']) {
      await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text(tab)));
      await tester.pumpAndSettle();
    }
    await tester.scrollUntilVisible(find.byKey(const Key('openMessages')), 200, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('openMessages')));
    await tester.pumpAndSettle();
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('openMessages')), findsOneWidget);

    // Anita's reply arrives a few seconds after sign-in.
    await tester.pump(const Duration(seconds: 9));
    await tester.pumpAndSettle();
    expect(api.chats['cv1']!.last.senderId, 't1');
    expect(api.chats['cv1']!.last.body, contains('Exercise 4.2'));
  });

  testWidgets('phone sign-in accepts the demo code 123456', (tester) async {
    final (_, state) = await pumpDemo(tester);
    expect(find.byKey(const Key('demoOtpHint')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('tenant')), 'demo-college');
    await tester.enterText(find.byKey(const Key('phone')), '9800000001');
    await tester.tap(find.byKey(const Key('sendCode')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('otpCode')), '123456');
    await tester.pumpAndSettle();
    expect(state.me?.fullName, 'Rajesh Patel');
    await tester.pump(const Duration(seconds: 9));
    await tester.pumpAndSettle();
  });

  test('changes stay in memory for the session', () async {
    final api = DemoParentApi(clock: () => DateTime(2026, 10, 5, 10, 15));
    expect((await api.children()).map((c) => c.fullName), ['Aarav Patel', 'Diya Patel']);
    await api.submitHomework('h1', 'c1', text: 'Done, journal entries attached.');
    expect((await api.submission('h1', 'c1')).status, isNotNull);
    expect((await api.submission('h3', 'c1')).remark, contains('Well done'));
    expect((await api.library('c2')).current.single.overdue, isTrue);
    expect((await api.fees('c1')).duePaise, greaterThan(0));
    final c = await api.setConsent('c2', ConsentPurpose.photos, granted: true);
    expect(c, isNotNull);
    await api.sendMessage('cv1', 'Thank you ma’am');
    expect(api.chats['cv1']!.last.body, 'Thank you ma’am');
    expect((await api.calendar()).events.map((e) => e.title), contains('Dasara holidays'));
  });
}
