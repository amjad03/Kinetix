// Question-wise marks tagged to COs, and the course-outcome approval workflow (Profile → Course outcomes).

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_teacher/core/academics_models.dart';
import 'package:zynetix_teacher/core/obe_models.dart';
import 'package:zynetix_teacher/features/work/obe_flagship_screens.dart';
import 'package:zynetix_teacher/features/work/obe_screens.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  late FakeTeacherApi api;
  setUp(() {
    api = FakeTeacherApi();
    seed(api);
  });

  group('models', () {
    test('a paper reads its questions, CO tags and the students\' question marks', () {
      final p = QuestionPaper.fromJson({
        'assessment': {'id': 'a', 'title': 'IA 1', 'section': 'A', 'subject': 'BC 1', 'maxMarks': 20, 'evidence': 'cie'},
        'editable': true,
        'cos': [
          {'id': 'c1', 'code': 'CO1', 'statement': 's'},
          {'id': 'c2', 'code': 'CO2', 'statement': 't'},
        ],
        'questions': [
          {
            'id': 'q1',
            'no': '1',
            'part': 'A',
            'maxMarks': 5,
            'bloomLevel': 'apply',
            'cos': [
              {'coId': 'c1', 'weight': 1},
              {'coId': 'c2', 'weight': 1},
            ],
          },
          {'id': 'q2', 'no': '2', 'part': 'B', 'maxMarks': '7.5', 'cos': []},
        ],
        'students': [
          {
            'id': 's1',
            'rollNo': '01',
            'name': 'A',
            'absent': false,
            'total': 9,
            'marks': {'q1': 4, 'q2': null},
          },
        ],
      });
      expect(p.paperMarks, 12.5);
      expect(p.coCodes(p.questions.first), 'CO1, CO2');
      expect(p.coCodes(p.questions.last), '');
      expect(p.students.single.marks, {'q1': 4.0, 'q2': null});
    });

    test('a typed mark is empty, a number in range, or invalid', () {
      expect(readQuestionMark('', 5), (value: null, ok: true));
      expect(readQuestionMark(' 4.5 ', 5), (value: 4.5, ok: true));
      expect(readQuestionMark('6', 5).ok, isFalse);
      expect(readQuestionMark('x', 5).ok, isFalse);
    });

    test('only a draft not yet in review can be sent', () {
      CoSet set(String status, String stage) => CoSet(id: 'x', version: 1, status: status, outcomes: const [], reviewStage: stage);
      expect(
        [
          set('draft', 'draft').canSubmit,
          set('draft', 'returned').canSubmit,
          set('draft', 'hod').canSubmit,
          set('active', 'approved').canSubmit,
        ],
        [true, true, false, false],
      );
      expect(CoSet.fromJson({'id': 'x', 'version': 1, 'status': 'draft', 'outcomes': []}).reviewStage, 'draft');
    });
  });

  group('question-wise marks', () {
    testWidgets('lists the course assessments with their progress and enters marks question by question', (tester) async {
      phone(tester, size: const Size(412, 1400));
      await tester.pumpWidget(
        localizedApp(
          home: CourseAssessmentsScreen(api: api, subjectId: 'sub1', title: 'Corporate Accounting'),
        ),
      );
      await tester.pumpAndSettle();
      expect(api.calls.last, 'courseAssessments sub1 ay1');
      expect(find.textContaining('3 of 3 questions tagged · 1 of 2 students marked'), findsOneWidget);

      await tapAndSettle(tester, find.byKey(const Key('obeAssessment-qa1')));
      // The paper's questions with their marks and COs head the screen.
      expect(find.text('Q3 · 10 marks · CO2'), findsOneWidget);
      expect(find.text('Total 14 / 20'), findsOneWidget);

      // A mark above the question's maximum is flagged and not saved.
      await tester.enterText(find.byKey(const Key('qm-st2-1')), '6');
      await tester.pump();
      expect(find.text('0 to 5'), findsOneWidget);
      await tapAndSettle(tester, find.byKey(const Key('saveQuestionMarks')));
      expect(find.text(strings('en').obeMarksFix), findsOneWidget);
      expect(api.savedQuestionMarks, isEmpty);

      await tester.enterText(find.byKey(const Key('qm-st2-1')), '5');
      await tester.enterText(find.byKey(const Key('qm-st2-3')), '8.5');
      await tester.pump();
      expect(tester.widget<Text>(find.byKey(const Key('qmTotal-st2'))).data, 'Total 13.5 / 20');
      await tapAndSettle(tester, find.byKey(const Key('saveQuestionMarks')));
      expect(find.text('Question-wise marks saved'), findsOneWidget);
      // Only the changed student is sent, with every question (blank ones as not entered).
      final sent = api.savedQuestionMarks.single;
      expect(sent.map((e) => e.studentId), ['st2']);
      expect(sent.single.marks, {'q1': 5.0, 'q2': null, 'q3': 8.5});
    });

    testWidgets('an absent student has no marks fields and is saved as absent', (tester) async {
      phone(tester, size: const Size(412, 1400));
      await tester.pumpWidget(
        localizedApp(
          home: QuestionMarksScreen(api: api, assessmentId: 'qa1'),
        ),
      );
      await tester.pumpAndSettle();
      await tapAndSettle(tester, find.byKey(const Key('qmAbsent-st1')));
      expect(find.byKey(const Key('qm-st1-1')), findsNothing);
      await tapAndSettle(tester, find.byKey(const Key('saveQuestionMarks')));
      expect(api.savedQuestionMarks.single.single.absent, isTrue);
      expect(api.questionPapers['qa1']!.students.first.absent, isTrue);
    });

    testWidgets('an assessment without a paper says where to set one, in Kannada too', (tester) async {
      phone(tester);
      await tester.pumpWidget(
        localizedApp(
          home: QuestionMarksScreen(api: api, assessmentId: 'qa2'),
          language: 'kn',
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text(strings('kn').obeNoPaper), findsOneWidget);
      expect(find.byKey(const Key('saveQuestionMarks')), findsNothing);
    });
  });

  group('approvals', () {
    testWidgets('a draft is sent for approval from the subject and then shows its step', (tester) async {
      phone(tester, size: const Size(412, 1400));
      api.coSetList = const [
        CoSet(
          id: 'cs3',
          version: 3,
          status: 'draft',
          outcomes: [CourseOutcome(id: 'co1', code: 'CO1', statement: 'Value goodwill')],
        ),
      ];
      api.submitWarnings = const ['CO1: check the action verb'];
      await tester.pumpWidget(
        localizedApp(
          home: SubjectOutcomesScreen(api: api, subjectId: 'sub1', title: 'Corporate Accounting', canSeeAttainment: false),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Not sent for approval'), findsOneWidget);
      await tapAndSettle(tester, find.byKey(const Key('submitCoSet')));
      await tester.enterText(find.byKey(const Key('submitNote')), 'Ready');
      await tapAndSettle(tester, find.byKey(const Key('confirmSubmitCoSet')));
      expect(api.calls, contains('submitCoSet cs3'));
      expect(find.text('Sent for approval, with one point for reviewers to check'), findsOneWidget);
      expect(find.text('With the head of department'), findsOneWidget);
      expect(find.byKey(const Key('submitCoSet')), findsNothing);
    });

    testWidgets('the reviewer sees what waits, needs a comment to return, and approves', (tester) async {
      phone(tester, size: const Size(412, 1400));
      await tester.pumpWidget(localizedApp(home: CoApprovalsScreen(api: api)));
      await tester.pumpAndSettle();
      expect(
        find.textContaining(
          'BCOM-3.2 · version 3 · 5 COs · With the head of department · Sent by Ravi Kumar · One CO to check the action verb',
        ),
        findsOneWidget,
      );

      await tapAndSettle(tester, find.byKey(const Key('coApproval-cs9')));
      expect(find.text('Revised CO3 after the BoS meeting\nRavi Kumar'), findsOneWidget);
      await tapAndSettle(tester, find.byKey(const Key('returnCoSet')));
      expect(find.text('Say what needs to change before returning.'), findsOneWidget);
      expect(api.calls.where((c) => c.startsWith('reviewCoSet')), isEmpty);

      await tapAndSettle(tester, find.byKey(const Key('approveCoSet')));
      expect(api.calls.last, 'reviewCoSet cs9 approve');
      // Back on the list, which is now empty.
      expect(find.text('Nothing is waiting for your approval.'), findsOneWidget);
    });

    testWidgets('someone whose step it is not can only comment', (tester) async {
      phone(tester);
      api.coReviewMap['cs9'] = const CoReviews(reviewStage: 'iqac', canDecide: false, history: []);
      await tester.pumpWidget(
        localizedApp(
          home: CoReviewScreen(api: api, coSetId: 'cs9', title: 'Business Statistics'),
          language: 'hi',
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('approveCoSet')), findsNothing);
      expect(find.text(strings('hi').obeNotYourStep), findsOneWidget);
      await tester.enterText(find.byKey(const Key('reviewComment')), 'CO2 needs a measurable verb');
      await tapAndSettle(tester, find.byKey(const Key('commentCoSet')));
      expect(api.calls.last, 'reviewCoSet cs9 comment CO2 needs a measurable verb');
    });

    testWidgets('the outcomes list opens the approvals', (tester) async {
      phone(tester);
      await tester.pumpWidget(
        localizedApp(
          home: OutcomesScreen(api: api, roles: const ['hod']),
        ),
      );
      await tester.pumpAndSettle();
      await tapAndSettle(tester, find.byKey(const Key('openCoApprovals')));
      expect(find.byKey(const Key('coApproval-cs9')), findsOneWidget);
    });
  });
}
