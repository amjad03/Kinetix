// Student insights for a class and the AI copilot.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/core/api.dart';
import 'package:kinetix_teacher/core/insights_models.dart';
import 'package:kinetix_teacher/features/ai/ai_copilot_screen.dart';
import 'package:kinetix_teacher/features/insights/section_insights_screen.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  late FakeTeacherApi api;
  setUp(() => api = FakeTeacherApi());

  group('Student insights', () {
    testWidgets('shows class figures and puts students who need attention first', (tester) async {
      phone(tester);
      await tester.pumpWidget(localizedApp(home: SectionInsightsScreen(api: api)));
      await tester.pumpAndSettle();
      expect(api.calls, contains('sectionInsights sec1'));
      expect(find.descendant(of: find.byKey(const Key('classAttendance')), matching: find.text('81%')), findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('classMarks')), matching: find.text('62%')), findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('classFlagged')), matching: find.text('1')), findsOneWidget);
      expect(find.text('High risk'), findsOneWidget);
      expect(find.text('Attendance 50% · Marks 15% · 2 failed tests'), findsOneWidget);
      // Aarav is flagged, so he comes before Meera.
      final aarav = tester.getTopLeft(find.byKey(const Key('insight-st1'))).dy;
      final meera = tester.getTopLeft(find.byKey(const Key('insight-st2'))).dy;
      expect(aarav, lessThan(meera));
    });

    testWidgets('a failed request shows the error with Retry', (tester) async {
      api.insightsError = ApiException(500, 'Server error');
      phone(tester);
      await tester.pumpWidget(localizedApp(home: SectionInsightsScreen(api: api)));
      await tester.pumpAndSettle();
      expect(find.text('Retry'), findsOneWidget);
      api.insightsError = null;
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('insight-st1')), findsOneWidget);
    });

    test('parses the API shape and orders by risk', () {
      final i = SectionInsights.fromJson({
        'students': [
          {'studentId': 'a', 'studentName': 'A', 'rollNo': '1', 'level': 'low', 'attendancePct': null, 'marksAvgPct': 70, 'failingMarks': 0},
          {'studentId': 'b', 'studentName': 'B', 'rollNo': '2', 'level': 'high', 'attendancePct': 40, 'marksAvgPct': null, 'failingMarks': 1},
        ],
      });
      expect(i.byRisk.map((s) => s.studentId), ['b', 'a']);
      expect(i.flaggedCount, 2);
    });
  });

  group('AI copilot', () {
    Future<void> pump(WidgetTester tester, {String language = 'en'}) async {
      phone(tester);
      await tester.pumpWidget(localizedApp(home: AiCopilotScreen(api: api, language: language), language: language));
      await tester.pumpAndSettle();
    }

    testWidgets('explains a topic and labels the result a draft', (tester) async {
      await pump(tester);
      expect(tester.widget<FilledButton>(find.byKey(const Key('generate'))).onPressed, isNull);
      await tester.enterText(find.byKey(const Key('copilotInput')), 'What are shares?');
      await tester.pump();
      await tester.tap(find.byKey(const Key('generate')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('ai explain What are shares?   en'));
      expect(find.byKey(const Key('draftLabel')), findsOneWidget);
      expect(find.textContaining('AI draft. Check it'), findsOneWidget);
      expect(find.text('Shares are units of ownership.'), findsOneWidget);
      expect(find.text('Issued at par or premium'), findsOneWidget);
    });

    testWidgets('drafts a quiz with the chosen number of questions and marks the answer', (tester) async {
      await pump(tester);
      await tester.tap(find.byKey(const Key('task-quiz')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('copilotInput')), 'Share capital');
      await tester.pump();
      await tester.tap(find.byKey(const Key('generate')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('ai quiz Share capital 5  en'));
      expect(find.text('A. Face value  ✓'), findsOneWidget);
    });

    testWidgets('a lesson plan lists its steps; a sample output says no AI is connected', (tester) async {
      api.aiSample = true;
      await pump(tester);
      await tester.tap(find.byKey(const Key('task-lessonPlan')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('copilotInput')), 'Forfeiture of shares');
      await tester.pump();
      await tester.tap(find.byKey(const Key('generate')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('ai lesson-plan Forfeiture of shares  45 en'));
      expect(find.text('10 min · Recap'), findsOneWidget);
      expect(find.textContaining('Sample only'), findsOneWidget);
    });

    testWidgets('reads in Hindi and Kannada', (tester) async {
      for (final lang in ['hi', 'kn']) {
        await pump(tester, language: lang);
        expect(find.text(strings(lang).copilotTitle), findsOneWidget);
        expect(find.text(strings(lang).copilotGenerate), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
      }
    });
  });
}
