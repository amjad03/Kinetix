// The sign-in dialog keeps signed codes while the cloud answers and shows one as a QR when it does not.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/offline_codes.dart';
import 'package:kinetix_board/features/signin/sign_in_dialog.dart';
import 'package:kinetix_board/l10n/gen/app_localizations.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  Future<void> pumpDialog(WidgetTester tester, ApiClient api) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        theme: KinetixTheme.light(),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(body: SignInDialog(api: api, boardName: 'Room 1 Board')),
      ),
    );
    await tester.pump(const Duration(milliseconds: 50));
  }

  Map<String, dynamic> windowJson(int i, DateTime from) => OfflineCode(
    token: 'KXO1.payload$i.sig$i',
    validFrom: from.add(Duration(minutes: 15 * i)),
    validUntil: from.add(Duration(minutes: 15 * (i + 1))),
  ).toJson();

  testWidgets('while online it keeps a day of signed codes for later', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final from = DateTime.now().toUtc();
    final asked = <String>[];
    final api = ApiClient(
      baseUrl: 'http://cloud',
      client: MockClient((req) async {
        asked.add(req.url.path);
        if (req.url.path.endsWith('/pairing-codes')) {
          return http.Response(jsonEncode({'code': '482913', 'qrPayload': 'kinetix://pair?c=482913', 'expiresAt': DateTime.now().add(const Duration(minutes: 2)).toUtc().toIso8601String()}), 200);
        }
        return http.Response(jsonEncode({'keyId': 'k', 'board': {'id': 'b', 'name': 'Room 1 Board'}, 'codes': [for (var i = 0; i < 96; i++) windowJson(i, from)]}), 200);
      }),
    )..deviceToken = 'dev';
    await pumpDialog(tester, api);
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 200)));
    await tester.pump();
    expect(find.byKey(const Key('pairing-code')), findsOneWidget);
    expect(asked, contains('/v1/pairing/offline-codes'));
    final saved = await tester.runAsync(OfflineCodes.load);
    expect(saved, hasLength(96));
    expect(find.byKey(const Key('offline-qr')), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('with no connection it shows the current signed code as a QR', (tester) async {
    final now = DateTime.now().toUtc();
    SharedPreferences.setMockInitialValues({
      'offline.codes': jsonEncode([
        OfflineCode(token: 'KXO1.now.sig', validFrom: now.subtract(const Duration(minutes: 5)), validUntil: now.add(const Duration(minutes: 10))).toJson(),
      ]),
    });
    final api = ApiClient(baseUrl: 'http://cloud', client: MockClient((req) async => throw const SocketException('offline')))..deviceToken = 'dev';
    await pumpDialog(tester, api);
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 200)));
    await tester.pump();
    expect(find.byKey(const Key('offline-qr')), findsOneWidget);
    expect(find.byKey(const Key('offline-note')), findsOneWidget);
    expect(find.textContaining('Scan this code in the KINETIX Teacher app'), findsOneWidget);
    // Close the dialog so its refresh timer is cancelled.
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('with no connection and nothing cached it just waits for the cloud', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final api = ApiClient(baseUrl: 'http://cloud', client: MockClient((req) async => throw const SocketException('offline')))..deviceToken = 'dev';
    await pumpDialog(tester, api);
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 200)));
    await tester.pump();
    expect(find.byKey(const Key('offline-qr')), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
}
