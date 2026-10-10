import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:kinetix_board/features/board/classroom_profile_strings.dart';
import 'package:kinetix_board/features/board/classroom_profile_ui.dart';
import 'package:kinetix_board/features/classroom_plus/student_buzzers.dart';

import 'support/board_fonts.dart';
import 'support/fake_cloud.dart';
import 'support/panel_harness.dart';

/// The board's profile: Your Classrooms, Schedule a Training, the student buzzer and End class.
void main() {
  final calls = <String>[];
  var buzzerLocked = true;
  var trainings = <Map<String, dynamic>>[];
  final slotAt = DateTime.now().add(const Duration(days: 1)).toUtc().toIso8601String();

  Future<BoardController> signedIn() async {
    final client = MockClient((req) async {
      calls.add('${req.method} ${req.url.path}');
      switch (req.url.path) {
        case '/v1/devices/enroll':
          return jsonResponse({'deviceToken': 'dev', 'device': {'name': 'Room 1 Board'}}, 201);
        case '/v1/classroom/classrooms':
          return jsonResponse([
            {'sectionId': 'sec1', 'className': 'BCom Sem 3 A', 'standard': 3, 'subjectId': 'sub1', 'subject': 'Corporate Accounting', 'sessions': 12, 'lastTakenAt': '2026-10-03T05:00:00.000Z'},
            {'sectionId': 'sec2', 'className': 'BCom Sem 3 B', 'standard': 3, 'subjectId': 'sub1', 'subject': 'Corporate Accounting', 'sessions': 0, 'lastTakenAt': null},
          ]);
        case '/v1/classroom/classrooms/open':
          return jsonResponse({
            'sessionId': 's1',
            'expiresAt': DateTime.now().add(const Duration(hours: 1)).toUtc().toIso8601String(),
            'teacher': {'id': 't1', 'fullName': 'Anita Sharma', 'preferredLanguage': 'en'},
            'section': {'id': 'sec2', 'displayName': 'BCom Sem 3 B', 'term': 3},
            'subject': {'name': 'Corporate Accounting'},
            'period': null,
            'roster': [],
          });
        case '/v1/classroom/trainings/slots':
          return jsonResponse([
            {'at': slotAt, 'taken': false},
            {'at': DateTime.now().add(const Duration(days: 2)).toUtc().toIso8601String(), 'taken': true},
          ]);
        case '/v1/classroom/trainings/mine':
          return jsonResponse(trainings);
        case '/v1/classroom/trainings':
          trainings = [
            {'id': 'tr1', 'slotAt': slotAt, 'topic': (jsonDecode(req.body) as Map)['topic'], 'status': 'requested', 'adminNote': ''},
          ];
          return jsonResponse(trainings.first, 201);
        case '/v1/classroom/buzzer':
          return jsonResponse({'open': true, 'locked': buzzerLocked, 'roundNo': 1, 'presses': []});
        case '/v1/classroom/buzzer/lock':
          buzzerLocked = (jsonDecode(req.body) as Map)['locked'] as bool;
          return jsonResponse({'open': true, 'locked': buzzerLocked, 'roundNo': 1, 'presses': []});
        case '/v1/classroom/buzzer/reset':
          return jsonResponse({'open': true, 'locked': false, 'roundNo': 2, 'presses': []});
        case '/v1/classroom/end':
          return jsonResponse({
            'ended': true,
            'notesSaved': true,
            'published': true,
            'sharePath': '/v1/class-notes/t.abc',
            'summary': {'minutes': 41, 'section': 'BCom Sem 3 A', 'subject': 'Corporate Accounting', 'buzzes': 3},
          });
      }
      return jsonResponse({'roster': []});
    });
    final board = BoardController(apiFactory: (url) => ApiClient(baseUrl: url, client: client), realtimeFactory: (_) => NoRealtime(), outboxStore: MemoryOutboxStore());
    await board.enroll('http://test', 'KX-AAAA-BBBB');
    board.onPaired('tok', sessionIn('en'));
    return board;
  }

  setUpAll(loadBoardFonts);
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    calls.clear();
    buzzerLocked = true;
    trainings = [];
  });

  test('hi and kn have every English key, and Hindi and Kannada are not Latin', () {
    final en = classroomStringTable['en']!;
    for (final lang in const ['hi', 'kn']) {
      final t = classroomStringTable[lang]!;
      expect(t.keys.toSet(), en.keys.toSet(), reason: lang);
      for (final e in t.entries) {
        expect(RegExp(r'[A-Za-z]{4,}').hasMatch(e.value.replaceAll(RegExp(r'\{[a-z]+\}'), '')), isFalse, reason: '$lang ${e.key}');
      }
    }
  });

  testWidgets('Your Classrooms lists sessions and last taken, and Open class switches the board', (tester) async {
    final board = await signedIn();
    await pumpPanel(tester, Builder(builder: (c) => TextButton(onPressed: () => showClassroomsDialog(c, board), child: const Text('go'))), size: panelSize);
    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    expect(find.text('BCom Sem 3 A · Corporate Accounting'), findsOneWidget);
    expect(find.textContaining('12 sessions'), findsOneWidget);
    expect(find.textContaining('Not taken yet'), findsOneWidget);
    await tester.tap(find.byKey(const Key('classroom-open-sec2-sub1')));
    await tester.pumpAndSettle();
    expect(calls, contains('POST /v1/classroom/classrooms/open'));
    expect(board.session?.sectionName, 'BCom Sem 3 B');
    board.dispose();
  });

  testWidgets('Schedule a Training: pick a slot, say the topic, send, and see it listed', (tester) async {
    final board = await signedIn();
    await pumpPanel(tester, SingleChildScrollView(child: TrainingScheduler(board: board)), size: panelSize);
    await tester.tap(find.byKey(Key('slot-$slotAt')));
    await tester.enterText(find.byKey(const Key('training-topic')), 'Using the buzzer');
    await tester.pump();
    await tester.tap(find.byKey(const Key('training-send')));
    await tester.pumpAndSettle();
    expect(calls, contains('POST /v1/classroom/trainings'));
    expect(find.byKey(const Key('training-tr1')), findsOneWidget);
    expect(find.text('Requested'), findsOneWidget);
    expect(find.byKey(const Key('training-note')), findsOneWidget);
    board.dispose();
  });

  testWidgets('students buzz appears at once on the board, in order, and the teacher can lock and reset', (tester) async {
    final board = await signedIn();
    await pumpPanel(tester, SingleChildScrollView(child: StudentBuzzers(board: board)), size: panelSize);
    expect(find.byKey(const Key('student-buzzer-empty')), findsOneWidget);
    // The server pushes buzzer.updated over the realtime connection.
    board.buzzerState.value = {
      'open': true,
      'locked': false,
      'roundNo': 1,
      'presses': [
        {'rank': 1, 'name': 'Asha', 'studentId': 'u1'},
        {'rank': 2, 'name': 'Ravi', 'studentId': 'u2'},
      ],
    };
    await tester.pump();
    expect(find.text('Asha'), findsOneWidget);
    expect(find.byKey(const Key('student-buzz-2')), findsOneWidget);
    await tester.tap(find.byKey(const Key('student-buzzer-toggle')));
    await tester.pumpAndSettle();
    expect(calls, contains('POST /v1/classroom/buzzer/lock'));
    await tester.tap(find.byKey(const Key('student-buzzer-reset')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('student-buzzer-empty')), findsOneWidget);
    board.dispose();
  });

  testWidgets('End class summary offers WhatsApp through the share sheet with the notes link', (tester) async {
    final board = await signedIn();
    String? shared;
    final old = shareClassNotes;
    shareClassNotes = (text, {pdfName, pdf}) async => shared = text;
    addTearDown(() => shareClassNotes = old);
    final result = await board.api!.endClassWithNotes(notes: 'Journal entries', publish: true);
    await pumpPanel(tester, Builder(builder: (c) => TextButton(onPressed: () => showEndSummary(c, board, result), child: const Text('go'))), size: panelSize);
    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    expect(find.textContaining('41 minutes'), findsOneWidget);
    expect(find.text('Notes published to students'), findsOneWidget);
    await tester.tap(find.byKey(const Key('end-share-whatsapp')));
    await tester.pumpAndSettle();
    expect(shared, 'Class notes: http://test/v1/class-notes/t.abc');
    board.dispose();
  });
}
