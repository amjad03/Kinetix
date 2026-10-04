import 'dart:convert';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/core/realtime.dart';
import 'package:kinetix_board/features/board/board_screen.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A realtime connection the test drives: server events in, board events out.
class FakeRealtime extends Realtime {
  FakeRealtime() : super('http://test');
  final handlers = <String, void Function(Map<String, dynamic>)>{};
  final sent = <(String, Object)>[];

  @override
  void on(String event, void Function(Map<String, dynamic>) handler) => handlers[event] = handler;
  @override
  void connect(String token) {}
  @override
  void emit(String event, Object data) => sent.add((event, data));
  @override
  void dispose() {}

  void server(String event, [Map<String, dynamic> data = const {}]) => handlers[event]!(data);
  List<List<dynamic>> get frames => [for (final (e, d) in sent) if (e == RealtimeEvents.liveFrame) ...((d as Map)['events'] as List).cast<List<dynamic>>()];
}

void main() {
  late FakeRealtime rt;
  late BoardController board;

  Future<void> pump(WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final client = MockClient((req) async {
      if (req.url.path == '/v1/devices/enroll') return http.Response(jsonEncode({'deviceToken': 'dev', 'device': {'name': 'Room 204 Board'}}), 201);
      return http.Response('[]', 200);
    });
    rt = FakeRealtime();
    board = BoardController(apiFactory: (url) => ApiClient(baseUrl: url, client: client), realtimeFactory: (_) => rt, outboxStore: MemoryOutboxStore());
    await board.enroll('http://test', 'KX-AAAA-BBBB');
    board.onPaired(
      'session-token',
      SessionContext(
        sessionId: 's1',
        expiresAt: DateTime.now().add(const Duration(hours: 1)),
        teacherId: 't1',
        teacherName: 'Anita Sharma',
        language: 'en',
        sectionName: 'BCom Sem 3 A',
        subjectName: 'Corporate Accounting',
      ),
    );
    await tester.pumpWidget(MaterialApp(theme: KinetixTheme.light(), home: BoardScreen(board: board)));
    await tester.pumpAndSettle();
  }

  Future<void> draw(WidgetTester tester, Offset at) async {
    final g = await tester.startGesture(at, pointer: 9, kind: PointerDeviceKind.touch);
    for (var i = 0; i < 5; i++) {
      await g.moveBy(const Offset(30, 10));
    }
    await g.up();
    await tester.pump(const Duration(milliseconds: 200));
  }

  testWidgets('streams the board only while someone watches, and shows that it is being viewed', (tester) async {
    await pump(tester);
    await draw(tester, const Offset(400, 400));
    expect(rt.frames, isEmpty);
    expect(find.byKey(const Key('being-viewed')), findsNothing);

    rt.server(RealtimeEvents.liveViewers, {'count': 1, 'indicator': true});
    rt.server(RealtimeEvents.liveSnapshotRequest);
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('Being viewed'), findsOneWidget);

    // The viewer rebuilds exactly what is on the board, then follows new strokes.
    await draw(tester, const Offset(400, 600));
    final viewer = LessonPlayer.live()..applyLive(rt.frames);
    expect(viewer.strokes, hasLength(2));

    rt.server(RealtimeEvents.liveViewers, {'count': 0, 'indicator': true});
    await tester.pump();
    final before = rt.frames.length;
    await draw(tester, const Offset(400, 800));
    expect(rt.frames.length, before);
    expect(find.byKey(const Key('being-viewed')), findsNothing);
    board.dispose();
  });

  testWidgets('the institution can hide the indicator', (tester) async {
    await pump(tester);
    rt.server(RealtimeEvents.liveViewers, {'count': 2, 'indicator': false});
    rt.server(RealtimeEvents.liveSnapshotRequest);
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.byKey(const Key('being-viewed')), findsNothing);
    expect(rt.frames, isNotEmpty); // still streaming
    rt.server(RealtimeEvents.liveViewers, {'count': 0, 'indicator': false});
    await tester.pump();
    board.dispose();
  });
}
