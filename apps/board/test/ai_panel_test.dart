import 'package:kinetix_board/features/board/panel/split_panel.dart';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/core/realtime.dart';
import 'package:kinetix_board/features/ai/ai_controller.dart';
import 'package:kinetix_board/features/ai/ai_widgets.dart';
import 'package:kinetix_board/features/board/board_screen.dart';
import 'package:kinetix_board/features/board/side_panel.dart';
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

Map<String, dynamic> _meta({bool preview = true}) => {'provider': 'preview', 'model': 'preview', 'promptVersion': 'v1', 'cached': false, 'preview': preview};

Map<String, dynamic> _ok(String task, Map<String, dynamic> result, {bool preview = true}) => {'task': task, 'result': result, 'meta': _meta(preview: preview)};

Map<String, dynamic> _explain(Map<String, dynamic> body) => _ok('explain', {
  'answer': 'Answer about ${body['question']} in ${body['language']}.',
  'keyPoints': ['Plants need sunlight', 'They make glucose'],
  'followUps': ['Why are leaves green?', 'What is chlorophyll?'],
});

Map<String, dynamic> _quiz(Map<String, dynamic> body) => _ok('quiz', {
  'questions': [
    for (var n = 0; n < (body['count'] as int); n++)
      {
        'question': 'Question ${n + 1} on ${body['topic']}',
        'options': ['First option', 'Second option', 'Third option', 'Fourth option'],
        'answer': n % 4,
        'explanation': 'Because of reason ${n + 1}.',
      },
  ],
});

Map<String, dynamic> _homework(Map<String, dynamic> body) => _ok('homework', {
  'title': 'Homework: ${body['topic']}',
  'instructions': 'Answer all questions in your notebook.',
  'questions': [
    for (var n = 0; n < (body['count'] as int); n++) {'question': 'Exercise ${n + 1} on ${body['topic']}', 'marks': n.isEven ? 2 : 5},
  ],
});

Map<String, dynamic> _lesson(Map<String, dynamic> body) => _ok('lessonPlan', {
  'objectives': ['Explain the water cycle', 'Label a diagram'],
  'steps': [
    {'minutes': 10, 'activity': 'Recall what students know'},
    {'minutes': 25, 'activity': 'Draw the cycle together'},
    {'minutes': 10, 'activity': 'Pair practice'},
  ],
  'materials': ['Chart paper', 'Markers'],
  'assessment': 'Exit ticket with two questions.',
}, preview: false);

