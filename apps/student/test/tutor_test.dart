// The AI tutor: a conversation that remembers, with next steps from the student's own record, and that reopens where it stopped.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/core/api.dart';
import 'package:kinetix_student/core/models.dart';

import 'helpers.dart';

void main() {
  Future<void> openTutor(WidgetTester tester) async {
    await openTab(tester, 'Learn');
    await tester.tap(find.byKey(const Key('openTutor')));
    await tester.pumpAndSettle();
  }

  Future<void> say(WidgetTester tester, String q) async {
    await tester.enterText(find.byKey(const Key('tutorInput')), q);
    await tester.pump();
    await tester.tap(find.byKey(const Key('tutorSend')));
    await tester.pumpAndSettle();
  }

  testWidgets('asks, shows the answer with what to practise next, and continues the same conversation', (tester) async {
    final (api, _) = await pumpApp(tester);
    await openTutor(tester);
    expect(find.textContaining('Ask anything you are stuck on'), findsOneWidget);

    await say(tester, 'What is the accounting equation');
    expect(api.tutorRequests.single, {'question': 'What is the accounting equation', 'language': 'en', 'threadId': null, 'subjectId': null});
    expect(find.byKey(const Key('tutorMsg-0')), findsOneWidget);
    expect(find.textContaining('Think of what is the accounting equation step by step'), findsOneWidget);
    expect(find.text('Practise next'), findsOneWidget);
    expect(find.byKey(const Key('tutorStep-Try two questions on Corporate Accounting')), findsOneWidget);

    // A follow-up chip asks the next question in the same thread.
    await tester.tap(find.byKey(const Key('tutorFollowUp-0')));
    await tester.pumpAndSettle();
    expect(api.tutorRequests.last['threadId'], 'th1');
    expect(api.tutorRequests.last['question'], 'Can you give an example?');
    expect(find.byKey(const Key('tutorMsg-3')), findsOneWidget);
  });

  testWidgets('reopens the latest conversation, and a new one starts fresh', (tester) async {
    final (api, _) = await pumpApp(tester, setup: (a) {
      a.tutorLog
        ..add(const TutorMessage(fromStudent: true, text: 'Why does a trial balance balance?'))
        ..add(const TutorMessage(fromStudent: false, text: 'Every entry has a debit and a credit.'));
    });
    await openTutor(tester);
    expect(api.calls, contains('tutorMessages th1'));
    expect(find.text('Why does a trial balance balance?'), findsOneWidget);
    expect(find.text('Every entry has a debit and a credit.'), findsOneWidget);

    await tester.tap(find.byKey(const Key('tutorNew')));
    await tester.pumpAndSettle();
    expect(find.text('Why does a trial balance balance?'), findsNothing);
    await say(tester, 'What is a ledger');
    expect(api.tutorRequests.single['threadId'], isNull);
  });

  testWidgets('a refused or unreachable tutor keeps the question so it can be sent again', (tester) async {
    final (api, _) = await pumpApp(tester, setup: (a) => a.tutorError = ApiException(503, 'KINETIX AI is not reachable right now.'));
    await openTutor(tester);
    await say(tester, 'What is depreciation');
    expect(find.byKey(const Key('tutorError')), findsOneWidget);
    expect(tester.widget<TextField>(find.byKey(const Key('tutorInput'))).controller!.text, 'What is depreciation');
    api.tutorError = null;
    await tester.tap(find.byKey(const Key('tutorSend')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('tutorError')), findsNothing);
    expect(find.textContaining('Think of what is depreciation'), findsOneWidget);
  });
}
