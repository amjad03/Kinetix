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
import 'package:kinetix_board/core/recording/recordings.dart';
import 'package:kinetix_board/features/board/board_screen.dart';
import 'package:kinetix_board/features/recording/recording_ui.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/recording_fakes.dart';
import 'support/layout.dart';

class _NoRealtime extends Realtime {
  _NoRealtime() : super('http://test');
  @override
  void connect(String token) {}
  @override
  void dispose() {}
}

void main() {
  late FakeRecordingsApi server;
  late List<http.Request> requests;
  late MemoryRecordingStore store;
  late FakeVoiceRecorder voice;
  late BoardController board;

  SessionContext session() => SessionContext(
    sessionId: 's1',
    expiresAt: DateTime.now().add(const Duration(hours: 1)),
    teacherId: 't1',
    teacherName: 'Anita Sharma',
    language: 'en',
    sectionName: 'BCom Sem 3 A',
    subjectName: 'Corporate Accounting',
  );

  Future<void> pump(WidgetTester tester, {String? noMicrophone, bool signIn = true}) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    server = FakeRecordingsApi();
    requests = [];
    store = MemoryRecordingStore();
    voice = FakeVoiceRecorder(store: store, unavailable: noMicrophone);
    final client = MockClient((req) async {
      requests.add(req);
      final r = await server.handle(req);
      if (r != null) return r;
      if (req.url.path == '/v1/devices/enroll') {
        return http.Response(
          jsonEncode({
            'deviceToken': 'dev',
            'device': {'name': 'Room 204 Board'},
          }),
          201,
        );
      }
      if (req.url.path == '/v1/sessions/current/end') return http.Response('{"ended":true}', 201);
      return http.Response('[]', 200);
    });
    board = BoardController(
      apiFactory: (url) => ApiClient(baseUrl: url, client: client),
      realtimeFactory: (_) => _NoRealtime(),
      recordings: Recordings(store: store, voice: () => voice),
    );
    await board.enroll('http://test', 'KX-AAAA-BBBB');
    if (signIn) board.onPaired('session-token', session());
    await tester.pumpWidget(
      MaterialApp(
        theme: KinetixTheme.light(),
        home: BoardScreen(board: board),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> drawLine(WidgetTester tester, {Offset at = const Offset(400, 400)}) async {
    final g = await tester.startGesture(at, pointer: 7, kind: PointerDeviceKind.touch);
    for (var i = 0; i < 5; i++) {
      await g.moveBy(const Offset(30, 10));
    }
    await g.up();
    await tester.pump();
  }

  /// Lets the recording run: the indicator ticks, so pumpAndSettle would never settle.
  Future<void> wait(WidgetTester tester, [Duration d = const Duration(seconds: 1)]) async {
    await tester.pump(d);
    await tester.pump(const Duration(milliseconds: 400)); // let snack bars and dialogs animate
  }

  Map<String, dynamic> eventLog() =>
      jsonDecode(utf8.decode(server.requests.firstWhere((r) => r.url.path.endsWith('/events')).bodyBytes)) as Map<String, dynamic>;

  test('elapsed time reads mm:ss, with hours past an hour', () {
    expect(formatElapsed(const Duration(seconds: 65)), '01:05');
    expect(formatElapsed(const Duration(hours: 1, minutes: 2, seconds: 5)), '1:02:05');
    expect(defaultRecordingTitle('Corporate Accounting', DateTime(2026, 10, 5)), 'Corporate Accounting · 5 Oct');
  });

  testWidgets('a guest board explains that the teacher must sign in to record', (tester) async {
    await pump(tester, signIn: false);
    await tester.tap(find.byKey(const Key('record')));
    await tester.pump();
    expect(find.textContaining('Sign in with the Teacher app to record lessons'), findsOneWidget);
    expect(find.byKey(const Key('rec-indicator')), findsNothing);
    expect(voice.calls, isEmpty);
    board.dispose();
  });

  testWidgets('record, pause, turn a page, change the background, stop, save and share: it uploads', (tester) async {
    await pump(tester);
    await tester.tap(find.byKey(const Key('record')));
    await wait(tester);
    expect(find.byKey(const Key('rec-indicator')), findsOneWidget);
    expect(find.text('Recording the board and your voice.'), findsOneWidget);

    await drawLine(tester);
    await wait(tester);
    expect(tester.widget<Text>(find.byKey(const Key('rec-time'))).data, matches(RegExp(r'^\d\d:\d\d$')));

    await tester.tap(find.byKey(const Key('rec-pause')));
    await wait(tester);
    expect(find.text('Paused'), findsOneWidget);
    await tester.tap(find.byKey(const Key('rec-pause')));
    await wait(tester);
    expect(voice.calls, ['start', 'pause', 'resume']);

    // A new page, and the chalkboard background.
    await tester.tap(find.byKey(const Key('add-page')));
    await tester.pump();
    await tapBoard(tester, 'tool-theme');
    await wait(tester);
    await tester.tap(find.text('Chalkboard'));
    await wait(tester);
    await tester.tapAt(const Offset(1300, 150)); // close the popover
    await wait(tester);
    await drawLine(tester, at: const Offset(600, 500));

    await tester.tap(find.byKey(const Key('rec-stop')));
    await wait(tester);
    expect(find.text('Save lesson recording'), findsOneWidget);
    expect(tester.widget<TextField>(find.byKey(const Key('rec-title'))).controller!.text, startsWith('Corporate Accounting · '));
    expect(tester.widget<SwitchListTile>(find.byKey(const Key('rec-share'))).value, isTrue);
    await tester.enterText(find.byKey(const Key('rec-title')), 'Depreciation methods');
    await tester.tap(find.byKey(const Key('rec-save')));
    await tester.pumpAndSettle();

    expect(server.steps, ['PUT create', 'PUT events', 'PUT audio', 'POST finish']);
    expect(jsonDecode(server.requests.first.body)['title'], 'Depreciation methods');
    expect(jsonDecode(server.requests.last.body)['share'], isTrue);
    final kinds = (eventLog()['events'] as List).map((e) => (e as List)[1]).toList();
    expect(kinds, containsAllInOrder(['L', 'b', 'e', 'n', 'k', 'b', 'e']));
    expect(eventLog()['canvas'], {'w': 1920, 'h': 1080});
    expect(store.events, isEmpty, reason: 'media is deleted after upload');
    expect(find.byKey(const Key('rec-indicator')), findsNothing);

    // The Recordings list shows it as shared.
    await tester.tap(find.byKey(const Key('profile-button')));
    await tester.pumpAndSettle();
    await tapBoard(tester, 'menu-recordings');
    await tester.pumpAndSettle();
    expect(find.text('Depreciation methods'), findsOneWidget);
    expect(find.descendant(of: find.byType(Chip), matching: find.text('Shared')), findsOneWidget);
    board.dispose();
  });

  testWidgets('without a microphone it records the board only, and says so once', (tester) async {
    await pump(tester, noMicrophone: 'no microphone found');
    await tester.tap(find.byKey(const Key('record')));
    await wait(tester);
    expect(find.text('Recording the board without sound: no microphone found'), findsOneWidget);
    await drawLine(tester);
    await tester.tap(find.byKey(const Key('rec-pause')));
    await tester.tap(find.byKey(const Key('rec-pause')));
    await wait(tester);
    expect(voice.calls, ['start'], reason: 'the microphone is left alone after it failed');
    await tester.tap(find.byKey(const Key('rec-stop')));
    await wait(tester);
    expect(find.textContaining('board only, no sound'), findsOneWidget);
    await tester.tap(find.byKey(const Key('rec-save')));
    await tester.pumpAndSettle();
    expect(server.steps, ['PUT create', 'PUT events', 'POST finish']);
    board.dispose();
  });

  testWidgets('discarding asks first and deletes the recording', (tester) async {
    await pump(tester);
    await tester.tap(find.byKey(const Key('record')));
    await wait(tester);
    await tester.tap(find.byKey(const Key('rec-stop')));
    await wait(tester);
    await tester.tap(find.byKey(const Key('rec-discard')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('rec-discard-confirm')));
    await tester.pumpAndSettle();
    expect(find.text('Recording discarded.'), findsOneWidget);
    expect(server.requests, isEmpty);
    expect(store.prepared, isEmpty);
    expect(board.recordings.items, isEmpty);
    board.dispose();
  });

  testWidgets('End class while recording: stop, save, upload, then end the session', (tester) async {
    await pump(tester);
    await tester.tap(find.byKey(const Key('record')));
    await wait(tester);
    await drawLine(tester);
    await tapBoard(tester, 'end-class');
    await wait(tester);
    expect(find.byKey(const Key('end-recording-note')), findsOneWidget);
    await tester.tap(find.byKey(const Key('end-save'))); // do not save the board itself
    await tester.pump();
    await tester.tap(find.byKey(const Key('confirm-end')));
    await wait(tester);
    expect(find.text('Save lesson recording'), findsOneWidget);
    await tester.tap(find.byKey(const Key('rec-save')));
    await tester.pumpAndSettle();

    final paths = requests.map((r) => '${r.method} ${r.url.path}').toList();
    final finish = paths.indexWhere((p) => p.endsWith('/finish'));
    expect(finish, greaterThan(0));
    expect(paths.indexOf('POST /v1/sessions/current/end'), greaterThan(finish));
    expect(board.isSignedIn, isFalse);
    expect(board.recordings.statusOf(board.recordings.items.single), RecordingStatus.shared);
    board.dispose();
  });

  testWidgets('offline at the end of class: it waits on the board and uploads at the next sign-in', (tester) async {
    await pump(tester);
    server.failNext['create'] = [503, 503, 503];
    await tester.tap(find.byKey(const Key('record')));
    await wait(tester);
    await drawLine(tester);
    await tester.tap(find.byKey(const Key('rec-stop')));
    await wait(tester);
    await tester.tap(find.byKey(const Key('rec-save')));
    await wait(tester);
    expect(board.recordings.statusOf(board.recordings.items.single), RecordingStatus.waiting);

    await board.endClass();
    await wait(tester);
    expect(board.recordings.items.single.uploaded, isFalse);

    // The Recordings list on the guest board says whose sign-in it waits for.
    await tester.tap(find.byKey(const Key('profile-button')));
    await tester.pumpAndSettle();
    await tapBoard(tester, 'menu-recordings');
    await tester.pumpAndSettle();
    expect(find.text('Uploads when Anita signs in'), findsOneWidget);
    await tester.tap(find.text('Close'));
    await tester.pumpAndSettle();

    server.failNext.clear();
    board.onPaired(
      'next-session',
      SessionContext(
        sessionId: 's2',
        expiresAt: DateTime.now().add(const Duration(hours: 1)),
        teacherId: 't1',
        teacherName: 'Anita Sharma',
        language: 'en',
        sectionName: 'BCom Sem 3 A',
        subjectName: 'Corporate Accounting',
      ),
    );
    await tester.pumpAndSettle();
    final r = board.recordings.items.single;
    expect(r.uploaded, isTrue);
    expect(r.sharedAt, isNull, reason: 'created in a later class, so not shared automatically');

    // Share it from the list.
    await tester.tap(find.byKey(const Key('profile-button')));
    await tester.pumpAndSettle();
    await tapBoard(tester, 'menu-recordings');
    await tester.pumpAndSettle();
    expect(find.text('Uploaded'), findsOneWidget);
    await tester.tap(find.byKey(Key('rec-share-${r.id}')));
    await tester.pumpAndSettle();
    expect(server.steps.last, 'POST share');
    expect(find.text('Shared'), findsOneWidget);
    board.dispose();
  });
}
