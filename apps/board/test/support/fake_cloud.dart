// The KINETIX Cloud as the board's tests see it: an enrolled board, a signed-in teacher and AI
// answers in the teacher's language (test/l10n_test.dart, test/phone_layout_test.dart).
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/device_store.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/core/realtime.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

/// A realtime connection that never connects; the tests drive the controller directly.
class NoRealtime extends Realtime {
  NoRealtime() : super('http://test');
  @override
  void connect(String token) {}
  @override
  void dispose() {}
}

/// AI answers as the server would send them in Hindi or Kannada (the content is the server's;
/// here it only needs to be long and in the right script).
const aiSample = {
  'hi': 'प्रकाश संश्लेषण वह प्रक्रिया है जिसमें हरे पौधे सूर्य के प्रकाश से अपना भोजन बनाते हैं',
  'kn': 'ದ್ಯುತಿಸಂಶ್ಲೇಷಣೆ ಎಂದರೆ ಹಸಿರು ಸಸ್ಯಗಳು ಸೂರ್ಯನ ಬೆಳಕಿನಿಂದ ತಮ್ಮ ಆಹಾರವನ್ನು ತಯಾರಿಸುವ ಕ್ರಿಯೆ',
  'en': 'Photosynthesis is the process by which green plants make their food from sunlight',
};

http.Response jsonResponse(Object body, [int status = 200]) =>
    http.Response.bytes(utf8.encode(jsonEncode(body)), status, headers: {'content-type': 'application/json; charset=utf-8'});

Map<String, dynamic> aiResponse(String task, Map<String, dynamic> result) => {
  'task': task,
  'result': result,
  'meta': {'cached': false, 'preview': true, 'sources': []},
};

