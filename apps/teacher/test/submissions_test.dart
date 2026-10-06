// Homework submissions: counts, a student's work, photos and PDFs, Check and Return.
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/core/api.dart';
import 'package:kinetix_teacher/core/models.dart';
import 'package:kinetix_teacher/features/homework/homework_detail_screen.dart';
import 'package:kinetix_teacher/features/homework/submission_screen.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  late FakeTeacherApi api;
  late List<String> opened;

  setUp(() {
    api = FakeTeacherApi();
    seed(api);
    opened = [];
  });

  Future<bool> openFile(Uint8List bytes, String name, String mime) async {
    opened.add('$name $mime ${bytes.length}');
    return true;
  }

  Future<void> pumpDetail(WidgetTester tester, {String language = 'en'}) async {
    phone(tester);
    await tester.pumpWidget(
      localizedApp(
        language: language,
        home: HomeworkDetailScreen(api: api, homework: api.homework.first, openFile: openFile),
      ),
    );
    await tester.pumpAndSettle();
  }

  Finder inRow(String studentId, Finder f) => find.descendant(of: find.byKey(Key('submission-$studentId')), matching: f);
  Finder count(String key) => find.byKey(Key('count-$key'));
  String countText(WidgetTester tester, String key) =>
      tester.widget<Text>(find.descendant(of: count(key), matching: find.byType(Text))).textSpan!.toPlainText();

  testWidgets('homework opens from the Homework tab with its submissions', (tester) async {
    phone(tester);
    await pumpApp(tester, api, prefs: {'token': 'tok'});
    await tapAndSettle(tester, find.byKey(const Key('navHomework')));
    await tapAndSettle(tester, find.byKey(const Key('homework-h1')));
    expect(api.calls, contains('submissions h1'));
    expect(find.byType(HomeworkDetailScreen), findsOneWidget);
    expect(find.text('Show all working.'), findsOneWidget);
  });

  testWidgets('the counts filter the list; "Remind the N" notifies who has not handed in', (tester) async {
    await pumpDetail(tester);
    expect(countText(tester, 'all'), '3 All');
    for (final id in ['s1', 's2', 's3']) {
      expect(find.byKey(Key('submission-$id')), findsOneWidget);
    }

    await tapAndSettle(tester, count('missing'));
    expect(find.byKey(const Key('submission-s3')), findsOneWidget);
    expect(find.byKey(const Key('submission-s1')), findsNothing);
    expect(find.byKey(const Key('submission-s2')), findsNothing);

    await tapAndSettle(tester, count('checked'));
    expect(find.byKey(const Key('submission-s2')), findsOneWidget);
    expect(find.byKey(const Key('submission-s3')), findsNothing);
    // Only shown with everyone or the missing ones.
    expect(find.byKey(const Key('remindMissing')), findsNothing);

    await tapAndSettle(tester, count('returned'));
    expect(find.text('No students here'), findsOneWidget);

    // Tapping the selected filter again shows everyone.
    await tapAndSettle(tester, count('returned'));
    expect(find.byKey(const Key('submission-s1')), findsOneWidget);
    await tapAndSettle(tester, count('missing'));
    await tapAndSettle(tester, count('all'));
    expect(find.byKey(const Key('submission-s1')), findsOneWidget);

    await tapAndSettle(tester, find.byKey(const Key('remindMissing')));
    expect(find.text('Remind 1 students?'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('confirmRemind')));
    expect(api.calls, contains('remind h1 1'));
    expect(find.text('Reminded 1 students and their families'), findsOneWidget);
  });

  testWidgets('counts and each student with status and a late badge', (tester) async {
    await pumpDetail(tester);
    expect(countText(tester, 'submitted'), '1 Handed in');
    expect(countText(tester, 'checked'), '1 Checked');
    expect(countText(tester, 'returned'), '0 Returned');
    expect(countText(tester, 'missing'), '1 Missing');
    expect(inRow('s1', find.text('Handed in')), findsOneWidget);
    expect(inRow('s1', find.text('Late')), findsNothing);
    expect(inRow('s2', find.text('Checked')), findsOneWidget);
    expect(inRow('s2', find.text('Late')), findsOneWidget);
    expect(inRow('s3', find.text('Not handed in')), findsOneWidget);

    // Nothing to open for a student who has not handed in.
    await tapAndSettle(tester, find.byKey(const Key('submission-s3')));
    expect(find.byType(SubmissionScreen), findsNothing);
  });

  testWidgets("a student's work: text, photos full screen, and the PDF", (tester) async {
    await pumpDetail(tester);
    await tapAndSettle(tester, find.byKey(const Key('submission-s1')));
    expect(find.text('Q1. Goodwill = Average profit × 3 = ₹1,20,000.'), findsOneWidget);
    expect(find.textContaining('Handed in Sun, 4 Oct · 7:30 PM'), findsOneWidget);
    expect(find.byKey(const Key('photo-0')), findsOneWidget);
    expect(find.byKey(const Key('photo-1')), findsOneWidget);
    expect(api.calls, containsAll(['file s1 0', 'file s1 1']));
    expect(api.calls, isNot(contains('file s1 2')));

    await tapAndSettle(tester, find.byKey(const Key('photo-1')));
    expect(find.byKey(const Key('photoViewer')), findsOneWidget);
    expect(find.text('Photo 2 of 2'), findsOneWidget);
    expect(find.byType(InteractiveViewer), findsOneWidget);
    await tester.fling(find.byKey(const Key('photoViewer')), const Offset(500, 0), 1500);
    await tester.pumpAndSettle();
    expect(find.text('Photo 1 of 2'), findsOneWidget);
    await tapAndSettle(tester, find.byType(CloseButton));

    await tapAndSettle(tester, find.byKey(const Key('file-2')));
    expect(opened, ['workings.pdf application/pdf 8']);
  });

  testWidgets('Check with a remark: the list and counts update', (tester) async {
    await pumpDetail(tester);
    await tapAndSettle(tester, find.byKey(const Key('submission-s1')));
    await tester.enterText(find.byKey(const Key('reviewRemark')), 'Well done');
    await tester.ensureVisible(find.byKey(const Key('checkWork')));
    await tapAndSettle(tester, find.byKey(const Key('checkWork')));
    expect(api.calls, contains('review s1 checked Well done'));
    expect(find.byType(SubmissionScreen), findsNothing);
    expect(find.text("Aarav Patel's homework marked as checked"), findsOneWidget);
    expect(inRow('s1', find.text('Checked')), findsOneWidget);
    expect(countText(tester, 'submitted'), '0 Handed in');
    expect(countText(tester, 'checked'), '2 Checked');
  });

  testWidgets('Return to redo; a refusal stays on the screen with the reason', (tester) async {
    await pumpDetail(tester);
    await tapAndSettle(tester, find.byKey(const Key('submission-s2')));
    // The earlier remark is there to edit.
    expect(find.text('Neat working'), findsOneWidget);
    api.reviewError = ApiException(403, 'You do not teach this class', code: 'NOT_YOUR_CLASS');
    await tester.ensureVisible(find.byKey(const Key('returnWork')));
    await tapAndSettle(tester, find.byKey(const Key('returnWork')));
    expect(find.byType(SubmissionScreen), findsOneWidget);
    expect(find.text('You do not teach this class'), findsOneWidget);

    api.reviewError = null;
    await tester.enterText(find.byKey(const Key('reviewRemark')), 'Redo Q2');
    await tapAndSettle(tester, find.byKey(const Key('returnWork')));
    expect(api.calls, contains('review s2 returned Redo Q2'));
    expect(inRow('s2', find.text('Returned')), findsOneWidget);
    expect(countText(tester, 'returned'), '1 Returned');
  });

  testWidgets('in Hindi', (tester) async {
    await pumpDetail(tester, language: 'hi');
    final s = strings('hi');
    expect(find.text(s.submissions), findsOneWidget);
    expect(inRow('s2', find.text(s.statusLate)), findsOneWidget);
    expect(inRow('s3', find.text(s.statusNotHandedIn)), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('submission-s1')));
    expect(find.text(s.checkWork), findsOneWidget);
    expect(find.text(s.returnWork), findsOneWidget);
    expect(find.textContaining('Handed in'), findsNothing);
  });

  test('a reviewed submission keeps the name and recounts', () {
    final list = SubmissionList(counts: SubmissionCounts.of(api.handedIn), students: [...api.handedIn]);
    list.replace(api.handedIn.first.reviewed({'status': 'returned', 'text': 'x', 'files': [], 'late': false, 'remark': 'Again'}));
    expect(list.students.first.fullName, 'Aarav Patel');
    expect(list.students.first.status, SubmissionStatus.returned);
    expect(list.counts.returned, 1);
    expect(list.counts.submitted, 0);
  });
}
