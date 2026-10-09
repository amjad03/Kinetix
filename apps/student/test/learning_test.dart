// My learning: what to practise, mastery, worksheets and scores, extra help, entrance readiness and the promotion decision.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/core/forum.dart';
import 'package:kinetix_student/core/learning.dart';
import 'package:kinetix_student/core/lms.dart';
import 'package:kinetix_student/features/learn/courses_view.dart';
import 'package:kinetix_student/features/learn/forum_screen.dart';
import 'package:kinetix_student/features/learning/learning_screen.dart';
import 'package:kinetix_student/features/profile/profile_tab.dart';
import 'package:kinetix_student/l10n/l10n.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'fake_api.dart';
import 'helpers.dart';

Widget screen(Widget home, {String language = 'en'}) => MaterialApp(
  theme: KinetixTheme.light(),
  locale: Locale(language),
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: appLocalizationsDelegates,
  home: home,
);

Finder profileList() => find.descendant(of: find.byType(ProfileTab), matching: find.byType(Scrollable)).first;

void main() {
  late FakeStudentApi api;
  setUp(() => api = FakeStudentApi());

  testWidgets('shows what to do next, mastery, worksheets with scores, extra help, readiness and the promotion decision', (tester) async {
    await tester.pumpWidget(screen(LearningScreen(api: api, studentId: 's1')));
    await tester.pumpAndSettle();
    expect(api.calls, containsAll(['learningSummary s1', 'learningAdvice s1']));
    expect(find.byKey(const Key('learnPromotion')), findsOneWidget);
    expect(find.text('Promoted with grace marks'), findsOneWidget);
    expect(find.text('Grace marks used in: Hindi'), findsOneWidget);
    expect(find.byKey(const Key('practice-Ratios and proportion')), findsOneWidget);
    expect(find.text('Builds M6.2 (beginning)'), findsOneWidget);
    expect(find.byKey(const Key('mastery-Maths')), findsOneWidget);
    expect(find.text('50%'), findsOneWidget);
    expect(find.text('16 of 20'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Not scored yet'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('Secure'), findsOneWidget);
    expect(find.text('Not scored yet'), findsOneWidget);
    await tester.scrollUntilVisible(find.byKey(const Key('readiness-KMAT')), 300, scrollable: find.byType(Scrollable).first);
    expect(find.byKey(const Key('help-r1')), findsOneWidget);
    expect(find.text('Close to your target · rising'), findsOneWidget);
    expect(find.text('Target 65%'), findsOneWidget);
    expect(find.text('Average 55.5% after 3 tests'), findsOneWidget);
    expect(find.text('Weak: Quantitative aptitude'), findsOneWidget);
  });

  testWidgets('says so when there is nothing yet', (tester) async {
    api.learning = const LearningSummary();
    api.advice = const LearningAdvice();
    await tester.pumpWidget(screen(LearningScreen(api: api, studentId: 's1')));
    await tester.pumpAndSettle();
    expect(find.text('Nothing here yet. Your teachers will add worksheets and practice.'), findsOneWidget);
  });

  testWidgets('Profile opens it', (tester) async {
    await pumpApp(tester);
    await openTab(tester, 'Profile');
    await scrollTo(tester, find.byKey(const Key('openLearning')), scrollable: profileList());
    await tester.tap(find.byKey(const Key('openLearning')));
    await tester.pumpAndSettle();
    expect(find.byType(LearningScreen), findsOneWidget);
  });

  testWidgets('a course opens its discussion: read a thread, reply, and ask a new question', (tester) async {
    const summary = LmsCourseSummary(courseId: 'c1', title: 'Accounting (BCom 3 A)', subject: 'Accounting', moduleCount: 1);
    await tester.pumpWidget(screen(CourseScreen(api: api, studentId: 's1', summary: summary)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('openForum')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('thread-f1')), findsOneWidget);
    expect(find.text('Latha Rao · 1 reply'), findsOneWidget);
    await tester.tap(find.byKey(const Key('thread-f1')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('threadBody')), findsOneWidget);
    expect(find.text('Start from the definition, then follow the three steps.'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('replyField')), 'Thanks, that helped');
    await tester.tap(find.byKey(const Key('replySend')));
    await tester.pumpAndSettle();
    expect(api.calls.last, 'reply f1 Thanks, that helped');
    expect(find.text('Thanks, that helped'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('forumAsk')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('forumTitle')), 'Is the second call refundable?');
    await tester.enterText(find.byKey(const Key('forumBody')), 'I could not find it in the notes.');
    await tester.tap(find.byKey(const Key('forumPost')));
    await tester.pumpAndSettle();
    expect(api.calls, contains('startThread Is the second call refundable?'));
    expect(find.text('Is the second call refundable?'), findsOneWidget);
  });

  testWidgets('a locked discussion cannot be replied to', (tester) async {
    api.forum = [const ForumThreadRow(id: 'f1', title: 'Closed topic', author: 'Latha Rao', replies: 0, pinned: false, locked: true)];
    await tester.pumpWidget(screen(ThreadScreen(api: api, threadId: 'f1')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('threadLocked')), findsOneWidget);
    expect(find.byKey(const Key('replyField')), findsNothing);
  });

  testWidgets('Profile offers to trust a new phone, then shows it as trusted', (tester) async {
    await pumpApp(tester);
    await openTab(tester, 'Profile');
    await scrollTo(tester, find.byKey(const Key('deviceTrust')), scrollable: profileList());
    expect(find.text('Not trusted yet. Trust it so a sign-in from this phone is not flagged as new.'), findsOneWidget);
    await tester.tap(find.byKey(const Key('deviceTrustButton')));
    await tester.pumpAndSettle();
    expect(find.text('Trusted'), findsOneWidget);
    expect(find.byKey(const Key('deviceTrustButton')), findsNothing);
  });

  testWidgets('reads in Hindi and Kannada', (tester) async {
    for (final lang in ['hi', 'kn']) {
      final s = lookupAppLocalizations(Locale(lang));
      await tester.pumpWidget(screen(LearningScreen(api: api, studentId: 's1'), language: lang));
      await tester.pumpAndSettle();
      expect(find.text(s.myLearningTitle), findsOneWidget);
      expect(find.text(s.myLearningPromotedGrace), findsOneWidget);
      expect(find.text('My learning'), findsNothing);
      await tester.pumpWidget(screen(ForumScreen(api: api, courseId: 'c1', title: 'x'), language: lang));
      await tester.pumpAndSettle();
      expect(find.text(s.forumAsk), findsWidgets);
    }
  });
}
