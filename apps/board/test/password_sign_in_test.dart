// A teacher signs in on the board with email and password (no phone at hand): the teacher's
// own login claims a fresh pairing code of this board, and the board picks up the session.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/features/enrollment/enroll_screen.dart';
import 'package:kinetix_board/features/signin/password_sign_in.dart';
import 'package:kinetix_board/features/signin/sign_in_dialog.dart';
import 'package:kinetix_board/l10n/gen/app_localizations.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

http.Response _json(Object? body, [int status = 200]) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

({ApiClient api, List<String> calls}) _server({bool mfa = false}) {
  final calls = <String>[];
  var claimed = false;
  final api = ApiClient(
    baseUrl: 'http://192.168.1.20:4000',
    client: MockClient((req) async {
      calls.add('${req.method} ${req.url.path} ${req.headers['authorization'] ?? '-'}');
      switch (req.url.path) {
        case '/v1/auth/login':
          final b = jsonDecode(req.body) as Map<String, dynamic>;
          if (b['password'] != 'zynetix123') return _json({'message': 'Wrong institution, login or password'}, 401);
          expect(b, {'tenant': 'sdmcet', 'login': 'asha.cse@sdmcet.zynetix.in', 'password': 'zynetix123'});
          return _json(mfa ? {'mfaRequired': true, 'mfaToken': 'm'} : {'accessToken': 'user-token', 'user': {'id': 'u1'}});
        case '/v1/devices/me/pairing-codes':
          return _json({'code': '482913', 'qrPayload': 'kinetix://pair?c=482913', 'expiresAt': DateTime.now().add(const Duration(minutes: 2)).toUtc().toIso8601String()});
        case '/v1/pairing/claim':
          expect(jsonDecode(req.body), {'code': '482913'});
          claimed = true;
          return _json({'board': {'id': 'b1', 'name': 'CSE 301'}, 'session': {'sessionId': 's1'}});
        case '/v1/pairing/pending':
          return _json({
            'pending': claimed
                ? {
                    'sessionToken': 'board-session',
                    'session': {'sessionId': 's1', 'expiresAt': DateTime.now().add(const Duration(hours: 1)).toUtc().toIso8601String(), 'teacher': {'id': 't1', 'fullName': 'Asha Rao', 'preferredLanguage': 'en'}, 'edition': 'board'},
                  }
                : null,
          });
      }
      return _json({'keyId': 'k', 'board': {'id': 'b', 'name': 'B'}, 'codes': <Object>[]});
    }),
  )..deviceToken = 'dev';
  return (api: api, calls: calls);
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('the institution code comes from a college address', () {
    expect(tenantFromEmail('asha.cse@sdmcet.zynetix.in'), 'sdmcet');
    expect(tenantFromEmail('someone@gmail.com'), isNull);
    expect(tenantFromEmail('no-at-sign'), isNull);
  });

  test('login, then the teacher\'s token claims the board\'s code, then the board takes the session', () async {
    final s = _server();
    final r = await s.api.signInWithPassword(tenant: 'sdmcet', login: 'asha.cse@sdmcet.zynetix.in', password: 'zynetix123');
    expect(r.sessionToken, 'board-session');
    expect(r.session.teacherName, 'Asha Rao');
    expect(r.session.edition, 'board');
    expect(s.calls, [
      'POST /v1/auth/login -',
      'POST /v1/devices/me/pairing-codes Bearer dev',
      'POST /v1/pairing/claim Bearer user-token',
      'GET /v1/pairing/pending Bearer dev',
    ]);
    // The teacher's own token is never kept on the board.
    expect(s.api.sessionToken, isNull);
  });

  test('the set-up screen remembers the demo server address', () async {
    expect(await lastServerUrl(), isNull);
    await rememberServerUrl(' http://192.168.1.20:4000/ ');
    expect(await lastServerUrl(), 'http://192.168.1.20:4000');
  });

  test('two-factor accounts are sent to the Teacher app', () async {
    final s = _server(mfa: true);
    await expectLater(
      s.api.signInWithPassword(tenant: 'sdmcet', login: 'asha.cse@sdmcet.zynetix.in', password: 'zynetix123'),
      throwsA(isA<ApiException>().having((e) => e.code, 'code', 'MFA_REQUIRED')),
    );
  });

  testWidgets('the sign-in dialog offers email and password; a wrong password says so', (tester) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final s = _server();
    SessionContext? got;
    await tester.pumpWidget(
      MaterialApp(
        theme: KinetixTheme.light(),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(body: SignInDialog(api: s.api, boardName: 'CSE 301', pairPoll: const Duration(hours: 1), onPaired: (_, session) => got = session)),
      ),
    );
    await tester.pump();
    await tester.tap(find.byKey(const Key('signin-password')));
    await tester.pump();
    expect(find.byKey(const Key('pw-email')), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byKey(const Key('pw-submit'))).onPressed, isNull);

    await tester.enterText(find.byKey(const Key('pw-email')), 'asha.cse@sdmcet.zynetix.in');
    await tester.enterText(find.byKey(const Key('pw-password')), 'nope');
    await tester.pump();
    expect(tester.widget<TextField>(find.byKey(const Key('pw-tenant'))).controller!.text, 'sdmcet');
    await tester.tap(find.byKey(const Key('pw-submit')));
    await tester.pump();
    await tester.pump();
    expect(find.byKey(const Key('pw-error')), findsOneWidget);
    expect(got, isNull);

    await tester.enterText(find.byKey(const Key('pw-password')), 'zynetix123');
    await tester.pump();
    await tester.tap(find.byKey(const Key('pw-submit')));
    for (var i = 0; i < 6; i++) {
      await tester.pump();
    }
    expect(got?.teacherName, 'Asha Rao');
    expect((await SharedPreferences.getInstance()).getString('board.lastTenant'), 'sdmcet');
    await tester.pumpWidget(const SizedBox());
  });
}
