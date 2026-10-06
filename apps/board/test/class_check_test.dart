import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/realtime.dart';
import 'package:kinetix_board/demo/demo.dart';
import 'package:kinetix_board/demo/demo_server.dart';
import 'package:kinetix_board/features/class_check/class_check_panel.dart';
import 'package:kinetix_board/main.dart';
import 'package:kinetix_cards/kinetix_cards.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// "Ask the class" and the phone remote on the demo board: students with phones answer in the
/// (simulated) Student App, the rest hold up answer cards read from a photo; the teacher's phone
/// turns pages, starts the timer and points.
void main() {
  setUp(() {
    Demo.enabled = true;
    SharedPreferences.setMockInitialValues({});
  });
  tearDown(() => Demo.enabled = false);

  late DemoBoardServer server;
  late BoardController board;

  Future<void> pump(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    server = DemoBoardServer(claimDelay: const Duration(seconds: 2))..studentAnswerDelay = const Duration(seconds: 3);
    board = demoBoard(server);
    board.setToolbarDock(ToolbarDock.left);
    await tester.pumpWidget(KinetixBoardApp(controller: board));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('conceptVideoSkip')));
    await tester.pumpAndSettle();
  }

  Future<void> tap(WidgetTester tester, Finder f) async {
    await tester.ensureVisible(f);
    await tester.pumpAndSettle();
    await tester.tap(f);
    await tester.pumpAndSettle();
  }

  testWidgets('ask the class: app answers arrive live, cards from a photo join them, results go on the board', (tester) async {
    await pump(tester);
    // Two cards in the photo: card 1 (Aarav) holds up B, card 2 (Ananya) holds up D.
    pickClassPhoto = () async => Uint8List(1);
    readClassPhoto = (_) async => const [CardSeen(1, 1, 0, []), CardSeen(2, 3, 0, [])];

    await tap(tester, find.byKey(const Key('tool-tools')));
    await tap(tester, find.text('Ask the class'));
    await tester.enterText(find.byKey(const Key('ask-question')), 'Which share is redeemable?');
    await tap(tester, find.byKey(const Key('ask-correct-1')));
    await tap(tester, find.byKey(const Key('ask-start')));
    expect(find.text('Which share is redeemable?'), findsOneWidget);
    expect(find.text('0 of 12 answered'), findsOneWidget);
    expect(find.text('Live in the Student App'), findsOneWidget);
    expect(server.requests.where((r) => r.startsWith('PUT /v1/polls/')), hasLength(1));

    // Four students answer in the Student App (simulated by the demo server).
    await tester.pump(const Duration(seconds: 13));
    await tester.pumpAndSettle();
    expect(find.text('4 of 12 answered'), findsOneWidget);

    await tap(tester, find.byKey(const Key('poll-scan')));
    expect(find.text('6 of 12 answered'), findsOneWidget);
    expect(find.textContaining('2 cards read.'), findsOneWidget);
    expect(server.requests.where((r) => r.endsWith('/cards')), hasLength(1));

    await tap(tester, find.byKey(const Key('poll-reveal')));
    await tap(tester, find.byKey(const Key('poll-end')));
    expect(find.text('Question ended'), findsOneWidget);
    expect(server.requests.where((r) => r.endsWith('/close')), hasLength(1));

    await tester.runAsync(() async {
      await tester.tap(find.byKey(const Key('poll-put')));
      await Future<void>.delayed(const Duration(milliseconds: 200));
    });
    await tester.pumpAndSettle();
    final canvas = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas));
    expect(canvas.controller.elements.whereType<ImageElement>(), hasLength(1));

    await tap(tester, find.byKey(const Key('poll-dismiss')));
    expect(find.text('Question ended'), findsNothing);
    await tester.pumpWidget(const SizedBox());
    board.dispose();
  });

  testWidgets('the phone remote turns pages, starts the timer, points and hears back the board state', (tester) async {
    await pump(tester);
    final canvas = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas));
    final wb = canvas.controller;

    void command(Map<String, dynamic> c) => server.realtime.fire(RealtimeEvents.remoteCommand, c);
    command({'type': 'hello'});
    await tester.pumpAndSettle();
    expect(find.text('Phone remote connected.'), findsOneWidget);
    expect(server.realtime.sent.last.$2, containsPair('page', 0));

    command({'type': 'page.next'});
    await tester.pumpAndSettle();
    expect(wb.pageCount, 2);
    expect(wb.pageIndex, 1);
    expect(server.realtime.sent.last.$2, allOf(containsPair('page', 1), containsPair('pages', 2)));
    command({'type': 'page.previous'});
    await tester.pumpAndSettle();
    expect(wb.pageIndex, 0);

    command({'type': 'timer.start', 'seconds': 120});
    await tester.pumpAndSettle();
    expect(find.text('02:00'), findsOneWidget);
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('01:59'), findsOneWidget);
    expect(server.realtime.sent.last.$2, containsPair('timerRunning', true));
    command({'type': 'timer.stop'});
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('countdown-text')), findsNothing);

    command({'type': 'pointer', 'x': 0.5, 'y': 0.5});
    await tester.pump();
    await tester.pump();
    expect(find.byKey(const Key('remote-pointer')), findsOneWidget);
    await tester.pump(const Duration(seconds: 4));
    expect(find.byKey(const Key('remote-pointer')), findsNothing);

    command({'type': 'picker.pick'});
    await tester.pumpAndSettle();
    // The name picker card opens and picks (the toolkit, features/toolkit).
    expect(find.byKey(const Key('toolkit-picker')), findsOneWidget);
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpWidget(const SizedBox());
    board.dispose();
  });
}
