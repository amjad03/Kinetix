import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/core/app_state.dart';
import 'package:kinetix_teacher/core/secure_store.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  late FakeTeacherApi api;
  late MemorySecureStore secure;

  Future<AppState> start(WidgetTester tester) async {
    phone(tester);
    api = FakeTeacherApi();
    secure = MemorySecureStore();
    final state = await pumpApp(tester, api, prefs: {}, secure: secure);
    await tapAndSettle(tester, find.byKey(const Key('signInWithPhone')));
    return state;
  }

  Future<void> sendCode(WidgetTester tester, {String phoneNumber = '9845012345'}) async {
    await tester.enterText(find.byKey(const Key('tenant')), 'Demo-College');
    await tester.enterText(find.byKey(const Key('phone')), phoneNumber);
    await tapAndSettle(tester, find.byKey(const Key('sendCode')));
  }

  TextButton resend(WidgetTester tester) => tester.widget<TextButton>(find.byKey(const Key('resendCode')));

  testWidgets('checks the institution and the 10-digit number before sending', (tester) async {
    await start(tester);
    expect(find.byKey(const Key('password')), findsNothing);
    await tapAndSettle(tester, find.byKey(const Key('sendCode')));
    expect(find.text('Enter your institution code'), findsOneWidget);
    expect(find.text('Enter your mobile number'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('tenant')), 'demo-college');
    await tester.enterText(find.byKey(const Key('phone')), '12345abc67');
    await tapAndSettle(tester, find.byKey(const Key('sendCode')));
    expect(find.text('Enter a valid 10-digit mobile number'), findsOneWidget);
    expect(api.calls, isEmpty);

    // Back to the password, which still works.
    await tapAndSettle(tester, find.byKey(const Key('signInWithPassword')));
    expect(find.byKey(const Key('password')), findsOneWidget);
  });

  testWidgets('sends a code, counts down to resend, and signs in with it', (tester) async {
    final state = await start(tester);
    await sendCode(tester);
    expect(api.calls, ['otp request demo-college +919845012345']);
    expect(find.text('Enter the 6-digit code sent to +91 98450 12345'), findsOneWidget);
    final field = tester.widget<TextField>(find.descendant(of: find.byKey(const Key('otpCode')), matching: find.byType(TextField)));
    expect(field.autofillHints, contains(AutofillHints.oneTimeCode));

    // Resend waits for the server's retryAfterSeconds.
    expect(find.text('Resend code in 0:30'), findsOneWidget);
    expect(resend(tester).onPressed, isNull);
    await tester.pump(const Duration(seconds: 10));
    expect(find.text('Resend code in 0:20'), findsOneWidget);
    await tester.pump(const Duration(seconds: 20));
    expect(find.text('Resend code'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('resendCode')));
    expect(api.calls.last, 'otp request demo-college +919845012345');
    expect(find.text('New code sent'), findsOneWidget);
    expect(resend(tester).onPressed, isNull);

    // A wrong code says so and clears the field; the sixth digit submits by itself.
    await tester.enterText(find.byKey(const Key('otpCode')), '111111');
    await tester.pumpAndSettle();
    expect(api.calls.last, 'otp verify demo-college +919845012345 111111');
    expect(find.text('That code is wrong or has expired. Check the SMS or send a new code.'), findsOneWidget);
    expect(tester.widget<TextField>(find.descendant(of: find.byKey(const Key('otpCode')), matching: find.byType(TextField))).controller!.text, '');

    await tester.enterText(find.byKey(const Key('otpCode')), '246810');
    await tester.pumpAndSettle();
    expect(state.signedIn, isTrue);
    expect(find.byType(NavigationBar), findsOneWidget);
    expect(secure.values['token'], 'otp-tok');
    expect(state.rememberedTenant, 'demo-college');
    expect(state.rememberedPhone, '9845012345');
  });

  testWidgets('a short code is not sent', (tester) async {
    await start(tester);
    await sendCode(tester);
    await tester.enterText(find.byKey(const Key('otpCode')), '123');
    await tapAndSettle(tester, find.byKey(const Key('verifyCode')));
    expect(find.text('Enter the 6-digit code'), findsOneWidget);
    expect(api.calls.where((c) => c.startsWith('otp verify')), isEmpty);
  });

  testWidgets('too many requests: explains, and the number can be changed', (tester) async {
    await start(tester);
    api.otpRateLimited = true;
    await sendCode(tester);
    expect(find.byKey(const Key('signInError')), findsOneWidget);
    expect(find.text('Too many attempts. Wait a minute and try again.'), findsOneWidget);
    expect(find.byKey(const Key('otpCode')), findsNothing);

    api.otpRateLimited = false;
    await tapAndSettle(tester, find.byKey(const Key('sendCode')));
    expect(find.byKey(const Key('otpCode')), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('changeNumber')));
    expect(find.byKey(const Key('phone')), findsOneWidget);
    expect(find.byKey(const Key('otpCode')), findsNothing);
  });
}
