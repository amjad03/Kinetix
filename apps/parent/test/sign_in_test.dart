import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_parent/features/sign_in/sign_in_screen.dart';

import 'helpers.dart';

void main() {
  testWidgets('shows a message for every empty field', (tester) async {
    final (api, _) = await pumpApp(tester, signedIn: false);
    await tester.tap(find.byKey(const Key('signIn')));
    await tester.pump();
    expect(find.text('Enter your institution code'), findsOneWidget);
    expect(find.text('Enter your phone number or email'), findsOneWidget);
    expect(find.text('Enter your password'), findsOneWidget);
    expect(api.calls, isEmpty);
  });

  testWidgets('rejects a malformed email or phone number', (tester) async {
    final (api, _) = await pumpApp(tester, signedIn: false);
    await tester.enterText(find.byKey(const Key('tenant')), 'demo-college');
    await tester.enterText(find.byKey(const Key('login')), 'rajesh@');
    await tester.enterText(find.byKey(const Key('password')), 'x');
    await tester.tap(find.byKey(const Key('signIn')));
    await tester.pump();
    expect(find.text('Enter a valid email address'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('login')), '98000');
    await tester.tap(find.byKey(const Key('signIn')));
    await tester.pump();
    expect(find.text('Enter a 10-digit phone number or a valid email'), findsOneWidget);
    expect(api.calls, isEmpty);
  });

  test('normalises Indian phone numbers to E.164 and lower-cases emails', () {
    expect(normalizeLogin('98000 00001'), '+919800000001');
    expect(normalizeLogin('098000-00001'), '+919800000001');
    expect(normalizeLogin('919800000001'), '+919800000001');
    expect(normalizeLogin('+919800000001'), '+919800000001');
    expect(normalizeLogin('Parent@Demo.Kinetix.in'), 'parent@demo.kinetix.in');
  });

  testWidgets('shows the server error inline for a wrong password', (tester) async {
    await pumpApp(tester, signedIn: false);
    await tester.enterText(find.byKey(const Key('tenant')), 'demo-college');
    await tester.enterText(find.byKey(const Key('login')), 'parent@demo.kinetix.in');
    await tester.enterText(find.byKey(const Key('password')), 'wrong');
    await tester.tap(find.byKey(const Key('signIn')));
    await tester.pumpAndSettle();
    expect(find.text('Wrong institution, login or password'), findsOneWidget);
  });

  testWidgets('politely refuses an account that is not a parent', (tester) async {
    final (api, state) = await pumpApp(
      tester,
      signedIn: false,
      setup: (api) => api.profile.roles
        ..clear()
        ..add('teacher'),
    );
    await tester.enterText(find.byKey(const Key('tenant')), 'demo-college');
    await tester.enterText(find.byKey(const Key('login')), 'anita@demo.kinetix.in');
    await tester.enterText(find.byKey(const Key('password')), 'kinetix123');
    await tester.tap(find.byKey(const Key('signIn')));
    await tester.pumpAndSettle();
    expect(find.textContaining('This app is for parents and guardians'), findsOneWidget);
    expect(find.textContaining('KINETIX Teacher app'), findsOneWidget);
    expect(state.signedIn, isFalse);
    expect(api.token, isNull);
  });

  testWidgets('signs in with a phone number and opens Home', (tester) async {
    final (api, state) = await pumpApp(tester, signedIn: false);
    await tester.enterText(find.byKey(const Key('tenant')), ' Demo-College ');
    await tester.enterText(find.byKey(const Key('login')), '98000 00001');
    await tester.enterText(find.byKey(const Key('password')), 'kinetix123');
    await tester.tap(find.byKey(const Key('signIn')));
    await tester.pumpAndSettle();

    expect(api.calls.first, 'login demo-college +919800000001');
    expect(find.textContaining('Rajesh'), findsWidgets);
    expect(find.byType(NavigationBar), findsOneWidget);
    expect(state.rememberedTenant, 'demo-college');
  });
}
