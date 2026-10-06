import 'dart:convert';
import 'dart:io';

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
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'support/layout.dart';

class _NoRealtime extends Realtime {
  _NoRealtime() : super('http://test');
  @override
  void connect(String token) {}
  @override
  void dispose() {}
}

/// The three.js models open in the split screen (against a fake viewer page: there is no
/// WebView under test).
void main() {
  setUp(() {
    Viewer3dEngine.debugOverride = FakeViewerEngine.new;
    ViewerManifest.debugLoad = (id) async =>
        ViewerManifest.fromJson(jsonDecode(File('../../packages/kinetix_3d/assets/viewer3d/models/$id.json').readAsStringSync()) as Map<String, dynamic>);
  });
  tearDown(() {
    Viewer3dEngine.debugOverride = null;
    ViewerManifest.debugLoad = null;
  });

  testWidgets('split screen: the heart opens in the 3D viewer, with labels and the laser', (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final client = MockClient((req) async {
      if (req.url.path == '/v1/devices/enroll') return http.Response(jsonEncode({'deviceToken': 'dev', 'device': {'name': 'Board'}}), 201);
      return http.Response('[]', 200);
    });
    final board = BoardController(apiFactory: (url) => ApiClient(baseUrl: url, client: client), realtimeFactory: (_) => _NoRealtime(), outboxStore: MemoryOutboxStore());
    await tester.pumpWidget(MaterialApp(theme: KinetixTheme.light(), home: BoardScreen(board: board)));
    await tester.pumpAndSettle();

    await tapBoard(tester, 'panel-tab-model3d');
    // The prototype's models are in the list under their old ids, and the new ones too.
    final list = find.descendant(of: find.byKey(const Key('catalogue-model3d')), matching: find.byType(Scrollable)).first;
    await tester.scrollUntilVisible(find.byKey(const Key('pick-orbitals')), 300, scrollable: list);
    await tester.scrollUntilVisible(find.byKey(const Key('pick-heart')), -300, scrollable: list);
    await tester.tap(find.byKey(const Key('pick-heart')));
    await tester.pump();
    await tester.pump();

    final viewer = FakeViewerEngine.last!;
    expect(viewer.opened, ['heart:en']);
    expect(find.byType(Model3dViewer), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('labels-all')));
    await tester.pump();
    expect(viewer.lastOf('labels')!['mode'], 'all');
    await tester.tap(find.byKey(const ValueKey('model3d-laser')));
    await tester.pump();
    expect(find.byKey(const ValueKey('model3d-laser-layer')), findsOneWidget);
    expect(tester.takeException(), isNull);

    // Back to the list.
    await tester.tap(find.byTooltip('Choose something else'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byKey(const Key('catalogue-model3d')), findsOneWidget);
    board.dispose();
  });
}
