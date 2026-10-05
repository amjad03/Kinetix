import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/core/live.dart';
import 'package:kinetix_student/core/models.dart';

import 'fake_live.dart';
import 'helpers.dart';

/// The teacher's "Ask the class" on the board, answered from the Student App.
void main() {
  ClassQuestion mcq() => ClassQuestion(
    id: 'p1',
    numeric: false,
    question: 'Which shares can a company redeem?',
    options: const ['A', 'B', 'C', 'D'],
    teacher: 'Anita Sharma',
    subject: 'Corporate Accounting',
  );

  testWidgets('a question asked on the board appears live; the student answers and can change it', (tester) async {
    final server = FakeLiveServer();
    final (api, _) = await pumpApp(tester, live: server);
    expect(find.byKey(const Key('liveQuestionBanner')), findsNothing);

    // The teacher asks: the socket says so and the banner appears without a refresh.
    api.question = mcq();
    server.last.send(const LivePollChanged());
    await tester.pumpAndSettle();
    expect(find.text('Live question'), findsOneWidget);
    expect(find.text('Tap to answer'), findsOneWidget);

    await tester.tap(find.byKey(const Key('liveQuestionBanner')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('answer-1')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('answer p1 1'));
    expect(find.text('Your answer: B (you can change it)'), findsOneWidget);

    await tester.tap(find.byKey(const Key('liveQuestionBanner')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('answer-3')));
    await tester.pumpAndSettle();
    expect(find.text('Your answer: D (you can change it)'), findsOneWidget);

    // The teacher ends it: the banner goes.
    api.question = null;
    server.last.send(const LivePollChanged());
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('liveQuestionBanner')), findsNothing);
  });

  testWidgets('a number question takes a number; a closed one says so', (tester) async {
    final (api, _) = await pumpApp(
      tester,
      setup: (api) => api.question = ClassQuestion(id: 'p2', numeric: true, question: 'Premium per share?', options: const [], teacher: 'Anita Sharma'),
    );
    await tester.tap(find.byKey(const Key('liveQuestionBanner')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('answer-number')), '2.50');
    await tester.tap(find.byKey(const Key('answer-send')));
    await tester.pumpAndSettle();
    expect(find.text('Your answer: 2.5 (you can change it)'), findsOneWidget);

    await tester.tap(find.byKey(const Key('liveQuestionBanner')));
    await tester.pumpAndSettle();
    api.question = ClassQuestion(id: 'other', numeric: false, question: 'x', options: const ['A', 'B'], teacher: '');
    await tester.enterText(find.byKey(const Key('answer-number')), '3');
    await tester.tap(find.byKey(const Key('answer-send')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('answer-error')), findsOneWidget);
  });
}
