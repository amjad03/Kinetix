import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/core/realtime.dart';
import 'package:kinetix_board/features/board/board_screen.dart';
import 'package:kinetix_labs/kinetix_labs.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _NoRealtime extends Realtime {
  _NoRealtime() : super('http://test');
  @override
  void connect(String token) {}
  @override
  void dispose() {}
}

/// 3D models and labs open next to the whiteboard, offline and without signing in.
void main() {
  Future<BoardController> pump(WidgetTester tester, {Size size = const Size(1920, 1080)}) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final client = MockClient((req) async {
      if (req.url.path == '/v1/devices/enroll') return http.Response(jsonEncode({'deviceToken': 'dev', 'device': {'name': 'Board'}}), 201);
      return http.Response('[]', 200);
    });
    final board = BoardController(apiFactory: (url) => ApiClient(baseUrl: url, client: client), realtimeFactory: (_) => _NoRealtime(), outboxStore: MemoryOutboxStore());
    await tester.pumpWidget(MaterialApp(theme: KinetixTheme.light(), home: BoardScreen(board: board)));
    await tester.pumpAndSettle();
    return board;
  }

  Future<void> settle(WidgetTester tester) => tester.pump(const Duration(milliseconds: 400));

  Future<void> openSplit(WidgetTester tester) async {
    await tester.tap(find.byTooltip('Tools').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Split screen'));
    await tester.pumpAndSettle();
  }

  for (final size in [const Size(1920, 1080), const Size(1280, 720)]) {
    testWidgets('split screen: pick a 3D solid and see its measurements (${size.width.toInt()}×${size.height.toInt()})', (tester) async {
      final board = await pump(tester, size: size);
      await openSplit(tester);
      await tester.tap(find.byKey(const Key('split-model3d')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('catalogue-model3d')), findsOneWidget);
      await tester.scrollUntilVisible(find.byKey(const Key('pick-solid.cone')), 200, scrollable: find.descendant(of: find.byKey(const Key('catalogue-model3d')), matching: find.byType(Scrollable)).first);
      await tester.tap(find.byKey(const Key('pick-solid.cone')));
      await settle(tester);
      expect(find.byType(SolidExplorer), findsOneWidget);
      // ⅓π·3²·4 with the default r = 3, h = 4 (below the fold in the narrower 720p pane).
      if (size.width >= 1920) expect(find.textContaining('37.70'), findsWidgets);
      expect(tester.takeException(), isNull);

      // Back to the list, then a lab.
      await tester.tap(find.byTooltip('Choose something else'));
      await settle(tester);
      expect(find.byKey(const Key('catalogue-model3d')), findsOneWidget);
      board.dispose();
    });
  }

  testWidgets('the AI panel opens the graph plotter, 3D models and simulations', (tester) async {
    final board = await pump(tester);
    await tester.tap(find.byKey(const Key('panel-ai')));
    await tester.pumpAndSettle();
    final tile = find.byKey(const Key('ai-open-lab.graph-plotter'));
    await tester.scrollUntilVisible(tile, 200, scrollable: find.byType(Scrollable).last);
    await tester.tap(tile);
    await settle(tester);
    expect(find.byType(LabView), findsOneWidget);
    expect(find.text('Graph plotter'), findsWidgets);
    board.dispose();
  });

  testWidgets("a bench lab goes on the board as its report (the lab's LabReport picture)", (tester) async {
    final board = await pump(tester);
    await openSplit(tester);
    await tester.tap(find.byKey(const Key('split-lab')));
    await tester.pumpAndSettle();
    final pick = find.byKey(const Key('pick-glass-slab'));
    await tester.scrollUntilVisible(pick, 200, scrollable: find.descendant(of: find.byKey(const Key('catalogue-lab')), matching: find.byType(Scrollable)).first);
    await tester.tap(pick);
    await settle(tester);
    expect(find.byType(LabScreen), findsOneWidget);
    final report = LabReport.findIn(tester.element(find.byType(LabView)));
    expect(report?.lab.id, 'glass-slab');
    await tester.runAsync(() async {
      await tester.tap(find.byKey(const Key('split-snapshot')));
      for (var i = 0; i < 50 && find.textContaining('Picture put on the board').evaluate().isEmpty; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 20));
        await tester.pump();
      }
    });
    await tester.pump();
    expect(find.textContaining('Picture put on the board'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
    board.dispose();
  });
}