MockClient fakeCloud() => MockClient((req) async {
  final path = req.url.path;
  final body = req.body.isEmpty ? <String, dynamic>{} : jsonDecode(req.body) as Map<String, dynamic>;
  final text = aiSample[body['language']] ?? aiSample['en']!;
  return switch (path) {
    '/v1/devices/enroll' => jsonResponse({
      'deviceToken': 'dev',
      'device': {'name': 'Room 204 Board'},
    }, 201),
    '/v1/devices/me/pairing-codes' => jsonResponse({
      'code': '482913',
      'qrPayload': 'kinetix://pair/482913',
      'expiresAt': DateTime.now().add(const Duration(minutes: 2)).toIso8601String(),
    }),
    '/v1/sessions/current' => jsonResponse({
      'roster': [
        for (var i = 1; i <= 34; i++) {'id': 's$i', 'rollNo': 'BC3A-${i.toString().padLeft(3, '0')}', 'fullName': 'Student Number $i'},
      ],
    }),
    '/v1/sessions/current/end' => jsonResponse({'ended': true}, 201),
    '/v1/classroom/end' => jsonResponse({'ended': true, 'summary': {'minutes': 0}}, 201),
    '/v1/whiteboards' => jsonResponse([
      {
        'id': 'w1',
        'title': 'Corporate Accounting · 4 Oct',
        'pageCount': 3,
        'updatedAt': DateTime(2026, 10, 4, 10, 30).toIso8601String(),
        'sectionName': 'BCom Sem 3 A',
        'subjectName': 'Corporate Accounting',
        'sharedAt': null,
      },
    ]),
    '/v1/content/syllabus' => jsonResponse({
      'id': 'c1',
      'title': 'Corporate Accounting, BCom Semester 3',
      'reviewed': false,
      'chapters': [
        {
          'id': 'ch1',
          'title': 'Valuation of Goodwill',
          'own': false,
          'topics': [
            {'id': 't1', 'title': 'Methods of valuing goodwill', 'summary': 'Average profit, super profit…', 'own': false},
          ],
        },
        {'id': 'ch2', 'title': 'Revision', 'own': true, 'topics': []},
      ],
    }),
    '/v1/coverage' => jsonResponse({
      'covered': 1,
      'total': 1,
      'percent': 100,
      'topics': [
        {'topicId': 't1', 'coveredOn': '2026-10-03', 'coveredBy': 'Anita Sharma'},
      ],
    }),
    '/v1/content/topics/t1' => jsonResponse({
      'id': 't1',
      'title': 'Methods of valuing goodwill',
      'summary': 'Average profit, super profit and capitalisation methods.',
      'notes': ['Goodwill = Super profit × Number of years’ purchase.'],
      'outcomes': ['Value goodwill by three methods'],
      'chapter': {'id': 'ch1', 'title': 'Valuation of Goodwill'},
      'course': {'id': 'c1', 'title': 'Corporate Accounting', 'reviewed': false},
      'resources': [
        {'kind': 'lab', 'id': 'lab.break-even', 'title': 'Break-even chart'},
      ],
    }),
    '/v1/ai/explain' => jsonResponse(
      aiResponse('explain', {
        'answer': text,
        'keyPoints': [text, text],
        'followUps': [text],
      }),
    ),
    '/v1/ai/quiz' => jsonResponse(
      aiResponse('quiz', {
        'questions': [
          for (var n = 0; n < (body['count'] as int); n++)
            {
              'question': '$text?',
              'options': [text, 'B', 'C', 'D'],
              'answer': n % 4,
              'explanation': text,
            },
        ],
      }),
    ),
    '/v1/ai/homework' => jsonResponse(
      aiResponse('homework', {
        'title': text,
        'instructions': text,
        'questions': [
          for (var n = 0; n < (body['count'] as int); n++) {'question': text, 'marks': 2},
        ],
      }),
    ),
    '/v1/ai/lesson-plan' => jsonResponse(
      aiResponse('lessonPlan', {
        'objectives': [text],
        'steps': [
          {'minutes': 10, 'activity': text},
          {'minutes': 35, 'activity': text},
        ],
        'materials': ['A', 'B'],
        'assessment': text,
      }),
    ),
    '/v1/lesson-plans/current' => jsonResponse({
      'slot': {'id': 'slot1', 'startsAt': '10:00:00', 'endsAt': '10:55:00'},
      'subject': {'id': 'sub1', 'name': 'Corporate Accounting'},
      'date': '2026-10-05',
      'suggestedTopicIds': ['t1'],
      'plan': {
        'id': 'lp1',
        'date': '2026-10-05',
        'topicIds': ['t1'],
        'topics': [
          {'id': 't1', 'title': 'Methods of valuing goodwill'},
        ],
        'content': {
          'objectives': [text, text],
          'steps': [
            {'minutes': 10, 'activity': text},
            {'minutes': 35, 'activity': text},
            {'minutes': 10, 'activity': text},
          ],
          'materials': ['Textbook', 'Calculator'],
          'assessment': text,
          'homework': text,
        },
        'aiDrafted': true,
        'teacher': 'Anita Sharma',
        'reviewedAt': null,
        'reviewRemark': null,
      },
    }),
    _ => http.Response('[]', 200),
  };
});

SessionContext sessionIn(String language) => SessionContext(
  sessionId: 's1',
  expiresAt: DateTime.now().add(const Duration(hours: 1)),
  teacherId: 't1',
  teacherName: 'Anita Sharma',
  language: language,
  sectionName: 'BCom Sem 3 A',
  subjectName: 'Corporate Accounting',
  periodLabel: '10:00–10:55',
);

Future<BoardController> enrolledBoard({DeviceStore? store}) async {
  final board = BoardController(
    store: store,
    apiFactory: (url) => ApiClient(baseUrl: url, client: fakeCloud()),
    realtimeFactory: (_) => NoRealtime(),
    outboxStore: MemoryOutboxStore(),
  );
  await board.enroll('http://test', 'KX-AAAA-BBBB');
  return board;
}

void screenSize(WidgetTester tester, Size size) {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

/// A widget under test with the board's localizations in [language].
Widget localized(String language, Widget child) => MaterialApp(
  theme: KinetixTheme.light(),
  locale: Locale(language),
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  home: child,
);
