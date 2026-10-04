import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/features/sign_in/sign_in_screen.dart';

import 'helpers.dart';

/// Signing in with a code texted to the phone (`POST /v1/auth/otp/request` and `/verify`).
void main() {
  Future<void> sendCode(WidgetTester tester, {String tenant = 'demo-college', String phone = '98000 00001'}) async {
    await tester.enterText(find.byKey(const Key('tenant')), tenant);
    await tester.enterText(find.byKey(const Key('phone')), phone);
    await tester.tap(find.byKey(const Key('sendCode')));
    await tester.pumpAndSettle();
  }

  TextField field(WidgetTester tester, String key) =>
      tester.widget<TextField>(find.descendant(of: find.byKey(Key(key)), matching: find.byType(TextField)));

  TextButton button(WidgetTester tester, String key) => tester.widget<TextButton>(find.byKey(Key(key)));

  testWidgets('a code to the phone is the default; the institution and a 10-digit mobile are checked', (tester) async {
    final (api, _) = await pumpApp(tester, signedIn: false);
    expect(find.byKey(const Key('password')), findsNothing);
    expect(find.text("We'll text a code to the phone number your college has for you"), findsOneWidget);
    expect(find.text('+91 '), findsOneWidget);

    await tester.tap(find.byKey(const Key('sendCode')));
    await tester.pump();
    expect(find.text('Enter your institution code'), findsOneWidget);
    expect(find.text('Enter your mobile number'), findsOneWidget);

    await sendCode(tester, phone: '98000');
    expect(find.text('Enter a 10-digit mobile number'), findsOneWidget);
    await sendCode(tester, phone: '12345 67890');
    expect(find.text('Enter a 10-digit mobile number'), findsOneWidget);
    expect(api.calls, isEmpty);
  });

  testWidgets('a pasted +91 or 0 prefix is dropped, keeping the 10 digits', (tester) async {
    await pumpApp(tester, signedIn: false);
    await tester.enterText(find.byKey(const Key('phone')), '+91 98000-00001');
    expect(field(tester, 'phone').controller!.text, '9800000001');
    await tester.enterText(find.byKey(const Key('phone')), '09800000001');
    expect(field(tester, 'phone').controller!.text, '9800000001');
    expect(field(tester, 'phone').keyboardType, TextInputType.phone);
  });

  test('numbers shown back and kept to 10 digits', () {
    expect(nationalMobile('+91 98000 00001'), '9800000001');
    expect(nationalMobile('919800000001'), '9800000001');
    expect(displayMobile('9800000001'), '+91 98000 00001');
  });

  testWidgets('sends a code, counts down to resend, and signs in with the texted code', (tester) async {
    final (api, state) = await pumpApp(tester, signedIn: false);
    await sendCode(tester, tenant: ' Demo-College ');
    expect(api.calls, ['otp request demo-college +919800000001']);
    expect(find.text('Enter the 6-digit code sent to +91 98000 00001'), findsOneWidget);
    // The institution and number fields give way to the code.
    expect(find.byKey(const Key('tenant')), findsNothing);

    // The code field offers the SMS's code (autofill) without reading SMS.
    final code = field(tester, 'otpCode');
    expect(code.autofillHints, contains(AutofillHints.oneTimeCode));
    expect(code.keyboardType, TextInputType.number);
    expect(code.inputFormatters, contains(isA<FilteringTextInputFormatter>()));

    // Resend waits for retryAfterSeconds (30).
    expect(find.text('Resend code in 0:30'), findsOneWidget);
    expect(button(tester, 'resendCode').onPressed, isNull);
    await tester.pump(const Duration(seconds: 12));
    expect(find.text('Resend code in 0:18'), findsOneWidget);
    await tester.pump(const Duration(seconds: 18));
    expect(find.text('Resend code'), findsOneWidget);
    await tester.tap(find.byKey(const Key('resendCode')));
    await tester.pumpAndSettle();
    expect(api.calls.where((c) => c.startsWith('otp request')), hasLength(2));
    expect(find.text('Resend code in 0:30'), findsOneWidget);

    // Six digits sign in straight away.
    await tester.enterText(find.byKey(const Key('otpCode')), '123456');
    await tester.pumpAndSettle();
    expect(api.calls, contains('otp verify demo-college +919800000001 123456'));
    expect(state.signedIn, isTrue);
    expect(find.byKey(const Key('greeting')), findsOneWidget);
    expect(state.rememberedTenant, 'demo-college');
    expect(state.rememberedLogin, '+919800000001');
    expect(storedToken(state), 'tok');
  });

  testWidgets('a wrong or expired code is explained in the app language', (tester) async {
    final (api, state) = await pumpApp(tester, signedIn: false, prefs: {'language': 'hi'});
    await sendCode(tester);
    await tester.enterText(find.byKey(const Key('otpCode')), '000000');
    await tester.pumpAndSettle();
    expect(api.calls.last, 'otp verify demo-college +919800000001 000000');
    expect(find.text('यह कोड गलत है या इसका समय खत्म हो गया है। SMS देखें या नया कोड मँगाएँ।'), findsOneWidget);
    expect(state.signedIn, isFalse);
    expect(storedToken(state), isNull);

    // Fewer than six digits are not sent.
    await tester.enterText(find.byKey(const Key('otpCode')), '12');
    await tester.tap(find.byKey(const Key('verifyCode')));
    await tester.pumpAndSettle();
    expect(find.text('6 अंकों का कोड डालें'), findsOneWidget);
    expect(api.calls.where((c) => c.startsWith('otp verify')), hasLength(1));
  });

  testWidgets('too many code requests are explained', (tester) async {
    await pumpApp(tester, signedIn: false, setup: (api) => api.otpRateLimited = true);
    await sendCode(tester);
    expect(find.text('Too many codes asked for. Wait a few minutes and try again.'), findsOneWidget);
    expect(find.byKey(const Key('otpCode')), findsNothing);
  });

  testWidgets('"Change number" goes back to the number, which is remembered next time', (tester) async {
    await pumpApp(tester, signedIn: false, prefs: {'tenant': 'demo-college', 'login': '+919800000001'});
    expect(field(tester, 'phone').controller!.text, '9800000001');
    await tester.tap(find.byKey(const Key('sendCode')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('changeNumber')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('phone')), findsOneWidget);
    expect(find.byKey(const Key('otpCode')), findsNothing);
  });

  testWidgets('a password is still there, and back to a code', (tester) async {
    await pumpApp(tester, signedIn: false);
    await usePassword(tester);
    expect(find.byKey(const Key('password')), findsOneWidget);
    expect(find.byKey(const Key('phone')), findsNothing);
    await tester.tap(find.byKey(const Key('usePhoneCode')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('phone')), findsOneWidget);
  });

  testWidgets('a parent signing in with a code is pointed to the Parent app', (tester) async {
    final (api, state) = await pumpApp(
      tester,
      signedIn: false,
      setup: (api) => api.profile.roles
        ..clear()
        ..add('guardian'),
    );
    await signInWithCode(tester);
    expect(find.textContaining('KINETIX Parent app'), findsOneWidget);
    expect(state.signedIn, isFalse);
    expect(api.token, isNull);
    expect(storedToken(state), isNull);
  });
}
