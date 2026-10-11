// Realtime down (WebSocket blocked): the sign-in dialog still learns of a pairing by polling.
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
  testWidgets('polling opens the session when the realtime push never arrives', (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    var claimed = false;
    final api = ApiClient(
      baseUrl: 'http://cloud',
      client: MockClient((req) async {
        if (req.url.path.endsWith('/pairing-codes')) {
          return http.Response(jsonEncode({'code': '482913', 'qrPayload': 'kinetix://pair?c=482913', 'expiresAt': DateTime.now().add(const Duration(minutes: 2)).toUtc().toIso8601String()}), 200);
        }
        if (req.url.path == '/v1/pairing/pending') {
          if (!claimed) return http.Response(jsonEncode({'pending': null}), 200);
          return http.Response(
            jsonEncode({
              'pending': {
                'sessionToken': 'tok',
                'session': {'sessionId': 's1', 'expiresAt': DateTime.now().add(const Duration(hours: 1)).toUtc().toIso8601String(), 'teacher': {'id': 't1', 'fullName': 'Asha Rao', 'preferredLanguage': 'en'}},
              },
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
          body: SignInDialog(api: api, boardName: 'Room 1', pairPoll: const Duration(milliseconds: 100), onPaired: (t, s) {
            gotToken = t;
            gotSession = s;
          }),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 150));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
    await tester.pump();
    expect(gotToken, isNull);

    claimed = true;
    await tester.pump(const Duration(milliseconds: 150));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
    await tester.pump();
    expect(gotToken, 'tok');
    expect(gotSession?.teacherName, 'Asha Rao');
    await tester.pumpWidget(const SizedBox());
  });
}
