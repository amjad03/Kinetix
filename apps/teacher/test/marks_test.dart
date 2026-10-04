import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/app.dart';
import 'package:kinetix_teacher/core/app_state.dart';
import 'package:kinetix_teacher/core/models.dart';
import 'package:kinetix_teacher/features/marks/marks_entry_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  late FakeTeacherApi api;

  setUp(() => api = FakeTeacherApi());

  Future<void> pumpApp(WidgetTester tester) async {
    phone(tester);
    SharedPreferences.setMockInitialValues({'token': 'tok'});
    final state = AppState(api, await SharedPreferences.getInstance());
    await tester.pumpWidget(TeacherApp(state: state));
    await state.restore();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('navMarks')));
    await tester.pumpAndSettle();
  }

  /// The entry screen pushed over a plain page, so back navigation can be tested.
  Future<void> pumpEntry(WidgetTester tester, String id) async {
    phone(tester);
    final a = await api.assessment(id);
    await tester.pumpWidget(
      localizedApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => MarksEntryScreen(api: api, assessment: a),
                  ),
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
  }

  Finder field(String studentId) => find.byKey(ValueKey('marks-$studentId'));
  String summary(WidgetTester tester) => tester.widget<Text>(find.byKey(const Key('marksSummary'))).data!;
  bool focused(WidgetTester tester, String studentId) =>
      tester.widget<EditableText>(find.descendant(of: field(studentId), matching: find.byType(EditableText))).focusNode.hasFocus;

  testWidgets('lists the class assessments with draft or published state and the class average', (tester) async {
    api.addAssessment(
      title: 'Unit test 1',
      published: true,
      marks: {
        's1': const MarkInput(studentId: 's1', marks: 19),
        's2': const MarkInput(studentId: 's2', marks: 22.5),
        's3': const MarkInput(studentId: 's3', absent: true),
      },
    );
    api.addAssessment(title: 'Ledger assignment', maxMarks: 10);
    await pumpApp(tester);

    expect(api.calls, contains('assessments sec1'));
    // The list carries the averages: no request per card.
    expect(api.calls.where((c) => c.startsWith('assessment ')), isEmpty);
    expect(find.text('BCom Sem 3 A'), findsOneWidget);
    final published = find.byKey(const Key('assessment-a1'));
    expect(find.descendant(of: published, matching: find.text('Published')), findsOneWidget);
    expect(find.descendant(of: published, matching: find.textContaining('20.8')), findsOneWidget);
    expect(find.descendant(of: published, matching: find.text('3 of 3 entered')), findsOneWidget);
    final draft = find.byKey(const Key('assessment-a2'));
    expect(find.descendant(of: draft, matching: find.text('Draft')), findsOneWidget);
    expect(find.descendant(of: draft, matching: find.text('No marks yet · out of 10')), findsOneWidget);
  });

  testWidgets('creates an assessment and goes straight to marks entry', (tester) async {
    await pumpApp(tester);
    expect(find.textContaining('No tests or assignments'), findsOneWidget);

    await tester.tap(find.byKey(const Key('newAssessmentFab')));
    await tester.pumpAndSettle();
    // Title is required.
    await tester.tap(find.byKey(const Key('createAssessment')));
    await tester.pumpAndSettle();
    expect(find.text('Give it a title'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('assessmentTitleField')), 'Journal entries quiz');
    await tester.tap(find.byKey(const Key('kind-assignment')));
    await tester.enterText(find.byKey(const Key('maxMarksField')), '0');
    await tester.tap(find.byKey(const Key('createAssessment')));
    await tester.pumpAndSettle();
    expect(find.text('Must be more than 0'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('maxMarksField')), '20');
    await tester.tap(find.byKey(const Key('createAssessment')));
    await tester.pumpAndSettle();

    expect(
      api.calls.where((c) => c.startsWith('createAssessment')).single,
      startsWith('createAssessment Journal entries quiz assignment 20 '),
    );
    // Now on the entry screen with the class in roll order.
    expect(find.text('Journal entries quiz'), findsOneWidget);
    expect(find.text('Out of 20'), findsOneWidget);
    expect(find.text('Aarav Patel'), findsOneWidget);
    expect(find.text('Bhavya Reddy'), findsOneWidget);
    expect(summary(tester), '0 of 3 marked');

    // Back to the list: the new draft is there.
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.descendant(of: find.byKey(const Key('assessment-a1')), matching: find.text('Draft')), findsOneWidget);
  });

  testWidgets('validates against the maximum, moves to the next student and saves with stats', (tester) async {
    final id = api.addAssessment();
    await pumpEntry(tester, id);
    expect(find.byKey(const Key('marksStats')), findsNothing);

    await tester.enterText(field('s1'), '30');
    await tester.pump();
    // Typing keeps the focus on the field.
    expect(focused(tester, 's1'), isTrue);
    expect(find.text('Max 25'), findsOneWidget);
    expect(find.text('One mark is more than 25'), findsOneWidget);
    await tester.tap(find.byKey(const Key('saveMarks')));
    await tester.pumpAndSettle();
    expect(find.text('One mark needs fixing'), findsOneWidget);
    expect(api.lastSaved, isNull);

    // Letters and a third decimal place are ignored by the keypad formatter.
    await tester.enterText(field('s1'), '22.5');
    await tester.pump();
    await tester.enterText(field('s1'), '22.55x');
    await tester.pump();
    expect(find.text('22.5'), findsOneWidget);
    expect(find.text('Max 25'), findsNothing);

    // Ananya was absent: Next skips her.
    await tester.tap(find.byKey(const ValueKey('absent-s2')));
    await tester.pump();
    await tester.tap(field('s1'));
    await tester.testTextInput.receiveAction(TextInputAction.next);
    await tester.pump();
    expect(focused(tester, 's3'), isTrue);
    await tester.enterText(field('s3'), '18');
    await tester.pump();
    expect(summary(tester), '2 of 3 marked · 1 absent');

    await tester.tap(find.byKey(const Key('saveMarks')));
    await tester.pumpAndSettle();
    expect(
      {for (final e in api.lastSaved!) e.studentId: (e.marks, e.absent)},
      {'s1': (22.5, false), 's2': (null, true), 's3': (18.0, false)},
    );
    expect(find.textContaining('Marks saved'), findsOneWidget);
    final stats = find.byKey(const Key('marksStats'));
    expect(find.descendant(of: stats, matching: find.text('20.3/25')), findsOneWidget);
    expect(find.descendant(of: stats, matching: find.text('22.5')), findsOneWidget);
    expect(find.descendant(of: stats, matching: find.text('2/3')), findsOneWidget);
    expect(find.text('Saved · only you can see these marks'), findsOneWidget);

    // Only changed rows are sent next time.
    await tester.enterText(field('s3'), '19');
    await tester.pump();
    await tester.tap(find.byKey(const Key('saveMarks')));
    await tester.pumpAndSettle();
    expect(api.lastSaved!.map((e) => e.studentId), ['s3']);
  });

  testWidgets('adds a remark', (tester) async {
    final id = api.addAssessment();
    await pumpEntry(tester, id);
    await tester.tap(find.byKey(const ValueKey('remark-s1')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('remarkField')), 'Neat working');
    await tester.tap(find.byKey(const Key('saveRemark')));
    await tester.pumpAndSettle();
    expect(find.text('U03BC001 · Neat working'), findsOneWidget);
    await tester.tap(find.byKey(const Key('saveMarks')));
    await tester.pumpAndSettle();
    expect(api.lastSaved!.single.remark, 'Neat working');
  });

  testWidgets('asks before leaving with unsaved marks', (tester) async {
    final id = api.addAssessment();
    await pumpEntry(tester, id);
    await tester.enterText(field('s1'), '12');
    await tester.pump();

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Discard changes?'), findsOneWidget);
    await tester.tap(find.text('Keep editing'));
    await tester.pumpAndSettle();
    expect(find.text('Aarav Patel'), findsOneWidget);

    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('discardChanges')));
    await tester.pumpAndSettle();
    expect(find.text('open'), findsOneWidget);
    expect(api.lastSaved, isNull);
  });

  testWidgets('publishes after a confirmation that families will be notified', (tester) async {
    final id = api.addAssessment(marks: {'s1': const MarkInput(studentId: 's1', marks: 20)});
    await pumpEntry(tester, id);
    expect(find.descendant(of: find.byKey(const Key('statePill')), matching: find.text('Draft')), findsOneWidget);

    // Unsaved edits must be saved before publishing.
    await tester.enterText(field('s2'), '15');
    await tester.pump();
    expect(tester.widget<ButtonStyleButton>(find.byKey(const Key('publishMarks'))).onPressed, isNull);
    await tester.tap(find.byKey(const Key('saveMarks')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('publishMarks')));
    await tester.pumpAndSettle();
    expect(find.text('Publish marks?'), findsOneWidget);
    expect(find.textContaining('will be notified'), findsOneWidget);
    expect(find.textContaining('1 student has no marks yet'), findsOneWidget);
    await tester.tap(find.byKey(const Key('confirmPublish')));
    await tester.pumpAndSettle();

    expect(api.calls, contains('publish $id'));
    expect(find.text('Published'), findsOneWidget);
    expect(find.byKey(const Key('publishMarks')), findsNothing);
    expect(find.textContaining('families notified'), findsOneWidget);
  });
}
