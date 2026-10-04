import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/core/api.dart';
import 'package:kinetix_student/core/models.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  Future<void> openLearn(WidgetTester tester) => openTab(tester, 'Learn');

  Future<void> ask(WidgetTester tester, String q) async {
    await tester.enterText(find.byKey(const Key('question')), q);
    await tester.pump();
    await tester.tap(find.byKey(const Key('askButton')));
    await tester.pumpAndSettle();
  }

  final list = find.byKey(const Key('askList'));
  Future<void> scrollAsk(WidgetTester tester, Finder f) => scrollTo(
    tester,
    f,
    scrollable: find.descendant(of: list, matching: find.byType(Scrollable)).first,
  );

  testWidgets('asks a doubt and shows the answer, key points, sources and follow-ups', (tester) async {
    final (api, _) = await pumpApp(tester);
    await openLearn(tester);
    // The Ask button waits for a question.
    expect(tester.widget<FilledButton>(find.byKey(const Key('askButton'))).onPressed, isNull);

    await ask(tester, 'Explain underwriting commission');
    expect(api.explainRequests.single, {
      'question': 'Explain underwriting commission',
      'language': 'en',
      'sectionId': 'sec1',
      'subjectId': null,
      'topicId': null,
    });
    expect(find.text('Explain underwriting commission'), findsWidgets);
    expect(find.textContaining('Underwriting commission is paid to underwriters'), findsOneWidget);
    expect(find.byKey(const Key('previewNotice')), findsNothing);
    await scrollAsk(tester, find.byKey(const Key('followUp-1')));
    expect(find.text('Key points'), findsOneWidget);
    expect(find.text('Limited by the Companies Act, 2013'), findsOneWidget);
    expect(find.text('Based on'), findsOneWidget);
    expect(find.byKey(const Key('source-t1')), findsOneWidget);
    expect(find.text('How is net liability worked out?'), findsOneWidget);
  });

  testWidgets('on a small phone the answer scrolls into view', (tester) async {
    await pumpApp(tester, size: const Size(360, 640));
    await openLearn(tester);
    await tester.enterText(find.byKey(const Key('question')), 'Explain underwriting commission');
    await tester.pump();
    await tester.ensureVisible(find.byKey(const Key('askButton')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('askButton')));
    await tester.pumpAndSettle();
    final card = tester.getRect(find.byKey(const Key('answerCard')));
    final list = tester.getRect(find.byKey(const Key('askList')));
    expect(card.top, inInclusiveRange(list.top, list.top + 40));
  });

  testWidgets('a preview answer is clearly labelled', (tester) async {
    await pumpApp(
      tester,
      setup: (api) => api.answer = Explanation(
        answer: 'Preview answer about "goodwill".',
        keyPoints: ['Define the key terms'],
        followUps: [],
        preview: true,
        sources: [],
      ),
    );
    await openLearn(tester);
    await ask(tester, 'What is goodwill?');
    expect(find.byKey(const Key('previewNotice')), findsOneWidget);
    expect(find.text('Preview answer'), findsOneWidget);
    expect(find.textContaining("isn't connected at your college yet"), findsOneWidget);
    expect(find.text('Based on'), findsNothing);
  });

  testWidgets('shows that it is thinking while the answer comes', (tester) async {
    final gate = Completer<void>();
    await pumpApp(tester, setup: (api) => api.explainGate = gate);
    await openLearn(tester);
    await tester.enterText(find.byKey(const Key('question')), 'What is a cost sheet?');
    await tester.pump();
    await tester.tap(find.byKey(const Key('askButton')));
    await tester.pump();
    expect(find.byKey(const Key('aiThinking')), findsOneWidget);
    expect(find.text('KINETIX AI is thinking…'), findsOneWidget);
    // No second question while one is on its way.
    expect(tester.widget<FilledButton>(find.byKey(const Key('askButton'))).onPressed, isNull);
    gate.complete();
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('aiThinking')), findsNothing);
    expect(find.byKey(const Key('answerText')), findsOneWidget);
  });

  testWidgets('answers in the chosen language, and remembers it', (tester) async {
    final (api, state) = await pumpApp(tester);
    await openLearn(tester);
    await tester.tap(find.byKey(const Key('lang-kn')));
    await tester.pumpAndSettle();
    await ask(tester, 'ಷೇರುಗಳ ಮುಟ್ಟುಗೋಲು ಎಂದರೇನು?');
    expect(api.explainRequests.single['language'], 'kn');
    expect(find.text('ಕನ್ನಡ'), findsWidgets);
    expect(state.aiLanguage, AiLanguage.kn);
    expect(state.prefs.getString('ai_language'), 'kn');
  });

  testWidgets('the language defaults to the profile language', (tester) async {
    final (_, state) = await pumpApp(
      tester,
      setup: (api) =>
          api.profile = Me(id: 'u1', fullName: 'Aarav Patel', roles: ['student'], preferredLanguage: 'hi', institution: 'Demo College'),
    );
    expect(state.aiLanguage, AiLanguage.hi);
    // The app speaks the profile language too, so Learn is "सीखें".
    await openTab(tester, 'सीखें');
    expect(tester.widget<ChoiceChip>(find.byKey(const Key('lang-hi'))).selected, isTrue);
  });

  testWidgets('a subject chip sends the subject for syllabus grounding', (tester) async {
    final (api, _) = await pumpApp(tester);
    await openLearn(tester);
    expect(find.byKey(const Key('subject-sub1')), findsOneWidget);
    expect(find.byKey(const Key('subject-sub2')), findsOneWidget);
    await tester.tap(find.byKey(const Key('subject-sub2')));
    await tester.pumpAndSettle();
    await ask(tester, 'What is a cost sheet?');
    expect(api.explainRequests.single['subjectId'], 'sub2');
  });

  testWidgets('a follow-up chip asks it; earlier questions stay reachable', (tester) async {
    final (api, _) = await pumpApp(tester);
    await openLearn(tester);
    await ask(tester, 'Explain underwriting commission');
    await scrollAsk(tester, find.byKey(const Key('followUp-0')));
    await tester.tap(find.byKey(const Key('followUp-0')));
    await tester.pumpAndSettle();
    expect(api.explainRequests.last['question'], 'How is net liability worked out?');
    expect(find.byKey(const Key('askedQuestion')), findsOneWidget);
    expect(tester.widget<Text>(find.byKey(const Key('askedQuestion'))).data, 'How is net liability worked out?');

    await scrollAsk(tester, find.byKey(const Key('history-0')));
    expect(find.text('Earlier questions'), findsOneWidget);
    await tester.tap(find.byKey(const Key('history-0')));
    await tester.pumpAndSettle();
    expect(tester.widget<Text>(find.byKey(const Key('askedQuestion'))).data, 'Explain underwriting commission');
    // Shown again without asking again.
    expect(api.explainRequests, hasLength(2));
  });

  testWidgets('"Based on" opens the topic with its notes and outcomes', (tester) async {
    final (api, _) = await pumpApp(tester);
    await openLearn(tester);
    await ask(tester, 'Explain underwriting commission');
    await scrollAsk(tester, find.byKey(const Key('source-t1')));
    await tester.tap(find.byKey(const Key('source-t1')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('topic t1'));
    expect(find.byKey(const Key('topicTitle')), findsOneWidget);
    expect(find.text('Underwriting is an agreement to take up shares not subscribed by the public.'), findsOneWidget);
    await scrollTo(tester, find.textContaining('not been reviewed'));
    expect(find.text("Compute each underwriter's net liability"), findsOneWidget);
  });

  testWidgets('asking from a topic page sends the topic and keeps the language', (tester) async {
    final (api, _) = await pumpApp(tester);
    await openLearn(tester);
    await tester.tap(find.byKey(const Key('lang-hi')));
    await tester.pumpAndSettle();
    await ask(tester, 'Explain underwriting commission');
    await scrollAsk(tester, find.byKey(const Key('source-t1')));
    await tester.tap(find.byKey(const Key('source-t1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('askAboutTopic')));
    await tester.pumpAndSettle();
    expect(find.text('About: Underwriting and underwriting commission'), findsOneWidget);
    expect(tester.widget<ChoiceChip>(find.byKey(const Key('lang-hi'))).selected, isTrue);
    await ask(tester, 'Give me an example');
    expect(api.explainRequests.last, containsPair('topicId', 't1'));
    expect(api.explainRequests.last, containsPair('language', 'hi'));
  });

  group('errors', () {
    Future<FakeStudentApi> askWith(WidgetTester tester, ApiException e) async {
      final (api, _) = await pumpApp(tester, setup: (api) => api.explainError = e);
      await openLearn(tester);
      await ask(tester, 'Tell me something');
      return api;
    }

    testWidgets('an unsafe question is refused without a retry', (tester) async {
      await askWith(tester, ApiException(422, "KINETIX AI can't help with that request. Try rephrasing it for the classroom."));
      expect(find.text("KINETIX AI can't answer that"), findsOneWidget);
      expect(find.text("KINETIX AI can't help with that request. Try rephrasing it for the classroom."), findsOneWidget);
      expect(find.byKey(const Key('aiRetry')), findsNothing);
    });

    testWidgets("the day's allowance used up says so", (tester) async {
      await askWith(tester, ApiException(429, "Your institution has used today's KINETIX AI allowance. It resets tomorrow."));
      expect(find.text("Today's KINETIX AI allowance is used up"), findsOneWidget);
      expect(find.textContaining('It resets tomorrow.'), findsOneWidget);
      expect(find.byKey(const Key('aiRetry')), findsNothing);
    });

    testWidgets('unreachable: try again works', (tester) async {
      final api = await askWith(tester, ApiException(503, 'KINETIX AI is not reachable right now. Try again in a minute.'));
      expect(find.text('KINETIX AI is not reachable'), findsOneWidget);
      api.explainError = null;
      await tester.tap(find.byKey(const Key('aiRetry')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('aiError')), findsNothing);
      expect(find.byKey(const Key('answerText')), findsOneWidget);
      expect(api.explainRequests, hasLength(2));
    });

    testWidgets('offline offers a retry too', (tester) async {
      await askWith(tester, ApiException(0, "Can't reach KINETIX. Check your internet connection and the server address."));
      expect(find.text('No connection'), findsOneWidget);
      expect(find.byKey(const Key('aiRetry')), findsOneWidget);
    });
  });

  group('syllabus', () {
    Future<void> openSyllabus(WidgetTester tester) async {
      await openLearn(tester);
      await tester.tap(find.byKey(const Key('tabSyllabus')));
      await tester.pumpAndSettle();
    }

    testWidgets("lists the class's subjects and browses a syllabus", (tester) async {
      final (api, _) = await pumpApp(tester);
      await openSyllabus(tester);
      expect(find.byKey(const Key('subjectTile-sub1')), findsOneWidget);
      expect(find.byKey(const Key('subjectTile-sub2')), findsOneWidget);
      expect(api.calls, contains('subjects'));
      expect(api.calls.where((c) => c.startsWith('homework ')), isEmpty);

      await tester.tap(find.byKey(const Key('subjectTile-sub1')));
      await tester.pumpAndSettle();
      expect(find.text('Corporate Accounting, BCom Semester 3\u00a0· 2\u00a0chapters · 2\u00a0topics'), findsOneWidget);
      expect(find.text('1. Underwriting of Shares'), findsOneWidget);
      await tester.tap(find.byKey(const Key('topic-t1')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('topicTitle')), findsOneWidget);
    });

    testWidgets('a subject not linked to the library says so', (tester) async {
      await pumpApp(tester);
      await openSyllabus(tester);
      await tester.tap(find.byKey(const Key('subjectTile-sub2')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('noSyllabus')), findsOneWidget);
    });

    testWidgets('no subjects set up yet: search still works', (tester) async {
      final (api, _) = await pumpApp(tester, setup: (api) => api.subjectOfHomework.clear());
      await openSyllabus(tester);
      expect(find.byKey(const Key('noSubjects')), findsOneWidget);
      api.hits = [
        TopicHit(
          id: 't1',
          title: 'Underwriting and underwriting commission',
          summary: '',
          chapterTitle: 'Underwriting of Shares',
          courseTitle: 'Corporate Accounting, BCom Semester 3',
        ),
      ];
      await tester.enterText(find.byKey(const Key('search')), 'underwriting');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(api.calls, contains('search underwriting'));
      expect(find.text('1 topic'), findsOneWidget);
      await tester.tap(find.byKey(const Key('hit-t1')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('topicTitle')), findsOneWidget);
    });

    testWidgets('search with no matches suggests what to do', (tester) async {
      final (api, _) = await pumpApp(tester);
      await openSyllabus(tester);
      await tester.enterText(find.byKey(const Key('search')), 'zzz');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('noHits')), findsOneWidget);
      // One letter does not search.
      await tester.enterText(find.byKey(const Key('search')), 'z');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(api.calls.where((c) => c.startsWith('search')), hasLength(1));
      expect(find.byKey(const Key('subjectTile-sub1')), findsOneWidget);
    });
  });
}
