import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/features/sign_in/sign_in_screen.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  Future<void> fill(
    WidgetTester tester, {
    String tenant = 'demo-college',
    String login = 'aarav@demo.kinetix.in',
    String password = 'kinetix123',
  }) async {
    await tester.enterText(find.byKey(const Key('tenant')), tenant);
    await tester.enterText(find.byKey(const Key('login')), login);
    await tester.enterText(find.byKey(const Key('password')), password);
    await tester.tap(find.byKey(const Key('signIn')));
    await tester.pumpAndSettle();
  }

  testWidgets('shows a message for every empty field', (tester) async {
    final (api, _) = await pumpApp(tester, signedIn: false);
    expect(find.text('Student'), findsOneWidget);
    await tester.tap(find.byKey(const Key('signIn')));
    await tester.pump();
    expect(find.text('Enter your institution code'), findsOneWidget);
    expect(find.text('Enter your email or phone number'), findsOneWidget);
    expect(find.text('Enter your password'), findsOneWidget);
    expect(api.calls, isEmpty);
  });

  testWidgets('rejects a malformed email or phone number', (tester) async {
    final (api, _) = await pumpApp(tester, signedIn: false);
    await fill(tester, login: 'aarav@');
    expect(find.text('Enter a valid email address'), findsOneWidget);
    await fill(tester, login: '98000');
    expect(find.text('Enter a 10-digit phone number or a valid email'), findsOneWidget);
    expect(api.calls, isEmpty);
  });

  test('normalises Indian phone numbers to E.164 and lower-cases emails', () {
    expect(normalizeLogin('98000 00001'), '+919800000001');
    expect(normalizeLogin('Aarav@Demo.Kinetix.in'), 'aarav@demo.kinetix.in');
  });

  testWidgets('shows the server error inline for a wrong password', (tester) async {
    await pumpApp(tester, signedIn: false);
    await fill(tester, password: 'wrong');
    expect(find.text('Wrong institution, login or password'), findsOneWidget);
  });

  testWidgets('politely refuses a parent and points them to the Parent app', (tester) async {
    final (api, state) = await pumpApp(
      tester,
      signedIn: false,
      setup: (api) => api.profile.roles
        ..clear()
        ..add('guardian'),
    );
    await fill(tester, login: 'parent@demo.kinetix.in');
    expect(find.textContaining('This app is for students'), findsOneWidget);
    expect(find.textContaining('KINETIX Parent app'), findsOneWidget);
    expect(state.signedIn, isFalse);
    expect(api.token, isNull);
  });

  testWidgets('points a teacher to the Teacher app', (tester) async {
    await pumpApp(
      tester,
      signedIn: false,
      setup: (api) => api.profile.roles
        ..clear()
        ..add('teacher'),
    );
    await fill(tester, login: 'anita@demo.kinetix.in');
    expect(find.textContaining('KINETIX Teacher app'), findsOneWidget);
  });

  testWidgets('explains a student login with no student record', (tester) async {
    final (api, state) = await pumpApp(tester, signedIn: false, setup: (api) => api.record = null);
    await fill(tester);
    expect(find.textContaining('not linked to a student record'), findsOneWidget);
    expect(state.signedIn, isFalse);
    expect(api.token, isNull);
  });

  testWidgets('signs in, remembers the institution and opens Today', (tester) async {
    final (api, state) = await pumpApp(tester, signedIn: false);
    await fill(tester, tenant: ' Demo-College ', login: 'Aarav@Demo.Kinetix.in');
    expect(api.calls.first, 'login demo-college aarav@demo.kinetix.in');
    expect(find.byKey(const Key('greeting')), findsOneWidget);
    expect(find.textContaining('Aarav'), findsWidgets);
    expect(find.byType(NavigationBar), findsOneWidget);
    expect(state.rememberedTenant, 'demo-college');
    expect(state.prefs.getString('token'), 'tok');
  });

  testWidgets('a remembered session opens straight on Today; an expired one asks to sign in', (tester) async {
    await pumpApp(tester);
    expect(find.byKey(const Key('greeting')), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    final (_, state) = await pumpApp(tester, setup: (api) => api.record = null);
    expect(find.byKey(const Key('signIn')), findsOneWidget);
    expect(state.prefs.getString('token'), isNull);
  });

  testWidgets('registers for push after sign-in and removes it on sign-out', (tester) async {
    final (api, state) = await pumpApp(tester, signedIn: false, push: FakePushTokenSource());
    await fill(tester);
    expect(api.calls, contains('push register device-token-123456 android'));
    await state.signOut();
    await tester.pumpAndSettle();
    expect(api.calls, contains('push remove device-token-123456'));
    expect(find.byKey(const Key('signIn')), findsOneWidget);
  });

  testWidgets('without a push SDK nothing is registered', (tester) async {
    final (api, _) = await pumpApp(tester);
    expect(api.calls.where((c) => c.startsWith('push')), isEmpty);
  });
}
