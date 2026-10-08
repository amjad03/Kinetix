// Course registration, the outcome passport, surveys, clubs and events.
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/core/api.dart';
import 'package:kinetix_student/core/campus_life.dart';
import 'package:kinetix_student/features/campus/campus_life_screen.dart';
import 'package:kinetix_student/features/campus/course_registration_screen.dart';
import 'package:kinetix_student/features/campus/passport_screen.dart';
import 'package:kinetix_student/features/campus/surveys_screen.dart';
import 'package:kinetix_student/l10n/l10n.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'fake_api.dart';

Widget host(Widget child, {Locale locale = const Locale('en')}) => MaterialApp(
  theme: KinetixTheme.light(),
  locale: locale,
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: appLocalizationsDelegates,
  home: child,
);

void phone(WidgetTester tester) {
  tester.view.physicalSize = const Size(412, 892);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

Future<void> tapOn(WidgetTester tester, Finder f) async {
  if (f.evaluate().isEmpty) await tester.scrollUntilVisible(f, 200, scrollable: find.byType(Scrollable).first);
  await tester.ensureVisible(f);
  await tester.tap(f);
  await tester.pumpAndSettle();
}

void main() {
  late FakeStudentApi api;
  final opened = <String>[];
  Future<bool> fakeOpen(Uint8List bytes, String name, String mime) async {
    opened.add('$name $mime ${String.fromCharCodes(bytes.take(5))}');
    return true;
  }

  setUp(() {
    api = FakeStudentApi();
    opened.clear();
  });

  group('Course registration', () {
    Future<void> pump(WidgetTester tester) async {
      phone(tester);
      await tester.pumpWidget(host(CourseRegistrationScreen(api: api, now: () => DateTime(2026, 10, 5))));
      await tester.pumpAndSettle();
    }

    testWidgets('shows credits, my registrations and the offerings with their seats', (tester) async {
      await pump(tester);
      expect(find.text('Credits: 4 of 8 (at least 4)'), findsOneWidget);
      expect(find.byKey(const Key('mine-o1')), findsOneWidget);
      expect(find.text('Approved'), findsOneWidget);
      expect(find.text('4 seats left'), findsOneWidget);
      expect(find.text('Full'), findsOneWidget);
      expect(find.byKey(const Key('blocked-o4')), findsOneWidget);
      expect(find.text('Needs Taxation 1 first.'), findsOneWidget);
      // Full and ineligible courses cannot be taken.
      expect(tester.widget<FilledButton>(find.byKey(const Key('register-o3'))).onPressed, isNull);
      expect(tester.widget<FilledButton>(find.byKey(const Key('register-o4'))).onPressed, isNull);
    });

    testWidgets('registers for an elective and drops it after confirming', (tester) async {
      await pump(tester);
      await tapOn(tester, find.byKey(const Key('register-o2')));
      expect(api.calls, contains('registerCourse o2'));
      expect(find.text('You are registered.'), findsOneWidget);
      expect(find.text('Credits: 7 of 8 (at least 4)'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('drop-o2')));
      await tapOn(tester, find.byKey(const Key('confirmDrop')));
      expect(api.calls, contains('dropCourse o2'));
      expect(find.text('Credits: 4 of 8 (at least 4)'), findsOneWidget);
    });

    testWidgets('ranks electives in the order chosen', (tester) async {
      await pump(tester);
      await tapOn(tester, find.byKey(const Key('rankElectives')));
      await tapOn(tester, find.byKey(const Key('rank-o3')));
      await tapOn(tester, find.byKey(const Key('rank-o2')));
      await tapOn(tester, find.byKey(const Key('saveRank')));
      expect(api.calls, contains('preferences o2,o3'));
      expect(find.text('Your preferences are saved.'), findsOneWidget);
      expect(find.text('Preference 1'), findsWidgets);
    });

    testWidgets('a server refusal is shown and nothing changes', (tester) async {
      await pump(tester);
      api.campusLifeError = ApiException(409, 'This course is full.');
      await tapOn(tester, find.byKey(const Key('register-o2')));
      expect(find.text('This course is full.'), findsOneWidget);
    });

    testWidgets('outside the window the buttons are off and the screen says so', (tester) async {
      api.regWindow = RegWindow(opensAt: DateTime(2026, 11, 1), closesAt: DateTime(2026, 11, 10), addDropUntil: DateTime(2026, 11, 12), minCredits: 4, maxCredits: 8);
      await pump(tester);
      expect(find.text('Registration is not open for you right now.'), findsOneWidget);
      expect(tester.widget<FilledButton>(find.byKey(const Key('register-o2'))).onPressed, isNull);
      expect(find.byKey(const Key('rankElectives')), findsNothing);
    });
  });

  group('Outcome passport', () {
    testWidgets('shows verification, skill levels and evidence, and downloads the PDF', (tester) async {
      phone(tester);
      await tester.pumpWidget(host(PassportScreen(api: api, studentId: 's1', openFile: fakeOpen)));
      await tester.pumpAndSettle();
      expect(find.text('Aarav Rao'), findsOneWidget);
      expect(find.text('Verified by the institution'), findsOneWidget);
      expect(find.text('Level 4 of 5'), findsOneWidget);
      expect(find.text('No evidence yet'), findsOneWidget);
      expect(find.text('Participation certificate - Debate club'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('skill-k1')));
      expect(find.text('Finalist'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('downloadPassport')));
      expect(api.calls, contains('passportPdf s1'));
      expect(opened, ['outcome-passport.pdf application/pdf %PDF-']);
    });

    testWidgets('an unverified passport says so', (tester) async {
      final p = api.passportData;
      api.passportData = OutcomePassport(
        studentId: p.studentId,
        fullName: p.fullName,
        rollNo: p.rollNo,
        className: p.className,
        skills: const [],
        certificates: const [],
        clubs: const [],
        events: const [],
        verified: false,
      );
      phone(tester);
      await tester.pumpWidget(host(PassportScreen(api: api, studentId: 's1', openFile: fakeOpen)));
      await tester.pumpAndSettle();
      expect(find.text('Not yet verified by the institution'), findsOneWidget);
      expect(find.text('No skills recorded yet.'), findsOneWidget);
    });
  });

  group('Surveys', () {
    Future<void> pump(WidgetTester tester) async {
      phone(tester);
      await tester.pumpWidget(host(SurveysScreen(api: api)));
      await tester.pumpAndSettle();
    }

    testWidgets('requires the marked questions, then sends the answers', (tester) async {
      await pump(tester);
      await tapOn(tester, find.byKey(const Key('survey-sv1')));
      expect(find.byKey(const Key('surveyAnonymous')), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('submitSurvey')));
      expect(find.byKey(const Key('surveyMissing')), findsOneWidget);
      expect(api.calls.where((c) => c.startsWith('submitSurvey')), isEmpty);
      await tapOn(tester, find.byKey(const Key('opt-q1-Just right')));
      await tapOn(tester, find.byKey(const Key('opt-q2-Labs')));
      await tapOn(tester, find.byKey(const Key('opt-q2-Notes')));
      await tapOn(tester, find.byKey(const Key('rate-q3-4')));
      await tester.enterText(find.byKey(const Key('text-q4')), '  More labs  ');
      await tapOn(tester, find.byKey(const Key('submitSurvey')));
      expect(api.calls, contains('submitSurvey sv1 4'));
      final a = api.lastSurveyAnswers!;
      expect(a[0].choices, ['Just right']);
      expect(a[1].choices, ['Notes', 'Labs']);
      expect(a[2].rating, 4);
      expect(a[3].text, 'More labs');
      expect(find.text('Thank you. Your answers are sent.'), findsOneWidget);
      expect(find.text('No surveys are waiting for you.'), findsOneWidget);
    });

    testWidgets('an empty list says nothing is waiting', (tester) async {
      api.surveyList = const [];
      await pump(tester);
      expect(find.text('No surveys are waiting for you.'), findsOneWidget);
    });
  });

  group('Clubs and events', () {
    Future<void> pump(WidgetTester tester) async {
      phone(tester);
      await tester.pumpWidget(host(CampusLifeScreen(api: api, studentId: 's1')));
      await tester.pumpAndSettle();
    }

    Future<void> tab(WidgetTester tester, String label) async {
      await tester.tap(find.descendant(of: find.byType(TabBar), matching: find.text(label)));
      await tester.pumpAndSettle();
    }

    testWidgets('joins and leaves a club', (tester) async {
      await pump(tester);
      expect(find.text('Member'), findsOneWidget);
      expect(find.text('40 points'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('join-cl2')));
      expect(api.calls, contains('joinClub cl2'));
      expect(find.text('Waiting for approval'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('leave-cl1')));
      expect(api.calls, contains('leaveClub cl1'));
      expect(find.byKey(const Key('join-cl1')), findsOneWidget);
    });

    testWidgets('registers for an event and the pass shows the code; cancelling removes it', (tester) async {
      await pump(tester);
      await tab(tester, 'Events');
      expect(find.text('Cancel registration'), findsOneWidget);
      expect(find.text('Free · 50 seats left'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('register-ev1')));
      expect(api.calls, contains('registerForEvent ev1'));
      expect(find.text('You are registered'), findsWidgets);
      await tab(tester, 'My passes');
      expect(find.byKey(const Key('token-r-ev1')), findsOneWidget);
      expect(find.text('tok-ev1-0001'), findsOneWidget);
      expect(find.text('Show this code at the door'), findsWidgets);
      await tab(tester, 'Events');
      await tapOn(tester, find.byKey(const Key('cancel-ev1')));
      expect(api.calls, contains('cancelEvent ev1'));
      await tab(tester, 'My passes');
      expect(find.byKey(const Key('token-r-ev1')), findsNothing);
    });

    testWidgets('feedback is offered after check-in and sent once', (tester) async {
      await pump(tester);
      await tab(tester, 'My passes');
      expect(find.text('Checked in'), findsOneWidget);
      await tapOn(tester, find.byKey(const Key('feedback-r0')));
      expect(tester.widget<FilledButton>(find.byKey(const Key('sendFeedback'))).onPressed, isNull);
      await tapOn(tester, find.byKey(const Key('star-5')));
      await tester.enterText(find.byKey(const Key('feedbackComment')), 'Great');
      await tapOn(tester, find.byKey(const Key('sendFeedback')));
      expect(api.calls, contains('eventFeedback ev0 5 Great'));
      expect(find.text('Thank you for your feedback.'), findsOneWidget);
      expect(find.byKey(const Key('feedback-r0')), findsNothing);
      expect(find.text('Feedback sent'), findsOneWidget);
    });

    testWidgets('renders in Hindi and Kannada without overflow at large text', (tester) async {
      for (final lang in ['hi', 'kn']) {
        tester.platformDispatcher.textScaleFactorTestValue = 1.3;
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        phone(tester);
        for (final screen in <Widget>[
          CourseRegistrationScreen(api: api, now: () => DateTime(2026, 10, 5)),
          PassportScreen(api: api, studentId: 's1', openFile: fakeOpen),
          SurveysScreen(api: api),
          CampusLifeScreen(api: api, studentId: 's1'),
        ]) {
          await tester.pumpWidget(host(screen, locale: Locale(lang)));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull, reason: lang);
        }
      }
    });
  });
}
