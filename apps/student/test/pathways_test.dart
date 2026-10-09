// Projects and research, career preparation, school life (diary, activities, report cards) and the alumni home.
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/core/alumni.dart';
import 'package:kinetix_student/core/api.dart';
import 'package:kinetix_student/core/models.dart';
import 'package:kinetix_student/core/pathways.dart';
import 'package:kinetix_student/core/school_life.dart';
import 'package:kinetix_student/features/alumni/alumni_home.dart';
import 'package:kinetix_student/features/careers/aptitude.dart';
import 'package:kinetix_student/features/careers/career_prep.dart';
import 'package:kinetix_student/features/careers/mock_interview.dart';
import 'package:kinetix_student/features/profile/profile_tab.dart';
import 'package:kinetix_student/features/projects/project_workspace_screen.dart';
import 'package:kinetix_student/features/projects/projects_screen.dart';
import 'package:kinetix_student/features/school/school_screens.dart';
import 'package:kinetix_student/l10n/l10n.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'fake_api.dart';
import 'helpers.dart';

Widget host(Widget child, {Locale locale = const Locale('en')}) => MaterialApp(
  theme: KinetixTheme.light(),
  locale: locale,
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: appLocalizationsDelegates,
  home: child,
);

void phone(WidgetTester tester, {double height = 892}) {
  tester.view.physicalSize = Size(412, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

void main() {
  late FakeStudentApi api;
  final opened = <String>[];
  Future<bool> fakeOpen(Uint8List bytes, String name, String mime) async {
    opened.add('$name ${String.fromCharCodes(bytes.take(5))}');
    return true;
  }

  setUp(() {
    api = FakeStudentApi();
    opened.clear();
  });

  Future<void> show(WidgetTester tester, Widget screen, {double height = 892, Locale locale = const Locale('en')}) async {
    phone(tester, height: height);
    await tester.pumpWidget(host(screen, locale: locale));
    await tester.pumpAndSettle();
  }

  /// Opens a tab by its label; the tab bar scrolls sideways, so bring the label into view first.
  Future<void> gotoTab(WidgetTester tester, String label) async {
    await tester.ensureVisible(find.text(label));
    await tester.pumpAndSettle();
    await tester.tap(find.text(label));
    await tester.pumpAndSettle();
  }

  group('models', () {
    test('a resume sends only filled fields and splits skills', () {
      final r = Resume.fromJson(api.resumeJson);
      expect(r.education.single['degree'], 'BCom');
      r.links.add({'label': 'Site', 'url': ' https://example.com ', 'extra': ''});
      r.projects.add({'title': 'Dashboard', 'detail': '', 'url': ''});
      final j = r.toJson();
      expect(j['links'], [
        {'label': 'Site', 'url': 'https://example.com'},
      ]);
      expect(j['projects'], [
        {'title': 'Dashboard'},
      ]);
      expect(j['skills'], ['Excel']);
      expect(Resume.words('Python, SQL ,\n Excel,, '), ['Python', 'SQL', 'Excel']);
    });

    test('a thesis is null when the scholar has none', () {
      expect(Thesis.fromJson({'id': null}), isNull);
      final t = Thesis.fromJson({
        'id': 't1', 'title': 'Soil study', 'stage': 'viva', 'abstract': '', 'submittedOn': '2026-08-01', 'scholar': {'programme': 'phd'},
        'vivas': [
          {'kind': 'open_defence', 'scheduledAt': '2026-12-01T05:00:00Z', 'venue': 'Hall', 'status': 'scheduled', 'outcome': null},
        ],
        'similarity': {'scorePercent': '12.50'}, 'similarityLimitPercent': 20,
      })!;
      expect(t.stage, 'viva');
      expect(t.similarityPercent, 12.5);
      expect(t.vivas.single.venue, 'Hall');
    });

    test('the workspace, test results and report card read what the API sends', () {
      final w = ProjectWorkspace.fromJson(api.workspaceJson);
      expect(w.members.length, 2);
      expect(w.milestones.first.done, isTrue);
      expect(w.reviewAverage, 80.0);
      expect(w.vivas.single.panel, ['Dr. Rao']);
      final r = AptitudeResult.fromJson({'score': 3, 'total': 4, 'percent': 75, 'passed': true, 'passPercent': 50, 'topicScores': {'Algebra': {'right': 2, 'total': 2}, 'Ratio': {'right': 1, 'total': 2}}});
      expect(r.topics.map((t) => t.topic), ['Algebra', 'Ratio']);
      expect(r.topics.last.right, 1);
      final c = ReportCardDetail.fromJson(api.reportCardJson);
      expect(c.lines.single.marks, 88);
      expect(c.attendanceTotal, 180);
      expect(c.coCurricular.single.remark, 'Plays in the school team');
      expect(SuccessStory.fromJson(api.storyJson.single).editable, isTrue);
      expect(SuccessStory.fromJson({...api.storyJson.single, 'status': 'submitted'}).editable, isFalse);
      expect(AssistantMessage.fromJson({'role': 'assistant', 'body': 'x'}).aiUsed, isNull);
    });
  });

  group('projects', () {
    testWidgets('my projects list the thesis card of a scholar and open the workspace', (tester) async {
      api.thesisJson = {
        'id': 'th1', 'title': 'Soil carbon study', 'stage': 'examination', 'abstract': '', 'submittedOn': '2026-08-01', 'scholar': {'programme': 'phd'},
        'vivas': [
          {'kind': 'open_defence', 'scheduledAt': '2030-12-01T05:00:00Z', 'venue': 'Seminar hall', 'status': 'scheduled', 'outcome': null},
        ],
        'similarity': {'scorePercent': 12}, 'similarityLimitPercent': 20,
      };
      await show(tester, ProjectsScreen(api: api), height: 2400);
      expect(find.byKey(const Key('thesisCard')), findsOneWidget);
      expect(find.text('Soil carbon study'), findsOneWidget);
      expect(find.text('Under examination'), findsOneWidget);
      expect(find.text('Similarity 12% (limit 20%)'), findsOneWidget);
      expect(find.byKey(const Key('project-p1')), findsOneWidget);
      expect(find.text('Looking for members'), findsOneWidget);

      await tester.tap(find.byKey(const Key('project-p1')));
      await tester.pumpAndSettle();
      expect(api.calls, containsAll(['projectWorkspace p1', 'projectComments p1', 'projectReviews p1']));
      expect(find.byKey(const Key('workspaceTitle')), findsOneWidget);
      expect(find.text('Lead: Dr. Meera Iyer'), findsOneWidget);
      expect(find.byKey(const Key('milestone-ms1')), findsOneWidget);
      expect(find.text('Project brief'), findsOneWidget);
      expect(find.text('Seminar hall · Panel: Dr. Rao'), findsOneWidget);
      expect(find.byKey(const Key('reviewsSummary')), findsOneWidget);
      expect(find.text('1 review, average 80%'), findsOneWidget);
      expect(find.text('Please share the data sheet.'), findsOneWidget);
    });

    testWidgets('a project without a thesis shows no thesis card', (tester) async {
      await show(tester, ProjectsScreen(api: api));
      expect(find.byKey(const Key('thesisCard')), findsNothing);
    });

    testWidgets('the workspace adds a link and posts a comment', (tester) async {
      await show(tester, ProjectWorkspaceScreen(api: api, projectId: 'p1'), height: 2400);
      await tester.tap(find.byKey(const Key('addLink')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('linkTitle')), 'Data sheet');
      await tester.enterText(find.byKey(const Key('linkUrl')), 'https://example.com/data');
      await tester.tap(find.byKey(const Key('saveLink')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('addProjectLink p1 Data sheet https://example.com/data'));
      expect(find.text('Data sheet'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('commentField')), 'Uploaded the data');
      await tester.tap(find.byKey(const Key('sendComment')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('addProjectComment p1 Uploaded the data'));
      expect(find.text('Uploaded the data'), findsOneWidget);
    });

    testWidgets('a link without a web address is not sent', (tester) async {
      await show(tester, ProjectWorkspaceScreen(api: api, projectId: 'p1'), height: 2400);
      await tester.tap(find.byKey(const Key('addLink')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('linkTitle')), 'Notes');
      await tester.enterText(find.byKey(const Key('linkUrl')), 'not a link');
      await tester.tap(find.byKey(const Key('saveLink')));
      await tester.pumpAndSettle();
      expect(api.calls.where((c) => c.startsWith('addProjectLink')), isEmpty);
      expect(find.text('A link needs a title and a full address.'), findsOneWidget);
    });

    testWidgets('find a team: search by skill and ask to join', (tester) async {
      await show(tester, ProjectsScreen(api: api));
      await gotoTab(tester, 'Find a team');
      expect(find.text('Library chatbot'), findsOneWidget);
      expect(find.text('50% match'), findsOneWidget);
      expect(find.text('Looking for: Python, UX'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('skillSearch')), 'rust');
      await tester.tap(find.byKey(const Key('skillSearchGo')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('discoverProjects rust'));
      expect(find.text('No projects are looking for members right now.'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('skillSearch')), 'ux');
      await tester.tap(find.byKey(const Key('skillSearchGo')));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('join-p2')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('joinMessage')), 'I know Python');
      await tester.tap(find.byKey(const Key('sendJoin')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('joinProject p2 I know Python'));
      expect(find.text('Your request was sent.'), findsOneWidget);
    });

    testWidgets('a join request the server refuses says why', (tester) async {
      api.pathwaysError = null;
      await show(tester, ProjectsScreen(api: api));
      await gotoTab(tester, 'Find a team');
      api.pathwaysError = ApiException(409, 'You have already asked to join this project');
      await tester.tap(find.byKey(const Key('join-p2')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('sendJoin')));
      await tester.pumpAndSettle();
      expect(find.text('You have already asked to join this project'), findsOneWidget);
    });

    testWidgets('showcase: a peer review sends the four scores', (tester) async {
      await show(tester, ProjectsScreen(api: api));
      await gotoTab(tester, 'Showcase');
      expect(find.text('Solar tracker'), findsOneWidget);
      expect(find.text('Reviews: 85%'), findsOneWidget);
      await tester.tap(find.byKey(const Key('review-p3')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('score-Idea')), findsOneWidget);
      await tester.drag(find.byKey(const Key('score-Idea')), const Offset(400, 0));
      await tester.enterText(find.byKey(const Key('reviewComment')), 'Clear and useful');
      await tester.tap(find.byKey(const Key('sendReview')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('peerReviewProject p3'));
      expect(api.lastPeerRubric!.keys, peerCriteria);
      expect(api.lastPeerRubric!['Idea'], 5);
      expect(api.lastPeerRubric!['Impact'], 3);
      expect(find.text('Thank you for your review.'), findsOneWidget);
    });

    testWidgets('portfolio: add, publish and delete', (tester) async {
      await show(tester, ProjectsScreen(api: api));
      await gotoTab(tester, 'Portfolio');
      expect(find.byKey(const Key('portfolio-pf1')), findsOneWidget);
      await tester.tap(find.byKey(const Key('publish-pf1')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('publishPortfolioItem pf1 true'));
      expect(find.text('Visible to others'), findsOneWidget);

      await tester.tap(find.byKey(const Key('addPortfolio')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('savePortfolio')));
      await tester.pumpAndSettle();
      expect(find.text('Give it a title.'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('pfTitle')), 'Chess app');
      await tester.enterText(find.byKey(const Key('pfUrl')), 'https://example.com/chess');
      await tester.tap(find.byKey(const Key('savePortfolio')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('addPortfolioItem Chess app'));
      expect(find.text('Chess app'), findsOneWidget);

      await tester.tap(find.byKey(const Key('deletePortfolio-pf1')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('deletePortfolioItem pf1'));
      expect(find.byKey(const Key('portfolio-pf1')), findsNothing);
    });
  });

  group('career preparation', () {
    testWidgets('the hub opens from the Careers screen and lists every part', (tester) async {
      final (api, _) = await pumpApp(tester);
      await openTab(tester, 'Profile');
      final list = find.descendant(of: find.byType(ProfileTab), matching: find.byType(Scrollable)).first;
      await scrollTo(tester, find.byKey(const Key('openCareers')), scrollable: list);
      await tester.tap(find.byKey(const Key('openCareers')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('openCareerPrep')));
      await tester.pumpAndSettle();
      for (final k in ['prepResume', 'prepTests', 'prepHr', 'prepTechnical', 'prepCommunication', 'prepRecs', 'prepAssistant']) {
        expect(find.byKey(Key(k)), findsOneWidget);
      }
      expect(api.calls, isNot(contains('resume')));
    });

    testWidgets('the resume editor saves headline, skills and a new education entry', (tester) async {
      await show(tester, ResumeScreen(api: api), height: 2400);
      expect(find.text('BCom · Demo College · 2024-2027'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('rsHeadline')), 'Aspiring analyst');
      await tester.enterText(find.byKey(const Key('rsSkills')), 'Excel, SQL');
      await tester.tap(find.byKey(const Key('add-exp')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('saveEntry')));
      await tester.pumpAndSettle();
      expect(find.text('Fill in the required fields (a link must start with https://).'), findsOneWidget);
      await tester.tap(find.byKey(const Key('add-exp')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('field-org')), 'Acme');
      await tester.enterText(find.byKey(const Key('field-role')), 'Intern');
      await tester.tap(find.byKey(const Key('saveEntry')));
      await tester.pumpAndSettle();
      expect(find.text('Intern · Acme'), findsOneWidget);
      await tester.tap(find.byKey(const Key('rsVisible')));
      await tester.tap(find.byKey(const Key('saveResume')));
      await tester.pumpAndSettle();
      final saved = api.savedResume!;
      expect(saved['headline'], 'Aspiring analyst');
      expect(saved['skills'], ['Excel', 'SQL']);
      expect(saved['experience'], [
        {'org': 'Acme', 'role': 'Intern'},
      ]);
      expect(saved['visibleToRecruiters'], isFalse);
      expect(find.text('Resume saved'), findsOneWidget);
    });

    testWidgets('an aptitude test: start, answer, submit and see the score by topic', (tester) async {
      await show(tester, AptitudeTestsScreen(api: api));
      expect(find.text('Quantitative basics'), findsOneWidget);
      expect(find.text('Not attempted yet'), findsOneWidget);
      await tester.tap(find.byKey(const Key('take-t1')));
      await tester.pumpAndSettle();
      expect(find.textContaining('2 questions in 10 minutes. Pass mark 50%'), findsOneWidget);
      await tester.tap(find.byKey(const Key('startTest')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('startAptitudeTest t1'));
      expect(find.byKey(const Key('testClock')), findsOneWidget);
      expect(find.text('0 of 2 answered'), findsOneWidget);
      await tester.tap(find.byKey(const Key('option-0-1')));
      await tester.pumpAndSettle();
      expect(find.text('1 of 2 answered'), findsOneWidget);
      await tester.tap(find.byKey(const Key('option-1-0')));
      await tester.tap(find.byKey(const Key('submitTest')));
      await tester.pumpAndSettle();
      expect(api.lastAnswers, [1, 0]);
      expect(find.text('1 of 2 correct'), findsOneWidget);
      expect(find.text('Passed'), findsOneWidget);
      expect(find.byKey(const Key('topic-Arithmetic')), findsOneWidget);
      await tester.tap(find.byKey(const Key('backToTests')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('test-t1')), findsOneWidget);
    });

    testWidgets('a mock interview: answer every question and read the notes per question', (tester) async {
      await show(tester, MockInterviewScreen(api: api, kind: 'hr'), height: 1600);
      expect(find.text('Earlier practice'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('mockRole')), 'Analyst');
      await tester.tap(find.byKey(const Key('startMock')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('startMockInterview hr Analyst 3'));
      await tester.enterText(find.byKey(const Key('mockAnswer-0')), 'I am a commerce student.');
      await tester.tap(find.byKey(const Key('submitMock')));
      await tester.pumpAndSettle();
      expect(find.text('Answer every question first.'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('mockAnswer-1')), 'I like analysis.');
      await tester.tap(find.byKey(const Key('submitMock')));
      await tester.pumpAndSettle();
      expect(api.lastMockAnswers!.map((a) => a.answer), ['I am a commerce student.', 'I like analysis.']);
      expect(find.text('Score: 72.5 out of 10'), findsOneWidget);
      expect(find.text('80 out of 10'), findsOneWidget);
      expect(find.text('• Add an example'), findsOneWidget);
      expect(find.text('• Practise one more round'), findsOneWidget);
    });

    testWidgets('communication practice has no role field', (tester) async {
      await show(tester, MockInterviewScreen(api: api, kind: 'communication'));
      expect(find.byKey(const Key('mockRole')), findsNothing);
      await tester.tap(find.byKey(const Key('startMock')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('startMockInterview communication  3'));
    });

    testWidgets('recommendations show the fit, matched skills, gaps and steps', (tester) async {
      await show(tester, RecommendationsScreen(api: api));
      expect(find.text('Financial analyst'), findsOneWidget);
      expect(find.text('65% fit'), findsOneWidget);
      expect(find.text('You have: Excel'), findsOneWidget);
      expect(find.text('Skill gaps: SQL, Valuation'), findsOneWidget);
      expect(find.text('1. Learn SQL: Do a short course'), findsOneWidget);
    });

    testWidgets('the assistant shows the chat, asks in the app language and labels offline guidance', (tester) async {
      await show(tester, AssistantScreen(api: api));
      expect(find.text('Start with SQL.'), findsOneWidget);
      expect(find.byKey(const Key('offlineGuidance')), findsNothing);
      await tester.enterText(find.byKey(const Key('assistantInput')), 'Which career suits me?');
      await tester.tap(find.byKey(const Key('assistantSend')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('askCareerAssistant en Which career suits me?'));
      expect(find.text('Financial analyst is your closest fit.'), findsOneWidget);
      expect(find.text('• Add evidence of SQL'), findsOneWidget);
      expect(find.byKey(const Key('offlineGuidance')), findsOneWidget);
      expect(find.text('Offline guidance'), findsOneWidget);

      api.assistantAi = true;
      await tester.enterText(find.byKey(const Key('assistantInput')), 'And my resume?');
      await tester.tap(find.byKey(const Key('assistantSend')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('offlineGuidance')), findsOneWidget);
    });
  });

  group('school life', () {
    testWidgets('a college student does not see the school tiles', (tester) async {
      await pumpApp(tester);
      await openTab(tester, 'Profile');
      final list = find.descendant(of: find.byType(ProfileTab), matching: find.byType(Scrollable)).first;
      await scrollTo(tester, find.byKey(const Key('openProjects')), scrollable: list);
      expect(find.byKey(const Key('openProjects')), findsOneWidget);
      await scrollTo(tester, find.byKey(const Key('openCampusLife')), scrollable: list);
      expect(find.byKey(const Key('openDiary')), findsNothing);
      expect(find.byKey(const Key('openReportCards')), findsNothing);
    });

    testWidgets('a school student sees the diary, activities and report cards in More', (tester) async {
      await pumpApp(
        tester,
        setup: (api) => api.record = StudentProfile(id: 's1', fullName: 'Aarav Patel', rollNo: '12', sectionId: 'sec1', sectionName: 'Class 7 B', programLevel: 'k12'),
      );
      await openTab(tester, 'Profile');
      final list = find.descendant(of: find.byType(ProfileTab), matching: find.byType(Scrollable)).first;
      await scrollTo(tester, find.byKey(const Key('openDiary')), scrollable: list);
      expect(find.byKey(const Key('openMyActivities')), findsOneWidget);
      expect(find.byKey(const Key('openReportCards')), findsOneWidget);
    });

    testWidgets('the diary lists entries newest first', (tester) async {
      await show(tester, DiaryScreen(api: api), height: 1600);
      expect(api.calls, contains('classDiary 14'));
      expect(find.text('Fractions: adding unlike denominators'), findsOneWidget);
      expect(find.text('Mathematics · by Meera Iyer'), findsOneWidget);
      expect(find.text('Bring a ruler'), findsOneWidget);
      expect(find.text('Reading: The Banyan Tree'), findsOneWidget);
    });

    testWidgets('activities show clubs and posts, house, grades and achievements', (tester) async {
      await show(tester, MyActivitiesScreen(api: api), height: 1600);
      expect(find.text('Red House'), findsOneWidget);
      expect(find.text('25 house points · House captain'), findsOneWidget);
      expect(find.text('Secretary · 30 points, 4 activities'), findsOneWidget);
      expect(find.text('Annual Day'), findsOneWidget);
      expect(find.text('Co-curricular grades, Term 1'), findsOneWidget);
      expect(find.text('Plays well'), findsOneWidget);
      expect(find.text('Inter-school chess'), findsOneWidget);
      expect(find.text('Maths quiz winner'), findsOneWidget);
    });

    testWidgets('report cards: list, detail with grades, behaviour and attendance, and the PDF', (tester) async {
      await show(tester, ReportCardsScreen(api: api, studentId: 's1', openFile: fakeOpen));
      expect(api.calls, contains('reportCards s1'));
      await tester.tap(find.byKey(const Key('reportCard-rc1')));
      await tester.pumpAndSettle();
      expect(find.text('88/100 · A'), findsOneWidget);
      expect(find.text('Plays in the school team'), findsOneWidget);
      expect(find.text('Attendance: 94.4% · 170 of 180 days'), findsOneWidget);
      expect(find.text('Behaviour grade: A'), findsOneWidget);
      await tester.tap(find.byKey(const Key('reportCardPdf')));
      await tester.pumpAndSettle();
      expect(opened, ['report-card.pdf %PDF-']);
    });

    testWidgets('no report cards says so', (tester) async {
      api.reportCardRows = [];
      await show(tester, ReportCardsScreen(api: api, studentId: 's1'));
      expect(find.text('No report cards have been published yet.'), findsOneWidget);
    });
  });

  group('alumni', () {
    Future<void> pumpAlumni(WidgetTester tester, {bool studentToo = false}) async {
      await pumpApp(
        tester,
        setup: (api) {
          api.profile = Me(id: 'u7', fullName: 'Riya Shah', roles: studentToo ? ['student', 'alumni'] : ['alumni'], preferredLanguage: 'en', institution: 'Demo College');
          if (!studentToo) api.record = null;
        },
      );
    }

    testWidgets('a graduate with an alumni login gets the alumni home, not a rejection', (tester) async {
      await pumpAlumni(tester);
      expect(find.text('Demo College'), findsOneWidget);
      expect(find.text('Riya Shah'), findsOneWidget);
      expect(find.text('BCom, class of 2021'), findsOneWidget);
      expect(find.byType(NavigationBar), findsNothing);
      expect(find.byKey(const Key('signOut')), findsOneWidget);
    });

    testWidgets('signing in as a graduate works and keeps the session', (tester) async {
      final (api, state) = await pumpApp(
        tester,
        signedIn: false,
        setup: (api) {
          api.profile = Me(id: 'u7', fullName: 'Riya Shah', roles: ['alumni'], preferredLanguage: 'en', institution: 'Demo College');
          api.record = null;
        },
      );
      await state.signIn(server: 'http://localhost', tenant: 'demo-college', login: 'riya@example.com', password: 'kinetix123');
      await tester.pumpAndSettle();
      expect(state.signedIn, isTrue);
      expect(state.alumniOnly, isTrue);
      expect(find.text('Riya Shah'), findsOneWidget);
      expect(storedToken(state), 'tok');
      expect(api.calls, isNot(contains('student')));
    });

    testWidgets('the profile is saved', (tester) async {
      await pumpAlumni(tester);
      await tester.enterText(find.byKey(const Key('alBio')), 'Working in banking');
      await tester.tap(find.byKey(const Key('alMentor')));
      await tester.ensureVisible(find.byKey(const Key('alSave')));
      await tester.tap(find.byKey(const Key('alSave')));
      await tester.pumpAndSettle();
      expect(find.text('Profile saved'), findsOneWidget);
    });

    testWidgets('stories: write a draft, edit it, send it for review; a rejected one shows the office note', (tester) async {
      final (api, _) = await pumpApp(
        tester,
        setup: (api) {
          api.profile = Me(id: 'u7', fullName: 'Riya Shah', roles: ['alumni'], preferredLanguage: 'en', institution: 'Demo College');
          api.record = null;
          api.storyJson.add({'id': 's9', 'title': 'Needs work', 'body': 'A short body that is long enough to be a story really.', 'status': 'rejected', 'featured': false, 'reviewNote': 'Add your batch year'});
        },
      );
      await gotoTab(tester, 'My stories');
      expect(find.text('Needs changes'), findsOneWidget);
      expect(find.text('Note from the alumni office: Add your batch year'), findsOneWidget);
      expect(find.byKey(const Key('submit-s9')), findsNothing);

      await tester.tap(find.byKey(const Key('writeStory')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('storyTitle')), 'Hi');
      await tester.tap(find.byKey(const Key('saveStory')));
      await tester.pumpAndSettle();
      expect(find.text('Give your story a title.'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('storyTitle')), 'My bank years');
      await tester.enterText(find.byKey(const Key('storyBody')), 'I joined a bank after college and learnt what real work looks like.');
      await tester.tap(find.byKey(const Key('saveStory')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('writeStory My bank years'));
      expect(find.text('My bank years'), findsOneWidget);
      final id = api.storyJson.first['id'];
      await tester.tap(find.byKey(Key('submit-$id')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('submitStory $id'));
      expect(find.byKey(Key('submit-$id')), findsNothing);
      expect(find.text('The alumni office is reviewing this.'), findsOneWidget);
    });

    testWidgets('giving and volunteering: pledge, receipt, sign up and withdraw', (tester) async {
      final (api, _) = await pumpApp(
        tester,
        setup: (api) {
          api.profile = Me(id: 'u7', fullName: 'Riya Shah', roles: ['alumni'], preferredLanguage: 'en', institution: 'Demo College');
          api.record = null;
        },
      );
      await gotoTab(tester, 'Give back');
      expect(find.byKey(const Key('giveTotal')), findsOneWidget);
      expect(find.text('You have given ₹2,500 so far. Thank you.'), findsOneWidget);
      expect(find.byKey(const Key('donation-dn1')), findsOneWidget);

      await tester.tap(find.byKey(const Key('pledge-ca1')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('sendPledge')));
      await tester.pumpAndSettle();
      expect(find.text('Enter an amount in rupees.'), findsOneWidget);
      await tester.tap(find.byKey(const Key('pledge-ca1')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('pledgeAmount')), '1,000');
      await tester.tap(find.byKey(const Key('sendPledge')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('alumniPledge ca1 100000'));
      expect(find.byKey(const Key('pledgeRow-pl1')), findsOneWidget);

      await tester.scrollUntilVisible(find.byKey(const Key('signup-vo1')), 300, scrollable: find.byType(Scrollable).last);
      await tester.tap(find.byKey(const Key('signup-vo1')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('alumniVolunteerSignUp vo1'));
      expect(find.textContaining('3 of 5 places taken'), findsOneWidget);
      await tester.tap(find.byKey(const Key('withdraw-vo1')));
      await tester.pumpAndSettle();
      expect(api.calls, contains('alumniVolunteerWithdraw vo1'));
      expect(find.textContaining('2 of 5 places taken'), findsOneWidget);
    });

    testWidgets('published stories are listed', (tester) async {
      await pumpAlumni(tester);
      await gotoTab(tester, 'Success stories');
      expect(find.text('From Hubli to Mumbai'), findsOneWidget);
      expect(find.text('Karan Mehta · 2018 · Manager · Acme'), findsOneWidget);
    });

    testWidgets('a student who is also an alumnus can open the alumni home from More', (tester) async {
      await pumpAlumni(tester, studentToo: true);
      await openTab(tester, 'Profile');
      final list = find.descendant(of: find.byType(ProfileTab), matching: find.byType(Scrollable)).first;
      await scrollTo(tester, find.byKey(const Key('openAlumni')), scrollable: list);
      await tester.tap(find.byKey(const Key('openAlumni')));
      await tester.pumpAndSettle();
      expect(find.byType(AlumniHome), findsOneWidget);
      expect(find.byKey(const Key('signOut')), findsNothing);
    });
  });

  group('Hindi and Kannada', () {
    testWidgets('the new screens render without overflow at large text', (tester) async {
      for (final lang in ['hi', 'kn']) {
        for (final screen in <Widget>[
          ProjectsScreen(api: api),
          AlumniHome(api: api),
          AptitudeTestsScreen(api: api),
          RecommendationsScreen(api: api),
          ReportCardsScreen(api: api, studentId: 's1'),
          MyActivitiesScreen(api: api),
          CareerPrepScreen(api: api),
        ]) {
          phone(tester);
          tester.platformDispatcher.textScaleFactorTestValue = 1.6;
          addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
          await tester.pumpWidget(host(screen, locale: Locale(lang)));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull, reason: '$lang ${screen.runtimeType}');
          await tester.pumpWidget(const SizedBox());
        }
      }
    });

    testWidgets('words are translated, not left in English', (tester) async {
      await show(tester, CareerPrepScreen(api: api), locale: const Locale('hi'));
      expect(find.text('करियर की तैयारी'), findsOneWidget);
      expect(find.text('Career preparation'), findsNothing);
      await show(tester, ProjectsScreen(api: api), locale: const Locale('kn'));
      expect(find.text('ನನ್ನ ಯೋಜನೆಗಳು'), findsWidgets);
      expect(find.text('My projects'), findsNothing);
    });
  });
}
