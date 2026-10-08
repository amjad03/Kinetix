import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/features/ai/quiz_panel.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

/// Spec §43: types beyond MCQ, timer, teams, Important / exam frequency (only when the bank
/// has it), AI explanation with the usual mistake, Add to Board.
void main() {
  final quiz = Quiz(topic: 'Goodwill', questions: [
    QuizQuestion(question: 'Which account records goodwill?', options: const ['Goodwill', 'Cash', 'Capital', 'Sales'], answer: 0, explanation: 'Intangible asset.', misconception: 'It is not cash.', examCount: 2, exams: const ['BU 2024', 'BU 2023'], important: true),
    QuizQuestion(question: 'Goodwill is an ____ asset.', options: const [], answer: 0, explanation: 'It cannot be touched.', type: 'fillBlank', answerText: 'intangible'),
  ]);

  Future<List<QuizQuestion>> pump(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final added = <QuizQuestion>[];
    await tester.pumpWidget(MaterialApp(
      theme: KinetixTheme.light(),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(body: QuizPresenter(quiz: quiz, onAddToBoard: added.add)),
    ));
    await tester.pumpAndSettle();
    return added;
  }

  testWidgets('badges come from the bank; reveal shows the explanation and the usual mistake', (tester) async {
    final added = await pump(tester);
    expect(find.byKey(const Key('presenter-important')), findsOneWidget);
    expect(find.text('Asked in 2 past papers'), findsOneWidget);
    await tester.tap(find.byKey(const Key('presenter-add-board')));
    await tester.pump();
    expect(added.single.question, startsWith('Which account'));
    await tester.tap(find.byKey(const Key('presenter-reveal')).first);
    await tester.pump();
    expect(find.textContaining('Common mistake: It is not cash.'), findsOneWidget);
    // A fill-in-the-blank question: no options, the answer on reveal; no badge without bank data.
    await tester.tap(find.byKey(const Key('presenter-next')).first);
    await tester.pump();
    expect(find.byKey(const Key('presenter-important')), findsNothing);
    await tester.tap(find.byKey(const Key('presenter-reveal')).first);
    await tester.pump();
    expect(find.byKey(const Key('presenter-answer')), findsOneWidget);
  });

  testWidgets('the timer reveals the answer when it runs out; teams keep score', (tester) async {
    await pump(tester);
    await tester.tap(find.byKey(const Key('presenter-timer')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('15 s').last);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('presenter-countdown')), findsOneWidget);
    await tester.pump(const Duration(seconds: 16));
    expect(find.byKey(const Key('presenter-countdown')), findsNothing);
    expect(find.textContaining('Common mistake'), findsOneWidget);
    await tester.tap(find.byKey(const Key('presenter-teams')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Teams: 2').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('presenter-team-1')));
    await tester.pump();
    expect(find.textContaining('Team 2: 1'), findsOneWidget);
  });
}
