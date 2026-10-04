import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_student/core/push.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import 'package:kinetix_student/core/live.dart';
import 'package:kinetix_student/core/models.dart';
import 'package:kinetix_student/features/learn/learn_tab.dart';
import 'package:kinetix_student/features/profile/profile_tab.dart';
import 'package:kinetix_student/features/today/today_tab.dart';
import 'package:kinetix_student/core/attachments.dart';
import 'package:kinetix_student/widgets/common.dart';

import 'fake_api.dart';
import 'fake_push.dart';
import 'fake_live.dart';
import 'helpers.dart';

/// The app in English, Hindi and Kannada: every main screen (Today, live class, Learn, updates,
/// profile, fees) at a small and a large phone with normal and larger text (a RenderFlex overflow
/// fails the test), the Language setting, and the language before sign-in.
void main() {
  const device = '11111111-2222-3333-4444-555555555555';

  /// Taps a bottom-bar destination by its icon (labels change with the language).
  Future<void> openTabByIcon(WidgetTester tester, IconData icon) async {
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.byIcon(icon)));
    await tester.pumpAndSettle();
  }

  /// [WidgetTester.pageBack] finds the back button by its English tooltip.
  Future<void> back(WidgetTester tester) async {
    await tester.tap(find.byType(BackButton).last);
    await tester.pumpAndSettle();
  }

  /// Like pumpAndSettle, for screens with a spinner (which never settles).
  Future<void> settle(WidgetTester tester) async {
    for (var i = 0; i < 8; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
  }

  Finder today() => find.descendant(of: find.byType(TodayTab), matching: find.byType(Scrollable)).first;

  Future<void> show(WidgetTester tester, Finder f, {Finder? scrollable}) async {
    // From the top: scrollUntilVisible only scrolls one way.
    if (f.evaluate().isEmpty) {
      await tester.drag(scrollable ?? today(), const Offset(0, 20000));
      await tester.pumpAndSettle();
    }
    await tester.scrollUntilVisible(f, 300, scrollable: scrollable ?? today());
    await tester.ensureVisible(f);
    await tester.pumpAndSettle();
  }

  Future<void> tapShown(WidgetTester tester, Finder f, {Finder? scrollable}) async {
    await show(tester, f, scrollable: scrollable);
    await tester.tap(f);
    await tester.pumpAndSettle();
  }

  Future<void> openCardLink(WidgetTester tester, String card) =>
      tapShown(tester, find.descendant(of: find.byKey(Key(card)), matching: find.byType(CardLink)));

  Future<void> scrollDown(WidgetTester tester) async {
    // The page's own list (a SelectableText inside it has a Scrollable too).
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -3000));
    await tester.pumpAndSettle();
  }

  Future<void> visitEverything(WidgetTester tester, FakeLiveServer server) async {
    // The live class: joining, the board, then the teacher stops it.
    await tester.tap(find.byKey(const Key('watchLive')));
    await settle(tester);
    server.last.send(
      LiveFrame(device, [
        [0, 'L', <Object>[<Object>[], <Object>[]], 1],
      ]),
    );
    await settle(tester);
    // The teacher's mic is on: the mute button and "mic is on" fit too, muted or not.
    expect(find.byKey(const Key('liveMicOn')), findsOneWidget);
    await tester.tap(find.byKey(const Key('liveMute')));
    await settle(tester);
    server.last.send(const LiveAudioState(device, false));
    await settle(tester);
    expect(find.byKey(const Key('liveMicOff')), findsOneWidget);
    server.last.send(const LiveEnded(device, 'live_off'));
    await settle(tester);
    expect(find.byKey(const Key('liveEnded')), findsOneWidget);
    await tester.tap(find.byKey(const Key('leaveLive')));
    await tester.pumpAndSettle();

    for (var i = 0; i < 12; i++) {
      await tester.drag(today(), const Offset(0, -400));
      await tester.pumpAndSettle();
    }
    await tester.drag(today(), const Offset(0, 20000));
    await tester.pumpAndSettle();

    await openCardLink(tester, 'attendanceCard');
    await scrollDown(tester);
    await back(tester);

    // Homework: returned with a remark, then the hand-in screen with a photo and a PDF.
    await tapShown(tester, find.byKey(const Key('homework-h1')));
    await scrollDown(tester);
    await tester.ensureVisible(find.byKey(const Key('handIn')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('handIn')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('addCamera')));
    await tester.tap(find.byKey(const Key('addCamera')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('addPdf')));
    await tester.tap(find.byKey(const Key('addPdf')));
    await tester.pumpAndSettle();
    await scrollDown(tester);
    await back(tester);
    await back(tester);

    // This week's planned topics.
    await show(tester, find.byKey(const Key('comingUpCard')));

    // The holiday banner and the calendar.
    await show(tester, find.byKey(const Key('holidayBanner')));
    await openCardLink(tester, 'calendarCard');
    await scrollDown(tester);
    await back(tester);

    await tapShown(tester, find.byKey(const Key('assessment-a1')));
    await scrollDown(tester);
    await back(tester);
    await openCardLink(tester, 'resultsCard');
    await back(tester);

    await openCardLink(tester, 'libraryCard');
    await scrollDown(tester);
    await back(tester);

    await openCardLink(tester, 'messagesCard');
    await back(tester);

    await tapShown(tester, find.byKey(const Key('recording-r1')));
    await back(tester);

    await tapShown(tester, find.byKey(const Key('board-wb1')));
    await back(tester);

    // Learn: ask (a preview answer), then the syllabus and a topic.
    await openTabByIcon(tester, Icons.auto_awesome_outlined);
    await tester.enterText(find.byKey(const Key('question')), 'What is underwriting commission and how is it calculated?');
    await tester.pump();
    await tester.ensureVisible(find.byKey(const Key('askButton')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('askButton')));
    await tester.pumpAndSettle();
    await tester.drag(find.byKey(const Key('askList')), const Offset(0, -3000));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('tabSyllabus')));
    await tester.pumpAndSettle();
    final syllabus = find.descendant(of: find.byType(LearnTab), matching: find.byType(Scrollable)).last;
    await tapShown(tester, find.byKey(const Key('subjectTile-sub1')), scrollable: syllabus);
    // The plan's status, this week's and next week's topics.
    await show(tester, find.byKey(const Key('planned-t2')), scrollable: find.byType(Scrollable).first);
    expect(find.byKey(const Key('planStatus')), findsWidgets);
    await tapShown(tester, find.byKey(const Key('topic-t1')), scrollable: find.byType(Scrollable).first);
    await scrollDown(tester);
    await back(tester);
    await back(tester);

    await openTabByIcon(tester, Icons.notifications_outlined);
    await scrollDown(tester);

    // Profile, the language settings, fees and a receipt.
    await openTabByIcon(tester, Icons.person_outline);
    final profile = find.descendant(of: find.byType(ProfileTab), matching: find.byType(Scrollable)).first;
    await tapShown(tester, find.byKey(const Key('languageSetting')), scrollable: profile);
    Navigator.of(tester.element(find.byType(SimpleDialog))).pop();
    await tester.pumpAndSettle();
    await tapShown(tester, find.byKey(const Key('aiLanguage')), scrollable: profile);
    Navigator.of(tester.element(find.byType(SimpleDialog))).pop();
    await tester.pumpAndSettle();
    // Privacy: each decision with who made it, and the full notice.
    await tapShown(tester, find.byKey(const Key('openPrivacy')), scrollable: profile);
    await scrollDown(tester);
    await tapShown(tester, find.byKey(const Key('readNotice')), scrollable: find.byType(Scrollable).first);
    await scrollDown(tester);
    await back(tester);
    await back(tester);
    await tapShown(tester, find.byKey(const Key('openFees')), scrollable: profile);
    await tapShown(tester, find.byKey(const Key('payment-p1')), scrollable: find.byType(Scrollable).first);
    await scrollDown(tester);
    await back(tester);
    await back(tester);
    await tester.drag(profile, const Offset(0, -3000));
    await tester.pumpAndSettle();
  }

  const sizes = {'360x640': Size(360, 640), '430x932': Size(430, 932)};
  // Words from the bottom bar and the live banner in each language.
  const words = {
    'en': ['Today', 'Learn', 'LIVE'],
    'hi': ['आज', 'सीखें', 'लाइव'],
    'kn': ['ಇಂದು', 'ಕಲಿಯಿರಿ', 'ಲೈವ್'],
  };

  for (final lang in ['en', 'hi', 'kn']) {
    for (final MapEntry(key: name, value: size) in sizes.entries) {
      for (final scale in [1.0, 1.3]) {
        testWidgets('$lang at $name, text ×$scale: every main screen lays out', (tester) async {
          AttachmentPicker.instance = FakeAttachmentPicker();
          addTearDown(() => AttachmentPicker.instance = const DeviceAttachmentPicker());
          final server = FakeLiveServer()
            ..ack = const LiveWatchAck(
              ok: true,
              teacher: 'Anita Sharma',
              subject: 'Corporate Accounting',
              section: 'BCom Sem 3 A',
              audioAllowed: true,
              audioOn: true,
            );
          await pumpApp(
            tester,
            size: size,
            textScale: scale,
            live: server,
            prefs: {'language': lang},
            setup: (api) {
              api.liveClass = FakeStudentApi.corporateLive();
              api.calendarEvents.insert(0, FakeStudentApi.eventJson('e0', 'holiday', 'Gandhi Jayanti (observed)', '2026-10-05', '2026-10-06'));
              (api.consentJson['purposes'] as Map)['photos'] = null;
              api.consentJson['grievanceOfficer'] = {'name': 'Meera Rao', 'email': 'grievance.officer@demo-college.kinetix.in', 'phone': '+919800000009'};
              api.submissions['h1/s1'] = {
                'status': 'returned',
                'text': 'Journal entries for questions 1 to 5.',
                'files': [
                  {'index': 0, 'name': 'IMG_20261004_page_one_of_the_homework.jpg', 'mime': 'image/jpeg', 'bytes': 1245000},
                ],
                'submittedAt': '2026-10-06T05:00:00Z',
                'late': true,
                'remark': 'Show the working for question 3, and write the narration under each entry.',
                'checkedBy': 'Anita Sharma',
                'checkedAt': '2026-10-07T05:00:00Z',
              };
              api.answer = Explanation(
                answer: 'Preview answer about underwriting commission.',
                keyPoints: ['Start from what the class already knows', 'Define the key terms'],
                followUps: ['Where is underwriting commission used in real life?'],
                preview: true,
                sources: [const TopicRef(id: 't1', title: 'Underwriting and underwriting commission')],
              );
            },
          );
          // Asked for the undecided privacy choice first: the summary, the full notice, then "Not now".
          await tester.drag(find.byType(Scrollable).first, const Offset(0, -3000));
          await tester.pumpAndSettle();
          await tester.tap(find.byKey(const Key('readNotice')));
          await tester.pumpAndSettle();
          await scrollDown(tester);
          await back(tester);
          await tester.tap(find.byKey(const Key('consentLater')));
          await tester.pumpAndSettle();
          for (final w in words[lang]!) {
            expect(find.text(w), findsWidgets, reason: w);
          }
          await visitEverything(tester, server);
          expect(tester.takeException(), isNull);
        });
      }
    }

    testWidgets('$lang: sign-in fits a 360-px phone at 2× text', (tester) async {
      await pumpApp(tester, signedIn: false, size: const Size(360, 640), textScale: 2, prefs: {'language': lang});
      await tester.ensureVisible(find.byKey(const Key('usePassword')));
      await tester.pumpAndSettle();
      await usePassword(tester);
      await tester.ensureVisible(find.byKey(const Key('signIn')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('signIn')));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });

    // Phone sign-in on small phones with larger text: every step, its errors and the
    // notifications question after signing in.
    for (final MapEntry(key: name, value: size) in const {'320x568': Size(320, 568), '360x640': Size(360, 640)}.entries) {
      testWidgets('$lang at $name, text ×1.3: phone sign-in and the notifications question lay out', (tester) async {
        final (api, state) = await pumpApp(
          tester,
          signedIn: false,
          size: size,
          textScale: 1.3,
          prefs: {'language': lang},
          messaging: FakePushMessaging(status: PushPermission.notDetermined),
        );
        Future<void> tapKey(String key) async {
          await tester.ensureVisible(find.byKey(Key(key)));
          await tester.pumpAndSettle();
          await tester.tap(find.byKey(Key(key)));
          await tester.pumpAndSettle();
        }

        // The number step with both fields' messages, then "too many codes".
        await tapKey('sendCode');
        await tester.enterText(find.byKey(const Key('tenant')), 'demo-college');
        await tester.enterText(find.byKey(const Key('phone')), '9800000001');
        api.otpRateLimited = true;
        await tapKey('sendCode');
        expect(find.byKey(const Key('otpCode')), findsNothing);
        api.otpRateLimited = false;
        await tapKey('sendCode');

        // The code step: the countdown, a wrong code, then resend once allowed.
        expect(find.byKey(const Key('otpCode')), findsOneWidget);
        await tester.enterText(find.byKey(const Key('otpCode')), '000000');
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.byKey(const Key('changeNumber')));
        await tester.pumpAndSettle();
        await tester.pump(const Duration(seconds: 30));
        await tapKey('resendCode');
        expect(tester.takeException(), isNull);

        await tester.enterText(find.byKey(const Key('otpCode')), '123456');
        await tester.pumpAndSettle();
        expect(state.signedIn, isTrue);
        expect(find.byKey(const Key('notificationsPrompt')), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }

  group('Hindi and Kannada content', () {
    testWidgets('Hindi: the live banner, dates and plurals; digits stay Western', (tester) async {
      await pumpApp(tester, prefs: {'language': 'hi'}, setup: (api) => api.liveClass = FakeStudentApi.corporateLive());
      expect(find.text('अभी लाइव: Corporate Accounting'), findsOneWidget);
      expect(find.text('Anita Sharma पढ़ा रहे हैं। बोर्ड देखें।'), findsOneWidget);
      expect(find.text('लाइव'), findsOneWidget);
      await show(tester, find.byKey(const Key('homework-h1')));
      expect(find.text('कल जमा करना है'), findsOneWidget);
      expect(find.textContaining(RegExp('[०-९]')), findsNothing);
    });

    testWidgets('Kannada: the overdue book shows the fine so far', (tester) async {
      await pumpApp(tester, prefs: {'language': 'kn'});
      await show(tester, find.byKey(const Key('libraryCard')));
      final card = find.byKey(const Key('libraryCard'));
      expect(find.descendant(of: card, matching: find.text('3 ದಿನ ತಡವಾಗಿದೆ')), findsOneWidget);
      expect(find.descendant(of: card, matching: find.text('ಇಲ್ಲಿಯವರೆಗೆ ₹6 ದಂಡ')), findsOneWidget);
      expect(find.textContaining(RegExp('[೦-೯]')), findsNothing);
    });

    testWidgets('Kannada: AI errors and labels are translated, the answer itself is content', (tester) async {
      await pumpApp(
        tester,
        prefs: {'language': 'kn'},
        setup: (api) => api.answer = Explanation(
          answer: 'Preview answer about goodwill.',
          keyPoints: ['Goodwill is an intangible asset'],
          followUps: const [],
          preview: true,
          sources: const [],
        ),
      );
      await openTabByIcon(tester, Icons.auto_awesome_outlined);
      expect(find.text('ಸಂದೇಹ ಕೇಳಿ'), findsWidgets);
      expect(find.text('ಪಠ್ಯಕ್ರಮ'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('question')), 'What is goodwill?');
      await tester.pump();
      await tester.ensureVisible(find.byKey(const Key('askButton')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('askButton')));
      await tester.pumpAndSettle();
      expect(find.text('Preview answer about goodwill.'), findsOneWidget);
      expect(find.text('ಮಾದರಿ ಉತ್ತರ'), findsOneWidget);
      expect(find.text('ಮುಖ್ಯ ಅಂಶಗಳು'), findsOneWidget);
    });
  });

  group('language setting', () {
    Future<void> pickLanguage(WidgetTester tester, String code) async {
      await openTabByIcon(tester, Icons.person_outline);
      final profile = find.descendant(of: find.byType(ProfileTab), matching: find.byType(Scrollable)).first;
      await tapShown(tester, find.byKey(const Key('languageSetting')), scrollable: profile);
      await tester.tap(find.byKey(Key('language-$code')));
      await tester.pumpAndSettle();
    }

    testWidgets('defaults to the account language; AI answers default to it but stay separate', (tester) async {
      final (_, state) = await pumpApp(
        tester,
        setup: (api) => api.profile = Me(id: 'u1', fullName: 'Aarav Patel', roles: ['student'], preferredLanguage: 'kn', institution: 'Demo College'),
      );
      expect(find.text('ಇಂದು'), findsWidgets);
      expect(state.aiLanguage, AiLanguage.kn);

      // Choosing an AI answer language does not change the app's language.
      await state.setAiLanguage(AiLanguage.en);
      await tester.pumpAndSettle();
      expect(find.text('ಇಂದು'), findsWidgets);
      expect(state.aiLanguage, AiLanguage.en);
    });

    testWidgets('picking हिन्दी translates the app, remembers it and tells the server', (tester) async {
      final (api, state) = await pumpApp(tester);
      expect(state.aiLanguage, AiLanguage.en);
      await pickLanguage(tester, 'hi');
      expect(find.text('आज'), findsWidgets);
      expect(find.text('सीखें'), findsOneWidget);
      expect(state.prefs.getString('language'), 'hi');
      expect(api.calls, contains('language hi'));
      expect(state.prefs.getBool('language_unsynced'), isNull);
      // AI answers follow the app's language until the student picks one for them.
      expect(state.aiLanguage, AiLanguage.hi);
    });

    testWidgets('a student who picked an AI answer language keeps it when the app language changes', (tester) async {
      final (_, state) = await pumpApp(tester, prefs: {'ai_language': 'kn'});
      await pickLanguage(tester, 'hi');
      expect(state.aiLanguage, AiLanguage.kn);
    });

    testWidgets('a save that fails offline is retried quietly on the next start', (tester) async {
      final (api, state) = await pumpApp(tester, setup: (api) => api.failLanguage = true);
      await pickLanguage(tester, 'kn');
      expect(find.text('ಇಂದು'), findsWidgets);
      expect(api.calls, contains('language kn'));
      expect(state.prefs.getBool('language_unsynced'), isTrue);
      expect(find.byType(ErrorBanner), findsNothing);

      await tester.pumpWidget(const SizedBox());
      final (api2, state2) = await pumpApp(tester, prefs: {'language': 'kn', 'language_unsynced': true});
      expect(api2.calls, contains('language kn'));
      expect(state2.prefs.getBool('language_unsynced'), isNull);
    });

    testWidgets('before sign-in the app follows the device when it is Hindi or Kannada', (tester) async {
      tester.platformDispatcher.localesTestValue = const [Locale('hi', 'IN')];
      addTearDown(tester.platformDispatcher.clearLocalesTestValue);
      await pumpApp(tester, signedIn: false);
      expect(find.text('साइन इन'), findsWidgets);
      expect(find.text('ईमेल या फ़ोन'), findsOneWidget);

      tester.platformDispatcher.localesTestValue = const [Locale('en', 'US')];
      await tester.pumpWidget(const SizedBox());
      await pumpApp(tester, signedIn: false);
      expect(find.text('Sign in'), findsWidgets);
    });

    testWidgets('the lesson player follows the app language', (tester) async {
      await pumpApp(tester, prefs: {'language': 'kn'});
      await tapShown(tester, find.byKey(const Key('recording-r1')));
      expect(find.byType(LessonPlayerScreen), findsOneWidget);
      expect(tester.widget<IconButton>(find.byKey(const Key('lessonPlay'))).tooltip, 'ಪ್ಲೇ ಮಾಡಿ');
    });
  });
}
