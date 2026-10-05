import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/core/recording/recordings.dart';
import 'package:kinetix_board/demo/demo.dart';
import 'package:kinetix_board/demo/demo_server.dart';
import 'package:kinetix_board/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/recording_fakes.dart';

/// The demo build (--dart-define=KINETIX_DEMO=true): no enrolment, a sample class, no server.
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
    server = DemoBoardServer(claimDelay: const Duration(seconds: 2));
    final store = MemoryRecordingStore();
    board = demoBoard(
      server,
      recordings: Recordings(
        store: store,
        voice: () => FakeVoiceRecorder(store: store),
      ),
    );
    await tester.pumpWidget(KinetixBoardApp(controller: board));
    await tester.pumpAndSettle();
    // The period's concept videos are suggested first (concept_videos_test.dart); skip them.
    await tester.tap(find.byKey(const Key('conceptVideoSkip')));
    await tester.pumpAndSettle();
  }

  Future<void> tapKey(WidgetTester tester, String key) async {
    // The top bar's chips scroll when they do not fit.
    await tester.ensureVisible(find.byKey(Key(key)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(Key(key)));
    await tester.pumpAndSettle();
  }

  testWidgets(
    'starts in the demo class without enrolment; books, plan and AI work offline',
    (tester) async {
      await pump(tester);
      expect(board.stage, BoardStage.board);
      expect(find.byKey(const Key('demoChip')), findsOneWidget);
      expect(
        find.textContaining('BCom Sem 3 A · Corporate Accounting'),
        findsOneWidget,
      );
      expect(board.roster, hasLength(12));

      // Books: the syllabus with what has been taught.
      await tapKey(tester, 'panel-books');
      expect(
        find.text('Corporate Accounting, BCom Semester 3'),
        findsOneWidget,
      );
      expect(find.text('4 of 8 topics taught'), findsOneWidget);
      await tapKey(tester, 'panel-books');

      // Today's plan.
      await tapKey(tester, 'tool-tools');
      await tester.tap(find.text("Today's plan"));
      await tester.pumpAndSettle();
      expect(find.text('Re-issue of forfeited shares'), findsWidgets);
      await tester.tapAt(const Offset(960, 600));
      await tester.pumpAndSettle();

      // AI: a labelled sample answer.
      await tapKey(tester, 'panel-ai');
      await tester.enterText(
        find.byKey(const Key('ai-ask')),
        'What is forfeiture?',
      );
      await tapKey(tester, 'ai-ask-send');
      expect(find.textContaining('Sample answer (demo)'), findsOneWidget);
      expect(server.requests, contains('POST /v1/ai/explain'));

      // Attendance goes to the demo server like to the cloud.
      board.markAttendance({'s1': AttendanceMark.absent});
      await tester.pumpAndSettle();
      expect(server.requests, contains('POST /v1/sync/push'));
      expect(board.pendingOps, 0);

      board.dispose();
    },
  );

  testWidgets('live class and class audio say they are not in the demo', (
    tester,
  ) async {
    await pump(tester);
    await tapKey(tester, 'go-live');
    expect(find.text('Not available in the demo.'), findsOneWidget);
    expect(board.classLive, isFalse);
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    await tapKey(tester, 'class-audio');
    expect(find.text('Not available in the demo.'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    board.dispose();
  });

  testWidgets(
    'after ending the class, the sign-in code is "scanned" and the class opens again',
    (tester) async {
      await pump(tester);
      await board.endClass();
      await tester.pumpAndSettle();
      expect(board.isSignedIn, isFalse);
      await tapKey(tester, 'sign-in-chip');
      await tester.pump(const Duration(seconds: 3));
      await tester.pumpAndSettle();
      expect(board.isSignedIn, isTrue);
      expect(board.session!.teacherName, 'Anita Sharma');
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
      board.dispose();
    },
  );
}
