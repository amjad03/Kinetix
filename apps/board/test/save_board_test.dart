import 'dart:convert';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/core/realtime.dart';
import 'package:kinetix_board/features/board/board_screen.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'support/layout.dart';

/// A realtime connection that never connects; the tests drive the controller directly.
class _NoRealtime extends Realtime {
  _NoRealtime() : super('http://test');
  @override
  void connect(String token) {}
  @override
  void dispose() {}
}

void main() {
  late List<http.Request> requests;
  late BoardController board;

  Map<String, dynamic> summary(Map<String, dynamic> body, String id) => {
        'id': id,
        'title': body['title'],
        'pageCount': (body['pages'] as List).length,
        'updatedAt': DateTime.now().toIso8601String(),
        'sectionName': 'BCom Sem 3 A',
        'subjectName': 'Corporate Accounting',
        'sharedAt': body['share'] == true ? DateTime.now().toIso8601String() : null,
      };

  Future<void> pump(WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    requests = [];
    final client = MockClient((req) async {
      requests.add(req);
      if (req.url.path == '/v1/devices/enroll') {
        return http.Response(jsonEncode({'deviceToken': 'dev', 'device': {'name': 'Room 204 Board'}}), 201);
      }
      if (req.method == 'PUT' && req.url.path.startsWith('/v1/whiteboards/')) {
        return http.Response(jsonEncode(summary(jsonDecode(req.body) as Map<String, dynamic>, req.url.pathSegments.last)), 200);
      }
      if (req.url.path == '/v1/sessions/current/end') return http.Response('{"ended":true}', 201);
      return http.Response('[]', 200);
    });
    board = BoardController(apiFactory: (url) => ApiClient(baseUrl: url, client: client), realtimeFactory: (_) => _NoRealtime());
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

  Future<void> drawLine(WidgetTester tester) async {
    final g = await tester.startGesture(const Offset(400, 400), pointer: 7, kind: PointerDeviceKind.touch);
    for (var i = 0; i < 5; i++) {
      await g.moveBy(const Offset(30, 10));
    }
    await g.up();
    await tester.pump();
  }

  Map<String, dynamic> lastSave() => jsonDecode(requests.lastWhere((r) => r.method == 'PUT').body) as Map<String, dynamic>;

  testWidgets('Save sends the pages, canvas size and title, and shares with the class', (tester) async {
    await pump(tester);
    await drawLine(tester);
    await tapBoard(tester, 'save-board');
    await tester.pumpAndSettle();
    expect(find.text('Save board'), findsOneWidget);
    expect(tester.widget<TextField>(find.byKey(const Key('save-title'))).controller!.text, startsWith('Corporate Accounting · '));

    await tester.tap(find.byKey(const Key('save-confirm')));
    await tester.pumpAndSettle();
    final body = lastSave();
    expect(body['share'], isTrue);
    // The board's size on screen: narrower while the save dialog shows in the split panel.
    expect(body['canvas']['h'], 1080);
    expect(body['canvas']['w'], inInclusiveRange(1000, 1920));
    expect((body['pages'] as List).single['strokes'], hasLength(1));
    expect(find.text('Saved and shared with BCom Sem 3 A.'), findsOneWidget);

    // Saving again goes to the same board id.
    final firstId = requests.lastWhere((r) => r.method == 'PUT').url.pathSegments.last;
    await tapBoard(tester, 'save-board');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('save-confirm')));
    await tester.pumpAndSettle();
    expect(requests.where((r) => r.method == 'PUT').map((r) => r.url.pathSegments.last).toSet(), {firstId});
    board.dispose();
  });

  testWidgets('End class saves and shares the board, then signs out', (tester) async {
    await pump(tester);
    await drawLine(tester);
    await tapBoard(tester, 'end-class');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('end-save')), findsOneWidget);
    await tester.tap(find.byKey(const Key('confirm-end')));
    await tester.pumpAndSettle();

    expect(lastSave()['share'], isTrue);
    expect(requests.last.url.path, '/v1/sessions/current/end');
    expect(board.isSignedIn, isFalse);
    expect(find.byTooltip('Undo'), findsOneWidget); // the board is still there, cleared
    board.dispose();
  });

  testWidgets('a blank board ends class without asking to save', (tester) async {
    await pump(tester);
    await tapBoard(tester, 'end-class');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('end-save')), findsNothing);
    await tester.tap(find.byKey(const Key('confirm-end')));
    await tester.pumpAndSettle();
    expect(requests.where((r) => r.method == 'PUT'), isEmpty);
    board.dispose();
  });

  testWidgets('guests are told to sign in before saving', (tester) async {
    await pump(tester);
    await board.endClass();
    await tester.pumpAndSettle();
    await drawLine(tester);
    await tapBoard(tester, 'save-board');
    await tester.pumpAndSettle();
    expect(find.textContaining('Sign in with the Teacher app to save'), findsOneWidget);
    board.dispose();
  });
}
