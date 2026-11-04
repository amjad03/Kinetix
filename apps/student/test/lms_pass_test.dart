// LMS pass in the Student App: live classes with Join, progress by each item's rule, lesson pages with
// "Mark as done", locked items, the certificate, certificates and paths, the offline copy and its sync,
// and proctored quizzes telling the server when the student leaves the app.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:zynetix_student/core/api.dart';
import 'package:zynetix_student/core/lms.dart';
import 'package:zynetix_student/core/lms_offline.dart';
import 'package:zynetix_student/core/self_service.dart';
import 'package:zynetix_student/features/learn/courses_view.dart';
import 'package:zynetix_student/features/quizzes/quizzes_screen.dart';
import 'package:zynetix_student/l10n/l10n.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import 'fake_api.dart';

Widget host(Widget child, {Locale locale = const Locale('en')}) => MaterialApp(
  theme: ZynetixTheme.light(),
  locale: locale,
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: appLocalizationsDelegates,
  home: Scaffold(body: child),
);

void main() {
  late FakeStudentApi api;
  final opened = <Uri>[];
  Future<bool> open(Uri u) async {
    opened.add(u);
    return true;
  }

  setUp(() {
    api = FakeStudentApi();
    opened.clear();
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('joins a live class through the app, so the join is recorded', (tester) async {
    await tester.pumpWidget(host(CoursesView(api: api, studentId: 's1', open: open)));
    await tester.pumpAndSettle();
    expect(find.text('Live classes'), findsOneWidget);
    expect(find.text('Doubt session'), findsOneWidget);
    await tester.tap(find.byKey(const Key('join-l1')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('joinLiveClass l1'));
    expect(opened.single.host, 'meet.google.com');
  });

  testWidgets('shows progress, refuses a locked item, and marks a link done only when asked', (tester) async {
    const summary = LmsCourseSummary(courseId: 'c1', title: 'Mathematics 7 B', subject: 'Mathematics', moduleCount: 2, completionPct: 33, itemsDone: 1, itemsTotal: 3);
    await tester.pumpWidget(host(CourseScreen(api: api, studentId: 's1', summary: summary, open: open)));
    await tester.pumpAndSettle();
    expect(find.text('1 of 3 done · 33%'), findsOneWidget);
    expect(find.byIcon(Icons.lock_outline), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('item-i3')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('item-i3')));
    await tester.pumpAndSettle();
    expect(find.text('Finish the item before this one first'), findsOneWidget);
    // A link is opened (counted as a view) and stays open until the student says it is done.
    await tester.ensureVisible(find.byKey(const Key('item-i2')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('item-i2')));
    await tester.pumpAndSettle();
    expect(api.lmsProgress, ['i2 false']);
    expect(opened.single.toString(), 'https://example.com/p');
    // A lesson page reads its own text and is recorded as opened.
    await tester.ensureVisible(find.byKey(const Key('item-i1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('item-i1')));
    await tester.pumpAndSettle();
    expect(find.text('Make the denominators equal, then add the numerators.'), findsOneWidget);
    expect(api.lmsProgress.last, 'i1 false');
    expect(find.byKey(const Key('markDone')), findsNothing);
  });

  testWidgets('a lesson page with "Mark as done" records completion', (tester) async {
    var done = 0;
    const item = LmsItem(id: 'i9', kind: 'page', title: 'Summary', body: 'Key ideas', completionRule: 'mark_done');
    await tester.pumpWidget(host(LessonPageScreen(item: item, onOpen: () async {}, onDone: () async => done++)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('markDone')));
    await tester.pumpAndSettle();
    expect(done, 1);
    expect(find.text('Marked as done'), findsOneWidget);
  });

  testWidgets('lists certificates and learning paths with progress', (tester) async {
    await tester.pumpWidget(host(AchievementsScreen(api: api, studentId: 's1', open: open)));
    await tester.pumpAndSettle();
    expect(find.text('Science 7 B'), findsOneWidget);
    expect(find.textContaining('CC/2026/0007'), findsOneWidget);
    expect(find.text('Number sense track'), findsOneWidget);
    expect(find.text('50% of the path done'), findsOneWidget);
    expect(find.text('Science 7 B (optional)'), findsOneWidget);
  });

  testWidgets('keeps the courses on the phone, opens them offline and sends offline progress later', (tester) async {
    final prefs = await SharedPreferences.getInstance();
    await tester.pumpWidget(host(CoursesView(api: api, studentId: 's1', prefs: prefs, open: open)));
    await tester.pumpAndSettle();
    expect(api.calls, contains('lmsOfflineBundle s1'));
    final store = LmsOfflineStore(prefs, 's1');
    expect(store.courses().single.title, 'Mathematics 7 B');
    // No connection: the copy opens, and finishing an item is kept for later.
    api.lmsError = ApiException(0, '', problem: ApiProblem.unreachable);
    await tester.pumpWidget(host(CoursesView(key: const Key('again'), api: api, studentId: 's1', prefs: prefs, open: open)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('offlineCopy')), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('course-c1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('course-c1')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('item-i2')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('item-i2')));
    await tester.pumpAndSettle();
    expect(store.pending(), [
      {'itemId': 'i2', 'at': store.pending().single['at']!, 'completed': false},
    ]);
    // Back online: the queue goes to the server once and is cleared.
    api.lmsError = null;
    expect(await store.sync(api), 1);
    expect(api.lmsSynced.single['itemId'], 'i2');
    expect(store.pending(), isEmpty);
    expect(await store.sync(api), 0);
  });

  testWidgets('a proctored quiz reports leaving the app and closes when the server submits it', (tester) async {
    api.quizSubmitOnEvent = true;
    final attempt = QuizAttempt(attemptId: 'a1', title: 'Unit 2 quiz', dueAt: DateTime.now().add(const Duration(minutes: 10)), questions: const [], negativePct: 25, proctoring: 'strict', maxViolations: 4);
    await tester.pumpWidget(host(Builder(builder: (context) => TextButton(onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => QuizAttemptScreen(api: api, attempt: attempt))), child: const Text('go')))));
    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump();
    // Frames run again once the app is back in front.
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(api.calls, contains('reportQuizEvents a1 1'));
    expect(api.quizEvents.single['kind'], 'app_background');
    expect(find.text('Unit 2 quiz'), findsNothing);
  });

  testWidgets('reads in Hindi and Kannada without overflow', (tester) async {
    for (final lang in ['hi', 'kn']) {
      const summary = LmsCourseSummary(courseId: 'c1', title: 'Mathematics 7 B', subject: 'Mathematics', moduleCount: 2);
      await tester.pumpWidget(host(CourseScreen(key: Key(lang), api: api, studentId: 's1', summary: summary, open: open), locale: Locale(lang)));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.byKey(const Key('claimCertificate')), findsNothing);
    }
  });
}
