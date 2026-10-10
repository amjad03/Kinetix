// A teacher who taps a card at the reader beside the board is offered a one-touch sign-in.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/features/signin/sign_in_dialog.dart';
import 'package:kinetix_board/l10n/gen/app_localizations.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('a tap shows the teacher; confirming opens their session', (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    var tapped = false;
    final asked = <String>[];
    final api = ApiClient(
      baseUrl: 'http://cloud',
      client: MockClient((req) async {
        asked.add('${req.method} ${req.url.path}');
        if (req.url.path.endsWith('/pairing-codes')) {
          return http.Response(jsonEncode({'code': '482913', 'qrPayload': 'kinetix://pair?c=482913', 'expiresAt': DateTime.now().add(const Duration(minutes: 2)).toUtc().toIso8601String()}), 200);
        }
        if (req.url.path == '/v1/devices/teacher-tap') {
          return http.Response(jsonEncode({'present': true, 'signedIn': tapped ? {'name': 'Asha Rao', 'userId': 't1'} : null}), 200);
        }
        if (req.url.path == '/v1/pairing/tap-signin') {
          return http.Response(
            jsonEncode({
              'sessionToken': 'tok',
              'session': {'sessionId': 's1', 'expiresAt': DateTime.now().add(const Duration(hours: 1)).toUtc().toIso8601String(), 'teacher': {'id': 't1', 'fullName': 'Asha Rao', 'preferredLanguage': 'en'}},
            }),
            200,
          );
        }
        return http.Response(jsonEncode({'keyId': 'k', 'board': {'id': 'b', 'name': 'B'}, 'codes': <Object>[]}), 200);
      }),
    )..deviceToken = 'dev';
    String? gotToken;
    SessionContext? gotSession;
    await tester.pumpWidget(
      MaterialApp(
        theme: KinetixTheme.light(),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: SignInDialog(api: api, boardName: 'Room 1', tapPoll: const Duration(milliseconds: 100), onTapSignIn: (t, s) {
            gotToken = t;
            gotSession = s;
          }),
        ),
      ),
    );
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 150)));
    await tester.pump(const Duration(milliseconds: 150));
    expect(find.byKey(const Key('tap-signin')), findsNothing); // nobody has tapped yet

    tapped = true;
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 150)));
    await tester.pump(const Duration(milliseconds: 150));
    expect(find.byKey(const Key('tap-signin')), findsOneWidget);
    expect(find.text('Asha Rao tapped at this board'), findsOneWidget);

    await tester.tap(find.text('Continue as Asha Rao'));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
    await tester.pump();
    expect(asked, contains('POST /v1/pairing/tap-signin'));
    expect(gotToken, 'tok');
    expect(gotSession?.teacherName, 'Asha Rao');
    await tester.pumpWidget(const SizedBox());
  });
}
