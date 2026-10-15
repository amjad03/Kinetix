import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:zynetix_board/core/api_client.dart';
import 'package:zynetix_board/core/board_controller.dart';
import 'package:zynetix_board/core/device_store.dart';
import 'package:zynetix_board/core/outbox_store.dart';
import 'package:zynetix_board/core/secret_store.dart';
import 'package:zynetix_board/features/enrollment/enroll_screen.dart';
import 'package:zynetix_board/features/enrollment/set_up_again.dart';
import 'package:zynetix_board/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';
import 'support/fake_cloud.dart';

/// Board settings → This board → Set up again: a board taken to another network or server (a
/// demo at another school, a new Wi-Fi) can be pointed at the new address.
void main() {
  setUpAll(loadBoardFonts);

  /// A board registered as Room 113 Board with a server on the LAN; [kiosk] is its school's policy.
  Future<BoardController> registered({bool kiosk = false}) async {
    SharedPreferences.setMockInitialValues({'server_url': 'http://192.168.31.129:4000', 'device_name': 'Room 113 Board', 'setting.language': 'kn'});
    final client = MockClient(
      (req) async => req.url.path == '/v1/devices/me/config'
          ? http.Response(jsonEncode({'kiosk': {'enabled': kiosk}, 'locked': false}), 200, headers: {'content-type': 'application/json'})
          : http.Response('{}', 200, headers: {'content-type': 'application/json'}),
    );
    final board = BoardController(
      store: DeviceStore(secrets: MemorySecretStore({'device_token': 'dev'})),
      apiFactory: (url) => ApiClient(baseUrl: url, client: client),
      realtimeFactory: (_) => NoRealtime(),
      outboxStore: MemoryOutboxStore(),
    );
    await board.start();
    await pumpEventQueue();
    return board;
  }

  test('Set up again forgets the server and the token, signs out and keeps the settings', () async {
    final board = await registered();
    board.onPaired('session-token', sessionIn('en'));
    expect(board.serverUrl, 'http://192.168.31.129:4000');
    await board.setUpAgain();
    expect(board.stage, BoardStage.needsEnrollment);
    expect(board.isEnrolled, isFalse);
    expect(board.isSignedIn, isFalse);
    final saved = await DeviceStore(secrets: MemorySecretStore()).load();
    expect((saved.server, saved.name), (null, null));
    expect((await SharedPreferences.getInstance()).getString('setting.language'), 'kn');
    board.dispose();
  });

  testWidgets('This board shows the server; Set up again asks first', (tester) async {
    await loadBoardFonts();
    final board = (await tester.runAsync(() => registered()))!;
    await tester.pumpWidget(localized('en', Scaffold(body: ThisBoardSection(board: board))));
    expect(find.text('Registered as Room 113 Board with http://192.168.31.129:4000'), findsOneWidget);
    await tester.tap(find.byKey(const Key('set-up-again')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('set-up-again-dialog')), findsOneWidget);
    expect(find.textContaining('stops using http://192.168.31.129:4000'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(board.stage, BoardStage.board);
    expect(board.isEnrolled, isTrue);
    board.dispose();
  });

  testWidgets('in kiosk mode Set up again waits for IT', (tester) async {
    await loadBoardFonts();
    final board = (await tester.runAsync(() => registered(kiosk: true)))!;
    await tester.pumpWidget(localized('hi', Scaffold(body: ThisBoardSection(board: board))));
    expect(tester.widget<OutlinedButton>(find.byKey(const Key('set-up-again'))).onPressed, isNull);
    expect(find.textContaining('IT PIN'), findsOneWidget);
    board.dispose();
  });

  testWidgets('from Board settings on a panel the board goes back to its set-up screen', (tester) async {
    screenSize(tester, const Size(1920, 1080));
    SharedPreferences.setMockInitialValues({});
    final board = (await tester.runAsync(() => enrolledBoard(store: DeviceStore(secrets: MemorySecretStore()))))!;
    await tester.pumpWidget(ZynetixBoardApp(controller: board));
    await tester.pumpAndSettle();
    if (find.text('Not now').evaluate().isNotEmpty) {
      await tester.tap(find.text('Not now'));
      await tester.pumpAndSettle();
    }
    await tester.tap(find.byKey(const Key('board-menu')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('menu-settings')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('menu-settings')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('set-up-again')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('set-up-again')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('set-up-again-confirm')));
    await tester.pumpAndSettle();
    expect(board.stage, BoardStage.needsEnrollment);
    expect(find.byType(EnrollScreen), findsOneWidget);
    expect(find.byKey(const Key('board-settings')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  test('a Mac keeps the device token in the login keychain (an ad-hoc signed app has no data protection keychain)', () {
    expect(OsSecretStore.macOptions.usesDataProtectionKeychain, isFalse);
  });

  testWidgets('a board whose key was not kept opens the set-up screen with its server filled in', (tester) async {
    await loadBoardFonts();
    SharedPreferences.setMockInitialValues({'server_url': 'http://localhost:4000', 'device_name': 'Room 104 Board'});
    final board = BoardController(
      store: DeviceStore(secrets: MemorySecretStore()),
      apiFactory: (url) => ApiClient(baseUrl: url, client: MockClient((_) async => http.Response('{}', 200))),
      realtimeFactory: (_) => NoRealtime(),
      outboxStore: MemoryOutboxStore(),
    );
    await tester.runAsync(() async {
      await board.start();
      await pumpEventQueue();
    });
    expect(board.stage, BoardStage.needsEnrollment);
    expect(board.lostKeyServer, 'http://localhost:4000');
    await tester.pumpWidget(localized('en', EnrollScreen(controller: board)));
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(find.byKey(const Key('enroll-server'))).controller!.text, 'http://localhost:4000');
    expect(find.byKey(const Key('enroll-key-lost')), findsOneWidget);
    expect(find.textContaining('did not keep its key'), findsOneWidget);
    await tester.pumpWidget(localized('kn', EnrollScreen(key: const ValueKey('kn'), controller: board)));
    await tester.pumpAndSettle();
    expect(find.textContaining('http://localhost:4000'), findsWidgets);
    expect(tester.takeException(), isNull);
    board.dispose();
  });

  test('a first start has no lost-key note', () async {
    SharedPreferences.setMockInitialValues({});
    final board = BoardController(
      store: DeviceStore(secrets: MemorySecretStore()),
      apiFactory: (url) => ApiClient(baseUrl: url, client: MockClient((_) async => http.Response('{}', 200))),
      realtimeFactory: (_) => NoRealtime(),
      outboxStore: MemoryOutboxStore(),
    );
    await board.start();
    await pumpEventQueue();
    expect(board.stage, BoardStage.needsEnrollment);
    expect(board.lostKeyServer, isNull);
    board.dispose();
  });
}
