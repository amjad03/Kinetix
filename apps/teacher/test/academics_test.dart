// Course files, course outcomes (CO/PO), faculty research and project mentoring (Profile → Staff tools).
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/core/academics_models.dart';
import 'package:kinetix_teacher/core/api.dart';
import 'package:kinetix_teacher/core/models.dart';
import 'package:kinetix_teacher/features/work/course_file_screens.dart';
import 'package:kinetix_teacher/features/work/obe_screens.dart';
import 'package:kinetix_teacher/features/work/project_screens.dart';
import 'package:kinetix_teacher/features/work/research_screens.dart';

import 'fake_api.dart';
import 'helpers.dart';

/// Taps a tab; with the test font the labels are wide, so the tab may first need scrolling into view.
Future<void> openTab(WidgetTester tester, String key) async {
  await tester.ensureVisible(find.byKey(Key(key)));
  await tester.pumpAndSettle();
  await tapAndSettle(tester, find.byKey(Key(key)));
}

void main() {
  late FakeTeacherApi api;
  setUp(() {
    api = FakeTeacherApi();
    seed(api);
  });

  group('models', () {
    test('a course file version parses its summary, dates and review', () {
      final v = CourseFileVersion.fromJson({
        'id': 'cf', 'sectionId': 's', 'subjectId': 'u', 'section': 'A', 'subject': 'Acc', 'version': 3, 'sizeBytes': 2048,
        'summary': {'topics': 10, 'topicsCovered': 4}, 'generatedByName': 'Anita', 'generatedAt': '2026-10-04T05:30:00.000Z',
        'reviewedByName': 'Dr. Rao', 'reviewedAt': '2026-10-05T05:30:00.000Z', 'reviewRemark': 'Fine',
      });
      expect((v.version, v.count('topics'), v.count('recordings'), v.reviewed, v.reviewRemark), (3, 10, 0, true, 'Fine'));
      expect(fileSizeText(2048), '2 KB');
      expect(fileSizeText(3 * 1024 * 1024), '3.0 MB');
    });

    test('the live course-outcome version is shown, else the newest', () {
      CoSet set(String id, int version, String status) => CoSet(id: id, version: version, status: status, outcomes: const []);
      expect(CoSet.current([set('a', 1, 'retired'), set('b', 2, 'active'), set('c', 3, 'draft')])!.id, 'b');
      expect(CoSet.current([set('a', 1, 'retired'), set('c', 3, 'draft')])!.id, 'c');
      expect(CoSet.current(const []), isNull);
    });

    test('the matrix reads cells and finds the programme', () {
      final m = CoMatrix.fromJson({
        'cos': [{'id': 'co1', 'code': 'CO1', 'statement': 's'}],
        'outcomes': [{'id': 'po1', 'programId': 'prog', 'kind': 'po', 'code': 'PO1', 'statement': 's'}],
        'cells': [{'coId': 'co1', 'outcomeId': 'po1', 'strength': 2}],
      });
      expect((m.strength('co1', 'po1'), m.strength('co1', 'po9'), m.programId), (2, 0, 'prog'));
      expect(const CoMatrix(cos: [], outcomes: [], cells: {}).programId, isNull);
    });

    test('attainment reads the scale from the configuration', () {
      final a = CoAttainment.fromJson({'targetId': 't', 'code': 'CO1', 'combined': '2.50', 'target': 2, 'met': true, 'trend': 'up', 'maxLevel': 4});
      expect((a.combined, a.maxLevel, a.met, a.trend), (2.5, 4.0, true, 'up'));
      expect(CoAttainment.fromJson({'targetId': 't', 'code': 'CO2', 'target': 2, 'met': false}).trend, 'new');
    });

    test('the current academic year is the one that holds today, else the latest', () {
      const terms = [
        TermYear(academicYearId: 'y1', startsOn: '2025-06-01', endsOn: '2026-03-31'),
        TermYear(academicYearId: 'y2', startsOn: '2026-06-01', endsOn: '2027-03-31'),
      ];
      expect(TermYear.current(terms, '2026-10-04'), 'y2');
      expect(TermYear.current(terms, '2026-04-15'), 'y2');
      expect(TermYear.current(const [], '2026-10-04'), isNull);
    });

    test('a thesis and a project workspace parse; only mentors act', () {
      final t = ThesisDetail.fromJson({
        'id': 't', 'title': 'T', 'abstract': 'A', 'stage': 'draft', 'hasText': true, 'scholar': {'fullName': 'Meera', 'programme': 'phd'},
        'events': [{'stage': 'synopsis', 'note': 'n', 'createdAt': '2026-03-02T05:00:00Z'}],
        'vivas': [{'id': 'v', 'kind': 'open_defence', 'scheduledAt': '2026-08-10T05:00:00Z', 'venue': 'Hall', 'panel': [{'name': 'Dr. Rao', 'role': 'examiner'}], 'status': 'held', 'outcome': 'passed'}],
        'similarity': {'scorePercent': '12.50'}, 'similarityLimitPercent': 25,
      });
      expect((t.canSubmit, t.similarityPercent, t.events.length), (true, 12.5, 1));
      expect(t.vivas.single.panel, ['Dr. Rao']);
      Map<String, dynamic> ws(String role) => {
        'project': {'id': 'p', 'code': 'C', 'title': 'T', 'status': 'active', 'pi': 'X'}, 'myRole': role, 'members': [], 'milestones': [], 'files': [],
        'hub': {'showcase': true, 'lookingFor': ['python'], 'openings': 2}, 'vivas': [], 'reviews': {'count': 2, 'average': 71.5},
      };
      expect(ProjectWorkspace.fromJson(ws('supervisor')).isMentor, isTrue);
      expect(ProjectWorkspace.fromJson(ws('admin')).isMentor, isTrue);
      expect(ProjectWorkspace.fromJson(ws('member')).isMentor, isFalse);
      expect(ProjectWorkspace.fromJson(ws('pi')).hub.lookingFor, ['python']);
    });

    test('roles decide who sees each area, as in the API', () {
      expect(hasAnyRole(['teacher'], researchRoles), isTrue);
      expect(hasAnyRole(['quality_officer'], researchRoles), isFalse);
      expect(hasAnyRole(['teacher'], attainmentRoles), isFalse);
      expect(hasAnyRole(['hod'], attainmentRoles), isTrue);
      expect(hasAnyRole(['driver'], obeRoles), isFalse);
      expect(splitList(' python, Flutter ,,\nSQL;'), ['python', 'Flutter', 'SQL']);
    });
  });

  group('course files', () {
    testWidgets('lists classes with versions, counts, review remark; generates a new version; opens the PDF', (tester) async {
      phone(tester);
      Uint8List? opened;
      String? openedName;
      await tester.pumpWidget(localizedApp(home: CourseFilesScreen(api: api, openFile: (bytes, name, mime) async {
        opened = bytes;
        openedName = name;
        return true;
      })));
      await tester.pumpAndSettle();
      expect(find.text('Corporate Accounting · BCOM-3.1'), findsNWidgets(2));
      expect(find.text('Version 1'), findsOneWidget);
      expect(find.text('Topics taught: 18/24'), findsOneWidget);
      expect(find.text('Reviewed by Dr. Rao'), findsOneWidget);
      expect(find.byKey(const Key('remark-cf1')), findsOneWidget);
      expect(find.text('No version has been generated yet.'), findsOneWidget);

      await tapAndSettle(tester, find.byKey(const Key('generate-sec1:sub1')));
      expect(api.calls.last, 'generateCourseFile sec1 sub1');
      expect(find.text('Version 2'), findsOneWidget);
      expect(find.text('Not reviewed yet'), findsOneWidget);

      await tapAndSettle(tester, find.byKey(const Key('pdf-cf1')));
      expect(api.calls.last, 'courseFilePdf cf1');
      expect(String.fromCharCodes(opened!), '%PDF-1.4');
      expect(openedName, 'course-file-Corporate Accounting-BCom Sem 3 A-v1.pdf');
    });

    testWidgets('says so when nothing can open the PDF, and when there is nothing to build', (tester) async {
      phone(tester);
      await tester.pumpWidget(localizedApp(home: CourseFilesScreen(api: api, openFile: (_, _, _) async => false)));
      await tester.pumpAndSettle();
      await tapAndSettle(tester, find.byKey(const Key('pdf-cf1')));
      expect(find.text(strings('en').couldNotOpenFile), findsOneWidget);

      api.courseFileOptionList = const [];
      api.courseFileList = [];
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpWidget(localizedApp(home: CourseFilesScreen(api: api), language: 'hi'));
      await tester.pumpAndSettle();
      expect(find.text(strings('hi').courseFilesEmpty), findsOneWidget);
    });

    testWidgets('reads in Kannada', (tester) async {
      phone(tester);
      await tester.pumpWidget(localizedApp(home: CourseFilesScreen(api: api), language: 'kn'));
      await tester.pumpAndSettle();
      final kn = strings('kn');
      expect(find.text(kn.courseFileGenerate), findsNWidgets(2));
      expect(kn.courseFilesTitle, isNot(strings('en').courseFilesTitle));
      expect(find.text(kn.courseFileVersion('1')), findsOneWidget);
    });
  });

  group('course outcomes', () {
    testWidgets('a head sees the COs, the CO-PO matrix and attainment above each other', (tester) async {
      phone(tester, size: const Size(412, 1400));
      await tester.pumpWidget(localizedApp(home: OutcomesScreen(api: api, roles: const ['hod'])));
      await tester.pumpAndSettle();
      // One row per subject, whatever the class.
      expect(find.byKey(const Key('obeSubject-sub1')), findsOneWidget);
      await tapAndSettle(tester, find.byKey(const Key('obeSubject-sub1')));

      expect(find.text('Version 2 · Active'), findsOneWidget);
      expect(find.text('Value goodwill by common methods'), findsOneWidget);
      expect(find.text('Old statement'), findsNothing);
      // Matrix: heads, strengths, and a dash where a CO does not feed a PO.
      expect(find.byKey(const Key('head-PSO1')), findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('cell-CO1-PO1')), matching: find.text('3')), findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('cell-CO1-PSO1')), matching: find.text('–')), findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('cell-CO2-PSO1')), matching: find.text('3')), findsOneWidget);
      // The matrix is above the attainment.
      expect(tester.getTopLeft(find.byKey(const Key('cell-CO1-PO1'))).dy, lessThan(tester.getTopLeft(find.byKey(const Key('attainment-CO1'))).dy));
      expect(api.calls.last, 'coAttainment prog1 ay1');
      expect(find.text('Target met'), findsOneWidget);
      expect(find.text('Below target'), findsOneWidget);
      expect(find.textContaining('Target 2'), findsNWidgets(2));
    });

    testWidgets('a teacher sees the COs and matrix but is told attainment is for heads, without asking for it', (tester) async {
      phone(tester, size: const Size(412, 1400));
      await tester.pumpWidget(localizedApp(home: SubjectOutcomesScreen(api: api, subjectId: 'sub1', title: 'Corporate Accounting', canSeeAttainment: false)));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('cell-CO1-PO1')), findsOneWidget);
      expect(find.byKey(const Key('attainmentRestricted')), findsOneWidget);
      expect(api.calls.where((c) => c.startsWith('coAttainment')), isEmpty);
    });

    testWidgets('an attainment the server refuses does not hide the rest', (tester) async {
      phone(tester, size: const Size(412, 1400));
      api.attainmentError = ApiException(403, 'Forbidden');
      await tester.pumpWidget(localizedApp(home: SubjectOutcomesScreen(api: api, subjectId: 'sub1', title: 'x', canSeeAttainment: true)));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('cell-CO1-PO1')), findsOneWidget);
      expect(find.byKey(const Key('attainmentNone')), findsOneWidget);
    });

    testWidgets('a subject without outcomes, and a programme without POs, say so', (tester) async {
      phone(tester, size: const Size(412, 1400));
      api.coSetList = const [];
      await tester.pumpWidget(localizedApp(home: SubjectOutcomesScreen(api: api, subjectId: 'sub1', title: 'x', canSeeAttainment: true)));
      await tester.pumpAndSettle();
      expect(find.text(strings('en').obeNoOutcomes), findsOneWidget);

      api.coSetList = const [CoSet(id: 'cs', version: 1, status: 'draft', outcomes: [CourseOutcome(id: 'co1', code: 'CO1', statement: 'Do things')])];
      api.coMatrixData = const CoMatrix(cos: [CourseOutcome(id: 'co1', code: 'CO1', statement: 'Do things')], outcomes: [], cells: {});
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpWidget(localizedApp(home: SubjectOutcomesScreen(api: api, subjectId: 'sub1', title: 'y', canSeeAttainment: true), language: 'hi'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('matrixEmpty')), findsOneWidget);
      expect(find.text('Version 1 · Draft'), findsNothing);
      expect(find.text('${strings('hi').obeVersion('1')} · ${strings('hi').obeStatusDraft}'), findsOneWidget);
    });
  });

  group('research', () {
    testWidgets('projects, scholars with thesis stage, publications of mine and datasets with their access', (tester) async {
      phone(tester);
      await tester.pumpWidget(localizedApp(home: ResearchScreen(api: api, userId: 'u1')));
      await tester.pumpAndSettle();
      expect(find.text('Water quality of the Tunga river'), findsOneWidget);
      expect(find.textContaining('PRJ-2026-001 · Research · Active'), findsOneWidget);

      await openTab(tester, 'tabResScholars');
      expect(find.textContaining('Stage: Draft'), findsOneWidget);
      expect(find.textContaining('No thesis record yet'), findsOneWidget);

      await openTab(tester, 'tabResPublications');
      expect(api.calls.contains('publications u1'), isTrue);
      expect(find.text('Recharge estimates from isotope data'), findsOneWidget);
      expect(find.textContaining('DOI 10.1000/jh.2025.114'), findsOneWidget);

      await openTab(tester, 'tabResDatasets');
      expect(find.text('Open'), findsOneWidget);
      expect(find.text('Restricted'), findsOneWidget);
      expect(find.textContaining('Embargoed until'), findsOneWidget);
      expect(find.textContaining('2 files'), findsOneWidget);
      expect(find.textContaining('1 file'), findsOneWidget);
    });

    testWidgets('a supervisor opens a thesis, sees events, vivas and similarity, and submits it from draft', (tester) async {
      phone(tester, size: const Size(412, 1200));
      await tester.pumpWidget(localizedApp(home: ResearchScreen(api: api, userId: 'u1')));
      await tester.pumpAndSettle();
      await openTab(tester, 'tabResScholars');
      await tapAndSettle(tester, find.byKey(const Key('scholar-sc1')));

      expect(find.byKey(const Key('thesisHeading')), findsOneWidget);
      expect(find.text('Similarity 12.5% (limit 25%)'), findsOneWidget);
      expect(find.textContaining('Cleared to write up'), findsOneWidget);
      expect(find.textContaining('Dr. Rao, Dr. Iyer'), findsOneWidget);
      expect(find.textContaining('Thesis record opened'), findsOneWidget);
      expect(find.byKey(const Key('stage-draft')), findsOneWidget);

      await tapAndSettle(tester, find.byKey(const Key('submitThesis')));
      await tester.enterText(find.byKey(const Key('thesisNote')), 'Ready for the office');
      await tapAndSettle(tester, find.byKey(const Key('confirmSubmitThesis')));
      expect(api.calls.last, 'thesisStage th1 submitted Ready for the office');
      // Submitted: nothing more for the supervisor to press.
      expect(find.byKey(const Key('submitThesis')), findsNothing);
    });

    testWidgets('a thesis without text cannot be submitted yet', (tester) async {
      phone(tester, size: const Size(412, 1200));
      final d = api.thesisDetailData;
      api.thesisDetailData = ThesisDetail(
        id: d.id, title: d.title, abstract: '', stage: 'draft', hasText: false, scholarName: d.scholarName, programme: d.programme, events: d.events, vivas: const [], similarityLimit: 25,
      );
      await tester.pumpWidget(localizedApp(home: ThesisScreen(api: api, thesisId: 'th1', title: 'Meera')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('thesisNeedsText')), findsOneWidget);
      expect(find.text(strings('en').similarityNone), findsOneWidget);
      expect(tester.widget<FilledButton>(find.byKey(const Key('submitThesis'))).onPressed, isNull);
    });

    testWidgets('a scholar without a thesis gets a record opened', (tester) async {
      phone(tester);
      await tester.pumpWidget(localizedApp(home: ResearchScreen(api: api, userId: 'u1')));
      await tester.pumpAndSettle();
      await openTab(tester, 'tabResScholars');
      await tapAndSettle(tester, find.byKey(const Key('scholar-sc2')));
      await tester.enterText(find.byKey(const Key('thesisTitle')), 'Soil carbon in coffee estates');
      await tapAndSettle(tester, find.byKey(const Key('confirmOpenThesis')));
      expect(api.calls.last, 'openThesis sc2 Soil carbon in coffee estates');
      expect(find.textContaining('Stage: Synopsis'), findsOneWidget);
    });

    testWidgets('a publication is added by DOI; a refused DOI shows the reason', (tester) async {
      phone(tester);
      await tester.pumpWidget(localizedApp(home: ResearchScreen(api: api, userId: 'u1')));
      await tester.pumpAndSettle();
      await openTab(tester, 'tabResPublications');
      await tapAndSettle(tester, find.byKey(const Key('addByDoi')));
      await tester.enterText(find.byKey(const Key('doiField')), '10.1038/s44221-026-0001');
      await tapAndSettle(tester, find.byKey(const Key('confirmImportDoi')));
      expect(api.calls, contains('importDoi 10.1038/s44221-026-0001'));
      expect(find.text('Imported paper'), findsOneWidget);

      api.doiError = ApiException(409, 'A publication with that DOI is already recorded');
      await tapAndSettle(tester, find.byKey(const Key('addByDoi')));
      await tester.enterText(find.byKey(const Key('doiField')), '10.1038/s44221-026-0001');
      await tapAndSettle(tester, find.byKey(const Key('confirmImportDoi')));
      expect(find.text('A publication with that DOI is already recorded'), findsOneWidget);
    });

    testWidgets('the research screens work in Hindi', (tester) async {
      phone(tester);
      await tester.pumpWidget(localizedApp(home: ResearchScreen(api: api, userId: 'u1'), language: 'hi'));
      await tester.pumpAndSettle();
      final hi = strings('hi');
      expect(find.text(hi.researchTitle), findsOneWidget);
      expect(find.textContaining(resStatusText(hi, 'active')), findsOneWidget);
      expect(hi.thesisStageViva, isNot(strings('en').thesisStageViva));
      expect(hi.datasetFiles(1), isNot(hi.datasetFiles(3)));
    });
  });

  group('project mentoring', () {
    testWidgets('lists my projects with showcase and recruiting flags and opens the workspace', (tester) async {
      phone(tester, size: const Size(412, 1400));
      await tester.pumpWidget(localizedApp(home: ProjectsScreen(api: api)));
      await tester.pumpAndSettle();
      expect(find.text('Smart attendance with face matching'), findsOneWidget);
      expect(find.text('Recruiting'), findsOneWidget);
      expect(find.text('Showcase'), findsNothing);

      await tapAndSettle(tester, find.byKey(const Key('project-pj1')));
      expect(find.text('Your role: Supervisor'), findsOneWidget);
      expect(find.text('Aarav Patel'), findsOneWidget);
      expect(find.text('Prototype demo'), findsOneWidget);
      expect(find.text('1 reviews, average 72%'), findsOneWidget);
      expect(find.text('https://example.org/design'), findsOneWidget);
      expect(find.textContaining('Room 204'), findsOneWidget);
    });

    testWidgets('adds a link, records the viva result and schedules a viva', (tester) async {
      phone(tester, size: const Size(412, 1800));
      await tester.pumpWidget(localizedApp(home: ProjectWorkspaceScreen(api: api, project: api.myProjectList.single)));
      await tester.pumpAndSettle();

      await tapAndSettle(tester, find.byKey(const Key('addLink')));
      await tester.enterText(find.byKey(const Key('linkTitle')), 'Demo video');
      await tester.enterText(find.byKey(const Key('linkUrl')), 'not a link');
      await tapAndSettle(tester, find.byKey(const Key('confirmAddLink')));
      expect(find.text(strings('en').projLinkInvalid), findsOneWidget);
      expect(api.calls.where((c) => c.startsWith('projectLink')), isEmpty);
      await tester.enterText(find.byKey(const Key('linkUrl')), 'https://example.org/demo');
      await tapAndSettle(tester, find.byKey(const Key('confirmAddLink')));
      expect(api.calls.last, 'projectLink pj1 Demo video https://example.org/demo');
      expect(find.text('Demo video'), findsOneWidget);

      await tapAndSettle(tester, find.byKey(const Key('record-pv1')));
      await tapAndSettle(tester, find.byKey(const Key('outcome-revise')));
      await tester.enterText(find.byKey(const Key('vivaScore')), '140');
      await tapAndSettle(tester, find.byKey(const Key('confirmVivaResult')));
      expect(find.text(strings('en').projVivaScoreInvalid), findsOneWidget);
      await tester.enterText(find.byKey(const Key('vivaScore')), '64.5');
      await tester.enterText(find.byKey(const Key('vivaRemarks')), 'Fix the dataset split');
      await tapAndSettle(tester, find.byKey(const Key('confirmVivaResult')));
      expect(api.calls.last, 'projectVivaResult pv1 revise 64.5 Fix the dataset split');
      expect(find.byKey(const Key('record-pv1')), findsNothing);
      expect(find.textContaining('Revise and resubmit · 64.5'), findsOneWidget);

      await tapAndSettle(tester, find.byKey(const Key('scheduleViva')));
      await tapAndSettle(tester, find.byKey(const Key('saveViva')));
      expect(find.text(strings('en').projVivaPanelNeeded), findsOneWidget);
      await tester.enterText(find.byKey(const Key('vivaVenue')), 'Seminar hall');
      await tester.enterText(find.byKey(const Key('vivaPanel')), 'Dr. Rao, Dr. Iyer');
      await tapAndSettle(tester, find.byKey(const Key('saveViva')));
      expect(api.calls.last, startsWith('projectViva pj1 '));
      expect(api.calls.last, endsWith(' Seminar hall Dr. Rao|Dr. Iyer'));
    });

    testWidgets('the discussion posts messages and replies', (tester) async {
      phone(tester, size: const Size(412, 1200));
      await tester.pumpWidget(localizedApp(home: ProjectWorkspaceScreen(api: api, project: api.myProjectList.single)));
      await tester.pumpAndSettle();
      await openTab(tester, 'tabProjDiscussion');
      expect(find.textContaining('Please share the dataset plan.'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('commentField')), 'Plan attached below');
      await tapAndSettle(tester, find.byKey(const Key('sendComment')));
      expect(api.calls.last, 'projectComment pj1 - Plan attached below');
      expect(find.textContaining('Plan attached below'), findsOneWidget);

      await tapAndSettle(tester, find.byKey(const Key('reply-pc1')));
      expect(find.text('Replying to Anita Sharma'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('commentField')), 'Thanks');
      await tapAndSettle(tester, find.byKey(const Key('sendComment')));
      expect(api.calls.last, 'projectComment pj1 pc1 Thanks');
      expect(find.byKey(const Key('replyingTo')), findsNothing);
    });

    testWidgets('a mentor writes a rubric review', (tester) async {
      phone(tester, size: const Size(412, 1200));
      await tester.pumpWidget(localizedApp(home: ProjectWorkspaceScreen(api: api, project: api.myProjectList.single)));
      await tester.pumpAndSettle();
      await openTab(tester, 'tabProjReviews');
      expect(find.textContaining('Mentor · Anita Sharma · 70%'), findsOneWidget);
      expect(find.textContaining('Understanding: 4/5'), findsOneWidget);

      await tapAndSettle(tester, find.byKey(const Key('writeReview')));
      await tapAndSettle(tester, find.byKey(const Key('score-0-5')));
      await tapAndSettle(tester, find.byKey(const Key('score-3-1')));
      await tester.enterText(find.byKey(const Key('reviewComment')), 'Strong work');
      await tapAndSettle(tester, find.byKey(const Key('saveReview')));
      expect(api.calls.last, 'projectReview pj1 Understanding=5,Execution=3,Documentation=3,Teamwork=1 /5 Strong work');
      expect(find.textContaining('Strong work'), findsOneWidget);
    });

    testWidgets('a mentor edits the hub, decides a join request and sees skill matches', (tester) async {
      phone(tester, size: const Size(412, 2200));
      await tester.pumpWidget(localizedApp(home: ProjectWorkspaceScreen(api: api, project: api.myProjectList.single)));
      await tester.pumpAndSettle();
      await openTab(tester, 'tabProjTeam');
      expect(find.text('Ananya Gowda'), findsOneWidget);
      expect(find.text('Bhavya Reddy · U03BC003'), findsOneWidget);
      expect(find.text('50% match'), findsOneWidget);

      await tapAndSettle(tester, find.byKey(const Key('hubShowcase')));
      await tester.enterText(find.byKey(const Key('hubLooking')), 'python, sql');
      await tester.enterText(find.byKey(const Key('hubOpenings')), '3');
      await tapAndSettle(tester, find.byKey(const Key('saveHub')));
      expect(api.calls.last, 'projectHub pj1 showcase=true recruiting=true openings=3 [python,sql] Face-matching attendance for classrooms');
      expect(find.byKey(const Key('hubNotice')), findsOneWidget);

      await tapAndSettle(tester, find.byKey(const Key('accept-jr1')));
      expect(api.calls.last, 'decideJoin jr1 accept');
      expect(find.byKey(const Key('accept-jr1')), findsNothing);
      expect(find.text('I know Flutter.\nAccepted'), findsOneWidget);
    });

    testWidgets('a project member has no mentor actions and no team tab', (tester) async {
      phone(tester, size: const Size(412, 1400));
      final w = api.projectWorkspaceData;
      api.projectWorkspaceData = ProjectWorkspace(
        id: w.id, code: w.code, title: w.title, status: w.status, pi: w.pi, myRole: 'member', members: w.members, milestones: w.milestones, files: w.files, hub: w.hub, vivas: w.vivas,
        reviewCount: 0,
      );
      await tester.pumpWidget(localizedApp(home: ProjectWorkspaceScreen(api: api, project: api.myProjectList.single)));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('tabProjTeam')), findsNothing);
      expect(find.byKey(const Key('scheduleViva')), findsNothing);
      expect(find.byKey(const Key('record-pv1')), findsNothing);
      await openTab(tester, 'tabProjReviews');
      expect(find.byKey(const Key('writeReview')), findsNothing);
    });

    testWidgets('the project screens read in Kannada', (tester) async {
      phone(tester);
      await tester.pumpWidget(localizedApp(home: ProjectsScreen(api: api), language: 'kn'));
      await tester.pumpAndSettle();
      final kn = strings('kn');
      expect(find.text(kn.projectsTitle), findsOneWidget);
      expect(find.text(kn.projRecruiting), findsOneWidget);
      expect(kn.projTabTeam, isNot(strings('en').projTabTeam));
    });
  });

  group('Profile', () {
    Future<void> reveal(WidgetTester tester, String key) async {
      await tester.scrollUntilVisible(find.byKey(Key(key)), 300, scrollable: find.descendant(of: find.byType(CustomScrollView), matching: find.byType(Scrollable)).first);
    }

    testWidgets('a teacher finds all four areas beside the other work tools', (tester) async {
      phone(tester);
      await pumpApp(tester, api, prefs: {'token': 'tok'});
      await openProfile(tester);
      for (final key in ['openCourseFiles', 'openOutcomes', 'openResearch', 'openProjects']) {
        await reveal(tester, key);
        expect(find.byKey(Key(key)), findsOneWidget, reason: key);
      }
      await tapAndSettle(tester, find.byKey(const Key('openResearch')));
      expect(find.text('Research'), findsWidgets);
    });

    testWidgets('entries the roles cannot use are hidden', (tester) async {
      phone(tester);
      api.profile = Me(id: 'u2', fullName: 'Quality Officer', roles: const ['quality_officer'], preferredLanguage: 'en', institution: 'Demo College');
      await pumpApp(tester, api, prefs: {'token': 'tok'});
      await openProfile(tester);
      await reveal(tester, 'openOutcomes');
      expect(find.byKey(const Key('openCourseFiles')), findsOneWidget);
      expect(find.byKey(const Key('openOutcomes')), findsOneWidget);
      expect(find.byKey(const Key('openResearch')), findsNothing);
      expect(find.byKey(const Key('openProjects')), findsNothing);
    });
  });
}
