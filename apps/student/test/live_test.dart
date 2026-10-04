import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart' show LessonView;
import 'package:kinetix_student/core/live.dart';
import 'package:kinetix_student/core/models.dart';
import 'package:kinetix_student/features/live/live_class_screen.dart';

import 'fake_api.dart';
import 'fake_live.dart';
import 'helpers.dart';

/// Watching the teacher's board live.
void main() {
  const device = '11111111-2222-3333-4444-555555555555';

  Map<String, dynamic> pen(List<num> points) => {'t': 'pen', 'c': 4279966495, 'w': 4, 'p': points};

  /// What the board sends a viewer that just joined: every page, then the open one.
  List<List<dynamic>> snapshot({int index = 0}) => [
    [
      0,
      'L',
      [
        [
          [1, pen([100, 100, 400, 400])],
        ],
        [
          [2, pen([500, 500, 900, 600])],
        ],
      ],
      index,
    ],
    [0, 'k', 'plain'],
  ];

  Future<(FakeStudentApi, FakeLiveServer)> pumpLive(WidgetTester tester, {Size size = const Size(412, 892), double textScale = 1}) async {
    final server = FakeLiveServer();
    final (api, _) = await pumpApp(tester, live: server, size: size, textScale: textScale, setup: (api) => api.liveClass = FakeStudentApi.corporateLive());
    return (api, server);
  }

  Future<void> watch(WidgetTester tester) async {
    await tester.tap(find.byKey(const Key('watchLive')));
    await tester.pumpAndSettle();
  }

  Finder pageLabel(String text) => find.descendant(of: find.byKey(const Key('livePage')), matching: find.text(text));

  testWidgets('no banner when nothing is live', (tester) async {
    final (api, _) = await pumpApp(tester);
    expect(api.calls, contains('live'));
    expect(find.byKey(const Key('liveBanner')), findsNothing);
  });

  testWidgets('a live class shows a banner on Today that opens the board', (tester) async {
    final (_, server) = await pumpLive(tester);
    expect(find.byKey(const Key('liveBanner')), findsOneWidget);
    expect(find.text('Live now: Corporate Accounting'), findsOneWidget);
    expect(find.text('Anita Sharma is teaching. Watch the board.'), findsOneWidget);
    // It comes first, above attendance.
    expect(
      tester.getTopLeft(find.byKey(const Key('liveBanner'))).dy,
      lessThan(tester.getTopLeft(find.byKey(const Key('attendanceCard'))).dy),
    );

    await watch(tester);
    expect(find.byType(LiveClassScreen), findsOneWidget);
    final conn = server.last;
    expect(conn.token, 'tok');
    expect(conn.baseUrl, 'http://test');
    expect(conn.watched, [device]);
    expect(find.text('Waiting for the board…'), findsOneWidget);
    expect(find.text('Board only: no sound yet'), findsOneWidget);

    conn.send(LiveFrame(device, snapshot()));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('liveJoining')), findsNothing);
    expect(find.text('LIVE'), findsOneWidget);
    expect(find.text('Corporate Accounting'), findsOneWidget);
    expect(find.text('Anita Sharma'), findsOneWidget);
    expect(pageLabel('Page 1 of 2'), findsOneWidget);

    // The teacher turns the page and keeps writing.
    conn.send(
      LiveFrame(device, [
        [10, 'g', 1],
        [
          20,
          'b',
          3,
          pen([10, 10, 20, 20]),
        ],
      ]),
    );
    await tester.pumpAndSettle();
    expect(pageLabel('Page 2 of 2'), findsOneWidget);

    // Frames for another board are ignored.
    conn.send(
      const LiveFrame('99999999-2222-3333-4444-555555555555', [
        [30, 'g', 0],
      ]),
    );
    await tester.pumpAndSettle();
    expect(pageLabel('Page 2 of 2'), findsOneWidget);

    // A tap on the board hides the bars; another brings them back.
    await tester.tap(find.byKey(const Key('liveBoard')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('livePage')), findsNothing);
    await tester.tap(find.byKey(const Key('liveBoard')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('livePage')), findsOneWidget);

    // Leaving stops watching.
    await tester.tap(find.byKey(const Key('leaveLive')));
    await tester.pumpAndSettle();
    expect(conn.unwatched, [device]);
    expect(conn.disposed, isTrue);
    expect(find.byType(LiveClassScreen), findsNothing);
  });

  testWidgets('a dropped connection keeps the board and rejoins', (tester) async {
    final (_, server) = await pumpLive(tester);
    await watch(tester);
    final conn = server.last;
    conn.send(LiveFrame(device, snapshot()));
    await tester.pumpAndSettle();

    conn.send(const LiveDisconnected());
    await tester.pumpAndSettle();
    expect(find.text('Connection lost. Reconnecting…'), findsOneWidget);
    expect(pageLabel('Page 1 of 2'), findsOneWidget);

    // Back: the app joins again and the board sends a fresh snapshot.
    conn.send(const LiveReady());
    await tester.pumpAndSettle();
    expect(conn.watched, [device, device]);
    conn.send(LiveFrame(device, snapshot(index: 1)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('liveReconnecting')), findsNothing);
    expect(pageLabel('Page 2 of 2'), findsOneWidget);
  });

  testWidgets('the teacher stopping the live class ends it', (tester) async {
    final (api, server) = await pumpLive(tester);
    await watch(tester);
    final conn = server.last;
    conn.send(LiveFrame(device, snapshot()));
    await tester.pumpAndSettle();

    conn.send(const LiveEnded(device, 'live_off'));
    await tester.pumpAndSettle();
    expect(find.text('Your teacher stopped the live class'), findsOneWidget);
    expect(find.byKey(const Key('liveRetry')), findsNothing);
    expect(find.text('LIVE'), findsNothing);

    // Back on Today the banner goes once the server says nothing is live.
    api.liveClass = null;
    await tester.tap(find.text('Back to Today'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('liveBanner')), findsNothing);
  });

  testWidgets('the class ending and the board going offline read plainly; offline can be retried', (tester) async {
    final (_, server) = await pumpLive(tester);
    await watch(tester);
    final conn = server.last;
    conn.send(LiveFrame(device, snapshot()));
    await tester.pumpAndSettle();

    conn.send(const LiveEnded(device, 'offline'));
    await tester.pumpAndSettle();
    expect(find.text('The board went offline'), findsOneWidget);
    await tester.tap(find.byKey(const Key('liveRetry')));
    await tester.pumpAndSettle();
    expect(conn.watched, [device, device]);
    conn.send(LiveFrame(device, snapshot()));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('liveEnded')), findsNothing);
    expect(find.text('LIVE'), findsOneWidget);

    conn.send(const LiveEnded(device, 'class_ended'));
    await tester.pumpAndSettle();
    expect(find.text('The class has ended'), findsOneWidget);
  });

  testWidgets('a refused join explains why', (tester) async {
    final server = FakeLiveServer()..ack = const LiveWatchAck(ok: false, error: 'This is not your class');
    await pumpApp(tester, live: server, setup: (api) => api.liveClass = FakeStudentApi.corporateLive());
    await tester.tap(find.byKey(const Key('watchLive')));
    await tester.pumpAndSettle();
    expect(find.text("Couldn't join the class"), findsOneWidget);
    expect(find.text('This is not your class'), findsOneWidget);

    // The board was offline when another student tried.
    server.last.ack = const LiveWatchAck(ok: false, error: 'This board is offline');
    await tester.tap(find.byKey(const Key('liveRetry')));
    await tester.pumpAndSettle();
    expect(find.text('The board went offline'), findsOneWidget);
  });

  testWidgets('a "Live now" update opens the board, or says the class is over', (tester) async {
    final server = FakeLiveServer();
    final (api, _) = await pumpApp(
      tester,
      live: server,
      setup: (api) {
        api.liveClass = FakeStudentApi.corporateLive();
        api.inbox.insert(0, api.notice('n9', NotificationKind.live, {'sessionId': 'sess1', 'sectionId': 'sec1'}, title: 'Live now: Corporate Accounting'));
      },
    );
    await openTab(tester, 'Updates');
    expect(find.byIcon(Icons.cast_for_education), findsOneWidget);
    await tester.tap(find.byKey(const Key('notification-n9')));
    await tester.pumpAndSettle();
    expect(find.byType(LiveClassScreen), findsOneWidget);
    expect(server.last.watched, [device]);
    await tester.tap(find.byKey(const Key('leaveLive')));
    await tester.pumpAndSettle();

    api.liveClass = null;
    await tester.tap(find.byKey(const Key('notification-n9')));
    await tester.pumpAndSettle();
    expect(find.byType(LiveClassScreen), findsNothing);
    expect(find.text('This class is no longer live.'), findsOneWidget);
  });

  testWidgets('a new "Live now" update brings up the banner; so does pulling to refresh', (tester) async {
    final (api, _) = await pumpApp(tester);
    expect(find.byKey(const Key('liveBanner')), findsNothing);

    api.liveClass = FakeStudentApi.corporateLive();
    api.inbox.insert(0, api.notice('n9', NotificationKind.live, {'sessionId': 'sess1'}, title: 'Live now: Corporate Accounting'));
    await openTab(tester, 'Updates'); // loads the inbox
    await openTab(tester, 'Today');
    expect(find.byKey(const Key('liveBanner')), findsOneWidget);

    api.liveClass = null;
    await tester.fling(find.byType(Scrollable).first, const Offset(0, 500), 1000);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('liveBanner')), findsNothing);
  });

  for (final (name, size, scale) in [('landscape phone', const Size(892, 412), 1.0), ('small phone, large text', const Size(360, 640), 2.0)]) {
    testWidgets('the viewer fits a $name', (tester) async {
      final (_, server) = await pumpLive(tester, size: size, textScale: scale);
      await tester.ensureVisible(find.byKey(const Key('watchLive')));
      await watch(tester);
      server.last.send(LiveFrame(device, snapshot()));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('livePage')), findsOneWidget);
      // The board is as big as the screen allows, 16:9.
      final board = tester.getSize(find.byType(LessonView));
      expect(board.width / board.height, closeTo(16 / 9, 0.01));
      server.last.send(const LiveEnded(device, 'offline'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }
}
