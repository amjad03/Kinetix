import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/app.dart';
import 'package:kinetix_teacher/core/app_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_api.dart';

void main() {
  late FakeTeacherApi api;
  late AppState state;

  Future<void> pumpApp(WidgetTester tester, [Map<String, Object> prefs = const {}]) async {
    SharedPreferences.setMockInitialValues(prefs);
    api = FakeTeacherApi();
    state = AppState(api, await SharedPreferences.getInstance());
    await tester.pumpWidget(TeacherApp(state: state));
    await state.restore();
    await tester.pumpAndSettle();
  }

  testWidgets('shows a message for every empty field', (tester) async {
    await pumpApp(tester);
    await tester.tap(find.byKey(const Key('signIn')));
    await tester.pump();
    expect(find.text('Enter your institution code'), findsOneWidget);
    expect(find.text('Enter your email or phone number'), findsOneWidget);
    expect(find.text('Enter your password'), findsOneWidget);
    expect(api.calls, isEmpty);
  });

  testWidgets('rejects a malformed email or phone number', (tester) async {
    await pumpApp(tester);
    await tester.enterText(find.byKey(const Key('tenant')), 'demo-college');
    await tester.enterText(find.byKey(const Key('login')), 'anita@');
    await tester.enterText(find.byKey(const Key('password')), 'x');
    await tester.tap(find.byKey(const Key('signIn')));
    await tester.pump();
    expect(find.text('Enter a valid email address'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('login')), '98450');
    await tester.tap(find.byKey(const Key('signIn')));
    await tester.pump();
    expect(find.text('Enter a valid email or 10-digit phone number'), findsOneWidget);
    expect(api.calls, isEmpty);
  });

  testWidgets('shows the server error inline for a wrong password', (tester) async {
    await pumpApp(tester);
    await tester.enterText(find.byKey(const Key('tenant')), 'demo-college');
    await tester.enterText(find.byKey(const Key('login')), 'anita@demo.kinetix.in');
    await tester.enterText(find.byKey(const Key('password')), 'wrong');
    await tester.tap(find.byKey(const Key('signIn')));
    await tester.pumpAndSettle();
    expect(find.text('Wrong institution, login or password'), findsOneWidget);
  });

  testWidgets('signs in, remembers the institution and opens Today', (tester) async {
    await pumpApp(tester);
    await tester.enterText(find.byKey(const Key('tenant')), ' Demo-College ');
    await tester.enterText(find.byKey(const Key('login')), 'Anita@Demo.Kinetix.in');
    await tester.enterText(find.byKey(const Key('password')), 'kinetix123');
    await tester.tap(find.byKey(const Key('signIn')));
    await tester.pumpAndSettle();

    expect(api.calls, ['login demo-college anita@demo.kinetix.in']);
    expect(find.textContaining('Anita'), findsWidgets);
    expect(find.byType(NavigationBar), findsOneWidget);
    expect(state.rememberedTenant, 'demo-college');
  });

  testWidgets('offers sign-in with the institution account', (tester) async {
    await pumpApp(tester);
    final button = tester.widget<OutlinedButton>(find.byKey(const Key('ssoSignIn'), skipOffstage: false));
    expect(button.onPressed, isNotNull);
  });
}
