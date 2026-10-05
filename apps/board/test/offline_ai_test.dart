import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/core/realtime.dart';
import 'package:kinetix_board/demo/demo.dart';
import 'package:kinetix_board/features/ai/ai_controller.dart';
import 'package:kinetix_board/features/ai/ai_widgets.dart';
import 'package:kinetix_board/features/offline_ai/offline_ai.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _NoRealtime extends Realtime {
  _NoRealtime() : super('http://test');
  @override
  void connect(String token) {}
  @override
  void dispose() {}
}

void main() {
  const ai = OfflineAi();

  group('Offline notes', () {
    test('has the prototype\'s 74 topics, each with notes and questions', () {
      expect(topics, hasLength(74));
      expect(topics.map((t) => t.title).toSet(), hasLength(74), reason: 'titles are unique');
      for (final t in topics) {
        expect(t.keywords, isNotEmpty, reason: t.title);
        expect(t.summary, isNotEmpty, reason: t.title);
        expect(t.keyPoints, isNotEmpty, reason: t.title);
        expect(t.quiz, isNotEmpty, reason: t.title);
      }
    });

    test('finds the topic by whole words and phrases, plurals too', () {
      expect(findTopic('What is photosynthesis?')?.title, 'Photosynthesis');
      expect(findTopic('Explain the Pythagoras theorem with an example')?.title, 'Pythagoras theorem');
      expect(findTopic('adding FRACTIONS with unlike denominators')?.title, 'Fractions');
      expect(findTopic('irrational numbers')?.title, 'Number systems');
      // A word inside another word does not count.
      expect(findTopic('arrange the chairs'), isNull);
      expect(findTopic('What is share forfeiture?'), isNull);
      expect(findTopic(''), isNull);
    });

    test('the longest matching keyword wins', () {
      // "right triangle" (Pythagoras) beats a bare word another topic might share.
      expect(findTopic('the hypotenuse of a right triangle')?.title, 'Pythagoras theorem');
    });

    test('answers, quizzes, homework and lesson plans from the notes, marked offline', () {
      final e = ai.explain('Tell me about photosynthesis')!;
      expect(e.meta.offline, isTrue);
      expect(e.meta.preview, isTrue);
      expect(e.result.answer, contains('sunlight'));
      expect(e.result.keyPoints, isNotEmpty);

      final q = ai.quiz('photosynthesis', count: 2)!;
      expect(q.result.questions, hasLength(2));
      for (final x in q.result.questions) {
        expect(x.answer, inInclusiveRange(0, x.options.length - 1));
      }

      final h = ai.homework('fractions', count: 3)!;
      expect(h.result.questions, hasLength(3));
      expect(h.result.title, contains('Fractions'));

      final p = ai.lessonPlan('pythagoras', minutes: 40)!;
      expect(p.result.steps.fold(0, (s, x) => s + x.minutes), 40);
      expect(p.result.objectives, isNotEmpty);
      expect(p.meta.offline, isTrue);
    });

    test('makes nothing up for topics it does not know', () {
      expect(ai.explain('What is share forfeiture?'), isNull);
      expect(ai.quiz('goodwill', count: 5), isNull);
      expect(ai.homework('goodwill', count: 5), isNull);
      expect(ai.lessonPlan('goodwill', minutes: 45), isNull);
    });

    test('tells "cannot reach" apart from refusals', () {
      expect(cloudUnreachable(http.ClientException('Network is unreachable')), isTrue);
      expect(cloudUnreachable(ApiException(503, 'down')), isTrue);
      expect(cloudUnreachable(ApiException(422, 'Not for the classroom')), isFalse);
      expect(cloudUnreachable(ApiException(429, 'quota')), isFalse);
    });
  });

  group('KINETIX AI falls back to the notes', () {
    late List<http.Request> requests;
    late bool offline;

    Future<(BoardController, AiController)> board() async {
      SharedPreferences.setMockInitialValues({});
      requests = [];
      final client = MockClient((req) async {
        requests.add(req);
        if (req.url.path == '/v1/devices/enroll') return http.Response('{"deviceToken": "dev", "device": {"name": "Board"}}', 201);
        if (offline) throw http.ClientException('Network is unreachable');
        return http.Response('[]', 200);
      });
      final b = BoardController(apiFactory: (url) => ApiClient(baseUrl: url, client: client), realtimeFactory: (_) => _NoRealtime(), outboxStore: MemoryOutboxStore());
      await b.enroll('http://test', 'KX-AAAA-BBBB');
      b.onPaired(
        'session-token',
        SessionContext(sessionId: 's1', expiresAt: DateTime.now().add(const Duration(hours: 1)), teacherId: 't1', teacherName: 'Anita Sharma', language: 'en', subjectName: 'Science'),
      );
      addTearDown(b.dispose);
      final controller = AiController(b);
      addTearDown(controller.dispose);
      return (b, controller);
    }

    test('with no network, a known topic gets the offline answer; nothing else is invented', () async {
      offline = true;
      final (_, c) = await board();
      await c.ask('What is photosynthesis?');
      expect(c.explain.error, isNull);
      expect(c.explain.value!.meta.offline, isTrue);
      expect(requests.where((r) => r.url.path == '/v1/ai/explain'), hasLength(1), reason: 'KINETIX AI is tried first');

      await c.generateQuiz('Pythagoras');
      expect(c.quiz.value!.meta.offline, isTrue);

      await c.generateHomework('fractions');
      expect(c.homeworkOffline, isTrue);

      await c.ask('What is share forfeiture?');
      expect(c.explain.error, isA<http.ClientException>());
    });

    test('when the server answers, its answer (or error) stands', () async {
      offline = false;
      final (_, c) = await board();
      await c.ask('What is photosynthesis?');
      // The fake server sends no AI answer: the error is the server's, not replaced by notes.
      expect(c.explain.value, isNull);
      expect(c.explain.error, isNotNull);
    });

    test('a demo build answers known topics on the board, with no request', () async {
      offline = false;
      Demo.enabled = true;
      addTearDown(() => Demo.enabled = false);
      final (_, c) = await board();
      await c.ask('Explain photosynthesis');
      expect(c.explain.value!.meta.offline, isTrue);
      expect(requests.where((r) => r.url.path.startsWith('/v1/ai/')), isEmpty);
    });
  });

  testWidgets('offline answers are labelled in every language', (tester) async {
    for (final lang in ['en', 'hi', 'kn']) {
      await tester.pumpWidget(
        MaterialApp(
          theme: KinetixTheme.light(),
          locale: Locale(lang),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(body: AiNotice.preview(offline: true)),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('ai-offline')), findsOneWidget);
      expect(find.text(lookupAppLocalizations(Locale(lang)).aiOfflineLabel), findsOneWidget);
    }
  });
}
