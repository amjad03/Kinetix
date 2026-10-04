// Hindi and Kannada: every tab, marks entry and chat in each language, the Language setting,
// and the device locale before sign-in.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_api.dart';
import 'helpers.dart';

void main() {
  for (final lang in ['hi', 'kn']) {
    group('in ${lang == 'hi' ? 'Hindi' : 'Kannada'}', () {
      final s = strings(lang);
      late FakeTeacherApi api;

      setUp(() {
        api = FakeTeacherApi();
        seed(api, language: lang);
      });

      Future<void> start(WidgetTester tester) async {
        phone(tester);
        await pumpApp(tester, api, prefs: {'token': 'tok'});
      }

      testWidgets('Today follows the account language', (tester) async {
        await start(tester);
        expect(find.text(s.todaysClasses), findsOneWidget);
        expect(find.text(s.periodCount(2)), findsOneWidget);
        expect(find.text(s.now), findsOneWidget);
        expect(find.text(s.takeAttendance), findsNWidgets(2));
        expect(find.text(s.teachOnBoard), findsOneWidget);
        expect(find.text(s.connectToBoard), findsOneWidget);
        expect(find.text(s.navToday), findsOneWidget);
        // Dates are in the language too, with Western digits; nothing left in English.
        final greeting = tester.widget<Text>(find.byKey(const Key('greeting'))).data!;
        expect(greeting, contains('Anita'));
        expect(find.textContaining('October'), findsNothing);
        expect(find.textContaining('Monday'), findsNothing);
        expect(find.textContaining('5 '), findsWidgets);
        expect(find.textContaining('Good '), findsNothing);
      });

      testWidgets('Homework tab', (tester) async {
        await start(tester);
        await tapAndSettle(tester, find.byKey(const Key('navHomework')));
        expect(find.descendant(of: find.byKey(const Key('homework-h1')), matching: find.text(s.dueTomorrow)), findsOneWidget);
        expect(
          find.descendant(
            of: find.byKey(const Key('homework-h2')),
            matching: find.textContaining(lang == 'hi' ? 'को जमा होना था' : 'ಸಲ್ಲಿಸಬೇಕಿತ್ತು'),
          ),
          findsOneWidget,
        );
        expect(find.text(s.assignHomework), findsOneWidget);

        await tapAndSettle(tester, find.byKey(const Key('assignHomeworkFab')));
        expect(find.text(s.dueDate), findsOneWidget);
        expect(find.text(s.instructionsOptional), findsOneWidget);
        await tapAndSettle(tester, find.byKey(const Key('assignHomework')));
        expect(find.text(s.homeworkTitleRequired), findsOneWidget);
      });

      testWidgets('Marks tab', (tester) async {
        await start(tester);
        await tapAndSettle(tester, find.byKey(const Key('navMarks')));
        final published = find.byKey(const Key('assessment-a1'));
        expect(find.descendant(of: published, matching: find.text(s.published)), findsOneWidget);
        expect(find.descendant(of: published, matching: find.text(s.enteredOf(3, 3))), findsOneWidget);
        expect(find.descendant(of: published, matching: find.textContaining(s.classAverage, findRichText: true)), findsOneWidget);
        final draft = find.byKey(const Key('assessment-a2'));
        expect(find.descendant(of: draft, matching: find.text(s.draft)), findsOneWidget);
        expect(find.descendant(of: draft, matching: find.text(s.noMarksYet('10'))), findsOneWidget);
        expect(find.textContaining(s.kindTest), findsWidgets);
      });

      testWidgets('Marks entry: hints, validation, plurals and the publish dialog', (tester) async {
        await start(tester);
        await tapAndSettle(tester, find.byKey(const Key('navMarks')));
        await tapAndSettle(tester, find.byKey(const Key('assessment-a2')));
        expect(find.text(s.outOfN('10')), findsOneWidget);
        expect(find.text(s.typeMarksHint('10')), findsOneWidget);
        expect(find.text(s.typeMarksThenSave), findsOneWidget);
        expect(find.text(s.statusAbsent), findsNWidgets(3));

        await tester.enterText(find.byKey(const ValueKey('marks-s1')), '12');
        await tester.enterText(find.byKey(const ValueKey('marks-s2')), '15');
        await tester.pump();
        expect(find.text(s.maxN('10')), findsNWidgets(2));
        expect(find.text(s.marksOverMax(2, '10')), findsOneWidget);
        await tapAndSettle(tester, find.byKey(const Key('saveMarks')));
        expect(find.text(s.marksNeedFixing(2)), findsOneWidget);

        await tester.enterText(find.byKey(const ValueKey('marks-s1')), '8');
        await tester.enterText(find.byKey(const ValueKey('marks-s2')), '9.5');
        await tester.tap(find.byKey(const ValueKey('absent-s3')));
        await tester.pump();
        expect(tester.widget<Text>(find.byKey(const Key('marksSummary'))).data, '${s.markedOf(2, 3)} · ${s.countAbsent(1)}');
        await tapAndSettle(tester, find.byKey(const Key('saveMarks')));
        expect(find.textContaining(s.marksSaved), findsOneWidget);
        expect(find.text(s.statAverage), findsOneWidget);
        expect(find.text(s.savedOnlyYou), findsOneWidget);

        await tapAndSettle(tester, find.byKey(const Key('publishMarks')));
        expect(find.text(s.publishTitle), findsOneWidget);
        expect(find.textContaining(s.publishCanCorrect), findsOneWidget);
        await tapAndSettle(tester, find.byKey(const Key('confirmPublish')));
        expect(find.text(s.publishedNotified('Ledger assignment')), findsOneWidget);
      });

      testWidgets('Messages tab and chat', (tester) async {
        await start(tester);
        await tapAndSettle(tester, find.byKey(const Key('navMessages')));
        final c1 = find.byKey(const Key('conversation-c1'));
        expect(find.descendant(of: c1, matching: find.text(s.aboutParent('Aarav Patel', 'BCom Sem 3 A'))), findsOneWidget);
        // Message text is the family's, not translated.
        expect(find.descendant(of: c1, matching: find.text('Thank you, he will finish it tonight.')), findsOneWidget);

        await tapAndSettle(tester, c1);
        expect(find.text(s.chatTop('Aarav Patel', 'Rajesh Patel')), findsOneWidget);
        final hint = tester.widget<TextField>(find.byKey(const Key('messageField'))).decoration!.hintText;
        expect(hint, s.messageHint('Rajesh Patel'));
        api.sendFails = true;
        await tester.enterText(find.byKey(const Key('messageField')), 'धन्यवाद / ಧನ್ಯವಾದ');
        await tester.pump();
        await tapAndSettle(tester, find.byKey(const Key('sendMessage')));
        expect(find.text(s.notSentRetry), findsOneWidget);

        await pop(tester);
        await tapAndSettle(tester, find.byKey(const Key('newMessageFab')));
        expect(find.text(s.newMessage), findsWidgets);
        await tester.enterText(find.byKey(const Key('studentSearch')), 'bhav');
        await tester.pump();
        expect(find.text('U03BC003 · ${s.noGuardianOnRecord}'), findsOneWidget);
        await tester.enterText(find.byKey(const Key('studentSearch')), 'zzz');
        await tester.pump();
        expect(find.text(s.noStudentMatches('zzz')), findsOneWidget);
      });

      testWidgets('Recordings tab', (tester) async {
        await start(tester);
        await tapAndSettle(tester, find.byKey(const Key('navRecordings')));
        Finder inCard(String id, Finder f) => find.descendant(of: find.byKey(Key('recording-$id')), matching: f);
        expect(inCard('r1', find.text(s.notShared)), findsOneWidget);
        expect(inCard('r1', find.text(s.preparingTranscript)), findsOneWidget);
        expect(inCard('r1', find.textContaining(s.durationMinutes(24))), findsOneWidget);
        expect(inCard('r2', find.text(s.sharedWithClass)), findsOneWidget);

        await tapAndSettle(tester, inCard('r1', find.byKey(const Key('share-r1'))));
        expect(find.text(s.shareTitle), findsOneWidget);
        await tapAndSettle(tester, find.byKey(const Key('confirmShare')));
        expect(find.text(s.sharedWith('BCom Sem 3 A')), findsOneWidget);
      });

      testWidgets('attendance, connect to board and Profile', (tester) async {
        await start(tester);
        await tapAndSettle(tester, find.byKey(const Key('takeAttendance-slot1')));
        expect(find.text(s.attendanceHelp), findsOneWidget);
        await tester.tap(find.text('Aarav Patel'));
        await tester.pump();
        expect(tester.widget<Text>(find.byKey(const Key('attendanceSummary'))).data, '${s.countPresent(2)} · ${s.countAbsent(1)}');
        await tapAndSettle(tester, find.byKey(const Key('submitAttendance')));
        expect(find.text(s.attendanceSaved('${s.countPresent(2)} · ${s.countAbsent(1)}')), findsOneWidget);
        expect(find.text(s.attendanceTaken), findsOneWidget);
        // Let the snackbar time out so it does not cover the next screen's buttons.
        await tester.pump(const Duration(seconds: 5));
        await tester.pumpAndSettle();

        await tapAndSettle(tester, find.byKey(const Key('connectBoard')));
        expect(find.text(s.enterCodeTitle), findsOneWidget);
        await tester.enterText(find.byKey(const Key('codeField')), '111111');
        await tester.pumpAndSettle();
        // A known server message is translated.
        expect(find.text(s.errorCodeExpired), findsOneWidget);
        await tester.enterText(find.byKey(const Key('codeField')), '482913');
        await tester.pumpAndSettle();
        expect(find.text(s.youreConnected), findsOneWidget);
        expect(find.text(s.boardShowingClass('Room 204 Board')), findsOneWidget);
        await tapAndSettle(tester, find.byKey(const Key('connectDone')));
        expect(find.text(s.connected), findsOneWidget);

        await tapAndSettle(tester, find.byKey(const Key('profileButton')));
        expect(find.text(s.roleTeacher), findsOneWidget);
        expect(find.text(s.roleHod), findsOneWidget);
        expect(find.text(s.language), findsOneWidget);
        expect(find.text(lang == 'hi' ? 'हिन्दी' : 'ಕನ್ನಡ'), findsOneWidget);
        // No camera on this platform (as on the desktop build), so Connect opens on code entry.
      }, variant: TargetPlatformVariant.only(TargetPlatform.linux));
    });
  }

  group('Language setting', () {
    testWidgets('switches the app at once, saves it to the account and keeps it after a restart', (tester) async {
      phone(tester);
      final api = FakeTeacherApi();
      seed(api);
      await pumpApp(tester, api, prefs: {'token': 'tok'});
      expect(find.text(strings('en').todaysClasses), findsOneWidget);

      await tapAndSettle(tester, find.byKey(const Key('profileButton')));
      await tapAndSettle(tester, find.byKey(const Key('languageSetting')));
      expect(find.text('English'), findsWidgets);
      expect(find.text('हिन्दी'), findsOneWidget);
      expect(find.text('ಕನ್ನಡ'), findsOneWidget);
      await tapAndSettle(tester, find.byKey(const Key('language-kn')));

      expect(api.calls, contains('language kn'));
      expect(find.text(strings('kn').profile), findsWidgets);
      expect(find.text('ಕನ್ನಡ'), findsOneWidget);
      await pop(tester);
      expect(find.text(strings('kn').todaysClasses), findsOneWidget);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('language'), 'kn');
      expect(prefs.getBool('language_pending'), isNull);

      // A fresh start reads the stored choice.
      await tester.pumpWidget(const SizedBox());
      await pumpApp(tester, api);
      expect(find.text(strings('kn').todaysClasses), findsOneWidget);
    });

    testWidgets('overrides the account language; offline, it says so and retries on the next start', (tester) async {
      phone(tester);
      final api = FakeTeacherApi();
      seed(api, language: 'hi');
      api.languageSaveFails = true;
      await pumpApp(tester, api, prefs: {'token': 'tok'});
      expect(find.text(strings('hi').todaysClasses), findsOneWidget);

      await tapAndSettle(tester, find.byKey(const Key('profileButton')));
      await tapAndSettle(tester, find.byKey(const Key('languageSetting')));
      await tapAndSettle(tester, find.byKey(const Key('language-en')));
      expect(find.text(strings('en').languageSaveFailed), findsOneWidget);
      expect(api.profile.preferredLanguage, 'hi');
      await pop(tester);
      expect(find.text(strings('en').todaysClasses), findsOneWidget);

      // Next start: still English (the account still says Hindi), and the save is retried quietly.
      api.languageSaveFails = false;
      api.calls.clear();
      await tester.pumpWidget(const SizedBox());
      await pumpApp(tester, api);
      expect(find.text(strings('en').todaysClasses), findsOneWidget);
      expect(api.calls, contains('language en'));
      expect(api.profile.preferredLanguage, 'en');
      expect((await SharedPreferences.getInstance()).getBool('language_pending'), isNull);
    });

    testWidgets('a choice made by one teacher does not apply to another on the same phone', (tester) async {
      phone(tester);
      final api = FakeTeacherApi();
      seed(api, language: 'en');
      await pumpApp(tester, api, prefs: {'token': 'tok', 'language': 'kn', 'language_user': 'someone-else'});
      expect(find.text(strings('en').todaysClasses), findsOneWidget);
      expect(api.calls.where((c) => c.startsWith('language')), isEmpty);
    });

    testWidgets('before sign-in the app follows the device when it is Hindi or Kannada', (tester) async {
      phone(tester);
      addTearDown(tester.platformDispatcher.clearLocalesTestValue);
      tester.platformDispatcher.localesTestValue = const [Locale('kn', 'IN')];
      final api = FakeTeacherApi();
      seed(api, language: 'hi');
      final state = await pumpApp(tester, api, prefs: {});
      expect(find.text(strings('kn').signInTitle), findsOneWidget);
      await tapAndSettle(tester, find.byKey(const Key('signIn')));
      expect(find.text(strings('kn').enterInstitutionCode), findsOneWidget);

      // Signing in switches to the account's language.
      await tester.enterText(find.byKey(const Key('tenant')), 'demo-college');
      await tester.enterText(find.byKey(const Key('login')), 'anita@demo.kinetix.in');
      await tester.enterText(find.byKey(const Key('password')), 'wrong');
      await tapAndSettle(tester, find.byKey(const Key('signIn')));
      expect(find.text(strings('kn').errorWrongLogin), findsOneWidget);
      await tester.enterText(find.byKey(const Key('password')), 'kinetix123');
      await tapAndSettle(tester, find.byKey(const Key('signIn')));
      expect(find.text(strings('hi').todaysClasses), findsOneWidget);

      await state.signOut();
      await tester.pumpAndSettle();
      expect(find.text(strings('kn').signInTitle), findsOneWidget);

      // Any other device language: English.
      tester.platformDispatcher.localesTestValue = const [Locale('fr', 'FR')];
      await tester.pumpAndSettle();
      expect(find.text(strings('en').signInTitle), findsNWidgets(2)); // heading and button
    });
  });
}