void main() {
  late List<http.Request> requests;
  late BoardController board;

  /// Override to make the next AI requests fail or misbehave.
  late Future<http.Response> Function(http.Request req)? override;

  Map<String, dynamic> bodyOf(http.Request r) => jsonDecode(r.body) as Map<String, dynamic>;
  List<http.Request> calls(String path) => requests.where((r) => r.url.path == path).toList();

  SessionContext session({String? sectionName = 'BCom Sem 3 A'}) => SessionContext(
    sessionId: 's1',
    expiresAt: DateTime.now().add(const Duration(hours: 1)),
    teacherId: 't1',
    teacherName: 'Anita Sharma',
    language: 'en',
    sectionName: sectionName,
    subjectName: 'Corporate Accounting',
  );

  Future<void> pump(WidgetTester tester, {bool signIn = true, Size size = const Size(1920, 1080), SessionContext? ctx}) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    requests = [];
    override = null;
    final client = MockClient((req) async {
      requests.add(req);
      final o = override;
      if (o != null && req.url.path.startsWith('/v1/ai/')) return o(req);
      if (req.url.path == '/v1/devices/enroll') {
        return http.Response(jsonEncode({'deviceToken': 'dev', 'device': {'name': 'Room 204 Board'}}), 201);
      }
      Map<String, dynamic> body() => bodyOf(req);
      final json = switch (req.url.path) {
        '/v1/ai/explain' => _explain(body()),
        '/v1/ai/quiz' => _quiz(body()),
        '/v1/ai/homework' => _homework(body()),
        '/v1/ai/lesson-plan' => _lesson(body()),
        '/v1/ai/read-board' => {
          'task': 'readBoard',
          'result': {'text': 'Goodwill = Super profit × 3', 'math': ['G = SP \\times 3']},
          'meta': {'cached': false, 'preview': false, 'sources': []},
        },
        '/v1/homework/from-board' => {'id': 'h1', 'title': body()['title']},
        _ => null,
      };
      if (json != null) return http.Response(jsonEncode(json), 200, headers: {'content-type': 'application/json; charset=utf-8'});
      return http.Response('[]', 200);
    });
    board = BoardController(apiFactory: (url) => ApiClient(baseUrl: url, client: client), realtimeFactory: (_) => _NoRealtime());
    await board.enroll('http://test', 'KX-AAAA-BBBB');
    if (signIn) board.onPaired('session-token', ctx ?? session());
    await tester.pumpWidget(MaterialApp(theme: KinetixTheme.light(), home: BoardScreen(board: board)));
    await tester.pumpAndSettle();
  }

  Future<void> tapKey(WidgetTester tester, String key) async {
    final f = find.byKey(Key(key));
    if (f.evaluate().isEmpty) {
      // Lists build lazily: scroll the panel until it is there.
      await tester.scrollUntilVisible(f, 200, scrollable: find.descendant(of: find.byType(SplitPanelFrame), matching: find.byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down)).first);
    }
    await tester.ensureVisible(f);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(Key(key)));
    await tester.pumpAndSettle();
  }

  Future<void> openAi(WidgetTester tester) async {
    await tester.tap(find.byKey(const Key('panel-ai')));
    await tester.pumpAndSettle();
  }

  Future<void> ask(WidgetTester tester, String q) async {
    await tester.enterText(find.byKey(const Key('ai-ask')), q);
    await tester.tap(find.byKey(const Key('ai-ask-send')));
    await tester.pumpAndSettle();
  }

  /// The board's end-of-period timer must be cancelled before the test ends.
  void testBoard(String name, Future<void> Function(WidgetTester) body) => testWidgets(name, (tester) async {
    await body(tester);
    board.dispose();
  });

  String day(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  group('Ask', () {
    testBoard('shows the explanation with the preview label; follow-ups ask again', (tester) async {
      await pump(tester);
      await openAi(tester);
      await ask(tester, 'What is photosynthesis?');

      final sent = bodyOf(calls('/v1/ai/explain').single);
      expect(sent['question'], 'What is photosynthesis?');
      expect(sent['language'], 'en');
      expect(calls('/v1/ai/explain').single.headers['authorization'], 'Bearer session-token');
      expect(find.text('Answer about What is photosynthesis? in en.'), findsOneWidget);
      expect(find.text('Plants need sunlight'), findsOneWidget);
      expect(find.text(previewLabel), findsOneWidget);

      await tester.tap(find.text('Why are leaves green?'));
      await tester.pumpAndSettle();
      expect(bodyOf(calls('/v1/ai/explain').last)['question'], 'Why are leaves green?');
      expect(find.text('Answer about Why are leaves green? in en.'), findsOneWidget);

      // Regenerate asks for a fresh answer.
      await tester.tap(find.byTooltip('Ask again for a new answer'));
      await tester.pumpAndSettle();
      expect(bodyOf(calls('/v1/ai/explain').last)['fresh'], isTrue);

      await tapKey(tester, 'ai-explanation-close');
      expect(find.byKey(const Key('ai-explanation')), findsNothing);
    });

    testBoard('the language applies to every AI task', (tester) async {
      await pump(tester);
      await openAi(tester);
      await tapKey(tester, 'ai-language');
      await tester.tap(find.text('हिन्दी').last);
      await tester.pumpAndSettle();
      await ask(tester, 'Explain GST');
      expect(bodyOf(calls('/v1/ai/explain').single)['language'], 'hi');

      await tapKey(tester, 'ai-tool-quiz');
      expect(find.text('हिन्दी'), findsOneWidget);
      await tapKey(tester, 'quiz-generate');
      expect(bodyOf(calls('/v1/ai/quiz').single)['language'], 'hi');
    });

    testBoard('each error code has a friendly message', (tester) async {
      await pump(tester);
      await openAi(tester);
      final cases = {
        429: 'Your institution has used today’s KINETIX AI allowance. It resets tomorrow.',
        503: 'KINETIX AI is not reachable right now. Try again in a minute.',
        502: 'KINETIX AI could not produce a usable answer. Try again or rephrase.',
        422: 'Not for the classroom.',
        401: 'Sign in again with the Teacher app to use KINETIX AI.',
      };
      for (final e in cases.entries) {
        override = (_) async => http.Response(jsonEncode({'message': e.key == 422 ? 'Not for the classroom.' : 'x', 'statusCode': e.key}), e.key);
        await ask(tester, 'Question ${e.key}');
        expect(find.text(e.value), findsOneWidget, reason: '${e.key}');
      }
      override = (_) async => throw http.ClientException('Network is unreachable');
      await ask(tester, 'Offline question');
      expect(find.textContaining('The board is offline'), findsOneWidget);

      // Try again recovers once the server answers.
      override = null;
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();
      expect(find.text('Answer about Offline question in en.'), findsOneWidget);
    });
  });

  group('Guest board', () {
    testBoard('AI explains that a teacher must sign in; the maths solver still works', (tester) async {
      await pump(tester, signIn: false);
      await openAi(tester);
      expect(find.byKey(const Key('ai-signin')), findsOneWidget);
      await ask(tester, 'What is a cell?');
      expect(calls('/v1/ai/explain'), isEmpty);
      expect(find.text('Sign in with the Teacher app to ask KINETIX AI.'), findsOneWidget);

      await tapKey(tester, 'ai-tool-math');
      await tester.enterText(find.byKey(const Key('math-input')), '3');
      await tester.tap(find.byKey(const Key('math-key-x')));
      await tester.tap(find.byKey(const Key('math-key-+')));
      await tester.pump();
      final field = tester.widget<TextField>(find.byKey(const Key('math-input')));
      field.controller!.text = '${field.controller!.text}5 = 20';
      await tapKey(tester, 'math-solve');
      expect(find.text('3x + 5 = 20'), findsOneWidget);
      expect(find.text('x = 5'), findsWidgets);
      expect(find.text('Subtract 5 from both sides'), findsOneWidget);
      expect(find.text('LINEAR EQUATION'), findsOneWidget);
      expect(requests.where((r) => r.url.path.startsWith('/v1/ai')), isEmpty);

      // A quadratic, and a friendly error.
      await tester.enterText(find.byKey(const Key('math-input')), 'x^2 - 5x + 6 = 0');
      await tapKey(tester, 'math-solve');
      expect(find.text('x = 2 or x = 3'), findsOneWidget);
      expect(find.text('x² − 5x + 6 = (x − 2)(x − 3)'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('math-input')), '(2 + 3');
      await tapKey(tester, 'math-solve');
      expect(find.byKey(const Key('math-error')), findsOneWidget);
      expect(find.textContaining('not closed'), findsOneWidget);

      // Quiz and homework panels say why they cannot work.
      await tapBoard(tester, 'panel-tab-ai');
      await tapKey(tester, 'ai-tool-quiz');
      expect(find.byKey(const Key('ai-signin')), findsOneWidget);
      await tapKey(tester, 'quiz-generate');
      expect(calls('/v1/ai/quiz'), isEmpty);
    });
  });

  group('Quick quiz', () {
    testBoard('generate, regenerate, present and send as homework', (tester) async {
      await pump(tester);
      await tapBoard(tester, 'panel-tab-ai');
      await tapKey(tester, 'ai-tool-quiz');
      expect(tester.widget<TextField>(find.byKey(const Key('quiz-topic'))).controller!.text, 'Corporate Accounting');
      await tester.enterText(find.byKey(const Key('quiz-topic')), 'Journal entries');
      await tester.tap(find.text('5'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('3').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Hard'));
      await tapKey(tester, 'quiz-generate');

      final sent = bodyOf(calls('/v1/ai/quiz').single);
      expect(sent, {'topic': 'Journal entries', 'count': 3, 'difficulty': 'hard', 'language': 'en', 'fresh': false});
      expect(find.text('1. Question 1 on Journal entries'), findsOneWidget);
      expect(find.text('3 questions · Journal entries'), findsOneWidget);
      expect(find.text(previewLabel), findsOneWidget);

      await tapKey(tester, 'quiz-regenerate');
      expect(bodyOf(calls('/v1/ai/quiz').last)['fresh'], isTrue);

      // Present: one question at a time; reveal highlights the answer and shows why.
      await tapKey(tester, 'quiz-present');
      expect(find.text('Question 1 of 3'), findsOneWidget);
      expect(find.text('Question 1 on Journal entries'), findsOneWidget);
      expect(find.byKey(const Key('presenter-explanation')), findsNothing);
      await tapKey(tester, 'presenter-reveal');
      expect(find.descendant(of: find.byKey(const Key('presenter-explanation')), matching: find.text('Answer A. Because of reason 1.')), findsOneWidget);
      await tapKey(tester, 'presenter-next');
      expect(find.text('Question 2 of 3'), findsOneWidget);
      expect(find.byKey(const Key('presenter-explanation')), findsNothing);
      await tapKey(tester, 'presenter-previous');
      expect(find.text('Question 1 of 3'), findsOneWidget);
      expect(find.byKey(const Key('presenter-explanation')), findsOneWidget, reason: 'revealed answers stay revealed');
      await tapKey(tester, 'presenter-close');
      expect(find.text('Question 1 of 3'), findsNothing);

      // Send as homework.
      await tapKey(tester, 'quiz-homework');
      expect(find.text('Send as homework'), findsWidgets);
      expect(find.textContaining('Goes to BCom Sem 3 A'), findsOneWidget);
      await tapKey(tester, 'send-homework-confirm');
      final hw = bodyOf(calls('/v1/homework/from-board').single);
      expect(hw['title'], 'Quiz: Journal entries');
      expect(hw['instructions'], contains('1. Question 1 on Journal entries\n   A) First option\n   B) Second option'));
      expect(hw['dueOn'], day(DateTime.now().add(const Duration(days: 1))));
      expect(calls('/v1/homework/from-board').single.headers['authorization'], 'Bearer session-token');
      expect(find.text('Homework sent to BCom Sem 3 A. Students and parents are notified.'), findsOneWidget);
    });

    testBoard('a failed send keeps the dialog open with the reason', (tester) async {
      await pump(tester, ctx: session());
      await tapBoard(tester, 'panel-tab-ai');
      await tapKey(tester, 'ai-tool-quiz');
      await tapKey(tester, 'quiz-generate');
      await tapKey(tester, 'quiz-homework');
      // The server refuses: no class open.
      final original = requests.length;
      board.api = ApiClient(
        baseUrl: 'http://test',
        client: MockClient((req) async {
          requests.add(req);
          return http.Response(jsonEncode({'message': 'Open a class on the board to give homework', 'statusCode': 400}), 400);
        }),
      )..sessionToken = 'session-token';
      await tapKey(tester, 'send-homework-confirm');
      expect(requests.length, original + 1);
      expect(find.text('Open a class on the board to give homework'), findsOneWidget);
      expect(find.byKey(const Key('send-homework-confirm')), findsOneWidget);
    });
  });

  group('Homework', () {
    testBoard('generate a draft, edit it and send it to the class', (tester) async {
      await pump(tester);
      await tapBoard(tester, 'panel-tab-ai');
      await tapKey(tester, 'ai-tool-homework');
      await tester.enterText(find.byKey(const Key('homework-topic')), 'Fractions');
      await tapKey(tester, 'homework-generate');
      expect(bodyOf(calls('/v1/ai/homework').single)['topic'], 'Fractions');
      expect(find.text(previewLabel), findsOneWidget);
      expect(find.text('Total 16 marks'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('homework-title')), 'Fractions practice');
      await tester.enterText(find.byKey(const Key('homework-q0')), 'Add 1/2 and 1/3');
      // Remove the last question, add one of our own.
      await tester.ensureVisible(find.byTooltip('Remove question').last);
      await tester.tap(find.byTooltip('Remove question').last);
      await tester.pumpAndSettle();
      expect(find.text('Total 14 marks'), findsOneWidget);
      await tapKey(tester, 'homework-add');
      await tester.enterText(find.byKey(const Key('homework-q4')), 'Explain why 2/4 = 1/2');
      await tapKey(tester, 'homework-send');

      final sent = bodyOf(calls('/v1/homework/from-board').single);
      expect(sent['title'], 'Fractions practice');
      expect(sent['instructions'], startsWith('Answer all questions in your notebook.\n\n1. Add 1/2 and 1/3 (2 marks)\n2. Exercise 2 on Fractions (5 marks)'));
      expect(sent['instructions'], contains('5. Explain why 2/4 = 1/2 (2 marks)'));
      expect(sent['instructions'], endsWith('Total: 16 marks'));
      expect(sent['dueOn'], day(DateTime.now().add(const Duration(days: 1))));
      expect(find.text('Homework sent to BCom Sem 3 A. Students and parents are notified.'), findsOneWidget);
      expect(find.byKey(const Key('homework-generate')), findsOneWidget, reason: 'the draft is cleared after sending');
    });

    testBoard('without a timetabled class, homework cannot be sent', (tester) async {
      await pump(tester, ctx: session(sectionName: null));
      await tapBoard(tester, 'panel-tab-ai');
      await tapKey(tester, 'ai-tool-homework');
      await tapKey(tester, 'homework-write');
      expect(find.text('No class is timetabled now'), findsOneWidget);
      expect(tester.widget<ButtonStyleButton>(find.byKey(const Key('homework-send'))).enabled, isFalse);
    });
  });

  group('Lesson plan', () {
    testBoard('shows objectives, timed steps, materials and assessment', (tester) async {
      await pump(tester);
      await openAi(tester);
      await tapKey(tester, 'ai-tool-lessonPlan');
      await tester.enterText(find.byKey(const Key('lesson-topic')), 'The water cycle');
      await tapKey(tester, 'lesson-generate');
      expect(bodyOf(calls('/v1/ai/lesson-plan').single), {'topic': 'The water cycle', 'minutes': 45, 'language': 'en', 'fresh': false});
      expect(find.text('Explain the water cycle'), findsOneWidget);
      expect(find.text('25 min'), findsOneWidget);
      expect(find.text('Draw the cycle together'), findsOneWidget);
      expect(find.text('Chart paper'), findsOneWidget);
      expect(find.text('Exit ticket with two questions.'), findsOneWidget);
      expect(find.text(previewLabel), findsNothing, reason: 'real answers carry no preview label');

      await tapKey(tester, 'panel-back');
      expect(find.byKey(const Key('ai-ask')), findsOneWidget);
    });

    testBoard('fits the steps to the chosen length (a 45-minute reply for a 30-minute lesson)', (tester) async {
      await pump(tester);
      await openAi(tester);
      await tapKey(tester, 'ai-tool-lessonPlan');
      await tester.tap(find.text('45 min'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('30 min').last);
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('lesson-topic')), 'The water cycle');
      await tapKey(tester, 'lesson-generate');
      expect(bodyOf(calls('/v1/ai/lesson-plan').single)['minutes'], 30);
      expect(find.text('STEPS · 30 MIN'), findsOneWidget);
      expect(find.text('16 min'), findsOneWidget);
      expect(find.text('7 min'), findsNWidgets(2));
      expect(find.text('25 min'), findsNothing);
    });
  });

  group('Read board', () {
    testBoard('sends the open page as a PNG and shows the text it read', (tester) async {
      await pump(tester);
      await openAi(tester);
      await tapKey(tester, 'ai-tool-readBoard');
      await tester.tap(find.byKey(const Key('read-board')));
      // Rendering the page to PNG is real (not fake-async) work.
      for (var i = 0; i < 5 && calls('/v1/ai/read-board').isEmpty; i++) {
        await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
        await tester.pump();
      }
      await tester.pumpAndSettle();
      final image = bodyOf(calls('/v1/ai/read-board').single)['image'] as String;
      expect(base64Decode(image).sublist(1, 4), 'PNG'.codeUnits);
      expect(find.text('Goodwill = Super profit × 3'), findsOneWidget);
      expect(find.text('G = SP \\times 3'), findsOneWidget);

      await tapKey(tester, 'reading-ask');
      expect(bodyOf(calls('/v1/ai/explain').single)['question'], 'Explain this from the board: Goodwill = Super profit × 3');
    });
  });

  group('Layout', () {
    for (final size in [const Size(1920, 1080), const Size(1280, 720)]) {
      testBoard('every AI page fits at ${size.width.toInt()}×${size.height.toInt()}, also at the narrowest panel', (tester) async {
        await pump(tester, size: size);
        await openAi(tester);
        await ask(tester, 'A long question about the causes of the French Revolution and its effects on Europe');
        for (final narrow in [false, true]) {
          if (narrow) {
            await tester.drag(find.byKey(const Key('panel-divider')), const Offset(2000, 0));
            await tester.pumpAndSettle();
          }
          expect(tester.takeException(), isNull);
          await tapKey(tester, 'ai-tool-quiz');
          await tapKey(tester, 'quiz-generate');
          expect(tester.takeException(), isNull, reason: 'quiz');
          await tapKey(tester, 'panel-back');
          await tapKey(tester, 'ai-tool-homework');
          // The draft from the first round is still open on the second.
          if (!narrow) await tapKey(tester, 'homework-generate');
          expect(find.byKey(const Key('homework-title')), findsOneWidget);
          expect(tester.takeException(), isNull, reason: 'homework');
          await tapKey(tester, 'panel-back');
          await tapKey(tester, 'ai-tool-lessonPlan');
          await tapKey(tester, 'lesson-generate');
          expect(tester.takeException(), isNull, reason: 'lesson plan');
          await tapKey(tester, 'panel-back');
          await tapKey(tester, 'ai-tool-math');
          await tester.enterText(find.byKey(const Key('math-input')), 'x^2/2 - x/3 = 1');
          await tapKey(tester, 'math-solve');
          expect(tester.takeException(), isNull, reason: 'math');
          await tapKey(tester, 'panel-back');
        }
        // The presenter fills the screen.
        await tapKey(tester, 'ai-tool-quiz');
        await tapKey(tester, 'quiz-present');
        await tapKey(tester, 'presenter-reveal');
        expect(tester.takeException(), isNull, reason: 'presenter');
      });
    }
  });

  test('quizAsHomework and homeworkInstructions format the text', () {
    final quiz = Quiz(topic: 'T', questions: [QuizQuestion(question: 'Q?', options: ['a', 'b', 'c', 'd'], answer: 1, explanation: '')]);
    expect(quizAsHomework(quiz), 'Answer these multiple-choice questions. Write the letter of the correct option.\n\n1. Q?\n   A) a\n   B) b\n   C) c\n   D) d');
    final draft = HomeworkDraft(title: 't', instructions: 'Do it.', questions: [HomeworkQuestion(question: 'One', marks: 1), HomeworkQuestion(question: ' ', marks: 3)]);
    expect(homeworkInstructions(draft), 'Do it.\n\n1. One (1 mark)\n\nTotal: 1 mark');
  });
}
